import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { nextSequentialCode } from "@/lib/ref";
import {
  listDistricts, regionsOfDistrict, departementsOfRegion,
} from "@/lib/ci-admin";
import { exportSpPng, exportDomainePng } from "@/lib/render/png-export";
import type { SP, Domaine } from "@/lib/types";

export const Route = createFileRoute("/app/hierarchie")({
  component: HierarchiePage,
  head: () => ({ meta: [{ title: "Hiérarchie SP/DOM/PARC — AcreMap" }] }),
});

function HierarchiePage() {
  const [openSp, setOpenSp] = useState<string | null>(null);
  const [openDom, setOpenDom] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { kind: "sp" | "dom" | "parc"; parentId?: string }>(null);

  const data = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    const d = db();
    const [sps, domaines, parcelles] = await Promise.all([d.sps.toArray(), d.domaines.toArray(), d.parcelles.toArray()]);
    return { sps, domaines, parcelles };
  }, []);

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hiérarchie AgriCapital</h1>
          <p className="text-sm text-muted-foreground">District › Région › Département › SP › Domaine › Parcelle › Lot H</p>
        </div>
        <button onClick={() => setModal({ kind: "sp" })}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold">+ Sous-Préfecture</button>
      </div>

      <div className="bg-card rounded-2xl shadow-card divide-y">
        {data?.sps.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Aucune sous-préfecture créée. Commencez par <button onClick={() => setModal({ kind: "sp" })} className="text-primary underline">en ajouter une</button>.
          </div>
        )}
        {data?.sps.map((sp) => {
          const doms = data.domaines.filter((d) => d.spId === sp.id);
          const expanded = openSp === sp.id;
          return (
            <div key={sp.id}>
              <div className="w-full p-4 hover:bg-muted/60 flex items-center justify-between gap-3">
                <button onClick={() => setOpenSp(expanded ? null : sp.id)} className="flex-1 text-left">
                  <div className="font-semibold">{sp.code} · {sp.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {sp.district} › {sp.region} › {sp.departement} · {doms.length} domaine(s)
                  </div>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); void exportSpPng(sp as SP); }}
                  className="text-xs px-2.5 py-1.5 rounded border border-primary/30 text-primary hover:bg-primary/10"
                  title="Exporter le plan PNG de la sous-préfecture">
                  📷 PNG
                </button>
                <span className="text-muted-foreground">{expanded ? "▴" : "▾"}</span>
              </div>
              {expanded && (
                <div className="bg-muted/30 px-4 pb-3">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">Domaines</span>
                    <button onClick={() => setModal({ kind: "dom", parentId: sp.id })}
                      className="text-xs px-2 py-1 rounded border">+ Domaine</button>
                  </div>
                  {doms.length === 0 && <div className="text-xs text-muted-foreground py-2">Aucun domaine.</div>}
                  {doms.map((dom) => {
                    const parcs = data.parcelles.filter((p) => p.domaineId === dom.id);
                    const e = openDom === dom.id;
                    return (
                      <div key={dom.id} className="bg-card rounded-lg my-1.5">
                        <div className="w-full px-3 py-2.5 flex items-center justify-between gap-2">
                          <button onClick={() => setOpenDom(e ? null : dom.id)} className="flex-1 text-left">
                            <div className="font-medium text-sm">{dom.code} · {dom.name}</div>
                            <div className="text-[11px] text-muted-foreground">{parcs.length} parcelle(s)</div>
                          </button>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); void exportDomainePng(dom as Domaine, sp as SP); }}
                            className="text-[11px] px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10"
                            title="Exporter le plan PNG du domaine">
                            📷 PNG
                          </button>
                          <span className="text-muted-foreground text-xs">{e ? "▴" : "▾"}</span>
                        </div>
                        {e && (
                          <div className="px-3 pb-3 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Parcelles</span>
                              <button onClick={() => setModal({ kind: "parc", parentId: dom.id })}
                                className="text-[11px] px-2 py-1 rounded border">+ Parcelle</button>
                            </div>
                            {parcs.length === 0 && <div className="text-xs text-muted-foreground">Aucune parcelle.</div>}
                            {parcs.map((p) => (
                              <div key={p.id} className="px-2 py-1.5 bg-muted/40 rounded text-xs flex justify-between">
                                <span><b>{p.code}</b> · {p.ownerName}</span>
                                {p.declaredArea && <span className="text-muted-foreground">{p.declaredArea} ha déclarés</span>}
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

      {modal && <CreateModal kind={modal.kind} parentId={modal.parentId} data={data} onClose={() => setModal(null)} />}
    </div>
  );
}

function CreateModal({ kind, parentId, data, onClose }: { kind: "sp" | "dom" | "parc"; parentId?: string; data: any; onClose: () => void }) {
  const [name, setName] = useState("");
  const [extra, setExtra] = useState("");
  const [district, setDistrict] = useState(listDistricts()[0] ?? "");
  const [region, setRegion] = useState(regionsOfDistrict(district)[0] ?? "");
  const [dept, setDept] = useState(departementsOfRegion(region)[0] ?? "");

  async function save() {
    if (!name.trim()) return;
    const d = db();
    if (kind === "sp") {
      const code = nextSequentialCode("SP", data.sps.map((x: any) => x.code));
      await d.sps.put({
        id: crypto.randomUUID(), code, name: name.trim(),
        district, region, departement: dept, createdAt: Date.now(),
      });
    } else if (kind === "dom" && parentId) {
      const code = nextSequentialCode("DOM", data.domaines.map((x: any) => x.code));
      await d.domaines.put({ id: crypto.randomUUID(), code, name: name.trim(), spId: parentId, createdAt: Date.now() });
    } else if (kind === "parc" && parentId) {
      const code = nextSequentialCode("PARC", data.parcelles.map((x: any) => x.code));
      await d.parcelles.put({
        id: crypto.randomUUID(), code, ownerName: name.trim(), domaineId: parentId,
        conventionDate: Date.now(), notes: extra || undefined, conventionStatus: "PP", createdAt: Date.now(),
      });
    }
    onClose();
  }

  const label = kind === "sp" ? "Sous-Préfecture" : kind === "dom" ? "Domaine" : "Parcelle";
  return (
    <div className="fixed inset-0 bg-foreground/40 z-50 flex items-end lg:items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-card rounded-2xl w-full max-w-md p-5 space-y-3 shadow-elevated">
        <h2 className="text-lg font-bold">Nouvelle {label}</h2>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">{kind === "parc" ? "Nom du propriétaire / famille" : "Nom"}</span>
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={kind === "sp" ? "Daloa-Centre" : kind === "dom" ? "Quartier Gonaté" : "Famille Séri"}
            className="mt-1 w-full h-10 px-3 rounded-md border bg-background" />
        </label>
        {kind === "sp" && (
          <div className="space-y-2">
            <Select label="District" value={district} options={listDistricts()}
              onChange={(v) => { setDistrict(v); const r = regionsOfDistrict(v); setRegion(r[0] ?? ""); setDept(departementsOfRegion(r[0] ?? "")[0] ?? ""); }} />
            <Select label="Région" value={region} options={regionsOfDistrict(district)}
              onChange={(v) => { setRegion(v); setDept(departementsOfRegion(v)[0] ?? ""); }} />
            <Select label="Département" value={dept} options={departementsOfRegion(region)} onChange={setDept} />
          </div>
        )}
        {kind === "parc" && (
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">Notes (optionnel)</span>
            <input value={extra} onChange={(e) => setExtra(e.target.value)} className="mt-1 w-full h-10 px-3 rounded-md border bg-background" />
          </label>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 h-10 rounded-md border">Annuler</button>
          <button onClick={save} className="flex-1 h-10 rounded-md bg-primary text-primary-foreground font-semibold">Créer</button>
        </div>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <input list={`opts-${label}`} value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-10 px-3 rounded-md border bg-background" />
      <datalist id={`opts-${label}`}>
        {options.map((o) => <option key={o} value={o} />)}
      </datalist>
    </label>
  );
}
