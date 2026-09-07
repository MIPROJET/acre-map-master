// Minimal AutoCAD DXF R12 writer for AcreMap.
// Produces LWPOLYLINE / POLYLINE entities on separate layers.
// Coordinates are projected from WGS84 to UTM (m) so distances are real.
import proj4 from "proj4";
import type { Lot, Measurement, Parcelle } from "./types";

export interface DxfInput {
  measurement: Measurement;
  parcelle?: Parcelle | null;
  lots?: Lot[];
  voie?: { lat: number; lng: number }[][];
}

function utmZone(lng: number) {
  return Math.floor((lng + 180) / 6) + 1;
}
function projDef(zone: number, north: boolean) {
  return `+proj=utm +zone=${zone} ${north ? "+north" : "+south"} +datum=WGS84 +units=m +no_defs`;
}

function project(points: { lat: number; lng: number }[]) {
  if (points.length === 0) return { coords: [] as [number, number][], zone: 30, north: true };
  const lng = points[0].lng, lat = points[0].lat;
  const zone = utmZone(lng);
  const north = lat >= 0;
  const def = projDef(zone, north);
  const coords = points.map((p) => proj4("WGS84", def, [p.lng, p.lat]) as [number, number]);
  return { coords, zone, north };
}

function polylineDxf(layer: string, pts: [number, number][], closed = true): string {
  let s = "";
  s += "0\nPOLYLINE\n";
  s += `8\n${layer}\n`;
  s += "66\n1\n";
  s += `70\n${closed ? 1 : 0}\n`;
  for (const [x, y] of pts) {
    s += "0\nVERTEX\n";
    s += `8\n${layer}\n`;
    s += `10\n${x.toFixed(3)}\n`;
    s += `20\n${y.toFixed(3)}\n`;
    s += "30\n0.0\n";
  }
  s += "0\nSEQEND\n";
  s += `8\n${layer}\n`;
  return s;
}

function pointDxf(layer: string, x: number, y: number, label: string): string {
  let s = "";
  s += "0\nPOINT\n";
  s += `8\n${layer}\n`;
  s += `10\n${x.toFixed(3)}\n`;
  s += `20\n${y.toFixed(3)}\n`;
  s += "30\n0.0\n";
  s += "0\nTEXT\n";
  s += `8\n${layer}\n`;
  s += `10\n${(x + 1).toFixed(3)}\n`;
  s += `20\n${(y + 1).toFixed(3)}\n`;
  s += "30\n0.0\n";
  s += "40\n2.0\n";
  s += `1\n${label}\n`;
  return s;
}

export function buildDxf(input: DxfInput): string {
  const { measurement: m, parcelle, lots = [], voie = [] } = input;
  const all: { lat: number; lng: number }[] = m.points.map((p) => ({ lat: p.lat, lng: p.lng }));
  for (const l of lots) all.push(...l.polygon);
  const { zone, north } = project(all);

  let entities = "";
  // Parcelle
  if (m.points.length >= 3) {
    const { coords } = project(m.points);
    entities += polylineDxf("PARCELLE", coords, true);
    coords.forEach(([x, y], i) => { entities += pointDxf("BORNES", x, y, `A${i + 1}`); });
  }
  // Voie
  for (const v of voie) {
    if (v.length >= 3) entities += polylineDxf("VOIE", project(v).coords, true);
  }
  // Lots
  for (const l of lots) {
    if (l.polygon.length >= 3) entities += polylineDxf("LOTS", project(l.polygon).coords, true);
  }

  const header =
    "0\nSECTION\n2\nHEADER\n" +
    "9\n$ACADVER\n1\nAC1009\n" +
    "0\nENDSEC\n";

  const tables =
    "0\nSECTION\n2\nTABLES\n" +
    "0\nTABLE\n2\nLAYER\n70\n5\n" +
    layerDef("0", 7) +
    layerDef("PARCELLE", 5) +     // bleu
    layerDef("LOTS", 3) +          // vert
    layerDef("VOIE", 30) +         // brun/orange
    layerDef("BORNES", 1) +        // rouge
    "0\nENDTAB\n0\nENDSEC\n";

  const blocks = "0\nSECTION\n2\nBLOCKS\n0\nENDSEC\n";

  const ent = "0\nSECTION\n2\nENTITIES\n" + entities + "0\nENDSEC\n";
  const eof = "0\nEOF\n";
  const meta = `999\nAcreMap export — ${parcelle?.code ?? m.id} — UTM ${zone}${north ? "N" : "S"} WGS84\n`;

  return meta + header + tables + blocks + ent + eof;
}

function layerDef(name: string, color: number): string {
  return "0\nLAYER\n" + `2\n${name}\n` + "70\n0\n" + `62\n${color}\n` + "6\nCONTINUOUS\n";
}
