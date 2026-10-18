-- Stop a driver from claiming a booking that overlaps one they already have.
--
-- NOT APPLIED. This file is in the repo so it can be reviewed and run by hand
-- in project ldhmwuhhejaabsvcyzdo. Do not treat a deploy of the app or the
-- edge functions as applying this trigger.
--
-- Until it is applied, the claim-booking edge function is the server check
-- for the current app. An old cached app still writes driver_id itself, and
-- only this trigger rejects that write.
--
-- Overlap matches supabase/functions/_shared/driver-availability.mjs:
--   * ignore status = 'cancelled'
--   * both windows present: end <= start runs into the next day; expand one
--     side by 2 hours; half-open overlap (touching endpoints are free)
--   * a missing start or end overlaps only on the same calendar date
-- Owner assignment (assigned_by = 'owner') is allowed through.

create or replace function rental.reject_overlapping_driver_claim()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
declare
  buf interval := interval '2 hours';
  new_has_window boolean;
  new_start timestamp;
  new_end timestamp;
  clash_id uuid;
begin
  if new.driver_id is null then
    return new;
  end if;
  if new.status is not distinct from 'cancelled' then
    return new;
  end if;
  if new.assigned_by is not distinct from 'owner' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.driver_id is not distinct from old.driver_id then
    if old.status is distinct from 'cancelled' or new.status is not distinct from 'cancelled' then
      return new;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('driver-claim:' || new.driver_id::text));

  new_has_window := new.event_date is not null
    and new.start_time is not null
    and new.end_time is not null;
  if new_has_window then
    new_start := new.event_date + new.start_time;
    new_end := new.event_date + new.end_time;
    if new_end <= new_start then
      new_end := new_end + interval '1 day';
    end if;
  end if;

  select b.id into clash_id
  from rental.bookings b
  where b.driver_id = new.driver_id
    and b.id is distinct from new.id
    and b.status is distinct from 'cancelled'
    and (
      (
        new_has_window
        and b.event_date is not null
        and b.start_time is not null
        and b.end_time is not null
        and (new_start - buf) < (
          case
            when (b.event_date + b.end_time) <= (b.event_date + b.start_time)
            then (b.event_date + b.end_time) + interval '1 day'
            else b.event_date + b.end_time
          end
        )
        and (b.event_date + b.start_time) < (new_end + buf)
      )
      or
      (
        (
          not new_has_window
          or b.event_date is null
          or b.start_time is null
          or b.end_time is null
        )
        and new.event_date is not null
        and b.event_date = new.event_date
      )
    )
  limit 1;

  if clash_id is not null then
    raise exception 'You already have a booking at that time'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_reject_overlapping_driver_claim on rental.bookings;

create trigger bookings_reject_overlapping_driver_claim
  before insert or update of driver_id, assigned_by, status
  on rental.bookings
  for each row
  execute function rental.reject_overlapping_driver_claim();

revoke all on function rental.reject_overlapping_driver_claim() from public;
revoke all on function rental.reject_overlapping_driver_claim() from anon;
grant execute on function rental.reject_overlapping_driver_claim() to authenticated;
grant execute on function rental.reject_overlapping_driver_claim() to service_role;
