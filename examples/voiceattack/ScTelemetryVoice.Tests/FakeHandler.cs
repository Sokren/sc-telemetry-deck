// SPDX-License-Identifier: MIT
using System.Net;

namespace ScTelemetryVoice.Tests;

/// <summary>Faux réseau : enregistre la dernière requête et renvoie la réponse fournie.</summary>
internal sealed class FakeHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond) : HttpMessageHandler
{
	public HttpRequestMessage? Request { get; private set; }
	public string? Body { get; private set; }

	public static FakeHandler Returning(HttpStatusCode code, string body) =>
		new((_, _) => Task.FromResult(new HttpResponseMessage(code) { Content = new StringContent(body) }));

	protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
	{
		Request = request;
		Body = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
		return await respond(request, ct);
	}
}
