import React,{useEffect,useMemo,useState} from "react";
import{createRoot}from"react-dom/client";
import{doc,setDoc,updateDoc,onSnapshot,runTransaction,serverTimestamp}from"firebase/firestore";
import{auth,db,firebaseReady,signInAnonymously,onAuthStateChanged}from"./firebase";
import"./style.css";

const bank=[
 ["36 ÷ 4 + 7 = ?",16,[14,15,16,17],"Амалдар реті"],
 ["3/4 + 1/4 = ?",1,[1,2,3,4],"Жай бөлшектер"],
 ["−8 + 13 = ?",5,[4,5,6,7],"Бүтін сандар"],
 ["25%-ы 80-ге тең санды тап.",320,[200,240,300,320],"Пайыз"],
 ["7 × (12 − 8) = ?",28,[24,26,28,32],"Амалдар реті"],
 ["2,5 + 1,75 = ?",4.25,[3.25,4,4.25,4.5],"Ондық бөлшектер"],
 ["ЕКОЕ(4,6) = ?",12,[10,12,18,24],"Бөлінгіштік"],
 ["x + 17 = 29. x = ?",12,[10,11,12,13],"Теңдеу"],
 ["−6 − 9 = ?",-15,[-3,-12,-15,15],"Бүтін сандар"],
 ["Периметрі 28 см квадраттың қабырғасы?",7,[6,7,8,9],"Геометрия"]
];
const codegen=()=>Math.random().toString(36).slice(2,7).toUpperCase();
const seedPos=i=>({x:12+(i*23)%76,y:18+(i*31)%65});
const avatars=["🧙","🥷","🧑‍🚀","🦸","🧝","🤖","🧑‍🎓","🧚"];
const makePlayer=(uid,name,team,i)=>({uid,name,team,health:3,score:0,alive:true,x:seedPos(i).x,y:seedPos(i).y,avatar:avatars[i%avatars.length],lastAnsweredRound:-1});
function App(){
 const[uid,setUid]=useState("guest-"+Math.random().toString(36).slice(2,8));
 const[name,setName]=useState("Ойыншы"),[mode,setMode]=useState("solo"),[code,setCode]=useState(""),[roomCode,setRoomCode]=useState(""),[room,setRoom]=useState(null);
 const[round,setRound]=useState(0),[answer,setAnswer]=useState(false),[msg,setMsg]=useState(""),[seconds,setSeconds]=useState(25),[busy,setBusy]=useState(false);
 useEffect(()=>{if(firebaseReady){signInAnonymously(auth).catch(console.error);return onAuthStateChanged(auth,u=>u&&setUid(u.uid));}},[]);
 useEffect(()=>{if(!roomCode||!firebaseReady||roomCode==="DEMO")return onSnapshot(doc(db,"rooms",roomCode),s=>setRoom(s.exists()?s.data():null));},[roomCode]);
 const players=useMemo(()=>Object.values(room?.players||{}),[room]);
 const onlineRoom=firebaseReady&&roomCode!=="DEMO";
 const me=room?.players?.[uid],alive=players.filter(p=>p.alive),q=room?.question,isHost=room?.hostUid===uid;
 useEffect(()=>{if(room?.round!==undefined)setRound(room.round);},[room?.round]);
 useEffect(()=>{if(room?.status!=="playing")return;const started=room.roundStartedAt||Date.now();const tick=()=>setSeconds(Math.max(0,25-Math.floor((Date.now()-started)/1000)));tick();const t=setInterval(tick,250);return()=>clearInterval(t);},[room?.round,room?.status,room?.roundStartedAt]);
 useEffect(()=>{if(room?.status!=="playing"||!isHost||alive.length>1)return;updateDoc(doc(db,"rooms",roomCode),{status:"finished",championUid:alive[0]?.uid||null}).catch(console.error);},[room?.status,roomCode,isHost,alive.length]);
 async function create(){
  if(!firebaseReady){setMsg("Firebase кілттерін .env файлына енгізіңіз. Демо режимін қолданыңыз.");return;}
  setBusy(true);try{const c=codegen(),p=makePlayer(uid,name,mode==="team"?"blue":null,0);
   await setDoc(doc(db,"rooms",c),{code:c,hostUid:uid,mode,maxPlayers:30,status:"lobby",round:0,createdAt:serverTimestamp(),players:{[uid]:p}});
   setRoomCode(c);
  }catch(e){setMsg(e.message)}finally{setBusy(false)}
 }
 async function join(){
  if(!firebaseReady){setMsg("Онлайн ойын үшін Firebase баптаңыз.");return;}
  setBusy(true);try{const c=code.toUpperCase();await runTransaction(db,async tx=>{
   const ref=doc(db,"rooms",c),s=await tx.get(ref);if(!s.exists())throw Error("Бөлме табылмады");
   const r=s.data(),ps=r.players||{};if(r.status!=="lobby")throw Error("Ойын басталып кетті");
   if(!ps[uid]&&Object.keys(ps).length>=30)throw Error("Бөлме толы");
   const idx=Object.keys(ps).length,team=r.mode==="team"?(Object.values(ps).filter(p=>p.team==="blue").length<=Object.values(ps).filter(p=>p.team==="red").length?"blue":"red"):null;
   tx.update(ref,{[`players.${uid}`]:makePlayer(uid,name,team,idx)});
  });setRoomCode(c);}catch(e){setMsg(e.message)}finally{setBusy(false)}
 }
 async function startRound(nextRound=round){
  const item=bank[nextRound%bank.length],question={text:item[0],a:item[1],opts:item[2],topic:item[3]};
  const payload={status:"playing",round:nextRound,question,roundStartedAt:Date.now()};
  if(onlineRoom)await updateDoc(doc(db,"rooms",roomCode),payload);
  else setRoom(r=>({...r,...payload}));
  setRound(nextRound);setAnswer(false);setMsg("");
 }
 async function submit(v){
  if(answer||!q||!me?.alive||me.lastAnsweredRound===round)return;
  setAnswer(true);const ok=Number(v)===Number(q.a);
  setMsg(ok?"Дұрыс жауап! +100 ұпай":"Қате жауап. Бір өмір жоғалттыңыз.");
  if(firebaseReady){
   await runTransaction(db,async tx=>{const ref=doc(db,"rooms",roomCode),s=await tx.get(ref);if(!s.exists())return;
    const r=s.data(),p=r.players?.[uid];if(!p||!p.alive||p.lastAnsweredRound===r.round)return;
    const health=Math.max(0,p.health-(ok?0:1));
    tx.update(ref,{[`players.${uid}.health`]:health,[`players.${uid}.score`]:p.score+(ok?100:0),[`players.${uid}.alive`]:health>0,[`players.${uid}.lastAnsweredRound`]:r.round});
   });
  }else{
   const health=Math.max(0,me.health-(ok?0:1));
   setRoom(r=>({...r,players:{...r.players,[uid]:{...r.players[uid],health,score:r.players[uid].score+(ok?100:0),alive:health>0,lastAnsweredRound:round}}}));
  }
 }
 async function move(dx,dy){
  if(!me?.alive||room?.status!=="playing")return;
  const x=Math.max(4,Math.min(94,(me.x??50)+dx)),y=Math.max(8,Math.min(88,(me.y??50)+dy));
  if(firebaseReady)await updateDoc(doc(db,"rooms",roomCode),{[`players.${uid}.x`]:x,[`players.${uid}.y`]:y});
  else setRoom(r=>({...r,players:{...r.players,[uid]:{...r.players[uid],x,y}}}));
 }
 useEffect(()=>{
  const key=e=>{if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","w","a","s","d"].includes(e.key)){e.preventDefault();const k=e.key.toLowerCase();move(k==="a"||k==="arrowleft"?-4:k==="d"||k==="arrowright"?4:0,k==="w"||k==="arrowup"?-4:k==="s"||k==="arrowdown"?4:0);}};
  window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);
 },[me?.x,me?.y,me?.alive,room?.status,roomCode]);
 async function finishRound(){
  if(!isHost)return;
  if(firebaseReady){
   await runTransaction(db,async tx=>{const ref=doc(db,"rooms",roomCode),s=await tx.get(ref);if(!s.exists()||s.data().round!==round)return;
    const r=s.data(),ps={...r.players};Object.keys(ps).forEach(id=>{const p=ps[id];if(p.alive&&p.lastAnsweredRound!==round){const h=Math.max(0,p.health-1);ps[id]={...p,health:h,alive:h>0};}});
    const survivors=Object.values(ps).filter(p=>p.alive);
    tx.update(ref,{players:ps,status:survivors.length<=1?"finished":"intermission",championUid:survivors[0]?.uid||null});
   });
  }else{
   const ps={...room.players};Object.keys(ps).forEach(id=>{const p=ps[id];if(p.alive&&p.lastAnsweredRound!==round){const h=Math.max(0,p.health-1);ps[id]={...p,health:h,alive:h>0};}});
   const survivors=Object.values(ps).filter(p=>p.alive);setRoom(r=>({...r,players:ps,status:survivors.length<=1?"finished":"intermission",championUid:survivors[0]?.uid||null}));
  }
 }
 function demo(){
  const demoPlayers={};["Айдана","Алихан","Дана","Нұрсұлтан","Аружан","Ерасыл","Мәдина","Әли"].forEach((n,i)=>{const p=makePlayer("bot"+i,n,i%2?"red":"blue",i);demoPlayers[p.uid]=p;});
  const p=makePlayer(uid,name,null,8);demoPlayers[uid]=p;
  setRoom({hostUid:uid,mode:"solo",status:"playing",round:0,roundStartedAt:Date.now(),question:{text:bank[0][0],a:bank[0][1],opts:bank[0][2],topic:bank[0][3]},players:demoPlayers});
  setRoomCode("DEMO");setRound(0);setAnswer(false);setMsg("");
 }
 const champion=room?.championUid?room.players?.[room.championUid]:null;
 return <div className="app"><header><div className="logo">⚔️</div><div><b>MATH BATTLE ROYALE</b><small>АРЕНА ЗНАНИЙ · 5–6 СЫНЫП</small></div><span className="online">{firebaseReady?"● ONLINE":"● DEMO"}</span></header>
 {!room?<main className="hero"><section><label>⚡ БІЛІМ ҮШІН КҮРЕС</label><h1>ЕСЕПТІ ШЕШ.<br/><em>ТІРІ ҚАЛ.</em></h1><p>30 ойыншыға дейін. Үш өмір. Бір чемпион. Математикадан біліміңді дәлелде!</p><div className="stats"><b>30<small> ОЙЫНШЫ</small></b><b>3❤️<small> ӨМІР</small></b><b>25с<small> УАҚЫТ</small></b></div></section><section className="panel"><h2>⚔️ АРЕНАҒА ҚОСЫЛ</h2><label>ОЙЫНШЫ АТЫ</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Атыңыз"/><label>РЕЖИМ</label><div className="modes"><button className={mode==="solo"?"active":""} onClick={()=>setMode("solo")}>👤 SOLO</button><button className={mode==="team"?"active":""} onClick={()=>setMode("team")}>👥 TEAM</button></div><button className="primary" disabled={busy} onClick={create}>ЖАҢА БӨЛМЕ ҚҰРУ →</button><div className="or">НЕМЕСЕ КОДПЕН КІРУ</div><div className="join"><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ROOM CODE"/><button disabled={busy} onClick={join}>КІРУ</button></div><button className="demo" onClick={demo}>Демо ойынды сынау ↗</button>{msg&&<p className="msg">{msg}</p>}</section></main>:
 <main className="game">
  <section className="arena"><div className="arena-head"><div><small>{room.status==="playing"?"⚔️ MATCH LIVE":room.status==="finished"?"🏆 MATCH FINISHED":"🛡️ ARENA"}</small><h2>{roomCode} ARENA</h2></div><button onClick={()=>navigator.clipboard?.writeText(roomCode)}>КОПИЯ КОД</button></div>
   <div className="arena-scene"><div className="island-halo"/><div className="island-platform"><div className="platform-mark">MATH<br/>ZONE</div><span className="scenery tree-one">🌲</span><span className="scenery tree-two">🌴</span><span className="scenery tree-three">🌳</span><span className="crystal">💎</span>
    {players.map((p,i)=><div key={p.uid} className={`character ${p.alive?"":"eliminated"} ${p.uid===uid?"mine":""} ${p.team||""}`} style={{left:`${p.x??seedPos(i).x}%`,top:`${p.y??seedPos(i).y}%`}} title={p.name}><span className="char-shadow"/><span className="char-emoji">{p.avatar||avatars[i%avatars.length]}</span><span className="char-name">{p.name||"Ойыншы"}{p.uid===uid?" · СЕН":""}</span>{p.alive&&<span className="char-hearts">{"♥".repeat(p.health||0)}</span>} {!p.alive&&<span className="ko-mark">✖</span>}</div>)}
   </div><div className="zone-ring"/></div>
   <div className="arena-controls"><div className="move-pad"><button onClick={()=>move(0,-4)}>▲</button><div><button onClick={()=>move(-4,0)}>◀</button><button onClick={()=>move(0,4)}>▼</button><button onClick={()=>move(4,0)}>▶</button></div></div><p>ҚОЗҒАЛУ: WASD / ← ↑ ↓ →</p></div>
   <div className="counts">👥 {players.length}/30 ҚАТЫСУШЫ <span>🛡️ {alive.length} ТІРІ ҚАЛДЫ</span></div>
   {room.status==="lobby"&&<div className="lobby"><h3>Ойыншылар жиналуда</h3><p>Бөлме кодын достарыңа жібер. Мұғалім ойынды бастай алады.</p><button className="primary" onClick={()=>startRound(0)}>▶ БИТВАНЫ БАСТАУ</button></div>}
   {room.status==="intermission"&&isHost&&<button className="primary next-round" onClick={()=>startRound(round+1)}>КЕЛЕСІ РАУНД →</button>}
  </section>
  <aside className="panel"><div className="round">РАУНД {(room.round??round)+1}<b>⏱ {seconds}с</b></div>
   {room.status==="finished"?<div className="champion-card"><div className="crown">👑</div><small>АРЕНА ЧЕМПИОНЫ</small><h2>{champion?.name||"Жеңімпаз анықталмады"}</h2><p>🏆 {champion?.score||0} XP</p><button className="primary" onClick={()=>{setRoom(null);setRoomCode("");setMsg("");}}>ЖАҢА ОЙЫН</button></div>:
   q&&room.status==="playing"?<><div className="question"><small>{q.topic}</small><h2>{q.text}</h2><div className="answers">{q.opts.map(v=><button key={v} disabled={answer||!me?.alive} onClick={()=>submit(v)}>{v}</button>)}</div>{msg&&<p className="msg">{msg}</p>}</div><p className="health">❤️ ӨМІР <b>{"❤️".repeat(me?.health??3)}{"🖤".repeat(3-(me?.health??3))}</b></p>{seconds===0&&isHost&&<button className="primary" onClick={finishRound}>РАУНДТЫ АЯҚТАУ →</button>}</>:
   <div className="waiting"><div>🧮</div><h3>Келесі шайқасқа дайындал</h3><p>Мұғалім келесі раундты бастағанша күте тұр.</p></div>}
   <h3 className="leader-title">🏆 ТОП ОЙЫНШЫЛАР</h3>{[...players].sort((a,b)=>b.score-a.score).slice(0,8).map((p,i)=><div className={`rank ${p.alive?"":"rank-out"}`} key={p.uid}><b>{i+1}</b><span>{p.name||"Ойыншы"}{!p.alive?" · OUT":""}</span><strong>{p.score} XP</strong></div>)}
   {!me?.alive&&room.status==="playing"&&<p className="eliminated-note">Сен ойыннан шықтың. Матчты тамашалай бер!</p>}
   <button className="back" onClick={()=>{setRoom(null);setRoomCode("");setMsg("");}}>← БАСТЫ БЕТ</button>
  </aside>
 </main>}
 <footer>© 2026 MATH BATTLE ROYALE <span>LEARN · THINK · SURVIVE</span></footer></div>
}
createRoot(document.getElementById("root")).render(<App/>);
