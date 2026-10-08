/* ═══════════════════════════════════════════════════════════════
   Minimalist Web Notepad — 混合编辑器（纯文本 + 表格）
   ---------------------------------------------------------------
   存储格式：纯文本。表格以 Markdown 管道语法内联在文本行流里。
   唯一不变量：serialize(deserialize(x)) === normalize(x)
               且 normalize(normalize(x)) === normalize(x)
   → 只要这个往返成立，刷新页面、重新访问就一定能还原。
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const editor = document.getElementById('content');
  const printable = document.getElementById('printable');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const ctxMenu = document.getElementById('ctx-menu');

  /* ── 常量 ──────────────────────────────────────────────── */

  const BLOCK_TAGS = new Set([
    'DIV', 'P', 'LI', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER',
    'FIGURE', 'FIGCAPTION', 'HR', 'TR', 'THEAD', 'TBODY',
  ]);

  const INLINE_BR = '<br>';   // 单元格内换行的文本标记

  /* ── 状态 ──────────────────────────────────────────────── */

  let savedContent = '';
  let isSaving = false;
  let saveTimer = null;
  let retryCount = 0;
  let userEdited = false;       // 加载保护：未经用户编辑绝不覆写远端内容
  const MAX_RETRIES = 3;

  function markDirty() { userEdited = true; }

  /* ══════════════════════════════════════════════════════════
     一、Markdown 表格行 —— 解析
     ══════════════════════════════════════════════════════════ */

  /** 该行是否属于表格（保守判定：必须以未转义的 | 开头） */
  function isTableRow(line) {
    return line.trim().charAt(0) === '|';
  }

  /** "| a | b |" → ['a','b']；支持 \| 转义，保留空单元格 */
  function splitRow(line) {
    let s = line.trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (/(^|[^\\])\|$/.test(s)) s = s.slice(0, -1);   // 去掉行尾那个未转义的 |

    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s.charAt(i);
      if (ch === '\\' && s.charAt(i + 1) === '|') { cur += '|'; i++; continue; }
      if (ch === '|') { cells.push(cur); cur = ''; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells.map(function (c) { return c.trim(); });
  }

  /** 是否分隔行（| --- | --- |）。全是空单元格的行不算，避免误判 */
  function isSeparatorRow(cells) {
    return cells.length > 0 && cells.every(function (c) {
      return /^:?-{1,}:?$/.test(c);
    });
  }

  /* ══════════════════════════════════════════════════════════
     二、DOM → 文本（序列化）
     ══════════════════════════════════════════════════════════ */

  /** 取节点内的纯文本，BR → '\n'，块级 → '\n'（用于切分），未知标签递归不丢内容 */
  function inlineText(node) {
    let s = '';
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) {
        s += c.nodeValue;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const tag = c.tagName;
        if (tag === 'TABLE') {
          s += '\n' + tableToMarkdown(readTable(c)) + '\n';   // 兜底：嵌套表格也不丢结构
        } else if (tag === 'BR') {
          s += '\n';
        } else if (tag === 'HR') {
          s += '\n---\n';
        } else if (BLOCK_TAGS.has(tag)) {
          s += '\n' + inlineText(c) + '\n';
        } else {
          s += inlineText(c);          // span / b / i / font … 任何脏标签都只取文字
        }
      }
    }
    return s;
  }

  /** 一个块级元素 → 若干文本行（去掉末尾那个占位用的空行） */
  function blockLines(node) {
    const parts = inlineText(node).split('\n');
    while (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
    return parts;
  }

  /** 单元格 → 文本。内部换行记成 <br> 标记；纯占位 <br> 视为空 */
  function cellToText(cell) {
    let s = '';
    for (const c of cell.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) {
        s += c.nodeValue;
      } else if (c.nodeType === Node.ELEMENT_NODE) {
        const tag = c.tagName;
        if (tag === 'BR') {
          s += INLINE_BR;
        } else if (BLOCK_TAGS.has(tag)) {
          if (s) s += INLINE_BR;
          s += cellToText(c);
        } else {
          s += cellToText(c);
        }
      }
    }
    s = s.replace(/^(?:<br>)+/, '').replace(/(?:<br>)+$/, '');
    return s.replace(/ /g, ' ').trim();
  }

  /** <table> → 二维数组，列数补齐到最宽的一行 */
  function readTable(table) {
    const rows = [];
    for (const tr of table.rows) {
      const cells = [];
      for (const c of tr.children) {
        if (c.tagName === 'TD' || c.tagName === 'TH') cells.push(cellToText(c));
      }
      if (cells.length) rows.push(cells);
    }
    const cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    return rows.map(function (r) {
      const out = r.slice();
      while (out.length < cols) out.push('');
      return out;
    });
  }

  function escapeCell(s) {
    return String(s).replace(/\|/g, '\\|');
  }

  /** 二维数组 → Markdown 表格文本 */
  function tableToMarkdown(rows) {
    if (!rows.length) return '';
    const cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0) || 1;
    const line = function (r) {
      const parts = [];
      for (let i = 0; i < cols; i++) parts.push(escapeCell(r[i] === undefined ? '' : r[i]));
      return '| ' + parts.join(' | ') + ' |';
    };
    const out = [line(rows[0])];
    const sep = [];
    for (let i = 0; i < cols; i++) sep.push('---');
    out.push('| ' + sep.join(' | ') + ' |');
    for (let i = 1; i < rows.length; i++) out.push(line(rows[i]));
    return out.join('\n');
  }

  /**
   * 整个编辑区 → 纯文本。
   * 关键：把内容当成「行流」，表格的 Markdown 行直接塞进行流，
   * 不在块之间额外补空行 —— 这样往返才严格守恒。
   */
  function serialize() {
    const out = [];

    for (const node of editor.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push.apply(out, node.nodeValue.split('\n'));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'TABLE') {
          const rows = readTable(node);
          if (rows.length) out.push.apply(out, tableToMarkdown(rows).split('\n'));
        } else if (tag === 'BR') {
          out.push('');
        } else {
          out.push.apply(out, blockLines(node));
        }
      }
    }

    // 首尾空行会被裁掉；裁剪是幂等操作，所以不会在反复保存中累积或丢失
    return out.join('\n').replace(/^\n+|\n+$/g, '');
  }

  /* ══════════════════════════════════════════════════════════
     三、文本 → DOM（反序列化）
     ══════════════════════════════════════════════════════════ */

  /** 文本 → 块序列：[{k:'t',lines:[]} | {k:'tb',rows:[[]]}] */
  function parseBlocks(text) {
    const lines = String(text).split('\n');
    const blocks = [];
    let buf = [];
    let i = 0;

    const flushText = function () {
      if (buf.length) { blocks.push({ k: 't', lines: buf }); buf = []; }
    };

    while (i < lines.length) {
      if (isTableRow(lines[i])) {
        const raw = [];
        while (i < lines.length && isTableRow(lines[i])) raw.push(lines[i++]);
        const rows = raw.map(splitRow).filter(function (r) { return !isSeparatorRow(r); });
        if (rows.length) {
          flushText();
          blocks.push({ k: 'tb', rows: rows });
        } else {
          buf.push.apply(buf, raw);   // 一堆分隔行而已，当普通文本处理
        }
      } else {
        buf.push(lines[i++]);
      }
    }
    flushText();
    return blocks;
  }

  function makeTextLine(line) {
    const div = document.createElement('div');
    if (line === '') div.appendChild(document.createElement('br'));
    else div.textContent = line;
    return div;
  }

  /** 文本写进单元格：<br> 标记还原成真换行，空格子放占位 <br> 以便点击 */
  function fillCell(cell, text) {
    cell.textContent = '';
    const parts = String(text).split(/<br\s*\/?>/i);
    parts.forEach(function (p, idx) {
      if (idx) cell.appendChild(document.createElement('br'));
      if (p) cell.appendChild(document.createTextNode(p));
    });
    if (!cell.childNodes.length) cell.appendChild(document.createElement('br'));
  }

  function buildTableEl(rows) {
    const table = document.createElement('table');
    const cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0) || 1;
    rows.forEach(function (r, ri) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement(ri === 0 ? 'th' : 'td');
        fillCell(cell, r[c] === undefined ? '' : r[c]);
        tr.appendChild(cell);
      }
      table.appendChild(tr);
    });
    return table;
  }

  /** 块序列 → DocumentFragment */
  function renderBlocks(blocks) {
    const frag = document.createDocumentFragment();

    blocks.forEach(function (b, idx) {
      if (b.k === 't') {
        b.lines.forEach(function (line) { frag.appendChild(makeTextLine(line)); });
      } else {
        // 表格前面留一个出口空行，方便把光标移到表格上方
        if (idx === 0) frag.appendChild(makeTextLine(''));
        frag.appendChild(buildTableEl(b.rows));
      }
    });

    // 表格结尾留一个出口空行（首尾空行会被 serialize 裁掉，不影响守恒）
    const last = blocks[blocks.length - 1];
    if (last && last.k === 'tb') frag.appendChild(makeTextLine(''));

    // 空文档也要有一个可点击的空行
    if (!frag.childNodes.length) frag.appendChild(makeTextLine(''));

    return frag;
  }

  function deserialize(text) {
    return renderBlocks(parseBlocks(text));
  }

  /* ══════════════════════════════════════════════════════════
     四、内容读写
     ══════════════════════════════════════════════════════════ */

  function getContent() { return serialize(); }

  function setContent(text) {
    editor.innerHTML = '';
    editor.appendChild(deserialize(text));
    savedContent = String(text);   // 用远端原文，而不是序列化回读值
    userEdited = false;            // 未经用户动手，绝不自动保存
    updatePrintable(text);
  }

  /* ══════════════════════════════════════════════════════════
     五、状态与保存
     ══════════════════════════════════════════════════════════ */

  function setStatus(state, text) {
    statusIndicator.className = '';
    statusIndicator.classList.add('status--' + state);
    statusText.textContent = text;
  }

  async function saveContent(content) {
    if (isSaving) return;
    isSaving = true;
    setStatus('saving', 'Saving…');

    try {
      const response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: 'text=' + encodeURIComponent(content),
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      savedContent = content;
      retryCount = 0;
      setStatus('saved', 'Saved');
    } catch (err) {
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        setStatus('error', 'Save failed');
        console.warn('Notepad: giving up after', MAX_RETRIES, 'failed attempts');
      } else {
        setStatus('error', 'Save error');
        console.warn('Notepad save error:', err, '(attempt ' + retryCount + '/' + MAX_RETRIES + ')');
      }
    } finally {
      isSaving = false;
    }
  }

  function uploadContent() {
    const current = getContent();
    // 只有用户真正编辑过才写回，避免页面一加载就把（可能有损的）回读值覆盖远端
    if (userEdited && current !== savedContent) {
      saveContent(current).finally(function () {
        updatePrintable(current);
        scheduleNext();
      });
    } else {
      scheduleNext();
    }
  }

  function scheduleNext() {
    saveTimer = setTimeout(uploadContent, 1000);
  }

  function updatePrintable(text) {
    printable.innerHTML = '';
    printable.appendChild(deserialize(text));
  }

  function flushSave() {
    const content = getContent();
    if (userEdited && content !== savedContent) {
      if (saveTimer) clearTimeout(saveTimer);
      savedContent = content;
      saveContent(content);
    }
  }

  /* ══════════════════════════════════════════════════════════
     六、选区 / 单元格工具
     ══════════════════════════════════════════════════════════ */

  function closestCell(node) {
    while (node && node !== editor) {
      if (node.nodeType === 1 && (node.tagName === 'TD' || node.tagName === 'TH')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function cellInfo(cell) {
    if (!cell) return null;
    const tr = cell.parentNode;
    const table = tr && tr.parentNode;
    if (!table || table.tagName !== 'TABLE') return null;
    const rows = Array.prototype.slice.call(table.rows);
    const rowIdx = rows.indexOf(tr);
    if (rowIdx < 0) return null;
    return { cell: cell, tr: tr, table: table, rows: rows, rowIdx: rowIdx, colIdx: cell.cellIndex };
  }

  function cellInfoAt(range) {
    const node = range ? (range.startContainer.nodeType === 1
      ? range.startContainer
      : range.startContainer.parentNode) : null;
    return cellInfo(closestCell(node));
  }

  function gridOf(info) {
    return info.rows.map(function (tr) {
      return Array.prototype.filter.call(tr.children, function (c) {
        return c.tagName === 'TD' || c.tagName === 'TH';
      });
    });
  }

  function focusCell(cell, atEnd) {
    if (!cell) return;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.collapse(atEnd === false ? true : false);
    if (!cell.firstChild) range.setStart(cell, 0), range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** 把一个块级节点插到光标所在的顶层位置（保证表格永远是 editor 的直接子节点） */
  function insertBlockAtCursor(node) {
    editor.focus();
    const sel = window.getSelection();
    let ref = null;

    if (sel.rangeCount) {
      let n = sel.getRangeAt(0).startContainer;
      if (n && editor.contains(n)) {
        while (n.parentNode && n.parentNode !== editor) n = n.parentNode;
        if (n.parentNode === editor && n.nodeType === 1) ref = n;
      }
    }

    if (ref && ref.nextSibling) {
      ref.parentNode.insertBefore(node, ref.nextSibling);
    } else {
      editor.appendChild(node);
    }

    // 表格后面必须有出口，否则光标出不来
    if (node.tagName === 'TABLE' && !node.nextSibling) {
      node.parentNode.appendChild(makeTextLine(''));
    }
  }

  function insertTableAtCursor(rows) {
    const table = buildTableEl(rows);
    insertBlockAtCursor(table);
    markDirty();
    focusCell(table.rows[0] && table.rows[0].cells[0], false);
    return table;
  }

  /* ══════════════════════════════════════════════════════════
     七、表格编辑操作
     ══════════════════════════════════════════════════════════ */

  function addRow(info, below) {
    const cols = gridOf(info)[info.rowIdx].length;
    const tr = document.createElement('tr');
    for (let i = 0; i < cols; i++) {
      const cell = document.createElement(info.rowIdx === 0 && !below ? 'th' : 'td');
      fillCell(cell, '');
      tr.appendChild(cell);
    }
    info.tr.parentNode.insertBefore(tr, below ? info.tr.nextSibling : info.tr);
    markDirty();
    focusCell(tr.cells[info.colIdx], false);
  }

  function removeRow(info) {
    if (info.rows.length <= 1) return;
    const idx = info.rowIdx;
    const next = info.tr.nextElementSibling || info.tr.previousElementSibling;
    info.tr.remove();
    markDirty();
    const target = next && next.cells[Math.min(info.colIdx, next.cells.length - 1)];
    focusCell(target, false);
  }

  function addColumn(info, right) {
    const at = info.colIdx + (right ? 1 : 0);
    info.rows.forEach(function (tr, ri) {
      const cell = document.createElement(ri === 0 && tr.querySelector('th') ? 'th' : 'td');
      fillCell(cell, '');
      tr.insertBefore(cell, tr.children[at] || null);
    });
    markDirty();
    const row0 = info.rows[0];
    focusCell(row0 && row0.cells[at], false);
  }

  function removeColumn(info) {
    const cols = gridOf(info).reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    if (cols <= 1) return;
    info.rows.forEach(function (tr) {
      if (tr.cells[info.colIdx]) tr.deleteCell(info.colIdx);
    });
    markDirty();
    const row0 = info.rows[0];
    focusCell(row0 && row0.cells[Math.min(info.colIdx, row0.cells.length - 1)], false);
  }

  function deleteTable(info) {
    const prev = info.table.previousElementSibling;
    info.table.remove();
    markDirty();
    if (prev) {
      const r = document.createRange();
      r.selectNodeContents(prev);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
  }

  /** 首行在「表头 / 普通行」之间切换 */
  function toggleHeaderRow(info) {
    const tr = info.rows[0];
    const wantTh = !tr.querySelector('th');
    const fresh = document.createElement('tr');
    Array.prototype.slice.call(tr.children).forEach(function (old) {
      const cell = document.createElement(wantTh ? 'th' : 'td');
      while (old.firstChild) cell.appendChild(old.firstChild);
      fresh.appendChild(cell);
    });
    tr.parentNode.replaceChild(fresh, tr);
    markDirty();
    focusCell(fresh.cells[info.colIdx], false);
  }

  /* ══════════════════════════════════════════════════════════
     八、右键菜单
     ══════════════════════════════════════════════════════════ */

  let ctxTargetCell = null;

  function buildContextMenu() {
    ctxMenu.innerHTML =
      '<button data-action="insert-table">插入表格</button>' +
      '<hr class="table-only">' +
      '<button data-action="insert-row-above" class="table-only">上方插入行</button>' +
      '<button data-action="insert-row-below" class="table-only">下方插入行</button>' +
      '<button data-action="insert-col-left" class="table-only">左侧插入列</button>' +
      '<button data-action="insert-col-right" class="table-only">右侧插入列</button>' +
      '<hr class="table-only">' +
      '<button data-action="toggle-header" class="table-only">首行设为/取消表头</button>' +
      '<button data-action="delete-row" class="table-only">删除当前行</button>' +
      '<button data-action="delete-col" class="table-only">删除当前列</button>' +
      '<button data-action="delete-table" class="table-only">删除表格</button>';
  }

  function showContextMenu(e, inTable) {
    e.preventDefault();
    ctxTargetCell = inTable ? closestCell(e.target) : null;
    ctxMenu.querySelectorAll('.table-only').forEach(function (el) {
      el.style.display = inTable ? '' : 'none';
    });
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 220) + 'px';
    ctxMenu.style.display = 'block';
  }

  function hideContextMenu() { ctxMenu.style.display = 'none'; }

  function handleCtxAction(action) {
    hideContextMenu();
    if (action === 'insert-table') {
      // 插入位置以右键落点为准
      const sel = window.getSelection();
      if (ctxTargetCell === null) {
        let n = ctxMenuAnchor || null;
        if (n && editor.contains(n)) {
          const r = document.createRange();
          r.selectNodeContents(n);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }
      showInsertDialog();
      return;
    }
    const info = cellInfo(ctxTargetCell);
    if (!info) return;
    switch (action) {
      case 'insert-row-above': addRow(info, false); break;
      case 'insert-row-below': addRow(info, true); break;
      case 'insert-col-left': addColumn(info, false); break;
      case 'insert-col-right': addColumn(info, true); break;
      case 'toggle-header': toggleHeaderRow(info); break;
      case 'delete-row': removeRow(info); break;
      case 'delete-col': removeColumn(info); break;
      case 'delete-table': deleteTable(info); break;
    }
  }

  let ctxMenuAnchor = null;

  /* ══════════════════════════════════════════════════════════
     九、插入表格对话框
     ══════════════════════════════════════════════════════════ */

  function showInsertDialog() {
    const overlay = document.createElement('div');
    overlay.id = 'dialog-overlay';
    overlay.innerHTML =
      '<div id="dialog-box">' +
        '<h3>插入表格</h3>' +
        '<div class="row"><label>行</label><input id="d-rows" type="number" value="3" min="1" max="50"></div>' +
        '<div class="row"><label>列</label><input id="d-cols" type="number" value="3" min="1" max="20"></div>' +
        '<div class="row"><label>表头</label><input id="d-head" type="checkbox" checked></div>' +
        '<div class="actions">' +
          '<button id="d-cancel">取消</button>' +
          '<button id="d-ok" class="primary">插入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    const rowsInput = document.getElementById('d-rows');
    rowsInput.focus();
    rowsInput.select();

    const close = function () { overlay.remove(); editor.focus(); };

    document.getElementById('d-cancel').onclick = close;
    document.getElementById('d-ok').onclick = function () {
      const r = Math.min(50, Math.max(1, parseInt(rowsInput.value, 10) || 3));
      const c = Math.min(20, Math.max(1, parseInt(document.getElementById('d-cols').value, 10) || 3));
      const withHead = document.getElementById('d-head').checked;
      const rows = [];
      for (let i = 0; i < r; i++) {
        const row = [];
        for (let j = 0; j < c; j++) row.push('');
        rows.push(row);
      }
      close();
      const table = insertTableAtCursor(rows);
      if (!withHead) toggleHeaderRow(cellInfo(table.rows[0].cells[0]));
    };

    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('d-ok').click(); }
    });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
  }

  /* ══════════════════════════════════════════════════════════
     十、键盘
     ══════════════════════════════════════════════════════════ */

  function insertBrAtCursor() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    r.deleteContents();

    // 清掉「空格子」的占位 br，避免出现两个换行
    const cell = closestCell(r.startContainer);
    if (cell && cell.childNodes.length === 1 && cell.firstChild.tagName === 'BR') {
      cell.removeChild(cell.firstChild);
      r.setStart(cell, 0);
      r.collapse(true);
    }

    const br = document.createElement('br');
    r.insertNode(br);
    r.setStartAfter(br);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function handleTab(e) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const info = cellInfoAt(sel.getRangeAt(0));

    if (!info) {
      // 表格外：Tab 当作缩进（一张纸上也需要缩进）
      e.preventDefault();
      document.execCommand('insertText', false, '\t');
      return;
    }

    e.preventDefault();
    const grid = gridOf(info);
    const totalRows = grid.length;
    const totalCols = grid[info.rowIdx].length;
    let r = info.rowIdx;
    let c = info.colIdx + (e.shiftKey ? -1 : 1);

    if (c >= totalCols) { c = 0; r++; }
    if (c < 0) { c = totalCols - 1; r--; }

    if (r >= totalRows) {
      if (e.shiftKey) return;
      // 表格末尾按 Tab：自动续一行，像表格软件一样
      const tr = document.createElement('tr');
      for (let i = 0; i < totalCols; i++) {
        const cell = document.createElement('td');
        fillCell(cell, '');
        tr.appendChild(cell);
      }
      info.table.appendChild(tr);
      markDirty();
      focusCell(tr.cells[0], false);
      return;
    }
    if (r < 0) return;

    focusCell(grid[r][c], false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') { handleTab(e); return; }

    if (e.key === 'Enter') {
      const sel = window.getSelection();
      const info = sel.rangeCount ? cellInfoAt(sel.getRangeAt(0)) : null;
      if (info) {
        // 单元格内 Enter = 换行，绝不让它把表格结构拆了
        e.preventDefault();
        insertBrAtCursor();
        markDirty();
      }
      return;
    }

    // Ctrl/Cmd + B/I/U 这类会让 contenteditable 塞进 b/i/u 标签，
    // 我们不拦，serialize 也能正确取文字；但表格里禁止，避免破坏结构
    if ((e.ctrlKey || e.metaKey) && !e.altKey && ['b', 'i', 'u'].indexOf(e.key.toLowerCase()) >= 0) {
      const sel = window.getSelection();
      if (sel.rangeCount && cellInfoAt(sel.getRangeAt(0))) e.preventDefault();
    }
  }

  /* ══════════════════════════════════════════════════════════
     十一、粘贴
     ══════════════════════════════════════════════════════════ */

  /** 从 HTML 片段里抽出第一张表 */
  function tableFromHtml(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const t = doc.querySelector('table');
    if (!t) return null;
    const rows = readTable(t);
    return rows.length ? rows : null;
  }

  /** 制表符分隔的多行文本 → 表格（Excel / 表格软件直接粘贴） */
  function tableFromTsv(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
    if (lines.length < 2) return null;
    const parsed = lines.map(function (l) { return l.split('\t'); });
    const width = parsed[0].length;
    if (width < 2) return null;
    const same = parsed.every(function (r) { return r.length === width; });
    if (!same) return null;
    return parsed.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }

  function handlePaste(e) {
    const cd = e.clipboardData || window.clipboardData;
    if (!cd) return;

    const html = cd.getData('text/html');
    const plain = cd.getData('text/plain');

    let rows = html ? tableFromHtml(html) : null;
    if (!rows && plain) rows = tableFromTsv(plain);

    if (rows) {
      e.preventDefault();
      insertTableAtCursor(rows);
      return;
    }

    if (plain) {
      e.preventDefault();
      document.execCommand('insertText', false, plain);   // 一律纯文本，杜绝脏 DOM
    }
  }

  /* ══════════════════════════════════════════════════════════
     十二、初始化
     ══════════════════════════════════════════════════════════ */

  function init() {
    // 让 Enter 产生 <div> 而不是 <p>/<br>，序列化才有稳定的行单位
    try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (err) { /* noop */ }

    if (typeof initialContent !== 'undefined') setContent(initialContent);

    buildContextMenu();

    editor.addEventListener('contextmenu', function (e) {
      let t = e.target;
      let inTable = false;
      ctxMenuAnchor = null;
      while (t && t !== editor) {
        if (t.nodeType === 1 && t.tagName === 'TABLE') { inTable = true; break; }
        t = t.parentNode;
      }
      if (!inTable && e.target !== editor) {
        let n = e.target;
        while (n.parentNode && n.parentNode !== editor) n = n.parentNode;
        if (n.parentNode === editor) ctxMenuAnchor = n;
      }
      showContextMenu(e, inTable);
    });

    ctxMenu.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (btn) handleCtxAction(btn.getAttribute('data-action'));
    });

    document.addEventListener('click', function (e) {
      if (!ctxMenu.contains(e.target)) hideContextMenu();
    });
    window.addEventListener('scroll', hideContextMenu, true);

    editor.addEventListener('input', markDirty);
    editor.addEventListener('keydown', handleKeyDown);
    editor.addEventListener('paste', handlePaste);

    // 手机等没有右键的环境：底部按钮
    const btn = document.getElementById('btn-table');
    if (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        hideContextMenu();
        showInsertDialog();
      });
    }

    editor.focus();
    uploadContent();

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) flushSave();
    });
    window.addEventListener('pagehide', function () {
      const content = getContent();
      if (userEdited && content !== savedContent) {
        navigator.sendBeacon(
          window.location.pathname,
          new Blob(['text=' + encodeURIComponent(content)],
            { type: 'application/x-www-form-urlencoded' })
        );
      }
    });

    setStatus('idle', 'Ready');
  }

  // 调试 / 自动化测试入口（运行时不依赖它）
  window.__notepad = {
    serialize: serialize,
    deserialize: deserialize,
    parseBlocks: parseBlocks,
    tableToMarkdown: tableToMarkdown,
    splitRow: splitRow,
    getContent: getContent,
    setContent: setContent,
    renderBlocks: renderBlocks,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
