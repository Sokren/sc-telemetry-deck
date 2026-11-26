import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ActionSource } from "../catalog/source.js";
import type { GameApi } from "../game/types.js";
import type { TelemetryHub } from "../telemetry/hub.js";
import type { WebSettings } from "./config.js";
import { createHandler, type Route } from "./http.js";
import { AccessStore } from "./access.js";
import { accessRoutes } from "./routes/access.js";
import { pluginRoutes } from "./routes/plugins.js";
import { PluginManager } from "./plugins/manager.js";
import type { ExecFinder } from "./plugins/manifest.js";
import { spawn } from "node:child_process";
import { isLoopback, LanManager } from "./lan.js";
import { MorseControl } from "./morse-control.js";
import { CountermeasureTracker } from "../display/countermeasures.js";
import { ActionCapability } from "./capability.js";
import { EventHub } from "./events.js";
import { DEFAULT_LAYOUT } from "./layout.js";
import { actionRoutes } from "./routes/actions.js";
import { lanRoutes } from "./routes/lan.js";
import { layoutRoutes } from "./routes/layout.js";
import { morseRoutes } from "./routes/morse.js";
import { panelRoutes } from "./routes/panels.js";
import { shipRoutes } from "./routes/ship.js";
import { telemetryRoutes } from "./routes/telemetry.js";
import { debugRoutes } from "./routes/debug.js";
import { DebugRecorder } from "./debug.js";
import { ActionLog, originOf } from "./action-log.js";
import { characterOf } from "./panels.js";
import { UpdateChecker, type LatestRelease } from "./update-check.js";
import { updateRoutes } from "./routes/update.js";
import type { SchemaField } from "../game/schema-tree.js";
import { viewsRoutes, visibleViews } from "./routes/view.js";
import { vitalRoutes } from "./routes/vitals.js";
import { ViewStore, type NamedView } from "./view.js";

/** Ce dont l'appli a besoin ; complété au fil des étapes. */
export type AppDeps = {
	settings: WebSettings;
	version: string;
	/** Version du jeu du schéma / de l'instantané embarqués. */
	schemaVersion: string;
	game: GameApi;
	hub: TelemetryHub;
	source: ActionSource;
	/** Dernière release publiée (par défaut : lue sur GitHub). */
	latestRelease?: () => Promise<LatestRelease>;
	/** Version comparée à la dernière release (par défaut `version` ; un test peut faire semblant d'être plus vieux). */
	updateVersion?: string;
	/** Sections et champs du schéma du jeu (mode debug : champs prévus mais pas envoyés) ; absent → inconnus. */
	debugSchema?: SchemaField[] | null;
	/** Le jeu accepte-t-il les actions ? (par défaut : vérifié sur `game` toutes les 30 s). */
	capability?: ActionCapability;
	/** Émission morse (par défaut : créée sur `game`). */
	morse?: MorseControl;
	/** Dossier de `swagger-ui-dist` (par défaut : résolu depuis node_modules). */
	swaggerDir?: string;
	/** Contrat OpenAPI (par défaut : `openapi.json` à côté de ce module). */
	openapi?: unknown;
	/** Fichier des vues « Ma vue » (`view.json`) ; absent → vues gardées en mémoire seulement. */
	viewFile?: string;
	/** Réécrit `settings.json` (par défaut : rien, réglages en mémoire). */
	saveSettings?: () => void;
	/** Accès réseau local (par défaut : sans effet, écoute gérée par le serveur réel). */
	lanFactory?: (settings: WebSettings, save: () => void) => LanManager;
	/** L'appel vient-il du PC ? (par défaut : adresse distante locale). */
	isLocal?: (req: IncomingMessage) => boolean;
	/**
	 * Plugins lancés par l'appli (dossier `plugins` à côté de l'exe) ; absent → pas de plugins. `apiUrl` : adresse
	 * donnée aux plugins (par défaut `http://127.0.0.1:<port des réglages>`) ; `openFolder` : explorateur Windows.
	 */
	plugins?: { dir: string; finder: ExecFinder; apiUrl?: () => string; openFolder?: (dir: string) => void };
	/** Fichiers statiques de la page (étape suivante). */
	fallback?: (req: IncomingMessage, res: ServerResponse) => boolean;
};

export type App = {
	routes: Route[];
	handler: ReturnType<typeof createHandler>;
	lan: LanManager;
	access: AccessStore;
	/** Lanceur de plugins (absent sans `deps.plugins`). */
	plugins?: PluginManager;
	close(): void;
};

const DOC_FILES: Record<string, string> = {
	"swagger-ui.css": "text/css; charset=utf-8",
	"swagger-ui-bundle.js": "text/javascript; charset=utf-8",
	"favicon-32x32.png": "image/png",
};

const DOCS_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>SC Telemetry Deck — API</title>
<link rel="icon" href="/api/docs/favicon-32x32.png" />
<link rel="stylesheet" href="/api/docs/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="/api/docs/swagger-ui-bundle.js"></script>
<script>
// Le jeton mémorisé par la page de l'appli (même origine) est repris automatiquement : pas besoin de « Authorize ».
const ui = SwaggerUIBundle({
	url: "/api/v1/openapi.json",
	dom_id: "#swagger-ui",
	persistAuthorization: true,
	// Barre de recherche : filtre les sections (General, Actions, Character, Ship…).
	filter: true,
	onComplete: () => {
		let token = null;
		try { token = localStorage.getItem("sctd-token"); } catch (e) { /* stockage indisponible */ }
		if (token) ui.preauthorizeApiKey("bearerAuth", token);
	},
});
</script>
</body>
</html>
`;

function defaultSwaggerDir(): string {
	const require = createRequire(import.meta.url);
	return path.dirname(require.resolve("swagger-ui-dist/package.json"));
}

function defaultOpenapi(): unknown {
	const here = path.dirname(fileURLToPath(import.meta.url));
	return JSON.parse(fs.readFileSync(path.join(here, "openapi.json"), "utf-8"));
}

/** Construit les routes de l'API publique v1 et le gestionnaire HTTP. */
/** Clé des flux d'événements ouverts avec le jeton mobile (jamais un id de jeton externe : ceux-ci n'ont pas de `:`). */
const MOBILE_STREAMS = "mobile:";

/** Routes d'administration : jeton admin seulement (le jeton mobile reçoit 403 `pc_only`). */
const adminOnly = (routes: Route[]): Route[] => routes.map((r) => ({ ...r, admin: true as const }));

export function createApp(deps: AppDeps): App {
	const openapi = deps.openapi ?? defaultOpenapi();
	const swaggerDir = deps.swaggerDir ?? defaultSwaggerDir();
	const morse = deps.morse ?? new MorseControl(deps.game);
	// Le flux du jeu reste ouvert tant que l'appli tourne (état toujours à jour pour l'API) ; il nourrit le suivi
	// des contre-mesures (plus grand stock vu par modèle de vaisseau), même sans page ouverte.
	const countermeasures = new CountermeasureTracker();
	const unsubscribe = deps.hub.subscribe(() =>
		countermeasures.observe({ weapons: deps.hub.section("weapons"), vehicle: deps.hub.section("vehicle"), actor: deps.hub.section("actor") }),
	);
	// Mode debug : cadence, derniers événements et enregistrement des frames brutes (lecture seule).
	const recorder = new DebugRecorder(deps.hub);
	// Journal des actions envoyées par la page et l'API (mode debug) ; le morse garde le client brut (trop bavard).
	const actionLog = new ActionLog();
	const loggedGame = actionLog.wrap(deps.game, () => {
		const c = characterOf(deps.hub.section("actor"), "en");
		return { locomotion: c.locomotion, crewRole: c.crewRole };
	});
	const layout = () => DEFAULT_LAYOUT;
	const capability = deps.capability ?? new ActionCapability(deps.game);
	const status = () => {
		const actor = deps.hub.section("actor");
		const live = actor !== undefined || deps.hub.section("vehicle") !== undefined;
		return {
			app: "sc-telemetry-web",
			version: deps.version,
			telemetry: live ? "live" : "no_data",
			character: actor ? "spawned" : "unknown",
			schema: deps.schemaVersion,
			actions: capability.value,
		};
	};
	const save = deps.saveSettings ?? (() => {});
	// Nouvelle version de l'appli : au démarrage puis chaque jour (désactivable), ou à la demande.
	const updates = new UpdateChecker({
		current: deps.updateVersion ?? deps.version,
		latest: deps.latestRelease,
		auto: () => deps.settings.updateCheck !== false,
		setAuto: (on) => {
			if (on) delete deps.settings.updateCheck;
			else deps.settings.updateCheck = false;
			save();
		},
	});
	updates.start();
	const lan = deps.lanFactory?.(deps.settings, save) ?? new LanManager({ settings: deps.settings, save, listen: async () => true, cards: () => [] });
	const views = new ViewStore(deps.viewFile);
	// Jetons externes (empreintes dans settings.json) ; « sur le PC » = même règle que les routes du réseau local.
	const access = new AccessStore(deps.settings, save);
	const isLocal = deps.isLocal ?? ((req: IncomingMessage) => isLoopback(req.socket.remoteAddress));
	const events = new EventHub({ hub: deps.hub, game: deps.game, morse, layout, status, countermeasures, views: (lang) => ({ views: views.list(lang) }) });
	const contract = String((openapi as { info?: { version?: unknown } }).info?.version ?? "0.0.0");
	const plugins = deps.plugins
		? new PluginManager({
				dir: deps.plugins.dir,
				settings: deps.settings,
				save,
				access,
				apiUrl: deps.plugins.apiUrl ?? (() => `http://127.0.0.1:${deps.settings.port}`),
				contract,
				finder: deps.plugins.finder,
				closeStreams: (id) => events.closeFor(id),
			})
		: undefined;
	const openFolder =
		deps.plugins?.openFolder ??
		((dir: string) => {
			fs.mkdirSync(dir, { recursive: true });
			spawn("explorer.exe", [dir], { detached: true, stdio: "ignore", windowsHide: false }).unref();
		});
	// Vue enregistrée (depuis n'importe quel appareil) → renvoyée à toutes les pages connectées.
	const stopView = views.onChange(() => events.refresh());
	// Changement de capacité (jeu relancé dans une autre version) → état renvoyé aux pages connectées.
	const stopCapability = capability.onChange(() => events.refresh());
	capability.start();

	const routes: Route[] = [
		{
			method: "GET",
			path: "/api/v1/status",
			access: "read",
			handle: async () => ({ status: 200, json: status() }),
		},
		{
			method: "GET",
			path: "/api/v1/events",
			access: "read",
			handle: async ({ req, res, lang, caller }) => {
				// Vues dans le flux : selon les droits de l'appelant (aucune pour un jeton externe).
				const see = caller.kind === "external" ? (all: unknown) => ({ views: visibleViews(caller, (all as { views: NamedView[] }).views) }) : undefined;
				const none = caller.kind === "external" && visibleViews(caller, []) === null;
				// Flux marqué par jeton : un jeton externe (révocation) ou le jeton mobile (« Nouveau jeton »).
				const tokenId = caller.kind === "external" ? caller.token.id : caller.kind === "mobile" ? MOBILE_STREAMS : undefined;
				events.connect(req, res, lang, tokenId, none ? null : see);
				return { stream: true };
			},
		},
		...actionRoutes({ ...deps, game: loggedGame }),
		...vitalRoutes(deps),
		...telemetryRoutes(deps),
		...debugRoutes({ hub: deps.hub, recorder, actionLog, schema: deps.debugSchema ?? null, version: deps.version, schemaVersion: deps.schemaVersion }),
		...shipRoutes({ ...deps, game: loggedGame }),
		...panelRoutes({ hub: deps.hub, countermeasures }),
		...morseRoutes({ morse }),
		...updateRoutes({ updates }),
		...adminOnly(accessRoutes({ store: access, isLocal, closeStreams: (id) => events.closeFor(id) })),
		...adminOnly(plugins ? pluginRoutes({ plugins, access, isLocal, openFolder }) : []),
		...viewsRoutes({ views, version: deps.version }),
		...adminOnly(
			lanRoutes({
				lan,
				isLocal,
				remotes: () => events.remotes(),
				onToken: () => events.closeFor(MOBILE_STREAMS),
			}),
		),
		...layoutRoutes({ hub: deps.hub, game: loggedGame, morse, layout, onFeedback: (i, f) => events.feedback(i, f) }),
		{ method: "GET", path: "/api/v1/openapi.json", public: true, handle: async () => ({ status: 200, json: openapi }) },
		{
			method: "GET",
			path: "/api/docs",
			public: true,
			handle: async () => ({ status: 200, text: DOCS_PAGE, contentType: "text/html; charset=utf-8" }),
		},
		{
			method: "GET",
			path: "/api/docs/{file}",
			public: true,
			handle: async ({ params }) => {
				const type = DOC_FILES[params.file];
				if (!type) return { status: 404, json: { error: "not_found" } };
				return { status: 200, data: fs.readFileSync(path.join(swaggerDir, params.file)), contentType: type };
			},
		},
	];

	// Chaque requête garde son origine (en-tête de la page) pour le journal des actions.
	const tracked: Route[] = routes.map((r) => ({ ...r, handle: (ctx) => actionLog.run(originOf(ctx.req), () => r.handle(ctx)) }));

	return {
		routes: tracked,
		lan,
		access,
		...(plugins ? { plugins } : {}),
		handler: createHandler(tracked, { main: () => deps.settings.token, mobile: () => deps.settings.mobileToken, store: access, isLocal }, deps.fallback),
		close: () => {
			// Filet : le serveur attend déjà `plugins.close()` avant ; ici, au cas où.
			void plugins?.close();
			stopCapability();
			stopView();
			lan.stop();
			capability.stop();
			events.close();
			recorder.close();
			updates.stop();
			unsubscribe();
		},
	};
}
