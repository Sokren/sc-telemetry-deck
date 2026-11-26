/**
 * Releases du dépôt public (lecture seule, aucune donnée envoyée). La liste plutôt que `/releases/latest` : on ne
 * propose que les versions principales, même si une bêta n'a pas été cochée « pre-release » sur GitHub.
 */
export const RELEASES_API = "https://api.github.com/repos/Sokren/sc-telemetry-deck/releases?per_page=30";
/** Version principale : `x.y.z` (un `v` devant permis), sans suffixe `-beta`, `-rc`… */
const STABLE_TAG = /^v?\d+\.\d+\.\d+$/i;
/** Vérification automatique : au démarrage puis une fois par jour. */
export const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export type LatestRelease = { version: string; url: string; publishedAt: string | null };

export type UpdateState = {
	current: string;
	/** Vérification automatique activée (réglage de l'appli). */
	auto: boolean;
	/** `unknown` : pas encore vérifié ; `error` : GitHub injoignable (on réessaiera). */
	status: "unknown" | "up_to_date" | "available" | "error";
	latest: string | null;
	url: string | null;
	publishedAt: string | null;
	checkedAt: string | null;
};

/**
 * Compare deux versions `a.b.c` (un `v` devant est ignoré) : négatif si a < b, 0 si égales, positif si a > b.
 * Une préversion (`0.4.0-beta.1`) passe avant la version principale du même numéro (`0.4.0`).
 */
export function compareVersions(a: string, b: string): number {
	const split = (v: string) => {
		const [main = "", pre] = v.replace(/^v/i, "").split(/-(.*)/s);
		return { nums: main.split(".").map((p) => Number.parseInt(p, 10) || 0), pre: pre ?? null };
	};
	const va = split(a);
	const vb = split(b);
	for (let i = 0; i < Math.max(va.nums.length, vb.nums.length); i++) {
		const d = (va.nums[i] ?? 0) - (vb.nums[i] ?? 0);
		if (d) return d;
	}
	if (va.pre === vb.pre) return 0;
	if (va.pre === null) return 1;
	if (vb.pre === null) return -1;
	return va.pre.localeCompare(vb.pre, "en", { numeric: true });
}

/**
 * Lit la plus haute version principale publiée sur GitHub (5 s maximum) : brouillons, préversions et tags avec
 * suffixe (`-beta`, `-rc`…) ignorés. En-tête générique : aucune information sur le joueur.
 */
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<LatestRelease> {
	const r = await fetchImpl(RELEASES_API, {
		headers: { accept: "application/vnd.github+json", "user-agent": "sc-telemetry-deck" },
		signal: AbortSignal.timeout(5000),
	});
	if (!r.ok) throw new Error(`GitHub ${r.status}`);
	const body: unknown = await r.json();
	if (!Array.isArray(body)) throw new Error("réponse GitHub inattendue");
	let best: LatestRelease | undefined;
	for (const x of body as { tag_name?: unknown; html_url?: unknown; published_at?: unknown; draft?: unknown; prerelease?: unknown }[]) {
		if (!x || x.draft === true || x.prerelease === true) continue;
		if (typeof x.tag_name !== "string" || !STABLE_TAG.test(x.tag_name) || typeof x.html_url !== "string") continue;
		const version = x.tag_name.replace(/^v/i, "");
		if (!best || compareVersions(version, best.version) > 0) {
			best = { version, url: x.html_url, publishedAt: typeof x.published_at === "string" ? x.published_at : null };
		}
	}
	if (!best) throw new Error("aucune version principale publiée");
	return best;
}

/**
 * Vérification de version de l'appli web : au démarrage puis chaque jour si `auto`, ou à la demande.
 * Ne télécharge rien : la page propose d'ouvrir GitHub.
 */
export class UpdateChecker {
	readonly #current: string;
	readonly #latest: () => Promise<LatestRelease>;
	readonly #now: () => number;
	readonly #every: number;
	readonly #getAuto: () => boolean;
	readonly #setAuto: (on: boolean) => void;
	#state: Omit<UpdateState, "current" | "auto"> = { status: "unknown", latest: null, url: null, publishedAt: null, checkedAt: null };
	#timer: ReturnType<typeof setInterval> | undefined;
	#running: Promise<UpdateState> | undefined;
	readonly #listeners = new Set<() => void>();

	constructor(opts: {
		current: string;
		latest?: () => Promise<LatestRelease>;
		auto: () => boolean;
		setAuto: (on: boolean) => void;
		now?: () => number;
		everyMs?: number;
	}) {
		this.#current = opts.current;
		this.#latest = opts.latest ?? (() => fetchLatestRelease());
		this.#now = opts.now ?? Date.now;
		this.#every = opts.everyMs ?? CHECK_EVERY_MS;
		this.#getAuto = opts.auto;
		this.#setAuto = opts.setAuto;
	}

	get state(): UpdateState {
		return { current: this.#current, auto: this.#getAuto(), ...this.#state };
	}

	/** Appelé quand l'état change (nouvelle version trouvée…). */
	onChange(listener: () => void): () => void {
		this.#listeners.add(listener);
		return () => void this.#listeners.delete(listener);
	}

	/** Vérifie maintenant (une seule vérification à la fois). Ne lève jamais : erreur → `status: "error"`. */
	check(): Promise<UpdateState> {
		this.#running ??= (async () => {
			try {
				const latest = await this.#latest();
				this.#state = {
					status: compareVersions(latest.version, this.#current) > 0 ? "available" : "up_to_date",
					latest: latest.version,
					url: latest.url,
					publishedAt: latest.publishedAt,
					checkedAt: new Date(this.#now()).toISOString(),
				};
			} catch {
				// Pas d'Internet, GitHub lent ou limité : on garde la dernière réponse connue, on réessaiera.
				this.#state = { ...this.#state, status: this.#state.latest ? this.#state.status : "error", checkedAt: new Date(this.#now()).toISOString() };
			} finally {
				this.#running = undefined;
			}
			for (const l of this.#listeners) l();
			return this.state;
		})();
		return this.#running;
	}

	/** Active / désactive la vérification automatique (réglage de l'appli). */
	setAuto(on: boolean): void {
		this.#setAuto(on);
		this.#schedule();
		if (on && this.#state.status === "unknown") void this.check();
	}

	/** Démarre la vérification automatique (si activée). */
	start(): void {
		this.#schedule();
		if (this.#getAuto()) void this.check();
	}

	stop(): void {
		clearInterval(this.#timer);
		this.#timer = undefined;
	}

	#schedule(): void {
		this.stop();
		if (this.#getAuto()) this.#timer = setInterval(() => void this.check(), this.#every);
	}
}
