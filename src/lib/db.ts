import Dexie, { type Table } from "dexie";
import type { Domaine, Lot, Measurement, MorcPlan, Parcelle, SP, User } from "./types";

export interface OutboxEntry {
  id: string;            // entity id (uuid)
  table: "sps" | "domaines" | "parcelles" | "measurements" | "lots" | "morcellement_plans";
  op: "upsert" | "delete";
  payload?: unknown;     // serialized row (for upsert)
  ts: number;
  attempts: number;
  lastError?: string;
}

/** Fichier importé hors ligne : contenu conservé localement en attendant le réseau. */
export interface QueuedImport {
  id: string;
  name: string;
  parcelleId?: string | null;
  blob: Blob;
  ts: number;
}

class AcreDB extends Dexie {
  users!: Table<User, string>;
  sps!: Table<SP, string>;
  domaines!: Table<Domaine, string>;
  parcelles!: Table<Parcelle, string>;
  measurements!: Table<Measurement, string>;
  lots!: Table<Lot, string>;
  meta!: Table<{ key: string; value: unknown }, string>;
  outbox!: Table<OutboxEntry, string>;
  importQueue!: Table<QueuedImport, string>;
  plans!: Table<MorcPlan, string>;

  constructor() {
    super("acremap");
    this.version(1).stores({
      users: "id, username, role",
      sps: "id, code",
      domaines: "id, code, spId",
      parcelles: "id, code, domaineId",
      measurements: "id, status, parcelleId, createdBy, createdAt",
      lots: "id, parcelleId, code",
      meta: "key",
    });
    this.version(2).stores({
      users: "id, username, role",
      sps: "id, code, district, region, departement",
      domaines: "id, code, spId",
      parcelles: "id, code, domaineId, ownerName",
      measurements: "id, status, parcelleId, createdBy, createdAt",
      lots: "id, parcelleId, code",
      meta: "key",
    });
    this.version(3).stores({
      users: "id, username, role",
      sps: "id, code, district, region, departement",
      domaines: "id, code, spId",
      parcelles: "id, code, domaineId, ownerName",
      measurements: "id, status, parcelleId, createdBy, createdAt",
      lots: "id, parcelleId, measurementId, code",
      meta: "key",
    });
    // v4 — outbox table for offline sync
    this.version(4).stores({
      users: "id, username, role",
      sps: "id, code, district, region, departement",
      domaines: "id, code, spId",
      parcelles: "id, code, domaineId, ownerName",
      measurements: "id, status, parcelleId, createdBy, createdAt",
      lots: "id, parcelleId, measurementId, code",
      meta: "key",
      outbox: "[table+id], table, ts",
    });
    // v5 — file d'attente des fichiers importés hors ligne (contenu inclus)
    this.version(5).stores({
      users: "id, username, role",
      sps: "id, code, district, region, departement",
      domaines: "id, code, spId",
      parcelles: "id, code, domaineId, ownerName",
      measurements: "id, status, parcelleId, createdBy, createdAt",
      lots: "id, parcelleId, measurementId, code",
      meta: "key",
      outbox: "[table+id], table, ts",
      importQueue: "id, ts",
    });
    // v6 — plans de morcellement (configuration + scores) synchronisés
    this.version(6).stores({
      users: "id, username, role",
      sps: "id, code, district, region, departement",
      domaines: "id, code, spId",
      parcelles: "id, code, domaineId, ownerName",
      measurements: "id, status, parcelleId, createdBy, createdAt",
      lots: "id, parcelleId, measurementId, planId, code",
      meta: "key",
      outbox: "[table+id], table, ts",
      importQueue: "id, ts",
      plans: "id, parcelleId, createdAt",
    });
  }
}

let _db: AcreDB | null = null;
export function db(): AcreDB {
  if (typeof window === "undefined") throw new Error("DB only available in browser");
  if (!_db) _db = new AcreDB();
  return _db;
}

export const isBrowser = () => typeof window !== "undefined";
