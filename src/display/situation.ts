import type { Lang } from "../catalog/labels.js";

/**
 * Données ajoutées par le schéma 5.0 PTU build 13273298 : saut quantique, mode, lieu, CrimeStat, mission suivie, état
 * du jeu et performances. Lues ici une seule fois pour l'appli web et les touches. Pas encore vues dans le flux réel
 * (ce build n'ouvre pas l'API locale) : tout est lu avec tolérance, et rien n'est déduit d'une section absente.
 */

type Obj = Record<string, unknown>;
const obj = (x: unknown): Obj | undefined => (x && typeof x === "object" && !Array.isArray(x) ? (x as Obj) : undefined);
/** Champ scalaire d'un message présent : absent = 0 (proto3 ne transmet pas les zéros). */
const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : 0);
/** Champ `optional` : absent = inconnu. Les entiers 64 bits arrivent parfois en texte. */
const opt = (x: unknown): number | null => (x === undefined || x === null ? null : typeof x === "number" || typeof x === "string" ? (Number.isFinite(Number(x)) ? Number(x) : null) : null);
const text = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x.trim() : null);
const ratio = (x: unknown): number => Math.min(100, Math.max(0, num(x) * 100));

const fixed = (n: number, decimals: number, lang: Lang): string => {
	const s = n.toFixed(decimals);
	return lang === "fr" ? s.replace(".", ",") : s;
};

const LABELS = {
	fr: {
		qt: { off: "Éteint", idle: "Prêt", aligning: "Alignement", traveling: "En saut", cooldown: "Refroidissement", unknown: "—" },
		mode: {
			inactive: "Inactif",
			flight: "Vol",
			combat: "Combat",
			turret: "Tourelle",
			missile: "Missile",
			scanning: "Scan",
			mining: "Minage",
			quantum_navigation: "Navigation quantique",
			refuel: "Ravitaillement",
			salvage: "Récupération",
			unknown: "—",
		},
		game: { front_end: "Menu principal", loading: "Chargement", in_game: "En jeu", unknown: "—" },
	},
	en: {
		qt: { off: "Off", idle: "Ready", aligning: "Aligning", traveling: "Traveling", cooldown: "Cooldown", unknown: "—" },
		mode: {
			inactive: "Inactive",
			flight: "Flight",
			combat: "Combat",
			turret: "Turret",
			missile: "Missile",
			scanning: "Scanning",
			mining: "Mining",
			quantum_navigation: "Quantum navigation",
			refuel: "Refuel",
			salvage: "Salvage",
			unknown: "—",
		},
		game: { front_end: "Main menu", loading: "Loading", in_game: "In game", unknown: "—" },
	},
} as const;

// ---------- Formats ----------

/** Distance lisible : 850 m, 12,4 km, 3,2 Mm, 38,4 Gm (un chiffre après la virgule sous 100). */
export function distanceText(meters: number, lang: Lang): string {
	const m = Math.max(0, meters);
	const steps: [number, string][] = [
		[1e9, "Gm"],
		[1e6, "Mm"],
		[1e3, "km"],
	];
	for (const [size, unit] of steps) {
		if (m >= size) {
			const v = m / size;
			return `${fixed(v, v < 100 ? 1 : 0, lang)} ${unit}`;
		}
	}
	return `${Math.round(m)} m`;
}

/** Durée longue : 45 s, 1 min 24 s, 1 h 12 min. */
export function durationText(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	if (s < 60) return `${s} s`;
	if (s < 3600) return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
	return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")} min`;
}

/** Durée courte (touche) : 0:45, 1:24, 1:12:05. */
export function clockText(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const two = (n: number) => String(n).padStart(2, "0");
	if (s < 3600) return `${Math.floor(s / 60)}:${two(s % 60)}`;
	return `${Math.floor(s / 3600)}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

// ---------- Saut quantique ----------

export const QT_STATES = ["off", "idle", "aligning", "traveling", "cooldown", "unknown"] as const;
export type QtState = (typeof QT_STATES)[number];
const QT: Record<string, QtState> = {
	QUANTUM_TRAVEL_STATE_OFF: "off",
	QUANTUM_TRAVEL_STATE_IDLE: "idle",
	QUANTUM_TRAVEL_STATE_ALIGNING: "aligning",
	QUANTUM_TRAVEL_STATE_TRAVELING: "traveling",
	QUANTUM_TRAVEL_STATE_COOLDOWN: "cooldown",
};

export type Quantum = {
	state: QtState;
	label: string;
	/** Charge du moteur quantique, 0–100. */
	spool: number;
	/** Calibrage vers la destination, 0–100. */
	calibration: number;
	destination: string | null;
	etaSeconds: number | null;
	/** « 1 min 24 s », « — » si inconnu. */
	etaText: string;
	distanceM: number | null;
	/** « 12,7 Gm », « — » si inconnue. */
	distanceText: string;
};

/**
 * Saut quantique (`vehicle.state.quantum_travel`). `null` hors vaisseau (perso pas assis, comme les autres valeurs du
 * vaisseau) ou quand le jeu ne l'envoie pas.
 */
export function readQuantum(vehicle: Obj | undefined, actor: Obj | undefined, lang: Lang): Quantum | null {
	const seated = !actor || obj(actor.state)?.locomotion === "ACTOR_LOCOMOTION_STATE_SEATED";
	const q = seated ? obj(obj(vehicle?.state)?.quantum_travel) : undefined;
	if (!q) return null;
	const state = QT[String(q.state)] ?? "unknown";
	const eta = opt(q.eta_seconds);
	const distance = opt(q.remaining_distance_m);
	const dest = obj(q.destination);
	return {
		state,
		label: LABELS[lang].qt[state],
		spool: ratio(q.spool_ratio),
		calibration: ratio(q.calibration_ratio),
		destination: text(dest?.display_name) ?? text(dest?.id),
		etaSeconds: eta,
		etaText: eta === null ? "—" : durationText(eta),
		distanceM: distance,
		distanceText: distance === null ? "—" : distanceText(distance, lang),
	};
}

// ---------- Perso : mode, lieu, CrimeStat, mission ----------

export const OPERATOR_MODES = ["inactive", "flight", "combat", "turret", "missile", "scanning", "mining", "quantum_navigation", "refuel", "salvage"] as const;
export type OperatorMode = (typeof OPERATOR_MODES)[number] | "unknown";
const MODES: Record<string, OperatorMode> = {
	ACTOR_OPERATOR_MODE_INACTIVE: "inactive",
	ACTOR_OPERATOR_MODE_FLIGHT: "flight",
	ACTOR_OPERATOR_MODE_COMBAT: "combat",
	ACTOR_OPERATOR_MODE_TURRET: "turret",
	ACTOR_OPERATOR_MODE_MISSILE: "missile",
	ACTOR_OPERATOR_MODE_SCANNING: "scanning",
	ACTOR_OPERATOR_MODE_MINING: "mining",
	ACTOR_OPERATOR_MODE_QUANTUM_NAVIGATION: "quantum_navigation",
	ACTOR_OPERATOR_MODE_REFUEL: "refuel",
	ACTOR_OPERATOR_MODE_SALVAGE: "salvage",
};

export type Mission = {
	title: string;
	giver: string | null;
	objective: string | null;
	done: number;
	total: number;
	/** Fin de la mission (ms depuis 1970), `null` sans limite. */
	endsAt: number | null;
};

export type Whereabouts = {
	playerName: string | null;
	mode: OperatorMode;
	modeLabel: string;
	/** Lieux du plus large au plus précis (système, planète, ville…). */
	location: string[];
	/** Lieu le plus précis. */
	place: string | null;
	jurisdiction: string | null;
	/** Zone d'armistice ; `null` quand le lieu n'est pas envoyé. */
	armistice: boolean | null;
	/** Niveau de CrimeStat ; `null` sans données du perso. */
	crimeStat: number | null;
	mission: Mission | null;
};

function mission(contract: Obj | undefined): Mission | null {
	const d = obj(contract?.details);
	if (!d) return null;
	const title = text(d.title);
	if (!title) return null;
	return {
		title,
		giver: text(d.giver_name),
		objective: text(obj(d.current_objective)?.text),
		done: num(d.objectives_completed),
		total: num(d.objectives_total),
		endsAt: opt(d.ends_at_unix_ms),
	};
}

/** Pseudo, mode, lieu, CrimeStat et mission suivie (`actor.state`). */
export function readWhereabouts(actor: Obj | undefined, lang: Lang): Whereabouts {
	const state = obj(actor?.state);
	const loc = obj(state?.location);
	const names = Array.isArray(loc?.hierarchy) ? loc.hierarchy.map((x) => text(obj(x)?.display_name) ?? text(obj(x)?.id)).filter((x): x is string => !!x) : [];
	const jur = obj(loc?.jurisdiction);
	const mode: OperatorMode = state && state.operator_mode !== undefined ? (MODES[String(state.operator_mode)] ?? "unknown") : "unknown";
	return {
		playerName: text(state?.player_name),
		mode,
		modeLabel: LABELS[lang].mode[mode],
		location: names,
		place: names.at(-1) ?? null,
		jurisdiction: text(jur?.display_name) ?? text(jur?.id),
		armistice: loc ? loc.armistice_zone === true : null,
		crimeStat: actor ? num(state?.crime_stat) : null,
		mission: mission(obj(state?.tracked_contract)),
	};
}

// ---------- Jeu : état, menu, performances ----------

export type GameState = "front_end" | "loading" | "in_game" | "unknown";
const GAME: Record<string, GameState> = {
	GAME_STATE_FRONT_END: "front_end",
	GAME_STATE_LOADING: "loading",
	GAME_STATE_IN_GAME: "in_game",
};

export type Perf = {
	fps: number;
	frameMs: number;
	mainMs: number;
	renderMs: number;
	gpuMs: number | null;
	vramUsedMb: number | null;
	vramBudgetMb: number | null;
	pingMs: number | null;
	lossPercent: number | null;
	inBps: number | null;
	outBps: number | null;
	serverFps: number | null;
	serverMaxMs: number | null;
	hitches: number | null;
	shard: string | null;
	shardId: string | null;
};

export type GameInfo = { state: GameState; label: string; menuOpen: boolean; mode: string | null; perf: Perf | null };

/** Section `game` : `null` quand le jeu ne l'envoie pas (builds d'avant 13273298, ou section périmée). */
export function readGame(game: Obj | undefined, lang: Lang): GameInfo | null {
	if (!game) return null;
	const state = GAME[String(game.state)] ?? "unknown";
	const d = obj(game.debug);
	const vram = obj(d?.vram);
	const net = obj(d?.network);
	const server = obj(d?.server);
	return {
		state,
		label: LABELS[lang].game[state],
		menuOpen: game.menu_open === true,
		mode: text(game.game_mode),
		perf: d
			? {
					fps: num(d.fps),
					frameMs: num(d.frame_time_ms),
					mainMs: num(d.main_thread_ms),
					renderMs: num(d.render_thread_ms),
					gpuMs: opt(d.gpu_ms),
					vramUsedMb: vram ? num(vram.used_mb) : null,
					vramBudgetMb: vram ? num(vram.budget_mb) : null,
					pingMs: net ? num(net.ping_ms) : null,
					lossPercent: net ? num(net.packet_loss_percent) : null,
					inBps: net ? num(net.bits_per_second_in) : null,
					outBps: net ? num(net.bits_per_second_out) : null,
					serverFps: server ? num(server.fps) : null,
					serverMaxMs: server ? num(server.max_frame_time_ms) : null,
					hitches: server ? num(server.hitch_count) : null,
					shard: text(d.shard_name),
					shardId: text(d.shard_id),
				}
			: null,
	};
}
