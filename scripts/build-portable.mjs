// SPDX-License-Identifier: MPL-2.0
// Fabrique dist/sc-telemetry-web-<version>-portable.zip : l'appli web (dist-web) + le node.exe officiel,
// non modifié donc toujours signé par l'OpenJS Foundation (Windows Smart App Control le laisse passer,
// contrairement à l'exe SEA dont l'injection efface la signature), un lanceur .cmd et un README.txt EN / FR.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

if (process.platform !== "win32") throw new Error("Version portable Windows uniquement / Windows-only portable build");

const match = /export const VERSION = "([^"]+)"/.exec(fs.readFileSync("src/web/server-core.ts", "utf-8"));
if (!match) throw new Error("VERSION introuvable dans src/web/server-core.ts / VERSION not found");
const version = match[1];

// La signature du node.exe est tout l'intérêt de cette version : on refuse un node.exe non signé.
const signature = execFileSync(
	"powershell.exe",
	["-NoProfile", "-Command", `(Get-AuthenticodeSignature -LiteralPath '${process.execPath.replaceAll("'", "''")}').Status`],
	{ encoding: "utf-8" },
).trim();
if (signature !== "Valid") throw new Error(`node.exe non signé (${signature}) : ${process.execPath} / node.exe is not signed`);

run("npx", ["rollup", "-c", "rollup.web.config.mjs"]);

const name = `SC Telemetry Web ${version}`;
const stage = path.join("dist-portable", name);
fs.rmSync("dist-portable", { recursive: true, force: true });
fs.mkdirSync(path.join(stage, "runtime"), { recursive: true });
fs.copyFileSync(process.execPath, path.join(stage, "runtime", "node.exe"));
fs.cpSync("dist-web", path.join(stage, "app"), { recursive: true });

const crlf = (text) => text.replace(/\r?\n/g, "\r\n");
fs.writeFileSync(path.join(stage, "SC Telemetry Web.cmd"), crlf(fs.readFileSync("scripts/portable/SC Telemetry Web.cmd", "utf-8")));
// BOM : le Bloc-notes affiche les accents quel que soit le réglage.
const readme = fs.readFileSync("scripts/portable/README.txt", "utf-8").replaceAll("{{VERSION}}", version);
fs.writeFileSync(path.join(stage, "README.txt"), `\uFEFF${crlf(readme)}`);

fs.mkdirSync("dist", { recursive: true });
const zip = path.resolve("dist", `sc-telemetry-web-${version}-portable.zip`);
fs.rmSync(zip, { force: true });
// tar.exe de Windows (bsdtar) écrit un vrai zip avec -a ; chemin explicite pour ne pas prendre le tar de Git.
execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", zip, "-C", "dist-portable", name], {
	stdio: "inherit",
});
console.log(`\nOK : ${path.relative(".", zip)} (${Math.round(fs.statSync(zip).size / 1e6)} Mo)`);
