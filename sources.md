# Sources et formats de Floréol

## Météo

La vue Météo démarre avec le scénario du simulateur. Le bouton **Open-Meteo** demande une prévision pour les coordonnées de l’installation. La ville et les coordonnées se modifient dans cette vue ou dans les paramètres. Le navigateur interroge le modèle « best match » sur cinq jours et convertit les horodatages Unix dans le fuseau retourné par le service. Les rayonnements du service sont des moyennes horizontales horaires. Une date de récupération accompagne chaque jeu de données. Si le service échoue, Floréol conserve le dernier jeu valide pour les coordonnées demandées et signale son ancienneté. En l’absence de cache, la prévision distante reste indisponible. Les commandes de la démonstration utilisent le scénario local. [API météo Open-Meteo](https://open-meteo.com/en/docs)

L’accès gratuit public convient à cette démonstration académique non commerciale, sous réserve des limites du service et de l’attribution CC BY 4.0. L’accès distant est déclenché par l’utilisateur. [Conditions d’utilisation d’Open-Meteo](https://open-meteo.com/en/terms)

## Potentiel solaire à Tanger

La référence embarquée reproduit la réponse du service PVGIS 5.3 pour 35,76° N et 5,83° O, 50 Wc en silicium cristallin, inclinaison de 30°, orientation sud et 15 % de pertes. La réponse obtenue utilise SARAH3 entre 2005 et 2023 et donne 82,01 kWh/an et 2 125,81 kWh/m²/an. Les valeurs mensuelles de production et d’irradiation sont enregistrées dans le projet pour la soutenance hors ligne. L’API PVcalc modélise une installation photovoltaïque raccordée. Ces valeurs servent de référence climatologique et ne prédisent pas l’énergie que la pompe consommera réellement. [Calcul JRC utilisé pour le profil local](https://re.jrc.ec.europa.eu/api/v5_3/PVcalc?lat=35.76&lon=-5.83&peakpower=0.05&loss=15&angle=30&aspect=0&outputformat=json)

Le JRC n’autorise pas les appels AJAX inter-origines. **Télécharger le calcul officiel** ouvre l’API directement. Enregistrez le résultat puis importez-le dans Floréol. Un changement de paramètre modifie la demande au JRC. La courbe indique toujours la référence effectivement chargée. Le JSON utilise le tableau `outputs.monthly.fixed`, l’énergie `E_m` en kWh et l’irradiation `H(i)_m` en kWh/m². Le CSV de PVcalc à douze mois est également accepté. [Contrat de l’API PVGIS](https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/using-pvgis-5/api-non-interactive-service_en)

## PVsyst et relevés locaux

Dans PVsyst, exportez une année de **valeurs mensuelles** avec une colonne Date, Mois ou Month et une colonne d’énergie parmi E_Grid, EAvail, E_User ou EArray. Précisez Wh, kWh ou MWh dans l’en-tête ou dans la ligne d’unités. Floréol accepte les séparateurs point-virgule, tabulation et virgule, les mois numériques ou écrits en français ou en anglais, les dates ISO, les dates jour/mois/année et mois/année. Les fichiers horaires ou pluriannuels doivent d’abord être cumulés en une valeur énergétique par mois. Les lignes manquantes ou répétées provoquent une erreur explicite. Le rapport PDF choisi s’affiche pendant la session. [Export des résultats dans PVsyst](https://www.pvsyst.com/help/project-design/simulation/create-a-csv-file-of-hourly-daily-values.html)

Pour comparer des relevés de production réels, importez un CSV avec les colonnes `Mois;Energie_kWh` et douze lignes. Choisissez des séries correspondant à la même puissance installée, au même périmètre énergétique et à une période comparable. Le navigateur conserve les données numériques importées localement. Les fichiers PDF et les appels de service ne sont pas requis pour utiliser le profil de référence.

## Rapports et sauvegardes

Le CSV reprend les cycles filtrés et utilise le point-virgule, la virgule décimale et UTF-8 avec BOM. L’export Excel crée un classeur Office Open XML avec données numériques, dates locales de Casablanca, sept onglets, en-têtes figés et filtres. Les totaux d’arrosage portent sur les cycles sélectionnés. Les feuilles de production, capteurs, maintenance et configuration documentent l’état de simulation et l’historique conservé. Une cellule de consommation électrique vide signifie que la pompe n’a pas de donnée permettant l’estimation.

Le volume théoriquement évité lors d’un blocage pour pluie correspond à la durée programmée multipliée par le débit prévu au moment de la tentative. Un cycle reporté pourra être exécuté ultérieurement. La sauvegarde JSON permet de transporter les données du simulateur avec ses paramètres et programmes. Une confirmation précède le remplacement des données locales. Les prévisions externes, les fichiers d’étude et les rapports PDF se chargent séparément.
