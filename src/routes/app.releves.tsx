import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { formatArea, formatDate } from "@/lib/format";
import { useAuth, hasRole } from "@/lib/auth";
import { syncAll } from "@/lib/sync";
import { StatusBadge } from "./app.index";

export const Route = createFileRoute("/app/releves")({
  component: RelevesPage,
  head: () => ({
    meta: [
      { title: "Historique des relevés — AcreMap" },
      { name: "description", content: "Historique administratif des relevés GPS, parcelles et statuts de validation AcreMap." },
      { property: "og:title", content: "Historique des relevés — AcreMap" },
      { property: "og:description", content: "Consulter et synchroniser l'historique des relevés GPS AcreMap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Filter = "all" | "draft" | "submitted" | "validated" | "archived";

function RelevesPage() {
  const user = useAuth((state) => state.user);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    const local = db();
    const [measurements, parcelles, domaines, sps] = await Promise.all([
      local.measurements.toArray(), local.parcelles.toArray(), local.domaines.toArray(), local.sps.toArray(),
    ]);
    return { measurements, parcelles, domaines, sps };
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.measurements
      .map((measurement) => {
        const parcelle = data.parcelles.find((item) => item.id === measurement.parcelleId);
        const domaine = parcelle ? data.domaines.find((item) => item.id === parcelle.domaineId) : undefined;
        const sp = domaine ? data.sps.find((item) => item.id === domaine.spId) : undefined;
        const search = `${measurement.id} ${measurement.status} ${parcelle?.code ?? ""} ${parcelle?.ownerName ?? ""} ${domaine?.name ?? ""} ${sp?.name ?? ""}`.toLowerCase();
        return { measurement, parcelle, domaine, sp, search };
      })
      .filter((row) => filter === "all" || row.measurement.status === filter)
      .filter((row) => !needle || row.search.includes(needle))
      .sort((a, b) => b.measurement.createdAt - a.measurement.createdAt);
  }, [data, filter, query]);

  if (!hasRole(user, "admin")) {
    return <div className="p-8 text-center text-muted-foreground">Réservé à l'administrateur.</div>;
  }

  async function refresh() {
    setSyncing(true);
    setMessage(null);
    try {
      const result = await syncAll();
      setMessage(result.failed
        ? `${result.pulled} élément(s) reçus ; ${result.failed} opération(s) restent en attente.`
        : `Historique à jour : ${result.pulled} élément(s) reçus du cloud.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rafraîchissement impossible.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-4 pb-24">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Relevés — historique</h1>
          <p className="text-sm text-muted-foreground">Tous les relevés terrain et importés, centralisés depuis AcreMap.</p>
        </div>
        <button onClick={() => void refresh()} disabled={syncing}
          className="px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-50">
          {syncing ? "Rafraîchissement…" : "↻ Rafraîchir depuis le cloud"}
        </button>
      </header>

      {message && <div className="text-sm px-3 py-2 rounded-md bg-muted">{message}</div>}

      <div className="flex flex-col sm:flex-row gap-2">
        <input value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une parcelle, un propriétaire, une SP…"
          className="h-10 flex-1 px-3 rounded-md border bg-background text-sm" />
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}
          className="h-10 px-3 rounded-md border bg-background text-sm">
          <option value="all">Tous les statuts</option>
          <option value="draft">Brouillons</option>
          <option value="submitted">À valider</option>
          <option value="validated">Validés</option>
          <option value="archived">Archivés</option>
        </select>
      </div>

      <div className="grid gap-3">
        {data === undefined && <div className="p-8 text-center text-sm text-muted-foreground">Chargement…</div>}
        {data && rows.length === 0 && <div className="bg-card p-10 text-center text-sm text-muted-foreground shadow-card rounded-xl">Aucun relevé trouvé.</div>}
        {rows.map(({ measurement, parcelle, domaine, sp }) => (
          <Link key={measurement.id} to="/app/parcelles/$id" params={{ id: measurement.id }}
            className="block bg-card rounded-xl p-4 shadow-card hover:shadow-elevated transition-shadow">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold truncate">{parcelle?.code ?? `Relevé ${measurement.id.slice(0, 8)}`} · {parcelle?.ownerName ?? "Sans parcelle"}</div>
                <div className="text-xs text-muted-foreground mt-1 truncate">
                  {[sp?.district, sp?.region, sp?.departement, sp?.name, domaine?.name].filter(Boolean).join(" › ") || "Hiérarchie non renseignée"}
                </div>
                <div className="text-xs text-muted-foreground mt-1">{formatDate(measurement.createdAt)} · {measurement.points.length} points · {measurement.perimeterM.toFixed(0)} m</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-primary">{formatArea(measurement.areaM2, measurement.unit)}</div>
                <div className="mt-1"><StatusBadge status={measurement.status} /></div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}