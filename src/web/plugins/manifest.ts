import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ACCESS_LEVELS, type AccessLevel } from "../access.js";

/**
 * Lecture d'un plugin : `plugins/<dossier>/plugin.json` décrit un programme séparé que l'appli lance **sans shell**.
 * L'exécutable est `node` (avec un script du dossier), `python` (idem) ou un `.exe` du dossier ; tout chemin qui sort
 * du dossier (`..`, chemin absolu, lien) est refusé avec une raison.
 */

export const VIEW_RIGHTS = ["read", "edit", "create"] as const;
export type ViewRight = (typeof VIEW_RIGHTS)[number];

export type PluginManifest = {
	name: string;
	version: string;
	author?: string;
	description?: string;
	access: AccessLevel;
	/** Droits demandés sur les vues. */
	views?: ViewRight[];
	/** Version minimale du contrat d'API. */
	contract?: string;
};

/** Commande à lancer : exécutable, script du dossier (node, python) et arguments, jamais une ligne de commande. */
export type PluginCommand = { kind: "node" | "python"; file: string; script: string; args: string[] } | { kind: "file"; file: string; args: string[] };

export type PluginRead = { ok: true; id: string; manifest: PluginManifest; command: PluginCommand } | { ok: false; id: string; reason: PluginInvalidReason };

export type PluginInvalidReason =
	| "folder_name"
	| "manifest_unreadable"
	| "manifest_invalid"
	| "exec_invalid"
	| "exec_outside"
	| "exec_type"
	| "exec_missing"
	| "script_missing"
	| "script_outside"
	| "node_missing"
	| "python_missing"
	| "contract_too_new"
	| "path_invalid";

/** Où trouver les interpréteurs (le node de l'appli, ou ceux du PATH). */
export type ExecFinder = { node: () => string | undefined; python: () => string | undefined };

export const PLUGIN_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Nom de dossier valable : `PLUGIN_ID`, et pas un nom réservé de JavaScript (`__proto__`, `constructor`, `toString`…)
 * qui, utilisé comme clé des réglages, changerait l'objet au lieu d'y ajouter une entrée.
 */
export function validPluginId(id: string): boolean {
	return PLUGIN_ID.test(id) && id !== "__proto__" && !(id in Object.prototype);
}
const VERSION = /^[0-9A-Za-z.+-]{1,20}$/;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;
/** Caractères d'une ligne de commande : jamais dans `exec` (le lancement se fait sans shell, mais on refuse net). */
const SHELL_CHARS = /[&|;<>^"%`$\n\r\0]/;
const MAX_ARGS = 20;
const MAX_ARG = 200;
const MAX_FILES = 5000;
const MAX_BYTES = 100 * 1024 * 1024;

const obj = (x: unknown): Record<string, unknown> | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined);
const text = (x: unknown, max: number): string | undefined => {
	if (typeof x !== "string") return undefined;
	const t = x.trim();
	return t && [...t].length <= max ? t : undefined;
};

/** `a` est-il au moins `b` (versions x.y.z) ? */
export function versionAtLeast(a: string, b: string): boolean {
	const x = SEMVER.exec(a);
	const y = SEMVER.exec(b);
	if (!x || !y) return false;
	for (let i = 1; i <= 3; i++) if (Number(x[i]) !== Number(y[i])) return Number(x[i]) > Number(y[i]);
	return true;
}

/**
 * Chemin réel de `rel` s'il reste dans `dir` (liens résolus) ; `"outside"` sinon ; `"missing"` s'il n'existe pas ;
 * `"invalid"` pour un flux NTFS (`main.mjs:cache`, invisible pour l'empreinte) ou un fichier de `data/` (le plugin
 * y écrit : il pourrait changer son propre code sans changer l'empreinte).
 */
function inside(dir: string, rel: string): string | "outside" | "missing" | "invalid" {
	if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return "outside";
	if (rel.includes(":")) return "invalid";
	const target = path.resolve(dir, rel);
	const within = (p: string) => {
		const r = path.relative(dir, p);
		return r !== "" && !r.startsWith("..") && !path.isAbsolute(r);
	};
	if (!within(target)) return "outside";
	let real: string;
	try {
		real = fs.realpathSync(target);
	} catch {
		return "missing";
	}
	if (!within(real) || !fs.statSync(real).isFile()) return within(real) ? "missing" : "outside";
	if (path.relative(dir, real).split(path.sep)[0].toLowerCase() === "data") return "invalid";
	return real;
}

function parseManifest(raw: unknown, contract: string): PluginManifest | "manifest_invalid" | "contract_too_new" {
	const o = obj(raw);
	if (!o) return "manifest_invalid";
	const name = text(o.name, 40);
	const version = typeof o.version === "string" && VERSION.test(o.version) ? o.version : undefined;
	const access = (ACCESS_LEVELS as readonly unknown[]).includes(o.access) ? (o.access as AccessLevel) : undefined;
	if (!name || !version || !access) return "manifest_invalid";
	const m: PluginManifest = { name, version, access };
	if (o.author !== undefined) {
		const author = text(o.author, 40);
		if (!author) return "manifest_invalid";
		m.author = author;
	}
	if (o.description !== undefined) {
		const description = text(o.description, 200);
		if (!description) return "manifest_invalid";
		m.description = description;
	}
	if (o.views !== undefined) {
		if (!Array.isArray(o.views) || !o.views.every((v) => (VIEW_RIGHTS as readonly unknown[]).includes(v))) return "manifest_invalid";
		m.views = [...new Set(o.views as ViewRight[])];
	}
	if (o.contract !== undefined) {
		if (typeof o.contract !== "string" || !SEMVER.test(o.contract)) return "manifest_invalid";
		if (!versionAtLeast(contract, o.contract)) return "contract_too_new";
		m.contract = o.contract;
	}
	return m;
}

/** Lit et vérifie un plugin (manifeste, commande) sans rien lancer. */
export function readPlugin(dir: string, opts: { finder: ExecFinder; contract: string }): PluginRead {
	const id = path.basename(dir);
	if (!validPluginId(id)) return { ok: false, id, reason: "folder_name" };
	let raw: unknown;
	try {
		raw = JSON.parse(fs.readFileSync(path.join(dir, "plugin.json"), "utf-8"));
	} catch {
		return { ok: false, id, reason: "manifest_unreadable" };
	}
	const manifest = parseManifest(raw, opts.contract);
	if (typeof manifest === "string") return { ok: false, id, reason: manifest };
	const run = obj(obj(raw)?.run);
	const exec = run?.exec;
	const args = run?.args ?? [];
	if (typeof exec !== "string" || !exec.trim() || !Array.isArray(args) || args.length > MAX_ARGS) return { ok: false, id, reason: "manifest_invalid" };
	if (!args.every((a): a is string => typeof a === "string" && a.length <= MAX_ARG && !a.includes("\0"))) return { ok: false, id, reason: "manifest_invalid" };
	if (SHELL_CHARS.test(exec)) return { ok: false, id, reason: "exec_invalid" };

	const root = fs.realpathSync(dir);
	if (exec === "node" || exec === "python") {
		const first = args[0];
		if (first === undefined || first.startsWith("-")) return { ok: false, id, reason: "script_missing" };
		const script = inside(root, first);
		if (script === "outside") return { ok: false, id, reason: "script_outside" };
		if (script === "invalid") return { ok: false, id, reason: "path_invalid" };
		if (script === "missing") return { ok: false, id, reason: "script_missing" };
		const file = exec === "node" ? opts.finder.node() : opts.finder.python();
		if (!file) return { ok: false, id, reason: exec === "node" ? "node_missing" : "python_missing" };
		return { ok: true, id, manifest, command: { kind: exec, file, script, args: args.slice(1) } };
	}
	if (path.isAbsolute(exec) || /^[A-Za-z]:/.test(exec) || path.relative(root, path.resolve(root, exec)).startsWith("..")) return { ok: false, id, reason: "exec_outside" };
	if (exec.includes(":")) return { ok: false, id, reason: "path_invalid" };
	// Sans shell, Windows ne lance que des .exe (un .cmd ou .bat passerait par cmd.exe).
	if (process.platform === "win32" && path.extname(exec).toLowerCase() !== ".exe") return { ok: false, id, reason: "exec_type" };
	const file = inside(root, exec);
	if (file === "outside") return { ok: false, id, reason: "exec_outside" };
	if (file === "invalid") return { ok: false, id, reason: "path_invalid" };
	if (file === "missing") return { ok: false, id, reason: "exec_missing" };
	return { ok: true, id, manifest, command: { kind: "file", file, args } };
}

/**
 * Empreinte SHA-256 de tous les fichiers du plugin (chemins + contenus), hors dossier `data/` (où le plugin écrit).
 * Un lien (symbolique, jonction) dans le dossier est refusé : il pourrait faire changer le code sans changer l'empreinte.
 */
export function fingerprint(dir: string): { hash: string; files: number } | { error: "symlink" | "too_big" | "unreadable" } {
	const entries: string[] = [];
	let bytes = 0;
	const walk = (rel: string): "symlink" | "too_big" | undefined => {
		for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
			const r = rel ? `${rel}/${e.name}` : e.name;
			if (!rel && e.name === "data" && e.isDirectory()) continue;
			if (e.isSymbolicLink()) return "symlink";
			if (e.isDirectory()) {
				const bad = walk(r);
				if (bad) return bad;
			} else if (e.isFile()) {
				const content = fs.readFileSync(path.join(dir, r));
				bytes += content.length;
				if (entries.length >= MAX_FILES || bytes > MAX_BYTES) return "too_big";
				entries.push(`${r}\0${crypto.createHash("sha256").update(content).digest("hex")}`);
			}
		}
		return undefined;
	};
	try {
		const bad = walk("");
		if (bad) return { error: bad };
	} catch {
		return { error: "unreadable" };
	}
	entries.sort();
	return { hash: crypto.createHash("sha256").update(entries.join("\n")).digest("hex"), files: entries.length };
}
