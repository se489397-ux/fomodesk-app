// FOMO Desk app (STEP 10). Every FOMO link comes from the API (links.py); none is built here.
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const H = new URLSearchParams(location.hash.slice(1));
  if (H.get('t')) { localStorage.setItem('deskToken', H.get('t')); H.delete('t'); history.replaceState(null, '', location.pathname + (H.toString() ? '#' + H : '')); }
  const TOKEN = () => localStorage.getItem('deskToken') || '';
  // Plan B (STEP 4): static app + data files in ONE private gist. The id arrives once as #d=<id> (fragments never reach
  // a server) and is kept in localStorage. Read only: actions go through Telegram.
  if (H.get('d') && /^[0-9a-f]{20,40}$/i.test(H.get('d'))) { localStorage.setItem('deskData', H.get('d')); H.delete('d'); history.replaceState(null, '', location.pathname + (H.toString() ? '#' + H : '')); }
  const DATA = () => localStorage.getItem('deskData') || '';
  const PLAN_B = !!DATA() && !TOKEN();
  const GIST_OWNER = 'se489397-ux', TG = 'https://t.me/Anotop1290bot', TG_NAME = '@Anotop1290bot', POLL_S = 15, STALE_S = 600;
  const seen = {};   // file -> newest publishedAt shown; never step backwards (raw gist replicas lag)
  function fileFor(path) {
    const [p, q] = path.split('?'), qs = new URLSearchParams(q || '');
    let m;
    if (p === 'state' || p === 'account' || p === 'activity' || p === 'orders' || p === 'picks') return p + '.json';
    if (p === 'chart') return `chart_${qs.get('range') || 'LIVE'}.json`;
    if ((m = p.match(/^bots\/(\w+)\/decisions$/))) return `decisions_${m[1]}.json`;
    if ((m = p.match(/^(coin|audit)\/([1-9A-HJ-NP-Za-km-z]{32,44})$/))) return `${m[1]}__${m[2]}.json`;
    return null;
  }
  async function gist(path) {
    const f = fileFor(decodeURIComponent(path));
    if (!f) throw Object.assign(new Error('Not available in this view'), {status: 404});
    const r = await fetch(`https://gist.githubusercontent.com/${GIST_OWNER}/${DATA()}/raw/${f}?t=${Date.now()}`, {cache: 'no-store'});
    if (r.status === 404) throw Object.assign(new Error('Not published yet'), {status: 404});
    if (!r.ok) throw new Error('data ' + r.status);
    const j = await r.json(), prev = seen[f];
    if (prev && (j.publishedAt || 0) < prev.publishedAt) return prev;
    seen[f] = j;
    return j;
  }
  const COL = {scanner: '#64d2ff', analyst: '#ffd60a', brain: '#bf5af2', executor: '#00d35a', risk: '#ff6b9a'};
  const KIND = {bought: ['#0a84ff', '↓'], sold: ['#00d35a', '↑'], stopped: ['#ff453a', '!'], rejected: ['#8e8e93', '×']};
  let S = {tab: H.get('tab') || 'home', range: 'LIVE', state: null, chart: null, acts: null, account: null, lastOk: null, retry: 0};

  // ---------- api ----------
  async function api(path, opt = {}) {
    if (PLAN_B) {
      if (opt.method === 'POST') throw new Error('Use Telegram ' + TG_NAME);
      return gist(path);
    }
    const r = await fetch('/api/' + path, {...opt, headers: {'Authorization': 'Bearer ' + TOKEN(), 'Content-Type': 'application/json'}});
    if (r.status === 401) throw Object.assign(new Error('unauthorized'), {auth: true});
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || j.detail || r.status), {status: r.status, body: j});
    return j;
  }
  const post = (p, b) => api(p, {method: 'POST', body: JSON.stringify(b || {})});

  // ---------- formatting ----------
  const money = v => v == null ? '—' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const big = v => v == null ? '—' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : money(v);
  const pct = v => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const hm = ts => new Date(ts * 1000).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'});
  const price = v => v == null ? '—' : v >= 1 ? '$' + v.toFixed(4) : '$' + v.toPrecision(4);
  function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => e.hidden = true, 1800); }

  // ---------- odometer: digit roll 600ms, 30ms stagger ----------
  function odo(el, text) {
    const old = el.dataset.v || '';
    if (old.length !== text.length) {
      el.innerHTML = [...text].map(c => /\d/.test(c) ? `<span class="d"><i style="transform:translateY(-${c * 52}px)">${[...Array(10).keys()].map(n => `<span style="display:block">${n}</span>`).join('')}</i></span>` : `<span class="s">${c}</span>`).join('');
    } else {
      [...el.querySelectorAll('.d i')].forEach((i, k) => { const ds = text.replace(/\D/g, ''); i.style.transitionDelay = (k * 30) + 'ms'; i.style.transform = `translateY(-${ds[k] * 52}px)`; });
    }
    el.dataset.v = text;
  }

  // ---------- offline / error row ----------
  function offline(err) {
    const e = $('#offline');
    if (!err) { e.hidden = true; return; }
    if (err.auth) { e.textContent = 'Not signed in · open the desk link you were sent'; e.hidden = false; return; }
    if (err.stale) { e.textContent = `Desk offline · retrying in ${POLL_S}s · last update ${hm(S.lastOk / 1000)}`; e.hidden = false; return; }
    S.retry = Math.min(30, (S.retry || 2) * 2);
    let n = S.retry;
    const tick = () => { e.textContent = `Desk offline · retrying in ${n}s · last update ${S.lastOk ? hm(S.lastOk / 1000) : '—'}`; };
    tick(); e.hidden = false;
    clearInterval(e._i); e._i = setInterval(() => { n--; if (n <= 0) { clearInterval(e._i); refresh(); } else tick(); }, 1000);
  }

  // ---------- tabs ----------
  function setTab(t) {
    S.tab = t; document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    closeScreen(); render(); refresh();
  }
  document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

  function skeleton() {
    return `<div class="sk" style="height:44px;width:40%;margin:8px 0"></div><div class="sk" style="height:52px;width:70%;margin:12px 0"></div>
    <div class="sk" style="height:230px;margin:12px 0"></div><div class="sk" style="aspect-ratio:16/9;border-radius:22px"></div>`;
  }

  function render() {
    const v = $('#view');
    if (S.tab === 'home') v.innerHTML = S.state ? home() : skeleton();
    if (S.tab === 'bots') v.innerHTML = S.state ? bots() : skeleton();
    if (S.tab === 'activity') v.innerHTML = S.acts ? activity() : skeleton();
    if (S.tab === 'account') v.innerHTML = S.account ? account() : skeleton();
    wire();
  }

  // ---------- HOME ----------
  function home() {
    const st = S.state, running = st.bots.filter(b => b.status === 'running').length;
    const empty = !(S.acts && S.acts.items.length) && !st.positions.length;
    return `
    <div class="nav"><div class="avatar">S</div><div class="who">Grok Bot <span>›</span></div><div class="sp"></div>
      <button class="icon" data-go="activity"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button>
      <button class="icon" data-go="account"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></button></div>
    <div class="bal"><div class="odo" id="odo"></div>${st.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : ''}</div>
    <div class="today"><span class="${st.todayPct >= 0 ? 'up' : 'down'}">${pct(st.todayPct)}</span><span class="muted">today</span>
      <span class="pill ${st.multiplier >= 1 ? 'green' : 'red'}">${st.multiplier.toFixed(2)}x</span></div>
    <div class="chart"><canvas id="cv"></canvas></div>
    <div class="seg" id="ranges">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button class="${r === S.range ? 'on' : ''}" data-r="${r}">${r}</button>`).join('')}</div>
    ${liveCard(st)}
    <h2>Bots<span class="sub">· ${running} running</span><button class="more" data-go="bots">See all</button></h2>
    <div class="carousel">${st.bots.map(botCard).join('')}</div>
    <h2>Activity<button class="more" data-go="activity">See all</button></h2>
    ${empty ? '<div class="empty">Waiting for the first trade</div>' : `<div class="list">${(S.acts ? S.acts.items.slice(0, 5) : []).map(actRow).join('') || '<div class="row muted">No trades yet</div>'}</div>`}`;
  }

  function liveCard(st) {
    const ts = st.screen.ts, fresh = ts && (Date.now() / 1000 - ts) < 5;
    const ex = st.bots.find(b => b.name === 'executor'), lo = ex.lastOrder;
    const ck = lo ? ['screen', 'api', 'chain'].map(k => `<b class="${lo.checks[k] ? 'up' : lo.checks[k] === 0 ? 'down' : 'faint'}">${lo.checks[k] ? '✓' : lo.checks[k] === 0 ? '✗' : '–'}</b>`).join('') : '';
    return `<div class="live" id="live">${ts ? '<img id="shotA"><img id="shotB" style="opacity:0">' : '<div class="idle">Idle · no frames in PAPER</div>'}
      <div class="tl"><span class="dot ${fresh ? 'red' : ''}"></span>${fresh ? 'Live · Bot\'s computer' : ts ? 'Last frame ' + hm(ts) : 'Last frame —'}</div>
      <div class="tr">${esc(st.screen.lane)}</div>
      ${lo ? `<div class="bot"><span>${esc(lo.text)}</span><span class="checks">${ck}</span></div>` : ''}</div>`;
  }

  function botCard(b) {
    let body = '';
    if (b.name === 'scanner') body = `<div class="feed">${b.feed.map(f => `<div><span class="${f.kill ? 'k' : ''}">${esc(f.symbol)}</span><span class="${f.kill ? 'faint' : 'muted'}">${esc(f.text)}</span></div>`).join('') || '<div class="faint">Watching new pools</div>'}</div>
      <div class="muted" style="font-size:13px;margin-top:6px">${b.forwarded} → Analyst</div>`;
    if (b.name === 'analyst') body = `<div style="display:flex;gap:12px;align-items:center"><div style="flex:1"><div class="muted" style="font-size:13px">${esc(b.symbol || 'Nothing yet')}</div>
      <div class="strips">${[...Array(8).keys()].map(i => `<i class="${b.strips[i] == null ? '' : b.strips[i] ? 'p' : 'f'}"></i>`).join('')}</div>
      <div class="muted" style="font-size:13px">${esc(b.social)}</div></div><canvas class="ring" data-score="${b.score ?? ''}"></canvas></div>`;
    if (b.name === 'brain') body = b.sizing ? `<div style="font-size:17px;font-weight:600">${esc(b.sizing)}</div><div class="muted" style="font-size:13px;margin-top:4px">${esc(b.symbol)} · ${esc(b.rule)}</div>`
      : '<div class="faint" style="font-size:13px">Nothing sized yet</div>';
    if (b.name === 'executor') body = `<div style="font-size:15px">${esc(b.state)}</div>${b.lastOrder ? `<div class="${b.lastOrder.status === 'done' ? 'up' : 'down'}" style="font-size:13px;margin-top:6px">${esc(b.lastOrder.text)}</div>` : ''}`;
    if (b.name === 'risk') body = `<div style="display:flex;gap:6px;margin-top:4px">${b.pills.map(p => `<span class="pill ${p.color}">${esc(p.text)}</span>`).join('')}</div>
      <div class="muted" style="font-size:13px;margin-top:8px">${b.guarding} open position${b.guarding === 1 ? '' : 's'}</div>`;
    return `<div class="bc" data-go="bots"><div class="hd"><span class="dot" style="background:${b.color}"></span>${b.title}<span class="n">${b.status}</span></div>
      <div class="big">${esc(b.headline)}</div>${body}</div>`;
  }

  // ---------- ACTIVITY ----------
  function actRow(a) {
    const [c, i] = KIND[a.kind] || ['#8e8e93', '·'];
    const vcls = a.kind === 'stopped' ? 'down' : a.kind === 'sold' ? (String(a.value).startsWith('-') ? 'down' : 'up') : '';
    return `<div class="row" data-open="${a.opens}" data-mint="${esc(a.mint)}"><div class="ic" style="background:${c}22;color:${c}">${i}</div>
      <div class="tx"><div class="t">${esc(a.title)}</div>
      <div class="st">${a.mode === 'PAPER' ? '<span style="color:#ff9f0a">PAPER</span> · ' : ''}${esc(a.subtitle)}${/\d\d:\d\d/.test(a.subtitle) ? '' : ' · ' + hm(a.ts)}</div></div><div class="v ${vcls}">${esc(a.value)}</div></div>`;
  }
  function activity() {
    const it = S.acts.items;
    return `<h1>Activity</h1>${it.length ? `<div class="list">${it.map(actRow).join('')}</div>${S.acts.next && !PLAN_B ? '<button class="btn" id="more">Load more</button>' : ''}`
      : '<div class="empty">Nothing yet tonight</div>'}`;
  }

  // ---------- BOTS ----------
  function bots() {
    return `<h1>Bots</h1>${S.state.bots.map(b => `<div class="card"><div style="display:flex;align-items:center;gap:10px">
      <span class="dot ${b.status === 'running' ? 'green' : b.status === 'paused' ? 'orange' : ''}"></span>
      <div style="flex:1"><div style="font-weight:600;color:${b.color}">${b.title}</div><div class="muted" style="font-size:13px">${b.status} · ${esc(b.headline)}${b.locked ? ' · locked: position open' : ''}</div></div>
      ${PLAN_B ? '' : `<button class="switch ${b.status !== 'paused' ? 'on' : ''}" data-pause="${b.name}" ${b.locked ? 'disabled' : ''} aria-label="pause ${b.name}"></button>`}</div>
      <div class="dec" id="dec-${b.name}"><div class="sk" style="height:40px;margin-top:10px"></div></div></div>`).join('')}
      ${PLAN_B ? `<a class="btn" href="${TG}" target="_blank" rel="noopener">Pause a bot · ${TG_NAME}</a>` : ''}
      <button class="btn" data-go="account">Settings</button>`;
  }
  async function loadDecisions() {
    for (const b of S.state.bots) {
      const el = $('#dec-' + b.name); if (!el) continue;
      try {
        const d = await api(`bots/${b.name}/decisions`);
        el.innerHTML = d.items.length ? d.items.map(x => `<div class="row" style="min-height:40px"><div class="tx"><div class="st" style="color:${x.ok ? '#fff' : 'rgba(235,235,245,.6)'}">${esc(x.symbol || '')} · ${esc(x.text)}</div></div>
          ${x.link ? `<a href="${esc(x.link)}" target="_blank" rel="noopener" style="font-size:13px">FOMO</a>` : ''}<span class="faint" style="font-size:12px">${hm(x.ts)}</span></div>`).join('')
          : '<div class="faint" style="font-size:13px;padding-top:10px">No decisions yet</div>';
      } catch (e) { el.innerHTML = ''; }
    }
  }

  // ---------- ACCOUNT ----------
  function account() {
    const a = S.account, names = {scanner: 'Scanner', analyst: 'Analyst', social: 'Social', brain: 'Brain', executor: 'Executor', risk: 'Risk', desk: 'Desk'};
    const setRow = s => {
      if (s.type === 'str' || s.type === 'bool' || s.min == null) return `<div class="set"><div class="top"><span>${esc(s.key.split('.')[1])}</span><span class="muted" style="margin-left:auto;font-size:15px">${esc(s.key === 'desk.withdraw_address' && s.value ? s.value.slice(0, 4) + '…' + s.value.slice(-4) : String(s.value))}</span></div></div>`;
      if (PLAN_B) return `<div class="set"><div class="top"><span>${esc(s.key.split('.')[1])}</span><span style="margin-left:auto;font-size:15px">${esc(String(s.value))}</span></div></div>`;
      const step = s.type === 'int' ? 1 : (s.max - s.min) > 1000 ? 100 : (s.max - s.min) > 20 ? 0.5 : 0.05;
      return `<div class="set"><div class="top"><span>${esc(s.key.split('.')[1])}</span><input type="number" inputmode="decimal" data-key="${s.key}" value="${s.value}" min="${s.min}" max="${s.max}" step="any"></div>
        <input type="range" data-key="${s.key}" min="${s.min}" max="${s.max}" step="${step}" value="${s.value}"><div class="err" id="err-${s.key.replace('.', '_')}"></div></div>`;
    };
    return `<h1>Account</h1>
    ${PLAN_B ? `<a class="card" style="display:block;color:#fff" href="${TG}" target="_blank" rel="noopener">Change mode, settings, sell or pause in Telegram · <span style="color:#0a84ff">${TG_NAME}</span></a>` : ''}
    <div class="card"><div class="seg" style="margin:0"><button class="${a.mode === 'PAPER' ? 'on' : ''}" data-mode="PAPER">PAPER</button><button class="${a.mode === 'LIVE' ? 'on' : ''}" data-mode="LIVE">LIVE</button></div>
      <div class="muted" style="font-size:13px;margin-top:8px">${a.mode === 'PAPER' ? 'Paper money. LIVE needs a full PAPER night and you typing LIVE.' : 'Real money.'}</div></div>
    <div class="list"><div class="row"><div class="tx"><div class="t">Cash</div><div class="st">PAPER start ${money(a.startCash)}</div></div><div class="v">${money(a.cash)}</div></div>
      <a class="row" href="${esc(a.profileUrl)}" target="_blank" rel="noopener"><div class="tx"><div class="t" style="color:#fff">Your FOMO profile</div><div class="st">@${esc(a.handle)}</div></div><div class="v faint">›</div></a>
      <button class="row" style="width:100%;text-align:left" id="invite"><div class="tx"><div class="t">Invite a friend</div><div class="st">Share your FOMO link</div></div><div class="v faint">›</div></button></div>
    <h2>Settings</h2>${Object.entries(a.settings).map(([g, list]) => `<div class="card"><div style="font-weight:600;color:${COL[g] || '#fff'};margin-bottom:2px">${names[g] || g}</div>${list.map(setRow).join('')}</div>`).join('')}
    ${copyPicks()}
    <h2>Notifications</h2><div class="list"><div class="row"><div class="tx"><div class="t">Telegram</div><div class="st">${a.push.telegram ? 'connected' : 'not connected'}</div></div></div>
      <div class="row"><div class="tx"><div class="t">Web push</div><div class="st">${a.push.webpush ? a.push.webpush + ' device(s)' : 'not connected · add to Home Screen first'}</div></div></div></div>
    ${PLAN_B ? '' : '<button class="btn" id="testpush">Send test push</button>'}
    <button class="btn blue" id="watch">Watch in Grok Bot</button>`;
  }

  // ---------- COPY PICKS (Account tab) ----------
  function copyPicks() {
    const P = S.picks, ago = ts => { if (!ts) return 'unknown'; const m = (Date.now() / 1000 - ts) / 60; return m < 60 ? `${m.toFixed(0)}m ago` : `${(m / 60).toFixed(0)}h ago`; };
    const usd = v => (v >= 0 ? '+' : '-') + '$' + (Math.abs(v) >= 1e6 ? (Math.abs(v) / 1e6).toFixed(1) + 'M' : Math.abs(v) >= 1e3 ? (Math.abs(v) / 1e3).toFixed(1) + 'K' : Math.abs(v).toFixed(0));
    if (!P || !P.latest) return `<h2>Copy picks</h2><div class="empty">${esc(P ? 'Copy picks: ' + P.status : 'Copy picks: no data yet')}</div>`;
    const card = p => `<div class="card"><div style="display:flex;align-items:center;gap:8px"><div style="font-weight:700;font-size:17px">#${p.rank} ${esc(p.handle)}</div>
        <div style="margin-left:auto">${PLAN_B ? `<span class="pill ${p.copying ? 'green' : 'grey'}">${p.copying ? 'Copying' : 'Copy off'}</span>` : `<button class="switch ${p.copying ? 'on' : ''}" data-copy="${esc(p.id)}" aria-label="Copy on desk"></button>`}</div></div>
      <div style="margin-top:4px;font-size:15px"><span class="up">7d ${usd(p.pnl7d)}</span> · <span class="up">30d ${usd(p.pnl30d)}</span></div>
      <div class="muted" style="font-size:13px;margin-top:2px">${p.trades} trades · last trade ${ago(p.lastTrade)} · ${esc(p.coinCheck)}</div>
      <div class="muted" style="font-size:13px;margin-top:2px">${esc(p.why)}</div>
      <a class="row" href="${esc(p.lastBuyUrl)}" target="_blank" rel="noopener" style="min-height:44px"><div class="tx"><div class="t" style="color:#fff;font-size:15px">Last buy: ${esc((p.lastBuy && (p.lastBuy.symbol || (p.lastBuy.mint || '').slice(0, 6))) || '—')}</div><div class="st">${p.lastBuy && p.lastBuy.mcap ? 'at ' + usd(p.lastBuy.mcap).slice(1) : 'mcap n/a'}</div></div><div class="v faint">›</div></a>
      <a class="btn" href="${esc(p.profileUrl)}" target="_blank" rel="noopener" style="height:40px;margin-top:6px">Profile</a></div>`;
    const hist = P.history.map(r => `<div class="row" style="min-height:40px"><div class="tx"><div class="st">${new Date(r.ts * 1000).toLocaleString('en-GB', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'})} · ${r.picks.map(p => esc(p.handle)).join(', ') || 'nobody'}</div></div></div>`).join('');
    return `<h2>Copy picks<span class="sub">· ${P.latest.picks.length} traders</span></h2>${P.latest.picks.map(card).join('') || '<div class="empty">Nobody passed today\'s filters</div>'}
      ${PLAN_B ? `<a class="btn" href="${TG}" target="_blank" rel="noopener">Copy on desk · ${TG_NAME}</a>` : ''}
      <button class="btn" id="copypicks">Copy picks</button>
      ${hist ? `<h2>Last lists</h2><div class="list">${hist}</div>` : ''}`;
  }

  // ---------- COIN / AUDIT screens ----------
  function closeScreen() { $('#screen').hidden = true; $('#screen').innerHTML = ''; }
  async function openCoin(mint) {
    const sc = $('#screen'); sc.hidden = false; sc.innerHTML = `<button class="back" id="back">‹ Back</button>${skeleton()}`; $('#back').onclick = closeScreen;
    let c; try { c = await api('coin/' + encodeURIComponent(mint)); } catch (e) { sc.innerHTML = `<button class="back" id="back">‹ Back</button><div class="empty">${esc(e.message)}</div>`; $('#back').onclick = closeScreen; return; }
    const p = c.position, age = c.ageH == null ? '' : c.ageH < 1 ? ` · ${Math.round(c.ageH * 60)}m old` : ` · ${Math.round(c.ageH)}h old`;
    sc.innerHTML = `<button class="back" id="back">‹ Back</button>
      <div class="coinhd"><h1>${esc(c.name)}</h1>${c.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : ''}</div>
      <div class="muted" style="font-size:15px;margin-top:2px">${esc(c.symbol)} · ${c.chain}${age} · <span class="shield" data-audit="${esc(c.mint)}">⛨ ${c.shield}</span></div>
      <div class="price">${price(c.price)}</div>
      ${c.sinceEntryPct != null ? `<div class="${c.sinceEntryPct >= 0 ? 'up' : 'down'}" style="font-size:15px">${c.sinceEntryPct >= 0 ? '▲' : '▼'} ${Math.abs(c.sinceEntryPct).toFixed(1)}% since entry</div>` : ''}
      <div class="chart" style="height:220px;margin-top:10px"><canvas id="cc"></canvas></div>
      <div class="tiles"><div class="tile"><div class="l">Market cap</div><div class="n">${big(c.marketCap)}</div></div><div class="tile"><div class="l">Liquidity</div><div class="n">${big(c.liquidity)}</div></div>
        <div class="tile"><div class="l">Holders</div><div class="n">${c.holders == null ? '—' : c.holders.toLocaleString()}</div></div></div>
      ${p ? `<div class="card"><div style="font-weight:600">Your position · ${money(p.in)} in · ${p.bot}</div>
        <div class="muted" style="font-size:13px;margin-top:4px">${p.open ? `now ${money(p.value)} · exit line ${price(p.stop)}` : `closed · ${esc(p.exitReason)} · ${money(p.pnl)}`}</div></div>` : ''}
      <a class="btn" href="${esc(c.link)}" target="_blank" rel="noopener">Open on FOMO</a>
      ${p && p.open ? (PLAN_B ? `<a class="btn red" href="${TG}" target="_blank" rel="noopener">Sell now · ${TG_NAME}</a>` : '<button class="btn red" id="sellnow">Sell now</button>') : ''}`;
    $('#back').onclick = closeScreen;
    sc.querySelector('[data-audit]').onclick = () => openAudit(c.mint);
    requestAnimationFrame(() => Charts.candles($('#cc'), c.candles, c.exitLine, p && p.entry));
    if ($('#sellnow')) $('#sellnow').onclick = () => sellSheet(c);
  }
  function sellSheet(c) {
    let chosen = 100;
    const sh = $('#sheet'), bg = $('#sheet-bg'), close = () => { sh.hidden = bg.hidden = true; };
    const draw = () => {
      sh.innerHTML = `<div class="grab"></div><div style="font-weight:700;font-size:20px;margin-bottom:4px">Sell ${esc(c.symbol)}</div>
      <div class="muted" style="font-size:13px;margin-bottom:12px">${c.mode === 'PAPER' ? 'PAPER · fills at the last DexScreener price minus fees' : ''}</div>
      <div class="pcts">${[25, 50, 100].map(x => `<button class="${x === chosen ? 'on' : ''}" data-p="${x}">${x}%</button>`).join('')}</div>
      <button class="btn red" id="confirm">Confirm sell</button><button class="btn" id="cancel">Cancel</button>`;
      sh.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { chosen = +b.dataset.p; draw(); });
      $('#cancel').onclick = close;
      $('#confirm').onclick = async () => {
        try { const r = await post('sell/' + encodeURIComponent(c.mint), {pct: chosen, confirm: true}); close(); toast(`Sold ${chosen}% · ${money(r.usdOut)}`); refresh(); openCoin(c.mint); }
        catch (e) { toast(e.message); }
      };
    };
    draw(); sh.hidden = bg.hidden = false; bg.onclick = close;
  }
  async function openAudit(mint) {
    const sc = $('#screen'); sc.hidden = false; sc.innerHTML = `<button class="back" id="back">‹ Back</button>${skeleton()}`; $('#back').onclick = closeScreen;
    let a; try { a = await api('audit/' + encodeURIComponent(mint)); } catch (e) { sc.innerHTML = `<button class="back" id="back">‹ Back</button><div class="empty">No audit for this coin</div>`; $('#back').onclick = closeScreen; return; }
    const names = ['Mint & freeze', 'Creator share', 'Creator history', 'LP locked', 'Top 10', 'Bundles', 'Insiders', 'Delegations'];
    const byL = Object.fromEntries(a.layers.map(l => [l.layer, l]));
    sc.innerHTML = `<button class="back" id="back">‹ Back</button>
      <div class="coinhd"><h1>${esc(a.symbol)}</h1><span class="pill ${a.passed === 8 ? 'green' : 'red'}">${a.passed}/8</span></div>
      <div style="display:flex;align-items:center;gap:12px;margin:10px 0"><canvas class="ring" id="ar" style="width:56px;height:56px"></canvas><div><div style="font-weight:600">Score ${a.score ?? '—'}</div><div class="muted" style="font-size:13px">${esc(a.reason || (a.scorePass ? 'passed' : ''))}</div></div></div>
      <div class="card" style="position:relative"><div class="beam"></div>${[1, 2, 3, 4, 5, 6, 7, 8].map(n => { const l = byL[n];
        return `<div class="disc"><div class="o ${l ? (l.pass ? 'p' : 'f') : 'n'}">${n}</div><div><div style="font-size:15px">${esc(l ? l.name : names[n - 1])}</div><div class="muted" style="font-size:13px">${esc(l ? l.value : 'not reached')}${l && l.source ? ' · ' + esc(l.source) : ''}</div></div></div>`; }).join('')}</div>
      <div class="card muted" style="font-size:15px">${esc(a.social)}</div>
      <a class="btn" href="${esc(a.link)}" target="_blank" rel="noopener">Open on FOMO</a>`;
    $('#back').onclick = closeScreen;
    requestAnimationFrame(() => Charts.ring($('#ar'), a.score, 70));
  }

  // ---------- wiring ----------
  function wire() {
    document.querySelectorAll('[data-go]').forEach(e => e.onclick = () => setTab(e.dataset.go));
    document.querySelectorAll('[data-open]').forEach(e => e.onclick = () => e.dataset.mint && (e.dataset.open === 'audit' ? openAudit(e.dataset.mint) : openCoin(e.dataset.mint)));
    if (S.tab === 'home' && S.state) {
      odo($('#odo'), money(S.state.balance));
      document.querySelectorAll('#ranges button').forEach(b => b.onclick = async () => { S.range = b.dataset.r; await loadChart(); render(); });
      if (S.chart) requestAnimationFrame(() => Charts.line($('#cv'), S.chart));
      document.querySelectorAll('canvas.ring').forEach(c => Charts.ring(c, c.dataset.score === '' ? null : +c.dataset.score, 70));
      if (!PLAN_B) startFrames();
    }
    if (S.tab === 'bots' && S.state) {
      loadDecisions();
      document.querySelectorAll('[data-pause]').forEach(b => b.onclick = async ev => {
        ev.stopPropagation(); const n = b.dataset.pause, on = b.classList.contains('on');
        try { await post(`bots/${n}/${on ? 'pause' : 'resume'}`); await refresh(); } catch (e) { toast(e.message); }
      });
    }
    if (S.tab === 'activity' && $('#more')) $('#more').onclick = async () => { const d = await api('activity?before=' + S.acts.next); S.acts = {items: S.acts.items.concat(d.items), next: d.next}; render(); };
    if (S.tab === 'account' && S.account) wireAccount();
  }
  function wireAccount() {
    const a = S.account;
    document.querySelectorAll('[data-mode]').forEach(b => b.onclick = PLAN_B ? () => window.open(TG, '_blank') : async () => {
      const m = b.dataset.mode; let body = {mode: m};
      if (m === 'LIVE') { const t = prompt('Real money. Type LIVE to confirm.'); if (t !== 'LIVE') return; body.confirm = 'LIVE'; }
      try { await post('mode', body); toast(m); } catch (e) { toast(e.message); }
      S.account = await api('account'); render();
    });
    $('#invite').onclick = async () => {
      try { if (navigator.share) { await navigator.share({title: 'FOMO', url: a.signupUrl}); return; } } catch (_) { }
      try { await navigator.clipboard.writeText(a.signupUrl); } catch (_) { }
      toast('Link copied');
    };
    if ($('#copypicks')) $('#copypicks').onclick = async () => {
      const t = (S.picks && S.picks.message) || 'No copy picks yet';
      try { await navigator.clipboard.writeText(t); } catch (_) { }
      toast('Picks copied');
    };
    if ($('#testpush')) $('#testpush').onclick = async () => { try { const r = await post('push', {test: true}); toast(r.sent ? 'Sent' : r.error); } catch (e) { toast(e.message); } };
    document.querySelectorAll('[data-copy]').forEach(b => b.onclick = async () => {
      try { const r = await post('copy/' + encodeURIComponent(b.dataset.copy), {on: !b.classList.contains('on')}); toast(r.message); S.picks = await api('picks'); render(); }
      catch (e) { toast(e.message); }
    });
    $('#watch').onclick = () => toast('In your Grok Bot chat, say: watch the desk');
    document.querySelectorAll('.set input').forEach(inp => {
      inp.oninput = () => document.querySelectorAll(`.set input[data-key="${inp.dataset.key}"]`).forEach(o => o !== inp && (o.value = inp.value));
      inp.onchange = async () => {
        const k = inp.dataset.key, err = $('#err-' + k.replace('.', '_'));
        try { await post('settings', {key: k, value: +inp.value}); err.textContent = ''; toast('Saved'); }
        catch (e) { err.textContent = e.message; }
      };
    });
  }

  // ---------- live frames (double-buffered, every 1s, Home only) ----------
  let frameT = null, front = 'A';
  function startFrames() {
    clearInterval(frameT);
    if (!$('#shotA')) return;
    const load = async () => {
      if (S.tab !== 'home' || document.hidden) return;
      try {
        const r = await fetch('/api/screen.jpg?' + Date.now(), {headers: {'Authorization': 'Bearer ' + TOKEN()}, cache: 'no-store'});
        if (!r.ok) return;
        const url = URL.createObjectURL(await r.blob()), back = front === 'A' ? 'B' : 'A', img = $('#shot' + back);
        if (!img) return;
        img.onload = () => { img.style.opacity = 1; const f = $('#shot' + front); if (f) { f.style.opacity = 0; URL.revokeObjectURL(f.src); } front = back; };
        img.src = url;
      } catch (_) { }
    };
    load(); frameT = setInterval(load, 1000);
  }

  // ---------- data ----------
  async function loadChart() { S.chart = await api('chart?range=' + S.range); }
  async function refresh() {
    try {
      if (S.tab === 'home' || S.tab === 'bots') { S.state = await api('state'); }
      if (S.tab === 'home') { await loadChart(); S.acts = await api('activity'); }
      if (S.tab === 'activity') S.acts = await api('activity');
      if (S.tab === 'account') { S.account = await api('account'); try { S.picks = await api('picks'); } catch (_) { S.picks = null; } }
      const pub = PLAN_B && S.state && S.state.publishedAt;
      S.lastOk = pub ? pub * 1000 : Date.now(); S.retry = 0;
      if (pub && Date.now() / 1000 - pub > STALE_S) offline({stale: true}); else offline(null);
      if ($('#screen').hidden) render();
    } catch (e) { offline(e); }
  }

  // SSE over fetch (keeps the token in a header): any event -> throttled refresh
  async function stream() {
    try {
      const r = await fetch('/api/stream', {headers: {'Authorization': 'Bearer ' + TOKEN()}});
      if (!r.ok) throw 0;
      const rd = r.body.getReader(); let last = 0;
      while (true) {
        const {done} = await rd.read(); if (done) break;
        if (S.tab === 'home' && $('#screen').hidden && Date.now() - last > 2000) { last = Date.now(); refresh(); }
      }
    } catch (_) { }
    setTimeout(stream, 5000);
  }

  window.addEventListener('hashchange', () => { const h = new URLSearchParams(location.hash.slice(1)); if (h.get('tab')) setTab(h.get('tab')); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  if (!TOKEN() && !DATA()) { offline({auth: true}); }
  render();
  refresh().then(() => { if (H.get('coin')) openCoin(H.get('coin')); if (H.get('audit')) openAudit(H.get('audit')); });
  if (!PLAN_B) setInterval(() => { if (!document.hidden && $('#offline').hidden && S.tab === 'home' && $('#screen').hidden) refresh(); }, 5000);
  if (TOKEN()) stream();
  if (PLAN_B) setInterval(() => { if (!document.hidden && $('#screen').hidden && S.tab !== 'account') refresh(); }, POLL_S * 1000);
})();
