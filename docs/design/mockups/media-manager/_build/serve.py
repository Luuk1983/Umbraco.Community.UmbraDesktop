"""Serves the media manager mocks folder, and saves what crop.html posts into _build/img.

A static server plus one write: the browser does the image cropping (sharp does not load in this
checkout), and this is how the crops get back to disk.
"""
import base64
import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "_build", "img")


class Handler(http.server.SimpleHTTPRequestHandler):
    """Static files from the mocks folder, plus POST /save {name, dataUrl}."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        name = os.path.basename(body["name"])
        data = base64.b64decode(body["dataUrl"].split(",", 1)[1])
        os.makedirs(IMG, exist_ok=True)
        with open(os.path.join(IMG, name), "wb") as f:
            f.write(data)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"ok")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5191
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
