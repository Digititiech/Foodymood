do $$
begin
  if not exists (select 1 from storage.buckets where id = 'meal-images') then
    insert into storage.buckets (id, name, public)
    values ('meal-images', 'meal-images', true);
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'meal_images_select_public') then
    create policy meal_images_select_public on storage.objects
    for select
    using (bucket_id = 'meal-images');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'meal_images_insert_admin') then
    create policy meal_images_insert_admin on storage.objects
    for insert
    to authenticated
    with check (
      bucket_id = 'meal-images'
      and exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and u.role in ('admin', 'kitchen', 'dev')
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'meal_images_update_admin') then
    create policy meal_images_update_admin on storage.objects
    for update
    to authenticated
    using (
      bucket_id = 'meal-images'
      and exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and u.role in ('admin', 'kitchen', 'dev')
      )
    )
    with check (bucket_id = 'meal-images');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'meal_images_delete_admin') then
    create policy meal_images_delete_admin on storage.objects
    for delete
    to authenticated
    using (
      bucket_id = 'meal-images'
      and exists (
        select 1 from public.users u
        where u.id = auth.uid()
          and u.role in ('admin', 'kitchen', 'dev')
      )
    );
  end if;
end
$$;
