-- Book Now links for price quotes.
-- Apply this in the Chance Classics project when you are ready. It is not applied by this pull request.

alter table rental.quote_requests
  add column if not exists book_token text,
  add column if not exists book_expires_at timestamptz,
  add column if not exists booking_id uuid,
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists dropoff_location text;

create unique index if not exists quote_requests_book_token_key
  on rental.quote_requests (book_token)
  where book_token is not null;
