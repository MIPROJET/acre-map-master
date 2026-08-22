import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db, isBrowser } from "@/lib/db";
import { polygonAreaM2, polygonPerimeterM } from "@/lib/gps";
import { formatArea } from "@/lib/format";
import { extOf, isGeometryFile, parseSurveyFile } from "@/lib/import-parse";
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
  storage_path: string | null;
  created_at: string;
}

function TraitementPage() {
  const nav = useNavigate();
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    if (!isBrowser()) return;
    const [locM, locP] = await Promise.all([db().measurements.toArray(), db().parcelles.toArray()]);
    setMeasurements(locM.filter((m) => (m.createdBy === "import") || (m.notes ?? "").startsWith("Importé")));
    setParcelles(locP);
    if (navigator.onLine) {
      const { data } = await supabase
        .from("imports")
        .select("id, file_name, file_type, status, size_bytes, parcelle_id, storage_path, created_at")
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

  // ---- Fichiers archivés : téléchargement depuis le bucket puis traitement ----
  async function downloadFile(f: ImportRow): Promise<File | null> {
    if (!f.storage_path) { toast.error("Fichier introuvable dans le stockage"); return null; }
    const { data, error } = await supabase.storage.from("imports").download(f.storage_path);
    if (error || !data) { toast.error(error?.message ?? "Téléchargement impossible"); return null; }
    return new File([data], f.file_name, { type: data.type || "application/octet-stream" });
  }

  async function saveLocalFile(f: ImportRow) {
    setBusy(f.id);
    try {
      const file = await downloadFile(f);
      if (!file) return;
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url; a.download = f.file_name; a.click();
      URL.revokeObjectURL(url);
    } finally { setBusy(null); }
  }

  async function processFile(f: ImportRow) {
    setBusy(f.id);
    try {
      const file = await downloadFile(f);
      if (!file) return;
      if (!isGeometryFile(file.name)) {
        toast.error(`Format .${extOf(file.name)} : exportez la géométrie en DXF, GPX, KML, GeoJSON ou CSV pour le traitement automatique.`);
        return;
      }
      const parsed = await parseSurveyFile(file);
      if (!parsed.rings.length) {
        toast.error(parsed.warnings[0] ?? "Aucune géométrie exploitable trouvée.");
        return;
      }
      const ring = parsed.rings[0].points;
      const poly = ring.map((p) => ({ lat: p.lat, lng: p.lng }));
      const now = Date.now();
      const id = crypto.randomUUID();
      await db().measurements.put({
        id,
        parcelleId: f.parcelle_id ?? undefined,
        createdBy: "import",
        createdAt: now,
        status: "draft",
        points: ring.map((p, idx) => ({ ...p, accuracy: 0, ts: now, index: idx, samples: 1, auto: false })),
        trace: ring.map((p) => ({ ...p, accuracy: 0, ts: now })),
        areaM2: polygonAreaM2(poly),
        perimeterM: polygonPerimeterM(poly),
        unit: "ha",
        notes: `Importé depuis ${f.file_name}`,
      });
      await supabase.from("imports").update({ status: "parsed" }).eq("id", f.id);
      toast.success(`${parsed.format} traité — ${ring.length} points, ${formatArea(polygonAreaM2(poly), "ha")}`);
      void reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  async function attachImport(f: ImportRow, parcelleId: string) {
    await supabase.from("imports").update({ parcelle_id: parcelleId || null }).eq("id", f.id);
    setImports((cur) => cur.map((x) => (x.id === f.id ? { ...x, parcelle_id: parcelleId || null } : x)));
    toast.success(parcelleId ? "Fichier rattaché à la parcelle" : "Rattachement retiré");
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Traitement &amp; morcellement</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Relevés provenant d'autres appareils (DXF, DWG, GPX, KML, GeoJSON, CSV/TXT, PDF) : rattachez-les,
            recalculez leurs surfaces puis morcelez-les depuis la fiche parcelle.
          </p>
        </div>
        <Link to="/app/import" className="h-10 px-4 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-semibold shrink-0">
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{m.notes ?? "Relevé importé"}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.points.length} point(s) · {formatArea(area, "ha")} · statut {m.status}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                  <button onClick={() => void recompute(m)} className="h-9 px-3 rounded-lg border text-xs font-medium">
                    Recalculer surface
                  </button>
                  <button
                    disabled={!m.parcelleId}
                    onClick={() => nav({ to: "/app/parcelles/$id", params: { id: m.parcelleId ?? m.id } })}
                    className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
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
                    <option key={p.id} value={p.id}>{p.code} · {p.name ?? p.ownerName}</option>
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
          {imports.map((f) => {
            const geo = isGeometryFile(f.file_name);
            return (
              <div key={f.id} className="rounded-xl border bg-card p-3 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{f.file_name}</div>
                    <div className="text-xs text-muted-foreground">
                      .{f.file_type} · {f.size_bytes ? `${Math.round(f.size_bytes / 1024)} Ko` : "—"} ·{" "}
                      {new Date(f.created_at).toLocaleDateString("fr-FR")} · {f.status}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 shrink-0">
                    <button
                      disabled={busy === f.id || !geo}
                      onClick={() => void processFile(f)}
                      title={geo ? "Lire la géométrie et créer un relevé" : "Format non géométrique : exportez en DXF/GPX/KML/GeoJSON/CSV"}
                      className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">
                      {busy === f.id ? "Traitement…" : "Traiter"}
                    </button>
                    <button
                      disabled={busy === f.id}
                      onClick={() => void saveLocalFile(f)}
                      className="h-9 px-3 rounded-lg border text-xs font-medium disabled:opacity-50">
                      Télécharger
                    </button>
                    <button
                      disabled={!f.parcelle_id}
                      onClick={() => f.parcelle_id && nav({ to: "/app/parcelles/$id", params: { id: f.parcelle_id } })}
                      className="h-9 px-3 rounded-lg border text-xs font-medium disabled:opacity-50">
                      Ouvrir la parcelle
                    </button>
                  </div>
                </div>
                <label className="block">
                  <span className="text-xs text-muted-foreground">Parcelle rattachée</span>
                  <select
                    value={f.parcelle_id ?? ""}
                    onChange={(e) => void attachImport(f, e.target.value)}
                    className="mt-1 w-full h-10 px-3 rounded-lg border bg-background text-sm">
                    <option value="">— Aucune —</option>
                    {parcelles.map((p) => (
                      <option key={p.id} value={p.id}>{p.code} · {p.name ?? p.ownerName}</option>
                    ))}
                  </select>
                </label>
                {!geo && (
                  <p className="text-[11px] text-muted-foreground">
                    Format archivé (.{f.file_type}) : téléchargez-le puis exportez la géométrie en DXF, GPX, KML,
                    GeoJSON ou CSV pour un traitement automatique et le morcellement.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
