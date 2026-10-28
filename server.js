
/* =====================================================
   ALLIANCE UNIVERSITY FEST TIMER — FINAL SERVER
   Node.js + Express + Socket.IO + Upstash Redis
===================================================== */

"use strict";

const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

/* =====================================================
   CONFIGURATION
===================================================== */

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const ADMIN_KEY = process.env.ADMIN_KEY || "fest123";

const MODES = Object.freeze({
    day1: {
        label: "DAY 1",
        hours: 7
    },
    day23: {
        label: "DAY 2 & DAY 3",
        hours: 31
    }
});

const ALLOWED_VIDEOS = new Set([
    "vid.mp4",
    "vid1.mp4",
    "vid2.mp4"
]);

const ALLOWED_POPUPS = new Set([
    "director",
    "faculty",
    "both"
]);

const REDIS_KEYS = {
    mode: "fest:mode",
    eventStart: "fest:eventStart"
};

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/* =====================================================
   REDIS
   Uses Upstash Redis REST API.
   The timer can run without Redis, but state will not
   persist across server restarts in that case.
===================================================== */

async function redis(command) {
    if (!REDIS_URL || !REDIS_TOKEN) {
        return null;
    }

    try {
        const response = await fetch(REDIS_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${REDIS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(command),
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Redis HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.error) {
            throw new Error(result.error);
        }

        return result.result ?? null;
    } catch (error) {
        console.error("Redis error:", error.message);
        return null;
    }
}

/* =====================================================
   IN-MEMORY STATE
===================================================== */

const state = {
    mode: "day1",
    startTime: null,
    video: false,
    videoFile: "",
    popup: null
};

/* =====================================================
   PUBLIC STATE
   Shared with every connected display.
===================================================== */

function publicState() {
    const mode = MODES[state.mode];

    return {
        notStarted: state.startTime === null,
        startTime: state.startTime,
        serverNow: Date.now(),

        mode: state.mode,
        label: mode.label,
        duration: mode.hours * 60 * 60 * 1000,

        video: state.video,
        videoFile: state.videoFile,
        popup: state.popup
    };
}

/* =====================================================
   LOAD PERSISTED TIMER STATE
===================================================== */

async function loadState() {
    if (!REDIS_URL || !REDIS_TOKEN) {
        console.warn(
            "Redis credentials missing. Running without persistence."
        );
        return;
    }

    const [savedMode, savedStart] = await Promise.all([
        redis(["GET", REDIS_KEYS.mode]),
        redis(["GET", REDIS_KEYS.eventStart])
    ]);

    if (typeof savedMode === "string" && MODES[savedMode]) {
        state.mode = savedMode;
    }

    if (
        savedStart !== null &&
        savedStart !== undefined &&
        savedStart !== ""
    ) {
        const timestamp = Number(savedStart);

        if (Number.isSafeInteger(timestamp) && timestamp > 0) {
            state.startTime = timestamp;
        } else {
            console.warn("Ignoring invalid saved timer timestamp.");
        }
    }

    console.log("Timer state loaded:", {
        mode: state.mode,
        started: state.startTime !== null
    });
}

/* =====================================================
   EXPRESS + SOCKET.IO
===================================================== */

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    serveClient: true,
    cors: {
        origin: true
    }
});

/* Serve files from the public directory. */

app.use(express.static(path.join(__dirname, "fest-timer")));

/* Health check for hosting platforms. */

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "ok",
        service: "fest-timer"
    });
});

/* =====================================================
   BROADCAST
===================================================== */

function broadcast() {
    io.emit("sync", publicState());
}

/* =====================================================
   SOCKET CONNECTIONS
===================================================== */

io.on("connection", (socket) => {
    const isAdmin =
        typeof socket.handshake.auth?.admin === "string" &&
        socket.handshake.auth.admin === ADMIN_KEY;

    console.log(
        "Client connected:",
        socket.id,
        isAdmin ? "ADMIN" : "VIEWER"
    );

    socket.emit("role", {
        admin: isAdmin
    });

    socket.emit("sync", publicState());

    /* Request an updated state. */

    socket.on("forceSync", () => {
        socket.emit("sync", publicState());
    });

    /* =================================================
       START / RESET TIMER
       Starts the selected mode from its full duration.
    ================================================= */

    socket.on("reset", async () => {
        if (!isAdmin) {
            return;
        }

        const previousStart = state.startTime;
        const startTime = Date.now();

        state.startTime = startTime;

        const saved = await redis([
            "SET",
            REDIS_KEYS.eventStart,
            String(startTime)
        ]);

        /*
         * If Redis is configured but saving failed,
         * preserve the running timer in memory.
         */

        if (
            REDIS_URL &&
            REDIS_TOKEN &&
            saved === null
        ) {
            console.warn(
                "Timer started in memory; Redis persistence may have failed."
            );
        }

        console.log(
            "Timer started:",
            new Date(startTime).toISOString()
        );

        broadcast();
    });

    /* =================================================
       CHANGE TIMER MODE
       Switching modes resets the timer to not started.
    ================================================= */

    socket.on("setMode", async (mode) => {
        if (!isAdmin || !Object.hasOwn(MODES, mode)) {
            return;
        }

        const previousMode = state.mode;
        const previousStart = state.startTime;

        state.mode = mode;
        state.startTime = null;

        /*
         * Persist both operations. Redis failures do not
         * stop the in-memory timer from functioning.
         */

        await Promise.all([
            redis([
                "SET",
                REDIS_KEYS.mode,
                mode
            ]),
            redis([
                "DEL",
                REDIS_KEYS.eventStart
            ])
        ]);

        console.log("Timer mode changed:", mode);

        broadcast();
    });

    /* =================================================
       PLAY VIDEO
       Only approved video filenames are accepted.
    ================================================= */

    socket.on("playVideo", (file) => {
        if (!isAdmin || !ALLOWED_VIDEOS.has(file)) {
            return;
        }

        state.video = true;
        state.videoFile = file;
        state.popup = null;

        console.log("Playing video:", file);

        broadcast();
    });

    /* =================================================
       STOP VIDEO
    ================================================= */

    socket.on("stopVideo", () => {
        if (!isAdmin) {
            return;
        }

        state.video = false;

        console.log("Video stopped.");

        broadcast();
    });

    /* =================================================
       VIDEO ENDED
       Accept only the currently playing filename.
    ================================================= */

    socket.on("videoEnded", (file) => {
        if (
            state.video &&
            typeof file === "string" &&
            file === state.videoFile
        ) {
            state.video = false;

            console.log("Video ended:", file);

            broadcast();
        }
    });

    /* =================================================
       SHOW DIRECTOR / FACULTY POPUP
    ================================================= */

    socket.on("showPopup", (type) => {
        if (!isAdmin || !ALLOWED_POPUPS.has(type)) {
            return;
        }

        state.popup = type;

        console.log("Showing popup:", type);

        broadcast();
    });

    /* =================================================
       HIDE POPUP
    ================================================= */

    socket.on("hidePopup", () => {
        if (!isAdmin) {
            return;
        }

        state.popup = null;

        console.log("Popup hidden.");

        broadcast();
    });

    /* =================================================
       DISCONNECTION
    ================================================= */

    socket.on("disconnect", (reason) => {
        console.log(
            "Client disconnected:",
            socket.id,
            reason
        );
    });
});

/* =====================================================
   START SERVER AFTER LOADING REDIS STATE
===================================================== */

async function startServer() {
    await loadState();

    server.listen(PORT, HOST, () => {
        console.log("------------------------------------");
        console.log("Alliance University Fest Timer");
        console.log(`Server listening on port ${PORT}`);
        console.log(`Health endpoint: /health`);
        console.log(`Redis persistence: ${
            REDIS_URL && REDIS_TOKEN ? "configured" : "disabled"
        }`);
        console.log("------------------------------------");
    });
}

startServer().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
});

/* =====================================================
   GRACEFUL SHUTDOWN
===================================================== */

function shutdown(signal) {
    console.log(`${signal} received. Shutting down...`);

    io.close(() => {
        server.close(() => {
            process.exit(0);
        });
    });

    setTimeout(() => {
        process.exit(1);
    }, 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
