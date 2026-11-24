import type { TitleParametersDidChangeEvent } from "@elgato/streamdeck";

/** Titre saisi dans le Stream Deck pour une touche, et si le Stream Deck l'affiche lui-même. */
export type UserTitle = { title: string; shown: boolean };

export const NO_TITLE: UserTitle = { title: "", shown: false };

/** Titre lu dans l'événement `titleParametersDidChange`. */
export function readUserTitle(ev: Pick<TitleParametersDidChangeEvent, "payload"> | { payload: unknown }): UserTitle {
	const p = (ev.payload ?? {}) as { title?: unknown; titleParameters?: { showTitle?: unknown } };
	return { title: typeof p.title === "string" ? p.title : "", shown: p.titleParameters?.showTitle === true };
}

/**
 * Libellé à dessiner dans l'image : le titre saisi remplace le nom par défaut ; titre vide → nom par
 * défaut. `null` quand le Stream Deck affiche déjà le titre saisi (pas de texte en double).
 */
export function labelWithTitle(t: UserTitle | undefined, fallback: string): string | null {
	const title = (t?.title ?? "").replace(/\s*\n\s*/g, " ").trim();
	if (!title) return fallback;
	return t?.shown ? null : title;
}
