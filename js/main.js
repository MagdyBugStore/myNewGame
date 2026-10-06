'use strict';

/* ============================================================
   التشغيل: التهيئة، الحلقة الرئيسية، التحديث
   ============================================================ */

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  G.dpr = dpr;
  G.vw = window.innerWidth;
  G.vh = window.innerHeight;
  G.canvas.width = Math.floor(G.vw * dpr);
  G.canvas.height = Math.floor(G.vh * dpr);
  G.canvas.style.width = G.vw + 'px';
  G.canvas.style.height = G.vh + 'px';
}

/* ------------------------------------------------------------
   قاعدة اللاعب
   ------------------------------------------------------------ */
function setupPlayer() {
  const BO = G.basePos.p;

  const keep = placeBuilding('keep', BO.x, BO.y, 0, true);
  if (keep) { keep.built = 1; keep.hp = keep.maxHp; }
  G.playerKeep = keep;

  const put = (key, dx, dy) => {
    const def = BUILD_DEFS[key];
    const spot = findSpot(def, BO.x + dx, BO.y + dy, 10);
    if (!spot) return null;
    const b = placeBuilding(key, spot.x, spot.y, 0, true);
    if (b) finalizeBuilding(b);
    return b;
  };

  put('house', 5, -1);
  put('farm', -1, 5);
  put('lumber', 6, 4);
  put('house', -2, -2);

  // بداية الجيش
  const a = nearestFree(BO.x + 4, BO.y + 6, 8);
  const b2 = nearestFree(BO.x + 6, BO.y + 4, 8);
  const c = nearestFree(BO.x + 5, BO.y + 5, 8);
  const d = nearestFree(BO.x + 4, BO.y + 4, 8);
  const e = nearestFree(BO.x + 6, BO.y + 6, 8);
  if (a) spawnUnit('swordsman', 0, a.x + 0.5, a.y + 0.5);
  if (b2) spawnUnit('swordsman', 0, b2.x + 0.5, b2.y + 0.5);
  if (c) spawnUnit('archer', 0, c.x + 0.5, c.y + 0.5);
  if (d) spawnUnit('archer', 0, d.x + 0.5, d.y + 0.5);
  if (e) spawnUnit('swordsman', 0, e.x + 0.5, e.y + 0.5);

  logMsg('🎯 الهدف: دمّر قلعة العدو في الجهة المقابلة من الخريطة', 'good');
  logMsg('ابنِ قاعدتك، درّب جنودك، ودافع عن القلعة!', 'good');
}

/* ------------------------------------------------------------
   التهيئة
   ------------------------------------------------------------ */
function init() {
  G.canvas = document.getElementById('game');
  G.ctx = G.canvas.getContext('2d');
  const mm = document.getElementById('minimap');
  G.mmCanvas = mm;
  G.mmCtx2 = mm.getContext('2d');

  resize();
  preloadArt();        // يبدأ تحميل صور الأرض/المباني (وتُخبز الأرض تاني لما تجهز)
  generateMap();
  G.bgrid = new Array(G.w * G.h).fill(null);
  G.res_count = {
    food: CFG.START_RES.food, wood: CFG.START_RES.wood,
    stone: CFG.START_RES.stone, iron: CFG.START_RES.iron, gold: CFG.START_RES.gold
  };

  initInput();
  initUI();
  initScriptConsole();   // قبل ما أي logMsg يتنادى عشان اللايف لوجز يشتغل

  setupPlayer();
  setupEnemy();
  updatePop();

  const p = G.basePos.p;
  centerOn(p.x + 3, p.y + 3);
  G.cam.zoom = 0.9;
  clampCamera();

  window.addEventListener('keydown', e => {
    if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) { /* سيبها تشتغل */ }
  });

  G.last = performance.now();
  requestAnimationFrame(loop);

  // تشغيل السكربت المحفوظ لو التفعيل التلقائي مفعّل
  try {
    if (localStorage.getItem('rts_auto') === '1') {
      const saved = localStorage.getItem('rts_script');
      if (saved) setTimeout(() => runScript(saved), 400);
    }
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------
   الحلقة
   ------------------------------------------------------------ */
function loop(ts) {
  const dt = Math.min(0.05, (ts - G.last) / 1000 || 0.016);
  G.last = ts;
  G.fps = G.fps ? (G.fps * 0.92 + (1 / Math.max(dt, 0.0001)) * 0.08) : (1 / Math.max(dt, 0.0001));

  if (!G.gameOver) {
    G.time += dt;
    updateCamera(dt);
    updateEconomy(dt);
    updateBuildings(dt);
    updateUnits(dt);
    updateProjectiles(dt);
    updateEffects(dt);
    updateHooks(dt);
    updateAI(dt);
    updatePop();
  }

  render();
  updateHUD(dt);
  updatePanel();

  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
