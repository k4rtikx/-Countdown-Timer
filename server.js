/* ================= ADMIN KEY ================= */
const ADMIN_KEY = process.env.ADMIN_KEY || "devkey";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

/* ===== REDIS ===== */
const { Redis } = require("@upstash/redis");
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const app = express();

/* ---------- FAST HEALTH CHECK (prevents long loading page) ---------- */
app.get("/health", (req,res)=>res.status(200).send("OK"));

/* ---------- ROOT QUICK RESPONSE (Render probe hits / ) ---------- */
app.get("/", (req,res,next)=>next());

/* ---------- STATIC ---------- */
app.use(express.static(path.join(__dirname, "fest-screen")));

/* ================= SERVER ================= */
const server = http.createServer(app);
const io = new Server(server);

/* ================= PERSISTENT TIMER ================= */

const DURATION = 36 * 60 * 60 * 1000;
let state = { video:false };

/* ---------- GET START TIME ---------- */
async function getStart(){
    try {
        return await redis.get("eventStart");
    } catch {
        return null; // don't block boot if redis cold
    }
}

/* ---------- SET START TIME ---------- */
async function setStart(ts){
    try {
        await redis.set("eventStart", ts);
    } catch {}
}

/* ---------- BUILD STATE ---------- */
async function buildSyncState() {

    const eventStart = await getStart();

    if (!eventStart) {
        return { notStarted:true, video: state.video };
    }

    const endTime = Number(eventStart) + DURATION;
    let remaining = endTime - Date.now();
    if (remaining < 0) remaining = 0;

    return {
        endTime,
        remaining,
        paused:false,
        video: state.video
    };
}

/* ---------- SOCKET ---------- */
io.on("connection", async (socket) => {

    const isAdmin = socket.handshake.auth?.admin === ADMIN_KEY;
    console.log("Connected:", socket.id, isAdmin?"ADMIN":"VIEW");

    socket.emit("sync", await buildSyncState());

    function deny(){ if(!isAdmin) return true; }

    socket.on("reset", async () => {
        if(deny()) return;

        const now = Date.now();
        await setStart(now);

        console.log("EVENT STARTED:", new Date(now));
        io.emit("sync", await buildSyncState());
    });

    socket.on("forceSync", async ()=> socket.emit("sync", await buildSyncState()));

    socket.on("playVideo", async () => {
        if(deny()) return;
        state.video = true;
        io.emit("sync", await buildSyncState());
    });

    socket.on("stopVideo", async () => {
        if(deny()) return;
        state.video = false;
        io.emit("sync", await buildSyncState());
    });
});

/* ================= START ================= */
const PORT = process.env.PORT || 3000;
server.listen(PORT,"0.0.0.0",()=>console.log("SERVER RUNNING",PORT));
