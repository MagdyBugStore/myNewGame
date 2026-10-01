'use strict';

/* ============================================================
   أصوات اللعبة — بتيجي من data URIs في js/art.js
   ============================================================ */

const _sfxPool = {};
const _sfxLast = {};
let _sfxIdx = 0;

/**
 * sfx('sword', 0.4, 180) — آخر معامل = أقل مدة بين تكرار نفس الصوت (ms)
 */
function sfx(name, vol, minGap) {
  if (!G.sfxOn) return;
  const uri = (typeof SFX !== 'undefined') ? SFX[name] : null;
  if (!uri) return;

  if (minGap) {
    const now = performance.now();
    if (now - (_sfxLast[name] || 0) < minGap) return;
    _sfxLast[name] = now;
  }

  let pool = _sfxPool[name];
  if (!pool) {
    pool = _sfxPool[name] = [];
    for (let i = 0; i < 3; i++) {
      const a = new Audio(uri);
      a.preload = 'auto';
      pool.push(a);
    }
  }

  const a = pool[_sfxIdx = (_sfxIdx + 1) % pool.length];
  try {
    a.pause();
    a.currentTime = 0;
    a.volume = (vol === undefined) ? 0.45 : vol;
    const p = a.play();
    if (p && p.catch) p.catch(function () { /* لازم تفاعل من المستخدم الأول */ });
  } catch (e) { /* ignore */ }
}
