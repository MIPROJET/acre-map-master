// Cloud sync — IndexedDB → Supabase, offline-safe.
// Strategy: every Dexie row is mirrored to Supabase on demand (idempotent upsert).
// Failures stay queued in the `outbox` table and are retried on `online` event.
import { supabase } from "@/integrations/supabase/client";
import { db, isBrowser, type OutboxEntry } from "./db";
import type { Domaine, Lot, Measurement, Parcelle, SP } from "./types";

type TableName = OutboxEntry["table"];

// ---- Row mappers (local shape → Supabase row) ----
function toIso(ts?: number | null): string | null {
  if (!ts && ts !== 0) return null;
  return new Date(ts).toISOString();
}

function mapSp(row: SP, userId: string | null) {
  return {
    id: row.id, code: row.code, name: row.name,
    district: row.district ?? null, region: row.region ?? null, departement: row.departement ?? null,
    notes: row.notes ?? null, created_by: userId,
    created_at: toIso(row.createdAt) ?? new Date().toISOString(),
  };
}
function mapDomaine(row: Domaine, userId: string | null) {
  return {
    id: row.id, code: row.code, name: row.name, sp_id: row.spId,
    description: row.description ?? null, notes: row.notes ?? null,
    created_by: userId, created_at: toIso(row.createdAt) ?? new Date().toISOString(),
  };
}
function mapParcelle(row: Parcelle, userId: string | null) {
  return {
    id: row.id, code: row.code, owner_name: row.ownerName,
    owner_phone: row.ownerPhone ?? null, domaine_id: row.domaineId,
    convention_date: toIso(row.conventionDate), declared_area: row.declaredArea ?? null,
    convention_status: row.conventionStatus ?? null,
    owner_photo: row.ownerPhoto ?? null, group_photo: row.groupPhoto ?? null,
    parcelle_photo: row.parcellePhoto ?? null,
    notes: row.notes ?? null, created_by: userId,
    created_at: toIso(row.createdAt) ?? new Date().toISOString(),
  };
}
function mapMeasurement(row: Measurement, userId: string | null) {
  return {
    id: row.id, parcelle_id: row.parcelleId ?? null, status: row.status,
    area_m2: row.areaM2, perimeter_m: row.perimeterM, unit: row.unit,
    points: row.points as unknown, trace: row.trace as unknown,
    device_profile: (row.deviceProfile ?? null) as unknown,
    qa: (row.qa ?? null) as unknown,
    notes: row.notes ?? null,
    validated_by: row.validatedBy ?? null, validated_at: toIso(row.validatedAt),
    created_by: userId, created_at: toIso(row.createdAt) ?? new Date().toISOString(),
  };
}
function mapLot(row: Lot, userId: string | null) {
  return {
    id: row.id, parcelle_id: row.parcelleId, measurement_id: row.measurementId,
    code: row.code, polygon: row.polygon as unknown, bornes: (row.bornes ?? []) as unknown,
    area_m2: row.areaM2, is_reserve: row.isReserve ?? false,
    assignee_name: row.assigneeName ?? null, assigned_at: toIso(row.assignedAt),
    created_by: userId,
  };
}

async function pushUpsert(table: TableName, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from(table).upsert(payload as never, { onConflict: "id" });
  if (error) throw error;
}
async function pushDelete(table: TableName, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

async function currentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

// ---- Outbox helpers ----
export async function enqueue(table: TableName, op: "upsert" | "delete", id: string, payload?: unknown) {
  if (!isBrowser()) return;
  await db().outbox.put({ table, id, op, payload, ts: Date.now(), attempts: 0 });
}

export async function outboxCount(): Promise<number> {
  if (!isBrowser()) return 0;
  return db().outbox.count();
}

export async function flushOutbox(onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: number }> {
  if (!isBrowser() || !navigator.onLine) return { ok: 0, failed: 0 };
  const items = await db().outbox.toArray();
  let ok = 0, failed = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try {
      if (it.op === "upsert") await pushUpsert(it.table, it.payload as Record<string, unknown>);
      else await pushDelete(it.table, it.id);
      await db().outbox.delete([it.table, it.id] as never);
      ok++;
    } catch (e) {
      failed++;
      await db().outbox.update([it.table, it.id] as never, {
        attempts: (it.attempts ?? 0) + 1,
        lastError: (e as Error).message ?? String(e),
      });
    }
    onProgress?.(i + 1, items.length);
  }
  return { ok, failed };
}

// ---- Public API: write-through helpers used by code that wants cloud sync now.
// Existing code that writes directly to Dexie still works — call enqueueFromLocal
// to schedule the cloud push manually, or run migrateLocalToCloud once.
export async function syncEntity(table: TableName, id: string): Promise<void> {
  const userId = await currentUserId();
  const local = db();
  let payload: Record<string, unknown> | null = null;
  if (table === "sps") { const r = await local.sps.get(id); if (r) payload = mapSp(r, userId); }
  else if (table === "domaines") { const r = await local.domaines.get(id); if (r) payload = mapDomaine(r, userId); }
  else if (table === "parcelles") { const r = await local.parcelles.get(id); if (r) payload = mapParcelle(r, userId); }
  else if (table === "measurements") { const r = await local.measurements.get(id); if (r) payload = mapMeasurement(r, userId); }
  else if (table === "lots") { const r = await local.lots.get(id); if (r) payload = mapLot(r, userId); }
  if (!payload) return;
  if (navigator.onLine) {
    try { await pushUpsert(table, payload); return; }
    catch (e) { await enqueue(table, "upsert", id, payload); throw e; }
  }
  await enqueue(table, "upsert", id, payload);
}

// ---- Full migration from local IndexedDB to Supabase ----
export interface MigrationProgress {
  table: TableName | "done";
  done: number;
  total: number;
  ok: number;
  failed: number;
}

export async function migrateLocalToCloud(onProgress: (p: MigrationProgress) => void): Promise<{ ok: number; failed: number; perTable: Record<string, { ok: number; failed: number }> }> {
  const userId = await currentUserId();
  const local = db();
  const tables: Array<{
    name: TableName;
    rows: () => Promise<unknown[]>;
    map: (r: unknown) => Record<string, unknown>;
  }> = [
    { name: "sps", rows: () => local.sps.toArray(), map: (r) => mapSp(r as SP, userId) },
    { name: "domaines", rows: () => local.domaines.toArray(), map: (r) => mapDomaine(r as Domaine, userId) },
    { name: "parcelles", rows: () => local.parcelles.toArray(), map: (r) => mapParcelle(r as Parcelle, userId) },
    { name: "measurements", rows: () => local.measurements.toArray(), map: (r) => mapMeasurement(r as Measurement, userId) },
    { name: "lots", rows: () => local.lots.toArray(), map: (r) => mapLot(r as Lot, userId) },
  ];
  const perTable: Record<string, { ok: number; failed: number }> = {};
  let totalOk = 0, totalFailed = 0;
  for (const t of tables) {
    const rows = await t.rows();
    perTable[t.name] = { ok: 0, failed: 0 };
    for (let i = 0; i < rows.length; i++) {
      const payload = t.map(rows[i]);
      try {
        await pushUpsert(t.name, payload);
        perTable[t.name].ok++; totalOk++;
      } catch (e) {
        perTable[t.name].failed++; totalFailed++;
        await enqueue(t.name, "upsert", (payload.id as string), payload).catch(() => {});
        // store error for surfacing
        console.error(`[migrate] ${t.name} ${payload.id} →`, (e as Error).message);
      }
      onProgress({ table: t.name, done: i + 1, total: rows.length, ok: totalOk, failed: totalFailed });
    }
  }
  onProgress({ table: "done", done: totalOk + totalFailed, total: totalOk + totalFailed, ok: totalOk, failed: totalFailed });
  return { ok: totalOk, failed: totalFailed, perTable };
}

// ---- Lecture depuis Supabase → cache local IndexedDB (hors ligne) ----
function ts(v: string | null | undefined): number {
  return v ? new Date(v).getTime() : Date.now();
}

export interface PullResult { total: number; perTable: Record<string, number> }

export async function pullFromCloud(): Promise<PullResult> {
  if (!isBrowser()) return { total: 0, perTable: {} };
  const local = db();
  const perTable: Record<string, number> = {};
  let total = 0;

  const spsRes = await supabase.from("sps").select("*").limit(1000);
  if (spsRes.data) {
    const rows: SP[] = spsRes.data.map((r) => ({
      id: r.id, code: r.code, name: r.name,
      district: r.district ?? "", region: r.region ?? "", departement: r.departement ?? "",
      notes: r.notes ?? undefined, createdAt: ts(r.created_at),
    }));
    await local.sps.bulkPut(rows);
    perTable.sps = rows.length; total += rows.length;
  }

  const domRes = await supabase.from("domaines").select("*").limit(1000);
  if (domRes.data) {
    const rows: Domaine[] = domRes.data.map((r) => ({
      id: r.id, code: r.code, name: r.name, spId: r.sp_id,
      description: r.description ?? undefined, notes: r.notes ?? undefined, createdAt: ts(r.created_at),
    }));
    await local.domaines.bulkPut(rows);
    perTable.domaines = rows.length; total += rows.length;
  }

  const parcRes = await supabase.from("parcelles").select("*").limit(1000);
  if (parcRes.data) {
    const rows: Parcelle[] = parcRes.data.map((r) => ({
      id: r.id, code: r.code, ownerName: r.owner_name ?? "", ownerPhone: r.owner_phone ?? undefined,
      domaineId: r.domaine_id, conventionDate: ts(r.convention_date),
      declaredArea: r.declared_area ?? undefined,
      conventionStatus: (r.convention_status ?? "EN_COURS") as Parcelle["conventionStatus"],
      ownerPhoto: r.owner_photo ?? undefined, groupPhoto: r.group_photo ?? undefined,
      parcellePhoto: r.parcelle_photo ?? undefined,
      notes: r.notes ?? undefined, createdAt: ts(r.created_at),
    }));
    await local.parcelles.bulkPut(rows);
    perTable.parcelles = rows.length; total += rows.length;
  }

  const mRes = await supabase.from("measurements").select("*").limit(1000);
  if (mRes.data) {
    const rows: Measurement[] = mRes.data.map((r) => ({
      id: r.id, parcelleId: r.parcelle_id ?? undefined,
      createdBy: r.created_by ?? "", createdAt: ts(r.created_at),
      status: r.status as Measurement["status"],
      validatedBy: r.validated_by ?? undefined,
      validatedAt: r.validated_at ? ts(r.validated_at) : undefined,
      points: (r.points ?? []) as Measurement["points"],
      trace: (r.trace ?? []) as Measurement["trace"],
      areaM2: Number(r.area_m2 ?? 0), perimeterM: Number(r.perimeter_m ?? 0),
      unit: (r.unit ?? "ha") as Measurement["unit"],
      deviceProfile: (r.device_profile ?? undefined) as Measurement["deviceProfile"],
      qa: (r.qa ?? undefined) as Measurement["qa"],
      notes: r.notes ?? undefined,
    }));
    await local.measurements.bulkPut(rows);
    perTable.measurements = rows.length; total += rows.length;
  }

  const lotRes = await supabase.from("lots").select("*").limit(2000);
  if (lotRes.data) {
    const rows: Lot[] = lotRes.data.map((r) => ({
      id: r.id, parcelleId: r.parcelle_id, measurementId: r.measurement_id ?? "",
      code: r.code, polygon: (r.polygon ?? []) as Lot["polygon"],
      bornes: (r.bornes ?? []) as Lot["bornes"],
      areaM2: Number(r.area_m2 ?? 0), isReserve: r.is_reserve ?? false,
      assigneeName: r.assignee_name ?? undefined,
      assignedAt: r.assigned_at ? ts(r.assigned_at) : undefined,
    }));
    await local.lots.bulkPut(rows);
    perTable.lots = rows.length; total += rows.length;
  }

  return { total, perTable };
}

// ---- Auto-flush on reconnect ----
let _initialized = false;
export function initSync() {
  if (!isBrowser() || _initialized) return;
  _initialized = true;
  const handler = () => { void flushOutbox(); };
  window.addEventListener("online", handler);
  // also flush on first mount if already online and queue non-empty
  if (navigator.onLine) setTimeout(handler, 2000);
}
