/* The Traitors — client v2 (app shell) */
const $ = (s) => document.querySelector(s);
const app = $('#app');
const socket = io({ transports: ['websocket', 'polling'] });
let S = null;
let local = { flipped: false, sel: null, reason: '', tab: 'table', raceScore: 0, spinDone: false, showCard: false, spinTimer: null, endVoted: false, setOpen: false, sheet: null, seenChat: 0, seenT: 0 };
let token = localStorage.getItem('tt_token'); if (!token) { token = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('tt_token', token); }
let myName = localStorage.getItem('tt_name') || '';
let mySeen = {}; try { mySeen = JSON.parse(localStorage.getItem('tt_seen') || '{}'); } catch (e) { mySeen = {}; }
socket.on('seen', (s) => { mySeen = s || {}; try { localStorage.setItem('tt_seen', JSON.stringify(mySeen)); } catch (e) {} });
let roomCode = localStorage.getItem('tt_room') || '';
let clockOffset = 0;

const esc = (s) => (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const vib = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { } };
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 2200); }
function P(id) { return S && S.players.find(p => p.id === id); }
function nm(id) { const p = P(id); return p ? p.name : '?'; }
function aliveP() { return S.players.filter(p => p.alive); }
function secsLeft() { if (!S || !S.deadline) return null; return Math.max(0, Math.round((S.deadline - (Date.now() + clockOffset)) / 1000)); }
function fmt(s) { if (s == null) return ''; const m = Math.floor(s / 60), r = s % 60; return m > 0 ? `${m}:${r.toString().padStart(2, '0')}` : `${r}`; }
function initials(n) { return n.trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(); }
const isT = () => S && S.me && S.me.role === 'traitor';

// ---------- socket ----------
socket.on('connect', () => { if (roomCode) socket.emit('rejoin', { code: roomCode, token, seen: mySeen }, (r) => { if (r && r.error) { roomCode = ''; localStorage.removeItem('tt_room'); S = null; render(); } }); });
socket.on('state', (st) => {
  clockOffset = st.serverNow - Date.now();
  const prev = S; S = st;
  if (!prev || prev.phase !== st.phase) onPhase(prev ? prev.phase : null, st.phase);
  render();
});
socket.on('kicked', () => { roomCode = ''; localStorage.removeItem('tt_room'); S = null; toast('Host ne nikaal diya'); render(); });

function onPhase(from, to) {
  local.sel = null; local.reason = ''; local.endVoted = false; local.sheet = null;
  if (to !== 'TABLE' && to !== 'LOBBY') local.tab = to === 'NIGHT' && isT() ? 'traitors' : 'table';
  if (to === 'TABLE') local.tab = 'chat';
  if (to === 'ROLES') { local.flipped = false; local.spinDone = false; local.showCard = false; clearTimeout(local.spinTimer); local.spinTimer = null; vib(40); }
  if (to === 'MORNING') { local.cardOpened = false; local.envOpen = false; local.arrN = 0; vib([80, 60, 200]); document.body.classList.add('blood'); setTimeout(() => document.body.classList.remove('blood'), 1300); }
  if (to === 'BANISH') vib([50, 50, 50]);
  if (to === 'VOTE') vib(30);
  if (to === 'NIGHT') vib(60);
  if (to === 'MISSION') { local.raceScore = 0; local.multi = []; local.mem = []; local.mathAns = []; }
  if (to === 'FINAL') vib([100, 50, 100, 50, 300]);
}

setInterval(() => { const el = $('#clock'); if (!el || !S || !S.deadline) return; const s = secsLeft(); el.textContent = fmt(s); el.classList.toggle('warn', s <= 10); }, 500);

// ---------- render ----------
function render() {
  if (!S) return renderHome();
  if (S.phase === 'ROLES' && !local.spinDone && $('#needle')) return; // don't interrupt spin
  if (S.phase === 'LOBBY') { app.innerHTML = `<div class="shell">${topbar()}<div class="main">${rLobby()}</div>${tabsHTML()}</div>${sheetHTML()}`; bind(); scrollChat(); return; }
  const dead = S.me && !S.me.alive && S.phase !== 'FINAL';
  let body;
  if (local.tab === 'chat') body = rChatTab(false);
  else if (local.tab === 'traitors') body = rChatTab(true);
  else if (local.tab === 'log') body = rLogTab();
  else body = phaseBody();
  app.innerHTML = `<div class="shell">${topbar()}${dead ? '<div class="dead-strip">☠️ Aap game se bahar hain — dekh sakte hain, bol nahi</div>' : ''}<div class="main ${local.tab === 'chat' || local.tab === 'traitors' ? 'chatmain' : ''}">${body}</div>${tabsHTML()}</div>${sheetHTML()}`;
  bind(); scrollChat();
  if (local.tab === 'chat') local.seenChat = S.chat.length;
  if (local.tab === 'traitors') local.seenT = (S.tchat || []).length;
}
function scrollChat() { const c = $('#chatbox'); if (c) c.scrollTop = c.scrollHeight; }

const PH_LABEL = { LOBBY: ['The Palace', ''], ROLES: ['Selection', 'Traitors chune ja rahe hain'], MISSION: ['Mission', ''], MISSION_RESULT: ['Mission', 'Result'], TABLE: ['Circle of Shaq', 'Discussion'], VOTE: ['Circle of Shaq', 'Vote'], REVEAL: ['Circle of Shaq', 'Votes reveal'], BANISH: ['Banishment', ''], END_CHOICE: ['End Game', 'Khatam ya aage?'], NIGHT: ['Turret', 'Raat'], RECRUIT: ['Turret', 'Recruitment'], MORNING: ['Breakfast', ''], SHARE_STEAL: ['End Game', 'Share ya Steal'], FINAL: ['End Game', 'Prize Money'] };
function topbar() {
  const [a, b] = PH_LABEL[S.phase] || [S.phase, ''];
  const s = secsLeft();
  return `<div class="tbar"><div class="ph">${a}<small>${S.round ? 'Round ' + S.round + (b ? ' · ' + b : '') : (b || 'The Traitors · ' + S.code)}</small></div><div class="clock ${s != null && s <= 10 ? 'warn' : ''}" id="clock">${s != null ? fmt(s) : ''}</div>${S.me && S.me.shield ? '<div class="shieldtag">🛡️ Shield</div>' : ''}<div class="money">₹${S.phase === "LOBBY" ? S.settings.stake * S.players.length : S.pot}<small>prize money${S.phase === "LOBBY" ? "" : " · 🍕 ₹" + S.partyFund}</small></div></div>`;
}
function tabsHTML() {
  const inLobby = S.phase === 'LOBBY';
  const newC = Math.max(0, S.chat.length - local.seenChat); const newT = Math.max(0, (S.tchat || []).length - local.seenT);
  const canT = isT() && S.me.alive && S.phase !== 'LOBBY' && S.phase !== 'ROLES';
  return `<div class="tabs">
    <button data-tab="table" class="${local.tab === 'table' ? 'on' : ''}"><b>${inLobby ? '🏰' : '🪑'}</b>${inLobby ? 'Palace' : 'Game'}</button>
    <button data-tab="chat" class="${local.tab === 'chat' ? 'on' : ''}"><b>💬</b>Chat${newC && local.tab !== 'chat' ? `<span class="n">${newC}</span>` : ''}</button>
    ${canT ? `<button data-tab="traitors" class="t ${local.tab === 'traitors' ? 'on' : ''}"><b>🗡️</b>Turret${newT && local.tab !== 'traitors' ? `<span class="n">${newT}</span>` : ''}</button>` : ''}
    <button data-tab="log" class="${local.tab === 'log' ? 'on' : ''}"><b>📜</b>History</button>
    <button data-sheet="help"><b>❔</b>Rules</button>
  </div>`;
}

// ---------- TABLE widget ----------
function tableHTML(opts = {}) {
  const { center = '', pickable = null, cls = '', seats = null, hot = null } = opts; const marks = { ...(opts.marks || {}) };
  if (S.me && S.me.shield) marks[S.me.id] = { ...(marks[S.me.id] || {}), badge: '🛡️' };
  const list = seats || S.players; const n = list.length;
  return `<div class="rtable ${cls}"><div class="tbl"></div>
  ${list.map((p, i) => {
    const ang = i * 360 / n; const m = marks[p.id] || {};
    const c = ['seat', p.empty ? 'empty' : '', p.id === S.me.id ? 'me' : '', p.connected === false ? 'off' : '', p.alive === false ? 'dead' : '', p.role === 'traitor' && S.phase !== 'ROLES' && (isT() || S.phase === 'FINAL') ? 'traitor' : '', pickable && pickable(p) ? 'pick' : '', local.sel === p.id && pickable ? 'sel' : '', m.done ? 'done' : '', hot === p.id ? 'hot' : ''].join(' ');
    return `<div class="${c}" style="transform:rotate(${ang}deg) translateY(calc(-1 * var(--R))) rotate(${-ang}deg)" ${pickable && pickable(p) ? `data-pick="${p.id}"` : ''} ${opts.kick && !p.isHost && !p.empty ? `data-kick="${p.id}"` : ''}><div class="av">${p.empty ? '?' : esc(initials(p.name))}${p.isHost && S.phase === 'LOBBY' ? '<i class="crown">👑</i>' : ''}${m.badge ? `<i class="badge">${m.badge}</i>` : ''}${m.cnt ? `<i class="cnt">${m.cnt}</i>` : ''}</div><div class="pn">${p.empty ? '' : esc(p.name)}</div></div>`;
  }).join('')}
  <div class="tc">${center}</div></div>`;
}
function avRow(list, opts = {}) {
  const { pickable = null, marks = {}, size = '' } = opts;
  return `<div class="avrow ${size}">${list.map(p => { const m = marks[p.id] || {};
    const c = ['seat', 'inrow', p.id === S.me.id ? 'me' : '', p.connected === false ? 'off' : '', p.alive === false ? 'dead' : '', p.role === 'traitor' && S.phase !== 'ROLES' && (isT() || S.phase === 'FINAL') ? 'traitor' : '', pickable && pickable(p) ? 'pick' : '', local.sel === p.id && pickable ? 'sel' : '', m.done ? 'done' : '', opts.hot === p.id ? 'hot' : ''].join(' ');
    return `<div class="${c}" ${pickable && pickable(p) ? `data-pick="${p.id}"` : ''}><div class="av">${esc(initials(p.name))}${m.badge ? `<i class="badge">${m.badge}</i>` : ''}${m.cnt ? `<i class="cnt">${m.cnt}</i>` : ''}</div><div class="pn">${esc(p.name)}</div></div>`; }).join('')}</div>`;
}
const CEN = (lbl, big, sub) => `${lbl ? `<div class="lbl">${lbl}</div>` : ''}${big ? `<div class="big">${big}</div>` : ''}${sub ? `<div class="tiny muted">${sub}</div>` : ''}`;

// ---------- HOME ----------
function renderHome() {
  app.innerHTML = `<div class="shell"><div class="main">
  <div class="title"><div class="dagger">🗡️</div><h1><span>WELCOME TO</span>THE TRAITORS</h1><p>Is palace mein har muskurahat ke peeche ek raaz hai.</p></div>
  <div class="card">
    <label class="lbl2">Tumhara naam</label>
    <input type="text" id="name" maxlength="14" placeholder="Aapka shubh naam" value="${esc(myName)}" autocomplete="off">
    <button class="btn gold" id="create">Palace mein swagat — naya game</button>
    <div class="center dim small">— ya —</div>
    <label class="lbl2">Room code</label>
    <input type="text" id="code" class="code" maxlength="4" placeholder="ABCD" value="${esc(new URLSearchParams(location.search).get('r') || '')}" autocomplete="off">
    <button class="btn" id="join">Palace mein enter karo</button>
  </div>
  <button class="btn ghost" data-sheet="help">❔ Game ke rules</button>
  </div></div>${sheetHTML()}`;
  $('#create').onclick = () => { const n = $('#name').value.trim(); if (!n) return toast('Pehle apna naam likhiye'); myName = n; localStorage.setItem('tt_name', n); socket.emit('create', { name: n, token, seen: mySeen }, (r) => { if (r.error) return toast(r.error); roomCode = r.code; localStorage.setItem('tt_room', r.code); }); };
  $('#join').onclick = () => { const n = $('#name').value.trim(); const c = $('#code').value.trim().toUpperCase(); if (!n) return toast('Pehle apna naam likhiye'); if (c.length !== 4) return toast('4 akshar ka code chahiye'); myName = n; localStorage.setItem('tt_name', n); socket.emit('join', { code: c, name: n, token, seen: mySeen }, (r) => { if (r.error) return toast(r.error); roomCode = r.code; localStorage.setItem('tt_room', r.code); }); };
  bindSheet();
}

// ---------- LOBBY ----------
function rLobby() {
  const host = S.me.isHost; const n = S.players.length; const st = S.settings; const need = Math.max(0, 5 - n);
  if (local.tab === 'chat') return rChatTab(false);
  if (local.tab === 'log') return `<div class="card"><h3>Game abhi shuru nahi hua</h3><div class="muted small">Game shuru hote hi yahan sab darj hoga — kaun murder hua, kisne kisko vote diya.</div></div>`;
  return `<div class="castle"><div class="gate">🏰</div><div class="eyebrow">Palace code</div><div class="codebig">${S.code}</div><div class="tiny muted">ye code sirf apne players ko dein</div></div>
  ${need ? `<button class="btn gold" data-sheet="invite">📜 Fellow players ko invite karein</button>` : host ? `<button class="btn gold" id="start">Game shuru karein</button>` : `<div class="wait">Sab players palace mein aa chuke. Host 👑 game shuru karega...</div>`}
  <div class="card"><div class="rowb"><h3 style="margin:0">Players</h3><span class="muted small">${n}/10</span></div>
  <div class="guests">${S.players.map((p, i) => `<div class="guest ${p.connected ? '' : 'off'} ${p.id === S.me.id ? 'me' : ''}" ${host && !p.isHost ? `data-kick="${p.id}"` : ''}><div class="av">${esc(initials(p.name))}</div><div class="gname">${esc(p.name)}${p.isHost ? ' <span class="tiny">👑</span>' : ''}${p.id === S.me.id ? ' <span class="tiny muted">(tum)</span>' : ''}</div><div class="gamt">₹${st.stake}</div></div>`).join('')}
  ${Array.from({ length: need }).map(() => `<div class="guest empty"><div class="av">?</div><div class="gname dim">seat khaali hai...</div><div class="gamt dim">—</div></div>`).join('')}</div>
  <div class="potline"><span>Prize Money</span><b>₹${st.stake * n}</b></div></div>
  ${!need ? `<button class="btn ghost sm" data-sheet="invite">📜 Aur players invite karein (max 10)</button>` : ''}
  <div class="toggle" ${host ? 'id="settoggle"' : ''} style="border-top:1px dashed rgba(201,162,39,.2);margin-top:6px"><span class="small"><span class="gold">₹${st.stake}/head</span>${st.masala ? ' · 🌶️ Masala' : ' · Show mode'}${st.adult ? ' · 🔞' : ''} <span class="muted tiny">· prize money virtual hai, asli hisaab end mein UPI se</span></span><span class="muted tiny">${host ? (local.setOpen ? '▲' : '⚙️ badlein') : ''}</span></div>
  ${host && local.setOpen ? `<div class="card" style="margin-top:0"><div class="stake">${[0, 20, 30, 50].map(v => `<button data-stake="${v}" class="${st.stake === v ? 'sel' : ''}">₹${v}</button>`).join('')}</div><div class="toggle"><span>🌶️ Masala mode <span class="tiny muted">(poison, sabotage, lie detector — show mein nahi hai)</span></span><div class="sw ${st.masala ? 'on' : ''}" id="masala"></div></div><div class="toggle"><span>🔞 18+ mode</span><div class="sw ${st.adult ? 'on' : ''}" id="adult"></div></div></div>` : ''}
  <button class="btn ghost sm" id="leave" style="margin-top:14px">Palace chhod dein</button>`;
}

// ---------- PHASE BODIES ----------
function phaseBody() {
  const fn = { ROLES: rRoles, MISSION: rMission, MISSION_RESULT: rMissionResult, TABLE: rTable, VOTE: rVote, REVEAL: rReveal, BANISH: rBanish, END_CHOICE: rEndChoice, NIGHT: rNight, RECRUIT: rRecruit, MORNING: rMorning, SHARE_STEAL: rShareSteal, FINAL: rFinal }[S.phase];
  return fn ? fn() : '';
}
function lastNarr(kind) { const l = [...S.log].reverse().find(x => !kind || x.kind === kind); return l ? `<div class="narr">${esc(l.text)}</div>` : ''; }
function doneMarks(ids) { const m = {}; (ids || []).forEach(id => m[id] = { done: true }); return m; }
function waiting(what, ids, total) { return `<div class="wait">${what}<br><b>${(ids || []).length}/${total}</b> ho gaye · baaki ka intezaar</div>`; }

// ROLES
function rRoles() {
  const me = S.me; const t = me.role === 'traitor';
  const elapsed = (Date.now() + clockOffset) - (S.pd.spinT0 || 0);
  if (!local.spinDone && elapsed < 9000) {
    const n = S.players.length; const stopAng = 720 + (S.pd.spinStop || 0) * 360 / n;
    const center = `<div class="needlewrap"><div class="needle" id="needle"><svg viewBox="0 0 24 140" width="26" height="150"><defs><linearGradient id="bl" x1="0" x2="1"><stop offset="0" stop-color="#e9e2d0"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#8a8378"/></linearGradient></defs><path d="M12 2 L19 62 L12 74 L5 62 Z" fill="url(#bl)"/><rect x="2" y="72" width="20" height="7" rx="2" fill="#c9a227"/><rect x="9" y="79" width="6" height="42" rx="3" fill="#5a0d12"/><circle cx="12" cy="128" r="8" fill="#c9a227"/></svg></div></div>`;
    setTimeout(() => { const nd = $('#needle'); if (nd) nd.style.transform = `rotate(${stopAng}deg)`; }, 150);
    if (!local.spinTimer) local.spinTimer = setTimeout(() => { local.spinDone = true; local.spinTimer = null; vib([40, 40, 80]); render(); }, 7200);
    return `<div class="narr">Sab apni seat lein. Khanjar ghoomega — aur do Traitors chune jaayenge.</div>${tableHTML({ center, cls: 'spin' })}<div class="wait">Traitors chune ja rahe hain...</div>`;
  }
  if (!local.showCard) return `${tableHTML({ center: CEN('FAISLA', '', '') + '<div class="mid">HO GAYA</div>' })}<div class="narr">Do Traitors chun liye gaye hain. Kaun? Ye sirf wo jaante hain.</div><button class="btn gold" id="showcard">Apna card dekhein</button>`;
  const others = t ? S.players.filter(p => p.role === 'traitor' && p.id !== me.id).map(p => p.name) : [];
  const readyIds = S.players.filter(p => p.ready).map(p => p.id);
  return `<div class="narr">Ye card sirf aapke liye hai. Kisi ko mat dikhaiye.</div>
  <div class="rolecard ${local.flipped ? 'flip' : ''}" id="rc"><div class="inner">
    <div class="face front"><div class="emblem">🕯️</div><div class="cz gold">THE TRAITORS</div><div class="h">${local.flipped ? '' : 'Chhoo kar dekho'}</div></div>
    <div class="face back ${me.role}">${t ? `<div class="ic">🗡️</div><h2>TRAITOR</h2><p>Har raat Turret mein ek Innocent ko murder karein. Din mein Innocent bane rahein. End tak bache — toh poori prize money aapki.</p><p class="gold">Aapka fellow Traitor: <b>${esc(others.join(', ')) || '—'}</b></p>` : `<div class="ic">🕯️</div><h2>INNOCENT</h2><p>Aap mein do Traitors chhupe hain. Circle of Shaq mein unhe pehchaanein aur banish karein. Sab pakde gaye toh prize money Innocents ki.</p>`}</div>
  </div></div>
  ${me.ready ? waiting('Card dekh liya', readyIds, S.players.length) : `<button class="btn" id="ready" ${local.flipped ? '' : 'disabled'}>Dekh liya</button>`}`;
}

// MISSION
const MTITLE = { dhokha: 'Wafadari ya Dhokha', sync: 'Sabse Sync', kadi: 'Kamzor Kadi', race: 'Shield Race', chup: 'Chup Reh', twister: 'Zubaan Sambhaal', puzzle: 'Puzzle Race', pairs: 'Pair Sync', memory: 'Memory Test', math: 'Math Sprint' };
const MRULE = { twister: 'Har player ko ek khatarnak tongue twister. Baari-baari sabke saamne tez bolo (jitni baar likha hai). Baad mein sab vote — kiski zubaan ladkhadayi? Ek-tihai se zyada atke toh mission fail. Jisko ek bhi vote nahi = Shield.', puzzle: 'Do teams. Har team ko ek puzzle — team chat mein milke solve karo. Dono teams solve karein toh mission successful. Jo pehle solve kare, usse Shield.', pairs: '2-2 ke jode. Dono ko bina baat kiye ek hi jawab likhna hai. Aadhe se zyada jode match = successful.', memory: '6 symbols 6 second ke liye dikhenge. Yaad rakho, phir usi order mein tap karo. Team average 4+ chahiye. Poora sahi + sabse tez = Shield.', math: '40 second, jitne sawaal ho sakein. Team total 3 × players chahiye. Akela top scorer = Shield.', dhokha: 'Sab Saath dein = pot badhta hai. Jo akela Dhokha de = usse chupke se 🛡️ Shield (par mission fail). 2+ dhokha = kisi ko kuch nahi.', sync: 'Sabka jawab same hona chahiye (60%+). Alag jawab wale ka naam sabko dikhega.', kadi: 'Chupke se ek naam — jispe sabse kam bharosa. Jiska naam sabse zyada, wo Kamzor Kadi — usse guess karna hoga kisne naam liya. Sahi = jeeta.', race: 'Gold circle pe jitni baar tap kar sako. Team average 6+ chahiye. Top scorer ko 🛡️ Shield.', chup: '60 sec koi nahi hasega. Baari-baari apni line zor se padho. Baad mein sab vote — kaun hasa.' };
function rMission() {
  const pd = S.pd; const me = S.me; const dead = !me.alive; const done = S.mySub !== undefined; const al = aliveP().length;
  const marks = doneMarks(pd.doneIds);
  const head = `<div class="mline"><span class="card-tag">MISSION ${S.round}</span><span>stake <b>₹${pd.stake}</b> · jeete toh prize money <b>₹${S.pot + pd.stake}</b></span></div>`;
  let body = '';
  if (dead) body = `<div class="wait">Baaki players mission khel rahe hain...</div>`;
  else if (pd.type === 'dhokha') body = done ? waiting(`Aapka faisla: <b>${S.mySub === 'dhokha' ? '🐍 Dhokha' : '🤝 Saath'}</b>`, pd.doneIds, al) : `<div class="row"><button class="btn green" data-m="saath">🤝 Saath</button><button class="btn dark" data-m="dhokha">🐍 Dhokha</button></div>`;
  else if (pd.type === 'sync') body = done ? waiting(`Tumhara jawab: <b>${esc(S.mySub)}</b>`, pd.doneIds, al) : `<div class="narr big">${esc(pd.question)}</div><input type="text" id="syncin" maxlength="20" placeholder="Ek shabd" autocomplete="off"><button class="btn" id="syncgo">Lock</button>`;
  else if (pd.type === 'kadi') {
    if (pd.step === 2) { const isK = pd.kadi === me.id; body = isK ? `<div class="narr">Tum <b class="red">Kamzor Kadi</b> ho — ${pd.kadiCount} logon ne tumhara naam liya.<br>Guess karein — kisne aapka naam liya?</div><button class="btn" id="kadigo" ${local.sel ? '' : 'disabled'}>${local.sel ? nm(local.sel) + ' ne liya' : 'Ek naam chuniye'}</button>` : `<div class="narr">Kamzor Kadi: <b class="red">${esc(nm(pd.kadi))}</b><br><span class="muted small">wo guess kar raha hai kisne uska naam liya...</span></div>`; }
    else body = done ? waiting(`Tumne naam liya: <b>${esc(nm(S.mySub))}</b>`, pd.doneIds, al) : `<div class="hint">Us player ko tap karein jis par aapko sabse kam bharosa hai</div><button class="btn" id="kadi1" ${local.sel ? '' : 'disabled'}>${local.sel ? nm(local.sel) + ' — lock' : 'Ek naam chuniye'}</button>`;
  }
  else if (pd.type === 'race') body = done ? waiting(`Tumhara score: <b>${S.mySub}</b>`, pd.doneIds, al) : `<div class="race" id="race"><div class="score" id="rs">${local.raceScore}</div><div class="tgt" id="rt" style="left:40%;top:40%">⚡</div></div><button class="btn" id="racego">Done</button>`;
  else if (pd.type === 'puzzle') {
    if (!S.myGroup) body = `<div class="wait">Teams puzzle solve kar rahi hain...</div>`;
    else {
      const gc = (S.gchat || []).map(m => `<div class="m ${m.pid === me.id ? 'me' : ''}"><b>${esc(m.name)}</b>${esc(m.text)}</div>`).join('') || '<div class="chat-empty">Team ke saath discuss karo...</div>';
      const mates = S.players.filter(p => p.alive && p.id !== me.id && pd.groups && pd.groups[S.myGroup].includes(p.id)).map(p => p.name);
      body = `<div class="teamtag">TEAM ${S.myGroup} · ${esc(mates.join(', ')) || 'sirf tum'}${S.otherSolved ? ' · <span class="red">doosri team solve kar chuki!</span>' : ''}</div>
      <div class="card gold"><div class="eyebrow">Puzzle</div><div class="narr">${esc(S.myPuzzle)}</div></div>
      ${S.groupSolved ? `<div class="arena win" style="padding:10px"><div class="aem" style="font-size:34px">✅</div><h2>Solved by ${esc(S.groupSolved)}</h2><div class="small muted">Doosri team ka intezaar...</div></div>` : `<div class="row"><input type="text" id="pzin" placeholder="Jawab" autocomplete="off" style="flex:2"><button class="btn sm" id="pzgo" style="flex:1;margin:0">Try</button></div><div class="tiny muted center">${S.groupTries ? S.groupTries + ' galat koshish' : ''}</div>`}
      <div class="chat t" id="gchatbox" style="height:150px;border:1px solid rgba(201,162,39,.25);border-radius:10px;padding:6px;margin-top:8px">${gc}</div>
      <div class="chatin"><input type="text" id="gin" maxlength="160" placeholder="Team chat..." autocomplete="off"><button id="gsend">➤</button></div>`;
    }
  }
  else if (pd.type === 'pairs') {
    if (!S.pairQ) body = `<div class="wait">Jode jawab likh rahe hain...</div>`;
    else body = `<div class="teamtag">TUMHARA PARTNER · ${esc((S.partners || []).join(' + '))}</div><div class="narr big">${esc(S.pairQ)}</div><div class="hint">Baat mat karo. Bas socho — wo kya likhega?</div>` + (done ? waiting(`Tumhara jawab: <b>${esc(S.mySub)}</b> · jode mein ${S.pairDone}/${S.pairSize}`, pd.doneIds, al) : `<input type="text" id="syncin" maxlength="20" placeholder="Ek shabd" autocomplete="off"><button class="btn" id="syncgo">Lock</button>`);
  }
  else if (pd.type === 'memory') {
    if (done) body = waiting(`Tumhara score: <b>${S.mySub.s}/6</b>`, pd.doneIds, al);
    else if (pd.seq) { body = `<div class="hint">Yaad rakho — 6 second!</div><div class="memseq">${pd.seq.map(e => `<span>${e}</span>`).join('')}</div><div class="memtimer"><i id="memb"></i></div>`; }
    else { const picks = local.mem || []; body = `<div class="hint">Ab usi order mein tap karo (${picks.length}/6)</div><div class="memseq picked">${Array.from({ length: 6 }).map((_, i) => `<span class="${picks[i] ? '' : 'e'}">${picks[i] || '?'}</span>`).join('')}</div><div class="memgrid">${(pd.pad || []).map(e => `<button data-mem="${e}" ${picks.length >= 6 ? 'disabled' : ''}>${e}</button>`).join('')}</div><div class="row"><button class="btn dark sm" id="memundo">↶ Undo</button><button class="btn sm" id="memgo" ${picks.length === 6 ? '' : 'disabled'}>Lock</button></div>`; }
  }
  else if (pd.type === 'math') {
    if (done) body = waiting(`Tumne <b>${S.mySub}</b> sahi kiye`, pd.doneIds, al);
    else { const i = (local.mathAns || []).length; const q = (S.probsQ || [])[i]; body = q ? `<div class="mathq"><div class="eyebrow">Sawaal ${i + 1}/15</div><div class="mq">${esc(q)} = ?</div><input type="number" id="mathin" inputmode="numeric" pattern="[0-9]*" placeholder="Jawab" autocomplete="off"><div class="row"><button class="btn dark sm" id="mathskip">Skip</button><button class="btn sm" id="mathgo">Next →</button></div></div>` : `<button class="btn" id="mathdone">Sab ho gaye — Lock</button>`; }
  }
  else if (pd.type === 'twister') {
    if (pd.step === 2) { const sel = local.multi || []; body = S.mySub2 !== undefined ? waiting('Vote ho gaya', pd.doneIds, al) : `<div class="narr">Kiski zubaan ladkhadayi? (ek se zyada chun sakte ho)</div><div class="chips">${aliveP().filter(p => p.id !== me.id).map(p => `<button class="chip ${sel.includes(p.id) ? 'on' : ''}" data-tw="${p.id}">${esc(p.name)}</button>`).join('')}</div><div class="row"><button class="btn dark sm" id="twnone">Koi nahi atka</button><button class="btn sm" id="twgo" ${sel.length ? '' : 'disabled'}>${sel.length ? sel.length + ' atke — Lock' : 'Chuno'}</button></div>`; }
    else { const ord = (pd.order || []).map(id => S.players.find(p => p.id === id)).filter(Boolean); body = `<div class="card gold center" style="margin:6px 0"><div class="eyebrow">Aapka tongue twister — tez, sabke saamne</div><div class="narr">"${esc(S.myLine || '...')}"</div></div><div class="tiny muted center">Baari: ${ord.map((p, i) => `${i + 1}. ${p.id === me.id ? '<b class="gold">' + esc(p.name) + '</b>' : esc(p.name)}`).join(' · ')}</div><div class="hint">Time khatam hone par sab vote karenge — kaun atka.</div>`; }
  }
  else if (pd.type === 'chup') {
    if (pd.step === 2) body = S.mySub2 !== undefined ? waiting('Vote ho gaya', pd.doneIds, al) : `<div class="narr">Kaun hasa? Us player ko tap karein.</div><div class="row"><button class="btn dark sm" data-chup="none">Koi nahi hasa</button><button class="btn sm" id="chupgo" ${local.sel ? '' : 'disabled'}>${local.sel ? nm(local.sel) + ' hasa' : 'Chuno'}</button></div>`;
    else body = `<div class="card gold center" style="margin:6px 0"><div class="eyebrow">Aapki line — zor se, bina hase</div><div class="narr">"${esc(S.myLine || '...')}"</div></div><div class="hint">Koi nahi hasega. Time khatam hone par sab vote karenge.</div>`;
  }
  const pickable = !dead && !done && ((pd.type === 'kadi' && (pd.step === 1 || pd.kadi === me.id)) || (pd.type === 'chup' && pd.step === 2 && S.mySub2 === undefined)) ? (p => p.alive && p.id !== me.id) : null;
  const em = { dhokha: '🤝', sync: '🧠', kadi: '⛓️', race: '⚡', chup: '🤐', twister: '👅', puzzle: '🧩', pairs: '👥', memory: '🔮', math: '➕' }[pd.type];
  const sab = S.canSabotage && !dead ? `<div class="card red center" style="margin-top:14px"><div class="eyebrow">Sirf aapko dikh raha hai</div><button class="btn dark sm" id="sab">💣 Sabotage — mission fail karein</button><div class="tiny muted">Kisi ko kabhi pata nahi chalega.</div></div>` : '';
  const arena = `<div class="arena"><div class="aem">${em}</div><h2>${MTITLE[pd.type]}</h2><div class="hint" style="margin:2px 0 0">${MRULE[pd.type]}</div></div>`;
  return head + arena + (pickable || Object.keys(marks).length ? avRow(aliveP(), { pickable, marks }) : '') + body + sab;
}
function rMissionResult() {
  const pd = S.pd;
  const extra = pd.answers ? `<div class="chips">${pd.answers.map(a => `<span class="chip"><span class="muted">${esc(a.name)}:</span> ${esc(a.a)}</span>`).join('')}</div>` : pd.scores ? `<div class="chips">${pd.scores.map(a => `<span class="chip">${esc(a.name)} <b class="gold">${a.s}</b></span>`).join('')}</div>` : '';
  const sh = S.me.shield ? `<div class="card gold center shieldwon"><div class="big-em">🛡️</div><h2>Aapko Shield mili</h2><div class="small">Aaj raat Traitors aapka murder nahi kar sakte. ${pd.shieldPublic ? 'Sabko pata hai.' : 'Ye sirf aap jaante hain — batana ya na batana aapki marzi.'}</div></div>` : pd.shieldPublic ? `<div class="hint">🛡️ <b>${esc(nm(pd.shieldPublic))}</b> ne Shield jeeti — aaj raat murder se immune.</div>` : '';
  return sh + `<div class="arena ${pd.win ? 'win' : 'lose'}"><div class="aem">${pd.win ? '💰' : '🍕'}</div><h2>MISSION ${pd.win ? 'SUCCESSFUL' : 'FAILED'}</h2><div class="cz ${pd.win ? 'green' : 'red'}">${pd.win ? '+₹' + pd.stake + ' prize money mein' : '₹' + pd.stake + ' party fund mein'}</div></div><div class="narr">${esc(pd.detail)}</div>${extra}<div class="wait">Circle of Shaq ke liye taiyaar ho jaaiye...</div>${S.me.isHost ? '<button class="btn ghost sm" id="skip">Aage badhein →</button>' : ''}`;
}

// TABLE
const CARDT = { sawaal: '❓ Seedha Sawaal', gumnaam: '🕶️ Gumnaam Chat', lie: '🤥 Lie Detector', eksach: '👁️ Ek Sach', andha: '🙈 Andha Vote', double: '⚔️ Double Banish', chuppi: '🤐 Chuppi' };
function tableCardHTML() {
  const pd = S.pd; if (!pd.card || pd.card === 'none') return '';
  let c = '';
  if (pd.card === 'sawaal') c = `<b>${esc(nm(pd.asker))}</b> ek seedha sawaal poochhega <b class="red">${esc(nm(pd.target))}</b> se. 10 sec mein jawab, ghumana nahi.`;
  if (pd.card === 'gumnaam') c = `Pehle 60 sec chat <b>anonymous</b> hai. Jo naam se nahi bol sakte, ab bolo.`;
  if (pd.card === 'lie') c = pd.lieResult ? `<div class="small">"${esc(pd.lieText)}" — ${esc(nm(pd.liar))}</div><div class="verdict ${pd.lieResult}">${pd.lieResult}</div><div class="tiny muted">(machine kabhi galat nahi hoti 😇)</div>` : pd.lieScanning ? `<div class="small">"${esc(pd.lieText)}"</div><div class="scan"><i></i></div><div class="tiny muted">Scanning...</div>` : S.mustLie ? `<b>Tum</b> Lie Detector pe ho. Ek statement likho.<input type="text" id="liein" maxlength="120" placeholder="Main Traitor nahi hoon..." style="margin-top:6px"><button class="btn sm" id="liego">Scan karo</button>` : `<b class="red">${esc(nm(pd.liar))}</b> Lie Detector pe hai. Statement ka intezaar...`;
  if (pd.card === 'eksach') c = `Server ek <b>asli</b> sach bata raha hai:<div class="narr">"${esc(pd.truth)}"</div>`;
  if (pd.card === 'andha') c = `Aaj vote <b>andha</b> — kisne kisko diya, nahi dikhega. Sirf natija.`;
  if (pd.card === 'double') c = `Aaj <b class="red">DO</b> log banished honge.`;
  if (pd.card === 'chuppi') c = `<b class="red">${esc(nm(pd.mute))}</b> aaj bol nahi sakta — sirf chat.`;
  return `<div class="card gold" style="margin:6px 0"><span class="card-tag">${CARDT[pd.card]}</span><div class="small" style="margin-top:6px">${c}</div></div>`;
}
function rTable() {
  const me = S.me;
  return `<div class="narr">Circle of Shaq mein padhaariye.</div>` + tableHTML({ center: CEN('CIRCLE OF SHAQ', '', '') + '<div class="em">🪑</div>', cls: 'sm' }) + `<div class="narr">Discuss karein. Shaq zaahir karein. Apna sach chhupaayein. <span class="muted small">(3 min)</span></div>` + tableCardHTML() +
    `<button class="btn" data-tab="chat">💬 Discussion mein apni baat rakhein</button>` +
    (me.isHost ? `<div class="row"><button class="btn ghost sm" id="extend">+1 minute aur</button><button class="btn ghost sm" id="endtable">Voting shuru karein →</button></div>` : '');
}

// VOTE
function rVote() {
  const pd = S.pd; const me = S.me;
  const canVote = me.alive && pd.voters.includes(me.id); const voted = !!S.myVote;
  const marks = doneMarks(pd.votedIds);
  const center = CEN(pd.revote ? 'TIE · RE-VOTE' : 'VOTE', '', '') + `<div class="em">🗳️</div>${pd.andha ? '<div class="tiny muted">andha</div>' : ''}${pd.dbl ? '<div class="tiny red">double</div>' : ''}`;
  const pickable = canVote && !voted ? (p => p.alive && pd.cands.includes(p.id) && p.id !== me.id) : null;
  let body;
  if (!canVote) body = `<div class="wait">${me.alive ? 'Is vote mein aap shaamil nahi hain.' : 'Baaki players vote kar rahe hain...'}</div>`;
  else if (voted) body = waiting(`Aapka vote: <b class="red">${esc(nm(S.myVote))}</b>`, pd.votedIds, pd.voters.length) + `<div class="hint">Sab ke vote lock hone par ek-ek karke reveal honge.</div>`;
  else body = `<div class="hint">Us player ko tap karein jise aap banish karna chahte hain</div><input type="text" id="reason" maxlength="60" placeholder="Reason ek line mein (sabke saamne padha jaayega)" value="${esc(local.reason)}" autocomplete="off"><button class="btn" id="votego" ${local.sel ? '' : 'disabled'}>${local.sel ? 'Vote: ' + esc(nm(local.sel)) : 'Ek naam chuniye'}</button>`;
  return tableHTML({ center, pickable, marks, cls: 'sm' }) + body;
}
function rReveal() {
  const pd = S.pd; const rev = pd.revealed || []; const last = rev[rev.length - 1];
  const tally = pd.tally || {}; const marks = {}; Object.entries(tally).forEach(([id, n]) => marks[id] = { cnt: n });
  const rows = aliveP().filter(p => pd.cands.includes(p.id) && tally[p.id]).sort((a, b) => tally[b.id] - tally[a.id]);
  const center = pd.andha ? `<div class="em">🙈</div><div class="tiny muted">andha vote</div>` : last ? `<div class="lbl">${esc(nm(last.voter))}</div><div class="tiny">↓</div><div class="mid ${last.poisoned ? 'dim' : ''}">${esc(nm(last.target))}</div>` : `<div class="lbl">VOTES REVEAL</div>`;
  return tableHTML({ center, marks, hot: last && !pd.andha ? last.target : null }) +
    `<div class="reveal">${pd.andha ? '<div class="narr">Votes secret rahenge. Sirf result.</div>' : last ? `<div class="who">${rev.length}/${pd.revealOrder.length} · ${esc(nm(last.voter))} ne vote diya</div><div class="tgt ${last.poisoned ? 'void' : ''}">${esc(nm(last.target))}</div>${last.poisoned ? '<div class="why red">☕ poison — vote cancel</div>' : last.reason ? `<div class="why">"${esc(last.reason)}"</div>` : ''}` : '<div class="wait">...</div>'}</div>
    <div class="chips">${rows.map(p => `<span class="chip">${esc(p.name)} <b class="gold">${tally[p.id]}</b></span>`).join('')}</div>`;
}

// BANISH
function rBanish() {
  const pd = S.pd; const me = S.me; const isMe = pd.current === me.id; const p = P(pd.current);
  if (!pd.revealed) return tableHTML({ center: `<div class="em">🪑</div><div class="mid">${esc(p.name)}</div>`, hot: p.id, cls: 'sm' }) + `<div class="narr big">Circle of Shaq ne apna faisla suna diya. Aap banished hain.</div>${isMe ? `<button class="btn gold" id="flip">Reveal: Innocent ya Traitor</button>` : `<div class="wait">${esc(p.name)} apna card reveal karne wala hai...</div>`}`;
  const t = pd.role === 'traitor';
  const pickable = isMe && pd.antim && !pd.suspect ? (x => x.alive && x.id !== me.id) : null;
  return tableHTML({ center: `<div class="em">${t ? '🗡️' : '💔'}</div><div class="mid ${t ? 'red' : ''}">${t ? 'TRAITOR' : 'INNOCENT'}</div>`, hot: p.id, pickable, cls: 'sm' }) +
    `<div class="narr big">"I was... ${t ? 'a <b class="red">TRAITOR</b>' : '<b class="gold">innocent</b>'}."</div><div class="center muted small">— ${esc(p.name)}</div>` +
    (pd.suspect ? `<div class="narr" style="margin-top:8px">Aakhri shaq 👉 <b class="red">${esc(nm(pd.suspect))}</b></div>` : pd.antim ? (isMe ? `<div class="hint">Jaate-jaate ek naam le sakte hain — 10 sec</div><button class="btn sm" id="antim" ${local.sel ? '' : 'disabled'}>${local.sel ? 'Shak: ' + esc(nm(local.sel)) : 'Mera aakhri shaq'}</button>` : `<div class="wait">${esc(p.name)} ke aakhri shabdon ka intezaar...</div>`) : '');
}
function rEndChoice() {
  const n = aliveP().length; const voted = local.endVoted;
  return tableHTML({ center: `<div class="em">⚖️</div><div class="mid">${n} BACHE</div>`, marks: doneMarks(S.pd.votedIds), cls: 'sm' }) + `<div class="narr">End Game. Sab ek mat hon tabhi game khatam hoga — warna ek aur banishment.</div><div class="hint">Yaad rahe — ek bhi Traitor bacha toh poori prize money uski.</div>` +
    (S.me.alive ? (voted ? waiting('Aapka vote lock', S.pd.votedIds, n) : `<div class="row"><button class="btn gold" data-end="end">End Game</button><button class="btn" data-end="more">Banish again</button></div>`) : '<div class="wait">Baaki players decide kar rahe hain...</div>');
}

// NIGHT
function rNight() {
  const me = S.me; const iT = me.role === 'traitor' && me.alive;
  if (!iT) return `<div class="nightsky"><div class="moon">🌙</div><div class="narr big">Raat ho gayi hai.</div><div class="narr muted">Aankhein band kijiye. Phone ulta rakhiye.<br>Traitors Turret mein mil rahe hain...</div></div>`;
  const pd = S.pd; const prop = S.tprop || {}; const mine = prop[me.id];
  const others = S.players.filter(p => p.role === 'traitor' && p.alive && p.id !== me.id);
  return `<div class="nightsky t"><div class="moon">🗡️</div><div class="cz red" style="font-size:16px;letter-spacing:.3em">THE TURRET</div><div class="tiny muted">Fellow Traitor: <b class="red">${others.map(o => esc(o.name)).join(', ') || 'aap akele hain'}</b></div></div>` +
    `<div class="hint">Aaj raat kise murder karna hai?</div>` + avRow(aliveP().filter(p => p.role !== 'traitor'), { pickable: p => true }) +
    `${Object.entries(prop).map(([id, v]) => `<div class="center small">${esc(nm(id))}: <b>${{ murder: '🔪 Murder', poison: '☕ Poison', recruit: '🤝 Recruit' }[v.action]} → ${esc(nm(v.target))}</b></div>`).join('')}` +
    `<div class="row"><button class="btn sm" data-night="murder" ${local.sel ? '' : 'disabled'}>🔪 Murder</button>${S.settings.masala ? `<button class="btn dark sm" data-night="poison" ${local.sel ? '' : 'disabled'}>☕ Poison</button>` : ''}</div>` +
    (pd.canRecruit ? `<button class="btn gold sm" data-night="recruit" ${local.sel ? '' : 'disabled'}>🤝 Recruit karein</button>` : '') +
    `<div class="hint">${S.settings.masala ? 'Poison: zinda rahega, par agla vote cancel — use pata nahi chalega. ' : ''}Dono Traitors same chunein toh turant ho jaayega.</div>` +
    `<button class="btn ghost sm" data-tab="traitors">🗡️ Turret chat mein plan karein</button>`;
}
function rRecruit() {
  if (S.recruitOffer) return `<div class="nightsky t"><div class="moon">🗡️</div><div class="cz red" style="font-size:18px">RECRUITMENT</div></div>` + `<div class="narr">Traitors aapko recruit karna chahte hain.</div><div class="hint"><b>Accept</b> = aap ab Traitor, prize money mein hissa. <b>Decline</b> = aaj raat aapka murder. Baaki players ko kabhi pata nahi chalega.</div><div class="row"><button class="btn gold" data-rec="1">Accept — main Traitor</button><button class="btn dark" data-rec="0">Decline</button></div>`;
  return `<div class="nightsky"><div class="moon">🌙</div><div class="narr muted">${isT() && S.me.alive ? 'Recruitment offer bhej diya. Jawab ka intezaar...' : 'Raat abhi baaki hai...'}</div></div>`;
}
function rMorning() {
  const pd = S.pd; const v = pd.victim; const me = S.me;
  if (!local.cardOpened) {
    const dead = v === me.id; const wasDeadBefore = !me.alive && !dead;
    const txt = dead ? `Afsos, ${esc(me.name)}.<br>Kal raat Traitors ne aapko murder kar diya.<br>Aap ab game se bahar hain.` : wasDeadBefore ? `Aap game se bahar hain.<br>Neeche dekhiye kal raat kya hua.` : pd.saved === me.id ? `Badhai ho, ${esc(me.name)}!<br>Kal raat Traitors ne aap par vaar kiya — par Shield ne aapko bacha liya.` : `Badhai ho, ${esc(me.name)}!<br>Aap aaj raat Traitors ke kahar se bach gaye.<br>Breakfast par aapka swagat hai.`;
    return `<div class="envwrap"><div class="env ${local.envOpen ? 'open' : ''} ${dead ? 'dead' : ''}" id="env"><div class="flap"></div><div class="letter"><div class="seal">🗡️</div><div class="ltxt">${txt}</div></div><div class="envfront"><div class="seal big">${dead ? '💀' : '🕯️'}</div><div class="cz gold" style="font-size:13px;letter-spacing:.3em">SUBAH KA SANDESH</div><div class="tiny muted">${esc(me.name)} ke liye</div></div></div></div>
    ${local.envOpen ? `<button class="btn gold" id="tobreak">Breakfast par chalein</button>` : `<div class="hint">Envelope tap karke kholein</div>`}`;
  }
  const arrived = S.players.filter(p => p.alive);
  const shown = arrived.slice(0, local.arrN || 0);
  return `<div class="arena"><div class="aem">🍳</div><h2>Breakfast</h2><div class="tiny muted">Players ek-ek karke aa rahe hain...</div></div>
  <div class="avrow">${shown.map(p => `<div class="seat inrow ${p.id === me.id ? 'me' : ''} arrive"><div class="av">${esc(initials(p.name))}</div><div class="pn">${esc(p.name)}</div></div>`).join('')}${(local.arrN || 0) >= arrived.length && v ? `<div class="seat inrow dead arrive"><div class="av">${esc(initials(nm(v)))}</div><div class="pn">${esc(nm(v))}</div></div>` : ''}</div>
  ${(local.arrN || 0) >= arrived.length ? `<div class="narr big" style="margin-top:8px">${esc(pd.text)}</div>${S.me.isHost ? '<button class="btn ghost sm" id="skip">Aage badhein →</button>' : ''}` : ''}`;
}

// // END
function rShareSteal() {
  const iT = S.pd.traitorIds && S.pd.traitorIds.includes(S.me.id);
  return `<div class="arena win"><div class="aem">💰</div><div class="big cz gold" style="font-size:34px">₹${S.pot}</div></div><div class="narr big">Traitors jeet gaye.</div><div class="hint">Dono Share = aadha-aadha. Ek Steal = sab uska. Dono Steal = dono ko kuch nahi, prize money party fund mein 🍕</div>` +
    (iT ? (S.myChoice ? `<div class="wait">Aapka faisla: <b>${S.myChoice.toUpperCase()}</b></div>` : `<div class="row"><button class="btn gold" data-ss="share">🤝 Share</button><button class="btn dark" data-ss="steal">🐍 Steal</button></div>`) : '<div class="wait">Traitors apna aakhri faisla le rahe hain...</div>');
}
function rFinal() {
  const r = S.finalResult; if (!r) return '';
  return `<div class="arena win"><div class="aem">${r.payouts.some(p => p.amt > 0) ? '🏆' : '🍕'}</div><div class="cz gold" style="font-size:34px">₹${r.pot}</div></div><div class="narr big">${esc(r.headline)}</div>
  <div class="rolelist center">${r.roles.map(x => `<span class="${x.role === 'traitor' ? 'tr' : 'fa'}">${x.role === 'traitor' ? '🗡️' : '🕯️'} ${esc(x.name)}${x.recruited ? ' ↩' : ''}${x.alive ? '' : ' ☠️'}</span>`).join('')}</div>
  <div class="card gold"><h3>Prize Money — aapas mein UPI se settle karein</h3>${r.payouts.map(p => `<div class="pay"><span>${esc(p.name)}${p.choice ? ` <span class="tiny muted">(${p.choice})</span>` : ''}</span><span class="amt">₹${p.amt}</span></div>`).join('')}<div class="pay"><span>🍕 Party Fund</span><span class="amt">₹${r.party}</span></div><div class="tiny muted" style="margin-top:6px">Missions ${r.missionsWon}W / ${r.missionsLost}L</div></div>
  <div class="card"><h3>Awards</h3>${awards(r)}</div>
  ${S.me.isHost ? '<button class="btn gold" id="again">Phir se khelein (same players)</button>' : '<div class="wait">Host phir se game shuru kar sakta hai.</div>'}
  <button class="btn ghost sm" id="leave">Palace chhod dein</button>`;
}
function awards(r) {
  const out = [];
  const surv = r.roles.filter(x => x.role === 'traitor' && x.alive);
  if (surv.length) out.push(`🐍 <b>Sabse Bada Traitor:</b> ${surv.map(x => esc(x.name)).join(', ')}`);
  const cnt = (want) => { const m = {}; r.report.forEach(v => v.votes.forEach(s => { const [a, b] = s.split('→'); const tb = r.roles.find(x => x.name === b); if (tb && tb.role === want) m[a] = (m[a] || 0) + 1; })); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]; };
  const w = cnt('faithful'); if (w) out.push(`🙈 <b>Sabse Bhola Innocent:</b> ${esc(w[0])} — ${w[1]} baar Innocent par ungli uthayi`);
  const d = cnt('traitor'); if (d) out.push(`🔍 <b>Detective:</b> ${esc(d[0])} — ${d[1]} baar Traitor ko sahi pehchaana`);
  const rec = r.roles.find(x => x.recruited); if (rec) out.push(`🔄 <b>Palti Maar:</b> ${esc(rec.name)}`);
  return out.map(x => `<div class="small" style="padding:4px 0">${x}</div>`).join('') || '<div class="muted small">—</div>';
}

// ---------- TABS ----------
function rChatTab(t) {
  const list = t ? (S.tchat || []) : S.chat;
  const items = list.map(m => `<div class="m ${m.sys ? 'sys' : ''} ${m.pid === S.me.id || (t && m.name === S.me.name) ? 'me' : ''} ${m.name && m.name.startsWith('🕶') ? 'anon' : ''}">${m.sys ? esc(m.text) : `<b>${esc(m.name)}</b>${esc(m.text)}`}</div>`).join('') || `<div class="chat-empty">${t ? 'Turret — sirf Traitors dekh sakte hain. Plan banaiye.' : 'Abhi kisi ne kuch nahi kaha.'}</div>`;
  const can = t ? (S.me.alive && isT()) : (S.me.alive || S.phase === 'LOBBY' || S.phase === 'FINAL');
  const open = t || ['TABLE', 'LOBBY', 'FINAL', 'MISSION_RESULT', 'MORNING'].includes(S.phase);
  const ctx = !t && S.phase === 'TABLE' ? tableCardHTML() : '';
  return `<div class="chatwrap">${ctx}<div class="chat ${t ? 't' : ''}" id="chatbox">${items}</div>${can && open ? `<div class="chatin"><input type="text" id="cin" maxlength="200" placeholder="${t ? 'Turret message...' : 'Apni baat rakhein...'}" autocomplete="off"><button id="send">➤</button></div>` : `<div class="hint">${!can ? 'Aap game se bahar hain — sirf dekh sakte hain.' : 'Chat sirf Circle of Shaq ke dauraan khulti hai.'}</div>`}</div>`;
}
function rLogTab() { return `<div class="log">${[...S.log].reverse().map(l => `<div class="${l.kind}">${esc(l.text)}</div>`).join('') || '<div class="chat-empty">Game abhi shuru nahi hua.</div>'}</div>`; }
function inviteLink() { return location.origin + location.pathname + '?r=' + S.code; }
function sheetHTML() {
  if (local.sheet === 'invite' && S) {
    const link = inviteLink(); const need = Math.max(0, 5 - S.players.length);
    const msg = `🗡️ The Traitors — Palace mein aapka invite hai.\nCode: ${S.code}\n${link}`;
    return `<div class="sheet" id="sheet"><div class="in">
    <div class="eyebrow">Palace code</div><div class="codebig" style="font-size:40px">${S.code}</div>
    <div class="hint">Fellow players app kholke ye code daalein — ya neeche ka link tap karein.</div>
    <input type="text" id="invlink" readonly value="${esc(link)}" style="font-size:14px;text-align:center" onclick="this.select()">
    <a class="btn green" href="https://wa.me/?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" style="text-decoration:none;text-align:center">WhatsApp par bhejein</a>
    <div class="row"><button class="btn dark sm" id="copyinv">📋 Copy karein</button>${navigator.share ? '<button class="btn dark sm" id="shareinv">📤 Share</button>' : ''}</div>
    <div class="center muted small">${S.players.length}/10 players palace mein${need ? ` · game ke liye kam se kam 5` : ''}</div>
    <button class="btn ghost" id="closesheet">Band karein</button></div></div>`;
  }
  if (local.sheet !== 'help') return '';
  return `<div class="sheet" id="sheet"><div class="in">
  <h2 class="gold" style="margin:0 0 8px">Game ke Rules</h2>
  <div class="steps"><div class="st"><b>🃏</b>Role</div><div class="st"><b>⚔️</b>Mission</div><div class="st"><b>🪑</b>Table</div><div class="st"><b>🗳️</b>Vote</div><div class="st"><b>🌙</b>Raat</div></div>
  <div class="small" style="line-height:1.5">
  <p><b class="gold">Palace:</b> 5 se 10 players, sab apne-apne phone par. Palace mein enter karte hi har player ₹50 prize money mein daalta hai (virtual — asli hisaab end mein UPI se). Khanjar ghoomta hai, aur do players chupke se <b class="red">Traitors</b> chune jaate hain. Baaki <b>Innocents</b>.</p>
  <p><b class="gold">Har din:</b><br>⚔️ <b>Mission</b> — sab milkar khelte hain. Successful = prize money +₹10 per player. Failed = wahi rakam party fund mein. Kuch missions mein 🛡️ <b>Shield</b> milti hai.<br>🪑 <b>Circle of Shaq</b> — discussion, phir har player secretly vote karta hai. Votes ek-ek karke sabke saamne reveal hote hain, reason ke saath.<br>🚪 <b>Banishment</b> — sabse zyada votes wala banished hota hai aur reveal karta hai: Innocent tha ya Traitor.<br>🌙 <b>Turret</b> — raat ko Traitors chupke se milte hain aur ek Innocent ko <b>murder</b> karte hain (ya poison, ya recruit).<br>🍳 <b>Breakfast</b> — subah pata chalta hai kaun nahi aaya.</p>
  <p><b class="gold">End Game:</b> Chaar players bache toh vote — game khatam ya ek aur banishment. Saare Traitors banished = prize money Innocents mein baraabar. Ek bhi Traitor bacha = poori prize money uski. Do Traitors bache = Share ya Steal.</p>
  <p class="muted tiny">Shield 🛡️ = ek raat murder se immunity. Poison ☕ = agla vote cancel, aapko pata nahi. Sabotage 💣 = kisi ek player ko secretly mission fail karne ka option milta hai.</p>
  </div><button class="btn ghost" id="closesheet">Samajh gaya</button></div></div>`;
}

// ---------- bind ----------
function bind() {
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el['on' + ev] = fn; };
  document.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => { local.tab = el.dataset.tab; render(); });
  bindSheet();
  document.querySelectorAll('[data-kick]').forEach(el => el.onclick = () => { if (S.phase === 'LOBBY' && S.me.isHost && confirm(`${nm(el.dataset.kick)} ko nikaalein?`)) socket.emit('kick', el.dataset.kick); });
  document.querySelectorAll('[data-stake]').forEach(el => el.onclick = () => socket.emit('settings', { stake: Number(el.dataset.stake) }));
  on('#adult', 'click', () => socket.emit('settings', { adult: !S.settings.adult }));
  on('#masala', 'click', () => socket.emit('settings', { masala: !S.settings.masala }));
  on('#settoggle', 'click', () => { local.setOpen = !local.setOpen; render(); });
  on('#start', 'click', () => socket.emit('start'));
  on('#leave', 'click', () => { socket.emit('leave'); roomCode = ''; localStorage.removeItem('tt_room'); S = null; render(); });
  on('#rc', 'click', () => { local.flipped = !local.flipped; vib(20); render(); });
  on('#showcard', 'click', () => { local.showCard = true; render(); });
  on('#ready', 'click', () => socket.emit('ready'));
  document.querySelectorAll('[data-pick]').forEach(el => el.onclick = () => { local.sel = local.sel === el.dataset.pick ? null : el.dataset.pick; vib(10); render(); });
  document.querySelectorAll('[data-m]').forEach(el => el.onclick = () => socket.emit('mission', el.dataset.m));
  on('#syncgo', 'click', () => { const v = $('#syncin').value.trim(); if (!v) return toast('Kuch likho'); socket.emit('mission', v); });
  on('#kadi1', 'click', () => socket.emit('mission', local.sel));
  on('#kadigo', 'click', () => socket.emit('mission', local.sel));
  document.querySelectorAll('[data-tw]').forEach(el => el.onclick = () => { local.multi = local.multi || []; const id = el.dataset.tw; local.multi = local.multi.includes(id) ? local.multi.filter(x => x !== id) : [...local.multi, id]; vib(8); render(); });
  on('#twgo', 'click', () => socket.emit('mission', local.multi || []));
  on('#twnone', 'click', () => socket.emit('mission', []));
  on('#chupgo', 'click', () => socket.emit('mission', local.sel));
  document.querySelectorAll('[data-chup]').forEach(el => el.onclick = () => socket.emit('mission', 'none'));
  on('#sab', 'click', () => { if (confirm('Pakka? Mission fail ho jaayega. Kisi ko pata nahi chalega.')) { socket.emit('sabotage'); toast('💣 Sabotage ho gaya.'); } });
  on('#racego', 'click', () => socket.emit('mission', local.raceScore));
  on('#pzgo', 'click', () => { const v = $('#pzin').value.trim(); if (!v) return; socket.emit('mission', v, (r) => { if (r && r.correct) { vib([30, 30, 80]); toast('✅ Sahi!'); } else { vib(80); toast('❌ Galat — phir try karo'); const el = $('#pzin'); if (el) { el.value = ''; el.focus(); } } }); });
  const pz = $('#pzin'); if (pz) pz.onkeydown = (e) => { if (e.key === 'Enter') $('#pzgo').click(); };
  on('#gsend', 'click', () => { const el = $('#gin'); const v = el.value.trim(); if (!v) return; socket.emit('gchat', v); el.value = ''; el.focus(); });
  const gi = $('#gin'); if (gi) gi.onkeydown = (e) => { if (e.key === 'Enter') $('#gsend').click(); };
  document.querySelectorAll('[data-mem]').forEach(el => el.onclick = () => { local.mem = local.mem || []; if (local.mem.length < 6) local.mem.push(el.dataset.mem); vib(8); render(); });
  on('#memundo', 'click', () => { (local.mem || []).pop(); render(); });
  on('#memgo', 'click', () => socket.emit('mission', local.mem));
  const mathNext = (skip) => { local.mathAns = local.mathAns || []; const el = $('#mathin'); local.mathAns.push(skip || !el || el.value === '' ? null : Number(el.value)); if (local.mathAns.length >= 15) socket.emit('mission', local.mathAns); else render(); };
  on('#mathgo', 'click', () => mathNext(false)); on('#mathskip', 'click', () => mathNext(true));
  on('#mathdone', 'click', () => socket.emit('mission', local.mathAns || []));
  const mi = $('#mathin'); if (mi) { mi.focus(); mi.onkeydown = (e) => { if (e.key === 'Enter') mathNext(false); }; }
  on('#env', 'click', () => { if (!local.envOpen) { local.envOpen = true; vib(30); render(); } });
  on('#tobreak', 'click', () => { local.cardOpened = true; local.arrN = 0; render(); const total = S.players.filter(p => p.alive).length; const step = () => { if (S.phase !== 'MORNING') return; local.arrN = (local.arrN || 0) + 1; vib(10); render(); if (local.arrN < total) setTimeout(step, 700); else vib([60, 40, 200]); }; setTimeout(step, 400); });
  const gb = $('#gchatbox'); if (gb) gb.scrollTop = gb.scrollHeight;
  const rt = $('#rt'); if (rt) rt.onpointerdown = (e) => { e.preventDefault(); local.raceScore++; $('#rs').textContent = local.raceScore; vib(8); const box = $('#race'); rt.style.left = Math.random() * (box.clientWidth - 70) + 'px'; rt.style.top = Math.random() * (box.clientHeight - 70) + 'px'; };
  on('#extend', 'click', () => socket.emit('extend'));
  on('#endtable', 'click', () => { if (confirm('Discussion khatam. Voting shuru karein?')) socket.emit('endTable'); });
  on('#skip', 'click', () => socket.emit('skip'));
  on('#liego', 'click', () => { const v = $('#liein').value.trim(); if (!v) return toast('Kuch likho'); socket.emit('lie', v); });
  on('#votego', 'click', () => { local.reason = ($('#reason') || {}).value || ''; socket.emit('vote', { target: local.sel, reason: local.reason }); vib(30); });
  const rs = $('#reason'); if (rs) rs.oninput = () => local.reason = rs.value;
  on('#flip', 'click', () => socket.emit('flip'));
  on('#antim', 'click', () => socket.emit('antim', local.sel));
  document.querySelectorAll('[data-end]').forEach(el => el.onclick = () => { local.endVoted = true; socket.emit('endChoice', el.dataset.end); render(); });
  document.querySelectorAll('[data-night]').forEach(el => el.onclick = () => socket.emit('night', { action: el.dataset.night, target: local.sel }));
  document.querySelectorAll('[data-rec]').forEach(el => el.onclick = () => socket.emit('recruit', el.dataset.rec === '1'));
  document.querySelectorAll('[data-ss]').forEach(el => el.onclick = () => socket.emit('shareSteal', el.dataset.ss));
  on('#again', 'click', () => socket.emit('again'));
  on('#send', 'click', () => sendChat());
  const ci = $('#cin'); if (ci) ci.onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };
}
function copyText(t) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => copyFallback(t)); return Promise.resolve(copyFallback(t)); }
function copyFallback(t) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.focus(); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); return ok; }
function bindSheet() {
  const ci = $('#copyinv'); if (ci) ci.onclick = () => { copyText(`Code: ${S.code}\n${inviteLink()}`).then(ok => { if (ok) toast('Copy ho gaya — WhatsApp pe paste karein'); else { const l = $('#invlink'); l.select(); toast('Link select ho gaya — copy karein'); } }); };
  const si = $('#shareinv'); if (si) si.onclick = () => navigator.share({ title: 'The Traitors', text: `🗡️ The Traitors — Palace code: ${S.code}`, url: inviteLink() }).catch(() => { });
  document.querySelectorAll('[data-sheet]').forEach(el => el.onclick = () => { local.sheet = el.dataset.sheet; S ? render() : renderHome(); }); const c = $('#closesheet'); if (c) c.onclick = () => { local.sheet = null; S ? render() : renderHome(); }; const sh = $('#sheet'); if (sh) sh.onclick = (e) => { if (e.target === sh) { local.sheet = null; S ? render() : renderHome(); } }; }
function sendChat() { const el = $('#cin'); if (!el) return; const v = el.value.trim(); if (!v) return; socket.emit(local.tab === 'traitors' ? 'tchat' : 'chat', v); el.value = ''; el.focus(); }

// preserve chat input across re-renders
let typing = null;
const KEEP = ['cin', 'gin', 'pzin', 'syncin', 'mathin', 'reason', 'liein'];
document.addEventListener('focusin', (e) => { typing = KEEP.includes(e.target.id) ? e.target.id : null; });
const _render = render;
render = function () { const t = typing; const val = t ? ($('#' + t) || {}).value : null; _render(); if (t) { const el = $('#' + t); if (el) { if (val && !el.value) el.value = val; el.focus({ preventScroll: true }); } } };

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
