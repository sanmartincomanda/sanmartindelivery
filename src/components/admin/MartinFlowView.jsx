import React,{useCallback,useEffect,useMemo,useRef,useState} from 'react';
import { fetchMartinDashboard } from '../../services/martinDashboard';
import { FLOW_SIZE,INITIAL_POSITIONS,STATUS_LABELS,localMartinDay,formatMartinTime,formatMartinDay,safePositions,getMartinFlow,flowConnection } from '../../services/martinFlowModel';
import './MartinFlowView.css';

const paths={
  chat:<><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3V6a2 2 0 0 1 1-2Z"/><path d="M8 9h8M8 13h5"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  scan:<><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M7 8h10M7 12h10M7 16h6"/></>,
  layers:<><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/></>,
  spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4M18 4h4"/></>,
  chart:<><path d="M4 3v17h17M8 16v-5M13 16V7M18 16v-3"/></>,
  bulb:<><path d="M9 18h6M9 21h6M8.5 15a6 6 0 1 1 7 0L15 18H9l-.5-3Z"/></>,
  shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/></>,
  store:<><path d="M3 9h18l-2-5H5L3 9ZM4 9v11h16V9M9 20v-6h6v6"/></>,
  truck:<><path d="M3 6h11v11H3V6ZM14 10h4l3 4v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></>,
  order:<><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></>,
  refresh:<><path d="M20 7V3l-4 4M4 17v4l4-4"/><path d="M20 7a8 8 0 0 0-14-2M4 17a8 8 0 0 0 14 2"/></>,
  fit:<><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/><rect x="8" y="8" width="8" height="8" rx="1"/></>,
  reset:<><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></>,
  plus:<path d="M12 5v14M5 12h14"/>,minus:<path d="M5 12h14"/>,close:<path d="m6 6 12 12M18 6 6 18"/>,
};
function Icon({name,size=20}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.spark}</svg>;}
const scoreText=value=>typeof value==='number' ? `${value.toFixed(1)}/10` : 'N/A';
const readerLabels={active:'Leyendo novedades',outside_hours:'Fuera de horario',delayed:'Lectura con demora',error:'Fallo de lectura',paused:'Observación pausada',historical:'Jornada anterior',waiting:'Esperando lectura'};

export function MartinFlowWorkspace({data,loading=false,error='',onRefresh,onDayChange,day,demo=false}){
  const [mode,setMode]=useState('observer'),[selected,setSelected]=useState('reader'),[list,setList]=useState(false),[expanded,setExpanded]=useState(false);
  const [positions,setPositions]=useState(()=>{
    try{return safePositions(JSON.parse(localStorage.getItem('martin_si_visual_layout_v1') || 'null'));}catch{return safePositions(null);}
  });
  const [zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),[size,setSize]=useState({width:880,height:530});
  const canvasRef=useRef(null),inspectorRef=useRef(null),gesture=useRef(null),moved=useRef(false),fitted=useRef(false);
  const flow=useMemo(()=>getMartinFlow(data,mode,Boolean(error)),[data,mode,error]);
  const node=flow.nodes.find(n=>n.id===selected) || flow.nodes[0];
  const fit=useCallback(()=>{
    const el=canvasRef.current;if(!el)return;
    const width=el.clientWidth,height=el.clientHeight;
    setSize({width,height});setZoom(Math.max(.25,Math.min(1.1,(width-28)/FLOW_SIZE.width,(height-30)/FLOW_SIZE.height)));setPan({x:0,y:0});
  },[]);
  useEffect(()=>{
    const el=canvasRef.current;if(!el)return;
    const observer=new ResizeObserver(()=>{setSize({width:el.clientWidth,height:el.clientHeight});if(!fitted.current){fit();fitted.current=true;}});
    observer.observe(el);return ()=>observer.disconnect();
  },[fit,list,expanded]);
  useEffect(()=>{fit();},[mode,list,expanded,fit]);
  useEffect(()=>{try{localStorage.setItem('martin_si_visual_layout_v1',JSON.stringify(positions));}catch{}},[positions]);
  useEffect(()=>{
    const escape=e=>{if(e.key==='Escape')setExpanded(false);};window.addEventListener('keydown',escape);return ()=>window.removeEventListener('keydown',escape);
  },[]);
  const start=(e,id)=>{
    if(e.button!==0)return;
    if(!id && e.target.closest('button,input,[data-flow-node]'))return;
    e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);moved.current=false;
    gesture.current={id,startX:e.clientX,startY:e.clientY,origin:id ? positions[id] : pan};
    if(id)setSelected(id);
  };
  const move=e=>{
    const g=gesture.current;if(!g)return;
    const dx=e.clientX-g.startX,dy=e.clientY-g.startY;
    if(Math.abs(dx)+Math.abs(dy)>4)moved.current=true;
    if(g.id)setPositions(current=>safePositions({...current,[g.id]:{x:g.origin.x+dx/zoom,y:g.origin.y+dy/zoom}}));
    else setPan({x:g.origin.x+dx,y:g.origin.y+dy});
  };
  const stop=()=>{gesture.current=null;};
  const zoomTo=value=>setZoom(Math.max(.25,Math.min(1.7,value)));
  const todayReport=data?.report && data.report.day===data.day ? data.report : null;
  const stageFacts={
    input:[['Ámbito','WhatsApp · Granada'],['Chats observados',data?.collection.observedTickets ?? '—']],
    schedule:[['Horario','07:00–17:00'],['Zona horaria','Nicaragua'],['Acceso','Solo administrador']],
    reader:[['Última lectura',formatMartinTime(data?.cadence.lastCycleAt)],['Consultas del día',data?.cadence.cycles ?? '—'],['Huecos registrados',data?.cadence.gaps ?? '—'],['Fallos de lectura',data?.cadence.readFailures ?? '—']],
    context:[['Historiales completos',data ? `${data.collection.completeHistories}/${data.collection.observedTickets}` : '—'],['Pendientes de lectura',data?.collection.pendingHistories ?? '—'],['Medios sin transcripción',data?.collection.mediaWithoutTranscript ?? '—']],
    evaluation:[['Cierre de jornada','17:05 · Nicaragua'],['Evaluaciones terminadas',data?.evaluation.jobs.complete ?? '—'],['Fallidas',data?.evaluation.jobs.failed ?? '—']],
    report:[['Reporte de la jornada',todayReport ? formatMartinDay(todayReport.day) : 'Aún no disponible'],['Atención',scoreText(todayReport?.attentionScore)],['Resolución',scoreText(todayReport?.resolutionScore)],['Respuestas evaluadas',todayReport ? `${todayReport.evaluatedMessages}/${todayReport.targetMessages}` : '—'],['Quejas detectadas',todayReport?.complaints ?? '—'],['Evaluaciones fallidas',todayReport?.failedEvaluations ?? '—']],
    lessons:[['Propuestas del día',todayReport?.lessons ?? '—'],['Incorporación automática','Desactivada']],
    review:[['Aprobación','Revisión del dueño'],['Cambios desde esta vista','Ninguno']],
  };
  const currentFacts=mode==='observer' ? stageFacts[node.id] : [['Mapa','Esquema de atención'],['Activación desde esta vista','No disponible'],['Estado','No activado']];
  const nodeButton=(n,inList=false)=><button key={n.id} type="button" data-flow-node={n.id}
    className={`martin-node state-${n.state}${selected===n.id ? ' is-selected' : ''}${inList ? ' is-list' : ''}`}
    style={inList ? undefined : {left:positions[n.id].x,top:positions[n.id].y}}
    aria-label={`${n.title}: ${STATUS_LABELS[n.state]}. Ver detalles`} aria-pressed={selected===n.id}
    onClick={e=>{if(inList || e.detail===0 || !moved.current){setSelected(n.id);if(window.innerWidth<=1050)requestAnimationFrame(()=>inspectorRef.current?.scrollIntoView({block:'start'}));}}}
    onPointerDown={inList ? undefined : e=>start(e,n.id)}
    onKeyDown={e=>{if(!inList && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();setPositions(p=>safePositions({...p,[n.id]:{x:p[n.id].x+(e.key==='ArrowRight'?12:e.key==='ArrowLeft'?-12:0),y:p[n.id].y+(e.key==='ArrowDown'?12:e.key==='ArrowUp'?-12:0)}}));}}}>
    {!inList && <><span className="martin-port port-left"/><span className="martin-port port-right"/></>}
    <span className="martin-node-top"><span className="martin-node-icon"><Icon name={n.icon}/></span><span className="martin-state-dot"/><span className="martin-node-order">{String(flow.nodes.indexOf(n)+1).padStart(2,'0')}</span></span>
    <strong>{n.title}</strong><small>{n.subtitle}</small><span className="martin-node-state">{STATUS_LABELS[n.state]}</span>
  </button>;
  return <div className={`martin-workspace${expanded ? ' is-expanded' : ''}`}>
    <header className="martin-header">
      <div className="martin-title"><span className="martin-mark"><Icon name="spark" size={27}/></span><div><span className="martin-eyebrow">CARNES SAN MARTÍN · GRANADA</span><h1>Martín SI <span>Centro del agente</span></h1></div></div>
      <div className="martin-header-actions"><span className={`martin-mode-pill${data?.observerEnabled && !error ? ' is-on' : ''}`}><span/>{error ? 'Sin actualizar' : data?.observerEnabled ? 'Observación activada' : loading && !data ? 'Conectando…' : data ? 'Observación pausada' : 'Sin datos'}</span>
        <button type="button" className="martin-button" disabled={loading} onClick={onRefresh} aria-label="Actualizar estado"><Icon name="refresh"/><span>{loading ? 'Actualizando' : 'Actualizar'}</span></button>
        {expanded && <button type="button" className="martin-icon-button" onClick={()=>setExpanded(false)} aria-label="Cerrar vista ampliada"><Icon name="close"/></button>}
      </div>
    </header>
    {demo && <div className="martin-notice">Vista de prueba · datos simulados. No está conectada a conversaciones reales.</div>}
    {error && <div className="martin-notice is-error" role="alert">{error} {data ? 'Se muestran los últimos datos recibidos.' : 'No se puede confirmar el estado del agente.'}</div>}
    <div className="martin-summary">
      <div className="martin-summary-item"><span className="martin-summary-icon"><Icon name="chat"/></span><div><small>Chats observados</small><strong>{data?.collection.observedTickets ?? '—'} <em>{data ? `${data.collection.completeHistories} historiales completos` : 'Esperando datos'}</em></strong></div></div>
      <div className="martin-summary-item"><span className="martin-summary-icon"><Icon name="scan"/></span><div><small>Respuestas para evaluar</small><strong>{data?.collection.targetMessages ?? '—'} <em>de la jornada seleccionada</em></strong></div></div>
      <div className="martin-summary-item"><span className="martin-summary-icon"><Icon name="clock"/></span><div><small>Consulta objetivo</small><strong>15 s <em>07:00–17:00 · Nicaragua</em></strong></div></div>
    </div>
    <div className="martin-flow-toolbar">
      <div className="martin-tabs" role="tablist" aria-label="Mapas del agente"><button type="button" role="tab" aria-selected={mode==='observer'} className={mode==='observer'?'is-active':''} onClick={()=>setMode('observer')}>Observación <span>Actual</span></button><button type="button" role="tab" aria-selected={mode==='attention'} className={mode==='attention'?'is-active':''} onClick={()=>setMode('attention')}>Atención <span>No activada</span></button></div>
      <label className="martin-day">Jornada <input type="date" value={day || localMartinDay()} max={localMartinDay()} onChange={e=>{if(e.target.value)onDayChange?.(e.target.value);}} aria-label="Fecha de la jornada"/></label>
    </div>
    <div className="martin-body">
      <section className="martin-canvas-section" aria-label="Mapa visual del agente">
        <div className="martin-canvas-top"><div><span className="martin-dot"/>{mode==='observer' ? 'Flujo de observación' : 'Esquema de atención'}<small>{mode==='observer' ? error ? 'Sin lectura actual verificada' : readerLabels[data?.cadence.readerState] || 'Sin datos de lectura' : 'Cambiar de mapa no activa al agente'}</small></div><div className="martin-view-switch"><button type="button" aria-pressed={!list} onClick={()=>setList(false)}>Mapa</button><button type="button" aria-pressed={list} onClick={()=>setList(true)}>Lista</button></div></div>
        {mode==='attention' && <div className="martin-planned">Este mapa representa la atención prevista, no un flujo de ventas ejecutándose.</div>}
        {list ? <div className="martin-node-list">{flow.nodes.map(n=>nodeButton(n,true))}</div> :
          <div ref={canvasRef} className="martin-canvas" onPointerDown={e=>start(e)} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop}>
            <div className="martin-world" style={{width:FLOW_SIZE.width,height:FLOW_SIZE.height,transform:`translate(${(size.width-FLOW_SIZE.width*zoom)/2+pan.x}px, ${(size.height-FLOW_SIZE.height*zoom)/2+pan.y}px) scale(${zoom})`}}>
              <div className="martin-lane-label" style={{left:28,top:117}}>01 / {mode==='observer'?'RECOLECCIÓN Y CONTEXTO':'CONVERSACIÓN'}</div>
              <div className="martin-lane-label" style={{left:28,top:307}}>02 / {mode==='observer'?'EVALUACIÓN Y MEJORA':'HERRAMIENTAS DEL AGENTE'}</div>
              <svg className="martin-connections" width={FLOW_SIZE.width} height={FLOW_SIZE.height} aria-hidden="true"><defs><marker id={`martin-arrow-${mode}`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="m0 0 6 3-6 3" fill="#5e7d97"/></marker></defs>{flow.edges.map(([a,b])=><path key={`${a}-${b}`} d={flowConnection(positions[a],positions[b])} className={mode==='attention'?'is-planned':''} markerEnd={`url(#martin-arrow-${mode})`}/>)}</svg>
              {flow.nodes.map(n=>nodeButton(n))}
              <div className="martin-map-note"><Icon name="shield" size={15}/>Mapa de etapas · no es una traza en tiempo real de cada chat</div>
            </div>
            <div className="martin-canvas-controls" onPointerDown={e=>e.stopPropagation()}>
              <button type="button" className="martin-icon-button" onClick={()=>zoomTo(zoom+.15)} aria-label="Acercar mapa"><Icon name="plus"/></button>
              <span aria-live="polite">{Math.round(zoom*100)}%</span>
              <button type="button" className="martin-icon-button" onClick={()=>zoomTo(zoom-.15)} aria-label="Alejar mapa"><Icon name="minus"/></button><i/>
              <button type="button" className="martin-icon-button" onClick={fit} aria-label="Ajustar mapa"><Icon name="fit"/></button>
              <button type="button" className="martin-icon-button" onClick={()=>{setPositions(safePositions(INITIAL_POSITIONS));fit();}} aria-label="Restablecer posiciones"><Icon name="reset"/></button>
            </div>
            <button type="button" className="martin-expand" onClick={()=>setExpanded(!expanded)}>{expanded ? 'Salir de vista ampliada' : 'Ampliar vista'}</button>
          </div>}
        <footer className="martin-canvas-footer"><span><i className="is-green"/>Activo</span><span><i className="is-amber"/>En espera</span><span><i className="is-red"/>Error</span><span><i/>No activado</span><small>{list?'Seleccione una etapa':'Arrastre el fondo o los bloques · use + y − para el zoom'}</small></footer>
      </section>
      <aside ref={inspectorRef} className="martin-inspector" aria-label="Detalles de la etapa" aria-live="polite">
        <div className="martin-inspector-label">DETALLE DE LA ETAPA <span>Solo lectura</span></div><span className={`martin-detail-icon state-${node.state}`}><Icon name={node.icon} size={28}/></span>
        <h2>{node.title}</h2><span className={`martin-detail-status state-${node.state}`}><i/>{STATUS_LABELS[node.state]}</span><p>{node.description}</p>
        <dl>{currentFacts.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <div className="martin-safety"><Icon name="shield"/><div><strong>No modifica el agente</strong><small>Mover bloques solo cambia su posición visual. No envía mensajes ni crea pedidos.</small></div></div>
      </aside>
    </div>
    <footer className="martin-bottom"><span><Icon name="shield" size={15}/>Solo lectura · panel actualizado cada 30 s</span><span>{data ? `Últimos datos: ${formatMartinTime(data.checkedAt)}` : 'Esperando conexión segura'}</span></footer>
  </div>;
}

export default function MartinFlowView(){
  const [day,setDay]=useState(localMartinDay),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const generation=useRef(0),active=useRef(null),sequence=useRef(0);
  const load=useCallback(async()=>{
    const token=generation.current;
    if(active.current?.generation===token)return;
    const requestId=++sequence.current;
    active.current={generation:token,requestId};setLoading(true);
    try{const result=await fetchMartinDashboard(day);if(token===generation.current){setData(result);setError('');}}
    catch(e){if(token===generation.current)setError(e.code==='functions/permission-denied'?'Su cuenta no tiene permiso para consultar el agente.':e.code==='functions/unauthenticated'?'Inicie sesión de nuevo para consultar el agente.':'No se pudo actualizar el estado. Puede volver a intentarlo.');}
    finally{if(active.current?.requestId===requestId)active.current=null;if(token===generation.current)setLoading(false);}
  },[day]);
  useEffect(()=>{
    generation.current++;setData(null);setError('');load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')load();},30000);
    return()=>{generation.current++;clearInterval(timer);};
  },[load]);
  return <MartinFlowWorkspace data={data} day={day} loading={loading} error={error} onRefresh={load} onDayChange={setDay}/>;
}
