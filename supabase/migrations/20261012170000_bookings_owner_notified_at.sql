-- Stamp after the owner new-booking email is accepted, so a Stripe retry does not send it twice.

alter table rental.bookings
  add column if not exists owner_notified_at timestamptz;

comment on column rental.bookings.owner_notified_at is
  'When the owner new-booking email was accepted. Null means it has not been sent.';
