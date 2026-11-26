# Star Citizen local telemetry API (observed)

**EN** English · 🇫🇷 [Français](game-telemetry-api.fr.md) · Web app API: [web-app-api.md](web-app-api.md)

This page documents the local telemetry API of the Star Citizen game client, as observed by SC Telemetry Deck.
Cloud Imperium Games (CIG) does not publish documentation for it.
Everything here comes from the schema embedded in `StarCitizen.exe`, the game log, and tests in game.
Any patch can change it.

## Status by game build

| Game build | Version | Local API | Notes |
|---|---|---|---|
| 13238477 | 5.0 PTU | Works | First 5.0 schema extracted (2026-11-20) |
| 13248297 | 5.0.202.10025 PTU | Works | Same schema, 112 actions |
| 13260598 | 5.0.202.22326 PTU | Works | Same schema, 112 actions |
| 13273298 | 5.0.202.35026 PTU | **Not started** | Schema grows (56 new fields), port `2942` closed |
| 13284307 | 5.0.202.46035 PTU | **Not started** | Schema identical to 13273298, port `2942` closed |

On builds 13273298 and 13284307, the game reads the settings and starts the telemetry component of the player, but it does not register the gRPC service.
Nothing listens on `127.0.0.1:2942`.

## Enable the API

The API is off by default.
Add these lines to `user.cfg` in the game channel folder, for example `StarCitizen\PTU\user.cfg`:

```ini
server.game.telemetry.enabled=1
server.game.telemetry.trigger.actions.enabled=1
```

The second line exists since build 13273298.
Earlier builds accept actions without it.

Check `Game.log` after launch:

```text
[User CFG ] server.game.telemetry.enabled=true
[User CFG ] server.game.telemetry.trigger.actions.enabled=true
<Register Service> Service 'sc.game.telemetry.v1.GameTelemetryService' registered [Team_OnlineTech][gRPC]
<Initializing Game Telemetry> Initializing game telemetry component of local player [Team_GameServices][Haptic]
```

- The `Register Service` line means the server runs. It is missing on builds 13273298 and 13284307.
- The `Initializing Game Telemetry` line appears after your character spawns. The stream sends data only after this line.

Other settings found in the executable since build 13273298 (not tested):

| Setting | Probable purpose |
|---|---|
| `server.game.telemetry.trigger.debounce.ms` | Minimum delay between two actions |
| `server.game.telemetry.stream.interval.ms` | Delay between two stream frames |
| `server.game.telemetry.generate.without.clients` | Build frames with no client connected |
| `server.game.telemetry.test.data` | Send test data |
| `server.game.telemetry.debug.displayinfo` | Fill the `game.debug` performance fields |

## Connection

| Property | Value |
|---|---|
| Address | `127.0.0.1:2942` (this PC only) |
| Protocol | gRPC over HTTP/2, **plain text** (no TLS) |
| Authentication | None |
| Server reflection | **Not supported**: you need the schema (`.proto` or `.desc`) |
| Package | `sc.game.telemetry.v1` |
| Service | `GameTelemetryService` |

The schema is in this repository: [`schema/sc_extrait.desc`](../../schema/sc_extrait.desc) (binary `FileDescriptorSet`) and [`schema/sc_extrait.proto`](../../schema/sc_extrait.proto) (readable).
See [schema/README.md](../../schema/README.md) to extract it again after a patch.

## Remote procedure calls (RPC)

| RPC | Request | Response | Purpose |
|---|---|---|---|
| `TelemetryStream` | `TelemetryStreamRequest {}` | stream of `TelemetryStreamResponse` | Game state, about 17 frames per second |
| `ListTriggerableActions` | `ListTriggerableActionsRequest {}` | `ListTriggerableActionsResponse { actions[] }` | Actions that `TriggerGameAction` accepts |
| `TriggerGameAction` | `TriggerGameActionRequest { action_name, hold_ms? }` | `TriggerGameActionResponse { status, message }` | Trigger one action, as if you pressed its key |

### Try it with grpcurl

[grpcurl](https://github.com/fullstorydev/grpcurl) needs the schema file because the server has no reflection.
Run these commands from the repository root, with your character spawned.

List the actions:

```bash
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/ListTriggerableActions
```

Output (first entries):

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

Turn on the ship lights:

```bash
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{\"action_name\": \"v_lights_on\"}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/TriggerGameAction
```

Read the stream (press Ctrl+C to stop):

```bash
grpcurl -plaintext -protoset schema/sc_extrait.desc -d "{}" 127.0.0.1:2942 sc.game.telemetry.v1.GameTelemetryService/TelemetryStream
```

### Action status codes

`TriggerGameActionResponse.status` is a `TriggerGameActionStatus`:

| Status | Meaning observed |
|---|---|
| `TRIGGER_GAME_ACTION_STATUS_OK` | The game accepted the action |
| `TRIGGER_GAME_ACTION_STATUS_UNKNOWN_ACTION` | No action with this name |
| `TRIGGER_GAME_ACTION_STATUS_MAP_INACTIVE` | The action exists, but not in the current context (for example a ship action while on foot) |
| `TRIGGER_GAME_ACTION_STATUS_RATE_LIMITED` | Too many actions in a short time |
| `TRIGGER_GAME_ACTION_STATUS_FAILED` | The game refused the action. All 9 door, lock and port actions return it in 5.0 PTU |
| `TRIGGER_GAME_ACTION_STATUS_HOLD_NOT_ALLOWED` | `hold_ms` sent for an action that is not `holdable` |
| `TRIGGER_GAME_ACTION_STATUS_FILTERED` | Not allowed in the current situation |

`message` sometimes carries a short text from the game.

## Stream frames

Each `TelemetryStreamResponse` holds one or more sections:

| Field | Number | Type | Content |
|---|---|---|---|
| `header` | 1 | `FrameHeader` | Frame number and game time (since 13273298) |
| `vehicle` | 3 | `VehicleFrame` | Ship or vehicle you sit in |
| `weapons` | 4 | `WeaponsFrame` | Weapons, weapon group, countermeasures |
| `events` | 5 | `EventsFrame` | Game events |
| `actor` | 6 | `ActorFrame` | Your character: vitals, state, environment |
| `force_feedback` | 7 | `ForceFeedbackFrame` | Force feedback for flight sticks |
| `turret` | 8 | `TurretFrame` | Turret night vision |
| `game` | 9 | `GameFrame` | Game state, menu, performance (since 13273298) |

Field 2 is reserved.

### Example frame

A Prospector, landed, character seated as pilot (5.0 PTU, 2026-11-21).
Fields with a default value (`0`, `false`, `""`) are not sent, so they do not appear.
The full capture is in [`docs/captures/2026-11-21-prospector-5.0-ptu.json`](../captures/2026-11-21-prospector-5.0-ptu.json).

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

In this frame, `power.engines` is absent: engine power is off.
`altitude` is `3.4028235e+38` (the largest 32-bit float) while landed.

### Useful paths

| Data | Path | Type |
|---|---|---|
| Landing gear | `vehicle.state.flight.state.gear` | `VehicleComponentDeploymentState`, optional |
| Landed | `vehicle.state.flight.state.is_landed` | bool |
| VTOL | `vehicle.state.flight.state.vtol` | `VehicleComponentDeploymentState`, optional |
| Ship lights | `vehicle.state.lights_enabled` | bool |
| Doors | `vehicle.state.doors.{open_state, lock_state}` | optional, never sent in 5.0 PTU |
| Power | `vehicle.state.power.{powerplants, engines, weapons, shield_generators, …}` | bool |
| Warning lights | `vehicle.state.annunciators.{pwr, wpn, thr, shld, cool, qdrv, radr, prox, hit, misl}` | `AnnunciatorState` |
| Flight instruments | `vehicle.state.flight.instruments.{speed, altitude, radar_altitude, hydrogen_fuel, quantum_fuel, heading, …}` | float |
| Flight settings | `vehicle.state.flight.settings.*` | `Availability {enabled, active}` or bool |
| Ship night vision | `vehicle.state.flight.settings.flight_light_amplification` | bool |
| Turret night vision | `turret.light_amplification` | bool |
| Shields | `vehicle.state.shields.{level, faces[]}` | float, 0 to 1 |
| Hull | `vehicle.state.health` | float, 0 to 1, optional |
| Master mode | `vehicle.state.master_mode.{mode, spooled}` | `VehicleMasterMode` |
| Quantum travel | `vehicle.state.quantum_travel.{state, spool_ratio, calibration_ratio, destination, eta_seconds, remaining_distance_m}` | since 13273298 |
| Vitals | `actor.vitals.{health, oxygen, hunger, thirst, body_temperature}` | `Gauge {current, max}` |
| Outside temperature | `actor.environment.external_temperature` | float, °C |
| Character position | `actor.state.locomotion` | `ON_FOOT`, `EVA` or `SEATED` |
| Balance | `actor.state.uec_balance` | int64 |
| Mode | `actor.state.operator_mode` | `ActorOperatorMode`, since 13273298 |
| Location | `actor.state.location.{hierarchy[], jurisdiction, armistice_zone}` | since 13273298 |
| Tracked mission | `actor.state.tracked_contract.details` | since 13273298 |
| CrimeStat | `actor.state.crime_stat` | uint32, since 13273298 |
| Game state | `game.state` | `GameState`, since 13273298 |
| Performance | `game.debug.{fps, gpu_ms, vram, network, server, shard_name}` | since 13273298 |

## Actions

`ListTriggerableActions` returned 112 actions on builds 13248297 and 13260598.
The snapshot is in [`schema/actions.json`](../../schema/actions.json).
Always read the list from the game: a patch can add or remove actions.

| Category | Actions | Examples |
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

- Only `v_invoke_ping` is `holdable` (it accepts `hold_ms`).
- Prefer the `*_on` / `*_off` actions to the toggles when the stream gives the state. A toggle sent on a wrong state reading inverts the result.
- Some actions have serious effects: `v_self_destruct`, `v_eject`, `v_emergency_exit`, `v_power_set_off`, `v_power_toggle`, `v_open_all_doors`, `v_toggle_all_doors`, `v_unlock_all_doors`, `v_unlock_all_ports`.

## Behavior and limitations

- **Partial frames**: a frame can hold only one section. Merge frames section by section and keep the last value of each. Treat a section as stale after about 3 seconds without it.
- **Absent is not false when the parent is absent**: if the `vehicle` section is missing, you know nothing about the lights.
- **proto3 defaults**: `0`, `false` and `""` are not sent. Example: `lights_enabled` is sent as `true` when the lights are on, and is absent when they are off.
- **Optional fields**: only fields marked `optional` (`gear`, `vtol`, `doors`, `flight`, `power`…) tell "absent" from "default". An absent `gear` means the ship has no landing gear.
- **Altitude**: `altitude` is `3.4e38` (FLT_MAX) when landed or far from a surface.
- **Events**: only `ACTOR_ENTER_SEAT` and `ACTOR_LEAVE_SEAT` arrived in tests, and not every time. No death or respawn event arrived. Detect death with `actor.vitals.health` (0, then 100 % at respawn).
- **Downed state**: not detectable.
- **Doors**: `vehicle.state.doors` was never sent (Titan, Corsair), and door actions return `FAILED`. The keys in game still work.
- **Shields**: `faces` holds 4 values without names. Their order is not confirmed.
- **Corsair wings**: separate from the landing gear, no field (`transformation` was never sent).
- **Flashlight**: no state field. Only the `toggle_flashlight` action exists.
- **Enums**: new values can appear in a patch. Accept unknown values.

## Schema history

| Change | Build |
|---|---|
| Community schema for game 4.10.2 | 4.10.2 |
| `ListTriggerableActions`, `TriggerGameAction`; `VehicleState.shields` (10), `health` (11), `master_mode` (12) | 5.0 PTU, first builds |
| `header` (1), `game` (9), `VehicleState.quantum_travel` (13); actor `operator_mode`, `location`, `tracked_contract`, `crime_stat`, `player_name`; `quantum_fuel`, `altitude` and `health` become `optional` | 13273298 |
| No change | 13284307 |

SC Telemetry Deck reads only this local API.
It does not read the game memory and does not modify game files.
