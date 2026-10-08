"""Run all tests with one command:  python3 tools/test.py

Starts the dev server on a free local port, opens test/unit.html in headless Google Chrome; the page
POSTs its results back to this server, then Chrome is closed and the results are printed.
Exit code 0 = all passed, 1 = a failure.
Nothing leaves this machine: the page only loads files from the local server.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
from functools import partial
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from devserver import NoCacheHandler  # noqa: E402

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    if not os.path.exists(CHROME):
        print("Google Chrome not found at", CHROME, "- open test/unit.html in a browser instead.")
        return 1
    port = free_port()

    done = threading.Event()
    box = {}

    class Quiet(NoCacheHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != "/__results":
                return super().do_POST()
            box["json"] = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
            self.send_response(204)
            self.end_headers()
            done.set()

    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Quiet, directory=ROOT))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="gait-test-chrome-")
    chrome = subprocess.Popen(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            f"--user-data-dir={profile}",
            f"http://127.0.0.1:{port}/test/unit.html?headless=1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        finished = done.wait(timeout=300)
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    if not finished:
        print("Tests did not finish within 5 minutes.")
        return 1
    res = json.loads(box["json"])
    section = None
    for r in res["results"]:
        if r["section"] != section:
            section = r["section"]
            print(f"\n{section}")
        mark = "SKIP" if r.get("skip") else ("PASS" if r["ok"] else "FAIL")
        detail = f"  ({r['detail']})" if r.get("detail") and (not r["ok"] or r.get("skip")) else ""
        print(f"  {mark}  {r['name']}{detail}")
    fails = [r for r in res["results"] if not r["ok"] and not r.get("skip")]
    skips = [r for r in res["results"] if r.get("skip")]
    total = len(res["results"]) - len(skips)
    print()
    if fails:
        print(f"FAILED: {len(fails)} of {total} tests.")
        return 1
    print(f"All {total} tests passed" + (f" ({len(skips)} skipped: cached landmarks not present)" if skips else "") + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main())
