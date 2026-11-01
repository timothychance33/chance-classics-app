-- Driver "car's back" check-in, open car issues, and check-in nudge stamps.
-- Apply this by hand in the Chance Classics project (ldhmwuhhejaabsvcyzdo).
-- This pull request does not apply it and does not deploy the edge functions.
--
-- One check-in per booking. parked_at is stamped by the database at submit.
-- Fuel level is kept. Ending mileage is not collected.
-- A needs-fix issue stays open on the car until an admin marks it fixed.
-- Driver pay (bookings.driver_paid_at) is rejected until that check-in exists.
-- An admin may override by sending a new non-empty driver_paid_override_reason
-- in the same update.
--
-- Supabase no longer auto-grants new tables. Grants below are explicit.
-- The garage has no SMS sender. Nudges are email only, from scheduled-tasks.

alter table rental.bookings
  add column if not exists driver_paid_override_reason text;

comment on column rental.bookings.driver_paid_override_reason is
  'Why an admin marked the driver paid with no car check-in. Cleared when the driver is marked unpaid.';

grant select (driver_paid_override_reason), update (driver_paid_override_reason)
  on table rental.bookings to authenticated;
grant select (driver_paid_override_reason), insert (driver_paid_override_reason), update (driver_paid_override_reason)
  on table rental.bookings to service_role;

-- Chicago wall time. end <= start is the next day, matching the garage and the claim overlap rule.
-- A missing end is 11:59 PM on the event date so a check-in can still open that night.
create or replace function rental.booking_end_at(p_date date, p_start time, p_end time)
returns timestamptz
language sql
stable
set search_path = rental
as $$
  select case
    when p_date is null then null
    when p_end is null then (p_date + time '23:59') at time zone 'America/Chicago'
    when p_start is not null and p_end <= p_start
      then (p_date + p_end + interval '1 day') at time zone 'America/Chicago'
    else (p_date + p_end) at time zone 'America/Chicago'
  end;
$$;

revoke all on function rental.booking_end_at(date, time, time) from public, anon;
grant execute on function rental.booking_end_at(date, time, time) to authenticated, service_role;

create table if not exists rental.car_checkins (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references rental.bookings(id) on delete cascade,
  car_id uuid not null references rental.cars(id),
  driver_id uuid not null references rental.staff(id),
  parked_at timestamptz not null default now(),
  fuel_level text not null check (fuel_level in ('empty', '1/4', '1/2', '3/4', 'full')),
  has_issues boolean not null,
  notes text,
  severity text not null check (severity in ('ok_to_use', 'needs_fix')),
  created_by uuid,
  created_at timestamptz not null default now(),
  owner_notified_at timestamptz,
  constraint car_checkins_clear_is_ok check (has_issues or severity = 'ok_to_use'),
  constraint car_checkins_issue_notes check (not has_issues or length(trim(coalesce(notes, ''))) > 0)
);

comment on table rental.car_checkins is
  'Driver post-booking check-in. One row per booking. parked_at is set when the row is inserted.';
comment on column rental.car_checkins.owner_notified_at is
  'When the owner check-in email was claimed. Null until that send starts. Cleared if the send fails.';
comment on column rental.car_checkins.fuel_level is
  'Fuel at return: empty, 1/4, 1/2, 3/4, or full.';
comment on column rental.car_checkins.severity is
  'ok_to_use or needs_fix. needs_fix opens a car issue. A check-in with no issues is ok_to_use.';

create table if not exists rental.car_issues (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null unique references rental.car_checkins(id) on delete cascade,
  booking_id uuid not null references rental.bookings(id) on delete cascade,
  car_id uuid not null references rental.cars(id),
  driver_id uuid references rental.staff(id),
  notes text,
  severity text not null check (severity in ('ok_to_use', 'needs_fix')),
  status text not null check (status in ('open', 'fixed', 'noted')),
  opened_at timestamptz not null default now(),
  fixed_at timestamptz,
  fixed_by uuid,
  fix_note text
);

create index if not exists car_issues_car_status_idx on rental.car_issues (car_id, status);

comment on table rental.car_issues is
  'Per-car issue history from check-ins. needs_fix starts open and stays until an admin marks it fixed. ok_to_use is noted and does not block the car.';

create table if not exists rental.car_checkin_photos (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references rental.car_checkins(id) on delete cascade,
  booking_id uuid not null references rental.bookings(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists car_checkin_photos_checkin_idx on rental.car_checkin_photos (checkin_id);

comment on table rental.car_checkin_photos is
  'Private storage paths for check-in photos. The bucket car-checkins is not public.';

create table if not exists rental.car_checkin_nudges (
  booking_id uuid not null references rental.bookings(id) on delete cascade,
  kind text not null check (kind in ('driver', 'owner')),
  slot integer not null check (slot >= 1 and slot <= 4),
  sent_at timestamptz not null default now(),
  primary key (booking_id, kind, slot)
);

comment on table rental.car_checkin_nudges is
  'Idempotency stamps for check-in reminder emails. Driver slots 1-4 and one owner alert. Service role only.';

alter table rental.car_checkins enable row level security;
alter table rental.car_issues enable row level security;
alter table rental.car_checkin_photos enable row level security;
alter table rental.car_checkin_nudges enable row level security;

revoke all on table rental.car_checkins from public, anon;
revoke all on table rental.car_issues from public, anon;
revoke all on table rental.car_checkin_photos from public, anon;
revoke all on table rental.car_checkin_nudges from public, anon, authenticated;

grant select, insert on table rental.car_checkins to authenticated;
grant select, insert, update on table rental.car_checkins to service_role;

grant select, insert, update on table rental.car_issues to authenticated;
grant select, insert, update on table rental.car_issues to service_role;

grant select, insert on table rental.car_checkin_photos to authenticated;
grant select, insert on table rental.car_checkin_photos to service_role;

grant select, insert, delete on table rental.car_checkin_nudges to service_role;

-- Assigned driver, or an admin, after the booking has ended. parked_at is always now().
create or replace function rental.guard_car_checkin()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
declare
  b rental.bookings%rowtype;
  staff_email text;
  caller_email text;
  ended_at timestamptz;
begin
  if tg_op is distinct from 'INSERT' then
    raise exception 'A car check-in cannot be changed' using errcode = 'P0001';
  end if;

  select * into b from rental.bookings where id = new.booking_id;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0001';
  end if;
  if b.status is not distinct from 'cancelled' then
    raise exception 'Cancelled bookings are not checked in' using errcode = 'P0001';
  end if;
  if b.driver_id is null or b.car_id is null then
    raise exception 'This booking needs a car and a driver before check-in' using errcode = 'P0001';
  end if;
  if new.driver_id is distinct from b.driver_id or new.car_id is distinct from b.car_id then
    raise exception 'Check-in must match the booking car and driver' using errcode = 'P0001';
  end if;

  ended_at := rental.booking_end_at(b.event_date, b.start_time, b.end_time);
  if ended_at is null or now() < ended_at then
    raise exception 'Check-in opens after the booking ends' using errcode = 'P0001';
  end if;

  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  select lower(s.email) into staff_email from rental.staff s where s.id = b.driver_id;
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
$$;

create or replace function rental.guard_car_checkin_update()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
begin
  if new.id is distinct from old.id
     or new.booking_id is distinct from old.booking_id
     or new.car_id is distinct from old.car_id
     or new.driver_id is distinct from old.driver_id
     or new.parked_at is distinct from old.parked_at
     or new.fuel_level is distinct from old.fuel_level
     or new.has_issues is distinct from old.has_issues
     or new.notes is distinct from old.notes
     or new.severity is distinct from old.severity
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'A car check-in cannot be changed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Opens one issue row when the driver reported an issue. ok_to_use is history only.
create or replace function rental.record_car_checkin_issue()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
begin
  if new.has_issues then
    insert into rental.car_issues (
      checkin_id, booking_id, car_id, driver_id, notes, severity, status
    ) values (
      new.id,
      new.booking_id,
      new.car_id,
      new.driver_id,
      new.notes,
      new.severity,
      case when new.severity = 'needs_fix' then 'open' else 'noted' end
    );
  end if;
  return new;
end;
$$;

create or replace function rental.guard_car_issue_update()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
begin
  if not rental.is_admin() then
    raise exception 'Only an admin can update a car issue' using errcode = 'P0001';
  end if;
  if old.status is distinct from 'open' then
    raise exception 'This issue is already closed' using errcode = 'P0001';
  end if;
  if new.status is distinct from 'fixed' then
    raise exception 'Mark the issue fixed' using errcode = 'P0001';
  end if;
  new.checkin_id := old.checkin_id;
  new.booking_id := old.booking_id;
  new.car_id := old.car_id;
  new.driver_id := old.driver_id;
  new.notes := old.notes;
  new.severity := old.severity;
  new.opened_at := old.opened_at;
  new.fixed_at := now();
  new.fixed_by := auth.uid();
  new.fix_note := nullif(trim(coalesce(new.fix_note, '')), '');
  return new;
end;
$$;

create or replace function rental.guard_driver_paid()
returns trigger
language plpgsql
security invoker
set search_path = rental
as $$
declare
  has_checkin boolean;
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

revoke all on function rental.guard_car_checkin() from public, anon;
revoke all on function rental.guard_car_checkin_update() from public, anon;
revoke all on function rental.record_car_checkin_issue() from public, anon;
revoke all on function rental.guard_car_issue_update() from public, anon;
revoke all on function rental.guard_driver_paid() from public, anon;
grant execute on function rental.guard_car_checkin() to authenticated, service_role;
grant execute on function rental.guard_car_checkin_update() to authenticated, service_role;
grant execute on function rental.record_car_checkin_issue() to authenticated, service_role;
grant execute on function rental.guard_car_issue_update() to authenticated, service_role;
grant execute on function rental.guard_driver_paid() to authenticated, service_role;

drop trigger if exists car_checkins_guard on rental.car_checkins;
create trigger car_checkins_guard
  before insert on rental.car_checkins
  for each row
  execute function rental.guard_car_checkin();

drop trigger if exists car_checkins_guard_update on rental.car_checkins;
create trigger car_checkins_guard_update
  before update on rental.car_checkins
  for each row
  execute function rental.guard_car_checkin_update();

drop trigger if exists car_checkins_record_issue on rental.car_checkins;
create trigger car_checkins_record_issue
  after insert on rental.car_checkins
  for each row
  execute function rental.record_car_checkin_issue();

drop trigger if exists car_issues_guard_update on rental.car_issues;
create trigger car_issues_guard_update
  before update on rental.car_issues
  for each row
  execute function rental.guard_car_issue_update();

drop trigger if exists bookings_guard_driver_paid on rental.bookings;
create trigger bookings_guard_driver_paid
  before update of driver_paid_at, driver_paid_override_reason
  on rental.bookings
  for each row
  execute function rental.guard_driver_paid();

drop policy if exists car_checkins_select on rental.car_checkins;
create policy car_checkins_select on rental.car_checkins
  for select to authenticated
  using (true);

drop policy if exists car_checkins_insert on rental.car_checkins;
create policy car_checkins_insert on rental.car_checkins
  for insert to authenticated
  with check (
    auth.uid() is not null
    and (
      rental.is_admin()
      or exists (
        select 1
        from rental.bookings b
        join rental.staff s on s.id = b.driver_id
        where b.id = booking_id
          and b.driver_id = driver_id
          and b.car_id = car_id
          and b.status is distinct from 'cancelled'
          and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );

drop policy if exists car_issues_select on rental.car_issues;
create policy car_issues_select on rental.car_issues
  for select to authenticated
  using (true);

drop policy if exists car_issues_insert on rental.car_issues;
create policy car_issues_insert on rental.car_issues
  for insert to authenticated
  with check (
    fixed_at is null
    and fixed_by is null
    and exists (
      select 1 from rental.car_checkins c
      where c.id = checkin_id
        and c.booking_id = booking_id
        and c.car_id = car_id
        and c.driver_id is not distinct from driver_id
        and c.has_issues
        and c.severity = severity
        and c.notes is not distinct from notes
        and (
          (c.severity = 'needs_fix' and status = 'open')
          or (c.severity = 'ok_to_use' and status = 'noted')
        )
    )
  );

drop policy if exists car_issues_update on rental.car_issues;
create policy car_issues_update on rental.car_issues
  for update to authenticated
  using (rental.is_admin())
  with check (rental.is_admin() and status = 'fixed');

drop policy if exists car_checkin_photos_select on rental.car_checkin_photos;
create policy car_checkin_photos_select on rental.car_checkin_photos
  for select to authenticated
  using (true);

drop policy if exists car_checkin_photos_insert on rental.car_checkin_photos;
create policy car_checkin_photos_insert on rental.car_checkin_photos
  for insert to authenticated
  with check (
    storage_path like (booking_id::text || '/%')
    and exists (
      select 1
      from rental.car_checkins c
      join rental.bookings b on b.id = c.booking_id
      join rental.staff s on s.id = b.driver_id
      where c.id = checkin_id
        and c.booking_id = booking_id
        and (
          rental.is_admin()
          or lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'car-checkins',
  'car-checkins',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists car_checkin_storage_read on storage.objects;
create policy car_checkin_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'car-checkins');

drop policy if exists car_checkin_storage_insert on storage.objects;
create policy car_checkin_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'car-checkins'
    and (
      rental.is_admin()
      or exists (
        select 1
        from rental.bookings b
        join rental.staff s on s.id = b.driver_id
        where b.id::text = (storage.foldername(name))[1]
          and b.status is distinct from 'cancelled'
          and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );
