# Supabase Auth + Profiles
#
# Enable auth (email magic link) in Supabase.
# Create a `profiles` table with user roles.
# Add `tenant_id` for multi-tenant scoping.
#
# SQL:
# create table if not exists public.profiles (
#   id uuid primary key references auth.users(id) on delete cascade,
#   full_name text,
#   role text not null default 'Sales',
#   tenant_id uuid references public.tenants(id) on delete restrict,
#   created_at timestamptz not null default now()
# );
#
# -- Enable row-level security
# alter table public.profiles enable row level security;
#
# -- Users can read/write their own profile
# create policy "profiles_select_own" on public.profiles
#   for select using (auth.uid() = id);
#
# create policy "profiles_upsert_own" on public.profiles
#   for insert with check (auth.uid() = id);
#
# create policy "profiles_update_own" on public.profiles
#   for update using (auth.uid() = id);
#
# -- Optional: ensure users only see their own profile (already) and keep tenant_id fixed
# -- If you want to prevent users from changing tenant_id, add a check trigger in SQL.
#
# Seed example (replace UUID with your auth user id):
# insert into public.profiles (id, full_name, role, tenant_id)
# values ('<user-uuid>', 'Manager', 'Sales', '<tenant-uuid>');
