(function () {
  const FRAMES = [
    {
      label: 'Signal Feed',
      html: `<div class="mockup-window-header">
  <div class="mockup-window-dots"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span></div>
  <span class="mockup-window-title">SourcemAI</span>
</div>
<div class="mockup-window-body">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <span style="font-family:var(--font-head);font-size:0.8rem;font-weight:700;color:var(--fg);">Signal Feed</span>
    <span style="font-size:0.7rem;color:var(--accent-dim);font-weight:600;">14 signals · tonight</span>
  </div>
  <table class="prospect-table">
    <thead><tr><th>Company</th><th>Signal</th><th>Source</th><th>Score</th></tr></thead>
    <tbody>
      <tr><td class="company">Velocity Labs</td><td class="name">$18M Series A</td><td class="title">Funding</td><td><span class="score-badge">+3</span></td></tr>
      <tr><td class="company">Acme Agency</td><td class="name">3 GTM hires</td><td class="title">Hiring</td><td><span class="score-badge">+2</span></td></tr>
      <tr><td class="company">Bold Finance</td><td class="name">CRM活跃</td><td class="title">CRM</td><td><span class="score-badge">+2</span></td></tr>
      <tr><td class="company">CloudNine</td><td class="name">$42M Series B</td><td class="title">Funding</td><td><span class="score-badge">+3</span></td></tr>
      <tr><td class="company">Nova Systems</td><td class="name">5 SDR hires</td><td class="title">Hiring</td><td><span class="score-badge">+2</span></td></tr>
    </tbody>
  </table>
</div>`,
    },
    {
      label: 'Priority Rankings',
      html: `<div class="mockup-window-header">
  <div class="mockup-window-dots"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span></div>
  <span class="mockup-window-title">SourcemAI</span>
</div>
<div class="mockup-window-body">
  <div class="personalizing-layout">
    <div class="personalizing-sidebar">
      <div class="personalizing-tab active">Priority</div>
      <div class="personalizing-tab">Signals</div>
      <div class="personalizing-tab">History</div>
    </div>
    <div class="personalizing-main">
      <div class="personalizing-header">Account Rankings</div>
      <div class="compose-card" style="padding:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="background:var(--accent);color:white;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:10px;">#1</div>
            <span style="font-weight:700;font-size:0.8rem;">CloudNine</span>
          </div>
          <span style="color:var(--accent);font-size:0.75rem;font-weight:700;">7 pts</span>
        </div>
        <div style="font-size:0.72rem;color:var(--fg-muted);margin-bottom:4px;">$42M Series B · 8 SDR hires</div>
        <div style="font-size:0.72rem;color:var(--accent-dim);">Recommended: Call the VP Sales</div>
      </div>
      <div class="compose-card" style="padding:10px;opacity:0.7;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="background:var(--accent-dim);color:white;font-size:0.65rem;font-weight:700;padding:2px 6px;border-radius:10px;">#2</div>
            <span style="font-weight:700;font-size:0.8rem;">Velocity Labs</span>
          </div>
          <span style="color:var(--accent);font-size:0.75rem;font-weight:700;">5 pts</span>
        </div>
        <div style="font-size:0.72rem;color:var(--fg-muted);margin-bottom:4px;">$18M Series A · CRM活跃</div>
        <div style="font-size:0.72rem;color:var(--fg-muted);">Recommended: Intro email</div>
      </div>
    </div>
  </div>
</div>`,
    },
    {
      label: 'Morning Digest',
      html: `<div class="mockup-window-header">
  <div class="mockup-window-dots"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span></div>
  <span class="mockup-window-title">SourcemAI</span>
</div>
<div class="mockup-window-body">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <span style="font-family:var(--font-head);font-size:0.8rem;font-weight:700;color:var(--fg);">Your Morning Digest</span>
    <span style="font-size:0.7rem;color:var(--accent-dim);font-weight:600;">6 accounts</span>
  </div>
  <div class="queue-table" style="display:flex;flex-direction:column;gap:6px;">
    <div class="queue-card" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border);background:var(--bg-alt);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight:700;font-size:0.8rem;">CloudNine</span>
        <span style="background:var(--accent);color:white;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:10px;">#1 · 7 pts</span>
      </div>
      <div style="font-size:0.68rem;color:var(--fg-muted);">$42M Series B · 8 SDRs hired</div>
      <div style="font-size:0.68rem;color:var(--accent);">Call the VP Sales this AM</div>
    </div>
    <div class="queue-card" style="padding:8px 10px;border-radius:8px;border:1px solid var(--border);opacity:0.75;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight:700;font-size:0.8rem;">Velocity Labs</span>
        <span style="background:var(--accent-dim);color:white;font-size:0.65rem;font-weight:700;padding:2px 8px;border-radius:10px;">#2 · 5 pts</span>
      </div>
      <div style="font-size:0.68rem;color:var(--fg-muted);">$18M Series A · CRM活跃</div>
      <div style="font-size:0.68rem;color:var(--fg-muted);">Intro email today</div>
    </div>
  </div>
</div>`,
    },
    {
      label: 'Act & Track',
      html: `<div class="mockup-window-header">
  <div class="mockup-window-dots"><span class="dot dot-red"></span><span class="dot dot-yellow"></span><span class="dot dot-green"></span></div>
  <span class="mockup-window-title">SourcemAI</span>
</div>
<div class="mockup-window-body">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
    <span style="font-family:var(--font-head);font-size:0.8rem;font-weight:700;color:var(--fg);">Act &amp; Track</span>
    <span style="font-size:0.7rem;color:var(--fg-muted);font-weight:500;">Learns your preferences</span>
  </div>
  <div class="metrics-grid">
    <div class="metric-card">
      <div class="metric-value">12</div>
      <div class="metric-label">Actioned Today</div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:100%;"></div></div>
    </div>
    <div class="metric-card">
      <div class="metric-value">8</div>
      <div class="metric-label">Called</div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:67%;"></div></div>
    </div>
    <div class="metric-card">
      <div class="metric-value">3</div>
      <div class="metric-label">Replied</div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:25%;"></div></div>
    </div>
    <div class="metric-card">
      <div class="metric-value">→</div>
      <div class="metric-label">Tomorrow's rank</div>
      <div class="metric-bar"><div class="metric-bar-fill" style="width:80%;"></div></div>
    </div>
  </div>
</div>`,
    },
  ];

  let current = 0;
  let paused = false;
  let timer = null;

  function init() {
    const carousel = document.querySelector('.demo-carousel');
    if (!carousel) return;

    // Render dots
    const dotsContainer = carousel.querySelector('.demo-carousel-dots');
    FRAMES.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'demo-dot' + (i === 0 ? ' active' : '');
      dot.dataset.index = i;
      dotsContainer.appendChild(dot);
    });

    // Render frames
    const body = carousel.querySelector('.demo-carousel-body');
    FRAMES.forEach((frame, i) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'demo-mockup' + (i === 0 ? ' active' : '');
      wrapper.innerHTML = frame.html;
      body.appendChild(wrapper);
    });

    // Update footer label
    updateFooter(carousel, 0);

    // Click to pause/resume
    carousel.addEventListener('click', () => {
      paused = !paused;
      carousel.classList.toggle('demo-paused', paused);
      if (!paused) tick(carousel);
    });

    startTimer(carousel);
  }

  function tick(carousel) {
    if (paused) {
      clearInterval(timer);
      timer = null;
      return;
    }
    current = (current + 1) % FRAMES.length;
    setActive(carousel, current);
  }

  function startTimer(carousel) {
    timer = setInterval(() => tick(carousel), 3000);
  }

  function setActive(carousel, index) {
    carousel.querySelectorAll('.demo-mockup').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    carousel.querySelectorAll('.demo-dot').forEach((el, i) => {
      el.classList.toggle('active', i === index);
    });
    updateFooter(carousel, index);
  }

  function updateFooter(carousel, index) {
    const label = carousel.querySelector('.demo-carousel-label');
    if (label) label.textContent = FRAMES[index].label;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
