
"use strict";

/* =====================================================
   ALLIANCE UNIVERSITY FEST COUNTDOWN
   Shared timer + video + admin controls + popups
===================================================== */

/* ================= CONFIGURATION ================= */

const ADMIN_KEY_QUERY = "admin";

const DIRECTOR = {
    name: "", // Enter the director's actual name
    caption: "ALLIANCE UNIVERSITY"
};

const FACULTY = Array.from({ length: 12 }, (_, i) => ({
    name: `Faculty ${i + 1}`, // Replace with actual names
    role: "Faculty Member",   // Replace with actual designations
    img: `assets/logos/faculty/${i + 1}.jpg`
}));

// No sponsor companies - sponsors section is hidden
const SPONSORS = [];

const DAY_TEXT = {
    day1: "DAY 1",
    day23: "DAY 2 & DAY 3"
};

const VIDEO_PATH = "assets/videos/";

/* ================= ELEMENTS ================= */

const $ = (id) => document.getElementById(id);

const clock = $("clock");
const dayLabel = $("dayLabel");
const video = $("video");
const videoLayer = $("videoLayer");
const stage = $("stage");

if (!clock || !dayLabel || !video || !videoLayer || !stage) {
    throw new Error(
        "Required HTML elements are missing. Check index.html."
    );
}

/* ================= SOCKET CONNECTION ================= */

const params = new URLSearchParams(window.location.search);

const socket = io({
    auth: {
        admin: params.get(ADMIN_KEY_QUERY)
    }
});

let isAdmin = false;
let state = null;
let serverOffset = 0;

let lastVideo = false;
let lastVideoFile = "";
let videoRequestId = 0;

/* Admin authority comes from server.js, not the URL alone. */
socket.on("role", (role) => {
    isAdmin = Boolean(role && role.admin);
    console.log("Admin controls:", isAdmin ? "enabled" : "disabled");
});

socket.on("connect", () => {
    socket.emit("forceSync");
});

socket.on("connect_error", (error) => {
    console.error("Socket connection failed:", error.message);
});

/* ================= UNIVERSITY LOGO ================= */

const mainLogo = $("mainLogo");
const logoFallback = $("logoFallback");

if (mainLogo) {
    mainLogo.addEventListener("error", () => {
        mainLogo.style.display = "none";

        if (logoFallback) {
            logoFallback.hidden = false;
            logoFallback.style.display = "block";
        }
    });

    mainLogo.addEventListener("load", () => {
        mainLogo.style.display = "block";

        if (logoFallback) {
            logoFallback.hidden = true;
            logoFallback.style.display = "none";
        }
    });
}

/* ================= DIRECTOR PANEL ================= */

const directorImg = $("directorImg");
const directorName = $("directorName");
const directorCaption = $("directorCaption");

if (directorName) {
    directorName.textContent = DIRECTOR.name;
}

if (directorCaption) {
    directorCaption.textContent = DIRECTOR.caption;
}

if (directorImg) {
    directorImg.addEventListener("error", () => {
        directorImg.style.display = "none";
    });

    directorImg.addEventListener("load", () => {
        directorImg.style.display = "block";
    });
}

/* ================= FACULTY GRID ================= */

const facultyGrid = $("facultyGrid");

if (facultyGrid) {
    facultyGrid.replaceChildren();

    FACULTY.forEach((member) => {
        const card = document.createElement("div");
        card.className = "fac";

        const photo = document.createElement("div");
        photo.className = "photo";

        const img = document.createElement("img");
        img.src = member.img;
        img.alt = member.name;
        img.loading = "eager";

        img.addEventListener("error", () => {
            img.style.display = "none";
        });

        img.addEventListener("load", () => {
            img.style.display = "block";
        });

        const name = document.createElement("b");
        name.textContent = member.name;

        const role = document.createElement("span");
        role.textContent = member.role;

        photo.appendChild(img);
        card.append(photo, name, role);
        facultyGrid.appendChild(card);
    });
}

/* ================= SPONSOR GRID ================= */

const sponsorRow = $("sponsorRow");

if (sponsorRow) {
    sponsorRow.replaceChildren();

    SPONSORS.forEach((sponsor) => {
        const card = document.createElement("div");
        card.className = "sponsor";

        const img = document.createElement("img");
        img.src = sponsor.src;
        img.alt = sponsor.name;

        img.addEventListener("error", () => {
            const fallback = document.createElement("em");
            fallback.textContent = sponsor.name;

            card.replaceChildren(fallback);
        });

        card.appendChild(img);
        sponsorRow.appendChild(card);
    });
}

/* ================= RESPONSIVE STAGE ================= */

/*
   The stage uses a 1920 x 1080 design canvas.
   Its size is scaled to fit the current viewport.
*/

function fitStage() {
    const scale = Math.min(
        window.innerWidth / 1920,
        window.innerHeight / 1080
    );

    stage.style.setProperty("--stage-scale", String(scale));
    stage.style.transform =
        `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener("resize", fitStage);
fitStage();

/* ================= SHARED STATE ================= */

socket.on("sync", (serverState) => {
    if (!serverState || typeof serverState !== "object") {
        return;
    }

    state = serverState;

    /*
       Estimate clock offset from serverNow.
       This keeps countdown calculations aligned across screens.
    */
    if (Number.isFinite(serverState.serverNow)) {
        serverOffset = serverState.serverNow - Date.now();
    }

    dayLabel.textContent =
        DAY_TEXT[serverState.mode] ||
        serverState.label ||
        "DAY 1";

    /*
       A popup is shared across all connected screens.
       Only the admin can request changes through server.js.
    */
    document.body.dataset.popup =
        serverState.popup || "";

    updateVideo(serverState);
});

/* ================= SYNCHRONIZED VIDEO ================= */

async function updateVideo(serverState) {
    const shouldPlay = Boolean(serverState.video);
    const file = serverState.videoFile || "vid.mp4";

    if (
        shouldPlay === lastVideo &&
        file === lastVideoFile
    ) {
        return;
    }

    lastVideo = shouldPlay;
    lastVideoFile = file;

    const requestId = ++videoRequestId;

    if (!shouldPlay) {
        video.pause();
        document.body.classList.remove("video-mode");
        videoLayer.style.display = "none";
        return;
    }

    document.body.classList.add("video-mode");
    videoLayer.style.display = "flex";

    video.pause();
    video.src = VIDEO_PATH + file;
    video.currentTime = 0;

    /*
       Attempt audible playback first.
       If the browser blocks it, retry muted.
    */
    video.muted = false;

    try {
        await video.play();
    } catch (error) {
        if (requestId !== videoRequestId) return;

        video.muted = true;

        try {
            await video.play();
        } catch (retryError) {
            console.error(
                "Video playback failed:",
                retryError.message
            );
        }
    }
}

/*
   Do not locally hide the video when it ends.
   Notify the server and let its broadcast update every screen.
*/
video.addEventListener("ended", () => {
    if (state && state.video) {
        socket.emit("videoEnded", state.videoFile);
    }
});

/* ================= COUNTDOWN ENGINE ================= */

const pad = (number) => String(number).padStart(2, "0");

function renderClock() {
    if (state) {
        let remaining = Math.max(
            0,
            Number(state.duration) || 0
        );

        if (!state.notStarted && Number.isFinite(Number(state.startTime))) {
            const serverNow = Date.now() + serverOffset;
            const elapsed = serverNow - Number(state.startTime);

            remaining = Math.max(
                0,
                (Number(state.duration) || 0) - elapsed
            );
        }

        const totalSeconds = Math.floor(remaining / 1000);

        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        const formatted =
            `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

        clock.textContent = formatted;
        clock.setAttribute("data-time", formatted);
    }

    requestAnimationFrame(renderClock);
}

renderClock();

/* ================= SCROLLING LOGOS ================= */

/*
   Logos scroll right-to-left continuously in sequential order.
   Each logo appears one by one with no gaps or empty boxes.
*/

const logoLayer = $("logoLayer");

if (logoLayer) {
    // Sequential order — all logos shown in fixed cycle, no random
    const logoSources = [
        "assets/logos/82.png",
        "assets/logos/80.png",
        "assets/logos/1.png",
        "assets/logos/2.png",
        "assets/logos/3.png",
        "assets/logos/4.png",
        "assets/logos/5.png",
        "assets/logos/6.png",
        "assets/logos/7.png",
        "assets/logos/8.png",
        "assets/logos/9.png",
        "assets/logos/10.png",
        "assets/logos/11.png",
        "assets/logos/12.png",
        "assets/logos/13.png",
        "assets/logos/AO.png",
        "assets/logos/Ab.png"
    ];

    const logoSpeed  = 60;   // pixels per second
    const logoWidth  = 200;
    const logoHeight = 110;
    const gap        = 30;
    const slotWidth  = logoWidth + gap;

    let animId   = 0;
    let prevTime = 0;
    let slots    = [];
    let seqIndex = 0;
    let laneY    = 0;

    // Pick next image in sequential order, cycling endlessly
    function nextSrc() {
        const src = logoSources[seqIndex % logoSources.length];
        seqIndex++;
        return src;
    }

    // Build one logo card with a real <img> element
    function makeCard(src, x) {
        const card = document.createElement("div");
        Object.assign(card.style, {
            position:       "absolute",
            left:           "0",
            top:            `${laneY}px`,
            width:          `${logoWidth}px`,
            height:         `${logoHeight}px`,
            background:     "#ffffff",
            borderRadius:   "14px",
            boxShadow:      "0 3px 12px rgba(0,0,0,0.35), 0 0 0 1.5px rgba(246,196,69,0.45)",
            display:        "flex",
            justifyContent: "center",
            alignItems:     "center",
            pointerEvents:  "none",
            overflow:       "hidden",
            padding:        "8px 12px",
            boxSizing:      "border-box",
            transform:      `translate3d(${x}px, 0, 0)`
        });

        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        Object.assign(img.style, {
            maxWidth:  "100%",
            maxHeight: "100%",
            objectFit: "contain",
            display:   "block"
        });

        // Hide only the img if broken — card box stays white & solid
        img.addEventListener("error", () => {
            img.style.display = "none";
        });

        card.appendChild(img);
        logoLayer.appendChild(card);
        return card;
    }

    function setupLogoFlow() {
        cancelAnimationFrame(animId);
        logoLayer.replaceChildren();
        slots    = [];
        seqIndex = 0;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        laneY = Math.max(150, vh - 160);

        // Fill from just off left edge to just off right edge
        let x = -slotWidth;
        while (x < vw + slotWidth) {
            const card = makeCard(nextSrc(), x);
            slots.push({ card, x });
            x += slotWidth;
        }

        prevTime = performance.now();
        animId = requestAnimationFrame(tick);
    }

    function tick(now) {
        const dt = Math.min((now - prevTime) / 1000, 0.05);
        prevTime = now;

        const vw = window.innerWidth;

        for (const slot of slots) {
            slot.x += logoSpeed * dt;
            slot.card.style.transform = `translate3d(${slot.x}px, 0, 0)`;
        }

        // When the leftmost card scrolls off the right edge, recycle it
        const first = slots[0];
        if (first && first.x > vw + slotWidth) {
            first.card.remove();
            slots.shift();

            const last = slots[slots.length - 1];
            const newX = last ? last.x - slotWidth : -slotWidth;
            const card = makeCard(nextSrc(), newX);
            slots.push({ card, x: newX });
        }

        animId = requestAnimationFrame(tick);
    }

    window.addEventListener("resize", setupLogoFlow);
    setupLogoFlow();
}

/* ================= ADMIN KEYBOARD CONTROLS ================= */

/*
   Shift + R : Start/reset the current timer
   Shift + 1 : Switch to DAY 1
   Shift + 2 : Switch to DAY 2 & DAY 3
   V         : Play vid.mp4
   1         : Play vid1.mp4
   2         : Play vid2.mp4
   S         : Stop video
   D         : Toggle director panel
   M         : Toggle faculty panel
   H         : Hide popup
   F         : Toggle fullscreen (local screen)
*/

document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    // Avoid triggering shortcuts while typing in an input.
    const target = event.target;

    if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable
    ) {
        return;
    }

    if (key === "f") {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen()
                .catch((error) => {
                    console.error("Fullscreen failed:", error.message);
                });
        } else {
            document.exitFullscreen()
                .catch((error) => {
                    console.error("Exit fullscreen failed:", error.message);
                });
        }

        return;
    }

    if (!isAdmin) return;

    if (event.shiftKey && key === "r") {
        event.preventDefault();

        if (window.confirm("Start/reset the event timer?")) {
            socket.emit("reset");
        }

        return;
    }

    if (event.shiftKey && event.code === "Digit1") {
        event.preventDefault();

        if (window.confirm("Switch to DAY 1 and stop the timer?")) {
            socket.emit("setMode", "day1");
        }

        return;
    }

    if (event.shiftKey && event.code === "Digit2") {
        event.preventDefault();

        if (window.confirm("Switch to DAY 2 & DAY 3 and stop the timer?")) {
            socket.emit("setMode", "day23");
        }

        return;
    }

    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
        return;
    }

    switch (key) {
        case "v":
            socket.emit("playVideo", "vid.mp4");
            break;

        case "1":
            socket.emit("playVideo", "vid1.mp4");
            break;

        case "2":
            socket.emit("playVideo", "vid2.mp4");
            break;

        case "s":
            socket.emit("stopVideo");
            break;

        /*
           D — toggle BOTH director + faculty panels together.
           Press once → both appear. Press again → both hide.
        */
        case "d":
            socket.emit(
                state?.popup === "both" ? "hidePopup" : "showPopup",
                "both"
            );
            break;

        /* M — faculty only (optional separate control) */
        case "m":
            socket.emit(
                state?.popup === "faculty" ? "hidePopup" : "showPopup",
                "faculty"
            );
            break;

        case "h":
            socket.emit("hidePopup");
            break;
    }
});

/* ================= AUTOMATIC RESYNC ================= */

function resync() {
    if (socket.connected) {
        socket.emit("forceSync");
    }
}

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        resync();
    }
});

window.addEventListener("focus", resync);

setInterval(resync, 60000);

console.log("Alliance University Fest timer initialized.");
