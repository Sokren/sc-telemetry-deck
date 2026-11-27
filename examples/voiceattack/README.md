# VoiceAttack 2 example — voice control for Star Citizen

*[Français](README.fr.md)*

A **VoiceAttack 2** plugin (C# DLL, open source) and **example profiles** in English and French that go through the
SC Telemetry Deck web app to:

- **give orders** by voice: "deploy landing gear", "lights", "VTOL"…;
- **get a reply**: VoiceAttack says "Landing gear: deployed.", "Landing gear: already deployed.", "This ship doesn't have it.";
- **get warned** on its own: "shields low", "fuel low", "oxygen low", "thirst"…

It is an **example**: read the code (about a hundred lines per file), change the phrases, add your own commands.

## What you need

- **VoiceAttack 2** (the demo is enough: 1 profile, 20 commands at most).
- The **SC Telemetry Deck web app** 0.4.0 or later, running on the same PC, with Star Citizen (5.0 or later) in game.

## Setup

### 1. Get the plugin

**From a release** (easiest): download `sc-telemetry-voice-<version>.zip` from the
[releases](https://github.com/Sokren/sc-telemetry-deck/releases). Before extracting: right-click the zip →
Properties → tick **Unblock** → OK. Copy the zip's `ScTelemetryVoice` folder into `%APPDATA%\VoiceAttack2\Apps\`.
The zip also holds the profiles (`profiles`) and an EN / FR `README.txt`.

**Or build it yourself** (.NET 8 SDK: `winget install Microsoft.DotNet.SDK.8`):

```powershell
dotnet build examples/voiceattack/ScTelemetryVoice/ScTelemetryVoice.csproj -c Release
```

then copy `ScTelemetryVoice.dll` (folder `ScTelemetryVoice\bin\Release\net8.0\`) and `sctd-voice.example.json`
into `%APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\` (create the folder). `npm run build:voiceattack` makes the
same zip as the release in `dist\`.

### 2. Create a token

In the web app: ⚙ Options → **External access** → new token, name `VoiceAttack`, level **Pilot**. Copy it: it is
shown only once. The Pilot level refuses eject, self destruct and unlocking the ship: a misheard phrase cannot
trigger them. **Do not use "Full pilot" for VoiceAttack.**

### 3. Configure the plugin

In `%APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\`, copy `sctd-voice.example.json` as **`sctd-voice.json`** and
open it:

| Setting | Value |
|---|---|
| `token` | your token |
| `lang` | `en` or `fr`: the language of the replies (take your profile's) |
| `url` | change it only if you changed the app's port (`http://127.0.0.1:8743`) |
| `alerts` | alert thresholds in % (see [Alerts](#alerts)) |

### 4. Enable the plugin in VoiceAttack

⚙ Options → tick **Enable Plugin Support**, then restart VoiceAttack. The log should show
`SC Telemetry Deck – Voice : prêt / ready`. After each change to `sctd-voice.json`, restart VoiceAttack.

### 5. Import the commands

Edit your profile → **Import Commands** → a file from the `profiles` folder. VoiceAttack shows the list:
**only the checked commands are imported**.

| File | Content |
|---|---|
| `SC-Telemetry-Voice-EN.vap` / `-FR.vap` | **full**: 61 commands in English / French (paid VoiceAttack) |
| `SC-Telemetry-Voice-EN-demo.vap` / `-FR-demo.vap` | **for the demo**: a selection of 20 commands (★ below) |

The VoiceAttack **demo** keeps 20 commands at most: past that, the last ones drop off. Delete your profile's
sample commands first, then import the demo file, or pick your own 20 by checking them in the full profile.

## Voice commands

★ = in the demo profile.

**Flight**

| You say | En français | Effect |
|---|---|---|
| ★ gear down / deploy landing gear | sors le train | deploys the gear (nothing if already deployed) |
| ★ gear up / retract landing gear | rentre le train | retracts the gear |
| ★ VTOL | VTOL | toggles VTOL |
| ★ decoupled | découplé | toggles decoupled mode |
| G safe | G safe | toggles G-safe |
| proximity assist | assistance de proximité | toggles proximity assist |
| ESP | ESP | toggles ESP |
| advanced HUD | HUD avancé | toggles the advanced HUD |
| ★ nav mode | mode navigation | master mode NAV |
| combat mode | mode combat | master mode SCM |
| request landing | demande d'atterrissage | requests landing |
| request docking | demande d'amarrage | requests docking |
| flight ready | prêt au vol | flight ready |

**Power**

| You say | En français | Effect |
|---|---|---|
| ★ power on | allume le vaisseau | powers the ship on (powering off is protected) |
| engine power | énergie moteurs | toggles engine power |
| weapon power | énergie armes | toggles weapon power |
| shield power | énergie boucliers | toggles shield power |

**Lights**

| You say | En français | Effect |
|---|---|---|
| ★ lights | phares | toggles the lights |
| ★ night vision | vision nocturne | toggles night vision |
| flashlight | lampe torche | toggles the flashlight |

**Quantum, radar, seat modes**

| You say | En français | Effect |
|---|---|---|
| ★ quantum jump | saut quantique | engages the quantum drive |
| radar ping | ping radar | radar ping |
| hail target | héler la cible | hails the target |
| quantum / scan / mining mode | mode quantique / scan / minage | seat mode |
| salvage / refuel / guns mode | mode récupération / ravitaillement / armes | seat mode |
| turret one / two / three | tourelle un / deux / trois | takes the remote turret |

**Character and emotes**

| You say | En français | Effect |
|---|---|---|
| mobiGlas | mobiGlas | opens the mobiGlas |
| star map | carte stellaire | opens the star map |
| wipe visor | essuie la visière | wipes the visor |
| salute, wave, dance, clap | salue, fais coucou, danse, applaudis | emote |
| laugh, cheer, point, sit down | rigole, hourra, montre du doigt, assieds-toi | emote |

**Questions** (VoiceAttack says the value, e.g. "Thirst: 35 percent.")

| You say | En français | Reply |
|---|---|---|
| ★ fuel | carburant | hydrogen in % |
| quantum fuel | carburant quantique | quantum fuel in % |
| ★ shields | boucliers | shields in % |
| hull | coque | hull in % |
| ★ health | santé | health in % |
| oxygen | oxygène | oxygen in % |
| ★ thirst | soif | thirst in % |
| ★ ship status | état du vaisseau | ship name, shields and hull |

**Doors**

| You say | En français | Effect |
|---|---|---|
| close the doors | ferme les portes | refused by the game on 5.0 PTU ("The game refused."); will work once the game wires them |
| lock the doors | verrouille les portes | same |

No eject, self destruct, emergency exit, power off, or opening / unlocking doors: the Pilot level refuses them.

## Alerts

Without a word, VoiceAttack warns when a value drops below its threshold. Set the thresholds in
`sctd-voice.json` (`alerts` block, in %), then restart VoiceAttack; a missing key keeps its default.

| Alert | Key | Default threshold | Demo |
|---|---|---|---|
| Shields | `shields` | 25 % | ★ |
| Hull | `hull` | 50 % | ★ |
| Fuel (hydrogen) | `hydrogen` | 20 % | ★ |
| Oxygen | `oxygen` | 25 % | |
| Health | `health` | 30 % | ★ |
| Thirst | `thirst` | 25 % | ★ |
| Game lost / connected | — | when the game stops / starts sending data | ★ (lost) |

```json
"alerts": { "shields": 25, "hull": 50, "hydrogen": 20, "oxygen": 25, "health": 30, "thirst": 25 }
```

Each alert speaks once: it re-arms when the value climbs 10 points back above the threshold, and never twice
within 30 s. Ship alerts stay quiet outside the ship. To turn an alert off, delete its command from the profile.

The profiles are generated by `profiles/make-vap.mjs` (`node examples/voiceattack/profiles/make-vap.mjs`). To
add a language or a command, edit its `LANGS` and `COMMANDS` tables, then run it again.

## Writing your own commands

Technical names (contexts, variables, alert commands) are in English and the same in every language: only the
spoken phrases and the texts VoiceAttack says change.

A command adds the **Execute an External Plugin Function** action (plugin *SC Telemetry Deck – Voice*,
*Wait for the plugin function to finish* checked) with a **context**:

| Context | Effect |
|---|---|
| `function:<id>` | toggles a ship function |
| `function:<id>:on` / `:off` | turns it on / off (nothing if already done) |
| `action:<name>` | any game action, e.g. `action:v_lights_on` (list: ⚙ Options → Debug, or `GET /api/v1/actions`) |
| `say:<key>` | puts the value in `SCTD_reply`: `shields`, `hull`, `hydrogen`, `quantum`, `health`, `oxygen`, `thirst` |

Ship functions (`<id>`): `gear`, `lights`, `vtol`, `decoupled`, `gsafe`, `cruise`, `proximity`, `esp`,
`advanced_hud`, `night_vision`, `master_nav`, `power_engines`, `power_weapons`, `power_shields`, `power_main`,
`doors_closed`, `doors_locked`.

Then a **Say Something** action with `{TXT:SCTD_reply}` speaks the reply.

Variables kept up to date by the plugin:

| Variable | Content |
|---|---|
| `{TXT:SCTD_reply}` | reply to the last order |
| `{TXT:SCTD_result}` | `sent`, `noop` (already done), `refused` (the ship lacks the function), `protected` (protected action), `error` |
| `{TXT:SCTD_game}` | `live` (the game sends data) or `no_data` |
| `{BOOL:SCTD_in_ship}`, `{TXT:SCTD_ship}` | seated in a ship, its name |
| `{INT:SCTD_shields}`, `{INT:SCTD_hull}`, `{INT:SCTD_hydrogen}`, `{INT:SCTD_quantum}` | shields, hull, hydrogen, quantum fuel in % (empty if unknown) |
| `{INT:SCTD_health}`, `{INT:SCTD_oxygen}`, `{INT:SCTD_thirst}` | character health, oxygen and thirst in % |
| `{TXT:SCTD_gear}` | landing gear state word |

Alerts run the commands `((SCTD alert shields))`, `((SCTD alert hull))`, `((SCTD alert fuel))`,
`((SCTD alert oxygen))`, `((SCTD alert health))`, `((SCTD alert thirst))`, `((SCTD connected))` and `((SCTD game lost))` **if they
exist** in the profile (same names in every language): change what they say, or delete the ones you don't
want, but keep their names.

## Replies

The reply says the **command sent** ("Landing gear: deployed."), not the confirmed state: the gear takes several
seconds to deploy, and waiting would block VoiceAttack.

| Reply | Why |
|---|---|
| "already …" | the requested state is already reached, nothing is sent |
| "This ship doesn't have it." | the ship lacks this function |
| "Protected action." | refused at the Pilot level (eject, self destruct, unlock) |
| "Token refused." | wrong, revoked or stopped token, or used from another PC |
| "Game unreachable." | Star Citizen does not answer (closed, character not spawned) |
| "The game refused." | the game got the action but did not do it (e.g. doors on 5.0 PTU) |
| "App closed." | the SC Telemetry Deck web app is not running |

## Tests

```powershell
dotnet test examples/voiceattack/ScTelemetryVoice.sln
```
