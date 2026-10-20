-- Global Anime Party media library.
-- Run this in the Supabase SQL Editor before using the library UI.
-- Files are public-read so every player in every room can play them.
-- Upload/delete is restricted in SQL to users whose room_players.player_order is 1 (the room creator/host).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'anime-party-media',
  'anime-party-media',
  true,
  524288000,
  array['audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm','video/mp4','video/webm','video/ogg','video/quicktime']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.media_library (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  answer text not null,
  media_type text not null check (media_type in ('audio','video')),
  storage_path text not null unique,
  mime_type text not null,
  size_bytes bigint not null default 0,
  duration_seconds numeric,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.media_library enable row level security;

drop policy if exists "Authenticated users can read media library" on public.media_library;
create policy "Authenticated users can read media library"
on public.media_library for select to authenticated using (true);

-- The room creator is player_order = 1 in the existing create_room/join_room flow.
-- A user who is not currently the creator of a room cannot mutate the global library.
create or replace function public.is_anime_party_room_host()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.room_players rp
    join public.game_rooms gr on gr.id = rp.room_id
    where rp.user_id = auth.uid()
      and rp.player_order = 1
      and gr.status in ('lobby','playing')
  );
$function$;

revoke all on function public.is_anime_party_room_host() from public;
grant execute on function public.is_anime_party_room_host() to authenticated;

drop policy if exists "Authenticated users can add media library items" on public.media_library;
drop policy if exists "Room hosts can add media library items" on public.media_library;
create policy "Room hosts can add media library items"
on public.media_library for insert to authenticated
with check (created_by = auth.uid() and public.is_anime_party_room_host());

drop policy if exists "Uploader can update media library items" on public.media_library;
drop policy if exists "Room hosts can update media library items" on public.media_library;
create policy "Room hosts can update media library items"
on public.media_library for update to authenticated
using (public.is_anime_party_room_host()) with check (public.is_anime_party_room_host());

drop policy if exists "Uploader can delete media library items" on public.media_library;
drop policy if exists "Room hosts can delete media library items" on public.media_library;
create policy "Room hosts can delete media library items"
on public.media_library for delete to authenticated using (public.is_anime_party_room_host());

drop policy if exists "Authenticated users can read shared media files" on storage.objects;
create policy "Authenticated users can read shared media files"
on storage.objects for select to authenticated using (bucket_id = 'anime-party-media');

drop policy if exists "Authenticated users can upload shared media files" on storage.objects;
drop policy if exists "Room hosts can upload shared media files" on storage.objects;
create policy "Room hosts can upload shared media files"
on storage.objects for insert to authenticated
with check (bucket_id = 'anime-party-media' and public.is_anime_party_room_host());

drop policy if exists "Authenticated users can delete shared media files" on storage.objects;
drop policy if exists "Room hosts can delete shared media files" on storage.objects;
create policy "Room hosts can delete shared media files"
on storage.objects for delete to authenticated
using (bucket_id = 'anime-party-media' and public.is_anime_party_room_host());
