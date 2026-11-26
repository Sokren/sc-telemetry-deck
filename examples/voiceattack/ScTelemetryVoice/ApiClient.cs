using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace ScTelemetryVoice;

/// <summary>Réponse HTTP brute. <c>Status</c> 0 = appli injoignable (fermée, délai dépassé).</summary>
public sealed record ApiResponse(int Status, string Body);

/// <summary>Appels à l'API de SC Telemetry Deck avec un jeton externe (en-tête Bearer).</summary>
public sealed class ApiClient
{
	private static readonly TimeSpan MaxBackoff = TimeSpan.FromSeconds(30);
	private readonly VoiceConfig _config;
	private readonly HttpClient _orders;
	private readonly HttpClient _stream;
	private readonly TimeSpan _firstDelay;
	private readonly TimeSpan _refusedDelay;

	public ApiClient(VoiceConfig config, HttpMessageHandler? handler = null, TimeSpan? orderTimeout = null, TimeSpan? retryDelay = null, TimeSpan? refusedDelay = null)
	{
		_config = config;
		_firstDelay = retryDelay ?? TimeSpan.FromSeconds(1);
		_refusedDelay = refusedDelay ?? MaxBackoff;
		handler ??= new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(5) };
		_orders = new HttpClient(handler, disposeHandler: false) { Timeout = orderTimeout ?? TimeSpan.FromSeconds(3) };
		_stream = new HttpClient(handler, disposeHandler: false) { Timeout = Timeout.InfiniteTimeSpan };
	}

	public Task<ApiResponse> PressAsync(string id, string mode) =>
		SendAsync(HttpMethod.Post, $"/api/v1/ship/functions/{Uri.EscapeDataString(id)}/press", $"{{\"mode\":\"{mode}\"}}");

	public Task<ApiResponse> TriggerAsync(string name) =>
		SendAsync(HttpMethod.Post, $"/api/v1/actions/{Uri.EscapeDataString(name)}/trigger", null);

	public Task<ApiResponse> GetAsync(string path) => SendAsync(HttpMethod.Get, path, null);

	/// <summary>
	/// Lit <c>/api/v1/events</c> jusqu'à l'annulation, en se reconnectant (1 s, doublé jusqu'à 30 s, ramené à
	/// 1 s dès qu'un événement arrive). <paramref name="log"/> ne reçoit jamais le jeton, et « injoignable »
	/// et « jeton refusé » n'y sont écrits qu'une fois jusqu'à la prochaine connexion (pas une ligne toutes les
	/// 30 s appli fermée). <paramref name="onDisconnect"/> est appelé quand un flux qui était ouvert se coupe.
	/// </summary>
	public async Task RunEventsAsync(Action<string, string> onEvent, Action<string> log, CancellationToken ct, Action? onDisconnect = null)
	{
		var backoff = _firstDelay;
		var quiet = false;
		var refusedLogged = false;
		var connected = false;
		while (!ct.IsCancellationRequested)
		{
			try
			{
				using var req = Request(HttpMethod.Get, "/api/v1/events", null);
				req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
				using var res = await _stream.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
				if (res.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
				{
					if (!refusedLogged)
					{
						var reason = ReasonOf(await res.Content.ReadAsStringAsync(ct)) ?? "?";
						log($"SC Telemetry Deck : jeton refusé / token refused ({(int)res.StatusCode}, {reason}) — nouvel essai toutes les 30 s / retrying every 30 s");
					}
					refusedLogged = true;
					await Task.Delay(_refusedDelay, ct);
					continue;
				}
				res.EnsureSuccessStatusCode();
				quiet = false;
				refusedLogged = false;
				connected = true;
				using var reader = new StreamReader(await res.Content.ReadAsStreamAsync(ct), Encoding.UTF8);
				var parser = new SseParser();
				while (!ct.IsCancellationRequested && await reader.ReadLineAsync(ct) is { } line)
				{
					foreach (var (ev, data) in parser.Feed(line))
					{
						backoff = _firstDelay;
						onEvent(ev, data);
					}
				}
				if (ct.IsCancellationRequested) return;
				log("SC Telemetry Deck : flux coupé / stream closed — reconnexion");
				Disconnected();
			}
			catch (OperationCanceledException) when (ct.IsCancellationRequested)
			{
				return;
			}
			catch (Exception e) when (e is HttpRequestException or IOException or OperationCanceledException)
			{
				if (!quiet) log("SC Telemetry Deck injoignable / unreachable — nouvel essai en tâche de fond / retrying in the background");
				quiet = true;
				Disconnected();
			}
			try { await Task.Delay(backoff, ct); }
			catch (OperationCanceledException) { return; }
			backoff = TimeSpan.FromTicks(Math.Min(backoff.Ticks * 2, MaxBackoff.Ticks));
		}

		void Disconnected()
		{
			if (!connected) return;
			connected = false;
			onDisconnect?.Invoke();
		}
	}

	/// <summary>Champ <c>reason</c> d'une réponse d'erreur JSON (ex. <c>stopped</c>, <c>dangerous_action</c>), sinon null.</summary>
	public static string? ReasonOf(string body)
	{
		try
		{
			using var doc = JsonDocument.Parse(body);
			return doc.RootElement.ValueKind == JsonValueKind.Object && doc.RootElement.TryGetProperty("reason", out var r) && r.ValueKind == JsonValueKind.String
				? r.GetString()
				: null;
		}
		catch (JsonException)
		{
			return null;
		}
	}

	private async Task<ApiResponse> SendAsync(HttpMethod method, string path, string? json)
	{
		try
		{
			using var req = Request(method, path, json);
			using var res = await _orders.SendAsync(req);
			return new ApiResponse((int)res.StatusCode, await res.Content.ReadAsStringAsync());
		}
		catch (Exception e) when (e is HttpRequestException or TaskCanceledException or IOException)
		{
			return new ApiResponse(0, "");
		}
	}

	private HttpRequestMessage Request(HttpMethod method, string path, string? json)
	{
		var sep = path.Contains('?') ? '&' : '?';
		var req = new HttpRequestMessage(method, $"{_config.Url}{path}{sep}lang={_config.Lang}");
		req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _config.Token);
		if (json is not null) req.Content = new StringContent(json, Encoding.UTF8, "application/json");
		return req;
	}
}
