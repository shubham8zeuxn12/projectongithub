/* ═══════════════════════════════════════════════════════════
   Annotate — Collaborative Document Annotation
   Vanilla JS · Socket.io · REST API
═══════════════════════════════════════════════════════════ */

const API = '';
let currentUser = '';
let currentDoc = null;
let annotations = [];
let historyLogs = [];
let selection = { start: 0, end: 0, text: '' };
let selectedColor = 'amber';
let activeTab = 'comments';
let activeAnnotationId = null;
const socket = io();

/* ── Color map ─────────────────────────────────────────── */
const COLOR_MAP = {
  amber:   { cls: 'hl-amber',   hex: '#f59e0b' },
  violet:  { cls: 'hl-violet',  hex: '#8b5cf6' },
  cyan:    { cls: 'hl-cyan',    hex: '#06b6d4' },
  rose:    { cls: 'hl-rose',    hex: '#f43f5e' },
  emerald: { cls: 'hl-emerald', hex: '#10b981' },
};

const ACTION_META = {
  DOCUMENT_UPLOADED:   { icon: '📤', color: '#06b6d4' },
  ANNOTATION_CREATED:  { icon: '💬', color: '#8b5cf6' },
  REPLY_ADDED:         { icon: '↩️', color: '#f59e0b' },
};

/* ════════════════════════════════════════════════════════
   INIT / AUTH
════════════════════════════════════════════════════════ */
let authMode = 'login'; // 'login' or 'register'

document.getElementById('password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleAuth();
});

document.getElementById('show-login').addEventListener('click', () => setAuthMode('login'));
document.getElementById('show-register').addEventListener('click', () => setAuthMode('register'));
document.getElementById('auth-submit-btn').addEventListener('click', handleAuth);

function setAuthMode(mode) {
  authMode = mode;
  const toggle = document.getElementById('auth-toggle');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitText = document.getElementById('submit-text');
  const loginBtn = document.getElementById('show-login');
  const registerBtn = document.getElementById('show-register');

  if (mode === 'login') {
    toggle.classList.remove('register-mode');
    title.textContent = 'Welcome back';
    subtitle.textContent = 'Sign in to your account';
    submitText.textContent = 'Sign In';
    loginBtn.classList.add('active');
    registerBtn.classList.remove('active');
  } else {
    toggle.classList.add('register-mode');
    title.textContent = 'Create account';
    subtitle.textContent = 'Join the collaborative community';
    submitText.textContent = 'Register';
    registerBtn.classList.add('active');
    loginBtn.classList.remove('active');
  }
}

async function handleAuth() {
  if (authMode === 'login') await login();
  else await register();
}

async function login() {
  const username = document.getElementById('username-input').value.trim();
  const password = document.getElementById('password-input').value.trim();
  if (!username || !password) { showToast('Please enter username and password', 'error'); return; }
  
  const res = await apiFetch('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  
  if (res.error) {
    showToast(res.error, 'error');
    return;
  }
  
  currentUser = res.username;
  completeLogin();
}

async function register() {
  const username = document.getElementById('username-input').value.trim();
  const password = document.getElementById('password-input').value.trim();
  if (!username || !password) { showToast('Please enter username and password', 'error'); return; }
  
  const res = await apiFetch('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
  
  if (res.error) {
    showToast(res.error, 'error');
    return;
  }
  
  currentUser = res.username;
  showToast('Account created successfully! You are now signed up.', 'success');
  completeLogin();
}

function completeLogin() {
  document.getElementById('login-modal').classList.add('hidden');
  document.getElementById('nav-username').textContent = currentUser;
  const avatar = document.getElementById('nav-avatar');
  avatar.textContent = currentUser.charAt(0).toUpperCase();
  loadDocuments();
  loadHistory();
  showToast(`Logged in as ${currentUser}! 👋`, 'success');
}

/* ════════════════════════════════════════════════════════
   SOCKET.IO
════════════════════════════════════════════════════════ */
socket.on('connect', () => {
  document.getElementById('connection-dot').classList.remove('offline');
  document.getElementById('connection-label').textContent = 'Live';
});
socket.on('disconnect', () => {
  document.getElementById('connection-dot').classList.add('offline');
  document.getElementById('connection-label').textContent = 'Offline';
});

socket.on('document:new', doc => {
  addDocToSidebar(doc);
  updateDocCount();
  showToast(`📄 "${doc.originalName}" uploaded by ${doc.uploadedBy}`, 'info');
});

socket.on('document:deleted', ({ id }) => {
  document.getElementById(`doc-item-${id}`)?.remove();
  updateDocCount();
  if (currentDoc?._id === id) {
    currentDoc = null;
    showPlaceholder();
    renderAnnotationPanel([]);
  }
});

socket.on('annotation:new', ann => {
  if (currentDoc && ann.documentId === currentDoc._id) {
    annotations.push(ann);
    renderDoc(currentDoc);
    renderAnnotationPanel(annotations);
    showToast(`💬 New comment by ${ann.author}`, 'info');
  }
});

socket.on('annotation:updated', ann => {
  if (currentDoc && ann.documentId === currentDoc._id) {
    const idx = annotations.findIndex(a => a._id === ann._id);
    if (idx !== -1) annotations[idx] = ann;
    renderAnnotationPanel(annotations);
    renderDoc(currentDoc);
  }
});

socket.on('history:new', log => {
  historyLogs.unshift(log);
  updateHistoryBadge();
  if (activeTab === 'history') renderHistoryTab();
});

/* ════════════════════════════════════════════════════════
   DOCUMENTS — Load & Sidebar
════════════════════════════════════════════════════════ */
async function loadDocuments() {
  const docs = await apiFetch('/api/documents');
  const list = document.getElementById('doc-list');
  list.innerHTML = '';
  if (!Array.isArray(docs) || docs.length === 0) {
    list.innerHTML = `<div class="sidebar-empty"><div class="empty-icon">📂</div><p>No documents yet.<br/>Upload one to begin.</p></div>`;
    if (docs && docs.error) showToast('Could not load documents: ' + docs.error, 'error');
  } else {
    docs.forEach(addDocToSidebar);
  }
  updateDocCount();
}

function addDocToSidebar(doc) {
  const list = document.getElementById('doc-list');
  // Remove empty state if present
  list.querySelector('.sidebar-empty')?.remove();

  // Avoid duplicates
  if (document.getElementById(`doc-item-${doc._id}`)) return;

  const el = document.createElement('div');
  el.className = 'doc-item';
  el.id = `doc-item-${doc._id}`;
  el.innerHTML = `
    <div class="doc-name" title="${doc.originalName}">📄 ${doc.originalName}</div>
    <div class="doc-meta">
      <span>👤 ${doc.uploadedBy}</span>
      <span>📝 ${doc.wordCount ?? '?'} words</span>
    </div>
    <div class="doc-meta" style="margin-top:2px">
      <span>🕐 ${timeAgo(doc.uploadedAt)}</span>
    </div>`;
  el.addEventListener('click', () => openDocument(doc._id));
  list.prepend(el);
  updateDocCount();
}

function updateDocCount() {
  const count = document.querySelectorAll('.doc-item').length;
  document.getElementById('doc-count').textContent = count;
}

/* ════════════════════════════════════════════════════════
   OPEN DOCUMENT
════════════════════════════════════════════════════════ */
async function openDocument(id) {
  document.querySelectorAll('.doc-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`doc-item-${id}`)?.classList.add('active');

  currentDoc = await apiFetch(`/api/documents/${id}`);
  annotations = await apiFetch(`/api/documents/${id}/annotations`);

  socket.emit('join:document', id);
  renderDoc(currentDoc);
  renderAnnotationPanel(annotations);

  document.getElementById('active-doc-name').textContent = currentDoc.originalName;
  document.getElementById('doc-breadcrumb').style.display = 'flex';
  updateAnnCountBadge();
}

/* ════════════════════════════════════════════════════════
   RENDER DOCUMENT VIEWER
════════════════════════════════════════════════════════ */
function renderDoc(doc) {
  const viewer = document.getElementById('doc-viewer');
  viewer.innerHTML = `
    <div class="viewer-toolbar">
      <div style="font-size:20px">📄</div>
      <div class="doc-title">${doc.originalName}</div>
      <div class="doc-stats">
        <span>📝 ${doc.wordCount} words</span>
        <span>💬 ${annotations.length} annotations</span>
        <span>👤 ${doc.uploadedBy}</span>
      </div>
    </div>
    <div class="doc-content-wrap">
      <div class="doc-content" id="doc-text"></div>
    </div>`;

  const container = document.getElementById('doc-text');
  container.innerHTML = buildHighlightedContent(doc.content, annotations);

  // Click on highlight → focus annotation
  container.querySelectorAll('.annotation-highlight').forEach(span => {
    span.addEventListener('click', e => {
      e.stopPropagation();
      const annId = span.dataset.annId;
      focusAnnotation(annId);
    });
  });

  // Text selection → popup
  container.addEventListener('mouseup', handleTextSelection);
}

function buildHighlightedContent(content, anns) {
  if (!anns.length) return escapeHtml(content);

  // Sort annotations by startOffset, filter valid
  const sorted = [...anns]
    .filter(a => a.startOffset >= 0 && a.endOffset <= content.length && a.startOffset < a.endOffset)
    .sort((a, b) => a.startOffset - b.startOffset);

  let result = '';
  let cursor = 0;

  for (const ann of sorted) {
    if (ann.startOffset < cursor) continue; // skip overlapping
    result += escapeHtml(content.slice(cursor, ann.startOffset));
    const colorKey = ann.color || 'amber';
    const cls = COLOR_MAP[colorKey]?.cls || 'hl-amber';
    result += `<span class="annotation-highlight ${cls}" data-ann-id="${ann._id}" title="${escapeAttr(ann.comment)}">${escapeHtml(content.slice(ann.startOffset, ann.endOffset))}</span>`;
    cursor = ann.endOffset;
  }
  result += escapeHtml(content.slice(cursor));
  return result;
}

/* ════════════════════════════════════════════════════════
   TEXT SELECTION → ANNOTATION POPUP
════════════════════════════════════════════════════════ */
function handleTextSelection() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    hidePopup(); return;
  }

  const selectedText = sel.toString().trim();
  const container = document.getElementById('doc-text');
  if (!container) return;

  // Compute character offsets relative to plain text
  const range = sel.getRangeAt(0);
  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const startOffset = preRange.toString().length;
  const endOffset = startOffset + selectedText.length;

  selection = { start: startOffset, end: endOffset, text: selectedText };

  // Position popup near selection
  const rect = range.getBoundingClientRect();
  const popup = document.getElementById('selection-popup');
  popup.style.display = 'block';
  popup.style.top = `${window.scrollY + rect.bottom + 10}px`;
  popup.style.left = `${Math.min(rect.left, window.innerWidth - 300)}px`;

  document.getElementById('sel-preview').textContent = `"${selectedText.substring(0, 60)}${selectedText.length > 60 ? '…' : ''}"`;
  document.getElementById('ann-comment-input').value = '';
  document.getElementById('ann-comment-input').focus();
}

function hidePopup() {
  document.getElementById('selection-popup').style.display = 'none';
}

document.getElementById('cancel-popup').addEventListener('click', hidePopup);

document.getElementById('submit-ann').addEventListener('click', async () => {
  if (!currentDoc) return;
  const comment = document.getElementById('ann-comment-input').value.trim();
  if (!comment) { showToast('Please write a comment', 'error'); return; }
  if (!selection.text) { showToast('No text selected', 'error'); return; }

  const btn = document.getElementById('submit-ann');
  btn.textContent = '…'; btn.disabled = true;

  const ann = await apiFetch(`/api/documents/${currentDoc._id}/annotations`, {
    method: 'POST',
    body: JSON.stringify({
      startOffset: selection.start,
      endOffset: selection.end,
      selectedText: selection.text,
      comment,
      author: currentUser,
      color: selectedColor
    })
  });

  btn.textContent = 'Add Comment'; btn.disabled = false;
  if (ann && !ann.error) {
    annotations.push(ann);
    renderDoc(currentDoc);
    renderAnnotationPanel(annotations);
    hidePopup();
    window.getSelection()?.removeAllRanges();
    showToast('Comment added ✓', 'success');
    updateAnnCountBadge();
  }
});

// Color picker
document.getElementById('color-picker').addEventListener('click', e => {
  const dot = e.target.closest('.color-dot');
  if (!dot) return;
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
  dot.classList.add('selected');
  selectedColor = dot.dataset.color;
});

/* ════════════════════════════════════════════════════════
   ANNOTATION PANEL
════════════════════════════════════════════════════════ */
function renderAnnotationPanel(anns) {
  updateAnnCountBadge();
  if (activeTab === 'comments') renderCommentsTab(anns);
}

function renderCommentsTab(anns) {
  const panel = document.getElementById('panel-content');
  if (!currentDoc) {
    panel.innerHTML = `<div class="empty-state"><div class="es-icon">💬</div><p>Select a document to see annotations</p></div>`;
    return;
  }
  if (!anns.length) {
    panel.innerHTML = `<div class="empty-state"><div class="es-icon">💬</div><p>No comments yet.<br/>Select text in the document to annotate.</p></div>`;
    return;
  }

  const sorted = [...anns].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  panel.innerHTML = sorted.map(ann => annotationCardHTML(ann)).join('');

  // Bind card events
  panel.querySelectorAll('.annotation-card').forEach(card => {
    const id = card.dataset.annId;
    card.addEventListener('click', e => {
      if (e.target.closest('button') || e.target.closest('input') || e.target.tagName === 'INPUT') return;
      focusAnnotation(id);
    });
  });

  panel.querySelectorAll('.reply-send').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = btn.dataset.annId;
      const input = panel.querySelector(`.reply-text[data-ann-id="${id}"]`);
      const content = input?.value.trim();
      if (!content) return;
      btn.textContent = '…'; btn.disabled = true;
      const updated = await apiFetch(`/api/annotations/${id}/replies`, {
        method: 'POST',
        body: JSON.stringify({ author: currentUser, content })
      });
      btn.textContent = '↵'; btn.disabled = false;
      if (updated && !updated.error) {
        input.value = '';
        const idx = annotations.findIndex(a => a._id === id);
        if (idx !== -1) annotations[idx] = updated;
        renderCommentsTab(annotations);
      }
    });
  });

  panel.querySelectorAll('.reply-text').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inp.closest('.reply-input-row').querySelector('.reply-send').click();
      }
    });
  });
}

function annotationCardHTML(ann) {
  const colorKey = ann.color || 'amber';
  const hex = COLOR_MAP[colorKey]?.hex || '#f59e0b';
  const repliesHTML = ann.replies?.map(r => `
    <div class="reply-item">
      <div class="reply-avatar">${r.author.charAt(0).toUpperCase()}</div>
      <div class="reply-body">
        <div class="reply-header">
          <span class="reply-author">${escapeHtml(r.author)}</span>
          <span class="reply-time">${timeAgo(r.createdAt)}</span>
        </div>
        <div class="reply-content">${escapeHtml(r.content)}</div>
      </div>
    </div>`).join('') || '';

  return `
  <div class="annotation-card${activeAnnotationId === ann._id ? ' active' : ''}"
       data-ann-id="${ann._id}"
       style="--card-color:${hex}">
    <div class="ann-selected-text">"${escapeHtml(ann.selectedText?.substring(0, 70))}${ann.selectedText?.length > 70 ? '…' : ''}"</div>
    <div class="ann-comment">${escapeHtml(ann.comment)}</div>
    <div class="ann-meta">
      <span class="ann-author">👤 ${escapeHtml(ann.author)}</span>
      <span>· ${timeAgo(ann.createdAt)}</span>
      ${ann.replies?.length ? `<span>· ${ann.replies.length} ${ann.replies.length === 1 ? 'reply' : 'replies'}</span>` : ''}
    </div>
    ${ann.replies?.length ? `<div class="reply-thread">${repliesHTML}</div>` : ''}
    <div class="reply-input-row" style="margin-top:10px">
      <input class="reply-text" data-ann-id="${ann._id}" type="text" placeholder="Reply…" autocomplete="off"/>
      <button class="reply-send" data-ann-id="${ann._id}">↵</button>
    </div>
  </div>`;
}

function focusAnnotation(annId) {
  activeAnnotationId = annId;
  // Scroll to highlight in doc
  const span = document.querySelector(`.annotation-highlight[data-ann-id="${annId}"]`);
  if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Highlight card
  document.querySelectorAll('.annotation-card').forEach(c => c.classList.toggle('active', c.dataset.annId === annId));
  const card = document.querySelector(`.annotation-card[data-ann-id="${annId}"]`);
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateAnnCountBadge() {
  document.getElementById('ann-count-badge').textContent = annotations.length;
}

/* ════════════════════════════════════════════════════════
   HISTORY TAB
════════════════════════════════════════════════════════ */
async function loadHistory() {
  const result = await apiFetch('/api/history?limit=200');
  historyLogs = Array.isArray(result) ? result : [];
  updateHistoryBadge();
  if (activeTab === 'history') renderHistoryTab();
}

function renderHistoryTab() {
  const panel = document.getElementById('panel-content');
  if (!historyLogs.length) {
    panel.innerHTML = `<div class="empty-state"><div class="es-icon">🕐</div><p>No activity yet</p></div>`;
    return;
  }
  panel.innerHTML = historyLogs.map(log => {
    const meta = ACTION_META[log.action] || { icon: '•', color: '#94a3b8' };
    return `
    <div class="history-item">
      <div class="history-icon" style="background:${meta.color}22;color:${meta.color}">${meta.icon}</div>
      <div class="history-body">
        <div class="history-action">${escapeHtml(log.details || log.action)}</div>
        <div class="history-meta">
          <span>👤 ${escapeHtml(log.author)}</span>
          ${log.documentName ? `<span>📄 ${escapeHtml(log.documentName)}</span>` : ''}
          <span>🕐 ${timeAgo(log.timestamp)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function updateHistoryBadge() {
  document.getElementById('history-badge').textContent = historyLogs.length;
}

/* ════════════════════════════════════════════════════════
   PANEL TABS
════════════════════════════════════════════════════════ */
document.querySelectorAll('.panel-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    if (activeTab === 'comments') renderCommentsTab(annotations);
    else renderHistoryTab();
  });
});

// History button in nav → switch to history tab
document.getElementById('history-btn').addEventListener('click', () => {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-history').classList.add('active');
  activeTab = 'history';
  renderHistoryTab();
});

/* ════════════════════════════════════════════════════════
   UPLOAD MODAL
════════════════════════════════════════════════════════ */
document.getElementById('upload-btn').addEventListener('click', () => {
  document.getElementById('upload-modal').classList.remove('hidden');
});
document.getElementById('close-upload').addEventListener('click', () => {
  document.getElementById('upload-modal').classList.add('hidden');
});

/* ════════════════════════════════════════════════════════
   PROFILE MODAL
════════════════════════════════════════════════════════ */
document.querySelector('.nav-user').addEventListener('click', async () => {
  if (!currentUser) return;
  document.getElementById('profile-modal').classList.remove('hidden');
  document.getElementById('profile-name').textContent = currentUser;
  document.getElementById('profile-avatar').textContent = currentUser.charAt(0).toUpperCase();
  
  document.getElementById('profile-docs-count').textContent = '...';
  document.getElementById('profile-anns-count').textContent = '...';
  
  const users = await apiFetch('/api/users');
  if (Array.isArray(users)) {
    const me = users.find(u => u.username === currentUser);
    if (me) {
      document.getElementById('profile-docs-count').textContent = me.docsCount || 0;
      document.getElementById('profile-anns-count').textContent = me.annotationsCount || 0;
    } else {
      document.getElementById('profile-docs-count').textContent = 0;
      document.getElementById('profile-anns-count').textContent = 0;
    }
  }
});

document.getElementById('close-profile').addEventListener('click', () => {
  document.getElementById('profile-modal').classList.add('hidden');
});

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
});

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});

async function uploadFile(file) {
  const allowed = ['.txt', '.md'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!allowed.includes(ext)) { showToast('Only .txt and .md files supported', 'error'); return; }

  const progress = document.getElementById('upload-progress');
  const fill = document.getElementById('progress-fill');
  const status = document.getElementById('upload-status');
  progress.style.display = 'block';

  // Animate progress bar
  let pct = 0;
  const interval = setInterval(() => {
    pct = Math.min(pct + 8, 85);
    fill.style.width = pct + '%';
  }, 100);

  status.textContent = `Uploading "${file.name}"…`;

  const formData = new FormData();
  formData.append('document', file);
  formData.append('author', currentUser);

  try {
    const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
    const doc = await res.json();
    clearInterval(interval);

    if (doc.error) { showToast(doc.error, 'error'); }
    else {
      fill.style.width = '100%';
      status.textContent = '✓ Upload complete!';
      setTimeout(() => {
        document.getElementById('upload-modal').classList.add('hidden');
        progress.style.display = 'none';
        fill.style.width = '0%';
        fileInput.value = '';
        openDocument(doc._id);
      }, 800);
    }
  } catch (err) {
    clearInterval(interval);
    showToast('Upload failed — is the server running?', 'error');
    progress.style.display = 'none';
    fill.style.width = '0%';
  }
}

/* ════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════ */
async function apiFetch(url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...opts.headers },
      ...opts
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { error: errData.error || `Server error ${res.status}` };
    }
    return await res.json();
  } catch (err) {
    showToast('Cannot reach server. Is it running?', 'error');
    return { error: err.message };
  }
}

function showPlaceholder() {
  document.getElementById('doc-viewer').innerHTML = `
    <div class="doc-placeholder">
      <div class="ph-icon">📄</div>
      <h2>Select a document</h2>
      <p>Choose a document from the sidebar, or upload a new one to start annotating.</p>
    </div>`;
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function escapeHtml(str = '') {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escapeAttr(str = '') {
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function timeAgo(date) {
  const secs = Math.floor((Date.now() - new Date(date)) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs/60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs/3600)}h ago`;
  return `${Math.floor(secs/86400)}d ago`;
}

// Close popup on outside click
document.addEventListener('mousedown', e => {
  if (!document.getElementById('selection-popup').contains(e.target) &&
      !document.getElementById('doc-text')?.contains(e.target)) {
    hidePopup();
  }
});
