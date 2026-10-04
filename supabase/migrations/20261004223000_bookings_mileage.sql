-- Store the website mileage quote on the booking.
-- Apply this in the Chance Classics project when you are ready. It is not applied by this pull request.

alter table rental.bookings
  add column if not exists mileage_to_pickup_miles numeric,
  add column if not exists mileage_between_miles numeric,
  add column if not exists mileage_miles numeric,
  add column if not exists mileage_fee_usd numeric,
  add column if not exists mileage_needs_review boolean not null default false;
