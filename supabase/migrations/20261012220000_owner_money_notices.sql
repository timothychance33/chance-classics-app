-- Owner payment emails and refund ledger.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when Tim approves.
-- It is not applied by this pull request.
-- Also apply 20261012203000_saved_card_and_charges.sql first.
-- balance_due_usd stays generated. Do not write it.

create table if not exists rental.owner_money_notices (
  notice_id text primary key,
  booking_id uuid,
  kind text not null,
  amount_usd numeric(12,2),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table rental.owner_money_notices is
  'Stripe event, payment intent, checkout session, or refund ids already emailed to the owner. Service role only.';

alter table rental.owner_money_notices enable row level security;

revoke all on table rental.owner_money_notices from anon, authenticated;
grant select, insert, update, delete on table rental.owner_money_notices to service_role;

alter table rental.booking_charges
  add column if not exists refunded_usd numeric(12,2) not null default 0;

comment on column rental.booking_charges.refunded_usd is
  'Dollars already subtracted from the booking for refunds of this charge.';

create table if not exists rental.booking_refunds (
  stripe_refund_id text primary key,
  booking_id uuid not null references rental.bookings(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  reason text not null check (reason in ('deposit', 'balance', 'overage', 'damage')),
  status text not null default 'pending' check (status in ('pending', 'applied')),
  stripe_charge_id text,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

comment on table rental.booking_refunds is
  'Refunds already subtracted from a booking. A Stripe retry hits the primary key and does not subtract again.';

create index if not exists booking_refunds_booking_id_idx
  on rental.booking_refunds (booking_id);

alter table rental.booking_refunds enable row level security;

revoke all on table rental.booking_refunds from anon, authenticated;
grant select, insert, update, delete on table rental.booking_refunds to service_role;
