// Format helpers — area, distance, date
export function formatArea(m2: number, unit: "ha" | "m2" | "km2" = "ha"): string {
  if (unit === "m2") return `${m2.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} m²`;
  if (unit === "km2") return `${(m2 / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 4 })} km²`;
  return `${(m2 / 10_000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} ha`;
}
export function formatDistance(m: number): string {
  if (m < 1000) return `${m.toFixed(0)} m`;
  return `${(m / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} km`;
}
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
}
