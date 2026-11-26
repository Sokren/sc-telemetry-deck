namespace ScTelemetryVoice.Tests;

/// <summary>Exemples de JSON au format du contrat (src/web/openapi.json, événements status / state).</summary>
internal static class Samples
{
	public static string State(
		bool inShip = true, int? shields = 62, int? hull = 100, int? hydrogen = 18, int? oxygen = 90, int? health = 100,
		string gearState = "off", string name = "Titan", string lang = "fr")
	{
		static string Pct(int? p) => p is null ? "" : $",\"percent\":{p}";
		var (gearName, on, off) = lang == "fr" ? ("Train", "SORTI", "RENTRÉ") : ("Landing gear", "DEPLOYED", "RETRACTED");
		var word = gearState is "on" or "moving-on" ? on : gearState is "off" or "moving-off" ? off : "—";
		var healthAvailable = health is not null ? "true" : "false";
		var ship = inShip ? "true" : "false";
		return $$"""
		{
		  "vitals": [
		    {"id":"health","label":"Santé","available":{{healthAvailable}},"text":"{{health}}","unit":"%","level":"ok"{{Pct(health)}}},
		    {"id":"oxygen","label":"Oxygène","available":true,"text":"{{oxygen}}","unit":"%","level":"ok"{{Pct(oxygen)}}}
		  ],
		  "ship": [
		    {"id":"gear","name":"{{gearName}}","label":"GEAR","state":"{{gearState}}","word":"{{word}}","words":{"on":"{{on}}","off":"{{off}}"} }
		  ],
		  "character": {},
		  "morse": {"playing":false,"text":"","light":false,"progress":null},
		  "shipStatus": {
		    "available": {{ship}},
		    "name": "{{name}}",
		    "instruments": [
		      {"id":"shields","label":"Boucliers","text":"{{shields}}","unit":"%","level":"ok"{{Pct(shields)}}},
		      {"id":"hull","label":"Coque","text":"{{hull}}","unit":"%","level":"ok"{{Pct(hull)}}},
		      {"id":"hydrogen","label":"Hydrogène","text":"{{hydrogen}}","unit":"%","level":"ok"{{Pct(hydrogen)}}}
		    ],
		    "annunciators": []
		  }
		}
		""";
	}

	public static string Status(bool live)
	{
		var telemetry = live ? "live" : "no_data";
		return $$"""{"app":"sc-telemetry-web","version":"0.4.0","telemetry":"{{telemetry}}","character":"spawned","schema":"5.0","actions":"available"}""";
	}
}
