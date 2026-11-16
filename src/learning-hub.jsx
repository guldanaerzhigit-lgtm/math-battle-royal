import React, { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { read, utils, writeFileXLSX } from "xlsx";
import { db } from "./firebase";

const blankQuestion = () => ({ q:"", options:["","","",""], answerIndex:0, topic:"Жалпы", solution:"", hint:"", simpleQ:"", visualHint:"", difficulty:"medium" });
const difficultyValue = value => ({easy:1,medium:2,hard:3}[value] || 2);
const safeText = value => String(value ?? "").trim();
const escapeCsvCell = value => '"' + String(value ?? "").replace(/"/g,'""') + '"';

function makeWorkbook(rows, name) {
  const book = utils.book_new();
  utils.book_append_sheet(book, utils.aoa_to_sheet(rows), "Тапсырмалар");
  writeFileXLSX(book, name);
}
function headerIndex(headers, names, fallback) {
  const index = headers.findIndex(h => names.includes(String(h || "").toLocaleLowerCase("kk").replace(/[\s_*()[\]-]/g,"")));
  return index >= 0 ? index : fallback;
}
function parseQuestionRows(rows) {
  if (!rows.length) return [];
  const normalize = v => String(v || "").toLocaleLowerCase("kk").replace(/[\s_*()[\]-]/g,"");
  const first = rows[0].map(normalize);
  const hasHeader = first.some(v => ["сұрақ","вопрос","question","тапсырма","сұрақмәтіні"].includes(v));
  const headers = hasHeader ? rows[0] : [];
  const start = hasHeader ? 1 : 0;
  const idx = (names, fallback) => headers.length ? headerIndex(headers, names.map(normalize), fallback) : fallback;
  const indexes = {
    q:idx(["сұрақ","вопрос","question","тапсырма","сұрақмәтіні"],0),
    a:idx(["a","жауапa","нұсқаa","optiona"],1), b:idx(["b","жауапb","нұсқаб","optionb"],2),
    c:idx(["c","жауапc","нұсқав","optionc"],3), d:idx(["d","жауапd","нұсқаг","optiond"],4),
    correct:idx(["дұрысжауап","правильныйответ","ответ","correct","answer"],5),
    topic:idx(["тақырып","тема","topic"],6), solution:idx(["шешімі","решение","solution","түсіндірме"],7),
    hint:idx(["подсказка","hint","көмек"],8), simpleQ:idx(["жеңілдетілгенсұрақ","упрощенныйвариант","simpleq"],9),
    visualHint:idx(["визуалдыишара","визуальнаяподсказка","visualhint"],10), difficulty:idx(["деңгей","сложность","difficulty"],11)
  };
  return rows.slice(start).filter(row => safeText(row[indexes.q])).map(row => {
    const options=[row[indexes.a],row[indexes.b],row[indexes.c],row[indexes.d]].map(safeText);
    const raw=safeText(row[indexes.correct]);
    let answerIndex=["a","b","c","d"].indexOf(raw.toLowerCase());
    if(answerIndex<0 && /^[1-4]$/.test(raw)) answerIndex=Number(raw)-1;
    if(answerIndex<0) answerIndex=options.findIndex(v=>v===raw);
    const rawDifficulty=safeText(row[indexes.difficulty]).toLowerCase();
    const difficulty=["easy","жеңіл","легкий","1"].includes(rawDifficulty)?"easy":["hard","қиын","сложный","3"].includes(rawDifficulty)?"hard":"medium";
    return { q:safeText(row[indexes.q]), options, answerIndex, topic:safeText(row[indexes.topic])||"Жалпы",
      solution:safeText(row[indexes.solution]), hint:safeText(row[indexes.hint]), simpleQ:safeText(row[indexes.simpleQ]),
      visualHint:safeText(row[indexes.visualHint]), difficulty };
  }).filter(q=>q.q && q.options.every(Boolean) && q.answerIndex>=0 && q.answerIndex<4);
}

export function TeacherLearningHub({ uid, selected, students=[] }) {
  const [tab,setTab]=useState("bank");
  const [questions,setQuestions]=useState([]);
  const [assignments,setAssignments]=useState([]);
  const [draft,setDraft]=useState(blankQuestion);
  const [title,setTitle]=useState("");
  const [dueAt,setDueAt]=useState("");
  const [selectedQuestions,setSelectedQuestions]=useState([]);
  const [settings,setSettings]=useState({adaptive:true,hints:true,solutions:true,extraTime:1,simplified:false,visualHints:true});
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [reportId,setReportId]=useState("");
  const [attempts,setAttempts]=useState([]);
   const [classAttempts,setClassAttempts]=useState([]);
  const [rooms,setRooms]=useState([]);
  const [loadingReport,setLoadingReport]=useState(false);
  const [topicFilter,setTopicFilter]=useState("all");
  const [search,setSearch]=useState("");

  useEffect(()=>{
    if(!uid||!selected?.id||!db){setQuestions([]);return;}
    return onSnapshot(collection(db,"teachers",uid,"classes",selected.id,"questions"),snap=>{
      setQuestions(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    },e=>setError("Банк сұрақтарын жүктеу қатесі: "+e.message));
  },[uid,selected?.id]);
  useEffect(()=>{
    if(!selected?.joinCode||!db){setAssignments([]);return;}
    return onSnapshot(collection(db,"classPublic",selected.joinCode,"assignments"),snap=>{
      const list=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt?.seconds||b.createdAt||"").localeCompare(String(a.createdAt?.seconds||a.createdAt||"")));
      setAssignments(list);
      setReportId(current=>current||list[0]?.id||"");
    },e=>setError("Үй тапсырмаларын жүктеу қатесі: "+e.message));
  },[selected?.joinCode]);
  useEffect(()=>{
    if(tab!=="analytics"||!selected?.id||!db)return;
    let alive=true;
    getDocs(query(collection(db,"rooms"),where("classId","==",selected.id))).then(snap=>{
      if(alive)setRooms(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    }).catch(e=>{if(alive)setError("Турнир тарихын жүктеу қатесі: "+e.message);});
    return ()=>{alive=false;};
  },[tab,selected?.id]);
  useEffect(()=>{
    if(tab!=="analytics"||!selected?.joinCode||!db){setClassAttempts([]);return;}
    let alive=true;
    Promise.all(assignments.map(a=>getDocs(collection(db,"classPublic",selected.joinCode,"assignments",a.id,"attempts"))))
      .then(snaps=>{if(alive)setClassAttempts(snaps.flatMap(s=>s.docs.map(d=>({id:d.id,...d.data()}))));})
      .catch(e=>{if(alive)setError("Сынып аналитикасын жүктеу қатесі: "+e.message);});
    return ()=>{alive=false;};
  },[tab,selected?.joinCode,assignments]);
  useEffect(()=>{
    if(tab!=="analytics"||!reportId||!selected?.joinCode||!db){setAttempts([]);return;}
    let alive=true;setLoadingReport(true);
    getDocs(collection(db,"classPublic",selected.joinCode,"assignments",reportId,"attempts"))
      .then(snap=>{if(alive)setAttempts(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.completedAt?.seconds||0)-(a.completedAt?.seconds||0)));})
      .catch(e=>{if(alive)setError("Нәтижелерді жүктеу қатесі: "+e.message);})
      .finally(()=>{if(alive)setLoadingReport(false);});
    return ()=>{alive=false;};
  },[tab,reportId,selected?.joinCode]);

  const topics=useMemo(()=>[...new Set(questions.map(q=>q.topic||"Жалпы"))].sort((a,b)=>a.localeCompare(b,"kk")),[questions]);
  const visibleQuestions=useMemo(()=>questions.filter(q=>(topicFilter==="all"||q.topic===topicFilter)&&(!search||q.q.toLocaleLowerCase("kk").includes(search.toLocaleLowerCase("kk")))),[questions,topicFilter,search]);
  const classCorrect=classAttempts.reduce((n,a)=>n+(a.correctCount||0),0);
  const classTotal=classAttempts.reduce((n,a)=>n+(a.total||0),0);
  const classAverage=classAttempts.length?Math.round(classAttempts.reduce((n,a)=>n+(a.percent||0),0)/classAttempts.length):0;
  const correctTotal=attempts.reduce((n,a)=>n+(a.correctCount||0),0);
  const answerTotal=attempts.reduce((n,a)=>n+(a.total||0),0);
  const average=attempts.length?Math.round(attempts.reduce((n,a)=>n+(a.percent||0),0)/attempts.length):0;
  const weakTopics=useMemo(()=>{
    const map={};
    attempts.forEach(a=>{
      const wrong=Array.isArray(a.answers)?a.answers.filter(x=>!x.correct).map(x=>x.topic):a.incorrectTopics||[];
      wrong.forEach(topic=>{map[topic]=(map[topic]||0)+1;});
    });
    return Object.entries(map).sort((a,b)=>b[1]-a[1]);
  },[attempts]);

  function patchDraft(key,value){setDraft(old=>({...old,[key]:value}));}
  function patchOption(index,value){setDraft(old=>({...old,options:old.options.map((x,i)=>i===index?value:x)}));}
  function flash(text){setMessage(text);setError("");}
  function fail(text){setError(text);setMessage("");}

  async function saveQuestion(e){
    e.preventDefault();
    if(!selected||!draft.q.trim()||draft.options.some(v=>!safeText(v))){fail("Сұрақ пен төрт жауап нұсқасын толтырыңыз.");return;}
    setBusy(true);fail("");
    try{
      await addDoc(collection(db,"teachers",uid,"classes",selected.id,"questions"),{
        ...draft,q:draft.q.trim(),options:draft.options.map(safeText),answerIndex:Number(draft.answerIndex),grade:selected.grade,
        createdAt:serverTimestamp()
      });
      setDraft(blankQuestion());flash("Сұрақ банкке сақталды.");
    }catch(e){fail("Сұрақты сақтау қатесі: "+e.message);}finally{setBusy(false);}
  }
  async function importWorkbook(file){
    if(!selected||!file)return;setBusy(true);fail("");
    try{
      const workbook=read(await file.arrayBuffer(),{type:"array"});
      const rows=utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]],{header:1,defval:""});
      const parsed=parseQuestionRows(rows);
      if(!parsed.length)throw new Error("Жарамды сұрақ табылмады. Үлгі файлдағы баған атауларын қолданыңыз.");
      if(parsed.length>300)throw new Error("Бір импортта ең көбі 300 сұрақ жүктеуге болады.");
      const batch=writeBatch(db);
      parsed.forEach(q=>{const ref=doc(collection(db,"teachers",uid,"classes",selected.id,"questions"));batch.set(ref,{...q,grade:selected.grade,createdAt:serverTimestamp(),imported:true});});
      await batch.commit();flash(parsed.length+" сұрақ импортталды.");
    }catch(e){fail("Импорт қатесі: "+e.message);}finally{setBusy(false);}
  }
  async function removeQuestion(id){
    if(!selected||!window.confirm("Бұл сұрақты банктен өшіресіз бе?"))return;
    try{await deleteDoc(doc(db,"teachers",uid,"classes",selected.id,"questions",id));setSelectedQuestions(old=>old.filter(x=>x!==id));flash("Сұрақ өшірілді.");}
    catch(e){fail("Өшіру қатесі: "+e.message);}
  }
  async function createAssignment(e){
    e.preventDefault();
    if(!selected||!title.trim()||!dueAt||!selectedQuestions.length){fail("Атауы, орындау күні және кемінде бір сұрақты таңдаңыз.");return;}
    const chosen=questions.filter(q=>selectedQuestions.includes(q.id)).map(({id,q,options,answerIndex,topic,solution,hint,simpleQ,visualHint,difficulty,grade})=>({id,q,options,answerIndex,topic,solution,hint,simpleQ,visualHint,difficulty,grade}));
    setBusy(true);fail("");
    try{
      await addDoc(collection(db,"classPublic",selected.joinCode,"assignments"),{
        teacherUid:uid,classId:selected.id,title:title.trim().slice(0,90),grade:selected.grade,mode:"practice",
        dueAt:new Date(dueAt).toISOString(),questions:chosen,questionCount:chosen.length,settings,
        createdAt:serverTimestamp()
      });
      setTitle("");setDueAt("");setSelectedQuestions([]);flash("Жеке жаттығу тапсырмасы сыныпқа жарияланды.");
    }catch(e){fail("Тапсырманы жариялау қатесі: "+e.message);}finally{setBusy(false);}
  }
  async function removeAssignment(assignment){
    if(!selected||!window.confirm("Бұл тапсырманы және жарияланған сілтемесін жоясыз ба?"))return;
    try{await deleteDoc(doc(db,"classPublic",selected.joinCode,"assignments",assignment.id));flash("Тапсырма жойылды.");}
    catch(e){fail("Тапсырманы жою қатесі: "+e.message);}
  }
  function downloadTemplate(){
    makeWorkbook([
      ["Сұрақ","A","B","C","D","Дұрыс жауап","Тақырып","Шешімі","Подсказка","Жеңілдетілген сұрақ","Визуалды ишара","Деңгей"],
      ["−4 × 3 = ?","−7","−12","12","7","B","Рационал сандар","Теріс санды 3 рет қосамыз: −4 + −4 + −4 = −12.","Теріс санды оң санға көбейт.","−4 санын үш рет қос.","−4 + −4 + −4","easy"]
    ],"math-battle-question-template.xlsx");
  }
  async function exportReport(){
    if(!selected)return;setBusy(true);fail("");
    try{
      const attemptRows=[["Тапсырма","Оқушы","Дұрыс жауап","Барлық сұрақ","Пайыз","Қате тақырыптар","Уақыты"]];
      const allTopicErrors={};
      for(const assignment of assignments){
        const snap=await getDocs(collection(db,"classPublic",selected.joinCode,"assignments",assignment.id,"attempts"));
        snap.docs.forEach(d=>{
          const a=d.data();
          const incorrect=Array.isArray(a.answers)?a.answers.filter(x=>!x.correct).map(x=>x.topic):a.incorrectTopics||[];
          incorrect.forEach(topic=>{allTopicErrors[topic]=(allTopicErrors[topic]||0)+1;});
          const completed=a.completedAt&&typeof a.completedAt.toDate==="function"?a.completedAt.toDate().toLocaleString():"";
          attemptRows.push([assignment.title,a.studentName||"",a.correctCount||0,a.total||0,a.percent||0,incorrect.join(", "),completed]);
        });
      }
      const tournamentRows=[["Бөлме","Күйі","Раунд","Оқушы","Ұпай","Тірі қалды"]];
      rooms.forEach(room=>Object.values(room.players||{}).forEach(p=>tournamentRows.push([room.code||room.id,room.status,room.round??"",p.name||"",p.score||0,p.alive?"Иә":"Жоқ"])));
      const topicRows=[["Тақырып","Қате жауап саны"],...Object.entries(allTopicErrors).sort((a,b)=>b[1]-a[1]).map(([topic,count])=>[topic,count])];
      const book=utils.book_new();
      utils.book_append_sheet(book,utils.aoa_to_sheet(attemptRows),"Жаттығулар");
      utils.book_append_sheet(book,utils.aoa_to_sheet(topicRows),"Қиын тақырыптар");
      utils.book_append_sheet(book,utils.aoa_to_sheet(tournamentRows),"Турнир тарихы");
      writeFileXLSX(book,(selected.name||"class").replace(/[^a-zа-я0-9_-]/gi,"_")+"_report.xlsx");
      flash("Сыныптың Excel есебі дайын.");
    }catch(e){fail("Есепті дайындау қатесі: "+e.message);}finally{setBusy(false);}
  }

  if(!selected)return <section className="teacher-panel teacher-tools-panel"><h2>Оқу құралдары</h2><div className="teacher-empty">Алдымен сынып құрыңыз немесе таңдаңыз.</div></section>;
  return <section className="teacher-tools-panel">
    <div className="teacher-tools-heading"><div><small>TEACHER STUDIO · {selected.grade}-СЫНЫП</small><h2>Оқу құралдары мен аналитика</h2><p>Сұрақтар банкінде тапсырма дайындаңыз, күнін белгілеңіз және сынып нәтижесін бақылаңыз.</p></div><span>{questions.length} сұрақ · {assignments.length} жұмыс</span></div>
    <div className="teacher-tools-tabs">
      <button className={tab==="bank"?"active":""} onClick={()=>setTab("bank")}>Сұрақтар банкі</button>
      <button className={tab==="assignments"?"active":""} onClick={()=>setTab("assignments")}>Үй тапсырмасы</button>
      <button className={tab==="analytics"?"active":""} onClick={()=>setTab("analytics")}>Тарих және есеп</button>
    </div>
    {tab==="bank"&&<div className="teacher-tools-grid">
      <section className="teacher-panel">
        <div className="teacher-panel-title"><div><small>КОНСТРУКТОР</small><h2>Жаңа сұрақ</h2></div><span>＋</span></div>
        <form className="teacher-question-form" onSubmit={saveQuestion}>
          <label>Сұрақ мәтіні<textarea value={draft.q} onChange={e=>patchDraft("q",e.target.value)} rows="2" maxLength="500" placeholder="Мысалы: −4 × 3 = ?"/></label>
          <div className="teacher-option-grid">{draft.options.map((value,i)=><label key={i}>{["A","B","C","D"][i]} жауабы<input value={value} onChange={e=>patchOption(i,e.target.value)} maxLength="120" placeholder="Жауап нұсқасы"/></label>)}</div>
          <div className="teacher-form-row"><label>Дұрыс жауап<select value={draft.answerIndex} onChange={e=>patchDraft("answerIndex",Number(e.target.value))}>{[0,1,2,3].map(i=><option key={i} value={i}>{["A","B","C","D"][i]}</option>)}</select></label><label>Деңгей<select value={draft.difficulty} onChange={e=>patchDraft("difficulty",e.target.value)}><option value="easy">Жеңіл</option><option value="medium">Орташа</option><option value="hard">Қиын</option></select></label></div>
          <label>Тақырып<input value={draft.topic} onChange={e=>patchDraft("topic",e.target.value)} maxLength="70" placeholder="Рационал сандар"/></label>
          <label>Қадамдық шешімі<textarea rows="2" value={draft.solution} onChange={e=>patchDraft("solution",e.target.value)} placeholder="Оқушыға көрсетілетін түсіндірме"/></label>
          <label>Подсказка<textarea rows="2" value={draft.hint} onChange={e=>patchDraft("hint",e.target.value)} placeholder="Қысқа көмек"/></label>
          <label>Жеңілдетілген нұсқа<input value={draft.simpleQ} onChange={e=>patchDraft("simpleQ",e.target.value)} placeholder="ЕҚБҚ оқушысына арналған жеңіл мәтін"/></label>
          <label>Визуалды ишара<input value={draft.visualHint} onChange={e=>patchDraft("visualHint",e.target.value)} placeholder="Мысалы: сан сәулесін елестет"/></label>
          <button className="teacher-tool-primary" disabled={busy}>＋ Банкке сақтау</button>
        </form>
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-title"><div><small>ИМПОРТ / ЭКСПОРТ</small><h2>Excel және CSV</h2></div><span>⇅</span></div>
        <p className="teacher-hint">.xlsx, .xls және .csv файлдарын жүктеңіз. Бір файлда сұрақ, A–D жауаптары және дұрыс жауап болуы керек.</p>
        <div className="teacher-import-actions"><label className="teacher-file-button">↑ Файлды таңдау<input type="file" accept=".xlsx,.xls,.csv" onChange={e=>{importWorkbook(e.target.files?.[0]);e.target.value="";}}/></label><button type="button" onClick={downloadTemplate}>↓ Excel үлгісі</button></div>
        <div className="teacher-empty teacher-format-note">Бағандар: Сұрақ · A · B · C · D · Дұрыс жауап · Тақырып · Шешімі · Подсказка · Жеңілдетілген сұрақ · Визуалды ишара · Деңгей</div>
        <div className="teacher-panel-title teacher-bank-heading"><div><small>САҚТАЛҒАН ТАПСЫРМАЛАР</small><h2>Сұрақтар банкі</h2></div><span>{questions.length}</span></div>
        <div className="teacher-bank-filters"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Сұрақты іздеу..."/><select value={topicFilter} onChange={e=>setTopicFilter(e.target.value)}><option value="all">Барлық тақырып</option>{topics.map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="teacher-question-list">{visibleQuestions.length?visibleQuestions.map(q=><article key={q.id}><div><b>{q.q}</b><small>{q.topic} · {q.difficulty==="easy"?"Жеңіл":q.difficulty==="hard"?"Қиын":"Орташа"}</small><small>Дұрыс жауап: {["A","B","C","D"][q.answerIndex]}</small></div><button onClick={()=>removeQuestion(q.id)} aria-label="Сұрақты өшіру">×</button></article>):<div className="teacher-empty">Әзірге сұрақ жоқ. Конструкторды немесе импортты пайдаланыңыз.</div>}</div>
      </section>
    </div>}
    {tab==="assignments"&&<div className="teacher-tools-grid">
      <section className="teacher-panel">
        <div className="teacher-panel-title"><div><small>ЖАҢА ЖҰМЫС</small><h2>Үй тапсырмасын беру</h2></div><span>◷</span></div>
        <form className="teacher-question-form" onSubmit={createAssignment}>
          <label>Тапсырма атауы<input value={title} onChange={e=>setTitle(e.target.value)} maxLength="90" placeholder="Мысалы: Рационал сандарды қайталау"/></label>
          <label>Орындау мерзімі<input type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)} required/></label>
          <div className="teacher-assignment-settings">
            <b>Жеке оқу режимі</b>
            <label><input type="checkbox" checked={settings.adaptive} onChange={e=>setSettings(s=>({...s,adaptive:e.target.checked}))}/> Адаптивті күрделілік</label>
            <label><input type="checkbox" checked={settings.hints} onChange={e=>setSettings(s=>({...s,hints:e.target.checked}))}/> Подсказка қолдануға болады</label>
            <label><input type="checkbox" checked={settings.solutions} onChange={e=>setSettings(s=>({...s,solutions:e.target.checked}))}/> Жауаптан кейін шешімді көрсету</label>
            <label><input type="checkbox" checked={settings.simplified} onChange={e=>setSettings(s=>({...s,simplified:e.target.checked}))}/> Жеңілдетілген сұрақ мәтінін қолдану</label>
            <label><input type="checkbox" checked={settings.visualHints} onChange={e=>setSettings(s=>({...s,visualHints:e.target.checked}))}/> Визуалды ишараларды көрсету</label>
            <label>Қосымша уақыт<select value={settings.extraTime} onChange={e=>setSettings(s=>({...s,extraTime:Number(e.target.value)}))}><option value="1">Қалыпты · 45 сек</option><option value="1.5">1,5 есе · 68 сек</option><option value="2">2 есе · 90 сек</option></select></label>
          </div>
          <div className="teacher-select-question-title">Банк сұрақтарын таңдаңыз ({selectedQuestions.length})</div>
          <div className="teacher-select-questions">{questions.map(q=><label key={q.id}><input type="checkbox" checked={selectedQuestions.includes(q.id)} onChange={e=>setSelectedQuestions(old=>e.target.checked?[...old,q.id]:old.filter(id=>id!==q.id))}/><span><b>{q.q}</b><small>{q.topic} · {q.difficulty}</small></span></label>)}</div>
          {!questions.length&&<div className="teacher-empty">Алдымен сұрақтар банкін толтырыңыз.</div>}
          <button className="teacher-tool-primary" disabled={busy||!questions.length}>Сыныпқа жариялау →</button>
        </form>
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-title"><div><small>ЖАРИЯЛАНҒАН ЖҰМЫСТАР</small><h2>Үй тапсырмалары</h2></div><span>{assignments.length}</span></div>
        <div className="teacher-assignment-list">{assignments.length?assignments.map(a=><article key={a.id}><div><b>{a.title}</b><small>{a.questionCount||a.questions?.length||0} сұрақ · {a.grade}-сынып</small><small>Мерзімі: {a.dueAt?new Date(a.dueAt).toLocaleString("kk-KZ"):"Көрсетілмеген"}</small><small>Режим: жеке жаттығу · рейтингсіз</small></div><button onClick={()=>removeAssignment(a)}>×</button></article>):<div className="teacher-empty">Әзірге жарияланған тапсырма жоқ.</div>}</div>
      </section>
    </div>}
    {tab==="analytics"&&<div className="teacher-analytics-area">
      <section className="teacher-panel">
        <div className="teacher-panel-title"><div><small>ОҚУ НӘТИЖЕЛЕРІ</small><h2>Автоматты есеп</h2></div><button className="teacher-export-xlsx" onClick={exportReport} disabled={busy}>{busy?"Дайындалуда...":"↓ Excel есебі"}</button></div>
        <label className="teacher-report-select">Тапсырманы таңдау<select value={reportId} onChange={e=>setReportId(e.target.value)}>{assignments.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}</select></label>
        <div className="teacher-analytics teacher-analytics-expanded"><div><small>БАРЛЫҚ ОРЫНДАЛҒАН ЖҰМЫС</small><b>{classAttempts.length}</b></div><div><small>СЫНЫП ОРТАШАСЫ</small><b>{classAverage}%</b></div><div><small>ДҰРЫС ЖАУАП</small><b>{classCorrect}/{classTotal}</b></div></div><p className="teacher-hint">Төменде таңдалған тапсырманың жеке нәтижелері көрсетіледі: {average}% орташа.</p>
        {loadingReport?<div className="teacher-empty">Нәтижелер жүктелуде...</div>:<div className="teacher-report-table">{attempts.length?attempts.map(a=><article key={a.id}><b>{a.studentName||"Оқушы"}</b><span>{a.correctCount||0}/{a.total||0} дұрыс · {a.percent||0}%</span></article>):<div className="teacher-empty">Бұл тапсырма бойынша әзірге нәтиже жоқ.</div>}</div>}
        <div className="teacher-weak-topics"><h3>Қиындық туғызған тақырыптар</h3>{weakTopics.length?weakTopics.map(([topic,count])=><div key={topic}><span>{topic}</span><b>{count} қате</b></div>):<p>Қателер жиналған соң тақырыптар осы жерде көрсетіледі.</p>}</div>
      </section>
      <section className="teacher-panel">
        <div className="teacher-panel-title"><div><small>ТУРНИРЛЕР</small><h2>Турнир тарихы</h2></div><span>{rooms.length}</span></div>
        <div className="teacher-assignment-list">{rooms.length?rooms.map(room=><article key={room.id}><div><b>Бөлме {room.code||room.id}</b><small>{room.status==="finished"?"Аяқталған":room.status==="playing"?"Ойын жүріп жатыр":"Күту режимі"} · {Object.keys(room.players||{}).length} ойыншы</small><small>Раунд: {Math.max(0,(room.round??-1)+1)}</small><small>Жеңімпаз: {room.winnerTeam||room.winnerUid||"Анықталмаған"}</small></div></article>):<div className="teacher-empty">Бұл сыныпта әзірге турнир жоқ.</div>}</div>
      </section>
    </div>}
    {(message||error)&&<div className={error?"teacher-message error":"teacher-message"}>{error||message}</div>}
    <div className="teacher-tools-footnote">Оқушы жұмысы жеке режимде орындалады және сынып рейтингіне қосылмайды. Деректер Firebase Firestore-та сақталады.</div>
  </section>;
}

export function StudentAssignments({ joinCode, uid, studentName }) {
  const [assignments,setAssignments]=useState([]);
  const [active,setActive]=useState(null);
  const [remaining,setRemaining]=useState([]);
  const [currentIndex,setCurrentIndex]=useState(0);
  const [targetLevel,setTargetLevel]=useState(2);
  const [response,setResponse]=useState(null);
  const [results,setResults]=useState([]);
  const [seconds,setSeconds]=useState(45);
  const [showHint,setShowHint]=useState(false);
   const [showTutor,setShowTutor]=useState(false);
  const [complete,setComplete]=useState(false);
  const [summary,setSummary]=useState(null);
  const [error,setError]=useState("");
  const [startedAt,setStartedAt]=useState(0);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    if(!joinCode||!db)return;
    return onSnapshot(collection(db,"classPublic",joinCode,"assignments"),snap=>setAssignments(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(b.createdAt?.seconds||"").localeCompare(String(a.createdAt?.seconds||"")))),e=>setError(e.message));
  },[joinCode]);
  const questions=active?.questions||[];
  const question=questions[currentIndex];
  const multiplier=Number(active?.settings?.extraTime||1);
  const timeLimit=Math.round(45*multiplier);
  const dueExpired=a=>a.dueAt&&new Date(a.dueAt).getTime()<Date.now();
  const available=assignments.filter(a=>!dueExpired(a));
  const weakTopics=summary?.incorrectTopics||[];
  const recommendations=assignments.filter(a=>a.id!==active?.id&&(a.questions||[]).some(q=>weakTopics.includes(q.topic))).slice(0,3);

  function start(a){
    if(!a.questions?.length){setError("Бұл тапсырмада сұрақтар жоқ.");return;}
    setActive(a);setCurrentIndex(0);setRemaining(a.questions.map((q,i)=>i).slice(1));setTargetLevel(2);setResponse(null);setResults([]);setComplete(false);setSummary(null);setShowHint(false);setShowTutor(false);setSeconds(Math.round(45*Number(a.settings?.extraTime||1)));setStartedAt(Date.now());setError("");
  }
  function recordAnswer(optionIndex){
    if(response||!question)return;
    const correct=optionIndex===Number(question.answerIndex);
    const record={questionId:question.id||String(currentIndex),question:question.q,topic:question.topic||"Жалпы",selectedIndex:optionIndex,correctIndex:Number(question.answerIndex),correct};
    setResults(old=>[...old,record]);
    setResponse({correct,selectedIndex:optionIndex});
    if(active.settings?.adaptive!==false)setTargetLevel(level=>correct?Math.min(3,level+1):Math.max(1,level-1));
  }
  useEffect(()=>{
    if(!active||response||complete)return;
    const timer=window.setInterval(()=>setSeconds(value=>Math.max(0,value-1)),1000);
    return ()=>window.clearInterval(timer);
  },[active?.id,currentIndex,response,complete]);
  useEffect(()=>{
    if(active&&!complete&&!response&&seconds===0)recordAnswer(-1);
  },[seconds,active,complete,response,currentIndex]);
  async function finish(){
    if(!active||saving)return;
    setSaving(true);setError("");
    try{
      const correctCount=results.filter(x=>x.correct).length;
      const topicMap={};
      results.forEach(r=>{const item=topicMap[r.topic]||{total:0,correct:0};item.total++;if(r.correct)item.correct++;topicMap[r.topic]=item;});
      const incorrectTopics=[...new Set(results.filter(x=>!x.correct).map(x=>x.topic))];
      const percent=results.length?Math.round(correctCount/results.length*100):0;
      await addDoc(collection(db,"classPublic",joinCode,"assignments",active.id,"attempts"),{
        studentUid:uid,studentName,teacherUid:active.teacherUid,classId:active.classId,assignmentId:active.id,
        correctCount,total:results.length,percent,incorrectTopics,topicStats:topicMap,answers:results,
        durationMs:Date.now()-startedAt,completedAt:serverTimestamp()
      });
      setSummary({correctCount,total:results.length,percent,incorrectTopics});
      setComplete(true);
    }catch(e){setError("Нәтижені сақтау қатесі: "+e.message);}
    finally{setSaving(false);}
  }
  function next(){
    if(!response)return;
    if(!remaining.length){finish();return;}
    let chosen=remaining[0];
    if(active.settings?.adaptive!==false){
      chosen=remaining.slice().sort((a,b)=>Math.abs(difficultyValue(questions[a].difficulty)-targetLevel)-Math.abs(difficultyValue(questions[b].difficulty)-targetLevel))[0];
    }
    setRemaining(old=>old.filter(i=>i!==chosen));setCurrentIndex(chosen);setResponse(null);setShowHint(false);setShowTutor(false);setSeconds(timeLimit);
  }

  if(active&&!complete&&question)return <section className="student-assignment-player">
    <div className="student-assignment-top"><div><small>ЖЕКЕ ЖАТТЫҒУ · РЕЙТИНГСІЗ</small><h2>{active.title}</h2><p>{currentIndex+1} / {questions.length} сұрақ · {active.grade}-сынып</p></div><div className={seconds<=10?"student-timer urgent":"student-timer"}>◷ {seconds} сек</div></div>
    <div className="student-progress-track"><span style={{width:((results.length+(response?1:0))/questions.length*100)+"%"}}/></div>
    <div className="student-question-card"><small>{question.topic||"Жалпы"} · {question.difficulty==="easy"?"ЖЕҢІЛ":question.difficulty==="hard"?"ҚИЫН":"ОРТАША"}</small><h3>{active.settings?.simplified&&question.simpleQ?question.simpleQ:question.q}</h3>
      {active.settings?.visualHints&&question.visualHint&&<div className="student-visual-hint">🧩 {question.visualHint}</div>}
      <div className="student-answer-options">{(question.options||[]).map((option,i)=><button key={i} disabled={Boolean(response)} className={response?(i===question.answerIndex?"correct":i===response.selectedIndex?"incorrect":""):""} onClick={()=>recordAnswer(i)}><b>{["A","B","C","D"][i]}</b>{option}</button>)}</div>
      {!response&&active.settings?.hints&&question.hint&&<button className="student-hint-button" onClick={()=>setShowHint(v=>!v)}>💡 {showHint?"Подсказканы жасыру":"Подсказка алу"}</button>}
      {showHint&&!response&&<div className="student-hint-box">{question.hint}</div>}{!response&&<button className="student-hint-button ai-tutor-button" onClick={()=>setShowTutor(v=>!v)}>🤖 {showTutor?"Көмекшіні жасыру":"Math көмекшіден көмек алу"}</button>}{showTutor&&!response&&<div className="student-ai-tutor"><b>🤖 Math көмекші</b><p>{question.hint||"Алдымен есептің шартын мұқият оқып, қандай амал қолдану керегін анықта."}</p>{question.solution&&<details><summary>Қадамдық түсіндіру</summary><p>{question.solution}</p></details>}<small>Көмекші мұғалім енгізген ишаралар мен шешімге сүйенеді.</small></div>}
      {response&&<div className={response.correct?"student-answer-feedback correct":"student-answer-feedback incorrect"}><b>{response.correct?"Дұрыс жауап!":"Әлі де жаттығу керек."}</b>{active.settings?.solutions&&question.solution&&<p>{question.solution}</p>}{active.settings?.solutions&&<small>Дұрыс жауап: {question.options?.[question.answerIndex]}</small>}</div>}
    </div>
    {response&&<button className="teacher-tool-primary student-next-button" onClick={next} disabled={saving}>{remaining.length?"Келесі сұрақ →":saving?"Нәтиже сақталуда...":"Нәтижені аяқтау →"}</button>}
    <button className="student-exit-button" onClick={()=>{setActive(null);setComplete(false);}}>← Тапсырмаларға оралу</button>
    {error&&<div className="teacher-message error">{error}</div>}
  </section>;

  if(active&&complete)return <section className="student-assignment-player student-assignment-result">
    <div className="student-result-icon">✓</div><small>ЖЕКЕ ЖАТТЫҒУ АЯҚТАЛДЫ</small><h2>{active.title}</h2><div className="student-result-score">{summary?.percent||0}%</div><p>{summary?.correctCount||0} / {summary?.total||0} дұрыс жауап</p>
    {weakTopics.length>0&&<div className="student-result-recommendation"><b>Қайталауға ұсынылатын тақырыптар</b><p>{weakTopics.join(", ")}</p><small>Келесі жаттығуда осы тақырыптарға назар аударыңыз.</small></div>}
    {recommendations.length>0&&<div className="student-result-recommendation"><b>Сіздің келесі қадамдарыңыз</b>{recommendations.map(a=><button key={a.id} className="student-recommendation-button" onClick={()=>start(a)}>{a.title} →</button>)}</div>}
    <button className="teacher-tool-primary" onClick={()=>{setActive(null);setComplete(false);}}>Тапсырмалар тізіміне оралу</button>
  </section>;

  return <section className="student-assignment-list">
    <div className="teacher-panel-title"><div><small>ҮЙ ТАПСЫРМАСЫ ЖӘНЕ ЖАТТЫҒУ</small><h2>Сізге берілген жұмыстар</h2></div><span>{available.length}</span></div>
    {available.length?available.map(a=><article key={a.id}><div><b>{a.title}</b><small>{a.questionCount||a.questions?.length||0} сұрақ · {a.grade}-сынып</small><small>Мерзімі: {a.dueAt?new Date(a.dueAt).toLocaleString("kk-KZ"):"Көрсетілмеген"}</small><small>Рейтингсіз жеке жұмыс · подсказка {a.settings?.hints?"бар":"жоқ"}</small></div><button onClick={()=>start(a)}>Бастау →</button></article>):<div className="teacher-empty">Әзірге белсенді тапсырма жоқ.</div>}
    {assignments.filter(dueExpired).length>0&&<p className="teacher-hint">Мерзімі өткен тапсырма: {assignments.filter(dueExpired).length}</p>}
    {error&&<div className="teacher-message error">{error}</div>}
  </section>;
}
