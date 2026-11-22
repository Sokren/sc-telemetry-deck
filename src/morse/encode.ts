// Code morse international (lettres et chiffres), rythme standard en unités.
const MORSE: Record<string, string> = {
	A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---",
	K: "-.-", L: ".-..", M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-",
	U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
	"0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
	"5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
};

const DOT = 1;
const DASH = 3;
const GAP_SIGN = 1;
const GAP_LETTER = 3;
const GAP_WORD = 7;

/** Majuscules, accents retirés, seuls A–Z / 0–9 / espaces gardés, espaces réduits. */
export function normalizeText(text: string): string {
	return text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toUpperCase()
		.replace(/[^A-Z0-9 ]/g, "")
		.replace(/ +/g, " ")
		.trim();
}

/** Un signe à émettre : sa lettre, le code de la lettre, sa place dans ce code, le tour de répétition (0…). */
export type MorseSign = { letter: string; code: string; sign: number; round: number; wordStart: boolean };

/** Signes dans l'ordre d'émission (une paire allumer / éteindre chacun) ; `[]` si rien à émettre. */
export function toSigns(text: string, repeat: number): MorseSign[] {
	const words = normalizeText(text).split(" ").filter(Boolean);
	const signs: MorseSign[] = [];
	for (let round = 0; round < repeat && words.length > 0; round++) {
		for (const word of words) {
			[...word].forEach((letter, l) => {
				const code = MORSE[letter];
				for (let sign = 0; sign < code.length; sign++) signs.push({ letter, code, sign, round, wordStart: l === 0 && sign === 0 });
			});
		}
	}
	return signs;
}

/**
 * Instants (ms depuis le début) de chaque bascule de la torche : allumer, éteindre, allumer…
 * Toujours un nombre pair ; `[]` si rien à émettre. Les bascules `2k` et `2k + 1` sont le signe `k` de `toSigns`.
 */
export function toToggleTimes(text: string, unitMs: number, repeat: number): number[] {
	const times: number[] = [];
	let t = 0; // en unités ; position de la prochaine bascule possible
	toSigns(text, repeat).forEach((s, k) => {
		if (k > 0) t += s.wordStart ? GAP_WORD : s.sign === 0 ? GAP_LETTER : GAP_SIGN;
		times.push(t * unitMs);
		t += s.code[s.sign] === "." ? DOT : DASH;
		times.push(t * unitMs);
	});
	return times;
}

/**
 * Où en est une émission : lettre en cours, son code, signe allumé (`-1` entre deux signes),
 * tour de répétition (1…`rounds`) ; `wordGap` : pause avant le mot suivant (ou la répétition suivante).
 */
export type MorseProgress = { letter: string; code: string; sign: number; round: number; rounds: number; wordGap: boolean };

/** Progression après la bascule `toggle` (0 = premier allumage) ; `undefined` hors des signes. */
export function progressAt(signs: MorseSign[], toggle: number, rounds: number): MorseProgress | undefined {
	const current = toggle >= 0 ? signs[toggle >> 1] : undefined;
	if (!current) return undefined;
	const lit = toggle % 2 === 0;
	return {
		letter: current.letter,
		code: current.code,
		sign: lit ? current.sign : -1,
		round: current.round + 1,
		rounds,
		wordGap: !lit && signs[(toggle >> 1) + 1]?.wordStart === true,
	};
}

/** Code lisible : `·` et `−`, le signe allumé en gros (`●`, `▬`). */
export function codeGlyphs(p: Pick<MorseProgress, "code" | "sign">): string {
	return [...p.code].map((c, i) => (c === "." ? (i === p.sign ? "●" : "·") : i === p.sign ? "▬" : "−")).join("");
}

/** Deux lignes pour une touche : la lettre (`␣` pendant la pause entre deux mots) et son code. */
export function progressLines(p: MorseProgress): [string, string] {
	return p.wordGap ? ["␣", ""] : [p.letter, codeGlyphs(p)];
}
