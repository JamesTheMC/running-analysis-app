"""Index local videos by file name: writes test-data/clip-index.json (gitignored, stays local).

    python3 tools/index_clips.py

Committed code refers to clips by file name only; this index maps each name to its path under
test-data/, so folder names (which may be personal) never appear in the repository.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "test-data")
index = {}
for base, dirs, files in os.walk(DATA):
    dirs[:] = [d for d in dirs if d != "debug"]
    for f in files:
        if f.lower().endswith((".mov", ".mp4", ".m4v")):
            index[f] = os.path.relpath(os.path.join(base, f), DATA)
json.dump(index, open(os.path.join(DATA, "clip-index.json"), "w"), indent=1)
print(f"{len(index)} videos indexed -> test-data/clip-index.json")
