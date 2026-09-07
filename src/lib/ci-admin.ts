// Côte d'Ivoire — Découpage administratif officiel COMPLET
// Districts → Régions → Départements → Sous-préfectures
// Source : « Sous-préfectures de la Côte d'Ivoire » (décret n° 2011-263 et rattachements officiels).
// 14 districts · 33 régions · 113 départements · 518 sous-préfectures.
// Référentiel en lecture seule : l'utilisateur sélectionne, ne crée plus la hiérarchie.

export interface AdminUnit {
  district: string;
  region: string;
  departement: string;
  sps: string[]; // sous-préfectures
}

export const CI_ADMIN: AdminUnit[] = [
  { district: "Abidjan", region: "Abidjan", departement: "Abidjan",
    sps: ["Abobo", "Adjame", "Attecoube", "Cocody", "Koumassi", "Marcory", "Plateau", "Port-Bouet", "Treichville", "Yopougon"] },
  { district: "Abidjan", region: "Abidjan", departement: "Bingerville",
    sps: ["Bingerville"] },
  { district: "Abidjan", region: "Abidjan", departement: "Brofodoumé",
    sps: ["Brofodoumé"] },
  { district: "Abidjan", region: "Abidjan", departement: "Anyama",
    sps: ["Anyama"] },
  { district: "Abidjan", region: "Abidjan", departement: "Songon",
    sps: ["Songon"] },
  { district: "Yamoussoukro", region: "Yamoussoukro", departement: "Attiégouakro",
    sps: ["Attiégouakro", "Lolobo"] },
  { district: "Yamoussoukro", region: "Yamoussoukro", departement: "Yamoussoukro",
    sps: ["Kossou", "Yamoussoukro"] },
  { district: "Bas-Sassandra", region: "Gbôkle", departement: "Fresco",
    sps: ["Dahiri", "Fresco", "Gbagbam"] },
  { district: "Bas-Sassandra", region: "Gbôkle", departement: "Sassandra",
    sps: ["Dakpadou", "Grihiri", "Lobakuya", "Medon", "Sago", "Sassandra"] },
  { district: "Bas-Sassandra", region: "Nawa", departement: "Buyo",
    sps: ["Buyo", "Dapeoua"] },
  { district: "Bas-Sassandra", region: "Nawa", departement: "Guéyo",
    sps: ["Dabouyo", "Guéyo"] },
  { district: "Bas-Sassandra", region: "Nawa", departement: "Méagui",
    sps: ["Gnamangui", "Méagui", "Oupoyo"] },
  { district: "Bas-Sassandra", region: "Nawa", departement: "Soubré",
    sps: ["Grand-Zattry", "Liliyo", "Okrouyo", "Soubré"] },
  { district: "Bas-Sassandra", region: "San-Pédro", departement: "San-Pédro",
    sps: ["Doba", "Dogbo", "Gabiadji", "Grand-Bereby", "San-Pédro"] },
  { district: "Bas-Sassandra", region: "San-Pédro", departement: "Tabou",
    sps: ["Dapo-Iboke", "Djamandioke", "Djouroutou", "Grabo", "Olodio", "Tabou"] },
  { district: "Comoé", region: "Indénié-Djuablin", departement: "Abengourou",
    sps: ["Abengourou", "Amélékia", "Aniassué", "Ebilassokro", "Niablé", "Yakassé-Féyassé", "Zaranou"] },
  { district: "Comoé", region: "Indénié-Djuablin", departement: "Agnibilékrou",
    sps: ["Agnibilékrou", "Akoboissue", "Damé", "Duffrebo", "Tanguelan"] },
  { district: "Comoé", region: "Indénié-Djuablin", departement: "Bettié",
    sps: ["Bettié", "Diamarakro"] },
  { district: "Comoé", region: "Sud-Comoé", departement: "Aboisso",
    sps: ["Aboisso", "Adaou", "Adjouan", "Ayamé", "Bianouan", "Kouakro", "Maféré", "Yaou"] },
  { district: "Comoé", region: "Sud-Comoé", departement: "Adiaké",
    sps: ["Adiaké", "Assinie-Mafia", "Etuéboué"] },
  { district: "Comoé", region: "Sud-Comoé", departement: "Grand-Bassam",
    sps: ["Bongo", "Bonoua", "Grand-Bassam"] },
  { district: "Comoé", region: "Sud-Comoé", departement: "Tiapoum",
    sps: ["Nouamou", "Noé", "Tiapoum"] },
  { district: "Lacs", region: "Moronou", departement: "Arrah",
    sps: ["Arrah", "Kotobi", "Krebe"] },
  { district: "Lacs", region: "Moronou", departement: "Bongouanou",
    sps: ["Andé", "Assie-Koumassi", "Bongouanou", "N'Guessankro"] },
  { district: "Lacs", region: "Moronou", departement: "M'Batto",
    sps: ["Anoumaba", "Assahara", "M'Batto", "Tiémélékro"] },
  { district: "Denguélé", region: "Folon", departement: "Kaniasso",
    sps: ["Goulia", "Kaniasso", "Mahandiana-Sokourani"] },
  { district: "Denguélé", region: "Folon", departement: "Minignan",
    sps: ["Kimbirila-Nord", "Minignan", "Sokoro", "Tienko"] },
  { district: "Denguélé", region: "Kabadougou", departement: "Gbéléban",
    sps: ["Gbéléban", "Samango", "Seydougou"] },
  { district: "Denguélé", region: "Kabadougou", departement: "Madinani",
    sps: ["Fengolo", "Madinani", "N'Goloblasso"] },
  { district: "Denguélé", region: "Kabadougou", departement: "Odienné",
    sps: ["Bako", "Bougousso", "Dioulatièdougou", "Odienné", "Tiémé"] },
  { district: "Denguélé", region: "Kabadougou", departement: "Samatiguila",
    sps: ["Kimbirila-Sud", "Samatiguila"] },
  { district: "Denguélé", region: "Kabadougou", departement: "Séguélon",
    sps: ["Gbongaha", "Séguélon"] },
  { district: "Gôh-Djiboua", region: "Gôh", departement: "Gagnoa",
    sps: ["Bayota", "Dahiepa-Kehi", "Dignago", "Dougroupalegnaoa", "Doukouyo", "Gagnoa", "Galebre-Galébouo", "Gnagbodougnoa", "Guibéroua", "Ouragahio", "Sérihio"] },
  { district: "Gôh-Djiboua", region: "Gôh", departement: "Yopohue",
    sps: ["Yopohue"] },
  { district: "Gôh-Djiboua", region: "Gôh", departement: "Oumé",
    sps: ["Diégonéfla", "Guépahouo", "Oumé", "Tonla"] },
  { district: "Gôh-Djiboua", region: "Lôh-Djiboua", departement: "Divo",
    sps: ["Chiepo", "Didoko", "Divo", "Hiré", "Nebo", "Ogoudou", "Zego"] },
  { district: "Gôh-Djiboua", region: "Lôh-Djiboua", departement: "Guitry",
    sps: ["Dairo-Didizo", "Guitry", "Lauzoua", "Yocoboue"] },
  { district: "Gôh-Djiboua", region: "Lôh-Djiboua", departement: "Lakota",
    sps: ["Djidji", "Gagore", "Goudouko", "Lakota", "Niambézaria", "Zikisso"] },
  { district: "Lacs", region: "Bélier", departement: "Didiévi",
    sps: ["Bollo", "Didiévi", "Molonou-Blé", "Raviart", "Tié-N'Diékro"] },
  { district: "Lacs", region: "Bélier", departement: "Djékanou",
    sps: ["Bonikro", "Djékanou"] },
  { district: "Lacs", region: "Bélier", departement: "Tiébissou",
    sps: ["Lomokankro", "Molonou", "Tiébissou", "Yakpabo-Sakassou"] },
  { district: "Lacs", region: "Bélier", departement: "Toumodi",
    sps: ["Angoda", "Kokoumbo", "Kpouébo", "Toumodi"] },
  { district: "Lacs", region: "Iffou", departement: "Daoukro",
    sps: ["Akpassanou", "Ananda", "Daoukro", "Ettrokro", "N'Gattakro", "Ouéllé", "Samanza"] },
  { district: "Lacs", region: "Iffou", departement: "M'Bahiakro",
    sps: ["Bonguéra", "Kondossou", "M'Bahiakro"] },
  { district: "Lacs", region: "Iffou", departement: "Prikro",
    sps: ["Anianou", "Famienkro", "Koffi-Amonkro", "Nafana", "Prikro"] },
  { district: "Lacs", region: "N'Zi", departement: "Bocanda",
    sps: ["Bengassou", "Bocanda", "Kouadioblékro", "N'Zèkrézessou"] },
  { district: "Lacs", region: "N'Zi", departement: "Dimbokro",
    sps: ["Abigui", "Diangokro", "Dimbokro", "Nofou"] },
  { district: "Lacs", region: "N'Zi", departement: "Kouassi-Kouassikro",
    sps: ["Kouassi-Kouassikro", "Mekro"] },
  { district: "Lagunes", region: "Agnéby-Tiassa", departement: "Agboville",
    sps: ["Aboude", "Agboville", "Ananguie", "Attobrou", "Azaguié", "Céchi", "Grand-Morié", "Guessiguié", "Loviguié", "Oress-Krobou", "Rubino"] },
  { district: "Lagunes", region: "Agnéby-Tiassa", departement: "Sikensi",
    sps: ["Gomon", "Sikensi"] },
  { district: "Lagunes", region: "Agnéby-Tiassa", departement: "Taabo",
    sps: ["Pacobo", "Taabo"] },
  { district: "Lagunes", region: "Agnéby-Tiassa", departement: "Tiassalé",
    sps: ["Gbolouville", "Morokro", "N’Douci", "Tiassalé"] },
  { district: "Lagunes", region: "Grands-Ponts", departement: "Dabou",
    sps: ["Dabou", "Lopou", "Toupah"] },
  { district: "Lagunes", region: "Grands-Ponts", departement: "Grand-Lahou",
    sps: ["Ahouanou", "Bacanda", "Ebounou", "Grand-Lahou", "Toukouzou"] },
  { district: "Lagunes", region: "Grands-Ponts", departement: "Jacqueville",
    sps: ["Attoutou", "Jacqueville"] },
  { district: "Lagunes", region: "La Mé", departement: "Adzopé",
    sps: ["Adzopé", "Agou", "Annépé", "Assikoi", "Bécédi-Brignan", "Yakassé-Mé"] },
  { district: "Lagunes", region: "La Mé", departement: "Akoupé",
    sps: ["Afféry", "Akoupé", "Bécouéfin"] },
  { district: "Lagunes", region: "La Mé", departement: "Alépé",
    sps: ["Aboisso-Comoé", "Allosso", "Alépé", "Danguira", "Oghiwapo"] },
  { district: "Lagunes", region: "La Mé", departement: "Yakassé-Attobrou",
    sps: ["Abongoua", "Biéby", "Yakassé-Attobrou"] },
  { district: "Montagnes", region: "Cavally", departement: "Bloléquin",
    sps: ["Bloléquin", "Diboké", "Doké", "Tinhou", "Zéaglo"] },
  { district: "Montagnes", region: "Cavally", departement: "Guiglo",
    sps: ["Bedy-Goazon", "Guiglo", "Kaade", "Nizahon"] },
  { district: "Montagnes", region: "Cavally", departement: "Taï",
    sps: ["Taï", "Zagne"] },
  { district: "Montagnes", region: "Cavally", departement: "Toulépleu",
    sps: ["Bakoubly", "Meo", "Nezobly", "Péhé", "Tiobly", "Toulépleu"] },
  { district: "Montagnes", region: "Guémon", departement: "Bangolo",
    sps: ["Bangolo", "Beoue-Zibiao", "Bléniméouin", "Diéouzon", "Gohouo-Zagna", "Guinglo-Tahouaké", "Kahin-Zarabaon", "Zou", "Zéo"] },
  { district: "Montagnes", region: "Guémon", departement: "Duékoué",
    sps: ["Bagohouo", "Duékoué", "Gbapleu", "Guézon"] },
  { district: "Montagnes", region: "Guémon", departement: "Facobly",
    sps: ["Facobly", "Guézon", "Koua", "Sémien", "Tieny-Seably"] },
  { district: "Montagnes", region: "Guémon", departement: "Kouibly",
    sps: ["Kouibly", "Nidrou", "Ouyably-Gnondrou", "Totrodrou"] },
  { district: "Montagnes", region: "Tonkpi", departement: "Biankouma",
    sps: ["Biankouma", "Blapleu", "Gbangbégouiné", "Gbonné", "Gouiné", "Kpata", "Santa"] },
  { district: "Montagnes", region: "Tonkpi", departement: "Danané",
    sps: ["Daleu", "Danané", "Gbon-Houye", "Kouan-Houle", "Mahapleu", "Seileu", "Zonneu"] },
  { district: "Montagnes", region: "Tonkpi", departement: "Man",
    sps: ["Bogouiné", "Fagnampleu", "Gbangbégouiné-Yati", "Logoualé", "Man", "Podiagouine", "Sandougou-Soba", "Sangouiné", "Yapleu", "Zagoue", "Ziogouine"] },
  { district: "Montagnes", region: "Tonkpi", departement: "Sipilou",
    sps: ["Sipilou", "Yorodougou"] },
  { district: "Montagnes", region: "Tonkpi", departement: "Zouan-Hounien",
    sps: ["Banneu", "Bin-Houyé", "Goulaleu", "Téapleu", "Yelleu", "Zouan-Hounien"] },
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Daloa",
    sps: ["Bédiala", "Daloa", "Gadouan", "Gboguhé", "Gonaté", "Zaïbo"] },
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Issia",
    sps: ["Boguedia", "Iboguhé", "Issia", "Nahio", "Namane", "Saïoua", "Tapeguia"] },
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Vavoua",
    sps: ["Bazra-Nattis", "Danano", "Dania", "Kétro-Bassam", "Séitifla", "Vavoua"] },
  { district: "Sassandra-Marahoué", region: "Haut-Sassandra", departement: "Zoukougbeu",
    sps: ["Domangbeu", "Gregbeu", "Guessabo", "Zoukougbeu"] },
  { district: "Sassandra-Marahoué", region: "Marahoué", departement: "Bouaflé",
    sps: ["Begbessou", "Bonon", "Bouaflé", "N'Douffoukankro", "Pakouabo", "Tibeita", "Zaguiéta"] },
  { district: "Sassandra-Marahoué", region: "Marahoué", departement: "Sinfra",
    sps: ["Bazré", "Kononfla", "Kouetinfla", "Sinfra"] },
  { district: "Sassandra-Marahoué", region: "Marahoué", departement: "Zuénoula",
    sps: ["Gohitafla", "Iriefla", "Kanzra", "Maminigui", "Vouéboufla", "Zanzra", "Zuénoula"] },
  { district: "Savanes", region: "Bagoué", departement: "Boundiali",
    sps: ["Baya", "Boundiali", "Ganaoni", "Kasséré", "Siempurgo"] },
  { district: "Savanes", region: "Bagoué", departement: "Kouto",
    sps: ["Blességué", "Gbon", "Kolia", "Kouto", "Sianhala"] },
  { district: "Savanes", region: "Bagoué", departement: "Tengréla",
    sps: ["Débété", "Kanakono", "Papara", "Tengréla"] },
  { district: "Savanes", region: "Poro", departement: "Dikodougou",
    sps: ["Boron", "Dikodougou", "Guiembé"] },
  { district: "Savanes", region: "Poro", departement: "Korhogo",
    sps: ["Dassoungboho", "Kanoroba", "Karakoro", "Kiemou", "Kombolokoura", "Komborodougou", "Koni", "Korhogo", "Lataha", "N'Ganon", "Nafoun", "Napiéolédougou", "Niofoin", "Sirasso", "Sohouo", "Tioroniaradougou"] },
  { district: "Savanes", region: "Poro", departement: "M'Bengué",
    sps: ["Bougou", "Katiala", "Katogo", "M'Bengué"] },
  { district: "Savanes", region: "Poro", departement: "Sinématiali",
    sps: ["Bouakaha", "Kagbolodougou", "Sediego", "Sinématiali"] },
  { district: "Savanes", region: "Tchologo", departement: "Ferkessédougou",
    sps: ["Ferkessédougou", "Koumbala", "Togoniéré"] },
  { district: "Savanes", region: "Tchologo", departement: "Kong",
    sps: ["Bilimono", "Kong", "Nafana", "Sikolo"] },
  { district: "Savanes", region: "Tchologo", departement: "Ouangolodougou",
    sps: ["Diawala", "Kaouara", "Niellé", "Ouangolodougou", "Toumoukoro"] },
  { district: "Vallée du Bandama", region: "Gbêkê", departement: "Béoumi",
    sps: ["Ando-Kékrénou", "Bodokro", "Béoumi", "Kondrobo", "Lolobo", "Marabadiassa", "N'Guessankro"] },
  { district: "Vallée du Bandama", region: "Gbêkê", departement: "Botro",
    sps: ["Botro", "Diabo", "Krofoinsou", "Languibonou"] },
  { district: "Vallée du Bandama", region: "Gbêkê", departement: "Bouaké",
    sps: ["Bouaké-SP", "Bouaké-Ville", "Bounda", "Brobo", "Djébonoua", "Mamini"] },
  { district: "Vallée du Bandama", region: "Gbêkê", departement: "Sakassou",
    sps: ["Ayaou-Sran", "Dibri-Assirikro", "Sakassou", "Toumodi-Sakassou"] },
  { district: "Vallée du Bandama", region: "Hambol", departement: "Dabakala",
    sps: ["Bassawa", "Boniérédougou", "Dabakala", "Foumbolo", "Niemene", "Satama-Sokoro", "Satama-Sokoura", "Sokala-Sobara", "Tiendene-Bambarasso", "Yaossedougou"] },
  { district: "Vallée du Bandama", region: "Hambol", departement: "Katiola",
    sps: ["Fronan", "Katiola", "Timbé"] },
  { district: "Vallée du Bandama", region: "Hambol", departement: "Niakaramadougou",
    sps: ["Arikokaha", "Badikaha", "Niakaramadougou", "Niédiékaha", "Tafiré", "Tortiya"] },
  { district: "Woroba", region: "Bafing", departement: "Koro",
    sps: ["Booko", "Borotou", "Koro", "Mahandougou", "Niokosso"] },
  { district: "Woroba", region: "Bafing", departement: "Ouaninou",
    sps: ["Gbelo", "Gouekan", "Koonan", "Ouaninou", "Saboudougou", "Santa"] },
  { district: "Woroba", region: "Bafing", departement: "Touba",
    sps: ["Dioman", "Foungbesso", "Guintéguéla", "Touba"] },
  { district: "Woroba", region: "Béré", departement: "Dianra",
    sps: ["Dianra", "Dianra-Village"] },
  { district: "Woroba", region: "Béré", departement: "Kounahiri",
    sps: ["Kongasso", "Kounahiri"] },
  { district: "Woroba", region: "Béré", departement: "Mankono",
    sps: ["Bouandougou", "Mankono", "Marandalah", "Sarhala", "Tiéningboué"] },
  { district: "Woroba", region: "Worodougou", departement: "Kani",
    sps: ["Djibrosso", "Fadiadougou", "Kani", "Morondo"] },
  { district: "Woroba", region: "Worodougou", departement: "Séguéla",
    sps: ["Bobo-Diarabana", "Dualla", "Kamalo", "Massala", "Sifié", "Séguéla", "Worofla"] },
  { district: "Zanzan", region: "Bounkani", departement: "Bouna",
    sps: ["Bouka", "Bouna", "Ondefidouo", "Youndouo"] },
  { district: "Zanzan", region: "Bounkani", departement: "Doropo",
    sps: ["Danoa", "Doropo", "Kalamon", "Niamoue"] },
  { district: "Zanzan", region: "Bounkani", departement: "Nassian",
    sps: ["Bogofa", "Kakpin", "Kotouba", "Nassian", "Sominassé"] },
  { district: "Zanzan", region: "Bounkani", departement: "Téhini",
    sps: ["Gogo", "Tougbo", "Téhini"] },
  { district: "Zanzan", region: "Gontougo", departement: "Bondoukou",
    sps: ["Appimandou", "Bondo", "Bondoukou", "Gouméré", "Laoud-Iba", "Pinda-Boroko", "Sapli-Sépingo", "Sorobango", "Tabagne", "Tagadi", "Taoudi", "Yezimala"] },
  { district: "Zanzan", region: "Gontougo", departement: "Koun-Fao",
    sps: ["Boahia", "Kokomian", "Kouassi-Dattékro", "Koun-Fao", "Tankéssé", "Tienkoikro"] },
  { district: "Zanzan", region: "Gontougo", departement: "Sandégué",
    sps: ["Bandakagni-Tomora", "Dimandougou", "Sandégué", "Yorobodi"] },
  { district: "Zanzan", region: "Gontougo", departement: "Tanda",
    sps: ["Amanvi", "Diamba", "Tanda", "Tchedio"] },
  { district: "Zanzan", region: "Gontougo", departement: "Transua",
    sps: ["Assuéfry", "Kouassi-Niaguini", "Transua"] },
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
  const out = new Set<string>();
  for (const u of CI_ADMIN) if (u.departement === departement) u.sps.forEach((s) => out.add(s));
  return Array.from(out).sort((a, b) => a.localeCompare(b, "fr"));
}

/** Toutes les sous-préfectures du pays, triées (recherche / sélection unique). */
export function listAllSps(): string[] {
  const out = new Set<string>();
  for (const u of CI_ADMIN) u.sps.forEach((s) => out.add(s));
  return Array.from(out).sort((a, b) => a.localeCompare(b, "fr"));
}

export interface SpRef { district: string; region: string; departement: string; sp: string; }

/** Retrouve la hiérarchie complète d'une sous-préfecture (cascade SP → département → région → district). */
export function findSpRef(spName: string): SpRef | null {
  const n = spName.trim().toLowerCase();
  if (!n) return null;
  for (const u of CI_ADMIN) {
    for (const s of u.sps) {
      if (s.toLowerCase() === n) {
        return { district: u.district, region: u.region, departement: u.departement, sp: s };
      }
    }
  }
  return null;
}

/** Toutes les références correspondant à un nom de SP (homonymes possibles entre départements). */
export function findAllSpRefs(spName: string): SpRef[] {
  const n = spName.trim().toLowerCase();
  if (!n) return [];
  const out: SpRef[] = [];
  for (const u of CI_ADMIN) {
    for (const s of u.sps) {
      if (s.toLowerCase() === n) out.push({ district: u.district, region: u.region, departement: u.departement, sp: s });
    }
  }
  return out;
}
