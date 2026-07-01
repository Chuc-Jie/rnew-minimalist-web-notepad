# Minimalist Web Notepad

一个极简的在线记事本——"云端的一张纸"。

基于 [notepad.cc](https://notepad.cc) 的精神重写，参考 [note.ms](https://note.ms) 的交互风格。

## 特性

- **极简**——打开即写，没有注册、登录、按钮
- **实时保存**——输入即存，关闭页面不丢内容
- **命令行友好**——curl/wget 自动返回纯文本
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

# 读取笔记
curl http://localhost:3000/mynote

# 浏览器打开
open http://localhost:3000/mynote

# 删除笔记（空内容）
curl http://localhost:3000/mynote -d 'text='
```

访问 `http://localhost:3000/任意名称` 会进入该笔记页面，名称不存在时自动创建。

## 存储后端

支持两种存储后端，自动切换：

| 环境 | 后端 | 说明 |
|---|---|---|
| 本地 / 自托管 | 文件系统 (`_tmp/`) | 零配置，即开即用 |
| Vercel + KV | Vercel KV (Redis) | 部署到 Vercel 时自动启用 |

检测逻辑：当 `VERCEL=1` 且 `KV_URL` 存在时自动走 KV，否则走文件系统。

### 部署到 Vercel

1. 将项目推送至 GitHub
2. 在 [vercel.com](https://vercel.com) 导入仓库
3. 添加 KV 数据库（Storage → Create → KV）
4. 部署即可，无需额外配置

## 技术栈

- **运行时**: Node.js
- **框架**: Express
- **存储**: 文件系统 / Vercel KV（自动切换）
- **前端**: 原生 HTML + CSS + JavaScript（零依赖）
- **CSS 变量**: 支持亮色/暗色主题

## 项目结构

```
├── server.js             Express 服务入口
├── routes/
│   └── notes.js          笔记路由（CRUD + HTML 渲染）
├── services/
│   └── storage.js        存储层（双后端自动切换）
├── public/
│   ├── css/style.css     样式
│   ├── js/app.js         前端自动保存逻辑
│   ├── favicon.ico
│   └── favicon.svg
└── _tmp/                 本地文件存储目录
```

## License

Apache 2.0 — 参见 [LICENSE](/LICENSE)

原作者: Pere Orga \<pere@orga.cat\> (2012)
