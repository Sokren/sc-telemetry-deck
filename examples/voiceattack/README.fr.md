# Exemple VoiceAttack 2 — piloter Star Citizen à la voix

*[English](README.md)*

Un plugin **VoiceAttack 2** (DLL C#, open source) et un **profil d'exemple** qui passent par l'appli web
SC Telemetry Deck pour :

- **donner des ordres** à la voix : « sors le train », « phares », « VTOL »… ;
- **avoir une réponse** : VoiceAttack dit « Train : sorti. », « Train : déjà sorti. », « Ce vaisseau n'en a pas. » ;
- **être prévenu** tout seul : « boucliers bas », « carburant faible », « oxygène faible »…

C'est un **exemple** : lis le code (une centaine de lignes par fichier), adapte les phrases, ajoute tes commandes.

## Ce qu'il faut

- **VoiceAttack 2** (la démo suffit : 1 profil, 20 commandes au maximum).
- L'**appli web SC Telemetry Deck** lancée sur le même PC, avec Star Citizen (5.0 ou plus) en jeu.
- Pour compiler toi-même : le **kit .NET 8 SDK** (`winget install Microsoft.DotNet.SDK.8`).

## Installation

1. **Crée un jeton** dans l'appli web : ⚙ Options → **Accès externes** → nouveau jeton, nom `VoiceAttack`,
   niveau **Pilotage**. Copie-le : il n'est montré qu'une fois.
   Le niveau Pilotage refuse l'éjection, l'autodestruction et le déverrouillage du vaisseau : une phrase mal
   comprise ne peut pas les déclencher. **N'utilise pas « Pilotage complet » pour VoiceAttack.**
2. **Compile** (ou prends la DLL d'une release) :

   ```powershell
   dotnet build examples/voiceattack/ScTelemetryVoice/ScTelemetryVoice.csproj -c Release
   ```

3. **Copie** `ScTelemetryVoice.dll` (dossier `ScTelemetryVoice\bin\Release\net8.0\`) dans
   `%APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\` (crée le dossier).
4. Dans ce même dossier, copie `sctd-voice.example.json` sous le nom **`sctd-voice.json`** et colle ton jeton
   dans `token`. Change `url` si tu as modifié le port de l'appli, `lang` pour `en` si tu veux les réponses en
   anglais, et les seuils d'alerte (`alerts`, en %) si tu veux.
5. Dans VoiceAttack : ⚙ Options → **Enable Plugin Support**, puis redémarre VoiceAttack. Le journal doit
   afficher `SC Telemetry Deck – Voice : prêt / ready`.
6. **Importe les commandes** : édite ton profil → **Import Commands** → `SC-Telemetry-Voice-FR.vap`.
   Avec la démo, **supprime d'abord les commandes d'exemple** du profil : au-delà de 20 commandes, les
   dernières disparaissent.

## Le profil d'exemple

| Tu dis | Ce qui se passe |
|---|---|
| « sors le train » / « rentre le train » | train sorti / rentré (rien si c'est déjà fait) |
| « phares », « VTOL », « découplé », « vision nocturne » | bascule la fonction |
| « état du vaisseau » | nom du vaisseau, boucliers et coque |
| « carburant », « boucliers » | la valeur en % |

Et sans rien dire, VoiceAttack prévient quand les **boucliers** passent sous 25 %, la **coque** sous 50 %,
l'**hydrogène** sous 20 %, l'**oxygène** sous 25 %, la **santé** sous 30 %, et quand le **jeu ne répond plus**.
Chaque alerte ne parle qu'une fois : elle se réarme quand la valeur remonte de 10 points, et jamais deux fois en
30 s. Les alertes vaisseau se taisent hors du vaisseau.

## Écrire tes propres commandes

Une commande ajoute l'action **Execute an External Plugin Function** (plugin *SC Telemetry Deck – Voice*,
case *Wait for the plugin function to finish* cochée) avec un **contexte** :

| Contexte | Effet |
|---|---|
| `fonction:<id>` | bascule une fonction vaisseau (`toggle`) |
| `fonction:<id>:on` / `:off` | l'allume / l'éteint (rien si c'est déjà fait) |
| `action:<nom>` | n'importe quelle action du jeu, ex. `action:v_lights_on` (liste : ⚙ Options → Debug, ou `GET /api/v1/actions`) |
| `dire:<clé>` | met la valeur dans `SCTD_reponse` : `shields`, `hull`, `hydrogen`, `quantum`, `health`, `oxygen` |

Fonctions vaisseau (`<id>`) : `gear`, `lights`, `vtol`, `decoupled`, `gsafe`, `cruise`, `proximity`, `esp`,
`advanced_hud`, `night_vision`, `master_nav`, `power_engines`, `power_weapons`, `power_shields`, `power_main`,
`doors_closed`, `doors_locked`.

Ensuite, une action **Say Something** avec `{TXT:SCTD_reponse}` dit la réponse.

Variables mises à jour par le plugin :

| Variable | Contenu |
|---|---|
| `{TXT:SCTD_reponse}` | phrase de réponse du dernier ordre |
| `{TXT:SCTD_resultat}` | `sent`, `noop` (déjà fait), `refused` (le vaisseau n'a pas la fonction), `protected` (action protégée), `error` |
| `{TXT:SCTD_jeu}` | `live` (le jeu envoie des données) ou `no_data` |
| `{BOOL:SCTD_dans_vaisseau}`, `{TXT:SCTD_vaisseau}` | assis dans un vaisseau, son nom |
| `{INT:SCTD_boucliers}`, `{INT:SCTD_coque}`, `{INT:SCTD_hydrogene}`, `{INT:SCTD_quantum}` | % (vide si inconnu) |
| `{INT:SCTD_sante}`, `{INT:SCTD_oxygene}` | % du personnage |
| `{TXT:SCTD_train}` | mot d'état du train (SORTI, RENTRÉ…) |

Les alertes lancent les commandes `((SCTD alerte boucliers))`, `((SCTD alerte coque))`,
`((SCTD alerte carburant))`, `((SCTD alerte oxygène))`, `((SCTD alerte santé))`, `((SCTD connecté))` et
`((SCTD jeu perdu))` **si elles existent** dans le profil : change leurs phrases, ou supprime celles que tu ne
veux pas.

## Réponses

La réponse dit la **commande envoyée** (« Train : sorti. »), pas l'état confirmé : le train met plusieurs
secondes à sortir, attendre bloquerait VoiceAttack.

| Réponse | Pourquoi |
|---|---|
| « déjà … » | l'état demandé est déjà atteint, rien n'est envoyé |
| « Ce vaisseau n'en a pas. » | le vaisseau n'a pas cette fonction |
| « Action protégée. » | refusée au niveau Pilotage (éjection, autodestruction, déverrouillage) |
| « Jeton refusé. » | jeton faux, révoqué, stoppé, ou utilisé depuis un autre PC |
| « Jeu injoignable. » | Star Citizen ne répond pas (fermé, perso pas apparu) |
| « Le jeu a refusé. » | le jeu a reçu l'action mais ne l'a pas faite (ex. portes en 5.0 PTU) |
| « Appli fermée. » | l'appli web SC Telemetry Deck n'est pas lancée |

## Tests

```powershell
dotnet test examples/voiceattack/ScTelemetryVoice.sln
```
