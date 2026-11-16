import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db, firebaseReady, onAuthStateChanged, signInAnonymously } from "./firebase";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({length:6},()=>alphabet[Math.floor(Math.random()*alphabet.length)]).join("");

export default function TeacherDashboard() {
  const [uid,setUid]=useState(auth?.currentUser?.uid||"");
  const [ready,setReady]=useState(Boolean(auth?.currentUser));
  const [classes,setClasses]=useState([]);
  const [selectedId,setSelectedId]=useState("");
  const [students,setStudents]=useState([]);
  const [className,setClassName]=useState("");
  const [grade,setGrade]=useState("5");
  const [studentName,setStudentName]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

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

  async function createClass(e){
    e.preventDefault();if(!className.trim()||!uid)return;setBusy(true);setError("");setMessage("");
    try{const ref=await addDoc(collection(db,"teachers",uid,"classes"),{name:className.trim().slice(0,50),grade,teacherUid:uid,joinCode:makeCode(),createdAt:serverTimestamp()});setClassName("");setSelectedId(ref.id);setMessage("Сынып құрылды.");}
    catch(err){setError("Сынып құру қатесі: "+err.message);}finally{setBusy(false);}
  }
  async function addStudent(e){
    e.preventDefault();if(!studentName.trim()||!selected)return;setBusy(true);setError("");setMessage("");
    try{await addDoc(collection(db,"teachers",uid,"classes",selected.id,"students"),{name:studentName.trim().slice(0,60),createdAt:serverTimestamp()});setStudentName("");setMessage("Оқушы қосылды.");}
    catch(err){setError("Оқушыны қосу қатесі: "+err.message);}finally{setBusy(false);}
  }
  async function removeStudent(id){
    if(!selected)return;
    try{await deleteDoc(doc(db,"teachers",uid,"classes",selected.id,"students",id));setMessage("Оқушы өшірілді.");}
    catch(err){setError("Өшіру қатесі: "+err.message);}
  }
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
            <div className="teacher-code-box"><div><small>СЫНЫП КОДЫ</small><b>{selected.joinCode}</b></div><button onClick={copyCode}>▣ Көшіру</button></div>
            <p className="teacher-hint">Кодты оқушыларға бөлісіңіз. Код арқылы автоматты қосылу әзірге іске қосылмаған.</p>
            <form className="teacher-add-form" onSubmit={addStudent}><input value={studentName} onChange={e=>setStudentName(e.target.value)} placeholder="Оқушының аты-жөні" maxLength={60}/><button disabled={busy||!studentName.trim()}>＋ Қосу</button></form>
            <div className="teacher-roster">{students.length?students.map((s,i)=><div className="teacher-student" key={s.id}><span>{String(i+1).padStart(2,"0")}</span><b>{s.name}</b><button aria-label="Оқушыны өшіру" onClick={()=>removeStudent(s.id)}>×</button></div>):<div className="teacher-empty">Бұл сыныпта әзірге оқушы жоқ.</div>}</div>
            <button className="teacher-delete-class" disabled={busy} onClick={removeClass}>Сыныпты жою</button>
          </>:<div className="teacher-empty teacher-no-selection">Сыныпты таңдаңыз немесе жаңасын құрыңыз.</div>}
        </section>
      </div>
      {(message||error)&&<div className={error?"teacher-message error":"teacher-message"}>{error||message}</div>}
      <div className="teacher-footnote">Деректер Firebase Firestore-та сақталады. Қазіргі нұсқа осы браузердегі анонимді профильге байланған; мұғалімнің жеке аккаунты кейін қосылады.</div>
    </main>
  </div>;
}
