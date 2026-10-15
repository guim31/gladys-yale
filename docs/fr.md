# Yale Home

Suivez et verrouillez vos serrures connectées **Yale** et **August** depuis Gladys, via le cloud
Yale Home (ou le cloud August / Yale Access aux États-Unis) : état du pêne, porte (DoorSense),
batterie, qui a manœuvré la serrure et comment, en temps réel quand le cloud le permet.

**Développée sans le matériel : retours bienvenus.** L'intégration a été écrite d'après le
comportement publié du cloud (bibliothèque yalexs, intégration Home Assistant) et testée sur des
réponses enregistrées, jamais sur une vraie serrure. Signalez ce qui marche et ce qui ne marche pas
sur [github.com/guim31/gladys-yale/issues](https://github.com/guim31/gladys-yale/issues).

Cette intégration n'est pas affiliée à Yale, August ni ASSA ABLOY. Yale, August, Linus et DoorSense
sont des marques de leurs propriétaires.

## Présentation

- Un appareil Gladys par serrure du compte : **Serrure** (verrouillée, déverrouillée, en
  mouvement, bloquée), **Porte** (ouverte ou fermée, avec DoorSense), **Batterie**, **Pile du
  clavier faible** (avec un clavier), **En ligne** (le cloud joint la serrure), **Dernier
  utilisateur** et **Dernière méthode**.
- Verrouillage depuis le widget, une scène ou la configuration. Le déverrouillage est **désactivé
  par défaut** et jamais possible à la voix ni comme un interrupteur.
- Trois déclencheurs de scène : **Serrure Yale déverrouillée** (par qui et comment), **Porte restée
  ouverte**, **Batterie Yale faible**.

Serrures visées : toutes celles de l'application Yale Home / August, Yale Linus, Linus L2, Assure
Lock 2, Yale Conexis L2, August Smart Lock (3e et 4e génération, Wi-Fi), avec leur pont (Connect,
Wi-Fi intégré) pour être jointes à distance.

## Prérequis

- Gladys 5.1.0 ou plus récent.
- Une serrure déjà installée dans l'application Yale Home (ou August / Yale Access), avec son
  **pont** : Yale Connect Bridge, August Connect, ou Wi-Fi intégré. Sans pont, le cloud ne joint pas
  la serrure : pas de verrouillage à distance, et les états ne changent que quand un téléphone se
  synchronise en Bluetooth.
- L'adresse e-mail (ou le numéro de téléphone) et le mot de passe d'un compte **propriétaire** de la
  serrure (« superuser » dans l'application). Un accès invité ne suffit pas.
- L'accès à cette boîte e-mail ou à ce téléphone pour le code de vérification, une fois.

## Configuration

### Connexion

1. Dans Gladys, **Intégrations → Installer depuis GitHub**, puis ouvrez la configuration de Yale
   Home.
2. Choisissez l'**Application** que vous utilisez : **Yale Home** (Europe et reste du monde),
   **Yale Access (États-Unis)** ou **August (États-Unis)**.
3. Dans **Se connecter avec**, choisissez adresse e-mail ou numéro de téléphone ; renseignez
   **Adresse e-mail ou numéro de téléphone** (un numéro commence par + et l'indicatif du pays, par
   exemple +33612345678) et **Mot de passe**, puis enregistrez.
4. La première fois, le statut demande un code. En bas de la page, cliquez sur **Envoyer le code** :
   un code arrive par e-mail ou SMS.
5. Saisissez-le dans **Saisir le code** et lancez l'action. Le statut affiche alors « Connecté » et
   le nombre de serrures ; les serrures apparaissent dans l'onglet Découverte, ajoutez-les à Gladys.

Le code valide cette installation de l'intégration : un redémarrage, un nouveau jeton ou un jeton
expiré ne demandent pas de nouveau code. **Se déconnecter** oublie le jeton et l'installation ; il
faut alors un nouveau code.

### Réglages

| Réglage                                   | Défaut    | Usage                                                                                                           |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------- |
| Application                               | Yale Home | Le cloud de votre application.                                                                                  |
| Se connecter avec                         | E-mail    | Adresse e-mail ou numéro de téléphone, comme dans l'application.                                                |
| Adresse e-mail ou numéro de téléphone     | —         | L'identifiant du compte.                                                                                        |
| Mot de passe                              | —         | Jamais réaffiché par Gladys ; l'intégration ne garde que le jeton, dans `/data`.                                |
| Clé d'application (avancé)                | vide      | Laissez vide. Seulement si vous détenez une autre clé fournie par Yale (voir Limites).                          |
| Autoriser le déverrouillage depuis Gladys | désactivé | Désactivé : verrouiller seulement. Activé : le widget (après confirmation) et les scènes peuvent déverrouiller. |
| Lecture des serrures                      | 5 minutes | Rythme des lectures quand le temps réel est indisponible ; toutes les 30 minutes sinon.                         |
| Langue des noms et des textes             | Français  | Noms des fonctionnalités (gardés par Gladys une fois ajoutés), dernière méthode, déclencheurs.                  |

## Appareils

Chaque serrure du compte devient un appareil nommé comme dans l'application, modèle « Yale Home »
(ou August) suivi du modèle de la serrure. Toutes les fonctionnalités sont en lecture seule : rien
ne peut ouvrir la porte comme un interrupteur, ni par une commande vocale ou une scène « tout
éteindre ».

### Fonctionnalités

| Fonctionnalité         | Type dans Gladys          | Valeurs                                                        |
| ---------------------- | ------------------------- | -------------------------------------------------------------- |
| Serrure                | état de serrure           | 0 déverrouillée, 1 verrouillée, 2 en mouvement, 3 bloquée      |
| Porte                  | détecteur d'ouverture     | 0 ouverte, 1 fermée (DoorSense seulement)                      |
| Batterie               | batterie, %               | niveau des piles de la serrure                                 |
| Pile du clavier faible | batterie faible (oui/non) | 1 quand le clavier signale des piles faibles (avec un clavier) |
| En ligne               | entrée                    | 1 quand le cloud joint la serrure par son pont                 |
| Dernier utilisateur    | texte                     | nom de la dernière personne qui a verrouillé ou déverrouillé   |
| Dernière méthode       | texte                     | comment (voir ci-dessous)                                      |

Les méthodes : **Appli (à distance)**, **Appli (Bluetooth)**, **Clavier**, **Empreinte**, **À la
main** (bouton intérieur ou clé), **Automatique** (verrouillage automatique), **Badge ou carte**,
**Home Key**, **Autre**. Elles viennent de l'historique de l'application ; une serrure qui ne le
précise pas affiche **Autre**.

## Widget

Le widget **Serrure Yale** montre une serrure : son nom, la batterie (en direct), l'état du pêne, la
porte, le dernier utilisateur et la méthode, la liaison avec le cloud. Son bouton **Verrouiller**
verrouille ; le bouton **Déverrouiller** n'apparaît que si le déverrouillage depuis Gladys est
autorisé, en rouge, et demande une confirmation. L'état courant est signalé par une icône coche.
Choisissez la serrure dans les réglages du widget (vide : la seule serrure du compte).

## Déclencheurs de scène

- **Serrure Yale déverrouillée** : une serrure a été déverrouillée. Filtres : la serrure, comment
  (clavier, empreinte, appli…), l'utilisateur écrit exactement comme dans l'application. Variables :
  `lock_name`, `user`, `method` (clé : `keypad`, `fingerprint`, `remote`, `bluetooth`, `manual`,
  `auto`, `tag`, `homekey`, `other`) et `method_label` (dans la langue de la configuration).
- **Porte restée ouverte** : la porte d'une serrure équipée de DoorSense est restée ouverte 1, 2,
  5, 10, 15, 30 minutes ou 1 heure (un choix par scène ; un événement à chaque palier tant que la
  porte reste ouverte). Variables : `lock_name`, `minutes`.
- **Batterie Yale faible** : les piles de la serrure sont passées sous 20 % (ou la serrure les
  signale), ou celles du clavier sont faibles. Une fois par baisse, même après un redémarrage.
  Variables : `lock_name`, `part` (`lock` ou `keypad`), `level` (%).

Un événement « déverrouillée » vient de l'historique : avec le temps réel, quelques secondes après
l'opération ; sans lui, à la lecture suivante. Une activité vue avec plus de 10 minutes de retard ne
déclenche rien.

## Actions de scène

- **Verrouiller une serrure Yale** : verrouille la serrure choisie ; sortie `state` (`locked`, ou
  `jammed`).
- **Déverrouiller une serrure Yale** : la déverrouille, seulement si **Autoriser le déverrouillage
  depuis Gladys** est activé ; l'action échoue sinon.

## Actions de la configuration

- **Envoyer le code** : demande au cloud un code de vérification.
- **Saisir le code** : valide cette installation avec le code reçu.
- **Verrouiller une serrure** : verrouille maintenant la serrure choisie.
- **Tester la connexion** : lit les serrures du compte, sans les manœuvrer.
- **Se déconnecter** : supprime le jeton et cette installation (un nouveau code sera nécessaire).

## Temps réel et quotas

L'intégration s'abonne, comme l'application, au canal temps réel (PubNub) de chaque serrure : une
opération ou la porte arrivent en quelques secondes, puis l'historique dit qui et comment. Quand ce
canal est indisponible, les serrures sont lues toutes les **Lecture des serrures**.

Une lecture, c'est une requête pour la liste des serrures, une par serrure (état, porte, piles, pont)
et une par logement (les 10 dernières activités). Avec deux serrures dans un logement et sans temps
réel, cela fait 4 requêtes toutes les 5 minutes ; avec le temps réel, toutes les 30 minutes. Yale ne
publie aucun quota pour cette API non officielle ; quand elle répond « trop de requêtes »,
l'intégration fait une pause de 10 minutes, puis jusqu'à 2 heures. Elle ne réveille jamais une
serrure pour la lire (cela vide les piles) : l'état affiché est le dernier que le cloud connaît,
comme dans l'application.

## Exemples de scènes

- **Bienvenue** : déclencheur **Serrure Yale déverrouillée**, comment = Clavier ou Empreinte →
  allumer l'entrée et envoyer « {{triggerEvent.data.user}} est rentré ».
- **Porte oubliée** : déclencheur **Porte restée ouverte**, 10 minutes → notification « La porte
  {{triggerEvent.data.lock_name}} est ouverte depuis 10 minutes ».
- **Verrouillage du soir** : tous les jours à 23 h, si l'état de la serrure n'est pas 1 →
  **Verrouiller une serrure Yale**.
- **Piles** : déclencheur **Batterie Yale faible** → un rappel pour acheter des piles.

## Dépannage

- **« Le cloud a refusé la clé de l'application, pas votre compte »** : voir Limites ci-dessous.
- **« Le cloud a refusé l'adresse e-mail, le numéro ou le mot de passe »** : vérifiez-les dans
  l'application, puis enregistrez de nouveau la configuration. L'intégration cesse d'essayer
  jusqu'au prochain changement de configuration, pour que le compte ne soit pas bloqué.
- **Le code est refusé** : il est valable quelques minutes ; relancez **Envoyer le code** et
  saisissez le plus récent.
- **« La serrure est injoignable : son pont est hors ligne »** : vérifiez le pont Connect ou le
  Wi-Fi de la serrure dans l'application.
- **Aucune serrure trouvée** : le compte doit être propriétaire de la serrure ; un accès invité ne
  suffit pas.
- **Rien en temps réel** : le statut indique « relevés périodiques » ; les états suivent quand même,
  au rythme des lectures.
- Plus de détails : variable d'environnement `LOG_LEVEL=debug` sur le conteneur. Les journaux ne
  contiennent jamais le mot de passe, le jeton, l'adresse e-mail ni la clé d'application.

## Limites

- **Clé d'application.** Le cloud n'accepte que les requêtes d'une application qu'il connaît, par sa
  clé. L'intégration utilise les clés publiques des applications, celles que publiait la
  bibliothèque yalexs. Yale a indiqué en janvier 2025 que Yale Home n'accepte plus que des clés de
  partenaires, et yalexs constate la même chose pour August : depuis, Home Assistant se connecte par
  une liaison de compte officielle qui lui est réservée. Si le cloud refuse la clé, le statut le dit
  clairement ; votre compte n'y est pour rien, et l'intégration ne peut pas fonctionner tant que Yale
  n'accepte pas de nouveau une clé. Si vous détenez une clé fournie par Yale, saisissez-la dans
  **Clé d'application (avancé)**.
- API non officielle, celle des applications : elle peut changer sans prévenir.
- Ni sonnette, ni caméra, ni alarme (alarmes Yale Home) : les serrures seulement. Pas
  d'« ouverture » (unlatch) de la Linus L2 : déverrouiller suffit à ouvrir la porte.
- Une serrure Bluetooth seule (sans pont) apparaît hors ligne et ne se manœuvre pas à distance.
- Développée sans le matériel ni compte : le vocabulaire exact de certaines serrures récentes peut
  différer.

## Crédits

Construite sur ce que la bibliothèque [yalexs](https://github.com/bdraco/yalexs) (MIT, de Joe Lu,
J. Nick Koston et contributeurs) et l'[intégration Yale de Home
Assistant](https://www.home-assistant.io/integrations/yale) (Apache 2.0) ont appris du cloud ; leurs
réponses enregistrées sont les fixtures des tests.
