// SPDX-License-Identifier: MPL-2.0
using System.Net;

namespace ScTelemetryVoice.Tests;

public sealed class ApiClientTests
{
	private static readonly VoiceConfig Config = new("http://127.0.0.1:8743", "sct_ext_abc", "fr", new AlertThresholds());

	[Fact]
	public async Task Press_posts_mode_with_bearer_and_lang()
	{
		var h = FakeHandler.Returning(HttpStatusCode.OK, """{"decision":"noop"}""");
		var r = await new ApiClient(Config, h).PressAsync("gear", "on");
		Assert.Equal(HttpMethod.Post, h.Request!.Method);
		Assert.Equal("http://127.0.0.1:8743/api/v1/ship/functions/gear/press?lang=fr", h.Request.RequestUri!.ToString());
		Assert.Equal("Bearer sct_ext_abc", h.Request.Headers.Authorization!.ToString());
		Assert.Equal("""{"mode":"on"}""", h.Body);
		Assert.Equal(200, r.Status);
		Assert.Contains("noop", r.Body);
	}

	[Fact]
	public async Task Trigger_posts_to_action_route()
	{
		var h = FakeHandler.Returning(HttpStatusCode.OK, "{}");
		await new ApiClient(Config, h).TriggerAsync("v_lights_on");
		Assert.Equal(HttpMethod.Post, h.Request!.Method);
		Assert.EndsWith("/api/v1/actions/v_lights_on/trigger?lang=fr", h.Request.RequestUri!.ToString());
	}

	[Fact]
	public async Task Trigger_escapes_name()
	{
		var h = FakeHandler.Returning(HttpStatusCode.OK, "{}");
		await new ApiClient(Config, h).TriggerAsync("a/b c");
		Assert.EndsWith("/api/v1/actions/a%2Fb%20c/trigger?lang=fr", h.Request!.RequestUri!.AbsoluteUri);
	}

	[Fact]
	public async Task Http_error_keeps_status_and_body()
	{
		var h = FakeHandler.Returning(HttpStatusCode.Conflict, """{"decision":"refused"}""");
		var r = await new ApiClient(Config, h).PressAsync("gear", "toggle");
		Assert.Equal(409, r.Status);
		Assert.Contains("refused", r.Body);
	}

	[Fact]
	public async Task Connection_refused_is_status_0()
	{
		var h = new FakeHandler((_, _) => throw new HttpRequestException("refused"));
		var r = await new ApiClient(Config, h).PressAsync("gear", "toggle");
		Assert.Equal(0, r.Status);
	}

	[Fact]
	public async Task Timeout_is_status_0()
	{
		var h = new FakeHandler(async (_, ct) => { await Task.Delay(TimeSpan.FromSeconds(10), ct); return new HttpResponseMessage(HttpStatusCode.OK); });
		var r = await new ApiClient(Config, h, TimeSpan.FromMilliseconds(200)).PressAsync("gear", "toggle");
		Assert.Equal(0, r.Status);
	}

	[Fact]
	public async Task Get_adds_lang_to_existing_query()
	{
		var h = FakeHandler.Returning(HttpStatusCode.OK, "{}");
		await new ApiClient(Config, h).GetAsync("/api/v1/status");
		Assert.Equal("http://127.0.0.1:8743/api/v1/status?lang=fr", h.Request!.RequestUri!.ToString());
	}

	[Fact]
	public async Task Events_are_read_from_stream_until_cancelled()
	{
		using var cts = new CancellationTokenSource();
		var events = new List<(string, string)>();
		var h = FakeHandler.Returning(HttpStatusCode.OK, "event: status\ndata: {\"telemetry\":\"live\"}\n\n: ping\n\nevent: state\ndata: {}\n\n");
		await new ApiClient(Config, h).RunEventsAsync((e, d) => { events.Add((e, d)); if (events.Count == 2) cts.Cancel(); }, _ => { }, cts.Token);
		Assert.Equal([("status", "{\"telemetry\":\"live\"}"), ("state", "{}")], events);
		Assert.Equal("http://127.0.0.1:8743/api/v1/events?lang=fr", h.Request!.RequestUri!.ToString());
		Assert.Equal("Bearer sct_ext_abc", h.Request.Headers.Authorization!.ToString());
	}

	[Fact]
	public async Task Events_log_unreachable_only_once_until_connected()
	{
		using var cts = new CancellationTokenSource();
		var logs = new List<string>();
		var attempts = 0;
		var h = new FakeHandler((_, _) => { if (++attempts == 3) cts.Cancel(); throw new HttpRequestException("refused"); });
		await new ApiClient(Config, h, retryDelay: TimeSpan.Zero).RunEventsAsync((_, _) => { }, logs.Add, cts.Token);
		Assert.Equal(3, attempts);
		Assert.Single(logs);
	}

	[Fact]
	public async Task Events_log_never_contains_token()
	{
		using var cts = new CancellationTokenSource();
		var logs = new List<string>();
		var h = new FakeHandler((_, _) => throw new HttpRequestException("refused"));
		await new ApiClient(Config, h).RunEventsAsync((_, _) => { }, l => { logs.Add(l); cts.Cancel(); }, cts.Token);
		Assert.NotEmpty(logs);
		Assert.All(logs, l => Assert.DoesNotContain("sct_ext", l));
	}

	[Fact]
	public async Task Events_call_onDisconnect_once_when_connected_stream_ends()
	{
		using var cts = new CancellationTokenSource();
		var attempts = 0;
		var disconnects = 0;
		var h = new FakeHandler((_, _) =>
		{
			if (++attempts == 1) return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("event: status\ndata: {}\n\n") });
			if (attempts == 3) cts.Cancel();
			throw new HttpRequestException("refused");
		});
		await new ApiClient(Config, h, retryDelay: TimeSpan.Zero).RunEventsAsync((_, _) => { }, _ => { }, cts.Token, () => disconnects++);
		Assert.Equal(1, disconnects);
	}

	[Fact]
	public async Task Events_log_refused_token_once_with_reason()
	{
		using var cts = new CancellationTokenSource();
		var logs = new List<string>();
		var attempts = 0;
		var h = new FakeHandler((_, _) =>
		{
			if (++attempts == 3) cts.Cancel();
			return Task.FromResult(new HttpResponseMessage(HttpStatusCode.Unauthorized) { Content = new StringContent("""{"error":"unauthorized","reason":"stopped"}""") });
		});
		await new ApiClient(Config, h, retryDelay: TimeSpan.Zero, refusedDelay: TimeSpan.Zero).RunEventsAsync((_, _) => { }, logs.Add, cts.Token);
		var line = Assert.Single(logs);
		Assert.Contains("stopped", line);
		Assert.DoesNotContain("sct_ext", line);
	}

	[Theory]
	[InlineData("""{"error":"forbidden","reason":"dangerous_action"}""", "dangerous_action")]
	[InlineData("""{"error":"unauthorized"}""", null)]
	[InlineData("pas du json", null)]
	public void ReasonOf_reads_reason_field(string body, string? expected) =>
		Assert.Equal(expected, ApiClient.ReasonOf(body));
}
