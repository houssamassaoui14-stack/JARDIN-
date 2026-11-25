# Présenter Floréol au jury

## Avant la séance

Lancez la version locale, ouvrez l’accueil, puis vérifiez le logo et les points interactifs de la maquette. Le fichier `Lancer_Floreol.cmd` utilise le dossier de production fourni et écoute uniquement sur cet ordinateur. Node.js 24 ou supérieur doit être installé. Aucun compte ni accès Internet n’est nécessaire au simulateur. Dans un navigateur qui autorise les service workers, une première visite complète de la version de production prépare également le rechargement hors ligne.

Dans **Statistiques et rapports**, téléchargez une sauvegarde JSON si vous souhaitez conserver la session précédente. **Mode jury → Réinitialiser** efface les données fictives de ce navigateur après confirmation. L’horloge du simulateur repart à midi à Casablanca, avec 500 L et un panneau de 50 Wc. L’interface affiche l’heure de cette simulation.

## Visite de cinq minutes

1. Sur l’accueil, faites tourner le prototype, sélectionnez la station et lancez l’animation Blender. Précisez que le système physique et la modélisation existent.
2. Dans **Le système**, parcourez la captation, la commande électrique, le stockage, le pompage, la distribution et les jets. Le schéma animé explique le circuit lorsque le matériel graphique ne permet pas la 3D.
3. Dans **Réservoir**, retrouvez les 25 L de réserve et les 475 L utilisables. À 2 L/min, l’autonomie hydraulique est de 237,5 min, soit 23 cycles complets de dix minutes.
4. Dans **Arrosage**, choisissez dix minutes puis ×60. Lancez l’arrosage. Après environ dix secondes réelles, le volume atteint 480 L. L’onglet des rapports contient un cycle de 20 L.
5. Dans **Alertes**, sélectionnez la pluie. Revenez à la commande pour constater le blocage. Dans **Énergie solaire**, passez à l’ombrage et observez l’écart avec la référence. La fenêtre de diagnostic et l’irradiance minimale sont réglables. Revenez ensuite au ciel dégagé.
6. Dans **Statistiques et rapports**, téléchargez le classeur Excel. Dans **Floréol AI**, demandez combien de cycles restent. Terminez par les portraits, le rôle de l’encadrante et les perspectives de connexion.

Le bouton **Mode jury** orchestre douze étapes avec les flèches du clavier, un passage automatique facultatif et le plein écran. Le scénario de dix minutes utilise le simulateur et enregistre un véritable rapport local. Les scénarios tiennent compte des réglages et de l’eau déjà utilisée. Une réinitialisation volontaire permet de reproduire exactement les chiffres du guide.

## Points techniques à défendre

- **Eau**. Une dose illustrative de 4 L/m² et 20 L distribués à 100 % d’efficacité donnent 5 m². L’aire reste à valider par un essai de distribution. Un rayon mesuré produit une autre grandeur, la couverture géométrique.
- **Électricité**. À 1 000 W/m² et avec un coefficient global illustratif de 0,85, un panneau de 50 Wc donne une référence estimée de 42,5 W. La puissance instantanée change avec l’heure et le scénario. Mesurer le courant de démarrage et vérifier le contrôleur avant toute affirmation sur la compatibilité de la pompe 24 V.
- **Études**. PVGIS fournit une climatologie. PVsyst fournit des simulations importées. La puissance issue d’un capteur réel n’apparaîtra qu’après l’intégration matérielle.
- **Sécurité**. Le contrôle de niveau, le débit, les défauts et l’arrêt local doivent être validés sur banc. L’état ESP32 reste déconnecté en l’absence d’une session authentifiée et d’une télémétrie fraîche.
- **Preuves et médias**. Les rendus proviennent des fichiers du projet. Les futures vidéos du prototype pourront compléter la galerie après autorisation.