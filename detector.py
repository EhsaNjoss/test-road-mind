"""YOLO vehicle and pedestrian detector (with ByteTrack tracking built in).

The detector maps whatever class names the model knows onto Roadmind's own
vehicle types. A pretrained COCO model knows car, bus, truck, motorcycle,
bicycle and person, but NOT Bangladeshi types such as CNG, rickshaw or leguna.
A model fine-tuned on a Bangladeshi dataset (placed at models/roadmind.pt)
adds those automatically, as long as its class names match the aliases below.
"""
from __future__ import annotations

import numpy as np
import supervision as sv
from ultralytics import YOLO

from app.config import DETECT_CONFIDENCE, DETECT_IMG_SIZE, ROOT

# Model class name (lower case) -> Roadmind type
ALIASES: dict[str, str] = {
    "person": "person", "pedestrian": "person", "people": "person",
    "bicycle": "bicycle", "cycle": "bicycle",
    "car": "car", "sedan": "car", "suv": "car", "microbus": "car", "taxi": "car",
    "motorcycle": "motorbike", "motorbike": "motorbike", "bike": "motorbike",
    "bus": "bus", "minibus": "bus", "minibus/bus": "bus",
    "truck": "truck", "pickup": "truck", "lorry": "truck",
    "van": "van", "covered van": "van",
    "cng": "cng", "auto rickshaw": "cng", "autorickshaw": "cng", "three wheelers (cng)": "cng",
    "rickshaw": "rickshaw", "cycle rickshaw": "rickshaw",
    "battery rickshaw": "battery_rickshaw", "easy bike": "battery_rickshaw", "easybike": "battery_rickshaw",
    "leguna": "leguna", "human hauler": "leguna",
}

VEHICLE_TYPES = ("bus", "leguna", "battery_rickshaw", "cng", "rickshaw", "car",
                 "van", "motorbike", "bicycle", "truck")


def _normalise(name: str) -> str:
    return name.lower().replace("_", " ").replace("-", " ").strip()


class Detector:
    """Wraps a YOLO model and returns supervision Detections with a 'type' field."""

    def __init__(self, model_path: str) -> None:
        path = ROOT / model_path
        # If official weights (e.g. yolo11n.pt) are missing, Ultralytics downloads them here
        path.parent.mkdir(parents=True, exist_ok=True)
        self.model = YOLO(str(path))
        self.class_to_type: dict[int, str] = {}
        for class_id, name in self.model.names.items():
            roadmind_type = ALIASES.get(_normalise(name))
            if roadmind_type:
                self.class_to_type[int(class_id)] = roadmind_type
        self.keep_ids = np.array(sorted(self.class_to_type), dtype=int)

    @property
    def supported_types(self) -> list[str]:
        """Roadmind types this model can actually detect (shown honestly in the UI)."""
        return sorted(set(self.class_to_type.values()))

    def detect(self, frame: np.ndarray) -> sv.Detections:
        """Detect and track in one step (Ultralytics' built-in ByteTrack keeps IDs stable)."""
        result = self.model.track(frame, imgsz=DETECT_IMG_SIZE, conf=DETECT_CONFIDENCE,
                                  tracker="bytetrack.yaml", persist=True, verbose=False)[0]
        detections = sv.Detections.from_ultralytics(result)
        if detections.tracker_id is None and len(detections):
            detections.tracker_id = np.full(len(detections), -1, dtype=int)  # not yet confirmed by the tracker
        if len(detections) == 0:
            detections.data["type"] = np.array([], dtype=object)
            return detections
        detections = detections[np.isin(detections.class_id, self.keep_ids)]
        detections.data["type"] = np.array(
            [self.class_to_type[int(c)] for c in detections.class_id], dtype=object
        )
        return detections
