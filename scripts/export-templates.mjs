// SPDX-License-Identifier: MPL-2.0
// Réécrit docs/vues/*.json et *.code.txt (modèles de vues à importer) depuis src/web/view-templates.ts,
// puis vérifie qu'ils se relisent à l'identique (même test que npm test).
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["vitest", "run", "tests/web/view-templates.test.ts"], {
	stdio: "inherit",
	shell: process.platform === "win32",
	env: { ...process.env, SCTD_WRITE_TEMPLATES: "1" },
});
process.exit(r.status ?? 1);
