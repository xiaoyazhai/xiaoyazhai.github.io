import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Box, ChevronDown, Heart, ImageOff, LogOut, Menu, MessageSquare, Search, UserRound, X } from 'lucide-react';
import { errorText, formatDate, memberCode, type Figure, type GalleryApi, type Route } from './model';

export const figureHref = (id: string) => '#figure/' + encodeURIComponent(id);
export const profileHref = (name: string) => '#profile/' + encodeURIComponent(name);
export const memberHref = (id: string) => '#member/' + encodeURIComponent(id);

export function MemberTag({ name, id, showCode = false }: { name: string; id?: string; showCode?: boolean }) {
  const label = '@' + name;
  return <a href={id ? memberHref(id) : profileHref(name)} className="member-tag"
    title={id ? label + ' · ' + memberCode(id) : label}
    aria-label={'查看 ' + label + (id ? ' ' + memberCode(id) : '') + ' 的投稿'}>
    <span>{label}</span>{showCode && id && <small>{memberCode(id)}</small>}
  </a>;
}

export function Brand() {
  return <a href="#" className="brand" aria-label="Research Figure Gallery 首页">
    <span className="brand-mark"><Box size={31} strokeWidth={1.45} /></span>
    <span><strong>RESEARCH FIGURE GALLERY</strong><small>科研美图赏析</small></span>
  </a>;
}

export function Header({ route, nickname, memberId, admin, readOnly = false, openSearch, openAccount, lock }: {
  route: Route; nickname: string; memberId?: string; admin: boolean; readOnly?: boolean; openSearch: () => void; openAccount: () => void;
  lock: () => void;
}) {
  const [menu, setMenu] = useState<'pages' | 'account' | null>(null);
  const parent = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (!parent.current?.contains(event.target as Node)) setMenu(null);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenu(null); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  return <header className="site-header">
    <div className="header-inner" ref={parent as React.RefObject<HTMLDivElement>}>
      <Brand />
      <button className="icon-button mobile-menu" aria-label="页面导航" aria-expanded={menu === 'pages'}
        onClick={() => setMenu(menu === 'pages' ? null : 'pages')}><Menu size={22} /></button>
      <nav className={'top-nav' + (menu === 'pages' ? ' top-nav-open' : '')} aria-label="主要导航">
        <a href="#" aria-current={route.scope === 'gallery' && !route.upload ? 'page' : undefined} onClick={() => setMenu(null)}>
          画廊 <span lang="en">Gallery</span></a>
        <a href="#featured" aria-current={route.scope === 'featured' ? 'page' : undefined} onClick={() => setMenu(null)}>
          精选 <span lang="en">Featured</span></a>
        <a href="#upload" aria-current={route.upload ? 'page' : undefined} onClick={() => setMenu(null)}>
          {readOnly ? '投稿说明' : '上传'} <span lang="en">{readOnly ? 'Submissions' : 'Upload'}</span></a>
      </nav>
      <div className="header-actions">
        <button className="icon-button header-search" aria-label="搜索图库" onClick={openSearch}><Search size={24} /></button>
        {!readOnly && <button className="account-trigger" aria-label="成员菜单" aria-expanded={menu === 'account'}
          onClick={() => setMenu(menu === 'account' ? null : 'account')}>
          <Avatar name={nickname} /><ChevronDown size={15} />
        </button>}
        {!readOnly && menu === 'account' && <div className="account-menu">
          <p>{nickname || '课题组成员'}</p>
          {(memberId || nickname) && <a href={memberId ? memberHref(memberId) : profileHref(nickname)}
            onClick={() => setMenu(null)}>我的投稿</a>}
          <a href="#saved" onClick={() => setMenu(null)}>我的收藏</a>
          {admin && <a href="#admin" onClick={() => setMenu(null)}>图库管理</a>}
          <button onClick={() => { setMenu(null); openAccount(); }}>{admin ? '修改展示昵称' : '昵称与管理员授权'}</button>
          <button onClick={() => { setMenu(null); lock(); }}><LogOut size={16} /> 锁定图库</button>
        </div>}
      </div>
    </div>
  </header>;
}

export function Avatar({ name }: { name: string }) {
  const first = [...name.trim()][0];
  const tone = (name.codePointAt(0) ?? 0) % 4;
  return <span className={'avatar avatar-' + tone} aria-hidden="true">{first || <UserRound size={19} />}</span>;
}

type PreviewSource = { id: string; detail: GalleryApi['detail'] };

function CenteredImagePreview({ src, source, close }: { src: string; source?: PreviewSource; close: () => void }) {
  const [preview, setPreview] = useState('');
  const figureId = source?.id;
  const getDetail = source?.detail;

  useEffect(() => {
    const request = new AbortController();
    const timer = window.setTimeout(async () => {
      setPreview(src);
      if (!figureId || !getDetail) return;
      try {
        const { figure } = await getDetail(figureId, 0, request.signal);
        if (request.signal.aborted || !figure.imageUrl || figure.imageUrl === src) return;
        const fullSize = new window.Image();
        fullSize.referrerPolicy = 'no-referrer';
        fullSize.src = figure.imageUrl;
        await fullSize.decode();
        if (!request.signal.aborted) setPreview(figure.imageUrl);
      } catch {
        // Keep the thumbnail visible if the original can't be loaded.
      }
    }, 200);

    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', escape);
    window.addEventListener('blur', close);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      window.clearTimeout(timer);
      request.abort();
      document.removeEventListener('keydown', escape);
      window.removeEventListener('blur', close);
      window.removeEventListener('scroll', close);
    };
  }, [src, figureId, getDetail, close]);

  return preview ? createPortal(<div className="image-hover-preview" aria-hidden="true">
    <img src={preview} alt="" referrerPolicy="no-referrer" />
  </div>, document.body) : null;
}

export function FigureImage({ src, alt, onRefresh, eager = false, hover = false, previewSource }: {
  src: string; alt: string; onRefresh?: () => void; eager?: boolean; hover?: boolean; previewSource?: PreviewSource;
}) {
  const [failed, setFailed] = useState('');
  const [hovered, setHovered] = useState(false);
  const dismiss = useCallback(() => setHovered(false), []);
  if (!src || failed === src) return <div className="image-fallback">
    <ImageOff size={24} aria-hidden="true" /><span>图片暂不可用</span>
    {onRefresh && <button className="text-button" onClick={onRefresh}>重新加载</button>}
  </div>;
  return <>
    <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} referrerPolicy="no-referrer"
      onPointerEnter={hover ? event => { if (event.pointerType === 'mouse') setHovered(true); } : undefined}
      onPointerLeave={hover ? dismiss : undefined} onPointerDown={hover ? dismiss : undefined}
      onPointerCancel={hover ? dismiss : undefined}
      onError={() => { dismiss(); setFailed(src); }} />
    {hovered && hover && <CenteredImagePreview key={src} src={src} source={previewSource} close={dismiss} />}
  </>;
}

export function FigureCard({ figure, react, busy, opened, admin, readOnly = false, getDetail }: {
  figure: Figure; react: (figure: Figure) => void; busy: boolean; opened: () => void; admin?: boolean; readOnly?: boolean;
  getDetail: GalleryApi['detail'];
}) {
  const excerpt = [figure.journal, figure.year, figure.doi].filter(Boolean).join(' · ') || figure.recommendation;
  return <article className="figure-card">
    <a className="figure-cover" href={figureHref(figure.id)} onClick={opened} aria-label={'查看作品：' + figure.title}>
      <FigureImage src={figure.thumbUrl} alt="" hover previewSource={{ id: figure.id, detail: getDetail }} />
      <span className="category-badge">{figure.category}</span>
      {figure.pinned && <span className="pin-badge">置顶</span>}
      <span className="view-hint" aria-hidden="true">查看作品</span>
    </a>
    <div className="card-content">
      <h2><a href={figureHref(figure.id)} onClick={opened}>{figure.title}</a></h2>
      {excerpt && <p className="card-excerpt" title={excerpt}>{excerpt}</p>}
      <div className="card-meta">
        <MemberTag name={figure.author} id={figure.authorId} />
        <time dateTime={figure.date}>{formatDate(figure.date)}</time>
        <div className="card-actions">
          {admin && figure.status !== 'visible' ? <span>{figure.status === 'deleting' ? '正在删除' : '已隐藏'}</span> : <>
            {readOnly ? <span className="counter like" title="示例点赞数"><Heart size={17} aria-hidden="true" />{figure.likes}</span>
              : <button className={'counter like' + (figure.liked ? ' liked' : '')} aria-label={figure.liked ? '取消点赞' : '点赞'}
                aria-pressed={figure.liked} disabled={busy} onClick={() => react(figure)}><Heart size={17} />{figure.likes}</button>}
            <a className="counter" href={figureHref(figure.id)} onClick={opened} aria-label={figure.comments + ' 条评论'}>
              <MessageSquare size={16} />{figure.comments}</a>
          </>}
        </div>
      </div>
    </div>
  </article>;
}

export function Dialog({ title, close, children, wide = false, className = '' }: {
  title: string; close: () => void; children: ReactNode; wide?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const label = useRef(crypto.randomUUID()).current;
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = oldOverflow; };
  }, []);
  return <dialog ref={ref} aria-labelledby={label} className={'modal ' + (wide ? 'modal-wide ' : '') + className}
    onCancel={event => { event.preventDefault(); close(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const { top, bottom, left, right } = event.currentTarget.getBoundingClientRect();
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close();
    }}>
    <div className="modal-header"><h2 id={label}>{title}</h2>
      <button type="button" className="icon-button" aria-label="关闭" onClick={close}><X size={24} /></button></div>
    {children}
  </dialog>;
}

export function Status({ text, error = false }: { text: string; error?: boolean }) {
  return <p className={error ? 'notice notice-error' : 'notice'} role={error ? 'alert' : 'status'}>{text}</p>;
}

export function Account({ nickname, admin, onNickname, onAdmin, close }: {
  nickname: string; admin: boolean; onNickname: (value: string) => Promise<void>;
  onAdmin: (value: string) => Promise<void>; close: () => void;
}) {
  const [name, setName] = useState(nickname);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try { await operation(); close(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  };
  return <Dialog title="成员设置" close={close}>
    <div className="modal-body">
      <form className="form-stack" onSubmit={event => { event.preventDefault(); void submit(() => onNickname(name.trim())); }}>
        <label>展示昵称<input required maxLength={32} value={name} onChange={event => setName(event.target.value)} /></label>
        <small>昵称可以修改，同一成员的投稿仍汇总在同一个成员页。</small>
        <button className="button primary" disabled={busy || !name.trim()}>保存昵称</button>
      </form>
      {!admin && <form className="form-stack admin-auth" onSubmit={event => {
        event.preventDefault(); void submit(() => onAdmin(password));
      }}>
        <label>管理员口令<input required type="password" maxLength={256}
          value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></label>
        <button className="button secondary" disabled={busy || !password}>验证管理员权限</button>
      </form>}
      {error && <Status text={error} error />}
    </div>
  </Dialog>;
}

export function DetailReactions({ figure, busy, react }: {
  figure: Figure; busy: boolean; react: (kind: 'like' | 'save') => void;
}) {
  return <div className="detail-actions">
    <button className={'button secondary like' + (figure.liked ? ' liked' : '')} aria-pressed={figure.liked} disabled={busy}
      onClick={() => react('like')}><Heart size={17} /> {figure.liked ? '已点赞' : '点赞'} {figure.likes}</button>
    <button className="button secondary" aria-pressed={figure.saved} disabled={busy} onClick={() => react('save')}>
      <Bookmark size={18} fill={figure.saved ? 'currentColor' : 'none'} /> {figure.saved ? '已收藏' : '收藏'}</button>
  </div>;
}
