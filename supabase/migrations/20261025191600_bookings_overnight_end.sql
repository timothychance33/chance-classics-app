-- Same-car overlap includes a rental that ends after midnight.
-- An end at or before the start is the next calendar day (23:00–01:00).
-- The 2-hour buffer stays in the app (BOOKING_BUFFER_HOURS). This constraint
-- only rejects a true overlap of [start, end).
--
-- NOT APPLIED. Apply this by hand in the Chance Classics project. A deploy
-- of the site or the edge functions does not run it.
-- Replaces bookings_no_car_time_overlap, which skipped any row whose end
-- was not later than its start and so ignored an overnight rental.

create extension if not exists btree_gist;

alter table rental.bookings
  drop constraint if exists bookings_no_car_time_overlap;

alter table rental.bookings
  add constraint bookings_no_car_time_overlap
  exclude using gist (
    car_id with =,
    tsrange(
      event_date + start_time,
      event_date + end_time + case
        when end_time <= start_time then interval '1 day'
        else interval '0'
      end,
      '[)'
    ) with &&
  )
  where (
    status is distinct from 'cancelled'
    and car_id is not null
    and event_date is not null
    and start_time is not null
    and end_time is not null
  );
