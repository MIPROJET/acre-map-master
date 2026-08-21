
# Plan — AcreMap V1 Production : migration cloud + modules restants

Le cahier des charges est largement couvert (mesure GPS, morcellement strict 1 ha, PDF entreprise/client, exports DXF/KML/SHP/GeoJSON, validation, hiérarchie SP/Domaine/Parcelle). Restent 4 chantiers majeurs pour atteindre la version production. Je propose de les faire dans cet ordre car chacun débloque le suivant.

## Chantier 1 — Supabase = source de vérité, IndexedDB = cache offline

C'est le plus important. Aujourd'hui toutes les données vivent dans le navigateur (IndexedDB). En production : un agent perd son téléphone = données perdues, et le superviseur ne voit rien.

**Cible :**
- Supabase devient la base principale (tables `sps`, `domaines`, `parcelles`, `measurements`, `lots`, `voies`, `partages` déjà présentes).
- IndexedDB ne sert plus que de cache offline + file d'attente d'écritures (outbox pattern).
- Toute écriture : 1) écrit dans IndexedDB + marque `pendingSync=true`, 2) si online, pousse vers Supabase et démarque, 3) si offline, retentera à la reconnexion.
- Toute lecture : tente Supabase en premier ; si offline, tombe sur IndexedDB.
- Sauvegarde locale toutes les 30 s en cours de mesure (§10.2 du cahier des charges).

**Implémentation :**
- Nouveau `src/lib/repo/*` — un fichier par entité (`parcelles.ts`, `measurements.ts`, …) avec API unique `list/get/upsert/remove` qui orchestre Supabase + Dexie.
- Hook `useOnlineStatus` + `src/lib/sync.ts` — vide la file d'attente quand `navigator.onLine` repasse à true (event `online`).
- Migration des données existantes : bouton "Importer mes mesures locales vers le cloud" sur `/app/debug` (ne touche pas aux IDs).

**Schéma Supabase** : audit + ajout des colonnes manquantes (`owner_photo`, `group_photo`, `parcelle_photo` pour stockage base64 ou bucket, `device_profile`, `qa` JSON pour mesures, `bornes`, `is_reserve` pour lots). Migration unique.

## Chantier 2 — Gestion utilisateurs (Module §9)

**Cible :** seul l'admin crée des comptes ; nouveau compte = mot de passe temporaire ; à la 1ère connexion, l'utilisateur DOIT changer son mot de passe.

**Implémentation :**
- Server fn `createUserAccount` (admin only, via `requireSupabaseAuth` + `has_role('admin')`, utilise `supabaseAdmin.auth.admin.createUser`) — renvoie identifiant + mot de passe temporaire en clair (affiché 1 fois).
- Champ `profiles.must_change_password` (booléen, défaut `true` à la création admin).
- Au login : si `must_change_password=true`, redirige vers `/app/change-password` avant tout accès.
- Refonte `src/routes/app.users.tsx` : liste, création, désactivation, attribution de rôle (`admin`/`agent`/`viewer`).
- `src/routes/login.tsx` : retirer toute trace d'inscription publique ; design conforme §2.1 (logo + tagline + form).

## Chantier 3 — Cartographie satellite ↔ schématique (Module §7)

**Cible :** chaque vue (liste parcelles, détail parcelle, hiérarchie) propose le toggle.
- `src/components/MapView.tsx` : ajouter prop `mode: "satellite" | "schematic"` + bouton flottant de bascule.
  - Satellite : tile ESRI World Imagery (déjà la base).
  - Schématique : fond uni clair + polygones colorés, voies, étiquettes lots — pas de tuiles.
- Vue par niveau hiérarchique : `/app/hierarchie` affiche tous les domaines d'une SP, ou toutes les parcelles d'un domaine, sur une seule carte.

## Chantier 4 — Exports PNG + niveaux hiérarchiques (Module §8)

**Cible :**
- Export PNG haute résolution (jsPDF + `html2canvas` ou rendu canvas direct) en plus du PDF, pour chaque niveau.
- Boutons d'export sur SP / Domaine / Parcelle / Lot (pas seulement parcelle).
- Format A4 + A3 + A2 sélectionnable.

**Implémentation :**
- Refactor `src/lib/pdf.ts` → `src/lib/render/` avec fonctions partagées (entête, légende, plan 2D) consommables par PDF et PNG.
- Boutons "PNG" à côté des boutons PDF existants.

## Ordre d'exécution proposé

1. **Chantier 1** — fondations cloud (1 migration SQL + repo + sync).
2. **Chantier 2** — gestion utilisateurs (bloque la mise en production sans).
3. **Chantier 3** — toggle satellite/schématique (rapide, valeur visuelle).
4. **Chantier 4** — PNG + niveaux d'export (le plus volumineux mais le moins bloquant).

Chaque chantier sera livré avec ses propres tests visuels (preview).

## Notes techniques

- **PWA offline** : la PWA est déjà présente (`public/sw.js`, `manifest.webmanifest`). Pas de refonte ; juste ajout du listener `online`/`offline` + outbox.
- **Photos** : stockage actuel en base64 dans IndexedDB. Migration vers bucket Supabase Storage `parcelle-photos` (privé, RLS par owner).
- **Pas de changement** côté mesure GPS, morcellement, PDF déjà fonctionnels.

## Demande de validation

Ce plan représente ~1500-2000 lignes de code modifiées/ajoutées et 1 migration SQL non-triviale. Veux-tu que je l'exécute intégralement dans la foulée, ou préfères-tu valider chantier par chantier (je m'arrête à la fin de chaque chantier pour que tu testes) ?
