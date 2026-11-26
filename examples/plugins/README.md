# Plugins — exemple / example

**FR** — Copie le dossier `bonjour-telemetrie` dans le dossier `plugins` à côté de l'appli web
(⚙ Options → Plugins → 📂 Ouvrir le dossier), puis **Rescanner** et **Activer…**.
Un plugin est un **programme** : il tourne avec tes droits sur ce PC. N'active que du code que tu peux lire,
d'une source que tu connais.

`plugin.json` :

| Champ | Rôle |
|---|---|
| `name`, `version`, `author`, `description` | affichés dans la fenêtre Plugins |
| `run.exec` | `node` ou `python` (avec un script du dossier en premier argument), ou un `.exe` du dossier — jamais une ligne de commande |
| `run.args` | arguments, un par case |
| `access` | `read`, `pilot` ou `pilot_full` (niveau le plus haut demandé ; le joueur peut en donner un plus bas) |
| `views` | droits demandés sur les vues : `read`, `edit`, `create` (facultatif) |
| `contract` | version minimale du contrat d'API |

Le plugin reçoit `SC_TELEMETRY_URL`, `SC_TELEMETRY_TOKEN` (en-tête `Authorization: Bearer …`),
`SC_TELEMETRY_PLUGIN_DIR` et `SC_TELEMETRY_DATA_DIR` (le seul dossier où un plugin Node peut écrire).

**EN** — Copy the `bonjour-telemetrie` folder into the `plugins` folder next to the web app
(⚙ Options → Plugins → 📂 Open the folder), then **Scan again** and **Enable…**.
A plugin is a **program**: it runs with your rights on this PC. Only enable code you can read, from a source you
know. The fields above are the same in English; the plugin gets the same four environment variables.
