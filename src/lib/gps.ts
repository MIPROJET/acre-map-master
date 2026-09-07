// AcreMap — High-precision GPS engine
// Goal: produce reproducible measurements regardless of device tier.
// Strategy:
//  1. enableHighAccuracy + 1Hz watch
//  2. Reject readings with accuracy worse than threshold
//  3. Apply 1D Kalman filter on lat/lng (independent, weighted by reported accuracy)
//  4. For "marked" points: collect N samples (weighted average by 1/accuracy²) — STATIC averaging
//  5. Track full raw trace for audit (immutable history)
//  6. Detect device GPS tier heuristically from observed best accuracy

import type { GpsPoint, MeasurementPoint } from "./types";

export interface GpsConfig {
  maxAcceptableAccuracy: number; // meters; readings worse are dropped from "valid" stream
  staticSamples: number;         // number of samples to average when manually marking a point
  staticTimeoutMs: number;       // max wait time for static averaging
  autoMarkEveryMeters: number;   // 100m per spec
  kalmanProcessNoise: number;    // m/s typical
}

export const DEFAULT_GPS_CONFIG: GpsConfig = {
  maxAcceptableAccuracy: 15,
  staticSamples: 30,
  staticTimeoutMs: 30_000,
  autoMarkEveryMeters: 100,
  kalmanProcessNoise: 0.6,
};

// ---- Kalman 1D for lat & lng (independent) ----
// State: position (deg). Variance: in m² (converted via local meter scale)
export class Kalman1D {
  private x: number | null = null;
  private variance = -1; // in deg²
  constructor(private processNoise: number) {}
  reset() { this.x = null; this.variance = -1; }
  /** Returns filtered position (deg). Use varianceM2() for filtered accuracy in meters. */
  update(measurement: number, accuracyM: number, dtSec: number, mPerDeg: number): number {
    const measVar = Math.max(accuracyM * accuracyM, 1);
    if (this.x === null || this.variance < 0) {
      this.x = measurement;
      this.variance = measVar / (mPerDeg * mPerDeg);
      this._lastMperDeg = mPerDeg;
      return this.x;
    }
    this.variance += (dtSec * this.processNoise) ** 2 / (mPerDeg * mPerDeg);
    const measVarDeg = measVar / (mPerDeg * mPerDeg);
    const k = this.variance / (this.variance + measVarDeg);
    this.x = this.x + k * (measurement - this.x);
    this.variance = (1 - k) * this.variance;
    this._lastMperDeg = mPerDeg;
    return this.x;
  }
  private _lastMperDeg = 111320;
  /** filtered std deviation expressed in meters */
  stdDevM(): number {
    if (this.variance < 0) return 999;
    return Math.sqrt(this.variance) * this._lastMperDeg;
  }
}

// haversine — meters between two coords
export function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Polygon area (m²) — spherical excess approximation, accurate for plots ≤ a few km
export function polygonAreaM2(coords: { lat: number; lng: number }[]): number {
  if (coords.length < 3) return 0;
  const R = 6378137;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let area = 0;
  for (let i = 0, n = coords.length; i < n; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % n];
    area += (toRad(p2.lng) - toRad(p1.lng)) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs((area * R * R) / 2);
}

export function polygonPerimeterM(coords: { lat: number; lng: number }[]): number {
  if (coords.length < 2) return 0;
  let p = 0;
  for (let i = 0; i < coords.length; i++) {
    p += haversine(coords[i], coords[(i + 1) % coords.length]);
  }
  return p;
}

// Weighted average by 1/accuracy² — for static point averaging
export function weightedAverage(samples: GpsPoint[]): { lat: number; lng: number; accuracy: number } {
  let sw = 0, swLat = 0, swLng = 0;
  for (const s of samples) {
    const w = 1 / Math.max(s.accuracy * s.accuracy, 0.25);
    sw += w; swLat += s.lat * w; swLng += s.lng * w;
  }
  // resulting accuracy ≈ 1/sqrt(sum of 1/var_i)
  const acc = 1 / Math.sqrt(sw);
  return { lat: swLat / sw, lng: swLng / sw, accuracy: acc };
}

export function classifyAccuracy(acc: number): "good" | "ok" | "bad" {
  if (acc <= 5) return "good";
  if (acc <= 10) return "ok";
  return "bad";
}

export function estimateDeviceTier(bestAccuracy: number): "L1" | "L1+L5" | "unknown" {
  if (bestAccuracy <= 0) return "unknown";
  if (bestAccuracy <= 3) return "L1+L5";
  if (bestAccuracy <= 8) return "L1";
  return "unknown";
}

// ---- High-precision watcher (browser only) ----
export interface WatchHandle { stop: () => void; }

export type Listener = (p: GpsPoint, filtered: GpsPoint) => void;

export function startWatch(listener: Listener, cfg: GpsConfig = DEFAULT_GPS_CONFIG): WatchHandle {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { stop: () => {} };
  }
  const kLat = new Kalman1D(cfg.kalmanProcessNoise);
  const kLng = new Kalman1D(cfg.kalmanProcessNoise);
  let last: GpsPoint | null = null;
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      const acc = pos.coords.accuracy ?? 999;
      const raw: GpsPoint = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: acc,
        ts: pos.timestamp,
        alt: pos.coords.altitude ?? null,
      };
      if (acc > cfg.maxAcceptableAccuracy) {
        // mark filtered with raw accuracy AND a "rejected" flag in alt-channel
        listener(raw, { ...raw, accuracy: acc });
        return;
      }
      const dt = last ? (raw.ts - last.ts) / 1000 : 1;
      const mPerDegLat = 111320;
      const mPerDegLng = 111320 * Math.cos((raw.lat * Math.PI) / 180);
      const fLat = kLat.update(raw.lat, acc, dt, mPerDegLat);
      const fLng = kLng.update(raw.lng, acc, dt, mPerDegLng);
      // Filtered accuracy = combined std-dev over both axes (honest, decreases as samples accumulate)
      const filteredAcc = Math.max(
        Math.sqrt((kLat.stdDevM() ** 2 + kLng.stdDevM() ** 2) / 2),
        0.5
      );
      const filtered: GpsPoint = { ...raw, lat: fLat, lng: fLng, accuracy: filteredAcc };
      last = raw;
      listener(raw, filtered);
    },
    (err) => console.warn("GPS error", err),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
  );
  return { stop: () => navigator.geolocation.clearWatch(id) };
}

// Static point capture — collect N good samples then average
export function captureStaticPoint(
  cfg: GpsConfig = DEFAULT_GPS_CONFIG,
  onProgress?: (n: number, target: number, currentAcc: number) => void
): Promise<MeasurementPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation indisponible"));
      return;
    }
    const samples: GpsPoint[] = [];
    const start = Date.now();
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 999;
        const s: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: acc,
          ts: pos.timestamp,
          alt: pos.coords.altitude ?? null,
        };
        if (acc <= cfg.maxAcceptableAccuracy) samples.push(s);
        onProgress?.(samples.length, cfg.staticSamples, acc);
        const elapsed = Date.now() - start;
        if (samples.length >= cfg.staticSamples || elapsed >= cfg.staticTimeoutMs) {
          navigator.geolocation.clearWatch(id);
          if (samples.length === 0) {
            reject(new Error("Aucun signal GPS suffisant. Déplacez-vous en zone dégagée."));
            return;
          }
          const avg = weightedAverage(samples);
          resolve({
            index: 0,
            samples: samples.length,
            auto: false,
            lat: avg.lat,
            lng: avg.lng,
            accuracy: avg.accuracy,
            ts: Date.now(),
          });
        }
      },
      (err) => {
        navigator.geolocation.clearWatch(id);
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 }
    );
  });
}

// ============================================================================
// CALIBRATION GPS TERRAIN
// ----------------------------------------------------------------------------
// Avant chaque levé, l'appareil doit être caractérisé sur place : la précision
// annoncée par le navigateur est optimiste et varie fortement (canopée, nuages,
// bâti). On reste immobile quelques secondes, on mesure la dispersion réelle
// des positions (scatter) et on en déduit un seuil d'acceptation honnête.
// ============================================================================

export interface CalibrationResult {
  samples: number;
  rejected: number;
  bestAccuracyM: number;
  medianAccuracyM: number;
  /** dispersion réelle observée (2 x écart-type des positions, en mètres) */
  scatterM: number;
  /** seuil d'acceptation recommandé pour ce levé */
  recommendedMaxAccuracyM: number;
  /** déplacement minimal à dépasser pour considérer un vrai mouvement */
  recommendedMinMoveM: number;
  tier: "L1" | "L1+L5" | "unknown";
  quality: "excellent" | "bon" | "acceptable" | "insuffisant";
  durationMs: number;
  center: { lat: number; lng: number };
}

export const CALIBRATION_DURATION_MS = 20_000;
export const CALIBRATION_MIN_SAMPLES = 8;

/** Écart-type des positions converti en mètres (dispersion réelle du récepteur). */
export function positionScatterM(samples: GpsPoint[]): number {
  if (samples.length < 2) return 0;
  const mLat = 111_320;
  const meanLat = samples.reduce((s, p) => s + p.lat, 0) / samples.length;
  const meanLng = samples.reduce((s, p) => s + p.lng, 0) / samples.length;
  const mLng = mLat * Math.cos((meanLat * Math.PI) / 180);
  let sum = 0;
  for (const p of samples) {
    const dx = (p.lng - meanLng) * mLng;
    const dy = (p.lat - meanLat) * mLat;
    sum += dx * dx + dy * dy;
  }
  return Math.sqrt(sum / samples.length);
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function calibrationQuality(effective: number): CalibrationResult["quality"] {
  if (effective <= 4) return "excellent";
  if (effective <= 8) return "bon";
  if (effective <= 15) return "acceptable";
  return "insuffisant";
}

/**
 * Calibration statique : l'opérateur reste immobile pendant `durationMs`.
 * Renvoie un profil de précision réel + les seuils à utiliser pour ce levé.
 */
export function runCalibration(
  onProgress?: (state: { elapsedMs: number; durationMs: number; samples: number; currentAccuracyM: number; scatterM: number }) => void,
  durationMs: number = CALIBRATION_DURATION_MS,
): Promise<CalibrationResult> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Géolocalisation indisponible sur cet appareil."));
      return;
    }
    const accepted: GpsPoint[] = [];
    let rejected = 0;
    const start = Date.now();
    let watchId = -1;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (watchId >= 0) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      if (accepted.length < CALIBRATION_MIN_SAMPLES) {
        reject(new Error(
          `Signal GPS insuffisant (${accepted.length} relevés valides). Placez-vous en zone dégagée, hors couvert végétal, puis recommencez.`,
        ));
        return;
      }
      const accs = accepted.map((p) => p.accuracy);
      const best = Math.min(...accs);
      const med = median(accs);
      const scatter = positionScatterM(accepted);
      // Le seuil retenu combine ce que l'appareil annonce (médiane) et ce qu'il
      // fait réellement (dispersion) : on ne peut pas être plus précis que
      // l'agitation observée à l'arrêt.
      const effective = Math.max(med, scatter * 2);
      const center = weightedAverage(accepted);
      resolve({
        samples: accepted.length,
        rejected,
        bestAccuracyM: best,
        medianAccuracyM: med,
        scatterM: scatter,
        recommendedMaxAccuracyM: Math.min(30, Math.max(6, Math.round(effective * 1.5))),
        recommendedMinMoveM: Math.max(5, Math.round(effective * 1.5)),
        tier: estimateDeviceTier(best),
        quality: calibrationQuality(effective),
        durationMs: Date.now() - start,
        center: { lat: center.lat, lng: center.lng },
      });
    };

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const acc = pos.coords.accuracy ?? 999;
        // Pendant la calibration on garde large (50 m) : le but est de mesurer
        // le comportement réel, pas de filtrer.
        if (acc <= 50) {
          accepted.push({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: acc,
            ts: pos.timestamp,
            alt: pos.coords.altitude ?? null,
          });
        } else {
          rejected++;
        }
        onProgress?.({
          elapsedMs: Date.now() - start,
          durationMs,
          samples: accepted.length,
          currentAccuracyM: acc,
          scatterM: positionScatterM(accepted),
        });
      },
      (err) => {
        if (watchId >= 0) navigator.geolocation.clearWatch(watchId);
        if (timer) clearTimeout(timer);
        reject(new Error(
          err.code === err.PERMISSION_DENIED
            ? "Accès à la position refusé. Autorisez la géolocalisation pour AcreMap."
            : "Impossible d'obtenir la position. Vérifiez que le GPS est activé.",
        ));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
    timer = setTimeout(finish, durationMs);
  });
}

/** Configuration de levé dérivée d'une calibration réelle. */
export function configFromCalibration(cal: CalibrationResult, base: GpsConfig = DEFAULT_GPS_CONFIG): GpsConfig {
  return { ...base, maxAcceptableAccuracy: cal.recommendedMaxAccuracyM };
}

// ============================================================================
// VALIDATION TERRAIN AVANT ENREGISTREMENT
// ============================================================================

export interface FieldIssue {
  level: "blocking" | "warning";
  code: string;
  message: string;
}

export interface FieldValidation {
  ok: boolean;
  issues: FieldIssue[];
  /** fermeture du polygone : distance entre le dernier et le premier point */
  closureM: number;
  minSegmentM: number;
  maxAccuracyM: number;
  areaM2: number;
  perimeterM: number;
}

/** Vrai si les segments [a,b] et [c,d] se croisent (coordonnées projetées grossièrement). */
function segmentsCross(
  a: { lat: number; lng: number }, b: { lat: number; lng: number },
  c: { lat: number; lng: number }, d: { lat: number; lng: number },
): boolean {
  const cross = (p: { lat: number; lng: number }, q: { lat: number; lng: number }, r: { lat: number; lng: number }) =>
    (q.lng - p.lng) * (r.lat - p.lat) - (q.lat - p.lat) * (r.lng - p.lng);
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function hasSelfIntersection(pts: { lat: number; lng: number }[]): boolean {
  const n = pts.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // segments adjacents via la fermeture
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Contrôle terrain complet avant enregistrement d'un levé.
 * Les problèmes `blocking` empêchent la soumission ; les `warning` sont
 * signalés à l'opérateur mais n'empêchent pas d'enregistrer.
 */
export function validateFieldMeasurement(
  points: MeasurementPoint[],
  opts: { maxAcceptableAccuracyM?: number; calibration?: CalibrationResult | null; acceptedSamples?: number } = {},
): FieldValidation {
  const issues: FieldIssue[] = [];
  const threshold = opts.maxAcceptableAccuracyM ?? DEFAULT_GPS_CONFIG.maxAcceptableAccuracy;
  const areaM2 = polygonAreaM2(points);
  const perimeterM = polygonPerimeterM(points);

  if (points.length < 3) {
    issues.push({ level: "blocking", code: "min_points", message: "Au moins 3 points sont nécessaires pour fermer une parcelle." });
  }

  const segs: number[] = [];
  for (let i = 0; i < points.length && points.length >= 2; i++) {
    segs.push(haversine(points[i], points[(i + 1) % points.length]));
  }
  const minSegmentM = segs.length ? Math.min(...segs) : 0;
  const closureM = points.length >= 2 ? haversine(points[points.length - 1], points[0]) : 0;
  const maxAccuracyM = points.length ? Math.max(...points.map((p) => p.accuracy)) : 0;

  if (!opts.calibration) {
    issues.push({ level: "warning", code: "no_calibration", message: "Aucune calibration GPS n'a été effectuée : la précision annoncée n'est pas vérifiée." });
  } else if (opts.calibration.quality === "insuffisant") {
    issues.push({ level: "warning", code: "poor_calibration", message: `Calibration faible (dispersion ±${opts.calibration.scatterM.toFixed(1)} m) : surface indicative.` });
  }

  if (maxAccuracyM > threshold * 2) {
    issues.push({ level: "blocking", code: "point_accuracy", message: `Un point a été relevé avec ±${maxAccuracyM.toFixed(1)} m, au-delà du double du seuil (${threshold} m). Reprenez ce point.` });
  } else if (maxAccuracyM > threshold) {
    issues.push({ level: "warning", code: "point_accuracy_soft", message: `Précision la plus faible : ±${maxAccuracyM.toFixed(1)} m (seuil ${threshold} m).` });
  }

  if (points.length >= 3 && minSegmentM < Math.max(3, threshold / 2)) {
    issues.push({ level: "warning", code: "short_segment", message: `Segment très court (${minSegmentM.toFixed(1)} m) : deux points sont peut-être en doublon.` });
  }

  if (points.length >= 4 && hasSelfIntersection(points)) {
    issues.push({ level: "blocking", code: "self_intersection", message: "Le contour se croise lui-même. Corrigez l'ordre des points avant d'enregistrer." });
  }

  if (points.length >= 3 && areaM2 < 100) {
    issues.push({ level: "blocking", code: "tiny_area", message: "Surface calculée inférieure à 100 m² : le contour est incohérent." });
  }

  if (points.length >= 3 && perimeterM > 0) {
    // Indice de compacité : détecte les tracés « en aiguille » (points aberrants)
    const compactness = (4 * Math.PI * areaM2) / (perimeterM * perimeterM);
    if (compactness < 0.05) {
      issues.push({ level: "warning", code: "degenerate_shape", message: "Contour très allongé ou aplati : vérifiez qu'aucun point n'est aberrant." });
    }
  }

  if ((opts.acceptedSamples ?? 0) < 20) {
    issues.push({ level: "warning", code: "few_samples", message: "Peu de relevés GPS acceptés : laissez le récepteur se stabiliser plus longtemps." });
  }

  return {
    ok: !issues.some((i) => i.level === "blocking"),
    issues,
    closureM,
    minSegmentM,
    maxAccuracyM,
    areaM2,
    perimeterM,
  };
}
