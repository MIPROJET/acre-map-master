import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, isBrowser } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { formatArea, formatDate } from "@/lib/format";

export const Route = createFileRoute("/app/")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "Tableau de bord — AcreMap" }] }),
});

function Dashboard() {
  const user = useAuth((s) => s.user);
  const [dbError, setDbError] = useState<string | null>(null);
  const stats = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    try {
      const d = db();
      await d.open();
      const [sps, doms, parcs, mes] = await Promise.all([d.sps.count(), d.domaines.count(), d.parcelles.count(), d.measurements.toArray()]);
      const submitted = mes.filter((m) => m.status === "submitted").length;
      const validated = mes.filter((m) => m.status === "validated");
      const totalHa = validated.reduce((a, m) => a + m.areaM2, 0);
      setDbError(null);
      return { sps, doms, parcs, totalMes: mes.length, submitted, validatedHa: totalHa, recent: mes.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5) };
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      setDbError(`${err.name ?? "Erreur"}: ${err.message ?? String(e)}`);
      return null;
    }
  }, []);

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">Bonjour, {user?.fullName.split(" ")[0]}</h1>
        <p className="text-muted-foreground text-sm">Votre vue d'ensemble AgriCapital — {new Date().toLocaleDateString("fr-FR", { dateStyle: "full" })}</p>
      </div>

      {dbError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 text-sm">
          <div className="font-semibold text-destructive">⚠ Base locale inaccessible</div>
          <div className="text-xs mt-1 text-muted-foreground break-all">{dbError}</div>
          <Link to="/app/debug" className="inline-block mt-2 text-xs text-primary underline">Ouvrir le diagnostic →</Link>
        </div>
      )}



      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Stat label="Sous-Préfectures" value={stats?.sps ?? 0} hint="SP enregistrées" tone="primary" />
        <Stat label="Domaines" value={stats?.doms ?? 0} hint="DOM créés" tone="primary" />
        <Stat label="Parcelles" value={stats?.parcs ?? 0} hint="PARC référencées" tone="primary" />
        <Stat label="À valider" value={stats?.submitted ?? 0} hint="Mesures en attente" tone="warn" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Link to="/app/measure"
          className="lg:col-span-2 p-6 bg-gradient-to-br from-primary to-secondary text-primary-foreground rounded-2xl shadow-card hover:shadow-elevated transition-shadow group">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider opacity-80">Action principale</div>
              <h2 className="text-2xl font-bold mt-1">Nouvelle mesure GPS</h2>
              <p className="text-sm opacity-85 mt-2 max-w-md">
                Démarrez un levé terrain. Marquage automatique tous les 100 m, moyennage multi-échantillons,
                tracé en temps réel — fonctionne hors ligne.
              </p>
            </div>
            <div className="text-4xl opacity-90 group-hover:translate-x-1 transition-transform">→</div>
          </div>
        </Link>
        <div className="p-6 bg-card rounded-2xl shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Surface validée</div>
          <div className="text-3xl font-bold mt-1 text-primary">{formatArea(stats?.validatedHa ?? 0)}</div>
          <div className="text-xs text-muted-foreground mt-2">Cumul des mesures validées par l'administrateur.</div>
        </div>
      </div>

      <section className="bg-card rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Mesures récentes</h3>
          <Link to="/app/parcelles" className="text-xs text-accent hover:underline">Tout voir</Link>
        </div>
        {stats?.recent && stats.recent.length > 0 ? (
          <ul className="divide-y">
            {stats.recent.map((m) => (
              <li key={m.id}>
                <Link to="/app/parcelles/$id" params={{ id: m.id }}
                  className="p-4 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.parcelleId ? `Parcelle liée` : "Mesure libre"}</div>
                    <div className="text-xs text-muted-foreground">{formatDate(m.createdAt)} · {m.points.length} points</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{formatArea(m.areaM2)}</div>
                    <StatusBadge status={m.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucune mesure encore. <Link to="/app/measure" className="text-primary underline">Démarrer la première</Link>.
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number | string; hint?: string; tone?: "primary" | "warn" }) {
  return (
    <div className="p-4 bg-card rounded-xl shadow-card">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tone === "warn" ? "text-warn" : "text-primary"}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { c: string; l: string }> = {
    draft: { c: "bg-muted text-muted-foreground", l: "Brouillon" },
    submitted: { c: "bg-warn/15 text-warn", l: "À valider" },
    validated: { c: "bg-primary/15 text-primary", l: "Validée" },
    archived: { c: "bg-accent/15 text-accent", l: "Archivée" },
  };
  const m = map[status] ?? map.draft;
  return <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${m.c}`}>{m.l}</span>;
}
