import { createRoot } from 'react-dom/client';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { GalleryError, liveGallery, priorSession, saveSession, serverConfigured, signIn } from './api';
import { Account, Brand, Header, Status, memberHref, profileHref } from './components';
import Gallery from './Gallery';
import Details from './Detail';
import Upload from './Upload';
import { errorText, readRoute, type Category, type GalleryApi, type Session, type Sort } from './model';
import './styles.css';

const emptyView: { category: string; sort: Sort; query: string; page: number } = { category: '', sort: 'latest', query: '', page: 0 };
const scopeHref = (scope: string, profile?: string) =>
  profile && scope === 'member' ? memberHref(profile) : profile && scope === 'profile' ? profileHref(profile)
    : scope === 'gallery' ? '#' : '#' + scope;

function LockScreen({ notice, unlocked, demo, validating }: {
  notice: string; unlocked: (session: Session) => void; demo?: () => Promise<void>; validating: boolean;
}) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await signIn(password);
      setPassword('');
      unlocked(result);
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <main className="lock-screen">
    <section className="lock-card">
      <Brand />
      <div className="lock-divider" />
      <div className="lock-heading"><LockKeyhole size={20} aria-hidden="true" /><h1>进入课题组图库</h1></div>
      <p>输入课题组共享访问密码。</p>
      {validating ? <Status text="正在验证会话…" /> : <form className="form-stack" onSubmit={submit}>
        <label htmlFor="password">访问密码</label>
        <div className="password-box">
          <input id="password" required autoComplete="current-password" maxLength={256}
            type={visible ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} />
          <button className="icon-button" type="button" aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(!visible)}>
            {visible ? <EyeOff size={19} /> : <Eye size={19} />}</button>
        </div>
        <button className="button primary" disabled={busy || !serverConfigured}>{busy ? '正在验证…' : '进入图库'}</button>
      </form>}
      {notice && <Status text={notice} />}
      {!serverConfigured && !demo && <Status text="图库服务尚待管理员配置。" />}
      {error && <Status text={error} error />}
      {import.meta.env.DEV && demo && <button className="text-button demo-launch" onClick={() => {
        void demo().catch(error => setError(errorText(error)));
      }}>查看本地演示</button>}
    </section>
  </main>;
}

function SignedIn({ session, api, demo, readOnly = false, updateSession, lock }: {
  session: Session; api: GalleryApi; demo: boolean; readOnly?: boolean; updateSession: (values: Partial<Session>) => void; lock: () => void;
}) {
  const [route, setRoute] = useState(readRoute);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState('');
  const [account, setAccount] = useState(false);
  const [revision, setRevision] = useState(0);
  const [categoryVersion, setCategoryVersion] = useState(0);
  const search = useRef<HTMLInputElement>(null);
  const searchPending = useRef(false);
  const view = useRef({ scope: '', values: emptyView });
  const recentlyOpened = useRef({ ids: [] as string[], back: '#' });

  useEffect(() => {
    const changed = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);

  useEffect(() => {
    let current = true;
    setCategoriesError('');
    api.categories().then(result => { if (current) setCategories(result.categories); },
      error => { if (current) setCategoriesError(errorText(error)); });
    return () => { current = false; };
  }, [api, categoryVersion]);

  useEffect(() => {
    if (searchPending.current && search.current) {
      search.current.focus();
      searchPending.current = false;
    }
  }, [route]);

  function openSearch() {
    if (search.current) search.current.focus();
    else {
      searchPending.current = true;
      window.location.hash = '';
    }
  }
  const changed = () => setRevision(value => value + 1);
  const nickname = (name: string) => updateSession({ nickname: name });
  const lookup = route.figure ? recentlyOpened.current.ids.indexOf(route.figure) : -1;
  const neighbors = lookup < 0 ? {} : {
    previous: recentlyOpened.current.ids[lookup - 1], next: recentlyOpened.current.ids[lookup + 1],
  };
  const scope = route.scope + ':' + (route.profile ?? '');
  return <>
    <Header route={route} nickname={session.nickname} memberId={session.memberId} admin={session.admin} readOnly={readOnly}
      openSearch={openSearch} openAccount={() => setAccount(true)} lock={lock} />
    {readOnly ? <div className="demo-banner" role="status">上线预览 · 图片与统计均为示例。<a href="#upload">查看投稿说明</a></div>
      : demo && <div className="demo-banner" role="status">本地演示 · 图片与数据均为示例，操作仅保留在当前预览。</div>}
    <main id="main">
      {categoriesError && <div className="global-error"><Status text={categoriesError} error />
        <button className="button secondary" onClick={() => setCategoryVersion(i => i + 1)}>重新加载分类</button></div>}
      {readOnly && route.upload ? <section className="inner-page">
        <a href="#" className="text-button back-link">返回图库</a>
        <h1>投稿说明</h1>
        <p className="page-subtitle">图片上传暂未开放。你可以先准备首轮推荐的 5 张科研图片。</p>
        <ul className="submission-prep">
          <li>每张图准备 JPG、PNG 或 WebP 文件，大小不超过 6 MB。</li>
          <li>准备图片标题、展示昵称、分类、推荐理由和最值得学习的设计细节。</li>
          <li>尽量附上论文出处、DOI 或链接，并确认图片可用于组内交流。</li>
        </ul>
        <p className="muted">投稿开放后，从本页提交作品。</p>
      </section> : readOnly && (route.scope === 'admin' || route.scope === 'saved') ? <section className="inner-page">
        <a href="#" className="text-button back-link">返回图库</a>
        <Status text="当前开放图库预览。" />
      </section> : route.scope === 'admin' && !session.admin ? <div className="inner-page"><h1>图库管理</h1>
        <Status text="请先验证管理员权限。" /><button className="button primary" onClick={() => setAccount(true)}>验证权限</button></div>
        : route.upload ? <Upload api={api} categories={categories} nickname={session.nickname} memberId={session.memberId}
          afterUpload={name => { nickname(name); changed(); }} />
        : route.figure ? <Details key={route.figure} id={route.figure} api={api} nickname={session.nickname}
          admin={session.admin} readOnly={readOnly} neighbors={neighbors} back={lookup < 0 ? '#' : recentlyOpened.current.back}
          afterChange={changed} setNickname={nickname} />
        : <Gallery key={scope} route={route} categories={categories} api={api} searchRef={search} revision={revision} readOnly={readOnly}
          changed={() => { changed(); setCategoryVersion(i => i + 1); }}
          remembered={view.current.scope === scope ? view.current.values : emptyView}
          previousView={values => { view.current = { scope, values }; }}
          openFigure={ids => { recentlyOpened.current = { ids, back: scopeHref(route.scope, route.profile) }; }} />}
    </main>
    <footer className="site-footer"><strong>Research Figure Gallery</strong><span>科研美图赏析</span><span lang="en">USTC Research Group</span></footer>
    {!readOnly && account && <Account nickname={session.nickname} admin={session.admin} close={() => setAccount(false)}
      onNickname={async name => { const result = await api.nickname(name); nickname(result.nickname); }}
      onAdmin={async password => { await api.adminLogin(password); updateSession({ admin: true }); window.location.hash = 'admin'; }} />}
  </>;
}

function App() {
  const [session, setSession] = useState(priorSession);
  const [validated, setValidated] = useState(!session);
  const [demo, setDemo] = useState<GalleryApi | null>(null);
  const [notice, setNotice] = useState('');
  const activeToken = useRef(session?.token);
  const locked = useCallback((message = '') => {
    activeToken.current = undefined;
    saveSession(null);
    setSession(null);
    setDemo(null);
    setValidated(true);
    setNotice(message);
  }, []);
  const expiry = useCallback(() => locked('访问会话已过期，请重新验证。'), [locked]);
  const token = session?.token;
  const api = useMemo(() => demo ?? (token ? liveGallery(token, () => {
    if (activeToken.current === token) expiry();
  }) : null), [token, demo, expiry]);

  const updateSession = useCallback((values: Partial<Session>) => {
    setSession(previous => {
      if (!previous) return previous;
      const next = { ...previous, ...values };
      if (next.token !== 'local-demo') saveSession(next);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!api || validated) return;
    let current = true;
    api.session().then(data => {
      if (!current) return;
      updateSession(data);
      setValidated(true);
    }, error => {
      if (current && !(error instanceof GalleryError && error.status === 401)) locked(errorText(error));
    });
    return () => { current = false; };
  }, [api, validated, locked, updateSession]);

  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timeout = window.setTimeout(expiry, Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [expiresAt, expiry]);

  const openDemo = import.meta.env.DEV ? async () => {
    const { createDemo } = await import('./demo');
    const next = createDemo();
    setDemo(next.api);
    setSession(next.session);
    setValidated(true);
    setNotice('');
  } : undefined;

  if (!session || !validated || !api) return <LockScreen notice={notice} validating={!validated} demo={openDemo}
    unlocked={next => { activeToken.current = next.token; saveSession(next); setSession(next); setNotice(''); setValidated(true); }} />;
  return <SignedIn session={session} api={api} demo={Boolean(demo)} updateSession={updateSession} lock={() => {
    void api.logout().catch(() => {});
    locked();
  }} />;
}

const root = createRoot(document.getElementById('root')!);

if (import.meta.env.MODE === 'showcase') {
  root.render(<main className="inner-page"><Status text="正在加载图库…" /></main>);
  import('./demo').then(({ createDemo }) => {
    const { api, session } = createDemo();
    const unavailable = async () => { throw new GalleryError(403, '当前开放图库预览，投稿和互动暂未开放。'); };
    const preview: GalleryApi = {
      categories: api.categories, list: api.list, detail: api.detail,
      session: unavailable, logout: unavailable, adminLogin: unavailable, nickname: unavailable,
      upload: unavailable, reaction: unavailable, comment: unavailable, deleteComment: unavailable,
      moderate: unavailable, category: unavailable,
    };
    root.render(<SignedIn session={session} api={preview} demo={false} readOnly
      updateSession={() => {}} lock={() => {}} />);
  }).catch(() => root.render(<main className="inner-page">
    <Status text="图库加载失败，请刷新页面重试。" error />
  </main>));
} else {
  root.render(<App />);
}
