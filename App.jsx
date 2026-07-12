import { useState, useEffect, useCallback, useRef } from "react";

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
  const path = carName.replace(/\s+/g, "_") + "." + ext;
  const r = await fetch(SB_URL + "/storage/v1/object/car-photos/" + path, {
    method: "POST", headers: { "apikey": SB_KEY, "Authorization": "Bearer " + token, "Content-Type": file.type, "x-upsert": "true" },
    body: file
  });
  if (!r.ok) throw new Error("Upload failed");
  return STORAGE_URL + path;
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
function gid() { return Date.now().toString(36)+Math.random().toString(36).slice(2,5); }
function toYMD(d) { return d.toISOString().slice(0,10); }
function addD(s,n) { const d=new Date(s); d.setDate(d.getDate()+n); return toYMD(d); }
function fmtD(s) { if(!s) return ""; const d=new Date(s); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0"); }
function fmtFull(s) { if(!s) return ""; const d=new Date(s); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); }
function fmtM(a,c) { return c==="EUR"?"€"+Number(a).toFixed(2):Number(a).toLocaleString("sq-AL")+" L"; }
function dow(s) { return DAYS_SQ[new Date(s).getDay()]; }
function isWE(s) { const d=new Date(s).getDay(); return d===0||d===6; }
function diffDays(a,b) { if(!a||!b) return 0; return Math.max(1,Math.ceil((new Date(b)-new Date(a))/86400000)); }
function nowStr() { return new Date().toLocaleString("sq-AL"); }
function todayY() { return toYMD(new Date()); }

const PB  = {padding:"8px 16px",borderRadius:8,background:"#1d4ed8",color:"#fff",border:"none",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"};
const CB  = {padding:"8px 16px",borderRadius:8,background:"#f1f5f9",color:"#374151",border:"1px solid #e2e8f0",fontWeight:600,fontSize:13,cursor:"pointer",fontFamily:"inherit"};
const IB  = {padding:"6px 10px",borderRadius:7,background:"#f8fafc",border:"1px solid #e2e8f0",cursor:"pointer",fontSize:13,fontFamily:"inherit"};
const FL  = {width:"100%",padding:"9px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,outline:"none",fontFamily:"inherit",boxSizing:"border-box",background:"#fafafa"};
const NB  = {padding:"7px 14px",borderRadius:8,background:"#f1f5f9",border:"1px solid #e2e8f0",cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:600};

function Badge({s}) { const c=SC[s]||{bg:"#f3f4f6",tx:"#374151"}; return <span style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:c.bg,color:c.tx}}>{s}</span>; }
function Fld({label,col2,children}) { return <div style={{gridColumn:col2?"span 2":"span 1"}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:4}}>{label}</label>{children}</div>; }
function Modal({title,onClose,children,wide}) {
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#fff",borderRadius:16,padding:"20px 16px",width:"100%",maxWidth:wide?680:520,maxHeight:"92vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.25)"}}>
      <div style={{display:"flex",alignItems:"center",marginBottom:16}}>
        <h3 style={{margin:0,fontSize:16,fontWeight:700,color:"#0f172a",flex:1}}>{title}</h3>
        <button onClick={onClose} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8",lineHeight:1}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}
function Spin() { return <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60,flexDirection:"column",gap:12}}><div style={{width:36,height:36,border:"3px solid #e2e8f0",borderTop:"3px solid #1d4ed8",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style><span style={{color:"#94a3b8",fontSize:13}}>Duke ngarkuar...</span></div>; }
function Err({msg, onRetry}) { return <div style={{padding:24,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,margin:16,textAlign:"center"}}><div style={{color:"#dc2626",fontWeight:700,marginBottom:8}}>⚠️ {msg}</div>{onRetry&&<button onClick={onRetry} style={PB}>Provo Sërish</button>}</div>; }

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  const [sess, setSess] = useState(null);
  const [page, setPage] = useState("cal");
  const [lf, setLf]     = useState({email:"", password:"", err:"", loading:false});
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick(t=>t+1), []);

  // ── SESSION PERSISTENCE: restore from localStorage on mount, refresh token if needed
  useEffect(()=>{
    (async ()=>{
      try {
        const saved = localStorage.getItem("crm_session");
        if(!saved) return;
        const s = JSON.parse(saved);
        if(!s?.token || !s?.profile) return;
        // Try refreshing token immediately to ensure it's valid
        if(s.refreshToken){
          try {
            const auth = await sbRefreshToken(s.refreshToken);
            const newS = {...s, token:auth.access_token, refreshToken:auth.refresh_token};
            setSess(newS);
            localStorage.setItem("crm_session", JSON.stringify(newS));
            return;
          } catch(e) {
            // Refresh failed - clear session, force re-login
            localStorage.removeItem("crm_session");
            return;
          }
        }
        setSess(s);
      } catch {}
    })();
  }, []);

  // ── AUTO REFRESH TOKEN every 50 minutes (tokens expire in 60min)
  useEffect(()=>{
    if(!sess?.refreshToken) return;
    const t = setInterval(async ()=>{
      try {
        const auth = await sbRefreshToken(sess.refreshToken);
        setSess(s=>{
          const newS = {...s, token:auth.access_token, refreshToken:auth.refresh_token};
          localStorage.setItem("crm_session", JSON.stringify(newS));
          return newS;
        });
      } catch(e) {
        // Refresh failed - logout
        localStorage.removeItem("crm_session");
        setSess(null);
      }
    }, 50*60*1000);
    return ()=>clearInterval(t);
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

  if (!sess) return <LoginScreen lf={lf} setLf={setLf} login={login} />;

  const role = sess.profile?.role || "staff";
  const NAV = [
    ...(role!=="finance"?[{id:"cal",lb:"📅 Kalendar"},{id:"res",lb:"📋 Rezervime"}]:[]),
    ...(role==="admin"||role==="finance"?[{id:"fin",lb:"📊 Financa"},{id:"ark",lb:"🏦 Arkë"}]:[]),
    ...(role!=="finance"?[{id:"rpt",lb:"📈 Raport"},{id:"srv",lb:"🔧 Servis"}]:[]),
    ...(role==="admin"?[{id:"cli",lb:"👥 Klientët"},{id:"aud",lb:"🔍 Aktiviteti"},{id:"set",lb:"⚙️ Cilësime"}]:[]),
  ];
  const defPage = role==="finance"?"fin":"cal";
  const curPage = NAV.find(n=>n.id===page)?page:defPage;

  return (
    <div style={{minHeight:"100vh",background:"#f1f5f9",fontFamily:"'Inter',sans-serif",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#0a0a0a",color:"#fff",padding:"0 14px",display:"flex",alignItems:"center",gap:10,height:50,flexShrink:0,borderBottom:"1px solid rgba(201,168,76,0.22)",boxShadow:"0 2px 16px rgba(0,0,0,0.5)"}}>
        <span style={{fontSize:20}}>🚗</span>
        <span style={{fontWeight:800,fontSize:13,color:"#c9a84c",letterSpacing:"0.5px"}}>{JSON.parse(localStorage.getItem("crm_brand")||"{}").appName||"Car Rental Manager"}</span>
        <div style={{flex:1}}/>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{background:"rgba(201,168,76,0.12)",border:"1px solid rgba(201,168,76,0.22)",borderRadius:20,padding:"3px 12px",fontSize:11,color:"#c9a84c",fontWeight:600}}>{sess.profile?.name?.split(" ")[0]}</div>
          <button onClick={reload} title="Refresh" style={{background:"rgba(201,168,76,0.1)",border:"1px solid rgba(201,168,76,0.2)",color:"#c9a84c",borderRadius:8,padding:"6px 10px",fontSize:14,cursor:"pointer",lineHeight:1}}>↻</button>
          <button onClick={logout} style={{background:"linear-gradient(135deg,#a07828,#c9a84c)",border:"none",color:"#0a0a0a",borderRadius:8,padding:"6px 14px",fontSize:12,cursor:"pointer",fontWeight:800}}>Dil</button>
        </div>
      </div>
      <div style={{background:"#111",borderBottom:"1px solid rgba(201,168,76,0.18)",display:"flex",flexShrink:0,overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        {NAV.map(n=><button key={n.id} onClick={()=>setPage(n.id)} style={{padding:"12px 14px",border:"none",background:"none",cursor:"pointer",fontWeight:curPage===n.id?700:500,fontSize:12,fontFamily:"inherit",color:curPage===n.id?"#c9a84c":"#6b6b6b",borderBottom:curPage===n.id?"2px solid #c9a84c":"2px solid transparent",whiteSpace:"nowrap",flexShrink:0}}>{n.lb}</button>)}
      </div>
      {/* Notification permission banner */}
      {"Notification" in window && Notification.permission==="default" && (
        <div style={{background:"#1a1500",borderBottom:"1px solid rgba(201,168,76,0.25)",padding:"8px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <span style={{fontSize:13}}>🔔</span>
          <span style={{fontSize:12,color:"#c9a84c",flex:1}}>Aktivizo njoftimet për kujtesa dorëzimi/marrjeje</span>
          <button onClick={()=>Notification.requestPermission()} style={{background:"linear-gradient(135deg,#a07828,#c9a84c)",border:"none",color:"#0a0a0a",borderRadius:7,padding:"5px 12px",fontSize:12,cursor:"pointer",fontWeight:700}}>Aktivizo</button>
        </div>
      )}
      <div style={{flex:1,overflow:"auto"}}>
        {curPage==="cal" && <CalPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="res" && <ResPage  sess={sess} reload={reload} reloadTick={reloadTick} addLog={addAuditLog}/>}
        {curPage==="fin" && <FinPage  sess={sess} reloadTick={reloadTick}/>}
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
          <input type="password" value={lf.password} onChange={e=>setLf(f=>({...f,password:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&login()}
            placeholder="••••••••"
            style={{width:"100%",padding:"13px 14px",borderRadius:10,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(201,168,76,0.22)",color:"#dcc88a",fontSize:14,outline:"none",boxSizing:"border-box",fontFamily:"inherit"}}/>
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
function CalPage({sess,reload,reloadTick,addLog}) {
  const [start,setStart]=useState(todayY());
  const [ndays,setNdays]=useState(14);
  const [det,setDet]=useState(null);
  const [cars,setCars]=useState([]);
  const [reses,setReses]=useState([]);
  const [loading,setLoading]=useState(true);
  const td=todayY();
  const dates=Array.from({length:ndays},(_,i)=>addD(start,i));

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("reservations","status=neq.Anuluar",sess.token)
    ]).then(([c,r])=>{setCars(c);setReses(r);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  function resStart(carName,dt) { return reses.find(r=>r.car_name===carName&&r.date_from===dt); }
  function rowSpan(r,ri) { let s=0; for(let i=ri;i<dates.length;i++){if(dates[i]>=r.date_from&&dates[i]<=r.date_to)s++;else if(dates[i]>r.date_to)break;} return s||1; }
  function covered(carName,dt) { return reses.some(r=>r.car_name===carName&&dt>r.date_from&&dt<=r.date_to); }
  const MONTH_SQ=["Jan","Shk","Mar","Pri","Maj","Qer","Kor","Gus","Sht","Tet","Nën","Dhj"];

  if(loading) return <Spin/>;

  return (
    <div style={{padding:14,background:"#f8fafc",minHeight:"100%"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <div><h2 style={{margin:0,fontSize:18,fontWeight:800,color:"#0f172a"}}>📅 Disponueshmëria</h2><p style={{margin:"2px 0 0",fontSize:12,color:"#94a3b8"}}>Kliko rezervim për detaje</p></div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:6,alignItems:"center",background:"#fff",border:"1px solid #e2e8f0",borderRadius:10,padding:"4px 6px"}}>
          <button onClick={()=>setStart(addD(start,-ndays))} style={{border:"none",background:"#f1f5f9",borderRadius:7,width:30,height:30,cursor:"pointer",fontSize:14,fontWeight:700}}>‹</button>
          <button onClick={()=>setStart(todayY())} style={{border:"none",background:"#1d4ed8",borderRadius:7,padding:"0 12px",height:30,cursor:"pointer",fontSize:12,fontWeight:700,color:"#fff"}}>Sot</button>
          <button onClick={()=>setStart(addD(start,ndays))} style={{border:"none",background:"#f1f5f9",borderRadius:7,width:30,height:30,cursor:"pointer",fontSize:14,fontWeight:700}}>›</button>
        </div>
        <select value={ndays} onChange={e=>setNdays(Number(e.target.value))} style={{padding:"7px 12px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit",background:"#fff"}}>
          {[7,14,21,30].map(n=><option key={n} value={n}>{n} ditë</option>)}
        </select>
      </div>

      <div style={{overflowX:"auto",borderRadius:14,boxShadow:"0 4px 24px rgba(15,23,42,0.10)",border:"1px solid #d1d5db",WebkitOverflowScrolling:"touch",background:"#fff"}}>
        <table style={{borderCollapse:"collapse",tableLayout:"fixed",minWidth:64+cars.length*115}}>
          <thead>
            <tr>
              {/* Corner */}
              <th style={{width:58,minWidth:58,background:"#111827",padding:"12px 4px",fontSize:9,fontWeight:700,textAlign:"center",color:"#9ca3af",letterSpacing:1,position:"sticky",left:0,top:0,zIndex:6,borderRight:"2px solid #374151",borderBottom:"2px solid #374151"}}>
                DATA
              </th>
              {cars.map(car=>{
                const cc=carColor(car.name,cars.map(c=>c.name));
                return (
                  <th key={car.id} style={{width:115,minWidth:115,background:cc.bg,padding:"8px 6px",textAlign:"center",borderLeft:"1px solid #e5e7eb",borderBottom:"3px solid "+cc.ac,borderRight:"1px solid #e5e7eb"}}>
                    {car.photo_url
                      ? <img src={car.photo_url} alt={car.name} style={{width:38,height:26,objectFit:"cover",borderRadius:5,display:"block",margin:"0 auto 3px",boxShadow:"0 1px 4px rgba(0,0,0,0.15)"}}/>
                      : <div style={{fontSize:18,marginBottom:2}}>🚗</div>
                    }
                    <div style={{fontSize:9,fontWeight:800,color:cc.tx,lineHeight:1.3,letterSpacing:"0.3px"}}>{car.name}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {dates.map((dt,di)=>{
              const isT=dt===td, isW=isWE(dt);
              const d=new Date(dt);
              const isFirstOfMonth=d.getDate()===1;
              const monthBorder=isFirstOfMonth?"2px solid #9ca3af":"1px solid #e5e7eb";
              return (
                <tr key={dt} style={{borderBottom:monthBorder}}>
                  {/* DATE cell — sticky left, dark */}
                  <td style={{
                    padding:"0 4px",height:48,textAlign:"center",
                    background:isT?"#1d4ed8":isW?"#374151":"#1f2937",
                    borderRight:"2px solid #374151",
                    borderBottom:isFirstOfMonth?"2px solid #6b7280":"1px solid #374151",
                    position:"sticky",left:0,zIndex:2
                  }}>
                    <div style={{fontSize:9,color:isT?"#bfdbfe":isW?"#9ca3af":"#6b7280",fontWeight:600}}>{dow(dt)}</div>
                    <div style={{fontSize:13,fontWeight:800,color:isT?"#fff":isW?"#d1d5db":"#f3f4f6",lineHeight:1.1}}>{fmtD(dt)}</div>
                    {isFirstOfMonth&&<div style={{fontSize:8,color:isT?"#93c5fd":"#9ca3af",fontWeight:700,marginTop:1,letterSpacing:0.5}}>{MONTH_SQ[d.getMonth()]}</div>}
                  </td>

                  {cars.map(car=>{
                    if(covered(car.name,dt)) return null;
                    const r=resStart(car.name,dt);
                    const cc=carColor(car.name,cars.map(c=>c.name));

                    if(r){
                      const sp=rowSpan(r,di);
                      const isPaid=r.payment_status==="paguar";
                      const isDone=r.status==="Përfunduar";
                      const isPending=!isPaid&&!isDone;
                      const cardBg=isDone?"#f9fafb":isPaid?"#f0fdf4":"#fffbeb";
                      const cardBorder=isDone?"#d1d5db":isPaid?"#4ade80":"#fcd34d";
                      const cardText=isDone?"#4b5563":isPaid?"#14532d":"#78350f";
                      const accentColor=isDone?"#9ca3af":isPaid?"#16a34a":"#f59e0b";

                      return (
                        <td key={car.id} rowSpan={sp} style={{
                          padding:"3px",
                          verticalAlign:"top",
                          borderLeft:"1px solid #e5e7eb",
                          borderRight:"1px solid #e5e7eb",
                          borderBottom:"1px solid "+cardBorder+"55",
                          background:cardBg,
                        }}>
                          <div onClick={()=>setDet(r)} style={{
                            height:sp*48-8,
                            background:"#fff",
                            border:"1.5px solid "+cardBorder,
                            borderLeft:"4px solid "+accentColor,
                            borderRadius:8,
                            padding:"6px 7px",
                            cursor:"pointer",
                            boxShadow:"0 1px 6px rgba(0,0,0,0.07)",
                            display:"flex",
                            flexDirection:"column",
                            position:"relative",
                            overflow:"hidden",
                          }}>
                            {/* Separator line + centered dot per day */}
                            {sp>1&&Array.from({length:sp-1}).map((_,ri)=>(
                              <div key={ri}>
                                <div style={{
                                  position:"absolute",
                                  left:4,right:4,
                                  top:(ri+1)*48-1,
                                  height:1,
                                  background:accentColor+"33",
                                }}/>
                                <div style={{
                                  position:"absolute",
                                  left:"50%",transform:"translateX(-50%)",
                                  top:(ri+1)*48-5,
                                  width:10,height:10,
                                  borderRadius:"50%",
                                  background:accentColor,
                                  boxShadow:"0 0 6px "+accentColor+"99",
                                  zIndex:2,
                                }}/>
                              </div>
                            ))}
                            {/* Content */}
                            <div style={{display:"flex",alignItems:"center",gap:5}}>
                              <div style={{width:8,height:8,borderRadius:"50%",background:accentColor,flexShrink:0}}/>
                              <span style={{fontWeight:800,fontSize:12,color:cardText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(r.client_name||"").split(" ")[0]}</span>
                            </div>
                            {sp>=2&&<>
                              <div style={{fontSize:9,color:cardText,opacity:0.65,marginTop:2}}>{fmtD(r.date_from)} → {fmtD(r.date_to)}</div>
                              <div style={{fontSize:12,fontWeight:800,color:cardText,marginTop:2}}>{fmtM(r.total_price,r.currency)}</div>
                              <div style={{display:"flex",gap:3,marginTop:3,flexWrap:"wrap"}}>
                                <span style={{fontSize:9,padding:"2px 6px",borderRadius:20,background:accentColor+"18",color:cardText,fontWeight:700,border:"1px solid "+accentColor+"44"}}>{r.status}</span>
                                {isPending&&<span style={{fontSize:9,padding:"2px 5px",borderRadius:20,background:"#fef3c7",color:"#92400e",fontWeight:700}}>⏳</span>}
                              </div>
                            </>}
                          </div>
                        </td>
                      );
                    }

                    /* Empty cell - covered by ongoing reservation */
                    const isActive=reses.some(r=>r.car_name===car.name&&r.status!=="Anuluar"&&dt>=r.date_from&&dt<=r.date_to);
                    const activeRes=reses.find(r=>r.car_name===car.name&&r.status!=="Anuluar"&&dt>=r.date_from&&dt<=r.date_to);
                    const activePaid=activeRes?.payment_status==="paguar";
                    const activeDone=activeRes?.status==="Përfunduar";
                    const dotColor=activeDone?"#9ca3af":activePaid?"#16a34a":"#f59e0b";
                    const cellBg=isActive?(activeDone?"#f9fafb":activePaid?"#f0fdf4":"#fffbeb"):(isT?"#eff6ff":isW?"#f9fafb":"#fff");
                    return (
                      <td key={car.id} style={{
                        height:48,
                        borderLeft:"1px solid #e5e7eb",
                        borderRight:"1px solid #e5e7eb",
                        borderBottom:isFirstOfMonth?"2px solid #d1d5db":"1px solid #e5e7eb",
                        background:cellBg,
                        verticalAlign:"middle",
                        textAlign:"center",
                      }}>
                        {isActive&&(
                          <div style={{
                            width:10,height:10,borderRadius:"50%",
                            background:dotColor,
                            margin:"0 auto",
                            boxShadow:"0 0 8px "+dotColor+"bb",
                          }}/>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap",alignItems:"center"}}>
        {[["#16a34a","#dcfce7","Paguar"],["#f59e0b","#fef3c7","Pritje pagese"],["#94a3b8","#f3f4f6","Përfunduar"],["#60a5fa","#eff6ff","Sot"]].map(([ac,bg,lb])=>(
          <div key={lb} style={{display:"flex",alignItems:"center",gap:6,fontSize:11,background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:"4px 12px",boxShadow:"0 1px 3px rgba(0,0,0,0.04)"}}>
            <div style={{width:10,height:10,borderRadius:3,background:bg,border:"2px solid "+ac}}/>
            <span style={{color:"#374151",fontWeight:500}}>{lb}</span>
          </div>
        ))}
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:11,background:"#fff",border:"1px solid #e2e8f0",borderRadius:20,padding:"4px 12px"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:"#60a5fa"}}/>
          <span style={{color:"#374151",fontWeight:500}}>Pike = ka rezervim</span>
        </div>
      </div>

      {det&&<DetModal r={det} sess={sess} addLog={addLog} reload={reload} onClose={()=>setDet(null)} onUpd={u=>setDet(u)}/>}
    </div>
  );
}

// ─── DETAIL MODAL ─────────────────────────────────────────────────────────────
function DetModal({r,sess,addLog,reload,onClose,onUpd}) {
  const [cur,setCur]=useState(r);
  const [cn,setCn]=useState(r.cond_note||"");
  const [rn,setRn]=useState(r.ret_note||"");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

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
  async function addToLedger(amount,currency,type,desc){
    try {
      await sbAuthPost("cash_ledger",{
        currency,
        amount:Number(amount),
        type,
        description:desc,
        created_by:sess.profile?.username||""
      }, sess.token);
    } catch(e){ console.error("addToLedger ERROR:", e.message); }
  }
  async function doDeliver(){
    const now=new Date().toISOString(), time=new Date().toTimeString().slice(0,5);
    await patch({status:"Dorëzuar",deliv_at:now,deliv_by:sess.profile?.username,deliv_time:time});
    addLog("Dorëzim",cur.car_name+" → "+cur.client_name);
  }
  async function doCollect(){
    // Mos shto ne arke nese eshte paguar tashme
    if(cur.payment_status==="paguar") return;
    const now=new Date().toISOString();
    await patch({payment_status:"paguar",paid_at:now,paid_by:sess.profile?.username});
    await addToLedger(cur.total_price,cur.currency,"payment","Pagesë: "+cur.car_name+" - "+cur.client_name);
    addLog("Arkëtim",cur.car_name+" "+fmtM(cur.total_price,cur.currency));
  }
  async function doDeliverPay(){
    // Mos shto ne arke nese eshte paguar tashme
    if(cur.payment_status==="paguar") return;
    const now=new Date().toISOString(), time=new Date().toTimeString().slice(0,5);
    await patch({status:"Dorëzuar",deliv_at:now,deliv_by:sess.profile?.username,deliv_time:time,payment_status:"paguar",paid_at:now,paid_by:sess.profile?.username});
    await addToLedger(cur.total_price,cur.currency,"payment","Pagesë: "+cur.car_name+" - "+cur.client_name);
    addLog("Dorëzim+Arkëtim",cur.car_name+" "+fmtM(cur.total_price,cur.currency));
  }
  async function doReturn(){
    const now=new Date().toISOString(), time=new Date().toTimeString().slice(0,5);
    await patch({status:"Përfunduar",ret_at:now,ret_by:sess.profile?.username,ret_time:time,ret_note:rn,cond_note:cn});
    addLog("Marrje",cur.car_name+" ← "+cur.client_name);
  }
  async function saveNotes(){
    await patch({cond_note:cn,ret_note:rn});
    addLog("Shënime",cur.car_name);
    setSaved(true); setTimeout(()=>setSaved(false),1200);
  }

  const paid=cur.payment_status==="paguar";
  const done=cur.status==="Anuluar"||cur.status==="Përfunduar";

  return (
    <Modal title={cur.car_name} onClose={onClose}>
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

      <div style={{padding:"10px 14px",borderRadius:9,marginBottom:12,background:paid?"#dcfce7":"#fef3c7",border:"1px solid "+(paid?"#bbf7d0":"#fde68a")}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:18}}>{paid?"✅":"⏳"}</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:13,color:paid?"#166534":"#92400e"}}>{paid?"Paguar":"Pagesa në pritje"}</div>
            {cur.paid_at&&<div style={{fontSize:11,color:"#64748b"}}>{new Date(cur.paid_at).toLocaleString("sq-AL")} · {cur.paid_by}</div>}
          </div>
          {!paid&&!done&&<button onClick={doCollect} disabled={saving} style={{...PB,background:"#16a34a",fontSize:12,padding:"6px 12px"}}>💵 Arkëto</button>}
        </div>
      </div>

      {!done&&(
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          {(cur.status==="Konfirmuar"||cur.status==="Aktive")&&<>
            {!paid&&<button onClick={doDeliverPay} disabled={saving} style={{...PB,flex:1,fontSize:12}}>🔑 Dorëzo + Arkëto</button>}
            <button onClick={doDeliver} disabled={saving} style={{...PB,flex:1,background:"#7c3aed",fontSize:12}}>🔑 Vetëm Dorëzo</button>
          </>}
          {cur.status==="Dorëzuar"&&!paid&&<button onClick={doCollect} disabled={saving} style={{...PB,background:"#16a34a",flex:1,fontSize:12}}>💵 Arkëto Pagesen</button>}
          {cur.status==="Dorëzuar"&&<button onClick={doReturn} disabled={saving} style={{...PB,background:"#059669",flex:1,fontSize:12}}>🏁 Merr Makinën</button>}
        </div>
      )}

      {cur.deliv_at&&<div style={{fontSize:11,color:"#64748b",marginBottom:4}}>🔑 Dorëzuar: {new Date(cur.deliv_at).toLocaleString("sq-AL")}{cur.deliv_time?" ora "+cur.deliv_time:""} · {cur.deliv_by}</div>}
      {cur.ret_at&&<div style={{fontSize:11,color:"#64748b",marginBottom:8}}>🏁 Marrë: {new Date(cur.ret_at).toLocaleString("sq-AL")}{cur.ret_time?" ora "+cur.ret_time:""} · {cur.ret_by}</div>}

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
function ResPage({sess,reload,reloadTick,addLog}) {
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
  const empty={car_name:"",client_name:"",client_phone:"",client_id_card:"",date_from:"",date_to:"",pickup_time:"10:00",return_time:"10:00",price_per_day:"",currency:"ALL",total_price:"",status:"Konfirmuar",payment_status:"pritje",notes:""};
  const [form,setForm]=useState(empty);
  const nd=diffDays(form.date_from,form.date_to);

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("reservations","",sess.token),
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("clients","order=name.asc",sess.token)
    ]).then(([r,c,cl])=>{setReses(r);setCars(c);setClients(cl);setLoading(false);}).catch(e=>{setErr(e.message);setLoading(false);});
  },[reloadTick,sess.token]);

  useEffect(()=>{
    if(form.price_per_day&&nd>0) setForm(f=>({...f,total_price:(Number(f.price_per_day)*nd).toFixed(0)}));
  },[form.price_per_day,form.date_from,form.date_to]);

  async function doSave(){
    if(!form.car_name||!form.client_name||!form.total_price){alert("Plotëso fushat e detyrueshme");return;}
    if(!form.date_from||!form.date_to){alert("Zgjidh datat e rezervimit");return;}
    if(form.date_to < form.date_from){
      alert("Data e kthimit nuk mund të jetë para datës së marrjes! Kontrollo datat e zgjedhura.");
      return;
    }
    try {
      // Kontrollo disponueshmërinë e makinës
      const conflicts = reses.filter(r => {
        if(r.car_name !== form.car_name) return false;
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
      const body={...form,price_per_day:Number(form.price_per_day),total_price:Number(form.total_price),created_by:sess.profile?.username};
      if(editId){
        await sbAuthPatch("reservations",editId,body,sess.token);
        addLog("Ndrysho Rezervim",form.car_name+" - "+form.client_name);
      } else {
        await sbAuthPost("reservations",body,sess.token);
        addLog("Shto Rezervim",form.car_name+" - "+form.client_name+" "+fmtM(form.total_price,form.currency));
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
    <div style={{padding:14,maxWidth:1100,margin:"0 auto"}}>
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
                <div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>{r.car_name}</div>
                <div style={{fontSize:15,fontWeight:800,color:"#1d4ed8",flexShrink:0}}>{fmtM(r.total_price,r.currency)}</div>
              </div>
              <div style={{fontSize:13,color:"#374151",marginTop:2}}>👤 {r.client_name}{r.client_phone&&<span style={{color:"#94a3b8"}}> · {r.client_phone}</span>}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:3}}>{fmtFull(r.date_from)}{r.pickup_time&&" "+r.pickup_time} → {fmtFull(r.date_to)}{r.return_time&&" "+r.return_time} · {diffDays(r.date_from,r.date_to)} ditë</div>
              <div style={{display:"flex",gap:6,marginTop:6,alignItems:"center",flexWrap:"wrap"}}>
                <Badge s={r.status}/>
                <span style={{padding:"2px 8px",borderRadius:20,fontSize:10,fontWeight:700,background:r.payment_status==="paguar"?"#dcfce7":"#fef3c7",color:r.payment_status==="paguar"?"#166534":"#92400e"}}>{r.payment_status==="paguar"?"✅ Paguar":"⏳ Pritje"}</span>
                <div style={{flex:1}}/>
                <button onClick={()=>setDetId(r.id)} style={{...IB,background:"#eff6ff",color:"#1d4ed8",fontWeight:700,fontSize:12,padding:"5px 10px"}}>🔍</button>
                <button onClick={()=>{setForm({car_name:r.car_name,client_name:r.client_name,client_phone:r.client_phone||"",client_id_card:r.client_id_card||"",date_from:r.date_from,date_to:r.date_to,pickup_time:r.pickup_time||"10:00",return_time:r.return_time||"10:00",price_per_day:r.price_per_day,currency:r.currency,total_price:r.total_price,status:r.status,payment_status:r.payment_status,notes:r.notes||""});setEditId(r.id);setShowF(true)}} style={{...IB,fontSize:12,padding:"5px 10px"}}>✏️</button>
                {sess.profile?.role==="admin"&&<button onClick={()=>doDel(r.id)} style={{...IB,color:"#dc2626",fontSize:12,padding:"5px 10px"}}>🗑️</button>}
              </div>
            </div>
          </div>;
        })
      }

      {showF&&<Modal title={editId?"Ndrysho Rezervim":"Rezervim i Ri"} onClose={()=>setShowF(false)} wide>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Klienti *" col2>
            <input value={form.client_name} onChange={e=>setForm(f=>({...f,client_name:e.target.value}))} style={FL} placeholder="Emri Mbiemri" list="clients-list"/>
            <datalist id="clients-list">{clients.map(c=><option key={c.id} value={c.name}/>)}</datalist>
          </Fld>
          <Fld label="Telefoni"><input value={form.client_phone} onChange={e=>setForm(f=>({...f,client_phone:e.target.value}))} style={FL}/></Fld>
          <Fld label="Nr. ID"><input value={form.client_id_card} onChange={e=>setForm(f=>({...f,client_id_card:e.target.value}))} style={FL}/></Fld>
          <Fld label="Makina *" col2><select value={form.car_name} onChange={e=>setForm(f=>({...f,car_name:e.target.value}))} style={FL}>{carNames.map(c=><option key={c}>{c}</option>)}</select></Fld>
          <Fld label="Nga Data *"><input type="date" value={form.date_from} onChange={e=>setForm(f=>({...f,date_from:e.target.value}))} style={FL}/></Fld>
          <Fld label="Ora Marrjes"><input type="time" value={form.pickup_time} onChange={e=>setForm(f=>({...f,pickup_time:e.target.value}))} style={FL}/></Fld>
          <Fld label="Deri Data *"><input type="date" value={form.date_to} min={form.date_from||undefined} onChange={e=>setForm(f=>({...f,date_to:e.target.value}))} style={FL}/></Fld>
          <Fld label="Ora Dorëzimit"><input type="time" value={form.return_time} onChange={e=>setForm(f=>({...f,return_time:e.target.value}))} style={FL}/></Fld>
          <Fld label="Km kur u dha"><input type="number" value={form.km_out||""} onChange={e=>setForm(f=>({...f,km_out:e.target.value}))} style={FL} placeholder="p.sh. 45200"/></Fld>
          <Fld label="Km kur u kthye"><input type="number" value={form.km_in||""} onChange={e=>setForm(f=>({...f,km_in:e.target.value}))} style={FL} placeholder="p.sh. 46800"/></Fld>
          {form.car_name&&form.date_from&&form.date_to&&(()=>{
            const cf=reses.filter(r=>r.car_name===form.car_name&&r.status!=="Anuluar"&&r.status!=="Përfunduar"&&(!editId||r.id!==editId)&&form.date_from<=r.date_to&&form.date_to>=r.date_from);
            return cf.length>0?<div style={{gridColumn:"span 2",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"10px 14px",fontSize:13,color:"#dc2626",fontWeight:600}}>
              ⚠️ Makina e zënë: {cf.map(r=>r.client_name+" ("+fmtFull(r.date_from)+" - "+fmtFull(r.date_to)+")").join(", ")}
            </div>:null;
          })()}
          <Fld label={"Çmim/Ditë ("+nd+" d)"}><input type="number" value={form.price_per_day} onChange={e=>setForm(f=>({...f,price_per_day:e.target.value}))} style={FL}/></Fld>
          <Fld label="Monedha"><select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>
          <Fld label="Totali *" col2><input type="number" value={form.total_price} onChange={e=>setForm(f=>({...f,total_price:e.target.value}))} style={{...FL,fontWeight:700}}/></Fld>
          <Fld label="Statusi"><select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={FL}>{Object.keys(SC).map(s=><option key={s}>{s}</option>)}</select></Fld>
          <Fld label="Pagesa"><select value={form.payment_status} onChange={e=>setForm(f=>({...f,payment_status:e.target.value}))} style={FL}><option value="pritje">Pritje</option><option value="paguar">Paguar</option></select></Fld>
          <Fld label="Shënime" col2><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{...FL,height:50,resize:"vertical"}}/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button onClick={()=>setShowF(false)} style={CB}>Anulo</button>
          <button onClick={doSave} style={PB}>💾 Ruaj</button>
        </div>
      </Modal>}
      {detR&&<DetModal r={detR} sess={sess} addLog={addLog} reload={reload} onClose={()=>setDetId(null)} onUpd={u=>{setDetId(u.id);setReses(rs=>rs.map(x=>x.id===u.id?u:x));}}/>}
    </div>
  );
}

// ─── FINANCE ─────────────────────────────────────────────────────────────────
function FinPage({sess,reloadTick}) {
  const [reses,setReses]=useState([]);
  const [exps,setExps]=useState([]);
  const [cars,setCars]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    setLoading(true);
    Promise.all([sbAuthGet("reservations","",sess.token),sbAuthGet("expenses","",sess.token),sbAuthGet("cars","order=sort_order.asc",sess.token)])
      .then(([r,e,c])=>{setReses(r);setExps(e);setCars(c);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  if(loading) return <Spin/>;

  const paid=reses.filter(r=>r.payment_status==="paguar"&&r.status!=="Anuluar");
  const incL=paid.filter(r=>r.currency==="ALL").reduce((s,r)=>s+Number(r.total_price),0);
  const incE=paid.filter(r=>r.currency==="EUR").reduce((s,r)=>s+Number(r.total_price),0);
  const expL=exps.filter(e=>e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0);
  const expE=exps.filter(e=>e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0);
  const carNames=cars.map(c=>c.name);
  const maxInc=Math.max(...carNames.map(cn=>paid.filter(r=>r.car_name===cn).reduce((s,r)=>s+Number(r.total_price)*(r.currency==="EUR"?108:1),0)),1);

  return (
    <div style={{padding:14,maxWidth:1000,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 16px",fontSize:17,fontWeight:700,color:"#0f172a"}}>📊 Raportet Financiare</h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:10,marginBottom:16}}>
        {[["#0f172a","🇦🇱 LEKË",incL,expL,true],["#064e3b","🇪🇺 EURO",incE,expE,false]].map(([hbg,title,inc,exp,isL],i)=>(
          <div key={i} style={{background:"#fff",border:"2px solid #e2e8f0",borderRadius:14,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"}}>
            <div style={{background:hbg,color:"#fff",padding:"10px 16px",fontWeight:700,fontSize:14}}>{title}</div>
            <div style={{padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
              {[["Të Ardhura (paguar)",inc,"#1d4ed8"],["Shpenzime",exp,"#dc2626"],["BALANCA",inc-exp,(inc-exp)>=0?"#16a34a":"#dc2626"]].map(([lb,val,col],j)=>(
                <div key={lb} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingTop:j===2?10:0,borderTop:j===2?"1px solid #e2e8f0":"none"}}>
                  <span style={{fontSize:13,color:"#64748b",fontWeight:j===2?700:400}}>{lb}</span>
                  <span style={{fontSize:j===2?17:14,fontWeight:j===2?800:700,color:col}}>{isL?val.toLocaleString("sq-AL")+" L":"€"+val.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:20,marginBottom:16}}>
        <h3 style={{margin:"0 0 16px",fontSize:15,fontWeight:700,color:"#0f172a"}}>🚗 Të Ardhura Sipas Makinës</h3>
        {carNames.map(cn=>{
          const carReses=paid.filter(r=>r.car_name===cn);
          const iL=carReses.filter(r=>r.currency==="ALL").reduce((s,r)=>s+Number(r.total_price),0);
          const iE=carReses.filter(r=>r.currency==="EUR").reduce((s,r)=>s+Number(r.total_price),0);
          const eL=exps.filter(e=>e.car_name===cn&&e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0);
          const eE=exps.filter(e=>e.car_name===cn&&e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0);
          const totalInc=iL+iE*108;
          const pct=Math.round(totalInc/maxInc*100);
          const cc=carColor(cn,carNames);
          const allR=reses.filter(r=>r.car_name===cn&&r.status!=="Anuluar");
          const totalDays=allR.reduce((s,r)=>s+diffDays(r.date_from,r.date_to),0);
          return <div key={cn} style={{marginBottom:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:700,color:cc.tx}}>{cn}</span>
              <div style={{display:"flex",gap:12,fontSize:12}}>
                {iL>0&&<span style={{color:"#1d4ed8",fontWeight:700}}>{iL.toLocaleString("sq-AL")} L</span>}
                {iE>0&&<span style={{color:"#059669",fontWeight:700}}>€{iE.toFixed(2)}</span>}
                <span style={{color:"#94a3b8"}}>{carReses.length} rez · {totalDays} ditë</span>
              </div>
            </div>
            <div style={{background:"#f1f5f9",borderRadius:20,height:10,overflow:"hidden"}}>
              <div style={{width:pct+"%",height:"100%",background:"linear-gradient(90deg,"+cc.ac+","+cc.bg+")",borderRadius:20}}/>
            </div>
            {(eL>0||eE>0)&&<div style={{fontSize:11,color:"#dc2626",marginTop:2}}>Shpenzime: {eL>0?eL.toLocaleString("sq-AL")+" L":""}{eE>0?" €"+eE.toFixed(2):""}</div>}
          </div>;
        })}
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,padding:20,marginBottom:16}}>
        <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:700,color:"#0f172a"}}>📈 Statistika</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:10}}>
          {[["Rezervime","Totale",reses.filter(r=>r.status!=="Anuluar").length,"#1d4ed8"],["✅","Paguar",paid.length,"#16a34a"],["⏳","Pritje",reses.filter(r=>r.payment_status==="pritje"&&r.status!=="Anuluar").length,"#d97706"],["📤","Shpenzime",exps.length,"#dc2626"]].map(([ic,lb,val,col])=>(
            <div key={lb} style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",textAlign:"center",border:"1px solid #e2e8f0"}}>
              <div style={{fontSize:22,fontWeight:800,color:col}}>{val}</div>
              <div style={{fontSize:11,color:"#64748b",marginTop:2,fontWeight:500}}>{lb}</div>
            </div>
          ))}
        </div>
      </div>

      {/* OCCUPANCY CHART per car per month */}
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
              <div style={{fontSize:10,fontWeight:800,color:cc.tx,marginTop:8,lineHeight:1.3}}>{cn}</div>
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
function ArkPage({sess,reload,reloadTick,addLog}) {
  const [ledger,setLedger]=useState([]);
  const [exps,setExps]=useState([]);
  const [cars,setCars]=useState([]);
  const [loading,setLoading]=useState(true);
  const [arkTab,setArkTab]=useState("lek");
  const [dateFrom,setDateFrom]=useState("");
  const [dateTo,setDateTo]=useState("");
  const [showA,setShowA]=useState(false);
  const [showT,setShowT]=useState(false);
  const [showE,setShowE]=useState(false);
  const [af,setAf]=useState({amount:"",currency:"ALL",description:"",type:"in"});
  const [tf,setTf]=useState({from:"ALL",amount:"",rate:"108"});
  const [ef,setEf]=useState({description:"",amount:"",currency:"ALL",category:"Mirëmbajtje",car_name:"",expense_date:todayY()});

  useEffect(()=>{
    setLoading(true);
    Promise.all([sbAuthGet("cash_ledger","",sess.token),sbAuthGet("expenses","",sess.token),sbAuthGet("cars","order=sort_order.asc",sess.token)])
      .then(([l,e,c])=>{setLedger(l);setExps(e);setCars(c);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  // Compute balances from ledger
  const cashLek=ledger.filter(l=>l.currency==="ALL").reduce((s,l)=>s+Number(l.amount),0);
  const cashEur=ledger.filter(l=>l.currency==="EUR").reduce((s,l)=>s+Number(l.amount),0);

  async function doAdd(){
    if(!af.amount) return;
    const a=Number(af.amount)*(af.type==="in"?1:-1);
    try {
      await sbAuthPost("cash_ledger",{currency:af.currency,amount:a,type:af.type==="in"?"manual_in":"manual_out",description:af.description,created_by:sess.profile?.username},sess.token);
      addLog("Arkë "+(af.type==="in"?"Hyrje":"Dalje"),fmtM(Math.abs(a),af.currency)+" - "+af.description);
      reload(); setShowA(false); setAf({amount:"",currency:"ALL",description:"",type:"in"});
    } catch(e){alert(e.message);}
  }
  async function doTransfer(){
    const a=Number(tf.amount), rate=Number(tf.rate);
    if(!a||!rate) return;
    try {
      if(tf.from==="ALL"){
        await sbAuthPost("cash_ledger",{currency:"ALL",amount:-a,type:"transfer",description:"Kalim → EUR (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        await sbAuthPost("cash_ledger",{currency:"EUR",amount:a/rate,type:"transfer",description:"Kalim ← ALL (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        addLog("Kalim Arke",a.toLocaleString()+" L → €"+(a/rate).toFixed(2));
      } else {
        await sbAuthPost("cash_ledger",{currency:"EUR",amount:-a,type:"transfer",description:"Kalim → ALL (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        await sbAuthPost("cash_ledger",{currency:"ALL",amount:a*rate,type:"transfer",description:"Kalim ← EUR (kurs "+rate+")",created_by:sess.profile?.username},sess.token);
        addLog("Kalim Arke","€"+a+" → "+(a*rate).toLocaleString()+" L");
      }
      reload(); setShowT(false); setTf({from:"ALL",amount:"",rate:"108"});
    } catch(e){alert(e.message);}
  }
  async function doAddExp(){
    if(!ef.description||!ef.amount) return;
    const a=Number(ef.amount);
    try {
      await sbAuthPost("expenses",{...ef,amount:a,created_by:sess.profile?.username},sess.token);
      await sbAuthPost("cash_ledger",{currency:ef.currency,amount:-a,type:"expense",description:"Shpenzim: "+ef.description+(ef.car_name?" ("+ef.car_name+")":""),created_by:sess.profile?.username},sess.token);
      addLog("Shto Shpenzim",ef.description+" "+fmtM(a,ef.currency));
      reload(); setShowE(false); setEf({description:"",amount:"",currency:"ALL",category:"Mirëmbajtje",car_name:"",expense_date:todayY()});
    } catch(e){alert(e.message);}
  }
  async function delExp(id){
    const e=exps.find(x=>x.id===id);
    if(!e) return;
    try {
      await sbAuthDelete("expenses",id,sess.token);
      await sbAuthPost("cash_ledger",{currency:e.currency,amount:Number(e.amount),type:"manual_in",description:"Anulim shpenzimi: "+e.description,created_by:sess.profile?.username},sess.token);
      addLog("Fshi Shpenzim",e.description);
      reload();
    } catch(ex){alert(ex.message);}
  }

  // Build statement rows - sorted ascending for running balance
  const curCur=arkTab==="lek"?"ALL":"EUR";
  const isL=curCur==="ALL";
  const allCurRows=ledger.filter(l=>l.currency===curCur).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
  // Opening balance = sum of all rows BEFORE dateFrom
  const openingBal=dateFrom
    ? allCurRows.filter(l=>l.created_at&&l.created_at.slice(0,10)<dateFrom).reduce((s,l)=>s+Number(l.amount),0)
    : 0;
  // Rows within period
  const rows=allCurRows.filter(l=>{
    const d=l.created_at?l.created_at.slice(0,10):"";
    if(dateFrom&&d<dateFrom) return false;
    if(dateTo&&d>dateTo) return false;
    return true;
  });
  const rowTotal=rows.reduce((s,l)=>s+Number(l.amount),0);
  const closingBal=openingBal+rowTotal;

  // Compute running balance for display
  function getRowsWithBalance(){
    let bal=openingBal;
    return rows.map(r=>{
      bal+=Number(r.amount);
      return {...r, runBal:bal};
    });
  }

  function fmt2(v){ return isL?v.toLocaleString("sq-AL")+" L":"€"+Math.abs(v).toFixed(2); }
  function fmtSigned(v){ return (v>=0?"+":"-")+(isL?Math.abs(v).toLocaleString("sq-AL")+" L":"€"+Math.abs(v).toFixed(2)); }

  function exportCSV(){
    const nl="\n";
    const rowsBal=getRowsWithBalance();
    let csv="Data,Lloji,Përshkrimi,Debi,Kredi,Gjendje"+nl;
    if(dateFrom) csv+='"'+(dateFrom||"")+'","","Gjendje Hapëse","","","'+fmt2(openingBal)+'"'+nl;
    rowsBal.forEach(r=>{
      const pos=Number(r.amount)>=0;
      const debi=pos?"":Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":"");
      const kredi=pos?Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":""):"";
      const bal=fmt2(r.runBal);
      const dt=r.created_at?r.created_at.slice(0,10):"";
      csv+='"'+dt+'","'+r.type+'","'+(r.description||"")+'","'+debi+'","'+kredi+'","'+bal+'"'+nl;
    });
    csv+=nl+'"","","Gjendje Mbyllëse","","","'+fmt2(closingBal)+'"';
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="statement_"+(isL?"lek":"eur")+"_"+todayY()+".csv"; a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF(){
    const rowsBal=getRowsWithBalance();
    const closeBg=closingBal>=0?"#dcfce7":"#fee2e2";
    const closeCol=closingBal>=0?"#166534":"#991b1b";
    const period=(dateFrom||dateTo)
      ?('<p style="margin:4px 0 0;opacity:.8;font-size:13px">Periudha: '+(dateFrom||"fillimi")+" → "+(dateTo||"sot")+"</p>")
      :"";

    // Opening row
    const openRow=dateFrom
      ?('<tr style="background:#f0f9ff;border-bottom:2px solid #bfdbfe"><td colspan="3" style="padding:10px;font-size:12px;font-weight:700;color:#1e40af">Gjendje Hapëse ('+(dateFrom)+')</td>'
        +'<td style="padding:10px;font-size:13px;font-weight:800;color:#1e40af;text-align:right">'+fmt2(openingBal)+'</td></tr>')
      :"";

    const rowsHtml=rowsBal.map((r,i)=>{
      const pos=Number(r.amount)>=0;
      const color=pos?"#166534":"#991b1b";
      const bg=i%2===0?"#fff":"#f9fafb";
      const dt=r.created_at?r.created_at.slice(0,10):"";
      const debi=pos?"":('<span style="color:#991b1b;font-weight:700">-'+Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":"€")+'</span>');
      const kredi=pos?('<span style="color:#166534;font-weight:700">+'+Math.abs(Number(r.amount)).toFixed(isL?0:2)+(isL?" L":"€")+'</span>'):"";
      const balColor=r.runBal>=0?"#1e40af":"#991b1b";
      return '<tr style="background:'+bg+'">'
        +'<td style="padding:8px 10px;font-size:11px;color:#64748b;white-space:nowrap">'+dt+'</td>'
        +'<td style="padding:8px;font-size:11px;color:#374151">'+r.type+'</td>'
        +'<td style="padding:8px;font-size:12px;color:#0f172a">'+(r.description||"")+'</td>'
        +'<td style="padding:8px;font-size:12px;text-align:right">'+(pos?"":debi)+'</td>'
        +'<td style="padding:8px;font-size:12px;text-align:right">'+(pos?kredi:"")+'</td>'
        +'<td style="padding:8px;font-size:12px;font-weight:700;text-align:right;color:'+balColor+'">'+fmt2(r.runBal)+'</td>'
        +'</tr>';
    }).join("");

    const closeDateStr=dateTo?" ("+dateTo+")":"";
    const closeBorderColor=closingBal>=0?"#bbf7d0":"#fecaca";
    const closeRow='<tr style="background:'+closeBg+';border-top:2px solid '+closeBorderColor+'">'
      +'<td colspan="4" style="padding:10px;font-size:13px;font-weight:800;color:'+closeCol+'">Gjendje Mbyllëse'+closeDateStr+'</td>'
      +'<td colspan="2" style="padding:10px;font-size:15px;font-weight:800;color:'+closeCol+';text-align:right">'+fmt2(closingBal)+'</td></tr>';

    const html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Statement '+(isL?"Lekë":"Euro")+'</title>'
      +'<style>body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#0f172a}'
      +'.hdr{background:#0f172a;color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:16px}'
      +'table{width:100%;border-collapse:collapse;font-size:12px}'
      +'th{background:#1e293b;color:#fff;padding:10px;font-size:11px;text-align:left;font-weight:600}'
      +'th:nth-child(4),th:nth-child(5),th:nth-child(6){text-align:right}'
      +'@media print{body{padding:10px}}</style>'
      +'</head><body>'
      +'<div class="hdr"><h2 style="margin:0;font-size:18px">🏦 Bank Statement — '+(isL?"LEKË":"EURO")+'</h2>'
      +'<p style="margin:4px 0 0;opacity:.7;font-size:12px">Car Rental Manager · Gjeneruar: '+nowStr()+'</p>'
      +period+'</div>'
      +'<table><thead><tr>'
      +'<th style="width:90px">Data</th><th style="width:100px">Lloji</th><th>Përshkrimi</th>'
      +'<th style="width:100px;text-align:right">Debi</th>'
      +'<th style="width:100px;text-align:right">Kredi</th>'
      +'<th style="width:110px;text-align:right">Gjendje</th>'
      +'</tr></thead><tbody>'
      +openRow+rowsHtml+closeRow
      +'</tbody></table></body></html>';
    const w=window.open("","_blank");
    if(w){w.document.write(html);w.document.close();setTimeout(()=>w.print(),500);}
  }

  if(loading) return <Spin/>;
  const carNames=cars.map(c=>c.name);

  return (
    <div style={{padding:14,maxWidth:860,margin:"0 auto"}}>
      <h2 style={{margin:"0 0 14px",fontSize:17,fontWeight:700,color:"#0f172a"}}>🏦 Arkë</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
        <div onClick={()=>setArkTab("lek")} style={{background:"linear-gradient(135deg,#1e3a5f,#1d4ed8)",borderRadius:14,padding:"16px 14px",color:"#fff",boxShadow:"0 4px 16px rgba(29,78,216,0.3)",cursor:"pointer",border:arkTab==="lek"?"3px solid #93c5fd":"3px solid transparent"}}>
          <div style={{fontSize:10,opacity:0.8,letterSpacing:1,fontWeight:700}}>ARKË LEKË</div>
          <div style={{fontSize:22,fontWeight:800,marginTop:4,lineHeight:1}}>{cashLek.toLocaleString("sq-AL")}</div>
          <div style={{fontSize:10,opacity:0.6,marginTop:2}}>ALL</div>
        </div>
        <div onClick={()=>setArkTab("eur")} style={{background:"linear-gradient(135deg,#064e3b,#059669)",borderRadius:14,padding:"16px 14px",color:"#fff",boxShadow:"0 4px 16px rgba(5,150,105,0.3)",cursor:"pointer",border:arkTab==="eur"?"3px solid #6ee7b7":"3px solid transparent"}}>
          <div style={{fontSize:10,opacity:0.8,letterSpacing:1,fontWeight:700}}>ARKË EURO</div>
          <div style={{fontSize:22,fontWeight:800,marginTop:4,lineHeight:1}}>{cashEur.toFixed(2)}</div>
          <div style={{fontSize:10,opacity:0.6,marginTop:2}}>EUR</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        <button onClick={()=>{setAf(f=>({...f,type:"in"}));setShowA(true)}} style={{...PB,width:"100%",justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>📥 Hyrje</button>
        <button onClick={()=>{setAf(f=>({...f,type:"out"}));setShowA(true)}} style={{...PB,background:"#dc2626",width:"100%",justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>📤 Dalje</button>
        <button onClick={()=>setShowT(true)} style={{...PB,background:"#7c3aed",width:"100%",justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>🔄 Kalim</button>
        <button onClick={()=>setShowE(true)} style={{...PB,background:"#ea580c",width:"100%",justifyContent:"center",display:"flex",alignItems:"center",gap:4}}>➖ Shpenzim</button>
      </div>

      <div style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,overflow:"hidden"}}>
        <div style={{background:arkTab==="lek"?"#0f172a":"#064e3b",color:"#fff",padding:"10px 12px"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
            <span style={{fontWeight:700,fontSize:13,flex:1}}>📋 Statement {arkTab==="lek"?"Lekë":"Euro"}</span>
            <button onClick={exportCSV} style={{padding:"5px 10px",borderRadius:7,background:"#16a34a",border:"none",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>⬇️ CSV</button>
            <button onClick={exportPDF} style={{padding:"5px 10px",borderRadius:7,background:"#dc2626",border:"none",color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer"}}>🖨️ PDF</button>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{flex:1,padding:"5px 6px",borderRadius:6,border:"1px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:11,fontFamily:"inherit",minWidth:0}}/>
            <span style={{fontSize:10,opacity:0.7,flexShrink:0}}>→</span>
            <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{flex:1,padding:"5px 6px",borderRadius:6,border:"1px solid rgba(255,255,255,0.3)",background:"rgba(255,255,255,0.1)",color:"#fff",fontSize:11,fontFamily:"inherit",minWidth:0}}/>
            {(dateFrom||dateTo)&&<button onClick={()=>{setDateFrom("");setDateTo("");}} style={{padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:12,cursor:"pointer",flexShrink:0}}>✕</button>}
          </div>
        </div>
        {/* Summary bar */}
        <div style={{padding:"10px 16px",background:"#f8fafc",borderBottom:"1px solid #e2e8f0",display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
          {dateFrom&&<div style={{fontSize:12}}><span style={{color:"#94a3b8"}}>Gjendje Hapëse: </span><span style={{fontWeight:700,color:"#1e40af"}}>{isL?openingBal.toLocaleString("sq-AL")+" L":"€"+openingBal.toFixed(2)}</span></div>}
          <div style={{fontSize:12}}><span style={{color:"#94a3b8"}}>Veprime: </span><span style={{fontWeight:700}}>{rows.length}</span></div>
          <div style={{flex:1}}/>
          <div style={{fontSize:13,fontWeight:800,color:closingBal>=0?"#16a34a":"#dc2626"}}>Gjendje: {isL?closingBal.toLocaleString("sq-AL")+" L":"€"+closingBal.toFixed(2)}</div>
        </div>
        {rows.length===0
          ? <div style={{padding:32,textAlign:"center",color:"#94a3b8"}}>Asnjë transaksion{dateFrom||dateTo?" për periudhën e zgjedhur":""}.</div>
          : <div style={{maxHeight:440,overflowY:"auto"}}>
            {/* Opening balance row */}
            {dateFrom&&<div style={{padding:"10px 16px",display:"flex",gap:12,alignItems:"center",background:"#eff6ff",borderBottom:"2px solid #bfdbfe"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:"#dbeafe",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>📋</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:"#1e40af"}}>Gjendje Hapëse</div><div style={{fontSize:11,color:"#64748b"}}>{dateFrom}</div></div>
              <div style={{fontWeight:800,fontSize:14,color:"#1e40af"}}>{isL?openingBal.toLocaleString("sq-AL")+" L":"€"+openingBal.toFixed(2)}</div>
            </div>}
            {/* Transaction rows with running balance */}
            {getRowsWithBalance().map((r,i)=>{
              const pos=Number(r.amount)>=0;
              const balCol=r.runBal>=0?"#1e40af":"#dc2626";
              return <div key={r.id} style={{padding:"10px 16px",display:"flex",gap:10,alignItems:"center",borderBottom:"1px solid #f1f5f9",background:i%2===0?"#fff":"#fafafa"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:pos?"#dcfce7":"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,flexShrink:0}}>{pos?"📥":"📤"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.description||r.type}</div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>{r.type} · {r.created_at?r.created_at.slice(0,10):""}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:pos?"#16a34a":"#dc2626"}}>{pos?"+":"-"}{isL?Math.abs(Number(r.amount)).toLocaleString("sq-AL")+" L":"€"+Math.abs(Number(r.amount)).toFixed(2)}</div>
                  <div style={{fontSize:11,color:balCol,fontWeight:600}}>{isL?r.runBal.toLocaleString("sq-AL")+" L":"€"+r.runBal.toFixed(2)}</div>
                </div>
              </div>;
            })}
            {/* Closing balance row */}
            <div style={{padding:"12px 16px",display:"flex",gap:12,alignItems:"center",background:closingBal>=0?"#f0fdf4":"#fff5f5",borderTop:"2px solid "+(closingBal>=0?"#bbf7d0":"#fecaca")}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:closingBal>=0?"#dcfce7":"#fee2e2",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🏦</div>
              <div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:closingBal>=0?"#166534":"#991b1b"}}>Gjendje Mbyllëse{dateTo?" ("+dateTo+")":""}</div></div>
              <div style={{fontWeight:800,fontSize:16,color:closingBal>=0?"#166534":"#991b1b"}}>{isL?closingBal.toLocaleString("sq-AL")+" L":"€"+closingBal.toFixed(2)}</div>
            </div>
          </div>
        }
      </div>

      {showA&&<Modal title={af.type==="in"?"📥 Hyrje Cash":"📤 Dalje Cash"} onClose={()=>setShowA(false)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Shuma *"><input type="number" value={af.amount} onChange={e=>setAf(f=>({...f,amount:e.target.value}))} style={FL}/></Fld>
          <Fld label="Monedha"><select value={af.currency} onChange={e=>setAf(f=>({...f,currency:e.target.value}))} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>
          <Fld label="Përshkrimi" col2><input value={af.description} onChange={e=>setAf(f=>({...f,description:e.target.value}))} style={FL} placeholder="Arsyeja..."/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>setShowA(false)} style={CB}>Anulo</button>
          <button onClick={doAdd} style={PB}>✅ Konfirmo</button>
        </div>
      </Modal>}
      {showT&&<Modal title="🔄 Kalim Ndërmjet Arkave" onClose={()=>setShowT(false)}>
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
      {showE&&<Modal title="➖ Shpenzim i Ri" onClose={()=>setShowE(false)}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Përshkrimi *" col2><input value={ef.description} onChange={e=>setEf(f=>({...f,description:e.target.value}))} style={FL} placeholder="p.sh. Ndërrimi gomave"/></Fld>
          <Fld label="Shuma *"><input type="number" value={ef.amount} onChange={e=>setEf(f=>({...f,amount:e.target.value}))} style={FL}/></Fld>
          <Fld label="Monedha"><select value={ef.currency} onChange={e=>setEf(f=>({...f,currency:e.target.value}))} style={FL}><option value="ALL">Lekë</option><option value="EUR">Euro</option></select></Fld>
          <Fld label="Kategoria"><select value={ef.category} onChange={e=>setEf(f=>({...f,category:e.target.value}))} style={FL}>{CATS.map(c=><option key={c}>{c}</option>)}</select></Fld>
          <Fld label="Makina"><select value={ef.car_name} onChange={e=>setEf(f=>({...f,car_name:e.target.value}))} style={FL}><option value="">— Të gjitha —</option>{carNames.map(c=><option key={c}>{c}</option>)}</select></Fld>
          <Fld label="Data"><input type="date" value={ef.expense_date} onChange={e=>setEf(f=>({...f,expense_date:e.target.value}))} style={FL}/></Fld>
        </div>
        <div style={{background:"#fef3c7",border:"1px solid #fde68a",borderRadius:7,padding:"8px 12px",marginTop:8,fontSize:12,color:"#92400e"}}>⚠️ Shuma zbritet automatikisht nga arka.</div>
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

  const filtered=clients.filter(c=>!srch||c.name.toLowerCase().includes(srch.toLowerCase())||c.phone?.includes(srch)||c.id_card?.includes(srch));
  if(loading) return <Spin/>;

  return (
    <div style={{padding:14,maxWidth:800,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>👥 Klientët</h2>
        <input value={srch} onChange={e=>setSrch(e.target.value)} placeholder="Kërko..." style={{padding:"7px 11px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,width:180,fontFamily:"inherit"}}/>
        <button onClick={()=>{setForm({name:"",phone:"",email:"",id_card:"",address:"",notes:""});setEditId(null);setShowF(true)}} style={PB}>+ Klient i Ri</button>
      </div>
      {filtered.length===0
        ? <div style={{textAlign:"center",color:"#94a3b8",padding:48,background:"#fff",borderRadius:12,border:"1px solid #e2e8f0"}}>Asnjë klient.</div>
        : filtered.map(cl=>{
          const clReses=reses.filter(r=>r.client_name===cl.name);
          const totL=clReses.filter(r=>r.currency==="ALL"&&r.payment_status==="paguar").reduce((s,r)=>s+Number(r.total_price),0);
          const totE=clReses.filter(r=>r.currency==="EUR"&&r.payment_status==="paguar").reduce((s,r)=>s+Number(r.total_price),0);
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
                  <span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#dbeafe",color:"#1e40af",fontWeight:700}}>{clReses.length} rezervime</span>
                  {totL>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#dcfce7",color:"#166534",fontWeight:700}}>{totL.toLocaleString("sq-AL")} L</span>}
                  {totE>0&&<span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:"#dcfce7",color:"#166534",fontWeight:700}}>€{totE.toFixed(2)}</span>}
                </div>
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
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
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

// ─── RAPORT PAGE ─────────────────────────────────────────────────────────────
function RptPage({sess,reloadTick}) {
  const [reses,setReses]=useState([]);
  const [exps,setExps]=useState([]);
  const [cars,setCars]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selCar,setSelCar]=useState("all");

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("reservations","",sess.token),
      sbAuthGet("expenses","",sess.token),
      sbAuthGet("cars","order=sort_order.asc",sess.token)
    ]).then(([r,e,cr])=>{setReses(r);setExps(e);setCars(cr);setLoading(false);}).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  if(loading) return <Spin/>;

  const carNames=cars.map(c=>c.name);
  const filtCars=selCar==="all"?carNames:[selCar];

  function carStats(cn){
    const paid=reses.filter(r=>r.car_name===cn&&r.payment_status==="paguar"&&r.status!=="Anuluar");
    const all=reses.filter(r=>r.car_name===cn&&r.status!=="Anuluar");
    const incL=paid.filter(r=>r.currency==="ALL").reduce((s,r)=>s+Number(r.total_price),0);
    const incE=paid.filter(r=>r.currency==="EUR").reduce((s,r)=>s+Number(r.total_price),0);
    const expL=exps.filter(e=>e.car_name===cn&&e.currency==="ALL").reduce((s,e)=>s+Number(e.amount),0);
    const expE=exps.filter(e=>e.car_name===cn&&e.currency==="EUR").reduce((s,e)=>s+Number(e.amount),0);
    const totalDays=all.reduce((s,r)=>s+diffDays(r.date_from,r.date_to),0);
    const kmList=all.filter(r=>r.km_out&&r.km_in).map(r=>Number(r.km_in)-Number(r.km_out));
    const totalKm=kmList.reduce((s,k)=>s+k,0);
    return {paid:paid.length,total:all.length,incL,incE,expL,expE,totalDays,totalKm,balL:incL-expL,balE:incE-expE};
  }

  return (
    <div style={{padding:14,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>📈 Raport Financiar</h2>
        <select value={selCar} onChange={e=>setSelCar(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit"}}>
          <option value="all">Të gjitha makinat</option>
          {carNames.map(cn=><option key={cn} value={cn}>{cn}</option>)}
        </select>
      </div>

      {filtCars.map(cn=>{
        const s=carStats(cn);
        const cc=carColor(cn,carNames);
        const car=cars.find(c=>c.name===cn);
        return (
          <div key={cn} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,marginBottom:16,overflow:"hidden",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
            {/* Header */}
            <div style={{background:cc.bg,borderBottom:"3px solid "+cc.ac,padding:"12px 16px",display:"flex",alignItems:"center",gap:12}}>
              {car?.photo_url
                ? <img src={car.photo_url} style={{width:48,height:34,objectFit:"cover",borderRadius:7,flexShrink:0}}/>
                : <div style={{fontSize:28}}>🚗</div>
              }
              <div>
                <div style={{fontWeight:800,fontSize:15,color:cc.tx}}>{cn}</div>
                <div style={{fontSize:12,color:cc.tx,opacity:0.7}}>{s.total} rezervime · {s.totalDays} ditë · {s.totalKm} km</div>
              </div>
            </div>
            {/* Stats */}
            <div style={{padding:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                {/* LEK */}
                <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:8}}>LEKË</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Të ardhura</span><span style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>{s.incL.toLocaleString("sq-AL")} L</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Shpenzime</span><span style={{fontWeight:700,color:"#dc2626",fontSize:13}}>{s.expL.toLocaleString("sq-AL")} L</span></div>
                  <div style={{height:1,background:"#e2e8f0",marginBottom:6}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:700}}>Balanca</span><span style={{fontWeight:800,color:s.balL>=0?"#16a34a":"#dc2626",fontSize:14}}>{s.balL.toLocaleString("sq-AL")} L</span></div>
                </div>
                {/* EUR */}
                <div style={{background:"#f8fafc",borderRadius:10,padding:"12px 14px",border:"1px solid #e2e8f0"}}>
                  <div style={{fontSize:10,color:"#64748b",fontWeight:700,letterSpacing:1,marginBottom:8}}>EURO</div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Të ardhura</span><span style={{fontWeight:700,color:"#1d4ed8",fontSize:13}}>€{s.incE.toFixed(2)}</span></div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontSize:12,color:"#64748b"}}>Shpenzime</span><span style={{fontWeight:700,color:"#dc2626",fontSize:13}}>€{s.expE.toFixed(2)}</span></div>
                  <div style={{height:1,background:"#e2e8f0",marginBottom:6}}/>
                  <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:12,fontWeight:700}}>Balanca</span><span style={{fontWeight:800,color:s.balE>=0?"#16a34a":"#dc2626",fontSize:14}}>€{s.balE.toFixed(2)}</span></div>
                </div>
              </div>
              {/* Mini stats */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
                {[["📋",s.total,"Rezervime"],["✅",s.paid,"Paguar"],["🗓",s.totalDays,"Ditë"],["🚗",s.totalKm,"Km total"]].map(([ic,val,lb])=>(
                  <div key={lb} style={{background:"#f8fafc",borderRadius:8,padding:"9px 10px",textAlign:"center",border:"1px solid #e2e8f0"}}>
                    <div style={{fontSize:11,marginBottom:2}}>{ic}</div>
                    <div style={{fontWeight:800,fontSize:16,color:"#0f172a"}}>{val}</div>
                    <div style={{fontSize:10,color:"#94a3b8"}}>{lb}</div>
                  </div>
                ))}
              </div>
              {/* Recent reservations */}
              {reses.filter(r=>r.car_name===cn).slice(0,5).map(r=>(
                <div key={r.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#0f172a"}}>{r.client_name}</div>
                    <div style={{fontSize:11,color:"#94a3b8"}}>{fmtFull(r.date_from)} → {fmtFull(r.date_to)}{r.km_out&&r.km_in?` · ${Number(r.km_in)-Number(r.km_out)} km`:""}</div>
                  </div>
                  <div style={{fontWeight:700,fontSize:13,color:r.payment_status==="paguar"?"#16a34a":"#f59e0b"}}>{fmtM(r.total_price,r.currency)}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── SERVIS PAGE ──────────────────────────────────────────────────────────────
function SrvPage({sess,reload,reloadTick,addLog}) {
  const [cars,setCars]=useState([]);
  const [services,setServices]=useState([]);
  const [carSettings,setCarSettings]=useState([]);
  const [reses,setReses]=useState([]);
  const [loading,setLoading]=useState(true);
  const [selCar,setSelCar]=useState("");
  const [showSrvF,setShowSrvF]=useState(false);
  const [showSettF,setShowSettF]=useState(false);
  const [editSrv,setEditSrv]=useState(null);
  const [sf,setSf]=useState({car_name:"",type:"sigurim",expiry_date:"",notes:""});
  const [csf,setCsf]=useState({car_name:"",oil_interval_km:"10000",last_oil_km:"0",last_oil_date:"",notes:""});

  const SRV_TYPES={"sigurim":"🛡️ Sigurim","kolaudim":"🔍 Kolaudim","taksa":"💼 Taksa"};
  const DAYS_WARN=[15,10,5,3,1];

  useEffect(()=>{
    setLoading(true);
    Promise.all([
      sbAuthGet("cars","order=sort_order.asc",sess.token),
      sbAuthGet("car_services","order=expiry_date.asc",sess.token),
      sbAuthGet("car_settings","",sess.token),
      sbAuthGet("reservations","status=neq.Anuluar",sess.token)
    ]).then(([c,s,cs,r])=>{
      setCars(c);setServices(s);setCarSettings(cs);setReses(r);
      if(!selCar&&c.length>0) setSelCar(c[0].name);
      setLoading(false);
      // Check notifications
      checkSrvNotifs(s,cs,r);
    }).catch(()=>setLoading(false));
  },[reloadTick,sess.token]);

  function checkSrvNotifs(svcs,csets,resesList){
    if(!("Notification" in window)||Notification.permission!=="granted") return;
    const today=new Date(); today.setHours(0,0,0,0);
    const sent=JSON.parse(localStorage.getItem("crm_srv_notifs")||"{}");

    // Service expiry notifications
    svcs.forEach(s=>{
      const exp=new Date(s.expiry_date); exp.setHours(0,0,0,0);
      const daysLeft=Math.round((exp-today)/86400000);
      DAYS_WARN.forEach(d=>{
        const key=s.id+"_"+d;
        if(daysLeft===d&&!sent[key]){
          new Notification("⚠️ "+SRV_TYPES[s.type]+" skadon në "+d+" ditë",{body:s.car_name+" · "+s.expiry_date});
          sent[key]=true;
        }
      });
    });

    // Oil/filter km notifications
    csets.forEach(cs=>{
      if(!cs.oil_interval_km||!cs.last_oil_km) return;
      const maxKm=Number(cs.last_oil_km)+Number(cs.oil_interval_km);
      // Get latest km from reservations
      const carReses=resesList.filter(r=>r.car_name===cs.car_name&&r.km_in);
      if(!carReses.length) return;
      const latestKm=Math.max(...carReses.map(r=>Number(r.km_in)));
      const kmLeft=maxKm-latestKm;
      [2000,1000,500,100].forEach(km=>{
        const key=cs.car_name+"_oil_"+Math.floor(latestKm/100)+"_"+km;
        if(kmLeft>0&&kmLeft<=km&&!sent[key]){
          new Notification("🔧 Ndërrimi vaj/filtra brenda "+km+"km",{body:cs.car_name+" · Km aktual: "+latestKm+" · Ndërrimi: "+maxKm+"km"});
          sent[key]=true;
        }
        if(kmLeft<=0&&!sent[cs.car_name+"_oil_overdue"]){
          new Notification("🚨 Ndërrimi vaj/filtra I KALUAR!",{body:cs.car_name+" · "+Math.abs(kmLeft)+"km pa ndërruar"});
          sent[cs.car_name+"_oil_overdue"]=true;
        }
      });
    });
    localStorage.setItem("crm_srv_notifs",JSON.stringify(sent));
  }

  async function saveSrv(){
    if(!sf.car_name||!sf.expiry_date) return;
    if(editSrv){
      await sbAuthPatch("car_services",editSrv,sf,sess.token);
      addLog("Ndrysho Servis",sf.car_name+" - "+sf.type);
    } else {
      await sbAuthPost("car_services",{...sf,created_by:sess.profile?.username},sess.token);
      addLog("Shto Servis",sf.car_name+" - "+sf.type);
    }
    reload(); setShowSrvF(false); setEditSrv(null);
    setSf({car_name:selCar||"",type:"sigurim",expiry_date:"",notes:""});
  }
  async function delSrv(id){
    await sbAuthDelete("car_services",id,sess.token);
    addLog("Fshi Servis","");
    reload();
  }
  async function saveCarSett(){
    if(!csf.car_name) return;
    const existing=carSettings.find(s=>s.car_name===csf.car_name);
    const body={car_name:csf.car_name,oil_interval_km:Number(csf.oil_interval_km),last_oil_km:Number(csf.last_oil_km),last_oil_date:csf.last_oil_date||null,notes:csf.notes};
    if(existing){
      await sbAuthPatch("car_settings",existing.id,body,sess.token);
    } else {
      await sbAuthPost("car_settings",body,sess.token);
    }
    addLog("Cilësime Makine",csf.car_name);
    reload(); setShowSettF(false);
  }

  function daysUntil(dateStr){
    const d=new Date(dateStr); d.setHours(0,0,0,0);
    const t=new Date(); t.setHours(0,0,0,0);
    return Math.round((d-t)/86400000);
  }
  function urgencyColor(days){
    if(days<0)  return {bg:"#fef2f2",bd:"#fca5a5",tx:"#991b1b",label:"Skaduar"};
    if(days<=3) return {bg:"#fef2f2",bd:"#fca5a5",tx:"#991b1b",label:days+"d"};
    if(days<=10) return {bg:"#fef3c7",bd:"#fde68a",tx:"#92400e",label:days+"d"};
    if(days<=15) return {bg:"#fef9c3",bd:"#fef08a",tx:"#713f12",label:days+"d"};
    return {bg:"#f0fdf4",bd:"#bbf7d0",tx:"#166534",label:days+"d"};
  }

  const carNames=cars.map(c=>c.name);
  if(loading) return <Spin/>;

  // Latest km per car from reservations
  function latestKm(carName){
    const cr=reses.filter(r=>r.car_name===carName&&r.km_in);
    if(!cr.length) return null;
    return Math.max(...cr.map(r=>Number(r.km_in)));
  }

  return (
    <div style={{padding:14,maxWidth:900,margin:"0 auto"}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,flexWrap:"wrap"}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:700,color:"#0f172a",flex:1}}>🔧 Servis & Dokumenta</h2>
        <select value={selCar} onChange={e=>setSelCar(e.target.value)} style={{padding:"7px 10px",borderRadius:8,border:"1px solid #e2e8f0",fontSize:13,fontFamily:"inherit"}}>
          {carNames.map(cn=><option key={cn} value={cn}>{cn}</option>)}
        </select>
        <button onClick={()=>{setSf({car_name:selCar,type:"sigurim",expiry_date:"",notes:""});setEditSrv(null);setShowSrvF(true)}} style={PB}>+ Shto Dokument</button>
        <button onClick={()=>{const s=carSettings.find(cs=>cs.car_name===selCar); setCsf({car_name:selCar,oil_interval_km:s?.oil_interval_km||10000,last_oil_km:s?.last_oil_km||0,last_oil_date:s?.last_oil_date||"",notes:s?.notes||""});setShowSettF(true)}} style={{...PB,background:"#7c3aed"}}>⚙️ Vaj/Filtra</button>
      </div>

      {/* Alerts - expiring soon */}
      {services.filter(s=>daysUntil(s.expiry_date)<=15).map(s=>{
        const urg=urgencyColor(daysUntil(s.expiry_date));
        return (
          <div key={s.id+"_alert"} style={{background:urg.bg,border:"1px solid "+urg.bd,borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:18}}>⚠️</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:urg.tx}}>{SRV_TYPES[s.type]} — {s.car_name}</div>
              <div style={{fontSize:12,color:urg.tx,opacity:0.8}}>Skadon: {fmtFull(s.expiry_date)} · {urg.label==="Skaduar"?"SKADUAR!":urg.label+" ditë"}</div>
            </div>
          </div>
        );
      })}

      {/* Oil km alerts */}
      {carNames.filter(cn=>selCar==="all"||cn===selCar).map(cn=>{
        const cs=carSettings.find(s=>s.car_name===cn);
        if(!cs||!cs.oil_interval_km) return null;
        const lkm=latestKm(cn);
        if(!lkm) return null;
        const maxKm=Number(cs.last_oil_km)+Number(cs.oil_interval_km);
        const kmLeft=maxKm-lkm;
        if(kmLeft>2000) return null;
        const isOver=kmLeft<=0;
        return (
          <div key={cn+"_oil"} style={{background:isOver?"#fef2f2":"#fef3c7",border:"1px solid "+(isOver?"#fca5a5":"#fde68a"),borderRadius:10,padding:"10px 14px",marginBottom:8,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{fontSize:18}}>🔧</span>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:13,color:isOver?"#991b1b":"#92400e"}}>Vaj/Filtra — {cn}</div>
              <div style={{fontSize:12,color:isOver?"#991b1b":"#92400e",opacity:0.9}}>
                {isOver?`KALUAR ${Math.abs(kmLeft)} km pa ndërruar!`:`${kmLeft} km deri ndërrimit`} · Km aktual: {lkm.toLocaleString()} · Ndërrimi: {maxKm.toLocaleString()} km
              </div>
            </div>
          </div>
        );
      })}

      {/* Services list per car */}
      {(selCar?[selCar]:carNames).map(cn=>{
        const carSrvs=services.filter(s=>s.car_name===cn);
        const cs=carSettings.find(s=>s.car_name===cn);
        const lkm=latestKm(cn);
        const car=cars.find(c=>c.name===cn);
        const cc=carColor(cn,carNames);
        return (
          <div key={cn} style={{background:"#fff",border:"1px solid #e2e8f0",borderRadius:14,marginBottom:14,overflow:"hidden"}}>
            <div style={{background:cc.bg,borderBottom:"2px solid "+cc.ac,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
              {car?.photo_url?<img src={car.photo_url} style={{width:40,height:28,objectFit:"cover",borderRadius:5}}/>:<span style={{fontSize:20}}>🚗</span>}
              <span style={{fontWeight:800,fontSize:14,color:cc.tx,flex:1}}>{cn}</span>
              {cs&&lkm&&<span style={{fontSize:11,color:cc.tx,opacity:0.8}}>Km: {lkm.toLocaleString()} · Vaj: {(Number(cs.last_oil_km)+Number(cs.oil_interval_km)).toLocaleString()} km</span>}
            </div>
            <div style={{padding:12}}>
              {Object.entries(SRV_TYPES).map(([type,label])=>{
                const srv=carSrvs.find(s=>s.type===type);
                const days=srv?daysUntil(srv.expiry_date):null;
                const urg=srv?urgencyColor(days):{bg:"#f8fafc",bd:"#e2e8f0",tx:"#94a3b8"};
                return (
                  <div key={type} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f1f5f9"}}>
                    <span style={{fontSize:16,flexShrink:0}}>{label.split(" ")[0]}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#374151"}}>{label.split(" ").slice(1).join(" ")}</div>
                      {srv?<div style={{fontSize:11,color:"#64748b"}}>{fmtFull(srv.expiry_date)}{srv.notes?" · "+srv.notes:""}</div>:<div style={{fontSize:11,color:"#94a3b8"}}>Nuk është shtuar</div>}
                    </div>
                    {srv&&<div style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,background:urg.bg,color:urg.tx,border:"1px solid "+urg.bd,flexShrink:0}}>{days<0?"Skaduar":days+"d"}</div>}
                    <button onClick={()=>{setSf({car_name:cn,type,expiry_date:srv?.expiry_date||"",notes:srv?.notes||""});setEditSrv(srv?.id||null);setShowSrvF(true)}} style={{...IB,fontSize:12}}>{srv?"✏️":"➕"}</button>
                    {srv&&<button onClick={()=>delSrv(srv.id)} style={{...IB,color:"#dc2626",fontSize:12}}>🗑️</button>}
                  </div>
                );
              })}
              {/* Oil info */}
              {cs&&(
                <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",marginTop:4}}>
                  <span style={{fontSize:16}}>🛢️</span>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:"#374151"}}>Vaj/Filtra</div>
                    <div style={{fontSize:11,color:"#64748b"}}>Çdo {Number(cs.oil_interval_km).toLocaleString()} km · Ndërrimi i fundit: {cs.last_oil_km?Number(cs.last_oil_km).toLocaleString()+" km":"-"}{cs.last_oil_date?" ("+fmtFull(cs.last_oil_date)+")":""}</div>
                  </div>
                  {lkm&&cs.last_oil_km&&<div style={{fontSize:11,color:"#64748b",flexShrink:0}}>{Math.max(0,(Number(cs.last_oil_km)+Number(cs.oil_interval_km)-lkm)).toLocaleString()} km mbetur</div>}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Modals */}
      {showSrvF&&<Modal title={editSrv?"Ndrysho Dokument":"Shto Dokument"} onClose={()=>{setShowSrvF(false);setEditSrv(null);}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Makina *"><select value={sf.car_name} onChange={e=>setSf(f=>({...f,car_name:e.target.value}))} style={FL}>{carNames.map(cn=><option key={cn}>{cn}</option>)}</select></Fld>
          <Fld label="Lloji"><select value={sf.type} onChange={e=>setSf(f=>({...f,type:e.target.value}))} style={FL}>{Object.entries(SRV_TYPES).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></Fld>
          <Fld label="Data e Skadimit *" col2><input type="date" value={sf.expiry_date} onChange={e=>setSf(f=>({...f,expiry_date:e.target.value}))} style={FL}/></Fld>
          <Fld label="Shënime" col2><input value={sf.notes||""} onChange={e=>setSf(f=>({...f,notes:e.target.value}))} style={FL} placeholder="Opsionale..."/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>{setShowSrvF(false);setEditSrv(null);}} style={CB}>Anulo</button>
          <button onClick={saveSrv} style={PB}>💾 Ruaj</button>
        </div>
      </Modal>}

      {showSettF&&<Modal title={"⚙️ Vaj/Filtra — "+csf.car_name} onClose={()=>setShowSettF(false)}>
        <div style={{background:"#fffbeb",border:"1px solid #fde68a",borderRadius:8,padding:"10px 12px",marginBottom:14,fontSize:12,color:"#92400e"}}>
          🔧 Vendos intervalin e ndërrimit dhe km-in e fundit. Sistemi do njoftojë 2000, 1000, 500, 100 km para.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <Fld label="Intervali (km) *"><input type="number" value={csf.oil_interval_km} onChange={e=>setCsf(f=>({...f,oil_interval_km:e.target.value}))} style={FL} placeholder="10000"/></Fld>
          <Fld label="Km i ndërrimit të fundit *"><input type="number" value={csf.last_oil_km} onChange={e=>setCsf(f=>({...f,last_oil_km:e.target.value}))} style={FL} placeholder="45000"/></Fld>
          <Fld label="Data ndërrimit të fundit" col2><input type="date" value={csf.last_oil_date||""} onChange={e=>setCsf(f=>({...f,last_oil_date:e.target.value}))} style={FL}/></Fld>
          <Fld label="Shënime" col2><input value={csf.notes||""} onChange={e=>setCsf(f=>({...f,notes:e.target.value}))} style={FL} placeholder="Opsionale..."/></Fld>
        </div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
          <button onClick={()=>setShowSettF(false)} style={CB}>Anulo</button>
          <button onClick={saveCarSett} style={PB}>💾 Ruaj</button>
        </div>
      </Modal>}
    </div>
  );
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────
function AudPage({sess,reloadTick}) {
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
    <div style={{padding:14,maxWidth:860,margin:"0 auto"}}>
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
                <div style={{fontSize:11,color:"#94a3b8"}}>👤 <strong>{e.user_name}</strong> · {e.created_at?new Date(e.created_at).toLocaleString("sq-AL"):""}</div>
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
  const [tab,setTab]=useState("brand");
  const [cars,setCars]=useState([]);
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [newCar,setNewCar]=useState("");
  const [showAddUser,setShowAddUser]=useState(false);
  const [uf,setUf]=useState({email:"",password:"",name:"",role:"staff",username:""});

  // Branding state from localStorage
  const initBrand = JSON.parse(localStorage.getItem("crm_brand")||"{}");
  const [brandLogo,setBrandLogo] = useState(initBrand.logoUrl||"");
  const [brandName,setBrandName] = useState(initBrand.appName||"Car Rental Manager");
  const [brandSaved,setBrandSaved] = useState(false);

  function saveBrand(){
    localStorage.setItem("crm_brand", JSON.stringify({logoUrl:brandLogo, appName:brandName}));
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

  async function addCar(){
    const n=newCar.trim();
    if(!n) return;
    try {
      const [c]=await sbAuthPost("cars",{name:n,sort_order:cars.length+1},sess.token);
      setCars(cs=>[...cs,c]); addLog("Shto Makinë",n); setNewCar("");
    } catch(e){alert(e.message);}
  }
  async function delCar(id,name){
    try { await sbAuthDelete("cars",id,sess.token); setCars(cs=>cs.filter(c=>c.id!==id)); addLog("Fshi Makinë",name); } catch(e){alert(e.message);}
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

  if(loading) return <Spin/>;

  return (
    <div style={{padding:14,maxWidth:780,margin:"0 auto"}}>
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

          <button onClick={saveBrand} style={{...PB,width:"100%",padding:14,fontSize:14,background:brandSaved?"#16a34a":"#1d4ed8"}}>
            {brandSaved?"✅ Ruajtur!":"💾 Ruaj Branding"}
          </button>
        </div>
      )}

      {tab==="cars"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:16}}>
            <input value={newCar} onChange={e=>setNewCar(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCar()} placeholder="p.sh. BMW 320d 2020" style={{...FL,flex:1}}/>
            <button onClick={addCar} style={PB}>+ Shto</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:12}}>
            {cars.map(car=>{
              const cc=carColor(car.name,cars.map(c=>c.name));
              return <div key={car.id} style={{background:"#fff",borderRadius:14,border:"2px solid "+cc.ac+"44",overflow:"hidden",boxShadow:"0 2px 10px rgba(0,0,0,0.07)"}}>
                <div style={{position:"relative",height:120,background:car.photo_url?"#000":cc.bg,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
                  {car.photo_url
                    ? <img src={car.photo_url} alt={car.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : <div style={{fontSize:36,opacity:0.4}}>🚗</div>
                  }
                  <label style={{position:"absolute",bottom:6,right:6,background:"rgba(0,0,0,0.65)",color:"#fff",borderRadius:7,padding:"4px 8px",fontSize:11,cursor:"pointer",fontWeight:600}}>
                    📷 Foto
                    <input type="file" accept="image/*" onChange={e=>uploadPhoto(car,e.target.files[0])} style={{display:"none"}}/>
                  </label>
                </div>
                <div style={{padding:"10px 12px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:cc.ac,flexShrink:0}}/>
                  <span style={{flex:1,fontSize:12,fontWeight:700,color:cc.tx,lineHeight:1.3}}>{car.name}</span>
                  <button onClick={()=>delCar(car.id,car.name)} style={{background:"none",border:"none",cursor:"pointer",color:"#dc2626",fontSize:16,padding:2}}>🗑️</button>
                </div>
              </div>;
            })}
          </div>
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
