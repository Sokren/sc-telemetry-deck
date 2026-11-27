// SPDX-License-Identifier: MPL-2.0
// Génère les profils d'exemple VoiceAttack (format XML .vap, importable par « Import Commands »).
// Generates the VoiceAttack example profiles (XML .vap, importable with "Import Commands").
//
//   node examples/voiceattack/profiles/make-vap.mjs
//
// Pour chaque langue de LANGS : SC-Telemetry-Voice-<XX>.vap (complet) et SC-Telemetry-Voice-<XX>-demo.vap
// (les commandes marquées `demo`, 20 au plus : limite de la version démo de VoiceAttack).
// Ajouter une langue : une entrée dans LANGS et une colonne dans chaque commande de COMMANDS.
//
// Format relevé dans VoiceAttack 2 : action plugin = ExternalInvoke, Context = GUID du plugin,
// Context4 = contexte passé au plugin, X=1 = attendre la fin ; action « Say » = Context (texte), X (volume).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const PLUGIN = "b9bf338c-95ea-4631-b380-7595ae51cee1";
const DEMO_MAX = 20;
const OUT = path.dirname(fileURLToPath(import.meta.url));

const LANGS = {
	fr: {
		profile: "SC Telemetry Voice FR",
		percent: "pour cent",
		categories: {
			flight: "SCTD vol",
			power: "SCTD énergie",
			lights: "SCTD lumières",
			seat: "SCTD siège",
			player: "SCTD personnage",
			emotes: "SCTD émotes",
			ask: "SCTD questions",
			doors: "SCTD portes",
			alerts: "SCTD alertes",
		},
	},
	en: {
		profile: "SC Telemetry Voice EN",
		percent: "percent",
		categories: {
			flight: "SCTD flight",
			power: "SCTD power",
			lights: "SCTD lights",
			seat: "SCTD seat",
			player: "SCTD character",
			emotes: "SCTD emotes",
			ask: "SCTD questions",
			doors: "SCTD doors",
			alerts: "SCTD alerts",
		},
	},
};

// Ordre : plugin (contexte) puis Say {TXT:SCTD_reply}. Phrases multiples séparées par « ; ».
const order = (cat, ctx, phrases, demo = false) => ({ cat, ctx, phrases, demo });
// Phrase dite seule (pas d'appel au plugin) : texte par langue, {P} = « pour cent » / « percent ».
const speak = (cat, phrases, says, demo = false) => ({ cat, phrases, says, demo });
// Alerte : le nom de la commande est fixe (appelé par le plugin), seul le texte change de langue.
const ALERT = (name, says, demo) => ({ cat: "alerts", phrases: { fr: name, en: name }, says, demo });

const COMMANDS = [
	// Vol / flight
	order("flight", "function:gear:on", { fr: "sors le train", en: "gear down;deploy landing gear" }, true),
	order("flight", "function:gear:off", { fr: "rentre le train", en: "gear up;retract landing gear" }, true),
	order("flight", "function:vtol", { fr: "VTOL", en: "VTOL" }, true),
	order("flight", "function:decoupled", { fr: "découplé", en: "decoupled" }, true),
	order("flight", "function:gsafe", { fr: "G safe", en: "G safe" }),
	order("flight", "function:proximity", { fr: "assistance de proximité", en: "proximity assist" }),
	order("flight", "function:esp", { fr: "ESP", en: "ESP" }),
	order("flight", "function:advanced_hud", { fr: "HUD avancé", en: "advanced HUD" }),
	order("flight", "function:master_nav:on", { fr: "mode navigation", en: "nav mode" }, true),
	order("flight", "function:master_nav:off", { fr: "mode combat", en: "combat mode" }),
	order("flight", "action:v_atc_request", { fr: "demande d'atterrissage", en: "request landing" }),
	order("flight", "action:v_toggle_docking_request", { fr: "demande d'amarrage", en: "request docking" }),
	order("flight", "action:v_flightready", { fr: "prêt au vol", en: "flight ready" }),
	// Énergie / power (l'extinction est refusée au niveau Pilotage : absente)
	order("power", "function:power_main:on", { fr: "allume le vaisseau", en: "power on" }, true),
	order("power", "function:power_engines", { fr: "énergie moteurs", en: "engine power" }),
	order("power", "function:power_weapons", { fr: "énergie armes", en: "weapon power" }),
	order("power", "function:power_shields", { fr: "énergie boucliers", en: "shield power" }),
	// Lumières / lights
	order("lights", "function:lights", { fr: "phares", en: "lights" }, true),
	order("lights", "function:night_vision", { fr: "vision nocturne", en: "night vision" }, true),
	order("lights", "action:toggle_flashlight", { fr: "lampe torche", en: "flashlight" }),
	// Quantique, radar, modes du siège / quantum, radar, seat modes
	order("seat", "action:v_toggle_qdrive_engagement", { fr: "saut quantique", en: "quantum jump" }, true),
	order("seat", "action:v_invoke_ping", { fr: "ping radar", en: "radar ping" }),
	order("seat", "action:v_target_hail", { fr: "héler la cible", en: "hail target" }),
	order("seat", "action:v_set_quantum_mode", { fr: "mode quantique", en: "quantum mode" }),
	order("seat", "action:v_set_scan_mode", { fr: "mode scan", en: "scan mode" }),
	order("seat", "action:v_set_mining_mode", { fr: "mode minage", en: "mining mode" }),
	order("seat", "action:v_set_salvage_mode", { fr: "mode récupération", en: "salvage mode" }),
	order("seat", "action:v_set_refuel_mode", { fr: "mode ravitaillement", en: "refuel mode" }),
	order("seat", "action:v_set_guns_mode", { fr: "mode armes", en: "guns mode" }),
	order("seat", "action:v_enter_remote_turret_1", { fr: "tourelle un", en: "turret one" }),
	order("seat", "action:v_enter_remote_turret_2", { fr: "tourelle deux", en: "turret two" }),
	order("seat", "action:v_enter_remote_turret_3", { fr: "tourelle trois", en: "turret three" }),
	// Personnage / character
	order("player", "action:mobiglas", { fr: "mobiGlas", en: "mobiGlas" }),
	order("player", "action:v_starmap", { fr: "carte stellaire", en: "star map" }),
	order("player", "action:visor_wipe", { fr: "essuie la visière", en: "wipe visor" }),
	// Émotes (une sélection ; les 34 sont dans GET /api/v1/actions)
	order("emotes", "action:emote_salute", { fr: "salue", en: "salute" }),
	order("emotes", "action:emote_wave", { fr: "fais coucou", en: "wave" }),
	order("emotes", "action:emote_dance", { fr: "danse", en: "dance" }),
	order("emotes", "action:emote_clap", { fr: "applaudis", en: "clap" }),
	order("emotes", "action:emote_laugh", { fr: "rigole", en: "laugh" }),
	order("emotes", "action:emote_cheer", { fr: "hourra", en: "cheer" }),
	order("emotes", "action:emote_point", { fr: "montre du doigt", en: "point" }),
	order("emotes", "action:emote_sit", { fr: "assieds-toi", en: "sit down" }),
	// Questions
	order("ask", "say:hydrogen", { fr: "carburant", en: "fuel" }, true),
	order("ask", "say:quantum", { fr: "carburant quantique", en: "quantum fuel" }),
	order("ask", "say:shields", { fr: "boucliers", en: "shields" }, true),
	order("ask", "say:hull", { fr: "coque", en: "hull" }),
	order("ask", "say:health", { fr: "santé", en: "health" }, true),
	order("ask", "say:oxygen", { fr: "oxygène", en: "oxygen" }),
	order("ask", "say:thirst", { fr: "soif", en: "thirst" }, true),
	speak(
		"ask",
		{ fr: "état du vaisseau", en: "ship status" },
		{
			fr: "{TXT:SCTD_ship}. Boucliers {INT:SCTD_shields} {P}, coque {INT:SCTD_hull} {P}.",
			en: "{TXT:SCTD_ship}. Shields {INT:SCTD_shields} {P}, hull {INT:SCTD_hull} {P}.",
		},
		true,
	),
	// Portes : refusées par le jeu en 5.0 PTU, gardées pour quand il les branchera (ouvrir / déverrouiller : protégé)
	order("doors", "function:doors_closed:on", { fr: "ferme les portes", en: "close the doors" }),
	order("doors", "function:doors_locked:on", { fr: "verrouille les portes", en: "lock the doors" }),
	// Alertes : déclenchées par le plugin (noms fixes, voir AlertEngine.cs)
	ALERT("((SCTD alert shields))", { fr: "Attention, boucliers à {INT:SCTD_shields} {P}.", en: "Warning, shields at {INT:SCTD_shields} {P}." }, true),
	ALERT("((SCTD alert hull))", { fr: "Attention, coque à {INT:SCTD_hull} {P}.", en: "Warning, hull at {INT:SCTD_hull} {P}." }, true),
	ALERT("((SCTD alert fuel))", { fr: "Carburant faible, {INT:SCTD_hydrogen} {P}.", en: "Fuel low, {INT:SCTD_hydrogen} {P}." }, true),
	ALERT("((SCTD alert oxygen))", { fr: "Oxygène faible.", en: "Oxygen low." }),
	ALERT("((SCTD alert health))", { fr: "Santé critique.", en: "Health critical." }, true),
	ALERT("((SCTD alert thirst))", { fr: "Soif, {INT:SCTD_thirst} {P}. Pense à boire.", en: "Thirst at {INT:SCTD_thirst} {P}. Time to drink." }, true),
	ALERT("((SCTD connected))", { fr: "Télémétrie connectée.", en: "Telemetry connected." }),
	ALERT("((SCTD game lost))", { fr: "Télémétrie perdue.", en: "Telemetry lost." }, true),
];

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Identifiants stables (même entrée → même GUID) : les fichiers ne changent pas d'un lancement à l'autre.
function uuid(...parts) {
	const h = createHash("sha1").update(parts.join("\u0000")).digest("hex");
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const action = (id, i, type, f) => `        <CommandAction>
          <PairingSet>false</PairingSet>
          <Ordinal>${i}</Ordinal>
          <ConditionMet xsi:nil="true" />
          <IndentLevel>0</IndentLevel>
          <Id>${uuid(id, "action", i)}</Id>
          <ActionType>${type}</ActionType>
          <Duration>0</Duration>
          <Delay>0</Delay>
          <KeyCodes />
          <Context>${esc(f.c ?? "")}</Context>
          <Context2 />
          <Context3 />
          <Context4>${esc(f.c4 ?? "")}</Context4>
          <X>${f.x ?? 0}</X>
          <Y>0</Y>
          <InputMode>0</InputMode>
          <ConditionPairing>0</ConditionPairing>
          <ConditionGroup>0</ConditionGroup>
          <ConditionStartOperator>0</ConditionStartOperator>
          <ConditionStartValue>0</ConditionStartValue>
          <ConditionStartValueType>0</ConditionStartValueType>
        </CommandAction>`;

function command(lang, cmd) {
	const L = LANGS[lang];
	const phrase = cmd.phrases[lang];
	const id = uuid(lang, phrase);
	const actions = cmd.ctx
		? [action(id, 0, "ExternalInvoke", { c: PLUGIN, c4: cmd.ctx, x: 1 }), action(id, 1, "Say", { c: "{TXT:SCTD_reply}", x: 100 })]
		: [action(id, 0, "Say", { c: cmd.says[lang].replaceAll("{P}", L.percent), x: 100 })];
	return `    <Command>
      <Id>${id}</Id>
      <CommandString>${esc(phrase)}</CommandString>
      <ActionSequence>
${actions.join("\n")}
      </ActionSequence>
      <Async>true</Async>
      <Enabled>true</Enabled>
      <Category>${esc(L.categories[cmd.cat])}</Category>
      <UseShortcut>false</UseShortcut>
      <keyValue>0</keyValue>
      <keyShift>0</keyShift>
      <keyAlt>0</keyAlt>
      <keyCtrl>0</keyCtrl>
      <keyWin>0</keyWin>
      <keyPassthru>true</keyPassthru>
      <UseSpokenPhrase>true</UseSpokenPhrase>
      <onlyKeyUp>false</onlyKeyUp>
      <RepeatNumber>2</RepeatNumber>
      <RepeatType>0</RepeatType>
      <CommandType>0</CommandType>
      <SourceProfile>00000000-0000-0000-0000-000000000000</SourceProfile>
      <Referrer xsi:nil="true" />
      <Confidence>0</Confidence>
    </Command>`;
}

const profile = (lang, name, cmds) => `<?xml version="1.0" encoding="utf-8"?>
<Profile xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Id>${uuid(lang, name)}</Id>
  <Name>${esc(name)}</Name>
  <Commands>
${cmds.map((c) => command(lang, c)).join("\n")}
  </Commands>
</Profile>
`;

// Vérifications : chaque langue a toutes ses phrases et ses textes, pas de phrase en double, démo ≤ 20.
const errors = [];
const demo = COMMANDS.filter((c) => c.demo);
if (demo.length > DEMO_MAX) errors.push(`démo : ${demo.length} commandes (max ${DEMO_MAX})`);
for (const lang of Object.keys(LANGS)) {
	const seen = new Set();
	for (const c of COMMANDS) {
		const p = c.phrases[lang];
		if (!p) errors.push(`${lang} : phrase manquante pour ${c.ctx ?? c.phrases.fr}`);
		if (!c.ctx && !c.says?.[lang]) errors.push(`${lang} : texte manquant pour ${c.phrases.fr}`);
		for (const one of (p ?? "").split(";").map((s) => s.trim().toLowerCase())) {
			if (seen.has(one)) errors.push(`${lang} : phrase en double « ${one} »`);
			seen.add(one);
		}
	}
}
if (errors.length) {
	console.error(errors.join("\n"));
	process.exit(1);
}

for (const lang of Object.keys(LANGS)) {
	const L = LANGS[lang];
	const tag = lang.toUpperCase();
	for (const [file, name, cmds] of [
		[`SC-Telemetry-Voice-${tag}.vap`, L.profile, COMMANDS],
		[`SC-Telemetry-Voice-${tag}-demo.vap`, `${L.profile} (demo)`, demo],
	]) {
		fs.writeFileSync(path.join(OUT, file), profile(lang, name, cmds).replace(/\n/g, "\r\n"));
		console.log(`${file} : ${cmds.length} commandes / commands`);
	}
}
