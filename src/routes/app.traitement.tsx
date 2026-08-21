import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db, isBrowser } from "@/lib/db";
import { polygonAreaM2, polygonPerimeterM } from "@/lib/gps";
import { formatArea } from "@/lib/format";
import type { Measurement, Parcelle } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/app/traitement")({
  component: TraitementPage,
  head: () => ({
    meta: [
      { title: "Traitement des données importées — AcreMap" },
      { name: "description", content: "Traiter les relevés importés d'autres appareils : rattachement, recalcul des surfaces, morcellement et exports." },
      { property: "og:title", content: "Traitement des données importées — AcreMap" },
      { property: "og:description", content: "Rattachez, recalculez et morcelez vos relevés importés dans AcreMap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface ImportRow {
  id: string;
  file_name: string;
  file_type: string;
  status: string;
  size_bytes: number | null;
  parcelle_id: string | null;
  created_at: string;
}

function TraitementPage() {
  const nav = useNavigate();
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!isBrowser()) return;
    const [locM, locP] = await Promise.all([db().measurements.toArray(), db().parcelles.toArray()]);
    setMeasurements(locM.filter((m) => (m.createdBy === "import") || (m.notes ?? "").startsWith("Importé")));
    setParcelles(locP);
    if (navigator.onLine) {
      const { data } = await supabase
        .from("imports")
        .select("id, file_name, file_type, status, size_bytes, parcelle_id, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      setImports((data ?? []) as ImportRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { void reload(); }, []);

  async function attach(m: Measurement, parcelleId: string) {
    await db().measurements.update(m.id, { parcelleId });
    toast.success("Relevé rattaché à la parcelle");
    void reload();
  }

  async function recompute(m: Measurement) {
    const poly = m.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    if (poly.length < 3) { toast.error("Au moins 3 points requis"); return; }
    await db().measurements.update(m.id, {
      areaM2: polygonAreaM2(poly),
      perimeterM: polygonPerimeterM(poly),
    });
    toast.success("Surface et périmètre recalculés");
    void reload();
  }

  async function drop(m: Measurement) {
    await db().measurements.delete(m.id);
    toast.success("Relevé importé supprimé");
    void reload();
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Traitement &amp; morcellement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Relevés provenant d'autres appareils (DXF, DWG, GPX, KML, GeoJSON, CSV/TXT, PDF) : rattachez-les,
            recalculez leurs surfaces puis morcelez-les depuis la fiche parcelle.
          </p>
        </div>
        <Link to="/app/import" className="h-10 px-4 inline-flex items-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
          + Importer des fichiers
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Relevés importés ({measurements.length})</h2>
        {loading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {!loading && measurements.length === 0 && (
          <p className="text-sm text-muted-foreground">Aucun relevé importé pour l'instant.</p>
        )}
        {measurements.map((m) => {
          const poly = m.points.map((p) => ({ lat: p.lat, lng: p.lng }));
          const area = m.areaM2 || (poly.length >= 3 ? polygonAreaM2(poly) : 0);
          return (
            <div key={m.id} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{m.notes ?? "Relevé importé"}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.points.length} point(s) · {formatArea(area, "ha")} · statut {m.status}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void recompute(m)} className="h-9 px-3 rounded-lg border text-xs font-medium">
                    Recalculer surface
                  </button>
                  <button
                    onClick={() => nav({ to: "/app/parcelles/$id", params: { id: m.parcelleId ?? m.id } })}
                    className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                    Ouvrir / morceler
                  </button>
                  <button onClick={() => void drop(m)} className="h-9 px-3 rounded-lg border text-xs text-destructive">
                    Supprimer
                  </button>
                </div>
              </div>
              <label className="block">
                <span className="text-xs text-muted-foreground">Parcelle rattachée</span>
                <select
                  value={m.parcelleId ?? ""}
                  onChange={(e) => void attach(m, e.target.value)}
                  className="mt-1 w-full h-10 px-3 rounded-lg border bg-background text-sm">
                  <option value="">— Aucune —</option>
                  {parcelles.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.ownerName}</option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Fichiers archivés ({imports.length})</h2>
        {imports.length === 0 && <p className="text-sm text-muted-foreground">Aucun fichier archivé accessible (hors ligne ou vide).</p>}
        <div className="space-y-2">
          {imports.map((f) => (
            <div key={f.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{f.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  .{f.file_type} · {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} Ko` : "—"} ·{" "}
                  {new Date(f.created_at).toLocaleDateString("fr-FR")}
                </div>
              </div>
              <span className="text-xs font-semibold shrink-0">{f.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
