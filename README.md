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
curl http://localhost:3000/mynote -d 'text=你好，云端的纸！'

# 或按纯文本发送（正文原样保存，不走表单解析）
curl http://localhost:3000/mynote \
  -H 'Content-Type: text/plain' --data-binary '你好，云端的纸！'

# 读取笔记（纯文本，表格显示为 Markdown 格式）
curl http://localhost:3000/mynote

# 浏览器打开
open http://localhost:3000/mynote

# 删除笔记（空内容）
curl http://localhost:3000/mynote -d 'text='
```

> `-d` 的参数会被当作表单解析，所以正文必须写成 `text=内容`；
> 直接 `curl -d '任意文本'`（不带 `text=`）会被解析成对象，存进去的是 JSON 字符串而不是你要的正文。
> 用 `wget` 或 `curl` 读取时自动返回纯文本，浏览器访问则打开编辑页面。

访问 `http://localhost:3000/任意名称` 会进入该笔记页面，名称不存在时自动创建。

### 表格功能

表格以 **Excel 式表格**呈现（基于 Jspreadsheet CE），点进格子直接改：

- **选中与编辑**——点格子改内容；框选、拖拽填充、复制粘贴与表格软件一致
- **增删行列**——在表格内**右键**，用表格自带的菜单
- **公式**——单元格里写 `=SUM(A1:A3)` 这类公式会自动计算
- **Tab / Enter**——跳下一格 / 确认并下移
- **Excel 互操作**——从 Excel 复制一片数据，直接粘进表格

在纸面（表格外）**右键**可以**插入表格**，弹出对话框设置行列数后在光标处插入。

手机/平板没有右键，可点击页面右下角 flag 栏的 **＋表格** 按钮插入表格。

### 表格的存储格式

表格以 **Markdown 表格**写进笔记文本，和纯文本共用同一个行流，因此两种入口完全互通：

- 用 `curl` 写入的 Markdown 表格，浏览器打开时自动渲染成可编辑表格；
- 浏览器里编辑的表格，`curl` 读出来就是标准 Markdown 表格；
- 单元格内的 `|` 自动转义为 `\|`，空单元格也会被保留，往返读写不丢字符。

表格**列宽**这类 Markdown 表达不了的状态，单独存在 `<笔记名>.meta` 键里（JSON），
所以 `curl` 读到的正文永远是干净的 Markdown。

> 表格库是**按需加载**的：笔记里没有表格时，页面不会请求任何表格库资源（见 `public/js/table-block.js`）。

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
│   ├── css/style.css     样式（编辑区、表格块、右键菜单）
│   ├── js/app.js         前端逻辑（自动保存、Markdown 行流、表格块挂载）
│   ├── js/table-block.js 表格块模块（懒加载表格库、Markdown ↔ 矩阵、列宽元数据）
│   ├── vendor/           Jspreadsheet CE / jsuites / formula（仅在笔记含表格时加载）
│   ├── favicon.ico
│   └── favicon.svg
├── tests/
│   ├── table-roundtrip.test.js  表格往返守恒测试（npm test）
│   └── table-ui.test.js         表格交互冒烟测试
├── docs/
│   ├── migration-log.md            PHP → Node.js 改造记录
│   ├── mixed-editor-plan.md        文本 + 表格混合编辑方案
│   ├── table-feature-plan.md       表格功能方案
│   ├── table-feature-fix-notes.md  表格修复说明
│   ├── upstash-redis-guide.md      Upstash Redis 配置指南
│   ├── upstash-data-query-guide.md 线上数据查询指南
│   └── xiaohongshu-post.md         推广文案
└── _tmp/                 本地文件存储目录
```

## 技术栈

- **运行时**: Node.js
- **框架**: Express
- **存储**: 文件系统 / Upstash Redis（自动切换）
- **前端**: 原生 HTML + CSS + JavaScript（表格库按需加载，无构建流程）
- **编辑区**: contenteditable div，文本与表格块混排
- **表格**: [Jspreadsheet CE](https://github.com/jspreadsheet/ce) 5.0.4（MIT，UMD，仅在笔记含表格时加载）
- **CSS 变量**: 支持亮色/暗色主题

## License

Apache 2.0

原作: Pere Orga \<pere@orga.cat\> (2012)
