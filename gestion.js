/* ============================================================================================
   Fase 2 · Gestión (31/10/2026): pestaña «Tarifas» y tarifa de cada alumno (matriz).
   Solo dirección (el mostrador no la ve).

   Datos:
   - config/recibos.tarifa = {cursos:{[CURSO]:{precio, desde, conf, nota, manual?, t, por, hist:[{precio,desde,t,por}]}}, t, por}
     Si un curso no está guardado, la app propone el precio: la cuota de Argos o, si Argos no la tiene,
     el importe más repetido en los recibos de los últimos meses («deducido», por confirmar).
     Un cambio de precio se guarda con su fecha «desde» y el anterior queda en hist; solo afecta a los recibos
     que se generen después (decisión de la dueña).
   - privado/<id>.matriz = {l:[{curso, aj?, mot?}], t, por}: qué cursos paga el alumno cada mes.
     aj = precio ajustado (precio especial) con su motivo obligatorio. Sin matriz guardada, la app propone
     la del último mes con recibos de Argos.
   - Vista previa del mes: lo que saldría en el recibo de cada alumno frente a lo que se cobró en Argos.
     Todavía no genera recibos (eso llega con la Caja, serie R27, arranque 1/1/2027).
   ============================================================================================ */
const GT={edit:null,filtro:"act",mes:"",todos:false,fila:null,nuevo:false,aj:null};
const nzC=s=>String(s||"").replace(/\s+/g," ").trim().toUpperCase();
const tfGuardada=()=>(S.recCfg&&S.recCfg.tarifa&&S.recCfg.tarifa.cursos)||{};
const gtNum=v=>{v=String(v??"").trim().replace(/\s|€/g,"").replace(",",".");return v===""?null:(isNaN(+v)?NaN:Math.round(+v*100)/100)};
const fmtNum=n=>n==null?"":String(n).replace(".",",");
const mesTxt=m=>{const [y,mm]=String(m).split("-").map(Number);return MESES[mm-1]+" "+y};

function modaImp(l){const m=new Map();for(const v of l){const k=Math.round(+v*100)/100;m.set(k,(m.get(k)||0)+1)}
  let b=null,n=0;for(const [k,c] of m)if(c>n||(c===n&&k>b)){b=k;n=c}return b==null?null:{v:b,n,total:l.length,otros:[...m].filter(([k])=>k!==b).sort((x,y)=>y[1]-x[1])}}

/* Todos los cursos de la tarifa, con el precio que vale hoy y de dónde sale. */
function tfCursos(){
  const g=tfGuardada(),argos=(S.argos&&S.argos.cursos)||[],desde=sumaDias(todayISO(),-100),porCurso=new Map(),alumnos=new Map();
  for(const [,a] of S.alumnos){
    for(const r of a.recibos||[])if(r&&r.curso&&r.importe!=null&&String(r.emitido||"")>=desde){const k=nzC(r.curso);if(!porCurso.has(k))porCurso.set(k,[]);porCurso.get(k).push(+r.importe)}
    if(a.baja||a.bloqueado||a.exento)continue;const set=new Set(matrizDe(a).l.map(l=>nzC(l.curso)));for(const k of set)alumnos.set(k,(alumnos.get(k)||0)+1)}
  const nombres=new Set([...Object.keys(g),...argos.filter(c=>c&&c.nombre&&(c.activos>0||c.cuota)).map(c=>nzC(c.nombre)),...porCurso.keys()]);
  const out=[];
  for(const n of nombres){if(!n)continue;const s=g[n],ca=argos.find(c=>c&&nzC(c.nombre)===n),md=modaImp(porCurso.get(n)||[]),cuota=ca&&+ca.cuota>0?+ca.cuota:null;
    let precio=null,origen="sin";
    if(s&&s.precio!=null){precio=+s.precio;origen="guardada"}else if(cuota!=null){precio=cuota;origen="argos"}else if(md){precio=md.v;origen="deducido"}
    const avisos=[];
    const antG=(s&&s.ant!=null&&s.ant!=="")?+s.ant:null;
    if(md&&precio!=null){if(md.v!==precio&&md.v!==antG)avisos.push(`En los recibos de Argos sale casi siempre a ${eur(md.v)} (${md.n} de ${md.total}).`);
      else{const o=md.otros.filter(([k])=>k!==antG&&k!==precio).slice(0,2);if(o.length)avisos.push(`Hay recibos a otro precio: ${o.map(([k,c])=>`${eur(k)} (${c})`).join(", ")}.`)}}
    if(origen==="argos"&&cuota!=null&&s==null&&ca&&ca.cobro&&ca.cobro!=="MENSUAL")avisos.push(`En Argos se cobra «${String(ca.cobro).toLowerCase()}», no cada mes.`);
    out.push({nombre:n,precio,ant:(s&&s.ant!=null&&s.ant!=="")?+s.ant:null,origen,conf:!!(s&&s.conf),nota:(s&&s.nota)||"",horas:horasDeCurso(n),alumnos:alumnos.get(n)||0,nRec:(porCurso.get(n)||[]).length,cuota,avisos,
      hist:(s&&Array.isArray(s.hist))?s.hist:[],desde:(s&&s.desde)||"",manual:!!(s&&s.manual),t:(s&&s.t)||"",por:(s&&s.por)||""})}
  const grupo=n=>/PRIMARIA/.test(n)?1:/SEGUNDARIA|SECUNDARIA|ESO/.test(n)?2:/BACHILL/.test(n)?3:/UNIVERS|GRADO/.test(n)?4:/LOGOPEDIA/.test(n)?5:6;
  return out.sort((x,y)=>grupo(x.nombre)-grupo(y.nombre)||(x.horas??99)-(y.horas??99)||x.nombre.localeCompare(y.nombre,"es"));
}
const tfMapa=()=>new Map(tfCursos().map(c=>[c.nombre,c]));

/* Matriz del alumno: la guardada o, si no hay, la propuesta según Argos. */
function matrizDe(a){
  if(a&&a.matriz&&Array.isArray(a.matriz.l))return {l:a.matriz.l.filter(l=>l&&l.curso),guardada:true,t:a.matriz.t||"",por:a.matriz.por||""};
  const rs=((a&&a.recibos)||[]).filter(r=>r&&r.curso&&r.emitido&&!(typeof esReciboExtra==="function"&&esReciboExtra(a,r))),ms=[...new Set(rs.map(r=>String(r.emitido).slice(0,7)))].sort(),mes=ms.pop();
  if(mes)return {l:rs.filter(r=>String(r.emitido).startsWith(mes)).map(r=>({curso:nzC(r.curso)})),guardada:false,mes};
  if(a&&a.argos==="activo"&&(a.matriculas||[]).length)return {l:a.matriculas.filter(m=>m&&m.curso&&(!m.cobro||m.cobro==="MENSUAL")).map(m=>({curso:nzC(m.curso)})),guardada:false,mes:"",deMat:true};
  return {l:[],guardada:false,mes:""};
}
const precioLinea=(l,TC)=>{if(l.aj!=null&&l.aj!=="")return +l.aj;const c=TC.get(nzC(l.curso))||{};return l.ant&&c.ant!=null?c.ant:(c.precio??null)};
/* Lo que pagó en Argos el último mes con recibos (o el mes indicado). */
function argosMes(a,mes){const rs=((a&&a.recibos)||[]).filter(r=>r&&r.emitido&&r.importe!=null&&!(typeof esReciboExtra==="function"&&esReciboExtra(a,r)));if(!mes){const ms=[...new Set(rs.map(r=>String(r.emitido).slice(0,7)))].sort();mes=ms.pop()}
  if(!mes)return null;const l=rs.filter(r=>String(r.emitido).startsWith(mes));return l.length?{mes,total:Math.round(l.reduce((x,r)=>x+(+r.importe||0),0)*100)/100,n:l.length}:null}
/* ¿Se arregla marcándolo como antiguo alumno? (una sola línea, el curso tiene precio de antiguos y es justo lo que paga en Argos) */
const antiguoEncaja=(M,arg,TC)=>{if(M.l.length!==1||arg==null)return null;const y=M.l[0];if(y.ant||(y.aj!=null&&y.aj!==""))return null;const c=TC.get(nzC(y.curso));return c&&c.ant!=null&&Math.abs(c.ant-arg)<0.5&&Math.abs((c.precio??-1)-arg)>=0.5?c:null};
function calcMatriz(a,TC){const M=matrizDe(a);let total=0,falta=false,horas=0,hOk=true;
  for(const l of M.l){const p=precioLinea(l,TC);if(p==null)falta=true;else total+=p;const h=horasDeCurso(l.curso);if(h==null)hOk=false;else horas+=h}
  return {...M,total:Math.round(total*100)/100,falta,horas:hOk&&M.l.length?horas:null}}

async function guardarTarifa(cursos){
  const cfg=S.recCfg||{},d={...cfg,tarifa:{cursos,t:nowISO(),por:quienSoy()}};setStatus("Guardando…");
  try{await S.db.doc("config/recibos").set(d);S.recCfg=d;setStatus("Guardado");return true}
  catch(e){console.error(e);setStatus("Sin guardar");toast("No se ha podido guardar la tarifa. Si se repite, avisa a Claude: puede que las reglas de la base de datos no lo permitan.");return false}}
async function guardarMatriz(id,l){const matriz={l,t:nowISO(),por:quienSoy()};setStatus("Guardando…");
  try{await S.db.collection("alumnos").doc(id).update({matriz,actualizado:todayISO()});const a=S.alumnos.get(id);if(a)a.matriz=matriz;setStatus("Guardado");return true}
  catch(e){console.error(e);setStatus("Sin guardar");toast("No se ha podido guardar la tarifa del alumno. Inténtalo de nuevo.");return false}}
const gtVer=()=>S.role==="dir"&&!S.pv&&!S.ro&&!esMos();

/* ---------------- pestaña Tarifas ---------------- */
function estadoCurso(c){
  if(c.conf)return `<span class="badge b-si">Confirmado</span>`;
  if(c.origen==="guardada")return `<span class="badge b-pend">Guardado · por confirmar</span>`;
  if(c.origen==="argos")return `<span class="badge b-off">De Argos</span>`;
  if(c.origen==="deducido")return `<span class="badge b-pend">Deducido de recibos · por confirmar</span>`;
  return `<span class="badge b-no">Sin precio</span>`}
function vTarifas(){
  if(!gtVer())return `<div class="empty">Solo dirección puede ver las tarifas.</div>`;if(GT.gen)return vGenerar();if(GT.fac)return vFacturacion();
  const TC=tfCursos(),TM=new Map(TC.map(c=>[c.nombre,c]));
  const pc=c=>!c.conf;
  const gtQ=v=>nzC(String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")).replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim(),qq=gtQ(GT.q).split(" ").filter(Boolean);
  const vis=TC.filter(c=>GT.filtro==="todos"?true:GT.filtro==="conf"?pc(c):(c.alumnos>0||c.nRec>0||c.origen==="guardada"));const gtVe=c=>{const n=gtQ(c.nombre).replace(/ /g,"");return qq.every(w=>n.includes(w))};
  const nPc=TC.filter(c=>(c.alumnos>0||c.nRec>0)&&pc(c)).length;
  const fila=c=>{const ed=GT.fila===c.nombre;
    if(ed)return `<tr><td colspan="7" style="background:var(--sunk)"><b>${esc(c.nombre)}</b>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px">
        <label class="f" style="flex:0 1 130px">Precio al mes (€)<input type="text" inputmode="decimal" id="gt-p" value="${esc(fmtNum(c.precio))}"></label>
        <label class="f" style="flex:0 1 170px" title="Precio que mantienen los alumnos antiguos (por ejemplo, los que ya venían antes del curso 2026/27)">Antiguos alumnos (€)<input type="text" inputmode="decimal" id="gt-ant" value="${esc(fmtNum(c.ant))}" placeholder="Opcional"></label>
        <label class="f" style="flex:0 1 160px">Desde<input type="date" id="gt-desde" value="${esc(todayISO())}"></label>
        <label class="f" style="flex:1 1 220px">Nota<input type="text" id="gt-nota" value="${esc(c.nota)}" maxlength="160" placeholder="Opcional"></label>
        <label class="chk" style="margin:0 0 8px"><input type="checkbox" id="gt-conf" ${c.conf||c.origen!=="deducido"?"checked":""}><span>Precio confirmado</span></label>
        <button class="btn small primary" data-tf="cguardar" data-c="${esc(c.nombre)}">Guardar</button><button class="btn small" data-tf="ccancelar">Cancelar</button>
        ${c.manual&&!c.alumnos?`<button class="btn small" data-tf="cborrar" data-c="${esc(c.nombre)}">Quitar curso</button>`:""}</div>
      <p class="note" style="margin:6px 0 0">«Antiguos alumnos»: el precio que mantienen los que ya venían antes de la última subida; en su ficha se marcan como «Antiguo alumno». El nuevo precio solo se aplica a los recibos que se generen a partir de la fecha «Desde». Los recibos ya hechos no cambian.</p>
      ${c.hist.length?`<p class="note" style="margin:4px 0 0">Precios anteriores: ${c.hist.slice(-4).map(h=>`${eur(+h.precio)} (desde ${fmtFecha(h.desde)})`).join(" · ")}</p>`:""}</td></tr>`;
    return `<tr data-gtn="${esc(gtQ(c.nombre).replace(/ /g,""))}"${gtVe(c)?"":' style="display:none"'}><td><b>${esc(c.nombre)}</b>${c.manual?` <span class="note">(no está en Argos)</span>`:""}${c.nota?`<br><span class="note">${esc(c.nota)}</span>`:""}${c.avisos.length?`<br><span class="note" style="color:var(--warn)">${c.avisos.map(esc).join(" ")}</span>`:""}</td>
      <td style="text-align:right">${c.horas==null?"—":fmtNum(c.horas)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums"><b>${c.precio==null?"—":eur(c.precio)}</b>${c.ant!=null?`<br><span class="note">antiguos ${eur(c.ant)}</span>`:""}${c.desde?`<br><span class="note">desde ${fmtFecha(c.desde)}</span>`:""}</td>
      <td>${estadoCurso(c)}</td><td style="text-align:right">${c.alumnos||"—"}</td><td style="text-align:right">${c.nRec||"—"}</td>
      <td style="white-space:nowrap">${!c.conf&&c.precio!=null?`<button class="btn small primary" data-tf="cconf" data-c="${esc(c.nombre)}" title="El precio es correcto">Confirmar</button> `:""}<button class="btn small" data-tf="ceditar" data-c="${esc(c.nombre)}">Cambiar</button></td></tr>`};
  const nuevo=GT.nuevo?`<div class="panel" style="padding:12px 14px;margin-top:10px"><b>Curso nuevo</b> <span class="note">Para cursos que no están en Argos (por ejemplo, universidad). Pon en el nombre las horas, como en Argos: «… 2H/SEMANA».</span>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px"><label class="f" style="flex:1 1 260px">Nombre<input type="text" id="gt-nn" maxlength="80" placeholder="UNIVERSIDAD 2H/SEMANA"></label>
      <label class="f" style="flex:0 1 130px">Precio al mes (€)<input type="text" inputmode="decimal" id="gt-np"></label>
      <button class="btn small primary" data-tf="nguardar">Añadir</button><button class="btn small" data-tf="ncancelar">Cancelar</button></div></div>`:"";
  return `<div class="bar"><h2>Tarifas</h2><span class="legend">Precios mensuales por curso${S.recCfg&&S.recCfg.tarifa&&S.recCfg.tarifa.t?` · último cambio ${fmtFecha(String(S.recCfg.tarifa.t).slice(0,10))}`:""}</span></div>
  <div class="aviso info" style="display:block">Los precios salen de Argos (cuota del curso) o, si Argos no la tiene, del importe más repetido en los recibos. <b>Confirma</b> los que estén bien y <b>cambia</b> los que no. Un cambio de precio solo afecta a los recibos que se generen después. No hay descuentos generales: los precios especiales se ponen en la ficha de cada alumno, en «Tarifa del alumno», con su motivo.</div>
  <div class="stats" style="margin-top:12px">
    <div class="stat"><b>${TC.filter(c=>c.alumnos>0).length}</b><span>Cursos con alumnos</span></div>
    <button class="stat" data-tf="filtro" data-v="conf"><b>${nPc}</b><span>Precios por confirmar</span></button>
    <div class="stat"><b>${TC.filter(c=>c.conf).length}</b><span>Confirmados</span></div>
  </div>
  <div class="bar" style="margin-bottom:6px"><label class="f" style="flex:0 1 260px">Ver<select id="gt-filtro"><option value="act" ${GT.filtro==="act"?"selected":""}>Cursos con alumnos o recibos</option><option value="conf" ${GT.filtro==="conf"?"selected":""}>Por confirmar</option><option value="todos" ${GT.filtro==="todos"?"selected":""}>Todos (también sin alumnos)</option></select></label>
    <label class="f" style="flex:1 1 240px">Buscar curso<input type="search" id="gt-q" value="${esc(GT.q||"")}" placeholder="Ej.: primaria 2h, logopedia, bachillerato…" autocomplete="off"></label>
    <button class="btn small" data-tf="nuevo" style="margin-left:auto">Añadir curso</button><button class="btn small primary" data-tf="gen">Recibos del mes (ensayo)</button><button class="btn small primary" data-tf="fac">Facturación semanal (ensayo)</button></div>${nuevo}
  <div class="panel tbl"><table class="ft"><thead><tr><th>Curso</th><th style="text-align:right">h/sem</th><th style="text-align:right">Precio/mes</th><th>Estado</th><th style="text-align:right" title="Alumnos que lo pagan según su tarifa">Alumnos</th><th style="text-align:right" title="Recibos de Argos de los últimos 3 meses">Recibos</th><th></th></tr></thead>
  <tbody>${vis.map(fila).join("")||`<tr><td colspan="7" class="note">No hay cursos en esta vista.</td></tr>`}</tbody></table></div>
  ${vPrevia(TM)}`;
}

/* ---------------- vista previa del mes ---------------- */
function mesesConRecibos(){const s=new Set();for(const [,a] of S.alumnos)for(const r of a.recibos||[])if(r&&r.emitido)s.add(String(r.emitido).slice(0,7));return [...s].filter(m=>/^\d{4}-\d{2}$/.test(m)).sort().reverse().slice(0,6)}
function previaLista(mes,TM){const out=[];let nEx=0;
  for(const [id,a] of sortedAlumnos()){if(a.baja||a.bloqueado)continue;
    const rs=(a.recibos||[]).filter(r=>r&&String(r.emitido||"").startsWith(mes)&&!(typeof esReciboExtra==="function"&&esReciboExtra(a,r)));
    if(!a.clases.length&&!rs.length&&a.argos!=="activo"&&!(a.matriz&&a.matriz.l&&a.matriz.l.length))continue;
    if(a.exento||a.sueltas){nEx++;continue}
    const M=calcMatriz(a,TM),arg=Math.round(rs.reduce((s,r)=>s+(+r.importe||0),0)*100)/100,p=[];
    if(!M.l.length)p.push({t:"sin",txt:"Sin cursos: no se le generaría recibo"});
    else if(M.falta)p.push({t:"precio",txt:"Algún curso no tiene precio en la tarifa"});
    if(M.l.length&&!rs.length)p.push({t:"argos",txt:`En Argos no tiene recibo de ${MESES[+mes.slice(5)-1]}`});
    else if(M.l.length&&!M.falta&&Math.abs(M.total-arg)>0.5)p.push({t:"dif",txt:`Saldría ${eur(M.total)}; en Argos ${eur(arg)}`});
    if(M.horas!=null&&M.horas!==a.clases.length)p.push({t:"horas",txt:a.clases.length?`Se cobran ${fmtNum(M.horas)} h/semana y tiene ${a.clases.length} ${a.clases.length===1?"clase":"clases"}`:"No tiene horario"});
    out.push({id,a,M,rs,arg,p})}
  return {l:out,nEx}}
function vPrevia(TM){
  const ms=mesesConRecibos();if(!ms.length)return "";if(!ms.includes(GT.mes))GT.mes=ms[0];const mes=GT.mes;
  const {l,nEx}=previaLista(mes,TM),prob=l.filter(x=>x.p.length),sinG=l.filter(x=>!x.M.guardada&&x.M.l.length&&!x.p.some(y=>y.t!=="horas"));
  const antL=l.filter(x=>x.rs.length&&antiguoEncaja(x.M,x.arg,TM));
  const tot=l.reduce((s,x)=>s+(x.M.falta?0:x.M.total),0),targ=l.reduce((s,x)=>s+x.arg,0),vis=GT.todos?l:prob;
  const fila=x=>{const {id,a,M,rs,arg,p}=x,dif=p.find(y=>y.t==="dif"),aj=GT.aj&&GT.aj.id===id;
    const puedeAj=dif&&M.l.length===1&&rs.length===1&&!M.falta,cA=rs.length?antiguoEncaja(M,arg,TM):null;
    return `<div class="row" style="flex-wrap:wrap;align-items:flex-start;padding:8px 12px;border-top:1px solid var(--line)">
      <a href="#" class="grow" data-act="ir" data-id="${esc(id)}" style="color:inherit;text-decoration:none;min-width:200px"><b>${esc(titulo(a.nombre))}</b>${M.guardada?"":` <span class="badge b-off" title="Aún no tiene la tarifa guardada: se usa la de Argos">propuesta</span>`}<br>
        <span class="note">${M.l.map(y=>`${esc(y.curso)}${y.aj!=null&&y.aj!==""?` · ${eur(+y.aj)} (${esc(y.mot||"precio especial")})`:y.ant?" · antiguo alumno":""}`).join(" + ")||"sin cursos"}</span></a>
      <span style="text-align:right;font-variant-numeric:tabular-nums;min-width:150px"><b>${M.falta?"—":eur(M.total)}</b> <span class="note">· Argos ${rs.length?eur(arg):"—"}</span>${p.length?`<br><span class="note" style="color:var(--warn)">${p.map(y=>esc(y.txt)).join(" · ")}</span>`:`<br><span class="note" style="color:var(--ok)">Coincide</span>`}</span>
      ${cA?`<button class="btn small primary" data-tf="antok" data-id="${esc(id)}" title="Paga el precio de antiguos alumnos de este curso">Antiguo alumno (${eur(cA.ant)})</button>`:""}${puedeAj&&!aj&&!cA?`<button class="btn small" data-tf="ajabrir" data-id="${esc(id)}" title="Guardar el importe de Argos como precio especial de este alumno">Mantener ${eur(arg)}</button>`:""}
      ${aj?`<div style="flex-basis:100%;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px"><label class="f" style="flex:1 1 260px">Motivo del precio especial de ${eur(arg)}<input type="text" id="gt-ajm" maxlength="120" placeholder="Ej.: precio antiguo, hermanos, acuerdo con la familia"></label><button class="btn small primary" data-tf="ajok" data-id="${esc(id)}" data-v="${arg}">Guardar</button><button class="btn small" data-tf="ajno">Cancelar</button></div>`:""}</div>`};
  return `<div class="bar" style="margin-top:26px"><h2 style="font-size:19px">Vista previa de los recibos del mes</h2></div>
  <p class="note" style="margin-top:0">Lo que saldría en el recibo de cada alumno con su tarifa, comparado con lo que se cobró en Argos. <b>Todavía no se generan recibos</b>: sirve para dejar todo cuadrado antes del ensayo de diciembre.</p>
  <div class="bar" style="margin-bottom:6px;gap:10px;flex-wrap:wrap"><label class="f" style="flex:0 1 200px">Mes<select id="gt-mes">${ms.map(m=>`<option value="${m}" ${m===mes?"selected":""}>${mesTxt(m)}</option>`).join("")}</select></label>
    <label class="chk" style="margin:0"><input type="checkbox" id="gt-todos" ${GT.todos?"checked":""}><span>Ver también los que coinciden</span></label>
    <span style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap">${antL.length?`<button class="btn small" data-tf="antodos" title="Marca como antiguos alumnos a los que en Argos pagan justo el precio de antiguos de su curso">Marcar ${antL.length} antiguo${antL.length===1?"":"s"} alumno${antL.length===1?"":"s"}</button>`:""}
    ${sinG.length?`<button class="btn small" data-tf="todasg" title="Guarda la tarifa propuesta de los alumnos en los que coincide con lo que pagan en Argos">Guardar la tarifa de ${sinG.length} alumno${sinG.length===1?"":"s"} que ya cuadra${sinG.length===1?"":"n"}</button>`:""}</span></div>
  <div class="stats">
    <div class="stat"><b>${l.length}</b><span>Alumnos${nEx?` (y ${nEx} que no pagan)`:""}</span></div>
    <div class="stat"><b>${eur(Math.round(tot*100)/100)}</b><span>Saldría con la tarifa</span></div>
    <div class="stat"><b>${eur(Math.round(targ*100)/100)}</b><span>Cobrado en Argos (${MESES[+mes.slice(5)-1]})</span></div>
    <div class="stat"><b>${prob.length}</b><span>Para revisar</span></div>
  </div>
  <div class="panel">${vis.map(fila).join("")||`<div class="empty">Todo coincide.</div>`}</div>`;
}

/* ---------------- ficha: tarifa del alumno ---------------- */
/* 16/11/2026 (titular): si cambia el horario, la tarifa no cambia sola: se propone el mismo curso con las horas del horario */
const cursoSinHoras=c=>nzC(c).toUpperCase().replace(/\d+\s*H\s*\/?\s*SEMANA/,"#H").replace(/LOGOPEDIA\s*\d+/,"LOGOPEDIA #");
function cursoParaHoras(curso,hh,TM){if(!hh)return null;const b=cursoSinHoras(curso);if(b===nzC(curso).toUpperCase())return null;
  for(const [k,c] of TM)if(nzC(k)!==nzC(curso)&&cursoSinHoras(k)===b&&horasDeCurso(k)===hh&&c&&c.precio!=null)return c;return null}
function horasDescuadre(a,M,TM){if(!a||a.baja||a.sueltas||a.exento)return null;const hh=(a.clases||[]).length;if(M.horas==null||!hh||M.horas===hh)return null;
  const sug=M.l.length===1?cursoParaHoras(M.l[0].curso,hh,TM):null;return {tar:M.horas,hor:hh,sug}}
function vTarifaAl(id,a){
  if(!gtVer())return "";const TM=tfMapa(),dl=`<datalist id="gt-dl">${[...TM.values()].map(c=>`<option value="${esc(c.nombre)}">${c.precio!=null?eur(c.precio):""}</option>`).join("")}</datalist>`;
  if(GT.edit&&GT.edit.id===id){const l=GT.edit.l;
    return `<div><div class="bar" style="margin-bottom:4px"><b style="font-size:14px;margin-right:auto">Tarifa del alumno</b><span class="note">editando</span></div>
      ${l.map((y,i)=>{const t=(TM.get(nzC(y.curso))||{}).precio;return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px">
        <label class="f" style="flex:2 1 220px">Curso<input type="text" id="gt-c-${i}" list="gt-dl" value="${esc(y.curso)}"></label>
        <label class="f" style="flex:0 1 120px">Precio especial (€)<input type="text" inputmode="decimal" id="gt-a-${i}" value="${esc(fmtNum(y.aj??""))}" placeholder="${t!=null?"tarifa "+fmtNum(t):""}"></label>
        <label class="chk" style="margin:0 0 8px" title="Paga el precio de antiguos alumnos de este curso"><input type="checkbox" id="gt-x-${i}" ${y.ant?"checked":""}><span>Antiguo alumno${(TM.get(nzC(y.curso))||{}).ant!=null?" ("+eur(TM.get(nzC(y.curso)).ant)+")":""}</span></label>
        <label class="f" style="flex:1 1 180px">Motivo<input type="text" id="gt-m-${i}" value="${esc(y.mot||"")}" maxlength="120" placeholder="Solo si hay precio especial"></label>
        <label class="f" style="flex:0 1 150px" title="Solo si empieza a mitad de mes y no coincide con el alta de Argos. El primer mes paga la parte proporcional.">Empieza el<input type="date" id="gt-i-${i}" value="${esc(y.ini||"")}"></label>
        <button class="btn small" data-tf="lquitar" data-i="${i}" aria-label="Quitar este curso" style="margin-bottom:2px">×</button></div>`}).join("")||`<p class="note">Sin cursos: no se le generarán recibos.</p>`}${dl}
      <div class="row" style="gap:8px;margin-top:4px"><button class="btn small" data-tf="lmas">+ Añadir curso</button><span class="grow"></span><button class="btn small" data-tf="mcancelar">Cancelar</button><button class="btn small primary" data-tf="mguardar" data-id="${esc(id)}">Guardar</button></div>
      <p class="note" style="margin:4px 0 0">Deja el precio especial en blanco para cobrar la tarifa del curso. «Antiguo alumno» cobra el precio de antiguos que tenga el curso en Tarifas. «Empieza el»: solo si no coincide con el alta en Argos; el primer mes paga la parte proporcional (precio ÷ clases de 4 semanas × clases que le quedan).</p></div>`}
  const M=calcMatriz(a,TM);
  const filas=M.l.map(y=>{const cc=TM.get(nzC(y.curso))||{},t=cc.precio,esp=y.aj!=null&&y.aj!=="",pl=precioLinea(y,TM);
    const sub=esp?`Precio especial: ${esc(y.mot||"")}${t!=null?` (tarifa ${eur(t)})`:""}`:y.ant?(cc.ant!=null?`Antiguo alumno (tarifa ${eur(t)})`:`<span style="color:var(--warn)">Marcado como antiguo alumno, pero el curso no tiene precio de antiguos en Tarifas</span>`):"";
    const ini=inicioLinea(a,y),sub2=ini&&ini>=sumaDias(todayISO(),-62)?`Empieza el ${fmtFecha(ini)}${y.ini?"":" (alta en Argos)"}: el primer mes paga la parte proporcional`:"";
    return `<div class="row"><span class="grow">${esc(y.curso)}${sub?`<br><span class="note">${sub}</span>`:""}${sub2?`<br><span class="note">${sub2}</span>`:""}</span><b style="font-variant-numeric:tabular-nums">${pl!=null?eur(pl):`<span style="color:var(--bad)">sin precio</span>`}</b></div>`}).join("");
  const ar=argosMes(a,M.guardada?null:M.mes),difA=ar&&M.l.length&&!M.falta&&Math.abs(ar.total-M.total)>0.5,cA=difA?antiguoEncaja(M,ar.total,TM):null,ajF=GT.aj&&GT.aj.id===id;
  const avA=difA&&!a.baja&&!a.exento&&!a.sueltas?`<div class="aviso pend" style="display:block;margin-top:6px"><b>En Argos paga ${eur(ar.total)}</b> (${mesTxt(ar.mes)}) y con esta tarifa saldría ${eur(M.total)}.
      ${cA?` Coincide con el precio de antiguos alumnos de ${esc(cA.nombre)}. <button class="btn small primary" data-tf="antok" data-id="${esc(id)}">Antiguo alumno (${eur(cA.ant)})</button>`:M.l.length===1&&ar.n===1&&!ajF?` <button class="btn small" data-tf="ajabrir" data-id="${esc(id)}">Mantener ${eur(ar.total)} (precio especial)</button>`:" Ajústalo con «Cambiar»."}
      ${ajF?`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px"><label class="f" style="flex:1 1 220px">Motivo del precio especial de ${eur(ar.total)}<input type="text" id="gt-ajm" maxlength="120" placeholder="Ej.: hermanos, acuerdo con la familia"></label><button class="btn small primary" data-tf="ajok" data-id="${esc(id)}" data-v="${ar.total}">Guardar</button><button class="btn small" data-tf="ajno">Cancelar</button></div>`:""}</div>`:"";
  const est=M.guardada?`<span class="badge b-si">Guardada</span>`:`<span class="badge b-off">Propuesta según Argos${M.mes?" ("+MESES[+M.mes.slice(5)-1]+")":""}</span>`;
  const hh=a.clases.length,av=M.horas!=null&&M.horas!==hh&&!a.baja&&!a.sueltas?`<p class="note" style="color:var(--warn)">Se cobran ${fmtNum(M.horas)} h/semana y en el horario ${hh===1?"hay 1 clase":`hay ${hh} clases`}.${(()=>{const D=horasDescuadre(a,M,TM);return D&&D.sug?` <button class="btn small primary" data-tf="hcambia" data-id="${esc(id)}" data-c="${esc(D.sug.nombre)}">Cambiar a ${esc(D.sug.nombre)} (${eur(D.sug.precio)})</button>`:""})()}</p>`:"";
  return `<div><div class="bar" style="margin-bottom:4px"><b style="font-size:14px;margin-right:auto">Tarifa del alumno</b>${est}</div>
    ${a.exento?`<p class="note">No paga (familiar, beca…): no se le generarán recibos.</p>`:""}
    ${filas||`<p class="note">Sin cursos: no se le generarían recibos.</p>`}
    ${M.l.length?`<div class="row"><span class="grow"><b>Total al mes</b></span><b style="font-variant-numeric:tabular-nums">${M.falta?"—":eur(M.total)}</b></div>`:""}${avA}${av}
    <div class="row" style="gap:8px;margin-top:4px">${M.guardada?`<span class="note grow">Guardada el ${fmtFecha(String(M.t).slice(0,10))}${M.por?" por "+esc(M.por):""}</span>`:(difA?`<span class="note grow">Aún no está guardada. Arregla antes la diferencia con Argos.</span>`:`<span class="note grow">Aún no está guardada. Revísala y guárdala.</span><button class="btn small" data-tf="mguardarprop" data-id="${esc(id)}">Guardar así</button>`)}<button class="btn small" data-tf="meditar" data-id="${esc(id)}">Cambiar</button></div></div>`;
}

/* ---------------- eventos ---------------- */
function gtLeer(){if(!GT.edit)return;GT.edit.l=GT.edit.l.map((y,i)=>({curso:(($("#gt-c-"+i)||{}).value??y.curso),aj:(($("#gt-a-"+i)||{}).value??(y.aj??"")),mot:(($("#gt-m-"+i)||{}).value??(y.mot||"")),ini:(($("#gt-i-"+i)||{}).value??(y.ini||"")),ant:$("#gt-x-"+i)?$("#gt-x-"+i).checked:!!y.ant}))}
document.addEventListener("change",e=>{const t=e.target;if(!t)return;
  if(t.id==="gt-filtro"){GT.filtro=t.value;GT.fila=null;render()}else if(t.id==="gt-mes"){GT.mes=t.value;GT.aj=null;render()}else if(t.id==="gt-todos"){GT.todos=t.checked;render()}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-tf]");if(!t)return;e.preventDefault();if(!gtVer()){toast("Solo dirección puede cambiar las tarifas");return}
  const act=t.dataset.tf,g={...tfGuardada()},TM=tfMapa();
  const entrada=(c,precio,desde,conf,nota,manual,ant)=>{const old=g[c],hist=[...((old&&old.hist)||[])];if(ant===undefined)ant=old&&old.ant!=null?old.ant:null;
    if(old&&old.precio!=null&&+old.precio!==precio)hist.push({precio:+old.precio,desde:old.desde||"",t:old.t||"",por:old.por||""});
    const cur=TM.get(c);if(!old&&cur&&cur.precio!=null&&cur.precio!==precio)hist.push({precio:cur.precio,desde:"",t:"",por:cur.origen==="argos"?"Argos":"recibos"});
    if(old&&(old.ant??null)!==(ant??null)&&old.ant!=null)hist.push({precio:+old.precio,ant:+old.ant,desde:old.desde||"",t:old.t||"",por:old.por||""});
    return {precio,...(ant!=null?{ant}:{}),desde,conf:!!conf,nota:String(nota||"").slice(0,160),manual:!!(manual||(old&&old.manual)),t:nowISO(),por:quienSoy(),hist:hist.slice(-20)}};
  if(act==="filtro"){GT.filtro=t.dataset.v;render()}
  else if(act==="ceditar"){GT.fila=t.dataset.c;render()}
  else if(act==="ccancelar"){GT.fila=null;render()}
  else if(act==="cconf"){const c=TM.get(t.dataset.c);if(!c||c.precio==null)return;t.disabled=true;
    g[c.nombre]=g[c.nombre]?{...g[c.nombre],conf:true,t:nowISO(),por:quienSoy()}:entrada(c.nombre,c.precio,todayISO(),true,c.nota,false,null);
    if(await guardarTarifa(g)){render();toast(`Confirmado: ${c.nombre} a ${eur(c.precio)}`)}else t.disabled=false}
  else if(act==="cguardar"){const c=t.dataset.c,p=gtNum(($("#gt-p")||{}).value),desde=($("#gt-desde")||{}).value||todayISO();
    if(p==null||isNaN(p)||p<0){toast("Escribe un precio válido");return}
    const ant=gtNum(($("#gt-ant")||{}).value);if(ant!=null&&(isNaN(ant)||ant<0)){toast("Revisa el precio de antiguos alumnos");return}
    const old=g[c];t.disabled=true;
    if(old&&+old.precio===p){const o={...old,conf:$("#gt-conf").checked,nota:($("#gt-nota").value||"").slice(0,160),t:nowISO(),por:quienSoy()};if(ant!=null)o.ant=ant;else delete o.ant;
      if((old.ant??null)!==(ant??null)&&old.ant!=null)o.hist=[...(old.hist||[]),{precio:+old.precio,ant:+old.ant,desde:old.desde||"",t:old.t||"",por:old.por||""}].slice(-20);g[c]=o}
    else g[c]=entrada(c,p,desde,$("#gt-conf").checked,$("#gt-nota").value,false,ant);
    if(await guardarTarifa(g)){GT.fila=null;render();toast(`Guardado: ${c} a ${eur(p)}`)}else t.disabled=false}
  else if(act==="cborrar"){const c=t.dataset.c;if(!g[c]||!g[c].manual)return;delete g[c];if(await guardarTarifa(g)){GT.fila=null;render();toast("Curso quitado")}}
  else if(act==="nuevo"){GT.nuevo=true;render();setTimeout(()=>{const i=$("#gt-nn");if(i)i.focus()},0)}
  else if(act==="ncancelar"){GT.nuevo=false;render()}
  else if(act==="nguardar"){const n=nzC(($("#gt-nn")||{}).value),p=gtNum(($("#gt-np")||{}).value);
    if(!n){toast("Escribe el nombre del curso");return}if(TM.has(n)){toast("Ese curso ya está en la tarifa");return}if(p==null||isNaN(p)||p<0){toast("Escribe un precio válido");return}
    g[n]=entrada(n,p,todayISO(),true,"",true,null);t.disabled=true;if(await guardarTarifa(g)){GT.nuevo=false;render();toast("Curso añadido: "+n)}else t.disabled=false}
  else if(act==="meditar"){const a=S.alumnos.get(t.dataset.id);if(!a)return;GT.edit={id:t.dataset.id,l:matrizDe(a).l.map(y=>({curso:y.curso,aj:y.aj??"",mot:y.mot||"",ant:!!y.ant,ini:y.ini||""}))};render()}
  else if(act==="mcancelar"){GT.edit=null;render()}
  else if(act==="lmas"){gtLeer();GT.edit.l.push({curso:"",aj:"",mot:"",ant:false,ini:""});render();setTimeout(()=>{const i=$("#gt-c-"+(GT.edit.l.length-1));if(i)i.focus()},0)}
  else if(act==="lquitar"){gtLeer();GT.edit.l.splice(+t.dataset.i,1);render()}
  else if(act==="mguardar"){gtLeer();const id=t.dataset.id,l=[];
    for(const y of GT.edit.l){const c=nzC(y.curso);if(!c)continue;if(!TM.has(c)){toast(`«${c}» no está en la tarifa. Elígelo de la lista o añádelo en Tarifas.`);return}
      const aj=gtNum(y.aj);if(aj!=null&&(isNaN(aj)||aj<0)){toast(`Revisa el precio especial de ${c}`);return}
      const mot=String(y.mot||"").trim();if(aj!=null&&!mot){toast(`Escribe el motivo del precio especial de ${c}`);return}
      if(y.ant&&aj==null&&(TM.get(c)||{}).ant==null){toast(`${c} no tiene precio de antiguos alumnos. Ponlo antes en Tarifas.`);return}
      const ini=/^\d{4}-\d\d-\d\d$/.test(String(y.ini||""))?y.ini:"";
      l.push({...(aj!=null?{curso:c,aj,mot:mot.slice(0,120)}:y.ant?{curso:c,ant:true}:{curso:c}),...(ini?{ini}:{})})}
    t.disabled=true;if(await guardarMatriz(id,l)){GT.edit=null;render();toast("Tarifa del alumno guardada")}else t.disabled=false}
  else if(act==="mguardarprop"){const a=S.alumnos.get(t.dataset.id);if(!a)return;const M=matrizDe(a);
    const falta=M.l.map(y=>nzC(y.curso)).filter(c=>!TM.has(c));if(falta.length){toast("Falta en la tarifa: "+falta.join(", "));return}
    t.disabled=true;if(await guardarMatriz(t.dataset.id,M.l.map(y=>({curso:nzC(y.curso)})))){render();toast("Tarifa del alumno guardada")}else t.disabled=false}
  else if(act==="ajabrir"){GT.aj={id:t.dataset.id};render();setTimeout(()=>{const i=$("#gt-ajm");if(i)i.focus()},0)}
  else if(act==="ajno"){GT.aj=null;render()}
  else if(act==="ajok"){const id=t.dataset.id,a=S.alumnos.get(id),v=+t.dataset.v,mot=String(($("#gt-ajm")||{}).value||"").trim();if(!a)return;
    if(!mot){toast("Escribe el motivo del precio especial");return}const M=matrizDe(a);if(M.l.length!==1)return;
    t.disabled=true;if(await guardarMatriz(id,[{curso:nzC(M.l[0].curso),aj:v,mot:mot.slice(0,120)}])){GT.aj=null;render();toast(`${titulo(a.nombre)}: precio especial de ${eur(v)} guardado`)}else t.disabled=false}
  else if(act==="hcambia"){const id=t.dataset.id,a=S.alumnos.get(id),cu=t.dataset.c;if(!a||!cu)return;const M=matrizDe(a),y=M.l[0]||{},TM2=tfMapa(),cc=TM2.get(cu)||{};
    t.disabled=true;if(await guardarMatriz(id,[{curso:nzC(cu),...(y.ant&&cc.ant!=null?{ant:true}:{}),...(y.ini?{ini:y.ini}:{})}])){render();toast(`${titulo(a.nombre)}: tarifa cambiada a ${cu}`)}else t.disabled=false}
  else if(act==="antok"){const id=t.dataset.id,a=S.alumnos.get(id);if(!a)return;const M=matrizDe(a);if(M.l.length!==1)return;
    t.disabled=true;if(await guardarMatriz(id,[{curso:nzC(M.l[0].curso),ant:true}])){render();toast(`${titulo(a.nombre)}: antiguo alumno`)}else t.disabled=false}
  else if(act==="antodos"){const ls=[];for(const [id,a] of S.alumnos){if(a.baja||a.bloqueado||a.exento)continue;const ar=argosMes(a,GT.mes);if(!ar)continue;
      const M=calcMatriz(a,TM),c=antiguoEncaja(M,ar.total,TM);if(c)ls.push([id,[{curso:nzC(M.l[0].curso),ant:true}],c])}
    if(!ls.length){toast("No hay alumnos que marcar");return}
    const res=[...new Set(ls.map(x=>`${x[2].nombre} (${eur(x[2].ant)})`))].join(", ");
    if(!confirm(`Se marcará${ls.length===1?"":"n"} como antiguo${ls.length===1?"":"s"} alumno${ls.length===1?"":"s"} ${ls.length===1?"1 alumno que paga":ls.length+" alumnos que pagan"} en Argos el precio de antiguos: ${res}. ¿Seguir?`))return;
    t.disabled=true;let ok=0;for(const [id,l] of ls){setStatus(`Guardando ${ok+1}/${ls.length}…`);if(await guardarMatriz(id,l))ok++;else break}
    render();toast(`Marcados como antiguos alumnos: ${ok} de ${ls.length}`)}
  else if(act==="todasg"){const ls=[];for(const [id,a] of S.alumnos){if(a.baja||a.bloqueado||a.exento||(a.matriz&&Array.isArray(a.matriz.l)))continue;
      const M=calcMatriz(a,TM);if(!M.l.length||M.falta||M.l.some(y=>!TM.has(nzC(y.curso))))continue;if(!a.clases.length&&a.argos!=="activo")continue;
      const ar=argosMes(a,M.mes);if(!ar||Math.abs(ar.total-M.total)>0.5)continue;ls.push([id,M.l.map(y=>({curso:nzC(y.curso)}))])}
    if(!ls.length){toast("No hay alumnos cuya tarifa coincida con lo que pagan en Argos");return}
    if(!confirm(`Se guardará la tarifa de ${ls.length} alumnos en los que coincide con lo que pagan en Argos. Los que no coinciden se quedan para revisar. ¿Seguir?`))return;
    t.disabled=true;let ok=0;for(const [id,l] of ls){setStatus(`Guardando ${ok+1}/${ls.length}…`);if(await guardarMatriz(id,l))ok++;else break}
    render();toast(`Tarifa guardada en ${ok} de ${ls.length} alumnos`)}
});


/* ============================================================================================
   Fase 2 · Caja del mostrador (31/10/2026). Dirección y mostrador; las profesoras no la ven.
   Todo se apunta en caja/<id> y nunca se modifica ni se borra:
   - apertura {fondo, quien, hora}: efectivo con el que empieza la caja. El primer día se escribe a mano; después se propone
     lo contado en el último cierre.
   - cobro {alumno, nombre, recibos[], total, forma, entregado?, cambio?, nota?, quien, hora}: quien = la persona que cobra
     (equipo, dirección o recepción) y hora = la del cobro (por defecto, la actual).
   - retirada {importe, nota, quien, hora}: dinero que se saca de la caja; la nota (quién y para qué) es obligatoria.
   - apunte {signo:1|-1, importe, concepto, quien, hora}: apunte manual de efectivo. Positivo: entrada (cambio en monedas,
     cobro extraordinario…); negativo: salida (pago de gastos varios…). El concepto es obligatorio.
   - cierre {esperado, contado, descuadre, nota, quien, hora}: esperado = fondo + efectivo cobrado + entradas − salidas − retiradas
     desde la apertura.
   - anulacion {ref, motivo} (solo dirección).
   Todos llevan t (hora real del servidor del dispositivo), dia y por (usuario que lo registra).
   Modo prueba (dueño, 31/10/2026): hasta CAJA_REAL_DESDE manda Argos; los cobros no cambian los recibos (ni alumnos ni
   profesoras ven nada). Un recibo cobrado en la prueba deja de salir como pendiente en la Caja.
   Justificante: impresora térmica (80/58 mm) o WhatsApp al móvil de la ficha, que se puede cambiar en el momento.
   ============================================================================================ */
const CAJA_REAL_DESDE="2027-01-01";
const cajaPrueba=()=>todayISO()<CAJA_REAL_DESDE;
const FORMAS=[["efectivo","Efectivo"],["tarjeta","Tarjeta"],["bizum","Bizum"],["transferencia","Transferencia"],["beca","Beca"]];
const formaTxt=f=>(FORMAS.find(x=>x[0]===f)||[f,f||"—"])[1];
const QUIENES=()=>[...EQUIPO,"Dirección","Recepción"];
/* Conceptos de los apuntes manuales (titular, 08/11/2026). config/cajaConceptos = {l:[{id, n, s:"+"|"-"|"±", cat}]}: s fija si es
   entrada, salida o cualquiera de las dos; cat es la categoría con la que pasa a Gastos (se puede cambiar allí en cada apunte). */
const CON_DEF=[{id:"monedas",n:"Entrada en monedas",s:"+",cat:"cambio"},{id:"descuadre",n:"Descuadre sin justificar",s:"±",cat:"nodeduc"},
  {id:"garaje",n:"Pago garaje",s:"-",cat:"alquiler"},{id:"ambient",n:"Pago ambientadores industriales",s:"-",cat:"manten"}];
const conceptos=()=>(GC.con&&Array.isArray(GC.con.l)?GC.con.l:CON_DEF);
const SIG_TXT={"+":"Entrada (+)","-":"Salida (−)","±":"Entrada o salida"};
const GC={docs:[],ok:false,sub:null,desde:"",q:"",al:null,sel:null,forma:"",dia:"",ultimo:null,anular:null,err:"",hora:"",ent:"",nota:"",tel:null};
const cajaVer=()=>S.role==="dir"&&!S.pv&&!S.ro;
const cajaId=()=>"c"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const hhmm=()=>{const d=new Date();return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")};
const horaDe=iso=>{try{const d=new Date(iso);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")}catch(_){return ""}};
const horaC=d=>d.hora||horaDe(d.t);
const lsGet=(k,def)=>{try{return localStorage.getItem(k)??def}catch(_){return def}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(_){}};
const anchoTk=()=>lsGet("althea.ticket","80")==="58"?"58":"80";
const quienDef=()=>{const q=lsGet("althea.quien","");return QUIENES().includes(q)?q:""};
const selQuien=(id,lab,sinDef)=>`<label class="f" style="flex:1 1 160px">${lab||"¿Quién?"}<select id="${id}"><option value="">Elige…</option>${QUIENES().map(q=>`<option ${(sinDef?q===GC.quien:q===quienDef())?"selected":""}>${esc(q)}</option>`).join("")}</select></label>`;
const leerQuien=id=>{const v=(($("#"+id)||{}).value)||"";if(!v){toast("Elige quién lo hace");return null}lsSet("althea.quien",v);return v};
const r2=n=>Math.round(n*100)/100;
function cajaEscuchar(){
  const desde=sumaDias(todayISO(),esMos()?-7:-62);if(GC.sub&&GC.desde===desde)return;if(GC.sub)try{GC.sub()}catch(_){}
  GC.desde=desde;GC.sub=S.db.collection("caja").where("dia",">=",desde).onSnapshot(s=>{GC.docs=s.docs.map(d=>({id:d.id,...d.data()}));GC.ok=true;GC.err="";cajaAGastos();if(S.view==="descuadres")gbRefrescar();if(S.view==="caja")cajaRefrescar()},
    e=>{GC.ok=true;GC.err="No se puede leer la caja: faltan permisos en la base de datos (hay que publicar las reglas nuevas en Firebase).";if(S.view==="caja")cajaRefrescar()});
  if(!GC.subCon)GC.subCon=S.db.doc("config/cajaConceptos").onSnapshot(d=>{GC.con=d.exists?d.data():null;if(S.view==="caja")cajaRefrescar()},()=>{GC.con=null});
}
function cajaRefrescar(){const ae=document.activeElement;if(ae&&ae.id&&/^gc-/.test(ae.id)){const r=$("#gc-hoy");if(r&&!r.contains(ae))r.innerHTML=vCajaDia();return}render()}
const anulados=()=>new Set(GC.docs.filter(d=>d.tipo==="anulacion").map(d=>d.ref));
const anulacionDe=id=>GC.docs.find(d=>d.tipo==="anulacion"&&d.ref===id);
const deDia=(dia,tipo)=>GC.docs.filter(d=>d.dia===dia&&(!tipo||d.tipo===tipo)).sort((x,y)=>String(x.t).localeCompare(String(y.t)));
const cobrosDia=dia=>{const an=anulados();return deDia(dia,"cobro").map(d=>({...d,anulado:an.has(d.id)})).reverse()};
const cobradosPrueba=()=>{const an=anulados(),s=new Set();for(const d of GC.docs)if(d.tipo==="cobro"&&!an.has(d.id))for(const r of d.recibos||[])s.add(d.alumno+"|"+r.id);return s};
const pendientesDe=(a,id)=>{const cp=cajaPrueba()?cobradosPrueba():null;
  return (a.recibos||[]).filter(r=>r&&r.estado!=="pagado"&&r.importe!=null&&!(cp&&cp.has(id+"|"+r.id))).sort((x,y)=>String(x.emitido).localeCompare(String(y.emitido)))};
/* 23/11/2026 (titular): pestaña «Cobros pendientes» para el mostrador (y dirección).
   - Por defecto, los alumnos que vienen hoy y tienen recibos pendientes, ordenados por hora.
   - Buscador: cualquier alumno (también de baja) con sus recibos pendientes.
   - «Para reclamar»: alumnos con 2 o más recibos pendientes, con WhatsApp para reclamarlos. Se apunta en alumnos/<id>.waRec.reclamo.
   Cuentan los recibos sin pagar desde que la app lleva las cuentas (ATR_DESDE); los que esperan beca no se reclaman.
   Los cobrados en la Caja de prueba dejan de salir (pendientesDe). */
const nzS=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/\s+/g," ").trim().toUpperCase();
const cbPend=(a,id)=>pendientesDe(a,id).filter(r=>r.estado!=="anulado"&&String(r.emitido||"").slice(0,7)>=ATR_DESDE());
const cbTot=rs=>r2(rs.reduce((s,r)=>s+(+r.importe||0),0));
function cbHoy(){const hoy=todayISO(),out=new Map();if(!DIAS.includes(diaDe(hoy))||festivoDe(hoy))return [];
  for(const p of EQUIPO){let l=[];try{l=sesionesFecha(p,hoy)}catch(_){l=[]}
    for(const {id,a,o} of l){let ini=KEY_INI[o.hora]??960;try{if(FLEX.has(p))ini=sesDe(a,o).ini}catch(_){}
      const x=out.get(id);if(!x||ini<x.ini)out.set(id,{id,a,ini,profe:p,mas:x?[...x.mas,x.profe]:[]});else x.mas.push(p)}}
  return [...out.values()].sort((u,v)=>u.ini-v.ini||String(u.a.nombre).localeCompare(String(v.a.nombre),"es"))}
function cbReclamar(){const l=[];for(const [id,a] of sortedAlumnos()){if(typeof esperaBeca==="function"&&esperaBeca(a))continue;const rs=cbPend(a,id);if(rs.length>=2)l.push({id,a,rs,rec:(a.waRec||{}).reclamo||""})}
  return l.sort((x,y)=>(!!x.rec-!!y.rec)||String(x.rec).localeCompare(String(y.rec))||cbTot(y.rs)-cbTot(x.rs))}
function cbFila(id,a,rs,extra,conWa){const tel=(contactosAl(a)[0]||{}).tel||"",beca=typeof esperaBeca==="function"&&esperaBeca(a),rec=(a.waRec||{}).reclamo;
  return `<div class="row" style="flex-wrap:wrap;gap:8px;align-items:flex-start;padding:8px 0">
    <span style="flex:1 1 260px;min-width:0"><a href="#" data-act="ir" data-id="${esc(id)}" style="color:inherit"><b>${esc(titulo(a.nombre))}</b></a>${extra||""}${a.baja?` <span class="badge b-pend">de baja</span>`:""}${beca?` <span class="badge b-pend">espera beca</span>`:""}
      <br>${rs.length?rs.map(r=>`<span class="note">${esc(nombreMes(r.emitido)||fmtFecha(r.emitido))}${r.curso||r.concepto?` · ${esc(r.curso||r.concepto)}`:""}${r.numero?` · ${esc(r.numero)}`:""} · <b>${eur(+r.importe||0)}</b></span>`).join("<br>"):`<span class="note">Al día: no tiene recibos pendientes.</span>`}
      ${rec?`<br><span class="note">Reclamado por WhatsApp el ${fmtFecha(String(rec).slice(0,10))}</span>`:""}</span>
    ${rs.length?`<b style="font-variant-numeric:tabular-nums;min-width:70px;text-align:right">${eur(cbTot(rs))}</b>
      <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small primary" data-cb="cobrar" data-id="${esc(id)}">Cobrar</button>
      ${conWa&&!beca?(tel?`<button class="btn small" data-cb="wa" data-id="${esc(id)}">WhatsApp</button>`:`<span class="note">sin teléfono</span>`)+`<button class="btn small" data-cb="ok" data-id="${esc(id)}" title="Ya se ha reclamado de otra forma">${rec?"Reclamado otra vez":"Ya reclamado"}</button>`:""}</span>`:""}</div>`}
function vCobrosRes(){const q=nzS(S.cbQ);
  if(q.length>=2){const l=sortedAlumnos().filter(([,x])=>nzS(x.nombre).includes(q)).slice(0,25);
    if(!l.length)return `<div class="panel"><p class="note">No hay ningún alumno con ese nombre.</p></div>`;
    return `<div class="panel"><b>Resultado de la búsqueda</b>${l.map(([id,a])=>cbFila(id,a,cbPend(a,id),"",true)).join("")}</div>`}
  const hoy=cbHoy(),con=hoy.map(x=>({...x,rs:cbPend(x.a,x.id)})).filter(x=>x.rs.length&&!(typeof esperaBeca==="function"&&esperaBeca(x.a)));/* 23/11/2026: los que esperan beca van aparte */
  return `<div class="panel"><div class="bar" style="margin:0 0 4px"><b style="margin-right:auto">Vienen hoy con recibos pendientes</b><span class="note">${hoy.length?`${con.length} de ${hoy.length} alumnos que vienen hoy · ${eur(r2(con.reduce((s,x)=>s+cbTot(x.rs),0)))}`:"Hoy no hay clases"}</span></div>
    ${con.length?con.map(x=>cbFila(x.id,x.a,x.rs,` <span class="note">· ${hm(x.ini)} con ${esc([x.profe,...x.mas].join(", "))}</span>`,true)).join(""):`<p class="note">${hoy.length?"Todos los que vienen hoy están al día.":"No hay nadie que cobrar hoy."}</p>`}</div>`}
function vCobros(){if(!cajaVer())return `<div class="empty">Solo dirección y mostrador.</div>`;cajaEscuchar();
  const R=cbReclamar(),sin=R.filter(x=>!x.rec).length;
  return `<div class="bar"><h2>Cobros pendientes</h2><span class="legend">${fmtFecha(todayISO())}</span></div>
  <p class="note" style="margin-top:0">Recibos sin pagar desde ${esc(nombreMes(ATR_DESDE()+"-01"))}. Para cobrar, pulsa «Cobrar» (te lleva a la Caja con el alumno elegido).${cajaPrueba()?" Hasta enero, cobra también en Argos como siempre.":""}</p>
  <label class="f" style="max-width:460px">Buscar alumno<input type="search" id="cb-q" value="${esc(S.cbQ||"")}" placeholder="Nombre o apellidos (deja vacío para ver los de hoy)" autocomplete="off"></label>
  <div id="cb-res" style="margin-top:10px">${vCobrosRes()}</div>
  <h3 class="sec">Para reclamar: 2 o más recibos pendientes <span class="note" style="font-weight:400">· ${R.length} alumno${R.length===1?"":"s"}${sin?` · ${sin} sin reclamar`:""}</span></h3>
  <p class="note" style="margin-top:0">«WhatsApp» abre el chat de la familia con el mensaje escrito (los recibos y el Bizum). Los que esperan beca no salen.</p>
  <div class="panel">${R.length?R.map(x=>cbFila(x.id,x.a,x.rs,"",true)).join(""):`<p class="note">Nadie tiene 2 o más recibos pendientes.</p>`}</div>
  ${(()=>{const B=typeof esperaBeca==="function"?sortedAlumnos().filter(([,a])=>esperaBeca(a)).map(([id,a])=>({id,a,rs:cbPend(a,id)})).filter(x=>x.rs.length):[];
    return B.length?`<details style="margin-top:14px"${S.cbBecaOpen?" open":""} ontoggle="S.cbBecaOpen=this.open"><summary><h3 class="sec" style="display:inline">Esperando beca</h3> <span class="note">· ${B.length} alumno${B.length===1?"":"s"} · ${eur(r2(B.reduce((s,x)=>s+cbTot(x.rs),0)))} · no se reclaman</span></summary>
      <p class="note">Sus recibos se cobran cuando llegue la beca (en Caja, forma «Beca»).</p><div class="panel">${B.map(x=>cbFila(x.id,x.a,x.rs,"",false)).join("")}</div></details>`:""})()}`}
document.addEventListener("input",e=>{if(e.target&&e.target.id==="cb-q"){S.cbQ=e.target.value;const el=document.getElementById("cb-res");if(el)el.innerHTML=vCobrosRes()}});
async function cbMarcar(id){const a=S.alumnos.get(id);if(!a)return;const waRec={...(a.waRec||{}),reclamo:nowISO()};if(await save(id,{waRec})){a.waRec=waRec;render()}}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-cb]");if(!t)return;e.preventDefault();const id=t.dataset.id,a=S.alumnos.get(id);if(!a)return;
  if(t.dataset.cb==="cobrar"){GC.al=id;GC.sel=null;GC.q="";GC.ultimo=null;S.view="caja";render();return}
  if(t.dataset.cb==="wa"){const tel=(contactosAl(a)[0]||{}).tel,rs=cbPend(a,id);if(!tel||!rs.length)return;window.open(`https://wa.me/34${tel}?text=${encodeURIComponent(mensajeAtrasados(a,rs))}`,"_blank","noopener");cbMarcar(id);return}
  if(t.dataset.cb==="ok")cbMarcar(id)});
/* Estado de la caja del día: la última apertura y lo que ha pasado después. */
function estadoCaja(dia){
  dia=dia||todayISO();const ds=deDia(dia),an=anulados(),aps=ds.filter(d=>d.tipo==="apertura"),ap=aps[aps.length-1];
  if(!ap)return {abierta:false,ap:null,dia};
  const tras=ds.filter(d=>String(d.t)>=String(ap.t)),cierre=tras.filter(d=>d.tipo==="cierre").pop();
  const ef=r2(tras.filter(d=>d.tipo==="cobro"&&d.forma==="efectivo"&&!an.has(d.id)&&(!cierre||String(d.t)<=String(cierre.t))).reduce((s,d)=>s+(+d.total||0),0));
  const hasta=d=>!cierre||String(d.t)<=String(cierre.t);
  const ret=tras.filter(d=>d.tipo==="retirada"&&hasta(d));const rt=r2(ret.reduce((s,d)=>s+(+d.importe||0),0));
  const apu=tras.filter(d=>d.tipo==="apunte"&&hasta(d)&&!an.has(d.id)),ent=r2(apu.filter(d=>+d.signo>0).reduce((s,d)=>s+(+d.importe||0),0)),sal=r2(apu.filter(d=>+d.signo<0).reduce((s,d)=>s+(+d.importe||0),0));
  return {abierta:!cierre,ap,cierre,ef,ret,rt,ent,sal,esperado:r2((+ap.fondo||0)+ef+ent-sal-rt),dia};
}
const ultimoCierre=()=>GC.docs.filter(d=>d.tipo==="cierre").sort((x,y)=>String(x.t).localeCompare(String(y.t))).pop();

function vCaja(){
  if(!cajaVer())return `<div class="empty">Solo dirección y mostrador.</div>`;
  cajaEscuchar();
  return `<div class="bar"><h2>Caja</h2><span class="legend">${fmtFecha(todayISO())} · ${esc(quienSoy())}</span></div>
  ${cajaPrueba()?`<div class="aviso info" style="display:block"><b>Modo prueba hasta el ${fmtFecha(CAJA_REAL_DESDE)}.</b> Los cobros se apuntan aquí para ensayar, pero <b>no cambian los recibos</b>: alumnos y profesoras no ven nada, y lo que vale es Argos. Cobra también en Argos como siempre.</div>`:""}
  ${GC.err?`<div class="aviso pend" style="display:block">${esc(GC.err)}</div>`:""}
  <div class="split" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr));align-items:start">
    <div class="panel" style="padding:14px 16px">${GC.ultimo?vCajaHecho():vCobrar()}</div>
    <div id="gc-hoy">${vCajaDia()}</div>
  </div>`;
}
function vCobrar(){
  if(!GC.ok)return `<p class="note">Cargando la caja…</p>`;
  const E=estadoCaja();
  if(!E.abierta)return `<b style="font-size:15px">Cobrar</b><div class="aviso pend" style="display:block;margin-top:8px">${E.cierre?"La caja de hoy está cerrada. Para seguir cobrando, vuelve a abrirla (a la derecha).":"Primero abre la caja: en «Apertura, retiradas y cierre» escribe con cuánto efectivo empiezas y pulsa «Abrir caja»."}</div>`;
  const a=GC.al&&S.alumnos.get(GC.al);
  if(!a){const q=nzC(GC.q);
    const l=q.length>=2?sortedAlumnos().filter(([,x])=>!x.bloqueado&&x.nombre.includes(q)).slice(0,12):[];
    return `<b style="font-size:15px">Cobrar</b>
      <label class="f" style="margin-top:8px">Alumno<input type="search" id="gc-q" value="${esc(GC.q)}" placeholder="Escribe el nombre o los apellidos" autocomplete="off"></label>
      <div id="gc-res">${vCajaRes(l,q)}</div>`}
  const pend=pendientesDe(a,GC.al);if(!GC.sel)GC.sel=new Set(pend.map(r=>r.id));
  const sel=pend.filter(r=>GC.sel.has(r.id)),tot=r2(sel.reduce((s,r)=>s+(+r.importe||0),0));
  const ent=gtNum(GC.ent),cambio=GC.forma==="efectivo"&&ent!=null&&!isNaN(ent)?r2(ent-tot):null;
  return `<div class="bar" style="margin:0 0 6px"><b style="font-size:15px;margin-right:auto">${esc(titulo(a.nombre))}</b><button class="btn small" data-gc="otro">Otro alumno</button></div>
    ${pend.length?`<p class="note" style="margin:0 0 6px">Recibos pendientes. Desmarca los que no paga ahora.</p>
      ${pend.map(r=>`<label class="row" style="cursor:pointer;gap:8px"><input type="checkbox" data-gcr="${esc(r.id)}" ${GC.sel.has(r.id)?"checked":""}><span class="grow">${esc(r.concepto||r.curso||"Recibo")}${r.numero?` <span class="note">· ${esc(r.numero)}</span>`:""}</span><b style="font-variant-numeric:tabular-nums">${eur(+r.importe)}</b></label>`).join("")}
      <div class="row"><span class="grow"><b>Total a cobrar</b></span><b style="font-size:18px;font-variant-numeric:tabular-nums">${eur(tot)}</b></div>
      <p style="margin:10px 0 4px"><b style="font-size:13px">Forma de pago</b></p>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${FORMAS.map(([k,l])=>`<button class="btn ${GC.forma===k?"primary":""}" data-gc="forma" data-v="${k}">${l}</button>`).join("")}</div>
      ${GC.forma==="efectivo"?`<div style="display:flex;gap:8px;align-items:flex-end;margin-top:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 170px" title="El billete o el dinero que te dan, para calcular el cambio">Entrega (€) <span class="note">para el cambio</span><input type="text" inputmode="decimal" id="gc-ent" value="${esc(GC.ent||"")}" placeholder="Opcional"></label><span id="gc-cambio" style="margin-bottom:8px">${cambio!=null?(cambio>=0?`Cambio: <b>${eur(cambio)}</b>`:`<span style="color:var(--bad)">Faltan ${eur(-cambio)}</span>`):""}</span></div>`:""}
      ${GC.forma==="beca"?`<p class="note" style="margin:6px 0 0">Beca: el recibo queda pagado por la beca (por ejemplo, «Liquidación beca 25-26»). Indica cuál en la nota.</p>`:""}
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:8px">${selQuien("gc-quien","¿Quién cobra?",true)}<label class="f" style="flex:0 1 110px">Hora<input type="time" id="gc-hora" value="${esc(GC.hora||hhmm())}"></label></div>
      <label class="f" style="margin-top:8px">Nota (opcional)<input type="text" id="gc-nota" maxlength="140" value="${esc(GC.nota||"")}"></label>
      <button class="btn primary" style="margin-top:10px;width:100%;font-size:16px;padding:10px" data-gc="cobrar" ${!sel.length||!GC.forma?"disabled":""}>${!sel.length?"Elige algún recibo":!GC.forma?"Elige la forma de pago":`Cobrar ${eur(tot)} · ${formaTxt(GC.forma)}`}</button>`
    :`<p class="note">No tiene recibos pendientes.</p>`}`;
}
function vCajaRes(l,q){
  if(q.length<2)return `<p class="note">Escribe al menos 2 letras.</p>`;
  if(!l.length)return `<p class="note">No hay ningún alumno con ese nombre.</p>`;
  return `<div class="list" style="margin-top:6px">${l.map(([id,x])=>{const p=pendientesDe(x,id),t=p.reduce((s,r)=>s+(+r.importe||0),0);
    return `<button class="li" data-gc="elegir" data-id="${esc(id)}"><span class="grow">${esc(titulo(x.nombre))}</span><small>${p.length?`${p.length} pendiente${p.length===1?"":"s"} · ${eur(r2(t))}`:"al día"}</small></button>`}).join("")}</div>`;
}
function vCajaHecho(){
  const c={...GC.ultimo,anulado:anulados().has(GC.ultimo.id)},a=S.alumnos.get(c.alumno),cs=a&&typeof contactosAl==="function"?contactosAl(a):[];
  const tel=GC.tel!=null?GC.tel:(cs[0]||{}).tel||"",rel=GC.rel!=null?GC.rel:(a&&typeof relDe==="function"?relDe(a,tel):"");
  return `<div class="aviso ${c.anulado?"pend":"info"}" style="display:block;margin:0 0 10px"><b>${c.anulado?"Cobro anulado":"Cobrado"}: ${eur(c.total)}</b> · ${formaTxt(c.forma)} · ${esc(titulo(c.nombre))}<br><span class="note">${horaC(c)} · cobra ${esc(c.quien||c.por||"")}</span>${c.cambio>0?`<br>Cambio: <b>${eur(c.cambio)}</b>`:""}</div>
    <b style="font-size:14px">Justificante</b>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px">
      <button class="btn primary" data-gc="imprimir">Imprimir ticket</button>
      <label class="f" style="flex:0 1 120px">Papel<select id="gc-ancho"><option value="80" ${anchoTk()==="80"?"selected":""}>80 mm</option><option value="58" ${anchoTk()==="58"?"selected":""}>58 mm</option></select></label></div>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:12px">
      ${cs.length>1?`<div style="flex-basis:100%;display:flex;gap:6px;flex-wrap:wrap">${cs.map(x=>`<button class="chip" data-gc="usatel" data-t="${x.tel}" data-r="${esc(x.rel)}" aria-pressed="${x.tel===tel}">${x.rel?`<b>${esc(x.rel)}</b> · `:""}${fmtTel(x.tel)}${x.pag?" ★":""}</button>`).join("")}</div>`:""}
      <label class="f" style="flex:1 1 150px">WhatsApp a<input type="tel" id="gc-tel" inputmode="tel" value="${esc(tel)}" placeholder="Móvil (9 cifras)"></label>
      <label class="f" style="flex:0 1 140px">Quién paga<select id="gc-rel"><option value="">—</option>${(typeof REL_OPC!=="undefined"?REL_OPC:[]).map(r=>`<option ${r===rel?"selected":""}>${r}</option>`).join("")}</select></label>
      <button class="btn" data-gc="wa">Enviar por WhatsApp</button></div>
    <label class="chk" style="margin-top:6px"><input type="checkbox" id="gc-guardatel" checked><span>Guardar este número en su ficha con quién es (la próxima vez saldrá el primero)</span></label>
    <p class="note" style="margin:4px 0 0">Se envía la imagen del ticket. En el ordenador se abre el chat de ese número con la imagen ya copiada: pulsa <b>Ctrl+V</b> y envía. En el móvil o la tablet se abre «Compartir»: elige WhatsApp y el contacto.</p>
    <button class="btn" style="margin-top:12px;width:100%" data-gc="nuevo">Nuevo cobro</button>`;
}
function vApunteForm(){const L=conceptos(),c=L.find(x=>x.id===GC.acc),s=c?c.s:"±";
  return `<label class="f" style="margin-top:6px">Concepto<select id="gc-acc"><option value="">Elige…</option>${L.map(x=>`<option value="${esc(x.id)}" ${x.id===GC.acc?"selected":""}>${esc(x.n)}${x.s==="±"?"":x.s==="+"?" (+)":" (−)"}</option>`).join("")}<option value="_otro" ${GC.acc==="_otro"?"selected":""}>Otro concepto…</option></select></label>
    ${GC.acc==="_otro"?`<label class="f" style="margin-top:6px">Concepto (obligatorio)<input type="text" id="gc-acon" maxlength="140" placeholder="Ej.: pago de material de limpieza"></label>`:""}
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px">${s==="±"?`<label class="f" style="flex:0 1 170px">Tipo<select id="gc-asig"><option value="1">Entrada (+)</option><option value="-1">Salida (−)</option></select></label>`:`<span class="badge ${s==="+"?"b-si":"b-pend"}" style="margin-bottom:8px">${SIG_TXT[s]}</span>`}<label class="f" style="flex:0 1 120px">Importe (€)<input type="text" inputmode="decimal" id="gc-aimp"></label></div>
    <label class="f" style="margin-top:6px">Detalle (opcional)<input type="text" id="gc-anota" maxlength="140" placeholder="Ej.: proveedor, nº de ticket, qué ha pasado"></label>
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px">${selQuien("gc-qapu")}<label class="f" style="flex:0 1 100px">Hora<input type="time" id="gc-ahora" value="${hhmm()}"></label><button class="btn small primary" data-gc="apunte" style="margin-bottom:2px">Guardar apunte</button></div>
    ${esMos()?"":`<p class="note" style="margin:6px 0 0">Las salidas pasan solas a <b>Gastos</b> (cuenta «Caja»): allí se adjunta la factura o se marcan como no deducibles. <a href="#" data-gc="concedit">Editar la lista de conceptos</a></p>${GC.edCon?vConceptosEdit():""}`}`}
function vConceptosEdit(){const L=GC.edCon,cats=CATS.filter(([k,,t])=>t!=="p");
  const sel=(i,v)=>`<select data-gccon="${i}|cat" style="max-width:200px">${cats.map(([k,l])=>`<option value="${k}" ${k===v?"selected":""}>${esc(l)}</option>`).join("")}</select>`;
  return `<div class="panel" style="padding:10px 12px;margin-top:8px"><b>Conceptos de apuntes</b> <span class="note">· la categoría es con la que llega a Gastos</span>
    ${L.map((x,i)=>`<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:6px"><input type="text" data-gccon="${i}|n" value="${esc(x.n)}" maxlength="60" style="flex:1 1 180px"><select data-gccon="${i}|s">${Object.entries(SIG_TXT).map(([k,l])=>`<option value="${k}" ${k===x.s?"selected":""}>${l}</option>`).join("")}</select>${sel(i,x.cat)}<button class="btn small" data-gc="conquitar" data-i="${i}" aria-label="Quitar">×</button></div>`).join("")}
    <div class="row" style="gap:8px;margin-top:8px;border:0;padding:0"><button class="btn small" data-gc="conadd">+ Añadir concepto</button><button class="btn small primary" data-gc="conok">Guardar conceptos</button><button class="btn small" data-gc="conno">Cancelar</button></div></div>`}
function vCajaEstado(dia){
  /* 10/11/2026: el saldo pasa solo de un día a otro. Se propone lo contado en el último cierre; y si el último día con caja
     abierta no se llegó a cerrar, lo que debería haber quedado ese día (con aviso de que conviene contarlo). */
  const hoy=dia===todayISO(),E=estadoCaja(dia),uc=ultimoCierre(),an=anulados();
  const sinCerrar=[...new Set(GC.docs.filter(d=>d.tipo==="apertura"&&d.dia<todayISO()).map(d=>d.dia))].sort().reverse().map(d=>estadoCaja(d)).find(x=>x.abierta);
  const pend=sinCerrar&&(!uc||sinCerrar.dia>=uc.dia)?sinCerrar:null,prop=pend?pend.esperado:uc&&uc.dia<todayISO()?uc.contado:null;
  const linea=d=>`<div class="row" style="flex-wrap:wrap${d.tipo==="apunte"&&an.has(d.id)?";opacity:.55;text-decoration:line-through":""}"><span class="note" style="font-variant-numeric:tabular-nums">${horaC(d)}</span><span class="grow" title="${esc([d.concepto,d.nota].filter(Boolean).join(" · "))}">${d.tipo==="apertura"?`Apertura con <b>${eur(+d.fondo)}</b>`:d.tipo==="retirada"?`Retirada de <b>${eur(+d.importe)}</b> · «${esc(d.nota||"")}»`:d.tipo==="apunte"?`${+d.signo>0?"Entrada":"Salida"} <b style="color:var(${+d.signo>0?"--ok":"--bad"})">${+d.signo>0?"+":"−"}${eur(+d.importe)}</b> · ${esc(d.concepto||"")}${d.nota?` · «${esc(d.nota)}»`:""}`:`Cierre: esperado ${eur(+d.esperado)}, contado <b>${eur(+d.contado)}</b>${Math.abs(+d.descuadre)>0.009?` · <b style="color:var(--bad)">descuadre ${eur(+d.descuadre)}</b>`:" · cuadra"}${d.nota?` · «${esc(d.nota)}»`:""}`}</span>${d.tipo==="apunte"&&an.has(d.id)?`<span class="badge b-no">anulado</span>`:""}${d.tipo==="apunte"&&!an.has(d.id)&&!esMos()?`<button class="btn small" data-gc="anuapu" data-id="${esc(d.id)}" title="Por ejemplo, si era de prueba o está mal">Anular</button>`:""}<span class="note">${esc(d.quien||d.por||"")}</span></div>`;
  const movs=deDia(dia).filter(d=>["apertura","retirada","apunte","cierre"].includes(d.tipo));
  let form="";
  if(hoy&&GC.ok&&!E.abierta){
    form=`<p style="margin:8px 0 4px">${E.cierre?"La caja está cerrada. Si hay que seguir cobrando hoy, vuelve a abrirla."
      :pend?`<span style="color:var(--warn)">La caja del <b>${fmtFecha(pend.dia)}</b> no se cerró.</span> Debería haber quedado <b>${eur(pend.esperado)}</b>: está puesto abajo. Cuenta el efectivo y, si no coincide, escribe lo que hay (la diferencia queda apuntada).`
      :uc?`Último cierre: ${fmtFecha(uc.dia)}, contado ${eur(+uc.contado)}. Está puesto abajo: si al contar hay otra cantidad, cámbiala.`:"Es la primera vez: escribe el efectivo con el que empieza la caja."}</p>
      <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><label class="f" style="flex:0 1 150px">Efectivo inicial (€)<input type="text" inputmode="decimal" id="gc-fondo" value="${E.cierre?esc(fmtNum(E.cierre.contado)):prop!=null?esc(fmtNum(prop)):""}"></label>${selQuien("gc-qap")}<button class="btn small primary" data-gc="abrir" style="margin-bottom:2px">${E.cierre?"Volver a abrir":"Abrir caja"}</button></div>`;
  }else if(hoy&&E.abierta){
    form=`<p style="margin:8px 0 2px">Efectivo que debería haber en la caja: <b style="font-size:17px">${eur(E.esperado)}</b></p>
      <p class="note" style="margin:0">Inicial ${eur(+E.ap.fondo)} + efectivo cobrado ${eur(E.ef)}${E.ent?` + entradas ${eur(E.ent)}`:""}${E.sal?` − salidas ${eur(E.sal)}`:""}${E.rt?` − retiradas ${eur(E.rt)}`:""}</p>
      <details style="margin-top:10px" ${GC.apuOpen?"open":""} data-gcdet="apu"><summary><b>Apunte manual</b> <span class="note">(entrada o salida de efectivo)</span></summary>${vApunteForm()}</details>
      <details style="margin-top:10px"><summary><b>Retirada de caja</b></summary>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px"><label class="f" style="flex:0 1 120px">Importe (€)<input type="text" inputmode="decimal" id="gc-rimp"></label>${selQuien("gc-qret","¿Quién retira?")}<label class="f" style="flex:0 1 100px">Hora<input type="time" id="gc-rhora" value="${hhmm()}"></label></div>
        <label class="f" style="margin-top:6px">Nota (obligatoria): quién se lo lleva y para qué<input type="text" id="gc-rnota" maxlength="140" placeholder="Ej.: Fani lo ingresa en el banco; compra de material"></label>
        <button class="btn small primary" data-gc="retirar" style="margin-top:6px">Registrar retirada</button></details>
      <details style="margin-top:8px"><summary><b>Cierre de caja</b></summary>
        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-top:6px"><label class="f" style="flex:0 1 150px">Efectivo contado (€)<input type="text" inputmode="decimal" id="gc-contado"></label>${selQuien("gc-qcie","¿Quién cierra?")}</div>
        <label class="f" style="margin-top:6px">Nota<input type="text" id="gc-cnota" maxlength="140" placeholder="Opcional"></label>
        <button class="btn small primary" data-gc="cerrar" style="margin-top:6px">Cerrar caja</button>
        <p class="note" style="margin:4px 0 0">Cuenta todo el efectivo del cajón, incluido el inicial.</p></details>`;
  }
  return `<div class="panel" style="padding:14px 16px;margin-bottom:12px"><div class="bar" style="margin:0"><b style="font-size:15px;margin-right:auto">${hoy?"Apertura, retiradas y cierre":"Caja del "+fmtFecha(dia)}</b>${GC.ok?(E.abierta?`<span class="badge b-si">Abierta</span>`:E.cierre?`<span class="badge b-off">Cerrada</span>`:`<span class="badge b-pend">Sin abrir</span>`):""}</div>
    ${movs.map(linea).join("")}${form}</div>`;
}
function vCajaDia(){
  const dir=!esMos(),dia=GC.dia&&dir?GC.dia:todayISO(),l=cobrosDia(dia),val=l.filter(c=>!c.anulado);
  const por={};for(const c of val)por[c.forma]=(por[c.forma]||0)+(+c.total||0);const tot=val.reduce((s,c)=>s+(+c.total||0),0);
  return `${vCajaEstado(dia)}<div class="panel" style="padding:14px 16px">
    <div class="bar" style="margin:0 0 6px"><b style="font-size:15px;margin-right:auto">${dia===todayISO()?"Cobros de hoy":"Cobros del "+fmtFecha(dia)}</b>${dir?`<input type="date" id="gc-dia" value="${dia}" max="${todayISO()}" aria-label="Día">`:""}</div>
    <div class="stats" style="margin-bottom:8px"><div class="stat"><b>${eur(r2(tot))}</b><span>${val.length} cobro${val.length===1?"":"s"}</span></div>
      ${FORMAS.filter(([k])=>por[k]).map(([k,lb])=>`<div class="stat"><b>${eur(r2(por[k]))}</b><span>${lb}</span></div>`).join("")}</div>
    ${l.length?l.map(c=>`<div class="row" style="flex-wrap:wrap;${c.anulado?"opacity:.55":""}"><span class="note" style="font-variant-numeric:tabular-nums">${horaC(c)}</span><span class="grow" style="white-space:normal;flex-basis:200px">${esc(titulo(c.nombre||""))} <span class="note">· ${(c.recibos||[]).map(r=>esc(r.numero||r.concepto||"")).join(", ")} · cobra ${esc(c.quien||c.por||"")}</span>${c.anulado?(()=>{const x=anulacionDe(c.id);return ` <span class="badge b-no">anulado</span>${x?`<br><span class="note" style="color:var(--bad)">Anulado a las ${horaDe(x.t)} por ${esc(x.por||"")}: «${esc(x.motivo||"")}»</span>`:""}`})():""}${cajaPrueba()&&!c.anulado?(()=>{const a=S.alumnos.get(c.alumno),rs=(c.recibos||[]).map(x=>((a&&a.recibos)||[]).find(y=>y.id===x.id)),ok=rs.every(y=>y&&y.estado==="pagado");return ` <span class="badge ${ok?"b-si":"b-pend"}" title="Estado del recibo según el último listado de Argos">${ok?"pagado en Argos":"pendiente en Argos"}</span>`})():""}${c.nota?`<br><span class="note">«${esc(c.nota)}»</span>`:""}</span>
      <span class="note">${formaTxt(c.forma)}</span><b style="font-variant-numeric:tabular-nums">${eur(+c.total)}</b>
      <button class="btn small" data-gc="ver" data-id="${esc(c.id)}" title="Imprimir o enviar el justificante">Justificante</button>${dir&&!c.anulado?`<button class="btn small" data-gc="anular" data-id="${esc(c.id)}">Anular</button>`:""}
      ${GC.anular===c.id?`<div style="flex-basis:100%;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap"><label class="f" style="flex:1 1 220px">Motivo de la anulación<input type="text" id="gc-motivo" maxlength="140"></label><button class="btn small primary" data-gc="anularok" data-id="${esc(c.id)}">Anular cobro</button><button class="btn small" data-gc="anularno">Cancelar</button></div>`:""}</div>`).join(""):`<p class="note">Todavía no hay cobros.</p>`}
    </div>`;
}

/* ---------- justificante ---------- */
function textoJust(c){const L=[`*Althea Formación* · Justificante de pago`,`Alumno: ${titulo(c.nombre||"")}`];
  for(const r of c.recibos||[])L.push(`• ${r.concepto||"Recibo"}${r.numero?" ("+r.numero+")":""}: ${eur(+r.importe)}`);
  L.push(`*Total: ${eur(+c.total)}* · ${formaTxt(c.forma)}`,`Fecha: ${fmtFecha(c.dia)} ${horaC(c)}`);if(c.anulado)L.push("(Cobro anulado)");L.push("Gracias.");return L.join("\n")}
/* Ticket con el mismo formato que el de Argos (recibo_muestra.pdf, 31/10/2026): logo, emisor con NIF, cliente, concepto,
   total, mención de exención de IVA y detalles de pago. Mientras Argos emita las facturas (modo prueba), es un justificante:
   no lleva la palabra «Factura» para no duplicar la de Argos. */
const EMISOR={nombre:"ALTHEA FORMACIÓN",dir:"C/ Iro 5",cp:"11130 - Chiclana de la Frontera (Cádiz)",nif:"48966357-R"};
const EXENTO_IVA="Exento de IVA: Art. 20.1.9 de la Ley 37/1992 (Ley del IVA) de 28 de diciembre y Art. 20.9 del Reglamento del IVA";
function imprimirTicket(c){
  const w=anchoTk(),old=$("#ticket");if(old)old.remove();
  const el=document.createElement("div");el.id="ticket";el.className="tk"+w;
  const nums=(c.recibos||[]).map(r=>r.numero).filter(Boolean);
  const h=t=>`<div class="tkh">${t}</div>`;
  el.innerHTML=`${typeof LOGO_AF==="string"?`<div style="text-align:center"><img src="${LOGO_AF}" alt="" style="width:22mm"></div>`:""}
    ${h("Justificante de pago")}
    <div class="tk2"><div><b>${EMISOR.nombre}</b><br>${EMISOR.dir}<br>${EMISOR.cp}<br>NIF: ${EMISOR.nif}</div>
      <div>${nums.length?`Recibo nº<br>${nums.map(esc).join("<br>")}<br>`:""}Fecha:<br>${fmtFecha(c.dia).replace(/\/(\d\d)$/,"/20$1")}<br>${horaC(c)}</div></div>
    ${h("Cliente")}<div>${esc(String(c.nombre||"").toUpperCase())}</div>
    ${h("Concepto")}${(c.recibos||[]).map(r=>`<div class="tkl"><span>${esc(r.concepto||"Recibo")}</span><span>${eur(+r.importe)}</span></div>`).join("")}
    <hr><div class="tkt">Total: ${eur(+c.total)}</div><hr>
    <div class="tkx">${EXENTO_IVA}</div>
    ${h("Detalles de pago")}<div>Forma de pago: ${formaTxt(c.forma)}</div>
    ${c.forma==="efectivo"&&c.entregado!=null?`<div>Entregado: ${eur(+c.entregado)} · Cambio: ${eur(+c.cambio||0)}</div>`:""}
    <div>Atendido por: ${esc(c.quien||c.por||"")}</div>${c.anulado?"<div><b>COBRO ANULADO</b></div>":""}
    ${cajaPrueba()?`<div class="tkx" style="margin-top:4px">Justificante de pago. La factura la emite el centro aparte.</div>`:""}
    ${typeof LOGO==="string"?`<div style="text-align:center;margin-top:6px"><img src="${LOGO}" alt="" style="width:38mm"></div>`:`<div style="text-align:center">¡Gracias!</div>`}`;
  document.body.appendChild(el);document.body.classList.add("printtk");
  const fin=()=>{document.body.classList.remove("printtk");el.remove();removeEventListener("afterprint",fin)};addEventListener("afterprint",fin);
  const imgs=[...el.querySelectorAll("img")];Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),50));
}
document.head.insertAdjacentHTML("beforeend",`<style>#ticket{display:none}
@media print{body.printtk>*:not(#ticket){display:none!important}body.printtk{background:#fff!important;padding:0!important}body.printtk::before{display:none}
body.printtk #ticket{display:block!important;color:#000;font:11px/1.3 Arial,"DejaVu Sans",sans-serif;margin:0;padding:2mm 3mm}
body.printtk #ticket.tk80{width:72mm}body.printtk #ticket.tk58{width:48mm;font-size:9.5px}
#ticket .tkh{font-size:1.45em;border-bottom:1.5px solid #000;margin:6px 0 3px;padding-bottom:1px}
#ticket .tk2{display:flex;gap:6px;justify-content:space-between}#ticket .tk2>div:last-child{text-align:left;white-space:nowrap}
#ticket .tkl{display:flex;justify-content:space-between;gap:6px}#ticket .tkt{font-size:1.6em;font-weight:700;margin:4px 0}
#ticket .tkx{font-style:italic;font-size:.9em;text-align:justify}#ticket hr{border:0;border-top:1px solid #999;margin:4px 0}
@page{margin:0}}</style>`);

/* Imagen del ticket (PNG) para enviarla por WhatsApp: mismo contenido que el ticket impreso. */
function tkCargarImg(src){return new Promise(r=>{if(!src){r(null);return}const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src})}
async function ticketImagen(c){
  const W=560,P=28,cv=document.createElement("canvas"),x=cv.getContext("2d");cv.width=W;cv.height=2000;
  x.fillStyle="#fff";x.fillRect(0,0,W,2000);x.fillStyle="#000";x.textBaseline="top";let y=P;
  const F=(sz,b,it)=>{x.font=`${it?"italic ":""}${b?"bold ":""}${sz}px Arial, "DejaVu Sans", sans-serif`};
  const wrap=(t,maxW)=>{const out=[];for(const par of String(t).split("\n")){let l="";for(const w of par.split(" ")){const n=l?l+" "+w:w;if(x.measureText(n).width>maxW&&l){out.push(l);l=w}else l=n}out.push(l)}return out};
  const txt=(t,sz,o={})=>{F(sz,o.b,o.i);const mw=o.w||W-2*P;for(const l of wrap(t,mw)){const xx=o.c?(W-x.measureText(l).width)/2:o.r?W-P-x.measureText(l).width:(o.x||P);x.fillText(l,xx,y);y+=Math.round(sz*1.3)}};
  const titulo=t=>{y+=10;txt(t,28);x.fillRect(P,y,W-2*P,2);y+=8};
  const raya=()=>{y+=4;x.fillStyle="#999";x.fillRect(P,y,W-2*P,1);x.fillStyle="#000";y+=8};
  const af=await tkCargarImg(typeof LOGO_AF==="string"?LOGO_AF:null),lg=await tkCargarImg(typeof LOGO==="string"?LOGO:null);
  if(af){const w=130,h=af.height*w/af.width;x.drawImage(af,(W-w)/2,y,w,h);y+=h+6}
  titulo("Justificante de pago");
  const y0=y,nums=(c.recibos||[]).map(r=>r.numero).filter(Boolean);
  txt(EMISOR.nombre,19,{b:1,w:330});txt(EMISOR.dir,19,{w:330});txt(EMISOR.cp,19,{w:330});txt("NIF: "+EMISOR.nif,19,{w:330});const y1=y;
  y=y0;const xr=W-P-150;for(const l of [...(nums.length?["Recibo nº",...nums]:[]),"Fecha:",fmtFecha(c.dia).replace(/\/(\d\d)$/,"/20$1"),horaC(c)])txt(l,19,{x:xr,w:150});y=Math.max(y,y1);
  titulo("Cliente");txt(String(c.nombre||"").toUpperCase(),19);
  titulo("Concepto");
  for(const r of c.recibos||[]){const y2=y;txt(r.concepto||"Recibo",19,{w:W-2*P-110});const y3=y;y=y2;txt(eur(+r.importe),19,{r:1});y=Math.max(y,y3)}
  raya();txt("Total: "+eur(+c.total),34,{b:1});raya();
  txt(EXENTO_IVA,16,{i:1});
  titulo("Detalles de pago");txt("Forma de pago: "+formaTxt(c.forma),19);
  if(c.forma==="efectivo"&&c.entregado!=null)txt(`Entregado: ${eur(+c.entregado)} · Cambio: ${eur(+c.cambio||0)}`,19);
  txt("Atendido por: "+(c.quien||c.por||""),19);if(c.anulado)txt("COBRO ANULADO",19,{b:1});
  if(cajaPrueba())txt("Justificante de pago. La factura la emite el centro aparte.",16,{i:1});
  if(lg){y+=12;const w=260,h=lg.height*w/lg.width;x.drawImage(lg,(W-w)/2,y,w,h);y+=h}
  y+=P;const out=document.createElement("canvas");out.width=W;out.height=y;out.getContext("2d").drawImage(cv,0,0);
  return new Promise(r=>out.toBlob(b=>r(b),"image/png"));
}
const esTactil=()=>{try{return matchMedia("(pointer:coarse)").matches}catch(_){return false}};
async function enviarTicketWA(c,tel){
  const txt=`Justificante de pago de ${titulo(c.nombre||"")} · ${eur(+c.total)} · Althea Formación`;
  let blob=null;try{blob=await ticketImagen(c)}catch(e){console.error(e)}
  const file=blob?new File([blob],`justificante-${(c.recibos||[]).map(r=>r.numero).filter(Boolean).join("-").replace(/[^A-Za-z0-9-]/g,"")||c.id}.png`,{type:"image/png"}):null;
  const abrirChat=t=>window.open(`https://wa.me/34${tel}${t?`?text=${encodeURIComponent(t)}`:""}`,"_blank","noopener");
  /* móvil o tablet: «Compartir» con la imagen (se elige WhatsApp y el contacto) */
  if(file&&esTactil()){try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text:txt});return}}catch(e){if(e&&e.name==="AbortError")return}}
  /* ordenador: se copia la imagen y se abre el chat de ese número; allí se pega con Ctrl+V */
  if(blob){try{await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);abrirChat("");toast("Imagen del ticket copiada. En el chat de WhatsApp pulsa Ctrl+V y envía.");return}catch(e){console.warn(e)}}
  /* si no se puede copiar: se descarga la imagen y se abre el chat para adjuntarla */
  if(file){try{const dl=await window.claude.use("downloads");if(dl){await dl.save({filename:file.name,data:file});abrirChat("");toast("Imagen descargada. Adjúntala en el chat de WhatsApp con el clip.");return}}catch(_){}}
  abrirChat(textoJust(c));
}

/* ---------- acciones ---------- */
async function guardarCaja(doc,errTxt){const cid=cajaId();setStatus("Guardando…");
  try{await S.db.doc("caja/"+cid).set({...doc,t:nowISO(),dia:todayISO(),por:quienSoy()});setStatus("Guardado");return cid}
  catch(e){console.error(e);setStatus("Sin guardar");toast(errTxt||"No se ha podido guardar: faltan permisos en la base de datos.");return null}}
async function cobrar(){
  const id=GC.al,a=S.alumnos.get(id);if(!a)return;if(!estadoCaja().abierta){toast("Primero abre la caja");return}
  const pend=pendientesDe(a,id),sel=pend.filter(r=>GC.sel&&GC.sel.has(r.id));
  if(!sel.length||!GC.forma)return;const tot=r2(sel.reduce((s,r)=>s+(+r.importe||0),0));
  const quien=leerQuien("gc-quien");if(!quien)return;const hora=(($("#gc-hora")||{}).value)||hhmm();
  const ent=GC.forma==="efectivo"?gtNum(GC.ent):null;if(ent!=null&&(isNaN(ent)||ent<tot)){toast("La entrega es menor que el total");return}
  const doc={tipo:"cobro",alumno:id,nombre:a.nombre,recibos:sel.map(r=>({id:r.id,numero:r.numero||"",concepto:r.concepto||r.curso||"",importe:+r.importe})),total:tot,forma:GC.forma,quien,hora,
    ...(ent!=null?{entregado:ent,cambio:r2(ent-tot)}:{}),...(GC.nota?{nota:String(GC.nota).slice(0,140)}:{})};
  const cid=await guardarCaja(doc,"No se ha podido guardar el cobro: faltan permisos en la base de datos. No se ha cobrado nada.");if(!cid)return;
  const full={id:cid,...doc,t:nowISO(),dia:todayISO(),por:quienSoy()};if(!GC.docs.some(d=>d.id===cid))GC.docs.push(full);
  if(!cajaPrueba()){const ids=new Set(sel.map(r=>r.id)),recibos=(a.recibos||[]).map(r=>ids.has(r.id)?{...r,estado:"pagado",pagado:full.dia,forma:formaTxt(GC.forma),caja:{id:cid,t:full.t,por:quien}}:r);
    if(!(await save(id,{recibos})))toast("El cobro está apuntado en la caja, pero no se han podido marcar los recibos como pagados. Avisa a dirección.");
    else{a.recibos=recibos;if(!esMos())revisarBajas().catch(()=>{})}}
  GC.ultimo=full;GC.tel=null;GC.rel=null;GC.sel=null;GC.forma="";GC.ent="";GC.nota="";GC.hora="";GC.quien="";render();toast(`Cobrado ${eur(tot)}`);
}
document.addEventListener("input",e=>{const t=e.target;if(!t||!t.id)return;
  if(t.id==="gc-q"){GC.q=t.value;const q=nzC(t.value),l=q.length>=2?sortedAlumnos().filter(([,x])=>!x.bloqueado&&x.nombre.includes(q)).slice(0,12):[];const r=$("#gc-res");if(r)r.innerHTML=vCajaRes(l,q)}
  else if(t.id==="gc-ent"){GC.ent=t.value;const a=S.alumnos.get(GC.al);if(!a)return;const tot=pendientesDe(a,GC.al).filter(r=>GC.sel.has(r.id)).reduce((s,r)=>s+(+r.importe||0),0),ent=gtNum(t.value),c=$("#gc-cambio");
    if(c)c.innerHTML=ent!=null&&!isNaN(ent)?(ent-tot>=-0.004?`Cambio: <b>${eur(r2(ent-tot))}</b>`:`<span style="color:var(--bad)">Faltan ${eur(r2(tot-ent))}</span>`):""}
  else if(t.id==="gc-nota")GC.nota=t.value;else if(t.id==="gc-tel")GC.tel=t.value;else if(t.id==="gc-rel")GC.rel=t.value;else if(t.id==="gc-hora")GC.hora=t.value});
document.addEventListener("change",e=>{const t=e.target;if(!t)return;
  if(t.dataset&&t.dataset.gcr){if(!GC.sel)GC.sel=new Set();GC.hora=(($("#gc-hora")||{}).value)||GC.hora;t.checked?GC.sel.add(t.dataset.gcr):GC.sel.delete(t.dataset.gcr);render()}
  else if(t.id==="gc-ancho")lsSet("althea.ticket",t.value);
  else if(t.id==="gc-quien")GC.quien=t.value;
  else if(t.id==="gc-acc"){GC.acc=t.value;GC.apuOpen=true;const r=$("#gc-hoy");if(r)r.innerHTML=vCajaDia();const i=$(GC.acc==="_otro"?"#gc-acon":"#gc-aimp");if(i)i.focus()}
  else if(t.dataset&&t.dataset.gccon&&GC.edCon){const [i,k]=t.dataset.gccon.split("|");if(GC.edCon[+i])GC.edCon[+i][k]=t.value}
  else if(t.id==="gc-dia"){GC.dia=t.value||"";const r=$("#gc-hoy");if(r)r.innerHTML=vCajaDia()}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-gc]");if(!t)return;e.preventDefault();if(!cajaVer())return;const act=t.dataset.gc;
  if(act==="elegir"){GC.al=t.dataset.id;GC.sel=null;GC.forma="";GC.ent="";GC.nota="";GC.hora="";GC.quien="";render()}
  else if(act==="otro"){GC.al=null;GC.sel=null;GC.forma="";render();setTimeout(()=>{const i=$("#gc-q");if(i){i.focus();i.select()}},0)}
  else if(act==="forma"){GC.hora=(($("#gc-hora")||{}).value)||GC.hora;GC.forma=t.dataset.v;render()}
  else if(act==="cobrar"){t.disabled=true;await cobrar();t.disabled=false}
  else if(act==="nuevo"){GC.ultimo=null;GC.al=null;GC.q="";GC.tel=null;GC.rel=null;render();setTimeout(()=>{const i=$("#gc-q");if(i)i.focus()},0)}
  else if(act==="ver"){const c=cobrosDia(GC.dia&&!esMos()?GC.dia:todayISO()).find(x=>x.id===t.dataset.id);if(c){GC.ultimo=c;GC.tel=null;GC.rel=null;render();scrollTo(0,0)}}
  else if(act==="imprimir"){if(GC.ultimo)imprimirTicket({...GC.ultimo,anulado:anulados().has(GC.ultimo.id)})}
  else if(act==="wa"){const c=GC.ultimo&&{...GC.ultimo,anulado:anulados().has(GC.ultimo.id)};if(!c)return;const tel=digitos(($("#gc-tel")||{}).value||"").slice(-9);if(tel.length!==9){toast("Escribe un móvil de 9 cifras");return}
    await enviarTicketWA(c,tel);
    if(($("#gc-guardatel")||{}).checked&&typeof guardarContacto==="function"){const rel=($("#gc-rel")||{}).value||"";if(await guardarContacto(c.alumno,tel,rel,true))toast(`Guardado en su ficha${rel?" como "+rel:""}`)}}
  else if(act==="usatel"){GC.tel=t.dataset.t;GC.rel=t.dataset.r||"";render()}
  else if(act==="abrir"){const v=gtNum(($("#gc-fondo")||{}).value);if(v==null||isNaN(v)||v<0){toast("Escribe el efectivo inicial (0 si no hay)");return}const quien=leerQuien("gc-qap");if(!quien)return;
    /* lo que se arrastraba (cierre anterior o día sin cerrar) frente a lo contado al abrir: si no coincide, queda como descuadre de apertura */
    const uc=ultimoCierre(),sc=[...new Set(GC.docs.filter(d=>d.tipo==="apertura"&&d.dia<todayISO()).map(d=>d.dia))].sort().reverse().map(d=>estadoCaja(d)).find(x=>x.abierta);
    const pend=sc&&(!uc||sc.dia>=uc.dia)?sc:null,arr=pend?pend.esperado:uc&&uc.dia<todayISO()?+uc.contado:null,dif=arr!=null?r2(v-arr):0;
    t.disabled=true;if(await guardarCaja({tipo:"apertura",fondo:v,quien,hora:hhmm(),...(arr!=null?{arrastre:arr,desdeDia:pend?pend.dia:uc.dia,...(pend?{sinCerrar:true}:{}),...(Math.abs(dif)>0.009?{descuadre:dif}:{})}:{})},"No se ha podido abrir la caja: faltan permisos en la base de datos.")){toast(`Caja abierta con ${eur(v)}${Math.abs(dif)>0.009?` · diferencia con lo que debía haber: ${dif>0?"+":"−"}${eur(Math.abs(dif))}`:""}`)}t.disabled=false}
  else if(act==="apunte"){const cc=String(($("#gc-acc")||{}).value||""),c=conceptos().find(x=>x.id===cc);if(!cc){toast("Elige el concepto");return}
    const sg=c&&c.s!=="±"?(c.s==="+"?1:-1):(+(($("#gc-asig")||{}).value||1)<0?-1:1),v=gtNum(($("#gc-aimp")||{}).value),con=c?c.n:String(($("#gc-acon")||{}).value||"").trim(),nota=String(($("#gc-anota")||{}).value||"").trim();
    if(!con){toast("Escribe el concepto");return}if(v==null||isNaN(v)||v<=0){toast("Escribe el importe del apunte");return}const quien=leerQuien("gc-qapu");if(!quien)return;const E0=estadoCaja();if(!E0.abierta){toast("Primero abre la caja");return}
    if(sg<0&&v>E0.esperado+0.004&&t.dataset.neg!==String(v)){t.dataset.neg=String(v);t.textContent="La caja quedaría en "+eur(r2(E0.esperado-v))+". ¿Seguro? Pulsa otra vez";setTimeout(()=>{if(t.isConnected){delete t.dataset.neg;t.textContent="Guardar apunte"}},6000);return}
    t.disabled=true;if(await guardarCaja({tipo:"apunte",signo:sg,importe:v,concepto:con.slice(0,140),cc:c?c.id:"",...(nota?{nota:nota.slice(0,140)}:{}),quien,hora:(($("#gc-ahora")||{}).value)||hhmm()},"No se ha podido guardar el apunte: faltan permisos en la base de datos.")){GC.acc="";toast(`Apunte guardado: ${sg>0?"+":"−"}${eur(v)}`)}t.disabled=false}
  else if(act==="anuapu"){if(esMos())return;const d=GC.docs.find(x=>x.id===t.dataset.id);if(!d)return;
    if(!t.dataset.ok){t.dataset.ok="1";t.textContent="¿Seguro? Pulsa otra vez";t.classList.add("primary");setTimeout(()=>{if(t.isConnected){delete t.dataset.ok;t.textContent="Anular";t.classList.remove("primary")}},4000);return}
    t.disabled=true;if(await guardarCaja({tipo:"anulacion",ref:d.id,motivo:"Apunte anulado",total:+d.importe,signo:+d.signo},"No se ha podido anular: faltan permisos en la base de datos."))toast("Apunte anulado: sale también de Gastos");t.disabled=false}
  else if(act==="concedit"){GC.edCon=conceptos().map(x=>({...x}));GC.apuOpen=true;render()}
  else if(act==="conadd"){GC.edCon.push({id:"c"+Date.now().toString(36),n:"",s:"-",cat:"otrosg"});render()}
  else if(act==="conquitar"){GC.edCon.splice(+t.dataset.i,1);render()}
  else if(act==="conno"){GC.edCon=null;render()}
  else if(act==="conok"){const l=GC.edCon.map(x=>({...x,n:String(x.n||"").trim().slice(0,60)})).filter(x=>x.n);
    try{await S.db.doc("config/cajaConceptos").set({l,t:nowISO(),por:quienSoy()});GC.con={l};GC.edCon=null;render();toast("Conceptos guardados")}catch(e){console.error(e);toast("No se han podido guardar: faltan permisos (publica las reglas nuevas).")}}
  else if(act==="retirar"){const v=gtNum(($("#gc-rimp")||{}).value),nota=String(($("#gc-rnota")||{}).value||"").trim();if(v==null||isNaN(v)||v<=0){toast("Escribe el importe de la retirada");return}
    if(!nota){toast("Escribe en la nota quién se lo lleva y para qué");return}const quien=leerQuien("gc-qret");if(!quien)return;const E=estadoCaja();if(!E.abierta)return;
    if(v>E.esperado+0.004&&!confirm(`La retirada (${eur(v)}) es mayor que el efectivo que debería haber (${eur(E.esperado)}). ¿Registrarla igualmente?`))return;
    t.disabled=true;if(await guardarCaja({tipo:"retirada",importe:v,nota:nota.slice(0,140),quien,hora:(($("#gc-rhora")||{}).value)||hhmm()},"No se ha podido registrar la retirada: faltan permisos en la base de datos."))toast(`Retirada de ${eur(v)} registrada`);t.disabled=false}
  else if(act==="cerrar"){const v=gtNum(($("#gc-contado")||{}).value);if(v==null||isNaN(v)||v<0){toast("Escribe el efectivo contado");return}const quien=leerQuien("gc-qcie");if(!quien)return;
    const E=estadoCaja();if(!E.abierta)return;t.disabled=true;
    if(await guardarCaja({tipo:"cierre",esperado:E.esperado,contado:v,descuadre:r2(v-E.esperado),nota:String(($("#gc-cnota")||{}).value||"").slice(0,140),quien,hora:hhmm()},"No se ha podido guardar el cierre: faltan permisos en la base de datos."))
      toast(Math.abs(v-E.esperado)<0.01?"Caja cerrada: cuadra":`Caja cerrada con descuadre de ${eur(r2(v-E.esperado))}`);t.disabled=false}
  else if(act==="anular"){GC.anular=t.dataset.id;const r=$("#gc-hoy");if(r)r.innerHTML=vCajaDia();setTimeout(()=>{const i=$("#gc-motivo");if(i)i.focus()},0)}
  else if(act==="anularno"){GC.anular=null;const r=$("#gc-hoy");if(r)r.innerHTML=vCajaDia()}
  else if(act==="anularok"){if(esMos())return;const c=GC.docs.find(x=>x.id===t.dataset.id),mot=String(($("#gc-motivo")||{}).value||"").trim();if(!c)return;if(!mot){toast("Escribe el motivo");return}
    if(!cajaPrueba()){const a0=S.alumnos.get(c.alumno),fr=a0&&(a0.recibos||[]).filter(r=>r.caja&&r.caja.id===c.id).map(r=>feDeRecibo(c.alumno,r,"real")).find(Boolean);if(fr){toast(`Este cobro ya tiene la factura ${fr.n}: no se puede anular. Hace falta una factura rectificativa.`);return}}
    t.disabled=true;if(!(await guardarCaja({tipo:"anulacion",ref:c.id,motivo:mot.slice(0,140),total:+c.total,forma:c.forma,alumno:c.alumno,nombre:c.nombre},"No se ha podido anular: faltan permisos en la base de datos."))){t.disabled=false;return}
    const a=cajaPrueba()?null:S.alumnos.get(c.alumno);if(a){const recibos=(a.recibos||[]).map(r=>r.caja&&r.caja.id===c.id?(({caja,...x})=>({...x,estado:"pendiente",pagado:"",forma:""}))(r):r);if(await save(c.alumno,{recibos}))a.recibos=recibos}
    GC.anular=null;render();toast(cajaPrueba()?"Cobro de prueba anulado":"Cobro anulado; sus recibos vuelven a pendiente")}
});

/* ============================================================================================
   Fase 2 · Gastos y banco (31/10/2026). Solo dirección.
   - Se suben los extractos del Banco Sabadell (.xls «Consulta de movimientos», cuentas …6140 y …9531). Se reconoce cada
     movimiento por cuenta, fecha operativa, fecha valor, importe y saldo: al volver a subir un periodo solo entran los nuevos.
   - Datos: banco/<AAAA-MM> (mes de la fecha valor) = {mes, movs:{<id>:{cuenta, fo, fv, concepto, importe, saldo, ref1, ref2,
     cat, auto, catPor?, just?:{id,n}, nota?, t}}}. Reglas aprendidas: config/banco.reglas = {<clave del concepto>: cat}.
   - Categorías automáticas (decisión de la fase 2) y aprendidas: al clasificar un concepto una vez, los movimientos iguales
     pendientes y los de próximos extractos se clasifican solos.
   - «No es de la actividad» y «Traspaso entre cuentas» no cuentan como gasto ni ingreso; «Depósito de caja en banco» tampoco
     (es efectivo ya cobrado).
   ============================================================================================ */
const CATS=[["tpv","Cobros con tarjeta (TPV)","i"],["bizum","Cobros por Bizum","i"],["transf","Cobros por transferencia","i"],["otrosing","Otros ingresos","i"],["talleres","Talleres y servicios a entidades (facturas)","i"],
  ["nominas","Nóminas","g"],["ssaut","Seguridad Social autónomo","g"],["ssemp","Seguridad Social empleadas","g"],["comis","Comisiones bancarias","g"],
  ["sumin","Suministros (luz, gas, agua)","g"],["telef","Teléfono e internet","g"],["matofi","Material de oficina","g"],["matdid","Material didáctico","g"],
  ["asesoria","Asesoría","g"],["seguros","Seguros","g"],["cuotas","Cuotas profesionales","g"],["alquiler","Alquiler y renting","g"],["impuestos","Impuestos y tasas","g"],
  ["software","Programas y suscripciones","g"],["manten","Mantenimiento y limpieza","g"],["formacion","Formación","g"],["otrosg","Otros gastos","g"],
  ["deposito","Depósito de caja en banco","x"],["cambio","Cambio en monedas y movimientos internos de caja","x"],["nodeduc","No deducible (no entra en resultados)","x"],["traspaso","Traspaso entre cuentas","x"],["noact","No es de la actividad","x"],["pend","Pendiente de clasificar","p"]];
const CAT=Object.fromEntries(CATS.map(([k,l,t])=>[k,{l,t}]));
const catTxt=k=>(CAT[k]||CAT.pend).l,catTipo=k=>(CAT[k]||CAT.pend).t;
const REGLAS_AUTO=[[/^TRASPASO/,"traspaso"],[/^ABONO TPV/,"tpv"],[/^COMISI|INTERESES Y\/O COMISIONES/,"comis"],[/^ABONO BIZUM/,"bizum"],[/^ABONO TRANSFERENCIA/,"transf"],
  [/INGRESO EFECTIVO/,"deposito"],[/TGSS.*AUTONOMO/,"ssaut"],[/TGSS/,"ssemp"],[/ORANGE|MOVISTAR|VODAFONE|MASMOVIL|JAZZTEL|\bDIGI\b/,"telef"],
  [/NATURGY|ENDESA|IBERDROLA|AQUALIA|AGUAS DE|TOTALENERGIES/,"sumin"],[/OFICOPYER/,"matofi"],[/A3 ASESORES|ASESORES/,"asesoria"],
  [/GENERALI|MAPFRE|^SEGUROS|CENTROS MED/,"seguros"],[/CUOTA PROFESIONAL|COLEGIO OFICIAL|ASOCIACION/,"cuotas"],[/ARGOS GALAICA/,"software"],
  [/^IMPUESTOS|AGENCIA TRIBUTARIA|AEAT|AYUNTAMIENTO/,"impuestos"],[/SIEMENS FINANCIAL|RENTING|ALQUILER/,"alquiler"]];
const GB={docs:[],ok:false,sub:null,cfg:null,mes:"",cuenta:"",cat:"",q:"",imp:null,err:"",just:null};
const claveMov=c=>String(c||"").toUpperCase().split(/\s+/).filter(w=>w&&!/\d/.test(w)).join(" ").slice(0,60);
function catAuto(concepto,reglas,importe){const k=claveMov(concepto);if(reglas&&reglas[k])return {cat:reglas[k],por:"aprendida"};const C=String(concepto||"").toUpperCase();
  /* transferencia recibida sin «ABONO» delante («TRANSFERENCIA CARLOS ALBERT REYES…», 07/11/2026): cobro por transferencia */
  if(importe>0&&/^TRANSFERENCIA (?!A )/.test(C))return {cat:"transf",por:"auto"};
  if(/^TRANSFERENCIA A /.test(C)&&EQUIPO.some(n=>new RegExp("\\b"+n.toUpperCase()+"\\b").test(C.replace(/^TRANSFERENCIA A /,""))))return {cat:"nominas",por:"auto"};
  for(const [re,c] of REGLAS_AUTO)if(re.test(C))return {cat:c,por:"auto"};return {cat:"pend",por:""}}
const hashTxt=s=>{let h1=5381,h2=52711;for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=(h1*33)^c;h2=(h2*33)^c}return "m"+(h1>>>0).toString(36)+(h2>>>0).toString(36)};
const numBanco=v=>{if(typeof v==="number")return Math.round(v*100)/100;let s=String(v??"").trim().replace(/\s|€/g,"");if(!s)return null;
  if(/,\d{1,2}$/.test(s))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");const n=+s;return isNaN(n)?null:Math.round(n*100)/100};
const fechaBanco=v=>{if(v instanceof Date&&!isNaN(v))return isoDe(v);if(typeof v==="number"&&v>20000){const d=new Date(Date.UTC(1899,11,30)+v*86400000);return d.toISOString().slice(0,10)}
  const m=String(v||"").trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);if(!m)return "";const y=m[3].length===2?"20"+m[3]:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`};
/* filas = sheet_to_json(header:1) de un extracto del Sabadell */
function leerExtracto(filas){
  let cuenta="",titular="",i0=-1;
  for(let i=0;i<Math.min(filas.length,40);i++){const r=filas[i].map(x=>String(x??"").trim());
    if(/^Cuenta/i.test(r[0]))cuenta=(r.slice(1).find(Boolean)||"").replace(/\s/g,"");if(/^Titular/i.test(r[0]))titular=r.slice(1).find(Boolean)||"";
    if(/F\.?\s*Operativa/i.test(r[0])&&/Concepto/i.test(r[1]||"")){i0=i;break}}
  if(i0<0)throw new Error("No parece un extracto de «Consulta de movimientos» del Sabadell: no encuentro la fila «F. Operativa · Concepto · F. Valor · Importe · Saldo».");
  const cab=filas[i0].map(x=>String(x??"").trim().toLowerCase()),col=n=>cab.findIndex(c=>c.startsWith(n));
  const ci={fo:col("f. operativa"),con:col("concepto"),fv:col("f. valor"),imp:col("importe"),sal:col("saldo"),r1:col("referencia 1"),r2:col("referencia 2")};
  const c4=cuenta.replace(/\D/g,"").slice(-4)||"????",out=[];
  for(const r of filas.slice(i0+1)){const fo=fechaBanco(r[ci.fo]),imp=numBanco(r[ci.imp]);if(!fo||imp==null)continue;
    const fv=fechaBanco(r[ci.fv])||fo,sal=ci.sal>=0?numBanco(r[ci.sal]):null,concepto=String(r[ci.con]??"").replace(/\s+/g," ").trim();
    const id=hashTxt([c4,fo,fv,imp.toFixed(2),sal==null?"":sal.toFixed(2),concepto].join("|"));
    out.push({id,cuenta:c4,fo,fv,concepto,importe:imp,saldo:sal,ref1:String(r[ci.r1]??"").trim(),ref2:String(r[ci.r2]??"").trim()})}
  return {cuenta:c4,iban:cuenta,titular,movs:out};
}
/* ---------- Dos documentos por movimiento (07/11/2026) ----------
   just = justificante de pago (PDF del banco). doc = documento del gasto: factura, nómina, TC1 (recibo de liquidación de la
   Seguridad Social) u otro: {id,n,t,tipo}. Los gastos deducibles necesitan los dos (decisión de la titular: el justificante
   del banco siempre, aunque la asesoría aceptara el extracto). Antes de esta versión había un solo hueco (just): si se adjuntó
   a mano (sin jf, es decir, no vino de la subida en bloque) en una categoría que pide factura, se toma como la factura. */
const DOC_REQ={nominas:"nomina",ssemp:"tc",asesoria:"factura",sumin:"factura",telef:"factura",matofi:"factura",matdid:"factura",
  cuotas:"factura",alquiler:"factura",software:"factura",manten:"factura",formacion:"factura",otrosg:"factura"};
const DOC_TXT={factura:"Factura",nomina:"Nómina",tc:"TC1 (Seg. Social)",poliza:"Recibo o póliza",modelo:"Modelo",otro:"Documento"};
/* Los seguros no emiten factura (07/11/2026): basta el justificante; se puede adjuntar la póliza o el recibo del seguro.
   Lo que pide cada categoría se puede cambiar en Gastos («Qué documento pide cada categoría»): config/banco.docReq = {cat: tipo | ""}. */
const DOC_OPC={seguros:"poliza",impuestos:"modelo",ssaut:"otro"};
const docReq=m=>{const c=m.cat||"pend",o=GB.cfg&&GB.cfg.docReq;return o&&Object.prototype.hasOwnProperty.call(o,c)?o[c]||"":DOC_REQ[c]||""};
const docTipoDe=m=>docReq(m)||DOC_OPC[m.cat]||"otro";
const minus=t=>/^TC1/.test(t)?t.replace(/ \(.*/,""):String(t).charAt(0).toLowerCase()+String(t).slice(1);
const esCaja=m=>m&&m.cuenta==="caja";
const ctaTxt=c=>c==="caja"?"Caja":"…"+c;
/* Los apuntes de la caja no tienen justificante del banco: solo piden la factura (si la categoría la pide). */
const pideJust=m=>!esCaja(m)&&!["traspaso","noact","pend","comis","cambio","nodeduc"].includes(m.cat||"pend");
function docsMov(m){let j=m.just||null,d=m.doc||null,dEn=d?"doc":"";
  if(j&&!d&&!m.jf&&!j.tipo&&docReq(m)){d={...j,tipo:docReq(m)};dEn="just";j=null}
  return {j,d,dEn}}
/* La app cuenta desde una fecha (decisión de la titular, 07/11/2026: desde el 1/10/2026, cuando empezó a llevarlo todo en la
   app). Antes de esa fecha no se piden documentos ni entra en la rentabilidad. config/banco.inicio. Los movimientos anteriores
   se conservan (sirven, por ejemplo, para saber cada cuánto se paga un seguro). */
const docDesde=()=>(GB.cfg&&GB.cfg.inicio)||"2026-10-01";
const mesInicio=()=>docDesde().slice(0,7);
/* «No hay factura» (titular, 08/11/2026: el recibo del agua de Chiclana Natural es deducible y no tiene factura): en ese movimiento
   no se pide factura, y tampoco en los próximos del mismo proveedor (config/banco.sinFac = {<clave del concepto>: true}).
   Sigue contando como gasto; solo deja de avisar. */
const sinFac=m=>!!(m.sinFac||(GB.cfg&&GB.cfg.sinFac||{})[claveMov(m.concepto)]);
function faltas(m){if(String(m.fv||m.fo||"")<docDesde())return {j:false,d:false};const {j,d}=docsMov(m);return {j:pideJust(m)&&!j,d:!!docReq(m)&&!d&&!sinFac(m)}}
/* Le falta algún documento (justificante de pago o factura/nómina/TC1). Se usa en avisos, filtros e informes. */
const necesitaJust=m=>{const f=faltas(m);return f.j||f.d};
/* Los dos huecos de un movimiento en la lista de Gastos: justificante del banco y factura/nómina/TC1 */
function vDocsMov(m,t){const {j,d}=docsMov(m),f=faltas(m),k=`${esc(m.mes)}|${esc(m.id)}`,dt=DOC_TXT[d&&d.tipo||docTipoDe(m)]||"Documento";
  const verJ=j||pideJust(m)&&(t==="g"||t==="i"||m.cat==="deposito"),verD=d||t==="g"&&(pideJust(m)||esCaja(m)&&m.cat!=="comis");if(!verJ&&!verD)return "";
  const hueco=(slot,x,lb,falta,tit)=>x?`<span class="row" style="gap:4px;padding:0;border:0;min-height:0"><a href="#" class="btn small" data-blob="${esc(x.id)}" title="${esc(x.n||"")}">${slot==="j"?"🏦":"📄"} ${lb}</a>${slot==="d"&&x.sinNif?`<span class="badge b-pend" title="Esta factura no lleva tu NIF: no sirve para deducir. Pide al vendedor la factura con tus datos fiscales y súbela en su lugar">sin tu NIF</span>`:""}<button class="btn small" data-gb="quitarjust" data-k="${k}|${slot}" title="Quitar (por ejemplo, si se colocó en el movimiento equivocado)" aria-label="Quitar ${lb.toLowerCase()}">×</button>${(slot==="j"?verD&&!d:verJ&&!j)?`<button class="btn small" data-gb="swapdoc" data-k="${k}|${slot}" title="${slot==="j"?`No es el justificante del banco: es la ${dt.toLowerCase()}`:"No es la factura: es el justificante del banco"}" aria-label="Cambiar de hueco">⇄</button>`:""}</span>`
    :`<label class="btn small" style="cursor:pointer;${falta?"border-color:var(--warn);color:var(--warn)":""}" title="${tit}">${slot==="j"?"🏦":"📄"} ${falta?"Falta ":"+ "}${minus(lb)}<input type="file" data-gbjust="${k}|${slot}" accept="image/*,.pdf" hidden></label>`;
  const sf=verD&&!d&&docReq(m)&&String(m.fv||m.fo||"")>=docDesde();
  const dHueco=!verD?"":sf&&sinFac(m)?`<span class="row" style="gap:4px;padding:0;border:0;min-height:0"><span class="badge b-off" title="Gasto deducible sin factura: no se pide">Sin factura</span><button class="btn small" data-gb="sinfacno" data-k="${k}" title="Volver a pedir la factura" aria-label="Volver a pedir la factura">×</button></span>`
    :`<span class="row" style="gap:4px;padding:0;border:0;min-height:0">${hueco("d",d,dt,f.d,`${dt} del proveedor`)}${f.d?`<button class="btn small" data-gb="sinfac" data-k="${k}" title="Es deducible pero no tiene factura: deja de avisar en este y en los próximos de este proveedor">No hay</button>`:""}</span>`;
  return `<span style="display:flex;flex-direction:column;gap:3px;align-items:flex-start">${verJ?hueco("j",j,"Justificante",f.j,"Justificante de pago descargado del banco"):""}${dHueco}</span>`}
const faltaTxt=m=>{const f=faltas(m),dt=minus(DOC_TXT[docReq(m)]||"Factura");return f.j&&f.d?`faltan ${dt} y justificante`:f.d?`falta ${dt}`:f.j?"falta justificante":""};
const movsTodos=()=>{const l=[];for(const d of GB.docs)for(const [id,m] of Object.entries(d.movs||{}))if(!m.anul)l.push({...m,id,mes:d.id});return l};
/* Apuntes manuales de la caja → Gastos (08/11/2026). Cada apunte (desde la fecha en que cuenta la app) pasa a banco/<mes> como un
   movimiento de la cuenta «caja» (id "caja-<id del apunte>"), con la categoría de su concepto o la que se aprendió. Allí se adjunta
   la factura o se marca «No deducible». Si el apunte se anula en la caja, el movimiento se marca anul y deja de contar.
   Solo lo hace dirección (el mostrador no puede escribir en banco). */
let CJG_ON=false;
async function cajaAGastos(){
  if(CJG_ON||!gbVer()||!GB.ok||!GC.ok||!GB.cfg)return;CJG_ON=true;
  try{const an=anulados(),ya=new Map();for(const d of GB.docs)for(const [id,m] of Object.entries(d.movs||{}))if(m.caja)ya.set(id,{mes:d.id,m});
    const reglas=(GB.cfg&&GB.cfg.reglas)||{},porMes={},anular=[];
    for(const d of GC.docs){if(d.tipo!=="apunte"||!d.dia||d.dia<docDesde())continue;const id="caja-"+d.id,x=ya.get(id);
      if(an.has(d.id)){if(x&&!x.m.anul)anular.push(x.mes+"|"+id);continue}if(x)continue;
      const c=conceptos().find(k=>k.id===d.cc),concepto=("Caja · "+(d.concepto||"Apunte")).slice(0,140),cl=claveMov(concepto);
      const cat=(c&&c.cat)||reglas[cl]||(d.signo>0?"otrosing":"pend");
      (porMes[d.dia.slice(0,7)]=porMes[d.dia.slice(0,7)]||{})[id]={cuenta:"caja",fo:d.dia,fv:d.dia,concepto,importe:r2((+d.signo<0?-1:1)*(+d.importe||0)),saldo:null,ref1:"",ref2:"",
        cat,auto:cat!=="pend",caja:d.id,quien:d.quien||d.por||"",...(d.nota?{nota:String(d.nota).slice(0,140)}:{}),t:nowISO(),por:quienSoy()}}
    for(const [mes,movs] of Object.entries(porMes)){const ref=S.db.doc("banco/"+mes),s=await ref.get();
      if(s.exists){const up={};for(const [id,m] of Object.entries(movs))up["movs."+id]=m;await ref.update(up)}else await ref.set({mes,movs})}
    for(const k of anular){const [mes,id]=k.split("|");await S.db.doc("banco/"+mes).update({["movs."+id+".anul"]:true})}}
  catch(e){console.error("caja → gastos",e)}
  CJG_ON=false}
const gbVer=()=>S.role==="dir"&&!S.pv&&!S.ro&&!esMos();
function gbEscuchar(){
  if(GB.sub)return;const desde=sumaDias(todayISO(),-400).slice(0,7);
  GB.sub=S.db.collection("banco").where("mes",">=",desde).onSnapshot(s=>{GB.docs=s.docs.map(d=>({id:d.id,...d.data()}));GB.ok=true;GB.err="";cajaAGastos();if(S.view==="gastos"||S.view==="descuadres"||(S.view==="tarifas"&&GT.fac))gbRefrescar()},
    e=>{GB.ok=true;GB.err="No se pueden leer los movimientos del banco: faltan permisos en la base de datos (hay que publicar las reglas nuevas en Firebase).";if(S.view==="gastos")gbRefrescar()});
  S.db.doc("config/banco").onSnapshot(d=>{GB.cfg=d.exists?d.data():{};cajaAGastos();if(S.view==="gastos")gbRefrescar()},()=>{GB.cfg={}});
}
function gbRefrescar(){const ae=document.activeElement;if(ae&&(ae.id==="gb-q"||ae.id==="gb-enlq"||ae.id==="dq-q"||ae.id==="dq-aq"||ae.id==="dq-nota"))return;render()}
const mesesBanco=()=>[...new Set(GB.docs.map(d=>d.id))].sort().reverse();
const eurS=n=>(n>0?"+":n<0?"−":"")+eur(Math.abs(r2(n)));
/* Lo cobrado según Argos: recibos pagados en el mes (por fecha de pago), por forma de pago. El efectivo, también por días. */
const COBRO_FORMAS=[["efectivo","Contado (efectivo)"],["tarjeta","Tarjeta"],["bizum","Bizum"],["transferencia","Transferencia"],["becas","Becas"],["otros","Otras formas o sin indicar"]];
function cobradoMes(mes){const o={tarjeta:0,bizum:0,transferencia:0,efectivo:0,becas:0,otros:0,n:0,dias:{}};
  for(const [,a] of S.alumnos)for(const r of a.recibos||[]){if(!r||r.estado!=="pagado"||!String(r.pagado||"").startsWith(mes))continue;const f=String(r.forma||"").toLowerCase(),v=+r.importe||0;o.n++;
    if(/tarj|tpv|dat[aá]fono/.test(f))o.tarjeta+=v;else if(/bizum/.test(f))o.bizum+=v;else if(/transf/.test(f))o.transferencia+=v;
    else if(/efect|contado|metálico|metalico/.test(f)){o.efectivo+=v;const d=String(r.pagado).slice(0,10);o.dias[d]=(o.dias[d]||0)+v}else if(/beca/.test(f))o.becas+=v;else o.otros+=v}
  /* recibos pagados de Argos sin ficha en la app (alumnos antiguos o de baja, en «sin alumno»): también son ingresos (07/11/2026) */
  const vistos=new Set();
  for(const x of [...((S.recCfg&&S.recCfg.sinAlumno)||[]),...((S.sinFicha&&S.sinFicha.l)||[])]){const pg=String(x.fechaPago||"");if(x.estado&&x.estado!=="pagado"||!pg.startsWith(mes)||vistos.has(x.numero))continue;vistos.add(x.numero);const f=String(x.forma||"").toLowerCase(),v=+x.importe||0;o.n++;o.sinFicha=(o.sinFicha||0)+v;
    if(/tarj|tpv|dat[aá]fono/.test(f))o.tarjeta+=v;else if(/bizum/.test(f))o.bizum+=v;else if(/transf/.test(f))o.transferencia+=v;
    else if(/efect|contado|metálico|metalico/.test(f)){o.efectivo+=v;const d=pg.slice(0,10);o.dias[d]=(o.dias[d]||0)+v}else if(/beca/.test(f))o.becas+=v;else o.otros+=v}
  return o}
/* Ingresos de la actividad = todo lo cobrado a los alumnos según Argos (cualquier forma de pago) + otros ingresos del banco que no son
   cobros de alumnos. Lo que entra en el banco por TPV, Bizum, transferencia o cajero NO se suma: es el mismo dinero (sirve para cuadrar). */
/* Sin listado de Argos en ese mes (meses antiguos del extracto): lo cobrado se toma de lo que entró en el banco (07/11/2026),
   para que el resultado no salga como si no hubiera ingresos. */
function ingresosActividad(mes,movs){const co=cobradoMes(mes),bk=k=>r2((movs||[]).filter(m=>m.cat===k).reduce((s,m)=>s+m.importe,0)),banco=!co.n;
  const formas=banco?[["Tarjeta (TPV), según el banco",bk("tpv")],["Bizum, según el banco",bk("bizum")],["Transferencias, según el banco",bk("transf")],["Efectivo ingresado en el cajero",bk("deposito")]].filter(x=>x[1])
    :COBRO_FORMAS.map(([k,l])=>[l,r2(co[k])]).filter(x=>x[1]);
  const cobrado=r2(formas.reduce((s,x)=>s+x[1],0)),otrosBanco=r2((movs||[]).filter(m=>m.cat==="otrosing").reduce((s,m)=>s+m.importe,0));
  return {co,formas,cobrado,otrosBanco,total:r2(cobrado+otrosBanco),banco}}
/* Efectivo por semanas (lunes a domingo, dentro del mes): cobrado en contado según Argos frente a lo ingresado en el cajero
   (fecha operativa del banco). «Sin ingresar» es lo acumulado del mes que todavía no ha ido al banco. */
const lunesSem=f=>{const k=new Date(f+"T12:00:00").getDay();return sumaDias(f,-((k+6)%7))};
function semanasEfectivo(mes){const co=cobradoMes(mes),deps=movsTodos().filter(m=>m.cat==="deposito"&&String(m.fo||m.fv).startsWith(mes));
  const fin=isoDe(new Date(+mes.slice(0,4),+mes.slice(5,7),0)),sem=[];
  for(let d=mes+"-01";d<=fin;d=sumaDias(d,7-((new Date(d+"T12:00:00").getDay()+6)%7))){const h=sumaDias(lunesSem(d),6),hasta=h>fin?fin:h;
    const cob=r2(Object.entries(co.dias).filter(([k])=>k>=d&&k<=hasta).reduce((s,[,v])=>s+v,0));
    const ds=deps.filter(m=>{const f=m.fo||m.fv;return f>=d&&f<=hasta}),ing=r2(ds.reduce((s,m)=>s+m.importe,0));
    sem.push({desde:d,hasta,cob,ing,nIng:ds.length})}
  let ac=0;for(const w of sem){ac=r2(ac+w.cob-w.ing);w.acum=ac}
  return {sem,cob:r2(co.efectivo),ing:r2(deps.reduce((s,m)=>s+m.importe,0)),sinIng:ac}}
function vEfectivoSem(mes,E){E=E||semanasEfectivo(mes);
  return `<table class="ft inf" style="min-width:0;width:100%"><thead><tr><th>Semana</th><th style="text-align:right">Cobrado en contado</th><th style="text-align:right">Ingresado en el cajero</th><th style="text-align:right">Pendiente de ingresar (acumulado)</th></tr></thead><tbody>
    ${E.sem.map(w=>`<tr><td style="white-space:nowrap">${fmtFecha(w.desde).slice(0,5)}${w.hasta!==w.desde?` – ${fmtFecha(w.hasta).slice(0,5)}`:""}</td><td style="text-align:right">${eur(w.cob)}</td><td style="text-align:right">${w.ing?eur(w.ing):"—"}${w.nIng>1?` <span class="note">(${w.nIng})</span>`:""}</td><td style="text-align:right;${Math.abs(w.acum)>0.5?"color:var(--warn);font-weight:600":""}">${eurS(w.acum)}</td></tr>`).join("")}
    <tr style="font-weight:700"><td>Total del mes</td><td style="text-align:right">${eur(E.cob)}</td><td style="text-align:right">${eur(E.ing)}</td><td style="text-align:right">${eurS(E.sinIng)}</td></tr></tbody></table>`}
function vGastos(){
  if(!gbVer())return `<div class="empty">Solo dirección.</div>`;gbEscuchar();nmEscuchar();cajaEscuchar();if(typeof preEscuchar==="function")try{preEscuchar()}catch(_){}if(NM.ok&&GB.ok&&!NM.enl){NM.enl=true;setTimeout(nmEnlazarPendientes,1500)}imEscuchar();if(IM.ok&&GB.ok)setTimeout(imEnlazar,2500);if(GB.inf)return vInforme();if(GB.rent)return vRentabilidad();if(GB.prev)return vPrevision();
  const ms=mesesBanco();if(!GB.mes||!ms.includes(GB.mes)){const n=k=>Object.keys((GB.docs.find(d=>d.id===k)||{}).movs||{}).length;GB.mes=ms.find(k=>n(k)>=10)||ms[0]||""}const mes=GB.mes;
  const todos=movsTodos(),delMes=todos.filter(m=>m.mes===mes),cuentas=[...new Set(todos.map(m=>m.cuenta))].sort();
  const q=nzC(GB.q);
  const vis=delMes.filter(m=>(!GB.cuenta||m.cuenta===GB.cuenta)&&(!GB.cat||(GB.cat==="sinjust"?necesitaJust(m):m.cat===GB.cat))&&(!q||nzC(m.concepto+" "+(m.ordenante||"")+" "+(m.obs||"")+" "+(m.nota||"")).includes(q)))
    .sort((x,y)=>String(y.fv).localeCompare(String(x.fv))||String(y.fo).localeCompare(String(x.fo)));
  const base=delMes.filter(m=>!GB.cuenta||m.cuenta===GB.cuenta);
  const porCat={};for(const m of base)porCat[m.cat||"pend"]=(porCat[m.cat||"pend"]||0)+m.importe;
  const ing=r2(base.filter(m=>catTipo(m.cat)==="i").reduce((s,m)=>s+m.importe,0))+0,gas=r2(-base.filter(m=>catTipo(m.cat)==="g").reduce((s,m)=>s+m.importe,0))+0;
  const pend=base.filter(m=>(m.cat||"pend")==="pend"),sinJ=base.filter(necesitaJust);
  const tabla=t=>CATS.filter(([k,,tt])=>tt===t&&porCat[k]).map(([k,l])=>`<tr><td><a href="#" data-gb="vercat" data-v="${k}" style="color:inherit">${esc(l)}</a></td><td style="text-align:right;font-variant-numeric:tabular-nums">${eur(Math.abs(r2(t==="g"?-porCat[k]:porCat[k])))}</td></tr>`).join("");
  const IA=mes?ingresosActividad(mes,base):null,co=IA&&IA.co,b=k=>r2(base.filter(m=>m.cat===k).reduce((s,m)=>s+m.importe,0)),E=mes?semanasEfectivo(mes):null;
  const cuadre=co?[["tpv","Tarjeta (TPV)",b("tpv"),co.tarjeta],["bizum","Bizum",b("bizum"),co.bizum],["transf","Transferencia",b("transf"),co.transferencia]]:[];
  const imp=GB.imp?`<div class="panel" style="padding:12px 14px;margin-bottom:12px"><b>Extracto leído</b>
      ${GB.imp.err?`<p style="color:var(--bad)">${esc(GB.imp.err)}</p>`:GB.imp.res.map(x=>`<p style="margin:6px 0 0">Cuenta <b>…${esc(x.cuenta)}</b>${x.titular?` (${esc(x.titular)})`:""}: ${x.movs.length} movimientos del ${fmtFecha(x.desde)} al ${fmtFecha(x.hasta)} · <b>${x.nuevos} nuevos</b>${x.movs.length-x.nuevos?`, ${x.movs.length-x.nuevos} ya estaban`:""}${x.nuevos?` · ${x.pend} quedarán pendientes de clasificar`:""}</p>`).join("")}
      <div class="row" style="gap:8px;margin-top:8px">${GB.imp.err||!GB.imp.res.some(x=>x.nuevos)?"":`<button class="btn small primary" data-gb="impok">Guardar ${GB.imp.res.reduce((s,x)=>s+x.nuevos,0)} movimientos nuevos</button>`}<button class="btn small" data-gb="impno">${GB.imp.err||!GB.imp.res.some(x=>x.nuevos)?"Cerrar":"Cancelar"}</button></div></div>`:"";
  return `<div class="bar"><h2>Gastos y banco</h2><span class="legend">Extractos del Banco Sabadell</span></div>
  ${GB.err?`<div class="aviso pend" style="display:block">${esc(GB.err)}</div>`:""}
  <div class="bar" style="gap:8px;flex-wrap:wrap"><button class="btn" data-gb="prev" style="order:8;margin-left:auto">Previsión fin de mes</button><button class="btn" data-gb="rent" style="order:9">Rentabilidad</button><button class="btn" data-gb="inf" style="order:10">Informe del mes</button><label class="btn primary" style="cursor:pointer">Subir extractos del Sabadell (.xls)<input type="file" id="gb-file" accept=".xls,.xlsx" multiple hidden></label>
    <label class="btn" style="cursor:pointer" title="Desde Argos: el PDF con todas las facturas del mes y el listado de facturas. Se pueden subir los dos a la vez.">Subir facturas de venta de Argos (PDF)<input type="file" id="gb-ventas" accept=".pdf,application/pdf" multiple hidden></label>
    <label class="btn" style="cursor:pointer" title="Argos → Caja → exportar a Excel (un día o varios). Sirve para cuadrar lo cobrado con tarjeta con las liquidaciones del TPV.">Subir caja de Argos (.xls)<input type="file" id="gb-acaja" accept=".xls,.xlsx" multiple hidden></label>
    <label class="btn" style="cursor:pointer" title="Justificantes del banco, facturas de proveedores, nóminas, listado de costes (PDF o Excel) y TC1 de A3: todos juntos. Cada uno va a su movimiento.">Subir documentos (PDF)<input type="file" id="gb-justf" accept=".pdf,application/pdf,.xls,.xlsx" multiple hidden></label>
    <span class="note">Banca online → la cuenta → Movimientos → elige las fechas → Exportar a Excel. Puedes subir las dos cuentas a la vez; si un periodo ya estaba, solo se añaden los movimientos nuevos. En «Subir documentos» puedes arrastrar de una vez los justificantes del banco, las facturas y lo que manda A3 (nóminas, listado de costes y TC1): cada uno va a su movimiento.</span></div>
  ${imp}${vJustRes()}${vVentasRes()}${vCuadreTarjeta()}${(()=>{const sj=movsTodos().filter(necesitaJust),ms2=[...new Set(sj.map(m=>m.mes))].sort();return sj.length&&!GB.just?`<div class="aviso pend" style="display:block;margin-bottom:10px"><b>${sj.length} movimiento${sj.length===1?"":"s"} sin todos sus documentos</b> (justificante del banco y factura, nómina o TC1): ${ms2.map(k=>{const n=sj.filter(m=>m.mes===k).length;return `<a href="#" data-gb="versj" data-v="${k}">${mesTxt(k)} (${n})</a>`}).join(" · ")}. Súbelos todos juntos con «Subir documentos» o adjúntalos en cada movimiento.</div>`:""})()}
  ${!ms.length?`<div class="empty">${GB.ok?"Todavía no hay movimientos. Sube el primer extracto.":"Cargando…"}</div>`:`
  <div class="bar" style="gap:8px;flex-wrap:wrap;margin-top:6px">
    <label class="f" style="flex:0 1 170px">Mes<select id="gb-mes">${ms.map(m=>`<option value="${m}" ${m===mes?"selected":""}>${mesTxt(m)}</option>`).join("")}</select></label>
    <label class="f" style="flex:0 1 150px">Cuenta<select id="gb-cuenta"><option value="">Todas</option>${cuentas.map(c=>`<option value="${c}" ${c===GB.cuenta?"selected":""}>${ctaTxt(c)}</option>`).join("")}</select></label>
    <label class="f" style="flex:0 1 230px">Categoría<select id="gb-cat"><option value="">Todas</option><option value="pend" ${GB.cat==="pend"?"selected":""}>Pendientes de clasificar</option><option value="sinjust" ${GB.cat==="sinjust"?"selected":""}>Les falta algún documento</option>${CATS.filter(([k])=>k!=="pend").map(([k,l])=>`<option value="${k}" ${GB.cat===k?"selected":""}>${esc(l)}</option>`).join("")}</select></label>
    <label class="f" style="flex:1 1 180px">Buscar<input type="search" id="gb-q" value="${esc(GB.q)}" placeholder="Concepto"></label>
    <label class="f" style="flex:0 1 170px" title="Lo anterior a esta fecha no pide documentos ni cuenta en la rentabilidad">La app cuenta desde<input type="date" id="gb-docdesde" value="${esc(docDesde())}"></label></div>
  <details style="margin:2px 0 8px" ${GB.verReq?"open":""}><summary class="note">Qué documento pide cada categoría, además del justificante del banco</summary>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:4px 16px;margin-top:6px">${CATS.filter(([k,,t])=>t==="g"&&k!=="comis").map(([k,lb])=>{const v=docReq({cat:k});return `<label class="note" style="display:flex;justify-content:space-between;gap:8px;align-items:center">${esc(lb)}<select data-gbreq="${k}" style="max-width:150px;font-size:13px">${[["factura","Factura"],["nomina","Nómina"],["tc","TC1"],["poliza","Recibo o póliza"],["modelo","Modelo"],["","Solo el justificante"]].map(([o,t])=>`<option value="${o}" ${o===v?"selected":""}>${t}</option>`).join("")}</select></label>`}).join("")}</div></details>
  <div class="stats">
    <div class="stat" title="Todos los recibos que Argos da por pagados en el mes (por fecha de pago), con cualquier forma de pago"><b>${eur(IA?IA.cobrado:0)}</b><span>${IA&&IA.banco?"Cobrado a alumnos según el banco · no hay listado de Argos de este mes":"Cobrado a alumnos (Argos)"}</span></div>
    <div class="stat"><b>${eur(gas)}</b><span>Gastos de la actividad</span></div>
    ${(()=>{const res=r2((IA?IA.total:0)-gas);
      /* 14/11/2026: el mes en curso todavía no tiene sus nóminas (se pagan a primeros del mes siguiente): el resultado es provisional
         y se da también una estimación con el coste de las últimas nóminas subidas */
      const curso=mes>=todayISO().slice(0,7),noms=NM.docs.filter(d=>d.tipo==="nomina"&&+d.coste>0),tieneNom=noms.some(d=>d.mes===mes),um=noms.map(d=>d.mes).sort().pop();
      const yaN=r2(-base.filter(m=>m.cat==="nominas"||m.cat==="ssemp").reduce((s2,m)=>s2+m.importe,0)),est=curso&&!tieneNom&&um?Math.max(0,r2(noms.filter(d=>d.mes===um).reduce((s2,d)=>s2+(+d.coste||0),0)-yaN)):0,resE=r2(res-est);
      /* 15/11/2026 (titular): además, el resultado si se cobran todos los recibos del mes (pendientes y becas) */
      let pc=0,pb=0;try{for(const x of Object.values(ingresosProfes(mes)||{})){pc+=+x.pend||0;pb+=+x.beca||0}}catch(_){}pc=r2(pc);pb=r2(pb);const resT=r2((est?resE:res)+pc+pb);
      const todo=pc+pb>0?`<span style="display:block;margin-top:6px;padding-top:6px;border-top:1px solid var(--line)">Si se cobran todos los recibos del mes: <b style="display:inline;font-size:inherit;color:var(${resT>=0?"--ok":"--bad"})">${est?"≈ ":""}${eurS(resT)}</b> (faltan ${eur(pc)} por cobrar${pb?` y ${eur(pb)} de becas`:""})</span>`:"";
      return `<div class="stat" title="Cobrado a alumnos (Argos) + otros ingresos del banco − gastos. Lo que entra en el banco por TPV, Bizum, transferencias o cajero no se suma: es el mismo dinero cobrado.${curso?" Mes en curso: faltan sus nóminas y otros cargos que aún no han pasado.":""}">${est?`<b style="color:var(${resE>=0?"--ok":"--bad"})">≈ ${eurS(resE)}</b><span>Resultado <b style="display:inline;font-size:inherit">provisional</b> del mes en curso. Ya resta ${eur(est)} de nóminas que aún no se han pagado (calculadas como las de ${esc(mesTxt(um))})</span>${todo}`:`<b style="color:var(${res>=0?"--ok":"--bad"})">${eurS(res)}</b><span>Resultado de la actividad${curso?" · <b style=\"display:inline;font-size:inherit\">provisional</b> (mes en curso)":""}${pend.length?" · faltan pendientes":""}</span>${todo}`}</div>`})()}
    <div class="stat" title="Ingresos en efectivo en el cajero este mes, frente a lo cobrado en contado"><b>${eur(E?E.ing:0)}</b><span>Ingresado en el cajero · ${eur(E?E.cob:0)} cobrados en contado</span></div>
    <button class="stat" data-gb="vercat" data-v="pend"><b style="${pend.length?"color:var(--warn)":""}">${pend.length}</b><span>Pendientes de clasificar</span></button>
    <button class="stat" data-gb="vercat" data-v="sinjust"><b style="${sinJ.length?"color:var(--warn)":"color:var(--ok)"}">${sinJ.length}</b><span>Les falta la factura o el justificante</span></button>
  </div>
  ${vHorasExtraRes(mes)}
  <div class="split" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start">
    <div class="panel tbl"><table class="ft" style="min-width:0;width:100%"><thead><tr><th>Ingresos de la actividad</th><th style="text-align:right">${eur(IA?IA.total:0)}</th></tr></thead><tbody>
      <tr><td colspan="2" class="note" style="padding-top:6px">${IA&&IA.banco?"Cobrado a alumnos según el banco (no hay listado de Argos de este mes)":"Cobrado a alumnos según Argos (por fecha de pago)"}</td></tr>
      ${IA&&IA.formas.length?IA.formas.map(([l,v])=>`<tr><td style="padding-left:18px">${esc(l)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${eur(v)}</td></tr>`).join("")+`<tr style="font-weight:600"><td style="padding-left:18px">Total cobrado</td><td style="text-align:right;font-variant-numeric:tabular-nums">${eur(IA.cobrado)}</td></tr>`:`<tr><td colspan="2" class="note" style="padding-left:18px">Sin recibos pagados en este mes. Sube el listado de recibos de Argos.</td></tr>`}
      ${IA&&IA.otrosBanco?`<tr><td><a href="#" data-gb="vercat" data-v="otrosing" style="color:inherit">Otros ingresos del banco</a> <span class="note">(no son cobros de alumnos)</span></td><td style="text-align:right;font-variant-numeric:tabular-nums">${eur(IA.otrosBanco)}</td></tr>`:""}</tbody>
      <thead><tr><th>Gastos</th><th style="text-align:right">${eur(gas)}</th></tr></thead><tbody>${tabla("g")||`<tr><td colspan="2" class="note">—</td></tr>`}</tbody>
      <thead><tr><th>No cuentan (fuera de la actividad)</th><th></th></tr></thead><tbody>${CATS.filter(([k,,t])=>t==="x"&&k!=="deposito"&&porCat[k]).map(([k,l])=>`<tr><td><a href="#" data-gb="vercat" data-v="${k}" style="color:inherit">${esc(l)}</a></td><td style="text-align:right;font-variant-numeric:tabular-nums">${eurS(porCat[k])}</td></tr>`).join("")||`<tr><td colspan="2" class="note">—</td></tr>`}</tbody></table></div>
    <div>
    <div class="panel" style="padding:12px 14px;margin-bottom:12px"><b>Efectivo y cajero (${mesTxt(mes)})</b>
      <p class="note" style="margin:2px 0 6px">Lo cobrado en contado cada semana según Argos, frente a lo ingresado en el cajero (fecha del banco). Va por la fecha en que se hizo el ingreso, aunque el banco lo apunte días después. «Pendiente de ingresar» es el efectivo cobrado en el mes que todavía no ha ido al banco (en la caja, pagos en mano o retiradas); si sale en negativo, se ha ingresado efectivo cobrado antes de este mes.</p>
      ${vEfectivoSem(mes,E)}</div>
    <div class="panel" style="padding:12px 14px"><b>Cuadre banco – Argos (${mesTxt(mes)})</b>
      <p class="note" style="margin:2px 0 6px">Lo que ha entrado en el banco frente a lo que Argos da por cobrado con esa forma de pago. Sirve para comprobar, no se suma al resultado. Las fechas del banco van con unos días de retraso, así que una diferencia pequeña al principio o al final del mes es normal.</p>
      <table class="ft" style="min-width:0"><thead><tr><th></th><th style="text-align:right">Banco</th><th style="text-align:right">Argos</th><th style="text-align:right">Diferencia</th></tr></thead><tbody>
      ${cuadre.map(([k,l,bb,aa])=>`<tr><td><a href="#" data-gb="vercat" data-v="${k}" style="color:inherit">${l}</a></td><td style="text-align:right">${eur(bb)}</td><td style="text-align:right">${eur(r2(aa))}</td><td style="text-align:right;${Math.abs(bb-aa)>0.5?"color:var(--warn);font-weight:600":""}">${eurS(r2(bb-aa))}</td></tr>`).join("")}</tbody></table></div>
    </div>
  </div>
  ${vNominasMes(mes)}
  <div class="bar" style="margin-top:18px"><h2 style="font-size:19px">Movimientos</h2><span class="legend">${vis.length} de ${delMes.length}</span></div>
  <div class="panel">${vis.map(m=>{const t=catTipo(m.cat);return `<div class="row" style="flex-wrap:wrap;padding:6px 12px;align-items:flex-start">
    <span class="note" style="font-variant-numeric:tabular-nums;min-width:62px">${fmtFecha(m.fv)}<br>${esc(ctaTxt(m.cuenta))}</span>
    <span class="grow" style="white-space:normal;flex-basis:240px">${esc(m.concepto)}${m.ordenante||m.obs?`<br><span class="note">${esc(titulo(String(m.ordenante||"").toLowerCase()))}${m.obs?` · «${esc(m.obs)}»`:""}</span>`:""}${m.nota?`<br><span class="note">«${esc(m.nota)}»</span>`:""}${vTpvOps(m)}${vEnlaceCobro(m)}${m.auto&&m.cat!=="pend"?` <span class="note" title="Clasificado automáticamente">· auto</span>`:""}${(()=>{/* 15/11/2026: el alquiler con retención lo dice también aquí, con la base y la retención de ese pago */
      if(m.cat!=="alquiler"||m.importe>=0)return "";const x=alqCfg()[claveMov(m.concepto)];
      if(!x)return ` <button class="btn small" data-im="alqsi" data-c="${esc(claveMov(m.concepto))}" title="Es un alquiler con retención de IRPF (modelo 115)" style="margin-left:4px">¿Lleva retención?</button>`;
      const iva=+x.iva||0,ret=+x.ret||0,base=r2(-m.importe/(1+iva/100-ret/100));
      return `<br><span class="badge b-si" title="Pagado = base + IVA − retención. Sale en el Informe del mes → Retenciones del alquiler (modelo 115)">con retención</span> <span class="note">base ${eur(base)} · IVA ${eur(r2(base*iva/100))} (${iva} %) · retención ${eur(r2(base*ret/100))} (${ret} %), que se ingresa a Hacienda en el modelo 115</span>`})()}</span>
    <b style="font-variant-numeric:tabular-nums;min-width:90px;text-align:right;color:var(${m.importe>=0?"--ok":"--ink"})">${eurS(m.importe)}${necesitaJust(m)?`<br><span class="badge b-pend" style="font-weight:600">${faltaTxt(m)}</span>`:""}</b>
    <select data-gbcat="${esc(m.mes)}|${esc(m.id)}" aria-label="Categoría" style="max-width:220px;${(m.cat||"pend")==="pend"?"border-color:var(--warn)":""}">${CATS.map(([k,l])=>`<option value="${k}" ${k===(m.cat||"pend")?"selected":""}>${esc(l)}</option>`).join("")}</select>
    ${vDocsMov(m,t)}${esCaja(m)&&t==="g"&&!docsMov(m).d?`<button class="btn small" data-gb="nodeduc" data-k="${esc(m.mes)}|${esc(m.id)}" title="No tiene factura o no es deducible: queda apuntado pero no entra en la cuenta de resultados">No deducible</button>`:""}
    <button class="btn small" data-gb="nota" data-k="${esc(m.mes)}|${esc(m.id)}" title="Añadir una nota">Nota</button></div>`}).join("")||`<div class="empty">No hay movimientos con este filtro.</div>`}</div>`}`;
}
/* ============================================================================================
   Cuadre de tarjeta con la caja de Argos (09/11/2026, titular: «lo importante es detectar los descuadres»).
   Se sube el Excel de la caja de Argos (F. Cobro, F. Emisión, Centro, Origen, Número, Titular, Concepto, Forma pago, Importe),
   uno o varios días. Se guarda por día en banco/<AAAA-MM>.argosCaja.<AAAA-MM-DD> = {t, por, f:[{h,o,num,tit,c,fp,imp}]}
   (si se vuelve a subir un día, se sustituye). Cada día se compara lo cobrado con tarjeta en Argos con el banco:
   - si hay PDF de la liquidación (operaciones del TPV de ese día): una a una por importe → lo que está en el banco y no en
     Argos, y lo que está en Argos y no en el banco;
   - si no: el total de la liquidación (abonos TPV del día siguiente con cobros) frente a la suma de Argos de los días que cubre.
   Desde 2027 la Caja de la app sustituirá este Excel.
   ============================================================================================ */
const ACJ={res:null};
function argosCajaDias(){const o={};for(const d of GB.docs)for(const [k,v] of Object.entries(d.argosCaja||{}))if(v&&Array.isArray(v.f))o[k]=v;return o}
const esTarj=fp=>/tarj|tpv|dat[aá]fono/i.test(fp||"");
function acjFecha(v){if(typeof v==="number"&&window.XLSX){const d=window.XLSX.SSF.parse_date_code(v);if(d)return {f:`${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`,h:`${String(d.H||0).padStart(2,"0")}:${String(d.M||0).padStart(2,"0")}`}}
  const m=String(v||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);if(!m)return null;return {f:`${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`,h:m[4]?`${m[4].padStart(2,"0")}:${m[5]}`:""}}
function leerCajaArgos(filas){const i=filas.findIndex(r=>r.some(c=>/^f\.?\s*cobro$/i.test(String(c).trim())));if(i<0)return null;
  const H=filas[i].map(c=>nzC(String(c).normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim())),col=n=>H.findIndex(h=>h===n||h.startsWith(n));
  const c={fc:col("F. COBRO"),o:col("ORIGEN"),num:col("NUMERO"),tit:col("TITULAR"),con:col("CONCEPTO"),fp:col("FORMA PAGO"),imp:col("IMPORTE")};if(c.fc<0||c.imp<0)return null;
  const out=[];for(const r of filas.slice(i+1)){const f=acjFecha(r[c.fc]);const imp=typeof r[c.imp]==="number"?r[c.imp]:gtNum(String(r[c.imp]||""));if(!f||imp==null||isNaN(imp))continue;
    out.push({dia:f.f,h:f.h,o:String(r[c.o]||"").trim(),num:String(r[c.num]||"").trim(),tit:String(r[c.tit]||"").replace(/\s+/g," ").trim(),c:String(r[c.con]||"").replace(/\s+/g," ").trim().slice(0,80),fp:String(r[c.fp]||"").trim(),imp:r2(imp)})}
  return out}
async function subirCajaArgos(files){try{await cargarJs(XLSXJS)}catch(_){toast("No se ha podido cargar el lector de Excel");return}
  const dias={};let malos=0;
  for(const f of files){try{const wb=window.XLSX.read(await f.arrayBuffer(),{type:"array"});const filas=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:""});
      const l=leerCajaArgos(filas);if(!l||!l.length){malos++;continue}for(const x of l)(dias[x.dia]=dias[x.dia]||[]).push(x)}catch(e){console.error(e);malos++}}
  const ks=Object.keys(dias).sort();if(!ks.length){toast(malos?"No reconozco el archivo: tiene que ser el Excel de la caja de Argos":"El archivo no tiene cobros");return}
  try{for(const k of ks){const mes=k.slice(0,7),ref=S.db.doc("banco/"+mes),v={t:nowISO(),por:quienSoy(),f:dias[k].map(({dia,...x})=>x)};
      const sn=await ref.get();if(sn.exists)await ref.update({["argosCaja."+k]:v});else await ref.set({mes,argosCaja:{[k]:v}})}
    let nHX=0;try{nHX=await hxPagadosCajaArgos(dias)}catch(e){console.error(e)}
    ACJ.ver=true;toast(`Caja de Argos guardada: ${ks.length} día${ks.length===1?"":"s"} (${ks.map(k=>fmtFecha(k)).join(", ")})${malos?` · ${malos} archivo${malos===1?"":"s"} sin leer`:""}${nHX?` · ${nHX} recibo${nHX===1?"":"s"} de clases sueltas pagado${nHX===1?"":"s"}`:""}`);render()}
  catch(e){console.error(e);toast("No se ha podido guardar la caja de Argos")}}
/* 22/11/2026 (titular): recibos de clases sueltas de la app (HX). Recepción hace el mismo recibo a mano en Argos (otro número, misma
   fecha, concepto «clase suelta»); cuando el cobro aparece en la caja de Argos, el de la app queda pagado. Se empareja por el número
   de Argos (si ya se juntó con el listado) o por titular + importe + concepto «suelta», con el cobro el día del recibo o hasta 31 días después. */
async function hxPagadosCajaArgos(dias){if(S.role!=="dir"||esMos()||typeof SUE_FIJA_DESDE==="undefined")return 0;let n=0;const usados=new Set();
  const filas=Object.values(dias).flat().sort((x,y)=>(x.dia+x.h).localeCompare(y.dia+y.h));
  for(const [id,a] of S.alumnos){if(!a||!a.sueltas)continue;let recibos=null;
    const pend=(a.recibos||[]).filter(r=>r&&r.serie==="HX"&&r.origen==="app"&&r.estado!=="pagado"&&r.estado!=="anulado"&&String(r.emitido||"")>=SUE_FIJA_DESDE)
      .sort((x,y)=>String(x.emitido).localeCompare(String(y.emitido)));
    for(const r of pend){const em=String(r.emitido||"").slice(0,10),k=filas.findIndex((x,i)=>!usados.has(i)&&Math.abs(x.imp-(+r.importe||0))<0.005&&x.dia>=em&&x.dia<=sumaDias(em,31)
        &&((r.argos&&x.num===r.argos)||(/suelt/i.test(x.c)&&(typeof idDeTitular==="function"&&idDeTitular(x.tit)===id))));
      if(k<0)continue;usados.add(k);const x=filas[k];
      recibos=(recibos||a.recibos).map(y=>y===r||(y&&y.id===r.id)?{...y,estado:"pagado",pagado:x.dia,forma:x.fp||"",cajaArgos:{dia:x.dia,h:x.h||"",num:x.num||""}}:y)}
    if(recibos&&await save(id,{recibos})){n+=recibos.filter(y=>y&&y.cajaArgos&&!(a.recibos||[]).some(z=>z&&z.id===y.id&&z.estado==="pagado")).length;a.recibos=recibos}}
  return n}
/* Empareja por importe dos listas (multiconjunto): devuelve lo que sobra en cada una */
function emparejarImp(a,b){const bb=b.map(x=>({...x,_u:false})),sa=[];
  for(const x of a){const j=bb.findIndex(y=>!y._u&&Math.abs(y.imp-x.imp)<0.005);if(j>=0)bb[j]._u=true;else sa.push(x)}
  return {soloA:sa,soloB:bb.filter(y=>!y._u)}}
/* Un pago con tarjeta puede cubrir varios cobros de Argos (04/11: 320 € = 8 facturas de 40 €; una familia, varias facturas).
   Después del 1 a 1: a cada operación sobrante se le buscan cobros sobrantes que sumen lo mismo, primero los del mismo titular,
   después cualquier combinación (los más cercanos en hora primero). Devuelve también los grupos encontrados. */
function emparejarTpv(op,ar){const e=emparejarImp(op,ar);let ops=[...e.soloA].sort((x,y)=>y.imp-x.imp),rows=e.soloB.map((x,i)=>({...x,_i:i}));const grupos=[],quedan=[];
  const cts=x=>Math.round(x*100),quitar=l=>{const ids=new Set(l.map(x=>x._i));rows=rows.filter(x=>!ids.has(x._i))};
  /* 1.º los que cuadran con todos los cobros de un mismo titular */
  const resto=[];for(const o of ops){const obj=cts(o.imp),porTit={};for(const r of rows)(porTit[r.tit]=porTit[r.tit]||[]).push(r);
    const l=Object.values(porTit).find(l=>l.length>1&&cts(l.reduce((s,x)=>s+x.imp,0))===obj);if(l){grupos.push({o,rows:l});quitar(l)}else resto.push(o)}
  /* 2.º cualquier combinación de lo que queda */
  for(const o of resto){const obj=cts(o.imp);let sel=null;
    if(rows.length<=24){const R=[...rows].sort((x,y)=>String(x.h).localeCompare(String(y.h))),dp=new Map([[0,[]]]);
      for(const r of R){const c=cts(r.imp);for(const [k,v] of [...dp]){const n=k+c;if(n<=obj&&!dp.has(n))dp.set(n,[...v,r])}if(dp.has(obj))break}
      if(dp.has(obj)&&dp.get(obj).length)sel=dp.get(obj)}
    if(sel){grupos.push({o,rows:sel});quitar(sel)}else quedan.push(o)}
  return {soloA:quedan,soloB:rows,grupos}}
function cuadreTarjetaDias(){const AC=argosCajaDias(),dias=Object.keys(AC).sort(),tpvs=movsTodos().filter(m=>m.cat==="tpv"&&m.importe>0&&m.fv);
  const ops={};for(const m of tpvs)for(const o of (m.tpv||[]))if(o&&o.f)(ops[o.f]=ops[o.f]||[]).push({imp:+o.imp||0,tarj:o.tarj||"",fv:m.fv});
  const fvs=[...new Set(tpvs.map(m=>m.fv))].sort();
  return dias.map(d=>{const ar=AC[d].f.filter(x=>esTarj(x.fp)).map(x=>({...x,dia:d})),tA=r2(ar.reduce((s,x)=>s+x.imp,0));
    if(ops[d]){const op=ops[d],tB=r2(op.reduce((s,x)=>s+x.imp,0)),e=emparejarTpv(op,ar);
      /* pistas: cobros de ese día apuntados con otra forma de pago (contado, Bizum…) que suman lo mismo */
      const otros=AC[d].f.filter(x=>!esTarj(x.fp)),pista=imp=>{const c=Math.round(imp*100),l=otros.filter(x=>Math.round(x.imp*100)===c).map(x=>[x]);
        const pt={};for(const x of otros)(pt[x.tit]=pt[x.tit]||[]).push(x);for(const g of Object.values(pt))if(g.length>1&&Math.round(g.reduce((s,x)=>s+x.imp,0)*100)===c)l.push(g);
        const ap={};for(const x of otros){const k=String(x.tit).split(" ").slice(-2).join(" ");(ap[k]=ap[k]||[]).push(x)}
        for(const g of Object.values(ap))if(g.length>1&&new Set(g.map(x=>x.tit)).size>1&&Math.round(g.reduce((s,x)=>s+x.imp,0)*100)===c)l.push(g);
        return l.length<=2?l:[]};
      for(const o of e.soloA)o.pistas=pista(o.imp);
      return {d,modo:"ops",tA,tB,nA:ar.length,nB:op.length,soloBanco:e.soloA,soloArgos:e.soloB,grupos:e.grupos,ok:!e.soloA.length&&!e.soloB.length}}
    /* sin PDF: la liquidación es el primer día con abonos TPV después de d; cubre desde la anterior hasta el día antes */
    const fv=fvs.find(f=>f>d);if(!fv)return {d,modo:"espera",tA,nA:ar.length,ok:null};
    const ant=fvs.filter(f=>f<fv).pop(),d0=ant||sumaDias(fv,-1),d1=sumaDias(fv,-1),cub=[];for(let x=d0;x<=d1;x=sumaDias(x,1))cub.push(x);
    const falta=cub.filter(x=>!AC[x]&&diaDe(x)!=="Domingo"),tB=r2(tpvs.filter(m=>m.fv===fv).reduce((s,m)=>s+m.importe,0));
    const tAw=r2(cub.reduce((s,x)=>s+(AC[x]?AC[x].f.filter(y=>esTarj(y.fp)).reduce((t,y)=>t+y.imp,0):0),0));
    return {d,modo:"total",tA,nA:ar.length,fv,cub,falta,tB,tAw,ok:falta.length?null:Math.abs(tB-tAw)<0.01}})}
/* 14/11/2026 (titular: «no logro localizarlos»): para cada cobro con tarjeta que está en el banco y no en la caja de Argos de ese
   día, se buscan más pistas: (1) apuntado en Argos otro día cercano (±3) y que allí sobra; (2) apuntado otro día con otra forma de
   pago; (3) un recibo que Argos da como pagado con tarjeta por ese importe (±1 día); (4) la misma tarjeta ya pagó antes a un alumno;
   (5) recibos pendientes por ese importe, o de una misma familia (mismos apellidos) que suman ese importe. */
/* 18/11/2026 (titular): en las pistas y coincidencias solo cuentan los recibos pendientes del último trimestre
   (emitidos en los 3 meses anteriores al cobro) y desde que la app lleva las cuentas (ATR_DESDE). */
function pendReciente(r,d){const e=String((r&&r.emitido)||"");if(!r||r.estado==="pagado"||r.estado==="anulado"||!e||e>d)return false;
  const m0=String(d).slice(0,7)+"-01",m1=sumaDias(m0,-1).slice(0,7)+"-01",m2=sumaDias(m1,-1).slice(0,7)+"-01",desde=(typeof ATR_DESDE==="function"?ATR_DESDE():"2026-10")+"-01";
  return e>=(m2>desde?m2:desde)}
function pistasTarjeta(o,d,L,AC){const out=[],c=Math.round(o.imp*100),cerca=x=>Math.abs(difDias(x,d))<=3&&x!==d,nom=t=>titulo(String(t||"").toLowerCase());
  for(const y of L){if(!cerca(y.d)||y.modo!=="ops")continue;for(const r of y.soloArgos||[])if(Math.round(r.imp*100)===c)out.push(`apuntado en Argos el ${fmtFecha(y.d)} con tarjeta: ${nom(r.tit)}${r.num?" ("+r.num+")":""} (ese día sobra en Argos)`)}
  /* 18/11/2026 (titular): si un cobro con tarjeta se hubiera apuntado en Argos como efectivo, ese día faltaría ese dinero en el
     arqueo. Solo se propone «con contado» si ese día hay un descuadre de efectivo (falta) de al menos ese importe, apuntado a mano
     o en la caja de Argos; si el efectivo cuadró, esa pista no puede ser. */
  const faltaEf=x=>{let t=0;for(const d of (typeof GB!=="undefined"&&GB.docs)||[])for(const v of Object.values(d.desc||{})){const m=v&&v.manual;if(m&&m.fecha===x&&/efect|contado/i.test(m.tipo||"Efectivo")&&(+m.imp||0)<0)t+=-(+m.imp)}
    for(const y of (AC[x]&&AC[x].f)||[])if(/DESCUADRE/i.test(String(y.c||"")+" "+String(y.o||""))&&(+y.imp||0)<0)t+=-(+y.imp);return Math.round(t*100)};
  const esEf=fp=>/contado|efectivo|met[aá]lico/i.test(String(fp||""));
  for(const [x,v] of Object.entries(AC)){if(!cerca(x))continue;for(const r of v.f||[])if(!esTarj(r.fp)&&Math.round(r.imp*100)===c&&!(esEf(r.fp)&&faltaEf(x)<c))out.push(`el ${fmtFecha(x)} en Argos con ${String(r.fp||"otra forma").toLowerCase()}: ${nom(r.tit)} · ${eur(r.imp)}${r.num?" · nº "+r.num:""}${r.c?" · «"+String(r.c).slice(0,50)+"»":""}${r.h?" · "+r.h:""}`)}
  const e=pdTry(()=>enlaceTpv({f:d,imp:o.imp,tarj:o.tarj}),[]);
  /* 18/11/2026 (titular): un recibo que ya está en la caja de Argos con tarjeta otro día (p. ej. A26/001467 de Julia Marín,
     cobrado el 04/11 y que ese día cuadra) ya está contado allí: no es pista para este cobro. */
  const enCaja=new Set();for(const v of Object.values(AC))for(const r of (v&&v.f)||[])if(esTarj(r.fp)&&r.num)enCaja.add(String(r.num).trim());
  /* En la caja de Argos el «Número» puede ser el de la factura y no el del recibo: se busca también por el día en que se
     cobró el recibo, el importe y el titular (al menos dos palabras del nombre en común). */
  const pal=t=>new Set(String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().split(/[^a-zñ]+/).filter(w=>w.length>2));
  const mismoTit=(t,n)=>{const A=pal(t),B=pal(n);let k=0;for(const w of A)if(B.has(w))k++;return k>=2};
  const yaEnCaja=x=>{const a=S.alumnos.get(x.id);if(!a)return false;const nums=String(x.txt||"").split(/\s*\+\s*/).map(n=>n.trim()).filter(Boolean);if(!nums.length)return false;
    return nums.every(n=>{if(enCaja.has(n))return true;const r=(a.recibos||[]).find(r=>r&&r.numero===n);if(!r)return false;const v=AC[String(r.pagado||"").slice(0,10)];
      return !!v&&(v.f||[]).some(y=>esTarj(y.fp)&&Math.round((+y.imp||0)*100)===Math.round((+r.importe||0)*100)&&mismoTit(y.tit,a.nombre))})};
  for(const x of e.filter(x=>!x.pend&&!yaEnCaja(x)))out.push(`recibo pagado con tarjeta en Argos: ${nom(x.n)} (${x.txt})`);
  const tk=pdTry(()=>tarjetasConocidas(),{}),al=o.tarj&&tk[o.tarj]?S.alumnos.get(tk[o.tarj]):null;
  if(al){const pe=(al.recibos||[]).filter(r=>pendReciente(r,d));out.push(`la tarjeta …${o.tarj} ya pagó antes a ${nom(al.nombre)}${pe.length?` · tiene pendiente ${pe.map(r=>`${r.numero||""} ${eur(+r.importe||0)}`).join(", ")}`:""}`)}
  if(!out.length){const pend=e.filter(x=>x.pend);
    if(pend.length&&pend.length<=5)out.push(`recibos pendientes de ${eur(o.imp)}: ${pend.map(x=>`${nom(x.n)} (${String(x.txt).replace(" · pendiente en Argos","")})`).join(", ")}`);
    else if(pend.length)out.push(`${pend.length} alumnos tienen un recibo pendiente de ${eur(o.imp)}: no se puede saber cuál solo por el importe`);
    const fam={};for(const [id,a] of S.alumnos){if(a.baja)continue;const k=String(a.nombre||"").trim().split(/\s+/).slice(-2).join(" ");if(!k.includes(" "))continue;
      for(const r of a.recibos||[])if(pendReciente(r,d))(fam[k]=fam[k]||[]).push({a,r})}
    for(const [k,l] of Object.entries(fam)){if(new Set(l.map(x=>x.a)).size<2&&l.length<2)continue;
      const R=l.slice(0,12),dp=new Map([[0,[]]]);for(const x of R){const v=Math.round((+x.r.importe||0)*100);for(const [s,q] of [...dp]){const n=s+v;if(n<=c&&!dp.has(n))dp.set(n,[...q,x])}}
      const sel=dp.get(c);if(sel&&sel.length>1)out.push(`familia ${titulo(k.toLowerCase())}: ${sel.map(x=>`${nom(x.a.nombre).split(" ")[0]} ${x.r.numero||""} ${eur(+x.r.importe||0)}`).join(" + ")} (pendientes)`)}}
  return [...new Set(out)].slice(0,6)}
function vCuadreTarjeta(){const L=cuadreTarjetaDias();if(!L.length)return "";const AC=argosCajaDias();
  const mal=L.filter(x=>x.ok===false),txt=x=>x.modo==="espera"?`<span class="note">${eur(x.tA)} con tarjeta en Argos · aún no ha llegado la liquidación</span>`
    :x.modo==="ops"?(x.ok?`<span class="badge b-si">Cuadra</span> <span class="note">${x.nA} cobros · ${eur(x.tA)}${x.grupos.length?` · ${x.grupos.map(g=>`un pago de ${eur(g.o.imp)} = ${g.rows.length} cobros (${[...new Set(g.rows.map(r=>titulo(r.tit)))].map(esc).join(", ")})`).join(" · ")}`:""}</span>`:`<span class="badge b-no">Descuadre</span> <span class="note">Argos ${eur(x.tA)} (${x.nA}) · banco ${eur(x.tB)} (${x.nB})</span>
        ${x.soloBanco.map(o=>`<div class="note" style="margin-left:12px;color:var(--bad)">En el banco y no en Argos: <b>${eur(o.imp)}</b>${o.tarj?` · tarjeta …${esc(o.tarj)}`:""}${o.pistas&&o.pistas.length?` · ¿apuntado en Argos con otra forma de pago? ${o.pistas.map(g=>g.map(r=>`${esc(titulo(r.tit))} (${esc(r.fp)}${r.h?" "+esc(r.h):""}${g.length>1?", "+eur(r.imp):""})`).join(" + ")).join(" o ")}`:x.soloArgos.length?"":" (no está en Argos: ¿cobro sin apuntar?)"}${(l=>l.length?`<ul style="margin:2px 0 4px 28px;padding:0;color:var(--ink)">${l.map(t=>`<li>Pista: ${esc(t)}</li>`).join("")}</ul>`:"")(o.pistas&&o.pistas.length?[]:pistasTarjeta(o,x.d,L,AC))}</div>`).join("")}
        ${x.soloArgos.map(o=>`<div class="note" style="margin-left:12px;color:var(--bad)">En Argos con tarjeta y no en el banco: <b>${eur(o.imp)}</b> · ${esc(titulo(o.tit))}${o.num?` (${esc(o.num)})`:""}${o.h?` · ${esc(o.h)}`:""}</div>`).join("")}`)
    :(x.ok===null?`<span class="note">${eur(x.tA)} con tarjeta · liquidación del ${fmtFecha(x.fv)}: falta subir la caja de ${x.falta.map(fmtFecha).join(", ")}</span>`
      :x.ok?`<span class="badge b-si">Cuadra</span> <span class="note">${eur(x.tA)} · liquidación del ${fmtFecha(x.fv)}${x.cub.length>1?` (${x.cub.map(fmtFecha).join(" + ")})`:""}</span>`
      :`<span class="badge b-no">Descuadre</span> <span class="note">liquidación del ${fmtFecha(x.fv)}: banco ${eur(x.tB)} · Argos ${eur(x.tAw)}${x.cub.length>1?` (${x.cub.map(fmtFecha).join(" + ")})`:""} · diferencia <b>${eur(r2(x.tB-x.tAw))}</b>. Sube el PDF de esa liquidación para ver qué operación es.</span>`);
  return `<details class="aviso ${mal.length?"pend":"info"}" style="display:block;margin-bottom:10px" ${ACJ.ver||mal.length?"open":""} data-gcdet="acj"><summary><b>Cuadre de tarjeta con la caja de Argos:</b> ${mal.length?`<span style="color:var(--bad)">${mal.length} día${mal.length===1?"":"s"} con descuadre</span>`:"todo cuadra"} · ${L.length} día${L.length===1?"":"s"} subido${L.length===1?"":"s"}</summary>
    ${[...L].reverse().slice(0,ACJ.todos?400:14).map(x=>`<div class="row" style="flex-wrap:wrap;gap:6px;align-items:flex-start"><span style="min-width:92px"><b>${diaDe(x.d).slice(0,3)} ${fmtFecha(x.d)}</b></span><span class="grow" style="white-space:normal">${txt(x)}</span></div>`).join("")}
    ${L.length>14&&!ACJ.todos?`<a href="#" data-gb="acjtodos" class="note">Ver todos los días</a>`:""}</details>`}
async function gbLeerArchivos(files){
  try{await cargarJs(XLSXJS)}catch(_){GB.imp={err:"No se ha podido cargar el lector de Excel. Comprueba la conexión y vuelve a intentarlo."};render();return}
  const ya=new Set(movsTodos().map(m=>m.id)),reglas=(GB.cfg&&GB.cfg.reglas)||{},res=[];
  try{for(const f of files){const wb=window.XLSX.read(await f.arrayBuffer(),{type:"array"});const filas=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:""});
      const x=leerExtracto(filas);const fs=x.movs.map(m=>m.fv).sort();const nuevos=x.movs.filter(m=>!ya.has(m.id));
      for(const m of nuevos){const c=catAuto(m.concepto,reglas,m.importe);m.cat=c.cat;m.auto=c.cat!=="pend"}
      res.push({...x,desde:fs[0],hasta:fs[fs.length-1],nuevos:nuevos.length,nuevosL:nuevos,pend:nuevos.filter(m=>m.cat==="pend").length})}
    GB.imp={res}}catch(e){GB.imp={err:e.message||"No se ha podido leer el archivo."}}
  render();
}
async function gbGuardarImp(){
  const porMes={};for(const x of GB.imp.res)for(const m of x.nuevosL){const mes=m.fv.slice(0,7);(porMes[mes]=porMes[mes]||{})[m.id]={cuenta:m.cuenta,fo:m.fo,fv:m.fv,concepto:m.concepto,importe:m.importe,saldo:m.saldo,ref1:m.ref1,ref2:m.ref2,cat:m.cat,auto:m.auto,t:nowISO(),por:quienSoy()}}
  setStatus("Guardando…");let n=0;
  try{for(const [mes,movs] of Object.entries(porMes)){const d=S.db.doc("banco/"+mes),s=await d.get();
      if(s.exists){const up={};for(const [id,m] of Object.entries(movs))up["movs."+id]=m;await d.update(up)}else await d.set({mes,movs});n+=Object.keys(movs).length}
    setStatus("Guardado");GB.imp=null;GB.mes=Object.entries(porMes).sort((a,b)=>Object.keys(b[1]).length-Object.keys(a[1]).length)[0]?.[0]||GB.mes;render();toast(`${n} movimientos guardados`);nmEscuchar();setTimeout(nmEnlazarPendientes,800)}
  catch(e){console.error(e);setStatus("Sin guardar");toast("No se han podido guardar los movimientos: faltan permisos en la base de datos.")}
}
async function gbCambiarCat(mes,id,cat){
  const d=GB.docs.find(x=>x.id===mes),m=d&&d.movs&&d.movs[id];if(!m)return;const clave=claveMov(m.concepto);
  try{await S.db.doc("banco/"+mes).update({["movs."+id+".cat"]:cat,["movs."+id+".auto"]:false,["movs."+id+".catPor"]:{t:nowISO(),por:quienSoy()}})}
  catch(e){console.error(e);toast("No se ha podido guardar la categoría.");render();return}
  m.cat=cat;m.auto=false;
  /* aprende: los próximos con el mismo concepto se clasifican solos; y los iguales que estén pendientes, ya */
  if(clave&&cat!=="pend"&&!esCaja(m)){const reglas={...((GB.cfg&&GB.cfg.reglas)||{}),[clave]:cat};try{await S.db.doc("config/banco").set({...(GB.cfg||{}),reglas});GB.cfg={...(GB.cfg||{}),reglas}}catch(_){}
    const otros=movsTodos().filter(x=>x.id!==id&&(x.cat||"pend")==="pend"&&claveMov(x.concepto)===clave);
    for(const x of otros){try{await S.db.doc("banco/"+x.mes).update({["movs."+x.id+".cat"]:cat,["movs."+x.id+".auto"]:true});const dd=GB.docs.find(y=>y.id===x.mes);if(dd)dd.movs[x.id].cat=cat}catch(_){}}
    toast(otros.length?`Guardado. También ${otros.length} movimiento${otros.length===1?"":"s"} igual${otros.length===1?"":"es"}; los próximos se clasificarán solos.`:`Guardado. Los próximos «${clave.slice(0,30)}» se clasificarán solos.`)}
  else if(esCaja(m))toast(cat==="nodeduc"?"Marcado como no deducible: no entra en la cuenta de resultados":"Guardado");
  render();
}
document.addEventListener("change",async e=>{const t=e.target;if(!t||!gbVer())return;
  if(t.id==="gb-file"){const fs=[...t.files];t.value="";if(fs.length)await gbLeerArchivos(fs)}
  else if(t.id==="gb-acaja"){const fs=[...t.files];t.value="";if(fs.length)await subirCajaArgos(fs)}
  else if(t.id==="gb-justf"){const fs=[...t.files];t.value="";if(fs.length)await gbSubirJustificantes(fs)}
  else if(t.id==="gb-ventas"){const fs=[...t.files];t.value="";if(fs.length)await subirVentas(fs)}
  else if(t.dataset&&t.dataset.gbreq){try{const cfg={...(GB.cfg||{}),docReq:{...((GB.cfg&&GB.cfg.docReq)||{}),[t.dataset.gbreq]:t.value}};await S.db.doc("config/banco").set(cfg);GB.cfg=cfg;GB.verReq=true;render();toast("Guardado")}catch(_){toast("No se ha podido guardar.")}}
  else if(t.id==="gb-docdesde"){if(!/^\d{4}-\d{2}-\d{2}$/.test(t.value))return;try{await S.db.doc("config/banco").set({...(GB.cfg||{}),inicio:t.value});GB.cfg={...(GB.cfg||{}),inicio:t.value};render();toast("Guardado")}catch(_){toast("No se ha podido guardar.")}}
  else if(t.id==="gb-mes"){GB.mes=t.value;render()}else if(t.id==="gb-cuenta"){GB.cuenta=t.value;render()}else if(t.id==="gb-cat"){GB.cat=t.value;render()}
  else if(t.dataset&&t.dataset.gbcat){const [mes,id]=t.dataset.gbcat.split("|");await gbCambiarCat(mes,id,t.value)}
  else if(t.dataset&&t.dataset.gbjust){const [mes,id,slot]=t.dataset.gbjust.split("|"),f=t.files&&t.files[0];t.value="";if(!f)return;if(f.size>8e6){toast("El archivo es demasiado grande (máximo 8 MB)");return}
    const d0=GB.docs.find(x=>x.id===mes),m=d0&&d0.movs[id];if(!m)return;
    setStatus("Subiendo…");try{const as=await window.claude.use("assets");
      if(slot==="d"){const tipo=docTipoDe(m),r=await as.upload(f,{clase:"gasto"}),o={id:r.id,n:f.name.slice(0,80),t:nowISO(),tipo};
        await S.db.doc("banco/"+mes).update({["movs."+id+".doc"]:o});m.doc=o;setStatus("Guardado");toast("Documento adjuntado")}
      else{const r=await as.upload(f,{clase:"banco"}),o={id:r.id,n:f.name.slice(0,80),t:nowISO(),tipo:"just"};
        /* si el hueco del justificante tenía la factura de antes (versión de un solo hueco), se pasa a su sitio */
        const {dEn}=docsMov(m),up={["movs."+id+".just"]:o};if(dEn==="just"){up["movs."+id+".doc"]={...m.just,tipo:docReq(m)};m.doc=up["movs."+id+".doc"]}
        await S.db.doc("banco/"+mes).update(up);m.just=o;setStatus("Guardado");toast("Justificante adjuntado")}
      render()}
    catch(err){console.error(err);setStatus("Sin guardar");toast("No se ha podido subir el archivo.")}}});
document.addEventListener("input",e=>{const t=e.target;if(t&&t.id==="gb-enlq"&&gbVer()){GB.enlQ=t.value;const [mes,id]=(GB.enl||"").split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs&&d.movs[id],r=$("#gb-enlres");if(m&&r)r.innerHTML=vElegirRes({...m,id,mes});return}
  if(t&&t.id==="gb-q"&&gbVer()){GB.q=t.value;clearTimeout(GB.qt);GB.qt=setTimeout(()=>{render();const i=$("#gb-q");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},250)}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-gb]");if(!t||!gbVer())return;e.preventDefault();const act=t.dataset.gb;
  if(act==="impno"){GB.imp=null;render()}else if(act==="justno"){GB.just=null;render()}else if(act==="impok"){t.disabled=true;await gbGuardarImp()}
  else if(act==="vercat"){GB.cat=t.dataset.v;render()}
  else if(act==="quitarjust"){const [mes,id,slot]=t.dataset.k.split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs[id];if(!m)return;const D=docsMov(m);
    if(slot==="d"){if(!D.d)return;if(!confirm(`¿Quitar la ${(DOC_TXT[D.d.tipo]||"factura").toLowerCase()} de este movimiento? Luego puedes volver a subirla.`))return;
      try{if(D.dEn==="just"){await S.db.doc("banco/"+mes).update({["movs."+id+".just"]:null});m.just=null}
        else{await S.db.doc("banco/"+mes).update({["movs."+id+".doc"]:null,["movs."+id+".df"]:null});m.doc=null;m.df=null}
        render();toast("Quitado")}catch(_){toast("No se ha podido quitar.")}return}
    if(!D.j)return;
    if(!confirm("¿Quitar el justificante de este movimiento? Si era un PDF del banco, luego puedes volver a subirlo y se colocará en su sitio."))return;
    try{await S.db.doc("banco/"+mes).update({["movs."+id+".just"]:null,["movs."+id+".jf"]:null,["movs."+id+".tpv"]:null,["movs."+id+".ordenante"]:"",["movs."+id+".obs"]:""});
      Object.assign(m,{just:null,jf:null,tpv:null,ordenante:"",obs:""});render();toast("Justificante quitado")}catch(_){toast("No se ha podido quitar el justificante.")}}
  else if(act==="swapdoc"){/* el archivo está en el hueco equivocado: se cambia de hueco */
    const [mes,id,slot]=t.dataset.k.split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs[id];if(!m)return;const D=docsMov(m);
    try{if(slot==="j"&&D.j&&!D.d){const o={...m.just,tipo:docReq(m)||"factura"};await S.db.doc("banco/"+mes).update({["movs."+id+".doc"]:o,["movs."+id+".df"]:m.jf||null,["movs."+id+".just"]:null,["movs."+id+".jf"]:null});
        Object.assign(m,{doc:o,df:m.jf||null,just:null,jf:null});toast(`Pasado a ${(DOC_TXT[o.tipo]||"factura").toLowerCase()}`)}
      else if(slot==="d"&&D.d&&!D.j){const src=D.dEn==="just"?m.just:m.doc,o={id:src.id,n:src.n||"",t:src.t||nowISO(),tipo:"just"};
        await S.db.doc("banco/"+mes).update({["movs."+id+".just"]:o,["movs."+id+".jf"]:m.df||m.jf||null,["movs."+id+".doc"]:null,["movs."+id+".df"]:null});
        Object.assign(m,{just:o,jf:m.df||m.jf||null,doc:null,df:null});toast("Pasado a justificante del banco")}
      render()}catch(_){toast("No se ha podido cambiar.")}}
  else if(act==="versj"){GB.mes=t.dataset.v;GB.cat="sinjust";render()}
  else if(act==="sinfac"||act==="sinfacno"){const [mes,id]=t.dataset.k.split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs&&d.movs[id];if(!m)return;const si=act==="sinfac",cl=claveMov(m.concepto);
    try{await S.db.doc("banco/"+mes).update({["movs."+id+".sinFac"]:si});m.sinFac=si;
      if(cl){const sf={...((GB.cfg&&GB.cfg.sinFac)||{})};if(si)sf[cl]=true;else delete sf[cl];await S.db.doc("config/banco").set({...(GB.cfg||{}),sinFac:sf});GB.cfg={...(GB.cfg||{}),sinFac:sf}}
      if(!si)for(const x of movsTodos().filter(x=>x.sinFac&&claveMov(x.concepto)===cl)){await S.db.doc("banco/"+x.mes).update({["movs."+x.id+".sinFac"]:false})}
      render();toast(si?"Ya no se pide factura en este ni en los próximos de este proveedor. Sigue contando como gasto.":"Se vuelve a pedir la factura")}
    catch(e){console.error(e);toast("No se ha podido guardar.")}}
  else if(act==="enl"){GB.enl=t.dataset.k;GB.enlQ="";render();setTimeout(()=>{const i=$("#gb-enlq");if(i)i.focus()},0)}
  else if(act==="enlcerrar"){GB.enl=null;render()}
  else if(act==="enlok"||act==="enlno"){const [mes,id]=t.dataset.k.split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs&&d.movs[id];if(!m)return;const v=act==="enlok"?{id:t.dataset.al,nums:[t.dataset.n]}:null;
    try{await S.db.doc("banco/"+mes).update({["movs."+id+".enl"]:v});m.enl=v;GB.enl=null;render();toast(v?"Recibo enlazado":"Recibo quitado")}catch(e){console.error(e);toast("No se ha podido guardar.")}}
  /* 14/11/2026 (titular): cobro sin alumno, p. ej. una clase de prueba de alguien que no se ha apuntado. movs.<id>.enl =
     {sinAl:"prueba"|"otro", nom, tel, nota, t, por}: deja de salir como «sin alumno» y en Descuadres, y se recuerda para el futuro */
  else if(act==="enlprueba"||act==="enlotro"){const [mes,id]=t.dataset.k.split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs&&d.movs[id];if(!m)return;
    const pr=act==="enlprueba",def=titulo(String(m.ordenante||String(m.concepto||"").replace(/^.*?\bDE\s+/i,"")).toLowerCase()).trim();
    const nom=prompt(pr?"Nombre de quien hizo la clase de prueba (el alumno, no quien paga, si lo sabes):":"¿De quién o de qué es este ingreso?",def);if(nom===null)return;
    const tel=pr?prompt("Teléfono (opcional, para reconocerle si vuelve):",""):"";if(tel===null)return;
    const v={sinAl:pr?"prueba":"otro",nom:String(nom).trim().slice(0,80),tel:digitos(tel||"").slice(-9),nota:String(m.obs||"").slice(0,140),t:nowISO(),por:quienSoy()};
    try{await S.db.doc("banco/"+mes).update({["movs."+id+".enl"]:v});m.enl=v;GB.enl=null;render();toast(pr?"Apuntada como clase de prueba":"Apuntado como ingreso sin alumno")}catch(e){console.error(e);toast("No se ha podido guardar.")}}
  else if(act==="acjtodos"){ACJ.todos=true;render()}
  else if(act==="nodeduc"){const [mes,id]=t.dataset.k.split("|");await gbCambiarCat(mes,id,"nodeduc")}
  else if(act==="nota"){const [mes,id]=t.dataset.k.split("|"),d=GB.docs.find(x=>x.id===mes),m=d&&d.movs[id];if(!m)return;const v=prompt("Nota del movimiento",m.nota||"");if(v===null)return;
    try{await S.db.doc("banco/"+mes).update({["movs."+id+".nota"]:String(v).slice(0,140)});m.nota=String(v).slice(0,140);render()}catch(_){toast("No se ha podido guardar la nota.")}}
});

/* ---------- Justificantes del banco en bloque (31/10/2026) ----------
   PDF de comprobante del Sabadell (por ejemplo, «Bizum · Abono»): cada casilla tiene su etiqueta encima del valor.
   Se leen por posición: ordenante, beneficiario, observaciones, IBAN, referencia de intercambio, importe y fecha valor.
   Se asigna al movimiento de esa cuenta con la misma referencia (Referencia 1/2 del extracto) o, si no, con el mismo
   importe y una fecha valor a ±4 días. Se guarda el PDF como justificante y el ordenante y las observaciones en el movimiento. */
function campoBajo(items,etq){items=items.filter(i=>(i.p||1)===1);
  const L=items.find(i=>i.s.trim().toLowerCase()===etq.toLowerCase());if(!L)return "";
  const der=items.filter(i=>i!==L&&Math.abs(i.y-L.y)<4&&i.x>L.x+5&&/[A-Za-zÁÉÍÓÚáéíóú]{3}/.test(i.s)).map(i=>i.x).sort((a,b)=>a-b)[0];
  const xmax=der!=null?der-2:L.x+420;
  return items.filter(i=>i.y<L.y-3&&i.y>L.y-26&&i.x>=L.x-6&&i.x<xmax&&!/^(Identificación|Nombre del|Nombre último|Referencia|IBAN|BIC|Banco del|Fecha|Importe|Comisión|Valoración|Entidad|Tipo de|Canal|Cuenta|Clave)/.test(i.s.trim())).sort((a,b)=>b.y-a.y||a.x-b.x).map(i=>i.s).join(" ").replace(/\s+/g," ").trim();
}
/* Comprobantes del Sabadell: Bizum (abono), adeudo directo (recibos, TGSS, cuotas…), transferencia emitida o recibida e ingreso de
   efectivo en cajero. Se sacan del texto todos los IBAN, importes, fechas y referencias, y del diseño los nombres y observaciones. */
function leerComprobante(items){
  const t=items.map(i=>i.s).join(" ").replace(/\s+/g," ");
  /* 25/11/2026: el PDF del TC1 de A3 puede traer los acentos separados («o» + tilde) y se leía como factura: se mira sin acentos */
  const tN=t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase(),esTC=/RECIBO DE LIQUIDACION DE COTIZACIONES/.test(tN)||(/LIQUIDO DE TOTALES/.test(tN)&&/COTIZACION/.test(tN)&&/CONTINGENCIAS COMUNES/.test(tN));
  const tipo=esTC?"TC1":/liquidaci[oó]n de remesas/i.test(t)?"Liquidación TPV":/bizum/i.test(t)?"Bizum":/INGRESO DE EFECTIVO/i.test(t)?"Ingreso de efectivo":/Adeudo directo/i.test(t)?"Adeudo":/Transferencia Emitida/i.test(t)?"Transferencia emitida":/Transferencia/i.test(t)&&/sabadell/i.test(t)?"Transferencia recibida":/factura|invoice|fattura|rechnung|recibo|receipt|abono|rectificativa/i.test(t)?"Factura":"Comprobante";
  const signo={"TC1":-1,"Liquidación TPV":1,"Bizum":1,"Ingreso de efectivo":1,"Transferencia recibida":1,"Adeudo":-1,"Transferencia emitida":-1}[tipo]||0;
  const ibans=[...t.matchAll(/ES\d{2}(?:\s?\d{4}){5}/g)].map(m=>m[0].replace(/\s/g,""));
  const importes=[...new Set([...t.matchAll(/(?<![\d,.])\d{1,3}(?:\.\d{3})*,\d{2}(?![\d])/g)].map(m=>numBanco(m[0])).filter(n=>n>0))];
  const MES_TXT={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  /* 14/11/2026: también fechas escritas («12 noviembre 2026», «12 de noviembre de 2026»), como en las facturas de Amazon */
  const fTxt=[...t.toLowerCase().matchAll(/\b(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(\d{4})\b/g)].map(m=>`${m[3]}-${String(MES_TXT[m[2]]).padStart(2,"0")}-${m[1].padStart(2,"0")}`);
  /* 21/11/2026: facturas en inglés (Anthropic, Google…): «November 23, 2026», «Nov 23, 2026», «23 November 2026» e importes «€21.78» / «21.78 EUR» */
  const MES_EN={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12},mEn=x=>MES_EN[String(x).toLowerCase().slice(0,String(x).toLowerCase().startsWith("sept")?4:3)];
  const RX_MES="(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";
  const fEn=[...[...t.matchAll(new RegExp("\\b"+RX_MES+"\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})\\b","gi"))].map(m=>`${m[3]}-${String(mEn(m[1])).padStart(2,"0")}-${m[2].padStart(2,"0")}`),
    ...[...t.matchAll(new RegExp("\\b(\\d{1,2})\\s+"+RX_MES+"\\.?,?\\s+(\\d{4})\\b","gi"))].map(m=>`${m[3]}-${String(mEn(m[2])).padStart(2,"0")}-${m[1].padStart(2,"0")}`)].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!x.includes("undefined"));
  if(!importes.length)for(const m of t.matchAll(/(?:€|EUR)\s?(\d{1,3}(?:,\d{3})*\.\d{2})(?!\d)|(?<![\d.,])(\d{1,3}(?:,\d{3})*\.\d{2})\s?(?:€|EUR)/gi)){const v=+String(m[1]||m[2]).replace(/,/g,"");if(v>0&&!importes.includes(v))importes.push(v)}
  const fechas=[...new Set([...[...t.matchAll(/(?<![\d.-])(\d{1,2})([-\/.])(\d{1,2})\2(\d{2}|\d{4})(?![\d-])/g)].map(m=>fechaBanco(m[0])),...fTxt,...fEn].filter(Boolean))];
  const refs=[...new Set([...t.matchAll(/\b\d{8,}\b/g)].map(m=>m[0]))];
  /* CIF del emisor de una factura (en los adeudos SEPA la referencia empieza por el CIF del acreedor: A3 → «B01726595…») */
  const cifs=[...new Set([...t.toUpperCase().matchAll(/\b([ABCDEFGHJNPQRSUVW])[-.\s]?(\d{7})([0-9A-J])\b/g)].map(m=>m[1]+m[2]+m[3]))];
  /* 25/11/2026: en el PDF del TC1 el importe puede ir antes o después de «LIQUIDO DE TOTALES» */
  const liqTC=tipo==="TC1"?numBanco((t.match(/LIQUIDO DE TOTALES\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i)||t.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*LIQUIDO DE TOTALES/i)||[])[1]||""):null;
  const ref=(campoBajo(items,"Referencia de intercambio").match(/\d{6,}/)||[""])[0];
  const per=(t.match(/PERIODO(?: LIQUIDACION)?:\s*([\d\/-]+)/i)||[])[1];
  const nombre=tipo==="Adeudo"?campoBajo(items,"Nombre del acreedor"):signo<0?campoBajo(items,"Beneficiario"):campoBajo(items,"Ordenante").replace(/\s*\d{2}-\d{2}-\d{2}.*$/,"");
  let obs=campoBajo(items,"Observaciones");if(tipo==="Adeudo")obs=per?"Periodo "+per:campoBajo(items,"Referencia del adeudo");
  if(tipo==="Ingreso de efectivo"){const b=(t.match(/(\d+) billete\(s\) de (\d+)/gi)||[]).join(", ");obs=b?"Billetes: "+b:""}
  const fv=fechaBanco(campoBajo(items,"Fecha valor abono")||campoBajo(items,"Fecha valor de cargo en cuenta")||campoBajo(items,"Valoración"))||fechas[0]||"";
  let tpv=null,importe0=null;
  /* 10/11/2026: el adeudo del Sabadell lleva el detalle de la factura (base, IVA, total) antes del importe; vale el que va tras «Importe EUR» */
  const impEtq=(m=>m?numBanco(m[1]):null)(t.match(/Importe\s*EUR\s*(?:Comisi[oó]n\s*EUR\s*)?(?:Valoraci[oó]n\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/i));
  if(tipo==="Liquidación TPV"){tpv=[];
    for(const c of items.filter(i=>/^\d{4}\.\*{4}\.\*{4}\.\d{4}$/.test(i.s.trim()))){const fila=items.filter(i=>(i.p||0)===(c.p||0)&&Math.abs(i.y-c.y)<2&&i.x>c.x);
      const f=fila.find(i=>/^\d{2}\.\d{2}\.\d{2}$/.test(i.s.trim())),imp=fila.map(i=>i.s.trim()).find(x=>/^\d{1,3}(\.\d{3})*,\d{2}$/.test(x)),com=fila.map(i=>i.s.trim()).find(x=>/^-\d+,\d{2}$/.test(x));
      if(f&&imp)tpv.push({f:fechaBanco(f.s),imp:numBanco(imp),com:com?numBanco(com):0,tarj:c.s.trim().slice(-4)})}
    const tot=items.find(i=>i.s.trim()==="Total nominal en euros");if(tot){const v=items.filter(i=>(i.p||0)===(tot.p||0)&&i.y<tot.y&&i.y>tot.y-26&&Math.abs(i.x-tot.x)<45).map(i=>numBanco(i.s)).find(n=>n>0);if(v)importe0=v}
    if(importe0==null&&tpv.length)importe0=r2(tpv.reduce((a,o)=>a+o.imp,0));}
  /* 14/11/2026: una factura de proveedor sin el NIF de la titular no sirve para deducir: se avisa para pedirla con los datos */
  const miNif=String((typeof faEmisor==="function"?(faEmisor()||{}).nif:"")||"48966357R").toUpperCase().replace(/[^0-9A-Z]/g,"");
  const sinNif=tipo==="Factura"&&!!miNif&&!t.toUpperCase().replace(/[^0-9A-Z]/g,"").includes(miNif);
  return {tipo,signo,ibans,importes,fechas,refs,ref,tpv,cifs,sinNif,texto:tipo==="Factura"||tipo==="Comprobante"?t.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""):"",ordenante:nombre.trim(),obs:String(obs||"").trim().slice(0,140),fv,
    importe:importe0??liqTC??impEtq??(tipo==="Factura"&&importes.length?Math.max(...importes):null)??numBanco((campoBajo(items,"Nominal").match(/[\d.]+,\d{2}/)||[""])[0])??importes[0]??null};
}
async function leerPdfItems(file){
  await cargarJs(PDFJS);window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_W;
  const doc=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,out=[];
  for(let n=1;n<=Math.min(doc.numPages,10);n++){const tc=await (await doc.getPage(n)).getTextContent();out.push(...tc.items.filter(i=>i.str!=null).map(i=>({s:i.str,x:i.transform[4],y:i.transform[5],p:n})))}
  return out;
}
/* Para cada operación de una liquidación del TPV, los recibos pagados con tarjeta ese día (o el anterior/siguiente) por ese importe:
   un recibo exacto o varios recibos del mismo alumno que suman el importe. También los cobros con tarjeta de la Caja. */
function enlaceTpv(op){const out=[];
  for(const [id,a] of S.alumnos){const rs=(a.recibos||[]).filter(r=>r&&r.estado==="pagado"&&r.pagado&&/tarj|tpv|dat[aá]fono/i.test(r.forma||"")&&difDias(r.pagado,op.f)<=1);if(!rs.length)continue;
    const uno=rs.filter(r=>Math.abs(+r.importe-op.imp)<0.005);if(uno.length)for(const r of uno)out.push({n:a.nombre,id,txt:r.numero||r.concepto||""});
    else{const dia=rs.filter(r=>r.pagado===op.f),tot=dia.reduce((x,r)=>x+(+r.importe||0),0);if(dia.length>1&&Math.abs(tot-op.imp)<0.005)out.push({n:a.nombre,id,txt:dia.map(r=>r.numero).filter(Boolean).join(" + ")})}}
  const caja=(typeof GC!=="undefined"?GC.docs:[]).filter(d=>d.tipo==="cobro"&&d.forma==="tarjeta"&&Math.abs(+d.total-op.imp)<0.005&&difDias(d.dia,op.f)<=1);
  for(const d of caja)if(!out.some(o=>o.id===d.alumno))out.push({n:d.nombre,id:d.alumno,txt:"Caja "+horaC(d)});
  if(!out.length){/* si Argos aún no lo da como pagado: recibos pendientes por ese importe (posibles) */
    for(const [id,a] of S.alumnos){if(a.baja)continue;const r=(a.recibos||[]).find(r=>pendReciente(r,op.f)&&Math.abs(+r.importe-op.imp)<0.005);if(r)out.push({n:a.nombre,id,txt:(r.numero||"")+" · pendiente en Argos",pend:true})}}
  return out}
/* Bizum y transferencias recibidas: de qué alumno es el cobro.
   1) Por nombre: las palabras del concepto del PDF («Alvaro aguera octubre») y del ordenante que coinciden con el nombre del alumno.
   2) Por Argos: recibos pagados con esa forma de pago por ese importe a ±3 días (uno, o varios del mismo alumno que lo suman). */
const NORM=x=>String(x||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const PAL_NO=new Set(["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","SETIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE","CLASE","CLASES","PAGO","CUOTA","MES","MENSUALIDAD","RECIBO","ALTHEA","ACADEMIA","LOGOPEDIA","BIZUM","TRANSFERENCIA","DEL","LOS","LAS","CON","POR","PARA","HIJO","HIJA","ESTEFANIA","PEREZ","BUSATI"]);
/* Recibo elegido a mano (08/11/2026: el Bizum suele venir a nombre del padre o la madre): movs.<id>.enl = {id: alumno, nums: [nº recibo]} */
/* 10/11/2026: si un Bizum no encaja con nada:
   1) puede ser el primer recibo de una preinscripción (la familia dice que pagó por Bizum ese importe);
   2) puede ser un Bizum hecho en dos o tres veces (mismo concepto, mismo día o el siguiente): se prueba con la suma. */
function preCandidatos(imp,f){const P=typeof PR!=="undefined"&&PR.docs?PR.docs:[];
  return P.filter(p=>p&&["alta","completada","procesando","enviada"].includes(p.estado)&&(()=>{const pr=p.primer||(typeof preProrrateo==="function"?preProrrateo(p.importe,p.clases,p.inicio):null);return pr&&Math.abs(+pr.total-imp)<0.005})()&&(!p.bizum||difDias(String(p.bizum).slice(0,10),f)<=4))
    .map(p=>({id:p.alumno&&S.alumnos.has(p.alumno)?p.alumno:"",a:(p.alumno&&S.alumnos.get(p.alumno))||{nombre:p.nombre||""},pt:6,rec:[],pagado:false,pre:p})).slice(0,3)}
function enlaceCobro(m){const r=enlaceCobroBase(m);if(r.length||m.enl||m._junto||m.cat!=="bizum")return r;
  const pc=preCandidatos(m.importe,m.fv);if(pc.length)return pc;
  const sib=movsTodos().filter(x=>x.id!==m.id&&x.cat===m.cat&&x.importe>0&&String(x.concepto)===String(m.concepto)&&Math.abs(difDias(x.fv,m.fv))<=1&&!x.enl);
  if(!sib.length||sib.length>3)return [];
  const tot=r2(m.importe+sib.reduce((s,x)=>s+x.importe,0)),mm={...m,importe:tot,_junto:true};let r3=enlaceCobroBase(mm);if(!r3.length)r3=preCandidatos(tot,m.fv);
  return r3.map(x=>({...x,junto:sib,tot}))}
function enlaceCobroBase(m){
  const forma=m.cat==="bizum"?/bizum/i:/transf/i,res=[];
  if(m.enl&&m.enl.sinAl)return [{id:"",a:{nombre:m.enl.nom||"sin nombre"},pt:99,rec:[],pagado:false,man:true,sinAl:m.enl.sinAl}];
  if(m.enl&&m.enl.id){const a=S.alumnos.get(m.enl.id);if(a){const rec=(a.recibos||[]).filter(r=>r&&(m.enl.nums||[]).includes(r.numero||r.id));return [{id:m.enl.id,a,pt:99,rec,pagado:rec.length>0&&rec.every(r=>r.estado==="pagado"),man:true}]}}
  /* el nombre que trae el concepto («ABONO BIZUM DE MANUELA A. G.») también cuenta, por si coincide con el del alumno */
  const deC=String(m.concepto||"").replace(/^.*?\bDE\s+/i,"");
  const pals=[...new Set(NORM((m.obs||"")+" "+(m.ordenante||"")+" "+deC).split(/[^A-Z]+/).filter(w=>w.length>=3&&!PAL_NO.has(w)))],obsP=new Set(NORM(m.obs||"").split(/[^A-Z]+/));
  for(const [id,a] of S.alumnos){
    const np=NORM(a.nombre).split(/[^A-Z]+/).filter(Boolean),coinc=pals.filter(w=>np.includes(w)),enObs=coinc.filter(w=>obsP.has(w)).length;
    const rs=(a.recibos||[]).filter(r=>r&&r.importe!=null);
    const pag=rs.filter(r=>r.estado==="pagado"&&r.pagado&&forma.test(r.forma||"")&&(difDias(r.pagado,m.fv)<=3||difDias(r.pagado,m.fo)<=3));
    let rec=pag.filter(r=>Math.abs(+r.importe-m.importe)<0.005);
    if(!rec.length&&pag.length>1&&Math.abs(pag.reduce((x,r)=>x+(+r.importe||0),0)-m.importe)<0.005)rec=pag;
    const mismoImp=rs.filter(r=>Math.abs(+r.importe-m.importe)<0.005&&String(r.emitido||"")<=m.fv).sort((x,y)=>String(y.emitido).localeCompare(String(x.emitido)));
    const pt=(rec.length?5:0)+coinc.length*2+enObs*2+(coinc.length&&mismoImp.length?2:0);
    if(pt>=4)res.push({id,a,pt,rec:rec.length?rec:mismoImp.slice(0,1),pagado:!!rec.length})}
  res.sort((x,y)=>y.pt-x.pt);return res.length>1&&res[0].pt===res[1].pt?res.filter(r=>r.pt===res[0].pt).slice(0,4):res.slice(0,1);
}
function vEnlaceCobro(m){if(!["bizum","transf"].includes(m.cat)||m.importe<=0)return "";const e=enlaceCobro(m);
  const k=`${esc(m.mes)}|${esc(m.id)}`,abierto=GB.enl===m.mes+"|"+m.id;
  const elegir=abierto?vElegirRecibo(m):` <button class="btn small" data-gb="enl" data-k="${k}" title="Elige el alumno y el recibo que paga este ${m.cat==="bizum"?"Bizum":"ingreso"} (por ejemplo, si viene a nombre del padre o la madre)">${e.length&&e[0].man?"Cambiar":"Elegir recibo"}</button>`;
  if(!e.length)return `<br><span class="note" style="color:var(--warn)">→ sin alumno identificado${m.ordenante?"":" (sube el PDF del banco para ver quién paga, o elígelo)"}</span>${elegir}`;
  const txt=x=>`${x.junto?`junto con ${x.junto.map(j=>`el Bizum de ${eur(j.importe)}${j.fv!==m.fv?" del "+fmtFecha(j.fv):""}`).join(" y ")} = <b>${eur(x.tot)}</b>: `:""}${x.id?`<a href="#" data-act="ir" data-id="${esc(x.id)}">${esc(titulo(x.a.nombre))}</a>`:`<b>${esc(titulo(x.a.nombre))}</b>`}${x.sinAl?(x.sinAl==="prueba"?" · <b>clase de prueba</b>, no se apuntó (sin recibo; hazle factura en Argos)":" · ingreso sin alumno"):x.pre?` (primer recibo de la preinscripción${x.pre.bizum?", la familia dijo que pagó por Bizum":""})`:x.rec.length?` (${x.rec.map(r=>esc(r.numero||r.concepto||"")).join(" + ")} · ${x.pagado?"pagado en Argos":"pendiente en Argos"})`:""}`;
  return `<br><span class="note">→ ${e.length===1?txt(e[0]):`<span style="color:var(--warn)">puede ser</span> ${e.map(txt).join(" o ")}`}${e[0].man?` · elegido a mano <button class="btn small" data-gb="enlno" data-k="${k}" title="Quitar el recibo elegido" aria-label="Quitar">×</button>`:""}</span>${e.length===1&&!abierto&&!e[0].man?"":elegir}`;
}
/* Buscador para elegir el recibo: alumnos por nombre; de cada uno, sus recibos más cercanos al importe y la fecha del movimiento. */
function vElegirRecibo(m){return `<div style="margin-top:4px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--surface)">
  <div style="display:flex;gap:6px;align-items:center"><input type="search" id="gb-enlq" placeholder="Nombre del alumno" style="flex:1" value="${esc(GB.enlQ||"")}"><button class="btn small" data-gb="enlcerrar">Cancelar</button></div>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px"><span class="note">¿No es de ningún alumno?</span><button class="btn small" data-gb="enlprueba" data-k="${esc(m.mes)}|${esc(m.id)}" title="Alguien que vino a una clase de prueba y no se apuntó: se guarda su nombre para reconocerle si vuelve">Clase de prueba (no se apuntó)</button><button class="btn small" data-gb="enlotro" data-k="${esc(m.mes)}|${esc(m.id)}">Otro ingreso sin alumno</button></div>
  <div id="gb-enlres">${vElegirRes(m)}</div></div>`}
function vElegirRes(m){const q=nzC(GB.enlQ||""),k=`${esc(m.mes)}|${esc(m.id)}`;
  let l=q.length>=2?sortedAlumnos().filter(([,a])=>a.nombre.includes(q)).slice(0,8)
    :[...S.alumnos].filter(([,a])=>(a.recibos||[]).some(r=>r&&Math.abs(+r.importe-m.importe)<0.005&&difDias(String(r.emitido||m.fv).slice(0,10),m.fv)<=45)).slice(0,8);
  if(!l.length)return `<p class="note" style="margin:6px 0 0">${q.length>=2?"Ningún alumno con ese nombre.":"Escribe el nombre del alumno."}</p>`;
  return (q.length>=2?"":`<p class="note" style="margin:6px 0 2px">Con un recibo de ${eur(m.importe)}:</p>`)+l.map(([id,a])=>{
    const rs=(a.recibos||[]).filter(r=>r&&r.importe!=null).sort((x,y)=>(Math.abs(+x.importe-m.importe)<0.005?0:1)-(Math.abs(+y.importe-m.importe)<0.005?0:1)||difDias(String(x.emitido||"").slice(0,10)||m.fv,m.fv)-difDias(String(y.emitido||"").slice(0,10)||m.fv,m.fv)).slice(0,4);
    return `<div style="margin-top:6px"><b style="font-size:13px">${esc(titulo(a.nombre))}</b> ${rs.map(r=>`<button class="btn small ${Math.abs(+r.importe-m.importe)<0.005?"primary":""}" data-gb="enlok" data-k="${k}" data-al="${esc(id)}" data-n="${esc(r.numero||r.id)}" title="${esc(r.concepto||"")}">${esc(r.numero||"")} · ${eur(+r.importe)} · ${r.estado==="pagado"?"pagado":"pendiente"}</button>`).join(" ")||`<span class="note">sin recibos</span>`}</div>`}).join("")}
function vTpvOpsDet(m){if(!m.tpv||!m.tpv.length)return "";
  const ult=S.recCfg&&S.recCfg.ultima,viejo=ult&&m.tpv.some(o=>o.f>ult);
  return `<details style="margin-top:2px"><summary class="note">${m.tpv.length} ${m.tpv.length===1?"operación":"operaciones"} con tarjeta</summary>${viejo?`<div class="note" style="margin-left:12px;color:var(--warn)">El último listado de Argos es del ${fmtFecha(ult)}: sube uno más reciente (Recibos → Cargar listado de Argos) para ver quién pagó.</div>`:""}${m.tpv.map(o=>{const e=enlaceTpv(o);
    if(e.length&&e[0].pend)return `<div class="note" style="margin-left:12px">${fmtFecha(o.f)} · ${eur(o.imp)} · tarjeta …${esc(o.tarj)} → <span style="color:var(--warn)">${e.length>6?`${e.length} recibos pendientes de ${eur(o.imp)}`:`posible: ${e.map(x=>`<a href="#" data-act="ir" data-id="${esc(x.id)}">${esc(titulo(x.n))}</a> (${esc(x.txt)})`).join(" · ")}`}</span></div>`;
    return `<div class="note" style="margin-left:12px">${fmtFecha(o.f)} · ${eur(o.imp)} · tarjeta …${esc(o.tarj)} → ${e.length===1?`<a href="#" data-act="ir" data-id="${esc(e[0].id)}">${esc(titulo(e[0].n))}</a> (${esc(e[0].txt)})`:e.length>1?`<span style="color:var(--warn)">puede ser ${e.map(x=>esc(titulo(x.n))).join(" o ")}</span>`:`<span style="color:var(--warn)">sin recibo pagado con tarjeta</span>`}</div>`}).join("")}</details>`}
/* 09/11/2026 (titular): en cada abono del TPV, a qué recibos corresponde y si cuadra.
   - Con el PDF del banco (operaciones una a una): cuántas operaciones tienen recibo y si la suma de operaciones es el abono.
   - Sin el PDF: los abonos del TPV de ese día (los dos terminales) frente a los cobros con tarjeta desde el abono anterior hasta
     el día antes. Hasta 2027 se miran los recibos pagados con tarjeta en Argos; desde 2027, los cobros con tarjeta de la Caja. */
function tpvCobrosEntre(d0,d1){const out=[];
  if(!cajaPrueba()&&typeof GC!=="undefined"){for(const d of GC.docs)if(d.tipo==="cobro"&&d.forma==="tarjeta"&&d.dia>=d0&&d.dia<=d1&&!anulados().has(d.id))out.push({id:d.alumno,n:d.nombre,f:d.dia,imp:+d.total||0,txt:"Caja "+horaC(d)})}
  else for(const [id,a] of S.alumnos)for(const r of (a.recibos||[]))if(r&&r.estado==="pagado"&&r.pagado&&/tarj|tpv|dat[aá]fono/i.test(r.forma||"")){const f=String(r.pagado).slice(0,10);if(f>=d0&&f<=d1)out.push({id,n:a.nombre,f,imp:+r.importe||0,txt:r.numero||r.concepto||""})}
  return out.sort((x,y)=>x.f.localeCompare(y.f)||x.n.localeCompare(y.n,"es"))}
/* Reparto de las operaciones de una liquidación entre recibos (09/11/2026, «mucho ruido»):
   1) la tarjeta ya conocida: si una tarjeta (…1234) salió antes con un solo alumno, se usa para elegir;
   2) cada recibo solo vale para una operación: lo ya asignado se quita de las demás (y el mismo alumno no cuenta dos veces);
   3) lo que queda se agrupa por importe: «2 de 40 € entre 3 recibos posibles», con los nombres plegados. */
function tarjetasConocidas(){const o={},malas=new Set();
  for(const m of movsTodos())for(const op of (m.tpv||[])){if(!op.tarj)continue;const e=enlaceTpv(op).filter(x=>!x.pend);const ids=[...new Set(e.map(x=>x.id))];if(ids.length!==1)continue;
    if(o[op.tarj]&&o[op.tarj]!==ids[0])malas.add(op.tarj);else o[op.tarj]=ids[0]}
  for(const k of malas)delete o[k];return o}
function repartoTpv(ops){const tk=tarjetasConocidas();
  const c=ops.map(o=>{const e=enlaceTpv(o),pend=e.length&&e.every(x=>x.pend);const v=[],ya=new Set();for(const x of e)if(!x.pend&&!ya.has(x.id+"|"+x.txt)){ya.add(x.id+"|"+x.txt);v.push(x)}
    let cand=v;if(cand.length>1&&tk[o.tarj]){const k=cand.filter(x=>x.id===tk[o.tarj]);if(k.length)cand=k.slice(0,1)}
    return {o,cand,pend:pend?e:null}});
  let cambia=true;while(cambia){cambia=false;const usados=new Set(c.filter(x=>x.cand.length===1).map(x=>x.cand[0].id+"|"+x.cand[0].txt));
    for(const x of c)if(x.cand.length>1){const r=x.cand.filter(y=>!usados.has(y.id+"|"+y.txt));if(r.length&&r.length<x.cand.length){x.cand=r;cambia=true}}}
  const ok=c.filter(x=>x.cand.length===1),sin=c.filter(x=>!x.cand.length&&!x.pend),pend=c.filter(x=>!x.cand.length&&x.pend),dud=c.filter(x=>x.cand.length>1);
  const grupos={};for(const x of dud){const k=x.o.f+"|"+x.o.imp;(grupos[k]=grupos[k]||{f:x.o.f,imp:x.o.imp,ops:[],cand:new Map()}).ops.push(x.o);for(const y of x.cand)grupos[k].cand.set(y.id+"|"+y.txt,y)}
  return {ok,sin,pend,grupos:Object.values(grupos)}}
function vTpvOps(m){
  /* con la caja de Argos de esos días subida: solo cuadra / descuadre por operación */
  if(m.tpv&&m.tpv.length){const AC=argosCajaDias(),fs=[...new Set(m.tpv.map(o=>o.f))];
    if(fs.every(f=>AC[f])){const ar=fs.flatMap(f=>AC[f].f.filter(x=>esTarj(x.fp)).map(x=>({...x,dia:f}))),op=m.tpv.map(o=>({imp:+o.imp||0,tarj:o.tarj||"",f:o.f}));
      /* otras liquidaciones con operaciones de esos mismos días se llevan sus cobros */
      const otros=movsTodos().filter(x=>x.id!==m.id&&x.cat==="tpv"&&(x.tpv||[]).some(o=>fs.includes(o.f))).flatMap(x=>x.tpv.filter(o=>fs.includes(o.f)).map(o=>({imp:+o.imp||0})));
      const libres=emparejarTpv(otros,ar).soloB,e=emparejarTpv(op,libres),ok=!e.soloA.length,tot=r2(op.reduce((s,x)=>s+x.imp,0));
      return `<div class="note" style="margin-top:2px">${m.tpv.length} operaciones con tarjeta · caja de Argos del ${fs.map(fmtFecha).join(", ")} <span class="badge ${ok&&Math.abs(tot-m.importe)<0.01?"b-si":"b-no"}">${ok&&Math.abs(tot-m.importe)<0.01?"Cuadra":"Descuadre"}</span></div>
        ${e.soloA.map(o=>`<div class="note" style="margin-left:12px;color:var(--bad)">${eur(o.imp)} · ${fmtFecha(o.f)}${o.tarj?` · tarjeta …${esc(o.tarj)}`:""}: no está en la caja de Argos con tarjeta</div>`).join("")}
        ${Math.abs(tot-m.importe)>=0.01?`<div class="note" style="margin-left:12px;color:var(--warn)">Las operaciones suman ${eur(tot)} y el abono es de ${eur(m.importe)}</div>`:""}`}}
  if(m.tpv&&m.tpv.length){const ops=m.tpv,R=repartoTpv(ops),tot=r2(ops.reduce((x,o)=>x+(+o.imp||0),0));
    /* un grupo «cuadra» si hay tantos recibos posibles como operaciones (se reparten entre ellos aunque no se sepa cuál es cuál) */
    const gOk=R.grupos.filter(g=>g.cand.size===g.ops.length),gNo=R.grupos.filter(g=>g.cand.size!==g.ops.length);
    const nOk=R.ok.length+gOk.reduce((x,g)=>x+g.ops.length,0),cuadra=nOk===ops.length&&Math.abs(tot-m.importe)<0.01;
    const ult=S.recCfg&&S.recCfg.ultima,viejo=ult&&ops.some(o=>o.f>ult);
    const al=x=>`<a href="#" data-act="ir" data-id="${esc(x.id)}">${esc(titulo(x.n))}</a>`;
    const filas=[...R.ok.map(x=>`<div class="note" style="margin-left:12px">${eur(x.o.imp)} → ${al(x.cand[0])} <span style="opacity:.7">${esc(x.cand[0].txt)}</span></div>`),
      ...gOk.map(g=>`<div class="note" style="margin-left:12px">${g.ops.length} × ${eur(g.imp)} → ${[...g.cand.values()].map(al).join(", ")}</div>`),
      ...gNo.map(g=>`<details class="note" style="margin-left:12px;color:var(--warn)"><summary>${g.ops.length} × ${eur(g.imp)}: ${g.cand.size} recibos posibles, no se sabe cuál${g.ops.length===1?"":"es"}</summary><div style="margin-left:12px">${[...g.cand.values()].map(al).join(", ")}</div></details>`),
      ...R.pend.map(x=>`<div class="note" style="margin-left:12px;color:var(--warn)">${eur(x.o.imp)} · tarjeta …${esc(x.o.tarj)} → recibo aún pendiente en Argos${x.pend.length<=2?": "+x.pend.map(al).join(" o "):""}</div>`),
      ...R.sin.map(x=>`<div class="note" style="margin-left:12px;color:var(--bad)">${eur(x.o.imp)} · ${fmtFecha(x.o.f)} · tarjeta …${esc(x.o.tarj)} → sin recibo pagado con tarjeta</div>`)].join("");
    const pegas=[R.sin.length?`${R.sin.length} sin recibo`:"",R.pend.length?`${R.pend.length} pendiente${R.pend.length===1?"":"s"} en Argos`:"",gNo.length?`${gNo.reduce((x,g)=>x+g.ops.length,0)} sin aclarar`:"",Math.abs(tot-m.importe)>=0.01?`las operaciones suman ${eur(tot)}`:""].filter(Boolean).join(" · ");
    return `<details style="margin-top:2px"><summary class="note">${ops.length} operaciones con tarjeta <span class="badge ${cuadra?"b-si":"b-pend"}" style="margin-left:4px">${cuadra?"Cuadra":nOk+" de "+ops.length+" cuadran"}</span>${pegas?` <span style="color:var(--warn)">${pegas}</span>`:""}</summary>
      ${viejo?`<div class="note" style="margin-left:12px;color:var(--warn)">El último listado de Argos es del ${fmtFecha(ult)}: sube uno más reciente para ver quién pagó.</div>`:""}${filas}</details>`}
  if(m.cat!=="tpv"||!(m.importe>0)||!m.fv)return "";
  const tpvs=movsTodos().filter(x=>x.cat==="tpv"&&x.importe>0&&x.fv),mismos=tpvs.filter(x=>x.fv===m.fv),prev=tpvs.map(x=>x.fv).filter(f=>f<m.fv).sort().pop();
  const d1=sumaDias(m.fv,-1),d0=prev||d1,l=tpvCobrosEntre(d0,d1),tot=r2(l.reduce((x,o)=>x+o.imp,0)),abo=r2(mismos.reduce((x,o)=>x+o.importe,0)),dif=r2(abo-tot),cuadra=Math.abs(dif)<0.01;
  const per=d0===d1?`del ${fmtFecha(d1)}`:`del ${fmtFecha(d0)} al ${fmtFecha(d1)}`;
  return `<details style="margin-top:2px"><summary class="note">${mismos.length>1?`Abonos TPV de este día (${mismos.length}): ${eur(abo)} · `:""}cobros con tarjeta ${per}: ${eur(tot)} <span class="badge ${cuadra?"b-si":"b-pend"}" style="margin-left:4px">${cuadra?"Cuadra":(dif>0?"Faltan recibos por ":"Sobran ")+eur(Math.abs(dif))}</span></summary>
    ${l.length?l.map(o=>`<div class="note" style="margin-left:12px">${fmtFecha(o.f)} · ${eur(o.imp)} → <a href="#" data-act="ir" data-id="${esc(o.id)}">${esc(titulo(o.n))}</a> (${esc(o.txt)})</div>`).join(""):`<div class="note" style="margin-left:12px">No hay recibos pagados con tarjeta esos días${cajaPrueba()?" en el último listado de Argos":" en la Caja"}.</div>`}
    <div class="note" style="margin-left:12px">${cajaPrueba()?"Hasta 2027 se comparan los recibos que Argos da como pagados con tarjeta.":"Se comparan los cobros con tarjeta de la Caja."} Para verlo operación por operación, sube el PDF de la liquidación del banco como justificante.</div></details>`}
const difDias=(a,b)=>Math.abs((new Date(a+"T12:00:00")-new Date(b+"T12:00:00"))/864e5);
function buscarMov(c,usados){
  const todos=movsTodos().filter(m=>!esCaja(m)||c.slot==="doc"),conocidas=new Set(todos.map(m=>m.cuenta)),cuentas=c.ibans.map(i=>i.slice(-4)).filter(x=>conocidas.has(x));
  /* 14/11/2026: el hueco de la factura cuenta como libre si la que hay no lleva el NIF y la nueva sí (la sustituye) */
  const libre=m=>{if(c.slot!=="doc")return !m.just;const d=docsMov(m).d;return !d||(!!d.sinNif&&!c.sinNif)};
  /* TC1: el cargo de la Seguridad Social por el líquido total, entre 0 y 60 días después de la fecha del recibo */
  if(c.tipo==="TC1"){const f0=c.fechas[0]||"";const l=todos.filter(m=>!usados.has(m.id)&&m.importe<0&&c.importe!=null&&Math.abs(-m.importe-c.importe)<0.005&&(m.cat==="ssemp"||/TGSS|SEGURIDAD SOCIAL/i.test(m.concepto))&&(!f0||(m.fv>=f0&&difDias(m.fv,f0)<=60)));
    const o=l.filter(libre).sort((a,b)=>String(a.fv).localeCompare(String(b.fv)));if(o.length)c.seguro=o.length===1;return o[0]||l[0]||null}
  /* Factura con el CIF del emisor en el concepto o la referencia del adeudo y el mismo importe: segura */
  if(c.tipo==="Factura"&&c.cifs&&c.cifs.length){const tot=c.importe;const l=todos.filter(m=>!usados.has(m.id)&&m.importe<0&&tot!=null&&Math.abs(-m.importe-tot)<0.005&&c.cifs.some(x=>(m.concepto+" "+m.ref1+" "+m.ref2+" "+(m.obs||"")).toUpperCase().replace(/[-.\s]/g,"").includes(x)));
    if(l.length===1){c.seguro=true;return l[0]}
    if(l.length>1){const cerca=m=>Math.min(...(c.fechas.length?c.fechas:[m.fv]).map(f=>m.fv>=f?difDias(m.fv,f):999));const o=l.filter(libre).sort((a,b)=>cerca(a)-cerca(b));if(o.length){c.seguro=true;return o[0]}}}
  let ms=todos.filter(m=>!usados.has(m.id)&&(!cuentas.length||cuentas.includes(m.cuenta)));
  const nums=c.refs.map(r=>r.replace(/^0+/,"")).filter(r=>r.length>=8);
  /* un número sirve solo si está en un único movimiento (el nº de comercio del TPV está en todos) y el importe cuadra */
  const unico=n=>todos.filter(m=>(!c.signo||Math.sign(m.importe)===c.signo)&&(m.concepto.includes(n)||m.ref1===n||m.ref2===n)).length===1;
  const impOk=m=>c.importe==null||Math.abs(Math.abs(m.importe)-c.importe)<0.005;
  const porRef=(c.signo?ms.filter(m=>Math.sign(m.importe)===c.signo):ms).find(m=>impOk(m)&&nums.some(n=>unico(n)&&m.concepto.includes(n)))||ms.find(m=>impOk(m)&&(m.ref1&&(c.refs.includes(m.ref1)||m.ref1===c.ref))||(m.ref2&&(c.refs.includes(m.ref2)||m.ref2===c.ref)));if(porRef){c.seguro=true;return porRef}
  ms=ms.filter(m=>libre(m)&&(!c.signo||Math.sign(m.importe)===c.signo)&&c.importes.some(v=>Math.abs(Math.abs(m.importe)-v)<0.005)&&(c.fechas.length?c.fechas.some(f=>c.texto?/* factura: se paga entre 3 días antes y 45 después de su fecha */[m.fv,m.fo].some(x=>x&&x>=sumaDias(f,-3)&&x<=sumaDias(f,45)):difDias(m.fv,f)<=4||difDias(m.fo,f)<=4):true));
  /* facturas: el comercio del concepto del banco tiene que salir en la factura (AMAZON, APPLE, A3 ASESORES, ANTHROPIC…) */
  const GEN=/^(COMPRA|TARJ|ADEUDO|RECIBO|TRANSFERENCIA|ABONO|DEVOLUCION|WWW|COM|SAU|SLP|SPAIN|ESPANA)$/;
  const comercio=m=>m.concepto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^A-Z0-9]+/).filter(w=>w.length>=3&&!/\d{3}/.test(w)&&!GEN.test(w));
  /* 14/11/2026: el banco abrevia algunos comercios (Amazon sale como «AMZN Mktp ES», «AMZN Digital»…) */
  const ALIAS={AMZN:"AMAZON",MKTP:"AMAZON",AMAZONES:"AMAZON",GOOGLE:"GOOGLE",APPLECOMBILL:"APPLE"};
  if(c.texto){ms=ms.filter(m=>comercio(m).some(w=>c.texto.includes(ALIAS[w]||w)));if(ms.length<=1){if(ms[0]&&c.slot==="doc")c.seguro=true;return ms[0]||null}
    const tot=Math.max(...c.importes);const t2=ms.filter(m=>Math.abs(Math.abs(m.importe)-tot)<0.005);if(t2.length===1)return t2[0];
    const cerca=m=>Math.min(...c.fechas.map(f=>difDias(m.fv,f)));const o=[...(t2.length?t2:ms)].sort((a,b)=>cerca(a)-cerca(b));return cerca(o[0])<cerca(o[1])?o[0]:null}
  if(ms.length<=1)return ms[0]||null;
  /* desempate: el importe principal, la fecha exacta y los nombres que coinciden con el concepto */
  const pal=String(c.ordenante+" "+c.obs).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").split(/[^A-Z]+/).filter(w=>w.length>=4&&!/^(ESTEFANIA|PEREZ|BUSATI|BANCO|SABADELL)$/.test(w));
  const pt=m=>(c.importe!=null&&Math.abs(Math.abs(m.importe)-c.importe)<0.005?4:0)+(c.fv&&(m.fv===c.fv||m.fo===c.fv)?2:0)+(m.just?-3:0)+pal.filter(w=>m.concepto.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g,"").includes(w)).length*3;
  const o=ms.map(m=>[pt(m),m]).sort((a,b)=>b[0]-a[0]);return o[0][0]>o[1][0]?o[0][1]:null;
}
async function gbSubirJustificantes(files){
  GB.just={n:files.length,hecho:0,ok:[],ya:[],sin:[],err:[]};render();const usados=new Set(),vistos=new Set();let as=null;
  try{as=await window.claude.use("assets")}catch(_){}
  const reintentar=[];let vuelta=0;
  for(let k=0;k<files.length+reintentar.length;k++){const f=k<files.length?files[k]:reintentar[k-files.length];vuelta=k>=files.length?1:0;const sinAntes=GB.just.sin.length;
    if(vuelta){GB.just.n++;vistos.delete(f.__firma)}
    try{if(/\.xlsx?$/i.test(f.name)){await subirListado(f);GB.just.hecho++;continue}
      const items=await leerPdfItems(f);
      if(await paqueteA3(f,items)){GB.just.hecho++;continue}
      const c=leerComprobante(items);c.slot=["Factura","TC1"].includes(c.tipo)?"doc":"just";const quien=c.ordenante||(c.tipo==="Factura"?"Factura "+f.name.replace(/\.pdf$/i,""):c.tipo)||f.name,firma=hashTxt([c.tipo,c.ibans.join(),c.ref,c.importe,c.fv,c.refs.join(),c.ordenante,c.obs,(c.tpv||[]).map(o=>o.f+o.imp+o.tarj).join()].join("|"));
      if(vistos.has(firma)){GB.just.ya.push(`${quien} · repetido en esta subida`);GB.just.hecho++;continue}vistos.add(firma);f.__firma=firma;
      const prev=movsTodos().find(x=>x.jf===firma||x.df===firma);
      if(prev&&prev.df===firma){GB.just.ya.push(`${quien} · ya estaba subido (${fmtFecha(prev.fv)} · ${eur(Math.abs(prev.importe))})`);GB.just.hecho++;continue}
      if(prev&&c.importe!=null&&Math.abs(Math.abs(prev.importe)-c.importe)>0.005){
        /* se colocó mal (versión anterior): se quita de ahí, y de los movimientos que compartían ese PDF, y se vuelve a colocar */
        for(const x of movsTodos().filter(x=>x.just&&prev.just&&x.just.id===prev.just.id)){await S.db.doc("banco/"+x.mes).update({["movs."+x.id+".just"]:null,["movs."+x.id+".jf"]:null,["movs."+x.id+".tpv"]:null,["movs."+x.id+".ordenante"]:"",["movs."+x.id+".obs"]:""});
          const dd=GB.docs.find(y=>y.id===x.mes);if(dd)Object.assign(dd.movs[x.id],{just:null,jf:null,tpv:null,ordenante:"",obs:""})}
        GB.just.fix=(GB.just.fix||0)+1}
      else if(prev){GB.just.ya.push(`${quien} · ya estaba subido (${fmtFecha(prev.fv)} · ${eur(Math.abs(prev.importe))})`);GB.just.hecho++;continue}
      const m=buscarMov(c,usados);
      /* 25/11/2026 (titular): el TC1 llega antes que el cargo de la Seguridad Social. Si el cargo aún no está en el banco, se guarda
         en nominas/<AAAA-MM>_tc1 (mes de la liquidación): la previsión usa su importe real y se engancha solo al cargo al subir el extracto */
      if(!m&&c.tipo==="TC1"&&c.importe>0){const T=items.map(i=>i.s).join(" "),pm=T.match(/Per[ií]odo de Liquidaci[oó]n:?\s*(\d{2})\/(\d{4})/i)||T.match(/\b(\d{2})\/(\d{4})\s*-\s*\d{2}\/\d{4}\b/);/* en el PDF el valor puede ir antes que la etiqueta */
        if(pm){const mes=pm[2]+"-"+pm[1],key=mes+"_tc1",prevT=NM.docs.find(d=>d.id===key);
          if(prevT&&Math.abs((+prevT.imp||0)-c.importe)<0.005){GB.just.ya.push(`TC1 de ${mesTxt(mes)} · ya estaba subido (${eur(c.importe)})`);GB.just.hecho++;continue}
          const r=await as.upload(f,{clase:"gasto"}),rec={mes,tipo:"tc1",profe:"",imp:r2(c.importe),arch:{id:r.id,n:f.name.slice(0,80)},firma,t:nowISO()};
          await S.db.doc("nominas/"+key).set(rec);const ix=NM.docs.findIndex(d=>d.id===key);if(ix>=0)NM.docs[ix]={id:key,...rec};else NM.docs.push({id:key,...rec});
          GB.just.ok.push(`TC1 de ${mesTxt(mes)} · ${eur(c.importe)} · el cargo de la Seguridad Social aún no está en el banco: se enganchará solo al subir el extracto`);GB.just.hecho++;continue}}
      if(!m)GB.just.sin.push(`${c.tipo} · ${quien} · ${c.importe!=null?eur(c.importe):"?"} · ${c.fv?fmtFecha(c.fv):"?"}`);
      else if(c.slot==="doc"){usados.add(m.id);const tipo=c.tipo==="TC1"?"tc":"factura";
        const dPrev=docsMov(m).d,sust=!!(dPrev&&dPrev.sinNif&&!c.sinNif);
        if(dPrev&&!sust)GB.just.ya.push(`${DOC_TXT[tipo]} · ${quien} · ${eur(Math.abs(m.importe))} · ya tenía ${DOC_TXT[tipo].toLowerCase()}`);
        else{const r=await as.upload(f,{clase:"gasto"}),o={id:r.id,n:f.name.slice(0,80),t:nowISO(),tipo,...(c.sinNif?{sinNif:true}:{})};
          await S.db.doc("banco/"+m.mes).update({["movs."+m.id+".doc"]:o,["movs."+m.id+".df"]:firma});const dd=GB.docs.find(y=>y.id===m.mes);if(dd&&dd.movs[m.id])Object.assign(dd.movs[m.id],{doc:o,df:firma});
          GB.just.ok.push(`${DOC_TXT[tipo]}${c.tipo==="Factura"?" · "+f.name.replace(/\.pdf$/i,""):""}${sust?" (sustituye a la que no llevaba tu NIF)":""} → ${m.concepto.slice(0,50)} · ${eur(Math.abs(m.importe))} · ${fmtFecha(m.fv)}${c.seguro?"":" (revísalo)"}${c.sinNif?" · ⚠ NO LLEVA TU NIF: pide al vendedor la factura con tus datos fiscales":""}`)}}
      else{usados.add(m.id);
        if(docsMov(m).dEn==="just"){/* el hueco tenía la factura (versión de un solo hueco): pasa a su sitio y deja libre el del justificante */
          const o={...m.just,tipo:docReq(m)};await S.db.doc("banco/"+m.mes).update({["movs."+m.id+".doc"]:o,["movs."+m.id+".just"]:null});Object.assign(m,{doc:o,just:null});
          const dd=GB.docs.find(y=>y.id===m.mes);if(dd&&dd.movs[m.id])Object.assign(dd.movs[m.id],{doc:o,just:null})}
        if(m.just&&c.seguro&&m.jf!==firma){
          for(const x of movsTodos().filter(x=>x.just&&x.just.id===m.just.id)){await S.db.doc("banco/"+x.mes).update({["movs."+x.id+".just"]:null,["movs."+x.id+".jf"]:null,["movs."+x.id+".tpv"]:null,["movs."+x.id+".ordenante"]:"",["movs."+x.id+".obs"]:""});
            const dd=GB.docs.find(y=>y.id===x.mes);if(dd)Object.assign(dd.movs[x.id],{just:null,jf:null,tpv:null,ordenante:"",obs:""})}
          m.just=null;GB.just.fix=(GB.just.fix||0)+1}
        if(m.just){GB.just.ya.push(`${quien} · ${eur(Math.abs(m.importe))}`);
          if(!m.ordenante&&(c.ordenante||c.obs))await S.db.doc("banco/"+m.mes).update({["movs."+m.id+".ordenante"]:c.ordenante,["movs."+m.id+".obs"]:c.obs})}
        else{const r=await as.upload(f,{clase:"banco"});
          const jj={id:r.id,n:f.name.slice(0,80),t:nowISO()};
          await S.db.doc("banco/"+m.mes).update({["movs."+m.id+".just"]:jj,["movs."+m.id+".jf"]:firma,["movs."+m.id+".ordenante"]:c.ordenante||"",["movs."+m.id+".obs"]:c.obs||"",...(c.tpv?{["movs."+m.id+".tpv"]:c.tpv}:{})});
          if(c.tipo==="Liquidación TPV"){const rem=c.refs.map(x=>x.replace(/^0+/,"")).filter(x=>x.length>=8).find(x=>m.concepto.includes(x)&&movsTodos().filter(y=>y.concepto.includes(x)).length<=2);const cm=rem&&movsTodos().find(x=>x.id!==m.id&&x.cuenta===m.cuenta&&x.importe<0&&x.concepto.includes(rem)&&!x.just);
            if(cm){usados.add(cm.id);await S.db.doc("banco/"+cm.mes).update({["movs."+cm.id+".just"]:jj})}}
          GB.just.ok.push(`${c.tipo}${c.ordenante?" · "+c.ordenante:""} · ${eur(Math.abs(m.importe))} · ${fmtFecha(m.fv)}${c.obs?` · «${c.obs}»`:""}${c.tpv?` · ${c.tpv.length} operaciones con tarjeta`:""}`)}}}
    catch(e){console.error(e);GB.just.err.push(f.name)}
    if(!vuelta&&GB.just.sin.length>sinAntes){GB.just.sin.pop();reintentar.push(f)}
    GB.just.hecho++;setStatus(`Justificantes ${GB.just.hecho}/${GB.just.n}…`);if(GB.just.hecho%5===0)render()}
  setStatus("Guardado");render();
}
/* ============================================================================================
   Nóminas (07/11/2026). A3 manda cada mes NOMINAS_DE_<MES>.pdf (una página por trabajadora), LISTADO_DE_COSTES_<MES>.pdf y
   TC_1.pdf. Se suben en Gastos → «Subir documentos», junto con los justificantes y las facturas.
   - Nóminas: se parte el PDF por páginas; cada página se guarda como archivo con clase «nomina» y profe = la profesora (por
     el DNI ya conocido en config/banco.dniProfe o por el nombre de pila, que tiene que estar en EQUIPO). Se guarda
     nominas/<AAAA-MM>_<profe> = {mes, tipo:"nomina", profe, nombre, dni, liq, bruto, ded, coste, arch:{id,n}, t, mov}
     y se pone como documento (hueco «doc», tipo nómina) de la transferencia de ese líquido a su nombre (fecha valor entre
     10 días antes y 20 después de fin de mes). Si la transferencia aún no está en el banco, se engancha al subir el extracto.
   - Listado de costes: nominas/<AAAA-MM>_listado = {mes, tipo:"listado", profe:"", l:[{nombre,dni,profe,bruto,liq,ssemp,sstot,coste}], tot, arch}.
     Sirve para cuadrar (suma de transferencias = líquido total; cargo de la Seguridad Social del mes siguiente = SS total)
     y para el coste de personal de la rentabilidad por profesora.
   - Cada profesora ve sus nóminas en la pestaña «Mis nóminas». Recepción no ve ninguna (reglas). La asesoría puede abrirlas.
   ============================================================================================ */
const NM={docs:[],sub:null,ok:false,err:false};
const MES3={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,SET:9,OCT:10,NOV:11,DIC:12};
const AMT=/\d{1,3}(?:\.\d{3})*,\d{2}/g;
function nmEscuchar(){if(NM.sub||!S.db)return;const c=S.db.collection("nominas");
  NM.sub=(S.role==="profe"&&!S.pv?c.where("profe","==",S.myProfe||"-"):c).onSnapshot(s=>{NM.docs=s.docs.map(d=>({id:d.id,...d.data()}));NM.ok=true;NM.err=false;if(S.view==="gastos"||S.view==="nominas")gbRefrescar()},
    ()=>{NM.ok=true;NM.err=true;if(S.view==="nominas")gbRefrescar()})}
const nmDe=mes=>NM.docs.filter(d=>d.mes===mes&&d.tipo==="nomina").sort((a,b)=>String(a.nombre).localeCompare(String(b.nombre)));
const nmListado=mes=>NM.docs.find(d=>d.id===mes+"_listado")||null;
function profeDeNomina(nombre,dni){const map=(GB.cfg&&GB.cfg.dniProfe)||{};if(dni&&map[dni])return map[dni];
  const pila=NORM(String(nombre).split(",")[1]||"").trim().split(/\s+/)[0]||"";return EQUIPO.find(n=>NORM(n)===pila)||""}
/* Una página de nómina (líneas de pdfLineas) */
function leerNomina(lin){
  const t=lin.join("\n"),T=NORM(t),dni=(T.match(/\b\d{8}[A-Z]\b/g)||[]).find(x=>x!=="48966357R");if(!dni||!/LIQUIDO\s*A\s*PERCIBIR/.test(T))return null;
  const esNom=l=>/^[A-ZÁÉÍÓÚÑÜ' .-]+,\s*[A-ZÁÉÍÓÚÑÜ' .-]+$/.test(l.trim()),lDni=NORM(lin.find(l=>NORM(l).includes(dni))||"");
  const nombre=(lin.find(l=>esNom(l)&&lDni.includes(NORM(l.trim())))||lin.find(esNom)||"").trim();
  const iL=lin.findIndex(l=>/LIQUIDO\s*A\s*PERCIBIR/.test(NORM(l)));let liq=null;
  for(const l of lin.slice(iL,iL+4)){const m=l.match(AMT);if(m){liq=numBanco(m[m.length-1]);break}}
  const coste=numBanco((T.match(/COSTE EMPRESA:?\s*([\d.]+,\d{2})/)||[])[1]||"");
  const iR=lin.findIndex(l=>/REM\.?\s*TOTAL/.test(NORM(l)));let bruto=null,ded=null;
  if(iR>=0)for(const l of lin.slice(iR,iR+3)){const m=l.match(AMT);if(m&&m.length>=2){bruto=numBanco(m[0]);ded=numBanco(m[m.length-1]);break}}
  let mes="";const p=T.match(/MENS\s+\d{1,2}\s+([A-Z]{3})\s+(\d{2})\s+A\s+\d{1,2}\s+([A-Z]{3})\s+(\d{2})/);
  if(p&&MES3[p[3]])mes=`20${p[4]}-${String(MES3[p[3]]).padStart(2,"0")}`;
  else{const f=T.match(/\b\d{1,2}\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+(\d{4})/);if(f)mes=`${f[2]}-${String(MESES.indexOf(f[1].toLowerCase())+1).padStart(2,"0")}`}
  return {dni,nombre,liq,coste,bruto,ded,mes};
}
/* Listado de costes (resumen de nómina) */
function leerListado(pags){const lin=pags.flat(),T=NORM(lin.join(" "));
  const per=T.match(/DEL\s+\d{2}\/(\d{2})\/(\d{4})\s+AL/),mes=per?`${per[2]}-${per[1]}`:"",l=[];
  for(const x of lin){const m=NORM(x).match(/^\d{5,7}\s+(.+?)\s*(\d{8}[A-Z])\s+[A-Z]+\s+\d{2}\/\d{2}\/\d{4}\s+(.*)$/);if(!m)continue;const a=(m[3].match(AMT)||[]).map(numBanco);if(a.length<5)continue;
    const nombre=(x.match(/^\d{5,7}\s+(.+?)\s*\d{8}[A-Z]/)||[])[1]||m[1];
    l.push({nombre:nombre.trim(),dni:m[2],profe:profeDeNomina(nombre,m[2]),bruto:a[0],liq:a[a.length-4],ssemp:a[a.length-3],sstot:a[a.length-2],coste:a[a.length-1]})}
  const s=k=>r2(l.reduce((t,x)=>t+(x[k]||0),0));
  return {mes,l,tot:{bruto:s("bruto"),liq:s("liq"),ssemp:s("ssemp"),sstot:s("sstot"),coste:s("coste")}}}
async function pdfPaginas(file,idx,nombre){await cargarPdfLib();const P=window.PDFLib,src=await P.PDFDocument.load(new Uint8Array(await file.arrayBuffer())),out=await P.PDFDocument.create();
  (await out.copyPages(src,idx)).forEach(p=>out.addPage(p));return new File([await out.save()],nombre,{type:"application/pdf"})}
/* La transferencia de una nómina: su líquido exacto, con los apellidos (o nombre + primer apellido) en el concepto */
function movNomina(n,usados){if(!n.mes||n.liq==null)return null;const fin=finMes(n.mes+"-01");
  const ap=NORM(String(n.nombre).split(",")[0]).replace(/[^A-Z]/g,""),pila=NORM(String(n.nombre).split(",")[1]||"").trim().split(/\s+/)[0]||"",ap1=NORM(String(n.nombre).split(",")[0]).trim().split(/\s+/)[0]||"";
  const C=m=>NORM(m.concepto+" "+(m.ordenante||"")).replace(/[^A-Z]/g,"");
  const l=movsTodos().filter(m=>!(usados&&usados.has(m.id))&&m.importe<0&&Math.abs(-m.importe-n.liq)<0.005&&m.fv>=sumaDias(fin,-10)&&m.fv<=sumaDias(fin,20));
  return l.find(m=>ap.length>=5&&C(m).includes(ap))||l.find(m=>pila&&ap1&&C(m).includes(pila)&&C(m).includes(ap1))||null}
async function nmEnganchar(key,rec,m){const o={id:rec.arch.id,n:rec.arch.n,t:nowISO(),tipo:"nomina"},up={["movs."+m.id+".doc"]:o,["movs."+m.id+".df"]:"nom:"+key};
  if(m.cat!=="nominas"){up["movs."+m.id+".cat"]="nominas";up["movs."+m.id+".auto"]=true}
  await S.db.doc("banco/"+m.mes).update(up);const dd=GB.docs.find(y=>y.id===m.mes);if(dd&&dd.movs[m.id])Object.assign(dd.movs[m.id],{doc:o,df:"nom:"+key,cat:"nominas"});
  await S.db.doc("nominas/"+key).update({mov:{mes:m.mes,id:m.id}})}
/* Nóminas ya subidas cuya transferencia no estaba: se buscan otra vez (al subir un extracto y al abrir Gastos) */
async function tcEnlazarPendientes(){const l=NM.docs.filter(d=>d.tipo==="tc1"&&!d.mov&&d.arch);if(!l.length)return;
  for(const d of l){const ms=mesSig(d.mes),m=movsTodos().find(x=>x.importe<0&&Math.abs(-x.importe-(+d.imp||0))<0.005&&(x.cat==="ssemp"||/TGSS/i.test(x.concepto||"")&&!/AUTONOMO/i.test(x.concepto||""))&&String(x.fv||"").slice(0,7)>=ms&&!docsMov(x).d);
    if(!m)continue;const o={id:d.arch.id,n:d.arch.n,t:nowISO(),tipo:"tc"};
    try{await S.db.doc("banco/"+m.mes).update({["movs."+m.id+".doc"]:o,["movs."+m.id+".df"]:d.firma||("tc1:"+d.mes)});const dd=GB.docs.find(y=>y.id===m.mes);if(dd&&dd.movs[m.id])Object.assign(dd.movs[m.id],{doc:o,df:d.firma||("tc1:"+d.mes)});
      await S.db.doc("nominas/"+d.mes+"_tc1").update({mov:{mes:m.mes,id:m.id}});d.mov={mes:m.mes,id:m.id}}catch(_){}}}
async function nmEnlazarPendientes(){try{await tcEnlazarPendientes()}catch(_){}if(!NM.ok||NM.busy)return;const l=NM.docs.filter(d=>d.tipo==="nomina"&&!d.mov&&d.arch);if(!l.length)return;NM.busy=true;
  try{const us=new Set(NM.docs.filter(d=>d.mov).map(d=>d.mov.id));for(const d of l){const m=movNomina(d,us);if(m){us.add(m.id);try{await nmEnganchar(d.id,d,m)}catch(_){}}}}finally{NM.busy=false}}
async function paqueteA3(f,items){const T=NORM(items.map(i=>i.s).join(" "));
  if(/LIQUIDO\s*A\s*PERCIBIR/.test(T)&&/TRABAJADOR/.test(T)){await subirNominas(f);return true}
  if(/RESUMEN DE NOMINA/.test(T)&&/TOTAL\s*COST/.test(T)){await subirListado(f);return true}
  return false}
async function subirNominas(f){const J=GB.just,as=await window.claude.use("assets"),pags=await pdfLineas(f),usados=new Set(NM.docs.filter(d=>d.mov).map(d=>d.mov.id));
  const mapa={...((GB.cfg&&GB.cfg.dniProfe)||{})};let cambio=false;
  for(const [i,lin] of pags.entries()){const n=leerNomina(lin);if(!n)continue;
    if(!n.mes||n.liq==null){J.err.push(`${f.name} · página ${i+1}: no se entiende la nómina`);continue}
    const profe=profeDeNomina(n.nombre,n.dni);if(profe&&mapa[n.dni]!==profe){mapa[n.dni]=profe;cambio=true}
    const key=`${n.mes}_${profe||n.dni}`,prev=NM.docs.find(d=>d.id===key),igual=prev&&prev.arch&&Math.abs((prev.liq||0)-n.liq)<0.005;
    if(igual&&prev.mov){J.ya.push(`Nómina de ${titulo(n.nombre)} (${mesTxt(n.mes)}) · ya estaba subida`);continue}
    let arch=igual?prev.arch:null;
    if(!arch){const pf=await pdfPaginas(f,[i],`Nomina_${n.mes}_${NORM(profe||n.nombre).replace(/[^A-Z]+/g,"-")}.pdf`);const r=await as.upload(pf,{clase:"nomina",profe:profe||""});arch={id:r.id,n:pf.name}}
    const rec={mes:n.mes,tipo:"nomina",profe:profe||"",nombre:n.nombre,dni:n.dni,liq:n.liq,bruto:n.bruto,ded:n.ded,coste:n.coste,arch,t:nowISO(),mov:null};
    await S.db.doc("nominas/"+key).set(rec);const ix=NM.docs.findIndex(d=>d.id===key);if(ix>=0)NM.docs[ix]={id:key,...rec};else NM.docs.push({id:key,...rec});
    const m=movNomina(n,usados);if(m){usados.add(m.id);await nmEnganchar(key,rec,m);rec.mov={mes:m.mes,id:m.id}}
    J.ok.push(`Nómina de ${titulo(n.nombre)} (${mesTxt(n.mes)}) · ${eur(n.liq)}${profe?"":" · ⚠ no sé qué profesora es"}${m?` → transferencia del ${fmtFecha(m.fo||m.fv)}`:" · su transferencia todavía no está en el banco: se enganchará al subir el extracto"}`)}
  if(cambio){try{await S.db.doc("config/banco").set({...(GB.cfg||{}),dniProfe:mapa});GB.cfg={...(GB.cfg||{}),dniProfe:mapa}}catch(_){}}}
/* 25/11/2026: A3 manda a veces el listado de costes en Excel (listado.xls): mismas columnas que el PDF */
async function leerListadoXls(f){await cargarJs(XLSXJS);const wb=window.XLSX.read(await f.arrayBuffer(),{type:"array"}),filas=window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:""});
  const txt=filas.map(r=>r.join(" ")).join(" "),per=NORM(txt).match(/DEL\s+\d{2}\/(\d{2})\/(\d{4})\s+AL/),mes=per?`${per[2]}-${per[1]}`:"";
  const hi=filas.findIndex(r=>r.some(c=>/TRABAJADOR/i.test(String(c)))&&r.some(c=>/TOTAL\s*COST/i.test(String(c))));if(hi<0)return {mes:"",l:[],tot:{}};
  const H=filas[hi].map(c=>NORM(String(c)).replace(/\s+/g," ").trim()),c=k=>H.findIndex(h=>h===k||h.startsWith(k));
  const ci={nom:c("TRABAJADOR"),dni:c("N.I.F"),bruto:c("BRUTO"),liq:c("LIQUIDO"),ssemp:c("SS EMPRESA"),sstot:c("SS TOTAL"),coste:c("TOTAL COST")};
  const num=v=>typeof v==="number"?v:(numBanco(String(v||""))||0),l=[];
  for(const r of filas.slice(hi+1)){const dni=String(r[ci.dni]||"").trim().toUpperCase(),nombre=String(r[ci.nom]||"").trim();if(!/^\d{8}[A-Z]$/.test(dni)||!nombre)continue;
    l.push({nombre,dni,profe:profeDeNomina(nombre,dni),bruto:r2(num(r[ci.bruto])),liq:r2(num(r[ci.liq])),ssemp:r2(num(r[ci.ssemp])),sstot:r2(num(r[ci.sstot])),coste:r2(num(r[ci.coste]))})}
  const s=k=>r2(l.reduce((t,x)=>t+(x[k]||0),0));return {mes,l,tot:{bruto:s("bruto"),liq:s("liq"),ssemp:s("ssemp"),sstot:s("sstot"),coste:s("coste")}}}
async function subirListado(f){const J=GB.just,L=/\.xlsx?$/i.test(f.name)?await leerListadoXls(f):leerListado(await pdfLineas(f));
  if(!L.mes||!L.l.length){J.err.push(`${f.name} · no se entiende el listado de costes`);return}
  const key=L.mes+"_listado",prev=nmListado(L.mes);
  if(prev&&prev.tot&&Math.abs(prev.tot.coste-L.tot.coste)<0.005){J.ya.push(`Listado de costes de ${mesTxt(L.mes)} · ya estaba subido`);return}
  const as=await window.claude.use("assets"),r=await as.upload(f,{clase:"nomina",profe:""});
  const rec={mes:L.mes,tipo:"listado",profe:"",l:L.l,tot:L.tot,arch:{id:r.id,n:f.name.slice(0,80)},t:nowISO()};
  await S.db.doc("nominas/"+key).set(rec);const ix=NM.docs.findIndex(d=>d.id===key);if(ix>=0)NM.docs[ix]={id:key,...rec};else NM.docs.push({id:key,...rec});
  J.ok.push(`Listado de costes de ${mesTxt(L.mes)} · ${L.l.length} trabajadoras · líquido ${eur(L.tot.liq)} · coste empresa ${eur(L.tot.coste)}`)}
/* Gastos: cuadre de las nóminas del mes */
function vNominasMes(mes){nmEscuchar();const ns=nmDe(mes),Ls=nmListado(mes);if(!ns.length&&!Ls)return "";
  const sig=sumaDias(finMes(mes+"-01"),1).slice(0,7),ss=Ls?movsTodos().find(m=>m.mes===sig&&m.importe<0&&Math.abs(-m.importe-Ls.tot.sstot)<0.005&&(m.cat==="ssemp"||/TGSS/i.test(m.concepto))):null;
  const totN=r2(ns.reduce((s,n)=>s+(n.liq||0),0)),totT=r2(ns.filter(n=>n.mov).reduce((s,n)=>s+(n.liq||0),0));
  const falta=Ls?Ls.l.filter(x=>!ns.some(n=>n.dni===x.dni)):[];
  return `<div class="panel" style="padding:12px 14px;margin-top:12px"><b>Nóminas de ${mesTxt(mes)}</b>
    <table class="ft" style="min-width:0;width:100%;margin-top:6px"><thead><tr><th>Trabajadora</th><th style="text-align:right">Líquido</th><th style="text-align:right">Coste empresa</th><th>Transferencia</th><th></th></tr></thead><tbody>
    ${ns.map(n=>{const m=n.mov&&movsTodos().find(x=>x.id===n.mov.id);return `<tr><td>${esc(titulo(n.nombre))}${n.profe?"":` <span class="badge b-pend">sin profesora</span>`}</td><td style="text-align:right">${eur(n.liq)}</td><td style="text-align:right">${n.coste!=null?eur(n.coste):"—"}</td>
      <td>${m?`<span style="color:var(--ok)">✓</span> ${fmtFecha(m.fo||m.fv)}`:`<span class="badge b-pend">no está en el banco</span>`}</td><td><a href="#" class="btn small" data-blob="${esc(n.arch.id)}">📄 Nómina</a></td></tr>`}).join("")}
    ${falta.map(x=>`<tr><td>${esc(titulo(x.nombre))}</td><td style="text-align:right">${eur(x.liq)}</td><td style="text-align:right">${eur(x.coste)}</td><td colspan="2"><span class="badge b-pend">falta subir su nómina</span></td></tr>`).join("")}
    <tr style="font-weight:700"><td>Total</td><td style="text-align:right">${eur(Ls?Ls.tot.liq:totN)}</td><td style="text-align:right">${Ls?eur(Ls.tot.coste):"—"}</td><td colspan="2">${Math.abs(totT-(Ls?Ls.tot.liq:totN))<0.01?`<span style="color:var(--ok)">✓ Transferido todo</span>`:`<span style="color:var(--warn)">Transferido ${eur(totT)}</span>`}</td></tr></tbody></table>
    ${Ls?`<p class="note" style="margin:6px 0 0">Seguridad Social de ${mesTxt(mes)} (empresa + trabajadoras): <b>${eur(Ls.tot.sstot)}</b> · ${ss?`<span style="color:var(--ok)">✓ cargada el ${fmtFecha(ss.fo||ss.fv)}</span>`:`se cargará a finales de ${mesTxt(sig)}`} · <a href="#" data-blob="${esc(Ls.arch.id)}">Listado de costes</a></p>`:`<p class="note" style="margin:6px 0 0">Sube también el listado de costes de A3 para cuadrar el total y la Seguridad Social.</p>`}</div>`}
/* Profesoras: «Mis nóminas» */
function vMisNominas(){nmEscuchar();if(!NM.ok)return `<div class="empty">Cargando…</div>`;
  const l=NM.docs.filter(d=>d.tipo==="nomina"&&d.profe===S.myProfe).sort((a,b)=>b.mes.localeCompare(a.mes));
  return `<div class="bar"><h2>Mis nóminas</h2></div>${NM.err?`<div class="aviso pend" style="display:block">No se pueden leer las nóminas. Avisa en el centro.</div>`:""}
  <div class="panel">${l.map(n=>`<div class="row" style="padding:8px 12px"><span class="grow"><b>${esc(mesTxt(n.mes))}</b>${n.bruto!=null?`<br><span class="note">Bruto ${eur(n.bruto)} · deducciones ${eur(n.ded||0)}</span>`:""}</span><b style="font-variant-numeric:tabular-nums">${eur(n.liq)}</b><a href="#" class="btn small" data-blob="${esc(n.arch.id)}">📄 Ver la nómina</a></div>`).join("")||`<div class="empty">Todavía no hay nóminas.</div>`}</div>
  <p class="note">Las sube dirección cuando llegan de la asesoría. Solo tú (y dirección) puedes verlas.</p>`}

/* 15/11/2026 (titular): total de horas extra (producción que antes se perdía), en Gastos */
function hxEstadoDe(a,e){const c=e.cobro;if(c&&c.no)return "no";
  if(c&&c.recibo){const r=(a.recibos||[]).find(x=>x&&x.numero===c.recibo);return r&&r.estado==="pagado"?"cob":"pend"}
  if(c)return "cob";if(typeof exCobradaArgos==="function"&&exCobradaArgos(a,e))return "cob";return "pend"}
function hxProduccion(desde,hasta){const hoy=todayISO(),o={n:0,imp:0,cob:0,pend:0,no:0,sin:0,su:0,arg:0,prof:{}};
  for(const [,a] of S.alumnos){for(const e of a.extras||[]){if(!e||e.anulada||!e.fecha)continue;const m=String(e.fecha).slice(0,7);if(m<desde||m>hasta||e.fecha>hoy)continue;
    try{if(asistDe(a,e.fecha,e.hora||keyDeMin(extraIni(e)),e.profe)==="no")continue}catch(_){}
    const v=tarifaDe(a,e),st=hxEstadoDe(a,e);if(v==null){o.sin++;continue}
    if(st==="no"){o.no+=v;continue}o.n++;if(a.sueltas)o.su++;o.imp+=v;o[st]+=v;const p=e.profe||"—";(o.prof[p]=o.prof[p]||{n:0,imp:0}).n++;o.prof[p].imp+=v}}
  /* recibos de Argos que son horas extra (antes de que se apuntaran en la app): se suman si no tienen ya su hora extra apuntada con el mismo importe ese mes */
  o.arg=0;const RX=/EXTRA|SUELTA|HORA ADICIONAL|CLASE ADICIONAL/i;
  for(const [,a] of S.alumnos){const usados=new Set();
    for(const r of a.recibos||[]){if(!r||r.serie==="HX"||r.origen==="app"||r.anulado||r.estado==="anulado")continue;const m=String(r.emitido||"").slice(0,7);if(!m||m<desde||m>hasta)continue;
      if(!(RX.test(String(r.concepto||"")+" "+String(r.curso||""))||(typeof esReciboExtra==="function"&&esReciboExtra(a,r))))continue;
      const imp=+r.importe||0;if(imp<=0)continue;
      const e=(a.extras||[]).find(x=>x&&!x.anulada&&!usados.has(x)&&String(x.fecha||"").startsWith(m)&&tarifaDe(a,x)!=null&&Math.abs(tarifaDe(a,x)-imp)<0.005);if(e){usados.add(e);continue}
      const pag=r.estado==="pagado"||!!r.pagado;o.n++;o.arg++;o.imp+=imp;o[pag?"cob":"pend"]+=imp;const p="Argos (sin profesora)";(o.prof[p]=o.prof[p]||{n:0,imp:0}).n++;o.prof[p].imp+=imp}}
  for(const k of ["imp","cob","pend","no"])o[k]=r2(o[k]);return o}
function vHorasExtraRes(mes){if(!mes)return "";const y=+mes.slice(0,4),cur=+mes.slice(5,7)>=9?`${y}-09`:`${y-1}-09`;
  const M=hxProduccion(mes,mes),C=hxProduccion(cur,mes),A=hxProduccion(`${y}-01`,mes);
  const lin=(t,X)=>`<tr><td>${t}</td><td style="text-align:right">${X.n}</td><td style="text-align:right;font-variant-numeric:tabular-nums"><b>${eur(X.imp)}</b></td><td style="text-align:right;color:var(--ok)">${eur(X.cob)}</td><td style="text-align:right;color:${X.pend?"var(--warn)":"inherit"}">${eur(X.pend)}</td></tr>`;
  const pr=Object.entries(C.prof).sort((x,y)=>y[1].imp-x[1].imp);
  return `<details class="panel" style="padding:10px 14px;margin:10px 0" ${GB.hxRes?"open":""} data-gb-tog="hxRes"><summary><b>Horas extra</b> · ${esc(mesTxt(mes))}: <b>${M.n}</b> clase${M.n===1?"":"s"} · <b>${eur(M.imp)}</b> <span class="note">(cobrado ${eur(M.cob)} · pendiente ${eur(M.pend)}) · curso: ${eur(C.imp)}</span></summary>
    <p class="note" style="margin:6px 0">Horas extra y clases sueltas que se dieron (las que la profesora marcó «No vino» no cuentan), valoradas con su tarifa, más los recibos de Argos de horas extra que no están apuntadas en la app. Es producción que antes no se controlaba.</p>
    <div class="tbl"><table class="ft" style="min-width:0;width:100%"><thead><tr><th></th><th style="text-align:right">Clases</th><th style="text-align:right">Importe</th><th style="text-align:right">Cobrado</th><th style="text-align:right">Pendiente</th></tr></thead><tbody>
      ${lin(esc(mesTxt(mes)),M)}${lin(`Curso ${cur.slice(0,4)}-${+cur.slice(0,4)+1-2000} (desde septiembre)`,C)}${lin(`Año ${y}`,A)}</tbody></table></div>
    ${pr.length?`<p class="note" style="margin:8px 0 2px"><b>Por profesora, en el curso:</b> ${pr.map(([p,v])=>`${esc(p)} ${v.n} (${eur(r2(v.imp))})`).join(" · ")}</p>`:""}
    ${C.su?`<p class="note" style="margin:2px 0">De ellas, ${C.su} son clases sueltas en el curso.</p>`:""}
    ${C.arg?`<p class="note" style="margin:2px 0">${C.arg} vienen de recibos de Argos (hora extra o importe pequeño junto a la mensualidad) sin hora extra apuntada en la app.</p>`:""}
    ${C.no?`<p class="note" style="margin:2px 0">Marcadas «no se cobra» en el curso: ${eur(C.no)} (no se suman).</p>`:""}
    ${C.sin?`<p class="note" style="margin:2px 0;color:var(--warn)">${C.sin} sin tarifa de hora extra: no se pueden valorar.</p>`:""}</details>`}
try{document.addEventListener("toggle",ev=>{const t=ev.target;if(t&&t.dataset&&t.dataset.gbTog)GB[t.dataset.gbTog]=t.open;if(t&&t.dataset&&t.dataset.dqcoin){if(t.open)DQ.coin=t.dataset.dqcoin;else if(DQ.coin===t.dataset.dqcoin)DQ.coin=null}},true)}catch(_){}
function vJustRes(){const J=GB.just;if(!J)return "";const lista=(l,t,col)=>l.length?`<details ${col?"open":""} style="margin-top:4px"><summary>${t} (${l.length})</summary><ul style="margin:4px 0 0 18px;padding:0">${l.map(x=>`<li class="note"${col?` style="color:var(${col})"`:""}>${esc(x)}</li>`).join("")}</ul></details>`:"";
  return `<div class="panel" style="padding:12px 14px;margin-bottom:12px"><b>Justificantes del banco</b> ${J.hecho<J.n?`<span class="note">leyendo ${J.hecho} de ${J.n}…</span>`:""}
    ${J.fix?`<p class="note" style="margin:4px 0 0">${J.fix} justificante${J.fix===1?"":"s"} que estaba${J.fix===1?"":"n"} en un movimiento equivocado se ha${J.fix===1?"":"n"} recolocado.</p>`:""}${lista(J.ok,"Adjuntados a su movimiento","")}${lista(J.ya,"Ya estaban subidos: no se han duplicado","")}${lista(J.sin,"Sin movimiento en los extractos subidos (sube antes el extracto de ese mes)","--warn")}${lista(J.err,"No se han podido leer","--bad")}
    ${J.hecho>=J.n?`<button class="btn small" data-gb="justno" style="margin-top:6px">Cerrar</button>`:""}</div>`}

/* ============================================================================================
   Fase 2 · Informe mensual para dirección (31/10/2026). Gastos → «Informe del mes».
   Ingresos = todo lo cobrado a alumnos según Argos (cualquier forma de pago) + otros ingresos del banco, gastos por categoría, resultado, cobros del mes según Argos, pendiente de cobro,
   caja por días y cuadre banco–Argos. Se imprime (o se guarda en PDF) y se descarga en Excel.
   ============================================================================================ */
function datosInforme(mes){
  const movs=movsTodos().filter(m=>m.mes===mes),sum=f=>r2(movs.filter(f).reduce((s,m)=>s+m.importe,0));
  const IA=ingresosActividad(mes,movs),co=IA.co,ingBanco=IA.formas,ingOtros=IA.otrosBanco?[["Otros ingresos del banco (no son cobros de alumnos)",IA.otrosBanco]]:[];
  const gastos=CATS.filter(([,,t])=>t==="g").map(([k,l])=>[l,r2(-sum(m=>m.cat===k))]).filter(x=>x[1]);
  const fuera=CATS.filter(([k,,t])=>t==="x"&&k!=="deposito").map(([k,l])=>[l,sum(m=>m.cat===k)]).filter(x=>x[1]);
  const totIng=IA.total,totGas=r2(gastos.reduce((s,x)=>s+x[1],0));
  /* recibos según Argos */
  const fin=mes+"-31",emit=[],pend=[];
  for(const [id,a] of S.alumnos)for(const r of a.recibos||[]){if(!r||r.importe==null)continue;const e=String(r.emitido||"");
    if(e.startsWith(mes))emit.push({a,r});if(r.estado!=="pagado"&&e<=fin)pend.push({id,a,r})}
  const porForma={};for(const {r} of emit.filter(x=>x.r.estado==="pagado")){const f=r.forma||"Sin indicar";porForma[f]=r2((porForma[f]||0)+(+r.importe||0))}
  const pendAl=new Map();for(const x of pend){const k=x.id;if(!pendAl.has(k))pendAl.set(k,{a:x.a,id:k,rs:[]});pendAl.get(k).rs.push(x.r)}
  const pendL=[...pendAl.values()].map(x=>({nombre:titulo(x.a.nombre||""),rs:x.rs.map(r=>({numero:r.numero||"",emitido:r.emitido||"",importe:+r.importe||0})),tot:r2(x.rs.reduce((s,r)=>s+(+r.importe||0),0))})).sort((u,v)=>v.tot-u.tot);
  const cobros=[];for(const [,a] of S.alumnos)for(const r of a.recibos||[])if(r&&r.estado==="pagado"&&String(r.pagado||"").startsWith(mes))
    cobros.push({numero:r.numero||"",emitido:String(r.emitido||"").slice(0,10),pagado:String(r.pagado||"").slice(0,10),nombre:titulo(a.nombre||""),concepto:r.concepto||"",importe:+r.importe||0,forma:r.forma||""});
  cobros.sort((x,y)=>x.pagado.localeCompare(y.pagado)||x.numero.localeCompare(y.numero));
  /* caja por días */
  const an=anulados(),dias=[...new Set(GC.docs.filter(d=>String(d.dia).startsWith(mes)).map(d=>d.dia))].sort();
  const caja=dias.map(dia=>{const ds=deDia(dia),cob=ds.filter(d=>d.tipo==="cobro"&&!an.has(d.id)),f=k=>r2(cob.filter(d=>d.forma===k).reduce((s,d)=>s+(+d.total||0),0));
    const ap=ds.filter(d=>d.tipo==="apertura")[0],ci=ds.filter(d=>d.tipo==="cierre").pop(),apu=ds.filter(d=>d.tipo==="apunte"&&!an.has(d.id));
    return {dia,fondo:ap?+ap.fondo:null,ef:f("efectivo"),tar:f("tarjeta"),biz:f("bizum"),tra:f("transferencia"),bec:f("beca"),n:cob.length,
      ent:r2(apu.filter(d=>+d.signo>0).reduce((s,d)=>s+(+d.importe||0),0)),sal:r2(apu.filter(d=>+d.signo<0).reduce((s,d)=>s+(+d.importe||0),0)),
      ret:r2(ds.filter(d=>d.tipo==="retirada").reduce((s,d)=>s+(+d.importe||0),0)),contado:ci?+ci.contado:null,desc:ci?+ci.descuadre:null}});
  const b=k=>sum(m=>m.cat===k);
  const cuadre=[["Tarjeta (TPV)",b("tpv"),r2(co.tarjeta)],["Bizum",b("bizum"),r2(co.bizum)],["Transferencia",b("transf"),r2(co.transferencia)]],E=semanasEfectivo(mes);
  const retTit=r2(-sum(m=>m.cat==="noact"));
  return {mes,ingBanco,ingOtros,gastos,fuera,totIng,totGas,res:r2(totIng-totGas),retTit,queda:r2(totIng-totGas-retTit),pendClas:movs.filter(m=>(m.cat||"pend")==="pend").length,sinJust:movs.filter(necesitaJust).length,
    emitN:emit.length,emitT:r2(emit.reduce((s,x)=>s+(+x.r.importe||0),0)),pagN:emit.filter(x=>x.r.estado==="pagado").length,pagT:r2(emit.filter(x=>x.r.estado==="pagado").reduce((s,x)=>s+(+x.r.importe||0),0)),
    porForma,pendL,pendT:r2(pendL.reduce((s,x)=>s+x.tot,0)),caja,cuadre,IA,E,cobros,prueba:cajaPrueba(),gen:todayISO(),ventas:ventasMes(mes),
    movs:movs.sort((x,y)=>String(x.fv).localeCompare(String(y.fv))).map(m=>({id:m.id,mes:m.mes,ck:m.cat||"pend",fv:m.fv||"",fo:m.fo||"",cuenta:m.cuenta||"",concepto:m.concepto||"",importe:m.importe,cat:catTxt(m.cat),quien:[m.ordenante?titulo(String(m.ordenante).toLowerCase()):"",m.obs||""].filter(Boolean).join(" · "),...(()=>{const {j,d}=docsMov(m),f=faltas(m);return {just:j?{id:j.id,n:j.n||""}:null,doc:d?{id:d.id,n:d.n||"",tipo:d.tipo||docReq(m)||"otro"}:null,dreq:docReq(m),fj:f.j,fd:f.d,sf:!d&&sinFac(m)}})(),falta:necesitaJust(m),nota:m.nota||""}))};
}
/* Dirección: lo que se envió a la asesoría, tal cual lo ve ella */
const aseD=x=>{if(!x)return null;try{return x.Dj?JSON.parse(x.Dj):x.D}catch(_){return null}};
const aseDocsDir=()=>Object.entries(GB.ase||{}).map(([id,x])=>({id,t:x.t,por:x.por,D:aseD(x)})).filter(d=>d.D).sort((x,y)=>y.id.localeCompare(x.id));
/* 12/11/2026: lo enviado a la asesoría es una copia del momento del envío. Si después se sube un justificante o una factura,
   se cambia una categoría o aparecen movimientos, la copia queda atrasada: se avisa en el informe y en «Ver lo enviado». */
function aseCambios(mes){const x=GB.ase&&GB.ase[mes];if(!x)return null;const E=aseD(x);if(!E)return null;
  /* se empareja por id y, si no, por fecha + importe + concepto (14/11/2026: tras reenviar seguía saliendo «atrasado») */
  const A=paraAsesoria(datosInforme(mes)),ant=new Map(),out=[],kc=m=>`${m.fv}|${(+m.importe||0).toFixed(2)}|${String(m.concepto||"").trim()}`;
  for(const m of E.movs||[])ant.set(m.id||kc(m),m);const porK=new Map();for(const [k,m] of ant)porK.set(kc(m),k);
  const fid=o=>o&&o.id||"";
  for(const m of A.movs||[]){let k=ant.has(m.id)?m.id:porK.get(kc(m));const o=k!=null?ant.get(k):null,c=`${fmtFecha(m.fv)} ${String(m.concepto).slice(0,40)}`;if(k!=null){ant.delete(k);porK.delete(kc(o||m))}
    if(!o){out.push(`${c}: movimiento nuevo`);continue}
    const q=[];if(fid(m.just)!==fid(o.just))q.push(m.just?"justificante subido":"justificante quitado");
    if(fid(m.doc)!==fid(o.doc))q.push(m.doc?`${dLb(m).toLowerCase()} subida`:`${dLb(o).toLowerCase()} quitada`);
    if(m.cat!==o.cat)q.push(`categoría: ${m.cat}`);if(Math.abs((+m.importe||0)-(+o.importe||0))>0.005)q.push("importe");
    if(q.length)out.push(`${c}: ${q.join(", ")}`)}
  for(const [,o] of ant)out.push(`${fmtFecha(o.fv)} ${String(o.concepto).slice(0,40)}: ya no está`);
  return out}
const aseAvisoCambios=mes=>{const l=aseCambios(mes);if(!l||!l.length)return "";
  return `<div class="aviso pend noprint" style="display:block;margin:8px 0"><b>Lo que tiene la asesoría de ${mesTxt(mes)} está atrasado:</b> desde que se envió (${fmtFecha(String(GB.ase[mes].t).slice(0,10))}) ha${l.length===1?"":"n"} cambiado ${l.length} cosa${l.length===1?"":"s"}. La asesoría sigue viendo lo de antes hasta que lo vuelvas a enviar.
    <details style="margin-top:4px"><summary class="note">Ver qué ha cambiado</summary><ul style="margin:4px 0 0 18px;padding:0">${l.slice(0,40).map(t=>`<li class="note">${esc(t)}</li>`).join("")}${l.length>40?`<li class="note">… y ${l.length-40} más</li>`:""}</ul></details>
    <button class="btn small primary" data-gb="infase" data-mes="${esc(mes)}" style="margin-top:6px">Volver a enviar ${mesTxt(mes)}</button></div>`};
function vAseDir(){const docs=aseDocsDir(),key=GB.verAse,V=aseVista(key,docs);
  if(!V){GB.verAse="";return vInforme()}
  return `<div class="bar noprint"><h2>Lo que ve la asesoría</h2><span class="legend"><button class="btn small" data-gb="veraseno">← Volver al informe</button></span></div>
  <div class="aviso info noprint" style="display:block">Es exactamente lo que ve la asesoría al entrar: la copia que se envió, no los datos de ahora. Si cambias algo de un mes, vuelve a enviarlo.</div>
  ${vAyudaAse(false)}
  ${(/-T\d$/.test(key)?mesesTrim(key):[key]).map(aseAvisoCambios).join("")}
  <div class="bar noprint" style="gap:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 210px">Periodo<select id="gb-asep">${opcionesPeriodo(docs,key)}</select></label>
    <button class="btn primary" data-gb="infprint">Imprimir o guardar en PDF</button><button class="btn" data-gb="asexls">Descargar su Excel</button><span class="note">${V.info}</span></div>
  ${vImpuestos(/-T\d$/.test(key)?key:trimDe(key))}${vRetAlq(V.D.alq||[],false,null,key)}${informeCuerpo(V.D,key)}${aseMovs(V.D)}`}
function vInforme(){
  cajaEscuchar();aseEscuchar();if(GB.verAse)return vAseDir();const ms=mesesBanco(),mes=GB.mes||ms[0]||todayISO().slice(0,7),D=datosInforme(mes),x=GB.ase&&GB.ase[mes];
  return `<div class="bar noprint"><h2>Informe del mes</h2><span class="legend"><button class="btn small" data-gb="infno">← Volver a Gastos</button></span></div>
  <div class="bar noprint" style="gap:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 180px">Mes<select id="gb-mes">${(ms.length?ms:[mes]).map(m=>`<option value="${m}" ${m===mes?"selected":""}>${mesTxt(m)}</option>`).join("")}</select></label>
    <button class="btn primary" data-gb="infprint">Imprimir o guardar en PDF</button><button class="btn" data-gb="infxls">Descargar Excel</button>
    <button class="btn" data-gb="infase" title="Deja este informe, los movimientos del banco con sus justificantes y los cobros del mes a la vista de la asesoría (usuario de solo lectura)">${x?"Volver a enviar a la asesoría":"Enviar a la asesoría"}</button>
    ${x?`<span class="note">Enviado el ${fmtFecha(String(x.t).slice(0,10))} a las ${String(x.t).slice(11,16)}${x.por?` por ${esc(x.por)}`:""}</span><button class="btn" data-gb="verase">Ver lo enviado</button>`:""}</div>${x?aseAvisoCambios(mes):""}<div class="noprint">${vImpuestos(trimDe(mes))}${vRetAlq(pdTry(()=>alqRetMes(mes),[]),true,mes)}</div>`+informeCuerpo(D,mes);
}
/* Copia para la asesoría (decisión de la titular, 31/10/2026): sin nada de lo que no es de la actividad (ni movimientos ni
   total ni «Queda en la academia») y con los ingresos solo por lo que entra en el banco: tarjeta (TPV), Bizum, transferencias,
   efectivo ingresado en el cajero (por fecha del ingreso) y otros ingresos del banco. Sin efectivo de Argos, caja ni recibos
   pagados en contado. */
function paraAsesoria(D){return {...paraAsesoria0(D),alq:pdTry(()=>alqRetMes(D.mes),[])}}
function paraAsesoria0(D){const nA=catTxt("noact"),cu=Object.fromEntries((D.cuadre||[]).map(([l,b])=>[l,b]));
  const ingBanco=[["Cobros con tarjeta (TPV)",cu["Tarjeta (TPV)"]||0],["Cobros por Bizum",cu["Bizum"]||0],["Cobros por transferencia",cu["Transferencia"]||0],["Efectivo ingresado en el cajero",D.E?D.E.ing:0]].filter(x=>x[1]);
  const ingOtros=D.IA&&D.IA.otrosBanco?[["Otros ingresos del banco",D.IA.otrosBanco]]:[];
  const totIng=r2([...ingBanco,...ingOtros].reduce((s,x)=>s+x[1],0)),res=r2(totIng-D.totGas);
  const movs=(D.movs||[]).filter(m=>m.cat!==nA);
  return {...D,ase:true,ingBanco,ingOtros,totIng,res,retTit:0,queda:res,IA:null,E:null,caja:[],porForma:{},fuera:(D.fuera||[]).filter(x=>x[0]!==nA),
    cobros:(D.cobros||[]).filter(c=>/tarj|tpv|dat[aá]fono|bizum|transf/i.test(c.forma)),movs,sinJust:movs.filter(m=>m.falta).length}}
/* ============================================================================================
   Facturas de venta (01/11/2026). Noviembre y diciembre de 2026 las emite Argos: se suben aquí el PDF con todas las facturas
   del mes (una por página) y el listado «Facturas» de Argos. Se guardan en ventas/<AAAA-MM> (mes de la fecha de la factura) =
   {mes, l:[{n, f, c, nif, fp, tot, pdf, pg}], pdfs:[{id,n}], lis:[{id,n}], t, por}. Los PDF van a archivos con clase «ventas».
   El informe y la copia de la asesoría llevan el listado numerado y el .zip (una factura por PDF, partiendo el PDF de Argos).
   ============================================================================================ */
const PDFLIBJS="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js";
const VT={docs:[],sub:null,res:null};
function ventasEscuchar(){if(VT.sub||!S.db)return;VT.sub=S.db.collection("ventas").onSnapshot(s=>{VT.docs=s.docs.map(d=>({id:d.id,...d.data()}));if(S.view==="gastos"||(S.view==="tarifas"&&GT.fac))gbRefrescar()},()=>{})}
function ventasMes(mes){ventasEscuchar();const d=VT.docs.find(x=>x.id===mes),l=[...((d&&d.l)||[]),...feVentasMes(mes)];return l.length?{l:l.sort((a,b)=>a.n.localeCompare(b.n)),pdfs:(d&&d.pdfs)||[],lis:(d&&d.lis)||[]}:null}
/* Texto de cada página en líneas (juntando trozos por altura y separando solo cuando hay hueco) */
async function pdfLineas(file){await cargarJs(PDFJS);window.pdfjsLib.GlobalWorkerOptions.workerSrc=PDFJS_W;
  const doc=await window.pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise,pags=[];
  for(let n=1;n<=doc.numPages;n++){const tc=await (await doc.getPage(n)).getTextContent(),L=[];
    for(const i of tc.items){if(!i.str||!i.str.trim())continue;const y=Math.round(i.transform[5]);let l=L.find(l=>Math.abs(l.y-y)<=2);if(!l){l={y,it:[]};L.push(l)}l.it.push(i)}
    pags.push(L.sort((a,b)=>b.y-a.y).map(l=>{let s="",fin=null;for(const i of l.it.sort((a,b)=>a.transform[4]-b.transform[4])){const x=i.transform[4];if(fin!=null&&x-fin>Math.max(1.2,(i.height||8)*.25))s+=" ";s+=i.str;fin=x+(i.width||0)}return s.replace(/\s+/g," ").trim()}))}
  return pags}
/* Argos parte algunas letras («C LAUDIA», «C ontado»): se juntan */
const arreglaArgos=t=>String(t||"").replace(/C (?=[A-Za-zÁÉÍÓÚÑáéíóúñ])/g,"C").replace(/\b([A-ZÁÉÍÓÚÑ]) (?=[a-záéíóúñ])/g,"$1").replace(/\s+/g," ").trim();
/* pdf.js mete espacios falsos tras algunas letras en los PDF de Argos («CABEZ A», «GONZ ALEZ»). Si el nombre, sin espacios,
   coincide con un alumno, se usa el de la ficha; si no, se juntan las letras sueltas tras una Z. */
const sinEsp=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z]/g,"").toUpperCase();
function limpiarCliente(c){const k=sinEsp(c);if(k.length>5)for(const [,a] of S.alumnos||[])if(sinEsp(a.nombre)===k)return String(a.nombre).replace(/\s+/g," ").trim();
  return String(c||"").replace(/Z ([AO])(?=\s|$)/g,"Z$1").replace(/\s+/g," ").trim()}
const vtNum=s=>+String(s).replace(/\./g,"").replace(",",".");
const isoES=s=>{const m=String(s).match(/(\d\d)\/(\d\d)\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:""};
function leerFacturaArgos(ls){const t=ls.join("\n"),num=(t.match(/\b(F[A-Z0-9]*\/\d+)\b/)||[])[1];if(!num||!/Cliente:/.test(t))return null;
  const iC=ls.findIndex(l=>/^Cliente:/.test(l));let c=ls[iC].replace(/^Cliente:\s*/,"");for(let k=iC+1;!c&&k<ls.length;k++)if(!/@/.test(ls[k]))c=ls[k];
  const nifs=[...t.matchAll(/NIF:\s*([0-9A-Z]{8,9})?/g)].map(m=>m[1]||""),iF=ls.findIndex(l=>/^Forma de pago:/.test(l));
  const fp=iF>=0?arreglaArgos(ls[iF].replace(/^Forma de pago:\s*/,"")||ls[iF+1]||""):"",tot=(t.match(/Total\s*([\d.]+,\d\d)\s*€/)||[])[1];
  /* líneas de concepto con el nombre del alumno (la factura puede ir a nombre del padre o la madre): sirven para casarla con el recibo */
  const iH=ls.findIndex(l=>/Concepto/i.test(arreglaArgos(l))&&/Alumno/i.test(arreglaArgos(l))),iT=iH<0?-1:ls.findIndex((l,k)=>k>iH&&/^(Tipo|Exento|Total)\b/i.test(arreglaArgos(l).trim()));
  const al=iH<0?"":ls.slice(iH+1,iT<0?iH+6:iT).map(l=>arreglaArgos(l).replace(/\s*\d+,\d+\s+-?[\d.]+,\d\d\s*€.*$/,"").trim()).filter(Boolean).join(" | ").slice(0,200);
  return {n:num,f:isoES((t.match(/(\d\d\/\d\d\/\d{4})/)||[])[1]),c:arreglaArgos(c),nif:nifs.length>1?nifs[nifs.length-1]:"",fp,tot:tot?vtNum(tot):null,al}}
/* Listado «Facturas» de Argos: número, titular, fecha, estado y total */
function leerListadoArgos(pags){const t=pags.map(p=>p.join("\n")).join("\n"),out=[];
  const re=/(F[A-Z0-9]*\/\d+)\s+([\s\S]*?)\s+(\d\d\/\d\d\/\d{4})\s+([A-Za-zÁÉÍÓÚáéíóú ]+?)\s+(-?[\d.]+,\d\d)/g;let m;
  while((m=re.exec(t)))out.push({n:m[1],c:arreglaArgos(m[2].replace(/\n/g," ")),f:isoES(m[3]),est:m[4].trim(),tot:vtNum(m[5])});return out}
async function subirVentas(files){const R={meses:{},avisos:[],err:""};VT.res={cargando:true};render();
  try{const as=await window.claude.use("assets"),fac=[],lis=[],pdfs=[],liss=[];
    for(const f of files){let pags;try{pags=await pdfLineas(f)}catch(e){R.avisos.push(`${f.name}: no se ha podido leer el PDF`);continue}
      const esLis=pags.some(p=>p.some(l=>/Número\s*Titular\s*Fecha\s*Estado\s*Total/.test(l)))&&!pags.some(p=>p.some(l=>/^Cliente:/.test(l)));
      if(esLis){const l=leerListadoArgos(pags);if(!l.length){R.avisos.push(`${f.name}: no encuentro facturas en el listado`);continue}
        const up=await as.upload(f,{clase:"ventas"});liss.push({id:up.id,n:f.name.slice(0,80),meses:[...new Set(l.map(x=>x.f.slice(0,7)))]});lis.push(...l)}
      else{const l=pags.map((p,i)=>{const x=leerFacturaArgos(p);return x?{...x,pg:i}:null});const ok=l.filter(Boolean);if(!ok.length){R.avisos.push(`${f.name}: no parece el PDF de facturas de Argos`);continue}
        if(ok.length<l.length)R.avisos.push(`${f.name}: ${l.length-ok.length} páginas sin factura reconocible`);
        const up=await as.upload(f,{clase:"ventas"});pdfs.push({id:up.id,n:f.name.slice(0,80),meses:[...new Set(ok.map(x=>x.f.slice(0,7)))]});fac.push(...ok.map(x=>({...x,pdf:up.id})))}}
    const porN=new Map();for(const x of fac)porN.set(x.n,{...x});
    for(const x of lis){const y=porN.get(x.n);if(y){y.c=x.c||y.c;if(y.tot==null)y.tot=x.tot;if(Math.abs((y.tot||0)-x.tot)>0.005)R.avisos.push(`${x.n}: el PDF dice ${eur(y.tot)} y el listado ${eur(x.tot)}`)}else porN.set(x.n,{n:x.n,f:x.f,c:x.c,nif:"",fp:"",tot:x.tot})}
    if(fac.length&&lis.length){const sl=new Set(lis.map(x=>x.n));const sinL=fac.filter(x=>!sl.has(x.n)).length,sinP=lis.filter(x=>!fac.some(y=>y.n===x.n)).length;if(sinL)R.avisos.push(`${sinL} facturas del PDF no están en el listado`);if(sinP)R.avisos.push(`${sinP} facturas del listado no están en el PDF`)}
    for(const x of porN.values())x.c=limpiarCliente(x.c);
    const ms=[...new Set([...porN.values()].map(x=>x.f.slice(0,7)).filter(Boolean))].sort();
    for(const mes of ms){const nuevas=[...porN.values()].filter(x=>x.f.startsWith(mes)),ya=VT.docs.find(d=>d.id===mes)||{},m=new Map((ya.l||[]).map(x=>[x.n,x]));
      for(const x of nuevas)m.set(x.n,{...(m.get(x.n)||{}),...x,tot:x.tot??(m.get(x.n)||{}).tot??0});
      const l=[...m.values()].sort((a,b)=>a.n.localeCompare(b.n)),pd=[...(ya.pdfs||[]),...pdfs.filter(p=>p.meses.includes(mes)).map(({id,n})=>({id,n}))],li=[...(ya.lis||[]),...liss.filter(p=>p.meses.includes(mes)).map(({id,n})=>({id,n}))];
      await S.db.doc("ventas/"+mes).set({mes,l,pdfs:pd.filter((x,i)=>pd.findIndex(y=>y.id===x.id)===i),lis:li.filter((x,i)=>li.findIndex(y=>y.id===x.id)===i),t:nowISO(),por:quienSoy()});
      R.meses[mes]={n:l.length,tot:r2(l.reduce((s,x)=>s+(+x.tot||0),0)),huecos:huecosNum(l.map(x=>x.n))}}
    if(!ms.length&&!R.avisos.length)R.err="No he encontrado facturas en esos archivos.";}
  catch(e){console.warn(e);R.err=/perm/i.test(String(e&&((e.fb||"")+" "+e.message)))?"Faltan permisos: hay que publicar las reglas nuevas en Firebase.":"No se han podido guardar las facturas. Inténtalo de nuevo."}
  VT.res=R;render()}
/* Huecos en la numeración (por serie, p. ej. FA26ES/) */
function huecosNum(ns){const por={};for(const n of ns){const m=String(n).match(/^(.*?)(\d+)$/);if(!m)continue;(por[m[1]]=por[m[1]]||[]).push({v:+m[2],w:m[2].length})}const out=[];
  for(const [pre,l] of Object.entries(por)){l.sort((a,b)=>a.v-b.v);for(let i=1;i<l.length;i++)for(let k=l[i-1].v+1;k<l[i].v&&out.length<50;k++)out.push(pre+String(k).padStart(l[i].w,"0"))}return out}
function vVentasRes(){const R=VT.res;if(!R)return "";if(R.cargando)return `<div class="panel" style="padding:12px 14px;margin-bottom:12px">Leyendo las facturas…</div>`;
  return `<div class="panel" style="padding:12px 14px;margin-bottom:12px"><b>Facturas de venta</b>${R.err?`<p style="color:var(--bad)">${esc(R.err)}</p>`:""}
    ${Object.entries(R.meses).map(([m,x])=>`<p style="margin:6px 0 0">${esc(mesTxt(m))}: <b>${x.n} facturas</b> por ${eur(x.tot)}${x.huecos.length?` · <span style="color:var(--warn)">faltan números: ${esc(x.huecos.slice(0,10).join(", "))}${x.huecos.length>10?"…":""}</span>`:" · numeración sin huecos"}</p>`).join("")}
    ${R.avisos.length?`<ul style="margin:6px 0 0 18px">${R.avisos.map(a=>`<li class="note" style="color:var(--warn)">${esc(a)}</li>`).join("")}</ul>`:""}
    <div class="row" style="margin-top:6px"><button class="btn small" data-vt="cerrar">Cerrar</button><span class="note">Las verás en el Informe del mes y, al enviarlo, la asesoría también.</span></div></div>`}
function seccionVentas(D){const V=D.ventas;if(!V||!V.l.length)return "";const tot=r2(V.l.reduce((s,f)=>s+(+f.tot||0),0)),hu=huecosNum(V.l.map(f=>f.n));
  const pf={};if(!D.ase)for(const f of V.l){const k=f.fp||"Sin indicar";pf[k]=r2((pf[k]||0)+(+f.tot||0))}
  return `<div class="bar" style="margin-top:14px;align-items:baseline"><h3 style="margin:0">Facturas de venta</h3><span class="legend noprint"><button class="btn small primary" data-zipv="1">Descargar las ${V.l.length} facturas de venta (.zip)</button></span></div>
    <p class="note" style="margin:0 0 4px">${V.l.length} facturas, de ${esc(V.l[0].n)} a ${esc(V.l[V.l.length-1].n)}, por ${eur(tot)} · exentas de IVA${hu.length?` · <b style="color:var(--warn)">faltan números: ${esc(hu.slice(0,10).join(", "))}${hu.length>10?"…":""}</b>`:" · numeración correlativa sin huecos"}.${Object.keys(pf).length?` Por forma de pago: ${Object.entries(pf).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${esc(k)} ${eur(v)}`).join(" · ")}.`:""}</p>
    ${(V.lis||[]).length?`<p class="note noprint" style="margin:0 0 4px">Listado de Argos: ${V.lis.map(x=>`<a href="#" data-blob="${esc(x.id)}">📎 ${esc(x.n)}</a>`).join(" · ")}</p>`:""}
    <details${D.ase?" open":""}><summary class="noprint">Ver el listado numerado</summary><table class="ft inf" style="min-width:0;width:100%"><thead><tr><th>Nº factura</th><th>Fecha</th><th>Cliente</th><th>NIF</th>${D.ase?"":"<th>Forma de pago</th>"}<th style="text-align:right">Total</th></tr></thead><tbody>
    ${V.l.map(f=>`<tr><td style="white-space:nowrap">${esc(f.n)}</td><td style="white-space:nowrap">${fmtFecha(f.f)}</td><td>${esc(f.c)}</td><td>${esc(f.nif||"")}</td>${D.ase?"":`<td>${esc(f.fp||"")}</td>`}<td style="text-align:right">${eur(f.tot)}</td></tr>`).join("")}
    <tr style="font-weight:700"><td colspan="${D.ase?4:5}">Total</td><td style="text-align:right">${eur(tot)}</td></tr></tbody></table></details>`}
const cargarPdfLib=()=>window.PDFLib?Promise.resolve():new Promise((ok,ko)=>{const x=document.createElement("script");x.src=PDFLIBJS;x.onload=()=>ok();x.onerror=()=>ko(new Error("pdflib"));document.head.appendChild(x)});
const b64aBytes=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u};
async function zipVentas(D,key,btn){const V=D.ventas;if(!V||!V.l.length)return;const F=window.__fb;if(!F||!F.blob){toast("No se pueden descargar los archivos.");return}
  const txt=btn?btn.textContent:"";try{await cargarZip();await cargarPdfLib()}catch(_){toast("No se ha podido cargar el compresor. Comprueba la conexión.");return}
  const zip=new window.JSZip(),docs=new Map(),limpio=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40);let ok=0,mal=0;
  for(const [i,f] of V.l.entries()){if(btn)btn.textContent=`Preparando ${i+1} de ${V.l.length}…`;
    try{if(f.app){zip.file(`facturas/${f.n.replace(/\//g,"-")}_${limpio(f.c)}.pdf`,await fePdf(f.app));ok++;continue}if(f.pdf==null||f.pg==null)throw new Error("sin pdf");if(!docs.has(f.pdf)){const u=await F.blob(f.pdf);docs.set(f.pdf,await window.PDFLib.PDFDocument.load(b64aBytes(u.slice(u.indexOf(",")+1))))}
      const src=docs.get(f.pdf),out=await window.PDFLib.PDFDocument.create(),[pg]=await out.copyPages(src,[f.pg]);out.addPage(pg);
      zip.file(`facturas/${f.n.replace(/\//g,"-")}_${limpio(f.c)}.pdf`,await out.save());ok++}catch(e){console.warn(e);mal++}}
  for(const x of V.lis||[]){try{const u=await F.blob(x.id);zip.file(`listado-argos/${x.n.replace(/[^\w.-]+/g,"_")}`,u.slice(u.indexOf(",")+1),{base64:true})}catch(_){}}
  const csv=["Nº factura;Fecha;Cliente;NIF;Total",...V.l.map(f=>[f.n,f.f,`"${String(f.c).replace(/"/g,"'")}"`,f.nif||"",String(f.tot).replace(".",",")].join(";"))].join("\r\n");zip.file("listado-facturas-venta.csv","\ufeff"+csv);
  const blob=await zip.generateAsync({type:"blob"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`facturas-venta-althea-${key}.zip`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},5000);
  if(btn)btn.textContent=txt;toast(mal?`Descargadas ${ok} facturas; ${mal} no se han podido sacar`:`Descargadas ${ok} facturas de venta`)}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-zipv],[data-vt]");if(!t)return;e.preventDefault();
  if(t.dataset.vt==="cerrar"){VT.res=null;render();return}if(t.disabled)return;let D=null,key="";
  if(S.role==="ase"){const V=aseVista(AS.mes,AS.docs);if(V){D=V.D;key=AS.mes}}
  else if(gbVer()&&GB.inf){if(GB.verAse){const V=aseVista(GB.verAse,aseDocsDir());D=V&&V.D;key=GB.verAse}else{key=GB.mes||mesesBanco()[0];D=key?datosInforme(key):null}}
  if(!D)return;t.disabled=true;try{await zipVentas(D,key,t)}finally{t.disabled=false}});
/* Trimestres contables (1T ene-mar, 2T abr-jun, 3T jul-sep, 4T oct-dic). Clave «AAAA-T4». */
const trimDe=m=>`${m.slice(0,4)}-T${Math.ceil(+m.slice(5,7)/3)}`;
const mesesTrim=k=>{const y=k.slice(0,4),t=+k.slice(6);return [1,2,3].map(i=>`${y}-${String((t-1)*3+i).padStart(2,"0")}`)};
const periodoTxt=k=>/-T\d$/.test(k)?`${k.slice(6)}º trimestre ${k.slice(0,4)}`:mesTxt(k);
/* Junta los informes enviados de los meses de un trimestre en uno solo */
function juntarD(l){const suma=(get,n)=>{const o=new Map();for(const [,D] of l)for(const r of get(D)||[]){const v=o.get(r[0])||Array(n).fill(0);for(let i=0;i<n;i++)v[i]=r2(v[i]+(+r[i+1]||0));o.set(r[0],v)}return [...o].map(([k,v])=>[k,...v])};
  const ult=l[l.length-1][1],tot=k=>r2(l.reduce((s,[,D])=>s+(+D[k]||0),0));
  const ingBanco=suma(D=>D.ingBanco,1),ingOtros=suma(D=>D.ingOtros,1),gastos=suma(D=>D.gastos,1),totIng=r2([...ingBanco,...ingOtros].reduce((s,x)=>s+x[1],0)),totGas=r2(gastos.reduce((s,x)=>s+x[1],0));
  const ordenG=CATS.map(([,lb])=>lb);gastos.sort((a,b)=>ordenG.indexOf(a[0])-ordenG.indexOf(b[0]));
  return {ase:true,trim:true,ingBanco,ingOtros,gastos,totIng,totGas,res:r2(totIng-totGas),retTit:0,queda:r2(totIng-totGas),IA:null,E:null,caja:[],porForma:{},
    fuera:suma(D=>D.fuera,1),cuadre:suma(D=>D.cuadre,2),pendClas:tot("pendClas"),sinJust:tot("sinJust"),emitN:tot("emitN"),emitT:tot("emitT"),pagN:tot("pagN"),pagT:tot("pagT"),
    pendL:ult.pendL||[],pendT:ult.pendT||0,prueba:l.some(([,D])=>D.prueba),gen:l.map(([,D])=>D.gen||"").sort().pop(),
    movs:l.flatMap(([,D])=>D.movs||[]).sort((a,b)=>String(a.fv).localeCompare(String(b.fv))),cobros:l.flatMap(([,D])=>D.cobros||[]),
    alq:l.flatMap(([,D])=>D.alq||[]),
    ventas:l.some(([,D])=>D.ventas&&D.ventas.l.length)?{l:l.flatMap(([,D])=>(D.ventas&&D.ventas.l)||[]).sort((a,b)=>a.n.localeCompare(b.n)),pdfs:l.flatMap(([,D])=>(D.ventas&&D.ventas.pdfs)||[]),lis:l.flatMap(([,D])=>(D.ventas&&D.ventas.lis)||[])}:null}}
/* docs = [{id:mes, D, t}] enviados. Devuelve {D, info} del mes o del trimestre */
function aseVista(key,docs){if(!/-T\d$/.test(key)){const x=docs.find(d=>d.id===key);return x?{D:x.D||{},info:`Enviado por el centro el ${fmtFecha(String(x.t).slice(0,10))} a las ${String(x.t).slice(11,16)}.`}:null}
  const ms=mesesTrim(key),l=ms.map(m=>docs.find(d=>d.id===m)).filter(Boolean);if(!l.length)return null;
  const D=juntarD(l.map(x=>[x.id,x.D||{}])),falta=ms.filter(m=>!l.some(x=>x.id===m));
  D.incluye=`Trimestre formado por ${l.map(x=>`${mesTxt(x.id)} (enviado el ${fmtFecha(String(x.t).slice(0,10))})`).join(", ")}${falta.length?`. <b>Todavía no se ha enviado ${falta.map(mesTxt).join(" ni ")}.</b>`:"."}`;
  return {D,info:falta.length?`Trimestre incompleto: falta ${falta.map(mesTxt).join(" y ")}.`:"Trimestre completo."}}
const opcionesPeriodo=(docs,sel)=>{const tr=[...new Set(docs.map(d=>trimDe(d.id)))].sort().reverse();
  return `<optgroup label="Trimestres">${tr.map(k=>`<option value="${k}" ${k===sel?"selected":""}>${periodoTxt(k)}</option>`).join("")}</optgroup><optgroup label="Meses">${docs.map(d=>`<option value="${d.id}" ${d.id===sel?"selected":""}>${mesTxt(d.id)}</option>`).join("")}</optgroup>`};
/* Detalle de gastos: cada movimiento de gasto del banco, por categoría, con su factura o justificante */
const CAT_G=new Set(CATS.filter(([,,t])=>t==="g").map(([,l])=>l));
const gastosDe=D=>(D.movs||[]).filter(m=>CAT_G.has(m.cat));
/* Celdas de documentos de un movimiento del informe (vale también para copias de la asesoría anteriores al 07/11/2026, con un solo hueco) */
const dLb=m=>DOC_TXT[(m.doc&&m.doc.tipo)||m.dreq]||"Factura";
const fJ=m=>m.fj!==undefined?m.fj:(!m.just&&m.falta),fD=m=>!!m.fd;
const archivosMov=m=>[m.just&&{...m.just,k:"justificante"},m.doc&&{...m.doc,k:(DOC_TXT[m.doc.tipo]||"documento").toLowerCase().replace(/ \(.*/,"")}].filter(Boolean);
function dCelda(m,btn){const a=(x,lb,ic)=>`<a href="#" ${btn?'class="btn small" ':""}data-blob="${esc(x.id)}" title="${esc(x.n||"")}">${ic} ${lb}</a>`,f=lb=>`<span class="badge b-pend">Falta ${minus(lb)}</span>`;
  const p=[m.just?a(m.just,"Justificante","🏦"):fJ(m)?f("justificante"):"",m.doc?a(m.doc,dLb(m),"📄"):fD(m)?f(dLb(m).replace(/ \(.*/,"")):m.sf?`<span class="badge b-off">Sin factura</span>`:""].filter(Boolean);
  return p.length?`<span style="display:inline-flex;flex-wrap:wrap;gap:4px">${p.join("")}</span>`:`<span class="note">No lleva</span>`}
const dTxt=m=>[m.just?"Justificante: "+(m.just.n||"sí"):fJ(m)?"FALTA justificante":"",m.doc?dLb(m)+": "+(m.doc.n||"sí"):fD(m)?"FALTA "+dLb(m).toLowerCase():m.sf?"Sin factura (deducible)":""].filter(Boolean).join(" · ");
function detalleGastos(D){const g=gastosDe(D);if(!g.length)return "";const conJ=g.reduce((n,m)=>n+archivosMov(m).length,0),faltan=g.filter(m=>m.falta).length;
  const por=[...CAT_G].map(c=>[c,g.filter(m=>m.cat===c)]).filter(x=>x[1].length);
  return `<div class="bar" style="margin-top:14px;align-items:baseline"><h3 style="margin:0">Detalle de gastos</h3><span class="legend noprint">${conJ?`<button class="btn small primary" data-zip="1">Descargar los ${conJ} documentos (.zip)</button>`:""}</span></div>
    <p class="note" style="margin:0 0 4px">${g.length} movimientos · ${conJ} documentos (justificantes del banco y facturas, nóminas o TC1)${faltan?` · <b>a ${faltan} les falta alguno</b>`:""}.</p>
    <table class="ft inf" style="min-width:0;width:100%"><thead><tr><th>Fecha</th><th>Concepto</th><th style="text-align:right">Importe</th>${!D.ase&&g.some(m=>m.id)?`<th class="noprint">Categoría</th>`:""}<th>Justificante y factura</th></tr></thead><tbody>
    ${por.map(([c,l])=>`<tr><td colspan="${!D.ase&&g.some(m=>m.id)?5:4}" style="font-weight:700;padding-top:8px">${esc(c)} <span class="note">(${eur(r2(-l.reduce((s,m)=>s+m.importe,0)))})</span></td></tr>`+l.map(m=>`<tr><td style="white-space:nowrap">${fmtFecha(m.fv)}</td><td style="white-space:normal">${esc(m.concepto)}${m.quien?`<br><span class="note">${esc(m.quien)}</span>`:""}</td><td style="text-align:right;white-space:nowrap">${eur(r2(-m.importe))}</td>
      ${!D.ase&&m.id?`<td class="noprint"><select data-gbcat="${esc(m.mes)}|${esc(m.id)}" aria-label="Categoría" style="max-width:190px;font-size:13px">${CATS.filter(([k])=>k!=="pend").map(([k,l])=>`<option value="${k}" ${k===m.ck?"selected":""}>${esc(l)}</option>`).join("")}</select></td>`:""}
      <td>${dCelda(m)}${!D.ase&&m.id&&m.ck==="alquiler"?(alqCfg()[claveMov(m.concepto)]?` <span class="badge b-si noprint" title="Lleva retención: sale en «Retenciones del alquiler (modelo 115)»">con retención</span> <button class="btn small noprint" data-im="alqno" data-c="${esc(claveMov(m.concepto))}" title="No lleva retención">×</button>`:` <button class="btn small noprint" data-im="alqsi" data-c="${esc(claveMov(m.concepto))}" title="Es un alquiler con retención de IRPF (modelo 115)">¿Lleva retención?</button>`):""}</td></tr>`).join("")).join("")}</tbody></table>`}
/* Todas las facturas y justificantes de gastos en un .zip (dirección y asesoría) */
const JSZIPJS="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
const cargarZip=()=>window.JSZip?Promise.resolve():new Promise((ok,ko)=>{const x=document.createElement("script");x.src=JSZIPJS;x.onload=()=>ok();x.onerror=()=>ko(new Error("zip"));document.head.appendChild(x)});
async function zipFacturas(D,mes,btn){const g=gastosDe(D).flatMap(m=>archivosMov(m).map(x=>({...m,arch:x})));if(!g.length)return;const F=window.__fb;if(!F||!F.blob){toast("No se pueden descargar los archivos.");return}
  const txt=btn?btn.textContent:"";try{await cargarZip()}catch(_){toast("No se ha podido cargar el compresor. Comprueba la conexión.");return}
  const zip=new window.JSZip(),usados=new Set();let ok=0,mal=0;
  const limpio=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,50);
  for(const [i,m] of g.entries()){if(btn)btn.textContent=`Preparando ${i+1} de ${g.length}…`;
    try{const url=await F.blob(m.arch.id),mm=/^data:([^;,]+)/.exec(url),tipo=mm?mm[1]:"",b64=url.slice(url.indexOf(",")+1);
      const ext=/pdf/.test(tipo)?"pdf":/png/.test(tipo)?"png":/jpe?g/.test(tipo)?"jpg":(String(m.arch.n).split(".").pop()||"bin").slice(0,4);
      let n=`${m.fv}_${limpio(m.cat)}_${String(r2(-m.importe)).replace(".",",")}EUR_${limpio(m.concepto)}_${limpio(m.arch.k)}`;while(usados.has(n))n+="_b";usados.add(n);
      zip.file(`${limpio(m.cat)}/${n}.${ext}`,b64,{base64:true});ok++}catch(e){console.warn(e);mal++}}
  const csv=["Fecha;Categoría;Concepto;Importe;Justificante del banco;Factura / nómina / TC1",...gastosDe(D).map(m=>[m.fv,m.cat,`"${String(m.concepto).replace(/"/g,"'")}"`,String(r2(-m.importe)).replace(".",","),m.just?m.just.n||"sí":fJ(m)?"FALTA":"no lleva",m.doc?`${dLb(m)}: ${m.doc.n||"sí"}`:fD(m)?"FALTA "+dLb(m).toLowerCase():"no lleva"].join(";"))].join("\r\n");
  zip.file("indice-gastos.csv","\ufeff"+csv);
  const blob=await zip.generateAsync({type:"blob"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`facturas-althea-${mes}.zip`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},5000);
  if(btn)btn.textContent=txt;toast(mal?`Descargados ${ok}; ${mal} no se han podido abrir`:`Descargados ${ok} documentos`)}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-zip]");if(!t)return;e.preventDefault();if(t.disabled)return;
  let D=null,mes="";
  if(S.role==="ase"){const V=aseVista(AS.mes,AS.docs);if(V){D=V.D;mes=AS.mes}}
  else if(gbVer()&&GB.inf){if(GB.verAse){const V=aseVista(GB.verAse,aseDocsDir());D=V&&V.D;mes=GB.verAse}else{mes=GB.mes||mesesBanco()[0];D=mes?datosInforme(mes):null}}
  if(!D)return;t.disabled=true;try{await zipFacturas(D,mes,t)}finally{t.disabled=false}});
/* Cuerpo del informe: lo usan dirección (datos en vivo) y la asesoría (copia enviada en asesoria/<mes>) */
function informeCuerpo(D,mes){
  const fila=(l,v,b)=>`<tr${b?' style="font-weight:700"':""}><td>${esc(l)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${eur(v)}</td></tr>`;
  const T=(cab,rows)=>`<table class="ft inf" style="min-width:0;width:100%"><thead><tr>${cab.map((c,i)=>`<th${i?' style="text-align:right"':""}>${c}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  return `<div id="informe" class="panel" style="padding:18px 20px">
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h2 style="margin:0">Althea Formación · ${esc(periodoTxt(mes))}</h2><span class="note">Informe de gestión · generado el ${fmtFecha(D.gen||todayISO())}${D.prueba?" · <b>datos de prueba</b>":""}</span></div>
    ${D.pendClas||D.sinJust?`<p class="note" style="color:var(--warn)">${D.pendClas?`${D.pendClas} movimientos del banco sin clasificar. `:""}${D.sinJust?`A ${D.sinJust} movimientos les falta el justificante del banco o la factura.`:""}</p>`:""}
    <div class="stats" style="margin-top:10px"><div class="stat"><b>${eur(D.ase?D.totIng:D.IA.cobrado)}</b><span>${D.ase?"Ingresos (banco)":"Cobrado a alumnos (todas las formas)"}</span></div><div class="stat"><b>${eur(D.totGas)}</b><span>Gastos</span></div>
      <div class="stat"><b style="color:var(${D.res>=0?"--ok":"--bad"})">${eurS(D.res)}</b><span>Resultado de la actividad</span></div>${D.ase?"":`<div class="stat"><b>${eur(D.pendT)}</b><span>Pendiente de cobro (${D.pendL.length} alumnos)</span></div>`}</div>
    <div class="split" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));align-items:start;gap:14px">
      <div><h3>Ingresos de la actividad</h3>${D.ase?T(["Entradas en el banco","Importe"],[...D.ingBanco,...D.ingOtros].map(x=>fila(x[0],x[1])).join("")+fila("Total ingresos",D.totIng,1))
        :T([D.IA&&D.IA.banco?"Cobrado a alumnos (según el banco: sin listado de Argos)":"Cobrado a alumnos (Argos, por fecha de pago)","Importe"],D.ingBanco.map(x=>fila(x[0],x[1])).join("")+(D.ingOtros.length?fila("Total cobrado a alumnos",D.IA.cobrado)+D.ingOtros.map(x=>fila(x[0],x[1])).join(""):"")+fila("Total ingresos",D.totIng,1))+`
        <p class="note">Lo que entra en el banco por TPV, Bizum, transferencias o cajero no se suma: es el mismo dinero cobrado (abajo está el cuadre).</p>`}</div>
      <div><h3>Gastos</h3>${T(["Categoría","Importe"],D.gastos.map(x=>fila(x[0],x[1])).join("")+fila("Total gastos",D.totGas,1))}</div>
    </div>
    ${detalleGastos(D)}
    ${seccionVentas(D)}
    ${D.ase&&D.incluye?`<p class="note" style="margin:4px 0 0">${D.incluye}</p>`:""}
    ${D.ase?"":`${D.retTit&&!D.ase?`<h3>Después de lo que no es de la actividad</h3>${T(["","Importe"],fila("Resultado de la academia",D.res)+fila("− Pagos y retiradas que no son de la actividad",D.retTit)+fila("Queda en la academia",D.queda,1))}
      <p class="note">El resultado es el beneficio de la academia. Los pagos personales no son gasto de la academia: son dinero que se lleva la titular, y por eso van aparte.</p>`:""}
    ${D.fuera.filter(x=>x[0]!==catTxt("noact")).length?`<p class="note">Tampoco cuentan: ${D.fuera.filter(x=>x[0]!==catTxt("noact")).map(x=>`${esc(x[0])} ${eurS(x[1])}`).join(" · ")}.</p>`:""}
    ${D.E?`<h3>Efectivo y cajero</h3>${vEfectivoSem(mes,D.E)}
    <p class="note">Por fecha del ingreso en el cajero. «Pendiente de ingresar»: efectivo cobrado en el mes que todavía no ha ido al banco; en negativo, se ha ingresado efectivo cobrado antes.</p>`:""}
    <h3>Recibos emitidos en el ${D.trim?"trimestre":"mes"} (Argos)</h3>
    ${D.ase?"":`<p class="note" style="margin:0 0 4px">Solo los recibos de este mes, se paguen cuando se paguen. Lo cobrado del mes, incluidos recibos atrasados, está arriba en Ingresos.</p>`}
    <p style="margin:0">Emitidos: <b>${D.emitN}</b> por ${eur(D.emitT)} · pagados: <b>${D.pagN}</b> por ${eur(D.pagT)} · pendientes: <b>${D.emitN-D.pagN}</b> por ${eur(r2(D.emitT-D.pagT))}</p>
    ${!D.ase&&Object.keys(D.porForma||{}).length?`<p class="note">Pagados por forma de pago: ${Object.entries(D.porForma).sort((a,b)=>b[1]-a[1]).map(([f,v])=>`${esc(f)} ${eur(v)}`).join(" · ")}</p>`:""}
    <h3>Cuadre banco – Argos</h3>${T(["","Banco","Argos","Diferencia"],D.cuadre.map(([l,bb,aa])=>`<tr><td>${l}</td><td style="text-align:right">${eur(bb)}</td><td style="text-align:right">${eur(aa)}</td><td style="text-align:right">${eurS(r2(bb-aa))}</td></tr>`).join(""))}
    <h3>Pendiente de cobro a final de ${D.trim?"trimestre":"mes"}</h3>${D.pendL.length?T(["Alumno","Recibos","Total"],D.pendL.map(x=>`<tr><td>${esc(x.nombre)}</td><td style="text-align:right" class="note">${x.rs.map(r=>esc(r.numero||String(r.emitido).slice(0,7))).join(", ")}</td><td style="text-align:right">${eur(x.tot)}</td></tr>`).join("")+`<tr style="font-weight:700"><td>Total</td><td></td><td style="text-align:right">${eur(D.pendT)}</td></tr>`):`<p class="note">Nada pendiente.</p>`}
    ${D.ase?"":`<h3>Caja${D.prueba?" (prueba)":""}</h3>`}${D.ase?"":D.caja.length?T(["Día","Inicial","Efectivo","Tarjeta","Bizum","Transf.","Entradas","Salidas","Retiradas","Contado","Descuadre"],D.caja.map(c=>`<tr><td>${fmtFecha(c.dia)}</td>${[c.fondo,c.ef,c.tar,c.biz,c.tra,c.ent,c.sal,c.ret,c.contado].map(v=>`<td style="text-align:right">${v==null?"—":eur(v)}</td>`).join("")}<td style="text-align:right;${c.desc&&Math.abs(c.desc)>0.009?"color:var(--bad);font-weight:600":""}">${c.desc==null?"—":eurS(c.desc)}</td></tr>`).join("")):`<p class="note">Sin movimientos de caja este mes.</p>`}`}
  </div>`;
}
async function informeExcel(mes,D0){
  try{await cargarJs(XLSXJS)}catch(_){toast("No se ha podido cargar el generador de Excel.");return}
  const X=window.XLSX,D=D0||datosInforme(mes),wb=X.utils.book_new(),add=(n,aoa)=>X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(aoa),n);
  add("Resumen",[["Althea Formación · "+periodoTxt(mes)],[],...(D.ase?[["INGRESOS (entradas en el banco)",""],...D.ingBanco,...D.ingOtros]:[["INGRESOS DE LA ACTIVIDAD",""],[D.IA&&D.IA.banco?"Cobrado a alumnos (según el banco: sin listado de Argos)":"Cobrado a alumnos (Argos, por fecha de pago)",""],...D.ingBanco,["Total cobrado a alumnos",D.IA.cobrado],...D.ingOtros]),["Total ingresos",D.totIng],[],["GASTOS",""],...D.gastos,["Total gastos",D.totGas],[],["RESULTADO (beneficio de la academia)",D.res],
    ...(D.ase?[]:[["− Pagos y retiradas que no son de la actividad",D.retTit],["Queda en la academia",D.queda]]),...(D.ase?[]:[[],["No cuentan",""],...D.fuera]),[],
    ...(D.ase?[]:[["Recibos emitidos (Argos)",D.emitN,D.emitT],["Recibos pagados",D.pagN,D.pagT],["Pendiente de cobro a final de mes",D.pendL.length,D.pendT],[],["CUADRE","Banco","Argos","Diferencia"],...D.cuadre.map(([l,b,a])=>[l,b,a,r2(b-a)])])]);
  if(D.E)add("Efectivo y cajero",[["Semana desde","hasta","Cobrado en contado","Ingresado en el cajero","Pendiente de ingresar (acumulado)"],...D.E.sem.map(w=>[w.desde,w.hasta,w.cob,w.ing,w.acum]),["Total del mes","",D.E.cob,D.E.ing,D.E.sinIng]]);
  add("Movimientos banco",[["Fecha valor","Fecha operativa","Cuenta","Concepto","Importe","Categoría","Quién / concepto del PDF","Justificante del banco","Factura / nómina / TC1","Nota"],
    ...D.movs.map(m=>[m.fv,m.fo,"…"+m.cuenta,m.concepto,m.importe,m.cat,m.quien,m.just?(m.just.n||"sí"):(fJ(m)?"FALTA":""),m.doc?`${dLb(m)}: ${m.doc.n||"sí"}`:(fD(m)?"FALTA "+dLb(m).toLowerCase():""),m.nota||""])]);
  add("Cobros del mes",[["Fecha de pago","Recibo","Emitido","Alumno","Concepto","Forma de pago","Importe"],...(D.cobros||[]).map(c=>[c.pagado,c.numero,c.emitido,c.nombre,c.concepto,c.forma,c.importe]),["","","","","","Total",r2((D.cobros||[]).reduce((s,c)=>s+c.importe,0))]]);
  if(D.ventas&&D.ventas.l.length)add("Facturas de venta",[["Nº factura","Fecha","Cliente","NIF",...(D.ase?[]:["Forma de pago"]),"Base","IVA (exento)","Total"],...D.ventas.l.map(f=>[f.n,f.f,f.c,f.nif||"",...(D.ase?[]:[f.fp||""]),f.tot,0,f.tot]),["","","","",...(D.ase?[]:[""]),"Total","",r2(D.ventas.l.reduce((s,f)=>s+f.tot,0))]]);
  if(!D.ase)add("Pendiente de cobro",[["Alumno","Recibos","Total"],...D.pendL.map(x=>[x.nombre,x.rs.map(r=>r.numero||r.emitido).join(", "),x.tot])]);
  if(!D.ase)add("Caja",[["Día","Inicial","Efectivo","Tarjeta","Bizum","Transferencia","Becas","Entradas","Salidas","Retiradas","Contado","Descuadre"],...D.caja.map(c=>[c.dia,c.fondo,c.ef,c.tar,c.biz,c.tra,c.bec,c.ent,c.sal,c.ret,c.contado,c.desc])]);
  X.writeFile(wb,`informe-althea-${mes}.xlsx`);
}
document.head.insertAdjacentHTML("beforeend",`<style>#informe h3{font-family:var(--display);font-size:16px;margin:16px 0 6px}
@media print{body.printinf>*:not(main){display:none!important}body.printinf main>*:not(#informe){display:none!important}body.printinf .noprint{display:none!important}
body.printinf #informe{border:0;box-shadow:none;padding:0}body.printinf{background:#fff}body.printinf #informe .stat{border:1px solid #ccc}@page{margin:14mm}}</style>`);
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-gb]");if(!t||!gbVer())return;const act=t.dataset.gb;
  if(act==="rent"){e.preventDefault();GB.rent=true;GB.inf=false;GB.prev=false;render();scrollTo(0,0);return}
  if(act==="prev"){e.preventDefault();GB.prev=true;GB.rent=false;GB.inf=false;render();scrollTo(0,0);return}
  if(act==="prevno"){e.preventDefault();GB.prev=false;render();return}
  if(act==="rentno"){e.preventDefault();GB.rent=false;render();return}
  if(act==="inf"){e.preventDefault();GB.inf=true;GB.verAse="";render();scrollTo(0,0)}else if(act==="infno"){e.preventDefault();GB.inf=false;render()}
  else if(act==="infprint"){e.preventDefault();document.body.classList.add("printinf");const fin=()=>{document.body.classList.remove("printinf");removeEventListener("afterprint",fin)};addEventListener("afterprint",fin);setTimeout(()=>window.print(),50)}
  else if(act==="infxls"){e.preventDefault();t.disabled=true;await informeExcel(GB.mes||mesesBanco()[0]);t.disabled=false}
  else if(act==="verase"){e.preventDefault();GB.verAse=GB.mes||mesesBanco()[0];render();scrollTo(0,0)}
  else if(act==="veraseno"){e.preventDefault();GB.verAse="";render();scrollTo(0,0)}
  else if(act==="asexls"){e.preventDefault();const V=aseVista(GB.verAse,aseDocsDir());if(V){t.disabled=true;await informeExcel(GB.verAse,V.D);t.disabled=false}}
  else if(act==="infase"){e.preventDefault();const mes=t.dataset.mes||GB.mes||mesesBanco()[0];if(!mes)return;const D=datosInforme(mes),ya=GB.ase&&GB.ase[mes];
    const av=[D.pendClas?`${D.pendClas} movimientos sin clasificar`:"",D.sinJust?`${D.sinJust} sin todos sus documentos (justificante o factura)`:""].filter(Boolean).join(" y ");
    if(!confirm(`${ya?"Se sustituirá lo que se envió el "+fmtFecha(String(ya.t).slice(0,10))+". ":""}La asesoría verá el informe de ${mesTxt(mes)} con los ingresos según el banco (tarjeta, Bizum, transferencias y efectivo ingresado en el cajero), los gastos y los movimientos del banco con sus justificantes. No verá nada de lo que no es de la actividad.${av?"\n\nOjo: hay "+av+".":""}${D.prueba?"\n\nSon datos de prueba (hasta enero de 2027).":""}\n\n¿Enviar?`))return;
    t.disabled=true;try{await S.db.doc("asesoria/"+mes).set({mes,t:nowISO(),por:quienSoy(),Dj:JSON.stringify(paraAsesoria(D))});toast("Enviado a la asesoría")}
    catch(x){console.warn(x);toast(/perm/i.test(String(x&&(x.fb||"")+" "+(x&&x.message)))?"Faltan permisos: hay que publicar las reglas nuevas en Firebase.":"No se ha podido enviar. Inténtalo de nuevo.")}t.disabled=false}});

/* ============================================================================================
   Fase 2 · Recibos automáticos del mes (ENSAYO, 31/10/2026). Tarifas → «Recibos del mes (ensayo)».
   Calcula el recibo de cada alumno con su tarifa (matriz o propuesta de Argos, antiguos y precios especiales) y las horas extra
   anteriores al mes que siguen sin cobrar (tarifa de la hora extra). Numeración provisional. Se compara con los recibos de Argos
   de ese mes y se descarga en Excel. No guarda nada: los recibos de verdad se crearán desde el 1/1/2027 (serie R27).
   ============================================================================================ */
const mesSig=m=>{const [y,mm]=m.split("-").map(Number);return mm===12?`${y+1}-01`:`${y}-${String(mm+1).padStart(2,"0")}`};
/* Prorrateo (decisión de la titular, 31/10/2026): el mes en que empieza, paga precio ÷ (4 semanas × clases por semana) × clases
   que le quedan desde el día de inicio hasta fin de mes (sus días de clase del horario; no se descuentan festivos). Nunca más del mes entero.
   Día de inicio de cada curso: «Empieza el» de su tarifa; si no, el alta en Argos de ese curso; si no, el alta en la app. */
const isoFlex=v=>{v=String(v||"").trim();let m=v.match(/^(\d{4})-(\d\d)-(\d\d)/);if(m)return m[0];m=v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);return m?`${m[3].length===2?"20"+m[3]:m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`:""};
function inicioLinea(a,l){if(l&&l.ini)return l.ini;const c=nzC(l&&l.curso),ms=(a.matriculas||[]).filter(m=>m&&nzC(m.curso)===c).map(m=>isoFlex(m.alta)).filter(Boolean).sort();
  if(ms.length)return ms[ms.length-1];return !(a.matriculas||[]).length&&a.altaApp&&a.altaApp.t?String(a.altaApp.t).slice(0,10):""}
function prorrateo(a,mes,desde){if(!desde||!desde.startsWith(mes)||desde.slice(8,10)==="01")return null;const n=a.clases.length;if(!n)return null;
  const fin=isoDe(new Date(+mes.slice(0,4),+mes.slice(5,7),0));let q=0;for(let d=desde;d<=fin;d=sumaDias(d,1)){const dd=diaDe(d);q+=a.clases.filter(c=>c&&c.dia===dd).length}
  const tot=4*n;return q>=tot?null:{q,tot,f:q/tot}}
function generarRecibos(mes){
  const TM=tfMapa(),out=[],avisos=[],nombreMes=mesTxt(mes).replace(/^./,c=>c.toUpperCase());
  for(const [id,a] of sortedAlumnos()){
    if(a.baja||a.bloqueado)continue;if(!a.clases.length&&a.argos!=="activo"&&!(a.matriz&&(a.matriz.l||[]).length))continue;
    if(a.exento){avisos.push({id,a,txt:"No paga (familiar, beca…): sin recibo"});continue}
    const M=calcMatriz(a,TM),lin=[];
    const HD=horasDescuadre(a,M,TM);if(HD)avisos.push({id,a,txt:`Horario de ${HD.hor} h/semana y tarifa de ${fmtNum(HD.tar)} h: revisa la tarifa${HD.sug?` (¿${HD.sug.nombre}?)`:""}`});
    const finM=isoDe(new Date(+mes.slice(0,4),+mes.slice(5,7),0));let salt=0;
    for(const l of M.l){const p=precioLinea(l,TM),ini=inicioLinea(a,l),nb=l.aj!=null&&l.aj!==""?`precio especial: ${l.mot||""}`:l.ant?"antiguo alumno":"";
      if(ini&&ini>finM){avisos.push({id,a,txt:`${l.curso}: empieza el ${fmtFecha(ini)}, este mes no se le cobra`});salt++;continue}
      const pr=prorrateo(a,mes,ini);
      lin.push(pr&&p!=null?{concepto:`${nombreMes} · ${l.curso} (desde el ${fmtFecha(ini)})`,importe:r2(p*pr.f),nota:[nb,`proporcional: ${pr.q} de ${pr.tot} clases de ${eur(p)}`].filter(Boolean).join(" · ")}
        :{concepto:`${nombreMes} · ${l.curso}`,importe:p,nota:nb})}
    for(const e of a.extras||[]){if(!e||e.anulada||e.cobro||!e.fecha||e.fecha>=mes+"-01")continue;if(typeof hxActivo==="function"&&e.id&&hxActivo(id,e))continue;const imp=tarifaDe(a,e);lin.push({concepto:`Hora extra ${fmtFecha(e.fecha)} con ${e.profe}`,importe:imp,nota:imp==null?"sin tarifa de hora extra":"",extra:true})}
    /* 15/11/2026 (titular, opción B): los recibos HX pendientes pasan al recibo del mes como líneas y el HX se anula («incluido en …») */
    const hx=lin.some(l=>!l.extra)?(a.recibos||[]).filter(r=>r&&r.serie==="HX"&&r.estado!=="pagado"&&r.estado!=="anulado"&&!r.anulado&&String(r.emitido||"")<=finM):[];
    for(const r of hx)for(const x of hxLineas(r))lin.push({concepto:x.txt,importe:+x.imp||0,nota:`viene del recibo ${r.numero}, que se anulará`,extra:true,hx:r.numero});
    if(!lin.length){if(a.clases.length&&!salt)avisos.push({id,a,txt:"Tiene clases pero no tiene tarifa: no saldría recibo"});continue}
    const falta=lin.some(l=>l.importe==null),tot=r2(lin.reduce((s,l)=>s+(+l.importe||0),0));
    const arg=(a.recibos||[]).filter(r=>r&&String(r.emitido||"").startsWith(mes)),ta=arg.length?r2(arg.reduce((s,r)=>s+(+r.importe||0),0)):null;
    out.push({id,a,lin,tot,falta,hd:HD,hx:hx.map(r=>r.numero),guardada:M.guardada,argos:ta,argosN:arg.map(r=>r.numero).filter(Boolean)})}
  out.forEach((x,i)=>x.num=`ENSAYO-${mes.replace("-","")}-${String(i+1).padStart(4,"0")}`);
  return {mes,l:out,avisos,tot:r2(out.reduce((s,x)=>s+x.tot,0)),totArg:r2(out.reduce((s,x)=>s+(x.argos||0),0)),conArg:out.filter(x=>x.argos!=null).length};
}
function vGenerar(){
  const ms=[todayISO().slice(0,7),mesSig(todayISO().slice(0,7)),...mesesConRecibos()].filter((v,i,l)=>l.indexOf(v)===i).sort().reverse();
  if(!GT.genMes)GT.genMes=mesSig(todayISO().slice(0,7));const G=generarRecibos(GT.genMes);
  const dif=x=>x.argos==null?`<span class="note">sin recibo en Argos</span>`:Math.abs(x.argos-x.tot)<0.005?`<span class="note" style="color:var(--ok)">= Argos</span>`:`<span class="note" style="color:var(--warn)">Argos ${eur(x.argos)} (${eurS(r2(x.tot-x.argos))})</span>`;
  const vis=GT.genSolo?G.l.filter(x=>x.falta||x.hd||(x.argos!=null&&Math.abs(x.argos-x.tot)>0.005)):G.l;
  return `<div class="bar"><h2>Recibos del mes · ensayo</h2><span class="legend"><button class="btn small" data-tf="genno">← Volver a Tarifas</button></span></div>
  <div class="aviso info" style="display:block"><b>Ensayo: no se crea ningún recibo.</b> Así saldrían los recibos con la tarifa de cada alumno. Si el alumno tiene un recibo de horas extra (HX) <b>pendiente</b>, sus líneas pasan a este recibo y el HX se anulará con la nota «incluido en…»; los HX ya pagados no se tocan. También se suman las horas extra antiguas sin recibo ni cobradas en Argos. Compáralos con los de Argos. Desde el 1/1/2027 este botón los creará de verdad (serie R27).</div>
  <div class="bar" style="gap:8px;flex-wrap:wrap;margin-top:8px"><label class="f" style="flex:0 1 180px">Mes<select id="gt-genmes">${ms.map(m=>`<option value="${m}" ${m===GT.genMes?"selected":""}>${mesTxt(m)}</option>`).join("")}</select></label>
    <label class="chk" style="margin:0"><input type="checkbox" id="gt-gensolo" ${GT.genSolo?"checked":""}><span>Solo los que no cuadran</span></label>
    <button class="btn" data-tf="genxls" style="margin-left:auto">Descargar Excel</button></div>
  <div class="stats"><div class="stat"><b>${G.l.length}</b><span>Recibos</span></div><div class="stat"><b>${eur(G.tot)}</b><span>Total a cobrar</span></div>
    <div class="stat"><b>${G.conArg?eur(G.totArg):"—"}</b><span>${G.conArg?`En Argos (${G.conArg} con recibo ese mes)`:"Argos aún no tiene recibos de ese mes"}</span></div>
    <div class="stat"><b style="${G.avisos.length?"color:var(--warn)":""}">${G.avisos.length}</b><span>Avisos</span></div></div>
  ${G.avisos.length?`<details class="aviso pend fh" style="display:block"><summary><b>${G.avisos.length} aviso${G.avisos.length===1?"":"s"}</b></summary><div class="fhl">${G.avisos.map(v=>`<div class="row"><a href="#" class="grow" data-act="ir" data-id="${esc(v.id)}" style="color:inherit">${esc(titulo(v.a.nombre))}</a><span class="note">${esc(v.txt)}</span></div>`).join("")}</div></details>`:""}
  <div class="panel">${vis.map(x=>`<div class="row" style="flex-wrap:wrap;align-items:flex-start;padding:8px 12px">
    <span class="note" style="min-width:150px;font-variant-numeric:tabular-nums">${x.num}</span>
    <span class="grow" style="white-space:normal;flex-basis:240px"><a href="#" data-act="ir" data-id="${esc(x.id)}" style="color:inherit"><b>${esc(titulo(x.a.nombre))}</b></a>${x.guardada?"":` <span class="badge b-off" title="Tarifa propuesta según Argos, aún sin guardar">propuesta</span>`}${x.hd?`<br><span class="note" style="color:var(--warn)">Horario de ${x.hd.hor} h/semana y tarifa de ${fmtNum(x.hd.tar)} h.</span>${x.hd.sug?` <button class="btn small primary" data-tf="hcambia" data-id="${esc(x.id)}" data-c="${esc(x.hd.sug.nombre)}">Cambiar a ${esc(x.hd.sug.nombre)} (${eur(x.hd.sug.precio)})</button>`:` <a href="#" class="note" data-act="ir" data-id="${esc(x.id)}">Revisar en su ficha</a>`}`:""}
      ${x.lin.map(l=>`<br><span class="note">${esc(l.concepto)} · ${l.importe==null?`<span style="color:var(--bad)">sin precio</span>`:eur(l.importe)}${l.nota?` · ${esc(l.nota)}`:""}</span>`).join("")}</span>
    <span style="text-align:right;min-width:140px"><b>${x.falta?"—":eur(x.tot)}</b><br>${dif(x)}</span></div>`).join("")||`<div class="empty">Todo cuadra.</div>`}</div>`;
}
async function generarExcel(){
  try{await cargarJs(XLSXJS)}catch(_){toast("No se ha podido cargar el generador de Excel.");return}
  const G=generarRecibos(GT.genMes),X=window.XLSX,wb=X.utils.book_new();
  X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([["Nº (ensayo)","Alumno","Concepto","Importe","Nota","Total recibo","Argos","Diferencia"],
    ...G.l.flatMap(x=>x.lin.map((l,i)=>[x.num,titulo(x.a.nombre),l.concepto,l.importe,l.nota,i?"":x.tot,i?"":x.argos,i?"":(x.argos==null?"":r2(x.tot-x.argos))]))]),"Recibos");
  if(G.avisos.length)X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([["Alumno","Aviso"],...G.avisos.map(v=>[titulo(v.a.nombre),v.txt])]),"Avisos");
  X.writeFile(wb,`recibos-ensayo-${G.mes}.xlsx`);
}
document.addEventListener("change",e=>{const t=e.target;if(!t)return;if(t.id==="gt-facsem"&&t.value){GT.facSem=lunesSem(t.value);render();return}if(/^ct-/.test(t.id)&&GT.facCont){prevContadores();return}if(t.id==="gt-genmes"){GT.genMes=t.value;render()}else if(t.id==="gt-gensolo"){GT.genSolo=t.checked;render()}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-tf]");if(!t||!gtVer())return;const act=t.dataset.tf;
  if(act==="gen"){e.preventDefault();GT.gen=true;render();scrollTo(0,0)}else if(act==="genno"){e.preventDefault();GT.gen=false;render()}
  else if(act==="fac"){e.preventDefault();GT.fac=true;render();scrollTo(0,0)}else if(act==="facno"){e.preventDefault();GT.fac=false;GT.facCont=null;render()}
  else if(act==="facsem"){e.preventDefault();GT.facSem=sumaDias(GT.facSem,+t.dataset.d);render()}
  else if(act==="contargos"){e.preventDefault();GT.facCont={...contadores(),fac:{...CONT_ARGOS.fac},alb:{...CONT_ARGOS.alb}};render();toast("Revisa y pulsa «Guardar contadores»")}
  else if(act==="contedit"){e.preventDefault();GT.facCont=JSON.parse(JSON.stringify(contadores()));render()}
  else if(act==="contno"){e.preventDefault();GT.facCont=null;render()}
  else if(act==="contok"){e.preventDefault();const c=leerContadores();if(!c)return;t.disabled=true;const d={...(S.recCfg||{}),contadores:{...c,t:nowISO(),por:quienSoy()}};
    try{await S.db.doc("config/recibos").set(d);S.recCfg=d;GT.facCont=null;render();toast("Contadores guardados")}catch(x){console.warn(x);toast("No se han podido guardar los contadores");t.disabled=false}}
  else if(act==="facxls"){e.preventDefault();t.disabled=true;await facturacionExcel();t.disabled=false}
  else if(act==="genxls"){e.preventDefault();t.disabled=true;await generarExcel();t.disabled=false}},true);

/* ============================================================================================
   Asesoría (A3), solo lectura (31/10/2026). Usuario con rol «ase» creado en Accesos.
   - Dirección envía cada mes desde Informe del mes → «Enviar a la asesoría»: se guarda una copia en asesoria/<AAAA-MM> =
     {mes, t, por, D} (el informe ya calculado, los movimientos del banco con su justificante y los cobros del mes).
   - La asesoría solo ve esas copias y los justificantes (archivos de clase «gasto» o «banco»). No ve alumnos, horarios,
     caja ni nada más, y no puede cambiar nada.
   ============================================================================================ */
function aseEscuchar(){if(GB.aseSub)return;GB.ase={};
  GB.aseSub=S.db.collection("asesoria").onSnapshot(s=>{const o={};s.docs.forEach(d=>{const x=d.data();o[d.id]={t:x.t,por:x.por,Dj:x.Dj||"",D:x.D||null}});GB.ase=o;if(S.view==="gastos"&&GB.inf)gbRefrescar()},()=>{})}
const AS={docs:[],ok:false,err:"",mes:""};
function arrancarAsesoria(db){
  S.db=db;S.role="ase";S.screen="app";document.body.classList.add("ase");document.body.classList.remove("home");
  const sub=document.getElementById("sub");if(sub)sub.textContent="Asesoría · solo lectura";
  const b=document.getElementById("b-inicio");if(b){b.textContent="Salir";b.dataset.act="salir"}
  setStatus("Al día");vAsePintar();
  db.collection("asesoria").onSnapshot(s=>{AS.docs=s.docs.map(d=>{const x=d.data()||{};let D=x.D||{};try{if(x.Dj)D=JSON.parse(x.Dj)}catch(_){}return {id:d.id,mes:x.mes,t:x.t,por:x.por,D}}).sort((x,y)=>y.id.localeCompare(x.id));AS.ok=true;AS.err="";vAsePintar()},
    e=>{AS.ok=true;AS.err="No se pueden leer los informes. Pide al centro que revise tu acceso.";vAsePintar()});
}
function aseMovs(D){const movs=D.movs||[],falt=movs.filter(m=>m.falta).length;
  return `  <div class="bar noprint" style="margin-top:18px"><h2 style="font-size:19px">Movimientos del banco y justificantes</h2><span class="legend">${movs.length} movimientos${falt?` · <b style="color:var(--warn)">a ${falt} les falta algún documento</b>`:""}</span></div>
  <div class="panel tbl noprint"><table class="ft" style="min-width:0;width:100%"><thead><tr><th>Fecha</th><th>Cuenta</th><th>Concepto</th><th>Categoría</th><th style="text-align:right">Importe</th><th>Justificante y factura</th></tr></thead><tbody>
  ${movs.map(m=>`<tr><td style="white-space:nowrap">${fmtFecha(m.fv)}</td><td>${esc(ctaTxt(m.cuenta))}</td><td style="white-space:normal">${esc(m.concepto)}${m.quien?`<br><span class="note">${esc(m.quien)}</span>`:""}${m.nota?`<br><span class="note">«${esc(m.nota)}»</span>`:""}</td><td>${esc(m.cat)}</td>
    <td style="text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap">${eurS(m.importe)}</td><td>${dCelda(m,1)}</td></tr>`).join("")}</tbody></table></div>`}
function vAsePintar(){const app=document.getElementById("app");if(app)app.innerHTML=vAsesoria()}
function vAsesoria(){
  if(!AS.ok)return `<div class="empty">Cargando…</div>`;if(AS.err)return `<div class="empty">${esc(AS.err)}</div>`;
  if(!AS.docs.length)return vAyudaAse(true)+`<div class="empty">Todavía no hay ningún mes enviado por el centro.</div>`;
  if(!AS.mes||!aseVista(AS.mes,AS.docs))AS.mes=trimDe(AS.docs[0].id);const V=aseVista(AS.mes,AS.docs),D=V.D,mes=AS.mes;
  return `<div class="bar noprint"><h2>Althea Formación · informes para la asesoría</h2><span class="legend">Solo lectura</span></div>
  <div class="bar noprint" style="gap:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 210px">Periodo<select id="as-mes">${opcionesPeriodo(AS.docs,mes)}</select></label>
    <button class="btn primary" data-as="print">Imprimir o guardar en PDF</button><button class="btn" data-as="xls">Descargar Excel</button>
    <span class="note">${V.info}</span></div>
  ${vAyudaAse(false)}
  ${vImpuestos(/-T\d$/.test(mes)?mes:trimDe(mes))}
${vRetAlq(D.alq||[],false,null,mes)}
  ${informeCuerpo(D,mes)}
${aseMovs(D)}
${vFacturasAse()}
${vFichAse()}`;
}
document.addEventListener("change",e=>{if(S.role==="ase"&&e.target&&e.target.id==="as-mes"){AS.mes=e.target.value;vAsePintar();scrollTo(0,0)}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-as]");if(!t||S.role!=="ase")return;e.preventDefault();
  const V=aseVista(AS.mes,AS.docs);if(!V)return;
  if(t.dataset.as==="print"){document.body.classList.add("printinf");const fin=()=>{document.body.classList.remove("printinf");removeEventListener("afterprint",fin)};addEventListener("afterprint",fin);setTimeout(()=>window.print(),50)}
  else if(t.dataset.as==="xls"){t.disabled=true;await informeExcel(AS.mes,V.D);t.disabled=false}});
document.head.insertAdjacentHTML("beforeend",`<style>body.ase nav,body.ase .privfoot{display:none!important}</style>`);
document.addEventListener("change",e=>{if(e.target&&e.target.id==="gb-asep"&&gbVer()){GB.verAse=e.target.value;render();scrollTo(0,0)}});

/* ============================================================================================
   Facturación semanal y contadores (01/11/2026). ENSAYO: no guarda facturas; solo los contadores (config/recibos.contadores).
   Decisiones de la titular: una factura por cada recibo (albarán); cada semana se facturan los albaranes con fecha de pago en esa
   semana (lunes a domingo), con cualquier forma de pago; la titular elige el formato de los contadores de facturas y de albaranes.
   El ensayo compara con las facturas reales de Argos subidas en Gastos (ventas/<mes>) y con lo que entró en el banco esa semana.
   ============================================================================================ */
/* 14/11/2026 (titular): mismo formato que Argos, cambiando solo el año: facturas FA26ES/000884 → FA27ES/000001; albaranes A26/001359 → A27/000001 */
const CONT_DEF={fac:{pre:"FA",anio:"AA",suf:"ES",sep:"/",cifras:6,ini:1,anual:true},alb:{pre:"A",anio:"AA",suf:"",sep:"/",cifras:6,ini:1,anual:true}};
const CONT_ARGOS=CONT_DEF,contIgual=(a,b)=>["pre","anio","suf","sep","cifras"].every(k=>String(a[k])===String(b[k]));
const contadores=()=>{const c=(S.recCfg&&S.recCfg.contadores)||{};return {fac:{...CONT_DEF.fac,...(c.fac||{})},alb:{...CONT_DEF.alb,...(c.alb||{})},t:c.t||"",por:c.por||""}};
const fmtContador=(c,n,anio)=>{const y=String(anio||new Date().getFullYear());return `${c.pre||""}${c.anio==="AAAA"?y:c.anio==="AA"?y.slice(2):""}${c.suf||""}${c.sep||""}${String(n).padStart(Math.max(1,+c.cifras||1),"0")}`};
function leerContadores(silencio){const v=id=>($("#"+id)||{}).value,o={};
  for(const k of ["fac","alb"]){const c={pre:String(v(`ct-${k}-pre`)??"").trim().slice(0,12),anio:v(`ct-${k}-anio`)||"",suf:String(v(`ct-${k}-suf`)??"").trim().slice(0,12),sep:String(v(`ct-${k}-sep`)??"").slice(0,3),
    cifras:Math.min(10,Math.max(1,parseInt(v(`ct-${k}-cif`))||4)),ini:Math.max(1,parseInt(v(`ct-${k}-ini`))||1),anual:!!($("#ct-"+k+"-anual")||{}).checked};
    if(!silencio&&!c.pre&&!c.anio&&!c.suf){toast(`Pon un prefijo o el año en el contador de ${k==="fac"?"facturas":"albaranes"}`);return null}o[k]=c}
  if(!silencio&&fmtContador(o.fac,1)===fmtContador(o.alb,1)){toast("Facturas y albaranes no pueden tener el mismo formato");return null}
  if(GT.facCont){GT.facCont.fac=o.fac;GT.facCont.alb=o.alb}return o}
const prevTxt=(c,y)=>`Así quedará: <b>${esc(fmtContador(c,c.ini,y))}</b>, ${esc(fmtContador(c,c.ini+1,y))}, ${esc(fmtContador(c,c.ini+2,y))}…`;
function prevContadores(){const o=leerContadores(true),y=new Date().getFullYear()+(new Date().getMonth()>=10?1:0);for(const k of ["fac","alb"]){const el=$("#ct-"+k+"-prev");if(el&&o)el.innerHTML=prevTxt(o[k],y)}}
document.addEventListener("input",e=>{if(e.target&&/^ct-/.test(e.target.id)&&GT.facCont)prevContadores()});
function vContadores(){const C=GT.facCont||contadores(),ed=!!GT.facCont,y=new Date().getFullYear()+(new Date().getMonth()>=10?1:0);
  const bloque=(k,tit)=>{const c=C[k];return ed?`<div class="panel" style="padding:10px 12px;flex:1 1 360px"><b>${tit}</b>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:flex-end">
      <label class="f" style="flex:0 1 90px">Prefijo<input id="ct-${k}-pre" value="${esc(c.pre)}" maxlength="12"></label>
      <label class="f" style="flex:0 1 110px">Año<select id="ct-${k}-anio"><option value="" ${!c.anio?"selected":""}>Sin año</option><option value="AA" ${c.anio==="AA"?"selected":""}>2 cifras (${String(y).slice(2)})</option><option value="AAAA" ${c.anio==="AAAA"?"selected":""}>4 cifras (${y})</option></select></label>
      <label class="f" style="flex:0 1 90px">Tras el año<input id="ct-${k}-suf" value="${esc(c.suf)}" maxlength="12" placeholder="p. ej. ES"></label>
      <label class="f" style="flex:0 1 80px">Separador<input id="ct-${k}-sep" value="${esc(c.sep)}" maxlength="3" placeholder="/ o -"></label>
      <label class="f" style="flex:0 1 80px">Cifras<input id="ct-${k}-cif" type="number" min="1" max="10" value="${c.cifras}"></label>
      <label class="f" style="flex:0 1 110px">Empieza en<input id="ct-${k}-ini" type="number" min="1" value="${c.ini}"></label>
      <label class="chk" style="margin:0 0 8px"><input type="checkbox" id="ct-${k}-anual" ${c.anual?"checked":""}><span>Vuelve a 1 cada año</span></label></div>
    <p class="note" style="margin:6px 0 0" id="ct-${k}-prev">Así quedará: <b>${esc(fmtContador(c,c.ini,y))}</b>, ${esc(fmtContador(c,c.ini+1,y))}, ${esc(fmtContador(c,c.ini+2,y))}…</p></div>`
    :`<div class="panel" style="padding:10px 12px;flex:1 1 260px"><b>${tit}</b><p style="margin:4px 0 0;font-size:18px;font-variant-numeric:tabular-nums">${esc(fmtContador(c,c.ini,y))}</p><p class="note" style="margin:2px 0 0">${c.anual?"Vuelve a 1 cada año":"No se reinicia"}</p></div>`};
  return `<div class="bar" style="margin-top:4px"><h2 style="font-size:19px">Contadores</h2><span class="legend">${ed?`<button class="btn small" data-tf="contno">Cancelar</button><button class="btn small primary" data-tf="contok">Guardar contadores</button>`:`<button class="btn small" data-tf="contedit">Cambiar</button>`}</span></div>
  ${!ed&&(!contIgual(C.fac,CONT_ARGOS.fac)||!contIgual(C.alb,CONT_ARGOS.alb))?`<div class="aviso pend" style="display:block;margin:6px 0">Los contadores guardados no siguen el formato de Argos (facturas ${esc(fmtContador(CONT_ARGOS.fac,1,y))}, albaranes ${esc(fmtContador(CONT_ARGOS.alb,1,y))}). <button class="btn small primary" data-tf="contargos">Usar el formato de Argos</button></div>`:""}
  <div style="display:flex;gap:10px;flex-wrap:wrap">${bloque("fac","Facturas")}${bloque("alb","Albaranes (recibos)")}</div>
  <p class="note" style="margin:6px 0 0">${C.t&&!ed?`Guardados el ${fmtFecha(String(C.t).slice(0,10))}${C.por?" por "+esc(C.por):""}. `:ed?"":"Aún sin guardar: es la propuesta por defecto. "}Desde enero, cada número se asigna una sola vez y no se reutiliza: una factura anulada se corrige con una rectificativa. Si A3 pide continuar la serie de Argos, pon su formato (p. ej. prefijo «FA», año 2 cifras, «ES» tras el año, separador «/», 6 cifras) y el número siguiente.</p>`}
/* Semana (decisión de la titular, 01/11/2026): se factura lo que ha entrado en el banco esa semana.
   - Tarjeta, Bizum, transferencias y sin indicar: los albaranes con fecha de pago en la semana.
   - Contado: según se ingresa en el cajero, por orden de antigüedad: los albaranes en contado más antiguos sin facturar
     hasta cubrir lo ingresado (desde el día 1 del primer mes con extractos del banco).
   Lo cobrado en contado que aún no se ha ingresado queda como «efectivo cobrado pendiente de facturar». */
const tipoForma=f=>/tarj|tpv|dat[aá]fono/i.test(f)?"tpv":/bizum/i.test(f)?"bizum":/transf/i.test(f)?"transf":/efect|contado|met[aá]lico/i.test(f)?"ef":"otras";
function ensayoFacturas(lun){const dom=sumaDias(lun,6),C=contadores(),pag=[];
  for(const [id,a] of S.alumnos)for(const r of a.recibos||[]){if(!r||r.estado!=="pagado")continue;const fp=String(r.pagado||"").slice(0,10);if(!fp)continue;
    pag.push({id,a,r,fp,imp:+r.importe||0,forma:r.forma||"",t:tipoForma(r.forma||"")})}
  const orden=(x,y)=>x.fp.localeCompare(y.fp)||String(x.r.numero||"").localeCompare(String(y.r.numero||""));
  const banco=pag.filter(x=>x.t!=="ef"&&x.fp>=lun&&x.fp<=dom).sort(orden);
  const msB=mesesBanco(),ini=(msB.length?msB[msB.length-1]:lun.slice(0,7))+"-01";
  const dep=(d1,d2)=>d2<d1?0:r2(movsTodos().filter(m=>m.cat==="deposito"&&(m.fo||m.fv)>=d1&&(m.fo||m.fv)<=d2).reduce((s2,m)=>s2+m.importe,0));
  const D0=dep(ini,sumaDias(lun,-1)),D1=r2(D0+dep(lun,dom)),caja=pag.filter(x=>x.t==="ef"&&x.fp>=ini&&x.fp<=dom).sort(orden);
  let acc=0,i=0;while(i<caja.length&&acc+caja[i].imp<=D0+0.005){acc=r2(acc+caja[i].imp);i++}
  const efSem=[];while(i<caja.length&&acc+caja[i].imp<=D1+0.005){acc=r2(acc+caja[i].imp);efSem.push(caja[i]);i++}
  /* Acumulado por trimestre fiscal natural: del día 1 del primer mes al último día del tercero. Si la semana cruza el cambio
     de trimestre, sale una fila por cada trimestre, cada una con solo sus días. */
  const cubre=(D,hasta)=>{let a2=0;for(const x of caja){if(x.fp>hasta||a2+x.imp>D+0.005)break;a2=r2(a2+x.imp)}return a2};
  const efHasta=d=>d<ini?0:cubre(dep(ini,d),d);
  const trimIni=d=>`${d.slice(0,4)}-${String(Math.floor((+d.slice(5,7)-1)/3)*3+1).padStart(2,"0")}-01`;
  const trimFin=d=>{const q=trimIni(d),m=+q.slice(5,7)+2;return isoDe(new Date(+q.slice(0,4),m,0))};
  const acums=[];for(let d=lun;d<=dom;){const q1=trimIni(d),qf=trimFin(d),hasta=qf<dom?qf:dom;
    const fac2=r2(pag.filter(x=>x.t!=="ef"&&x.fp>=q1&&x.fp<=hasta).reduce((s2,x)=>s2+x.imp,0)+efHasta(hasta)-efHasta(sumaDias(q1,-1)));
    const ban2=r2(movsTodos().filter(m=>["tpv","bizum","transf","deposito"].includes(m.cat)&&(m.fo||m.fv)>=q1&&(m.fo||m.fv)<=hasta).reduce((s2,m)=>s2+m.importe,0));
    acums.push({desde:q1,hasta,fin:qf,cierra:hasta===qf,trim:trimDe(q1.slice(0,7)),banco:ban2,fac:fac2});d=sumaDias(hasta,1)}
  const efPend=caja.slice(i),alb=[...banco,...efSem].sort(orden),y=+lun.slice(0,4);alb.forEach((x,k)=>x.fac=fmtContador(C.fac,C.fac.ini+k,y));
  /* facturas reales de Argos para comparar: mismo cliente e importe, fecha desde el pago hasta 14 días después del domingo */
  const meses=[...new Set([ini.slice(0,7),lun.slice(0,7),dom.slice(0,7),sumaDias(dom,14).slice(0,7)])],arg=meses.flatMap(m=>{const v=ventasMes(m);return v?v.l:[]}).filter(f=>f.f<=sumaDias(dom,14)),usadas=new Set();
  for(const x of alb){const k=sinEsp(x.a.nombre),c=arg.filter(f=>!usadas.has(f.n)&&Math.abs((+f.tot||0)-x.imp)<0.005&&(sinEsp(f.c)===k||sinEsp(f.c).includes(k)||k.includes(sinEsp(f.c)))&&f.f>=x.fp).sort((p2,q)=>p2.f.localeCompare(q.f));
    if(c.length){x.arg=c[0];usadas.add(c[0].n)}}
  const sum=(l,t)=>r2(l.filter(x=>!t||x.t===t).reduce((s2,x)=>s2+x.imp,0));
  const bs={tpv:0,bizum:0,transf:0,deposito:0};for(const m of movsTodos()){const f=m.fo||m.fv;if(f<lun||f>dom)continue;if(bs[m.cat]!=null)bs[m.cat]=r2(bs[m.cat]+m.importe)}
  const fac={tpv:sum(banco,"tpv"),bizum:sum(banco,"bizum"),transf:sum(banco,"transf"),otras:sum(banco,"otras"),ef:sum(efSem)};
  return {lun,dom,ini,alb,efSem,efPend,efPendTot:sum(efPend),efCobSem:sum(caja.filter(x=>x.fp>=lun)),fac,bancoSem:bs,bancoTot:r2(bs.tpv+bs.bizum+bs.transf+bs.deposito),
    tot:sum(alb),acums,hayArgos:meses.some(m=>ventasMes(m)),conArg:alb.filter(x=>x.arg).length,sobraDep:r2(D1-acc)}}
/* ============================================================================================
   Cuadre del banco con las facturas de Argos hasta el 31/12/2026 (07/11/2026). Hasta esa fecha las facturas reales las emite
   Argos; desde el 1/1/2027, la app. La titular quiere llegar al 31/12 con lo que entró en el banco igual a lo facturado.
   - Banco: tarjeta (TPV), Bizum, transferencias recibidas y efectivo ingresado en el cajero, por fecha operativa.
   - Argos: facturas de venta subidas en Gastos (ventas/<mes>), por su fecha.
   - Desde config/banco.inicio (1/10/2026) hasta el 31/12/2026, por meses y acumulado.
   - Recibos cobrados por banco (tarjeta, Bizum, transferencia) sin factura de Argos: mismo cliente e importe, con la factura
     emitida entre 3 días antes y 45 después del pago. Es la lista de lo que falta facturar en Argos.
   ============================================================================================ */
const CQ_FIN="2026-12-31";
/* El nombre del alumno está en el texto (casi todas sus palabras: «Martina Sarmiento Núñez» en «MARTINA SARMIENTO | Sarmiento Núñez») */
const nombreEn=(txt,nom)=>{if(!txt)return false;const T=sinEsp(txt),ws=String(nom||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().split(/[^A-Z]+/).filter(w=>w.length>=3);
  return ws.length>=2&&ws.filter(w=>T.includes(w)).length>=Math.max(2,ws.length-1)};
function cuadreArgos(){const desde=docDesde(),hasta=CQ_FIN<todayISO()?CQ_FIN:todayISO();
  const meses=[];for(let m=desde.slice(0,7);m<=hasta.slice(0,7);m=sumaDias(m+"-28",5).slice(0,7))meses.push(m);
  const fv=t=>/tarj|tpv|dat[aá]fono/i.test(t)?"tarjeta":/bizum/i.test(t)?"bizum":/transf/i.test(t)?"transf":/efect|contado|met[aá]lico/i.test(t)?"efectivo":/beca/i.test(t)?"beca":"otras";
  const filas=meses.map(mes=>{const b={tarjeta:0,bizum:0,transf:0,efectivo:0},cat={tpv:"tarjeta",bizum:"bizum",transf:"transf",deposito:"efectivo"};
    for(const m of movsTodos()){const f=m.fo||m.fv;if(!cat[m.cat]||!String(f).startsWith(mes)||f<desde||f>hasta)continue;b[cat[m.cat]]=r2(b[cat[m.cat]]+m.importe)}
    const v=ventasMes(mes),l=v?v.l.filter(f=>f.f>=desde&&f.f<=hasta):[],a={tarjeta:0,bizum:0,transf:0,efectivo:0,beca:0,otras:0};
    for(const f of l)a[fv(f.fp)]=r2(a[fv(f.fp)]+(+f.tot||0));
    const bt=r2(b.tarjeta+b.bizum+b.transf+b.efectivo),at=r2(a.tarjeta+a.bizum+a.transf+a.efectivo),ao=r2(a.beca+a.otras);
    return {mes,b,a,bt,at,ao,n:l.length,hay:!!v}});
  let ac=0;for(const x of filas){ac=r2(ac+x.at-x.bt);x.ac=ac}
  /* recibos cobrados por banco sin factura en Argos */
  const arg=meses.flatMap(m=>{const v=ventasMes(m);return v?v.l:[]}).concat((()=>{const v=ventasMes(sumaDias(hasta,20).slice(0,7));return v?v.l:[]})()),usadas=new Set(),sinFac=[];
  const cobros=[];for(const [,a] of S.alumnos)for(const r of a.recibos||[])if(r&&r.estado==="pagado"&&r.pagado&&r.pagado>=desde&&r.pagado<=hasta)cobros.push({n:a.nombre,fp:String(r.pagado).slice(0,10),imp:+r.importe||0,forma:r.forma||"",num:r.numero||""});
  for(const x of (S.sinFicha&&S.sinFicha.l)||[])if(x.fechaPago>=desde&&x.fechaPago<=hasta)cobros.push({n:x.nombre,fp:x.fechaPago,imp:+x.importe||0,forma:x.forma||"",num:x.numero||""});
  cobros.sort((p,q)=>p.fp.localeCompare(q.fp));
  const conArg=new Set(filas.filter(x=>x.hay).map(x=>x.mes));
  for(const x of cobros){const t=fv(x.forma);if(!["tarjeta","bizum","transf"].includes(t)||!conArg.has(x.fp.slice(0,7)))continue;const k=sinEsp(x.n);
    const c=arg.filter(f=>!usadas.has(f.n)&&Math.abs((+f.tot||0)-x.imp)<0.005&&(sinEsp(f.c)===k||sinEsp(f.c).includes(k)||k.includes(sinEsp(f.c))||nombreEn(f.al,x.n)||nombreEn(f.c,x.n))&&f.f>=sumaDias(x.fp,-3)&&f.f<=sumaDias(x.fp,45)).sort((p,q)=>p.f.localeCompare(q.f));
    if(c.length)usadas.add(c[0].n);else sinFac.push({...x,t})}
  /* efectivo cobrado (recibos pagados en contado) desde el inicio, menos lo ingresado en el cajero: lo que está en caja sin ingresar */
  const efCob=r2(cobros.filter(x=>fv(x.forma)==="efectivo").reduce((s,x)=>s+x.imp,0)),efIng=r2(filas.reduce((s,x)=>s+x.b.efectivo,0));
  return {desde,hasta,filas,sinFac,sinFacT:r2(sinFac.reduce((s,x)=>s+x.imp,0)),hayArgos:filas.some(x=>x.hay),efCob,efIng,efSin:r2(efCob-efIng)}}
function vCuadreArgos(){if(todayISO()>"2027-01-31")return "";const C=cuadreArgos(),F=C.filas,ult=F[F.length-1],T=k=>r2(F.reduce((s,x)=>s+x[k],0));
  const fl=["tarjeta","bizum","transf","efectivo"],lb={tarjeta:"Tarjeta",bizum:"Bizum",transf:"Transferencia",efectivo:"Efectivo (cajero)"};
  const dif=v=>`<span style="${Math.abs(v)>0.5?"color:var(--warn);font-weight:600":"color:var(--ok)"}">${Math.abs(v)>0.5?eurS(v):"✓ cuadra"}</span>`;
  return `<div class="panel" style="padding:12px 14px;margin:12px 0"><b>Cuadre del banco con las facturas de Argos · del ${fmtFecha(C.desde)} al 31/12/2026</b>
    <p class="note" style="margin:2px 0 8px">Hasta el 31/12 las facturas las emite Argos. Para cerrar el año, lo facturado en Argos tiene que coincidir con lo que entró en el banco (tarjeta, Bizum, transferencias y efectivo ingresado en el cajero). ${C.hayArgos?"":`<b style="color:var(--warn)">No hay facturas de Argos subidas: súbelas en Gastos → «Subir facturas de venta de Argos (PDF)».</b>`}</p>
    ${(()=>{const ac=ult?ult.ac:0;return `<div class="stats" style="margin:0 0 8px"><div class="stat static"><b style="color:var(${Math.abs(ac)<=0.5?"--ok":"--warn"})">${Math.abs(ac)<=0.5?"✓ 0 €":eur(Math.abs(ac))}</b><span>${Math.abs(ac)<=0.5?"Cuadrado: lo facturado coincide con lo que entró en el banco":ac<0?`Queda por facturar del ${fmtFecha(C.desde)} a hoy (entró en el banco y no está facturado en Argos)`:`Facturado de más que lo que entró en el banco (del ${fmtFecha(C.desde)} a hoy)`}</span></div>
      <div class="stat static"><b style="color:var(${C.efSin>0.5?"--warn":"--ok"})">${eur(Math.max(0,C.efSin))}</b><span>Efectivo cobrado sin ingresar en el banco: no se factura hasta que lo ingreses (cobrado en contado desde el ${fmtFecha(C.desde)}: ${eur(C.efCob)} · ingresado en el cajero: ${eur(C.efIng)})</span></div></div>`})()}
    <table class="ft" style="min-width:0;width:100%;font-size:13px"><thead><tr><th>Mes</th><th style="text-align:right">Entró en el banco</th><th style="text-align:right">Facturado en Argos <span class="note">(tarjeta, Bizum, transf., efectivo)</span></th><th style="text-align:right" title="Facturas de beca o sin forma de pago: no se comparan con el banco">Beca o sin forma</th><th style="text-align:right">Diferencia del mes</th><th style="text-align:right">Acumulado</th></tr></thead><tbody>
    ${F.map(x=>`<tr><td>${esc(mesTxt(x.mes))}${x.hay?` <span class="note">(${x.n} facturas)</span>`:` <span class="badge b-pend">sin facturas de Argos</span>`}</td><td style="text-align:right">${eur(x.bt)}</td><td style="text-align:right">${eur(x.at)}</td><td style="text-align:right">${x.ao?eur(x.ao):"—"}</td><td style="text-align:right">${dif(r2(x.at-x.bt))}</td><td style="text-align:right">${dif(x.ac)}</td></tr>`).join("")}
    <tr style="font-weight:700"><td>Total</td><td style="text-align:right">${eur(T("bt"))}</td><td style="text-align:right">${eur(T("at"))}</td><td style="text-align:right">${eur(T("ao"))}</td><td></td><td style="text-align:right">${dif(ult?ult.ac:0)}</td></tr></tbody></table>
    <details style="margin-top:6px" open><summary class="note"><b>Por forma de pago</b></summary><table class="ft" style="min-width:0;width:100%;font-size:13px"><thead><tr><th></th>${F.map(x=>`<th colspan="2" style="text-align:center">${esc(mesTxt(x.mes))}</th>`).join("")}</tr><tr><th></th>${F.map(()=>`<th style="text-align:right">Banco</th><th style="text-align:right">Argos</th>`).join("")}</tr></thead><tbody>
      ${fl.map(k=>`<tr><td>${lb[k]}</td>${F.map(x=>`<td style="text-align:right">${eur(x.b[k])}</td><td style="text-align:right;${Math.abs(x.a[k]-x.b[k])>0.5?"color:var(--warn)":""}">${eur(x.a[k])}</td>`).join("")}</tr>`).join("")}
      ${F.some(x=>x.a.beca||x.a.otras)?`<tr><td>Beca u otras (no pasan por el banco)</td>${F.map(x=>`<td></td><td style="text-align:right">${eur(r2(x.a.beca+x.a.otras))}</td>`).join("")}</tr>`:""}</tbody></table>
      <p class="note">La tarjeta y el Bizum llegan al banco uno o dos días después: lo cobrado el último día de un mes aparece en el siguiente, y se compensa en el acumulado. Si en Argos la forma de pago no está indicada, cuenta en «otras».</p></details>
    ${C.sinFac.length?`<details style="margin-top:6px" open><summary><b style="color:var(--warn)">${C.sinFac.length} cobro${C.sinFac.length===1?"":"s"} por banco sin factura en Argos · ${eur(C.sinFacT)}</b></summary>
      <p class="note" style="margin:4px 0">Recibos pagados con tarjeta, Bizum o transferencia (en los meses que ya tienen facturas de Argos subidas) para los que no encuentro una factura de Argos del mismo cliente e importe. Si la factura está a nombre del padre o la madre, aquí sale igual: compruébalo en Argos. Si de verdad faltan, factúralos en Argos antes del 31/12 y vuelve a subir las facturas.</p>
      <table class="ft" style="min-width:0;width:100%;font-size:13px"><thead><tr><th>Pagado</th><th>Recibo</th><th>Alumno</th><th>Forma</th><th style="text-align:right">Importe</th></tr></thead><tbody>
      ${C.sinFac.map(x=>`<tr><td>${fmtFecha(x.fp)}</td><td>${esc(x.num)}</td><td>${esc(titulo(String(x.n).toLowerCase()))}</td><td>${esc(x.forma)}</td><td style="text-align:right">${eur(x.imp)}</td></tr>`).join("")}</tbody></table></details>`:C.hayArgos?`<p class="note" style="color:var(--ok);margin:6px 0 0">✓ Todos los cobros por banco tienen su factura en Argos.</p>`:""}</div>`}
function vFacturacion(){gbEscuchar();ventasEscuchar();
  if(!GT.facSem){const h=todayISO();GT.facSem=sumaDias(lunesSem(h),-7)}const E=ensayoFacturas(GT.facSem),vis=GT.facSolo?E.alb.filter(x=>!x.arg):E.alb,b=E.bancoSem,F=E.fac;
  const fila=(l,f,bb,nota)=>`<tr><td>${l}${nota?` <span class="note">${nota}</span>`:""}</td><td style="text-align:right">${eur(bb)}</td><td style="text-align:right">${eur(f)}</td><td style="text-align:right;${Math.abs(f-bb)>0.5?"color:var(--warn);font-weight:600":""}">${eurS(r2(f-bb))}</td></tr>`;
  return `<div class="bar"><h2>Facturación semanal</h2><span class="legend"><button class="btn small" data-tf="facno">← Volver a Tarifas</button></span></div>
  ${feAviso()}
  ${vCuadreArgos()}
  ${vContadores()}
  <div class="bar" style="margin-top:16px;gap:8px;flex-wrap:wrap"><h2 style="font-size:19px;margin-right:auto">Semana del ${fmtFecha(E.lun)} al ${fmtFecha(E.dom)}</h2>
    <button class="btn small" data-tf="facsem" data-d="-7">← Anterior</button><label class="f" style="flex:0 1 160px;margin:0"><input type="date" id="gt-facsem" value="${E.lun}" aria-label="Semana"></label><button class="btn small" data-tf="facsem" data-d="7">Siguiente →</button>
    <button class="btn small" data-tf="facxls">Descargar Excel del ensayo</button></div>
  ${feBloque(E.lun)}
  <details class="fd" style="margin-top:18px"><summary><b>Cuadre con el banco y comparación con Argos (ensayo)</b></summary>
  <p class="note">Simulación de cómo cuadra lo facturado con lo que entró en el banco, comparada con las facturas que emite Argos. La numeración de esta parte es solo de ensayo.</p>
  <div class="stats"><div class="stat"><b>${eur(E.bancoTot)}</b><span>Entró en el banco esta semana</span></div>
    <div class="stat"><b>${eur(E.tot)}</b><span>A facturar: ${E.alb.length} factura${E.alb.length===1?"":"s"}${E.alb.length?` (${esc(E.alb[0].fac)} a ${esc(E.alb[E.alb.length-1].fac)})`:""}</span></div>
    <div class="stat"><b style="color:var(${Math.abs(E.tot-E.bancoTot)>0.5?"--warn":"--ok"})">${eurS(r2(E.tot-E.bancoTot))}</b><span>Facturado − banco</span></div>
    <div class="stat"><b style="color:var(${E.efPendTot>0.5?"--warn":"--ok"})">${eur(E.efPendTot)}</b><span>Efectivo cobrado pendiente de facturar (${E.efPend.length} ${E.efPend.length===1?"albarán":"albaranes"})</span></div></div>
  <div class="panel" style="padding:10px 12px"><b>Lo que entró en el banco y lo que se factura</b>
    <table class="ft" style="min-width:0;width:100%"><thead><tr><th></th><th style="text-align:right">Banco</th><th style="text-align:right">A facturar</th><th style="text-align:right">Diferencia</th></tr></thead><tbody>
    ${fila("Tarjeta (TPV)",F.tpv,b.tpv)}${fila("Bizum",F.bizum,b.bizum)}${fila("Transferencias",F.transf,b.transf)}
    ${fila("Efectivo ingresado en el cajero",F.ef,b.deposito,"(albaranes en contado más antiguos)")}
    ${F.otras?`<tr><td>Sin forma de pago <span class="note">(revísala en Argos)</span></td><td style="text-align:right">—</td><td style="text-align:right">${eur(F.otras)}</td><td></td></tr>`:""}
    <tr style="font-weight:700"><td>Total de la semana</td><td style="text-align:right">${eur(E.bancoTot)}</td><td style="text-align:right">${eur(E.tot)}</td><td style="text-align:right">${eurS(r2(E.tot-E.bancoTot))}</td></tr>
    ${E.acums.map(q=>`<tr style="font-weight:700;background:var(--soft,#f3efea)"><td>${q.cierra?"Cierre del":"Acumulado del"} ${esc(periodoTxt(q.trim))} <span class="note" style="font-weight:400">(del ${fmtFecha(q.desde)} al ${fmtFecha(q.hasta)}${q.cierra?"":`; el trimestre acaba el ${fmtFecha(q.fin)}`})</span></td><td style="text-align:right">${eur(q.banco)}</td><td style="text-align:right">${eur(q.fac)}</td><td style="text-align:right;${Math.abs(q.fac-q.banco)>0.5?"color:var(--warn)":"color:var(--ok)"}">${eurS(r2(q.fac-q.banco))}</td></tr>`).join("")}</tbody></table>
    <p class="note" style="margin:6px 0 0">La tarjeta y el Bizum llegan al banco con uno o dos días de retraso: lo cobrado a final de semana aparece en la semana siguiente. ${E.sobraDep>0.5?(E.efPend.length?` En el efectivo quedan ${eur(E.sobraDep)} ingresados que no llegan para el siguiente albarán (${eur(E.efPend[0].imp)}): se cubrirán con el próximo ingreso.`:` En el efectivo se ha ingresado ${eur(E.sobraDep)} más de lo cobrado en contado desde el ${fmtFecha(E.ini)}: puede ser efectivo de antes de esa fecha.`):""}</p></div>
  ${E.efPend.length?`<details class="panel" style="padding:10px 12px;margin-top:10px"><summary><b>Efectivo cobrado pendiente de facturar: ${eur(E.efPendTot)}</b> <span class="note">· se facturará cuando se ingrese en el cajero</span></summary>
    ${E.efPend.map(x=>`<div class="row"><span class="note" style="min-width:76px">${fmtFecha(x.fp)}</span><span class="grow">${esc(titulo(x.a.nombre))} <span class="note">· albarán ${esc(x.r.numero||"—")}</span></span><b>${eur(x.imp)}</b></div>`).join("")}</details>`:""}
  <div class="bar" style="margin-top:12px"><h2 style="font-size:19px">Ensayo: facturas de la semana frente a Argos</h2><label class="chk" style="margin:0"><input type="checkbox" id="gt-facsolo" ${GT.facSolo?"checked":""}><span>Solo las que no encuentro en Argos</span></label></div>
  <div class="panel">${vis.map(x=>`<div class="row" style="flex-wrap:wrap;padding:6px 12px"><span style="min-width:110px;font-variant-numeric:tabular-nums"><b>${esc(x.fac)}</b></span>
    <span class="note" style="min-width:76px">${fmtFecha(x.fp)}</span><span class="grow" style="white-space:normal"><a href="#" data-act="ir" data-id="${esc(x.id)}" style="color:inherit">${esc(titulo(x.a.nombre))}</a><br><span class="note">Albarán ${esc(x.r.numero||"—")} · ${esc(x.r.concepto||x.r.curso||"")} · ${esc(x.forma||"sin forma de pago")}${x.t==="ef"&&x.fp<E.lun?" · cobrado antes, ingresado esta semana":""}</span></span>
    <b style="min-width:80px;text-align:right">${eur(x.imp)}</b><span style="min-width:170px;text-align:right" class="note">${x.arg?`<span style="color:var(--ok)">= Argos ${esc(x.arg.n)}</span> (${fmtFecha(x.arg.f)})`:E.hayArgos?`<span style="color:var(--warn)">sin factura en Argos</span>`:""}</span></div>`).join("")||`<div class="empty">${E.alb.length?"Todas tienen su factura en Argos.":"Nada que facturar esta semana."}</div>`}</div></details>`}
document.addEventListener("change",e=>{if(e.target&&e.target.id==="gt-facsolo"){GT.facSolo=e.target.checked;render()}});
async function facturacionExcel(){try{await cargarJs(XLSXJS)}catch(_){toast("No se ha podido cargar el generador de Excel.");return}
  const E=ensayoFacturas(GT.facSem),X=window.XLSX,wb=X.utils.book_new(),F=E.fac,b=E.bancoSem;
  X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([["Factura (ensayo)","Fecha de pago","Albarán","Alumno","Concepto","Forma de pago","Importe","Factura Argos","Fecha Argos"],
    ...E.alb.map(x=>[x.fac,x.fp,x.r.numero||"",titulo(x.a.nombre),x.r.concepto||x.r.curso||"",x.forma,x.imp,x.arg?x.arg.n:"",x.arg?x.arg.f:""]),["","","","","","Total",E.tot]]),"Facturas");
  X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([["","Banco","A facturar","Diferencia"],["Tarjeta (TPV)",b.tpv,F.tpv,r2(F.tpv-b.tpv)],["Bizum",b.bizum,F.bizum,r2(F.bizum-b.bizum)],["Transferencias",b.transf,F.transf,r2(F.transf-b.transf)],
    ["Efectivo ingresado en el cajero",b.deposito,F.ef,r2(F.ef-b.deposito)],["Sin forma de pago","",F.otras,""],["Total de la semana",E.bancoTot,E.tot,r2(E.tot-E.bancoTot)],...E.acums.map(q=>[(q.cierra?"Cierre del ":"Acumulado del ")+periodoTxt(q.trim)+" ("+q.desde+" a "+q.hasta+")",q.banco,q.fac,r2(q.fac-q.banco)]),[],["Efectivo cobrado pendiente de facturar",E.efPendTot]]),"Cuadre");
  X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([["Fecha de pago","Albarán","Alumno","Importe"],...E.efPend.map(x=>[x.fp,x.r.numero||"",titulo(x.a.nombre),x.imp])]),"Efectivo pendiente");
  X.writeFile(wb,`facturacion-ensayo-${E.lun}.xlsx`)}

/* ============================================================================================
   Borrar los datos de prueba (01/11/2026). Accesos, solo dirección. Solo toca lo anterior al arranque real (1/1/2027):
   movimientos del banco y sus justificantes, facturas de venta de Argos y sus PDF, copias enviadas a la asesoría y la caja de
   prueba. No toca alumnos, tarifas, contadores ni las reglas aprendidas del banco (config/banco.reglas).
   ============================================================================================ */
const LP_HASTA="2027-01-01",LP={c:null,sel:{banco:true,ventas:true,ase:true,caja:true},busy:"",res:""};
const LP_TXT={banco:"Movimientos del banco y sus justificantes",ventas:"Facturas de venta de Argos y sus PDF",ase:"Copias enviadas a la asesoría",caja:"Caja de prueba (cobros, aperturas, cierres…)"};
async function lpContar(){LP.busy="Contando…";LP.res="";render();const m=LP_HASTA.slice(0,7),c={};
  try{const b=(await S.db.collection("banco").where("mes","<",m).get()).docs.map(d=>({id:d.id,...d.data()}));c.banco={docs:b.map(d=>"banco/"+d.id),arch:b.flatMap(d=>Object.values(d.movs||{}).flatMap(x=>[x.just&&x.just.id,x.doc&&x.doc.id]).filter(Boolean)),n:b.reduce((s2,d)=>s2+Object.keys(d.movs||{}).length,0),meses:b.map(d=>d.id).sort()}}catch(e){c.banco={err:true}}
  try{const v=(await S.db.collection("ventas").get()).docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.id<m);c.ventas={docs:v.map(d=>"ventas/"+d.id),arch:[...new Set(v.flatMap(d=>[...(d.pdfs||[]),...(d.lis||[])].map(x=>x.id)))],n:v.reduce((s2,d)=>s2+(d.l||[]).length,0),meses:v.map(d=>d.id).sort()}}catch(e){c.ventas={err:true}}
  try{const a=(await S.db.collection("asesoria").get()).docs.filter(d=>d.id<m);c.ase={docs:a.map(d=>"asesoria/"+d.id),arch:[],n:a.length,meses:a.map(d=>d.id).sort()}}catch(e){c.ase={err:true}}
  try{const k=(await S.db.collection("caja").where("dia","<",LP_HASTA).get()).docs;c.caja={docs:k.map(d=>"caja/"+d.id),arch:[],n:k.length,meses:[...new Set(k.map(d=>String(d.data().dia||"").slice(0,7)))].sort()}}catch(e){c.caja={err:true}}
  LP.c=c;LP.busy="";render()}
async function lpBorrar(){const c=LP.c;if(!c)return;const ks=Object.keys(LP.sel).filter(k=>LP.sel[k]&&c[k]&&!c[k].err);if(!ks.length){toast("Marca qué quieres borrar");return}
  if(String(($("#lp-ok")||{}).value||"").trim().toUpperCase()!=="BORRAR"){toast("Escribe BORRAR para confirmar");return}
  const as=await window.claude.use("assets");let nd=0,na=0,mal=0;
  for(const k of ks){for(const id of c[k].arch){LP.busy=`Borrando archivos… ${na+1}`;render();try{await as.delete(id);na++}catch(_){mal++}}
    for(const p of c[k].docs){LP.busy=`Borrando ${LP_TXT[k].toLowerCase()}… ${nd+1}`;render();try{await S.db.doc(p).delete();nd++}catch(e){mal++;if(k==="caja"&&/perm/i.test(String((e&&e.fb)||"")+" "+(e&&e.message)))LP.permCaja=true}}}
  LP.busy="";LP.c=null;LP.res=`Borrados ${nd} documentos y ${na} archivos.${mal?` ${mal} no se han podido borrar${LP.permCaja?" (la caja necesita las reglas nuevas de Firebase)":""}.`:""}`;
  if(GB.sub)try{GB.sub()}catch(_){};GB.sub=null;render()}
function vLimpieza(){if(S.role!=="dir"||esMos()||todayISO()>="2027-03-01")return "";const c=LP.c;
  return `<div class="panel" style="grid-column:1/-1"><h3>Borrar los datos de prueba</h3>
    <p class="note" style="margin-top:0">Antes del arranque real (1 de enero de 2027). Solo borra lo de <b>antes del 1/1/2027</b>. No toca alumnos, horarios, recibos de Argos, tarifas, contadores ni lo que el banco ya ha aprendido a clasificar.</p>
    ${LP.res?`<p style="color:var(--ok)">${esc(LP.res)}</p>`:""}${LP.busy?`<p class="note">${esc(LP.busy)}</p>`:""}
    ${!c?`<button class="btn small" data-lp="contar" ${LP.busy?"disabled":""}>Ver qué hay de prueba</button>`:`
    ${Object.keys(LP_TXT).map(k=>{const x=c[k];return `<label class="chk" style="display:flex;margin:4px 0"><input type="checkbox" data-lpsel="${k}" ${LP.sel[k]?"checked":""} ${!x||x.err||!x.docs.length?"disabled":""}><span><b>${esc(LP_TXT[k])}</b> · ${!x||x.err?`<span style="color:var(--warn)">no se ha podido leer</span>`:!x.docs.length?"nada":`${x.n} ${(k==="banco"?["movimiento","movimientos"]:k==="ventas"?["factura","facturas"]:k==="ase"?["mes enviado","meses enviados"]:["apunte","apuntes"])[x.n===1?0:1]}${x.arch.length?` y ${x.arch.length} ${x.arch.length===1?"archivo":"archivos"}`:""} (${x.meses.map(mesTxt).join(", ")})`}</span></label>`}).join("")}
    <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 220px;margin:0">Escribe BORRAR para confirmar<input id="lp-ok" autocomplete="off"></label>
      <button class="btn small danger" data-lp="borrar" ${LP.busy?"disabled":""}>Borrar lo marcado</button><button class="btn small" data-lp="cancelar">Cancelar</button></div>
    <p class="note">No se puede deshacer.</p>`}</div>`}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-lp]");if(!t||S.role!=="dir"||esMos())return;e.preventDefault();
  if(t.dataset.lp==="contar")await lpContar();else if(t.dataset.lp==="cancelar"){LP.c=null;render()}else if(t.dataset.lp==="borrar"){if(confirm("¿Borrar definitivamente los datos de prueba marcados?"))await lpBorrar()}});
document.addEventListener("change",e=>{const t=e.target;if(t&&t.dataset&&t.dataset.lpsel){LP.sel[t.dataset.lpsel]=t.checked}});

/* ============================================================================================
   Rentabilidad (01/11/2026). Gastos → «Rentabilidad», solo dirección. Por mes: ingresos de la actividad (todo lo cobrado
   según Argos + otros ingresos del banco), gastos de la actividad (banco) y resultado. Solo meses con extracto completo
   (10 movimientos o más). Gráficos en SVG propio: ingresos y gastos por mes (barras agrupadas), resultado por mes
   (azul si gana, rojo si pierde, con signo), gastos por categoría y tabla de datos. Colores validados (dataviz):
   ingresos #2a78d6 / gastos #eb6834 (claro) y #3987e5 / #d95926 (oscuro); pérdida #e34948 / #e66767.
   ============================================================================================ */
const RT={per:"",modo:"todo"};
/* 14/11/2026 (titular: «el resultado es a mes concluido»): las nóminas cuentan en el mes al que pertenecen, no en el de la
   transferencia (las de octubre se pagan el 2/11). Primero por el enlace nómina–movimiento (nominas/<id>.mov); si no lo hay,
   una transferencia de nómina de los 10 primeros días es del mes anterior. La Seguridad Social, igual que antes (mes anterior). */
function imputaMes(m){const ant=x=>sumaDias(x+"-01",-1).slice(0,7);if(m.cat==="ssemp")return ant(m.mes);
  if(m.cat==="nominas"){const n=NM.docs.find(d=>d.mov&&d.mov.id===m.id&&d.mov.mes===m.mes&&d.mes);if(n)return n.mes;
    const f=String(m.fv||m.fo||"");if(f.slice(0,7)===m.mes&&+f.slice(8,10)<=10)return ant(m.mes)}
  return m.mes}
function datosRent(){nmEscuchar();const hoyM=todayISO().slice(0,7),docs=GB.docs.filter(d=>Object.keys(d.movs||{}).length>=10&&d.id>=mesInicio()&&d.id<hoyM).map(d=>d.id).sort();
  /* La Seguridad Social de las empleadas se carga a final del mes siguiente (el TC1 cobrado en octubre es de septiembre):
     cuenta en el mes al que pertenece. Si ese cargo aún no ha llegado, se toma la del listado de costes de A3 (prevista). */
  const imputa=imputaMes,todos=movsTodos();RT.ssPrev={};
  return docs.map(mes=>{const movs=todos.filter(m=>m.mes===mes),IA=ingresosActividad(mes,movs),porCat={};
    for(const m of todos)if(catTipo(m.cat)==="g"&&imputa(m)===mes)porCat[m.cat]=r2((porCat[m.cat]||0)-m.importe);
    if(!porCat.ssemp){const L=typeof nmListado==="function"?nmListado(mes):null;if(L&&L.tot&&L.tot.sstot){porCat.ssemp=L.tot.sstot;RT.ssPrev[mes]=L.tot.sstot}}
    const gas=r2(Object.values(porCat).reduce((s2,v)=>s2+v,0)),bk=k=>r2(movs.filter(m=>m.cat===k).reduce((s2,m)=>s2+m.importe,0));
    const ingBanco=r2(bk("tpv")+bk("bizum")+bk("transf")+bk("otrosing")+semanasEfectivo(mes).ing),ing=RT.modo==="banco"?ingBanco:IA.total;
    return {mes,ing,ingTodo:IA.total,ingBanco,gas,res:r2(ing-gas),porCat,personal:r2((porCat.nominas||0)+(porCat.ssemp||0)),sinNom:!porCat.nominas,sinArgos:!IA.co.n,pend:movs.filter(m=>(m.cat||"pend")==="pend").length}})}
const rtCss=`<style>.rt{--rt-ing:#2a78d6;--rt-gas:#eb6834;--rt-pos:#2a78d6;--rt-neg:#e34948;--rt-grid:var(--line);--rt-txt:var(--muted)}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]) .rt{--rt-ing:#3987e5;--rt-gas:#d95926;--rt-pos:#3987e5;--rt-neg:#e66767}}
:root[data-theme="dark"] .rt{--rt-ing:#3987e5;--rt-gas:#d95926;--rt-pos:#3987e5;--rt-neg:#e66767}
.rt svg{display:block;width:100%;height:auto;overflow:visible}.rt svg text{font:12px var(--sans,system-ui);fill:var(--rt-txt)}.rt .hit{fill:transparent;cursor:default}.rt .hit:hover{fill:var(--sunk);opacity:.5}
.rt .leg{display:flex;gap:14px;font-size:13px;color:var(--ink);margin:2px 0 6px}.rt .leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px;vertical-align:-1px}
#rt-tip{position:fixed;z-index:50;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:6px 9px;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.12);display:none;line-height:1.45}</style>`;
const rtEje=max=>{if(max<=0)return [0];const p=Math.pow(10,Math.floor(Math.log10(max))),st=[1,2,2.5,5,10].map(k=>k*p).find(k=>max/k<=5)||p*10;const o=[];for(let v=0;v<=max+st*0.001;v+=st)o.push(v);if(o[o.length-1]<max)o.push(o[o.length-1]+st);return o};
const eurK=v=>Math.abs(v)>=1000?(Math.round(v/100)/10).toLocaleString("es-ES")+" mil €":eur(v);
/* barras agrupadas ingresos/gastos por mes */
function svgIngGas(L){const W=1100,H=260,ml=58,mr=8,mt=10,mb=28,iw=W-ml-mr,ih=H-mt-mb,max=Math.max(1,...L.flatMap(x=>[x.ing,x.gas])),ej=rtEje(max),top=ej[ej.length-1],y=v=>mt+ih-ih*v/top;
  const bw=iw/L.length,gw=Math.min(54,bw*0.62),b=Math.max(2,gw/2-1);
  const barra=(x,v,col)=>{const h=Math.max(0,ih*v/top),yy=mt+ih-h,r=Math.min(4,h,b/2);return h<=0?"":`<path d="M${x},${mt+ih} V${yy+r} Q${x},${yy} ${x+r},${yy} H${x+b-r} Q${x+b},${yy} ${x+b},${yy+r} V${mt+ih} Z" fill="${col}"/>`};
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos por mes">${ej.map(v=>`<line x1="${ml}" x2="${W-mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rt-grid)" stroke-width="${v?1:1.5}"/><text x="${ml-8}" y="${y(v)+4}" text-anchor="end">${eurK(v)}</text>`).join("")}
    ${L.map((x,i)=>{const cx=ml+bw*i+bw/2,x0=cx-gw/2;return `${barra(x0,x.ing,"var(--rt-ing)")}${barra(x0+b+2,x.gas,"var(--rt-gas)")}<text x="${cx}" y="${H-8}" text-anchor="middle">${MESES[+x.mes.slice(5)-1].slice(0,3)}${x.mes.slice(5)==="01"||i===0?" "+x.mes.slice(2,4):""}</text>
      <rect class="hit" x="${ml+bw*i}" y="${mt}" width="${bw}" height="${ih}" data-rt="${i}"/>`}).join("")}</svg>`}
/* resultado por mes, barras desde cero */
function svgRes(L){const W=1100,H=210,ml=58,mr=8,mt=14,mb=28,iw=W-ml-mr,ih=H-mt-mb,mx=Math.max(1,...L.map(x=>Math.abs(x.res))),hasNeg=L.some(x=>x.res<0),hasPos=L.some(x=>x.res>0);
  const ej=rtEje(mx),top=ej[ej.length-1],lo=hasNeg?-top:0,hi=hasPos||!hasNeg?top:0,y=v=>mt+ih*(hi-v)/(hi-lo),z=y(0),bw=iw/L.length,b=Math.min(34,bw*0.5);
  const marcas=[...new Set([...(hasNeg?ej.map(v=>-v):[]),...(hi?ej:[0])])].sort((a,b2)=>a-b2);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Resultado por mes">${marcas.map(v=>`<line x1="${ml}" x2="${W-mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rt-grid)" stroke-width="${v?1:1.5}"/><text x="${ml-8}" y="${y(v)+4}" text-anchor="end">${v<0?"−":""}${eurK(Math.abs(v))}</text>`).join("")}
    ${L.map((x,i)=>{const cx=ml+bw*i+bw/2,x0=cx-b/2,yy=y(x.res),h=Math.abs(yy-z),r=Math.min(4,h,b/2),pos=x.res>=0;
      const d=h<=0?"":pos?`M${x0},${z} V${yy+r} Q${x0},${yy} ${x0+r},${yy} H${x0+b-r} Q${x0+b},${yy} ${x0+b},${yy+r} V${z} Z`:`M${x0},${z} V${yy-r} Q${x0},${yy} ${x0+r},${yy} H${x0+b-r} Q${x0+b},${yy} ${x0+b},${yy-r} V${z} Z`;
      return `${d?`<path d="${d}" fill="var(${pos?"--rt-pos":"--rt-neg"})"/>`:""}
        <text x="${cx}" y="${H-8}" text-anchor="middle">${MESES[+x.mes.slice(5)-1].slice(0,3)}${x.mes.slice(5)==="01"||i===0?" "+x.mes.slice(2,4):""}</text><rect class="hit" x="${ml+bw*i}" y="${mt}" width="${bw}" height="${ih}" data-rt="${i}"/>`}).join("")}</svg>`}
function rtDesglose(k,L){const ms=new Set(L.map(x=>x.mes)),l=movsTodos().filter(m=>ms.has(imputaMes(m))&&m.cat===k).sort((a,b)=>String(b.fv).localeCompare(String(a.fv)));
  return `<div style="margin:2px 0 10px 18px;border-left:2px solid var(--line);padding-left:10px">${l.map(m=>`<div class="row" style="flex-wrap:wrap;padding:3px 0;font-size:13px"><span class="note" style="min-width:70px">${fmtFecha(m.fv)}</span><span class="grow" style="white-space:normal">${esc(m.concepto)}${m.ordenante||m.obs?` <span class="note">· ${esc([m.ordenante?titulo(String(m.ordenante).toLowerCase()):"",m.obs||""].filter(Boolean).join(" · "))}</span>`:""}${m.nota?` <span class="note">«${esc(m.nota)}»</span>`:""}</span>
    <b style="min-width:80px;text-align:right;font-variant-numeric:tabular-nums">${eur(r2(-m.importe))}</b><span style="min-width:120px;text-align:right">${(()=>{const {j,d}=docsMov(m),f=faltas(m);return [j?`<a href="#" data-blob="${esc(j.id)}">🏦</a>`:f.j?`<span class="badge b-pend">Falta just.</span>`:"",d?`<a href="#" data-blob="${esc(d.id)}">📄</a>`:f.d?`<span class="badge b-pend">Falta ${esc((DOC_TXT[docReq(m)]||"").toLowerCase().replace(/ \(.*/,""))}</span>`:""].filter(Boolean).join(" ")||`<span class="note">—</span>`})()}</span>
    <select data-gbcat="${esc(m.mes)}|${esc(m.id)}" aria-label="Categoría" style="max-width:180px;font-size:12px">${CATS.filter(([c])=>c!=="pend").map(([c,lb])=>`<option value="${c}" ${c===m.cat?"selected":""}>${esc(lb)}</option>`).join("")}</select></div>`).join("")||`<p class="note">Sin movimientos.</p>`}
    <p class="note" style="margin:4px 0 0">${l.length} movimiento${l.length===1?"":"s"}. Puedes cambiar la categoría aquí mismo.</p></div>`}
/* ---------- Previsión de fin de mes (21/11/2026, titular; solo dirección) ----------
   «Cuánto dinero debo tener al final de cada mes para afrontar los pagos»: con el historial del banco busca los gastos que se repiten
   (mismo tipo de gasto y concepto en al menos 2 de los últimos 4 meses cerrados), su día habitual y su importe (media de los últimos;
   nóminas y SS, el último). Suma los que caen entre el día PV_INI de un mes y el PV_FIN del siguiente (nóminas, Seguridad Social,
   alquiler, recibos…) más los impuestos domiciliados que haya puesto la asesoría. Se puede quitar una línea (config/banco.prevNo). */
const PV_INI=20,PV_FIN=10;
const mesAntPv=m=>sumaDias(m+"-01",-1).slice(0,7),mesSigPv=m=>sumaDias(m+"-28",5).slice(0,7);
const diasMesPv=m=>+sumaDias(mesSigPv(m)+"-01",-1).slice(8,10);
const prevKey=m=>(m.cat||"pend")+"|"+String(m.concepto||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\d+/g," ").replace(/[^A-Z ]/g," ").replace(/\b(COMPRA|TARJ|TRANSFERENCIA|ADEUDO|RECIBO|A|DE|LA|EL|SL|SA|SLU)\b/g," ").replace(/\s+/g," ").trim().split(" ").slice(0,3).join(" ");
function prevRecurrentes(){
  const hoy=todayISO();let m=hoy.slice(0,7);const meses=[];for(let i=0;i<4;i++){m=mesAntPv(m);meses.push(m)}
  /* los impuestos van aparte (trimestrales, ver vPrevision); aquí solo los demás gastos */
  const l=movsTodos().filter(x=>x.importe<0&&meses.includes(String(x.fv).slice(0,7))&&catTipo(x.cat)==="g"&&x.cat!=="impuestos"&&!/AEAT|AGENCIA TRIB|HACIENDA|^IMPUESTOS/i.test(x.concepto||""));
  const g=new Map();for(const x of l){const k=prevKey(x);if(!g.has(k))g.set(k,[]);g.get(k).push(x)}
  const out=[];for(const [k,xs] of g){const porMes={};for(const x of xs){const mm=String(x.fv).slice(0,7);porMes[mm]=(porMes[mm]||0)+(-x.importe)}
    const ms=Object.keys(porMes).sort();if(ms.length<2)continue;
    const dias=xs.map(x=>+String(x.fv).slice(8,10)).sort((a,b)=>a-b),dia=dias[Math.floor(dias.length/2)];
    const vals=ms.map(k=>porMes[k]),ult=vals[vals.length-1],med=vals.slice(-3).reduce((s,v)=>s+v,0)/Math.min(3,vals.length);
    const ultMov=xs.sort((a,b)=>String(a.fv).localeCompare(String(b.fv)))[xs.length-1];
    /* 21/11/2026: cada cuánto se paga (1 = todos los meses, 3 = trimestral…): la menor distancia entre meses con cargo */
    const nm=k=>{const [y,m]=k.split("-").map(Number);return y*12+m},dif=ms.slice(1).map((k,i)=>nm(k)-nm(ms[i])),per=Math.max(1,Math.min(...dif));
    out.push({k,cat:ultMov.cat,txt:ultMov.concepto,dia,imp:r2(["nominas","ssemp","ssaut","alquiler"].includes(ultMov.cat)?ult:med),n:ms.length,ult:r2(ult),per,ultMes:ms[ms.length-1],nm})}
  return out}
/* fecha prevista de una línea en la ventana que empieza el día PV_INI del mes M */
function prevFecha(x,M){const d=x.dia;if(d>=PV_INI){const mm=Math.min(d,diasMesPv(M));return `${M}-${String(mm).padStart(2,"0")}`}if(d<=PV_FIN){const N=mesSigPv(M);return `${N}-${String(d).padStart(2,"0")}`}return null}
function vPrevision(){gbEscuchar();imEscuchar();
  const back=`<div class="bar"><h2>Previsión de fin de mes</h2><span class="legend"><button class="btn small" data-gb="prevno">← Volver a Gastos</button></span></div>`;
  if(!GB.ok)return back+`<p class="note">Cargando el banco…</p>`;
  const R=prevRecurrentes(),no=new Set((GB.cfg&&GB.cfg.prevNo)||[]),hoy=todayISO(),todos=movsTodos();
  /* saldo: el último movimiento con saldo de cada cuenta */
  /* 25/11/2026: saldo = el último movimiento de cada cuenta. Si el último día tiene varios movimientos, el último es el que deja el saldo
     que no es el «saldo anterior» de ningún otro de ese día (antes se cogía uno cualquiera de ese día) */
  const ult={};{const por={};for(const x of todos)if(x.saldo!=null&&x.cuenta!=="caja")(por[x.cuenta]=por[x.cuenta]||[]).push(x);
    for(const [c,l] of Object.entries(por)){const fmax=l.reduce((m,x)=>String(x.fo||x.fv)>m?String(x.fo||x.fv):m,""),dia=l.filter(x=>String(x.fo||x.fv)===fmax);
      const prev=new Set(dia.map(x=>r2(+x.saldo-(+x.importe||0)).toFixed(2)));ult[c]=dia.find(x=>!prev.has(r2(+x.saldo).toFixed(2)))||dia[dia.length-1]}}
  const saldoTot=r2(Object.values(ult).reduce((s,x)=>s+(+x.saldo||0),0));
  const pagado=(x,f)=>todos.some(m=>m.importe<0&&prevKey(m)===x.k&&Math.abs(difDias(m.fv,f))<=6);
  const meses=[];let M=hoy.slice(0,7);if(+hoy.slice(8,10)>PV_FIN&&+hoy.slice(8,10)<PV_INI){}for(let i=0;i<3;i++){meses.push(M);M=mesSigPv(M)}
  /* si hoy es del 1 al PV_FIN, la ventana del mes anterior aún está abierta */
  if(+hoy.slice(8,10)<=PV_FIN)meses.unshift(mesAntPv(hoy.slice(0,7))),meses.pop();
  /* 21/11/2026 (titular): con las nóminas subidas, la Seguridad Social de empleadas (se carga a fin del mes siguiente) sale del listado
     de costes (SS total) o, si solo están las nóminas, se estima con el bruto y la proporción SS/bruto del último listado; y cada
     transferencia de nómina, con el líquido de su nómina */
  const pal=t=>new Set(String(t||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").split(/[^A-Z]+/).filter(w=>w.length>2));
  const nomL=m=>{try{return typeof nmListado==="function"?nmListado(m):null}catch(_){return null}},noms=m=>{try{return typeof nmDe==="function"?nmDe(m):[]}catch(_){return []}};
  const ultL=(()=>{let m=hoy.slice(0,7);for(let i=0;i<6;i++){const L=nomL(m);if(L&&L.tot&&+L.tot.sstot>0&&+L.tot.bruto>0)return L;m=mesAntPv(m)}return null})();
  const ajNom=x=>{const X=x.f.slice(0,7);
    if(x.cat==="ssemp"){const P=mesAntPv(X),L=nomL(P),TC=NM.docs.find(d=>d.id===P+"_tc1");
      if(TC&&+TC.imp>0)return {...x,imp:r2(+TC.imp),txt:`${x.txt} · según el TC1 de ${mesTxt(P)}`,exacto:true};
      if(L&&L.tot&&+L.tot.sstot>0)return {...x,imp:r2(+L.tot.sstot),txt:`${x.txt} · según el listado de costes de ${mesTxt(P)}`,exacto:true};
      const ns=noms(P).filter(n=>+n.bruto>0);if(ns.length&&ultL){const b=ns.reduce((s,n)=>s+(+n.bruto||0),0);return {...x,imp:r2(b*ultL.tot.sstot/ultL.tot.bruto),txt:`${x.txt} · estimada con las nóminas de ${mesTxt(P)}`,est:true}}return x}
    if(x.cat==="nominas"){const P=+x.f.slice(8,10)>=PV_INI?X:mesAntPv(X),cw=pal(x.txt),sinEsp=v=>String(v||"").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Z]/g,""),cc=sinEsp(x.txt),n=noms(P).find(n=>{let k=0;for(const w of pal(n.nombre))if(cw.has(w))k++;
        /* 25/11/2026: el banco a veces junta los apellidos («VERDUGOJURADO»): también vale si salen pegados */
        const ap=sinEsp(String(n.nombre).split(",")[0]);return (k>=2||(k>=1&&ap.length>5&&cc.includes(ap)))&&+n.liq>0});
      if(n)return {...x,imp:r2(+n.liq),txt:`${x.txt} · nómina de ${mesTxt(P)}`,exacto:true}}
    return x};
  const bloques=meses.map(M=>{
    const ini=`${M}-${PV_INI}`,fin=`${mesSigPv(M)}-${String(PV_FIN).padStart(2,"0")}`;
    const tocaPv=(x,f)=>{if(!x.per||x.per<=1)return true;const d=x.nm(f.slice(0,7))-x.nm(x.ultMes);return d>0&&d%x.per===0};
    const lin=R.map(x=>({...x,f:prevFecha(x,M)})).filter(x=>x.f&&x.f>=ini&&x.f<=fin&&tocaPv(x,x.f)).sort((a,b)=>a.f.localeCompare(b.f));
    /* 21/11/2026 (titular): impuestos trimestrales (303, 130, 111, 115…), que se cargan hasta el día 20 de enero, abril, julio y octubre:
       los que ha puesto la asesoría (importe y día) y, si aún no los ha puesto, una estimación con lo cargado el trimestre anterior */
    /* 22/11/2026 (titular): cada impuesto cuenta en el bloque en que se carga de verdad (el del 20/01 va en «fin de enero», no en diciembre).
       Los que ponga la asesoría entre el día 11 y el 19 (fuera de las ventanas) van al bloque de ese mes. */
    const N=M,esTri=["01","04","07","10"].includes(N.slice(5,7));
    const imp=(IM.docs||[]).filter(x=>+x.importe>0&&x.fecha&&x.fecha>=`${M}-${String(PV_FIN+1).padStart(2,"0")}`&&x.fecha<=fin&&!/centro|presencial|nrc/i.test(String(x.quien||""))&&!(typeof imCargo==="function"&&imCargo(x))).map(x=>({k:"imp|"+x.id,cat:"impuestos",txt:`Modelo ${x.modelo} (importe de la asesoría)`,f:x.fecha,imp:+x.importe,imp0:true}));
    if(esTri&&!imp.length){let q=N;for(let i=0;i<4;i++){q=mesAntPv(mesAntPv(mesAntPv(q)));const l=todos.filter(m=>m.importe<0&&String(m.fv).slice(0,7)===q&&+String(m.fv).slice(8,10)<=25&&(m.cat==="impuestos"||/AEAT|AGENCIA TRIB|HACIENDA|IMPUESTO/i.test(m.concepto||""))&&!/TGSS/i.test(m.concepto||""));
        if(l.length){for(const m of l)imp.push({k:"impest|"+prevKey(m),cat:"impuestos",txt:`${m.concepto} · estimado: lo cargado en ${mesTxt(q)}`,f:`${N}-20`,imp:r2(-m.importe),est:true});break}}
      if(!imp.length)imp.push({k:"impest|nada",cat:"impuestos",txt:`Impuestos del trimestre (303, 130, 111, 115…): sin datos todavía. Pide el importe a la asesoría.`,f:`${N}-20`,imp:0,est:true})}
      /* 22/11/2026 (titular): en enero (y cada trimestre) también se paga el 130, tu pago fraccionado del IRPF (hasta el día 30).
         Si la asesoría aún no lo ha puesto y no se cargó el trimestre anterior, se estima: 20 % del resultado (ingresos según el banco
         − gastos de la actividad) de los 3 meses del trimestre; los meses aún sin cerrar se cuentan con la media de los cerrados. */
      if(esTri&&!imp.some(x=>/\b130\b|ACTIVIDADES ECON/i.test(x.txt))){try{const Q=[mesAntPv(mesAntPv(mesAntPv(M))),mesAntPv(mesAntPv(M)),mesAntPv(M)],D=datosRent().filter(x=>Q.includes(x.mes));
        if(D.length){const r=D.reduce((t,x)=>t+(x.ingBanco-x.gas),0)/D.length*3,e=r2(Math.max(0,0.2*r));
          imp.push({k:"impest|130",cat:"impuestos",txt:`Modelo 130 (pago fraccionado de tu IRPF) · aprox.: 20 % del resultado de ${Q.map(m=>mesTxt(m).split(" ")[0]).join(", ")} según el banco (${eur(r2(r))}${D.length<3?`; ${3-D.length} mes${D.length===2?"":"es"} sin cerrar, con la media`:""})${e?"":" → sale a 0"}. El importe real lo da la asesoría`,f:`${M}-30`,imp:e,est:true})}}catch(_){}}
      {const k=imp.findIndex(x=>x.k==="impest|nada");if(k>=0&&imp.some(x=>x.k==="impest|130"))imp.splice(k,1)}
    const filas=[...lin.map(ajNom),...imp].sort((a,b)=>a.f.localeCompare(b.f)).map(x=>({...x,hecho:x.f<=hoy&&!x.imp0&&pagado(x,x.f),fuera:no.has(x.k)}));
    const pend=r2(filas.filter(x=>!x.fuera&&!x.hecho).reduce((s,x)=>s+x.imp,0)),total=r2(filas.filter(x=>!x.fuera).reduce((s,x)=>s+x.imp,0));
    return {M,ini,fin,filas,pend,total}});
  const actual=bloques[0];
  const caja=`<div class="stats" style="margin:8px 0 14px"><div class="stat"><b>${eur(saldoTot)}</b><span>Saldo en el banco según el último extracto${Object.values(ult).length?` (${Object.values(ult).map(x=>"…"+esc(String(x.cuenta).slice(-4))+" "+fmtFecha(x.fo||x.fv)).join(" · ")})`:""}</span></div>
    <div class="stat"><b>${eur(actual.pend)}</b><span>Pagos que faltan del ${fmtFecha(actual.ini)} al ${fmtFecha(actual.fin)}</span></div>
    <div class="stat"><b style="color:${saldoTot-actual.pend<0?"var(--bad)":"var(--ok)"}">${saldoTot-actual.pend<0?"Faltan ":"Sobran "}${eur(Math.abs(r2(saldoTot-actual.pend)))}</b><span>${saldoTot-actual.pend<0?"Hay que ingresar antes de esos pagos (sin contar lo que se cobre mientras)":"Con el saldo actual llega (sin contar lo que se cobre)"}</span></div></div>`;
  const tabla=b=>`<div class="panel" style="margin-bottom:12px"><div class="bar" style="margin-bottom:6px"><b style="font-size:16px">Fin de ${esc(mesTxt(b.M))}</b><span class="note">del ${fmtFecha(b.ini)} al ${fmtFecha(b.fin)}</span><span style="margin-left:auto;font-weight:700">Hay que tener: ${eur(b.total)}</span></div>
    ${b.filas.length?`<table class="pvt"><thead><tr><th>Día previsto</th><th>Pago</th><th>Tipo</th><th class="r">Importe</th><th></th></tr></thead><tbody>${b.filas.map(x=>`<tr style="${x.fuera?"opacity:.45;text-decoration:line-through":""}"><td>${fmtFecha(x.f)}</td><td>${esc(x.txt)}${x.n?` <span class="note">· ${x.per>1?`cada ${x.per} meses`:`${x.n} de los últimos meses`}</span>`:""}${x.est?` <span class="badge b-pend">estimado</span>`:""}${x.exacto?` <span class="badge b-si">real</span>`:""}</td><td class="note">${esc(catTxt(x.cat))}</td><td class="r">${eur(x.imp)}${x.hecho?` <span class="badge b-si">pagado</span>`:""}</td><td>${x.imp0||x.k==="impest|nada"?"":`<label class="chk" style="margin:0" title="Quitar de la previsión"><input type="checkbox" data-gbprev="${esc(x.k)}" ${x.fuera?"":"checked"}><span>contar</span></label>`}</td></tr>`).join("")}</tbody></table>`:`<p class="note">No hay pagos que se repitan en esas fechas.</p>`}
    ${b.pend!==b.total?`<p class="note" style="margin:6px 0 0">Ya pagado: ${eur(r2(b.total-b.pend))} · falta: <b>${eur(b.pend)}</b></p>`:""}</div>`;
  const css=`<style>.pvt{width:100%;border-collapse:collapse;font-size:14px}.pvt th{font:600 11px Inter,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);text-align:left;padding:6px 8px;border-bottom:1px solid var(--line)}.pvt td{padding:7px 8px;border-bottom:1px solid var(--line)}.pvt .r{text-align:right;white-space:nowrap}</style>`;
  return `${css}<div class="rt">${back}<p class="note">Pagos que se repiten en los últimos meses (nóminas, Seguridad Social, alquiler, seguros, recibos…) y que caen <b>entre el día ${PV_INI} y el ${PV_FIN} del mes siguiente</b>. Los impuestos del trimestre (cargo hasta el 20 de enero, abril, julio y octubre; el 130 y el 303, hasta el 30) salen en el bloque en que se cargan, el de fin de enero, abril, julio y octubre: el importe de la asesoría si ya lo ha puesto o, si no, una <b>estimación</b> con lo cargado el trimestre anterior; el <b>130</b> (tu pago fraccionado del IRPF), si la asesoría no lo ha puesto, se estima con el 20 % del resultado del trimestre según el banco. Importes: el último (nóminas, SS, alquiler) o la media de los 3 últimos meses. Desmarca «contar» en los que no tocan. Los cobros que entren esos días no se restan.</p>
    ${caja}${bloques.map(tabla).join("")}</div>`}
document.addEventListener("change",async e=>{const t=e.target;if(!t||!t.dataset||t.dataset.gbprev==null||!gbVer())return;const k=t.dataset.gbprev,l=new Set((GB.cfg&&GB.cfg.prevNo)||[]);if(t.checked)l.delete(k);else l.add(k);
  const cfg={...(GB.cfg||{}),prevNo:[...l]};try{await S.db.doc("config/banco").set(cfg);GB.cfg=cfg;render()}catch(_){toast("No se ha podido guardar")}});
function vRentabilidad(){gbEscuchar();const T=datosRent();
  const pers=[...new Set(T.map(x=>trimDe(x.mes)))].sort().reverse(),anios=[...new Set(T.map(x=>x.mes.slice(0,4)))].sort().reverse();
  if(!RT.per||(RT.per!=="todo"&&!pers.includes(RT.per)&&!anios.includes(RT.per)))RT.per="todo";
  const L=T.filter(x=>RT.per==="todo"||(RT.per.includes("-T")?trimDe(x.mes)===RT.per:x.mes.startsWith(RT.per)));RT.L=L;
  const sum=k=>r2(L.reduce((s2,x)=>s2+x[k],0)),ing=sum("ing"),gas=sum("gas"),res=r2(ing-gas),mg=ing?Math.round(res/ing*1000)/10:0,pers2=sum("personal");
  const act=[...S.alumnos.values()].filter(a=>!a.baja&&a.clases&&a.clases.length).length,porAl=L.length&&act?r2(ing/L.length/act):0;
  const cats={};for(const x of L)for(const [k,v] of Object.entries(x.porCat))cats[k]=r2((cats[k]||0)+v);const cl=Object.entries(cats).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const maxC=cl.length?cl[0][1]:1,perTxt=RT.per==="todo"?"todos los meses":RT.per.includes("-T")?periodoTxt(RT.per):"año "+RT.per;
  const avisos=L.filter(x=>x.sinArgos||x.pend||x.sinNom),hoyM=todayISO().slice(0,7);
  return `${rtCss}<div class="rt"><div class="bar"><h2>Rentabilidad</h2><span class="legend"><button class="btn small" data-gb="rentno">← Volver a Gastos</button></span></div>
  <div class="bar" role="tablist" style="gap:6px;margin-bottom:8px">${[["todo","Todo lo cobrado"],["banco","Según el banco (asesoría)"]].map(([k,l])=>`<button role="tab" class="chip" data-rtmodo="${k}" aria-selected="${(RT.modo||"todo")===k}" aria-pressed="${(RT.modo||"todo")===k}" style="${(RT.modo||"todo")===k?"background:var(--ink);color:var(--surface);border-color:var(--ink)":""}">${l}</button>`).join("")}</div>
  ${!T.length?`<div class="empty">Todavía no hay ningún mes terminado. Sube los extractos del banco en Gastos; el mes en curso cuenta cuando termina.</div>`:`
  <p class="note" style="margin:0 0 6px"><b>A mes concluido:</b> ${mesTxt(hoyM)} (en curso) no cuenta hasta que termine. Las nóminas cuentan en el mes al que pertenecen, aunque se paguen a primeros del siguiente.</p>
  <div class="bar" style="gap:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 220px">Periodo<select id="rt-per"><option value="todo" ${RT.per==="todo"?"selected":""}>Todos los meses (${T.length})</option><optgroup label="Años">${anios.map(a=>`<option value="${a}" ${RT.per===a?"selected":""}>${a}</option>`).join("")}</optgroup><optgroup label="Trimestres">${pers.map(k=>`<option value="${k}" ${RT.per===k?"selected":""}>${periodoTxt(k)}</option>`).join("")}</optgroup></select></label>
    <span class="note">${RT.modo==="banco"?"Ingresos = tarjeta, Bizum y transferencias del banco + efectivo ingresado en el cajero (por fecha del ingreso). Es lo que ve la asesoría.":"Ingresos = todo lo cobrado según Argos (por fecha de pago, cualquier forma: también el contado que no se ingresa) + otros ingresos del banco."} Gastos = gastos de la actividad del banco; la Seguridad Social de las empleadas cuenta en el mes al que pertenece (se carga el mes siguiente)${Object.keys(RT.ssPrev||{}).length?`; en ${Object.keys(RT.ssPrev).map(mesTxt).join(", ")} todavía no se ha cargado y se usa la del listado de costes de A3`:""}. No cuenta lo que no es de la actividad. ${cajaPrueba()?"<b>Datos de prueba.</b>":""}</span></div>
  ${avisos.length?`<div class="aviso pend" style="display:block">${avisos.map(x=>`${esc(mesTxt(x.mes))}: ${[x.sinArgos?"falta el listado de recibos de Argos (sin ingresos)":"",x.pend?`${x.pend} movimientos sin clasificar`:"",x.sinNom?"faltan las nóminas (aún no se han pagado o no se ha subido el extracto en que se pagan)":""].filter(Boolean).join(" y ")}`).join(" · ")}. Las cifras de esos meses pueden cambiar.</div>`:""}
  <div class="stats"><div class="stat"><b>${eur(ing)}</b><span>Ingresos ${RT.modo==="banco"?"por banco":"(todo lo cobrado)"} · ${esc(perTxt)}</span></div><div class="stat"><b>${eur(gas)}</b><span>Gastos</span></div>
    <div class="stat"><b style="color:var(${res>=0?"--ok":"--bad"})">${eurS(res)}</b><span>Resultado${res<0?" (pérdida)":""}</span></div>
    <div class="stat"><b>${(mg<0?"−":"")+Math.abs(mg).toLocaleString("es-ES")} %</b><span>Margen (resultado ÷ ingresos)</span></div>
    <div class="stat"><b>${ing?Math.round(pers2/ing*100):0} %</b><span>Personal (nóminas y Seguridad Social empleadas) sobre ingresos</span></div>
    <div class="stat"><b>${eur(porAl)}</b><span>Ingreso medio al mes por alumno activo (${act} alumnos)</span></div></div>
  <div class="panel" style="padding:12px 14px;margin-top:10px"><b>Ingresos y gastos por mes</b><div class="leg"><span><i style="background:var(--rt-ing)"></i>Ingresos</span><span><i style="background:var(--rt-gas)"></i>Gastos</span></div>${svgIngGas(L)}</div>
  <div class="panel" style="padding:12px 14px;margin-top:10px"><b>Resultado por mes</b> <span class="note">(ingresos − gastos; en azul los meses con beneficio, en rojo los de pérdida)</span>${L.length?`<div class="leg"><span>Último mes, ${esc(mesTxt(L[L.length-1].mes))}: <b>${eurS(L[L.length-1].res)}</b></span></div>`:""}${svgRes(L)}</div>
  <div class="panel" style="padding:12px 14px;margin-top:10px"><b>¿En qué se va el dinero?</b> <span class="note">Gastos por categoría · ${esc(perTxt)}</span>
    <span class="note">· pulsa una partida para ver su desglose</span>
    <div style="margin-top:8px">${cl.map(([k,v])=>`<div data-rtcat="${k}" role="button" tabindex="0" aria-expanded="${RT.cat===k}" title="Ver el desglose" style="display:grid;grid-template-columns:minmax(120px,210px) 1fr 90px 46px;gap:8px;align-items:center;margin:0;padding:3px 4px;border-radius:6px;font-size:13px;cursor:pointer;${RT.cat===k?"background:var(--sunk)":""}"><span>${RT.cat===k?"▾":"▸"} ${esc(catTxt(k))}</span><span style="background:var(--sunk);border-radius:4px;height:12px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(1,v/maxC*100)}%;background:var(--rt-gas);border-radius:0 4px 4px 0"></span></span><span style="text-align:right;font-variant-numeric:tabular-nums">${eur(v)}</span><span class="note" style="text-align:right">${gas?Math.round(v/gas*100):0} %</span></div>${RT.cat===k?rtDesglose(k,L):""}`).join("")||`<p class="note">Sin gastos.</p>`}</div></div>
  <details class="panel" style="padding:10px 14px;margin-top:10px"><summary><b>Ver los datos en tabla</b></summary><table class="ft" style="min-width:0;width:100%"><thead><tr><th>Mes</th><th style="text-align:right">Ingresos</th><th style="text-align:right">Gastos</th><th style="text-align:right">Resultado</th><th style="text-align:right">Margen</th></tr></thead><tbody>
    ${L.map(x=>`<tr><td>${esc(mesTxt(x.mes))}</td><td style="text-align:right">${eur(x.ing)}</td><td style="text-align:right">${eur(x.gas)}</td><td style="text-align:right">${eurS(x.res)}</td><td style="text-align:right">${x.ing?Math.round(x.res/x.ing*100)+" %":"—"}</td></tr>`).join("")}
    ${(()=>{const t=r2(L.reduce((s2,x)=>s2+x.ingTodo,0)),b=r2(L.reduce((s2,x)=>s2+x.ingBanco,0));return `<tr><td colspan="5" class="note">Comparación: todo lo cobrado ${eur(t)} · lo que entra en el banco ${eur(b)} · diferencia ${eurS(r2(t-b))}</td></tr>`})()}
    <tr style="font-weight:700"><td>Total</td><td style="text-align:right">${eur(ing)}</td><td style="text-align:right">${eur(gas)}</td><td style="text-align:right">${eurS(res)}</td><td style="text-align:right">${ing?Math.round(mg)+" %":"—"}</td></tr></tbody></table></details>`}
  ${vRentProfes()}
  <div id="rt-tip" role="tooltip"></div></div>`}
document.addEventListener("change",e=>{if(e.target&&e.target.id==="rt-per"){RT.per=e.target.value;render()}});
/* ============================================================================================
   Rentabilidad por profesora (07/11/2026). Gastos → Rentabilidad → «Por profesora». Solo dirección.
   - Ingresos = lo COBRADO, contado en el mes del recibo (el de la clase), no en el de pago: un pago con retraso o la liquidación
     de una beca a final de curso se suma al mes que corresponde. Los recibos pendientes de alumnos que esperan beca
     (esperaBeca) van aparte, «pendiente de beca»; el resto de pendientes no suma.
   - Reparto: recibo mensual → entre sus profesoras según las clases semanales con cada una (horario actual). Horas extra y
     clases sueltas (HX) → la profesora de esa clase. Eventos (evaluación, psicopedagogía) → Fani. Sin clases → «Sin asignar».
   - Coste de personal: coste empresa de la nómina (nominas/<mes>_<profe>); Fani, su cuota de autónoma (categoría ssaut).
   - Gastos generales (continente y contenido): categorías marcadas (config/banco.genCats), repartidas entre todas, Fani
     incluida, según sus horas de clase semanales. Cada gasto se reparte en el tiempo según su periodicidad: a mano en
     config/banco.per[<clave del concepto>] = meses (1, 2, 3, 6, 12); si no, se deduce del historial del banco (cada cuánto se
     repite) y los seguros que solo aparecen una vez se toman como anuales. Se reparte desde el mes del cargo hacia delante.
   ============================================================================================ */
const RP={per:"",verPer:false};
const GEN_DEF=["sumin","telef","matofi","matdid","asesoria","seguros","cuotas","alquiler","software","manten","formacion","otrosg","comis"];
const genCats=()=>new Set((GB.cfg&&GB.cfg.genCats)||GEN_DEF);
/* Periodicidad (meses que cubre) de cada movimiento de gasto: {n, por:"mano"|"auto"|"seguro"} */
function periodicidades(){const reglas=(GB.cfg&&GB.cfg.per)||{},g=movsTodos().filter(m=>m.importe<0&&catTipo(m.cat)==="g"),por={},out=new Map();
  for(const m of g)(por[claveMov(m.concepto)]=por[claveMov(m.concepto)]||[]).push(m);
  for(const [k,l] of Object.entries(por)){let n=1,como="auto";
    if(reglas[k]){n=+reglas[k];como="mano"}
    else if(l.length>=2){const f=l.map(m=>m.fv).sort(),gaps=f.slice(1).map((x,i)=>difDias(x,f[i])).filter(d=>d>5).sort((a,b)=>a-b),med=gaps.length?gaps[Math.floor(gaps.length/2)]:30;
      n=med>300?12:med>150?6:med>75?3:med>45?2:1}
    else if(l[0].cat==="seguros"){n=12;como="seguro"}
    for(const m of l)out.set(m.id,{n:m.per?+m.per:n,por:m.per?"mano":como,k})}
  return out}
/* Gastos generales imputados a un mes (con el reparto en el tiempo) */
function generalesMes(mes,P){const cats=genCats(),ta=tallerAsignados();let t=0;
  for(const m of movsTodos()){if(m.importe>=0||!cats.has(m.cat))continue;const p=P.get(m.id)||{n:1},m0=String(m.fv).slice(0,7);
    /* lo que se ha asignado a un taller no cuenta como gasto general (va en el margen del taller) */
    const imp=Math.max(0,-m.importe-(ta[m.mes+"|"+m.id]||0));if(!imp)continue;
    for(let i=0;i<p.n;i++){const mm=sumaDias(m0+"-15",Math.round(i*30.44)).slice(0,7);if(mm===mes){t+=imp/p.n;break}}}
  return r2(t)}
/* Clases semanales de cada profesora: horas (franjas distintas) y alumnos */
/* Horas reales de clase a la semana: duración de cada sesión (las de logopedia pueden ser de 30 o 45 min) y, si varios alumnos
   comparten la misma franja (grupo), cuenta una sola vez: se juntan los intervalos de cada día. */
function cargaProfes(){const iv={},al={};
  for(const [,a] of S.alumnos){if(a.baja)continue;const ps=new Set();for(const c of a.clases||[]){if(!c.profe)continue;let x=null;try{x=sesDe(a,c)}catch(_){}
      const ini=x&&x.ini!=null?x.ini:(typeof KEY_INI!=="undefined"&&KEY_INI[c.hora])||960,fin=x&&x.fin!=null?x.fin:ini+60;
      ((iv[c.profe]=iv[c.profe]||{})[c.dia]=iv[c.profe][c.dia]||[]).push([ini,fin]);ps.add(c.profe)}
    for(const p of ps)al[p]=(al[p]||0)+1}
  const horas=p=>{let t=0;for(const l of Object.values(iv[p]||{})){l.sort((u,v)=>u[0]-v[0]);let [s0,e0]=l[0];for(const [s1,e1] of l.slice(1)){if(s1<=e0)e0=Math.max(e0,e1);else{t+=e0-s0;[s0,e0]=[s1,e1]}}t+=e0-s0}return Math.round(t/60*10)/10};
  return Object.fromEntries(EQUIPO.map(p=>[p,{h:horas(p),al:al[p]||0}]))}
const profeDeRecibo=(a,r)=>{if(r.evento)return EV_PROFE;if(r.extra){const e=(a.extras||[]).find(x=>x.id===r.extra);if(e&&e.profe)return e.profe}
  if(r.clase||r.extra){const m=String(r.concepto||"").match(/con (\p{L}+)\s*$/u);if(m&&EQUIPO.includes(m[1]))return m[1]}
  if(/evaluaci|psicopedag/i.test(r.concepto||""))return EV_PROFE;return ""};
/* Ingresos de un mes (mes del recibo) por profesora */
/* 11/11/2026: un recibo de varias mensualidades (la familia paga 2 o 3 meses de una vez) se reparte entre esos meses.
   Se reconoce porque su importe es 2, 3… veces la mensualidad de su tarifa (con un 5 % de margen) o porque el concepto lo dice. */
const _cuotaCache=new Map();
function cuotaMesAlumno(a){if(_cuotaCache.has(a))return _cuotaCache.get(a);let v=null;try{const M=calcMatriz(a,tfMapa());if(M.l.length&&!M.falta&&M.total>0)v=M.total}catch(_){}_cuotaCache.set(a,v);setTimeout(()=>_cuotaCache.delete(a),5000);return v}
function mesesDeRecibo(a,r){const m0=String(r.emitido||"").slice(0,7);if(!m0)return [];
  let k=1;const t=String(r.concepto||""),mt=t.match(/\b([2-9])\s*(?:mensualidades|meses)\b/i);
  if(mt)k=+mt[1];else{const c=cuotaMesAlumno(a),v=+r.importe||0;if(c&&v>=c*1.9){const n=Math.round(v/c);if(n>=2&&n<=10&&Math.abs(v-n*c)<=0.05*n*c)k=n}}
  const out=[];let m=m0;for(let i=0;i<k;i++){out.push(m);const [y,mm]=m.split("-").map(Number);m=mm===12?`${y+1}-01`:`${y}-${String(mm+1).padStart(2,"0")}`}return out}
function ingresosProfes(mes){const o={};let alId="";const add=(p,k,v)=>{const x=o[p]=o[p]||{cob:0,beca:0,pend:0,al:{}};x[k]+=v;if(alId){const y=x.al[alId]=x.al[alId]||{cob:0,beca:0,pend:0};y[k]+=v}};
  /* Un alumno con logopedia y refuerzo: la parte de logopedia/psicopedagogía del recibo va a sus profesoras de logopedia (FLEX)
     y el resto a las de refuerzo, según lo que vale cada matrícula; dentro de cada parte, según sus clases con cada una. */
  const esLogo=t=>/logop|psicop|psicoped/i.test(String(t||""));
  const reparte=(peso,k,v)=>{const tp=Object.values(peso).reduce((s,w)=>s+w,0);if(!tp)return false;for(const [p,w] of Object.entries(peso))add(p,k,v*w/tp);return true};
  for(const [aid,a] of S.alumnos){alId=aid;const pF={},pR={},pT={};
    for(const c of a.clases||[]){if(!c.profe)continue;pT[c.profe]=(pT[c.profe]||0)+1;const d=FLEX.has(c.profe)?pF:pR;d[c.profe]=(d[c.profe]||0)+1}
    const mats=(a.matriculas||[]).filter(m=>m&&m.cuota!=null&&+m.cuota>0),tM=mats.reduce((s,m)=>s+(+m.cuota),0),lM=mats.filter(m=>esLogo(m.curso)).reduce((s,m)=>s+(+m.cuota),0);
    for(const r of a.recibos||[]){if(!r||r.importe==null||r.estado==="anulado")continue;const ms=mesesDeRecibo(a,r);if(!ms.includes(mes))continue;
      const v=(+r.importe||0)/ms.length,k=r.estado==="pagado"?"cob":esperaBeca(a)?"beca":"pend",p1=profeDeRecibo(a,r);
      if(p1){add(p1,k,v);continue}
      const hayF=Object.keys(pF).length,hayR=Object.keys(pR).length;
      if(!hayF&&!hayR){add("",k,v);continue}
      let sh=r.curso?(esLogo(r.curso)?1:0):tM?lM/tM:null;
      if(sh==null)sh=hayF&&!hayR?1:!hayF&&hayR?0:Object.values(pF).reduce((s,w)=>s+w,0)/Object.values(pT).reduce((s,w)=>s+w,0);
      const vL=v*sh,vR=v-vL;
      if(vL&&!reparte(hayF?pF:pT,k,vL))add("",k,vL);
      if(vR&&!reparte(hayR?pR:pT,k,vR))add("",k,vR)}}
  alId="";const vistos=new Set();
  for(const x of (S.recCfg&&S.recCfg.sinAlumno)||[])if(String(x.fecha||"").startsWith(mes)&&x.estado!=="anulado"){vistos.add(x.numero);add("",x.estado==="pagado"?"cob":"pend",+x.importe||0)}
  for(const x of (S.sinFicha&&S.sinFicha.l)||[])if(String(x.fecha||"").startsWith(mes)&&!vistos.has(x.numero))add("","cob",+x.importe||0);
  for(const x of Object.values(o))for(const k of ["cob","beca","pend"])x[k]=r2(x[k]);return o}
/* Ocupación (07/11/2026). Profesoras de grupo: plazas ocupadas de las franjas en que trabaja (capDe: 8 en grupo, 1 individual).
   Profesoras de logopedia (FLEX): horas con sesión frente a las horas de su horario. Lo que podría facturar de más = huecos ×
   lo que se factura ahora por plaza (o por hora). */
function ocupacionProfes(carga){const o={};
  for(const p of EQUIPO){
    if(FLEX.has(p)){const hp=(typeof HORARIO_PROFE!=="undefined"&&HORARIO_PROFE[p])||null;if(!hp){o[p]=null;continue}
      let min=0;for(const d of DIAS)for(const t of hp[d]||[]){const [x,y]=t.split("-").map(minDe);if(y>x)min+=y-x}
      const disp=Math.round(min/60*10)/10,us=Math.min(carga[p]?carga[p].h:0,disp);o[p]={tipo:"h",disp,us,libre:Math.round((disp-us)*10)/10}}
    else{let pl=0,oc=0;for(const d of DIAS)for(const h of HORAS){if(!trabaja(p,d,h))continue;const cp=capDe(p,d,h);pl+=cp;oc+=Math.min(ocupadas(p,d,h),cp)}
      o[p]={tipo:"g",disp:pl,us:oc,libre:pl-oc}}}
  return o}
function datosRentProfes(meses){const P=periodicidades(),carga=cargaProfes(),hTot=Object.values(carga).reduce((s,x)=>s+x.h,0),filas={};
  const fila=p=>filas[p]=filas[p]||{p,cob:0,beca:0,pend:0,pers:0,gen:0,sinNom:0,est:0,alm:{},tal:0};
  /* 11/11/2026: un mes sin nómina (p. ej. el mes en curso) no puede contar 0 € de personal, porque sus recibos sí cuentan.
     Se estima con la nómina más cercana de esa profesora (la anterior; si no hay, la siguiente) y se marca «estimada».
     Igual con la cuota de autónoma de la titular y con los gastos generales del mes en curso (media de los meses anteriores). */
  const hoyM=todayISO().slice(0,7),noms=NM.docs.filter(d=>d.tipo==="nomina"&&+d.coste>0);
  const nomEst=(p,mes)=>{const l=noms.filter(d=>d.profe===p).sort((a,b)=>String(a.mes).localeCompare(String(b.mes)));if(!l.length)return null;
    const ant=l.filter(d=>d.mes<mes);return +(ant.length?ant[ant.length-1]:l[0]).coste};
  const autMes=mes=>r2(-movsTodos().filter(m=>m.mes===mes&&m.cat==="ssaut").reduce((s,m)=>s+m.importe,0));
  const mesesB=mesesBanco().slice().sort(),genAnt=mes=>{const l=mesesB.filter(m=>m<mes).slice(-3).map(m=>generalesMes(m,P)).filter(v=>v>0);return l.length?r2(l.reduce((s,v)=>s+v,0)/l.length):0};
  const est={pers:new Set(),gen:new Set()};
  /* talleres facturados en esos meses: a cada profesora le toca su parte del taller */
  for(const x of talleresPorProfe(meses))fila(x.p).tal+=x.v;
  for(const mes of meses){const ing=ingresosProfes(mes),nom=nmDe(mes);let gen=generalesMes(mes,P);
    if(mes>=hoyM){const g=genAnt(mes);if(g>gen){gen=g;est.gen.add(mes)}}
    for(const [p,x] of Object.entries(ing)){const f=fila(p);f.cob+=x.cob;f.beca+=x.beca;f.pend+=x.pend;
      for(const [id,y] of Object.entries(x.al||{})){const z=f.alm[id]=f.alm[id]||{cob:0,beca:0,pend:0};z.cob+=y.cob;z.beca+=y.beca;z.pend+=y.pend}}
    for(const p of EQUIPO){const f=fila(p);
      if(p===EV_PROFE){let a=autMes(mes);if(!a){const l=mesesB.filter(m=>m!==mes).map(m=>[m,autMes(m)]).filter(x=>x[1]>0);const x=l.filter(y=>y[0]<mes).pop()||l[0];if(x){a=x[1];f.est++;est.pers.add(mes)}}f.pers+=a}
      else{const n=nom.find(x=>x.profe===p);if(n)f.pers+=+n.coste||0;else if(carga[p].h){const v=nomEst(p,mes);if(v!=null){f.pers+=v;f.est++;est.pers.add(mes)}else f.sinNom++}}
      f.gen+=hTot?gen*carga[p].h/hTot:0}}
  const l=Object.values(filas).map(f=>{for(const k of ["cob","beca","pend","pers","gen","tal"])f[k]=r2(f[k]);const c=carga[f.p]||{h:0,al:0};
    return {...f,h:c.h,al:c.al,res:r2(f.cob+f.tal-f.pers-f.gen),resB:r2(f.cob+f.tal+f.beca+f.pend-f.pers-f.gen),med:meses.length>1?r2((f.cob+f.tal-f.pers-f.gen)/meses.length):null,eh:c.h&&meses.length?r2(f.cob/(c.h*4.33*meses.length)):null,ch:c.h&&meses.length?r2((f.pers+f.gen)/(c.h*4.33*meses.length)):null}});
  let oc={};try{oc=ocupacionProfes(carga)}catch(e){console.warn(e)}
  for(const x of l){const O=oc[x.p];if(!O||!meses.length)continue;const fact=(x.cob+x.beca+x.pend)/meses.length;
    x.oc=O;x.pot=O.us?r2(O.libre*fact/O.us):null}
  return {l:l.sort((a,b)=>(a.p?0:1)-(b.p?0:1)||a.p.localeCompare(b.p)),P,carga,est:{pers:[...est.pers].sort(),gen:[...est.gen].sort()}}}
/* 11/11/2026: por profesora, sus alumnos (lo que le toca de cada uno en el periodo): cobrado, sin cobrar y beca */
function vRentAlumnos(x){const l=Object.entries(x.alm||{}).map(([id,v])=>({id,a:S.alumnos.get(id),cob:r2(v.cob),pend:r2(v.pend),beca:r2(v.beca)})).filter(y=>y.a&&(y.cob||y.pend||y.beca))
    .sort((u,v)=>(v.pend+v.beca)-(u.pend+u.beca)||v.cob-u.cob);if(!l.length)return "";const ab=RP.ver===x.p;
  return `<tr><td colspan="20" style="padding:0 6px 6px;white-space:normal"><details ${ab?"open":""} data-rpal="${esc(x.p)}"><summary class="note">Ver sus ${l.length} alumnos${l.some(y=>y.pend)?` · <span style="color:var(--warn)">${l.filter(y=>y.pend).length} con recibos sin cobrar</span>`:""}</summary>
    <table class="ft" style="min-width:0;width:100%;font-size:12.5px;margin-top:4px"><thead><tr><th>Alumno</th><th style="text-align:right">Cobrado</th><th style="text-align:right">Sin cobrar</th><th style="text-align:right">Beca</th></tr></thead><tbody>
    ${l.map(y=>`<tr><td><a href="#" data-act="ir" data-id="${esc(y.id)}">${esc(titulo(y.a.nombre))}</a></td><td style="text-align:right">${y.cob?eur(y.cob):"—"}</td><td style="text-align:right;${y.pend?"color:var(--warn);font-weight:600":""}">${y.pend?eur(y.pend):"—"}</td><td style="text-align:right">${y.beca?eur(y.beca):"—"}</td></tr>`).join("")}
    </tbody></table><p class="note" style="margin:4px 0 0">Si un alumno tiene varias profesoras, aquí sale solo la parte que le toca a ${esc(x.p)}. Los recibos de varias mensualidades se reparten entre esos meses.</p></details></td></tr>`}
/* ---- Talleres en la rentabilidad (11/11/2026) ----
   Cada factura de taller emitida cuenta en el mes de su fecha. Su margen (base − costes) es del taller. Para la tabla por
   profesora: lo que queda del taller tras materiales y otros costes que no son de personal se reparte entre las profesoras que
   tiene asignadas (según lo que pesa cada una en los costes de personal del taller: horas y parte de nómina); a cada una se le
   resta lo que se le paga aparte por esas horas (las horas a 10 €/h). La parte de nómina ya está en su coste de personal.
   Los gastos del banco asignados a un taller dejan de contar como gastos generales. */
const talleresEmitidos=meses=>(typeof FA!=="undefined"?FA.docs:[]).filter(f=>f.estado==="emitida"&&meses.includes(String(f.fecha||"").slice(0,7)));
function tallerAsignados(){const o={};for(const f of (typeof FA!=="undefined"?FA.docs:[]))if(f.estado==="emitida")for(const c of f.costes||[])if(c.tipo==="gasto"&&c.mov)o[c.mov.mes+"|"+c.mov.id]=(o[c.mov.mes+"|"+c.mov.id]||0)+(+c.imp||0);return o}
function tallerReparto(f){const per={},hor={};let otros=0;
  for(const c of f.costes||[]){const v=faCoste(c);if((c.tipo==="horas"||c.tipo==="nomina")&&c.profe){per[c.profe]=(per[c.profe]||0)+v;if(c.tipo==="horas")hor[c.profe]=(hor[c.profe]||0)+v}else otros+=v}
  const tp=Object.values(per).reduce((s,v)=>s+v,0),neto=(+f.base||0)-otros;
  return Object.keys(per).length?Object.keys(per).map(p=>({p,v:r2(neto*(tp?per[p]/tp:1/Object.keys(per).length)-(hor[p]||0))})):[{p:"",v:r2(neto)}]}
const talleresPorProfe=meses=>talleresEmitidos(meses).flatMap(tallerReparto);
function vRentTalleres(meses,etq){faEscuchar();const l=talleresEmitidos(meses).sort((a,b)=>String(a.fecha).localeCompare(String(b.fecha)));if(!l.length)return `<div class="panel" style="padding:12px 14px;margin-top:10px"><b>Talleres</b> <span class="note">· ${esc(etq)}: no hay talleres facturados. Se hacen en Facturación; cuando se emita una factura, aparecerá aquí cómo ha ido y la parte de cada profesora.</span></div>`;
  const fila=f=>{const cs=f.costes||[],per=r2(cs.filter(c=>c.tipo==="horas"||c.tipo==="nomina").reduce((s,c)=>s+faCoste(c),0)),otr=r2(faCostes(f)-per),m=r2((+f.base||0)-faCostes(f));
    return `<tr><td>${esc(f.numero)}<br><span class="note">${fmtFecha(f.fecha)}</span></td><td style="white-space:normal">${esc(f.taller||"")}<br><span class="note">${esc(f.cliente&&f.cliente.nombre||"")}</span></td><td style="text-align:right">${eur(+f.base||0)}</td><td style="text-align:right">${eur(per)}</td><td style="text-align:right">${eur(otr)}</td><td style="text-align:right;font-weight:600;color:var(${m>=0?"--ok":"--bad"})">${eurS(m)}</td>
      <td style="white-space:normal" class="note">${tallerReparto(f).map(x=>`${x.p?esc(x.p):"sin profesora"} ${eurS(x.v)}`).join(" · ")}</td><td>${f.cobro&&f.cobro.id?`<span class="badge b-si">Cobrada</span>`:`<span class="badge b-pend">Pendiente</span>`}</td></tr>`};
  const tb=r2(l.reduce((s,f)=>s+(+f.base||0),0)),tc=r2(l.reduce((s,f)=>s+faCostes(f),0));
  return `<div class="panel" style="padding:12px 14px;margin-top:10px"><b>Talleres</b> <span class="note">· ${esc(etq)}: lo facturado a entidades frente a lo que ha costado</span>
    <div class="tbl"><table class="ft" style="min-width:0;width:100%;font-size:13px;margin-top:6px"><thead><tr><th>Factura</th><th>Taller</th><th style="text-align:right">Base</th><th style="text-align:right">Personal</th><th style="text-align:right">Materiales y otros</th><th style="text-align:right">Margen</th><th>Para cada profesora</th><th></th></tr></thead><tbody>
    ${l.map(fila).join("")}<tr style="font-weight:700"><td colspan="2">Total${l.length>1?` (${l.length} talleres)`:""}</td><td style="text-align:right">${eur(tb)}</td><td colspan="2" style="text-align:right">${eur(tc)}</td><td style="text-align:right;color:var(${tb-tc>=0?"--ok":"--bad"})">${eurS(r2(tb-tc))}</td><td colspan="2">${meses.length>1?`<span class="note">Media al mes: ${eurS(r2((tb-tc)/meses.length))}</span>`:""}</td></tr></tbody></table></div>
    <p class="note" style="margin:4px 0 0">«Para cada profesora»: lo que le queda al taller después de materiales, repartido según lo que pesa cada profesora en el personal del taller, menos lo que se le paga aparte por esas horas. Sale también en su fila de «Por profesora» (columna Talleres).</p></div>`}
function vRentProfes(){nmEscuchar();faEscuchar();const ms=mesesBanco().slice().sort(),hoy=todayISO().slice(0,7),y0=+hoy.slice(0,4)-(+hoy.slice(5)<9?1:0),curso=`${y0}-09`;
  const conNom=[...new Set(NM.docs.filter(d=>d.tipo==="nomina").map(d=>d.mes))].sort();
  /* 11/11/2026: el curso se mira a mes concluido: solo los meses ya terminados y con nóminas (el mes en curso, no) */
  const ultNom=conNom.length?conNom[conNom.length-1]:"",mCurso=ms.filter(m=>m>=curso&&m>=mesInicio()&&m<hoy&&(!ultNom||m<=ultNom));
  const opciones=[["curso",`Curso ${y0}-${String(y0+1).slice(2)}${mCurso.length?` · meses cerrados: ${mCurso.length===1?mesTxt(mCurso[0]):`${mesTxt(mCurso[0])} a ${mesTxt(mCurso[mCurso.length-1])}`}`:" · aún sin meses cerrados"}`],...ms.filter(m=>m>=mesInicio()).reverse().map(m=>[m,mesTxt(m)+(m>=hoy?" (en curso)":"")])];
  if(!RP.per)RP.per=conNom.length?conNom[conNom.length-1]:"curso";
  const meses=RP.per==="curso"?mCurso:[RP.per],D=datosRentProfes(meses),L=D.l,T=k=>r2(L.reduce((s,x)=>s+(x[k]||0),0));
  const med=meses.length>1,col=v=>`color:var(${v>=0?"--ok":"--bad"})`,faltaNom=L.filter(x=>x.sinNom).map(x=>x.p);
  const ver=[...D.P.entries()].map(([id,p])=>({p,m:movsTodos().find(x=>x.id===id)})).filter(x=>x.m&&genCats().has(x.m.cat)&&(x.p.n>1||x.p.por==="mano"));
  const unicos=[...new Map(ver.map(x=>[x.p.k,x])).values()].sort((a,b)=>String(b.m.fv).localeCompare(String(a.m.fv)));
  return `<div class="panel" style="padding:12px 14px;margin-top:10px"><b>Por profesora</b> <span class="note">· lo que se cobra por sus clases frente a lo que cuesta</span>
    <div class="bar" style="gap:8px;flex-wrap:wrap;margin-top:6px"><label class="f" style="flex:0 1 260px">Periodo<select id="rp-per">${opciones.map(([v,t])=>`<option value="${v}" ${RP.per===v?"selected":""}>${esc(t)}${conNom.includes(v)?" · con nóminas":""}</option>`).join("")}</select></label></div>
    ${faltaNom.length?`<p class="note" style="color:var(--warn);margin:4px 0">Faltan nóminas de ${faltaNom.join(", ")} en ${RP.per==="curso"?"algún mes del curso":mesTxt(RP.per)}: su coste de personal sale incompleto. Súbelas en Gastos → «Subir documentos».</p>`:""}
    ${D.est.pers.length||D.est.gen.length?`<p class="note" style="color:var(--warn);margin:4px 0">${D.est.pers.length?`Aún no están las nóminas de ${D.est.pers.map(mesTxt).join(", ")}: el coste de personal de ese mes es <b>estimado</b> con la nómina anterior de cada profesora. `:""}${D.est.gen.length?`* Los gastos generales de ${D.est.gen.map(mesTxt).join(", ")} (mes en curso) se estiman con la media de los meses anteriores, porque aún faltan cargos del banco. `:""}Cuando subas las nóminas y el extracto del mes, se calcula con lo real.</p>`:""}
    <div class="tbl"><table class="ft rp" style="min-width:0;width:100%;margin-top:6px;white-space:nowrap;font-size:13px"><style>.rp th,.rp td{padding-left:6px;padding-right:6px}.rp th{white-space:normal;line-height:1.2}</style><thead><tr><th>Profesora</th><th style="text-align:right">Horas /sem.</th><th style="text-align:right">Alum&shy;nos</th><th style="text-align:right">Cobrado</th><th style="text-align:right">Pendiente de beca</th><th style="text-align:right" title="Recibos de ese mes aún sin pagar (sin contar becas): no suman en el resultado">Sin cobrar</th><th style="text-align:right">Coste de personal</th><th style="text-align:right">Gastos generales</th><th style="text-align:right" title="Su parte del margen de los talleres facturados en el periodo (lo que queda de cada taller después de materiales y otros gastos, repartido según sus horas en el taller)">Talleres</th><th style="text-align:right" title="Lo cobrado más su parte de los talleres, menos lo que cuesta">Resultado con lo cobrado</th><th style="text-align:right" title="Si se cobra todo lo pendiente: lo sin cobrar y las becas">Si se cobra todo</th><th style="text-align:right" title="Lo cobrado dividido entre sus horas de clase del periodo">Cobrado por hora</th><th style="text-align:right" title="Coste de personal + gastos generales, dividido entre sus horas de clase del periodo">Cuesta por hora</th>${med?`<th style="text-align:right" title="Resultado con lo cobrado dividido entre los meses del periodo">Media al mes</th>`:""}</tr></thead><tbody>
    ${L.map(x=>`<tr><td>${x.p?esc(x.p):`<span class="note">Sin asignar</span>`}${x.p===EV_PROFE?` <span class="note">(titular)</span>`:""}</td><td style="text-align:right">${x.p?String(x.h).replace(".",","):""}</td><td style="text-align:right">${x.p?x.al:""}</td><td style="text-align:right">${eur(x.cob)}</td><td style="text-align:right">${x.beca?eur(x.beca):"—"}</td><td style="text-align:right;${x.pend?"color:var(--warn)":""}">${x.pend?eur(x.pend):"—"}</td>
      <td style="text-align:right">${x.p?eur(x.pers):""}${x.sinNom?` <span class="badge b-pend">falta nómina</span>`:x.est?` <span class="badge b-off" title="Algún mes no tiene nómina todavía: se ha puesto la nómina más cercana de esa profesora">estimado</span>`:""}</td><td style="text-align:right">${x.p?eur(x.gen):""}${x.p&&D.est.gen.length?`<span class="note">*</span>`:""}</td><td style="text-align:right">${x.tal?eur(x.tal):"—"}</td><td style="text-align:right;font-weight:600;${x.p?col(x.res):""}">${x.p?eurS(x.res):""}</td><td style="text-align:right;${x.p?col(x.resB):""}">${x.p&&(x.beca||x.pend)?eurS(x.resB):x.p?"—":""}</td><td style="text-align:right">${x.eh!=null?eur(x.eh):"—"}</td><td style="text-align:right;${x.ch!=null&&x.eh!=null&&x.ch>x.eh?"color:var(--bad)":""}">${x.ch!=null?eur(x.ch):"—"}</td>${med?`<td style="text-align:right;${x.p&&x.med!=null?col(x.med):""}">${x.p&&x.med!=null?eurS(x.med):""}</td>`:""}</tr>${x.p?vRentAlumnos(x):""}`).join("")}
    <tr style="font-weight:700"><td>Total</td><td></td><td></td><td style="text-align:right">${eur(T("cob"))}</td><td style="text-align:right">${eur(T("beca"))}</td><td style="text-align:right">${eur(T("pend"))}</td><td style="text-align:right">${eur(T("pers"))}</td><td style="text-align:right">${eur(T("gen"))}</td><td style="text-align:right">${T("tal")?eur(T("tal")):"—"}</td><td style="text-align:right;${col(T("res"))}">${eurS(T("res"))}</td><td style="text-align:right;${col(T("resB"))}">${eurS(T("resB"))}</td><td></td><td></td>${med?`<td style="text-align:right;${col(r2(T("res")/meses.length))}">${eurS(r2(T("res")/meses.length))}</td>`:""}</tr></tbody></table></div>
    ${(()=>{const lo=L.filter(x=>x.oc);if(!lo.length)return "";const tp=r2(lo.reduce((s,x)=>s+(x.pot||0),0));
      return `<b style="display:block;margin-top:12px">Ocupación y huecos libres</b><table class="ft" style="min-width:0;width:100%;margin-top:4px;font-size:13px"><thead><tr><th>Profesora</th><th>Ocupación</th><th style="text-align:right">Libre</th><th style="text-align:right" title="Si se llenaran los huecos, a lo que se factura ahora por plaza (o por hora). Contando lo cobrado, la beca y lo pendiente.">Podría facturar más al mes</th></tr></thead><tbody>
      ${lo.map(x=>{const O=x.oc,pc=O.disp?Math.round(O.us/O.disp*100):0;return `<tr><td>${esc(x.p)}</td><td><span style="display:inline-flex;align-items:center;gap:8px;min-width:240px"><span style="flex:1;background:var(--sunk);border-radius:4px;height:10px;overflow:hidden;min-width:90px"><span style="display:block;height:100%;width:${pc}%;background:var(${pc>=75?"--ok":pc>=50?"--warn":"--bad"})"></span></span><span class="note" style="white-space:nowrap">${pc} % · ${O.tipo==="g"?`${O.us} de ${O.disp} plazas`:`${String(O.us).replace(".",",")} de ${String(O.disp).replace(".",",")} h`}</span></span></td>
        <td style="text-align:right;white-space:nowrap">${O.tipo==="g"?`${O.libre} plazas`:`${String(O.libre).replace(".",",")} h`}</td><td style="text-align:right">${x.pot!=null?eur(x.pot):"—"}</td></tr>`}).join("")}
      <tr style="font-weight:700"><td>Total</td><td></td><td></td><td style="text-align:right">${eur(tp)}</td></tr></tbody></table>
      <p class="note" style="margin:4px 0 0">Grupos: plazas ocupadas a la semana en las horas que trabaja (8 por grupo, 1 si la hora es individual). Logopedia: horas con sesión frente a las de su horario. «Podría facturar más»: los huecos llenos, a lo que se factura ahora por plaza o por hora. No incluye nuevos costes, porque la profesora y el local ya están pagados.</p>`})()}
    <p class="note" style="margin:6px 0 0">Cobrado: recibos pagados, contados en el mes del recibo (no en el del pago; si un recibo es de varias mensualidades, se reparte entre esos meses), así que se actualiza solo cuando llega un pago atrasado o la beca. Un alumno con varias profesoras: la parte de logopedia del recibo va a sus profesoras de logopedia y la de refuerzo a las de refuerzo (según lo que vale cada matrícula), y dentro de cada parte según sus clases semanales con cada una (horario actual). Coste de personal: coste empresa de la nómina; en la titular, su cuota de autónoma. Gastos generales: las categorías marcadas abajo, repartidas según las horas de clase de cada una. «Sin asignar»: recibos de alumnos sin clases en la app (bajas) o sin ficha.</p>
    <details style="margin-top:8px" ${RP.verPer?"open":""} data-rpdet="1"><summary class="note"><b>Gastos generales y gastos que se reparten en varios meses</b></summary>
      <p class="note" style="margin:6px 0 4px">Categorías que cuentan como continente y contenido:</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px 14px">${CATS.filter(([,,t])=>t==="g").filter(([k])=>!["nominas","ssemp","ssaut","impuestos"].includes(k)).map(([k,lb])=>`<label class="note" style="display:flex;gap:4px;align-items:center"><input type="checkbox" data-rpcat="${k}" ${genCats().has(k)?"checked":""}>${esc(lb)}</label>`).join("")}</div>
      <p class="note" style="margin:10px 0 4px">Gastos que no son mensuales (se reparten a partes iguales desde el mes del cargo). La app lo deduce de cada cuánto se repiten; los seguros que solo aparecen una vez se toman como anuales. Cámbialo si no es así: vale para los próximos cargos de ese concepto.</p>
      ${unicos.length?`<table class="ft" style="min-width:0;width:100%"><tbody>${unicos.map(({p,m})=>`<tr><td style="white-space:nowrap">${fmtFecha(m.fv)}</td><td style="white-space:normal">${esc(m.concepto)}</td><td style="text-align:right">${eur(-m.importe)}</td><td><select data-rpper="${esc(p.k)}" aria-label="Periodicidad">${[[1,"Mensual (no se reparte)"],[2,"Bimestral · 2 meses"],[3,"Trimestral · 3 meses"],[6,"Semestral · 6 meses"],[12,"Anual · 12 meses"],[24,"24 meses (compra grande)"],[36,"36 meses (compra grande)"]].map(([n,t])=>`<option value="${n}" ${p.n===n?"selected":""}>${t}</option>`).join("")}</select> <span class="note">${p.por==="mano"?"puesto a mano":p.por==="seguro"?"seguro: anual":"deducido"}</span></td></tr>`).join("")}</tbody></table>`:`<p class="note">Ninguno todavía.</p>`}
      <p class="note" style="margin:8px 0 0">Para repartir otro gasto (por ejemplo, un ordenador), búscalo y elige los meses: <select id="rp-otro" style="max-width:420px"><option value="">Elige un gasto…</option>${movsTodos().filter(m=>m.importe<0&&genCats().has(m.cat)&&!(D.P.get(m.id)&&D.P.get(m.id).n>1)).sort((a,b)=>a.importe-b.importe).slice(0,60).map(m=>`<option value="${esc(claveMov(m.concepto))}">${esc(fmtFecha(m.fv))} · ${esc(m.concepto.slice(0,50))} · ${eur(-m.importe)}</option>`).join("")}</select></p>
    </details></div>
    ${vRentTalleres(meses,RP.per==="curso"?"el curso":mesTxt(RP.per))}`}
document.addEventListener("change",async e=>{const t=e.target;if(!t||!gbVer())return;
  if(t.id==="rp-per"){RP.per=t.value;render();return}
  const guardar=async cfg=>{try{await S.db.doc("config/banco").set(cfg);GB.cfg=cfg;RP.verPer=true;render();toast("Guardado")}catch(_){toast("No se ha podido guardar.")}};
  if(t.dataset&&t.dataset.rpcat){const s=genCats();t.checked?s.add(t.dataset.rpcat):s.delete(t.dataset.rpcat);await guardar({...(GB.cfg||{}),genCats:[...s]})}
  else if(t.dataset&&t.dataset.rpper){await guardar({...(GB.cfg||{}),per:{...((GB.cfg&&GB.cfg.per)||{}),[t.dataset.rpper]:+t.value}})}
  else if(t.id==="rp-otro"&&t.value){const n=+prompt("¿En cuántos meses se reparte? (por ejemplo 12, 24 o 36)","24");if(!n||n<1||n>60){t.value="";return}await guardar({...(GB.cfg||{}),per:{...((GB.cfg&&GB.cfg.per)||{}),[t.value]:n}})}});

document.addEventListener("mousemove",e=>{const tip=document.getElementById("rt-tip");if(!tip)return;const h=e.target.closest&&e.target.closest(".rt [data-rt]");
  if(!h||!RT.L){tip.style.display="none";return}const x=RT.L[+h.dataset.rt];if(!x){tip.style.display="none";return}
  tip.innerHTML=`<b>${esc(mesTxt(x.mes))}</b><br><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--rt-ing);margin-right:5px"></i>Ingresos ${eur(x.ing)}<br><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--rt-gas);margin-right:5px"></i>Gastos ${eur(x.gas)}<br>Resultado <b>${eurS(x.res)}</b>${x.ing?` · margen ${Math.round(x.res/x.ing*100)} %`:""}`;
  tip.style.display="block";const w=tip.offsetWidth,hh=tip.offsetHeight;tip.style.left=Math.min(innerWidth-w-8,e.clientX+14)+"px";tip.style.top=Math.max(8,e.clientY-hh-10)+"px"});
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-rtcat]");if(!t||e.target.closest("select,a"))return;RT.cat=RT.cat===t.dataset.rtcat?"":t.dataset.rtcat;render()});
document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target&&e.target.dataset&&e.target.dataset.rtcat){e.preventDefault();RT.cat=RT.cat===e.target.dataset.rtcat?"":e.target.dataset.rtcat;render()}});
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-rtmodo]");if(!t)return;e.preventDefault();RT.modo=t.dataset.rtmodo;render()});

/* ============================================================================================
   Facturas simplificadas (02/11/2026). Una factura por recibo (albarán) pagado, emitida en el proceso semanal.
   - Dirección elige qué formas de pago se facturan (config/recibos.facFormas; por defecto tarjeta, Bizum, transferencia y
     efectivo; beca y sin forma de pago, no). Tarjeta, Bizum y transferencia: los recibos pagados hasta el domingo de la
     semana elegida que aún no tienen factura.
   - Efectivo (decisión de la titular con A3, 02/11/2026): se factura cuando se ingresa en el banco. Se facturan los recibos en
     efectivo más antiguos sin factura hasta cubrir lo ingresado en el cajero en el año (desde el lunes de la primera semana),
     menos lo ya facturado en efectivo ese año. Mientras tanto el recibo queda como albarán cobrado y cuenta en los ingresos.
   - Hasta el 31/12/2026 es prueba: van a facturasPrueba/<n> y se pueden borrar. Desde el 1/1/2027 (CAJA_REAL_DESDE) van a
     facturas/<n>, y las reglas de Firestore no dejan modificarlas ni borrarlas: una factura errónea se corrige con rectificativa.
   - Numeración: formato del contador de facturas (Contadores), correlativa por año si el contador vuelve a 1 cada año.
     El id del documento es el número: si dos personas emitieran a la vez, la segunda falla y no se repite ningún número.
   - Huella encadenada como pide Verifactu (SHA-256 de NIF, número, fecha, tipo F2, cuota, importe, huella anterior y fecha-hora
     del registro). Queda preparada para el envío a la AEAT (obligatorio desde el 1/7/2027); todavía no lleva QR ni se envía.
   - Las facturas reales del mes entran en «Facturas de venta» (ventasMes): informe del mes, copia de la asesoría y .zip.
   ============================================================================================ */
const FE={real:{docs:[],ok:false,err:false,sub:null},prueba:{docs:[],ok:false,err:false,sub:null},busy:"",conf:false,res:"",borrar:false};
const FE_PRUEBA_DESDE="2026-11-01",FE_TITULAR="Estefanía Pérez Busati";
const feReal=()=>!cajaPrueba();
const feModo=()=>feReal()?"real":"prueba";
const feCol=()=>feReal()?"facturas":"facturasPrueba";
const feDesde=()=>feReal()?CAJA_REAL_DESDE:FE_PRUEBA_DESDE;
function feEscuchar(){if(!S.db)return;for(const [k,col] of [["real","facturas"],["prueba","facturasPrueba"]]){const x=FE[k];if(x.sub)continue;
  x.sub=S.db.collection(col).onSnapshot(s=>{x.docs=s.docs.map(d=>({id:d.id,...d.data()}));x.ok=true;x.err=false;if((S.view==="tarifas"&&GT.fac)||S.view==="gastos"||S.view==="recibos")gbRefrescar()},
    ()=>{x.ok=true;x.err=true;if(S.view==="tarifas"&&GT.fac)gbRefrescar()})}}
const feDocs=(m)=>FE[m||feModo()].docs;
/* Formas de pago que se facturan: las elige dirección (config/recibos.facFormas). Por defecto, beca y sin forma de pago no. */
const FE_FORMAS=[["tpv","Tarjeta"],["bizum","Bizum"],["transf","Transferencia"],["ef","Efectivo (al ingresarlo en el banco)"],["beca","Beca"],["otras","Sin forma de pago u otras"]];
const FE_FORMAS_DEF={tpv:true,bizum:true,transf:true,ef:true,beca:false,otras:false};
const feFormas=()=>({...FE_FORMAS_DEF,...((S.recCfg&&S.recCfg.facFormas)||{})});
const feTipo=f=>/beca/i.test(f||"")?"beca":tipoForma(f||"");
const feKey=(id,r)=>r&&r.numero?"n:"+String(r.numero).trim():"i:"+id+"|"+((r&&r.id)||"");
const feId=n=>String(n).replace(/[^A-Za-z0-9-]/g,"_");
/* Factura real (o de prueba, si aún es prueba) de un recibo */
function feDeRecibo(id,r,modo){feEscuchar();const k=feKey(id,r);return feDocs(modo).find(f=>f.rk===k)||null}
window.feDeRecibo=feDeRecibo;
const feAnioSem=lun=>{const y=+lun.slice(0,4);let d=`${y}-01-01`;while(new Date(d+"T12:00:00").getDay()!==1)d=sumaDias(d,1);return {y,ini:d}};
function feSemana(lun){
  const dom=sumaDias(lun,6),desde=feDesde(),docs=feDocs(),hechas=new Set(docs.map(f=>f.rk));
  const pag=[];for(const [id,a] of S.alumnos)for(const r of a.recibos||[]){if(!r||r.estado!=="pagado")continue;const fp=String(r.pagado||"").slice(0,10);if(!fp||fp<desde||fp>dom)continue;
    const rk=feKey(id,r);if(hechas.has(rk))continue;pag.push({id,a,r,rk,fp,imp:r2(+r.importe||0),forma:r.forma||"",tf:feTipo(r.forma)})}
  const orden=(x,y)=>x.fp.localeCompare(y.fp)||String(x.r.numero||"").localeCompare(String(y.r.numero||""));
  const FF=feFormas(),fuera=pag.filter(x=>!FF[x.tf]).sort(orden);
  const otros=pag.filter(x=>x.tf!=="ef"&&FF[x.tf]).sort(orden);
  /* efectivo: ingresos en el cajero del año de la semana (sin pasar del domingo) menos lo ya facturado en efectivo ese año */
  const A=feAnioSem(lun),ini=A.ini>desde?A.ini:desde;
  const dep=r2(movsTodos().filter(m=>m.cat==="deposito"&&(m.fo||m.fv)>=ini&&(m.fo||m.fv)<=dom).reduce((s,m)=>s+m.importe,0));
  const efFac=r2(docs.filter(f=>f.tf==="ef"&&String(f.sem||"").slice(0,4)===String(A.y)).reduce((s,f)=>s+(+f.tot||0),0));
  let disp=r2(dep-efFac);const ef=[],efPend=[];
  if(FF.ef)for(const x of pag.filter(x=>x.tf==="ef").sort(orden)){if(!efPend.length&&x.imp<=disp+0.005){ef.push(x);disp=r2(disp-x.imp)}else efPend.push(x)}
  const l=[...otros,...ef].sort(orden),emit=docs.filter(f=>f.sem===lun).sort((a,b)=>(+a.seq||0)-(+b.seq||0));
  return {lun,dom,l,ef,fuera,fueraTot:r2(fuera.reduce((s,x)=>s+x.imp,0)),efPend,efPendTot:r2(efPend.reduce((s,x)=>s+x.imp,0)),disp,dep,efFac,emit,cerrada:dom<todayISO(),tot:r2(l.reduce((s,x)=>s+x.imp,0)),hayBanco:GB.docs.length>0}}
function feSiguiente(docs,C,anio){const nums=docs.filter(f=>!C.anual||+f.anio===anio).map(f=>+f.num||0);return Math.max(nums.length?Math.max(...nums)+1:0,+C.ini||1)}
const feUltima=docs=>docs.reduce((u,f)=>!u||(+f.seq||0)>(+u.seq||0)?f:u,null);
/* Fecha y hora con el huso horario de España, como la pide Verifactu: 2027-01-04T10:15:00+01:00 */
function feAhora(){const d=new Date(),p=n=>String(n).padStart(2,"0"),o=-d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${o>=0?"+":"-"}${p(Math.floor(Math.abs(o)/60))}:${p(Math.abs(o)%60)}`}
const feNif=()=>String(EMISOR.nif).replace(/[^0-9A-Za-z]/g,"").toUpperCase();
const feDMY=f=>`${f.slice(8,10)}-${f.slice(5,7)}-${f.slice(0,4)}`;
async function feHuella(d,prev){const c=`IDEmisorFactura=${feNif()}&NumSerieFactura=${d.n}&FechaExpedicionFactura=${feDMY(d.fecha)}&TipoFactura=F2&CuotaTotal=0.00&ImporteTotal=${(+d.tot).toFixed(2)}&Huella=${prev||""}&FechaHoraHusoGenRegistro=${d.ts}`;
  const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(c));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("").toUpperCase()}
const feConcepto=r=>String(r.concepto||r.curso||"Servicios de formación").trim();
async function feEmitir(){
  const W=feSemana(GT.facSem);if(!W.l.length||!W.cerrada||FE.busy)return;
  const F=FE[feModo()];if(!F.ok||F.err){toast("Todavía no se han leído las facturas emitidas. Espera un momento.");return}
  const C=contadores().fac,hoy=todayISO(),anio=+hoy.slice(0,4),col=feCol(),docs=[...F.docs];
  let num=feSiguiente(docs,C,anio),prev=feUltima(docs),ok=0,mal="";
  for(const x of W.l){FE.busy=`Emitiendo ${ok+1} de ${W.l.length}…`;render();
    const n=fmtContador(C,num,anio),id=feId(n);if(docs.some(f=>f.id===id)){mal=`El número ${n} ya existe. Revisa los contadores.`;break}
    const d={n,num,anio,tipo:"F2",clase:"simplificada",fecha:hoy,fop:x.fp,sem:W.lun,alumno:x.id,cliente:titulo(x.a.nombre||""),rk:x.rk,
      rec:{numero:x.r.numero||"",id:x.r.id||"",emitido:String(x.r.emitido||"").slice(0,10)},concepto:feConcepto(x.r),tot:x.imp,base:x.imp,iva:0,exenta:EXENTO_IVA,
      forma:x.forma,tf:x.tf,ts:feAhora(),ant:prev?{n:prev.n,huella:prev.huella}:null,seq:(prev?+prev.seq||0:0)+1,por:quienSoy(),creada:nowISO(),...(feReal()?{}:{prueba:true})};
    try{d.huella=await feHuella(d,prev&&prev.huella)}catch(e){mal="Este navegador no puede calcular la huella de la factura.";break}
    try{await S.db.doc(col+"/"+id).set(d)}catch(e){console.warn(e);const perm=/perm/i.test(String((e&&e.fb)||"")+" "+(e&&e.message));
      mal=perm?(feReal()?`No se ha podido emitir la ${n}: o ya existe o faltan las reglas nuevas de Firebase.`:"Faltan permisos: hay que publicar las reglas nuevas en Firebase."):`No se ha podido emitir la ${n}. Comprueba la conexión y vuelve a pulsar «Emitir»: seguirá por donde se quedó.`;break}
    docs.push({id,...d});F.docs=[...F.docs.filter(f=>f.id!==id),{id,...d}];prev=d;num++;ok++}
  FE.busy="";FE.conf=false;FE.res=(ok?`${ok} factura${ok===1?"":"s"} emitida${ok===1?"":"s"}${feReal()?"":" (de prueba)"}. `:"")+(mal||"");render();toast(mal||`${ok} facturas emitidas`)}
async function feBorrarPrueba(){if(feReal())return;const l=FE.prueba.docs;let n=0,mal=0;FE.busy="Borrando las facturas de prueba…";render();
  for(const f of l){try{await S.db.doc("facturasPrueba/"+f.id).delete();n++}catch(_){mal++}}
  FE.busy="";FE.borrar=false;FE.res=`Borradas ${n} facturas de prueba.${mal?` ${mal} no se han podido borrar.`:""}`;render()}
function feAviso(){const real=feReal();
  return real?`<div class="aviso info" style="display:block"><b>Facturas reales.</b> Cada semana se emite una factura simplificada por cada recibo pagado con las formas de pago que marques: tarjeta, Bizum o transferencia, en la semana del pago; efectivo, cuando se ingresa en el banco (mientras tanto queda como albarán cobrado). La beca no se factura salvo que la marques. Una factura emitida no se puede cambiar ni borrar: si hay un error, se corrige con una factura rectificativa.</div>`
  :`<div class="aviso info" style="display:block"><b>Modo prueba hasta el 31/12/2026.</b> Puedes emitir facturas para ensayar: se guardan aparte, llevan la marca «PRUEBA», no van a la asesoría y se pueden borrar. Las facturas de verdad las sigue emitiendo Argos. Desde el 1 de enero de 2027 las facturas serán reales y no se podrán borrar.</div>`}
function feBloque(lun){feEscuchar();const F=FE[feModo()];
  if(F.err)return `<div class="aviso pend" style="display:block;margin-top:12px"><b>No se pueden leer las facturas:</b> faltan permisos en la base de datos. Hay que publicar las reglas nuevas en Firebase.</div>`;
  if(!F.ok)return `<div class="panel" style="padding:12px 14px;margin-top:12px">Leyendo las facturas…</div>`;
  const W=feSemana(lun),C=contadores().fac,anio=+todayISO().slice(0,4),n1=feSiguiente(F.docs,C,anio),rango=W.l.length?`${fmtContador(C,n1,anio)}${W.l.length>1?" a "+fmtContador(C,n1+W.l.length-1,anio):""}`:"";
  const tot=r2(W.emit.reduce((s,f)=>s+(+f.tot||0),0)),pr=!feReal();
  const btn=!W.l.length?"":!W.cerrada?`<span class="note">La semana aún no ha terminado: podrás emitirlas a partir del lunes.</span>`
    :FE.conf?`<div class="aviso pend" style="display:block;margin:8px 0 0">Se van a emitir <b>${W.l.length} factura${W.l.length===1?"":"s"}</b>${pr?" de prueba":""}, de la <b>${esc(rango)}</b>, por <b>${eur(W.tot)}</b>, con fecha de hoy.${pr?"":" <b>No se podrán cambiar ni borrar.</b>"}
      <div class="petbtns" style="margin-top:8px"><button class="btn small primary" data-fe="emitirok" ${FE.busy?"disabled":""}>Emitir ahora</button><button class="btn small" data-fe="emitirno">Cancelar</button></div></div>`
    :`<button class="btn primary" data-fe="emitir" ${FE.busy?"disabled":""}>Emitir ${W.l.length} factura${W.l.length===1?"":"s"}${pr?" de prueba":""}</button>`;
  const filaP=x=>`<div class="row" style="flex-wrap:wrap;padding:5px 12px"><span class="note" style="min-width:76px">${fmtFecha(x.fp)}</span><span class="grow" style="white-space:normal"><a href="#" data-act="ir" data-id="${esc(x.id)}" style="color:inherit">${esc(titulo(x.a.nombre))}</a> <span class="note">· albarán ${esc(x.r.numero||"—")} · ${esc(x.forma||"sin forma de pago")}</span></span><b>${eur(x.imp)}</b></div>`;
  const filaF=f=>`<div class="row" style="flex-wrap:wrap;padding:5px 12px"><span style="min-width:110px;font-variant-numeric:tabular-nums"><b>${esc(f.n)}</b></span><span class="note" style="min-width:76px">${fmtFecha(f.fecha)}</span>
    <span class="grow" style="white-space:normal">${esc(f.cliente)} <span class="note">· albarán ${esc((f.rec&&f.rec.numero)||"—")} · pagado el ${fmtFecha(f.fop)} · ${esc(f.forma||"sin forma de pago")}</span></span><b style="min-width:70px;text-align:right">${eur(+f.tot)}</b>
    <button class="btn small" data-fe="ver" data-id="${esc(f.id)}">Ver / imprimir</button></div>`;
  return `<div class="bar" style="margin-top:16px"><h2 style="font-size:19px;margin-right:auto">Facturas de la semana${pr?" · prueba":""}</h2>${pr&&F.docs.length?`<button class="btn small" data-fe="borrar">Borrar las ${F.docs.length} facturas de prueba</button>`:""}</div>
  ${FE.res?`<p style="color:var(--ok);margin:0 0 6px">${esc(FE.res)}</p>`:""}${FE.busy?`<p class="note">${esc(FE.busy)}</p>`:""}
  ${FE.borrar?`<div class="aviso pend" style="display:block">¿Borrar las ${F.docs.length} facturas de prueba? <button class="btn small primary" data-fe="borrarok">Borrar</button> <button class="btn small" data-fe="borrarno">Cancelar</button></div>`:""}
  <div class="stats"><div class="stat static"><b>${eur(W.tot)}</b><span>Por facturar: ${W.l.length} recibo${W.l.length===1?"":"s"} pagado${W.l.length===1?"":"s"}${W.ef.length?`, ${W.ef.length} en efectivo ya ingresado`:""}</span></div>
    <div class="stat static"><b>${eur(tot)}</b><span>Ya facturado esta semana: ${W.emit.length} factura${W.emit.length===1?"":"s"}</span></div>
    <div class="stat static"><b style="color:var(${W.efPendTot>0.5?"--warn":"--ok"})">${eur(W.efPendTot)}</b><span>Efectivo cobrado sin ingresar en el banco (${W.efPend.length} ${W.efPend.length===1?"albarán":"albaranes"}): se facturará al ingresarlo</span></div></div>
  ${(()=>{const FF=feFormas(),pend={};for(const x of [...W.l,...W.efPend,...W.fuera])pend[x.tf]=(pend[x.tf]||0)+1;
    return `<div class="bar" style="flex-wrap:wrap;gap:6px;margin:0 0 6px"><span class="note" style="margin-right:4px">Se facturan:</span>${FE_FORMAS.map(([k,l])=>`<button class="chip" data-fe="forma" data-k="${k}" aria-pressed="${!!FF[k]}" ${FE.busy||FE.conf?"disabled":""}>${FF[k]?"✓ ":""}${l}${pend[k]?` <span class="note">${pend[k]}</span>`:""}</button>`).join("")}</div>`})()}
  ${W.fuera.length?`<details class="panel" style="padding:8px 0;margin-bottom:8px"><summary style="padding:0 12px"><b>Pagados que no se facturan</b> <span class="note">· ${W.fuera.length} · ${eur(W.fueraTot)} · formas de pago desmarcadas</span></summary>${W.fuera.map(filaP).join("")}</details>`:""}
  ${!W.hayBanco&&feFormas().ef?`<p class="note" style="color:var(--warn)">No hay extractos del banco cargados: el efectivo no se factura hasta que se vea el ingreso en el cajero (sube el extracto en Gastos).</p>`:""}
  ${W.l.length?(()=>{const pf={};for(const x of W.l){const k=(FE_FORMAS.find(f=>f[0]===x.tf)||[,"Otras"])[1].replace(/ \(.*/,"");pf[k]=r2((pf[k]||0)+x.imp)}
    return `<div class="bar" style="margin:4px 0 4px"><b>Vista previa · ${W.l.length} factura${W.l.length===1?"":"s"} por ${eur(W.tot)}</b><span class="note" style="margin-left:auto">${Object.entries(pf).map(([k,v])=>`${esc(k)} ${eur(v)}`).join(" · ")}</span></div>
    <div class="panel tbl" style="margin-bottom:8px"><table class="ft" style="min-width:640px"><thead><tr><th>Nº (provisional)</th><th>Pagado</th><th>Alumno</th><th>Concepto</th><th>Forma de pago</th><th style="text-align:right">Importe</th><th></th></tr></thead><tbody>
    ${W.l.map((x,i)=>`<tr><td style="white-space:nowrap;font-variant-numeric:tabular-nums">${esc(fmtContador(C,n1+i,anio))}</td><td class="note" style="white-space:nowrap">${fmtFecha(x.fp)}</td><td><a href="#" data-act="ir" data-id="${esc(x.id)}" style="color:inherit">${esc(titulo(x.a.nombre))}</a></td>
      <td>${esc(feConcepto(x.r))} <span class="note">(${esc(x.r.numero||"—")})</span></td><td class="note">${esc(x.forma||"sin forma de pago")}</td><td style="text-align:right">${eur(x.imp)}</td>
      <td><button class="btn small" data-fe="previa" data-i="${i}">Ver</button></td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin:0 0 6px">Los números son provisionales: se asignan al emitir, en este orden. «Ver» enseña cómo quedará la factura (marcada como borrador).</p>`})():`<p class="note">No queda nada por facturar hasta el ${fmtFecha(W.dom)}.</p>`}
  <div style="margin:6px 0 10px">${btn}</div>
  ${W.emit.length?`<div class="panel">${W.emit.map(filaF).join("")}</div>`:""}
  ${W.efPend.length?`<details class="panel" style="padding:8px 0;margin-top:8px"><summary style="padding:0 12px"><b>Efectivo cobrado pendiente de ingresar</b> <span class="note">· ${eur(W.efPendTot)} · queda como albarán cobrado</span></summary>${W.efPend.map(filaP).join("")}</details>`:""}`}

/* ---------- la factura: impresión (A4) y PDF para el .zip ---------- */
function feHtml(f){const pr=!!f.prueba,bo=!!f.borrador;
  return `${typeof LOGO_AF==="string"?`<img src="${LOGO_AF}" alt="" style="width:34mm">`:""}
  <div style="display:flex;justify-content:space-between;gap:20px;margin-top:6mm"><div><b>${EMISOR.nombre}</b><br>${FE_TITULAR}<br>${EMISOR.dir}<br>${EMISOR.cp}<br>NIF: ${EMISOR.nif}</div>
    <div style="text-align:right"><div style="font-size:18pt;font-weight:700">Factura simplificada${bo?" · BORRADOR":pr?" · PRUEBA":""}</div>Nº <b>${esc(f.n)}</b><br>Fecha de expedición: ${fmtFecha(f.fecha).replace(/\/(\d\d)$/,"/20$1")}${f.fop&&f.fop!==f.fecha?`<br>Fecha de la operación (pago): ${fmtFecha(f.fop).replace(/\/(\d\d)$/,"/20$1")}`:""}</div></div>
  <div style="margin-top:8mm"><b>Alumno:</b> ${esc(String(f.cliente||"").toUpperCase())}</div>
  <table style="width:100%;border-collapse:collapse;margin-top:5mm"><thead><tr><th style="text-align:left;border-bottom:1px solid #000;padding:2mm 0">Concepto</th><th style="text-align:right;border-bottom:1px solid #000;padding:2mm 0">Importe</th></tr></thead>
    <tbody><tr><td style="padding:2mm 0">${esc(f.concepto)}${f.rec&&f.rec.numero?` <span style="color:#555">(albarán ${esc(f.rec.numero)})</span>`:""}</td><td style="text-align:right">${eur(+f.base)}</td></tr></tbody></table>
  <div style="border-top:1px solid #000;margin-top:2mm;padding-top:2mm;text-align:right">Base imponible: ${eur(+f.base)} · IVA: exento · <b style="font-size:14pt">Total: ${eur(+f.tot)}</b></div>
  <p style="font-style:italic;margin-top:6mm">${esc(f.exenta||EXENTO_IVA)}</p>
  <p>Forma de pago: ${esc(f.forma||"—")}</p>
  ${bo?`<p style="font-weight:700">VISTA PREVIA: todavía no es una factura. El número y la fecha se fijan al emitirla.</p>`:pr?`<p style="font-weight:700">FACTURA DE PRUEBA, SIN VALOR. Las facturas de este periodo las emite Argos.</p>`:""}
  ${f.huella?`<p style="color:#666;font-size:8pt;margin-top:10mm;word-break:break-all">Huella: ${esc(f.huella)}</p>`:""}`}
function imprimirFactura(f){const old=$("#facprint");if(old)old.remove();const el=document.createElement("div");el.id="facprint";el.innerHTML=feHtml(f);document.body.appendChild(el);document.body.classList.add("printfac");
  const fin=()=>{document.body.classList.remove("printfac");el.remove();removeEventListener("afterprint",fin)};addEventListener("afterprint",fin);
  const imgs=[...el.querySelectorAll("img")];Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),50))}
document.head.insertAdjacentHTML("beforeend",`<style>#facprint{display:none}@media print{body.printfac>*:not(#facprint){display:none!important}body.printfac{background:#fff!important;padding:0!important}body.printfac::before{display:none}
body.printfac #facprint{display:block!important;color:#000;font:10.5pt/1.4 Arial,"DejaVu Sans",sans-serif;padding:16mm 18mm}}</style>`);
/* PDF de una factura con pdf-lib (para el .zip de la asesoría) */
async function fePdf(f){await cargarPdfLib();const P=window.PDFLib,doc=await P.PDFDocument.create(),pg=doc.addPage([595.28,841.89]),
  fn=await doc.embedFont(P.StandardFonts.Helvetica),fb=await doc.embedFont(P.StandardFonts.HelveticaBold),fi=await doc.embedFont(P.StandardFonts.HelveticaOblique);
  const neg=P.rgb(0,0,0),gris=P.rgb(.4,.4,.4);let y=790;
  const T=(t,x,sz,o={})=>{const font=o.b?fb:o.i?fi:fn,s=String(t);const w=font.widthOfTextAtSize(s,sz);pg.drawText(s,{x:o.r?x-w:x,y,size:sz,font,color:o.g?gris:neg})};
  const wrap=(t,sz,maxW,font)=>{const out=[];let l="";for(const w of String(t).split(" ")){const n=l?l+" "+w:w;if(font.widthOfTextAtSize(n,sz)>maxW&&l){out.push(l);l=w}else l=n}if(l)out.push(l);return out};
  const D=x=>fmtFecha(x).replace(/\/(\d\d)$/,"/20$1"),R=540,L=55;
  T(EMISOR.nombre,L,11,{b:1});T("Factura simplificada"+(f.prueba?" · PRUEBA":""),R,16,{b:1,r:1});y-=16;
  T(FE_TITULAR,L,10);T("Nº "+f.n,R,11,{b:1,r:1});y-=14;
  T(EMISOR.dir,L,10);T("Fecha de expedición: "+D(f.fecha),R,10,{r:1});y-=14;
  T(EMISOR.cp,L,10);if(f.fop&&f.fop!==f.fecha)T("Fecha de la operación (pago): "+D(f.fop),R,10,{r:1});y-=14;
  T("NIF: "+EMISOR.nif,L,10);y-=36;
  T("Alumno: "+String(f.cliente||"").toUpperCase(),L,10,{b:1});y-=28;
  T("Concepto",L,10,{b:1});T("Importe",R,10,{b:1,r:1});y-=6;pg.drawLine({start:{x:L,y},end:{x:R,y},thickness:.8});y-=14;
  const con=wrap(f.concepto+(f.rec&&f.rec.numero?` (albarán ${f.rec.numero})`:""),10,380,fn);T(eur(+f.base),R,10,{r:1});for(const l of con){T(l,L,10);y-=13}
  y-=2;pg.drawLine({start:{x:L,y},end:{x:R,y},thickness:.8});y-=16;
  T("Base imponible: "+eur(+f.base)+"   ·   IVA: exento",R,10,{r:1});y-=18;T("Total: "+eur(+f.tot),R,14,{b:1,r:1});y-=32;
  for(const l of wrap(f.exenta||EXENTO_IVA,9,R-L,fi)){T(l,L,9,{i:1});y-=12}y-=8;
  T("Forma de pago: "+(f.forma||"—"),L,10);y-=16;
  if(f.prueba){T("FACTURA DE PRUEBA, SIN VALOR.",L,10,{b:1});y-=16}
  y=60;for(const l of wrap("Huella: "+(f.huella||""),7,R-L,fn)){T(l,L,7,{g:1});y-=9}
  return await doc.save()}
/* Facturas reales de un mes en el formato de «Facturas de venta» (para el informe, la asesoría y el .zip) */
function feVentasMes(mes){feEscuchar();return FE.real.docs.filter(f=>String(f.fecha||"").startsWith(mes)).map(f=>({n:f.n,f:f.fecha,c:f.cliente,nif:"",fp:f.forma||"",tot:+f.tot||0,
  app:{n:f.n,fecha:f.fecha,fop:f.fop,cliente:f.cliente,concepto:f.concepto,rec:{numero:(f.rec&&f.rec.numero)||""},base:+f.base||0,tot:+f.tot||0,exenta:f.exenta,forma:f.forma||"",huella:f.huella||""}}))}

document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-fe]");if(!t||!gtVer())return;e.preventDefault();const a=t.dataset.fe;
  if(a==="forma"){const k=t.dataset.k,FF=feFormas();FF[k]=!FF[k];const d={...(S.recCfg||{}),facFormas:FF};t.disabled=true;
    try{await S.db.doc("config/recibos").set(d);S.recCfg=d;render()}catch(x){console.warn(x);toast("No se ha podido guardar la selección");t.disabled=false}}
  else if(a==="emitir"){FE.conf=true;FE.res="";render()}else if(a==="emitirno"){FE.conf=false;render()}
  else if(a==="emitirok"){t.disabled=true;await feEmitir()}
  else if(a==="previa"){const W=feSemana(GT.facSem),x=W.l[+t.dataset.i];if(!x)return;const C=contadores().fac,hoy=todayISO(),anio=+hoy.slice(0,4),n=fmtContador(C,feSiguiente(FE[feModo()].docs,C,anio)+(+t.dataset.i),anio);
    imprimirFactura({n,fecha:hoy,fop:x.fp,cliente:titulo(x.a.nombre||""),rec:{numero:x.r.numero||""},concepto:feConcepto(x.r),base:x.imp,tot:x.imp,exenta:EXENTO_IVA,forma:x.forma,borrador:true,prueba:!feReal()})}
  else if(a==="ver"){const f=FE[feModo()].docs.find(x=>x.id===t.dataset.id);if(f)imprimirFactura(f)}
  else if(a==="borrar"){FE.borrar=true;render()}else if(a==="borrarno"){FE.borrar=false;render()}
  else if(a==="borrarok"){t.disabled=true;await feBorrarPrueba()}});

/* ============================================================================================
   Eventos en el horario (02/11/2026): entrevista con la familia, evaluación (1 a 4 sesiones) y sesión psicopedagógica.
   - Se crean desde Semana («Añadir evento»). Dirección y recepción, para cualquier profesora; cada profesora, en su horario.
   - Salen en la casilla de su día y hora, como una sesión, aunque la persona no sea alumna del centro.
   - eventos/<id> = {tipo, fecha, ini, dur, profe, nombre, alumno?, tel, asunto, estado:"activo"|"anulado"|"hecha", tok,
     grupo (evaluación: id del primer evento), ses (nº de sesión), cobro?:{importe, estado:"pendiente"|"argos"|"recibo", recibo, t, por}, t, por}
   - Confirmación: el WhatsApp lleva un enlace URL_APP/?cita=<tok>. Esa página (fb.js, sin entrar con usuario) enseña la cita y deja
     «Confirmo la cita» o «No puedo ir». Se guarda en citas/<tok> = {tipo, nombre (solo el nombre de pila), profe, fecha, ini, conf, noPuede}:
     lo mínimo, porque se puede leer sin usuario conociendo el enlace. La app lee citas/ y enseña el estado.
   - Cobro: evaluación 180 € (al terminarla, con las sesiones que hayan sido) y psicopedagogía 40 € (al marcar la sesión como hecha).
     Hasta el 31/12/2026 los recibos los hace Argos: la app avisa y se marca «Hecho en Argos». Desde el 1/1/2027, dirección crea el
     recibo desde el evento (da de alta a la persona si no es alumna): se cobra en Caja y se factura en la facturación semanal.
   ============================================================================================ */
/* Solo para Fani (psicopedagoga), 02/11/2026: los eventos son siempre suyos; los crean dirección, recepción y la propia Fani. */
const EV_PROFE="Fani";
const EV_TIPOS={entrevista:{t:"Entrevista con la familia",c:"Entrevista",dur:30,precio:0},evaluacion:{t:"Evaluación",c:"Evaluación",dur:60,precio:180},psico:{t:"Sesión psicopedagógica",c:"Psicopedagogía",dur:60,precio:40}};
const EV={docs:[],citas:{},notas:{},sub:null,csub:null,nsub:null,ok:false,err:false,form:null,ver:null,busy:false};
/* 19/11/2026: las anotaciones de las citas van en eventosNotas/<id> (solo centro y la profesora), no en eventos/ (que lee el alumno) */
const evAnot=e=>(e&&EV.notas[e.id])||{};
async function evGuardarAnot(id,v){const e=evDe(id);if(!e)return;try{await S.db.doc("eventosNotas/"+id).set({anot:v,t:nowISO(),por:quienSoy(),profe:e.profe});EV.notas[id]={anot:v,t:nowISO(),por:quienSoy(),profe:e.profe};evPintar();toast("Anotaciones guardadas")}
  catch(x){console.warn(x);toast(/perm/i.test(String(x&&x.message))?"Faltan permisos: hay que publicar las reglas nuevas en Firebase.":"No se han podido guardar las anotaciones.")}}
const evPuede=()=>S.screen==="app"&&!S.pv&&!S.ro&&(S.role==="dir"||(S.role==="profe"&&S.myProfe===EV_PROFE));
const evCentro=()=>S.role==="dir"&&!(typeof esMos==="function"&&esMos());/* cobros y recibos: solo dirección */
const evAlta=()=>S.role==="dir";/* dar de alta: dirección y recepción */
function evEscuchar(){if(EV.sub||!S.db||!(S.role==="dir"||(S.role==="profe"&&S.myProfe===EV_PROFE)))return;
  const prof=S.role==="profe"?S.myProfe:"";const q=c=>prof?S.db.collection(c).where("profe","==",prof):S.db.collection(c);
  const re=()=>{if(S.view==="semana"){if(typeof refrescar==="function")refrescar()}if(EV.ver)evPintar()};
  EV.sub=q("eventos").onSnapshot(s=>{EV.docs=s.docs.map(d=>({id:d.id,...d.data()}));EV.ok=true;EV.err=false;re();try{evAuto()}catch(_){}},()=>{EV.ok=true;EV.err=true;re()});
  EV.csub=q("citas").onSnapshot(s=>{const o={};s.docs.forEach(d=>{o[d.id]=d.data()});EV.citas=o;re()},()=>{});
  EV.nsub=q("eventosNotas").onSnapshot(s=>{const o={};s.docs.forEach(d=>{o[d.id]=d.data()});EV.notas=o;re()},()=>{})}
const evActivos=()=>EV.docs.filter(e=>e.estado!=="anulado");
const evDe=id=>EV.docs.find(e=>e.id===id)||null;
const evTok=()=>{const a=new Uint8Array(12);crypto.getRandomValues(a);return [...a].map(x=>"abcdefghijkmnpqrstuvwxyz23456789"[x%32]).join("")};
const evNombreCorto=n=>titulo(String(n||"").trim()).split(" ")[0]||"";
function evConf(e){const c=e&&e.tok&&EV.citas[e.tok];if(e&&e.confMano)return {k:"si",t:e.confMano,mano:1};if(!c)return {k:"pend"};if(c.noPuede&&(!c.conf||c.noPuede>c.conf))return {k:"no",t:c.noPuede};if(c.conf)return {k:"si",t:c.conf};return {k:"pend"}}
const evConfBadge=e=>{const c=evConf(e);return c.k==="si"?`<span class="badge b-si">Confirmada</span>`:c.k==="no"?`<span class="badge b-no">No puede venir</span>`:`<span class="badge b-pend">Sin confirmar</span>`};
/* hueco de la cuadrícula en el que cae el evento */
function evSlot(ini){let best=null;for(const h of HORAS){const i=KEY_INI[h];if(i<=ini&&(best==null||i>KEY_INI[best]))best=h}return best||HORAS[0]}
/* eventos de una casilla de Semana (día de la semana d, hueco h, semana que empieza el lunes lun) */
function evCelda(d,h,lun){if(!(S.role==="dir"||(S.role==="profe"&&S.myProfe===EV_PROFE)))return "";evEscuchar();const f=sumaDias(lun,DIAS.indexOf(d));
  const l=evActivos().filter(e=>e.fecha===f&&evSlot(e.ini)===h&&(!S.profe||e.profe===S.profe)&&(S.role!=="profe"||e.profe===S.myProfe)).sort((a,b)=>a.ini-b.ini);
  return l.map(e=>`<div class="nm evc" data-ev="ver" data-id="${esc(e.id)}" style="--pc:${pc(e.profe)}" title="${esc(EV_TIPOS[e.tipo].t)} · ${hm(e.ini)}–${hm(e.ini+(+e.dur||60))} · ${esc(e.profe)}"><span class="hr">${hm(e.ini)}</span><b>${esc(EV_TIPOS[e.tipo].c)}${e.tipo==="evaluacion"?" "+(e.ses||1):""}</b> · ${esc(titulo(e.nombre))}${evConf(e).k==="si"?" ✓":evConf(e).k==="no"?" ✗":""}${!S.profe?` <small>(${esc(e.profe)})</small>`:""}</div>`).join("")}
/* barra de Semana: botón y avisos */
function evBarra(){if(!(S.role==="dir"||(S.role==="profe"&&S.myProfe===EV_PROFE))||(S.profe&&S.profe!==EV_PROFE))return "";evEscuchar();if(EV.err)return `<div class="aviso pend"><span>No se pueden leer los eventos: hay que publicar las reglas nuevas en Firebase.</span></div>`;
  const hoy=todayISO(),prox=evActivos().filter(e=>e.fecha>=hoy&&e.estado==="activo"),sin=prox.filter(e=>evConf(e).k!=="si").length,no=prox.filter(e=>evConf(e).k==="no").length;
  const cob=evCentro()?EV.docs.filter(e=>e.cobro&&e.cobro.estado==="pendiente").length:0;
  return `<div class="bar" style="gap:8px;flex-wrap:wrap">${evPuede()?`<button class="btn small primary" data-ev="nuevo">+ Añadir evento</button>`:""}<span class="note">Entrevistas, evaluaciones y sesiones psicopedagógicas de ${EV_PROFE}.</span>
    ${sin?`<button class="btn small" data-ev="lista" data-f="sin">${sin} cita${sin===1?"":"s"} sin confirmar${no?` (${no} no puede${no===1?"":"n"} venir)`:""}</button>`:""}
    ${cob?`<button class="btn small" data-ev="lista" data-f="cobro" style="border-color:var(--warn)">${cob} cobro${cob===1?"":"s"} pendiente${cob===1?"":"s"} de recibo</button>`:""}</div>`}
/* ---------- panel lateral: formulario, ficha y listas ---------- */
function evCerrar(){EV.form=null;EV.ver=null;EV.lista=null;$("#layer").innerHTML=""}
function evPintar(){const L=$("#layer");if(!L)return;
  const caja=(tit,sub,body)=>`<div class="scrim" data-ev="cerrar"></div><aside class="drawer" role="dialog" aria-label="${esc(tit)}"><div class="dh"><div><h3>${esc(tit)}</h3>${sub?`<p>${sub}</p>`:""}</div><button class="btn x" data-ev="cerrar" aria-label="Cerrar">Cerrar</button></div><div class="db">${body}</div></aside>`;
  if(EV.form){const F=EV.form,T=EV_TIPOS[F.tipo],esP=S.role==="profe",bloq=!!F.grupo||!!F.id;
    const profes=EQUIPO.map(p=>`<option ${p===F.profe?"selected":""}>${esc(p)}</option>`).join("");
    const durs=[30,45,60,90].map(m=>`<option value="${m}" ${+F.dur===m?"selected":""}>${m} min</option>`).join("");
    L.innerHTML=caja(F.id?"Cambiar la cita":F.grupo?`Evaluación · sesión ${F.ses}`:"Añadir evento",F.id||F.grupo?esc(titulo(F.nombre)):"Sale en el horario como una sesión",`
      ${bloq?"":`<div class="bar" style="flex-wrap:wrap;gap:6px">${Object.entries(EV_TIPOS).map(([k,x])=>`<button class="chip" data-ev="tipo" data-v="${k}" aria-pressed="${F.tipo===k}">${F.tipo===k?"✓ ":""}${esc(x.t)}</button>`).join("")}</div>`}
      <div class="addbox" style="display:flex;flex-direction:column;gap:8px">
      <div class="r2"><label class="f">Profesora<input value="${esc(EV_PROFE)}" disabled></label>
        <label class="f">Día<input type="date" id="ev-fecha" value="${esc(F.fecha)}"></label></div>
      <div class="r2"><label class="f">Hora<input type="time" id="ev-hora" value="${hm(F.ini)}" step="300"></label><label class="f">Duración<select id="ev-dur">${durs}</select></label></div>
      ${bloq?"":`<label class="f">${F.tipo==="entrevista"?"Alumno o alumna":F.tipo==="evaluacion"?"Nombre del futuro alumno":"Nombre de la persona"}<input type="text" id="ev-nombre" list="dl-al" value="${esc(F.nombre||"")}" autocomplete="off" placeholder="Nombre y apellidos"></label>
      <label class="f">Teléfono ${F.tipo==="entrevista"||F.tipo==="evaluacion"?"del padre, madre o tutor":"de contacto"}<input type="tel" id="ev-tel" value="${esc(F.tel||"")}" inputmode="tel" placeholder="600 000 000"></label>`}
      <label class="f">${F.tipo==="entrevista"?"Asunto a tratar":"Notas"}<textarea id="ev-asunto" rows="3" maxlength="400">${esc(F.asunto||"")}</textarea></label>
      ${!bloq&&F.tipo==="psico"&&evAlta()?`<label class="chk"><input type="checkbox" id="ev-alta" ${F.alta!==false?"checked":""}><span>Si no es alumno del centro, darlo de alta ahora como alumno de psicopedagogía</span></label>`:""}
      ${T.precio?`<p class="note" style="margin:0">Precio: ${eur(T.precio)}${F.tipo==="evaluacion"?" la evaluación completa (de 1 a 4 sesiones), al terminarla":" por sesión"}. ${cajaPrueba()?"Hasta enero el recibo se hace en Argos.":"El recibo lo crea dirección desde el evento."}</p>`:""}
      <div class="petbtns"><button class="btn primary" data-ev="guardar" ${EV.busy?"disabled":""}>${F.id?"Guardar cambios":"Guardar y ver la cita"}</button><button class="btn" data-ev="cerrar">Cancelar</button></div></div>`);return}
  if(EV.lista){const f=EV.lista,hoy=todayISO(),l=f==="cobro"?EV.docs.filter(e=>e.cobro&&e.cobro.estado==="pendiente"):evActivos().filter(e=>e.fecha>=hoy&&e.estado==="activo"&&evConf(e).k!=="si");
    L.innerHTML=caja(f==="cobro"?"Cobros pendientes de recibo":"Citas sin confirmar",`${l.length}`,l.sort((a,b)=>(a.fecha+a.ini).localeCompare(b.fecha+b.ini)).map(e=>`<div class="row" style="cursor:pointer" data-ev="ver" data-id="${esc(e.id)}"><span class="note" style="min-width:110px">${fCorta(e.fecha)} · ${hm(e.ini)}</span><span class="grow">${esc(EV_TIPOS[e.tipo].c)} · ${esc(titulo(e.nombre))} <span class="note">· ${esc(e.profe)}</span></span>${f==="cobro"?`<b>${eur(e.cobro.importe)}</b>`:evConfBadge(e)}</div>`).join("")||`<p class="note">Nada pendiente.</p>`);return}
  const e=evDe(EV.ver);if(!e){evCerrar();return}
  const T=EV_TIPOS[e.tipo],c=evConf(e),fin=e.ini+(+e.dur||60),pasada=e.fecha<todayISO(),grupo=e.tipo==="evaluacion"?EV.docs.filter(x=>(x.grupo||x.id)===(e.grupo||e.id)&&x.estado!=="anulado").sort((a,b)=>(a.ses||1)-(b.ses||1)):[];
  const cabeza=grupo[0]||e,cob=(e.tipo==="evaluacion"?cabeza:e).cobro,tel=digitos(e.tel).slice(-9),msg=evMensaje(e),edita=evPuede()&&(S.role!=="profe"||e.profe===S.myProfe);
  const confTxt=c.k==="si"?`<p style="color:var(--ok);margin:0"><b>Cita confirmada</b>${c.t?` el ${fmtFecha(String(c.t).slice(0,10))} a las ${new Date(c.t).toTimeString().slice(0,5)}`:""}${c.mano?" (marcada a mano)":" por la familia"}.</p>`
    :c.k==="no"?`<p style="color:var(--bad);margin:0"><b>La familia ha indicado que no puede venir</b> (${fmtFecha(String(c.t).slice(0,10))}). Llámala para cambiar la cita.</p>`:`<p class="note" style="margin:0">Todavía sin confirmar. Envía el WhatsApp: la familia la confirma con un enlace y aquí sale al momento.</p>`;
  const cobroH=!T.precio||e.estado==="anulado"?"":(()=>{
    if(e.tipo==="evaluacion"&&!cob)return edita&&cabeza.estado!=="hecha"?`<div class="petbtns">${grupo.length<4?`<button class="btn small" data-ev="sesion" data-id="${esc(cabeza.id)}">Añadir la sesión ${grupo.length+1}</button>`:""}<button class="btn small primary" data-ev="terminar" data-id="${esc(cabeza.id)}">Terminar la evaluación (${eur(T.precio)})</button></div>`:"";
    if(e.tipo==="psico"&&!cob)return edita?`<div class="petbtns"><button class="btn small primary" data-ev="terminar" data-id="${esc(e.id)}">Sesión hecha · cobrar ${eur(T.precio)}</button></div>`:"";
    const x=cob;if(x.estado==="recibo"){
      /* 19/11/2026 (titular): Estefanía suele cobrar ella las citas: botón «Cobrar» que abre la Caja con el alumno */
      const al=e.alumno&&S.alumnos.get(e.alumno),rc=al&&(al.recibos||[]).find(r=>r&&r.numero===x.recibo),pend=rc&&rc.estado!=="pagado"&&!(typeof cajaPrueba==="function"&&cajaPrueba()&&typeof cobradosPrueba==="function"&&cobradosPrueba().has(e.alumno+"|"+rc.id));
      return `<p style="color:var(--ok);margin:0">Recibo ${esc(x.recibo||"")} de ${eur(x.importe)} creado${rc&&rc.estado==="pagado"?" y <b>pagado</b>":""}.</p>${pend&&S.role==="dir"&&!S.pv&&!S.ro?`<div class="petbtns" style="margin-top:6px"><button class="btn small primary" data-act="cobrarya" data-id="${esc(e.alumno)}">Cobrar ${eur(+rc.importe||0)}</button><span class="note">Abre la Caja con ${esc(titulo(al.nombre))}.</span></div>`:""}`}
    if(x.estado==="argos")return `<p style="color:var(--ok);margin:0">Recibo de ${eur(x.importe)} hecho en Argos.</p>`;
    if(x.estado==="incluido")return `<p style="color:var(--ok);margin:0">Incluida en su mensualidad (sesión ${x.i||1} de ${x.n||1} de ${esc(mesTxt(String(e.fecha).slice(0,7)))}): no lleva recibo.</p>`;
    return `<div class="aviso pend" style="display:block;margin:0"><b>Cobro pendiente: ${eur(x.importe)}</b> · ${esc(x.concepto||"")}<br>
      ${evCentro()?`<button class="btn small primary" data-ev="recibo" data-id="${esc((e.tipo==="evaluacion"?cabeza:e).id)}">Crear el recibo de ${eur(x.importe)}</button> <span class="note">${e.alumno?"":"Se dará de alta a la persona como alumno."}</span>${cajaPrueba()?` <button class="btn small" data-ev="argos" data-id="${esc((e.tipo==="evaluacion"?cabeza:e).id)}" title="Si ya lo hiciste en Argos">Ya está hecho en Argos</button>`:""}`:"Dirección hará el recibo (se crea solo al abrir la app)."}</div>`})();
  L.innerHTML=caja(T.t+(e.tipo==="evaluacion"?` · sesión ${e.ses||1}`:""),`${esc(titulo(e.nombre))}${e.estado==="anulado"?" · <b>anulada</b>":""}`,`
    <div class="addbox" style="display:flex;flex-direction:column;gap:6px">
      <div><b>${fLarga(e.fecha)}</b>, de ${hm(e.ini)} a ${hm(fin)} · ${esc(e.profe)}</div>
      ${e.tel?`<div>Teléfono: ${esc(fmtTel(e.tel))}</div>`:""}${e.asunto?`<div style="white-space:pre-wrap"><span class="note">${e.tipo==="entrevista"?"Asunto":"Notas"}:</span> ${esc(e.asunto)}</div>`:""}
      <div class="note">${e.alumno&&S.alumnos.has(e.alumno)?`Alumno del centro: <a href="#" data-act="ir" data-id="${esc(e.alumno)}" style="color:inherit">${esc(titulo(S.alumnos.get(e.alumno).nombre))}</a>`:"Sin ficha de alumno enlazada"}${S.role==="dir"&&!S.pv&&!S.ro?` <button class="btn small" data-ev="enlazar" data-id="${esc(e.id)}" style="margin-left:6px">${e.alumno&&S.alumnos.has(e.alumno)?"Cambiar":"Enlazar con un alumno"}</button>`:""}</div>
      ${grupo.length>1||e.tipo==="evaluacion"?`<div class="note">Sesiones de la evaluación: ${grupo.map(x=>`<a href="#" data-ev="ver" data-id="${esc(x.id)}" style="color:inherit;${x.id===e.id?"font-weight:700":""}">${x.ses||1}ª ${fCorta(x.fecha)} ${hm(x.ini)}</a>`).join(" · ")}</div>`:""}
    </div>
    ${e.estado!=="anulado"?`<div class="addbox" style="display:flex;flex-direction:column;gap:8px"><b style="font-size:13px">Confirmación ${evConfBadge(e)}</b>${confTxt}
      ${!pasada&&edita?`<div class="petbtns">${tel.length===9?`<a class="btn small primary" href="https://wa.me/34${tel}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Enviar WhatsApp de confirmación</a>`:`<span class="note">Sin teléfono: no se puede enviar el WhatsApp.</span>`}<button class="btn small" data-ev="copiar" data-id="${esc(e.id)}">Copiar mensaje</button>${c.k!=="si"?`<button class="btn small" data-ev="confmano" data-id="${esc(e.id)}">Marcar confirmada a mano</button>`:""}</div>`:""}</div>`:""}
    ${cobroH?`<div class="addbox">${cobroH}</div>`:""}
    ${e.tipo==="entrevista"&&e.estado==="activo"&&edita?`<div class="addbox"><div class="petbtns"><button class="btn small primary" data-ev="terminar" data-id="${esc(e.id)}">Entrevista hecha</button><span class="note">${e.alumno?"Queda en su ficha.":"Se crea su ficha con el nombre y el teléfono."}</span></div></div>`:""}
    ${e.estado==="hecha"&&e.tipo==="entrevista"?`<p style="color:var(--ok);margin:0">Entrevista hecha${e.alumno?" · en la ficha del alumno":""}.</p>`:""}
    ${(N=>e.estado!=="anulado"&&(edita||N.anot)?`<div class="addbox" style="display:flex;flex-direction:column;gap:6px"><b style="font-size:13px">Anotaciones${e.tipo==="entrevista"?" de la entrevista":""}</b> <span class="note">Solo las ven dirección, mostrador y ${esc(e.profe)}; la familia no.</span>
      ${edita?`<textarea id="ev-anot" rows="4" maxlength="2000" placeholder="Lo que cuenta la familia, curso, dificultades, horario que le viene bien…">${esc(N.anot||"")}</textarea><div class="petbtns"><button class="btn small" data-ev="anot" data-id="${esc(e.id)}">Guardar anotaciones</button>${N.t?`<span class="note">Guardado el ${fmtFecha(String(N.t).slice(0,10))} · ${esc(N.por||"")}</span>`:""}</div>`:`<p style="margin:0;white-space:pre-wrap">${esc(N.anot)}</p>`}</div>`:"")(evAnot(e))}
    ${edita&&e.estado!=="anulado"?`<div class="petbtns"><button class="btn small" data-ev="editar" data-id="${esc(e.id)}">Cambiar día u hora</button>${!cob?`<button class="btn small" data-ev="anular" data-id="${esc(e.id)}">Anular la cita</button>`:""}</div>`:""}`)}
function evMensaje(e){const T=EV_TIPOS[e.tipo],que=e.tipo==="entrevista"?`la entrevista sobre ${titulo(e.nombre)}`:e.tipo==="evaluacion"?`la sesión ${e.ses||1} de la evaluación de ${titulo(e.nombre)}`:`la sesión psicopedagógica de ${titulo(e.nombre)}`;
  return `Hola, le escribimos de Althea Formación. Le recordamos ${que} el ${fLarga(e.fecha).toLowerCase()} a las ${hm(e.ini)} con ${e.profe}. Por favor, confírmenos su asistencia en este enlace: ${URL_APP}/?cita=${e.tok} . Si no puede venir, indíquelo en el mismo enlace. Muchas gracias.`}
function evLeerForm(){const F=EV.form,v=id=>($("#"+id)||{}).value;
  if($("#ev-profe"))F.profe=v("ev-profe");if($("#ev-fecha"))F.fecha=v("ev-fecha")||F.fecha;const h=v("ev-hora");if(h&&/^\d\d:\d\d$/.test(h))F.ini=+h.slice(0,2)*60+ +h.slice(3);
  if($("#ev-dur"))F.dur=+v("ev-dur")||F.dur;if($("#ev-nombre"))F.nombre=String(v("ev-nombre")||"").replace(/\s+/g," ").trim();if($("#ev-tel"))F.tel=digitos(v("ev-tel")).slice(-9);
  if($("#ev-asunto"))F.asunto=String(v("ev-asunto")||"").trim().slice(0,400);if($("#ev-alta"))F.alta=$("#ev-alta").checked}
async function evCita(e){/* copia mínima para la página pública de confirmación */
  await S.db.doc("citas/"+e.tok).set({tipo:e.tipo,nombre:evNombreCorto(e.nombre),profe:e.profe,fecha:e.fecha,ini:e.ini,conf:"",noPuede:"",t:nowISO()})}
async function evGuardar(){evLeerForm();const F=EV.form;
  if(!F.fecha||F.ini==null){toast("Pon el día y la hora");return}if(!F.nombre){toast("Escribe el nombre");return}
  if(F.tipo!=="psico"&&!F.tel&&!F.grupo&&!F.id){if(!confirm("Sin teléfono no se podrá enviar el WhatsApp de confirmación. ¿Guardar igualmente?"))return}
  if(!DIAS.includes(diaDe(F.fecha))){toast("Ese día es fin de semana");return}
  F.profe=EV_PROFE;
  EV.busy=true;evPintar();
  try{
    if(F.id){const e=evDe(F.id),cambia=e.fecha!==F.fecha||e.ini!==F.ini||e.profe!==F.profe,d={fecha:F.fecha,ini:F.ini,dur:F.dur,profe:F.profe,asunto:F.asunto,act:nowISO(),...(cambia?{tok:evTok(),confMano:""}:{})};
      await S.db.doc("eventos/"+e.id).update(d);const n={...e,...d};if(cambia){await evCita(n);try{await S.db.doc("citas/"+e.tok).delete()}catch(_){}}Object.assign(e,d);EV.form=null;EV.ver=e.id;EV.busy=false;evPintar();toast(cambia?"Cita cambiada: vuelve a enviar el WhatsApp de confirmación":"Cambios guardados");return}
    let alumno=F.alumno||idPorNombre(F.nombre)||"";
    if(!alumno&&F.tipo==="psico"&&evAlta()&&F.alta!==false){alumno=await crearAlumno(F.nombre)||"";if(alumno){const a=S.alumnos.get(alumno);await save(alumno,{psico:true,telefonos:[...new Set([...(a.telefonos||[]),F.tel].filter(Boolean))]})}}
    const id="ev"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const e={tipo:F.tipo,fecha:F.fecha,ini:F.ini,dur:F.dur,profe:F.profe,nombre:alumno&&S.alumnos.get(alumno)?S.alumnos.get(alumno).nombre:F.nombre.toUpperCase(),alumno,tel:F.tel||"",asunto:F.asunto||"",estado:"activo",tok:evTok(),
      ...(F.tipo==="evaluacion"?{grupo:F.grupo||id,ses:F.ses||1}:{}),t:nowISO(),por:quienSoy()};
    await S.db.doc("eventos/"+id).set(e);await evCita(e);EV.docs=[...EV.docs.filter(x=>x.id!==id),{id,...e}];EV.form=null;EV.ver=id;EV.busy=false;evPintar();if(S.view==="semana")render();toast("Cita guardada")}
  catch(x){console.warn(x);EV.busy=false;evPintar();toast(/perm/i.test(String((x&&x.fb)||"")+" "+(x&&x.message))?"Faltan permisos: hay que publicar las reglas nuevas en Firebase.":"No se ha podido guardar. Inténtalo de nuevo.")}}
async function evActualizar(id,d,ok){try{await S.db.doc("eventos/"+id).update(d);const e=evDe(id);if(e)Object.assign(e,d);evPintar();if(S.view==="semana")render();if(ok)toast(ok);return true}catch(x){console.warn(x);toast("No se ha podido guardar.");return false}}
async function evTerminar(id){const e=evDe(id);if(!e)return;const T=EV_TIPOS[e.tipo];
  /* 19/11/2026 (titular): la entrevista no se cobra, pero al hacerse se crea su ficha (nombre y teléfono) y queda en su historial */
  if(e.tipo==="entrevista"){const an=$("#ev-anot")?String($("#ev-anot").value||"").trim().slice(0,2000):null;
    if(an!=null&&an!==(evAnot(e).anot||""))await evGuardarAnot(id,an);
    await evActualizar(id,{estado:"hecha",hecha:nowISO()},"Entrevista hecha");if(evCentro())await evFicha(id);return}
  const n=e.tipo==="evaluacion"?EV.docs.filter(x=>(x.grupo||x.id)===e.id&&x.estado!=="anulado").length:1;
  const concepto=e.tipo==="evaluacion"?`Evaluación (${n} sesi${n===1?"ón":"ones"})`:`Sesión psicopedagógica del ${fmtFecha(e.fecha)}`;
  if(!confirm(`${e.tipo==="evaluacion"?"Terminar la evaluación":"Marcar la sesión como hecha"} y dejar pendiente el cobro de ${eur(T.precio)}?`))return;
  await evActualizar(id,{estado:"hecha",cobro:{importe:T.precio,concepto,estado:"pendiente",t:nowISO(),por:quienSoy()}},"Cobro pendiente apuntado");
  /* 19/11/2026 (titular): al hacerse la sesión se crea la ficha (si no la tiene) y el recibo en la app, ya antes de enero */
  if(evCentro()&&T.precio>0)await evRecibo(id)}
/* 19/11/2026: citas del alumno en su ficha (dirección y mostrador) */
function vCitasFicha(id){if(S.role!=="dir")return "";evEscuchar();const l=EV.docs.filter(e=>e.alumno===id&&e.estado!=="anulado").sort((x,y)=>(y.fecha+hm(y.ini)).localeCompare(x.fecha+hm(x.ini)));if(!l.length)return "";
  return `<div><b style="font-size:14px">Citas</b> <span class="note">entrevistas, evaluaciones y sesiones</span>${l.slice(0,12).map(e=>`<div class="row" data-ev="ver" data-id="${esc(e.id)}" style="cursor:pointer"><span class="note" style="min-width:74px;font-variant-numeric:tabular-nums">${fmtFecha(e.fecha)}</span><span class="grow">${esc(EV_TIPOS[e.tipo].t)}${e.tipo==="evaluacion"?" · sesión "+(e.ses||1):""} · ${hm(e.ini)} · ${esc(e.profe)}</span>${e.estado==="hecha"?`<span class="badge b-si">Hecha</span>`:`<span class="badge b-off">Prevista</span>`}${e.cobro&&e.cobro.recibo?` <span class="note">${esc(e.cobro.recibo)}</span>`:""}</div>${(n=>n?`<div class="note" style="margin:0 0 6px 82px;white-space:pre-wrap">${esc(String(n).slice(0,300))}${String(n).length>300?"…":""}</div>`:"")(evAnot(e).anot)}`).join("")}</div>`}
/* Desde el 1/1/2027: recibo en la ficha (alta si hace falta), con el contador de albaranes; antes, de la serie HX */
async function evRecibo(id){const e=evDe(id);if(!e||!e.cobro||e.cobro.estado!=="pendiente"||!evCentro()||EV.busy)return;EV.busy=true;try{
  let aid=e.alumno&&S.alumnos.has(e.alumno)?e.alumno:idPorNombre(e.nombre);
  if(!aid){aid=await crearAlumno(e.nombre);if(!aid)return;if(await save(aid,{deCita:true}))S.alumnos.get(aid).deCita=true}
  const a=S.alumnos.get(aid),tels=[...new Set([...(a.telefonos||[]),e.tel].filter(Boolean))];
  const grupo=EV.docs.filter(x=>x.id===e.id||(x.grupo||"")===e.id);
  {const inc=psicoEnMensualidad({...e,alumno:aid},aid);if(inc){await evActualizar(id,{alumno:aid,cobro:{...e.cobro,estado:"incluido",n:inc.n,i:inc.i,rt:nowISO(),rpor:quienSoy()}},`Incluida en su mensualidad (sesión ${inc.i} de ${inc.n} de ${mesTxt(String(e.fecha).slice(0,7))})`);return}}
  const ya=(a.recibos||[]).find(r=>r&&(r.evento===e.id||(Array.isArray(r.lineas)&&r.lineas.some(l=>l&&l.evento===e.id))));
  if(ya){await evActualizar(id,{alumno:aid,cobro:{...e.cobro,estado:"recibo",recibo:ya.numero,rt:nowISO(),rpor:quienSoy()}},`Ya tenía el recibo ${ya.numero}`);return}
  if(cajaPrueba()){const R=hxAnadir(a,a.recibos||[],{txt:e.cobro.concepto,imp:+e.cobro.importe,evento:e.id},todayISO());const r=R.nuevo?{...R.r,evento:e.id}:R.r,recibos=R.recibos.map(x=>x===R.r?r:x);
    if(!await save(aid,{recibos,telefonos:tels,...(e.tipo==="psico"?{psico:true}:{})}))return;a.recibos=recibos;a.telefonos=tels;
    for(const x of grupo)if(x.id!==id&&x.alumno!==aid)await evActualizar(x.id,{alumno:aid},"");
    await evActualizar(id,{alumno:aid,cobro:{...e.cobro,estado:"recibo",recibo:r.numero,rt:nowISO(),rpor:quienSoy()}},`Recibo ${r.numero} creado: se cobra en Caja`);return}
  const C=contadores().alb,y=+todayISO().slice(0,4);let max=0;for(const [,x] of S.alumnos)for(const r of x.recibos||[])if(r&&r.origen==="app"&&+r.anio===y)max=Math.max(max,+r.num||0);
  const num=Math.max(max+1,+C.ini||1),r={id:uid(),numero:fmtContador(C,num,y),num,anio:y,emitido:todayISO(),concepto:e.cobro.concepto,importe:e.cobro.importe,estado:"pendiente",pagado:"",forma:"",origen:"app",evento:e.id};
  const recibos=[...(a.recibos||[]),r];if(!await save(aid,{recibos,telefonos:tels,...(e.tipo==="psico"?{psico:true}:{})}))return;a.recibos=recibos;a.telefonos=tels;
  for(const x of grupo)if(x.id!==id&&x.alumno!==aid)await evActualizar(x.id,{alumno:aid},"");
  await evActualizar(id,{alumno:aid,cobro:{...e.cobro,estado:"recibo",recibo:r.numero,rt:nowISO(),rpor:quienSoy()}},`Recibo ${r.numero} creado`)}finally{EV.busy=false}}
/* 19/11/2026 (titular, Enzo Gómez Aragón: 125 € = 2 sesiones de psicopedagogía de 40 € + 45 € de clase en grupo):
   si su tarifa guardada lleva un curso de psicopedagogía, las primeras sesiones de cada mes van en la mensualidad y no llevan recibo.
   Nº de sesiones incluidas = precio de esa línea ÷ precio de la sesión (40 €). */
function psicoIncluidas(a){try{if(!a||!a.matriz)return 0;const TM=tfMapa(),M=calcMatriz(a,TM);if(!M.guardada)return 0;
  const t=M.l.filter(y=>/PSICOPEDAG/i.test(String(y.curso||""))).reduce((s,y)=>s+(+precioLinea(y,TM)||0),0);return Math.floor(t/EV_TIPOS.psico.precio+0.01)}catch(_){return 0}}
function psicoEnMensualidad(e,aid){const a=S.alumnos.get(aid),n=psicoIncluidas(a);if(!n||e.tipo!=="psico")return null;
  const mes=String(e.fecha).slice(0,7),l=EV.docs.filter(x=>x.tipo==="psico"&&x.alumno===aid&&x.estado==="hecha"&&String(x.fecha).slice(0,7)===mes).sort((x,y)=>(x.fecha+hm(x.ini)).localeCompare(y.fecha+hm(y.ini)));
  const i=l.findIndex(x=>x.id===e.id);return i>=0&&i<n?{n,i:i+1}:null}
/* ficha del alumno para una cita hecha sin cobro (entrevista): la crea si no existe y la enlaza */
async function evFicha(id){const e=evDe(id);if(!e||!evCentro()||EV.busy)return;if(e.alumno&&S.alumnos.has(e.alumno))return;EV.busy=true;try{
  let aid=idPorNombre(e.nombre);if(!aid){aid=await crearAlumno(e.nombre);if(!aid)return;if(await save(aid,{deCita:true}))S.alumnos.get(aid).deCita=true}
  const a=S.alumnos.get(aid),tels=[...new Set([...(a.telefonos||[]),e.tel].filter(Boolean))];if(tels.length!==(a.telefonos||[]).length&&await save(aid,{telefonos:tels}))a.telefonos=tels;
  await evActualizar(id,{alumno:aid},`Ficha de ${titulo(e.nombre)} ${a.clases&&a.clases.length?"enlazada":"creada"}`)}finally{EV.busy=false}}
/* Si la cita la marca como hecha la profesora (Fani), la ficha y el recibo los crea la app de dirección en cuanto la abre */
let evAutoT=0;function evAuto(){if(!evCentro()||S.pv||S.ro||!S.alOk||EV.busy)return;const now=Date.now();if(now-evAutoT<15000)return;evAutoT=now;
  const e=EV.docs.find(x=>x.cobro&&x.cobro.estado==="pendiente"&&x.estado==="hecha"&&(+x.cobro.importe||0)>0);if(e){setTimeout(()=>evRecibo(e.id),500);return}
  const f=EV.docs.find(x=>x.tipo==="entrevista"&&x.estado==="hecha"&&!(x.alumno&&S.alumnos.has(x.alumno))&&String(x.hecha||x.fecha)>="2026-11-19");if(f){setTimeout(()=>evFicha(f.id),500);return}
  /* sesiones ya hechas con recibo HX de la app sin pagar que ahora entran en su mensualidad: se quita del recibo y queda «incluida» */
  for(const x of EV.docs){if(x.tipo!=="psico"||x.estado!=="hecha"||!x.cobro||x.cobro.estado!=="recibo"||!x.alumno)continue;const a=S.alumnos.get(x.alumno);if(!a||!psicoEnMensualidad(x,x.alumno))continue;
    const r=(a.recibos||[]).find(r=>r&&r.numero===x.cobro.recibo);if(!r||r.estado==="pagado"||r.serie!=="HX"||r.origen!=="app")continue;
    setTimeout(()=>evIncluirYa(x.id),500);return}}
async function evIncluirYa(id){const e=evDe(id);if(!e||!evCentro()||EV.busy)return;const a=S.alumnos.get(e.alumno),inc=psicoEnMensualidad(e,e.alumno);if(!a||!inc)return;EV.busy=true;try{
  const rs=a.recibos||[],nuevo=hxQuitar(rs,l=>l&&l.evento===e.id)||rs.filter(r=>!(r&&r.evento===e.id&&r.serie==="HX"&&r.estado!=="pagado"&&!(Array.isArray(r.lineas)&&r.lineas.length>1)));
  if(nuevo.length!==rs.length||nuevo!==rs){if(!await save(e.alumno,{recibos:nuevo}))return;a.recibos=nuevo}
  await evActualizar(id,{cobro:{...e.cobro,estado:"incluido",n:inc.n,i:inc.i,quitado:e.cobro.recibo||"",rt:nowISO(),rpor:quienSoy()}},`Sesión del ${fCorta(e.fecha)} incluida en su mensualidad: se quita del recibo ${e.cobro.recibo||""}`)}finally{EV.busy=false}}
function evNuevo(pre){const hoy=todayISO(),lun=S.semIni||lunesDe(hoy);let f=hoy>=lun&&hoy<=sumaDias(lun,4)?hoy:lun;
  EV.form={tipo:"entrevista",profe:EV_PROFE,fecha:f,ini:17*60,dur:30,nombre:"",tel:"",asunto:"",...(pre||{})};EV.ver=null;EV.lista=null;evPintar()}
document.addEventListener("click",async ev=>{const t=ev.target.closest&&ev.target.closest("[data-ev]");if(!t)return;ev.preventDefault();ev.stopPropagation();
  const a=t.dataset.ev,id=t.dataset.id;
  if(a==="cerrar"){evCerrar();return}
  if(a==="ver"){EV.form=null;EV.lista=null;EV.ver=id;evPintar();return}
  if(a==="lista"){EV.form=null;EV.ver=null;EV.lista=t.dataset.f;evPintar();return}
  if(a==="copiar"){const e=evDe(id);if(!e)return;const m=evMensaje(e);try{await navigator.clipboard.writeText(m);toast("Mensaje copiado")}catch(_){prompt("Copia el mensaje:",m)}return}
  if(!evPuede())return;
  if(a==="nuevo")evNuevo();
  else if(a==="tipo"){evLeerForm();EV.form.tipo=t.dataset.v;EV.form.dur=EV_TIPOS[t.dataset.v].dur;evPintar()}
  else if(a==="guardar")await evGuardar();
  else if(a==="editar"){const e=evDe(id);if(e)EV.form={...e,id:e.id};EV.ver=null;evPintar()}
  else if(a==="sesion"){const e=evDe(id);if(!e)return;const n=EV.docs.filter(x=>(x.grupo||x.id)===e.id&&x.estado!=="anulado").length;if(n>=4){toast("La evaluación tiene como máximo 4 sesiones");return}
    evNuevo({tipo:"evaluacion",grupo:e.id,ses:n+1,nombre:e.nombre,tel:e.tel,alumno:e.alumno||"",profe:e.profe,dur:+e.dur||60,ini:e.ini,fecha:sumaDias(e.fecha,7)>todayISO()?sumaDias(e.fecha,7):todayISO()})}
  else if(a==="anular"){if(confirm("¿Anular esta cita? Deja de salir en el horario."))await evActualizar(id,{estado:"anulado",anulado:{t:nowISO(),por:quienSoy()}},"Cita anulada")}
  else if(a==="confmano")await evActualizar(id,{confMano:nowISO()},"Marcada como confirmada")
  else if(a==="enlazar"&&S.role==="dir"){const e=evDe(id);if(!e)return;const q=prompt("Escribe el nombre y apellidos del alumno (o parte):",titulo(e.nombre||""));if(!q)return;
    const n=nzC(q),l=sortedAlumnos().filter(([,x])=>x&&String(x.nombre||"").includes(n));
    let aid=l.length===1?l[0][0]:null;
    if(l.length>1){const ex=l.find(([,x])=>x.nombre===n);if(ex)aid=ex[0];else{const op=l.slice(0,9).map(([,x],i)=>`${i+1}. ${titulo(x.nombre)}`).join("\n"),k=+prompt(`Hay varios. Escribe el número:\n${op}`);if(k>=1&&k<=Math.min(9,l.length))aid=l[k-1][0]}}
    if(!aid){toast(l.length?"No se ha elegido ninguno":"No hay ningún alumno con ese nombre");return}
    const al=S.alumnos.get(aid),grupo=EV.docs.filter(x=>x.id===e.id||(e.tipo==="evaluacion"&&(x.grupo||x.id)===(e.grupo||e.id)));
    for(const x of grupo)await evActualizar(x.id,{alumno:aid,nombre:al.nombre},"");
    /* si ya tenía un recibo HX sin pagar en la ficha anterior, se pasa a la nueva */
    const old=e.alumno&&e.alumno!==aid&&S.alumnos.get(e.alumno),num=e.cobro&&e.cobro.recibo;
    if(old&&num){const r=(old.recibos||[]).find(r=>r&&r.numero===num&&r.estado!=="pagado");if(r){const ro=(old.recibos||[]).filter(x=>x!==r),rn=[...(al.recibos||[]),r];
      if(await save(e.alumno,{recibos:ro})&&await save(aid,{recibos:rn})){old.recibos=ro;al.recibos=rn}}}
    toast(`Cita enlazada con ${titulo(al.nombre)}`);evAutoT=0;try{evAuto()}catch(_){}}
  else if(a==="terminar")await evTerminar(id);
  else if(a==="anot"){const v=String(($("#ev-anot")||{}).value||"").trim().slice(0,2000);await evGuardarAnot(id,v)}
  else if(a==="argos"&&evCentro()){const e=evDe(id);if(e&&e.cobro)await evActualizar(id,{cobro:{...e.cobro,estado:"argos",rt:nowISO(),rpor:quienSoy()}},"Apuntado: recibo hecho en Argos")}
  else if(a==="recibo"){t.disabled=true;await evRecibo(id);t.disabled=false}},true);
document.head.insertAdjacentHTML("beforeend",`<style>.week .nm.evc{border-left:3px solid var(--pc,#888);padding-left:4px;cursor:pointer;background:color-mix(in srgb,var(--pc,#888) 10%,transparent);border-radius:3px;margin:1px 0}
.week .nm.evc:hover{background:color-mix(in srgb,var(--pc,#888) 20%,transparent)}</style>`);
/* Recibo creado en la app (desde 2027): usa el contador de albaranes; lo usan la preinscripción por enlace (03/11/2026). */
async function crearReciboApp(aid,concepto,importe,extra){const a=S.alumnos.get(aid);if(!a)return null;
  const C=contadores().alb,y=+todayISO().slice(0,4);let max=0;for(const [,x] of S.alumnos)for(const r of x.recibos||[])if(r&&r.origen==="app"&&+r.anio===y)max=Math.max(max,+r.num||0);
  const num=Math.max(max+1,+C.ini||1),r={id:uid(),numero:fmtContador(C,num,y),num,anio:y,emitido:todayISO(),concepto,importe:Math.round(+importe*100)/100,estado:"pendiente",pagado:"",forma:"",origen:"app",...(extra||{})};
  const recibos=[...(a.recibos||[]),r];if(!await save(aid,{recibos}))return null;a.recibos=recibos;return r}

/* ============================================================================================
   Actualizar el cuadre con Argos con el «Listado de cursos» de Argos en PDF (08/11/2026). Por cada curso: código, nombre,
   importe facturable (tipo de cobro y cuota) y «Altas en curso» (alta, baja, activa Sí/No, apellidos y nombre). Las filas
   siguen en las páginas siguientes sin cabecera. Cada alta se casa con un alumno de la app por su nombre (sin espacios,
   en cualquier orden de nombre y apellidos). Se actualiza alumnos.argos ("activo" si tiene alguna alta activa; "baja" si solo
   tiene altas cerradas o ya no aparece) y alumnos.matriculas (solo las activas), y config/argos {importado, cursos}.
   ============================================================================================ */
function leerCursosArgos(pags){const out=[];let cur=null,modo="",esperaNom=false;
  for(const l0 of pags.flat()){const l=arreglaArgos(l0);if(!l)continue;let m;
    if((m=l.match(/^C[oó]digo\s+(\S+)(?:\s+Nombre)?/))){cur={codigo:m[1],nombre:"",cobro:"",cuota:null,altas:[]};out.push(cur);modo="";esperaNom=true;continue}
    if(!cur)continue;
    if(esperaNom){if(!/^(F\.|Capac|Datos)/.test(l)){cur.nombre=l;esperaNom=false;continue}esperaNom=false}
    if(/^Importes facturables/i.test(l)){modo="imp";continue}
    if(/^Altas en curso/i.test(l)){modo="altas";continue}
    if(/^Cantidad\s+\d+/i.test(l)){modo="";continue}
    if(modo==="imp"&&cur.cuota==null&&(m=l.match(/^(.*?)\s+([A-ZÁÉÍÓÚÑ]+)\s+(\d+,\d\d)\s+(-?[\d.]+,\d\d)$/))){cur.cobro=m[2];cur.cuota=vtNum(m[4]);continue}
    if((m=l.match(/^(\d\d\/\d\d\/\d{4})\s+(?:(\d\d\/\d\d\/\d{4})\s+)?(S[ií]|No)\s+(.+)$/))){{const baja=m[2]?isoES(m[2]):"";/* con fecha de baja de hoy o anterior cuenta como baja, aunque Argos aún diga «Sí» */cur.altas.push({alta:isoES(m[1]),baja,activa:/^S/.test(m[3])&&!(baja&&baja<=todayISO()),nom:m[4]})}}}
  return out}
/* nombre de Argos («APELLIDOS NOMBRE», a veces con espacios de más) → alumno de la app (nombre en cualquier orden) */
function mapaNombres(){const m=new Map(),al=(S.argos&&S.argos.alias)||{};for(const [k,id] of Object.entries(al))if(S.alumnos.has(id))m.set(k,[id]);
  for(const [id,a] of S.alumnos){const w=String(a.nombre||"").trim().split(/\s+/).filter(Boolean);for(let k=0;k<w.length;k++){const key=sinEsp([...w.slice(k),...w.slice(0,k)].join(""));const l=m.get(key)||[];if(!l.includes(id))l.push(id);m.set(key,l)}}
  return m}
async function actualizarDesdeCursos(file){setStatus("Leyendo el listado…");
  try{const C=leerCursosArgos(await pdfLineas(file));if(!C.length||!C.some(c=>c.altas.length)){toast("No parece el listado de cursos de Argos");setStatus("");return}
    const M=mapaNombres(),por=new Map(),sinFicha=new Map();
    for(const c of C)for(const x of c.altas){const ids=M.get(sinEsp(x.nom))||[];
      if(ids.length!==1){if(x.activa&&!((S.argos&&S.argos.ign)||[]).includes(sinEsp(x.nom)))sinFicha.set(sinEsp(x.nom),{nom:x.nom,curso:c.nombre});continue}
      const o=por.get(ids[0])||{act:[],todas:0};o.todas++;if(x.activa)o.act.push({codigo:c.codigo,curso:c.nombre,cuota:c.cuota,cobro:c.cobro||"",alta:x.alta});por.set(ids[0],o)}
    const cambios=[];let aBaja=0,aActivo=0;
    for(const [id,a] of S.alumnos){const o=por.get(id);let argos,mat;
      if(o){argos=o.act.length?"activo":"baja";mat=o.act}else if(a.argos==="activo"){argos="baja";mat=[]}else continue;
      const igual=a.argos===argos&&JSON.stringify((a.matriculas||[]).map(m=>[m.curso,m.cuota]).sort())===JSON.stringify(mat.map(m=>[m.curso,m.cuota]).sort());
      if(igual)continue;if(a.argos==="activo"&&argos==="baja")aBaja++;if(a.argos!=="activo"&&argos==="activo")aActivo++;cambios.push([id,{argos,matriculas:mat}])}
    const cursos=C.map(c=>({codigo:c.codigo,nombre:c.nombre,cuota:c.cuota,cobro:c.cobro,activos:c.altas.filter(x=>x.activa).length,total:c.altas.length}));
    setStatus("");
    /* confirmación dentro de la página (el navegador puede tener bloqueadas las ventanas de confirmación) */
    S.arPend={n:C.length,act:cursos.reduce((s,c)=>s+c.activos,0),cambios,aBaja,aActivo,cursos,sinFicha:[...sinFicha.values()],
      bajas:cambios.filter(([id,p])=>p.argos==="baja"&&(S.alumnos.get(id)||{}).argos==="activo").map(([id])=>(S.alumnos.get(id)||{}).nombre||"")};render();
  }catch(e){console.error(e);setStatus("Sin guardar");toast("No se ha podido leer el listado de cursos.")}}
async function aplicarCursosArgos(){const P=S.arPend;if(!P)return;const {cambios,cursos}=P,sf=P.sinFicha.slice(0,300);
  try{setStatus("Guardando…");let ko=0;
    await enTandas(cambios.map(([id,p])=>async()=>{if(!(await save(id,p)))ko++}),6);
    await S.db.doc("config/argos").set({...(S.argos||{}),importado:todayISO(),cursos,sinFicha:sf});
    S.argos={...(S.argos||{}),importado:todayISO(),cursos,sinFicha:sf};S.arPend=null;
    setStatus(ko?"Sin guardar":"Guardado");render();toast(ko?`${ko} alumnos sin guardar: vuelve a subirlo`:`Cuadre con Argos actualizado: ${cambios.length} alumnos cambiados`)}
  catch(e){console.error(e);setStatus("Sin guardar");toast("No se ha podido guardar. Inténtalo de nuevo.")}}
function vArPend(){const P=S.arPend;if(!P)return "";
  return `<div class="aviso info" style="display:block;margin-bottom:12px"><b>Listado de cursos de Argos leído:</b> ${P.n} cursos · ${P.act} altas activas.<br>
    Se actualizan <b>${P.cambios.length} alumnos</b>: ${P.aBaja} pasan a baja en Argos${P.bajas.length?` (${P.bajas.map(esc).join(", ")})`:""} y ${P.aActivo} pasan a activos.${P.sinFicha.length?` ${P.sinFicha.length} altas activas no tienen ficha en la app.`:""}
    <div class="petbtns" style="margin-top:8px"><button class="btn small primary" data-act="arok">Actualizar</button><button class="btn small" data-act="arno">Cancelar</button></div></div>`}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-act]");if(!t||S.role!=="dir"||S.pv)return;
  if(t.dataset.act==="arok"){t.disabled=true;aplicarCursosArgos()}else if(t.dataset.act==="arno"){S.arPend=null;render()}});
document.addEventListener("toggle",e=>{if(e.target&&e.target.id==="ar-sin")S.arSinOpen=e.target.open},true);
document.addEventListener("change",e=>{const t=e.target;if(t&&t.id==="ar-cursos"){const f=t.files&&t.files[0];t.value="";if(f&&S.role==="dir"&&!S.pv)actualizarDesdeCursos(f)}});

/* ============================================================================================
   Alumnos de clases sueltas (08/11/2026): sin horario fijo; reservan una hora cuando la necesitan y la pagan al terminar
   (p. ej. universitarios, hora individual de Bachillerato). alumnos.sueltas = {profes:[…], precio}.
   - Las profesoras marcadas lo ven en su lista (dirección añade su nombre a «profes») y le apuntan cada clase desde su ficha:
     «Añadir una clase o una hora extra» → «Hora extra (solo un día)».
   - Cada clase apuntada genera su recibo al momento (también antes del 1/1/2027), con el precio por clase de aquí o, si no
     hay, la tarifa de hora individual de su nivel. Se cobra en Caja o Recibos.
   - No salen en «Activos en Argos sin horario».
   ============================================================================================ */
function vSueltas(id,a){const s=a.sueltas||null,ps=(s&&s.profes)||[];
  return `<div class="addbox" style="margin-top:10px"><label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" data-sue="on" data-id="${esc(id)}" ${s?"checked":""}> Clases sueltas (sin horario fijo)</label>
    <p class="note" style="margin:2px 0 6px">Para alumnos que reservan una hora cuando la necesitan y la pagan al terminar. Las profesoras marcadas lo ven en su lista y le apuntan cada clase desde su ficha («Añadir una clase o una hora extra» → «Hora extra (solo un día)»). Cada clase apuntada crea su recibo al momento.</p>
    ${s?`<div class="r2" style="align-items:flex-end;gap:10px;flex-wrap:wrap"><div><span class="note">Profesoras que le dan clase</span><div class="chips" style="margin-top:4px">${EQUIPO.map(p=>`<button class="chip" data-sue="profe" data-id="${esc(id)}" data-p="${esc(p)}" aria-pressed="${ps.includes(p)}">${esc(p)}</button>`).join("")}</div></div>
      <label class="f" style="flex:0 1 160px">Precio por clase (€)<input type="text" inputmode="decimal" data-sue="precio" data-id="${esc(id)}" value="${s.precio!=null?String(s.precio).replace(".",","):""}" placeholder="Tarifa de su nivel"></label></div>
      ${ps.length?"":`<p class="note" style="color:var(--warn);margin:6px 0 0">Marca al menos una profesora para que pueda apuntarle las clases.</p>`}`:""}</div>`}
async function guardarSueltas(id,s){const a=S.alumnos.get(id);if(!a)return;if(await save(id,{sueltas:s})){a.sueltas=s;render();toast(s?"Guardado":"Ya no es de clases sueltas")}}
document.addEventListener("change",e=>{const t=e.target;if(!t||!t.dataset||!t.dataset.sue||S.role!=="dir"||S.pv)return;const id=t.dataset.id,a=S.alumnos.get(id);if(!a)return;
  if(t.dataset.sue==="on")guardarSueltas(id,t.checked?{profes:[],precio:null}:null);
  else if(t.dataset.sue==="precio"){const v=String(t.value).trim(),n=v?+v.replace(/\s|€/g,"").replace(",","."):null;if(v&&(isNaN(n)||n<0)){toast("El precio no es un número");return}guardarSueltas(id,{...(a.sueltas||{profes:[]}),precio:n})}});
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest('[data-sue="profe"]');if(!t||S.role!=="dir"||S.pv)return;const id=t.dataset.id,a=S.alumnos.get(id);if(!a||!a.sueltas)return;
  const ps=new Set(a.sueltas.profes||[]);ps.has(t.dataset.p)?ps.delete(t.dataset.p):ps.add(t.dataset.p);guardarSueltas(id,{...a.sueltas,profes:[...ps]})});

/* Altas activas en Argos sin ficha en la app (08/11/2026): por cada una, «Es …» (la casa con un alumno que ya existe con el nombre
   escrito distinto), «Dar de alta» (crea la ficha) o «No hace falta» (se ignora en adelante). config/argos.alias {clave: id}, .ign [clave]. */
function candidatosArgos(nom){const ws=String(nom).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().split(/[^A-Z]+/).filter(w=>w.length>=3),out=[];
  for(const [id,a] of S.alumnos){const T=sinEsp(a.nombre),n=ws.filter(w=>T.includes(w)).length;if(n>=2&&n>=ws.length-1)out.push([id,a,n])}
  return out.sort((x,y)=>y[2]-x[2]).slice(0,3)}
function vArSinFicha(){const l=(S.argos&&S.argos.sinFicha)||[];if(!l.length)return "";
  return `<details id="ar-sin" ${S.arSinOpen?"open":""} class="panel" style="padding:10px 12px;margin-bottom:12px"><summary><b>${l.length} altas activas en Argos sin ficha en la app</b> <span class="note">· di si es un alumno que ya está con el nombre escrito distinto, dalo de alta o márcalo como que no hace falta</span></summary>
    ${l.map(x=>{const k=sinEsp(x.nom),cs=candidatosArgos(x.nom);return `<div class="row" style="flex-wrap:wrap;gap:6px;padding:6px 0"><span class="grow"><b>${esc(x.nom)}</b> <span class="note">· ${esc(x.curso)}</span></span>
      ${cs.map(([id,a])=>`<button class="btn small" data-act="arlink" data-k="${esc(k)}" data-id="${esc(id)}" title="Es este alumno, con el nombre escrito distinto">Es ${esc(titulo(a.nombre))}</button>`).join("")}
      ${S.arNew===k?`<input type="text" id="ar-nnom" value="${esc(titulo(String(x.nom).toLowerCase()))}" style="min-width:220px" aria-label="Nombre y apellidos"><button class="btn small primary" data-act="arcrear" data-k="${esc(k)}">Crear la ficha</button>`:`<button class="btn small" data-act="arnew" data-k="${esc(k)}">Dar de alta en la app</button>`}
      <button class="btn small" data-act="arign" data-k="${esc(k)}" title="Por ejemplo, consultas sueltas que no necesitan ficha">No hace falta</button></div>`}).join("")}</details>`}
async function arResolver(k,id){const A=S.argos||{},x=(A.sinFicha||[]).find(y=>sinEsp(y.nom)===k);
  const cfg={...A,sinFicha:(A.sinFicha||[]).filter(y=>sinEsp(y.nom)!==k)};
  if(id){cfg.alias={...(A.alias||{}),[k]:id};const a=S.alumnos.get(id),c=x&&(A.cursos||[]).find(z=>z.nombre===x.curso);
    if(a&&c&&!(a.matriculas||[]).some(m=>m.curso===c.nombre))await save(id,{argos:"activo",matriculas:[...(a.argos==="activo"?a.matriculas||[]:[]),{codigo:c.codigo,curso:c.nombre,cuota:c.cuota,cobro:c.cobro||"",alta:todayISO()}]})}
  else cfg.ign=[...new Set([...(A.ign||[]),k])];
  try{await S.db.doc("config/argos").set(cfg);S.argos=cfg;S.arNew=null;render();toast(id?"Hecho":"No volverá a salir")}catch(_){toast("No se ha podido guardar.")}}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-act]");if(!t||S.role!=="dir"||S.pv)return;const act=t.dataset.act,k=t.dataset.k;
  if(act==="arlink"){t.disabled=true;await arResolver(k,t.dataset.id)}
  else if(act==="arign"){t.disabled=true;await arResolver(k,null)}
  else if(act==="arnew"){S.arNew=k;render();const i=$("#ar-nnom");if(i)i.focus()}
  else if(act==="arcrear"){const n=($("#ar-nnom")||{}).value||"";if(String(n).trim().split(/\s+/).length<2){toast("Escribe nombre y apellidos");return}t.disabled=true;
    const id=await crearAlumno(n);if(id)await arResolver(k,id);else t.disabled=false}});

/* ============================================================================================
   REGISTRO DE JORNADA · FICHAJES (08/11/2026)
   Cumple el registro diario de jornada (art. 34.9 ET, RDL 8/2019) y prepara el registro digital que está en tramitación:
   hora del servidor, inalterable (solo se crean documentos), correcciones con motivo y trazabilidad, consulta por la
   trabajadora, dirección y la asesoría, PDF mensual por trabajadora y Excel. La titular (EV_PROFE) es autónoma: no ficha.
   - Profesora: barra arriba con «Fichar entrada/salida» y recordatorios según su horario; pestaña «Mis fichajes» (mes, PDF,
     pedir una corrección, PIN para el mostrador).
   - Mostrador (recepción) y dirección: pestaña «Fichajes» → botones por profesora + PIN (hash en fichPin/<profe>).
   - Dirección: quién está dentro, incidencias (sin salida), solicitudes de corrección (aprobar = ajuste, rechazar), ajustes
     manuales y anulación de un fichaje erróneo (siempre con motivo), mes por profesora frente a su horario, PDF y Excel.
   ============================================================================================ */
/* El fichaje en la app empieza el 1/1/2027 (decisión de la titular, 08/11/2026). Hasta entonces se sigue fichando en Argos:
   no sale la barra ni se puede fichar; las profesoras ya pueden poner su PIN. */
const FICH_DESDE="2027-01-01";const fichActivo=()=>todayISO()>=FICH_DESDE;
const FC={docs:[],sub:null,ok:false,err:false,pines:{},pinSub:null,mes:"",profe:"",kio:null,sol:null,aj:null};
const FICH_PROFES=()=>EQUIPO.filter(p=>p!==EV_PROFE);
const hoyMes=()=>todayISO().slice(0,7);
function fcEscuchar(){if(FC.sub||!window.__fich)return;const d=sumaDias(hoyMes()+"-01",-70).slice(0,8)+"01";
  FC.sub=window.__fich.escuchar(d,l=>{FC.docs=l;FC.ok=true;FC.err=false;if(["fichajes","misfich"].includes(S.view)||S.role==="profe"||S.role==="ase")(S.role==="ase"?vAsePintar():render())},()=>{FC.ok=true;FC.err=true;render()});
  if(S.role==="dir"&&!FC.pinSub)FC.pinSub=window.__fich.pines(o=>{FC.pines=o},()=>{})}
const hhmmDe=iso=>{const d=new Date(iso);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0")};
const mH=m=>m==null?"—":`${Math.floor(m/60)} h ${String(Math.round(m%60)).padStart(2,"0")} min`;
/* eventos válidos de una profesora un día: fichajes no anulados + ajustes aprobados (entrada/salida a una hora) */
/* el día de un fichaje real sale de su hora de servidor (no del campo dia que manda el móvil) */
const diaLocal=iso=>{const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`};
function fcEventos(p,dia){const D=FC.docs.filter(x=>x.profe===p&&((x.tipo==="entrada"||x.tipo==="salida")?diaLocal(x.t)===dia:x.dia===dia)),anul=new Set(D.filter(x=>x.tipo==="ajuste"&&x.accion==="anular").map(x=>x.ref));
  const ev=[];for(const x of D){if((x.tipo==="entrada"||x.tipo==="salida")&&!anul.has(x.id))ev.push({id:x.id,acc:x.tipo,h:hhmmDe(x.t),por:x.por,aj:false});
    else if(x.tipo==="ajuste"&&(x.accion==="entrada"||x.accion==="salida"))ev.push({id:x.id,acc:x.accion,h:x.hora,por:"ajuste",aj:true,motivo:x.motivo})}
  return ev.sort((a,b)=>a.h.localeCompare(b.h)||(a.acc==="entrada"?-1:1))}
function fcTramos(p,dia){const ev=fcEventos(p,dia),tr=[];let ab=null;
  for(const e of ev){if(e.acc==="entrada"){if(ab)tr.push({ini:ab,fin:null});ab=e}else{tr.push({ini:ab,fin:e});ab=null}}if(ab)tr.push({ini:ab,fin:null});
  const min=tr.reduce((s,t)=>s+(t.ini&&t.fin?Math.max(0,minDe(t.fin.h)-minDe(t.ini.h)):0),0);
  return {tr,min,mal:tr.some(t=>!t.ini||!t.fin),aj:ev.some(e=>e.aj)}}
const fcDentro=p=>{const ev=fcEventos(p,todayISO()),u=ev[ev.length-1];return u&&u.acc==="entrada"?u:null};
const fcPrevisto=(p,dia)=>{if(festivoDe(dia))return 0;const d=diaDe(dia);if(!DIAS.includes(d))return 0;return (typeof tramosContrato==="function"?tramosContrato:tramosDe)(p,d).reduce((s,[a,b])=>s+(b-a),0)};
const diasMes=mes=>{const o=[];for(let d=mes+"-01";d.startsWith(mes);d=sumaDias(d,1))o.push(d);return o};
const fcSolPend=()=>FC.docs.filter(x=>x.tipo==="solicitud"&&!FC.docs.some(y=>(y.tipo==="ajuste"||y.tipo==="rechazo")&&y.ref===x.id));
function fcIncid(){const out=[],hoy=todayISO();for(const p of FICH_PROFES())for(const d of [...new Set(FC.docs.filter(x=>x.profe===p).map(x=>(x.tipo==="entrada"||x.tipo==="salida")?diaLocal(x.t):x.dia).filter(d=>d<hoy))].sort()){const T=fcTramos(p,d);if(T.mal)out.push({p,d,T})}return out}
async function fcCrear(o,msg){try{await window.__fich.crear(o);toast(msg||"Hecho")}catch(e){console.error(e);toast("No se ha podido guardar. Comprueba la conexión.")}}
/* ---- profesora ---- */
function vFichBar(){if(!fichActivo()||S.role!=="profe"||S.pv||!S.myProfe||S.myProfe===EV_PROFE)return "";fcEscuchar();if(!FC.ok)return "";
  const p=S.myProfe,dn=fcDentro(p),ahora=new Date(),min=ahora.getHours()*60+ahora.getMinutes(),tr=tramosDe(p,diaDe(todayISO()));
  const toca=!festivoDe(todayISO())&&tr.some(([a,b])=>min>=a-10&&min<b),acabo=tr.length&&min>Math.max(...tr.map(t=>t[1]))+20;
  const aviso=!dn&&toca?`Tu horario de hoy ya ha empezado y no has fichado la entrada.`:dn&&acabo?`Tu horario de hoy ya ha terminado: ¿has olvidado fichar la salida?`:"";
  return `<div class="aviso ${aviso?"pend":"info"} noprint" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px"><span class="grow">${dn?`<b>Has fichado la entrada a las ${dn.h}.</b>`:`<b>No estás fichada.</b>`} ${aviso?`<br>${aviso}`:""}</span>
    <button class="btn ${dn?"":"primary"}" data-act="fichyo" data-acc="${dn?"salida":"entrada"}" style="font-size:16px;padding:10px 18px">${dn?"Fichar la salida":"Fichar la entrada"}</button></div>`}
/* primer día con fichajes en la app: antes de él no se marcan días «sin fichajes» */
const fcInicio=()=>{let m="9999";for(const x of FC.docs)if(x.tipo==="entrada"||x.tipo==="salida"){const d=diaLocal(x.t);if(d<m)m=d}return m};
function vTablaMes(p,mes,acciones){const ini=fcInicio(),hoy=todayISO();const filas=diasMes(mes).map(d=>{const T=fcTramos(p,d),pr=fcPrevisto(p,d);if(!T.tr.length&&(!pr||d>hoy||d<ini))return "";
  return `<tr><td style="white-space:nowrap">${fmtFecha(d)} <span class="note">${diaDe(d).slice(0,3)}</span></td><td>${T.tr.map(t=>`${t.ini?t.ini.h+(t.ini.aj?"*":""):"<b style='color:var(--bad)'>¿?</b>"} – ${t.fin?t.fin.h+(t.fin.aj?"*":""):"<b style='color:var(--bad)'>sin salida</b>"}`).join(" · ")||`<span class="note">sin fichajes</span>`}</td>
    <td style="text-align:right">${T.tr.length?mH(T.min):"—"}</td><td style="text-align:right" class="note">${pr?mH(pr):"—"}</td>${acciones?`<td>${acciones(d,T)}</td>`:""}</tr>`}).join("");
  const tot=diasMes(mes).reduce((s,d)=>s+fcTramos(p,d).min,0),prv=diasMes(mes).filter(d=>d<=todayISO()&&d>=fcInicio()).reduce((s,d)=>s+fcPrevisto(p,d),0);
  return `<div class="panel tbl"><table class="ft" style="min-width:0;width:100%;font-size:14px"><thead><tr><th>Día</th><th>Entradas y salidas</th><th style="text-align:right">Fichado</th><th style="text-align:right">Según horario</th>${acciones?"<th></th>":""}</tr></thead><tbody>${filas||`<tr><td colspan="5" class="note">Sin fichajes este mes.</td></tr>`}
    <tr style="font-weight:700"><td>Total</td><td></td><td style="text-align:right">${mH(tot)}</td><td style="text-align:right">${mH(prv)} <span class="note">hasta hoy</span></td>${acciones?"<td></td>":""}</tr></tbody></table></div>
    <p class="note">* corregido por dirección. «Según horario» es su horario fijo de la app, como referencia.</p>`}
const mesesOpc=sel=>{const o=[];for(let i=0;i<13;i++){const m=sumaDias(hoyMes()+"-15",-30.44*i).slice(0,7);o.push(m)}return [...new Set(o)].map(m=>`<option value="${m}" ${m===sel?"selected":""}>${esc(mesTxt(m))}</option>`).join("")};
function vMisFichajes(){return (typeof vMiFotoProf==="function"?vMiFotoProf():"")+vMisFichajes0()}
function vMisFichajes0(){fcEscuchar();const p=S.myProfe;
  if(!fichActivo())return `<div class="bar"><h2>Mis fichajes</h2></div><div class="aviso info" style="display:block">El fichaje en la app empieza el <b>${fmtFecha(FICH_DESDE)}</b>. Hasta entonces seguimos fichando en Argos.</div>
    <div class="panel" style="padding:10px 12px;margin-top:10px"><b>Pon ya tu PIN para fichar en el ordenador del mostrador</b><p class="note">Te servirá si algún día no llevas el móvil (4 a 6 cifras). Nadie más lo ve.</p>
    <div class="r2" style="align-items:flex-end"><label class="f">PIN nuevo<input type="password" id="fp-pin" inputmode="numeric" maxlength="6" autocomplete="new-password"></label><button class="btn small primary" data-act="fcpin">Guardar el PIN</button></div></div>`;
  if(!FC.ok)return `<div class="empty">Cargando…</div>`;if(FC.err)return `<div class="empty">No se pueden leer los fichajes. Avisa en el centro.</div>`;
  if(!FC.mes)FC.mes=hoyMes();const sols=FC.docs.filter(x=>x.tipo==="solicitud"&&x.profe===p).slice(-6).reverse();
  return `<div class="bar"><h2>Mis fichajes</h2><span class="legend"><select id="fc-mes">${mesesOpc(FC.mes)}</select> <button class="btn small" data-act="fcpdf" data-p="${esc(p)}">Descargar el mes (PDF)</button></span></div>
  ${vTablaMes(p,FC.mes)}
  <details class="panel" style="padding:10px 12px;margin-top:12px"><summary><b>¿Te olvidaste de fichar o te equivocaste? Pide una corrección</b></summary>
    <div class="r2" style="align-items:flex-end;margin-top:8px"><label class="f">Día<input type="date" id="fs-dia" max="${todayISO()}" value="${todayISO()}"></label><label class="f">Qué<select id="fs-acc"><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label><label class="f">Hora real<input type="time" id="fs-hora"></label></div>
    <label class="f">Motivo<input type="text" id="fs-mot" maxlength="200" placeholder="Por ejemplo: olvidé fichar la salida"></label>
    <button class="btn primary small" data-act="fcsol">Enviar a dirección</button>
    ${sols.length?`<div style="margin-top:8px">${sols.map(x=>{const r=FC.docs.find(y=>(y.tipo==="ajuste"||y.tipo==="rechazo")&&y.ref===x.id);return `<div class="note">${fmtFecha(x.dia)} · ${x.accion} ${x.hora} · ${esc(x.motivo)} · <b>${r?(r.tipo==="ajuste"?"aprobada":"rechazada"+(r.motivo?": "+esc(r.motivo):"")):"pendiente"}</b></div>`}).join("")}</div>`:""}</details>
  <details class="panel" style="padding:10px 12px;margin-top:10px"><summary><b>PIN para fichar en el ordenador del mostrador</b></summary>
    <p class="note">Si no llevas el móvil, puedes fichar en el ordenador de recepción con tu nombre y este PIN (4 a 6 cifras). Nadie más lo ve.</p>
    <div class="r2" style="align-items:flex-end"><label class="f">PIN nuevo<input type="password" id="fp-pin" inputmode="numeric" maxlength="6" autocomplete="new-password"></label><button class="btn small primary" data-act="fcpin">Guardar el PIN</button></div></details>
  <p class="note">Tus fichajes se guardan con la hora del servidor y no se pueden borrar ni cambiar: si hay un error, se corrige con una solicitud y queda anotado. Los puedes consultar siempre aquí.</p>`}
/* ---- mostrador y dirección ---- */
function vKiosko(){const ps=FICH_PROFES();
  return `<div class="panel" style="padding:12px 14px"><b>Fichar en el mostrador</b> <span class="note">· la profesora pulsa su nombre y escribe su PIN</span>
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">${ps.map(p=>{const dn=fcDentro(p);return `<button class="btn ${FC.kio===p?"primary":""}" data-act="fckio" data-p="${esc(p)}" style="min-width:140px;padding:12px 14px;text-align:left"><b>${esc(p)}</b><br><span class="note" style="${FC.kio===p?"color:inherit":""}">${dn?`dentro desde las ${dn.h}`:"fuera"}</span></button>`}).join("")}</div>
    ${FC.kio?(()=>{const dn=fcDentro(FC.kio);return `<div class="r2" style="align-items:flex-end;margin-top:10px"><label class="f">PIN de ${esc(FC.kio)}<input type="password" id="fk-pin" inputmode="numeric" maxlength="6" autocomplete="off"></label>
      <button class="btn primary" data-act="fckiook" data-acc="${dn?"salida":"entrada"}">${dn?"Fichar la salida":"Fichar la entrada"}</button><button class="btn" data-act="fckiono">Cancelar</button></div>
      ${FC.pines[FC.kio]?"":`<p class="note" style="color:var(--warn)">${esc(FC.kio)} aún no tiene PIN: lo pone en su app, en «Mis fichajes».</p>`}`})():""}</div>`}
function vFichajes(){fcEscuchar();if(!FC.ok)return `<div class="empty">Cargando…</div>`;if(FC.err)return `<div class="empty">No se pueden leer los fichajes: publica las reglas nuevas de Firebase.</div>`;
  if(!fichActivo()){const ps=FICH_PROFES();return `<div class="bar"><h2>Fichajes</h2></div>${vHorasExtraProfes()}<div class="aviso info" style="display:block">El fichaje en la app empieza el <b>${fmtFecha(FICH_DESDE)}</b>. Hasta entonces se sigue fichando en Argos. Mientras, cada profesora puede poner su PIN para el mostrador en «Mis fichajes».</div>
    ${esMos()?"":`<p class="note">PIN puesto: ${ps.map(p=>`${esc(p)} ${FC.pines[p]?"✓":"—"}`).join(" · ")}</p>`}`}
  if(esMos())return `<div class="bar"><h2>Fichar</h2></div>${vKiosko()}`;
  const ps=FICH_PROFES();if(!FC.profe||!ps.includes(FC.profe))FC.profe=ps[0];if(!FC.mes)FC.mes=hoyMes();
  const sols=fcSolPend(),inc=fcIncid();
  const accDir=(d,T)=>`<button class="btn small" data-act="fcaj" data-d="${d}" title="Añadir una entrada o salida con su motivo">Corregir</button>`;
  return `<div class="bar"><h2>Fichajes</h2><span class="legend">Registro de jornada de las profesoras</span></div>${vHorasExtraProfes()}
  <div class="stats">${ps.map(p=>{const dn=fcDentro(p);return `<div class="stat static"><b style="font-size:18px;color:var(${dn?"--ok":"--muted"})">${dn?"Dentro":"Fuera"}</b><span>${esc(p)}${dn?` · desde las ${dn.h}${dn.por==="mostrador"?" (mostrador)":""}`:""}</span></div>`}).join("")}</div>
  ${sols.length?`<div class="aviso pend" style="display:block;margin:10px 0"><b>${sols.length} solicitud${sols.length===1?"":"es"} de corrección</b>${sols.map(x=>`<div class="row" style="gap:6px;flex-wrap:wrap;padding:6px 0;border:0"><span class="grow">${esc(x.profe)} · ${fmtFecha(x.dia)} · ${x.accion} a las <b>${esc(x.hora)}</b> · «${esc(x.motivo)}»</span><button class="btn small primary" data-act="fcsolok" data-id="${x.id}">Aprobar</button><button class="btn small" data-act="fcsolno" data-id="${x.id}">Rechazar</button></div>`).join("")}</div>`:""}
  ${inc.length?`<div class="aviso pend" style="display:block;margin:10px 0"><b>${inc.length} día${inc.length===1?"":"s"} con un fichaje sin pareja</b> (entrada sin salida o al revés)${inc.slice(-10).map(x=>`<div class="note">${esc(x.p)} · ${fmtFecha(x.d)} · ${x.T.tr.map(t=>`${t.ini?t.ini.h:"¿?"}–${t.fin?t.fin.h:"¿?"}`).join(", ")} <a href="#" data-act="fcir" data-p="${esc(x.p)}" data-d="${x.d}">corregir</a></div>`).join("")}</div>`:""}
  <details style="margin:10px 0"><summary><b>Fichar en el mostrador</b></summary>${vKiosko()}</details>
  <div class="bar" style="gap:8px;flex-wrap:wrap;margin-top:12px"><label class="f" style="flex:0 1 160px">Profesora<select id="fc-pr">${ps.map(p=>`<option ${p===FC.profe?"selected":""}>${esc(p)}</option>`).join("")}</select></label>
    <label class="f" style="flex:0 1 180px">Mes<select id="fc-mes">${mesesOpc(FC.mes)}</select></label>
    <span class="legend"><button class="btn small" data-act="fcpdf" data-p="${esc(FC.profe)}">PDF del mes</button> <button class="btn small" data-act="fcxls">Excel del mes (todas)</button></span></div>
  ${FC.aj?vAjuste():""}
  ${vTablaMes(FC.profe,FC.mes,accDir)}
  ${vAnulables()}`}
function vAjuste(){const A=FC.aj;
  return `<div class="addbox" style="margin:8px 0"><b>Corregir el ${fmtFecha(A.d)} de ${esc(FC.profe)}</b>
    <div class="r2" style="align-items:flex-end"><label class="f">Añadir<select id="fa-acc"><option value="entrada">Entrada</option><option value="salida">Salida</option></select></label><label class="f">Hora<input type="time" id="fa-hora"></label><label class="f" style="flex:2 1 220px">Motivo<input type="text" id="fa-mot" maxlength="200" placeholder="Obligatorio"></label></div>
    <div class="petbtns"><button class="btn small primary" data-act="fcajok">Guardar la corrección</button><button class="btn small" data-act="fcajno">Cancelar</button></div>
    <p class="note">Queda anotado quién lo corrige, cuándo y por qué. Para quitar un fichaje erróneo, usa «Anular» en la lista de abajo.</p></div>`}
function vAnulables(){const l=FC.docs.filter(x=>x.profe===FC.profe&&x.dia.startsWith(FC.mes)&&(x.tipo==="entrada"||x.tipo==="salida"||(x.tipo==="ajuste"&&x.accion!=="anular")));if(!l.length)return "";
  const anul=new Set(FC.docs.filter(x=>x.tipo==="ajuste"&&x.accion==="anular").map(x=>x.ref));
  return `<details class="panel" style="padding:10px 12px;margin-top:10px"><summary><b>Todos los registros del mes</b> <span class="note">(con quién y cuándo)</span></summary>${l.sort((a,b)=>a.t.localeCompare(b.t)).map(x=>`<div class="row" style="padding:4px 0;border:0;gap:8px"><span class="grow note" style="${anul.has(x.id)?"text-decoration:line-through":""}">${fmtFecha(x.dia)} · ${x.tipo==="ajuste"?`corrección: ${x.accion} ${x.hora} · «${esc(x.motivo||"")}»`:`${x.tipo} ${hhmmDe(x.t)} · ${x.por==="mostrador"?"mostrador":"móvil"}`} · registrado ${fmtFecha(x.t.slice(0,10))} ${hhmmDe(x.t)}</span>${anul.has(x.id)?`<span class="badge b-no">anulado</span>`:`<button class="btn small" data-act="fcanul" data-id="${x.id}">Anular</button>`}</div>`).join("")}</details>`}
/* ---- PDF mensual y Excel ---- */
async function fcPdf(p,mes){try{const W=1240,H=1754,M=100,RED="#b52e33",F="Helvetica, Arial, sans-serif",c=document.createElement("canvas");c.width=W;c.height=H;const g=c.getContext("2d");
  g.fillStyle="#fff";g.fillRect(0,0,W,H);const logo=await cargarImg(LOGO).catch(()=>null);if(logo){const h=100;g.drawImage(logo,M,60,logo.width*h/logo.height,h)}
  g.textAlign="right";g.fillStyle=RED;g.font=`bold 38px ${F}`;g.fillText("REGISTRO DE JORNADA",W-M,100);g.fillStyle="#555";g.font=`22px ${F}`;g.fillText(`${mesTxt(mes)} · ${p}`,W-M,135);g.textAlign="left";
  g.fillStyle="#333";g.font=`20px ${F}`;g.fillText(`Empresa: ${CENTRO.resp} (${CENTRO.nombre}) · NIF 48966357-R · ${CENTRO.dir}`,M,200);
  let y=250;const col=[M,M+230,M+760,M+900];g.fillStyle=RED;g.fillRect(M,y,W-2*M,44);g.fillStyle="#fff";g.font=`bold 20px ${F}`;["Fecha","Entradas y salidas","Horas","Observaciones"].forEach((t,i)=>g.fillText(t,col[i]+10,y+29));y+=44;
  let tot=0;g.font=`19px ${F}`;for(const d of diasMes(mes)){const T=fcTramos(p,d);if(!T.tr.length)continue;tot+=T.min;g.fillStyle="#1d1d1f";
    g.fillText(`${d.slice(8)}/${d.slice(5,7)} ${diaDe(d).slice(0,3)}`,col[0]+10,y+28);g.fillText(T.tr.map(t=>`${t.ini?t.ini.h+(t.ini.aj?"*":""):"¿?"} – ${t.fin?t.fin.h+(t.fin.aj?"*":""):"¿?"}`).join("   "),col[1]+10,y+28);
    g.fillText(mH(T.min),col[2]+10,y+28);g.fillStyle="#666";g.fillText(T.mal?"Falta una entrada o salida":T.aj?"Corregido (*)":"",col[3]+10,y+28);
    g.strokeStyle="#e3e3e8";g.beginPath();g.moveTo(M,y+40);g.lineTo(W-M,y+40);g.stroke();y+=40;if(y>H-330)break}
  g.fillStyle="#1d1d1f";g.font=`bold 22px ${F}`;g.fillText(`Total del mes: ${mH(tot)}`,M+10,y+45);
  g.font=`18px ${F}`;g.fillStyle="#555";envolver(g,"* Corrección hecha por dirección con su motivo, conservando el registro original. Registro llevado en la app del centro con la hora del servidor; los registros no se pueden modificar ni borrar. Se conserva durante cuatro años (art. 34.9 del Estatuto de los Trabajadores).",M,y+90,W-2*M,26);
  const fy=H-200;g.strokeStyle="#999";g.beginPath();g.moveTo(M,fy);g.lineTo(M+420,fy);g.moveTo(W-M-420,fy);g.lineTo(W-M,fy);g.stroke();g.fillStyle="#333";g.font=`19px ${F}`;g.fillText("La trabajadora",M,fy+30);g.textAlign="right";g.fillText("La empresa",W-M,fy+30);g.textAlign="left";
  g.fillStyle="#777";g.font=`17px ${F}`;g.fillText(`Generado el ${fmtFecha(todayISO())} · ${CENTRO.nombre}`,M,H-60);
  const pdf=pdfDeCanvas([c]),a=document.createElement("a");a.href=URL.createObjectURL(pdf);a.download=`Registro-jornada_${p}_${mes}.pdf`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},5000)}
  catch(e){console.error(e);toast("No se ha podido preparar el PDF")}}
async function fcXls(mes){try{await cargarJs(XLSXJS)}catch(_){toast("No se ha podido cargar el generador de Excel.");return}
  const rows=[["Trabajadora","Fecha","Día","Entrada","Salida","Minutos","Horas","Observaciones"]];
  for(const p of FICH_PROFES())for(const d of diasMes(mes)){const T=fcTramos(p,d);for(const t of T.tr){const m=t.ini&&t.fin?minDe(t.fin.h)-minDe(t.ini.h):null;rows.push([p,d,diaDe(d),t.ini?t.ini.h:"",t.fin?t.fin.h:"",m,m!=null?Math.round(m/60*100)/100:"",[t.ini&&t.ini.aj?"entrada corregida":"",t.fin&&t.fin.aj?"salida corregida":"",(!t.ini||!t.fin)?"falta entrada o salida":""].filter(Boolean).join("; ")])}}
  const X=window.XLSX,wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),"Registro de jornada");X.writeFile(wb,`Registro-jornada_${mes}.xlsx`)}
/* ---- asesoría ---- */
function vFichAse(){if(!fichActivo())return "";fcEscuchar();if(!FC.ok||FC.err)return "";if(!FC.mes)FC.mes=hoyMes();
  return `<div class="panel noprint" style="padding:12px 14px;margin-top:16px"><b>Registro de jornada de las trabajadoras</b>
    <div class="bar" style="gap:8px;flex-wrap:wrap;margin-top:6px"><label class="f" style="flex:0 1 180px">Mes<select id="fc-mes">${mesesOpc(FC.mes)}</select></label>
    <span class="legend">${FICH_PROFES().map(p=>`<button class="btn small" data-act="fcpdf" data-p="${esc(p)}">PDF ${esc(p)}</button>`).join(" ")} <button class="btn small primary" data-act="fcxls">Excel (todas)</button></span></div></div>`}
/* ---- acciones ---- */
document.addEventListener("change",e=>{const t=e.target;if(!t)return;
  if(t.id==="fc-mes"){FC.mes=t.value;S.role==="ase"?vAsePintar():render()}else if(t.id==="fc-pr"){FC.profe=t.value;FC.aj=null;render()}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-act]");if(!t)return;const act=t.dataset.act;if(!/^f(c|ich)/.test(act))return;
  if(act==="fcpdf"){e.preventDefault();await fcPdf(t.dataset.p,FC.mes||hoyMes());return}
  if(act==="fcxls"){await fcXls(FC.mes||hoyMes());return}
  if(!fichActivo()&&act!=="fcpin")return;
  if(act==="fichyo"&&S.role==="profe"&&!S.pv){t.disabled=true;await fcCrear({tipo:t.dataset.acc,profe:S.myProfe,dia:todayISO(),por:"movil"},t.dataset.acc==="entrada"?"Entrada fichada":"Salida fichada");t.disabled=false;return}
  if(act==="fcsol"&&S.role==="profe"){if(S.pv){toast("En la vista previa no se guarda nada");return}const dia=$("#fs-dia").value,hora=$("#fs-hora").value,mot=String($("#fs-mot").value||"").trim();
    if(!dia||!hora||!mot){toast("Pon el día, la hora y el motivo");return}if(dia>todayISO()){toast("El día no puede ser futuro");return}
    t.disabled=true;await fcCrear({tipo:"solicitud",profe:S.myProfe,dia,accion:$("#fs-acc").value,hora,motivo:mot.slice(0,200),por:"movil"},"Enviada a dirección");return}
  if(act==="fcpin"&&S.role==="profe"){if(S.pv){toast("En la vista previa no se guarda nada");return}const pin=String($("#fp-pin").value||"");if(!/^\d{4,6}$/.test(pin)){toast("El PIN tiene que tener de 4 a 6 cifras");return}
    try{await window.__fich.ponerPin(S.myProfe,await sha256(S.myProfe+"|"+pin));$("#fp-pin").value="";toast("PIN guardado")}catch(_){toast("No se ha podido guardar el PIN")}return}
  if(S.role!=="dir"||S.pv)return;
  if(act==="fckio"){FC.kio=FC.kio===t.dataset.p?null:t.dataset.p;render();const i=$("#fk-pin");if(i)i.focus()}
  else if(act==="fckiono"){FC.kio=null;render()}
  else if(act==="fckiook"){const p=FC.kio,pin=String(($("#fk-pin")||{}).value||"");if(!p)return;if(!FC.pines[p]){toast(`${p} aún no tiene PIN`);return}
    if(await sha256(p+"|"+pin)!==FC.pines[p]){toast("PIN incorrecto");return}t.disabled=true;
    await fcCrear({tipo:t.dataset.acc,profe:p,dia:todayISO(),por:"mostrador"},`${p}: ${t.dataset.acc==="entrada"?"entrada":"salida"} fichada`);FC.kio=null;render()}
  else if(esMos())return;
  else if(act==="fcaj"){FC.aj={d:t.dataset.d};render()}
  else if(act==="fcir"){e.preventDefault();FC.profe=t.dataset.p;FC.mes=t.dataset.d.slice(0,7);FC.aj={d:t.dataset.d};render()}
  else if(act==="fcajno"){FC.aj=null;render()}
  else if(act==="fcajok"){const hora=$("#fa-hora").value,mot=String($("#fa-mot").value||"").trim();if(!hora||!mot){toast("Pon la hora y el motivo");return}
    t.disabled=true;await fcCrear({tipo:"ajuste",profe:FC.profe,dia:FC.aj.d,accion:$("#fa-acc").value,hora,motivo:mot.slice(0,200),por:"direccion",quien:quienSoy()},"Corrección guardada");FC.aj=null;render()}
  else if(act==="fcanul"){const x=FC.docs.find(y=>y.id===t.dataset.id);if(!x)return;FC.anul=x;const mot=String(($("#fn-mot-"+x.id)||{}).value||"").trim();
    if(!mot){t.insertAdjacentHTML("beforebegin",`<input type="text" id="fn-mot-${x.id}" placeholder="Motivo de la anulación" maxlength="200" style="min-width:220px">`);t.textContent="Confirmar anulación";return}
    t.disabled=true;await fcCrear({tipo:"ajuste",profe:x.profe,dia:x.dia,accion:"anular",ref:x.id,motivo:mot,por:"direccion",quien:quienSoy()},"Anulado");render()}
  else if(act==="fcsolok"||act==="fcsolno"){const x=FC.docs.find(y=>y.id===t.dataset.id);if(!x)return;t.disabled=true;
    if(act==="fcsolok")await fcCrear({tipo:"ajuste",profe:x.profe,dia:x.dia,accion:x.accion,hora:x.hora,motivo:`Solicitud de ${x.profe}: ${x.motivo}`,ref:x.id,por:"direccion",quien:quienSoy()},"Aprobada");
    else await fcCrear({tipo:"rechazo",profe:x.profe,dia:x.dia,ref:x.id,motivo:"",por:"direccion",quien:quienSoy()},"Rechazada");render()}});
/* recordatorio: cada minuto, la barra de la profesora se vuelve a pintar */
setInterval(()=>{if(S.role==="profe"&&!S.pv&&S.screen==="app"&&!document.hidden){const b=document.getElementById("fich-bar");if(b)b.outerHTML=`<div id="fich-bar">${vFichBar()}</div>`}},60000);

/* ============================================================================================
   Descuadres y pagos sin identificar (09/11/2026, titular: «un cajón de sastre»). Pestaña de dirección.
   Junta en una lista todo el dinero que no cuadra o que no se sabe de quién es, para poder buscarlo cuando una familia diga
   «yo pagué tal día»:
   - Tarjeta: operaciones del TPV que están en el banco y no en la caja de Argos (y al revés), o diferencia de una liquidación.
   - Bizum y transferencias recibidas sin alumno identificado.
   - Efectivo: descuadres del cierre de la Caja de la app y apuntes «Descuadre sin justificar» (desde que la Caja es real).
   Cada uno se puede asignar a un alumno (con nota) o marcar como justificado; queda en banco/<AAAA-MM>.desc.<clave> =
   {estado:"asignado"|"justificado", alumno, nombre, nota, t, por}. Filtros: estado, tipo, fechas y texto/importe.
   ============================================================================================ */
const DQ={f:"pend",tipo:"",d0:"",d1:"",q:"",abre:null,aq:""};
function descGuardados(){const o={};for(const d of GB.docs)for(const [k,v] of Object.entries(d.desc||{}))if(v)o[k]={...v,mes:d.id};return o}
function descItems(){const out=[],add=x=>{x.k=hashTxt(x.src);out.push(x)},desde=docDesde();
  /* tarjeta */
  for(const x of cuadreTarjetaDias()){if(x.d<desde)continue;
    if(x.modo==="ops"){for(const o of x.soloBanco)add({src:`tpv|${x.d}|${o.imp}|${o.tarj}`,tipo:"Tarjeta",fecha:x.d,imp:o.imp,det:`Cobro con tarjeta${o.tarj?" …"+o.tarj:""} que está en el banco y no en la caja de Argos`,
        pista:(o.pistas||[]).map(g=>g.map(r=>`${titulo(r.tit)} (${r.fp})`).join(" + ")).join(" o ")});
      for(const r of x.soloArgos)add({src:`tpva|${x.d}|${r.num}|${r.imp}|${r.tit}`,tipo:"Tarjeta",fecha:x.d,imp:-r.imp,det:`Cobrado con tarjeta en Argos (${titulo(r.tit)}${r.num?", "+r.num:""}) y no aparece en el banco`})}
    else if(x.modo==="total"&&x.ok===false)add({src:`tpvt|${x.fv}`,tipo:"Tarjeta",fecha:x.fv,imp:r2(x.tB-x.tAw),det:`Liquidación del TPV del ${fmtFecha(x.fv)}: banco ${eur(x.tB)} y Argos ${eur(x.tAw)}. Sube su PDF para ver qué operación es`})}
  /* 16/11/2026 (titular): descuadres apuntados a mano en la app (el Excel de la caja de Argos no trae aperturas, retiradas ni descuadres) */
  for(const d of GB.docs)for(const [mk,v] of Object.entries(d.desc||{})){const m=v&&v.manual;if(!m||!m.fecha||m.fecha<desde)continue;
    add({src:`man|${mk}`,h:m.h||"",tipo:m.tipo||"Efectivo",fecha:m.fecha,imp:+m.imp||0,mk,mes:d.id,det:`Descuadre apuntado a mano${m.nota?": «"+m.nota+"»":""} · ${m.por||""}. ${(+m.imp||0)<0?"Falta ese dinero":"Sobra ese dinero"}: busca qué cobro no se apuntó o se apuntó con otra forma de pago`})}
  /* 16/11/2026 (titular): descuadres apuntados a mano en la caja de Argos («DESCUADRE CAJA −25 €») */
  {const AC=argosCajaDias();for(const d of Object.keys(AC).sort()){if(d<desde)continue;(AC[d].f||[]).forEach((x,i)=>{if(!/DESCUADRE/i.test(String(x.c||"")+" "+String(x.o||"")))return;
    add({src:`acjd|${d}|${i}|${x.imp}`,h:x.h||"",tipo:esTarj(x.fp)?"Tarjeta":/bizum/i.test(x.fp||"")?"Bizum":/transf/i.test(x.fp||"")?"Transferencia":"Efectivo",fecha:d,imp:+x.imp||0,
      det:`Descuadre apuntado en la caja de Argos: «${x.c||"Descuadre"}»${x.h?" a las "+x.h:""}. ${(+x.imp||0)<0?"Falta ese dinero en la caja: busca qué cobro no se apuntó o se apuntó con otra forma de pago":"Sobra ese dinero en la caja: busca qué cobro falta por apuntar"}`})})}}
  /* bizum y transferencias sin alumno */
  for(const m of movsTodos())if(["bizum","transf"].includes(m.cat)&&m.importe>0&&String(m.fv||"")>=desde&&!m.enl&&!enlaceCobro(m).length)
    add({src:`mov|${m.mes}|${m.id}`,tipo:m.cat==="bizum"?"Bizum":"Transferencia",fecha:m.fv,imp:m.importe,det:`${m.concepto}${m.ordenante?" · "+titulo(String(m.ordenante).toLowerCase()):""}${m.obs?" · «"+m.obs+"»":""}`,mov:m});
  /* efectivo (Caja de la app, cuando ya es real) */
  if(typeof GC!=="undefined"){const an=anulados();for(const d of GC.docs){if(!d.dia||d.dia<CAJA_REAL_DESDE||d.dia<desde||an.has(d.id))continue;
    if(d.tipo==="cierre"&&Math.abs(+d.descuadre||0)>0.009)add({src:`caja|${d.id}`,tipo:"Efectivo",fecha:d.dia,imp:+d.descuadre,det:`Cierre de caja: esperado ${eur(+d.esperado)}, contado ${eur(+d.contado)}${d.nota?" · «"+d.nota+"»":""} · ${d.quien||""}`});
    if(d.tipo==="apertura"&&Math.abs(+d.descuadre||0)>0.009)add({src:`ape|${d.id}`,tipo:"Efectivo",fecha:d.dia,imp:+d.descuadre,det:`Apertura de caja: debía haber ${eur(+d.arrastre)}${d.sinCerrar?` (la caja del ${fmtFecha(d.desdeDia)} no se cerró)`:""} y se contaron ${eur(+d.fondo)} · ${d.quien||""}`});
    if(d.tipo==="apunte"&&d.cc==="descuadre")add({src:`apu|${d.id}`,tipo:"Efectivo",fecha:d.dia,imp:(+d.signo<0?-1:1)*(+d.importe||0),det:`Apunte «Descuadre sin justificar»${d.nota?" · «"+d.nota+"»":""} · ${d.quien||""}`})}}
  const G=descGuardados();for(const x of out)x.res=G[x.k]||null;
  return out.sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||Math.abs(b.imp)-Math.abs(a.imp))}
const descPend=()=>{try{return descVer()&&GB.ok?descItems().filter(x=>!x.res).length:0}catch(_){return 0}};
const descVer=()=>gbVer()||(typeof esPlus==="function"&&esPlus())||!!(S.pv&&S.pv.rol==="profe"&&typeof PROFE_PLUS!=="undefined"&&PROFE_PLUS.includes(S.pv.profe));
function vDescuadres(){if(!descVer())return `<div class="empty">Solo dirección.</div>`;if(!gbVer()&&typeof PLUS!=="undefined"&&!PLUS.m)return `<div class="empty">${PLUS.err?esc(PLUS.err):"Cargando…"}</div>`;return conTodos(vDescuadres0)}
function vDescuadres0(){gbEscuchar();cajaEscuchar();
  if(!GB.ok)return `<div class="empty">Cargando…</div>`;
  const all=descItems(),q=nzC(DQ.q).normalize("NFD").replace(/[̀-ͯ]/g,""),qn=gtNum(DQ.q);
  let l=all.filter(x=>DQ.f==="todos"||(DQ.f==="pend"?!x.res:!!x.res));
  if(DQ.tipo)l=l.filter(x=>x.tipo===DQ.tipo);if(DQ.d0)l=l.filter(x=>x.fecha>=DQ.d0);if(DQ.d1)l=l.filter(x=>x.fecha<=DQ.d1);
  if(q)l=l.filter(x=>(qn!=null&&!isNaN(qn)&&Math.abs(Math.abs(x.imp)-qn)<0.005)||nzC([x.det,x.pista,x.res&&x.res.nombre,x.res&&x.res.nota,x.tipo].join(" ")).normalize("NFD").replace(/[̀-ͯ]/g,"").includes(q));
  const nP=all.filter(x=>!x.res).length,sumP=r2(all.filter(x=>!x.res).reduce((s,x)=>s+x.imp,0));
  const fila=x=>{const fi=typeof fpInfo==="function"?fpInfo(x.tipo):null;return `<div class="row" style="flex-wrap:wrap;gap:6px;align-items:flex-start;${fi?`border-left:4px solid ${fi.c};padding-left:10px;`:""}${x.res?"opacity:.7":""}">
      <span style="min-width:96px"><b>${fmtFecha(x.fecha)}</b><br>${typeof fpChip==="function"?fpChip(x.tipo):`<span class="note">${x.tipo}</span>`}</span>
      <span class="grow" style="white-space:normal;flex-basis:260px">${esc(x.det)}${x.pista?`<br><span class="note" style="color:var(--warn)">¿Será ${esc(x.pista)}?</span>`:""}
        ${x.res?`<br><span class="badge ${x.res.estado==="asignado"?"b-si":"b-off"}">${x.res.estado==="asignado"?"Asignado a "+esc(titulo(x.res.nombre||""))+(x.res.recibo?" · recibo "+esc(x.res.recibo)+" pagado":""):"Justificado"}</span>${x.res.nota?` <span class="note">«${esc(x.res.nota)}»</span>`:""} <span class="note">· ${esc(x.res.por||"")} ${fmtFecha(String(x.res.t||"").slice(0,10))}</span>`:""}
        ${DQ.abre===x.k?vDescAsignar(x):vDescCoinc(x)}</span>
      <b style="min-width:80px;text-align:right;color:var(${x.imp>=0?"--ok":"--bad"})">${x.imp>=0?"+":"−"}${eur(Math.abs(x.imp))}</b>
      <span style="display:flex;gap:4px;flex-wrap:wrap">${x.res?`<button class="btn small" data-dq="reabrir" data-k="${x.k}" data-d="${esc(x.fecha)}">Reabrir</button>`
        :`<button class="btn small primary" data-dq="abrir" data-k="${x.k}">Asignar a alumno</button><button class="btn small" data-dq="just" data-k="${x.k}" data-d="${esc(x.fecha)}">Justificado</button>${x.mk?`<button class="btn small" data-dq="manborrar" data-mk="${esc(x.mk)}" data-d="${esc(x.mes+"-01")}" title="Borrar este apunte">×</button>`:""}`}</span></div>`};
  return `<div class="bar"><h2>Descuadres y pagos sin identificar</h2><span class="legend">${nP?`<b style="color:var(--bad)">${nP} pendiente${nP===1?"":"s"}</b> · ${sumP>=0?"+":"−"}${eur(Math.abs(sumP))}`:"Nada pendiente"}</span></div>
  <p class="note" style="margin-top:0">Aquí llega solo lo que no cuadra: cobros con tarjeta que no están en la caja de Argos (sube la caja de cada día en Gastos), Bizum y transferencias sin alumno, y descuadres de efectivo de la Caja. Cuando una familia diga «yo pagué tal día», búscalo por fecha, importe o tarjeta y asígnalo a su alumno.</p>
  ${typeof fpChip==="function"?`<p class="note" style="margin:-4px 0 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">Colores: ${["Tarjeta","Bizum","Transferencia","Efectivo"].map(fpChip).join("")}</p>`:""}
  ${S.pv?"":DQ.nuevo?`<div class="panel" style="padding:10px 14px;margin-bottom:10px"><b>Apuntar un descuadre</b> <span class="note">(por ejemplo, el «DESCUADRE CAJA» del arqueo de Argos)</span>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px">
      <label class="f" style="flex:0 1 150px">Día<input type="date" id="dqn-f" value="${todayISO()}"></label>
      <label class="f" style="flex:0 1 150px">Forma de pago<select id="dqn-t">${["Efectivo","Tarjeta","Bizum","Transferencia"].map(t=>`<option>${t}</option>`).join("")}</select></label>
      <label class="f" style="flex:0 1 170px">¿Falta o sobra?<select id="dqn-s"><option value="-1">Falta dinero en caja</option><option value="1">Sobra dinero en caja</option></select></label>
      <label class="f" style="flex:0 1 110px">Importe (€)<input type="text" id="dqn-i" inputmode="decimal" placeholder="25"></label>
      <label class="f" style="flex:0 1 110px">Hora (si se sabe)<input type="time" id="dqn-h"></label>
      <label class="f" style="flex:1 1 200px">Nota<input type="text" id="dqn-n" maxlength="160" placeholder="Ej.: arqueo del lunes, contado"></label>
      <button class="btn primary" data-dq="nuevook">Guardar</button><button class="btn" data-dq="nuevono">Cancelar</button></div></div>`
    :`<div style="margin-bottom:10px"><button class="btn" data-dq="nuevo">+ Apuntar un descuadre</button></div>`}
  <div class="bar" style="gap:8px;flex-wrap:wrap">
    <label class="f" style="flex:0 1 150px">Estado<select id="dq-f"><option value="pend" ${DQ.f==="pend"?"selected":""}>Pendientes</option><option value="res" ${DQ.f==="res"?"selected":""}>Resueltos</option><option value="todos" ${DQ.f==="todos"?"selected":""}>Todos</option></select></label>
    <label class="f" style="flex:0 1 150px">Tipo<select id="dq-tipo"><option value="">Todos</option>${["Tarjeta","Bizum","Transferencia","Efectivo"].map(t=>`<option ${DQ.tipo===t?"selected":""}>${t}</option>`).join("")}</select></label>
    <label class="f" style="flex:0 1 150px">Desde<input type="date" id="dq-d0" value="${esc(DQ.d0)}"></label><label class="f" style="flex:0 1 150px">Hasta<input type="date" id="dq-d1" value="${esc(DQ.d1)}"></label>
    <label class="f" style="flex:1 1 200px">Buscar<input type="search" id="dq-q" value="${esc(DQ.q)}" placeholder="Importe (40), tarjeta (8814), nombre…"></label></div>
  <div class="panel" style="padding:4px 14px">${l.length?l.map(fila).join(""):`<div class="empty">${all.length?"Nada con estos filtros.":"No hay descuadres. Sube la caja de Argos de cada día en Gastos para que se comparen las tarjetas."}</div>`}</div>`}
/* 16/11/2026 (titular): posibles coincidencias de cada descuadre para ayudar a localizarlo: recibos pendientes o tarifa por ese
   importe, alumnos con clase ese día (y si se sabe la hora, entre una hora antes y una después) con su profesora, el día de la semana
   o del mes en que suele pagar y la forma de pago que suele usar. */
function descCoinc(x){const A=Math.abs(+x.imp||0),f=x.fecha;if(!A||!f)return [];const c2=v=>Math.round(v*100),dS=diaDe(f),dM=+f.slice(8,10),fk=(fpInfo(x.tipo)||{}).k;
  const hm2=x.h?minDe(x.h):null,TM=typeof tfMapa==="function"?tfMapa():null,out=[];
  /* cobros de ese día en la caja de Argos por ese importe (aunque aún no se haya subido el listado de recibos) */
  const cajaHoy=new Map();try{const AC=argosCajaDias()[f];for(const y of (AC&&AC.f)||[]){if(/DESCUADRE/i.test(String(y.c||""))||c2(+y.imp||0)!==c2(A))continue;
    const id=typeof idDeTitular==="function"?idDeTitular(y.tit,[]):null;if(id&&!cajaHoy.has(id))cajaHoy.set(id,{numero:y.num,forma:y.fp,h:y.h})}}catch(_){}
  for(const [id,a] of S.alumnos){if(!a)continue;const why=[];let sc=0,rec=[];
    const pend=(a.recibos||[]).filter(r=>pendReciente(r,f)&&r.importe!=null);
    /* cobrado ese mismo día por ese importe: si falta dinero, puede que no se cobrara de verdad o que se pagara con otra forma; si es un cobro del banco, puede que en Argos se apuntara con otra forma de pago */
    const hoyP=(a.recibos||[]).filter(r=>r&&r.estado==="pagado"&&String(r.pagado||"").slice(0,10)===f&&c2(+r.importe||0)===c2(A));
    if(!hoyP.length&&cajaHoy.has(id))hoyP.push(cajaHoy.get(id));
    if(hoyP.length){const r=hoyP[0],fr=(fpInfo(r.forma)||{}),mismo=fr.k&&fr.k===fk;sc+=mismo&&x.imp<0?6:5;
      why.push(`cobrado ese día ${eur(A)}${fr.l?" en "+fr.l.toLowerCase():""}${r.h?" a las "+r.h:""}${r.numero?" ("+r.numero+")":""}: ${x.imp<0?(mismo?"¿se cobró de verdad o se pagó de otra forma?":"¿se apuntó con la forma de pago equivocada?"):(mismo?"¿se cobró dos veces?":"¿se apuntó con la forma de pago equivocada?")}`)}
    rec=pend.filter(r=>c2(+r.importe)===c2(A));if(rec.length){sc+=5;why.push(`recibo pendiente de ${eur(A)}${rec[0].numero?" ("+rec[0].numero+")":""}`)}
    else if(pend.length>1&&c2(pend.reduce((s,r)=>s+(+r.importe||0),0))===c2(A)){sc+=4;rec=[];why.push(`sus ${pend.length} recibos pendientes suman ${eur(A)}`)}
    else{let t=null;try{if(TM&&!a.baja){const M=calcMatriz(a,TM);if(M.l.length&&!M.falta)t=M.total}}catch(_){}
      if(t!=null&&c2(t)===c2(A)){sc+=3;why.push(`su mensualidad es ${eur(A)}`)}else if(a.sueltas&&c2(+a.sueltas.precio||0)===c2(A)){sc+=3;why.push(`su clase suelta vale ${eur(A)}`)}}
    let cl=[];try{cl=(typeof clasesDia==="function"?clasesDia(a,f,[]):[]).filter(o=>o.t!=="movida"&&o.t!=="perdida")}catch(_){}
    if(cl.length){const cerca=hm2!=null?cl.filter(o=>o.ini-60<=hm2&&hm2<=o.fin+60):cl;
      if(cerca.length){sc+=hm2!=null?3:2;why.push(`clase ese día: ${cerca.map(o=>`${hm(o.ini)}–${hm(o.fin)} con ${o.profe}${o.falta?" (faltó)":""}`).join(", ")}`)}
      else if(hm2!=null){sc+=1;why.push(`tuvo clase ese día (${cl.map(o=>`${hm(o.ini)} con ${o.profe}`).join(", ")}), lejos de esa hora`)}}
    const pag=(a.recibos||[]).filter(r=>r&&r.estado==="pagado"&&/^\d{4}-\d\d-\d\d/.test(String(r.pagado||"")));
    if(pag.length>=2){const ws={},fs={};for(const r of pag){const w=diaDe(String(r.pagado).slice(0,10));ws[w]=(ws[w]||0)+1;const k=(fpInfo(r.forma)||{}).k;if(k)fs[k]=(fs[k]||0)+1}
      if((ws[dS]||0)>=2&&ws[dS]/pag.length>=0.5){sc+=1;why.push(`suele pagar los ${dS.toLowerCase()}`)}
      const dm=pag.map(r=>+String(r.pagado).slice(8,10));if(dm.filter(d=>Math.abs(d-dM)<=2).length/dm.length>=0.6){sc+=1;why.push(`suele pagar hacia el día ${dM}`)}
      if(fk&&(fs[fk]||0)/pag.length>=0.6){sc+=1;why.push(fk==="efectivo"?"suele pagar en contado":`suele pagar con ${(fpInfo(x.tipo)||{}).l.toLowerCase()}`)}}
    const fuerte=why.some(w=>/recibo pendiente|suman|mensualidad|suelta|cobrado ese día/.test(w));
    if(fuerte)out.push({id,a,sc,why,rec})}
  return out.sort((u,v)=>v.sc-u.sc||u.a.nombre.localeCompare(v.a.nombre,"es")).slice(0,6)}
function vDescCoinc(x){if(x.res)return "";let l=[];try{l=descCoinc(x)}catch(e){console.warn(e);return ""}if(!l.length)return `<br><span class="note">Sin coincidencias claras.</span>`;
  return `<details style="margin-top:4px"${DQ.coin===x.k?" open":""} data-dqcoin="${x.k}"><summary class="note" style="cursor:pointer"><b>Posibles coincidencias (${l.length})</b></summary>
    ${l.map(c=>`<div style="margin:4px 0 0 4px;padding:4px 8px;border-left:3px solid var(--line)"><b>${esc(titulo(c.a.nombre))}</b> <span class="note">· ${c.why.map(esc).join(" · ")}</span><br>
      <button class="btn small" style="margin-top:3px" data-dq="asignar" data-k="${x.k}" data-d="${esc(x.fecha)}" data-al="${esc(c.id)}">Asignar a ${esc(titulo(c.a.nombre).split(" ")[0])}</button>
      ${gbVer()?c.rec.map(r=>`<button class="btn small primary" style="margin:3px 0 0 4px" data-dq="asignarrec" data-k="${x.k}" data-d="${esc(x.fecha)}" data-al="${esc(c.id)}" data-r="${esc(r.id)}" data-tipo="${esc(x.tipo)}">Pagado: ${esc(r.numero||r.concepto||"recibo")}</button>`).join(""):""}</div>`).join("")}</details>`}
function vDescAsignar(x){const q=nzC(DQ.aq||"");const l=q.length>=2?sortedAlumnos().filter(([,a])=>a.nombre.includes(q)).slice(0,8):[];
  return `<div style="margin-top:6px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--surface)">
    <div style="display:flex;gap:6px"><input type="search" id="dq-aq" placeholder="Nombre del alumno" value="${esc(DQ.aq||"")}" style="flex:1"><button class="btn small" data-dq="cerrar">Cancelar</button></div>
    <input type="text" id="dq-nota" placeholder="Nota (opcional): p. ej. «lo dijo la madre; se le marca el recibo de noviembre»" style="width:100%;margin-top:6px">
    <div id="dq-ares">${l.map(([id,a])=>{const pr=gbVer()?pendientesDe(a,id):[];return `<div style="margin-top:6px"><button class="btn small" data-dq="asignar" data-k="${x.k}" data-d="${esc(x.fecha)}" data-al="${esc(id)}">${esc(titulo(a.nombre))}</button>
      ${pr.map(r=>`<button class="btn small primary" style="margin:4px 4px 0 0" data-dq="asignarrec" data-k="${x.k}" data-d="${esc(x.fecha)}" data-al="${esc(id)}" data-r="${esc(r.id)}" data-tipo="${esc(x.tipo)}">Pagado: ${esc(r.numero||r.concepto||"recibo")} · ${eur(+r.importe)}</button>`).join("")}</div>`}).join("")||(q.length>=2?`<span class="note">Ningún alumno con ese nombre.</span>`:"")}</div>
    <p class="note" style="margin:6px 0 0">Pulsa el nombre para asignarlo sin más, o el botón rojo de un recibo pendiente para asignarlo y marcar ese recibo como <b>pagado</b> en la app (con esa forma de pago y ese día; se mantiene aunque vuelvas a subir el listado). Márcalo también en Argos.</p></div>`}
async function descGuardar(k,dia,v){const mes=String(dia).slice(0,7),ref=S.db.doc("banco/"+mes);
  try{const sn=await ref.get();if(sn.exists)await ref.update({["desc."+k]:v});else await ref.set({mes,desc:{[k]:v}});return true}catch(e){console.error(e);toast("No se ha podido guardar.");return false}}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-dq]");if(!t||!descVer())return;if(S.pv){e.preventDefault();toast("Vista previa: es solo para mirar");return}e.preventDefault();const act=t.dataset.dq,k=t.dataset.k;
  if(act==="abrir"){DQ.abre=k;DQ.aq="";render();setTimeout(()=>{const i=$("#dq-aq");if(i)i.focus()},0)}
  else if(act==="cerrar"){DQ.abre=null;render()}
  else if(act==="asignar"){const a=conTodos(()=>S.alumnos.get(t.dataset.al));if(!a)return;const nota=String(($("#dq-nota")||{}).value||"").trim().slice(0,200);
    if(await descGuardar(k,t.dataset.d,{estado:"asignado",alumno:t.dataset.al,nombre:a.nombre,nota,t:nowISO(),por:quienSoy()})){DQ.abre=null;toast("Asignado a "+titulo(a.nombre));render()}}
  else if(act==="asignarrec"){if(!gbVer())return;const id=t.dataset.al,a=S.alumnos.get(id);if(!a)return;const r=(a.recibos||[]).find(y=>y&&y.id===t.dataset.r);if(!r)return;
    const nota=String(($("#dq-nota")||{}).value||"").trim().slice(0,200),tp=t.dataset.tipo||"",forma=tp==="Tarjeta"?"TARJETA":tp==="Bizum"?"BIZUM":tp==="Transferencia"?"TRANSFERENCIA":"CONTADO",d=t.dataset.d||todayISO();
    t.disabled=true;const recibos=(a.recibos||[]).map(y=>y===r?{...y,estado:"pagado",pagado:d,forma,caja:{id:"desc|"+k,t:nowISO(),por:quienSoy()}}:y);
    if(!await save(id,{recibos})){t.disabled=false;return}a.recibos=recibos;
    if(await descGuardar(k,d,{estado:"asignado",alumno:id,nombre:a.nombre,recibo:r.numero||r.id,nota,t:nowISO(),por:quienSoy()})){DQ.abre=null;toast(`Asignado a ${titulo(a.nombre)} y recibo ${r.numero||""} marcado como pagado`);render()}}
  else if(act==="nuevo"){DQ.nuevo=true;render()}
  else if(act==="nuevono"){DQ.nuevo=false;render()}
  else if(act==="nuevook"){const f=($("#dqn-f")||{}).value||"",imp=gtNum(($("#dqn-i")||{}).value||""),sg=+(($("#dqn-s")||{}).value||-1);
    if(!f){toast("Elige el día");return}if(imp==null||isNaN(imp)||imp<=0){toast("Escribe el importe");return}
    const mk="man_"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);t.disabled=true;
    if(await descGuardar(mk,f,{manual:{fecha:f,tipo:($("#dqn-t")||{}).value||"Efectivo",imp:r2(sg*Math.abs(imp)),h:($("#dqn-h")||{}).value||"",nota:String(($("#dqn-n")||{}).value||"").trim().slice(0,160),por:quienSoy(),t:nowISO()}})){DQ.nuevo=false;toast("Descuadre apuntado");render()}else t.disabled=false}
  else if(act==="manborrar"){if(!t.dataset.ok){t.dataset.ok="1";t.textContent="¿Borrar?";setTimeout(()=>{if(t.isConnected){delete t.dataset.ok;t.textContent="×"}},4000);return}
    if(await descGuardar(t.dataset.mk,t.dataset.d,null)){toast("Apunte borrado");render()}}
  else if(act==="just"){if(!t.dataset.ok){t.dataset.ok="1";t.textContent="¿Seguro? Pulsa otra vez";setTimeout(()=>{if(t.isConnected){delete t.dataset.ok;t.textContent="Justificado"}},4000);return}
    if(await descGuardar(k,t.dataset.d,{estado:"justificado",t:nowISO(),por:quienSoy()})){toast("Marcado como justificado");render()}}
  else if(act==="reabrir"){const x=conTodos(descItems).find(y=>y.k===k),al=x&&x.res&&x.res.recibo&&x.res.alumno;
    if(al&&gbVer()){const a=S.alumnos.get(al);if(a&&(a.recibos||[]).some(r=>r&&r.caja&&r.caja.id==="desc|"+k)){const recibos=a.recibos.map(r=>r&&r.caja&&r.caja.id==="desc|"+k?(({caja,...y})=>({...y,estado:"pendiente",pagado:"",forma:""}))(r):r);if(await save(al,{recibos}))a.recibos=recibos}}
    if(await descGuardar(k,t.dataset.d,null)){toast(al?"Vuelve a pendientes y el recibo vuelve a estar pendiente":"Vuelve a pendientes");render()}}});
document.addEventListener("input",e=>{const t=e.target;if(!t||!descVer())return;
  if(t.id==="dq-aq"){DQ.aq=t.value;const x=conTodos(descItems).find(y=>y.k===DQ.abre),r=$("#dq-ares");if(x&&r){const tmp=document.createElement("div");tmp.innerHTML=conTodos(()=>vDescAsignar(x));const n=tmp.querySelector("#dq-ares");if(n)r.innerHTML=n.innerHTML}}
  else if(t.id==="dq-q"){DQ.q=t.value;clearTimeout(DQ.tq);DQ.tq=setTimeout(()=>{render();const i=$("#dq-q");if(i){i.focus();i.setSelectionRange(i.value.length,i.value.length)}},350)}});
document.addEventListener("change",e=>{const t=e.target;if(!t||!descVer())return;
  if(t.id==="dq-f"){DQ.f=t.value;render()}else if(t.id==="dq-tipo"){DQ.tipo=t.value;render()}else if(t.id==="dq-d0"){DQ.d0=t.value;render()}else if(t.id==="dq-d1"){DQ.d1=t.value;render()}});

/* ============================================================================================
   Horas extra de las profesoras (10/11/2026). Las nóminas de A3 no traen las horas del contrato, así que el horario contratado
   es el horario de cada profesora en la app (HORARIO_PROFE: el que limita dónde se pueden poner clases).
   Hora extra = tiempo con clase (normal, cambio, recuperación u hora extra de alumno) fuera de su horario ese día, o en festivo.
   No cuentan las clases en las que todos los alumnos faltaron. Por cada una: qué alumnos y cuánto se les cobra (hora extra
   del alumno: su recibo HX o la tarifa de la hora extra; cambios y recuperaciones: 0 €). Coste: lo que cuesta una hora de esa
   profesora ese mes (coste empresa de su nómina / horas de su horario en el mes; si no hay nómina de ese mes, la última).
   Desde que se ficha en la app (2027), además: tiempo fichado por encima de su horario.
   ============================================================================================ */
const HXP={mes:""};
/* 10/11/2026 (titular): cada hora extra se le paga a la profesora a 10 €/h */
const PRECIO_HORA_EXTRA_PROFE=10;
function costeHoraProfe(p,mes){const ns=NM.docs.filter(d=>d.tipo==="nomina"&&d.profe===p&&d.coste>0).sort((a,b)=>String(b.mes).localeCompare(String(a.mes)));
  const n=ns.find(d=>d.mes===mes)||ns.find(d=>d.mes<mes)||ns[0];if(!n)return null;
  const h=diasMes(n.mes).reduce((s,d)=>s+fcPrevisto(p,d),0)/60;return h>0?{v:r2(n.coste/h),mes:n.mes}:null}
/* ¿Paga cada clase en vez de mensualidad? (alumnos con clase fija)
   - algún recibo del mes con «HORA» en el concepto o el curso (Antonio Verdugo), o
   - 18/11/2026 (titular, María Pérez Torres: «CLASES INDIVIDUALES UNIVERSIDAD», 18 € los días 03, 10 y 16/11): al menos dos recibos
     del mes de importe pequeño (≤ PC_MAX) emitidos en días en que tuvo clase con esa profesora. */
const PC_MAX=30;
const reciboPorClase=r=>/\bHORA\b/i.test(String((r&&r.concepto)||"")+" "+String((r&&r.curso)||""));
function pagaPorClase(a,p,mes){const rs=(a.recibos||[]).filter(r=>r&&r.estado!=="anulado"&&r.serie!=="HX"&&String(r.emitido||"").slice(0,7)===mes);
  if(rs.some(reciboPorClase))return true;
  const peq=rs.filter(r=>(+r.importe||0)>0&&(+r.importe||0)<=PC_MAX);if(peq.length<2)return false;
  const dias=new Set(peq.map(r=>String(r.emitido).slice(0,10)));let k=0;for(const d of dias)if(sesionesFecha(p,d).some(x=>x.a===a||x.a&&x.a.token&&x.a.token===a.token))k++;
  return k>=2}
function horasExtraProfe(p,mes){const hoy=todayISO(),ev=[],usados={},fechasSuelta={};
  for(const f of diasMes(mes)){if(f>hoy)break;const d=diaDe(f),fe=festivoDe(f),tr=fe||!DIAS.includes(d)?[]:(typeof tramosContrato==="function"?tramosContrato:tramosDe)(p,d);
    /* 11/11/2026 (titular): solo cuenta la sesión si en la asistencia está «Asistió» */
    const ses=sesionesFecha(p,f).filter(s=>(s.o.t==="normal"||s.o.t==="extra")&&asistDe(s.a,f,s.o.hora||keyDeMin(s.o.ini),p)==="si");if(!ses.length)continue;
    const bl=[];for(const s of ses){const b=bl.find(b=>s.o.ini<b.fin&&s.o.fin>b.ini);if(b){b.ini=Math.min(b.ini,s.o.ini);b.fin=Math.max(b.fin,s.o.fin);b.s.push(s)}else bl.push({ini:s.o.ini,fin:s.o.fin,s:[s]})}
    for(const b of bl){const dentro=tr.reduce((x,[a,c])=>x+Math.max(0,Math.min(b.fin,c)-Math.max(b.ini,a)),0),fuera=(b.fin-b.ini)-dentro;if(fuera<=0)continue;
      const fueraDe=o=>(o.fin-o.ini)-tr.reduce((x,[a,c])=>x+Math.max(0,Math.min(o.fin,c)-Math.max(o.ini,a)),0);
      const fs=b.s.filter(s=>fueraDe(s.o)>0),f0=Math.min(...fs.map(s=>s.o.ini)),f1=Math.max(...fs.map(s=>s.o.fin));
      /* ¿tiene recibo esa hora? hora extra del alumno: su recibo de la app (HX), o cobrada en Argos; si no, «sin recibo» */
      const al=fs.map(s=>{const o=s.o,e=o.mv&&o.mv.origen==="hextra"?o.mv.e:null;let ing=0,txt="",rec="";
        if(e){const r=(s.a.recibos||[]).find(r=>r&&(r.extra===e.id||(Array.isArray(r.lineas)&&r.lineas.some(x=>x&&x.extra===e.id))));
          if(r){const ln=Array.isArray(r.lineas)?r.lineas.find(x=>x&&x.extra===e.id):null;ing=ln?+ln.imp||0:+r.importe||0;rec=`recibo ${r.numero||""}${r.estado==="pagado"?" pagado":" pendiente"}`}
          else if(e.cobro&&e.cobro.no){rec="no se cobra"}
          else if(e.cobro){ing=tarifaDe(s.a,e)||0;rec=e.cobro.auto?"cobrada en Argos":"marcada cobrada en Argos"}
          else rec="SIN RECIBO";txt="hora extra"}
        /* 11/11/2026: alumno de clases sueltas (paga cada clase): su recibo de ese día (o de los 5 siguientes, sin repetir) */
        /* también alumnos con clase fija que pagan cada hora (recibos «HORA …» de un día concreto, como Antonio Verdugo) */
        else if(s.a.sueltas||(o.t==="normal"||o.t==="extra"&&!(o.mv&&o.mv.recup))&&pagaPorClase(s.a,p,f.slice(0,7))){const fr=r=>String(r.emitido||r.fecha||"").slice(0,10),u=usados[s.id]=usados[s.id]||new Map(),key=r=>r.numero||r.id||fr(r);
          /* el recibo de su mismo día; si no hay, uno de los 5 días siguientes que no sea de otro día con clase */
          const conClase=fechasSuelta[s.id]=fechasSuelta[s.id]||new Set(diasMes(mes).filter(d=>d<=hoy&&sesionesFecha(p,d).some(x=>x.id===s.id)));
          /* 20/11/2026: con clases sueltas, los recibos HX que crea la app al marcar «Asistió» también cuentan (en v128 se habían dejado fuera por error) */
          const suyos=(s.a.recibos||[]).filter(r=>r&&r.estado!=="anulado"&&(+r.importe||0)>0&&(s.a.sueltas||r.serie!=="HX")&&(s.a.sueltas||reciboPorClase(r)||(+r.importe||0)<=PC_MAX));
          /* 18/11/2026 (titular): un recibo puede pagar varias clases de una vez (36 € = 2 clases de 18 €): cuenta para tantas clases
             como veces cabe el precio de una clase (el de clases sueltas o, si no hay, el recibo más pequeño de ese alumno) */
          const precio=(s.a.sueltas&&+s.a.sueltas.precio)||(suyos.length?Math.min(...suyos.map(r=>+r.importe||0)):0),cap=r=>precio>0?Math.max(1,Math.round((+r.importe||0)/precio)):1;
          const libres=suyos.filter(r=>(u.get(key(r))||0)<cap(r));
          const r=libres.find(r=>fr(r)===f)||libres.filter(r=>fr(r)>f&&fr(r)<=sumaDias(f,5)&&!conClase.has(fr(r))).sort((x,y)=>fr(x).localeCompare(fr(y)))[0]
            ||libres.filter(r=>cap(r)>1&&(u.get(key(r))||0)>0&&fr(r)<f&&fr(r)>=sumaDias(f,-31)).sort((x,y)=>fr(y).localeCompare(fr(x)))[0];
          txt=s.a.sueltas?"clase suelta":"paga por hora";
          if(r){const k=cap(r);u.set(key(r),(u.get(key(r))||0)+1);ing=r2((+r.importe||0)/k);rec=`recibo ${r.numero||fmtFecha(fr(r))}${r.estado==="pagado"?" pagado":" pendiente"}${k>1?` (${eur(+r.importe||0)} = ${k} clases)`:""}`}else rec="SIN RECIBO"}
        else{txt=o.t==="extra"?(o.mv&&o.mv.recup?"recuperación":"cambio de clase"):"su clase";rec=o.t==="extra"?"no se cobra":"en su mensualidad"}
        return {id:s.id,n:s.a.nombre,ing:r2(ing),txt,rec,sin:rec==="SIN RECIBO"}});
      ev.push({f,ini:f0,fin:f1,fuera,fest:!!fe,al,ing:r2(al.reduce((x,y)=>x+y.ing,0))})}}
  const min=ev.reduce((s,x)=>s+x.fuera,0),ing=r2(ev.reduce((s,x)=>s+x.ing,0)),ch={v:PRECIO_HORA_EXTRA_PROFE},coste=r2(ch.v*min/60),sinRec=ev.reduce((s,x)=>s+x.al.filter(a=>a.sin).length,0);
  let fich=null;if(typeof fichActivo==="function"&&fichActivo()&&FC.ok){let m=0;for(const d of diasMes(mes)){if(d>hoy||d<FICH_DESDE)continue;m+=Math.max(0,fcTramos(p,d).min-fcPrevisto(p,d))}fich=m}
  return {p,ev,min,ing,ch,coste,ben:r2(ing-coste),fich,sinRec}}
const hmTxt=m=>`${Math.floor(m/60)} h${m%60?" "+String(m%60).padStart(2,"0")+" min":""}`;
function vHorasExtraProfes(){if(S.role!=="dir"||esMos())return "";nmEscuchar();if(!HXP.mes)HXP.mes=todayISO().slice(0,7);
  const ms=[];for(let d=todayISO().slice(0,7)+"-01",i=0;i<12;i++,d=sumaDias(d,-1).slice(0,7)+"-01")ms.push(d.slice(0,7));
  const L=FICH_PROFES().map(p=>horasExtraProfe(p,HXP.mes)),tot={min:L.reduce((s,x)=>s+x.min,0),ing:r2(L.reduce((s,x)=>s+x.ing,0)),coste:L.every(x=>x.coste!=null)?r2(L.reduce((s,x)=>s+x.coste,0)):null};
  const fila=x=>`<details style="border-top:1px solid var(--line);padding:6px 0"><summary style="display:flex;gap:10px;flex-wrap:wrap;align-items:baseline"><b style="min-width:70px">${esc(x.p)}</b>
      <span>${x.min?`<b>${hmTxt(x.min)}</b> fuera de su horario`:`<span class="note">Sin horas fuera de su horario</span>`}</span>
      ${x.min?`<span class="note">· cobrado ${eur(x.ing)}${x.coste!=null?` · coste ${eur(x.coste)}`:""}</span>${x.ben!=null?` <b style="color:var(${x.ben>=0?"--ok":"--bad"})">${x.ben>=0?"+":"−"}${eur(Math.abs(x.ben))}</b>`:""}`:""}
      ${x.sinRec?`<span class="badge b-no">${x.sinRec} sin recibo</span>`:""}${x.fich!=null?`<span class="note">· fichado de más: ${hmTxt(x.fich)}</span>`:""}</summary>
    ${x.ev.map(e=>`<div class="note" style="margin-left:16px">${fmtFecha(e.f)} ${diaDe(e.f).slice(0,3)} · ${hm(e.ini)}–${hm(e.fin)} · <b>${hmTxt(e.fuera)}</b> fuera${e.fest?" (festivo)":""} · ${e.al.map(a=>`<a href="#" data-act="ir" data-id="${esc(a.id)}">${esc(titulo(a.n))}</a> (${esc(a.txt)} · <span style="${a.sin?"color:var(--bad);font-weight:600":""}">${esc(a.rec)}</span>${a.ing?": "+eur(a.ing):""})`).join(", ")}</div>`).join("")}</details>`;
  return `<div class="panel" style="padding:12px 14px;margin-bottom:12px"><div class="bar" style="margin:0;gap:8px;flex-wrap:wrap"><b style="font-size:16px">Horas extra de las profesoras</b>
      <select id="hxp-mes">${ms.map(m=>`<option value="${m}" ${m===HXP.mes?"selected":""}>${MESES[+m.slice(5,7)-1]} ${m.slice(0,4)}</option>`).join("")}</select>
      <span class="legend">${tot.min?`${hmTxt(tot.min)} · cobrado ${eur(tot.ing)}${tot.coste!=null?` · coste ${eur(tot.coste)} · <b style="color:var(${tot.ing-tot.coste>=0?"--ok":"--bad"})">${tot.ing-tot.coste>=0?"+":"−"}${eur(Math.abs(r2(tot.ing-tot.coste)))}</b>`:""}`:"Nada fuera de horario este mes"}</span></div>
    <p class="note" style="margin:4px 0 6px">Tiempo con clase fuera del horario de contrato de cada profesora (Ainea y Laura hasta las 20:00; las demás, su horario de la app). Solo cuentan las sesiones con «Asistió». Lo cobrado es el recibo de la hora extra del alumno (si no lo tiene, sale «SIN RECIBO»); su clase de siempre va en su mensualidad y los cambios y recuperaciones no se cobran. Coste: ${eur(PRECIO_HORA_EXTRA_PROFE)} por hora extra de la profesora.</p>
    ${L.map(fila).join("")}</div>`}
document.addEventListener("change",e=>{const t=e.target;if(t&&t.id==="hxp-mes"){HXP.mes=t.value;render()}});

/* ============================================================================================
   Facturación de talleres y servicios a entidades (11/11/2026, titular). Ayuntamiento, empresas públicas…: factura completa
   (con IVA o exenta, y retención si la hay), los costes que ocasiona cada taller (horas de profesora, parte de una nómina,
   materiales u otros gastos del banco, otros) y el margen. La asesoría ve las facturas emitidas en su pestaña (para el IVA
   trimestral) y puede descargar el libro de facturas emitidas en Excel.
   facturasTaller/<id> = {estado:"borrador"|"emitida"|"anulada", serie, anio, n, numero, fecha, taller, cliente:{nombre,cif,dir,cp,pob,email},
     lineas:[{d,c,p}], iva, exento, irpf, base, cuotaIva, ret, total, pago:{forma,iban,venc}, notas, emisor:{…}, costes:[…],
     cobro:{mes,id,fecha,imp}, t, por}
   config/facturacion = datos del emisor (nombre, nif, dir, cp, pob, prov, iban, email, tel, serie).
   La numeración es correlativa por serie y año, y se asigna al emitir (los borradores no tienen número).
   ============================================================================================ */
const FA={docs:[],ok:false,err:"",sub:null,cfg:null,ed:null,anio:"",ver:null};
const FA_EMISOR={nombre:"Estefanía Pérez Busati",comercial:"Althea Formación",nif:"48966357R",dir:"C/ Iro, 5",cp:"11130",pob:"Chiclana de la Frontera",prov:"Cádiz",iban:"",email:"",tel:"",serie:"T"};
const FA_EXENTA="Operación exenta de IVA (art. 20.Uno.9º de la Ley 37/1992: enseñanza)";
function faEscuchar(){if(FA.sub||!S.db)return;
  FA.sub=S.db.collection("facturasTaller").onSnapshot(s=>{FA.docs=s.docs.map(d=>({id:d.id,...d.data()}));FA.ok=true;FA.err="";if(S.view==="facturacion"&&!faEscribiendo())render();else if(S.view==="gastos"&&GB.rent)gbRefrescar();if(S.role==="ase")vAsePintar()},
    e=>{FA.ok=true;FA.err="No se pueden leer las facturas: faltan permisos (publica las reglas nuevas en Firebase).";if(S.view==="facturacion")render()});
  if(S.role==="dir")S.db.doc("config/facturacion").onSnapshot(d=>{FA.cfg=d.exists?d.data():null},()=>{})}
const faEscribiendo=()=>{const ae=document.activeElement;return ae&&ae.closest&&ae.closest("#fa-ed")&&ae.matches("input,textarea,select")};
const faEmisor=()=>({...FA_EMISOR,...(FA.cfg||{})});
function faTotales(f){const base=r2((f.lineas||[]).reduce((s,l)=>s+(+l.c||0)*(+l.p||0),0)),iva=+f.iva||0,irpf=+f.irpf||0,cuotaIva=r2(base*iva/100),ret=r2(base*irpf/100);
  return {base,cuotaIva,ret,total:r2(base+cuotaIva-ret)}}
function faCoste(c){if(c.tipo==="horas")return r2((+c.horas||0)*(+c.precio||0));
  if(c.tipo==="nomina"){const n=NM.docs.find(d=>d.tipo==="nomina"&&d.profe===c.profe&&d.mes===c.mes);return n?r2((+n.coste||0)*(+c.pct||0)/100):0}
  return r2(+c.imp||0)}
const faCostes=f=>r2((f.costes||[]).reduce((s,c)=>s+faCoste(c),0));
const faNumero=(serie,anio,n)=>`${serie}${anio}/${String(n).padStart(4,"0")}`;
function faSiguiente(serie,anio){return FA.docs.filter(d=>d.estado!=="borrador"&&d.serie===serie&&String(d.anio)===String(anio)).reduce((m,d)=>Math.max(m,+d.n||0),0)+1}
function faNueva(){const E=faEmisor();return {estado:"borrador",serie:E.serie||"T",fecha:todayISO(),taller:"",cliente:{nombre:"",cif:"",dir:"",cp:"",pob:"",email:""},lineas:[{d:"",c:1,p:""}],iva:21,exento:FA_EXENTA,irpf:0,pago:{forma:"Transferencia bancaria",iban:E.iban||"",venc:sumaDias(todayISO(),30)},notas:"",costes:[]}}
async function faGuardar(f,extra){const T=faTotales(f),d={...f,...T,...(extra||{}),t:nowISO(),por:quienSoy()};delete d.id;
  try{if(!f.id)f.id="f"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);await S.db.doc("facturasTaller/"+f.id).set(d);return true}
  catch(e){console.error(e);toast("No se ha podido guardar: faltan permisos (publica las reglas nuevas en Firebase).");return false}}
/* página imprimible de la factura (dirección y asesoría) */
function faHtml(f){const E=f.emisor||faEmisor(),T=faTotales(f),C=f.cliente||{},e=x=>esc(x||"");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${e(f.numero||"borrador")}</title><style>
  body{font:13px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#222;margin:32px auto;max-width:760px;padding:0 20px}
  h1{font-size:22px;margin:0;color:#a3262c;letter-spacing:.5px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}
  .box{border:1px solid #ccc;border-radius:6px;padding:10px 12px;flex:1}.lbl{font-size:11px;color:#777;text-transform:uppercase;letter-spacing:.4px}
  table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:7px 8px;border-bottom:1px solid #e3e3e3;text-align:left}th{background:#f5f2f2;font-size:12px}
  .r{text-align:right}.tot td{border:0;padding:4px 8px}.tot .g td{font-weight:700;font-size:15px;border-top:2px solid #333}
  .nota{margin-top:18px;font-size:12px;color:#444}.bor{color:#a3262c;font-weight:700;border:2px solid #a3262c;display:inline-block;padding:2px 8px;border-radius:4px}
  @media print{body{margin:0}.noprint{display:none}}</style></head><body>
  <div class="noprint" style="text-align:right;margin-bottom:10px"><button onclick="print()">Imprimir o guardar en PDF</button></div>
  <div class="top"><div><h1>${e(E.comercial||E.nombre)}</h1><div>${e(E.nombre)} · NIF ${e(E.nif)}</div><div>${e(E.dir)} · ${e(E.cp)} ${e(E.pob)} (${e(E.prov)})</div>${E.tel||E.email?`<div>${e([E.tel,E.email].filter(Boolean).join(" · "))}</div>`:""}</div>
    <div style="text-align:right"><div class="lbl">Factura</div><div style="font-size:18px;font-weight:700">${f.numero?e(f.numero):`<span class="bor">BORRADOR</span>`}</div><div>Fecha: ${fmtFecha(f.fecha)}</div>${f.estado==="anulada"?`<div class="bor">ANULADA</div>`:""}</div></div>
  <div class="top" style="margin-top:18px"><div class="box"><div class="lbl">Cliente</div><b>${e(C.nombre)}</b><div>CIF/NIF ${e(C.cif)}</div><div>${e(C.dir)}</div><div>${e(C.cp)} ${e(C.pob)}</div></div>
    ${f.taller?`<div class="box"><div class="lbl">Taller / servicio</div>${e(f.taller)}</div>`:""}</div>
  <table><thead><tr><th>Descripción</th><th class="r">Cantidad</th><th class="r">Precio</th><th class="r">Importe</th></tr></thead><tbody>
  ${(f.lineas||[]).filter(l=>l.d||+l.p).map(l=>`<tr><td>${e(l.d)}</td><td class="r">${String(+l.c||0).replace(".",",")}</td><td class="r">${eur(+l.p||0)}</td><td class="r">${eur(r2((+l.c||0)*(+l.p||0)))}</td></tr>`).join("")}</tbody></table>
  <table class="tot" style="width:auto;margin-left:auto"><tr><td>Base imponible</td><td class="r">${eur(T.base)}</td></tr>
    <tr><td>IVA ${+f.iva||0} %</td><td class="r">${eur(T.cuotaIva)}</td></tr>${+f.irpf?`<tr><td>Retención IRPF ${+f.irpf} %</td><td class="r">−${eur(T.ret)}</td></tr>`:""}
    <tr class="g"><td>Total</td><td class="r">${eur(T.total)}</td></tr></table>
  ${+f.iva?"":`<div class="nota">${e(f.exento||FA_EXENTA)}</div>`}
  <div class="nota"><b>Forma de pago:</b> ${e(f.pago&&f.pago.forma)}${f.pago&&f.pago.iban?` · IBAN ${e(f.pago.iban)}`:""}${f.pago&&f.pago.venc?` · Vencimiento ${fmtFecha(f.pago.venc)}`:""}</div>
  ${f.notas?`<div class="nota">${e(f.notas)}</div>`:""}</body></html>`}
function faAbrir(f){const w=window.open("","_blank");if(!w){toast("El navegador ha bloqueado la ventana: permite las ventanas emergentes");return}w.document.open();w.document.write(faHtml(f));w.document.close()}
/* 14/11/2026: se llamaba vFacturacion y tapaba la «Facturación semanal» de Tarifas (misma función): renombrada */
function vFactTalleres(){if(!gbVer())return `<div class="empty">Solo dirección.</div>`;faEscuchar();nmEscuchar();gbEscuchar();
  if(!FA.ok)return `<div class="empty">Cargando…</div>`;if(FA.err)return `<div class="empty">${esc(FA.err)}</div>`;
  if(FA.ed)return vFacturaEd(FA.ed);
  const anios=[...new Set([todayISO().slice(0,4),...FA.docs.map(d=>String(d.fecha||"").slice(0,4))])].filter(Boolean).sort().reverse();if(!FA.anio)FA.anio=anios[0];
  const l=FA.docs.filter(d=>String(d.fecha||"").startsWith(FA.anio)).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))||(+b.n||0)-(+a.n||0));
  const em=l.filter(d=>d.estado==="emitida"),tb=r2(em.reduce((s,d)=>s+(+d.base||0),0)),tiva=r2(em.reduce((s,d)=>s+(+d.cuotaIva||0),0)),tcos=r2(em.reduce((s,d)=>s+faCostes(d),0));
  const E=faEmisor();
  return `<div class="bar"><h2>Facturación de talleres</h2><span class="legend"><button class="btn" data-fa="semanal" title="Lo facturado en Argos frente a lo que ha entrado en el banco, semana a semana">Facturación semanal (Argos y banco)</button><button class="btn primary" data-fa="nueva">Nueva factura</button></span></div>
  <p class="note" style="margin-top:0">Facturas a ayuntamientos, empresas públicas u otras entidades (no las de los alumnos, que siguen en Argos). A cada factura se le pueden asignar sus costes (horas de profesora, parte de una nómina, materiales…) para ver el margen. La asesoría ve las emitidas en su pestaña, con el IVA de cada trimestre.</p>
  <div class="bar" style="gap:8px;flex-wrap:wrap"><label class="f" style="flex:0 1 120px">Año<select id="fa-anio">${anios.map(a=>`<option ${a===FA.anio?"selected":""}>${a}</option>`).join("")}</select></label>
    <span class="legend">${em.length} emitida${em.length===1?"":"s"} · base ${eur(tb)} · IVA ${eur(tiva)}${tcos?` · costes ${eur(tcos)} · margen <b style="color:var(${tb-tcos>=0?"--ok":"--bad"})">${eurS(r2(tb-tcos))}</b>`:""}</span></div>
  <div class="panel" style="padding:4px 14px">${l.length?l.map(d=>{const c=faCostes(d),cob=d.cobro&&d.cobro.id;return `<div class="row" style="flex-wrap:wrap;gap:8px;align-items:center">
      <span style="min-width:120px"><b>${d.numero?esc(d.numero):`<span class="badge b-pend">Borrador</span>`}</b><br><span class="note">${fmtFecha(d.fecha)}</span></span>
      <span class="grow" style="white-space:normal">${esc(d.cliente&&d.cliente.nombre||"(sin cliente)")}${d.taller?` <span class="note">· ${esc(d.taller)}</span>`:""}<br>
        <span class="note">base ${eur(+d.base||0)} · IVA ${+d.iva||0} % ${eur(+d.cuotaIva||0)}${+d.irpf?` · ret. ${eur(+d.ret||0)}`:""}${c?` · costes ${eur(c)} · margen <b style="color:var(${(+d.base||0)-c>=0?"--ok":"--bad"})">${eurS(r2((+d.base||0)-c))}</b>`:""}</span></span>
      <b style="min-width:80px;text-align:right">${eur(+d.total||0)}</b>
      ${d.estado==="anulada"?`<span class="badge b-no">Anulada</span>`:d.estado==="emitida"?`<span class="badge ${cob?"b-si":"b-pend"}">${cob?"Cobrada":"Pendiente de cobro"}</span>`:""}
      <span style="display:flex;gap:4px"><button class="btn small" data-fa="abrir" data-id="${esc(d.id)}">${d.estado==="borrador"?"Seguir":"Abrir"}</button><button class="btn small" data-fa="ver" data-id="${esc(d.id)}">Ver / PDF</button></span></div>`}).join(""):`<div class="empty">No hay facturas en ${esc(FA.anio)}.</div>`}</div>
  <details class="panel" style="padding:10px 14px;margin-top:10px"><summary><b>Datos del emisor</b> <span class="note">· salen en todas las facturas</span></summary>
    <div class="r2" style="margin-top:8px">${[["comercial","Nombre comercial"],["nombre","Titular"],["nif","NIF"],["dir","Dirección"],["cp","C.P."],["pob","Población"],["prov","Provincia"],["iban","IBAN para cobrar"],["tel","Teléfono"],["email","Correo"],["serie","Serie de las facturas"]].map(([k,t])=>`<label class="f">${t}<input type="text" data-faem="${k}" value="${esc(E[k]||"")}"></label>`).join("")}</div>
    <button class="btn small primary" data-fa="emisor" style="margin-top:8px">Guardar datos del emisor</button>
    <p class="note" style="margin:6px 0 0">La serie («${esc(E.serie||"T")}») se usa para numerar: ${esc(faNumero(E.serie||"T",todayISO().slice(0,4),1))}, …/0002… Cada año empieza en 1. Que sea distinta de las de Argos.</p></details>`}
function vFacturaEd(f){const T=faTotales(f),bloq=f.estado!=="borrador",dis=bloq?"disabled":"",c=f.cliente||{},cos=faCostes(f);
  const clientes=[...new Map(FA.docs.filter(d=>d.cliente&&d.cliente.nombre).map(d=>[d.cliente.nombre,d.cliente])).values()];
  const movsG=movsTodos().filter(m=>m.importe<0&&String(m.fv||"")>=sumaDias(todayISO(),-200)).sort((a,b)=>String(b.fv).localeCompare(String(a.fv)));
  const movsI=movsTodos().filter(m=>m.importe>0&&["transf","otrosing","talleres","pend"].includes(m.cat||"pend")&&String(m.fv||"")>=String(f.fecha||"")).sort((a,b)=>Math.abs(a.importe-T.total)-Math.abs(b.importe-T.total));
  const nomMeses=[...new Set(NM.docs.filter(d=>d.tipo==="nomina").map(d=>d.mes))].sort().reverse();
  const fc=(i,x)=>{const sel=(k,opts,v)=>`<select data-fac="${i}|${k}">${opts.map(o=>`<option value="${esc(o[0])}" ${String(o[0])===String(v)?"selected":""}>${esc(o[1])}</option>`).join("")}</select>`;
    let det="";if(x.tipo==="horas")det=`${sel("profe",FICH_PROFES().concat([EV_PROFE]).map(p=>[p,p]),x.profe)} <input type="text" inputmode="decimal" data-fac="${i}|horas" value="${esc(x.horas??"")}" placeholder="horas" style="width:70px"> h × <input type="text" inputmode="decimal" data-fac="${i}|precio" value="${esc(x.precio??10)}" style="width:70px"> €/h`;
    else if(x.tipo==="nomina")det=`${sel("profe",FICH_PROFES().map(p=>[p,p]),x.profe)} ${sel("mes",nomMeses.map(m=>[m,mesTxt(m)]),x.mes)} <input type="text" inputmode="decimal" data-fac="${i}|pct" value="${esc(x.pct??"")}" placeholder="%" style="width:60px"> % de su nómina`;
    else if(x.tipo==="gasto")det=`${sel("mov",[["","Elige un gasto del banco…"],...movsG.map(m=>[m.mes+"|"+m.id,`${fmtFecha(m.fv)} · ${String(m.concepto).slice(0,50)} · ${eur(-m.importe)}`])],x.mov?x.mov.mes+"|"+x.mov.id:"")} <input type="text" inputmode="decimal" data-fac="${i}|imp" value="${esc(x.imp??"")}" placeholder="€ que le tocan" style="width:110px"> €`;
    else det=`<input type="text" data-fac="${i}|d" value="${esc(x.d||"")}" placeholder="Qué es" style="width:220px"> <input type="text" inputmode="decimal" data-fac="${i}|imp" value="${esc(x.imp??"")}" placeholder="€" style="width:90px"> €`;
    return `<div class="row" style="flex-wrap:wrap;gap:6px;align-items:center"><span class="badge b-off">${{horas:"Horas de profesora",nomina:"Parte de una nómina",gasto:"Gasto del banco",otro:"Otro coste"}[x.tipo]}</span>${det}<b style="margin-left:auto">${eur(faCoste(x))}</b><button class="btn small" data-fa="cosquitar" data-i="${i}" aria-label="Quitar">×</button></div>`};
  return `<div id="fa-ed"><div class="bar"><h2>${f.numero?`Factura ${esc(f.numero)}`:"Nueva factura (borrador)"}</h2><span class="legend"><button class="btn" data-fa="volver">← Volver</button></span></div>
  ${bloq?`<p class="note" style="margin-top:0">${f.estado==="anulada"?"Factura anulada.":"Emitida: los datos de la factura ya no se pueden cambiar (si hay un error, se anula y se hace otra). Los costes y el cobro sí."}</p>`:""}
  <div class="panel" style="padding:12px 14px"><div class="r2">
    <label class="f">Taller o servicio (para ti)<input type="text" data-fa1="taller" value="${esc(f.taller||"")}" ${dis} placeholder="Ej.: Taller de técnicas de estudio · Ayto. Chiclana"></label>
    <label class="f">Fecha de la factura<input type="date" data-fa1="fecha" value="${esc(f.fecha||"")}" ${dis}></label></div>
    <b style="display:block;margin-top:10px">Cliente</b><div class="r2">
    <label class="f">Nombre o razón social<input type="text" data-fac1="nombre" list="fa-cl" value="${esc(c.nombre||"")}" ${dis}><datalist id="fa-cl">${clientes.map(x=>`<option value="${esc(x.nombre)}">`).join("")}</datalist></label>
    <label class="f">CIF/NIF<input type="text" data-fac1="cif" value="${esc(c.cif||"")}" ${dis}></label>
    <label class="f">Dirección<input type="text" data-fac1="dir" value="${esc(c.dir||"")}" ${dis}></label>
    <label class="f">C.P. y población<span style="display:flex;gap:6px"><input type="text" data-fac1="cp" value="${esc(c.cp||"")}" ${dis} style="width:80px"><input type="text" data-fac1="pob" value="${esc(c.pob||"")}" ${dis}></span></label></div>
    <b style="display:block;margin-top:10px">Conceptos</b>
    ${(f.lineas||[]).map((l,i)=>`<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><input type="text" data-fal="${i}|d" value="${esc(l.d||"")}" placeholder="Descripción" style="flex:3 1 260px" ${dis}><input type="text" inputmode="decimal" data-fal="${i}|c" value="${esc(l.c??1)}" style="width:70px" title="Cantidad" ${dis}><span class="note">×</span><input type="text" inputmode="decimal" data-fal="${i}|p" value="${esc(l.p??"")}" placeholder="Precio €" style="width:100px" ${dis}><b style="min-width:80px;text-align:right">${eur(r2((+l.c||0)*(+l.p||0)))}</b>${bloq?"":`<button class="btn small" data-fa="linquitar" data-i="${i}" aria-label="Quitar">×</button>`}</div>`).join("")}
    ${bloq?"":`<button class="btn small" data-fa="linadd" style="margin-top:6px">+ Añadir concepto</button>`}
    <div class="r2" style="margin-top:10px"><label class="f">IVA<select data-fa1="iva" ${dis}>${[21,10,4,0].map(v=>`<option value="${v}" ${+f.iva===v?"selected":""}>${v?v+" %":"Exenta (0 %)"}</option>`).join("")}</select></label>
      <label class="f">Retención IRPF<select data-fa1="irpf" ${dis}>${[0,7,15,19].map(v=>`<option value="${v}" ${+f.irpf===v?"selected":""}>${v?v+" %":"Sin retención"}</option>`).join("")}</select></label></div>
    ${+f.iva?"":`<label class="f">Motivo de la exención (sale en la factura)<input type="text" data-fa1="exento" value="${esc(f.exento||FA_EXENTA)}" ${dis}></label>`}
    <div class="r2"><label class="f">Forma de pago<input type="text" data-fap="forma" value="${esc(f.pago&&f.pago.forma||"")}" ${dis}></label><label class="f">IBAN<input type="text" data-fap="iban" value="${esc(f.pago&&f.pago.iban||"")}" ${dis}></label><label class="f">Vencimiento<input type="date" data-fap="venc" value="${esc(f.pago&&f.pago.venc||"")}" ${dis}></label></div>
    <label class="f">Notas (salen en la factura)<input type="text" data-fa1="notas" value="${esc(f.notas||"")}" ${dis}></label>
    <div style="text-align:right;margin-top:8px">Base <b>${eur(T.base)}</b> · IVA ${eur(T.cuotaIva)}${+f.irpf?` · retención −${eur(T.ret)}`:""} · <b style="font-size:16px">Total ${eur(T.total)}</b></div>
    <div class="row" style="gap:6px;justify-content:flex-end;border:0">${bloq?"":`<button class="btn" data-fa="guardar">Guardar borrador</button><button class="btn primary" data-fa="emitir">Emitir factura</button>`}<button class="btn" data-fa="vered">Ver / PDF</button>${f.estado==="emitida"?`<button class="btn small" data-fa="anular" style="color:var(--bad)">Anular</button>`:""}${f.estado==="borrador"&&f.id?`<button class="btn small" data-fa="borrar" style="color:var(--bad)">Borrar borrador</button>`:""}</div></div>
  <div class="panel" style="padding:12px 14px;margin-top:10px"><b>Costes de este taller</b> <span class="note">· no salen en la factura; sirven para ver el margen</span>
    ${(f.costes||[]).map((x,i)=>fc(i,x)).join("")||`<p class="note">Sin costes asignados todavía.</p>`}
    <div class="row" style="gap:6px;flex-wrap:wrap;border:0"><button class="btn small" data-fa="cosadd" data-t="horas">+ Horas de profesora</button><button class="btn small" data-fa="cosadd" data-t="nomina">+ Parte de una nómina</button><button class="btn small" data-fa="cosadd" data-t="gasto">+ Material u otro gasto del banco</button><button class="btn small" data-fa="cosadd" data-t="otro">+ Otro coste</button></div>
    <div style="text-align:right">Costes <b>${eur(cos)}</b> · Margen (base − costes) <b style="font-size:16px;color:var(${T.base-cos>=0?"--ok":"--bad"})">${eurS(r2(T.base-cos))}</b></div>
    ${(f.costes||[]).length?`<div style="text-align:right"><button class="btn small primary" data-fa="guardarcos">Guardar costes</button></div>`:""}</div>
  ${f.estado==="emitida"?`<div class="panel" style="padding:12px 14px;margin-top:10px"><b>Cobro</b>
    ${f.cobro&&f.cobro.id?`<p>Cobrada: ${fmtFecha(f.cobro.fecha)} · ${eur(+f.cobro.imp||0)} <button class="btn small" data-fa="cobroquitar">Quitar</button></p>`
      :`<label class="f">Ingreso del banco<select id="fa-cobro"><option value="">Elige el ingreso…</option>${movsI.slice(0,40).map(m=>`<option value="${esc(m.mes+"|"+m.id)}">${fmtFecha(m.fv)} · ${esc(String(m.concepto).slice(0,60))} · ${eur(m.importe)}${Math.abs(m.importe-T.total)<0.01?" ← mismo importe":""}</option>`).join("")}</select></label><button class="btn small primary" data-fa="cobrar" style="margin-top:6px">Marcar cobrada</button>`}</div>`:""}</div>`}
const faSincronizar=()=>{const f=FA.ed;if(!f)return;document.querySelectorAll("#fa-ed [data-fa1]").forEach(i=>{f[i.dataset.fa1]=i.value});
  document.querySelectorAll("#fa-ed [data-fac1]").forEach(i=>{f.cliente[i.dataset.fac1]=i.value});
  document.querySelectorAll("#fa-ed [data-fap]").forEach(i=>{f.pago=f.pago||{};f.pago[i.dataset.fap]=i.value});
  document.querySelectorAll("#fa-ed [data-fal]").forEach(i=>{const [n,k]=i.dataset.fal.split("|");const l=f.lineas[+n];if(l)l[k]=k==="d"?i.value:(gtNum(i.value)??i.value)});
  document.querySelectorAll("#fa-ed [data-fac]").forEach(i=>{const [n,k]=i.dataset.fac.split("|");const x=f.costes[+n];if(!x)return;
    if(k==="mov"){const [m,id]=i.value.split("|");const mv=movsTodos().find(y=>y.mes===m&&y.id===id);x.mov=mv?{mes:m,id,concepto:String(mv.concepto).slice(0,80),fv:mv.fv,importe:mv.importe}:null;if(mv&&(x.imp===""||x.imp==null))x.imp=r2(-mv.importe)}
    else x[k]=["profe","mes","d"].includes(k)?i.value:(gtNum(i.value)??i.value)});
  f.iva=+f.iva||0;f.irpf=+f.irpf||0};
document.addEventListener("change",e=>{const t=e.target;if(!t||!gbVer())return;
  if(t.id==="fa-anio"){FA.anio=t.value;render()}
  else if(t.closest&&t.closest("#fa-ed")&&(t.matches("select")||t.dataset.fal||t.dataset.fac)){faSincronizar();render()}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-fa]");if(!t||!gbVer())return;e.preventDefault();const act=t.dataset.fa;
  if(FA.ed&&act!=="volver")faSincronizar();const f=FA.ed;
  if(act==="semanal"){GT.fac=true;const t=document.getElementById("t-tarifas");if(t)t.click();scrollTo(0,0);return}
  if(act==="nueva"){FA.ed=faNueva();render();scrollTo(0,0)}
  else if(act==="abrir"){const d=FA.docs.find(x=>x.id===t.dataset.id);if(d){FA.ed=JSON.parse(JSON.stringify(d));render();scrollTo(0,0)}}
  else if(act==="ver"){const d=FA.docs.find(x=>x.id===t.dataset.id);if(d)faAbrir(d)}
  else if(act==="vered")faAbrir(f);
  else if(act==="volver"){FA.ed=null;render()}
  else if(act==="linadd"){f.lineas.push({d:"",c:1,p:""});render()}
  else if(act==="linquitar"){f.lineas.splice(+t.dataset.i,1);if(!f.lineas.length)f.lineas.push({d:"",c:1,p:""});render()}
  else if(act==="cosadd"){const tp=t.dataset.t;f.costes=f.costes||[];f.costes.push(tp==="horas"?{tipo:tp,profe:FICH_PROFES()[0],horas:"",precio:PRECIO_HORA_EXTRA_PROFE}:tp==="nomina"?{tipo:tp,profe:FICH_PROFES()[0],mes:(NM.docs.filter(d=>d.tipo==="nomina").map(d=>d.mes).sort().pop())||"",pct:""}:{tipo:tp,imp:""});render()}
  else if(act==="cosquitar"){f.costes.splice(+t.dataset.i,1);render()}
  else if(act==="guardar"||act==="guardarcos"){if(await faGuardar(f)){toast("Guardado");render()}}
  else if(act==="emitir"){const T=faTotales(f);if(!f.cliente.nombre||!f.cliente.cif){toast("Falta el nombre y el CIF del cliente");return}if(!(T.base>0)){toast("Pon al menos un concepto con precio");return}if(!f.fecha){toast("Falta la fecha");return}
    if(!t.dataset.ok){t.dataset.ok="1";t.textContent="¿Emitir? Ya no se podrá cambiar. Pulsa otra vez";setTimeout(()=>{if(t.isConnected){delete t.dataset.ok;t.textContent="Emitir factura"}},5000);return}
    const E=faEmisor(),serie=E.serie||"T",anio=String(f.fecha).slice(0,4),n=faSiguiente(serie,anio);
    /* la fecha no puede ser anterior a la de la última factura emitida de la serie */
    const ult=FA.docs.filter(d=>d.estado!=="borrador"&&d.serie===serie&&String(d.anio)===anio).sort((a,b)=>(+b.n||0)-(+a.n||0))[0];
    if(ult&&String(f.fecha)<String(ult.fecha)){toast(`La fecha no puede ser anterior a la de la ${ult.numero} (${fmtFecha(ult.fecha)})`);delete t.dataset.ok;t.textContent="Emitir factura";return}
    if(await faGuardar(f,{estado:"emitida",serie,anio,n,numero:faNumero(serie,anio,n),emisor:E,emitida:nowISO()})){FA.ed=null;toast("Factura "+faNumero(serie,anio,n)+" emitida");render()}}
  else if(act==="anular"){if(!t.dataset.ok){t.dataset.ok="1";t.textContent="¿Anular? Pulsa otra vez";setTimeout(()=>{if(t.isConnected){delete t.dataset.ok;t.textContent="Anular"}},4000);return}
    if(await faGuardar(f,{estado:"anulada",anulada:nowISO()})){FA.ed=null;toast("Factura anulada: el número se conserva");render()}}
  else if(act==="borrar"){if(!t.dataset.ok){t.dataset.ok="1";t.textContent="¿Borrar? Pulsa otra vez";return}try{await S.db.doc("facturasTaller/"+f.id).delete();FA.ed=null;toast("Borrador borrado");render()}catch(_){toast("No se ha podido borrar")}}
  else if(act==="cobrar"){const v=($("#fa-cobro")||{}).value;if(!v){toast("Elige el ingreso");return}const [m,id]=v.split("|"),mv=movsTodos().find(y=>y.mes===m&&y.id===id);if(!mv)return;
    if(await faGuardar(f,{cobro:{mes:m,id,fecha:mv.fv,imp:mv.importe}})){f.cobro={mes:m,id,fecha:mv.fv,imp:mv.importe};
      try{await S.db.doc("banco/"+m).update({["movs."+id+".cat"]:"talleres",["movs."+id+".nota"]:"Factura "+(f.numero||"")})}catch(_){}
      toast("Factura cobrada");render()}}
  else if(act==="cobroquitar"){if(await faGuardar(f,{cobro:null})){f.cobro=null;render()}}
  else if(act==="emisor"){const d={};document.querySelectorAll("[data-faem]").forEach(i=>{d[i.dataset.faem]=i.value.trim()});try{await S.db.doc("config/facturacion").set(d);FA.cfg=d;toast("Datos del emisor guardados")}catch(_){toast("No se ha podido guardar")}}});
/* Asesoría: facturas emitidas del periodo (para el IVA trimestral) y libro de facturas emitidas en Excel */
function vFacturasAse(){faEscuchar();if(!FA.ok||FA.err)return "";const key=AS.mes||"",ms=/-T\d$/.test(key)?mesesTrim(key):[key];
  const l=FA.docs.filter(d=>d.estado!=="borrador"&&ms.includes(String(d.fecha||"").slice(0,7))).sort((a,b)=>String(a.numero).localeCompare(String(b.numero)));if(!l.length)return "";
  const em=l.filter(d=>d.estado==="emitida"),S1=k=>r2(em.reduce((s,d)=>s+(+d[k]||0),0));
  return `<div class="panel" style="padding:12px 14px;margin-top:12px"><div class="bar" style="margin:0"><b>Facturas emitidas (talleres y servicios a entidades)</b><span class="legend noprint"><button class="btn small" data-faase="xls">Libro de facturas emitidas (Excel)</button></span></div>
    <table class="ft" style="width:100%;min-width:0;font-size:13px;margin-top:6px"><thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>CIF</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Cuota IVA</th><th style="text-align:right">Retención</th><th style="text-align:right">Total</th><th class="noprint"></th></tr></thead><tbody>
    ${l.map(d=>`<tr${d.estado==="anulada"?' style="opacity:.6;text-decoration:line-through"':""}><td>${esc(d.numero)}</td><td>${fmtFecha(d.fecha)}</td><td>${esc(d.cliente&&d.cliente.nombre||"")}</td><td>${esc(d.cliente&&d.cliente.cif||"")}</td><td style="text-align:right">${eur(+d.base||0)}</td><td style="text-align:right">${+d.iva||0} %</td><td style="text-align:right">${eur(+d.cuotaIva||0)}</td><td style="text-align:right">${eur(+d.ret||0)}</td><td style="text-align:right">${eur(+d.total||0)}</td><td class="noprint"><button class="btn small" data-faase="ver" data-id="${esc(d.id)}">Ver</button></td></tr>`).join("")}
    <tr style="font-weight:700"><td colspan="4">Total (sin anuladas)</td><td style="text-align:right">${eur(S1("base"))}</td><td></td><td style="text-align:right">${eur(S1("cuotaIva"))}</td><td style="text-align:right">${eur(S1("ret"))}</td><td style="text-align:right">${eur(S1("total"))}</td><td class="noprint"></td></tr></tbody></table></div>`}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-faase]");if(!t||!(S.role==="ase"||gbVer()))return;e.preventDefault();
  if(t.dataset.faase==="ver"){const d=FA.docs.find(x=>x.id===t.dataset.id);if(d)faAbrir(d)}
  else if(t.dataset.faase==="xls"){try{await cargarJs(XLSXJS)}catch(_){toast("No se ha podido cargar el Excel");return}const key=AS.mes||"",ms=/-T\d$/.test(key)?mesesTrim(key):[key];
    const l=FA.docs.filter(d=>d.estado!=="borrador"&&ms.includes(String(d.fecha||"").slice(0,7))).sort((a,b)=>String(a.numero).localeCompare(String(b.numero)));
    const rows=[["Número","Fecha","Cliente","CIF/NIF","Base imponible","% IVA","Cuota IVA","% Retención","Retención","Total","Estado"],...l.map(d=>[d.numero,fmtFecha(d.fecha),d.cliente&&d.cliente.nombre||"",d.cliente&&d.cliente.cif||"",+d.base||0,+d.iva||0,+d.cuotaIva||0,+d.irpf||0,+d.ret||0,+d.total||0,d.estado==="anulada"?"Anulada":"Emitida"])];
    const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,window.XLSX.utils.aoa_to_sheet(rows),"Facturas emitidas");window.XLSX.writeFile(wb,`facturas-emitidas-${key}.xlsx`)}});

/* ============================================================================================
   Pendientes de dirección (14/11/2026, petición de la titular): una sola pestaña con todo lo que tiene que hacer dirección
   (banco, documentos, descuadres, facturación, asesoría, recibos, altas, preinscripciones…). Lo que es de las profesoras
   (pasar lista, faltas, recuperaciones) sigue en sus pestañas. Cada aviso lleva a donde se resuelve; no se duplica la lógica:
   los avisos de alumnos y recibos son los mismos paneles de la pestaña Recibos y Alumnos.
   ============================================================================================ */
const PD={cache:null,t:0},PD_CAJA_DESDE="2026-12-31";
const pdTry=(f,def)=>{try{return f()}catch(e){console.warn("pendientes",e);return def}};
function pdTarjetas(){gbEscuchar();const hoy=todayISO(),hoyM=hoy.slice(0,7),L=[],add0=(g,tit,txt,ir,extra)=>L.push({g,tit,txt,ir,...(extra||{})});
  /* mientras no han llegado los datos del banco, no se dan avisos que dependen de ellos (saldrían falsos) */
  const add=(g,...r)=>{if(g!=="rec"&&!GB.ok)return;add0(g,...r)};
  const movs=pdTry(()=>movsTodos(),[]),ini=docDesde(),cerrados=pdTry(()=>mesesBanco().filter(m=>m>=mesInicio()&&m<hoyM).sort(),[]);
  /* Banco y gastos */
  pdTry(()=>{const ult=movs.filter(m=>!esCaja(m)).map(m=>String(m.fv||m.fo||"")).filter(Boolean).sort().pop();
    if(!ult)add("banco","Sube el extracto del banco","Todavía no hay movimientos.",{v:"gastos"});
    else{const d=Math.round((new Date(hoy+"T12:00:00")-new Date(ult+"T12:00:00"))/864e5);if(d>7)add("banco","Sube el extracto del banco",`El último movimiento subido es del ${fmtFecha(ult)} (hace ${d} días). Sin él no cuadran ni los cobros ni los gastos.`,{v:"gastos"})}});
  pdTry(()=>{const n=movs.filter(m=>(m.cat||"pend")==="pend"&&String(m.fv||m.fo||"")>=ini).length;if(n)add("banco",`${n} movimiento${n===1?"":"s"} del banco sin clasificar`,"Ponles categoría en Gastos (si no, no cuentan en la rentabilidad ni en el informe).",{v:"gastos"})});
  pdTry(()=>{const l=movs.filter(necesitaJust),n=l.length;if(n){const nj=l.filter(m=>faltas(m).j).length,nd=l.filter(m=>faltas(m).d).length;
    add("banco",`${n} gasto${n===1?"":"s"} sin todos sus documentos`,[nj?`${nj} sin justificante del banco`:"",nd?`${nd} sin factura, nómina o TC1`:""].filter(Boolean).join(" · ")+". Súbelos en Gastos → «Subir documentos».",{v:"gastos"})}});
  pdTry(()=>{const n=descPend();if(n)add("banco",`${n} descuadre${n===1?"":"s"} por revisar`,"Diferencias de caja, tarjeta o cobros sin explicar.",{v:"descuadres"})});
  pdTry(()=>{nmEscuchar();if(!NM.sub)return;const conN=new Set(NM.docs.filter(d=>d.tipo==="nomina").map(d=>d.mes));
    const f=cerrados.filter(m=>!conN.has(m)&&sumaDias(sumaDias(m+"-28",5).slice(0,7)+"-01",5)<=hoy);
    if(f.length)add("banco",`Sube las nóminas de ${f.map(mesTxt).join(", ")}`,"El PDF de nóminas de A3 (y el listado de costes). Sin ellas, la rentabilidad no tiene el coste de personal.",{v:"gastos"})});
  /* Caja */
  /* Caja: la titular (14/11/2026) la empieza a llevar completa en enero: el aviso se activa el 31/12/2026 y solo mira días desde esa fecha */
  pdTry(()=>{if(hoy<PD_CAJA_DESDE)return;cajaEscuchar();if(!GC.ok)return;const ab=[...new Set(GC.docs.filter(d=>d.tipo==="apertura"&&d.dia<hoy&&d.dia>=PD_CAJA_DESDE).map(d=>d.dia))].sort().map(d=>estadoCaja(d)).filter(x=>x.abierta);
    if(ab.length)add("caja",`Caja sin cerrar: ${ab.map(x=>fmtFecha(x.dia).slice(0,5)).join(", ")}`,"Se abrió y no se hizo el cierre (contar el efectivo).",{v:"caja"})});
  /* Facturación (Argos hasta el 31/12) */
  pdTry(()=>{if(hoy>"2027-01-31")return;const C=cuadreArgos(),u=C.filas[C.filas.length-1];
    const sinV=cerrados.filter(m=>!ventasMes(m));if(sinV.length)add("fact",`Sube las facturas de venta de Argos de ${sinV.map(mesTxt).join(", ")}`,"Gastos → «Subir facturas de venta de Argos (PDF)»: el PDF de facturas y el listado.",{v:"gastos"});
    if(u&&u.ac<-0.5)add("fact",`Queda por facturar en Argos: ${eur(-u.ac)}`,`Entró en el banco y no tiene factura${C.sinFac.length?` (${C.sinFac.length} cobro${C.sinFac.length===1?"":"s"} por banco sin factura)`:""}.`,{v:"fac"});
    if(C.efSin>0.5)add("fact",`Efectivo cobrado sin ingresar: ${eur(C.efSin)}`,"Cobrado en contado desde el inicio y no ingresado en el cajero. Se factura cuando se ingresa.",{v:"fac",info:true})});
  pdTry(()=>{faEscuchar();if(!FA.ok)return;const b=FA.docs.filter(d=>d.estado==="borrador").length,nc=FA.docs.filter(d=>d.estado==="emitida"&&!d.cobro);
    if(b)add("fact",`${b} factura${b===1?"":"s"} de talleres en borrador`,"Sin emitir todavía.",{v:"facturacion"});
    if(nc.length)add("fact",`${nc.length} factura${nc.length===1?"":"s"} de talleres sin cobrar`,`${eur(r2(nc.reduce((s,d)=>s+(+d.total||0),0)))} pendientes.`,{v:"facturacion",info:true})});
  /* Asesoría */
  pdTry(()=>{aseEscuchar();if(!GB.ase)return;for(const m of cerrados){const x=GB.ase[m];
    if(!x){add("ase",`Envía ${mesTxt(m)} a la asesoría`,"Informe del mes → «Enviar a la asesoría» (revisa antes documentos y movimientos sin clasificar).",{v:"inf",mes:m});continue}
    const c=aseCambios(m);if(c&&c.length)add("ase",`Lo enviado a la asesoría de ${mesTxt(m)} está atrasado`,`${c.length} cambio${c.length===1?"":"s"} desde el envío. Vuelve a enviarlo.`,{v:"inf",mes:m})}});
  /* Impuestos que ha indicado la asesoría: próximos cargos (para saber) y los que paga el centro (tarea) */
  pdTry(()=>{imEscuchar();if(!IM.ok)return;for(const x of IM.docs){if(!(+x.importe>0)||imCargo(x))continue;const md=(IMP_MODELOS.find(y=>y[0]===x.modelo)||[x.modelo,"Modelo "+x.modelo])[1];
    if(x.fecha&&x.fecha<sumaDias(hoy,-15))continue;
    if(x.forma==="centro")add0("ase",`Pagar ${md.toLowerCase()} (${x.modelo}) del ${periodoTxt(x.tri)}: ${eur(+x.importe)}`,`Lo paga el centro${x.fecha?`, antes del ${fmtFecha(x.fecha)}`:""}. La asesoría ha subido el PDF${x.pdf?"":" (aún no)"}.`,{v:"inf",mes:mesesTrim(x.tri)[2]});
    else add0("ase",`${md} (${x.modelo}) del ${periodoTxt(x.tri)}: ${eur(+x.importe)}`,`Domiciliado: se cargará en la cuenta${x.fecha?` el ${fmtFecha(x.fecha)}`:""}. Que haya saldo ese día.`,{v:"inf",mes:mesesTrim(x.tri)[2],info:true})}});
  /* Seguridad (14/11/2026): copia semanal y claves débiles del equipo */
  pdTry(()=>{const u=S.copias&&S.copias.ultima,d=u?diasDesde(u):null;if(S.copias!==undefined&&(!u||d>7))add0("seg",u?`Haz la copia de seguridad (la última, hace ${d} días)`:"Haz la primera copia de seguridad","Accesos → «Descargar copia». Guárdala fuera del ordenador (memoria USB o nube cifrada): lleva datos personales y las claves.",{v:"accesos"})});
  pdTry(()=>{const F=window.__fb;if(!F)return;const l=F.claves().filter(([,k])=>claveDebil(k));if(l.length)add0("seg",`${l.length} clave${l.length===1?"":"s"} del equipo débil${l.length===1?"":"es"}`,`${l.map(([u,k])=>k.rol==="dir"?(k.nombre||"Dirección"):k.rol==="ase"?(k.nombre||"Asesoría"):k.rol==="mos"?(k.nombre||"Mostrador"):(k.profe||u)).join(", ")}. En Accesos, «Nueva clave» (o «Cambiar mi clave» la tuya) pone una de 12 caracteres.`,{v:"accesos"})});
  /* Horas extra de las profesoras sin recibo (este mes y el anterior) */
  pdTry(()=>{const ms=[sumaDias(hoyM+"-01",-1).slice(0,7),hoyM];let n=0;const q=[];
    for(const m of ms)for(const p of FICH_PROFES()){const x=horasExtraProfe(p,m);if(x.sinRec){n+=x.sinRec;q.push(p)}}
    if(n)add("rec",`${n} hora${n===1?"":"s"} extra de profesoras sin recibo`,`${[...new Set(q)].join(", ")}. Hazles el recibo o márcalas como cobradas en Argos.`,{v:"fichajes"})});
  /* Recibos atrasados y conflictos (datos de la app) */
  pdTry(()=>{const s=new Set();for(const [id,a] of sortedAlumnos())if((a.recibos||[]).some(r=>atrasado(r))&&!esperaBeca(a))s.add(id);
    if(s.size)add("rec",`${s.size} alumno${s.size===1?"":"s"} con recibos atrasados`,"Recibos de meses anteriores sin pagar. Desde la lista puedes avisarles por WhatsApp.",{v:"atrasados"})});
  pdTry(()=>{const n=misConflictos().length;if(n)add("rec",`${n} conflicto${n===1?"":"s"} de horario`,"Clases que se pisan o profesoras con dos cosas a la vez.",{v:"conflictos"})});
  return L}
/* Avisos de alumnos y recibos: los mismos paneles que en Recibos y Alumnos (con sus botones). Solo los que piden algo. */
function pdPaneles(){const mes=todayISO().slice(0,7),out=[];
  for(const [k,f] of [["pre",()=>vPreLista()],["msg",()=>vMensajesDir()],["altas",()=>vAltasArgos()],["sinrec",()=>vSinRecibo()],["nocuad",()=>vNoCuadran(mes)],["extras",()=>vExtrasDir()],["sinal",()=>vSinAlumno()],["avisos",()=>typeof vAvisosPend==="function"?vAvisosPend():""],["hxwa",()=>typeof vHxEnviar==="function"?vHxEnviar():""]]){
    const h=pdTry(f,"");if(h&&/class="aviso (pend|no)\b/.test(h))out.push(h)}
  return out}
function pdContar(){if(S.role!=="dir"||esMos())return 0;if(PD.cache&&Date.now()-PD.t<20000)return PD.cache;
  const n=pdTarjetas().filter(x=>!x.info).length+pdPaneles().length;PD.cache=n;PD.t=Date.now();return n}
function vPendientes(){if(S.role!=="dir"||esMos())return `<div class="empty">Solo dirección.</div>`;
  const T=pdTarjetas(),P=pdPaneles();PD.cache=T.filter(x=>!x.info).length+P.length;PD.t=Date.now();
  const G=[["banco","Banco, gastos y documentos"],["caja","Caja"],["fact","Facturación"],["ase","Asesoría"],["rec","Recibos, horas extra y horarios"],["seg","Seguridad"]];
  const tarjeta=x=>`<div class="row" style="flex-wrap:wrap;gap:8px;padding:10px 12px;border-top:1px solid var(--line);align-items:center">
      <span class="grow" style="min-width:220px"><b${x.info?' style="font-weight:600"':""}>${esc(x.tit)}</b>${x.info?` <span class="badge b-off">para saber</span>`:""}<br><span class="note">${esc(x.txt)}</span></span>
      <button class="btn small${x.info?"":" primary"}" data-pd="${esc(x.ir.v)}"${x.mes?` data-mes="${esc(x.mes)}"`:""}>Ir</button></div>`;
  const bloques=G.map(([g,t])=>{const l=T.filter(x=>x.g===g);return l.length?`<div class="panel" style="padding:0;margin-bottom:12px;overflow:hidden"><div style="padding:10px 12px"><b>${t}</b></div>${l.map(tarjeta).join("")}</div>`:""}).join("");
  const nada=!T.length&&!P.length;
  return `<div class="bar"><h2>Pendientes de dirección</h2><span class="legend note">${nada?"":`${PD.cache} cosa${PD.cache===1?"":"s"} por hacer`}</span></div>
  <p class="note" style="margin-top:0">Todo lo que tienes que hacer tú, en un solo sitio. Lo que es de las profesoras (pasar lista, faltas, recuperaciones, cambios de clase) sigue en sus pestañas. Al resolver cada cosa, desaparece de aquí.</p>
  ${nada?`<div class="panel"><div class="empty">✓ Todo al día.</div></div>`:""}
  ${bloques}
  ${P.length?`<h3 style="margin:14px 0 6px">Alumnos, altas y recibos</h3>${P.join("")}`:""}`}
document.addEventListener("click",e=>{const t=e.target.closest&&e.target.closest("[data-pd]");if(!t||S.role!=="dir")return;e.preventDefault();const v=t.dataset.pd;
  if(v==="atrasados"){S.view="recibos";S.recFil="atrasados"}
  else if(v==="inf"){S.view="gastos";GB.inf=true;GB.rent=false;GB.verAse="";if(t.dataset.mes)GB.mes=t.dataset.mes}
  else if(v==="fac"){S.view="tarifas";GT.fac=true}
  else if(v==="gastos"){S.view="gastos";GB.inf=false;GB.rent=false}
  else S.view=v;
  PD.cache=null;render();scrollTo(0,0)});

/* 14/11/2026: buscador de cursos en Tarifas. Filtra al escribir sin volver a pintar la página (no se pierde el cursor);
   todas las palabras tienen que estar en el nombre, sin tildes ni espacios («prim 2h» → PRIMARIA 2H/SEMANA). */
document.addEventListener("input",e=>{const t=e.target;if(!t||t.id!=="gt-q")return;GT.q=t.value;
  const ws=nzC(String(t.value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")).replace(/[^A-Z0-9 ]/g," ").split(/\s+/).filter(Boolean);
  document.querySelectorAll("tr[data-gtn]").forEach(tr=>{const n=tr.dataset.gtn||"";tr.style.display=ws.every(w=>n.includes(w))?"":"none"})});

/* 14/11/2026: clases de prueba de gente que no se apuntó (Bizum o transferencia marcados «Clase de prueba»). Si años después
   se apunta alguien con ese nombre o ese teléfono, su ficha lo recuerda. */
function pruebasDe(a){if(!a||!gbVer()||!GB.ok)return [];const np=new Set(NORM(a.nombre).split(/[^A-Z]+/).filter(w=>w.length>=3)),tels=new Set([a.tel,a.tel2,...((a.inscripciones||[]).map(i=>i&&i.tel))].map(x=>digitos(x||"").slice(-9)).filter(x=>x.length===9));
  return movsTodos().filter(m=>m.enl&&m.enl.sinAl==="prueba").filter(m=>{const w=NORM(m.enl.nom).split(/[^A-Z]+/).filter(x=>x.length>=3);return (m.enl.tel&&tels.has(m.enl.tel))||(w.length>=2&&w.filter(x=>np.has(x)).length>=2)})}
function vPruebasAl(a){const l=pdTry(()=>pruebasDe(a),[]);if(!l.length)return "";
  return `<div class="aviso info" style="display:block;margin:6px 0">Hizo ${l.length===1?"una clase de prueba":l.length+" clases de prueba"} sin apuntarse: ${l.map(m=>`${fmtFecha(m.fv)} (${eur(m.importe)} por ${m.cat==="bizum"?"Bizum":"transferencia"}${m.enl.nom?", a nombre de "+esc(m.enl.nom):""})`).join(" · ")}.</div>`}

/* ============================================================================================
   Impuestos y retenciones del alquiler (14/11/2026, titular). Para ahorrar la llamada de la asesoría antes de cada trimestre:
   1) Retenciones del alquiler (modelo 115): de cada pago del alquiler con retención se saca la base y la retención
      (pagado = base + IVA − retención ⇒ base = pagado ÷ (1 + IVA − retención)); con su factura, para que la asesoría lo compruebe.
      Qué pagos llevan retención y con qué % lo marca dirección (config/banco.alqRet = {<clave del concepto>: {iva, ret}}).
   2) Cada trimestre, la asesoría pone en su pestaña, por modelo (115, 130, 303, 111): el importe a pagar, el día del cargo, si lo
      domicilia ella o lo paga el centro, y el PDF del impuesto. impuestos/<AAAA-Tn>-<modelo>. Dirección lo ve en el informe y
      en Pendientes; cuando llega el cargo al banco, el PDF se pone solo como documento de ese movimiento.
   ============================================================================================ */
const IMP_MODELOS=[["115","Retenciones del alquiler","modelo 115"],["130","Pago fraccionado del IRPF","modelo 130"],["303","IVA del trimestre","modelo 303"],["111","Retenciones de las nóminas","modelo 111"]];
const IM={docs:[],ok:false,sub:null,err:"",enl:0};
function imEscuchar(){if(IM.sub||!S.db)return;IM.sub=S.db.collection("impuestos").onSnapshot(s=>{IM.docs=s.docs.map(d=>({id:d.id,...d.data()}));IM.ok=true;IM.err="";imRefrescar()},
  e=>{IM.ok=true;IM.err="No se pueden leer los impuestos: hay que publicar las reglas nuevas en Firebase.";imRefrescar()})}
function imRefrescar(){if(S.role==="ase"){const ae=document.activeElement;if(ae&&/^im-/.test(ae.id||""))return;vAsePintar()}else if(S.role==="dir"&&(S.view==="gastos"||S.view==="pendientes"))gbRefrescar()}
/* --- 1) alquiler --- */
const alqCfg=()=>(GB.cfg&&GB.cfg.alqRet)||{};
function alqRetMes(mes){const c=alqCfg();return movsTodos().filter(m=>m.mes===mes&&m.importe<0&&c[claveMov(m.concepto)]).map(m=>{const x=c[claveMov(m.concepto)],iva=+x.iva||0,ret=+x.ret||0,pag=r2(-m.importe),base=r2(pag/(1+iva/100-ret/100));
  const {d}=docsMov(m);return {fv:m.fv,concepto:m.concepto,quien:m.ordenante?titulo(String(m.ordenante).toLowerCase()):"",pag,base,iva,cuotaIva:r2(base*iva/100),ret,retImp:r2(base*ret/100),doc:d?{id:d.id,n:d.n||""}:null}})}
function vRetAlq(l,dir,mes,key){const cands=dir&&mes?movsTodos().filter(m=>m.mes===mes&&m.importe<0&&m.cat==="alquiler"&&!alqCfg()[claveMov(m.concepto)]):[];
  if(!l.length&&!cands.length)return "";const T=k=>r2(l.reduce((s,x)=>s+x[k],0));
  return `<div class="panel" style="padding:12px 14px;margin:12px 0"><b>Retenciones del alquiler (modelo 115)</b>
    <p class="note" style="margin:2px 0 6px">De cada pago del alquiler se calcula la base y la retención que se ingresa a Hacienda: pagado = base + IVA − retención. ${dir?"":"Las facturas se pueden abrir para comprobarlo."}</p>
    ${l.length?`<table class="ft" style="width:100%;min-width:0;font-size:13px"><thead><tr><th>Fecha</th><th>Pago</th><th style="text-align:right">Pagado</th><th style="text-align:right">Base</th><th style="text-align:right">IVA</th><th style="text-align:right">Retención</th><th>Factura</th></tr></thead><tbody>
    ${l.map(x=>`<tr><td>${fmtFecha(x.fv)}</td><td>${esc(x.concepto)}${x.quien?`<br><span class="note">${esc(x.quien)}</span>`:""}</td><td style="text-align:right">${eur(x.pag)}</td><td style="text-align:right">${eur(x.base)}</td><td style="text-align:right">${eur(x.cuotaIva)} <span class="note">(${x.iva} %)</span></td><td style="text-align:right"><b>${eur(x.retImp)}</b> <span class="note">(${x.ret} %)</span></td><td>${x.doc?`<a href="#" data-blob="${esc(x.doc.id)}">📄 Ver</a>`:`<span class="badge b-pend">falta</span>`}${dir?` <button class="btn small" data-im="alqno" data-c="${esc(claveMov(x.concepto))}" title="Este pago no lleva retención">×</button>`:""}</td></tr>`).join("")}
    <tr style="font-weight:700"><td colspan="2">Total</td><td style="text-align:right">${eur(T("pag"))}</td><td style="text-align:right">${eur(T("base"))}</td><td style="text-align:right">${eur(T("cuotaIva"))}</td><td style="text-align:right">${eur(T("retImp"))}</td><td></td></tr></tbody></table>`:""}
    ${(()=>{/* acumulado del trimestre (lo que irá en el 115) cuando se mira un mes */const k=mes||key;if(!k||/-T\d$/.test(k)){if(!l.length)return "";const fin=k&&todayISO().slice(0,7)<=mesesTrim(k)[2];return `<p style="margin:6px 0 0"><b>Retención del trimestre (modelo 115)${fin?", hasta ahora":""}: ${eur(T("retImp"))}</b>${fin?` <span class="note">(el trimestre aún no ha terminado)</span>`:""}</p>`}
      const tri=trimDe(k),ms=mesesTrim(tri),por=ms.map(m=>[m,dir?pdTry(()=>alqRetMes(m),[]):(((S.role==="ase"?AS.docs:aseDocsDir()).find(d=>d.id===m)||{}).D||{}).alq||[]]).filter(([,x])=>x.length);
      if(!por.length)return "";const tot=r2(por.reduce((s,[,x])=>s+x.reduce((t,y)=>t+y.retImp,0),0));
      return `<p style="margin:6px 0 0"><b>Retención del ${esc(periodoTxt(tri))} (modelo 115), hasta ahora: ${eur(tot)}</b> <span class="note">(${por.map(([m,x])=>`${mesTxt(m)} ${eur(r2(x.reduce((t,y)=>t+y.retImp,0)))}`).join(" + ")}${por.length<3?` · ${3-por.length===1?"falta 1 mes":`faltan ${3-por.length} meses`}`:""})</span></p>`})()}
    ${cands.length?`<div class="noprint" style="margin-top:6px"><span class="note">¿Alguno de estos pagos del alquiler lleva retención?</span> ${cands.map(m=>`<button class="btn small" data-im="alqsi" data-c="${esc(claveMov(m.concepto))}">${esc(m.concepto.slice(0,40))} · ${eur(-m.importe)}</button>`).join(" ")}</div>`:""}</div>`}
/* --- 2) impuestos del trimestre --- */
const imId=(tri,mod)=>`${tri}-${mod}`;
function imCargo(x){/* el cargo en el banco por ese importe, cerca del día indicado */if(!x||!(+x.importe>0)||typeof movsTodos!=="function"||S.role!=="dir")return null;const f=x.fecha||"";
  return movsTodos().find(m=>m.importe<0&&Math.abs(-m.importe-(+x.importe))<0.005&&(m.cat==="impuestos"||/IMPUEST|AEAT|HACIENDA|TRIBUT|IRPF|\bIVA\b/i.test(m.concepto))&&(!f||(m.fv>=sumaDias(f,-6)&&m.fv<=sumaDias(f,12))))||null}
function imInfo(tri,mod){const ms=mesesTrim(tri);
  if(mod==="115"){/* la asesoría (y dirección en «Lo que ve la asesoría») miran lo enviado; dirección en su informe, los datos de ahora */
    const l=S.role==="ase"?((aseVista(tri,AS.docs)||{}).D||{}).alq||[]:GB.verAse?((aseVista(tri,aseDocsDir())||{}).D||{}).alq||[]:ms.flatMap(m=>pdTry(()=>alqRetMes(m),[]));const v=r2(l.reduce((s,x)=>s+x.retImp,0));return l.length?{v,txt:`Según los pagos del alquiler del trimestre: ${eur(v)}`}:null}
  if(mod==="303"||mod==="130"){const em=pdTry(()=>(faEscuchar(),FA.docs.filter(d=>d.estado==="emitida"&&ms.includes(String(d.fecha||"").slice(0,7)))),[]);if(!em.length)return null;
    const S1=k=>r2(em.reduce((s,d)=>s+(+d[k]||0),0));return mod==="303"?{txt:`IVA repercutido en las facturas de talleres: ${eur(S1("cuotaIva"))} (base ${eur(S1("base"))}, ${em.length} factura${em.length===1?"":"s"})`}
      :{txt:`Facturas de talleres: base ${eur(S1("base"))}${S1("ret")?` · retenciones que han practicado los clientes: ${eur(S1("ret"))}`:""}`}}
  return null}
function vImpuestos(tri){imEscuchar();if(!tri)return "";const ase=S.role==="ase";
  if(IM.err)return `<div class="panel" style="padding:12px 14px;margin:12px 0"><b>Impuestos</b><p class="note" style="color:var(--bad)">${esc(IM.err)}</p></div>`;
  const fila=([mod,tit,mm])=>{const x=IM.docs.find(d=>d.id===imId(tri,mod))||null,inf=imInfo(tri,mod),c=imCargo(x),ed=ase;
    const cerrado=todayISO().slice(0,7)>mesesTrim(tri)[2],dif=cerrado&&mod==="115"&&inf&&x&&+x.importe>0&&Math.abs(inf.v-(+x.importe))>0.5;
    const estado=!x||x.importe==null||x.importe===""?`<span class="badge b-off">pendiente de la asesoría</span>`
      :`<b>${eur(+x.importe)}</b>${+x.importe>0?` · ${x.forma==="centro"?"lo paga el centro":"domiciliado, se carga en la cuenta"}${x.fecha?` el <b>${fmtFecha(x.fecha)}</b>`:""}`:" · sin nada que pagar"}${c?` · <span class="badge b-si">cargado el ${fmtFecha(c.fv)}</span>`:""}${x.pdf?` · <a href="#" data-blob="${esc(x.pdf.id)}">📄 ${esc(x.pdf.n||"PDF")}</a>`:""}${x.nota?`<br><span class="note">«${esc(x.nota)}»</span>`:""}`;
    return `<div style="border-top:1px solid var(--line);padding:8px 0"><div class="row" style="flex-wrap:wrap;gap:6px;padding:0;border:0"><span class="grow"><b>${esc(tit)}</b> <span class="note">(${mm})</span></span><span>${estado}</span></div>
      ${inf?`<p class="note" style="margin:2px 0 0">${esc(inf.txt)}${dif?` · <b style="color:var(--warn)">no coincide con el importe indicado</b>`:mod==="115"&&x&&+x.importe>0&&cerrado?" · ✓ coincide":mod==="115"&&!cerrado?" (el trimestre aún no ha terminado)":""}</p>`:""}
      ${ed?`<div class="noprint" style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;margin-top:6px">
        <label class="f" style="flex:0 1 110px;margin:0">Importe a pagar (€)<input id="im-${mod}-imp" inputmode="decimal" value="${x&&x.importe!=null?esc(String(x.importe).replace(".",",")):""}"></label>
        <label class="f" style="flex:0 1 150px;margin:0">Día del cargo<input type="date" id="im-${mod}-f" value="${esc(x&&x.fecha||"")}"></label>
        <label class="f" style="flex:0 1 230px;margin:0">Quién lo paga<select id="im-${mod}-fo"><option value="dom" ${!x||x.forma!=="centro"?"selected":""}>Domiciliado: se carga en la cuenta</option><option value="centro" ${x&&x.forma==="centro"?"selected":""}>Lo paga el centro</option></select></label>
        <label class="f" style="flex:1 1 160px;margin:0">Nota<input id="im-${mod}-n" maxlength="160" value="${esc(x&&x.nota||"")}"></label>
        <label class="btn small" style="cursor:pointer">${x&&x.pdf?"Cambiar PDF":"Subir PDF"}<input type="file" accept=".pdf,application/pdf" data-impdf="${mod}" data-tri="${esc(tri)}" hidden></label>
        <button class="btn small primary" data-im="guardar" data-mod="${mod}" data-tri="${esc(tri)}">Guardar</button></div>`:""}</div>`};
  return `<div class="panel" style="padding:12px 14px;margin:12px 0"><b>Impuestos del ${esc(periodoTxt(tri))}</b>
    <p class="note" style="margin:2px 0 4px">${ase?"Indica en cada modelo el importe a pagar, el día del cargo y quién lo paga, y sube el PDF del impuesto. El centro lo ve al momento.":"Lo indica la asesoría desde su acceso. Cuando llega el cargo al banco, el PDF se adjunta solo a ese movimiento."}</p>
    ${IMP_MODELOS.map(fila).join("")}</div>`}
async function imGuardar(tri,mod,extra){const id=imId(tri,mod),x=IM.docs.find(d=>d.id===id)||{},v=k=>(document.getElementById(`im-${mod}-${k}`)||{}).value;
  const s=String(v("imp")??"").trim(),n=s===""?null:+s.replace(/\s|€/g,"").replace(/\./g,"").replace(",",".");if(s!==""&&isNaN(n)){toast("El importe no es válido");return}
  const d={tri,modelo:mod,importe:n,fecha:v("f")||"",forma:v("fo")==="centro"?"centro":"dom",nota:String(v("n")||"").trim().slice(0,160),pdf:x.pdf||null,...(extra||{}),t:nowISO(),por:quienSoy()};
  try{await S.db.doc("impuestos/"+id).set(d);toast("Guardado")}catch(e){console.warn(e);toast(/perm/i.test(String(e&&((e.fb||"")+" "+e.message)))?"Faltan permisos: hay que publicar las reglas nuevas en Firebase.":"No se ha podido guardar.")}}
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-im]");if(!t)return;const act=t.dataset.im;
  if(act==="guardar"&&S.role==="ase"){e.preventDefault();t.disabled=true;await imGuardar(t.dataset.tri,t.dataset.mod);t.disabled=false;return}
  if((act==="alqsi"||act==="alqno")&&gbVer()){e.preventDefault();const c=t.dataset.c,o={...alqCfg()};
    if(act==="alqsi"){const r=prompt("IVA % y retención % de este alquiler (separados por espacio):","21 19");if(r===null)return;const [iv,rt]=String(r).replace(/%/g,"").trim().split(/[\s,;]+/).map(Number);if(isNaN(iv)||isNaN(rt)){toast("Pon dos números, por ejemplo: 21 19");return}o[c]={iva:iv,ret:rt}}
    else{if(!confirm("¿Este pago no lleva retención?"))return;delete o[c]}
    try{await S.db.doc("config/banco").set({...(GB.cfg||{}),alqRet:o});GB.cfg={...(GB.cfg||{}),alqRet:o};render()}catch(_){toast("No se ha podido guardar.")}}});
document.addEventListener("change",async e=>{const t=e.target;if(!t||!t.dataset||!t.dataset.impdf||S.role!=="ase")return;const f=t.files&&t.files[0];t.value="";if(!f)return;
  try{toast("Subiendo…");const as=await window.claude.use("assets"),r=await as.upload(f,{clase:"impuesto"});await imGuardar(t.dataset.tri,t.dataset.impdf,{pdf:{id:r.id,n:f.name.slice(0,80)}})}
  catch(x){console.warn(x);toast(/perm/i.test(String(x&&((x.fb||"")+" "+x.message)))?"Faltan permisos: hay que publicar las reglas nuevas en Firebase.":"No se ha podido subir el PDF.")}});
/* dirección: cuando el cargo llega al banco, el PDF del impuesto pasa a ser el documento de ese movimiento */
async function imEnlazar(){if(S.role!=="dir"||!GB.ok||!IM.ok||Date.now()-IM.enl<60000)return;IM.enl=Date.now();
  for(const x of IM.docs){if(!x.pdf||!(+x.importe>0))continue;const m=imCargo(x);if(!m||docsMov(m).d)continue;
    const o={id:x.pdf.id,n:x.pdf.n||"",t:nowISO(),tipo:"modelo"};try{await S.db.doc("banco/"+m.mes).update({["movs."+m.id+".doc"]:o});const dd=GB.docs.find(y=>y.id===m.mes);if(dd&&dd.movs[m.id])dd.movs[m.id].doc=o}catch(_){}}}

/* 15/11/2026 (titular): vídeo de ayuda para la asesoría dentro de su apartado (entran una vez al trimestre y no se acuerdan).
   El archivo ayuda-asesoria.mp4 va junto a la app (datos de ejemplo). Se recuerda si lo dejan abierto o cerrado. */
function vAyudaAse(abierto){let o=abierto;try{const v=localStorage.getItem("althea.ayudaAse");if(v!==null)o=v==="1"}catch(_){}
  return `<details class="panel noprint" style="padding:10px 14px;margin:0 0 12px" ${o?"open":""} ontoggle="try{localStorage.setItem('althea.ayudaAse',this.open?'1':'0')}catch(_){}">
  <summary style="cursor:pointer"><b>▶ Vídeo: cómo funciona este apartado</b> <span class="note">(1 minuto, sin sonido)</span></summary>
  <video src="ayuda-asesoria.mp4" controls playsinline preload="metadata" style="width:100%;max-width:860px;display:block;margin-top:10px;border-radius:10px;background:#000"></video>
  <p class="note" style="margin-top:6px">Entrar · elegir el mes o el trimestre · rellenar los impuestos y subir el PDF · retenciones del alquiler · informe · movimientos con sus documentos · facturas emitidas y Excel. <a href="ayuda-asesoria.mp4" download>Descargar el vídeo</a></p></details>`}
/* ---------- 23/11/2026 (titular): avisos de las profesoras a dirección y a Ainea ----------
   Desde la ficha de un alumno, la profesora manda un aviso con plantilla: añade una clase, baja, pasa a otra profesora, reduce horario
   (u otro). Dirección (o Ainea, con su usuario de profesora) lo ve en la pestaña «Avisos» con las comprobaciones: recibos pendientes,
   si ha venido este mes, y cuánto sumar o restar al recibo del mes (clases que quedan × precio de la hora de su nivel). Hasta enero el
   recibo se cambia a mano en Argos; los cambios de horario los hace dirección. Después se cierra el aviso.
   Datos: avisosProf/<id> = {profe, uid, alumno, nombre, tipo, d:{…}, nota, t, estado:"abierto"|"cerrado"|"anulado", cierre:{t,por,nota}} */
const AV={docs:[],sub:null,ok:false,err:"",modo:""};
const avDir=()=>(S.role==="dir"&&!esMos())||esPlus();
function avEscuchar(){const modo=avDir()?"todo":S.role==="profe"&&S.myProfe?"p:"+S.myProfe:"";if(!modo||!S.db)return;if(AV.sub&&AV.modo===modo)return;
  try{AV.sub&&AV.sub()}catch(_){}AV.modo=modo;let c=S.db.collection("avisosProf");if(modo!=="todo")c=c.where("profe","==",S.myProfe);
  AV.sub=c.onSnapshot(s=>{AV.docs=s.docs.map(d=>({id:d.id,...d.data()})).sort((x,y)=>String(y.t).localeCompare(String(x.t)));AV.ok=true;AV.err="";avTab();
      if(S.view==="avisos"||(S.view==="alumnos"&&S.sel))render()},
    e=>{AV.ok=true;AV.err="No se pueden leer los avisos: hay que publicar las reglas nuevas en Firebase (avisosProf).";if(S.view==="avisos")render()})}
const avAbiertos=()=>AV.docs.filter(x=>x.estado==="abierto");
function avTab(){const b=document.getElementById("t-avisos");if(!b)return;const n=avDir()?avAbiertos().length:0;b.textContent="Avisos"+(n?" · "+n:"")}
const AVT={anade:"Añade una clase",reduce:"Quita una clase (reduce horario)",pasa:"Pasa una clase a otra profesora",baja:"Se da de baja",otro:"Otro aviso"};
const avDias=["Lunes","Martes","Miércoles","Jueves","Viernes"];
/* fecha «desde»: hoy, el lunes que viene o el día 1 del mes que viene */
function avDesdeOpc(){const hoy=todayISO(),lun=(()=>{let f=sumaDias(hoy,1);while(diaDe(f)!=="Lunes")f=sumaDias(f,1);return f})(),m1=(()=>{const [y,m]=hoy.split("-").map(Number);return m===12?`${y+1}-01-01`:`${y}-${String(m+1).padStart(2,"0")}-01`})();
  return [["hoy",hoy,"Desde hoy"],["lunes",lun,`Desde el lunes ${fmtFecha(lun)}`],["mes",m1,`Desde el 1 de ${MESES[+m1.slice(5,7)-1]}`]]}
const clTxt=c=>`${c.dia} ${FLEX.has(c.profe)&&c.ini?c.ini:(HSHORT[c.hora]||c.hora)}`;
/* ----- profesora: formulario en la ficha ----- */
function vAvisoProfFicha(id,a){if(S.role!=="profe")return "";avEscuchar();/* 25/11/2026: también en la vista previa, para verlo (ahí no se envía) */
  const F=S.avF&&S.avF.id===id?S.avF:null,mias=(a.clases||[]).filter(c=>c.profe===S.myProfe),mis=AV.docs.filter(x=>x.alumno===id).slice(0,5);
  const est=x=>x.estado==="cerrado"?`<span class="badge b-si">Hecho${x.cierre&&x.cierre.t?" el "+fmtFecha(String(x.cierre.t).slice(0,10)):""}</span>${x.cierre&&x.cierre.nota?` <span class="note">· ${esc(x.cierre.nota)}</span>`:""}`:x.estado==="anulado"?`<span class="badge">Anulado</span>`:`<span class="badge b-pend">Enviado, pendiente</span> <a href="#" data-av="anular" data-i="${esc(x.id)}" class="note">anular</a>`;
  const lista=mis.length?`<div style="margin-top:6px">${mis.map(x=>`<div class="row" style="flex-wrap:wrap"><span class="note">${fmtFecha(String(x.t).slice(0,10))}</span><span class="grow">${esc(avResumen(x))}</span>${est(x)}</div>`).join("")}</div>`:"";
  if(!F)return `<div class="panel" style="padding:10px 14px"><div class="bar" style="margin:0"><b style="margin-right:auto">Avisar a dirección y a Ainea${S.pv?' <span class="note" style="font-weight:400">(vista previa: no se envía)</span>':""}</b><span style="display:flex;gap:6px;flex-wrap:wrap">${Object.entries(AVT).map(([k,l])=>`<button class="btn small" data-av="nuevo" data-id="${esc(id)}" data-k="${k}">${l}</button>`).join("")}</span></div>${lista}</div>`;
  const desde=avDesdeOpc(),dsel=`<label class="f" style="flex:1 1 220px">¿Desde cuándo?<select id="av-desde">${desde.map(([k,f,l])=>`<option value="${f}" ${F.desde===f?"selected":""}>${l}</option>`).join("")}<option value="otra" ${F.desde==="otra"?"selected":""}>Otra fecha…</option></select></label>${F.desde==="otra"?`<label class="f" style="flex:0 1 160px">Fecha<input type="date" id="av-fecha" value="${esc(F.fecha||todayISO())}"></label>`:""}`;
  const selClase=mias.length?`<label class="f" style="flex:1 1 200px">¿Qué clase?<select id="av-clase">${mias.map((c,i)=>`<option value="${i}">${esc(clTxt(c))}</option>`).join("")}</select></label>`:`<p class="note">No tiene clases contigo.</p>`;
  let campos="";
  if(F.k==="anade")campos=`<label class="f" style="flex:1 1 130px">Día<select id="av-dia">${avDias.map(d=>`<option>${d}</option>`).join("")}</select></label><label class="f" style="flex:0 1 110px">De<input type="time" id="av-ini" step="900" value="17:00"></label><label class="f" style="flex:0 1 110px">A<input type="time" id="av-fin" step="900" value="18:00"></label><label class="f" style="flex:0 1 150px">Tipo<select id="av-ind"><option value="g">En grupo</option><option value="i">Individual</option></select></label>${dsel}`;
  else if(F.k==="reduce")campos=selClase+dsel;
  else if(F.k==="pasa")campos=selClase+`<label class="f" style="flex:1 1 160px">Pasa con<select id="av-aprofe">${EQUIPO.filter(p=>p!==S.myProfe).map(p=>`<option>${esc(p)}</option>`).join("")}</select></label>`+dsel;
  else if(F.k==="baja")campos=`<label class="f" style="flex:1 1 200px">Motivo<select id="av-motivo">${["Fin de curso o ya no lo necesita","Económico","Horario","Cambio de centro","No está contento","Otro"].map(m=>`<option>${m}</option>`).join("")}</select></label><label class="f" style="flex:0 1 170px">Último día de clase<input type="date" id="av-fecha" value="${todayISO()}"></label>`;
  return `<div class="panel" style="padding:10px 14px;border-left:4px solid var(--accent)"><div class="bar" style="margin:0 0 6px"><b style="margin-right:auto">${esc(titulo(a.nombre))}: ${esc(AVT[F.k])}</b><button class="btn small" data-av="cancelar">Cancelar</button></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">${campos}</div>
    <label class="f" style="margin-top:6px">${F.k==="otro"?"Mensaje":"Nota (opcional)"}<input type="text" id="av-nota" maxlength="300" placeholder="${F.k==="baja"?"Lo que haya contado la familia":"Algo más que deba saber dirección"}"></label>
    <button class="btn primary" style="margin-top:8px" data-av="enviar" data-id="${esc(id)}" ${(F.k==="reduce"||F.k==="pasa")&&!mias.length?"disabled":""}>Enviar a dirección y a Ainea</button></div>`}
function avResumen(x){const d=x.d||{},desde=d.desde?` desde el ${fmtFecha(d.desde)}`:"";
  if(x.tipo==="anade")return `Añade una clase: ${d.dia} ${d.ini}–${d.fin} (${d.ind==="i"?"individual":"en grupo"})${desde}`;
  if(x.tipo==="reduce")return `Quita la clase del ${d.clase}${desde}`;
  if(x.tipo==="pasa")return `Pasa la clase del ${d.clase} con ${d.aProfe}${desde}`;
  if(x.tipo==="baja")return `Se da de baja (${d.motivo||""}); último día ${fmtFecha(d.ultimo||"")}`;
  return x.nota||"Aviso"}
async function avEnviar(id){const a=S.alumnos.get(id),F=S.avF;if(!a||!F)return;const v=s=>{const e=document.getElementById(s);return e?e.value:""};
  const ds=v("av-desde"),desde=ds==="otra"?v("av-fecha"):ds,mias=(a.clases||[]).filter(c=>c.profe===S.myProfe),c=mias[+v("av-clase")]||null;const d={};
  if(F.k==="anade"){Object.assign(d,{dia:v("av-dia"),ini:v("av-ini"),fin:v("av-fin"),ind:v("av-ind"),desde});if(!d.ini||!d.fin||d.fin<=d.ini){toast("Revisa la hora de la clase");return}}
  if(F.k==="reduce"||F.k==="pasa"){if(!c){toast("Elige la clase");return}Object.assign(d,{clase:clTxt(c),cDia:c.dia,cHora:c.hora,cIni:c.ini||"",cTipo:c.tipo||"",desde})}
  if(F.k==="pasa")d.aProfe=v("av-aprofe");
  if(F.k==="baja")Object.assign(d,{motivo:v("av-motivo"),ultimo:v("av-fecha")||todayISO()});
  const nota=v("av-nota").trim();if(F.k==="otro"&&!nota){toast("Escribe el mensaje");return}
  if(desde&&desde!=="otra"&&!/^\d{4}-\d\d-\d\d$/.test(desde)){toast("Elige la fecha");return}
  const doc={profe:S.myProfe,uid:(window.__fb&&window.__fb.CU&&window.__fb.CU.uid)||"",alumno:id,nombre:a.nombre,tipo:F.k,d,nota,t:nowISO(),estado:"abierto"};
  try{const ref=S.db.collection("avisosProf").doc("av"+Date.now().toString(36)+Math.random().toString(36).slice(2,6));await ref.set(doc);S.avF=null;render();toast("Aviso enviado a dirección y a Ainea")}
  catch(e){console.error(e);toast("No se ha podido enviar el aviso")}}
/* ----- dirección / Ainea: comprobaciones ----- */
const avRecibos=id=>{const a=S.alumnos.get(id);if(!a)return [];if(S.role==="dir")return a.recibos||[];const p=typeof PLUS!=="undefined"&&PLUS.m&&PLUS.m.get(id);return (p&&p.recibos)||[]};
const avPrecio=(a,ind)=>{if(a&&a.sueltas&&+a.sueltas.precio>0)return +a.sueltas.precio;const v=tarifas()[nivelDe(a)+"|"+(ind?"i":"g")];return v==null||v===""||isNaN(+v)?null:+v};
/* días de ese día de la semana desde «desde» hasta fin de su mes, sin festivos */
function avQuedan(dia,desde){const l=[];if(!dia||!desde)return l;const m=desde.slice(0,7);for(let f=desde;f.slice(0,7)===m;f=sumaDias(f,1))if(diaDe(f)===dia&&!festivoDe(f))l.push(f);return l}
function avComprobar(x){const a=S.alumnos.get(x.alumno);if(!a)return `<p class="note">El alumno ya no está en la app.</p>`;const d=x.d||{},R=avRecibos(x.alumno),out=[];
  const pend=R.filter(r=>r&&r.estado!=="pagado"&&r.estado!=="anulado"&&String(r.emitido||"").slice(0,7)>=ATR_DESDE()).sort((u,v)=>String(u.emitido).localeCompare(String(v.emitido)));
  const recTxt=r=>`${esc(nombreMes(r.emitido))}${r.numero?` (${esc(r.numero)})`:""} · ${eur(+r.importe||0)}`;
  out.push(pend.length?`⚠️ Tiene <b>${pend.length} recibo${pend.length===1?"":"s"} pendiente${pend.length===1?"":"s"}</b>: ${pend.map(recTxt).join(" · ")}${typeof esperaBeca==="function"&&esperaBeca(a)?" <span class=\"badge b-pend\">espera beca</span>":""}`:`✓ No tiene recibos pendientes.`);
  if(x.tipo==="baja"){const ult=d.ultimo||todayISO(),mes=ult.slice(0,7),A=asistTodas(a),si=A.filter(z=>z.e==="si"&&z.f.slice(0,7)===mes),fl=A.filter(z=>z.e!=="si"&&z.f.slice(0,7)===mes),ultV=A.filter(z=>z.e==="si").map(z=>z.f).sort().pop();
    out.push(si.length?`📅 En ${esc(nombreMes(mes+"-01"))} <b>ha venido ${si.length} ${si.length===1?"vez":"veces"}</b>${fl.length?` (y ${fl.length} falta${fl.length===1?"":"s"})`:""}: el recibo de ${esc(nombreMes(mes+"-01"))} se cobra.`:`📅 En ${esc(nombreMes(mes+"-01"))} <b>no ha venido</b>${fl.length?` (${fl.length} falta${fl.length===1?"":"s"})`:""}${ultV?`; vino por última vez el ${fmtFecha(ultV)}`:""}: valora anular el recibo de ${esc(nombreMes(mes+"-01"))}.`);
    const rm=R.find(r=>r&&r.serie!=="HX"&&!r.extra&&!r.clase&&r.estado!=="anulado"&&String(r.emitido||"").slice(0,7)===mes);
    out.push(rm?`🧾 Recibo de ${esc(nombreMes(mes+"-01"))}: ${recTxt(rm)} · <b>${rm.estado==="pagado"?"pagado":"pendiente"}</b>.`:`🧾 No tiene recibo de ${esc(nombreMes(mes+"-01"))}.`);
    out.push(`➡️ En la ficha: «Dar de baja». En Argos: baja del alumno${pend.length?" y reclamar o anular los pendientes":""}.`)}
  if(x.tipo==="anade"||x.tipo==="reduce"||x.tipo==="pasa"){const dia=x.tipo==="anade"?d.dia:d.cDia,desde=d.desde||todayISO(),mes=desde.slice(0,7),q=avQuedan(dia,desde);
    const ind=x.tipo==="anade"?d.ind==="i":indDe(x.profe,d.cDia,d.cHora,d.cTipo),pr=avPrecio(a,ind);
    const rm=R.find(r=>r&&r.serie!=="HX"&&!r.extra&&!r.clase&&r.estado!=="anulado"&&String(r.emitido||"").slice(0,7)===mes);
    if(x.tipo==="pasa")out.push(`🔁 Cambia de profesora: el recibo no cambia${ind?"":" (si con la nueva profesora pasa a ser individual, sí cambia el precio)"}.`);
    else if(!q.length)out.push(`🧾 Desde el ${fmtFecha(desde)} no queda ningún ${esc(String(dia).toLowerCase())} en ${esc(nombreMes(mes+"-01"))}: el recibo de este mes no cambia. Cambia la tarifa para los meses siguientes.`);
    else if(pr==null)out.push(`🧾 Queda${q.length===1?"":"n"} ${q.length} ${esc(String(dia).toLowerCase())}${q.length===1?"":"s"} en ${esc(nombreMes(mes+"-01"))} (${q.map(f=>f.slice(8,10)).join(", ")}), pero no sé el precio de la hora de su nivel${nivelDe(a)?"":" (no tiene nivel)"}: calcúlalo a mano.`);
    else{const imp=r2(q.length*pr),mas=x.tipo==="anade";
      out.push(`🧾 Queda${q.length===1?"":"n"} <b>${q.length} clase${q.length===1?"":"s"}</b> en ${esc(nombreMes(mes+"-01"))} (${q.map(f=>f.slice(8,10)).join(", ")}) × ${eur(pr)} (hora ${ind?"individual":"en grupo"} de ${esc(nivelDe(a)||"su nivel")}) = <b>${mas?"+":"−"}${eur(imp)}</b>.`);
      out.push(rm?(mas?(rm.estado==="pagado"?`➡️ El recibo de ${esc(nombreMes(mes+"-01"))} (${recTxt(rm)}) está <b>pagado</b>: haz en Argos un <b>recibo nuevo de ${eur(imp)}</b> por las horas que se añaden.`:`➡️ El recibo de ${esc(nombreMes(mes+"-01"))} (${recTxt(rm)}) está <b>pendiente</b>: cámbialo en Argos a <b>${eur(r2((+rm.importe||0)+imp))}</b>.`)
        :(rm.estado==="pagado"?`➡️ El recibo de ${esc(nombreMes(mes+"-01"))} (${recTxt(rm)}) ya está <b>pagado</b>: descuenta <b>${eur(imp)}</b> en el recibo del mes siguiente.`:`➡️ El recibo de ${esc(nombreMes(mes+"-01"))} (${recTxt(rm)}) está <b>pendiente</b>: cámbialo en Argos a <b>${eur(r2(Math.max(0,(+rm.importe||0)-imp)))}</b>.`))
        :`➡️ No tiene recibo de ${esc(nombreMes(mes+"-01"))}: ${mas?`haz en Argos un recibo de ${eur(imp)}`:"no hay que descontar nada"}.`)}
    out.push(`➡️ Horario: ${x.tipo==="anade"?`añadir el ${esc(d.dia)} ${esc(d.ini)} con ${esc(x.profe)}`:x.tipo==="reduce"?`quitar la clase del ${esc(d.clase)} con ${esc(x.profe)}`:`mover la clase del ${esc(d.clase)} de ${esc(x.profe)} a ${esc(d.aProfe)}`} (en la ficha, como dirección). Y revisar la tarifa del alumno para los meses siguientes.`)}
  return `<div style="display:grid;gap:4px;margin:6px 0">${out.map(t=>`<div>${t}</div>`).join("")}</div>`}
function vAvisos(){avEscuchar();if(!avDir())return `<div class="empty">Solo dirección y Ainea.</div>`;
  const ab=avAbiertos(),ce=AV.docs.filter(x=>x.estado!=="abierto"&&String((x.cierre&&x.cierre.t)||x.t)>=sumaDias(todayISO(),-30));
  const card=x=>{const cerr=x.estado!=="abierto";return `<div class="panel" style="padding:10px 14px;margin-bottom:10px;${cerr?"opacity:.7":"border-left:4px solid var(--warn)"}">
    <div class="bar" style="margin:0;flex-wrap:wrap"><span class="pl" style="--pc:${pc(x.profe)}"><span class="dot"></span>${esc(x.profe)}</span><a href="#" data-act="ir" data-id="${esc(x.alumno)}" style="color:inherit"><b>${esc(titulo(x.nombre||""))}</b></a><span class="note" style="margin-left:auto">${fmtFecha(String(x.t).slice(0,10))} ${String(x.t).slice(11,16)}</span></div>
    <div style="margin:4px 0"><b>${esc(AVT[x.tipo]||"Aviso")}</b> · ${esc(avResumen(x))}${x.nota&&x.tipo!=="otro"?`<br><span class="note">«${esc(x.nota)}»</span>`:""}</div>
    ${cerr?`<p class="note" style="margin:0">${x.estado==="anulado"?"Anulado por la profesora":`Cerrado por ${esc((x.cierre&&x.cierre.por)||"")} el ${fmtFecha(String((x.cierre&&x.cierre.t)||"").slice(0,10))}${x.cierre&&x.cierre.nota?` · ${esc(x.cierre.nota)}`:""}`}</p>`
      :`${x.tipo!=="otro"?avComprobar(x):""}<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px"><label class="f" style="flex:1 1 260px">Nota al cerrar (la ve la profesora)<input type="text" id="av-cn-${esc(x.id)}" maxlength="200" placeholder="Ej.: hecho en Argos, recibo A26/… cambiado a 70 €"></label>${S.role==="dir"?`<button class="btn small" data-act="ir" data-id="${esc(x.alumno)}">Abrir ficha</button>`:""}<button class="btn primary small" data-av="cerrar" data-i="${esc(x.id)}">Hecho: cerrar aviso</button></div>`}</div>`};
  return `<div class="bar"><h2>Avisos de las profesoras</h2><span class="legend">${ab.length} abierto${ab.length===1?"":"s"}</span></div>
  <p class="note" style="margin-top:0">Lo que avisan las profesoras desde la ficha de cada alumno. Haz los cambios (horario en la ficha como dirección, recibo en Argos) y pulsa «Hecho: cerrar aviso». La profesora ve que está hecho.</p>
  ${AV.err?`<div class="aviso pend" style="display:block">${esc(AV.err)}</div>`:""}
  ${!AV.ok?`<p class="note">Cargando…</p>`:ab.length?ab.map(card).join(""):`<div class="panel"><p class="note">No hay avisos abiertos.</p></div>`}
  ${ce.length?`<details style="margin-top:12px"><summary class="note">Cerrados en los últimos 30 días (${ce.length})</summary><div style="margin-top:8px">${ce.map(card).join("")}</div></details>`:""}`}
function vAvisosPend(){if(S.role!=="dir"||esMos())return "";avEscuchar();const n=avAbiertos().length;return n?`<div class="aviso pend" style="display:block"><b>${n} aviso${n===1?"":"s"} de las profesoras sin cerrar</b> (altas de clase, bajas, cambios de profesora…). <button class="btn small" data-av="ir">Ir a Avisos</button></div>`:""}
document.addEventListener("change",e=>{if(e.target&&e.target.id==="av-desde"&&S.avF){S.avF.desde=e.target.value;if(e.target.value==="otra")render()}});
document.addEventListener("click",async e=>{const t=e.target.closest&&e.target.closest("[data-av]");if(!t)return;e.preventDefault();const k=t.dataset.av;
  if(k==="nuevo"){S.avF={id:t.dataset.id,k:t.dataset.k,desde:todayISO()};render();return}
  if(k==="cancelar"){S.avF=null;render();return}
  if(k==="ir"){S.view="avisos";render();return}
  if(k==="enviar"){if(S.pv){toast("Vista previa: no se envía nada");return}t.disabled=true;await avEnviar(t.dataset.id);t.disabled=false;return}
  if(k==="anular"){if(!confirm("¿Anular este aviso?"))return;try{await S.db.doc("avisosProf/"+t.dataset.i).update({estado:"anulado",cierre:{t:nowISO(),por:S.myProfe||quienSoy(),nota:"Anulado por la profesora"}})}catch(_){toast("No se ha podido anular")}return}
  if(k==="cerrar"){const n=(document.getElementById("av-cn-"+t.dataset.i)||{}).value||"";t.disabled=true;
    try{await S.db.doc("avisosProf/"+t.dataset.i).update({estado:"cerrado",cierre:{t:nowISO(),por:esPlus()?"Ainea":quienSoy(),nota:n.trim()}});toast("Aviso cerrado")}catch(_){t.disabled=false;toast("No se ha podido cerrar")}}});
