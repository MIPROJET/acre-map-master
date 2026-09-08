import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { downloadBlob } from "@/lib/export";
import { formatArea } from "@/lib/format";
import { syncAll } from "@/lib/sync";
import type { Domaine, Lot, Measurement, Parcelle, SP } from "@/lib/types";

export const Route = createFileRoute("/app/stats")({
  component: StatsPage,
  head: () => ({
    meta: [
      { title: "Suivi quotidien — AcreMap" },
      { name: "description", content: "Compteurs quotidiens : parcelles, relevés, lots, mesures, validations et archivages." },
      { property: "og:title", content: "Suivi quotidien — AcreMap" },
      { property: "og:description", content: "Tableau de contrôle administrateur : volumes, validations et archivages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Snapshot {
  sps: SP[]; doms: Domaine[]; parcs: Parcelle[]; mes: Measurement[]; lots: Lot[]; plans: number;
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function StatsPage() {
  const [s, setS] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!isBrowser()) return;
    const d = db();
    await d.open();
    const [sps, doms, parcs, mes, lots, plans] = await Promise.all([
      d.sps.toArray(), d.domaines.toArray(), d.parcelles.toArray(),
      d.measurements.toArray(), d.lots.toArray(), d.plans.count(),
    ]);
    setS({ sps, doms, parcs, mes, lots, plans });
  };

  useEffect(() => { void load(); }, []);

  const refresh = async () => {
    setBusy(true);
    try { await syncAll(); } catch { /* hors ligne : on garde le cache local */ }
    await load();
    setBusy(false);
  };

  if (!s) return <div className="p-6 text-sm text-muted-foreground">Chargement des compteurs…</div>;

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = today.getTime();
  const since = (n: number) => n >= t;

  const cards: { label: string; value: number; today: number; tone?: string }[] = [
    { label: "Parcelles", value: s.parcs.filter((p) => !p.archivedAt).length, today: s.parcs.filter((p) => since(p.createdAt)).length },
    { label: "Relevés", value: s.mes.length, today: s.mes.filter((m) => since(m.createdAt)).length },
    { label: "Lots", value: s.lots.length, today: 0 },
    { label: "Mesures en brouillon", value: s.mes.filter((m) => m.status === "draft").length, today: 0, tone: "warn" },
    { label: "À valider", value: s.mes.filter((m) => m.status === "submitted").length, today: 0, tone: "warn" },
    { label: "Validations", value: s.mes.filter((m) => m.status === "validated").length, today: s.mes.filter((m) => m.validatedAt && since(m.validatedAt)).length, tone: "primary" },
    { label: "Archivages", value: s.mes.filter((m) => m.status === "archived").length + s.parcs.filter((p) => p.archivedAt).length, today: 0 },
    { label: "Plans de morcellement", value: s.plans, today: 0 },
  ];

  const exportCsv = () => {
    const head = [
      "district", "region", "departement", "sous_prefecture", "commune_domaine",
      "parcelle_code", "proprietaire", "superficie_ha", "lots", "mesures", "validations", "archivee",
    ];
    const rows = s.parcs
      .map((p) => {
        const dom = s.doms.find((d) => d.id === p.domaineId);
        const sp = dom ? s.sps.find((x) => x.id === dom.spId) : undefined;
        const mes = s.mes.filter((m) => m.parcelleId === p.id);
        const best = mes.sort((a, b) => b.createdAt - a.createdAt)[0];
        return [
          sp?.district ?? "", sp?.region ?? "", sp?.departement ?? "", sp?.name ?? "", dom?.name ?? "",
          p.code, p.ownerName,
          best ? (best.areaM2 / 10000).toFixed(4) : "",
          s.lots.filter((l) => l.parcelleId === p.id).length,
          mes.length,
          mes.filter((m) => m.status === "validated").length,
          p.archivedAt ? "oui" : "non",
        ];
      })
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3])));
    const csv = [head, ...rows].map((r) => r.map(csvCell).join(";")).join("\n");
    downloadBlob("\uFEFF" + csv, `acremap-parcelles-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv;charset=utf-8");
  };

  const totalArea = s.mes.filter((m) => m.status === "validated").reduce((a, m) => a + m.areaM2, 0);

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Suivi quotidien</h1>
          <p className="text-sm text-muted-foreground">Compteurs de production à vérifier chaque jour.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={busy}
            className="px-4 py-2.5 rounded-lg border text-sm font-semibold disabled:opacity-50">
            {busy ? "Actualisation…" : "↻ Actualiser"}
          </button>
          <button onClick={exportCsv}
            className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-card">
            ⭳ Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="bg-card rounded-xl p-4 shadow-card">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <div className={`text-2xl font-bold ${c.tone === "warn" ? "text-warn" : c.tone === "primary" ? "text-primary" : ""}`}>{c.value}</div>
            {c.today > 0 && <div className="text-[11px] text-primary mt-0.5">+{c.today} aujourd'hui</div>}
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl p-4 shadow-card text-sm">
        Superficie validée cumulée : <span className="font-bold text-primary">{formatArea(totalArea, "ha")}</span>
      </div>

      <div className="bg-card rounded-xl shadow-card overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-xs text-muted-foreground border-b">
            <tr>
              <th className="text-left p-3">District</th>
              <th className="text-left p-3">Région</th>
              <th className="text-left p-3">Sous-préfecture</th>
              <th className="text-right p-3">Parcelles</th>
              <th className="text-right p-3">Relevés</th>
              <th className="text-right p-3">Lots</th>
              <th className="text-right p-3">Validations</th>
            </tr>
          </thead>
          <tbody>
            {s.sps.map((sp) => {
              const doms = s.doms.filter((d) => d.spId === sp.id);
              const parcs = s.parcs.filter((p) => doms.some((d) => d.id === p.domaineId));
              const ids = new Set(parcs.map((p) => p.id));
              const mes = s.mes.filter((m) => m.parcelleId && ids.has(m.parcelleId));
              return (
                <tr key={sp.id} className="border-b last:border-0">
                  <td className="p-3">{sp.district}</td>
                  <td className="p-3">{sp.region}</td>
                  <td className="p-3 font-medium">{sp.name}</td>
                  <td className="p-3 text-right">{parcs.length}</td>
                  <td className="p-3 text-right">{mes.length}</td>
                  <td className="p-3 text-right">{s.lots.filter((l) => ids.has(l.parcelleId)).length}</td>
                  <td className="p-3 text-right">{mes.filter((m) => m.status === "validated").length}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
