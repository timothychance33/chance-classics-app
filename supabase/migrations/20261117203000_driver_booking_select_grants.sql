-- Fix the driver money lock from 20261117120000_driver_safe_booking_notes.sql.
--
-- NOT APPLIED. Do not run this from a deploy. Apply it by hand in the
-- Chance Classics project (ldhmwuhhejaabsvcyzdo) only after the garage that
-- reads rental.bookings_for_session for every login is live.
--
-- A rolled-back production test of 20261117120000 showed two breaks:
--
-- 1. rental.bookings_for_session failed for every login, including the
--    owner, with SQLSTATE 42501 permission denied for function
--    sanitize_driver_notes. A view runs its table scan as the view owner,
--    but a function call inside the view is permission-checked as the
--    role running the query. That file revoked EXECUTE from authenticated.
--    Grant it back. The function only rewrites text it is given. It does
--    not read rental.bookings.
--
-- 2. REVOKE SELECT (notes, total_usd, ...) did nothing. authenticated and
--    anon still hold table-level SELECT on rental.bookings, and a table
--    grant covers every column. Drivers could still select notes,
--    total_usd, and select *. This file revokes that table grant, clears
--    leftover column grants on the money columns, then grants column
--    SELECT on the operational columns only.
--
-- The quote_requests owner-only policy in the earlier file is the part
-- that worked. It is repeated here so this file still locks quotes if
-- that policy was rolled back with the test.
--
-- anon gets no SELECT on rental.bookings. The public site and its API
-- read bookings with the service role (site/lib/rental-db.ts). The garage
-- reads them only after sign-in, which is the authenticated role. There
-- is no anon booking query and no realtime subscription.
--
-- service_role keeps its own table grant. Edge functions stay on
-- rental.bookings. Do not point them at bookings_for_session: with no
-- user JWT, rental.is_admin() is false and the view would hide the
-- owner's money columns.
--
-- Owners still receive full notes and money from bookings_for_session,
-- because that view reads the base table as its owner and returns the
-- real columns when rental.is_admin() is true.
--
-- Apply 20261117120000 first so the function and the view exist, then
-- apply this file in the same sitting. The earlier file alone is not a
-- working lock.

do $$
begin
  if to_regprocedure('rental.sanitize_driver_notes(text)') is null then
    raise exception
      'rental.sanitize_driver_notes(text) is missing. Apply 20261117120000_driver_safe_booking_notes.sql first, then apply this file.';
  end if;
  if to_regclass('rental.bookings_for_session') is null then
    raise exception
      'rental.bookings_for_session is missing. Apply 20261117120000_driver_safe_booking_notes.sql first, then apply this file.';
  end if;
end;
$$;

-- Undo the execute revoke. Keep anon and PUBLIC from calling it.
revoke all on function rental.sanitize_driver_notes(text) from public, anon;
grant execute on function rental.sanitize_driver_notes(text) to authenticated, service_role;

grant select on rental.bookings_for_session to authenticated, service_role;
revoke all on rental.bookings_for_session from public, anon;

-- Table SELECT hides every column, including ones granted later by name.
revoke select on table rental.bookings from authenticated, anon;

do $$
declare
  hidden_cols text[] := array[
    'notes',
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
  col record;
  safe_list text := '';
begin
  for col in
    select column_name
    from information_schema.columns
    where table_schema = 'rental'
      and table_name = 'bookings'
    order by ordinal_position
  loop
    -- Clear a column grant that survived the table revoke.
    execute format(
      'revoke select (%I) on table rental.bookings from authenticated, anon',
      col.column_name
    );
    if col.column_name = any(hidden_cols) then
      continue;
    end if;
    if safe_list <> '' then
      safe_list := safe_list || ', ';
    end if;
    safe_list := safe_list || format('%I', col.column_name);
  end loop;

  if safe_list <> '' then
    execute 'grant select (' || safe_list || ') on table rental.bookings to authenticated';
  end if;
end;
$$;

comment on function rental.sanitize_driver_notes(text) is
  'Rewrites booking notes for a driver. EXECUTE is granted to authenticated because bookings_for_session calls it as the querying role. It does not read the bookings table.';

comment on view rental.bookings_for_session is
  'Garage read model. Owners see the real notes and money columns. Other logins see sanitized notes and null money columns. Direct select * on rental.bookings is denied.';

-- Repeat of the working policy from 20261117120000. Idempotent.
drop policy if exists read_quote_requests on rental.quote_requests;
create policy read_quote_requests
  on rental.quote_requests
  for select
  to authenticated
  using (rental.is_admin());

notify pgrst, 'reload schema';
