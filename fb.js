/* Horarios Althea · capa de datos sobre Firebase (Auth + Firestore, Madrid).
   Ofrece a la app el mismo interfaz que tenía dentro de Claude (window.claude.use("db" | "user" | "assets" | "downloads"))
   y se encarga de:
   - Entrar con usuario y clave (cada par usuario+clave es una cuenta de Firebase; ver credDe).
   - Primera entrada sin clave: nombre del alumno + móvil (altas/<hash>), y elegir una clave nueva.
   - Instalación: la primera persona que abre la web vacía crea el usuario de dirección.
   - Repartir los datos de cada alumno: alumnos/<id> (lo que ven sus profesoras) y privado/<id> (recibos, matrícula…).
   - Buzones: buzon/<cuenta> (alumnos), buzonProf/<cuenta> (profesoras) y buzonAl/<alumno>__<cuenta> (la parte del buzón
     de una profesora que le toca a cada alumno: así un alumno no ve nada de otro).
   La seguridad de verdad está en las reglas de Firestore (firestore.rules): esta capa solo pide lo que a cada uno le toca. */
import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut,deleteUser} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,doc,collection,getDoc,getDocs,setDoc as setDoc0,updateDoc as updateDoc0,deleteDoc as deleteDoc0,onSnapshot,query,where,limit,writeBatch,addDoc,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CONFIG={apiKey:"AIzaSyD0iNu4X13VErV58arDKlQKbvyMH_jMG6U",authDomain:"althea-horarios.firebaseapp.com",projectId:"althea-horarios",
  storageBucket:"althea-horarios.firebasestorage.app",messagingSenderId:"425534321650",appId:"1:425534321650:web:e1b294a8040c204bf0716b"};
const fapp=initializeApp(CONFIG), auth=getAuth(fapp);
/* Caché en el propio navegador: al recargar la página, Firestore solo vuelve a leer lo que ha cambiado (si han pasado
   menos de 30 minutos), en lugar de todas las fichas. Es lo que más reduce las lecturas diarias del plan gratuito. */
let fs;
try{fs=initializeFirestore(fapp,{ignoreUndefinedProperties:true,localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})})}
catch(e){console.warn("sin caché local",e);fs=initializeFirestore(fapp,{ignoreUndefinedProperties:true})}

/* ---------- aviso si la base de datos no deja guardar (cuota agotada o sin conexión) ----------
   Firestore no devuelve error al guardar cuando se agota la cuota: reintenta sin fin y la pantalla se queda en «Guardando…».
   Por eso: si un guardado tarda más de 15 s, o aparece el error de cuota, se muestra una franja roja arriba. */
const BAN={cuota:false,lentos:0};
function franja(){
  let el=document.getElementById("fb-aviso");const on=BAN.cuota||BAN.lentos>0;
  if(!on){if(el)el.remove();return}
  if(!el){el=document.createElement("div");el.id="fb-aviso";el.setAttribute("role","alert");
    el.style.cssText="position:fixed;left:0;right:0;top:0;z-index:9999;background:#b52e33;color:#fff;padding:10px 16px;font:600 14px/1.4 Figtree,system-ui,sans-serif;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,.25)";
    document.body.appendChild(el)}
  el.textContent=BAN.cuota?"No se puede guardar: la base de datos ha llegado a su límite de hoy. No hagas cambios hasta que desaparezca este aviso (lo que hagas ahora se puede perder) y avisa a dirección.":"Los cambios están tardando en guardarse. Comprueba la conexión y no cierres la página hasta que desaparezca este aviso.";
}
const marcarCuota=()=>{if(!BAN.cuota){BAN.cuota=true;franja()}};
for(const k of ["error","warn"]){const o=console[k].bind(console);console[k]=(...a)=>{try{if(a.some(x=>/resource-exhausted|Quota exceeded/i.test(String(x&&(x.code||x.message)||x))))marcarCuota()}catch(_){}return o(...a)}}
function vigilar(p){let tarde=false;const t=setTimeout(()=>{tarde=true;BAN.lentos++;franja()},15000);
  return p.then(v=>{clearTimeout(t);if(tarde){BAN.lentos--;}if(BAN.cuota){BAN.cuota=false}franja();return v},e=>{clearTimeout(t);if(tarde)BAN.lentos--;if(e&&e.code==="resource-exhausted")marcarCuota();franja();throw e})}
const setDoc=(...a)=>vigilar(setDoc0(...a)),updateDoc=(...a)=>vigilar(updateDoc0(...a)),deleteDoc=(...a)=>vigilar(deleteDoc0(...a));

/* ---------- utilidades ---------- */
const hex=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("");
const nU=u=>String(u||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const nC=c=>String(c||"").trim().toLowerCase().replace(/[^a-z0-9]/g,"");
const nNom=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z ]/g," ").trim().split(/\s+/)[0]||"";
const tel9=v=>String(v||"").replace(/\D/g,"").slice(-9);
const ahora=()=>new Date().toISOString();
const limpio=d=>JSON.parse(JSON.stringify(d??{}));
const stable=v=>{if(Array.isArray(v))return "["+v.map(stable).join(",")+"]";if(v&&typeof v==="object")return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}";return JSON.stringify(v)};
const err=e=>{const x=new Error((e&&e.message)||"error");const c=e&&e.code;x.code=c==="permission-denied"?"invalid_argument":c==="resource-exhausted"?"quota_exceeded":c||"error";x.fb=c;return x};
const guard=f=>async(...a)=>{try{return await f(...a)}catch(e){throw err(e)}};
const W=s=>({id:s.id,exists:s.exists(),data:()=>s.data()});
const falso=(id,data)=>({id,exists:data!=null,data:()=>data==null?undefined:data});
const snapQ=(docs,fc=false)=>({docs,empty:!docs.length,size:docs.length,metadata:{fromCache:fc}});
const nada=async()=>{};
const hexId=()=>{const a=new Uint8Array(16);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,"0")).join("")};
/* Cada usuario+clave es una cuenta de Firebase distinta. Así, cuando dirección cambia una clave, la cuenta vieja deja de
   valer sola (las reglas comprueban que la clave de la cuenta sea la vigente) y no hace falta un servidor para reiniciarla. */
async function credDe(u,c){const h=(await hex("althea|"+u+"|"+c)).slice(0,20);return {email:`${u}.${h.slice(0,12)}@acceso.altheaformacion.com`,pw:"Ah."+h+"."+c}}
const claveAlta=async(nom,tel)=>hex("alta|"+tel9(tel)+"|"+nNom(nom));

/* ---------- operaciones básicas ---------- */
const rawDoc=p=>({
  get:guard(async()=>W(await getDoc(doc(fs,p)))),
  set:guard(async d=>{await setDoc(doc(fs,p),limpio(d))}),
  update:guard(async d=>{await updateDoc(doc(fs,p),limpio(d))}),
  delete:guard(async()=>{await deleteDoc(doc(fs,p))}),
  onSnapshot:(ok,ko)=>onSnapshot(doc(fs,p),s=>ok(W(s)),e=>{console.warn(p,e);revisarAcceso(e);ko&&ko(err(e))}),
  acquire:async()=>({acquired:true}),release:nada});
const rawCol=(p,cons=[])=>({
  doc:id=>rawDoc(p+"/"+id),
  where:(f,op,v)=>rawCol(p,[...cons,where(f,op,v)]),
  limit:n=>rawCol(p,[...cons,limit(n)]),
  get:guard(async()=>{const s=await getDocs(query(collection(fs,p),...cons));return snapQ(s.docs.map(W),s.metadata.fromCache)}),
  onSnapshot:(ok,ko)=>onSnapshot(query(collection(fs,p),...cons),s=>ok(snapQ(s.docs.map(W),s.metadata.fromCache)),e=>{console.warn(p,e);revisarAcceso(e);ko&&ko(err(e))})});
/* Escucha varias cosas a la vez y avisa cuando todas han llegado al menos una vez */
function juntos(fuentes,combinar,ok,ko){
  const val=new Array(fuentes.length),listo=new Array(fuentes.length).fill(false),fcs=new Array(fuentes.length).fill(false);
  const subs=fuentes.map((f,i)=>f((v,cache)=>{val[i]=v;listo[i]=true;fcs[i]=!!cache;if(listo.every(Boolean))ok(combinar(val),fcs.some(Boolean))},e=>ko&&ko(e)));
  return ()=>subs.forEach(u=>{try{u()}catch(_){}});
}
let revT=null;
function revisarAcceso(e){if(!e||e.code!=="permission-denied"||!CU.usuario)return;clearTimeout(revT);revT=setTimeout(async()=>{
  try{await getDoc(doc(fs,"claves/"+CU.usuario))}catch(x){if(x&&x.code==="permission-denied"){try{sessionStorage.setItem("fbmsg","caducada")}catch(_){}try{await signOut(auth)}catch(_){}location.reload()}}},1500)}
const escDoc=p=>(ok,ko)=>onSnapshot(doc(fs,p),s=>ok(s.exists()?s.data():null,s.metadata.fromCache),e=>{console.warn(p,e);revisarAcceso(e);ko&&ko(err(e))});
/* escColM: igual, pero avisa también cuando los datos pasan de «caché» a «confirmados por el servidor» (sin coste de lecturas) */
const escColM=p=>(ok,ko)=>onSnapshot(query(collection(fs,p)),{includeMetadataChanges:true},s=>ok(s.docs.map(d=>[d.id,d.data()]),s.metadata.fromCache),e=>{console.warn(p,e);revisarAcceso(e);ko&&ko(err(e))});
const escCol=(p,...cons)=>(ok,ko)=>onSnapshot(query(collection(fs,p),...cons),s=>ok(s.docs.map(d=>[d.id,d.data()]),s.metadata.fromCache),e=>{console.warn(p,e);revisarAcceso(e);ko&&ko(err(e))});

/* ---------- quién soy ---------- */
const CU={uid:"",usuario:"",rol:"",alumno:"",profe:"",nombre:""};
/* Mostrador: trabaja como dirección (horarios, altas, fichas) pero sin recibos, Argos ni accesos del equipo */
const centro=()=>CU.rol==="dir"||CU.rol==="mos";

/* ---------- alumnos: alumnos/<id> + privado/<id> ----------
   En alumnos/<id> va solo lo que pueden ver sus profesoras; además, dirección calcula ahí profes (qué profesoras
   le dan clase, para las reglas) y _d (nivel, recibos pendientes y horas estimadas de sesión). Todo lo demás, en privado. */
const CORE=new Set(["nombre","clases","faltas","asist","token","trasHechos","foto","telefonos","bloqueado","actualizado","puntuales","confOk","extras"]);
const AL={core:new Map(),priv:new Map(),okC:false,okP:false,subs:0};
const KV={claves:new Map(),cuentas:new Map(),okK:false,okQ:false,altas:null};
function partir(d){const c={},p={};for(const [k,v] of Object.entries(d||{})){if(k==="profes"||k==="_d")continue;(CORE.has(k)?c:p)[k]=v}return [c,p]}
function unir(id){const c=AL.core.get(id),p=AL.priv.get(id);if(!c&&!p)return null;const o={...(p||{}),...(c||{})};delete o.profes;delete o._d;return o}
let escuchandoAl=false;const avisosAl=new Set();
function escucharAlumnos(){
  if(escuchandoAl)return;escuchandoAl=true;
  juntos([escColM("alumnos"),escColM("privado")],v=>v,([c,p],fc)=>{
    AL.core=new Map(c);AL.priv=new Map(p);AL.okC=AL.okP=true;AL.fc=!!fc;const ids=[...new Set([...AL.core.keys(),...AL.priv.keys()])];
    const s=snapQ(ids.map(id=>falso(id,unir(id))),fc);for(const f of avisosAl)try{f.ok(s)}catch(e){console.error(e)}
  },e=>{for(const f of avisosAl)f.ko&&f.ko(e)});
}
async function clavesDeAlumno(id,patch,antes){
  if(!["usuario","clave","bloqueado"].some(k=>k in (patch||{})))return;
  const a={...(antes||{}),...patch},u=nU(a.usuario),old=antes&&nU(antes.usuario);
  if(old&&old!==u){const k=KV.claves.get(old);if(k&&k.rol==="alumno"&&k.alumno===id){try{await deleteDoc(doc(fs,"claves/"+old))}catch(_){}}}
  if(!u)return;
  const k=KV.claves.get(u);if(k&&k.rol!=="alumno")return;if(k&&k.alumno&&k.alumno!==id&&AL.core.has(k.alumno))return;
  await setDoc(doc(fs,"claves/"+u),{clave:nC(a.clave),rol:"alumno",alumno:id,bloqueado:!!a.bloqueado||!nC(a.clave)},{merge:true});
}
const alDoc=id=>({
  get:guard(async()=>{const [c,p]=await Promise.all([getDoc(doc(fs,"alumnos/"+id)),getDoc(doc(fs,"privado/"+id))]);const d=c.exists()||p.exists()?{...(p.exists()?p.data():{}),...(c.exists()?c.data():{})}:null;if(d){delete d.profes;delete d._d}return falso(id,d)}),
  set:guard(async d=>{d=limpio(d);const antes=unir(id),[c,p]=partir(d),vc=AL.core.get(id)||{};
    await Promise.all([setDoc(doc(fs,"alumnos/"+id),{...c,profes:vc.profes||[],_d:vc._d||{}}),setDoc(doc(fs,"privado/"+id),p)]);
    AL.core.set(id,{...c,profes:vc.profes||[],_d:vc._d||{}});AL.priv.set(id,p);
    await clavesDeAlumno(id,{usuario:d.usuario,clave:d.clave,bloqueado:d.bloqueado},antes)}),
  update:guard(async patch=>{patch=limpio(patch);const antes=unir(id),[c,p]=partir(patch);
    const up=async(col,x)=>{if(!Object.keys(x).length)return;try{await updateDoc(doc(fs,col+"/"+id),x)}catch(e){if(e&&e.code==="not-found")await setDoc(doc(fs,col+"/"+id),x,{merge:true});else throw e}};
    await Promise.all([up("alumnos",c),up("privado",p)]);
    if(AL.core.has(id))AL.core.set(id,{...AL.core.get(id),...c});AL.priv.set(id,{...(AL.priv.get(id)||{}),...p});
    await clavesDeAlumno(id,patch,antes)}),
  delete:guard(async()=>{const a=unir(id);await Promise.all([deleteDoc(doc(fs,"alumnos/"+id)),deleteDoc(doc(fs,"privado/"+id))]);
    const u=a&&nU(a.usuario),k=u&&KV.claves.get(u);if(k&&k.rol==="alumno"&&k.alumno===id){try{await deleteDoc(doc(fs,"claves/"+u))}catch(_){}}}),
  onSnapshot:(ok,ko)=>{const f={ok:s=>ok(s.docs.find(d=>d.id===id)||falso(id,null)),ko};avisosAl.add(f);escucharAlumnos();return ()=>avisosAl.delete(f)},
  acquire:async()=>({acquired:true}),release:nada});
const alCol={
  doc:alDoc,limit:()=>alCol,where:()=>alCol,
  get:guard(async()=>{const [c,p]=await Promise.all([getDocs(collection(fs,"alumnos")),getDocs(collection(fs,"privado"))]);
    const cm=new Map(c.docs.map(d=>[d.id,d.data()])),pm=new Map(p.docs.map(d=>[d.id,d.data()]));
    return snapQ([...new Set([...cm.keys(),...pm.keys()])].map(id=>{const o={...(pm.get(id)||{}),...(cm.get(id)||{})};delete o.profes;delete o._d;return falso(id,o)}))}),
  onSnapshot:(ok,ko)=>{const f={ok,ko};avisosAl.add(f);escucharAlumnos();if(AL.okC&&AL.okP){const ids=[...new Set([...AL.core.keys(),...AL.priv.keys()])];ok(snapQ(ids.map(id=>falso(id,unir(id)))))}return ()=>avisosAl.delete(f)}};

/* ---------- cuentas y claves (dirección) ---------- */
const avisosCu=new Set();
let escuchandoCu=false;
function escucharCuentas(){
  if(escuchandoCu)return;escuchandoCu=true;
  if(CU.rol==="mos"){
    onSnapshot(query(collection(fs,"claves"),where("rol","==","alumno")),s=>{KV.claves=new Map(s.docs.map(d=>[d.id,d.data()]));KV.okK=true;emitirCu()},e=>console.warn("claves",e));
    KV.okQ=true;
    onSnapshot(doc(fs,"publico/datos"),s=>{const pu=(s.exists()&&s.data().profesUid)||{};KV.profesUid=pu;emitirCu()},e=>console.warn("publico",e));
    return}
  onSnapshot(collection(fs,"claves"),s=>{KV.claves=new Map(s.docs.map(d=>[d.id,d.data()]));KV.okK=true;emitirCu()},e=>console.warn("claves",e));
  onSnapshot(collection(fs,"cuentas"),s=>{KV.cuentas=new Map(s.docs.map(d=>[d.id,d.data()]));KV.okQ=true;emitirCu()},e=>console.warn("cuentas",e));
}
function vigentes(){const o=[];for(const [uid,c] of KV.cuentas){const k=KV.claves.get(c.usuario);if(k&&!k.bloqueado&&k.clave&&k.clave===c.clave)o.push([uid,c.usuario,k])}return o}
function emitirCu(){if(!KV.okK||!KV.okQ)return;const pr={},al={};if(CU.rol==="mos")for(const [p,us] of Object.entries(KV.profesUid||{}))for(const u of us||[])pr[u]=p;for(const [uid,,k] of vigentes()){if(k.rol==="profe"&&k.profe)pr[uid]=k.profe;else if(k.rol==="alumno"&&k.alumno)al[uid]=k.alumno}
  for(const f of avisosCu)try{f(pr,al)}catch(e){console.error(e)}}
const cfgCuentas=tipo=>({
  get:async()=>{const v=vigentes(),o={};for(const [uid,,k] of v){if(tipo==="profesoras"&&k.rol==="profe")o[uid]=k.profe;if(tipo==="alumnos"&&k.rol==="alumno")o[uid]=k.alumno}return falso(tipo,{cuentas:o})},
  set:nada,update:nada,delete:nada,
  onSnapshot:(ok)=>{const f=(pr,al)=>ok(falso(tipo,{cuentas:tipo==="profesoras"?pr:al}));avisosCu.add(f);escucharCuentas();emitirCu();return ()=>avisosCu.delete(f)}});
/* «Quitar acceso» desde dirección: a una profesora se le bloquea el usuario; a un alumno se le pone una clave nueva. */
async function revocar(uid){
  const c=KV.cuentas.get(uid);if(!c)return;const k=KV.claves.get(c.usuario);
  if(k&&k.rol==="alumno"&&k.alumno){const nueva=window.nuevaClave?window.nuevaClave():hexId().slice(0,6);
    await setDoc(doc(fs,"claves/"+c.usuario),{clave:nueva,activado:false},{merge:true});
    try{await updateDoc(doc(fs,"privado/"+k.alumno),{clave:nueva})}catch(_){}}
  else if(k&&k.rol!=="dir")await setDoc(doc(fs,"claves/"+c.usuario),{bloqueado:true},{merge:true});
  try{await deleteDoc(doc(fs,"cuentas/"+uid))}catch(_){}
}

/* ---------- copias para profesoras y alumnos (lo que antes eran prof/<cuenta>/alumnos) ---------- */
const COP=new Map();   // id -> copia (profesora: sus alumnos; alumno: él mismo)
const SL=new Map();    // id -> última parte del buzón escrita para ese alumno (profesora)
function copiaProfe(id,c,uids){const d=c._d||{},o={...c,nivel:d.nivel||"",pendRec:d.pendRec||0,cuentas:uids,cuad:d.cuad?1:0};if(d.acc&&d.acc.u)o.acc=d.acc;if(d.ent)o.ent=true;if(d.env&&d.env.t)o.env=d.env;delete o.profes;delete o._d;return o}
function copiaAlumno(id,c,p){
  if(!c)return null;const est=(c._d&&c._d.est)||{};
  const o={...c,recibos:(p&&p.recibos)||[],petResp:(p&&p.petResp)||{},msgResp:(p&&p.msgResp)||{},avisosHorario:(p&&p.avisosHorario)||[]};
  if(p&&(p.inscripciones||[]).length)o.inscripciones=p.inscripciones;if(p&&p.baja)o.baja=p.baja;if(p&&p.nivel)o.nivelManual=p.nivel;
  o.nivel=(c._d&&c._d.nivel)||"";
  o.clases=(c.clases||[]).map(x=>{const e=est[x.dia+"|"+x.hora+"|"+x.profe];return e&&!(x.ini&&x.tipo)?{...x,est:e}:x});
  delete o.profes;delete o._d;return o;
}
const misCopias={
  doc:()=>({get:async()=>falso("x",null),set:nada,update:nada,delete:nada,onSnapshot:()=>()=>{}}),limit:()=>misCopias,where:()=>misCopias,
  get:async()=>snapQ([...COP].map(([id,c])=>falso(id,c))),
  onSnapshot:(ok,ko)=>{
    if(CU.rol==="profe")return juntos([escCol("alumnos",where("profes","array-contains",CU.profe)),escCol("buzon",where("profes","array-contains",CU.profe))],v=>v,([als,bz],fc)=>{
      const uids=new Map();for(const [u,d] of bz)if(d&&d.alumno){if(!uids.has(d.alumno))uids.set(d.alumno,[]);uids.get(d.alumno).push(u)}
      COP.clear();for(const [id,c] of als)COP.set(id,copiaProfe(id,c,(uids.get(id)||[]).sort()));
      ok(snapQ([...COP].map(([id,c])=>falso(id,c)),fc))},ko);
    if(CU.rol==="alumno"&&CU.alumno)return juntos([escDoc("alumnos/"+CU.alumno),escDoc("privado/"+CU.alumno)],v=>v,([c,p],fc)=>{
      COP.clear();const o=copiaAlumno(CU.alumno,c,p);if(o)COP.set(CU.alumno,o);ok(snapQ([...COP].map(([id,c])=>falso(id,c)),fc))},ko);
    ok(snapQ([]));return ()=>{};
  }};
/* La profesora escribe su buzón entero (solo lo ven dirección y las demás profesoras) y, aparte, a cada alumno le deja
   solo lo suyo: respuestas a sus peticiones, horas confirmadas, asistencia y mensajes. */
const pick=(o,f)=>{const r={};for(const [k,v] of Object.entries(o||{}))if(v&&f(k,v))r[k]=v;return r};
async function repartirBuzon(d){
  if(CU.rol!=="profe")return;
  const tareas=[];
  for(const [id,a] of COP){const T=a.token;if(!T)continue;const us=new Set(a.cuentas||[]);
    const s={alumno:id,profe:CU.profe,profeUid:CU.uid,ses:pick(d.ses,k=>k.startsWith(T+"|")),asis:pick(d.asis,k=>k.startsWith(T+"|")),
      res:pick(d.res,(k,v)=>v.tok===T),pres:pick(d.pres,(k,v)=>v.tok===T),chatR:pick(d.chatR,(k,v)=>us.has(v.to))};
    const vacio=!Object.keys(s.ses).length&&!Object.keys(s.asis).length&&!Object.keys(s.res).length&&!Object.keys(s.pres).length&&!Object.keys(s.chatR).length;
    const prev=SL.get(id);if(vacio&&!prev)continue;if(prev&&stable(prev)===stable(s))continue;
    tareas.push(setDoc(doc(fs,"buzonAl/"+id+"__"+CU.uid),limpio(s)).then(()=>SL.set(id,s)).catch(e=>console.warn("buzonAl",id,e)));
  }
  await Promise.all(tareas);
}
async function cargarPartes(){if(CU.rol!=="profe")return;try{const s=await getDocs(query(collection(fs,"buzonAl"),where("profeUid","==",CU.uid)));s.docs.forEach(d=>SL.set(d.data().alumno,d.data()))}catch(e){console.warn("partes",e)}}

/* ---------- buzones ---------- */
function buzonDoc(uid){
  if(CU.rol==="profe"&&uid===CU.uid){const r=rawDoc("buzonProf/"+uid);return {...r,set:guard(async d=>{d=limpio({...d,profe:CU.profe});await setDoc(doc(fs,"buzonProf/"+uid),d);repartirBuzon(d)})}}
  if(CU.rol==="alumno"&&uid===CU.uid){const r=rawDoc("buzon/"+uid);return {...r,set:guard(async d=>{await setDoc(doc(fs,"buzon/"+uid),limpio({...d,alumno:CU.alumno}))})}}
  if(CU.rol==="dir"){const r=rawDoc("buzon/"+uid);return {...r,delete:guard(async()=>{await Promise.allSettled([deleteDoc(doc(fs,"buzon/"+uid)),deleteDoc(doc(fs,"buzonProf/"+uid))])})}}
  return rawDoc("buzon/"+uid);
}
function buzonCol(filtro){
  const self={doc:buzonDoc,limit:()=>self,where:(f,op,v)=>buzonCol({f,op,v}),
    get:async()=>{if(CU.rol==="dir"){const [a,b]=await Promise.all([getDocs(collection(fs,"buzon")),getDocs(collection(fs,"buzonProf"))]);return snapQ([...a.docs,...b.docs].map(W))}return snapQ([])},
    onSnapshot:(ok,ko)=>{
      if(CU.rol==="mos")return escCol("buzonProf")(l=>ok(snapQ(l.map(([id,d])=>falso(id,d)))),ko);
      if(CU.rol==="dir")return juntos([escCol("buzon"),escCol("buzonProf")],v=>v,([a,b],fc)=>ok(snapQ([...a,...b].map(([id,d])=>falso(id,d)),fc)),ko);
      if(CU.rol==="profe"&&filtro&&filtro.f==="profes")return rawCol("buzon").where("profes","array-contains",CU.profe).onSnapshot(ok,ko);
      if(CU.rol==="profe"&&filtro&&filtro.f==="profe")return rawCol("buzonProf").where("profe","in",filtro.v.slice(0,30)).onSnapshot(ok,ko);
      if(CU.rol==="alumno"&&filtro&&filtro.f==="profe")return escCol("buzonAl",where("alumno","==",CU.alumno))(l=>ok(snapQ(l.map(([,d])=>falso(d.profeUid,{profe:d.profe,ses:d.ses||{},asis:d.asis||{},res:d.res||{},pres:d.pres||{},chatR:d.chatR||{}})))),ko);
      ok(snapQ([]));return ()=>{};
    }};
  return self;
}

/* ---------- la base de datos que ve la app ---------- */
const VACIO={get:async()=>falso("x",null),set:nada,update:nada,delete:nada,onSnapshot:ok=>{setTimeout(()=>ok(falso("x",null)));return ()=>{}},acquire:async()=>({acquired:true}),release:nada};
const VACIA={doc:()=>VACIO,limit:()=>VACIA,where:()=>VACIA,get:async()=>snapQ([]),onSnapshot:ok=>{setTimeout(()=>ok(snapQ([])));return ()=>{}}};
const db={
  doc(p){const s=p.split("/");
    if(s[0]==="alumnos"&&s.length===2)return centro()?alDoc(s[1]):rawDoc(p);
    if(s[0]==="buzon"&&s.length===2)return buzonDoc(s[1]);
    if(s[0]==="solicitudes"||p==="publico/alta"||p==="config/alta"||p==="config/intentos"||p==="config/turno-usuarios")return VACIO;
    if(p==="config/profesoras"||p==="config/alumnos")return cfgCuentas(s[1]);
    if(s[0]==="prof"&&s.length===2){
      if(s[1]===CU.uid&&CU.rol!=="dir"){const d={rol:CU.rol,profe:CU.profe,alumno:CU.alumno,desde:""};return {...VACIO,get:async()=>falso(s[1],d),onSnapshot:ok=>{setTimeout(()=>ok(falso(s[1],d)));return ()=>{}}}}
      if(CU.rol==="dir")return {...VACIO,get:async()=>{const c=KV.cuentas.get(s[1]),k=c&&KV.claves.get(c.usuario);return falso(s[1],k?{rol:k.rol==="alumno"?"alumno":"profe",profe:k.profe||"",alumno:k.alumno||""}:null)},delete:guard(()=>revocar(s[1]))};
      return VACIO}
    if(s[0]==="prof")return VACIO;
    return rawDoc(p)},
  collection(p){const s=p.split("/");
    if(p==="alumnos")return centro()?alCol:VACIA;
    if(p==="buzon")return buzonCol(null);
    if(s[0]==="prof"&&s.length===3)return s[1]===CU.uid&&CU.rol!=="dir"?misCopias:VACIA;
    if(p==="solicitudes")return VACIA;
    return rawCol(p)}
};

/* ---------- archivos (fotos y PDF), dentro de Firestore en trozos ---------- */
const TROZO=700000;
const CACHE=new Map();
const aDataUrl=f=>new Promise((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(r.result);r.onerror=ko;r.readAsDataURL(f)});
const assets={
  upload:guard(async(file,meta={})=>{
    const url=await aDataUrl(file),id=hexId(),n=Math.ceil(url.length/TROZO);
    const base={tipo:file.type||"application/octet-stream",clase:meta.clase||((file.type||"").startsWith("image/")?"foto":"doc"),alumno:meta.alumno||(CU.rol==="alumno"?CU.alumno:""),publico:!!meta.publico,owner:CU.uid,t:ahora(),n,...(meta.profe!=null?{profe:String(meta.profe)}:{})};
    if(n===1)await setDoc(doc(fs,"archivos/"+id),{...base,d:url});
    else{await setDoc(doc(fs,"archivos/"+id),base);for(let i=0;i<n;i++)await setDoc(doc(fs,`archivos/${id}/p/${i}`),{d:url.slice(i*TROZO,(i+1)*TROZO)})}
    CACHE.set(id,url);return {id,url:"#b="+id}}),
  delete:guard(async id=>{try{const s=await getDoc(doc(fs,"archivos/"+id));const n=s.exists()?(s.data().n||1):1;if(n>1)for(let i=0;i<n;i++)await deleteDoc(doc(fs,`archivos/${id}/p/${i}`))}catch(_){}
    await deleteDoc(doc(fs,"archivos/"+id));CACHE.delete(id)})};
const cargando=new Map();
function cargarArchivo(id){
  if(CACHE.has(id))return Promise.resolve(CACHE.get(id));
  if(cargando.has(id))return cargando.get(id);
  const p=(async()=>{const s=await getDoc(doc(fs,"archivos/"+id));if(!s.exists())throw new Error("no");const d=s.data();let url=d.d||"";
    if(!url&&d.n>1){for(let i=0;i<d.n;i++){const x=await getDoc(doc(fs,`archivos/${id}/p/${i}`));url+=x.exists()?x.data().d:""}}
    CACHE.set(id,url);return url})().finally(()=>cargando.delete(id));
  cargando.set(id,p);return p;
}
const aBlob=async url=>(await fetch(url)).blob();
/* Las imágenes llevan src="…#b=<id>" y se rellenan aquí; los enlaces a PDF llevan data-blob="<id>" */
const TR="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
function hidratar(root){
  root.querySelectorAll&&root.querySelectorAll('img[src*="#b="]').forEach(img=>{const id=img.getAttribute("src").split("#b=")[1];if(!id||img.dataset.cargando===id)return;img.dataset.cargando=id;
    if(CACHE.has(id)){img.src=CACHE.get(id);return}img.src=TR;cargarArchivo(id).then(u=>{img.src=u}).catch(()=>{img.style.visibility="hidden"})});
}
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)hidratar(n.parentNode||n)}).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener("click",async e=>{const a=e.target.closest("[data-blob]");if(!a)return;e.preventDefault();e.stopPropagation();
  const w=window.open("","_blank");try{const u=await cargarArchivo(a.dataset.blob);const b=URL.createObjectURL(await aBlob(u));if(w)w.location=b;else location.href=b}catch(_){if(w)w.close();alert("No se ha podido abrir el archivo")}},true);

const downloads={save:async({filename,data})=>{const u=URL.createObjectURL(data instanceof Blob?data:new Blob([data]));const a=document.createElement("a");a.href=u;a.download=filename||"archivo";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},5000)}};
const user={id:async()=>CU.uid,canEdit:async()=>centro(),isOwner:async()=>centro(),
  profiles:async ids=>{const o={};for(const id of ids){const c=KV.cuentas.get(id);if(!c)continue;const k=KV.claves.get(c.usuario)||{};
    const al=k.alumno&&unir(k.alumno);o[id]={name:k.nombre||(al&&al.nombre?al.nombre.toLowerCase().replace(/(^|\s)\S/g,m=>m.toUpperCase()):"")||c.usuario,email:"Usuario "+c.usuario}}return o}};

/* ---------- utilidades para la app (dirección) ---------- */
const F={
  CU,stable,claveAlta,credDe,
  listo:()=>KV.okK&&KV.okQ&&AL.okC&&AL.okP&&!AL.fc,
  coreDe:id=>AL.core.get(id)||null,
  coreUpdate:async(id,d)=>{await updateDoc(doc(fs,"alumnos/"+id),limpio(d));AL.core.set(id,{...(AL.core.get(id)||{}),...d})},
  privUpdate:async(id,d)=>{await updateDoc(doc(fs,"privado/"+id),limpio(d));AL.priv.set(id,{...(AL.priv.get(id)||{}),...d})},
  clave:u=>KV.claves.get(nU(u))||null,
  claves:()=>[...KV.claves.entries()],
  setClave:async(u,d)=>{await setDoc(doc(fs,"claves/"+nU(u)),limpio(d),{merge:true})},
  delClave:async u=>{await deleteDoc(doc(fs,"claves/"+nU(u)))},
  usuarioActivo:u=>{u=nU(u);const k=KV.claves.get(u);if(!k)return false;for(const c of KV.cuentas.values())if(c.usuario===u&&c.clave===k.clave)return true;return false},
  cuentasDeUsuario:u=>[...KV.cuentas].filter(([,c])=>c.usuario===nU(u)).map(([uid])=>uid),
  borrarCuenta:async uid=>{await deleteDoc(doc(fs,"cuentas/"+uid))},
  async sincronizarAltas(want){
    if(!KV.altas){const s=await getDocs(collection(fs,"altas"));KV.altas=new Map(s.docs.map(d=>[d.id,d.data()]))}
    const t=[];
    for(const [k,v] of want){const x={us:v.us,l:v.l};if(stable(KV.altas.get(k))!==stable(x))t.push(setDoc(doc(fs,"altas/"+k),x).then(()=>KV.altas.set(k,x)))}
    for(const k of [...KV.altas.keys()])if(!want.has(k))t.push(deleteDoc(doc(fs,"altas/"+k)).then(()=>KV.altas.delete(k)));
    await Promise.allSettled(t);return t.length},
  salir:async()=>{try{await signOut(auth)}catch(_){}location.reload()},
  blob:cargarArchivo,TR,
  /* Envío del mensaje de acceso por WhatsApp: cada cuenta lo apunta en su propio buzón (accEnv), así no pisa a nadie */
  marcarEnvio:async id=>{if(!CU.uid||!["dir","mos","profe"].includes(CU.rol))return;
    const col=CU.rol==="dir"?"buzon":"buzonProf",por=CU.rol==="profe"?CU.profe:CU.rol==="mos"?(CU.nombre||"Recepción"):(CU.nombre||"Dirección");
    const d={accEnv:{[id]:{t:ahora(),por}}};if(CU.rol==="profe")d.profe=CU.profe;
    await setDoc(doc(fs,col+"/"+CU.uid),d,{merge:true});return d.accEnv[id]},
  entradaDe:u=>{u=nU(u);let t="";for(const c of KV.cuentas.values())if(c.usuario===u&&c.t&&(!t||c.t<t))t=c.t;return t}
};
window.__fb=F;
/* ---------- Registro de jornada (fichajes, 08/11/2026) ----------
   fichajes/<auto> = {tipo:"entrada"|"salida"|"solicitud"|"ajuste"|"rechazo", profe, dia, por, uid, t} con t = hora del servidor
   (las reglas exigen t == request.time: nadie puede poner otra hora). Solo se crean: no se cambian ni se borran. Una corrección
   es un documento nuevo (solicitud de la profesora → ajuste o rechazo de dirección). fichPin/<profe> = {h} (hash del PIN del mostrador). */
const tDe=d=>{const x=d.data({serverTimestamps:"estimate"});const t=x.t&&x.t.toDate?x.t.toDate():new Date();return {id:d.id,...x,t:t.toISOString(),ms:t.getTime()}};
window.__fich={
  crear:o=>vigilar(addDoc(collection(fs,"fichajes"),{...o,uid:CU.uid,t:serverTimestamp()})),
  escuchar:(desde,ok,ko)=>{const q=CU.rol==="profe"?query(collection(fs,"fichajes"),where("profe","==",CU.profe)):query(collection(fs,"fichajes"),where("dia",">=",desde));
    return onSnapshot(q,{includeMetadataChanges:false},s=>ok(s.docs.map(tDe)),e=>{console.warn("fichajes",e);ko&&ko(e)})},
  pines:(ok,ko)=>onSnapshot(collection(fs,"fichPin"),s=>{const o={};s.docs.forEach(d=>o[d.id]=d.data().h);ok(o)},e=>{ko&&ko(e)}),
  ponerPin:async(profe,h)=>{await vigilar(setDoc0(doc(fs,"fichPin/"+profe),{h,t:new Date().toISOString()}))}};

/* ---------- entrada ---------- */
async function cargarPerfil(){
  const u=auth.currentUser;if(!u)throw new Error("sin");
  const c=await getDoc(doc(fs,"cuentas/"+u.uid));if(!c.exists())throw new Error("sincuenta");
  const cu=c.data();let k;
  try{k=await getDoc(doc(fs,"claves/"+cu.usuario))}catch(e){throw new Error("caducada")}
  if(!k.exists())throw new Error("caducada");const kd=k.data();
  Object.assign(CU,{uid:u.uid,usuario:cu.usuario,rol:kd.rol,alumno:kd.alumno||"",profe:kd.profe||"",nombre:kd.nombre||""});
  if(kd.rol==="alumno"&&!kd.activado){try{await updateDoc(doc(fs,"claves/"+cu.usuario),{activado:true})}catch(e){console.warn("activado",e)}}
}
async function asegurarCuenta(u,c){
  const ref=doc(fs,"cuentas/"+auth.currentUser.uid);let s=null;try{s=await getDoc(ref)}catch(_){}
  if(s&&s.exists()&&s.data().usuario===u&&s.data().clave===c)return;
  try{await setDoc(ref,{usuario:u,clave:c,t:ahora()})}
  catch(e){try{await deleteUser(auth.currentUser)}catch(_){try{await signOut(auth)}catch(_){}}throw new Error("cred")}
}
async function entrarCon(u,c){
  const {email,pw}=await credDe(u,c);
  try{await signInWithEmailAndPassword(auth,email,pw)}
  catch(e){
    if(e.code==="auth/too-many-requests")throw new Error("muchos");
    if(e.code==="auth/network-request-failed")throw new Error("red");
    try{await createUserWithEmailAndPassword(auth,email,pw)}
    catch(e2){if(e2.code==="auth/email-already-in-use")await signInWithEmailAndPassword(auth,email,pw);
      else if(e2.code==="auth/too-many-requests"||e2.code==="auth/quota-exceeded")throw new Error("muchos");
      else if(e2.code==="auth/network-request-failed")throw new Error("red");else throw e2}
  }
  await asegurarCuenta(u,c);
}
async function cuentaNueva(u,c){const {email,pw}=await credDe(u,c);
  try{await createUserWithEmailAndPassword(auth,email,pw)}catch(e){if(e.code==="auth/email-already-in-use")await signInWithEmailAndPassword(auth,email,pw);else throw e}}

/* ---------- pantallas de entrada ---------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const logo=()=>{try{return typeof LOGO==="string"&&LOGO?`<div class="logo"><img src="${LOGO}" alt="Althea Formación" style="height:72px"></div>`:""}catch(_){return ""}};
const claveOk=c=>/^(?=.*[a-z])(?=.*\d)[a-z0-9]{6,12}$/.test(c);
const L={modo:"entrar",err:"",msg:"",alta:null,ocupado:false};
const ERR={cred:"El usuario o la clave no son correctos. Revísalos y vuelve a probar.",muchos:"Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.",
  red:"No hay conexión. Comprueba el wifi o los datos del móvil.",caducada:"Tu clave ha cambiado o tu acceso está bloqueado. Entra con la clave nueva o pregunta en el centro.",
  bloqueado:"Este acceso está bloqueado. Pregunta en el centro.",noalta:"No encontramos a nadie con ese nombre y ese móvil. Revisa los datos o pregunta en recepción.",
  yaalta:"Este alumno ya tiene acceso. Entra con su usuario y su clave, o pide una clave nueva en el centro."};
function pantalla(){
  document.body.classList.add("home");const app=$("#app");if(!app)return;
  const e=L.err?`<p class="err" role="alert">${esc(ERR[L.err]||L.err)}</p>`:"",m=L.msg?`<p class="note" role="status">${esc(L.msg)}</p>`:"";
  if(L.modo==="instalar"){app.innerHTML=`<section class="login">${logo()}<div><h2>Puesta en marcha</h2><p class="note" style="font-size:14px;margin:6px 0 0">La web está vacía. Crea el usuario de dirección: con él cargarás los datos y darás de alta al resto del equipo. Solo se hace una vez.</p></div>
    <form id="fin" autocomplete="off"><label class="f">Tu nombre<input id="in-n" type="text" maxlength="60" placeholder="Por ejemplo, Agustín"></label>
    <label class="f">Usuario de dirección<input id="in-u" type="text" autocapitalize="none" spellcheck="false" value="direccion"></label>
    <label class="f">Clave (6 a 12 letras y números)<input id="in-c" type="text" autocapitalize="none" spellcheck="false" maxlength="12"></label>${e}
    <button class="btn primary" type="submit" ${L.ocupado?"disabled":""}>Crear y entrar</button></form></section>`;return}
  if(L.modo==="alta"){const x=L.alta;
    app.innerHTML=`<section class="login">${logo()}${!x?`<div><h2>Primera vez</h2><p class="note" style="font-size:14px;margin:6px 0 0">Si aún no tienes clave, te reconocemos por el nombre del alumno y el móvil que diste en el centro.</p></div>
    <form id="fal" autocomplete="off"><label class="f">Nombre del alumno<input id="al-n" type="text" maxlength="40" placeholder="Solo el nombre, por ejemplo, María"></label>
    <label class="f">Móvil que diste en el centro<input id="al-t" type="tel" inputmode="numeric" maxlength="15" placeholder="6XX XXX XXX"></label>${e}
    <button class="btn primary" type="submit" ${L.ocupado?"disabled":""}>Continuar</button></form>`
    :`<div><h2>Elige tu clave</h2><p class="note" style="font-size:14px;margin:6px 0 0">${x.l.length>1?"Elige el alumno y escribe":"Hola. Vas a entrar como <b>"+esc(x.l[0].n)+"</b>. Escribe"} una clave de 6 a 12 letras y números. Apúntala: con ella y tu usuario <b class="cred" id="al-us">${esc(x.l[0].u)}</b> podrás entrar desde otro móvil.</p></div>
    <form id="fcl" autocomplete="off">${x.l.length>1?`<label class="f">Alumno<select id="al-s">${x.l.map((y,i)=>`<option value="${i}">${esc(y.n)}</option>`).join("")}</select></label>`:""}
    <label class="f">Clave nueva<input id="al-c" type="password" autocomplete="new-password" autocapitalize="none" maxlength="12"></label>
    <label class="f">Repite la clave<input id="al-c2" type="password" autocomplete="new-password" autocapitalize="none" maxlength="12"></label>${e}
    <button class="btn primary" type="submit" ${L.ocupado?"disabled":""}>Guardar y entrar</button></form>`}
    <button class="btn" data-l="entrar">Ya tengo usuario y clave</button></section>`;return}
  app.innerHTML=`<section class="login">${logo()}<div><h2>Horarios Althea</h2><p class="note" style="font-size:14px;margin:6px 0 0">Entra con el usuario y la clave que te da el centro. En este móvil solo tendrás que escribirlo una vez.</p></div>
    <form id="flg" autocomplete="on"><label class="f">Usuario<input type="text" id="lg-u" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Por ejemplo, mariagar"></label>
    <label class="f">Clave<input type="password" id="lg-c" autocomplete="current-password" autocapitalize="none" spellcheck="false" maxlength="12" placeholder="Tu clave"></label>${e}${m}
    <button class="btn primary" type="submit" ${L.ocupado?"disabled":""}>${L.ocupado?"Entrando…":"Entrar"}</button></form>
    <button class="btn" data-l="alta">Es mi primera vez y no tengo clave</button>
    <p class="note">¿Aún no eres alumno? La inscripción se hace en recepción.</p></section>`;
  const i=$("#lg-u");if(i&&!L.ocupado)i.focus();
}
const fallo=e=>{L.ocupado=false;const m=e&&e.message;L.err=ERR[m]?m:(m==="sincuenta"?"cred":"red");console.warn(e);pantalla()};
document.addEventListener("click",e=>{const b=e.target.closest("[data-l]");if(!b)return;L.modo=b.dataset.l;L.err="";L.alta=null;pantalla()});
document.addEventListener("submit",async e=>{
  const f=e.target;if(!["flg","fal","fcl","fin"].includes(f.id))return;e.preventDefault();if(L.ocupado)return;L.err="";L.msg="";
  if(f.id==="flg"){const u=nU($("#lg-u").value),c=nC($("#lg-c").value);if(!u||!c){L.err="Escribe tu usuario y tu clave";pantalla();return}
    L.ocupado=true;pantalla();try{await entrarCon(u,c);await arrancar()}catch(x){fallo(x)}return}
  if(f.id==="fal"){const n=nNom($("#al-n").value),t=tel9($("#al-t").value);if(!n||t.length!==9){L.err="Escribe el nombre y los 9 números del móvil";pantalla();return}
    L.ocupado=true;pantalla();try{const key=await claveAlta(n,t),s=await getDoc(doc(fs,"altas/"+key));L.ocupado=false;
      if(!s.exists()){L.err="noalta";pantalla();return}L.alta={key,...s.data()};pantalla()}catch(x){fallo(x)}return}
  if(f.id==="fcl"){const x=L.alta,i=+(($("#al-s")||{}).value||0),y=x.l[i]||x.l[0],c=nC($("#al-c").value),c2=nC($("#al-c2").value);
    if(!claveOk(c)){L.err="La clave tiene que tener de 6 a 12 caracteres, con letras y números.";pantalla();return}
    if(c!==c2){L.err="Las dos claves no coinciden.";pantalla();return}
    L.ocupado=true;pantalla();
    try{await cuentaNueva(y.u,c);const b=writeBatch(fs);
      b.update(doc(fs,"claves/"+y.u),{clave:c,activado:true,altaKey:x.key});b.set(doc(fs,"cuentas/"+auth.currentUser.uid),{usuario:y.u,clave:c,t:ahora()});
      try{await vigilar(b.commit())}catch(e2){try{await deleteUser(auth.currentUser)}catch(_){await signOut(auth)}throw new Error("yaalta")}
      await arrancar()}catch(x){fallo(x)}return}
  if(f.id==="fin"){const n=String($("#in-n").value||"").trim().slice(0,60),u=nU($("#in-u").value),c=nC($("#in-c").value);
    if(!u){L.err="Escribe el usuario";pantalla();return}if(!claveOk(c)){L.err="La clave tiene que tener de 6 a 12 caracteres, con letras y números.";pantalla();return}
    L.ocupado=true;pantalla();
    try{await cuentaNueva(u,c);const uid=auth.currentUser.uid,b=writeBatch(fs);
      b.set(doc(fs,"publico/instalado"),{uid,t:ahora()});b.set(doc(fs,"claves/"+u),{clave:c,rol:"dir",nombre:n});b.set(doc(fs,"cuentas/"+uid),{usuario:u,clave:c,t:ahora()});
      await vigilar(b.commit());await arrancar()}catch(x){fallo(x)}return}
});

let arrancado=false;
async function arrancar(){
  try{await cargarPerfil()}catch(e){if(!auth.currentUser)throw e;await new Promise(r=>setTimeout(r,1200));await cargarPerfil()}
  if(arrancado)return;arrancado=true;
  if(centro())escucharCuentas();
  await cargarPartes();
  window.claude={use:async n=>({db,user,assets,downloads})[n]||null};
  L.ocupado=false;document.body.classList.remove("home");
  window.__fbResolver&&window.__fbResolver(CU);
}
/* Solo cuenta el estado con el que se abre la página: al entrar o crear una cuenta, Firebase vuelve a avisar
   y eso no debe interrumpir lo que se está haciendo. */
let primera=true;
/* ---------- Confirmación de citas (02/11/2026): URL_APP/?cita=<token>, sin entrar con usuario ----------
   Lee citas/<token> (solo tipo, nombre de pila, profesora, día y hora) y deja «Confirmo la cita» o «No puedo ir». */
const CITA=(new URLSearchParams(location.search).get("cita")||"").replace(/[^a-z0-9]/gi,"").slice(0,40);
/* Enlace a Google Maps del centro. Si tienes el enlace exacto de la ficha de Google, ponlo aquí. Foto: fachada.jpg junto a index.html. */
const CITA_MAPS="https://www.google.com/maps/search/?api=1&query="+encodeURIComponent("Althea Formación, Calle Iro 5, 11130 Chiclana de la Frontera, Cádiz");
const CITA_T={entrevista:"Entrevista con la familia",evaluacion:"Sesión de evaluación",psico:"Sesión psicopedagógica"};
const CITA_D=["domingo","lunes","martes","miércoles","jueves","viernes","sábado"],CITA_M=["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
async function paginaCita(msg){const app=$("#app");if(!app)return;document.body.classList.add("home");let c=null;
  try{const s=await getDoc(doc(fs,"citas/"+CITA));c=s.exists()?s.data():null}catch(_){c=null}
  const h=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");
  if(!c){app.innerHTML=`<section class="login"><div style="display:flex;justify-content:center;width:100%">${logo()}</div><div><h2>Cita no encontrada</h2><p class="note" style="font-size:15px">El enlace no es válido o la cita se ha cambiado. Si te han enviado otro mensaje, usa el enlace más reciente o llama al centro.</p></div></section>`;return}
  const d=new Date(c.fecha+"T12:00:00"),cuando=`${CITA_D[d.getDay()]} ${d.getDate()} de ${CITA_M[d.getMonth()]} a las ${h(+c.ini||0)}`,pasada=c.fecha<new Date().toISOString().slice(0,10);
  const est=c.noPuede&&(!c.conf||c.noPuede>c.conf)?"no":c.conf?"si":"";
  app.innerHTML=`<section class="login"><div style="display:flex;justify-content:center;width:100%">${logo()}</div><div><h2>${esc(CITA_T[c.tipo]||"Cita")}</h2>
    <p style="font-size:17px;margin:8px 0">${c.nombre?esc(c.nombre)+" · ":""}<b>${esc(cuando)}</b>${c.profe?` con ${esc(c.profe)}`:""}</p>
    <img src="fachada.jpg" alt="Recepción de Althea Formación" style="width:100%;height:200px;object-fit:cover;object-position:center 55%;border-radius:12px;margin:6px 0 4px;display:block" onerror="this.remove()">
    <p class="note" style="font-size:14px;margin:4px 0">Althea Formación · C/ Iro 5, 1.º C, 11130 Chiclana de la Frontera (Cádiz)</p>
    <a class="btn" href="${CITA_MAPS}" target="_blank" rel="noopener" style="display:inline-block;font-size:15px;padding:8px 14px;margin-top:2px">📍 Cómo llegar (Google Maps)</a></div>
    ${msg?`<p class="note" role="status" style="font-size:15px">${esc(msg)}</p>`:""}
    ${est==="si"?`<p style="font-size:16px;color:#1e7a3c"><b>Cita confirmada.</b> ¡Gracias, te esperamos!</p>`:est==="no"?`<p style="font-size:16px;color:#b3261e"><b>Nos has indicado que no puedes venir.</b> Te llamaremos para buscar otro día.</p>`:""}
    ${pasada?"":`<div style="display:flex;flex-direction:column;gap:10px">${est!=="si"?`<button class="btn primary" id="cita-si" style="font-size:16px;padding:12px">Confirmo la cita</button>`:""}${est!=="no"?`<button class="btn" id="cita-no" style="font-size:15px;padding:10px">No puedo ir</button>`:""}</div>`}</section>`;
  const marca=async k=>{try{await updateDoc(doc(fs,"citas/"+CITA),{[k]:ahora()});paginaCita(k==="conf"?"":"")}catch(_){paginaCita("No se ha podido guardar. Comprueba la conexión e inténtalo de nuevo, o llama al centro.")}};
  const si=$("#cita-si"),no=$("#cita-no");if(si)si.onclick=()=>{si.disabled=true;marca("conf")};if(no)no.onclick=()=>{no.disabled=true;marca("noPuede")}}
if(CITA)setTimeout(()=>paginaCita(""),0);
/* Preinscripción por enlace (03/11/2026): URL_APP/?pre=<token>, sin usuario. La página la pinta index.html; aquí solo se lee
   preins/<token> y se envían los datos, la firma y la conformidad (las reglas solo dejan pasar de «enviada» a «completada»). */
const PRE=(new URLSearchParams(location.search).get("pre")||"").replace(/[^a-z0-9]/gi,"").slice(0,40);
if(PRE){window.__pre={get:async()=>{const s=await getDoc(doc(fs,"preins/"+PRE));return s.exists()?s.data():null},enviar:async d=>{await updateDoc(doc(fs,"preins/"+PRE),d)}};setTimeout(()=>window.__preResolver&&window.__preResolver(),0)}
onAuthStateChanged(auth,async u=>{
  if(CITA||PRE)return;
  if(!primera||arrancado)return;primera=false;
  try{if(sessionStorage.getItem("fbmsg")){L.err=sessionStorage.getItem("fbmsg");sessionStorage.removeItem("fbmsg")}}catch(_){}
  if(u){try{await arrancar();return}catch(e){try{await signOut(auth)}catch(_){}L.err=e&&e.message==="caducada"?"caducada":"";}}
  try{const s=await getDoc(doc(fs,"publico/instalado"));L.modo=s.exists()?"entrar":"instalar"}catch(_){L.modo="entrar"}
  pantalla();
});
