using System.Net;
using System.Net.Http.Headers;
using System.Text;

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

	public ApiClient(VoiceConfig config, HttpMessageHandler? handler = null, TimeSpan? orderTimeout = null, TimeSpan? retryDelay = null)
	{
		_config = config;
		_firstDelay = retryDelay ?? TimeSpan.FromSeconds(1);
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
	/// Lit <c>/api/v1/events</c> jusqu'à l'annulation, en se reconnectant (1 s, doublé jusqu'à 30 s, remis à
	/// 1 s dès qu'un événement arrive). <paramref name="log"/> ne reçoit jamais le jeton, et « injoignable »
	/// n'y est écrit qu'une fois jusqu'à la prochaine connexion (pas une ligne toutes les 30 s appli fermée).
	/// </summary>
	public async Task RunEventsAsync(Action<string, string> onEvent, Action<string> log, CancellationToken ct)
	{
		var backoff = _firstDelay;
		var quiet = false;
		while (!ct.IsCancellationRequested)
		{
			try
			{
				using var req = Request(HttpMethod.Get, "/api/v1/events", null);
				req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
				using var res = await _stream.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
				if (res.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
				{
					log($"SC Telemetry Deck : jeton refusé ({(int)res.StatusCode}) / token refused — nouvel essai dans 30 s");
					await Task.Delay(MaxBackoff, ct);
					continue;
				}
				res.EnsureSuccessStatusCode();
				quiet = false;
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
			}
			catch (OperationCanceledException) when (ct.IsCancellationRequested)
			{
				return;
			}
			catch (Exception e) when (e is HttpRequestException or IOException or OperationCanceledException)
			{
				if (!quiet) log("SC Telemetry Deck injoignable / unreachable — nouvel essai en tâche de fond / retrying in the background");
				quiet = true;
			}
			try { await Task.Delay(backoff, ct); }
			catch (OperationCanceledException) { return; }
			backoff = TimeSpan.FromTicks(Math.Min(backoff.Ticks * 2, MaxBackoff.Ticks));
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
