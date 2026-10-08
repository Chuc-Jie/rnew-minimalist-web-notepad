# 表格功能修复说明

针对 `Chuc-Jie/rnew-minimalist-web-notepad`，把「插入表格并持久化」这条链路从头到尾修了一遍。
技术路线保持你原本的设计（contenteditable + Markdown 表格存储），**零新增依赖**。

## 一、原来的问题在哪

| 症状 | 根因 |
|---|---|
| 插入表格后刷新，变回一堆 `\|` 竖线文本 | 表格只是被当成普通文本塞进编辑器，`getContent/setContent` 走的是纯文本路径，没有「块」的概念，读回来无法还原成 `<table>` |
| 表格能显示，但一编辑就散架 | 编辑区是单行文本模型，表格内部的光标 / 换行 / Tab 没有独立处理，浏览器的默认行为会把表格结构拆碎 |
| 空单元格、单元格里的 `\|` 丢失 | 序列化时没做转义与占位，往返一次就丢信息 |
| 命令行 `curl` 读到的是 HTML 碎片 | 存储层存的是渲染后的 DOM，不是 Markdown 文本 |

核心结论：**表格不能存 DOM，必须存 Markdown**，并且要在「读 → 解析成块 → 渲染 → 编辑 → 序列化回 Markdown」这条链上做成一个守恒的环。

## 二、改了什么

### `public/js/app.js`（主要改动）
- 引入**行流块模型** `deserialize / parseBlocks / serialize`：
  读取笔记文本 → 按行扫描，连续的表格行合并成一个 table 块，其余为文本块；
  保存时把表格块还原成 Markdown 行，直接拼回行流（块之间不插空行，首尾空行统一裁剪）。
- 保证 **往返守恒**：`serialize(deserialize(x)) === normalize(x)`，编辑多少次都不会累积变形。
- **容错规范化**（不是 bug，是预期行为）：
  - 缺分隔行 `| --- |` → 自动补上；
  - 只有一行 → 补分隔行并当作表头；
  - 各行列数不齐 → 按最宽的列数补齐。
- 单元格内容 `|` 转义为 `\|`，空单元格保留占位，往返不丢字符。
- 表格交互：右键菜单（插入表格 / 上下插行 / 左右插列 / 首行设为表头 / 删除行列表格）、
  表格内 <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> 跳格、空单元格最小高度、当前格高亮。
- 表格外 <kbd>Tab</kbd> 仍然插入制表符，不抢浏览器焦点。
- 右键菜单按上下文过滤：光标不在表格里时只显示「插入表格」。
- 末尾暴露 `window.__notepad`（`getContent`/`setContent`/`serialize`/`deserialize` 等），方便调试与自动化测试。

### `public/css/style.css`
- `#printable` 去掉 `pre-wrap`，补 `table/th/td` 打印样式，打印和「纯文本视图」里表格是真正的表格，不再是竖线文本。
- 新增：空单元格 `min-height`、`td/th:focus` 背景高亮、`#content > table` 外边距、插入表格按钮、对话框复选框样式。

### `routes/notes.js`
- 服务端注入初始内容时做 `<` → `\u003c` 转义：**笔记内容里若含 `</script>`，原实现会截断注入脚本导致页面白屏**，这是顺手修掉的一个安全问题。

### 没动的文件
`services/storage.js`、`server.js`、`package.json` —— 双后端（Upstash Redis / 文件系统）逻辑原样可用，无需改动。

## 三、验证结果

两个测试脚本都在包里，依赖只有 `jsdom`：

```bash
npm i -D jsdom
node tests/table-roundtrip.test.js   # 46 项：往返守恒 / 幂等 / 规范化 / 历史 bug 回归
node tests/table-ui.test.js          # 17 项：插表弹框 / Tab 跳格 / 右键菜单 / 自动保存
```

手动端到端也已跑通：`POST` 一篇含空单元格的表格文本 → `GET ?raw` 原样返回 → 浏览器 UA 打开渲染为真表格。

## 四、怎么合进你的仓库

```
app.js      → public/js/app.js
style.css   → public/css/style.css
notes.js    → routes/notes.js
README.md   → README.md（补了「表格的存储格式」一节）
tests/      → tests/（可选）
```

覆盖后重启服务即可，无需改配置、无需改依赖。
