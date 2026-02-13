/* ================= ADMIN KEY (ENV SUPPORT ADDED) ================= */
const ADMIN_KEY = process.env.ADMIN_KEY || "devkey";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "fest-screen")));

/* =========================================================
   REAL WORLD COUNTDOWN TIMER (FIX)
   ========================================================= */

const DURATION = 36 * 60 * 60 * 1000; // 36 hours
let eventStartTime = null;   // set once by admin
let videoPlaying = false;

/* ---------- BUILD LIVE STATE ---------- */
function buildSyncState() {

    // timer never started yet
    if (!eventStartTime) {
        return {
            notStarted: true,
            video: videoPlaying
        };
    }

    const endTime = eventStartTime + DURATION;
    let remaining = endTime - Date.now();
    if (remaining < 0) remaining = 0;

    return {
        endTime,
        paused: false,        // pause removed (real countdown)
        remaining,
        video: videoPlaying
    };
}

/* ---------- SOCKET ---------- */
io.on("connection", (socket) => {

    const isAdmin = socket.handshake.auth?.admin === ADMIN_KEY;
    console.log("Client connected:", socket.id, isAdmin ? "(ADMIN)" : "(VIEWER)");

    // send current state once
    socket.emit("sync", buildSyncState());

    function denyIfNotAdmin(){
        if(!isAdmin){
            console.log("Blocked non-admin action:", socket.id);
            return true;
        }
        return false;
    }

    /* ===== START / RESET TIMER ===== */
    socket.on("reset", () => {
        if(denyIfNotAdmin()) return;

        eventStartTime = Date.now();
        console.log("TIMER STARTED AT:", eventStartTime);

        io.emit("sync", buildSyncState());
    });

    /* ===== VIDEO CONTROL ===== */
    socket.on("playVideo", () => {
        if(denyIfNotAdmin()) return;
        videoPlaying = true;
        io.emit("sync", buildSyncState());
    });

    socket.on("stopVideo", () => {
        if(denyIfNotAdmin()) return;
        videoPlaying = false;
        io.emit("sync", buildSyncState());
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () =>
    console.log("SERVER RUNNING ON PORT", PORT)
);
