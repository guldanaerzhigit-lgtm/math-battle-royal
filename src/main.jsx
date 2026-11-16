import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, firebaseReady, onAuthStateChanged, signInAnonymously } from "./firebase";
import { makeQuestion } from "./questions";
import "./style.css";
import TeacherDashboard, { StudentJoin } from "./teacher";

const ROUND_SECONDS = 25;
const MAX_PLAYERS = 30;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const distance = (a, b) => Math.hypot((a.x || 50) - (b.x || 50), (a.y || 50) - (b.y || 50));
const codeChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 5 }, () => codeChars[Math.floor(Math.random() * codeChars.length)]).join("");
const names = ["Айдана", "Әлихан", "Дана", "Нұрсұлтан", "Аружан", "Ерасыл", "Мәдина", "Әли"];
const emojis = ["🧙", "🥷", "🚀", "🦸", "🧝", "🤖", "🎓", "🧚"];

function makePlayer(uid, name, team, index, count = 9) {
  const angle = index / Math.max(2, count) * Math.PI * 2;
  const radius = 19 + index % 3 * 4;
  return { uid, name: (name || "Ойыншы").trim().slice(0, 18), team, health: 3, score: 0, alive: true, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius, avatar: index % emojis.length, lastAnsweredRound: -1 };
}
function winnerOf(players, mode) {
  const live = Object.values(players || {}).filter(p => p.alive);
  if (mode === "team") {
    const teams = [...new Set(live.map(p => p.team).filter(Boolean))];
    if (teams.length > 1) return null;
    const champ = live.sort((a, b) => b.score - a.score)[0];
    return { winnerUid: champ ? champ.uid : null, winnerTeam: teams[0] || null };
  }
  return live.length <= 1 ? { winnerUid: live[0]?.uid || null, winnerTeam: null } : null;
}
function answerFor(playersInput, uid, value, question, round) {
  const players = { ...playersInput };
  const me = players[uid];
  if (!me || !me.alive || me.lastAnsweredRound === round) return { players, message: "Бұл раундта жауап бердіңіз." };
  if (Number(value) !== Number(question.a)) {
    const health = Math.max(0, me.health - 1);
    players[uid] = { ...me, health, alive: health > 0, lastAnsweredRound: round };
    return { players, message: health ? "Қате жауап. Бір өмір жоғалттыңыз." : "Өміріңіз бітті. Сіз ойыннан шықтыңыз." };
  }
  let updated = { ...me, score: me.score + 100, lastAnsweredRound: round };
  const target = Object.values(players).filter(p => p.alive && p.uid !== uid && !(me.team && p.team === me.team))
    .map(p => ({ ...p, gap: distance(me, p) })).filter(p => p.gap < 34).sort((a, b) => a.gap - b.gap)[0];
  let message = "Дұрыс! +100 XP";
  if (target) {
    const health = Math.max(0, target.health - 1);
    players[target.uid] = { ...target, health, alive: health > 0 };
    if (!health) { updated.score += 150; message += " · Қарсылас ойыннан шықты! +150 XP"; }
    else message += " · Қарсыласқа соққы берілді!";
  }
  players[uid] = updated;
  return { players, message };
}
function resolveRound(room) {
  const players = { ...room.players };
  const zoneRadius = Math.max(13, (room.zoneRadius || 44) - 3.6);
  Object.keys(players).forEach(id => {
    const p = players[id];
    if (!p.alive) return;
    let damage = p.lastAnsweredRound === room.round ? 0 : 1;
    if (Math.hypot(p.x - 50, p.y - 50) > zoneRadius) damage += 1;
    if (damage) { const health = Math.max(0, p.health - damage); players[id] = { ...p, health, alive: health > 0 }; }
  });
  const winner = winnerOf(players, room.mode);
  return { ...room, players, zoneRadius, status: winner ? "finished" : "intermission", winnerUid: winner?.winnerUid || null, winnerTeam: winner?.winnerTeam || null };
}

function Arena({ players, uid, zoneRadius, status }) {
  const canvasRef = useRef(null);
  const latest = useRef({ players, uid, zoneRadius, status });
  latest.current = { players, uid, zoneRadius, status };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    let width = 0, height = 0, raf = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas); window.addEventListener("resize", resize); resize();
    const draw = time => {
      const state = latest.current;
      ctx.clearRect(0, 0, width, height);
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, "#183554"); bg.addColorStop(1, "#10172d");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      ctx.save(); ctx.strokeStyle = "#87b8d51c"; ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
      for (let y = 0; y < height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      ctx.restore();
      const scale = Math.min(width * .43, height * .47);
      const cx = width / 2, cy = height / 2;
      ctx.save(); ctx.shadowColor = "#000b"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 14;
      ctx.fillStyle = "#203957"; ctx.beginPath(); ctx.ellipse(cx, cy + 10, scale * 1.03, scale * .82, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const island = ctx.createRadialGradient(cx - scale * .28, cy - scale * .35, 4, cx, cy, scale * 1.2);
      island.addColorStop(0, "#a6efad"); island.addColorStop(.55, "#54bd8b"); island.addColorStop(1, "#28766f");
      ctx.fillStyle = island; ctx.beginPath(); ctx.ellipse(cx, cy, scale, scale * .79, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#d1ffc1"; ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(cx, cy, scale * .94, scale * .73, 0, 0, Math.PI * 2); ctx.stroke();
      const radius = scale * ((state.zoneRadius || 44) / 44);
      ctx.save(); ctx.fillStyle = "rgba(255,70,100,.15)"; ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.arc(cx, cy, radius, 0, Math.PI * 2, true); ctx.fill("evenodd");
      ctx.strokeStyle = "#91efff"; ctx.shadowColor = "#55dfff"; ctx.shadowBlur = 15; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, radius, radius * .79, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      ctx.font = "25px system-ui"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      [["🌲", .17, .25], ["🌴", .83, .25], ["🌳", .78, .76], ["💎", .5, .47]].forEach(([e, x, y]) => ctx.fillText(e, cx + (x - .5) * scale * 1.65, cy + (y - .5) * scale * 1.3));
      const list = Object.values(state.players || {}).slice(0, MAX_PLAYERS);
      list.forEach((p, i) => {
        const x = cx + (p.x - 50) / 50 * scale * .88;
        const y = cy + (p.y - 50) / 50 * scale * .68 + (p.alive ? Math.sin(time / 220 + i) * 2 : 0);
        const mine = p.uid === state.uid;
        ctx.save(); ctx.translate(x, y); ctx.globalAlpha = p.alive ? 1 : .25;
        ctx.fillStyle = "#102b3dcc"; ctx.beginPath(); ctx.ellipse(0, 14, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
        if (mine) { ctx.strokeStyle = "#ffe17a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -2, 21, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = p.team === "red" ? "#e85e76" : p.team === "blue" ? "#48bff4" : ["#a17cff", "#f99c57", "#51d0ab", "#e67fbe"][i % 4];
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-10, -1, 20, 17, 6) : ctx.rect(-10, -1, 20, 17); ctx.fill();
        ctx.fillStyle = "#f2c8ac"; ctx.beginPath(); ctx.arc(0, -10, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = mine ? "#ffcf66" : "#cadde9"; ctx.beginPath(); ctx.arc(0, -14, 9, Math.PI, 0); ctx.lineTo(9, -8); ctx.lineTo(-9, -8); ctx.fill();
        ctx.fillStyle = "#14243c"; ctx.beginPath(); ctx.arc(-3, -10, 1.2, 0, 7); ctx.arc(3, -10, 1.2, 0, 7); ctx.fill();
        ctx.fillStyle = "#ff5778"; for (let j = 0; j < p.health; j++) { ctx.beginPath(); ctx.arc(-8 + j * 8, 25, 2.4, 0, 7); ctx.fill(); }
        const label = (p.name || "Ойыншы") + (mine ? " · СЕН" : "");
        ctx.font = "700 9px system-ui"; const tw = ctx.measureText(label).width;
        ctx.fillStyle = "#101a30e8"; ctx.fillRect(-tw / 2 - 5, -35, tw + 10, 14);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.fillText(label, 0, -27);
        if (!p.alive) { ctx.fillStyle = "#ff526d"; ctx.font = "900 23px system-ui"; ctx.fillText("×", 0, -3); }
        ctx.restore();
      });
      ctx.fillStyle = "#c9d8ec"; ctx.font = "800 10px system-ui"; ctx.textAlign = "left";
      ctx.fillText(state.status === "playing" ? "MATCH LIVE" : state.status === "finished" ? "MATCH FINISHED" : "ARENA", 14, 18);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} className="arena-canvas" aria-label="Анимация игровой арены" />;
}

function App() {
  const [uid, setUid] = useState("guest-" + Math.random().toString(36).slice(2, 9));
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [authError, setAuthError] = useState("");
  const [name, setName] = useState("Ойыншы");
  const [grade, setGrade] = useState("5");
  const [mode, setMode] = useState("solo");
  const [code, setCode] = useState(new URLSearchParams(window.location.search).get("room") || "");
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [demo, setDemo] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [seconds, setSeconds] = useState(ROUND_SECONDS);
  const [busy, setBusy] = useState(false);
  const roomRef = useRef(room);
  const demoRef = useRef(demo);
  const resolved = useRef("");
  const moveAt = useRef(0);
  roomRef.current = room; demoRef.current = demo;

  useEffect(() => {
    if (!firebaseReady) return undefined;
    let requested = false;
    return onAuthStateChanged(auth, user => {
      if (user) { setUid(user.uid); setAuthReady(true); setAuthError(""); }
      else if (!requested) {
        requested = true;
        signInAnonymously(auth).catch(error => { setAuthError(error.message); setAuthReady(false); });
      }
    });
  }, []);

  useEffect(() => {
    if (!roomCode || demo || !firebaseReady) return undefined;
    return onSnapshot(doc(db, "rooms", roomCode), snap => {
      setRoom(snap.exists() ? snap.data() : null);
      if (!snap.exists()) setFeedback("Бөлме табылмады немесе жабылды.");
    }, error => setFeedback("Байланыс қатесі: " + error.message));
  }, [roomCode, demo]);

  const players = useMemo(() => Object.values(room?.players || {}).sort((a, b) => b.score - a.score), [room]);
  const alive = players.filter(p => p.alive);
  const me = room?.players?.[uid];
  const host = room?.hostUid === uid;
  const online = Boolean(firebaseReady && !demo && roomCode && roomCode !== "DEMO");
  const answered = me?.lastAnsweredRound === room?.round;

  useEffect(() => {
    if (room?.status !== "playing" || !room?.roundStartedAt) { setSeconds(ROUND_SECONDS); return undefined; }
    const update = () => setSeconds(Math.max(0, Math.ceil((room.roundStartedAt + ROUND_SECONDS * 1000 - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 200);
    return () => clearInterval(timer);
  }, [room?.status, room?.round, room?.roundStartedAt]);

  const createRoom = useCallback(async () => {
    if (!firebaseReady || !authReady || !uid) throw new Error("Firebase авторизациясы дайын емес.");
    const id = makeCode();
    const player = makePlayer(uid, name, mode === "team" ? "blue" : null, 0, 1);
    await setDoc(doc(db, "rooms", id), { code: id, hostUid: uid, mode, grade, maxPlayers: MAX_PLAYERS, status: "lobby", round: -1, roundStartedAt: null, question: null, zoneRadius: 44, winnerUid: null, winnerTeam: null, createdAt: serverTimestamp(), players: { [uid]: player } });
    setDemo(false); setRoomCode(id); setRoom(null); setFeedback("");
  }, [authReady, grade, mode, name, uid]);

  const joinRoom = useCallback(async () => {
    if (!firebaseReady || !authReady || !uid) throw new Error("Firebase авторизациясы дайын емес.");
    const id = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{5}$/.test(id)) throw new Error("5 таңбалы бөлме кодын енгізіңіз.");
    await runTransaction(db, async tx => {
      const ref = doc(db, "rooms", id); const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Бөлме табылмады.");
      const data = snap.data(); const all = data.players || {};
      if (data.status !== "lobby" && !all[uid]) throw new Error("Матч басталып кетті.");
      if (!all[uid] && Object.keys(all).length >= (data.maxPlayers || MAX_PLAYERS)) throw new Error("Бөлме толып кетті.");
      const red = Object.values(all).filter(p => p.team === "red").length;
      const blue = Object.values(all).filter(p => p.team === "blue").length;
      const team = data.mode === "team" ? (blue <= red ? "blue" : "red") : null;
      const player = all[uid] || makePlayer(uid, name, team, Object.keys(all).length, Object.keys(all).length + 1);
      tx.update(ref, { players: { ...all, [uid]: player } });
    });
    setDemo(false); setRoomCode(id); setRoom(null); setFeedback("");
  }, [authReady, code, name, uid]);

  const autoJoined = useRef(false);
  useEffect(() => { const requestedRoom=new URLSearchParams(window.location.search).get("room"); if(requestedRoom&&authReady&&uid&&!autoJoined.current){autoJoined.current=true;setCode(requestedRoom.toUpperCase());setTimeout(()=>startAction(joinRoom),0);} },[authReady,uid,joinRoom]);

  const startRound = useCallback(async () => {
    if (!room || !host || busy) return;
    if (alive.length < 2) { setFeedback("Матч бастау үшін кемінде 2 ойыншы керек. Боттармен жаттығуды таңдаңыз."); return; }
    if (room.mode === "team" && new Set(alive.map(p => p.team).filter(Boolean)).size < 2) { setFeedback("Көк және қызыл командада да ойыншы болуы керек."); return; }
    const round = room.round + 1;
    setBusy(true);
    try {
      const question = makeQuestion(round, room.grade || grade);
      const patch = { status: "playing", round, question, roundStartedAt: Date.now() };
      if (demo) setRoom(current => ({ ...current, ...patch }));
      else await updateDoc(doc(db, "rooms", roomCode), patch);
      setFeedback(""); resolved.current = "";
    } catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }, [alive, busy, demo, grade, host, room, roomCode]);

  const submit = useCallback(async value => {
    const current = roomRef.current;
    const player = current?.players?.[uid];
    if (!current || current.status !== "playing" || !player?.alive || player.lastAnsweredRound === current.round || Date.now() > current.roundStartedAt + ROUND_SECONDS * 1000) return;
    setBusy(true);
    try {
      if (demoRef.current) {
        const result = answerFor(current.players, uid, value, current.question, current.round);
        setRoom(old => old?.round === current.round ? { ...old, players: result.players } : old);
        setFeedback(result.message);
      } else {
        const message = await runTransaction(db, async tx => {
          const ref = doc(db, "rooms", roomCode); const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error("Бөлме табылмады.");
          const data = snap.data();
          if (data.status !== "playing" || data.round !== current.round || Date.now() > data.roundStartedAt + ROUND_SECONDS * 1000 + 1500) throw new Error("Жауап беру уақыты аяқталды.");
          const result = answerFor(data.players || {}, uid, value, data.question, data.round);
          tx.update(ref, { players: result.players });
          return result.message;
        });
        setFeedback(message);
      }
    } catch (error) { setFeedback(error.message); }
    finally { setBusy(false); }
  }, [roomCode, uid]);

  const move = useCallback(async (dx, dy) => {
    if (Date.now() - moveAt.current < 100) return;
    moveAt.current = Date.now();
    const current = roomRef.current;
    const p = current?.players?.[uid];
    if (!current || current.status !== "playing" || !p?.alive) return;
    const x = clamp((p.x ?? 50) + dx, 5, 95);
    const y = clamp((p.y ?? 50) + dy, 5, 95);
    if (demoRef.current) setRoom(old => old?.round === current.round ? { ...old, players: { ...old.players, [uid]: { ...old.players[uid], x, y } } } : old);
    else {
      try { await updateDoc(doc(db, "rooms", roomCode), { ["players." + uid + ".x"]: x, ["players." + uid + ".y"]: y }); }
      catch (error) { setFeedback("Қозғалу қатесі: " + error.message); }
    }
  }, [roomCode, uid]);

  useEffect(() => {
    const onKey = event => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName)) return;
      const key = event.key.toLowerCase();
      const map = { arrowup: [0, -4], w: [0, -4], arrowdown: [0, 4], s: [0, 4], arrowleft: [-4, 0], a: [-4, 0], arrowright: [4, 0], d: [4, 0] };
      if (map[key]) { event.preventDefault(); move(map[key][0], map[key][1]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const finishRound = useCallback(async () => {
    const current = roomRef.current;
    if (!current || current.status !== "playing" || !host || Date.now() < current.roundStartedAt + ROUND_SECONDS * 1000) return;
    const key = roomCode + "-" + current.round;
    if (resolved.current === key) return;
    resolved.current = key;
    try {
      if (demoRef.current) setRoom(old => old?.status === "playing" && old.round === current.round ? resolveRound(old) : old);
      else await runTransaction(db, async tx => {
        const ref = doc(db, "rooms", roomCode); const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.status !== "playing" || data.round !== current.round || Date.now() < data.roundStartedAt + ROUND_SECONDS * 1000) return;
        const resolvedRoom = resolveRound(data);
        tx.update(ref, { players: resolvedRoom.players, zoneRadius: resolvedRoom.zoneRadius, status: resolvedRoom.status, winnerUid: resolvedRoom.winnerUid, winnerTeam: resolvedRoom.winnerTeam });
      });
    } catch (error) { setFeedback("Раундты аяқтау қатесі: " + error.message); resolved.current = ""; }
  }, [host, roomCode]);

  useEffect(() => { if (seconds === 0 && host && room?.status === "playing") finishRound(); }, [seconds, host, room?.status, finishRound]);

  useEffect(() => {
    if (!demo || room?.status !== "playing") return undefined;
    const timer = setInterval(() => {
      const current = roomRef.current;
      if (!current || current.status !== "playing") return;
      const elapsed = Date.now() - current.roundStartedAt;
      setRoom(old => {
        if (!old || old.status !== "playing" || old.round !== current.round) return old;
        const all = { ...old.players };
        Object.keys(all).filter(id => id.startsWith("bot-")).forEach((id, index) => {
          const bot = all[id]; if (!bot.alive) return;
          let x = bot.x, y = bot.y;
          const r = Math.hypot(x - 50, y - 50), a = Math.atan2(y - 50, x - 50);
          if (r > (old.zoneRadius || 44) - 5) { x -= Math.cos(a) * 2; y -= Math.sin(a) * 2; }
          else { x += (Math.random() - .5) * 2; y += (Math.random() - .5) * 2; }
          let next = { ...bot, x: clamp(x, 5, 95), y: clamp(y, 5, 95) };
          if (next.lastAnsweredRound !== old.round && elapsed > 3000 + index * 1250) {
            if (Math.random() < .76) {
              next = { ...next, score: next.score + 100, lastAnsweredRound: old.round };
              const target = Object.values(all).filter(p => p.alive && p.uid !== id && !(next.team && p.team === next.team)).map(p => ({ ...p, gap: distance(next, p) })).filter(p => p.gap < 24).sort((a, b) => a.gap - b.gap)[0];
              if (target) { const health = Math.max(0, target.health - 1); all[target.uid] = { ...target, health, alive: health > 0 }; }
            } else {
              const health = Math.max(0, next.health - 1);
              next = { ...next, health, alive: health > 0, lastAnsweredRound: old.round };
            }
          }
          all[id] = next;
        });
        return { ...old, players: all };
      });
    }, 450);
    return () => clearInterval(timer);
  }, [demo, room?.status, room?.round]);

  const practice = () => {
    const all = {};
    names.forEach((n, i) => { const team = mode === "team" ? (i % 2 ? "red" : "blue") : null; const p = makePlayer("bot-" + i, n, team, i); all[p.uid] = p; });
    const self = makePlayer(uid, name, mode === "team" ? "blue" : null, 8);
    all[uid] = self;
    setRoom({ code: "DEMO", hostUid: uid, mode, grade, status: "playing", round: 0, roundStartedAt: Date.now(), question: makeQuestion(0, grade), zoneRadius: 44, players: all, winnerUid: null, winnerTeam: null });
    setDemo(true); setRoomCode("DEMO"); setSeconds(ROUND_SECONDS); setFeedback(""); resolved.current = "";
  };

  const leave = useCallback(async () => {
    const current = roomRef.current;
    if (current && online && current.players?.[uid]) {
      try {
        await runTransaction(db, async tx => {
          const ref = doc(db, "rooms", roomCode); const snap = await tx.get(ref);
          if (!snap.exists()) return;
          const data = snap.data(), all = { ...(data.players || {}) };
          if (data.status === "lobby") delete all[uid];
          else if (all[uid]) all[uid] = { ...all[uid], alive: false, health: 0, left: true };
          const live = Object.values(all).filter(p => p.alive);
          const patch = { players: all, hostUid: data.hostUid === uid ? (live[0]?.uid || uid) : data.hostUid };
          if (data.status === "lobby" && !Object.keys(all).length) { tx.delete(ref); return; }
          if (data.status === "playing") {
            const winner = winnerOf(all, data.mode);
            if (winner) { patch.status = "finished"; patch.winnerUid = winner.winnerUid; patch.winnerTeam = winner.winnerTeam; }
          }
          tx.update(ref, patch);
        });
      } catch (error) { console.error("leave room", error); }
    }
    setRoom(null); setRoomCode(""); setDemo(false); setFeedback(""); resolved.current = "";
  }, [online, roomCode, uid]);

  const startAction = async fn => {
    if (!name.trim()) { setFeedback("Ойыншының атын жазыңыз."); return; }
    setBusy(true); setFeedback("");
    try { await fn(); } catch (error) { setFeedback(error.message || "Қате орын алды."); }
    finally { setBusy(false); }
  };
  const winner = room?.winnerUid ? room.players?.[room.winnerUid] : null;
  const copy = () => {
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(roomCode).then(() => setFeedback("Бөлме коды көшірілді.")).catch(() => setFeedback("Бөлме коды: " + roomCode));
    else setFeedback("Бөлме коды: " + roomCode);
  };

  return <div className="app">
    <header className="topbar"><div className="brand-mark">⚔</div><div className="brand-copy"><b>MATH BATTLE ROYALE</b><small>МАТЕМАТИКА АРЕНАСЫ · 5–9 СЫНЫП</small></div><a className="teacher-nav-link" href="/?teacher=1">МҰҒАЛІМ КАБИНЕТІ</a><span className="connection">{firebaseReady ? (authReady ? "ONLINE" : "CONNECTING") : "BOT PRACTICE"}</span></header>
    {!room ? <main className="home-layout">
      <section className="intro"><div className="eyebrow">✦ БІЛІМ ҮШІН КҮРЕС</div><h1>ЕСЕПТІ ШЕШ.<br/><em>АРЕНАДА ҚАЛ!</em></h1><p>Есепті дұрыс шығар, қарсыласыңа соққы бер, қауіпті аймақтан шықпа. Соңғы қалған ойыншы немесе команда жеңеді.</p><div className="feature-strip"><b>30 <small>ОЙЫНШЫ</small></b><b>3 ♥ <small>ӨМІР</small></b><b>25с <small>РАУНД</small></b></div><div className="mini-note">⚡ Дұрыс жауап — шабуыл. Қауіпсіз аймақ әр раундта кішірейеді.</div></section>
      <section className="join-card"><div className="card-kicker">ЖАҢА МАТЧ</div><h2>АРЕНАҒА ҚОСЫЛ</h2><label htmlFor="player-name">ОЙЫНШЫ АТЫ</label><input id="player-name" value={name} maxLength={18} onChange={e => setName(e.target.value)} placeholder="Атыңыз"/><div className="form-row"><div><label htmlFor="grade">СЫНЫП</label><select id="grade" value={grade} onChange={e => setGrade(e.target.value)}>{["5","6","7","8","9"].map(g => <option key={g} value={g}>{g}-сынып</option>)}</select></div><div><label>РЕЖИМ</label><div className="mode-switch"><button className={mode === "solo" ? "selected" : ""} onClick={() => setMode("solo")}>SOLO</button><button className={mode === "team" ? "selected" : ""} onClick={() => setMode("team")}>TEAM</button></div></div></div><button className="primary-button" disabled={busy || (firebaseReady && !authReady)} onClick={() => startAction(createRoom)}>＋ ЖАҢА БӨЛМЕ ҚҰРУ</button><div className="or-line">НЕМЕСЕ БӨЛМЕ КОДЫ</div><div className="code-row"><input value={code} maxLength={5} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABCDE" aria-label="Бөлме коды"/><button disabled={busy || (firebaseReady && !authReady)} onClick={() => startAction(joinRoom)}>КІРУ</button></div><button className="practice-button" onClick={practice}>🤖 БОТТАРМЕН ЖАТТЫҒУ</button>{authError && <p className="error-note">Firebase: {authError}</p>}{feedback && <p className="error-note">{feedback}</p>}<small className="helper-note">Жаттығу режимі Firebase-сыз да жұмыс істейді.</small></section>
    </main> : <main className="game-layout">
      <section className="arena-card"><div className="arena-topline"><div><span className="live-label">● {room.status === "playing" ? "MATCH LIVE" : room.status === "finished" ? "MATCH FINISHED" : room.status === "intermission" ? "ROUND OVER" : "LOBBY"}</span><h2>{demo ? "ЖАТТЫҒУ АРЕНАСЫ" : "АРЕНА · " + roomCode}</h2></div><button className="copy-button" onClick={copy}>▣ {roomCode}</button></div><Arena players={players} uid={uid} zoneRadius={room.zoneRadius || 44} status={room.status}/><div className="arena-stats"><b>👥 {players.length}/30 <small>ОЙЫНШЫ</small></b><b>🛡 {alive.length} <small>ТІРІ ҚАЛДЫ</small></b><b>◉ {Math.round(room.zoneRadius || 44)}% <small>АЙМАҚ</small></b></div>
      {room.status === "lobby" && <div className="lobby-banner"><div><b>Ойыншылар жиналуда</b><small>Кодты қатысушыларға жіберіңіз.</small></div>{host && <button className="primary-button" onClick={startRound} disabled={busy}>БИТВАНЫ БАСТАУ →</button>}</div>}
      {room.status === "intermission" && <div className="lobby-banner"><div><b>Раунд аяқталды</b><small>Аймақ кішірейді. Келесі раундқа дайындал.</small></div>{host && <button className="primary-button" onClick={startRound} disabled={busy}>КЕЛЕСІ РАУНД →</button>}</div>}
      {room.status === "playing" && <div className="controls-row"><div className="dpad"><button aria-label="Жоғары" onClick={() => move(0,-5)}>▲</button><div><button aria-label="Солға" onClick={() => move(-5,0)}>◀</button><button aria-label="Төмен" onClick={() => move(0,5)}>▼</button><button aria-label="Оңға" onClick={() => move(5,0)}>▶</button></div></div><small>ҚОЗҒАЛУ: WASD / ← ↑ ↓ →</small></div>}
      {room.status === "finished" && <div className="winner-banner"><span>🏆</span><div><b>{room.winnerTeam ? (room.winnerTeam === "blue" ? "КӨК" : "ҚЫЗЫЛ") + " КОМАНДА ЖЕҢДІ!" : winner?.name || "ЖЕҢІМПАЗ ЖОҚ"}</b><small>{winner?.score || 0} XP</small></div><button className="primary-button" onClick={leave}>ЖАҢА ОЙЫН</button></div>}
      </section>
      <aside className="side-card"><div className="round-bar"><div><small>РАУНД</small><b>{Math.max(1, (room.round ?? -1) + 1)}</b></div><div className={seconds <= 7 && room.status === "playing" ? "timer-pill urgent" : "timer-pill"}>◷ <b>{seconds}</b> сек</div></div>
      {room.status === "playing" && room.question ? <><div className="question-card"><div className="question-topic">{room.question.topic} · {room.grade}-СЫНЫП</div><h3>{room.question.q}</h3><div className="answer-grid">{room.question.opts.map((option, i) => <button key={String(option)} disabled={answered || busy || !me?.alive || seconds === 0} onClick={() => submit(option)}><span>{["A","B","C","D"][i]}</span>{option}</button>)}</div>{feedback && <p className="feedback-line">{feedback}</p>}{answered && <p className="answer-state">✓ ЖАУАП ҚАБЫЛДАНДЫ</p>}</div><div className="lives-row"><span>ӨМІР ҚОРЫ</span><b>{"♥ ".repeat(me?.health || 0)}<i>{"♡ ".repeat(3 - (me?.health || 0))}</i></b></div>{!me?.alive && <p className="eliminated-message">Өміріңіз бітті. Матчты тамашалай беріңіз.</p>}</> : room.status === "finished" ? <div className="champion-card"><div>👑</div><small>АРЕНА ЧЕМПИОНЫ</small><h3>{room.winnerTeam ? room.winnerTeam === "blue" ? "КӨК КОМАНДА" : "ҚЫЗЫЛ КОМАНДА" : winner?.name || "ЖЕҢІМПАЗ ЖОҚ"}</h3><b>🏆 {winner?.score || 0} XP</b><button className="primary-button" onClick={leave}>ЖАҢА МАТЧ</button></div> : <div className="waiting-card">⚔️<b>{room.status === "lobby" ? "Ойын басталуын күтіңіз" : "Келесі раундқа дайындал"}</b><small>{host ? "Бастау батырмасын басыңыз." : "Бөлме иесін күтіңіз."}</small></div>}
      <div className="leaderboard"><div className="leader-title">🏆 ТОП ОЙЫНШЫЛАР</div>{players.slice(0,8).map((p,i) => <div className={p.alive ? "leader-row" : "leader-row out"} key={p.uid}><b>{String(i+1).padStart(2,"0")}</b><span>{p.name}{p.uid === uid ? " · СЕН" : ""}</span><strong>{p.score} XP</strong></div>)}</div>{feedback && room.status !== "playing" && <p className="feedback-line">{feedback}</p>}<button className="leave-button" onClick={leave}>← БАСТЫ БЕТКЕ ОРАЛУ</button></aside>
    </main>}
    <footer><span>© 2026 MATH BATTLE ROYALE</span><span>THINK FAST · STAY ALIVE</span></footer>
  </div>;
}
const root = createRoot(document.getElementById("root"));
const params=new URLSearchParams(window.location.search);
if (window.location.pathname === "/teacher" || params.get("teacher") === "1") root.render(<TeacherDashboard />);
else if (params.get("student") === "1") root.render(<StudentJoin />);
else root.render(<App />);
