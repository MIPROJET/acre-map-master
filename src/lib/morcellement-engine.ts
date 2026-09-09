/**
 * AcreMap — Moteur de morcellement professionnel.
 *
 * Chaîne de conception foncière :
 *   PARCELLE → PARTAGE → STRUCTURE VIAIRE → ÎLOTS → LOTS → OPTIMISATION → CONTRÔLE
 *
 * Aucune génération en bandes parallèles : la voirie est tracée à partir de
 * l'analyse de forme de la parcelle (axe principal, dimensions, accès), les
 * îlots naissent du réseau viaire, et les lots sont découpés à l'intérieur de
 * chaque îlot selon son orientation propre, avec la superficie cible comme
 * contrainte prioritaire (tolérance ±100 m²).
 */
import { polygonAreaM2, polygonPerimeterM } from "./gps";
import type { Axis, Pt } from "./partage";
import {
  areaOf, convexHullXY, corridor, cutByArea, differenceSafe, extentAlong, featureOf,
  intersectSafe, makeProjector, orientedBox, pieces, unionAll,
  type AnyPoly, type Projector, type XY,
} from "./geo/planar";
import {
  TOLERANCE_M2,
  type MorcConfig, type PlanAnalyse, type PlanIlot, type PlanLot, type PlanResult,
  type PlanScore, type PlanVoie, type PlanZone,
} from "./morcellement-v11";

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

/* -------------------------------- analyse ---------------------------------- */

const ILOT_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const azimutOf = (theta: number) => ((90 - (theta * 180) / Math.PI) % 360 + 360) % 360;

function describeForme(elongation: number, convexite: number): string {
  if (convexite < 0.82) return elongation > 2.2 ? "allongée et découpée" : "irrégulière avec concavités";
  if (elongation > 3) return "très allongée";
  if (elongation > 1.8) return "allongée";
  if (elongation > 1.25) return "rectangulaire";
  return "compacte";
}

/** Point d'accès présumé : milieu du plus long côté du périmètre. */
function accesPoint(perimeter: Pt[], proj: Projector): Pt {
  let best = perimeter[0], bestLen = -1;
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    const pa = proj.toXY(a), pb = proj.toXY(b);
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    if (len > bestLen) {
      bestLen = len;
      best = proj.toLL({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 });
    }
  }
  return best;
}

function analyser(perimeter: Pt[], proj: Projector): { analyse: PlanAnalyse; box: ReturnType<typeof orientedBox> } {
  const xy = perimeter.map(proj.toXY);
  const box = orientedBox(xy);
  const areaM2 = polygonAreaM2(perimeter);
  const perimetreM = polygonPerimeterM(perimeter);
  const hull = convexHullXY(xy);
  const hullArea = Math.abs(hull.reduce((s, p, i) => {
    const q = hull[(i + 1) % hull.length];
    return s + (p.x * q.y - q.x * p.y);
  }, 0)) / 2;
  const convexite = hullArea > 0 ? Math.min(1, areaM2 / hullArea) : 1;
  const elongation = box.largeurM > 0 ? box.longueurM / box.largeurM : 1;
  const compacite = perimetreM > 0 ? (4 * Math.PI * areaM2) / (perimetreM * perimetreM) : 0;
  return {
    box,
    analyse: {
      areaM2: Math.round(areaM2),
      perimetreM: Math.round(perimetreM),
      longueurM: Math.round(box.longueurM),
      largeurM: Math.round(box.largeurM),
      azimutDeg: Math.round(azimutOf(box.theta)),
      elongation: Number(elongation.toFixed(2)),
      convexite: Number(convexite.toFixed(2)),
      compacite: Number(compacite.toFixed(2)),
      acces: accesPoint(perimeter, proj),
      forme: describeForme(elongation, convexite),
    },
  };
}

/* --------------------------------- moteur ---------------------------------- */

function bornesFor(code: string, poly: Pt[]) {
  return poly.map((p, i) => ({ label: `${code}-B${i + 1}`, lat: p.lat, lng: p.lng }));
}

const centroidXY = (poly: Pt[], proj: Projector): XY => {
  const pts = poly.map(proj.toXY);
  return {
    x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
    y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
  };
};

export interface EngineInput {
  perimeter: Pt[];
  config: MorcConfig;
}

/** Construit un plan foncier complet à partir d'un périmètre GPS levé. */
export function buildPlan({ perimeter, config: cfg }: EngineInput): PlanResult {
  const proj = makeProjector(perimeter);
  const norm = makeNormalizer(perimeter);
  const { analyse, box } = analyser(perimeter, proj);
  const totalM2 = polygonAreaM2(perimeter);
  const cibleM2 = Math.max(100, Math.round(cfg.cibleHa * 10_000));
  const span = Math.max(box.longueurM, box.largeurM) * 4 + 500;
  const parcelF = featureOf(perimeter);

  /* ---- 1. PARTAGE AgriCapital / Propriétaire (avant tout découpage) ------- */

  // La ligne de séparation est perpendiculaire au grand axe : c'est la coupe la
  // plus courte et la plus naturelle pour la géométrie relevée.
  const thetaPartage = box.theta;
  let partAcGeo: Pt[][] = [];
  let partProprioGeo: Pt[][] = [];
  let areaACm2 = 0;
  let areaProprioM2 = 0;
  const pctAC = Math.min(100, Math.max(0, cfg.partAcPct));

  if (cfg.partageActif && pctAC > 0 && pctAC < 100) {
    const { basse, haute } = cutByArea(proj, parcelF, perimeter, thetaPartage, (totalM2 * pctAC) / 100, span);
    partAcGeo = pieces(basse, 50);
    partProprioGeo = pieces(haute, 50);
    areaACm2 = partAcGeo.reduce((s, p) => s + polygonAreaM2(p), 0);
    areaProprioM2 = partProprioGeo.reduce((s, p) => s + polygonAreaM2(p), 0);
  }

  const partageActif = cfg.partageActif && partAcGeo.length > 0 && partProprioGeo.length > 0;
  const cible = partageActif ? cfg.cibleMorcellement : "global";

  const zoneMorcelableF: AnyPoly | null =
    !partageActif || cible === "global" ? parcelF
      : cible === "ac" ? unionAll(partAcGeo)
        : unionAll(partProprioGeo);

  /* ---- 2. STRUCTURE VIAIRE (traverse toute la parcelle) ------------------- */

  const thetaVoie =
    cfg.orientationVoie === "horizontale" ? 0
      : cfg.orientationVoie === "verticale" ? Math.PI / 2
        : box.theta;                        // auto / terrain : suit le grand axe
  const thetaSec =
    cfg.orientationVoieSec === "horizontale" ? 0
      : cfg.orientationVoieSec === "verticale" ? Math.PI / 2
        : thetaVoie + Math.PI / 2;          // auto / adaptative : perpendiculaire

  const voies: PlanVoie[] = [];
  const corridors: AnyPoly[] = [];

  // Voie principale : épine dorsale reliant l'accès au cœur de la parcelle.
  if (cfg.voiePrincipale) {
    const lateralPct = cfg.modeVoie === "manuel"
      ? Math.max(-45, Math.min(45, cfg.decalageVoiePct)) / 100
      : cfg.positionVoie === "laterale" ? -0.3
        : cfg.positionVoie === "traversante" ? 0.12
          : 0;                              // auto / centrale
    // Décalage perpendiculaire à la voie, exprimé en fraction de la largeur.
    const vx = -Math.sin(thetaVoie), vy = Math.cos(thetaVoie);
    const dep = box.largeurM * lateralPct;
    const centre: XY = { x: box.centre.x + vx * dep, y: box.centre.y + vy * dep };
    const band = corridor(proj, centre, thetaVoie, cfg.largeurVoieM, span);
    const clipped = intersectSafe(parcelF, band);
    if (clipped) {
      corridors.push(clipped);
      for (const p of pieces(clipped, 5)) {
        voies.push({
          kind: "principale", largeurM: cfg.largeurVoieM, poly: norm(p), geo: p,
          longueurM: Math.round(polygonAreaM2(p) / Math.max(1, cfg.largeurVoieM)),
        });
      }
    }
  }

  // Voies secondaires : ramifications desservant les îlots depuis l'épine.
  if (cfg.voiesSecondaires) {
    // Profondeur d'îlot visée : deux rangées de lots de part et d'autre.
    const cote = Math.sqrt(cibleM2);
    const auto = Math.round(box.longueurM / Math.max(60, cote * 2.2)) - 1;
    const nb = cfg.modeVoieSec === "manuel"
      ? Math.max(0, Math.min(20, Math.round(cfg.nbVoiesSec)))
      : Math.max(0, Math.min(14, auto));
    const ux = Math.cos(thetaVoie), uy = Math.sin(thetaVoie);
    for (let i = 1; i <= nb; i++) {
      const t = -box.longueurM / 2 + (i * box.longueurM) / (nb + 1);
      const centre: XY = { x: box.centre.x + ux * t, y: box.centre.y + uy * t };
      const band = corridor(proj, centre, thetaSec, cfg.largeurVoieSecM, span);
      const clipped = intersectSafe(parcelF, band);
      if (!clipped) continue;
      corridors.push(clipped);
      for (const p of pieces(clipped, 5)) {
        voies.push({
          kind: "secondaire", largeurM: cfg.largeurVoieSecM, poly: norm(p), geo: p,
          longueurM: Math.round(polygonAreaM2(p) / Math.max(1, cfg.largeurVoieSecM)),
        });
      }
    }
  }

  const voirieF = unionAll(corridors.flatMap((c) => pieces(c, 1)));
  const voirieM2 = voies.reduce((s, v) => s + (v.geo ? polygonAreaM2(v.geo) : 0), 0);

  /* ---- 3. ÎLOTS : ce que la voirie découpe dans la zone à morceler -------- */

  let terrainF: AnyPoly | null = zoneMorcelableF;
  if (terrainF && voirieF) terrainF = differenceSafe(terrainF, voirieF);

  const minIlot = Math.max(150, cibleM2 * 0.08);
  const blocs = pieces(terrainF, minIlot)
    .map((geo) => ({ geo, d: (() => { const c = centroidXY(geo, proj); return c.x * Math.cos(thetaVoie) + c.y * Math.sin(thetaVoie); })() }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.geo);

  /* ---- 4. LOTS : découpe interne à chaque îlot ---------------------------- */

  const lots: PlanLot[] = [];
  const ilots: PlanIlot[] = [];
  const reliquats: Pt[][] = [];
  const utiles: PlanLot[] = [];

  // Points de collecte : prélevés en bordure de la voie principale.
  const collectes = cfg.collecteActive ? cfg.collecte.slice(0, cfg.nbCollecte) : [];
  let collecteIdx = 0;

  blocs.forEach((bloc, bi) => {
    const lettre = ILOT_LETTERS[bi % ILOT_LETTERS.length];
    let rest: AnyPoly | null = featureOf(bloc);

    // Un point de collecte par îlot desservi, tant qu'il en reste à placer.
    while (collecteIdx < collectes.length && rest && areaOf(rest) > collectes[collecteIdx].areaM2 * 3) {
      const pc = collectes[collecteIdx];
      const restPts = pieces(rest, 10)[0];
      if (!restPts) break;
      const bb = orientedBox(restPts.map(proj.toXY));
      const { basse, haute } = cutByArea(proj, rest, restPts, bb.theta, pc.areaM2, span);
      const g = pieces(basse, 10).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a))[0];
      if (!g) break;
      const a = Math.round(polygonAreaM2(g));
      lots.push({
        code: pc.id, part: cible === "proprietaire" ? "proprietaire" : "ac", kind: "collecte",
        poly: norm(g), geo: g, bornes: bornesFor(pc.id, g), ilot: lettre,
        cibleM2: pc.areaM2, reelM2: a, conforme: Math.abs(a - pc.areaM2) <= TOLERANCE_M2,
        label: `${pc.type === "principal" ? "PC PRINCIPAL" : "PC SECONDAIRE"} — ${a.toLocaleString("fr-FR")} m²`,
      });
      rest = haute;
      collecteIdx++;
      break;
    }

    const ilotGeo = pieces(rest, 10).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a))[0] ?? bloc;
    const ilotArea = polygonAreaM2(ilotGeo);
    let nbLotsIlot = 0;

    // Chaque îlot est découpé selon SON orientation propre : les lots épousent
    // les limites et les voies, ce qui évite l'effet de bandes uniformes.
    let rem: AnyPoly | null = featureOf(ilotGeo);
    let guard = 0;
    while (rem && guard < 300) {
      guard++;
      const remPts = pieces(rem, 10).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a))[0];
      if (!remPts) break;
      const remArea = polygonAreaM2(remPts);
      if (remArea < cibleM2 + TOLERANCE_M2) break;
      const bb = orientedBox(remPts.map(proj.toXY));
      const remF = featureOf(remPts);
      const { basse, haute, aire } = cutByArea(proj, remF, remPts, bb.theta, cibleM2, span);
      const parts = pieces(basse, 10).sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
      const g = parts[0];
      if (!g) break;
      const reel = Math.round(polygonAreaM2(g));
      nbLotsIlot++;
      const code = `${lettre}${String(nbLotsIlot).padStart(2, "0")}`;
      utiles.push({
        code,
        part: cible === "ac" ? "ac" : cible === "proprietaire" ? "proprietaire" : "proprietaire",
        kind: "lot", ilot: lettre,
        poly: norm(g), geo: g, bornes: bornesFor(code, g),
        cibleM2, reelM2: reel,
        conforme: Math.abs(reel - cibleM2) <= TOLERANCE_M2,
      });
      // Morceaux détachés par une concavité : ils rejoignent les reliquats.
      parts.slice(1).forEach((p) => reliquats.push(p));
      // Autres blocs du reste (îlot en plusieurs morceaux) : traités comme reliquats.
      pieces(rem, 10).slice(1).forEach((p) => reliquats.push(p));
      if (Math.abs(aire - cibleM2) > cibleM2 * 0.5) break;
      rem = haute;
    }
    pieces(rem, Math.max(120, cibleM2 * 0.03)).forEach((p) => reliquats.push(p));

    ilots.push({
      code: lettre, poly: norm(ilotGeo), geo: ilotGeo,
      areaM2: Math.round(ilotArea),
      part: cible === "ac" ? "ac" : cible === "proprietaire" ? "proprietaire" : "proprietaire",
      nbLots: nbLotsIlot,
    });
  });

  /* ---- 5. Répartition AC / Propriétaire des lots (morcellement global) ---- */

  if (partageActif && cible === "global") {
    const { min } = extentAlong(proj, perimeter, thetaPartage);
    const { max } = extentAlong(proj, perimeter, thetaPartage);
    const seuil = min + (max - min) * (pctAC / 100);
    utiles.forEach((l) => {
      const c = centroidXY(l.geo ?? [], proj);
      const d = c.x * Math.cos(thetaPartage) + c.y * Math.sin(thetaPartage);
      l.part = d <= seuil ? "ac" : "proprietaire";
    });
  } else if (partageActif) {
    utiles.forEach((l) => { l.part = cible === "ac" ? "ac" : "proprietaire"; });
  }

  lots.push(...utiles);
  ilots.forEach((i) => {
    const parts = utiles.filter((l) => l.ilot === i.code);
    if (parts.length) i.part = parts.filter((l) => l.part === "ac").length >= parts.length / 2 ? "ac" : "proprietaire";
  });

  /* ---- 6. Reliquats identifiés ------------------------------------------- */

  const seuilReliquat = Math.max(150, cibleM2 * 0.03);
  const reliquatsRetenus = reliquats
    .filter((p) => polygonAreaM2(p) > seuilReliquat)
    .sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
  reliquatsRetenus.forEach((p, i) => {
    const code = `R${String(i + 1).padStart(2, "0")}`;
    const a = Math.round(polygonAreaM2(p));
    lots.push({
      code, part: cible === "ac" ? "ac" : "proprietaire", kind: "reserve",
      poly: norm(p), geo: p, bornes: bornesFor(code, p),
      cibleM2: a, reelM2: a, conforme: true,
      label: `RELIQUAT ${code} — ${a.toLocaleString("fr-FR")} m²`,
    });
  });
  const reliquatM2 = reliquatsRetenus.reduce((s, p) => s + polygonAreaM2(p), 0);

  /* ---- 7. Zones non morcelées -------------------------------------------- */

  const zones: PlanZone[] = [];
  const proprio = (cfg.proprietaireNom || "PROPRIÉTAIRE").toUpperCase();
  if (partageActif && cible !== "global") {
    const gardees = cible === "ac" ? partProprioGeo : partAcGeo;
    const part: "ac" | "proprietaire" = cible === "ac" ? "proprietaire" : "ac";
    for (const g of gardees) {
      // La voirie traverse la zone non morcelée mais n'y crée aucun lot.
      zones.push({
        part,
        poly: norm(g), geo: g,
        areaM2: Math.round(polygonAreaM2(g)),
        titre: part === "proprietaire" ? proprio : "AGRICAPITAL",
        mention: part === "proprietaire" ? "RÉSERVE PROPRIÉTAIRE" : "PART AGRICAPITAL",
      });
    }
  }

  /* ---- 8. Contrôle de conformité et scores -------------------------------- */

  const nonConformes = utiles.filter((l) => !l.conforme).length;
  const morceleM2 = utiles.reduce((s, l) => s + l.reelM2, 0);
  const desservis = utiles.length; // chaque lot naît d'un îlot bordé par la voirie
  const superficies = utiles.length ? Math.round(100 - (nonConformes / utiles.length) * 100) : 0;
  const score: PlanScore = {
    superficies,
    accessibilite: voies.length
      ? Math.min(100, 62 + (voies.some((v) => v.kind === "principale") ? 18 : 0)
        + Math.min(20, voies.filter((v) => v.kind === "secondaire").length * 4))
      : 45,
    formes: Math.round(100 - Math.min(45, (reliquatM2 / Math.max(1, totalM2)) * 220)),
    voies: voies.length ? Math.min(100, 68 + voies.length * 5) : 40,
    residuels: Math.round(100 - Math.min(60, (reliquatM2 / Math.max(1, totalM2)) * 200)),
    global: 0,
  };
  score.global = Math.round(
    score.superficies * 0.35 + score.accessibilite * 0.2 + score.formes * 0.15 +
    score.voies * 0.15 + score.residuels * 0.15,
  );
  void desservis;

  const axis: Axis = Math.abs(Math.cos(box.theta)) >= Math.abs(Math.sin(box.theta)) ? "horizontal" : "vertical";

  return {
    lots, voies, ilots, zones,
    parcelle: norm(perimeter),
    parcelleGeo: perimeter,
    axis,
    analyse,
    partage: {
      actif: partageActif,
      pctAC,
      areaACm2: Math.round(areaACm2),
      areaProprioM2: Math.round(areaProprioM2),
      cible,
    },
    score,
    conforme: nonConformes === 0 && utiles.length > 0,
    cibleM2,
    totalM2: Math.round(totalM2),
    morceleM2: Math.round(morceleM2),
    voirieM2: Math.round(voirieM2),
    reliquatM2: Math.round(reliquatM2),
    createdAt: Date.now(),
  };
}
