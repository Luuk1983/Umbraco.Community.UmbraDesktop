namespace Umbraco.Community.UmbraDesktop.Tests.Connections;

/// <summary>
/// One request a <see cref="StubHttpMessageHandler"/> was asked to send.
/// </summary>
/// <remarks>
/// Captured rather than held as the live <see cref="HttpRequestMessage"/>, because the body is a
/// stream that <see cref="HttpClient"/> disposes as soon as the call returns: a test that reached for
/// it afterwards would find it gone.
/// </remarks>
/// <param name="Method">The HTTP method used.</param>
/// <param name="Uri">The absolute URI requested.</param>
/// <param name="Body">The request body as text, or <c>null</c> when there was none.</param>
/// <param name="Authorization">The Authorization header value, or <c>null</c> when unset.</param>
internal sealed record RecordedRequest(HttpMethod Method, Uri? Uri, string? Body, string? Authorization);

/// <summary>
/// A message handler that answers from a function and records everything it was asked.
/// </summary>
/// <param name="respond">Builds the response for a request, and may inspect it.</param>
internal sealed class StubHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> respond)
    : HttpMessageHandler
{
    /// <summary>Every request sent through this handler, in order.</summary>
    public List<RecordedRequest> Requests { get; } = [];

    /// <summary>The most recent request, or <c>null</c> when nothing has been sent.</summary>
    public RecordedRequest? LastRequest => Requests.Count is 0 ? null : Requests[^1];

    /// <inheritdoc />
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        Requests.Add(new RecordedRequest(
            request.Method,
            request.RequestUri,
            request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken),
            request.Headers.Authorization?.ToString()));

        return respond(request);
    }
}

/// <summary>
/// Hands out clients that all write to one handler, standing in for the real factory.
/// </summary>
/// <param name="handler">The handler every client created here writes to.</param>
internal sealed class StubHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
{
    /// <inheritdoc />
    /// <remarks>
    /// The handler is not disposed with the client, because every client created here shares one and
    /// the first disposal would break the rest.
    /// </remarks>
    public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
}
