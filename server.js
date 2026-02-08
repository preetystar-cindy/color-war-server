const WebSocket = require("ws");

const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = new Map();

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      players: new Map(),
      p: 0.5,
      lastTick: Date.now(),
      winner: null,
    });
  }
  return rooms.get(roomId);
}

function broadcast(roomId, data) {
  const room = rooms.get(roomId);
  if (!room) return;
  const msg = JSON.stringify(data);
  for (const ws of room.players.keys()) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

const SPEED = 0.55;
const FRICTION = 0.06;
const WIN_EPS = 0.001;

function tickRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const now = Date.now();
  let dt = (now - room.lastTick) / 1000;
  room.lastTick = now;
  dt = Math.min(dt, 0.05);

  const playersArr = [...room.players.values()];

  if (playersArr.length < 2) {
    const toCenter = 0.5 - room.p;
    room.p += toCenter * Math.min(1, dt * 1.2);
  } else if (!room.winner) {
    const A = playersArr[0];
    const B = playersArr[1];

let force = (A.power || 0) - (B.power || 0);

// 基础回中
let centerPull = (0.5 - room.p) * FRICTION;

// ✅ 如果两边都几乎没用力（都回正），就更强拉回中线
const idle = (Math.abs(A.power || 0) < 0.03) && (Math.abs(B.power || 0) < 0.03);
if (idle) {
  centerPull = (0.5 - room.p) * 0.60; // 这个数越大，回中越快
}

room.p += (force * SPEED + centerPull) * dt;


    if (room.p < 0) room.p = 0;
    if (room.p > 1) room.p = 1;

    if (room.p <= 0 + WIN_EPS) room.winner = B.id;
    if (room.p >= 1 - WIN_EPS) room.winner = A.id;
  }

  broadcast(roomId, {
    type: "state",
    p: room.p,
    players: playersArr.map((x) => ({ id: x.id, power: x.power })),
    winner: room.winner,
    ts: now,
  });

  if (room.players.size === 0) rooms.delete(roomId);
}

setInterval(() => {
  for (const roomId of rooms.keys()) tickRoom(roomId);
}, 33);

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
if (msg.type === "join") {
  const roomId = String(msg.room || "default");
  const id = String(msg.id || Math.random().toString(16).slice(2));

  ws._roomId = roomId;
  ws._id = id;

  const room = getRoom(roomId);

  // 先来的是 A（左边），后来的 B（右边）
  const role = room.players.size === 0 ? "A" : "B";

  room.players.set(ws, { id, power: 0, role });

  // 单独告诉这个客户端：你是 A 还是 B
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "role", role }));
  }

  broadcast(roomId, { type: "info", text: `${id} joined as ${role}` });
  return;
}



    if (msg.type === "power") {
      const roomId = ws._roomId;
      if (!roomId) return;
      const room = getRoom(roomId);

      const me = room.players.get(ws);
      if (!me) return;

      let p = Number(msg.value);
      if (!Number.isFinite(p)) p = 0;
      p = Math.max(0, Math.min(1, p));
      me.power = p;
      return;
    }

    if (msg.type === "reset") {
      const roomId = ws._roomId;
      if (!roomId) return;
      const room = getRoom(roomId);
      room.p = 0.5;
      room.winner = null;
      broadcast(roomId, { type: "info", text: "reset" });
      return;
    }
  });

  ws.on("close", () => {
    const roomId = ws._roomId;
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.players.delete(ws);
    broadcast(roomId, { type: "info", text: `${ws._id} left` });
  });
});

console.log(`WebSocket server running on :${PORT}`);



