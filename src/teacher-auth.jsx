import React, { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, signInWithEmailAndPassword, signInWithPopup, signOut, reload, sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db, firebaseReady } from "./firebase";
import TeacherDashboard from "./teacher";

const emailKey = value => value.trim().toLowerCase();
const invitePath = email => emailKey(email);
const provider = new GoogleAuthProvider();

export default function TeacherAccess(){
 const [user,setUser]=useState(auth?.currentUser||null);
 const [profile,setProfile]=useState(null);
 const [mode,setMode]=useState("login");
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [fullName,setFullName]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [inviteEmail,setInviteEmail]=useState("");
 const [inviteName,setInviteName]=useState("");
 const [inviteBusy,setInviteBusy]=useState(false);
 const [isAdmin,setIsAdmin]=useState(false);

 useEffect(()=>onAuthStateChanged(auth,u=>{setUser(u);setProfile(null);setIsAdmin(false);}),[]);
 useEffect(()=>{
  let live=true;
  async function load(){
   if(!user)return;
   try{
    await reload(user);
    if(!live)return;
    if(!user.emailVerified){setProfile({status:"unverified"});return;}
    const p=await getDoc(doc(db,"teacherProfiles",user.uid));
    if(p.exists()){if(live)setProfile(p.data());}
    else if(live)setProfile({status:"not-invited"});
    const a=await getDoc(doc(db,"admins",user.uid));
    if(live)setIsAdmin(a.exists());
   }catch(e){if(live)setError("Профильді тексеру қатесі: "+e.message);}
  }
  load();
  return ()=>{live=false;};
 },[user]);

 async function finishInvite(u){
  await reload(u);
  if(!u.emailVerified)throw new Error("Алдымен электрондық поштаңызды растаңыз.");
  const key=invitePath(u.email||"");
  const ref=doc(db,"teacherInvites",key);
  const snap=await getDoc(ref);
  if(!snap.exists()||snap.data().status!=="pending")throw new Error("Бұл поштаға шақыру табылмады немесе ол қолданылған. Әкімшіге хабарласыңыз.");
  const invite=snap.data();
  await updateDoc(ref,{status:"accepted",acceptedUid:u.uid,acceptedAt:serverTimestamp()});
  await setDoc(doc(db,"teacherProfiles",u.uid),{uid:u.uid,email:u.email,name:invite.name||u.displayName||fullName||"Мұғалім",role:"teacher",status:"active",createdAt:serverTimestamp(),inviteEmail:key});
  setProfile({role:"teacher",status:"active"});
  setMessage("Қош келдіңіз! Мұғалім кабинеті ашылды.");
 }

 async function submit(e){
  e.preventDefault();setBusy(true);setError("");setMessage("");
  try{
   if(mode==="register"){
    if(password.length<8)throw new Error("Құпиясөз кемінде 8 таңбадан тұруы керек.");
    const cred=await createUserWithEmailAndPassword(auth,emailKey(email),password);
    if(fullName.trim())await updateProfile(cred.user,{displayName:fullName.trim()});
    await sendEmailVerification(cred.user);
    await signOut(auth);
    setMode("login");
    setMessage("Растау хаты жіберілді. Поштаңызды растағаннан кейін қайта кіріңіз.");
   }else{
    const cred=await signInWithEmailAndPassword(auth,emailKey(email),password);
    await finishInvite(cred.user);
   }
  }catch(e){setError(e.message||"Кіру қатесі.");}
  finally{setBusy(false);}
 }
 async function googleLogin(){
  setBusy(true);setError("");setMessage("");
  try{const cred=await signInWithPopup(auth,provider);await finishInvite(cred.user);}
  catch(e){setError(e.message||"Google арқылы кіру қатесі.");}
  finally{setBusy(false);}
 }
 async function resendVerification(){
  if(!user)return;
  setBusy(true);try{await sendEmailVerification(user);setMessage("Растау хаты қайта жіберілді.");}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function resetPassword(){
  if(!email.trim()){setError("Алдымен email енгізіңіз.");return;}
  setBusy(true);try{await sendPasswordResetEmail(auth,emailKey(email));setMessage("Құпиясөзді қалпына келтіру хаты жіберілді.");}catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function createInvite(e){
  e.preventDefault();setInviteBusy(true);setError("");setMessage("");
  try{
   const key=invitePath(inviteEmail);
   if(!/^\S+@\S+\.\S+$/.test(key))throw new Error("Дұрыс email енгізіңіз.");
   await setDoc(doc(db,"teacherInvites",key),{email:key,name:inviteName.trim(),status:"pending",createdAt:serverTimestamp(),createdBy:user.uid});
   setInviteEmail("");setInviteName("");setMessage("Шақыру дайын. Мұғалімге осы email арқылы тіркелу керегін айтыңыз.");
  }catch(e){setError("Шақыру жасау қатесі: "+e.message);}
  finally{setInviteBusy(false);}
 }
 async function logout(){await signOut(auth);setProfile(null);setMessage("");setError("");}

 if(!firebaseReady)return <AuthShell><div className="teacher-alert">Firebase конфигурациясы орнатылмаған.</div></AuthShell>;
 if(user&&profile?.status==="active")return <><div className="teacher-auth-bar"><span>{user.email} · {isAdmin?"БАС ӘКІМШІ":"МҰҒАЛІМ"}</span><button onClick={logout}>Шығу</button></div>{isAdmin&&<section className="teacher-invite-panel"><h2>Мұғалім шақыру</h2><p>Шақыру жасалған email ғана мұғалім ретінде тіркеле алады.</p><form onSubmit={createInvite}><input type="email" required placeholder="Мұғалімнің email-і" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/><input placeholder="Аты-жөні (міндетті емес)" value={inviteName} onChange={e=>setInviteName(e.target.value)}/><button disabled={inviteBusy}>＋ Шақыру жасау</button></form></section>}{(message||error)&&<div className={error?"teacher-message error":"teacher-message"}>{error||message}</div>}<TeacherDashboard/></>;
 if(user&&profile?.status==="unverified")return <AuthShell><h1>Email-ді растаңыз</h1><p>Мұғалім кабинетіне кіру үшін поштаңыздағы растау сілтемесін ашыңыз.</p><button className="teacher-auth-primary" onClick={resendVerification} disabled={busy}>Растау хатын қайта жіберу</button><button className="teacher-auth-secondary" onClick={logout}>Басқа аккаунтпен кіру</button>{message&&<p className="teacher-message">{message}</p>}</AuthShell>;
 if(user&&profile?.status==="not-invited")return <AuthShell><h1>Шақыру қажет</h1><p>Бұл аккаунт мұғалімдер тізімінде жоқ. Әкімші сіздің email-іңізге шақыру жіберуі керек.</p><button className="teacher-auth-secondary" onClick={logout}>Шығу</button></AuthShell>;
 return <AuthShell><div className="teacher-auth-kicker">MATH BATTLE ROYALE · TEACHER SPACE</div><h1>{mode==="register"?"Мұғалім тіркелуі":"Мұғалім кабинеті"}</h1><p>{mode==="register"?"Әкімші шақырған email арқылы тіркеліңіз.":"Email немесе Google аккаунты арқылы кіріңіз."}</p><form className="teacher-auth-form" onSubmit={submit}>{mode==="register"&&<label>Аты-жөніңіз<input value={fullName} onChange={e=>setFullName(e.target.value)} required placeholder="Аты-жөніңіз"/></label>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="name@example.com"/></label><label>Құпиясөз<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={8} placeholder="Кемінде 8 таңба"/></label><button className="teacher-auth-primary" disabled={busy}>{busy?"Күтіңіз...":mode==="register"?"ТІРКЕЛУ":"КІРУ"}</button></form>{mode==="login"&&<button className="teacher-auth-link" onClick={resetPassword}>Құпиясөзді ұмыттыңыз ба?</button>}<div className="teacher-auth-divider">НЕМЕСЕ</div><button className="teacher-auth-google" onClick={googleLogin} disabled={busy}>Google арқылы кіру</button><button className="teacher-auth-link" onClick={()=>{setMode(mode==="login"?"register":"login");setError("");setMessage("");}}>{mode==="login"?"Шақыруыңыз бар ма? Тіркелу":"Кіру бетіне оралу"}</button>{(message||error)&&<div className={error?"teacher-message error":"teacher-message"}>{error||message}</div>}</AuthShell>;
}
function AuthShell({children}){return <div className="teacher-page"><header className="teacher-header"><a className="teacher-brand" href="/">⚔ <span>MATH BATTLE ROYALE<small>TEACHER ACCESS</small></span></a><a className="teacher-back" href="/">← Басты бет</a></header><main className="teacher-main"><section className="teacher-panel teacher-auth-panel">{children}</section></main></div>;}
