-- Saved card from deposit checkout, off-session charges, and the Monday balance reminder.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when Tim approves.
-- It is not applied by this pull request.
-- balance_due_usd stays generated as total_usd - amount_paid_usd. Do not write it.

alter table rental.bookings
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_payment_method_id text,
  add column if not exists balance_reminder_sent_at timestamptz;

comment on column rental.bookings.stripe_customer_id is
  'Stripe Customer created when the deposit checkout saved the card.';

comment on column rental.bookings.stripe_payment_method_id is
  'Card saved at deposit checkout for the balance, extra hours, mileage overages, and damage.';

comment on column rental.bookings.balance_reminder_sent_at is
  'When the Monday-before balance reminder email was accepted. Null means it has not been sent.';

create table if not exists rental.booking_charges (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references rental.bookings(id) on delete cascade,
  amount_usd numeric(12,2) not null check (amount_usd > 0),
  reason text not null check (reason in ('balance', 'overage', 'damage')),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'authentication_required')),
  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  pay_url text,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table rental.booking_charges is
  'Off-session and pay-link charges for a booking. Service role only. balance_due_usd is not stored here.';

create unique index if not exists booking_charges_stripe_payment_intent_id_key
  on rental.booking_charges (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index if not exists booking_charges_stripe_checkout_session_id_key
  on rental.booking_charges (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists booking_charges_booking_id_idx
  on rental.booking_charges (booking_id);

alter table rental.booking_charges enable row level security;

revoke all on table rental.booking_charges from anon, authenticated;
grant select, insert, update, delete on table rental.booking_charges to service_role;
