-- Overnight driver hotel on quotes and the bookings they become.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when the owner approves.
-- It is not applied by this pull request.
--
-- Adds columns on rental.quote_requests and rental.bookings. It does not create a table.
-- Both tables already have row level security, and those policies cover these columns.
-- hotel_fee already exists on quote_requests and is not added again.
-- Supabase stops auto-granting new tables on Oct 30, 2026. This migration grants
-- the new columns explicitly, matching the tax-exempt column grants:
-- the garage (authenticated) reads bookings and reads and updates quotes;
-- the website and scheduled-tasks (service_role) read and write both.

alter table rental.quote_requests
  add column if not exists drive_minutes integer,
  add column if not exists hotel_nights integer,
  add column if not exists hotel_return_at text,
  add column if not exists hotel_override boolean not null default false;

alter table rental.bookings
  add column if not exists drive_minutes integer,
  add column if not exists hotel_fee_usd numeric,
  add column if not exists hotel_nights integer,
  add column if not exists hotel_return_at text;

comment on column rental.quote_requests.drive_minutes is
  'One-way drive minutes from the Benton shop to pickup, from the same Google route as the mileage fee. Used to estimate the driver return.';
comment on column rental.quote_requests.hotel_nights is
  'Nights of overnight driver hotel on this quote. Usually 1. Null when the line is not on the quote.';
comment on column rental.quote_requests.hotel_return_at is
  'Estimated clock the driver is back at the shop, for example "2:15 AM the next day". Shown with the hotel line.';
comment on column rental.quote_requests.hotel_override is
  'When true, the garage turned the automatic overnight driver hotel on or off by hand. The lookup does not replace that choice.';
comment on column rental.bookings.drive_minutes is
  'One-way drive minutes from the Benton shop, copied from the quote or the website mileage lookup.';
comment on column rental.bookings.hotel_fee_usd is
  'Overnight driver hotel dollars included in the taxed total. Zero or null when the line does not apply.';
comment on column rental.bookings.hotel_nights is
  'Nights charged for the overnight driver hotel.';
comment on column rental.bookings.hotel_return_at is
  'Estimated return to the shop that justified the hotel line.';

grant select (drive_minutes, hotel_fee_usd, hotel_nights, hotel_return_at) on table rental.bookings to authenticated;
grant select (drive_minutes, hotel_fee_usd, hotel_nights, hotel_return_at),
      insert (drive_minutes, hotel_fee_usd, hotel_nights, hotel_return_at),
      update (drive_minutes, hotel_fee_usd, hotel_nights, hotel_return_at)
  on table rental.bookings to service_role;

grant select (drive_minutes, hotel_nights, hotel_return_at, hotel_override),
      update (drive_minutes, hotel_nights, hotel_return_at, hotel_override)
  on table rental.quote_requests to authenticated;
grant select (drive_minutes, hotel_nights, hotel_return_at, hotel_override),
      insert (drive_minutes, hotel_nights, hotel_return_at, hotel_override),
      update (drive_minutes, hotel_nights, hotel_return_at, hotel_override)
  on table rental.quote_requests to service_role;
