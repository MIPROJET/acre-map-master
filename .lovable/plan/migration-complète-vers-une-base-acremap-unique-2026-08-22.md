# Migration complète vers une base AcreMap unique

## Objectif

Faire de Supabase AcreMap l’unique source de vérité en ligne, conserver un cache local fiable pour le terrain hors connexion, puis synchroniser automatiquement toutes les files d’attente dès le retour du réseau.

## Travaux prévus

1. **Connexion unique à Supabase**
   - Centraliser l’URL et la clé publique du projet `ckkjqpsoavrikgiuuktf` dans une configuration partagée par le navigateur, les fonctions serveur et le serveur MCP.
   - Supprimer l’ancienne référence Supabase encore codée dans le serveur MCP.
   - Ajouter des replis sûrs vers les variables publiques afin que le preview et le domaine `acremap.agricapital.ci` ciblent toujours AcreMap, sans exposer la clé service-role.

2. **Synchronisation complète et mode hors ligne**
   - Au démarrage en ligne : vider les opérations en attente, récupérer les données cloud, puis remplacer le cache local obsolète.
   - À chaque reconnexion et périodiquement : vider toutes les files, puis rafraîchir le cache local.
   - Mettre en file chaque création, modification et suppression locale des SP, domaines, parcelles, mesures et lots.
   - Ajouter une vraie file locale pour les fichiers importés hors ligne, y compris leur contenu, et les téléverser automatiquement au retour du réseau.
   - Éviter les doublons par identifiants stables et règles d’unicité adaptées.

3. **Traitement & morcellement unifié**
   - Intégrer directement le formulaire d’import dans cette page.
   - Retirer l’entrée de menu « Importer des fichiers » et rediriger l’ancienne URL vers « Traitement & morcellement ».
   - Permettre à l’administrateur de supprimer un fichier archivé à la fois dans Storage et dans la table `imports`.
   - Synchroniser les relevés créés, rattachés, recalculés, archivés ou supprimés.

4. **Administration et navigation mobile**
   - Remplacer la barre mobile limitée à quatre liens par un menu mobile complet donnant accès aux pages administrateur autorisées.
   - Conserver les contrôles de rôle côté serveur/base pour toutes les actions sensibles.
   - Corriger le rafraîchissement du jeton afin que les fonctions administrateur reçoivent toujours une session valide.

5. **Hiérarchie entièrement administrable**
   - Réactiver pour l’administrateur la création, la modification et la suppression des sous-préfectures, domaines et parcelles, avec confirmations et gestion des dépendances.
   - Synchroniser chaque action immédiatement ou la mettre en attente hors ligne.
   - Corriger le référentiel : Zoukougbeu devient un département du Haut-Sassandra et n’est plus une sous-préfecture de Daloa.

6. **Base de données et sécurité**
   - Ajouter seulement les colonnes/index nécessaires à l’archivage et à l’anti-doublon, avec droits explicites et politiques RLS.
   - Vérifier les droits administrateur sur toutes les tables et sur les objets des buckets `imports` et `photos`.
   - Exécuter le linter Supabase après migration sans modifier les alertes hors périmètre.

7. **Validation**
   - Vérifier les flux connecté/hors ligne/reconnexion, les suppressions admin, le menu mobile et la cohérence des compteurs/listes.
   - Comparer les données visibles après connexion depuis le preview et depuis le domaine public.

## Détail technique

- Supabase reste la source de vérité quand le réseau est disponible ; IndexedDB devient un cache hors ligne et une file transactionnelle, pas une base concurrente.
- Les suppressions sont propagées au cloud avant la prochaine récupération afin d’éviter la réapparition des éléments.
- Les données métier restent protégées par les rôles `admin`, `agent` et `viewer` existants ; aucune clé privilégiée n’est envoyée au navigateur.