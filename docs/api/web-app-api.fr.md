# API de l'appli web SC Telemetry Deck

🇫🇷 Français · **EN** [English](web-app-api.md) · API du jeu : [game-telemetry-api.fr.md](game-telemetry-api.fr.md)

L'appli web SC Telemetry Deck expose une API REST en HTTP.
Elle lit l'état du jeu et déclenche les actions à ta place : les autres logiciels n'ont besoin ni de gRPC ni du schéma du jeu (overlays de stream, bots, tableaux de bord, domotique).
Cette page est un résumé.
Le contrat complet est le fichier OpenAPI servi par l'appli.

| Propriété | Valeur |
|---|---|
| URL de base | `http://127.0.0.1:8743` |
| Contrat | OpenAPI 3, version **1.13.0** (lot non publié, pour la 0.4.0) |
| Fichier du contrat | `GET /api/v1/openapi.json` (sans jeton) |
| Doc interactive | Swagger UI sur `http://127.0.0.1:8743/api/docs` |
| Format | JSON, UTF-8 |
| Temps réel | Server-Sent Events (SSE) sur `/api/v1/events` |

## Prérequis

- L'appli web tourne (`sc-telemetry-web.exe`, le zip portable ou `npm run start:web`).
- Pour les données du jeu : Star Citizen tourne avec l'API locale activée, et ton personnage est apparu. Voir [l'API du jeu](game-telemetry-api.fr.md#activer-lapi).

## Authentification

Tous les points d'accès sauf `/api/v1/openapi.json` demandent le jeton d'accès.

- Envoie-le dans un en-tête : `Authorization: Bearer <JETON>`.
- L'appli l'enregistre dans `%APPDATA%\SC Telemetry Deck\settings.json`.
- Les navigateurs ne peuvent pas ajouter d'en-tête à un `EventSource` ni à un lien : passe alors le jeton en `?t=<JETON>`.
- **Nouveau jeton**, dans ⚙ Options → Tablette / téléphone, remplace le jeton. Les autres appareils doivent alors rescanner le QR code.

Une requête sans jeton valide reçoit `401`.

## Accès réseau

Par défaut, l'appli n'écoute que sur ce PC (`127.0.0.1`).

- ⚙ Options → Tablette / téléphone → **Autoriser l'accès depuis le réseau local** ajoute une carte réseau du PC.
- La connexion n'est pas chiffrée et le lien de la tablette contient le jeton. Utilise-le seulement sur ton réseau à la maison.
- Les points d'accès `/api/v1/lan` ne répondent qu'au PC lui-même. Les autres appareils reçoivent `403`.

## Erreurs

Les erreurs renvoient un corps JSON :

```json
{ "error": "not_found" }
```

| Code | Sens |
|---|---|
| `400` | Corps ou paramètre invalide |
| `401` | Jeton absent ou faux |
| `403` | Permis depuis le PC seulement (`/api/v1/lan`) |
| `404` | Nom ou identifiant inconnu |
| `409` | Impossible maintenant (par exemple le vaisseau n'a pas la fonction, ou il y a déjà 10 vues) |
| `422` | Rien à émettre (message morse vide) |
| `502` | Le jeu a refusé l'action ou est injoignable |

## Points d'accès

### État et jeu

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/status` | Version de l'appli, télémétrie (`live` ou `no_data`), personnage (`spawned` ou `unknown`), version du schéma |
| `GET` | `/api/v1/game` | État du jeu (`front_end`, `loading`, `in_game`), menu ouvert, performances (FPS, GPU, mémoire vidéo, ping, shard) |
| `GET` | `/api/v1/openapi.json` | Ce contrat (public) |

### Personnage

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/character` | Position, rôle d'équipage, mode, lieu, zone d'armistice, CrimeStat, mission suivie |
| `GET` | `/api/v1/vitals` | Toutes les constantes avec texte, unité, niveau (`ok`, `warn`, `bad`) et pourcentage |
| `GET` | `/api/v1/vitals/{id}` | Une constante (`health`, `oxygen`, `hunger`, `thirst`, `body_temperature`…) |

### Vaisseau

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/ship/status` | Fiche du vaisseau, instruments, voyants, saut quantique |
| `GET` | `/api/v1/ship/functions` | Les 18 fonctions vaisseau et leur état |
| `GET` | `/api/v1/ship/functions/{id}` | Une fonction (`gear`, `lights`, `vtol`, `decoupled`, `master_nav`, `power_engines`…) |
| `POST` | `/api/v1/ship/functions/{id}/press` | Appuyer sur une fonction. Corps : `{"mode": "toggle" \| "on" \| "off"}` |

`press` lit d'abord l'état :

- `toggle` envoie la commande opposée à l'état lu.
- `on` et `off` n'envoient rien si la fonction est déjà dans cet état (`decision: "noop"`).
- `409` si le vaisseau n'a pas la fonction (`code: "unavailable"`) ou si aucune commande ne convient à l'état lu (`code: "no_command"` : état inconnu sans bascule, croisière en lecture seule).
- Puissance générale, portes et verrous marchent dans les deux sens : couper, ouvrir et déverrouiller sont envoyés.

### Actions

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/actions` | Actions acceptées par le jeu, groupées par catégorie, avec leurs libellés |
| `POST` | `/api/v1/actions/{name}/trigger` | Déclencher une action par son nom (`v_lights_on`, `emote_wave`…) |

### Morse

| Méthode | Chemin | Rôle |
|---|---|---|
| `POST` | `/api/v1/morse` | Émettre un message en morse avec la torche ou les phares (`202`, `409` si un message est déjà en cours) |
| `DELETE` | `/api/v1/morse` | Arrêter le message |

### Grille et vues

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/layout` | Grille de boutons de la page |
| `POST` | `/api/v1/layout/tiles/{index}/press` | Appuyer sur une tuile |
| `GET` | `/api/v1/views` | Lister les vues (10 au plus) |
| `POST` | `/api/v1/views` | Créer une vue, vide ou depuis un modèle (`{"template": "instrument_panel", "name": "…"}`) |
| `GET` | `/api/v1/views/templates` | Modèles de vues (`xeneon_pilot`, `instrument_panel`), `?lang=fr` ou `en` |
| `PUT` | `/api/v1/views/{id}` | Enregistrer une vue |
| `DELETE` | `/api/v1/views/{id}` | Supprimer une vue |
| `GET` | `/api/v1/views/export` | Exporter une vue (`?id=`) ou toutes, en JSON ou en code `SCTD1:` (`&as=code`) |
| `POST` | `/api/v1/views/import` | Importer des vues (`?dry_run=1` pour l'aperçu) |

### Accès tablette et téléphone

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/lan` | Réglages de l'accès réseau |
| `PUT` | `/api/v1/lan` | Activer ou couper l'accès réseau |
| `POST` | `/api/v1/lan/token` | Nouveau jeton d'accès |
| `GET` | `/api/v1/lan/qr` | QR code du lien tablette ; `?view=` choisit la vue ouverte (`instrument` pour l'onglet Instrument de bord) |

### Debug et mises à jour

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET` | `/api/v1/telemetry/{section}` | Une section brute du flux (`vehicle`, `actor`, `weapons`, `game`…) |
| `GET` | `/api/v1/debug` | Tout ce que le jeu envoie, fusionné avec le schéma, plus le journal des actions |
| `POST` | `/api/v1/debug/recording` | Démarrer l'enregistrement des trames brutes (10 000 au plus) |
| `DELETE` | `/api/v1/debug/recording` | Arrêter et télécharger l'enregistrement |
| `DELETE` | `/api/v1/debug/actions` | Vider le journal des actions |
| `GET` | `/api/v1/update` | État de la vérification de version |
| `PUT` | `/api/v1/update` | Activer ou couper la vérification quotidienne |
| `POST` | `/api/v1/update/check` | Vérifier maintenant |

## Exemples

Les résultats ci-dessous viennent d'un jeu de test. Les valeurs changent avec ta partie.
Remplace `<JETON>` par ton jeton.

### Lire l'état

```bash
curl -H "Authorization: Bearer <JETON>" http://127.0.0.1:8743/api/v1/status
```

```json
{"app":"sc-telemetry-web","version":"0.3.15","telemetry":"live","character":"spawned","schema":"5.0.202.22326 PTU (build 13260598)","actions":"available"}
```

### Lire le train d'atterrissage

```bash
curl -H "Authorization: Bearer <JETON>" http://127.0.0.1:8743/api/v1/ship/functions/gear
```

```json
{"id":"gear","name":"Landing gear","label":"Gear","state":"on","word":"DOWN","words":{"on":"DOWN","off":"UP"}}
```

`state` vaut `on`, `off`, `moving-on`, `moving-off`, `unavailable` (le vaisseau n'a pas la fonction) ou `unknown` (pas de donnée fiable).

### Allumer les phares

```bash
curl -X POST -H "Authorization: Bearer <JETON>" -H "Content-Type: application/json" -d "{\"mode\": \"on\"}" http://127.0.0.1:8743/api/v1/ship/functions/lights/press
```

```json
{"decision":"sent","action":"v_lights_on","ok":true}
```

### Déclencher une action

```bash
curl -X POST -H "Authorization: Bearer <JETON>" http://127.0.0.1:8743/api/v1/actions/emote_wave/trigger
```

```json
{"ok":true}
```

### Lire les performances du jeu

```bash
curl -H "Authorization: Bearer <JETON>" http://127.0.0.1:8743/api/v1/game
```

```json
{"available":true,"state":"in_game","label":"In game","menuOpen":false,"mode":"SC_Default","perf":{"fps":51.9,"frameMs":17.2,"gpuMs":12.3,"vramUsedMb":9600,"vramBudgetMb":11468,"pingMs":38,"serverFps":22,"shard":"EUW-01 #034"}}
```

L'objet `perf` est raccourci ici.

## Événements en temps réel

`GET /api/v1/events` garde la connexion ouverte et envoie des Server-Sent Events.
Utilise-le plutôt que d'interroger l'API en boucle.

```bash
curl -N "http://127.0.0.1:8743/api/v1/events?t=<JETON>"
```

```text
event: status
data: {"app":"sc-telemetry-web","version":"0.3.15","telemetry":"live","character":"spawned","schema":"5.0.202.22326 PTU (build 13260598)","actions":"available"}

event: views
data: {"views":[…]}
```

| Événement | Quand | Contenu |
|---|---|---|
| `status` | À la connexion, puis à chaque changement | Même objet que `GET /api/v1/status` |
| `state` | Quand une valeur change, 4 fois par seconde au plus | `vitals`, `ship`, `character`, `shipStatus`, `morse` |
| `tile` | Quand l'image d'une tuile change | `{index, image, hold?}` |
| `feedback` | Après l'appui sur une tuile | `{index, feedback, detail?}` |
| `views` | À la connexion, puis à chaque création, enregistrement ou suppression d'une vue | Même objet que `GET /api/v1/views` |

Le serveur envoie un commentaire `: ping` toutes les 15 secondes.

Dans un navigateur :

```js
const events = new EventSource("http://127.0.0.1:8743/api/v1/events?t=<JETON>");
events.addEventListener("state", (e) => console.log(JSON.parse(e.data).vitals));
```

## Actions sensibles

L'API envoie les actions sensibles comme les autres, sans confirmation : autodestruction, éjection, sortie d'urgence, coupure de la puissance générale, ouverture ou déverrouillage des portes.
Vérifie le nom de l'action avant de l'appeler.

## Versions

- Le contrat suit le versionnage sémantique. Une version mineure ajoute des champs ou des points d'accès et n'en retire aucun.
- Lis `info.version` dans `/api/v1/openapi.json` pour savoir quel contrat l'appli sert.
- Les changements sont listés dans les [notes de version](../../CHANGELOG.fr.md).
