import { useEffect, useState } from 'react';
import { Expand, MessageSquare, Trash2 } from 'lucide-react';
import { Avatar, DetailReactions, Dialog, FigureImage, Status, figureHref, profileHref } from './components';
import { errorText, formatDate, type Detail, type Figure, type GalleryApi, type Moderation, type Reaction } from './model';

export default function Details({ id, api, nickname, admin, readOnly = false, neighbors, back, afterChange, setNickname }: {
  id: string; api: GalleryApi; nickname: string; admin: boolean; readOnly?: boolean;
  neighbors: { previous?: string; next?: string }; back: string;
  afterChange: () => void; setNickname: (name: string) => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [author, setAuthor] = useState(nickname);
  const [text, setText] = useState('');
  const [confirm, setConfirm] = useState<{ title: string; run: () => Promise<void> } | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    setLoadError('');
    api.detail(id, 0, abort.signal).then(setData, error => {
      if (!abort.signal.aborted) setLoadError(errorText(error));
    });
    return () => abort.abort();
  }, [id, api, refresh]);

  async function perform(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await operation(); } catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }

  const reload = () => setRefresh(i => i + 1);
  const figure = data?.figure;
  if (!figure || !data) return <div className="inner-page">
    <a className="text-button back-link" href={back}>返回图库</a>
    {loadError ? <><Status text={loadError} error /><button className="button secondary" onClick={reload}>重试</button></>
      : <p role="status">正在加载作品…</p>}
  </div>;

  async function react(current: Figure, kind: 'like' | 'save') {
    const result: Reaction = await api.reaction(id, kind, !current[kind === 'like' ? 'liked' : 'saved']);
    setData(previous => previous && ({ ...previous, figure: { ...previous.figure, ...result } }));
    afterChange();
  }

  async function moderate(change: Moderation, enabled?: boolean) {
    await api.moderate(id, change, enabled);
    afterChange();
    setConfirm(null);
    if (change === 'delete') window.location.hash = 'admin';
    else reload();
  }

  return <article className="inner-page detail-page">
    <div className="detail-nav"><a className="text-button back-link" href={back}>返回图库</a>
      <div>{neighbors.previous && <a href={figureHref(neighbors.previous)}>上一篇</a>}
        {neighbors.next && <a href={figureHref(neighbors.next)}>下一篇</a>}</div></div>
    <div className="detail-layout">
      <figure className="detail-image">
        <FigureImage src={figure.imageUrl} alt={figure.title} onRefresh={reload} eager />
        {figure.imageUrl && <button className="button secondary enlarge" onClick={() => setLightbox(true)}>
          <Expand size={16} /> 放大查看</button>}
      </figure>
      <div className="detail-copy">
        <p className="detail-category">{figure.category}</p>
        <h1>{figure.title}</h1>
        <p className="detail-byline"><a href={profileHref(figure.author)} className="byline">
          <Avatar name={figure.author} />{figure.author}</a><time dateTime={figure.date}>{formatDate(figure.date)}</time></p>
        <section><h2>推荐理由</h2><p className="user-text">{figure.recommendation}</p></section>
        <section><h2>值得学习的地方</h2><p className="user-text">{figure.highlights}</p></section>
        {(figure.paperTitle || figure.journal || figure.doi || figure.year || figure.sourceUrl) && <section>
          <h2>图片出处</h2>
          {figure.paperTitle && <p className="user-text">{figure.paperTitle}</p>}
          {(figure.journal || figure.year) && <p>{[figure.journal, figure.year].filter(Boolean).join(' · ')}</p>}
          {figure.doi && <p><a className="text-button" href={'https://doi.org/' + encodeURI(figure.doi.replace(/^https?:\/\/doi\.org\//i, ''))}
            target="_blank" rel="noreferrer">{figure.doi}</a></p>}
          {figure.sourceUrl && /^https?:\/\//i.test(figure.sourceUrl) &&
            <p><a href={figure.sourceUrl} target="_blank" rel="noreferrer" className="text-button">查看原始来源</a></p>}
        </section>}
        {!readOnly && figure.status === 'visible' && <DetailReactions figure={figure} busy={busy} react={kind => void perform(() => react(figure, kind))} />}
        {admin && <section className="detail-admin">
          <h2>管理作品</h2>
          <div className="detail-actions">
            <button className="button secondary" disabled={busy}
              onClick={() => void perform(() => moderate('featured', !figure.featured))}>{figure.featured ? '取消精选' : '设为精选'}</button>
            <button className="button secondary" disabled={busy}
              onClick={() => void perform(() => moderate('pinned', !figure.pinned))}>{figure.pinned ? '取消置顶' : '置顶'}</button>
            <button className="button secondary" disabled={busy}
              onClick={() => void perform(() => moderate('hidden', figure.status === 'visible'))}>
              {figure.status === 'visible' ? '隐藏作品' : '恢复作品'}</button>
            <button className="button danger" disabled={busy}
              onClick={() => setConfirm({ title: '确认永久删除这件作品及其评论？', run: () => moderate('delete') })}>删除作品</button>
          </div>
        </section>}
      </div>
    </div>
    <section className="comments">
      <h2><MessageSquare size={20} /> 讨论 <span>{figure.comments}</span></h2>
      <details className="discussion-prompts">
        <summary>从哪里开始讨论？</summary>
        <ul>
          <li>这张图最出色的地方是什么？</li><li>它如何帮助读者理解科学问题？</li>
          <li>构图、配色和信息组织有什么值得借鉴的地方？</li><li>如果用于自己的论文，可以如何改进？</li>
        </ul>
      </details>
      {!readOnly && figure.status === 'visible' && <form className="form-stack comment-form" onSubmit={event => {
        event.preventDefault();
        void perform(async () => {
          const comment = await api.comment(id, author.trim(), text.trim());
          setData(previous => previous && ({
            ...previous, figure: { ...previous.figure, comments: previous.figure.comments + 1 },
            comments: [comment, ...previous.comments],
          }));
          setNickname(author.trim());
          setText('');
          afterChange();
        });
      }}>
        <label>展示昵称<input required value={author} maxLength={32} onChange={event => setAuthor(event.target.value)} /></label>
        <label>我的评论<textarea required rows={3} value={text} maxLength={1200}
          placeholder="分享你从这张图学到的表达方法。"
          onChange={event => setText(event.target.value)} /></label>
        <button className="button primary" disabled={busy || !author.trim() || !text.trim()}>发表评论</button>
      </form>}
      {error && <Status text={error} error />}
      {loadError && <Status text={loadError} error />}
      <div className="comment-list">
        {!data.comments.length && <p className="muted">还没有评论。</p>}
        {data.comments.map(comment => <article key={comment.id} className="comment">
          <a href={profileHref(comment.author)} className="byline"><Avatar name={comment.author} />{comment.author}</a>
          <time dateTime={comment.date}>{formatDate(comment.date)}</time>
          {admin && <button className="icon-button" aria-label="删除评论" disabled={busy} onClick={() => setConfirm({
            title: '确认删除这条评论？',
            run: async () => { await api.deleteComment(comment.id); reload(); afterChange(); setConfirm(null); },
          })}><Trash2 size={16} /></button>}
          <p className="user-text">{comment.text}</p>
        </article>)}
      </div>
      {data.hasMore && <button className="button secondary" disabled={busy} onClick={() => void perform(async () => {
        const next = await api.detail(id, data.comments.length);
        setData(previous => previous && ({
          ...next, comments: [...previous.comments, ...next.comments.filter(item => !previous.comments.some(old => old.id === item.id))],
        }));
      })}>加载更多评论</button>}
    </section>
    {lightbox && <Dialog title={figure.title} wide close={() => setLightbox(false)} className="lightbox">
      <FigureImage src={figure.imageUrl} alt={figure.title} onRefresh={reload} eager />
    </Dialog>}
    {confirm && <Dialog title={confirm.title} close={() => setConfirm(null)}>
      <div className="modal-body"><div className="form-actions">
        <button className="button secondary" onClick={() => setConfirm(null)}>取消</button>
        <button className="button danger" disabled={busy} onClick={() => void perform(confirm.run)}>确认删除</button>
      </div>{error && <Status text={error} error />}</div>
    </Dialog>}
  </article>;
}
