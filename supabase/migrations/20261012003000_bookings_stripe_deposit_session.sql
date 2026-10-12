-- Store the Stripe Checkout Session that collected the website deposit.
-- Apply this in the Chance Classics project when Tim approves. It is not applied by this pull request.
-- balance_due_usd is already generated as total_usd - amount_paid_usd. This migration does not change it.
-- stripe_balance_session_id stays the later balance payment and is not reused for the deposit.

alter table rental.bookings
  add column if not exists stripe_deposit_session_id text;

comment on column rental.bookings.stripe_deposit_session_id is
  'Stripe Checkout Session id that collected the non-refundable deposit.';

create unique index if not exists bookings_stripe_deposit_session_id_key
  on rental.bookings (stripe_deposit_session_id)
  where stripe_deposit_session_id is not null;
