// Page de SC Telemetry Deck : grille de tuiles, onglets Personnage et Vaisseau, état en direct
// (Server-Sent Events), appuis. Utilise uniquement l'API publique v1 (la même que n'importe quel autre logiciel).
import { I18N } from "./i18n.js";
import { createAutoSwitch, parseAutoSettings, POSITIONS } from "./autoswitch.js";
import { createLan } from "./lan.js";
import { holdToPress, HOLD_ACTIONS } from "./hold.js";
import { createSetup } from "./setup.js";
import { createDebug, failureText } from "./debug.js";
import { applyTheme, readTheme, saveTheme, themeAccent, THEMES } from "./themes.js";
import { shipCard } from "./shipcard.js";
import { createView } from "./view.js";

const TOKEN_KEY = "sctd-token";
const LANG_KEY = "sctd-lang";
const TAB_KEY = "sctd-tab";

function storageGet(k) {
	try {
		return localStorage.getItem(k);
	} catch {
		return null;
	}
}
function storageSet(k, v) {
	try {
		localStorage.setItem(k, v);
	} catch {
		/* stockage indisponible : réglage gardé pour cette visite seulement */
	}
}

// Jeton : `?t=` (adresse donnée par l'appli), gardé puis retiré de l'adresse.
// Vue : `?view=<id>` ouvre cette vue, puis l'appareil garde son propre choix (paramètre retiré aussi).
const params = new URLSearchParams(location.search);
let token = params.get("t") || storageGet(TOKEN_KEY);
if (params.get("t")) storageSet(TOKEN_KEY, params.get("t"));
const viewParam = params.get("view");
if (params.has("t") || params.has("view")) {
	params.delete("t");
	params.delete("view");
	history.replaceState(null, "", location.pathname + (params.toString() ? `?${params}` : ""));
}

let lang = storageGet(LANG_KEY) || (navigator.language.toLowerCase().startsWith("fr") ? "fr" : "en");
if (!(lang in I18N)) lang = "en";
const t = (key) => I18N[lang][key];

const $ = (id) => document.getElementById(id);
const grid = $("grid");
let source;
let lastState;

function setStatus(kind, text) {
	$("status").className = `status ${kind}`;
	$("status-text").textContent = text;
}

function showMessage(text) {
	$("message").textContent = text;
	$("message").hidden = !text;
}

function applyTexts() {
	document.documentElement.lang = lang;
	$("title").textContent = t("title");
	$("lang").textContent = t("language");
	$("api").textContent = t("api");
	$("tab-grid").textContent = t("tabGrid");
	$("tab-character").textContent = t("tabCharacter");
	$("tab-ship").textContent = t("tabShip");
	$("tab-debug").textContent = `🐞 ${t("tabDebug")}`;
	$("view-add").title = t("addView");
	$("view-add").setAttribute("aria-label", t("addView"));
	$("tab-select").setAttribute("aria-label", t("tabs"));
	renderTabs();
	$("h-vitals").textContent = t("vitals");
	$("h-instruments").textContent = t("instruments");
	$("h-lights").textContent = t("warningLights");
	$("h-functions").textContent = t("functions");
	$("flight-ready").querySelector(".label").textContent = `✈ ${t("flightReady")}`;
	$("flight-ready").title = t("flightReadyHint");
	$("functions-hint").textContent = t("functionsHint");
	$("h-player-actions").textContent = t("playerActions");
	$("h-emotes").textContent = t("emotes");
	$("about-open").textContent = t("about");
	$("about-close").textContent = t("close");
	renderAbout();
	$("setup-open").textContent = t("setupOpen");
	renderOptions();
	setup?.applyTexts();
	debugTab?.applyTexts();
	$("emotes-hint").textContent = t("emotesHint");
	myView?.applyTexts();
	lanPanel?.applyTexts();
	renderAutoButton();
	if ($("auto").open) renderAuto();
}

// ---------- À propos ----------
const REPO = "https://github.com/Sokren/sc-telemetry-deck";
let lastStatus = {};

function renderAbout() {
	const s = lastStatus;
	$("about-title").textContent = t("aboutTitle");
	const actions = { available: t("actionsAvailable"), unsupported: t("actionsNone") }[s.actions] ?? t("actionsUnknown");
	const facts = [
		[t("aboutVersion"), s.version ? `v${s.version}` : "—"],
		[t("aboutSchema"), s.schema || "—"],
		[t("aboutActions"), actions],
		[t("aboutDev"), "Sokren"],
	];
	$("about-facts").replaceChildren(
		...facts.flatMap(([k, v]) => {
			const dt = document.createElement("dt");
			const dd = document.createElement("dd");
			dt.textContent = k;
			dd.textContent = v;
			return [dt, dd];
		}),
	);
	$("about-notes").replaceChildren(
		...["aboutAi", "aboutBeta", "aboutLocal", "aboutUnofficial"].map((k) => {
			const li = document.createElement("li");
			li.textContent = t(k);
			return li;
		}),
	);
	const howTo = document.createElement("a");
	howTo.href = "#";
	howTo.textContent = t("setupOpen");
	howTo.addEventListener("click", (e) => {
		e.preventDefault();
		// Venu des Options par À propos : le tuto y ramène aussi.
		if ($("about").dataset.fromOptions) markFromOptions($("setup"));
		$("about").close();
		setup.open();
	});
	$("about-links").replaceChildren(
		howTo,
		...[
			[t("aboutGithub"), REPO],
			[t("aboutIssues"), `${REPO}/issues`],
		].map(([label, href]) => {
			const a = document.createElement("a");
			a.href = href;
			a.target = "_blank";
			a.rel = "noopener";
			a.textContent = label;
			return a;
		}),
	);
}

// ---------- Tuto « Activer la télémétrie » ----------
const setup = createSetup({
	dialog: $("setup"),
	t: (k) => t(k),
	readme: () => (lang === "fr" ? `${REPO}/blob/main/README.fr.md#activer-la-télémétrie-dans-star-citizen` : `${REPO}#enabling-telemetry-in-star-citizen`),
});
$("setup-open").addEventListener("click", () => setup.open());

// ---------- Options (thème, alertes, langue, vue auto, tablette, aide) ----------
let theme = readTheme();
applyTheme(theme);

// Alerte rouge des états dangereux (portes ouvertes…), par appareil ; activée par défaut.
const DANGER_KEY = "sctd-danger-alert";
let dangerAlert = storageGet(DANGER_KEY) !== "0";
$("opt-danger").addEventListener("change", (e) => {
	dangerAlert = e.target.checked;
	storageSet(DANGER_KEY, dangerAlert ? "1" : "0");
	document.documentElement.classList.toggle("no-danger-alert", !dangerAlert);
});
document.documentElement.classList.toggle("no-danger-alert", !dangerAlert);

// Résumé du perso en tête de l'onglet Vaisseau (par appareil) ; activé par défaut.
const RECAP_KEY = "sctd-pilot-recap";
let pilotRecap = storageGet(RECAP_KEY) !== "0";
function setPilotRecap(on) {
	pilotRecap = on;
	storageSet(RECAP_KEY, on ? "1" : "0");
	$("opt-recap").checked = on;
	if (lastState) renderPilotRecap(lastState.character);
}
$("opt-recap").addEventListener("change", (e) => setPilotRecap(e.target.checked));

// Mode debug (par appareil) : ajoute l'onglet 🐞 Debug, tout le flux brut du jeu.
const DEBUG_KEY = "sctd-debug";
let debugOn = storageGet(DEBUG_KEY) === "1";
const debugTab = createDebug({
	panel: $("panel-debug"),
	t: (k) => t(k),
	request: (method, url) => fetch(url, { method, headers: { authorization: `Bearer ${token}` } }),
	onUnauthorized: () => showMessage(t("badToken")),
	lang: () => lang,
});
$("tab-debug").hidden = !debugOn;
$("opt-debug").addEventListener("change", (e) => {
	debugOn = e.target.checked;
	storageSet(DEBUG_KEY, debugOn ? "1" : "0");
	$("tab-debug").hidden = !debugOn;
	if (!debugOn && currentTab === "debug") showTab("grid");
	else renderTabs();
});

function setTheme(next) {
	theme = next;
	applyTheme(theme);
	saveTheme(theme);
	renderOptions();
}

function renderOptions() {
	$("options-open").textContent = t("optionsButton");
	$("options-title").textContent = t("optionsTitle");
	$("opt-h-look").textContent = t("optLook");
	$("opt-h-lang").textContent = t("optLang");
	$("opt-h-danger").textContent = t("optDanger");
	$("opt-danger-label").textContent = t("optDangerLabel");
	$("opt-danger").checked = dangerAlert;
	$("opt-recap-label").textContent = t("optRecapLabel");
	$("opt-recap").checked = pilotRecap;
	$("opt-h-advanced").textContent = t("optAdvanced");
	$("opt-debug-label").textContent = t("optDebugLabel");
	$("opt-debug").checked = debugOn;
	$("opt-h-auto").textContent = t("optAuto");
	$("opt-h-lan").textContent = t("optLan");
	$("opt-h-help").textContent = t("optHelp");
	$("opt-setup").textContent = t("setupOpen");
	$("options-close").textContent = t("close");
	$("opt-themes").setAttribute("aria-label", t("optLook"));
	$("opt-themes").replaceChildren(
		...THEMES.map(({ id, accent }) => {
			const b = document.createElement("button");
			b.type = "button";
			b.className = "opt-theme";
			b.setAttribute("role", "radio");
			b.setAttribute("aria-checked", String(theme.id === id));
			const dot = document.createElement("span");
			dot.className = "opt-dot";
			dot.style.background = accent;
			b.append(dot, t(`theme_${id}`));
			// Changer de thème remet l'accent de ce thème.
			b.addEventListener("click", () => setTheme({ id, accent: "" }));
			return b;
		}),
	);
	$("opt-accent-label").textContent = t("optAccent");
	$("opt-accent").value = theme.accent || themeAccent(theme.id);
	$("opt-accent-reset").textContent = t("optAccentReset");
	$("opt-accent-reset").hidden = !theme.accent;
}
$("opt-accent").addEventListener("input", (e) => setTheme({ id: theme.id, accent: e.target.value }));
$("opt-accent-reset").addEventListener("click", () => setTheme({ id: theme.id, accent: "" }));
$("opt-setup").addEventListener("click", () => setup.open());
$("options-open").addEventListener("click", () => {
	renderOptions();
	$("options").showModal();
});
// Boutons qui ouvrent une autre fenêtre (À propos, QR code, vue auto, tuto) : fermer d'abord les options (avant
// leur propre action). Cette fenêtre reçoit, à côté de « Fermer », un bouton « ← Options » qui y ramène ;
// « Fermer » et Échap ferment toujours tout.
$("options").addEventListener(
	"click",
	(e) => {
		const leave = e.target.closest?.("[data-leave]");
		if (!leave) return;
		markFromOptions($(leave.dataset.leave));
		$("options").close();
	},
	true,
);

function markFromOptions(dialog) {
	dialog.dataset.fromOptions = "1";
	if (dialog.open) addBackButton(dialog);
}

function addBackButton(dialog) {
	const forms = dialog.querySelectorAll('form[method="dialog"]');
	const foot = forms[forms.length - 1];
	if (!foot || foot.querySelector(".opt-back")) return;
	const back = document.createElement("button");
	back.type = "button";
	back.className = "opt-back";
	back.textContent = t("backToOptions");
	back.addEventListener("click", () => {
		dialog.dataset.backToOptions = "1";
		dialog.close();
	});
	foot.prepend(back);
}

for (const id of ["about", "lan", "auto", "setup"]) {
	const dialog = $(id);
	// Ouverture (parfois après un chargement, ex. QR code) et contenu refait (langue) : remettre le bouton.
	new MutationObserver(() => {
		if (dialog.open && dialog.dataset.fromOptions) addBackButton(dialog);
	}).observe(dialog, { attributes: true, attributeFilter: ["open"], childList: true, subtree: true });
	dialog.addEventListener("close", () => {
		const back = dialog.dataset.backToOptions;
		delete dialog.dataset.fromOptions;
		delete dialog.dataset.backToOptions;
		dialog.querySelector(".opt-back")?.remove();
		if (!back) return;
		renderOptions();
		$("options").showModal();
	});
}
$("about-open").addEventListener("click", () => {
	renderAbout();
	$("about").showModal();
});

// ---------- Onglets ----------
// Onglets fixes, puis un onglet par vue (« view:<id> ») ; « ＋ » crée une vue. Téléphone : liste déroulante.
const TABS = ["grid", "character", "ship", "debug"];
const TAB_TEXT = { grid: "tabGrid", character: "tabCharacter", ship: "tabShip", debug: "tabDebug" };
const MAX_VIEWS = 10;
const ADD = "__add";
/** Vues connues (nom et id), dans l'ordre des onglets ; `null` tant que l'appli ne les a pas envoyées. */
let viewTabs = null;
let currentTab = "grid";

const viewId = (tab) => (tab.startsWith("view:") ? tab.slice(5) : null);

function renderTabs() {
	const box = $("view-tabs");
	const list = viewTabs ?? [];
	// Boutons gardés tant que les vues sont les mêmes (le focus clavier reste sur l'onglet choisi).
	if ([...box.children].map((b) => b.dataset.id).join("\n") !== list.map((v) => v.id).join("\n")) {
		const focused = document.activeElement?.closest?.("#view-tabs button")?.dataset.id;
		box.replaceChildren(
			...list.map((v) => {
				const b = document.createElement("button");
				b.type = "button";
				b.id = `tab-view-${v.id}`;
				b.dataset.id = v.id;
				b.setAttribute("role", "tab");
				b.setAttribute("aria-controls", "panel-myview");
				b.addEventListener("click", () => userShowTab(`view:${v.id}`));
				return b;
			}),
		);
		if (focused) document.getElementById(`tab-view-${focused}`)?.focus();
	}
	list.forEach((v, i) => {
		const b = box.children[i];
		b.textContent = v.name || t("viewNameEmpty");
		b.setAttribute("aria-selected", String(currentTab === `view:${v.id}`));
	});
	const shown = viewId(currentTab);
	if (shown) $("panel-myview").setAttribute("aria-labelledby", `tab-view-${shown}`);
	$("view-add").hidden = !viewTabs || viewTabs.length >= MAX_VIEWS;
	const select = $("tab-select");
	const options = [...TABS.filter((tab) => tab !== "debug" || debugOn).map((tab) => [tab, t(TAB_TEXT[tab])]), ...(viewTabs ?? []).map((v) => [`view:${v.id}`, v.name || t("viewNameEmpty")])];
	if (viewTabs && viewTabs.length < MAX_VIEWS) options.push([ADD, `＋ ${t("addView")}`]);
	select.replaceChildren(
		...options.map(([value, text]) => {
			const o = document.createElement("option");
			o.value = value;
			o.textContent = text;
			return o;
		}),
	);
	select.value = currentTab;
}

function showTab(name) {
	const id = viewId(name);
	if ((!TABS.includes(name) && id === null) || (name === "debug" && !debugOn)) name = "grid";
	// Vue inconnue (supprimée, lien périmé) : première vue, dès que la liste est connue.
	if (id !== null && viewTabs && !viewTabs.some((v) => v.id === id)) name = viewTabs[0] ? `view:${viewTabs[0].id}` : "grid";
	currentTab = name;
	for (const tab of TABS) {
		$(`panel-${tab}`).hidden = tab !== name;
		$(`tab-${tab}`).setAttribute("aria-selected", String(tab === name));
	}
	$("panel-myview").hidden = viewId(name) === null;
	storageSet(TAB_KEY, name);
	renderTabs();
	myView?.show(viewId(name));
	myView?.setVisible(viewId(name) !== null);
	debugTab.setVisible(name === "debug");
}
/** Onglet choisi à la main : le changement de vue automatique le respecte jusqu'au prochain changement de position. */
function userShowTab(name) {
	autoSwitch?.userNavigated();
	showTab(name);
}
for (const tab of TABS) $(`tab-${tab}`).addEventListener("click", () => userShowTab(tab));

async function addView() {
	const id = await myView.addView();
	if (!id) return renderTabs();
	userShowTab(`view:${id}`);
	myView.editName();
}
$("view-add").addEventListener("click", addView);
$("tab-select").addEventListener("change", (e) => (e.target.value === ADD ? addView() : userShowTab(e.target.value)));

// ---------- Grille ----------
function tileButton(index) {
	let el = grid.children[index];
	while (!el) {
		const b = document.createElement("button");
		b.className = "tile";
		b.type = "button";
		b.innerHTML = '<img alt=""><span class="flash"></span>';
		const i = grid.children.length;
		b.addEventListener("click", () => press(i));
		// Tuile d'éjection : il faut rester appuyé (anneau rouge), le clic seul ne fait rien.
		holdToPress(b, () => press(i), () => b.dataset.hold === "1");
		grid.append(b);
		el = grid.children[index];
	}
	return el;
}

function flashOn(el, kind) {
	const f = el.querySelector(".flash");
	f.textContent = kind === "ok" ? "✔" : "⚠";
	f.className = `flash ${kind}`;
	setTimeout(() => (f.className = "flash"), 600);
}

// Appuis faits depuis cette page : leur retour diffusé à tous (événement « feedback ») est ignoré ici,
// la réponse de l'appui suffit (sinon ✔ / ⚠ clignoterait deux fois).
const ownPresses = new Map();

async function press(index) {
	ownPresses.set(index, Date.now());
	try {
		const r = await fetch(`/api/v1/layout/tiles/${index}/press`, { method: "POST", headers: { authorization: `Bearer ${token}`, "x-sctd-origin": "grid" } });
		if (r.status === 401) return showMessage(t("badToken"));
		const body = await r.json();
		flashOn(tileButton(index), body.feedback === "ok" ? "ok" : "alert");
	} catch {
		flashOn(tileButton(index), "alert");
	}
}

// ---------- Cartes (constantes, instruments) ----------
function card(item) {
	const el = document.createElement("div");
	el.className = `card level-${item.level ?? "none"}`;
	const value = item.text === "—" || !item.unit ? item.text : `${item.text} ${item.unit}`;
	el.innerHTML = '<div class="label"></div><div class="value"></div>';
	el.querySelector(".label").textContent = item.label;
	el.querySelector(".value").textContent = value;
	if (typeof item.percent === "number") {
		const bar = document.createElement("div");
		bar.className = "bar";
		bar.innerHTML = "<i></i>";
		bar.firstChild.style.width = `${Math.round(item.percent)}%`;
		el.append(bar);
	}
	return el;
}

function renderCharacter(c) {
	$("char-head").textContent = c.available ? [c.locomotionLabel, c.crewRoleLabel].filter((x) => x && x !== "—").join(" · ") : t("notSpawned");
	$("char-vitals").replaceChildren(...c.vitals.map(card));
}

// ---------- Émotes (liste lue dans le jeu, comme la liste déroulante du plugin) ----------
const EMOTES = "player_emotes";
let emotesLoaded = false;

async function loadEmotes() {
	try {
		const r = await fetch(`/api/v1/actions?lang=${lang}`, { headers: { authorization: `Bearer ${token}` } });
		if (!r.ok) throw new Error(String(r.status));
		const { groups, live } = await r.json();
		myView?.setActions(groups);
		const emotes = groups.find((g) => g.category === EMOTES)?.actions ?? [];
		renderEmotes(emotes);
		renderPlayerActions(groups.find((g) => g.category === PLAYER)?.actions ?? []);
		// Liste de secours (jeu pas encore joignable) : relue dès que le jeu répond.
		emotesLoaded = live && emotes.length > 0;
	} catch {
		renderEmotes([]);
	}
}

/** Actions du perso (essuyer la visière, torche, mobiGlas, carte stellaire), lues dans le jeu comme les émotes. */
const PLAYER = "player";
function renderPlayerActions(actions) {
	$("h-player-actions").hidden = !actions.length;
	$("char-actions").replaceChildren(
		...actions.map((a) => {
			const el = document.createElement("button");
			el.type = "button";
			el.className = "card function emote";
			el.innerHTML = '<div class="label"></div><span class="flash"></span>';
			el.querySelector(".label").textContent = a.label;
			el.addEventListener("click", () => triggerEmote(a.name, el));
			return el;
		}),
	);
}

function renderEmotes(emotes) {
	const box = $("char-emotes");
	if (!emotes.length) {
		const empty = document.createElement("p");
		empty.className = "hint";
		empty.textContent = t("emotesEmpty");
		return box.replaceChildren(empty);
	}
	box.replaceChildren(
		...emotes.map((e) => {
			const el = document.createElement("button");
			el.type = "button";
			el.className = "card function emote";
			el.innerHTML = '<div class="label"></div><span class="flash"></span>';
			el.querySelector(".label").textContent = e.label;
			el.addEventListener("click", () => triggerEmote(e.name, el));
			return el;
		}),
	);
}

/**
 * Raison d'un ⚠ en info-bulle du bouton (retirée au prochain succès). `body` : réponse du jeu (`reason`, `message`)
 * ou refus de l'appli (`reason` lisible + `code`).
 */
function showFailure(el, body) {
	if (!("tip" in el.dataset)) el.dataset.tip = el.title;
	if (!body) return void (el.title = el.dataset.tip);
	const [head, detail] = body.code ? [body.reason, body.code] : failureText(body.reason, body.message, t);
	el.title = `⚠ ${head}\n${detail} — ${new Date().toLocaleTimeString()}`;
}

/** Déclenche une action du jeu (émote ou autre) depuis une carte, avec retour ✔ / ⚠ ; `origin` : pour le journal. */
async function triggerEmote(name, el, origin = "character") {
	try {
		const r = await fetch(`/api/v1/actions/${encodeURIComponent(name)}/trigger`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "x-sctd-origin": origin },
		});
		if (r.status === 401) return showMessage(t("badToken"));
		const ok = r.status === 200;
		flashOn(el, ok ? "ok" : "alert");
		showFailure(el, ok ? null : await r.json().catch(() => ({ reason: String(r.status) })));
	} catch {
		flashOn(el, "alert");
		showFailure(el, { reason: "UNAVAILABLE" });
	}
}

// ---------- Morse (cases des vues) ----------
/** Envoie un message morse ; un appui pendant un envoi l'arrête (comme la touche Morse Code). */
async function sendMorse(body, el) {
	try {
		const playing = !!lastState?.morse?.playing;
		const r = await fetch("/api/v1/morse", {
			method: playing ? "DELETE" : "POST",
			headers: { authorization: `Bearer ${token}`, ...(playing ? {} : { "content-type": "application/json" }) },
			...(playing ? {} : { body: JSON.stringify(body) }),
		});
		if (r.status === 401) return showMessage(t("badToken"));
		// Arrêt : message déjà terminé (404) = rien à arrêter, pas une erreur.
		flashOn(el, r.ok || (playing && r.status === 404) ? "ok" : "alert");
	} catch {
		flashOn(el, "alert");
	}
}

// ---------- Vaisseau ----------
async function pressFunction(id, el, origin = "ship") {
	try {
		const r = await fetch(`/api/v1/ship/functions/${id}/press?lang=${lang}`, {
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-sctd-origin": origin },
			body: JSON.stringify({ mode: "toggle" }),
		});
		if (r.status === 401) return showMessage(t("badToken"));
		const ok = r.status === 200;
		flashOn(el, ok ? "ok" : "alert");
		showFailure(el, ok ? null : await r.json().catch(() => ({ reason: String(r.status) })));
	} catch {
		flashOn(el, "alert");
		showFailure(el, { reason: "UNAVAILABLE" });
	}
}

function renderShip(status, functions) {
	if (status.available) {
		const parts = [status.name, status.landed === null ? null : status.landed ? t("landed") : t("flying"), status.masterModeLabel];
		$("ship-head").textContent = parts.filter((x) => x && x !== "—").join(" · ");
	} else $("ship-head").textContent = t("notInShip");
	$("ship-instruments").replaceChildren(...status.instruments.map(card));
	$("ship-lights").replaceChildren(
		...status.annunciators.map((a) => {
			const el = document.createElement("span");
			el.className = `light light-${a.state}${a.flashing ? " flashing" : ""}`;
			el.textContent = a.label;
			return el;
		}),
	);
	// Les cartes de fonction sont gardées d'un rendu à l'autre (clic et ✔ / ⚠ stables).
	const box = $("ship-functions");
	functions.forEach((f, i) => {
		let el = box.children[i];
		if (!el || el.dataset.id !== f.id) {
			el = document.createElement("button");
			el.type = "button";
			el.className = "card function";
			el.dataset.id = f.id;
			el.innerHTML = '<div class="label"></div><div class="value"></div><span class="flash"></span>';
			el.addEventListener("click", () => {
				if (el.dataset.readonly !== "1") pressFunction(f.id, el);
			});
			if (box.children[i]) box.children[i].replaceWith(el);
			else box.append(el);
		}
		el.querySelector(".label").textContent = f.label;
		el.querySelector(".value").textContent = f.word;
		el.dataset.state = f.state;
		// Lecture seule (ex. croisière) : pas d'appui, une info-bulle explique pourquoi.
		el.dataset.readonly = f.readOnly ? "1" : "";
		el.classList.toggle("danger", !!f.danger);
		el.title = f.readOnly ? t("readOnlyFunction") : "";
	});
}

// ---------- Résumé du perso (onglet Vaisseau) ----------
const RECAP_VITALS = [
	["health", "❤️"],
	["hunger", "🍖"],
	["thirst", "💧"],
	["oxygen", "🫁"],
];
function renderPilotRecap(c) {
	const box = $("pilot-recap");
	// Toujours affiché quand le perso est là (assis ou non), sauf si désactivé.
	box.hidden = !pilotRecap || !c.available;
	if (box.hidden) return;
	const span = (cls, text) => {
		const el = document.createElement("span");
		el.className = cls;
		el.textContent = text;
		return el;
	};
	// Une ligne de texte discrète (variante B) : chaque valeur prend la couleur de son niveau.
	const items = RECAP_VITALS.map(([id, icon]) => {
		const v = c.vitals.find((x) => x.id === id);
		const text = v && v.text !== "—" ? `${v.text}${v.unit === "%" ? " %" : ""}` : "—";
		const el = span(`pr-item level-${v?.level ?? "none"}`, `${icon} `);
		el.title = v?.label ?? id;
		el.append(span("pr-val", text));
		return el;
	});
	// Air respirable : juste une note (oui / non), en orange quand l'air n'est pas respirable.
	const air = c.vitals.find((x) => x.id === "breathable");
	const parts = [span("pr-head", `${t("recapTitle")} :`), ...items];
	if (air && air.text !== "—") {
		const ok = ["Oui", "Yes"].includes(air.text);
		parts.push(span(`pr-air${ok ? "" : " bad"}`, ok ? `· ${t("recapAirOk")}` : `· ⚠ ${t("recapAirBad")}`));
	}
	const hide = document.createElement("button");
	hide.type = "button";
	hide.className = "pr-hide";
	hide.textContent = "✕";
	hide.title = t("recapHide");
	hide.setAttribute("aria-label", t("recapHide"));
	hide.addEventListener("click", () => setPilotRecap(false));
	box.replaceChildren(...parts, hide);
}

// « Prêt au vol » en tête de l'onglet Vaisseau : simple commande du jeu (aucun état lisible).
$("flight-ready").addEventListener("click", () => triggerEmote("v_flightready", $("flight-ready"), "ship"));

// ---------- Temps réel ----------
function connect() {
	source?.close();
	setStatus("", t("connecting"));
	loadEmotes();
	source = new EventSource(`/api/v1/events?t=${encodeURIComponent(token)}&lang=${lang}`);
	source.addEventListener("status", (e) => {
		const s = JSON.parse(e.data);
		lastStatus = s;
		if ($("about").open) renderAbout();
		// Version de l'appli (survol : version du jeu dont vient le schéma embarqué).
		$("version").textContent = s.version ? `v${s.version}` : "";
		$("version").title = s.schema ? `${t("gameSchema")} ${s.schema}` : "";
		setStatus(s.telemetry === "live" ? "live" : "", s.telemetry === "live" ? t("live") : t("noData"));
		// Pas de données : bouton vers le tuto d'activation.
		$("setup-open").hidden = s.telemetry === "live";
		if (s.telemetry === "live" && !emotesLoaded) loadEmotes();
		// Jeu sans commandes d'actions (ex. 4.10) : l'affichage marche, pas les boutons.
		$("notice").textContent = t("actionsUnsupported");
		$("notice").hidden = s.actions !== "unsupported";
	});
	source.addEventListener("tile", (e) => {
		const { index, image, hold } = JSON.parse(e.data);
		tileButton(index).dataset.hold = hold ? "1" : "";
		const img = tileButton(index).querySelector("img");
		if (img.src !== image) img.src = image;
	});
	source.addEventListener("state", (e) => {
		lastState = JSON.parse(e.data);
		renderCharacter(lastState.character);
		renderPilotRecap(lastState.character);
		renderShip(lastState.shipStatus, lastState.ship);
		// Encart « Mon vaisseau » en tête de l'onglet Vaisseau (remplace la ligne de résumé).
		const inShip = lastState.shipStatus.available && !!lastState.shipStatus.model;
		$("ship-card").hidden = !inShip;
		$("ship-head").hidden = inShip;
		if (inShip) $("ship-card").replaceChildren(shipCard(lastState, 2, t));
		myView?.setState(lastState);
		// Onglet Debug : on y reste, la vue automatique ne s'applique pas.
		if (currentTab !== "debug") autoSwitch?.update(lastState.character.locomotion);
	});
	source.addEventListener("views", (e) => myView?.setViews(JSON.parse(e.data).views));
	source.addEventListener("feedback", (e) => {
		const { index, feedback } = JSON.parse(e.data);
		const mine = ownPresses.get(index);
		if (mine !== undefined && Date.now() - mine < 3000) {
			ownPresses.delete(index);
			return;
		}
		flashOn(tileButton(index), feedback === "ok" ? "ok" : "alert");
	});
	// Flux remplacé entre-temps (nouveau jeton, langue) : ses erreurs ne concernent plus la page.
	const mine = source;
	source.onerror = async () => {
		if (mine !== source) return;
		setStatus("off", t("offline"));
		const used = token;
		try {
			const r = await fetch("/api/v1/status", { headers: { authorization: `Bearer ${used}` } });
			if (r.status === 401 && mine === source && used === token) {
				// Nouveau jeton créé dans un autre onglet du PC : repris ici au lieu de « jeton refusé ».
				const stored = storageGet(TOKEN_KEY);
				if (stored && stored !== used) {
					token = stored;
					return connect();
				}
				source.close();
				showMessage(t("badToken"));
			}
		} catch {
			/* l'appli est fermée : EventSource se reconnecte seul */
		}
	};
}

$("lang").addEventListener("click", () => {
	lang = lang === "fr" ? "en" : "fr";
	storageSet(LANG_KEY, lang);
	applyTexts();
	grid.replaceChildren();
	$("ship-functions").replaceChildren();
	connect();
});

// ---------- Ma vue ----------
const myView = createView({
	t,
	// Vue reverrouillée : un changement automatique en attente peut se faire.
	onLockChange: (unlocked) => !unlocked && autoSwitch?.retry(),
	token: () => token,
	lang: () => lang,
	onViewsChanged(list) {
		const first = !viewTabs;
		viewTabs = list.map((v) => ({ id: v.id, name: v.name }));
		// Première liste : l'onglet demandé (lien ou dernier choix) peut maintenant être vérifié.
		if (first && viewId(currentTab) !== null) return showTab(currentTab);
		renderTabs();
	},
	onMissing() {
		if (viewTabs?.[0]) showTab(`view:${viewTabs[0].id}`);
		else showTab("grid");
	},
	card,
	pressFunction: (id, el) => pressFunction(id, el, "view"),
	triggerAction: (name, el) => triggerEmote(name, el, "view"),
	holdToPress,
	holdActions: HOLD_ACTIONS,
	morse: sendMorse,
	showMessage,
	storage: { get: storageGet, set: storageSet },
});

// ---------- Changement de vue automatique (réglage propre à cet appareil) ----------
const AUTO_KEY = "sctd-autoswitch";
let autoSettings = parseAutoSettings(storageGet(AUTO_KEY));
const autoSwitch = createAutoSwitch({
	getSettings: () => autoSettings,
	// Cible : onglet Personnage / Vaisseau, ou une vue (`view:<id>`) qui existe encore.
	viewExists: (target) => target === "character" || target === "ship" || !!viewTabs?.some((v) => `view:${v.id}` === target),
	isEditing: () => !!myView?.isEditing(),
	// Une vue laissée déverrouillée sur un autre onglet est reverrouillée : pas d'ouverture en mode édition.
	apply: (target) => {
		myView.lock();
		showTab(target);
	},
	// Page ouverte par un lien vers une vue (QR code) : on garde cette vue au départ.
	skipInitial: !!viewParam,
});

function renderAutoButton() {
	const b = $("auto-open");
	b.textContent = autoSettings.enabled ? t("autoButtonOn") : t("autoButton");
	b.classList.toggle("on", autoSettings.enabled);
	b.title = t("autoTitle");
}

function saveAuto(next) {
	autoSettings = next;
	storageSet(AUTO_KEY, JSON.stringify(next));
	renderAutoButton();
	autoSwitch.settingsChanged();
}

function renderAuto() {
	const el = (tag, cls, text) => {
		const e = document.createElement(tag);
		if (cls) e.className = cls;
		if (text !== undefined) e.textContent = text;
		return e;
	};
	const box = el("div", `lan-dlg${autoSettings.enabled ? " on" : ""}`);
	const title = el("h2", "", t("autoTitle"));
	title.id = "auto-title";
	box.append(title, el("p", "lan-sub", t("autoSub")));
	const sw = el("label", "lan-sw");
	const input = el("input");
	input.type = "checkbox";
	input.setAttribute("role", "switch");
	input.checked = autoSettings.enabled;
	input.addEventListener("change", () => {
		saveAuto({ ...autoSettings, enabled: input.checked });
		renderAuto();
	});
	const text = el("div");
	text.append(el("b", "", t("autoEnable")), el("small", "", autoSettings.enabled ? t("autoOn") : t("autoOff")));
	sw.append(input, el("span", "lan-tog"), text);
	box.append(sw);
	const rows = el("div", "auto-rows");
	const labels = { on_foot: "posOnFoot", seated: "posSeated", eva: "posEva" };
	for (const pos of POSITIONS) {
		const row = el("label", "auto-row");
		row.append(el("span", "", t(labels[pos])));
		const select = el("select");
		const targets = [
			["", t("autoNoChange")],
			["character", t("tabCharacter")],
			["ship", t("tabShip")],
			...(viewTabs ?? []).map((v) => [`view:${v.id}`, v.name || t("viewNameEmpty")]),
		];
		for (const [value, label] of targets) {
			const o = el("option", "", label);
			o.value = value;
			select.append(o);
		}
		select.value = targets.some(([value]) => value === autoSettings[pos]) ? autoSettings[pos] : "";
		select.addEventListener("change", () => saveAuto({ ...autoSettings, [pos]: select.value }));
		row.append(select);
		rows.append(row);
	}
	box.append(rows, el("p", "lan-off-note", t("autoNote")));
	const foot = el("form", "lan-foot");
	foot.method = "dialog";
	const close = el("button", "", t("close"));
	close.type = "submit";
	foot.append(close);
	box.append(foot);
	$("auto").replaceChildren(box);
}

$("auto-open").addEventListener("click", () => {
	$("auto").showModal();
	renderAuto();
});

// ---------- Tablette / téléphone (PC seulement) ----------
const lanPanel = createLan({
	t,
	token: () => token,
	setToken(next) {
		// Nouveau jeton : gardé, puis reconnexion (les flux ouverts avec l'ancien sont fermés par l'appli).
		token = next;
		storageSet(TOKEN_KEY, next);
		showMessage("");
		connect();
	},
	views: () => viewTabs ?? [],
	currentView: () => viewId(currentTab),
});

applyTexts();
// Onglet de départ : lien `?view=`, sinon dernier choix de l'appareil (ancien « myview » → première vue).
const savedTab = storageGet(TAB_KEY);
showTab(viewParam ? `view:${viewParam}` : savedTab === "myview" ? "view:main" : savedTab || "grid");
if (!token) {
	setStatus("off", "");
	showMessage(t("needToken"));
} else {
	connect();
	lanPanel.check();
}
