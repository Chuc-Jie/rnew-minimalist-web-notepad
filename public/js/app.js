/* ═══════════════════════════════════════════════════════════════
   Minimalist Web Notepad — Auto-save Frontend
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const textarea = document.getElementById('content');
  const printable = document.getElementById('printable');
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');

  // ── State ────────────────────────────────────────────────

  let savedContent = textarea.value;        // Last known saved state
  let isSaving = false;
  let saveTimer = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;

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
      const response = await fetch(window.location.pathname, {
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
        setStatus('error', 'Save failed — retrying…');
      } else {
        setStatus('error', 'Save error');
      }

      console.warn('Notepad save error:', err);
    } finally {
      isSaving = false;
    }
  }

  // ── Polling Loop ─────────────────────────────────────────

  function uploadContent() {
    const currentValue = textarea.value;

    if (currentValue !== savedContent) {
      // Content changed — save it
      saveContent(currentValue).finally(() => {
        // Update printable view
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

  // ── Visibility Change — Save immediately on tab hide ──────

  function handleVisibilityChange() {
    if (document.hidden && textarea.value !== savedContent) {
      if (saveTimer) {
        clearTimeout(saveTimer);
      }
      savedContent = textarea.value;
      saveContent(savedContent);
    }
  }

  // ── Init ─────────────────────────────────────────────────

  function init() {
    // Initialize printable content
    updatePrintable(textarea.value);

    // Focus the editor
    textarea.focus();

    // Set cursor to end of content
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Start auto-save polling
    uploadContent();

    // Save when tab loses focus (pagehide/visibilitychange)
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', function () {
      if (textarea.value !== savedContent) {
        // Use sendBeacon for reliable last save on unload
        const blob = new Blob(
          ['text=' + encodeURIComponent(textarea.value)],
          { type: 'application/x-www-form-urlencoded' }
        );
        navigator.sendBeacon(window.location.pathname, blob);
      }
    });

    // Set initial status
    setStatus('idle', 'Ready');
  }

  // Kick off when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
