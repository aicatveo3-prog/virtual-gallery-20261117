-- 작품 속으로 갤러리: Supabase 초기 설정
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여 넣고 Run 을 누르면 됩니다. 여러 번 실행해도 안전합니다.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  gallery_name text not null default '',
  intro text not null default '',
  wall_color text not null default '#eee7da',
  floor text not null default 'wood',
  created_at timestamptz not null default now()
);

create table if not exists public.artworks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  year text not null default '',
  medium text not null default '',
  price integer,
  for_sale boolean not null default false,
  image_path text not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  size_m real not null default 1.5,
  model_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid references public.artworks(id) on delete set null,
  artwork_title text not null default '',
  seller uuid not null references public.profiles(id) on delete cascade,
  buyer uuid not null references auth.users(id) on delete cascade,
  buyer_name text not null,
  buyer_contact text not null,
  message text not null default '',
  amount integer,
  status text not null default 'requested' check (status in ('requested','accepted','declined','cancelled')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.artworks enable row level security;
alter table public.models enable row level security;
alter table public.orders enable row level security;

-- 갤러리, 작품, 모델은 누구나 볼 수 있고, 본인만 고칠 수 있습니다.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);
drop policy if exists "profiles write own" on public.profiles;
create policy "profiles write own" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);

drop policy if exists "artworks read" on public.artworks;
create policy "artworks read" on public.artworks for select using (true);
drop policy if exists "artworks insert own" on public.artworks;
create policy "artworks insert own" on public.artworks for insert with check (auth.uid() = owner);
drop policy if exists "artworks update own" on public.artworks;
create policy "artworks update own" on public.artworks for update using (auth.uid() = owner);
drop policy if exists "artworks delete own" on public.artworks;
create policy "artworks delete own" on public.artworks for delete using (auth.uid() = owner);

drop policy if exists "models read" on public.models;
create policy "models read" on public.models for select using (true);
drop policy if exists "models insert own" on public.models;
create policy "models insert own" on public.models for insert with check (auth.uid() = owner);
drop policy if exists "models delete own" on public.models;
create policy "models delete own" on public.models for delete using (auth.uid() = owner);

-- 주문은 구매자 본인과 판매 작가만 볼 수 있습니다. 상태 변경은 판매 작가(수락/거절)와 구매자(취소)만.
drop policy if exists "orders insert buyer" on public.orders;
create policy "orders insert buyer" on public.orders for insert with check (auth.uid() = buyer and buyer <> seller);
drop policy if exists "orders read parties" on public.orders;
create policy "orders read parties" on public.orders for select using (auth.uid() = buyer or auth.uid() = seller);
drop policy if exists "orders update parties" on public.orders;
create policy "orders update parties" on public.orders for update using (auth.uid() = buyer or auth.uid() = seller);

-- 파일 저장소: media 버킷은 공개 읽기, 업로드와 삭제는 본인 폴더(사용자 id)만.
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "media read" on storage.objects;
create policy "media read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media upload own" on storage.objects;
create policy "media upload own" on storage.objects for insert with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "media delete own" on storage.objects;
create policy "media delete own" on storage.objects for delete using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
