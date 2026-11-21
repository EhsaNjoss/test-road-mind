"""The per-junction processing loop.

Every frame (in a background thread):
    read latest frame -> detect + track (every Nth frame) -> per-road stats
    -> people estimate -> draw overlays -> publish state

Once per advice cycle (or when the officer asks):
    advisor -> Bangla/English explanation
    -> decision log entry (pending until the officer accepts or overrides)

Detection runs live on every run; nothing is pre-recorded or replayed.
"""
from __future__ import annotations

import os
import threading
import time

import cv2
import supervision as sv

from app import db
from app.config import CYCLE_SECONDS, DETECT_EVERY, JPEG_QUALITY, MODEL_PATH
from app.core.advisor import AdvisorSettings, advise
from app.core.explain import explain
from app.core.people import add_people, merged_occupancy, rank
from app.video.annotate import annotate
from app.video.detector import Detector
from app.video.source import VideoSource
from app.video.tracker import JunctionTracker

ADVICE_INTERVAL = int(os.getenv("ROADMIND_ADVICE_INTERVAL", "0"))  # 0 = once per signal cycle
WARMUP_SECONDS = 4
FEATURES = ["people", "advice", "log"]
# Confidence check is not built yet: treat every frame as usable.
NO_CHECK = {"level": "High", "score": None, "reasons": [], "measures": {}}


class JunctionPipeline:
    def __init__(self, junction: dict) -> None:
        self.junction = junction
        self.source = VideoSource(junction.get("source", ""))
        self.tracker = JunctionTracker(junction["roads"], junction["crossings"])
        self.occupancy = merged_occupancy(junction.get("occupancy"))
        self._lock = threading.Lock()
        self._jpeg: bytes | None = None
        self._state: dict = {"status": "starting"}
        self._advice_state: dict | None = None
        self._refresh = threading.Event()
        self._running = False
        self._last_frame = None
        self._last_roads: list[dict] = []
        self._last_pedestrians = 0

    # --- lifecycle --------------------------------------------------------
    def start(self) -> "JunctionPipeline":
        self.source.start()
        self._running = True
        threading.Thread(target=self._loop, daemon=True).start()
        return self

    def stop(self) -> None:
        self._running = False
        self.source.stop()

    def reload(self, junction: dict) -> None:
        """New zones or occupancy values from the officer."""
        self.junction = junction
        self.tracker.set_zones(junction["roads"], junction["crossings"])
        self.occupancy = merged_occupancy(junction.get("occupancy"))
        self._refresh.set()

    # --- officer actions --------------------------------------------------
    def request_advice(self) -> None:
        self._refresh.set()

    # --- outputs ----------------------------------------------------------
    def latest_jpeg(self) -> bytes | None:
        with self._lock:
            return self._jpeg

    def latest_state(self) -> dict:
        with self._lock:
            state = dict(self._state)
            state["advice"] = self._advice_state
            return state

    # --- advice -----------------------------------------------------------
    def _settings(self) -> AdvisorSettings:
        return AdvisorSettings(cycle=int(self.junction.get("cycle_seconds", CYCLE_SECONDS)))

    def _make_advice(self, roads: list[dict], pedestrians: int, conf: dict, frame) -> None:
        settings = self._settings()
        fixed_plan = self.junction.get("fixed_plan", {})
        advice = advise(roads, fixed_plan, pedestrians, conf["level"], conf["reasons"], None, settings).to_dict()
        text = explain(advice, use_llm=False)  # instant template; LLM version follows below


        thumb = db.save_thumbnail(frame, f"{self.junction['id']}_{int(time.time() * 1000)}") if frame is not None else None
        decision_id = db.add_decision(self.junction["id"], advice, text, thumb)
        with self._lock:
            self._advice_state = {"id": decision_id, **advice, "explanation": text}

        def improve_text() -> None:
            better = explain(advice, use_llm=True)
            if better["source"] == "llm":
                db.update_explanation(decision_id, better)
                with self._lock:
                    if self._advice_state and self._advice_state.get("id") == decision_id:
                        self._advice_state = {**self._advice_state, "explanation": better}
        threading.Thread(target=improve_text, daemon=True).start()

    # --- main loop --------------------------------------------------------
    def _loop(self) -> None:
        detector = Detector(MODEL_PATH)  # own detector so the tracker's memory starts fresh
        last_id, frame_count = -1, 0
        tracked = sv.Detections.empty()
        stats: dict = {"roads": [], "crossings": []}
        conf = NO_CHECK
        fps_window: list[float] = []
        started = None
        next_advice = None

        while self._running:
            frame, frame_id = self.source.read()
            if frame is None or frame_id == last_id:
                if self.source.error:
                    with self._lock:
                        self._state = {"status": "error", "error": self.source.error}
                time.sleep(0.01)
                continue
            last_id = frame_id
            frame_count += 1
            t = time.perf_counter()
            h, w = frame.shape[:2]

            if frame_count % DETECT_EVERY == 0 or len(tracked) == 0:
                detections = detector.detect(frame)
                tracked, stats = self.tracker.update(detections, w, h, t)
                confs = detections.confidence
                mean_conf = float(confs.mean()) if confs is not None and len(confs) else None
                stats["mean_confidence"] = round(mean_conf, 3) if mean_conf is not None else None
                stats["roads"] = add_people(stats["roads"], self.occupancy)

            pedestrians = sum(c["people"] for c in stats.get("crossings", []))
            image = annotate(frame, tracked, self.tracker.roads, self.tracker.crossings, stats, self.occupancy)
            ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])

            fps_window.append(time.perf_counter())
            fps_window = [x for x in fps_window if fps_window[-1] - x <= 2.0]
            fps = (len(fps_window) - 1) / max(fps_window[-1] - fps_window[0], 1e-6) if len(fps_window) > 1 else 0.0

            # --- advice timing: once per cycle, or when the officer asks ---
            now = time.time()
            started = started or now
            interval = ADVICE_INTERVAL or int(self.junction.get("cycle_seconds", CYCLE_SECONDS))
            due = next_advice is None and now - started >= WARMUP_SECONDS
            due = due or (next_advice is not None and now >= next_advice) or self._refresh.is_set()
            if due:
                self._refresh.clear()
                try:
                    self._make_advice(stats["roads"], pedestrians, conf, frame)
                except Exception as exc:  # never let one bad advice stop the video
                    with self._lock:
                        self._advice_state = {"error": f"Advice failed: {type(exc).__name__}: {exc}"}
                next_advice = now + interval

            state = {
                "status": "running",
                "junction": {"id": self.junction["id"], "name": self.junction.get("name")},
                "frame_size": [w, h],
                "fps": round(fps, 1),
                "supported_types": detector.supported_types,
                "occupancy": self.occupancy,
                "features": FEATURES,
                "pedestrians_waiting": pedestrians,
                "rank_people": rank(stats["roads"], "people"),
                "rank_vehicles": rank(stats["roads"], "total_vehicles"),
                "next_advice_in_s": max(0, int(next_advice - now)) if next_advice else None,
                **stats,
            }
            with self._lock:
                if ok:
                    self._jpeg = buf.tobytes()
                self._state = state


class PipelineManager:
    """Keeps one running pipeline (the selected junction) to save CPU."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: JunctionPipeline | None = None

    def get(self, junction: dict) -> JunctionPipeline:
        with self._lock:
            if self._active is None or self._active.junction["id"] != junction["id"]:
                if self._active is not None:
                    self._active.stop()
                self._active = JunctionPipeline(junction).start()
            return self._active

    def reload(self, junction: dict) -> None:
        with self._lock:
            if self._active is not None and self._active.junction["id"] == junction["id"]:
                self._active.reload(junction)

    def stop_all(self) -> None:
        with self._lock:
            if self._active is not None:
                self._active.stop()
                self._active = None
