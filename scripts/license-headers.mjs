// SPDX-License-Identifier: MPL-2.0
// Vérifie (ou ajoute avec --fix) la ligne SPDX en tête de chaque fichier de code. À lancer avant une release :
//   npm run license:check   /   npm run license:fix
// Hors des tests : un fork n'est pas obligé de garder ces en-têtes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CODE = /\.(ts|js|mjs|cjs|py|cs)$/;
const SKIP = new Set(["node_modules", "bin", "obj", "__pycache__"]);
const MARK = "SPDX-License-Identifier: MPL-2.0";

/** Fichiers de code du projet (hors tests, dépendances et fichiers construits). */
function codeFiles(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) return SKIP.has(e.name) ? [] : codeFiles(p);
		return CODE.test(e.name) ? [p] : [];
	});
}

const files = [
	...["src", "scripts", "tools", "examples"].flatMap((d) => codeFiles(path.join(root, d))),
	...fs.readdirSync(root).filter((f) => CODE.test(f)).map((f) => path.join(root, f)),
];
const missing = files.filter((f) => !fs.readFileSync(f, "utf-8").split(/\r?\n/, 3).some((l) => l.includes(MARK)));

if (process.argv.includes("--fix")) {
	for (const f of missing) {
		let text = fs.readFileSync(f, "utf-8");
		const bom = text.startsWith("﻿") ? "﻿" : "";
		text = text.slice(bom.length);
		const nl = text.includes("\r\n") ? "\r\n" : "\n";
		const line = `${f.endsWith(".py") ? "#" : "//"} ${MARK}${nl}`;
		const cut = text.startsWith("#!") ? text.indexOf("\n") + 1 : 0;
		fs.writeFileSync(f, bom + text.slice(0, cut) + line + text.slice(cut));
	}
	console.log(`En-tête ajouté / header added: ${missing.length} fichier(s) sur ${files.length}.`);
} else if (missing.length) {
	console.error(`Sans en-tête SPDX / missing SPDX header (${missing.length}) :`);
	for (const f of missing) console.error(`  ${path.relative(root, f)}`);
	console.error("Corriger / fix: npm run license:fix");
	process.exit(1);
} else console.log(`En-têtes SPDX OK : ${files.length} fichiers.`);
