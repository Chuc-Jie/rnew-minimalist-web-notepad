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
  res.json({ status: 'ok', uptime: process.uptime() });
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
  const escapedContent = escapeHtml(content);

  const html = renderPage(escapedContent, note);
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
  res.status(204).send();
});

// ── Helper: HTML template ────────────────────────────────────

function renderPage(content, noteId) {
  const title = escapeHtml(noteId);
  const cssPath = '/css/style.css';
  const jsPath = '/js/app.js';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#ebeef2">
<title>${title}</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${cssPath}">
</head>
<body>
<div class="stack">
  <div class="layer">
    <div class="layer">
      <div class="layer">
        <textarea id="content" class="content" spellcheck="true">${content}</textarea>
      </div>
    </div>
  </div>
  <div class="flag">
    <a href="/">Note.ms</a>/${escapeHtml(noteId)}
  </div>
</div>
<pre id="printable"></pre>
<div id="status-bar">
  <span id="status-indicator" class="status--idle"></span>
  <span id="status-text">Ready</span>
</div>
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
