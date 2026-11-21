// Encart « Mon vaisseau » : nom, constructeur, type, état (en vol / posé, mode, rôle, boost) et quelques instruments.
// Construit à partir de l'événement « state » ; utilisé en tête de l'onglet Vaisseau et comme case des vues.

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};

/** Instruments du mini-tableau : boucliers et coque, puis ceux que le vaisseau envoie vraiment. */
function minis(instruments) {
	const by = Object.fromEntries(instruments.map((i) => [i.id, i]));
	const picked = [by.shields, by.hull];
	for (const id of ["hydrogen", "weapons_ready", "decoys"]) {
		const i = by[id];
		if (i && i.text !== "—" && picked.length < 4) picked.push(i);
	}
	return picked.filter(Boolean);
}

/**
 * @param {any} state dernier événement « state » (ou `null`)
 * @param {1 | 2} size 2 = complet, 1 = compact
 * @param {(key: string) => string} t
 */
export function shipCard(state, size, t) {
	const s = state?.shipStatus;
	const c = state?.character;
	const box = el("div", `shipcard s${size}`);
	if (!s?.available || !s.model) {
		box.append(el("p", "hint", t("notInShip")));
		return box;
	}
	const m = s.model;
	const top = el("div", "sc-top");
	const who = el("div", "sc-who");
	who.append(el("div", "sc-name", m.name), el("div", "sc-maker", m.code ? `${m.manufacturer} · ${m.typeLabel}` : m.typeLabel));
	top.append(el("div", "sc-badge", m.code || "?"), who);
	box.append(top);

	const pills = el("div", "sc-pills");
	const pill = (text, cls = "") => pills.append(el("span", `sc-pill ${cls}`, text));
	const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
	if (s.landed !== null) pill(`● ${cap(s.landed ? t("landed") : t("flying"))}`, s.landed ? "" : "ok");
	if (s.masterModeLabel && s.masterModeLabel !== "—") pill(s.masterModeLabel);
	if (c?.available && c.crewRoleLabel && c.crewRoleLabel !== "—") pill(c.crewRoleLabel);
	if (s.boostEngaged) pill(t("cardBoost"), "warn");
	box.append(pills);

	if (size === 2) {
		const grid = el("div", "sc-grid");
		for (const i of minis(s.instruments)) {
			const mini = el("div", "sc-mini");
			mini.append(el("div", "sc-l", i.label), el("div", "sc-v", i.unit ? `${i.text} ${i.unit}` : i.text));
			if (typeof i.percent === "number") {
				const bar = el("div", `sc-bar level-${i.level}`);
				const fill = el("i");
				fill.style.width = `${Math.round(i.percent)}%`;
				bar.append(fill);
				mini.append(bar);
			}
			grid.append(mini);
		}
		box.append(grid);
		if (c?.seat) box.append(el("div", "sc-seat", `${t("cardSeat")} ${c.seat}`));
	}
	return box;
}
