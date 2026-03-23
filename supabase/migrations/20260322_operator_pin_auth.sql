alter table public.profiles
  add column if not exists login_code text;

alter table public.profiles
  add column if not exists auth_mode text not null default 'password';

alter table public.profiles
  add column if not exists is_active boolean not null default true;

alter table public.profiles
  drop constraint if exists profiles_auth_mode_check;

alter table public.profiles
  add constraint profiles_auth_mode_check
  check (auth_mode in ('password', 'pin'));

create unique index if not exists profiles_login_code_uidx
  on public.profiles (login_code)
  where login_code is not null;

alter table public.operators
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists operators_user_id_uidx
  on public.operators (user_id)
  where user_id is not null;
