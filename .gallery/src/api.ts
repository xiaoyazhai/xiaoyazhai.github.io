import { localValue, type GalleryApi, type Session } from './model';

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, '');
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
const endpoint = url ? url + '/functions/v1/gallery' : '';
const SESSION_KEY = 'research-gallery:session:v1';
const DEVICE_KEY = 'research-gallery:device:v1';
export const serverConfigured = Boolean(key && url);

export class GalleryError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function responseBody<T>(status: number, body: unknown): T {
  if (status >= 200 && status < 300) return body as T;
  const text = body && typeof body === 'object' && 'error' in body ? body.error : undefined;
  throw new GalleryError(status, typeof text === 'string' ? text : '图库服务暂时无法连接，请稍后再试。');
}

async function request<T>(action: string, data: object, token = '', signal?: AbortSignal) {
  if (!serverConfigured) throw new GalleryError(503, '图库服务尚待管理员配置。');
  const headers: Record<string, string> = { 'content-type': 'application/json', apikey: key };
  if (token) headers['x-gallery-session'] = token;
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(endpoint, {
    method: 'POST', headers, body: JSON.stringify({ action, ...data }),
    cache: 'no-store', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  const body = await response.json().catch(() => null);
  return responseBody<T>(response.status, body);
}

export async function signIn(password: string) {
  const device = localValue('localStorage', DEVICE_KEY);
  const session = await request<Session>('login', { password, device });
  if (session.device) localValue('localStorage', DEVICE_KEY, session.device);
  return session;
}

export function priorSession(): Session | null {
  const stored = localValue('sessionStorage', SESSION_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Session;
    if (/^[0-9a-f]{64}$/.test(session.token) && Date.parse(session.expiresAt) > Date.now()) return session;
  } catch {
    // Treat old or invalid saved session data as locked.
  }
  saveSession(null);
  return null;
}

export function saveSession(session: Session | null) {
  localValue('sessionStorage', SESSION_KEY, session ? JSON.stringify({
    token: session.token, expiresAt: session.expiresAt, nickname: session.nickname, admin: session.admin,
  }) : null);
}

export function liveGallery(token: string, handleExpiry: () => void): GalleryApi {
  async function authorized<T>(action: string, data: object = {}, signal?: AbortSignal) {
    try { return await request<T>(action, data, token, signal); }
    catch (error) {
      if (error instanceof GalleryError && error.status === 401) handleExpiry();
      throw error;
    }
  }

  return {
    session: () => authorized('session'),
    logout: () => authorized('logout'),
    adminLogin: password => authorized('adminLogin', { password }),
    nickname: nickname => authorized('nickname', { nickname }),
    categories: () => authorized('categories'),
    list: (filter, signal) => authorized('list', filter, signal),
    detail: (id, offset, signal) => authorized('detail', { id, offset }, signal),
    reaction: (id, kind, enabled) => authorized('reaction', { id, kind, enabled }),
    comment: (id, author, text) => authorized('comment', { id, author, text }),
    deleteComment: id => authorized('deleteComment', { id }),
    moderate: (id, change, enabled) => authorized('moderate', { id, change, enabled }),
    category: data => authorized('category', data),
    upload: (form, progress) => new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint);
      xhr.responseType = 'json';
      xhr.timeout = 90_000;
      xhr.setRequestHeader('apikey', key);
      xhr.setRequestHeader('x-gallery-session', token);
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) progress(Math.min(99, Math.round(event.loaded / event.total * 100)));
      };
      xhr.onload = () => {
        if (xhr.status === 401) handleExpiry();
        try {
          const result = responseBody<{ id: string }>(xhr.status, xhr.response);
          progress(100);
          resolve(result);
        } catch (error) { reject(error); }
      };
      xhr.onerror = () => reject(new Error('网络连接失败，表单已保留，可重试。'));
      xhr.ontimeout = () => reject(new Error('上传超时，表单已保留，可重试。'));
      xhr.send(form);
    }),
  };
}
