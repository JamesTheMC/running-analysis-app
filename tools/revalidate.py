"""Re-validate with one command after new clips land in test-data/:

    python3 tools/revalidate.py

1. Indexes the local videos (tools/index_clips.py) and finds new clips named
   CODE_YYYY-MM-DD_VIEW_SPEED (VIEW = left | right | rear | front), e.g. T3_2026-10-20_left_6.0mph.mov.
2. Opens test/revalidate.html in headless Chrome: pose tracking for clips not yet cached (on this
   machine; landmarks cached in test-data/debug/, gitignored), view detection, video check, the full
   pipeline per session (client code + date), and validation against hand marks where they exist
   (test-data/debug/marks_<clip>.json, made with test/mark-clip.html).
3. Rewrites the "Re-validation" section of BENCHMARK.md: video check per clip, values per runner,
   view and metric BEFORE (the earlier benchmark session of that client code) and AFTER (its latest
   session), and validation error per metric and view before (reference/revalidation-baseline.json,
   from BENCHMARK.md section 4) and after (new hand marks).

Nothing leaves this machine. Client codes only: file names must start with the client code.
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from datetime import date
from functools import partial
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from devserver import NoCacheHandler  # noqa: E402
from test import CHROME, free_port  # noqa: E402

NAME = re.compile(r"^([A-Za-z0-9-]{1,20})_(\d{4}-\d{2}-\d{2})_(left|right|rear|front)_([\d.]+)\s*(mph|kmh|km/h|kph)?\.(mov|mp4|m4v)$", re.I)
START, END = "<!-- revalidate:start -->", "<!-- revalidate:end -->"
BASELINE = os.path.join(ROOT, "reference", "revalidation-baseline.json")
LABEL = {
    "ic_knee_flexion": "Knee flexion at IC", "ms_max_knee_flexion": "Max stance knee flexion", "ic_tibial_inclination": "Tibial inclination at IC",
    "ic_foot_to_com": "Foot-to-COM at IC", "to_hip_extension": "Hip extension", "ic_spine_lean": "Trunk lean at IC", "ms_spine_lean": "Trunk lean at MS",
    "ms_ankle": "Ankle DF at MS", "ms_hip_adduction": "Hip adduction", "ms_knee_varus_valgus": "Knee frontal-plane angle", "ms_trunk_lateral_lean": "Trunk lateral lean",
    "cadence": "Cadence (spm)", "step time, left": "Step time L (ms)", "step time, right": "Step time R (ms)", "contact time": "Contact time (ms)",
}
VIEW = {"lateral_left": "left side", "lateral_right": "right side", "posterior": "rear", "anterior": "front", "agreed": "agreed (views)"}


def discover():
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "index_clips.py")], check=True)
    index = json.load(open(os.path.join(ROOT, "test-data", "clip-index.json")))
    clips = []
    for name in sorted(index):
        m = NAME.match(name)
        if m:
            unit = (m.group(5) or "mph").lower().replace("kph", "km/h").replace("kmh", "km/h")
            clips.append({"file": name, "code": m.group(1).upper(), "date": m.group(2), "view": m.group(3).lower(), "speed": float(m.group(4)), "speedUnit": unit})
    os.makedirs(os.path.join(ROOT, "test-data", "debug"), exist_ok=True)
    json.dump({"clips": clips}, open(os.path.join(ROOT, "test-data", "debug", "revalidate-clips.json"), "w"), indent=1)
    return clips


def run_page():
    port = free_port()
    done = threading.Event()
    box = {}

    class Handler(NoCacheHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            if self.path != "/__results":
                return super().do_POST()
            box["json"] = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode()
            self.send_response(204)
            self.end_headers()
            done.set()

    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler, directory=ROOT))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = tempfile.mkdtemp(prefix="gait-reval-chrome-")
    chrome = subprocess.Popen([CHROME, "--headless=new", "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}", f"http://127.0.0.1:{port}/test/revalidate.html?headless=1"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        finished = done.wait(timeout=3 * 3600)  # pose tracking of new clips can take minutes each
    finally:
        chrome.terminate()
        try:
            chrome.wait(timeout=10)
        except subprocess.TimeoutExpired:
            chrome.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)
    if not finished:
        raise SystemExit("Re-validation did not finish within 3 hours.")
    return json.loads(box["json"])


def fmt(v):
    return "—" if v is None else (f"{v:.1f}" if isinstance(v, float) else str(v))


def section(res, baseline, new_clips):
    out = [START, "## 8. Re-validation (auto: `python3 tools/revalidate.py`)", "", f"Last run {date.today().isoformat()}. "
           f"{len(new_clips)} new clip(s) found in test-data/ (named CODE_YYYY-MM-DD_VIEW_SPEED). Generated; do not edit by hand.", ""]
    out += ["### Video check per clip", "| Clip | Session | View used (detected) | Verdict | Quality | Main reason |", "|---|---|---|---|---|---|"]
    for c in res["clips"]:
        if c.get("error"):
            out.append(f"| {c['id']} | {c['date']} | — | error | — | {c['error'][:80]} |")
            continue
        g = c["gate"]
        det = "" if c["slot"] == c["detected"] else f" ({VIEW.get(c['detected'], c['detected'])})"
        out.append(f"| {c['id']} | {c['date']} | {VIEW.get(c['slot'], c['slot'])}{det} | {g['level']} | {round(g['score'] * 100)}% | {(g['reasons'] or ['—'])[0][:90]} |")
    good = [c for c in res["clips"] if c.get("gate") and c["client"] in ("C0", "T1", "T2", "T3") and c["date"] == "benchmark"]
    bad = [c for c in res["clips"] if c.get("gate") and c["client"] not in ("C0", "T1", "T2", "T3") and c["date"] == "benchmark"]
    out += ["", f"Benchmark clips: {sum(c['gate']['level'] == 'pass' for c in good)}/{len(good)} validated clips pass; "
            f"{sum(c['gate']['level'] != 'pass' for c in bad)}/{len(bad)} floor-level clips fail or warn.", ""]
    # Before / after per runner, view and metric.
    by_client = {}
    for s in res["sessions"]:
        by_client.setdefault(s["client"], []).append(s)
    out += ["### Values before → after (per runner, view, metric)",
            "Before = the earlier benchmark session of that client code; after = its latest new session.", ""]
    rows = []
    for client, ss in sorted(by_client.items()):
        before = next((s for s in ss if s["date"] == "benchmark"), None)
        after = max((s for s in ss if s["date"] != "benchmark"), key=lambda s: s["date"], default=None)
        if not after:
            continue
        if before and before["coverage"]["signature"] != after["coverage"]["signature"]:
            rows.append(f"| {client} | coverage | {before['coverage']['signature']} ({round(before['coverage']['share'] * 100)}%) | {after['coverage']['signature']} ({round(after['coverage']['share'] * 100)}%) | — | different view coverage: compare only values present in both |")
        keys = sorted(set((before or {"values": {}})["values"]) | set(after["values"]))
        for k in keys:
            metric, side = k.split("|")
            if metric not in LABEL:
                continue
            b = (before or {"values": {}})["values"].get(k)
            a = after["values"].get(k)
            d = a["value"] - b["value"] if a and b and isinstance(a["value"], (int, float)) and isinstance(b["value"], (int, float)) else None
            view = VIEW.get((a or b)["view"], (a or b)["view"])
            rows.append(f"| {client} | {LABEL[metric]}{' ' + side if side and side != 'mid' else ''} | {fmt(b and b['value'])} | {fmt(a and a['value'])} | {fmt(d)} | {view} |")
    out += (["| Runner | Metric | Before | After | Δ | View |", "|---|---|---|---|---|---|", *rows] if rows else ["No runner has a new session yet."])
    # Validation errors.
    out += ["", "### Validation error per metric and view (app − hand marks; mean absolute error, bias)",
            "Before = BENCHMARK.md §4 (cross-runner mean / T1–T3); after = hand marks on the new clips (test/mark-clip.html).", ""]
    errs = {}
    for c in res["clips"]:
        for m, e in (c.get("errors") or {}).items():
            view = "side" if c["slot"].startswith("lateral") else "rear" if c["slot"] == "posterior" else "front"
            errs.setdefault((m, view), []).append((c["id"], e))
    out += ["| Metric | View | Before: cross-runner / T1–T3 | After (per clip) |", "|---|---|---|---|"]
    def after_text(items):
        return "; ".join("%s: %s (bias %s, n %s)" % (cid, e["mae"], e["bias"], e["n"]) for cid, e in items) or "no new marks"
    for key, before in baseline["errors"].items():
        m, view = key.split("|")
        out.append(f"| {m} | {view} | {before['cross']} / {before['T']} | {after_text(errs.pop((m, view), []))} |")
    for (m, view), items in sorted(errs.items()):
        out.append(f"| {m} | {view} | — | {after_text(items)} |")
    out.append(END)
    return "\n".join(out)


def main():
    if not os.path.exists(CHROME):
        print("Google Chrome not found at", CHROME)
        return 1
    new_clips = discover()
    print(f"{len(new_clips)} new clip(s) named CODE_YYYY-MM-DD_VIEW_SPEED found.")
    res = run_page()
    if res.get("error"):
        print("Re-validation page failed:", res["error"])
        return 1
    baseline = json.load(open(BASELINE))
    sec = section(res, baseline, new_clips)
    path = os.path.join(ROOT, "BENCHMARK.md")
    text = open(path).read()
    text = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: sec, text, flags=re.S) if START in text else text.rstrip() + "\n\n" + sec + "\n"
    open(path, "w").write(text)
    fails = [c for c in res["clips"] if c.get("gate") and c["gate"]["level"] == "fail" and c["date"] != "benchmark"]
    print(f"BENCHMARK.md updated: {len(res['clips'])} clips, {len(res['sessions'])} sessions.")
    for c in fails:
        print(f"  {c['id']}: video check FAILED: {'; '.join(c['gate']['reasons'][:2])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
