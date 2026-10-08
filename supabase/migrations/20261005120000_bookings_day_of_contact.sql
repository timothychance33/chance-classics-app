-- Day-of contact for the driver. Additive only.
-- Not applied by this pull request. Apply in the Classics project after Tim approves it.

alter table rental.bookings
  add column if not exists day_of_contact_name text,
  add column if not exists day_of_contact_phone text,
  add column if not exists day_of_contact_role text;
