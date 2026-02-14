/* ================= ADMIN AUTH ================= */

const params = new URLSearchParams(location.search);
const isAdmin = params.get("admin") === "fest123";

const socket = io({
auth: { admin: params.get("admin") }
});

const clock = document.getElementById("clock");

/* ================= VIDEO ================= */

const videoLayer=document.getElementById("videoLayer");
const video=document.getElementById("video");
video.onended=()=>videoLayer.style.display="none";

/* ================= QR ================= */

const qrLayer = document.getElementById("qrLayer");
let qrVisible = false;
/* ================= REAL TIMER ENGINE ================= */

/*
This timer NEVER depends on browser running continuously.
It always calculates from server time.
*/

let serverRemaining = 0;
let syncMoment = 0;
let lastVideoState = false;
socket.on("sync", (state) => {
    ```
    /* event not started yet */
    if(state.notStarted){
        clock.textContent = "36:00:00";
        return;
    }

    /* store server remaining time */
    serverRemaining = state.remaining;
    syncMoment = Date.now();
    
    /* VIDEO CONTROL SAFE */
    if(state.video !== lastVideoState){
        lastVideoState = state.video;

        if(state.video){
            videoLayer.style.display = "flex";
            video.currentTime = 0;

            video.muted = false;
            video.play().catch(() => {
                video.muted = true;
                video.play();
            });
        } else {
            video.pause();
            videoLayer.style.display = "none";
        }
    }
        ```
});

function updateClock(){
    ```
    /* calculate live time from last sync */
    let live = serverRemaining - (Date.now() - syncMoment);

    if(live < 0) live = 0;
    let s=Math.floor(live/1000);
    let h=Math.floor(s/3600);
    let m=Math.floor((s%3600)/60);
    let sec=s%60;

    const text =
    String(h).padStart(2,"0") + ":" +
    String(m).padStart(2,"0") + ":" +
    String(sec).padStart(2,"0");

    clock.textContent = text;
    clock.styleAttribute("data-remaining", live);
    requestAnimationFrame(updateClock);
    ```
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
el.style.backgroundImage =
`url(${logos[Math.floor(Math.random() * logos.length)]})`;
layer.appendChild(el);
return el;
}

lanes.forEach((lane, laneIndex) => {
let x = -laneIndex * 120;

```
while (x < window.innerWidth + SLOT_WIDTH) {
    lane.slots.push({
        el: createLogo(),
        x: x
    });
    x += SLOT_WIDTH;
}
```});

function animate(time) {
const dt =(now - lastTime) / 1000;
lastTime = now;

```lanes.forEach((lane) => {
    lane.slots.forEach((slot) => {
        slot.x += SPEED * dt;
        slot.el.style.transform = `translateX(${slot.x}px)`;
    });
    if (lane.slots[0].x > window.innerWidth+SLOT_WIDTH) {
        const old = lane.slots.shift();
        old.el.remove();

        const lastX = lane.slots[lane.slots.length - 1].x;
        lane.slots.push({
            el: createLogo(),
            x: lastX - SLOT_WIDTH
        });
    }
});