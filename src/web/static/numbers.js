// Format des nombres choisi par appareil, indépendant de la langue de la page (HUD en anglais, nombres lus à la
// française). L'appli met en forme les nombres dans la langue de la page ; ici on ne change que les séparateurs.

const NN = " "; // espace fine insécable : milliers en français
/** Texte qui n'est qu'un nombre (signe, chiffres, séparateurs) suivi éventuellement d'un suffixe (k, M, Md, B). */
const NUMBER = /^([−+-]?)(\d[\d.,   ]*\d|\d)(\s?[A-Za-z]{0,2})$/;

/**
 * Nombre mis en forme par l'appli dans la langue `pageLang`, réécrit au format voulu (`fr` : 1 234,5 ; `en` :
 * 1,234.5 ; `auto` : celui de la langue). Un texte qui n'est pas un nombre est rendu tel quel.
 * @param {string} text
 * @param {"fr" | "en"} pageLang
 * @param {"auto" | "fr" | "en"} format
 */
export function localizeNumber(text, pageLang, format) {
	if (format === "auto" || format === pageLang || typeof text !== "string") return text;
	const m = NUMBER.exec(text);
	if (!m) return text;
	const [, sign, digits, suffix] = m;
	const swapped =
		pageLang === "en"
			? digits.replace(/,/g, "\u0000").replace(/\./g, ",").replace(/\u0000/g, NN)
			: digits.replace(/,/g, "\u0000").replace(/[   ]/g, ",").replace(/\u0000/g, ".");
	return sign + swapped + suffix;
}

/**
 * Solde à l'échelle choisie, tronqué (comme le jeu) : `full` 15 021 736, `k` 15 021 k, `m` 15,02 M. `null` pour
 * l'échelle automatique ou un montant illisible (garder le texte compact de l'appli).
 * @param {string} amount montant brut en chiffres
 * @param {"full" | "k" | "m" | undefined} length
 * @param {"fr" | "en"} numbers format des nombres
 */
export function moneyText(amount, length, numbers) {
	const n = Number(amount);
	if (!length || !Number.isFinite(n)) return null;
	const fr = numbers === "fr";
	const group = (v, decimals = 0) =>
		new Intl.NumberFormat(fr ? "fr-FR" : "en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v).replace(/ /g, NN);
	if (length === "full") return group(Math.trunc(n));
	if (length === "k") return `${group(Math.trunc(n / 1e3))}${fr ? " " : ""}k`;
	return `${group(Math.trunc(n / 1e4) / 100, 2)}${fr ? " " : ""}M`;
}

let pageLang = "en";
let format = "auto";
/** Langue de la page et format choisi sur cet appareil (appelé au chargement et quand ils changent). */
export function setNumberFormat(lang, chosen) {
	pageLang = lang;
	format = chosen === "fr" || chosen === "en" ? chosen : "auto";
}
/** Nombre affiché au format choisi. */
export const num = (text) => localizeNumber(text, pageLang, format);
/** Langue de la page (les textes de nombres sont d'abord mis en forme dans cette langue, puis passés à `num`). */
export const pageLanguage = () => pageLang;
