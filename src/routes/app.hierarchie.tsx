import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { nextSequentialCode } from "@/lib/ref";
import { SearchSelect } from "@/components/SearchSelect";
import { buildSpChoices, ensureSpByName } from "@/lib/sp-registry";
import { syncAll, syncNow, syncRemoved } from "@/lib/sync";
import { useAuth, hasRole } from "@/lib/auth";
import { exportSpPng, exportDomainePng } from "@/lib/render/png-export";
import type { SP, Domaine, Parcelle } from "@/lib/types";

export const Route = createFileRoute("/app/hierarchie")({
  component: HierarchiePage,
  head: () => ({
    meta: [
      { title: "Hiérarchie SP / Domaines / Parcelles — AcreMap" },
      { name: "description", content: "Gérer la hiérarchie AgriCapital : sous-préfectures déployées, domaines et parcelles, avec archivage et suppression." },
      { property: "og:title", content: "Hiérarchie SP / Domaines / Parcelles — AcreMap" },
      { property: "og:description", content: "Administration de la hiérarchie terrain : déploiement des sous-préfectures, domaines et parcelles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Toast = { kind: "ok" | "err"; text: string } | null;

function HierarchiePage() {
  const user = useAuth((s) => s.user);
  const isAdmin = hasRole(user, "admin");

  const [openSp, setOpenSp] = useState<string | null>(null);
  const [openDom, setOpenDom] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deployOpen, setDeployOpen] = useState(false);
  const [edit, setEdit] = useState<null | { kind: "dom" | "parc"; id?: string; parentId?: string }>(null);

  const data = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    const d = db();
    const [sps, domaines, parcelles] = await Promise.all([d.sps.toArray(), d.domaines.toArray(), d.parcelles.toArray()]);
    return { sps, domaines, parcelles };
  }, []);

  function flash(kind: "ok" | "err", text: string) {
    setToast({ kind, text });
    window.setTimeout(() => setToast(null), 4000);
  }

  const needle = q.trim().toLowerCase();
  const visibleSps = useMemo(() => {
    const list = (data?.sps ?? []).filter((s) => (showArchived ? true : !s.archivedAt));
    const match = needle
      ? list.filter((s) => {
          const doms = (data?.domaines ?? []).filter((d) => d.spId === s.id);
          const parcs = (data?.parcelles ?? []).filter((p) => doms.some((d) => d.id === p.domaineId));
          return (
            `${s.code} ${s.name} ${s.district} ${s.region} ${s.departement}`.toLowerCase().includes(needle) ||
            doms.some((d) => `${d.code} ${d.name}`.toLowerCase().includes(needle)) ||
            parcs.some((p) => `${p.code} ${p.ownerName}`.toLowerCase().includes(needle))
          );
        })
      : list;
    return [...match].sort((a, b) => a.code.localeCompare(b.code, "fr"));
  }, [data, needle, showArchived]);

  async function refresh() {
    setBusy("sync");
    try {
      await syncAll();
      flash("ok", "Liste synchronisée avec le cloud.");
    } catch {
      flash("err", "Synchronisation impossible (hors ligne ?).");
    } finally {
      setBusy(null);
    }
  }

  async function archiveToggle(table: "sps" | "domaines" | "parcelles", id: string, archived: boolean) {
    setBusy(id);
    try {
      await db()[table].update(id, { archivedAt: archived ? null : Date.now() });
      syncNow(table, id);
      flash("ok", archived ? "Élément restauré." : "Élément archivé.");
    } finally { setBusy(null); }
  }

  async function removeEntity(table: "sps" | "domaines" | "parcelles", id: string, label: string) {
    if (!window.confirm(`Supprimer définitivement ${label} ? Cette action est irréversible.`)) return;
    setBusy(id);
    try {
      await db()[table].delete(id);
      syncRemoved(table, id);
      flash("ok", "Suppression effectuée.");
    } finally { setBusy(null); }
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hiérarchie AgriCapital</h1>
          <p className="text-sm text-muted-foreground">District › Région › Département › SP › Domaine › Parcelle › Lot H</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void refresh()} disabled={busy === "sync"}
            className="px-3 py-2 rounded-lg border text-sm font-medium disabled:opacity-50">
            {busy === "sync" ? "Rafraîchissement…" : "↻ Rafraîchir depuis le cloud"}
          </button>
          <button onClick={() => setDeployOpen(true)}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">
            + Déployer une sous-préfecture
          </button>
        </div>
      </div>

      {toast && (
        <div className={`text-sm px-3 py-2 rounded-md ${toast.kind === "ok" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
          {toast.text}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une SP, un domaine, une parcelle…"
          className="flex-1 min-w-[220px] h-11 px-3 rounded-md border bg-background text-sm" />
        <label className="text-xs flex items-center gap-2 px-3 h-11 rounded-md border">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Afficher les archivés
        </label>
      </div>

      <div className="bg-card rounded-2xl shadow-card divide-y">
        {visibleSps.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucune sous-préfecture déployée. Utilisez « Déployer une sous-préfecture » — la référence SP00X est créée automatiquement.
          </div>
        )}
        {visibleSps.map((sp) => {
          const doms = (data?.domaines ?? []).filter((d) => d.spId === sp.id && (showArchived || !d.archivedAt));
          const expanded = openSp === sp.id;
          return (
            <div key={sp.id}>
              <div className="w-full p-4 hover:bg-muted/60 flex items-center justify-between gap-3">
                <button onClick={() => setOpenSp(expanded ? null : sp.id)} className="flex-1 text-left min-w-0">
                  <div className="font-semibold truncate">
                    {sp.code} · {sp.name}
                    {sp.archivedAt && <span className="ml-2 text-[10px] uppercase text-warn">archivée</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {sp.district} › {sp.region} › {sp.departement} · {doms.length} domaine(s)
                  </div>
                </button>
                <button onClick={() => void exportSpPng(sp as SP)}
                  className="text-xs px-2.5 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10"
                  title="Exporter le plan PNG de la sous-préfecture">📷 PNG</button>
                {isAdmin && (
                  <>
                    <button onClick={() => void archiveToggle("sps", sp.id, !!sp.archivedAt)} disabled={busy === sp.id}
                      className="text-xs px-2 py-1.5 rounded border disabled:opacity-50">
                      {sp.archivedAt ? "Restaurer" : "Archiver"}
                    </button>
                    <button onClick={() => void removeEntity("sps", sp.id, `${sp.code} · ${sp.name}`)} disabled={busy === sp.id}
                      className="text-xs px-2 py-1.5 rounded border border-destructive/40 text-destructive disabled:opacity-50">
                      Supprimer
                    </button>
                  </>
                )}
                <span className="text-muted-foreground">{expanded ? "▴" : "▾"}</span>
              </div>

              {expanded && (
                <div className="bg-muted/30 px-4 pb-3">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Domaines</span>
                    <button onClick={() => setEdit({ kind: "dom", parentId: sp.id })}
                      className="text-xs px-2 py-1 rounded border">+ Domaine</button>
                  </div>
                  {doms.length === 0 && <div className="text-xs text-muted-foreground py-2">Aucun domaine.</div>}
                  {doms.map((dom) => {
                    const parcs = (data?.parcelles ?? []).filter((p) => p.domaineId === dom.id && (showArchived || !p.archivedAt));
                    const e = openDom === dom.id;
                    return (
                      <div key={dom.id} className="bg-card rounded-lg my-1.5">
                        <div className="w-full px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap">
                          <button onClick={() => setOpenDom(e ? null : dom.id)} className="flex-1 text-left min-w-0">
                            <div className="font-medium text-sm truncate">
                              {dom.code} · {dom.name}
                              {dom.archivedAt && <span className="ml-2 text-[10px] uppercase text-warn">archivé</span>}
                            </div>
                            <div className="text-[11px] text-muted-foreground">{parcs.length} parcelle(s)</div>
                          </button>
                          <button onClick={() => void exportDomainePng(dom as Domaine, sp as SP)}
                            className="text-[11px] px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10"
                            title="Exporter le plan PNG du domaine">📷 PNG</button>
                          <button onClick={() => setEdit({ kind: "dom", id: dom.id, parentId: sp.id })}
                            className="text-[11px] px-2 py-1 rounded border">Modifier</button>
                          {isAdmin && (
                            <>
                              <button onClick={() => void archiveToggle("domaines", dom.id, !!dom.archivedAt)}
                                className="text-[11px] px-2 py-1 rounded border">{dom.archivedAt ? "Restaurer" : "Archiver"}</button>
                              <button onClick={() => void removeEntity("domaines", dom.id, `${dom.code} · ${dom.name}`)}
                                className="text-[11px] px-2 py-1 rounded border border-destructive/40 text-destructive">Supprimer</button>
                            </>
                          )}
                          <span className="text-muted-foreground text-xs">{e ? "▴" : "▾"}</span>
                        </div>
                        {e && (
                          <div className="px-3 pb-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Parcelles</span>
                              <button onClick={() => setEdit({ kind: "parc", parentId: dom.id })}
                                className="text-[11px] px-2 py-1 rounded border">+ Parcelle</button>
                            </div>
                            {parcs.length === 0 && <div className="text-xs text-muted-foreground">Aucune parcelle.</div>}
                            {parcs.map((p) => (
                              <div key={p.id} className="px-2 py-1.5 bg-muted/40 rounded text-xs flex justify-between items-center gap-2 flex-wrap">
                                <span className="truncate">
                                  <b>{p.code}</b> · {p.ownerName}
                                  {p.archivedAt && <span className="ml-2 text-[10px] uppercase text-warn">archivée</span>}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  {p.declaredArea && <span className="text-muted-foreground">{p.declaredArea} ha déclarés</span>}
                                  <button onClick={() => setEdit({ kind: "parc", id: p.id, parentId: dom.id })}
                                    className="px-2 py-1 rounded border">Modifier</button>
                                  {isAdmin && (
                                    <>
                                      <button onClick={() => void archiveToggle("parcelles", p.id, !!p.archivedAt)}
                                        className="px-2 py-1 rounded border">{p.archivedAt ? "Restaurer" : "Archiver"}</button>
                                      <button onClick={() => void removeEntity("parcelles", p.id, `${p.code} · ${p.ownerName}`)}
                                        className="px-2 py-1 rounded border border-destructive/40 text-destructive">Supprimer</button>
                                    </>
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {deployOpen && data && (
        <DeploySpModal
          sps={data.sps}
          onClose={() => setDeployOpen(false)}
          onDone={(msg) => { setDeployOpen(false); flash("ok", msg); }}
        />
      )}

      {edit && data && (
        <EditModal
          spec={edit}
          data={data}
          onClose={() => setEdit(null)}
          onDone={(msg) => { setEdit(null); flash("ok", msg); }}
        />
      )}
    </div>
  );
}

/** Sélection depuis le référentiel national : la référence SP00X est générée en arrière-plan. */
function DeploySpModal({ sps, onClose, onDone }: { sps: SP[]; onClose: () => void; onDone: (msg: string) => void }) {
  const choices = useMemo(() => buildSpChoices(sps), [sps]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = choices.map((c) => ({
    value: c.name,
    label: c.code ? `${c.code} · ${c.name}` : c.name,
    hint: [c.departement, c.region, c.district].filter(Boolean).join(" › "),
  }));
  const picked = choices.find((c) => c.name === name) ?? null;

  async function deploy() {
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const { sp, created } = await ensureSpByName(name);
      onDone(created
        ? `Référence ${sp.code} créée pour ${sp.name}.`
        : `${sp.code} · ${sp.name} est déjà déployée.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors du déploiement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-foreground/40 z-50 flex items-end lg:items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl w-full max-w-md p-5 space-y-3 shadow-elevated">
        <h2 className="text-lg font-bold">Déployer une sous-préfecture</h2>
        <p className="text-xs text-muted-foreground">
          Choisissez une sous-préfecture du référentiel national. La référence officielle (SP001, SP002, …)
          est attribuée automatiquement, dans l'ordre des déploiements.
        </p>
        <SearchSelect value={name} options={options} onChange={setName} placeholder="Sélectionner une sous-préfecture…" />
        {picked && (
          <div className="text-xs bg-muted/50 rounded-md px-3 py-2 space-y-0.5">
            <div><span className="text-muted-foreground">District :</span> {picked.district || "—"}</div>
            <div><span className="text-muted-foreground">Région :</span> {picked.region || "—"}</div>
            <div><span className="text-muted-foreground">Département :</span> {picked.departement || "—"}</div>
            <div><span className="text-muted-foreground">Référence :</span> {picked.code ?? "attribuée automatiquement"}</div>
          </div>
        )}
        {error && <div className="text-xs bg-destructive/10 text-destructive px-3 py-2 rounded-md">{error}</div>}
        {saving && (
          <div className="text-xs flex items-center gap-2 text-muted-foreground">
            <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            Création de la référence SP en cours…
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-10 rounded-md border">Annuler</button>
          <button onClick={() => void deploy()} disabled={!name || saving}
            className="flex-1 h-10 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-40">
            {saving ? "Déploiement…" : "Déployer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({
  spec, data, onClose, onDone,
}: {
  spec: { kind: "dom" | "parc"; id?: string; parentId?: string };
  data: { sps: SP[]; domaines: Domaine[]; parcelles: Parcelle[] };
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const existingDom = spec.kind === "dom" ? data.domaines.find((d) => d.id === spec.id) : undefined;
  const existingParc = spec.kind === "parc" ? data.parcelles.find((p) => p.id === spec.id) : undefined;

  const [name, setName] = useState(existingDom?.name ?? existingParc?.ownerName ?? "");
  const [notes, setNotes] = useState(existingDom?.notes ?? existingParc?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const d = db();
      if (spec.kind === "dom") {
        if (existingDom) {
          await d.domaines.update(existingDom.id, { name: name.trim(), notes: notes.trim() || undefined });
          syncNow("domaines", existingDom.id);
        } else if (spec.parentId) {
          const id = crypto.randomUUID();
          await d.domaines.put({
            id, code: nextSequentialCode("DOM", data.domaines.map((x) => x.code)),
            name: name.trim(), spId: spec.parentId, notes: notes.trim() || undefined, createdAt: Date.now(),
          });
          syncNow("domaines", id);
        }
      } else {
        if (existingParc) {
          await d.parcelles.update(existingParc.id, { ownerName: name.trim(), notes: notes.trim() || undefined });
          syncNow("parcelles", existingParc.id);
        } else if (spec.parentId) {
          const id = crypto.randomUUID();
          await d.parcelles.put({
            id, code: nextSequentialCode("PARC", data.parcelles.map((x) => x.code)),
            ownerName: name.trim(), domaineId: spec.parentId, conventionDate: Date.now(),
            notes: notes.trim() || undefined, conventionStatus: "PP", createdAt: Date.now(),
          });
          syncNow("parcelles", id);
        }
      }
      onDone("Enregistré.");
    } finally { setSaving(false); }
  }

  const label = spec.kind === "dom" ? "domaine" : "parcelle";
  return (
    <div className="fixed inset-0 bg-foreground/40 z-50 flex items-end lg:items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl w-full max-w-md p-5 space-y-3 shadow-elevated">
        <h2 className="text-lg font-bold">{spec.id ? `Modifier le ${label}` : `Nouveau ${label}`}</h2>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">{spec.kind === "dom" ? "Nom du domaine" : "Nom du propriétaire / famille"}</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-md border bg-background" />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">Notes (optionnel)</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full h-10 px-3 rounded-md border bg-background" />
        </label>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-md border">Annuler</button>
          <button onClick={() => void save()} disabled={saving || !name.trim()}
            className="flex-1 h-10 rounded-md bg-primary text-primary-foreground font-semibold disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
