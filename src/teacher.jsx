import React, { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, firebaseReady, onAuthStateChanged, signInAnonymously } from "./firebase";
import { StudentAssignments, TeacherLearningHub } from "./learning-hub";

const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode=(n=6)=>Array.from({length:n},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join("");
const makePlayer=(uid,name)=>({uid,name,team:null,health:3,score:0,alive:true,x:50,y:50,avatar:0,lastAnsweredRound:-1});

export function StudentJoin(){
 const [uid,setUid]=useState(auth?.currentUser?.uid||"");const [ready,setReady]=useState(Boolean(auth?.currentUser));
 const [name,setName]=useState("");const [code,setCode]=useState(new URLSearchParams(window.location.search).get("code")||"");const [joined,setJoined]=useState(null);const [pub,setPub]=useState(null);const [error,setError]=useState("");const [activeRoom,setActiveRoom]=useState(null);const [message,setMessage]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!firebaseReady||!auth){setError("Firebase баптаулары орнатылмаған.");return;}let requested=false;return onAuthStateChanged(auth,user=>{if(user){setUid(user.uid);setReady(true);}else if(!requested){requested=true;signInAnonymously(auth).catch(e=>setError(e.message));}});},[]);
 useEffect(()=>{if(!joined)return;return onSnapshot(doc(db,"classPublic",joined.code),s=>setPub(s.exists()?s.data():null),e=>setError(e.message));},[joined]);
 async function join(e){e.preventDefault();if(!name.trim()){setError("Атыңызды енгізіңіз.");return;}if(!/^[A-Z0-9]{6}$/.test(code)){setError("6 таңбалы кодты енгізіңіз.");return;}setBusy(true);setError("");try{const c=await getDoc(doc(db,"classCodes",code));if(!c.exists())throw new Error("Сынып коды табылмады.");const d=c.data();await setDoc(doc(db,"teachers",d.teacherUid,"classes",d.classId,"students",uid),{uid,name:name.trim().slice(0,60),joinCode:code,joinedAt:serverTimestamp()},{merge:true});setJoined({code,className:d.className,grade:d.grade});setMessage("Сыныпқа сәтті қосылдыңыз!");}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <div className="teacher-page"><header className="teacher-header"><a className="teacher-brand" href="/">⚔ <span>MATH BATTLE ROYALE<small>STUDENT SPACE</small></span></a><a className="teacher-back" href="/">← Ойынға оралу</a></header><main className="teacher-main"><section className="teacher-welcome"><div className="teacher-eyebrow">ОҚУШЫҒА АРНАЛҒАН БӨЛІМ</div><h1>Сыныпқа қосылу</h1><p>Мұғалім берген кодты енгізіп, сыныпқа тіркеліңіз.</p></section>{!joined?<section className="teacher-panel student-join-panel"><form className="student-join-form" onSubmit={join}><label>Аты-жөніңіз<input value={name} onChange={e=>setName(e.target.value)} placeholder="Аты-жөніңіз" maxLength={60}/></label><label>Сынып коды<input className="student-code-input" value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6))} placeholder="A2B3C4" maxLength={6}/></label><button disabled={busy||!ready}>{busy?"Қосылуда...":"СЫНЫПҚА ҚОСЫЛУ →"}</button></form></section>:<section className="teacher-panel"><div className="teacher-panel-title"><div><small>СІЗДІҢ СЫНЫБЫҢЫЗ</small><h2>{joined.className}</h2></div><span>{joined.grade}-сынып</span></div><p className="teacher-hint">Сыныпқа тіркелдіңіз. Турнир басталғанда қосылу батырмасы шығады.</p>{pub?.activeRoomCode?<a className="student-tournament-link" href={"/?room="+pub.activeRoomCode}>⚔ ТУРНИРГЕ ҚОСЫЛУ · {pub.activeRoomCode}</a>:<div className="teacher-empty">Мұғалім турнирді әлі бастаған жоқ.</div>}</section>}{joined&&<StudentAssignments joinCode={joined.code} uid={uid} studentName={name}/>}{(message||error)&&<div className={error?"teacher-message error":"teacher-message"}>{error||message}</div>}</main></div>;
}


export default function TeacherDashboard() {
  const [uid,setUid]=useState(auth?.currentUser?.uid||"");
  const [ready,setReady]=useState(Boolean(auth?.currentUser));
  const [classes,setClasses]=useState([]);
  const [selectedId,setSelectedId]=useState("");
  const [students,setStudents]=useState([]);
  const [activeRoom,setActiveRoom]=useState(null);
  const [className,setClassName]=useState("");
  const [grade,setGrade]=useState("5");
  const [studentName,setStudentName]=useState("");
  const [studentSearch,setStudentSearch]=useState("");
  const [editingName,setEditingName]=useState("");
  const [editingGrade,setEditingGrade]=useState("5");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [crossCode,setCrossCode]=useState("");
  const [crossTitle,setCrossTitle]=useState("");

  useEffect(()=>{
    if(!firebaseReady||!auth){setError("Firebase баптауларын тексеріңіз.");return;}
    let requested=false;
    return onAuthStateChanged(auth,user=>{
      if(user){setUid(user.uid);setReady(true);}
      else if(!requested){requested=true;signInAnonymously(auth).catch(e=>setError("Кіру қатесі: "+e.message));}
    });
  },[]);
  useEffect(()=>{
    if(!uid||!db)return;
    return onSnapshot(collection(db,"teachers",uid,"classes"),snap=>{
      const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      setClasses(rows);setSelectedId(current=>current&&rows.some(x=>x.id===current)?current:(rows[0]?.id||""));
    },e=>setError("Сыныптарды жүктеу қатесі: "+e.message));
  },[uid]);
  useEffect(()=>{
    if(!uid||!selectedId||!db){setStudents([]);return;}
    return onSnapshot(collection(db,"teachers",uid,"classes",selectedId,"students"),snap=>setStudents(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.name||"").localeCompare(b.name||"","kk"))),e=>setError("Оқушылар тізіміндегі қате: "+e.message));
  },[uid,selectedId]);
  const selected=useMemo(()=>classes.find(x=>x.id===selectedId)||null,[classes,selectedId]);
  useEffect(()=>{setEditingName(selected?.name||"");setEditingGrade(selected?.grade||"5");},[selectedId,selected?.name,selected?.grade]);
  const visibleStudents=useMemo(()=>students.filter(s=>(s.name||"").toLocaleLowerCase("kk").includes(studentSearch.trim().toLocaleLowerCase("kk"))),[students,studentSearch]);
  const roomPlayers=useMemo(()=>Object.values(activeRoom?.players||{}).sort((a,b)=>(b.score||0)-(a.score||0)),[activeRoom]);
  const averageScore=roomPlayers.length?Math.round(roomPlayers.reduce((n,p)=>n+(p.score||0),0)/roomPlayers.length):0;
  useEffect(()=>{
    if(!selected?.activeRoomCode||!db){setActiveRoom(null);return;}
    return onSnapshot(doc(db,"rooms",selected.activeRoomCode),snap=>setActiveRoom(snap.exists()?snap.data():null),e=>setError("Турнир нәтижесін жүктеу қатесі: "+e.message));
  },[selected?.activeRoomCode]);


  async function createClass(e){
    e.preventDefault();if(!className.trim()||!uid)return;setBusy(true);setError("");setMessage("");
    try{const joinCode=makeCode();const ref=doc(collection(db,"teachers",uid,"classes"));const classData={name:className.trim().slice(0,50),grade,teacherUid:uid,joinCode,createdAt:serverTimestamp()};await setDoc(ref,classData);await setDoc(doc(db,"classCodes",joinCode),{teacherUid:uid,classId:ref.id,className:classData.name,grade});await setDoc(doc(db,"classPublic",joinCode),{teacherUid:uid,classId:ref.id,className:classData.name,grade,activeRoomCode:null});setClassName("");setSelectedId(ref.id);setMessage("Сынып құрылды. Кодты оқушыларға жіберіңіз.");}
    catch(err){setError("Сынып құру қатесі: "+err.message);}finally{setBusy(false);}
  }
  async function saveClassDetails(e){
    e.preventDefault();if(!selected||!editingName.trim())return;setBusy(true);setError("");setMessage("");
    const name=editingName.trim().slice(0,50),nextGrade=editingGrade;
    try{await updateDoc(doc(db,"teachers",uid,"classes",selected.id),{name,grade:nextGrade});await updateDoc(doc(db,"classCodes",selected.joinCode),{className:name,grade:nextGrade});await updateDoc(doc(db,"classPublic",selected.joinCode),{className:name,grade:nextGrade});setMessage("Сынып ақпараты жаңартылды.");}
    catch(err){setError("Сыныпты жаңарту қатесі: "+err.message);}finally{setBusy(false);}
  }
  function exportClassCsv(){
    if(!selected)return;const scores=new Map(roomPlayers.map(p=>[p.uid,p.score||0]));
    const rows=[["Оқушы","Сынып","Турнир ұпайы"],...students.map(st=>[st.name||"",selected.grade+"-сынып",scores.has(st.uid)?scores.get(st.uid):"—"])];
    const csv="\uFEFF"+rows.map(row=>row.map(v=>"\""+String(v).replace(/"/g,"\"\"")+"\"").join(";")).join("\r\n");
    const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8;"}));const a=document.createElement("a");a.href=url;a.download=(selected.name||"class").replace(/[^a-zа-я0-9_-]/gi,"_")+"_report.csv";a.click();URL.revokeObjectURL(url);setMessage("Сынып есебі CSV форматында жүктелді.");
  }

  async function addStudent(e){
    e.preventDefault();if(!studentName.trim()||!selected)return;setBusy(true);setError("");setMessage("");
    try{await addDoc(collection(db,"teachers",uid,"classes",selected.id,"students"),{name:studentName.trim().slice(0,60),createdAt:serverTimestamp(),manual:true});setStudentName("");setMessage("Оқушы қосылды.");}
    catch(err){setError("Оқушыны қосу қатесі: "+err.message);}finally{setBusy(false);}
  }
  async function removeStudent(id){
    if(!selected)return;
    try{await deleteDoc(doc(db,"teachers",uid,"classes",selected.id,"students",id));setMessage("Оқушы өшірілді.");}
    catch(err){setError("Өшіру қатесі: "+err.message);}
  }
  async function startTournament(){if(!selected||!uid||busy)return;if(!students.length){setError("Алдымен оқушыларды сыныпқа қосыңыз.");return;}setBusy(true);setError("");try{const roomCode=makeCode(5);const tournamentCode=makeCode(6);const players={[uid]:makePlayer(uid,"Мұғалім")};await setDoc(doc(db,"rooms",roomCode),{code:roomCode,hostUid:uid,mode:"solo",grade:selected.grade,maxPlayers:30,status:"lobby",round:-1,roundStartedAt:null,question:null,zoneRadius:44,winnerUid:null,winnerTeam:null,createdAt:serverTimestamp(),classId:selected.id,tournament:true,tournamentScope:"interclass",players});await setDoc(doc(db,"tournaments",tournamentCode),{code:tournamentCode,title:(crossTitle.trim()||selected.name+" — сыныпаралық турнир").slice(0,90),hostUid:uid,roomCode,classId:selected.id,joinCode:selected.joinCode,grade:selected.grade,status:"open",createdAt:serverTimestamp()});await setDoc(doc(db,"tournaments",tournamentCode,"participants",selected.joinCode),{teacherUid:uid,classId:selected.id,classCode:selected.joinCode,className:selected.name,joinedAt:serverTimestamp()});await updateDoc(doc(db,"teachers",uid,"classes",selected.id),{activeRoomCode:roomCode,tournamentStartedAt:serverTimestamp()});await updateDoc(doc(db,"classPublic",selected.joinCode),{activeRoomCode:roomCode});setMessage("Сыныпаралық турнир құрылды. Турнир коды: "+tournamentCode+" · Ойын коды: "+roomCode);setCrossCode(tournamentCode);}catch(e){setError("Турнир құру қатесі: "+e.message);}finally{setBusy(false);}}
  async function joinInterclassTournament(e){e.preventDefault();if(!selected||!uid||!crossCode.trim())return;setBusy(true);setError("");try{const codeValue=crossCode.trim().toUpperCase();const ref=doc(db,"tournaments",codeValue);const snap=await getDoc(ref);if(!snap.exists()||snap.data().status!=="open")throw new Error("Турнир коды табылмады немесе жабық.");await setDoc(doc(db,"tournaments",codeValue,"participants",selected.joinCode),{teacherUid:uid,classId:selected.id,classCode:selected.joinCode,className:selected.name,joinedAt:serverTimestamp()});setMessage("Сынып турнирге қосылды. Ойын коды: "+snap.data().roomCode);}catch(e){setError("Турнирге қосылу қатесі: "+e.message);}finally{setBusy(false);}}
  async function removeClass(){
    if(!selected||!window.confirm("Сыныпты жоясыз ба?"))return;
    if(students.length){setError("Алдымен оқушыларды тізімнен өшіріңіз.");return;}
    setBusy(true);try{await deleteDoc(doc(db,"teachers",uid,"classes",selected.id));setMessage("Сынып жойылды.");}
    catch(err){setError("Сыныпты жою қатесі: "+err.message);}finally{setBusy(false);}
  }
  async function copyCode(){
    if(!selected?.joinCode)return;
    try{await navigator.clipboard.writeText(selected.joinCode);setMessage("Код көшірілді.");}
    catch{setMessage("Сынып коды: "+selected.joinCode);}
  }

  return <div className="teacher-page">
    <header className="teacher-header"><a className="teacher-brand" href="/">⚔ <span>MATH BATTLE ROYALE<small>TEACHER SPACE</small></span></a><a className="teacher-back" href="/">← Ойынға оралу</a></header>
    <main className="teacher-main">
      <section className="teacher-welcome"><div className="teacher-eyebrow">МҰҒАЛІМГЕ АРНАЛҒАН БӨЛІМ</div><h1>Мұғалім кабинеті</h1><p>Сынып құрыңыз, оқушылар тізімін басқарыңыз және сынып кодын бөлісіңіз.</p></section>
      {!firebaseReady&&<div className="teacher-alert">Firebase конфигурациясы орнатылмаған.</div>}
      {firebaseReady&&!ready&&<div className="teacher-alert">Кабинетке қосылу...</div>}
      <div className="teacher-grid">
        <section className="teacher-panel">
          <div className="teacher-panel-title"><div><small>БАСҚАРУ</small><h2>Менің сыныптарым</h2></div><span>{classes.length}</span></div>
          <form className="teacher-create-form" onSubmit={createClass}>
            <label>Сынып атауы<input value={className} onChange={e=>setClassName(e.target.value)} placeholder="Мысалы: 7 «А» сыныбы" maxLength={50}/></label>
            <label>Деңгей<select value={grade} onChange={e=>setGrade(e.target.value)}>{["5","6","7","8","9"].map(g=><option key={g} value={g}>{g}-сынып</option>)}</select></label>
            <button disabled={busy||!ready||!className.trim()}>＋ Сынып құру</button>
          </form>
          <div className="teacher-class-list">{classes.length?classes.map(item=><button key={item.id} className={selectedId===item.id?"teacher-class active":"teacher-class"} onClick={()=>setSelectedId(item.id)}><span className="teacher-class-icon">▦</span><span><b>{item.name}</b><small>{item.grade}-сынып · {item.joinCode}</small></span><strong>›</strong></button>):<div className="teacher-empty">Әзірге сынып жоқ. Алғашқы сыныбыңызды құрыңыз.</div>}</div>
        </section>
        <section className="teacher-panel">
          {selected?<><div className="teacher-panel-title"><div><small>СЫНЫП АҚПАРАТЫ</small><h2>{selected.name}</h2></div><span>{students.length} оқушы</span></div>
            <form className="teacher-edit-form" onSubmit={saveClassDetails}><label>Сынып атауы<input value={editingName} onChange={e=>setEditingName(e.target.value)} maxLength={50}/></label><label>Деңгей<select value={editingGrade} onChange={e=>setEditingGrade(e.target.value)}>{["5","6","7","8","9"].map(g=><option key={g} value={g}>{g}-сынып</option>)}</select></label><button disabled={busy||!editingName.trim()}>Өзгерістерді сақтау</button></form>
            <div className="teacher-code-box"><div><small>СЫНЫП КОДЫ</small><b>{selected.joinCode}</b></div><button onClick={copyCode}>▣ Көшіру</button></div>
            <p className="teacher-hint">Оқушылар QR кодты сканерлеп немесе /?student=1 бетіне кіріп, сыныпқа қосыла алады.</p><div className="teacher-qr-card"><QRCodeSVG value={`${window.location.origin}/?student=1&code=${selected.joinCode}`} size={148} bgColor="#ffffff" fgColor="#10213a" level="M"/><div><b>📱 QR арқылы қосылу</b><small>Оқушы камерамен сканерлеп, сынып кодын автоматты енгізе алады.</small></div></div>
            <form className="teacher-add-form" onSubmit={addStudent}><input value={studentName} onChange={e=>setStudentName(e.target.value)} placeholder="Оқушының аты-жөні" maxLength={60}/><button disabled={busy||!studentName.trim()}>＋ Қосу</button></form>
            <div className="teacher-roster-tools"><input value={studentSearch} onChange={e=>setStudentSearch(e.target.value)} placeholder="Оқушыны іздеу..." aria-label="Оқушыны іздеу"/><button type="button" onClick={exportClassCsv} disabled={!students.length}>↓ CSV есебі</button></div><div className="teacher-roster">{visibleStudents.length?visibleStudents.map((s,i)=><div className="teacher-student" key={s.id}><span>{String(i+1).padStart(2,"0")}</span><b>{s.name}</b><button aria-label="Оқушыны өшіру" onClick={()=>removeStudent(s.id)}>×</button></div>):<div className="teacher-empty">{students.length?"Іздеу бойынша оқушы табылмады.":"Бұл сыныпта әзірге оқушы жоқ."}</div>}</div>
            <div className="teacher-tournament"><div><small>СЫНЫПАРАЛЫҚ ТУРНИР</small><h3>{selected.activeRoomCode?"Турнир бөлмесі ашық":"Бірнеше сыныпты біріктіріңіз"}</h3><p>{activeRoom?Object.values(activeRoom.players||{}).length+" ойыншы · "+activeRoom.status:"Турнир кодын басқа мұғалімдерге таратыңыз."}</p></div><button onClick={startTournament} disabled={busy||!students.length}>⚔ ТУРНИР ҚҰРУ</button></div><form className="teacher-cross-join" onSubmit={joinInterclassTournament}><label>Басқа мұғалім жасаған турнир коды<input value={crossCode} onChange={e=>setCrossCode(e.target.value.toUpperCase().slice(0,6))} placeholder="A1B2C3" maxLength={6}/></label><button disabled={busy||crossCode.trim().length!==6}>Сыныпты турнирге қосу</button></form>{activeRoom&&<><div className="teacher-analytics"><div><small>ҚАТЫСУШЫЛАР</small><b>{roomPlayers.length}</b></div><div><small>ОРТАША ҰПАЙ</small><b>{averageScore} XP</b></div><div><small>РАУНД</small><b>{Math.max(0,(activeRoom.round??-1)+1)}</b></div></div><div className="teacher-code-box"><div><small>ОЙЫН БӨЛМЕСІНІҢ КОДЫ</small><b>{selected.activeRoomCode}</b></div><a href={"/?room="+selected.activeRoomCode}>Ойынға өту →</a></div><div className="teacher-roster">{roomPlayers.map((p,i)=><div className="teacher-student" key={p.uid}><span>{String(i+1).padStart(2,"0")}</span><b>{p.name}</b><strong>{p.score} XP</strong></div>)}</div></>}<button className="teacher-delete-class" disabled={busy} onClick={removeClass}>Сыныпты жою</button>
          </>:<div className="teacher-empty teacher-no-selection">Сыныпты таңдаңыз немесе жаңасын құрыңыз.</div>}
        </section>
      </div>
      <TeacherLearningHub uid={uid} selected={selected} students={students}/>
      {(message||error)&&<div className={error?"teacher-message error":"teacher-message"}>{error||message}</div>}
      <div className="teacher-footnote">Деректер Firebase Firestore-та сақталады. Мұғалім аккаунты жеке email/Google профиліне байланған.</div>
    </main>
  </div>;
}
