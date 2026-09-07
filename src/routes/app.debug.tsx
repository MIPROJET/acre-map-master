import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { flushOutbox, migrateLocalToCloud, outboxCount, type MigrationProgress } from "@/lib/sync";

export const Route = createFileRoute("/app/debug")({
  component: DebugPage,
  head: () => ({ meta: [{ title: "Diagnostic base de données — AcreMap" }] }),
});

type Counts = {
  users: number; sps: number; domaines: number; parcelles: number;
  measurements: number; lots: number; outbox: number;
};

function DebugPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raw, setRaw] = useState<string>("");
  const [dbList, setDbList] = useState<string>("");

  // Migration state
  const [migRunning, setMigRunning] = useState(false);
  const [migProgress, setMigProgress] = useState<MigrationProgress | null>(null);
  const [migResult, setMigResult] = useState<{ ok: number; failed: number; perTable: Record<string, { ok: number; failed: number }> } | null>(null);

  // Outbox flush state
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load() {
    setError(null);
    if (!isBrowser()) return;
    try {
      const anyIDB = indexedDB as IDBFactory & { databases?: () => Promise<{ name?: string; version?: number }[]> };
      if (anyIDB.databases) {
        const dbs = await anyIDB.databases();
        setDbList(dbs.map((d) => `${d.name} (v${d.version})`).join(", ") || "(aucune)");
      } else setDbList("(API non supportée)");
      const d = db();
      await d.open();
      const [users, sps, domaines, parcelles, measurements, lots, outbox] = await Promise.all([
        d.users.count(), d.sps.count(), d.domaines.count(),
        d.parcelles.count(), d.measurements.count(), d.lots.count(), outboxCount(),
      ]);
      setCounts({ users, sps, domaines, parcelles, measurements, lots, outbox });
      const mes = await d.measurements.toArray();
      setRaw(JSON.stringify(mes.slice(0, 20).map((m) => ({
        id: m.id, status: m.status, createdAt: m.createdAt,
        parcelleId: m.parcelleId, areaM2: Math.round(m.areaM2),
        points: m.points?.length ?? 0,
      })), null, 2));
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      setError(`${err.name ?? "Erreur"}: ${err.message ?? String(e)}`);
    }
  }

  useEffect(() => { void load(); }, []);

  async function deleteDb() {
    if (!confirm("⚠️ Supprimer définitivement la base locale acremap ? Toutes les mesures locales seront perdues.")) return;
    try { (db() as unknown as { close: () => void }).close(); } catch { /* noop */ }
    await new Promise<void>((res, rej) => {
      const req = indexedDB.deleteDatabase("acremap");
      req.onsuccess = () => res();
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error("Base bloquée par un autre onglet."));
    });
    location.reload();
  }

  async function runMigration() {
    if (!navigator.onLine) { alert("Vous êtes hors-ligne. Reconnectez-vous d'abord."); return; }
    if (!confirm("Importer toutes les données locales (SP, domaines, parcelles, mesures, lots) vers Supabase ? Les enregistrements déjà présents seront mis à jour (upsert).")) return;
    setMigRunning(true);
    setMigResult(null);
    setMigProgress({ table: "sps", done: 0, total: 0, ok: 0, failed: 0 });
    try {
      const res = await migrateLocalToCloud((p) => setMigProgress(p));
      setMigResult(res);
    } catch (e) {
      alert("Échec migration: " + (e as Error).message);
    } finally {
      setMigRunning(false);
      void load();
    }
  }

  async function runFlush() {
    setSyncMsg("Synchronisation en cours…");
    const r = await flushOutbox();
    setSyncMsg(`File d'attente vidée : ${r.ok} OK, ${r.failed} échec(s).`);
    void load();
  }

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Diagnostic & synchronisation</h1>
      <p className="text-sm text-muted-foreground">
        Vos données sont d'abord stockées dans le navigateur (IndexedDB). Lancez la migration
        pour les envoyer vers le cloud Supabase. Toute écriture future en mode hors-ligne est
        mise en file d'attente et synchronisée automatiquement dès la reconnexion.
      </p>

      <div className="bg-card rounded-xl p-4 shadow-card space-y-2 text-sm">
        <div><span className="text-muted-foreground">Bases IndexedDB :</span> <code>{dbList || "…"}</code></div>
        <div><span className="text-muted-foreground">État réseau :</span> <b className={navigator.onLine ? "text-emerald-600" : "text-destructive"}>{navigator.onLine ? "En ligne" : "Hors-ligne"}</b></div>
        {error && (
          <div className="text-destructive bg-destructive/10 rounded-md p-2 text-xs"><b>Erreur :</b> {error}</div>
        )}
        {counts && (
          <ul className="grid grid-cols-2 gap-2">
            {Object.entries(counts).map(([k, v]) => (
              <li key={k} className="flex justify-between bg-muted/50 rounded px-2 py-1">
                <span className="capitalize">{k === "outbox" ? "file d'attente" : k}</span><b>{v}</b>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-card rounded-xl p-4 shadow-card space-y-3">
        <h2 className="font-semibold">Migration IndexedDB → Supabase</h2>
        <p className="text-xs text-muted-foreground">
          Importe une fois toutes les données déjà créées sur cet appareil dans le cloud.
          L'opération est idempotente : vous pouvez la relancer sans créer de doublons.
        </p>
        <div className="flex gap-2 flex-wrap">
          <button onClick={runMigration} disabled={migRunning}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">
            {migRunning ? "Migration en cours…" : "🚀 Lancer la migration"}
          </button>
          <button onClick={runFlush} disabled={migRunning}
            className="px-3 py-2 rounded-md border text-sm">
            🔄 Vider la file d'attente ({counts?.outbox ?? 0})
          </button>
          <button onClick={load} className="px-3 py-2 rounded-md border text-sm">↻ Recharger</button>
        </div>

        {migProgress && (
          <div className="mt-2 space-y-2">
            <div className="flex justify-between text-xs">
              <span>Table : <b className="capitalize">{migProgress.table}</b></span>
              <span>{migProgress.done} / {migProgress.total}</span>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary transition-all"
                style={{ width: migProgress.total ? `${(migProgress.done / migProgress.total) * 100}%` : "0%" }} />
            </div>
            <div className="text-xs text-muted-foreground">
              ✓ {migProgress.ok} importés · ✗ {migProgress.failed} échec(s)
            </div>
          </div>
        )}

        {migResult && (
          <div className="text-xs bg-muted/50 rounded p-3 space-y-1">
            <div><b>Terminé.</b> {migResult.ok} importés, {migResult.failed} en échec (renvoyés en file d'attente).</div>
            <ul className="grid grid-cols-2 gap-1">
              {Object.entries(migResult.perTable).map(([t, v]) => (
                <li key={t} className="flex justify-between bg-card rounded px-2 py-1">
                  <span className="capitalize">{t}</span>
                  <span>✓{v.ok} ✗{v.failed}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {syncMsg && <div className="text-xs text-muted-foreground">{syncMsg}</div>}
      </div>

      <div className="flex gap-2">
        <button onClick={deleteDb} className="px-3 py-2 rounded-md border border-destructive/40 text-destructive text-sm">
          🗑 Réinitialiser la base locale
        </button>
      </div>

      {raw && (
        <details className="bg-card rounded-xl p-4 shadow-card text-xs">
          <summary className="cursor-pointer font-semibold">20 dernières mesures (brut)</summary>
          <pre className="mt-2 overflow-auto">{raw}</pre>
        </details>
      )}
    </div>
  );
}
