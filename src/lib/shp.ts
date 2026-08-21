// Shapefile (.zip) builder via shp-write — works fully in browser.
import shpwrite from "shp-write";
import type { Lot, Measurement, Parcelle } from "./types";

export async function buildShapefileZip(args: {
  measurement: Measurement;
  parcelle?: Parcelle | null;
  lots?: Lot[];
}): Promise<Blob> {
  const { measurement: m, parcelle, lots = [] } = args;
  const features: any[] = [];
  if (m.points.length >= 3) {
    features.push({
      type: "Feature",
      properties: { kind: "parcelle", code: parcelle?.code ?? "PARC", owner: parcelle?.ownerName ?? "" },
      geometry: { type: "Polygon", coordinates: [[...m.points, m.points[0]].map((p) => [p.lng, p.lat])] },
    });
  }
  for (const l of lots) {
    features.push({
      type: "Feature",
      properties: { kind: "lot", code: l.code, area_m2: Math.round(l.areaM2), assignee: l.assigneeName ?? "" },
      geometry: { type: "Polygon", coordinates: [[...l.polygon, l.polygon[0]].map((p) => [p.lng, p.lat])] },
    });
  }
  const fc = { type: "FeatureCollection", features };
  const arrayBuf = await (shpwrite as any).zip(fc, {
    outputType: "blob",
    compression: "DEFLATE",
    types: { polygon: "polygons" },
  });
  if (arrayBuf instanceof Blob) return arrayBuf;
  return new Blob([arrayBuf], { type: "application/zip" });
}
