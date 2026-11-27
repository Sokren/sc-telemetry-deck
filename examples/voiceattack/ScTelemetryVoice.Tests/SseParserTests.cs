// SPDX-License-Identifier: MIT
namespace ScTelemetryVoice.Tests;

public sealed class SseParserTests
{
	[Fact]
	public void Sse_event_and_data()
	{
		var p = new SseParser();
		Assert.Empty(p.Feed("event: state"));
		Assert.Empty(p.Feed("data: {\"a\":1}"));
		Assert.Equal(("state", "{\"a\":1}"), Assert.Single(p.Feed("")));
	}

	[Fact]
	public void Sse_ping_comment_ignored()
	{
		var p = new SseParser();
		Assert.Empty(p.Feed(": ping"));
		Assert.Empty(p.Feed(""));
	}

	[Fact]
	public void Sse_multiline_data_joined_with_newline()
	{
		var p = new SseParser();
		p.Feed("data: a");
		p.Feed("data: b");
		Assert.Equal("a\nb", Assert.Single(p.Feed("")).Data);
	}

	[Fact]
	public void Sse_default_event_is_message()
	{
		var p = new SseParser();
		p.Feed("data: x");
		Assert.Equal("message", Assert.Single(p.Feed("")).Event);
	}

	[Fact]
	public void Sse_event_name_resets_after_dispatch()
	{
		var p = new SseParser();
		p.Feed("event: state"); p.Feed("data: 1"); p.Feed("");
		p.Feed("data: 2");
		Assert.Equal("message", Assert.Single(p.Feed("")).Event);
	}
}
