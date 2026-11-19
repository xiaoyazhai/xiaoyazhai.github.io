import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ImagePlus, Upload as UploadIcon, X } from 'lucide-react';
import { Status, figureHref } from './components';
import { errorText, FILE_LIMIT_MB, memberCode, type Category, type GalleryApi } from './model';

type Fields = { author: string; categoryId: string };
type Item = {
  id: string; file: File; preview: string; fields: Fields;
  status: 'ready' | 'sending' | 'done' | 'failed'; progress: number; error?: string;
};
const mimetypes = ['image/jpeg', 'image/png', 'image/webp'];

async function resizedThumbnail(file: File) {
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    const ratio = 760 / Math.max(bitmap.width, bitmap.height);
    if (ratio >= 1) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', .82));
    return blob && blob.size <= 512 * 1024 ? blob : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export default function Upload({ api, categories, nickname, memberId, afterUpload }: {
  api: GalleryApi; categories: Category[]; nickname: string; memberId?: string; afterUpload: (nickname: string) => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  const pending = useRef(false);
  useEffect(() => () => {
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();
  }, []);
  const current = items[index];
  const editable = current && current.status !== 'done' && !busy;

  function add(selected: FileList | null) {
    if (!selected?.length || pending.current) return;
    const next: Item[] = [];
    const rejected: string[] = [];
    for (const file of selected) {
      if (file.size < 1 || file.size > FILE_LIMIT_MB * 1024 * 1024 ||
          !(mimetypes.includes(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name)))) {
        rejected.push(file.name);
        continue;
      }
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      next.push({
        id: crypto.randomUUID(), file, preview, status: 'ready', progress: 0,
        fields: { author: items[index]?.fields.author || nickname, categoryId: '' },
      });
    }
    setError(rejected.length ? '以下文件格式或大小不符合要求：' + rejected.join('、') : '');
    if (next.length) {
      setCompleted(false);
      setIndex(items.length);
      setItems(previous => [...previous, ...next]);
    }
  }

  function change(field: keyof Fields, value: string) {
    setItems(previous => previous.map((item, position) => position === index
      ? { ...item, error: undefined, fields: { ...item.fields, [field]: value } } : item));
  }

  function remove(indexToRemove: number) {
    const item = items[indexToRemove];
    URL.revokeObjectURL(item.preview);
    previews.current.delete(item.preview);
    setItems(previous => previous.filter((_, position) => indexToRemove !== position));
    setIndex(Math.max(0, index > indexToRemove || index === items.length - 1 ? index - 1 : index));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    const queue = items.filter(item => item.status !== 'done');
    if (!queue.length) return;
    const invalid = items.findIndex(item => {
      if (item.status === 'done') return false;
      return !item.fields.author.trim() || !categories.some(category => category.id === item.fields.categoryId);
    });
    if (invalid !== -1) {
      setIndex(invalid);
      setError('请为每张待提交的图片填写展示昵称并选择分类。');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    let done = 0;
    let failed = 0;
    const update = (id: string, changes: Partial<Item>) =>
      setItems(previous => previous.map(item => item.id === id ? { ...item, ...changes } : item));
    try {
      for (const item of queue) {
        update(item.id, { status: 'sending', progress: 0, error: undefined });
        try {
          const form = new FormData();
          form.set('id', item.id);
          form.set('image', item.file);
          for (const [name, value] of Object.entries(item.fields)) form.set(name, value.trim());
          const thumbnail = await resizedThumbnail(item.file);
          if (thumbnail) form.set('thumbnail', thumbnail, 'thumbnail.webp');
          await api.upload(form, progress => update(item.id, { progress }));
          update(item.id, { status: 'done', progress: 100 });
          done++;
          afterUpload(item.fields.author.trim());
        } catch (error) {
          update(item.id, { status: 'failed', error: errorText(error) });
          failed++;
        }
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
    setCompleted(failed === 0);
    if (failed) setError(done + ' 张已提交，' + failed + ' 张失败。失败项可直接重试。');
  }

  return <section className="inner-page upload-page">
    <a href="#" className="text-button back-link">返回图库</a>
    <h1>分享一张值得欣赏的科研图片</h1>
    <p className="page-subtitle">选择图片，填写展示昵称并选择分类即可投稿。首轮活动欢迎每位成员分享 5 张图片。</p>
    <div className="upload-layout">
      <aside className="upload-sidebar">
        <input ref={files} type="file" multiple accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden
          onChange={event => { add(event.currentTarget.files); event.currentTarget.value = ''; }} />
        <button type="button" className={'dropzone' + (dragging ? ' dragging' : '')} disabled={busy}
          onClick={() => files.current?.click()}
          onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }}>
          <ImagePlus size={28} aria-hidden="true" /><strong>选择或拖入图片</strong>
          <small>JPG、PNG 或 WebP，每张最多 {FILE_LIMIT_MB} MB<br />可一次选择多张</small>
        </button>
        <ul className="upload-queue">
          {items.map((item, position) => <li key={item.id} className={position === index ? 'queue-selected' : ''}>
            <button type="button" className="queue-item" onClick={() => setIndex(position)} aria-pressed={position === index}>
              <img src={item.preview} alt="" /><span><strong>{item.file.name}</strong>
              <small>{item.status === 'done' ? '已提交' : item.status === 'sending' ? '上传中 ' + item.progress + '%' :
                item.status === 'failed' ? '提交失败' : '等待提交'}</small></span>
            </button>
            {!busy && item.status !== 'done' && <button type="button" className="icon-button" onClick={() => remove(position)}
              aria-label={'移除 ' + item.file.name}><X size={17} /></button>}
          </li>)}
        </ul>
        {error && <Status text={error} error />}
        {completed && <Status text="图片已提交。" />}
      </aside>
      {current ? <form className="upload-form form-stack" noValidate onSubmit={submit}>
        <figure className="upload-preview"><img src={current.preview} alt="待提交作品预览" /></figure>
        <fieldset disabled={!editable} className="form-stack fields">
          <div className="field-pair">
            <div className="field-with-help">
              <label>展示昵称<input required maxLength={32} value={current.fields.author}
                aria-describedby={memberId ? 'upload-member-tag' : undefined}
                onChange={event => change('author', event.target.value)} /></label>
              {memberId && <small id="upload-member-tag">投稿标签 @{current.fields.author.trim() || '昵称'} · {memberCode(memberId)}</small>}
            </div>
            <label>分类<select required value={current.fields.categoryId} onChange={event => change('categoryId', event.target.value)}>
              <option value="">请选择</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select></label>
          </div>
        </fieldset>
        {current.error && <Status error text={current.error} />}
        {current.status === 'sending' && <progress aria-label="上传进度" max={100} value={current.progress} />}
        <div className="form-actions">
          {current.status === 'done' && <a className="button secondary" href={figureHref(current.id)}>查看已提交作品</a>}
          {items.some(item => item.status !== 'done') &&
            <button className="button primary" disabled={busy}><UploadIcon size={17} /> {busy ? '正在提交…' :
              items.some(item => item.status === 'failed') ? '重试未完成项' :
              items.length > 1 ? '提交待上传图片' : '提交图片'}</button>}
        </div>
      </form> : <div className="empty-state"><ImagePlus size={30} /><p>选择图片后填写昵称和分类。</p></div>}
    </div>
  </section>;
}
