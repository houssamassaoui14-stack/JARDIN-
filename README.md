# Vérification de la livraison

## Calculs et protections

Les dix-huit tests Node vérifient les formules hydrauliques et électriques, la surface arrosable, les calibrations, les changements de capacité et de puissance, les périodes d’énergie, le calendrier de Casablanca, les conflits, le passage de minuit, le report en cas de nuit ou de pluie, les acquittements requis par l’adaptateur, la fraîcheur de la télémétrie et la restauration des sauvegardes. Ils vérifient aussi le profil PVGIS, le format PVsyst, la réponse météo et le contenu d’un classeur Excel relu avec ExcelJS. Les commandes reproductibles figurent dans le README principal.

Le test de contrat de la passerelle vérifie en mémoire le refus d’accès sans rôle adéquat, la validation de la télémétrie, la confirmation, la déduplication et l’acquittement. Sur le poste de développement, Avast Web/Mail Shield remplace le certificat TLS de test par une chaîne non approuvée. Le client a refusé cette connexion. La liaison HTTPS complète doit être validée avec le certificat de déploiement.

## Navigateur

Les captures du dossier sont issues de Chrome piloté par Playwright. `parcours.json` consigne les parcours d’interface exécutés. `hors-ligne.json` consigne les essais de la distribution compilée sous un chemin de dépôt, hors réseau, avec un service météo indisponible et sans WebGL. Les contrôles concernent des écrans de navigateur et des largeurs émulées. Les essais sur les véritables téléphones Android et iPhone ainsi que Safari restent à effectuer.

Les tests d’interface utilisent un profil de navigateur indépendant. La valeur de 720 L sur la capture mobile du réservoir correspond au scénario de changement de capacité à 1 000 L avec remplissage explicite. La valeur de 500 L sur l’accueil correspond à l’état initial.

## Limites matérielles

Le bilan électrique de la pompe reste indéterminé sans puissance ou courant mesuré. Les consommations, irradiances et cycles du simulateur sont identifiés en tant que tels. Les données climatiques et les fichiers d’étude gardent leur provenance. Le firmware préparatoire n’a pas été compilé sur une carte cible ni téléversé. Le débit réel, les interverrouillages locaux, le matériel de commutation, la calibration des capteurs et le fonctionnement du jardin nécessitent un banc matériel.

## Outils utilisés

React, TypeScript, Vite, Three.js, GSAP/ScrollTrigger, ExcelJS, Lucide et Playwright ont été utilisés. La direction visuelle s’appuie sur les consignes de Taste et Impeccable, une recherche UI UX Pro Max et la consultation des catalogues 21st.dev et React Bits. Aucun composant payant n’a été récupéré. Les fonctions de mouvement utilisent GSAP et les transitions CSS. DesignLang n’a pas été trouvé dans le catalogue local de compétences. Blender a servi aux rendus du GLB et du jardin V3.

Les images d’équipe restent locales par défaut. La génération du ZIP relit ses entrées, vérifie leur intégrité et recherche les coordonnées privées connues ainsi que les marqueurs de clé privée. Le projet n’a pas été publié sur un compte public.