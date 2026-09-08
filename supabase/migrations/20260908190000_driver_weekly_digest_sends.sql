-- One row per driver per Monday (America/Chicago week start).
-- Stops the hourly pg_cron / Vercel retry from sending the same weekly digest twice.

create table if not exists rental.driver_weekly_digest_sends (
  staff_id uuid not null references rental.staff(id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  primary key (staff_id, week_start)
);

alter table rental.driver_weekly_digest_sends enable row level security;

comment on table rental.driver_weekly_digest_sends is
  'Idempotency marker for the Monday driver booking digest. Service role only.';
