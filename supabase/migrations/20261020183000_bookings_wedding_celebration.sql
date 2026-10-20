-- Optional wedding celebration details. Additive nullable columns on the existing bookings table.
-- Not applied by this pull request. Apply in the Classics project after Tim approves it.
-- No new table, so existing table GRANTs and RLS already cover these columns.

alter table rental.bookings
  add column if not exists wedding_partner_1_name text,
  add column if not exists wedding_partner_1_social text,
  add column if not exists wedding_partner_2_name text,
  add column if not exists wedding_partner_2_social text,
  add column if not exists wedding_photographer_name text,
  add column if not exists wedding_photographer_email text,
  add column if not exists wedding_photographer_instagram text;
