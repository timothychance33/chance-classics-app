import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const sw = readFileSync(join(root, 'sw.js'), 'utf8');

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
const helperSrc=[
  'loadSpecs','loadTableQuery','isTransientLoadError','loadErrorLabel',
  'formatLoadFailures','loadOneSpec','loadOneSpecRetry',
].map(n=>extractFunction(html, n)).join('\n');

assert.match(html, /const AUTO_MATCH_TIMEOUT_MS=8000/, 'each quote update has an 8s timeout');
assert.match(html, /const AUTO_MATCH_MAX_UPDATES=25/, 'auto-match caps awaited updates');
assert.match(loadAllSrc, /renderAll\(\)/, 'loadAll paints after DATA is assigned');
assert.match(loadAllSrc, /scheduleAutoMatchQuotes\(\)/, 'loadAll schedules quote matching after paint');
assert.doesNotMatch(loadAllSrc, /await autoMatchQuotes\(\)/, 'loadAll must not await matching before paint');
assert.ok(
  loadAllSrc.indexOf('renderAll()') < loadAllSrc.indexOf('scheduleAutoMatchQuotes()'),
  'renderAll runs before quote auto-match is scheduled'
);
assert.match(loadAllSrc, /Promise\.allSettled/, 'one table throw must not discard the others');
assert.match(loadAllSrc, /formatLoadFailures/, 'toast names which request failed');
assert.match(renderAllSrc, /try\{ fn\(\); \}/, 'each panel render is isolated');
assert.match(renderAllSrc, /toast\('Display error: '/, 'a render failure shows a toast');
assert.match(afterPaintSrc, /renderQuotes\(\)/, 'quiet quotes refresh after matches');
assert.match(scheduleSrc, /requestAnimationFrame/, 'auto-match waits for a paint frame');
assert.match(autoMatchSrc, /withTimeout\(/, 'quote updates are raced against a timeout');
assert.match(autoMatchSrc, /if\(updates>=AUTO_MATCH_MAX_UPDATES\) break/, 'stops after the update cap');

assert.match(html, /function isIOSDevice/, 'iOS standalone is detected');
assert.match(html, /function clearChanceClassicsPWA/, 'stale SW/cache can be dropped');
assert.match(html, /function bootApp/, 'boot goes through PWA cleanup before init');
assert.match(html, /if\(!isIOSDevice\(\) && 'serviceWorker' in navigator\)/, 'iOS does not register a SW');
assert.match(html, /cc_ios_sw_cleared/, 'controlled iOS PWA reloads once after unregister');
assert.doesNotMatch(html, /window\.addEventListener\('load',\(\)=>\{\s*navigator\.serviceWorker\.register/,
  'SW is no longer registered on every window.load');

assert.match(sw, /chance-classics-v6/, 'shell cache bumped so a poisoned v5 is dropped');
assert.doesNotMatch(sw, /clients\.claim\(/, 'SW must not claim the open page');
assert.match(sw, /if\(req\.method !== 'GET'\) return/, 'SW ignores non-GET');
assert.match(sw, /isCrossOrigin/, 'SW never intercepts supabase / other origins');
assert.match(sw, /res\.type === 'basic'/, 'SW does not cache opaque or error bodies');
assert.match(sw, /req\.mode === 'navigate'/, 'index.html fallback is navigation-only');

function evalHelpers(extra){
  const sandbox={
    DATA:{cars:[],staff:[],bookings:[],prep:[],templates:[],quotes:[]},
    SB:null,
    setTimeout, clearTimeout, Promise, console,
    AUTO_MATCH_TIMEOUT_MS:8000,
    AUTO_MATCH_MAX_UPDATES:25,
    isAdmin:()=>false,
    renderAll(){},
    scheduleAutoMatchQuotes(){},
    toast(){},
    ...extra,
  };
  vm.createContext(sandbox);
  vm.runInContext(helperSrc+'\n'+withTimeoutSrc+'\n'+autoMatchSrc+'\n'+loadAllSrc, sandbox);
  return sandbox;
}

// ---- formatLoadFailures names the request, matching the iPhone toast ----
{
  const s=evalHelpers();
  const err=new TypeError('Load failed');
  assert.equal(s.isTransientLoadError(err), true);
  assert.equal(s.isTransientLoadError(new Error('permission denied')), false);
  assert.equal(s.loadErrorLabel(err, 'bookings'), 'bookings — TypeError: Load failed');
  assert.equal(
    s.formatLoadFailures([{key:'cars',error:err},{key:'bookings',error:err}]),
    'TypeError: Load failed (cars, bookings)'
  );
}

// ---- withTimeout must reject a hung promise ----
{
  const s=evalHelpers();
  const hungStart=Date.now();
  await assert.rejects(()=>s.withTimeout(new Promise(()=>{}), 40, 'autoMatchQuotes update timeout'), /autoMatchQuotes update timeout/);
  assert.ok(Date.now()-hungStart < 400, 'timeout must not wait forever');
  assert.equal(await s.withTimeout(Promise.resolve('ok'), 200, 't'), 'ok');
}

// ---- autoMatchQuotes times out a hung PATCH ----
{
  const s=evalHelpers({
    DATA:{
      quotes:[{id:'q1', status:'sent', customer_email:'wedding@example.com'}],
      bookings:[{id:'b1', customer_email:'wedding@example.com'}],
    },
    SB:{ from(){ return { update(){ return { eq(){ return new Promise(()=>{}); } }; }, select(){ return { order(){ return new Promise(()=>{}); } }; } }; } },
    AUTO_MATCH_TIMEOUT_MS:50,
  });
  vm.runInContext(withTimeoutSrc+'\n'+autoMatchSrc, s);
  const matchStart=Date.now();
  const changed=await s.autoMatchQuotes();
  assert.equal(changed, false);
  assert.ok(Date.now()-matchStart < 500);
  assert.equal(s.DATA.quotes[0].status, 'sent');
}

// ---- successful match honors the update cap ----
{
  const calls=[];
  const quotes=[
    {id:'q-a', status:'sent', customer_email:'a@x.com'},
    {id:'q-b', status:'sent', customer_email:'b@x.com'},
    {id:'q-c', status:'sent', customer_email:'c@x.com'},
  ];
  const s=evalHelpers({
    DATA:{
      quotes,
      bookings:[
        {id:'b-a', customer_email:'a@x.com'},
        {id:'b-b', customer_email:'b@x.com'},
        {id:'b-c', customer_email:'c@x.com'},
      ],
    },
    SB:{
      from(){
        return {
          update(payload){ return { eq(_col, id){ calls.push({id, payload}); return Promise.resolve({error:null}); } }; },
          select(){ return { order(){ return Promise.resolve({data:quotes}); } }; },
        };
      },
    },
    AUTO_MATCH_TIMEOUT_MS:200,
    AUTO_MATCH_MAX_UPDATES:2,
  });
  const okChanged=await s.autoMatchQuotes();
  assert.equal(okChanged, true);
  assert.deepEqual(calls.map(c=>c.id), ['q-a','q-b']);
  assert.equal(s.DATA.quotes[2].status, 'sent');
}

function mockSB(rows, {failTables=[], failOnceTables=[], errorObj=null}={}){
  const once=new Set(failOnceTables);
  return {
    from(table){
      return {
        select(){
          return {
            order(){
              if(once.has(table)){
                once.delete(table);
                return Promise.reject(new TypeError('Load failed'));
              }
              if(failTables.includes(table)){
                return Promise.reject(errorObj || new TypeError('Load failed'));
              }
              return Promise.resolve({data:rows[table]||[], error:null});
            },
          };
        },
      };
    },
  };
}

const sampleRows={
  cars:[{id:'c1'}],
  staff:[{id:'s1'}],
  bookings:[{id:'b1', customer_name:'Wedding', customer_email:'a@x.com', event_date:'2026-10-10'}],
  booking_prep_tasks:[],
  car_prep_templates:[],
  quote_requests:[{id:'q1', status:'sent', customer_email:'a@x.com'}],
};

// ---- loadAll paints even when auto-match never finishes ----
{
  const order=[];
  const toasts=[];
  const s=evalHelpers({
    SB:mockSB(sampleRows),
    isAdmin:()=>true,
    renderAll(){ order.push('renderAll'); },
    scheduleAutoMatchQuotes(){ order.push('scheduleAutoMatch'); },
    toast(msg){ toasts.push(msg); },
  });
  await s.loadAll();
  assert.deepEqual(order, ['renderAll','scheduleAutoMatch']);
  assert.equal(s.DATA.bookings.length, 1);
  assert.deepEqual(toasts, []);
}

// ---- one table TypeError: Load failed still paints the rest and names it ----
{
  const order=[];
  const toasts=[];
  const s=evalHelpers({
    SB:mockSB(sampleRows, {failTables:['quote_requests']}),
    isAdmin:()=>true,
    renderAll(){ order.push('renderAll'); },
    scheduleAutoMatchQuotes(){ order.push('scheduleAutoMatch'); },
    toast(msg){ toasts.push(msg); },
  });
  await s.loadAll();
  assert.deepEqual(order, ['renderAll','scheduleAutoMatch']);
  assert.equal(s.DATA.bookings[0].customer_name, 'Wedding', 'bookings still assigned');
  assert.equal(s.DATA.quotes.length, 0);
  assert.match(toasts[0], /quotes/);
  assert.match(toasts[0], /Load failed/);
}

// ---- every table Load failed still calls renderAll (empty states, not blank shells) ----
{
  const order=[];
  const toasts=[];
  const s=evalHelpers({
    SB:mockSB(sampleRows, {failTables:Object.keys(sampleRows)}),
    isAdmin:()=>false,
    renderAll(){ order.push('renderAll'); },
    scheduleAutoMatchQuotes(){ order.push('scheduleAutoMatch'); },
    toast(msg){ toasts.push(msg); },
  });
  await s.loadAll();
  assert.deepEqual(order, ['renderAll']);
  assert.equal(s.DATA.bookings.length, 0);
  assert.match(toasts[0], /TypeError: Load failed \(cars, staff, bookings, prep, templates, quotes\)/);
}

// ---- transient Load failed is retried once ----
{
  const s=evalHelpers({
    SB:mockSB(sampleRows, {failOnceTables:['bookings']}),
    isAdmin:()=>false,
    renderAll(){},
    toast(){ throw new Error('should not toast after a successful retry'); },
  });
  await s.loadAll();
  assert.equal(s.DATA.bookings[0].id, 'b1');
}

// Isolated panel throw still runs later panels
{
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
  ]);
}

console.log('load-paint-first tests passed');
