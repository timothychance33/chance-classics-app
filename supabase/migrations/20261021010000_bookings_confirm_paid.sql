-- Confirm a booking that already has a deposit or a full payment.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when the owner approves.
-- It is not applied by this pull request.
--
-- No new table. rental.bookings already has row level security, and this
-- trigger does not add a policy. Supabase stops auto-granting new tables on
-- Oct 30, 2026; that change does not apply here. Execute is granted on the
-- function the same way as the driver-claim overlap trigger.
--
-- Only status 'new' moves to 'confirmed'. Cancelled, declined, and later
-- statuses (prepping, ready, out, completed, and an already confirmed row)
-- are left alone. A website hold stays a hold until the deposit checkout
-- writes confirmed itself.
-- The one-time update below catches rows already stored as new + deposit/paid
-- (Wix imports included). Later inserts and updates hit the trigger.

create or replace function rental.confirm_paid_booking()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
begin
  if lower(coalesce(new.status, '')) = 'new'
     and lower(coalesce(new.payment_status, '')) in ('deposit', 'paid') then
    new.status := 'confirmed';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_confirm_paid on rental.bookings;

create trigger bookings_confirm_paid
  before insert or update
  on rental.bookings
  for each row
  execute function rental.confirm_paid_booking();

revoke all on function rental.confirm_paid_booking() from public;
revoke all on function rental.confirm_paid_booking() from anon;
grant execute on function rental.confirm_paid_booking() to authenticated;
grant execute on function rental.confirm_paid_booking() to service_role;

comment on function rental.confirm_paid_booking() is
  'Promotes rental.bookings from new to confirmed when payment_status is deposit or paid. Does not override cancelled, declined, or later statuses.';

update rental.bookings
set status = 'confirmed'
where lower(status) = 'new'
  and lower(payment_status) in ('deposit', 'paid');
