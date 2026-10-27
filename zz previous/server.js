/* ================= ADMIN KEY ================= */
const ADMIN_KEY = process.env.ADMIN_KEY || "fest123";

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

/* ===== REDIS (LAZY CONNECT) ===== */
let redis = null;

async function initRedis(){
    try{
        const { Redis } = require("@upstash/redis");
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        console.log("Redis connected");
    }catch(e){
        console.log("Redis unavailable, running without persistence");
    }
}

const app = express();
app.get("/health", (req,res)=>res.status(200).send("OK"));
app.use(express.static(path.join(__dirname, "fest-screen")));

const server = http.createServer(app);
const io = new Server(server);

/* ================= EVENT CONFIG ================= */

const DURATION = 31 * 60 * 60 * 1000;   // ← DAY 2 & 3 = 31 HOURS

let state = {
    video:false,
    videoFile:"vid.mp4",
    paused:false,
    remaining:null
};

/* ---------- REDIS START TIME ---------- */
async function getStart(){
    if(!redis) return null;
    try { return await redis.get("eventStart"); }
    catch { return null; }
}

async function setStart(ts){
    if(!redis) return;
    try { await redis.set("eventStart", ts); }
    catch {}
}

/* ---------- BUILD STATE ---------- */
async function buildSyncState(){

    const eventStart = await getStart();

    if(!eventStart){
        return { 
            notStarted:true,
            video:state.video,
            videoFile:state.videoFile,
            paused:state.paused
        };
    }

    let remaining;

    if(state.paused && state.remaining !== null){
        remaining = state.remaining;
    }else{
        const endTime = Number(eventStart) + DURATION;
        remaining = endTime - Date.now();
        if(remaining < 0) remaining = 0;
    }

    return {
        startTime:Number(eventStart),
        endTime:Number(eventStart)+DURATION,
        remaining,
        paused:state.paused,
        video:state.video,
        videoFile:state.videoFile
    };
}

/* ================= SOCKET ================= */

io.on("connection", async (socket)=>{

    const isAdmin = socket.handshake.auth?.admin === ADMIN_KEY;
    console.log("Connected:",socket.id,isAdmin?"ADMIN":"VIEW");

    socket.emit("sync",await buildSyncState());

    function deny(){ if(!isAdmin) return true; }

    /* START TIMER */
    socket.on("reset", async ()=>{
        if(deny()) return;

        const now = Date.now();
        state.paused=false;
        state.remaining=null;

        await setStart(now);
        console.log("EVENT STARTED:",new Date(now));

        io.emit("sync",await buildSyncState());
    });

    socket.on("forceSync", async ()=>{
        socket.emit("sync",await buildSyncState());
    });

    /* PLAY SPECIFIC VIDEO */
    socket.on("playVideo", async (file)=>{
        if(deny()) return;

        state.video=true;
        state.videoFile=file || "vid.mp4";

        console.log("PLAY VIDEO:",state.videoFile);
        io.emit("sync",await buildSyncState());
    });

    socket.on("stopVideo", async ()=>{
        if(deny()) return;
        state.video=false;
        io.emit("sync",await buildSyncState());
    });

    /* PAUSE TIMER */
    socket.on("togglePause", async ()=>{
        if(deny()) return;

        if(!state.paused){
            const sync=await buildSyncState();
            state.remaining=sync.remaining;
            state.paused=true;
            console.log("TIMER PAUSED");
        }else{
            const now=Date.now();
            await setStart(now-(DURATION-state.remaining));
            state.paused=false;
            state.remaining=null;
            console.log("TIMER RESUMED");
        }

        io.emit("sync",await buildSyncState());
    });
});

/* ================= START ================= */

const PORT = process.env.PORT || 3000;

server.listen(PORT,"0.0.0.0",async ()=>{
    console.log("SERVER RUNNING",PORT);
    initRedis();
});
