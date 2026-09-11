"""Response-header hardening, including the forwarded-scheme HSTS path."""
import asyncio

from app.middleware.security import SecurityMiddleware


async def _ok(scope, receive, send):
    await send({"type": "http.response.start", "status": 200, "headers": []})
    await send({"type": "http.response.body", "body": b"{}"})


def _headers(scheme: str, headers: list, trust_proxy: bool, path: str = "/api/v1/health") -> dict:
    middleware = SecurityMiddleware(_ok)
    middleware._trust_proxy = trust_proxy
    captured: list = []

    async def send(message):
        if message["type"] == "http.response.start":
            captured.extend(message["headers"])

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    scope = {"type": "http", "method": "GET", "path": path,
             "scheme": scheme, "headers": headers}
    asyncio.run(middleware(scope, receive, send))
    return {k.decode(): v.decode() for k, v in captured}


HSTS = "strict-transport-security"
FWD_HTTPS = [(b"x-forwarded-proto", b"https")]


def test_hsts_sent_behind_trusted_tls_terminating_proxy():
    """The production topology: ingress terminates TLS and forwards over
    plain HTTP. Gating on scope['scheme'] alone silently dropped HSTS here."""
    assert HSTS in _headers("http", FWD_HTTPS, trust_proxy=True)


def test_hsts_sent_on_direct_https():
    assert HSTS in _headers("https", [], trust_proxy=False)


def test_hsts_not_sent_over_plain_http():
    assert HSTS not in _headers("http", [], trust_proxy=True)


def test_forwarded_proto_ignored_when_proxy_untrusted():
    """Without an explicit trust opt-in the header is caller-controlled, so
    honouring it would let anyone claim the connection was secure."""
    assert HSTS not in _headers("http", FWD_HTTPS, trust_proxy=False)


def test_forwarded_proto_uses_leftmost_hop():
    assert HSTS in _headers("http", [(b"x-forwarded-proto", b"https, http")], trust_proxy=True)
    assert HSTS not in _headers("http", [(b"x-forwarded-proto", b"http, https")], trust_proxy=True)


def test_baseline_hardening_headers_always_present():
    headers = _headers("http", [], trust_proxy=False)
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in headers["content-security-policy"]


def test_api_responses_are_not_cached():
    assert _headers("http", [], False, path="/api/v1/health")["cache-control"] == "no-store"
    assert "cache-control" not in _headers("http", [], False, path="/index.html")
