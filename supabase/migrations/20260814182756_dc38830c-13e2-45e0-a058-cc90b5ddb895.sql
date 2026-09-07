create policy "acremap_files_select" on storage.objects for select to authenticated
  using (bucket_id in ('imports','photos'));
create policy "acremap_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('imports','photos') and owner = auth.uid());
create policy "acremap_files_update" on storage.objects for update to authenticated
  using (bucket_id in ('imports','photos') and (owner = auth.uid() or public.has_role(auth.uid(),'admin')))
  with check (bucket_id in ('imports','photos'));
create policy "acremap_files_delete" on storage.objects for delete to authenticated
  using (bucket_id in ('imports','photos') and (owner = auth.uid() or public.has_role(auth.uid(),'admin')));