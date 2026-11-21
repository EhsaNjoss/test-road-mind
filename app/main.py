"""Roadmind web server (FastAPI).

Run with:  uvicorn app.main:app --reload
Then open  http://localhost:8000  (officer dashboard) and  /calibrate  (draw zones).
"""
from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager

import cv2
from fastapi import Body, FastAPI, HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from app import db
from app.config import DEFAULT_JUNCTION, STATIC_DIR
from app.junctions import list_junctions, load_junction, save_junction, valid_id
from app.pipeline import PipelineManager
from app.video.source import grab_first_frame

manager = PipelineManager()
OVERRIDE_REASONS = ["VIP movement", "Accident or breakdown", "Officer judgement", "Camera view wrong", "Other"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    manager.stop_all()


app = FastAPI(title="Roadmind", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


def _junction_or_404(junction_id: str) -> dict:
    if not valid_id(junction_id):
        raise HTTPException(400, "Invalid junction id")
    try:
        return load_junction(junction_id)
    except FileNotFoundError:
        raise HTTPException(404, f"Junction '{junction_id}' not found")


def _pipeline(junction_id: str):
    return manager.get(_junction_or_404(junction_id))


# --- pages ---------------------------------------------------------------
@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/calibrate", include_in_schema=False)
def calibrate() -> FileResponse:
    return FileResponse(STATIC_DIR / "calibrate.html")


# --- junctions -----------------------------------------------------------
@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/junctions")
def junctions() -> dict:
    return {"default": DEFAULT_JUNCTION, "junctions": list_junctions(), "override_reasons": OVERRIDE_REASONS}


@app.get("/api/junctions/{junction_id}")
def junction_detail(junction_id: str) -> dict:
    return _junction_or_404(junction_id)


@app.post("/api/junctions/{junction_id}")
def junction_save(junction_id: str, updates: dict = Body(...)) -> dict:
    """Save zones, source, occupancy, fixed plan or cycle length."""
    if not valid_id(junction_id):
        raise HTTPException(400, "Invalid junction id")
    try:
        junction = save_junction(junction_id, updates)
    except (ValueError, TypeError) as exc:
        raise HTTPException(400, str(exc))
    manager.reload(junction)
    return junction


@app.get("/api/junctions/{junction_id}/frame")
def junction_frame(junction_id: str) -> Response:
    """First frame of the junction video, for drawing zones on."""
    junction = _junction_or_404(junction_id)
    frame = grab_first_frame(junction.get("source", ""))
    if frame is None:
        raise HTTPException(404, "Could not read a frame from this junction's video source")
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return Response(buf.tobytes(), media_type="image/jpeg")


# --- live state and video ------------------------------------------------
@app.get("/api/state/{junction_id}")
def state(junction_id: str) -> dict:
    return _pipeline(junction_id).latest_state()


@app.get("/api/events/{junction_id}")
async def events(junction_id: str) -> StreamingResponse:
    """Server-Sent Events: the dashboard state, about 4 times per second."""
    pipeline = _pipeline(junction_id)

    async def gen():
        while True:
            yield f"data: {json.dumps(pipeline.latest_state(), ensure_ascii=False, default=str)}\n\n"
            await asyncio.sleep(0.25)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/stream/{junction_id}")
async def stream(junction_id: str) -> StreamingResponse:
    """Live annotated video as an MJPEG stream (works directly in an <img> tag)."""
    pipeline = _pipeline(junction_id)

    async def frames():
        last = None
        while True:
            jpeg = pipeline.latest_jpeg()
            if jpeg is not None and jpeg is not last:
                last = jpeg
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
            await asyncio.sleep(1 / 20)

    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame")


# --- officer actions -----------------------------------------------------
@app.post("/api/advice/{junction_id}/refresh")
def advice_refresh(junction_id: str) -> dict:
    _pipeline(junction_id).request_advice()
    return {"ok": True}


@app.post("/api/decision")
def decision(body: dict = Body(...)) -> dict:
    """Officer accepts or overrides an advice. Body: {id, action, seconds?, reason?}."""
    action = body.get("action")
    if action not in ("accept", "override"):
        raise HTTPException(400, "action must be 'accept' or 'override'")
    seconds = body.get("seconds")
    if seconds is not None:
        try:
            seconds = int(seconds)
        except (TypeError, ValueError):
            raise HTTPException(400, "seconds must be a whole number")
        if not -120 <= seconds <= 300:
            raise HTTPException(400, "seconds out of range")
    reason = body.get("reason")
    if action == "override" and reason not in OVERRIDE_REASONS:
        raise HTTPException(400, "Choose a reason for the override")
    result = db.decide(int(body.get("id", 0)), action, seconds, reason)
    if result is None:
        raise HTTPException(404, "Decision not found")
    return result


@app.post("/api/emergency/{junction_id}")
def emergency(junction_id: str, body: dict = Body(...)) -> dict:
    """Simulated emergency priority. Body: {road_id} to start, {cancel: true} to stop."""
    pipeline = _pipeline(junction_id)
    if body.get("cancel"):
        pipeline.cancel_emergency()
        return {"ok": True, "active": False}
    road_id = str(body.get("road_id", ""))
    if road_id not in [r["id"] for r in pipeline.junction["roads"]]:
        raise HTTPException(400, "Unknown road")
    pipeline.start_emergency(road_id)
    return {"ok": True, "active": True, "road_id": road_id}


@app.get("/api/log/{junction_id}")
def log(junction_id: str) -> dict:
    _junction_or_404(junction_id)
    return {"decisions": db.recent_decisions(junction_id)}


@app.get("/api/thumb/{name}")
def thumb(name: str) -> FileResponse:
    path = db.thumb_path(name)
    if path is None:
        raise HTTPException(404, "Not found")
    return FileResponse(path, media_type="image/jpeg")
