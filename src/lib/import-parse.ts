// Lecture des fichiers issus des appareils de levé topographique et des logiciels CAO/SIG.
// Formats géométriques lus dans l'application : DXF, GPX, KML/KMZ (XML), GeoJSON, CSV/TXT (WGS84 ou UTM).
// Formats archivés (traitement manuel) : DWG, PDF, ZIP/Shapefile — le fichier est conservé
// dans le stockage et rattaché à la parcelle.
import { utmToLatLng, zoneFromLng } from "./geo/utm";

export type ParsedKind = "geometry" | "attachment";

export interface ParsedRing { points: { lat: number; lng: number }[]; label?: string }

export interface ParseResult {
  kind: ParsedKind;
  format: string;
  rings: ParsedRing[];
  warnings: string[];
}

const GEO_EXT = ["dxf", "gpx", "kml", "geojson", "json", "csv", "txt"];
export const ATTACH_EXT = ["dwg", "pdf", "zip", "shp", "dbf", "prj", "kmz", "raw", "rw5", "cot"];

export function extOf(name: string): string {
  return (name.split(".").pop() ?? "").toLowerCase();
}

export function isGeometryFile(name: string): boolean {
  return GEO_EXT.includes(extOf(name));
}

function valid(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

function closeRing(pts: { lat: number; lng: number }[]) {
  if (pts.length > 2) {
    const a = pts[0], b = pts[pts.length - 1];
    if (Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lng - b.lng) < 1e-9) pts.pop();
  }
  return pts;
}

// ---------- DXF ----------
// Lecture des entités LWPOLYLINE / POLYLINE / VERTEX / POINT (codes 10 = X, 20 = Y).
export function parseDxf(text: string, utmZone?: number): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const warnings: string[] = [];
  const rings: ParsedRing[] = [];
  let current: { x: number; y: number }[] = [];
  let inEntity = false;
  let layer = "";
  let pendingX: number | null = null;

  const flush = () => {
    if (current.length >= 3) {
      const pts = current.map((p) => toLatLng(p.x, p.y, utmZone));
      rings.push({ points: closeRing(pts.filter((p) => valid(p.lat, p.lng))), label: layer || undefined });
    }
    current = [];
  };

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i];
    const value = lines[i + 1];
    if (code === "0") {
      if (inEntity) flush();
      inEntity = value === "LWPOLYLINE" || value === "POLYLINE" || value === "VERTEX" || value === "POINT" || value === "LINE";
      if (value === "VERTEX") inEntity = true; // les vertex alimentent la polyligne courante
      if (value !== "VERTEX") layer = "";
      continue;
    }
    if (!inEntity) continue;
    if (code === "8") layer = value;
    else if (code === "10") pendingX = parseFloat(value);
    else if (code === "20" && pendingX !== null) {
      current.push({ x: pendingX, y: parseFloat(value) });
      pendingX = null;
    }
  }
  flush();
  const kept = rings.filter((r) => r.points.length >= 3);
  if (!kept.length) warnings.push("Aucune polyligne fermée exploitable trouvée dans le DXF.");
  return { kind: "geometry", format: "DXF", rings: kept, warnings };
}

function toLatLng(x: number, y: number, utmZone?: number): { lat: number; lng: number } {
  // Coordonnées déjà géographiques ?
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return { lat: y, lng: x };
  // Sinon : UTM (X = easting, Y = northing). Zone 29 ou 30 par défaut pour la Côte d'Ivoire.
  const zone = utmZone ?? 29;
  return utmToLatLng(x, y, zone, "N");
}

// ---------- GPX ----------
export function parseGpx(text: string): ParseResult {
  const pts: { lat: number; lng: number }[] = [];
  const re = /<(?:trkpt|rtept|wpt)[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    if (valid(lat, lng)) pts.push({ lat, lng });
  }
  return {
    kind: "geometry", format: "GPX",
    rings: pts.length >= 3 ? [{ points: closeRing(pts) }] : [],
    warnings: pts.length >= 3 ? [] : ["Moins de 3 points trouvés dans le GPX."],
  };
}

// ---------- KML ----------
export function parseKml(text: string): ParseResult {
  const rings: ParsedRing[] = [];
  const re = /<coordinates>([\s\S]*?)<\/coordinates>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const pts = m[1].trim().split(/\s+/).map((tok) => {
      const [lng, lat] = tok.split(",").map(Number);
      return { lat, lng };
    }).filter((p) => valid(p.lat, p.lng));
    if (pts.length >= 3) rings.push({ points: closeRing(pts) });
  }
  return { kind: "geometry", format: "KML", rings, warnings: rings.length ? [] : ["Aucun polygone trouvé dans le KML."] };
}

// ---------- GeoJSON ----------
export function parseGeoJson(text: string): ParseResult {
  const rings: ParsedRing[] = [];
  const warnings: string[] = [];
  try {
    const gj = JSON.parse(text);
    const feats = gj.type === "FeatureCollection" ? gj.features : [gj.type === "Feature" ? gj : { geometry: gj, properties: {} }];
    for (const f of feats ?? []) {
      const g = f.geometry ?? f;
      const label = f.properties?.name ?? f.properties?.code;
      const push = (coords: number[][]) => {
        const pts = coords.map(([lng, lat]) => ({ lat, lng })).filter((p) => valid(p.lat, p.lng));
        if (pts.length >= 3) rings.push({ points: closeRing(pts), label });
      };
      if (g?.type === "Polygon") push(g.coordinates[0]);
      else if (g?.type === "MultiPolygon") g.coordinates.forEach((poly: number[][][]) => push(poly[0]));
      else if (g?.type === "LineString") push(g.coordinates);
    }
  } catch {
    warnings.push("Fichier GeoJSON illisible.");
  }
  return { kind: "geometry", format: "GeoJSON", rings, warnings };
}

// ---------- CSV / TXT (stations totales, GPS RTK, carnets de terrain) ----------
export function parseCsv(text: string, utmZone?: number): ParseResult {
  const warnings: string[] = [];
  const rows = text.split(/\r?\n/).filter((l) => l.trim());
  if (!rows.length) return { kind: "geometry", format: "CSV", rings: [], warnings: ["Fichier vide."] };
  const sep = (rows[0].match(/;/g)?.length ?? 0) > (rows[0].match(/,/g)?.length ?? 0) ? ";" : rows[0].includes("\t") ? "\t" : ",";
  const head = rows[0].toLowerCase().split(sep).map((h) => h.trim());
  const findIdx = (...keys: string[]) => head.findIndex((h) => keys.some((k) => h === k || h.includes(k)));
  const iLat = findIdx("lat", "latitude");
  const iLng = findIdx("lon", "lng", "longitude");
  const iE = findIdx("easting", "est", "x", "e");
  const iN = findIdx("northing", "nord", "y", "n");
  const hasHeader = iLat >= 0 || iLng >= 0 || iE >= 0 || iN >= 0;
  const body = hasHeader ? rows.slice(1) : rows;
  const pts: { lat: number; lng: number }[] = [];
  for (const r of body) {
    const c = r.split(sep).map((v) => parseFloat(v.replace(",", ".")));
    let lat: number, lng: number;
    if (iLat >= 0 && iLng >= 0) { lat = c[iLat]; lng = c[iLng]; }
    else if (iE >= 0 && iN >= 0) {
      const ll = utmToLatLng(c[iE], c[iN], utmZone ?? 29, "N"); lat = ll.lat; lng = ll.lng;
    } else {
      // sans en-tête : on tente [lat, lng] puis [E, N]
      const nums = c.filter((v) => Number.isFinite(v));
      if (nums.length < 2) continue;
      if (Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) <= 180) { lat = nums[0]; lng = nums[1]; }
      else { const ll = utmToLatLng(nums[0], nums[1], utmZone ?? 29, "N"); lat = ll.lat; lng = ll.lng; }
    }
    if (valid(lat, lng)) pts.push({ lat, lng });
  }
  if (pts.length < 3) warnings.push("Moins de 3 points valides détectés — vérifiez les colonnes (lat/lon ou E/N).");
  return { kind: "geometry", format: "CSV/TXT", rings: pts.length >= 3 ? [{ points: closeRing(pts) }] : [], warnings };
}

// ---------- Dispatcher ----------
export async function parseSurveyFile(file: File, utmZone?: number): Promise<ParseResult> {
  const ext = extOf(file.name);
  if (!isGeometryFile(file.name)) {
    return {
      kind: "attachment", format: ext.toUpperCase(), rings: [],
      warnings: [`Format ${ext.toUpperCase()} archivé tel quel : la géométrie doit être exportée en DXF, GPX, KML, GeoJSON ou CSV pour être traitée automatiquement.`],
    };
  }
  const text = await file.text();
  if (ext === "dxf") return parseDxf(text, utmZone);
  if (ext === "gpx") return parseGpx(text);
  if (ext === "kml") return parseKml(text);
  if (ext === "geojson" || ext === "json") return parseGeoJson(text);
  return parseCsv(text, utmZone);
}

export function guessZone(rings: ParsedRing[]): number | null {
  const p = rings[0]?.points[0];
  return p ? zoneFromLng(p.lng) : null;
}
