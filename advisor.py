"""Timing advisor: occupancy-weighted Max-Pressure.

Idea (from traffic-control research on "person-based" and Max-Pressure signal
control): give green time in proportion to how many PEOPLE are waiting, not
how many vehicles. Then apply simple safety rules:

- every road gets at least MIN_GREEN and at most MAX_GREEN seconds
- fairness guard: a road whose vehicles have waited longer than MAX_WAIT is served first
- pedestrian protection: many people waiting to cross -> extra walk time
- emergency (simulated only): the chosen road is served first with a long green
- low confidence (dark, rain, blocked camera): keep the existing fixed timer

The advisor only RECOMMENDS a plan. The traffic officer accepts or overrides it.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

from app.config import CYCLE_SECONDS, MAX_GREEN, MAX_WAIT_SECONDS, MIN_GREEN

PEDESTRIAN_THRESHOLD = 8     # people waiting to cross before walk time is extended
BASE_WALK_SECONDS = 8
MAX_WALK_EXTENSION = 6
EMERGENCY_GREEN = 30
MEANINGFUL_CHANGE = 3        # seconds; smaller changes are reported as "keep current plan"


@dataclass
class AdvisorSettings:
    cycle: int = CYCLE_SECONDS
    min_green: int = MIN_GREEN
    max_green: int = MAX_GREEN
    max_wait: float = MAX_WAIT_SECONDS
    base_walk: int = BASE_WALK_SECONDS


@dataclass
class Advice:
    mode: str                                   # "advise" | "keep_fixed" | "emergency"
    plan: list[dict]                            # per road: id, name, index, green, fixed, delta, people, vehicles
    order: list[str]                            # road ids in the order they should get green
    walk_seconds: int
    walk_extension: int
    top: dict | None                            # the headline recommendation
    reasons: list[str] = field(default_factory=list)
    numbers: dict = field(default_factory=dict)  # values shown in the "Why?" panel
    created_at: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return {
            "mode": self.mode, "plan": self.plan, "order": self.order,
            "walk_seconds": self.walk_seconds, "walk_extension": self.walk_extension,
            "top": self.top, "reasons": self.reasons, "numbers": self.numbers,
            "created_at": self.created_at,
        }


def walk_extension(pedestrians_waiting: int) -> int:
    """Extra walk seconds: +2 s per 10 people waiting beyond the threshold, capped."""
    if pedestrians_waiting < PEDESTRIAN_THRESHOLD:
        return 0
    return min(MAX_WALK_EXTENSION, 2 * math.ceil(pedestrians_waiting / 10))


def split_green(pressures: list[float], total: int, min_green: int, max_green: int) -> list[int]:
    """Split `total` seconds between roads in proportion to pressure, within [min, max].

    Works by repeatedly fixing roads that hit a limit and sharing the rest.
    Returns whole seconds that add up exactly to `total` (when feasible).
    """
    n = len(pressures)
    if n == 0:
        return []
    total = max(total, n * min_green)
    weights = [max(p, 0.5) for p in pressures]  # tiny weight so empty roads still get min green
    green = [float(min_green)] * n
    free = list(range(n))
    remaining = total - n * min_green
    while free and remaining > 1e-9:
        share_total = sum(weights[i] for i in free)
        capped = []
        for i in free:
            extra = remaining * weights[i] / share_total
            room = max_green - green[i]
            if extra >= room:
                capped.append(i)
        if not capped:
            for i in free:
                green[i] += remaining * weights[i] / share_total
            remaining = 0
            break
        for i in capped:
            remaining -= max_green - green[i]
            green[i] = max_green
            free.remove(i)
    # round to whole seconds while keeping the exact total (largest remainder method)
    floors = [math.floor(g) for g in green]
    leftover = int(round(sum(green))) - sum(floors)
    order = sorted(range(n), key=lambda i: green[i] - floors[i], reverse=True)
    for i in order[:max(0, leftover)]:
        floors[i] += 1
    return floors


def advise(roads: list[dict], fixed_plan: dict[str, int], pedestrians_waiting: int = 0,
           confidence_level: str = "High", confidence_reasons: list[str] | None = None,
           emergency_road: str | None = None, settings: AdvisorSettings | None = None) -> Advice:
    """Build a recommended plan from per-road stats (which must include 'people')."""
    s = settings or AdvisorSettings()
    fixed = {r["id"]: int(fixed_plan.get(r["id"], s.min_green)) for r in roads}
    ext = walk_extension(pedestrians_waiting)
    walk = s.base_walk + ext
    numbers = {
        "people": {r["id"]: r.get("people", 0) for r in roads},
        "vehicles": {r["id"]: r.get("total_vehicles", 0) for r in roads},
        "buses": {r["id"]: r.get("vehicles", {}).get("bus", 0) for r in roads},
        "longest_wait_s": {r["id"]: r.get("longest_wait_s", 0) for r in roads},
        "pedestrians_waiting": pedestrians_waiting,
        "cycle": s.cycle,
    }

    def plan_rows(greens: dict[str, int]) -> list[dict]:
        rows = []
        for idx, r in enumerate(roads, start=1):
            rows.append({
                "id": r["id"], "name": r.get("name", r["id"]), "index": idx,
                "green": greens[r["id"]], "fixed": fixed[r["id"]],
                "delta": greens[r["id"]] - fixed[r["id"]],
                "people": r.get("people", 0), "vehicles": r.get("total_vehicles", 0),
            })
        return rows

    if not roads:
        return Advice("keep_fixed", [], [], walk, ext, None, ["No road zones drawn yet"], numbers)

    # 1. Low confidence -> do not guess, keep the existing fixed timer
    if confidence_level == "Low" and not emergency_road:
        reasons = ["Low confidence"] + list(confidence_reasons or [])
        return Advice("keep_fixed", plan_rows(fixed), [r["id"] for r in roads], s.base_walk, 0,
                      None, reasons, numbers)

    available = s.cycle - walk
    ids = [r["id"] for r in roads]
    pressures = [float(r.get("people", 0)) for r in roads]
    reasons: list[str] = []

    # 2. Emergency (simulated): chosen road gets a long green and goes first
    if emergency_road in ids:
        e_idx = ids.index(emergency_road)
        e_green = min(max(EMERGENCY_GREEN, s.min_green), s.max_green)
        others = [i for i in range(len(ids)) if i != e_idx]
        rest = split_green([pressures[i] for i in others], available - e_green, s.min_green, s.max_green)
        greens = {ids[e_idx]: e_green, **{ids[i]: g for i, g in zip(others, rest)}}
        order = [emergency_road] + [ids[i] for i in sorted(others, key=lambda i: pressures[i], reverse=True)]
        top = next(row for row in plan_rows(greens) if row["id"] == emergency_road)
        return Advice("emergency", plan_rows(greens), order, walk, ext, top, ["Emergency priority (simulated)"], numbers)

    # 3. Normal case: occupancy-weighted Max-Pressure split
    green_list = split_green(pressures, available, s.min_green, s.max_green)
    greens = dict(zip(ids, green_list))

    # 4. Fairness guard: roads waiting too long are served first
    overdue = [r["id"] for r in roads if r.get("longest_wait_s", 0) > s.max_wait]
    order = overdue + [i for i in sorted(ids, key=lambda i: pressures[ids.index(i)], reverse=True) if i not in overdue]
    if overdue:
        reasons.append("Fairness guard: " + ", ".join(overdue) + " waited longer than the limit")
    if ext:
        reasons.append(f"Pedestrian protection: +{ext} s walk time")

    rows = plan_rows(greens)
    best = max(rows, key=lambda row: row["delta"])
    if best["delta"] >= MEANINGFUL_CHANGE:
        top = best
    else:
        top = None
        reasons.append("Current plan already fits the traffic")
    return Advice("advise", rows, order, walk, ext, top, reasons, numbers)
