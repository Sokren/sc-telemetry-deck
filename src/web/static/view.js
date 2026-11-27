// SPDX-License-Identifier: MPL-2.0
// Onglets « Ma vue » : vues nommées faites de sections et de cases composées par l'utilisateur, enregistrées
// dans l'appli (une route par vue : /api/v1/views/{id}) et rendues à partir de l'événement « state ». Édition au cadenas : glisser-déposer souris + tactile (événements
// pointer), menu « Ajouter », largeur, taille, renommage. Aucune bibliothèque.

import { renderGauge, stylesFor } from "./gauges.js";
import { moneyText } from "./numbers.js";
import { openExport, openImport, openNewView } from "./share.js";
import { shipCard } from "./shipcard.js";
import { gameInfoText, missionCard, perfCard, quantumCard, whoCard } from "./situation.js";

const MAX_SECTIONS = 20;
const MAX_ITEMS = 40;
const MAX_TITLE = 40;
const MAX_NAME = 24;
const MAX_VIEWS = 10;
const SAVE_DELAY = 400;
const DRAG_THRESHOLD = 6;
const UNLOCK_KEY = "sctd-view-unlocked";
const EMOTES = "player_emotes";
/** Valeurs affichées en jauge (barre), pour le type indiqué dans le menu « Ajouter ». */
/** Réglages d'une nouvelle case morse (mêmes défauts que la touche Morse Code). */
const MORSE_DEFAULT = { light: "flashlight", unitMs: 400, repeat: 1 };
const MAX_MORSE_TEXT = 60;
/** Texte tel qu'envoyé (comme l'appli) : majuscules, sans accents, A–Z / 0–9 / espaces. */
const morseText = (s) =>
	String(s ?? "")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toUpperCase()
		.replace(/[^A-Z0-9 ]/g, "")
		.replace(/ +/g, " ")
		.trim();
/** Types de case qui acceptent un style (comme l'appli). */
const STYLED_KINDS = ["vital", "instrument", "character_info", "ship_info", "game_info", "ship_function", "action"];
/** Types de case de valeur (jauges, chiffre, règle). */
const VALUE_KINDS = ["vital", "instrument", "character_info", "ship_info", "game_info"];
/** Cases d'information en texte (pas de jauge). */
const INFO_KINDS = ["character_info", "ship_info", "game_info"];
/** Encarts (comme l'appli) : sans nom modifiable, jamais plus petits que 1×, 2× à l'ajout. */
const CARD_KINDS = ["ship_card", "quantum_card", "who_card", "mission_card", "perf_card"];
/** Encarts du build 13273298 et leur dessin. */
const CARDS = { quantum_card: quantumCard, who_card: whoCard, mission_card: missionCard, perf_card: perfCard };
/** Nom libre : `base`, sinon « base 2 », « base 3 »… (coupé pour tenir en 24 caractères). */
export function uniqueName(base, names) {
	const taken = new Set(names);
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const suffix = ` ${n}`;
		const name = [...base].slice(0, MAX_NAME - suffix.length).join("").trimEnd() + suffix;
		if (!taken.has(name)) return name;
	}
}
/** Actions toujours en rouge (autodestruction, éjection), quel que soit leur style. */
const RED_ACTIONS = new Set(["v_self_destruct", "v_eject"]);
/** Section haute ou non, clés dans l'ordre de l'appli (id, title, width, tall, items) : copies comparables. */
export function setTall(section, on) {
	const { id, title, width, items } = section;
	for (const k of Object.keys(section)) delete section[k];
	Object.assign(section, { id, title, width, ...(on ? { tall: true } : {}), items });
}
/** Glisser : part de la course à atteindre pour envoyer (relâché avant → rien). */
export const SLIDE_DONE = 0.98;
/** Avancement du curseur (0–1) pour un déplacement `dx` sur une course `max` (px). */
export const slideProgress = (dx, max) => (max > 0 ? Math.min(1, Math.max(0, dx / max)) : 0);
/**
 * Geste d'envoi d'une action : le style choisi (glisser / maintenir), sinon maintenir pour les actions qui l'exigent
 * (éjection), sinon un appui.
 */
export function confirmModeFor(ref, style, holdActions) {
	if (style === "slide" || style === "hold") return style;
	return holdActions?.has(ref) ? "hold" : "press";
}
/** Cases sans nom affiché modifiable (comme l'appli) ; cases jamais plus petites que 1×. */
const NO_LABEL = ["morse", "morse_free", ...CARD_KINDS];
const MIN_SIZE_1 = ["annunciators", ...CARD_KINDS];
const MAX_LABEL = 24;
/**
 * Largeur d'une case en emplacements (`size` compté en cases 1× : un emplacement = 0.25). Une section pleine largeur
 * en a 16, une demi-section ou un tiers 8 ; le bouton fait le tour des largeurs possibles dans la section.
 */
export const sizeSlots = (size) => Math.round(size * 4);
/** Emplacements d'une ligne : 16 en pleine largeur, 8 en demi ou tiers (le bouton affiche toujours des entiers). */
export const sectionSlots = (width) => (width === "full" ? 16 : 8);
/**
 * Colonne (1 à `slots`) sous l'abscisse `x` d'une grille `{ left, width, gap }` de `slots` colonnes égales.
 * Hors de la grille : première ou dernière colonne.
 */
export function slotAt(x, grid, slots) {
	const step = (grid.width + grid.gap) / slots;
	return Math.min(slots, Math.max(1, Math.floor((x - grid.left) / step) + 1));
}
/** Colonne de départ ramenée à gauche pour que la case (`span` emplacements) tienne dans la ligne ; absente = rien. */
export function fitCol(col, span, slots) {
	if (col === undefined) return undefined;
	return Math.max(1, Math.min(col, slots - Math.min(span, slots) + 1));
}
/**
 * Taille voisine (`dir` = 1 plus grand, -1 plus petit) parmi celles possibles dans la section, ou `undefined` à la
 * borne. Une case plus large que sa section (après un changement de largeur) redescend dans la section.
 */
export function sizeStep(item, section, dir) {
	// Demi et tiers : 8 emplacements (plus étroits dans un tiers).
	const all = section.width === "full" ? [0.25, 0.5, 1, 1.5, 2, 3, 4] : [0.25, 0.5, 1, 1.5, 2];
	const list = MIN_SIZE_1.includes(item.kind) ? all.filter((s) => s >= 1) : all;
	return dir > 0 ? list.find((s) => s > item.size) : list.findLast((s) => s < item.size);
}
const sizeClass = (size) => `w${sizeSlots(size)}`;
/** Largeurs de section, de la plus étroite à la plus large. */
const WIDTHS = ["third", "half", "full"];
/** Largeur voisine (`dir` = 1 plus large, -1 plus étroite), ou `undefined` à la borne. */
export const widthStep = (w, dir) => WIDTHS[WIDTHS.indexOf(w) + dir];
/** Case avec ses clés dans l'ordre enregistré par l'appli (comparaison des copies sans re-rendu inutile). */
const ordered = ({ id, kind, ref, size, col, settings, label, display }) => ({
	id,
	kind,
	...(ref !== undefined ? { ref } : {}),
	size,
	...(col !== undefined ? { col } : {}),
	...(settings ? { settings } : {}),
	...(label ? { label } : {}),
	...(display ? { display: orderedDisplay(display) } : {}),
});
/** Réglages d'affichage dans l'ordre de l'appli (`style`, `length`), sans clé vide. */
function orderedDisplay({ style, length }) {
	const d = { ...(style ? { style } : {}), ...(length ? { length } : {}) };
	return Object.keys(d).length ? d : undefined;
}
const GAUGES = ["health", "oxygen", "hunger", "thirst", "body_temperature", "shields", "hull", "decoys", "noise", "weapons_ready", "hydrogen", "quantum"];

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};
const button = (cls, text, title) => {
	const b = el("button", cls, text);
	b.type = "button";
	if (title) {
		b.title = title;
		b.setAttribute("aria-label", title);
	}
	return b;
};

/**
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {() => string} ctx.token
 * @param {() => string} ctx.lang langue de la page (nom par défaut figé à la première écriture)
 * @param {(views: {id: string, name: string}[]) => void} ctx.onViewsChanged liste à jour (onglets)
 * @param {() => void} ctx.onMissing la vue affichée n'existe plus (supprimée ailleurs)
 * @param {(item: object) => HTMLElement} ctx.card carte (constante, instrument) commune aux onglets
 * @param {(id: string, el: HTMLElement) => void} ctx.pressFunction
 * @param {(name: string, el: HTMLElement) => void} ctx.triggerAction
 * @param {(body: object, el: HTMLElement) => void} ctx.morse envoie un message morse (ou arrête celui en cours)
 * @param {(text: string) => void} ctx.showMessage
 * @param {{ get(k: string): string | null, set(k: string, v: string): void }} ctx.storage
 * @param {(id: string) => void} ctx.openView ouvre l'onglet d'une vue (après un import)
 */
export function createView(ctx) {
	const { t } = ctx;
	// `ctx.fixed` : vue intégrée (onglet Instrument de bord) — une seule vue fournie par `setFixedView`, toujours
	// verrouillée : pas de cadenas, pas d'édition, pas d'enregistrement.
	const fixed = ctx.fixed === true;
	const root = ctx.root ?? document.getElementById("myview");
	const lockBtn = fixed ? null : document.getElementById("view-lock");
	/** Toutes les vues (dernière liste reçue, avec la vue affichée telle qu'éditée ici). */
	let views = null;
	let currentId = null;
	/** Vue affichée (copie éditée localement). */
	let view = null;
	let state = null;
	let actionGroups = [];
	let unlocked = !fixed && ctx.storage.get(UNLOCK_KEY) === "1";
	let visible = false;
	let saveTimer;
	let drag = null;
	/** Cases affichées : id → mise à jour à partir de `state`. */
	let updaters = new Map();

	// ---------- Libellés ----------
	const fmt = (key, ...args) => args.reduce((s, a, i) => s.replace(`{${i}}`, a), t(key));
	const INFO = {
		character_info: {
			position: "infoPosition",
			role: "infoRole",
			seat: "infoSeat",
			player_name: "infoPlayerName",
			mode: "infoMode",
			location: "infoLocation",
			jurisdiction: "infoJurisdiction",
			armistice: "armistice",
			crime_stat: "crimeStat",
			mission: "missionTitle",
			mission_objective: "infoMissionObjective",
			mission_progress: "infoMissionProgress",
		},
		ship_info: {
			name: "infoShipName",
			master_mode: "infoMasterMode",
			landed: "infoLanded",
			boost: "infoBoost",
			qt_state: "qtTitle",
			qt_destination: "infoQtDestination",
			qt_eta: "qtEta",
			qt_distance: "qtDistance",
			qt_calibration: "qtCalibration",
		},
		game_info: {
			state: "infoGameState",
			fps: "perfFps",
			frame_time: "infoFrameTime",
			gpu: "infoGpu",
			vram: "perfVram",
			ping: "perfPing",
			packet_loss: "infoPacketLoss",
			server_fps: "infoServerFps",
			shard: "perfShard",
		},
	};
	const CARD_TITLES = { ship_card: "shipCard", quantum_card: "qtTitle", who_card: "whoCard", mission_card: "missionTitle", perf_card: "perfTitle" };
	function actionLabel(name) {
		for (const g of actionGroups) for (const a of g.actions) if (a.name === name) return a.label;
		return name;
	}
	/** Nom affiché : celui choisi par le joueur (⚙), sinon celui du jeu. */
	const shownLabel = (item) => item.label ?? labelOf(item);
	function labelOf(item) {
		switch (item.kind) {
			case "vital":
				return state?.vitals.find((v) => v.id === item.ref)?.label ?? item.ref;
			case "instrument":
				return state?.shipStatus.instruments.find((i) => i.id === item.ref)?.label ?? item.ref;
			case "ship_function":
				return state?.ship.find((f) => f.id === item.ref)?.label ?? item.ref;
			case "annunciators":
				return t("warningLights");
			case "ship_card":
			case "quantum_card":
			case "who_card":
			case "mission_card":
			case "perf_card":
				return t(CARD_TITLES[item.kind]);
			case "action":
				return actionLabel(item.ref);
			case "morse":
				return morseText(item.settings?.text) || t("morseMessage");
			case "morse_free":
				return t("morseFree");
			default:
				return t(INFO[item.kind][item.ref]);
		}
	}

	const lightLabel = (light) => (light === "ship_lights" ? t("morseLightShip") : t("morseLightFlashlight"));
	const freeKey = (id) => `sctd-morse-free-${id}`;
	/** Réglages envoyés à l'appli (sans le texte enregistré). */
	const morseBody = (s, text) => ({ text, light: s.light, unitMs: s.unitMs, repeat: s.repeat });

	/** Lettre en cours d'envoi, son code (signe allumé en surbrillance) et le tour si répété ; caché hors envoi. */
	const morseNow = () => el("div", "vmorse-now");
	const showMorseNow = (box, p) => {
		box.hidden = !p;
		if (!p) return;
		const letter = el("b", "vmorse-letter", p.wordGap ? "␣" : p.letter);
		const code = el("span", "vmorse-code");
		if (!p.wordGap)
			[...p.code].forEach((c, i) => code.append(el("span", i === p.sign ? "lit" : "", c === "." ? "·" : "−")));
		box.replaceChildren(letter, code);
		if (p.rounds > 1) box.append(el("span", "vmorse-round", `${p.round}/${p.rounds}`));
	};

	// ---------- Rendu des cases ----------
	function infoText(item) {
		if (!state) return "—";
		if (item.kind === "game_info") return gameInfoText(state, item.ref, t);
		if (item.kind === "character_info") {
			const c = state.character;
			if (!c.available) return "—";
			const m = c.mission;
			switch (item.ref) {
				case "position":
					return c.locomotionLabel;
				case "role":
					return c.crewRoleLabel;
				case "seat":
					return c.seat ?? "—";
				case "player_name":
					return c.playerName ?? "—";
				case "mode":
					return c.modeLabel;
				case "location":
					// Les deux niveaux les plus précis (« Hurston › Lorville ») : le chemin complet ne tient pas.
					return c.location.slice(-2).join(" › ") || "—";
				case "jurisdiction":
					return c.jurisdiction ?? "—";
				case "armistice":
					return c.armistice === null ? "—" : c.armistice ? t("yes") : t("no");
				case "crime_stat":
					return c.crimeStat === null ? "—" : String(c.crimeStat);
				case "mission":
					return m?.title ?? "—";
				case "mission_objective":
					return m?.objective ?? "—";
				case "mission_progress":
					return m?.total ? `${m.done} / ${m.total}` : "—";
			}
			return "—";
		}
		const s = state.shipStatus;
		if (!s.available) return "—";
		const q = s.quantum;
		switch (item.ref) {
			case "name":
				return s.name ?? "—";
			case "master_mode":
				return s.masterModeLabel;
			case "landed":
				return s.landed === null ? "—" : s.landed ? t("landed") : t("flying");
			case "qt_state":
				return q?.label ?? "—";
			case "qt_destination":
				return q?.destination ?? "—";
			case "qt_eta":
				return q?.etaText ?? "—";
			case "qt_distance":
				return q?.distanceText ?? "—";
			case "qt_calibration":
				return q ? `${Math.floor(q.calibration + 1e-6)} %` : "—";
		}
		return "—";
	}

	/** Couleur d'une info : CrimeStat en rouge au-dessus de 0, zone d'armistice en vert. */
	function infoLevel(item) {
		const c = state?.character;
		if (item.kind !== "character_info" || !c?.available) return "none";
		if (item.ref === "crime_stat") return c.crimeStat > 0 ? "bad" : "none";
		if (item.ref === "armistice") return c.armistice ? "ok" : "none";
		return "none";
	}

	/** Donnée affichée par une case de valeur (constante, instrument, info perso / vaisseau). */
	function itemData(item) {
		if (INFO_KINDS.includes(item.kind)) return { label: shownLabel(item), text: infoText(item), unit: "", level: infoLevel(item) };
		const list = item.kind === "vital" ? state?.vitals : state?.shipStatus.instruments;
		const found = list?.find((x) => x.id === item.ref);
		if (!found) return { label: shownLabel(item), text: "—", unit: "", level: "none" };
		// Solde : échelle choisie (tous les chiffres, milliers, millions), sinon le texte compact de l'appli. Mis en forme
		// dans la langue de la page, comme les textes de l'appli : le format des nombres choisi s'applique ensuite.
		const text = (found.amount !== undefined && moneyText(found.amount, item.display?.length, ctx.lang())) || found.text;
		return { ...found, text, label: item.label ?? found.label };
	}

	/** Case de valeur dans son style (jauge construite une fois puis mise à jour sur place), sinon carte. */
	function valueContent(item, box) {
		let gauge = null;
		const update = () => {
			const data = itemData(item);
			const style = item.display?.style;
			if (style && !gauge) {
				gauge = renderGauge(style, data, item.size);
				if (gauge) box.replaceChildren(gauge.el);
			}
			if (gauge) return gauge.update(data);
			box.replaceChildren(ctx.card(data));
		};
		return { box, update };
	}

	/** Aperçu d'un style de bouton dans le menu ⚙ (carte, interrupteur, glisser, maintenir). */
	function controlPreview(style, item) {
		const label = shownLabel(item);
		if (style === "switch") {
			const f = state?.ship.find((x) => x.id === item.ref);
			const sw = el("div", "vswitch");
			sw.dataset.state = "off";
			sw.append(el("span", "vsw-knob"), el("span", "vsw-off", f?.words.off ?? "OFF"), el("span", "vsw-on", f?.words.on ?? "ON"));
			return sw;
		}
		if (style === "slide") {
			const s = el("div", "vslide");
			s.append(el("span", "vslide-knob", "›››"), el("span", "vslide-text", label));
			return s;
		}
		if (style === "hold") return el("div", "card function vhold-prev", `⏱ ${label}`);
		return el("div", "card function", label);
	}

	/** Interrupteur : côté « off » | côté « on », curseur sur l'état lu ; un appui envoie l'autre état. */
	function switchContent(item, box) {
		const sw = button("vswitch");
		const knob = el("span", "vsw-knob");
		const off = el("span", "vsw-off");
		const on = el("span", "vsw-on");
		const label = el("span", "vsw-label");
		sw.append(knob, off, on, label, el("span", "flash"));
		sw.addEventListener("click", () => {
			if (!unlocked && sw.dataset.readonly !== "1") ctx.pressFunction(item.ref, sw);
		});
		box.append(sw);
		const update = () => {
			const f = state?.ship.find((x) => x.id === item.ref);
			const st = f?.state;
			// Pendant un mouvement (train qui sort…), le curseur va déjà vers l'état visé.
			const side = st === "on" || st === "moving-on" ? "on" : st === "off" || st === "moving-off" ? "off" : "unknown";
			sw.dataset.state = side;
			sw.dataset.readonly = f?.readOnly ? "1" : "";
			sw.classList.toggle("danger", !!f?.danger);
			sw.classList.toggle("moving", st === "moving-on" || st === "moving-off");
			off.textContent = f?.words.off ?? "—";
			on.textContent = f?.words.on ?? "—";
			label.textContent = item.label ?? f?.label ?? labelOf(item);
			sw.title = f?.readOnly ? t("readOnlyFunction") : "";
		};
		return { box, update };
	}

	/** Glisser pour envoyer : le curseur doit aller au bout ; relâché avant, il revient sans rien envoyer. */
	function slideContent(item, box) {
		const s = el("div", `vslide${RED_ACTIONS.has(item.ref) ? " red" : ""}`);
		s.setAttribute("role", "button");
		s.tabIndex = 0;
		const knob = el("span", "vslide-knob", "›››");
		const text = el("span", "vslide-text");
		s.append(knob, text, el("span", "flash"));
		box.append(s);
		let x0 = null;
		const course = () => s.clientWidth - knob.offsetWidth - 6;
		const reset = () => {
			x0 = null;
			s.classList.remove("sliding");
			knob.style.removeProperty("transform");
		};
		knob.addEventListener("pointerdown", (e) => {
			if (unlocked || e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			x0 = e.clientX;
			s.classList.add("sliding");
			knob.setPointerCapture?.(e.pointerId);
		});
		knob.addEventListener("pointermove", (e) => {
			if (x0 === null) return;
			// Échelle de la page (vue mise à l'échelle) : distance mesurée en px de la case.
			const scale = s.getBoundingClientRect().width / (s.offsetWidth || 1) || 1;
			const max = course();
			const p = slideProgress((e.clientX - x0) / scale, max);
			knob.style.transform = `translateX(${p * max}px)`;
			if (p >= SLIDE_DONE) {
				reset();
				ctx.triggerAction(item.ref, s);
			}
		});
		for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) knob.addEventListener(type, reset);
		const update = () => {
			text.textContent = fmt("slideToSend", shownLabel(item));
		};
		return { box, update };
	}

	/** Voyant boost : gris au repos, allumé quand on boost (`instruments.boost.engaged`). */
	function boostContent(item, box) {
		const card = el("div", "card vboost");
		box.append(card);
		const update = () => {
			const s = state?.shipStatus;
			card.textContent = item.label ?? t("boostLight");
			card.dataset.state = !s?.available ? "unknown" : s.boostEngaged ? "on" : "off";
		};
		return { box, update };
	}

	/** Contenu d'une case et sa fonction de mise à jour. */
	function itemContent(item) {
		const box = el("div", "vcontent");
		switch (item.kind) {
			case "ship_info":
				if (item.ref === "boost") return boostContent(item, box);
				return valueContent(item, box);
			case "vital":
			case "instrument":
			case "character_info":
			case "game_info":
				return valueContent(item, box);
			case "ship_card": {
				const update = () => box.replaceChildren(shipCard(state, item.size >= 2 ? 2 : 1, t));
				return { box, update };
			}
			case "quantum_card":
			case "who_card":
			case "mission_card":
			case "perf_card": {
				const update = () => box.replaceChildren(CARDS[item.kind](state, t));
				return { box, update };
			}
			case "annunciators": {
				const card = el("div", "card");
				const lights = el("div", "lights");
				const title = el("div", "label");
				card.append(title, lights);
				box.append(card);
				const update = () => {
					title.textContent = shownLabel(item);
					const list = state?.shipStatus.annunciators ?? [];
					lights.replaceChildren(
						...list.map((a) => {
							const s = el("span", `light light-${a.state}${a.flashing ? " flashing" : ""}`, a.label);
							return s;
						}),
					);
				};
				return { box, update };
			}
			case "ship_function": {
				if (item.display?.style === "switch") return switchContent(item, box);
				const b = button("card function");
				b.append(el("div", "label"), el("div", "value"), el("span", "flash"));
				b.addEventListener("click", () => {
					if (!unlocked && b.dataset.readonly !== "1") ctx.pressFunction(item.ref, b);
				});
				box.append(b);
				const update = () => {
					const f = state?.ship.find((x) => x.id === item.ref);
					b.dataset.readonly = f?.readOnly ? "1" : "";
					b.classList.toggle("danger", !!f?.danger);
					b.title = f?.readOnly ? t("readOnlyFunction") : "";
					b.querySelector(".label").textContent = item.label ?? f?.label ?? labelOf(item);
					b.querySelector(".value").textContent = f?.word ?? "—";
					b.dataset.state = f?.state ?? "unknown";
				};
				return { box, update };
			}
			case "action": {
				const mode = confirmModeFor(item.ref, item.display?.style, ctx.holdActions);
				if (mode === "slide") return slideContent(item, box);
				const b = button(`card function emote${RED_ACTIONS.has(item.ref) ? " red" : ""}`);
				const hold = mode === "hold";
				b.append(el("div", "label"), ...(hold ? [el("div", "vhold-hint", t("holdHint"))] : []), el("span", "flash"));
				b.addEventListener("click", () => {
					if (!unlocked && !hold) ctx.triggerAction(item.ref, b);
				});
				// Éjection : rester appuyé (anneau rouge) ; en édition, la case se déplace normalement.
				if (hold) {
					b.classList.add("hold-action");
					b.title = item.ref === "v_eject" ? t("holdToEject") : t("holdToSend");
					ctx.holdToPress(b, () => ctx.triggerAction(item.ref, b), () => !unlocked);
				}
				box.append(b);
				const update = () => (b.querySelector(".label").textContent = shownLabel(item));
				return { box, update };
			}
			case "morse": {
				const b = button("card function morse");
				const now = morseNow();
				b.append(el("div", "label"), el("div", "value"), now, el("span", "flash"));
				b.addEventListener("click", () => {
					if (!unlocked) ctx.morse(morseBody(item.settings, item.settings.text), b);
				});
				box.append(b);
				const update = () => {
					const s = item.settings;
					const text = morseText(s.text);
					b.querySelector(".label").textContent = `📡 ${text || "—"}`;
					b.querySelector(".value").textContent = lightLabel(s.light);
					const m = state?.morse;
					const mine = !!m?.playing && m.text === text && m.light === s.light;
					b.dataset.state = mine ? "on" : "idle";
					// Pendant l'envoi, la lettre et son code remplacent le nom de la lumière.
					showMorseNow(now, mine ? m.progress : null);
					b.querySelector(".value").hidden = mine && !!m.progress;
				};
				return { box, update };
			}
			case "morse_free": {
				const card = el("div", "card morse-free");
				const input = el("input", "vmorse-input");
				input.maxLength = MAX_MORSE_TEXT;
				input.placeholder = t("morseFreePlaceholder");
				input.setAttribute("aria-label", t("morseFree"));
				input.value = ctx.storage.get(freeKey(item.id)) ?? "";
				// En édition, la case sert de poignée de déplacement.
				input.disabled = unlocked;
				input.addEventListener("input", () => ctx.storage.set(freeKey(item.id), input.value));
				const send = button("vmorse-send", "▶", t("morseSend"));
				send.append(el("span", "flash"));
				const go = () => {
					if (!unlocked) ctx.morse(morseBody(item.settings, input.value), send);
				};
				send.addEventListener("click", go);
				input.addEventListener("keydown", (e) => e.key === "Enter" && go());
				const light = button("vmorse-light", "", t("morseLightSwitch"));
				light.addEventListener("click", () => {
					item.settings.light = item.settings.light === "ship_lights" ? "flashlight" : "ship_lights";
					update();
					scheduleSave();
				});
				const row = el("div", "vmorse-row");
				row.append(input, send);
				const now = morseNow();
				card.append(el("div", "label", `📡 ${t("morseFree")}`), now, row, light);
				box.append(card);
				const update = () => {
					light.textContent = `${lightLabel(item.settings.light)} ⇄`;
					const playing = !!state?.morse?.playing;
					send.firstChild.textContent = playing ? "■" : "▶";
					card.classList.toggle("playing", playing);
					showMorseNow(now, playing ? state.morse.progress : null);
				};
				return { box, update };
			}
		}
		return { box, update: () => {} };
	}

	/** Réglages d'une case morse (texte pour un message enregistré, lumière, vitesse, répétitions). */
	function editMorse(item) {
		const s = item.settings;
		const dlg = el("dialog", "vmorse-dlg");
		dlg.append(el("h2", "", item.kind === "morse" ? t("morseMessage") : t("morseFree")));
		const field = (label, input) => {
			const row = el("label", "vmorse-field");
			row.append(el("span", "", label), input);
			return row;
		};
		const text = el("input");
		text.maxLength = MAX_MORSE_TEXT;
		text.value = s.text ?? "";
		const light = el("select");
		for (const v of ["flashlight", "ship_lights"]) {
			const o = el("option", "", lightLabel(v));
			o.value = v;
			o.selected = s.light === v;
			light.append(o);
		}
		const number = (value, min, max, step) => {
			const n = el("input");
			n.type = "number";
			Object.assign(n, { min, max, step, value });
			return n;
		};
		const unit = number(s.unitMs, 100, 2000, 50);
		const repeat = number(s.repeat, 1, 10, 1);
		if (item.kind === "morse") dlg.append(field(t("morseText"), text));
		dlg.append(field(t("morseLight"), light), field(t("morseDot"), unit), field(t("morseRepeat"), repeat), el("p", "hint", t("morseHelp")));
		const error = el("p", "lan-notice");
		error.hidden = true;
		const foot = el("div", "lan-foot");
		const cancel = button("", t("cancel"));
		cancel.addEventListener("click", () => dlg.close());
		const ok = button("primary", t("ok"));
		const clamp = (v, min, max, d) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d);
		ok.addEventListener("click", () => {
			if (item.kind === "morse" && !morseText(text.value)) {
				error.textContent = t("morseTextInvalid");
				error.hidden = false;
				return;
			}
			item.settings = {
				...(item.kind === "morse" ? { text: text.value.trim() } : {}),
				light: light.value,
				unitMs: clamp(unit.valueAsNumber, 100, 2000, MORSE_DEFAULT.unitMs),
				repeat: clamp(repeat.valueAsNumber, 1, 10, MORSE_DEFAULT.repeat),
			};
			dlg.close();
			changed();
		});
		foot.append(cancel, ok);
		dlg.append(error, foot);
		dlg.addEventListener("close", () => dlg.remove());
		document.body.append(dlg);
		dlg.showModal();
		(item.kind === "morse" ? text : light).focus();
	}

	function renderItem(section, item) {
		const wrap = el("div", `vitem ${sizeClass(item.size)}`);
		wrap.dataset.id = item.id;
		// Colonne de départ : les emplacements d'avant restent vides (placement libre).
		const col = fitCol(item.col, sizeSlots(item.size), sectionSlots(section.width));
		if (col !== undefined) wrap.style.gridColumnStart = String(col);
		const { box, update } = itemContent(item);
		wrap.append(box);
		if (unlocked) {
			const ctl = el("div", "vctl");
			// Largeur : − / nombre d'emplacements pris / + (bouton grisé à la borne).
			const size = el("span", "vsize");
			const step = (dir, text, key) => {
				const to = sizeStep(item, section, dir);
				const b = button("", text, to === undefined ? t(key) : fmt(`${key}To`, sizeSlots(to)));
				b.disabled = to === undefined;
				b.addEventListener("click", () => {
					item.size = to;
					changed();
				});
				return b;
			};
			const count = el("span", "vsize-n", String(sizeSlots(item.size)));
			count.title = fmt("itemSize", sizeSlots(item.size), sectionSlots(section.width));
			size.append(step(-1, "−", "itemSmaller"), count, step(1, "+", "itemBigger"));
			const del = button("", "✕", t("removeItem"));
			del.addEventListener("click", () => {
				section.items = section.items.filter((i) => i !== item);
				changed();
			});
			if (item.kind === "morse" || item.kind === "morse_free") {
				const edit = button("", "✏️", t("morseEdit"));
				edit.addEventListener("click", () => editMorse(item));
				ctl.append(edit);
			}
			if (!NO_LABEL.includes(item.kind)) {
				const style = button("vstyle", "⚙", t("itemSettings"));
				style.addEventListener("click", () => openStyleMenu(item, style));
				ctl.append(style);
			}
			ctl.append(size, del);
			wrap.append(ctl);
			wrap.addEventListener("pointerdown", (e) => startDrag(e, "item", wrap));
		}
		update();
		updaters.set(item.id, update);
		return wrap;
	}

	function renderSection(section) {
		const sec = el("section", `vsec ${section.width}${section.tall ? " tall" : ""}`);
		sec.dataset.id = section.id;
		const head = el("div", "vhead");
		if (unlocked) {
			const input = el("input", "vtitle-input");
			input.value = section.title;
			input.maxLength = MAX_TITLE;
			input.setAttribute("aria-label", t("sectionTitle"));
			input.addEventListener("input", () => {
				section.title = input.value;
				scheduleSave();
			});
			input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
			head.append(input);
			const ctl = el("div", "vsctl");
			// Largeur : − / pleine, demie ou tiers / + (bouton grisé à la borne), comme la taille des cases.
			const width = el("span", "vsize");
			const wstep = (dir, text, key) => {
				const to = widthStep(section.width, dir);
				const b = button("", text, to === undefined ? t(key) : fmt(`${key}To`, t(`width_${to}`)));
				b.disabled = to === undefined;
				b.addEventListener("click", () => {
					section.width = to;
					changed();
				});
				return b;
			};
			const wname = el("span", "vsize-n vsize-w", t(`width_${section.width}`));
			wname.title = t("sectionWidth");
			width.append(wstep(-1, "−", "sectionNarrower"), wname, wstep(1, "+", "sectionWider"));
			const tall = button(section.tall ? "on" : "", "↕", t("sectionTall"));
			tall.setAttribute("aria-pressed", String(!!section.tall));
			tall.addEventListener("click", () => {
				setTall(section, !section.tall);
				changed();
			});
			const handle = button("vhandle", "⋮⋮", t("moveSection"));
			handle.addEventListener("pointerdown", (e) => startDrag(e, "section", sec));
			const del = button("", "✕", t("deleteSection"));
			del.addEventListener("click", () => {
				if (section.items.length && !confirm(fmt("confirmDeleteSection", section.title))) return;
				view.sections = view.sections.filter((s) => s !== section);
				changed();
			});
			ctl.append(width, tall, handle, del);
			head.append(ctl);
		} else {
			const title = el("h2", "vtitle", section.title);
			head.append(title);
			// Section « ship » (modèles Instrument de bord) : marque et nom du vaisseau à côté du titre.
			if (section.id === "ship") {
				const ship = el("span", "vtitle-ship");
				title.append(ship);
				const update = () => {
					const m = state?.shipStatus?.model;
					ship.textContent = m ? ` — ${[m.manufacturerShort, m.name].filter(Boolean).join(" ")}` : "";
				};
				update();
				updaters.set(`section:${section.id}`, update);
			}
		}
		const grid = el("div", "vgrid");
		grid.append(...section.items.map((i) => renderItem(section, i)));
		sec.append(head, grid);
		if (unlocked && section.items.length < MAX_ITEMS) {
			const add = button("vadd", fmt("addIn", section.title));
			add.addEventListener("click", () => openMenu(section, add));
			sec.append(add);
		} else if (!section.items.length) sec.append(el("p", "hint", t("emptySection")));
		return sec;
	}

	/**
	 * Vue créée par un plugin : son nom, et un avertissement quand il est arrêté (la vue reste, avec ses cases).
	 * Sur un autre appareil que le PC, l'état des plugins n'est pas connu : seulement le nom.
	 */
	function pluginBanner() {
		if (!view.plugin) return null;
		const info = ctx.pluginState?.(view.plugin);
		const name = info?.name ?? view.plugin;
		if (info && info.state !== "running") return el("p", "vplugin off", `⏸ ${fmt("viewPluginStopped", name)}`);
		return el("p", "vplugin", `🧩 ${fmt("viewPluginOwned", name)}`);
	}

	function render() {
		closeMenu();
		updaters = new Map();
		root.classList.toggle("editing", unlocked);
		// Cockpit : le HUD (cadres, chiffres) plus les boutons centrés et les jauges sur une ligne de la maquette.
		root.classList.toggle("hud", view?.look === "hud" || view?.look === "cockpit");
		root.classList.toggle("cockpit", view?.look === "cockpit");
		root.classList.toggle("instrument", view?.look === "instrument");
		if (!view) return root.replaceChildren(el("p", "hint", t("connecting")));
		const list = el("div", "vsections");
		list.append(...view.sections.map(renderSection));
		const parts = unlocked ? [renderViewHead(), list] : [list];
		const banner = pluginBanner();
		if (banner) parts.unshift(banner);
		if (unlocked && view.sections.length < MAX_SECTIONS) {
			const add = button("vnewsec", t("addSection"));
			add.addEventListener("click", () => {
				const section = { id: newId(), title: t("newSection"), width: "half", items: [] };
				view.sections.push(section);
				changed();
				const input = root.querySelector(`.vsec[data-id="${section.id}"] .vtitle-input`);
				input?.focus();
				input?.select();
			});
			parts.push(add);
		}
		if (!view.sections.length && !unlocked) parts.push(el("p", "hint", t("viewEmpty")));
		if (!fixed) parts.push(el("p", "hint vhint", unlocked ? t("viewHintEdit") : t("viewHintLocked")));
		root.replaceChildren(...parts);
	}

	/** En édition : nom de la vue et suppression. */
	function renderViewHead() {
		const head = el("div", "vviewhead");
		const input = el("input", "vname-input");
		input.value = view.name;
		input.maxLength = MAX_NAME;
		input.setAttribute("aria-label", t("viewName"));
		input.title = t("viewName");
		input.addEventListener("input", () => {
			view.name = input.value;
			publish();
			scheduleSave();
		});
		input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
		// Nom effacé : l'appli enregistre « Vue » / « View » ; l'afficher tout de suite (onglet jamais vide).
		input.addEventListener("blur", () => {
			if (view.name.trim()) return;
			view.name = input.value = t("viewNameEmpty");
			publish();
			scheduleSave();
		});
		head.append(input, renderLookPicker());
		if (unlocked) {
			const share = { t, fmt, api, showMessage: ctx.showMessage };
			const exp = button("vshare", t("exportView"));
			// Export lu sur le serveur : la dernière modification doit y être enregistrée d'abord.
			exp.addEventListener("click", async () => {
				if (saveTimer) await save();
				openExport(share, view, views ?? [view]);
			});
			const imp = button("vshare", t("importView"));
			imp.addEventListener("click", () => openImport(share, imported));
			head.append(exp, imp);
		}
		if (views && views.length > 1) {
			const del = button("vdelview", t("deleteView"));
			del.addEventListener("click", deleteView);
			head.append(del);
		}
		return head;
	}

	/** Habillage de la vue : Standard / HUD vaisseau (`look` placé après `sections`, comme l'appli). */
	function renderLookPicker() {
		const box = el("div", "vlook");
		box.setAttribute("role", "radiogroup");
		box.setAttribute("aria-label", t("viewLook"));
		box.append(el("span", "vlook-label", t("viewLook")));
		for (const [look, key] of [
			["standard", "lookStandard"],
			["hud", "lookHud"],
			["cockpit", "lookCockpit"],
			["instrument", "lookInstrument"],
		]) {
			const b = button("vlook-opt", t(key));
			b.setAttribute("role", "radio");
			b.setAttribute("aria-checked", String((view.look ?? "standard") === look));
			b.addEventListener("click", () => {
				if ((view.look ?? "standard") === look) return;
				if (look === "standard") delete view.look;
				else view.look = look;
				publish();
				changed();
			});
			box.append(b);
		}
		return box;
	}

	function renderLock() {
		if (!lockBtn) return;
		lockBtn.hidden = !visible;
		lockBtn.textContent = unlocked ? t("viewDone") : t("viewLocked");
		lockBtn.classList.toggle("open", unlocked);
	}

	// ---------- Enregistrement ----------
	function newId() {
		const used = new Set(view.sections.flatMap((s) => [s.id, ...s.items.map((i) => i.id)]));
		let id;
		do id = Math.random().toString(36).slice(2, 10);
		while (used.has(id));
		return id;
	}

	function changed() {
		render();
		scheduleSave();
	}

	function scheduleSave() {
		if (fixed) return;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(save, SAVE_DELAY);
	}

	const api = (path, init = {}) =>
		fetch(`${path}${path.includes("?") ? "&" : "?"}lang=${ctx.lang()}`, {
			...init,
			headers: { authorization: `Bearer ${ctx.token()}`, ...(init.body ? { "content-type": "application/json" } : {}) },
		});

	/** Enregistre la vue affichée (elle seule : les autres vues ne sont pas touchées). */
	async function save() {
		if (fixed) return;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		if (!view) return;
		const id = view.id;
		try {
			const r = await api(`/api/v1/views/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ name: view.name, sections: view.sections, ...(view.look ? { look: view.look } : {}) }) });
			if (r.status === 401) return ctx.showMessage(t("badToken"));
			if (r.status === 404) return id === currentId && ctx.onMissing();
			if (!r.ok) return ctx.showMessage(t("viewSaveFailed"));
			// Version normalisée par l'appli (nom ou titre vide, trop long) : reprise si rien n'a bougé depuis.
			const saved = await r.json();
			if (id === currentId && !busy() && JSON.stringify(saved) !== JSON.stringify(view)) {
				view = saved;
				publish();
				render();
			}
		} catch {
			ctx.showMessage(t("viewSaveFailed"));
		}
	}

	/** Édition en cours ici : une vue reçue ne doit pas remplacer la vue affichée. */
	function busy() {
		// Message morse en cours de frappe : ne pas remplacer la case (texte et focus perdus).
		const typing = document.activeElement?.matches?.(".vmorse-input") || (unlocked && document.activeElement?.matches?.(".vtitle-input, .vname-input, .vslabel"));
		return Boolean(drag || saveTimer || typing);
	}

	/** Liste des vues avec la vue affichée telle qu'éditée ici, pour les onglets. */
	function publish() {
		if (!views) return;
		views = views.map((v) => (view && v.id === view.id ? view : v));
		ctx.onViewsChanged(views);
	}

	async function deleteView() {
		if (!view || !confirm(fmt("confirmDeleteView", view.name))) return;
		clearTimeout(saveTimer);
		saveTimer = undefined;
		const id = view.id;
		try {
			const r = await api(`/api/v1/views/${encodeURIComponent(id)}`, { method: "DELETE" });
			if (r.status === 401) return ctx.showMessage(t("badToken"));
			if (r.status === 409) return ctx.showMessage(t("lastView"));
			if (r.status !== 204 && r.status !== 404) return ctx.showMessage(t("viewSaveFailed"));
		} catch {
			return ctx.showMessage(t("viewSaveFailed"));
		}
		views = views.filter((v) => v.id !== id);
		ctx.onViewsChanged(views);
		if (id === currentId) ctx.onMissing();
	}

	/** Nom proposé : « Vue N » avec le plus petit N ≥ 2 libre. */
	function newViewName() {
		const names = new Set((views ?? []).map((v) => v.name));
		let n = 2;
		while (names.has(fmt("newViewName", n))) n++;
		return fmt("newViewName", n);
	}

	// ---------- Menu « Ajouter » ----------
	const menu = el("div", "vmenu");
	menu.hidden = true;
	document.body.append(menu);
	let menuTab = "character";
	let menuSection = null;
	/** Case dont le menu ⚙ est ouvert. */
	let menuItem = null;
	let currentItem = null;

	function menuEntries(tab) {
		const kindText = (k) => t(k);
		if (!state && tab !== "actions" && tab !== "emotes" && tab !== "morse") return [];
		switch (tab) {
			case "character":
				return [
					...state.vitals.map((v) => ({ kind: "vital", ref: v.id, label: v.label, type: kindText(GAUGES.includes(v.id) ? "kindGauge" : "kindValue") })),
					{ kind: "who_card", label: t("whoCard"), type: kindText("kindCard") },
					{ kind: "mission_card", label: t("missionTitle"), type: kindText("kindCard") },
					...Object.keys(INFO.character_info).map((ref) => ({ kind: "character_info", ref, label: t(INFO.character_info[ref]), type: kindText("kindState") })),
				];
			case "game":
				return [
					{ kind: "perf_card", label: t("perfTitle"), type: kindText("kindCard") },
					...Object.keys(INFO.game_info).map((ref) => ({ kind: "game_info", ref, label: t(INFO.game_info[ref]), type: kindText("kindState") })),
				];
			case "ship":
				return [
					...state.shipStatus.instruments.map((i) => ({
						kind: "instrument",
						ref: i.id,
						label: i.label,
						type: kindText(GAUGES.includes(i.id) ? "kindGauge" : "kindValue"),
					})),
					{ kind: "ship_card", label: t("shipCard"), type: kindText("kindCard") },
					{ kind: "quantum_card", label: t("qtTitle"), type: kindText("kindCard") },
					{ kind: "annunciators", label: t("warningLights"), type: kindText("kindLights") },
					...Object.keys(INFO.ship_info).map((ref) => ({ kind: "ship_info", ref, label: t(INFO.ship_info[ref]), type: kindText("kindState") })),
					...state.ship.map((f) => ({ kind: "ship_function", ref: f.id, label: f.label, type: kindText("kindButton") })),
				];
			case "actions":
				return actionGroups
					.filter((g) => g.category !== EMOTES)
					.flatMap((g) => g.actions.map((a) => ({ kind: "action", ref: a.name, label: a.label, type: g.label })));
			case "emotes":
				return (actionGroups.find((g) => g.category === EMOTES)?.actions ?? []).map((a) => ({ kind: "action", ref: a.name, label: a.label, type: kindText("kindButton") }));
			case "morse":
				return [
					{ kind: "morse", label: t("morseMessage"), type: kindText("kindButton") },
					{ kind: "morse_free", label: t("morseFree"), type: kindText("kindField") },
				];
		}
		return [];
	}

	function renderMenu() {
		const tabs = el("div", "vmtabs");
		for (const [id, key] of [
			["character", "tabCharacter"],
			["ship", "tabShip"],
			["game", "menuGame"],
			["actions", "menuActions"],
			["emotes", "emotes"],
			["morse", "menuMorse"],
		]) {
			const b = button(id === menuTab ? "on" : "", t(key));
			b.addEventListener("click", () => {
				menuTab = id;
				renderMenu();
			});
			tabs.append(b);
		}
		const search = el("input", "vmsearch");
		search.type = "search";
		search.placeholder = t("search");
		const list = el("div", "vmlist");
		const fill = () => {
			const q = search.value.trim().toLowerCase();
			const entries = menuEntries(menuTab).filter((e) => !q || e.label.toLowerCase().includes(q));
			if (!entries.length) return list.replaceChildren(el("p", "hint", q ? t("noResult") : t("menuEmpty")));
			list.replaceChildren(
				...entries.map((entry) => {
					const b = button("vmi");
					b.append(el("span", "", entry.label), el("small", "", entry.type));
					b.addEventListener("click", () => addItem(entry));
					return b;
				}),
			);
		};
		search.addEventListener("input", fill);
		fill();
		menu.replaceChildren(tabs, search, list);
		return search;
	}

	function openMenu(section, anchor) {
		menuSection = section;
		menu.hidden = false;
		const search = renderMenu();
		const r = anchor.getBoundingClientRect();
		const width = Math.min(420, window.innerWidth - 16);
		menu.style.width = `${width}px`;
		menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + window.scrollX}px`;
		menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
		if (window.matchMedia("(pointer: fine)").matches) search.focus();
	}

	function closeMenu() {
		menu.hidden = true;
		menu.classList.remove("vstylemenu");
		menuSection = null;
	}

	/** Menu ⚙ d'une case : styles permis, chacun avec un aperçu dessiné à partir de la donnée actuelle. */
	/** Choix fait dans le menu ⚙ : la vue est redessinée, le menu reste ouvert sur la case (choix coché visible). */
	function changedKeepMenu() {
		const item = menuItem;
		changed();
		const anchor = item && root.querySelector(`.vitem[data-id="${item.id}"] .vstyle`);
		if (anchor) openStyleMenu(item, anchor);
	}

	function openStyleMenu(item, anchor) {
		menuSection = null;
		currentItem = item;
		/** Remet les clés de la case dans l'ordre de l'appli après une modification. */
		const reorder = () => {
			const o = ordered(item);
			for (const k of Object.keys(item)) delete item[k];
			Object.assign(item, o);
		};
		const name = el("input", "vslabel");
		name.maxLength = MAX_LABEL * 2;
		name.value = item.label ?? "";
		name.placeholder = labelOf(item);
		name.setAttribute("aria-label", t("itemLabel"));
		name.addEventListener("input", () => {
			const v = [...name.value.trim()].slice(0, MAX_LABEL).join("").trim();
			if (v) item.label = v;
			else delete item.label;
			reorder();
			updaters.get(item.id)?.();
			scheduleSave();
		});
		name.addEventListener("keydown", (e) => e.key === "Enter" && closeMenu());
		const nameRow = el("label", "vslabel-row");
		nameRow.append(el("span", "", t("itemLabel")), name);
		if (!STYLED_KINDS.includes(item.kind)) {
			menu.replaceChildren(el("p", "vstitle", labelOf(item)), nameRow);
			return showStyleMenu(anchor, name);
		}
		const data = itemData(item);
		const info = INFO_KINDS.includes(item.kind);
		// D'après la constante (liste connue) plutôt que la frame : à pied, les instruments n'ont pas de pourcentage.
		const isGauge = info ? false : GAUGES.includes(item.ref) || typeof data.percent === "number";
		const current = item.display?.style ?? "card";
		const list = el("div", "vslist");
		list.setAttribute("role", "radiogroup");
		list.setAttribute("aria-label", t("itemStyle"));
		for (const style of stylesFor(item.kind, isGauge, item.ref)) {
			const b = button("vsopt");
			b.setAttribute("role", "radio");
			b.setAttribute("aria-checked", String(style === current));
			const preview = el("div", "vsprev");
			preview.append(VALUE_KINDS.includes(item.kind) ? (renderGauge(style, data, 1)?.el ?? ctx.card(data)) : controlPreview(style, item));
			b.append(preview, el("span", "", t(`style_${style}`)));
			b.addEventListener("click", () => {
				const display = orderedDisplay({ ...item.display, style: style === "card" ? undefined : style });
				if (display) item.display = display;
				else delete item.display;
				reorder();
				changedKeepMenu();
			});
			list.append(b);
		}
		const parts = [el("p", "vstitle", labelOf(item)), nameRow];
		// Solde : longueur affichée (compacte 12,3 k ou tous les chiffres).
		if (item.kind === "vital" && item.ref === "balance") {
			const row = el("div", "vlook");
			row.setAttribute("role", "radiogroup");
			row.setAttribute("aria-label", t("moneyLength"));
			row.append(el("span", "vlook-label", t("moneyLength")));
			for (const [len, key] of [
				[undefined, "moneyCompact"],
				["k", "moneyK"],
				["m", "moneyM"],
				["full", "moneyFull"],
			]) {
				const b = button("vlook-opt", t(key));
				b.setAttribute("role", "radio");
				b.setAttribute("aria-checked", String(item.display?.length === len));
				b.addEventListener("click", () => {
					const display = orderedDisplay({ ...item.display, length: len });
					if (display) item.display = display;
					else delete item.display;
					reorder();
					changedKeepMenu();
				});
				row.append(b);
			}
			parts.push(row);
		}
		menu.replaceChildren(...parts, el("p", "vstitle", t("itemStyle")), list);
		showStyleMenu(anchor, list.querySelector('[aria-checked="true"]'));
	}

	function showStyleMenu(anchor, focus) {
		menuItem = currentItem;
		menu.classList.add("vstylemenu");
		menu.hidden = false;
		const r = anchor.getBoundingClientRect();
		const width = Math.min(420, window.innerWidth - 16);
		menu.style.width = `${width}px`;
		menu.style.left = `${Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)) + window.scrollX}px`;
		menu.style.top = `${r.bottom + 6 + window.scrollY}px`;
		if (window.matchMedia("(pointer: fine)").matches) focus?.focus();
	}

	function addItem(entry) {
		const section = menuSection;
		if (!section || section.items.length >= MAX_ITEMS) return closeMenu();
		// Même ordre de clés que la vue renvoyée par l'appli (comparaison des copies sans re-rendu inutile).
		const item = { id: newId(), kind: entry.kind, ...(entry.ref ? { ref: entry.ref } : {}), size: entry.kind === "annunciators" || CARD_KINDS.includes(entry.kind) ? 2 : 1 };
		if (entry.kind === "morse") item.settings = { text: "SOS", ...MORSE_DEFAULT };
		if (entry.kind === "morse_free") item.settings = { ...MORSE_DEFAULT };
		section.items.push(item);
		changed();
		// Message enregistré : réglages ouverts tout de suite.
		if (entry.kind === "morse") editMorse(item);
	}

	document.addEventListener("pointerdown", (e) => {
		if (!menu.hidden && !menu.contains(e.target) && !e.target.closest?.(".vadd, .vstyle")) closeMenu();
	});
	document.addEventListener("keydown", (e) => e.key === "Escape" && closeMenu());

	// ---------- Glisser-déposer (souris + tactile) ----------
	function startDrag(e, type, node) {
		if (!unlocked || e.button > 0) return;
		// Les boutons 1× / 2× / ✕ restent cliquables ; le reste de la case sert de poignée.
		if (type === "item" && e.target.closest(".vctl")) return;
		drag = { type, node, id: node.dataset.id, x: e.clientX, y: e.clientY, started: false, pointer: e.pointerId };
		if (type === "item") drag.item = view.sections.flatMap((s) => s.items).find((i) => i.id === drag.id);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", cancelDrag);
	}

	function begin() {
		const r = drag.node.getBoundingClientRect();
		drag.started = true;
		drag.dx = drag.x - r.left;
		drag.dy = drag.y - r.top;
		const ghost = drag.node.cloneNode(true);
		ghost.classList.add("vghost");
		ghost.style.width = `${r.width}px`;
		ghost.style.height = `${r.height}px`;
		document.body.append(ghost);
		drag.ghost = ghost;
		const ph = el("div", `vph ${drag.node.className.replace(/\b(vitem|vsec)\b/, "")}`);
		ph.style.minHeight = `${Math.min(r.height, 140)}px`;
		drag.node.after(ph);
		drag.node.style.display = "none";
		drag.ph = ph;
		closeMenu();
	}

	function onMove(e) {
		if (!drag || e.pointerId !== drag.pointer) return;
		if (!drag.started) {
			if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
			begin();
		}
		e.preventDefault();
		drag.ghost.style.left = `${e.clientX - drag.dx}px`;
		drag.ghost.style.top = `${e.clientY - drag.dy}px`;
		const hit = document.elementFromPoint(e.clientX, e.clientY);
		if (!hit) return;
		if (drag.type === "item") {
			const grid = hit.closest(".vsec")?.querySelector(".vgrid");
			if (grid && root.contains(grid)) placeItem(grid, e.clientX - drag.dx, e.clientY);
		} else {
			const target = hit.closest(".vsec");
			if (target && target !== drag.node && root.contains(target)) {
				const r = target.getBoundingClientRect();
				const before = (target.classList.contains("half") || target.classList.contains("third")) && window.innerWidth >= 1000 ? e.clientX < r.left + r.width / 2 : e.clientY < r.top + r.height / 2;
				if (before) target.before(drag.ph);
				else target.after(drag.ph);
			}
		}
		// Défilement automatique près des bords (tablette, longues vues).
		const edge = 60;
		if (e.clientY < edge) window.scrollBy(0, -12);
		else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
	}

	/**
	 * Place l'emplacement fantôme dans `grid` : colonne sous le bord gauche de la case glissée (`x`), et rang dans
	 * l'ordre de lecture d'après les cases déjà posées (au-dessus, ou sur la même ligne et plus à gauche = avant).
	 */
	function placeItem(grid, x, y) {
		const section = view.sections.find((s) => s.id === grid.closest(".vsec")?.dataset.id);
		if (!section) return;
		const slots = sectionSlots(section.width);
		const cs = getComputedStyle(grid);
		// Téléphone : grille plus étroite que la section (colonnes imposées) → pas de colonne libre.
		const cols = cs.gridTemplateColumns.split(" ").length;
		const r = grid.getBoundingClientRect();
		const gap = parseFloat(cs.columnGap) || 0;
		const span = Math.min(sizeSlots(drag.item.size), slots);
		drag.col = cols === slots ? fitCol(slotAt(x + 4, { left: r.left, width: r.width, gap }, slots), span, slots) : undefined;
		drag.ph.style.gridColumnStart = drag.col === undefined ? "" : String(drag.col);
		const others = [...grid.children].filter((c) => c.classList.contains("vitem") && c !== drag.node);
		const colX = drag.col === undefined ? x : r.left + ((drag.col - 1) * (r.width + gap)) / slots;
		const next = others.find((c) => {
			const b = c.getBoundingClientRect();
			return b.top > y || (b.bottom > y && b.left > colX);
		});
		if (next) {
			if (drag.ph.nextElementSibling !== next) next.before(drag.ph);
		} else if (grid.lastElementChild !== drag.ph) grid.append(drag.ph);
	}

	function onUp(e) {
		if (!drag || e.pointerId !== drag.pointer) return;
		const d = drag;
		stopListening();
		if (!d.started) return;
		if (d.type === "item") {
			const grid = d.ph.parentElement;
			const toSection = view.sections.find((s) => s.id === grid?.closest(".vsec")?.dataset.id);
			const fromSection = view.sections.find((s) => s.items.some((i) => i.id === d.id));
			if (toSection && fromSection && (toSection === fromSection || toSection.items.length < MAX_ITEMS)) {
				const item = fromSection.items.find((i) => i.id === d.id);
				fromSection.items = fromSection.items.filter((i) => i !== item);
				toSection.items.splice(countBefore(d.ph, "vitem", d.node), 0, item);
				// Colonne où elle a été lâchée (emplacements d'avant laissés vides) ; téléphone : à la suite.
				if (d.col === undefined || d.col === 1) delete item.col;
				else item.col = d.col;
				Object.assign(item, ordered(item));
			}
		} else {
			const before = countBefore(d.ph, "vsec", d.node);
			const section = view.sections.find((s) => s.id === d.id);
			view.sections = view.sections.filter((s) => s !== section);
			view.sections.splice(before, 0, section);
		}
		d.ghost.remove();
		changed();
	}

	/** Nombre d'éléments de la classe donnée avant l'emplacement (l'élément déplacé, caché, n'est pas compté). */
	function countBefore(ph, cls, moved) {
		const siblings = [...ph.parentElement.children];
		return siblings.slice(0, siblings.indexOf(ph)).filter((c) => c.classList.contains(cls) && c !== moved).length;
	}

	function cancelDrag() {
		const d = drag;
		stopListening();
		if (d?.started) {
			d.ghost.remove();
			render();
		}
	}

	function stopListening() {
		drag = null;
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", cancelDrag);
	}

	// ---------- Cadenas ----------
	lockBtn?.addEventListener("click", () => {
		if (unlocked && saveTimer) save();
		setUnlocked(!unlocked);
	});

	function setUnlocked(v) {
		if (fixed) return;
		unlocked = v;
		ctx.storage.set(UNLOCK_KEY, unlocked ? "1" : "0");
		renderLock();
		render();
		ctx.onLockChange?.(unlocked);
	}

	/** Après un import : liste relue (sans attendre l'événement views), puis la première vue importée est ouverte. */
	async function imported(ids) {
		try {
			const r = await api("/api/v1/views");
			if (r.ok) self.setViews((await r.json()).views);
		} catch {
			/* l'événement views suivra */
		}
		if (ids[0]) ctx.openView(ids[0]);
	}

	// ---------- Entrées depuis app.js ----------
	const self = {
		/** Vues reçues (connexion, ou création / modification / suppression depuis n'importe quel écran). */
		setViews(list) {
			const incoming = list.find((v) => v.id === currentId);
			// « Supprimer la vue » n'existe que s'il reste plus d'une vue : à redessiner quand ça change ailleurs.
			const deletable = (views?.length ?? 0) > 1;
			// Pendant un glisser, une saisie ou avant notre propre enregistrement, la vue affichée fait foi.
			const keep = view && incoming && busy();
			views = keep ? list.map((v) => (v.id === view.id ? view : v)) : list;
			ctx.onViewsChanged(views);
			if (currentId === null) return;
			if (!incoming) return ctx.onMissing();
			if (unlocked && !keep && view && deletable !== views.length > 1) render();
			if (keep || (view && JSON.stringify(incoming) === JSON.stringify(view))) return;
			view = structuredClone(incoming);
			render();
		},
		/** Affiche une vue (onglet choisi) ; `null` : aucune. Un enregistrement en attente de la vue précédente part d'abord. */
		show(id) {
			if (id === currentId) return;
			if (saveTimer) save();
			closeMenu();
			currentId = id;
			const found = views?.find((v) => v.id === id);
			view = found ? structuredClone(found) : null;
			if (id !== null && views && !found) return ctx.onMissing();
			render();
		},
		/** « ＋ » : crée une vue vide et renvoie son id (ou `null`), à ouvrir déverrouillée. */
		/** Fenêtre « Nouvelle vue » : Vierge ou un modèle ; `onCreated(id)` après la création. */
		openNewView(onCreated) {
			if (views && views.length >= MAX_VIEWS) return ctx.showMessage(t("tooManyViews"));
			openNewView({ t, fmt, api, lang: ctx.lang }, async (template) => onCreated(await this.addView(template)));
		},
		/** Crée une vue : vide (« Vue N »), ou depuis un modèle `{ id, name }` (nom rendu unique). */
		async addView(template) {
			const fail = (key) => (ctx.showMessage(t(key)), null);
			if (views && views.length >= MAX_VIEWS) return fail("tooManyViews");
			const names = (views ?? []).map((v) => v.name);
			const body = template ? { template: template.id, name: uniqueName(template.name, names) } : { name: newViewName() };
			try {
				const r = await api("/api/v1/views", { method: "POST", body: JSON.stringify(body) });
				if (r.status === 401) return fail("badToken");
				if (r.status === 409) return fail("tooManyViews");
				if (!r.ok) return fail("viewSaveFailed");
				const created = await r.json();
				if (!views?.some((v) => v.id === created.id)) views = [...(views ?? []), created];
				ctx.onViewsChanged(views);
				return created.id;
			} catch {
				return fail("viewSaveFailed");
			}
		},
		/** Une vue est affichée et déverrouillée (édition en cours). */
		isEditing() {
			return visible && unlocked;
		},
		/** Reverrouille (enregistrement en attente envoyé d'abord) : avant un changement de vue automatique. */
		lock() {
			if (!unlocked) return;
			if (saveTimer) save();
			setUnlocked(false);
		},
		/** Déverrouille et place le curseur dans le nom (vue tout juste créée). */
		editName() {
			setUnlocked(true);
			const input = root.querySelector(".vname-input");
			input?.focus();
			input?.select();
		},
		/** Vue intégrée (mode `fixed`) : affiche cette vue telle quelle. */
		setFixedView(v) {
			view = v ? structuredClone(v) : null;
			currentId = v ? "__fixed" : null;
			render();
		},
		setState(s) {
			const first = !state;
			state = s;
			if (first) return render();
			for (const update of updaters.values()) update();
		},
		setActions(groups) {
			actionGroups = groups;
			for (const update of updaters.values()) update();
		},
		setVisible(v) {
			visible = v;
			renderLock();
			if (!v) closeMenu();
		},
		applyTexts() {
			renderLock();
			render();
		},
		/** Un plugin a démarré ou s'est arrêté : redessiner si la vue montrée est la sienne. */
		pluginsChanged() {
			if (view?.plugin) render();
		},
	};
	return self;
}
