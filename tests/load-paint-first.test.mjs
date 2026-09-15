import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

function extractFunction(src, name){
  const re=new RegExp(`(?:async )?function ${name}\\(`);
  const start=src.search(re);
  if(start<0) throw new Error('missing function '+name);
  let i=src.indexOf('{', start);
  let depth=0;
  for(; i<src.length; i++){
    if(src[i]==='{') depth++;
    else if(src[i]==='}'){ depth--; if(depth===0) return src.slice(start, i+1); }
  }
  throw new Error('unclosed function '+name);
}

const loadAllSrc=extractFunction(html, 'loadAll');
const renderAllSrc=extractFunction(html, 'renderAll');
const autoMatchSrc=extractFunction(html, 'autoMatchQuotes');
const afterPaintSrc=extractFunction(html, 'autoMatchQuotesAfterPaint');
const scheduleSrc=extractFunction(html, 'scheduleAutoMatchQuotes');
const withTimeoutSrc=extractFunction(html, 'withTimeout');

assert.match(html, /const AUTO_MATCH_TIMEOUT_MS=8000/, 'each quote update has an 8s timeout');
assert.match(html, /const AUTO_MATCH_MAX_UPDATES=25/, 'auto-match caps awaited updates');
assert.match(loadAllSrc, /renderAll\(\);/, 'loadAll paints after DATA is assigned');
assert.match(loadAllSrc, /scheduleAutoMatchQuotes\(\)/, 'loadAll schedules quote matching after paint');
assert.doesNotMatch(loadAllSrc, /await autoMatchQuotes\(\)/, 'loadAll must not await matching before paint');
assert.ok(
  loadAllSrc.indexOf('renderAll();') < loadAllSrc.indexOf('scheduleAutoMatchQuotes()'),
  'renderAll runs before quote auto-match is scheduled'
);
assert.match(renderAllSrc, /try\{ fn\(\); \}/, 'each panel render is isolated');
assert.match(renderAllSrc, /toast\('Display error: '/, 'a render failure shows a toast');
assert.match(afterPaintSrc, /renderQuotes\(\)/, 'quiet quotes refresh after matches');
assert.match(scheduleSrc, /requestAnimationFrame/, 'auto-match waits for a paint frame');
assert.match(autoMatchSrc, /withTimeout\(/, 'quote updates are raced against a timeout');
assert.match(autoMatchSrc, /if\(updates>=AUTO_MATCH_MAX_UPDATES\) break/, 'stops after the update cap');

// ---- executable: withTimeout must reject a hung promise ----
const timeoutSandbox={
  setTimeout, clearTimeout, Promise,
  console,
};
vm.createContext(timeoutSandbox);
vm.runInContext(withTimeoutSrc, timeoutSandbox);
const hungStart=Date.now();
await assert.rejects(
  ()=>vm.runInContext('withTimeout(new Promise(()=>{}), 40, "autoMatchQuotes update timeout")', timeoutSandbox),
  /autoMatchQuotes update timeout/
);
assert.ok(Date.now()-hungStart < 400, 'timeout must not wait forever');

const resolved=await vm.runInContext('withTimeout(Promise.resolve("ok"), 200, "t")', timeoutSandbox);
assert.equal(resolved, 'ok');

// ---- executable: autoMatchQuotes times out a hung PATCH and returns ----
function neverEq(){
  return { eq(){ return new Promise(()=>{}); } };
}
const matchSandbox={
  DATA:{
    quotes:[
      {id:'q1', status:'sent', customer_email:'wedding@example.com'},
      {id:'q2', status:'sent', customer_email:'nobody@example.com'},
    ],
    bookings:[
      {id:'b1', customer_email:'wedding@example.com'},
    ],
  },
  SB:{
    from(){
      return {
        update(){ return neverEq(); },
        select(){ return { order(){ return new Promise(()=>{}); } }; },
      };
    },
  },
  AUTO_MATCH_TIMEOUT_MS:50,
  AUTO_MATCH_MAX_UPDATES:25,
  setTimeout, clearTimeout, Promise, console,
};
vm.createContext(matchSandbox);
vm.runInContext(withTimeoutSrc, matchSandbox);
vm.runInContext(autoMatchSrc, matchSandbox);
const matchStart=Date.now();
const changed=await vm.runInContext('autoMatchQuotes()', matchSandbox);
assert.equal(changed, false, 'a hung update does not count as a match');
assert.ok(Date.now()-matchStart < 500, 'hung update must time out');
assert.equal(matchSandbox.DATA.quotes[0].status, 'sent', 'in-memory status stays sent if the update never returns');

// ---- executable: successful match, then batch cap ----
const calls=[];
const okSandbox={
  DATA:{
    quotes:[
      {id:'q-a', status:'sent', customer_email:'a@x.com'},
      {id:'q-b', status:'sent', customer_email:'b@x.com'},
      {id:'q-c', status:'sent', customer_email:'c@x.com'},
      {id:'q-skip', status:'sent', customer_email:'none@x.com'},
    ],
    bookings:[
      {id:'b-a', customer_email:'a@x.com'},
      {id:'b-b', customer_email:'b@x.com'},
      {id:'b-c', customer_email:'c@x.com'},
    ],
  },
  SB:{
    from(_table){
      return {
        update(payload){
          return { eq(_col, id){
            calls.push({id, payload});
            return Promise.resolve({error:null});
          } };
        },
        select(){
          return { order(){
            return Promise.resolve({data:[
              {id:'q-a', status:'booked', customer_email:'a@x.com'},
              {id:'q-b', status:'booked', customer_email:'b@x.com'},
              {id:'q-c', status:'sent', customer_email:'c@x.com'},
              {id:'q-skip', status:'sent', customer_email:'none@x.com'},
            ]});
          } };
        },
      };
    },
  },
  AUTO_MATCH_TIMEOUT_MS:200,
  AUTO_MATCH_MAX_UPDATES:2,
  setTimeout, clearTimeout, Promise, console,
};
vm.createContext(okSandbox);
vm.runInContext(withTimeoutSrc, okSandbox);
vm.runInContext(autoMatchSrc, okSandbox);
const okChanged=await vm.runInContext('autoMatchQuotes()', okSandbox);
assert.equal(okChanged, true);
assert.deepEqual(calls.map(c=>c.id), ['q-a','q-b'], 'only the first AUTO_MATCH_MAX_UPDATES matches are written');
assert.equal(okSandbox.DATA.quotes[0].status, 'booked');
assert.equal(okSandbox.DATA.quotes[2].status, 'sent', 'over-cap match is left for a later pass');

// ---- executable: loadAll paints even when auto-match never finishes ----
const order=[];
const loadSandbox={
  SB:{
    from(table){
      return {
        select(){
          return { order(){
            const rows={
              cars:[{id:'c1'}],
              staff:[{id:'s1'}],
              bookings:[{id:'b1', customer_name:'Wedding', customer_email:'a@x.com', event_date:'2026-10-10'}],
              booking_prep_tasks:[],
              car_prep_templates:[],
              quote_requests:[{id:'q1', status:'sent', customer_email:'a@x.com'}],
            };
            return Promise.resolve({data:rows[table]||[], error:null});
          } };
        },
      };
    },
  },
  DATA:{cars:[],staff:[],bookings:[],prep:[],templates:[],quotes:[]},
  isAdmin:()=>true,
  renderAll(){ order.push('renderAll'); },
  scheduleAutoMatchQuotes(){ order.push('scheduleAutoMatch'); },
  toast(){},
  console,
};
vm.createContext(loadSandbox);
vm.runInContext(loadAllSrc, loadSandbox);
await vm.runInContext('loadAll()', loadSandbox);
assert.deepEqual(order, ['renderAll','scheduleAutoMatch'], 'panels paint before quote matching is even scheduled');
assert.equal(loadSandbox.DATA.bookings.length, 1, 'DATA is assigned before paint');

// Isolated panel throw still runs later panels
const panelOrder=[];
const renderSandbox={
  setupRoleUI(){ panelOrder.push('setupRoleUI'); },
  renderSchedule(){ panelOrder.push('renderSchedule'); throw new Error('schedule boom'); },
  renderCalendar(){ panelOrder.push('renderCalendar'); },
  renderPrep(){ panelOrder.push('renderPrep'); },
  renderCars(){ panelOrder.push('renderCars'); },
  renderStaff(){ panelOrder.push('renderStaff'); },
  renderQuotes(){ panelOrder.push('renderQuotes'); },
  renderEarnings(){ panelOrder.push('renderEarnings'); },
  toast(msg){ panelOrder.push('toast:'+msg); },
  console:{ error(){} },
};
vm.createContext(renderSandbox);
vm.runInContext(renderAllSrc, renderSandbox);
vm.runInContext('renderAll()', renderSandbox);
assert.deepEqual(panelOrder, [
  'setupRoleUI','renderSchedule','renderCalendar','renderPrep','renderCars','renderStaff','renderQuotes','renderEarnings',
  'toast:Display error: renderSchedule',
], 'one panel throw must not leave the rest blank');

console.log('load-paint-first tests passed');
