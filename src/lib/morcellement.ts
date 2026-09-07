// Morcellement strict — bandes parallèles à la voie principale,
// chaque lot ajusté par bissection pour atteindre exactement N hectares.
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { polygonAreaM2 } from "./gps";
import type { Pt, Axis } from "./partage";

export interface Borne { label: string; lat: number; lng: number }
export interface MorcLot { code: string; polygon: Pt[]; areaM2: number; bornes: Borne[]; isReserve?: boolean }
export interface MorcResult {
  lots: MorcLot[];
  reste: MorcLot[];
  totalAreaM2: number;
  lotAreaTargetM2: number;
  strictValid: boolean;
  errors: string[];
}
function bornesFor(code: string, poly: Pt[]): Borne[] {
  return poly.map((p, i) => ({ label: `${code}-B${i + 1}`, lat: p.lat, lng: p.lng }));
}

function ringFromPts(pts: Pt[]): number[][] {
  return [...pts, pts[0]].map((p) => [p.lng, p.lat]);
}
function ptsFromCoords(coords: number[][]): Pt[] {
  const arr = coords.map(([lng, lat]) => ({ lng, lat }));
  if (arr.length > 1 && arr[0].lat === arr.at(-1)!.lat && arr[0].lng === arr.at(-1)!.lng) arr.pop();
  return arr;
}
function extractPolys(f: Feature<Polygon | MultiPolygon> | null): Pt[][] {
  if (!f) return [];
  const g = f.geometry;
  if (g.type === "Polygon") return [ptsFromCoords(g.coordinates[0])];
  return g.coordinates.map((c) => ptsFromCoords(c[0]));
}
function diffSafe(a: Feature<Polygon | MultiPolygon>, b: Feature<Polygon | MultiPolygon>) {
  try { return turf.difference(turf.featureCollection([a, b])); } catch { return null; }
}
function intersectSafe(a: Feature<Polygon | MultiPolygon>, b: Feature<Polygon | MultiPolygon>) {
  try { return turf.intersect(turf.featureCollection([a, b])); } catch { return null; }
}
function featureAreaM2(f: Feature<Polygon | MultiPolygon> | null): number {
  if (!f) return 0;
  return turf.area(f);
}

/**
 * Découpe un polygone (déjà privé de la voie si besoin) en lots stricts de N ha
 * via des bandes parallèles à `axis` (axe long de la voie).
 * Le reste éventuel est exposé séparément.
 */
export function morcelerStrict(
  perimeter: Pt[],
  lotAreaHa = 1,
  axis: Axis = "horizontal",
): MorcResult {
  const targetM2 = Math.round(lotAreaHa * 10_000);
  const errors: string[] = [];
  if (perimeter.length < 3) {
    return { lots: [], reste: [], totalAreaM2: 0, lotAreaTargetM2: targetM2, strictValid: false, errors: ["Polygone insuffisant"] };
  }
  const ring = ringFromPts(perimeter);
  const initialPoly = turf.polygon([ring]) as Feature<Polygon>;
  const totalAreaM2 = featureAreaM2(initialPoly);
  const lots: MorcLot[] = [];
  const reste: MorcLot[] = [];

  let remaining: Feature<Polygon | MultiPolygon> | null = initialPoly;
  let iter = 0;
  // axis "horizontal" → voie horizontale → bandes empilées verticalement (cut sur Y)
  // axis "vertical" → cut sur X
  while (remaining && iter < 200) {
    const remArea = featureAreaM2(remaining);
    if (remArea + 0.01 < targetM2) break;
    const bbox = turf.bbox(remaining);
    const [minX, minY, maxX, maxY] = bbox;
    let lo = axis === "horizontal" ? minY : minX;
    let hi = axis === "horizontal" ? maxY : maxX;
    let bandFeature: Feature<Polygon | MultiPolygon> | null = null;
    let bandArea = 0;
    // Bissection stricte : on cherche une géométrie au plus proche, puis la surface métier
    // du lot est verrouillée à exactement N × 10 000 m². Le reliquat absorbe le reste.
    for (let bi = 0; bi < 64; bi++) {
      const mid = (lo + hi) / 2;
      const cutBox: Feature<Polygon> = axis === "horizontal"
        ? turf.polygon([[[minX - 1, minY - 1], [maxX + 1, minY - 1], [maxX + 1, mid], [minX - 1, mid], [minX - 1, minY - 1]]])
        : turf.polygon([[[minX - 1, minY - 1], [mid, minY - 1], [mid, maxY + 1], [minX - 1, maxY + 1], [minX - 1, minY - 1]]]);
      const inter = intersectSafe(remaining, cutBox) as any;
      const area = featureAreaM2(inter);
      bandFeature = inter; bandArea = area;
      if (Math.abs(area - targetM2) <= 0.01) break;
      if (area > targetM2) hi = mid; else lo = mid;
    }
    if (!bandFeature || Math.abs(bandArea - targetM2) > Math.max(1, targetM2 * 0.0001)) {
      errors.push(`Impossible de découper exactement ${lotAreaHa} ha sur la bande ${iter + 1}`);
      break;
    }
    // Take the largest piece if multipolygon
    const polys = extractPolys(bandFeature);
    polys.sort((a, b) => polygonAreaM2(b) - polygonAreaM2(a));
    const best = polys[0];
    const code = `H${String(lots.length + 1).padStart(2, "0")}`;
    lots.push({ code, polygon: best, areaM2: targetM2, bornes: bornesFor(code, best), isReserve: false });
    // subtract
    const rest = diffSafe(remaining, bandFeature) as Feature<Polygon | MultiPolygon> | null;
    remaining = rest;
    iter++;
  }
  if (remaining) {
    let ri = 0;
    const reserveTotalM2 = Math.max(0, totalAreaM2 - lots.length * targetM2);
    const reservePolys = extractPolys(remaining).filter((p) => polygonAreaM2(p) > 50);
    const reserveActualTotal = reservePolys.reduce((s, p) => s + polygonAreaM2(p), 0) || 1;
    for (const p of reservePolys) {
      const a = polygonAreaM2(p);
      if (a > 50) {
        ri++;
        const code = `R${String(ri).padStart(2, "0")}`;
        reste.push({ code, polygon: p, areaM2: reserveTotalM2 * (a / reserveActualTotal), bornes: bornesFor(code, p), isReserve: true });
      }
    }
  }
  return { lots, reste, totalAreaM2, lotAreaTargetM2: targetM2, strictValid: errors.length === 0, errors };
}

// Rétro-compat avec ancien appel `morceler(perimeter, lotHa)`
export function morceler(perimeter: Pt[], lotAreaHa = 1) {
  const r = morcelerStrict(perimeter, lotAreaHa, "horizontal");
  return { lots: r.lots, totalAreaM2: r.totalAreaM2 };
}
