import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

let db;
const memberA = 'd9a3c6b1-0400-44da-ae2c-ad9effb60cea';
const memberB = '8b58ec3d-c567-404b-8e94-ef447f05ec04';
const published = 'febc0ca5-81a7-4cb9-8c4f-d2541e046c0d';
const hidden = 'e8b87c39-ea90-4207-a6b3-e3df2c4e1dc7';

before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    grant usage on schema storage to anon, authenticated, service_role;
    create table storage.buckets (
      id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]
    );
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text not null, name text);
    alter table storage.buckets enable row level security;
    alter table storage.objects enable row level security;
    grant all on all tables in schema storage to anon, authenticated, service_role;
    create policy intentionally_broad_objects on storage.objects for all to anon, authenticated using (true) with check (true);
    create policy intentionally_broad_buckets on storage.buckets for all to anon, authenticated using (true) with check (true);
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261119000100_gallery.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(`
    insert into storage.buckets (id,name,public) values ('existing', 'existing', true);
    insert into storage.objects (bucket_id,name) values ('research-figures','private.jpg'),('existing','ordinary.jpg');
  `);
  await db.query('insert into public.gallery_members (id,device_hash) values ($1,$3),($2,$4)', [memberA, memberB, 'device-a', 'device-b']);
  const { rows: [{ id }] } = await db.query('select id from public.gallery_categories where position = 10');
  await db.query(`
    insert into public.gallery_figures (id, author_id, category_id, title, author_name, recommendation, design_highlights, status, image_path, thumbnail_path, is_featured)
    values ($1, $3, $4, '几何表达示例', 'Local A', '说明', '配色', 'visible', 'a.jpg', 'a.jpg', true),
           ($2, $5, $4, '隐藏示例', 'Local B', '说明', '色标', 'hidden', 'b.jpg', 'b.jpg', false)
  `, [published, hidden, memberA, id, memberB]);
});

after(async () => { await db?.close(); });

test('public roles cannot read protected tables, execute privileged RPCs, or access the private bucket', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    try {
      await assert.rejects(db.query('select * from public.gallery_figures'), { code: '42501' });
      await assert.rejects(db.query("select public.gallery_rate('test', 60, 1)"), { code: '42501' });
      assert.deepEqual((await db.query('select name from storage.objects')).rows, [{ name: 'ordinary.jpg' }]);
      assert.deepEqual((await db.query('select name from storage.buckets')).rows, [{ name: 'existing' }]);
      await assert.rejects(db.query("insert into storage.objects (bucket_id, name) values ('research-figures', 'x')"), { code: '42501' });
    } finally { await db.exec('reset role'); }
  }
});

test('service can browse, search, restrict hidden works, and count persistent member reactions', async () => {
  await db.exec('set role service_role');
  try {
    await db.query('insert into public.gallery_likes (figure_id, member_id) values ($1,$2)', [published, memberB]);
    await assert.rejects(db.query('insert into public.gallery_likes (figure_id, member_id) values ($1,$2)', [published, memberB]), { code: '23505' });
    await db.query('insert into public.gallery_collections (figure_id, member_id) values ($1,$2)', [published, memberB]);
    await db.query('insert into public.gallery_comments (figure_id, author_id, author_name, content) values ($1,$2,$3,$4)',
      [published, memberA, 'Local A', '可读的布局']);
    const browse = async (id, scope, search, admin) => {
      const result = await db.query(
        "select public.gallery_browse($1, $2, null, $3, 'latest', 0, '', $4) as data",
        [id, scope, search, admin]);
      return result.rows[0].data;
    };
    const gallery = await browse(memberB, 'gallery', 'Local A', false);
    assert.equal(gallery.total, 1);
    assert.deepEqual(gallery.stats, { categories: 8, figures: 1, members: 2 });
    assert.ok(gallery.rows[0].liked && gallery.rows[0].saved);
    assert.equal(gallery.rows[0].like_count, 1);
    assert.equal(gallery.rows[0].comment_count, 1);
    assert.equal((await browse(memberA, 'saved', '', false)).total, 0);
    assert.equal((await browse(memberB, 'saved', '', false)).total, 1);
    assert.equal((await browse(memberB, 'admin', '隐藏', false)).total, 0);
    assert.equal((await browse(memberB, 'admin', '隐藏', true)).rows[0].id, hidden);
  } finally { await db.exec('reset role'); }
});

test('attempt limits are enforced in PostgreSQL', async () => {
  const key = crypto.randomUUID();
  const spend = async () => (await db.query('select public.gallery_rate($1, 3600, 2) as allowed', [key])).rows[0].allowed;
  assert.deepEqual([await spend(), await spend(), await spend(), await spend()], [true, true, false, false]);
});
