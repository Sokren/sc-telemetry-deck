// Fenêtre « Plugins » et indicateur de la barre du haut. Les plugins sont des programmes séparés que l'appli lance
// (dossier `plugins` à côté de l'appli). Sur le PC seulement (l'API répond 403 ailleurs). Un plugin nouveau ou modifié
// ne se lance qu'après la fenêtre de consentement, qui montre la commande exacte, les fichiers et ce qu'il demande.

import { isAlert } from "./access.js";

const LEVELS = ["read", "pilot", "pilot_full"];
/** Liste et journaux pendant que la fenêtre est ouverte ; indicateur de la barre du haut sinon. */
const POLL_OPEN_MS = 2000;
const POLL_BAR_MS = 5000;
/** Dernière ligne vue dans le journal de chaque plugin (sur cet appareil) : les erreurs plus récentes sont signalées. */
const SEEN_KEY = "sctd-plugins-seen";

const el = (tag, cls, text) => {
	const e = document.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
};
const button = (cls, text) => {
	const b = el("button", cls, text);
	b.type = "button";
	return b;
};

/** Table par id de plugin, sans prototype : « __proto__ » ou « constructor » y restent de simples entrées. */
export const idMap = (v = {}) => Object.assign(Object.create(null), v && typeof v === "object" && !Array.isArray(v) ? v : {});

function readSeen() {
	try {
		const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
		return idMap(v);
	} catch {
		return idMap();
	}
}

/**
 * @param {object} ctx
 * @param {(key: string) => string} ctx.t
 * @param {() => string} ctx.token jeton de l'appli
 * @param {() => string} ctx.lang langue de la page (dates)
 */
export function createPlugins(ctx) {
	const { t } = ctx;
	const openBtn = document.getElementById("plugins-open");
	const pill = document.getElementById("plugins-pill");
	const dialog = document.getElementById("plugins");
	/** @type {{dir: string, plugins: any[]} | null} */
	let data = null;
	/** Journaux : `{calls, output}` par plugin. */
	let logs = idMap();
	const seen = readSeen();
	let openLog = null;
	let logTab = "calls";
	/** Plugin dont on montre la fenêtre de consentement, avec les choix en cours. */
	let consent = null;
	let views = [];
	let notice = "";
	let busy = false;
	let timer;
	let barTimer;
	let lastStates = "";

	/** Message d'erreur : en rouge, bien visible (un message simple reste discret). */
	const bad = (text) => ({ bad: true, text });
	const fmt = (key, ...args) => args.reduce((s, a, i) => s.replace(`{${i}}`, () => a), t(key));
	const api = (path, init = {}) =>
		fetch(path, { ...init, headers: { authorization: `Bearer ${ctx.token()}`, ...(init.body ? { "content-type": "application/json" } : {}) } });
	const time = (iso) => {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(ctx.lang(), { timeStyle: "medium" });
	};

	async function load(scan = false) {
		try {
			const r = await api(scan ? "/api/v1/plugins/scan" : "/api/v1/plugins", scan ? { method: "POST" } : {});
			if (r.status !== 200) return false;
			const next = await r.json();
			const out = idMap();
			await Promise.all(
				next.plugins
					.filter((p) => p.grant)
					.map(async (p) => {
						try {
							const l = await api(`/api/v1/plugins/${encodeURIComponent(p.id)}/log`);
							if (l.ok) out[p.id] = await l.json();
						} catch {
							if (logs[p.id]) out[p.id] = logs[p.id];
						}
					}),
			);
			data = next;
			logs = out;
			return true;
		} catch {
			return false;
		}
	}

	/** Erreurs depuis la dernière ouverture du journal : appels refusés ou en erreur, lignes d'erreur du programme. */
	const unseenErrors = (id) => {
		const l = logs[id];
		if (!l) return 0;
		const since = seen[id] ?? "";
		return l.calls.entries.filter((e) => isAlert(e.status) && e.at > since).length + l.output.filter((o) => o.stream === "err" && o.at > since).length;
	};
	function markSeen(id) {
		const l = logs[id];
		const last = [l?.calls.entries.at(-1)?.at ?? "", l?.output.at(-1)?.at ?? ""].sort().at(-1);
		if (!last || seen[id] === last) return;
		seen[id] = last;
		try {
			localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
		} catch {
			/* stockage indisponible */
		}
	}

	/** Indicateur « 🧩 N plugins » : vert, orange (erreurs non vues), rouge (un plugin en échec). */
	function renderPill() {
		// États changés (démarré, arrêté…) : la vue d'un plugin affiche le sien.
		const states = JSON.stringify((data?.plugins ?? []).map((p) => [p.id, p.state]));
		if (states !== lastStates) {
			lastStates = states;
			ctx.onChange?.();
		}
		const enabled = (data?.plugins ?? []).filter((p) => p.grant && p.state !== "disabled" && p.state !== "new");
		pill.hidden = !enabled.length;
		if (!enabled.length) return;
		const running = enabled.filter((p) => p.state === "running");
		const failed = enabled.filter((p) => p.state === "failed");
		const errors = enabled.reduce((n, p) => n + unseenErrors(p.id), 0);
		pill.className = `plg-pill ${failed.length ? "bad" : errors ? "warn" : "ok"}`;
		pill.textContent = `🧩 ${fmt(running.length === 1 ? "pluginsOne" : "pluginsMany", running.length)}${failed.length ? ` · ${fmt("pluginsFailedCount", failed.length)}` : errors ? ` · ⚠ ${errors}` : ""}`;
		const piloting = running.filter((p) => p.grant.level !== "read").length;
		pill.title = [
			fmt("pluginsPillRunning", running.length, piloting),
			errors ? fmt("pluginsPillErrors", errors) : "",
			failed.length ? fmt("pluginsPillFailed", failed.map((p) => p.manifest?.name ?? p.id).join(", ")) : "",
		]
			.filter(Boolean)
			.join(" · ");
	}

	async function command(p, name) {
		busy = true;
		notice = "";
		render();
		try {
			const r = await api(`/api/v1/plugins/${encodeURIComponent(p.id)}/${name}`, { method: "POST" });
			if (r.status !== 200) notice = bad(fmt("pluginsCommandFailed", (await r.json().catch(() => ({}))).error ?? r.status));
		} catch {
			notice = bad(t("accessFailed"));
		}
		busy = false;
		await load();
		render();
	}

	async function stopAll() {
		const running = (data?.plugins ?? []).filter((p) => p.state === "running");
		if (!running.length || !confirm(fmt("pluginsStopAllConfirm", running.length))) return;
		busy = true;
		render();
		await Promise.all(running.map((p) => api(`/api/v1/plugins/${encodeURIComponent(p.id)}/stop`, { method: "POST" }).catch(() => null)));
		busy = false;
		notice = t("pluginsStoppedAll");
		await load();
		render();
	}

	async function openConsent(p) {
		const asked = new Set(p.manifest.views ?? []);
		consent = {
			p,
			level: p.grant?.level && LEVELS.indexOf(p.grant.level) <= LEVELS.indexOf(p.manifest.access) ? p.grant.level : p.manifest.access,
			read: asked.has("read"),
			create: asked.has("create"),
			// Modifier des vues : décoché tant que le joueur n'a rien choisi (rien n'est accordé d'office).
			edit: asked.has("edit") ? (p.grant?.views.edit ?? false) : false,
			trust: false,
		};
		notice = "";
		views = [];
		if (asked.has("edit")) {
			try {
				const r = await api(`/api/v1/views?lang=${ctx.lang()}`);
				if (r.ok) views = (await r.json()).views.filter((v) => !v.plugin);
			} catch {
				/* liste indisponible : « toutes » reste possible */
			}
		}
		render();
		dialog.scrollTop = 0;
	}

	async function enable() {
		const c = consent;
		if (!c.trust) {
			notice = bad(t("pluginsTrustMissing"));
			return render();
		}
		if (c.level === "pilot_full" && !confirm(t("accessFullConfirm"))) return;
		busy = true;
		render();
		let r = null;
		try {
			r = await api(`/api/v1/plugins/${encodeURIComponent(c.p.id)}/enable`, {
				method: "POST",
				body: JSON.stringify({ hash: c.p.hash, level: c.level, views: { read: c.read, edit: c.edit === false || (Array.isArray(c.edit) && !c.edit.length) ? false : c.edit, create: c.create } }),
			});
		} catch {
			/* appli arrêtée */
		}
		busy = false;
		if (r?.status === 200) {
			notice = fmt("pluginsEnabled", c.p.manifest.name);
			consent = null;
		} else {
			const error = r ? (await r.json().catch(() => ({}))).error : null;
			notice = error === "hash_mismatch" ? bad(t("pluginsHashMismatch")) : bad(t("accessFailed"));
			if (error === "hash_mismatch") consent = null;
		}
		await load();
		render();
	}

	const stateText = (p) => (p.state === "running" ? `● ${t("plgState_running")}` : p.state === "failed" ? `✕ ${t("plgState_failed")}` : p.state === "changed" ? `⚠ ${t("plgState_changed")}` : t(`plgState_${p.state}`));
	const stateClass = { running: "on", failed: "off", invalid: "off", changed: "tmp" };
	const levelBadge = (level) => el("span", `acc-badge acc-${level}`, t(`accessLevel_${level}`));

	function viewsText(p) {
		const v = p.grant?.views;
		if (!v) return "";
		const parts = [];
		if (v.read) parts.push(`👁 ${t("pluginsViewsRead")}`);
		if (v.edit === "all") parts.push(`✏️ ${t("pluginsViewsEditAll")}`);
		else if (Array.isArray(v.edit) && v.edit.length) parts.push(`✏️ ${fmt("pluginsViewsEditSome", v.edit.length)}`);
		if (v.create) parts.push(`➕ ${t("pluginsViewsCreate")}`);
		return parts.join(" · ");
	}

	function renderLog(p) {
		const box = el("div", "acc-log");
		const tabs = el("div", "plg-tabs");
		for (const [key, label] of [
			["calls", t("pluginsLogCalls")],
			["output", t("pluginsLogOutput")],
		]) {
			const b = button(logTab === key ? "sel" : "", label);
			b.addEventListener("click", () => {
				logTab = key;
				render();
			});
			tabs.append(b);
		}
		box.append(tabs, el("p", "acc-livebadge", `● ${t("accessLive")}`));
		const l = logs[p.id];
		if (logTab === "calls") {
			if (!l?.calls.entries.length) box.append(el("p", "acc-muted", t("pluginsLogNoCalls")));
			else {
				if (l.calls.refused) box.append(el("p", "acc-refused", fmt("accessRefused", l.calls.refused)));
				const list = el("ol", "acc-entries");
				for (const e of [...l.calls.entries].reverse()) {
					const li = el("li", isAlert(e.status) ? "bad" : "");
					li.append(el("span", "acc-at", time(e.at)), el("code", "", `${e.method} ${e.path}`), el("span", "acc-status", String(e.status)));
					if (e.sensitive) li.append(el("span", "acc-sensitive", `⚠ ${t("accessSensitive")}`));
					list.append(li);
				}
				box.append(list);
			}
		} else {
			const pre = el("pre", "plg-out");
			if (!l?.output.length) pre.textContent = t("pluginsLogNoOutput");
			for (const o of l?.output ?? []) pre.append(el("span", o.stream === "err" ? "err" : o.stream === "app" ? "app" : "", `[${time(o.at)}] ${o.text}\n`));
			box.append(pre);
		}
		return box;
	}

	function renderPlugin(p) {
		const item = el("li", "acc-item");
		const head = el("div", "acc-head");
		const id = el("div", "acc-id");
		id.append(el("b", "", p.manifest?.name ?? p.id), el("span", "acc-last4", p.manifest ? `v${p.manifest.version}${p.manifest.author ? ` · ${p.manifest.author}` : ""}` : ""));
		const tags = el("div", "acc-tags");
		if (openLog === p.id) markSeen(p.id);
		const errors = unseenErrors(p.id);
		if (errors) {
			const warn = button("acc-badge acc-errors", `⚠ ${errors}`);
			warn.title = fmt("accessErrors", errors);
			warn.addEventListener("click", () => {
				openLog = p.id;
				render();
			});
			tags.append(warn);
		}
		tags.append(el("span", `acc-badge acc-run ${stateClass[p.state] ?? ""}`, stateText(p)));
		const level = p.grant?.level ?? p.manifest?.access;
		if (level) tags.append(levelBadge(level));
		head.append(id, tags);
		item.append(head);
		if (p.manifest?.description) item.append(el("div", "acc-muted", p.manifest.description));
		const vt = viewsText(p);
		if (vt) item.append(el("div", "acc-muted", vt));
		if (p.grant?.level === "pilot_full" && p.state !== "disabled") item.append(el("p", "acc-warn", t("pluginsFullWarn")));
		if (p.state === "changed") item.append(el("p", "plg-why warn", t("pluginsChangedWhy")));
		if (p.state === "failed") item.append(el("p", "acc-warn", t("pluginsFailedWhy")));
		if (p.state === "invalid") item.append(el("p", "acc-warn", fmt("pluginsInvalidWhy", t(`plgReason_${p.reason}`) || p.reason)));

		const row = el("div", "lan-row acc-actions");
		const add = (label, cls, fn) => {
			const b = button(cls, label);
			b.disabled = busy;
			b.addEventListener("click", fn);
			row.append(b);
		};
		if (p.state === "running") {
			add(`⏹ ${t("pluginsStop")}`, "", () => command(p, "stop"));
			add(`↻ ${t("pluginsRestart")}`, "", () => command(p, "restart"));
		}
		if (p.state === "stopped") {
			add(`▶ ${t("pluginsStart")}`, "acc-primary", () => command(p, "start"));
			add(t("pluginsDisable"), "", () => command(p, "disable"));
		}
		if (p.state === "failed") {
			add(`↻ ${t("pluginsRestart")}`, "acc-primary", () => command(p, "start"));
			add(t("pluginsDisable"), "", () => command(p, "disable"));
		}
		if (p.state === "new" || p.state === "disabled") add(`${t("pluginsEnable")}…`, "acc-primary", () => openConsent(p));
		if (p.state === "changed") add(`${t("pluginsReview")}…`, "acc-primary", () => openConsent(p));
		if (p.grant && p.state !== "invalid") {
			add(openLog === p.id ? t("accessLogHide") : `${t("accessLog")}${errors ? " ⚠" : ""}`, errors ? "acc-log-warn" : "", () => {
				openLog = openLog === p.id ? null : p.id;
				render();
			});
		}
		if (row.childElementCount) item.append(row);
		if (openLog === p.id) item.append(renderLog(p));
		return item;
	}

	function renderConsent() {
		const c = consent;
		const p = c.p;
		const box = el("div", "plg-consent");
		box.append(el("h3", "", fmt("pluginsConsentTitle", p.manifest.name)));
		const facts = el("dl", "plg-facts");
		const fact = (k, v) => facts.append(el("dt", "", k), el("dd", "", v));
		fact(t("pluginsVersion"), `${p.manifest.version}${p.manifest.author ? ` — ${p.manifest.author}` : ""}`);
		fact(t("pluginsFolder"), `${data.dir}\\${p.id}`);
		fact(t("pluginsCommand"), `${p.command} (${t("pluginsNoShell")})`);
		fact(t("pluginsFiles"), fmt("pluginsFilesValue", p.files, `${p.hash.slice(0, 4)}…${p.hash.slice(-4)}`));
		box.append(facts);
		if (p.state === "changed") box.append(el("p", "plg-why warn", t("pluginsChangedWhy")));

		box.append(el("h4", "", t("pluginsLevelAsked")));
		const levels = el("div", "acc-levels");
		levels.setAttribute("role", "radiogroup");
		for (const level of LEVELS) {
			if (LEVELS.indexOf(level) > LEVELS.indexOf(p.manifest.access)) continue;
			const card = button(`acc-level acc-${level}`);
			card.setAttribute("role", "radio");
			card.setAttribute("aria-checked", String(c.level === level));
			card.append(el("b", "", t(`accessLevel_${level}`)), el("small", "", t(`accessLevelDesc_${level}`)));
			card.addEventListener("click", () => {
				c.level = level;
				render();
			});
			levels.append(card);
		}
		box.append(levels, el("p", "acc-muted", t("pluginsLevelLower")));
		if (c.level === "pilot_full") box.append(el("p", "acc-warn", t("pluginsFullWarn")));

		const asked = new Set(p.manifest.views ?? []);
		if (asked.size) {
			box.append(el("h4", "", t("pluginsViewsTitle")));
			const check = (label, on, set) => {
				const l = el("label", "opt-check plg-check");
				const i = el("input");
				i.type = "checkbox";
				i.checked = on;
				i.addEventListener("change", () => {
					set(i.checked);
					render();
				});
				l.append(i, el("span", "", ` ${label}`));
				box.append(l);
				return l;
			};
			if (asked.has("read")) check(t("pluginsViewsReadLong"), c.read, (v) => (c.read = v));
			if (asked.has("edit")) {
				check(t("pluginsViewsEditLong"), c.edit !== false, (v) => (c.edit = v ? [] : false));
				if (c.edit !== false) {
					const sub = el("div", "plg-sub");
					check(t("pluginsViewsEditAll"), c.edit === "all", (v) => (c.edit = v ? "all" : []));
					if (c.edit !== "all") {
						for (const v of views) {
							const l = el("label", "opt-check plg-check");
							const i = el("input");
							i.type = "checkbox";
							i.checked = Array.isArray(c.edit) && c.edit.includes(v.id);
							i.addEventListener("change", () => {
								const set = new Set(Array.isArray(c.edit) ? c.edit : []);
								if (i.checked) set.add(v.id);
								else set.delete(v.id);
								c.edit = [...set];
							});
							l.append(i, el("span", "", ` ${v.name}`));
							sub.append(l);
						}
					}
					box.append(sub);
				}
			}
			if (asked.has("create")) check(fmt("pluginsViewsCreateLong", p.manifest.name), c.create, (v) => (c.create = v));
		}

		box.append(el("p", p.protection === "node" ? "plg-shield" : "acc-warn", p.protection === "node" ? `🛡 ${t("pluginsShieldNode")}` : `⚠ ${t("pluginsShieldNone")}`));
		box.append(el("p", "acc-warn", `⚠ ${t("pluginsProgramWarn")}`), el("p", "acc-muted", t("pluginsGameWarn")));
		const trust = el("label", "opt-check plg-check");
		const ti = el("input");
		ti.type = "checkbox";
		ti.checked = c.trust;
		ti.addEventListener("change", () => (c.trust = ti.checked));
		trust.append(ti, el("span", "", ` ${t("pluginsTrust")}`));
		box.append(trust);
		const row = el("div", "lan-row");
		const go = button("acc-primary", t("pluginsEnableStart"));
		go.disabled = busy;
		go.addEventListener("click", enable);
		const cancel = button("", t("accessCancel"));
		cancel.addEventListener("click", () => {
			consent = null;
			notice = "";
			render();
		});
		row.append(go, cancel);
		box.append(row);
		return box;
	}

	function render() {
		renderPill();
		if (!dialog.open) return;
		const box = el("div", "acc-dlg");
		box.append(el("h2", "", t("pluginsTitle")), el("p", "lan-sub", t("pluginsSub")));
		if (notice) box.append(el("p", notice.bad ? "lan-notice acc-notice-bad" : "lan-notice", notice.bad ? `⚠ ${notice.text}` : notice));
		if (consent) box.append(renderConsent());
		else if (!data) box.append(el("p", "acc-muted", t("accessLoading")));
		else {
			const top = el("div", "lan-row plg-top");
			const running = data.plugins.filter((p) => p.state === "running").length;
			top.append(el("span", "plg-count", fmt("pluginsCount", running, data.plugins.length)));
			const actions = el("div", "lan-row");
			const scan = button("", `🔄 ${t("pluginsScan")}`);
			scan.disabled = busy;
			scan.addEventListener("click", async () => {
				notice = "";
				await load(true);
				render();
			});
			const folder = button("", `📂 ${t("pluginsOpenFolder")}`);
			folder.addEventListener("click", () => api("/api/v1/plugins/open-folder", { method: "POST" }).catch(() => null));
			const all = button("acc-revoke", `⏹ ${t("pluginsStopAll")}`);
			all.disabled = busy || !running;
			all.addEventListener("click", stopAll);
			actions.append(scan, folder, all);
			top.append(actions);
			box.append(top);
			if (!data.plugins.length) box.append(el("p", "acc-muted", fmt("pluginsNone", data.dir)));
			else {
				const list = el("ul", "acc-list");
				list.append(...data.plugins.map(renderPlugin));
				box.append(list);
			}
		}
		const notes = el("div", "lan-note");
		for (const key of ["pluginsNoteProgram", "pluginsNoteNew", "pluginsNoteToken"]) notes.append(el("div", "", t(key)));
		box.append(notes);
		const foot = el("form", "lan-foot");
		foot.method = "dialog";
		const close = el("button", "", t("close"));
		close.type = "submit";
		foot.append(close);
		box.append(foot);
		const scroll = dialog.scrollTop;
		const logScroll = dialog.querySelector(".acc-entries, .plg-out")?.scrollTop ?? 0;
		dialog.replaceChildren(box);
		dialog.scrollTop = scroll;
		const logBox = dialog.querySelector(".acc-entries, .plg-out");
		if (logBox) logBox.scrollTop = logScroll;
	}

	/** Pendant que la fenêtre est ouverte : redessinée seulement si quelque chose a changé, jamais pendant le consentement. */
	async function poll() {
		clearTimeout(timer);
		if (!dialog.open) return;
		const before = JSON.stringify([data, logs]);
		if (!busy && !consent && (await load()) && dialog.open && !consent && JSON.stringify([data, logs]) !== before) render();
		timer = setTimeout(poll, POLL_OPEN_MS);
	}

	/** Fenêtre fermée : l'indicateur de la barre du haut suit l'état des plugins. */
	async function pollBar() {
		clearTimeout(barTimer);
		if (!dialog.open && (await load())) renderPill();
		barTimer = setTimeout(pollBar, POLL_BAR_MS);
	}

	async function open() {
		consent = null;
		notice = "";
		dialog.showModal();
		render();
		if (!(await load(true))) notice = bad(t("accessFailed"));
		render();
		timer = setTimeout(poll, POLL_OPEN_MS);
	}
	openBtn.addEventListener("click", open);
	pill.addEventListener("click", open);
	dialog.addEventListener("close", () => {
		clearTimeout(timer);
		consent = null;
		renderPill();
	});

	return {
		/** Visible seulement sur le PC avec le jeton de l'appli ; lance le suivi de l'indicateur. */
		async check() {
			const ok = await load();
			openBtn.hidden = !ok;
			document.getElementById("opt-plugins").hidden = !ok;
			renderPill();
			if (ok) barTimer = setTimeout(pollBar, POLL_BAR_MS);
		},
		/** Nom et état d'un plugin (pour sa vue) ; `undefined` si la liste n'est pas connue (autre appareil que le PC). */
		state(id) {
			const p = data?.plugins.find((x) => x.id === id);
			if (!data) return undefined;
			return { name: p?.manifest?.name ?? id, state: p?.state ?? "missing" };
		},
		applyTexts() {
			openBtn.textContent = `🧩 ${t("pluginsButton")}`;
			document.getElementById("opt-h-plugins").textContent = t("pluginsTitle");
			dialog.setAttribute("aria-label", t("pluginsTitle"));
			render();
		},
	};
}
