const express = require('express');
const path = require('path');
const notesRouter = require('./routes/notes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Body Parsing ────────────────────────────────────────────
app.use(express.text());                           // Raw text body (curl)
app.use(express.urlencoded({ extended: true }));   // Form-encoded (browser)
app.use(express.json());                           // JSON body (future use)

// ── Static Files ────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────
app.use('/', notesRouter);

// ── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).type('text/plain').send('Not Found\n');
});

// ── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✏️  Minimalist Web Notepad running at http://localhost:${PORT}`);
  console.log(`   Notes are stored in: ${path.join(__dirname, '_tmp')}`);
});
