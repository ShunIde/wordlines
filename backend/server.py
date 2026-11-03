"""Local Wordlines server: serves the page and a small JSON API over data/wordlines.db.

Usage:
    python backend/server.py            # then open http://localhost:8000
    python backend/server.py --port 9000

API:
    GET /api/search?q=honey               up to 9 matching words
    GET /api/tree?lang=en&word=honey      the word's family tree (404 if the word isn't in the database)
"""

import argparse
import json
import os
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
def cached_tree(lang, word):
    with db_lock:
        return json.dumps(trees.build(lang, word), ensure_ascii=False)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = urlparse(self.path)
        params = {k: v[0] for k, v in parse_qs(url.query).items()}
        if url.path == "/api/search":
            with db_lock:
                hits = trees.search(params.get("q", ""))
            return self.send(200, json.dumps(hits, ensure_ascii=False), "application/json; charset=utf-8")
        if url.path == "/api/tree":
            lang, word = params.get("lang", ""), params.get("word", "")
            body = cached_tree(lang, word) if lang and word else "null"
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
    server = ThreadingHTTPServer(("127.0.0.1", a.port), Handler)
    print(f"Wordlines running at http://localhost:{a.port}  (Ctrl+C to stop)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
