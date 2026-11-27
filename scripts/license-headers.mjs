// SPDX-License-Identifier: MPL-2.0
// Contrôle de licence, à lancer avant une release (après les builds) — pas un test : il ne s'impose à personne
// d'autre. npm run license:check / npm run license:fix (ajoute les lignes manquantes).
// - Le cœur est sous MPL 2.0 : chaque fichier de code porte `SPDX-License-Identifier: MPL-2.0`.
// - Les exemples (`examples/`) sont sous MIT, pour être copiés librement : ligne `SPDX-License-Identifier: MIT`,
//   un LICENSE dans chaque exemple, aucune ligne MPL et aucun import qui sort de l'exemple.
// - Chaque livrable construit contient THIRD_PARTY_NOTICES.txt, et chaque dépendance de production y figure.
// Rappel MPL §3.4 : qui reprend un fichier du cœur garde son en-tête ; ses fichiers neufs sont son affaire.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CODE = /\.(ts|js|mjs|cjs|py|cs)$/;
const SKIP = new Set(["node_modules", "bin", "obj", "__pycache__"]);
const EXAMPLES = ["examples/plugins/bonjour-telemetrie", "examples/voiceattack"];
const DELIVERABLES = [
	{ bundle: "com.sokren.sc-telemetry.sdPlugin/bin/plugin.js", notices: "com.sokren.sc-telemetry.sdPlugin/bin/THIRD_PARTY_NOTICES.txt" },
	{ bundle: "dist-web/server.mjs", notices: "dist-web/THIRD_PARTY_NOTICES.txt" },
];
const rel = (f) => path.relative(root, f).split(path.sep).join("/");
const isExample = (f) => rel(f).startsWith("examples/");

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
const expected = (f) => (isExample(f) ? "MIT" : "MPL-2.0");
const head = (f) => fs.readFileSync(f, "utf-8").split(/\r?\n/, 3);
const missing = files.filter((f) => !head(f).some((l) => l.includes(`SPDX-License-Identifier: ${expected(f)}`)));

if (process.argv.includes("--fix")) {
	for (const f of missing) {
		let text = fs.readFileSync(f, "utf-8");
		const bom = text.startsWith("﻿") ? "﻿" : "";
		text = text.slice(bom.length);
		const nl = text.includes("\r\n") ? "\r\n" : "\n";
		const line = `${f.endsWith(".py") ? "#" : "//"} SPDX-License-Identifier: ${expected(f)}${nl}`;
		// Une ligne SPDX d'une autre licence est remplacée, jamais doublée.
		const lines = text.split(nl);
		const i = lines.slice(0, 3).findIndex((l) => l.includes("SPDX-License-Identifier:"));
		if (i >= 0) lines[i] = line.slice(0, -nl.length);
		else lines.splice(text.startsWith("#!") ? 1 : 0, 0, line.slice(0, -nl.length));
		fs.writeFileSync(f, bom + lines.join(nl));
	}
	console.log(`En-tête corrigé / header fixed: ${missing.length} fichier(s) sur ${files.length}.`);
	process.exit(0);
}

const problems = missing.map((f) => `${rel(f)} : en-tête SPDX ${expected(f)} manquant / missing`);

// Exemples : entièrement MIT, autonomes.
for (const dir of EXAMPLES) if (!fs.existsSync(path.join(root, dir, "LICENSE"))) problems.push(`${dir}/LICENSE manquant / missing`);
for (const f of files.filter(isExample)) {
	const text = fs.readFileSync(f, "utf-8");
	if (text.includes("MPL-2.0")) problems.push(`${rel(f)} : mention MPL-2.0 dans un exemple / in an example`);
	const base = EXAMPLES.find((d) => rel(f).startsWith(`${d}/`));
	for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)) {
		const target = rel(path.resolve(path.dirname(f), m[1]));
		if (!base || !target.startsWith(`${base}/`)) problems.push(`${rel(f)} : import hors de l'exemple / import outside the example (${m[1]})`);
	}
}

// Livrables construits : avis des logiciels tiers présents et complets.
const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8")).dependencies ?? {});
const built = DELIVERABLES.filter((d) => fs.existsSync(path.join(root, d.bundle)));
if (!built.length) problems.push("aucun livrable construit : lancer npm run build et npm run build:web d'abord / build first");
const noticeTexts = [];
for (const d of built) {
	const file = path.join(root, d.notices);
	if (!fs.existsSync(file)) problems.push(`${d.notices} manquant / missing`);
	else noticeTexts.push(fs.readFileSync(file, "utf-8"));
}
if (built.length === DELIVERABLES.length)
	for (const dep of deps)
		if (!noticeTexts.some((t) => t.includes(`\n${dep} `))) problems.push(`${dep} absent de THIRD_PARTY_NOTICES / missing from the notices`);

if (problems.length) {
	console.error(`Contrôle de licence / license check : ${problems.length} problème(s)`);
	for (const p of problems) console.error(`  ${p}`);
	console.error("En-têtes / headers : npm run license:fix");
	process.exit(1);
}
console.log(`Licence OK : ${files.length} fichiers, ${built.length} livrables avec leurs avis tiers / third-party notices.`);
