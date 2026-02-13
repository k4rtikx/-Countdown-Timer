/* ================= TIMER ================= */
/* ================= TIMER ================= */

/* ---- ADMIN AUTH (added) ---- */
const params = new URLSearchParams(location.search);
const isAdmin = params.get("admin") === "fest123";

const socket = io({
    auth: { admin: params.get("admin") }
});

const DURATION = 36*60*60*1000;
let end = 0;

let paused=false;
let remain=DURATION;

let lastVideoState = false; // added

const clock=document.getElementById("clock");

/* ================= VIDEO (MOVED HERE) ================= */

const videoLayer=document.getElementById("videoLayer");
const video=document.getElementById("video");

video.onended=()=>videoLayer.style.display="none";

/* ================= QR OVERLAY (ADDED) ================= */
const qrLayer = document.getElementById("qrLayer");
let qrVisible = false;

/* start timer ONLY after sync */
socket.on("sync", (state) => {

    if(state.paused){
        end = Date.now() + state.remaining;
        paused = true;
    }else{
        end = state.endTime;
        paused = false;
    }

    /* ---- VIDEO CONTROL SAFE ---- */
    if(state.video !== lastVideoState){

        lastVideoState = state.video;

        if(state.video){
            videoLayer.style.display = "flex";
            video.currentTime = 0;

            // ===== AUTOPLAY FIX =====
            video.muted = false;
            video.play().catch(() => {
                console.log("Autoplay blocked — retrying muted");
                video.muted = true;
                video.play();
            });
            // ========================

        }else{
            video.pause();
            videoLayer.style.display = "none";
        }
    }

    if(!window.timerStarted){
        window.timerStarted = true;
        tick();
    }
});


function tick(){
    if(!paused){
        remain=end-Date.now();
        if(remain<0)remain=0;
    }

    let s=Math.floor(remain/1000);
    let h=Math.floor(s/3600);
    let m=Math.floor((s%3600)/60);
    let sec=s%60;

    clock.textContent=
        String(h).padStart(2,'0')+":"+
        String(m).padStart(2,'0')+":"+
        String(sec).padStart(2,'0');

    clock.setAttribute("data-time", clock.textContent);

    requestAnimationFrame(tick);
}



/* ================= LOGO FLOW ================= */

const logos=[
"assets/logos/1.png","assets/logos/2.png","assets/logos/3.png","assets/logos/4.png",
"assets/logos/5.png","assets/logos/6.png","assets/logos/7.png","assets/logos/8.png"
];

/* ================= SLOT-BASED NON-OVERLAPPING LOGOS ================= */

const layer = document.getElementById("logoLayer");

/* TUNING — CHANGE ONLY THESE */
const SPEED = 40;
const LANES = 12;
const GAP_Y = 70;
const START_Y = 120;
const SLOT_WIDTH = 300;

/* DATA */
let lanes = [];
let lastTime = performance.now();

/* INIT LANES */
for (let i = 0; i < LANES; i++) {
    lanes.push({
        y: START_Y + i * GAP_Y,
        slots: []
    });
}

/* CREATE LOGO ELEMENT */
function createLogo() {
    const el = document.createElement("div");
    el.className = "logo";
    el.style.backgroundImage =
        `url(${logos[Math.floor(Math.random() * logos.length)]})`;
    layer.appendChild(el);
    return el;
}

/* INITIAL FILL */
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

/* ANIMATION */
function animate(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    lanes.forEach(lane => {

        lane.slots.forEach(slot => {
            slot.x += SPEED * dt;
            slot.el.style.transform =
                `translate3d(${slot.x}px, ${lane.y}px, 0)`;
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

    if(e.key==="p") socket.emit("pause");
    if(e.key==="r") socket.emit("reset");
    if(e.key==="v") socket.emit("playVideo");
    if(e.key==="s") socket.emit("stopVideo");

    /* QR TOGGLE (ADDED) */
    if(e.key==="q"){
        qrVisible = !qrVisible;
        qrLayer.style.display = qrVisible ? "flex" : "none";
    }

    if(e.key==="f"){
        if(!document.fullscreenElement){
            document.documentElement.requestFullscreen();
        }else{
            document.exitFullscreen();
        }
    }
});
/* ===== TIMER OCCLUSION MASK ===== */

const mask = document.getElementById("timerMask");

function updateMask(){
    const rect = clock.getBoundingClientRect();

    const padX = 120;
    const padY = 70;

    mask.style.left = (rect.left - padX) + "px";
    mask.style.top = (rect.top - padY) + "px";
    mask.style.width = (rect.width + padX*2) + "px";
    mask.style.height = (rect.height + padY*2) + "px";
}

setInterval(updateMask, 100);
window.addEventListener("resize", updateMask);
