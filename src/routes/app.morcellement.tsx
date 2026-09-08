import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlanPreview } from "@/components/PlanPreview";
import { SearchSelect } from "@/components/SearchSelect";
import { useIsMobile } from "@/hooks/use-mobile";
import { db, isBrowser } from "@/lib/db";
import { refOfficielle } from "@/lib/ref";
import { syncNow } from "@/lib/sync";
import { buildPlan } from "@/lib/morcellement-engine";
import type { Domaine, Lot, Measurement, MorcPlan, Parcelle, SP } from "@/lib/types";
import {
  defaultConfig, ETAPES, TOLERANCE_M2,
  type ApercuMode, type Assignation, type MorcConfig, type PlanResult,
} from "@/lib/morcellement-v11";

export const Route = createFileRoute("/app/morcellement")({
  validateSearch: (s: Record<string, unknown>): { parcelle?: string; measurement?: string } => ({
    parcelle: typeof s['parcelle'] === "string" ? s['parcelle'] : undefined,
    measurement: typeof s['measurement'] === "string" ? s['measurement'] : undefined,
  }),
  component: MorcellementPage,
  head: () => ({
    meta: [
      { title: "Morcellement intelligent — AcreMap" },
      { name: "description", content: "Découper une parcelle levée au GPS en lots conformes, avec voirie, partage et assignations enregistrés." },
      { property: "og:title", content: "Morcellement intelligent — AcreMap" },
      { property: "og:description", content: "Moteur de morcellement réel : voirie, partage AC/propriétaire, points de collecte, lots et assignations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface StoredPlanPayload { cfg: MorcConfig; plan: PlanResult }

function MorcellementPage() {
  const isMobile = useIsMobile();

  const [parcelles, setParcelles] = useState<Parcelle[]>([]);
  const [domaines, setDomaines] = useState<Domaine[]>([]);
  const [sps, setSps] = useState<SP[]>([]);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [parcelleId, setParcelleId] = useState("");
  const [measurementId, setMeasurementId] = useState("");

  const [cfg, setCfg] = useState<MorcConfig>(defaultConfig());
  const [phase, setPhase] = useState<"config" | "generation" | "resultat">("config");
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [mode, setMode] = useState<ApercuMode>("global");
  const [selected, setSelected] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Record<string, Assignation>>({});
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const timers = useRef<number[]>([]);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // --- Chargement du cache local (alimenté par la synchronisation cloud) -----
  useEffect(() => {
    if (!isBrowser()) return;
    void (async () => {
      const local = db();
      const [p, d, s, m] = await Promise.all([
        local.parcelles.toArray(), local.domaines.toArray(),
        local.sps.toArray(), local.measurements.toArray(),
      ]);
      setParcelles(p.filter((x) => !x.archivedAt));
      setDomaines(d); setSps(s);
      setMeasurements(m);
      setLoaded(true);
    })();
    return () => { timers.current.forEach((t) => window.clearTimeout(t)); };
  }, []);

  const parcelle = parcelles.find((p) => p.id === parcelleId) ?? null;
  const domaine = parcelle ? domaines.find((d) => d.id === parcelle.domaineId) ?? null : null;
  const sp = domaine ? sps.find((x) => x.id === domaine.spId) ?? null : null;

  const releves = useMemo(
    () => measurements
      .filter((m) => m.parcelleId === parcelleId && m.points.length >= 3)
      .sort((a, b) => b.createdAt - a.createdAt),
    [measurements, parcelleId],
  );
  const releve = releves.find((m) => m.id === measurementId) ?? null;

  const reference = parcelle
    ? refOfficielle({
        conv: parcelle.conventionStatus === "AC" ? "AC" : "PP",
        spCode: sp?.code ?? "SP—", domCode: domaine?.code ?? "DOM—", parcCode: parcelle.code,
      })
    : "—";

  useEffect(() => {
    setMeasurementId(releves[0]?.id ?? "");
  }, [parcelleId, releves.length]);

  // --- Restauration du dernier plan enregistré pour la parcelle -------------
  useEffect(() => {
    if (!parcelleId || !isBrowser()) {
      setPlan(null); setPlanId(null); setAssigned({}); setPhase("config");
      return;
    }
    void (async () => {
      const local = db();
      const stored = (await local.plans.where("parcelleId").equals(parcelleId).toArray())
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!stored) { setPlan(null); setPlanId(null); setAssigned({}); setPhase("config"); return; }
      const payload = stored.config as StoredPlanPayload | null;
      if (payload?.plan && payload?.cfg) {
        setCfg({ ...defaultConfig(), ...payload.cfg });
        setPlan(payload.plan);
        setPlanId(stored.id);
        setPhase("resultat");
        if (stored.measurementId) setMeasurementId(stored.measurementId);
      }
      const lots = await local.lots.where("parcelleId").equals(parcelleId).toArray();
      const map: Record<string, Assignation> = {};
      lots.filter((l) => l.planId === stored.id && l.assigneeName).forEach((l) => {
        map[l.code] = { nom: l.assigneeName ?? "", contact: l.assigneeContact ?? "", compte: l.assigneeAccount ?? "" };
      });
      setAssigned(map);
    })();
  }, [parcelleId]);

  const set = <K extends keyof MorcConfig>(k: K, v: MorcConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const lots = useMemo(() => plan?.lots.filter((l) => l.kind === "lot") ?? [], [plan]);
  const nonConformes = lots.filter((l) => !l.conforme);

  // --- Enregistrement local + cloud ----------------------------------------
  const persist = useCallback(async (result: PlanResult, config: MorcConfig, assignations: Record<string, Assignation>) => {
    if (!parcelle || !releve || !isBrowser()) return null;
    const local = db();
    const id = planId ?? crypto.randomUUID();
    const row: MorcPlan = {
      id,
      parcelleId: parcelle.id,
      measurementId: releve.id,
      reference,
      config: { cfg: config, plan: result } satisfies StoredPlanPayload,
      score: result.score,
      targetM2: result.cibleM2,
      totalM2: result.totalM2,
      conforme: result.conforme,
      status: "draft",
      createdAt: planId ? (await local.plans.get(id))?.createdAt ?? Date.now() : Date.now(),
    };
    await local.plans.put(row);
    syncNow("morcellement_plans", id);

    // Les lots du plan remplacent la version précédente du même plan.
    const previous = (await local.lots.where("parcelleId").equals(parcelle.id).toArray())
      .filter((l) => l.planId === id);
    const byCode = new Map(previous.map((l) => [l.code, l]));

    for (const l of result.lots) {
      const existing = byCode.get(l.code);
      const a = assignations[l.code];
      const lot: Lot = {
        id: existing?.id ?? crypto.randomUUID(),
        parcelleId: parcelle.id,
        measurementId: releve.id,
        code: l.code,
        polygon: (l.geo ?? []).map((p) => ({ lat: p.lat, lng: p.lng })),
        bornes: l.bornes ?? [],
        areaM2: l.reelM2,
        isReserve: l.kind !== "lot",
        planId: id,
        part: l.part,
        kind: l.kind,
        label: l.label,
        targetAreaM2: l.cibleM2,
        assigneeName: a?.nom,
        assigneeContact: a?.contact,
        assigneeAccount: a?.compte,
        assignedAt: a ? Date.now() : undefined,
      };
      await local.lots.put(lot);
      syncNow("lots", lot.id);
      byCode.delete(l.code);
    }
    // Lots disparus du nouveau découpage
    for (const orphan of byCode.values()) {
      await local.lots.delete(orphan.id);
    }
    setPlanId(id);
    return id;
  }, [parcelle, releve, planId, reference]);

  const lancer = () => {
    if (!parcelle || !releve) { notify("Choisissez d'abord une parcelle et un relevé."); return; }
    const perimeter = releve.points.map((p) => ({ lat: p.lat, lng: p.lng }));
    setPhase("generation"); setStep(0); setPlan(null); setSelected(null);
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = ETAPES.map((_, i) => window.setTimeout(() => {
      setStep(i + 1);
      if (i === ETAPES.length - 1) {
        try {
          const result = buildPlan({ perimeter, config: cfg });
          setPlan(result);
          setPhase("resultat");
          setSaving(true);
          void persist(result, cfg, assigned)
            .then(() => notify("Plan enregistré — disponible hors ligne et synchronisé au retour du réseau."))
            .catch(() => notify("Plan calculé, enregistrement en attente de réseau."))
            .finally(() => setSaving(false));
        } catch {
          setPhase("config");
          notify("Le découpage n'a pas pu être calculé sur ce relevé.");
        }
      }
    }, 320 * (i + 1)));
  };

  const saveAssignation = async (code: string, a: Assignation) => {
    const next = { ...assigned, [code]: a };
    setAssigned(next);
    setAssignFor(null);
    if (plan) {
      setSaving(true);
      try { await persist(plan, cfg, next); notify(`Lot ${code} assigné à ${a.nom}.`); }
      catch { notify(`Lot ${code} assigné — envoi au cloud en attente.`); }
      finally { setSaving(false); }
    }
  };

  const demoExport = (name: string) => notify(`Export préparé — ${name}`);

  const parcelleOptions = parcelles.map((p) => ({
    value: p.id,
    label: `${p.code} — ${p.ownerName}`,
    hint: domaines.find((d) => d.id === p.domaineId)?.name ?? "",
  }));
  const releveOptions = releves.map((m) => ({
    value: m.id,
    label: `${new Date(m.createdAt).toLocaleDateString("fr-FR")} — ${(m.areaM2 / 10000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha`,
    hint: `${m.points.length} bornes · ${m.status}`,
  }));

  return (
    <div className="p-3 sm:p-4 lg:p-8 max-w-[1600px] mx-auto space-y-4 lg:space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Découpage intelligent</div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Morcellement intelligent</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Calcul sur le périmètre réellement levé · plans, lots et assignations enregistrés.
          </p>
        </div>
        <div className="text-xs px-3 py-2 rounded-xl bg-warn/15 text-warn border border-warn/30 font-medium">
          Tolérance : ±{TOLERANCE_M2} m² par lot
        </div>
      </header>

      <div className="grid xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-4 lg:gap-5 items-start">
        {/* ---------------- Colonne configuration ---------------- */}
        <div className="space-y-3 lg:space-y-4">
          <Card title="A — Parcelle et relevé" defaultOpen isMobile={isMobile} alwaysOpen>
            <Field label="Parcelle">
              <SearchSelect value={parcelleId} options={parcelleOptions} onChange={setParcelleId}
                placeholder={loaded ? "Choisir une parcelle…" : "Chargement…"} />
            </Field>
            <Field label="Relevé GPS">
              <SearchSelect value={measurementId} options={releveOptions} onChange={setMeasurementId}
                placeholder={parcelleId ? "Choisir un relevé…" : "Choisir d'abord une parcelle"}
                disabled={!parcelleId} emptyLabel="Aucun relevé pour cette parcelle" />
            </Field>
            <Row k="Référence" v={reference} />
            <Row k="Superficie levée" v={releve ? `${(releve.areaM2 / 10000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha` : "—"} />
            <Row k="Bornes" v={releve ? String(releve.points.length) : "—"} />
            <Row k="Localisation" v={sp ? `${sp.name} · ${sp.region}` : "—"} />
            <Row k="Référence spatiale" v="WGS84 / UTM 30N" />
          </Card>

          <Card title="B — Objectif de morcellement" isMobile={isMobile}>
            <Field label="Type">
              <Select value={cfg.objectif} onChange={(v) => set("objectif", v as MorcConfig["objectif"])}
                options={[
                  ["lots_fixes", "Lots de superficie fixe"],
                  ["partage_ac", "Partage AC / Propriétaire"],
                  ["partage_perso", "Partage personnalisé"],
                  ["autre", "Autre configuration"],
                ]} />
            </Field>
            <Field label="Superficie cible">
              <Select value={cfg.cibleLibre ? "autre" : String(cfg.cibleHa)}
                onChange={(v) => v === "autre" ? set("cibleLibre", true) : (setCfg((c) => ({ ...c, cibleLibre: false, cibleHa: Number(v) })))}
                options={[...Array.from({ length: 9 }, (_, i) => [String(i + 1), `${i + 1} ha`] as [string, string]), ["autre", "Autre…"]]} />
            </Field>
            {cfg.cibleLibre && (
              <Field label="Superficie libre (ha)">
                <Num value={cfg.cibleHa} step={0.1} min={0.1} onChange={(v) => set("cibleHa", v)} />
              </Field>
            )}
            <Field label="Orientation du morcellement">
              <Select value={cfg.orientation} onChange={(v) => set("orientation", v as MorcConfig["orientation"])}
                options={[["auto", "Automatique — recommandé"], ["horizontale", "Horizontale"], ["verticale", "Verticale"],
                  ["geometrie", "Suivre la géométrie"], ["personnalisee", "Personnalisée"]]} />
            </Field>
            <p className="text-[11px] text-muted-foreground">
              L'orientation est une préférence : le moteur l'adapte à la géométrie réelle.
            </p>
          </Card>

          <Card title="C — Partage AC / Propriétaire" isMobile={isMobile}>
            <Check label="Activer le partage AC / Propriétaire" checked={cfg.partageActif}
              onChange={(v) => set("partageActif", v)} />
            {cfg.partageActif && (
              <>
                <Field label={`Part AgriCapital — ${cfg.partAcPct} %`}>
                  <input type="range" min={0} max={100} value={cfg.partAcPct} className="w-full"
                    onChange={(e) => set("partAcPct", Number(e.target.value))} />
                </Field>
                <Row k="Part Propriétaire" v={`${100 - cfg.partAcPct} %`} />
                <Field label="Organisation du partage">
                  <Select value={cfg.organisationPartage} onChange={(v) => set("organisationPartage", v as MorcConfig["organisationPartage"])}
                    options={[["auto", "Automatique"], ["horizontale", "Horizontale"], ["verticale", "Verticale"],
                      ["blocs", "Par blocs"], ["personnalisee", "Personnalisée"]]} />
                </Field>
              </>
            )}
          </Card>

          <Card title="D — Voirie et accès" isMobile={isMobile}>
            <Check label="Activer une voie principale" checked={cfg.voiePrincipale} onChange={(v) => set("voiePrincipale", v)} />
            {cfg.voiePrincipale && (
              <>
                <Field label="Largeur">
                  <Select value={String(cfg.largeurVoieM)} onChange={(v) => set("largeurVoieM", Number(v))}
                    options={[["4", "4 m"], ["5", "5 m"], ["6", "6 m"], ["8", "8 m"], ["10", "10 m"]]} />
                </Field>
                <Field label="Positionnement">
                  <Select value={cfg.positionVoie} onChange={(v) => set("positionVoie", v as MorcConfig["positionVoie"])}
                    options={[["auto", "Automatique"], ["traversante", "Traversante"], ["laterale", "Latérale"],
                      ["centrale", "Centrale"], ["personnalisee", "Personnalisée"]]} />
                </Field>
                <Field label="Orientation de la voie">
                  <Select value={cfg.orientationVoie} onChange={(v) => set("orientationVoie", v as MorcConfig["orientationVoie"])}
                    options={[["auto", "Automatique"], ["horizontale", "Horizontale"], ["verticale", "Verticale"], ["terrain", "Suivre le terrain"]]} />
                </Field>
              </>
            )}
            <div className="h-px bg-border my-1" />
            <Check label="Ajouter des voies secondaires" checked={cfg.voiesSecondaires} onChange={(v) => set("voiesSecondaires", v)} />
            {cfg.voiesSecondaires && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Largeur (m)"><Num value={cfg.largeurVoieSecM} min={2} step={1} onChange={(v) => set("largeurVoieSecM", v)} /></Field>
                <Field label="Nombre"><Num value={cfg.nbVoiesSec} min={0} step={1} onChange={(v) => set("nbVoiesSec", v)} /></Field>
                <Field label="Orientation">
                  <Select value={cfg.orientationVoieSec} onChange={(v) => set("orientationVoieSec", v as MorcConfig["orientationVoieSec"])}
                    options={[["auto", "Automatique"], ["horizontale", "Horizontale"], ["verticale", "Verticale"], ["adaptative", "Adaptative"]]} />
                </Field>
                <Field label="Fréquence">
                  <Select value={String(cfg.frequenceLots)} onChange={(v) => set("frequenceLots", Number(v))}
                    options={[["2", "Tous les 2 lots"], ["3", "Tous les 3 lots"], ["4", "Tous les 4 lots"],
                      ["5", "Tous les 5 lots"], ["6", "Tous les 6 lots"]]} />
                </Field>
              </div>
            )}
          </Card>

          <Card title="E — Points de collecte" isMobile={isMobile}>
            <Check label="Ajouter des points de collecte" checked={cfg.collecteActive} onChange={(v) => set("collecteActive", v)} />
            {cfg.collecteActive && (
              <>
                <Field label="Nombre de points">
                  <Num value={cfg.nbCollecte} min={1} max={6} step={1} onChange={(v) => {
                    const n = Math.max(1, Math.min(6, Math.round(v)));
                    setCfg((c) => ({
                      ...c,
                      nbCollecte: n,
                      collecte: Array.from({ length: n }, (_, i) => c.collecte[i] ?? {
                        id: `PC${i + 1}`, type: i === 0 ? "principal" : "secondaire", areaM2: 1000,
                      }),
                    }));
                  }} />
                </Field>
                {cfg.collecte.slice(0, cfg.nbCollecte).map((pc, i) => (
                  <div key={pc.id} className="grid grid-cols-2 gap-2 items-end">
                    <Field label={`${pc.id} — type`}>
                      <Select value={pc.type} onChange={(v) => setCfg((c) => ({
                        ...c, collecte: c.collecte.map((x, j) => j === i ? { ...x, type: v as "principal" | "secondaire" } : x),
                      }))} options={[["principal", "Principal"], ["secondaire", "Secondaire"]]} />
                    </Field>
                    <Field label="Superficie (m²)">
                      <Num value={pc.areaM2} min={100} step={100} onChange={(v) => setCfg((c) => ({
                        ...c, collecte: c.collecte.map((x, j) => j === i ? { ...x, areaM2: v } : x),
                      }))} />
                    </Field>
                  </div>
                ))}
              </>
            )}
          </Card>

          <Card title="F — Réserve familiale" isMobile={isMobile}>
            <Check label="Réserver une superficie pour la famille" checked={cfg.reserveActive}
              onChange={(v) => set("reserveActive", v)} />
            {cfg.reserveActive && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Superficie (m²)"><Num value={cfg.reserveM2} min={100} step={100} onChange={(v) => set("reserveM2", v)} /></Field>
                <Field label="Nom de la famille">
                  <input className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
                    value={cfg.familleNom} onChange={(e) => set("familleNom", e.target.value)} />
                </Field>
              </div>
            )}
          </Card>

          <Card title="G — Optimisation" isMobile={isMobile}>
            <div className="space-y-1.5">
              {([
                ["superficie", "Respecter strictement les superficies"],
                ["acces", "Garantir l'accès de chaque lot"],
                ["residuels", "Réduire les espaces résiduels"],
                ["etroits", "Éviter les lots étroits"],
                ["formes", "Éviter les formes difficilement exploitables"],
                ["circulation", "Optimiser la circulation"],
                ["positionVoies", "Optimiser la position des voies"],
                ["positionCollecte", "Optimiser la position des points de collecte"],
                ["partage", "Respecter le partage AC / Propriétaire"],
                ["orientationAuto", "Adapter automatiquement l'orientation"],
              ] as [keyof MorcConfig["optim"], string][]).map(([k, label]) => (
                <Check key={k} label={label} checked={cfg.optim[k]}
                  onChange={(v) => setCfg((c) => ({ ...c, optim: { ...c.optim, [k]: v } }))} />
              ))}
            </div>
            <Field label="Priorité">
              <Select value={cfg.priorite} onChange={(v) => set("priorite", v as MorcConfig["priorite"])}
                options={[["auto", "Automatique — recommandé"], ["superficie", "Superficie"], ["accessibilite", "Accessibilité"],
                  ["formes", "Forme des lots"], ["voirie", "Voirie"], ["equilibre", "Équilibre global"]]} />
            </Field>
          </Card>

          <button onClick={lancer} disabled={phase === "generation" || !releve}
            className="w-full py-4 rounded-2xl bg-gradient-to-br from-primary to-secondary text-primary-foreground font-bold text-base sm:text-lg shadow-card disabled:opacity-60">
            {phase === "generation" ? "Génération en cours…" : "MORCELER LA PARCELLE"}
          </button>
          {!releve && loaded && (
            <p className="text-xs text-muted-foreground text-center">
              Sélectionnez une parcelle disposant d'un relevé GPS validé.
            </p>
          )}
        </div>

        {/* ---------------- Colonne aperçu ---------------- */}
        <div className="space-y-3 lg:space-y-4">
          <section className="bg-card rounded-2xl shadow-card overflow-hidden">
            <div className="p-3 border-b flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-sm sm:text-base">Prévisualisation</h2>
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                {([["global", "Global"], ["entreprise", "Entreprise"], ["client", "Client"]] as [ApercuMode, string][])
                  .map(([m, l]) => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`px-2.5 sm:px-3 py-1.5 rounded-md text-xs font-medium ${mode === m ? "bg-card shadow-card text-primary" : "text-muted-foreground"}`}>
                      {l}
                    </button>
                  ))}
              </div>
            </div>

            <div className="aspect-square sm:aspect-[4/3] bg-muted/40 relative">
              {phase === "config" && !plan && (
                <div className="absolute inset-0 grid place-items-center text-center p-6">
                  <div>
                    <div className="text-5xl">🗺️</div>
                    <p className="mt-3 font-medium">Avant morcellement</p>
                    <p className="text-sm text-muted-foreground">
                      Choisissez la parcelle et le relevé, puis lancez « MORCELER LA PARCELLE ».
                    </p>
                  </div>
                </div>
              )}
              {phase === "generation" && (
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="w-full max-w-sm space-y-3">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(step / ETAPES.length) * 100}%` }} />
                    </div>
                    <ul className="space-y-1.5 text-sm">
                      {ETAPES.map((e, i) => (
                        <li key={e} className={i < step ? "text-primary font-medium" : "text-muted-foreground"}>
                          {i < step ? "✓" : "•"} {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {phase === "resultat" && plan && (
                <div className="absolute inset-0 p-2 sm:p-3">
                  <PlanPreview plan={plan} mode={mode} selected={selected} reference={reference}
                    assigned={Object.fromEntries(Object.entries(assigned).map(([k, v]) => [k, { nom: v.nom, compte: v.compte }]))}
                    onSelect={(c) => setSelected(c)} />
                </div>
              )}
            </div>

            {plan && (
              <div className="p-3 border-t flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] sm:text-xs text-muted-foreground">
                <Legend token="--primary" pct={35} label="Lots AgriCapital" />
                <Legend token="--secondary" pct={30} label="Lots propriétaire" />
                <Legend token="--accent" pct={35} label="Réserve / reliquat" />
                <Legend token="--warn" pct={40} label="Point de collecte" />
                <Legend token="--destructive" pct={35} label="Hors tolérance" />
                <Legend token="--foreground" pct={20} label="Voirie" />
              </div>
            )}
          </section>

          {plan && (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3">
                <ScoreCard label="Score global" value={plan.score.global} big />
                <ScoreCard label="Superficies" value={plan.score.superficies} />
                <ScoreCard label="Accessibilité" value={plan.score.accessibilite} />
                <ScoreCard label="Formes" value={plan.score.formes} />
                <ScoreCard label="Voies" value={plan.score.voies} />
                <ScoreCard label="Espaces résiduels" value={plan.score.residuels} />
              </section>

              <div className={`rounded-xl p-3 text-sm border ${plan.conforme
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-destructive/10 border-destructive/30 text-destructive"}`}>
                {plan.conforme
                  ? `Résultat optimisé — ${lots.length} lots conformes à ±${TOLERANCE_M2} m².`
                  : `${nonConformes.length} lot(s) hors tolérance : ${nonConformes.map((l) => l.code).join(", ")}.`}
              </div>

              <section className="bg-card rounded-2xl shadow-card overflow-hidden">
                <div className="p-3 border-b font-semibold flex items-center justify-between gap-2">
                  <span>Tableau des lots ({lots.length})</span>
                  {saving && <span className="text-[11px] font-normal text-muted-foreground">Enregistrement…</span>}
                </div>

                {/* Téléphone : deux colonnes de fiches */}
                <div className="grid grid-cols-2 gap-2 p-2 lg:hidden max-h-[460px] overflow-y-auto">
                  {lots.map((l) => {
                    const ecart = l.reelM2 - l.cibleM2;
                    return (
                      <div key={l.code}
                        className={`rounded-xl border p-2.5 space-y-1 ${selected === l.code ? "border-primary bg-primary/5" : ""}`}>
                        <button className="font-semibold text-sm"
                          onClick={() => { setSelected(l.code); setMode("client"); }}>{l.code}</button>
                        <div className="text-[11px] text-muted-foreground">
                          {l.part === "ac" ? "AgriCapital" : "Propriétaire"}
                        </div>
                        <div className="text-xs font-medium">{l.reelM2.toLocaleString("fr-FR")} m²</div>
                        <div className={`text-[11px] ${l.conforme ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                          {ecart > 0 ? "+" : ""}{ecart.toLocaleString("fr-FR")} m²
                        </div>
                        <div className="text-[11px] truncate">
                          {assigned[l.code] ? assigned[l.code].nom : <span className="text-muted-foreground">Non assigné</span>}
                        </div>
                        <button onClick={() => setAssignFor(l.code)}
                          className="w-full text-[11px] px-2 py-1 rounded-md border">
                          {assigned[l.code] ? "Modifier" : "Assigner"}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Ordinateur : tableau complet */}
                <div className="hidden lg:block overflow-x-auto max-h-[420px]">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/60 text-xs uppercase text-muted-foreground sticky top-0">
                      <tr>
                        <Th>Lot</Th><Th>Part</Th><Th>Cible</Th><Th>Réel</Th><Th>Écart</Th><Th>Statut</Th><Th>Client</Th><Th> </Th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lots.map((l) => {
                        const ecart = l.reelM2 - l.cibleM2;
                        return (
                          <tr key={l.code} className={`${selected === l.code ? "bg-primary/5" : ""} hover:bg-muted/40`}>
                            <Td><button className="font-semibold underline-offset-2 hover:underline"
                              onClick={() => { setSelected(l.code); setMode("client"); }}>{l.code}</button></Td>
                            <Td>{l.part === "ac" ? "AgriCapital" : "Propriétaire"}</Td>
                            <Td>{l.cibleM2.toLocaleString("fr-FR")} m²</Td>
                            <Td>{l.reelM2.toLocaleString("fr-FR")} m²</Td>
                            <Td className={l.conforme ? "" : "text-destructive font-medium"}>
                              {ecart > 0 ? "+" : ""}{ecart.toLocaleString("fr-FR")} m²
                            </Td>
                            <Td>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${l.conforme
                                ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                                {l.conforme ? "CONFORME" : "NON CONFORME"}
                              </span>
                            </Td>
                            <Td className="text-xs">
                              {assigned[l.code]
                                ? <span>{assigned[l.code].nom}<br /><span className="text-muted-foreground">{assigned[l.code].compte}</span></span>
                                : <span className="text-muted-foreground">—</span>}
                            </Td>
                            <Td>
                              <button onClick={() => setAssignFor(l.code)}
                                className="text-xs px-2.5 py-1 rounded-md border hover:bg-muted">
                                {assigned[l.code] ? "Modifier" : "Assigner"}
                              </button>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-card rounded-2xl shadow-card p-4 space-y-3">
                <h3 className="font-semibold">Exports</h3>
                <div className="grid sm:grid-cols-2 gap-2">
                  <Exp onClick={() => demoExport(`${reference} — plan global`)}
                    t="PDF Plan Global" s="Cotes & coordonnées relatives" />
                  <Exp onClick={() => demoExport(`${reference} — plan entreprise`)}
                    t="PDF Plan Entreprise" s="Part AgriCapital · cotes & coordonnées" />
                  <Exp onClick={() => demoExport(`${reference} — lot ${selected ?? lots[0]?.code ?? "—"}`)}
                    t="PDF Plan Client" s={`Lot ${selected ?? lots[0]?.code ?? "—"} · cotes & coordonnées`} />
                  <Exp onClick={() => demoExport(`${reference} — tableau des lots`)}
                    t="Tableau des lots" s="Superficies, parts et assignations" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">Format :</span>
                  {["A4", "A3", "A2", "A1", "A0"].map((f) => (
                    <span key={f} className="text-xs px-2 py-1 rounded-md border">{f}</span>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {assignFor && (
        <AssignDialog
          code={assignFor}
          initial={assigned[assignFor]}
          onClose={() => setAssignFor(null)}
          onSave={(a) => { void saveAssignation(assignFor, a); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-foreground text-background text-sm shadow-elevated max-w-[92vw]">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- sous-composants ------------------------------- */

function AssignDialog({ code, initial, onClose, onSave }: {
  code: string; initial?: Assignation; onClose: () => void; onSave: (a: Assignation) => void;
}) {
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [contact, setContact] = useState(initial?.contact ?? "");
  const [compte, setCompte] = useState(initial?.compte ?? "");
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-elevated w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold">Assigner le lot {code}</h3>
        <Field label="Nom complet">
          <input className="w-full px-3 py-2 rounded-lg border bg-background text-sm" value={nom} onChange={(e) => setNom(e.target.value)} />
        </Field>
        <Field label="Contact">
          <input className="w-full px-3 py-2 rounded-lg border bg-background text-sm" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <Field label="Numéro de compte client">
          <input className="w-full px-3 py-2 rounded-lg border bg-background text-sm" value={compte} onChange={(e) => setCompte(e.target.value)} />
        </Field>
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-lg border text-sm">Annuler</button>
          <button disabled={!nom.trim()} onClick={() => onSave({ nom: nom.trim(), contact, compte })}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
            Assigner
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children, isMobile, defaultOpen, alwaysOpen }: {
  title: string; children: React.ReactNode; isMobile: boolean; defaultOpen?: boolean; alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = alwaysOpen ? true : (open ?? (!isMobile || Boolean(defaultOpen)));
  return (
    <section className="bg-card rounded-2xl shadow-card p-4 space-y-3">
      <button type="button" disabled={alwaysOpen}
        onClick={() => setOpen(!shown)}
        className="w-full flex items-center justify-between gap-2 text-left">
        <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
        {!alwaysOpen && (
          <span className={`text-muted-foreground transition-transform ${shown ? "rotate-180" : ""}`}>▾</span>
        )}
      </button>
      {shown && <div className="space-y-3">{children}</div>}
    </section>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-3 text-sm"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right break-all">{v}</span></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1"><span className="text-xs font-medium text-muted-foreground">{label}</span>{children}</label>;
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 rounded-lg border bg-background text-sm">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
function Num({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return <input type="number" value={value} min={min} max={max} step={step}
    onChange={(e) => onChange(Number(e.target.value))}
    className="w-full px-3 py-2 rounded-lg border bg-background text-sm" />;
}
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 accent-primary" />
      <span>{label}</span>
    </label>
  );
}
function ScoreCard({ label, value, big }: { label: string; value: number; big?: boolean }) {
  const tone = value >= 85 ? "text-primary" : value >= 70 ? "text-warn" : "text-destructive";
  return (
    <div className="bg-card rounded-xl shadow-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold ${big ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"} ${tone}`}>{value}<span className="text-xs text-muted-foreground">/100</span></div>
    </div>
  );
}
function Legend({ token, pct, label }: { token: string; pct: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm border" style={{ background: `color-mix(in oklab, var(${token}) ${pct}%, transparent)` }} />
      {label}
    </span>
  );
}
function Exp({ t, s, onClick }: { t: string; s: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="text-left p-3 rounded-xl border hover:bg-muted/50 transition-colors">
      <div className="font-medium text-sm">{t}</div>
      <div className="text-xs text-muted-foreground">{s}</div>
    </button>
  );
}
function Th({ children }: { children: React.ReactNode }) { return <th className="text-left font-medium px-3 py-2">{children}</th>; }
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) { return <td className={`px-3 py-2 ${className}`}>{children}</td>; }
