// SPDX-License-Identifier: MPL-2.0
// Encarts des données du build 13273298 : saut quantique, qui / où / mode, mission suivie, performances.
// Construits à partir de l'événement « state » ; utilisés dans les onglets Vaisseau, Personnage et Debug et comme cases
// des vues. Mêmes classes que l'encart « Mon vaisseau » (shipcard.js).

import { num, pageLanguage } from "./numbers.js";

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};

function bar(percent, level = "") {
	const b = el("div", `sc-bar${level ? ` level-${level}` : ""}`);
	const fill = el("i");
	fill.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
	b.append(fill);
	return b;
}
function mini(label, value, extra) {
	const m = el("div", "sc-mini");
	m.append(el("div", "sc-l", label), el("div", "sc-v", value));
	if (extra) m.append(extra);
	return m;
}
const pct = (p) => `${num(String(Math.floor(p + 1e-6)))} %`;
const round = (n, d = 0) => num(n.toFixed(d).replace(".", pageLanguage() === "fr" ? "," : "."));

// ---------- Saut quantique ----------

/**
 * Progression d'un saut : le jeu ne l'envoie pas, on la calcule avec la plus grande distance vue depuis le début du saut.
 * Remise à zéro quand on ne saute plus.
 */
let travelStart = null;
export function travelProgress(q) {
	if (!q || q.state !== "traveling" || typeof q.distanceM !== "number") {
		travelStart = null;
		return null;
	}
	if (travelStart === null || q.distanceM > travelStart) travelStart = q.distanceM;
	return travelStart > 0 ? (1 - q.distanceM / travelStart) * 100 : null;
}

/** Temps restant en « m:ss » (ou « h:mm:ss »), pour le centre de l'anneau. */
export function ringClock(seconds) {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const ss = String(s % 60).padStart(2, "0");
	return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const SVG = "http://www.w3.org/2000/svg";
/** Anneau de progression (habillage « Instrument de bord » seulement : caché ailleurs par la feuille de style). */
function qtRing(percent, center, caption) {
	const box = el("div", "qt-ring");
	const svg = document.createElementNS(SVG, "svg");
	svg.setAttribute("viewBox", "0 0 170 170");
	svg.setAttribute("aria-hidden", "true");
	const r = 74;
	const c = 2 * Math.PI * r;
	const circle = (stroke, extra = {}) => {
		const k = document.createElementNS(SVG, "circle");
		for (const [a, v] of Object.entries({ cx: 85, cy: 85, r, fill: "none", stroke, "stroke-width": 7, ...extra })) k.setAttribute(a, String(v));
		return k;
	};
	svg.append(circle("var(--line)"));
	const p = Math.max(0, Math.min(100, percent));
	if (p > 0) svg.append(circle("var(--accent)", { "stroke-dasharray": `${(p / 100) * c} ${c}`, transform: "rotate(-90 85 85)" }));
	for (let i = 0; i < 48; i++) {
		const a = (i / 48) * 2 * Math.PI;
		const r2 = i % 4 ? 63 : 66;
		const line = document.createElementNS(SVG, "line");
		for (const [k, v] of Object.entries({ x1: 85 + 60 * Math.sin(a), y1: 85 - 60 * Math.cos(a), x2: 85 + r2 * Math.sin(a), y2: 85 - r2 * Math.cos(a), stroke: "var(--line)", "stroke-width": 1.5 })) line.setAttribute(k, String(v));
		svg.append(line);
	}
	box.append(svg, el("div", "qt-ring-num", center), el("div", "sc-l", caption));
	return box;
}

const QT_PILL = { off: "", idle: "", aligning: "warn", traveling: "qt", cooldown: "" };

/**
 * Encart « Saut quantique ». Même structure dans tous les états (en-tête, une ligne de destination ou d'état, anneau,
 * deux cases avec barre) : la taille de l'encart ne bouge pas entre charge, saut et refroidissement.
 */
export function quantumCard(state, t) {
	const q = state?.shipStatus?.quantum;
	const box = el("div", "shipcard qtcard");
	const head = el("div", "qt-head");
	head.append(el("b", "", `🌀 ${t("qtTitle")}`));
	box.append(head);
	if (!q) {
		travelProgress(null);
		box.append(el("p", "hint", t("qtNone")));
		return box;
	}
	box.dataset.state = q.state;
	head.append(el("span", `sc-pill ${QT_PILL[q.state] ?? ""}`, q.label));
	const traveling = q.state === "traveling";
	const progress = travelProgress(q);

	// Une seule ligne : destination (et distance hors saut), sinon une phrase d'état.
	const msg = q.state === "off" ? t("qtOff") : q.state === "cooldown" ? t("qtCooldown") : q.destination ? null : t("qtNoDestination");
	const dest = msg
		? el("div", "qt-dest qt-msg", msg)
		: el("div", "qt-dest", `→ ${q.destination}${!traveling && q.distanceM !== null ? ` · ${num(q.distanceText)}` : ""}`);
	dest.title = dest.textContent;
	box.append(dest);

	if (traveling) box.append(qtRing(progress ?? 0, q.etaSeconds != null ? ringClock(q.etaSeconds) : "—", t("qtEta")));
	else if (q.state === "aligning") box.append(qtRing(q.calibration, pct(q.calibration), t("qtCalibration")));
	else box.append(qtRing(0, "—", q.label));

	const grid = el("div", "sc-grid");
	if (traveling) {
		// Barre vide et invisible sous « Arrivée dans » : même hauteur que les cases avec barre.
		const spacer = bar(0);
		spacer.style.visibility = "hidden";
		grid.append(mini(t("qtEta"), q.etaText, spacer), mini(t("qtDistance"), num(q.distanceText), bar(progress ?? 0, "ok")));
	} else if (q.state === "off") {
		grid.append(mini(t("qtSpool"), "—", bar(0)), mini(t("qtCalibration"), "—", bar(0)));
	} else {
		grid.append(mini(t("qtSpool"), pct(q.spool), bar(q.spool)), mini(t("qtCalibration"), pct(q.calibration), bar(q.calibration, q.calibration >= 100 ? "ok" : "warn")));
	}
	box.append(grid);
	return box;
}

// ---------- Qui, où, mode ----------

/** Pastilles « mode », « armistice », « CrimeStat » et ligne du lieu (en tête de l'onglet Personnage). */
export function whoCard(state, t) {
	const c = state?.character;
	const box = el("div", "shipcard whocard");
	if (!c?.available) {
		box.append(el("p", "hint", t("notSpawned")));
		return box;
	}
	const top = el("div", "who-top");
	if (c.playerName) top.append(el("span", "who-name", `🧑‍🚀 ${c.playerName}`));
	const pills = el("div", "sc-pills");
	if (c.mode !== "unknown") pills.append(el("span", "sc-pill", `${MODE_ICON[c.mode] ?? "🎮"} ${c.modeLabel}`));
	if (c.armistice) pills.append(el("span", "sc-pill ok", `🛡 ${t("armistice")}`));
	if (c.crimeStat !== null && (c.crimeStat > 0 || c.playerName)) {
		pills.append(el("span", `sc-pill ${c.crimeStat > 0 ? "bad" : ""}`, `${t("crimeStat")} ${stars(c.crimeStat)}`));
	}
	top.append(pills);
	box.append(top);
	if (c.location.length) {
		const line = el("div", "who-where", `📍 ${c.location.join(" › ")}`);
		if (c.jurisdiction) line.append(el("span", "who-jur", ` · ${t("jurisdiction")} ${c.jurisdiction}`));
		box.append(line);
	} else if (c.jurisdiction) box.append(el("div", "who-where", `${t("jurisdiction")} ${c.jurisdiction}`));
	return box;
}

export const MODE_ICON = {
	inactive: "💤",
	flight: "🚀",
	combat: "⚔",
	turret: "🎯",
	missile: "🚀",
	scanning: "📡",
	mining: "⛏",
	quantum_navigation: "🌀",
	refuel: "⛽",
	salvage: "♻",
};
/** CrimeStat en étoiles (5 au plus affichées). */
export const stars = (n) => (n > 0 ? "★".repeat(Math.min(n, 5)) : "0");

// ---------- Mission suivie ----------

/** Temps restant avant la fin d'une mission : « 1 h 12 », « 8 min », « terminée ». */
export function remaining(endsAt, now, t) {
	const s = Math.round((endsAt - now) / 1000);
	if (s <= 0) return t("missionEnded");
	if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min`;
	return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
}

export function missionCard(state, t) {
	const m = state?.character?.mission;
	const box = el("div", "shipcard missioncard");
	if (!m) {
		box.append(el("div", "sc-l", `📜 ${t("missionTitle")}`), el("p", "hint", t("missionNone")));
		return box;
	}
	box.append(el("div", "sc-l", `📜 ${t("missionTitle")}${m.giver ? ` · ${m.giver}` : ""}`), el("div", "mission-title", m.title));
	if (m.objective) box.append(el("div", "mission-obj", `🎯 ${m.objective}`));
	if (m.total > 0) {
		box.append(el("div", "sc-l", `${t("missionObjectives")} ${m.done} / ${m.total}`), bar((m.done / m.total) * 100, "ok"));
	}
	if (m.endsAt) box.append(el("div", "sc-l mission-end", `⏱ ${t("missionEnds")} ${remaining(m.endsAt, Date.now(), t)}`));
	return box;
}

// ---------- Performances ----------

const mb = (v) => (v >= 1024 ? `${round(v / 1024, 1)} ${pageLanguage() === "fr" ? "Go" : "GB"}` : `${Math.round(v)} ${pageLanguage() === "fr" ? "Mo" : "MB"}`);
const bps = (v) => (v >= 1e6 ? `${round(v / 1e6, 1)} Mb/s` : `${Math.round(v / 1e3)} kb/s`);

export function perfCard(state, t) {
	const p = state?.game?.perf;
	const box = el("div", "shipcard perfcard");
	box.append(el("div", "sc-l", `🎞 ${t("perfTitle")}`));
	if (!p) {
		box.append(el("p", "hint", state?.game?.available ? t("perfNone") : t("gameNone")));
		return box;
	}
	const grid = el("div", "sc-grid");
	grid.append(mini(t("perfFps"), String(Math.round(p.fps)), el("div", "sc-l", `${round(p.frameMs, 1)} ms`)));
	grid.append(mini(t("perfThreads"), [p.mainMs, p.renderMs, p.gpuMs].filter((x) => x !== null).map((x) => round(x, 1)).join(" · ") + " ms"));
	if (p.vramUsedMb !== null) {
		const ratio = p.vramBudgetMb ? (p.vramUsedMb / p.vramBudgetMb) * 100 : 0;
		grid.append(mini(t("perfVram"), p.vramBudgetMb ? `${mb(p.vramUsedMb)} / ${mb(p.vramBudgetMb)}` : mb(p.vramUsedMb), p.vramBudgetMb ? bar(ratio, ratio >= 90 ? "bad" : ratio >= 75 ? "warn" : "ok") : undefined));
	}
	if (p.pingMs !== null) {
		const sub = el("div", "sc-l", `${t("perfLoss")} ${round(p.lossPercent ?? 0, 1)} % · ↓ ${bps(p.inBps ?? 0)} ↑ ${bps(p.outBps ?? 0)}`);
		grid.append(mini(t("perfPing"), `${Math.round(p.pingMs)} ms`, sub));
	}
	if (p.serverFps !== null) grid.append(mini(t("perfServer"), `${Math.round(p.serverFps)} FPS`, el("div", "sc-l", `${t("perfHitches")} ${p.hitches ?? 0}`)));
	if (p.shard) {
		const s = mini(t("perfShard"), p.shard);
		if (p.shardId) s.title = p.shardId;
		grid.append(s);
	}
	box.append(grid);
	return box;
}

// ---------- Valeurs simples (cases des vues, barre du haut) ----------

/** Texte d'une info « jeu » (case `game_info`). */
export function gameInfoText(state, ref, t) {
	const g = state?.game;
	if (!g?.available) return "—";
	const p = g.perf;
	switch (ref) {
		case "state":
			return g.label;
		case "fps":
			return p ? String(Math.round(p.fps)) : "—";
		case "frame_time":
			return p ? `${round(p.frameMs, 1)} ms` : "—";
		case "gpu":
			return p?.gpuMs != null ? `${round(p.gpuMs, 1)} ms` : "—";
		case "vram":
			return p?.vramUsedMb != null ? (p.vramBudgetMb ? `${mb(p.vramUsedMb)} / ${mb(p.vramBudgetMb)}` : mb(p.vramUsedMb)) : "—";
		case "ping":
			return p?.pingMs != null ? `${Math.round(p.pingMs)} ms` : "—";
		case "packet_loss":
			return p?.lossPercent != null ? `${round(p.lossPercent, 1)} %` : "—";
		case "server_fps":
			return p?.serverFps != null ? String(Math.round(p.serverFps)) : "—";
		case "shard":
			return p?.shard ?? "—";
	}
	return "—";
}

// ---------- Rubriques des onglets (titre gris + cartes, comme Constantes ou Instruments) ----------

/** Carte des onglets (`.card`) : libellé, valeur, barre ou sous-ligne éventuelles. */
function tile(label, value, { level = "none", bar: percent, sub, span, small } = {}) {
	const c = el("div", `card level-${level}`);
	if (span) c.style.gridColumn = `span ${span}`;
	c.append(el("div", "label", label));
	const v = el("div", `value${small ? " value-small" : ""}`, value);
	c.append(v);
	if (percent !== undefined) {
		const b = el("div", "bar");
		const fill = el("i");
		fill.style.width = `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
		b.append(fill);
		c.append(b);
	}
	if (sub) c.append(el("div", "label card-sub", sub));
	return c;
}
const heading = (...parts) => {
	const h = el("h2", "sit-head");
	h.append(...parts);
	return h;
};
const cardsOf = (...items) => {
	const d = el("div", "cards");
	d.append(...items);
	return d;
};

/** Pastilles (mode, armistice, CrimeStat) à ajouter à la ligne « Assis · Pilote », et ligne du lieu en dessous. */
export function whoLine(state, t) {
	const c = state?.character;
	if (!c?.available) return { pills: [], where: "" };
	const pills = [];
	if (c.mode !== "unknown") pills.push(el("span", "sc-pill", `${MODE_ICON[c.mode] ?? "🎮"} ${c.modeLabel}`));
	if (c.armistice) pills.push(el("span", "sc-pill ok", `🛡 ${t("armistice")}`));
	if (c.crimeStat !== null && (c.crimeStat > 0 || c.playerName)) {
		pills.push(el("span", `sc-pill ${c.crimeStat > 0 ? "bad" : ""}`, `${t("crimeStat")} ${stars(c.crimeStat)}`));
	}
	const parts = [];
	if (c.location.length) parts.push(`📍 ${c.location.join(" › ")}`);
	if (c.jurisdiction) parts.push(`${t("jurisdiction")} ${c.jurisdiction}`);
	if (c.playerName) parts.push(`🧑‍🚀 ${c.playerName}`);
	return { pills, where: parts.join(" · ") };
}

/** Rubrique « Mission suivie » de l'onglet Personnage ; `[]` sans mission suivie. */
export function missionSection(state, t) {
	const m = state?.character?.mission;
	if (!m) return [];
	const head = heading(`📜 ${t("missionTitle")}${m.giver ? ` — ${m.giver}` : ""}`);
	const items = [tile(m.title, m.objective ? `🎯 ${m.objective}` : "—", { span: 3, small: true })];
	if (m.total > 0) items.push(tile(t("missionObjectives"), `${m.done} / ${m.total}`, { level: "ok", bar: (m.done / m.total) * 100 }));
	if (m.endsAt) items.push(tile(t("missionEnds"), remaining(m.endsAt, Date.now(), t)));
	return [head, cardsOf(...items)];
}

/** Rubrique « Performances » de l'onglet Debug ; `[]` si le jeu ne les envoie pas. */
export function perfSection(state, t) {
	const p = state?.game?.perf;
	if (!p) return [];
	const head = heading(`🎞 ${t("perfTitle")}${p.shard ? ` — ${p.shard}` : ""}`);
	if (p.shardId) head.title = p.shardId;
	const items = [tile(t("perfFps"), String(Math.round(p.fps)), { sub: `${round(p.frameMs, 1)} ms ${t("perfPerFrame")}` })];
	const threads = [p.mainMs, p.renderMs, p.gpuMs].filter((x) => x !== null);
	if (threads.length) items.push(tile(t("perfThreads"), `${threads.map((x) => round(x, 1)).join(" · ")} ms`, { small: true }));
	if (p.vramUsedMb !== null) {
		const ratio = p.vramBudgetMb ? (p.vramUsedMb / p.vramBudgetMb) * 100 : undefined;
		const level = ratio === undefined ? "none" : ratio >= 90 ? "bad" : ratio >= 75 ? "warn" : "ok";
		items.push(tile(t("perfVram"), p.vramBudgetMb ? `${mb(p.vramUsedMb)} / ${mb(p.vramBudgetMb)}` : mb(p.vramUsedMb), { level, bar: ratio, small: true }));
	}
	if (p.pingMs !== null) {
		items.push(tile(t("perfPing"), `${Math.round(p.pingMs)} ms`, { sub: `${t("perfLoss")} ${round(p.lossPercent ?? 0, 1)} % · ↓ ${bps(p.inBps ?? 0)} ↑ ${bps(p.outBps ?? 0)}` }));
	}
	if (p.serverFps !== null) items.push(tile(t("perfServer"), `${Math.round(p.serverFps)} FPS`, { sub: `${t("perfHitches")} ${p.hitches ?? 0}` }));
	return [head, cardsOf(...items)];
}
