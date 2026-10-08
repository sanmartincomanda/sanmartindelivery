import test from 'node:test';
import assert from 'node:assert/strict';
import {getMartinFlow,safePositions,INITIAL_POSITIONS,flowConnection,readerVisualState,localMartinDay} from '../src/services/martinFlowModel.js';
const state={day:'2026-10-08',today:'2026-10-08',observerEnabled:true,schedule:{open:true},cadence:{readerState:'delayed'},collection:{pendingHistories:2,completeHistories:5},evaluation:{state:'processing'},report:null};
test('mapa: no inventa estados sin datos o después de un error',()=>{
  for(const flow of [getMartinFlow(null),getMartinFlow(state,'observer',true)])
    assert.ok(flow.nodes.filter(n=>n.id!=='review').every(n=>n.state==='unknown'));
  assert.equal(getMartinFlow(state).nodes.find(n=>n.id==='reader').state,'warning');
  assert.equal(readerVisualState('outside_hours'),'waiting');
  assert.equal(readerVisualState('made-up'),'unknown');
  assert.equal(getMartinFlow({...state,report:{day:state.day,status:'partial'}}).nodes.find(n=>n.id==='report').state,'partial');
});
test('atención es un esquema no activado y cambiar de vista no modifica datos',()=>{
  const before=JSON.stringify(state),flow=getMartinFlow(state,'attention');
  assert.ok(flow.nodes.every(n=>n.state==='prepared'));assert.equal(JSON.stringify(state),before);
});
test('histórico y reporte anterior no aparecen como activos hoy',()=>{
  const flow=getMartinFlow({...state,day:'2026-10-07',cadence:{readerState:'historical'},report:{day:'2026-10-06',status:'complete',lessons:3}});
  assert.equal(flow.nodes.find(n=>n.id==='schedule').state,'paused');
  assert.equal(flow.nodes.find(n=>n.id==='report').state,'waiting');
});
test('posiciones locales se validan y las conexiones siguen a los bloques',()=>{
  assert.deepEqual(safePositions(null),INITIAL_POSITIONS);
  const positions=safePositions({input:{x:-100,y:9999},schedule:{x:NaN,y:30},secret:{x:1,y:1}});
  assert.deepEqual(positions.input,{x:10,y:414});assert.deepEqual(positions.schedule,INITIAL_POSITIONS.schedule);assert.ok(!positions.secret);
  assert.notEqual(flowConnection(INITIAL_POSITIONS.input,INITIAL_POSITIONS.schedule),flowConnection(positions.input,positions.schedule));
  assert.match(localMartinDay(),/^\d{4}-\d{2}-\d{2}$/);
});
