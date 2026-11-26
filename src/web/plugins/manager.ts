import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ACCESS_LEVELS, type AccessStore, type PluginGrant, type ViewGrant } from "../access.js";
import type { WebSettings } from "../config.js";
import { fingerprint, readPlugin, validPluginId, type ExecFinder, type PluginManifest, type PluginRead } from "./manifest.js";

/**
 * Lanceur de plugins : chaque plugin est un programme séparé, lancé **sans shell** dans son dossier, avec un
 * environnement minimal et un jeton éphémère (`SC_TELEMETRY_TOKEN`) au niveau accordé par le joueur. Un plugin
 * nouveau ou modifié ne se lance jamais seul. Un plugin Node est lancé avec le modèle de permissions de Node : il ne
 * lit que son dossier et n'écrit que dans `data/`.
 */

/** Ce que le joueur a accordé, gardé dans `settings.json` (`plugins`). */
export type SavedPlugin = { enabled: boolean; hash: string; grant: PluginGrant };

export type PluginState = "new" | "running" | "stopped" | "disabled" | "failed" | "changed" | "invalid";
export type OutputLine = { at: string; stream: "out" | "err" | "app"; text: string };

export type PluginInfo = {
	id: string;
	state: PluginState;
	/** Raison d'un plugin invalide (manifeste, commande, empreinte). */
	reason?: string;
	manifest?: PluginManifest;
	/** Commande telle qu'elle sera lancée (affichage). */
	command?: string;
	/** `node` : fichiers protégés (il ne lit que son dossier) ; `none` : aucune protection. */
	protection?: "node" | "none";
	hash?: string;
	files?: number;
	grant?: PluginGrant;
	pid?: number;
	/** Sorties en erreur dans la dernière minute. */
	crashes?: number;
	startedAt?: string;
};

const HASH = /^[0-9a-f]{64}$/;
const VIEW_ID = /^[A-Za-z0-9_-]{1,32}$/;
const MAX_OUTPUT = 200;
const MAX_LINE = 500;
const CRASH_WINDOW_MS = 60_000;
const MAX_CRASHES = 3;
/** Variables reprises de l'environnement de l'appli (le reste n'est pas transmis). */
const KEPT_ENV = ["PATH", "SYSTEMROOT", "TEMP", "TMP", "PATHEXT", "COMSPEC", "WINDIR"];

const obj = (x: unknown): Record<string, unknown> | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined);

function parseViewGrant(x: unknown): ViewGrant | undefined {
	const o = obj(x);
	if (!o || typeof o.read !== "boolean" || typeof o.create !== "boolean") return undefined;
	const edit = o.edit === false || o.edit === "all" ? o.edit : Array.isArray(o.edit) && o.edit.length <= 10 && o.edit.every((v) => typeof v === "string" && VIEW_ID.test(v)) ? [...new Set(o.edit as string[])] : undefined;
	return edit === undefined ? undefined : { read: o.read, edit, create: o.create };
}

/** Droits accordés (corps d'activation ou réglages) ; `undefined` s'ils sont mal formés. */
export function parseGrant(x: unknown): PluginGrant | undefined {
	const o = obj(x);
	const views = parseViewGrant(o?.views);
	if (!o || !(ACCESS_LEVELS as readonly unknown[]).includes(o.level) || !views) return undefined;
	return { level: o.level as PluginGrant["level"], views };
}

/** Plugins enregistrés dans `settings.json` ; une entrée invalide est ignorée. */
export function parseSavedPlugins(raw: unknown): Record<string, SavedPlugin> {
	const o = obj(raw);
	const out: Record<string, SavedPlugin> = {};
	if (!o) return out;
	for (const [id, v] of Object.entries(o)) {
		const p = obj(v);
		const grant = parseGrant(p?.grant);
		if (!validPluginId(id) || !p || typeof p.enabled !== "boolean" || typeof p.hash !== "string" || !HASH.test(p.hash) || !grant) continue;
		out[id] = { enabled: p.enabled, hash: p.hash, grant };
	}
	return out;
}

/** Tue un processus et tous ses descendants (Windows : `taskkill /T /F`). */
export function killTree(pid: number): Promise<void> {
	if (process.platform !== "win32") {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			/* déjà terminé */
		}
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		const k = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
		k.on("close", () => resolve());
		k.on("error", () => resolve());
	});
}

type Entry = {
	read: PluginRead;
	fp: { hash: string; files: number } | { error: string };
	proc?: ChildProcess;
	exited?: Promise<void>;
	/** État quand le plugin est activé et pas en marche. */
	run: "stopped" | "failed";
	intentional: boolean;
	crashes: number[];
	output: OutputLine[];
	restart?: ReturnType<typeof setTimeout>;
	startedAt?: string;
};

export type PluginManagerOptions = {
	dir: string;
	settings: WebSettings;
	save: () => void;
	access: AccessStore;
	/** Adresse de l'API donnée aux plugins. */
	apiUrl: () => string;
	/** Version du contrat d'API de l'appli. */
	contract: string;
	finder: ExecFinder;
	/** Flux d'événements à fermer quand le jeton d'un plugin est révoqué. */
	closeStreams?: (tokenId: string) => void;
	/** Attente avant de relancer un plugin sorti en erreur (2 s par défaut). */
	restartDelayMs?: number;
	/** Langue de l'appli, transmise au plugin (`SC_TELEMETRY_LANG`). */
	lang?: () => string;
};

export class PluginManager {
	readonly #entries = new Map<string, Entry>();

	constructor(private readonly o: PluginManagerOptions) {}

	get dir(): string {
		return this.o.dir;
	}

	#saved(id: string): SavedPlugin | undefined {
		const all = this.o.settings.plugins;
		return all && Object.hasOwn(all, id) ? all[id] : undefined;
	}

	#readOne(id: string): Entry {
		const dir = path.join(this.o.dir, id);
		const read = readPlugin(dir, { finder: this.o.finder, contract: this.o.contract });
		const fp = read.ok ? fingerprint(dir) : { error: read.reason };
		const prev = this.#entries.get(id);
		const entry: Entry = prev ? Object.assign(prev, { read, fp }) : { read, fp, run: "stopped", intentional: false, crashes: [], output: [] };
		this.#entries.set(id, entry);
		return entry;
	}

	/** Relit le dossier des plugins (sans rien lancer) ; un plugin en marche dont un fichier a changé est arrêté. */
	scan(): void {
		let names: string[] = [];
		try {
			names = fs
				.readdirSync(this.o.dir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name);
		} catch {
			/* dossier absent : aucun plugin */
		}
		for (const id of [...this.#entries.keys()]) if (!names.includes(id)) void this.stop(id).then(() => this.#entries.delete(id));
		for (const id of names) {
			const e = this.#readOne(id);
			if (e.proc && this.#fileState(id, e) !== "ok") {
				this.#line(e, "app", "Fichiers modifiés ou invalides : plugin arrêté. / Files changed or invalid: plugin stopped.");
				void this.stop(id);
			}
		}
	}

	/** Ce que disent les fichiers et les réglages : lançable (`ok`) ou non, et pourquoi. */
	#fileState(id: string, e: Entry): "invalid" | "new" | "changed" | "ok" {
		if (!e.read.ok || "error" in e.fp) return "invalid";
		const saved = this.#saved(id);
		if (!saved) return "new";
		return saved.hash === e.fp.hash ? "ok" : "changed";
	}

	/** Un processus en marche se voit toujours (pour pouvoir l'arrêter), quoi que disent ses fichiers. */
	#state(id: string, e: Entry): PluginState {
		if (e.proc) return "running";
		const files = this.#fileState(id, e);
		if (files !== "ok") return files;
		if (!this.#saved(id)?.enabled) return "disabled";
		return e.run;
	}

	#info(id: string, e: Entry): PluginInfo {
		const state = this.#state(id, e);
		const info: PluginInfo = { id, state };
		if (!e.read.ok) return { ...info, reason: e.read.reason, ...(e.proc?.pid ? { pid: e.proc.pid, startedAt: e.startedAt } : {}) };
		const root = path.join(this.o.dir, id);
		const rel = (f: string) => path.relative(fs.existsSync(root) ? fs.realpathSync(root) : root, f).split(path.sep).join("/");
		const c = e.read.command;
		info.manifest = e.read.manifest;
		info.command = [c.kind === "file" ? rel(c.file) : c.kind, ...(c.kind === "file" ? [] : [rel(c.script)]), ...c.args].join(" ");
		info.protection = c.kind === "node" ? "node" : "none";
		if ("error" in e.fp) info.reason = e.fp.error;
		else Object.assign(info, { hash: e.fp.hash, files: e.fp.files });
		const saved = this.#saved(id);
		if (saved) info.grant = saved.grant;
		if (e.proc?.pid) Object.assign(info, { pid: e.proc.pid, startedAt: e.startedAt });
		const recent = e.crashes.filter((t) => Date.now() - t < CRASH_WINDOW_MS).length;
		if (recent) info.crashes = recent;
		return info;
	}

	list(): PluginInfo[] {
		return [...this.#entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, e]) => this.#info(id, e));
	}

	get(id: string): PluginInfo | undefined {
		const e = this.#entries.get(id);
		return e && this.#info(id, e);
	}

	output(id: string): OutputLine[] {
		return [...(this.#entries.get(id)?.output ?? [])];
	}

	/**
	 * Le joueur active le plugin après avoir vu ce qu'il demande : `hash` doit être l'empreinte qu'il a vue (sinon le
	 * plugin a changé entre-temps), les droits jamais au-dessus de ce que le manifeste demande. Lancé aussitôt.
	 */
	enable(id: string, input: { hash: unknown; grant: unknown }): PluginInfo | "unknown" | "invalid" | "hash_mismatch" {
		if (!this.#entries.has(id)) return "unknown";
		const e = this.#readOne(id);
		if (!e.read.ok || "error" in e.fp) return "invalid";
		if (input.hash !== e.fp.hash) return "hash_mismatch";
		const grant = parseGrant(input.grant);
		if (!grant) return "invalid";
		const m = e.read.manifest;
		const asked = new Set(m.views ?? []);
		if (ACCESS_LEVELS.indexOf(grant.level) > ACCESS_LEVELS.indexOf(m.access)) return "invalid";
		if ((grant.views.read && !asked.has("read")) || (grant.views.edit !== false && !asked.has("edit")) || (grant.views.create && !asked.has("create"))) return "invalid";
		this.o.settings.plugins = { ...this.o.settings.plugins, [id]: { enabled: true, hash: e.fp.hash, grant } };
		this.o.save();
		e.crashes = [];
		// Déjà en marche : les nouveaux droits s'appliquent tout de suite à son jeton (un niveau baissé compte aussitôt).
		if (e.proc) this.o.access.regrantPlugin(id, grant);
		else this.#launch(id, e);
		return this.#info(id, e);
	}

	/** Lance un plugin activé (après un arrêt ou un échec). */
	async start(id: string): Promise<PluginInfo | "unknown" | "not_enabled" | "changed" | "invalid"> {
		if (!this.#entries.has(id)) return "unknown";
		const e = this.#readOne(id);
		const state = this.#state(id, e);
		if (state === "invalid") return "invalid";
		if (state === "changed") return "changed";
		if (state === "new" || state === "disabled") return "not_enabled";
		if (!e.proc) {
			e.crashes = [];
			this.#launch(id, e);
		}
		return this.#info(id, e);
	}

	/** Arrête le processus (et ses enfants) et révoque son jeton ; il reste activé (relancé au prochain démarrage). */
	async stop(id: string): Promise<PluginInfo | "unknown"> {
		const e = this.#entries.get(id);
		if (!e) return "unknown";
		clearTimeout(e.restart);
		e.restart = undefined;
		if (e.proc) {
			e.intentional = true;
			const exited = e.exited;
			// Processus déjà sorti : son numéro a pu être donné à un autre programme, ne rien tuer.
			if (e.proc.pid && e.proc.exitCode === null && e.proc.signalCode === null) await killTree(e.proc.pid);
			await Promise.race([exited, new Promise((r) => setTimeout(r, 5000))]);
		}
		this.#revoke(id);
		if (e.run !== "failed") e.run = "stopped";
		return this.#info(id, e);
	}

	async restart(id: string): Promise<PluginInfo | "unknown" | "not_enabled" | "changed" | "invalid"> {
		const r = await this.stop(id);
		if (r === "unknown") return r;
		return this.start(id);
	}

	/** Arrête le plugin et ne le lance plus. */
	async disable(id: string): Promise<PluginInfo | "unknown"> {
		const r = await this.stop(id);
		if (r === "unknown") return r;
		const saved = this.#saved(id);
		if (saved) {
			this.o.settings.plugins = { ...this.o.settings.plugins, [id]: { ...saved, enabled: false } };
			this.o.save();
		}
		return this.get(id) ?? "unknown";
	}

	/** Démarrage de l'appli : relit le dossier et lance les plugins activés dont les fichiers n'ont pas changé. */
	async startEnabled(): Promise<void> {
		this.scan();
		for (const [id, e] of this.#entries) {
			if (this.#state(id, e) !== "stopped" || e.proc) continue;
			e.crashes = [];
			this.#launch(id, e);
		}
	}

	/** Fermeture de l'appli : tous les plugins arrêtés. */
	async close(): Promise<void> {
		await Promise.all([...this.#entries.keys()].map((id) => this.stop(id)));
	}

	#revoke(id: string): void {
		this.o.access.revokePlugin(id);
		this.o.closeStreams?.(`plugin:${id}`);
	}

	#line(e: Entry, stream: OutputLine["stream"], text: string): void {
		e.output.push({ at: new Date().toISOString(), stream, text: text.length > MAX_LINE ? `${text.slice(0, MAX_LINE)}…` : text });
		if (e.output.length > MAX_OUTPUT) e.output.splice(0, e.output.length - MAX_OUTPUT);
	}

	/**
	 * Fermeture brutale de l'appli (`process.on("exit")`, Ctrl+C, fenêtre fermée) : tue tout de suite, sans attendre.
	 */
	killAllSync(): void {
		for (const [id, e] of this.#entries) {
			const pid = e.proc?.pid;
			clearTimeout(e.restart);
			if (!pid || e.proc?.exitCode !== null || e.proc?.signalCode !== null) continue;
			e.intentional = true;
			if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
			else {
				try {
					process.kill(pid, "SIGKILL");
				} catch {
					/* déjà terminé */
				}
			}
			this.o.access.revokePlugin(id);
		}
	}

	#launch(id: string, e: Entry): void {
		clearTimeout(e.restart);
		e.restart = undefined;
		// Fichiers relus juste avant chaque lancement (relance après plantage comprise) : un plugin qui a changé
		// son propre code ne repart pas sans nouvelle confirmation.
		this.#readOne(id);
		if (this.#fileState(id, e) !== "ok") {
			this.#line(e, "app", "Fichiers modifiés ou invalides : pas lancé. / Files changed or invalid: not started.");
			return;
		}
		if (!e.read.ok || "error" in e.fp) return;
		const saved = this.#saved(id);
		if (!saved) return;
		const root = fs.realpathSync(path.join(this.o.dir, id));
		const dataDir = path.join(root, "data");
		fs.mkdirSync(dataDir, { recursive: true });
		const token = this.o.access.issuePlugin(id, e.read.manifest.name, saved.grant);
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(process.env)) if (v !== undefined && KEPT_ENV.includes(k.toUpperCase())) env[k] = v;
		Object.assign(env, {
			SC_TELEMETRY_URL: this.o.apiUrl(),
			SC_TELEMETRY_TOKEN: token,
			SC_TELEMETRY_PLUGIN_DIR: root,
			SC_TELEMETRY_DATA_DIR: dataDir,
			...(this.o.lang ? { SC_TELEMETRY_LANG: this.o.lang() } : {}),
		});
		const c = e.read.command;
		const argv =
			c.kind === "node"
				? ["--permission", `--allow-fs-read=${root}`, `--allow-fs-write=${dataDir}`, c.script, ...c.args]
				: c.kind === "python"
					? [c.script, ...c.args]
					: c.args;
		e.intentional = false;
		e.startedAt = new Date().toISOString();
		let proc: ChildProcess;
		try {
			proc = spawn(c.file, argv, { cwd: root, env, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
		} catch (err) {
			this.#line(e, "app", `Lancement impossible / Cannot start: ${(err as Error).message}`);
			this.#revoke(id);
			this.#crashed(id, e);
			return;
		}
		e.proc = proc;
		this.#line(e, "app", `Lancé / Started (pid ${proc.pid ?? "?"})`);
		for (const [stream, src] of [["out", proc.stdout], ["err", proc.stderr]] as const) {
			let buf = "";
			src?.setEncoding("utf-8");
			src?.on("data", (chunk: string) => {
				buf += chunk;
				let i: number;
				while ((i = buf.indexOf("\n")) >= 0) {
					this.#line(e, stream, buf.slice(0, i).replace(/\r$/, ""));
					buf = buf.slice(i + 1);
				}
				if (buf.length > MAX_LINE * 4) {
					this.#line(e, stream, buf);
					buf = "";
				}
			});
			src?.on("end", () => {
				if (buf) this.#line(e, stream, buf);
				buf = "";
			});
		}
		e.exited = new Promise<void>((resolve) => {
			let done = false;
			const finish = (code: number | null, error?: Error) => {
				if (done) return;
				done = true;
				if (e.proc === proc) e.proc = undefined;
				this.#revoke(id);
				if (error) this.#line(e, "app", `Erreur / Error: ${error.message}`);
				if (e.intentional) {
					this.#line(e, "app", "Arrêté / Stopped");
					e.run = "stopped";
				} else if (code === 0 && !error) {
					this.#line(e, "app", "Terminé / Finished (code 0)");
					e.run = "stopped";
				} else {
					this.#line(e, "app", `Sorti en erreur / Exited with an error (code ${code ?? "?"})`);
					this.#crashed(id, e);
				}
				resolve();
			};
			proc.on("error", (err) => finish(null, err));
			proc.on("close", (code) => finish(code));
		});
	}

	#crashed(id: string, e: Entry): void {
		const now = Date.now();
		e.crashes = [...e.crashes.filter((t) => now - t < CRASH_WINDOW_MS), now];
		if (e.crashes.length >= MAX_CRASHES) {
			e.run = "failed";
			this.#line(e, "app", "En échec : 3 erreurs en 1 minute, plus relancé. / Failed: 3 errors in 1 minute, not restarted.");
			return;
		}
		e.run = "stopped";
		e.restart = setTimeout(() => {
			e.restart = undefined;
			if (!e.proc && this.#state(id, e) === "stopped") this.#launch(id, e);
		}, this.o.restartDelayMs ?? 2000);
	}
}
