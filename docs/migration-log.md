# 从 PHP 到 Node.js —— 完整改造记录

> 原始项目：[pereorga/minimalist-web-notepad](https://github.com/pereorga/minimalist-web-notepad)
> 改造目标：Node.js 重写，保持极简精神，参考 note.ms 风格，支持 Vercel 部署。

---

## 一、架构重构：PHP → Node.js/Express

### 1.1 原始架构（PHP）

单文件 `index.php` 承担全部职责，约 150 行：

```
index.php
├── PHP 路由逻辑（GET/POST 分支）
├── 内联 CSS（90 行）
├── 内联 JS（40 行）
└── 文件系统存储 (_tmp/)
```

### 1.2 新架构（Node.js）

拆分为模块化结构，4 层分离：

```
server.js              ← Express 入口，启动、中间件、静态文件
routes/notes.js        ← 路由层（GET/POST/rendering）
services/storage.js    ← 存储层（文件系统 / Upstash Redis 双后端）
public/
├── css/style.css      ← 样式（独立文件，CSS 变量驱动）
├── js/app.js          ← 前端逻辑（独立文件）
├── favicon.ico
└── favicon.svg
```

### 1.3 路由映射对照表

| 原始 PHP 行为 | Node.js 实现 | 变化说明 |
|---|---|---|
| `GET /` → 随机 5 位字符，302 跳转 | `GET /` → `generateId()` → `res.redirect(302, '/:id')` | 逻辑一致 |
| `GET /?note=xxx` 渲染 HTML | `GET /:note` 渲染 HTML | URL 更干净（/xxx vs /?note=xxx） |
| `POST /?note=xxx` 保存 | `POST /:note` → `saveNote()` | 逻辑一致 |
| `GET /?note=xxx&raw` 纯文本 | `GET /:note?raw` 纯文本 | 参数名相同 |
| curl/wget UA 检测 | `req.get('User-Agent').startsWith('curl')` | 自动识别 cli 工具 |
| 无 | `GET /health` 健康检查 | 新增，便于 Vercel 监控 |
| Apache `.htaccess` URL 重写 | Express 路由原生支持 `/xxx` 写法 | 不再依赖 Apache |

### 1.4 PHP 语法 → Node.js 语法对照

| PHP | Node.js | 说明 |
|---|---|---|
| `$_GET['note']` | `req.params.note` | 路由参数 |
| `$_SERVER['REQUEST_METHOD']` | `req.method` | 请求方法 |
| `$_SERVER['HTTP_USER_AGENT']` | `req.get('User-Agent')` | UA 检测 |
| `$_POST['text']` | `req.body.text` | 表单数据 |
| `file_get_contents("php://input")` | `express.text()` + `req.body` | 原始请求体 |
| `file_get_contents($path)` | `fs.readFileSync(path, 'utf-8')` | 读文件 |
| `file_put_contents($path, $text)` | `fs.writeFileSync(path, content, 'utf-8')` | 写文件 |
| `is_file($path)` | `fs.statSync(path).isFile()` | 判断文件存在 |
| `unlink($path)` | `fs.unlinkSync(path)` | 删除文件 |
| `str_shuffle($chars)` | `Math.random()` 循环 5 次拼字符 | 生成随机 ID |
| `preg_match('/^[a-zA-Z0-9_-]+$/', ...)` | `/^[a-zA-Z0-9_-]+$/.test(id)` | 校验笔记名 |
| `strlen()` | `id.length` | 字符串长度 |
| `header('Cache-Control: no-store')` | Express 默认无缓存，无需显式设置 | 缓存控制 |
| `header('Location: /xxx')` → `die` | `res.redirect(302, '/xxx')` | 跳转 |
| `htmlspecialchars($text)` | `escapeHtml(text)` | HTML 转义 |
| `die` | `return` | 终止请求处理 |
| Apache `mod_rewrite` | Express 原生路由 `/:note` | URL 美化 |

---

## 二、前端改造

### 2.1 CSS（style.css）— 从原始到最终版

#### 原始 CSS（约 90 行，内联在 index.php 中）

```css
body {
    margin: 0;
    background: #ebeef1;
}
.container {
    position: absolute;
    top: 20px; right: 20px; bottom: 20px; left: 20px;
}
#content {
    margin: 0; padding: 20px;
    border: 1px solid #ddd;
    ...
}
@media (prefers-color-scheme: dark) { ... }
@media print { ... }
```

- 灰色背景 `#ebeef1`
- textarea 有灰色边框 `#ddd`
- 无字体指定（用浏览器默认）
- 无深色模式字体配色

#### 最终 CSS（164 行，独立文件）

**设计参考：note.ms**（通过抓取其真实 HTML 结构和交互效果确定）

| 维度 | 原始 | 最终 |
|---|---|---|
| 背景色 | `#ebeef1` | `#ebeef2`（对齐 note.ms 真实背景色） |
| 布局 | position absolute + 20px 边距 | `position: fixed; inset: 24px` + `.stack > .layer > .layer > .layer` 三层嵌套 |
| 视觉效果 | 简单边框 textarea | 三层嵌套纸张叠放效果 + 轻微阴影 + 6px 圆角 |
| 字体 | 浏览器默认 | 等宽字体栈：`SF Mono → Cascadia Code → Consolas → Menlo` |
| 编辑区内边距 | `20px` 四面 | `18px` 四面统一，移动端 `16px` |
| 状态提示 | 无（静默保存） | 右下角状态指示器（圆点+文字），聚焦时浮现 |
| 滚动条 | 默认显示 | 隐藏滚动条（保留滚动功能） |
| 导航标识 | 无 | `.flag` 显示 `Note.ms/{noteId}`，logo 可点击 |
| 打印样式 | 隐藏容器，显示 pre | 增强：等宽字体 + 明确字号行距 |
| 图标引用 | 相对路径 `favicon.ico` | 绝对路径 `/favicon.ico`，兼容路由 |
| meta 标签 | 无 theme-color | `theme-color: #ebeef2`（对齐背景） |
| 标题 | 动态显示笔记名 | 固定 `note.youyer.top` |

**CSS 变量系统**（新增）：

```css
:root {
    --font:   ...;    /* 等宽字体栈 */
    --bg:     ...;    /* 背景色 */
    --surface:...;    /* 卡片色 */
    --text:   ...;    /* 文字色 */
    --text-dim:...;   /* 次要文字 */
    --border: ...;    /* 边框色 */
    --radius: 6px;    /* 圆角 */
}
```

亮色/暗色主题通过 `@media (prefers-color-scheme: dark)` 覆盖这些变量实现，无需重复写选择器。

#### CSS 调优过程（反复迭代记录）

1. 第一版做了过度的 HIG 融合设计（毛玻璃、多层阴影、动画），被纠正
2. 第二版回归极简（纯白背景、全屏 textarea、无边框），但发现 textarea 没有留白边距
3. 第三版改回 `#ebeef2` 背景 + 纸张叠放效果（对齐 note.ms）
4. 第四版调整内边距为统一值，添加圆角
5. 最终版隐藏滚动条，精简 CSS 变量

### 2.2 JS（app.js）— 从原始到增强

#### 原始 JS（约 40 行，内联在 index.php 中）

```javascript
function uploadContent() {
    if (content !== textarea.value) {
        var temp = textarea.value;
        var request = new XMLHttpRequest();
        request.open('POST', window.location.href, true);
        request.send('text=' + encodeURIComponent(temp));
        content = temp;
    }
    setTimeout(uploadContent, 1000);
}
```

- 1 秒轮询检查变化
- `var` 声明，无 `async/await`
- 保存失败会无限重试（`onerror` 中直接 `setTimeout` 再调）
- 无状态反馈

#### 最终 JS（143 行，独立文件，IIFE 封装）

| 变更 | 说明 |
|---|---|
| `var` → `const/let` | 现代语法 |
| `XMLHttpRequest` → `fetch` + `async/await` | 更简洁的异步处理 |
| 重复请求保护 | `isSaving` 标志位，避免并发写覆盖 |
| 重试机制 | 最多重试 3 次，达到上限后提示 "Save failed — retrying…" |
| `sendBeacon` 兜底 | `pagehide` 事件中调用，保证关闭标签页时最后的内容不丢失 |
| `visibilitychange` | 切到后台时立即保存，不等轮询 |
| 状态指示器 | 圆点色变：灰(空闲) / 黄(保存中) / 绿(已保存) / 红(出错) |
| 打印内容同步 | `updatePrintable()` 独立函数，内容变化时同步更新 |
| 光标定位 | 初始化时 `setSelectionRange` 将光标移到末尾 |
| 错误日志 | `console.warn('Notepad save error:', err)` |

---

## 三、存储层：双后端自动切换

### 3.1 原始存储

```php
$save_path = '_tmp';
$path = $save_path . '/' . $_GET['note'];
file_put_contents($path, $text);    // 保存
$content = file_get_contents($path); // 读取
unlink($path);                       // 删除
```

- 仅支持文件系统
- 同步读写
- 无法在 Vercel Serverless 上持久化（每个请求是新容器）

### 3.2 新存储层

```javascript
// services/storage.js
const useKv = process.env.VERCEL === '1' && !!process.env.KV_URL;

// 两种后端，统一 async 接口：
// getNote(id)    → string | null
// saveNote(id, content) → void（空内容删除）
// noteExists(id) → boolean
// generateId()   → string
// isValidId(id)  → boolean
```

| 后端 | 触发条件 | 实现方式 |
|---|---|---|
| 文件系统 | 本地开发（无 VERCEL 环境变量） | `fs.readFileSync` / `fs.writeFileSync` / `fs.unlinkSync` |
| Upstash Redis | Vercel 上且 `KV_URL` 存在 | `@upstash/redis` SDK (`kv.get` / `kv.set` / `kv.del`) |

### 3.3 存储技术演变

| 版本 | SDK | 说明 |
|---|---|---|
| 第一版 | `@vercel/kv` | Vercel KV（2024年12月已停用） |
| 最终版 | `@upstash/redis` | Upstash Redis 免费计划（50万命令/月） |

切换原因：Vercel 官方文档明确 `Vercel KV is no longer available`，所有 KV 用户已迁移至 Upstash Redis。

---

## 四、部署相关

### 4.1 Vercel 部署

- 代码推送至 GitHub → Vercel 自动部署
- 需在 Vercel 上创建 Upstash Redis 数据库并连接到项目
- 详细步骤见 [`docs/upstash-redis-guide.md`](docs/upstash-redis-guide.md)

### 4.2 本地开发

```bash
npm install
npm start      # 文件系统存储，零配置
npm run dev    # --watch 模式
```

---

## 五、项目清理

### 5.1 删除的文件

| 文件 | 原因 |
|---|---|
| `index.php` | 被 Node.js 版本完全替代 |
| `.htaccess` | Apache 专属，Express 不需要 |
| `_tmp/.htaccess` | Apache 安全配置，存储层自动处理 |
| 根目录 `favicon.ico`/`favicon.svg` | 移到 `public/`，Express 静态目录 |
| 临时调试文件 (`test123`, `demo123`, `*.png`) | 测试残留 |

### 5.2 新增的文件

| 文件 | 说明 |
|---|---|
| `server.js` | Express 服务入口 |
| `routes/notes.js` | 路由处理 |
| `services/storage.js` | 双后端存储层 |
| `public/css/style.css` | 独立样式文件 |
| `public/js/app.js` | 独立前端逻辑 |
| `docs/upstash-redis-guide.md` | Upstash Redis 配置指南 |
| `docs/xiaohongshu-post.md` | 小红书推荐帖 |
| `package.json` / `package-lock.json` | Node.js 项目配置 |

---

## 六、Git 提交历史

```
869e23b chore: remove obsolete PHP files, Apache config, and root favicons
a772b0d docs: add Upstash Redis guide, rewrite README
039c77e chore: remove debug screenshots
385eb16 fix: switch from Vercel KV to Upstash Redis + connect to project
dba554e fix: fixed page title to note.youyer.top
f7f887e chore: hide textarea scrollbar, clean up
96f563e refactor: PHP → Node.js + Vercel KV dual-backend + note.ms style
d630977 [原项目最后一个提交] Merge pull request #67 from mouism/master
```

---

## 七、保持不变的特性

为确保兼容性，以下原始特性保持不变：

- ✅ 5 位随机无歧义字符生成笔记 ID（`234579abcdefghjkmnpqrstwxyz`）
- ✅ 笔记名校验：仅允许 `[a-zA-Z0-9_-]`，最长 64 字符
- ✅ 空内容 POST 即删除笔记
- ✅ curl/wget 自动识别返回纯文本
- ✅ `?raw` 参数强制纯文本输出
- ✅ 1 秒轮询自动保存
- ✅ 暗色模式（`prefers-color-scheme: dark`）
- ✅ 打印友好（隐藏编辑区，显示 pre）
- ✅ XSS 防护（HTML 转义）
- ✅ 笔记目录不被直接访问
