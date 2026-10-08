const express = require('express');
const storage = require('../services/storage');

const router = express.Router();

/**
 * GET /
 * Redirect to a randomly-generated note ID.
 */
router.get('/', (req, res) => {
  const id = storage.generateId();
  res.redirect(302, '/' + id);
});

/**
 * GET /health
 * Simple health check (must be before /:note to avoid route shadowing).
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    storage: storage.getBackendInfo(),
  });
});

/**
 * GET /:note
 * - curl/wget user-agent → return raw text
 * - Browser → serve HTML page with content injected
 */
router.get('/:note', async (req, res) => {
  const { note } = req.params;

  if (!storage.isValidId(note)) {
    const id = storage.generateId();
    return res.redirect(302, '/' + id);
  }

  const ua = (req.get('User-Agent') || '').toLowerCase();
  const isCurl = ua.startsWith('curl') || ua.startsWith('wget');

  // Raw output for CLI tools
  if (isCurl || req.query.raw !== undefined) {
    const content = await storage.getNote(note);
    if (content === null) {
      return res.status(404).type('text/plain').send('Not Found\n');
    }
    return res.type('text/plain').send(content);
  }

  // Serve HTML page with content injection
  const content = (await storage.getNote(note)) || '';
  // 表格元数据（列宽等）单独存一个键，保证正文始终是干净的 Markdown
  const meta = (await storage.getNote(note + '.meta')) || '';

  const html = renderPage(content, note, meta);
  res.type('text/html').send(html);
});

/**
 * POST /:note
 * Save note content. Empty body → delete note.
 */
router.post('/:note', async (req, res) => {
  const { note } = req.params;

  if (!storage.isValidId(note)) {
    return res.status(400).type('text/plain').send('Invalid note ID\n');
  }

  // Accept both form-encoded and raw JSON body
  let text = req.body.text;
  if (text === undefined) {
    text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  await storage.saveNote(note, text);

  // 表格元数据（列宽等）与正文分开存：空串即删除，正文清空时不留残渣
  if (typeof req.body.meta === 'string') {
    await storage.saveNote(note + '.meta', req.body.meta);
  } else if (text.length === 0) {
    await storage.saveNote(note + '.meta', '');   // 删笔记（空正文）时连元数据一起清掉
  }

  res.status(204).send();
});

// ── Helper: HTML template ────────────────────────────────────

function renderPage(content, noteId, meta) {
  const cssPath = '/css/style.css';
  const jsPath = '/js/app.js';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#ebeef2">
<title>note.youyer.top</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${cssPath}">
</head>
<body>
<div class="stack">
  <div class="layer">
    <div class="layer">
      <div class="layer">
        <div id="content" class="content" contenteditable="true"></div>
      </div>
    </div>
  </div>
  <div class="flag">
    <a href="/">Note.ms</a>/${escapeHtml(noteId)}
    <button id="btn-table" type="button" title="插入表格">＋表格</button>
  </div>
</div>
<div id="printable"></div>
<div id="ctx-menu" class="ctx-menu" style="display:none"></div>
<div id="status-bar">
  <span id="status-indicator" class="status--idle"></span>
  <span id="status-text">Ready</span>
</div>
<script>const initialContent = ${JSON.stringify(content).replace(/</g, '\\u003c')};</script>
<script>const initialMeta = ${JSON.stringify(meta || '').replace(/</g, '\\u003c')};</script>
<script src="/js/table-block.js"></script>
<script src="${jsPath}"></script>
</body>
</html>`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = router;
