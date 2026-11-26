using System.Text.Json;

namespace ScTelemetryVoice;

/// <summary>
/// Une fonction vaisseau telle que la décrit le flux : état lu (on, off, moving-on, moving-off, unavailable,
/// unknown), mot affiché, mots des deux états et nom lisible.
/// </summary>
public sealed record FunctionWords(string State, string Word, string On, string Off, string Label);

/// <summary>
/// Dernier état connu, rempli par le flux <c>/api/v1/events</c> (thread de fond) et lu par les commandes.
/// </summary>
public sealed class GameState
{
	// Instruments (shipStatus.instruments) et constantes (vitals) dont on garde le pourcentage.
	private static readonly string[] InstrumentKeys = ["shields", "hull", "hydrogen", "quantum"];
	private static readonly string[] VitalKeys = ["health", "oxygen"];

	private readonly object _lock = new();
	private bool _live;
	private bool _inShip;
	private string? _shipName;
	private Dictionary<string, (int? Percent, string Label)> _values = [];
	private Dictionary<string, FunctionWords> _functions = [];

	public bool Live { get { lock (_lock) return _live; } }
	public bool InShip { get { lock (_lock) return _inShip; } }
	public string? ShipName { get { lock (_lock) return _shipName; } }

	public int? Percent(string key) { lock (_lock) return _values.TryGetValue(key, out var v) ? v.Percent : null; }
	public string? Label(string key) { lock (_lock) return _values.TryGetValue(key, out var v) ? v.Label : null; }
	public FunctionWords? Function(string id) { lock (_lock) return _functions.GetValueOrDefault(id); }

	/// <summary>Oublie tout (flux coupé, appli fermée) : plus « live », plus de valeurs.</summary>
	public void Reset()
	{
		lock (_lock)
		{
			_live = false;
			_inShip = false;
			_shipName = null;
			_values = [];
			_functions = [];
		}
	}

	/// <summary>Événement <c>status</c> : <c>telemetry</c> vaut <c>live</c> ou <c>no_data</c>.</summary>
	public void ApplyStatus(string json)
	{
		if (Parse(json) is not { } root) return;
		if (root.TryGetProperty("telemetry", out var t) && t.ValueKind == JsonValueKind.String)
			lock (_lock) _live = t.GetString() == "live";
	}

	/// <summary>Événement <c>state</c> : vitals, ship (fonctions) et shipStatus.</summary>
	public void ApplyState(string json)
	{
		if (Parse(json) is not { } root) return;
		var values = new Dictionary<string, (int?, string)>();
		var functions = new Dictionary<string, FunctionWords>();
		bool inShip = false;
		string? name = null;

		if (root.TryGetProperty("shipStatus", out var ss) && ss.ValueKind == JsonValueKind.Object)
		{
			inShip = ss.TryGetProperty("available", out var a) && a.ValueKind == JsonValueKind.True;
			name = Str(ss, "name");
			if (ss.TryGetProperty("instruments", out var ins)) ReadPercents(ins, InstrumentKeys, values);
		}
		if (root.TryGetProperty("vitals", out var vit)) ReadPercents(vit, VitalKeys, values);
		if (root.TryGetProperty("ship", out var ship) && ship.ValueKind == JsonValueKind.Array)
		{
			foreach (var f in ship.EnumerateArray())
			{
				if (f.ValueKind != JsonValueKind.Object || Str(f, "id") is not { } id) continue;
				var words = f.TryGetProperty("words", out var w) && w.ValueKind == JsonValueKind.Object ? w : default;
				functions[id] = new FunctionWords(
					Str(f, "state") ?? "unknown",
					Str(f, "word") ?? "",
					words.ValueKind == JsonValueKind.Object ? Str(words, "on") ?? "" : "",
					words.ValueKind == JsonValueKind.Object ? Str(words, "off") ?? "" : "",
					Str(f, "name") ?? Str(f, "label") ?? id);
			}
		}
		if (!root.TryGetProperty("shipStatus", out _) && !root.TryGetProperty("vitals", out _) && functions.Count == 0) return;

		lock (_lock)
		{
			_inShip = inShip;
			_shipName = inShip ? name : null;
			_values = values;
			_functions = functions;
		}
	}

	private static void ReadPercents(JsonElement array, string[] keys, Dictionary<string, (int?, string)> into)
	{
		if (array.ValueKind != JsonValueKind.Array) return;
		foreach (var item in array.EnumerateArray())
		{
			if (item.ValueKind != JsonValueKind.Object || Str(item, "id") is not { } id || !keys.Contains(id)) continue;
			if (item.TryGetProperty("available", out var av) && av.ValueKind == JsonValueKind.False) { into[id] = (null, Str(item, "label") ?? id); continue; }
			int? pct = item.TryGetProperty("percent", out var p) && p.ValueKind == JsonValueKind.Number ? (int)Math.Round(p.GetDouble()) : null;
			into[id] = (pct, Str(item, "label") ?? id);
		}
	}

	private static JsonElement? Parse(string json)
	{
		try
		{
			using var doc = JsonDocument.Parse(json);
			return doc.RootElement.ValueKind == JsonValueKind.Object ? doc.RootElement.Clone() : null;
		}
		catch (JsonException)
		{
			return null;
		}
	}

	private static string? Str(JsonElement o, string name) =>
		o.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
}
