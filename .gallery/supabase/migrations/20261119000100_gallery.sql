create table public.gallery_members (
  id uuid primary key default gen_random_uuid(),
  device_hash text not null unique,
  display_name text not null default '' check (char_length(display_name) <= 32),
  created_at timestamptz not null default now()
);

create table public.gallery_sessions (
  token_hash text primary key,
  member_id uuid not null references public.gallery_members(id) on delete cascade,
  expires_at timestamptz not null,
  is_admin boolean not null default false
);

create index gallery_sessions_expiry on public.gallery_sessions (expires_at);

create table public.gallery_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 32),
  position int not null default 100
);

insert into public.gallery_categories (name, position) values
  ('几何表达', 10), ('结构设计', 20), ('力学仿真', 30), ('科学机理', 40),
  ('实验展示', 50), ('数据可视化', 60), ('多尺度结构', 70), ('综合插图', 80);

create table public.gallery_figures (
  id uuid primary key,
  author_id uuid not null references public.gallery_members(id),
  author_name text not null check (char_length(author_name) between 1 and 32),
  category_id uuid not null references public.gallery_categories(id),
  title text not null check (char_length(title) between 1 and 140),
  recommendation text not null check (char_length(recommendation) between 1 and 2000),
  design_highlights text not null check (char_length(design_highlights) between 1 and 1500),
  paper_title text not null default '' check (char_length(paper_title) <= 240),
  journal text not null default '' check (char_length(journal) <= 120),
  year smallint check (year between 1500 and 2200),
  doi text not null default '' check (char_length(doi) <= 160),
  source_url text not null default '' check (char_length(source_url) <= 512),
  image_path text not null unique,
  thumbnail_path text not null,
  is_featured boolean not null default false,
  is_pinned boolean not null default false,
  status text not null default 'visible' check (status in ('visible', 'hidden', 'deleting')),
  created_at timestamptz not null default now()
);

create index gallery_figures_browse on public.gallery_figures (is_pinned desc, created_at desc) where status = 'visible';
create index gallery_figures_category on public.gallery_figures (category_id);
create index gallery_figures_author on public.gallery_figures (author_id);
create index gallery_figures_name on public.gallery_figures (author_name);

create table public.gallery_likes (
  figure_id uuid not null references public.gallery_figures(id) on delete cascade,
  member_id uuid not null references public.gallery_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (figure_id, member_id)
);

create table public.gallery_collections (
  figure_id uuid not null references public.gallery_figures(id) on delete cascade,
  member_id uuid not null references public.gallery_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (figure_id, member_id)
);

create index gallery_collections_member on public.gallery_collections (member_id);

create table public.gallery_comments (
  id uuid primary key default gen_random_uuid(),
  figure_id uuid not null references public.gallery_figures(id) on delete cascade,
  author_id uuid not null references public.gallery_members(id),
  author_name text not null check (char_length(author_name) between 1 and 32),
  content text not null check (char_length(content) between 1 and 1200),
  created_at timestamptz not null default now()
);

create index gallery_comments_figure on public.gallery_comments (figure_id, created_at desc);
create index gallery_comments_author on public.gallery_comments (author_name, created_at desc);

create table public.gallery_rate_limits (
  rate_key text not null,
  window_start timestamptz not null,
  attempts int not null,
  primary key (rate_key, window_start)
);

create index gallery_rate_window on public.gallery_rate_limits (window_start);

alter table public.gallery_members enable row level security;
alter table public.gallery_sessions enable row level security;
alter table public.gallery_categories enable row level security;
alter table public.gallery_figures enable row level security;
alter table public.gallery_likes enable row level security;
alter table public.gallery_comments enable row level security;
alter table public.gallery_collections enable row level security;
alter table public.gallery_rate_limits enable row level security;

revoke all on public.gallery_members, public.gallery_sessions, public.gallery_categories,
  public.gallery_figures, public.gallery_likes, public.gallery_comments, public.gallery_collections,
  public.gallery_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.gallery_members, public.gallery_sessions,
  public.gallery_categories, public.gallery_figures, public.gallery_likes, public.gallery_comments,
  public.gallery_collections, public.gallery_rate_limits to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('research-figures', 'research-figures', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive and scoped to this bucket so a pre-existing permissive project policy cannot expose it.
create policy gallery_private_objects on storage.objects as restrictive for all to anon, authenticated
  using (bucket_id <> 'research-figures') with check (bucket_id <> 'research-figures');
create policy gallery_private_bucket_listing on storage.buckets as restrictive for all to anon, authenticated
  using (id <> 'research-figures') with check (id <> 'research-figures');

create function public.gallery_rate(p_key text, p_seconds int, p_max int)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  current_window timestamptz;
  allowed boolean;
begin
  current_window := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_seconds) * p_seconds);
  insert into public.gallery_rate_limits (rate_key, window_start, attempts)
  values (p_key, current_window, 1)
  on conflict (rate_key, window_start) do update
    set attempts = gallery_rate_limits.attempts + 1
    where gallery_rate_limits.attempts < p_max
  returning true into allowed;
  return coalesce(allowed, false);
end;
$$;

create function public.gallery_browse(
  p_member uuid, p_scope text, p_category uuid, p_search text, p_sort text,
  p_offset int, p_profile text, p_admin boolean, p_figure uuid default null
) returns jsonb language sql stable security invoker set search_path = '' as $$
  with selected as (
    select f.*, c.name as category_name,
      (select count(*) from public.gallery_likes l where l.figure_id = f.id) as like_count,
      (select count(*) from public.gallery_comments m where m.figure_id = f.id) as comment_count,
      exists (select 1 from public.gallery_likes l where l.figure_id = f.id and l.member_id = p_member) as liked,
      exists (select 1 from public.gallery_collections s where s.figure_id = f.id and s.member_id = p_member) as saved
    from public.gallery_figures f
    join public.gallery_categories c on c.id = f.category_id
    where ((p_admin and p_scope in ('admin', 'detail')) or f.status = 'visible')
      and (p_category is null or f.category_id = p_category)
      and (p_figure is null or f.id = p_figure)
      and (p_scope <> 'featured' or p_sort <> 'latest' or f.is_featured)
      and (p_scope <> 'saved' or exists (
        select 1 from public.gallery_collections s where s.figure_id = f.id and s.member_id = p_member
      ))
      and (p_scope <> 'profile' or f.author_name = p_profile)
      and (p_search = '' or strpos(lower(concat_ws(' ', f.title, f.author_name, c.name,
        f.paper_title, f.journal, f.doi, f.recommendation, f.design_highlights)), lower(p_search)) > 0)
  ), ranked as (
    select s.*, row_number() over (order by
      case when p_scope in ('gallery', 'featured') and p_sort = 'latest' then s.is_pinned else false end desc,
      case when p_sort = 'popular' then s.like_count end desc nulls last,
      case when p_sort = 'discussed' then s.comment_count end desc nulls last,
      s.created_at desc, s.id) as rank
    from selected s
  ), page as (
    select * from ranked order by rank offset greatest(0, p_offset) limit 24
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page) - 'rank' order by page.rank) from page), '[]'::jsonb),
    'total', (select count(*) from selected),
    'stats', case when p_offset = 0 and p_scope = 'gallery' then jsonb_build_object(
      'figures', (select count(*) from public.gallery_figures where status = 'visible'),
      'members', (select count(*) from (
        select author_id from public.gallery_figures where status = 'visible'
        union select m.author_id from public.gallery_comments m
          join public.gallery_figures f on f.id = m.figure_id and f.status = 'visible'
        union select l.member_id from public.gallery_likes l
          join public.gallery_figures f on f.id = l.figure_id and f.status = 'visible'
      ) contributors),
      'categories', (select count(*) from public.gallery_categories)
    ) end
  );
$$;

revoke execute on function public.gallery_rate(text, int, int) from public, anon, authenticated;
grant execute on function public.gallery_rate(text, int, int) to service_role;
revoke execute on function public.gallery_browse(uuid, text, uuid, text, text, int, text, boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.gallery_browse(uuid, text, uuid, text, text, int, text, boolean, uuid)
  to service_role;
