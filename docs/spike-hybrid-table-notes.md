# 原型验证记录 — 混排纸面内嵌 Jspreadsheet

> 目的：验证能否在现有 `contenteditable` 混排页面里，把表格块换成 Excel 式库（Jspreadsheet CE），
> 同时保住"一张纸 + 文本与表格共用 Markdown 行流"的设计。
> 结论：**可行**，但只覆盖了核心交互，仍有若干未验证项。

---

## 一、验证环境

| 项 | 值 |
|---|---|
| 原型页 | `public/spike/hybrid-table.html` |
| 对照页 | `public/spike/plain-grid.html`（纯 div，无 contenteditable） |
| 库 | Jspreadsheet CE 5.0.4（MIT）+ jsuites 6.5.0 + @jspreadsheet/formula 2.0.2，均为 UMD |
| 引入顺序 | `jsuites.js` → `formula.js` → `jspreadsheet.js`（后两个依赖前者的全局变量） |
| 体积 | 约 1.2 MB 未压缩（jspreadsheet 165K + css 20K + jsuites 843K + css 115K + formula 141K） |
| 驱动方式 | 真实 Chrome（CDP），本地 express 服务，非 jsdom |

---

## 二、验证结果

| 验证项 | 结果 |
|---|---|
| 库在无 contenteditable 环境下工作 | ✅ 点击选中 `selectedCell=["0","0","0","0"]`，Tab 跳格正常 |
| 表格块嵌入混排纸面 | ✅ 两段文字之间渲染出 Excel 式表格（列标题、行号、网格） |
| 焦点隔离 | ✅ 点击单元格后焦点落在 `DIV.jss_spreadsheet`，纸面不再持有焦点 |
| 键盘归属 | ✅ 表格内 Enter/Tab 由库处理（选中格移动）；纸面键盘不被表格劫持 |
| 真实文本输入 | ✅ 按 `Z` 进入 `INPUT` 编辑态，Enter 提交后 `getData()` 变为 `[["Z",...]]` |
| 退出编辑态 | ✅ 点纸面或 Esc 均退出，`activeBlock` 归零 |
| Markdown 同步 | ✅ 退出时 `dataset.md` 更新为 `\| Z \| 城市 \|  \|…`，整页序列化 = 文本 + 表格块按 DOM 顺序拼接 |
| 保存往返 | ✅ POST 到现有存储层返回 204，服务端内容 223 字节与序列化结果一致 |
| 控制台报错 | ✅ 无 |

---

## 三、踩坑记录（正式实施必须遵守）

1. **不要在表格块上 `stopPropagation` / `preventDefault` / 手动 `focus()`**。
   第一版原型这么做之后，库的 `getSelected()` 始终为空、Tab 与输入全部失效——
   库的选中态建立依赖事件原样送达它自己的处理器。去掉这三样干扰后行为立刻与对照页一致。

2. **纸面 keydown handler 必须排除表格内的事件**：
   `if (ev.target.closest('.tbl')) return;`，否则 Tab/Delete/方向键会被两套系统争抢。

3. **`minDimensions` 撑出的空行空列会被 `getData()` 吐出**，直接序列化会往 Markdown 里写入多余的空列
   （实测产出 `\| Z \| 城市 \|  \|`）。正式实现必须在序列化前裁掉尾部全空行列。

4. 表格块用 `contenteditable="false"` 隔离是有效的，但它在纸面里是**原子块**，
   光标进出、整块复制粘贴等需要单独处理。

---

## 四、未验证 / 已知风险

| 项 | 说明 |
|---|---|
| 多个表格块 | 原型只放了 1 个；多实例的选中态、性能未测 |
| 复制粘贴 | 表格块 ↔ 外部（含粘贴到 Excel）、纸面内部跨块复制未测 |
| Ctrl+A / 撤销栈 | 两套编辑系统的全选与 undo 归属未测 |
| 移动端 | 触摸事件完全未测 |
| 阅读态成本 | 每个表格块常驻一个完整 Jspreadsheet 实例（DOM 重、初始化开销），长笔记里多个表格的性能未知 |
| 服务端加载链路 | 原型页数据硬编码在 `data-md`；"从服务端拉取 → 渲染表格"未接 |
| 存储格式 | JSON + Markdown 双写尚未实现，目前只有 Markdown 单一来源 |
| 依赖体积 | 新增约 1.2 MB 未压缩前端资源进仓库与部署产物 |

---

## 五、正式实施要做的事（若决定继续）

1. 抽出 `public/js/table-block.js`：块初始化、进入/退出编辑态、Markdown ↔ 矩阵转换（含裁剪空行列）
2. `public/js/app.js` 的 `deserialize/serialize` 改为识别"表格块"，块内数据交给库实例
3. 保存链路：Markdown 为权威（curl 保留可读），另存一份 JSON 元数据
4. 补齐上表"未验证"项，尤其是复制粘贴、撤销、移动端
5. 体积优化：只保留实际需要的 dist 文件；评估是否可裁剪 jsuites

---

## 六、正式实施记录（v2）

原型验证通过后按结论落地：

| 文件 | 改动 |
|---|---|
| `public/js/table-block.js` | **新增**。懒加载表格库、Markdown ↔ 矩阵（`mdToMatrix`/`matrixToMd`/`trimMatrix`）、块生命周期（`createBlock`/`readBlock`/`commit`）、列宽元数据（`collectMeta`/`widthsFrom`） |
| `public/js/app.js` | `renderBlocks(blocks, mode)`：编辑区用表格块、打印视图仍用静态 `<table>`；`serialize()` 识别块；**删除**自研表格编辑代码（`closestCell`/`cellInfo`/`cellInfoAt`/`gridOf`/`focusCell`/`addRow`/`removeRow`/`addColumn`/`removeColumn`/`deleteTable`/`toggleHeaderRow`/`insertBrAtCursor`）；表格内的键盘、右键、粘贴让位给库；保存判据同时比较正文与元数据 |
| `public/css/style.css` | `#content table` → `#content > table`（否则老规则会命中库内部 DOM 破坏样式）；新增 `.tbl` 块样式 |
| `routes/notes.js` | 模板加载模块并注入 `initialMeta`；正文与元数据分开存（`<note>` 与 `<note>.meta`） |
| `tests/` | 新增 `table-block.test.js`（26 项纯函数）；`table-ui.test.js` 中 3 项追旧行为的断言更新为新契约 |

### 实施中额外发现的问题

1. **列宽不进 Markdown ⇒ 上传判据失效**：`uploadContent()` 原本只比较 Markdown 文本，
   而拖列宽不改变文本 ⇒ 永远判定"内容无变化" ⇒ 不保存。已改为同时比较元数据。
2. **删空笔记时元数据残留**：正文清空后 `<note>.meta` 会被留下，已改为一并清掉。
3. **`trimMatrix` 只能裁尾部**：早期实现用 `filter` 会把表格**中间**的空行也删掉（那是用户数据）。

### 回归结果

- `npm test`：46（往返）+ 15（交互）+ 26（块纯函数）= **87 项全绿**
- 真实浏览器：渲染 / 编辑 / 自动保存 / 列宽持久化全部通过，控制台零报错
- 懒加载：纯文本笔记零 `/vendor/` 请求，`window.jspreadsheet` 为 undefined
- 旧笔记兼容：线上 `note1` 那种 3/2/2 列不齐的数据现在渲染为 3/3/3
- 往返守恒：`\|` 转义、单元格内 `<br>`、空单元格、中文全部保住（仅末尾换行按既有行为被裁）
- 窄屏 390×844：块宽 346px、无横向滚动

### 仍未解决 / 待办

| 项 | 说明 |
|---|---|
| 深色模式 | 表格块仍是亮色主题（库只有亮色），深色页面下显得突兀 |
| 纸面复制 | `Ctrl+A` 复制整页时选区不含表格内容（原子块不贡献文本），需拦 `copy` 把表格内容注入剪贴板 |
| 粘回纸面 | 从表格复制的 TSV 粘到纸面会变成制表符纯文本，不还原成表格块，需拦 `paste` 识别 TSV/Markdown |
| 元数据索引 | 列宽按"第 N 个表格块"对齐，中间插入/删除表格会错位（长度不匹配时忽略，不会崩） |
| 移动端 | 窄屏布局与指针点击已验证；真机触摸手势、软键盘未验证 |
| 外部剪贴板 | 从 Excel 粘贴到网页未在本机验证（剪贴板写权限被拒），但库的 TSV 双向通道已证实 |
