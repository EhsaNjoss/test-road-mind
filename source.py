"""Video input for Roadmind.

A VideoSource reads frames in a background thread and always keeps only the
latest frame, so slow processing never builds up a delay. It accepts:

- a video file path (looped forever, played at its real speed)
- a webcam index such as "0"
- a phone IP-camera / MJPEG URL (http://...)
- an RTSP URL from a CCTV camera (rtsp://...)
"""
from __future__ import annotations

import threading
import time
from pathlib import Path

import cv2
import numpy as np

from app.config import PROCESS_MAX_WIDTH, ROOT


def resolve_source(source: str) -> str | int:
    """Turn the junction's "source" text into something OpenCV can open."""
    source = str(source).strip()
    if source.isdigit():
        return int(source)  # webcam index
    if "://" in source:
        return source  # http / rtsp stream
    path = Path(source)
    if not path.is_absolute():
        path = ROOT / path
    return str(path)


def is_file_source(source: str | int) -> bool:
    return isinstance(source, str) and "://" not in source


def resize_for_processing(frame: np.ndarray) -> np.ndarray:
    """Shrink wide frames to PROCESS_MAX_WIDTH, keeping the aspect ratio."""
    h, w = frame.shape[:2]
    if w <= PROCESS_MAX_WIDTH:
        return frame
    scale = PROCESS_MAX_WIDTH / w
    return cv2.resize(frame, (PROCESS_MAX_WIDTH, int(h * scale)), interpolation=cv2.INTER_AREA)


def grab_first_frame(source: str) -> np.ndarray | None:
    """Read one frame (used by the calibration page to draw zones on)."""
    cap = cv2.VideoCapture(resolve_source(source))
    try:
        ok, frame = cap.read()
        return resize_for_processing(frame) if ok else None
    finally:
        cap.release()


class VideoSource:
    """Threaded reader that always holds the most recent frame."""

    def __init__(self, source: str) -> None:
        self.source_text = source
        self.source = resolve_source(source)
        self._is_file = is_file_source(self.source)
        self._lock = threading.Lock()
        self._frame: np.ndarray | None = None
        self._frame_id = 0
        self._running = False
        self._thread: threading.Thread | None = None
        self.error: str | None = None

    def start(self) -> "VideoSource":
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        self._running = False

    def read(self) -> tuple[np.ndarray | None, int]:
        """Return (latest frame, frame number). Frame is None until the first one arrives."""
        with self._lock:
            return self._frame, self._frame_id

    def _loop(self) -> None:
        while self._running:
            cap = cv2.VideoCapture(self.source)
            if not cap.isOpened():
                self.error = f"Cannot open video source: {self.source_text}"
                time.sleep(2)
                continue
            self.error = None
            fps = cap.get(cv2.CAP_PROP_FPS) or 25
            frame_gap = 1.0 / fps if self._is_file and 1 <= fps <= 120 else 0.0
            next_time = time.perf_counter()
            while self._running:
                ok, frame = cap.read()
                if not ok:
                    break  # end of file (loop again) or stream dropped (reconnect)
                frame = resize_for_processing(frame)
                with self._lock:
                    self._frame = frame
                    self._frame_id += 1
                if frame_gap:  # play files at their real speed
                    next_time += frame_gap
                    delay = next_time - time.perf_counter()
                    if delay > 0:
                        time.sleep(delay)
                    else:
                        next_time = time.perf_counter()
            cap.release()
            if not self._is_file:
                time.sleep(1)  # brief pause before reconnecting a live stream
