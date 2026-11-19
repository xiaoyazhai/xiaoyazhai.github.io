import { readdir, readFile } from 'node:fs/promises';
import { build, loadEnv } from 'vite';

const env = loadEnv('production', process.cwd(), 'VITE_');
const project = env.VITE_SUPABASE_URL?.trim();
const apiKey = env.VITE_SUPABASE_ANON_KEY?.trim();

function isPublicKey(key) {
  if (key?.startsWith('sb_publishable_') && key.length > 'sb_publishable_'.length) return true;
  try {
    const pieces = key.split('.');
    return pieces.length === 3 && JSON.parse(Buffer.from(pieces[1], 'base64url').toString()).role === 'anon';
  } catch {
    return false;
  }
}

function validProject(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/' && !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

if (!validProject(project) || !isPublicKey(apiKey)) {
  throw new Error('Pages build requires a Supabase HTTPS project URL and a publishable or legacy anon key.');
}

await build();
const index = await readFile('dist/index.html', 'utf8');
const assets = await readdir('dist/assets');
if (!index.includes('/figure-gallery/assets/') || assets.some(name => /^figure-\d/.test(name))) {
  throw new Error('Pages asset paths or development-only images failed verification.');
}
