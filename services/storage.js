/**
 * Storage layer — dual backend with auto-detection.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  Environment                  │  Backend                │
 * ├───────────────────────────────┼─────────────────────────┤
 * │  Local (no VERCEL env)       │  File system (_tmp/)    │
 * │  Vercel + KV_URL configured  │  Upstash Redis          │
 * └───────────────────────────────┴─────────────────────────┘
 *
 * Detection: if VERCEL=1 and KV_URL is set → Upstash Redis, else filesystem.
 */

const fs = require('fs');
const path = require('path');

const SAVE_PATH = path.join(__dirname, '..', '_tmp');
const CHARS = '234579abcdefghjkmnpqrstwxyz';

// ── Backend detection ──────────────────────────────────────

const useKv =
  process.env.VERCEL === '1' &&
  !!(process.env.KV_URL || process.env.KV_REST_API_URL);

// ── File system backend ────────────────────────────────────

function ensureDir() {
  if (!fs.existsSync(SAVE_PATH)) {
    fs.mkdirSync(SAVE_PATH, { recursive: true });
  }
}

const fileBackend = {
  async getNote(id) {
    const filePath = path.join(SAVE_PATH, id);
    try {
      return fs.readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  },

  async saveNote(id, content) {
    ensureDir();
    const filePath = path.join(SAVE_PATH, id);
    if (content.length === 0) {
      try { fs.unlinkSync(filePath); } catch { /* ok */ }
      return;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  },

  async noteExists(id) {
    const filePath = path.join(SAVE_PATH, id);
    try {
      return fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  },
};

// ── Vercel KV backend ──────────────────────────────────────

let kvBackend = null;
let kvInitError = null;
let kvClient = null;

function initKv() {
  if (kvBackend) return;
  try {
    const { Redis } = require('@upstash/redis');
    const kv = Redis.fromEnv();
    kvClient = kv;
    kvBackend = {
      async getNote(id) {
        const val = await kv.get(id);
        return val ?? null;
      },
      async saveNote(id, content) {
        if (content.length === 0) {
          await kv.del(id);
        } else {
          await kv.set(id, content);
        }
      },
      async noteExists(id) {
        return (await kv.exists(id)) === 1;
      },
    };
  } catch (e) {
    kvInitError = e.message + ' | stack:' + (e.stack ? e.stack.split('\n')[0] : 'no stack');
    console.error('Failed to init Upstash KV:', kvInitError);
    kvBackend = null;
  }
}

// ── Unified interface ──────────────────────────────────────

const activeBackend = useKv
  ? (initKv(), kvBackend || fileBackend)
  : fileBackend;

// Log which backend is active (only once)
if (useKv) {
  console.log('📦 Storage: Upstash Redis');
} else {
  console.log('📦 Storage: File system (_tmp/)');
}

function getBackendInfo() {
  return {
    useKv: useKv,
    backend: useKv ? (kvBackend ? 'Upstash Redis' : 'filesystem (KV init failed, fallback)') : 'filesystem',
    vercel: process.env.VERCEL || 'not set',
    hasKvUrl: !!process.env.KV_URL,
    hasKvRestUrl: !!process.env.KV_REST_API_URL,
    hasKvToken: !!process.env.KV_REST_API_TOKEN,
    initError: kvInitError || 'none',
  };
}

/**
 * Get note content.
 * @param {string} id
 * @returns {Promise<string|null>}
 */
async function getNote(id) {
  return activeBackend.getNote(id);
}

/**
 * Save (or delete) note content.
 * @param {string} id
 * @param {string} content — empty string deletes the note
 */
async function saveNote(id, content) {
  return activeBackend.saveNote(id, content);
}

/**
 * Check if a note exists.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function noteExists(id) {
  return activeBackend.noteExists(id);
}

/**
 * Generate a random note ID (5 unambiguous characters).
 * @returns {string}
 */
function generateId() {
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

/**
 * Validate a note ID.
 * @param {string} id
 * @returns {boolean}
 */
function isValidId(id) {
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    id.length <= 64 &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

module.exports = { getNote, saveNote, noteExists, generateId, isValidId, getBackendInfo };
