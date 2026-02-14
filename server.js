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


/* ================= REAL GLOBAL TIMER ================= */

/* ================= REAL WORLD DEADLINE TIMER ================= */

// SET YOUR HACKATHON END TIME HERE (IST)
const EVENT_END = new Date("2026-02-16T09:00:00+05:30").getTime();


let state = {
    video:false
};


/* ---------- BUILD LIVE STATE ---------- */
function buildSyncState() {

    let remaining = EVENT_END - Date.now();
    if (remaining < 0) remaining = 0;

    return {
        endTime: EVENT_END,
        paused:false,
        remaining,
        video: state.video
    };
}



/* ---------- SOCKET ---------- */
io.on("connection", (socket) => {

    const isAdmin = socket.handshake.auth?.admin === ADMIN_KEY;
    console.log("Client connected:", socket.id, isAdmin ? "(ADMIN)" : "(VIEWER)");

    // send current state ONCE
    socket.emit("sync", buildSyncState());

    function denyIfNotAdmin(){
        if(!isAdmin){
            console.log("Blocked non-admin action:", socket.id);
            return true;
        }
        return false;
    }

    /* ===== RESET (RESTART TIMER FROM NOW) ===== */
    socket.on("reset", () => {
        if(denyIfNotAdmin()) return;
        io.emit("sync", buildSyncState());
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
