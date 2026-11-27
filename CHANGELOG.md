# Changelog

**EN** English · 🇫🇷 [Français](CHANGELOG.fr.md)

All notable changes to SC Telemetry Deck (Stream Deck plugin and standalone web app for Star Citizen).
Format inspired by [Keep a Changelog](https://keepachangelog.com/); full release notes are in [`docs/releases/`](docs/releases/)
and on the [GitHub releases page](https://github.com/Sokren/sc-telemetry-deck/releases).

> **Beta** — the game's telemetry API is new, undocumented by CIG and may change with any patch.
> 4.10.3 (LIVE) = display only, 5.0 (PTU) = display + actions.

## [Unreleased]

### Added
- **🧭 Instrument panel tab**: a built-in view for a tablet (quantum travel as a ring, notched gauges, functions, mission, performance), on top of the 10 views; the template of the same name (＋ New view) turns it into an editable view; new **« Instrument panel » look** for every view; opens directly from the QR code / the `?view=instrument` link.
- **⛶ Full screen button** in the web app's top bar (tablet, Android phone, PC); hidden where the browser does not allow it (iPhone).
- **New in game 5.0 PTU (build 13273298)**, shown when the game sends it. This build does not open the local API yet: nothing could be checked in game.
  - Top bar: **game state** (main menu, loading, in game) and **menu open**.
  - **Ship** tab: a **Quantum travel** card next to "My ship" (destination, time left, distance, spool and calibration).
  - **Character** tab: **player name**, **mode** (flight, combat, mining, salvage…), **location** and jurisdiction, **armistice zone**, **CrimeStat**, and a **Tracked mission** section (current objective, objectives done / total, time left).
  - **Debug** tab: a **Performance** section (FPS, CPU / render / GPU times, video memory, ping, packet loss, server, shard), frame number and **lost frames**.
  - **My view**: Quantum travel, Who / where / mode, Tracked mission and Performance cards, and an item for each value (**Add** menu: Character, Ship and **Game** tabs).
  - **Automatic view by the character's mode** (mining → your "Mining" view…), taking priority over position when a view is chosen.
  - Stream Deck: **Ship Display** shows quantum travel (time left and destination), distance left and calibration; **Actor Display** shows mode, location, CrimeStat, armistice zone, mission, FPS and ping.
- API contract **1.12.0**: `GET /api/v1/game`; `playerName`, `mode`, `location`, `place`, `jurisdiction`, `armistice`, `crimeStat`, `mission` in `/api/v1/character`; `quantum` in `/api/v1/ship/status`; `sequence` in `/api/v1/debug`; `quantum_card`, `who_card`, `mission_card`, `perf_card`, `game_info` items and new `character_info` / `ship_info` values; `instrument` look; `instrument_panel` template; `view=instrument` for `/api/v1/lan/qr`.
- API: **external tokens** for tools (VoiceAttack, overlay, bot…). Created from the PC (`POST /api/v1/access/tokens`) with a name and a level: **Read** (game state, events), **Pilot** (read + actions, ship functions, Morse, without the protected actions) or **Full pilot** (with eject, self destruct and unlocking the ship). Accepted only in the `Authorization` header, from the PC unless their local-network option is set, and only on the routes of their level; revocable or renewable (new token, the old one stops working at once), can be stopped for 15 min, 1 h or until resumed (refused with reason `stopped`, open connections closed), with a log of the last calls. The app token is unchanged. API contract **1.13.0**.
- Web app: **⚙ Options → External access** screen to create, change, renew, stop and revoke these tokens and see their live log. Two tokens cannot share a name (case ignored). **🔑 N calls** indicator in the top bar when their logs have something new (orange with errors). The token is shown only once; Full pilot is flagged in red, more strongly with the local network.
- **Plugins**: the web app starts **separate programs** put in the `plugins` folder next to the app (Node, Python or `.exe`), each with its own short-lived token (`sct_plg_…`, in memory only, PC only) at the granted level — Read, Pilot or Full pilot (always with the red warning) — and rights on views (read, change the ones picked, create its own, marked with the plugin). A new or changed plugin never starts on its own: **⚙ Options → Plugins** shows the exact command (run without a shell), the files and their fingerprint before enabling it. A Node plugin can only read its own folder. Stop, restart, disable, live log (API calls and program output), “Failed” after 3 errors in 1 minute, **🧩 N plugins** indicator in the top bar (green, orange: unseen errors, red: a plugin failed). A view created by a plugin shows its name and says when it is stopped. In the logs, only refusals and errors (400, 401, 403, 5xx) are red and count as alerts; they stay visible even when many normal calls push them out. Example in `examples/plugins/`. API `/api/v1/plugins`.
- **VoiceAttack 2 example** (`examples/voiceattack/`): open-source C# plugin and **English and French** example profiles (61 commands, plus a 20-command selection for the VoiceAttack demo) to fly the ship by voice with a **Pilot** external token — orders (gear down, lights, VTOL, quantum jump, modes, emotes…), replies spoken by VoiceAttack ("Landing gear: deployed.", "Protected action.", "Game unreachable."), values on request (fuel, shields, hull, health, thirst…) and threshold **alerts** (shields, hull, fuel, oxygen, health, thirst, game lost), once per drop below the threshold. FR / EN guide.

### Security
- **Admin token and mobile token**: the app's token becomes the **admin token** and works only on the PC; tablets and phones share a new **mobile token**, given by the QR code and the link, with the page's rights but without the settings (local network, external tokens, plugins, updates): 403 `forbidden` / `pc_only`. **New token** now replaces only the mobile token: the PC stays connected. **Tablets and phones already connected must scan the QR code once** after the update; they show a message saying so.
- The app refuses requests whose `Host` header is neither `localhost` nor an IP address (403 `bad_host`): a web page can no longer reach it by pointing its domain name at this PC (DNS rebinding).
- The event stream no longer sends views to external tokens, and only the allowed views to a plugin.

### Changed
- Update check: only **main versions** are offered (`x.y.z`). Pre-releases, betas and release candidates are ignored, even when they are not flagged as pre-release on GitHub, and a beta is never counted as newer than the version of the same number.
- Game schema updated: 5.0 PTU build 13273298 (5.0.202.35026).

## [0.3.15] — 2026-11-24

### Added
- Web app: **view templates**. **＋** offers *Blank* or **Xeneon Edge – pilot** (pilot station for a wide 2560×720 touch screen); the new view can be edited like any other. Import files in `docs/vues/` (`npm run templates:export` regenerates them).
- Web app: **one-third** width sections (**−** / **+**: third ↔ half ↔ full) and **tall sections** (↕, two rows: two sections can stack beside it), for wide screens.
- Web app: **Cockpit** look (centered clipped-corner buttons, lit in blue; one-line gauges). Self-destruct and eject are always red.
- Web app: new item styles — **heading tape** (heading), **switch** (ship functions), **slide** or **hold** to confirm an action — and the **BOOST** light (`ship_info` / `boost`).
- Web app: **free placement** — a dragged item lands in the column where you drop it; the slots before it stay empty (to center a button, leave a gap…). On a phone, items simply follow each other.
- Web app: **Line** style for every value (name on the left, value on the right, the height of a bar), e.g. decoys and noise.
- Web app: items as narrow as **1 slot of 16** (every item except warning lights and *My ship*). Width is set with **−** and **+**, with the slots taken shown in between (1, 2, 4, 6, 8…).

### Fixed
- Web app: press-and-hold (eject) — the progress did not animate (ring on the grid, item filling up in a view).
- Web app: **Tablet / phone** window — the QR code sometimes stayed a broken image after turning on network access (or changing network card) from the window; it now shows right away, and a failed load is retried.
- API contract **1.11.0**: `GET /api/v1/views/templates`, `POST /api/v1/views` with `template`, `third` width, `0.25` size, `tall` section, `cockpit` look, `tape` / `switch` / `slide` / `hold` styles, `col` column, `line` style, `words` (both state words) on ship functions.

## [0.3.14] — 2026-11-24

### ⚠ Breaking change
- **Ship Toggle is merged into Ship Action** and no longer appears in the Stream Deck action list. **Nothing to redo**: Ship Toggle keys already on your Stream Deck keep working. Their settings (function, mode, style, red warning) are converted to Ship Action automatically the first time they appear, and they now open the Ship Action panel. For a new key with a live state, pick **Ship Action** and choose the function (landing gear, lights, VTOL…).
- **Ship Action keys set to a function with a state look different**: they show the real state instead of a fixed icon. To get the old look back: *Image* → **No state (fixed icon)**.
- **A Ship Action press takes the state into account**: "On" on a function that is already on no longer sends anything (✔). Outside a ship, or when the state is unknown, the command is sent as before.

### Added
- Ship Action: **live state on the key** for landing gear, lights, VTOL, decoupled, G-safe, cruise, ESP, advanced HUD, night vision, NAV / SCM mode, power, doors and locks. Styles A Text, B LED and C Filled, and a red warning when doors or locks are open.
- Ship Action: **the icon changes with the state** (lights with a glow, eye open or closed, padlock open or closed, door ajar, shield full or dashed…), with a short "pop" when it changes and an animation while moving (VTOL rotates, the others blink orange). The landing gear keeps its icon.
- Ship Action: **ESP** and **cruise** (display only: the game has no command for it) are in the list.

### Fixed
- **The title typed in the Stream Deck now shows** on Ship Action (function with a state), Actor Display and Ship Display, dials included. It replaces the default name ("Health", "Gear"…); empty title = default name. If "Show title" is ticked, only the Stream Deck title shows (no duplicate).

## [0.3.13] — 2026-11-23

### Added
- **Portable web app** `sc-telemetry-web-<version>-portable.zip` (`npm run build:portable`): the same app started with the official, signed `node.exe`, for PCs where **Windows Smart App Control** blocks the unsigned exe. The `README.txt` inside (EN / FR) explains how to unblock the zip or the `.cmd` if Windows still blocks it.
- Web app: **customize a view** (padlock open). View **look**: *Standard* or *Ship HUD* (cockpit-screen frames, monospaced figures, in your theme's colors). A **⚙** button on each item: a custom **display name** (any language, emojis; the API and the Stream Deck keep the game names) and a gauge **style** — card, ring, arc, bar, vertical bar, segments, vertical segments or big number. For the balance, a **scale**: auto (15.0M), thousands (15,021k), millions (15.02M) or every digit.
- Web app: **item width in slots** (1, 2, 3, 4, 6 or 8; 8 per row in a full-width section, 4 in a half section or on a phone), with a “2 → 3” button like the sections'. Existing views keep their layout.
- Web app: per-device **number format** in ⚙ Options (same as language, 1 234,5 or 1,234.5), independent of the page language.
- API contract **1.10.0**: `look` on a view; `label`, `display` (`style`, `length`) and widths 0.5 to 4 (`size`) on an item; `amount` (raw amount) on the balance.

### Changed
- **Percentages truncated like in the game** (98.87% → 98%, instead of 99), on Stream Deck keys and in the web app.
- Web app: the **language** is picked with one button per language (Français / English) in ⚙ Options.
- Web app: in edit mode, an item's buttons form a bar above its content instead of covering it.

### Fixed
- API contract: the texts still said dangerous actions were refused (wrong since 0.3.9); the `dangerous_action` refusal code, never returned, is removed.

## [0.3.12] — 2026-11-23

### Added
- Web app: **export / import a view** (padlock open, **⇪ Export** / **📥 Import**) — one view or all your views, as a dated `.json` file (backup) or as a **copy-and-paste code** `SCTD1:…` (Discord, Reddit…). Before importing, a preview shows which version exported it and lists the items your version cannot read (left out, the rest is imported); imported views are added to yours (10 at most), nothing is replaced. API contract **1.9.0**: `GET /api/v1/views/export` (`?id=`, `&as=code`), `POST /api/v1/views/import` (`?dry_run=1` for the preview).

### Changed
- READMEs brought up to date with versions 0.3.8 to 0.3.11 (sensitive actions, Flight ready, web app on Linux under Wine…).

## [0.3.11] — 2026-11-23

### Added
- Web app, **Ship** tab: a big **✈ Flight ready** button (`v_flightready`, command only — the game sends no "ready" state) and a one-line **character summary** above the ship card — health, hunger, thirst, oxygen (coloured by level) and a breathable-air note; hide it with ✕ or in ⚙ Options (per device).
- Web app, **Character** tab: an **Actions** row — star map, wipe visor, mobiGlas, flashlight.
- Web app, 🐞 **Debug** tab: **actions sent** log (last 200: time, action, origin, character position, the game's answer, response time), *Errors only* / *Copy* / *Clear*, included in the recording. A button showing ⚠ tells why when hovered. API contract **1.8.0**: `actions` in `GET /api/v1/debug` and in the recording, `DELETE /api/v1/debug/actions`.
- Web app: **update check** — at start, then daily (can be turned off in ⚙ Options → *Updates*), the app reads the latest GitHub release; a newer one shows a **⬆ x.y.z available** badge and **Open GitHub ↗**. Nothing is downloaded automatically, no data is sent. API: `GET` / `PUT /api/v1/update`, `POST /api/v1/update/check`.

### Changed
- Web app: no more references to the Stream Deck in the page and the API docs (the app stands on its own); the tile-press description no longer claims dangerous actions are never sent.

## [0.3.10] — 2026-11-23

### Added
- Web app: **🐞 Debug mode** (⚙ Options → *Advanced*, per device) — a **Debug** tab with everything the game sends, raw and read only: sections with their age or **All** at once, full tree with the schema fields the game does not send in grey, filter, freeze, copy JSON / path, last events, frames per second, and **⏺ Record** to download every raw frame as `.json` (up to 10 000 frames) for a bug report. API contract **1.7.0**: `GET /api/v1/debug`, `POST` / `DELETE /api/v1/debug/recording`.

## [0.3.9] — 2026-11-22

### Changed
- **Sensitive actions on keys and in the web app**: opening / unlocking doors and ports, self-destruct, emergency exit and turning main power off are now offered and sent in **one press** (they stay refused to the AI). **Eject** must be **held 1.5 s** — a red ring fills up with the time left, releasing earlier cancels (Ship Action key, grid tile, view item).
- **Ship Toggle**: doors (close / open), door locks (lock / unlock) and main power (on / off) now work both ways.
- **Red warning only in a dangerous state** (doors open, locks open): red outline, ⚠, state word in red — nothing when closed / locked. Turn it off per key on Stream Deck (*Warning* checkbox) or for the whole web app in ⚙ Options (per device). API: `danger: true` on ship functions in a dangerous state, `hold: true` on grid tiles that must be held. API contract **1.6.0** (also: `cruise` function, `readOnly`).

### Added
- **Cruise control** (Alt+C) as a ship function, **read only**: ON / OFF on Ship Toggle, in the web app's *Ship* tab and views (dashed outline, a press does nothing — the game has no command for it). API: `cruise` function id, `readOnly: true` on functions the game cannot control. Checked in game on the Lightning F8C. The speed limiter value (mouse wheel) and the Corsair's wings are not sent by the game, so not shown.
- Web app: **❓ Enable telemetry** button, shown while the game sends nothing (also in *About*): step-by-step guide for Star Citizen 5.0 (create `user.cfg` in the game channel folder, add `server.game.telemetry.enabled=1`, launch the game, check `Game.log`) and the 4.10.3 LIVE command, with *Copy* buttons. The app still never touches the game's files.
- Web app: **color themes** — Default, Green cockpit, Amber, Night blue and Light (day), plus an accent color of your choice, remembered per device (your tablet can differ from your PC). OK / warning / danger colors stay readable in every theme.
- Web app: **⚙ Options** window gathering appearance, language, automatic view, tablet / phone access and help (enable telemetry, About, API); the header keeps only the game status, the views padlock and ⚙ Options.

### Known limitation
- 5.0 PTU: the game does not send the door state yet and refuses the door / lock / port commands through the API (in-game keys work; tested on the Avenger Titan and Corsair). *Doors* and *Door locks* show "—" until CIG wires them.

### Fixed
- Web app: the header buttons overflowed the screen on phones; they now wrap.

## [0.3.8] — 2026-11-22

### Added
- **Morse Code** (Stream Deck) and web app API: Morse code with the **ship's lights** as well as the flashlight (*Light* setting, `light: "ship_lights"` in `POST /api/v1/morse`, contract **1.4.0**); the lights are switched on / off explicitly and left off at the end. Existing keys keep the flashlight.
- Web app: **Morse in your views** — *Morse message* item (saved text, flashlight or ship lights, dot length, repetitions, set with ✏️; lit while it is being sent) and *Free Morse* item (type a message on the spot, flashlight ⇄ ship lights; the last text is kept on the device). Pressing any Morse item during sending stops it. Views API: `settings` on `morse` / `morse_free` items, `morse` in the `state` event (contract **1.5.0**).
- **Current letter** while sending Morse: the letter and its code (lit sign highlighted, `␣` between words, current round when repeated) show on the Stream Deck **Morse Code** key, in the views' Morse items and on the grid's Morse tile. API: `morse.progress` in the `state` event.

### Changed
- GitHub repository renamed **Sokren/sc-telemetry-deck** (old links redirect); links updated.

## [0.3.7] — 2026-11-21

### Added
- **Ship Display**: **ship** (manufacturer, model, flying / landed), **shields** and **hull** (shields drain in NAV mode), **speed**, **vertical speed** (signed), **radar altitude**, **G-force** and **boost reserve** ("Boost ▲" while engaged, red when critical), **hydrogen** — checked in flight on the Arrow and the Lightning F8C.
- Web app: **My ship** card (model, manufacturer, state, mode, role, readable seat — e.g. "Co-pilot" — with the technical seat name as info, boost, key instruments) at the top of the *Ship* tab and in the views' *Add* menu; **Vertical speed**, **G-force** and **Boost** instruments; ship model in the API (`shipStatus.model`, `boostEngaged`); API contract **1.3.0** (additive, also covers the 0.3.5–0.3.6 instrument additions).

### Fixed
- Web app: radar altitude showed the game's "out of range" value (3.4e38) instead of "—".
- Web app: hull showed 0 % red when the game does not send it; now "—".

## [0.3.6] — 2026-11-21

### Added
- **Ship Display**: **weapons ready to fire** ("1 / 2", colored gauge), **active weapon group** ("All" for group 0, then 1, 2… as in game) and **gimbals** (locked / free). Display only.
- Web app: **Weapons ready**, **Weapon group** and **Gimbals** instruments (Ship tab, API, views).
- Web app: **🔁 Auto** — automatic view change per device: tab or view on foot / seated / EVA (default: on foot → *Character*, seated → *Ship*), after 2 s in the same position, never while editing; a tab changed by hand is kept until the next change of position.

## [0.3.5] — 2026-11-21

### Added
- **Ship Display** (Stream Deck): the ship's **countermeasures** live — decoys and noise together ("45 / 3") or one of them — on a key (value + colored gauge) or a Stream Deck + dial. 100 % = the largest stock seen for this ship model while a display is visible (the game does not send the maximum). Display only: the game exposes no command to fire countermeasures.
- Web app: **Decoys** and **Noise** instruments in the *Ship* tab, the API and the views' *Add* menu.

## [0.3.4] — 2026-11-21

Web app only (Stream Deck plugin unchanged since 0.3.2).

### Added
- **Your views**: build your own tabs (first one: *My view*; **＋** adds more, up to 10) with named sections (half or full
  width) and items picked from an **Add** menu: vitals, instruments, warning lights, ship functions, actions, emotes.
  Drag and drop (mouse or touch), 1× / 2× sizes, padlock to edit / rename / delete. Saved in the app (`view.json`) and kept
  across restarts; each view is saved on its own, so two screens can edit two views at once.
- `?view=<id>` link opens a given view; on a phone the tabs become a list.
- **Tablet / phone access** (📱, PC only): local network switch (off by default), **QR code** and full address hidden every
  time the window opens (no IP on screen), *Copy link*, *Open on [view]*, *New token*, connected-device count without
  addresses, network-card choice (virtual cards left out). Advanced opt-in: listen on all interfaces (0.0.0.0) with a
  warning and a confirmation.
- **About** window: app version, checked game version, whether actions are available, GitHub links.
- API contract 1.2.0: `/api/v1/views`, `/api/v1/lan`, `/api/v1/lan/token`, `/api/v1/lan/qr`, `views` event.

### Third-party
- QR codes made with [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), built into the exe.

## [0.3.3] — 2026-11-21

### Added
- Web app: **all 34 player emotes** in the *Character* tab, read live from the game, ✔ / ⚠ when pressed.
- Web app: **app version** next to the title (hover: game version of the embedded schema).

### Docs
- **Star Citizen 4.10.3 (LIVE)** setup: `setx GRPC_CLIENT_SERVER_ENABLED true` (display only; actions need 5.0).
- Beta notice and per-version limits in the README.

### Game
- Schema checked on 5.0 PTU build 13248297 (5.0.202.10025): unchanged (112 actions).

## [0.3.2] — 2026-11-21

### Added
- Detection of game versions without action commands (e.g. 4.10), through the game's API alone:
  Stream Deck keys show ⚠ with a clear log message, the web app shows a banner, displays keep working.
- API: `actions` field (`available` / `unsupported` / `unknown`) in `GET /api/v1/status` and the `status` event
  (contract 1.1.0, additive).

## [0.3.1] — 2026-11-21

### Added
- **`sc-telemetry-web.exe`**: the web app as a single executable — no Node.js needed, the page opens on double-click.
- Updated `sc_extrait.desc` / `actions.json` placed next to the exe are used instead of the embedded ones (after a patch).

### Note
- The exe is not signed: Windows SmartScreen may warn the first time (*More info → Run anyway*).

## [0.3.0] — 2026-11-21

### Added — Stream Deck
- **Ship Toggle**: 17 ship functions with their live state (landing gear, lights, VTOL, transformation, decoupled,
  G-safe, proximity assist, ESP, advanced HUD, night vision, NAV/SCM, engine / weapon / shield power, main power,
  doors); toggle / on only / off only; three styles (text, LED, filled).
- **Ship Action**: every ship and seat command; on / off / toggle variants merged into one entry with a mode setting
  (existing keys converted automatically).
- Dangerous actions (self destruct, eject, power off, opening / unlocking doors) are never offered nor sent.

### Added — web app (preview)
- Button grid, *Character* tab (position, crew role, 13 vitals) and *Ship* tab (instruments, warning lights,
  clickable functions), live, French and English.
- Documented public API (OpenAPI / Swagger at `/api/docs`), token required, this PC only.

## [0.2.0] — 2026-11-21

### Added
- **Actor Display**: a character vital on a key (value + colored gauge) or on a **Stream Deck + dial** (rotate to change
  the value): health, oxygen, hunger, thirst, temperatures, heart rate, gravity, pressure, radiation, intoxication,
  breathable air, balance. "—" when the game is closed or the character has not spawned.
- One shared telemetry stream, opened only while a display is visible.

## [0.1.0] — 2026-11-20

First release.

### Added
- **Actor Action**: character actions (mobiGlas, flashlight, star map, visor wipe) and the 34 emotes, from a grouped list.
- **Morse Code**: flashes the flashlight in Morse code (text, dot length, repetitions).

### Known issues
- In 5.0 PTU the game accepts the `mobiglas` action but does not open the mobiGlas.

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
