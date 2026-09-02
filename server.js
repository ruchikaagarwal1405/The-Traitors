const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false }));
app.get('/', (req, res) => res.status(500).send('<h2>public/ folder missing on server.</h2><p>GitHub repo mein <b>public</b> folder (index.html, app.js, style.css, sw.js, manifest.json, icon.svg) upload karo, phir Render redeploy hoga.</p>'));

const PORT = process.env.PORT || 3000;
const rooms = {};
const MAX_STAKE = 50;
const MISSION_STAKE = 10;

// ---------- helpers ----------
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const now = () => Date.now();
const genCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)]; return rooms[s] ? genCode() : s; };

function alive(room) { return Object.values(room.players).filter(p => p.alive); }
function traitors(room) { return alive(room).filter(p => p.role === 'traitor'); }
function faithful(room) { return alive(room).filter(p => p.role === 'faithful'); }
function pname(room, id) { return room.players[id] ? room.players[id].name : '?'; }

const TIMESCALE = Number(process.env.TIMESCALE || 1);
function setTimer(room, ms, fn) {
  ms = Math.round(ms * TIMESCALE);
  clearTimeout(room._timer);
  room.deadline = now() + ms;
  room._timer = setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, ms);
}
function clearTimer(room) { clearTimeout(room._timer); room.deadline = null; }

function log(room, text, kind = 'info') {
  room.log.push({ t: now(), text, kind });
  if (room.log.length > 200) room.log.shift();
}

// ---------- content ----------
const NARR = {
  welcome: 'Palace mein aapka swagat hai. Aap sab Innocents hain... par aap mein kuch Traitors bhi hain. Kaun? Ye sirf wo jaante hain.',
  roles: 'Apna card dekhiye. Kisi ko mat dikhaiye. Aur aaj se... kisi par bharosa mat kijiye.',
};

const SYNC_Q = [
  'Jaipur ka sabse famous khana? (ek shabd)', 'Chai ya Coffee?', 'Pizza ya Burger?', 'Ek number bolo: 1 se 5', 'Bollywood ka sabse bada star? (ek naam)',
  'Sabse best IPL team? (short naam)', 'Ek color bolo', 'Weekend ka best plan? (ek shabd)', 'Sabse overrated cheez: Goa ya Manali?', 'Cricket ya Football?',
  'Sabse best Shah Rukh movie? (ek shabd)', 'Momos ya Golgappe?', 'Sardi ya Garmi?', 'Netflix ya YouTube?', 'Ek din ka superpower: Udna ya Gayab hona?',
  'Biryani ya Dal-Chawal?', 'Beach ya Pahad?', 'Subah ya Raat?', 'Instagram ya YouTube?', 'Mumbai ya Delhi?', 'Samosa ya Kachori?', 'Dhoni ya Kohli?', 'Marvel ya DC?',
  'Pani puri ya Pav bhaji?', 'Train ya Flight?', 'Superpower: Mind reading ya Time travel?', 'Gaana ya Dance?', 'Cake ya Ice cream?', 'Sardi ki subah: Chai ya Rajai?',
  'Sabse best Hrithik movie? (ek shabd)', 'Sabse best web series? (ek shabd)', 'Subah uthke pehle: Phone ya Paani?', 'Hostel ya Ghar?', 'Ludo ya Carrom?', 'Movie: Theatre ya OTT?',
  'Ek sabzi jo sabko nahi pasand (ek shabd)', 'Rajasthan ka sabse famous khana? (ek shabd)', 'Ek number bolo: 1 se 10', 'Dal Baati ya Chole Bhature?', 'Sabse best Ranbir movie? (ek shabd)'
];
const CHUP_LINES = [
  'Main ek nimbu hoon aur mujhe nichoda ja raha hai.', 'Mere pet mein bhains ka call aa raha hai.', 'Meri ammi ne kaha tha tum sab se door raho.',
  'Aaj raat main murga banke sounga.', 'Mujhe lagta hai mere mauze ek doosre se pyaar karte hain.', 'Main golgappe ko rishta bhejne wala tha.',
  'Mere andar ek chhota Karan Johar rehta hai jo rota rehta hai.', 'Kal maine apne tashiye se breakup kiya.', 'Mujhe paneer se allergy hai par main phir bhi khaata hoon, main hi Traitor hoon.',
  'Meri bike mujhse zyada wafadar hai tum sab se.', 'Main jab akela hota hoon toh mirror se bahas karta hoon aur haar jaata hoon.', 'Mujhe raat ko 3 baje bhindi yaad aati hai.',
  'Main is table ka sabse sundar insaan hoon, koi hasse mat.', 'Meri chappal ne mujhe block kar diya.', 'Mera dil ek samose ki tarah hai — bahar crispy, andar aloo.',
  'Main roz subah apne paudhe ko good morning bolta hoon aur wo ignore karta hai.', 'Main paani bhi chaba-chaba ke peeta hoon.', 'Mujhe lagta hai main pichhle janam mein pressure cooker tha.',
  'Main WiFi ke liye padosi se dosti kar chuka hoon.', 'Main Uber driver se rating maang leta hoon.', 'Mera favourite exercise fridge tak chalna hai.', 'Main shaadi mein sirf paneer ke liye jaata hoon.',
  'Main gaane ki lyrics galat gaata hoon, par poore confidence se.', 'Kal maine apni parchhai se race lagayi aur haar gaya.', 'Main is table pe sabse zyada Innocent lagta hoon, isliye shak mat karna. Please.',
  'Mere sapne mein bhi mujhe Traitor bana diya jaata hai.', 'Main ATM se paise nikalte waqt use shukriya bolta hoon.', 'Meri mummy aaj bhi puchti hain doodh piya, aur main jhooth bolta hoon.', 'Mere ghutne mausam se pehle baarish bata dete hain.'
];
const TWISTERS = [
  'Kachcha papad, pakka papad — 5 baar lagataar, bina ruke.',
  'Chandu ke chacha ne Chandu ki chachi ko Chandni Chowk mein chandni raat mein chandi ke chammach se chatni chatai.',
  'Khadak Singh ke khadakne se khadakti hain khidkiyan, khidkiyon ke khadakne se khadakta hai Khadak Singh.',
  'Peetal ke patile mein papita pada, papite ko pakad ke Pappu ne peetal ke patile mein pheka.',
  'Samajh samajh ke samajh ko samjho, samajh samajhna bhi ek samajh hai. Samajh samajh ke jo na samjhe, meri samajh mein wo nasamajh hai.',
  'Pakke ped par paka papita, paka ped ya paka papita. Pake ped ko pakde Pinku, Pinku pakde paka papita.',
  'Tola Ram tala tol ke tel mein tal gaya, tala tol ke tel mein tal gaya Tola Ram.',
  'Doodh dahi dhoop dhool, dhool dhoop dahi doodh — 3 baar tez.',
  'Nandu ke nana ne Nandu ki nani ko Nainital mein nau nau nimbu ka nimbu paani pilaya.',
  'Jaipur ke jalebi wale Jagdish ne jaldi jaldi jalebi jama ke jhatpat jhaadi mein jhonk di.',
  'Kaale kauve ki kaali kaan mein kaala kaanta, kaala kaanta kaali kaan kaale kauve ki.',
  'Pappu ke papa ne Pappu ko papad pakdaya, papad pakad Pappu pichhle pahar pahunch gaya.',
  'Saat sant, sant saat, saat sant saath saath — 4 baar.',
  'Rani ke raja ne Ranchi mein rangi rangoli rangwayi, rangoli rang ke rani rangeeli.',
  'Talwaar mein taal, taal mein talwaar, talwaar taal talwaar taal — 4 baar.',
  'Gaadi ke gadde ki gaddi, gaddi ke gadde ki gaadi — 4 baar.',
  'Laal lakdi ka lamba lattoo, lambi lakdi laal lattoo — 4 baar.',
  'Bandar ne bandariya ko band bagiche mein bandhi bandook se banaya bandhua.',
  'Ooncha oont, oont ooncha, oonche oont par oonchi oonth — 3 baar.',
  'Sooji ka samosa, samose mein sooji, sooji samosa samosa sooji — 4 baar.',
  'Khidki khadi, khadi khidki, khadi khidki khadkhadi — 4 baar.',
  'Chhote chhote chhinke mein chhoti chhipkali chhupke chhupke chhat par chadhi.',
  'Kaali kalai ki kaali kali, kaali kali ki kaali kalai — 4 baar.',
  'Bhola bhaalu bhaage bhaage bhaari bhaari bhindi bharke bhaiya ke bhandaar mein bhar aaya.',
  'She sells seashells by the seashore, the shells she sells are surely seashells.',
  'Peter Piper picked a peck of pickled peppers. If Peter Piper picked a peck of pickled peppers, where is the peck of pickled peppers Peter Piper picked?',
  'How much wood would a woodchuck chuck if a woodchuck could chuck wood?',
  'Red lorry, yellow lorry — 5 baar tez.',
  'Unique New York, unique New York — 5 baar tez.',
  'Irish wristwatch, Swiss wristwatch — 4 baar.',
  'The sixth sick sheikh\'s sixth sheep\'s sick.',
  'Pad kid poured curd pulled cod — 3 baar (duniya ka sabse mushkil).',
  'Toy boat, toy boat, toy boat — 6 baar tez.',
  'Betty Botter bought some butter, but she said the butter\'s bitter. If I put it in my batter, it will make my batter bitter.',
  'Which wristwatches are Swiss wristwatches? — 3 baar.',
  'Six slippery snails slid slowly seaward.',
  'Black background, brown background — 5 baar tez.',
  'Rubber baby buggy bumpers — 5 baar tez.',
  'Fresh fried fish, fish fresh fried, fried fish fresh — 3 baar.',
  'I slit the sheet, the sheet I slit, and on the slitted sheet I sit.',
  'A proper copper coffee pot — 5 baar tez.',
  'Eleven benevolent elephants — 4 baar tez.',
];
const ADULT_EXTRA = [
  'Kal raat maine apne ex ko 2 baje "hi" bheja tha.', 'Mujhe sabse zyada dar apni browser history se lagta hai.', 'Main is room mein kisi pe crush rakhta hoon aur wo abhi mujhe dekh raha hai.'
];

const PUZZLES = [
  { q: 'Main bina pairon ke daudta hoon, bina munh ke bolta hoon. Kaun?', a: ['nadi', 'river', 'ghadi', 'clock'] },
  { q: 'Jitna zyada lete ho, utna peeche chhodte ho. Kya?', a: ['kadam', 'footsteps', 'steps', 'pair', 'qadam'] },
  { q: 'Anagram solve karo: L A B O L W Y O D (ek shabd)', a: ['bollywood'] },
  { q: 'Series poori karo: 2, 6, 12, 20, 30, ?', a: ['42'] },
  { q: 'Series poori karo: 1, 1, 2, 3, 5, 8, 13, ?', a: ['21'] },
  { q: 'Mere paas chaabi hai par taala nahi, jagah hai par kamra nahi. Kya?', a: ['keyboard', 'piano'] },
  { q: 'Anagram solve karo: R E K C T I C (ek khel)', a: ['cricket'] },
  { q: 'Agar 3 billi 3 minute mein 3 chuhe pakadti hain, toh 100 billi 100 chuhe kitne minute mein?', a: ['3', 'teen', '3 minute'] },
  { q: 'Ek aadmi ke paas 5 bete hain, har bete ki ek behen hai. Kul kitne bachche?', a: ['6', 'chhe', 'che'] },
  { q: 'Anagram solve karo: A I R S T H T A R (ek shehar)', a: ['rashtriya', 'tarashtri', 'hathrasit', 'rajasthan'] },
  { q: 'Kaunsa mahina 28 din ka hota hai?', a: ['sab', 'sabhi', 'all', 'har mahina', 'sare', 'saare', 'every month', 'har'] },
  { q: 'Series poori karo: J, F, M, A, M, J, J, ?', a: ['a', 'august', 'aug'] },
  { q: 'Jo bhi ise banata hai use nahi chahiye, jo kharidta hai wo use nahi karta, jo use karta hai use pata nahi. Kya?', a: ['coffin', 'taboot', 'kafan'] },
  { q: 'Main raat ko aata hoon bina bulaye, din mein gayab bina churaye. Kaun?', a: ['taare', 'tare', 'stars', 'star', 'sitare', 'chand', 'moon'] },
  { q: '7 × 8 − 6 ÷ 2 = ?', a: ['53'] },
  { q: 'Anagram solve karo: T N E R T I N E (ek cheez jo sab use karte hain)', a: ['internet'] },
  { q: 'Series poori karo: 3, 9, 27, 81, ?', a: ['243'] },
  { q: 'Series poori karo: 1, 4, 9, 16, 25, ?', a: ['36'] },
  { q: 'Series poori karo: 1, 2, 4, 8, 16, ?', a: ['32'] },
  { q: 'Series poori karo: 100, 81, 64, 49, ?', a: ['36'] },
  { q: 'Series poori karo: 2, 3, 5, 7, 11, 13, ?', a: ['17'] },
  { q: 'Series poori karo: A, C, F, J, O, ?', a: ['u'] },
  { q: 'Series poori karo: 1, 11, 21, 1211, 111221, ?', a: ['312211'] },
  { q: 'Anagram solve karo: M A S O S A (ek nashta)', a: ['samosa'] },
  { q: 'Anagram solve karo: L A N A M I (ek hill station)', a: ['manali'] },
  { q: 'Anagram solve karo: R A J U I P (ek shehar)', a: ['jaipur'] },
  { q: 'Anagram solve karo: T A P I C A N (cricket team ka)', a: ['captain'] },
  { q: 'Anagram solve karo: R O T S I T A E R H T (is game ka naam)', a: ['the traitors', 'traitors', 'thetraitors'] },
  { q: '(15 + 5) × 3 − 20 ÷ 4 = ?', a: ['55'] },
  { q: '9 × 9 − 9 = ?', a: ['72'] },
  { q: 'Ek dozen ka aadha + ek score (20) ka chauthai = ?', a: ['11', 'gyarah'] },
  { q: 'Agar RED = 27 (R=18, E=5, D=4) toh CAB = ?', a: ['6', 'chhe', 'che'] },
  { q: 'Do baap aur do bete gaye, sabne ek-ek machhli pakdi, kul 3 machhli aayi. Kitne log the?', a: ['3', 'teen'] },
  { q: 'Ghadi 3 baje 3 baar bajti hai 3 second mein. 6 baje 6 baar kitne second mein?', a: ['7.5', '75', 'saade saat', 'sade sat', 'sade saat', '7.5 second'] },
  { q: 'Agar 5 machine 5 minute mein 5 cheezein banati hain, 100 machine 100 cheezein kitne minute mein?', a: ['5', 'paanch', 'panch', '5 minute'] },
  { q: 'Ek kisan ke paas 17 bhed thi, sab mar gayi siwaye 9 ke. Kitni bachi?', a: ['9', 'nau', 'no'] },
  { q: 'Kitne mahine 31 din ke hote hain?', a: ['7', 'saat', 'sat'] },
  { q: 'Jitna sukhata hai, utna geela hota hai. Kya?', a: ['tauliya', 'towel', 'toliya'] },
  { q: 'Mere paas aankhein hain par dekh nahi sakta. Kya?', a: ['aalu', 'aloo', 'potato', 'alu', 'sui', 'needle', 'toofan', 'storm'] },
  { q: 'Kaunsa kamra bina darwaze aur khidki ka hota hai?', a: ['mushroom', 'khumb', 'khumbi'] },
  { q: 'Ek jagah jahan Friday, Thursday se pehle aata hai?', a: ['dictionary', 'shabdkosh'] },
  { q: 'Main din mein tumhare peeche chalta hoon, raat ko gayab. Kaun?', a: ['parchhai', 'parchai', 'shadow', 'saya', 'chhaya', 'chaya'] },
  { q: 'Tumhara hai par doosre isko tumse zyada use karte hain. Kya?', a: ['naam', 'name', 'nam'] },
  { q: 'Mera ek beta doctor hai, par main doctor ka baap nahi. Main kaun?', a: ['maa', 'ma', 'mummy', 'mother', 'mom', 'mata'] },
  { q: 'Ek shabd batao jo 26 letters ka ho.', a: ['alphabet'] },
  { q: 'Kaunsa shabd ulta likhne par bhi wahi rehta hai: NITIN, ROHIT ya AMAN?', a: ['nitin'] },
  { q: 'Do din jo saath aate hain par unke naam mein "day" nahi?', a: ['aaj kal', 'aaj aur kal', 'today tomorrow', 'today and tomorrow', 'kal aur aaj', 'aaj or kal', 'kal aaj'] },
  { q: 'Emoji movie: 3️⃣ 🤪', a: ['3 idiots', 'three idiots', '3idiots', 'idiots'] },
  { q: 'Emoji movie: 🏏 🇬🇧 🌾', a: ['lagaan', 'lagan'] },
  { q: 'Emoji movie: ⚔️ 👑 🐘', a: ['bahubali', 'baahubali', 'bahubali 2', 'baahubali 2'] },
  { q: 'Emoji movie: 👧👧 🤼', a: ['dangal'] },
  { q: 'Emoji movie: 🚂 ❤️ 🇨🇭 (SRK)', a: ['ddlj', 'dilwale dulhania le jayenge', 'dilwale dulhaniya le jayenge', 'dilwale'] },
  { q: 'Emoji movie: 👽 🔔 (Aamir)', a: ['pk'] },
  { q: 'Emoji movie: 🚀 🔴 🇮🇳', a: ['mission mangal', 'missionmangal'] },
  { q: 'Emoji movie: 🧊 🚢 💔', a: ['titanic'] },
  { q: 'Emoji movie: 🧙‍♂️ ⚡ 👓', a: ['harry potter', 'harrypotter'] },
  { q: 'Emoji movie: 🐯 🚣 🌊', a: ['life of pi', 'lifeofpi'] },
  { q: 'Emoji series: 💰 🏦 🎭 🔴', a: ['money heist', 'moneyheist', 'la casa de papel'] },
];
const PAIR_Q = ['Dono ek hi fruit bolo', 'Dono ek hi number bolo (1 se 5)', 'Dono ek hi color bolo', 'Dono ek hi Bollywood actor bolo', 'Dono ek hi Indian city bolo', 'Dono ek hi janwar bolo', 'Dono ek hi sabzi bolo', 'Dono ek hi mithai bolo', 'Dono ek hi cricketer bolo', 'Dono ek hi superhero bolo', 'Dono ek hi mahina bolo', 'Dono ek hi fast food bolo', 'Dono ek hi Bollywood movie bolo', 'Dono ek hi drink bolo', 'Dono ek hi weekday bolo', 'Dono ek hi body part bolo', 'Dono ek hi vehicle bolo', 'Dono ek hi phool bolo', 'Dono ek hi country bolo', 'Dono ek hi mobile app bolo', 'Dono ek hi school subject bolo', 'Dono ek hi tyohaar bolo', 'Dono ek hi ice cream flavour bolo', 'Dono ek hi singer bolo', 'Dono ek hi web series bolo', 'Dono ek hi cartoon bolo', 'Dono ek hi snack bolo', 'Dono ek hi Rajasthan ki jagah bolo', 'Dono ek hi mausam bolo', 'Dono ek hi planet bolo', 'Dono ek hi pizza topping bolo', 'Dono ek hi Marvel hero bolo', 'Dono ek hi letter bolo (A–Z)', 'Dono ek hi ghar ki dish bolo', 'Dono ek hi IPL team bolo', 'Dono ek hi car brand bolo', 'Dono ek hi mobile brand bolo', 'Dono ek hi dance form bolo', 'Dono ek hi board game bolo', 'Dono ek hi chai ka type bolo', 'Dono ek hi paneer dish bolo'];
const EMO = ['🍎', '🐍', '🗡️', '👑', '🕯️', '💀', '🍕', '🔑', '🦂', '🎭', '🏰', '🐺', '💎', '🪶', '🍷', '🕰️', '🔮', '🦉', '🌹', '⚔️'];
function mkMath(n) { const out = []; for (let i = 0; i < n; i++) { const t = Math.random(); let a, b, q, ans; if (t < 0.4) { a = 10 + Math.floor(Math.random() * 80); b = 10 + Math.floor(Math.random() * 80); q = `${a} + ${b}`; ans = a + b; } else if (t < 0.7) { a = 30 + Math.floor(Math.random() * 70); b = Math.floor(Math.random() * a); q = `${a} − ${b}`; ans = a - b; } else { a = 3 + Math.floor(Math.random() * 10); b = 3 + Math.floor(Math.random() * 10); q = `${a} × ${b}`; ans = a * b; } out.push({ q, a: ans }); } return out; }
const norm = s => (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F ]/g, '').replace(/\s+/g, ' ');

// ---------- variety memory: what each player has already seen (survives across games) ----------
const fs = require('fs');
const SEEN_FILE = path.join(__dirname, 'data', 'seen.json');
let SEEN = {}; try { SEEN = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')); } catch (e) { SEEN = {}; }
let seenDirty = null;
function saveSeen() { clearTimeout(seenDirty); seenDirty = setTimeout(() => { try { fs.mkdirSync(path.dirname(SEEN_FILE), { recursive: true }); fs.writeFileSync(SEEN_FILE, JSON.stringify(SEEN)); } catch (e) {} }, 500); }
const h32 = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
function seenOf(tok) { if (!SEEN[tok]) SEEN[tok] = {}; return SEEN[tok]; }
function mergeSeen(tok, obj) { if (!obj || typeof obj !== 'object') return; const s = seenOf(tok); for (const k of Object.keys(obj)) { if (!s[k]) s[k] = {}; const v = obj[k]; if (v && typeof v === 'object') for (const id of Object.keys(v).slice(0, 400)) s[k][id] = Math.max(s[k][id] || 0, Number(v[id]) || 1); } saveSeen(); }
function seenCount(room, kind, key) { return room.order.filter(t => !room.players[t].bot).reduce((n, tok) => n + ((SEEN[tok] && SEEN[tok][kind] && SEEN[tok][kind][key]) || 0), 0); }
function markSeen(room, kind, key) { room.order.filter(t => !room.players[t].bot).forEach(tok => { const s = seenOf(tok); if (!s[kind]) s[kind] = {}; s[kind][key] = (s[kind][key] || 0) + 1; }); saveSeen(); }
// pick n items the room's players have seen the least (random among equals)
function pickFresh(room, kind, list, n, keyFn = x => h32(typeof x === 'string' ? x : x.q)) {
  const scored = shuffle(list).map(x => ({ x, k: keyFn(x), c: seenCount(room, kind, keyFn(x)) })).sort((p, q) => p.c - q.c);
  const out = scored.slice(0, n); out.forEach(o => markSeen(room, kind, o.k)); return out.map(o => o.x);
}
function pushSeen(room) { room.order.forEach(tok => { const p = room.players[tok]; if (p && p.socketId) io.to(p.socketId).emit('seen', seenOf(tok)); }); }

const MISSIONS = ['puzzle', 'pairs', 'memory', 'math', 'race', 'sync', 'dhokha', 'chup', 'twister', 'kadi'];
const CARDS = ['sawaal', 'gumnaam', 'lie', 'eksach', 'andha', 'double', 'chuppi', 'none'];

// ---------- room lifecycle ----------
function createRoom(hostName, token) {
  const code = genCode();
  const room = {
    code, hostId: token, players: {}, order: [],
    settings: { stake: 50, adult: false, masala: false },
    phase: 'LOBBY', pd: {}, round: 0, pot: 0, partyFund: 0,
    chat: [], tchat: [], log: [], deadline: null,
    missionsUsed: [], recruitsDone: 0, voteHistory: [], missionsWon: 0, missionsLost: 0,
    banishedList: [], finalResult: null, created: now()
  };
  rooms[code] = room;
  addPlayer(room, token, hostName);
  return room;
}
function addPlayer(room, token, name) {
  room.players[token] = { id: token, name: name.slice(0, 14), alive: true, role: null, shield: false, poisoned: false, connected: true, socketId: null, recruited: false, ready: false };
  room.order.push(token);
}

// ---------- personalized state ----------
function viewFor(room, pid) {
  const me = room.players[pid];
  const isT = me && me.role === 'traitor';
  const revealAll = room.phase === 'FINAL' || room.phase === 'SHARE_STEAL';
  const players = room.order.map(id => {
    const p = room.players[id];
    const v = { id, name: p.name, alive: p.alive, connected: p.connected, ready: p.ready, isHost: id === room.hostId, bot: !!p.bot };
    if (revealAll || id === pid || (isT && p.role === 'traitor') || room.banishedList.find(b => b.id === id && b.revealed)) v.role = p.role;
    if (id === pid) { v.shield = p.shield; }
    return v;
  });
  const pd = { ...room.pd };
  // strip secrets
  delete pd.subs; delete pd.subs2; delete pd.lines; delete pd.puz; delete pd.gchat; delete pd.probs; delete pd.pairs; if (room.phase === 'MISSION' && room.pd.type === 'memory' && now() - room.pd.t0 > 6000) delete pd.seq; delete pd.saboteur; delete pd.sabotaged; delete pd.votes; delete pd.reasons; delete pd.tprop; delete pd.choices; delete pd.traitorIds;
  if (room.phase === 'VOTE') pd.votedIds = Object.keys(room.pd.votes || {});
  if (room.phase === 'MISSION') pd.doneIds = Object.keys((room.pd.step === 2 && room.pd.subs2) ? room.pd.subs2 : (room.pd.subs || {}));
  if (room.phase === 'END_CHOICE') pd.votedIds = Object.keys(room.pd.votes || {});
  if (room.phase === 'SHARE_STEAL') pd.doneIds = Object.keys(room.pd.choices || {});
  if (room.phase === 'SHARE_STEAL') pd.traitorIds = room.pd.traitorIds;
  const view = {
    code: room.code, phase: room.phase, round: room.round, pot: room.pot, partyFund: room.partyFund,
    settings: room.settings, players, me: me ? { id: pid, name: me.name, alive: me.alive, role: me.role, shield: me.shield, isHost: pid === room.hostId } : null,
    deadline: room.deadline, serverNow: now(), pd, chat: room.chat.slice(-80), log: room.log.slice(-120),
    finalResult: room.finalResult, missionsWon: room.missionsWon, missionsLost: room.missionsLost,
    aliveCount: alive(room).length
  };
  if (isT) { view.tchat = room.tchat.slice(-60); view.tprop = room.pd.tprop || null; }
  if (room.pd.subs && room.pd.subs[pid] !== undefined) view.mySub = room.pd.subs[pid];
  if (room.pd.subs2 && room.pd.subs2[pid] !== undefined) view.mySub2 = room.pd.subs2[pid];
  if (room.pd.saboteur === pid && me.alive && ['MISSION'].includes(room.phase)) view.canSabotage = !room.pd.sabotaged;
  if (room.pd.votes && room.pd.votes[pid]) view.myVote = room.pd.votes[pid];
  if (room.phase === 'MISSION' && (room.pd.type === 'chup' || room.pd.type === 'twister')) view.myLine = room.pd.lines ? room.pd.lines[pid] : null;
  if (room.phase === 'MISSION' && room.pd.type === 'puzzle') { const g = groupOf(room, pid); if (g) { view.myGroup = g; view.myPuzzle = room.pd.puz[g].q; view.gchat = room.pd.gchat[g].slice(-40); view.groupSolved = room.pd.solved[g] ? pname(room, room.pd.solved[g]) : null; view.groupTries = room.pd.tries[g]; view.otherSolved = !!room.pd.solved[g === 'A' ? 'B' : 'A']; } }
  if (room.phase === 'MISSION' && room.pd.type === 'pairs') { const pr = room.pd.pairs.find(x => x.ids.includes(pid)); if (pr) { view.pairQ = pr.q; view.partners = pr.ids.filter(x => x !== pid).map(x => pname(room, x)); view.pairDone = pr.ids.filter(x => room.pd.subs[x] !== undefined).length; view.pairSize = pr.ids.length; } }
  if (room.phase === 'MISSION' && room.pd.type === 'math') view.probsQ = room.pd.probs.map(x => x.q);
  if (room.phase === 'RECRUIT' && room.pd.target === pid) view.recruitOffer = true;
  if (room.phase === 'SHARE_STEAL' && room.pd.choices) view.myChoice = room.pd.choices[pid] || null;
  if (room.phase === 'TABLE' && room.pd.card === 'lie' && room.pd.liar === pid && !room.pd.lieText) view.mustLie = true;
  return view;
}
function push(room) {
  for (const id of room.order) {
    const p = room.players[id];
    if (p.socketId) io.to(p.socketId).emit('state', viewFor(room, id));
  }
  if (room.hasBots) setImmediate(() => { try { botTick(room); } catch (e) { console.error('bot', e); } });
}
function doReady(r, pid) { if (r.phase !== 'ROLES') return; const p = r.players[pid]; if (!p) return; p.ready = true; if (allReady(r)) startMission(r); else push(r); }
function doEndChoice(r, pid, v) { if (r.phase !== 'END_CHOICE') return; const p = r.players[pid]; if (!p || !p.alive) return; r.pd.votes[pid] = v === 'end' ? 'end' : 'more'; if (Object.keys(r.pd.votes).length >= alive(r).length) resolveEndChoice(r); else push(r); }
function doShareSteal(r, pid, c) { if (r.phase !== 'SHARE_STEAL') return; if (!r.pd.traitorIds.includes(pid)) return; if (r.pd.choices[pid]) return; r.pd.choices[pid] = c === 'steal' ? 'steal' : 'share'; if (Object.keys(r.pd.choices).length >= r.pd.traitorIds.length) finalize(r); else push(r); }

// ---------- computer players ----------
const BOT_NAMES = ['Vikram', 'Meera', 'Arjun', 'Kabir', 'Zoya', 'Dev', 'Tara', 'Rehan', 'Ishaan', 'Naina'];
const BOT_REASONS = ['mission mein bahut chup tha', 'vote pattern ajeeb lag raha hai', 'zaroorat se zyada defend kar raha hai', 'gut feeling', 'kal galat bande ko vote diya tha', 'aankhein bata rahi hain', 'sabse zyada confident — wahi shak hai', 'chat mein sabko ghuma raha tha', 'bahut innocent ban raha hai', 'Breakfast pe khush lag raha tha'];
const BOT_TABLE = ['Mujhe {X} pe shak hai — {R}.', 'Seedhi baat: {X}. {R}.', 'Dekho, kal ka vote yaad karo. {X} ko dhyan se dekho.', 'Main {X} ke naam pe ja raha hoon. {R}.', '{X}, tum kuch zyada hi shaant ho.', 'Mera vote aaj {X} ko. Koi aur naam ho toh batao.'];
const BOT_DEFEND = ['Main Innocent hoon yaar, mujhe kyu ghaseet rahe ho?', 'Mera naam mat lo — mission mein sabse zyada maine kiya.', 'Achha? Toh phir kal raat mujhe kyu nahi maara Traitors ne... soch lo.', 'Mujhpe waqt barbaad mat karo, asli Traitor has raha hai.'];
const BOT_TURRET = ['Isko maarte hain — sabse tez dimaag hai.', 'Ye humein pakad lega, aaj raat isko.', 'Shaant wale ko chhodo, jo bol raha hai usko hatao.', 'Theek hai, main agree.'];
const BOT_PAIR = { fruit: ['aam', 'kela', 'seb'], number: ['3', '2'], color: ['laal', 'neela'], actor: ['shahrukh', 'salman'], city: ['mumbai', 'delhi'], janwar: ['kutta', 'sher'], sabzi: ['aloo', 'bhindi'], mithai: ['gulab jamun', 'rasgulla'], cricketer: ['virat', 'dhoni'], superhero: ['spiderman', 'batman'], mahina: ['january', 'december'], 'fast food': ['pizza', 'burger'], movie: ['3 idiots', 'ddlj'], drink: ['chai', 'coke'], weekday: ['monday', 'sunday'], 'body part': ['haath', 'naak'], vehicle: ['car', 'bike'], phool: ['gulab', 'kamal'], country: ['india', 'america'], app: ['whatsapp', 'instagram'], subject: ['maths', 'science'], tyohaar: ['diwali', 'holi'], 'ice cream': ['vanilla', 'chocolate'], singer: ['arijit', 'shreya'], series: ['mirzapur', 'money heist'], cartoon: ['doraemon', 'tom and jerry'], snack: ['samosa', 'chips'], rajasthan: ['jaipur', 'udaipur'], mausam: ['sardi', 'baarish'], planet: ['mars', 'earth'], topping: ['cheese', 'paneer'], marvel: ['iron man', 'thor'], letter: ['a', 's'], dish: ['dal chawal', 'rajma'], ipl: ['csk', 'mi', 'rr'], car: ['maruti', 'tata'], 'mobile brand': ['samsung', 'iphone'], dance: ['bhangra', 'garba'], 'board game': ['ludo', 'chess'], chai: ['masala', 'adrak'], paneer: ['paneer butter masala', 'palak paneer'] };
function addBots(room) {
  const need = Math.max(0, 6 - room.order.length); if (!need) return;
  const taken = new Set(Object.values(room.players).map(p => p.name.toLowerCase()));
  const names = shuffle(BOT_NAMES).filter(n => !taken.has(n.toLowerCase())).slice(0, need);
  names.forEach(n => { const tok = 'bot_' + Math.random().toString(36).slice(2, 8); addPlayer(room, tok, n); room.players[tok].bot = true; room.chat.push({ t: now(), sys: true, text: `🤖 ${n} (computer) palace mein aaye` }); });
  room.hasBots = true; room.botMind = room.botMind || {}; room.botActed = room.botActed || {};
  push(room);
}
function bots(room) { return room.order.map(id => room.players[id]).filter(p => p.bot); }
function botDelay(room, key, bot, ms, fn) {
  const k = bot.id + '|' + key; room.botActed = room.botActed || {}; if (room.botActed[k]) return; room.botActed[k] = true;
  const ph = room.phase; setTimeout(() => { if (room.phase !== ph) return; try { fn(); } catch (e) { console.error('botact', e); } }, Math.round(ms * TIMESCALE));
}
function mind(room, bot) { room.botMind = room.botMind || {}; if (!room.botMind[bot.id]) { const bias = {}; room.order.forEach(id => bias[id] = Math.random() * 1.5); room.botMind[bot.id] = { bias, chatted: 0 }; } return room.botMind[bot.id]; }
// public suspicion: what the whole table can see
function pubSus(room) {
  const s = {}; room.order.forEach(id => s[id] = 0);
  room.voteHistory.forEach(h => {
    const bRole = h.banished ? room.players[h.banished].role : null;
    Object.entries(h.votes).forEach(([voter, target]) => {
      s[target] = (s[target] || 0) + 1;
      if (h.banished && target === h.banished) s[voter] += bRole === 'traitor' ? -1.5 : 0.7;
    });
  });
  room.log.filter(l => l.kind === 'banish' && /aakhri shabd/.test(l.text)).forEach(l => {
    const m = l.text.match(/^(.+?) ke aakhri shabd: 👉 (.+?) par shaq/); if (!m) return;
    const from = Object.values(room.players).find(p => p.name === m[1]); const to = Object.values(room.players).find(p => p.name === m[2]);
    if (from && to) s[to.id] += from.role === 'traitor' ? -0.5 : 2;
  });
  return s;
}
function botSuspect(room, bot, cands) {
  const s = pubSus(room); const m = mind(room, bot);
  const pool = cands.filter(p => p.id !== bot.id && (bot.role !== 'traitor' || p.role !== 'traitor'));
  const use = pool.length ? pool : cands.filter(p => p.id !== bot.id);
  if (!use.length) return null;
  const scored = use.map(p => ({ p, v: (s[p.id] || 0) + m.bias[p.id] + (p.role === 'traitor' && bot.role === 'faithful' ? 0.4 : 0) })).sort((x, y) => y.v - x.v);
  return Math.random() < 0.15 ? rnd(use) : scored[0].p;
}
function botSyncAnswer(q) {
  const ya = q.match(/:\s*(.+?) ya (.+?)\?/) || q.match(/^(.+?) ya (.+?)\?/); if (ya) return Math.random() < 0.6 ? ya[1].trim() : ya[2].trim();
  if (/number/i.test(q)) return /10/.test(q) ? '7' : '3'; if (/color/i.test(q)) return 'neela';
  if (/jaipur|rajasthan/i.test(q)) return 'dal baati'; if (/star/i.test(q)) return 'shahrukh'; if (/ipl/i.test(q)) return 'csk'; if (/shah rukh/i.test(q)) return 'ddlj'; if (/hrithik/i.test(q)) return 'krrish'; if (/ranbir/i.test(q)) return 'animal'; if (/web series/i.test(q)) return 'mirzapur'; if (/weekend/i.test(q)) return 'sona'; if (/sabzi/i.test(q)) return 'karela';
  return 'chai';
}
function botPairAnswer(q) { const k = Object.keys(BOT_PAIR).find(k => q.toLowerCase().includes(k)); return k ? rnd(BOT_PAIR[k]) : 'aam'; }
function botTick(room) {
  const al = alive(room); const ph = room.phase; const pd = room.pd; const key = ph + ':' + (room.deadline || 0) + ':' + room.round;
  for (const b of bots(room)) {
    if (ph === 'ROLES') { if (!b.ready) botDelay(room, key, b, 1500 + Math.random() * 2500, () => doReady(room, b.id)); continue; }
    if (!b.alive) continue;
    const others = al.filter(p => p.id !== b.id); const innocents = al.filter(p => p.role !== 'traitor');
    if (ph === 'MISSION') {
      const t = pd.type; const left = Math.max(1000, (room.deadline || now()) - now()) / TIMESCALE;
      if (t === 'dhokha' && pd.subs[b.id] === undefined) botDelay(room, key, b, 3000 + Math.random() * 12000, () => missionSubmit(room, b.id, Math.random() < (b.role === 'traitor' ? 0.6 : 0.88) ? 'saath' : 'dhokha'));
      else if (t === 'sync' && pd.subs[b.id] === undefined) botDelay(room, key, b, 4000 + Math.random() * 15000, () => missionSubmit(room, b.id, botSyncAnswer(pd.question || '')));
      else if (t === 'race' && pd.subs[b.id] === undefined) botDelay(room, key, b, 12000 + Math.random() * 6000, () => missionSubmit(room, b.id, 5 + Math.floor(Math.random() * 6)));
      else if (t === 'math' && pd.subs[b.id] === undefined) botDelay(room, key, b, 25000 + Math.random() * 10000, () => { const arr = pd.probs.map(pr => Math.random() < 0.35 ? pr.a : null); missionSubmit(room, b.id, arr); });
      else if (t === 'memory' && pd.subs[b.id] === undefined) botDelay(room, key, b, 10000 + Math.random() * 15000, () => { const k = 2 + Math.floor(Math.random() * 5); const arr = pd.seq.map((e, i) => i < k ? e : rnd(pd.pad || EMO)); missionSubmit(room, b.id, arr); });
      else if (t === 'pairs' && pd.subs[b.id] === undefined) { const pr = pd.pairs.find(x => x.ids.includes(b.id)); botDelay(room, key, b, 5000 + Math.random() * 12000, () => missionSubmit(room, b.id, botPairAnswer(pr ? pr.q : ''))); }
      else if (t === 'kadi' && pd.step === 1 && pd.subs[b.id] === undefined) botDelay(room, key, b, 4000 + Math.random() * 10000, () => { const s = botSuspect(room, b, others); if (s) missionSubmit(room, b.id, s.id); });
      else if (t === 'kadi' && pd.step === 2 && pd.kadi === b.id && !pd.guess) botDelay(room, key, b, 5000, () => missionSubmit(room, b.id, rnd(others).id));
      else if (t === 'puzzle') {
        const g = groupOf(room, b.id);
        if (g && !pd.solved[g]) {
          botDelay(room, key + ':hint', b, 8000 + Math.random() * 20000, () => { if (pd.solved[g]) return; pd.gchat[g].push({ t: now(), pid: b.id, name: b.name, text: rnd(['Hmm... socho, ye kuch aur hai.', 'Mujhe lagta hai jawab chhota sa hai.', 'Kisi ko idea hai? Main try karta hoon.', 'Ek baar ulta padh ke dekho.', 'Shayad yeh trick question hai.']) }); push(room); });
          if (Math.random() < 0.5) botDelay(room, key + ':solve', b, Math.min(left * 0.9, 35000 + Math.random() * 40000), () => { if (!pd.solved[g]) { pd.gchat[g].push({ t: now(), pid: b.id, name: b.name, text: 'Ruko — mil gaya, try karta hoon!' }); missionSubmit(room, b.id, pd.puz[g].a[0]); } });
          else botDelay(room, key + ':solve', b, 1, () => {});
        }
      }
      else if ((t === 'twister' || t === 'chup') && pd.step === 2 && pd.subs2 && pd.subs2[b.id] === undefined) botDelay(room, key, b, 3000 + Math.random() * 8000, () => { const hum = others.filter(p => !p.bot); const pick = hum.length && Math.random() < 0.3 ? rnd(hum).id : null; missionSubmit(room, b.id, t === 'twister' ? (pick ? [pick] : []) : (pick || 'none')); });
      if (pd.saboteur === b.id && !pd.sabotaged && Math.random() < 0.3) botDelay(room, key + ':sab', b, 5000, () => { if (room.phase === 'MISSION') { pd.sabotaged = true; push(room); } });
    }
    else if (ph === 'TABLE') {
      const m = mind(room, b);
      botDelay(room, key + ':c1', b, 6000 + Math.random() * 45000, () => { const s = botSuspect(room, b, others); if (!s) return; room.chat.push({ t: now(), name: b.name, pid: b.id, text: rnd(BOT_TABLE).replace('{X}', s.name).replace('{R}', rnd(BOT_REASONS)) }); push(room); });
      const mentioned = room.chat.slice(-6).some(c => c.pid !== b.id && !c.sys && c.text && c.text.toLowerCase().includes(b.name.toLowerCase()));
      if (mentioned && m.chatted < 2) { m.chatted++; botDelay(room, key + ':d' + m.chatted, b, 4000 + Math.random() * 6000, () => { room.chat.push({ t: now(), name: b.name, pid: b.id, text: rnd(BOT_DEFEND) }); push(room); }); }
      if (pd.card === 'lie' && pd.liar === b.id && !pd.lieText) botDelay(room, key + ':lie', b, 8000, () => { pd.lieText = 'Main kal raat Turret mein nahi tha.'; push(room); });
    }
    else if (ph === 'VOTE') {
      if (pd.voters.includes(b.id) && !pd.votes[b.id]) botDelay(room, key, b, 4000 + Math.random() * 14000, () => { const c = al.filter(p => pd.cands.includes(p.id)); const s = botSuspect(room, b, c); if (s) castVote(room, b.id, s.id, rnd(BOT_REASONS)); });
    }
    else if (ph === 'BANISH' && pd.current === b.id) {
      if (!pd.revealed) botDelay(room, key + ':flip', b, 4000, () => flipCard(room, b.id));
      else if (pd.antim && !pd.suspect) botDelay(room, key + ':antim', b, 3000 + Math.random() * 4000, () => { const s = botSuspect(room, b, others); if (s) antim(room, b.id, s.id); });
    }
    else if (ph === 'END_CHOICE' && !pd.votes[b.id]) {
      botDelay(room, key, b, 4000 + Math.random() * 10000, () => { const tb = room.banishedList.filter(x => x.role === 'traitor').length; const v = b.role === 'traitor' ? 'end' : (tb >= 2 || Math.random() < 0.3 ? 'end' : 'more'); doEndChoice(room, b.id, v); });
    }
    else if (ph === 'NIGHT' && b.role === 'traitor' && !pd.tprop[b.id]) {
      botDelay(room, key, b, 8000 + Math.random() * 20000, () => {
        const other = traitors(room).find(t => t.id !== b.id && pd.tprop[t.id]);
        let prop;
        if (other) prop = pd.tprop[other.id];
        else { const s = pubSus(room); const targets = innocents.filter(p => p.alive); if (!targets.length) return; const sorted = [...targets].sort((x, y) => ((s[x.id] || 0) + (x.bot ? 0.8 : 0)) - ((s[y.id] || 0) + (y.bot ? 0.8 : 0))); const target = Math.random() < 0.7 ? sorted[0] : rnd(targets); prop = { action: pd.canRecruit && Math.random() < 0.45 ? 'recruit' : 'murder', target: target.id }; }
        room.tchat.push({ t: now(), name: b.name, text: other ? 'Theek hai, main agree.' : rnd(BOT_TURRET) });
        traitorPropose(room, b.id, prop.action, prop.target);
      });
    }
    else if (ph === 'RECRUIT' && pd.target === b.id && !pd.answered) botDelay(room, key, b, 5000 + Math.random() * 8000, () => recruitAnswer(room, b.id, Math.random() < 0.6));
    else if (ph === 'SHARE_STEAL' && pd.traitorIds && pd.traitorIds.includes(b.id) && !pd.choices[b.id]) botDelay(room, key, b, 5000 + Math.random() * 10000, () => doShareSteal(room, b.id, Math.random() < 0.55 ? 'steal' : 'share'));
  }
}

function narrate(room, text, kind = 'narr') { log(room, text, kind); }

// ---------- game flow ----------
function startGame(room) {
  const n = room.order.length;
  if (n < 5) return;
  const ids = shuffle(room.order);
  ids.forEach((id, i) => { const p = room.players[id]; p.role = i < 2 ? 'traitor' : 'faithful'; p.alive = true; p.shield = false; p.poisoned = false; p.ready = false; });
  room.pot = room.settings.stake * n; room.partyFund = 0; room.round = 0;
  room.chat = []; room.tchat = []; room.log = []; room.missionsUsed = []; room.recruitsDone = 0; room.voteHistory = []; room.banishedList = []; room.finalResult = null; room.missionsWon = 0; room.missionsLost = 0;
  room.phase = 'ROLES'; room.pd = { spinStop: Math.floor(Math.random() * n), spinT0: now() };
  narrate(room, NARR.welcome); narrate(room, NARR.roles);
  clearTimer(room);
  push(room);
}
function allReady(room) { return alive(room).every(p => p.ready); }

// ----- MISSION -----
function startMission(room) {
  room.round++;
  const al = alive(room);
  const allowed = room.settings.masala ? MISSIONS : MISSIONS.filter(m => m !== 'kadi');
  let pool = allowed.filter(m => !room.missionsUsed.includes(m));
  if (!pool.length) { room.missionsUsed = []; pool = [...allowed]; }
  const type = (process.env.FORCE_MISSION && room.round === 1) ? process.env.FORCE_MISSION : pickFresh(room, 'mtype', pool, 1, x => x)[0]; room.missionsUsed.push(type);
  const stake = MISSION_STAKE * al.length;
  room.pd = { type, stake, subs: {}, saboteur: room.settings.masala ? rnd(al).id : null, sabotaged: false, step: 1 };
  al.forEach(p => p.ready = false);
  let ms = 35000;
  if (type === 'sync') { room.pd.question = pickFresh(room, 'sync', SYNC_Q, 1)[0]; }
  if (type === 'race') { ms = 22000; }
  if (type === 'chup') {
    const lines = pickFresh(room, 'chup', [...CHUP_LINES, ...(room.settings.adult ? ADULT_EXTRA : [])], al.filter(p => !p.bot).length || 1);
    room.pd.lines = {}; al.filter(p => !p.bot).forEach((p, i) => room.pd.lines[p.id] = lines[i % lines.length]);
    ms = 50000;
  }
  if (type === 'twister') {
    const tw = pickFresh(room, 'twister', TWISTERS, al.length);
    room.pd.lines = {}; room.pd.order = shuffle(al.filter(p => !p.bot).map(p => p.id)); room.pd.order.forEach((id, i) => room.pd.lines[id] = tw[i % tw.length]);
    ms = Math.min(120000, 15000 * al.length);
  }
  if (type === 'puzzle') {
    const sh = shuffle(al.map(p => p.id)); const half = Math.ceil(sh.length / 2);
    const pz = pickFresh(room, 'puzzle', PUZZLES, 2);
    room.pd.groups = { A: sh.slice(0, half), B: sh.slice(half) };
    room.pd.puz = { A: pz[0], B: pz[1] }; room.pd.solved = { A: null, B: null }; room.pd.tries = { A: 0, B: 0 }; room.pd.gchat = { A: [], B: [] };
    ms = 90000;
  }
  if (type === 'pairs') {
    const sh = shuffle(al.map(p => p.id)); const pairs = [];
    for (let i = 0; i < sh.length; i += 2) pairs.push(sh.slice(i, i + 2));
    if (pairs.length > 1 && pairs[pairs.length - 1].length === 1) { const lone = pairs.pop()[0]; pairs[pairs.length - 1].push(lone); }
    const qs = pickFresh(room, 'pair', PAIR_Q, pairs.length);
    room.pd.pairs = pairs.map((ids, i) => ({ ids, q: qs[i % qs.length] }));
    ms = 35000;
  }
  if (type === 'memory') { room.pd.pad = shuffle(EMO).slice(0, 8); room.pd.seq = Array.from({ length: 6 }, () => rnd(room.pd.pad)); room.pd.t0 = now(); ms = 45000; const rid = room.round; setTimeout(() => { if (room.phase === 'MISSION' && room.pd.type === 'memory' && room.round === rid) push(room); }, 6200); }
  if (type === 'math') { room.pd.probs = mkMath(15); ms = 40000; }
  room.phase = 'MISSION';
  narrate(room, `Mission ${room.round}. Stake ₹${stake} — successful toh prize money ₹${room.pot + stake}, failed toh party fund mein.`, 'mission');
  setTimer(room, ms, () => missionStep2(room));
  push(room); pushSeen(room);
}
function groupOf(room, pid) { const g = room.pd.groups; if (!g) return null; return g.A.includes(pid) ? 'A' : g.B.includes(pid) ? 'B' : null; }
function missionSubmit(room, pid, val) {
  if (room.phase !== 'MISSION') return;
  const p = room.players[pid]; if (!p || !p.alive) return;
  const pd = room.pd;
  if (pd.type === 'puzzle') {
    const g = groupOf(room, pid); if (!g || pd.solved[g]) return { correct: false };
    const ok = pd.puz[g].a.map(norm).includes(norm(val));
    if (ok) { pd.solved[g] = pid; pd.solvedAt = pd.solvedAt || {}; pd.solvedAt[g] = now(); log(room, `Team ${g} ne puzzle solve kar liya!`, 'good'); if (pd.solved.A && pd.solved.B) { clearTimer(room); resolveMission(room); return { correct: true }; } push(room); return { correct: true }; }
    pd.tries[g]++; push(room); return { correct: false };
  }
  if (pd.type === 'memory') {
    if (pd.subs[pid] !== undefined) return; const arr = Array.isArray(val) ? val : [];
    let sc = 0; for (let i = 0; i < pd.seq.length; i++) { if (arr[i] === pd.seq[i]) sc++; else break; }
    pd.subs[pid] = { s: sc, t: now() };
    if (Object.keys(pd.subs).length >= alive(room).length) { clearTimer(room); resolveMission(room); return; }
    push(room); return;
  }
  if (pd.type === 'math') {
    if (pd.subs[pid] !== undefined) return; const arr = Array.isArray(val) ? val : [];
    let sc = 0; pd.probs.forEach((pr, i) => { if (arr[i] !== undefined && arr[i] !== null && Number(arr[i]) === pr.a) sc++; });
    pd.subs[pid] = sc;
    if (Object.keys(pd.subs).length >= alive(room).length) { clearTimer(room); resolveMission(room); return; }
    push(room); return;
  }
  if (pd.step === 1) {
    if (pd.subs[pid] !== undefined) return;
    pd.subs[pid] = val;
    if (Object.keys(pd.subs).length >= alive(room).length) { clearTimer(room); missionStep2(room); return; }
  } else if (pd.step === 2) {
    if (pd.type === 'kadi' && pd.kadi === pid && !pd.guess) { pd.guess = val; clearTimer(room); resolveMission(room); return; }
    if (pd.type === 'twister') { if (pd.subs2[pid] !== undefined) return; pd.subs2[pid] = Array.isArray(val) ? val.filter(x => room.players[x] && x !== pid).slice(0, 10) : []; if (Object.keys(pd.subs2).length >= alive(room).length) { clearTimer(room); resolveMission(room); return; } }
    if (pd.type === 'chup') { if (pd.subs2[pid] !== undefined) return; pd.subs2[pid] = val; if (Object.keys(pd.subs2).length >= alive(room).length) { clearTimer(room); resolveMission(room); return; } }
  }
  push(room);
}
function missionStep2(room) {
  const pd = room.pd; const al = alive(room);
  if (pd.type === 'kadi') {
    const tally = {}; al.forEach(p => { const v = pd.subs[p.id]; if (v && room.players[v] && v !== p.id) tally[v] = (tally[v] || 0) + 1; });
    const max = Math.max(0, ...Object.values(tally));
    if (max === 0) { pd.kadi = null; return resolveMission(room); }
    const tops = Object.keys(tally).filter(k => tally[k] === max);
    pd.kadi = rnd(tops); pd.kadiCount = max; pd.step = 2;
    narrate(room, `Kamzor Kadi: ${pname(room, pd.kadi)} (${max} logon ne naam liya). Ab ${pname(room, pd.kadi)} ko ek naam guess karna hai — kisne naam liya?`, 'mission');
    setTimer(room, 20000, () => resolveMission(room));
    return push(room);
  }
  if (pd.type === 'twister') {
    pd.step = 2; pd.subs2 = {};
    narrate(room, 'Time khatam. Ab vote karein — kiski zubaan ladkhadayi?', 'mission');
    setTimer(room, 25000, () => resolveMission(room));
    return push(room);
  }
  if (pd.type === 'chup') {
    pd.step = 2; pd.subs2 = {};
    narrate(room, 'Time khatam. Ab vote karein — kaun hasa?', 'mission');
    setTimer(room, 20000, () => resolveMission(room));
    return push(room);
  }
  resolveMission(room);
}
function resolveMission(room) {
  clearTimer(room);
  const pd = room.pd; const al = alive(room); let win = false; let detail = ''; let shieldTo = null;
  if (pd.type === 'dhokha') {
    const dh = al.filter(p => pd.subs[p.id] === 'dhokha');
    win = dh.length === 0;
    if (dh.length === 1) { shieldTo = dh[0].id; }
    detail = dh.length === 0 ? 'Sab ne saath diya. Prize money badhi.' : `${dh.length} ${dh.length === 1 ? 'bande ne' : 'logon ne'} dhokha diya. ${dh.length === 1 ? 'Usse Shield mili — chupke se.' : 'Lalach mein Shield kisi ko nahi mili.'}`;
  } else if (pd.type === 'sync') {
    const norm = s => (s || '').toString().trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F ]/g, '');
    const tally = {}; al.forEach(p => { const k = norm(pd.subs[p.id]); if (k) tally[k] = (tally[k] || 0) + 1; });
    let best = '', bc = 0; for (const k in tally) if (tally[k] > bc) { bc = tally[k]; best = k; }
    const need = Math.ceil(al.length * 0.6);
    win = bc >= need;
    const odd = al.filter(p => norm(pd.subs[p.id]) !== best).map(p => `${p.name} ("${pd.subs[p.id] || '—'}")`);
    detail = `Sabse common: "${best || '—'}" (${bc}/${al.length}, chahiye the ${need}). ` + (odd.length ? `Alag the: ${odd.join(', ')}.` : 'Sab ek jaise!');
    pd.answers = al.map(p => ({ name: p.name, a: pd.subs[p.id] || '—' }));
  } else if (pd.type === 'kadi') {
    if (!pd.kadi) { win = false; detail = 'Kisi ne kisi ka naam nahi liya. Mission fail.'; }
    else {
      const voters = al.filter(p => pd.subs[p.id] === pd.kadi).map(p => p.id);
      win = !!pd.guess && voters.includes(pd.guess);
      detail = `${pname(room, pd.kadi)} ne guess kiya: ${pd.guess ? pname(room, pd.guess) : 'koi nahi'} — ${win ? 'SAHI! Mission jeeta.' : 'GALAT.'} Naam lene wale the: ${voters.map(v => pname(room, v)).join(', ')}.`;
    }
  } else if (pd.type === 'race') {
    const scores = al.map(p => ({ id: p.id, name: p.name, s: Number(pd.subs[p.id] || 0) })).sort((a, b) => b.s - a.s);
    const avg = scores.reduce((a, b) => a + b.s, 0) / al.length;
    win = avg >= 6;
    if (scores[0] && scores[0].s > 0) shieldTo = scores[0].id;
    detail = `Team average ${avg.toFixed(1)} (chahiye 6). Top: ${scores.slice(0, 3).map(x => `${x.name} ${x.s}`).join(', ')}. ${shieldTo ? pname(room, shieldTo) + ' ko Shield mili.' : ''}`;
    pd.scores = scores;
  } else if (pd.type === 'chup') {
    const tally = {}; al.forEach(p => { const v = pd.subs2 ? pd.subs2[p.id] : null; if (v && v !== 'none') tally[v] = (tally[v] || 0) + 1; });
    let top = null, tc = 0; for (const k in tally) if (tally[k] > tc) { tc = tally[k]; top = k; }
    win = !(top && tc >= Math.ceil(al.length / 2));
    detail = win ? 'Koi nahi hasa (ya sab ne jhooth bola). Mission jeeta.' : `${pname(room, top)} hasa — ${tc} logon ne dekha. Mission fail.`;
  }
  else if (pd.type === 'twister') {
    const tally = {}; al.forEach(p => { (pd.subs2 && pd.subs2[p.id] || []).forEach(v => tally[v] = (tally[v] || 0) + 1); });
    const need = Math.ceil(al.length / 2); const hum = al.filter(p => !p.bot);
    const fumbled = hum.filter(p => (tally[p.id] || 0) >= need).map(p => p.id);
    const clean = hum.filter(p => !tally[p.id]).map(p => p.id);
    pd.fumbled = fumbled; pd.scores = {}; al.forEach(p => pd.scores[p.id] = tally[p.id] || 0);
    win = fumbled.length <= Math.floor(hum.length / 3);
    let shieldTo = null; if (win && clean.length && clean.length < hum.length) { shieldTo = rnd(clean); room.players[shieldTo].shield = true; pd.shieldPublic = shieldTo; }
    detail = (fumbled.length ? `Zubaan ladkhadayi: ${fumbled.map(id => pname(room, id)).join(', ')}. ` : 'Kisi ki zubaan nahi ladkhadayi! ') + (win ? 'Mission successful.' : `${fumbled.length} log atke — ${Math.floor(hum.length / 3)} tak chalta. Mission fail.`) + (shieldTo ? ` ${pname(room, shieldTo)} ko ek bhi vote nahi mila — Shield.` : '');
  }
  else if (pd.type === 'puzzle') {
    const nA = !!pd.solved.A, nB = !!pd.solved.B;
    win = nA && nB;
    const tn = g => pd.groups[g].map(id => pname(room, id)).join(', ');
    detail = `Team A (${tn('A')}): ${nA ? '✅ solved by ' + pname(room, pd.solved.A) : '❌ nahi hua — jawab tha "' + pd.puz.A.a[0] + '"'}. Team B (${tn('B')}): ${nB ? '✅ solved by ' + pname(room, pd.solved.B) : '❌ nahi hua — jawab tha "' + pd.puz.B.a[0] + '"'}.`;
    if (!win && (nA || nB)) { pd.halfWin = true; detail += ' Ek team jeeti — aadha stake prize money mein.'; }
    if (nA && nB) { const first = pd.solvedAt.A <= pd.solvedAt.B ? 'A' : 'B'; shieldTo = pd.solved[first]; detail += ` ${pname(room, shieldTo)} ne sabse pehle solve kiya — Shield.`; }
  } else if (pd.type === 'pairs') {
    const res = pd.pairs.map(pr => { const ans = pr.ids.map(id => pd.subs[id]); const ok = ans.every(x => x !== undefined) && ans.every(x => norm(x) === norm(ans[0])); return { names: pr.ids.map(id => pname(room, id)).join(' + '), ans: ans.map(x => x === undefined ? '—' : x).join(' / '), ok }; });
    const m = res.filter(r => r.ok).length; const need = Math.ceil(pd.pairs.length / 2);
    win = m >= need;
    detail = `${m}/${pd.pairs.length} jode match hue (chahiye ${need}). ` + res.map(r => `${r.ok ? '✅' : '❌'} ${r.names}: ${r.ans}`).join(' · ');
  } else if (pd.type === 'memory') {
    const sc = al.map(p => ({ id: p.id, name: p.name, s: pd.subs[p.id] ? pd.subs[p.id].s : 0, t: pd.subs[p.id] ? pd.subs[p.id].t : Infinity })).sort((a, b) => b.s - a.s || a.t - b.t);
    const avg = sc.reduce((a, b) => a + b.s, 0) / al.length;
    win = avg >= 4;
    if (sc[0] && sc[0].s === 6) shieldTo = sc[0].id;
    detail = `Sequence: ${pd.seq.join(' ')}. Team average ${avg.toFixed(1)}/6 (chahiye 4). ${shieldTo ? pname(room, shieldTo) + ' ne poora yaad rakha, sabse pehle — Shield.' : 'Kisi ne poora yaad nahi rakha, Shield kisi ko nahi.'}`;
    pd.scores = sc.map(x => ({ name: x.name, s: x.s }));
  } else if (pd.type === 'math') {
    const sc = al.map(p => ({ id: p.id, name: p.name, s: Number(pd.subs[p.id] || 0) })).sort((a, b) => b.s - a.s);
    const tot = sc.reduce((a, b) => a + b.s, 0); const need = 3 * al.length;
    win = tot >= need;
    if (sc[0] && sc[0].s > 0 && (!sc[1] || sc[1].s < sc[0].s)) shieldTo = sc[0].id;
    detail = `Team total ${tot} sahi (chahiye ${need}). ${shieldTo ? pname(room, shieldTo) + ' top — Shield.' : 'Top pe tie — Shield kisi ko nahi.'}`;
    pd.scores = sc.map(x => ({ name: x.name, s: x.s }));
  }
  if (pd.sabotaged) { win = false; detail += ' ⚠️ Kisi ne SABOTAGE kiya tha.'; }
  if (shieldTo && win !== null) {
    room.players[shieldTo].shield = true;
    if (pd.type === 'dhokha') { /* secret */ }
  }
  if (win) { room.pot += pd.stake; room.missionsWon++; } else if (pd.halfWin) { const h = Math.floor(pd.stake / 2); room.pot += h; room.partyFund += pd.stake - h; room.missionsLost++; } else { room.partyFund += pd.stake; room.missionsLost++; }
  room.phase = 'MISSION_RESULT';
  room.pd = { type: pd.type, win, detail, stake: pd.stake, answers: pd.answers, scores: pd.scores, shieldPublic: ['race', 'puzzle', 'memory', 'math'].includes(pd.type) ? shieldTo : null, halfWin: !!pd.halfWin };
  narrate(room, `${win ? '✅ Mission SUCCESSFUL' : '❌ Mission FAILED'}: ${detail}`, win ? 'good' : 'bad');
  setTimer(room, 12000, () => startTable(room));
  push(room);
}

// ----- ROUND TABLE -----
function startTable(room) {
  clearTimer(room);
  const al = alive(room);
  let pool = CARDS.filter(c => c !== 'double' || al.length >= 6).filter(c => c !== 'eksach' || room.voteHistory.length > 0);
  const card = room.settings.masala ? rnd(pool) : 'none';
  room.pd = { card, chatOpen: true, tableStart: now() };
  if (card === 'sawaal') { const a = rnd(al); const t = rnd(al.filter(p => p.id !== a.id)); room.pd.asker = a.id; room.pd.target = t.id; }
  if (card === 'lie') { room.pd.liar = rnd(al).id; }
  if (card === 'chuppi') { room.pd.mute = rnd(al).id; }
  if (card === 'gumnaam') { room.pd.anonUntil = now() + 60000; }
  if (card === 'eksach') { room.pd.truth = makeTruth(room); }
  room.phase = 'TABLE';
  narrate(room, `Circle of Shaq ${room.round}. Teen minute — discuss karein, shaq zaahir karein.`, 'table');
  setTimer(room, 180000, () => startVote(room));
  push(room);
}
function makeTruth(room) {
  const opts = [];
  const last = room.voteHistory[room.voteHistory.length - 1];
  if (last && last.banished) {
    const voters = Object.entries(last.votes).filter(([v, t]) => t === last.banished).map(([v]) => v);
    const tn = voters.filter(v => room.players[v].role === 'traitor').length;
    opts.push(`Pichhle round jinhone ${pname(room, last.banished)} ko vote diya, unme ${tn} Traitor ${tn === 1 ? 'tha' : 'the'}.`);
  }
  const tb = room.banishedList.filter(b => b.role === 'traitor').length;
  opts.push(tb === 0 ? 'Ab tak ek bhi Traitor banished nahi hua.' : `${tb} Traitor banished ho chuka hai.`);
  const ts = traitors(room); if (ts.length) { const t = rnd(ts); opts.push(`Ek Traitor ke naam mein ${t.name.replace(/\s/g, '').length} akshar hain.`); }
  const sh = alive(room).filter(p => p.shield).length; opts.push(sh ? `Abhi ${sh} ${sh === 1 ? 'bande' : 'logon'} ke paas Shield hai.` : 'Abhi kisi ke paas Shield nahi hai.');
  return rnd(opts);
}
function extendTable(room) { if (room.phase !== 'TABLE') return; const left = Math.max(0, room.deadline - now()); setTimer(room, left + 60000, () => startVote(room)); narrate(room, 'Discussion ko ek minute aur.', 'table'); push(room); }

// ----- VOTE -----
function startVote(room, candidates = null, revote = false) {
  clearTimer(room);
  const al = alive(room);
  const card = room.pd.card; const andha = card === 'andha'; const dbl = card === 'double';
  const cands = candidates || al.map(p => p.id);
  // poisoned players still vote (they don't know) — their vote is voided at reveal
  const voters = revote ? al.filter(p => !cands.includes(p.id)).map(p => p.id) : al.map(p => p.id);
  room.pd = { card, andha, dbl, revote, cands, voters, votes: {}, reasons: {} };
  room.phase = 'VOTE';
  narrate(room, revote ? `Tie! Ab sirf ${cands.map(c => pname(room, c)).join(' aur ')} ke beech re-vote.` : 'Voting. Secretly ek naam likhiye. Phir har vote sabke saamne reveal hoga.', 'vote');
  setTimer(room, 35000, () => startReveal(room));
  push(room);
}
function castVote(room, pid, target, reason) {
  if (room.phase !== 'VOTE') return;
  const p = room.players[pid]; if (!p || !p.alive) return;
  if (!room.pd.voters.includes(pid)) return;
  if (!room.pd.cands.includes(target) || target === pid) return;
  if (room.pd.votes[pid]) return;
  room.pd.votes[pid] = target; room.pd.reasons[pid] = (reason || '').slice(0, 60);
  if (Object.keys(room.pd.votes).length >= room.pd.voters.length) { clearTimer(room); startReveal(room); return; }
  push(room);
}
function startReveal(room) {
  clearTimer(room);
  const pd = room.pd;
  const order = shuffle(Object.keys(pd.votes));
  pd.revealOrder = order; pd.revealed = []; pd.tally = {};
  room.phase = 'REVEAL';
  if (pd.andha) {
    order.forEach(v => { if (!room.players[v].poisoned) pd.tally[pd.votes[v]] = (pd.tally[pd.votes[v]] || 0) + 1; });
    pd.revealed = order.map(v => ({ voter: v, poisoned: room.players[v].poisoned, hidden: true }));
    narrate(room, 'Blind vote — votes secret rahenge. Sirf result.', 'vote');
    setTimer(room, 5000, () => finishReveal(room));
    return push(room);
  }
  revealNext(room);
}
function revealNext(room) {
  const pd = room.pd;
  if (pd.revealed.length >= pd.revealOrder.length) { setTimer(room, 3000, () => finishReveal(room)); return push(room); }
  const v = pd.revealOrder[pd.revealed.length];
  const poisoned = room.players[v].poisoned;
  const t = pd.votes[v];
  pd.revealed.push({ voter: v, target: t, reason: pd.reasons[v], poisoned });
  if (!poisoned) pd.tally[t] = (pd.tally[t] || 0) + 1;
  narrate(room, poisoned ? `☕ ${pname(room, v)} ka vote cancel — poison! (${pname(room, t)} ko dena chaha tha)` : `${pname(room, v)} → ${pname(room, t)}${pd.reasons[v] ? ' — "' + pd.reasons[v] + '"' : ''}`, 'vote');
  setTimer(room, 4000, () => revealNext(room));
  push(room);
}
function finishReveal(room) {
  clearTimer(room);
  const pd = room.pd;
  alive(room).forEach(p => p.poisoned = false);
  const tally = pd.tally; const max = Math.max(0, ...Object.values(tally));
  const tops = Object.keys(tally).filter(k => tally[k] === max);
  if (max === 0) { narrate(room, 'Koi vote nahi pada. Aaj koi banished nahi.', 'vote'); return afterBanish(room); }
  if (pd.dbl && !pd.revote) {
    const sorted = Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 2);
    room.voteHistory.push({ round: room.round, votes: { ...pd.votes }, banished: sorted[0] });
    return banish(room, sorted);
  }
  if (tops.length > 1) {
    if (pd.revote) { narrate(room, 'Phir tie. Aaj koi banished nahi.', 'vote'); room.voteHistory.push({ round: room.round, votes: { ...pd.votes }, banished: null }); return afterBanish(room); }
    room.voteHistory.push({ round: room.round, votes: { ...pd.votes }, banished: null });
    return startVote(room, tops, true);
  }
  room.voteHistory.push({ round: room.round, votes: { ...pd.votes }, banished: tops[0] });
  banish(room, [tops[0]]);
}

// ----- BANISH -----
function banish(room, ids) {
  clearTimer(room);
  room.pd = { queue: ids, current: ids[0], revealed: false, suspect: null };
  room.phase = 'BANISH';
  narrate(room, `${pname(room, ids[0])}... aap Circle of Shaq se banished hain. Bataiye — Innocent ya Traitor?`, 'banish');
  setTimer(room, 20000, () => flipCard(room, ids[0]));
  push(room);
}
function flipCard(room, pid) {
  if (room.phase !== 'BANISH' || room.pd.current !== pid || room.pd.revealed) return;
  clearTimer(room);
  const p = room.players[pid]; p.alive = false; p.shield = false;
  room.pd.revealed = true; room.pd.role = p.role;
  room.banishedList.push({ id: pid, role: p.role, round: room.round, revealed: true });
  narrate(room, p.role === 'traitor' ? `🗡️ ${p.name}: "I was... a TRAITOR."` : `💔 ${p.name}: "I was innocent."`, p.role === 'traitor' ? 'good' : 'bad');
  room.pd.antim = true;
  setTimer(room, 12000, () => antimDone(room));
  push(room);
}
function antim(room, pid, target) {
  if (room.phase !== 'BANISH' || room.pd.current !== pid || !room.pd.antim || room.pd.suspect) return;
  if (!room.players[target] || !room.players[target].alive) return;
  room.pd.suspect = target;
  narrate(room, `${pname(room, pid)} ke aakhri shabd: 👉 ${pname(room, target)} par shaq hai.`, 'banish');
  clearTimer(room); antimDone(room);
}
function antimDone(room) {
  clearTimer(room);
  const q = room.pd.queue.slice(1);
  if (q.length) { room.pd = { queue: q, current: q[0], revealed: false, suspect: null }; narrate(room, `${pname(room, q[0])}... aap bhi banished hain. Innocent ya Traitor?`, 'banish'); setTimer(room, 20000, () => flipCard(room, q[0])); return push(room); }
  setTimer(room, 3000, () => afterBanish(room));
  push(room);
}
function afterBanish(room) {
  clearTimer(room);
  if (traitors(room).length === 0) return endGame(room);
  if (alive(room).length <= 2) return endGame(room);
  if (alive(room).length <= 4) return endChoice(room);
  startNight(room);
}
function endChoice(room) {
  room.pd = { votes: {} }; room.phase = 'END_CHOICE';
  narrate(room, `End Game. ${alive(room).length} players bache. Game khatam karein... ya ek aur banishment?`, 'table');
  setTimer(room, 25000, () => resolveEndChoice(room));
  push(room);
}
function resolveEndChoice(room) {
  clearTimer(room);
  const v = Object.values(room.pd.votes); const end = v.filter(x => x === 'end').length; const more = v.filter(x => x === 'more').length;
  if (more === 0) { narrate(room, end > 0 ? 'Sab ek mat: END GAME.' : 'Koi faisla nahi aaya — END GAME.', 'table'); return endGame(room); }
  narrate(room, `${more} ${more === 1 ? 'player' : 'players'} ne kaha: Banish again. Seedha ek aur Circle of Shaq.`, 'table');
  startTable(room);
}

// ----- NIGHT -----
function startNight(room) {
  clearTimer(room);
  const ts = traitors(room);
  const canRecruit = ts.length < 2 && room.recruitsDone < 1 && faithful(room).length > 1;
  room.pd = { tprop: {}, canRecruit };
  room.phase = 'NIGHT';
  narrate(room, 'Raat ho gayi. Innocents so jaayein... Traitors, Turret mein aaiye.', 'night');
  setTimer(room, 90000, () => resolveNight(room));
  push(room);
}
function traitorPropose(room, pid, action, target) {
  if (room.phase !== 'NIGHT') return;
  const p = room.players[pid]; if (!p || !p.alive || p.role !== 'traitor') return;
  if (!['murder', 'poison', 'recruit'].includes(action)) return;
  if (action === 'poison' && !room.settings.masala) return;
  if (action === 'recruit' && !room.pd.canRecruit) return;
  const t = room.players[target]; if (!t || !t.alive || t.role === 'traitor') return;
  room.pd.tprop[pid] = { action, target };
  const ts = traitors(room);
  const props = ts.map(x => room.pd.tprop[x.id]).filter(Boolean);
  if (props.length === ts.length && props.every(pr => pr.action === props[0].action && pr.target === props[0].target)) { clearTimer(room); resolveNight(room); return; }
  push(room);
}
function resolveNight(room) {
  clearTimer(room);
  const ts = traitors(room);
  let prop = null;
  for (const t of ts) if (room.pd.tprop[t.id]) { prop = room.pd.tprop[t.id]; break; }
  if (!prop) { const f = faithful(room); prop = { action: 'murder', target: rnd(f).id }; }
  const target = room.players[prop.target];
  if (prop.action === 'recruit') {
    room.pd = { target: target.id, answered: false }; room.phase = 'RECRUIT';
    narrate(room, 'Raat mein kisi ko recruitment ka offer mila hai...', 'night');
    setTimer(room, 30000, () => recruitAnswer(room, target.id, false));
    return push(room);
  }
  morning(room, prop.action, target);
}
function recruitAnswer(room, pid, yes) {
  if (room.phase !== 'RECRUIT' || room.pd.target !== pid || room.pd.answered) return;
  clearTimer(room); room.pd.answered = true;
  const p = room.players[pid];
  if (yes) { p.role = 'traitor'; p.recruited = true; room.recruitsDone++; room.tchat.push({ t: now(), name: '🗡️', text: `${p.name} ab Traitor hai. Turret mein swagat.`, sys: true }); morning(room, 'none', null); }
  else { room.recruitsDone++; morning(room, 'murder', p, true); }
}
function morning(room, action, target, refused = false) {
  clearTimer(room);
  let text = '';
  if (action === 'none') text = 'Breakfast par sab haazir hain. Kal raat koi murder nahi hua. Par palace mein kuch badla hai...';
  else if (action === 'murder') {
    if (target.shield) { target.shield = false; text = `Kal raat Traitors ne murder ki koshish ki... par Shield ne bacha liya. ${target.name}, aap safe hain. Breakfast par sab haazir.`; }
    else { target.alive = false; text = `Breakfast par ek kursi khaali hai. Kal raat Traitors ne ${target.name} ko murder kar diya.${refused ? ' Kuch offers thukrane ki keemat hoti hai.' : ''}`; }
  } else if (action === 'poison') {
    if (target.shield) { target.shield = false; text = `Kal raat kisi ki chai mein kuch tha... par Shield ne poison rok liya. Breakfast par sab haazir.`; }
    else { target.poisoned = true; text = 'Breakfast par sab haazir hain. Koi murder nahi hua... par kisi ki chai mein kuch tha. Aaj ek player ka vote nahi gina jaayega. Kaun? Wo khud nahi jaanta.'; }
  }
  alive(room).forEach(p => { if (p.shield && action !== 'none') { /* shields expire after a night */ } });
  alive(room).forEach(p => p.shield = false);
  room.pd = { text, victim: action === 'murder' && target && !target.alive ? target.id : null, saved: (action === 'murder' || action === 'poison') && target && target.alive && !target.poisoned && text.includes('Shield') ? target.id : null };
  room.phase = 'MORNING';
  narrate(room, text, 'night');
  if (traitors(room).length === 0) { setTimer(room, 8000, () => endGame(room)); return push(room); }
  setTimer(room, 30000, () => { if (alive(room).length <= 4 && room.round > 0) { if (alive(room).length <= 2) return endGame(room); return endChoice2(room); } startMission(room); });
  push(room);
}
function endChoice2(room) { // after murder when few left → straight to end choice but via a mission first? keep simple: mission then table
  startMission(room);
}

// ----- END -----
function endGame(room) {
  clearTimer(room);
  const ts = traitors(room);
  if (ts.length >= 2) { room.pd = { choices: {}, traitorIds: ts.map(t => t.id) }; room.phase = 'SHARE_STEAL'; narrate(room, `End Game. ${ts.length} Traitors bache. Ab aakhri sawaal — Share... ya Steal?`, 'banish'); setTimer(room, 30000, () => finalize(room)); return push(room); }
  finalize(room);
}
function finalize(room) {
  clearTimer(room);
  const ts = traitors(room); const fs = faithful(room);
  const pot = room.pot; let payouts = []; let headline = ''; let party = room.partyFund;
  if (ts.length === 0) {
    const each = Math.floor(pot / fs.length);
    payouts = fs.map(p => ({ name: p.name, amt: each })); party += pot - each * fs.length;
    headline = 'Innocents jeet gaye. Saare Traitors banished.';
  } else if (ts.length === 1) {
    payouts = [{ name: ts[0].name, amt: pot }]; headline = `${ts[0].name} — akela Traitor — poori prize money le gaya. Sabko bharosa tha. Sab galat the.`;
  } else {
    const ch = room.pd.choices || {};
    const steals = ts.filter(t => ch[t.id] === 'steal');
    if (steals.length === 0) { const each = Math.floor(pot / ts.length); payouts = ts.map(p => ({ name: p.name, amt: each, choice: 'share' })); party += pot - each * ts.length; headline = 'Traitors jeet gaye — aur dono ne SHARE kiya.'; }
    else if (steals.length === 1) { payouts = ts.map(p => ({ name: p.name, amt: p.id === steals[0].id ? pot : 0, choice: ch[p.id] || 'share' })); headline = `${steals[0].name} ne apne hi fellow Traitor ko STEAL kar liya.`; }
    else { payouts = ts.map(p => ({ name: p.name, amt: 0, choice: 'steal' })); party += pot; headline = 'Dono ne STEAL chuna. Dono ko kuch nahi. Poori prize money party fund mein. 🍕'; }
  }
  const report = room.voteHistory.map(v => ({ round: v.round, banished: v.banished ? pname(room, v.banished) : null, votes: Object.entries(v.votes).map(([a, b]) => `${pname(room, a)}→${pname(room, b)}`) }));
  const roles = room.order.map(id => ({ name: room.players[id].name, role: room.players[id].role, alive: room.players[id].alive, recruited: room.players[id].recruited }));
  room.finalResult = { headline, payouts, party, pot, report, roles, missionsWon: room.missionsWon, missionsLost: room.missionsLost };
  room.phase = 'FINAL'; room.pd = {};
  narrate(room, headline, 'banish');
  push(room);
}

// ---------- sockets ----------
io.on('connection', (socket) => {
  let ctx = { code: null, pid: null };
  const room = () => rooms[ctx.code];

  socket.on('create', ({ name, token, seen }, cb) => {
    if (!name || !token) return cb({ error: 'naam?' }); mergeSeen(token, seen);
    const r = createRoom(name.trim(), token);
    ctx = { code: r.code, pid: token }; r.players[token].socketId = socket.id; socket.join(r.code);
    cb({ code: r.code }); push(r);
  });
  socket.on('join', ({ code, name, token, seen }, cb) => {
    code = (code || '').toUpperCase().trim(); const r = rooms[code]; if (token) mergeSeen(token, seen);
    if (!r) return cb({ error: 'Is code ka koi game nahi mila' });
    if (r.players[token]) { r.players[token].connected = true; r.players[token].socketId = socket.id; ctx = { code, pid: token }; socket.join(code); cb({ code }); return push(r); }
    if (r.phase !== 'LOBBY') return cb({ error: 'Game shuru ho chuka hai' });
    if (r.order.length >= 10) return cb({ error: 'Palace full hai (10)' });
    if (!name) return cb({ error: 'naam?' });
    if (Object.values(r.players).some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return cb({ error: 'Is naam ka player pehle se hai' });
    addPlayer(r, token, name.trim()); r.players[token].socketId = socket.id; ctx = { code, pid: token }; socket.join(code);
    r.chat.push({ t: now(), sys: true, text: `${r.players[token].name} palace mein aaye · ₹${r.settings.stake} prize money mein → ₹${r.settings.stake * r.order.length}` });
    cb({ code }); push(r);
  });
  socket.on('rejoin', ({ code, token, seen }, cb) => { if (token) mergeSeen(token, seen);
    const r = rooms[(code || '').toUpperCase()]; if (!r || !r.players[token]) return cb && cb({ error: 'no' });
    r.players[token].connected = true; r.players[token].socketId = socket.id; ctx = { code: r.code, pid: token }; socket.join(r.code); cb && cb({ ok: true }); push(r);
  });
  socket.on('settings', (s) => { const r = room(); if (!r || ctx.pid !== r.hostId || r.phase !== 'LOBBY') return; if (typeof s.stake === 'number') r.settings.stake = Math.max(0, Math.min(MAX_STAKE, Math.round(s.stake))); if (typeof s.adult === 'boolean') r.settings.adult = s.adult; if (typeof s.masala === 'boolean') r.settings.masala = s.masala; push(r); });
  socket.on('kick', (id) => { const r = room(); if (!r || ctx.pid !== r.hostId || r.phase !== 'LOBBY' || id === r.hostId) return; const p = r.players[id]; if (p && p.socketId) io.to(p.socketId).emit('kicked'); delete r.players[id]; r.order = r.order.filter(x => x !== id); push(r); });
  socket.on('start', () => { const r = room(); if (!r || ctx.pid !== r.hostId || r.phase !== 'LOBBY') return; startGame(r); });
  socket.on('ready', () => { const r = room(); if (r) doReady(r, ctx.pid); });
  socket.on('addBots', () => { const r = room(); if (!r || ctx.pid !== r.hostId || r.phase !== 'LOBBY') return; addBots(r); });
  socket.on('mission', (val, cb) => { const r = room(); if (!r) return; const res = missionSubmit(r, ctx.pid, val); if (typeof cb === 'function') cb(res || {}); });
  socket.on('gchat', (text) => { const r = room(); if (!r || r.phase !== 'MISSION' || r.pd.type !== 'puzzle') return; const p = r.players[ctx.pid]; if (!p || !p.alive) return; const g = groupOf(r, ctx.pid); if (!g) return; text = (text || '').toString().slice(0, 160).trim(); if (!text) return; r.pd.gchat[g].push({ t: now(), name: p.name, pid: p.id, text }); push(r); });
  socket.on('sabotage', () => { const r = room(); if (!r || r.phase !== 'MISSION' || r.pd.saboteur !== ctx.pid) return; r.pd.sabotaged = true; push(r); });
  socket.on('chat', (text) => {
    const r = room(); if (!r) return; const p = r.players[ctx.pid]; if (!p || !p.alive) return;
    if (r.phase !== 'TABLE' && r.phase !== 'LOBBY' && r.phase !== 'FINAL' && r.phase !== 'MISSION_RESULT' && r.phase !== 'MORNING') return;
    text = (text || '').toString().slice(0, 200).trim(); if (!text) return;
    const anon = r.phase === 'TABLE' && r.pd.anonUntil && now() < r.pd.anonUntil;
    r.chat.push({ t: now(), name: anon ? '🕶️ Gumnaam' : p.name, pid: anon ? null : p.id, text });
    if (r.chat.length > 300) r.chat.shift(); push(r);
  });
  socket.on('tchat', (text) => { const r = room(); if (!r) return; const p = r.players[ctx.pid]; if (!p || !p.alive || p.role !== 'traitor') return; text = (text || '').toString().slice(0, 200).trim(); if (!text) return; r.tchat.push({ t: now(), name: p.name, text }); push(r); });
  socket.on('lie', (text) => { const r = room(); if (!r || r.phase !== 'TABLE' || r.pd.card !== 'lie' || r.pd.liar !== ctx.pid || r.pd.lieText) return; r.pd.lieText = (text || '').slice(0, 120); r.pd.lieScanning = true; push(r); setTimeout(() => { if (r.phase === 'TABLE') { r.pd.lieScanning = false; r.pd.lieResult = Math.random() < 0.5 ? 'SACH' : 'JHOOTH'; narrate(r, `🤥 Lie Detector: "${r.pd.lieText}" — ${pname(r, ctx.pid)} — ${r.pd.lieResult}!`, 'table'); push(r); } }, 4000); });
  socket.on('extend', () => { const r = room(); if (r && ctx.pid === r.hostId) extendTable(r); });
  socket.on('endTable', () => { const r = room(); if (r && ctx.pid === r.hostId && r.phase === 'TABLE') startVote(r); });
  socket.on('skip', () => { const r = room(); if (!r || ctx.pid !== r.hostId) return; if (r.phase === 'MISSION_RESULT') startTable(r); else if (r.phase === 'MORNING') { clearTimer(r); if (alive(r).length <= 2) return endGame(r); startMission(r); } });
  socket.on('vote', ({ target, reason }) => { const r = room(); if (r) castVote(r, ctx.pid, target, reason); });
  socket.on('flip', () => { const r = room(); if (r) flipCard(r, ctx.pid); });
  socket.on('antim', (target) => { const r = room(); if (r) antim(r, ctx.pid, target); });
  socket.on('endChoice', (v) => { const r = room(); if (r) doEndChoice(r, ctx.pid, v); });
  socket.on('night', ({ action, target }) => { const r = room(); if (r) traitorPropose(r, ctx.pid, action, target); });
  socket.on('recruit', (yes) => { const r = room(); if (r) recruitAnswer(r, ctx.pid, !!yes); });
  socket.on('shareSteal', (c) => { const r = room(); if (r) doShareSteal(r, ctx.pid, c); });
  socket.on('again', () => { const r = room(); if (!r || ctx.pid !== r.hostId || r.phase !== 'FINAL') return; r.phase = 'LOBBY'; r.pd = {}; r.order.forEach(id => { const p = r.players[id]; p.alive = true; p.role = null; p.shield = false; p.poisoned = false; p.ready = false; p.recruited = false; }); r.chat = []; r.log = []; r.finalResult = null; push(r); });
  socket.on('leave', () => { const r = room(); if (!r) return; if (r.phase === 'LOBBY' && ctx.pid !== r.hostId) { delete r.players[ctx.pid]; r.order = r.order.filter(x => x !== ctx.pid); push(r); } ctx = { code: null, pid: null }; });
  socket.on('disconnect', () => { const r = room(); if (!r) return; const p = r.players[ctx.pid]; if (p) { p.connected = false; p.socketId = null; } push(r); });
});

// tick deadlines to clients cheaply + cleanup old rooms
setInterval(() => { const t = now(); for (const c in rooms) if (t - rooms[c].created > 12 * 3600 * 1000) { clearTimer(rooms[c]); delete rooms[c]; } }, 600000);

server.listen(PORT, '0.0.0.0', () => console.log('The Traitors running on ' + PORT));
