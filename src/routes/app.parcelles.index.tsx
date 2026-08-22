import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { formatArea, formatDate } from "@/lib/format";
import { StatusBadge } from "./app.index";
import type { MeasurementStatus } from "@/lib/types";

export const Route = createFileRoute("/app/parcelles/")({
  component: ParcellesHub,
  head: () => ({ meta: [{ title: "Parcelles & mesures — AcreMap" }] }),
});

type Tab = "all" | "draft" | "submitted" | "validated";

function ParcellesHub() {
  const [tab, setTab] = useState<Tab>("all");
  const [dbError, setDbError] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    try {
      const d = db();
      await d.open();
      const [mes, parcs, doms, sps] = await Promise.all([
        d.measurements.toArray(), d.parcelles.toArray(), d.domaines.toArray(), d.sps.toArray(),
      ]);
      setDbError(null);
      return { mes: mes.sort((a, b) => b.createdAt - a.createdAt), parcs, doms, sps };
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      setDbError(`${err.name ?? "Erreur"}: ${err.message ?? String(e)}`);
      return null;
    }
  }, []);

  const counters = {
    all: data?.mes.length ?? 0,
    draft: data?.mes.filter((m) => m.status === "draft").length ?? 0,
    submitted: data?.mes.filter((m) => m.status === "submitted").length ?? 0,
    validated: data?.mes.filter((m) => m.status === "validated").length ?? 0,
  };

  const filtered = (data?.mes ?? []).filter((m) =>
    tab === "all" ? true : m.status === (tab as MeasurementStatus)
  );

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Parcelles & Mesures</h1>
          <p className="text-sm text-muted-foreground">
            Centralise toutes les parcelles, levés et morcellements.
          </p>
        </div>
        <Link to="/app/parcelles/new"
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-card">
          + Nouveau levé
        </Link>
      </div>

      {dbError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm">
          <div className="font-semibold text-destructive">⚠ Base locale inaccessible — vos enregistrements ne peuvent pas être lus.</div>
          <div className="text-xs mt-1 text-muted-foreground break-all">{dbError}</div>
          <Link to="/app/debug" className="inline-block mt-2 text-xs text-primary underline">Ouvrir le diagnostic →</Link>
        </div>
      )}

      {data === undefined && !dbError && (
        <div className="bg-card rounded-xl p-6 text-center text-sm text-muted-foreground shadow-card">Chargement de la base locale…</div>
      )}



      <div className="flex flex-wrap gap-1.5 border-b">
        <TabBtn active={tab === "all"} onClick={() => setTab("all")} label="Toutes" count={counters.all} />
        <TabBtn active={tab === "draft"} onClick={() => setTab("draft")} label="Brouillons" count={counters.draft} />
        <TabBtn active={tab === "submitted"} onClick={() => setTab("submitted")} label="À valider" count={counters.submitted} tone="warn" />
        <TabBtn active={tab === "validated"} onClick={() => setTab("validated")} label="Validées" count={counters.validated} tone="primary" />
      </div>

      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="bg-card rounded-xl p-10 text-center text-sm text-muted-foreground shadow-card">
            {tab === "all" ? "Aucune mesure pour le moment." : "Rien dans cette catégorie."}
            {tab === "all" && (
              <div className="mt-3">
                <Link to="/app/parcelles/new" className="text-primary underline text-sm">Démarrer un nouveau levé</Link>
              </div>
            )}
          </div>
        )}
        {filtered.map((m) => {
          const parc = data!.parcs.find((p) => p.id === m.parcelleId);
          const dom = parc ? data!.doms.find((x) => x.id === parc.domaineId) : null;
          const sp = dom ? data!.sps.find((x) => x.id === dom.spId) : null;
          return (
            <Link key={m.id} to="/app/parcelles/$id" params={{ id: m.id }}
              className="block bg-card rounded-xl p-4 shadow-card hover:shadow-elevated transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex gap-3 flex-1">
                  {parc?.parcellePhoto && (
                    <img src={parc.parcellePhoto} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{parc?.code ?? `Mesure ${m.id.slice(0, 6)}`}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {parc ? parc.ownerName : "Sans parcelle liée"}
                      {sp && ` · ${sp.name} (${sp.departement})`}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDate(m.createdAt)} · {m.points.length} points · {(m.perimeterM).toFixed(0)} m
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-primary">{formatArea(m.areaM2, m.unit)}</div>
                  <div className="mt-1"><StatusBadge status={m.status} /></div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, label, count, tone }: { active: boolean; onClick: () => void; label: string; count: number; tone?: "warn" | "primary" }) {
  return (
    <button onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
        active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}>
      {label}
      <span className={`ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full ${
        tone === "warn" ? "bg-warn/15 text-warn" :
        tone === "primary" ? "bg-primary/15 text-primary" :
        "bg-muted text-muted-foreground"
      }`}>{count}</span>
    </button>
  );
}
