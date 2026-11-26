# SC Telemetry Deck web app API

**EN** English · 🇫🇷 [Français](web-app-api.fr.md) · Game API: [game-telemetry-api.md](game-telemetry-api.md)

The SC Telemetry Deck web app exposes a REST API over HTTP.
It reads the game state and triggers game actions for you, so other software does not need gRPC or the game schema: stream overlays, bots, dashboards, home automation.
This page is a summary.
The full contract is the OpenAPI file that the app serves.

| Property | Value |
|---|---|
| Base URL | `http://127.0.0.1:8743` |
| Contract | OpenAPI 3, version **1.13.0** (unreleased batch for 0.4.0) |
| Contract file | `GET /api/v1/openapi.json` (no token needed) |
| Interactive docs | Swagger UI at `http://127.0.0.1:8743/api/docs` |
| Format | JSON, UTF-8 |
| Real time | Server-Sent Events (SSE) at `/api/v1/events` |

## Prerequisites

- The web app runs (`sc-telemetry-web.exe`, the portable zip, or `npm run start:web`).
- For game data: Star Citizen runs with the local API turned on, and your character has spawned. See [the game API](game-telemetry-api.md#enable-the-api).

## Authentication

Every endpoint except `/api/v1/openapi.json` needs the access token.

- Send it in a header: `Authorization: Bearer <TOKEN>`.
- The app stores it in `%APPDATA%\SC Telemetry Deck\settings.json`.
- Browsers cannot add headers to `EventSource` or to a page link: pass the token as `?t=<TOKEN>` instead.
- **New token** in ⚙ Options → Tablet / phone replaces the token. Every other device must then scan the QR code again.

A request without a valid token gets `401`.

## Network access

By default, the app listens on this PC only (`127.0.0.1`).

- ⚙ Options → Tablet / phone → **Allow access from the local network** adds one network card of the PC.
- The connection is not encrypted, and the tablet link contains the token. Use it on a home network only.
- The `/api/v1/lan` endpoints answer only to the PC itself. Other devices get `403`.

## Errors

Errors return a JSON body:

```json
{ "error": "not_found" }
```

| Code | Meaning |
|---|---|
| `400` | Invalid body or parameter |
| `401` | Token missing or wrong |
| `403` | Allowed from the PC only (`/api/v1/lan`) |
| `404` | Unknown name or ID |
| `409` | Not possible now (for example the ship lacks the function, or 10 views already exist) |
| `422` | Nothing to send (empty Morse message) |
| `502` | The game refused the action or cannot be reached |

## Endpoints

### Status and game

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/status` | App version, telemetry (`live` or `no_data`), character (`spawned` or `unknown`), schema version |
| `GET` | `/api/v1/game` | Game state (`front_end`, `loading`, `in_game`), menu open, performance (FPS, GPU, video memory, ping, shard) |
| `GET` | `/api/v1/openapi.json` | This contract (public) |

### Character

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/character` | Position, crew role, mode, location, armistice zone, CrimeStat, tracked mission |
| `GET` | `/api/v1/vitals` | All vitals with text, unit, level (`ok`, `warn`, `bad`) and percent |
| `GET` | `/api/v1/vitals/{id}` | One vital (`health`, `oxygen`, `hunger`, `thirst`, `body_temperature`…) |

### Ship

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/ship/status` | Ship card, instruments, warning lights, quantum travel |
| `GET` | `/api/v1/ship/functions` | The 18 ship functions and their state |
| `GET` | `/api/v1/ship/functions/{id}` | One function (`gear`, `lights`, `vtol`, `decoupled`, `master_nav`, `power_engines`…) |
| `POST` | `/api/v1/ship/functions/{id}/press` | Press a function. Body: `{"mode": "toggle" \| "on" \| "off"}` |

`press` reads the state first:

- `toggle` sends the command opposite to the state read.
- `on` and `off` send nothing when the function is already in that state (`decision: "noop"`).
- `409` when the ship lacks the function (`code: "unavailable"`) or no command fits the state read (`code: "no_command"`: unknown state with no toggle, read-only cruise control).
- Main power, doors and locks work both ways: turning off, opening and unlocking are sent.

### Actions

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/actions` | Actions the game accepts, grouped by category, with labels |
| `POST` | `/api/v1/actions/{name}/trigger` | Trigger one action by name (`v_lights_on`, `emote_wave`…) |

### Morse

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/morse` | Send a message in Morse with the flashlight or the ship lights (`202`, `409` if a message is already playing) |
| `DELETE` | `/api/v1/morse` | Stop the message |

### Grid and views

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/layout` | Button grid of the page |
| `POST` | `/api/v1/layout/tiles/{index}/press` | Press a tile |
| `GET` | `/api/v1/views` | List the views (10 at most) |
| `POST` | `/api/v1/views` | Create a view, blank or from a template (`{"template": "instrument_panel", "name": "…"}`) |
| `GET` | `/api/v1/views/templates` | View templates (`xeneon_pilot`, `instrument_panel`), `?lang=fr` or `en` |
| `PUT` | `/api/v1/views/{id}` | Save a view |
| `DELETE` | `/api/v1/views/{id}` | Delete a view |
| `GET` | `/api/v1/views/export` | Export one view (`?id=`) or all, as JSON or as a `SCTD1:` code (`&as=code`) |
| `POST` | `/api/v1/views/import` | Import views (`?dry_run=1` for a preview) |

### Tablet and phone access

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/lan` | Network access settings |
| `PUT` | `/api/v1/lan` | Turn network access on or off |
| `POST` | `/api/v1/lan/token` | New access token |
| `GET` | `/api/v1/lan/qr` | QR code of the tablet link, `?view=` picks the view it opens (`instrument` for the Instrument panel tab) |

### Debug and updates

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/telemetry/{section}` | One raw stream section (`vehicle`, `actor`, `weapons`, `game`…) |
| `GET` | `/api/v1/debug` | Everything the game sends, merged with the schema, plus the action log |
| `POST` | `/api/v1/debug/recording` | Start recording raw frames (10 000 at most) |
| `DELETE` | `/api/v1/debug/recording` | Stop and download the recording |
| `DELETE` | `/api/v1/debug/actions` | Clear the action log |
| `GET` | `/api/v1/update` | Update check state |
| `PUT` | `/api/v1/update` | Turn the daily check on or off |
| `POST` | `/api/v1/update/check` | Check now |

## Examples

The outputs below come from a test game. Values change with your game.
Replace `<TOKEN>` with your token.

### Read the status

```bash
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8743/api/v1/status
```

```json
{"app":"sc-telemetry-web","version":"0.3.15","telemetry":"live","character":"spawned","schema":"5.0.202.22326 PTU (build 13260598)","actions":"available"}
```

### Read the landing gear

```bash
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8743/api/v1/ship/functions/gear
```

```json
{"id":"gear","name":"Landing gear","label":"Gear","state":"on","word":"DOWN","words":{"on":"DOWN","off":"UP"}}
```

`state` is `on`, `off`, `moving-on`, `moving-off`, `unavailable` (the ship has no such function) or `unknown` (no reliable data).

### Turn on the lights

```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{\"mode\": \"on\"}" http://127.0.0.1:8743/api/v1/ship/functions/lights/press
```

```json
{"decision":"sent","action":"v_lights_on","ok":true}
```

### Trigger an action

```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8743/api/v1/actions/emote_wave/trigger
```

```json
{"ok":true}
```

### Read the game performance

```bash
curl -H "Authorization: Bearer <TOKEN>" http://127.0.0.1:8743/api/v1/game
```

```json
{"available":true,"state":"in_game","label":"In game","menuOpen":false,"mode":"SC_Default","perf":{"fps":51.9,"frameMs":17.2,"gpuMs":12.3,"vramUsedMb":9600,"vramBudgetMb":11468,"pingMs":38,"serverFps":22,"shard":"EUW-01 #034"}}
```

The `perf` object is shortened here.

## Real-time events

`GET /api/v1/events` keeps the connection open and sends Server-Sent Events.
Use it instead of polling.

```bash
curl -N "http://127.0.0.1:8743/api/v1/events?t=<TOKEN>"
```

```text
event: status
data: {"app":"sc-telemetry-web","version":"0.3.15","telemetry":"live","character":"spawned","schema":"5.0.202.22326 PTU (build 13260598)","actions":"available"}

event: views
data: {"views":[…]}
```

| Event | When | Content |
|---|---|---|
| `status` | On connection, then when it changes | Same object as `GET /api/v1/status` |
| `state` | When a value changes, 4 per second at most | `vitals`, `ship`, `character`, `shipStatus`, `morse` |
| `tile` | When a tile image changes | `{index, image, hold?}` |
| `feedback` | After a tile press | `{index, feedback, detail?}` |
| `views` | On connection, then when a view is created, saved or deleted | Same object as `GET /api/v1/views` |

The server sends a `: ping` comment every 15 seconds.

In a browser:

```js
const events = new EventSource("http://127.0.0.1:8743/api/v1/events?t=<TOKEN>");
events.addEventListener("state", (e) => console.log(JSON.parse(e.data).vitals));
```

## Sensitive actions

The API sends sensitive actions like any other, with no confirmation: self-destruct, eject, emergency exit, main power off, opening or unlocking doors.
Check the action name before you call it.

## Versioning

- The contract follows semantic versioning. A minor version adds fields or endpoints and does not remove any.
- Read `info.version` in `/api/v1/openapi.json` to know which contract the app serves.
- Changes are listed in the [changelog](../../CHANGELOG.md).
