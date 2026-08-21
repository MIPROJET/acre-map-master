// Côte d'Ivoire — Liste de référence Districts → Régions → Départements → Sous-préfectures
// Source : découpage administratif officiel (données de référence pour saisie rapide).
// Liste non exhaustive — l'utilisateur peut toujours saisir manuellement.

export interface AdminUnit {
  district: string;
  region: string;
  departement: string;
  sps: string[]; // sous-préfectures
}

export const CI_ADMIN: AdminUnit[] = [
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Daloa",
    sps: ["Daloa", "Bediala", "Gboguhe", "Gonate", "Zaibo", "Zoukougbeu"] },
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Issia",
    sps: ["Issia", "Boguedia", "Iboguhe", "Namane", "Nezobly", "Saioua", "Tapeguia"] },
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Vavoua",
    sps: ["Vavoua", "Bazra-Nattis", "Dania", "Kétro-Bassam", "Seitifla"] },
  { district: "Sassandra-Marahoué", region: "Marahoué", departement: "Bouaflé",
    sps: ["Bouaflé", "Bonon", "Begbessou", "N'Douci", "Pakouabo", "Tibeita", "Zaguiéta"] },
  { district: "Sassandra-Marahoué", region: "Marahoué", departement: "Sinfra",
    sps: ["Sinfra", "Bazré", "Kononfla", "Kouetinfla"] },
  { district: "Sassandra-Marahoué", region: "Marahoué", departement: "Zuénoula",
    sps: ["Zuénoula", "Gohitafla", "Vouébéfla"] },

  { district: "Lacs", region: "Bélier", departement: "Yamoussoukro",
    sps: ["Yamoussoukro", "Attiégouakro", "Didiévi", "Kossou", "Lolobo", "Tié-N'Diékro"] },

  { district: "Bas-Sassandra", region: "San-Pédro", departement: "San-Pédro",
    sps: ["San-Pédro", "Doba", "Dogbo", "Gabiadji", "Grand-Béréby"] },
  { district: "Bas-Sassandra", region: "San-Pédro", departement: "Sassandra",
    sps: ["Sassandra", "Dakpadou", "Gagoré", "Lobakuya", "Médon"] },
  { district: "Bas-Sassandra", region: "Nawa", departement: "Soubré",
    sps: ["Soubré", "Grand-Zattry", "Liliyo", "Méagui", "Okrouyo"] },

  { district: "Abidjan", region: "Abidjan", departement: "Abidjan",
    sps: ["Abobo", "Adjamé", "Anyama", "Attécoubé", "Bingerville", "Cocody", "Koumassi",
          "Marcory", "Plateau", "Port-Bouët", "Songon", "Treichville", "Yopougon"] },

  { district: "Comoé", region: "Sud-Comoé", departement: "Aboisso",
    sps: ["Aboisso", "Adaou", "Ayamé", "Bianouan", "Maféré"] },

  { district: "Vallée du Bandama", region: "Gbêkê", departement: "Bouaké",
    sps: ["Bouaké", "Bounda", "Djébonoua", "Mamini"] },

  { district: "Woroba", region: "Worodougou", departement: "Séguéla",
    sps: ["Séguéla", "Bobi", "Diarabana", "Sifié", "Worofla"] },
];

export function flatRegions(): string[] {
  return Array.from(new Set(CI_ADMIN.map((u) => u.region))).sort();
}

export function listDistricts(): string[] {
  return Array.from(new Set(CI_ADMIN.map((u) => u.district))).sort();
}

export function regionsOfDistrict(district: string): string[] {
  return Array.from(new Set(CI_ADMIN.filter((u) => u.district === district).map((u) => u.region))).sort();
}

export function departementsOfRegion(region: string): string[] {
  return Array.from(new Set(CI_ADMIN.filter((u) => u.region === region).map((u) => u.departement))).sort();
}

export function spsOfDepartement(departement: string): string[] {
  const u = CI_ADMIN.find((x) => x.departement === departement);
  return u ? u.sps.slice().sort() : [];
}
