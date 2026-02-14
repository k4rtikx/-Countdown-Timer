/* ================= ADMIN KEY (ENV SUPPORT ADDED) ================= */
const ADMIN_KEY = process.env.ADMIN_KEY || "devkey";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "fest-screen")));


/* ================= REAL GLOBAL TIMER ================= */

const DURATION = 36 * 60 * 60 * 1000;
const START_FILE = "start.txt";

/* ---------- SAFE LOAD (important fix) ---------- */
let eventStart = null;

try {
    if (fs.existsSync(START_FILE)) {
        const raw = fs.readFileSync(START_FILE, "utf8").trim();
        const parsed = Number(raw);

        if (!isNaN(parsed) && parsed > 1000000000000) {
            eventStart = parsed;
            console.log("Recovered start time:", new Date(eventStart));
        } else {
            console.log("Corrupted start file — ignoring");
        }
    } else {
        console.log("No previous start found");
    }
} catch (err) {
    console.log("Start file read error:", err.message);
}

let state = {
    video:false
};


/* ---------- BUILD LIVE STATE ---------- */
function buildSyncState() {

    if (!eventStart) {
        return {
            notStarted:true,
            video: state.video
        };
    }

    const endTime = eventStart + DURATION;

    let remaining = endTime - Date.now();
    if (remaining < 0) remaining = 0;

    return {
        endTime,
        paused:false,
        remaining,
        video: state.video
    };
}


/* ---------- SOCKET ---------- */
io.on("connection", (socket) => {

    const isAdmin = socket.handshake.auth?.admin === ADMIN_KEY;
    console.log("Client connected:", socket.id, isAdmin ? "(ADMIN)" : "(VIEWER)");

    socket.emit("sync", buildSyncState());

    function denyIfNotAdmin(){
        if(!isAdmin){
            console.log("Blocked non-admin action:", socket.id);
            return true;
        }
        return false;
    }

    /* ===== RESET = START / RESTART HACKATHON ===== */
    socket.on("reset", () => {
        if(denyIfNotAdmin()) return;

        eventStart = Date.now();

        try {
            fs.writeFileSync(START_FILE, String(eventStart));
            console.log("EVENT STARTED:", new Date(eventStart));
        } catch(e) {
            console.log("Failed to save start time:", e.message);
        }

        io.emit("sync", buildSyncState());
    });

    socket.on("forceSync", () => {
        socket.emit("sync", buildSyncState());
    });

    /* ===== VIDEO CONTROL ===== */
    socket.on("playVideo", () => {
        if(denyIfNotAdmin()) return;
        state.video = true;
        io.emit("sync", buildSyncState());
    });

    socket.on("stopVideo", () => {
        if(denyIfNotAdmin()) return;
        state.video = false;
        io.emit("sync", buildSyncState());
    });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () =>
    console.log("SERVER RUNNING ON PORT", PORT)
);
