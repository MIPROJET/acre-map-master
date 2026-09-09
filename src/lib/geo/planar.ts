/**
 * AcreMap — Repère métrique local et outils de découpe géométrique.
 *
 * Toutes les opérations de conception (axes, lignes de partage, voies, îlots)
 * sont menées dans un plan métrique local centré sur la parcelle : les angles et
 * les largeurs y sont exacts. Les surfaces, elles, restent calculées par turf sur
 * l'ellipsoïde à partir des coordonnées WGS84 reconverties.
 */
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { polygonAreaM2 } from "../gps";
import type { Pt } from "../partage";

export type AnyPoly = Feature<Polygon | MultiPolygon>;
export interface XY { x: number; y: number }

export interface Projector {
  toXY: (p: Pt) => XY;
  toLL: (q: XY) => Pt;
}

export function makeProjector(perimeter: Pt[]): Projector {
  const lat0 = perimeter.reduce((s, p) => s + p.lat, 0) / perimeter.length;
  const lng0 = perimeter.reduce((s, p) => s + p.lng, 0) / perimeter.length;
  const mx = 111_320 * Math.max(0.1, Math.cos((lat0 * Math.PI) / 180));
  const my = 110_540;
  return {
    toXY: (p) => ({ x: (p.lng - lng0) * mx, y: (p.lat - lat0) * my }),
    toLL: (q) => ({ lng: lng0 + q.x / mx, lat: lat0 + q.y / my }),
  };
}

/* ------------------------------- turf helpers ------------------------------ */

export function ringFromPts(pts: Pt[]): number[][] {
  return [...pts, pts[0]].map((p) => [p.lng, p.lat]);
}

function ptsFromCoords(coords: number[][]): Pt[] {
  const arr = coords.map(([lng, lat]) => ({ lng, lat }));
  if (arr.length > 1 && arr[0].lat === arr.at(-1)!.lat && arr[0].lng === arr.at(-1)!.lng) arr.pop();
  return arr;
}

export function featureOf(pts: Pt[]): Feature<Polygon> {
  return turf.polygon([ringFromPts(pts)]) as Feature<Polygon>;
}

export function extractPolys(f: AnyPoly | null): Pt[][] {
  if (!f) return [];
  const g = f.geometry;
  if (g.type === "Polygon") return [ptsFromCoords(g.coordinates[0])];
  return g.coordinates.map((c) => ptsFromCoords(c[0]));
}

/** Morceaux exploitables d'une géométrie (rejette les échardes). */
export function pieces(f: AnyPoly | null, minM2 = 20): Pt[][] {
  return extractPolys(f).filter((p) => p.length >= 3 && polygonAreaM2(p) > minM2);
}

export function areaOf(f: AnyPoly | null): number {
  if (!f) return 0;
  try { return turf.area(f); } catch { return 0; }
}

export function intersectSafe(a: AnyPoly, b: AnyPoly): AnyPoly | null {
  try { return turf.intersect(turf.featureCollection([a, b])) as AnyPoly | null; } catch { return null; }
}

export function differenceSafe(a: AnyPoly, b: AnyPoly): AnyPoly | null {
  try { return turf.difference(turf.featureCollection([a, b])) as AnyPoly | null; } catch { return null; }
}

/** Union d'une liste de polygones (null si vide). */
export function unionAll(list: Pt[][]): AnyPoly | null {
  let acc: AnyPoly | null = null;
  for (const p of list) {
    if (p.length < 3) continue;
    const f = featureOf(p);
    if (!acc) { acc = f; continue; }
    try { acc = (turf.union(turf.featureCollection([acc, f])) as AnyPoly | null) ?? acc; } catch { /* garde acc */ }
  }
  return acc;
}

/* ------------------------- enveloppe et axe principal ----------------------- */

/** Enveloppe convexe (chaîne monotone) dans le plan métrique. */
export function convexHullXY(pts: XY[]): XY[] {
  const s = [...pts].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  if (s.length < 3) return s;
  const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: XY[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

export interface OrientedBox {
  /** Angle du grand axe, en radians (0 = est, sens trigonométrique). */
  theta: number;
  longueurM: number;
  largeurM: number;
  centre: XY;
}

/** Rectangle d'encombrement minimal (calipers sur l'enveloppe convexe). */
export function orientedBox(ptsXY: XY[]): OrientedBox {
  const hull = convexHullXY(ptsXY);
  if (hull.length < 3) {
    return { theta: 0, longueurM: 1, largeurM: 1, centre: { x: 0, y: 0 } };
  }
  let best: OrientedBox | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of hull) {
      const u = p.x * c - p.y * s;
      const v = p.x * s + p.y * c;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const w = maxU - minU, h = maxV - minV;
    const area = w * h;
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      // retour dans le repère d'origine
      const cx = cu * Math.cos(ang) - cv * Math.sin(ang);
      const cy = cu * Math.sin(ang) + cv * Math.cos(ang);
      best = w >= h
        ? { theta: ang, longueurM: w, largeurM: h, centre: { x: cx, y: cy } }
        : { theta: ang + Math.PI / 2, longueurM: h, largeurM: w, centre: { x: cx, y: cy } };
    }
  }
  return best!;
}

/* ------------------------------- demi-plans -------------------------------- */

/**
 * Polygone couvrant le demi-plan { p · n <= d }, avec n = (cos θ, sin θ).
 * Utilisé pour toutes les coupes rectilignes (partage, découpe des lots).
 */
export function halfPlane(proj: Projector, theta: number, d: number, span: number): Feature<Polygon> {
  const nx = Math.cos(theta), ny = Math.sin(theta);
  const vx = -ny, vy = nx;
  const base: XY[] = [
    { x: nx * d + vx * span, y: ny * d + vy * span },
    { x: nx * d - vx * span, y: ny * d - vy * span },
    { x: nx * (d - 2 * span) - vx * span, y: ny * (d - 2 * span) - vy * span },
    { x: nx * (d - 2 * span) + vx * span, y: ny * (d - 2 * span) + vy * span },
  ];
  return featureOf(base.map(proj.toLL));
}

/** Bande rectiligne (voie) de largeur `widthM` passant par `centre`, de direction θ. */
export function corridor(proj: Projector, centre: XY, theta: number, widthM: number, span: number): Feature<Polygon> {
  const ux = Math.cos(theta), uy = Math.sin(theta);
  const vx = -uy, vy = ux;
  const h = widthM / 2;
  const c: XY[] = [
    { x: centre.x + ux * span + vx * h, y: centre.y + uy * span + vy * h },
    { x: centre.x + ux * span - vx * h, y: centre.y + uy * span - vy * h },
    { x: centre.x - ux * span - vx * h, y: centre.y - uy * span - vy * h },
    { x: centre.x - ux * span + vx * h, y: centre.y - uy * span + vy * h },
  ];
  return featureOf(c.map(proj.toLL));
}

/** Étendue projetée d'un polygone sur la direction θ. */
export function extentAlong(proj: Projector, poly: Pt[], theta: number): { min: number; max: number } {
  const nx = Math.cos(theta), ny = Math.sin(theta);
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const q = proj.toXY(p);
    const d = q.x * nx + q.y * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/**
 * Coupe `poly` par une droite de normale θ pour que la partie « basse »
 * atteigne `targetM2`. Bissection sur le décalage de la droite.
 */
export function cutByArea(
  proj: Projector, poly: AnyPoly, ptsRef: Pt[], theta: number, targetM2: number, span: number,
): { basse: AnyPoly | null; haute: AnyPoly | null; aire: number } {
  const { min, max } = extentAlong(proj, ptsRef, theta);
  let lo = min, hi = max;
  let basse: AnyPoly | null = null;
  let aire = 0;
  for (let i = 0; i < 42; i++) {
    const mid = (lo + hi) / 2;
    const inter = intersectSafe(poly, halfPlane(proj, theta, mid, span));
    aire = areaOf(inter);
    basse = inter;
    if (Math.abs(aire - targetM2) <= Math.max(0.5, targetM2 * 1e-5)) break;
    if (aire > targetM2) hi = mid; else lo = mid;
  }
  if (!basse) return { basse: null, haute: poly, aire: 0 };
  return { basse, haute: differenceSafe(poly, basse), aire };
}
