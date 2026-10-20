-- Day-before client email stamp.
-- Apply this in the Chance Classics project (ldhmwuhhejaabsvcyzdo) when the owner approves.
-- It is not applied by this pull request.
--
-- Adds a column on rental.bookings. It does not create a table.
-- rental.bookings already has row level security, and that policy covers this column.
-- Supabase stops auto-granting new tables on Oct 30, 2026. This migration grants
-- the new column explicitly anyway: the garage reads it, and scheduled-tasks writes it.

alter table rental.bookings
  add column if not exists day_before_email_sent_at timestamptz;

comment on column rental.bookings.day_before_email_sent_at is
  'When the day-before client email was accepted. Null means it has not been sent. Stops a second send.';

create index if not exists bookings_day_before_unsent_idx
  on rental.bookings (event_date)
  where day_before_email_sent_at is null;

grant select (day_before_email_sent_at) on table rental.bookings to authenticated;
grant select (day_before_email_sent_at), update (day_before_email_sent_at) on table rental.bookings to service_role;
