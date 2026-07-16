/* ═══════════════════════════════════════════════════════════════
   Minimalist Web Notepad — Auto-save Frontend (contenteditable)
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const editor = document.getElementById('content');
  const printable = document.getElementById('printable');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  const ctxMenu = document.getElementById('ctx-menu');

  // ── State ────────────────────────────────────────────────

  let savedContent = '';
  let isSaving = false;
  let saveTimer = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  // ── Serialization (div → text with Markdown tables) ─────

  function serialize() {
    let result = '';
    for (const node of editor.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'TABLE') {
          result += '\n' + tableToMarkdown(node) + '\n';
        } else if (node.tagName === 'BR') {
          result += '\n';
        } else if (node.tagName === 'DIV') {
          result += serializeChild(node) + '\n';
        }
      }
    }
    return result.replace(/\n{3,}/g, '\n\n');
  }

  function serializeChild(parent) {
    let result = '';
    for (const node of parent.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'TABLE') {
          result += '\n' + tableToMarkdown(node) + '\n';
        } else if (node.tagName === 'BR') {
          result += '\n';
        } else if (node.tagName === 'DIV') {
          result += serializeChild(node) + '\n';
        }
      }
    }
    return result;
  }

  function tableToMarkdown(table) {
    const rows = table.querySelectorAll('tr');
    if (!rows.length) return '';
    const lines = [];
    rows.forEach(function (row, i) {
      const cells = row.querySelectorAll('td, th');
      var line = '| ' + Array.from(cells).map(function (c) { return c.textContent; }).join(' | ') + ' |';
      lines.push(line);
      if (i === 0) {
        lines.push('|' + Array(cells.length).fill('---').join('|') + '|');
      }
    });
    return lines.join('\n');
  }

  // ── Deserialization (text with Markdown tables → HTML) ─

  function deserialize(text) {
    if (!text) return '';
    var lines = text.split('\n');
    var html = '';
    var i = 0;

    while (i < lines.length) {
      if (lines[i].trim().charAt(0) === '|') {
        var tableLines = [];
        while (i < lines.length && lines[i].trim().charAt(0) === '|') {
          tableLines.push(lines[i].trim());
          i++;
        }
        var dataRows = tableLines.filter(function (l) {
          // Skip separator rows (cells with only dashes/colons)
          var parts = l.split('|').filter(function(c) { return c.trim() !== ''; });
          return !parts.every(function(c) { return /^[-:\s]+$/.test(c.trim()); });
        });
        if (dataRows.length > 0) {
          html += buildTableHtml(dataRows);
        }
      } else {
        html += esc(lines[i]);
        if (i < lines.length - 1) {
          html += '<br>';
        }
        i++;
      }
    }
    return html;
  }

  function buildTableHtml(rows) {
    var html = '<table>';
    rows.forEach(function (row, idx) {
      var tag = idx === 0 ? 'th' : 'td';
      var cells = row.split('|').filter(function (c) { return c.trim() !== ''; });
      html += '<tr>';
      cells.forEach(function (cell) {
        html += '<' + tag + '>' + esc(cell.trim()) + '</' + tag + '>';
      });
      html += '</tr>';
    });
    html += '</table>';
    return html;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // ── Content get/set ──────────────────────────────────

  function getContent() {
    return serialize();
  }

  function setContent(text) {
    editor.innerHTML = deserialize(text);
    savedContent = getContent();
  }

  // ── Status Display ───────────────────────────────────────

  function setStatus(state, text) {
    statusIndicator.className = '';
    statusIndicator.classList.add('status--' + state);
    statusText.textContent = text;
  }

  // ── Save Logic ───────────────────────────────────────────

  async function saveContent(content) {
    if (isSaving) return;

    isSaving = true;
    setStatus('saving', 'Saving…');

    try {
      var response = await fetch(window.location.pathname, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        },
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
        return;
      }

      setStatus('error', 'Save error');
      console.warn('Notepad save error:', err, '(attempt ' + retryCount + '/' + MAX_RETRIES + ')');
    } finally {
      isSaving = false;
    }
  }

  // ── Polling Loop ─────────────────────────────────────────

  function uploadContent() {
    var currentValue = getContent();

    if (currentValue !== savedContent) {
      saveContent(currentValue).finally(function () {
        updatePrintable(currentValue);
        scheduleNext();
      });
    } else {
      scheduleNext();
    }
  }

  function scheduleNext() {
    saveTimer = setTimeout(uploadContent, 1000);
  }

  // ── Printable View ───────────────────────────────────────

  function updatePrintable(text) {
    printable.textContent = text;
  }

  // ── Visibility Change ────────────────────────────────────

  function handleVisibilityChange() {
    if (document.hidden) {
      var content = getContent();
      if (content !== savedContent) {
        if (saveTimer) clearTimeout(saveTimer);
        savedContent = content;
        saveContent(savedContent);
      }
    }
  }

  // ── Context Menu ─────────────────────────────────────────

  var ctxClickTarget = null;

  function buildContextMenu() {
    ctxMenu.innerHTML =
      '<button data-action="insert-table">插入表格</button>' +
      '<hr class="table-only">' +
      '<button data-action="insert-row-above" class="table-only">上方插入行</button>' +
      '<button data-action="insert-row-below" class="table-only">下方插入行</button>' +
      '<button data-action="insert-col-left" class="table-only">左侧插入列</button>' +
      '<button data-action="insert-col-right" class="table-only">右侧插入列</button>' +
      '<hr class="table-only">' +
      '<button data-action="delete-row" class="table-only">删除当前行</button>' +
      '<button data-action="delete-col" class="table-only">删除当前列</button>' +
      '<button data-action="delete-table" class="table-only">删除表格</button>';
  }

  function showContextMenu(e, inTable) {
    e.preventDefault();
    ctxClickTarget = e.target;  // Save for table insertion
    if (!inTable) {
      ctxMenu.querySelectorAll('.table-only').forEach(function (el) { el.style.display = 'none'; });
    } else {
      ctxMenu.querySelectorAll('.table-only').forEach(function (el) { el.style.display = ''; });
    }
    ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 190) + 'px';
    ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
    ctxMenu.style.display = 'block';
  }

  function hideContextMenu() {
    ctxMenu.style.display = 'none';
  }

  function getCellInfo(node) {
    while (node && node !== editor) {
      if (node.tagName === 'TD' || node.tagName === 'TH') {
        var tr = node.parentNode;
        var table = tr.parentNode;
        var rows = Array.from(table.querySelectorAll('tr'));
        var rowIdx = rows.indexOf(tr);
        var cells = Array.from(tr.querySelectorAll('td, th'));
        var colIdx = cells.indexOf(node);
        return { cell: node, row: tr, table: table, rowIdx: rowIdx, colIdx: colIdx, rows: rows };
      }
      node = node.parentNode;
    }
    return null;
  }

  function handleCtxAction(action) {
    hideContextMenu();
    var sel = window.getSelection();
    var info = sel.rangeCount ? getCellInfo(sel.getRangeAt(0).commonAncestorContainer) : null;

    switch (action) {
      case 'insert-table':
        showInsertDialog();
        break;
      case 'insert-row-above':
        if (info) addRow(info, true);
        break;
      case 'insert-row-below':
        if (info) addRow(info, false);
        break;
      case 'insert-col-left':
        if (info) addColumn(info, true);
        break;
      case 'insert-col-right':
        if (info) addColumn(info, false);
        break;
      case 'delete-row':
        if (info) removeRow(info);
        break;
      case 'delete-col':
        if (info) removeColumn(info);
        break;
      case 'delete-table':
        if (info) info.table.remove();
        break;
    }
  }

  // ── Table Editing ────────────────────────────────────────

  function addRow(info, above) {
    var tr = info.table.insertRow(info.rowIdx + (above ? 0 : 1));
    var colCount = info.rows[0].querySelectorAll('td, th').length;
    for (var i = 0; i < colCount; i++) {
      var cell = tr.insertCell();
      cell.innerHTML = '<br>';
    }
    // Focus first cell of new row
    tr.cells[0].focus();
  }

  function removeRow(info) {
    if (info.rows.length <= 1) return;
    var next = info.row.nextElementSibling || info.row.previousElementSibling;
    info.row.remove();
    if (next) next.querySelector('td, th').focus();
  }

  function addColumn(info, left) {
    var colIdx = info.colIdx + (left ? 0 : 1);
    info.rows.forEach(function (row) {
      var isHeader = row.parentNode.tagName === 'THEAD' || row === info.rows[0];
      var cell = row.insertCell(colIdx);
      cell.innerHTML = '<br>';
    });
    // Focus first cell of new column
    var target = info.rows[0].cells[colIdx];
    if (target) target.focus();
  }

  function removeColumn(info) {
    var colIdx = info.colIdx;
    var maxCols = 1;
    info.rows.forEach(function (row) {
      if (row.cells.length > maxCols) maxCols = row.cells.length;
    });
    if (maxCols <= 1) return;
    info.rows.forEach(function (row) {
      if (row.cells[colIdx]) row.deleteCell(colIdx);
    });
  }

  // ── Insert Table Dialog ──────────────────────────────────

  function showInsertDialog() {
    var overlay = document.createElement('div');
    overlay.id = 'dialog-overlay';
    overlay.innerHTML =
      '<div id="dialog-box">' +
        '<h3>插入表格</h3>' +
        '<div class="row"><label>行</label><input id="d-rows" type="number" value="3" min="1" max="50"></div>' +
        '<div class="row"><label>列</label><input id="d-cols" type="number" value="3" min="1" max="20"></div>' +
        '<div class="actions">' +
          '<button id="d-cancel">取消</button>' +
          '<button id="d-ok" class="primary">插入</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    document.getElementById('d-rows').focus();
    document.getElementById('d-rows').select();

    function close() { overlay.remove(); }

    document.getElementById('d-cancel').onclick = close;

    document.getElementById('d-ok').onclick = function () {
      var rows = parseInt(document.getElementById('d-rows').value) || 3;
      var cols = parseInt(document.getElementById('d-cols').value) || 3;
      close();
      insertTableAtCursor(rows, cols);
    };

    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
      if (e.key === 'Enter') document.getElementById('d-ok').click();
    });
  }

  function insertTableAtCursor(rows, cols) {
    var table = document.createElement('table');
    for (var r = 0; r < rows; r++) {
      var tr = document.createElement('tr');
      for (var c = 0; c < cols; c++) {
        var cell = r === 0 ? document.createElement('th') : document.createElement('td');
        if (r > 0 || c > 0) cell.innerHTML = '<br>';
        tr.appendChild(cell);
      }
      table.appendChild(tr);
    }

    editor.focus();

    // Try to find a position for the table
    var range = null;
    var sel = window.getSelection();

    if (sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      range = sel.getRangeAt(0).cloneRange();
    }

    // If no valid selection, append to end of editor
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);
    range.deleteContents();
    range.insertNode(table);

    // Move cursor to first cell
    var firstCell = table.querySelector('th, td');
    if (firstCell) {
      var newRange = document.createRange();
      newRange.setStart(firstCell, 0);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  // ── Keyboard Navigation ──────────────────────────────────

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();  // Always stop Tab default first
      var sel = window.getSelection();
      if (!sel.rangeCount) return;
      var info = getCellInfo(sel.getRangeAt(0).commonAncestorContainer);
      if (!info) return;

      var dir = e.shiftKey ? -1 : 1;
      var totalRows = info.rows.length;
      var totalCols = info.rows[0].querySelectorAll('td, th').length;
      var newRow = info.rowIdx;
      var newCol = info.colIdx + dir;

      if (newCol >= totalCols) { newCol = 0; newRow++; }
      if (newCol < 0) { newCol = totalCols - 1; newRow--; }
      if (newRow < 0 || newRow >= totalRows) return;

      var target = info.rows[newRow].querySelectorAll('td, th')[newCol];
      if (target) target.focus();
    }
  }

  // ── Paste Handler ────────────────────────────────────────

  function handlePaste(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (text) {
      document.execCommand('insertText', false, text);
    }
  }

  // ── Init ─────────────────────────────────────────────────

  function init() {
    // Load initial content
    if (typeof initialContent !== 'undefined') {
      setContent(initialContent);
    }

    // Build context menu
    buildContextMenu();

    // Right-click on editor
    editor.addEventListener('contextmenu', function (e) {
      var target = e.target;
      var inTable = false;
      while (target && target !== editor) {
        if (target.tagName === 'TABLE') { inTable = true; break; }
        target = target.parentNode;
      }
      showContextMenu(e, inTable);
    });

    // Context menu actions
    ctxMenu.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (btn) handleCtxAction(btn.getAttribute('data-action'));
    });

    // Hide context menu on click outside
    document.addEventListener('click', function (e) {
      if (!ctxMenu.contains(e.target)) hideContextMenu();
    });

    // Keyboard navigation
    editor.addEventListener('keydown', handleKeyDown);

    // Paste as plain text
    editor.addEventListener('paste', handlePaste);

    // Focus editor
    editor.focus();

    // Start auto-save
    updatePrintable(getContent());
    uploadContent();

    // Save on tab hide
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', function () {
      var content = getContent();
      if (content !== savedContent) {
        var blob = new Blob(
          ['text=' + encodeURIComponent(content)],
          { type: 'application/x-www-form-urlencoded' }
        );
        navigator.sendBeacon(window.location.pathname, blob);
      }
    });

    setStatus('idle', 'Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
