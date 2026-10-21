-- Tax exempt quotes and the bookings they become.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when the owner approves.
-- It is not applied by this pull request.
--
-- Adds columns on rental.quote_requests and rental.bookings. It does not create a table.
-- Both tables already have row level security, and those policies cover these columns.
-- Supabase stops auto-granting new tables on Oct 30, 2026. This migration grants
-- the new columns explicitly, matching the day-before column grants:
-- the garage (authenticated) reads bookings and reads and updates quotes;
-- the website and scheduled-tasks (service_role) read and write both.

alter table rental.quote_requests
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_exempt_note text;

alter table rental.bookings
  add column if not exists tax_exempt boolean not null default false,
  add column if not exists tax_exempt_note text;

comment on column rental.quote_requests.tax_exempt is
  'When true, this quote has no 10.25% sales tax. Totals, the deposit balance, and Stripe charges use the untaxed amount.';
comment on column rental.quote_requests.tax_exempt_note is
  'Optional exemption note or certificate number. Empty when unused.';
comment on column rental.bookings.tax_exempt is
  'Copied from the quote when a tax-exempt quote is paid. Later balance and day-before emails say Tax exempt instead of sales tax.';
comment on column rental.bookings.tax_exempt_note is
  'Optional exemption note or certificate number copied from the quote.';

grant select (tax_exempt, tax_exempt_note) on table rental.bookings to authenticated;
grant select (tax_exempt, tax_exempt_note), insert (tax_exempt, tax_exempt_note), update (tax_exempt, tax_exempt_note)
  on table rental.bookings to service_role;

grant select (tax_exempt, tax_exempt_note), update (tax_exempt, tax_exempt_note)
  on table rental.quote_requests to authenticated;
grant select (tax_exempt, tax_exempt_note), insert (tax_exempt, tax_exempt_note), update (tax_exempt, tax_exempt_note)
  on table rental.quote_requests to service_role;
