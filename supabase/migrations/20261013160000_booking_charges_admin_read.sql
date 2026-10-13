-- The garage booking panel reads the latest pay link (created_at, amount, status).
-- Drivers and the anon key stay blocked. rental.is_admin() checks profiles.role.

grant select on table rental.booking_charges to authenticated;

drop policy if exists booking_charges_admin_read on rental.booking_charges;
create policy booking_charges_admin_read
  on rental.booking_charges
  for select
  to authenticated
  using (rental.is_admin());
