import fs from "node:fs";
import path from "node:path";
import type { ExecFinder } from "./manifest.js";

/**
 * Exécutable `name` trouvé dans le PATH (Windows : `.exe` seulement, lancé sans shell ; les alias du Microsoft Store
 * dans `WindowsApps` sont ignorés : ce ne sont pas de vrais programmes).
 */
export function findInPath(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
	const raw = env.PATH ?? env.Path ?? "";
	const ext = process.platform === "win32" ? ".exe" : "";
	for (const dir of raw.split(path.delimiter)) {
		// Entrée vide ou relative : résolue depuis le dossier courant de l'appli, où n'importe qui peut poser un exe.
		if (!dir || !path.isAbsolute(dir) || /[\\/]WindowsApps[\\/]?$/i.test(dir)) continue;
		const file = path.join(dir, name + ext);
		try {
			if (fs.statSync(file).isFile()) return file;
		} catch {
			/* absent ici */
		}
	}
	return undefined;
}

/**
 * Interpréteurs des plugins : `node` = le node qui fait tourner l'appli (appli portable, développement) ; dans l'exe
 * (Node SEA, qui ne peut pas servir de node) : celui du PATH. `python` : `python`, sinon `py`, dans le PATH.
 */
export function defaultFinder(isSea: boolean): ExecFinder {
	return {
		node: () => (isSea ? findInPath("node") : process.execPath),
		python: () => findInPath("python") ?? findInPath("py"),
	};
}
