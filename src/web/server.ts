// Point d'entrée de l'appli web autonome : `node dist-web/server.mjs`, ou `sc-telemetry-web.exe`.
// Indépendant du plugin Stream Deck.
import os from "node:os";
import path from "node:path";
import sea from "node:sea";
import { fileURLToPath } from "node:url";
import { defaultSettingsDir } from "./config.js";
import { prepareFiles } from "./sea.js";
import { startServer, VERSION } from "./server-core.js";

const isSea = sea.isSea();
const noOpen = process.argv.includes("--no-open");

const files = prepareFiles({
	isSea,
	scriptDir: isSea ? path.dirname(process.execPath) : path.dirname(fileURLToPath(import.meta.url)),
	exeDir: path.dirname(process.execPath),
	cacheDir: path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "SC Telemetry Deck", "app"),
	version: VERSION,
	getAsset: (key) => sea.getAsset(key),
});

// Plugins : dossier `plugins` à côté de l'exe ; appli portable ou développement : à côté du dossier de l'appli.
const pluginsDir = process.env.SCTD_PLUGINS_DIR || path.join(isSea ? path.dirname(process.execPath) : path.dirname(path.dirname(fileURLToPath(import.meta.url))), "plugins");

startServer({
	settingsDir: defaultSettingsDir(),
	...files,
	pluginsDir,
	isSea,
	openBrowser: !noOpen,
	log: (msg) => console.log(msg),
}).then(
	(server) => {
		console.log("Ctrl+C pour arrêter / Ctrl+C to stop");
		// Ctrl+C, Ctrl+Pause ou fenêtre fermée : arrêt propre (plugins compris) ; filet dans server-core sur « exit ».
		for (const signal of ["SIGINT", "SIGBREAK", "SIGHUP"] as const)
			process.once(signal, () => {
				void server.close().finally(() => process.exit(0));
			});
	},
	(err: NodeJS.ErrnoException) => {
		if (err.code === "EADDRINUSE") {
			console.error("Le port est déjà utilisé : l'appli tourne peut-être déjà. / Port already in use: the app may already be running.");
		} else console.error(err);
		// Exécutable lancé par double-clic : laisser le temps de lire le message avant que la fenêtre se ferme.
		setTimeout(() => process.exit(1), isSea ? 15_000 : 0);
	},
);
