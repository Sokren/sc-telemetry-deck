# Exemple VoiceAttack 2 — piloter Star Citizen à la voix

*[English](README.md)*

Un plugin **VoiceAttack 2** (DLL C#, open source) et des **profils d'exemple** en français et en anglais qui passent par l'appli web
SC Telemetry Deck pour :

- **donner des ordres** à la voix : « sors le train », « phares », « VTOL »… ;
- **avoir une réponse** : VoiceAttack dit « Train : sorti. », « Train : déjà sorti. », « Ce vaisseau n'en a pas. » ;
- **être prévenu** tout seul : « boucliers bas », « carburant faible », « oxygène faible », « soif »…

C'est un **exemple** : lis le code (une centaine de lignes par fichier), adapte les phrases, ajoute tes commandes.

## Ce qu'il faut

- **VoiceAttack 2** (la démo suffit : 1 profil, 20 commandes au maximum).
- L'**appli web SC Telemetry Deck** 0.4.0 ou plus, lancée sur le même PC, avec Star Citizen (5.0 ou plus) en jeu.

## Installation

### 1. Récupérer le plugin

**Depuis une release** (le plus simple) : télécharge `sc-telemetry-voice-<version>.zip` dans les
[releases](https://github.com/Sokren/sc-telemetry-deck/releases). Avant d'extraire : clic droit sur le zip →
Propriétés → coche **Débloquer** → OK. Copie le dossier `ScTelemetryVoice` du zip dans
`%APPDATA%\VoiceAttack2\Apps\`. Le zip contient aussi les profils (`profiles`) et un `README.txt` FR / EN.

**Ou compile-le toi-même** (kit .NET 8 SDK : `winget install Microsoft.DotNet.SDK.8`) :

```powershell
dotnet build examples/voiceattack/ScTelemetryVoice/ScTelemetryVoice.csproj -c Release
```

puis copie `ScTelemetryVoice.dll` (dossier `ScTelemetryVoice\bin\Release\net8.0\`) et `sctd-voice.example.json`
dans `%APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\` (crée le dossier). `npm run build:voiceattack` fabrique le
même zip que la release dans `dist\`.

### 2. Créer un jeton

Dans l'appli web : ⚙ Options → **Accès externes** → nouveau jeton, nom `VoiceAttack`, niveau **Pilotage**.
Copie-le : il n'est montré qu'une fois. Le niveau Pilotage refuse l'éjection, l'autodestruction et le
déverrouillage du vaisseau : une phrase mal comprise ne peut pas les déclencher.
**N'utilise pas « Pilotage complet » pour VoiceAttack.**

### 3. Régler le plugin

Dans `%APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\`, copie `sctd-voice.example.json` sous le nom
**`sctd-voice.json`** et ouvre-le :

| Réglage | Valeur |
|---|---|
| `token` | ton jeton |
| `lang` | `fr` ou `en` : la langue des réponses (prends celle de ton profil) |
| `url` | à changer seulement si tu as modifié le port de l'appli (`http://127.0.0.1:8743`) |
| `alerts` | les seuils d'alerte en % (voir [Alertes](#alertes)) |

### 4. Activer le plugin dans VoiceAttack

⚙ Options → coche **Enable Plugin Support**, puis redémarre VoiceAttack. Le journal doit afficher
`SC Telemetry Deck – Voice : prêt / ready`. Après chaque changement de `sctd-voice.json`, redémarre VoiceAttack.

### 5. Importer les commandes

Édite ton profil → **Import Commands** → un fichier du dossier `profiles`. VoiceAttack affiche la liste :
**seules les commandes cochées sont importées**.

| Fichier | Contenu |
|---|---|
| `SC-Telemetry-Voice-FR.vap` / `-EN.vap` | **complet** : 61 commandes en français / en anglais (version payante de VoiceAttack) |
| `SC-Telemetry-Voice-FR-demo.vap` / `-EN-demo.vap` | **pour la démo** : une sélection de 20 commandes (★ ci-dessous) |

La **démo** de VoiceAttack garde 20 commandes au maximum : au-delà, les dernières disparaissent. Supprime d'abord
les commandes d'exemple de ton profil, puis importe le fichier démo, ou choisis toi-même tes 20 commandes en
cochant celles que tu veux dans le profil complet.

## Commandes vocales

★ = dans le profil démo.

**Vol**

| Tu dis | In English | Effet |
|---|---|---|
| ★ sors le train | gear down / deploy landing gear | sort le train (rien s'il est déjà sorti) |
| ★ rentre le train | gear up / retract landing gear | rentre le train |
| ★ VTOL | VTOL | bascule le VTOL |
| ★ découplé | decoupled | bascule le mode découplé |
| G safe | G safe | bascule le G-safe |
| assistance de proximité | proximity assist | bascule l'assistance de proximité |
| ESP | ESP | bascule l'ESP |
| HUD avancé | advanced HUD | bascule le HUD avancé |
| ★ mode navigation | nav mode | mode principal NAV |
| mode combat | combat mode | mode principal SCM |
| demande d'atterrissage | request landing | demande d'atterrissage |
| demande d'amarrage | request docking | demande d'amarrage |
| prêt au vol | flight ready | prêt au vol |

**Énergie**

| Tu dis | In English | Effet |
|---|---|---|
| ★ allume le vaisseau | power on | allume le vaisseau (l'éteindre est protégé) |
| énergie moteurs | engine power | bascule l'alimentation des moteurs |
| énergie armes | weapon power | bascule l'alimentation des armes |
| énergie boucliers | shield power | bascule l'alimentation des boucliers |

**Lumières**

| Tu dis | In English | Effet |
|---|---|---|
| ★ phares | lights | bascule les phares |
| ★ vision nocturne | night vision | bascule la vision nocturne |
| lampe torche | flashlight | bascule la lampe torche |

**Quantique, radar, modes du siège**

| Tu dis | In English | Effet |
|---|---|---|
| ★ saut quantique | quantum jump | engage le saut quantique |
| ping radar | radar ping | ping radar |
| héler la cible | hail target | hèle la cible |
| mode quantique / scan / minage | quantum / scan / mining mode | mode du siège |
| mode récupération / ravitaillement / armes | salvage / refuel / guns mode | mode du siège |
| tourelle un / deux / trois | turret one / two / three | prend la tourelle à distance |

**Personnage et émotes**

| Tu dis | In English | Effet |
|---|---|---|
| mobiGlas | mobiGlas | ouvre le mobiGlas |
| carte stellaire | star map | ouvre la carte stellaire |
| essuie la visière | wipe visor | essuie la visière |
| salue, fais coucou, danse, applaudis | salute, wave, dance, clap | émote |
| rigole, hourra, montre du doigt, assieds-toi | laugh, cheer, point, sit down | émote |

**Questions** (VoiceAttack dit la valeur, ex. « Soif : 35 %. »)

| Tu dis | In English | Réponse |
|---|---|---|
| ★ carburant | fuel | hydrogène en % |
| carburant quantique | quantum fuel | carburant quantique en % |
| ★ boucliers | shields | boucliers en % |
| coque | hull | coque en % |
| ★ santé | health | santé en % |
| oxygène | oxygen | oxygène en % |
| ★ soif | thirst | soif en % |
| ★ état du vaisseau | ship status | nom du vaisseau, boucliers et coque |

**Portes**

| Tu dis | In English | Effet |
|---|---|---|
| ferme les portes | close the doors | refusé par le jeu en 5.0 PTU (« Le jeu a refusé. ») ; marchera quand le jeu les branchera |
| verrouille les portes | lock the doors | idem |

Pas d'éjection, d'autodestruction, de sortie d'urgence, d'extinction ni d'ouverture ou de déverrouillage des
portes : le niveau Pilotage les refuse.

## Alertes

Sans rien dire, VoiceAttack prévient quand une valeur passe sous son seuil. Les seuils se règlent dans
`sctd-voice.json` (bloc `alerts`, en %), puis redémarre VoiceAttack ; une clé absente garde sa valeur par défaut.

| Alerte | Clé | Seuil par défaut | Démo |
|---|---|---|---|
| Boucliers | `shields` | 25 % | ★ |
| Coque | `hull` | 50 % | ★ |
| Carburant (hydrogène) | `hydrogen` | 20 % | ★ |
| Oxygène | `oxygen` | 25 % | |
| Santé | `health` | 30 % | ★ |
| Soif | `thirst` | 25 % | ★ |
| Jeu perdu / connecté | — | quand le jeu cesse / recommence d'envoyer des données | ★ (perdu) |

```json
"alerts": { "shields": 25, "hull": 50, "hydrogen": 20, "oxygen": 25, "health": 30, "thirst": 25 }
```

Chaque alerte ne parle qu'une fois : elle se réarme quand la valeur remonte de 10 points au-dessus du seuil, et
jamais deux fois en 30 s. Les alertes vaisseau se taisent hors du vaisseau. Pour couper une alerte, supprime sa
commande du profil.

Les profils sont générés par `profiles/make-vap.mjs` (`node examples/voiceattack/profiles/make-vap.mjs`). Pour
ajouter une langue ou une commande, modifie ses tableaux `LANGS` et `COMMANDS`, puis relance-le.

## Écrire tes propres commandes

Les noms techniques (contextes, variables, commandes d'alerte) sont en anglais et les mêmes dans toutes les
langues : seuls les phrases à dire et les textes prononcés changent.

Une commande ajoute l'action **Execute an External Plugin Function** (plugin *SC Telemetry Deck – Voice*,
case *Wait for the plugin function to finish* cochée) avec un **contexte** :

| Contexte | Effet |
|---|---|
| `function:<id>` | bascule une fonction vaisseau (`toggle`) |
| `function:<id>:on` / `:off` | l'allume / l'éteint (rien si c'est déjà fait) |
| `action:<nom>` | n'importe quelle action du jeu, ex. `action:v_lights_on` (liste : ⚙ Options → Debug, ou `GET /api/v1/actions`) |
| `say:<clé>` | met la valeur dans `SCTD_reply` : `shields`, `hull`, `hydrogen`, `quantum`, `health`, `oxygen`, `thirst` |

Fonctions vaisseau (`<id>`) : `gear`, `lights`, `vtol`, `decoupled`, `gsafe`, `cruise`, `proximity`, `esp`,
`advanced_hud`, `night_vision`, `master_nav`, `power_engines`, `power_weapons`, `power_shields`, `power_main`,
`doors_closed`, `doors_locked`.

Ensuite, une action **Say Something** avec `{TXT:SCTD_reply}` dit la réponse.

Variables mises à jour par le plugin :

| Variable | Contenu |
|---|---|
| `{TXT:SCTD_reply}` | phrase de réponse du dernier ordre |
| `{TXT:SCTD_result}` | `sent`, `noop` (déjà fait), `refused` (le vaisseau n'a pas la fonction), `protected` (action protégée), `error` |
| `{TXT:SCTD_game}` | `live` (le jeu envoie des données) ou `no_data` |
| `{BOOL:SCTD_in_ship}`, `{TXT:SCTD_ship}` | assis dans un vaisseau, son nom |
| `{INT:SCTD_shields}`, `{INT:SCTD_hull}`, `{INT:SCTD_hydrogen}`, `{INT:SCTD_quantum}` | % (vide si inconnu) |
| `{INT:SCTD_health}`, `{INT:SCTD_oxygen}`, `{INT:SCTD_thirst}` | % du personnage (santé, oxygène, soif) |
| `{TXT:SCTD_gear}` | mot d'état du train (SORTI, RENTRÉ…) |

Les alertes lancent les commandes `((SCTD alert shields))`, `((SCTD alert hull))`,
`((SCTD alert fuel))`, `((SCTD alert oxygen))`, `((SCTD alert health))`, `((SCTD alert thirst))`, `((SCTD connected))` et
`((SCTD game lost))` **si elles existent** dans le profil (mêmes noms dans toutes les langues) : change le texte
qu'elles disent, ou supprime celles que tu ne veux pas, mais garde leur nom.

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
