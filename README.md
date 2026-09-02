# 🗡️ The Traitors — dosto ke saath, sabke phone pe

## Chalana (local / test)
```
npm install
npm start          # http://localhost:3000
```
Sab ek hi WiFi pe ho toh laptop ka IP share karo: `http://192.168.x.x:3000`

## Asli night ke liye (free hosting, ~10 min)
1. Is folder ko GitHub pe daalo (node_modules chhod ke).
2. https://render.com → New → Web Service → repo chuno.
   - Build: `npm install` · Start: `npm start` · Free plan.
3. Jo URL mile (`https://xyz.onrender.com`) wo dosto ko bhejo. Bas.
   (Free plan 15 min idle pe so jaata hai — khelne se 1 min pehle link khol lena.)

## Khelna
- Ek banda "Naya Mahal Banao" → 4-letter code → baaki join.
- 5–10 log. ₹ per head max 50 (₹0 bhi chalega). App sirf hisaab rakhta hai — paisa aapas mein.
- Phone ki home screen pe "Add to Home Screen" karo → app jaisa khulega.

## Test bots
`node tools/sim.js` — 6 bots poora game khel lete hain. Tez test: `TIMESCALE=0.1 node server.js`
