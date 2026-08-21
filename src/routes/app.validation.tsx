import { createFileRoute, Link } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { useAuth, hasRole } from "@/lib/auth";
import { formatArea, formatDate } from "@/lib/format";
import { feedbackSuccess, notify } from "@/lib/feedback";

export const Route = createFileRoute("/app/validation")({
  component: ValidationPage,
  head: () => ({ meta: [{ title: "Validation — AcreMap" }] }),
});

function ValidationPage() {
  const user = useAuth((s) => s.user);
  const [busyId, setBusyId] = useState<string | null>(null);

  const data = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    const d = db();
    const queue = await d.measurements.where("status").equals("submitted").toArray();
    const parcs = await d.parcelles.toArray();
    return { queue, parcs };
  }, []);

  if (!hasRole(user, "admin")) {
    return <div className="p-8 max-w-md mx-auto text-center text-muted-foreground">Réservé à l'administrateur.</div>;
  }

  async function validate(id: string) {
    setBusyId(id);
    await db().measurements.update(id, { status: "validated", validatedBy: user!.id, validatedAt: Date.now() });
    feedbackSuccess();
    await notify("Mesure validée", "La mesure a été validée et archivée.", { tag: "validated" });
    setBusyId(null);
  }

  async function reject(id: string) {
    if (!confirm("Renvoyer la mesure en brouillon pour correction ?")) return;
    setBusyId(id);
    await db().measurements.update(id, { status: "draft" });
    setBusyId(null);
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">File de validation</h1>
        <p className="text-sm text-muted-foreground">
          Mesures soumises par les agents en attente de votre validation.
        </p>
      </div>

      <div className="grid gap-3">
        {data && data.queue.length === 0 && (
          <div className="bg-card rounded-xl p-10 text-center text-sm text-muted-foreground shadow-card">
            Tout est à jour — aucune mesure en attente.
          </div>
        )}
        {data?.queue.map((m) => {
          const parc = data.parcs.find((p) => p.id === m.parcelleId);
          return (
            <div key={m.id} className="bg-card rounded-xl p-4 shadow-card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{parc?.code ?? `Mesure ${m.id.slice(0, 8)}`}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {parc?.ownerName ?? "Sans parcelle liée"} · {formatDate(m.createdAt)} · {m.points.length} points
                  </div>
                  {m.deviceProfile && (
                    <div className="text-[11px] text-muted-foreground mt-1">
                      GPS {m.deviceProfile.estimatedTier} · meilleure ±{m.deviceProfile.bestAccuracyM.toFixed(1)} m
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-bold text-primary text-lg">{formatArea(m.areaM2, m.unit)}</div>
                  <span className="text-[10px] text-warn">À valider</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/app/parcelles/$id" params={{ id: m.id }}
                  className="px-3 py-1.5 rounded-md border text-xs font-medium">Ouvrir le détail</Link>
                <button onClick={() => reject(m.id)} disabled={busyId === m.id}
                  className="px-3 py-1.5 rounded-md border border-warn text-warn text-xs font-medium disabled:opacity-50">
                  Renvoyer en brouillon
                </button>
                <button onClick={() => validate(m.id)} disabled={busyId === m.id}
                  className="ml-auto px-4 py-1.5 rounded-md bg-success text-white text-xs font-semibold disabled:opacity-50">
                  ✓ Valider
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
