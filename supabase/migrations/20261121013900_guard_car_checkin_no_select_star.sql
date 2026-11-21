-- Drivers lost SELECT on booking money columns (driver_booking_select_grants, Nov 17).
-- guard_car_checkin ran `select * from rental.bookings` as the driver, so every driver
-- check-in failed with "permission denied for table bookings". Read only the columns it needs.
create or replace function rental.guard_car_checkin()
returns trigger
language plpgsql
as $fn$
declare
  b_status text;
  b_driver_id uuid;
  b_car_id uuid;
  b_event_date date;
  b_start_time time;
  b_end_time time;
  staff_email text;
  caller_email text;
  ended_at timestamptz;
begin
  if tg_op is distinct from 'INSERT' then
    raise exception 'A car check-in cannot be changed' using errcode = 'P0001';
  end if;

  select bk.status, bk.driver_id, bk.car_id, bk.event_date, bk.start_time, bk.end_time
    into b_status, b_driver_id, b_car_id, b_event_date, b_start_time, b_end_time
    from rental.bookings bk where bk.id = new.booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0001';
  end if;
  if b_status is not distinct from 'cancelled' then
    raise exception 'Cancelled bookings are not checked in' using errcode = 'P0001';
  end if;
  if b_driver_id is null or b_car_id is null then
    raise exception 'This booking needs a car and a driver before check-in' using errcode = 'P0001';
  end if;
  if new.driver_id is distinct from b_driver_id or new.car_id is distinct from b_car_id then
    raise exception 'Check-in must match the booking car and driver' using errcode = 'P0001';
  end if;

  ended_at := rental.booking_end_at(b_event_date, b_start_time, b_end_time);
  if ended_at is null or now() < ended_at then
    raise exception 'Check-in opens after the booking ends' using errcode = 'P0001';
  end if;

  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select lower(s.email) into staff_email from rental.staff s where s.id = b_driver_id;
  if not rental.is_admin() then
    if caller_email = '' or staff_email is distinct from caller_email then
      raise exception 'Only the assigned driver can check this car in' using errcode = 'P0001';
    end if;
  end if;

  if length(trim(coalesce(new.notes, ''))) > 2000 then
    raise exception 'Notes are too long' using errcode = 'P0001';
  end if;
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  if new.has_issues then
    if new.severity not in ('ok_to_use', 'needs_fix') then
      raise exception 'Choose OK to use or Needs fix before next booking' using errcode = 'P0001';
    end if;
    if new.notes is null then
      raise exception 'Describe the issue' using errcode = 'P0001';
    end if;
  else
    new.severity := 'ok_to_use';
  end if;

  new.parked_at := now();
  new.created_at := now();
  new.created_by := auth.uid();
  new.owner_notified_at := null;
  return new;
end;
$fn$;
