// AC / Propriétaire split — bissection along horizontal or vertical axis
// to reach the requested percentage on the AC part.
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { polygonAreaM2 } from "./gps";

export type Axis = "horizontal" | "vertical";
export interface Pt { lat: number; lng: number }
export interface PartageResult {
  partAC: Pt[][];        // 1+ polygones (en cas de multipolygone)
  partProprio: Pt[][];
  areaACm2: number;
  areaProprioM2: number;
  axis: Axis;
  pctAC: number;
}

function ringFromPts(pts: Pt[]): number[][] {
  return [...pts, pts[0]].map((p) => [p.lng, p.lat]);
}
function ptsFromCoords(coords: number[][]): Pt[] {
  // strip closing duplicate
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

export function partagerParcelle(perimeter: Pt[], axis: Axis, pctAC: number): PartageResult {
  const ring = ringFromPts(perimeter);
  const poly = turf.polygon([ring]) as Feature<Polygon>;
  const totalArea = polygonAreaM2(perimeter);
  const targetAC = (totalArea * pctAC) / 100;
  const bbox = turf.bbox(poly);
  const [minX, minY, maxX, maxY] = bbox;

  // Bisection on axis coordinate
  let lo = axis === "horizontal" ? minY : minX;
  let hi = axis === "horizontal" ? maxY : maxX;
  let bestSplit = (lo + hi) / 2;
  let partA: Feature<Polygon | MultiPolygon> | null = null;
  let partB: Feature<Polygon | MultiPolygon> | null = null;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    bestSplit = mid;
    const cutBoxA: Feature<Polygon> = axis === "horizontal"
      ? turf.polygon([[[minX - 1, mid], [maxX + 1, mid], [maxX + 1, maxY + 1], [minX - 1, maxY + 1], [minX - 1, mid]]])
      : turf.polygon([[[minX - 1, minY - 1], [mid, minY - 1], [mid, maxY + 1], [minX - 1, maxY + 1], [minX - 1, minY - 1]]]);
    const cutBoxB: Feature<Polygon> = axis === "horizontal"
      ? turf.polygon([[[minX - 1, minY - 1], [maxX + 1, minY - 1], [maxX + 1, mid], [minX - 1, mid], [minX - 1, minY - 1]]])
      : turf.polygon([[[mid, minY - 1], [maxX + 1, minY - 1], [maxX + 1, maxY + 1], [mid, maxY + 1], [mid, minY - 1]]]);
    partA = turf.intersect(turf.featureCollection([poly, cutBoxA])) as any;
    partB = turf.intersect(turf.featureCollection([poly, cutBoxB])) as any;
    const aPolys = extractPolys(partA);
    const areaA = aPolys.reduce((s, p) => s + polygonAreaM2(p), 0);
    if (Math.abs(areaA - targetAC) / Math.max(targetAC, 1) < 0.005) break;
    if (areaA > targetAC) {
      // need less of A → move split closer to A side
      if (axis === "horizontal") hi = mid; else hi = mid;
    } else {
      if (axis === "horizontal") lo = mid; else lo = mid;
    }
  }
  void bestSplit;
  const partACpolys = extractPolys(partA);
  const partProprioPolys = extractPolys(partB);
  const areaACm2 = partACpolys.reduce((s, p) => s + polygonAreaM2(p), 0);
  const areaProprioM2 = partProprioPolys.reduce((s, p) => s + polygonAreaM2(p), 0);
  return { partAC: partACpolys, partProprio: partProprioPolys, areaACm2, areaProprioM2, axis, pctAC };
}
