import { useEffect, useState, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Grid2X2, Image, List, Search, SlidersHorizontal } from 'lucide-react';
import { FigureCard, Status, figureHref } from './components';
import { errorText, formatDate, PAGE_SIZE, type Category, type Figure, type GalleryApi, type Listing, type Route, type Sort, type Stats } from './model';
import heroUrl from '../gallery-assets/hero.webp';

const labels = { featured: '精选作品', saved: '我的收藏', profile: '成员作品', admin: '图库管理' };

function Hero({ stats }: { stats?: Stats }) {
  return <section className="hero">
    <img className="hero-art" src={heroUrl} alt="" aria-hidden="true" />
    <div className="hero-content">
      <h1>让好的科学表达，被看见。</h1>
      <p>分享、欣赏与讨论优秀科研图片 <span>·</span> 从视觉表达中学习科学</p>
      {stats && <dl className="hero-stats">
        <div><dd>{stats.figures}</dd><dt>Figures</dt></div>
        <div title="提交作品、留言或点赞的成员标识数量"><dd>{stats.members}</dd><dt>Members</dt></div>
        <div><dd>{stats.categories}</dd><dt>Categories</dt></div>
      </dl>}
    </div>
  </section>;
}

function AdminCategories({ categories, api, refresh }: { categories: Category[]; api: GalleryApi; refresh: () => void }) {
  const [selected, setSelected] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function manage(remove: boolean) {
    setBusy(true);
    setError('');
    try {
      await api.category({ id: selected || undefined, name: name.trim(), remove });
      setSelected('');
      setName('');
      refresh();
    } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }
  return <details className="admin-categories">
    <summary><SlidersHorizontal size={17} /> 管理分类</summary>
    <form onSubmit={event => { event.preventDefault(); void manage(false); }} className="form-stack">
      <label>现有分类<select value={selected} onChange={event => {
        const id = event.target.value;
        setSelected(id);
        setName(categories.find(category => category.id === id)?.name ?? '');
      }}><option value="">新建分类</option>
        {categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
      <label>分类名称<input maxLength={32} required value={name} onChange={event => setName(event.target.value)} /></label>
      <div className="form-actions">
        <button className="button primary" disabled={busy || !name.trim()}>{selected ? '保存分类' : '添加分类'}</button>
        {selected && <button className="button danger" type="button" disabled={busy} onClick={() => {
          if (window.confirm('确认删除此空分类？')) void manage(true);
        }}>删除分类</button>}
      </div>
      {error && <Status text={error} error />}
    </form>
  </details>;
}

export default function Gallery({ route, categories, api, searchRef, revision, changed, openFigure, remembered, previousView }: {
  route: Route; categories: Category[]; api: GalleryApi; searchRef: RefObject<HTMLInputElement | null>;
  revision: number; changed: () => void; openFigure: (ids: string[]) => void;
  remembered: { category: string; sort: Sort; query: string; page: number };
  previousView: (view: { category: string; sort: Sort; query: string; page: number }) => void;
}) {
  const { scope, profile } = route;
  const [category, setCategory] = useState(remembered.category);
  const [sort, setSort] = useState<Sort>(remembered.sort);
  const [query, setQuery] = useState(remembered.query);
  const [debounced, setDebounced] = useState(remembered.query);
  const [page, setPage] = useState(remembered.page);
  const [listMode, setListMode] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats>();
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [reactionError, setReactionError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(query), 210);
    return () => window.clearTimeout(timeout);
  }, [query]);
  useEffect(() => {
    if (category && !categories.some(item => item.id === category)) { setCategory(''); setPage(0); }
  }, [categories, category]);
  const offset = page * PAGE_SIZE;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.list({ scope, sort, query: debounced, category, profile: profile ?? '', offset }, controller.signal)
      .then(data => {
        if (controller.signal.aborted) return;
        if (data.total && offset >= data.total) {
          setPage(Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1));
          return;
        }
        setListing(data);
        if (data.stats) setStats(data.stats);
      }, error => { if (!controller.signal.aborted) { setListing(null); setError(errorText(error)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api, scope, category, sort, debounced, offset, profile, revision, retry]);

  async function react(figure: Figure) {
    if (busy.includes(figure.id)) return;
    setBusy(items => [...items, figure.id]);
    setReactionError('');
    try {
      const result = await api.reaction(figure.id, 'like', !figure.liked);
      setListing(current => current && ({
        ...current, figures: current.figures.map(item => item.id === figure.id ? { ...item, ...result } : item),
      }));
      if (sort === 'popular') setRetry(value => value + 1);
    } catch (error) { setReactionError(errorText(error)); } finally {
      setBusy(items => items.filter(id => id !== figure.id));
    }
  }
  function opened() {
    previousView({ category, sort, query, page });
    openFigure(listing?.figures.map(item => item.id) ?? []);
  }

  return <>
    {scope === 'gallery' ? <Hero stats={stats} /> : <section className="scope-title">
      <h1>{scope === 'profile' ? profile : labels[scope]}</h1>
      {scope === 'profile' && <p>按自报昵称汇总的推荐与讨论。</p>}
    </section>}
    <section className="gallery-shell" aria-label="作品列表">
      {scope === 'admin' && <AdminCategories categories={categories} api={api} refresh={changed} />}
      <div className="toolbar">
        <div className="filters" aria-label="分类筛选">
          {[{ id: '', name: '全部' }, ...categories].map(item => <button type="button" key={item.id}
            className={item.id === category ? 'filter active' : 'filter'} aria-pressed={item.id === category}
            onClick={() => { setCategory(item.id); setPage(0); }}>{item.name}</button>)}
        </div>
        <div className="tools">
          <label className="search"><Search size={20} aria-hidden="true" />
            <input ref={searchRef} type="search" aria-label="搜索图片、关键词、作者" placeholder="搜索图片、关键词、作者…"
              maxLength={120} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
          <label className="sort"><span className="visually-hidden">作品排序</span>
            <select value={sort} onChange={event => { setSort(event.target.value as Sort); setPage(0); }}>
              <option value="latest">{scope === 'featured' ? '管理员精选' : '最新上传'}</option>
              <option value="popular">最受欢迎</option><option value="discussed">讨论最多</option>
            </select>
          </label>
          <button className="icon-button view-mode" aria-label={listMode ? '切换为网格模式' : '切换为列表模式'}
            onClick={() => setListMode(value => !value)}>{listMode ? <List size={20} /> : <Grid2X2 size={20} />}</button>
        </div>
      </div>
      {error && <div className="gallery-error"><Status text={error} error />
        <button className="button secondary" onClick={() => setRetry(i => i + 1)}>重试</button></div>}
      {reactionError && <Status text={reactionError} error />}
      {loading && !listing && !error && <div className="figure-grid" aria-label="正在加载作品" role="status">
        {[0, 1, 2, 3].map(item => <div className="skeleton" key={item} aria-hidden="true" />)}</div>}
      {listing && <div aria-busy={loading}>
        {listing.figures.length ? <div className={'figure-grid' + (listMode ? ' figure-list' : '')}>
          {listing.figures.map(figure => <div key={figure.id}>
            <FigureCard figure={figure} react={react} busy={busy.includes(figure.id)} opened={opened} admin={scope === 'admin'} />
            {scope === 'admin' && figure.status === 'deleting' && <button className="button danger" onClick={async () => {
              try { await api.moderate(figure.id, 'delete'); changed(); }
              catch (error) { setReactionError(errorText(error)); }
            }}>重试删除</button>}
          </div>)}
        </div> : <div className="empty-state">
          <Image size={32} aria-hidden="true" />
          <h2>{query || category ? '没有匹配的作品' : scope === 'saved' ? '还没有收藏' :
            scope === 'featured' ? '暂时没有精选作品' : '还没有作品'}</h2>
          {(query || category) ? <button className="button secondary" onClick={() => {
            setQuery(''); setCategory(''); setPage(0);
          }}>清除筛选</button> : scope === 'gallery' && <a href="#upload" className="button primary">推荐一张图片</a>}
        </div>}
        {listing.total > PAGE_SIZE && <nav className="pagination" aria-label="作品分页">
          <button className="icon-button" aria-label="上一页" disabled={loading || page < 1}
            onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }}><ChevronLeft size={22} /></button>
          <span>{page + 1} / {Math.ceil(listing.total / PAGE_SIZE)}</span>
          <button className="icon-button" aria-label="下一页" disabled={loading || offset + PAGE_SIZE >= listing.total}
            onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }}><ChevronRight size={22} /></button>
        </nav>}
        {listing.comments && listing.comments.length > 0 && <section className="profile-comments">
          <h2>近期讨论</h2>
          {listing.comments.map((comment, i) => <article key={comment.figureId + i}>
            <a href={figureHref(comment.figureId)} onClick={opened}>{comment.title}</a>
            <time dateTime={comment.date}>{formatDate(comment.date)}</time><p className="user-text">{comment.text}</p>
          </article>)}
        </section>}
      </div>}
    </section>
  </>;
}
