-- Hide customer money from driver and shop logins.
--
-- NOT APPLIED. A deploy of the site or the edge functions does not run this.
-- Apply it by hand in the Chance Classics project (ldhmwuhhejaabsvcyzdo)
-- only after the garage that reads rental.bookings_for_session is live.
-- The old garage calls select * on rental.bookings. After the column
-- revoke below, that call fails until the new garage is what drivers open.
--
-- Does not touch the public schema. Speed Shop tables stay as they are.
-- Does not change what an owner (rental.is_admin()) sees.
--
-- Today every signed-in user, including a driver, can SELECT every column
-- of rental.bookings. The read_bookings policy is auth.uid() IS NOT NULL.
-- Column privileges cannot tell an owner from a driver: both use the
-- authenticated role. This migration:
--   1. Adds rental.sanitize_driver_notes, the same rules as
--      supabase/functions/_shared/driver-notes.mjs.
--   2. Adds rental.bookings_for_session. It runs as the view owner so it
--      can still read notes after the column revoke. For an owner it
--      returns the real row. For anyone else it returns sanitized notes
--      and nulls the money columns. Row visibility stays "every booking",
--      which is what read_bookings already allows.
--   3. Revokes SELECT on notes and the money columns from authenticated
--      and anon. select * on rental.bookings then fails. A column list
--      that omits those columns still works, which is what claim, pass,
--      and release updates need.
--   4. Limits rental.quote_requests SELECT to owners. Drivers were able
--      to read quote totals, tax, mileage fees, and hotel fees even though
--      the Quotes tab is hidden. The garage already ignores a quote error.
--
-- service_role still reads rental.bookings directly. Do not point the
-- edge functions at this view: with no user JWT, is_admin() is false and
-- the view would hide the owner's own columns. Driver emails sanitize
-- notes in the function code.
--
-- After applying, reload the API schema (the notify at the bottom).

create or replace function rental.sanitize_driver_notes(raw text)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  src text := replace(coalesce(raw, ''), E'\r\n', E'\n');
  labels text[] := array[
    'Vehicle reliability acknowledged',
    'Balance billed separately',
    'Overnight driver hotel',
    'Additional notes',
    'Waiver accepted',
    'Listing total',
    'Booking total',
    'Quote total',
    'Mileage fee',
    'Sales tax',
    'Deposit paid',
    'Deposit due',
    'Balance due',
    'Balance remaining',
    'Tax exempt',
    'Subtotal',
    'Gratuity',
    'Occasion',
    'Duration',
    'Refunded',
    'Deposit',
    'Balance',
    'Mileage',
    'Refund',
    'Quote',
    'Price',
    'Venmo',
    'Stripe',
    'Total',
    'Car',
    'Tip',
    'Wix'
  ];
  label text;
  line text;
  line_kept text;
  piece text;
  cleaned text;
  kept text := '';
  words text[];
  word text;
  content_count int;
  sentences text[];
  buf text;
  built text := '';
  found text;
  i int := 1;
  j int;
  ch text;
  matched boolean;
begin
  if btrim(src) = '' then
    return '';
  end if;

  -- Same scan as driver-notes.mjs: at each space, try the longest label
  -- that is followed by a colon, and put that label on its own line.
  while i <= length(src) loop
    matched := false;
    found := '';
    if i = 1 or substr(src, i - 1, 1) ~ '[[:space:]]' then
      foreach label in array labels loop
        if lower(substr(src, i, length(label))) = lower(label) then
          j := i + length(label);
          while j <= length(src) and substr(src, j, 1) ~ '[[:space:]]' loop
            j := j + 1;
          end loop;
          if lower(label) = 'sales tax' and substr(src, j, 1) = '(' then
            while j <= length(src) and substr(src, j, 1) <> ')' loop
              j := j + 1;
            end loop;
            if j <= length(src) and substr(src, j, 1) = ')' then
              j := j + 1;
            end if;
          end if;
          while j <= length(src) and substr(src, j, 1) ~ '[[:space:]]' loop
            j := j + 1;
          end loop;
          if j <= length(src) and substr(src, j, 1) = ':' then
            found := substr(src, i, j - i + 1);
            matched := true;
            exit;
          end if;
        end if;
      end loop;
    end if;
    if matched then
      if i > 1 and (built = '' or right(built, 1) <> E'\n') then
        built := built || E'\n';
      end if;
      built := built || found;
      i := i + length(found);
    else
      built := built || substr(src, i, 1);
      i := i + 1;
    end if;
  end loop;
  src := built;

  foreach line in array regexp_split_to_array(src, E'\n') loop
    line_kept := '';
    sentences := array[]::text[];
    buf := '';
    if line is null then
      continue;
    end if;
    for i in 1..length(line) loop
      ch := substr(line, i, 1);
      buf := buf || ch;
      if ch in ('.', '!', ';') and (i = length(line) or substr(line, i + 1, 1) ~ '[[:space:]]') then
        sentences := sentences || btrim(buf);
        buf := '';
      end if;
    end loop;
    if btrim(buf) <> '' then
      sentences := sentences || btrim(buf);
    end if;

    foreach piece in array sentences loop
      piece := btrim(piece);
      if piece = '' then
        continue;
      end if;
      if piece ~* '^\s*(sales[[:space:]]+tax|quote[[:space:]]+total|booking[[:space:]]+total|listing[[:space:]]+total|subtotal|drop-off[[:space:]]+mileage([[:space:]]+fee)?|mileage[[:space:]]+fee|deposit|balance|price|total|tip|gratuity|refund|amount[[:space:]]+paid|customer[[:space:]]+amount|venmo|stripe|wix)\M' then
        continue;
      end if;

      if piece !~* '\$[[:space:]]*[0-9]|\m(usd|dollars)\M|\m(sales[[:space:]]+tax|quote[[:space:]]+total|booking[[:space:]]+total|listing[[:space:]]+total|subtotal|drop-off[[:space:]]+mileage([[:space:]]+fee)?|mileage[[:space:]]+fee|deposit|balance|price|total|tip|gratuity|refund|venmo|stripe|wix|amount[[:space:]]+paid|customer[[:space:]]+amount|paid)\M' then
        cleaned := piece;
      else
        cleaned := regexp_replace(piece, '\([^)]*(\$|\mdue\M|\mbalance\M|\mpaid\M|\mrefund\M|\mvenmo\M|\mstripe\M|\mwix\M)[^)]*\)', ' ', 'gi');
        cleaned := regexp_replace(cleaned, '\$[[:space:]]*[0-9][0-9,]*(?:\.[0-9]{1,2})?', ' ', 'g');
        cleaned := regexp_replace(cleaned, '\m(usd|dollars)[[:space:]]*[0-9][0-9,]*(?:\.[0-9]{1,2})?\M', ' ', 'gi');
        cleaned := regexp_replace(cleaned, '\m[0-9][0-9,]*\.[0-9]{2}[[:space:]]*(usd|dollars)\M', ' ', 'gi');
        cleaned := regexp_replace(cleaned, '\m(sales[[:space:]]+tax([[:space:]]*\([^)]*\))?|quote[[:space:]]+total|booking[[:space:]]+total|listing[[:space:]]+total|subtotal|drop-off[[:space:]]+mileage([[:space:]]+fee)?|mileage[[:space:]]+fee|gratuity|deposit([[:space:]]+(paid|due))?|balance([[:space:]]+(billed([[:space:]]+separately)?|due|remaining))?|amount[[:space:]]+paid|customer[[:space:]]+amount|refund(ed)?|venmo|stripe|wix|paid|billed[[:space:]]+with[[:space:]]+the[[:space:]]+balance)\M[[:space:]]*:?', ' ', 'gi');
        cleaned := regexp_replace(cleaned, ',?[[:space:]]*\mfee\M[[:space:]]*', ' ', 'gi');
        cleaned := regexp_replace(cleaned, '[[:space:]]*,[[:space:]]*\.', '.', 'g');
        cleaned := regexp_replace(cleaned, '[[:space:]]*,[[:space:]]*$', '', 'g');
        cleaned := regexp_replace(cleaned, '[[:space:]]{2,}', ' ', 'g');
        cleaned := regexp_replace(cleaned, '[[:space:]]+([,.;:!?])', '\1', 'g');
        cleaned := regexp_replace(cleaned, '\([[:space:]]*\)', '', 'g');
        cleaned := regexp_replace(cleaned, ':[[:space:]]*\([[:space:]]*', ': ', 'g');
        cleaned := regexp_replace(cleaned, '[[:space:]]*\)[[:space:]]*([.]?)[[:space:]]*$', '\1', 'g');
        cleaned := btrim(cleaned, ' ,;:-');
        cleaned := regexp_replace(cleaned, '^\.+', '');
        cleaned := btrim(cleaned);
        if cleaned = '' or cleaned ~ ':\s*$' or cleaned ~ '^[.\s]+$' or cleaned ~ '\$[[:space:]]*[0-9]' then
          continue;
        end if;
        words := regexp_split_to_array(lower(cleaned), '[^a-z]+');
        content_count := 0;
        if words is not null then
          foreach word in array words loop
            if length(word) >= 3 and word not in (
              'the','and','for','via','with','from','was','were','are','been','sent',
              'customer','their','our','this','that','after','only','separately',
              'including','includes','about','then','also'
            ) then
              content_count := content_count + 1;
            end if;
          end loop;
        end if;
        if content_count < 2 then
          continue;
        end if;
      end if;

      if line_kept = '' then
        line_kept := cleaned;
      else
        line_kept := line_kept || ' ' || cleaned;
      end if;
    end loop;
    if line_kept <> '' then
      if kept <> '' then
        kept := kept || E'\n';
      end if;
      kept := kept || line_kept;
    end if;
  end loop;

  return kept;
end;
$$;

revoke all on function rental.sanitize_driver_notes(text) from public;
revoke all on function rental.sanitize_driver_notes(text) from anon, authenticated;
grant execute on function rental.sanitize_driver_notes(text) to service_role;

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
  revoke_list text := '';
begin
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
    if col.column_name = 'notes' or col.column_name = any(money_cols) then
      if revoke_list <> '' then
        revoke_list := revoke_list || ', ';
      end if;
      revoke_list := revoke_list || format('%I', col.column_name);
    end if;
  end loop;

  execute 'drop view if exists rental.bookings_for_session';
  execute
    'create view rental.bookings_for_session with (security_barrier = true, security_invoker = false) as select '
    || selects
    || ' from rental.bookings b';

  execute 'revoke all on rental.bookings_for_session from public, anon';
  execute 'grant select on rental.bookings_for_session to authenticated, service_role';

  if revoke_list <> '' then
    execute 'revoke select (' || revoke_list || ') on table rental.bookings from authenticated, anon';
  end if;
end;
$$;

comment on view rental.bookings_for_session is
  'Garage read model. Owners see rental.bookings. Drivers and shop logins see the same rows with notes sanitized and customer money columns null. Apply only after the garage reads this view.';

drop policy if exists read_quote_requests on rental.quote_requests;
create policy read_quote_requests
  on rental.quote_requests
  for select
  to authenticated
  using (rental.is_admin());

notify pgrst, 'reload schema';
