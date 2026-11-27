# Journal des modifications

**EN** [English](CHANGELOG.md) · 🇫🇷 **Français**

Les changements notables de SC Telemetry Deck (plugin Stream Deck et appli web autonome pour Star Citizen).
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/) ; les notes complètes sont dans
[`docs/releases/`](docs/releases/) et sur la [page des versions GitHub](https://github.com/Sokren/sc-telemetry-deck/releases).

> **Bêta** — l'API de télémétrie du jeu est récente, non documentée par CIG et peut changer à chaque patch.
> 4.10.3 (LIVE) = affichage seulement, 5.0 (PTU) = affichage + actions.

## [Non publié]

### Ajouté
- **Licence** : le projet est désormais distribué sous la **Mozilla Public License 2.0** (`LICENSE`) ; guide de contribution dans `CONTRIBUTING.fr.md`.
- **Onglet 🧭 Instrument de bord** : vue intégrée pour tablette (saut quantique en anneau, jauges à crans, fonctions, mission, performances), en plus des 10 vues ; le modèle du même nom (＋ Nouvelle vue) en fait une vue modifiable ; nouvel **habillage « Instrument de bord »** pour toutes les vues ; ouverture directe par le QR code / le lien `?view=instrument`.
- **Bouton ⛶ Plein écran** dans la barre du haut de l'appli web (tablette, téléphone Android, PC) ; caché là où le navigateur ne le permet pas (iPhone).
- **Nouveautés du jeu 5.0 PTU (build 13273298)**, affichées quand le jeu les envoie. Ce build n'ouvre pas encore l'API locale : rien n'a pu être vérifié en jeu.
  - Barre du haut : **état du jeu** (menu principal, chargement, en jeu) et **menu ouvert**.
  - Onglet **Vaisseau** : encart **Saut quantique** à côté de « Mon vaisseau » (destination, temps restant, distance, charge et calibrage).
  - Onglet **Personnage** : **pseudo**, **mode** (vol, combat, minage, récupération…), **lieu** et juridiction, **zone d'armistice**, **CrimeStat**, et une rubrique **Mission suivie** (objectif en cours, objectifs faits / total, temps restant).
  - Onglet **Debug** : rubrique **Performances** (FPS, temps CPU / rendu / GPU, mémoire vidéo, ping, perte de paquets, serveur, shard), numéro de trame et **trames perdues**.
  - **Ma vue** : encarts Saut quantique, Qui / où / mode, Mission suivie et Performances, et une case pour chaque valeur (menu **Ajouter** : onglets Personnage, Vaisseau et **Jeu**).
  - **Vue automatique selon le mode** du perso (minage → ta vue « Minage »…), prioritaire sur la position quand une vue est choisie.
  - Stream Deck : **Ship Display** affiche le saut quantique (temps restant et destination), la distance restante et le calibrage ; **Actor Display** affiche le mode, le lieu, le CrimeStat, la zone d'armistice, la mission, les FPS et le ping.
- Contrat d'API **1.12.0** : `GET /api/v1/game` ; `playerName`, `mode`, `location`, `place`, `jurisdiction`, `armistice`, `crimeStat`, `mission` dans `/api/v1/character` ; `quantum` dans `/api/v1/ship/status` ; `sequence` dans `/api/v1/debug` ; cases `quantum_card`, `who_card`, `mission_card`, `perf_card`, `game_info` et nouvelles valeurs de `character_info` / `ship_info` ; habillage `instrument` ; modèle `instrument_panel` ; `view=instrument` pour `/api/v1/lan/qr`.
- API : **jetons externes** pour les outils (VoiceAttack, overlay, bot…). Créés depuis le PC (`POST /api/v1/access/tokens`) avec un nom et un niveau : **Lecture** (état du jeu, événements), **Pilotage** (lecture + actions, fonctions du vaisseau, morse, sans les actions protégées) ou **Pilotage complet** (avec l'éjection, l'autodestruction et le déverrouillage du vaisseau). Acceptés seulement dans l'en-tête `Authorization`, depuis le PC sauf si l'option réseau local est cochée, et seulement sur les routes de leur niveau ; révocables ou renouvelables (nouveau jeton, l'ancien cesse aussitôt de marcher), stoppables 15 min, 1 h ou jusqu'à reprise (refusés avec la raison `stopped`, connexions ouvertes coupées), avec un journal des derniers appels. Le jeton de l'appli ne change pas. Contrat d'API **1.13.0**.
- Appli web : écran **⚙ Options → Accès externes** pour créer, modifier, renouveler, stopper et révoquer ces jetons, et voir leur journal en direct. Deux jetons ne peuvent pas avoir le même nom (majuscules ignorées). Indicateur **🔑 N appels** dans la barre du haut quand leurs journaux ont du nouveau (orange avec des erreurs). Le jeton n'est montré qu'une fois ; Pilotage complet est signalé en rouge, plus fort avec le réseau local.
- **Plugins** : l'appli web lance des **programmes séparés** posés dans le dossier `plugins` à côté de l'appli (Node, Python ou `.exe`), chacun avec son propre jeton éphémère (`sct_plg_…`, en mémoire seulement, PC seulement) au niveau accordé — Lecture, Pilotage ou Pilotage complet (toujours avec l'avertissement rouge) — et des droits sur les vues (lire, modifier celles choisies, créer les siennes, marquées du plugin). Un plugin nouveau ou modifié ne se lance jamais seul : **⚙ Options → Plugins** montre la commande exacte (lancée sans shell), les fichiers et leur empreinte avant l'activation. Un plugin Node ne lit que son propre dossier. Arrêter, relancer, désactiver, journal en direct (appels à l'API et sortie du programme), « En échec » après 3 erreurs en 1 minute, indicateur **🧩 N plugins** dans la barre du haut (vert, orange : erreurs non vues, rouge : un plugin en échec). Une vue créée par un plugin porte son nom et signale quand il est arrêté. Dans les journaux, seuls les refus et erreurs (400, 401, 403, 5xx) sont en rouge et comptent dans les alertes ; ils restent visibles même chassés par de nombreux appels normaux. Exemple dans `examples/plugins/`. API `/api/v1/plugins`.
- API : **`GET /api/v1/access/me`** — un outil ou un plugin apprend son type (externe, plugin…), son niveau et ses droits (`can`, une liste plate comme `read.game`, `actions.spaceship_power`, `actions.protected`, `views.edit`). Ouverte à tout jeton en marche, quel que soit son niveau ; les droits changés pendant qu'un plugin tourne s'y voient tout de suite. Testez les droits dans `can`, pas le nom du niveau, et ignorez les clés inconnues. Contrat d'API **1.14.0**.
- **Exemple VoiceAttack 2** (`examples/voiceattack/`) : plugin C# open source et profils d'exemple **français et anglais** (61 commandes, plus une sélection de 20 pour la démo de VoiceAttack) pour piloter le vaisseau à la voix avec un jeton externe **Pilotage** — ordres (« sors le train », phares, VTOL, saut quantique, modes, émotes…), réponses dites par VoiceAttack (« Train : sorti. », « Action protégée. », « Jeu injoignable. »), valeurs à la demande (carburant, boucliers, coque, santé, soif…) et **alertes** à seuil (boucliers, coque, carburant, oxygène, santé, soif, jeu perdu), une seule fois par passage sous le seuil. Guide FR / EN.

### Sécurité
- **Jeton admin et jeton mobile** : le jeton de l'appli devient le **jeton admin** et ne marche que sur le PC ; les tablettes et téléphones partagent un nouveau **jeton mobile**, donné par le QR code et le lien, avec les droits de la page mais sans les réglages (réseau local, jetons externes, plugins, mises à jour) : 403 `forbidden` / `pc_only`. **Nouveau jeton** ne remplace plus que le jeton mobile : le PC reste connecté. **Les tablettes et téléphones déjà connectés doivent rescanner le QR code une fois** après la mise à jour ; un message le leur indique.
- L'appli refuse les requêtes dont l'en-tête `Host` n'est ni `localhost` ni une adresse IP (403 `bad_host`) : une page web ne peut plus l'atteindre en faisant pointer son nom de domaine vers ce PC (rebinding DNS).
- Le flux d'événements n'envoie plus les vues aux jetons externes, et seulement les vues permises à un plugin.

### Modifié
- Vérification de version : seules les **versions principales** sont proposées (`x.y.z`). Préversions, bêtas et versions candidates sont ignorées, même si elles ne sont pas marquées « pre-release » sur GitHub, et une bêta n'est jamais comptée comme plus récente que la version du même numéro.
- `GET /api/v1/game` (état du jeu et performances) est accessible aux jetons **Lecture**.
- Journal des jetons : **toutes les actions dangereuses** sont marquées « action sensible » (⚠), même au niveau Pilotage — sortie d'urgence, coupure de l'alimentation, ouverture des portes, en plus de l'éjection, de l'autodestruction et du déverrouillage. Les 50 dernières restent visibles même chassées par de nombreux appels ordinaires, à part des erreurs.
- Fenêtre **Plugins** : quand un plugin demande Pilotage complet, **Pilotage** est coché par défaut ; Pilotage complet ⚠ reste à choisir soi-même.
- Schéma du jeu mis à jour : 5.0 PTU build 13273298 (5.0.202.35026).

## [0.3.15] — 2026-11-24

### Ajouté
- Appli web : **modèles de vues**. **＋** propose *Vierge* ou **Xeneon Edge – pilote** (poste de pilotage pour écran tactile large 2560×720) ; la vue créée se modifie comme les autres. Fichiers à importer dans `docs/vues/` (`npm run templates:export` les régénère).
- Appli web : sections en **tiers** de largeur (**−** / **+** : tiers ↔ demie ↔ pleine) et **sections hautes** (↕, sur deux lignes : deux sections peuvent s'empiler à côté), pour les écrans larges.
- Appli web : habillage **Cockpit** (boutons centrés à coins coupés, allumés en bleu ; jauges sur une ligne). L'autodestruction et l'éjection sont toujours en rouge.
- Appli web : nouveaux styles de case — **règle de cap** (cap), **interrupteur** (fonctions du vaisseau), **glisser** ou **maintenir** pour confirmer une action — et voyant **BOOST** (`ship_info` / `boost`).
- Appli web : **placement libre** — une case glissée se pose dans la colonne où on la lâche ; les emplacements d'avant restent vides (pour centrer un bouton, laisser un trou…). Sur téléphone, les cases se suivent.
- Appli web : style **Ligne** pour toutes les valeurs (nom à gauche, valeur à droite, hauteur d'une barre), par ex. leurres et bruit.
- Appli web : cases d'**1 emplacement sur 16** (toutes sauf voyants et *Mon vaisseau*). La largeur se règle avec **−** et **+**, le nombre d'emplacements pris entre les deux (1, 2, 4, 6, 8…).

### Corrigé
- Appli web : appui maintenu (éjection) — la progression ne s'animait pas (anneau de la grille, case qui se remplit dans une vue).
- Appli web : fenêtre **Tablette / téléphone** — le QR code restait parfois une image cassée après avoir activé l'accès réseau (ou changé de carte réseau) depuis la fenêtre ; il s'affiche maintenant tout de suite, et un échec de chargement est réessayé.
- Contrat d'API **1.11.0** : `GET /api/v1/views/templates`, `POST /api/v1/views` avec `template`, largeur `third`, taille `0.25`, section `tall`, habillage `cockpit`, styles `tape` / `switch` / `slide` / `hold`, colonne `col`, style `line`, `words` (mots des deux états) sur les fonctions du vaisseau.

## [0.3.14] — 2026-11-24

### ⚠ Changement incompatible
- **Ship Toggle est fusionné dans Ship Action** et n'apparaît plus dans la liste des actions du Stream Deck. **Rien à refaire** : les touches Ship Toggle déjà posées continuent de marcher. Leurs réglages (fonction, mode, style, alerte rouge) sont convertis automatiquement en Ship Action la première fois qu'elles s'affichent, et elles ouvrent maintenant le panneau de Ship Action. Pour une nouvelle touche avec état, prendre **Ship Action** et choisir la fonction (train, phares, VTOL…).
- **Les touches Ship Action d'une fonction avec état changent d'apparence** : elles affichent l'état réel au lieu d'une icône fixe. Pour retrouver l'ancien rendu : *Image* → **Sans état (icône fixe)**.
- **Un appui sur Ship Action tient compte de l'état** : « Allumer » sur une fonction déjà allumée n'envoie plus rien (✔). Hors du vaisseau, ou si l'état est inconnu, la commande est envoyée comme avant.

### Ajouté
- Ship Action : **état sur la touche** pour le train, les phares, le VTOL, le découplage, le G-safe, la croisière, l'ESP, le HUD avancé, la vision nocturne, le mode NAV / SCM, la puissance, les portes et les verrous. Styles A Texte, B Voyant et C Fond coloré, et alerte rouge quand les portes ou les verrous sont ouverts.
- Ship Action : **le pictogramme change selon l'état** (phares avec halo, œil ouvert ou fermé, cadenas ouvert ou fermé, porte entrouverte, bouclier plein ou en pointillé…), avec un petit « pop » au changement et une animation pendant un mouvement (le VTOL pivote, les autres clignotent en orange). Le train garde son icône.
- Ship Action : l'**ESP** et la **croisière** (affichage seul : le jeu n'a pas de commande) sont dans la liste.

### Corrigé
- **Le titre saisi dans le Stream Deck s'affiche** sur Ship Action (fonction avec état), Actor Display et Ship Display, molettes comprises. Il remplace le nom par défaut (« Santé », « Train »…) ; titre vide = nom par défaut. Si l'option « Afficher le titre » est cochée, seul le titre du Stream Deck s'affiche (pas de doublon).

## [0.3.13] — 2026-11-23

### Ajouté
- **Appli web portable** `sc-telemetry-web-<version>-portable.zip` (`npm run build:portable`) : la même appli lancée avec le `node.exe` officiel, signé, pour les PC où **Windows Smart App Control** bloque l'exe non signé. Le `README.txt` du zip (EN / FR) explique comment débloquer le zip ou le `.cmd` si Windows bloque encore.
- Appli web : **personnaliser une vue** (cadenas ouvert). **Habillage** de la vue *Standard* ou *HUD vaisseau* (cadres d'écran de bord, chiffres à chasse fixe, aux couleurs du thème). Bouton **⚙** sur chaque case : **nom affiché** au choix (toute langue, emojis ; l'API et le Stream Deck gardent les noms du jeu) et **style** des jauges — carte, anneau, arc, barre, barre verticale, segments, segments verticaux ou chiffre en gros. Pour le solde, **échelle** au choix : auto (15,0 M), milliers (15 021 k), millions (15,02 M) ou tous les chiffres.
- Appli web : **largeur des cases en emplacements** (1, 2, 3, 4, 6 ou 8 ; 8 par ligne en pleine largeur, 4 en demi-section ou sur téléphone), bouton « 2 → 3 » comme celui des sections. Les vues existantes gardent leur disposition.
- Appli web : **format des nombres** par appareil dans ⚙ Options (selon la langue, 1 234,5 ou 1,234.5), indépendant de la langue de la page.
- Contrat d'API **1.10.0** : `look` sur une vue ; `label`, `display` (`style`, `length`) et largeurs 0.5 à 4 (`size`) sur une case ; `amount` (montant brut) sur le solde.

### Modifié
- **Pourcentages tronqués comme dans le jeu** (98,87 % → 98 %, au lieu de 99), sur les touches Stream Deck comme dans l'appli web.
- Appli web : la **langue** se choisit avec un bouton par langue (Français / English) dans ⚙ Options.
- Appli web : en édition, les boutons d'une case forment une barre au-dessus du contenu au lieu de le recouvrir.

### Corrigé
- Contrat d'API : les textes disaient encore que les actions dangereuses étaient refusées (faux depuis la 0.3.9) ; le code de refus `dangerous_action`, jamais renvoyé, est retiré.

## [0.3.12] — 2026-11-23

### Ajouté
- Appli web : **exporter / importer une vue** (cadenas ouvert, **⇪ Exporter** / **📥 Importer**) — une vue ou toutes tes vues, en fichier `.json` daté (sauvegarde) ou en **code à copier-coller** `SCTD1:…` (Discord, Reddit…). Avant l'import, un aperçu indique la version qui a exporté et liste les cases que ta version ne sait pas lire (laissées de côté, le reste est importé) ; les vues importées s'ajoutent aux tiennes (10 au plus), rien n'est remplacé. Contrat d'API **1.9.0** : `GET /api/v1/views/export` (`?id=`, `&as=code`), `POST /api/v1/views/import` (`?dry_run=1` pour l'aperçu).

### Modifié
- READMEs à jour des versions 0.3.8 à 0.3.11 (actions sensibles, Prêt au vol, appli web sous Linux avec Wine…).

## [0.3.11] — 2026-11-23

### Ajouté
- Appli web, onglet **Vaisseau** : un gros bouton **✈ Prêt au vol** (`v_flightready`, simple commande — le jeu n'envoie pas d'état « prêt ») et un **résumé du perso** sur une ligne au-dessus de l'encart du vaisseau — santé, faim, soif, oxygène (couleur selon le niveau) et une note sur l'air respirable ; masquable avec ✕ ou dans ⚙ Options (par appareil).
- Appli web, onglet **Personnage** : une rangée **Actions** — carte stellaire, essuyer la visière, mobiGlas, torche.
- Appli web, onglet 🐞 **Debug** : journal des **actions envoyées** (200 dernières : heure, action, origine, position du perso, réponse du jeu, temps de réponse), *Erreurs seulement* / *Copier* / *Vider*, ajouté à l'enregistrement. Un bouton qui affiche ⚠ explique pourquoi au survol. Contrat d'API **1.8.0** : `actions` dans `GET /api/v1/debug` et dans l'enregistrement, `DELETE /api/v1/debug/actions`.
- Appli web : **vérification de version** — au démarrage puis chaque jour (désactivable dans ⚙ Options → *Mises à jour*), l'appli lit la dernière version publiée sur GitHub ; si elle est plus récente, un badge **⬆ x.y.z disponible** et **Ouvrir GitHub ↗**. Rien n'est téléchargé automatiquement, aucune donnée envoyée. API : `GET` / `PUT /api/v1/update`, `POST /api/v1/update/check`.

### Modifié
- Appli web : plus aucune mention du Stream Deck dans la page et la doc de l'API (l'appli est autonome) ; la description de l'appui sur une tuile ne dit plus que les actions dangereuses ne sont jamais envoyées.

## [0.3.10] — 2026-11-23

### Ajouté
- Appli web : **🐞 Mode debug** (⚙ Options → *Avancé*, par appareil) — un onglet **Debug** avec tout ce que le jeu envoie, brut et en lecture seule : sections avec leur âge ou **Tout** d'un coup, arbre complet avec en gris les champs du schéma que le jeu n'envoie pas, filtrer, figer, copier le JSON / un chemin, derniers événements, trames par seconde, et **⏺ Enregistrer** pour télécharger chaque trame brute en `.json` (jusqu'à 10 000 trames) pour un rapport de bug. Contrat d'API **1.7.0** : `GET /api/v1/debug`, `POST` / `DELETE /api/v1/debug/recording`.

## [0.3.9] — 2026-11-22

### Modifié
- **Actions sensibles sur les touches et dans l'appli web** : ouvrir / déverrouiller portes et sas, autodestruction, sortie d'urgence et coupure de la puissance générale sont maintenant proposées et envoyées en **un appui** (toujours refusées à l'IA). L'**éjection** demande de **rester appuyé 1,5 s** — un anneau rouge se remplit avec le temps restant, relâcher avant annule (touche Ship Action, tuile de la grille, case des vues).
- **Ship Toggle** : portes (fermer / ouvrir), verrous (verrouiller / déverrouiller) et puissance générale (allumer / couper) marchent dans les deux sens.
- **Alerte rouge seulement en état dangereux** (portes ouvertes, verrous ouverts) : contour rouge, ⚠, mot d'état en rouge — rien quand c'est fermé / verrouillé. Désactivable par touche sur Stream Deck (case *Alerte*) ou pour toute l'appli web dans ⚙ Options (par appareil). API : `danger: true` sur les fonctions vaisseau en état dangereux, `hold: true` sur les tuiles de la grille à maintenir. Contrat d'API **1.6.0** (avec aussi la fonction `cruise` et `readOnly`).

### Ajouté
- **Croisière** (Alt+C) en fonction vaisseau, **en lecture seule** : ON / OFF sur Ship Toggle, dans l'onglet *Vaisseau* et les vues de l'appli web (contour en pointillés, un appui ne fait rien — le jeu n'a aucune commande pour elle). API : fonction `cruise`, `readOnly: true` sur les fonctions que le jeu ne permet pas de commander. Vérifié en jeu sur le Lightning F8C. La valeur du limiteur de vitesse (molette) et les ailes du Corsair ne sont pas envoyées par le jeu, donc pas affichées.
- Appli web : bouton **❓ Activer la télémétrie**, affiché tant que le jeu n'envoie rien (aussi dans *À propos*) : tuto pas à pas pour Star Citizen 5.0 (créer `user.cfg` dans le dossier du canal de jeu, ajouter `server.game.telemetry.enabled=1`, lancer le jeu, vérifier `Game.log`) et la commande pour la 4.10.3 LIVE, avec des boutons *Copier*. L'appli ne touche toujours à aucun fichier du jeu.
- Appli web : **thèmes de couleurs** — Actuel, Cockpit vert, Ambre, Bleu nuit et Clair (jour), plus une couleur d'accent au choix, retenus par appareil (ta tablette peut être différente de ton PC). Les couleurs OK / attention / danger restent lisibles dans chaque thème.
- Appli web : fenêtre **⚙ Options** qui regroupe apparence, langue, vue automatique, accès tablette / téléphone et aide (activer la télémétrie, À propos, API) ; la barre du haut ne garde que l'état du jeu, le cadenas des vues et ⚙ Options.

### Limite connue
- 5.0 PTU : le jeu n'envoie pas encore l'état des portes et refuse les commandes portes / verrous / sas via l'API (les touches du jeu marchent ; testé sur l'Avenger Titan et le Corsair). *Portes* et *Verrous* affichent « — » jusqu'à ce que CIG les branche.

### Corrigé
- Appli web : sur téléphone, les boutons du haut débordaient de l'écran ; ils passent maintenant à la ligne.

## [0.3.8] — 2026-11-22

### Ajouté
- **Morse Code** (Stream Deck) et API de l'appli web : morse avec les **phares du vaisseau** en plus de la torche (réglage *Lumière*, `light: "ship_lights"` dans `POST /api/v1/morse`, contrat **1.4.0**) ; les phares sont allumés / éteints explicitement et laissés éteints à la fin. Les touches existantes gardent la torche.
- Appli web : **morse dans tes vues** — case *Message morse* (texte enregistré, torche ou phares, durée d'un point, répétitions, réglés avec ✏️ ; allumée pendant l'envoi) et case *Morse libre* (tape un message sur le moment, torche ⇄ phares ; le dernier texte est gardé sur l'appareil). Un appui sur une case morse pendant un envoi l'arrête. API des vues : `settings` sur les cases `morse` / `morse_free`, `morse` dans l'événement `state` (contrat **1.5.0**).
- **Lettre en cours** pendant un envoi morse : la lettre et son code (signe allumé en surbrillance, `␣` entre deux mots, tour en cours si répété) s'affichent sur la touche **Morse Code** du Stream Deck, dans les cases morse des vues et sur la tuile morse de la grille. API : `morse.progress` dans l'événement `state`.

### Modifié
- Dépôt GitHub renommé **Sokren/sc-telemetry-deck** (les anciens liens redirigent) ; liens mis à jour.

## [0.3.7] — 2026-11-21

### Ajouté
- **Ship Display** : **vaisseau** (constructeur, modèle, en vol / posé), **boucliers** et **coque** (les boucliers se vident en mode NAV), **vitesse**, **vitesse verticale** (signée), **altitude radar**, **G subis** et **réserve de boost** (« Boost ▲ » quand il est engagé, rouge si critique), **hydrogène** — vérifié en vol sur l'Arrow et le Lightning F8C.
- Appli web : encart **Mon vaisseau** (modèle, constructeur, état, mode, rôle, siège lisible — ex. « Copilote » — avec le nom technique du siège en info, boost, instruments principaux) en tête de l'onglet *Vaisseau* et dans le menu *Ajouter* des vues ; instruments **Vitesse verticale**, **Accélération (G)** et **Boost** ; modèle du vaisseau dans l'API (`shipStatus.model`, `boostEngaged`) ; contrat d'API **1.3.0** (ajouts seulement, couvre aussi les instruments ajoutés en 0.3.5–0.3.6).

### Corrigé
- Appli web : l'altitude radar affichait la valeur « hors de portée » du jeu (3,4e38) au lieu de « — ».
- Appli web : la coque affichait 0 % en rouge quand le jeu ne l'envoie pas ; maintenant « — ».

## [0.3.6] — 2026-11-21

### Ajouté
- **Ship Display** : **armes prêtes à tirer** (« 1 / 2 », jauge colorée), **groupe d'armes actif** (« Toutes » pour le groupe 0, puis 1, 2… comme en jeu) et **cardans** (fixes / libres). Affichage seulement.
- Appli web : instruments **Armes prêtes**, **Groupe d'armes** et **Cardans** (onglet Vaisseau, API, vues).
- Appli web : **🔁 Auto** — changement de vue automatique par appareil : onglet ou vue à pied / assis / EVA (par défaut : à pied → *Personnage*, assis → *Vaisseau*), après 2 s dans la même position, jamais pendant l'édition ; un onglet changé à la main est gardé jusqu'au prochain changement de position.

## [0.3.5] — 2026-11-21

### Ajouté
- **Ship Display** (Stream Deck) : les **contre-mesures** du vaisseau en direct — leurres et brouilleurs ensemble (« 45 / 3 ») ou l'un des deux — sur une touche (valeur + jauge colorée) ou une molette de Stream Deck +. 100 % = le plus grand stock vu pour ce modèle de vaisseau pendant qu'un afficheur est visible (le jeu n'envoie pas le maximum). Affichage seulement : le jeu n'expose aucune commande pour lancer des contre-mesures.
- Appli web : instruments **Leurres** et **Brouilleurs** dans l'onglet *Vaisseau*, l'API et le menu *Ajouter* des vues.

## [0.3.4] — 2026-11-21

Appli web seulement (plugin Stream Deck inchangé depuis la 0.3.2).

### Ajouté
- **Tes vues** : compose tes propres onglets (le premier : *Ma vue* ; **＋** en ajoute, jusqu'à 10) avec des sections
  nommées (demi ou pleine largeur) et des cases choisies dans un menu **Ajouter** : constantes, instruments, voyants,
  fonctions du vaisseau, actions, émotes. Glisser-déposer (souris ou doigt), tailles 1× / 2×, cadenas pour modifier /
  renommer / supprimer. Enregistrées dans l'appli (`view.json`) et gardées au redémarrage ; chaque vue est enregistrée
  séparément, deux écrans peuvent donc modifier deux vues en même temps.
- Lien `?view=<id>` pour ouvrir une vue ; sur téléphone, les onglets deviennent une liste.
- **Accès tablette / téléphone** (📱, PC seulement) : interrupteur réseau local (désactivé par défaut), **QR code** et
  adresse complète masqués à chaque ouverture (aucune IP à l'écran), *Copier le lien*, *Ouvrir sur [vue]*,
  *Nouveau jeton*, nombre d'appareils connectés sans adresse, choix de la carte réseau (cartes virtuelles écartées).
  Option avancée : écouter sur toutes les interfaces (0.0.0.0), avec avertissement et confirmation.
- Fenêtre **À propos** : version de l'appli, version du jeu vérifiée, actions disponibles ou non, liens GitHub.
- Contrat d'API 1.2.0 : `/api/v1/views`, `/api/v1/lan`, `/api/v1/lan/token`, `/api/v1/lan/qr`, événement `views`.

### Tiers
- QR codes faits avec [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), intégré à l'exe.

## [0.3.3] — 2026-11-21

### Ajouté
- Appli web : **les 34 émotes du joueur** dans l'onglet *Personnage*, lues en direct dans le jeu, ✔ / ⚠ à l'appui.
- Appli web : **version de l'appli** à côté du titre (au survol : version du jeu du schéma embarqué).

### Documentation
- Mise en place **Star Citizen 4.10.3 (LIVE)** : `setx GRPC_CLIENT_SERVER_ENABLED true` (affichage seulement ; les
  actions demandent la 5.0).
- Encart bêta et limites par version dans le README.

### Jeu
- Schéma vérifié sur le build 5.0 PTU 13248297 (5.0.202.10025) : inchangé (112 actions).

## [0.3.2] — 2026-11-21

### Ajouté
- Détection des versions du jeu sans commandes d'actions (ex. 4.10), uniquement par l'API du jeu : les touches
  Stream Deck affichent ⚠ avec un message clair dans le journal, l'appli web affiche un bandeau, les affichages
  continuent de marcher.
- API : champ `actions` (`available` / `unsupported` / `unknown`) dans `GET /api/v1/status` et l'événement `status`
  (contrat 1.1.0, ajout seulement).

## [0.3.1] — 2026-11-21

### Ajouté
- **`sc-telemetry-web.exe`** : l'appli web en un seul exécutable — pas besoin de Node.js, la page s'ouvre au double-clic.
- Un `sc_extrait.desc` / `actions.json` à jour posé à côté de l'exe remplace ceux embarqués (après un patch).

### Note
- L'exe n'est pas signé : Windows SmartScreen peut avertir la première fois (*Informations complémentaires →
  Exécuter quand même*).

## [0.3.0] — 2026-11-21

### Ajouté — Stream Deck
- **Ship Toggle** : 17 fonctions du vaisseau avec leur état en direct (train, phares, VTOL, transformation, découplage,
  G-safe, assistance de proximité, ESP, HUD avancé, vision nocturne, NAV/SCM, puissance moteurs / armes / boucliers,
  puissance générale, portes) ; bascule / allumer seulement / éteindre seulement ; trois styles (texte, voyant, fond coloré).
- **Ship Action** : toutes les commandes du vaisseau et du siège ; les variantes on / off / bascule regroupées en une
  ligne avec un réglage de mode (touches existantes converties automatiquement).
- Les actions dangereuses (autodestruction, éjection, coupure d'alimentation, ouverture / déverrouillage des portes) ne
  sont jamais proposées ni envoyées.

### Ajouté — appli web (aperçu)
- Grille de boutons, onglet *Personnage* (position, rôle, 13 constantes) et onglet *Vaisseau* (instruments, voyants,
  fonctions cliquables), en direct, en français et en anglais.
- API publique documentée (OpenAPI / Swagger sur `/api/docs`), jeton obligatoire, ce PC seulement.

## [0.2.0] — 2026-11-21

### Ajouté
- **Actor Display** : une constante du personnage sur une touche (valeur + jauge colorée) ou sur une **molette du
  Stream Deck +** (tourner pour changer de valeur) : santé, oxygène, faim, soif, températures, rythme cardiaque,
  gravité, pression, radiations, intoxication, air respirable, équilibre. « — » quand le jeu est fermé ou que le
  personnage n'est pas encore apparu.
- Un seul flux de télémétrie partagé, ouvert seulement quand un affichage est visible.

## [0.1.0] — 2026-11-20

Première version.

### Ajouté
- **Actor Action** : actions du perso (mobiGlas, torche, carte stellaire, visière) et les 34 émotes,
  dans une liste groupée.
- **Morse Code** : fait clignoter la torche en morse (texte, durée d'un point, répétitions).

### Problèmes connus
- En 5.0 PTU, le jeu accepte l'action `mobiglas` mais n'ouvre pas le mobiGlas.

[0.3.15]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.15
[0.3.14]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.14
[0.3.13]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.13
[0.3.12]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.12
[0.3.11]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.11
[0.3.10]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.10
[0.3.9]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.9
[0.3.8]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.8
[0.3.7]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.7
[0.3.6]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.6
[0.3.5]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.5
[0.3.4]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.4
[0.3.3]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.3
[0.3.2]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.2
[0.3.1]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.1
[0.3.0]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.3.0
[0.2.0]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.2.0
[0.1.0]: https://github.com/Sokren/sc-telemetry-deck/releases/tag/v0.1.0
