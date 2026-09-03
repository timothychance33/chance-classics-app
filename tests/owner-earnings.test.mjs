import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

assert.match(html, /<button data-tab="staff">Drivers<\/button>\s*<button data-tab="earnings">Earnings<\/button>/,
  'Earnings tab sits next to Drivers');
assert.match(html, /id="panel-earnings"/, 'Earnings panel exists');
assert.match(html, /id="tabSelect"/, 'owner nav collapses to a select on the phone');
assert.match(html, /class="monthnav"/, 'month is a stepper/select, not a chip strip');
assert.doesNotMatch(html, /class="monthchip/, 'old month chips are gone');
assert.match(html, /previewlbl">View as/, 'role-preview stays labeled View as');
assert.match(html, /<button data-role="admin" class="active">Owner<\/button>/, 'Owner preview role stays');
assert.match(html, /<button data-role="driver">Driver<\/button>/, 'Driver preview role stays');
assert.match(html, /<button data-tab="staff">Drivers<\/button>/, 'Drivers tab is unchanged');
assert.match(html, /function wixPriceFromNotes/, 'reads Wix Price line from notes');
assert.match(html, /function wixPriceDetailsFromNotes/, 'parses remaining due from the Wix Price line');
assert.match(html, /function ownerCustomerAmountTagHtml/, 'owner booking card can show the customer amount');
assert.match(html, /function notesForViewer/, 'staff notes hide the Wix Price line');
assert.match(html, /function showOwnerCustomerAmount/, 'customer dollars use the owner gate');
assert.match(html, /function isOwnerView/, 'owner tabs and dollars share the same gate');
assert.match(html, /OWNER_ONLY_TABS=\[\'staff\',\'earnings\',\'quotes\'\]/, 'staff nav hides Quotes, Earnings, Drivers');
assert.match(html, /Customer amount/, 'booking detail has an owner customer-amount row');
assert.match(html, /class="amttag"/, 'amount tag style exists');
assert.match(html, /price\.value/, 'names the Wix field the sync already writes');
assert.match(html, /function isEarningBooking/, 'earning-status helper exists');
assert.match(html, /function buildOwnerEarnings/, 'owner earnings rollup exists');
assert.match(html, /America\/Chicago/, 'Chicago calendar is named');
assert.match(html, /one car per booking/, 'multi-car note is in the UI');
assert.doesNotMatch(html, /service_role/, 'no service_role in the browser app');

const EARNING_STATUSES=['confirmed','prepping','ready','out','completed'];
function isEarningBooking(b){
  if(!b||b.status==='cancelled') return false;
  if(EARNING_STATUSES.includes(b.status)) return true;
  if(b.status==='new') return !!(b.driver_id || b.payment_status==='paid' || b.payment_status==='deposit');
  return false;
}
function bookingInYear(b, year){return !!(b.event_date && b.event_date.slice(0,4)===String(year))}
function bookingInMonth(b, year, month){
  const mm=String(month).padStart(2,'0');
  return !!(b.event_date && b.event_date.slice(0,7)===`${year}-${mm}`);
}
function normEmail(e){return (e||'').toString().toLowerCase().trim()}
function wixPriceDetailsFromNotes(notes){
  if(!notes) return null;
  const m=String(notes).match(/Price:\s*\$([0-9]+(?:\.[0-9]+)?)(?:\s*\(\$?([0-9]+(?:\.[0-9]+)?)\s*due\))?/i);
  if(!m) return null;
  const amount=parseFloat(m[1]);
  if(!Number.isFinite(amount)) return null;
  const due=m[2]!=null?parseFloat(m[2]):null;
  return {amount, due:Number.isFinite(due)?due:null};
}
function wixPriceFromNotes(notes){
  const d=wixPriceDetailsFromNotes(notes);
  return d?d.amount:null;
}
function notesForViewer(notes, ownerView){
  if(!notes) return notes;
  if(ownerView) return notes;
  return String(notes).split('\n').filter(line=>!/^\s*Price:\s*\$/i.test(line)).join('\n').trim();
}
function moneyFmt(n){
  const v=Number(n)||0;
  return '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function ownerCustomerAmountLabel(charge){
  if(!charge) return '';
  return moneyFmt(charge.amount)+(charge.due!=null?` · ${moneyFmt(charge.due)} due`:'');
}
function bookingGrossAmount(b, quoteMap){
  const fromNotes=wixPriceFromNotes(b&&b.notes);
  if(fromNotes!=null) return fromNotes;
  const q=quoteMap&&b?quoteMap[b.id]:null;
  if(q && q.total!=null && !Number.isNaN(Number(q.total))) return Number(q.total);
  return null;
}
function assignQuotesToBookings(bookings, quotes){
  const used=new Set();
  const map={};
  const usable=(quotes||[]).filter(q=>q && q.total!=null && !Number.isNaN(Number(q.total)));
  const take=(b, pred)=>{
    const q=usable.find(x=>!used.has(x.id) && pred(x,b));
    if(q){ used.add(q.id); map[b.id]=q; return true; }
    return false;
  };
  for(const b of bookings||[]){
    const em=normEmail(b.customer_email);
    if(!em||!b.event_date) continue;
    take(b, q=>normEmail(q.customer_email)===em && q.event_date===b.event_date);
  }
  for(const b of bookings||[]){
    if(map[b.id]) continue;
    const em=normEmail(b.customer_email);
    if(!em||!b.car_id) continue;
    take(b, q=>normEmail(q.customer_email)===em && q.car_id===b.car_id);
  }
  for(const b of bookings||[]){
    if(map[b.id]) continue;
    const em=normEmail(b.customer_email);
    if(!em) continue;
    take(b, q=>normEmail(q.customer_email)===em);
  }
  return map;
}
function bookingDriverPayAmount(b, staff){
  if(!b.driver_id||b.pay_tier==null) return 0;
  const d=(staff||[]).find(s=>s.id===b.driver_id);
  if(!d||d.pay_rate==null) return 0;
  return Number(b.pay_tier*d.pay_rate)||0;
}
function sumEarnings(list, quoteMap, staff){
  let gross=0, driverPay=0, unknown=0, unknownPay=0, known=0;
  for(const b of list){
    const g=bookingGrossAmount(b, quoteMap);
    const pay=bookingDriverPayAmount(b, staff);
    if(g==null){
      unknown++;
      unknownPay+=pay;
    }else{
      known++;
      gross+=g;
      driverPay+=pay;
    }
  }
  return {
    gross, driverPay,
    net: list.length===0 ? 0 : (known ? gross-driverPay : null),
    jobs:list.length, known, unknown, unknownPay
  };
}
function buildOwnerEarnings(data, selected, today){
  const day=today;
  const month=selected||{year:day.year, month:day.month};
  const staff=data.staff||[];
  const bookings=(data.bookings||[]).filter(isEarningBooking);
  const quoteMap=assignQuotesToBookings(bookings, data.quotes||[]);
  const ytd=bookings.filter(b=>bookingInYear(b, day.year) && b.event_date && b.event_date<=day.iso);
  const monthly=bookings.filter(b=>bookingInMonth(b, month.year, month.month));
  const company={
    allTime:sumEarnings(bookings, quoteMap, staff),
    ytd:sumEarnings(ytd, quoteMap, staff),
    month:sumEarnings(monthly, quoteMap, staff)
  };
  const cars=[...(data.cars||[])].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  const perCar=cars.map(car=>{
    const mine=bookings.filter(b=>b.car_id===car.id);
    return {
      car,
      allTime:sumEarnings(mine, quoteMap, staff),
      ytd:sumEarnings(mine.filter(b=>bookingInYear(b, day.year) && b.event_date && b.event_date<=day.iso), quoteMap, staff),
      month:sumEarnings(mine.filter(b=>bookingInMonth(b, month.year, month.month)), quoteMap, staff)
    };
  });
  const missingAmount=bookings.filter(b=>bookingGrossAmount(b, quoteMap)==null).length;
  return {company, perCar, missingAmount, jobCount:bookings.length};
}

assert.equal(wixPriceFromNotes('Event Location: chapel\nPrice: $1201.75 ($200 due)'), 1201.75);
assert.equal(wixPriceFromNotes('no money here'), null);
assert.deepEqual(wixPriceDetailsFromNotes('Price: $764.75 ($514.75 due)'), {amount:764.75, due:514.75});
assert.deepEqual(wixPriceDetailsFromNotes('Price: $660'), {amount:660, due:null});
assert.equal(wixPriceDetailsFromNotes('Event Location: Benton'), null);
assert.equal(ownerCustomerAmountLabel({amount:764.75, due:514.75}), '$764.75 · $514.75 due');
assert.equal(ownerCustomerAmountLabel({amount:660, due:null}), '$660.00');
assert.equal(notesForViewer('Event Location: chapel\nPrice: $880 ($200 due)', true),
  'Event Location: chapel\nPrice: $880 ($200 due)');
assert.equal(notesForViewer('Event Location: chapel\nPrice: $880 ($200 due)', false),
  'Event Location: chapel');
assert.equal(notesForViewer('Price: $550', false), '');
assert.equal(isEarningBooking({status:'completed'}), true);
assert.equal(isEarningBooking({status:'cancelled',payment_status:'paid',driver_id:'d1'}), false);
assert.equal(isEarningBooking({status:'new',payment_status:'unpaid',driver_id:null}), false);
assert.equal(isEarningBooking({status:'new',payment_status:'deposit'}), true);

const staff=[{id:'d1',pay_rate:50},{id:'d2',pay_rate:40}];
const mustang={id:'c1',name:'1967 Mustang',status:'available'};
const chevy={id:'c2',name:'1957 Chevy Bel Air',status:'available'};
const today={year:2026, month:9, day:2, iso:'2026-09-02'};

// Wix Price line wins; quote is fallback; missing amount is not $0 vs driver pay
const data={
  cars:[mustang, chevy],
  staff,
  bookings:[
    {id:'b1',car_id:'c1',driver_id:'d1',status:'completed',payment_status:'paid',pay_tier:2,
      event_date:'2026-08-29',customer_email:'a@example.com',
      notes:'Price: $764.75',source:'wix'},
    {id:'b2',car_id:'c1',driver_id:'d1',status:'confirmed',payment_status:'unpaid',pay_tier:3,
      event_date:'2026-09-06',customer_email:'b@example.com'},
    {id:'b3',car_id:'c1',driver_id:'d2',status:'completed',payment_status:'paid',pay_tier:2,
      event_date:'2025-06-14',customer_email:'c@example.com',
      notes:'Price: $1100'},
    {id:'b4',car_id:'c1',driver_id:'d2',status:'cancelled',payment_status:'paid',pay_tier:2,
      event_date:'2026-08-01',customer_email:'d@example.com',notes:'Price: $700'},
    {id:'b5',car_id:'c1',driver_id:null,status:'new',payment_status:'unpaid',pay_tier:null,
      event_date:'2026-09-10',customer_email:'e@example.com'},
    {id:'b6',car_id:'c1',driver_id:'d1',status:'confirmed',payment_status:'deposit',pay_tier:2,
      event_date:'2026-10-12',customer_email:'noline@example.com',
      notes:'Event Location: Benton',source:'wix'},
  ],
  quotes:[
    {id:'q1',customer_email:'a@example.com',event_date:'2026-08-29',car_id:'c1',status:'booked',total:550},
    {id:'q2',customer_email:'b@example.com',event_date:'2026-09-06',car_id:'c1',status:'sent',total:880},
    {id:'q3',customer_email:'c@example.com',event_date:'2025-06-14',car_id:'c1',status:'booked',total:9999},
    {id:'q5',customer_email:'e@example.com',event_date:'2026-09-10',car_id:'c1',status:'quoted',total:300},
  ]
};

const allTime=buildOwnerEarnings(data, {year:2026, month:10}, today);
assert.equal(allTime.jobCount, 4, 'cancelled and unpaid new draft are excluded');
assert.equal(allTime.company.allTime.gross, 764.75+880+1100, 'Wix Price wins; quote is fallback');
assert.equal(allTime.company.allTime.driverPay, 100+150+80, 'driver pay only on jobs with gross');
assert.equal(allTime.company.allTime.net, (764.75+880+1100)-(100+150+80));
assert.equal(allTime.company.allTime.unknown, 1);
assert.equal(allTime.company.allTime.unknownPay, 100, 'October Wix job pay is not subtracted from $0');
assert.equal(allTime.missingAmount, 1);

assert.equal(allTime.company.ytd.gross, 764.75, 'YTD uses Price line, not the unused quote 550');
assert.equal(allTime.company.ytd.driverPay, 100);
assert.equal(allTime.company.ytd.net, 764.75-100);

const october=allTime.company.month;
assert.equal(october.jobs, 1);
assert.equal(october.known, 0);
assert.equal(october.gross, 0);
assert.equal(october.net, null, 'no fake negative when October has driver pay and no amount');
assert.equal(october.unknownPay, 100);

const chevyRow=allTime.perCar.find(r=>r.car.id==='c2');
assert.ok(chevyRow, 'idle roster car is listed');
assert.equal(chevyRow.allTime.jobs, 0);
assert.equal(chevyRow.allTime.net, 0);

// Quote-only month still works
const sept=buildOwnerEarnings(data, {year:2026, month:9}, today);
assert.equal(sept.company.month.gross, 880);
assert.equal(sept.company.month.driverPay, 150);

console.log('owner-earnings tests passed');
