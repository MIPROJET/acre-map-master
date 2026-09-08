import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { db, isBrowser } from "@/lib/db";
import { formatArea, formatDate } from "@/lib/format";
import type { Domaine, Lot, Measurement, Parcelle, SP } from "@/lib/types";

export const Route = createFileRoute("/app/terrain")({
  component: TerrainPage,
  head: () => ({
    meta: [
      { title: "Vue terrain — AcreMap" },
      { name: "description", content: "Vue agent : parcelles, relevés, lots et assignations avec accès direct à la parcelle." },
      { property: "og:title", content: "Vue terrain — AcreMap" },
      { property: "og:description", content: "Tout ce qu'un agent doit suivre sur le terrain, hors ligne comme en ligne." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function TerrainPage() {
  const user = useAuth((s) => s.user);
  const [data, setData] = useState<{ parcs: Parcelle[]; doms: Domaine[]; sps: SP[]; mes: Measurement[]; lots: Lot[] } | null>(null);
  const [mine, setMine] = useState(true);

  useEffect(() => {
    if (!isBrowser()) return;
    void (async () => {
      const d = db();
      await d.open();
      const [parcs, doms, sps, mes, lots] = await Promise.all([
        d.parcelles.toArray(), d.domaines.toArray(), d.sps.toArray(), d.measurements.toArray(), d.lots.toArray(),
      ]);
      setData({ parcs, doms, sps, mes, lots });
    })();
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const mes = mine && user ? data.mes.filter((m) => m.createdBy === user.id) : data.mes;
    const ids = new Set(mes.map((m) => m.parcelleId).filter(Boolean) as string[]);
    return data.parcs
      .filter((p) => !p.archivedAt && (!mine || ids.has(p.id)))
      .map((p) => {
        const dom = data.doms.find((d) => d.id === p.domaineId);
        const sp = dom ? data.sps.find((x) => x.id === dom.spId) : undefined;
        const pm = mes.filter((m) => m.parcelleId === p.id).sort((a, b) => b.createdAt - a.createdAt);
        const lots = data.lots.filter((l) => l.parcelleId === p.id);
        return { p, dom, sp, pm, lots, assigned: lots.filter((l) => l.assigneeName) };
      })
      .sort((a, b) => (b.pm[0]?.createdAt ?? 0) - (a.pm[0]?.createdAt ?? 0));
  }, [data, mine, user?.id]);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Vue terrain</h1>
        <p className="text-sm text-muted-foreground">
          {user?.fullName} — parcelles, relevés, lots et assignations.
        </p>
      </div>

      <div className="flex gap-1.5 border-b">
        <button onClick={() => setMine(true)}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${mine ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          Mes parcelles
        </button>
        <button onClick={() => setMine(false)}
          className={`px-3 py-2 text-sm font-medium border-b-2 ${!mine ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
          Toutes
        </button>
      </div>

      {!data && <div className="bg-card rounded-xl p-6 text-center text-sm text-muted-foreground shadow-card">Chargement…</div>}
      {data && rows.length === 0 && (
        <div className="bg-card rounded-xl p-10 text-center text-sm text-muted-foreground shadow-card">
          Aucune parcelle pour l'instant.
          <div className="mt-3"><Link to="/app/parcelles/new" className="text-primary underline">Démarrer un levé</Link></div>
        </div>
      )}

      <div className="grid gap-3">
        {rows.map(({ p, dom, sp, pm, lots, assigned }) => (
          <div key={p.id} className="bg-card rounded-xl p-4 shadow-card space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold truncate">{p.code} — {p.ownerName}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {sp ? `${sp.name} · ${sp.departement} · ${sp.region}` : "Localisation inconnue"}{dom ? ` · ${dom.name}` : ""}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-primary">{pm[0] ? formatArea(pm[0].areaM2, pm[0].unit) : "—"}</div>
                <div className="text-[11px] text-muted-foreground">{pm[0] ? formatDate(pm[0].createdAt) : ""}</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-muted/50 rounded-lg py-2"><div className="font-bold text-base">{pm.length}</div>relevés</div>
              <div className="bg-muted/50 rounded-lg py-2"><div className="font-bold text-base">{lots.length}</div>lots</div>
              <div className="bg-muted/50 rounded-lg py-2"><div className="font-bold text-base">{assigned.length}</div>assignés</div>
            </div>

            {assigned.length > 0 && (
              <div className="text-xs text-muted-foreground truncate">
                Assignations : {assigned.slice(0, 4).map((l) => `${l.code} → ${l.assigneeName}`).join(" · ")}
                {assigned.length > 4 ? " …" : ""}
              </div>
            )}

            <Link to="/app/morcellement" search={{ parcelle: p.id }}
              className="block text-center px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
              Rejoindre la parcelle
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
