#!/usr/bin/env python3
"""Static file server plus a same-origin proxy for VDOT 511 camera GeoJSON.

The 511 cams endpoint may block browser CORS, so /proxy/cams fetches it server-side.
Usage:
  python3 serve.py
  python3 serve.py 8766
Then open http://127.0.0.1:8766
"""
from __future__ import annotations

import json
import ssl
import sys
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
CTX = ssl.create_default_context()
UA = "SWVA511Cams/1.0 (personal; Marion VA)"
CAMS_URL = "https://511.vdot.virginia.gov/services/map/layers/map/cams"


def http_get(url: str, timeout: float = 30.0) -> tuple[int, str, bytes]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            return resp.status, resp.headers.get("Content-Type", "application/json"), resp.read()
    except urllib.error.HTTPError as e:
        body = e.read() if e.fp else b""
        ctype = e.headers.get("Content-Type", "application/json") if e.headers else "application/json"
        return e.code, ctype, body


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.split("?", 1)[0] == "/proxy/health":
            body = json.dumps({"ok": True, "service": "swva-511-cams"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.split("?", 1)[0] == "/proxy/cams":
            self._proxy_cams()
            return
        super().do_GET()

    def _proxy_cams(self) -> None:
        try:
            status, _ctype, body = http_get(CAMS_URL)
        except Exception as e:  # noqa: BLE001
            err = json.dumps({"error": "upstream failed", "detail": str(e)}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)
            return
        if status != 200 or not body:
            err = json.dumps({"error": "VDOT cams upstream failed", "status": status}).encode()
            self.send_response(502)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(err)))
            self.end_headers()
            self.wfile.write(err)
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self._cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"SWVA Traffic Watch  http://127.0.0.1:{PORT}")
    print(f"On your phone, use this computer's LAN IP, port {PORT}.")
    print("Ctrl+C to stop.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
