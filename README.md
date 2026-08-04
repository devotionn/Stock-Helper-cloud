# Stock Helper Cloud

股票分析助手云端版，采用 Vue 3、TypeScript、Vite、Pinia、TanStack Query、Supabase 和 Vercel Functions 构建。

## 架构

- `apps/web`：Vue 3 单页应用
- `api`：Vercel Functions，负责鉴权和 AI 调用
- `packages/shared`：前后端共享常量、Schema 和 Prompt
- `supabase/migrations`：PostgreSQL 表结构、RLS 与 Storage 策略
- `vercel.json`：Vercel 构建、Functions、SPA 路由和安全响应头配置

## 运行要求

- Node.js 20 或更高版本
- pnpm 9
- Supabase 项目
- OpenAI 兼容的 Chat Completions 接口

## 本地启动

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

本地前端默认运行在 `http://127.0.0.1:5173`。

## 环境变量

### 浏览器端

| 变量 | 说明 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key 或 publishable key |

### Vercel Functions

| 变量 | 说明 |
| --- | --- |
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key 或 secret key，禁止暴露给浏览器 |
| `AI_PROVIDER` | AI 服务商标识，仅用于记录，默认 `openai` |
| `AI_API_KEY` | AI 接口密钥 |
| `AI_BASE_URL` | OpenAI 兼容 API 根地址，默认 `https://api.openai.com/v1` |
| `AI_MODEL` | 模型名称，默认 `gpt-4o` |
| `AI_REQUEST_TIMEOUT_MS` | AI 请求超时，默认 105000，最大 115000 |
| `AI_JSON_RESPONSE_FORMAT` | 是否发送 `response_format: json_object`，默认 `true` |

完整示例见 `.env.example`。

## 初始化 Supabase

### 1. 创建项目

在 Supabase Dashboard 创建项目并保存数据库密码。

### 2. 推送迁移

```bash
supabase login
supabase link --project-ref <SUPABASE_PROJECT_ID>
supabase db push --dry-run
supabase db push
```

迁移会创建业务表、RLS 策略、用户 Profile 触发器和私有 Storage Bucket：

```text
stock-helper-assets
```

不要在生产库中运行 `supabase/seed.sql`。

### 3. 创建登录用户

当前产品只提供登录页面，不开放自主注册。请在：

```text
Supabase Dashboard → Authentication → Users
```

手动创建首个用户。

### 4. Auth URL 配置

部署到 Vercel 后，在 Supabase Authentication URL Configuration 中设置：

- Site URL：Vercel 正式域名
- Redirect URLs：正式域名和需要使用的 Preview 域名

## 部署到 Vercel

1. 在 Vercel 导入该 GitHub 仓库。
2. Root Directory 保持仓库根目录，不要选择 `apps/web`。
3. Node.js 选择 20.x。
4. 添加 `.env.example` 中列出的环境变量。
5. 点击 Deploy。

仓库已经在 `vercel.json` 中固定：

- 安装命令：`pnpm install --frozen-lockfile`
- 构建命令：`pnpm build`
- 输出目录：`apps/web/dist`
- API Functions：`api/**/*.ts`
- SPA 回退：所有不存在的文件路径回退到 `/index.html`

部署完成后访问：

```text
https://<your-domain>/api/health
```

示例响应：

```json
{
  "status": "ok",
  "ready": true,
  "configuration": {
    "supabase": "configured",
    "ai": "configured"
  }
}
```

`ready` 为 `false` 时，说明 Vercel 环境变量尚未配齐。

## GitHub Actions 数据库部署

如需在合并到 `main` 后自动推送 Supabase 迁移，在 GitHub 仓库 Secrets 中添加：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`

工作流会先执行 `supabase db push --dry-run`，成功后再正式执行迁移。

## 代码验证

```bash
pnpm verify
```

该命令会依次执行：

- shared、web 和 API TypeScript 类型检查
- shared 和 web 生产构建

GitHub Pull Request 也会自动运行同样的检查。

## 常见问题

### Vercel 显示找不到输出目录

确认 Vercel Root Directory 是仓库根目录，并且没有在控制台覆盖 `apps/web/dist`。

### 刷新 `/history` 或 `/settings` 出现 404

确认部署使用了仓库根目录的 `vercel.json`。

### 登录后刷新又回到登录页

当前版本会在路由判断前等待 Supabase 会话恢复。若仍出现该问题，检查浏览器是否禁用了站点存储，以及 Supabase URL 和 key 是否属于同一个项目。

### AI 接口提示不支持 `response_format`

在 Vercel 中设置：

```text
AI_JSON_RESPONSE_FORMAT=false
```

然后重新部署。

### `/api/health` 显示 missing

检查 Vercel Project Settings → Environment Variables，修改环境变量后必须重新部署才能生效。
