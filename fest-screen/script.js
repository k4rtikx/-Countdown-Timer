/* ================= ADMIN AUTH ================= */

let serverOffset = 0;
let currentPaused = false;

const params = new URLSearchParams(location.search);
const isAdmin = params.get("admin") === "fest123";

const socket = io({
auth: { admin: params.get("admin") }
});

const clock = document.getElementById("clock");

/* ================= VIDEO ================= */

const videoLayer=document.getElementById("videoLayer");
const video=document.getElementById("video");

video.onended = () => {
    videoLayer.style.display = "none";
    socket.emit("stopVideo");
    document.body.classList.remove("video-mode");
};

/* ================= REAL TIMER ENGINE ================= */

let serverRemaining = 0;
let syncMoment = 0;
let lastVideoState = false;

socket.on("sync", (state) => {

/* event not started yet */
if(state.notStarted){
    clock.textContent = "09:00:00";
    return;
}

currentPaused = state.paused === true;

/* ===== FIXED REAL TIME SYNC ===== */
serverOffset = Date.now() - (state.endTime - state.remaining);
serverRemaining = state.remaining;
syncMoment = Date.now();

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

function renderClock(){

let live;

if(currentPaused){
    live = serverRemaining;
}else{
    const serverNow = Date.now() - serverOffset;
    live = (syncMoment + serverRemaining) - serverNow;
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
    if(confirm("Reset the 36 hour event?")){
        socket.emit("reset");
    }
}

if(e.key==="v") socket.emit("playVideo");
if(e.key==="s") socket.emit("stopVideo");

/* PAUSE / RESUME */
if(e.key==="p") socket.emit("togglePause");

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
