export const FLOW_SIZE={width:880,height:530,nodeWidth:170,nodeHeight:104};
export const INITIAL_POSITIONS={input:{x:28,y:160},schedule:{x:246,y:160},reader:{x:464,y:160},context:{x:682,y:160},
  evaluation:{x:682,y:350},report:{x:464,y:350},lessons:{x:246,y:350},review:{x:28,y:350}};
export const STATUS_LABELS={active:'Activo',waiting:'En espera',warning:'Con demora',partial:'Parcial',error:'Error',paused:'Pausado',prepared:'No activado',unknown:'Sin datos'};
export const localMartinDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Managua',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const formatMartinTime=value=>value ? new Intl.DateTimeFormat('es-NI',{timeZone:'America/Managua',hour:'2-digit',minute:'2-digit',hour12:true}).format(new Date(value)) : 'Sin lectura registrada';
export const formatMartinDay=value=>value ? new Intl.DateTimeFormat('es-NI',{timeZone:'America/Managua',day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00-06:00`)) : 'Sin reporte';
export const safePositions=value=>Object.fromEntries(Object.entries(INITIAL_POSITIONS).map(([id,initial])=>{
  const point=value?.[id];
  return [id,point && Number.isFinite(point.x) && Number.isFinite(point.y) ? {
    x:Math.max(10,Math.min(FLOW_SIZE.width-FLOW_SIZE.nodeWidth-10,point.x)),
    y:Math.max(12,Math.min(FLOW_SIZE.height-FLOW_SIZE.nodeHeight-12,point.y)),
  } : {...initial}];
}));
export const readerVisualState=state=>({active:'active',delayed:'warning',error:'error',paused:'paused',outside_hours:'waiting',historical:'paused',waiting:'waiting'}[state] || 'unknown');
const baseNodes=[
  {id:'input',title:'Whaticket',subtitle:'Conversaciones de Granada',icon:'chat',description:'Origen de las conversaciones observadas. La lectura se limita a la cola y conexión autorizadas de Granada.'},
  {id:'schedule',title:'Jornada y permisos',subtitle:'Horario y alcance seguro',icon:'clock',description:'Comprueba el horario y el alcance antes de cada lectura. No cambia asignaciones ni interviene en otros canales.'},
  {id:'reader',title:'Lectura de mensajes',subtitle:'Intervalo objetivo · 15 s',icon:'scan',description:'Busca novedades y continúa historiales pendientes. Los 15 segundos son un objetivo de consulta, no una garantía de respuesta.'},
  {id:'context',title:'Contexto completo',subtitle:'Historial con evidencia',icon:'layers',description:'Conserva el texto accesible desde el inicio, con fechas e identificadores. No inventa el contenido de audios o imágenes sin transcripción.'},
  {id:'evaluation',title:'Evaluación del día',subtitle:'Atención y resolución',icon:'spark',description:'Después del cierre, evalúa la atención con evidencia de la jornada. No llama a la IA durante cada consulta del lector.'},
  {id:'report',title:'Reporte diario',subtitle:'Resultados y cobertura',icon:'chart',description:'Muestra calificaciones, cobertura y límites del reporte guardado. Un reporte parcial no se presenta como completo.'},
  {id:'lessons',title:'Enseñanzas',subtitle:'Propuestas de mejora',icon:'bulb',description:'Las enseñanzas son propuestas de atención. No cambian automáticamente el agente, los precios ni las políticas del negocio.'},
  {id:'review',title:'Revisión humana',subtitle:'Aprobación del dueño',icon:'shield',description:'Los aprendizajes necesitan revisión humana antes de incorporarse. Esta pantalla no contiene acciones de aprobación o activación.'},
];
const plannedNodes=[
  {id:'input',title:'Whaticket',subtitle:'Mensaje del cliente',icon:'chat'},
  {id:'schedule',title:'Memoria',subtitle:'Mantener la conversación',icon:'layers'},
  {id:'reader',title:'Martín SI',subtitle:'Entender y asesorar',icon:'spark'},
  {id:'context',title:'Respuesta',subtitle:'Atención cálida y breve',icon:'chat'},
  {id:'evaluation',title:'Comanda y SICAR',subtitle:'Pedido confirmado',icon:'order'},
  {id:'report',title:'Delivery',subtitle:'Parámetros y dirección',icon:'truck'},
  {id:'lessons',title:'SICAR',subtitle:'Pesos de combos',icon:'layers'},
  {id:'review',title:'Tienda virtual',subtitle:'Catálogo y promociones',icon:'store'},
];
export const getMartinFlow=(data,mode='observer',unavailable=false)=>{
  if(mode==='attention') return {
    nodes:plannedNodes.map(n=>({...n,state:'prepared',description:'Esquema de la atención prevista. Esta vista no activa respuestas, registra pedidos ni cambia la configuración del agente.'})),
    edges:[['input','schedule'],['schedule','reader'],['reader','context'],['review','reader'],['lessons','reader'],['report','reader'],['reader','evaluation']],
  };
  const reader=unavailable || !data ? 'unknown' : readerVisualState(data.cadence.readerState);
  const report=data?.report && data.report.day===data.day ? data.report : null;
  const evalState=data?.evaluation?.state;
  const states={input:reader,schedule:!data || unavailable ? 'unknown' : data.day!==data.today ? 'paused' : data.observerEnabled ? (data.schedule.open ? 'active' : 'waiting') : 'paused',
    reader,context:!data || unavailable ? 'unknown' : data.collection.pendingHistories>0 ? 'waiting' : data.collection.completeHistories>0 ? 'active' : 'waiting',
    evaluation:!data || unavailable ? 'unknown' : evalState==='processing' ? 'active' : evalState==='partial' ? 'warning' : evalState==='complete' ? 'active' : 'waiting',
    report:!data || unavailable ? 'unknown' : report ? (report.status==='complete' ? 'active' : report.status==='partial' ? 'partial' : 'waiting') : 'waiting',
    lessons:!data || unavailable ? 'unknown' : report?.lessons>0 ? 'waiting' : 'prepared',review:'prepared'};
  return {nodes:baseNodes.map(n=>({...n,state:states[n.id]})),edges:[['input','schedule'],['schedule','reader'],['reader','context'],['context','evaluation'],['evaluation','report'],['report','lessons'],['lessons','review']]};
};
export const flowConnection=(a,b)=>{
  const {nodeWidth:w,nodeHeight:h}=FLOW_SIZE;
  if(Math.abs(a.x-b.x)<30) {
    const down=b.y>a.y,start={x:a.x+w/2,y:a.y+(down?h:0)},end={x:b.x+w/2,y:b.y+(down?0:h)};
    return `M ${start.x} ${start.y} C ${start.x} ${(start.y+end.y)/2}, ${end.x} ${(start.y+end.y)/2}, ${end.x} ${end.y}`;
  }
  const right=b.x>a.x,start={x:a.x+(right?w:0),y:a.y+h/2},end={x:b.x+(right?0:w),y:b.y+h/2};
  const bend=Math.max(35,Math.abs(end.x-start.x)/2);
  return `M ${start.x} ${start.y} C ${start.x+(right?bend:-bend)} ${start.y}, ${end.x+(right?-bend:bend)} ${end.y}, ${end.x} ${end.y}`;
};
