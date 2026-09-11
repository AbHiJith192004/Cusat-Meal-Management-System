"""Bound incoming bodies and keep authenticated responses out of shared caches."""
from starlette.responses import JSONResponse

from app.config import get_settings


class SecurityMiddleware:
    def __init__(self, app):
        self.app = app
        # Read once at app construction: settings are immutable per process.
        self._trust_proxy = get_settings().TRUST_PROXY_HEADERS

    def _is_secure(self, scope) -> bool:
        """Whether the *client* connection is HTTPS.

        Behind a TLS-terminating ingress the container is reached over plain
        HTTP, so `scope['scheme']` alone is always 'http' there and HSTS would
        never be emitted. uvicorn runs with --no-proxy-headers, so the
        forwarded scheme is read here instead - and only when the deployment
        has explicitly declared the ingress trustworthy, since otherwise any
        caller could forge it.
        """
        if scope.get('scheme') == 'https':
            return True
        if not self._trust_proxy:
            return False
        for name, value in scope.get('headers', []):
            if name == b'x-forwarded-proto':
                return value.decode('latin-1').split(',')[0].strip().lower() == 'https'
        return False

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)

        async def secure_send(message):
            if message['type'] == 'http.response.start':
                headers = list(message.get('headers', []))
                if scope['path'].startswith('/api/'):
                    headers.extend([(b'cache-control', b'no-store'), (b'pragma', b'no-cache')])
                headers.extend([(b'x-content-type-options', b'nosniff'),
                                (b'referrer-policy', b'no-referrer'),
                                (b'x-frame-options', b'DENY'),
                                (b'permissions-policy', b'camera=(self), geolocation=(), microphone=()'),
                                (b'content-security-policy',
                                 b"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; "
                                 b"script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                                 b"font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; "
                                 b"connect-src 'self'; media-src 'self' blob:; manifest-src 'self'"),
                                (b'cross-origin-opener-policy', b'same-origin')])
                if self._is_secure(scope):
                    headers.append((b'strict-transport-security', b'max-age=31536000; includeSubDomains'))
                message = {**message, 'headers': headers}
            await send(message)

        if scope['method'] in {'POST', 'PUT', 'PATCH'}:
            limit = 5 * 1024 * 1024 + 65536 if scope['path'].endswith('/students/import') else 65536
            body = bytearray()
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                if len(body) + len(chunk) > limit:
                    response = JSONResponse({'success': False, 'error': {'code': 'BODY_TOO_LARGE', 'message': 'Request body is too large.'}}, status_code=413)
                    return await response(scope, receive, secure_send)
                body.extend(chunk)
                if not message.get('more_body', False):
                    break
            delivered = False
            async def bounded_receive():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': bytes(body), 'more_body': False}
                return await receive()
            await self.app(scope, bounded_receive, secure_send)
        else:
            await self.app(scope, receive, secure_send)
