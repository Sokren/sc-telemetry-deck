SC Telemetry Web {{VERSION}} - portable version / version portable
===================================================================

EN
--
The same web app as sc-telemetry-web.exe, started with the official node.exe
(signed by the OpenJS Foundation), so Windows Smart App Control lets it run.

Start
1. Before extracting: right-click the zip > Properties > tick "Unblock" > OK.
2. Extract the whole folder (right-click > Extract All). Do not run it from inside the zip.
3. Double-click "SC Telemetry Web.cmd". The page opens in your browser;
   otherwise, open the address shown in the black window ("page :" line).
4. Close the black window to stop the app.

If Windows Smart App Control still blocks it
- Right-click "SC Telemetry Web.cmd" > Properties > tick "Unblock" > OK,
  then double-click it again.
- Or open a terminal in this folder (right-click in the folder > Open in Terminal)
  and type:
      .\runtime\node.exe app\server.mjs
- "Port already in use": the app is already running (the exe or another copy).
  Close it first.

After a game patch: replace sc_extrait.desc / actions.json in app\data\.


FR
--
La même appli web que sc-telemetry-web.exe, lancée avec le node.exe officiel
(signé par l'OpenJS Foundation) : Windows Smart App Control la laisse donc s'exécuter.

Lancement
1. Avant d'extraire : clic droit sur le zip > Propriétés > cocher « Débloquer » > OK.
2. Extrayez tout le dossier (clic droit > Extraire tout). Ne lancez pas depuis l'intérieur du zip.
3. Double-cliquez sur « SC Telemetry Web.cmd ». La page s'ouvre dans votre navigateur ;
   sinon, ouvrez l'adresse affichée dans la fenêtre noire (ligne « page : »).
4. Fermez la fenêtre noire pour arrêter l'appli.

Si Windows Smart App Control bloque encore
- Clic droit sur « SC Telemetry Web.cmd » > Propriétés > cocher « Débloquer » > OK,
  puis double-cliquez de nouveau dessus.
- Ou ouvrez un terminal dans ce dossier (clic droit dans le dossier > Ouvrir dans le Terminal)
  et tapez :
      .\runtime\node.exe app\server.mjs
- « Le port est déjà utilisé » : l'appli tourne déjà (l'exe ou une autre copie).
  Fermez-la d'abord.

Après un patch du jeu : remplacez sc_extrait.desc / actions.json dans app\data\.
