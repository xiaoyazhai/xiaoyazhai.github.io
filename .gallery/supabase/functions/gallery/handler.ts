import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.89.0';
import {
  boundedBody, digest, inputPassword, inputText, inputUrl, inputUuid, inputYear, isToken, matchesPassword,
  MAX_THUMB, MAX_UPLOAD, mintToken, readImage, RequestError,
} from './validation.ts';

type Settings = { password: string; adminPassword: string; origins: string[] };
type Session = { token_hash: string; member_id: string; expires_at: string; is_admin: boolean };
type FigureRow = {
  id: string; title: string; author_name: string; category_id: string; category_name: string;
  created_at: string; recommendation: string; design_highlights: string; paper_title: string; journal: string;
  year: number | null; doi: string; source_url: string; image_path: string; thumbnail_path: string;
  is_featured: boolean; is_pinned: boolean; status: string; liked: boolean; saved: boolean;
  like_count: number; comment_count: number;
};
type BrowseResult = {
  rows: FigureRow[];
  total: number;
  stats: { figures: number; members: number; categories: number } | null;
};

const SESSION_MS = 8 * 60 * 60 * 1000;
const BUCKET = 'research-figures';

function value<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error('Gallery service operation failed');
  return result.data;
}

function required<T>(result: { data: T; error: unknown }): NonNullable<T> {
  const data = value(result);
  if (data == null) throw new Error('Gallery service did not return data');
  return data;
}

function assertAdmin(session: Session) {
  if (!session.is_admin) throw new RequestError(403, '此操作需要单独的管理员授权。');
}

function publicFigure(row: FigureRow, thumbUrl = '', imageUrl = '') {
  return {
    id: row.id, title: row.title, author: row.author_name, categoryId: row.category_id,
    category: row.category_name, date: row.created_at, recommendation: row.recommendation,
    highlights: row.design_highlights, paperTitle: row.paper_title, journal: row.journal,
    year: row.year, doi: row.doi, sourceUrl: row.source_url, thumbUrl, imageUrl,
    featured: row.is_featured, pinned: row.is_pinned, status: row.status,
    liked: row.liked, saved: row.saved, likes: row.like_count, comments: row.comment_count,
  };
}

export function galleryHandler(db: SupabaseClient, settings: Settings) {
  const storage = db.storage.from(BUCKET);

  async function limit(key: string, seconds: number, max: number) {
    const allowed = value(await db.rpc('gallery_rate', { p_key: key, p_seconds: seconds, p_max: max }));
    if (!allowed) throw new RequestError(429, '操作过于频繁，请稍后再试。');
  }

  async function readSession(req: Request): Promise<Session> {
    const token = req.headers.get('x-gallery-session');
    if (!isToken(token)) throw new RequestError(401, '请重新输入课题组访问密码。');
    const session = value(await db.from('gallery_sessions').select('token_hash,member_id,expires_at,is_admin')
      .eq('token_hash', await digest(token)).gt('expires_at', new Date().toISOString()).maybeSingle());
    if (!session) throw new RequestError(401, '访问会话已过期，请重新验证。');
    return session;
  }

  async function signIn(req: Request, data: Record<string, unknown>) {
    if (!settings.password) throw new RequestError(503, '管理员尚未配置访问密码。');
    const address = req.headers.get('cf-connecting-ip') ?? 'unavailable';
    await limit('login:' + await digest(address), 600, address === 'unavailable' ? 30 : 12);
    await limit('login:global', 600, 240);
    const supplied = inputPassword(data.password);
    if (!await matchesPassword(supplied, settings.password)) {
      throw new RequestError(401, '访问密码有误，请重试。');
    }
    const device = isToken(data.device) ? data.device : mintToken();
    const deviceHash = await digest(device);
    value(await db.from('gallery_members').upsert({ device_hash: deviceHash }, {
      onConflict: 'device_hash', ignoreDuplicates: true,
    }));
    const member = required(await db.from('gallery_members').select('id,display_name')
      .eq('device_hash', deviceHash).single());
    const token = mintToken();
    const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
    value(await db.from('gallery_sessions').insert({
      token_hash: await digest(token), member_id: member.id, expires_at: expiresAt,
    }));
    return { token, device, expiresAt, nickname: member.display_name, admin: false };
  }

  async function categories() {
    return required(await db.from('gallery_categories').select('id,name').order('position').order('name'));
  }

  async function list(session: Session, data: Record<string, unknown>) {
    const scope = inputText(data.scope, 12) || 'gallery';
    if (!['gallery', 'featured', 'saved', 'profile', 'admin', 'detail'].includes(scope)) {
      throw new RequestError(400, '未知的图库视图。');
    }
    if (scope === 'admin') assertAdmin(session);
    const sort = inputText(data.sort, 12) || 'latest';
    if (!['latest', 'popular', 'discussed'].includes(sort)) throw new RequestError(400, '未知的排序。');
    const offset = Number(data.offset ?? 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000) {
      throw new RequestError(400, '无效的分页参数。');
    }
    return required(await db.rpc('gallery_browse', {
      p_member: session.member_id, p_scope: scope, p_category: data.category ? inputUuid(data.category) : null,
      p_search: inputText(data.query, 120), p_sort: sort, p_offset: offset,
      p_profile: inputText(data.profile, 32), p_admin: session.is_admin,
      p_figure: scope === 'detail' ? inputUuid(data.figure) : null,
    })) as BrowseResult;
  }

  async function visibleFigure(id: string) {
    const figure = value(await db.from('gallery_figures').select('id').eq('id', id).eq('status', 'visible').maybeSingle());
    if (!figure) throw new RequestError(404, '这张图片已撤下或不存在。');
  }

  async function upload(session: Session, req: Request) {
    await limit('upload:' + session.member_id, 3600, 40);
    if (!(req.headers.get('content-type') ?? '').startsWith('multipart/form-data;')) {
      throw new RequestError(400, '请从图库上传页面提交图片。');
    }
    const body = await boundedBody(req, MAX_UPLOAD + MAX_THUMB + 64 * 1024);
    const form = await body.formData().catch(error => {
      if (error instanceof RequestError) throw error;
      throw new RequestError(400, '无法读取上传表单。');
    });
    const id = inputUuid(form.get('id'));
    const known = value(await db.from('gallery_figures').select('author_id').eq('id', id).maybeSingle());
    if (known) {
      if (known.author_id !== session.member_id) throw new RequestError(409, '提交标识已被使用。');
      return { id };
    }
    const row = {
      id, author_id: session.member_id, title: inputText(form.get('title'), 140, true),
      author_name: inputText(form.get('author'), 32, true), category_id: inputUuid(form.get('categoryId')),
      recommendation: inputText(form.get('recommendation'), 2000, true),
      design_highlights: inputText(form.get('highlights'), 1500, true),
      paper_title: inputText(form.get('paperTitle'), 240), journal: inputText(form.get('journal'), 120),
      year: inputYear(form.get('year')), doi: inputText(form.get('doi'), 160), source_url: inputUrl(form.get('sourceUrl')),
    };
    const category = value(await db.from('gallery_categories').select('id').eq('id', row.category_id).maybeSingle());
    if (!category) throw new RequestError(400, '请选择仍然可用的分类。');
    const image = await readImage(form.get('image'), MAX_UPLOAD);
    const thumbnail = form.has('thumbnail') ? await readImage(form.get('thumbnail'), MAX_THUMB) : null;
    const folder = id + '/' + crypto.randomUUID();
    const imagePath = folder + '/original.' + image.extension;
    const thumbPath = thumbnail ? folder + '/thumbnail.' + thumbnail.extension : imagePath;
    const paths = thumbnail ? [imagePath, thumbPath] : [imagePath];
    try {
      value(await storage.upload(imagePath, image.bytes, { contentType: image.mime, cacheControl: '120' }));
      if (thumbnail) {
        value(await storage.upload(thumbPath, thumbnail.bytes, { contentType: thumbnail.mime, cacheControl: '120' }));
      }
      const result = await db.from('gallery_figures').upsert({
        ...row, image_path: imagePath, thumbnail_path: thumbPath,
      }, { onConflict: 'id', ignoreDuplicates: true }).select('id').maybeSingle();
      if (result.error || !result.data) {
        const winner = value(await db.from('gallery_figures').select('author_id,image_path').eq('id', id).maybeSingle());
        if (winner?.image_path === imagePath) return { id };
        value(await storage.remove(paths));
        if (winner?.author_id === session.member_id) return { id };
        if (winner) throw new RequestError(409, '提交标识已被使用。');
        throw new Error('Gallery metadata write failed');
      }
    } catch (error) {
      // Keep committed objects even if the insert response was interrupted.
      const current = await db.from('gallery_figures').select('image_path').eq('id', id).maybeSingle();
      if (!current.error && current.data?.image_path === imagePath) return { id };
      if (!current.error) await storage.remove(paths);
      throw error;
    }
    // The submission is already committed even if updating the default nickname fails.
    await db.from('gallery_members').update({ display_name: row.author_name }).eq('id', session.member_id);
    return { id };
  }

  async function changeFigure(session: Session, data: Record<string, unknown>) {
    assertAdmin(session);
    const id = inputUuid(data.id);
    const change = inputText(data.change, 12, true);
    if (change === 'delete') {
      const row = value(await db.from('gallery_figures').update({
        status: 'deleting', is_pinned: false, is_featured: false,
      }).eq('id', id).select('image_path,thumbnail_path').maybeSingle());
      if (!row) return { ok: true };
      value(await storage.remove([...new Set([row.image_path, row.thumbnail_path])]));
      value(await db.from('gallery_figures').delete().eq('id', id).eq('status', 'deleting'));
    } else {
      if (typeof data.enabled !== 'boolean') throw new RequestError(400, '无效的管理操作。');
      const fields = {
        featured: { is_featured: data.enabled },
        pinned: { is_pinned: data.enabled },
        hidden: { status: data.enabled ? 'hidden' : 'visible' },
      };
      if (!Object.hasOwn(fields, change)) throw new RequestError(400, '未知的管理操作。');
      const row = value(await db.from('gallery_figures').update(fields[change as keyof typeof fields])
        .eq('id', id).neq('status', 'deleting').select('id').maybeSingle());
      if (!row) throw new RequestError(409, '作品不存在或正在删除。');
    }
    return { ok: true };
  }

  async function action(req: Request) {
    if ((req.headers.get('content-type') ?? '').startsWith('multipart/form-data;')) {
      return upload(await readSession(req), req);
    }
    const body = await boundedBody(req, 20 * 1024);
    const data = await body.json().catch(error => {
      if (error instanceof RequestError) throw error;
      throw new RequestError(400, '请求格式错误。');
    }) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new RequestError(400, '请求格式错误。');
    if (data.action === 'login') return signIn(req, data);
    const session = await readSession(req);

    switch (data.action) {
      case 'session': {
        const member = required(await db.from('gallery_members').select('display_name').eq('id', session.member_id).single());
        return { expiresAt: session.expires_at, admin: session.is_admin, nickname: member.display_name };
      }
      case 'logout':
        value(await db.from('gallery_sessions').delete().eq('token_hash', session.token_hash));
        return { ok: true };
      case 'adminLogin': {
        await limit('admin:' + session.member_id, 900, 6);
        await limit('admin:global', 900, 80);
        if (settings.adminPassword === settings.password ||
            !await matchesPassword(inputPassword(data.password), settings.adminPassword)) {
          throw new RequestError(403, '管理员口令有误或尚未配置。');
        }
        value(await db.from('gallery_sessions').update({ is_admin: true }).eq('token_hash', session.token_hash));
        return { admin: true };
      }
      case 'nickname': {
        const nickname = inputText(data.nickname, 32, true);
        value(await db.from('gallery_members').update({ display_name: nickname }).eq('id', session.member_id));
        return { nickname };
      }
      case 'categories':
        return { categories: await categories() };
      case 'list': {
        const result = await list(session, { ...data, scope: data.scope === 'detail' ? 'gallery' : data.scope });
        const paths = [...new Set(result.rows.filter(row => row.status !== 'deleting').map(row => row.thumbnail_path))];
        const signed = paths.length ? required(await storage.createSignedUrls(paths, 900)) : [];
        const urls = new Map(signed.map(row => [row.path, row.signedUrl]));
        const comments = data.scope === 'profile' && !data.offset
          ? required(await db.from('gallery_comments').select('content,created_at,figure_id,gallery_figures!inner(title,status)')
            .eq('author_name', inputText(data.profile, 32, true)).eq('gallery_figures.status', 'visible')
            .order('created_at', { ascending: false }).limit(20)).map(row => ({
              text: row.content, date: row.created_at, figureId: row.figure_id,
              title: (row.gallery_figures as unknown as { title: string }).title,
            }))
          : undefined;
        return {
          figures: result.rows.map(row => publicFigure(row, urls.get(row.thumbnail_path) ?? '')),
          total: result.total, stats: result.stats, comments,
        };
      }
      case 'detail': {
        const result = await list(session, { scope: 'detail', figure: data.id });
        const row = result.rows[0];
        if (!row || row.status === 'deleting') throw new RequestError(404, '这张图片已撤下或不存在。');
        const offset = data.offset === undefined ? 0 : Number(data.offset);
        if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new RequestError(400, '无效的评论页码。');
        const [signed, comments] = await Promise.all([
          storage.createSignedUrl(row.image_path, 180),
          db.from('gallery_comments').select('id,author_name,content,created_at')
            .eq('figure_id', row.id).order('created_at', { ascending: false }).order('id').range(offset, offset + 30),
        ]);
        const imageUrl = required(signed).signedUrl;
        const allComments = required(comments);
        return {
          figure: publicFigure(row, imageUrl, imageUrl),
          comments: allComments.slice(0, 30).map(comment => ({
            id: comment.id, author: comment.author_name, text: comment.content, date: comment.created_at,
          })),
          hasMore: allComments.length > 30,
        };
      }
      case 'reaction': {
        const id = inputUuid(data.id);
        if (!['like', 'save'].includes(String(data.kind)) || typeof data.enabled !== 'boolean') {
          throw new RequestError(400, '无效的互动操作。');
        }
        await visibleFigure(id);
        const table = data.kind === 'like' ? 'gallery_likes' : 'gallery_collections';
        if (data.enabled) {
          value(await db.from(table).upsert({ figure_id: id, member_id: session.member_id }, {
            onConflict: 'figure_id,member_id', ignoreDuplicates: true,
          }));
        } else {
          value(await db.from(table).delete().eq('figure_id', id).eq('member_id', session.member_id));
        }
        const result = await list(session, { scope: 'detail', figure: id });
        if (!result.rows[0]) throw new RequestError(404, '这张图片已撤下或不存在。');
        const { liked, saved, like_count } = result.rows[0];
        return { liked, saved, likes: like_count };
      }
      case 'comment': {
        await limit('comment:' + session.member_id, 600, 15);
        const id = inputUuid(data.id);
        await visibleFigure(id);
        const author = inputText(data.author, 32, true);
        const comment = required(await db.from('gallery_comments').insert({
          figure_id: id, author_id: session.member_id, author_name: author,
          content: inputText(data.text, 1200, true),
        }).select('id,author_name,content,created_at').single());
        await db.from('gallery_members').update({ display_name: author }).eq('id', session.member_id);
        return { id: comment.id, author: comment.author_name, text: comment.content, date: comment.created_at };
      }
      case 'deleteComment':
        assertAdmin(session);
        value(await db.from('gallery_comments').delete().eq('id', inputUuid(data.id)));
        return { ok: true };
      case 'moderate':
        return changeFigure(session, data);
      case 'category': {
        assertAdmin(session);
        if (data.remove === true) {
          const id = inputUuid(data.id);
          const result = await db.from('gallery_categories').delete().eq('id', id);
          if (result.error?.code === '23503') throw new RequestError(409, '该分类已有作品，暂时无法删除。');
          value(result);
        } else {
          const name = inputText(data.name, 32, true);
          const result = data.id
            ? await db.from('gallery_categories').update({ name }).eq('id', inputUuid(data.id))
            : await db.from('gallery_categories').insert({ name });
          if (result.error?.code === '23505') throw new RequestError(409, '分类名称已存在。');
          value(result);
        }
        return { categories: await categories() };
      }
      default:
        throw new RequestError(400, '未知的图库操作。');
    }
  }

  return async (req: Request) => {
    const origin = req.headers.get('origin');
    const headers: Record<string, string> = {
      'cache-control': 'no-store', vary: 'Origin', 'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
    };
    const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (origin && !settings.origins.includes(origin)) return response({ error: '来源未获授权。' }, 403);
    if (origin) headers['access-control-allow-origin'] = origin;
    if (req.method === 'OPTIONS') {
      headers['access-control-allow-methods'] = 'POST, OPTIONS';
      headers['access-control-allow-headers'] = 'apikey, content-type, x-gallery-session';
      return new Response(null, { status: 204, headers });
    }
    if (req.method !== 'POST') return response({ error: '仅支持 POST 请求。' }, 405);
    try {
      return response(await action(req));
    } catch (error) {
      if (error instanceof RequestError) return response({ error: error.message }, error.status);
      // Avoid logging inputs, session tokens, connection URLs, and Supabase payloads.
      console.error('Gallery request failed');
      return response({ error: '图库服务暂时不可用，请稍后重试。' }, 500);
    }
  };
}
