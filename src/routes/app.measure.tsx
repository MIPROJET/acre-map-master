import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { z } from "zod";
import { MapView } from "@/components/MapView";
import {
  DEFAULT_GPS_CONFIG, classifyAccuracy, estimateDeviceTier,
  haversine, polygonAreaM2, polygonPerimeterM, startWatch,
  runCalibration, configFromCalibration, validateFieldMeasurement,
  CALIBRATION_DURATION_MS,
  type CalibrationResult, type FieldValidation, type GpsConfig,
} from "@/lib/gps";
import { db, isBrowser } from "@/lib/db";
import { syncEntity } from "@/lib/sync";
import { prefetchTilesAround, keepScreenAwake } from "@/lib/offline";
import { useAuth } from "@/lib/auth";
import { formatArea, formatDistance } from "@/lib/format";
import { feedbackError, feedbackMark, feedbackSuccess, unlockAudio, notify, requestNotificationPermission } from "@/lib/feedback";
import type { GpsPoint, Measurement, MeasurementPoint } from "@/lib/types";
import {
  MapPin, Pause, Play, Undo2, Save, Send, Settings2, Layers, X,
  ChevronDown, ChevronUp, Crosshair, AlertTriangle, Activity,
  CheckCircle2, XCircle, Loader2, Target,
} from "lucide-react";

const searchSchema = z.object({ parcelleId: z.string().optional() });

export const Route = createFileRoute("/app/measure")({
  component: MeasurePage,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Mesure GPS terrain — AcreMap" }] }),
});

function MeasurePage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const { parcelleId } = Route.useSearch();

  const linkedParcelle = useLiveQuery(async () => {
    if (!isBrowser() || !parcelleId) return null;
    return db().parcelles.get(parcelleId);
  }, [parcelleId]);

  // `running` = GPS actif (interface ouverte, position affichée)
  // `started` = levée réellement démarrée (le tracé n'avance qu'à partir de là)
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [satellite, setSatellite] = useState(true);
  const [unit, setUnit] = useState<"ha" | "m2" | "km2">("ha");
  const [current, setCurrent] = useState<GpsPoint | null>(null);
  const [filteredCur, setFilteredCur] = useState<GpsPoint | null>(null);
  const [trace, setTrace] = useState<GpsPoint[]>([]);
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [distanceFromLast, setDistanceFromLast] = useState(0);
  const [bestAcc, setBestAcc] = useState<number>(999);
  const [accSamples, setAccSamples] = useState<number[]>([]);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [qaHistory, setQaHistory] = useState<{ ts: number; acc: number; ok: boolean }[]>([]);
  // Marquage instantané — pas d'état de capture progressive
  const [autoMark100, setAutoMark100] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statsOpen, setStatsOpen] = useState(true);
  const [qaOpen, setQaOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // --- Calibration GPS terrain ---
  const [calibrating, setCalibrating] = useState(false);
  const [calProgress, setCalProgress] = useState<{ elapsedMs: number; samples: number; currentAccuracyM: number; scatterM: number } | null>(null);
  const [calibration, setCalibration] = useState<CalibrationResult | null>(null);
  const [gpsConfig, setGpsConfig] = useState<GpsConfig>(DEFAULT_GPS_CONFIG);
  // --- Pause / reprise ---
  const [pauses, setPauses] = useState<{ startedAt: number; endedAt?: number; durationMs?: number }[]>([]);
  // --- Contrôle terrain avant enregistrement ---
  const [fieldCheck, setFieldCheck] = useState<FieldValidation | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState(false);
  const lastAutoRef = useRef<GpsPoint | null>(null);
  const stablePosRef = useRef<GpsPoint | null>(null);
  const watchRef = useRef<{ stop: () => void } | null>(null);
  const pausedRef = useRef(false);
  const startedRef = useRef(false);
  const cfgRef = useRef<GpsConfig>(DEFAULT_GPS_CONFIG);
  const wakeRef = useRef<{ release: () => void } | null>(null);
  useEffect(() => () => { wakeRef.current?.release(); }, []);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { startedRef.current = started; }, [started]);
  useEffect(() => { cfgRef.current = gpsConfig; }, [gpsConfig]);

  useEffect(() => {
    if (!running) return;
    setError(null);
    const handle = startWatch((raw, filtered) => {
      const cfg = cfgRef.current;
      setCurrent(raw);
      const accepted = raw.accuracy <= cfg.maxAcceptableAccuracy;
      if (accepted) {
        setBestAcc((b) => Math.min(b, raw.accuracy));
        setAccSamples((s) => [...s.slice(-199), raw.accuracy]);
        setAcceptedCount((c) => c + 1);
      } else {
        setRejectedCount((c) => c + 1);
      }
      setQaHistory((h) => [...h.slice(-29), { ts: raw.ts, acc: raw.accuracy, ok: accepted }]);
      // La position affichée est toujours rafraîchie (pour pouvoir marquer le
      // départ), mais aucun tracé n'est construit tant que la levée n'a pas
      // été démarrée par l'opérateur.
      if (accepted) setFilteredCur(filtered);
      if (!startedRef.current) return;
      if (pausedRef.current) return;
      if (!accepted) return;

      const stable = stablePosRef.current;
      if (!stable) {
        stablePosRef.current = filtered;
        setFilteredCur(filtered);
        setTrace((tr) => (tr.length ? tr : [filtered]));
        return;
      }

      // Anti-dérive terrain : une nouvelle position n'est acceptée que si le
      // déplacement dépasse largement l'incertitude GPS — seuil issu de la
      // calibration réelle de l'appareil quand elle est disponible.
      const calibratedMin = calibration?.recommendedMinMoveM ?? 8;
      const minMove = Math.max(calibratedMin, raw.accuracy * 2, filtered.accuracy * 2.5);
      if (haversine(stable, filtered) < minMove) {
        setDistanceFromLast(0);
        return;
      }

      stablePosRef.current = filtered;
      setFilteredCur(filtered);
      setTrace((tr) => [...tr, filtered]);
      setPoints((pts) => {
        if (pts.length === 0) return pts;
        const last = pts[pts.length - 1];
        const d = haversine(last, filtered);
        setDistanceFromLast(d);
        if (autoMark100 && d >= cfg.autoMarkEveryMeters &&
            (!lastAutoRef.current || haversine(lastAutoRef.current, filtered) >= cfg.autoMarkEveryMeters)) {
          lastAutoRef.current = filtered;
          feedbackMark();
          notify("Point auto-marqué", `Point ${pts.length + 1} enregistré à 100 m du précédent.`, { tag: "auto-mark" });
          const next: MeasurementPoint = {
            index: pts.length + 1, samples: 1, auto: true,
            lat: filtered.lat, lng: filtered.lng, accuracy: filtered.accuracy, ts: Date.now(),
          };
          return [...pts, next];
        }
        return pts;
      });
    }, cfgRef.current);
    watchRef.current = handle;
    return () => { handle.stop(); watchRef.current = null; };
  }, [running, autoMark100, calibration]);

  /** Calibration statique : l'opérateur reste immobile pendant ~20 s. */
  async function calibrate() {
    setError(null);
    setCalibrating(true);
    setCalProgress({ elapsedMs: 0, samples: 0, currentAccuracyM: 0, scatterM: 0 });
    try {
      await unlockAudio();
      const res = await runCalibration((p) =>
        setCalProgress({ elapsedMs: p.elapsedMs, samples: p.samples, currentAccuracyM: p.currentAccuracyM, scatterM: p.scatterM }),
      );
      setCalibration(res);
      setGpsConfig(configFromCalibration(res));
      setBestAcc(res.bestAccuracyM);
      if (res.quality === "insuffisant") feedbackError(); else feedbackSuccess();
      // Les tuiles de la zone calibrée sont mises en cache dès maintenant.
      void prefetchTilesAround(res.center.lat, res.center.lng, 3);
    } catch (e: any) {
      feedbackError();
      setError(e?.message ?? "Calibration impossible.");
    } finally {
      setCalibrating(false);
      setCalProgress(null);
    }
  }

  /** Ouvre simplement l'interface de levée : GPS actif, mais AUCUN tracé. */
  async function openSurvey() {
    await unlockAudio();
    await requestNotificationPermission();
    stablePosRef.current = null;
    lastAutoRef.current = null;
    setTrace([]);
    setPoints([]);
    setStarted(false);
    setFilteredCur(null);
    setRunning(true);
    // Garde l'écran allumé pendant le levé (continuité du tracé)
    void keepScreenAwake().then((w) => { wakeRef.current = w; });
    // Pré-chargement des tuiles autour de la position de départ (navigation hors ligne)
    if (isBrowser() && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { void prefetchTilesAround(pos.coords.latitude, pos.coords.longitude, 3); },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  }
  function togglePause() {
    setPaused((p) => {
      const next = !p;
      const now = Date.now();
      if (next) {
        // Pause : la trace est gelée et l'interruption est journalisée.
        setPauses((ps) => [...ps, { startedAt: now }]);
        notify("Mesure en pause", "La trace est suspendue. Le tracé reprendra à votre position réelle.", { tag: "pause" });
      } else {
        setPauses((ps) => ps.map((x, i) =>
          i === ps.length - 1 && !x.endedAt ? { ...x, endedAt: now, durationMs: now - x.startedAt } : x,
        ));
        // Reprise : on repart de la position réelle et non du dernier point
        // gelé, sinon un déplacement fait pendant la pause créerait un faux
        // segment rectiligne dans le tracé.
        stablePosRef.current = null;
        lastAutoRef.current = filteredCur ?? lastAutoRef.current;
        notify("Mesure reprise", "Continuez votre tracé.", { tag: "resume" });
      }
      return next;
    });
  }

  function markPoint() {
    setError(null);
    // Marquage INSTANTANÉ — un clic = un point ajouté immédiatement.
    // Utilise la dernière position filtrée (Kalman) si dispo, sinon le brut.
    const src = filteredCur ?? current;
    if (!src) {
      feedbackError();
      setError("Position GPS non encore reçue. Patientez quelques secondes.");
      return;
    }
    if (src.accuracy > gpsConfig.maxAcceptableAccuracy * 2) {
      feedbackError();
      setError(`Précision insuffisante (±${src.accuracy.toFixed(0)} m, seuil calibré ${gpsConfig.maxAcceptableAccuracy} m). Attendez un meilleur signal.`);
      return;
    }
    const isStart = !started;
    const p: MeasurementPoint = {
      index: points.length + 1,
      samples: 1,
      auto: false,
      lat: src.lat,
      lng: src.lng,
      accuracy: src.accuracy,
      ts: Date.now(),
    };
    if (isStart) {
      // MARQUER LE DÉPART — c'est ce clic qui démarre réellement la levée.
      stablePosRef.current = { lat: src.lat, lng: src.lng, accuracy: src.accuracy, ts: p.ts };
      setTrace([{ lat: src.lat, lng: src.lng, accuracy: src.accuracy, ts: p.ts }]);
      setPoints([p]);
      setStarted(true);
      notify("Levée démarrée", "Point de départ enregistré. Marchez autour de la parcelle.", { tag: "start" });
    } else {
      setPoints((s) => [...s, p]);
    }
    lastAutoRef.current = { lat: p.lat, lng: p.lng, accuracy: p.accuracy, ts: p.ts };
    feedbackMark();
  }

  function undo() {
    setPoints((s) => s.slice(0, -1));
    lastAutoRef.current = null;
  }

  /** Ouvre le contrôle terrain : rien n'est enregistré avant sa réussite. */
  function runFieldCheck(submit: boolean) {
    const res = validateFieldMeasurement(points, {
      maxAcceptableAccuracyM: gpsConfig.maxAcceptableAccuracy,
      calibration,
      acceptedSamples: acceptedCount,
    });
    setFieldCheck(res);
    setPendingSubmit(submit);
    setCheckOpen(true);
    if (!res.ok) feedbackError();
  }

  /**
   * Enregistre la levée. `force` permet de terminer à tout moment après le
   * démarrage : le polygone est refermé automatiquement sur le point de départ
   * à partir de la position actuelle.
   */
  async function save(submit: boolean, force = false) {
    if (!user) return;
    if (!isBrowser()) return;
    // Fermeture automatique : la position courante est ajoutée comme dernier
    // point si l'opérateur n'est pas revenu au point de départ.
    const src = filteredCur ?? current;
    let finalPoints = points;
    if (force && src && points.length >= 1) {
      const last = points[points.length - 1];
      if (haversine(last, src) > 5) {
        finalPoints = [...points, {
          index: points.length + 1, samples: 1, auto: true,
          lat: src.lat, lng: src.lng, accuracy: src.accuracy, ts: Date.now(),
        }];
      }
    }
    if (finalPoints.length < 3) {
      feedbackError();
      setError("Au moins 3 points sont nécessaires pour former une parcelle.");
      return;
    }
    const finalTrace = force && finalPoints.length
      ? [...trace, { lat: finalPoints[0].lat, lng: finalPoints[0].lng, accuracy: finalPoints[0].accuracy, ts: Date.now() }]
      : trace;
    const check = validateFieldMeasurement(finalPoints, {
      maxAcceptableAccuracyM: gpsConfig.maxAcceptableAccuracy,
      calibration,
      acceptedSamples: acceptedCount,
    });
    if (!check.ok && !force) {
      setFieldCheck(check);
      setCheckOpen(true);
      feedbackError();
      return;
    }
    const points_ = finalPoints;
    const accVals = accSamples.filter((a) => a < 999).sort((a, b) => a - b);
    const median = accVals[Math.floor(accVals.length / 2)] ?? bestAcc;
    const m: Measurement = {
      id: crypto.randomUUID(),
      parcelleId: parcelleId || undefined,
      createdBy: user.id,
      createdAt: Date.now(),
      status: submit ? "submitted" : "draft",
      points: points_, trace: finalTrace,
      areaM2: polygonAreaM2(points_),
      perimeterM: polygonPerimeterM(points_),
      unit,
      deviceProfile: {
        userAgent: navigator.userAgent, platform: navigator.platform,
        estimatedTier: calibration?.tier ?? estimateDeviceTier(bestAcc),
        bestAccuracyM: bestAcc, medianAccuracyM: median,
        samplesCount: acceptedCount + rejectedCount,
      },
      qa: {
        acceptedCount, rejectedCount,
        maxAcceptableAccuracyM: gpsConfig.maxAcceptableAccuracy,
        bestAccuracyM: bestAcc, medianAccuracyM: median,
        liveAccuracyM: filteredCur?.accuracy,
        history: qaHistory.map((q) => ({ ts: q.ts, accuracyM: q.acc, accepted: q.ok })),
        calibration: calibration
          ? {
              samples: calibration.samples,
              bestAccuracyM: calibration.bestAccuracyM,
              medianAccuracyM: calibration.medianAccuracyM,
              scatterM: calibration.scatterM,
              recommendedMaxAccuracyM: calibration.recommendedMaxAccuracyM,
              tier: calibration.tier,
              quality: calibration.quality,
              at: Date.now() - calibration.durationMs,
            }
          : null,
        pauses,
        fieldCheck: {
          ok: check.ok,
          closureM: check.closureM,
          minSegmentM: check.minSegmentM,
          maxAccuracyM: check.maxAccuracyM,
          issues: check.issues,
        },
      },
    };
    await db().measurements.put(m);
    // Synchronisation cloud immédiate (ou mise en file d'attente hors ligne)
    void syncEntity("measurements", m.id).catch(() => {});
    feedbackSuccess();
    setCheckOpen(false);
    if (submit) await notify("Mesure soumise", `Levé envoyé (${formatArea(m.areaM2, m.unit)}).`, { tag: "submit" });
    navigate({ to: "/app/parcelles/$id", params: { id: m.id } });
  }

  const area = polygonAreaM2(points);
  const perim = polygonPerimeterM(points);
  const accClass = filteredCur ? classifyAccuracy(filteredCur.accuracy) : "bad";
  const guideTo = points.length >= 3 ? points[0] : null;
  const sortedAcc = [...accSamples].sort((a, b) => a - b);
  const medianAcc = sortedAcc.length ? sortedAcc[Math.floor(sortedAcc.length / 2)] : null;
  const totalSamples = acceptedCount + rejectedCount;
  const acceptRate = totalSamples > 0 ? Math.round((acceptedCount / totalSamples) * 100) : 0;
  const qaReady = acceptedCount >= 30 && bestAcc <= 12 && (medianAcc ?? 99) <= 15;

  const accDot = accClass === "good" ? "bg-success" : accClass === "ok" ? "bg-warn" : "bg-destructive";
  const accBg = accClass === "good" ? "bg-success/90" : accClass === "ok" ? "bg-warn/90" : "bg-destructive/90";

  return (
    <div className="fixed inset-0 lg:relative lg:h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* CARTE PLEIN ÉCRAN */}
      <div className="absolute inset-0">
        <MapView
          satellite={satellite}
          current={filteredCur}
          currentAccuracy={filteredCur?.accuracy}
          perimeter={points}
          trace={trace}
          guideTo={guideTo}
          guideColor="orange"
        />
      </div>

      {/* TOP BAR FLOTTANTE — compacte */}
      <div className="absolute top-2 left-2 right-2 z-[500] flex items-start gap-2 pointer-events-none">
        <div className={`pointer-events-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-white text-xs font-bold shadow-elevated ${accBg}`}>
          <span className={`w-2 h-2 rounded-full bg-white animate-pulse`} />
          ±{filteredCur ? filteredCur.accuracy.toFixed(1) : "—"}m
        </div>
        {linkedParcelle ? (
          <div className="pointer-events-auto flex-1 min-w-0 px-2.5 py-1.5 rounded-full bg-card/95 backdrop-blur shadow-elevated text-[11px] truncate">
            <b className="text-primary">{linkedParcelle.code}</b> · {linkedParcelle.ownerName}
          </div>
        ) : (
          <Link to="/app/parcelles/new" className="pointer-events-auto flex-1 px-2.5 py-1.5 rounded-full bg-warn/95 text-white text-[11px] font-semibold shadow-elevated truncate">
            <AlertTriangle className="inline w-3 h-3 mr-1" />Créer la parcelle
          </Link>
        )}
        <Link to="/app" className="pointer-events-auto p-2 rounded-full bg-card/95 backdrop-blur shadow-elevated">
          <X className="w-4 h-4" />
        </Link>
      </div>

      {/* BANDEAU PAUSE */}
      {paused && running && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[500] px-3 py-1.5 rounded-full bg-warn text-white text-xs font-bold shadow-elevated animate-pulse">
          ⏸ PAUSE
        </div>
      )}

      {/* BARRE STATS FLOTTANTE — repliable */}
      <div className="absolute top-12 right-2 z-[500] w-44">
        <button
          onClick={() => setStatsOpen((s) => !s)}
          className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-t-lg bg-card/95 backdrop-blur shadow-elevated text-[11px] font-semibold border-b"
        >
          <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" />Statistiques</span>
          {statsOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {statsOpen && (
          <div className="bg-card/95 backdrop-blur shadow-elevated rounded-b-lg p-2 space-y-1 text-[11px]">
            <Row label="État" value={!started ? "En attente du départ" : paused ? "En pause" : "Levée en cours"} />
            <Row label="Points" value={String(points.length)} />
            <Row label="Périm." value={points.length >= 2 ? formatDistance(perim) : "—"} />
            <Row label="Surface" value={points.length >= 3 ? formatArea(area, unit) : "—"} bold />
            <Row label="Précision" value={filteredCur ? `±${filteredCur.accuracy.toFixed(1)}m` : "—"} />
            <Row label="Méd." value={medianAcc != null ? `±${medianAcc.toFixed(1)}m` : "—"} />
            <Row label="Best" value={bestAcc < 999 ? `±${bestAcc.toFixed(1)}m` : "—"} />
            {started && points.length > 0 && (
              <Row label="Auto dans" value={`${Math.max(0, DEFAULT_GPS_CONFIG.autoMarkEveryMeters - distanceFromLast).toFixed(0)}m`} />
            )}
          </div>
        )}
      </div>

      {/* OPTIONS RAPIDES — bouton flottant gauche */}
      <div className="absolute top-12 left-2 z-[500] flex flex-col gap-2">
        <button
          onClick={() => setSatellite((s) => !s)}
          className="p-2 rounded-full bg-card/95 backdrop-blur shadow-elevated"
          title={satellite ? "Vue carte" : "Vue satellite"}
        >
          <Layers className="w-4 h-4" />
        </button>
        <button
          onClick={() => setOptionsOpen(true)}
          className="p-2 rounded-full bg-card/95 backdrop-blur shadow-elevated"
          title="Options"
        >
          <Settings2 className="w-4 h-4" />
        </button>
        {running && (
          <button
            onClick={() => setQaOpen((q) => !q)}
            className={`p-2 rounded-full shadow-elevated ${qaReady ? "bg-success text-white" : "bg-warn text-white"}`}
            title="Contrôle qualité GPS"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* PANNEAU QA FLOTTANT */}
      {qaOpen && running && (
        <div className="absolute top-32 left-2 z-[500] w-60 bg-card/95 backdrop-blur shadow-elevated rounded-lg p-2.5 text-[11px]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-bold">{qaReady ? "✓ Qualité validée" : "◌ QA en cours"}</span>
            <button onClick={() => setQaOpen(false)}><X className="w-3 h-3" /></button>
          </div>
          <div className="text-muted-foreground mb-1">{acceptedCount} acceptés / {rejectedCount} rejetés ({acceptRate}%)</div>
          <div className="flex items-end gap-0.5 h-8">
            {qaHistory.slice(-30).map((q, i) => {
              const h = Math.max(8, Math.min(32, 32 - q.acc * 0.8));
              const cls = !q.ok ? "bg-destructive" : q.acc <= 5 ? "bg-success" : q.acc <= 10 ? "bg-warn" : "bg-orange-500";
              return <div key={i} className={`flex-1 rounded-sm ${cls}`} style={{ height: `${h}px` }} />;
            })}
            {qaHistory.length === 0 && <span className="text-[10px] text-muted-foreground">En attente…</span>}
          </div>
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            Seuil ≤{DEFAULT_GPS_CONFIG.maxAcceptableAccuracy}m · profil {estimateDeviceTier(bestAcc)}
          </div>
        </div>
      )}

      {/* DOCK BAS — actions principales */}
      <div className="absolute left-2 right-2 z-[1200] space-y-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        {error && (
          <div className="px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground text-xs text-center shadow-elevated">
            {error}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 items-stretch">
          <button
            onClick={markPoint}
            disabled={!running || paused}
            className={`flex-1 min-w-[9rem] h-14 rounded-2xl font-bold shadow-elevated disabled:opacity-40 flex flex-col items-center justify-center gap-0.5 ${
              started ? "bg-accent text-accent-foreground" : "bg-success text-white"
            }`}
          >
            <MapPin className="w-5 h-5" />
            <span className="text-[11px] leading-none text-center px-1">
              {started ? "MARQUER UN POINT" : "MARQUER LE DÉPART"}
            </span>
          </button>
          {running && started && (
            <button
              onClick={togglePause}
              className={`h-14 w-14 shrink-0 rounded-2xl shadow-elevated font-bold flex flex-col items-center justify-center gap-0.5 ${
                paused ? "bg-success text-white" : "bg-warn text-white"
              }`}
            >
              {paused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
              <span className="text-[10px] leading-none">{paused ? "Reprendre" : "Pause"}</span>
            </button>
          )}
          <button
            onClick={undo}
            disabled={points.length === 0}
            className="h-14 w-14 shrink-0 rounded-2xl bg-card shadow-elevated disabled:opacity-30 flex items-center justify-center"
          >
            <Undo2 className="w-5 h-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => save(false, true)}
            disabled={!started}
            className="flex-1 min-w-[7rem] h-11 rounded-xl bg-card/95 backdrop-blur shadow-elevated text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Save className="w-3.5 h-3.5" />Brouillon
          </button>
          <button
            onClick={() => {
              if (!started) return;
              const n = points.length;
              if (!confirm(`Terminer et sauvegarder la levée ?\n${n} point(s) · ${n >= 3 ? formatArea(area, unit) : "surface calculée à la fermeture"}\nLe polygone sera automatiquement refermé sur le point de départ.`)) return;
              save(true, true);
            }}
            disabled={!started}
            className="flex-1 min-w-[9rem] h-11 rounded-xl bg-destructive text-destructive-foreground font-bold text-xs shadow-elevated disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />TERMINER ET SAUVER
          </button>
        </div>
      </div>

      {/* OVERLAY DÉMARRAGE */}
      {!running && (
        <div className="absolute inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 z-[1000] overflow-y-auto">
          <div className="bg-card rounded-2xl p-5 sm:p-6 w-full max-w-md text-center shadow-elevated">
            <h2 className="text-xl font-bold">Prêt pour la levée GPS</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Ce bouton ouvre seulement l'interface : le GPS s'active et affiche votre position,
              mais <strong>aucun tracé n'est enregistré</strong>. Placez-vous ensuite au point de
              départ et appuyez sur « MARQUER LE DÉPART » pour lancer réellement la levée.
            </p>
            <button
              onClick={openSurvey}
              className="mt-5 w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-base shadow-elevated"
            >
              ▶ OUVRIR L'INTERFACE DE LEVÉE
            </button>
            <p className="text-[10px] text-muted-foreground mt-2">Active GPS, son et notifications</p>
          </div>
        </div>
      )}

      {/* Marquage instantané — pas d'overlay de capture */}

      {/* DRAWER OPTIONS */}
      {optionsOpen && (
        <div className="absolute inset-0 z-[1000]" onClick={() => setOptionsOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-card rounded-t-2xl p-4 space-y-3 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Options de levée</h3>
              <button onClick={() => setOptionsOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <label className="flex items-center justify-between text-sm">
              <span>Marquage auto tous les 100&nbsp;m</span>
              <input type="checkbox" checked={autoMark100} onChange={(e) => setAutoMark100(e.target.checked)} className="w-5 h-5" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Vue satellite</span>
              <input type="checkbox" checked={satellite} onChange={(e) => setSatellite(e.target.checked)} className="w-5 h-5" />
            </label>
            <label className="flex items-center justify-between text-sm">
              <span>Unité de surface</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value as any)} className="px-2 py-1 rounded border bg-background text-sm">
                <option value="ha">hectares</option>
                <option value="m2">mètres²</option>
                <option value="km2">km²</option>
              </select>
            </label>
            <div className="text-[10px] text-muted-foreground pt-2 border-t">
              Profil&nbsp;: <b>{estimateDeviceTier(bestAcc)}</b> · Échantillons&nbsp;: {totalSamples} · Précision filtrée&nbsp;: ±{filteredCur ? filteredCur.accuracy.toFixed(1) : "—"}&nbsp;m
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-bold text-primary" : "font-semibold"}>{value}</span>
    </div>
  );
}
