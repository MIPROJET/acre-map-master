// AcreMap — Domain types
export type Role = "admin" | "agent" | "viewer";

export interface User {
  id: string;
  fullName: string;
  username: string;
  role: Role;
  mustChangePassword?: boolean;
  createdAt: number;
}

// Hiérarchie géographique : District → Région → Département → SP → Domaine → Parcelle → Lot
export interface SP {
  id: string;
  code: string;             // SP001
  name: string;             // Nom de la sous-préfecture (ex: Daloa)
  district: string;         // ex: Sassandra-Marahoué
  region: string;           // ex: Haut-Sassandra
  departement: string;      // ex: Daloa
  notes?: string;
  createdAt: number;
}

export interface Domaine {
  id: string;
  code: string;             // DOM001
  name: string;
  spId: string;
  description?: string;
  notes?: string;
  createdAt: number;
}

export interface Parcelle {
  id: string;
  code: string;             // PARC001
  ownerName: string;
  ownerPhone?: string;
  domaineId: string;
  conventionDate: number;
  declaredArea?: number;
  notes?: string;
  conventionStatus?: "PP" | "AC" | "EN_COURS";
  // Photos stockées en base64 (data URL) — pas par URL externe
  ownerPhoto?: string;      // photo du propriétaire
  groupPhoto?: string;      // photo du groupe / famille
  parcellePhoto?: string;   // photo de la parcelle
  createdAt: number;
}

export interface GpsPoint { lat: number; lng: number; accuracy: number; ts: number; alt?: number | null; }
export interface MeasurementPoint extends GpsPoint { index: number; samples: number; auto: boolean; }

export type MeasurementStatus = "draft" | "submitted" | "validated" | "archived";

export interface Measurement {
  id: string;
  parcelleId?: string;
  createdBy: string;
  createdAt: number;
  status: MeasurementStatus;
  validatedBy?: string;
  validatedAt?: number;
  points: MeasurementPoint[];
  trace: GpsPoint[];
  areaM2: number;
  perimeterM: number;
  unit: "ha" | "m2" | "km2";
  deviceProfile?: DeviceProfile;
  qa?: MeasurementQA;
  notes?: string;
}

export interface Lot {
  id: string;
  parcelleId: string;
  measurementId: string;
  code: string;
  polygon: { lat: number; lng: number }[];
  areaM2: number;
  bornes?: { label: string; lat: number; lng: number }[];
  isReserve?: boolean;
  assigneeName?: string;
  assignedAt?: number;
}

export interface DeviceProfile {
  userAgent: string;
  platform: string;
  estimatedTier: "L1" | "L1+L5" | "unknown";
  bestAccuracyM: number;
  medianAccuracyM: number;
  samplesCount: number;
}

export interface MeasurementQA {
  acceptedCount: number;
  rejectedCount: number;
  maxAcceptableAccuracyM: number;
  bestAccuracyM: number;
  medianAccuracyM: number;
  liveAccuracyM?: number;
  history: { ts: number; accuracyM: number; accepted: boolean }[];
  /** Profil de précision réel mesuré sur place avant le levé */
  calibration?: {
    samples: number;
    bestAccuracyM: number;
    medianAccuracyM: number;
    scatterM: number;
    recommendedMaxAccuracyM: number;
    tier: string;
    quality: string;
    at: number;
  } | null;
  /** Journal des interruptions de levé (pause / reprise) */
  pauses?: { startedAt: number; endedAt?: number; durationMs?: number }[];
  /** Résultat du contrôle terrain effectué avant enregistrement */
  fieldCheck?: {
    ok: boolean;
    closureM: number;
    minSegmentM: number;
    maxAccuracyM: number;
    issues: { level: string; code: string; message: string }[];
  } | null;
}
