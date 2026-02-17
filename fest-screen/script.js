/* ================= ADMIN AUTH ================= */

let startTime = null;
let synced = false; // IMPORTANT: prevents fake timer before sync

const params = new URLSearchParams(location.search);
const isAdmin = params.get("admin") === "fest123";

const socket = io({
auth: { admin: params.get("admin") }
});

const clock = document.getElementById("clock");
const dayLabel = document.getElementById("dayLabel");

/* ================= VIDEO ================= */

const videoLayer=document.getElementById("videoLayer");
const video=document.getElementById("video");

video.onended = () => {
    videoLayer.style.display = "none";
    socket.emit("stopVideo");
    document.body.classList.remove("video-mode");
};

/* ================= REAL TIMER ENGINE ================= */

let lastVideoState = false;

socket.on("sync", (state) => {

    /* event not started yet */
    if(state.notStarted){
        synced = true;
        startTime = null;
        clock.textContent = "07:00:00";
        if(dayLabel) dayLabel.textContent = "DAY 1";
        return;
    }

    synced = true;
    startTime = state.startTime;

    /* VIDEO CONTROL SAFE */
    if(state.video !== lastVideoState){

        lastVideoState = state.video;

        if(state.video){
            document.body.classList.add("video-mode");
        }else{
            document.body.classList.remove("video-mode");
        }

        if(state.video){
            videoLayer.style.display = "flex";
            video.currentTime = 0;

            video.muted = false;
            video.play().catch(() => {
                video.muted = true;
                video.play();
            });

        }else{
            video.pause();
            videoLayer.style.display = "none";
        }
    }
});

/* ================= CLOCK ================= */

function renderClock(){

    /* WAIT FOR SERVER — prevents wrong start numbers */
    if(!synced){
        requestAnimationFrame(renderClock);
        return;
    }

    let live = 0;

    if(startTime){

        const DAY1 = 7 * 60 * 60 * 1000;
        const DAY23 = 31 * 60 * 60 * 1000;
        const TOTAL = DAY1 + DAY23;

        const elapsed = Date.now() - startTime;
        live = TOTAL - elapsed;

        if(elapsed < DAY1){
            if(dayLabel) dayLabel.textContent = "DAY 1";
        }
        else if(elapsed < TOTAL){
            if(dayLabel) dayLabel.textContent = "DAY 2 & DAY 3";
        }
        else{
            if(dayLabel) dayLabel.textContent = "EVENT OVER";
            live = 0;
        }
    }

    if(live < 0) live = 0;

    let s=Math.floor(live/1000);
    let h=Math.floor(s/3600);
    let m=Math.floor((s%3600)/60);
    let sec=s%60;

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

const logos=[
"assets/logos/1.png","assets/logos/2.png","assets/logos/3.png","assets/logos/4.png",
"assets/logos/5.png","assets/logos/6.png","assets/logos/7.png","assets/logos/8.png"
];

const layer = document.getElementById("logoLayer");

const SPEED = 40;
const LANES = 12;
const GAP_Y = 70;
const START_Y = 120;
const SLOT_WIDTH = 300;

let lanes = [];
let lastTime = performance.now();

for (let i = 0; i < LANES; i++) {
lanes.push({
y: START_Y + i * GAP_Y,
slots: []
});
}

function createLogo() {
const el = document.createElement("div");
el.className = "logo";
el.style.backgroundImage =`url(${logos[Math.floor(Math.random() * logos.length)]})`;
layer.appendChild(el);
return el;
}

lanes.forEach((lane, laneIndex) => {
let x = -laneIndex * 120;

while (x < window.innerWidth + SLOT_WIDTH) {
    lane.slots.push({
        el: createLogo(),
        x: x
    });
    x += SLOT_WIDTH;
}
});

function animate(now) {
const dt = (now - lastTime) / 1000;
lastTime = now;

lanes.forEach(lane => {

    lane.slots.forEach(slot => {
        slot.x += SPEED * dt;
        slot.el.style.transform =`translate3d(${slot.x}px, ${lane.y}px, 0)`;
    });

    if (lane.slots[0].x > window.innerWidth + SLOT_WIDTH) {
        const old = lane.slots.shift();
        old.el.remove();

        const lastX = lane.slots[lane.slots.length - 1].x;
        lane.slots.push({
            el: createLogo(),
            x: lastX - SLOT_WIDTH
        });
    }
});

requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

/* ================= CONTROLS ================= */

document.addEventListener("keydown",(e)=>{

if(!isAdmin) return;

/* RESET SAFETY */
if(e.key==="R" && e.shiftKey){
    if(confirm("Start the event timer?")){
        socket.emit("reset");
    }
}

if(e.key==="v") socket.emit("playVideo");
if(e.key==="s") socket.emit("stopVideo");

if(e.key==="f"){
    if(!document.fullscreenElement){
        document.documentElement.requestFullscreen();
    }else{
        document.exitFullscreen();
    }
}
});

/* ===== TIMER MASK ===== */

const mask = document.getElementById("timerMask");

function updateMask(){
const rect = clock.getBoundingClientRect();

const padX = 28;
const padY = 18;

mask.style.left = (rect.left - padX) + "px";
mask.style.top = (rect.top - padY) + "px";
mask.style.width = (rect.width + padX*2) + "px";
mask.style.height = (rect.height + padY*2) + "px";
}

setInterval(updateMask, 100);
window.addEventListener("resize", updateMask);

/* ===== AUTO RESYNC AFTER SLEEP ===== */

function resync(){
socket.emit("forceSync");
}

document.addEventListener("visibilitychange", () => {
if (!document.hidden) resync();
});

window.addEventListener("focus", resync);
setInterval(resync, 60000);
