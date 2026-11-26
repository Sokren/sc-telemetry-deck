// Harnais des tests de l'appli web : vrai serveur HTTP sur un port libre, faux jeu gRPC, réglages temporaires.
import type { AccessStore } from "../../src/web/access.js";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { ActionSource, readSnapshot } from "../../src/catalog/source.js";
import { GameClient } from "../../src/game/client.js";
import { loadSchema } from "../../src/game/schema.js";
import { streamSchemaTree } from "../../src/game/schema-tree.js";
import type { GameApi } from "../../src/game/types.js";
import { TelemetryHub } from "../../src/telemetry/hub.js";
import { createApp, type AppDeps } from "../../src/web/app.js";
import { loadSettings } from "../../src/web/config.js";
import { DESC_PATH, startFakeGame, type FakeHandlers } from "../game/fake-server.js";

export const OPENAPI = JSON.parse(fs.readFileSync(new URL("../../src/web/openapi.json", import.meta.url), "utf-8"));
const SNAPSHOT = fileURLToPath(new URL("../../schema/actions.json", import.meta.url));

export type TestServer = {
	url: string;
	token: string;
	deps: AppDeps;
	/** Routes déclarées par l'appli (méthode + chemin au format OpenAPI). */
	routes: { method: string; path: string; public?: boolean }[];
	/** Jetons externes et de plugin de l'appli de test. */
	access: AccessStore;
	close(): Promise<void>;
	/** Requête JSON ; `auth: false` pour ne pas envoyer le jeton, `auth: "bad"` pour un mauvais jeton. */
	call(method: string, p: string, opts?: { body?: unknown; auth?: boolean | "bad"; headers?: Record<string, string> }): Promise<{ status: number; body: any; headers: Headers }>;
};

/** Démarre l'appli contre un faux jeu (ou un jeu injoignable si `game` vaut `null`). */
export async function startTestServer(opts: { game?: FakeHandlers | null; extra?: Partial<AppDeps> } = {}): Promise<TestServer> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sc-web-"));
	const settings = loadSettings(dir);
	const fake = opts.game === null ? undefined : await startFakeGame(opts.game ?? {});
	const game: GameApi = new GameClient(loadSchema(fileURLToPath(DESC_PATH)), fake ? `127.0.0.1:${fake.port}` : "127.0.0.1:1");
	const hub = new TelemetryHub(game);
	const deps: AppDeps = {
		settings,
		version: "0.0.0-test",
		schemaVersion: "test",
		game,
		hub,
		source: new ActionSource(game, () => readSnapshot(SNAPSHOT)),
		viewFile: path.join(dir, "view.json"),
		debugSchema: streamSchemaTree(loadSchema(fileURLToPath(DESC_PATH))),
		// Jamais d'appel à GitHub pendant les tests.
		latestRelease: async () => ({ version: "0.0.0-test", url: "https://example.invalid/release", publishedAt: null }),
		// Dossier de plugins vide par défaut : toutes les routes du contrat existent, rien n'est lancé.
		plugins: { dir: path.join(dir, "plugins"), finder: { node: () => process.execPath, python: () => undefined }, openFolder: () => {} },
		...opts.extra,
	};
	// Les plugins de test appellent l'API de ce serveur (port connu seulement après l'écoute).
	let url = "";
	if (deps.plugins && !deps.plugins.apiUrl) deps.plugins = { ...deps.plugins, apiUrl: () => url };
	const app = createApp(deps);
	const server = http.createServer(app.handler);
	await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
	url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
	return {
		url,
		token: settings.token,
		deps,
		routes: app.routes,
		access: app.access,
		async close() {
			await app.plugins?.close();
			app.close?.();
			server.closeAllConnections();
			await new Promise<void>((r) => server.close(() => r()));
			game.close();
			await fake?.stop();
			fs.rmSync(dir, { recursive: true, force: true });
		},
		async call(method, p, o = {}) {
			const headers: Record<string, string> = { ...(o.headers ?? {}) };
			if (o.auth !== false) headers.authorization = `Bearer ${o.auth === "bad" ? "faux-jeton" : settings.token}`;
			if (o.body !== undefined) headers["content-type"] = "application/json";
			const res = await fetch(url + p, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
			const text = await res.text();
			let body: unknown = text;
			try {
				body = text ? JSON.parse(text) : undefined;
			} catch {
				/* texte brut */
			}
			return { status: res.status, body, headers: res.headers };
		},
	};
}

const ajv = new Ajv2020({ strict: false, allErrors: true });
ajv.addSchema(OPENAPI, "openapi.json");
const escape = (s: string) => s.replace(/~/g, "~0").replace(/\//g, "~1");

/** Vérifie une réponse contre le schéma du contrat (chemin au format OpenAPI, ex. /api/v1/vitals/{id}). */
export function validateResponse(apiPath: string, method: string, status: number, body: unknown): void {
	const pointer = `openapi.json#/paths/${escape(apiPath)}/${method.toLowerCase()}/responses/${status}/content/application~1json/schema`;
	const validate = ajv.getSchema(pointer) ?? ajv.compile({ $ref: pointer });
	if (!validate(body)) throw new Error(`Réponse ${method} ${apiPath} ${status} hors contrat : ${ajv.errorsText(validate.errors)}`);
}
