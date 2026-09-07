import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useMemo, useState } from "react";
import { db, isBrowser } from "@/lib/db";
import { nextSequentialCode } from "@/lib/ref";
import { SearchSelect } from "@/components/SearchSelect";
import { buildSpChoices, ensureSpByName } from "@/lib/sp-registry";
import { fileToDataUrl } from "@/lib/photo";
import { feedbackSuccess } from "@/lib/feedback";
import { syncEntity, pullFromCloud } from "@/lib/sync";

export const Route = createFileRoute("/app/parcelles/new")({
  component: NewParcelleWizard,
  head: () => ({
    meta: [
      { title: "Nouveau levé — parcelle & propriétaire | AcreMap" },
      { name: "description", content: "Créer une parcelle : localisation administrative, domaine, propriétaire et photos avant la mesure GPS." },
      { property: "og:title", content: "Nouveau levé — parcelle & propriétaire | AcreMap" },
      { property: "og:description", content: "Identifiez la parcelle et son propriétaire avant de lancer la mesure GPS." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Step = 1 | 2 | 3 | 4;

const uniq = (arr: (string | undefined | null)[]) =>
  Array.from(new Set(arr.map((v) => (v ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "fr"));

function NewParcelleWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);

  // Étape 1 — sous-préfecture (le reste de la hiérarchie est auto-rempli)
  const [spName, setSpName] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [spBusy, setSpBusy] = useState(false);
  const [spMsg, setSpMsg] = useState<string | null>(null);

  // Étape 2 — domaine
  const [domaineExistingId, setDomaineExistingId] = useState<string>("");
  const [domaineName, setDomaineName] = useState("");

  // Étape 3 — parcelle
  const [parcelleName, setParcelleName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [conventionStatus, setConventionStatus] = useState<"PP" | "AC" | "EN_COURS">("PP");
  const [declaredArea, setDeclaredArea] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Étape 4 — photos
  const [ownerPhoto, setOwnerPhoto] = useState<string>("");
  const [groupPhoto, setGroupPhoto] = useState<string>("");
  const [parcellePhoto, setParcellePhoto] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const existing = useLiveQuery(async () => {
    if (!isBrowser()) return null;
    const d = db();
    const [sps, domaines, parcelles] = await Promise.all([
      d.sps.toArray(), d.domaines.toArray(), d.parcelles.toArray(),
    ]);
    return { sps, domaines, parcelles };
  }, []);

  // Référentiel national + sous-préfectures déjà déployées
  const spChoices = useMemo(() => buildSpChoices(existing?.sps ?? []), [existing]);
  const spOptions = useMemo(
    () => spChoices.map((c) => ({
      value: c.name,
      label: c.code ? `${c.code} · ${c.name}` : c.name,
      hint: [c.departement, c.region, c.district].filter(Boolean).join(" · "),
    })),
    [spChoices],
  );
  const selectedSp = useMemo(
    () => spChoices.find((c) => c.name === spName) ?? null,
    [spChoices, spName],
  );
  const ownerOptions = useMemo(() => uniq(existing?.parcelles.map((p) => p.ownerName) ?? []), [existing]);

  // SP déjà enregistrée (référence officielle existante)
  const matchingSp = useMemo(() => {
    if (!existing || !selectedSp?.id) return null;
    return existing.sps.find((s) => s.id === selectedSp.id) ?? null;
  }, [existing, selectedSp]);

  async function refreshSps() {
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      await pullFromCloud();
      setRefreshMsg("Liste des sous-préfectures à jour.");
    } catch {
      setRefreshMsg("Rafraîchissement impossible (hors ligne ?).");
    } finally {
      setRefreshing(false);
    }
  }

  const domainesOfSp = useMemo(() => {
    if (!existing) return [];
    if (matchingSp) return existing.domaines.filter((d) => d.spId === matchingSp.id);
    return existing.domaines;
  }, [existing, matchingSp]);

  async function submit() {
    if (!existing) return;
    setError(null);
    if (!spName.trim()) return setError("Renseignez le nom de la sous-préfecture.");
    if (!domaineExistingId && !domaineName.trim()) return setError("Sélectionnez ou nommez un domaine.");
    if (!ownerName.trim()) return setError("Renseignez le nom du propriétaire.");

    setSaving(true);
    try {
      const d = db();

      // SP — réutilise la référence existante ou la crée automatiquement (SP00X)
      setSpBusy(true);
      setSpMsg("Attribution de la référence sous-préfecture…");
      const { sp, created } = await ensureSpByName(spName);
      const spId = sp.id;
      setSpBusy(false);
      setSpMsg(created
        ? `Référence créée automatiquement : ${sp.code} · ${sp.name}`
        : `Sous-préfecture existante : ${sp.code} · ${sp.name}`);

      // Domaine — réutilise ou crée
      let domId: string;
      if (domaineExistingId) {
        domId = domaineExistingId;
      } else {
        const already = existing.domaines.find(
          (x) => x.spId === spId && x.name.toLowerCase() === domaineName.trim().toLowerCase(),
        );
        if (already) {
          domId = already.id;
        } else {
          const code = nextSequentialCode("DOM", existing.domaines.map((x) => x.code));
          domId = crypto.randomUUID();
          await d.domaines.put({
            id: domId, code, name: domaineName.trim(), spId, createdAt: Date.now(),
          });
          void syncEntity("domaines", domId).catch(() => {});
        }
      }

      // Parcelle
      const parcCode = nextSequentialCode("PARC", existing.parcelles.map((x) => x.code));
      const parcId = crypto.randomUUID();
      await d.parcelles.put({
        id: parcId,
        code: parcCode,
        name: parcelleName.trim() || undefined,
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim() || undefined,
        domaineId: domId,
        conventionDate: Date.now(),
        declaredArea: declaredArea ? Number(declaredArea) : undefined,
        notes: notes.trim() || undefined,
        conventionStatus,
        ownerPhoto: ownerPhoto || undefined,
        groupPhoto: groupPhoto || undefined,
        parcellePhoto: parcellePhoto || undefined,
        createdAt: Date.now(),
      });
      void syncEntity("parcelles", parcId).catch(() => {});

      feedbackSuccess();
      navigate({ to: "/app/measure", search: { parcelleId: parcId } as never });
    } catch (e) {
      setSpBusy(false);
      setError(e instanceof Error ? e.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  const canNext1 = !!spName.trim();
  const canNext2 = !!domaineExistingId || !!domaineName.trim();
  const canNext3 = !!ownerName.trim();

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto space-y-5">
      <div>
        <Link to="/app/parcelles" className="text-xs text-muted-foreground hover:underline">← Parcelles</Link>
        <h1 className="text-2xl font-bold mt-1">Nouveau levé</h1>
        <p className="text-sm text-muted-foreground">
          Chaque champ est à la fois une liste de ce qui existe déjà et un champ de saisie :
          sélectionnez une valeur enregistrée, ou tapez une nouvelle valeur — elle sera créée
          et proposée automatiquement les fois suivantes.
        </p>
      </div>

      <Stepper step={step} />

      {error && <div className="text-xs bg-destructive/10 text-destructive px-3 py-2 rounded-md">{error}</div>}

      {step === 1 && (
        <Section title="1 · Sous-préfecture" hint="Sélectionnez la sous-préfecture : district, région et département sont remplis automatiquement.">
          <Field label="Sous-Préfecture">
            <SearchSelect
              value={spName}
              options={spOptions}
              onChange={setSpName}
              placeholder="Sélectionner une sous-préfecture"
            />
          </Field>

          <div className="flex items-center gap-2">
            <button type="button" onClick={refreshSps} disabled={refreshing}
              className="text-xs px-3 py-2 rounded-md border bg-background hover:bg-muted disabled:opacity-50">
              {refreshing ? "Rafraîchissement…" : "↻ Rafraîchir depuis le cloud"}
            </button>
            {refreshMsg && <span className="text-[11px] text-muted-foreground">{refreshMsg}</span>}
          </div>

          {selectedSp && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <ReadOnly label="District" value={selectedSp.district} />
              <ReadOnly label="Région" value={selectedSp.region} />
              <ReadOnly label="Département" value={selectedSp.departement} />
            </div>
          )}

          {selectedSp?.code ? (
            <div className="text-xs bg-success/10 text-success rounded-md px-3 py-2">
              Référence officielle existante : <b>{selectedSp.code} · {selectedSp.name}</b>
            </div>
          ) : selectedSp ? (
            <div className="text-xs bg-warn/10 text-warn rounded-md px-3 py-2">
              Premier déploiement sur cette sous-préfecture — la référence SP00X sera créée
              automatiquement à l'enregistrement.
            </div>
          ) : null}

          {(spBusy || spMsg) && (
            <div className="text-xs flex items-center gap-2 rounded-md px-3 py-2 bg-muted">
              {spBusy && <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
              <span>{spMsg}</span>
            </div>
          )}
        </Section>
      )}

      {step === 2 && (
        <Section title="2 · Domaine" hint="Choisissez un domaine enregistré ou saisissez-en un nouveau.">
          <Field label="Domaine existant">
            <select value={domaineExistingId}
              onChange={(e) => { setDomaineExistingId(e.target.value); if (e.target.value) setDomaineName(""); }}
              className="w-full h-11 px-3 rounded-md border bg-background text-sm">
              <option value="">— Nouveau domaine —</option>
              {domainesOfSp.map((d) => (
                <option key={d.id} value={d.id}>{d.code} · {d.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Ou créer un nouveau domaine">
            <input value={domaineName}
              onChange={(e) => { setDomaineName(e.target.value); if (e.target.value) setDomaineExistingId(""); }}
              placeholder="Nom du domaine (ex : Plantation Gonaté Nord)"
              className="w-full h-11 px-3 rounded-md border bg-background" />
          </Field>
        </Section>
      )}

      {step === 3 && (
        <Section title="3 · Parcelle & propriétaire" hint="Nom de la parcelle, propriétaire et convention.">
          <Field label="Nommer la parcelle">
            <input value={parcelleName} onChange={(e) => setParcelleName(e.target.value)}
              placeholder="Ex : Parcelle Bloc A — bas-fond"
              className="w-full h-11 px-3 rounded-md border bg-background" />
          </Field>
          <ComboField label="Nom du propriétaire / famille" value={ownerName} options={ownerOptions}
            placeholder="Sélectionner ou saisir (ex : Famille Séri)" onChange={setOwnerName} />
          <Field label="Téléphone du propriétaire (optionnel)">
            <input value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)}
              placeholder="+225 …" className="w-full h-11 px-3 rounded-md border bg-background" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label="Type de convention">
              <select value={conventionStatus} onChange={(e) => setConventionStatus(e.target.value as "PP" | "AC" | "EN_COURS")}
                className="w-full h-11 px-3 rounded-md border bg-background">
                <option value="PP">Planté-Partagé</option>
                <option value="AC">Achat / Cession</option>
                <option value="EN_COURS">En cours</option>
              </select>
            </Field>
            <Field label="Surface déclarée (ha)">
              <input value={declaredArea} onChange={(e) => setDeclaredArea(e.target.value)}
                type="number" step="0.1" min="0"
                placeholder="Ex : 5" className="w-full h-11 px-3 rounded-md border bg-background" />
            </Field>
          </div>
          <Field label="Notes (optionnel)">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} className="w-full px-3 py-2 rounded-md border bg-background" />
          </Field>
        </Section>
      )}

      {step === 4 && (
        <Section title="4 · Photos" hint="Photos enregistrées localement puis synchronisées.">
          <PhotoField label="Photo du propriétaire" value={ownerPhoto} onChange={setOwnerPhoto} />
          <PhotoField label="Photo de groupe / famille" value={groupPhoto} onChange={setGroupPhoto} />
          <PhotoField label="Photo de la parcelle" value={parcellePhoto} onChange={setParcellePhoto} />
        </Section>
      )}

      {step === 4 && (spBusy || spMsg) && (
        <div className="text-xs flex items-center gap-2 rounded-md px-3 py-2 bg-muted">
          {spBusy && <span className="w-3.5 h-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />}
          <span>{spMsg}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-2 pb-6">
        {step > 1 && (
          <button onClick={() => setStep((s) => (s - 1) as Step)}
            className="flex-1 h-12 rounded-lg border font-medium">← Précédent</button>
        )}
        {step < 4 && (
          <button onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2) || (step === 3 && !canNext3)}
            className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-40">
            Suivant →
          </button>
        )}
        {step === 4 && (
          <button onClick={submit} disabled={saving}
            className="flex-1 h-12 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-40">
            {saving ? "Enregistrement…" : "Enregistrer & lancer la mesure GPS"}
          </button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Localisation", "Domaine", "Parcelle", "Photos"];
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const idx = i + 1;
        const active = step === idx;
        const done = step > idx;
        return (
          <div key={s} className="flex-1 flex items-center gap-1.5">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
              done ? "bg-success text-white" : active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>{idx}</div>
            <span className={`hidden sm:inline text-xs ${active ? "font-semibold" : "text-muted-foreground"}`}>{s}</span>
            {idx < steps.length && <div className={`flex-1 h-0.5 ${done ? "bg-success" : "bg-muted"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card rounded-2xl shadow-card p-4 sm:p-5 space-y-3">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="font-medium truncate">{value || "—"}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

/** Champ hybride : liste déroulante des valeurs déjà enregistrées + saisie libre (recherche / création). */
function ComboField({ label, value, options, onChange, placeholder }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const id = `dl-${label.replace(/\W/g, "-")}`;
  const isNew = !!value.trim() && !options.some((o) => o.toLowerCase() === value.trim().toLowerCase());
  return (
    <Field label={label}>
      <div className="flex flex-col sm:flex-row gap-2">
        <select
          value={options.includes(value) ? value : ""}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="sm:w-1/2 h-11 px-2 rounded-md border bg-background text-sm">
          <option value="">— Choisir —</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <input value={value} onChange={(e) => onChange(e.target.value)} list={id} placeholder={placeholder}
          className="sm:w-1/2 h-11 px-3 rounded-md border bg-background text-sm" />
      </div>
      <datalist id={id}>{options.map((o) => <option key={o} value={o} />)}</datalist>
      {isNew && <div className="text-[10px] text-warn mt-1">Nouvelle valeur — elle sera enregistrée.</div>}
    </Field>
  );
}

function PhotoField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function pick(file?: File | null) {
    if (!file) return;
    setBusy(true);
    try { onChange(await fileToDataUrl(file)); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-lg bg-muted overflow-hidden border flex items-center justify-center text-xs text-muted-foreground shrink-0">
          {value ? <img src={value} alt={label} className="w-full h-full object-cover" /> : "Aucune"}
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <label className="cursor-pointer text-xs px-3 py-2 rounded-md border bg-background text-center hover:bg-muted">
            {busy ? "Compression…" : value ? "Remplacer le fichier" : "Choisir un fichier"}
            <input type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          <label className="cursor-pointer text-xs px-3 py-2 rounded-md border bg-background text-center hover:bg-muted">
            📷 Prendre une photo
            <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
          </label>
          {value && <button onClick={() => onChange("")} className="text-[10px] text-destructive underline self-start">Retirer</button>}
        </div>
      </div>
    </div>
  );
}
