// Export utilities — KML, GeoJSON, CSV (front-only).  PDF/Shapefile available later.
import type { Lot, Measurement, Parcelle } from "./types";

export function downloadBlob(content: string | Blob, filename: string, mime = "text/plain") {
  const blob = typeof content === "string" ? new Blob([content], { type: mime }) : content;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toGeoJSON(parcelle: Parcelle | null, m: Measurement, lots: Lot[] = []) {
  const features: any[] = [];
  if (m.points.length >= 3) {
    features.push({
      type: "Feature",
      properties: { code: parcelle?.code ?? "PARC", owner: parcelle?.ownerName, areaM2: m.areaM2, kind: "parcelle" },
      geometry: {
        type: "Polygon",
        coordinates: [[...m.points, m.points[0]].map((p) => [p.lng, p.lat])],
      },
    });
  }
  for (const l of lots) {
    features.push({
      type: "Feature",
      properties: { code: l.code, areaM2: l.areaM2, assignee: l.assigneeName, kind: "lot" },
      geometry: { type: "Polygon", coordinates: [[...l.polygon, l.polygon[0]].map((p) => [p.lng, p.lat])] },
    });
  }
  return { type: "FeatureCollection", features };
}

export function toKML(parcelle: Parcelle | null, m: Measurement, lots: Lot[] = []) {
  const polyKml = (pts: { lat: number; lng: number }[], name: string, color = "ff2A6DB5") => `
    <Placemark><name>${name}</name>
      <Style><LineStyle><color>${color}</color><width>2</width></LineStyle><PolyStyle><color>4d2A6DB5</color></PolyStyle></Style>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>
        ${[...pts, pts[0]].map((p) => `${p.lng},${p.lat},0`).join(" ")}
      </coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
  <name>${parcelle?.code ?? "AcreMap"} — ${parcelle?.ownerName ?? "Mesure"}</name>
  ${m.points.length >= 3 ? polyKml(m.points, parcelle?.code ?? "Parcelle") : ""}
  ${lots.map((l) => polyKml(l.polygon, l.code, "ff4CAF50")).join("\n")}
</Document></kml>`;
}

export function toCSV(m: Measurement) {
  const head = "index,lat,lng,accuracy_m,samples,auto,timestamp\n";
  const rows = m.points
    .map((p) => `${p.index},${p.lat.toFixed(7)},${p.lng.toFixed(7)},${p.accuracy.toFixed(2)},${p.samples},${p.auto},${new Date(p.ts).toISOString()}`)
    .join("\n");
  return head + rows;
}
