/**
 * AcreMap — Morcellement intelligent : types partagés.
 * La géométrie réelle est produite par `morcellement-engine.ts`
 * (analyse de forme → partage → voirie → îlots → lots → contrôle).
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

/** Quelle partie de la parcelle est effectivement morcelée. */
export type CibleMorcellement = "global" | "ac" | "proprietaire";
export type ModeVoirie = "auto" | "manuel";

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

  /** Partage AgriCapital / Propriétaire — appliqué AVANT le morcellement. */
  partageActif: boolean;
  partAcPct: number;
  organisationPartage: OrganisationPartage;
  cibleMorcellement: CibleMorcellement;
  proprietaireNom: string;

  voiePrincipale: boolean;
  modeVoie: ModeVoirie;
  largeurVoieM: number;
  positionVoie: PositionVoie;
  orientationVoie: OrientationVoie;
  /** Mode manuel : décalage latéral de la voie principale, en % de la largeur (-45..45). */
  decalageVoiePct: number;

  voiesSecondaires: boolean;
  modeVoieSec: ModeVoirie;
  largeurVoieSecM: number;
  nbVoiesSec: number;
  orientationVoieSec: OrientationVoieSec;
  frequenceLots: number;

  collecteActive: boolean;
  nbCollecte: number;
  collecte: CollectePoint[];

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
  partAcPct: 30,
  organisationPartage: "auto",
  cibleMorcellement: "global",
  proprietaireNom: "",
  voiePrincipale: true,
  modeVoie: "auto",
  largeurVoieM: 6,
  positionVoie: "auto",
  orientationVoie: "auto",
  decalageVoiePct: 0,
  voiesSecondaires: true,
  modeVoieSec: "auto",
  largeurVoieSecM: 4,
  nbVoiesSec: 2,
  orientationVoieSec: "auto",
  frequenceLots: 4,
  collecteActive: false,
  nbCollecte: 1,
  collecte: [{ id: "PC1", type: "principal", areaM2: 1500 }],
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
  /** Îlot d'appartenance (A, B, C…) */
  ilot?: string;
}

export interface PlanVoie {
  kind: "principale" | "secondaire";
  poly: [number, number][];
  geo?: Pt[];
  largeurM: number;
  /** Longueur développée approximative de la voie, en mètres. */
  longueurM?: number;
}

/** Îlot : bloc de terrain délimité par les voies, contenant des lots. */
export interface PlanIlot {
  code: string;
  poly: [number, number][];
  geo?: Pt[];
  areaM2: number;
  part: "ac" | "proprietaire";
  nbLots: number;
}

/** Zone laissée non morcelée (part AgriCapital ou réserve du propriétaire). */
export interface PlanZone {
  part: "ac" | "proprietaire";
  poly: [number, number][];
  geo?: Pt[];
  areaM2: number;
  titre: string;      // nom officiel (propriétaire) ou AGRICAPITAL
  mention: string;    // « RÉSERVE PROPRIÉTAIRE » / « PART AGRICAPITAL »
}

/** Analyse automatique de la forme de la parcelle. */
export interface PlanAnalyse {
  areaM2: number;
  perimetreM: number;
  longueurM: number;
  largeurM: number;
  /** Azimut du grand axe en degrés (0 = nord, sens horaire). */
  azimutDeg: number;
  elongation: number;
  /** 1 = parcelle convexe, < 1 = présence de concavités. */
  convexite: number;
  compacite: number;
  /** Point d'accès retenu (milieu du plus long côté du périmètre). */
  acces?: Pt;
  forme: string;
}

export interface PlanScore {
  global: number;
  superficies: number;
  accessibilite: number;
  formes: number;
  voies: number;
  residuels: number;
}

export interface PlanPartage {
  actif: boolean;
  pctAC: number;
  areaACm2: number;
  areaProprioM2: number;
  cible: CibleMorcellement;
}

export interface PlanResult {
  lots: PlanLot[];
  voies: PlanVoie[];
  ilots: PlanIlot[];
  zones: PlanZone[];
  parcelle: [number, number][];
  parcelleGeo?: Pt[];
  axis?: Axis;
  analyse: PlanAnalyse;
  partage: PlanPartage;
  score: PlanScore;
  conforme: boolean;
  cibleM2: number;
  totalM2: number;
  /** Surface réellement morcelée (hors voirie et hors zone non morcelée). */
  morceleM2: number;
  voirieM2: number;
  reliquatM2: number;
  createdAt: number;
}

export const ETAPES = [
  "Analyse de la forme de la parcelle",
  "Partage AgriCapital / Propriétaire",
  "Tracé des voies principales",
  "Ramification des voies secondaires",
  "Constitution des îlots",
  "Découpage et contrôle des lots",
];
