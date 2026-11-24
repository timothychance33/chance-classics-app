-- Raise Phyllis (1941 Buick Super) starting rate from $600 to $700 for the first 2 hours.
-- Applies to NEW quotes and online bookings only.
-- Do not change existing rental.quote_requests or rental.bookings rows.
-- Do not apply this migration until Tim is ready for the rate to go live
-- with the site copy in this PR.

update rental.cars
set base_rate = 700
where id = 'b74788e5-cc3e-4dc6-9f71-85276c77e1e7'
  and name = 'Phyllis'
  and base_rate = 600;
