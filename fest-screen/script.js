/* ================= ADMIN AUTH ================= */

let startTime = null;
let synced = false;

const params = new URLSearchParams(location.search);
const isAdmin = params.get("admin") === "fest123";

const socket = io({
auth: { admin: params.get("admin") }
});

const clock = document.getElementById("clock");
const dayLabel = document.getElementById("dayLabel");

/* ================= VIDEO ================= */

const videoLayer = document.getElementById("videoLayer");
const video = document.getElementById("video");

video.onended = () => {
    videoLayer.style.display = "none";
    socket.emit("stopVideo");
    document.body.classList.remove("video-mode");
};

/* ================= REAL TIMER ENGINE ================= */

let lastVideoState = false;
let lastVideoFile = "";

socket.on("sync", (state) => {

    /* event not started */
    if(state.notStarted){
        synced = true;
        startTime = null;
        clock.textContent = "31:00:00";
        if(dayLabel) dayLabel.textContent = "DAY 2 & DAY 3";
        return;
    }

    synced = true;
    startTime = state.startTime;

    /* VIDEO CONTROL */
    if(state.video !== lastVideoState || state.videoFile !== lastVideoFile){

        lastVideoState = state.video;
        lastVideoFile = state.videoFile;

        if(state.video){
            document.body.classList.add("video-mode");
            videoLayer.style.display = "flex";

            video.src = "assets/videos/" + (state.videoFile || "vid.mp4");
            video.currentTime = 0;
            video.muted = false;

            video.play().catch(()=>{
                video.muted = true;
                video.play();
            });

        }else{
            document.body.classList.remove("video-mode");
            video.pause();
            videoLayer.style.display = "none";
        }
    }
});

/* ================= CLOCK ================= */

function renderClock(){

    if(!synced){
        requestAnimationFrame(renderClock);
        return;
    }

    const DURATION = 31 * 60 * 60 * 1000;

    let live = 0;

    if(startTime){
        const elapsed = Date.now() - startTime;
        live = DURATION - elapsed;

        if(dayLabel) dayLabel.textContent = "DAY 2 & DAY 3";

        if(live < 0) live = 0;
    }

    const s = Math.floor(live/1000);
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s%60;

    const text =
        String(h).padStart(2,'0')+":"+
        String(m).padStart(2,'0')+":"+
        String(sec).padStart(2,'0');

    clock.textContent = text;
    clock.setAttribute("data-time", text);

    requestAnimationFrame(renderClock);
}

renderClock();

/* ================= LOGO FLOW ================= */

const logos = [];
for(let i=1;i<=45;i++){
    logos.push(`assets/logos/${i}.png`);
}

const layer = document.getElementById("logoLayer");

const SPEED = 40;
const LANES = 16;
const GAP_Y = 70;
const START_Y = 220;
const SLOT_WIDTH = 240;

let lanes = [];
let lastTime = performance.now();

for (let i = 0; i < LANES; i++) {
    lanes.push({ y: START_Y + i * GAP_Y, slots: [] });
}

function createLogo() {
    const el = document.createElement("div");
    el.className = "logo";
    el.style.backgroundImage =
        `url(${logos[Math.floor(Math.random() * logos.length)]})`;
    layer.appendChild(el);
    return el;
}

lanes.forEach((lane, laneIndex) => {
    let x = -laneIndex * 120;

    while (x < window.innerWidth + SLOT_WIDTH) {
        lane.slots.push({ el: createLogo(), x: x });
        x += SLOT_WIDTH;
    }
});

function animate(now){
    const dt = (now - lastTime)/1000;
    lastTime = now;

    lanes.forEach(lane=>{
        lane.slots.forEach(slot=>{
            slot.x += SPEED*dt;
            slot.el.style.transform =
                `translate3d(${slot.x}px, ${lane.y}px, 0)`;
        });

        if(lane.slots[0].x > window.innerWidth + SLOT_WIDTH){
            const old = lane.slots.shift();
            old.el.remove();

            const lastX = lane.slots[lane.slots.length-1].x;
            lane.slots.push({ el:createLogo(), x:lastX - SLOT_WIDTH });
        }
    });

    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

/* ================= CONTROLS ================= */

document.addEventListener("keydown",(e)=>{
    if(!isAdmin) return;

    if(e.key==="R" && e.shiftKey){
        if(confirm("Start the event timer?")){
            socket.emit("reset");
        }
    }

    if(e.key==="v") socket.emit("playVideo","vid.mp4");
    if(e.key==="1") socket.emit("playVideo","vid1.mp4");
    if(e.key==="2") socket.emit("playVideo","vid2.mp4");
    if(e.key==="s") socket.emit("stopVideo");

    if(e.key==="f"){
        if(!document.fullscreenElement)
            document.documentElement.requestFullscreen();
        else
            document.exitFullscreen();
    }
});

/* ================= MASK TRACKING (FIXED) ================= */

const mask = document.getElementById("timerMask");
const dayMask = document.getElementById("dayMask");

function updateMasks(){

    if(clock){
        const rect = clock.getBoundingClientRect();
        mask.style.left = (rect.left - 10)+"px";
        mask.style.top = (rect.top - 4)+"px";
        mask.style.width = (rect.width + 20)+"px";
        mask.style.height = (rect.height + 8)+"px";
    }

    if(dayLabel){
        const rect = dayLabel.getBoundingClientRect();
        dayMask.style.left = (rect.left - 18)+"px";
        dayMask.style.top = (rect.top - 12)+"px";
        dayMask.style.width = (rect.width + 36)+"px";
        dayMask.style.height = (rect.height + 24)+"px";
    }
}

setInterval(updateMasks,100);
window.addEventListener("resize",updateMasks);

/* ================= AUTO RESYNC ================= */

function resync(){
    socket.emit("forceSync");
}

document.addEventListener("visibilitychange",()=>{
    if(!document.hidden) resync();
});

window.addEventListener("focus",resync);
setInterval(resync,60000);
