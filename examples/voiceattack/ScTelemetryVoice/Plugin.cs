// SPDX-License-Identifier: MPL-2.0
namespace ScTelemetryVoice;

/// <summary>
/// Plugin VoiceAttack 2 (interface v4 : fonctions statiques, proxy <c>dynamic</c>, comme l'exemple officiel
/// « Plugin Samples\C# »). Il branche la logique testée (contexte, client, état, phrases, alertes) sur VoiceAttack.
/// </summary>
public static class Plugin
{
	private const string ConfigFile = "sctd-voice.json";

	private static readonly object Lock = new();
	private static dynamic? _proxy;
	private static VoiceConfig? _config;
	private static ApiClient? _client;
	private static readonly GameState State = new();
	private static AlertEngine? _alerts;
	private static CancellationTokenSource? _cts;
	private static Task? _stream;

	public static string VA_DisplayName() => "SC Telemetry Deck – Voice v1.0";

	public static string VA_DisplayInfo() =>
		"Pilote Star Citizen à la voix via SC Telemetry Deck (ordres, réponses, alertes).\r\n" +
		"Voice control for Star Citizen through SC Telemetry Deck (orders, replies, alerts).";

	public static Guid VA_Id() => new("b9bf338c-95ea-4631-b380-7595ae51cee1");

	public static void VA_StopCommand() { }

	public static void VA_Init1(dynamic vaProxy)
	{
		_proxy = vaProxy;
		var dir = Path.GetDirectoryName(typeof(Plugin).Assembly.Location) ?? "";
		_config = ConfigLoader.Load(Path.Combine(dir, ConfigFile), out var error);
		if (_config is null)
		{
			Log(error, "orange");
			return;
		}
		_client = new ApiClient(_config);
		_alerts = new AlertEngine(_config.Thresholds, () => DateTime.UtcNow);
		_cts = new CancellationTokenSource();
		var ct = _cts.Token;
		_stream = Task.Run(() => _client.RunEventsAsync(OnEvent, m => Log(m, "orange"), ct, OnDisconnect), ct);
		Log($"SC Telemetry Deck – Voice : prêt / ready ({_config.Url})", "green");
	}

	public static void VA_Exit1(dynamic vaProxy)
	{
		try
		{
			_cts?.Cancel();
			_stream?.Wait(TimeSpan.FromSeconds(1));
		}
		catch (AggregateException) { }
	}

	public static void VA_Invoke1(dynamic vaProxy)
	{
		var lang = _config?.Lang ?? "fr";
		string context = vaProxy.Context ?? "";
		if (_client is null)
		{
			Reply(vaProxy, "error", lang == "en" ? "Plugin not configured." : "Plugin non configuré.");
			return;
		}
		try
		{
			switch (ContextParser.Parse(context))
			{
				case FunctionOrder f:
					var pressed = _client.PressAsync(f.Id, f.Mode).GetAwaiter().GetResult();
					LogRefused(pressed);
					var press = Replies.ForFunction(lang, pressed, State.Function(f.Id), f.Mode);
					Reply(vaProxy, press.Outcome.ToString().ToLowerInvariant(), press.Reply);
					break;
				case ActionOrder a:
					var triggered = _client.TriggerAsync(a.Name).GetAwaiter().GetResult();
					LogRefused(triggered);
					var trig = Replies.ForAction(lang, triggered, a.Name);
					Reply(vaProxy, trig.Outcome.ToString().ToLowerInvariant(), trig.Reply);
					break;
				case SayOrder s:
					Reply(vaProxy, State.Percent(s.Id) is null ? "error" : "sent", Replies.ForSay(lang, State, s.Id));
					break;
				default:
					Log($"SC Telemetry Deck – Voice : contexte inconnu / unknown context « {context} »", "orange");
					Reply(vaProxy, "error", Replies.Unknown(lang));
					break;
			}
		}
		catch (Exception e)
		{
			Log($"SC Telemetry Deck – Voice : {e.GetType().Name}", "red");
			Reply(vaProxy, "error", lang == "en" ? "Error." : "Erreur.");
		}
	}

	// Thread de fond : événements du flux /api/v1/events.
	private static void OnEvent(string ev, string data)
	{
		try
		{
			switch (ev)
			{
				case "status":
					State.ApplyStatus(data);
					Set(p => p.SetText("SCTD_game", State.Live ? "live" : "no_data"));
					break;
				case "state":
					State.ApplyState(data);
					PublishState();
					break;
				default:
					return; // tile, views, feedback… : sans intérêt ici
			}
			RunAlerts();
		}
		catch (Exception e)
		{
			Log($"SC Telemetry Deck – Voice : {e.GetType().Name} ({ev})", "red");
		}
	}

	// Thread de fond : flux coupé (appli fermée…) → on oublie les valeurs, plus rien n'est « live ».
	private static void OnDisconnect()
	{
		try
		{
			State.Reset();
			Set(p => p.SetText("SCTD_game", "no_data"));
			PublishState();
			RunAlerts();
		}
		catch (Exception e)
		{
			Log($"SC Telemetry Deck – Voice : {e.GetType().Name} (disconnect)", "red");
		}
	}

	private static void RunAlerts()
	{
		foreach (var command in _alerts?.Evaluate(State) ?? [])
			Set(p => { if (p.Command.Exists(command)) p.Command.Execute(command); });
	}

	// Jeton refusé sur un ordre : la raison (level, lan, stopped, dangerous_action…) au journal, jamais le jeton.
	private static void LogRefused(ApiResponse r)
	{
		if (r.Status is 401 or 403)
			Log($"SC Telemetry Deck – Voice : refusé / refused ({r.Status}, {ApiClient.ReasonOf(r.Body) ?? "?"})", "orange");
	}

	private static void PublishState()
	{
		Set(p =>
		{
			p.SetBoolean("SCTD_in_ship", (bool?)State.InShip);
			p.SetText("SCTD_ship", State.ShipName);
			p.SetInt("SCTD_shields", State.Percent("shields"));
			p.SetInt("SCTD_hull", State.Percent("hull"));
			p.SetInt("SCTD_hydrogen", State.Percent("hydrogen"));
			p.SetInt("SCTD_quantum", State.Percent("quantum"));
			p.SetInt("SCTD_health", State.Percent("health"));
			p.SetInt("SCTD_oxygen", State.Percent("oxygen"));
			p.SetInt("SCTD_thirst", State.Percent("thirst"));
			p.SetText("SCTD_gear", State.Function("gear")?.Word);
		});
	}

	private static void Reply(dynamic vaProxy, string outcome, string reply)
	{
		vaProxy.SetText("SCTD_result", outcome);
		vaProxy.SetText("SCTD_reply", reply);
	}

	private static void Set(Action<dynamic> write)
	{
		lock (Lock)
		{
			if (_proxy is not null) write(_proxy);
		}
	}

	private static void Log(string message, string color) => Set(p => p.WriteToLog(message, color));
}
