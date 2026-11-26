# VoiceAttack 2 example — voice control for Star Citizen

*[Français](README.fr.md)*

A **VoiceAttack 2** plugin (C# DLL, open source) and an **example profile** that go through the
SC Telemetry Deck web app to:

- **give orders** by voice: "deploy landing gear", "lights", "VTOL"…;
- **get a reply**: VoiceAttack says "Landing gear: deployed.", "Landing gear: already deployed.", "This ship doesn't have it.";
- **get warned** on its own: "shields low", "fuel low", "oxygen low"…

It is an **example**: read the code (about a hundred lines per file), change the phrases, add your own commands.

## What you need

- **VoiceAttack 2** (the demo is enough: 1 profile, 20 commands at most).
- The **SC Telemetry Deck web app** running on the same PC, with Star Citizen (5.0 or later) in game.
- To build it yourself: the **.NET 8 SDK** (`winget install Microsoft.DotNet.SDK.8`).

## Setup

1. **Create a token** in the web app: ⚙ Options → **External access** → new token, name `VoiceAttack`, level
   **Pilot**. Copy it: it is shown only once.
   The Pilot level refuses eject, self destruct and unlocking the ship: a misheard phrase cannot trigger them.
   **Do not use "Full pilot" for VoiceAttack.**
2. **Build** (or take the DLL from a release):

   ```powershell
   dotnet build examples/voiceattack/ScTelemetryVoice/ScTelemetryVoice.csproj -c Release
   ```

3. **Copy** `ScTelemetryVoice.dll` (folder `ScTelemetryVoice\bin\Release\net8.0\`) to
   `%APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\` (create the folder).
4. In that same folder, copy `sctd-voice.example.json` as **`sctd-voice.json`** and paste your token into
   `token`. Change `url` if you changed the app's port, `lang` to `en` for English replies, and the alert
   thresholds (`alerts`, in %) if you like.
5. In VoiceAttack: ⚙ Options → **Enable Plugin Support**, then restart VoiceAttack. The log should show
   `SC Telemetry Deck – Voice : prêt / ready`.
6. **Import the commands**: edit your profile → **Import Commands** → `SC-Telemetry-Voice-FR.vap`.
   With the demo, **delete the profile's sample commands first**: past 20 commands, the last ones drop off.

## The example profile

The phrases are in French; replace them with yours (English equivalents in brackets).

| You say | What happens |
|---|---|
| « sors le train » / « rentre le train » (deploy / retract landing gear) | gear deployed / retracted (nothing if already done) |
| « phares », « VTOL », « découplé », « vision nocturne » (lights, VTOL, decoupled, night vision) | toggles the function |
| « état du vaisseau » (ship status) | ship name, shields and hull |
| « carburant », « boucliers » (fuel, shields) | the value in % |

And without a word, VoiceAttack warns when **shields** drop below 25 %, **hull** below 50 %, **hydrogen** below
20 %, **oxygen** below 25 %, **health** below 30 %, and when the **game stops answering**. Each alert speaks
once: it re-arms when the value climbs 10 points back, and never twice within 30 s. Ship alerts stay quiet
outside the ship.

## Writing your own commands

A command adds the **Execute an External Plugin Function** action (plugin *SC Telemetry Deck – Voice*,
*Wait for the plugin function to finish* checked) with a **context**:

| Context | Effect |
|---|---|
| `fonction:<id>` | toggles a ship function |
| `fonction:<id>:on` / `:off` | turns it on / off (nothing if already done) |
| `action:<name>` | any game action, e.g. `action:v_lights_on` (list: ⚙ Options → Debug, or `GET /api/v1/actions`) |
| `dire:<key>` | puts the value in `SCTD_reponse`: `shields`, `hull`, `hydrogen`, `quantum`, `health`, `oxygen` |

Ship functions (`<id>`): `gear`, `lights`, `vtol`, `decoupled`, `gsafe`, `cruise`, `proximity`, `esp`,
`advanced_hud`, `night_vision`, `master_nav`, `power_engines`, `power_weapons`, `power_shields`, `power_main`,
`doors_closed`, `doors_locked`.

Then a **Say Something** action with `{TXT:SCTD_reponse}` speaks the reply.

Variables kept up to date by the plugin:

| Variable | Content |
|---|---|
| `{TXT:SCTD_reponse}` | reply to the last order |
| `{TXT:SCTD_resultat}` | `sent`, `noop` (already done), `refused` (the ship lacks the function), `protected` (protected action), `error` |
| `{TXT:SCTD_jeu}` | `live` (the game sends data) or `no_data` |
| `{BOOL:SCTD_dans_vaisseau}`, `{TXT:SCTD_vaisseau}` | seated in a ship, its name |
| `{INT:SCTD_boucliers}`, `{INT:SCTD_coque}`, `{INT:SCTD_hydrogene}`, `{INT:SCTD_quantum}` | shields, hull, hydrogen, quantum fuel in % (empty if unknown) |
| `{INT:SCTD_sante}`, `{INT:SCTD_oxygene}` | character health and oxygen in % |
| `{TXT:SCTD_train}` | landing gear state word |

Alerts run the commands `((SCTD alerte boucliers))`, `((SCTD alerte coque))`, `((SCTD alerte carburant))`,
`((SCTD alerte oxygène))`, `((SCTD alerte santé))`, `((SCTD connecté))` and `((SCTD jeu perdu))` **if they
exist** in the profile: change their phrases, or delete the ones you don't want.

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
