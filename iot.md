# Préparer le futur système connecté

## État livré

Le mode démonstration gère localement l’installation. La vue **Connexion ESP32** accepte une origine HTTPS, un identifiant de dispositif et un jeton d’opérateur gardé en mémoire pour cette vue. La connexion exige une réponse authentifiée et des mesures de moins de quinze secondes. L’adaptateur renvoie un état déconnecté à la perte des mesures. Les ordres requièrent une confirmation, un rôle autorisé, une validation côté serveur et un acquittement par le dispositif. Le code n’a pas été testé sur le prototype physique.

## Passerelle

`backend/server.mjs` est un service Node distinct de GitHub Pages. Préparer une machine privée avec Node.js 24 ou supérieur, un domaine HTTPS et un stockage persistant sauvegardé. Le projet ne souscrit à aucun fournisseur. Les variables suivantes appartiennent à l’environnement du service, en dehors du dépôt et des ressources Vite.

| Variable | Usage |
|---|---|
| TLS_CERT, TLS_KEY | Chemins locaux de la chaîne de certificats et de la clé privée de la passerelle |
| ALLOWED_ORIGIN | Origine HTTPS exacte du frontend autorisé |
| DEVICE_ID | Identifiant de l’installation |
| DEVICE_TOKEN, VIEWER_TOKEN, OPERATOR_TOKEN, ADMIN_TOKEN | Quatre valeurs privées et distinctes de 32 caractères ou plus |
| DATA_DIR | Dossier persistant privé pour les événements et commandes |
| BIND_HOST, PORT | Adresse d’écoute de la passerelle, par défaut 127.0.0.1 et 8443 |
| LLM_URL, LLM_MODEL, LLM_API_KEY | Paramètres exclusivement serveur du fournisseur génératif facultatif |

Démarrer le service par `node backend/server.mjs`. Conserver les journaux et le dossier de données hors de l’arborescence publique. Régler les droits du système, le renouvellement TLS et la rotation des jetons. Pour un déploiement multiutilisateur, remplacer les sessions statiques de laboratoire par des sessions individuelles révocables et la gestion de rôles du service d’identité choisi.

L’appareil établit lui-même les connexions sortantes. Le navigateur communique uniquement avec le backend. La passerelle enregistre les événements, les mesures reçues et les commandes. Les ordres expirent après dix secondes, leurs identifiants servent à la déduplication et les ordres en attente sont invalidés au redémarrage. Les horaires de la démonstration sont stockés dans le navigateur. L’ordonnancement permanent de l’installation réelle reste à intégrer côté appareil ou backend.

## Firmware préparatoire

Le projet PlatformIO se trouve dans `firmware/esp32`. La configuration inclut une carte ESP32 de développement de référence. Confirmer le modèle exact avant compilation destinée au banc. Effectuer les travaux suivants dans une copie privée.

1. Copier `include/local.example.h` en `include/local.h`. Renseigner le réseau de test, l’URL TLS et sa racine de confiance, l’identifiant et l’identifiant secret propre à l’appareil.
2. Adapter `include/board_private.h` à la carte, aux capteurs choisis et à leurs calibrations. Implémenter les fonctions du contrat `board.h`. Sans cette adaptation, les lectures et l’autorisation de démarrage restent invalides, et la commande matérielle demeure inactive.
3. Vérifier la tension de 24 V DC de la pompe, son courant nominal et son courant de démarrage. Choisir une commande moteur isolée ou adaptée, la protection contre les surtensions inductives, les protections électriques et contre les projections, puis une alimentation de l’ESP32 convenable. Ne pas alimenter directement le moteur depuis une broche.
4. Définir les limites validées sur le banc, la réserve, le débit minimal, la surintensité et la durée maximale. Vérifier les sécurités avec l’étage moteur débranché. La coupure d’urgence et les interverrouillages locaux doivent rester efficaces même si le réseau est indisponible.
5. Avec PlatformIO et les dépendances de la carte installées, compiler par `pio run` dans le dossier du firmware. La mise sous tension, le téléversement, les essais de charge et le raccordement du jardin demandent une validation sur le matériel.

## Vérifications de mise en service

- Démarrage et redémarrage avec pompe arrêtée. Vérifier les mesures, leurs unités, la cohérence du réservoir et la synchronisation horaire.
- Vérifier le rôle en lecture seule, l’autorisation opérateur et la séparation entre identité d’équipement et identité humaine.
- En simulation de banc, vérifier refus si niveau bas, absence de débit, tension insuffisante ou arrêt d’urgence. Vérifier la coupure sur perte de liaison, la durée maximale et la déduplication après redémarrage.
- Suivre une commande confirmée, son accusé de réception, les valeurs de débit, d’eau et d’énergie, puis leur conservation. Vérifier séparément la stratégie des futurs programmes permanents.
- Mesurer les caractérisations manquantes. Une HMT de 5 à 8 m reste une indication pour des modèles semblables. Les caractéristiques de démarrage et la compatibilité du contrôleur solaire restent à établir sur cette installation.