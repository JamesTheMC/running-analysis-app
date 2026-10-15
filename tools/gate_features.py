"""Footage-quality gate: candidate features per committed landmark fixture.

    python3 tools/gate_features.py            # table of all features, all 24 clips
    python3 tools/gate_features.py --json     # same, as JSON
    python3 tools/gate_features.py --checks   # verdicts with the chosen thresholds (mirrors footage-checks.js)
    add --partial=150 to use only the first 150 analysed frames (quick preliminary check)

Pure Python (json only). Reads test/fixtures/clips/<CODE>-side|rear.lm.json (client codes only, derived
landmarks only; no video). Used to calibrate js/pipeline/footage-checks.js; results and chosen
thresholds are recorded in reference/GATE_CALIBRATION.md.

Coordinates are analysed pixels (meta.analysedSize = [w, h]); y points down. Odd landmark = runner's
left. Side clips: near leg = smaller (more negative) mean z of hips/knees/ankles.
"""
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLIPS = os.path.join(ROOT, "test", "fixtures", "clips")
GOOD = ["C0", "T1", "T2", "T3"]
PROBLEM = ["AR", "AZ", "CD", "CH", "JW", "ML", "RQ", "RY"]

L = {"sho": 11, "elb": 13, "wri": 15, "hip": 23, "knee": 25, "ank": 27, "heel": 29, "toe": 31}
R = {"sho": 12, "elb": 14, "wri": 16, "hip": 24, "knee": 26, "ank": 28, "heel": 30, "toe": 32}
NOSE = 0
VIS = 0.5
EDGE = 0.02  # framing margin, share of frame width/height


def median(xs):
    xs = sorted(x for x in xs if x is not None and not math.isnan(x))
    if not xs:
        return None
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2


def quantile(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    return xs[min(len(xs) - 1, int(p * (len(xs) - 1)))]


def mean(xs):
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


def load(path):
    fx = json.load(open(path))
    keep, keep_z = fx["keep"], fx["keepZ"]
    rows = []
    for p in fx["rows"]:
        if len(p) <= 2:
            rows.append(None)
            continue
        lm = {}
        for i, k in enumerate(keep):
            lm[k] = [p[2 + i * 3], p[3 + i * 3], 0.0, p[4 + i * 3]]
        z0 = 2 + len(keep) * 3
        for i, k in enumerate(keep_z):
            lm[k][2] = p[z0 + i]
        rows.append(lm)
    return fx["meta"], rows


def P(lm, k):
    return lm[k][0], lm[k][1]


def V(lm, k):
    return lm[k][3]


def dist(lm, a, b):
    (ax, ay), (bx, by) = P(lm, a), P(lm, b)
    return math.hypot(ax - bx, ay - by)


def near_side(posed):
    zl = mean([(lm[23][2] + lm[25][2] + lm[27][2]) / 3 for lm in posed])
    zr = mean([(lm[24][2] + lm[26][2] + lm[28][2]) / 3 for lm in posed])
    return "L" if zl <= zr else "R"


def features(meta, rows, view):
    W, H = meta["analysedSize"]
    posed = [lm for lm in rows if lm]
    f = {"fps": meta["fps"], "fs": meta["fs"], "frames": len(rows), "posed": len(posed) / max(1, len(rows))}
    lateral = view == "lateral"
    sides = [L, R]
    if lateral:
        ns = near_side(posed)
        f["near"] = ns
        legs = [L if ns == "L" else R]
    else:
        legs = [L, R]

    # 1. visibility per joint (near leg for side, both legs for rear)
    for j in ["hip", "knee", "ank", "heel", "toe", "sho"]:
        vs = [V(lm, leg[j]) for lm in posed for leg in legs]
        f[f"vis_{j}"] = mean(vs)
        f[f"vis_{j}_ok"] = sum(v >= VIS for v in vs) / max(1, len(vs))
    f["vis_lower_ok"] = min(f[f"vis_{j}_ok"] for j in ["hip", "knee", "ank", "heel", "toe"])
    # hip occlusion: hip visibility vs the joints above (shoulder) and below (knee)
    f["hip_rel"] = f["vis_hip"] / max(1e-6, (f["vis_knee"] + f["vis_sho"]) / 2)

    # thigh length (near / both legs), for normalising jitter
    thighs = [dist(lm, leg["hip"], leg["knee"]) for lm in posed for leg in legs]
    thigh = median(thighs) or 1.0
    shanks = [dist(lm, leg["knee"], leg["ank"]) for lm in posed for leg in legs]
    shank = median(shanks) or 1.0

    # hip jitter: second difference (removes steady motion) per frame / thigh; scaled to 30 Hz frames
    def jitter(keys):
        out = []
        for i in range(1, len(rows) - 1):
            a, b, c = rows[i - 1], rows[i], rows[i + 1]
            if not (a and b and c):
                continue
            for k in keys:
                dx = a[k][0] - 2 * b[k][0] + c[k][0]
                dy = a[k][1] - 2 * b[k][1] + c[k][1]
                out.append(math.hypot(dx, dy) / thigh)
        return out

    hip_keys = [leg["hip"] for leg in legs]
    dist_keys = [leg[k] for leg in legs for k in ("ank", "heel", "toe")]
    f["hip_jit_p50"] = median(jitter(hip_keys))
    f["hip_jit_p90"] = quantile(jitter(hip_keys), 0.9)
    f["distal_jit_p50"] = median(jitter(dist_keys))
    f["distal_jit_p90"] = quantile(jitter(dist_keys), 0.9)
    # hip jumps: share of frames with a hip step > 0.25 thigh between consecutive frames
    jumps, cnt = 0, 0
    for i in range(1, len(rows)):
        a, b = rows[i - 1], rows[i]
        if not (a and b):
            continue
        for k in hip_keys:
            cnt += 1
            if math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) > 0.25 * thigh:
                jumps += 1
    f["hip_jump_share"] = jumps / max(1, cnt)

    # 2. framing
    ends = [NOSE, 15, 16, 29, 30, 31, 32]
    mx, my = EDGE * W, EDGE * H

    def near_edge(lm, k):
        x, y = P(lm, k)
        return x < mx or x > W - mx or y < my or y > H - my

    f["edge_share"] = sum(any(near_edge(lm, k) for k in ends) for lm in posed) / max(1, len(posed))
    f["edge_feet"] = sum(any(near_edge(lm, k) for k in (29, 30, 31, 32)) for lm in posed) / max(1, len(posed))
    f["edge_head"] = sum(near_edge(lm, NOSE) or P(lm, 11)[1] < my or P(lm, 12)[1] < my for lm in posed) / max(1, len(posed))
    f["head_out"] = sum(P(lm, NOSE)[1] < 0 or V(lm, NOSE) < VIS for lm in posed) / max(1, len(posed))
    f["vis_nose"] = mean([V(lm, NOSE) for lm in posed])

    # 3. runner size: top (nose or shoulders) to lowest heel/toe, / frame height
    heights = []
    for lm in posed:
        top = min(P(lm, NOSE)[1], P(lm, 11)[1], P(lm, 12)[1])
        bot = max(P(lm, k)[1] for k in (29, 30, 31, 32))
        heights.append((bot - top) / H)
    f["size"] = median(heights)
    f["size_cv"] = (quantile(heights, 0.9) - quantile(heights, 0.1)) / max(1e-6, f["size"])

    # 4. perspective / camera height
    f["shank_thigh"] = median([dist(lm, leg["knee"], leg["ank"]) / max(1e-6, dist(lm, leg["hip"], leg["knee"])) for lm in posed for leg in legs])
    f["foot_shank"] = median([dist(lm, leg["heel"], leg["toe"]) / max(1e-6, dist(lm, leg["knee"], leg["ank"])) for lm in posed for leg in legs])
    f["hip_y"] = median([(P(lm, 23)[1] + P(lm, 24)[1]) / 2 / H for lm in posed])
    lowers, trunks, lt = [], [], []
    for lm in posed:
        hy = (P(lm, 23)[1] + P(lm, 24)[1]) / 2
        sy = (P(lm, 11)[1] + P(lm, 12)[1]) / 2
        ay = max(P(lm, 27)[1], P(lm, 28)[1])
        if hy - sy > 1:
            lt.append((ay - hy) / (hy - sy))
    f["lower_trunk"] = median(lt)
    # hip height between head-top and feet (0 = at the top, 1 = at the feet): perspective-free-ish
    rel = []
    for lm in posed:
        top = min(P(lm, NOSE)[1], P(lm, 11)[1], P(lm, 12)[1])
        bot = max(P(lm, k)[1] for k in (29, 30, 31, 32))
        hy = (P(lm, 23)[1] + P(lm, 24)[1]) / 2
        if bot - top > 1:
            rel.append((hy - top) / (bot - top))
    f["hip_rel_y"] = median(rel)
    # rear: left/right size asymmetry (shank, foot) per frame -> p90 of max/min ratio
    if not lateral:
        sr, fr = [], []
        for lm in posed:
            a, b = dist(lm, 25, 27), dist(lm, 26, 28)
            if min(a, b) > 1:
                sr.append(max(a, b) / min(a, b))
            a, b = dist(lm, 29, 31), dist(lm, 30, 32)
            if min(a, b) > 1:
                fr.append(max(a, b) / min(a, b))
        f["shank_asym_p90"] = quantile(sr, 0.9)
        f["foot_asym_p90"] = quantile(fr, 0.9)
        f["foot_asym_p50"] = median(fr)
        # foot size relative to the hip width (low camera: soles face the camera, feet look big)
        f["foot_hipw"] = median([max(dist(lm, 29, 31), dist(lm, 30, 32)) / max(1e-6, dist(lm, 23, 24)) for lm in posed])
        f["shank_hipw"] = median([(dist(lm, 25, 27) + dist(lm, 26, 28)) / 2 / max(1e-6, dist(lm, 23, 24)) for lm in posed])
        # feet vertical: lowest heel minus highest heel in px / shank (swing heel lifts in a low view?)
    # 5. tilt
    if lateral:
        leg = legs[0]
        # stance samples: near heel in its lowest 15% of y (on the belt)
        ys = [P(lm, leg["heel"])[1] for lm in posed]
        thr = quantile(ys, 0.85)
        pts = [P(lm, leg["heel"]) for lm in posed if P(lm, leg["heel"])[1] >= thr]
        f["tilt"] = slope_deg(pts)
        f["belt_spread"] = (quantile([p[1] for p in pts], 0.9) - quantile([p[1] for p in pts], 0.1)) / shank if pts else None
        # camera height from perspective: a camera above the belt sees the near foot's contacts lower in
        # the image than the far foot's (nearer = lower); a camera at belt level sees them level.
        far = R if leg is L else L
        for j in ("heel", "ank", "toe"):
            yn = quantile([P(lm, leg[j])[1] for lm in posed], 0.9)
            yf = quantile([P(lm, far[j])[1] for lm in posed], 0.9)
            f[f"contact_gap_{j}"] = (yn - yf) / shank
        f["contact_gap"] = median([f["contact_gap_heel"], f["contact_gap_ank"], f["contact_gap_toe"]])
        # close camera: the near leg looks larger than the far leg by (d + gap) / d
        f["near_far_shank"] = median([dist(lm, leg["knee"], leg["ank"]) for lm in posed]) / max(1e-6, median([dist(lm, far["knee"], far["ank"]) for lm in posed]))
        f["near_far_thigh"] = median([dist(lm, leg["hip"], leg["knee"]) for lm in posed]) / max(1e-6, median([dist(lm, far["hip"], far["knee"]) for lm in posed]))
        f["near_far_foot"] = median([dist(lm, leg["heel"], leg["toe"]) for lm in posed]) / max(1e-6, median([dist(lm, far["heel"], far["toe"]) for lm in posed]))
        f["near_far_leg"] = (f["near_far_shank"] + f["near_far_thigh"]) / 2
        f["vis_far_hip"] = mean([V(lm, far["hip"]) for lm in posed])
        f["vis_far_ank"] = mean([V(lm, far["ank"]) for lm in posed])
        # hip vertical motion relative to the shoulders (a hidden hip guessed from the trunk moves rigidly)
        dy = [(P(lm, leg["hip"])[1] - P(lm, leg["sho"])[1]) / thigh for lm in posed]
        f["hip_sho_dy_iqr"] = quantile(dy, 0.9) - quantile(dy, 0.1)
        dx = [(P(lm, leg["hip"])[0] - P(lm, leg["sho"])[0]) / thigh for lm in posed]
        f["hip_sho_dx_iqr"] = quantile(dx, 0.9) - quantile(dx, 0.1)
    else:
        f["sho_angle"] = median([math.degrees(math.atan2(P(lm, 12)[1] - P(lm, 11)[1], P(lm, 12)[0] - P(lm, 11)[0])) for lm in posed])
        f["hip_angle"] = median([math.degrees(math.atan2(P(lm, 24)[1] - P(lm, 23)[1], P(lm, 24)[0] - P(lm, 23)[0])) for lm in posed])
        f["tilt"] = median([fold(f["sho_angle"]), fold(f["hip_angle"])])

    # 6. squareness
    trunk = median([math.hypot((P(lm, 11)[0] + P(lm, 12)[0]) / 2 - (P(lm, 23)[0] + P(lm, 24)[0]) / 2, (P(lm, 11)[1] + P(lm, 12)[1]) / 2 - (P(lm, 23)[1] + P(lm, 24)[1]) / 2) for lm in posed]) or 1
    f["hipw_trunk"] = median([abs(P(lm, 23)[0] - P(lm, 24)[0]) for lm in posed]) / trunk
    f["show_trunk"] = median([abs(P(lm, 11)[0] - P(lm, 12)[0]) for lm in posed]) / trunk
    xs = [(P(lm, 23)[0] + P(lm, 24)[0]) / 2 / W for lm in posed]
    f["hip_x"] = median(xs)
    f["hip_x_range"] = quantile(xs, 0.9) - quantile(xs, 0.1)

    # 7. wide angle: segment length change with horizontal position (corr) and spread
    segs = [(dist(lm, legs[0]["hip"], legs[0]["knee"]) + dist(lm, legs[0]["knee"], legs[0]["ank"])) for lm in posed]
    f["leg_cv"] = (quantile(segs, 0.9) - quantile(segs, 0.1)) / max(1e-6, median(segs))
    f["thigh_cv"] = (quantile(thighs, 0.9) - quantile(thighs, 0.1)) / max(1e-6, thigh)
    f["shank_cv"] = (quantile(shanks, 0.9) - quantile(shanks, 0.1)) / max(1e-6, shank)

    # 8. motion blur: distal visibility in fast vs slow frames (near/both legs)
    sp, vv = [], []
    for i in range(1, len(rows)):
        a, b = rows[i - 1], rows[i]
        if not (a and b):
            continue
        for leg in legs:
            k = leg["ank"]
            sp.append(math.hypot(a[k][0] - b[k][0], a[k][1] - b[k][1]) / thigh)
            vv.append((V(b, leg["toe"]) + V(b, leg["ank"])) / 2)
    if sp:
        cut = quantile(sp, 0.75)
        fast = [v for s, v in zip(sp, vv) if s >= cut]
        slow = [v for s, v in zip(sp, vv) if s < cut]
        f["blur_vis_drop"] = (mean(slow) or 0) - (mean(fast) or 0)
    return f


def fold(a):
    # angle of a left-to-right line, folded to [-90, 90] from horizontal
    while a > 90:
        a -= 180
    while a < -90:
        a += 180
    return a


def slope_deg(pts):
    if len(pts) < 3:
        return None
    mx = mean([p[0] for p in pts])
    my = mean([p[1] for p in pts])
    sxx = sum((p[0] - mx) ** 2 for p in pts)
    sxy = sum((p[0] - mx) * (p[1] - my) for p in pts)
    if sxx <= 0:
        return None
    return math.degrees(math.atan(sxy / sxx))


# ---------------------------------------------------------------------------------------------
# Mirror of js/pipeline/footage-checks.js (same definitions and thresholds), for the confusion table
# and for checking the JS module against this research script (test/gate-check.html).
FOOTAGE = {
    "vis": 0.5,
    "minStrideSeconds": 4,
    "minGapSeconds": 10,
    "lowerVisibility": {"warn": 0.93, "fail": 0.8},
    "hip": {"visWarn": 0.9, "visFail": 0.7, "relWarn": 0.85, "jumpThigh": 0.25, "jumpWarn": 0.01, "jumpFail": 0.03},
    "framing": {"headTop": 0.03, "headWarn": 0.01, "headFail": 0.03, "feetWarn": 0.2, "feetFail": 0.4},
    "heightSide": {"hipRelY": 0.476, "lowerTrunk": 1.285, "devWarn": 0.04, "devFail": 0.1, "gapWarn": 0.03, "gapFail": 0.045},
    "heightRear": {"footHipWarn": 0.32, "footHipFail": 0.34, "hipRelY": 0.449, "devWarn": 0.06, "devSupport": 0.05},
    "tilt": {"sideWarnDeg": 3, "frontalWarnDeg": 5},
    "square": {"sideHipWidthWarn": 0.12, "sideHipWidthFail": 0.25, "offCentreWarn": 0.5, "offCentreFail": 1.5},
    "wideRear": {"warn": 1.6, "fail": 2.0},
    "size": {"fail": 0.2, "warn": 0.35, "tooBig": 0.9, "minSourcePx": 300, "analysisScale": 0.45},
    "fps": {"warn": 24, "recommended": 100},
    "blur": {"warn": 0.03},
}


def checks(meta, rows, view, near=None):
    """Returns {check_id: (status, value)} exactly as footageChecks() in the JS module."""
    F = FOOTAGE
    lateral = view == "lateral"
    posed = [lm for lm in rows if lm]
    W, H = meta["analysedSize"]
    fs = meta.get("fs") or meta.get("fps") or 30
    res = {}
    enough = len(posed) / fs >= F["minStrideSeconds"]
    if lateral:
        near = near or near_side(posed)
        legs = [L if near == "L" else R]
        far = R if near == "L" else L
    else:
        legs = [L, R]
    per_leg = lambda fn: [fn(lm, g) for lm in posed for g in legs]  # noqa: E731
    thigh = median(per_leg(lambda lm, g: dist(lm, g["hip"], g["knee"]))) or 1
    shank = median(per_leg(lambda lm, g: dist(lm, g["knee"], g["ank"]))) or 1

    worst = None
    for j in ["hip", "knee", "ank", "heel", "toe"]:
        vs = per_leg(lambda lm, g: V(lm, g[j]))
        share = sum(v >= F["vis"] for v in vs) / len(vs)
        if worst is None or share < worst:
            worst = share
    t = F["lowerVisibility"]
    res["lower_limb_visibility"] = ("fail" if worst < t["fail"] else "warn" if worst < t["warn"] else "pass", worst)

    t = F["hip"]
    hv = per_leg(lambda lm, g: V(lm, g["hip"]))
    vis_ok = sum(v >= F["vis"] for v in hv) / len(hv)
    rel = mean(hv) / max(1e-6, mean(per_leg(lambda lm, g: (V(lm, g["knee"]) + V(lm, g["sho"])) / 2)))
    jumps = pairs = 0
    for i in range(1, len(rows)):
        a, b = rows[i - 1], rows[i]
        if not (a and b):
            continue
        for g in legs:
            pairs += 1
            if math.hypot(a[g["hip"]][0] - b[g["hip"]][0], a[g["hip"]][1] - b[g["hip"]][1]) > t["jumpThigh"] * thigh:
                jumps += 1
    js = jumps / pairs if pairs else 0
    st = "fail" if vis_ok < t["visFail"] or js > t["jumpFail"] else "warn" if vis_ok < t["visWarn"] or rel < t["relWarn"] or js > t["jumpWarn"] else "pass"
    res["hip_occlusion"] = (st, vis_ok)

    t = F["framing"]
    head = sum(1 for lm in posed if P(lm, 0)[1] < t["headTop"] * H or V(lm, 0) < F["vis"] or min(P(lm, 11)[1], P(lm, 12)[1]) < t["headTop"] * H) / len(posed)
    feet = sum(1 for lm in posed if any(lm[k][0] < 0 or lm[k][0] > W or lm[k][1] > H for k in (29, 30, 31, 32))) / len(posed)
    rank = {"pass": 0, "warn": 1, "fail": 2}
    hs = "fail" if head > t["headFail"] else "warn" if head > t["headWarn"] else "pass"
    fsx = "fail" if feet > t["feetFail"] else "warn" if feet > t["feetWarn"] else "pass"
    res["framing"] = (hs if rank[hs] >= rank[fsx] else fsx, max(head, feet))

    def hip_rel_y():
        vals = []
        for lm in posed:
            top = min(P(lm, NOSE)[1], P(lm, 11)[1], P(lm, 12)[1])
            bot = max(P(lm, k)[1] for k in (29, 30, 31, 32))
            hy = (P(lm, 23)[1] + P(lm, 24)[1]) / 2
            vals.append((hy - top) / (bot - top) if bot - top > 1 else None)
        return median(vals)

    if lateral:
        t = F["heightSide"]
        rel = hip_rel_y()
        lt = []
        for lm in posed:
            hy = (P(lm, 23)[1] + P(lm, 24)[1]) / 2
            sy = (P(lm, 11)[1] + P(lm, 12)[1]) / 2
            lt.append((max(P(lm, 27)[1], P(lm, 28)[1]) - hy) / (hy - sy) if hy - sy > 1 else None)
        dev = max((t["hipRelY"] - rel) / t["hipRelY"], (median(lt) - t["lowerTrunk"]) / t["lowerTrunk"])
        gap = None
        if len(posed) / fs >= F["minGapSeconds"]:
            g = legs[0]
            gap = median([(quantile([P(lm, g[j])[1] for lm in posed], 0.9) - quantile([P(lm, far[j])[1] for lm in posed], 0.9)) / shank for j in ("heel", "ank", "toe")])
        st = "fail" if dev > t["devFail"] or (dev > t["devWarn"] and gap is not None and gap < t["gapFail"]) else "warn" if dev > t["devWarn"] or (gap is not None and gap < t["gapWarn"]) else "pass"
        res["camera_height"] = (st, dev)
        res["_gap"] = gap
    else:
        t = F["heightRear"]
        fh = median([max(dist(lm, 29, 31), dist(lm, 30, 32)) / dist(lm, 23, 24) if dist(lm, 23, 24) > 1 else None for lm in posed])
        dev = (t["hipRelY"] - hip_rel_y()) / t["hipRelY"]
        st = "fail" if fh > t["footHipFail"] or (fh > t["footHipWarn"] and dev > t["devSupport"]) else "warn" if fh > t["footHipWarn"] or dev > t["devWarn"] else "pass"
        res["camera_height"] = (st, fh)
        res["_dev"] = dev

    if lateral:
        if not enough:
            res["camera_tilt"] = ("na", None)
        else:
            g = legs[0]
            ys = [P(lm, g["heel"])[1] for lm in posed]
            thr = quantile(ys, 0.85)
            tilt = slope_deg([P(lm, g["heel"]) for lm in posed if P(lm, g["heel"])[1] >= thr])
            res["camera_tilt"] = ("na", None) if tilt is None else ("warn" if abs(tilt) > F["tilt"]["sideWarnDeg"] else "pass", tilt)
    else:
        def ang(a, b):
            return median([fold(math.degrees(math.atan2(P(lm, b)[1] - P(lm, a)[1], P(lm, b)[0] - P(lm, a)[0]))) for lm in posed])
        tilt = (ang(11, 12) + ang(23, 24)) / 2
        res["camera_tilt"] = ("warn" if abs(tilt) > F["tilt"]["frontalWarnDeg"] else "pass", tilt)

    t = F["square"]
    if lateral:
        trunk = median([math.hypot((P(lm, 11)[0] + P(lm, 12)[0]) / 2 - (P(lm, 23)[0] + P(lm, 24)[0]) / 2, (P(lm, 11)[1] + P(lm, 12)[1]) / 2 - (P(lm, 23)[1] + P(lm, 24)[1]) / 2) for lm in posed]) or 1
        hw = median([abs(P(lm, 23)[0] - P(lm, 24)[0]) for lm in posed]) / trunk
        res["squareness"] = ("fail" if hw > t["sideHipWidthFail"] else "warn" if hw > t["sideHipWidthWarn"] else "pass", hw)
    else:
        offs = []
        for lm in posed:
            w = abs(P(lm, 24)[0] - P(lm, 23)[0])
            offs.append(((P(lm, 23)[0] + P(lm, 24)[0]) / 2 - W / 2) / w if w > 0 else None)
        off = median(offs)
        res["squareness"] = ("fail" if abs(off) > t["offCentreFail"] else "warn" if abs(off) > t["offCentreWarn"] else "pass", off)

    if lateral:
        res["wide_angle"] = ("na", None)
    elif not enough:
        res["wide_angle"] = ("na", None)
    else:
        rs = []
        for lm in posed:
            a, b = dist(lm, 25, 27), dist(lm, 26, 28)
            rs.append(max(a, b) / min(a, b) if min(a, b) > 1 else None)
        ratio = quantile(rs, 0.9)
        t = F["wideRear"]
        res["wide_angle"] = ("fail" if ratio > t["fail"] else "warn" if ratio > t["warn"] else "pass", ratio)

    t = F["size"]
    size = median([(max(P(lm, k)[1] for k in (29, 30, 31, 32)) - min(P(lm, NOSE)[1], P(lm, 11)[1], P(lm, 12)[1])) / H for lm in posed])
    st = "fail" if size < t["fail"] else "warn" if size < t["warn"] or size > t["tooBig"] or size * H / t["analysisScale"] < t["minSourcePx"] else "pass"
    res["runner_size"] = (st, size)

    fps = meta.get("fps")
    res["frame_rate"] = ("warn" if fps < F["fps"]["warn"] else "pass", fps)

    if not enough:
        res["motion_blur"] = ("na", None)
    else:
        sp, vv = [], []
        for i in range(1, len(rows)):
            a, b = rows[i - 1], rows[i]
            if not (a and b):
                continue
            for g in legs:
                sp.append(math.hypot(a[g["ank"]][0] - b[g["ank"]][0], a[g["ank"]][1] - b[g["ank"]][1]) / thigh)
                vv.append((V(b, g["toe"]) + V(b, g["ank"])) / 2)
        cut = quantile(sp, 0.75)
        drop = (mean([v for s, v in zip(sp, vv) if s < cut]) or 0) - (mean([v for s, v in zip(sp, vv) if s >= cut]) or 0)
        res["motion_blur"] = ("warn" if drop > F["blur"]["warn"] else "pass", drop)
    res["lighting"] = ("na", None)
    return res


EXPECTED = {
    # reasons that must be present for each problem clip (any one of the listed ids)
    "side": ["camera_height", "hip_occlusion", "wide_angle"],
    "rear": ["camera_height", "wide_angle"],
    "CD-side": ["framing"],
}


def verdicts(partial=None):
    out = {}
    for code in GOOD + PROBLEM:
        for v, view in (("side", "lateral"), ("rear", "posterior")):
            meta, rows = load(os.path.join(CLIPS, f"{code}-{v}.lm.json"))
            if partial:
                rows = rows[:partial]
            c = checks(meta, rows, view)
            sts = [s for k, (s) in c.items() if not k.startswith("_")]
            level = "fail" if any(s[0] == "fail" for s in sts) else "warn" if any(s[0] == "warn" for s in sts) else "pass"
            out[f"{code}-{v}"] = {"level": level, "checks": c}
    return out


def print_verdicts(partial=None):
    res = verdicts(partial)
    ok_good = ok_prob = 0
    for clip, r in res.items():
        code, v = clip.split("-")
        bad = [f"{k}={s}({fmt(val)})" for k, (s, val) in ((k, x) for k, x in r["checks"].items() if not k.startswith("_")) if s in ("warn", "fail")]
        if code in GOOD:
            correct = r["level"] == "pass"
            ok_good += correct
        else:
            need = EXPECTED.get(clip, []) or EXPECTED[v]
            flagged = {k for k, (s, _) in ((k, x) for k, x in r["checks"].items() if not k.startswith("_")) if s in ("warn", "fail")}
            need_all = [EXPECTED[v]] + ([EXPECTED[clip]] if clip in EXPECTED else [])
            correct = r["level"] in ("warn", "fail") and all(flagged & set(n) for n in need_all)
            ok_prob += correct
        print(f"{clip:8s} {r['level']:5s} {'OK ' if correct else 'BAD'} " + ", ".join(bad))
    print(f"\ngood clips passing: {ok_good}/8; problem clips flagged with a correct reason: {ok_prob}/16")


def run(partial=None):
    out = {}
    for code in GOOD + PROBLEM:
        for v, view in (("side", "lateral"), ("rear", "posterior")):
            meta, rows = load(os.path.join(CLIPS, f"{code}-{v}.lm.json"))
            if partial:
                rows = rows[:partial]
            out[f"{code}-{v}"] = {"group": "good" if code in GOOD else "problem", **features(meta, rows, view)}
    return out


def fmt(v):
    if v is None:
        return "-"
    if isinstance(v, str):
        return v
    if isinstance(v, int):
        return str(v)
    return f"{v:.3f}" if abs(v) < 10 else f"{v:.1f}"


def main():
    partial = None
    for a in sys.argv[1:]:
        if a.startswith("--partial="):
            partial = int(a.split("=")[1])
    if "--checks" in sys.argv:
        print_verdicts(partial)
        return
    res = run(partial)
    if "--json" in sys.argv:
        print(json.dumps(res, indent=1))
        return
    for v in ("side", "rear"):
        clips = [k for k in res if k.endswith(v)]
        keys = [k for k in res[clips[0]] if k != "group"]
        print(f"\n== {v} ==")
        print("feature".ljust(16) + "".join(c.split("-")[0].rjust(7) for c in clips) + "   good[min..max] problem[min..max]")
        for k in keys:
            vals = [res[c].get(k) for c in clips]
            line = k.ljust(16) + "".join(fmt(x).rjust(7) for x in vals)
            g = [res[c][k] for c in clips if res[c]["group"] == "good" and isinstance(res[c].get(k), (int, float))]
            p = [res[c][k] for c in clips if res[c]["group"] == "problem" and isinstance(res[c].get(k), (int, float))]
            if g and p:
                line += f"   [{fmt(min(g))}..{fmt(max(g))}] [{fmt(min(p))}..{fmt(max(p))}]"
                if min(g) > max(p) or max(g) < min(p):
                    line += "  SEPARATES"
            print(line)


if __name__ == "__main__":
    main()
