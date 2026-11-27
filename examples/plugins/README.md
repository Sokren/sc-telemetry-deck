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
| `access` | `read`, `pilot` ou `pilot_full` (niveau le plus haut demandé ; le joueur peut en donner un plus bas, et `pilot_full` n'est jamais coché d'office) |
| `views` | droits demandés sur les vues : `read`, `edit`, `create` (facultatif) |
| `contract` | version minimale du contrat d'API |

Le plugin reçoit `SC_TELEMETRY_URL`, `SC_TELEMETRY_TOKEN` (en-tête `Authorization: Bearer …`),
`SC_TELEMETRY_PLUGIN_DIR` et `SC_TELEMETRY_DATA_DIR` (le seul dossier où un plugin Node peut écrire).
Pour savoir ce qui lui est accordé, il appelle `GET /api/v1/access/me` et lit `can` (ex. `can["actions.spaceship_power"]`),
jamais le nom du niveau ; il ignore les clés qu'il ne connaît pas.

**EN** — Copy the `bonjour-telemetrie` folder into the `plugins` folder next to the web app
(⚙ Options → Plugins → 📂 Open the folder), then **Scan again** and **Enable…**.
A plugin is a **program**: it runs with your rights on this PC. Only enable code you can read, from a source you
know. The fields above are the same in English (`pilot_full` is never checked by default); the plugin gets the same
four environment variables. To learn what it was granted, it calls `GET /api/v1/access/me` and reads `can`
(e.g. `can["actions.spaceship_power"]`), never the level name; it ignores keys it does not know.

## Licence / License

**FR** — `bonjour-telemetrie` est sous [licence MIT](bonjour-telemetrie/LICENSE) : copiez-le comme point de départ,
même pour un plugin fermé, en gardant l'avis de copyright.

**EN** — `bonjour-telemetrie` is under the [MIT License](bonjour-telemetrie/LICENSE): copy it as a starting point,
even for a closed-source plugin, keeping the copyright notice.
