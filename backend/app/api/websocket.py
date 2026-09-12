"""
WebSocket event fan-out for bot status, order events, volume/PNL changes,
and risk warnings. The frontend subscribes per-bot.
"""
from __future__ import annotations

import json
from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, bot_id: str, ws: WebSocket) -> None:
        await ws.accept()
        self._connections[bot_id].add(ws)

    def disconnect(self, bot_id: str, ws: WebSocket) -> None:
        self._connections[bot_id].discard(ws)

    async def broadcast(self, bot_id: str, event_type: str, data: dict) -> None:
        payload = json.dumps({"event_type": event_type, "bot_id": bot_id, "data": data}, default=str)
        dead = []
        for ws in self._connections.get(bot_id, set()):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(bot_id, ws)


manager = ConnectionManager()


@router.websocket("/ws/bots/{bot_id}")
async def bot_events_ws(websocket: WebSocket, bot_id: str):
    await manager.connect(bot_id, websocket)
    try:
        while True:
            # Frontend doesn't need to send anything; we just keep the
            # connection open and push events. Receiving lets us detect
            # disconnects promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(bot_id, websocket)
