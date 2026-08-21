import Dexie, { type Table } from "dexie";
import type { Domaine, Lot, Measurement, Parcelle, SP, User } from "./types";

export interface OutboxEntry {
  id: string;            // entity id (uuid)
  table: "sps" | "domaines" | "parcelles" | "measurements" | "lots";
  op: "upsert" | "delete";
  payload?: unknown;     // serialized row (for upsert)
  ts: number;
  attempts: number;
  lastError?: string;
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
  }
}

let _db: AcreDB | null = null;
export function db(): AcreDB {
  if (typeof window === "undefined") throw new Error("DB only available in browser");
  if (!_db) _db = new AcreDB();
  return _db;
}

export const isBrowser = () => typeof window !== "undefined";
