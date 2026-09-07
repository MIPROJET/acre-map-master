// Registre des sous-préfectures : le référentiel national est en lecture seule.
// Une référence officielle SP00X n'est créée QUE lors du premier déploiement
// terrain sur cette sous-préfecture (première sélection) — puis propagée en base.
import { supabase } from "@/integrations/supabase/client";
import { db, isBrowser } from "./db";
import { findSpRef, listAllSps } from "./ci-admin";
import { nextSequentialCode } from "./ref";
import { syncNow } from "./sync";
import type { SP } from "./types";

export interface SpChoice {
  name: string;
  district: string;
  region: string;
  departement: string;
  /** Référence officielle si la SP a déjà été déployée, sinon null. */
  code: string | null;
  id?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Liste complète : référentiel national + sous-préfectures déjà enregistrées. */
export function buildSpChoices(existing: SP[]): SpChoice[] {
  const byName = new Map<string, SpChoice>();
  for (const name of listAllSps()) {
    const ref = findSpRef(name);
    byName.set(norm(name), {
      name,
      district: ref?.district ?? "",
      region: ref?.region ?? "",
      departement: ref?.departement ?? "",
      code: null,
    });
  }
  for (const sp of existing) {
    if (sp.archivedAt) continue;
    byName.set(norm(sp.name), {
      name: sp.name,
      district: sp.district,
      region: sp.region,
      departement: sp.departement,
      code: sp.code,
      id: sp.id,
    });
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

export function findExistingSp(existing: SP[], name: string): SP | null {
  const n = norm(name);
  return existing.find((s) => norm(s.name) === n) ?? null;
}

/**
 * Retourne la SP enregistrée pour ce nom, en créant la référence officielle
 * (SP001, SP002, …) au premier usage terrain. La numérotation est globale et
 * séquentielle selon l'ordre de déploiement (indépendante du district/région).
 */
export async function ensureSpByName(name: string): Promise<{ sp: SP; created: boolean }> {
  if (!isBrowser()) throw new Error("Indisponible côté serveur");
  const d = db();
  const all = await d.sps.toArray();
  const found = findExistingSp(all, name);
  console.debug("[sp-registry] ensureSpByName", { name, local: all.length, found: found?.code ?? null });
  if (found) {
    if (found.archivedAt) {
      await d.sps.update(found.id, { archivedAt: null });
      syncNow("sps", found.id);
      return { sp: { ...found, archivedAt: null }, created: false };
    }
    return { sp: found, created: false };
  }

  // Codes déjà utilisés : cache local + cloud (source de vérité) pour éviter
  // tout doublon de numérotation entre appareils.
  const codes = all.map((s) => s.code);
  if (navigator.onLine) {
    try {
      const { data } = await supabase.from("sps").select("code").limit(5000);
      for (const r of data ?? []) if (r?.code) codes.push(r.code as string);
    } catch { /* hors ligne : numérotation locale, réconciliée à la synchro */ }
  }

  const ref = findSpRef(name);
  const nextCode = nextSequentialCode("SP", codes);
  console.debug("[sp-registry] nouvelle référence SP", { name, codesConnus: codes.length, nextCode });
  const sp: SP = {
    id: crypto.randomUUID(),
    code: nextCode,
    name: ref?.sp ?? name.trim(),
    district: ref?.district ?? "",
    region: ref?.region ?? "",
    departement: ref?.departement ?? "",
    createdAt: Date.now(),
  };
  await d.sps.put(sp);
  syncNow("sps", sp.id);
  return { sp, created: true };
}
