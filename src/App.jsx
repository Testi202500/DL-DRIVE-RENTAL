import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

// ─── MOBILE DETECTION ────────────────────────────────────────────────────────
function useMobile() {
  const [mob, setMob] = useState(()=>typeof window!=="undefined"&&window.innerWidth<=768);
  useEffect(()=>{
    const fn=()=>setMob(window.innerWidth<=768);
    window.addEventListener("resize",fn);
    return ()=>window.removeEventListener("resize",fn);
  },[]);
  return mob;
}

// Global mobile CSS
const MOBILE_CSS = `
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; overflow-x:hidden; }
  input, select, textarea { font-size:16px !important; }
  ::-webkit-scrollbar { width:4px; height:4px; }
  ::-webkit-scrollbar-thumb { background:#334155; border-radius:4px; }
`;
if(typeof document!=="undefined"&&!document.getElementById("crm-mobile-css")){
  const s=document.createElement("style"); s.id="crm-mobile-css"; s.textContent=MOBILE_CSS;
  document.head.appendChild(s);
}

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────
const SB_URL = "https://ngpauvkegeuztpajndhu.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ncGF1dmtlZ2V1enRwYWpuZGh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MzcxNTcsImV4cCI6MjA5ODMxMzE1N30.HXRTE9hj-CHiBZDJM5tdwqyKonlSNJnvXeJHSheaI-8";
const HDRS = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
const STORAGE_URL = SB_URL + "/storage/v1/object/public/car-photos/";

// Supabase REST helpers
async function sbGet(table, params = "") {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + params + "&order=created_at.desc", { headers: { ...HDRS, "Prefer": "return=representation" } });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.status); }
  return r.json();
}
async function sbPost(table, body) {
  const r = await fetch(SB_URL + "/rest/v1/" + table, { method: "POST", headers: { ...HDRS, "Prefer": "return=representation" }, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.status); }
  return r.json();
}
async function sbPatch(table, id, body) {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?id=eq." + id, { method: "PATCH", headers: { ...HDRS, "Prefer": "return=representation" }, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.status); }
  return r.json();
}
async function sbDelete(table, id) {
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?id=eq." + id, { method: "DELETE", headers: HDRS });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.status); }
}
async function sbAuth(email, password) {
  const r = await fetch(SB_URL + "/auth/v1/token?grant_type=password", { method: "POST", headers: { "Content-Type": "application/json", "apikey": SB_KEY }, body: JSON.stringify({ email, password }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.message || "Login dështoi");
  return d;
}
async function sbSignOut(token) {
  await fetch(SB_URL + "/auth/v1/logout", { method: "POST", headers: { "apikey": SB_KEY, "Authorization": "Bearer " + token } });
}
async function sbRefreshToken(refreshToken) {
  const r = await fetch(SB_URL + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { "Content-Type": "application/json", "apikey": SB_KEY }, body: JSON.stringify({ refresh_token: refreshToken }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error_description || d.message || "Refresh dështoi");
  return d;
}
async function sbUploadPhoto(file, carName, token) {
  const ext = file.name.split(".").pop();
  const safeName = (carName||"makine").replace(/[^a-zA-Z0-9]+/g,"_").replace(/^_+|_+$/g,"") || "makine";
  const path = safeName + "." + ext;
  const r = await fetch(SB_URL + "/storage/v1/object/car-photos/" + encodeURIComponent(path), {
    method: "POST", headers: { "apikey": SB_KEY, "Authorization": "Bearer " + token, "Content-Type": file.type, "x-upsert": "true" },
    body: file
  });
  if (!r.ok) {
    const errText = await r.text().catch(()=>"");
    throw new Error("Upload dështoi: " + (errText || r.status));
  }
  return STORAGE_URL + encodeURIComponent(path);
}

// Authenticated fetch (uses session token)
async function sbAuthGet(table, params = "", token) {
  const h = { ...HDRS, "Authorization": "Bearer " + token };
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + params + "&order=created_at.desc", { headers: { ...h, "Prefer": "return=representation" } });
  if (!r.ok) {
    const e = await r.json().catch(()=>({message:String(r.status)}));
    const msg = e.message || String(r.status);
    if(msg.toLowerCase().includes("jwt")||msg.toLowerCase().includes("expired")||r.status===401){
      if(window.__sessionExpiredHandler) window.__sessionExpiredHandler();
      const err = new Error("Sesioni skadoi, duke ridrejtuar te login...");
      err.isAuthError = true;
      throw err;
    }
    throw new Error(msg);
  }
  return r.json();
}
async function sbAuthPost(table, body, token) {
  const h = { ...HDRS, "Authorization": "Bearer " + token, "Prefer": "return=representation" };
  const r = await fetch(SB_URL + "/rest/v1/" + table, { method: "POST", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(()=>({message:r.status})); throw new Error(e.message || r.status); }
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}
async function sbAuthPatch(table, id, body, token) {
  const h = { ...HDRS, "Authorization": "Bearer " + token, "Prefer": "return=representation" };
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?id=eq." + id, { method: "PATCH", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.status); }
  return r.json();
}
async function sbAuthDelete(table, id, token) {
  const h = { ...HDRS, "Authorization": "Bearer " + token };
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?id=eq." + id, { method: "DELETE", headers: h });
  if (!r.ok) { const e = await r.json(); throw new Error(e.message || r.status); }
}
async function sbAuthPatchWhere(table, filterQS, body, token) {
  const h = { ...HDRS, "Authorization": "Bearer " + token, "Prefer": "return=representation" };
  const r = await fetch(SB_URL + "/rest/v1/" + table + "?" + filterQS, { method: "PATCH", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(()=>({message:r.status})); throw new Error(e.message || r.status); }
  const text = await r.text();
  return text ? JSON.parse(text) : [];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CAR_PALETTE = [
  {bg:"#dbeafe",tx:"#1e40af",ac:"#3b82f6"}, {bg:"#dcfce7",tx:"#166534",ac:"#16a34a"},
  {bg:"#fef3c7",tx:"#92400e",ac:"#d97706"}, {bg:"#ede9fe",tx:"#5b21b6",ac:"#7c3aed"},
  {bg:"#fee2e2",tx:"#991b1b",ac:"#dc2626"}, {bg:"#f0fdf4",tx:"#14532d",ac:"#059669"},
  {bg:"#fdf4ff",tx:"#6b21a8",ac:"#a855f7"}, {bg:"#fff7ed",tx:"#9a3412",ac:"#ea580c"},
];
const SC = {
  "Konfirmuar":{bg:"#dbeafe",tx:"#1e40af",bd:"#bfdbfe"},
  "Aktive":    {bg:"#dcfce7",tx:"#166534",bd:"#bbf7d0"},
  "Dorëzuar":  {bg:"#fef3c7",tx:"#92400e",bd:"#fde68a"},
  "Përfunduar":{bg:"#f3f4f6",tx:"#374151",bd:"#e5e7eb"},
  "Anuluar":   {bg:"#fee2e2",tx:"#991b1b",bd:"#fecaca"},
};
const CATS = ["Mirëmbajtje","Karburant","Sigurim","Taksa","Paga","Reklamë","Zyrë","Tjetër"];
const DAYS_SQ = ["Di","Hë","Ma","Më","En","Pë","Sh"];

function carColor(car, cars) { const i = cars.findIndex(c=>(c.name||c)===car); return CAR_PALETTE[Math.max(i,0) % CAR_PALETTE.length]; }
function carLabel(name, cars) { const c=cars?.find(x=>x.name===name); return (c&&c.targa) ? c.targa : (name||"-"); }
function gid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
function toYMD(d) { return d.toISOString().slice(0,10); }
function addD(s,n) { const d=new Date(s); d.setDate(d.getDate()+n); return toYMD(d); }
function fmtD(s) { if(!s) return ""; const d=new Date(s); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0"); }
function fmtFull(s) { if(!s) return ""; const d=new Date(s); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); }
function fmtDT(s) { if(!s) return ""; const d=new Date(s); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear()+" "+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function fmtM(a,c) { return c==="EUR"?"€"+Number(a).toFixed(2):Number(a).toLocaleString("sq-AL")+" L"; }
// Shuma "efektive" e paguar: nëse statusi është "paguar", trajtoje si të paguar plotësisht
// edhe nëse fusha amount_paid nuk është sinkronizuar (rregullon rezervimet e vjetra/të ndryshuara manualisht)
function effPaid(r) { return r.payment_status==="paguar" ? Number(r.total_price||0) : Number(r.amount_paid||0); }
function dow(s) { return DAYS_SQ[new Date(s).getDay()]; }
function isWE(s) { const d=new Date(s).getDay(); return d===0||d===6; }
function diffDays(a,b) { if(!a||!b) return 0; return Math.max(1,Math.ceil((new Date(b)-new Date(a))/86400000)); }
function nowStr() { return fmtDT(new Date().toISOString()); }
function todayY() { return toYMD(new Date()); }

const PB  = {padding:"8px 16px",borderRadius:8,background:"#1d4ed8",color:"#fff",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"};
const CB  = {padding:"8px 16px",borderRadius:8,background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
const IB  = {padding:"6px 10px",borderRadius:7,background:"#f8fafc",border:"1px solid #e2e8f0",cursor:"pointer",fontSize:13,fontFamily:"inherit"};
const FL  = {width:"100%",padding:"9px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"#fafafa"};
const NB  = {padding:"7px 14px",borderRadius:8,background:"#f1f5f9",border:"1px solid #e2e8f0",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600};

function Badge({s}) { const c=SC[s]||{bg:"#f3f4f6",tx:"#374151"}; return <span style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:c.bg,color:c.tx}}>{s}</span>; }
function DateInput({value,onChange,style}){
  const [dd,setDd]=useState("");
  const [mm,setMm]=useState("");
  const [yy,setYy]=useState("");
  const ddRef=useRef(null), mmRef=useRef(null), yyRef=useRef(null);

  useEffect(()=>{
    if(value){
      const [y,m,d]=value.split("-");
      setDd(d||""); setMm(m||""); setYy(y||"");
    } else {
      setDd(""); setMm(""); setYy("");
    }
  },[value]);

  function tryCommit(d,m,y){
    if(d.length===2&&m.length===2&&y.length===4){
      const iso=y+"-"+m+"-"+d;
      const dt=new Date(iso+"T00:00:00");
      if(!isNaN(dt.getTime())&&dt.getDate()===Number(d)&&(dt.getMonth()+1)===Number(m)){
        onChange(iso); return;
      }
    }
    if(d===""&&m===""&&y==="") onChange("");
  }
  function onDd(e){
    const v=e.target.value.replace(/\D/g,"").slice(0,2);
    setDd(v); tryCommit(v,mm,yy);
    if(v.length===2) mmRef.current?.focus();
  }
  function onMm(e){
    const v=e.target.value.replace(/\D/g,"").slice(0,2);
    setMm(v); tryCommit(dd,v,yy);
    if(v.length===2) yyRef.current?.focus();
  }
  function onYy(e){
    const v=e.target.value.replace(/\D/g,"").slice(0,4);
    setYy(v); tryCommit(dd,mm,v);
  }
  function onMmKey(e){ if(e.key==="Backspace"&&mm==="") ddRef.current?.focus(); }
  function onYyKey(e){ if(e.key==="Backspace"&&yy==="") mmRef.current?.focus(); }
  function onNativeDate(e){
    const v=e.target.value;
    if(v){ const [y,m,d]=v.split("-"); setDd(d); setMm(m); setYy(y); onChange(v); }
  }

  const segStyle={textAlign:"center",border:"none",outline:"none",background:"transparent",fontFamily:"inherit",fontSize:13,padding:0,color:"#0f172a"};

  return (
    <div style={{position:"relative",width:"100%"}}>
      <div style={{...(style||FL),display:"flex",alignItems:"center",gap:2,paddingRight:26,width:"100%",boxSizing:"border-box"}}>
        <input ref={ddRef} value={dd} onChange={onDd} placeholder="dd" maxLength={2} style={{...segStyle,width:18}}/>
        <span style={{color:"#94a3b8"}}>/</span>
        <input ref={mmRef} value={mm} onChange={onMm} onKeyDown={onMmKey} placeholder="mm" maxLength={2} style={{...segStyle,width:18}}/>
        <span style={{color:"#94a3b8"}}>/</span>
        <input ref={yyRef} value={yy} onChange={onYy} onKeyDown={onYyKey} placeholder="yyyy" maxLength={4} style={{...segStyle,width:34}}/>
      </div>
      <input type="date" value={value||""} onChange={onNativeDate} tabIndex={-1}
        style={{position:"absolute",right:3,top:3,bottom:3,width:22,opacity:0,cursor:"pointer",border:"none",padding:0}}/>
      <span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:13,pointerEvents:"none"}}>📅</span>
    </div>
  );
}

function Fld({label,col2,children}) { return <div style={{gridColumn:col2?"span 2":"span 1"}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{label}</label>{children}</div>; }
function Modal({title,onClose,children,wide}) {
  const mob = window.innerWidth <= 768;
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",padding:mob?0:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#fff",borderRadius:mob?"16px 16px 0 0":16,padding:mob?"16px 12px 24px":"20px 16px",width:"100%",maxWidth:mob?"100%":wide?680:520,maxHeight:mob?"92vh":"92vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:14}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:"#0f172a",flex:1}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8",lineHeight:1,padding:"4px 8px"}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}
function Spin() { return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60,flexDirection:"column",gap:12}}><div style={{width:36,height:36,border:"3px solid #e2e8f0",borderTop:"3px solid #1d4ed8",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style><span style={{color:"#94a3b8",fontSize:13}}>Duke ngarkuar...</span></div>; }
function Err({msg, onRetry}) { return <div style={{padding:24,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,margin:16,textAlign:"center"}}><div style={{color:"#dc2626",fontWeight:700,marginBottom:8}}>⚠️ {msg}</div>{onRetry&&<button onClick={onRetry} style={PB}>Provo Sërish</button>}</div>; }

// ══════════════════════════════════════════════════════════════════════════
// ─── KONTRATA E QERASE — komponentë të reja ──────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

// ─── SIGNATURE PAD (nënshkrim me mouse/gisht, pa librari të jashtme) ──────
function SignaturePad({value,onChange}) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPt = useRef(null);
  const [empty, setEmpty] = useState(!value);

  useEffect(()=>{
    // Nese ka nje vlere fillestare (p.sh. ne rihapje edit), e vizatojme
    if(value && canvasRef.current){
      const img = new Image();
      img.onload = ()=>{
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
        ctx.drawImage(img,0,0,canvasRef.current.width,canvasRef.current.height);
      };
      img.src = value;
      setEmpty(false);
    }
  },[]); // vetem ne mount

  function pos(e) {
    const r = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    const scaleX = canvasRef.current.width / r.width;
    const scaleY = canvasRef.current.height / r.height;
    return { x: (t.clientX - r.left)*scaleX, y: (t.clientY - r.top)*scaleY };
  }
  function start(e) { e.preventDefault(); drawing.current = true; lastPt.current=null; draw(e); }
  function draw(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const {x,y} = pos(e);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a";
    if (!lastPt.current) { ctx.beginPath(); ctx.moveTo(x,y); lastPt.current={x,y}; return; }
    ctx.beginPath(); ctx.moveTo(lastPt.current.x,lastPt.current.y); ctx.lineTo(x,y); ctx.stroke();
    lastPt.current={x,y};
    setEmpty(false);
  }
  function end() {
    if(!drawing.current) return;
    drawing.current=false; lastPt.current=null;
    onChange(canvasRef.current.toDataURL("image/png"));
  }
  function clear() {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
    setEmpty(true); onChange("");
  }

  return (
    <div>
      <canvas ref={canvasRef} width={500} height={160}
        style={{width:"100%",height:130,border:"1.5px solid #e2e8f0",borderRadius:8,background:"#fafafa",touchAction:"none",display:"block"}}
        onMouseDown={start} onMouseMove={draw} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={draw} onTouchEnd={end}/>
      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6}}>
        <button type="button" onClick={clear} style={{...CB,fontSize:11,padding:"5px 10px"}}>✕ Pastro Nënshkrimin</button>
        {empty && <span style={{fontSize:11,color:"#dc2626",fontWeight:600}}>⚠️ Nënshkrimi mungon</span>}
        {!empty && <span style={{fontSize:11,color:"#16a34a",fontWeight:600}}>✓ Nënshkruar</span>}
      </div>
    </div>
  );
}

// ─── DIAGRAMI I DËMTIMEVE (SVG interaktiv, klikohet mbi makinë) ───────────
const DAMAGE_TYPES = ["scratch","dent","broken","missing"];
const DAMAGE_COLOR = {scratch:"#f59e0b",dent:"#0ea5e9",broken:"#dc2626",missing:"#7c3aed"};
const DAMAGE_SYMBOL = {scratch:"−",dent:"○",broken:"✕",missing:"▣"};
const DAMAGE_LB = {scratch:"− Gërvishtje",dent:"○ Gropë",broken:"✕ Thyer",missing:"▣ Mungon"};
const CAR_VIEWS = [
  {key:"front", label:"Para"},
  {key:"left",  label:"E Majtë"},
  {key:"right", label:"E Djathtë"},
  {key:"rear",  label:"Mbrapa"},
  {key:"top",   label:"Sipër"},
];
const VIEW_LB = {front:"Para",left:"E Majtë",right:"E Djathtë",rear:"Mbrapa",top:"Sipër"};
const VIEW_LB_EN = {front:"Front",left:"Left",right:"Right",rear:"Rear",top:"Top"};

// ─── SILUETA E MAKINËS PËR ÇDO PAMJE (viewBox 0 0 300 160 për të gjitha) ───
function CarViewShape({view}) {
  if(view==="top"){
    return <>
      <rect x="40" y="26" width="220" height="108" rx="24" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      <rect x="72" y="26" width="156" height="108" rx="16" fill="#f1f5f9" stroke="#cbd5e1"/>
      <rect x="95" y="34" width="110" height="26" rx="6" fill="#e2e8f0" stroke="#cbd5e1"/>
      <circle cx="76" cy="26" r="9" fill="#94a3b8"/><circle cx="76" cy="134" r="9" fill="#94a3b8"/>
      <circle cx="224" cy="26" r="9" fill="#94a3b8"/><circle cx="224" cy="134" r="9" fill="#94a3b8"/>
    </>;
  }
  if(view==="left"||view==="right"){
    const body = <>
      <rect x="50" y="88" width="220" height="42" rx="12" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      <path d="M88,88 L112,48 Q122,38 136,38 L198,38 Q212,38 220,48 L244,88 Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5"/>
      <line x1="152" y1="38" x2="152" y2="88" stroke="#cbd5e1"/>
      <line x1="204" y1="42" x2="204" y2="88" stroke="#cbd5e1"/>
      <circle cx="102" cy="132" r="17" fill="#94a3b8" stroke="#64748b"/>
      <circle cx="222" cy="132" r="17" fill="#94a3b8" stroke="#64748b"/>
      <circle cx="102" cy="132" r="7" fill="#cbd5e1"/>
      <circle cx="222" cy="132" r="7" fill="#cbd5e1"/>
    </>;
    return view==="left" ? body : <g transform="scale(-1,1) translate(-300,0)">{body}</g>;
  }
  if(view==="front"||view==="rear"){
    const lightColor = view==="front" ? "#fbbf24" : "#f87171";
    return <>
      <rect x="80" y="30" width="140" height="100" rx="22" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
      <rect x="98" y="44" width="104" height="34" rx="7" fill="#f1f5f9" stroke="#cbd5e1"/>
      <circle cx="100" cy="118" r="11" fill={lightColor} stroke="#94a3b8"/>
      <circle cx="200" cy="118" r="11" fill={lightColor} stroke="#94a3b8"/>
      <rect x="70" y="108" width="18" height="28" rx="4" fill="#94a3b8"/>
      <rect x="212" y="108" width="18" height="28" rx="4" fill="#94a3b8"/>
      <rect x="120" y="100" width="60" height="10" rx="3" fill="#cbd5e1"/>
    </>;
  }
  return null;
}

// ─── I njëjti siluet, si STRING SVG (për ta ngulitur në HTML-në e printuar) ─
function carViewShapeSVGString(view){
  if(view==="top"){
    return `<rect x="40" y="26" width="220" height="108" rx="24" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/><rect x="72" y="26" width="156" height="108" rx="16" fill="#f1f5f9" stroke="#cbd5e1"/><rect x="95" y="34" width="110" height="26" rx="6" fill="#e2e8f0" stroke="#cbd5e1"/><circle cx="76" cy="26" r="9" fill="#94a3b8"/><circle cx="76" cy="134" r="9" fill="#94a3b8"/><circle cx="224" cy="26" r="9" fill="#94a3b8"/><circle cx="224" cy="134" r="9" fill="#94a3b8"/>`;
  }
  if(view==="left"||view==="right"){
    const body = `<rect x="50" y="88" width="220" height="42" rx="12" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/><path d="M88,88 L112,48 Q122,38 136,38 L198,38 Q212,38 220,48 L244,88 Z" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1.5"/><line x1="152" y1="38" x2="152" y2="88" stroke="#cbd5e1"/><line x1="204" y1="42" x2="204" y2="88" stroke="#cbd5e1"/><circle cx="102" cy="132" r="17" fill="#94a3b8" stroke="#64748b"/><circle cx="222" cy="132" r="17" fill="#94a3b8" stroke="#64748b"/><circle cx="102" cy="132" r="7" fill="#cbd5e1"/><circle cx="222" cy="132" r="7" fill="#cbd5e1"/>`;
    return view==="left" ? body : `<g transform="scale(-1,1) translate(-300,0)">${body}</g>`;
  }
  if(view==="front"||view==="rear"){
    const lightColor = view==="front" ? "#fbbf24" : "#f87171";
    return `<rect x="80" y="30" width="140" height="100" rx="22" fill="#e2e8f0" stroke="#94a3b8" stroke-width="1.5"/><rect x="98" y="44" width="104" height="34" rx="7" fill="#f1f5f9" stroke="#cbd5e1"/><circle cx="100" cy="118" r="11" fill="${lightColor}" stroke="#94a3b8"/><circle cx="200" cy="118" r="11" fill="${lightColor}" stroke="#94a3b8"/><rect x="70" y="108" width="18" height="28" rx="4" fill="#94a3b8"/><rect x="212" y="108" width="18" height="28" rx="4" fill="#94a3b8"/><rect x="120" y="100" width="60" height="10" rx="3" fill="#cbd5e1"/>`;
  }
  return "";
}
// Gjeneron një diagram SVG të vogël (me pikat e dëmtimit) për çdo pamje që ka të paktën një dëmtim
function damageDiagramSVGBlock(points){
  if(!points||!points.length) return "";
  const presentViews = [...new Set(points.map(p=>p.view||"top"))];
  const order = CAR_VIEWS.map(v=>v.key).filter(k=>presentViews.includes(k));
  return `<div class="dmg-diagrams">${order.map(view=>{
    const pts = points.filter(p=>(p.view||"top")===view);
    const dots = pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="9" fill="${DAMAGE_COLOR[p.type]}" stroke="#fff" stroke-width="1.8"/><text x="${p.x}" y="${p.y+3.5}" text-anchor="middle" font-size="10" fill="#fff" font-weight="800">${DAMAGE_SYMBOL[p.type]}</text>`).join("");
    return `<div class="dmg-diagram-box">
      <svg viewBox="0 0 300 160" width="160" height="86">${carViewShapeSVGString(view)}${dots}</svg>
      <div class="dmg-diagram-label">${VIEW_LB[view]} / ${VIEW_LB_EN[view]}</div>
    </div>`;
  }).join("")}</div>`;
}

function CarDamageDiagram({points,onChange,readOnly}) {
  const [nextType,setNextType]=useState(0);
  const [view,setView]=useState("front");
  const viewPoints = (points||[]).map((p,idx)=>({...p,_idx:idx})).filter(p=>(p.view||"top")===view);

  function addPoint(e) {
    if(readOnly) return;
    const rect=e.currentTarget.getBoundingClientRect();
    const x=Number(((e.clientX-rect.left)/rect.width*300).toFixed(0));
    const y=Number(((e.clientY-rect.top)/rect.height*160).toFixed(0));
    onChange([...(points||[]),{x,y,type:DAMAGE_TYPES[nextType],view}]);
  }
  function removePoint(realIdx,e) {
    e.stopPropagation();
    if(readOnly) return;
    onChange(points.filter((_,idx)=>idx!==realIdx));
  }

  return (
    <div>
      {!readOnly&&(
        <div style={{display:"flex",gap:5,marginBottom:8,flexWrap:"wrap"}}>
          {DAMAGE_TYPES.map((t,i)=>(
            <button key={t} type="button" onClick={()=>setNextType(i)} style={{
              padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",
              border:"1.5px solid "+DAMAGE_COLOR[t],
              background:nextType===i?DAMAGE_COLOR[t]:"#fff",
              color:nextType===i?"#fff":DAMAGE_COLOR[t]
            }}>{DAMAGE_LB[t]}</button>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:4,marginBottom:8,flexWrap:"wrap"}}>
        {CAR_VIEWS.map(v=>{
          const cnt=(points||[]).filter(p=>(p.view||"top")===v.key).length;
          return (
            <button key={v.key} type="button" onClick={()=>setView(v.key)} style={{
              padding:"5px 11px",borderRadius:8,fontSize:11,fontWeight:700,cursor:"pointer",
              border:"1.5px solid "+(view===v.key?"#1d4ed8":"#e2e8f0"),
              background:view===v.key?"#1d4ed8":"#fff",
              color:view===v.key?"#fff":"#475569"
            }}>{v.label}{cnt>0?" ("+cnt+")":""}</button>
          );
        })}
      </div>
      <svg viewBox="0 0 300 160" onClick={addPoint} style={{width:"100%",background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,cursor:readOnly?"default":"crosshair",display:"block"}}>
        <CarViewShape view={view}/>
        <text x="150" y="14" textAnchor="middle" fontSize="10" fontWeight="700" fill="#94a3b8">{VIEW_LB[view].toUpperCase()}</text>
        {viewPoints.map(p=>(
          <g key={p._idx} onClick={e=>removePoint(p._idx,e)} style={{cursor:readOnly?"default":"pointer"}}>
            <circle cx={p.x} cy={p.y} r="8" fill={DAMAGE_COLOR[p.type]} stroke="#fff" strokeWidth="1.5"/>
            <text x={p.x} y={p.y+3} textAnchor="middle" fontSize="9" fill="#fff" fontWeight="800">{DAMAGE_SYMBOL[p.type]}</text>
          </g>
        ))}
      </svg>
      {!readOnly&&<div style={{fontSize:10,color:"#94a3b8",marginTop:4}}>Zgjidh pamjen (Para/E Majtë/E Djathtë/Mbrapa/Sipër) · Kliko mbi makinë për të shënuar dëmtim · Kliko mbi shenjën për ta hequr</div>}
    </div>
  );
}

const DAMAGE_LB_EN = {scratch:"− Scratch",dent:"○ Dent",broken:"✕ Broken",missing:"▣ Missing"};

// ─── UPLOAD FOTO PER KONTRATE (dëmtime/gjendje makine) ────────────────────
async function sbUploadContractPhoto(file, resId, stage, token) {
  const ext = (file.name.split(".").pop()||"jpg").toLowerCase();
  const path = "contracts/"+resId+"_"+stage+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,7)+"."+ext;
  const r = await fetch(SB_URL + "/storage/v1/object/car-photos/" + encodeURIComponent(path), {
    method: "POST", headers: { "apikey": SB_KEY, "Authorization": "Bearer " + token, "Content-Type": file.type||"image/jpeg" },
    body: file
  });
  if (!r.ok) {
    const errText = await r.text().catch(()=>"");
    throw new Error("Upload dështoi: " + (errText || r.status));
  }
  return STORAGE_URL + encodeURIComponent(path);
}

// ─── NGARKUES FOTOSH (multi, me miniatura + fshirje) ──────────────────────
function PhotoUploader({photos,onChange,uploadFn,label}) {
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef(null);
  async function handleFiles(files){
    if(!files||!files.length) return;
    setUploading(true);
    try {
      const urls=[];
      for(const file of Array.from(files)){
        const url=await uploadFn(file);
        urls.push(url);
      }
      onChange([...(photos||[]),...urls]);
    } catch(e){ alert("Ngarkimi i fotos dështoi: "+e.message); }
    setUploading(false);
    if(fileRef.current) fileRef.current.value="";
  }
  function removePhoto(i){ onChange((photos||[]).filter((_,idx)=>idx!==i)); }
  return (
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:6}}>
        {(photos||[]).map((url,i)=>(
          <div key={i} style={{position:"relative",width:76,height:76,borderRadius:8,overflow:"hidden",border:"1px solid #e2e8f0",flexShrink:0}}>
            <img src={url} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
            <button type="button" onClick={()=>removePhoto(i)} style={{position:"absolute",top:2,right:2,background:"rgba(0,0,0,0.65)",color:"#fff",border:"none",borderRadius:"50%",width:18,height:18,fontSize:10,cursor:"pointer",lineHeight:1,padding:0}}>✕</button>
          </div>
        ))}
        <label style={{width:76,height:76,borderRadius:8,border:"2px dashed #cbd5e1",display:"flex",alignItems:"center",justifyContent:"center",cursor:uploading?"wait":"pointer",fontSize:20,color:"#94a3b8",flexShrink:0,background:"#fafafa"}}>
          {uploading?"⏳":"➕"}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple onChange={e=>handleFiles(e.target.files)} style={{display:"none"}} disabled={uploading}/>
        </label>
      </div>
      <div style={{fontSize:10,color:"#94a3b8"}}>{label||"Ngarko foto të gjendjes/dëmtimeve të makinës (mund të zgjedhësh disa njëherësh)"}</div>
    </div>
  );
}

// ─── OPSIONET E SIGURIMIT (Neni 3 i kontratës) ────────────────────────────
const COMPANY_SIGNATURE_STAMP = "data:image/jpeg;base64,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";

const INSURANCE_OPTIONS = {
  baze: {
    label: "Sigurim Bazë (i përfshirë)",
    labelEn: "Basic Insurance (included)",
    fee: 0,
    coversAl: "Dëme ndaj palëve të treta (nëse klienti godet një makinë tjetër).",
    notCoversAl: "Dëme në makinën e marrë me qera; gërvishtje, aksidente, dëmtime; vjedhje; përdorim i gabuar.",
    coversEn: "Damage to third parties (if the client hits another vehicle).",
    notCoversEn: "Damage to the rented vehicle itself; scratches, accidents, damage; theft; improper use."
  },
  pjesshem: {
    label: "Sigurim i Pjesshëm (+10€/ditë)",
    labelEn: "Partial Insurance (+€10/day)",
    fee: 10,
    coversAl: "Dëmtime të kufizuara në makinë nga aksidente të lehta dhe gërvishtje/dëmtime të jashtme. Qiramarrësi mban përgjegjësi deri në shumën e excess-it të specifikuar.",
    notCoversAl: "Drejtim nën ndikimin e alkoolit/drogës; shkelje të rregullave të qarkullimit; përdorim i gabuar i makinës; dëmtime nga pakujdesi ekstreme; humbje çelësash; dëmtime në brendësi; dëme te goma, disqe, xhama.",
    coversEn: "Limited vehicle damage from light accidents and external scratches/damage. The renter remains liable up to the specified excess amount.",
    notCoversEn: "Driving under alcohol/drug influence; traffic rule violations; improper vehicle use; damage from extreme negligence; lost keys; interior damage; tire, wheel, or glass damage."
  },
  plote: {
    label: "Sigurim i Plotë (+20€/ditë)",
    labelEn: "Full Insurance (+€20/day)",
    fee: 20,
    coversAl: "Shumica e dëmtimeve të automjetit gjatë qerasë (aksidente, përplasje, gërvishtje), duke reduktuar përgjegjësinë financiare të qiramarrësit në minimum ose zero.",
    notCoversAl: "Dëme nga neglizhenca e rëndë, drejtim nën ndikim alkooli/substancash, shkelje të rregullave të qarkullimit, humbje çelësash, dëmtime në brendësi të automjetit.",
    coversEn: "Most vehicle damage during the rental (accidents, collisions, scratches), reducing the renter's financial liability to a minimum or zero.",
    notCoversEn: "Damage from gross negligence, driving under alcohol/substance influence, traffic rule violations, lost keys, interior vehicle damage."
  }
};

// ─── GJENERIMI I PDF-SË SË KONTRATËS — dygjuhëshe (Shqip / English) ───────
function buildContractHTML(c, cars, stage) {
  const carObj = cars.find(x=>x.name===c.car_name);
  const carLbl = carObj?.targa || c.car_name;
  const brand = JSON.parse(localStorage.getItem("crm_brand")||"{}");
  const companyName = brand.appName || "Car Rental Manager";
  const contractNo = (c.id||c.reservation_id||"").toString().replace(/-/g,"").slice(0,8).toUpperCase();
  const contactLine = [brand.companyAddress, brand.companyPhone?("Tel: "+brand.companyPhone):"", brand.companyEmail].filter(Boolean).join("  ·  ");
  const legalLine = [brand.companyNipt?("NIPT: "+brand.companyNipt):"", brand.companyWebsite].filter(Boolean).join("  ·  ");

  function dmgList(pts){
    if(!pts||!pts.length) return "";
    return pts.map(p=>{
      const vLb = VIEW_LB[p.view||"top"]||"";
      const vLbEn = VIEW_LB_EN[p.view||"top"]||"";
      return vLb+" — "+DAMAGE_LB[p.type]+" / "+vLbEn+" — "+DAMAGE_LB_EN[p.type];
    }).join("; ");
  }
  function photosGrid(urls){
    if(!urls||!urls.length) return "";
    return `<div class="photos">${urls.map(u=>`<img src="${u}"/>`).join("")}</div>`;
  }
  // Rreshta boshe hiqen krejtësisht — nuk shfaqim fusha bosh (format më i pastër, si kontratat evropiane)
  function row(lbl,val){ return (val===undefined||val===null||val==="")?"":`<tr><th>${lbl}</th><td>${val}</td></tr>`; }
  const showDropoff = stage==="dropoff" || c.status==="completed" || !!c.dropoff_signature;
  const toBePaid = (c.total_price!=null && c.total_paid!=null && c.total_paid!=="") ? (Number(c.total_price)-Number(c.total_paid)) : null;

  const TERMS = [
    ["A) Sigurimi dhe Pajisjet","Automjeti mbulohet nga sigurimi i detyrueshëm ndaj palëve të treta sipas legjislacionit shqiptar. Automjeti dorëzohet me kilometrazhin real, aksesorët, triangullin paralajmërues, gomën rezervë ose kit riparimi, xhupin reflektues dhe çdo pajisje tjetër të kërkuar nga ligji. Qiramarrësi është përgjegjës për kthimin e këtyre pajisjeve në gjendje të mirë pune; humbja, dëmtimi apo mungesa e tyre ngarkohet me koston përkatëse të zëvendësimit.",
     "A) Insurance and Equipment. The vehicle is covered by mandatory third-party liability insurance under Albanian law. The vehicle is delivered with the actual mileage, accessories, warning triangle, spare wheel or repair kit, reflective vest, and any other equipment required by law. The renter is responsible for returning this equipment in good working condition; its loss, damage, or absence will be charged at the corresponding replacement cost."],
    ["B) Dorëzimi dhe Kthimi i Automjetit","Qiraja fillon në ditën dhe orën e dorëzimit të automjetit te qiramarrësi dhe përfundon në ditën dhe orën e kthimit të tij te qiradhënësi. Automjeti dorëzohet në gjendje të mirë dhe duhet kthyer në të njëjtën gjendje, me përjashtim të konsumit normal. Nëse në momentin e kthimit konstatohen dëmtime të reja, qiradhënësi do të informojë qiramarrësin, do t'i paraqesë foto dhe do t'i kërkojë komente përpara se të vazhdojë me faturimin e dëmit. Një tolerancë prej 59 minutash lejohet përtej orës së përcaktuar për kthim; përtej kësaj toleranca, ngarkohet një ditë shtesë qiraje me çmimin ditor plus 50%. Nëse qiramarrësi nuk paraqitet dhe nuk kontaktohet dot deri në orën 12:00 të ditës së kthimit të parashikuar, rasti mund t'i kalohet autoriteteve kompetente si përvetësim i paligjshëm i automjetit, dhe çdo ditë e mëtejshme vonese ngarkohet me çmimin ditor plus 100%. Nëse çelësat nuk kthehen (humbje, dëmtim, apo manipulim), qiramarrësi mban përgjegjësi për një penalitet të paracaktuar; e njëjta gjë vlen për humbjen apo dëmtimin e targës së automjetit.",
     "B) Delivery and Return of the Vehicle. The rental starts on the day and time the vehicle is delivered to the renter and ends on the day and time it is returned to the lessor. The vehicle is delivered in good condition and must be returned in the same condition, normal wear excepted. If new damage is found upon return, the lessor will inform the renter, provide photos, and request comments before proceeding with any charge. A 59-minute tolerance is allowed beyond the agreed return time; beyond that, an extra rental day is charged at the daily rate plus 50%. If the renter does not appear and cannot be reached by 12:00 on the scheduled return day, the matter may be referred to the competent authorities as unlawful appropriation of the vehicle, and each further day of delay is charged at the daily rate plus 100%. If the keys are not returned (lost, damaged, or tampered with), the renter is liable for a predetermined penalty; the same applies to loss or damage of the vehicle's license plate."],
    ["C) Depozita e Garancisë me Kartë","Qiramarrësi (shoferi kryesor) duhet të paraqesë një kartë krediti/debiti ose një shumë cash si garanci për shërbimin e qerasë. Shuma e depozitës është ajo e specifikuar në këtë kontratë. Depozita çlirohet plotësisht ose pjesërisht kundrejt shumave që i detyrohen qiradhënësit sipas nenit H më poshtë. Qiramarrësi autorizon përdorimin e kartës/shumës së dhënë si mjeti i vetëm pagese për çdo detyrim që lind nga kjo kontratë.",
     "C) Security Deposit with Card. The renter (main driver) must provide a credit/debit card or a cash amount as guarantee for the rental service. The deposit amount is as specified in this contract. The deposit is released in whole or in part against amounts owed to the lessor under section H below. The renter authorizes the use of the provided card/amount as the sole means of payment for any obligation arising from this contract."],
    ["D) Mirëmbajtja e Automjetit","Qiramarrësi merr përsipër ta përdorë automjetin me kujdes dhe do të mbajë përgjegjësi për çdo dëmtim të shkaktuar, përveç rasteve kur provohet se dëmtimi vjen nga shkaqe që nuk i atribuohen atij. Qiramarrësi duhet të kontrollojë rregullisht nivelet e vajit, lëngut ftohës dhe frenave, dhe në çdo rast të paktën çdo 1000 km të përshkuar. Kostot e parkimit, larjes dhe riparimit të gomave të shpuara janë përgjegjësi e qiramarrësit. Në rast defekti apo prishjeje, qiramarrësi duhet të kontaktojë menjëherë qiradhënësin për asistencë dhe/ose zëvendësim të mundshëm të automjetit.",
     "D) Vehicle Maintenance. The renter undertakes to use the vehicle carefully and will be held responsible for any damage caused, unless proven that the damage resulted from causes not attributable to them. The renter must regularly check oil, coolant, and brake fluid levels, and in any case at least every 1000 km driven. Costs for parking, washing, and repairing flat tires are the renter's responsibility. In case of breakdown, the renter must immediately contact the lessor for assistance and/or possible vehicle replacement."],
    ["E) Përdorimi i Automjetit","Automjeti mund të drejtohet vetëm nga qiramarrësi ose nga shoferë shtesë të deklaruar shprehimisht në këtë kontratë, të gjithë mbi moshën 21 vjeç, me leje drejtimi valide prej të paktën 12 muajsh dhe një dokument identifikimi tjetër valid. Lejet e drejtimit të shkruara me alfabet jo-latin duhen shoqëruar me leje drejtimi ndërkombëtare. Ndalohet rreptësisht: (a) transporti i mallrave të paligjshme; (b) transporti i pasagjerëve me pagesë; (c) pjesëmarrja në gara apo prova shpejtësie; (d) udhëtimi jashtë territorit të rënë dakord pa miratim me shkrim; (e) nënqiraja apo huazimi i papërgjegjshëm te palë të treta; (f) drejtimi nën ndikimin e alkoolit apo substancave narkotike ose në kundërshtim me Kodin Rrugor. Çdo shkelje e Kodit Rrugor konsiderohet shkelje e detyrimeve kontraktuale të shoferit.",
     "E) Use of the Vehicle. The vehicle may only be driven by the renter or by additional drivers explicitly declared in this contract, all over 21 years old, holding a valid driving license for at least 12 months and another valid identification document. Licenses printed in a non-Latin alphabet must be accompanied by an international driving license. It is strictly forbidden to: (a) transport illegal goods; (b) transport paying passengers; (c) participate in races or speed trials; (d) travel outside the agreed territory without written approval; (e) sub-rent or irresponsibly lend the vehicle to third parties; (f) drive under the influence of alcohol or drugs or in violation of the Road Code. Any breach of the Road Code is considered a breach of the driver's contractual obligations."],
    ["F) Zbritjet për Dëmtim dhe Vjedhje","Kontrata përfshin një zbritje bazë (franshizë) për dëmtime aksidentale dhe një zbritje bazë për vjedhje/zjarr, siç specifikohen në tabelën e depozitës dhe zbritjeve më sipër. Këto zbritje nuk përbëjnë policë sigurimi, por një kufizim konvencional të përgjegjësisë financiare të qiramarrësit. Zbritjet nuk aplikohen (qiramarrësi mban përgjegjësi të plotë) në rast mashtrimi, faji të rëndë, shkeljeje të neneve D/E të kësaj kontrate, ose mos-kthimi të çelësave të automjetit.",
     "F) Damage and Theft Deductibles. The contract includes a base deductible for accidental damage and a base deductible for theft/fire, as specified in the deposit and deductibles table above. These deductibles do not constitute an insurance policy but a conventional limitation of the renter's financial liability. The deductibles do not apply (renter bears full liability) in case of fraud, gross negligence, breach of sections D/E of this contract, or failure to return the vehicle keys."],
    ["G) Aksidentet dhe Dëmtimet","Në rast aksidenti, qiramarrësi duhet: (a) të njoftojë menjëherë qiradhënësin dhe të plotësojë e dërgojë brenda 48 orësh formularin e deklaratës së përbashkët të aksidentit (nëse ka); (b) të njoftojë autoritetin më të afërt të policisë; (c) të shënojë emrat, adresat dhe targat e personave/automjeteve të përfshira si dhe të dhënat e dëshmitarëve; (d) t'i ofrojë qiradhënësit çdo informacion të dobishëm; (e) të ndjekë udhëzimet e qiradhënësit lidhur me ruajtjen dhe riparimin e automjetit. Në rast vjedhjeje, qiramarrësi duhet të njoftojë policinë dhe t'i dorëzojë qiradhënësit një kopje të denoncimit. Mos-kthimi i çelësave apo telekomandës së alarmit ngarkon qiramarrësin me përgjegjësi të plotë financiare për automjetin.",
     "G) Accidents and Damage. In case of an accident, the renter must: (a) immediately notify the lessor and complete and send within 48 hours the joint accident statement form (if any); (b) notify the nearest police authority; (c) record the names, addresses, and plates of persons/vehicles involved as well as witness details; (d) provide the lessor with any useful information; (e) follow the lessor's instructions regarding the custody and repair of the vehicle. In case of theft, the renter must notify the police and deliver a copy of the report to the lessor. Failure to return the keys or alarm remote makes the renter fully financially liable for the vehicle."],
    ["H) Pagesat","Qiramarrësi pranon t'i paguajë qiradhënësit: 1) koston e qerasë sipas kësaj kontrate; 2) tarifën shtesë nëse automjeti kthehet në një vendndodhje tjetër nga ajo e dorëzimit; 3) koston e rikthimit të nivelit të karburantit siç ishte në dorëzim; 4) shumat për zbritje dëmtimesh/vjedhjeje siç parashikohet në nenet C, F dhe G; 5) taksa rrugore, tarifa aeroporti apo pikash të tjera të veçanta; 6) shumën e çdo gjobe apo tarife parkimi/pedazhi që lidhet me përdorimin e automjetit gjatë periudhës së qerasë, përfshirë ato të njoftuara pas mbylljes së kontratës; 7) rimbursimin e shpenzimeve të bëra nga qiradhënësi për arkëtimin e shumave të papaguara; 8) çdo shërbim tjetër shtesë të kërkuar dhe ofruar gjatë qerasë.",
     "H) Payments. The renter agrees to pay the lessor: 1) the rental cost under this contract; 2) an extra charge if the vehicle is returned to a location different from where it was delivered; 3) the cost of restoring the fuel level to what it was at delivery; 4) amounts for damage/theft deductibles as provided in sections C, F, and G; 5) road tolls, airport fees, or other special location fees; 6) the amount of any fine or parking/toll fee related to the use of the vehicle during the rental period, including those notified after the contract closes; 7) reimbursement of expenses incurred by the lessor in collecting unpaid amounts; 8) any other additional service requested and provided during the rental."],
    ["I) Përgjegjësia e Qiradhënësit","Duke marrë parasysh përgjegjësinë e prodhuesit të automjetit për defekte prodhimi, qiradhënësi do të kryejë të gjitha veprimet e mirëmbajtjes së zakonshme për të siguruar që automjeti ofrohet në gjendje të mirë funksionimi, duke garantuar mirëmbajtjen e vazhdueshme të kërkuar në përputhje me përdorimin e tij.",
     "I) Lessor's Responsibility. Taking into account the vehicle manufacturer's responsibility for construction defects, the lessor will perform all ordinary maintenance activities to ensure the vehicle is provided in good working order, guaranteeing the continuous maintenance required in relation to its use."],
    ["L) Moscedimi","Qiramarrësi merr përsipër të mos ia kalojë, transferojë, hipotekojë apo lërë peng automjetin, aksesorët, pajisjet apo ndonjë pjesë tjetër të tij, dhe të mos kryejë asnjë veprim në kundërshtim me të drejtën e qiradhënësit si pronar i automjetit.",
     "L) No Assignment. The renter undertakes not to assign, transfer, mortgage, or pledge the vehicle, its accessories, equipment, or any other part thereof, and not to carry out any act contrary to the lessor's right as owner of the vehicle."],
    ["M) Automjet Zëvendësues","Qiradhënësi ruan të drejtën të mos ofrojë automjet zëvendësues në rast aksidenti, vjedhjeje, defekti apo çdo ngjarjeje tjetër, pa qenë i detyruar të justifikojë refuzimin e tij.",
     "M) Replacement Vehicle. The lessor reserves the right not to provide a replacement vehicle in case of accident, theft, fault, damage, or any other event, without being obliged to justify such refusal."],
    ["N) Juridiksioni","Për çdo mosmarrëveshje që lind nga ose lidhet me këtë kontratë, veçanërisht për arkëtimin e detyrueshëm të detyrimeve ndaj qiradhënësit, kompetente do të jetë gjykata e vendit ku është regjistruar qiradhënësi, në përputhje me legjislacionin shqiptar në fuqi.",
     "N) Jurisdiction. For any dispute arising from or related to this contract, particularly for the mandatory collection of debts owed to the lessor, the competent court will be that of the lessor's place of registration, in accordance with applicable Albanian law."],
    ["O) Sende të Humbura","Qiradhënësi nuk mban asnjë përgjegjësi për humbjen e sendeve që qiramarrësi apo palë të treta mund të kenë lënë apo ngarkuar në automjet, gjatë ose pas periudhës së qerasë. Nëse gjenden sende brenda automjetit, qiradhënësi do të njoftojë menjëherë qiramarrësin; ky i fundit mund t'i rimarrë personalisht apo përmes një kurieri brenda 3 muajve nga gjetja, me shpenzimet e veta. Pas kësaj periudhe, sendet konsiderohen të braktisura.",
     "O) Lost Items. The lessor bears no responsibility for the loss of items that the renter or third parties may have left or loaded in the vehicle, during or after the rental period. If items are found inside the vehicle, the lessor will promptly notify the renter, who may recover them personally or through a courier within 3 months of the find, at their own expense. After this period, the items are considered abandoned."],
    ["P) Interpretimi","Në rast konflikti në interpretimin e versionit shqip dhe versionit anglisht të kësaj kontrate, versioni shqip mbizotëron.",
     "P) Interpretation. In case of conflict in the interpretation of the Albanian and English versions of this contract, the Albanian version shall prevail."],
    ["Q) Ndryshimet","Çdo ndryshim apo shtesë e kushteve të përgjithshme të kësaj kontrate nuk ka fuqi detyruese nëse nuk është rënë dakord me shkrim.",
     "Q) Amendments. Any amendment or addition to the general terms of this contract shall not be binding unless agreed upon in writing."],
    ["R) Pranimi i Kushteve të Kontratës","Qiramarrësi, me nënshkrimin e tij, pranon të marrë me qera automjetin e treguar me çmimet dhe kushtet e specifikuara në këtë kontratë dhe autorizon qiradhënësin të tarifojë kartën e garancisë të deklaruar. Qiramarrësi deklaron se ka shqyrtuar kushtet e përgjithshme të qerasë.",
     "R) Acceptance of Contract Terms. The renter, by signing, agrees to rent the indicated vehicle at the rates and conditions specified in this contract and authorizes the lessor to charge the declared guarantee card. The renter declares to have reviewed the general rental terms."],
    ["S) Kushte me Miratim të Veçantë","Qiramarrësi deklaron shprehimisht se pranon veçanërisht kushtet e neneve B, D, F, G, H, I, L, N, O dhe R të kësaj kontrate, në përputhje me parimet e së drejtës kontraktore shqiptare mbi klauzolat e miratuara posaçërisht.",
     "S) Specially Approved Conditions. The renter expressly declares acceptance of the conditions under sections B, D, F, G, H, I, L, N, O, and R of this contract, in accordance with the principles of Albanian contract law regarding specifically approved clauses."],
    ["T) Deklaratë Përgjegjësie","Qiramarrësi dhe shoferi deklarojnë se janë plotësisht të vetëdijshëm që, në rast se automjeti nuk kthehet brenda afatit kontraktual dhe në mungesë të një arsye të vlefshme pengesë (rrethana jashtë kontrollit), ata do të mbajnë përgjegjësi për përvetësim të paligjshëm ose, në rastin më të keq, mashtrim kontraktual.",
     "T) Liability Declaration. The renter and driver declare to be fully aware that, in the event the vehicle is not returned within the contractual time limit and in the absence of any valid preventing reason (circumstances beyond one's control), they will be held responsible for unlawful appropriation or, at worst, contractual fraud."]
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Kontratë Qeraje ${contractNo}</title>
  <style>
    @page{margin:16mm 14mm}
    *{box-sizing:border-box}
    body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0;color:#1e293b;font-size:12px;line-height:1.4}
    table{width:100%;border-collapse:collapse;margin-bottom:2px}
    td,th{padding:5px 10px;font-size:11px;text-align:left;vertical-align:top;border-bottom:1px solid #eef1f5}
    th{color:#64748b;font-weight:600;width:38%}
    td{color:#0f172a;font-weight:500}
    .wrap{max-width:760px;margin:0 auto;padding:20px 0}
    .letterhead{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f172a;padding-bottom:14px;margin-bottom:18px}
    .letterhead .co-name{font-size:19px;font-weight:800;color:#0f172a;letter-spacing:0.2px}
    .letterhead .co-contact{font-size:10px;color:#64748b;margin-top:4px;line-height:1.6}
    .letterhead .doc-title{text-align:right}
    .letterhead .doc-title h1{font-size:14px;margin:0;color:#0f172a;font-weight:700}
    .letterhead .doc-title .sub-t{font-size:10px;color:#94a3b8}
    .letterhead .doc-title .meta{font-size:10px;color:#475569;margin-top:6px;line-height:1.7}
    .section{margin-bottom:16px}
    .section-hd{font-size:11px;font-weight:800;color:#fff;background:#0f172a;padding:6px 10px;border-radius:5px 5px 0 0;letter-spacing:0.3px;text-transform:uppercase}
    .section-hd .en{font-weight:400;opacity:.65;text-transform:none;font-size:10px}
    .section-bd{border:1px solid #e2e8f0;border-top:none;border-radius:0 0 5px 5px;padding:2px 0}
    .cols2{display:flex;gap:16px}
    .cols2 > div{flex:1}
    .sig-block{display:flex;gap:24px;margin-top:8px;page-break-inside:avoid}
    .sig-block .box{flex:1;text-align:center}
    .sig-block img{max-height:70px;max-width:100%;border-bottom:1px solid #94a3b8;padding-bottom:4px;margin-bottom:4px}
    .sig-block .line{border-top:1px solid #94a3b8;margin-top:44px;padding-top:4px}
    .sig-block .who{font-size:10px;font-weight:700;color:#0f172a}
    .sig-block .ts{font-size:9px;color:#94a3b8}
    .stamp-wrap{display:flex;flex-direction:column;align-items:center;gap:2px}
    .stamp-real-img{max-height:78px;max-width:190px;object-fit:contain}
    .photos{display:flex;flex-wrap:wrap;gap:6px;margin:8px 10px}
    .photos img{width:88px;height:66px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0}
    .dmg-diagrams{display:flex;flex-wrap:wrap;gap:10px;margin:8px 10px}
    .dmg-diagram-box{text-align:center}
    .dmg-diagram-box svg{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;display:block}
    .dmg-diagram-label{font-size:8.5px;color:#64748b;margin-top:3px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px}
    .terms{font-size:9.3px;color:#334155;line-height:1.55;columns:1}
    .terms .clause{margin-bottom:7px;page-break-inside:avoid}
    .terms .ttl{font-weight:700;color:#0f172a;display:block}
    .terms .en{color:#64748b;font-style:italic}
    .foot-note{font-size:9px;color:#94a3b8;text-align:center;margin-top:18px;border-top:1px solid #e2e8f0;padding-top:8px}
    .page-break{page-break-before:always}
    @media print{ .wrap{padding:0} }
  </style></head><body>
  <div class="wrap">

  <div class="letterhead">
    <div>
      <div class="co-name">${companyName}</div>
      ${contactLine?`<div class="co-contact">${contactLine}</div>`:""}
      ${legalLine?`<div class="co-contact">${legalLine}</div>`:""}
    </div>
    <div class="doc-title">
      <h1>KONTRATË QERAJE AUTOMJETI</h1>
      <div class="sub-t">Vehicle Rental Agreement</div>
      <div class="meta">
        Nr. / No: <strong>${contractNo}</strong><br/>
        Data / Date: ${nowStr()}
      </div>
    </div>
  </div>

  <div class="cols2">
    <div class="section">
      <div class="section-hd">Të Dhënat e Klientit <span class="en">/ Renter</span></div>
      <div class="section-bd"><table>
        ${row("Emri / Name", c.client_name)}
        ${row("Telefon / Phone", c.client_phone)}
        ${row("Email", c.client_email)}
        ${row("Adresa / Address", [c.client_address,c.client_city].filter(Boolean).join(", "))}
        ${row("Vendlindja / Birthplace", c.client_pob)}
        ${row("Datëlindja / Birth Date", c.client_dob?fmtFull(c.client_dob):"")}
      </table></div>
    </div>
    <div class="section">
      <div class="section-hd">Patenta & Automjeti <span class="en">/ License &amp; Vehicle</span></div>
      <div class="section-bd"><table>
        ${row("Nr. Patentë / License No.", c.license_number||c.client_id_card)}
        ${row("Lëshuar / Issued", [c.license_issue,c.license_date_issue?fmtFull(c.license_date_issue):""].filter(Boolean).join(" · "))}
        ${row("Skadon / Expires", c.license_expiry?fmtFull(c.license_expiry):"")}
        ${row("Automjeti / Vehicle", carLbl+(carObj?.model?(" · "+carObj.model):""))}
        ${row("Kategoria / Category", c.vehicle_category)}
        ${row("Nr. Vendesh / Seats", c.vehicle_max_people)}
      </table></div>
    </div>
  </div>

  <div class="cols2">
    <div class="section">
      <div class="section-hd">Çmimi & Pagesa <span class="en">/ Pricing &amp; Payment</span></div>
      <div class="section-bd"><table>
        ${row("Çmimi Total / Total", c.total_price?fmtM(c.total_price,c.currency):"")}
        ${row("Tarifa Shtesë / Extra Charges", c.extra_charges_note)}
        ${row("Paguar / Paid", c.total_paid!=null&&c.total_paid!==""?fmtM(c.total_paid,c.currency):"")}
        ${row("Mbetet / Balance Due", toBePaid!=null?fmtM(toBePaid,c.currency):"")}
        ${row("Mënyra e Pagesës / Method", c.payment_method)}
      </table></div>
    </div>
    <div class="section">
      <div class="section-hd">Depozitë & Zbritje <span class="en">/ Deposit &amp; Deductibles</span></div>
      <div class="section-bd"><table>
        ${row("Depozitë / Deposit", c.deposit_amount?fmtM(c.deposit_amount,c.currency):"")}
        ${row("Mënyra / Method", c.deposit_payment_method)}
        ${row("Zbritje Vjedhje / Theft", c.theft_deductible?fmtM(c.theft_deductible,c.currency):"")}
        ${row("Zbritje Dëmi / Damage", c.damage_deductible?fmtM(c.damage_deductible,c.currency):"")}
        ${row("Kartë Garancie / Card", c.card_last4?((c.card_holder||"")+" "+(c.card_type||"")+" ****"+c.card_last4):"")}
      </table></div>
    </div>
  </div>

  ${c.insurance_option?`
  <div class="section">
    <div class="section-hd">🛡️ Opsioni i Sigurimit i Zgjedhur <span class="en">/ Selected Insurance Option</span></div>
    <div class="section-bd" style="padding:8px 12px">
      <div style="font-weight:800;font-size:12px;color:#0f172a;margin-bottom:4px">${INSURANCE_OPTIONS[c.insurance_option]?.label||""} <span style="font-weight:400;color:#64748b;font-size:10px">/ ${INSURANCE_OPTIONS[c.insurance_option]?.labelEn||""}</span></div>
      ${c.insurance_option==="pjesshem"&&c.insurance_excess?`<div style="font-size:10.5px;color:#0f172a;margin-bottom:4px"><strong>Excess (detyrimi i klientit për çdo dëm):</strong> €${Number(c.insurance_excess).toFixed(2)} <span style="color:#64748b;font-style:italic">— shuma maksimale që qiramarrësi mban përgjegjësi / max renter liability per incident</span></div>`:""}
      <div style="font-size:10px;color:#166534;margin-bottom:2px"><strong>✓ Mbulon / Covers:</strong> ${INSURANCE_OPTIONS[c.insurance_option]?.coversAl||""}</div>
      <div style="font-size:9.5px;color:#166534;font-style:italic;margin-bottom:6px">${INSURANCE_OPTIONS[c.insurance_option]?.coversEn||""}</div>
      <div style="font-size:10px;color:#991b1b;margin-bottom:2px"><strong>✕ Nuk mbulon / Does not cover:</strong> ${INSURANCE_OPTIONS[c.insurance_option]?.notCoversAl||""}</div>
      <div style="font-size:9.5px;color:#991b1b;font-style:italic">${INSURANCE_OPTIONS[c.insurance_option]?.notCoversEn||""}</div>
    </div>
  </div>
  `:""}

  <div class="section">
    <div class="section-hd">🚗 Marrja e Makinës <span class="en">/ Pickup</span></div>
    <div class="section-bd">
      <table>
        ${row("Vendndodhja / Location", c.pickup_location)}
        ${row("Data/Ora / Date-Time", c.pickup_datetime?fmtDT(c.pickup_datetime):"")}
        ${row("Karburanti / Fuel", c.pickup_fuel)}
        ${row("Km", c.pickup_km)}
        ${row("Shënime Dëmtimi / Damage Notes", c.pickup_damage_notes)}
      </table>
      ${damageDiagramSVGBlock(c.pickup_damage)||`<div style="padding:6px 10px;font-size:10px;color:#94a3b8">Nuk ka dëmtime të shënuara në diagram / No damage marked on diagram</div>`}
      ${photosGrid(c.pickup_photos)}
    </div>
  </div>

  ${showDropoff?`
  <div class="section">
    <div class="section-hd">🏁 Kthimi i Makinës <span class="en">/ Drop-off</span></div>
    <div class="section-bd">
      <table>
        ${row("Vendndodhja / Location", c.dropoff_location)}
        ${row("Data/Ora / Date-Time", c.dropoff_datetime?fmtDT(c.dropoff_datetime):"")}
        ${row("Karburanti / Fuel", c.dropoff_fuel)}
        ${row("Km", c.dropoff_km)}
        ${row("Shënime Dëmtimi / Damage Notes", c.dropoff_damage_notes)}
      </table>
      ${damageDiagramSVGBlock(c.dropoff_damage)||`<div style="padding:6px 10px;font-size:10px;color:#94a3b8">Nuk ka dëmtime të reja në diagram / No new damage marked on diagram</div>`}
      ${photosGrid(c.dropoff_photos)}
    </div>
  </div>
  `:""}

  <div class="sig-block">
    <div class="box">
      ${c.pickup_signature?`<img src="${c.pickup_signature}"/>`:`<div class="line"></div>`}
      <div class="who">${c.client_name||"Qiramarrësi / Renter"}</div>
      <div class="ts">${c.pickup_signed_at?("Marrje / Pickup: "+fmtDT(c.pickup_signed_at)):""}</div>
    </div>
    <div class="box">
      ${showDropoff&&c.dropoff_signature?`<img src="${c.dropoff_signature}"/>`:`<div class="line"></div>`}
      <div class="who">${c.client_name||"Qiramarrësi / Renter"}</div>
      <div class="ts">${c.dropoff_signed_at?("Kthim / Drop-off: "+fmtDT(c.dropoff_signed_at)):""}</div>
    </div>
    <div class="box">
      <div class="stamp-wrap">
        <img class="stamp-real-img" src="${COMPANY_SIGNATURE_STAMP}"/>
      </div>
      <div class="who">${companyName}</div>
      <div class="ts">Nr. ${contractNo}${c.created_by?(" · "+c.created_by):""}</div>
    </div>
  </div>

  <div class="page-break"></div>
  <div class="section">
    <div class="section-hd">📋 Kushtet e Përgjithshme <span class="en">/ General Terms &amp; Conditions</span></div>
    <div class="terms" style="margin-top:10px">
      ${TERMS.map(t=>`<div class="clause"><span class="ttl">${t[0]}</span>${t[1]}<br/><span class="en">${t[2]}</span></div>`).join("")}
    </div>
  </div>

  <p style="font-size:10px;color:#64748b;margin-top:10px">
    Nënshkruesi deklaron se ka lexuar dhe pranon kushtet e përgjithshme të qerasë të kompanisë.<br/>
    <span style="font-style:italic">The undersigned declares to have read and accepts the company's general rental terms.</span>
  </p>

  <div class="foot-note">${companyName}${contactLine?" · "+contactLine:""}</div>
  </div>
  </body></html>`;
}
function printContract(c, cars, stage) {
  const html = buildContractHTML(c, cars, stage);
  const w = window.open("", "_blank");
  if (w) { w.document.write(html); w.document.close(); setTimeout(()=>w.print(), 500); }
}



// ─── FAQJA E PLOTË E KONTRATËS (jo modal — faqe më vete) ──────────────────
function ContractEditor({r, sess, cars, addLog, onBack}) {
  const mob = useMobile();
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [existing,setExisting] = useState(null);
  const [stage,setStage] = useState("pickup");

  const [f,setF] = useState({
    client_name:r.client_name||"", client_phone:r.client_phone||"", client_id_card:r.client_id_card||"",
    client_email:"", client_address:"", client_city:"", client_pob:"", client_dob:"",
    license_number:"", license_issue:"", license_date_issue:"", license_expiry:"",
    vehicle_category:"", vehicle_max_people:"",
    total_price:r.total_price||"", currency:r.currency||"ALL", extra_charges_note:"",
    total_paid:r.amount_paid||"", payment_method:"",
    deposit_amount:"", deposit_payment_method:"",
    theft_deductible:"", damage_deductible:"", third_party_deductible:"",
    insurance_option:"baze", insurance_excess:"400",
    card_holder:"", card_last4:"", card_type:"", card_expiry:"",
    pickup_location:"", pickup_datetime:new Date().toISOString().slice(0,16),
    pickup_fuel:"8/8 (100%)", pickup_km:r.km_out||"", pickup_damage:[], pickup_damage_notes:"", pickup_signature:"", pickup_photos:[],
    dropoff_location:"", dropoff_datetime:new Date().toISOString().slice(0,16),
    dropoff_fuel:"8/8 (100%)", dropoff_km:r.km_in||"", dropoff_damage:[], dropoff_damage_notes:"", dropoff_signature:"", dropoff_photos:[],
  });

  useEffect(()=>{
    const carObj = cars.find(x=>x.name===r.car_name);
    sbAuthGet("rental_contracts","reservation_id=eq."+r.id,sess.token)
      .then(rows=>{
        if(rows&&rows[0]){
          const c=rows[0];
          setExisting(c);
          setF(prev=>({...prev,...c,pickup_photos:c.pickup_photos||[],dropoff_photos:c.dropoff_photos||[]}));
          setStage(c.status==="pickup_done"?"dropoff":"pickup");
        } else if(carObj?.damage_photos?.length){
          // Kontratë e re — nis me galerinë e dëmtimeve të makinës si gjendje bazë
          setF(prev=>({...prev,pickup_photos:[...carObj.damage_photos]}));
        }
        setLoading(false);
      }).catch(()=>setLoading(false));
  },[]);

  function syncFromCarGallery(){
    const carObj = cars.find(x=>x.name===r.car_name);
    const base = carObj?.damage_photos||[];
    if(!base.length){ alert("Kjo makinë nuk ka foto në galerinë e saj (Cilësime → Makinat → 🩹 Foto Dëmtimesh)."); return; }
    setF(prev=>({...prev,pickup_photos:[...new Set([...(prev.pickup_photos||[]),...base])]}));
  }

  function upd(k,v){ setF(x=>({...x,[k]:v})); }
  function sanitizeNum(body){
    const numFields=["total_price","deposit_amount","pickup_km","dropoff_km","total_paid","theft_deductible","damage_deductible","third_party_deductible","insurance_excess"];
    const out={...body};
    numFields.forEach(k=>{
      if(out[k]==="" || out[k]===undefined) out[k]=null;
      else if(out[k]!==null) out[k]=Number(out[k]);
    });
    return out;
  }
  async function uploadPickupPhoto(file){ return sbUploadContractPhoto(file,r.id,"pickup",sess.token); }
  async function uploadDropoffPhoto(file){ return sbUploadContractPhoto(file,r.id,"dropoff",sess.token); }

  async function saveDraft(){
    setSaving(true);
    try {
      const body = sanitizeNum({...f, reservation_id:r.id, car_name:r.car_name, created_by:sess.profile?.username, status:existing?.status||"draft"});
      if(existing){ const [u]=await sbAuthPatch("rental_contracts",existing.id,body,sess.token); setExisting(u); }
      else { const [u]=await sbAuthPost("rental_contracts",body,sess.token); setExisting(u); }
    } catch(e){ alert(e.message); }
    setSaving(false);
  }

  async function confirmPickup(){
    if(!f.pickup_signature){ alert("Duhet nënshkrimi i klientit para se të konfirmosh."); return; }
    if(!f.pickup_location||!f.pickup_km){ alert("Plotëso vendndodhjen dhe km."); return; }
    setSaving(true);
    try {
      const body = sanitizeNum({...f, reservation_id:r.id, car_name:r.car_name, created_by:sess.profile?.username, status:"pickup_done", pickup_signed_at:new Date().toISOString()});
      let saved;
      if(existing){ [saved]=await sbAuthPatch("rental_contracts",existing.id,body,sess.token); }
      else { [saved]=await sbAuthPost("rental_contracts",body,sess.token); }
      setExisting(saved);
      addLog&&addLog("Kontratë Pickup",r.car_name+" - "+r.client_name);
      printContract(saved,cars,"pickup");
      setStage("dropoff");
    } catch(e){ alert(e.message); }
    setSaving(false);
  }

  async function confirmDropoff(){
    if(!f.dropoff_signature){ alert("Duhet nënshkrimi i klientit para se të konfirmosh."); return; }
    if(!f.dropoff_location||!f.dropoff_km){ alert("Plotëso vendndodhjen dhe km."); return; }
    setSaving(true);
    try {
      const body = sanitizeNum({...f, status:"completed", dropoff_signed_at:new Date().toISOString()});
      const [saved]=await sbAuthPatch("rental_contracts",existing.id,body,sess.token);
      setExisting(saved);
      // Nese ka foto te reja demtimi ne dropoff, i shtojme ne galerine e perhershme te makines
      if(f.dropoff_photos&&f.dropoff_photos.length){
        const carObj = cars.find(x=>x.name===r.car_name);
        if(carObj){
          const merged=[...new Set([...(carObj.damage_photos||[]),...f.dropoff_photos])];
          try { await sbAuthPatch("cars",carObj.id,{damage_photos:merged},sess.token); } catch(e){}
        }
      }
      addLog&&addLog("Kontratë Dropoff",r.car_name+" - "+r.client_name);
      printContract(saved,cars,"dropoff");
    } catch(e){ alert(e.message); }
    setSaving(false);
  }

  if(loading) return <div style={{padding:40}}><Spin/></div>;

  return (
    <div style={{padding:mob?10:14,maxWidth:820,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={onBack} style={{...CB,padding:"7px 12px"}}>← Mbrapa te Kontratat</button>
        <h2 style={{margin:0,fontSize:16,fontWeight:800,color:"#0f172a",flex:1}}>📝 Kontratë — {carLabel(r.car_name,cars)}</h2>
      </div>

      <div style={{display:"flex",gap:0,borderBottom:"2px solid #e2e8f0",marginBottom:14,background:"#fff",borderRadius:"10px 10px 0 0",overflow:"hidden",border:"1px solid #e2e8f0",borderBottomWidth:2}}>
        <button onClick={()=>setStage("pickup")} style={{flex:1,padding:"11px 0",border:"none",background:"none",cursor:"pointer",fontWeight:stage==="pickup"?700:500,fontSize:13,color:stage==="pickup"?"#1d4ed8":"#64748b",borderBottom:stage==="pickup"?"2px solid #1d4ed8":"2px solid transparent",marginBottom:-2}}>🚗 Marrje (Pickup)</button>
        <button onClick={()=>existing&&setStage("dropoff")} disabled={!existing} style={{flex:1,padding:"11px 0",border:"none",background:"none",cursor:existing?"pointer":"not-allowed",fontWeight:stage==="dropoff"?700:500,fontSize:13,color:stage==="dropoff"?"#1d4ed8":existing?"#64748b":"#cbd5e1",borderBottom:stage==="dropoff"?"2px solid #1d4ed8":"2px solid transparent",marginBottom:-2}}>🏁 Kthim (Dropoff)</button>
      </div>

      {existing?.status==="completed"&&(
        <div style={{background:"#dcfce7",border:"1px solid #bbf7d0",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#166534",fontWeight:700}}>✅ Kontrata është përfunduar (pickup + dropoff) dhe u nënshkrua.</div>
      )}

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>👤 Të Dhënat e Klientit</h4>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Emri i Klientit *"><input value={f.client_name} onChange={e=>upd("client_name",e.target.value)} style={FL}/></Fld>
          <Fld label="Telefoni"><input value={f.client_phone} onChange={e=>upd("client_phone",e.target.value)} style={FL}/></Fld>
          <Fld label="Email"><input value={f.client_email} onChange={e=>upd("client_email",e.target.value)} style={FL} placeholder="email@..."/></Fld>
          <Fld label="Adresa"><input value={f.client_address} onChange={e=>upd("client_address",e.target.value)} style={FL}/></Fld>
          <Fld label="Qyteti"><input value={f.client_city} onChange={e=>upd("client_city",e.target.value)} style={FL}/></Fld>
          <Fld label="Vendlindja"><input value={f.client_pob} onChange={e=>upd("client_pob",e.target.value)} style={FL}/></Fld>
          <Fld label="Datëlindja"><DateInput value={f.client_dob} onChange={v=>upd("client_dob",v)}/></Fld>
          <Fld label="Nr. Patentë / ID"><input value={f.license_number} onChange={e=>upd("license_number",e.target.value)} style={FL}/></Fld>
          <Fld label="Vendi i Lëshimit"><input value={f.license_issue} onChange={e=>upd("license_issue",e.target.value)} style={FL}/></Fld>
          <Fld label="Data e Lëshimit"><DateInput value={f.license_date_issue} onChange={v=>upd("license_date_issue",v)}/></Fld>
          <Fld label="Skadimi i Patentës"><DateInput value={f.license_expiry} onChange={v=>upd("license_expiry",v)}/></Fld>
        </div>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>🚗 Automjeti</h4>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Kategoria"><input value={f.vehicle_category} onChange={e=>upd("vehicle_category",e.target.value)} style={FL} placeholder="p.sh. Kompakte, SUV, Ekonomike"/></Fld>
          <Fld label="Nr. Maksimal Pasagjerësh"><input value={f.vehicle_max_people} onChange={e=>upd("vehicle_max_people",e.target.value)} style={FL} placeholder="5"/></Fld>
        </div>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>💶 Çmimi</h4>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Çmimi Total i Qerasë"><input type="number" value={f.total_price} onChange={e=>upd("total_price",e.target.value)} style={FL}/></Fld>
          <Fld label="Monedha"><select value={f.currency} onChange={e=>upd("currency",e.target.value)} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>
          <Fld label="Shuma e Paguar"><input type="number" value={f.total_paid} onChange={e=>upd("total_paid",e.target.value)} style={FL}/></Fld>
          <Fld label="Mënyra e Pagesës"><input value={f.payment_method} onChange={e=>upd("payment_method",e.target.value)} style={FL} placeholder="Cash / Kartë / Transfertë"/></Fld>
          <Fld label="Detaje Tarifash Shtesë (karburant, km shtesë, kohë shtesë, pastrim...)" col2><textarea value={f.extra_charges_note} onChange={e=>upd("extra_charges_note",e.target.value)} style={{...FL,height:50,resize:"vertical"}}/></Fld>
        </div>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>🛡️ Opsioni i Sigurimit (Neni 3)</h4>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr 1fr",gap:8,marginBottom:12}}>
          {Object.entries(INSURANCE_OPTIONS).map(([key,opt])=>(
            <button key={key} type="button" onClick={()=>upd("insurance_option",key)} style={{
              textAlign:"left",padding:"10px 12px",borderRadius:10,cursor:"pointer",
              border:"2px solid "+(f.insurance_option===key?"#1d4ed8":"#e2e8f0"),
              background:f.insurance_option===key?"#eff6ff":"#fff",
            }}>
              <div style={{fontSize:12,fontWeight:800,color:f.insurance_option===key?"#1d4ed8":"#0f172a"}}>{opt.label}</div>
            </button>
          ))}
        </div>
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 12px",fontSize:11.5,lineHeight:1.6}}>
          <div style={{color:"#166534",marginBottom:4}}><strong>✓ Mbulon:</strong> {INSURANCE_OPTIONS[f.insurance_option]?.coversAl}</div>
          <div style={{color:"#991b1b"}}><strong>✕ Nuk mbulon:</strong> {INSURANCE_OPTIONS[f.insurance_option]?.notCoversAl}</div>
        </div>
        {f.insurance_option==="pjesshem"&&(
          <div style={{marginTop:10}}>
            <Fld label="Excess (shuma maksimale e përgjegjësisë së klientit për dëm, €)">
              <input type="number" value={f.insurance_excess} onChange={e=>upd("insurance_excess",e.target.value)} style={FL} placeholder="400"/>
            </Fld>
          </div>
        )}
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>🔒 Depozita & Zbritjet</h4>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Depozitë Garancie"><input type="number" value={f.deposit_amount} onChange={e=>upd("deposit_amount",e.target.value)} style={FL}/></Fld>
          <Fld label="Mënyra e Depozitës"><input value={f.deposit_payment_method} onChange={e=>upd("deposit_payment_method",e.target.value)} style={FL} placeholder="Kartë Krediti / Cash"/></Fld>
          <Fld label="Zbritje Vjedhje/Zjarr"><input type="number" value={f.theft_deductible} onChange={e=>upd("theft_deductible",e.target.value)} style={FL}/></Fld>
          <Fld label="Zbritje Dëmtimesh"><input type="number" value={f.damage_deductible} onChange={e=>upd("damage_deductible",e.target.value)} style={FL}/></Fld>
          <Fld label="Zbritje Palë e Tretë"><input type="number" value={f.third_party_deductible} onChange={e=>upd("third_party_deductible",e.target.value)} style={FL}/></Fld>
        </div>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:14}}>
        <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>💳 Karta e Garancisë</h4>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Mbajtësi i Kartës"><input value={f.card_holder} onChange={e=>upd("card_holder",e.target.value)} style={FL} placeholder="Emri Mbiemri"/></Fld>
          <Fld label="Lloji i Kartës"><input value={f.card_type} onChange={e=>upd("card_type",e.target.value)} style={FL} placeholder="Visa / Mastercard"/></Fld>
          <Fld label="4 Shifrat e Fundit të Kartës"><input value={f.card_last4} onChange={e=>upd("card_last4",e.target.value.replace(/\D/g,"").slice(0,4))} style={FL} maxLength={4} placeholder="7189"/></Fld>
          <Fld label="Skadimi i Kartës"><input value={f.card_expiry} onChange={e=>upd("card_expiry",e.target.value)} style={FL} placeholder="MM/YYYY"/></Fld>
        </div>
      </div>

      {stage==="pickup" ? (
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16}}>
          <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>🚗 Detajet e Marrjes</h4>
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
            <Fld label="Vendndodhja *"><input value={f.pickup_location} onChange={e=>upd("pickup_location",e.target.value)} style={FL} placeholder="p.sh. Aeroporti Tiranë"/></Fld>
            <Fld label="Km në Marrje *"><input type="number" value={f.pickup_km} onChange={e=>upd("pickup_km",e.target.value)} style={FL}/></Fld>
            <Fld label="Niveli i Karburantit"><input value={f.pickup_fuel} onChange={e=>upd("pickup_fuel",e.target.value)} style={FL}/></Fld>
          </div>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Diagrami i Dëmtimeve (OUT)</label>
          <CarDamageDiagram points={f.pickup_damage} onChange={v=>upd("pickup_damage",v)}/>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",margin:"12px 0 6px"}}>Përshkrim me Tekst i Dëmtimeve</label>
          <textarea value={f.pickup_damage_notes} onChange={e=>upd("pickup_damage_notes",e.target.value)} style={{...FL,height:50,resize:"vertical"}} placeholder="p.sh. Gërvishtje shumëfishe, ulëse shoferi..."/>
          <div style={{fontSize:12,fontWeight:600,color:"#374151",display:"flex",alignItems:"center",gap:8,margin:"14px 0 6px"}}>📷 Foto të Gjendjes / Dëmtimeve <button type="button" onClick={syncFromCarGallery} style={{...IB,fontSize:10,padding:"3px 8px"}}>🔄 Sinkronizo nga makina</button></div>
          <PhotoUploader photos={f.pickup_photos} onChange={v=>upd("pickup_photos",v)} uploadFn={uploadPickupPhoto} label="Foto të trashëguara nga galeria e makinës + çdo foto shtesë që shton këtu"/>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",margin:"14px 0 6px"}}>Nënshkrimi i Klientit *</label>
          <SignaturePad value={f.pickup_signature} onChange={v=>upd("pickup_signature",v)}/>
        </div>
      ) : (
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16}}>
          <h4 style={{margin:"0 0 10px",fontSize:13,color:"#0f172a"}}>🏁 Detajet e Kthimit</h4>
          <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
            <Fld label="Vendndodhja *"><input value={f.dropoff_location} onChange={e=>upd("dropoff_location",e.target.value)} style={FL} placeholder="p.sh. Aeroporti Tiranë"/></Fld>
            <Fld label="Km në Kthim *"><input type="number" value={f.dropoff_km} onChange={e=>upd("dropoff_km",e.target.value)} style={FL}/></Fld>
            <Fld label="Niveli i Karburantit"><input value={f.dropoff_fuel} onChange={e=>upd("dropoff_fuel",e.target.value)} style={FL}/></Fld>
          </div>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Diagrami i Dëmtimeve (IN)</label>
          <CarDamageDiagram points={f.dropoff_damage} onChange={v=>upd("dropoff_damage",v)}/>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",margin:"12px 0 6px"}}>Përshkrim me Tekst i Dëmtimeve</label>
          <textarea value={f.dropoff_damage_notes} onChange={e=>upd("dropoff_damage_notes",e.target.value)} style={{...FL,height:50,resize:"vertical"}} placeholder="p.sh. Gërvishtje shumëfishe, ulëse shoferi..."/>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",margin:"14px 0 6px"}}>📷 Foto TË REJA Dëmtimesh (nëse janë gjetur në kthim)</label>
          <PhotoUploader photos={f.dropoff_photos} onChange={v=>upd("dropoff_photos",v)} uploadFn={uploadDropoffPhoto} label="Këto shtohen automatikisht te galeria e makinës kur konfirmon kthimin"/>
          <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",margin:"14px 0 6px"}}>Nënshkrimi i Klientit *</label>
          <SignaturePad value={f.dropoff_signature} onChange={v=>upd("dropoff_signature",v)}/>
        </div>
      )}

      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16,marginBottom:30,flexWrap:"wrap"}}>
        <button onClick={saveDraft} disabled={saving} style={{...CB,fontWeight:700}}>{saving?"...":"💾 Ruaj Draft"}</button>
        <button onClick={()=>printContract({...(existing||{}),...f,reservation_id:r.id,car_name:r.car_name},cars,stage)} style={{...PB,background:"#475569"}}>🖨️ Shiko PDF</button>
        {stage==="pickup"
          ? <button onClick={confirmPickup} disabled={saving} style={{...PB,background:"#059669"}}>{saving?"⏳...":"✅ Konfirmo Marrjen + PDF"}</button>
          : <button onClick={confirmDropoff} disabled={saving} style={{...PB,background:"#059669"}}>{saving?"⏳...":"✅ Konfirmo Kthimin + PDF"}</button>
        }
      </div>
    </div>
  );
}

// ─── FAQJA "KONTRATAT" — listë + hap kontratën e plotë ────────────────────
function KontratatPage({sess,reload,reloadTick,addLog}) {
  const mob=useMobile();
  const [cars,setCars]=useState([]);
  const [reses,setReses]=useState([]);
  const [contracts,setContracts]=useState([]);
  const [loading,setLoading]=useState(true);
  const [srch,setSrch]=useState("");
  const [selResId,setSelResId]=useState(null);

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("reservations","status=neq.Anuluar",sess.token),
      sbAuthGet("rental_contracts","",sess.token)
    ]).then(([c,r,ct])=>{setCars(c);setReses(r);setContracts(ct);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  useEffect(()=>{
    const pending=localStorage.getItem("crm_open_contract_res_id");
    if(pending){ localStorage.removeItem("crm_open_contract_res_id"); setSelResId(pending); }
  },[]);

  if(loading) return <Spin/>;

  const selRes = selResId ? reses.find(r=>r.id===selResId) : null;
  if(selRes){
    return <ContractEditor r={selRes} sess={sess} cars={cars} addLog={addLog} onBack={()=>{setSelResId(null); reload&&reload();}}/>;
  }

  function contractFor(resId){ return contracts.find(c=>c.reservation_id===resId); }
  const list = reses.filter(r=>!srch||[r.client_name,r.car_name].some(s=>(s||"").toLowerCase().includes(srch.toLowerCase())))
    .sort((a,b)=>(b.date_from||"").localeCompare(a.date_from||""));

  return (
    <div style={{padding:mob?10:14,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14,flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>📄 Kontratat e Qerasë</h2>
        <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Kërko klientin/makinën..." style={{padding:"7px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,width:220,fontFamily:"inherit"}}/>
      </div>
      {list.length===0
        ? <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:40,textAlign:"center",color:"#94a3b8"}}>Asnjë rezervim.</div>
        : list.map(r=>{
          const ct=contractFor(r.id);
          const st = !ct?{lb:"— Pa kontratë",bg:"#f1f5f9",tx:"#64748b"}
            : ct.status==="completed"?{lb:"✅ Përfunduar",bg:"#dcfce7",tx:"#166534"}
            : ct.status==="pickup_done"?{lb:"🚗 Vetëm Pickup",bg:"#dbeafe",tx:"#1e40af"}
            : {lb:"📝 Draft",bg:"#fef3c7",tx:"#92400e"};
          return (
            <div key={r.id} onClick={()=>setSelResId(r.id)} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px",marginBottom:8,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{carLabel(r.car_name,cars)} · {r.client_name}</div>
                <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{fmtFull(r.date_from)} → {fmtFull(r.date_to)}</div>
              </div>
              <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:st.bg,color:st.tx,whiteSpace:"nowrap"}}>{st.lb}</span>
            </div>
          );
        })
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [sess, setSess] = useState(null);
  const [page, setPage] = useState(()=>localStorage.getItem("crm_last_page")||"cal");
  useEffect(()=>{ localStorage.setItem("crm_last_page",page); },[page]);
  const [lf, setLf]     = useState({email:"", password:"", err:"", loading:false});
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick(t=>t+1), []);

  // ── SESSION PERSISTENCE
  useEffect(()=>{
    (async ()=>{
      try {
        const saved = localStorage.getItem("crm_session");
        if(!saved) return;
        const s = JSON.parse(saved);
        if(!s?.token || !s?.profile) return;
        if(s.refreshToken){
          try {
            const auth = await sbRefreshToken(s.refreshToken);
            const newS = {...s, token:auth.access_token, refreshToken:auth.refresh_token};
            setSess(newS);
            localStorage.setItem("crm_session", JSON.stringify(newS));
            return;
          } catch(e) {
            localStorage.removeItem("crm_session");
            return;
          }
        }
        setSess(s);
      } catch {}
    })();
  }, []);

  // ── AUTO REFRESH: çdo 20 minuta + kur faqja bëhet aktive (telefon wake)
  useEffect(()=>{
    if(!sess?.refreshToken) return;

    async function doRefresh(s) {
      try {
        const auth = await sbRefreshToken(s.refreshToken||sess.refreshToken);
        const newS = {...sess, ...s, token:auth.access_token, refreshToken:auth.refresh_token};
        setSess(newS);
        localStorage.setItem("crm_session", JSON.stringify(newS));
      } catch(e) {
        localStorage.removeItem("crm_session");
        setSess(null);
      }
    }

    // Timer çdo 20 min
    const t = setInterval(()=>doRefresh(sess), 20*60*1000);

    // Kur telefoni zgjohet / faqja bëhet aktive
    function onVisible() {
      if(document.visibilityState==="visible") {
        const saved = localStorage.getItem("crm_session");
        if(!saved) { setSess(null); return; }
        try {
          const s = JSON.parse(saved);
          doRefresh(s);
        } catch { setSess(null); }
      }
    }
    document.addEventListener("visibilitychange", onVisible);

    return ()=>{ clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [sess?.refreshToken]);

  // ── NOTIFICATIONS: check every 10 min
  useEffect(()=>{
    if(!sess) return;
    function checkNotifs() {
      if(!("Notification" in window)) return;
      sbAuthGet("reservations","status=neq.Anuluar&status=neq.Përfunduar",sess.token).then(reses=>{
        const now = Date.now();
        reses.forEach(r=>{
          ["pickup","return"].forEach(type=>{
            const dateStr = type==="pickup" ? r.date_from : r.date_to;
            const timeStr = type==="pickup" ? (r.pickup_time||"10:00") : (r.return_time||"10:00");
            const dt = new Date(dateStr+"T"+timeStr+":00");
            const hoursLeft = (dt - now) / 3600000;
            const key = "notif_"+r.id+"_"+type+"_"+dateStr;
            const sent = JSON.parse(localStorage.getItem("crm_notifs")||"{}");
            const label = type==="pickup" ? "Dorëzim" : "Marrje";
            if(hoursLeft>0 && hoursLeft<=1.5 && !sent[key+"_1h"]) {
              if(Notification.permission==="granted") {
                new Notification("🚗 "+label+" në ~1 orë", {body:r.car_name+" · "+r.client_name, icon:"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚗</text></svg>"});
              }
              sent[key+"_1h"]=true; localStorage.setItem("crm_notifs",JSON.stringify(sent));
            }
            if(hoursLeft>0 && hoursLeft<=25 && hoursLeft>1.5 && !sent[key+"_24h"]) {
              if(Notification.permission==="granted") {
                new Notification("🚗 "+label+" nesër", {body:r.car_name+" · "+r.client_name+" · "+timeStr, icon:"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚗</text></svg>"});
              }
              sent[key+"_24h"]=true; localStorage.setItem("crm_notifs",JSON.stringify(sent));
            }
          });
        });
      }).catch(()=>{});
    }
    // Request permission
    if("Notification" in window && Notification.permission==="default") {
      Notification.requestPermission();
    }
    checkNotifs();
    const t = setInterval(checkNotifs, 600000);
    return ()=>clearInterval(t);
  },[sess]);

  async function login() {
    if (!lf.email || !lf.password) return;
    setLf(f=>({...f, loading:true, err:""}));
    try {
      const auth = await sbAuth(lf.email, lf.password);
      const profiles = await sbAuthGet("profiles", "id=eq."+auth.user.id, auth.access_token);
      const profile = profiles[0] || {name:auth.user.email, role:"staff", username:auth.user.email};
      const s = {user:auth.user, profile, token:auth.access_token, refreshToken:auth.refresh_token};
      setSess(s);
      localStorage.setItem("crm_session", JSON.stringify(s));
      setLf({email:"",password:"",err:"",loading:false});
      addAuditLog("Hyrje","", s);
    } catch(e) {
      setLf(f=>({...f, err:e.message, loading:false}));
    }
  }

  async function logout() {
    if (sess?.token) { try { await sbSignOut(sess.token); } catch {} }
    localStorage.removeItem("crm_session");
    setSess(null); setPage("cal");
  }

  // Called by child pages when they detect an expired session
  function handleSessionExpired() {
    localStorage.removeItem("crm_session");
    setSess(null);
  }

  async function addAuditLog(action, details, s) {
    const session = s || sess;
    if (!session) return;
    try {
      await sbAuthPost("audit_log", {
        user_name: session.profile?.name || "", username: session.profile?.username || session.user?.email || "",
        action, details
      }, session.token);
    } catch {}
  }

  // Global fetch error listener for session expiry
  useEffect(()=>{
    window.__sessionExpiredHandler = handleSessionExpired;
  });

  // useMobile DUHET te jete para cdo return conditional (rregulli i Hooks)
  const mob = useMobile();

  if (!sess) return <LoginScreen lf={lf} setLf={setLf} login={login} />;

  const role = sess.profile?.role || "staff";
  const NAV = [
    ...(role!=="finance"?[{id:"cal",lb:"📅 Kalendar",icon:"📅"},{id:"res",lb:"📋 Rezervime",icon:"📋"},{id:"kon",lb:"📄 Kontratat",icon:"📄"}]:[]),
    ...(role==="admin"||role==="finance"?[{id:"fin",lb:"📊 Financa",icon:"📊"},{id:"ark",lb:"🏦 Arkë",icon:"🏦"}]:[]),
    ...(role!=="finance"?[{id:"rpt",lb:"📈 Raport",icon:"📈"},{id:"srv",lb:"🔧 Servis",icon:"🔧"}]:[]),
    ...(role==="admin"?[{id:"cli",lb:"👥 Klientët",icon:"👥"},{id:"aud",lb:"🔍 Aktiviteti",icon:"🔍"},{id:"set",lb:"⚙️ Cilësime",icon:"⚙️"}]:[]),
  ];
  const defPage = role==="finance"?"fin":"cal";
  const curPage = NAV.find(n=>n.id===page)?page:defPage;

  return (
    <div style={{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Inter',sans-serif",display:"flex",flexDirection:"column"}}>
      {/* HEADER */}
      <div style={{background:"#0a0a0a",color:"#fff",padding:"0 14px",display:"flex",alignItems:"center",gap:10,height:50,flexShrink:0,borderBottom:"1px solid rgba(201,168,76,0.22)",boxShadow:"0 2px 16px rgba(0,0,0,0.5)",position:"sticky",top:0,zIndex:200}}>
        <span style={{fontSize:20}}>🚗</span>
        <span style={{fontWeight:800,fontSize:mob?12:13,color:"#c9a84c",letterSpacing:"0.5px"}}>{JSON.parse(localStorage.getItem("crm_brand")||"{}").appName||"Car Rental Manager"}</span>
        <div style={{flex:1}}/>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          {!mob&&<div style={{background:"rgba(201,168,76,0.12)",border:"1px solid rgba(201,168,76,0.22)",borderRadius:20,padding:"3px 12px",fontSize:11,color:"#c9a84c",fontWeight:600}}>{sess.profile?.name?.split(" ")[0]}</div>}
          <button onClick={reload} title="Refresh" style={{background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.2)",color:"#c9a84c",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer",lineHeight:1}}>↻</button>
          <button onClick={logout} style={{background:"linear-gradient(135deg,#a07828,#c9a84c)",border:"none",color:"#0a0a0a",borderRadius:8,padding:"6px 12px",fontSize:12,cursor:"pointer",fontWeight:800}}>Dil</button>
        </div>
      </div>

      {/* NAV — horizontal scroll, punon mire ne mobile dhe desktop */}
      <div style={{
        background:"#111",
        borderBottom:"1px solid rgba(201,168,76,0.18)",
        display:"flex",
        flexShrink:0,
        overflowX:"auto",
        WebkitOverflowScrolling:"touch",
        scrollbarWidth:"none",
        msOverflowStyle:"none",
        position:"sticky",
        top:50,
        zIndex:199,
      }}>
        <style>{`.nav-scroll::-webkit-scrollbar{display:none}`}</style>
        <div className="nav-scroll" style={{display:"flex",width:"100%",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setPage(n.id)} style={{
              padding: mob ? "14px 16px" : "12px 14px",
              border:"none",
              background:"none",
              cursor:"pointer",
              fontWeight:curPage===n.id?700:500,
              fontSize: mob ? 13 : 12,
              fontFamily:"inherit",
              color:curPage===n.id?"#c9a84c":"#6b6b6b",
              borderBottom:curPage===n.id?"3px solid #c9a84c":"3px solid transparent",
              whiteSpace:"nowrap",
              flexShrink:0,
              minWidth: mob ? 80 : "auto",
              WebkitTapHighlightColor:"transparent",
              transition:"color 0.15s",
            }}>{n.lb}</button>
          ))}
        </div>
      </div>

      {/* Notification banner */}
      {"Notification" in window && Notification.permission==="default" && (
        <div style={{background:"#1a1500",borderBottom:"1px solid rgba(201,168,76,0.25)",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:13}}>🔔</span>
          <span style={{fontSize:12,color:"#c9a84c",flex:1}}>Aktivizo njoftimet</span>
          <button onClick={()=>Notification.requestPermission()} style={{background:"linear-gradient(135deg,#a07828,#c9a84c)",border:"none",color:"#0a0a0a",borderRadius:7,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:700}}>Aktivizo</button>
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{flex:1,overflow:"auto"}}>
        {curPage==="cal" && <CalPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog} onOpenContract={()=>setPage("kon")}/>}
        {curPage==="res" && <ResPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog} onOpenContract={()=>setPage("kon")}/>}
        {curPage==="kon" && <KontratatPage sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="fin" && <FinPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="rpt" && <RptPage  sess={sess} reloadTick={reloadTick}/>}
        {curPage==="srv" && <SrvPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="ark" && <ArkPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="cli" && <CliPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="aud" && <AudPage  sess={sess} reloadTick={reloadTick}/>}
        {curPage==="set" && <SetPage  sess={sess} reload={reload} addLog={addAuditLog}/>}
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function LoginScreen({lf,setLf,login}) {
  const [showPass,setShowPass]=useState(false);
  const brand = JSON.parse(localStorage.getItem("crm_brand")||"{}");
  const logoUrl = brand.logoUrl || "";
  const appName = brand.appName || "Car Rental Manager";
  return (
    <div style={{minHeight:"100vh",fontFamily:"'Inter',sans-serif",position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {/* Black base */}
      <div style={{position:"absolute",inset:0,background:"#0a0a0a"}}/>
      {/* Gold radial glow top-right */}
      <div style={{position:"absolute",top:"-10%",right:"-5%",width:560,height:560,borderRadius:"50%",background:"radial-gradient(circle,rgba(201,168,76,0.2) 0%,rgba(201,168,76,0.07) 40%,transparent 70%)",pointerEvents:"none"}}/>
      {/* Subtle gold glow bottom-left */}
      <div style={{position:"absolute",bottom:"-10%",left:"-5%",width:400,height:400,borderRadius:"50%",background:"radial-gradient(circle,rgba(201,168,76,0.12) 0%,transparent 65%)",pointerEvents:"none"}}/>
      {/* Very subtle center glow */}
      <div style={{position:"absolute",top:"30%",left:"50%",transform:"translateX(-50%)",width:600,height:300,borderRadius:"50%",background:"radial-gradient(ellipse,rgba(201,168,76,0.05) 0%,transparent 70%)",pointerEvents:"none"}}/>

      {/* Gold top line */}
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,#c9a84c,#e8c96a,#c9a84c,transparent)"}}/>

      {/* Card */}
      <div style={{position:"relative",zIndex:1,background:"rgba(18,18,18,0.92)",backdropFilter:"blur(24px)",border:"1px solid rgba(201,168,76,0.28)",borderRadius:20,padding:"40px 32px",width:"100%",maxWidth:380,boxShadow:"0 40px 80px rgba(0,0,0,0.8), 0 0 60px rgba(201,168,76,0.07)",margin:16}}>

        {/* Gold accent top bar on card */}
        <div style={{position:"absolute",top:0,left:"20%",right:"20%",height:1,background:"linear-gradient(90deg,transparent,rgba(201,168,76,0.7),transparent)",borderRadius:1}}/>

        <div style={{textAlign:"center",marginBottom:32}}>
          {logoUrl
            ? <img src={logoUrl} alt="logo" style={{width:76,height:76,borderRadius:16,objectFit:"cover",margin:"0 auto 16px",display:"block",boxShadow:"0 8px 32px rgba(201,168,76,0.28),0 0 0 2px rgba(201,168,76,0.22)"}}/>
            : <div style={{width:76,height:76,borderRadius:18,background:"linear-gradient(135deg,#1c1c1c,#252520)",border:"2px solid rgba(201,168,76,0.45)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:34,margin:"0 auto 16px",boxShadow:"0 8px 32px rgba(201,168,76,0.22),0 0 0 4px rgba(201,168,76,0.09)"}}>🚗</div>
          }
          <h1 style={{color:"#c9a84c",margin:0,fontSize:22,fontWeight:800,letterSpacing:"0.5px",textShadow:"0 0 30px rgba(201,168,76,0.45)"}}>{appName}</h1>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginTop:8}}>
            <div style={{width:24,height:1,background:"linear-gradient(90deg,transparent,rgba(212,175,55,0.5))"}}/>
            <span style={{color:"#7a6a3a",fontSize:11,letterSpacing:2,fontWeight:600,textTransform:"uppercase"}}>Menaxhim Makinash</span>
            <div style={{width:24,height:1,background:"linear-gradient(90deg,rgba(212,175,55,0.5),transparent)"}}/>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <label style={{color:"#8a7a45",fontSize:10,fontWeight:700,letterSpacing:2,display:"block",marginBottom:7,textTransform:"uppercase"}}>Email</label>
          <input value={lf.email} onChange={e=>setLf(f=>({...f,email:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&login()}
            placeholder="email@kompania.al" type="email"
            style={{width:"100%",padding:"13px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(201,168,76,0.22)",color:"#dcc88a",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit",transition:"border 0.2s"}}/>
        </div>
        <div style={{marginBottom:10}}>
          <label style={{color:"#8a7a45",fontSize:10,fontWeight:700,letterSpacing:2,display:"block",marginBottom:7,textTransform:"uppercase"}}>Fjalëkalimi</label>
          <div style={{position:"relative"}}>
            <input type={showPass?"text":"password"} value={lf.password} onChange={e=>setLf(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&login()}
              placeholder="••••••••"
              style={{width:"100%",padding:"13px 40px 13px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(201,168,76,0.22)",color:"#dcc88a",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
            <button type="button" onClick={()=>setShowPass(s=>!s)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#8a7a45",fontSize:16,padding:4}}>
              {showPass?"🙈":"👁️"}
            </button>
          </div>
        </div>

        {lf.err&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#fca5a5",borderRadius:8,padding:"9px 12px",fontSize:12,marginTop:8}}>⚠️ {lf.err}</div>}

        <button type="button" onClick={login} disabled={lf.loading}
          style={{width:"100%",marginTop:22,padding:"14px",borderRadius:11,background:"linear-gradient(135deg,#a07828 0%,#c9a84c 35%,#e0b95a 55%,#c9a84c 75%,#a07828 100%)",color:"#0a0a0a",border:"none",fontWeight:800,fontSize:15,cursor:lf.loading?"not-allowed":"pointer",opacity:lf.loading?0.7:1,boxShadow:"0 6px 24px rgba(201,168,76,0.32),0 2px 8px rgba(0,0,0,0.5)",letterSpacing:"0.5px"}}>
          {lf.loading?"Duke hyrë...":"Hyr →"}
        </button>

        <div style={{marginTop:28,display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,height:1,background:"rgba(201,168,76,0.13)"}}/>
          <span style={{fontSize:10,color:"#4a4030",letterSpacing:1}}>© {new Date().getFullYear()}</span>
          <div style={{flex:1,height:1,background:"rgba(201,168,76,0.13)"}}/>
        </div>
      </div>
    </div>
  );
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────
function CalPage({sess,reload,reloadTick,addLog,onOpenContract}) {
  const mob=useMobile();
  const [start,setStart]=useState(todayY());
  const [ndays,setNdays]=useState(30);
  const [det,setDet]=useState(null);
  const [cars,setCars]=useState([]);
  const [reses,setReses]=useState([]);
  const [loading,setLoading]=useState(true);
  const [customFrom,setCustomFrom]=useState("");
  const [customTo,setCustomTo]=useState("");
  const td=todayY();
  const dates=Array.from({length:ndays},(_,i)=>addD(start,i));
  const ROW_H=32, CAR_W=76, DATA_W=44;

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("reservations","status=neq.Anuluar",sess.token)
    ]).then(([c,r])=>{setCars(c.filter(x=>x.active!==false));setReses(r);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  function sameCar(r,car) { return car.id&&r.car_id ? r.car_id===car.id : r.car_name===car.name; }
  function resStart(car,dt) { return reses.find(r=>sameCar(r,car)&&r.date_from===dt); }
  // Per diten e pare te dukshme te tabeles, kap edhe rezervimet qe kane filluar PARA fillimit te dritares, por vazhdojne brenda saj
  function findRenderStart(car,dt,di) {
    const exact = resStart(car,dt);
    if(exact) return exact;
    if(di===0) return reses.find(r=>sameCar(r,car)&&r.date_from<dt&&dt<=r.date_to);
    return null;
  }
  function rowSpan(r,ri) { let s=0; for(let i=ri;i<dates.length;i++){if(dates[i]>=r.date_from&&dates[i]<=r.date_to)s++;else if(dates[i]>r.date_to)break;} return s||1; }
  function covered(car,dt) { return reses.some(r=>sameCar(r,car)&&dt>r.date_from&&dt<=r.date_to); }
  const MONTH_SQ=["Jan","Shk","Mar","Pri","Maj","Qer","Kor","Gus","Sht","Tet","Nën","Dhj"];

  function applyCustomRange(){
    if(!customFrom||!customTo) return;
    const nd=diffDays(customFrom,customTo)+1;
    setStart(customFrom); setNdays(Math.max(1,nd));
  }

  if(loading) return <Spin/>;

  return (
    <div style={{padding:mob?6:14,background:"#f8fafc",minHeight:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <div><h2 style={{margin:0,fontSize:mob?15:18,fontWeight:800,color:"#0f172a"}}>📅 Disponueshmëria</h2><p style={{margin:"2px 0 0",fontSize:11,color:"#94a3b8"}}>{cars.length} makina</p></div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:6,alignItems:"center",background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"4px 6px"}}>
          <button onClick={()=>setStart(addD(start,-ndays))} style={{border:"none",background:"#f1f5f9",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,fontWeight:700}}>‹</button>
          <button onClick={()=>{setStart(todayY());setNdays(30);}} style={{border:"none",background:"#1d4ed8",borderRadius:7,padding:"0 10px",height:28,cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>Sot</button>
          <button onClick={()=>setStart(addD(start,ndays))} style={{border:"none",background:"#f1f5f9",borderRadius:7,width:28,height:28,cursor:"pointer",fontSize:14,fontWeight:700}}>›</button>
        </div>
        {!mob&&(
          <div style={{display:"flex",gap:5,alignItems:"center",background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"5px 8px"}}>
            <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Nga</span>
            <DateInput value={customFrom} onChange={setCustomFrom} style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 6px",fontSize:12,fontFamily:"inherit",width:100}}/>
            <span style={{fontSize:11,color:"#64748b",fontWeight:600}}>Deri</span>
            <DateInput value={customTo} onChange={setCustomTo} style={{border:"1px solid #e2e8f0",borderRadius:6,padding:"4px 6px",fontSize:12,fontFamily:"inherit",width:100}}/>
            <button onClick={applyCustomRange} style={{border:"none",background:"#059669",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontSize:11,fontWeight:700,color:"#fff"}}>✓</button>
          </div>
        )}
      </div>

      <div style={{overflowX:"auto",overflowY:"auto",maxHeight:"75vh",borderRadius:14,boxShadow:"0 4px 24px rgba(15,23,42,0.10)",border:"1px solid #d1d5db",WebkitOverflowScrolling:"touch",background:"#fff"}}>
        <table style={{borderCollapse:"collapse",tableLayout:"fixed",minWidth:CAR_W+dates.length*DATA_W}}>
          <thead>
            <tr>
              {/* Corner */}
              <th style={{width:CAR_W,minWidth:CAR_W,background:"#111827",padding:"6px 4px",fontSize:9,fontWeight:700,textAlign:"center",color:"#9ca3af",letterSpacing:0.5,position:"sticky",left:0,top:0,zIndex:6,borderRight:"2px solid #374151",borderBottom:"2px solid #374151"}}>
                MAKINA
              </th>
              {dates.map(dt=>{
                const isT=dt===td, isW=isWE(dt);
                const d=new Date(dt);
                const isFirstOfMonth=d.getDate()===1;
                return (
                  <th key={dt} style={{
                    width:DATA_W,minWidth:DATA_W,padding:"4px 2px",textAlign:"center",
                    background:isT?"#1d4ed8":isW?"#374151":"#1f2937",
                    borderLeft:isFirstOfMonth?"2px solid #6b7280":"1px solid #374151",
                    borderBottom:"2px solid #374151",
                    position:"sticky",top:0,zIndex:5
                  }}>
                    <div style={{fontSize:9,fontWeight:800,color:isT?"#fff":isW?"#d1d5db":"#f3f4f6",lineHeight:1}}>{fmtD(dt)}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {cars.map(car=>{
              const cc=carColor(car.name,cars.map(c=>c.name));
              return (
                <tr key={car.id}>
                  {/* CAR cell — sticky left, foto si sfond */}
                  <td title={car.model||""} style={{
                    width:CAR_W,minWidth:CAR_W,height:ROW_H,padding:0,textAlign:"center",
                    overflow:"hidden",
                    background:car.photo_url?("linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)), url('"+car.photo_url+"') center/cover no-repeat"):cc.bg,
                    borderRight:"2px solid "+cc.ac,borderBottom:"1px solid #e5e7eb",
                    position:"sticky",left:0,zIndex:2
                  }}>
                    <div style={{fontSize:10,fontWeight:900,color:car.photo_url?"#fff":cc.tx,lineHeight:1.1,letterSpacing:"0.2px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:car.photo_url?"0 1px 3px rgba(0,0,0,0.7)":"none",padding:"0 3px"}}>{car.targa||car.name}</div>
                    {car.model&&<div style={{fontSize:7,fontWeight:600,color:car.photo_url?"rgba(255,255,255,0.85)":cc.tx+"aa",lineHeight:1.1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:car.photo_url?"0 1px 2px rgba(0,0,0,0.7)":"none",padding:"0 3px"}}>{car.model}</div>}
                  </td>

                  {dates.map((dt,di)=>{
                    if(di>0&&covered(car,dt)) return null;
                    const r=findRenderStart(car,dt,di);
                    const isT=dt===td, isW=isWE(dt);
                    const d=new Date(dt);
                    const isFirstOfMonth=d.getDate()===1;

                    if(r){
                      const sp=rowSpan(r,di);
                      const isPaid=r.payment_status==="paguar";
                      const isDone=r.status==="Përfunduar";
                      const isDelivered=r.status==="Dorëzuar";
                      const solidBg=isDone?"#9ca3af":isDelivered?"#2563eb":isPaid?"#16a34a":"#f59e0b";

                      return (
                        <td key={dt} colSpan={sp} onClick={()=>setDet(r)} style={{
                          padding:0,
                          borderTop:"1px solid rgba(255,255,255,0.4)",
                          borderBottom:"1px solid rgba(255,255,255,0.4)",
                          borderRight:"1px solid rgba(255,255,255,0.5)",
                          background:solidBg,
                          cursor:"pointer",
                        }}>
                          <div style={{
                            width:sp*DATA_W,
                            height:ROW_H,
                            padding:"2px 4px",
                            position:"relative",
                            overflow:"hidden",
                            display:"flex",
                            alignItems:"center",
                            gap:5,
                          }}>
                            {/* Separator lines per day for multi-day spans */}
                            {sp>1&&Array.from({length:sp-1}).map((_,ci)=>(
                              <div key={ci} style={{position:"absolute",top:2,bottom:2,left:(ci+1)*DATA_W-1,width:1,background:"rgba(255,255,255,0.35)"}}/>
                            ))}
                            <span style={{fontWeight:800,fontSize:10,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textShadow:"0 1px 2px rgba(0,0,0,0.25)"}}>{(r.client_name||"").split(" ")[0]}</span>
                            {sp>=4&&<span style={{fontSize:9,color:"rgba(255,255,255,0.9)",fontWeight:700,whiteSpace:"nowrap"}}>{fmtM(r.total_price,r.currency)}</span>}
                          </div>
                        </td>
                      );
                    }

                    const cellBg=isT?"#eff6ff":isW?"#f9fafb":"#fff";
                    return (
                      <td key={dt} style={{
                        width:DATA_W,height:ROW_H,
                        borderTop:"1px solid #e5e7eb",
                        borderBottom:"1px solid #e5e7eb",
                        borderRight:isFirstOfMonth?"2px solid #d1d5db":"1px solid #e5e7eb",
                        background:cellBg,
                      }}/>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"center"}}>
        {[["#16a34a","Paguar"],["#2563eb","Në përdorim (dorëzuar)"],["#f59e0b","Pritje pagese"],["#9ca3af","Përfunduar"],["#eff6ff","Sot (bosh)"]].map(([bg,lb])=>(
          <div key={lb} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:"4px 12px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{width:12,height:12,borderRadius:3,background:bg,border:"1px solid #d1d5db"}}/>
            <span style={{color:"#374151",fontWeight:500}}>{lb}</span>
          </div>
        ))}
      </div>

      {det&&<DetModal r={det} sess={sess} addLog={addLog} reload={reload} onClose={()=>setDet(null)} onUpd={u=>setDet(u)} cars={cars} reses={reses} onOpenContract={onOpenContract}/>}
    </div>
  );
}

// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────
function DetModal({r,sess,addLog,reload,onClose,onUpd,cars,reses,onOpenContract}) {
  const [carSetting,setCarSetting]=useState(null);
  const [cur,setCur]=useState(r);
  const [cn,setCn]=useState(r.cond_note||"");
  const [rn,setRn]=useState(r.ret_note||"");
  const [kmOut,setKmOut]=useState(r.km_out||"");
  const [kmIn,setKmIn]=useState(r.km_in||"");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  const [payMethod,setPayMethod]=useState("cash");
  const [depAmt,setDepAmt]=useState("");
  const [depCurrency,setDepCurrency]=useState(r.currency||"ALL");
  const [depTx,setDepTx]=useState([]);
  const [returningDep,setReturningDep]=useState(false);
  const [prepAmt,setPrepAmt]=useState("");
  const [prepMethod,setPrepMethod]=useState("cash");
  const [addingPrep,setAddingPrep]=useState(false);

  useEffect(()=>{
    sbAuthGet("car_settings","car_name=eq."+encodeURIComponent(cur.car_name),sess.token)
      .then(rows=>setCarSetting(rows[0]||null)).catch(()=>setCarSetting(null));
  },[cur.car_name]);

  useEffect(()=>{
    sbAuthGet("cash_ledger","reference_id=eq."+cur.id+"&type=in.(deposit_in,deposit_out)",sess.token)
      .then(rows=>setDepTx(rows||[])).catch(()=>setDepTx([]));
  },[cur.id,saving]);

  async function patch(fields) {
    setSaving(true);
    try {
      const updated=(await sbAuthPatch("reservations",cur.id,fields,sess.token))[0];
      setCur(u=>({...u,...updated}));
      onUpd({...cur,...updated});
      reload();
    } catch(e){alert(e.message);}
    setSaving(false);
  }
  async function addToLedger(amount,currency,type,desc,refId,method){
    try {
      await sbAuthPost("cash_ledger",{
        currency,
        amount:Number(amount),
        type,
        method:method||"cash",
        description:desc,
        reference_id:refId||cur.id,
        created_by:sess.profile?.username||""
      }, sess.token);
    } catch(e){ console.error("addToLedger ERROR:", e.message); }
  }
  const METHOD_LB={cash:"💵 Cash",pos:"💳 POS",transfer:"🏦 Bankë"};

  async function doAddPrepayment(){
    const a=Number(prepAmt);
    if(!a||a<=0){alert("Vendos shumën e parapagimit");return;}
    if(a>debt){alert("Parapagimi nuk mund të jetë më i madh se detyrimi: "+fmtM(debt,cur.currency));return;}
    setAddingPrep(true);
    try {
      const newPaid=Number(cur.amount_paid||0)+a;
      const isFull=newPaid>=Number(cur.total_price);
      // Shto ne cash_ledger
      await addToLedger(a,cur.currency,"prepayment","Parapagim ("+METHOD_LB[prepMethod]+"): "+cur.car_name+" - "+cur.client_name,cur.id,prepMethod);
      // Perditeso amount_paid
      await patch({
        amount_paid:newPaid,
        ...(isFull?{payment_status:"paguar",paid_at:new Date().toISOString(),paid_by:sess.profile?.username}:{})
      });
      addLog("Parapagim ("+METHOD_LB[prepMethod]+")",cur.car_name+" - "+cur.client_name+" "+fmtM(a,cur.currency));
      setPrepAmt("");
    } catch(e){alert(e.message);}
    setAddingPrep(false);
  }
  async function doDeliver(){
    const now=new Date().toISOString(), time=new Date().toTimeString().slice(0,5);
    await patch({status:"Dorëzuar",deliv_at:now,deliv_by:sess.profile?.username,deliv_time:time,km_out:kmOut?Number(kmOut):null});
    addLog("Dorëzim",cur.car_name+" → "+cur.client_name+(kmOut?" · "+kmOut+" km":""));
  }
  async function doCollect(){
    if(cur.payment_status==="paguar") return;
    if(saving) return;
    setSaving(true);
    try {
      const now=new Date().toISOString();
      const remaining=Number(cur.total_price)-Number(cur.amount_paid||0);
      if(remaining<=0){ setSaving(false); return; }
      await patch({payment_status:"paguar",paid_at:now,paid_by:sess.profile?.username,amount_paid:cur.total_price});
      await addToLedger(remaining,cur.currency,"payment","Pagesë ("+METHOD_LB[payMethod]+"): "+cur.car_name+" - "+cur.client_name,null,payMethod);
      addLog("Arkëtim",cur.car_name+" "+fmtM(remaining,cur.currency)+" · "+METHOD_LB[payMethod]);
    } catch(e){alert(e.message);}
    setSaving(false);
  }
  const [partAmt,setPartAmt]=useState("");
  const [collecting,setCollecting]=useState(false);
  async function doCollectPart(){
    const a=Number(partAmt);
    if(!a||a<=0) return;
    if(collecting) return;
    setCollecting(true);
    try {
      const newPaid=Number(cur.amount_paid||0)+a;
      const isFull=newPaid>=Number(cur.total_price);
      const fields=isFull
        ?{amount_paid:cur.total_price,payment_status:"paguar",paid_at:new Date().toISOString(),paid_by:sess.profile?.username}
        :{amount_paid:newPaid};
      await patch(fields);
      await addToLedger(a,cur.currency,"payment","Pagesë pjesë ("+METHOD_LB[payMethod]+"): "+cur.car_name+" - "+cur.client_name,null,payMethod);
      addLog("Arkëtim Pjesë",cur.car_name+" "+fmtM(a,cur.currency)+" · "+METHOD_LB[payMethod]);
      setPartAmt("");
    } catch(e){alert(e.message);}
    setCollecting(false);
  }
  async function doDeliverPay(){
    if(cur.payment_status==="paguar") return;
    if(saving) return;
    setSaving(true);
    try {
      const now=new Date().toISOString(), time=new Date().toTimeString().slice(0,5);
      const remaining=Number(cur.total_price)-Number(cur.amount_paid||0);
      if(remaining<=0){ setSaving(false); return; }
      await patch({status:"Dorëzuar",deliv_at:now,deliv_by:sess.profile?.username,deliv_time:time,payment_status:"paguar",paid_at:now,paid_by:sess.profile?.username,amount_paid:cur.total_price,km_out:kmOut?Number(kmOut):null});
      await addToLedger(remaining,cur.currency,"payment","Pagesë ("+METHOD_LB[payMethod]+"): "+cur.car_name+" - "+cur.client_name,null,payMethod);
      addLog("Dorëzim+Arkëtim",cur.car_name+" "+fmtM(remaining,cur.currency)+(kmOut?" · "+kmOut+" km":"")+" · "+METHOD_LB[payMethod]);
    } catch(e){alert(e.message);}
    setSaving(false);
  }
  const depCur = depTx.length ? depTx[depTx.length-1].currency : depCurrency;
  const depositHeld = depTx.filter(t=>t.type==="deposit_in").reduce((s,t)=>s+Number(t.amount),0) + depTx.filter(t=>t.type==="deposit_out").reduce((s,t)=>s+Number(t.amount),0);
  async function doTakeDeposit(){
    const a=Number(depAmt);
    if(!a||a<=0) return;
    await addToLedger(a,depCurrency,"deposit_in","Depozitë: "+cur.car_name+" - "+cur.client_name,cur.id,payMethod);
    addLog("Merr Depozitë",cur.car_name+" "+fmtM(a,depCurrency));
    setDepAmt("");
    sbAuthGet("cash_ledger","reference_id=eq."+cur.id+"&type=in.(deposit_in,deposit_out)",sess.token).then(rows=>setDepTx(rows||[]));
  }
  async function doReturnDeposit(){
    if(depositHeld<=0) return;
    if(!confirm("Konfirmo kthimin e depozitës "+fmtM(depositHeld,depCur)+" te klienti?")) return;
    setReturningDep(true);
    await addToLedger(-depositHeld,depCur,"deposit_out","Kthim depozite: "+cur.car_name+" - "+cur.client_name,cur.id,payMethod);
    addLog("Kthim Depozitë",cur.car_name+" "+fmtM(depositHeld,depCur));
    setReturningDep(false);
    sbAuthGet("cash_ledger","reference_id=eq."+cur.id+"&type=in.(deposit_in,deposit_out)",sess.token).then(rows=>setDepTx(rows||[]));
  }
  async function doReturn(){
    if(!kmIn){alert("Fut km e makinës në momentin e marrjes");return;}
    const kmInNum=Number(kmIn);
    const oilFloor=carSetting?.last_oil_km?Number(carSetting.last_oil_km):0;
    const priorMaxKm=Math.max(0,...(reses||[]).filter(x=>x.car_name===cur.car_name&&x.id!==cur.id&&x.km_in).map(x=>Number(x.km_in)));
    const floor=Math.max(oilFloor,priorMaxKm);
    if(kmInNum<floor){
      const reason=oilFloor>=priorMaxKm?"kur janë ndërruar vaj/filtrat":"herën e fundit";
      alert("⚠️ Km e shkruar ("+kmInNum.toLocaleString()+") është më pak se "+floor.toLocaleString()+" km — kjo makinë ka pasur "+floor.toLocaleString()+" km "+reason+". Kontrollo numrin.");
      return;
    }
    const now=new Date().toISOString(), time=new Date().toTimeString().slice(0,5);
    await patch({status:"Përfunduar",ret_at:now,ret_by:sess.profile?.username,ret_time:time,ret_note:rn,cond_note:cn,km_in:kmInNum});
    addLog("Marrje",cur.car_name+" ← "+cur.client_name+" · "+kmIn+" km");
  }
  async function saveNotes(){
    await patch({cond_note:cn,ret_note:rn});
    addLog("Shënime",cur.car_name);
    setSaved(true); setTimeout(()=>setSaved(false),1200);
  }

  const paid=cur.payment_status==="paguar";
  const done=cur.status==="Anuluar"||cur.status==="Përfunduar";
  const amountPaid=Number(cur.amount_paid||0);
  const debt=Number(cur.total_price||0)-amountPaid;

  return (
    <Modal title={carLabel(cur.car_name,cars)} onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        {[["Klienti",cur.client_name||"-"],["Telefon",cur.client_phone||"-"],["Nga",fmtFull(cur.date_from)+(cur.pickup_time?" 🕐"+cur.pickup_time:"")],["Deri",fmtFull(cur.date_to)+(cur.return_time?" 🕐"+cur.return_time:"")],["Ditë",diffDays(cur.date_from,cur.date_to)+" ditë"],["Çmim/Ditë",fmtM(cur.price_per_day,cur.currency)]].map(([l,v])=>(
          <div key={l} style={{background:"#f8fafc",borderRadius:7,padding:"7px 10px"}}>
            <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>{l}</div>
            <div style={{fontSize:13,color:"#0f172a",fontWeight:500,marginTop:1}}>{v}</div>
          </div>
        ))}
        <div style={{gridColumn:"span 2",background:"linear-gradient(135deg,#eff6ff,#dbeafe)",borderRadius:9,padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div><div style={{fontSize:10,color:"#64748b",fontWeight:600}}>TOTALI</div><div style={{fontSize:20,color:"#1d4ed8",fontWeight:800}}>{fmtM(cur.total_price,cur.currency)}</div></div>
          <Badge s={cur.status}/>
        </div>
      </div>

      {/* ── KONTRATË QERAJE — buton i ri ── */}
      <button onClick={()=>{
        localStorage.setItem("crm_open_contract_res_id",cur.id);
        onOpenContract&&onOpenContract();
        onClose();
      }} style={{...PB,background:"#0f766e",width:"100%",marginBottom:14,fontSize:13,padding:"9px 0"}}>📝 Shko te Kontrata (Pickup / Dropoff)</button>

      {/* Parapagim */}
      {!done&&!paid&&(
        <div style={{padding:"10px 14px",borderRadius:9,marginBottom:12,background:"#f0fdf4",border:"1px solid #bbf7d0"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:16}}>🟡</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:"#166534"}}>Parapagim</div>
              {amountPaid>0
                ?<div style={{fontSize:11,color:"#166534"}}>Paguar deri tani: <strong>{fmtM(amountPaid,cur.currency)}</strong> · Mbetet: <strong>{fmtM(debt,cur.currency)}</strong></div>
                :<div style={{fontSize:11,color:"#94a3b8"}}>Nuk ka parapagim të regjistruar</div>
              }
            </div>
          </div>
          <div style={{display:"flex",gap:5,marginBottom:8}}>
            {Object.entries(METHOD_LB).map(([m,lb])=>(
              <button key={m} onClick={()=>setPrepMethod(m)} style={{
                flex:1,border:"1px solid "+(prepMethod===m?"#16a34a":"#e2e8f0"),borderRadius:7,padding:"6px 4px",
                fontSize:11,fontWeight:700,cursor:"pointer",
                background:prepMethod===m?"#dcfce7":"#fff",color:prepMethod===m?"#166534":"#64748b"
              }}>{lb}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <input type="number" value={prepAmt} onChange={e=>setPrepAmt(e.target.value)}
              placeholder={"Shumë parapagim (max "+fmtM(debt,cur.currency)+")"}
              style={{...FL,flex:1,fontSize:12,padding:"7px 10px"}}/>
            <button onClick={doAddPrepayment} disabled={addingPrep||!prepAmt}
              style={{...PB,background:"#16a34a",fontSize:12,padding:"7px 14px",whiteSpace:"nowrap"}}>
              {addingPrep?"...":"🟡 Shto Parapagim"}
            </button>
          </div>
          {prepAmt&&Number(prepAmt)>0&&debt>0&&(
            <div style={{marginTop:6,fontSize:11,color:"#166534",fontWeight:600}}>
              Pas parapagimit: detyrim final = {fmtM(Math.max(0,debt-Number(prepAmt)),cur.currency)}
            </div>
          )}
        </div>
      )}

      <div style={{padding:"10px 14px",borderRadius:9,marginBottom:12,background:paid?"#dcfce7":"#fef3c7",border:"1px solid "+(paid?"#bbf7d0":"#fde68a")}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>{paid?"✅":"⏳"}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,color:paid?"#166534":"#92400e"}}>{paid?"Paguar":amountPaid>0?"Pagesë e pjesshme":"Pagesa në pritje"}</div>
            {cur.paid_at&&<div style={{fontSize:11,color:"#64748b"}}>{fmtDT(cur.paid_at)} · {cur.paid_by}</div>}
            {!paid&&amountPaid>0&&<div style={{fontSize:11,color:"#92400e",marginTop:2}}>Paguar: {fmtM(amountPaid,cur.currency)} · Detyrim: <strong>{fmtM(debt,cur.currency)}</strong></div>}
          </div>
        </div>
        {!paid&&!done&&(
          <>
            <div style={{display:"flex",gap:5,marginTop:10,marginBottom:8}}>
              {Object.entries(METHOD_LB).map(([m,lb])=>(
                <button key={m} onClick={()=>setPayMethod(m)} style={{
                  flex:1,border:"1px solid "+(payMethod===m?"#1d4ed8":"#e2e8f0"),borderRadius:7,padding:"6px 4px",
                  fontSize:11,fontWeight:700,cursor:"pointer",
                  background:payMethod===m?"#eff6ff":"#fff",color:payMethod===m?"#1d4ed8":"#64748b"
                }}>{lb}</button>
              ))}
            </div>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <button onClick={doCollect} disabled={saving} style={{...PB,background:"#16a34a",fontSize:12,padding:"7px 12px",whiteSpace:"nowrap"}}>💵 Arkëto Gjithë</button>
              <input type="number" value={partAmt} onChange={e=>setPartAmt(e.target.value)} placeholder={"Shumë (max "+fmtM(debt,cur.currency)+")"} style={{...FL,flex:1,fontSize:12,padding:"7px 10px"}}/>
              <button onClick={doCollectPart} disabled={collecting||!partAmt} style={{...PB,background:"#0ea5e9",fontSize:12,padding:"7px 12px",whiteSpace:"nowrap"}}>{collecting?"...":"Pjesë"}</button>
            </div>
          </>
        )}
      </div>

      {/* Depozitë */}
      <div style={{padding:"10px 14px",borderRadius:9,marginBottom:12,background:depositHeld>0?"#eff6ff":"#f8fafc",border:"1px solid "+(depositHeld>0?"#bfdbfe":"#e2e8f0")}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:depositHeld>0?8:0}}>
          <span style={{fontSize:16}}>🔒</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,color:depositHeld>0?"#1e40af":"#64748b"}}>Depozitë</div>
            {depositHeld>0
              ? <div style={{fontSize:12,color:"#1e40af"}}>Mban aktualisht: <strong>{fmtM(depositHeld,depCur)}</strong></div>
              : <div style={{fontSize:11,color:"#94a3b8"}}>Nuk ka depozitë të mbajtur</div>
            }
          </div>
          {depositHeld>0&&(
            <button onClick={doReturnDeposit} disabled={returningDep} style={{...PB,background:"#7c3aed",fontSize:11,padding:"6px 10px",whiteSpace:"nowrap"}}>↩️ Kthe Depozitën</button>
          )}
        </div>
        {!done&&(
          <div style={{display:"flex",gap:6}}>
            <input type="number" value={depAmt} onChange={e=>setDepAmt(e.target.value)} placeholder="Shumë depozitë..." style={{...FL,flex:1,fontSize:12,padding:"7px 10px"}}/>
            <select value={depCurrency} onChange={e=>setDepCurrency(e.target.value)} style={{...FL,flex:"0 0 80px",fontSize:12,padding:"7px 6px"}}>
              <option value="ALL">Lekë</option>
              <option value="EUR">Euro</option>
            </select>
            <button onClick={doTakeDeposit} disabled={!depAmt} style={{...PB,background:"#1d4ed8",fontSize:12,padding:"7px 12px",whiteSpace:"nowrap"}}>➕ Merr Depozitë</button>
          </div>
        )}
      </div>

      {!done&&(
        <div style={{marginBottom:12}}>
          {(cur.status==="Konfirmuar"||cur.status==="Aktive")&&(
            <div style={{marginBottom:8}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>🚗 Km në momentin e dorëzimit (opsionale)</label>
              <input type="number" value={kmOut} onChange={e=>setKmOut(e.target.value)} placeholder="p.sh. 45200" style={FL}/>
            </div>
          )}
          {cur.status==="Dorëzuar"&&(
            <div style={{marginBottom:8}}>
              <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>🏁 Km në momentin e marrjes *</label>
              <input type="number" value={kmIn} onChange={e=>setKmIn(e.target.value)} placeholder="p.sh. 45850" style={FL}/>
              {cur.km_out&&kmIn&&<div style={{fontSize:11,color:"#64748b",marginTop:3}}>Distanca e përshkuar: <strong>{Number(kmIn)-Number(cur.km_out)} km</strong></div>}
            </div>
          )}
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {(cur.status==="Konfirmuar"||cur.status==="Aktive")&&<>
              {!paid&&<button onClick={doDeliverPay} disabled={saving} style={{...PB,flex:1,fontSize:12}}>🔑 Dorëzo + Arkëto</button>}
              <button onClick={doDeliver} disabled={saving} style={{...PB,flex:1,background:"#7c3aed",fontSize:12}}>🔑 Vetëm Dorëzo</button>
            </>}
            {cur.status==="Dorëzuar"&&!paid&&<button onClick={doCollect} disabled={saving} style={{...PB,background:"#16a34a",flex:1,fontSize:12}}>💵 Arkëto Pagesen</button>}
            {cur.status==="Dorëzuar"&&<button onClick={doReturn} disabled={saving} style={{...PB,background:"#059669",flex:1,fontSize:12}}>🏁 Merr Makinën</button>}
          </div>
        </div>
      )}

      {cur.km_out&&<div style={{fontSize:11,color:"#64748b",marginBottom:2}}>🚗 Km dorëzimi: <strong>{cur.km_out}</strong></div>}
      {cur.km_in&&<div style={{fontSize:11,color:"#64748b",marginBottom:2}}>🏁 Km marrja: <strong>{cur.km_in}</strong> {cur.km_out&&<span>· {Number(cur.km_in)-Number(cur.km_out)} km përshkuar</span>}</div>}

      {cur.deliv_at&&<div style={{fontSize:11,color:"#64748b",marginBottom:4}}>🔑 Dorëzuar: {fmtDT(cur.deliv_at)}{cur.deliv_time?" ora "+cur.deliv_time:""} · {cur.deliv_by}</div>}
      {cur.ret_at&&<div style={{fontSize:11,color:"#64748b",marginBottom:8}}>🏁 Marrë: {fmtDT(cur.ret_at)}{cur.ret_time?" ora "+cur.ret_time:""} · {cur.ret_by}</div>}

      <div style={{marginTop:10}}>
        <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>📋 Gjendja kur u dha</label>
        <textarea value={cn} onChange={e=>setCn(e.target.value)} style={{...FL,height:58,resize:"vertical"}} placeholder="Dëmtime, karburant, km..."/>
      </div>
      <div style={{marginTop:8}}>
        <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>🏁 Gjendja kur u kthye</label>
        <textarea value={rn} onChange={e=>setRn(e.target.value)} style={{...FL,height:58,resize:"vertical"}} placeholder="Dëmtime të reja, karburant, km..."/>
      </div>
      <button onClick={saveNotes} disabled={saving} style={{...PB,width:"100%",marginTop:8,background:saved?"#16a34a":"#475569"}}>
        {saving?"Duke ruajtur...":saved?"✅ Ruajtur!":"💾 Ruaj Shënimet"}
      </button>
      {cur.notes&&<div style={{marginTop:10,padding:"8px 12px",background:"#f8fafc",borderRadius:7,fontSize:13,color:"#374151"}}>💬 {cur.notes}</div>}
    </Modal>
  );
}

// ─── RESERVATIONS ─────────────────────────────────────────────────────────────
function ResPage({sess,reload,reloadTick,addLog,onOpenContract}) {
  const mob=useMobile();
  const [reses,setReses]=useState([]);
  const [cars,setCars]=useState([]);
  const [clients,setClients]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [showF,setShowF]=useState(false);
  const [editId,setEditId]=useState(null);
  const [detId,setDetId]=useState(null);
  const [filt,setFilt]=useState("all");
  const [srch,setSrch]=useState("");
  const empty={car_name:"",car_id:"",client_name:"",client_phone:"",client_id_card:"",date_from:"",date_to:"",pickup_time:"10:00",return_time:"10:00",price_per_day:"",currency:"ALL",total_price:"",billing_days:"",prepayment:null,prepayment_method:"cash",status:"Konfirmuar",payment_status:"pritje",notes:""};
  const [form,setForm]=useState(empty);
  const nd=diffDays(form.date_from,form.date_to);

  const liveConflicts = (form.car_name&&form.date_from&&form.date_to) ? reses.filter(r=>{
    const sameCar=form.car_id?r.car_id===form.car_id:r.car_name===form.car_name;
    if(!sameCar) return false;
    if(r.status==="Anuluar"||r.status==="Përfunduar") return false;
    if(editId&&r.id===editId) return false;
    return form.date_from<=r.date_to&&form.date_to>=r.date_from;
  }) : [];
  const selectedCarObj = cars.find(c=>c.name===form.car_name);
  const isPassiveCar = selectedCarObj && selectedCarObj.active===false;

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("reservations","",sess.token),
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("clients","order=name.asc",sess.token)
    ]).then(([r,c,cl])=>{setReses(r);setCars(c);setClients(cl);setLoading(false);}).catch(e=>{setErr(e.message);setLoading(false);});
  },[reloadTick,sess.token]);

  // Kur ndryshojnë datat, rillogarit automatikisht numrin e ditëve për faturim —
  // por kjo qelizë mbetet e lirë për t'u ndryshuar manualisht pas kësaj (marrëveshje e veçantë me klientin)
  useEffect(()=>{
    if(form.date_from&&form.date_to) setForm(f=>({...f,billing_days:diffDays(f.date_from,f.date_to)}));
  },[form.date_from,form.date_to]);

  useEffect(()=>{
    const days=Number(form.billing_days)||0;
    if(form.price_per_day&&days>0) setForm(f=>({...f,total_price:(Number(f.price_per_day)*days).toFixed(0)}));
  },[form.price_per_day,form.billing_days]);

  async function doSave(){
    if(!form.car_name||!form.client_name||!form.total_price){alert("Plotëso fushat e detyrueshme");return;}
    if(!form.date_from||!form.date_to){alert("Zgjidh datat e rezervimit");return;}
    if(form.date_to < form.date_from){
      alert("Data e kthimit nuk mund të jetë para datës së marrjes! Kontrollo datat e zgjedhura.");
      return;
    }
    const selCarObj=cars.find(c=>c.name===form.car_name);
    if(selCarObj&&selCarObj.active===false){
      alert("⚠️ Kjo makinë është PASIVE dhe nuk mund të rezervohet. Kontakto administratorin.");
      return;
    }
    try {
      // Kontrollo disponueshmërinë e makinës (sipas ID, jo emrit - për të shmangur përzierjen mes makinave me emër të njëjtë)
      const conflicts = reses.filter(r => {
        const sameCar = form.car_id ? r.car_id===form.car_id : r.car_name===form.car_name;
        if(!sameCar) return false;
        if(r.status === "Anuluar" || r.status === "Përfunduar") return false;
        if(editId && r.id === editId) return false; // mos kontrollo veten nëse edito
        // Overlap: A.from <= B.to && A.to >= B.from
        return form.date_from <= r.date_to && form.date_to >= r.date_from;
      });
      if(conflicts.length > 0){
        const cf=conflicts[0];
        const msg="Makina "+form.car_name+" nuk eshte e disponueshme! Ekziston rezervim: "+cf.client_name+" ("+fmtFull(cf.date_from)+" - "+fmtFull(cf.date_to)+"). Zgjidh data tjera ose makine tjeter.";
        alert(msg);
        return;
      }
      // Nderto body pa fushat qe nuk duhen ne tabele
      const {prepayment, prepayment_method, billing_days, ...formRest} = form;
      const body={
        ...formRest,
        car_id:form.car_id||null,
        price_per_day:Number(form.price_per_day)||0,
        total_price:Number(form.total_price)||0,
        created_by:sess.profile?.username
      };
      // Nese pagesa shenohet "Paguar" nga kjo faqe, sinkronizo automatikisht shumen e paguar
      // (perndryshe raportet e te ardhurave dalin gabim per rezervimet e ndryshuara ketej)
      if(body.payment_status==="paguar"){
        body.amount_paid = body.total_price;
      }
      if(editId){
        await sbAuthPatch("reservations",editId,body,sess.token);
        addLog("Ndrysho Rezervim",form.car_name+" - "+form.client_name);
      } else {
        const [newRes]=await sbAuthPost("reservations",body,sess.token);
        addLog("Shto Rezervim",form.car_name+" - "+form.client_name+" "+fmtM(form.total_price,form.currency));
        // Shto parapagimin ne arke nese eshte vendosur
        if(form.prepayment&&Number(form.prepayment)>0){
          const prepAmt=Number(form.prepayment);
          const METHOD_LB2={cash:"💵 Cash",pos:"💳 POS",transfer:"🏦 Bankë"};
          await sbAuthPost("cash_ledger",{
            currency:form.currency,
            amount:prepAmt,
            method:form.prepayment_method||"cash",
            type:"prepayment",
            description:"Parapagim ("+METHOD_LB2[form.prepayment_method||"cash"]+"): "+form.car_name+" - "+form.client_name,
            reference_id:newRes?.id||null,
            created_by:sess.profile?.username||""
          },sess.token);
          // Perditeso amount_paid ne rezervim
          const newPaid=prepAmt;
          const isFull=newPaid>=Number(form.total_price);
          await sbAuthPatch("reservations",newRes?.id,{
            amount_paid:newPaid,
            ...(isFull?{payment_status:"paguar",paid_at:new Date().toISOString(),paid_by:sess.profile?.username}:{})
          },sess.token);
          addLog("Parapagim ("+METHOD_LB2[form.prepayment_method||"cash"]+")",form.car_name+" - "+form.client_name+" "+fmtM(prepAmt,form.currency));
        }
        // Shto klientin automatikisht nese nuk ekziston
        try {
          const existing = await sbAuthGet("clients","name=eq."+encodeURIComponent(form.client_name),sess.token);
          if(existing.length===0){
            await sbAuthPost("clients",{
              name:form.client_name,
              phone:form.client_phone||"",
              id_card:form.client_id_card||""
            },sess.token);
            addLog("Shto Klient (auto)",form.client_name);
          } else {
            // Perditeso telefon/id nese mungojne
            const cl=existing[0];
            const updates={};
            if(!cl.phone&&form.client_phone) updates.phone=form.client_phone;
            if(!cl.id_card&&form.client_id_card) updates.id_card=form.client_id_card;
            if(Object.keys(updates).length>0){
              await sbAuthPatch("clients",cl.id,updates,sess.token);
            }
          }
        } catch(ce){ console.error("client auto-add error:",ce.message); }
      }
      reload(); setShowF(false);
    } catch(e){alert(e.message);}
  }
  async function doDel(id){
    const r=reses.find(x=>x.id===id);
    try { await sbAuthDelete("reservations",id,sess.token); reload(); addLog("Fshi Rezervim",(r?.car_name||"")+" - "+(r?.client_name||"")); } catch(e){alert(e.message);}
  }

  const carNames=cars.map(c=>c.name);
  const list=reses.filter(r=>filt==="all"||r.status===filt).filter(r=>!srch||r.client_name?.toLowerCase().includes(srch.toLowerCase())||r.car_name?.toLowerCase().includes(srch.toLowerCase())).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const detR=detId?reses.find(r=>r.id===detId):null;

  if(loading) return <Spin/>;
  if(err) return <Err msg={err} onRetry={reload}/>;

  return (
    <div style={{padding:mob?10:14,maxWidth:1100,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>📋 Rezervimet</h2>
        <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Kërko..." style={{padding:"7px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,width:160,fontFamily:"inherit"}}/>
        <select value={filt} onChange={e=>setFilt(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit"}}>
          <option value="all">Të gjitha</option>
          {Object.keys(SC).map(s=><option key={s}>{s}</option>)}
        </select>
        <button onClick={()=>{setForm({...empty,car_name:carNames[0]||""});setEditId(null);setShowF(true)}} style={PB}>+ Rezervim i Ri</button>
      </div>

      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
        {Object.entries(SC).map(([s,c])=>{const cnt=reses.filter(r=>r.status===s).length; return <div key={s} onClick={()=>setFilt(filt===s?"all":s)} style={{background:c.bg,border:"1.5px solid "+c.bd,borderRadius:10,padding:"6px 12px",cursor:"pointer",textAlign:"center",minWidth:70}}><div style={{fontWeight:800,fontSize:18,color:c.tx}}>{cnt}</div><div style={{fontSize:10,color:c.tx,fontWeight:600}}>{s}</div></div>;})}
      </div>

      {list.length===0
        ? <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",padding:40,textAlign:"center",color:"#94a3b8"}}>Asnjë rezervim.</div>
        : list.map(r=>{
          const cc=carColor(r.car_name,carNames);
          return <div key={r.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"12px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"flex-start",borderLeft:"4px solid "+cc.ac,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"}}>
                <div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>{carLabel(r.car_name,cars)}</div>
                <div style={{fontSize:15,fontWeight:800,color:"#1d4ed8",flexShrink:0}}>{fmtM(r.total_price,r.currency)}</div>
              </div>
              <div style={{fontSize:13,color:"#374151",marginTop:2}}>👤 {r.client_name}{r.client_phone&&<span style={{color:"#94a3b8"}}> · {r.client_phone}</span>}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{fmtFull(r.date_from)}{r.pickup_time&&" "+r.pickup_time} → {fmtFull(r.date_to)}{r.return_time&&" "+r.return_time} · {diffDays(r.date_from,r.date_to)} ditë</div>
              <div style={{display:"flex",gap:6,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
                <Badge s={r.status}/>
                <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:r.payment_status==="paguar"?"#dcfce7":Number(r.amount_paid||0)>0?"#dbeafe":"#fef3c7",color:r.payment_status==="paguar"?"#166534":Number(r.amount_paid||0)>0?"#1e40af":"#92400e"}}>
                  {r.payment_status==="paguar"?"✅ Paguar":Number(r.amount_paid||0)>0?"💰 Para-"+fmtM(r.amount_paid,r.currency):"⏳ Pritje"}
                </span>
                {r.payment_status!=="paguar"&&Number(r.amount_paid||0)>0&&(
                  <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:"#fef2f2",color:"#dc2626"}}>
                    Detyrim: {fmtM(Number(r.total_price||0)-Number(r.amount_paid||0),r.currency)}
                  </span>
                )}
                <div style={{flex:1}}/>
                <button onClick={()=>setDetId(r.id)} style={{...IB,background:"#eff6ff",color:"#1d4ed8",fontWeight:700,fontSize:12,padding:"5px 10px"}}>🔍</button>
                <button onClick={()=>{setForm({car_name:r.car_name,car_id:r.car_id||"",client_name:r.client_name,client_phone:r.client_phone||"",client_id_card:r.client_id_card||"",date_from:r.date_from,date_to:r.date_to,pickup_time:r.pickup_time||"10:00",return_time:r.return_time||"10:00",price_per_day:r.price_per_day,currency:r.currency,total_price:r.total_price,billing_days:diffDays(r.date_from,r.date_to),status:r.status,payment_status:r.payment_status,notes:r.notes||""});setEditId(r.id);setShowF(true)}} style={{...IB,fontSize:12,padding:"5px 10px"}}>✏️</button>
                {sess.profile?.role==="admin"&&<button onClick={()=>doDel(r.id)} style={{...IB,color:"#dc2626",fontSize:12,padding:"5px 10px"}}>🗑️</button>}
              </div>
            </div>
          </div>;
        })
      }

      {showF&&<Modal title={editId?"Ndrysho Rezervim":"Rezervim i Ri"} onClose={()=>setShowF(false)} wide>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Klienti *" col2>
            <input value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} style={FL} placeholder="Emri Mbiemri" list="clients-list"/>
            <datalist id="clients-list">{clients.map(c=><option key={c.id} value={c.name}/>)}</datalist>
          </Fld>
          <Fld label="Telefoni"><input value={form.client_phone} onChange={e=>setForm(f=>({...f,client_phone:e.target.value}))} style={FL}/></Fld>
          <Fld label="Nr. ID"><input value={form.client_id_card} onChange={e=>setForm(f=>({...f,client_id_card:e.target.value}))} style={FL}/></Fld>
          <Fld label="Makina *" col2><CarPicker cars={cars} value={form.car_name} onChange={car=>setForm(f=>({...f,car_name:car.name,car_id:car.id}))}/></Fld>
          <Fld label="Nga Data *"><DateInput value={form.date_from} onChange={v=>setForm(f=>({...f,date_from:v}))}/></Fld>
          <Fld label="Ora Marrjes"><input type="time" value={form.pickup_time} onChange={e=>setForm(f=>({...f,pickup_time:e.target.value}))} style={FL}/></Fld>
          <Fld label="Deri Data *"><DateInput value={form.date_to} onChange={v=>setForm(f=>({...f,date_to:v}))}/></Fld>
          <Fld label="Ora Dorëzimit"><input type="time" value={form.return_time} onChange={e=>setForm(f=>({...f,return_time:e.target.value}))} style={FL}/></Fld>
          <Fld label={"Numri i Ditëve (nga datat: "+nd+" · mund ta ndryshosh vetë)"} col2>
            <input type="number" min="0" value={form.billing_days} onChange={e=>setForm(f=>({...f,billing_days:e.target.value}))} style={FL} placeholder="p.sh. 5"/>
          </Fld>
          <Fld label="Km kur u dha"><input type="number" value={form.km_out||""} onChange={e=>setForm(f=>({...f,km_out:e.target.value}))} style={FL} placeholder="p.sh. 45200"/></Fld>
          <Fld label="Km kur u kthye"><input type="number" value={form.km_in||""} onChange={e=>setForm(f=>({...f,km_in:e.target.value}))} style={FL} placeholder="p.sh. 46800"/></Fld>
          {isPassiveCar&&(
            <div style={{gridColumn:"span 2",background:"#f1f5f9",border:"2px solid #64748b",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#334155",fontWeight:700}}>
              ⚠️ Kjo makinë është <strong>PASIVE</strong> — nuk mund të rezervohet. Kontakto administratorin.
            </div>
          )}
          {liveConflicts.length>0&&(
            <div style={{gridColumn:"span 2",background:"#fef2f2",border:"2px solid #dc2626",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#991b1b",fontWeight:700}}>
              🚫 Makina e ZËNË për këto data! {liveConflicts.map(r=>r.client_name+" ("+fmtFull(r.date_from)+" - "+fmtFull(r.date_to)+")").join(", ")} — zgjidh datë tjetër ose makinë tjetër.
            </div>
          )}
          <Fld label={"Çmim/Ditë (faturim: "+(form.billing_days||nd)+" d)"}><input type="number" value={form.price_per_day} onChange={e=>setForm(f=>({...f,price_per_day:e.target.value}))} style={FL}/></Fld>
          <Fld label="Monedha"><select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>
          <Fld label="Totali *" col2><input type="number" value={form.total_price} onChange={e=>setForm(f=>({...f,total_price:e.target.value}))} style={{...FL,fontWeight:700}}/></Fld>
          {/* Parapagimi */}
          {!editId&&(
            <div style={{gridColumn:"span 2",background:"#f0fdf4",border:"1px solid #bbf7d0",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:12,fontWeight:700,color:"#166534",marginBottom:10}}>💰 Parapagim (opsional)</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <Fld label="Shuma Parapagimit">
                  <input type="number" value={form.prepayment} onChange={e=>setForm(f=>({...f,prepayment:e.target.value}))} style={FL} placeholder="0"/>
                </Fld>
                <Fld label="Mënyra">
                  <select value={form.prepayment_method} onChange={e=>setForm(f=>({...f,prepayment_method:e.target.value}))} style={FL}>
                    <option value="cash">💵 Cash</option>
                    <option value="pos">💳 POS</option>
                    <option value="transfer">🏦 Bankë</option>
                  </select>
                </Fld>
              </div>
              {form.prepayment&&Number(form.prepayment)>0&&form.total_price&&(
                <div style={{marginTop:8,display:"flex",gap:16,fontSize:12,flexWrap:"wrap"}}>
                  <span style={{color:"#16a34a",fontWeight:700}}>✅ Parapagim: {fmtM(Number(form.prepayment),form.currency)}</span>
                  <span style={{color:Number(form.total_price)-Number(form.prepayment)>0?"#dc2626":"#16a34a",fontWeight:700}}>
                    {Number(form.total_price)-Number(form.prepayment)>0
                      ?"⏳ Detyrim final: "+fmtM(Number(form.total_price)-Number(form.prepayment),form.currency)
                      :"✅ Paguar plotësisht!"}
                  </span>
                </div>
              )}
            </div>
          )}
          <Fld label="Statusi"><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={FL}>{Object.keys(SC).map(s=><option key={s}>{s}</option>)}</select></Fld>
          <Fld label="Pagesa"><select value={form.payment_status} onChange={e=>setForm(f=>({...f,payment_status:e.target.value}))} style={FL}><option value="pritje">Pritje</option><option value="paguar">Paguar</option></select></Fld>
          <Fld label="Shënime" col2><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...FL,height:50,resize:"vertical"}}/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button onClick={()=>setShowF(false)} style={CB}>Anulo</button>
          <button onClick={doSave} disabled={liveConflicts.length>0||isPassiveCar} style={{...PB,opacity:(liveConflicts.length>0||isPassiveCar)?0.5:1,cursor:(liveConflicts.length>0||isPassiveCar)?"not-allowed":"pointer"}}>💾 Ruaj</button>
        </div>
      </Modal>}
      {detR&&<DetModal r={detR} sess={sess} addLog={addLog} reload={reload} onClose={()=>setDetId(null)} onUpd={u=>{setDetId(u.id);setReses(rs=>rs.map(x=>x.id===u.id?u:x));}} cars={cars} reses={reses} onOpenContract={onOpenContract}/>}
    </div>
  );
}

// ─── FINANCE ─────────────────────────────────────────────────────────────────
function FinPage({sess,reload,reloadTick,addLog}) {
  const mob=useMobile();
  const [reses,setReses]=useState([]);
  const [exps,setExps]=useState([]);
  const [cars,setCars]=useState([]);
  const [ledger,setLedger]=useState([]);
  const [loading,setLoading]=useState(true);
  const [returningId,setReturningId]=useState(null);

  useEffect(()=>{
    setLoading(true);
    Promise.all([sbAuthGet("reservations","",sess.token),sbAuthGet("expenses","",sess.token),sbAuthGet("cars","order=sort_order.asc",sess.token),sbAuthGet("cash_ledger","",sess.token)])
      .then(([r,e,c,l])=>{setReses(r);setExps(e);setCars(c);setLedger(l);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  if(loading) return <Spin/>;

  // Depozitat e mbajtura (te pa-kthyera) - grupuar sipas rezervimit
  const resById={}; reses.forEach(r=>{resById[r.id]=r;});
  const depGroups={};
  ledger.filter(l=>l.type==="deposit_in"||l.type==="deposit_out").forEach(l=>{
    const rid=l.reference_id; if(!rid) return;
    if(!depGroups[rid]) depGroups[rid]={reservation:resById[rid],held:0,currency:l.currency};
    depGroups[rid].held += Number(l.amount);
    depGroups[rid].currency=l.currency;
  });
  const heldDeposits=Object.entries(depGroups).filter(([,g])=>g.held>0.01&&g.reservation);

  async function returnDeposit(rid,g){
    if(!confirm("Konfirmo kthimin e depozitës "+fmtM(g.held,g.currency)+" te "+g.reservation.client_name+"?")) return;
    setReturningId(rid);
    try {
      await sbAuthPost("cash_ledger",{
        currency:g.currency, amount:-g.held, type:"deposit_out", method:"cash",
        description:"Kthim depozite: "+g.reservation.car_name+" - "+g.reservation.client_name,
        reference_id:rid, created_by:sess.profile?.username||""
      },sess.token);
      addLog&&addLog("Kthim Depozitë",g.reservation.car_name+" "+fmtM(g.held,g.currency));
      reload&&reload();
      setLedger(ls=>[...ls,{type:"deposit_out",amount:-g.held,currency:g.currency,reference_id:rid}]);
    } catch(e){ alert(e.message); }
    setReturningId(null);
  }

  const paid=reses.filter(r=>r.status!=="Anuluar"&&Number(r.amount_paid||0)>0);
  // Të ardhurat vijnë nga cash_ledger (arkëtime + hyrje manuale) - reflekton çdo arkëtim real, i plotë ose i pjesshëm
  const incL=ledger.filter(l=>l.currency==="ALL"&&(l.type==="payment"||l.type==="manual_in")).reduce((s,l)=>s+Number(l.amount),0);
  const incE=ledger.filter(l=>l.currency==="EUR"&&(l.type==="payment"||l.type==="manual_in")).reduce((s,l)=>s+Number(l.amount),0);
  const expL=exps.filter(e=>e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0);
  const expE=exps.filter(e=>e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0);
  const carNames=cars.map(c=>c.name);
  const maxInc=Math.max(...carNames.map(cn=>paid.filter(r=>r.car_name===cn).reduce((s,r)=>s+Number(r.amount_paid)*(r.currency==="EUR"?108:1),0)),1);

  return (
    <div style={{padding:mob?10:14,maxWidth:1000,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 12px",fontSize:mob?15:17,fontWeight:700,color:"#0f172a"}}>📊 Financa</h2>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        {[["🇦🇱","LEKË",incL,expL,true,"#0f172a"],["🇪🇺","EURO",incE,expE,false,"#064e3b"]].map(([fl,title,inc,exp,isL,hbg],i)=>(
          <div key={i} style={{background:"#fff",border:"2px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
            <div style={{background:hbg,color:"#fff",padding:"8px 12px",fontWeight:700,fontSize:mob?11:13}}>{fl} {title}</div>
            <div style={{padding:mob?"10px 10px":"14px 16px",display:"flex",flexDirection:"column",gap:6}}>
              {[["Të ardhura",inc,"#1d4ed8"],["Shpenzime",exp,"#dc2626"],["Balanca",inc-exp,(inc-exp)>=0?"#16a34a":"#dc2626"]].map(([lb,val,col],j)=>(
                <div key={lb} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:j===2?6:0,borderTop:j===2?"1px solid #e2e8f0":"none"}}>
                  <span style={{fontSize:mob?10:12,color:"#64748b",fontWeight:j===2?700:400}}>{lb}</span>
                  <span style={{fontSize:mob?j===2?14:11:j===2?17:13,fontWeight:j===2?800:700,color:col}}>
                    {isL?Math.round(val).toLocaleString("sq-AL")+" L":"€"+val.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {heldDeposits.length>0&&(
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:mob?12:20,marginBottom:12}}>
          <h3 style={{margin:"0 0 10px",fontSize:mob?12:15,fontWeight:700,color:"#0f172a"}}>🔒 Depozita të Mbajtura</h3>
          {heldDeposits.map(([rid,g])=>(
            <div key={rid} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #f1f5f9",flexWrap:"wrap"}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:12,color:"#0f172a"}}>{g.reservation.client_name}</div>
                <div style={{fontSize:10,color:"#94a3b8"}}>{carLabel(g.reservation.car_name,cars)}</div>
              </div>
              <div style={{fontWeight:800,fontSize:13,color:"#1e40af"}}>{fmtM(g.held,g.currency)}</div>
              <button onClick={()=>returnDeposit(rid,g)} disabled={returningId===rid} style={{...PB,background:"#7c3aed",fontSize:11,padding:"5px 9px",whiteSpace:"nowrap"}}>
                {returningId===rid?"...":"↩️ Kthe"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:mob?12:20,marginBottom:12}}>
        <h3 style={{margin:"0 0 10px",fontSize:mob?12:15,fontWeight:700,color:"#0f172a"}}>🚗 Sipas Makinës</h3>
        {carNames.map(cn=>{
          const carReses=paid.filter(r=>r.car_name===cn);
          const iL=carReses.filter(r=>r.currency==="ALL").reduce((s,r)=>s+effPaid(r),0);
          const iE=carReses.filter(r=>r.currency==="EUR").reduce((s,r)=>s+effPaid(r),0);
          const eL=exps.filter(e=>e.car_name===cn&&e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0);
          const eE=exps.filter(e=>e.car_name===cn&&e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0);
          const totalInc=iL+iE*108;
          const pct=Math.round(totalInc/maxInc*100);
          const cc=carColor(cn,carNames);
          const allR=reses.filter(r=>r.car_name===cn&&r.status!=="Anuluar");
          const totalDays=allR.reduce((s,r)=>s+diffDays(r.date_from,r.date_to),0);
          return <div key={cn} style={{marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:3,flexWrap:"wrap",gap:3}}>
              <span style={{fontSize:12,fontWeight:700,color:cc.tx}}>{carLabel(cn,cars)}</span>
              <div style={{display:"flex",gap:6,fontSize:11}}>
                {iL>0&&<span style={{color:"#1d4ed8",fontWeight:700}}>{iL.toLocaleString("sq-AL")} L</span>}
                {iE>0&&<span style={{color:"#059669",fontWeight:700}}>€{iE.toFixed(2)}</span>}
                <span style={{color:"#94a3b8"}}>{carReses.length}rez·{totalDays}d</span>
              </div>
            </div>
            <div style={{background:"#f1f5f9",borderRadius:20,height:7,overflow:"hidden"}}>
              <div style={{width:pct+"%",height:"100%",background:"linear-gradient(90deg,"+cc.ac+","+cc.bg+")",borderRadius:20}}/>
            </div>
            {(eL>0||eE>0)&&<div style={{fontSize:10,color:"#dc2626",marginTop:1}}>Shp: {eL>0?eL.toLocaleString("sq-AL")+" L":""}{eE>0?" €"+eE.toFixed(2):""}</div>}
          </div>;
        })}
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:mob?12:20,marginBottom:12}}>
        <h3 style={{margin:"0 0 10px",fontSize:mob?12:15,fontWeight:700,color:"#0f172a"}}>📈 Statistika</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[["📋","Rezervime",reses.filter(r=>r.status!=="Anuluar").length,"#1d4ed8"],["✅","Paguar",reses.filter(r=>r.payment_status==="paguar"&&r.status!=="Anuluar").length,"#16a34a"],["⏳","Pritje",reses.filter(r=>r.payment_status==="pritje"&&r.status!=="Anuluar").length,"#d97706"],["📤","Shpenz",exps.length,"#dc2626"]].map(([ic,lb,val,col])=>(
            <div key={lb} style={{background:"#f8fafc",borderRadius:8,padding:"8px 4px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:mob?16:20,fontWeight:800,color:col}}>{val}</div>
              <div style={{fontSize:mob?9:10,color:"#64748b",marginTop:1,fontWeight:500}}>{lb}</div>
            </div>
          ))}
        </div>
      </div>

      <OccupancyChart reses={reses} cars={cars} carNames={carNames}/>
    </div>
  );
}


function OccupancyChart({reses, cars, carNames}) {
  const now = new Date();
  const [selYear,  setSelYear]  = useState(now.getFullYear());
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const MONTHS_SQ = ["Janar","Shkurt","Mars","Prill","Maj","Qershor","Korrik","Gusht","Shtator","Tetor","Nëntor","Dhjetor"];

  function getDaysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }

  function getOccupiedDays(carName, y, m) {
    const mStart=y+"-"+String(m+1).padStart(2,"0")+"-01";
    const mEnd  =y+"-"+String(m+1).padStart(2,"0")+"-"+String(getDaysInMonth(y,m)).padStart(2,"0");
    let days=0;
    reses.filter(r=>r.car_name===carName&&r.status!=="Anuluar").forEach(r=>{
      const from=r.date_from>mStart?r.date_from:mStart;
      const to  =r.date_to  <mEnd  ?r.date_to  :mEnd;
      if(from<=to) days+=diffDays(from,to)+1;
    });
    return Math.min(days, getDaysInMonth(y,m));
  }

  const years=[...new Set(reses.map(r=>r.date_from?.slice(0,4)).filter(Boolean))].map(Number).sort();
  if(!years.includes(now.getFullYear())) years.push(now.getFullYear());
  const totalDays=getDaysInMonth(selYear,selMonth);

  // Donut SVG component
  function Donut({pct, color, size=80}) {
    const r=32, cx=40, cy=40;
    const circ=2*Math.PI*r;
    const dash=pct/100*circ;
    const trackColor=pct===0?"#f1f5f9":"#e2e8f0";
    return (
      <svg width={size} height={size} viewBox="0 0 80 80" style={{display:"block",margin:"0 auto"}}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={10}/>
        {pct>0&&<circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={dash+" "+(circ-dash)}
          strokeDashoffset={circ*0.25}
          strokeLinecap="round"
          style={{transition:"stroke-dasharray 0.5s ease"}}/>}
        <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle"
          fontSize={pct===100?"14":"15"} fontWeight="800"
          fill={pct===0?"#cbd5e1":color}>
          {pct===0?"—":pct+"%"}
        </text>
      </svg>
    );
  }

  function pctColor(pct){
    if(pct===0) return "#cbd5e1";
    if(pct<30)  return "#3b82f6";
    if(pct<60)  return "#f59e0b";
    if(pct<85)  return "#16a34a";
    return "#15803d";
  }

  return (
    <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden",marginBottom:16}}>
      {/* Header */}
      <div style={{background:"#0f172a",padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
        <span style={{fontWeight:700,fontSize:14,color:"#fff",flex:1}}>📊 % Rezervimit</span>
        <select value={selYear} onChange={e=>setSelYear(Number(e.target.value))}
          style={{padding:"5px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:12,fontFamily:"inherit"}}>
          {years.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
          style={{padding:"5px 8px",borderRadius:6,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.15)",color:"#fff",fontSize:12,fontFamily:"inherit"}}>
          {MONTHS_SQ.map((m,i)=><option key={i} value={i}>{m}</option>)}
        </select>
      </div>

      {/* Month label */}
      <div style={{padding:"10px 16px 6px",fontSize:12,color:"#64748b",fontWeight:600}}>
        {MONTHS_SQ[selMonth]} {selYear} · {totalDays} ditë gjithsej
      </div>

      {/* Donut grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:12,padding:"8px 16px 20px"}}>
        {carNames.map(cn=>{
          const occ=getOccupiedDays(cn,selYear,selMonth);
          const pct=Math.round(occ/totalDays*100);
          const col=pctColor(pct);
          const cc=carColor(cn,carNames);
          const carObj=cars.find(c=>c.name===cn);
          return (
            <div key={cn} style={{background:"#f8fafc",borderRadius:12,padding:"14px 10px",textAlign:"center",border:"1px solid #e2e8f0",transition:"transform 0.15s",cursor:"default"}}>
              {/* Car photo or icon */}
              {carObj?.photo_url
                ? <img src={carObj.photo_url} alt={cn} style={{width:48,height:34,objectFit:"cover",borderRadius:6,margin:"0 auto 8px",display:"block"}}/>
                : <div style={{fontSize:24,marginBottom:6}}>🚗</div>
              }
              {/* Donut */}
              <Donut pct={pct} color={col} size={80}/>
              {/* Car name */}
              <div style={{fontSize:10,fontWeight:800,color:cc.tx,marginTop:8,lineHeight:1.3}}>{carObj?.targa||cn}</div>
              {/* Days detail */}
              <div style={{fontSize:10,color:"#94a3b8",marginTop:3}}>
                {occ}/{totalDays} ditë
              </div>
              {/* Status badge */}
              <div style={{marginTop:6,display:"inline-block",padding:"2px 8px",borderRadius:20,fontSize:9,fontWeight:700,
                background:pct===0?"#f1f5f9":pct<30?"#dbeafe":pct<60?"#fef3c7":pct<85?"#dcfce7":"#16a34a",
                color:pct===0?"#94a3b8":pct<30?"#1e40af":pct<60?"#92400e":pct<85?"#166534":"#fff"}}>
                {pct===0?"E lirë":pct<30?"E ulët":pct<60?"Mesatare":pct<85?"E mirë":"Plotë"}
              </div>
            </div>
          );
        })}
      </div>

      {/* Average bar */}
      {carNames.length>0&&(()=>{
        const avg=Math.round(carNames.reduce((s,cn)=>s+Math.round(getOccupiedDays(cn,selYear,selMonth)/totalDays*100),0)/carNames.length);
        return <div style={{margin:"0 16px 16px",background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:12,fontWeight:700,color:"#374151"}}>Mesatarja e flotës</span>
            <span style={{fontSize:16,fontWeight:800,color:pctColor(avg)}}>{avg}%</span>
          </div>
          <div style={{background:"#e2e8f0",borderRadius:20,height:8,overflow:"hidden"}}>
            <div style={{width:avg+"%",height:"100%",background:"linear-gradient(90deg,"+pctColor(avg)+","+pctColor(Math.min(avg+20,100))+")",borderRadius:20,transition:"width 0.5s"}}/>
          </div>
        </div>;
      })()}
    </div>
  );
}

// ─── CASHBOX ──────────────────────────────────────────────────────────────────
// ─── CONSTANTS PER LLOGARITE ─────────────────────────────────────────────────
const ACCOUNTS = [
  { id:"cash",     label:"💵 Cash",       color:"#1d4ed8", bg:"linear-gradient(135deg,#1e3a5f,#1d4ed8)", shadow:"rgba(29,78,216,0.3)"  },
  { id:"pos",      label:"💳 POS",        color:"#7c3aed", bg:"linear-gradient(135deg,#4c1d95,#7c3aed)", shadow:"rgba(124,58,237,0.3)" },
  { id:"transfer", label:"🏦 Bankë",      color:"#059669", bg:"linear-gradient(135deg,#064e3b,#059669)", shadow:"rgba(5,150,105,0.3)"  },
];
const ACC_ID = a => a?.method||"cash";
const ACC_INFO = id => ACCOUNTS.find(a=>a.id===id)||ACCOUNTS[0];

function ArkPage({sess,reload,reloadTick,addLog}) {
  const mob=useMobile();
  const [ledger,setLedger]=useState([]);
  const [exps,setExps]=useState([]);
  const [cars,setCars]=useState([]);
  const [reses,setReses]=useState([]);
  const [loading,setLoading]=useState(true);
  // arkTab = "cash_ALL" | "cash_EUR" | "pos_ALL" | "pos_EUR" | "transfer_ALL" | "transfer_EUR"
  const [arkTab,setArkTab]=useState("cash_ALL");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [showA,setShowA]=useState(false);
  const [showT,setShowT]=useState(false);
  const [showE,setShowE]=useState(false);
  const [af,setAf]=useState({amount:"",currency:"ALL",method:"cash",description:"",type:"in",linkRes:false,resId:""});
  const [tf,setTf]=useState({from:"ALL",amount:"",rate:"108"});
  const [ef,setEf]=useState({description:"",amount:"",currency:"ALL",method:"cash",category:"Mirëmbajtje",catCustom:"",car_name:"",expense_date:todayY()});

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("cash_ledger","",sess.token),
      sbAuthGet("expenses","",sess.token),
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("reservations","status=neq.Anuluar",sess.token)
    ]).then(([l,e,c,r])=>{setLedger(l);setExps(e);setCars(c);setReses(r);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  // Balanca per cdo llogari+monedhë
  function getBalance(method,currency){
    return ledger.filter(l=>(l.method||"cash")===method&&l.currency===currency).reduce((s,l)=>s+Number(l.amount),0);
  }

  const [submitting,setSubmitting]=useState(false);
  async function doAdd(){
    if(!af.amount||submitting) return;
    setSubmitting(true);
    const a=Number(af.amount)*(af.type==="in"?1:-1);
    const selRes = af.linkRes&&af.resId ? reses.find(r=>r.id===af.resId) : null;
    const desc = selRes
      ? `Arkëtim (${ACC_INFO(af.method).label}): ${selRes.car_name} - ${selRes.client_name}`
      : af.description;
    try {
      await sbAuthPost("cash_ledger",{
        currency:af.currency, amount:a, method:af.method,
        type:af.type==="in"?"payment":"manual_out",
        description:desc,
        reference_id:selRes?.id||null,
        created_by:sess.profile?.username
      },sess.token);
      if(selRes&&af.type==="in"){
        const newPaid=Number(selRes.amount_paid||0)+Number(af.amount);
        const isFull=newPaid>=Number(selRes.total_price);
        await sbAuthPatch("reservations",selRes.id,{
          amount_paid:newPaid,
          ...(isFull?{payment_status:"paguar",paid_at:new Date().toISOString(),paid_by:sess.profile?.username}:{})
        },sess.token);
        addLog("Arkëtim ("+ACC_INFO(af.method).label+")",selRes.car_name+" - "+selRes.client_name+" "+fmtM(Number(af.amount),af.currency));
      } else {
        addLog("Arkë "+(af.type==="in"?"Hyrje":"Dalje")+" ("+ACC_INFO(af.method).label+")",fmtM(Math.abs(a),af.currency)+(af.description?" - "+af.description:""));
      }
      reload();
      setShowA(false);
      setAf({amount:"",currency:"ALL",method:"cash",description:"",type:"in",linkRes:false,resId:""});
    } catch(e){alert(e.message);}
    setSubmitting(false);
  }

  async function doTransfer(){
    const a=Number(tf.amount), rate=Number(tf.rate);
    if(!a||!rate) return;
    // Kalim ndermjet monedhave (brenda te njejtes llogari cash)
    try {
      if(tf.from==="ALL"){
        await sbAuthPost("cash_ledger",{currency:"ALL",amount:-a,method:"cash",type:"transfer",description:"Kalim → EUR (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        await sbAuthPost("cash_ledger",{currency:"EUR",amount:a/rate,method:"cash",type:"transfer",description:"Kalim ← ALL (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        addLog("Kalim Arke",a.toLocaleString()+" L → €"+(a/rate).toFixed(2));
      } else {
        await sbAuthPost("cash_ledger",{currency:"EUR",amount:-a,method:"cash",type:"transfer",description:"Kalim → ALL (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        await sbAuthPost("cash_ledger",{currency:"ALL",amount:a*rate,method:"cash",type:"transfer",description:"Kalim ← EUR (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        addLog("Kalim Arke","€"+a+" → "+(a*rate).toLocaleString()+" L");
      }
      reload(); setShowT(false); setTf({from:"ALL",amount:"",rate:"108"});
    } catch(e){alert(e.message);}
  }

  async function doAddExp(){
    if(!ef.description||!ef.amount) return;
    const a=Number(ef.amount);
    const finalCat = ef.category==="__custom__" ? ef.catCustom||"Tjetër" : ef.category;
    try {
      // Dërgojmë vetëm kolonat që ekzistojnë në tabelën expenses
      const expBody = {
        description: ef.description,
        amount: a,
        currency: ef.currency,
        category: finalCat,
        car_name: ef.car_name||null,
        expense_date: ef.expense_date||todayY(),
        created_by: sess.profile?.username||""
      };
      await sbAuthPost("expenses", expBody, sess.token);
      await sbAuthPost("cash_ledger",{currency:ef.currency,amount:-a,method:ef.method,type:"expense",description:"Shpenzim: "+ef.description+(ef.car_name?" ("+ef.car_name+")":""),created_by:sess.profile?.username},sess.token);
      addLog("Shto Shpenzim ("+ACC_INFO(ef.method).label+")",ef.description+" "+fmtM(a,ef.currency));
      reload(); setShowE(false); setEf({description:"",amount:"",currency:"ALL",method:"cash",category:"Mirëmbajtje",catCustom:"",car_name:"",expense_date:todayY()});
    } catch(e){alert(e.message);}
  }

  // Statement per tab-in aktual
  const [tabMethod,tabCur] = arkTab.split("_");
  const isL = tabCur==="ALL";
  const allTabRows = ledger.filter(l=>(l.method||"cash")===tabMethod&&l.currency===tabCur).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  const openingBal = dateFrom ? allTabRows.filter(l=>l.created_at&&l.created_at.slice(0,10)<dateFrom).reduce((s,l)=>s+Number(l.amount),0) : 0;
  const rows = allTabRows.filter(l=>{ const d=l.created_at?l.created_at.slice(0,10):""; if(dateFrom&&d<dateFrom)return false; if(dateTo&&d>dateTo)return false; return true; });
  const rowTotal = rows.reduce((s,l)=>s+Number(l.amount),0);
  const closingBal = openingBal+rowTotal;

  function getRowsWithBalance(){ let bal=openingBal; return rows.map(r=>{bal+=Number(r.amount);return{...r,runBal:bal};}); }
  function fmt2(v){ return isL?v.toLocaleString("sq-AL")+" L":"€"+Math.abs(v).toFixed(2); }

  function exportCSV(){
    const nl="\n"; const rowsBal=getRowsWithBalance();
    let csv="Data,Llogaria,Lloji,Përshkrimi,Debi,Kredi,Gjendje"+nl;
    if(dateFrom) csv+='"'+dateFrom+'","","","Gjendje Hapëse","","","'+fmt2(openingBal)+'"'+nl;
    rowsBal.forEach(r=>{
      const pos=Number(r.amount)>=0;
      const debi=pos?"":Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":"");
      const kredi=pos?Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":""):"";
      csv+='"'+(r.created_at||"").slice(0,10)+'","'+(ACC_INFO(r.method||"cash").label)+'","'+r.type+'","'+(r.description||"")+'","'+debi+'","'+kredi+'","'+fmt2(r.runBal)+'"'+nl;
    });
    csv+=nl+'"","","","Gjendje Mbyllëse","","","'+fmt2(closingBal)+'"';
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="statement_"+tabMethod+"_"+tabCur+"_"+todayY()+".csv"; a.click(); URL.revokeObjectURL(url);
  }

  function exportPDF(){
    const rowsBal=getRowsWithBalance();
    const accInfo=ACC_INFO(tabMethod);
    const closeBg=closingBal>=0?"#dcfce7":"#fee2e2"; const closeCol=closingBal>=0?"#166534":"#991b1b";
    const period=(dateFrom||dateTo)?('<p style="margin:4px 0 0;opacity:.8;font-size:13px">Periudha: '+(dateFrom||"fillimi")+" → "+(dateTo||"sot")+"</p>"):"";
    const openRow=dateFrom?('<tr style="background:#f0f9ff;border-bottom:2px solid #bfdbfe"><td colspan="4" style="padding:10px;font-size:12px;font-weight:700;color:#1e40af">Gjendje Hapëse ('+dateFrom+')</td><td style="padding:10px;font-size:13px;font-weight:800;color:#1e40af;text-align:right">'+fmt2(openingBal)+'</td></tr>'):"";
    const rowsHtml=rowsBal.map((r,i)=>{
      const pos=Number(r.amount)>=0; const bg=i%2===0?"#fff":"#f9fafb";
      const debi=pos?"":('<span style="color:#991b1b;font-weight:700">-'+Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":"€")+'</span>');
      const kredi=pos?('<span style="color:#166534;font-weight:700">+'+Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":"€")+'</span>'):"";
      return '<tr style="background:'+bg+'"><td style="padding:8px 10px;font-size:11px;color:#64748b">'+(r.created_at||"").slice(0,10)+'</td><td style="padding:8px;font-size:11px">'+r.type+'</td><td style="padding:8px;font-size:12px">'+(r.description||"")+'</td><td style="padding:8px;text-align:right">'+(pos?"":debi)+'</td><td style="padding:8px;text-align:right">'+(pos?kredi:"")+'</td><td style="padding:8px;font-weight:700;text-align:right;color:'+(r.runBal>=0?"#1e40af":"#991b1b")+'">'+fmt2(r.runBal)+'</td></tr>';
    }).join("");
    const closeRow='<tr style="background:'+closeBg+';border-top:2px solid '+(closingBal>=0?"#bbf7d0":"#fecaca")+'"><td colspan="4" style="padding:10px;font-size:13px;font-weight:800;color:'+closeCol+'">Gjendje Mbyllëse'+(dateTo?" ("+dateTo+")":"")+'</td><td colspan="2" style="padding:10px;font-size:15px;font-weight:800;color:'+closeCol+';text-align:right">'+fmt2(closingBal)+'</td></tr>';
    const html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement '+accInfo.label+'</title><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#0f172a}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#1e293b;color:#fff;padding:10px;font-size:11px;text-align:left}th:nth-child(4),th:nth-child(5),th:nth-child(6){text-align:right}@media print{body{padding:10px}}</style></head><body><div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:16px"><h2 style="margin:0;font-size:18px">🏦 Statement — '+accInfo.label+' '+tabCur+'</h2><p style="margin:4px 0 0;opacity:.7;font-size:12px">Car Rental Manager · Gjeneruar: '+nowStr()+'</p>'+period+'</div><table><thead><tr><th style="width:90px">Data</th><th style="width:100px">Lloji</th><th>Përshkrimi</th><th style="width:100px;text-align:right">Debi</th><th style="width:100px;text-align:right">Kredi</th><th style="width:110px;text-align:right">Gjendje</th></tr></thead><tbody>'+openRow+rowsHtml+closeRow+'</tbody></table></body></html>';
    const w=window.open("","_blank"); if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),500);}
  }

  if(loading) return <Spin/>;
  const carNames=cars.map(c=>c.name);

  return (
    <div style={{padding:mob?10:14,maxWidth:900,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 14px",fontSize:17,fontWeight:700,color:"#0f172a"}}>🏦 Arkë & Llogaritë</h2>

      {/* Balanca per llogari — mobile: scroll horizontal, desktop: 3 kolona */}
      {mob ? (
        <div style={{display:"flex",gap:8,overflowX:"auto",marginBottom:12,paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
          {ACCOUNTS.map(acc=>(
            <div key={acc.id} style={{flexShrink:0,width:160,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
              <div style={{background:acc.bg,padding:"7px 10px",color:"#fff"}}>
                <div style={{fontSize:11,fontWeight:800}}>{acc.label}</div>
              </div>
              {["ALL","EUR"].map(cur=>{
                const bal=getBalance(acc.id,cur);
                const tabKey=acc.id+"_"+cur;
                const isActive=arkTab===tabKey;
                return (
                  <div key={cur} onClick={()=>setArkTab(tabKey)}
                    style={{padding:"7px 10px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",background:isActive?"#f0f9ff":"#fff",borderLeft:isActive?"3px solid "+acc.color:"3px solid transparent"}}>
                    <div style={{fontSize:9,color:"#94a3b8",fontWeight:600}}>{cur==="ALL"?"LEKË":"EURO"}</div>
                    <div style={{fontSize:14,fontWeight:800,color:bal>=0?acc.color:"#dc2626",marginTop:1}}>
                      {cur==="ALL"?Math.round(bal).toLocaleString("sq-AL")+" L":"€"+bal.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:16}}>
          {ACCOUNTS.map(acc=>(
            <div key={acc.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
              <div style={{background:acc.bg,padding:"10px 14px",color:"#fff"}}>
                <div style={{fontSize:12,fontWeight:800,letterSpacing:0.5}}>{acc.label}</div>
              </div>
              {["ALL","EUR"].map(cur=>{
                const bal=getBalance(acc.id,cur);
                const tabKey=acc.id+"_"+cur;
                const isActive=arkTab===tabKey;
                return (
                  <div key={cur} onClick={()=>setArkTab(tabKey)}
                    style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid #f1f5f9",background:isActive?"#f0f9ff":"#fff",borderLeft:isActive?"3px solid "+acc.color:"3px solid transparent"}}>
                    <div style={{fontSize:10,color:"#94a3b8",fontWeight:600}}>{cur==="ALL"?"LEKË":"EURO"}</div>
                    <div style={{fontSize:17,fontWeight:800,color:bal>=0?acc.color:"#dc2626",marginTop:2}}>
                      {cur==="ALL"?bal.toLocaleString("sq-AL")+" L":"€"+bal.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* Butonat e veprimeve */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
        <button onClick={()=>{setAf(f=>({...f,type:"in"}));setShowA(true)}} style={{...PB,width:"100%",fontSize:12,padding:"8px 4px"}}>📥 Hyrje</button>
        <button onClick={()=>{setAf(f=>({...f,type:"out"}));setShowA(true)}} style={{...PB,background:"#dc2626",width:"100%",fontSize:12,padding:"8px 4px"}}>📤 Dalje</button>
        <button onClick={()=>setShowT(true)} style={{...PB,background:"#7c3aed",width:"100%",fontSize:12,padding:"8px 4px"}}>🔄 Kalim Monedhë</button>
        <button onClick={()=>setShowE(true)} style={{...PB,background:"#ea580c",width:"100%",fontSize:12,padding:"8px 4px"}}>➖ Shpenzim</button>
      </div>

      {/* Statement per tab-in aktual */}
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
        <div style={{background:ACC_INFO(tabMethod).bg,color:"#fff",padding:"10px 14px"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontWeight:700,fontSize:13,flex:1}}>📋 {ACC_INFO(tabMethod).label} — {isL?"Lekë":"Euro"}</span>
            <button onClick={exportCSV} style={{padding:"5px 10px",borderRadius:7,background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>⬇️ CSV</button>
            <button onClick={exportPDF} style={{padding:"5px 10px",borderRadius:7,background:"rgba(220,38,38,0.7)",border:"none",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>🖨️ PDF</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <DateInput value={dateFrom} onChange={setDateFrom} style={{flex:1,padding:"5px 6px",borderRadius:6,border:"1px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:11,fontFamily:"inherit",minWidth:0}}/>
            <span style={{fontSize:10,opacity:0.7,flexShrink:0}}>→</span>
            <DateInput value={dateTo} onChange={setDateTo} style={{flex:1,padding:"5px 6px",borderRadius:6,border:"1px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:11,fontFamily:"inherit",minWidth:0}}/>
            {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} style={{padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:12,cursor:"pointer"}}>✕</button>}
          </div>
        </div>
        <div style={{padding:"8px 16px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",gap:14,flexWrap:"wrap",alignItems:"center"}}>
          {dateFrom&&<div style={{fontSize:12}}><span style={{color:"#94a3b8"}}>Gjendje Hapëse: </span><span style={{fontWeight:700,color:"#1e40af"}}>{fmt2(openingBal)}</span></div>}
          <div style={{fontSize:12}}><span style={{color:"#94a3b8"}}>Veprime: </span><span style={{fontWeight:700}}>{rows.length}</span></div>
          <div style={{flex:1}}/>
          <div style={{fontSize:13,fontWeight:800,color:closingBal>=0?"#16a34a":"#dc2626"}}>Gjendje: {fmt2(closingBal)}</div>
        </div>
        {rows.length===0
          ?<div style={{padding:28,textAlign:"center",color:"#94a3b8",fontSize:13}}>Asnjë transaksion{dateFrom||dateTo?" për periudhën e zgjedhur":""}.</div>
          :<div style={{maxHeight:420,overflowY:"auto"}}>
            {dateFrom&&<div style={{padding:"10px 16px",display:"flex",gap:10,alignItems:"center",background:"#eff6ff",borderBottom:"2px solid #bfdbfe"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>📋</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#1e40af"}}>Gjendje Hapëse</div></div>
              <div style={{fontWeight:800,color:"#1e40af"}}>{fmt2(openingBal)}</div>
            </div>}
            {getRowsWithBalance().map((r,i)=>{
              const pos=Number(r.amount)>=0; const balCol=r.runBal>=0?"#1e40af":"#dc2626";
              const methodIcon=ACC_INFO(r.method||"cash").label.split(" ")[0];
              return <div key={r.id||i} style={{padding:"9px 16px",display:"flex",gap:10,alignItems:"center",borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafafa"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:pos?"#dcfce7":"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>{pos?"📥":"📤"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description||r.type}</div>
                  <div style={{fontSize:10,color:"#94a3b8"}}>{methodIcon} {r.type} · {(r.created_at||"").slice(0,10)}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:pos?"#16a34a":"#dc2626"}}>{pos?"+":"-"}{isL?Math.abs(Number(r.amount)).toLocaleString("sq-AL")+" L":"€"+Math.abs(Number(r.amount)).toFixed(2)}</div>
                  <div style={{fontSize:10,color:balCol,fontWeight:600}}>{fmt2(r.runBal)}</div>
                </div>
              </div>;
            })}
            <div style={{padding:"10px 16px",display:"flex",gap:10,alignItems:"center",background:closingBal>=0?"#f0fdf4":"#fff5f5",borderTop:"2px solid "+(closingBal>=0?"#bbf7d0":"#fecaca")}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:closingBal>=0?"#dcfce7":"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0}}>🏦</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:closingBal>=0?"#166534":"#991b1b"}}>Gjendje Mbyllëse{dateTo?" ("+dateTo+")" :""}</div></div>
              <div style={{fontWeight:800,fontSize:15,color:closingBal>=0?"#166534":"#991b1b"}}>{fmt2(closingBal)}</div>
            </div>
          </div>
        }
      </div>

      {/* Modal Hyrje/Dalje */}
      {showA&&(()=>{
        const selRes=af.linkRes&&af.resId?reses.find(r=>r.id===af.resId):null;
        const pendingReses=reses.filter(r=>r.payment_status!=="paguar"&&r.status!=="Anuluar"&&r.status!=="Përfunduar");
        const debt=selRes?Math.max(0,Number(selRes.total_price||0)-Number(selRes.amount_paid||0)):0;
        return (
        <Modal title={af.type==="in"?"📥 Hyrje":"📤 Dalje"} onClose={()=>setShowA(false)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Fld label="Llogaria *" col2>
              <div style={{display:"flex",gap:6}}>
                {ACCOUNTS.map(acc=>(
                  <button key={acc.id} onClick={()=>setAf(f=>({...f,method:acc.id}))} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"2px solid "+(af.method===acc.id?acc.color:"#e2e8f0"),background:af.method===acc.id?"#eff6ff":"#fff",fontSize:12,fontWeight:700,cursor:"pointer",color:af.method===acc.id?acc.color:"#64748b"}}>{acc.label}</button>
                ))}
              </div>
            </Fld>
            <Fld label="Shuma *"><input type="number" value={af.amount} onChange={e=>setAf(f=>({...f,amount:e.target.value}))} style={FL}/></Fld>
            <Fld label="Monedha"><select value={af.currency} onChange={e=>setAf(f=>({...f,currency:e.target.value}))} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>

            {/* Lidho me rezervim — vetem per hyrje */}
            {af.type==="in"&&(
              <div style={{gridColumn:"span 2",background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:9,padding:"10px 12px"}}>
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",marginBottom:af.linkRes?10:0}}>
                  <input type="checkbox" checked={af.linkRes} onChange={e=>setAf(f=>({...f,linkRes:e.target.checked,resId:""}))}
                    style={{width:15,height:15,cursor:"pointer"}}/>
                  <span style={{fontSize:12,fontWeight:700,color:"#0369a1"}}>🔗 Lidho me Rezervim Klienti</span>
                </label>
                {af.linkRes&&(
                  <>
                    <select value={af.resId} onChange={e=>setAf(f=>({...f,resId:e.target.value}))} style={{...FL,marginBottom:8}}>
                      <option value="">— Zgjidh Klientin / Rezervimin —</option>
                      {pendingReses
                        .sort((a,b)=>a.client_name?.localeCompare(b.client_name))
                        .map(r=>{
                          const d=Math.max(0,Number(r.total_price||0)-Number(r.amount_paid||0));
                          return <option key={r.id} value={r.id}>
                            {r.client_name} · {r.car_name} · {fmtFull(r.date_from)} · Detyrim: {fmtM(d,r.currency)}
                          </option>;
                        })
                      }
                    </select>
                    {selRes&&(
                      <div style={{background:"#fff",borderRadius:7,padding:"8px 10px",fontSize:12,border:"1px solid #bae6fd"}}>
                        <div style={{fontWeight:700,color:"#0f172a",marginBottom:3}}>{selRes.client_name} · {selRes.car_name}</div>
                        <div style={{display:"flex",gap:14,flexWrap:"wrap",color:"#64748b"}}>
                          <span>📅 {fmtFull(selRes.date_from)} → {fmtFull(selRes.date_to)}</span>
                          <span>💶 Total: {fmtM(selRes.total_price,selRes.currency)}</span>
                          {Number(selRes.amount_paid||0)>0&&<span style={{color:"#16a34a"}}>✅ Paguar: {fmtM(selRes.amount_paid,selRes.currency)}</span>}
                          <span style={{color:"#dc2626",fontWeight:700}}>⏳ Detyrim: {fmtM(debt,selRes.currency)}</span>
                        </div>
                        {af.amount&&Number(af.amount)>0&&(
                          <div style={{marginTop:6,fontWeight:700,color:Number(af.amount)>=debt?"#16a34a":"#f59e0b",fontSize:12}}>
                            {Number(af.amount)>=debt
                              ?"✅ Do paguhet plotësisht!"
                              :"⏳ Mbetet: "+fmtM(debt-Number(af.amount),selRes.currency)}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!af.linkRes&&(
              <Fld label="Përshkrimi" col2>
                <input value={af.description} onChange={e=>setAf(f=>({...f,description:e.target.value}))} style={FL} placeholder="Arsyeja..."/>
              </Fld>
            )}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
            <button onClick={()=>setShowA(false)} style={CB}>Anulo</button>
            <button onClick={doAdd} disabled={af.linkRes&&!af.resId||submitting} style={{...PB,opacity:af.linkRes&&!af.resId||submitting?0.5:1}}>{submitting?"⏳ Duke ruajtur...":"✅ Konfirmo"}</button>
          </div>
        </Modal>
        );
      })()}

      {/* Modal Kalim Monedhë */}
      {showT&&<Modal title="🔄 Kalim Ndërmjet Monedhave (Cash)" onClose={()=>setShowT(false)}>
        <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:7,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#92400e"}}>ℹ️ Kalimi bëhet brenda llogarisë Cash.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Drejtimi" col2><select value={tf.from} onChange={e=>setTf(f=>({...f,from:e.target.value}))} style={FL}><option value="ALL">Lekë → Euro</option><option value="EUR">Euro → Lekë</option></select></Fld>
          <Fld label={tf.from==="ALL"?"Shuma (L)":"Shuma (€)"}><input type="number" value={tf.amount} onChange={e=>setTf(f=>({...f,amount:e.target.value}))} style={FL}/></Fld>
          <Fld label="1 EUR = ? L"><input type="number" value={tf.rate} onChange={e=>setTf(f=>({...f,rate:e.target.value}))} style={FL}/></Fld>
        </div>
        {tf.amount&&tf.rate&&<div style={{background:"#eff6ff",borderRadius:7,padding:"9px 13px",marginTop:10,fontSize:13,color:"#1e40af",fontWeight:600}}>
          {tf.from==="ALL"?Number(tf.amount).toLocaleString()+" L → €"+(Number(tf.amount)/Number(tf.rate)).toFixed(2):"€"+tf.amount+" → "+(Number(tf.amount)*Number(tf.rate)).toLocaleString()+" L"}
        </div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>setShowT(false)} style={CB}>Anulo</button>
          <button onClick={doTransfer} style={{...PB,background:"#7c3aed"}}>🔄 Kryej</button>
        </div>
      </Modal>}

      {/* Modal Shpenzim */}
      {showE&&<Modal title="➖ Shpenzim i Ri" onClose={()=>setShowE(false)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Llogaria (del nga) *" col2>
            <div style={{display:"flex",gap:6}}>
              {ACCOUNTS.map(acc=>(
                <button key={acc.id} onClick={()=>setEf(f=>({...f,method:acc.id}))} style={{flex:1,padding:"8px 4px",borderRadius:8,border:"2px solid "+(ef.method===acc.id?acc.color:"#e2e8f0"),background:ef.method===acc.id?"#eff6ff":"#fff",fontSize:12,fontWeight:700,cursor:"pointer",color:ef.method===acc.id?acc.color:"#64748b"}}>{acc.label}</button>
              ))}
            </div>
          </Fld>
          <Fld label="Përshkrimi *" col2><input value={ef.description} onChange={e=>setEf(f=>({...f,description:e.target.value}))} style={FL} placeholder="p.sh. Ndërrimi gomave"/></Fld>
          <Fld label="Shuma *"><input type="number" value={ef.amount} onChange={e=>setEf(f=>({...f,amount:e.target.value}))} style={FL}/></Fld>
          <Fld label="Monedha"><select value={ef.currency} onChange={e=>setEf(f=>({...f,currency:e.target.value}))} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>
          <Fld label="Kategoria" col2>
            <select value={ef.category} onChange={e=>setEf(f=>({...f,category:e.target.value,catCustom:""}))} style={FL}>
              {CATS.map(c=><option key={c}>{c}</option>)}
              <option value="__custom__">+ Kategori e Re...</option>
            </select>
            {ef.category==="__custom__"&&<input value={ef.catCustom} onChange={e=>setEf(f=>({...f,catCustom:e.target.value}))} placeholder="Shkruaj kategorinë..." style={{...FL,marginTop:6}}/>}
          </Fld>
          <Fld label="Makina"><CarPicker cars={cars} value={ef.car_name} onChange={car=>setEf(f=>({...f,car_name:car.name}))} placeholder="🔍 Kërko targën (ose lëre bosh)"/></Fld>
          <Fld label="Data"><DateInput value={ef.expense_date} onChange={v=>setEf(f=>({...f,expense_date:v}))}/></Fld>
        </div>
        <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:7,padding:"8px 12px",marginTop:8,fontSize:12,color:"#92400e"}}>⚠️ Shuma zbritet nga llogaria e zgjedhur.</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>setShowE(false)} style={CB}>Anulo</button>
          <button onClick={doAddExp} style={{...PB,background:"#ea580c"}}>💾 Ruaj</button>
        </div>
      </Modal>}
    </div>
  );
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────
function CliPage({sess,reload,reloadTick,addLog}) {
  const mob=useMobile();
  const [clients,setClients]=useState([]);
  const [reses,setReses]=useState([]);
  const [loading,setLoading]=useState(true);
  const [srch,setSrch]=useState("");
  const [showF,setShowF]=useState(false);
  const [editId,setEditId]=useState(null);
  const [form,setForm]=useState({name:"",phone:"",email:"",id_card:"",address:"",notes:""});

  useEffect(()=>{
    setLoading(true);
    Promise.all([sbAuthGet("clients","order=name.asc",sess.token),sbAuthGet("reservations","",sess.token)])
      .then(([c,r])=>{setClients(c);setReses(r);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  async function doSave(){
    if(!form.name) return;
    try {
      if(editId){ await sbAuthPatch("clients",editId,form,sess.token); addLog("Ndrysho Klient",form.name); }
      else { await sbAuthPost("clients",{...form,created_by:sess.profile?.id},sess.token); addLog("Shto Klient",form.name); }
      reload(); setShowF(false); setEditId(null);
    } catch(e){alert(e.message);}
  }
  async function doDel(id){
    const cl=clients.find(x=>x.id===id);
    try { await sbAuthDelete("clients",id,sess.token); addLog("Fshi Klient",cl?.name||""); reload(); } catch(e){alert(e.message);}
  }

  const [onlyDebt,setOnlyDebt]=useState(false);
  const filtered=clients.filter(c=>!srch||c.name.toLowerCase().includes(srch.toLowerCase())||c.phone?.includes(srch)||c.id_card?.includes(srch));
  if(loading) return <Spin/>;

  function clientStats(cl){
    const clReses=reses.filter(r=>r.client_name===cl.name&&r.status!=="Anuluar");
    const fatL=clReses.filter(r=>r.currency==="ALL").reduce((s,r)=>s+Number(r.total_price||0),0);
    const fatE=clReses.filter(r=>r.currency==="EUR").reduce((s,r)=>s+Number(r.total_price||0),0);
    const payL=clReses.filter(r=>r.currency==="ALL").reduce((s,r)=>s+effPaid(r),0);
    const payE=clReses.filter(r=>r.currency==="EUR").reduce((s,r)=>s+effPaid(r),0);
    return {count:clReses.length,fatL,fatE,payL,payE,detL:fatL-payL,detE:fatE-payE};
  }
  const filteredFinal=onlyDebt?filtered.filter(cl=>{const s=clientStats(cl);return s.detL>0||s.detE>0;}):filtered;

  return (
    <div style={{padding:mob?10:14,maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>👥 Klientët</h2>
        <label style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#dc2626",fontWeight:600,cursor:"pointer"}}>
          <input type="checkbox" checked={onlyDebt} onChange={e=>setOnlyDebt(e.target.checked)}/> Vetëm me detyrime
        </label>
        <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Kërko..." style={{padding:"7px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,width:180,fontFamily:"inherit"}}/>
        <button onClick={()=>{setForm({name:"",phone:"",email:"",id_card:"",address:"",notes:""});setEditId(null);setShowF(true)}} style={PB}>+ Klient i Ri</button>
      </div>
      {filteredFinal.length===0
        ? <div style={{textAlign:"center",color:"#94a3b8",padding:48,background:"#fff",borderRadius:12,border:"1px solid #e2e8f0"}}>Asnjë klient.</div>
        : filteredFinal.map(cl=>{
          const st=clientStats(cl);
          return <div key={cl.id} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:"14px 16px",marginBottom:8,boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{width:42,height:42,borderRadius:"50%",background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:17,flexShrink:0}}>{cl.name.charAt(0).toUpperCase()}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,color:"#0f172a"}}>{cl.name}</div>
                <div style={{fontSize:12,color:"#64748b",marginTop:2}}>
                  {cl.phone&&<span>📞 {cl.phone}  </span>}
                  {cl.id_card&&<span>🪪 {cl.id_card}  </span>}
                  {cl.email&&<span>✉️ {cl.email}</span>}
                </div>
                {cl.address&&<div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>📍 {cl.address}</div>}
                <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#dbeafe",color:"#1e40af",fontWeight:700}}>{st.count} rezervime</span>
                </div>
                {(st.fatL>0||st.fatE>0)&&(
                  <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap",background:"#f8fafc",borderRadius:8,padding:"7px 10px"}}>
                    {st.fatL>0&&<MiniStat lb="LEKË" fat={st.fatL} pag={st.payL} det={st.detL} isL/>}
                    {st.fatE>0&&<MiniStat lb="EURO" fat={st.fatE} pag={st.payE} det={st.detE}/>}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>{setForm({name:cl.name,phone:cl.phone||"",email:cl.email||"",id_card:cl.id_card||"",address:cl.address||"",notes:cl.notes||""});setEditId(cl.id);setShowF(true)}} style={IB}>✏️</button>
                <button onClick={()=>doDel(cl.id)} style={{...IB,color:"#dc2626"}}>🗑️</button>
              </div>
            </div>
            {cl.notes&&<div style={{marginTop:8,padding:"7px 10px",background:"#f8fafc",borderRadius:7,fontSize:12,color:"#64748b"}}>💬 {cl.notes}</div>}
          </div>;
        })
      }
      {showF&&<Modal title={editId?"Ndrysho Klient":"Klient i Ri"} onClose={()=>{setShowF(false);setEditId(null);}}>
        <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
          <Fld label="Emri *" col2><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} style={FL} placeholder="Emri Mbiemri"/></Fld>
          <Fld label="Telefoni"><input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={FL} placeholder="+355 6X XXX XXXX"/></Fld>
          <Fld label="Email"><input value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={FL} placeholder="email@..."/></Fld>
          <Fld label="Nr. ID / Pasaportë"><input value={form.id_card} onChange={e=>setForm(f=>({...f,id_card:e.target.value}))} style={FL} placeholder="A12345678"/></Fld>
          <Fld label="Adresa" col2><input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} style={FL} placeholder="Rruga, Qyteti"/></Fld>
          <Fld label="Shënime" col2><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...FL,height:60,resize:"vertical"}} placeholder="Çdo info shtesë..."/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>{setShowF(false);setEditId(null);}} style={CB}>Anulo</button>
          <button onClick={doSave} style={PB}>💾 Ruaj</button>
        </div>
      </Modal>}
    </div>
  );
}

function MiniStat({lb,fat,pag,det,isL}){
  const fmt=v=>isL?Number(v).toLocaleString("sq-AL")+" L":"€"+Number(v).toFixed(2);
  return (
    <div style={{fontSize:11,lineHeight:1.5}}>
      <div style={{fontWeight:700,color:"#64748b",marginBottom:2}}>{lb}</div>
      <div style={{color:"#1d4ed8"}}>Faturuar: <strong>{fmt(fat)}</strong></div>
      <div style={{color:"#16a34a"}}>Paguar: <strong>{fmt(pag)}</strong></div>
      {det>0.01&&<div style={{color:"#dc2626"}}>Detyrim: <strong>{fmt(det)}</strong></div>}
    </div>
  );
}

function CarPicker({cars,value,onChange,placeholder}) {
  const [q,setQ]=useState("");
  const [open,setOpen]=useState(false);
  const wrapRef=useRef(null);
  useEffect(()=>{
    function onDoc(e){ if(wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown",onDoc);
    return ()=>document.removeEventListener("mousedown",onDoc);
  },[]);
  const selCar=cars.find(c=>c.name===value);
  const label=selCar?(selCar.targa?selCar.targa+(selCar.model?" · "+selCar.model:""):selCar.name):"";
  const selectableCars=cars.filter(c=>c.active!==false);
  const filtered=selectableCars.filter(c=>{
    const s=(c.targa||"")+" "+(c.model||c.name||"");
    return !q||s.toLowerCase().includes(q.toLowerCase());
  });
  return (
    <div ref={wrapRef} style={{position:"relative"}}>
      <input
        value={open?q:label}
        onFocus={()=>{setOpen(true);setQ("");}}
        onChange={e=>setQ(e.target.value)}
        placeholder={placeholder||"🔍 Kërko targën..."}
        style={FL}
      />
      {open&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,marginTop:4,maxHeight:220,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.14)"}}>
          {filtered.length===0&&<div style={{padding:"10px 12px",fontSize:12,color:"#94a3b8"}}>Nuk u gjet asnjë makinë</div>}
          {filtered.map(c=>(
            <div key={c.id} onMouseDown={e=>e.preventDefault()} onClick={()=>{onChange(c);setOpen(false);setQ("");}}
              style={{padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f1f5f9",background:c.name===value?"#eff6ff":"#fff"}}>
              <strong>{c.targa||"— pa targë —"}</strong>
              <span style={{color:"#64748b"}}>{c.model?" · "+c.model:(!c.targa&&c.name)?" · "+c.name:""}</span>
              {c.active===false&&<span style={{marginLeft:6,fontSize:10,fontWeight:700,color:"#94a3b8"}}>(Pasive)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function exportToExcel(rows,filename,sheetName){
  if(!rows||!rows.length){ alert("Nuk ka të dhëna për të exportuar."); return; }
  const ws=XLSX.utils.json_to_sheet(rows);
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,sheetName||"Raport");
  XLSX.writeFile(wb,filename);
}

// ─── RAPORT PAGE ─────────────────────────────────────────────────────────────
function CarMultiPicker({cars,selected,onChange}){
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const wrapRef=useRef(null);
  useEffect(()=>{
    function onDoc(e){ if(wrapRef.current&&!wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown",onDoc);
    return ()=>document.removeEventListener("mousedown",onDoc);
  },[]);
  const filtered=cars.filter(c=>{
    const s=(c.targa||"")+" "+(c.model||c.name||"");
    return !q||s.toLowerCase().includes(q.toLowerCase());
  });
  function toggle(name){
    onChange(selected.includes(name)?selected.filter(n=>n!==name):[...selected,name]);
  }
  return (
    <div ref={wrapRef} style={{position:"relative"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{...FL,cursor:"pointer",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",minHeight:20}}>
        {selected.length===0
          ? <span style={{color:"#94a3b8"}}>🚗 Të gjitha makinat</span>
          : selected.map(n=>{
              const c=cars.find(x=>x.name===n);
              return <span key={n} onClick={e=>{e.stopPropagation();toggle(n);}} style={{background:"#dbeafe",color:"#1e40af",fontSize:11,fontWeight:700,padding:"2px 7px",borderRadius:12,cursor:"pointer"}}>{c?.targa||n} ✕</span>;
            })
        }
      </div>
      {open&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:50,background:"#fff",border:"1px solid #e2e8f0",borderRadius:8,marginTop:4,maxHeight:260,overflowY:"auto",boxShadow:"0 4px 16px rgba(0,0,0,0.14)"}}>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 Kërko targën..." style={{...FL,border:"none",borderBottom:"1px solid #e2e8f0",borderRadius:0}}/>
          {selected.length>0&&<div onClick={()=>onChange([])} style={{padding:"7px 12px",fontSize:12,color:"#dc2626",cursor:"pointer",fontWeight:600,borderBottom:"1px solid #f1f5f9"}}>✕ Pastro të gjitha</div>}
          {filtered.map(c=>(
            <div key={c.id} onClick={()=>toggle(c.name)} style={{padding:"8px 12px",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:8,background:selected.includes(c.name)?"#eff6ff":"#fff"}}>
              <input type="checkbox" checked={selected.includes(c.name)} onChange={()=>{}}/>
              <strong>{c.targa||"—"}</strong><span style={{color:"#64748b"}}>{c.model?" · "+c.model:""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RptPage({sess,reloadTick}) {
  const [reses,setReses]=useState([]);
  const [exps,setExps]=useState([]);
  const [ledger,setLedger]=useState([]);
  const [cars,setCars]=useState([]);
  const [clients,setClients]=useState([]);
  const [srvs,setSrvs]=useState([]);
  const [carSettings,setCarSettings]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("cars");
  const [view,setView]=useState("summary");
  const [selCars,setSelCars]=useState([]);
  const [selDocTypes,setSelDocTypes]=useState([]);
  const [selClient,setSelClient]=useState("");
  const [dFrom,setDFrom]=useState("");
  const [dTo,setDTo]=useState("");
  const [shown,setShown]=useState(false);
  const [filtersOpen,setFiltersOpen]=useState("cars");

  function chTab(id){
    if(tab===id){
      setFiltersOpen(o=>o===id?null:id);
    } else {
      setTab(id);
      setFiltersOpen(id);
      setShown(false);
    }
  }
  function chView(v){ setView(v); setShown(false); }
  function chCars(v){ setSelCars(v); setShown(false); }
  function chDocType(t){ setSelDocTypes(s=>s.includes(t)?s.filter(x=>x!==t):[...s,t]); setShown(false); }
  function chClient(v){ setSelClient(v); setShown(false); }
  function chFrom(v){ setDFrom(v); setShown(false); }
  function chTo(v){ setDTo(v); setShown(false); }

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("reservations","",sess.token),
      sbAuthGet("expenses","",sess.token),
      sbAuthGet("cash_ledger","",sess.token),
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("clients","",sess.token),
      sbAuthGet("car_services","",sess.token),
      sbAuthGet("car_settings","",sess.token)
    ]).then(([r,e,l,cr,cl,sv,cset])=>{setReses(r);setExps(e);setLedger(l);setCars(cr);setClients(cl);setSrvs(sv);setCarSettings(cset);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  if(loading) return <Spin/>;

  function inRange(d){ if(!d) return true; return (!dFrom||d>=dFrom)&&(!dTo||d<=dTo); }
  const carSet = selCars.length ? new Set(selCars) : null;
  const resIdToCar={}; reses.forEach(r=>{resIdToCar[r.id]=r.car_name;});

  const fReses=reses.filter(r=>r.status!=="Anuluar"&&(!carSet||carSet.has(r.car_name))&&inRange(r.date_from));
  const fExps=exps.filter(e=>(!carSet||carSet.has(e.car_name))&&inRange(e.date||e.expense_date));
  const fLedger=ledger.filter(l=>{
    const d=(l.created_at||"").slice(0,10);
    if(!inRange(d)) return false;
    if(!carSet) return true;
    const cn=resIdToCar[l.reference_id];
    return cn&&carSet.has(cn);
  });
  const fSrvs=srvs.filter(s=>!carSet||carSet.has(s.car_name));
  const fCarSettings=carSettings.filter(cs=>!carSet||carSet.has(cs.car_name));

  const REPORT_TABS=[["cars","🚗 Makina & Rezervime"],["pl","📊 Pasqyra e të Ardhurave"],["finance","💰 Lëvizjet e Arkës"],["cli","👥 Klientët"],["docs","⏰ Skadimet"],["deposits","🔒 Depozitat"]];

  return (
    <div style={{padding:14,display:"flex",gap:16,alignItems:"flex-start"}}>
      {/* SIDEBAR - filtrat hapen direkt poshte tab-it aktiv */}
      <div style={{width:250,flexShrink:0,background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden",position:"sticky",top:14}}>
        {REPORT_TABS.map(([id,lb])=>(
          <div key={id}>
            <div onClick={()=>chTab(id)} style={{
              padding:"12px 14px",fontSize:13,fontWeight:700,cursor:"pointer",
              background:tab===id?"#eff6ff":"#fff",color:tab===id?"#1d4ed8":"#374151",
              borderLeft:tab===id?"3px solid #1d4ed8":"3px solid transparent",
              borderBottom:"1px solid #f1f5f9",
              display:"flex",alignItems:"center",justifyContent:"space-between",gap:6
            }}>
              <span>{lb}</span>
              <span style={{fontSize:10,color:"#94a3b8"}}>{filtersOpen===id?"▾":"▸"}</span>
            </div>

            {filtersOpen===id&&(
              <div style={{padding:"12px 14px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",flexDirection:"column",gap:10}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:3}}>Nga data</label>
                  <DateInput value={dFrom} onChange={chFrom}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:3}}>Deri</label>
                  <DateInput value={dTo} onChange={chTo}/>
                </div>
                {tab==="cli"&&(
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:3}}>Klienti (bosh = të gjithë)</label>
                    <select value={selClient} onChange={e=>chClient(e.target.value)} style={FL}>
                      <option value="">👥 Të gjithë klientët</option>
                      {clients.map(c=><option key={c.id} value={c.name}>{c.name}{c.phone?" · "+c.phone:""}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:3}}>Makinat (bosh = të gjitha)</label>
                  <CarMultiPicker cars={cars} selected={selCars} onChange={chCars}/>
                </div>
                {tab==="docs"&&(
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:"#64748b",display:"block",marginBottom:5}}>Lloji i shërbimit</label>
                    <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                      {[["sigurim","🛡️ Sigurim"],["kasko","🚙 Kasko"],["kolaudim","🔍 Kolaudim"],["taksa","💼 Taksa"],["vaj_filtra","🛢️ Vaj/Filtra"]].map(([t,lb2])=>(
                        <button key={t} onClick={()=>chDocType(t)} style={{
                          border:"1px solid "+(selDocTypes.includes(t)?"#1d4ed8":"#e2e8f0"),borderRadius:20,padding:"5px 10px",
                          fontSize:11,fontWeight:700,cursor:"pointer",
                          background:selDocTypes.includes(t)?"#eff6ff":"#fff",color:selDocTypes.includes(t)?"#1d4ed8":"#64748b"
                        }}>{lb2}</button>
                      ))}
                    </div>
                    {selDocTypes.length>0&&<button onClick={()=>{setSelDocTypes([]);setShown(false);}} style={{border:"none",background:"none",color:"#dc2626",fontSize:11,fontWeight:600,cursor:"pointer",marginTop:5,padding:0}}>✕ Pastro llojet</button>}
                  </div>
                )}
                <button onClick={()=>setShown(true)} style={{...PB,fontSize:13,padding:"9px 0",width:"100%"}}>🔍 Shfaq Raportin</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
          <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a"}}>📈 Raportet</h2>
          <div style={{flex:1}}/>
          {tab!=="docs"&&tab!=="deposits"&&(
            <div style={{display:"flex",background:"#f1f5f9",borderRadius:9,padding:3}}>
              {[["summary","📊 Përmbledhje"],["detail","📋 Analitikë"]].map(([v,l])=>(
                <button key={v} onClick={()=>chView(v)} style={{
                  border:"none",borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer",
                  background:view===v?"#1d4ed8":"transparent",color:view===v?"#fff":"#64748b"
                }}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {!shown
          ? <div style={{textAlign:"center",color:"#94a3b8",padding:60,background:"#fff",borderRadius:12,border:"1px dashed #cbd5e1"}}>Zgjidh filtrat anash dhe kliko <strong>"🔍 Shfaq Raportin"</strong> për ta parë.</div>
          : <>
              {tab==="cars"&&<CarsReport cars={cars} reses={fReses} exps={fExps} view={view}/>}
              {tab==="pl"&&<PLReport reses={fReses} exps={fExps} ledger={fLedger} dFrom={dFrom} dTo={dTo}/>}
              {tab==="finance"&&<FinanceReport cars={cars} ledger={fLedger} reses={reses} view={view}/>}
              {tab==="cli"&&<ClientsReport clients={clients} reses={fReses} selClient={selClient} view={view}/>}
              {tab==="docs"&&<DocsReport cars={cars} services={fSrvs} carSettings={fCarSettings} reses={reses} selTypes={selDocTypes}/>}
              {tab==="deposits"&&<DepositsReport cars={cars} ledger={fLedger} reses={reses}/>}
            </>
        }
      </div>
    </div>
  );
}

// ─── PASQYRA E TË ARDHURAVE DHE SHPENZIMEVE ──────────────────────────────────
function PLReport({reses,exps,ledger,dFrom,dTo}){
  // Të ardhura sipas metodës pagese (nga cash_ledger)
  const payments=ledger.filter(l=>l.type==="payment"||l.type==="manual_in"||l.type==="prepayment");
  function sumLedger(method,cur){ return payments.filter(l=>(l.method||"cash")===method&&l.currency===cur).reduce((s,l)=>s+Number(l.amount),0); }

  const incomeRows=[
    {label:"Të Ardhura Cash",    icon:"💵", l:sumLedger("cash","ALL"),    e:sumLedger("cash","EUR")},
    {label:"Të Ardhura POS",     icon:"💳", l:sumLedger("pos","ALL"),     e:sumLedger("pos","EUR")},
    {label:"Të Ardhura Bankare", icon:"🏦", l:sumLedger("transfer","ALL"),e:sumLedger("transfer","EUR")},
  ].filter(r=>r.l>0||r.e>0);

  const totalIncL=incomeRows.reduce((s,r)=>s+r.l,0);
  const totalIncE=incomeRows.reduce((s,r)=>s+r.e,0);

  // Shpenzime sipas kategorisë
  const cats=[...new Set(exps.map(e=>e.category||"Tjetër"))].sort();
  const expByCat=cats.map(cat=>{
    const rows=exps.filter(e=>(e.category||"Tjetër")===cat);
    return {
      cat,
      l:rows.filter(e=>e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0),
      e:rows.filter(e=>e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0),
    };
  }).filter(r=>r.l>0||r.e>0);

  const totalExpL=expByCat.reduce((s,r)=>s+r.l,0);
  const totalExpE=expByCat.reduce((s,r)=>s+r.e,0);

  const profitL=totalIncL-totalExpL;
  const profitE=totalIncE-totalExpE;

  // Rezervime ne pritje (te pa-arketuara)
  const pendingL=reses.filter(r=>r.payment_status!=="paguar"&&r.currency==="ALL").reduce((s,r)=>s+Number(r.total_price||0)-Number(r.amount_paid||0),0);
  const pendingE=reses.filter(r=>r.payment_status!=="paguar"&&r.currency==="EUR").reduce((s,r)=>s+Number(r.total_price||0)-Number(r.amount_paid||0),0);

  function fL(v){ return v.toLocaleString("sq-AL")+" L"; }
  function fE(v){ return "€"+Math.abs(v).toFixed(2); }
  function fmtBoth(l,e){ return [l>0?fL(l):"",e>0?fE(e):""].filter(Boolean).join(" / ")||"—"; }

  function exportPDF(){
    const period=(dFrom||dTo)?("Periudha: "+(dFrom||"fillimi")+" → "+(dTo||"sot")):"Të gjitha periudhat";
    const incRows=incomeRows.map((r,i)=>`<tr style="background:${i%2===0?"#fff":"#f9fafb"}"><td style="padding:9px 12px;font-size:13px">${r.icon} ${r.label}</td><td style="padding:9px 12px;font-size:13px;text-align:right;color:#166534;font-weight:600">${r.l>0?fL(r.l):""}</td><td style="padding:9px 12px;font-size:13px;text-align:right;color:#166534;font-weight:600">${r.e>0?fE(r.e):""}</td></tr>`).join("");
    const expRows=expByCat.map((r,i)=>`<tr style="background:${i%2===0?"#fff":"#f9fafb"}"><td style="padding:9px 12px;font-size:13px;padding-left:24px">• ${r.cat}</td><td style="padding:9px 12px;font-size:13px;text-align:right;color:#991b1b">${r.l>0?"("+fL(r.l)+")":""}</td><td style="padding:9px 12px;font-size:13px;text-align:right;color:#991b1b">${r.e>0?"("+fE(r.e)+")":""}</td></tr>`).join("");
    const pColor=l=>l>=0?"#166534":"#991b1b";
    const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pasqyra e të Ardhurave</title><style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#0f172a}table{width:100%;border-collapse:collapse}th{background:#1e293b;color:#fff;padding:10px 12px;text-align:left;font-size:11px}th:nth-child(2),th:nth-child(3){text-align:right}@media print{body{padding:10px}}</style></head><body>
    <div style="background:#0f172a;color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:16px"><h2 style="margin:0;font-size:18px">📊 Pasqyra e të Ardhurave dhe Shpenzimeve</h2><p style="margin:4px 0 0;opacity:.7;font-size:12px">${period} · Gjeneruar: ${nowStr()}</p></div>
    <table><thead><tr><th>Zëri</th><th style="text-align:right;width:140px">LEKË</th><th style="text-align:right;width:120px">EURO</th></tr></thead><tbody>
    <tr style="background:#f0fdf4"><td colspan="3" style="padding:8px 12px;font-size:11px;font-weight:800;color:#166534;letter-spacing:1px">TË ARDHURAT</td></tr>
    ${incRows}
    <tr style="background:#dcfce7;border-top:2px solid #16a34a"><td style="padding:10px 12px;font-weight:800;font-size:14px">TOTALI TË ARDHURAT</td><td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;color:#166534">${fL(totalIncL)}</td><td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;color:#166534">${fE(totalIncE)}</td></tr>
    <tr><td colspan="3" style="padding:4px"></td></tr>
    <tr style="background:#fef2f2"><td colspan="3" style="padding:8px 12px;font-size:11px;font-weight:800;color:#991b1b;letter-spacing:1px">SHPENZIMET</td></tr>
    ${expRows}
    <tr style="background:#fee2e2;border-top:2px solid #dc2626"><td style="padding:10px 12px;font-weight:800;font-size:14px">TOTALI SHPENZIMET</td><td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;color:#991b1b">(${fL(totalExpL)})</td><td style="padding:10px 12px;text-align:right;font-weight:800;font-size:14px;color:#991b1b">(${fE(totalExpE)})</td></tr>
    <tr><td colspan="3" style="padding:4px"></td></tr>
    <tr style="background:${profitL>=0?"#f0fdf4":"#fef2f2"};border-top:3px solid ${profitL>=0?"#16a34a":"#dc2626"}"><td style="padding:12px;font-weight:900;font-size:16px">FITIMI / HUMBJA NETO</td><td style="padding:12px;text-align:right;font-weight:900;font-size:16px;color:${pColor(profitL)}">${profitL>=0?"":"-"}${fL(Math.abs(profitL))}</td><td style="padding:12px;text-align:right;font-weight:900;font-size:16px;color:${pColor(profitE)}">${profitE>=0?"":"-"}${fE(Math.abs(profitE))}</td></tr>
    </tbody></table></body></html>`;
    const w=window.open("","_blank"); if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),500);}
  }

  function exportExcel(){
    const rows=[
      {Zëri:"TË ARDHURAT","LEKË":"","EURO":""},
      ...incomeRows.map(r=>({Zëri:r.icon+" "+r.label,"LEKË":r.l||0,"EURO":r.e||0})),
      {Zëri:"TOTALI TË ARDHURAT","LEKË":totalIncL,"EURO":totalIncE},
      {Zëri:"","LEKË":"","EURO":""},
      {Zëri:"SHPENZIMET","LEKË":"","EURO":""},
      ...expByCat.map(r=>({Zëri:"  "+r.cat,"LEKË":r.l?-r.l:0,"EURO":r.e?-r.e:0})),
      {Zëri:"TOTALI SHPENZIMET","LEKË":-totalExpL,"EURO":-totalExpE},
      {Zëri:"","LEKË":"","EURO":""},
      {Zëri:"FITIMI / HUMBJA NETO","LEKË":profitL,"EURO":profitE},
    ];
    exportToExcel(rows,"Pasqyra_Ardhurave.xlsx","P&L");
  }

  const SectionHeader=({label,color,bg})=>(
    <div style={{background:bg,borderRadius:8,padding:"8px 14px",marginBottom:8}}>
      <span style={{fontSize:11,fontWeight:800,color,letterSpacing:1}}>{label}</span>
    </div>
  );

  const Row=({label,l,e,bold,color,indent})=>(
    <div style={{display:"flex",alignItems:"center",padding:"8px 14px",borderBottom:"1px solid #f1f5f9",background:"#fff"}}>
      <div style={{flex:1,fontSize:13,fontWeight:bold?700:400,color:color||"#374151",paddingLeft:indent?12:0}}>{label}</div>
      <div style={{width:150,textAlign:"right",fontSize:13,fontWeight:bold?700:400,color:color||(l>=0?"#166534":"#991b1b")}}>{l!==0?fL(Math.abs(l)):""}</div>
      <div style={{width:120,textAlign:"right",fontSize:13,fontWeight:bold?700:400,color:color||(e>=0?"#166534":"#991b1b")}}>{e!==0?fE(Math.abs(e)):""}</div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:8}}>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:"#0f172a"}}>📊 Pasqyra e të Ardhurave dhe Shpenzimeve</div>
          {(dFrom||dTo)&&<div style={{fontSize:12,color:"#64748b",marginTop:2}}>{dFrom||"—"} → {dTo||"sot"}</div>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={exportExcel} style={{...PB,background:"#059669",fontSize:12,padding:"7px 14px"}}>📥 Excel</button>
          <button onClick={exportPDF} style={{...PB,background:"#dc2626",fontSize:12,padding:"7px 14px"}}>🖨️ PDF</button>
        </div>
      </div>

      {/* Karta permbledhese */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10,marginBottom:20}}>
        {[
          {label:"Të Ardhura (L)",val:fL(totalIncL),color:"#166534",bg:"#f0fdf4",border:"#bbf7d0"},
          {label:"Të Ardhura (€)",val:fE(totalIncE),color:"#166534",bg:"#f0fdf4",border:"#bbf7d0"},
          {label:"Shpenzime (L)",val:fL(totalExpL),color:"#991b1b",bg:"#fef2f2",border:"#fecaca"},
          {label:"Shpenzime (€)",val:fE(totalExpE),color:"#991b1b",bg:"#fef2f2",border:"#fecaca"},
          {label:"Fitim Neto (L)",val:(profitL>=0?"":"-")+fL(Math.abs(profitL)),color:profitL>=0?"#1d4ed8":"#dc2626",bg:profitL>=0?"#eff6ff":"#fef2f2",border:profitL>=0?"#bfdbfe":"#fecaca"},
          {label:"Fitim Neto (€)",val:(profitE>=0?"":"-")+fE(Math.abs(profitE)),color:profitE>=0?"#1d4ed8":"#dc2626",bg:profitE>=0?"#eff6ff":"#fef2f2",border:profitE>=0?"#bfdbfe":"#fecaca"},
        ].map(c=>(
          <div key={c.label} style={{background:c.bg,border:"1px solid "+c.border,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:10,color:"#64748b",fontWeight:700,marginBottom:4}}>{c.label}</div>
            <div style={{fontSize:15,fontWeight:800,color:c.color}}>{c.val}</div>
          </div>
        ))}
      </div>

      {/* Pasqyra e plote */}
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
        {/* Header kolonave */}
        <div style={{display:"flex",background:"#1e293b",padding:"10px 14px"}}>
          <div style={{flex:1,fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1}}>ZËI</div>
          <div style={{width:150,textAlign:"right",fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1}}>LEKË</div>
          <div style={{width:120,textAlign:"right",fontSize:11,fontWeight:700,color:"#94a3b8",letterSpacing:1}}>EURO</div>
        </div>

        {/* Të Ardhurat */}
        <SectionHeader label="TË ARDHURAT" color="#166534" bg="#f0fdf4"/>
        {incomeRows.length===0
          ?<div style={{padding:"10px 14px",fontSize:13,color:"#94a3b8"}}>Asnjë arkëtim i regjistruar.</div>
          :incomeRows.map(r=><Row key={r.label} label={r.icon+" "+r.label} l={r.l} e={r.e} indent/>)
        }
        <div style={{background:"#dcfce7",borderTop:"2px solid #16a34a",display:"flex",padding:"10px 14px"}}>
          <div style={{flex:1,fontSize:14,fontWeight:800,color:"#166534"}}>TOTALI TË ARDHURAT</div>
          <div style={{width:150,textAlign:"right",fontSize:14,fontWeight:800,color:"#166534"}}>{fL(totalIncL)}</div>
          <div style={{width:120,textAlign:"right",fontSize:14,fontWeight:800,color:"#166534"}}>{fE(totalIncE)}</div>
        </div>

        <div style={{height:10,background:"#f8fafc"}}/>

        {/* Shpenzimet */}
        <SectionHeader label="SHPENZIMET SIPAS KATEGORISË" color="#991b1b" bg="#fef2f2"/>
        {expByCat.length===0
          ?<div style={{padding:"10px 14px",fontSize:13,color:"#94a3b8"}}>Asnjë shpenzim i regjistruar.</div>
          :expByCat.map(r=>(
            <div key={r.cat} style={{display:"flex",alignItems:"center",padding:"8px 14px",borderBottom:"1px solid #f1f5f9",background:"#fff"}}>
              <div style={{flex:1,fontSize:13,color:"#374151",paddingLeft:12}}>• {r.cat}</div>
              <div style={{width:150,textAlign:"right",fontSize:13,color:"#991b1b"}}>({r.l>0?fL(r.l):"—"})</div>
              <div style={{width:120,textAlign:"right",fontSize:13,color:"#991b1b"}}>({r.e>0?fE(r.e):"—"})</div>
            </div>
          ))
        }
        <div style={{background:"#fee2e2",borderTop:"2px solid #dc2626",display:"flex",padding:"10px 14px"}}>
          <div style={{flex:1,fontSize:14,fontWeight:800,color:"#991b1b"}}>TOTALI SHPENZIMET</div>
          <div style={{width:150,textAlign:"right",fontSize:14,fontWeight:800,color:"#991b1b"}}>({fL(totalExpL)})</div>
          <div style={{width:120,textAlign:"right",fontSize:14,fontWeight:800,color:"#991b1b"}}>({fE(totalExpE)})</div>
        </div>

        <div style={{height:10,background:"#f8fafc"}}/>

        {/* Fitimi Neto */}
        <div style={{background:profitL>=0?"#eff6ff":"#fef2f2",borderTop:"3px solid "+(profitL>=0?"#1d4ed8":"#dc2626"),display:"flex",padding:"14px"}}>
          <div style={{flex:1,fontSize:16,fontWeight:900,color:profitL>=0?"#1e40af":"#991b1b"}}>
            {profitL>=0?"✅":"⚠️"} FITIMI / HUMBJA NETO
          </div>
          <div style={{width:150,textAlign:"right",fontSize:16,fontWeight:900,color:profitL>=0?"#1e40af":"#991b1b"}}>
            {profitL>=0?"":"-"}{fL(Math.abs(profitL))}
          </div>
          <div style={{width:120,textAlign:"right",fontSize:16,fontWeight:900,color:profitE>=0?"#1e40af":"#991b1b"}}>
            {profitE>=0?"":"-"}{fE(Math.abs(profitE))}
          </div>
        </div>

        {/* Fatura ne pritje */}
        {(pendingL>0||pendingE>0)&&(
          <div style={{background:"#fefce8",borderTop:"1px solid #fde047",display:"flex",padding:"10px 14px",alignItems:"center"}}>
            <div style={{flex:1,fontSize:12,color:"#713f12",fontWeight:600}}>⏳ Fatura ende pa arkëtuar (jo të përfshira sipër)</div>
            <div style={{width:150,textAlign:"right",fontSize:12,fontWeight:700,color:"#92400e"}}>{pendingL>0?fL(pendingL):""}</div>
            <div style={{width:120,textAlign:"right",fontSize:12,fontWeight:700,color:"#92400e"}}>{pendingE>0?fE(pendingE):""}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function CarsReport({cars,reses,exps,view}){
  const carNames=[...new Set(reses.map(r=>r.car_name).concat(exps.map(e=>e.car_name)).concat(cars.map(c=>c.name)))].filter(Boolean);
  function carStats(cn){
    const all=reses.filter(r=>r.car_name===cn);
    const incL=all.filter(r=>r.currency==="ALL").reduce((s,r)=>s+effPaid(r),0);
    const incE=all.filter(r=>r.currency==="EUR").reduce((s,r)=>s+effPaid(r),0);
    const expL=exps.filter(e=>e.car_name===cn&&e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0);
    const expE=exps.filter(e=>e.car_name===cn&&e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0);
    const totalDays=all.reduce((s,r)=>s+diffDays(r.date_from,r.date_to),0);
    const kmList=all.filter(r=>r.km_out&&r.km_in).map(r=>Number(r.km_in)-Number(r.km_out));
    const totalKm=kmList.reduce((s,k)=>s+k,0);
    const paidFull=all.filter(r=>r.payment_status==="paguar").length;
    return {paid:paidFull,total:all.length,incL,incE,expL,expE,totalDays,totalKm,balL:incL-expL,balE:incE-expE};
  }

  if(view==="detail"){
    const sorted=[...reses].sort((a,b)=>(b.date_from||"").localeCompare(a.date_from||""));
    const sortedExps=[...exps].sort((a,b)=>(b.expense_date||"").localeCompare(a.expense_date||""));
    return (
      <div>
        <h4 style={{margin:"0 0 8px",fontSize:13,fontWeight:700,color:"#166534"}}>💰 Të Ardhurat (Rezervimet)</h4>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden",marginBottom:20}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#f8fafc"}}>
              {["Makina","Klienti","Nga","Deri","Çmimi","Paguar","Detyrim","Status"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {sorted.map(r=>{
                const debt=Number(r.total_price||0)-effPaid(r);
                return (
                  <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"7px 10px",fontWeight:700}}>{carLabel(r.car_name,cars)}</td>
                    <td style={{padding:"7px 10px"}}>{r.client_name}</td>
                    <td style={{padding:"7px 10px"}}>{fmtFull(r.date_from)}</td>
                    <td style={{padding:"7px 10px"}}>{fmtFull(r.date_to)}</td>
                    <td style={{padding:"7px 10px",fontWeight:700}}>{fmtM(r.total_price,r.currency)}</td>
                    <td style={{padding:"7px 10px",color:"#16a34a"}}>{fmtM(effPaid(r),r.currency)}</td>
                    <td style={{padding:"7px 10px",color:debt>0.01?"#dc2626":"#94a3b8",fontWeight:debt>0.01?700:400}}>{debt>0.01?fmtM(debt,r.currency):"-"}</td>
                    <td style={{padding:"7px 10px"}}><Badge s={r.status}/></td>
                  </tr>
                );
              })}
              {sorted.length===0&&<tr><td colSpan={8} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka rezervime për këtë filtër.</td></tr>}
            </tbody>
          </table>
        </div>

        <h4 style={{margin:"0 0 8px",fontSize:13,fontWeight:700,color:"#991b1b"}}>📤 Shpenzimet</h4>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#f8fafc"}}>
              {["Data","Makina","Përshkrimi","Kategoria","Shuma"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {sortedExps.map(e=>(
                <tr key={e.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={{padding:"7px 10px"}}>{e.expense_date?fmtFull(e.expense_date):"-"}</td>
                  <td style={{padding:"7px 10px",fontWeight:700}}>{e.car_name?carLabel(e.car_name,cars):"—"}</td>
                  <td style={{padding:"7px 10px"}}>{e.description||"-"}</td>
                  <td style={{padding:"7px 10px",color:"#64748b"}}>{e.category||"-"}</td>
                  <td style={{padding:"7px 10px",fontWeight:700,color:"#dc2626"}}>{fmtM(e.amount,e.currency)}</td>
                </tr>
              ))}
              {sortedExps.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka shpenzime për këtë filtër.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      {carNames.map(cn=>{
        const s=carStats(cn);
        if(s.total===0&&s.expL===0&&s.expE===0) return null;
        const cc=carColor(cn,carNames);
        const car=cars.find(c=>c.name===cn);
        return (
          <div key={cn} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,marginBottom:16,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            <div style={{background:cc.bg,borderBottom:"3px solid "+cc.ac,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
              {car?.photo_url ? <img src={car.photo_url} style={{width:48,height:34,objectFit:"cover",borderRadius:7,flexShrink:0}}/> : <div style={{fontSize:28}}>🚗</div>}
              <div>
                <div style={{fontWeight:800,fontSize:15,color:cc.tx}}>{car?.targa||cn}</div>
                <div style={{fontSize:11,color:cc.tx,opacity:0.6}}>{car?.model||""}</div>
                <div style={{fontSize:12,color:cc.tx,opacity:0.7}}>{s.total} rezervime · {s.totalDays} ditë · {s.totalKm} km</div>
              </div>
            </div>
            <div style={{padding:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:8}}>LEKË</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Të ardhura</span><span style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>{s.incL.toLocaleString("sq-AL")} L</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Shpenzime</span><span style={{fontWeight:700,color:"#dc2626",fontSize:13}}>{s.expL.toLocaleString("sq-AL")} L</span></div>
                  <div style={{height:1,background:"#e2e8f0",marginBottom:6}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:700}}>Balanca</span><span style={{fontWeight:800,color:s.balL>=0?"#16a34a":"#dc2626",fontSize:14}}>{s.balL.toLocaleString("sq-AL")} L</span></div>
                </div>
                <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:8}}>EURO</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Të ardhura</span><span style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>€{s.incE.toFixed(2)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Shpenzime</span><span style={{fontWeight:700,color:"#dc2626",fontSize:13}}>€{s.expE.toFixed(2)}</span></div>
                  <div style={{height:1,background:"#e2e8f0",marginBottom:6}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:700}}>Balanca</span><span style={{fontWeight:800,color:s.balE>=0?"#16a34a":"#dc2626",fontSize:14}}>€{s.balE.toFixed(2)}</span></div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
                {[["📋",s.total,"Rezervime"],["✅",s.paid,"Paguar"],["🗓",s.totalDays,"Ditë"],["🚗",s.totalKm,"Km total"]].map(([ic,val,lb])=>(
                  <div key={lb} style={{background:"#f8fafc",borderRadius:8,padding:"9px 10px",textAlign:"center",border:"1px solid #e2e8f0"}}>
                    <div style={{fontSize:11,marginBottom:2}}>{ic}</div>
                    <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{val}</div>
                    <div style={{fontSize:10,color:"#94a3b8"}}>{lb}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      {carNames.every(cn=>{const s=carStats(cn);return s.total===0&&s.expL===0&&s.expE===0;})&&
        <div style={{textAlign:"center",color:"#94a3b8",padding:48,background:"#fff",borderRadius:12,border:"1px solid #e2e8f0"}}>Nuk ka të dhëna për këtë filtër.</div>
      }
    </div>
  );
}

function ClientsReport({clients,reses,selClient,view}){
  function clientStats(name){
    const cr=reses.filter(r=>r.client_name===name);
    const fatL=cr.filter(r=>r.currency==="ALL").reduce((s,r)=>s+Number(r.total_price||0),0);
    const fatE=cr.filter(r=>r.currency==="EUR").reduce((s,r)=>s+Number(r.total_price||0),0);
    const payL=cr.filter(r=>r.currency==="ALL").reduce((s,r)=>s+effPaid(r),0);
    const payE=cr.filter(r=>r.currency==="EUR").reduce((s,r)=>s+effPaid(r),0);
    return {count:cr.length,fatL,fatE,payL,payE,detL:fatL-payL,detE:fatE-payE};
  }

  // Nje klient i zgjedhur -> shfaq levizjet e tij
  if(selClient){
    const cr=[...reses.filter(r=>r.client_name===selClient)].sort((a,b)=>(b.date_from||"").localeCompare(a.date_from||""));
    const s=clientStats(selClient);
    const cl=clients.find(c=>c.name===selClient);
    function doExport(){
      exportToExcel(cr.map(r=>({
        Makina:r.car_name,Nga:fmtFull(r.date_from),Deri:fmtFull(r.date_to),
        Cmimi:r.total_price,Valuta:r.currency,Paguar:r.amount_paid||0,
        Detyrim:Number(r.total_price||0)-Number(r.amount_paid||0),Status:r.status
      })),"Klienti_"+selClient.replace(/\s+/g,"_")+".xlsx","Levizjet");
    }
    return (
      <div>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#1d4ed8,#7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:18}}>{selClient.charAt(0).toUpperCase()}</div>
            <div style={{flex:1}}>
              <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{selClient}</div>
              <div style={{fontSize:12,color:"#64748b"}}>{cl?.phone||""}{cl?.id_card?" · "+cl.id_card:""}</div>
            </div>
            <button onClick={doExport} style={{...PB,background:"#059669",fontSize:12,padding:"7px 14px"}}>📥 Excel</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {[["📋",s.count,"Rezervime"],["💰",s.fatL?s.fatL.toLocaleString("sq-AL")+" L":"€"+s.fatE.toFixed(2),"Faturuar"],["✅",s.payL?s.payL.toLocaleString("sq-AL")+" L":"€"+s.payE.toFixed(2),"Paguar"],["⚠️",(s.detL>0?s.detL.toLocaleString("sq-AL")+" L":s.detE>0?"€"+s.detE.toFixed(2):"0"),"Detyrim"]].map(([ic,val,lb])=>(
              <div key={lb} style={{background:"#f8fafc",borderRadius:8,padding:"9px 10px",textAlign:"center",border:"1px solid #e2e8f0"}}>
                <div style={{fontSize:11,marginBottom:2}}>{ic}</div>
                <div style={{fontWeight:800,fontSize:14,color:lb==="Detyrim"&&(s.detL>0.01||s.detE>0.01)?"#dc2626":"#0f172a"}}>{val}</div>
                <div style={{fontSize:10,color:"#94a3b8"}}>{lb}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#f8fafc"}}>
              {["Makina","Nga","Deri","Çmimi","Paguar","Detyrim","Status"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {cr.map(r=>{
                const debt=Number(r.total_price||0)-Number(r.amount_paid||0);
                return (
                  <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"7px 10px",fontWeight:700}}>{r.car_name}</td>
                    <td style={{padding:"7px 10px"}}>{fmtFull(r.date_from)}</td>
                    <td style={{padding:"7px 10px"}}>{fmtFull(r.date_to)}</td>
                    <td style={{padding:"7px 10px",fontWeight:700}}>{fmtM(r.total_price,r.currency)}</td>
                    <td style={{padding:"7px 10px",color:"#16a34a"}}>{fmtM(r.amount_paid||0,r.currency)}</td>
                    <td style={{padding:"7px 10px",color:debt>0.01?"#dc2626":"#94a3b8",fontWeight:debt>0.01?700:400}}>{debt>0.01?fmtM(debt,r.currency):"-"}</td>
                    <td style={{padding:"7px 10px"}}><Badge s={r.status}/></td>
                  </tr>
                );
              })}
              {cr.length===0&&<tr><td colSpan={7} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka rezervime për këtë filtër.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // Te gjithe klientet -> tabele permbledhese
  const rows=clients.map(cl=>({cl,s:clientStats(cl.name)})).sort((a,b)=>(b.s.detL+b.s.detE*100)-(a.s.detL+a.s.detE*100));
  function doExportAll(){
    exportToExcel(rows.map(({cl,s})=>({
      Klienti:cl.name,Telefon:cl.phone||"",Rezervime:s.count,
      "Faturuar (Lek)":s.fatL,"Paguar (Lek)":s.payL,"Detyrim (Lek)":s.detL,
      "Faturuar (Eur)":s.fatE,"Paguar (Eur)":s.payE,"Detyrim (Eur)":s.detE
    })),"Klientet_Raport.xlsx","Klientet");
  }

  if(view==="detail"){
    const allRes=[...reses].sort((a,b)=>(b.date_from||"").localeCompare(a.date_from||""));
    function doExportDetail(){
      exportToExcel(allRes.map(r=>({
        Klienti:r.client_name,Makina:r.car_name,Nga:fmtFull(r.date_from),Deri:fmtFull(r.date_to),
        Cmimi:r.total_price,Valuta:r.currency,Paguar:r.amount_paid||0,
        Detyrim:Number(r.total_price||0)-Number(r.amount_paid||0),Status:r.status
      })),"Rezervimet_Klienteve.xlsx","Rezervimet");
    }
    return (
      <div>
        <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
          <button onClick={doExportDetail} style={{...PB,background:"#059669",fontSize:12,padding:"7px 14px"}}>📥 Shkarko Excel</button>
        </div>
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
            <thead><tr style={{background:"#f8fafc"}}>
              {["Klienti","Makina","Nga","Deri","Çmimi","Paguar","Detyrim","Status"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
            </tr></thead>
            <tbody>
              {allRes.map(r=>{
                const debt=Number(r.total_price||0)-Number(r.amount_paid||0);
                return (
                  <tr key={r.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                    <td style={{padding:"7px 10px",fontWeight:700}}>{r.client_name}</td>
                    <td style={{padding:"7px 10px"}}>{r.car_name}</td>
                    <td style={{padding:"7px 10px"}}>{fmtFull(r.date_from)}</td>
                    <td style={{padding:"7px 10px"}}>{fmtFull(r.date_to)}</td>
                    <td style={{padding:"7px 10px",fontWeight:700}}>{fmtM(r.total_price,r.currency)}</td>
                    <td style={{padding:"7px 10px",color:"#16a34a"}}>{fmtM(r.amount_paid||0,r.currency)}</td>
                    <td style={{padding:"7px 10px",color:debt>0.01?"#dc2626":"#94a3b8",fontWeight:debt>0.01?700:400}}>{debt>0.01?fmtM(debt,r.currency):"-"}</td>
                    <td style={{padding:"7px 10px"}}><Badge s={r.status}/></td>
                  </tr>
                );
              })}
              {allRes.length===0&&<tr><td colSpan={8} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka rezervime për këtë filtër.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={doExportAll} style={{...PB,background:"#059669",fontSize:12,padding:"7px 14px"}}>📥 Shkarko Excel</button>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:"#f8fafc"}}>
            {["Klienti","Telefon","Rezervime","Faturuar","Paguar","Detyrim"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(({cl,s})=>(
              <tr key={cl.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                <td style={{padding:"7px 10px",fontWeight:700}}>{cl.name}</td>
                <td style={{padding:"7px 10px",color:"#64748b"}}>{cl.phone||"-"}</td>
                <td style={{padding:"7px 10px"}}>{s.count}</td>
                <td style={{padding:"7px 10px"}}>{s.fatL?s.fatL.toLocaleString("sq-AL")+" L":""}{s.fatL&&s.fatE?" · ":""}{s.fatE?"€"+s.fatE.toFixed(2):""}{!s.fatL&&!s.fatE?"-":""}</td>
                <td style={{padding:"7px 10px",color:"#16a34a"}}>{s.payL?s.payL.toLocaleString("sq-AL")+" L":""}{s.payL&&s.payE?" · ":""}{s.payE?"€"+s.payE.toFixed(2):""}{!s.payL&&!s.payE?"-":""}</td>
                <td style={{padding:"7px 10px",color:(s.detL>0.01||s.detE>0.01)?"#dc2626":"#94a3b8",fontWeight:(s.detL>0.01||s.detE>0.01)?700:400}}>
                  {s.detL>0.01?s.detL.toLocaleString("sq-AL")+" L":""}{s.detL>0.01&&s.detE>0.01?" · ":""}{s.detE>0.01?"€"+s.detE.toFixed(2):""}{s.detL<=0.01&&s.detE<=0.01?"-":""}
                </td>
              </tr>
            ))}
            {rows.length===0&&<tr><td colSpan={6} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka klientë.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocsReport({cars,services,carSettings,reses,selTypes}){
  const TYPE_LB={sigurim:"🛡️ Sigurim",kasko:"🚙 Kasko",kolaudim:"🔍 Kolaudim",taksa:"💼 Taksa",vaj_filtra:"🛢️ Vaj/Filtra"};
  function daysUntil(dateStr){
    const d=new Date(dateStr); d.setHours(0,0,0,0);
    const t=new Date(); t.setHours(0,0,0,0);
    return Math.round((d-t)/86400000);
  }
  function urg(days){
    if(days<0) return {bg:"#fef2f2",bd:"#fca5a5",tx:"#991b1b",lb:"Skaduar prej "+Math.abs(days)+"d"};
    if(days<=5) return {bg:"#fef2f2",bd:"#fca5a5",tx:"#991b1b",lb:days+" ditë"};
    if(days<=15) return {bg:"#fef3c7",bd:"#fde68a",tx:"#92400e",lb:days+" ditë"};
    if(days<=30) return {bg:"#fef9c3",bd:"#fef08a",tx:"#713f12",lb:days+" ditë"};
    return {bg:"#f0fdf4",bd:"#bbf7d0",tx:"#166534",lb:days+" ditë"};
  }
  function currentKm(cn){
    const vals=(reses||[]).filter(r=>r.car_name===cn&&r.km_in).map(r=>Number(r.km_in));
    return vals.length?Math.max(...vals):0;
  }

  const dateDocs=services
    .filter(s=>TYPE_LB[s.type]&&s.type!=="vaj_filtra")
    .map(s=>({...s,kind:"date",daysLeft:daysUntil(s.expiry_date)}));

  const oilDocs=(carSettings||[])
    .filter(cs=>cs.oil_interval_km&&cs.last_oil_km!==null&&cs.last_oil_km!==undefined)
    .map(cs=>{
      const curKm=currentKm(cs.car_name)||Number(cs.last_oil_km);
      const nextChangeKm=Number(cs.last_oil_km)+Number(cs.oil_interval_km);
      const kmLeft=nextChangeKm-curKm;
      return {
        id:"oil_"+cs.id, car_name:cs.car_name, type:"vaj_filtra",
        kind:"km", kmLeft, curKm, nextChangeKm,
        daysLeft:Math.round(kmLeft/500), // ekuivalent per renditje/urgjence te njesuar
        notes:"Km aktual: "+curKm.toLocaleString()+" · Ndërrimi te: "+nextChangeKm.toLocaleString()+" km"
      };
    });

  const docs=[...dateDocs,...oilDocs]
    .filter(s=>!selTypes||selTypes.length===0||selTypes.includes(s.type))
    .sort((a,b)=>a.daysLeft-b.daysLeft);

  function doExport(){
    exportToExcel(docs.map(s=>({
      Makina:carLabel(s.car_name,cars),Lloji:TYPE_LB[s.type],
      "Data e Skadimit / Km":s.kind==="date"?fmtFull(s.expiry_date):(s.nextChangeKm.toLocaleString()+" km"),
      Status:s.kind==="date"?(s.daysLeft<0?"Skaduar":s.daysLeft+" ditë"):(s.kmLeft<0?"Kaluar "+Math.abs(s.kmLeft).toLocaleString()+" km":s.kmLeft.toLocaleString()+" km mbetur"),
      Shenime:s.notes||""
    })),"Skadimet_Dokumenteve.xlsx","Skadimet");
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <button onClick={doExport} style={{...PB,background:"#059669",fontSize:12,padding:"7px 14px"}}>📥 Shkarko Excel</button>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:"#f8fafc"}}>
            {["Makina","Lloji","Data e Skadimit / Km","Gjendja","Shënime"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {docs.map(s=>{
              const u=urg(s.daysLeft);
              const gjendja=s.kind==="date"
                ? u.lb
                : (s.kmLeft<0?("kaluar "+Math.abs(s.kmLeft).toLocaleString()+" km"):(s.kmLeft.toLocaleString()+" km mbetur"));
              return (
                <tr key={s.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={{padding:"7px 10px",fontWeight:700}}>{carLabel(s.car_name,cars)}</td>
                  <td style={{padding:"7px 10px"}}>{TYPE_LB[s.type]}</td>
                  <td style={{padding:"7px 10px"}}>{s.kind==="date"?fmtFull(s.expiry_date):(s.nextChangeKm.toLocaleString()+" km")}</td>
                  <td style={{padding:"7px 10px"}}><span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:u.bg,color:u.tx,border:"1px solid "+u.bd}}>{gjendja}</span></td>
                  <td style={{padding:"7px 10px",color:"#64748b"}}>{s.notes||"-"}</td>
                </tr>
              );
            })}
            {docs.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka dokumente për këtë filtër.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DepositsReport({cars,ledger,reses}){
  const resById={}; reses.forEach(r=>{resById[r.id]=r;});
  const depTx=ledger.filter(l=>l.type==="deposit_in"||l.type==="deposit_out");
  const groups={};
  depTx.forEach(l=>{
    const rid=l.reference_id;
    if(!rid) return;
    if(!groups[rid]) groups[rid]={reservation:resById[rid],held:0,totalTaken:0,currency:l.currency,taken:null,returned:null};
    groups[rid].held += Number(l.amount);
    if(l.type==="deposit_in"){
      groups[rid].totalTaken += Number(l.amount);
      if(!groups[rid].taken||l.created_at<groups[rid].taken) groups[rid].taken=l.created_at;
    }
    if(l.type==="deposit_out") groups[rid].returned=l.created_at;
  });
  const rows=Object.values(groups).filter(g=>g.reservation).sort((a,b)=>(b.taken||"").localeCompare(a.taken||""));

  function doExport(){
    exportToExcel(rows.map(g=>({
      Klienti:g.reservation.client_name,Makina:carLabel(g.reservation.car_name,cars),
      Shuma:g.totalTaken,
      Valuta:g.currency,
      "Marrë më":g.taken?fmtFull(g.taken.slice(0,10)):"",
      "Kthyer më":g.returned?fmtFull(g.returned.slice(0,10)):"",
      Status:g.held>0.01?"Mbajtur":"Kthyer"
    })),"Depozitat.xlsx","Depozitat");
  }

  const totalHeld={};
  rows.forEach(g=>{ if(g.held>0.01){ totalHeld[g.currency]=(totalHeld[g.currency]||0)+g.held; } });

  return (
    <div>
      <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        {Object.entries(totalHeld).map(([cur,amt])=>(
          <div key={cur} style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"10px 16px"}}>
            <div style={{fontSize:10,color:"#1e40af",fontWeight:700}}>TOTALI I MBAJTUR ({cur})</div>
            <div style={{fontSize:18,fontWeight:800,color:"#1e40af"}}>{fmtM(amt,cur)}</div>
          </div>
        ))}
        <div style={{flex:1}}/>
        <button onClick={doExport} style={{...PB,background:"#059669",fontSize:12,padding:"7px 14px"}}>📥 Shkarko Excel</button>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:"#f8fafc"}}>
            {["Klienti","Makina","Shuma","Marrë më","Kthyer më","Status"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((g,i)=>{
              const isHeld=g.held>0.01;
              return (
                <tr key={i} style={{borderBottom:"1px solid #f1f5f9"}}>
                  <td style={{padding:"7px 10px",fontWeight:700}}>{g.reservation.client_name}</td>
                  <td style={{padding:"7px 10px"}}>{carLabel(g.reservation.car_name,cars)}</td>
                  <td style={{padding:"7px 10px",fontWeight:700}}>{fmtM(g.totalTaken,g.currency)}</td>
                  <td style={{padding:"7px 10px"}}>{g.taken?fmtFull(g.taken.slice(0,10)):"-"}</td>
                  <td style={{padding:"7px 10px"}}>{g.returned?fmtFull(g.returned.slice(0,10)):"-"}</td>
                  <td style={{padding:"7px 10px"}}>
                    <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:isHeld?"#eff6ff":"#f0fdf4",color:isHeld?"#1e40af":"#166534",border:"1px solid "+(isHeld?"#bfdbfe":"#bbf7d0")}}>
                      {isHeld?"🔒 Mbajtur":"✅ Kthyer"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length===0&&<tr><td colSpan={6} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka depozita për këtë filtër.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FinanceReport({cars,ledger,reses,view}){
  const TYPE_LB={payment:"💵 Pagesë",prepayment:"🟡 Parapagim",manual_in:"➕ Hyrje Manuale",expense:"📤 Shpenzim",manual_out:"➖ Dalje Manuale",transfer:"🔄 Transfertë",deposit_in:"🔒 Depozitë Marrë",deposit_out:"↩️ Depozitë Kthyer"};
  if(view==="detail"){
    const sorted=[...ledger].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    return (
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
          <thead><tr style={{background:"#f8fafc"}}>
            {["Data","Lloji","Përshkrimi","Nga","Shuma"].map(h=><th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:11,color:"#64748b",fontWeight:700,borderBottom:"2px solid #e2e8f0"}}>{h}</th>)}
          </tr></thead>
          <tbody>
            {sorted.map(l=>(
              <tr key={l.id} style={{borderBottom:"1px solid #f1f5f9"}}>
                <td style={{padding:"7px 10px"}}>{fmtFull((l.created_at||"").slice(0,10))}</td>
                <td style={{padding:"7px 10px"}}>{TYPE_LB[l.type]||l.type}</td>
                <td style={{padding:"7px 10px",color:"#64748b"}}>{l.description||"-"}</td>
                <td style={{padding:"7px 10px",color:"#94a3b8"}}>{l.created_by||"-"}</td>
                <td style={{padding:"7px 10px",fontWeight:700,color:Number(l.amount)>=0?"#16a34a":"#dc2626"}}>{fmtM(Math.abs(l.amount),l.currency)}</td>
              </tr>
            ))}
            {sorted.length===0&&<tr><td colSpan={5} style={{padding:20,textAlign:"center",color:"#94a3b8"}}>Nuk ka lëvizje për këtë filtër.</td></tr>}
          </tbody>
        </table>
      </div>
    );
  }

  function sumBy(type,cur){ return ledger.filter(l=>l.type===type&&l.currency===cur).reduce((s,l)=>s+Number(l.amount),0); }
  const incL=sumBy("payment","ALL")+sumBy("manual_in","ALL");
  const incE=sumBy("payment","EUR")+sumBy("manual_in","EUR");
  const expL=Math.abs(sumBy("expense","ALL")+sumBy("manual_out","ALL"));
  const expE=Math.abs(sumBy("expense","EUR")+sumBy("manual_out","EUR"));

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #e2e8f0"}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:8}}>LEKË</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,color:"#64748b"}}>Të ardhura</span><span style={{fontWeight:700,color:"#1d4ed8",fontSize:15}}>{incL.toLocaleString("sq-AL")} L</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,color:"#64748b"}}>Shpenzime</span><span style={{fontWeight:700,color:"#dc2626",fontSize:15}}>{expL.toLocaleString("sq-AL")} L</span></div>
          <div style={{height:1,background:"#e2e8f0",marginBottom:8}}/>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:700}}>Balanca</span><span style={{fontWeight:800,color:incL-expL>=0?"#16a34a":"#dc2626",fontSize:17}}>{(incL-expL).toLocaleString("sq-AL")} L</span></div>
        </div>
        <div style={{background:"#fff",borderRadius:12,padding:"14px 16px",border:"1px solid #e2e8f0"}}>
          <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:8}}>EURO</div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,color:"#64748b"}}>Të ardhura</span><span style={{fontWeight:700,color:"#1d4ed8",fontSize:15}}>€{incE.toFixed(2)}</span></div>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:13,color:"#64748b"}}>Shpenzime</span><span style={{fontWeight:700,color:"#dc2626",fontSize:15}}>€{expE.toFixed(2)}</span></div>
          <div style={{height:1,background:"#e2e8f0",marginBottom:8}}/>
          <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:700}}>Balanca</span><span style={{fontWeight:800,color:incE-expE>=0?"#16a34a":"#dc2626",fontSize:17}}>€{(incE-expE).toFixed(2)}</span></div>
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:12,padding:16}}>
        <h3 style={{margin:"0 0 10px",fontSize:13,fontWeight:700,color:"#374151"}}>Sipas Llojit</h3>
        {Object.entries(TYPE_LB).map(([type,label])=>{
          const l=sumBy(type,"ALL"), e=sumBy(type,"EUR");
          if(!l&&!e) return null;
          return (
            <div key={type} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f1f5f9",fontSize:13}}>
              <span style={{color:"#374151"}}>{label}</span>
              <span style={{fontWeight:700}}>{l?l.toLocaleString("sq-AL")+" L":""}{l&&e?" · ":""}{e?"€"+e.toFixed(2):""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SERVIS PAGE ──────────────────────────────────────────────────────────────
function SrvPage({sess,reload,reloadTick,addLog}) {
  const mob=useMobile();
  const [cars,setCars]=useState([]);
  const [services,setServices]=useState([]);
  const [reses,setReses]=useState([]);
  const [carSettings,setCarSettings]=useState([]);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [selCar,setSelCar]=useState("");
  const [srch,setSrch]=useState("");
  const [showSrvF,setShowSrvF]=useState(false);
  const [editSrv,setEditSrv]=useState(null);
  const [sf,setSf]=useState({car_name:"",type:"sigurim",expiry_date:"",notes:""});
  const [showOilF,setShowOilF]=useState(false);
  const [oilF,setOilF]=useState({last_oil_km:"",oil_interval_km:"15000",last_oil_date:""});
  const [importingDocs,setImportingDocs]=useState(false);
  const [importDocsMsg,setImportDocsMsg]=useState("");
  const docsFileRef=useRef(null);

  const SRV_TYPES={"sigurim":"🛡️ Sigurim","kasko":"🚙 Kasko","kolaudim":"🔍 Kolaudim","taksa":"💼 Taksa"};
  const DAYS_WARN=[30,15,7,5];
  const KM_WARN=[2000,1000,500,200];

  useEffect(()=>{
    setLoading(true); setErr("");
    Promise.all([
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("car_services","order=created_at.desc",sess.token),
      sbAuthGet("reservations","",sess.token),
      sbAuthGet("car_settings","",sess.token)
    ]).then(([c,s,r,cset])=>{
      const activeCars=c.filter(x=>x.active!==false);
      setCars(activeCars);setServices(s);setReses(r);setCarSettings(cset);
      if(!selCar&&activeCars.length>0) setSelCar(activeCars[0].name);
      setLoading(false);
      try { checkSrvNotifs(s,cset,r); } catch(e){ console.error("checkSrvNotifs error:",e); }
    }).catch(e=>{ setErr(e.message||String(e)); setLoading(false); });
  },[reloadTick,sess.token]);

  function currentKm(cn){
    const vals=reses.filter(r=>r.car_name===cn&&r.km_in).map(r=>Number(r.km_in));
    return vals.length?Math.max(...vals):0;
  }

  function checkSrvNotifs(svcs,csets,resesList){
    if(!("Notification" in window)||Notification.permission!=="granted") return;
    const today=new Date(); today.setHours(0,0,0,0);
    const sent=JSON.parse(localStorage.getItem("crm_srv_notifs")||"{}");
    // Njoftime sipas date (Sigurim/Kasko/Kolaudim/Taksa)
    svcs.filter(s=>SRV_TYPES[s.type]).forEach(s=>{
      const exp=new Date(s.expiry_date); exp.setHours(0,0,0,0);
      const daysLeft=Math.round((exp-today)/86400000);
      const label=SRV_TYPES[s.type];
      DAYS_WARN.forEach(d=>{
        const key=s.id+"_"+d;
        if(daysLeft===d&&!sent[key]){
          new Notification("⚠️ "+label+" skadon në "+d+" ditë",{body:s.car_name+" · "+s.expiry_date});
          sent[key]=true;
        }
      });
      if(daysLeft<=5){
        const todayStr=today.toISOString().slice(0,10);
        const dailyKey=s.id+"_daily_"+todayStr;
        if(!sent[dailyKey]){
          const lbl=daysLeft<0?("SKADUAR prej "+Math.abs(daysLeft)+" ditë!"):daysLeft===0?"SKADON SOT!":("mbetën "+daysLeft+" ditë");
          new Notification("🚨 "+label+" - "+lbl,{body:s.car_name+" · "+s.expiry_date});
          sent[dailyKey]=true;
        }
      }
    });
    // Njoftime KM per Vaj/Filtra
    csets.forEach(cset=>{
      if(!cset.oil_interval_km||cset.last_oil_km===null||cset.last_oil_km===undefined) return;
      const vals=resesList.filter(r=>r.car_name===cset.car_name&&r.km_in).map(r=>Number(r.km_in));
      const curKm=vals.length?Math.max(...vals):Number(cset.last_oil_km);
      const nextChangeKm=Number(cset.last_oil_km)+Number(cset.oil_interval_km);
      const kmLeft=nextChangeKm-curKm;
      KM_WARN.forEach(k=>{
        const key=cset.car_name+"_oilkm_"+k;
        if(kmLeft<=k&&kmLeft>k-500&&!sent[key]){
          new Notification("🛢️ Vaj/Filtra afër ndërrimit — "+cset.car_name,{body:"Edhe ~"+Math.max(0,kmLeft).toLocaleString()+" km deri ndërrimit"});
          sent[key]=true;
        }
      });
      if(kmLeft<=200){
        const todayStr=today.toISOString().slice(0,10);
        const dailyKey=cset.car_name+"_oilkm_daily_"+todayStr;
        if(!sent[dailyKey]){
          const lbl=kmLeft<0?("KALUAR me "+Math.abs(kmLeft).toLocaleString()+" km!"):("edhe "+kmLeft.toLocaleString()+" km");
          new Notification("🚨 Vaj/Filtra — "+cset.car_name+" — "+lbl,{body:"Km aktual: "+curKm.toLocaleString()+" · Ndërrimi te: "+nextChangeKm.toLocaleString()});
          sent[dailyKey]=true;
        }
      }
    });
    localStorage.setItem("crm_srv_notifs",JSON.stringify(sent));
  }

  async function saveSrv(){
    if(!sf.car_name||!sf.expiry_date) { alert("Duhet të zgjedhësh makinën dhe datën."); return; }
    try {
      const body={...sf};
      if(editSrv){
        await sbAuthPatch("car_services",editSrv,body,sess.token);
        addLog("Ndrysho Servis",sf.car_name+" - "+sf.type);
      } else {
        await sbAuthPost("car_services",{...body,created_by:sess.profile?.username},sess.token);
        addLog("Shto Servis",sf.car_name+" - "+sf.type);
      }
      reload(); setShowSrvF(false); setEditSrv(null);
      setSf({car_name:selCar||"",type:"sigurim",expiry_date:"",notes:""});
    } catch(e){
      alert("Gabim: "+e.message);
    }
  }
  async function delSrv(id){
    await sbAuthDelete("car_services",id,sess.token);
    addLog("Fshi Servis","");
    reload();
  }
  async function saveOilSettings(){
    if(!oilF.last_oil_km||!oilF.oil_interval_km){ alert("Duhet të vendosësh km e ndërrimit dhe intervalin."); return; }
    try {
      const existing=carSettings.find(cs=>cs.car_name===selCar);
      const body={car_name:selCar,last_oil_km:Number(oilF.last_oil_km),oil_interval_km:Number(oilF.oil_interval_km),last_oil_date:oilF.last_oil_date||null};
      if(existing){
        await sbAuthPatch("car_settings",existing.id,body,sess.token);
      } else {
        await sbAuthPost("car_settings",body,sess.token);
      }
      addLog("Vendos Vaj/Filtra (Km)",selCar+" @ "+oilF.last_oil_km+" km");
      reload(); setShowOilF(false);
    } catch(e){ alert("Gabim: "+e.message); }
  }

  const DOC_COLS=[["sigurim","Sigurim - Skadimi"],["kasko","Kasko - Skadimi"],["kolaudim","Kolaudim - Skadimi"],["taksa","Taksa - Skadimi"]];

  function downloadDocsTemplate(){
    const headers=["Targa","Modeli",...DOC_COLS.map(([,lb])=>lb)];
    const rows=cars.map(c=>[c.targa||"",c.model||c.name||"","","","",""]);
    const ws=XLSX.utils.aoa_to_sheet([headers,...rows]);
    ws["!cols"]=[{wch:14},{wch:20},{wch:16},{wch:16},{wch:16},{wch:16}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Skadimet");
    XLSX.writeFile(wb,"Template_Skadimet.xlsx");
  }

  function parseCellDate(val){
    if(!val) return null;
    if(val instanceof Date) return val.getFullYear()+"-"+String(val.getMonth()+1).padStart(2,"0")+"-"+String(val.getDate()).padStart(2,"0");
    const s=String(val).trim();
    if(!s) return null;
    const m=s.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
    if(m) return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return null;
  }

  async function importDocsFromExcel(file){
    if(!file) return;
    setImportingDocs(true); setImportDocsMsg("");
    try {
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array",cellDates:true});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      let updated=0, skippedCar=0, skippedDate=0;
      for(const row of rows){
        const targa=String(row["Targa"]||"").trim();
        if(!targa){ skippedCar++; continue; }
        const car=cars.find(c=>(c.targa||"").toLowerCase()===targa.toLowerCase());
        if(!car){ skippedCar++; continue; }
        for(const [type,label] of DOC_COLS){
          const raw=row[label];
          const iso=parseCellDate(raw);
          if(!iso){ if(raw) skippedDate++; continue; }
          // fshi ekzistueset per kete makine+lloj, pastaj shto te ren
          const existing=services.filter(s=>s.car_name===car.name&&s.type===type);
          for(const ex of existing) await sbAuthDelete("car_services",ex.id,sess.token);
          await sbAuthPost("car_services",{car_name:car.name,type,expiry_date:iso,created_by:sess.profile?.username},sess.token);
          updated++;
        }
      }
      addLog("Import Skadimesh (Excel)",updated+" dokumente");
      setImportDocsMsg("✅ U përditësuan "+updated+" dokumente"+(skippedCar?" · "+skippedCar+" rreshta pa targë të njohur":"")+(skippedDate?" · "+skippedDate+" data të pavlefshme u anashkaluan":""));
      reload();
    } catch(e){
      setImportDocsMsg("❌ Gabim: "+e.message);
    }
    setImportingDocs(false);
    if(docsFileRef.current) docsFileRef.current.value="";
  }

  function daysUntil(dateStr){
    const d=new Date(dateStr); d.setHours(0,0,0,0);
    const t=new Date(); t.setHours(0,0,0,0);
    return Math.round((d-t)/86400000);
  }
  function urgencyColor(days){
    if(days<0)  return {bg:"#fef2f2",bd:"#fca5a5",tx:"#991b1b",label:"Skaduar"};
    if(days<=5) return {bg:"#fef2f2",bd:"#fca5a5",tx:"#991b1b",label:days+"d"};
    if(days<=15) return {bg:"#fef3c7",bd:"#fde68a",tx:"#92400e",label:days+"d"};
    if(days<=30) return {bg:"#fef9c3",bd:"#fef08a",tx:"#713f12",label:days+"d"};
    return {bg:"#f0fdf4",bd:"#bbf7d0",tx:"#166534",label:days+"d"};
  }

  const carNames=cars.map(c=>c.name);
  if(loading) return <Spin/>;
  if(err) return <Err msg={err} onRetry={()=>{setErr("");reload();}}/>;

  // Statusi më urgjent për një makinë (për pamjen e flotës)
  // Statusi më urgjent për një makinë (për pamjen e flotës) - dite deri skadim minimale, ose km-ekuivalent per vaj
  function worstStatus(cn){
    const docs=services.filter(s=>s.car_name===cn&&SRV_TYPES[s.type]);
    let worst=null;
    docs.forEach(s=>{ const d=daysUntil(s.expiry_date); if(worst===null||d<worst) worst=d; });
    const cset=carSettings.find(cs=>cs.car_name===cn);
    if(cset&&cset.oil_interval_km&&cset.last_oil_km!==null&&cset.last_oil_km!==undefined){
      const curKm=currentKm(cn)||Number(cset.last_oil_km);
      const kmLeft=(Number(cset.last_oil_km)+Number(cset.oil_interval_km))-curKm;
      // konverto km ne "ditë-ekuivalente" per krahasim urgjence (500km ~ 1 "ditë" urgjence)
      const kmAsDays=Math.round(kmLeft/500);
      if(worst===null||kmAsDays<worst) worst=kmAsDays;
    }
    return worst;
  }

  const filteredCars=cars.filter(c=>!srch||(c.targa||"").toLowerCase().includes(srch.toLowerCase())||(c.model||c.name||"").toLowerCase().includes(srch.toLowerCase()));
  const selDocs=services.filter(s=>s.car_name===selCar&&SRV_TYPES[s.type]);
  const selOilSetting=carSettings.find(cs=>cs.car_name===selCar);
  const selCurKm=selCar?currentKm(selCar):0;

  return (
    <div style={{padding:mob?10:14,maxWidth:1000,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>🔧 Servis & Dokumenta</h2>
        <span style={{fontSize:12,color:"#94a3b8"}}>{cars.length} makina</span>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <button onClick={downloadDocsTemplate} style={{...PB,background:"#475569",fontSize:12,padding:"7px 12px"}}>📄 Shkarko Template Skadimesh</button>
        <label style={{...PB,background:"#059669",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,fontSize:12,padding:"7px 12px"}}>
          {importingDocs?"⏳ Duke importuar...":"📥 Importo Skadimet nga Excel"}
          <input ref={docsFileRef} type="file" accept=".xlsx,.xls" onChange={e=>importDocsFromExcel(e.target.files[0])} style={{display:"none"}} disabled={importingDocs}/>
        </label>
      </div>
      {importDocsMsg&&<div style={{marginBottom:14,padding:"8px 12px",borderRadius:8,fontSize:12,fontWeight:600,background:importDocsMsg.startsWith("✅")?"#dcfce7":"#fee2e2",color:importDocsMsg.startsWith("✅")?"#166534":"#991b1b"}}>{importDocsMsg}</div>}

      <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="🔍 Kërko makinën me targë ose model..." style={{...FL,marginBottom:14}}/>

      {/* Pamja e flotës — kush ka nevojë për vëmendje */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(110px,1fr))",gap:8,marginBottom:18}}>
        {filteredCars.map(car=>{
          const worst=worstStatus(car.name);
          const urg=worst===null?{bg:"#f8fafc",bd:"#e2e8f0",tx:"#94a3b8"}:urgencyColor(worst);
          const sel=selCar===car.name;
          return (
            <div key={car.id} onClick={()=>setSelCar(car.name)} style={{
              cursor:"pointer",background:urg.bg,border:"2px solid "+(sel?"#1d4ed8":urg.bd),borderRadius:10,
              padding:"8px 6px",textAlign:"center",boxShadow:sel?"0 0 0 2px #bfdbfe":"none"
            }}>
              <div style={{fontSize:11,fontWeight:800,color:urg.tx}}>{car.targa||car.name}</div>
              <div style={{fontSize:9,color:urg.tx,opacity:0.8,marginTop:2}}>
                {worst===null?"pa dokumente":worst<0?"SKADUAR":worst+" ditë"}
              </div>
            </div>
          );
        })}
      </div>

      {selCar&&(
        <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
          <div style={{background:"#0f172a",padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontWeight:800,fontSize:15,color:"#fff",flex:1}}>{carLabel(selCar,cars)}</span>
            <button onClick={()=>{setSf({car_name:selCar,type:"sigurim",expiry_date:"",notes:""});setEditSrv(null);setShowSrvF(true)}} style={{...PB,fontSize:12,padding:"6px 12px"}}>+ Dokument</button>
          </div>

          <div style={{padding:16}}>
            {/* Dokumentet: Sigurim / Kasko / Kolaudim / Taksa */}
            <h3 style={{margin:"0 0 10px",fontSize:13,fontWeight:700,color:"#374151"}}>📄 Dokumentet</h3>
            {Object.entries(SRV_TYPES).map(([type,label])=>{
              const srv=selDocs.find(s=>s.type===type);
              const days=srv?daysUntil(srv.expiry_date):null;
              const urg=srv?urgencyColor(days):{bg:"#f8fafc",bd:"#e2e8f0",tx:"#94a3b8"};
              return (
                <div key={type} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <span style={{fontSize:16,flexShrink:0}}>{label.split(" ")[0]}</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#374151"}}>{label.split(" ").slice(1).join(" ")}</div>
                    {srv?<div style={{fontSize:11,color:"#64748b"}}>Skadon: {fmtFull(srv.expiry_date)}{srv.notes?" · "+srv.notes:""}</div>:<div style={{fontSize:11,color:"#94a3b8"}}>Nuk është shtuar</div>}
                  </div>
                  {srv&&<div style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:urg.bg,color:urg.tx,border:"1px solid "+urg.bd,flexShrink:0}}>{days<0?"Skaduar":days+"d"}</div>}
                  <button onClick={()=>{setSf({car_name:selCar,type,expiry_date:srv?.expiry_date||"",notes:srv?.notes||""});setEditSrv(srv?.id||null);setShowSrvF(true)}} style={{...IB,fontSize:12}}>{srv?"✏️":"➕"}</button>
                  {srv&&<button onClick={()=>delSrv(srv.id)} style={{...IB,color:"#dc2626",fontSize:12}}>🗑️</button>}
                </div>
              );
            })}

            {/* Vaj/Filtra - bazuar ne KM */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",margin:"18px 0 10px"}}>
              <h3 style={{margin:0,fontSize:13,fontWeight:700,color:"#374151"}}>🛢️ Vaj & Filtra (sipas Km)</h3>
              <button onClick={()=>{setOilF({last_oil_km:selOilSetting?.last_oil_km||"",oil_interval_km:selOilSetting?.oil_interval_km||"15000",last_oil_date:selOilSetting?.last_oil_date||""});setShowOilF(true)}} style={{...IB,fontSize:12}}>{selOilSetting?"✏️ Ndrysho":"➕ Vendos"}</button>
            </div>
            {!selOilSetting
              ? <div style={{fontSize:12,color:"#94a3b8",padding:"10px 0"}}>Nuk është vendosur ende km e ndërrimit të fundit. Kliko "➕ Vendos".</div>
              : (()=>{
                  const nextChangeKm=Number(selOilSetting.last_oil_km)+Number(selOilSetting.oil_interval_km);
                  const kmLeft=nextChangeKm-selCurKm;
                  const kmAsDays=Math.round(kmLeft/500);
                  const urg=urgencyColor(kmAsDays);
                  return (
                    <div style={{background:urg.bg,border:"1px solid "+urg.bd,borderRadius:10,padding:"12px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                        <span style={{fontWeight:700,fontSize:13,color:urg.tx}}>{kmLeft<0?"🚨 Ndërrimi ka KALUAR":"🔔 Ndërrimi tjetër"}</span>
                        <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:"#fff",color:urg.tx,border:"1px solid "+urg.bd}}>
                          {kmLeft<0?("kaluar "+Math.abs(kmLeft).toLocaleString()+" km"):(kmLeft.toLocaleString()+" km mbetur")}
                        </span>
                      </div>
                      <div style={{fontSize:12,color:urg.tx,lineHeight:1.8}}>
                        Km aktual (nga marrja e fundit): <strong>{selCurKm.toLocaleString()}</strong><br/>
                        Ndërrimi i fundit u bë në: <strong>{Number(selOilSetting.last_oil_km).toLocaleString()} km</strong>{selOilSetting.last_oil_date?" ("+fmtFull(selOilSetting.last_oil_date)+")":""}<br/>
                        Intervali: çdo <strong>{Number(selOilSetting.oil_interval_km).toLocaleString()} km</strong> → ndërrimi tjetër te <strong>{nextChangeKm.toLocaleString()} km</strong>
                      </div>
                    </div>
                  );
                })()
            }
          </div>
        </div>
      )}

      {/* Modal Shto/Ndrysho Dokument */}
      {showSrvF&&<Modal title={editSrv?"Ndrysho Dokument":"Shto Dokument"} onClose={()=>{setShowSrvF(false);setEditSrv(null);}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Makina *" col2><CarPicker cars={cars} value={sf.car_name} onChange={car=>setSf(f=>({...f,car_name:car.name}))}/></Fld>
          <Fld label="Lloji"><select value={sf.type} onChange={e=>setSf(f=>({...f,type:e.target.value}))} style={FL}>
            {Object.entries(SRV_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select></Fld>
          <Fld label="Data e Skadimit *"><DateInput value={sf.expiry_date} onChange={v=>setSf(f=>({...f,expiry_date:v}))}/></Fld>
          <Fld label="Shënime" col2><input value={sf.notes||""} onChange={e=>setSf(f=>({...f,notes:e.target.value}))} style={FL} placeholder="Opsionale..."/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>{setShowSrvF(false);setEditSrv(null);}} style={CB}>Anulo</button>
          <button onClick={saveSrv} style={PB}>💾 Ruaj</button>
        </div>
      </Modal>}

      {/* Modal Vaj/Filtra (Km) */}
      {showOilF&&<Modal title={"🛢️ Vaj & Filtra — "+carLabel(selCar,cars)} onClose={()=>setShowOilF(false)}>
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#1e40af"}}>
          ℹ️ Km aktual i kësaj makine (nga marrja e fundit e regjistruar): <strong>{selCurKm.toLocaleString()} km</strong>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Km i ndërrimit të fundit *"><input type="number" value={oilF.last_oil_km} onChange={e=>setOilF(f=>({...f,last_oil_km:e.target.value}))} style={FL} placeholder="p.sh. 128000"/></Fld>
          <Fld label="Intervali (km) *"><input type="number" value={oilF.oil_interval_km} onChange={e=>setOilF(f=>({...f,oil_interval_km:e.target.value}))} style={FL} placeholder="15000"/></Fld>
          <Fld label="Data e ndërrimit (opsionale)" col2><DateInput value={oilF.last_oil_date} onChange={v=>setOilF(f=>({...f,last_oil_date:v}))}/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>setShowOilF(false)} style={CB}>Anulo</button>
          <button onClick={saveOilSettings} style={PB}>💾 Ruaj</button>
        </div>
      </Modal>}
    </div>
  );
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────
function AudPage({sess,reloadTick}) {
  const mob=useMobile();
  const [log,setLog]=useState([]);
  const [srch,setSrch]=useState("");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    sbAuthGet("audit_log","limit=200",sess.token).then(d=>{setLog(d);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  const ICONS={"Hyrje":"🟢","Dalje":"🔴","Shto Rezervim":"➕","Ndrysho Rezervim":"✏️","Fshi Rezervim":"🗑️","Dorëzim":"🔑","Dorëzim+Arkëtim":"🔑","Marrje":"🏁","Arkëtim":"💵","Kalim Arke":"🔄","Shënime":"📋","Shto Shpenzim":"💸","Fshi Shpenzim":"🗑️","Shto Klient":"👤","Shto Makinë":"🚗"};
  const list=log.filter(e=>!srch||[e.user_name,e.action,e.details].some(s=>(s||"").toLowerCase().includes(srch.toLowerCase())));

  if(loading) return <Spin/>;
  return (
    <div style={{padding:mob?10:14,maxWidth:860,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>🔍 Aktiviteti</h2>
        <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Kërko..." style={{padding:"7px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,width:190,fontFamily:"inherit"}}/>
      </div>
      {list.length===0
        ? <div style={{color:"#94a3b8",textAlign:"center",padding:48}}>Asnjë aktivitet.</div>
        : <div style={{background:"#fff",borderRadius:12,border:"1px solid #e2e8f0",overflow:"hidden"}}>
          {list.map((e,i)=>(
            <div key={e.id} style={{padding:"9px 14px",display:"flex",gap:8,alignItems:"center",borderBottom:i<list.length-1?"1px solid #f1f5f9":"none",background:i%2===0?"#fff":"#fafafa"}}>
              <div style={{fontSize:14,flexShrink:0}}>{ICONS[e.action]||"📌"}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{e.action}{e.details&&<span style={{fontWeight:400,color:"#64748b"}}> — {e.details}</span>}</div>
                <div style={{fontSize:11,color:"#94a3b8"}}>👤 <strong>{e.user_name}</strong> · {e.created_at?fmtDT(e.created_at):""}</div>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
function SetPage({sess,reload,addLog}) {
  const mob=useMobile();
  const [tab,setTab]=useState("brand");
  const [cars,setCars]=useState([]);
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [newCar,setNewCar]=useState("");
  const [showAddUser,setShowAddUser]=useState(false);
  const [uf,setUf]=useState({email:"",password:"",name:"",role:"staff",username:""});
  const [importing,setImporting]=useState(false);
  const [importMsg,setImportMsg]=useState("");
  const [editCar,setEditCar]=useState(null);
  const [ecf,setEcf]=useState({});
  const [damageCarId,setDamageCarId]=useState(null);
  const fileRef=useRef(null);

  // Branding state from localStorage
  const initBrand = JSON.parse(localStorage.getItem("crm_brand")||"{}");
  const [brandLogo,setBrandLogo] = useState(initBrand.logoUrl||"");
  const [brandName,setBrandName] = useState(initBrand.appName||"Car Rental Manager");
  const [brandAddress,setBrandAddress] = useState(initBrand.companyAddress||"");
  const [brandPhone,setBrandPhone] = useState(initBrand.companyPhone||"");
  const [brandEmail,setBrandEmail] = useState(initBrand.companyEmail||"");
  const [brandNipt,setBrandNipt] = useState(initBrand.companyNipt||"");
  const [brandWebsite,setBrandWebsite] = useState(initBrand.companyWebsite||"");
  const [brandSaved,setBrandSaved] = useState(false);

  function saveBrand(){
    localStorage.setItem("crm_brand", JSON.stringify({
      logoUrl:brandLogo, appName:brandName,
      companyAddress:brandAddress, companyPhone:brandPhone, companyEmail:brandEmail,
      companyNipt:brandNipt, companyWebsite:brandWebsite
    }));
    setBrandSaved(true);
    setTimeout(()=>setBrandSaved(false),1500);
    addLog("Ndrysho Branding", brandName);
  }
  function uploadLogo(file){
    if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>setBrandLogo(ev.target.result);
    reader.readAsDataURL(file);
  }

  useEffect(()=>{
    Promise.all([sbAuthGet("cars","order=sort_order.asc",sess.token),sbAuthGet("profiles","",sess.token)])
      .then(([c,p])=>{setCars(c);setUsers(p);setLoading(false);}).catch(()=>setLoading(false));
  },[sess.token]);

  function downloadTemplate(){
    const headers=["Modeli i Makinës","Viti i Prodhimit","Nr. Shasisë","Kambio","Karburanti","Targa","Ngjyra"];
    const example=[
      ["Volkswagen Golf 7",2018,"WVWZZZAUZJW123456","Automatik","Nafte","AA123BB","E Bardhe"],
      ["Mercedes-Benz C220",2020,"WDD2050421A123456","Automatik","Nafte","AA456CC","E Zeze"]
    ];
    const ws=XLSX.utils.aoa_to_sheet([headers,...example]);
    ws["!cols"]=[{wch:22},{wch:14},{wch:20},{wch:14},{wch:14},{wch:14},{wch:14}];
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Makina");
    XLSX.writeFile(wb,"Template_Makina.xlsx");
  }
  async function importFromExcel(file){
    if(!file) return;
    setImporting(true); setImportMsg("");
    try {
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{defval:""});
      let added=0, skipped=0;
      let sortBase=cars.length;
      for(const row of rows){
        const model=String(row["Modeli i Makinës"]||row["Modeli i Makines"]||"").trim();
        if(!model){ skipped++; continue; }
        const viti=Number(row["Viti i Prodhimit"])||null;
        const shasia=String(row["Nr. Shasisë"]||row["Nr. Shasise"]||"").trim();
        const kambio=String(row["Kambio"]||"").trim();
        const karburanti=String(row["Karburanti"]||"").trim();
        const targa=String(row["Targa"]||"").trim();
        const ngjyra=String(row["Ngjyra"]||"").trim();
        sortBase++;
        const uniqueName=targa?(model+" · "+targa):model;
        const [c]=await sbAuthPost("cars",{
          name:uniqueName, model, viti_prodhimit:viti, shasia, kambio, karburanti, targa, ngjyra,
          sort_order:sortBase
        },sess.token);
        setCars(cs=>[...cs,c]);
        added++;
      }
      addLog("Import Makina (Excel)",added+" makina");
      setImportMsg("✅ U shtuan "+added+" makina"+(skipped?" · "+skipped+" rreshta u anashkaluan (pa model)":""));
    } catch(e){
      setImportMsg("❌ Gabim: "+e.message);
    }
    setImporting(false);
    if(fileRef.current) fileRef.current.value="";
  }
  function openEditCar(car){
    setEditCar(car.id);
    setEcf({model:car.model||car.name||"",viti_prodhimit:car.viti_prodhimit||"",shasia:car.shasia||"",kambio:car.kambio||"",karburanti:car.karburanti||"",targa:car.targa||"",ngjyra:car.ngjyra||""});
  }
  async function saveCarEdit(){
    try {
      const uniqueName=ecf.targa?(ecf.model+" · "+ecf.targa):ecf.model;
      const oldCar=cars.find(x=>x.id===editCar);
      const oldName=oldCar?.name;
      const body={...ecf,name:uniqueName,viti_prodhimit:ecf.viti_prodhimit?Number(ecf.viti_prodhimit):null};
      const [c]=await sbAuthPatch("cars",editCar,body,sess.token);
      if(oldName&&oldName!==uniqueName){
        const filt="car_name=eq."+encodeURIComponent(oldName);
        await Promise.all([
          sbAuthPatchWhere("reservations",filt,{car_name:uniqueName},sess.token),
          sbAuthPatchWhere("expenses",filt,{car_name:uniqueName},sess.token),
          sbAuthPatchWhere("car_services",filt,{car_name:uniqueName},sess.token),
          sbAuthPatchWhere("car_settings",filt,{car_name:uniqueName},sess.token),
        ]);
      }
      setCars(cs=>cs.map(x=>x.id===editCar?{...x,...c}:x));
      addLog("Ndrysho Detaje Makine",uniqueName);
      setEditCar(null);
    } catch(e){alert(e.message);}
  }

  const [newCarTarga,setNewCarTarga]=useState("");
  async function addCar(){
    const n=newCar.trim();
    const t=newCarTarga.trim();
    if(!n) return;
    const uniqueName=t?(n+" · "+t):n;
    try {
      const [c]=await sbAuthPost("cars",{name:uniqueName,model:n,targa:t,sort_order:cars.length+1},sess.token);
      setCars(cs=>[...cs,c]); addLog("Shto Makinë",uniqueName); setNewCar(""); setNewCarTarga("");
    } catch(e){alert(e.message);}
  }
  async function toggleCarActive(car){
    try {
      const newActive=!(car.active!==false);
      await sbAuthPatch("cars",car.id,{active:newActive},sess.token);
      setCars(cs=>cs.map(c=>c.id===car.id?{...c,active:newActive}:c));
      addLog(newActive?"Aktivizo Makinë":"Pasivizo Makinë",car.name);
    } catch(e){alert(e.message);}
  }
  async function uploadPhoto(car,file){
    if(!file) return;
    try {
      const url=await sbUploadPhoto(file,car.name,sess.token);
      await sbAuthPatch("cars",car.id,{photo_url:url},sess.token);
      setCars(cs=>cs.map(c=>c.id===car.id?{...c,photo_url:url}:c));
      addLog("Foto Makinë",car.name);
    } catch(e){alert("Upload dështoi: "+e.message);}
  }
  async function uploadDamagePhotoForCar(car,file){
    return sbUploadContractPhoto(file,"car_"+car.id,"baseline",sess.token);
  }
  async function saveDamagePhotos(car,newPhotos){
    try {
      await sbAuthPatch("cars",car.id,{damage_photos:newPhotos},sess.token);
      setCars(cs=>cs.map(c=>c.id===car.id?{...c,damage_photos:newPhotos}:c));
    } catch(e){ alert("Ruajtja dështoi: "+e.message); }
  }

  if(loading) return <Spin/>;

  return (
    <div style={{padding:mob?10:14,maxWidth:780,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 14px",fontSize:17,fontWeight:700,color:"#0f172a"}}>⚙️ Cilësime</h2>
      <div style={{display:"flex",gap:0,borderBottom:"2px solid #e2e8f0",marginBottom:16,overflowX:"auto"}}>
        {[["brand","🎨 Branding"],["cars","🚗 Makinat"],["users","👤 Përdoruesit"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setTab(id)} style={{padding:"9px 16px",border:"none",background:"none",cursor:"pointer",fontWeight:tab===id?700:500,fontSize:13,fontFamily:"inherit",color:tab===id?"#1d4ed8":"#64748b",borderBottom:tab===id?"2px solid #1d4ed8":"2px solid transparent",marginBottom:-2,whiteSpace:"nowrap"}}>{lb}</button>
        ))}
      </div>

      {tab==="brand"&&(
        <div>
          {/* Preview */}
          <div style={{background:"linear-gradient(135deg,#0a0a0a,#1a1510)",border:"1px solid rgba(201,168,76,0.32)",borderRadius:16,padding:"32px 20px",textAlign:"center",marginBottom:20}}>
            {brandLogo
              ? <img src={brandLogo} alt="logo" style={{width:72,height:72,borderRadius:16,objectFit:"cover",margin:"0 auto 12px",display:"block",boxShadow:"0 8px 24px rgba(0,0,0,0.4)"}}/>
              : <div style={{width:72,height:72,borderRadius:18,background:"linear-gradient(135deg,#3b82f6,#8b5cf6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:32,margin:"0 auto 12px",boxShadow:"0 8px 24px rgba(59,130,246,0.4)"}}>🚗</div>
            }
            <div style={{color:"#fff",fontWeight:800,fontSize:18}}>{brandName||"Car Rental Manager"}</div>
            <div style={{color:"#64748b",fontSize:12,marginTop:4}}>Pamja e login-it</div>
          </div>

          {/* Logo upload */}
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:18,marginBottom:14}}>
            <h3 style={{margin:"0 0 14px",fontSize:14,fontWeight:700,color:"#0f172a"}}>📷 Logo e Kompanisë</h3>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:64,height:64,borderRadius:12,background:brandLogo?"#000":"#f1f5f9",overflow:"hidden",flexShrink:0,border:"2px dashed #e2e8f0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {brandLogo ? <img src={brandLogo} alt="logo" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{fontSize:24}}>🏢</span>}
              </div>
              <div style={{flex:1}}>
                <label style={{display:"inline-block",padding:"9px 16px",background:"#1d4ed8",color:"#fff",borderRadius:9,fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  📂 Ngarko Logo
                  <input type="file" accept="image/*" onChange={e=>uploadLogo(e.target.files[0])} style={{display:"none"}}/>
                </label>
                {brandLogo&&<button onClick={()=>setBrandLogo("")} style={{marginLeft:8,padding:"9px 14px",background:"#f1f5f9",border:"1px solid #e2e8f0",borderRadius:9,fontSize:13,cursor:"pointer",color:"#dc2626"}}>✕ Heq</button>}
                <p style={{fontSize:11,color:"#94a3b8",margin:"8px 0 0"}}>PNG, JPG · Rekomandohet 200×200px</p>
              </div>
            </div>
          </div>

          {/* App name */}
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:18,marginBottom:16}}>
            <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:700,color:"#0f172a"}}>✏️ Emri i Sistemit</h3>
            <input value={brandName} onChange={e=>setBrandName(e.target.value)}
              style={{...FL,fontSize:15,fontWeight:600}}
              placeholder="Car Rental Manager"/>
            <p style={{fontSize:11,color:"#94a3b8",margin:"8px 0 0"}}>Ky emër shfaqet në ekranin e login-it dhe navbar.</p>
          </div>

          {/* Company contact info — used on printed contracts */}
          <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:18,marginBottom:16}}>
            <h3 style={{margin:"0 0 4px",fontSize:14,fontWeight:700,color:"#0f172a"}}>🏢 Të Dhënat e Kompanisë</h3>
            <p style={{fontSize:11,color:"#94a3b8",margin:"0 0 12px"}}>Këto shfaqen te koka dhe fundi i kontratës së qerasë (PDF), që klienti të dijë si t'ju kontaktojë.</p>
            <div style={{display:"grid",gridTemplateColumns:mob?"1fr":"1fr 1fr",gap:10}}>
              <Fld label="Adresa e Kompanisë" col2><input value={brandAddress} onChange={e=>setBrandAddress(e.target.value)} style={FL} placeholder="Rruga, Qyteti, Shqipëri"/></Fld>
              <Fld label="Telefoni"><input value={brandPhone} onChange={e=>setBrandPhone(e.target.value)} style={FL} placeholder="+355 6X XXX XXXX"/></Fld>
              <Fld label="Email"><input value={brandEmail} onChange={e=>setBrandEmail(e.target.value)} style={FL} placeholder="info@kompania.al"/></Fld>
              <Fld label="NIPT / Nr. Regjistrimi"><input value={brandNipt} onChange={e=>setBrandNipt(e.target.value)} style={FL} placeholder="L12345678A"/></Fld>
              <Fld label="Website (opsionale)"><input value={brandWebsite} onChange={e=>setBrandWebsite(e.target.value)} style={FL} placeholder="www.kompania.al"/></Fld>
            </div>
          </div>

          <button onClick={saveBrand} style={{...PB,width:"100%",padding:14,fontSize:14,background:brandSaved?"#16a34a":"#1d4ed8"}}>
            {brandSaved?"✅ Ruajtur!":"💾 Ruaj Branding"}
          </button>
        </div>

      )}

      {tab==="cars"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
            <input value={newCar} onChange={e=>setNewCar(e.target.value)} placeholder="Modeli p.sh. VW Golf 7" style={{...FL,flex:1,minWidth:160}}/>
            <input value={newCarTarga} onChange={e=>setNewCarTarga(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCar()} placeholder="Targa p.sh. AA123BB" style={{...FL,flex:1,minWidth:140}}/>
            <button onClick={addCar} style={PB}>+ Shto</button>
            <button onClick={downloadTemplate} type="button" style={{...PB,background:"#475569"}}>📄 Shkarko Template</button>
            <label style={{...PB,background:"#059669",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6}}>
              {importing?"⏳ Duke importuar...":"📥 Importo nga Excel"}
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e=>importFromExcel(e.target.files[0])} style={{display:"none"}} disabled={importing}/>
            </label>
          </div>
          {importMsg&&<div style={{marginBottom:14,padding:"8px 12px",borderRadius:8,fontSize:12,fontWeight:600,background:importMsg.startsWith("✅")?"#dcfce7":"#fee2e2",color:importMsg.startsWith("✅")?"#166534":"#991b1b"}}>{importMsg}</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
            {cars.map(car=>{
              const cc=carColor(car.name,cars.map(c=>c.name));
              const isActive=car.active!==false;
              return <div key={car.id} style={{background:"#fff",borderRadius:14,border:"2px solid "+(isActive?cc.ac+"44":"#e2e8f0"),overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.07)",opacity:isActive?1:0.6}}>
                <div style={{position:"relative",height:130,background:car.photo_url?"#000":cc.bg,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                  {car.photo_url
                    ? <img src={car.photo_url} alt={car.name} style={{width:"100%",height:"100%",objectFit:"cover",filter:isActive?"none":"grayscale(1)"}}/>
                    : <div style={{fontSize:36,opacity:0.4}}>🚗</div>
                  }
                  {/* Mbulesë e errët poshtë per lexueshmeri te targes */}
                  <div style={{position:"absolute",left:0,right:0,bottom:0,height:"55%",background:"linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0))"}}/>
                  <div style={{position:"absolute",top:6,left:6,padding:"3px 9px",borderRadius:20,fontSize:10,fontWeight:800,background:isActive?"#dcfce7":"#f1f5f9",color:isActive?"#166534":"#64748b"}}>
                    {isActive?"● AKTIVE":"○ PASIVE"}
                  </div>
                  <button onClick={()=>openEditCar(car)} style={{position:"absolute",top:6,right:6,background:"rgba(0,0,0,0.55)",border:"none",borderRadius:7,width:26,height:26,cursor:"pointer",color:"#fff",fontSize:13}}>✏️</button>
                  <label style={{position:"absolute",bottom:6,right:6,background:"rgba(0,0,0,0.65)",color:"#fff",borderRadius:7,padding:"4px 8px",fontSize:11,cursor:"pointer",fontWeight:600,zIndex:2}}>
                    📷 Foto
                    <input type="file" accept="image/*" onChange={e=>uploadPhoto(car,e.target.files[0])} style={{display:"none"}}/>
                  </label>
                  <div style={{position:"absolute",left:10,bottom:6,zIndex:1}}>
                    <div style={{fontSize:17,fontWeight:900,color:"#fff",lineHeight:1.1,textShadow:"0 1px 4px rgba(0,0,0,0.6)"}}>{car.targa||car.name}</div>
                    {car.model&&<div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.85)",textShadow:"0 1px 3px rgba(0,0,0,0.6)"}}>{car.model}</div>}
                  </div>
                </div>
                <div style={{padding:"10px 12px"}}>
                  {(car.viti_prodhimit||car.karburanti||car.kambio||car.shasia)&&(
                    <div style={{fontSize:10,color:"#64748b",lineHeight:1.6,marginBottom:8}}>
                      {car.viti_prodhimit&&<div>📅 {car.viti_prodhimit}{car.ngjyra?" · "+car.ngjyra:""}</div>}
                      {(car.kambio||car.karburanti)&&<div>⚙️ {[car.kambio,car.karburanti].filter(Boolean).join(" · ")}</div>}
                      {car.shasia&&<div>🔩 {car.shasia}</div>}
                    </div>
                  )}
                  <button onClick={()=>toggleCarActive(car)} style={{
                    width:"100%",padding:"7px 0",borderRadius:8,border:"1px solid "+(isActive?"#fca5a5":"#86efac"),
                    background:isActive?"#fef2f2":"#f0fdf4",color:isActive?"#991b1b":"#166534",fontSize:12,fontWeight:700,cursor:"pointer",marginBottom:6
                  }}>{isActive?"⏸️ Kalo Pasive":"▶️ Aktivizo"}</button>
                  <button onClick={()=>setDamageCarId(car.id)} style={{
                    width:"100%",padding:"7px 0",borderRadius:8,border:"1px solid #fde68a",
                    background:"#fffbeb",color:"#92400e",fontSize:12,fontWeight:700,cursor:"pointer"
                  }}>🩹 Foto Dëmtimesh ({(car.damage_photos||[]).length})</button>
                </div>
              </div>;
            })}
          </div>

          {damageCarId&&(()=>{
            const car=cars.find(x=>x.id===damageCarId);
            if(!car) return null;
            return (
              <Modal title={"🩹 Foto Dëmtimesh — "+(car.targa||car.name)} onClose={()=>setDamageCarId(null)}>
                <p style={{fontSize:12,color:"#64748b",margin:"0 0 12px"}}>Këto foto shfaqen automatikisht si "gjendje bazë" çdo herë që krijohet një kontratë e re për këtë makinë. Kur dëmtimi riparohet, hiqe foton këtu.</p>
                <PhotoUploader
                  photos={car.damage_photos||[]}
                  onChange={v=>saveDamagePhotos(car,v)}
                  uploadFn={file=>uploadDamagePhotoForCar(car,file)}
                  label="Ngarko foto të dëmtimeve aktuale të makinës"
                />
              </Modal>
            );
          })()}

          {editCar&&(
            <Modal title="✏️ Detajet e Makinës" onClose={()=>setEditCar(null)}>
              {[["model","Modeli"],["viti_prodhimit","Viti i Prodhimit"],["shasia","Nr. Shasisë"],["kambio","Kambio"],["karburanti","Karburanti"],["targa","Targa"],["ngjyra","Ngjyra"]].map(([k,lb])=>(
                <div key={k} style={{marginBottom:10}}>
                  <label style={{fontSize:12,fontWeight:700,color:"#374151",display:"block",marginBottom:3}}>{lb}</label>
                  <input value={ecf[k]||""} onChange={e=>setEcf(f=>({...f,[k]:e.target.value}))} style={FL}/>
                </div>
              ))}
              <button onClick={saveCarEdit} style={{...PB,width:"100%",marginTop:6}}>💾 Ruaj</button>
            </Modal>
          )}
        </div>
      )}

      {tab==="users"&&(
        <div>
          <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:9,padding:"10px 14px",marginBottom:14,fontSize:12,color:"#92400e"}}>
            ⚠️ Për të shtuar user të ri, shko te <strong>Supabase → Authentication → Users → Add user</strong>, pastaj plotëso profilin këtu. Kontakto adminin e Supabase.
          </div>
          {users.map(u=>(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:10,marginBottom:8,background:"#fff",border:"1px solid #e2e8f0"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:u.role==="admin"?"#fee2e2":u.role==="finance"?"#dcfce7":"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:u.role==="admin"?"#991b1b":u.role==="finance"?"#166534":"#1e40af",flexShrink:0}}>
                {(u.name||"?").charAt(0)}
              </div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:"#0f172a"}}>{u.name} <span style={{fontSize:11,color:"#94a3b8"}}>@{u.username}</span></div>
                <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:u.role==="admin"?"#fee2e2":u.role==="finance"?"#dcfce7":"#dbeafe",color:u.role==="admin"?"#991b1b":u.role==="finance"?"#166534":"#1e40af"}}>{u.role}</span>
              </div>
            </div>
          ))}
          <div style={{marginTop:10,fontSize:11,color:"#94a3b8",lineHeight:1.8,background:"#f8fafc",borderRadius:9,padding:"10px 14px"}}>
            🔴 <strong>admin</strong> = gjithçka &nbsp;|&nbsp; 🟢 <strong>finance</strong> = Financa + Arkë &nbsp;|&nbsp; 🔵 <strong>staff</strong> = Kalendar + Rezervime
          </div>
        </div>
      )}
    </div>
  );
}
