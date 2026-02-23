alter table public.profiles
  add column if not exists locale text;

update public.profiles
set locale = 'lv'
where locale is null or btrim(locale) = '';

alter table public.profiles
  alter column locale set default 'lv',
  alter column locale set not null;

alter table public.profiles
  drop constraint if exists profiles_locale_check;

alter table public.profiles
  add constraint profiles_locale_check
  check (locale in ('lv', 'en', 'ru'));
