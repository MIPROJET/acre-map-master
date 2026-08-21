import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { db, isBrowser } from "@/lib/db";
import { extOf, isGeometryFile, parseSurveyFile, guessZone, type ParseResult } from "@/lib/import-parse";
import type { Parcelle } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/app/import")({
  component: ImportPage,
  head: () => ({
    meta: [
      { title: "Import de fichiers topographiques — AcreMap" },
      { name: "description", content: "Importer des relevés DXF, DWG, GPX, KML, GeoJSON, CSV/TXT et PDF, les convertir et les archiver." },
      { property: "og:title", content: "Import de fichiers topographiques — AcreMap" },
      { property: "og:description", content: "Conversion et archivage des relevés de terrain dans AcreMap." },
    ],
  }),
});

interface Job {
  id: string;
  name: string;
  ext: string;
  status: "queued" | "parsing" | "uploading" | "done" | "error";
  progress: number;
  rings?: number;
  points?: number;
  zone?: number | null;
  message?: string;
}

function ImportPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [parcelleId, setParcelleId] = useState<string>("");
  const [online, setOnline] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isBrowser()) return;
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    void db().parcelles.toArray().then((r) => setParcelles(r));
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  function patch(id: string, p: Partial<Job>) {
    setJobs((cur) => cur.map((j) => (j.id === id ? { ...j, ...p } : j)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const initial: Job[] = list.map((f) => ({
      id: crypto.randomUUID(), name: f.name, ext: extOf(f.name), status: "queued", progress: 0,
    }));
    setJobs((cur) => [...initial, ...cur]);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const job = initial[i];
      try {
        let parsed: ParseResult | null = null;
        if (isGeometryFile(file.name)) {
          patch(job.id, { status: "parsing", progress: 20 });
          parsed = await parseSurveyFile(file);
          const zone = guessZone(parsed.rings);
          const pts = parsed.rings.reduce((s, r) => s + r.points.length, 0);
          patch(job.id, { rings: parsed.rings.length, points: pts, zone, progress: 55 });
          if (parsed.warnings.length) patch(job.id, { message: parsed.warnings.join(" · ") });
        } else {
          patch(job.id, { message: "Format archivé (traitement manuel)", progress: 40 });
        }

        // Archivage dans le bucket `imports` (si en ligne) + enregistrement
        let storagePath: string | null = null;
        if (online) {
          patch(job.id, { status: "uploading", progress: 70 });
          const { data: auth } = await supabase.auth.getUser();
          const uid = auth.user?.id ?? "anonymous";
          storagePath = `${uid}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
          const up = await supabase.storage.from("imports").upload(storagePath, file, { upsert: true });
          if (up.error) throw up.error;
          const ins = await supabase.from("imports").insert({
            parcelle_id: parcelleId || null,
            file_name: file.name,
            file_type: extOf(file.name),
            storage_path: storagePath,
            size_bytes: file.size,
            status: parsed ? "parsed" : "archived",
            parsed: parsed ? (parsed as unknown as Record<string, unknown>) : null,
            created_by: auth.user?.id ?? null,
          });
          if (ins.error) throw ins.error;
        } else {
          // Hors ligne : conservation locale pour envoi ultérieur
          await db().meta.put({
            key: `import.pending.${job.id}`,
            value: { name: file.name, size: file.size, parcelleId, parsed, ts: Date.now() },
          });
          patch(job.id, { message: "Hors ligne — conservé en local, envoi à la reconnexion" });
        }

        // Rattachement géométrique à la parcelle sélectionnée (mesure importée)
        if (parsed && parsed.rings.length > 0 && parcelleId) {
          const ring = parsed.rings[0].points;
          const id = crypto.randomUUID();
          await db().measurements.put({
            id,
            parcelleId,
            createdBy: "import",
            createdAt: Date.now(),
            status: "draft",
            points: ring.map((p, idx) => ({ ...p, accuracy: 0, ts: Date.now(), index: idx, samples: 1, auto: false })),
            trace: ring.map((p) => ({ ...p, accuracy: 0, ts: Date.now() })),
            areaM2: 0,
            perimeterM: 0,
            unit: "ha",
            notes: `Importé depuis ${file.name}`,
          });
        }

        patch(job.id, { status: "done", progress: 100 });
      } catch (e) {
        patch(job.id, { status: "error", progress: 100, message: (e as Error).message });
        toast.error(`${file.name} : ${(e as Error).message}`);
      }
    }
    toast.success("Import terminé");
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Import de fichiers</h1>
        <p className="text-sm text-muted-foreground mt-1">
          DXF, GPX, KML, GeoJSON, CSV/TXT sont convertis en géométrie. DWG, PDF, ZIP/Shapefile sont archivés.
        </p>
        {!online && (
          <div className="mt-3 text-xs px-3 py-2 rounded-md bg-warn/15 border border-warn/30">
            Hors ligne — les fichiers sont conservés localement et transférés à la reconnexion.
          </div>
        )}
      </header>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Rattacher à une parcelle (optionnel)</span>
        <select value={parcelleId} onChange={(e) => setParcelleId(e.target.value)}
          className="mt-1 w-full h-11 px-3 rounded-lg border bg-card text-sm">
          <option value="">— Aucune —</option>
          {parcelles.map((p) => (
            <option key={p.id} value={p.id}>{p.code} · {p.ownerName}</option>
          ))}
        </select>
      </label>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }}
        className="border-2 border-dashed rounded-xl p-8 text-center bg-card"
      >
        <p className="text-sm font-medium">Déposez vos fichiers ici</p>
        <p className="text-xs text-muted-foreground mt-1">.dxf .dwg .gpx .kml .kmz .geojson .csv .txt .pdf .zip</p>
        <button type="button" onClick={() => inputRef.current?.click()}
          className="mt-4 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
          Choisir des fichiers
        </button>
        <input ref={inputRef} type="file" multiple hidden
          accept=".dxf,.dwg,.gpx,.kml,.kmz,.geojson,.json,.csv,.txt,.pdf,.zip,.shp,.dbf,.prj"
          onChange={(e) => void handleFiles(e.target.files)} />
      </div>

      {jobs.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Traitement</h2>
          {jobs.map((j) => (
            <div key={j.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{j.name}</div>
                  <div className="text-xs text-muted-foreground">
                    .{j.ext}
                    {j.rings != null && ` · ${j.rings} contour(s) · ${j.points} point(s)`}
                    {j.zone ? ` · UTM ${j.zone}N` : ""}
                    {j.message ? ` · ${j.message}` : ""}
                  </div>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${
                  j.status === "error" ? "text-destructive" : j.status === "done" ? "text-primary" : "text-muted-foreground"
                }`}>
                  {j.status === "queued" ? "En attente" : j.status === "parsing" ? "Lecture…"
                    : j.status === "uploading" ? "Archivage…" : j.status === "done" ? "Terminé" : "Erreur"}
                </span>
              </div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${j.status === "error" ? "bg-destructive" : "bg-primary"}`}
                     style={{ width: `${j.progress}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
