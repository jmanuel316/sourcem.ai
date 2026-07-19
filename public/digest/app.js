// SourcemAI Sales Digest PWA — app.js
// Handles: rep selection, digest fetching, action status, push notifications, SW registration.

const API_BASE = '';
let currentRepId = null;
let allEntries = [];
let activeFilter = 'all';
let selectedAccountIds = new Set();
let pendingChannel = null;

// === INIT ===
(async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/digest/sw.js');
      console.log('[digest] SW registered', reg.scope);
    } catch (e) {
      console.warn('[digest] SW registration failed:', e);
    }
  }

  // Online/offline detection
  window.addEventListener('online', () => {
    document.getElementById('offline-banner').classList.remove('visible');
  });
  window.addEventListener('offline', () => {
    document.getElementById('offline-banner').classList.add('visible');
  });

  // Auth: try to get current rep from session
  const rep = await getMe();
  if (rep) {
    currentRepId = rep.id;
    await showDigestScreen();
    await loadDigest();
    await checkPushPermission();
    await refreshAlertBadge();
    setInterval(refreshAlertBadge, 60000);
  } else {
    showLoginScreen();
  }

  // Filter bar
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderCards();
    });
  });

  // Refresh button
  document.getElementById('btn-refresh').addEventListener('click', loadDigest);

  // Export
  document.getElementById('btn-export').addEventListener('click', () => {
    window.location.href = `${API_BASE}/api/digest/export`;
  });

  // Sequence button + modal wiring
  document.getElementById('btn-sequence').addEventListener('click', openSequenceModal);
  document.getElementById('sequence-cancel-btn').addEventListener('click', closeSequenceModal);
  document.getElementById('sequence-confirm-btn').addEventListener('click', confirmSequence);
  document.querySelectorAll('.sequence-channel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sequence-channel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      pendingChannel = btn.dataset.channel;
      updateSequenceConfirmState();
    });
  });

  // Delegated checkbox handler — works across renders/filters
  document.getElementById('cards-list').addEventListener('change', (e) => {
    const cb = e.target.closest('input[type="checkbox"][data-account-id]');
    if (!cb) return;
    const accountId = parseInt(cb.dataset.accountId, 10);
    if (!accountId) return;
    toggleSelection(accountId, cb.checked);
  });

  // Modal close
  document.getElementById('modal-overlay').addEventListener('click', closeModal);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  // Push banner buttons
  document.getElementById('btn-enable-push').addEventListener('click', enablePush);
  document.getElementById('btn-dismiss-push').addEventListener('click', dismissPush);
})();

async function getMe() {
  try {
    const res = await fetch(`${API_BASE}/api/reps/me`);
    if (res.ok) return await res.json();
    return null;
  } catch { return null; }
}

function showLoginScreen() {
  document.getElementById('rep-select-screen').style.display = 'flex';
  document.getElementById('digest-screen').style.display = 'none';
  document.getElementById('push-banner').classList.remove('visible');
  document.getElementById('rep-list').innerHTML = `
    <div style="text-align:center;padding:20px">
      <p style="color:var(--fg-muted);font-size:14px;margin-bottom:16px">Sign in to view your digest</p>
      <a href="/auth/login" style="display:inline-block;padding:10px 24px;background:var(--accent);color:#1a2744;font-weight:600;border-radius:8px;text-decoration:none;font-size:14px">Sign in</a>
    </div>
  `;
}

// === REPs SELECT SCREEN ===
async function loadRepSelect() {
  document.getElementById('rep-select-screen').style.display = 'flex';
  document.getElementById('digest-screen').style.display = 'none';
  document.getElementById('push-banner').classList.remove('visible');

  try {
    const res = await fetch(`${API_BASE}/api/reps`);
    const data = await res.json();
    const list = document.getElementById('rep-list');
    list.innerHTML = '';

    if (!data.reps || data.reps.length === 0) {
      list.innerHTML = '<div style="text-align:center;color:var(--fg-dim);font-size:14px;padding:20px">No reps found. Add a rep first.</div>';
      return;
    }

    for (const rep of data.reps) {
      const item = document.createElement('div');
      item.className = 'rep-item';
      item.innerHTML = `
        <div class="rep-avatar">${rep.name.charAt(0).toUpperCase()}</div>
        <div>
          <div class="rep-name">${escHtml(rep.name)}</div>
          <div class="rep-email">${escHtml(rep.email)}</div>
        </div>
      `;
      item.addEventListener('click', () => selectRep(rep.id));
      list.appendChild(item);
    }
  } catch (err) {
    console.error('[digest] Failed to load reps:', err);
    document.getElementById('rep-list').innerHTML = '<div style="text-align:center;color:#dc2626;font-size:13px;padding:20px">Failed to load. Check connection.</div>';
  }
}

async function selectRep(repId) {
  currentRepId = repId;
  localStorage.setItem('digest_rep_id', repId);
  await showDigestScreen();
  await loadDigest();
  await checkPushPermission();
}

// === DIGEST SCREEN ===
async function showDigestScreen() {
  document.getElementById('rep-select-screen').style.display = 'none';
  document.getElementById('digest-screen').style.display = 'block';

  // Set date
  const now = new Date();
  const opts = { weekday: 'long', month: 'long', day: 'numeric' };
  document.getElementById('header-date').textContent = now.toLocaleDateString('en-US', opts);
  document.getElementById('greeting-title').textContent = getGreeting(now);

  const rep = await getRepById(currentRepId);
  if (rep) {
    document.getElementById('greeting-sub').textContent = `Hello, ${rep.name.split(' ')[0]} — here's your digest for today.`;
  }
}

// === LOAD DIGEST ===
async function loadDigest() {
  if (!currentRepId) return;

  showLoading(true);

  try {
    // Try ranked accounts endpoint — rep scoped by session cookie
    const res = await fetch(`${API_BASE}/api/digest/ranked?min_score=0&limit=30`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    allEntries = (data.accounts || []).map(acc => ({
      id: acc.id,
      account_id: acc.id,
      company_name: acc.company_name,
      domain: acc.domain,
      contact_id: acc.contact_id,
      contact_name: acc.contact_name || '',
      contact_title: acc.contact_title || '',
      contact_email: acc.contact_email || '',
      score: acc.score || 0,
      priority: acc.priority || 'medium',
      why_one_liner: buildWhyFromAccount(acc),
      recommended_action: buildActionFromAccount(acc),
      action_status: 'pending',
      top_signals: acc.top_signals || [],
      funding_score: acc.funding_score || 0,
      hiring_score: acc.hiring_score || 0,
      crm_score: acc.crm_score || 0,
      email_score: acc.email_score || 0,
      sent_count: acc.sent_count || 0,
      replies_count: acc.replies_count || 0,
      reply_rate: acc.reply_rate === undefined ? null : (acc.reply_rate === null ? null : parseFloat(acc.reply_rate)),
      last_reply_date: acc.last_reply_date || null,
      last_reply_category: acc.last_reply_category || null,
      interested_replies_count: acc.interested_replies_count || 0,
      opens: acc.opens || 0,
      clicks: acc.clicks || 0,
      sequence_status: acc.sequence_status || null,
      sequence_channel: acc.sequence_channel || null,
      sequence_updated_at: acc.sequence_updated_at || null,
    }));
    renderCards();
    await loadSequenceSummary();
  } catch (err) {
    console.error('[digest] loadDigest error:', err);
    showEmpty('digest');
  }
}

// === SEQUENCE SUMMARY ===
async function loadSequenceSummary() {
  const panel = document.getElementById('health-panel');
  if (!panel) return;
  try {
    const res = await fetch(`${API_BASE}/api/sequences/summary`);
    if (!res.ok) throw new Error('summary fetch failed');
    const s = await res.json();
    const totalSent = s.total_sent || 0;
    const dispatchLabel = s.total_dispatched ? ` of ${s.total_dispatched}` : '';
    document.getElementById('health-sent').textContent = `${totalSent}${dispatchLabel}`;
    document.getElementById('health-delivery').textContent = `${s.delivery_rate}%`;
    document.getElementById('health-reply').textContent = `${s.reply_rate}%`;
    document.getElementById('health-failed').textContent = s.failed_count || 0;
    panel.style.display = '';
  } catch (err) {
    panel.style.display = 'none';
  }
}

// === RENDER ===
function renderCards() {
  const filtered = allEntries.filter(e => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'high') return e.priority === 'high';
    if (activeFilter === 'medium') return e.priority === 'medium';
    if (activeFilter === 'actioned') return e.action_status !== 'pending';
    return true;
  });

  const list = document.getElementById('cards-list');
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');

  if (filtered.length === 0 && allEntries.length === 0) {
    showEmpty('no-data');
    return;
  }

  loading.style.display = 'none';
  empty.style.display = 'none';
  list.style.display = 'flex';

  if (filtered.length === 0) {
    list.innerHTML = '<div style="text-align:center;color:var(--fg-dim);font-size:13px;padding:24px">No accounts match this filter.</div>';
    return;
  }

  list.innerHTML = filtered.map((entry, idx) => {
    const actioned = entry.action_status === 'actioned';
    const scheduled = entry.action_status === 'scheduled';
    const badgeClass = entry.priority === 'high' ? 'high' : entry.priority === 'medium' ? 'medium' : 'low';
    const checked = selectedAccountIds.has(entry.account_id);

    return `
    <div class="account-card has-checkbox${entry.score > 0 ? ' scored' : ''}" data-entry-id="${entry.id}" data-account-id="${entry.account_id}">
      <label class="card-checkbox${checked ? ' checked' : ''}">
        <input type="checkbox" data-account-id="${entry.account_id}"${checked ? ' checked' : ''} aria-label="Select ${escHtml(entry.company_name)}">
      </label>
      <div class="card-top">
        <div class="card-rank">${idx + 1}</div>
        <div class="card-main">
          <div class="card-header-row">
            <div class="company-name">${escHtml(entry.company_name)}</div>
            <div class="card-header-badges">
              ${formatEngagementBadge(entry)}
              ${formatSequenceBadge(entry)}
              <span class="priority-badge ${badgeClass}">${entry.priority}</span>
            </div>
          </div>
          ${entry.contact_name ? `
          <div class="contact-row">
            <span class="contact-name">${escHtml(entry.contact_name)}</span>
            ${entry.contact_title ? `<span class="contact-sep">·</span><span class="contact-title">${escHtml(entry.contact_title)}</span>` : ''}
          </div>` : ''}
          <div class="signal-row">
            <span class="signal-score">${entry.score}pts</span>
            <span class="why-text">${escHtml(entry.why_one_liner || '')}</span>
          </div>
        </div>
      </div>
      <div class="card-divider"></div>
      <div class="card-action-row">
        <div class="recommended-action">${escHtml(entry.recommended_action || '')}</div>
        <div class="action-buttons">
          <button class="btn-action btn-actioned${actioned ? ' selected' : ''}"
            ${actioned ? 'disabled' : ''}
            onclick="markAction(${entry.id}, 'actioned')">
            ${actioned ? checkIcon() : checkIcon()} ${actioned ? 'Actioned' : 'Action'}
          </button>
          <button class="btn-action btn-scheduled${scheduled ? ' selected' : ''}"
            ${scheduled ? 'disabled' : ''}
            onclick="markAction(${entry.id}, 'scheduled')">
            ${scheduled ? calendarFilledIcon() : calendarIcon()} ${scheduled ? 'Scheduled' : 'Schedule'}
          </button>
          <button class="btn-action" style="flex:0;padding:9px 10px;background:transparent;color:var(--fg-dim);border:1.5px solid var(--border)"
            onclick="showDetail(${entry.id})" title="View details">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// === MARK ACTION ===
async function markAction(entryId, status) {
  const entry = allEntries.find(e => e.id === entryId);
  if (!entry) return;
  entry.action_status = status;

  // Update card buttons
  const card = document.querySelector(`[data-entry-id="${entryId}"]`);
  if (card) {
    const actionedBtn = card.querySelector('.btn-actioned');
    const scheduledBtn = card.querySelector('.btn-scheduled');
    if (actionedBtn) {
      actionedBtn.classList.toggle('selected', status === 'actioned');
      actionedBtn.disabled = status === 'actioned';
      actionedBtn.innerHTML = `${checkIcon()} ${status === 'actioned' ? 'Actioned' : 'Action'}`;
    }
    if (scheduledBtn) {
      scheduledBtn.classList.toggle('selected', status === 'scheduled');
      scheduledBtn.disabled = status === 'scheduled';
      scheduledBtn.innerHTML = `${status === 'scheduled' ? calendarFilledIcon() : calendarIcon()} ${status === 'scheduled' ? 'Scheduled' : 'Schedule'}`;
    }
  }

  // Persist via API (fire and forget — optimistic update)
  fetch(`${API_BASE}/api/digest/${entryId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  }).catch(err => console.warn('[digest] Failed to persist action:', err));
}

// === DETAIL MODAL ===
async function showDetail(entryId) {
  const entry = allEntries.find(e => e.id === entryId);
  if (!entry) return;

  document.getElementById('modal-company').textContent = entry.company_name;
  document.getElementById('modal-contact').textContent =
    entry.contact_name ? `${entry.contact_name}${entry.contact_title ? ' — ' + entry.contact_title : ''}` : 'No primary contact';
  document.getElementById('modal-score').textContent = `${entry.score} total signal points`;
  document.getElementById('modal-why').textContent = entry.why_one_liner || '—';
  document.getElementById('modal-action').textContent = entry.recommended_action || '—';

  // Email engagement section
  const engagementSection = document.getElementById('modal-engagement-section');
  const engagementEl = document.getElementById('modal-engagement');
  const engagementText = buildEngagementDetailText(entry);
  if (engagementText) {
    engagementEl.textContent = engagementText;
    engagementSection.style.display = '';
  } else {
    engagementSection.style.display = 'none';
  }

  const signalsEl = document.getElementById('modal-signals');
  const signalChips = [];
  if (entry.funding_score > 0) signalChips.push(`Funding (${entry.funding_score}pts)`);
  if (entry.hiring_score > 0) signalChips.push(`Hiring (${entry.hiring_score}pts)`);
  if (entry.crm_score > 0) signalChips.push(`CRM Activity (${entry.crm_score}pts)`);
  if (entry.email_score > 0) signalChips.push(`Email Engagement (${entry.email_score}pts)`);
  signalsEl.innerHTML = signalChips.length
    ? signalChips.map(s => `<span class="signal-chip">${escHtml(s)}</span>`).join('')
    : '<span style="font-size:13px;color:var(--fg-dim)">No active signals</span>';

  document.getElementById('modal-overlay').classList.add('visible');
  document.getElementById('detail-modal').classList.add('visible');

  // Reset events section to loading state
  document.getElementById('modal-events').innerHTML =
    '<div class="signal-event-loading">Loading events…</div>';

  try {
    const res = await fetch(`${API_BASE}/api/digest/accounts/${entry.account_id}/signals`);
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    document.getElementById('modal-events').innerHTML = renderSignalEvents(data.signals, data.score);
  } catch {
    document.getElementById('modal-events').innerHTML =
      '<div class="signal-event-loading">Could not load signal events.</div>';
  }
}

function renderSignalEvents(signalRows, score) {
  if (!signalRows || signalRows.length === 0) {
    return '<div class="signal-event-loading">No signal events on record.</div>';
  }

  const WEIGHTS = { funding: 3, hiring: 2, crm_activity: 2, news: 2, email: 2 };
  const TYPE_LABELS = { funding: 'Funding', hiring: 'Hiring', crm_activity: 'CRM', news: 'News', email: 'Email' };

  return signalRows.map(sig => {
    const weight = WEIGHTS[sig.signal_type] || 1;
    const label = TYPE_LABELS[sig.signal_type] || sig.signal_type;
    const dateStr = sig.signal_date
      ? new Date(sig.signal_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '—';
    return `
      <div class="signal-event-row">
        <div class="signal-event-top">
          <span class="signal-type-badge type-${escHtml(sig.signal_type)}">${escHtml(label)}</span>
          <span class="signal-event-pts">+${weight}pt${weight !== 1 ? 's' : ''} each</span>
        </div>
        <div class="signal-event-title">${escHtml(sig.title)}</div>
        <div class="signal-event-meta">
          <span>${escHtml(sig.source)}</span>
          <span class="signal-event-sep">·</span>
          <span>${dateStr}</span>
        </div>
      </div>`;
  }).join('');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  document.getElementById('detail-modal').classList.remove('visible');
}

// === SELECTION / SEQUENCE ===
function toggleSelection(accountId, checked) {
  if (checked) selectedAccountIds.add(accountId);
  else selectedAccountIds.delete(accountId);

  // Sync visual state across re-rendered cards (checkbox may exist in multiple
  // cards if the same account_id appears in different filter views).
  document.querySelectorAll(`.card-checkbox input[data-account-id="${accountId}"]`).forEach(cb => {
    cb.checked = checked;
    cb.closest('.card-checkbox').classList.toggle('checked', checked);
  });

  const btn = document.getElementById('btn-sequence');
  btn.disabled = selectedAccountIds.size === 0;
}

function openSequenceModal() {
  if (selectedAccountIds.size === 0) return;
  pendingChannel = null;
  document.querySelectorAll('.sequence-channel-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sequence-modal-count').textContent =
    `${selectedAccountIds.size} account${selectedAccountIds.size === 1 ? '' : 's'} selected`;
  updateSequenceConfirmState();
  document.getElementById('modal-overlay').classList.add('visible');
  document.getElementById('sequence-modal').classList.add('visible');
}

function closeSequenceModal() {
  document.getElementById('modal-overlay').classList.remove('visible');
  document.getElementById('sequence-modal').classList.remove('visible');
}

function updateSequenceConfirmState() {
  const btn = document.getElementById('sequence-confirm-btn');
  btn.disabled = !(pendingChannel && selectedAccountIds.size > 0);
}

async function confirmSequence() {
  if (!pendingChannel || selectedAccountIds.size === 0) return;
  const btn = document.getElementById('sequence-confirm-btn');
  btn.disabled = true;
  const originalLabel = btn.textContent;
  btn.textContent = 'Pushing…';

  try {
    const res = await fetch(`${API_BASE}/api/digest/sequence`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_ids: Array.from(selectedAccountIds),
        channel: pendingChannel,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'sent') {
      showToast(`Pushed ${selectedAccountIds.size} account${selectedAccountIds.size === 1 ? '' : 's'} to ${pendingChannel === 'cold_email' ? 'cold email' : 'LinkedIn'}`, false);
      selectedAccountIds.clear();
      document.getElementById('btn-sequence').disabled = true;
      renderCards();
      closeSequenceModal();
    } else {
      const msg = data.error || `Webhook returned ${res.status}`;
      showToast(`Sequence push failed: ${msg}`, true);
    }
  } catch (err) {
    console.warn('[digest] confirmSequence failed:', err);
    showToast('Sequence push failed — check connection.', true);
  } finally {
    btn.textContent = originalLabel;
    updateSequenceConfirmState();
  }
}

let toastTimer = null;
function showToast(message, isError) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.toggle('error', !!isError);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

// === ALERT BADGE ===
async function refreshAlertBadge() {
  if (!currentRepId) return;
  try {
    const res = await fetch(`${API_BASE}/api/alerts/badge`);
    if (!res.ok) return;
    const { count } = await res.json();
    updateAlertBadge(count);
  } catch { /* noop */ }
}

function updateAlertBadge(count) {
  const badge = document.getElementById('alert-badge');
  if (!badge) return;
  if (!count || count <= 0) {
    badge.style.display = 'none';
  } else {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'block';
  }
}

// === PUSH ===
async function checkPushPermission() {
  const banner = document.getElementById('push-banner');
  if (!('Notification' in window)) return;
  if (!currentRepId) return;

  const stored = localStorage.getItem('push_dismissed');
  if (stored) return;
  if (Notification.permission === 'granted') return;

  // Show the banner after a short delay (don't interrupt first paint)
  setTimeout(() => banner.classList.add('visible'), 1200);
}

async function enablePush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qB35pISsCD7FNkYksyqAQ'),
    });

    // Send sub to backend
    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rep_id: currentRepId,
        endpoint: sub.endpoint,
        p256dh: sub.getKey('p256dh'),
        auth: sub.getKey('auth'),
      }),
    });

    document.getElementById('push-banner').classList.remove('visible');
  } catch (err) {
    console.warn('[digest] Push subscription failed:', err);
  }
}

function dismissPush() {
  localStorage.setItem('push_dismissed', '1');
  document.getElementById('push-banner').classList.remove('visible');
}

// === HELPERS ===
function getGreeting(date) {
  const h = date.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

async function getRepById(id) {
  try {
    const res = await fetch(`${API_BASE}/api/reps/${id}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

function showLoading(v) {
  document.getElementById('loading-state').style.display = v ? 'block' : 'none';
  document.getElementById('cards-list').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
}

function showEmpty(type) {
  document.getElementById('loading-state').style.display = 'none';
  document.getElementById('cards-list').style.display = 'none';
  const empty = document.getElementById('empty-state');
  empty.style.display = 'block';
  if (type === 'no-data') {
    empty.querySelector('.empty-title').textContent = 'No accounts yet';
    empty.querySelector('.empty-desc').textContent = 'Connect a CRM or add accounts to start receiving recommendations.';
  }
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatEngagementBadge(entry) {
  const replyRate = typeof entry.reply_rate === 'number' ? entry.reply_rate : null;
  const hasReplies = replyRate !== null && replyRate > 0;
  if (hasReplies) {
    const pct = Math.round(replyRate * 100);
    return `<span class="engagement-badge" title="Active engagement">Engaged · ${pct}% reply</span>`;
  }
  if (entry.last_reply_date) {
    const dateStr = new Date(entry.last_reply_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<span class="engagement-badge muted" title="Last reply date">Last reply ${escHtml(dateStr)}</span>`;
  }
  return '';
}

const SEQUENCE_CHANNEL_LABELS = { cold_email: 'Email', linkedin: 'LinkedIn' };

function sequenceRelativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const today = startOfDay(now);
  const t = startOfDay(then);
  const diffDays = Math.round((today - t) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 30) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatSequenceBadge(entry) {
  const status = entry.sequence_status;
  if (!status) return '';
  const label = SEQUENCE_CHANNEL_LABELS[entry.sequence_channel] || 'Sequence';
  const when = sequenceRelativeTime(entry.sequence_updated_at);
  const whenPart = when ? ` · ${when}` : '';
  const titleAttr = status === 'sent'
    ? 'Outreach sequence dispatched successfully'
    : 'Outreach sequence dispatch failed';
  return `<span class="sequence-badge ${status}" title="${titleAttr}">${status === 'sent' ? 'Sent' : 'Failed'} · ${escHtml(label)}${escHtml(whenPart)}</span>`;
}

function buildEngagementDetailText(entry) {
  const replyRate = typeof entry.reply_rate === 'number' ? entry.reply_rate : null;
  if (replyRate === null && !entry.last_reply_date) return null;
  const parts = [];
  if (replyRate !== null) {
    const pct = Math.round(replyRate * 100);
    parts.push(`${pct}% reply rate (${entry.replies_count}/${entry.sent_count || 0})`);
  } else if (entry.sent_count > 0) {
    parts.push(`${entry.sent_count} sent, no replies`);
  }
  if (entry.last_reply_date) {
    const dateStr = new Date(entry.last_reply_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    parts.push(`Last reply ${dateStr}${entry.last_reply_category ? ' (' + entry.last_reply_category + ')' : ''}`);
  }
  if (entry.interested_replies_count > 0) {
    parts.push(`${entry.interested_replies_count} interested repl${entry.interested_replies_count === 1 ? 'y' : 'ies'}`);
  }
  return parts.join(' · ');
}

function buildWhyFromAccount(acc) {
  const parts = [];
  if (acc.funding_score > 0) parts.push(`Funding (${acc.funding_score}pts)`);
  if (acc.hiring_score > 0) parts.push(`GTM hiring (${acc.hiring_score}pts)`);
  if (acc.crm_score > 0) parts.push(`CRM activity (${acc.crm_score}pts)`);
  if (acc.email_score > 0) parts.push(`Email engagement (${acc.email_score}pts)`);
  if (acc.email_score > 0 && acc.replies_count > 0) {
    parts.push(`${acc.replies_count} ${acc.replies_count === 1 ? 'reply' : 'replies'}`);
  }
  if (!parts.length) return 'Elevated intent signals today.';
  return parts.join(' · ');
}

function buildActionFromAccount(acc) {
  if (acc.funding_score >= 3) return 'Follow up — funding round means new budget allocation.';
  if (acc.hiring_score >= 2) return 'Reach out — expanding GTM team, likely buying enablement.';
  if (acc.crm_score >= 2) return 'Check in — CRM activity suggests decision process active.';
  if (acc.email_score >= 3) return 'Reach out — prospect engaged with recent email.';
  if (acc.score >= 2) return 'Send outreach — account shows buying intent signals.';
  return 'Review account — minor activity detected.';
}

function checkIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
}

function calendarIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
}

function calendarFilledIcon() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
}

// VAPID key helper
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Expose for onclick handlers
window.markAction = markAction;
window.showDetail = showDetail;
window.toggleSelection = toggleSelection;
window.confirmSequence = confirmSequence;