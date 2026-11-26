# API de télémétrie locale de Star Citizen (observée)

🇫🇷 Français · **EN** [English](game-telemetry-api.md) · API de l'appli web : [web-app-api.fr.md](web-app-api.fr.md)

Cette page décrit l'API de télémétrie locale du client Star Citizen, telle que SC Telemetry Deck l'a observée.
Cloud Imperium Games (CIG) ne la documente pas.
Tout vient du schéma embarqué dans `StarCitizen.exe`, du journal du jeu et de tests en jeu.
Chaque patch peut la changer.

## État selon la version du jeu

| Build du jeu | Version | API locale | Notes |
|---|---|---|---|
| 13238477 | 5.0 PTU | Fonctionne | Premier schéma 5.0 extrait (20/11/2026) |
| 13248297 | 5.0.202.10025 PTU | Fonctionne | Même schéma, 112 actions |
| 13260598 | 5.0.202.22326 PTU | Fonctionne | Même schéma, 112 actions |
| 13273298 | 5.0.202.35026 PTU | **Pas démarrée** | Schéma enrichi (56 nouveaux champs), port `2942` fermé |
| 13284307 | 5.0.202.46035 PTU | **Pas démarrée** | Schéma identique à 13273298, port `2942` fermé |

Sur les builds 13273298 et 13284307, le jeu lit les réglages et démarre le composant de télémétrie du joueur, mais n'enregistre pas le service gRPC.
Rien n'écoute sur `127.0.0.1:2942`.

## Activer l'API

L'API est coupée par défaut.
Ajoute ces lignes dans `user.cfg`, dans le dossier du canal du jeu, par exemple `StarCitizen\PTU\user.cfg` :

```ini
server.game.telemetry.enabled=1
server.game.telemetry.trigger.actions.enabled=1
```

La deuxième ligne existe depuis le build 13273298.
Les builds précédents acceptent les actions sans elle.

Vérifie `Game.log` après le lancement :

```text
[User CFG ] server.game.telemetry.enabled=true
[User CFG ] server.game.telemetry.trigger.actions.enabled=true
<Register Service> Service 'sc.game.telemetry.v1.GameTelemetryService' registered [Team_OnlineTech][gRPC]
<Initializing Game Telemetry> Initializing game telemetry component of local player [Team_GameServices][Haptic]
```

- La ligne `Register Service` indique que le serveur tourne. Elle manque sur les builds 13273298 et 13284307.
- La ligne `Initializing Game Telemetry` apparaît quand ton personnage est apparu. Le flux n'envoie des données qu'après elle.

Autres réglages présents dans l'exécutable depuis le build 13273298 (non testés) :

| Réglage | Rôle probable |
|---|---|
| `server.game.telemetry.trigger.debounce.ms` | Délai minimal entre deux actions |
| `server.game.telemetry.stream.interval.ms` | Délai entre deux trames du flux |
| `server.game.telemetry.generate.without.clients` | Produire les trames sans client connecté |
| `server.game.telemetry.test.data` | Envoyer des données de test |
| `server.game.telemetry.debug.displayinfo` | Remplir les champs de performances `game.debug` |

## Connexion

| Propriété | Valeur |
|---|---|
| Adresse | `127.0.0.1:2942` (ce PC seulement) |
| Protocole | gRPC sur HTTP/2, **en clair** (sans TLS) |
| Authentification | Aucune |
| Réflexion gRPC | **Non prise en charge** : il faut le schéma (`.proto` ou `.desc`) |
| Package | `sc.game.telemetry.v1` |
| Service | `GameTelemetryService` |

Le schéma est dans ce dépôt : [`schema/sc_extrait.desc`](../../schema/sc_extrait.desc) (`FileDescriptorSet` binaire) et [`schema/sc_extrait.proto`](../../schema/sc_extrait.proto) (lisible).
Voir [schema/README.fr.md](../../schema/README.fr.md) pour l'extraire de nouveau après un patch.

## Appels (RPC)

| RPC | Requête | Réponse | Rôle |
|---|---|---|---|
| `TelemetryStream` | `TelemetryStreamRequest {}` | flux de `TelemetryStreamResponse` | État du jeu, environ 17 trames par seconde |
| `ListTriggerableActions` | `ListTriggerableActionsRequest {}` | `ListTriggerableActionsResponse { actions[] }` | Actions acceptées par `TriggerGameAction` |
| `TriggerGameAction` | `TriggerGameActionRequest { action_name, hold_ms? }` | `TriggerGameActionResponse { status, message }` | Déclenche une action, comme un appui sur sa touche |

### Essayer avec grpcurl

[grpcurl](https://github.com/fullstorydev/grpcurl) a besoin du fichier de schéma, car le serveur n'a pas de réflexion.
Lance ces commandes depuis la racine du dépôt, ton personnage apparu.

Lister les actions :

```bash
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/ListTriggerableActions
```

Résultat (premières entrées) :

```json
{
  "actions": [
    {
      "actionName": "v_lights",
      "category": "lights_controller"
    },
    {
      "actionName": "v_invoke_ping",
      "category": "spaceship_radar",
      "holdable": true
    }
  ]
}
```

Allumer les phares du vaisseau :

```bash
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{\"action_name\": \"v_lights_on\"}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/TriggerGameAction
```

Lire le flux (Ctrl+C pour arrêter) :

```bash
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/TelemetryStream
```

### Codes de réponse des actions

`TriggerGameActionResponse.status` est un `TriggerGameActionStatus` :

| Statut | Sens observé |
|---|---|
| `TRIGGER_GAME_ACTION_STATUS_OK` | Le jeu a accepté l'action |
| `TRIGGER_GAME_ACTION_STATUS_UNKNOWN_ACTION` | Aucune action de ce nom |
| `TRIGGER_GAME_ACTION_STATUS_MAP_INACTIVE` | L'action existe, mais pas dans le contexte actuel (par exemple une action vaisseau à pied) |
| `TRIGGER_GAME_ACTION_STATUS_RATE_LIMITED` | Trop d'actions en peu de temps |
| `TRIGGER_GAME_ACTION_STATUS_FAILED` | Le jeu a refusé l'action. Les 9 actions portes, verrous et sas le renvoient en 5.0 PTU |
| `TRIGGER_GAME_ACTION_STATUS_HOLD_NOT_ALLOWED` | `hold_ms` envoyé pour une action qui n'est pas `holdable` |
| `TRIGGER_GAME_ACTION_STATUS_FILTERED` | Non permise dans la situation actuelle |

`message` contient parfois un court texte du jeu.

## Trames du flux

Chaque `TelemetryStreamResponse` contient une ou plusieurs sections :

| Champ | Numéro | Type | Contenu |
|---|---|---|---|
| `header` | 1 | `FrameHeader` | Numéro de trame et heure du jeu (depuis 13273298) |
| `vehicle` | 3 | `VehicleFrame` | Vaisseau ou véhicule où tu es assis |
| `weapons` | 4 | `WeaponsFrame` | Armes, groupe d'armes, contre-mesures |
| `events` | 5 | `EventsFrame` | Événements du jeu |
| `actor` | 6 | `ActorFrame` | Ton personnage : constantes, état, environnement |
| `force_feedback` | 7 | `ForceFeedbackFrame` | Retour de force pour les manches |
| `turret` | 8 | `TurretFrame` | Vision nocturne de la tourelle |
| `game` | 9 | `GameFrame` | État du jeu, menu, performances (depuis 13273298) |

Le champ 2 est réservé.

### Exemple de trame

Un Prospector posé, personnage assis en pilote (5.0 PTU, 21/11/2026).
Les champs à leur valeur par défaut (`0`, `false`, `""`) ne sont pas envoyés et n'apparaissent donc pas.
La capture complète est dans [`docs/captures/2026-11-21-prospector-5.0-ptu.json`](../captures/2026-11-21-prospector-5.0-ptu.json).

```json
{
  "vehicle": {
    "state": {
      "name": "MISC_Prospector_877602860529",
      "class_name": "MISC_Prospector",
      "type": "VEHICLE_TYPE_SPACESHIP",
      "flight": {
        "state": {
          "is_landed": true,
          "gear": "VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED",
          "vtol": "VEHICLE_COMPONENT_DEPLOYMENT_STATE_DEPLOYED"
        },
        "settings": {
          "ifcs_coupled": { "enabled": true, "active": true },
          "ifcs_g_safe": { "enabled": true },
          "ifcs_cruise_mode": {}
        },
        "instruments": {
          "speed": 6.3309443e-7,
          "boost": { "reserves": 1 },
          "altitude": 3.4028235e+38,
          "radar_altitude": 4.433704
        }
      },
      "power": { "powerplants": true, "weapons": true, "shield_generators": true },
      "shields": { "level": 1, "faces": [1] },
      "health": 1,
      "master_mode": { "mode": "VEHICLE_MASTER_MODE_SCM", "spooled": true }
    }
  },
  "actor": {
    "vitals": {
      "health": { "current": 100, "max": 100 },
      "hunger": { "current": 73.05671, "max": 100 },
      "heart_rate": 60.800385
    },
    "state": {
      "locomotion": "ACTOR_LOCOMOTION_STATE_SEATED",
      "crew_role": "ACTOR_CREW_ROLE_PILOT"
    },
    "environment": { "external_temperature": 20.999994, "breathable_atmosphere": true }
  }
}
```

Dans cette trame, `power.engines` est absent : la puissance des moteurs est coupée.
`altitude` vaut `3.4028235e+38` (le plus grand flottant 32 bits) quand le vaisseau est posé.

### Chemins utiles

| Donnée | Chemin | Type |
|---|---|---|
| Train d'atterrissage | `vehicle.state.flight.state.gear` | `VehicleComponentDeploymentState`, optional |
| Posé | `vehicle.state.flight.state.is_landed` | bool |
| VTOL | `vehicle.state.flight.state.vtol` | `VehicleComponentDeploymentState`, optional |
| Phares | `vehicle.state.lights_enabled` | bool |
| Portes | `vehicle.state.doors.{open_state, lock_state}` | optional, jamais envoyé en 5.0 PTU |
| Alimentation | `vehicle.state.power.{powerplants, engines, weapons, shield_generators, …}` | bool |
| Voyants | `vehicle.state.annunciators.{pwr, wpn, thr, shld, cool, qdrv, radr, prox, hit, misl}` | `AnnunciatorState` |
| Instruments de vol | `vehicle.state.flight.instruments.{speed, altitude, radar_altitude, hydrogen_fuel, quantum_fuel, heading, …}` | float |
| Réglages de vol | `vehicle.state.flight.settings.*` | `Availability {enabled, active}` ou bool |
| Vision nocturne (vaisseau) | `vehicle.state.flight.settings.flight_light_amplification` | bool |
| Vision nocturne (tourelle) | `turret.light_amplification` | bool |
| Boucliers | `vehicle.state.shields.{level, faces[]}` | float, de 0 à 1 |
| Coque | `vehicle.state.health` | float, de 0 à 1, optional |
| Mode maître | `vehicle.state.master_mode.{mode, spooled}` | `VehicleMasterMode` |
| Saut quantique | `vehicle.state.quantum_travel.{state, spool_ratio, calibration_ratio, destination, eta_seconds, remaining_distance_m}` | depuis 13273298 |
| Constantes | `actor.vitals.{health, oxygen, hunger, thirst, body_temperature}` | `Gauge {current, max}` |
| Température extérieure | `actor.environment.external_temperature` | float, °C |
| Position du perso | `actor.state.locomotion` | `ON_FOOT`, `EVA` ou `SEATED` |
| Solde | `actor.state.uec_balance` | int64 |
| Mode | `actor.state.operator_mode` | `ActorOperatorMode`, depuis 13273298 |
| Lieu | `actor.state.location.{hierarchy[], jurisdiction, armistice_zone}` | depuis 13273298 |
| Mission suivie | `actor.state.tracked_contract.details` | depuis 13273298 |
| CrimeStat | `actor.state.crime_stat` | uint32, depuis 13273298 |
| État du jeu | `game.state` | `GameState`, depuis 13273298 |
| Performances | `game.debug.{fps, gpu_ms, vram, network, server, shard_name}` | depuis 13273298 |

## Actions

`ListTriggerableActions` a renvoyé 112 actions sur les builds 13248297 et 13260598.
L'instantané est dans [`schema/actions.json`](../../schema/actions.json).
Lis toujours la liste depuis le jeu : un patch peut ajouter ou retirer des actions.

| Catégorie | Actions | Exemples |
|---|---|---|
| `lights_controller` | 3 | `v_lights`, `v_lights_on`, `v_lights_off` |
| `player` | 4 | `toggle_flashlight`, `mobiglas`, `v_starmap`, `visor_wipe` |
| `player_emotes` | 34 | `emote_wave`, `emote_agree` |
| `seat_general` | 17 | `v_eject`, `v_emergency_exit` |
| `spaceship_docking` | 1 | `v_toggle_docking_request` |
| `spaceship_general` | 11 | `v_flightready`, `v_close_all_doors`, `v_lock_all_doors` |
| `spaceship_movement` | 27 | `v_deploy_landing_system`, `v_master_mode_set_nav` |
| `spaceship_power` | 12 | `v_power_set_on`, `v_power_set_shields_off` |
| `spaceship_quantum` | 1 | `v_toggle_qdrive_engagement` |
| `spaceship_radar` | 1 | `v_invoke_ping` |
| `spaceship_target_hailing` | 1 | `v_target_hail` |

- Seule `v_invoke_ping` est `holdable` (elle accepte `hold_ms`).
- Préfère les actions `*_on` / `*_off` aux bascules quand le flux donne l'état. Une bascule envoyée sur un état mal lu inverse le résultat.
- Certaines actions ont des effets graves : `v_self_destruct`, `v_eject`, `v_emergency_exit`, `v_power_set_off`, `v_power_toggle`, `v_open_all_doors`, `v_toggle_all_doors`, `v_unlock_all_doors`, `v_unlock_all_ports`.

## Comportement et limites

- **Trames partielles** : une trame peut ne contenir qu'une section. Fusionne les trames section par section et garde la dernière valeur de chacune. Considère une section comme périmée après environ 3 secondes sans elle.
- **Absent n'est pas faux quand le parent est absent** : si la section `vehicle` manque, tu ne sais rien des phares.
- **Valeurs par défaut proto3** : `0`, `false` et `""` ne sont pas envoyés. Exemple : `lights_enabled` est envoyé à `true` quand les phares sont allumés, et absent quand ils sont éteints.
- **Champs optional** : seuls les champs marqués `optional` (`gear`, `vtol`, `doors`, `flight`, `power`…) distinguent « absent » de « valeur par défaut ». Un `gear` absent veut dire que le vaisseau n'a pas de train.
- **Altitude** : `altitude` vaut `3.4e38` (FLT_MAX) au sol ou loin d'une surface.
- **Événements** : seuls `ACTOR_ENTER_SEAT` et `ACTOR_LEAVE_SEAT` sont arrivés pendant les tests, et pas à chaque fois. Aucun événement de mort ou de réapparition n'est arrivé. Détecte la mort avec `actor.vitals.health` (0, puis 100 % à la réapparition).
- **À terre** : non détectable.
- **Portes** : `vehicle.state.doors` n'a jamais été envoyé (Titan, Corsair), et les actions portes renvoient `FAILED`. Les touches du jeu marchent toujours.
- **Boucliers** : `faces` contient 4 valeurs sans nom. Leur ordre n'est pas confirmé.
- **Ailes du Corsair** : commande séparée du train, sans champ (`transformation` n'a jamais été envoyé).
- **Torche** : aucun champ d'état. Seule l'action `toggle_flashlight` existe.
- **Enums** : un patch peut ajouter des valeurs. Accepte les valeurs inconnues.

## Historique du schéma

| Changement | Build |
|---|---|
| Schéma communautaire pour le jeu 4.10.2 | 4.10.2 |
| `ListTriggerableActions`, `TriggerGameAction` ; `VehicleState.shields` (10), `health` (11), `master_mode` (12) | 5.0 PTU, premiers builds |
| `header` (1), `game` (9), `VehicleState.quantum_travel` (13) ; côté perso `operator_mode`, `location`, `tracked_contract`, `crime_stat`, `player_name` ; `quantum_fuel`, `altitude` et `health` deviennent `optional` | 13273298 |
| Aucun changement | 13284307 |

SC Telemetry Deck ne lit que cette API locale.
Il ne lit pas la mémoire du jeu et ne modifie pas ses fichiers.
