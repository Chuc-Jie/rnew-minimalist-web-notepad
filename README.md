# Minimalist Web Notepad

一个极简的在线记事本——"云端的一张纸"。

基于 [notepad.cc](https://notepad.cc) 的精神重写，参考 [note.ms](https://note.ms) 的交互风格。

## 特性

- **极简**——打开即写，没有注册、登录、按钮
- **文本 + 表格混排**——同一页面可编辑文字，也支持插入表格
- **右键菜单**——右键插入表格、增删行列，所有操作都在页面上完成
- **实时保存**——输入即存，关闭页面不丢内容
- **命令行友好**——curl/wget 自动返回纯文本，表格以 Markdown 格式呈现
- **深色模式**——跟随系统设置自动切换
- **打印友好**——打印时显示为纯文本
- **移动端适配**——手机/平板/桌面

## 快速开始

```bash
# 安装依赖
npm install

# 启动服务
npm start

# 开发模式（文件变化自动重启）
npm run dev
```

打开 http://localhost:3000 即可使用。

## 使用方式

```bash
# 保存笔记
curl http://localhost:3000/mynote -d '你好，云端的纸！'

# 读取笔记（纯文本，表格显示为 Markdown 格式）
curl http://localhost:3000/mynote

# 浏览器打开
open http://localhost:3000/mynote

# 删除笔记（空内容）
curl http://localhost:3000/mynote -d 'text='
```

访问 `http://localhost:3000/任意名称` 会进入该笔记页面，名称不存在时自动创建。

### 表格功能

在编辑区**右键**打开菜单：

- **插入表格**——弹出对话框设置行列数，在光标位置插入
- **上方/下方插入行**——当前行位置增删行
- **左侧/右侧插入列**——当前列位置增删列
- **删除当前行/列/表格**

表格内按 **Tab** 跳到下一格，**Shift+Tab** 回退上一格。

## 存储后端

支持两种存储后端，自动切换：

| 环境 | 后端 | 说明 |
|---|---|---|
| 本地 / 自托管 | 文件系统 `_tmp/` | 零配置，即开即用 |
| Vercel + KV 已配置 | Upstash Redis | 部署到 Vercel 时自动启用 |

检测逻辑：`process.env.VERCEL === '1'` 且存在 `KV_URL` 时自动走 Upstash Redis，否则走文件系统。

> Vercel KV 已于 2024 年 12 月停用，由 Upstash Redis 替代。配置指南见 [`docs/upstash-redis-guide.md`](docs/upstash-redis-guide.md)。

### 部署到 Vercel

1. 将项目推送至 GitHub
2. 在 [vercel.com](https://vercel.com) 导入仓库
3. 按 [`docs/upstash-redis-guide.md`](docs/upstash-redis-guide.md) 创建并连接 Upstash Redis 数据库
4. 重新部署即可

## 项目结构

```
├── server.js             Express 服务入口
├── routes/
│   └── notes.js          笔记路由（CRUD + HTML 渲染）
├── services/
│   └── storage.js        存储层（文件系统 / Upstash Redis 自动切换）
├── public/
│   ├── css/style.css     样式（编辑区、表格、右键菜单）
│   ├── js/app.js         前端逻辑（自动保存、表格编辑、右键菜单）
│   ├── favicon.ico
│   └── favicon.svg
├── docs/
│   ├── migration-log.md            PHP → Node.js 改造记录
│   └── upstash-redis-guide.md      Upstash Redis 配置指南
└── _tmp/                 本地文件存储目录
```

## 技术栈

- **运行时**: Node.js
- **框架**: Express
- **存储**: 文件系统 / Upstash Redis（自动切换）
- **前端**: 原生 HTML + CSS + JavaScript（零依赖）
- **编辑区**: contenteditable div，支持文本与表格混排
- **CSS 变量**: 支持亮色/暗色主题

## License

Apache 2.0

原作: Pere Orga \<pere@orga.cat\> (2012)
