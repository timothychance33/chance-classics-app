-- Stop two bookings for the same car from overlapping.
-- Does not treat a cancelled row as busy.
-- Apply this in the Chance Classics project when you are ready. It is not applied by this pull request.
-- Existing non-cancelled rows were checked on 2026-10-04 and none overlapped, so this constraint can be added as valid.

create extension if not exists btree_gist;

alter table rental.bookings
  drop constraint if exists bookings_no_car_time_overlap;

alter table rental.bookings
  add constraint bookings_no_car_time_overlap
  exclude using gist (
    car_id with =,
    tsrange(event_date + start_time, event_date + end_time, '[)') with &&
  )
  where (
    status is distinct from 'cancelled'
    and car_id is not null
    and event_date is not null
    and start_time is not null
    and end_time is not null
    and end_time > start_time
  );
