import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { galleryHandler } from '../supabase/functions/gallery/handler.ts';
import { digest, matchesPassword, readImage } from '../supabase/functions/gallery/validation.ts';

const password = 'local integration test passphrase';
const adminPassword = 'separate local admin test passphrase';
const origin = 'http://localhost:5173';
const category = '861e891a-a9a3-4e4c-83a1-fde0280ae7c9';
const artwork = await readFile(new URL('../gallery-assets/figure-1.webp', import.meta.url));

function sandbox() {
  const tables = { gallery_members: [], gallery_sessions: [], gallery_categories: [{id: category, name: '几何表达'}],
    gallery_figures: [], gallery_likes: [], gallery_collections: [], gallery_comments: [] };
  const files = new Map();
  const counters = new Map();
  const ok = data => ({ data, error: null });

  class Query {
    constructor(table) { this.table = table; this.rows = tables[table]; this.filters = []; this.operation = 'read'; }
    eq(column, value) { this.filters.push(row => row[column] === value); return this; }
    neq(column, value) { this.filters.push(row => row[column] !== value); return this; }
    gt(column, value) { this.filters.push(row => row[column] > value); return this; }
    select() { return this; }
    order() { return this; }
    range() { return this; }
    limit() { return this; }
    insert(value) { this.operation = 'insert'; this.payload = value; return this; }
    upsert(value, options) { this.insert(value); this.conflicts = options.onConflict.split(','); return this; }
    update(value) { this.operation = 'update'; this.payload = value; return this; }
    delete() { this.operation = 'delete'; return this; }
    run() {
      const matched = this.rows.filter(row => this.filters.every(filter => filter(row)));
      if (this.operation === 'read') return matched;
      if (this.operation === 'update') return matched.map(row => Object.assign(row, this.payload));
      if (this.operation === 'delete') {
        for (const row of matched) this.rows.splice(this.rows.indexOf(row), 1);
        return matched;
      }
      if (this.conflicts && this.rows.some(row => this.conflicts.every(column => row[column] === this.payload[column]))) return [];
      const row = {
        id: crypto.randomUUID(), created_at: new Date().toISOString(), display_name: '',
        is_admin: false, status: 'visible', is_featured: false, is_pinned: false, ...this.payload,
      };
      this.rows.push(row);
      return [row];
    }
    single() { return Promise.resolve(ok(this.run()[0])); }
    maybeSingle() { return this.single(); }
    then(fulfilled, rejected) { return Promise.resolve(ok(this.run())).then(fulfilled, rejected); }
  }

  const db = {
    from: table => new Query(table),
    async rpc(name, input) {
      if (name === 'gallery_rate') {
        const count = (counters.get(input.p_key) ?? 0) + 1;
        counters.set(input.p_key, count);
        return ok(count <= input.p_max);
      }
      assert.equal(name, 'gallery_browse');
      const rows = tables.gallery_figures.filter(row => (!input.p_figure || row.id === input.p_figure) &&
        (input.p_scope !== 'member' || row.author_id === input.p_profile) &&
        (row.status === 'visible' || (input.p_admin && ['detail','admin'].includes(input.p_scope)))).map(row => ({
        ...row, category_name: '几何表达',
        liked: tables.gallery_likes.some(like => like.figure_id === row.id && like.member_id === input.p_member),
        saved: tables.gallery_collections.some(save => save.figure_id === row.id && save.member_id === input.p_member),
        like_count: tables.gallery_likes.filter(like => like.figure_id === row.id).length,
        comment_count: tables.gallery_comments.filter(comment => comment.figure_id === row.id).length,
      }));
      return ok({ rows, total: rows.length, stats: null });
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'research-figures');
      return {
        async upload(path, bytes) { files.set(path, bytes); return ok({ path }); },
        async remove(paths) { paths.forEach(path => files.delete(path)); return ok([]); },
        async createSignedUrls(paths) { return ok(paths.filter(path => files.has(path)).map(path => ({
          path, signedUrl: 'https://storage.example/signed/' + path,
        }))); },
        async createSignedUrl(path) { return ok(files.has(path) ? { signedUrl: 'https://storage.example/signed/' + path } : null); },
      };
    } },
  };

  const handler = galleryHandler(db, { password, adminPassword, origins: [origin] });
  const endpoint = 'https://edge.example/functions/v1/gallery';
  async function call(action, data = {}, token, requester = origin) {
    const headers = { origin: requester };
    if (token) headers['x-gallery-session'] = token;
    if (!(data instanceof FormData)) headers['content-type'] = 'application/json';
    const response = await handler(new Request(endpoint, {
      method: 'POST', headers, body: data instanceof FormData ? data : JSON.stringify({ action, ...data }),
    }));
    return [response.status, await response.json()];
  }
  return { call, tables, files, handler, endpoint };
}

function submission(id, file = artwork) {
  const form = new FormData();
  const metadata = {
    id, title: '几何模型测试', author: '成员甲', categoryId: category, recommendation: '阅读顺序清晰', highlights: '标尺紧靠图片',
  };
  for (const [name, value] of Object.entries(metadata)) form.set(name, value);
  form.set('image', new Blob([file], { type: 'text/plain' }), 'untrusted-name.html');
  return form;
}

test('login verifies the shared secret, rate limits, expires, and revokes sessions', async () => {
  const { call, tables, handler, endpoint } = sandbox();
  assert.equal((await call('categories'))[0], 401);
  assert.equal((await call('login', { password: 'incorrect' }))[0], 401);
  assert.equal((await call('login', { password }, undefined, 'https://unknown.example'))[0], 403);
  const preflight = await handler(new Request(endpoint, { method: 'OPTIONS', headers: { origin } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  const [status, user] = await call('login', { password });
  assert.equal(status, 200);
  assert.equal(tables.gallery_sessions[0].token_hash, await digest(user.token));
  assert.notEqual(tables.gallery_sessions[0].token_hash, user.token);
  assert.equal((await call('session', {}, user.token))[0], 200);
  assert.equal((await call('logout', {}, user.token))[0], 200);
  assert.equal((await call('session', {}, user.token))[0], 401);
  const [, renewed] = await call('login', { password, device: user.device });
  assert.equal(tables.gallery_members.length, 1);
  assert.equal(renewed.memberId, user.memberId);
  tables.gallery_sessions[0].expires_at = '2000-01-01T00:00:00.000Z';
  assert.equal((await call('session', {}, renewed.token))[0], 401);
  for (let i = 0; i < 27; i++) assert.equal((await call('login', { password: 'incorrect' }))[0], 401);
  assert.equal((await call('login', { password: 'incorrect' }))[0], 429);
  assert.equal(await matchesPassword('', ''), false);
});

test('upload, reactions and comments work across sessions while image and administration are gated', async () => {
  const { call, files } = sandbox();
  const [, one] = await call('login', { password });
  const [, two] = await call('login', { password });
  const id = crypto.randomUUID();
  const rejected = await call(null, submission(crypto.randomUUID(), 'arbitrary non-image'), one.token);
  assert.equal(rejected[0], 400);
  assert.equal(files.size, 0);
  assert.equal((await call(null, submission(id)))[0], 401);
  assert.deepEqual(await call(null, submission(id), one.token), [200, { id }]);
  assert.deepEqual(await call(null, submission(id), one.token), [200, { id }]);
  assert.equal(files.size, 1);
  assert.match([...files.keys()][0], /\/original\.webp$/);
  assert.equal((await call('detail', { id }))[0], 401);
  assert.equal((await call('moderate', { id, change: 'hidden', enabled: true }, two.token))[0], 403);
  assert.equal((await call('adminLogin', { password }, two.token))[0], 403);
  let [, view] = await call('detail', { id }, two.token);
  assert.match(view.figure.imageUrl, /^https:\/\/storage\.example\/signed\//);
  assert.equal('image_path' in view.figure, false);
  assert.equal(view.figure.title, '几何模型测试');
  assert.equal(view.figure.recommendation, '阅读顺序清晰');
  for (let i = 0; i < 2; i++) assert.deepEqual(await call('reaction', { id, kind: 'like', enabled: true }, two.token),
    [200, { liked: true, saved: false, likes: 1 }]);
  assert.deepEqual(await call('reaction', { id, kind: 'save', enabled: true }, one.token),
    [200, { liked: false, saved: true, likes: 1 }]);
  assert.equal((await call('comment', { id, author: '成员乙', text: '  ' }, two.token))[0], 400);
  const [added, comment] = await call('comment', { id, author: '成员乙', text: '建议将标尺放在右侧。' }, two.token);
  assert.equal(added, 200);
  [, view] = await call('detail', { id }, one.token);
  assert.equal(view.figure.likes, 1);
  assert.equal(view.figure.liked, false);
  assert.equal(view.comments[0].text, comment.text);
  assert.equal((await call('deleteComment', { id: comment.id }, two.token))[0], 403);
  assert.equal((await call('adminLogin', { password: adminPassword }, one.token))[0], 200);
  assert.equal((await call('moderate', { id, change: 'hidden', enabled: true }, one.token))[0], 200);
  assert.equal((await call('detail', { id }, two.token))[0], 404);
  assert.equal((await call('detail', { id }, one.token))[0], 200);
  assert.equal((await call('deleteComment', { id: comment.id }, one.token))[0], 200);
  assert.equal((await call('moderate', { id, change: 'delete' }, one.token))[0], 200);
  assert.equal(files.size, 0);
  assert.equal((await call('detail', { id }, one.token))[0], 404);
});

test('submissions only need a file, display nickname and category', async () => {
  const { call } = sandbox();
  const [, member] = await call('login', { password });
  const id = crypto.randomUUID();
  const form = new FormData();
  form.set('id', id);
  form.set('author', '成员甲');
  form.set('categoryId', category);
  form.set('image', new Blob([artwork], { type: 'image/webp' }), '晶格结构研究图.WEBP');
  assert.deepEqual(await call(null, form, member.token), [200, { id }]);
  const [status, { figure }] = await call('detail', { id }, member.token);
  assert.equal(status, 200);
  assert.equal(figure.title, '晶格结构研究图');
  assert.equal(figure.authorId, member.memberId);
  assert.equal(figure.recommendation, '');
  assert.equal(figure.highlights, '');
  assert.equal(figure.doi, '');
});

test('uploads derive their member tag from the session and distinguish members with the same nickname', async () => {
  const { call } = sandbox();
  const [, one] = await call('login', { password });
  const [, two] = await call('login', { password });
  const oneFigure = crypto.randomUUID();
  const twoFigure = crypto.randomUUID();
  const claimed = submission(oneFigure);
  claimed.set('authorId', two.memberId);
  assert.equal((await call('upload', claimed, one.token))[0], 200);
  assert.equal((await call('upload', submission(twoFigure), two.token))[0], 200);
  assert.equal((await call('nickname', { nickname: '成员甲的新昵称' }, one.token))[0], 200);

  const [status, first] = await call('list', { scope: 'member', profile: one.memberId }, two.token);
  assert.equal(status, 200);
  assert.equal(first.profileName, '成员甲的新昵称');
  assert.deepEqual(first.figures.map(figure => [figure.id, figure.author, figure.authorId]), [
    [oneFigure, '成员甲', one.memberId],
  ]);
  const [, second] = await call('list', { scope: 'member', profile: two.memberId }, one.token);
  assert.deepEqual(second.figures.map(figure => [figure.id, figure.authorId]), [[twoFigure, two.memberId]]);
  assert.equal((await call('list', { scope: 'member', profile: '成员甲' }, one.token))[0], 400);
  assert.equal((await call('list', { scope: 'member', profile: one.memberId }))[0], 401);
});

test('image validation accepts real content despite the MIME hint and rejects oversized files', async () => {
  const image = await readImage(new File([artwork], 'wrong.jpg', { type: 'image/jpeg' }), artwork.length);
  assert.equal(image.mime, 'image/webp');
  await assert.rejects(readImage(new File([artwork], 'sample.webp'), artwork.length - 1), { status: 400 });
});
