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
        where b.id::text = (storage.foldername(storage.objects.name))[1]
          and b.status is distinct from 'cancelled'
          and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
    )
  );
