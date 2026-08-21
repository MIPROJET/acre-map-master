// Conversion WGS84 <-> UTM (ellipsoïde GRS80/WGS84).
// Côte d'Ivoire : zones 29N et 30N (fuseau déduit automatiquement de la longitude).

const A = 6378137.0;
const F = 1 / 298.257223563;
const E2 = 2 * F - F * F;
const K0 = 0.9996;

export interface UtmPoint { easting: number; northing: number; zone: number; hemisphere: "N" | "S"; }

export function zoneFromLng(lng: number): number {
  return Math.floor((lng + 180) / 6) + 1;
}

export function latLngToUtm(lat: number, lng: number, forcedZone?: number): UtmPoint {
  const zone = forcedZone ?? zoneFromLng(lng);
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = (lat * Math.PI) / 180;
  const lambda = (lng * Math.PI) / 180;
  const ep2 = E2 / (1 - E2);
  const N = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2;
  const C = ep2 * Math.cos(phi) ** 2;
  const Aa = Math.cos(phi) * (lambda - lambda0);
  const M = A * (
    (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256) * phi
    - ((3 * E2) / 8 + (3 * E2 ** 2) / 32 + (45 * E2 ** 3) / 1024) * Math.sin(2 * phi)
    + ((15 * E2 ** 2) / 256 + (45 * E2 ** 3) / 1024) * Math.sin(4 * phi)
    - ((35 * E2 ** 3) / 3072) * Math.sin(6 * phi)
  );
  const easting = K0 * N * (Aa + ((1 - T + C) * Aa ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * Aa ** 5) / 120) + 500000;
  let northing = K0 * (M + N * Math.tan(phi) * ((Aa ** 2) / 2 + ((5 - T + 9 * C + 4 * C * C) * Aa ** 4) / 24
    + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * Aa ** 6) / 720));
  const hemisphere: "N" | "S" = lat >= 0 ? "N" : "S";
  if (lat < 0) northing += 10000000;
  return { easting, northing, zone, hemisphere };
}

export function utmToLatLng(easting: number, northing: number, zone: number, hemisphere: "N" | "S" = "N"): { lat: number; lng: number } {
  const x = easting - 500000;
  const y = hemisphere === "S" ? northing - 10000000 : northing;
  const ep2 = E2 / (1 - E2);
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const M = y / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));
  const phi1 = mu
    + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu)
    + ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu)
    + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu)
    + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(phi1) ** 2;
  const T1 = Math.tan(phi1) ** 2;
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2);
  const R1 = (A * (1 - E2)) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5;
  const D = x / (N1 * K0);
  const lat = phi1 - ((N1 * Math.tan(phi1)) / R1) * (
    (D ** 2) / 2
    - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24
    + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720
  );
  const lngRad = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6
    + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / Math.cos(phi1);
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  return { lat: (lat * 180) / Math.PI, lng: ((lambda0 + lngRad) * 180) / Math.PI };
}
