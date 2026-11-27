// SPDX-License-Identifier: MIT
namespace ScTelemetryVoice.Tests;

public sealed class ConfigTests : IDisposable
{
	private readonly string _path = Path.Combine(Path.GetTempPath(), $"sctd-voice-{Guid.NewGuid():N}.json");

	public void Dispose() { if (File.Exists(_path)) File.Delete(_path); }

	private VoiceConfig? LoadText(string? content, out string error)
	{
		if (content is not null) File.WriteAllText(_path, content);
		return ConfigLoader.Load(_path, out error);
	}

	[Fact]
	public void Load_valid_file()
	{
		var c = LoadText("""{"url":"http://127.0.0.1:9000","token":"sct_ext_abc","lang":"en"}""", out _)!;
		Assert.Equal("http://127.0.0.1:9000", c.Url);
		Assert.Equal("sct_ext_abc", c.Token);
		Assert.Equal("en", c.Lang);
		Assert.Equal(25, c.Thresholds.Shields);
	}

	[Fact]
	public void Load_defaults_url_and_lang()
	{
		var c = LoadText("""{"token":"sct_ext_abc"}""", out _)!;
		Assert.Equal("http://127.0.0.1:8743", c.Url);
		Assert.Equal("fr", c.Lang);
	}

	[Fact]
	public void Load_trims_trailing_slash()
	{
		var c = LoadText("""{"token":"t","url":"http://127.0.0.1:8743/"}""", out _)!;
		Assert.Equal("http://127.0.0.1:8743", c.Url);
	}

	[Fact]
	public void Load_overrides_one_threshold()
	{
		var c = LoadText("""{"token":"t","alerts":{"shields":40}}""", out _)!;
		Assert.Equal(40, c.Thresholds.Shields);
		Assert.Equal(50, c.Thresholds.Hull);
		Assert.Equal(25, c.Thresholds.Thirst);
	}

	[Fact]
	public void Load_reads_thirst_threshold()
	{
		var c = LoadText("""{"token":"t","alerts":{"thirst":40}}""", out _)!;
		Assert.Equal(40, c.Thresholds.Thirst);
	}

	[Theory]
	[InlineData(null)]
	[InlineData("{oops")]
	[InlineData("""{"token":""}""")]
	[InlineData("""{"token":"sct_ext_secret","lang":"de"}""")]
	public void Load_invalid_returns_null_and_error_without_token(string? content)
	{
		var c = LoadText(content, out var err);
		Assert.Null(c);
		Assert.NotEmpty(err);
		Assert.DoesNotContain("sct_ext", err);
	}
}
