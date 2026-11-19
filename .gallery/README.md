# Research Figure Gallery · 科研美图赏析

供课题组分享、欣赏和讨论科研图片。计划发布地址为 [xiaoyazhai.github.io/figure-gallery/](https://xiaoyazhai.github.io/figure-gallery/)。

## 本地运行

从仓库根目录执行：

```bash
cd .gallery
npm ci
npm run dev
```

打开 Vite 打印的地址并进入 `/figure-gallery/`。选择「查看本地演示」可检查图库、搜索、详情、上传和互动。演示数据只保留在当前预览，合成科研图来自程序生成的几何和示例数据，均非真实研究结果。正式构建只包含公共装饰横幅，演示入口和示例作品在构建时移除。

接入已部署的 Supabase 时，把 `.env.example` 复制为 `.env.local`，填写项目 HTTPS URL 和公开 publishable key（兼容旧版 anon key）。启动开发服务器后访问密码页。跨域开发需在 Edge Function 设置中添加实际浏览器 origin，例如 `http://localhost:5173` 或 `http://127.0.0.1:5173`。

## 公开占位版

`npm run build:showcase` 生成只读的公开占位版，可发布到同一个 `/figure-gallery/`。它展示合成示例图和投稿准备说明，上传、登录、评论、点赞和收藏不开放。构建不依赖 Supabase，也不读取或展示课题组作品。Supabase 联调后，使用下文的 `npm run build:pages` 产物替换占位版本。

## Supabase 部署

使用独立项目或预发布项目先验证。需要 Supabase 管理权限和已登录的 Supabase CLI。从本目录链接项目并应用迁移：

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

在 Dashboard 的 Edge Functions Secrets 中设置以下条目，再部署函数。Supabase 提供函数运行环境中的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。后者仅由服务器读取。

| Secret | 用途 |
| --- | --- |
| `GALLERY_ACCESS_PASSWORD` | 管理员配置的课题组共享密码 |
| `GALLERY_ADMIN_PASSWORD` | 与访问密码不同的管理员口令 |
| `GALLERY_ALLOWED_ORIGINS` | 逗号分隔的浏览器来源，生产为 `https://xiaoyazhai.github.io` |

```bash
supabase functions deploy gallery
```

`supabase/config.toml` 为该函数关闭平台默认 JWT 校验。浏览器用公开项目 key 访问函数，登录以外的操作由函数校验自有会话。SQL 迁移回收匿名及普通认证角色对图库数据表和 RPC 的权限，并启用 RLS。私有桶 `research-figures` 额外限制这些角色访问和枚举对象。管理员权限由 Edge Function 和数据库会话校验。只把项目 URL 和 publishable/anon key 写入 `VITE_` 变量。

### 会话、昵称和图片

- 验证后，前端将 8 小时会话保存到当前标签页的 `sessionStorage`。服务端保存令牌哈希并校验到期时间。「锁定图库」清理客户端会话，并在后端可达时吊销当前令牌。
- 点赞和收藏使用服务端分配的成员标识。同一浏览器保留的设备令牌可在再次登录时续用原标识。更换浏览器或清理本地存储会产生新标识。自报昵称会被用于署名及昵称页汇总，修改默认昵称只影响之后的内容。图库统计的成员数是至少提交、评论或点赞一次的成员标识数。
- 普通成员授权后，管理员可从成员菜单输入独立口令，获得当前会话内的管理权限。管理员可处理作品、评论和分类。隐藏图片后，新的普通成员请求会立即被拒绝。已经签发的原图链接最多继续有效 3 分钟，缩略图最多 15 分钟。
- 支持 JPG、PNG、WebP，每张最多 6 MiB。服务端检查内容签名和大小，并按随机路径保存。浏览器会尝试为大图生成缩略图，失败时可使用原图。上传超时或失败可用原表单重试。仅提交有权供组内交流的图片，并在可能时提供 DOI 或来源链接。

## GitHub Pages 发布

现有 Pages 发布源为 `master` 根目录。Gallery 的静态产物位于 `figure-gallery/`，独立源码位于 `.gallery/`。Vite 的基础路径已配置为 `/figure-gallery/`。详情等页面使用哈希路由，可在 Pages 上刷新和直接打开。

1. 确认真实 Supabase 测试环境通过下方验收。把公开项目 URL 和公开 key 配成仓库 Actions Variables `FIGURE_GALLERY_SUPABASE_URL` 和 `FIGURE_GALLERY_SUPABASE_PUBLISHABLE_KEY`。两个密码仍在 Supabase Secrets 中。
2. 首次发布可在本机配置好 `.env.local` 后运行 `npm run build:pages`。或者先将代码和工作流合入 `master`，然后手动运行 **Figure Gallery** 工作流，下载同名构建产物。
3. 将 `.gallery/dist/` 或同名 Actions 产物的**内容**放入根目录下的 `figure-gallery/`。发布更新时，只移除该目录内上次 Gallery 构建的过时文件。确认该目录直接包含 `index.html` 和 `assets/`。
4. 提交并审核变更范围，合入 `master`，由现有 GitHub Pages 分支发布。验证根首页及 `/figure-gallery/`，包括作品详情直接打开和刷新。工作流只负责测试和打包，避免改变现有站点的 Pages 发布设置。

## 测试和维护

```bash
npm test
npm run build
npx --yes deno@2.9.6 check --no-config --no-lock --node-modules-dir=none supabase/functions/gallery/index.ts
```

本地测试用模拟 Storage/PostgREST 检查真实请求处理器，并在 PGlite 运行真实 SQL 迁移、数据库约束及 RLS 测试。在实际 Supabase 测试项目联调时，通过环境变量提供 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`、`GALLERY_ACCESS_PASSWORD`、`GALLERY_ADMIN_PASSWORD`，设置 `GALLERY_SMOKE_WRITE=yes` 后运行 `npm run smoke`。此测试使用两次独立登录，上传临时合成图，验证私有图片、数据持久化、管理员权限，结束后清除临时作品和评论。正式发布前还要检查移动端、上传进度和会话过期。

- **备份与恢复。** 定期从 Supabase 导出图库 PostgreSQL 数据，并用支持的 Storage API 或 S3 客户端单独备份私有桶中的原图和缩略图。备份目标保持私有。在测试项目按路径恢复图片与数据库，检查引用完整、私有策略仍有效。Supabase 的数据库备份与图片对象备份应分别执行。清理不再使用的临时数据时，先核对图片元数据中的两种路径。可定期清理过期 `gallery_sessions` 及超过一天的 `gallery_rate_limits`。
- **费用和配额。** 项目管理员应查看 Dashboard 的数据库、存储、流量和函数用量，并根据 [Supabase 计费说明](https://supabase.com/docs/guides/platform/billing-on-supabase) 评估所用套餐。
- **密码与权限排查。** 确认 Secrets 已设置，Edge Function 已部署，CORS origin 包含实际域名。若要在轮换口令后立即让旧会话失效，可在 Supabase SQL Editor 执行 `delete from public.gallery_sessions;`，所有成员需重新验证。
- **图片或上传失败。** 原图链接过期后，在详情页点「重新加载」，或返回图库刷新缩略图。检查私有桶是否存在、文件类型和大小、项目用量以及函数日志。管理员删除状态若停在「正在删除」，可在管理页重试。
- **子路径资源 404。** 检查产物是否直接位于 `figure-gallery/`，并确认 `index.html` 引用 `/figure-gallery/assets/`。

参考 [Supabase 私有 Bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals)、[Edge Function 配置](https://supabase.com/docs/guides/functions/function-configuration) 和 [GitHub Pages 分支发布](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。
