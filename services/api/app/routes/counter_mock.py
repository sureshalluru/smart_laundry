"""
In-memory MOCK of the Jetson + EC2 garment-counter backend.

Purpose: let the Garment Counter iPad PWA be demoed end-to-end (over the same
HTTPS origin, no CORS/mixed-content issues) without the real Jetson hardware or
EC2 vision backend existing yet. It is a demo shim only.

Guard rails:
  - Mounted ONLY when settings.enable_demo_counter is True (env
    ENABLE_DEMO_COUNTER=true). Off by default.
  - All state is in-memory: it resets on restart and is NOT shared across
    server instances. Fine for a single-instance demo, not for real use.
  - Serves fabricated data. Never enable in a real operating environment.

Endpoint contract mirrors apps/garment-counter/API_CONTRACT.md exactly, so the
Jetson/EC2 developers can build the real endpoints to match.
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

router = APIRouter()

CATEGORIES = ["shirts", "pants", "towels"]
EMIT_INTERVAL_SECONDS = 1.2


class _MockState:
    """In-memory mock backend state (single active session at a time)."""

    def __init__(self) -> None:
        self.cloth_id: int = 0
        self.latest: Optional[Dict[str, Any]] = None
        self.items_by_uniq: Dict[str, List[Dict[str, Any]]] = {}
        self.before_wash_by_order: Dict[str, str] = {}
        self.active: Optional[Dict[str, str]] = None
        self.history: List[Dict[str, Any]] = []
        self._task: Optional[asyncio.Task] = None

    def start_emitting(self) -> None:
        self.stop_emitting()
        self._task = asyncio.create_task(self._emit_loop())

    def stop_emitting(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    async def _emit_loop(self) -> None:
        try:
            while self.active is not None:
                await asyncio.sleep(EMIT_INTERVAL_SECONDS)
                if self.active is not None:
                    self._emit_one()
        except asyncio.CancelledError:
            pass

    def _emit_one(self) -> None:
        assert self.active is not None
        self.cloth_id += 1
        trans_id = self.active["trans_id"]
        uniq_id = self.active["uniq_id"]
        wash_type = self.active["type"]
        operator = self.active["operator_name"]

        cloth_type = CATEGORIES[self.cloth_id % len(CATEGORIES)]
        # For After Wash, deliberately "lose" a shirt now and then so a
        # discrepancy shows up in the demo.
        if wash_type == "After Wash" and cloth_type == "shirts" and self.cloth_id % 6 == 0:
            cloth_type = "pants"

        detection = {
            "cloth_id": self.cloth_id,
            "cloth_type": cloth_type,
            # Relative to the Cloud base URL (which is <origin>/mockapi), so the
            # app resolves it to <origin>/mockapi/img/<id>.svg.
            "file_path": f"img/{self.cloth_id}.svg",
            "date": datetime.now(timezone.utc).isoformat(),
            "ismodified": False,
            "wash_type": wash_type,
            "trans_id": trans_id,
            "operator_name": operator,
            "uniq_id": uniq_id,
            "status": "ok",
            "confidence": 60 + ((self.cloth_id * 7) % 40),
        }
        self.latest = detection
        self.items_by_uniq.setdefault(uniq_id, []).append(detection)


state = _MockState()


def _json(body: Any, status: int = 200) -> JSONResponse:
    # Same-origin in production; permissive here to also support the Vite dev
    # origin during local testing.
    return JSONResponse(
        content=body,
        status_code=status,
        headers={"Access-Control-Allow-Origin": "*"},
    )


# ── Jetson: start transaction ────────────────────────────────────────────────
@router.get("/transaction/")
async def start_transaction(request: Request) -> JSONResponse:
    q = request.query_params
    trans_id = q.get("id", "")
    wash_type = q.get("type", "Before Wash")
    uniq_id = q.get("uniq_id", "")
    operator_name = q.get("operator_name", "")

    if state.active is not None:
        return _json({"detail": "transaction already running"}, status=409)

    state.active = {
        "trans_id": trans_id,
        "uniq_id": uniq_id,
        "type": wash_type,
        "operator_name": operator_name,
    }
    state.latest = None
    state.cloth_id = 0
    state.history.insert(0, {
        "trans_id": trans_id,
        "uniq_id": uniq_id,
        "type": wash_type,
        "operator_name": operator_name,
        "date": datetime.now(timezone.utc).isoformat(),
    })
    state.start_emitting()
    return _json({"success": True})


# ── Jetson: stop transaction ─────────────────────────────────────────────────
@router.post("/transaction/")
async def stop_transaction() -> JSONResponse:
    state.stop_emitting()
    if state.active and state.active["type"] == "Before Wash":
        state.before_wash_by_order[state.active["trans_id"]] = state.active["uniq_id"]
    state.active = None
    return _json({"success": True})


# ── EC2: Before Wash existence check ─────────────────────────────────────────
@router.get("/transaction/check/{trans_id}/")
async def check_before_wash(trans_id: str) -> JSONResponse:
    return _json({"exists": trans_id in state.before_wash_by_order})


# ── EC2: transaction history ─────────────────────────────────────────────────
@router.get("/transaction/history/")
async def transaction_history() -> JSONResponse:
    return _json(state.history)


# ── EC2: latest detection (polled every 500ms) ───────────────────────────────
@router.get("/single_cloth/")
async def latest_cloth() -> JSONResponse:
    return _json(state.latest or {})


# ── EC2: correct latest cloth category ───────────────────────────────────────
@router.post("/single_cloth/")
async def correct_cloth(request: Request) -> JSONResponse:
    body = await request.json()
    if state.latest and state.latest.get("cloth_id") == body.get("cloth_id"):
        state.latest["cloth_type"] = body.get("category")
        state.latest["ismodified"] = True
    return _json({"success": True})


# ── EC2: move cloth (discrepancy resolution) ─────────────────────────────────
@router.post("/move_cloth/")
async def move_cloth(request: Request) -> JSONResponse:
    await request.json()
    return _json({"mismatch_resolved": True, "new_status": "balanced"})


# ── EC2: items for a session ─────────────────────────────────────────────────
@router.get("/cloth_count/single_transaction/")
async def items_for_session(request: Request) -> JSONResponse:
    uniq_id = request.query_params.get("uniq_id", "")
    return _json(state.items_by_uniq.get(uniq_id, []))


# ── EC2: Before Wash items for an order (by trans_id) ────────────────────────
@router.get("/cloth_count/before_wash/")
async def before_wash_items(request: Request) -> JSONResponse:
    trans_id = request.query_params.get("trans_id", "")
    bw_uniq = state.before_wash_by_order.get(trans_id)
    items = state.items_by_uniq.get(bw_uniq, []) if bw_uniq else []
    return _json(items)


# ── EC2: per-order dashboard summary ─────────────────────────────────────────
@router.get("/orders/summary/")
async def orders_summary() -> JSONResponse:
    by_order: Dict[str, Dict[str, Any]] = {}
    for h in reversed(state.history):  # oldest first so latest per phase wins
        entry = by_order.setdefault(h["trans_id"], {
            "trans_id": h["trans_id"],
            "operator_name": h["operator_name"],
            "before_uniq": None,
            "after_uniq": None,
            "date": h["date"],
        })
        if h["type"] == "Before Wash":
            entry["before_uniq"] = h["uniq_id"]
        if h["type"] == "After Wash":
            entry["after_uniq"] = h["uniq_id"]
        entry["date"] = h["date"]

    def count_by_type(uniq: Optional[str]) -> Dict[str, int]:
        out: Dict[str, int] = {}
        if not uniq:
            return out
        for it in state.items_by_uniq.get(uniq, []):
            out[it["cloth_type"]] = out.get(it["cloth_type"], 0) + 1
        return out

    summary = []
    for o in by_order.values():
        before = count_by_type(o["before_uniq"])
        after = count_by_type(o["after_uniq"])
        mismatch = False
        if o["before_uniq"] and o["after_uniq"]:
            for c in set(before) | set(after):
                if before.get(c, 0) != after.get(c, 0):
                    mismatch = True
        summary.append({
            "trans_id": o["trans_id"],
            "operator_name": o["operator_name"],
            "date": o["date"],
            "before_total": sum(before.values()),
            "after_total": sum(after.values()),
            "before_by_category": before,
            "after_by_category": after,
            "has_before": bool(o["before_uniq"]),
            "has_after": bool(o["after_uniq"]),
            "mismatch": mismatch,
        })
    return _json(summary)


# ── Mock detection image ─────────────────────────────────────────────────────
@router.get("/img/{name}")
async def mock_image(name: str) -> Response:
    label = name.replace(".svg", "").replace(".jpg", "")
    try:
        hue = (int(label) * 47) % 360
    except ValueError:
        hue = 200
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240">'
        f'<rect width="240" height="240" fill="hsl({hue},55%,45%)"/>'
        f'<text x="50%" y="45%" font-family="sans-serif" font-size="28" fill="white" '
        f'text-anchor="middle">garment</text>'
        f'<text x="50%" y="62%" font-family="sans-serif" font-size="40" font-weight="bold" '
        f'fill="white" text-anchor="middle">#{label}</text></svg>'
    )
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Access-Control-Allow-Origin": "*"},
    )
