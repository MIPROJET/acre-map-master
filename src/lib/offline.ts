// AcreMap — Mode hors ligne complet
// - Pré-chargement en arrière-plan des données de référence (Supabase → IndexedDB)
// - Pré-chargement des tuiles cartographiques de la zone de travail
// - Suivi de l'état réseau
import { db, isBrowser } from "./db";
import { CI_ADMIN } from "./ci-admin";
import { flushOutbox, pullFromCloud } from "./sync";

export interface OfflineStatus {
  online: boolean;
  lastPullAt: number | null;
  referenceReady: boolean;
  tilesCached: number;
}

const META_LAST_PULL = "offline.lastPullAt";
const META_REF = "offline.reference";

export function isOnline(): boolean {
  return isBrowser() ? navigator.onLine : true;
}

/** Stocke la liste administrative (districts/régions/départements/SP) en local. */
export async function cacheReferenceData(): Promise<void> {
  if (!isBrowser()) return;
  await db().meta.put({ key: META_REF, value: CI_ADMIN });
}

export async function getReferenceData() {
  if (!isBrowser()) return CI_ADMIN;
  const row = await db().meta.get(META_REF);
  return (row?.value as typeof CI_ADMIN) ?? CI_ADMIN;
}

export async function lastPullAt(): Promise<number | null> {
  if (!isBrowser()) return null;
  const row = await db().meta.get(META_LAST_PULL);
  return (row?.value as number) ?? null;
}

/** Vide les files d'attente puis synchronise le cache local. Silencieuse hors ligne. */
export async function warmOfflineCache(): Promise<{ pulled: number } | null> {
  if (!isBrowser()) return null;
  await cacheReferenceData();
  if (!navigator.onLine) return null;
  try {
    await flushOutbox();
    const res = await pullFromCloud();
    await db().meta.put({ key: META_LAST_PULL, value: Date.now() });
    return { pulled: res.total };
  } catch {
    return null;
  }
}


// ---- Tuiles carto ----
function lngToX(lng: number, z: number) { return Math.floor(((lng + 180) / 360) * 2 ** z); }
function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

export function tileUrlsForBBox(
  bbox: { north: number; south: number; east: number; west: number },
  zooms: number[] = [13, 14, 15, 16, 17],
  template = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
): string[] {
  const urls: string[] = [];
  for (const z of zooms) {
    const x0 = lngToX(bbox.west, z), x1 = lngToX(bbox.east, z);
    const y0 = latToY(bbox.north, z), y1 = latToY(bbox.south, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        urls.push(template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y)));
        if (urls.length > 4000) return urls;
      }
    }
  }
  return urls;
}

/** Demande au service worker de mettre en cache les tuiles autour d'un point (rayon en km). */
export async function prefetchTilesAround(lat: number, lng: number, radiusKm = 3): Promise<number> {
  if (!isBrowser() || !("serviceWorker" in navigator)) return 0;
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  const urls = tileUrlsForBBox({ north: lat + dLat, south: lat - dLat, east: lng + dLng, west: lng - dLng });
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  reg?.active?.postMessage({ type: "prefetch-tiles", urls });
  return urls.length;
}

/** Empêche la mise en veille pendant un levé (précision et continuité du tracé). */
export async function keepScreenAwake(): Promise<{ release: () => void }> {
  type WakeLock = { release: () => Promise<void> };
  let sentinel: WakeLock | null = null;
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    sentinel = (await nav.wakeLock?.request("screen")) ?? null;
  } catch { sentinel = null; }
  return { release: () => { void sentinel?.release().catch(() => {}); } };
}

/** Lance la mise en cache en arrière-plan et la relance à chaque reconnexion. */
let _started = false;
export function startOfflineWarmup() {
  if (!isBrowser() || _started) return;
  _started = true;
  const run = () => { void warmOfflineCache(); };
  setTimeout(run, 1500);
  window.addEventListener("online", run);
}
