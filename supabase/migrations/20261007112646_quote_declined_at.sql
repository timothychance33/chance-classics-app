-- When the owner declines a quote request. Status "declined" is free text
-- (quote_requests.status has no check constraint). This column is the timestamp
-- that goes with decline_reason. Not applied in this change — run it before
-- using Decline: no availability in the app.

alter table rental.quote_requests
  add column if not exists declined_at timestamptz;

comment on column rental.quote_requests.declined_at is
  'When the owner declined the request. Paired with decline_reason. Status declined leaves the open quote list and, with book_expires_at, retires a quote Book Now link.';
