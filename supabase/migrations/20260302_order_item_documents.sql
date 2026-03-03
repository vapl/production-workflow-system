create table if not exists public.order_item_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  order_attachment_id uuid not null references public.order_attachments(id) on delete cascade,
  role text not null default 'source'
    check (role in ('source', 'production', 'reference')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists order_item_documents_unique
  on public.order_item_documents(order_item_id, order_attachment_id);
create index if not exists order_item_documents_tenant_id_idx
  on public.order_item_documents(tenant_id);
create index if not exists order_item_documents_order_item_id_idx
  on public.order_item_documents(order_item_id);
create index if not exists order_item_documents_attachment_id_idx
  on public.order_item_documents(order_attachment_id);

create or replace function public.set_order_item_document_tenant_id()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is null then
    select oi.tenant_id
      into new.tenant_id
    from public.order_items oi
    where oi.id = new.order_item_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_order_item_documents_tenant_id on public.order_item_documents;
create trigger set_order_item_documents_tenant_id
before insert on public.order_item_documents
for each row execute procedure public.set_order_item_document_tenant_id();

alter table public.order_item_documents enable row level security;

create policy "order_item_documents_select_by_tenant" on public.order_item_documents
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_documents.tenant_id
    )
  );

create policy "order_item_documents_insert_by_tenant" on public.order_item_documents
  for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_documents.tenant_id
    )
  );

create policy "order_item_documents_update_by_tenant" on public.order_item_documents
  for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_documents.tenant_id
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_documents.tenant_id
    )
  );

create policy "order_item_documents_delete_by_tenant" on public.order_item_documents
  for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.tenant_id = order_item_documents.tenant_id
    )
  );
