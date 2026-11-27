// SPDX-License-Identifier: MPL-2.0
// Plugin rollup : écrit THIRD_PARTY_NOTICES.txt à côté du bundle, avec la licence de chaque paquet npm réellement
// embarqué (lu dans la liste des modules du bundle), plus des paquets copiés tels quels et des textes ajoutés
// (Node.js pour l'exe et le zip portable). MIT, BSD et Apache-2.0 demandent ces avis dans toute distribution.
import fs from "node:fs";
import path from "node:path";

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

/** Dossier racine du paquet npm qui contient `file` (le plus proche `node_modules/<nom>` ou `node_modules/@scope/<nom>`). */
export function packageRoot(file) {
	const parts = path.resolve(file).split(path.sep);
	const i = parts.lastIndexOf("node_modules");
	if (i < 0 || i + 1 >= parts.length) return undefined;
	const depth = parts[i + 1].startsWith("@") ? 3 : 2;
	return parts.slice(0, i + depth).join(path.sep);
}

/** Avis d'un paquet : nom, version, licence déclarée, et le texte de ses fichiers LICENSE / NOTICE. */
export function packageNotice(root) {
	const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));
	const files = fs.readdirSync(root).filter((f) => LICENSE_FILE.test(f)).sort();
	const license = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? "?");
	const texts = files.map((f) => fs.readFileSync(path.join(root, f), "utf-8").trim());
	if (!texts.length) {
		// Paquet sans fichier de licence : seul MIT est reconstitué (texte standard + copyright lu dans le code).
		if (license !== "MIT") throw new Error(`${pkg.name} : pas de fichier de licence (${license}) / no license file`);
		texts.push(mitText(copyrightOf(root, pkg)));
	}
	return { name: pkg.name, version: pkg.version, license, text: texts.join("\n\n") };
}

/** Ligne de copyright d'un paquet : en tête de son fichier principal, sinon son auteur. */
function copyrightOf(root, pkg) {
	const main = path.join(root, pkg.main ?? "index.js");
	const head = fs.existsSync(main) ? fs.readFileSync(main, "utf-8").split(/\r?\n/, 40).join("\n") : "";
	const line = /Copyright[^\n]*/.exec(head)?.[0].trim();
	const author = typeof pkg.author === "string" ? pkg.author : pkg.author?.name;
	if (line) return line;
	if (author) return `Copyright (c) ${author}`;
	throw new Error(`${pkg.name} : copyright introuvable / copyright not found`);
}

/** Texte standard de la licence MIT. */
function mitText(copyright) {
	return `MIT License

${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
}

/** Texte complet du fichier d'avis. */
export function renderNotices(notices, extras = []) {
	const rule = "=".repeat(78);
	const head = [
		"SC Telemetry Deck — third-party software / logiciels tiers",
		"",
		"This distribution includes the following third-party software, under their own licenses.",
		"Cette distribution contient les logiciels tiers suivants, sous leurs propres licences.",
		"SC Telemetry Deck itself / lui-même : Mozilla Public License 2.0 (https://github.com/Sokren/sc-telemetry-deck).",
	].join("\n");
	const blocks = [
		...notices.map((n) => `${rule}\n${n.name} ${n.version} — ${n.license}\n${rule}\n\n${n.text}`),
		...extras.map((e) => `${rule}\n${e.title}\n${rule}\n\n${fs.readFileSync(e.file, "utf-8").trim()}`),
	];
	return `${head}\n\n${blocks.join("\n\n")}\n`;
}

/**
 * @param {{ fileName?: string, packages?: string[], extras?: { title: string, file: string }[] }} [options]
 *   packages : paquets livrés sans passer par le bundle (copiés) ; extras : textes ajoutés tels quels.
 */
export function thirdPartyNotices(options = {}) {
	const { fileName = "THIRD_PARTY_NOTICES.txt", packages = [], extras = [] } = options;
	return {
		name: "third-party-notices",
		generateBundle() {
			const roots = new Set();
			for (const id of this.getModuleIds()) {
				const root = packageRoot(id.replace(/^\0/, "").split("?")[0]);
				if (root && fs.existsSync(path.join(root, "package.json"))) roots.add(root);
			}
			for (const name of packages) roots.add(path.resolve("node_modules", name));
			const notices = [...roots].map(packageNotice).sort((a, b) => a.name.localeCompare(b.name));
			this.emitFile({ type: "asset", fileName, source: renderNotices(notices, extras) });
		},
	};
}
