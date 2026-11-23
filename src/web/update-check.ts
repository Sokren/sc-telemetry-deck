/** Dépôt public dont on lit la dernière release (lecture seule, aucune donnée envoyée). */
export const RELEASES_API = "https://api.github.com/repos/Sokren/sc-telemetry-deck/releases/latest";
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

/** Compare deux versions `a.b.c` (un `v` devant est ignoré) : négatif si a < b, 0 si égales, positif si a > b. */
export function compareVersions(a: string, b: string): number {
	const parts = (v: string) => v.replace(/^v/i, "").split(/[.-]/).map((p) => Number.parseInt(p, 10) || 0);
	const pa = parts(a);
	const pb = parts(b);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

/** Lit la dernière release sur GitHub (5 s maximum). En-tête générique : aucune information sur le joueur. */
export async function fetchLatestRelease(fetchImpl: typeof fetch = fetch): Promise<LatestRelease> {
	const r = await fetchImpl(RELEASES_API, {
		headers: { accept: "application/vnd.github+json", "user-agent": "sc-telemetry-deck" },
		signal: AbortSignal.timeout(5000),
	});
	if (!r.ok) throw new Error(`GitHub ${r.status}`);
	const body = (await r.json()) as { tag_name?: unknown; html_url?: unknown; published_at?: unknown };
	if (typeof body.tag_name !== "string" || typeof body.html_url !== "string") throw new Error("réponse GitHub inattendue");
	return { version: body.tag_name.replace(/^v/i, ""), url: body.html_url, publishedAt: typeof body.published_at === "string" ? body.published_at : null };
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
