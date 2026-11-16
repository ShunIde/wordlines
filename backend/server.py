"""Local Wordlines server: serves the page and a small JSON API over data/wordlines.db.

Usage:
    python backend/server.py            # then open http://localhost:8000
    python backend/server.py --port 9000

API:
    GET /api/search?q=honey               up to 9 matching words; optional &lang=en and &pos=verb filters
    GET /api/tree?lang=en&word=honey      the word's family tree (404 if the word isn't in the database);
                                          optional &pos=verb starts from that part of speech's etymology
    GET /api/languages                    every language with a searchable word
"""

import argparse
import json
import os
import socket
import threading
from functools import lru_cache
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from trees import ROOT, Trees

# Only the page's own files are served; data/ and .git stay private.
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/data.js": ("data.js", "text/javascript; charset=utf-8"),
    "/styles.css": ("styles.css", "text/css; charset=utf-8"),
}

trees = Trees()
db_lock = threading.Lock()  # one SQLite connection, used by one request at a time


@lru_cache(maxsize=256)
def cached_tree(lang, word, pos):
    with db_lock:
        return json.dumps(trees.build(lang, word, pos), ensure_ascii=False)


@lru_cache(maxsize=1)
def cached_languages():
    with db_lock:
        return json.dumps(trees.languages(), ensure_ascii=False)


class IPv6Server(ThreadingHTTPServer):
    address_family = socket.AF_INET6


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/api/search":
            with db_lock:
                hits = trees.search(params.get("q", ""), lang=params.get("lang"), pos=params.get("pos"))
            return self.send(200, json.dumps(hits, ensure_ascii=False), "application/json; charset=utf-8")
        if url.path == "/api/languages":
            return self.send(200, cached_languages(), "application/json; charset=utf-8")
        if url.path == "/api/tree":
            lang, word = params.get("lang", ""), params.get("word", "")
            body = cached_tree(lang, word, params.get("pos")) if lang and word else "null"
            if body == "null":
                return self.send(404, json.dumps({"error": "word not found"}), "application/json; charset=utf-8")
            return self.send(200, body, "application/json; charset=utf-8")
        if url.path in STATIC:
            name, ctype = STATIC[url.path]
            with open(os.path.join(ROOT, name), "rb") as f:
                return self.send(200, f.read(), ctype)
        self.send(404, "not found", "text/plain; charset=utf-8")

    def send(self, status, body, ctype):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        if not self.path.startswith("/api/search"):  # one line per keystroke is too noisy
            super().log_message(fmt, *args)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--port", type=int, default=8000)
    a = p.parse_args()
    servers = [ThreadingHTTPServer(("127.0.0.1", a.port), Handler)]
    # Windows tries IPv6 first for "localhost", and waits ~230ms per request for ::1 to refuse when
    # nothing listens there. Listening on both loopback addresses keeps it local-only and quick.
    try:
        servers.append(IPv6Server(("::1", a.port), Handler))
    except OSError:
        pass  # no IPv6 on this machine, so browsers won't try it either
    for server in servers[1:]:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"Wordlines running at http://localhost:{a.port}  (Ctrl+C to stop)")
    try:
        servers[0].serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
