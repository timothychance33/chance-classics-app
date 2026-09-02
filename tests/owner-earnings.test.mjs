import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

assert.match(html, /<button data-tab="staff">Drivers<\/button>\s*<button data-tab="earnings">Earnings<\/button>/,
  'Earnings tab sits next to Drivers');
assert.match(html, /id="panel-earnings"/, 'Earnings panel exists');
assert.match(html, /previewlbl">View as/, 'role-preview stays labeled View as');
assert.match(html, /<button data-role="admin" class="active">Owner<\/button>/, 'Owner preview role stays');
assert.match(html, /<button data-role="driver">Driver<\/button>/, 'Driver preview role stays');
assert.match(html, /<button data-tab="staff">Drivers<\/button>/, 'Drivers tab is unchanged');
assert.match(html, /function isEarningBooking/, 'earning-status helper exists');
assert.match(html, /function buildOwnerEarnings/, 'owner earnings rollup exists');
assert.match(html, /function assignQuotesToBookings/, 'quote match helper exists');
assert.match(html, /America\/Chicago/, 'Chicago calendar is named');
assert.match(html, /same customer email/, 'gross is labeled as quote-total match');
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
  let gross=0, driverPay=0;
  for(const b of list){
    const q=quoteMap[b.id];
    gross += q?Number(q.total)||0:0;
    driverPay += bookingDriverPayAmount(b, staff);
  }
  return {gross, driverPay, net:gross-driverPay, jobs:list.length};
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
  const unassigned=bookings.filter(b=>!b.car_id);
  return {company, perCar, unassignedCount:unassigned.length,
    unmatchedCount:bookings.filter(b=>!quoteMap[b.id]).length, jobCount:bookings.length};
}

assert.equal(isEarningBooking({status:'completed'}), true);
assert.equal(isEarningBooking({status:'confirmed',payment_status:'unpaid'}), true);
assert.equal(isEarningBooking({status:'prepping'}), true);
assert.equal(isEarningBooking({status:'ready'}), true);
assert.equal(isEarningBooking({status:'out'}), true);
assert.equal(isEarningBooking({status:'cancelled',payment_status:'paid',driver_id:'d1'}), false);
assert.equal(isEarningBooking({status:'new',payment_status:'unpaid',driver_id:null}), false);
assert.equal(isEarningBooking({status:'new',payment_status:'deposit'}), true);
assert.equal(isEarningBooking({status:'new',driver_id:'d1',payment_status:'unpaid'}), true);

const staff=[
  {id:'d1',pay_rate:50},
  {id:'d2',pay_rate:40},
];
assert.equal(bookingDriverPayAmount({driver_id:'d1',pay_tier:3}, staff), 150);
assert.equal(bookingDriverPayAmount({driver_id:'d2',pay_tier:2}, staff), 80);
assert.equal(bookingDriverPayAmount({driver_id:null,pay_tier:2}, staff), 0);

const mustang={id:'c1',name:'1967 Mustang',status:'available'};
const chevy={id:'c2',name:'1957 Chevy Bel Air',status:'available'};
const today={year:2026, month:9, day:2, iso:'2026-09-02'};
const data={
  cars:[mustang, chevy],
  staff,
  bookings:[
    {id:'b1',car_id:'c1',driver_id:'d1',status:'completed',payment_status:'paid',pay_tier:2,
      event_date:'2026-08-29',customer_email:'a@example.com'},
    {id:'b2',car_id:'c1',driver_id:'d1',status:'confirmed',payment_status:'unpaid',pay_tier:3,
      event_date:'2026-09-06',customer_email:'b@example.com'},
    {id:'b3',car_id:'c1',driver_id:'d2',status:'completed',payment_status:'paid',pay_tier:2,
      event_date:'2025-06-14',customer_email:'c@example.com'},
    {id:'b4',car_id:'c1',driver_id:'d2',status:'cancelled',payment_status:'paid',pay_tier:2,
      event_date:'2026-08-01',customer_email:'d@example.com'},
    {id:'b5',car_id:'c1',driver_id:null,status:'new',payment_status:'unpaid',pay_tier:null,
      event_date:'2026-09-10',customer_email:'e@example.com'},
  ],
  quotes:[
    {id:'q1',customer_email:'a@example.com',event_date:'2026-08-29',car_id:'c1',status:'booked',total:550},
    {id:'q2',customer_email:'b@example.com',event_date:'2026-09-06',car_id:'c1',status:'sent',total:880},
    {id:'q3',customer_email:'c@example.com',event_date:'2025-06-14',car_id:'c1',status:'booked',total:1100},
    {id:'q4',customer_email:'d@example.com',event_date:'2026-08-01',car_id:'c1',status:'booked',total:700},
    {id:'q5',customer_email:'e@example.com',event_date:'2026-09-10',car_id:'c1',status:'quoted',total:300},
  ]
};

const allTime=buildOwnerEarnings(data, {year:2026, month:9}, today);
assert.equal(allTime.jobCount, 3, 'cancelled and unpaid new draft are excluded');
assert.equal(allTime.company.allTime.gross, 550+880+1100);
assert.equal(allTime.company.allTime.driverPay, 100+150+80);
assert.equal(allTime.company.allTime.net, (550+880+1100)-(100+150+80));
assert.equal(allTime.company.ytd.gross, 550, 'YTD is Chicago year through today — future Sep job is not YTD');
assert.equal(allTime.company.ytd.driverPay, 100);
assert.equal(allTime.company.month.gross, 880, 'selected September includes the accepted unpaid job');
assert.equal(allTime.company.month.driverPay, 150);
assert.equal(allTime.unmatchedCount, 0);

const mustangRow=allTime.perCar.find(r=>r.car.id==='c1');
const chevyRow=allTime.perCar.find(r=>r.car.id==='c2');
assert.ok(chevyRow, 'idle roster car is listed');
assert.equal(chevyRow.allTime.gross, 0);
assert.equal(chevyRow.allTime.driverPay, 0);
assert.equal(chevyRow.allTime.net, 0);
assert.equal(mustangRow.allTime.gross, 550+880+1100);
assert.equal(mustangRow.month.gross, 880);

const august=buildOwnerEarnings(data, {year:2026, month:8}, today);
assert.equal(august.company.month.gross, 550);
assert.equal(august.company.month.driverPay, 100);

// One quote per booking — two jobs, one email, only the dated match + leftover email match once
const shared={
  cars:[mustang],
  staff,
  bookings:[
    {id:'x1',car_id:'c1',driver_id:'d1',status:'completed',pay_tier:1,event_date:'2026-04-01',customer_email:'same@example.com'},
    {id:'x2',car_id:'c1',driver_id:'d1',status:'completed',pay_tier:1,event_date:'2026-05-01',customer_email:'same@example.com'},
  ],
  quotes:[
    {id:'qx',customer_email:'same@example.com',event_date:'2026-04-01',car_id:'c1',status:'booked',total:400},
  ]
};
const sharedRep=buildOwnerEarnings(shared, {year:2026, month:4}, today);
assert.equal(sharedRep.company.allTime.gross, 400, 'a single quote is not double-counted');
assert.equal(sharedRep.unmatchedCount, 1);

console.log('owner-earnings tests passed');
