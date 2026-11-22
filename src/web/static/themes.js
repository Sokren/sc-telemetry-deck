// Thèmes de couleurs de la page, par appareil (localStorage) : 5 thèmes tout faits + une couleur d'accent au choix.
// Les palettes sont dans style.css (`:root[data-theme="…"]`) ; theme-boot.js applique le choix avant l'affichage.
// Les couleurs OK / attention / danger ne sont pas réglables : chaque thème les ajuste seulement pour rester lisible.

export const THEME_KEY = "sctd-theme";

/** Thèmes, dans l'ordre des options, avec leur accent par défaut (aperçu). */
export const THEMES = [
	{ id: "current", accent: "#e2b84a" },
	{ id: "green", accent: "#3ddc84" },
	{ id: "amber", accent: "#ffb238" },
	{ id: "blue", accent: "#5aa9ff" },
	{ id: "light", accent: "#0b6bcb" },
];
const IDS = THEMES.map((t) => t.id);
const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Accent par défaut d'un thème. */
export const themeAccent = (id) => THEMES.find((t) => t.id === id)?.accent ?? THEMES[0].accent;

/** Réglage enregistré, nettoyé : `{ id, accent }` (`accent` vide = celui du thème). */
export function readTheme(storage = globalThis.localStorage) {
	try {
		const o = JSON.parse(storage.getItem(THEME_KEY) ?? "{}") ?? {};
		return { id: IDS.includes(o.id) ? o.id : "current", accent: isHex(o.accent) ? o.accent.toLowerCase() : "" };
	} catch {
		return { id: "current", accent: "" };
	}
}

export function saveTheme(theme, storage = globalThis.localStorage) {
	try {
		storage.setItem(THEME_KEY, JSON.stringify({ id: theme.id, accent: theme.accent }));
	} catch {
		/* stockage indisponible : le thème vaut pour cette page seulement */
	}
}

/** Applique un thème à la page : palette (`data-theme` sur <html>) et accent éventuel. */
export function applyTheme(theme, root = document.documentElement) {
	if (theme.id === "current") delete root.dataset.theme;
	else root.dataset.theme = theme.id;
	if (isHex(theme.accent)) root.style.setProperty("--accent", theme.accent);
	else root.style.removeProperty("--accent");
}
