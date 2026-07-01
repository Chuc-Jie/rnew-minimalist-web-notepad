# Upstash Redis 集成指南

本文档记录如何在 Vercel 上创建 Upstash Redis 数据库并连接到项目。

> **背景**：Vercel KV 已于 2024 年 12 月停用，所有 KV 功能已迁移至 Upstash Redis。新项目请直接使用 Upstash。

---

## 一、创建数据库

### 1. 进入项目存储页面

在 Vercel 项目面板中，左侧导航点击 **Storage**（存储）。

### 2. 创建数据库

点击 **Create Database**（创建 Database）按钮，弹出 Browse Storage 对话框。

### 3. 选择 Upstash for Redis

在 Marketplace 列表中找到 **Upstash**，展开后选择 **Upstash for Redis**，点击 **Continue**（继续）。

### 4. 同意条款

阅读并同意 Upstash 的服务条款，点击 **Accept and Create**（接受并创建）。

### 5. 选择配置

- **Primary Region**（主区域）：选择离你最近的区域（国内用户建议 Singapore 或 Mumbai）
- **Eviction**：保持默认
- **Plan**（套餐）：选择 **Free**（免费）

免费计划包含：
- 500,000 条命令/月
- 1 个数据库/账户
- 适合个人项目

### 6. 确认创建

确认配置信息无误后，点击 **Create**（创建）。等待数据库预配置完成（约几秒），点击 **Continue** 完成。

---

## 二、连接到项目

创建完成后，数据库需要连接到你的 Vercel 项目：

### 1. 进入 Upstash 集成页面

在 Vercel 项目左侧导航点击 **Integrations**（集成服务），找到 **Upstash**。

### 2. 连接到项目

在数据库列表中找到刚创建的数据库（如 `upstash-kv-fuchsia-book`），点击 **Connect to Project**（连接到项目）。

### 3. 选择项目

在弹出的对话框中：
- **Project**（项目）：搜索并选择你的项目（如 `rnew-minimalist-web-notepad`）
- **Environment**（环境）：勾选 **Production**（生产环境）和 **Preview**（预览环境）
- **Sensitive**：保持勾选

点击 **Connect Project**（连接项目）。

### 4. 验证连接

连接成功后，会显示成功提示。数据库的**状态**会变为 **Connected**（已连接）。

---

## 三、环境变量

连接成功后，Vercel 自动注入以下环境变量到项目：

| 变量名 | 说明 |
|---|---|
| `KV_URL` | Redis 连接 URL |
| `KV_REST_API_URL` | REST API 地址 |
| `KV_REST_API_TOKEN` | REST API 令牌 |
| `KV_REST_API_READ_ONLY_TOKEN` | 只读令牌 |
| `REDIS_URL` | Redis 兼容连接字符串 |

这些变量在部署时会自动注入，无需手动配置。

---

## 四、重新部署

连接数据库并推送代码后，需要在 Vercel 上重新部署：

1. 进入 **Deployments**（部署记录）
2. 找到最新部署，点击右侧 **三个点菜单 → Redeploy**（重新部署）
3. 等待部署完成

---

## 五、验证

部署完成后，打开你的网站：

1. 写一条笔记并保存
2. 刷新页面——笔记应该仍然存在
3. 如果丢失，检查 Vercel 项目 Settings → Environment Variables 中是否有 `KV_URL`

---

## 附：代码中的自动检测

项目中 `services/storage.js` 会自动切换存储后端：

```js
// 检测逻辑
const useKv = process.env.VERCEL === '1' && !!process.env.KV_URL;
```

| 环境 | 后端 |
|---|---|
| 本地开发（无 VERCEL 环境变量） | 文件系统 `_tmp/` |
| Vercel + KV 已配置 | Upstash Redis |
