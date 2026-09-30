-- ============================================================
--  Sunshine's Boutique — database setup
--  Paste this whole file into Supabase → SQL Editor → Run.
--  Safe to run more than once.
-- ============================================================

-- ---------- Who is allowed to manage the shop ----------
create table if not exists public.admins (
  email text primary key
);
insert into public.admins (email) values
  ('ajoklilian027@gmail.com'),
  ('oriventrust@gmail.com')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table public.admins enable row level security;
drop policy if exists "admins read self" on public.admins;
create policy "admins read self" on public.admins for select using (public.is_admin());

-- ---------- Shop settings (edited from the Studio app) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  whatsapp text default '',
  google_review_url text default '',
  instagram text default '',
  tiktok text default '',
  facebook text default '',
  announcement text default 'New pieces every week · Order in one tap on WhatsApp · Delivery across Kampala',
  hero_title text default '',
  hero_subtitle text default '',
  about text default '',
  hours text default 'Mon – Sat · 9am – 8pm',
  updated_at timestamptz default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

alter table public.settings enable row level security;
drop policy if exists "settings public read" on public.settings;
create policy "settings public read" on public.settings for select using (true);
drop policy if exists "settings admin write" on public.settings;
create policy "settings admin write" on public.settings for update using (public.is_admin()) with check (public.is_admin());

-- ---------- Products ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  description text default '',
  category text default 'Dresses',
  price numeric default 0,
  compare_at numeric,
  sizes text[] default '{}',
  colors text[] default '{}',
  tags text[] default '{}',
  images text[] default '{}',
  status text not null default 'published' check (status in ('draft','published','sold','hidden')),
  featured boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists products_status_created on public.products (status, created_at desc);

alter table public.products enable row level security;
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select
  using (status in ('published','sold') or public.is_admin());
drop policy if exists "products admin insert" on public.products;
create policy "products admin insert" on public.products for insert with check (public.is_admin());
drop policy if exists "products admin update" on public.products;
create policy "products admin update" on public.products for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists "products admin delete" on public.products;
create policy "products admin delete" on public.products for delete using (public.is_admin());

-- ---------- Customer profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles own read" on public.profiles;
create policy "profiles own read" on public.profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles own write" on public.profiles;
create policy "profiles own write" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "profiles own insert" on public.profiles;
create policy "profiles own insert" on public.profiles for insert with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Wishlist ----------
create table if not exists public.wishlist (
  user_id uuid references auth.users on delete cascade,
  product_id uuid references public.products on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, product_id)
);
alter table public.wishlist enable row level security;
drop policy if exists "wishlist own" on public.wishlist;
create policy "wishlist own" on public.wishlist for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Reviews (rate the shop & app) ----------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade default auth.uid(),
  name text not null,
  rating int not null check (rating between 1 and 5),
  comment text default '' check (char_length(comment) <= 1000),
  approved boolean default true,
  created_at timestamptz default now()
);
alter table public.reviews enable row level security;
drop policy if exists "reviews public read" on public.reviews;
create policy "reviews public read" on public.reviews for select using (approved or auth.uid() = user_id or public.is_admin());
drop policy if exists "reviews own insert" on public.reviews;
create policy "reviews own insert" on public.reviews for insert with check (auth.uid() = user_id);
drop policy if exists "reviews own update" on public.reviews;
create policy "reviews own update" on public.reviews for update using (auth.uid() = user_id or public.is_admin());
drop policy if exists "reviews admin delete" on public.reviews;
create policy "reviews admin delete" on public.reviews for delete using (auth.uid() = user_id or public.is_admin());

-- ---------- Customer messages (contact form) ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text check (char_length(email) <= 200),
  phone text check (char_length(phone) <= 40),
  message text not null check (char_length(message) between 1 and 4000),
  product_id uuid references public.products on delete set null,
  is_read boolean default false,
  notified boolean default false,
  created_at timestamptz default now()
);
alter table public.messages enable row level security;
drop policy if exists "messages anyone insert" on public.messages;
create policy "messages anyone insert" on public.messages for insert with check (is_read = false and notified = false);
drop policy if exists "messages admin read" on public.messages;
create policy "messages admin read" on public.messages for select using (public.is_admin());
drop policy if exists "messages admin update" on public.messages;
create policy "messages admin update" on public.messages for update using (public.is_admin());
drop policy if exists "messages admin delete" on public.messages;
create policy "messages admin delete" on public.messages for delete using (public.is_admin());

-- ---------- Photo storage ----------
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do update set public = true;

drop policy if exists "product photos admin insert" on storage.objects;
create policy "product photos admin insert" on storage.objects for insert
  with check (bucket_id = 'products' and public.is_admin());
drop policy if exists "product photos admin update" on storage.objects;
create policy "product photos admin update" on storage.objects for update
  using (bucket_id = 'products' and public.is_admin());
drop policy if exists "product photos admin delete" on storage.objects;
create policy "product photos admin delete" on storage.objects for delete
  using (bucket_id = 'products' and public.is_admin());

-- ---------- Keep updated_at fresh ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------- Table access for the website (security rules above still apply) ----------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on function public.is_admin() to anon, authenticated, service_role;
