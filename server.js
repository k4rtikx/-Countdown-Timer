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

const SAVE_FILE = "timer.json";

/* ---------- LOAD SAVED TIMER ---------- */
let state;

if (fs.existsSync(SAVE_FILE)) {
    state = JSON.parse(fs.readFileSync(SAVE_FILE));
} else {
    state = {
        duration: 36 * 60 * 60 * 1000,
        endTime: Date.now() + 36 * 60 * 60 * 1000,
        paused: false,
        remaining: null,
        video: false
    };
    fs.writeFileSync(SAVE_FILE, JSON.stringify(state));
}

/* ---- RECOVER TIMER AFTER SERVER RESTART (ADDED) ---- */
if(!state.paused){
    const remain = state.endTime - Date.now();

    if(remain <= 0){
        state.remaining = 0;
        state.paused = true;
    }else{
        state.endTime = Date.now() + remain;
    }
    fs.writeFileSync(SAVE_FILE, JSON.stringify(state));
}

/* ---------- SAVE FUNCTION ---------- */
function save() {
    fs.writeFileSync(SAVE_FILE, JSON.stringify(state));
}

/* ---------- BUILD LIVE STATE ---------- */
function buildSyncState() {
    let remain;

    if (state.paused) {
        remain = state.remaining;
    } else {
        remain = state.endTime - Date.now();
        if (remain < 0) remain = 0;
    }

    return {
        ...state,
        remaining: remain
    };
}

/* ---------- SOCKET ---------- */
io.on("connection", (socket) => {

    const isAdmin = socket.handshake.auth?.admin === ADMIN_KEY;
    console.log("Client connected:", socket.id, isAdmin ? "(ADMIN)" : "(VIEWER)");

    // send current state ONCE
    socket.emit("sync", buildSyncState());

    // helper: block viewers
    function denyIfNotAdmin(){
        if(!isAdmin){
            console.log("Blocked non-admin action:", socket.id);
            return true;
        }
        return false;
    }

    socket.on("pause", () => {
        if(denyIfNotAdmin()) return;

        if (!state.paused) {
            state.remaining = state.endTime - Date.now();
            if (state.remaining < 0) state.remaining = 0;
            state.paused = true;
        } else {
            state.endTime = Date.now() + state.remaining;
            state.paused = false;
        }
        save();
        io.emit("sync", buildSyncState());
    });

    socket.on("reset", () => {
        if(denyIfNotAdmin()) return;

        state.endTime = Date.now() + state.duration;
        state.paused = false;
        state.remaining = null;
        save();
        io.emit("sync", buildSyncState());
    });

    socket.on("playVideo", () => {
        if(denyIfNotAdmin()) return;

        state.video = true;
        save();
        io.emit("sync", buildSyncState());
    });

    socket.on("stopVideo", () => {
        if(denyIfNotAdmin()) return;

        state.video = false;
        save();
        io.emit("sync", buildSyncState());
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () =>
    console.log("SERVER RUNNING ON PORT", PORT)
);
