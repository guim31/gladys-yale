# Intégration Yale Home — `guim31/gladys-yale`
Les serrures connectées **Yale** (Linus, Linus L2, Assure…) et **August**, via le cloud **Yale Home / Yale Access** (même plateforme qu'August), comme l'intégration HA `yale` (et `august`), bibliothèque **`yalexs`** (MIT).
- **Connexion** : e-mail + mot de passe + **code de vérification** envoyé par e-mail/SMS (action de configuration « Saisir le code »). Choisir la marque / région (Yale Home Europe vs August US). Jetons dans `/data`.
- **Un appareil par serrure** : **verrouillé / déverrouillé**, porte ouverte/fermée (DoorSense), batterie, dernier utilisateur et méthode (appli, clavier, empreinte, manuel) si l'API la donne, en ligne.
- **Commandes** : verrouiller ; **déverrouiller désactivé par défaut** (option à cocher, avertissement), jamais exposé comme interrupteur (pas de commande vocale) — même règle que `gladys-stellantis` et `gladys-simplisafe`.
- **Temps réel** : `yalexs` utilise PubNub pour les événements : reproduis-le si c'est raisonnable en Node, sinon relève périodique.
- **Déclencheurs** : « porte déverrouillée par … », « porte restée ouverte », « batterie faible ».
- **Widget** : état et bouton verrouiller (et déverrouiller avec confirmation si autorisé).
## Références
`bdraco/yalexs` (MIT) et l'intégration HA `yale` (Apache-2.0), leurs fixtures. `scripts/probe.mjs` : faux compte.
## Spécifique
`name` : « Yale Home ». Catégorie sécurité. `transports: ["cloud"]`. Développée sans le matériel. Mention « not affiliated with Yale / ASSA ABLOY ».

## Consignes de la série
- Services à compte : `scripts/probe.mjs` qui déroule la vraie connexion jusqu'au refus d'un faux compte, sans rien afficher de sensible (l'orchestrateur la lancera depuis une machine qui a le réseau).
- Appareils locaux : un faux appareil pour les tests de bout en bout, et `scripts/probe.mjs <ip>` en lecture seule.
- Sécurité : tout ce qui ouvre, déverrouille, désarme ou coupe une alarme est désactivé par défaut, jamais exposé comme interrupteur.

## Cadre commun (série du 14/10/2026 : SDK 0.15, Gladys 5.2)

Tu développes une **intégration externe Gladys Assistant** dans ce dépôt public, créé à l'instant depuis le template officiel `GladysAssistant/integration-template-js` (SDK `@gladysassistant/integration-sdk` **^0.15.0**, Node, ESM). Elle répond à l'appel de Pierre-Gilles, le mainteneur de Gladys, qui veut remplir le store avec les intégrations les plus utilisées de Home Assistant. Prends ton temps et raisonne en profondeur : mieux vaut une intégration juste et bien testée qu'une intégration large et approximative.

Le premier commit de `main` (posé par l'orchestrateur) contient déjà plusieurs choses : les notes du mainteneur dans `CLAUDE.md`, `test/fixtures/gladys-feature-table.json` (les couples catégorie/type que le front du cœur sait afficher), les miroirs Docker Hub, et un job CI « Store checks » qui lance le validateur du store à chaque PR.

### À lire avant d'écrire une ligne
1. **`CLAUDE.md`** en entier : les règles du template, puis les « notes du mainteneur ». Ce sont les pièges du cœur déjà payés sur une soixantaine d'intégrations : polling et piège #3198, `min`/`max`, couples catégorie/type, états perdus avant l'ajout, budget des widgets, journaux, langues… Ne les reproduis pas.
2. **La spec du cœur.** Clone-la avec `git clone --filter=blob:none --sparse https://github.com/GladysAssistant/Gladys`, puis `git sparse-checkout set docs/specs/external-integrations server/utils server/lib/external-integration front/src/components/boxs front/src/config/i18n`.
   - **Cible la dernière version publiée**, 5.2.1 (`git tag --sort=-creatordate | head -1`).
   - `master` décrit aussi des fonctions pas encore publiées : vérifie chaque capacité avec `git tag --contains <commit>` ou `git show v5.2.1:<chemin>`.
   - Lis le fichier de `capabilities/` qui te concerne.
3. **Le README et le CHANGELOG du SDK**, sur `master` (`git clone --depth 1 https://github.com/GladysAssistant/integration-sdk-js`). Ils couvrent :
   - le polling et `DEVICE_POLL_FREQUENCIES` ;
   - les widgets, les déclencheurs et actions de scène ;
   - la découverte médiée (mDNS, SSDP, UDP) ;
   - la déduplication des états ;
   - le **faux Gladys de test** `@gladysassistant/integration-sdk/testing`, à préférer à un faux maison.
4. **Les intégrations récentes de guim31, comme modèles** (clone public, lecture seule). Elles appliquent toutes ces règles :
   - `guim31/gladys-wled` : architecture, `test/gladys-rules.test.js`, `test/i18n.test.js`, widgets, scènes ;
   - `guim31/gladys-pihole` : API locale à mot de passe, widget à boutons ;
   - `guim31/gladys-ping-wol` : actions de configuration, découverte SSDP médiée ;
   - `guim31/gladys-wiz` : découverte UDP médiée ;
   - `guim31/gladys-fritzbox` : faux serveur ;
   - `guim31/gladys-subsonic` : minuteur de sondage interne (`src/poller.js`) et journaux dédupliqués (`src/issues.js`), après le passage au SDK 0.15.
5. **L'intégration Home Assistant équivalente** (Apache 2.0) et la bibliothèque qu'elle utilise. Leurs tests contiennent souvent de **vraies réponses** d'API ou d'appareils : reprends-les en fixtures.
   - Respecte les licences : un projet sans licence ou sous GPL se lit pour comprendre le protocole, mais ne se recopie pas.
   - Crédite les auteurs dans le README.

Le proxy de la session refuse `api.github.com` et `codeload.github.com` : `git clone` marche, mais pas le téléchargement d'archives. Pour lancer le validateur du store, clone `GladysAssistant/integration-store` et lance-le depuis ce clone.

Le proxy de la session refuse aussi beaucoup de services tiers (Gigya, Hub'Eau, Vigicrues l'ont été dans la série précédente). Si l'API visée est injoignable depuis ta session, ne t'arrête pas : travaille sur des fixtures réelles publiées (tests de Home Assistant et des bibliothèques), et écris un petit script `scripts/probe.mjs` qui éprouve le client réel en lecture seule, sans rien afficher de sensible. L'orchestrateur le lancera depuis une machine qui a le réseau.

### Exigences
- Branche `feat/initial`, PR **brouillon** vers `main`, ouverte dès le premier push.
- **Supprime tout le code de démonstration du template** : station météo, prise, lampe, caméra, capteur de mouvement, interrupteur, `src/weather.js`. Supprime aussi leurs tests et leurs entrées du manifeste et de la doc.
- **Test de conformité** `test/gladys-rules.test.js`, appuyé sur la table des couples (pars de celui de `gladys-wled`). Pour chaque appareil construit à partir de fixtures réalistes, il vérifie :
  - couple catégorie/type présent dans la table ;
  - `should_poll: true` si et seulement si `poll_frequency` est donné, et `poll_frequency` est dans la liste ;
  - `min`/`max` numériques partout ;
  - `read_only` et `has_feedback` booléens ;
  - unités connues ;
  - `external_id` uniques et noms distincts.
  Ne le modifie pas pour le faire passer : c'est l'intégration qu'il faut corriger.
- **Rafraîchissement** : le cœur ne sonde pas de façon fiable les appareils externes (Gladys#3198, non corrigé dans la 5.2.1).
  - L'intégration **se rafraîchit elle-même** par un minuteur interne, avec un `onPoll` de repli (voir `gladys-subsonic`).
  - Respecte les quotas et les conditions de l'API, et écris-les dans la doc.
  - Un test prouve que les états se rafraîchissent sans `onPoll`.
- **États** :
  - ne publier que les changements (déduplication du SDK) ;
  - tout republier dans `onDeviceCreated`, puis `requestWidgetRefresh` s'il y a des widgets ;
  - un heartbeat d'au moins une fois toutes les 12 h.
- **Journaux calmes** : rien au niveau info pour un cycle normal.
  - L'info ne garde que le cycle de vie : démarrage, connexion, perte et retour, erreurs utiles, une ligne par action de l'utilisateur.
  - Une erreur qui se répète écrit une ligne au premier échec et une au rétablissement.
  - `LOG_LEVEL=debug` montre le reste.
  - Jamais de secret ni d'adresse avec identifiants.
  - Un test vérifie qu'un cycle normal n'écrit rien en info, et qu'aucun secret de la config n'apparaît dans les journaux.
- **Widgets, déclencheurs et actions de scène** : Guilhem les veut, mais avec un vrai usage.
  - Pas de déclencheur qui doublonne l'état d'un appareil, sauf valeur ajoutée claire.
  - **Clés en anglais, stables** : elles sont définitives une fois publiées.
  - `gladys_version` : `>=5.1.0` au moins, `>=5.2.0` si tu utilises un bouton de widget qui ouvre un formulaire (#3168).
- **Quatre langues partout**, pour tout texte visible : `en`, `fr`, `de` (tutoiement « du », jamais de « Sie »/« Ihr » de politesse) et `es` (vouvoiement « usted »).
  - Cela couvre le manifeste, les textes produits par le code (widgets, messages d'action, erreurs) et les noms de fonctionnalités, via un champ de config `language` dont la valeur par défaut est `fr`.
  - Reprends le vocabulaire de l'interface de Gladys (`front/src/config/i18n/de.json`, `es.json`). Les marques ne se traduisent pas.
  - **Documentation `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`** complètes et synchronisées, avec les mêmes sections : présentation, prérequis, configuration, ce que fait chaque appareil, widget, déclencheur et action, exemples de scènes, dépannage, limites. Le store publie les quatre depuis Gladys 5.2.
  - `test/i18n.test.js` (pars de celui de `gladys-wled`) échoue si une langue manque, si un texte est vide ou trop long, ou si les quatre docs n'ont pas les mêmes sections.
  - Mets à jour `CLAUDE.md` : le template y dit encore « bilingual ».
- **Manifeste** :
  - `name` court et reconnaissable, de 3 à 30 caractères, identique dans toutes les langues ;
  - `description` de 100 caractères au plus par langue ;
  - `categories` juste, au sens du vocabulaire de `integration-store/src/categories.js` ;
  - `transports` exacts : `local` seul quand le cloud n'est qu'une option annexe ;
  - `docker_image` `ghcr.io/guim31/<dépôt>:<version actuelle>` ;
  - **Ne touche ni à `version` ni à `cover.png`** : la cover est faite par l'orchestrateur.
- **Matériel** : si l'intégration est développée sans le matériel ni le compte, dis-le en clair dans le README (« Developed without the hardware: feedback welcome ») et dans les quatre docs.
- **Identifiants** (mots de passe, jetons, clés) : ils vivent dans la configuration ou dans `/data`, jamais dans les journaux.
- **Fichiers du dépôt** :
  - `LICENSE` Apache-2.0, texte complet, copié de `guim31/gladys-pihole` (gladys-wled n’en a pas) ;
  - `CHANGELOG.md` : remplace le `## [Unreleased]` hérité du template par ce que l'utilisateur obtient (`### Added`), sans titre de version ;
  - `SECURITY.md` : adapte la section « Scope » (ce qui est stocké dans `/data`, secrets, réseau) ;
  - `CLAUDE.md` : mets à jour « Architecture » et ajoute une section propre à l'intégration (API, pièges découverts) ;
  - README en anglais : ce que fait l'intégration, prérequis, installation (« Integrations → Install from GitHub »), limites, crédits, « not affiliated with <marque> ».
- **Contraintes du bac à sable de Gladys** :
  - 256 Mo de mémoire, `CapDrop: ALL`, rootfs en lecture seule ;
  - réseau en pont, donc ni broadcast, ni mDNS, ni SSDP, sauf par la **découverte médiée** du cœur ;
  - évite les dépendances lourdes.
- **Ne touche ni à la ligne `FROM` du `Dockerfile` ni à `.github/`.**
- **Avant de rendre la main** :
  - `npm run format:check`, `npm run lint`, `npm test` et le validateur du store (`--skip-image-check`) au vert ;
  - **CI de la PR verte** sur ses quatre jobs : Node 22, Node 24, Docker build, Store checks. Un 429 Docker Hub n'est pas un bug de ton code.
  - Ajoute au `CLAUDE.md` tout piège nouveau.
- Commits en anglais. Termine chaque message de commit par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

### Interdits
- Ne fusionne pas.
- Ne passe pas la PR en « prête ».
- Ne pose ni tag ni topic, ne lance aucune release.
- Ne lance aucune autre session.
- Ne poste rien nulle part.
- Aucun secret, identifiant réel ni adresse privée dans le dépôt, qui est public, y compris dans les fixtures : anonymise-les (IP en 192.0.2.x, MAC et numéros de série inventés).

### Rapport final (ton dernier message)
- L'URL de la PR, l'état des quatre jobs de CI, la sortie du validateur et du test de conformité.
- **Ce qui n'a pas pu être vérifié sans le matériel, le compte ou une instance Gladys réelle**, et les hypothèses prises.
- Les questions ouvertes pour Guilhem. Tranche toi-même les choix de conception et note-les.
- Pour l'annonce sur le forum, en français :
  - les fonctionnalités telles qu'un utilisateur les voit ;
  - deux ou trois idées de scènes concrètes ;
  - l'installation ;
  - la version minimale de Gladys ;
  - les limites ;
  - le matériel visé.
