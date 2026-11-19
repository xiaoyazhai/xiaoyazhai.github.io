import { categoriesDemo, type Comment, type Figure, type GalleryApi, type Session } from './model';

const artwork = import.meta.glob<string>('../gallery-assets/figure-*.webp', {
  eager: true, query: '?url', import: 'default',
});

const records = [
  { title: '具有负泊松比的三周期极小曲面晶格结构', author: '张三', category: 2, date: '2024-11-12', likes: 156, comments: 12, summary: '基于 TPMS 的功能梯度多孔结构设计与力学性能分析。', highlights: '用大幅结构渲染展示连续曲面，再以细节图补充几何层次。' },
  { title: '航空构件的应力分布与优化设计', author: '李四', category: 3, date: '2024-10-28', likes: 132, comments: 8, summary: '基于有限元的复合材料翼型结构应力分析。', highlights: '将色标紧贴主图，读者可以快速对照热点和应力量级。' },
  { title: 'Gyroid 结构的多尺度建模与力学性能', author: '王五', category: 1, date: '2024-10-28', likes: 98, comments: 5, summary: '基于隐式建模的 TPMS 多孔结构设计方法。', highlights: '用蓝橙配色区分互穿的两相，并统一细节图的观察方向。' },
  { title: '从几何设计到力学性能的全流程分析', author: '赵六', category: 8, date: '2024-10-15', likes: 87, comments: 3, summary: '基于参数化建模与多尺度仿真的研究框架。', highlights: '沿阅读顺序呈现几何、网格、仿真、结果四个步骤。' },
  { title: '多孔钛合金的微观结构与元素分布', author: '陈七', category: 5, date: '2024-10-08', likes: 76, comments: 6, summary: '扫描电镜（SEM）与能谱（EDS）展示示意。', highlights: '并排组织灰度结构图和元素通道，方便定位同一区域。' },
  { title: '不同工况下的应力–应变曲线对比', author: '刘八', category: 6, date: '2024-09-30', likes: 69, comments: 9, summary: '实验与模拟结果的对比分析。', highlights: '用线型与颜色双重编码，同时照顾灰度打印和屏幕阅读。' },
  { title: '基于拓扑优化的轻量化结构设计', author: '孙九', category: 2, date: '2024-09-25', likes: 63, comments: 4, summary: '面向高性能与轻量化的结构优化方法。', highlights: '保持视觉重心清晰，让读者先辨识构件轮廓和开孔位置。' },
  { title: '曲面建模与网格划分方法', author: '周十', category: 1, date: '2024-09-18', likes: 58, comments: 7, summary: '基于参数化曲面的高质量网格生成。', highlights: '将曲面视图与网格视图并排，方便读者比较几何与离散表达。' },
];

export function createDemo() {
  let session: Session = {
    token: 'local-demo', expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    nickname: '演示成员', memberId: 'demo-member-visitor', admin: false,
  };
  const figures: Figure[] = records.map((item, index) => {
    const category = categoriesDemo[item.category - 1];
    const url = artwork['../gallery-assets/figure-' + (index + 1) + '.webp'];
    return {
      id: 'demo-' + (index + 1), title: item.title, author: item.author, authorId: 'demo-member-' + (index + 1), date: item.date, likes: item.likes,
      comments: item.comments, categoryId: category.id, category: category.name, thumbUrl: url, imageUrl: url,
      recommendation: item.summary, highlights: item.highlights, paperTitle: '', journal: '', year: null,
      doi: '', sourceUrl: '', liked: false, saved: false, featured: index < 3, pinned: false, status: 'visible',
    };
  });
  let categories = [...categoriesDemo];
  const threads = new Map<string, Comment[]>(figures.map(figure => [figure.id, [
    { id: figure.id + '-comment', author: '演示成员', authorId: session.memberId, text: '让图例靠近对应子图，阅读时能更快找到对照关系。', date: figure.date },
  ]]));
  const figureWithId = (id: string) => {
    const figure = figures.find(item => item.id === id);
    if (!figure) throw new Error('这张图片已撤下或不存在。');
    return figure;
  };
  const api: GalleryApi = {
    session: async () => session,
    logout: async () => void 0,
    adminLogin: async () => { session = { ...session, admin: true }; return { admin: true }; },
    nickname: async nickname => { session = { ...session, nickname }; return { nickname }; },
    categories: async () => ({ categories }),
    list: async filter => {
      const needle = filter.query.trim().toLowerCase();
      const subset = figures.filter(item => (
        (filter.scope === 'admin' || item.status === 'visible') &&
        (filter.scope !== 'saved' || item.saved) &&
        (filter.scope !== 'profile' || item.author === filter.profile) &&
        (filter.scope !== 'member' || item.authorId === filter.profile) &&
        (filter.scope !== 'featured' || filter.sort !== 'latest' || item.featured) &&
        (!filter.category || item.categoryId === filter.category) &&
        (!needle || [item.title, item.author, item.category, item.recommendation, item.paperTitle, item.doi].join(' ').toLowerCase().includes(needle))
      )).sort((a, b) => {
        if (filter.sort === 'popular') return b.likes - a.likes;
        if (filter.sort === 'discussed') return b.comments - a.comments;
        return Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date);
      });
      const comments = (filter.scope === 'profile' || filter.scope === 'member') ? [...threads.entries()].flatMap(([id, list]) => {
        const figure = figures.find(item => item.id === id && item.status === 'visible');
        return figure ? list.filter(comment => (filter.scope === 'member' ? comment.authorId : comment.author) === filter.profile).map(comment => ({
          text: comment.text, date: comment.date, figureId: id, title: figure.title,
        })) : [];
      }) : undefined;
      return {
        profileName: filter.scope === 'member' ? (filter.profile === session.memberId
          ? session.nickname : figures.find(item => item.authorId === filter.profile)?.author) : undefined,
        figures: subset.slice(filter.offset, filter.offset + 24).map(item => ({ ...item })),
        total: subset.length, stats: { figures: figures.filter(item => item.status === 'visible').length,
          members: new Set(figures.filter(item => item.status === 'visible').map(item => item.authorId)).size,
          categories: categories.length }, comments,
      };
    },
    detail: async (id, offset) => ({ figure: { ...figureWithId(id) },
      comments: (threads.get(id) ?? []).slice(offset, offset + 30), hasMore: (threads.get(id)?.length ?? 0) > offset + 30 }),
    upload: async (form, progress) => {
      const id = String(form.get('id'));
      if (figures.some(item => item.id === id)) return { id };
      const file = form.get('image');
      if (!(file instanceof File)) throw new Error('请选择图片。');
      const url = URL.createObjectURL(file);
      const category = categories.find(item => item.id === form.get('categoryId'));
      if (!category) throw new Error('请选择仍然可用的分类。');
      progress(100);
      figures.push({
        id, title: String(form.get('title')), author: String(form.get('author')), authorId: session.memberId, date: new Date().toISOString(),
        category: category.name, categoryId: category.id, recommendation: String(form.get('recommendation')),
        highlights: String(form.get('highlights')), paperTitle: String(form.get('paperTitle') ?? ''),
        year: Number(form.get('year')) || null, journal: String(form.get('journal') ?? ''),
        doi: String(form.get('doi') ?? ''), sourceUrl: String(form.get('sourceUrl') ?? ''),
        thumbUrl: url, imageUrl: url, likes: 0, comments: 0, liked: false, saved: false,
        featured: false, pinned: false, status: 'visible',
      });
      session = { ...session, nickname: String(form.get('author')) };
      return { id };
    },
    reaction: async (id, kind, enabled) => {
      const figure = figureWithId(id);
      if (kind === 'like' && figure.liked !== enabled) {
        figure.liked = enabled;
        figure.likes += enabled ? 1 : -1;
      }
      if (kind === 'save') figure.saved = enabled;
      return { liked: figure.liked, saved: figure.saved, likes: figure.likes };
    },
    comment: async (id, author, text) => {
      const figure = figureWithId(id);
      session = { ...session, nickname: author };
      const comment = { id: crypto.randomUUID(), author, authorId: session.memberId, text, date: new Date().toISOString() };
      threads.set(id, [comment, ...(threads.get(id) ?? [])]);
      figure.comments++;
      return comment;
    },
    deleteComment: async id => {
      for (const [figureId, comments] of threads.entries()) {
        if (comments.some(comment => comment.id === id)) figureWithId(figureId).comments--;
        threads.set(figureId, comments.filter(comment => comment.id !== id));
      }
    },
    moderate: async (id, change, enabled) => {
      const figure = figureWithId(id);
      if (change === 'delete') figures.splice(figures.indexOf(figure), 1);
      if (change === 'featured') figure.featured = Boolean(enabled);
      if (change === 'pinned') figure.pinned = Boolean(enabled);
      if (change === 'hidden') figure.status = enabled ? 'hidden' : 'visible';
    },
    category: async ({ id, name, remove }) => {
      if (remove && figures.some(item => item.categoryId === id)) throw new Error('该分类已有作品，暂时无法删除。');
      if (name && categories.some(item => item.name === name && item.id !== id)) throw new Error('分类名称已存在。');
      if (remove) categories = categories.filter(item => item.id !== id);
      else if (id && name) categories = categories.map(item => item.id === id ? { id, name } : item);
      else if (name) categories = [...categories, { id: crypto.randomUUID(), name }];
      if (id && name) for (const figure of figures) if (figure.categoryId === id) figure.category = name;
      return { categories };
    },
  };
  return { api, session };
}
