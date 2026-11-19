import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const project = process.env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.VITE_SUPABASE_ANON_KEY;
const password = process.env.GALLERY_ACCESS_PASSWORD;
const adminPassword = process.env.GALLERY_ADMIN_PASSWORD;
if (!project || !key || !password || !adminPassword || process.env.GALLERY_SMOKE_WRITE !== 'yes') {
  throw new Error('Set the four Gallery environment variables and GALLERY_SMOKE_WRITE=yes for a test project.');
}
const request = async (action, fields = {}, token, expected = 200) => {
  const headers = { apikey: key };
  if (token) headers['x-gallery-session'] = token;
  if (!(fields instanceof FormData)) headers['content-type'] = 'application/json';
  const response = await fetch(project + '/functions/v1/gallery', {
    method: 'POST', headers, body: fields instanceof FormData ? fields : JSON.stringify({ action, ...fields }),
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, expected, action + ' returned ' + response.status);
  return response.json();
};
const id = crypto.randomUUID();
const title = 'Gallery staging smoke ' + id;
const sessions = [];
let admin;
const uploads = [];

try {
  await request('categories', {}, undefined, 401);
  await request('login', { password: crypto.randomUUID() }, undefined, 401);
  const first = await request('login', { password });
  sessions.push(first.token);
  const second = await request('login', { password });
  sessions.push(second.token);
  await request('adminLogin', { password: adminPassword }, first.token);
  admin = first.token;
  const { categories } = await request('categories', {}, first.token);
  assert.ok(categories.length, 'Test project needs one active category');
  const form = new FormData();
  const fields = {
    id, author: 'Staging smoke', categoryId: categories[0].id,
  };
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  const image = await readFile(new URL('../gallery-assets/figure-1.webp', import.meta.url));
  form.set('image', new Blob([image], { type: 'image/webp' }), title + '.webp');
  uploads.push(id);
  await request('upload', form, first.token);
  const secondId = crypto.randomUUID();
  form.set('id', secondId);
  form.set('title', 'Gallery staging smoke ' + secondId);
  form.set('recommendation', 'An earlier client can still submit a recommendation.');
  form.set('highlights', 'Synthetic image');
  uploads.push(secondId);
  await request('upload', form, second.token);
  assert.notEqual(first.memberId, second.memberId);
  await request('nickname', { nickname: 'Renamed smoke member' }, first.token);
  const firstMember = await request('list', { scope: 'member', profile: first.memberId }, second.token);
  assert.equal(firstMember.profileName, 'Renamed smoke member');
  assert.deepEqual(firstMember.figures.map(figure => [figure.id, figure.author, figure.authorId]),
    [[id, fields.author, first.memberId]]);
  const secondMember = await request('list', { scope: 'member', profile: second.memberId }, first.token);
  assert.deepEqual(secondMember.figures.map(figure => [figure.id, figure.author, figure.authorId]),
    [[secondId, fields.author, second.memberId]]);
  await request('moderate', { id, change: 'pinned', enabled: true }, second.token, 403);
  await request('detail', { id }, undefined, 401);
  const detail = await request('detail', { id }, second.token);
  assert.equal(detail.figure.title, title);
  assert.equal(detail.figure.recommendation, '');
  assert.equal(detail.figure.highlights, '');
  assert.equal(secondMember.figures[0].recommendation, 'An earlier client can still submit a recommendation.');
  assert.equal(detail.figure.authorId, first.memberId);
  const signed = new URL(detail.figure.imageUrl);
  const download = await fetch(signed, { signal: AbortSignal.timeout(20000) });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), image);
  signed.pathname = signed.pathname.replace('/object/sign/', '/object/public/');
  signed.search = '';
  assert.equal((await fetch(signed, { signal: AbortSignal.timeout(20000) })).ok, false);
  const dataApi = await fetch(project + '/rest/v1/gallery_figures?select=id', {
    headers: { apikey: key }, signal: AbortSignal.timeout(20000),
  });
  assert.equal(dataApi.ok, false);
  for (let i = 0; i < 2; i++) {
    const result = await request('reaction', { id, kind: 'like', enabled: true }, second.token);
    assert.equal(result.likes, 1);
  }
  await request('reaction', { id, kind: 'save', enabled: true }, second.token);
  const comment = await request('comment', { id, author: 'Staging smoke', text: 'Synthetic sample.' }, second.token);
  const visible = await request('detail', { id }, first.token);
  assert.equal(visible.figure.likes, 1);
  assert.ok(visible.comments.some(item => item.id === comment.id && item.authorId === second.memberId));
  const commented = await request('list', { scope: 'member', profile: second.memberId }, first.token);
  assert.ok(commented.comments.some(item => item.figureId === id && item.text === comment.text));
  const resumed = await request('login', { password, device: second.device });
  sessions.push(resumed.token);
  assert.equal(resumed.memberId, second.memberId);
  assert.equal((await request('detail', { id }, resumed.token)).figure.saved, true);
  await request('moderate', { id, change: 'hidden', enabled: true }, first.token);
  await request('detail', { id }, second.token, 404);
  await request('detail', { id }, first.token);
  console.log('Gallery login, upload, member tags, private image access, interactions, persistence and administration passed.');
} finally {
  try {
    if (admin) {
      for (const figureId of uploads) await request('moderate', { id: figureId, change: 'delete' }, admin);
    }
  } finally {
    for (const session of sessions) await request('logout', {}, session);
  }
}
