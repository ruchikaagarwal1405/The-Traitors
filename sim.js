// full-game bot simulation
const { io } = require('socket.io-client');
const URL = process.env.URL || 'http://localhost:3000';
const N = 6; const bots = []; let code = null; let phaseSeen = new Set(); let errors = 0;
const rnd = a => a[Math.floor(Math.random() * a.length)];
function mk(i) {
  return new Promise(res => {
    const s = io(URL, { transports: ['websocket'] }); const token = 'bot' + i; const name = 'Bot' + i;
    const b = { s, token, name, st: null, acted: {} }; bots.push(b);
    s.on('connect', () => {
      if (i === 0) s.emit('create', { name, token }, r => { code = r.code; res(); });
      else s.emit('join', { code, name, token }, r => { if (r.error) console.log('join err', r.error); res(); });
    });
    s.on('state', st => { b.st = st; act(b); });
  });
}
function act(b) {
  const st = b.st; const key = st.phase + ':' + st.round + ':' + (st.pd.step || '') + ':' + (st.pd.revote ? 'r' : '') + ':' + (st.pd.current || '') + ':' + (st.deadline || '');
  if (!phaseSeen.has(st.phase)) { phaseSeen.add(st.phase); console.log('PHASE', st.phase, 'pot', st.pot, 'party', st.partyFund, 'alive', st.aliveCount); }
  if (b.acted[key]) return; 
  const me = st.me; const alive = st.players.filter(p => p.alive && p.id !== me.id);
  const delay = 200 + Math.random() * 600;
  const once = (fn) => { b.acted[key] = true; setTimeout(fn, delay); };
  switch (st.phase) {
    case 'LOBBY': if (me.isHost && st.players.length === N && !b.started) { b.started = true; once(() => { b.s.emit('settings', { stake: 50 }); b.s.emit('start'); }); } break;
    case 'ROLES': once(() => b.s.emit('ready')); break;
    case 'MISSION':
      if (!me.alive) break;
      if (st.pd.type === 'dhokha' && st.mySub === undefined) once(() => b.s.emit('mission', Math.random() < .8 ? 'saath' : 'dhokha'));
      else if (st.pd.type === 'sync' && st.mySub === undefined) once(() => b.s.emit('mission', Math.random() < .7 ? 'chai' : 'coffee'));
      else if (st.pd.type === 'kadi') { if (st.pd.step === 1 && st.mySub === undefined) once(() => b.s.emit('mission', rnd(alive).id)); else if (st.pd.step === 2 && st.pd.kadi === me.id) once(() => b.s.emit('mission', rnd(alive).id)); }
      else if (st.pd.type === 'race' && st.mySub === undefined) once(() => b.s.emit('mission', Math.floor(Math.random() * 12)));
      else if (st.pd.type === 'puzzle') { if (st.myGroup && !st.groupSolved && !b.acted[key+'p']) { b.acted[key+'p']=true; setTimeout(() => { b.s.emit('gchat', 'hmm socho'); b.s.emit('mission', Math.random() < .5 ? 'galat' : '42'); }, delay); } }
      else if (st.pd.type === 'pairs' && st.mySub === undefined) once(() => b.s.emit('mission', Math.random() < .6 ? 'aam' : 'kela'));
      else if (st.pd.type === 'memory' && st.mySub === undefined && !st.pd.seq) once(() => b.s.emit('mission', ['🍎','🐍','🗡️','👑','🕯️','💀']));
      else if (st.pd.type === 'math' && st.mySub === undefined) once(() => b.s.emit('mission', [5, 10, null, 20]));
      else if (st.pd.type === 'twister') { if (st.pd.step === 2 && st.mySub2 === undefined) once(() => b.s.emit('mission', Math.random() < .5 ? [] : [rnd(alive).id])); }
      else if (st.pd.type === 'chup') { if (st.pd.step === 2 && st.mySub2 === undefined) once(() => b.s.emit('mission', Math.random() < .5 ? 'none' : rnd(alive).id)); }
      if (st.canSabotage && Math.random() < .3) b.s.emit('sabotage');
      break;
    case 'TABLE': if (me.alive) { once(() => { b.s.emit('chat', 'mujhe lagta hai ' + rnd(alive).name + ' hai'); if (st.mustLie) b.s.emit('lie', 'main innocent hoon'); if (me.isHost) setTimeout(() => b.s.emit('endTable'), 3000); }); } break;
    case 'VOTE': if (me.alive && !st.myVote && st.pd.voters.includes(me.id)) { const c = alive.filter(p => st.pd.cands.includes(p.id)); if (c.length) once(() => b.s.emit('vote', { target: rnd(c).id, reason: 'shak hai' })); } break;
    case 'BANISH': if (st.pd.current === me.id) { if (!st.pd.revealed) once(() => b.s.emit('flip')); else if (st.pd.antim && !st.pd.suspect) { b.acted[key + 'a'] = true; setTimeout(() => b.s.emit('antim', rnd(alive).id), delay); } } break;
    case 'END_CHOICE': if (me.alive) once(() => b.s.emit('endChoice', Math.random() < .5 ? 'end' : 'more')); break;
    case 'NIGHT': if (me.alive && me.role === 'traitor') { const t = alive.filter(p => p.role !== 'traitor'); if (t.length) once(() => { b.s.emit('tchat', 'isko maarte hain'); const act = st.pd.canRecruit && Math.random() < .5 ? 'recruit' : (Math.random() < .3 ? 'poison' : 'murder'); b.s.emit('night', { action: act, target: t[0].id }); }); } break;
    case 'RECRUIT': if (st.recruitOffer) once(() => b.s.emit('recruit', Math.random() < .6)); break;
    case 'MISSION_RESULT': if (me.isHost) once(() => setTimeout(() => b.s.emit('skip'), 1500)); break;
    case 'MORNING': if (me.isHost) once(() => setTimeout(() => b.s.emit('skip'), 1500)); break;
    case 'SHARE_STEAL': if (st.pd.traitorIds && st.pd.traitorIds.includes(me.id) && !st.myChoice) once(() => b.s.emit('shareSteal', Math.random() < .5 ? 'share' : 'steal')); break;
    case 'FINAL': if (!b.done) { b.done = true; if (me.isHost) { console.log('\n=== FINAL ===\n' + JSON.stringify(st.finalResult, null, 1).slice(0, 1500)); console.log('\nLOG:'); st.log.forEach(l => console.log(' -', l.text)); setTimeout(() => process.exit(0), 500); } } break;
  }
}
(async () => { for (let i = 0; i < N; i++) await mk(i); setTimeout(() => { console.log('TIMEOUT; phases:', [...phaseSeen]); process.exit(1); }, 170000); })();
