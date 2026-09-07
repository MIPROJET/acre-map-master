/**
 * AcreMap — Moteur de morcellement réel.
 *
 * Calcule une géométrie exploitable à partir du périmètre GPS réellement levé :
 * voie principale, voies secondaires, réserve familiale, points de collecte,
 * lots de superficie cible et reliquats. Toutes les surfaces sont mesurées en m²
 * sur l'ellipsoïde (turf), puis les polygones sont normalisés dans un repère
 * 0..100 pour l'aperçu vectoriel.
 */
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { polygonAreaM2 } from "./gps";
import type { Axis, Pt } from "./partage";
import {
  TOLERANCE_M2,
  type MorcConfig,
  type PlanLot,
  type PlanResult,
  type PlanScore,
  type PlanVoie,
} from "./morcellement-v11";

type AnyPoly = Feature<Polygon | MultiPolygon>;

/* ------------------------------- helpers turf ------------------------------- */

function ringFromPts(pts: Pt[]): number[][] {
  return [...pts, pts[0]].map((p) => [p.lng, p.lat]);
}
function ptsFromCoords(coords: number[][]): Pt[] {
  const arr = coords.map(([lng, lat]) => ({ lng, lat }));
  if (arr.length > 1 && arr[0].lat === arr.at(-1)!.lat && arr[0].lng === arr.at(-1)!.lng) arr.pop();
  return arr;
}
function extractPolys(f: AnyPoly | null): Pt[][] {
  if (!f) return [];
  const g = f.geometry;
  if (g.type === "Polygon") return [ptsFromCoords(g.coordinates[0])];
  return g.coordinates.map((c) => ptsFromCoords(c[0]));
}
function featureOf(pts: Pt[]): Feature<Polygon> {
  return turf.polygon([ringFromPts(pts)]) as Feature<Polygon>;
}
function areaOf(f: AnyPoly | null): number {
  if (!f) return 0;
  try { return turf.area(f); } catch { return 0; }
}
function intersectSafe(a: AnyPoly, b: AnyPoly): AnyPoly | null {
  try { return turf.intersect(turf.featureCollection([a, b])) as AnyPoly | null; } catch { return null; }
}
function differenceSafe(a: AnyPoly, b: AnyPoly): AnyPoly | null {
  try { return turf.difference(turf.featureCollection([a, b])) as AnyPoly | null; } catch { return null; }
}
function boxAlong(bbox: number[], axis: Axis, from: number, to: number): Feature<Polygon> {
  const [minX, minY, maxX, maxY] = bbox;
  return axis === "horizontal"
    ? turf.polygon([[[minX - 1, from], [maxX + 1, from], [maxX + 1, to], [minX - 1, to], [minX - 1, from]]])
    : turf.polygon([[[from, minY - 1], [to, minY - 1], [to, maxY + 1], [from, maxY + 1], [from, minY - 1]]]);
}

/** Découpe une tranche de `targetM2` depuis le début de l'axe. */
function sliceByArea(poly: AnyPoly, axis: Axis, targetM2: number): { cut: AnyPoly | null; rest: AnyPoly | null; area: number } {
  const bbox = turf.bbox(poly);
  const [minX, minY, maxX, maxY] = bbox;
  let lo = axis === "horizontal" ? minY : minX;
  let hi = axis === "horizontal" ? maxY : maxX;
  let best: AnyPoly | null = null;
  let bestArea = 0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const box = boxAlong(bbox, axis, axis === "horizontal" ? minY - 1 : minX - 1, mid);
    const inter = intersectSafe(poly, box);
    const a = areaOf(inter);
    best = inter; bestArea = a;
    if (Math.abs(a - targetM2) <= Math.max(0.5, targetM2 * 1e-6)) break;
    if (a > targetM2) hi = mid; else lo = mid;
  }
  if (!best) return { cut: null, rest: poly, area: 0 };
  return { cut: best, rest: differenceSafe(poly, best), area: bestArea };
}

/** Bande de largeur `widthM` positionnée à `frac` (0..1) le long de l'axe. */
function bandAt(poly: AnyPoly, axis: Axis, frac: number, widthM: number): { band: AnyPoly | null; rest: AnyPoly | null } {
  const bbox = turf.bbox(poly);
  const [minX, minY, maxX, maxY] = bbox;
  const cy = (minY + maxY) / 2;
  const cosLat = Math.max(0.1, Math.cos((cy * Math.PI) / 180));
  const half = axis === "horizontal"
    ? widthM / 2 / 110_540
    : widthM / 2 / (111_320 * cosLat);
  const center = axis === "horizontal" ? minY + (maxY - minY) * frac : minX + (maxX - minX) * frac;
  const box = boxAlong(bbox, axis, center - half, center + half);
  const band = intersectSafe(poly, box);
  const rest = band ? differenceSafe(poly, band) : poly;
  return { band, rest };
}

function splitPieces(f: AnyPoly | null): Pt[][] {
  return extractPolys(f).filter((p) => p.length >= 3 && polygonAreaM2(p) > 20);
}

/* ------------------------------ normalisation ------------------------------ */

interface Norm { (pts: Pt[]): [number, number][] }

function makeNormalizer(perimeter: Pt[]): Norm {
  const lats = perimeter.map((p) => p.lat);
  const lngs = perimeter.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const midLat = (minLat + maxLat) / 2;
  const mx = 111_320 * Math.max(0.1, Math.cos((midLat * Math.PI) / 180));
  const my = 110_540;
  const wM = Math.max(1, (maxLng - minLng) * mx);
  const hM = Math.max(1, (maxLat - minLat) * my);
  const scale = 100 / Math.max(wM, hM);
  const offX = (100 - wM * scale) / 2;
  const offY = (100 - hM * scale) / 2;
  return (pts) => pts.map((p) => [
    offX + (p.lng - minLng) * mx * scale,
    100 - offY - (p.lat - minLat) * my * scale,
  ] as [number, number]);
}

/* --------------------------------- moteur --------------------------------- */

function resolveAxis(cfg: MorcConfig, perimeter: Pt[]): Axis {
  if (cfg.orientation === "verticale") return "vertical";
  if (cfg.orientation === "horizontale") return "horizontal";
  const lats = perimeter.map((p) => p.lat);
  const lngs = perimeter.map((p) => p.lng);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const wM = (Math.max(...lngs) - Math.min(...lngs)) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  const hM = (Math.max(...lats) - Math.min(...lats)) * 110_540;
  // On empile les bandes dans le sens le plus long pour limiter les lots étroits.
  return hM >= wM ? "horizontal" : "vertical";
}

const perpendicular = (a: Axis): Axis => (a === "horizontal" ? "vertical" : "horizontal");

function bornesFor(code: string, poly: Pt[]) {
  return poly.map((p, i) => ({ label: `${code}-B${i + 1}`, lat: p.lat, lng: p.lng }));
}

export interface EngineInput {
  perimeter: Pt[];
  config: MorcConfig;
}

/** Construit un plan réel à partir d'un périmètre GPS levé. */
export function buildPlan({ perimeter, config: cfg }: EngineInput): PlanResult {
  const norm = makeNormalizer(perimeter);
  const totalM2 = polygonAreaM2(perimeter);
  const cibleM2 = Math.max(100, Math.round(cfg.cibleHa * 10_000));
  const axis = resolveAxis(cfg, perimeter);

  const lots: PlanLot[] = [];
  const voies: PlanVoie[] = [];
  let working: AnyPoly | null = featureOf(perimeter);

  // --- Voie principale ---------------------------------------------------
  if (cfg.voiePrincipale && working) {
    const voieAxis: Axis = cfg.orientationVoie === "verticale" ? "vertical"
      : cfg.orientationVoie === "horizontale" ? "horizontal"
      : perpendicular(axis);
    const frac = cfg.positionVoie === "laterale" ? 0.15 : cfg.positionVoie === "centrale" ? 0.5 : 0.35;
    const { band, rest } = bandAt(working, voieAxis, frac, cfg.largeurVoieM);
    for (const p of splitPieces(band)) {
      voies.push({ kind: "principale", largeurM: cfg.largeurVoieM, poly: norm(p), geo: p });
    }
    if (rest) working = rest;
  }

  // --- Voies secondaires --------------------------------------------------
  if (cfg.voiesSecondaires && cfg.nbVoiesSec > 0 && working) {
    const secAxis: Axis = cfg.orientationVoieSec === "verticale" ? "vertical"
      : cfg.orientationVoieSec === "horizontale" ? "horizontal"
      : axis;
    for (let i = 1; i <= cfg.nbVoiesSec; i++) {
      if (!working) break;
      const frac = i / (cfg.nbVoiesSec + 1);
      const { band, rest } = bandAt(working, secAxis, frac, cfg.largeurVoieSecM);
      for (const p of splitPieces(band)) {
        voies.push({ kind: "secondaire", largeurM: cfg.largeurVoieSecM, poly: norm(p), geo: p });
      }
      if (rest) working = rest;
    }
  }

  // --- Réserve familiale --------------------------------------------------
  if (cfg.reserveActive && cfg.reserveM2 > 0 && working) {
    const { cut, rest } = sliceByArea(working, axis, Math.min(cfg.reserveM2, areaOf(working) * 0.5));
    const pieces = splitPieces(cut).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
    if (pieces[0]) {
      const g = pieces[0];
      const a = polygonAreaM2(g);
      lots.push({
        code: "RES", part: "proprietaire", kind: "reserve",
        poly: norm(g), geo: g, bornes: bornesFor("RES", g),
        cibleM2: cfg.reserveM2, reelM2: Math.round(a), conforme: true,
        label: `RÉSERVE ${cfg.familleNom.toUpperCase()} — ${(a / 10000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha`,
      });
    }
    if (rest) working = rest;
  }

  // --- Points de collecte -------------------------------------------------
  if (cfg.collecteActive && working) {
    cfg.collecte.slice(0, cfg.nbCollecte).forEach((pc) => {
      if (!working) return;
      const { cut, rest } = sliceByArea(working, perpendicular(axis), Math.min(pc.areaM2, areaOf(working) * 0.2));
      const pieces = splitPieces(cut).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
      if (pieces[0]) {
        const g = pieces[0];
        const a = polygonAreaM2(g);
        lots.push({
          code: pc.id, part: "ac", kind: "collecte",
          poly: norm(g), geo: g, bornes: bornesFor(pc.id, g),
          cibleM2: pc.areaM2, reelM2: Math.round(a), conforme: true,
          label: `${pc.type === "principal" ? "PC PRINCIPAL" : "PC SECONDAIRE"} — ${Math.round(a).toLocaleString("fr-FR")} m²`,
        });
      }
      if (rest) working = rest;
    });
  }

  // --- Lots de superficie cible ------------------------------------------
  const utiles: PlanLot[] = [];
  const blocs = splitPieces(working).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
  const residuels: Pt[][] = [];

  for (const bloc of blocs) {
    let rem: AnyPoly | null = featureOf(bloc);
    let guard = 0;
    while (rem && guard < 400) {
      guard++;
      const remArea = areaOf(rem);
      if (remArea < cibleM2 + 1) break;
      const { cut, rest, area } = sliceByArea(rem, axis, cibleM2);
      const pieces = splitPieces(cut).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
      if (!pieces[0]) break;
      const g = pieces[0];
      const reel = Math.round(polygonAreaM2(g));
      const code = `H${String(utiles.length + 1).padStart(2, "0")}`;
      utiles.push({
        code, part: "proprietaire", kind: "lot",
        poly: norm(g), geo: g, bornes: bornesFor(code, g),
        cibleM2, reelM2: reel,
        conforme: Math.abs(reel - cibleM2) <= TOLERANCE_M2,
      });
      // Les morceaux détachés par un découpage concave rejoignent les résiduels.
      pieces.slice(1).forEach((p) => residuels.push(p));
      if (Math.abs(area - cibleM2) > cibleM2 * 0.5) break;
      rem = rest;
    }
    splitPieces(rem).forEach((p) => residuels.push(p));
  }

  // --- Partage AC / Propriétaire -----------------------------------------
  if (cfg.partageActif && utiles.length) {
    const nbAc = Math.round((utiles.length * cfg.partAcPct) / 100);
    const ordered = cfg.organisationPartage === "blocs"
      ? utiles
      : [...utiles].sort((a, b) => a.code.localeCompare(b.code));
    ordered.forEach((l, i) => { l.part = i < nbAc ? "ac" : "proprietaire"; });
  }

  lots.push(...utiles);

  // --- Reliquats ----------------------------------------------------------
  residuels
    .filter((p) => polygonAreaM2(p) > Math.max(200, cibleM2 * 0.02))
    .sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a))
    .forEach((p, i) => {
      const code = `R${String(i + 1).padStart(2, "0")}`;
      const a = Math.round(polygonAreaM2(p));
      lots.push({
        code, part: "proprietaire", kind: "reserve",
        poly: norm(p), geo: p, bornes: bornesFor(code, p),
        cibleM2: a, reelM2: a, conforme: true,
        label: `RELIQUAT ${code} — ${a.toLocaleString("fr-FR")} m²`,
      });
    });

  // --- Scores -------------------------------------------------------------
  const nonConformes = utiles.filter((l) => !l.conforme).length;
  const residuelM2 = residuels.reduce((s, p) => s + polygonAreaM2(p), 0);
  const superficies = utiles.length
    ? Math.round(100 - (nonConformes / utiles.length) * 100)
    : 0;
  const score: PlanScore = {
    superficies,
    accessibilite: cfg.voiePrincipale ? (cfg.voiesSecondaires ? 96 : 84) : 60,
    formes: Math.round(100 - Math.min(40, (residuelM2 / Math.max(1, totalM2)) * 200)),
    voies: voies.length ? Math.min(100, 70 + voies.length * 6) : 55,
    residuels: Math.round(100 - Math.min(60, (residuelM2 / Math.max(1, totalM2)) * 100 * 2)),
    global: 0,
  };
  score.global = Math.round(
    score.superficies * 0.35 + score.accessibilite * 0.2 + score.formes * 0.15 +
    score.voies * 0.15 + score.residuels * 0.15,
  );

  return {
    lots,
    voies,
    parcelle: norm(perimeter),
    parcelleGeo: perimeter,
    axis,
    score,
    conforme: nonConformes === 0 && utiles.length > 0,
    cibleM2,
    totalM2: Math.round(totalM2),
    createdAt: Date.now(),
  };
}
