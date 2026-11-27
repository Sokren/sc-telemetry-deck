// SPDX-License-Identifier: MIT
// Plugin d'exemple (lecture seule, sans dépendance) : l'appli le lance avec, dans son environnement,
// l'adresse de l'API (SC_TELEMETRY_URL) et son jeton (SC_TELEMETRY_TOKEN, à envoyer dans l'en-tête Authorization).
// Ce qu'il écrit apparaît dans ⚙ Options → Plugins → Journal → Sortie du programme.
// Example plugin (read only, no dependency): the app starts it with the API address (SC_TELEMETRY_URL) and its
// token (SC_TELEMETRY_TOKEN, sent in the Authorization header). What it writes shows in the plugin log.

const url = process.env.SC_TELEMETRY_URL;
const token = process.env.SC_TELEMETRY_TOKEN;
let last = "";

async function tick() {
	try {
		const r = await fetch(`${url}/api/v1/status`, { headers: { authorization: `Bearer ${token}` } });
		if (!r.ok) {
			console.error(`Refusé / Refused: ${r.status} ${await r.text()}`);
			return;
		}
		const s = await r.json();
		const line = `Jeu / game: ${s.telemetry} · perso / character: ${s.character}`;
		if (line !== last) console.log(line);
		last = line;
	} catch (e) {
		console.error(`Appli injoignable / App unreachable: ${e.message}`);
	}
}

console.log(`Bonjour ! / Hello! API: ${url}`);
await tick();
setInterval(tick, 5000);
