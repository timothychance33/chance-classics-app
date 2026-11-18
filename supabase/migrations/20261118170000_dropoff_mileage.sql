-- NOT APPLIED. Do not run this from a deploy and do not touch production
-- data from an agent. Apply it by hand in the Chance Classics project
-- (ldhmwuhhejaabsvcyzdo) when the garage and website that read these
-- columns are ready.
--
-- Drop-off mileage is separate from the Benton-to-pickup trailer fee.
-- One-way driving miles from pickup to drop-off. The first 10 are free.
-- Miles past that are charged both ways at $3:
--   fee = max(0, whole miles - 10) * 2 * 3
-- dropoff_drive_minutes is the drive back from the drop-off to the trailer
-- at pickup. Availability adds those minutes to the end of the booking.
--
-- Quotes live on rental.quote_requests. There is no rental.quotes table.
--
-- Money: dropoff_mileage_fee is hidden from drivers the same way
-- mileage_fee_usd is hidden in 20261117203000_driver_booking_select_grants.sql.
-- Miles and drive minutes stay visible, like mileage_miles and drive_minutes.
-- quote_requests stay owner-only through read_quote_requests. This file
-- does not grant the fee column there.

alter table rental.quote_requests
  add column if not exists dropoff_mileage_miles numeric,
  add column if not exists dropoff_mileage_fee numeric,
  add column if not exists dropoff_drive_minutes integer,
  add column if not exists dropoff_mileage_needs_review boolean not null default false;

alter table rental.bookings
  add column if not exists dropoff_mileage_miles numeric,
  add column if not exists dropoff_mileage_fee numeric,
  add column if not exists dropoff_drive_minutes integer,
  add column if not exists dropoff_mileage_needs_review boolean not null default false;

comment on column rental.quote_requests.dropoff_mileage_miles is
  'Whole one-way driving miles from pickup to drop-off. The first 10 are free.';
comment on column rental.quote_requests.dropoff_mileage_fee is
  'Drop-off mileage in dollars. max(0, miles - 10) * 2 * $3. Billed with the balance. Not part of the deposit.';
comment on column rental.quote_requests.dropoff_drive_minutes is
  'One-way minutes from drop-off back to the trailer at pickup.';
comment on column rental.quote_requests.dropoff_mileage_needs_review is
  'True when the pickup-to-drop-off route could not be measured. The quote is still saved.';

comment on column rental.bookings.dropoff_mileage_miles is
  'Whole one-way driving miles from pickup to drop-off. The first 10 are free.';
comment on column rental.bookings.dropoff_mileage_fee is
  'Drop-off mileage in dollars. Hidden from drivers. max(0, miles - 10) * 2 * $3. Billed with the balance.';
comment on column rental.bookings.dropoff_drive_minutes is
  'One-way minutes from drop-off back to the trailer at pickup. Added to the end of the busy window.';
comment on column rental.bookings.dropoff_mileage_needs_review is
  'True when the pickup-to-drop-off route could not be measured. The booking is still saved.';

revoke select (dropoff_mileage_fee) on table rental.bookings from authenticated, anon;

grant select (dropoff_mileage_miles, dropoff_drive_minutes, dropoff_mileage_needs_review)
  on table rental.bookings to authenticated;

-- Rebuild the garage view when it already exists so owners see the new
-- columns and drivers see a null fee. If the view is created later by
-- 20261117120000, that file already lists dropoff_mileage_fee as money.
do $$
declare
  money_cols text[] := array[
    'payment_status',
    'total_usd',
    'amount_paid_usd',
    'balance_due_usd',
    'mileage_fee_usd',
    'dropoff_mileage_fee',
    'hotel_fee_usd',
    'stripe_customer_id',
    'stripe_payment_method_id',
    'stripe_deposit_session_id',
    'stripe_balance_session_id',
    'balance_paid_at',
    'balance_payment_method',
    'balance_reminder_sent_at',
    'wix_order_number',
    'wix_booking_id',
    'tax_exempt',
    'tax_exempt_note'
  ];
  selects text := '';
  col record;
begin
  if to_regclass('rental.bookings_for_session') is null then
    return;
  end if;
  if to_regprocedure('rental.sanitize_driver_notes(text)') is null then
    raise exception
      'rental.sanitize_driver_notes(text) is missing. Apply 20261117120000_driver_safe_booking_notes.sql before rebuilding bookings_for_session.';
  end if;

  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'rental'
      and table_name = 'bookings'
    order by ordinal_position
  loop
    if selects <> '' then
      selects := selects || ', ';
    end if;
    if col.column_name = 'notes' then
      selects := selects || 'case when rental.is_admin() then b.notes else rental.sanitize_driver_notes(b.notes) end as notes';
    elsif col.column_name = any(money_cols) then
      selects := selects || format(
        'case when rental.is_admin() then b.%I else null end as %I',
        col.column_name, col.column_name
      );
    else
      selects := selects || format('b.%I', col.column_name);
    end if;
  end loop;

  execute 'drop view if exists rental.bookings_for_session';
  execute
    'create view rental.bookings_for_session with (security_barrier = true, security_invoker = false) as select '
    || selects
    || ' from rental.bookings b';
  execute 'revoke all on rental.bookings_for_session from public, anon';
  execute 'grant select on rental.bookings_for_session to authenticated, service_role';
end;
$$;

notify pgrst, 'reload schema';
