/**
 * AcreMap — Morcellement intelligent : types partagés.
 * La géométrie réelle est produite par `morcellement-engine.ts`.
 */
import type { Axis, Pt } from "./partage";

export const TOLERANCE_M2 = 100;

export type ObjectifType = "lots_fixes" | "partage_ac" | "partage_perso" | "autre";
export type Orientation = "auto" | "horizontale" | "verticale" | "geometrie" | "personnalisee";
export type OrganisationPartage = "auto" | "horizontale" | "verticale" | "blocs" | "personnalisee";
export type PositionVoie = "auto" | "traversante" | "laterale" | "centrale" | "personnalisee";
export type OrientationVoie = "auto" | "horizontale" | "verticale" | "terrain";
export type OrientationVoieSec = "auto" | "horizontale" | "verticale" | "adaptative";
export type PrioriteOptim =
  | "auto" | "superficie" | "accessibilite" | "formes" | "voirie" | "equilibre";
export type ApercuMode = "global" | "entreprise" | "client";

export interface CollectePoint {
  id: string;
  type: "principal" | "secondaire";
  areaM2: number;
}

export interface MorcConfig {
  objectif: ObjectifType;
  cibleHa: number;             // 1..9 ou libre
  cibleLibre: boolean;
  orientation: Orientation;

  partageActif: boolean;
  partAcPct: number;
  organisationPartage: OrganisationPartage;

  voiePrincipale: boolean;
  largeurVoieM: number;
  positionVoie: PositionVoie;
  orientationVoie: OrientationVoie;

  voiesSecondaires: boolean;
  largeurVoieSecM: number;
  nbVoiesSec: number;
  orientationVoieSec: OrientationVoieSec;
  frequenceLots: number;

  collecteActive: boolean;
  nbCollecte: number;
  collecte: CollectePoint[];

  reserveActive: boolean;
  reserveM2: number;
  familleNom: string;

  optim: {
    superficie: boolean; acces: boolean; residuels: boolean; etroits: boolean;
    formes: boolean; circulation: boolean; positionVoies: boolean;
    positionCollecte: boolean; partage: boolean; orientationAuto: boolean;
  };
  priorite: PrioriteOptim;
}

export const defaultConfig = (): MorcConfig => ({
  objectif: "lots_fixes",
  cibleHa: 1,
  cibleLibre: false,
  orientation: "auto",
  partageActif: false,
  partAcPct: 60,
  organisationPartage: "auto",
  voiePrincipale: true,
  largeurVoieM: 6,
  positionVoie: "auto",
  orientationVoie: "auto",
  voiesSecondaires: true,
  largeurVoieSecM: 4,
  nbVoiesSec: 2,
  orientationVoieSec: "auto",
  frequenceLots: 4,
  collecteActive: false,
  nbCollecte: 1,
  collecte: [{ id: "PC1", type: "principal", areaM2: 1500 }],
  reserveActive: false,
  reserveM2: 8600,
  familleNom: "Famille KOFFI",
  optim: {
    superficie: true, acces: true, residuels: true, etroits: true, formes: true,
    circulation: true, positionVoies: true, positionCollecte: true, partage: true,
    orientationAuto: true,
  },
  priorite: "auto",
});

export interface Assignation {
  nom: string;
  contact: string;
  compte: string;
}

export interface PlanLot {
  code: string;
  part: "ac" | "proprietaire";
  poly: [number, number][];    // repère normalisé 0..100
  geo?: Pt[];                  // géométrie réelle (WGS84)
  bornes?: { label: string; lat: number; lng: number }[];
  cibleM2: number;
  reelM2: number;
  conforme: boolean;
  kind: "lot" | "reserve" | "collecte";
  label?: string;
}

export interface PlanVoie {
  kind: "principale" | "secondaire";
  poly: [number, number][];
  geo?: Pt[];
  largeurM: number;
}

export interface PlanScore {
  global: number;
  superficies: number;
  accessibilite: number;
  formes: number;
  voies: number;
  residuels: number;
}

export interface PlanResult {
  lots: PlanLot[];
  voies: PlanVoie[];
  parcelle: [number, number][];
  parcelleGeo?: Pt[];
  axis?: Axis;
  score: PlanScore;
  conforme: boolean;
  cibleM2: number;
  totalM2: number;
  createdAt: number;
}

export const ETAPES = [
  "Analyse de la géométrie",
  "Organisation des lots",
  "Optimisation des voies",
  "Positionnement des points de collecte",
  "Vérification des superficies",
  "Préparation de l'aperçu",
];
