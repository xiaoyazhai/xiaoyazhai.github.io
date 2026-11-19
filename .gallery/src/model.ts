export type Category = { id: string; name: string };
export type Stats = { figures: number; members: number; categories: number };
export type Scope = 'gallery' | 'featured' | 'saved' | 'profile' | 'admin';
export type Sort = 'latest' | 'popular' | 'discussed';
export type Session = { token: string; device?: string; expiresAt: string; nickname: string; admin: boolean };
export type Figure = {
  id: string; title: string; author: string; date: string; categoryId: string; category: string;
  recommendation: string; highlights: string; paperTitle: string; journal: string; year: number | null;
  doi: string; sourceUrl: string; thumbUrl: string; imageUrl: string; likes: number; comments: number;
  liked: boolean; saved: boolean; featured: boolean; pinned: boolean; status: 'visible' | 'hidden' | 'deleting';
};
export type Comment = { id: string; author: string; text: string; date: string };
export type ProfileComment = { figureId: string; title: string; text: string; date: string };
export type Filter = { scope: Scope; sort: Sort; category: string; query: string; profile: string; offset: number };
export type Listing = { figures: Figure[]; total: number; stats: Stats | null; comments?: ProfileComment[] };
export type Detail = { figure: Figure; comments: Comment[]; hasMore: boolean };
export type Reaction = Pick<Figure, 'liked' | 'saved' | 'likes'>;
export type Moderation = 'featured' | 'pinned' | 'hidden' | 'delete';
export type Route = { scope: Scope; profile?: string; figure?: string; upload?: boolean };
export type GalleryApi = {
  session: () => Promise<Omit<Session, 'token'>>;
  logout: () => Promise<unknown>;
  adminLogin: (password: string) => Promise<{ admin: boolean }>;
  nickname: (nickname: string) => Promise<{ nickname: string }>;
  categories: () => Promise<{ categories: Category[] }>;
  list: (filter: Filter, signal?: AbortSignal) => Promise<Listing>;
  detail: (id: string, offset: number, signal?: AbortSignal) => Promise<Detail>;
  upload: (form: FormData, progress: (value: number) => void) => Promise<{ id: string }>;
  reaction: (id: string, kind: 'like' | 'save', enabled: boolean) => Promise<Reaction>;
  comment: (id: string, author: string, text: string) => Promise<Comment>;
  deleteComment: (id: string) => Promise<unknown>;
  moderate: (id: string, change: Moderation, enabled?: boolean) => Promise<unknown>;
  category: (action: { id?: string; name?: string; remove?: boolean }) => Promise<{ categories: Category[] }>;
};

export const SITE_NAME = 'Research Figure Gallery';
export const FILE_LIMIT_MB = 6;
export const PAGE_SIZE = 24;
export const categoriesDemo = [
  '几何表达', '结构设计', '力学仿真', '科学机理', '实验展示', '数据可视化', '多尺度结构', '综合插图',
].map((name, i) => ({ id: String(i + 1), name }));
export const formatDate = (date: string) => date.slice(0, 10);
export const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。';

function decode(value: string) {
  try { return decodeURIComponent(value); } catch { return ''; }
}

export function readRoute(): Route {
  const [page, ...parts] = window.location.hash.slice(1).split('/');
  const value = decode(parts.join('/'));
  switch (page) {
    case 'featured':
    case 'saved':
    case 'admin': return { scope: page };
    case 'profile': return value ? { scope: 'profile', profile: value } : { scope: 'gallery' };
    case 'figure': return value ? { scope: 'gallery', figure: value } : { scope: 'gallery' };
    case 'upload': return { scope: 'gallery', upload: true };
    default: return { scope: 'gallery' };
  }
}

export function localValue(storage: 'localStorage' | 'sessionStorage', key: string, value?: string | null) {
  try {
    if (value === null) window[storage].removeItem(key);
    else if (value !== undefined) window[storage].setItem(key, value);
    else return window[storage].getItem(key);
  } catch {
    // The gallery still works in browsers with storage disabled, until they reload.
  }
  return null;
}
