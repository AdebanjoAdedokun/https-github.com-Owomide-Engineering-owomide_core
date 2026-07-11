from __future__ import annotations

import json
from collections.abc import Callable
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread


class HealthServer:
    def __init__(self, server: ThreadingHTTPServer, thread: Thread) -> None:
        self._server = server
        self._thread = thread

    @property
    def port(self) -> int:
        return int(self._server.server_address[1])

    def stop(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)


def _handler(readiness: Callable[[], bool]) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path == "/health":
                self._respond(200, {"status": "ok"})
                return
            if self.path == "/readyz":
                try:
                    ready = readiness()
                except Exception:
                    ready = False
                self._respond(
                    200 if ready else 503,
                    {"status": "ready" if ready else "not_ready"},
                )
                return
            self._respond(404, {"status": "not_found"})

        def _respond(self, status: int, payload: dict[str, str]) -> None:
            body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    return Handler


def start_health_server(host: str, port: int, readiness: Callable[[], bool]) -> HealthServer:
    server = ThreadingHTTPServer((host, port), _handler(readiness))
    thread = Thread(target=server.serve_forever, name="health-server", daemon=True)
    thread.start()
    return HealthServer(server, thread)
