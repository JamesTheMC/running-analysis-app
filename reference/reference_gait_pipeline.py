"""
Reference gait pipeline (Python prototype). NOT the production app.
Purpose: ground truth for the web app port. The JS/TS implementation must
reproduce these numbers on the same clip (within tolerance, see SPEC/README).

Usage:
    pip install mediapipe==0.10.13 opencv-python scipy numpy
    python reference_gait_pipeline.py path/to/side_view_clip.mp4 --out results.json

Conventions (important):
  * Knee flexion = 180 - interior knee angle (hip-knee-ankle).
  * Hip extension is SIGNED, thigh relative to the trunk axis, 0 = thigh in line
    with trunk, positive = thigh behind trunk. (An unsigned shoulder-hip-knee
    angle saturates at 180 and cannot measure extension.)
  * Facing direction is estimated from nose vs shoulder x-position.
  * Frames where a rigid segment (tibia) length is an outlier (robust z > 6)
    are excluded. MediaPipe visibility does NOT catch these frames.
  * Cadence is intentionally NOT computed (unreliable from video in testing).
  * Trunk angle = shoulder-hip line vs vertical (overall lean only, not lumbar).

KNOWN LIMITATION: the hip extension "peak" values are NOT validated. Peaks are
picked with a generic peak finder on the whole series, which also catches
non-stance bumps (IQR spans about -27 to +23 deg). Correct approach: segment
strides from one reference signal, then take max extension inside each
stride's late-stance window. Treat hip extension output here as unreliable
until that is done. Both references are emitted: vs trunk axis (hip_ext_*) and
vs vertical (hip_ext_vert_*). DECISION (clinician): hip extension is
measured relative to the TRUNK axis (hip_ext_*). hip_ext_vert_* is kept for
reference only and is not used in the app.
"""
import argparse, json
import cv2, numpy as np
import mediapipe as mp
from scipy.signal import find_peaks, savgol_filter

VIS_MIN = 0.5
SAMPLE_EVERY = 2      # every 2nd frame (about 30 fps effective at 60 fps source)
SCALE = 0.45          # downscale for speed

L = dict(sho=11, elb=13, wri=15, hip=23, knee=25, ank=27)
R = dict(sho=12, elb=14, wri=16, hip=24, knee=26, ank=28)


def interior_angle(a, b, c):
    ab, cb = a - b, c - b
    cos = np.dot(ab, cb) / (np.linalg.norm(ab) * np.linalg.norm(cb) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def hip_extension_signed(sho, hip, knee, facing):
    """Signed thigh angle vs trunk axis. Positive = extension (thigh behind trunk)."""
    a = hip - sho            # trunk axis pointing down
    b = knee - hip           # thigh
    ang = np.degrees(np.arctan2(a[0] * b[1] - a[1] * b[0], np.dot(a, b)))
    flexion = -facing * ang
    return float(-flexion)


def hip_ext_vs_vertical(hip, knee, facing):
    """Signed thigh angle vs true vertical. Positive = thigh behind vertical (extension)."""
    b = knee - hip
    flexion = np.degrees(np.arctan2(facing * b[0], b[1]))
    return float(-flexion)


def trunk_from_vertical(sho, hip):
    v = sho - hip
    cos = np.dot(v, np.array([0.0, -1.0])) / (np.linalg.norm(v) + 1e-9)
    return float(np.degrees(np.arccos(np.clip(cos, -1, 1))))


def extract(path):
    pose = mp.solutions.pose.Pose(static_image_mode=False, model_complexity=1,
                                  min_detection_confidence=0.5,
                                  min_tracking_confidence=0.5)
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    rows, i = [], 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i % SAMPLE_EVERY == 0:
            small = cv2.resize(frame, None, fx=SCALE, fy=SCALE)
            res = pose.process(cv2.cvtColor(small, cv2.COLOR_BGR2RGB))
            row = {"frame": i, "t": i / fps, "detected": bool(res.pose_landmarks)}
            if res.pose_landmarks:
                h, w = small.shape[:2]
                lm = res.pose_landmarks.landmark
                P = lambda k: (np.array([lm[k].x * w, lm[k].y * h]), lm[k].visibility)
                nose, _ = P(0)
                facing = 1.0 if nose[0] > np.mean([P(11)[0][0], P(12)[0][0]]) else -1.0
                row["facing"] = facing
                for side, idx in (("L", L), ("R", R)):
                    pts = {k: P(v) for k, v in idx.items()}
                    vis = lambda *ks: all(pts[k][1] > VIS_MIN for k in ks)
                    p = {k: pts[k][0] for k in pts}
                    row[f"knee_flex_{side}"] = (180 - interior_angle(p["hip"], p["knee"], p["ank"])) if vis("hip", "knee", "ank") else None
                    row[f"hip_ext_{side}"] = hip_extension_signed(p["sho"], p["hip"], p["knee"], facing) if vis("sho", "hip", "knee") else None
                    row[f"hip_ext_vert_{side}"] = hip_ext_vs_vertical(p["hip"], p["knee"], facing) if vis("hip", "knee") else None
                    row[f"tibia_{side}"] = float(np.linalg.norm(p["knee"] - p["ank"])) if vis("knee", "ank") else None
                    row[f"elbow_{side}"] = interior_angle(p["sho"], p["elb"], p["wri"]) if vis("sho", "elb", "wri") else None
                    row[f"trunk_{side}"] = trunk_from_vertical(p["sho"], p["hip"]) if vis("sho", "hip") else None
            rows.append(row)
        i += 1
    cap.release()
    return rows, fps / SAMPLE_EVERY


def arr(rows, key):
    return np.array([np.nan if r.get(key) is None else r[key] for r in rows], float)


def bad_frames(tibia):
    v = tibia[~np.isnan(tibia)]
    med = np.median(v)
    mad = np.median(np.abs(v - med)) + 1e-6
    return np.abs(tibia - med) / mad > 6


def smooth(a):
    return savgol_filter(np.where(np.isnan(a), np.nanmean(a), a), 7, 2)


def summarize(rows, fs):
    bad = bad_frames(arr(rows, "tibia_L")) | bad_frames(arr(rows, "tibia_R"))
    out = {"frames_sampled": len(rows),
           "frames_detected": int(sum(r["detected"] for r in rows)),
           "frames_excluded_tracking_gate": int(np.nansum(bad))}
    for side in ("L", "R"):
        kf = arr(rows, f"knee_flex_{side}"); kf[bad] = np.nan
        he = arr(rows, f"hip_ext_{side}"); he[bad] = np.nan
        peaks, _ = find_peaks(smooth(he), distance=int(0.3 * fs), prominence=5)
        hv = smooth(he)[peaks]
        hv2 = arr(rows, f"hip_ext_vert_{side}"); hv2[bad] = np.nan
        p2, _ = find_peaks(smooth(hv2), distance=int(0.3 * fs), prominence=5)
        v2 = smooth(hv2)[p2]
        out[side] = {
            "hip_ext_vs_vertical_peak_n": int(len(p2)),
            "hip_ext_vs_vertical_peak_median": float(np.median(v2)) if len(v2) else None,
            "hip_ext_vs_vertical_peak_iqr": [float(np.percentile(v2, 25)), float(np.percentile(v2, 75))] if len(v2) else None,
            "knee_flexion_min": float(np.nanmin(kf)), "knee_flexion_max": float(np.nanmax(kf)),
            "hip_ext_peak_n": int(len(peaks)),
            "hip_ext_peak_median": float(np.median(hv)) if len(hv) else None,
            "hip_ext_peak_iqr": [float(np.percentile(hv, 25)), float(np.percentile(hv, 75))] if len(hv) else None,
            "elbow_median": float(np.nanmedian(arr(rows, f"elbow_{side}"))) if np.any(~np.isnan(arr(rows, f"elbow_{side}"))) else None,
            "elbow_valid_frames": int(np.sum(~np.isnan(arr(rows, f"elbow_{side}")))),
        }
    tr = np.concatenate([arr(rows, "trunk_L"), arr(rows, "trunk_R")])
    out["trunk_from_vertical_median"] = float(np.nanmedian(tr))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--out", default="results.json")
    a = ap.parse_args()
    rows, fs = extract(a.video)
    summary = summarize(rows, fs)
    json.dump({"summary": summary, "frames": rows}, open(a.out, "w"))
    print(json.dumps(summary, indent=2))
