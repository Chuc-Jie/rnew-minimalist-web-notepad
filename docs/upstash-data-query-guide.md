# 数据查询指南 — Upstash Redis

> 记录如何查看 `note.youyer.top` 线上存储的所有笔记 key 及内容。

---

## 一、我们的数据存在哪里

| 项 | 值 |
|---|---|
| 数据库 | `upstash-kv-fuchsia-book`（Upstash for Redis - Free） |
| 别名 | `lenient-chipmunk` |
| Endpoint | `lenient-chipmunk-70008.upstash.io` |
| 区域 | AWS N. Virginia (us-east-1) |
| 计划 | Free Tier（10,000 命令/秒、256MB 存储、50GB 月带宽） |
| 管理入口 | 只能通过 Vercel 集成管理（数据库由 Vercel 创建） |

---

## 二、如何进入 Upstash 控制台

### 重要：不要直接登录 console.upstash.com

直接登录 `console.upstash.com`（个人账户 YouyEr）会看到 **"No database has been created yet"**——因为数据库不在这个账户下，而是通过 Vercel 集成自动创建并绑定到另一个 SSO 身份。

### 正确路径

```
1. 打开 Vercel → 你的项目 rnew-minimalist-web-notepad
2. 左侧导航 → 集成服务 (Integrations)
3. 找到 "Upstash" 集成（Billed Via Vercel）
4. 点 "管理" → 进入 Upstash 集成详情页
5. 点 "Open in Upstash" 按钮
   → 用 Vercel SSO 自动跳转到正确的 Upstash 账户
   → URL 形如: https://console.upstash.com/vercel/kv
```

### 直接 URL（登录状态有效时）

```
https://console.upstash.com/vercel/kv
```

---

## 三、查看所有笔记 key

```
1. 进入 https://console.upstash.com/vercel/kv
2. 点击数据库 "upstash-kv-fuchsia-book"
3. 点击 "Data Browser" 标签页
4. 列表中显示所有 key（即所有笔记 ID）
```

每个 key 就是一个笔记 ID，对应的 URL 是：

```
https://note.youyer.top/{key}
```

---

## 四、查看单个 key 的内容

Data Browser 中点击某个 key 行即可查看其 value（笔记内容）。

也可以直接用 curl 读取（无需登录）：

```bash
curl https://note.youyer.top/{key}
# 或强制纯文本
curl https://note.youyer.top/{key}?raw
```

---

## 五、技术细节（代码层面）

### 存储层文件

`services/storage.js`

### 后端自动检测逻辑

```javascript
const useKv = process.env.VERCEL === '1' &&
              !!(process.env.KV_URL || process.env.KV_REST_API_URL);
```

- Vercel 环境 → 使用 Upstash Redis（`@upstash/redis` SDK，`Redis.fromEnv()`）
- 本地环境 → 使用文件系统（`_tmp/`）

### 环境变量（Vercel 自动注入）

| 变量 | 用途 |
|---|---|
| `KV_REST_API_URL` | REST API 地址 |
| `KV_REST_API_TOKEN` | 写令牌 |
| `KV_REST_API_READ_ONLY_TOKEN` | 只读令牌 |
| `KV_URL` | Redis 连接串 |

### 健康检查

```bash
curl https://note.youyer.top/health
```

返回 JSON 包含存储后端状态，例如：

```json
{
  "status": "ok",
  "storage": {
    "useKv": true,
    "backend": "Upstash Redis",
    "initError": "none"
  }
}
```

---

## 六、踩过的坑记录

| 问题 | 原因 | 解决 |
|---|---|---|
| 数据不持久（写入丢失） | `let kvClient` 声明在 `initKv()` 之后，TDZ 错误导致 KV 初始化失败，静默回退文件系统 | 把 `let kvClient = null` 移到 `initKv()` 之前 |
| Upstash 控制台看不到数据库 | 数据库绑定在 Vercel SSO 身份下，不在个人 Upstash 账户 | 通过 Vercel 集成页的 "Open in Upstash" SSO 进入 |
| Vercel 日志只能看最近 30 分钟 | Hobby 计划限制 | 用 Upstash Data Browser 查完整 key 列表 |

---

## 七、已记录笔记快照（2026-09-05）

查询时 Redis 中存在的 key：

```
001, 003, 004, 005, 006, 009, 011, 012, 013,
1234567, 123456789, Vscode, beicai, fixtest,
graphql, zs, zxes, zxes1
```

共 18 个。
