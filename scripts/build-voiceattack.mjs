// SPDX-License-Identifier: MPL-2.0
// Fabrique dist/sc-telemetry-voice-<version>.zip : le plugin VoiceAttack 2 (DLL compilée en Release + modèle
// de réglages, dossier à copier tel quel dans %APPDATA%\VoiceAttack2\Apps\), les profils .vap régénérés et un
// README.txt EN / FR. Il faut le kit .NET 8 SDK (dotnet) pour compiler la DLL.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const run = (cmd, args) => execFileSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });

if (process.platform !== "win32") throw new Error("Zip VoiceAttack : Windows uniquement / Windows-only build");

const match = /export const VERSION = "([^"]+)"/.exec(fs.readFileSync("src/web/server-core.ts", "utf-8"));
if (!match) throw new Error("VERSION introuvable dans src/web/server-core.ts / VERSION not found");
const version = match[1];

const src = path.join("examples", "voiceattack");
run("dotnet", ["build", path.join(src, "ScTelemetryVoice", "ScTelemetryVoice.csproj"), "-c", "Release", "--nologo", "-v", "q"]);
run("node", [path.join(src, "profiles", "make-vap.mjs")]);

const name = `SC Telemetry Voice ${version}`;
const stage = path.join("dist-voiceattack", name);
fs.rmSync("dist-voiceattack", { recursive: true, force: true });
const plugin = path.join(stage, "ScTelemetryVoice");
fs.mkdirSync(plugin, { recursive: true });
fs.copyFileSync(path.join(src, "ScTelemetryVoice", "bin", "Release", "net8.0", "ScTelemetryVoice.dll"), path.join(plugin, "ScTelemetryVoice.dll"));
fs.copyFileSync(path.join(src, "sctd-voice.example.json"), path.join(plugin, "sctd-voice.example.json"));
fs.mkdirSync(path.join(stage, "profiles"));
for (const f of fs.readdirSync(path.join(src, "profiles")).filter((f) => f.endsWith(".vap")))
	fs.copyFileSync(path.join(src, "profiles", f), path.join(stage, "profiles", f));

const crlf = (text) => text.replace(/\r?\n/g, "\r\n");
// BOM : le Bloc-notes affiche les accents quel que soit le réglage.
const readme = fs.readFileSync("scripts/voiceattack/README.txt", "utf-8").replaceAll("{{VERSION}}", version);
fs.writeFileSync(path.join(stage, "README.txt"), `\uFEFF${crlf(readme)}`);

fs.mkdirSync("dist", { recursive: true });
const zip = path.resolve("dist", `sc-telemetry-voice-${version}.zip`);
fs.rmSync(zip, { force: true });
// tar.exe de Windows (bsdtar) écrit un vrai zip avec -a ; chemin explicite pour ne pas prendre le tar de Git.
execFileSync(path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe"), ["-a", "-c", "-f", zip, "-C", "dist-voiceattack", name], {
	stdio: "inherit",
});
console.log(`\nOK : ${path.relative(".", zip)} (${Math.round(fs.statSync(zip).size / 1e3)} ko)`);
