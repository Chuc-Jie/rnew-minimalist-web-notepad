# 表格功能方案 — 纯原生 contenteditable 表格

> 基于现有 Minimalist Web Notepad 架构，增加 `/t/:note` 表格模式。

---

## 一、路由设计

### 路由对照

| 路径 | 模式 | 说明 |
|---|---|---|
| `/hello` | 文本 | 现有 textarea |
| `POST /hello` | 文本 | 保存文本 |
| `/t/table1` | 表格 | **新增**，渲染表格页面 |
| `POST /t/table1` | 表格 | **新增**，保存表格数据 |

> 笔记名 `table1` 在文本和表格模式下共用同一个存储键。访问 `/hello` 是文本编辑器，访问 `/t/hello` 是表格编辑器，互不干扰——因为存储键只有 `hello` 这一段，渲染端根据路径前缀决定怎么展示。

### 新增路由（routes/notes.js）

```js
// GET /t/:note → 表格页面
router.get('/t/:note', async (req, res) => {
  const { note } = req.params;
  if (!storage.isValidId(note)) return res.redirect('/');
  const content = await storage.getNote(note);
  const data = parseTableData(content);  // JSON 转二维数组
  res.send(renderTablePage(data, note));
});

// POST /t/:note → 保存表格
router.post('/t/:note', async (req, res) => {
  const { note } = req.params;
  if (!storage.isValidId(note)) return res.status(400).send('Invalid ID');
  await storage.saveNote(note, req.body.data);  // 直接存 JSON 字符串
  res.status(204).send();
});
```

> `POST` 沿用现有存储层，只是 body 字段改成 `data` 而不是 `text`，便于前端区分。

---

## 二、存储格式

一律存 **JSON 字符串**，结构为二维数组：

```json
[
  ["姓名", "年龄", "城市"],
  ["张三", "28", "广州"],
  ["李四", "35", "深圳"]
]
```

第一行作为表头（加粗样式），其余为数据行。

存储键：不加 `/t/` 前缀，只存 `{note}` 部分。这样 `/t/mytable` 和 `/mytable` 指向同一个存储键，但渲染方式不同。

---

## 三、前端（table.js）

### 3.1 页面结构

```
┌──────────────────────────────────────────┐
│  [添加行] [添加列] [删除行] [删除列]     │  ← 工具栏
├──────────────────────────────────────────┤
│  ┌───┬─────┬─────┬─────┐                 │
│  │姓名│年龄 │城市 │     │ ← 表头（灰色） │
│  ├───┼─────┼─────┼─────┤                 │
│  │张三│28   │广州 │     │                 │
│  ├───┼─────┼─────┼─────┤                 │
│  │李四│35   │深圳 │     │                 │
│  ├───┼─────┼─────┼─────┤                 │
│  │   │     │     │     │                 │
│  └───┴─────┴─────┴─────┘                 │
│                                          │
│  还原 Note.ms/table1                     │  ← flag（保持不变）
├──────────────────────────────────────────┤
│  状态指示器（聚焦时浮现）                │  ← 复用现有
└──────────────────────────────────────────┘
```

### 3.2 交互逻辑

| 操作 | 实现 |
|---|---|
| **编辑单元格** | `contenteditable` 原生支持，点进去直接打字 |
| **添加行** | 在表格最后追加一行空行 |
| **添加列** | 每行末尾追加一个空单元格 |
| **删除行** | 删除选中的行（有确认，最少保留 2 行） |
| **删除列** | 删除选中的列（有确认，最少保留 1 列） |
| **Tab 跳格** | 按 Tab 跳到下一个单元格（Shift+Tab 回退） |
| **Enter 换行** | 在单元格内换行，不提交保存（用 Shift+Enter 插入 `<br>`） |

### 3.3 自动保存

参考 app.js 的轮询逻辑：

```
单元格变化 → 标记 dirty
1 秒轮询  → 序列化为 JSON 二维数组 → POST /t/{note}
```

序列化方式：

```js
function serialize() {
  const rows = table.querySelectorAll('tr');
  return Array.from(rows).map(row =>
    Array.from(row.querySelectorAll('td, th')).map(cell => cell.textContent)
  );
}
```

### 3.4 初始化加载

页面加载时从服务器接收 JSON，反序列化渲染表格：

```js
function render(data) {
  const table = document.querySelector('#grid');
  table.innerHTML = '';
  data.forEach((row, i) => {
    const tr = document.createElement('tr');
    row.forEach(cellText => {
      const cell = document.createElement(i === 0 ? 'th' : 'td');
      cell.contentEditable = true;
      cell.textContent = cellText;
      tr.appendChild(cell);
    });
    table.appendChild(tr);
  });
}
```

---

## 四、CSS 新增（table.css 或并入 style.css）

```css
/* 表格卡片（复用 .layer 结构，只有内部内容不同） */
.table-toolbar { ... }
#grid { width: 100%; border-collapse: collapse; }
#grid th { background: var(--color-bg); font-weight: 600; }
#grid td, #grid th {
  border: 1px solid var(--border);
  padding: 8px 12px;
  min-width: 80px;
  outline: none;
}
#grid td:focus, #grid th:focus {
  background: var(--color-surface-solid);
  box-shadow: inset 0 0 0 1px var(--color-accent);
}
```

---

## 五、影响的文件清单

| 文件 | 改动 |
|---|---|
| `routes/notes.js` | +2 条路由（`GET /t/:note`, `POST /t/:note`）+ `renderTablePage()` + `parseTableData()` |
| `public/css/style.css` | +表格相关样式（约 30 行） |
| `public/js/table.js` | **新建**，表格的核心交互逻辑（约 150 行） |
| 无需改动 | `services/storage.js`、`server.js`、`app.js` |

---

## 六、边界情况

| 情况 | 处理 |
|---|---|
| 空数据（首次访问） | 渲染 3×3 默认空表格 |
| 数据不是合法 JSON | 回退到 3×3 空表格，不报错 |
| 从文本模式保存后再从表格模式打开 | JSON 解析失败 → 空表格（不破坏文本数据） |
| 从表格模式保存后再从文本模式打开 | 显示 JSON 原文字符串（可读但不推荐编辑） |
| 全选 + Delete | 清空单元格内容，不删除行列结构 |
| 超大表格（100+ 行） | 表格在 `.layer` 内部可滚动，不影响页面布局 |
