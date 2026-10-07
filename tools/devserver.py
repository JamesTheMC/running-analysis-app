"""Static dev server with caching disabled (python3 tools/devserver.py [port]).

Plain `python3 -m http.server` lets browsers heuristically cache ES modules, so edits can
silently not load. Range requests are not needed: the app reads videos via File/Blob.

Dev-only: POST /__save?name=<file> writes the request body to test-data/debug/<file>. Used by
test/pipeline.html for contact sheets and cached landmark rows. Accepted from this machine only
(loopback), so a phone on the LAN can browse the app but cannot write files.
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEBUG_DIR = os.path.join(ROOT, "test-data", "debug")
MAX_BYTES = 200 * 1024 * 1024


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json"}

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        url = urlparse(self.path)
        name = (parse_qs(url.query).get("name") or [""])[0]
        length = int(self.headers.get("Content-Length") or 0)
        if url.path != "/__save" or self.client_address[0] not in ("127.0.0.1", "::1"):
            return self.send_error(403)
        if not re.fullmatch(r"[A-Za-z0-9._-]{1,120}", name) or name.startswith(".") or length > MAX_BYTES:
            return self.send_error(400)
        os.makedirs(DEBUG_DIR, exist_ok=True)
        with open(os.path.join(DEBUG_DIR, name), "wb") as f:
            f.write(self.rfile.read(length))
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    ThreadingHTTPServer(("0.0.0.0", port), partial(NoCacheHandler, directory=ROOT)).serve_forever()
