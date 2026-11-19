create index gallery_comments_member on public.gallery_comments (author_id, created_at desc);

create or replace function public.gallery_browse(
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
      and (case when p_scope = 'member' then f.author_id = p_profile::uuid else true end)
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
