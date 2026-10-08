/* ═══════════════════════════════════════════════════════════════
   Notepad 表格块 —— Markdown ↔ 矩阵 + Jspreadsheet 实例管理
   ---------------------------------------------------------------
   这些约束来自原型验证（public/spike/hybrid-table.html），改动前请先读
   docs/spike-hybrid-table-notes.md：

   1. 块容器必须是 contenteditable="false" 的原子块；
      绝不在块上 stopPropagation / preventDefault / 手动 focus()，
      否则库建立不起选中态（getSelected() 恒为空、Tab 与输入全部失效）。
   2. 库必须按 jsuites → formula → jspreadsheet 的顺序加载，
      后两者依赖前者的全局变量。
   3. getData() 会把 minDimensions 撑出的空行空列一起返回，
      写进 Markdown 前必须 trimMatrix()。
   4. commit 时机放在库的 onchange，避免撤销/粘贴后 data-md 滞后。
   5. 单元格内换行在 Markdown 里记作 <br>，进库前还原成 \n。
   ═══════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  const VENDOR_CSS = ['/vendor/jsuites.css', '/vendor/jspreadsheet.css'];
  const VENDOR_JS = ['/vendor/jsuites.js', '/vendor/formula.js', '/vendor/jspreadsheet.js'];
  const BR_RE = /<br\s*\/?>/gi;
  const BR = '<br>';

  /* ── 懒加载（页面注入过就直接可用，否则按序注入）────────── */

  let libPromise = null;

  function libReady() {
    return typeof global.jspreadsheet === 'function' && !!global.jSuites;
  }

  function loadLib() {
    if (libReady()) return Promise.resolve();
    if (libPromise) return libPromise;

    libPromise = new Promise(function (resolve, reject) {
      VENDOR_CSS.forEach(function (href) {
        if (document.querySelector('link[href="' + href + '"]')) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
      });

      let i = 0;
      (function next() {
        if (i >= VENDOR_JS.length) { resolve(); return; }
        const src = VENDOR_JS[i++];
        const script = document.createElement('script');
        script.src = src;
        script.onload = next;
        script.onerror = function () { reject(new Error('无法加载 ' + src)); };
        document.head.appendChild(script);
      })();
    });

    return libPromise;
  }

  /* ── Markdown 表格 ↔ 二维矩阵 ──────────────────────────── */

  function isTableRow(line) {
    return String(line).trim().charAt(0) === '|';
  }

  function isSeparator(line) {
    const t = String(line).trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.length > 0 && /^[-:\s|]+$/.test(t) && t.indexOf('-') !== -1;
  }

  /** "| a | b |" → ['a','b']，保留空单元格、还原 \| 转义 */
  function splitRow(line) {
    let s = String(line).trim();
    if (s.charAt(0) === '|') s = s.slice(1);
    if (/(^|[^\\])\|$/.test(s)) s = s.slice(0, -1);

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

  /**
   * 裁掉「尾部」的全空行与每行尾部的全空列 —— minDimensions 撑出来的那些不算数据。
   * 只裁尾部：表格中间的空行是用户数据，必须原样保留。
   */
  function trimMatrix(rows) {
    const blank = function (v) { return v === undefined || v === null || String(v).trim() === ''; };
    const out = (rows || []).filter(Array.isArray).map(function (r) { return r.slice(); });

    while (out.length && out[out.length - 1].every(blank)) out.pop();

    let cols = 0;
    out.forEach(function (r) {
      for (let i = r.length - 1; i >= 0; i--) {
        if (!blank(r[i])) { cols = Math.max(cols, i + 1); break; }
      }
    });

    return out.map(function (r) {
      const line = r.slice(0, cols);
      while (line.length < cols) line.push('');
      return line;
    });
  }

  /** Markdown 表格文本 → 矩阵（单元格内 <br> 还原成 \n） */
  function mdToMatrix(md) {
    if (!md) return [];
    const rows = String(md).split('\n')
      .filter(isTableRow)
      .filter(function (l) { return !isSeparator(l); })
      .map(splitRow)
      .map(function (r) { return r.map(function (c) { return c.replace(BR_RE, '\n'); }); });

    const cols = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    return rows.map(function (r) {
      const out = r.slice();
      while (out.length < cols) out.push('');
      return out;
    });
  }

  /** 矩阵 → Markdown 表格文本（\n 写回 <br>，| 转义，尾部空洞裁掉） */
  function matrixToMd(rows) {
    const m = trimMatrix(rows || []);
    if (!m.length) return '';

    const cols = m.reduce(function (n, r) { return Math.max(n, r.length); }, 0) || 1;
    const pad = function (r) {
      const out = r.map(function (c) {
        return String(c === undefined || c === null ? '' : c)
          .replace(/\n/g, BR)
          .replace(/\|/g, '\\|');
      });
      while (out.length < cols) out.push('');
      return out.slice(0, cols);
    };

    const lines = [pad(m[0])];
    const sep = [];
    for (let i = 0; i < cols; i++) sep.push('---');
    lines.push(sep);
    m.slice(1).forEach(function (r) { lines.push(pad(r)); });

    return lines.map(function (r) { return '| ' + r.join(' | ') + ' |'; }).join('\n');
  }

  /* ── 块实例管理 ────────────────────────────────────────── */

  let activeEl = null;

  function isBlock(el) {
    return !!(el && el.nodeType === 1 && el.classList && el.classList.contains('tbl'));
  }

  function closestBlock(node) {
    while (node && node.nodeType !== 9) {
      if (isBlock(node)) return node;
      node = node.parentNode;
    }
    return null;
  }

  function setActive(el) {
    if (activeEl === el) return;
    if (activeEl) activeEl.dataset.active = '0';
    activeEl = el;
    if (el) el.dataset.active = '1';
  }

  function getActive() { return activeEl; }

  /** 读取块的 Markdown（库未就绪时退回 dataset.md，绝不丢内容） */
  function readBlock(el) {
    const block = el && el.__ntBlock;
    if (block && block.instance) return matrixToMd(block.instance.getData());
    return (el && el.dataset.md) || '';
  }

  function commit(el) {
    if (!el) return;
    el.dataset.md = readBlock(el);
    // 通知宿主：内容变了（app.js 借此标记 dirty 并触发自动保存）
    el.dispatchEvent(new CustomEvent('nt-change', { bubbles: true }));
  }

  function commitActive() {
    if (activeEl) { commit(activeEl); setActive(null); }
  }

  /**
   * 收集「Markdown 表达不了」的表格状态，目前只有列宽。
   * 与正文分开存储（服务端存到 <note>.meta），所以 curl 读到的正文始终是干净 Markdown。
   * 返回值按 DOM 里的表格块顺序对齐，无元数据的块占 null 位。
   */
  function collectMeta(root) {
    if (!root) return '';
    const tables = [];
    Array.prototype.forEach.call(root.childNodes, function (node) {
      if (!isBlock(node)) return;
      const block = node.__ntBlock;
      let widths = null;
      if (block && block.instance && typeof block.instance.getWidth === 'function') {
        const w = block.instance.getWidth();
        if (Array.isArray(w)) {
          const nums = w.map(function (v) { return parseInt(v, 10) || 0; });
          if (nums.some(function (v) { return v > 0; })) widths = nums;
        }
      }
      tables.push(widths ? { widths: widths } : null);
    });
    if (!tables.some(Boolean)) return '';
    return JSON.stringify({ v: 1, tables: tables });
  }

  /** 从 meta JSON 里取第 index 个表格块的列宽 */
  function widthsFrom(meta, index) {
    try {
      const parsed = typeof meta === 'string' ? JSON.parse(meta) : meta;
      const t = parsed && parsed.tables && parsed.tables[index];
      return (t && Array.isArray(t.widths)) ? t.widths : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 建一个表格块元素（同步返回；库就绪后内部再补上实例）。
   * @param {string|Array} source Markdown 文本或二维矩阵
   */
  function createBlock(source, opts) {
    opts = opts || {};
    const md = typeof source === 'string' ? source : matrixToMd(source || []);

    const el = document.createElement('div');
    el.className = 'tbl';
    el.setAttribute('contenteditable', 'false');
    el.dataset.md = md;
    el.dataset.active = '0';

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = '表格 · 点进来就能改';
    el.appendChild(hint);

    const host = document.createElement('div');
    host.className = 'tbl-host';
    el.appendChild(host);

    const block = { el: el, instance: null };
    el.__ntBlock = block;

    loadLib().then(function () {
      const matrix = mdToMatrix(md);
      const seed = matrix.length ? matrix : [['', '', ''], ['', '', ''], ['', '', '']];
      const ret = global.jspreadsheet(host, {
        worksheets: [{ data: seed, minDimensions: [3, 3] }],
        tableOverflow: true,
        tableWidth: '100%',
        tableHeight: '200px',
        toolbar: false,
        onchange: function () { commit(el); },          // 撤销 / 粘贴后也能及时同步
        onresizecolumn: function () { commit(el); },    // 拖列宽同样要落盘
        onevent: function (name) {
          // 不同版本的同名事件挂载位置不同，这里兜一层
          if (name === 'onresizecolumn' || name === 'onresizerow') commit(el);
        },
      });
      block.instance = Array.isArray(ret) ? ret[0] : ret;

      // 恢复上次存下来的列宽（Markdown 存不下这个）
      if (Array.isArray(opts.widths) && block.instance && typeof block.instance.setWidth === 'function') {
        opts.widths.forEach(function (w, i) {
          const px = parseInt(w, 10);
          if (px > 0) {
            try { block.instance.setWidth(i, px); } catch (e) { /* 非法宽度直接跳过 */ }
          }
        });
      }
      el.dataset.ready = '1';
      if (opts && typeof opts.onReady === 'function') opts.onReady(el);
    }).catch(function (err) {
      el.dataset.error = '1';
      hint.textContent = '表格加载失败（' + err.message + '）';
      console.warn('Notepad 表格块：', err);
    });

    // 只做标记，不拦截事件 —— 库要靠原样送达的 mousedown 建立选中态
    el.addEventListener('mousedown', function () { setActive(el); });
    el.addEventListener('focusin', function () { setActive(el); });

    return el;
  }

  /** 一张表够不够格当成“从别处粘来的表格数据” */
  function looksLikeTabular(text) {
    if (!text) return false;
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim() !== ''; });
    if (lines.length < 2) return false;
    if (lines.every(isTableRow)) return true;                       // Markdown 表格
    return lines.filter(function (l) { return l.indexOf('\t') !== -1; }).length >= 2;  // TSV
  }

  /** TSV / Markdown 表格文本 → 矩阵 */
  function parseTabular(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n')
      .filter(function (l) { return l.trim() !== ''; });
    if (lines.every(isTableRow)) return mdToMatrix(lines.join('\n'));
    return lines.map(function (l) { return l.split('\t').map(function (c) { return c.trim(); }); });
  }

  global.NotepadTable = {
    loadLib: loadLib,
    libReady: libReady,
    isBlock: isBlock,
    closestBlock: closestBlock,
    createBlock: createBlock,
    readBlock: readBlock,
    commit: commit,
    commitActive: commitActive,
    getActive: getActive,
    setActive: setActive,
    mdToMatrix: mdToMatrix,
    matrixToMd: matrixToMd,
    trimMatrix: trimMatrix,
    collectMeta: collectMeta,
    widthsFrom: widthsFrom,
    isTableRow: isTableRow,
    isSeparator: isSeparator,
    looksLikeTabular: looksLikeTabular,
    parseTabular: parseTabular,
  };
})(window);
