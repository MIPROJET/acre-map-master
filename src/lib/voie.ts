// Voie principale — bande centrale rectangulaire de largeur N mètres,
// orientation horizontale ou verticale, clippée sur le polygone parent.
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { polygonAreaM2 } from "./gps";
import type { Pt, Axis } from "./partage";

export interface VoieResult {
  voie: Pt[][];           // 1+ polygones (clippés)
  reste: Pt[][];          // polygone(s) parcelle moins voie
  axis: Axis;
  widthM: number;
  voieAreaM2: number;
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

export function genererVoie(perimeter: Pt[], axis: Axis, widthM: number): VoieResult {
  const ring = ringFromPts(perimeter);
  const poly = turf.polygon([ring]) as Feature<Polygon>;
  const bbox = turf.bbox(poly);
  const [minX, minY, maxX, maxY] = bbox;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Convert width meters → degrees
  const cosLat = Math.cos((cy * Math.PI) / 180);
  const halfDegX = (widthM / 2) / (111_320 * cosLat);
  const halfDegY = (widthM / 2) / 110_540;
  const band: Feature<Polygon> = axis === "horizontal"
    ? turf.polygon([[[minX - 1, cy - halfDegY], [maxX + 1, cy - halfDegY], [maxX + 1, cy + halfDegY], [minX - 1, cy + halfDegY], [minX - 1, cy - halfDegY]]])
    : turf.polygon([[[cx - halfDegX, minY - 1], [cx + halfDegX, minY - 1], [cx + halfDegX, maxY + 1], [cx - halfDegX, maxY + 1], [cx - halfDegX, minY - 1]]]);

  const voieF = turf.intersect(turf.featureCollection([poly, band])) as any;
  const resteF = turf.difference(turf.featureCollection([poly, band])) as any;
  const voie = extractPolys(voieF);
  const reste = extractPolys(resteF);
  const voieAreaM2 = voie.reduce((s, p) => s + polygonAreaM2(p), 0);
  return { voie, reste, axis, widthM, voieAreaM2 };
}
