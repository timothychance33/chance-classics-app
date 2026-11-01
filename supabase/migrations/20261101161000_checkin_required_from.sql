-- Car check-in is required only when the booking ends on or after
-- CHECKIN_REQUIRED_FROM: 10:05 AM America/Chicago on 2026-11-01.
-- An earlier end may be marked driver-paid with no check-in and no override.
-- Bookings that end at that instant still need a check-in.
--
-- NOT APPLIED. Apply this by hand in the Chance Classics project. A deploy
-- of the site or the edge functions does not run it.
-- Replaces rental.guard_driver_paid. The trigger on driver_paid_at is unchanged.

create or replace function rental.guard_driver_paid()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
declare
  has_checkin boolean;
  CHECKIN_REQUIRED_FROM constant timestamptz := timestamptz '2026-11-01T16:05:00Z';
begin
  if new.driver_paid_at is not distinct from old.driver_paid_at
     and new.driver_paid_override_reason is not distinct from old.driver_paid_override_reason then
    return new;
  end if;
  if not rental.is_admin() then
    raise exception 'Only an admin can change driver pay' using errcode = 'P0001';
  end if;
  if new.driver_paid_at is null then
    new.driver_paid_override_reason := null;
    return new;
  end if;

  if rental.booking_end_at(new.event_date, new.start_time, new.end_time) < CHECKIN_REQUIRED_FROM then
    return new;
  end if;

  select exists (
    select 1 from rental.car_checkins c where c.booking_id = new.id
  ) into has_checkin;
  if has_checkin then
    return new;
  end if;
  if new.driver_paid_override_reason is not null
     and length(trim(new.driver_paid_override_reason)) > 0
     and new.driver_paid_override_reason is distinct from old.driver_paid_override_reason then
    new.driver_paid_override_reason := trim(new.driver_paid_override_reason);
    return new;
  end if;
  raise exception 'Car check-in is required before this driver can be marked paid'
    using errcode = 'P0001';
end;
$$;
