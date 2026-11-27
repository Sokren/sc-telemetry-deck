SC Telemetry Voice {{VERSION}} - VoiceAttack 2 plugin / plugin VoiceAttack 2
=========================================================================

EN
--
Fly Star Citizen by voice with VoiceAttack 2, through the SC Telemetry Deck web app:
orders ("gear down", "lights"...), spoken replies ("Landing gear: deployed.")
and alerts (shields, hull, fuel, health, thirst...).

You need: VoiceAttack 2 (the demo is enough), the SC Telemetry Deck web app
{{VERSION}} or later running on the same PC, Star Citizen 5.0 or later.

Install
1. Before extracting: right-click the zip > Properties > tick "Unblock" > OK.
2. Copy the "ScTelemetryVoice" folder into %APPDATA%\VoiceAttack2\Apps\
   (paste %APPDATA%\VoiceAttack2\Apps in the File Explorer address bar).
3. In the web app: Options > External access > new token, name "VoiceAttack",
   level "Pilot" (never "Full pilot"). Copy it: it is shown only once.
4. In %APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\, copy sctd-voice.example.json
   as sctd-voice.json, paste your token into "token", and set "lang" to "en".
5. VoiceAttack: Options > tick "Enable Plugin Support", restart VoiceAttack.
   The log shows "SC Telemetry Deck – Voice : prêt / ready".
6. Edit your profile > Import Commands > a file from the "profiles" folder:
   - SC-Telemetry-Voice-EN.vap: full, 61 commands (paid VoiceAttack);
   - SC-Telemetry-Voice-EN-demo.vap: 20 commands for the VoiceAttack demo.
   Only the checked commands are imported. With the demo (20 commands at most),
   delete the profile's sample commands first.

Demo phrases
  gear down / gear up          VTOL            decoupled        nav mode
  power on                     lights          night vision     quantum jump
  fuel   shields   health   thirst   ship status
Alerts (automatic): shields, hull, fuel, health, thirst, game lost.

Alert thresholds (%): "alerts" in sctd-voice.json, then restart VoiceAttack.
  shields 25, hull 50, hydrogen 20, oxygen 25, health 30, thirst 25 (defaults)

All phrases, your own commands, variables, source code:
  https://github.com/Sokren/sc-telemetry-deck/tree/main/examples/voiceattack


FR
--
Pilotez Star Citizen à la voix avec VoiceAttack 2, via l'appli web SC Telemetry Deck :
ordres (« sors le train », « phares »...), réponses dites (« Train : sorti. »)
et alertes (boucliers, coque, carburant, santé, soif...).

Il faut : VoiceAttack 2 (la démo suffit), l'appli web SC Telemetry Deck {{VERSION}}
ou plus lancée sur le même PC, Star Citizen 5.0 ou plus.

Installation
1. Avant d'extraire : clic droit sur le zip > Propriétés > cocher « Débloquer » > OK.
2. Copiez le dossier « ScTelemetryVoice » dans %APPDATA%\VoiceAttack2\Apps\
   (collez %APPDATA%\VoiceAttack2\Apps dans la barre d'adresse de l'Explorateur).
3. Dans l'appli web : Options > Accès externes > nouveau jeton, nom « VoiceAttack »,
   niveau « Pilotage » (jamais « Pilotage complet »). Copiez-le : il n'est montré qu'une fois.
4. Dans %APPDATA%\VoiceAttack2\Apps\ScTelemetryVoice\, copiez sctd-voice.example.json
   sous le nom sctd-voice.json et collez votre jeton dans « token » (« lang » : « fr »).
5. VoiceAttack : Options > cocher « Enable Plugin Support », redémarrez VoiceAttack.
   Le journal affiche « SC Telemetry Deck – Voice : prêt / ready ».
6. Éditez votre profil > Import Commands > un fichier du dossier « profiles » :
   - SC-Telemetry-Voice-FR.vap : complet, 61 commandes (VoiceAttack payant) ;
   - SC-Telemetry-Voice-FR-demo.vap : 20 commandes pour la démo de VoiceAttack.
   Seules les commandes cochées sont importées. Avec la démo (20 commandes au maximum),
   supprimez d'abord les commandes d'exemple du profil.

Phrases de la démo
  sors le train / rentre le train    VTOL        découplé          mode navigation
  allume le vaisseau                 phares      vision nocturne   saut quantique
  carburant   boucliers   santé   soif   état du vaisseau
Alertes (automatiques) : boucliers, coque, carburant, santé, soif, jeu perdu.

Seuils d'alerte (%) : « alerts » dans sctd-voice.json, puis redémarrez VoiceAttack.
  shields 25, hull 50, hydrogen 20, oxygen 25, health 30, thirst 25 (par défaut)

Toutes les phrases, vos propres commandes, les variables, le code source :
  https://github.com/Sokren/sc-telemetry-deck/blob/main/examples/voiceattack/README.fr.md
