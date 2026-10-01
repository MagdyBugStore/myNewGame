'use strict';

/* ============================================================
   الذكاء الاصطناعي للعدو: القاعدة + موجات الهجوم
   ============================================================ */

function setupEnemy() {
  const BO = G.basePos.e;

  const keep = placeBuilding('keep', BO.x, BO.y, 1, true);
  if (keep) { keep.built = 1; keep.hp = keep.maxHp; }
  G.enemyKeep = keep;

  const put = (key, dx, dy) => {
    const def = BUILD_DEFS[key];
    const spot = findSpot(def, BO.x + dx, BO.y + dy, 8);
    if (!spot) return null;
    const b = placeBuilding(key, spot.x, spot.y, 1, true);
    if (b) { b.built = 1; b.hp = b.maxHp; }
    return b;
  };

  put('house', -1, 5);
  put('house', 5, -1);
  put('house', 6, 5);
  put('house', -2, -2);
  put('barracks', -2, 3);
  put('tower', 5, 2);
  put('tower', 2, 5);
  put('tower', -2, 7);

  for (let i = 0; i < 7; i++) put('wall', -3 + i, -3);
  for (let i = 1; i < 7; i++) put('wall', -3, -3 + i);

  // مدافعون
  for (let i = 0; i < 4; i++) {
    const s = nearestFree(BO.x - 3, BO.y - 3 + i, 8);
    if (s) spawnUnit('esword', 1, s.x + 0.5, s.y + 0.5);
  }
  const s2 = nearestFree(BO.x + 5, BO.y + 5, 8);
  if (s2) spawnUnit('earcher', 1, s2.x + 0.5, s2.y + 0.5);

  G.enemy = { nextWave: 115, wave: 0 };
}

function playerTarget() {
  const keep = G.buildings.find(b => b.team === 0 && b.key === 'keep' && !b.dead);
  if (keep) return { x: keep.x + keep.w / 2, y: keep.y + keep.h / 2 };
  for (const b of G.buildings) {
    if (b.dead || b.team !== 0) continue;
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  return { x: G.w / 2, y: G.h / 2 };
}

function spawnWave(n) {
  const keep = G.enemyKeep;
  if (!keep || keep.dead) return;
  const count = Math.min(24, 3 + Math.floor(n * 1.1));
  const archCount = n >= 3 ? Math.floor(count * 0.3) : 0;
  const swordCount = count - archCount;

  let made = 0;
  for (let i = 0; i < count; i++) {
    const type = i < swordCount ? 'esword' : 'earcher';
    const spot = freeTileNear(keep);
    if (!spot) break;
    const u = spawnUnit(type, 1, spot.x + 0.5, spot.y + 0.5);
    if (!u) break;
    const tgt = playerTarget();
    u.move = { x: tgt.x, y: tgt.y };
    u.path = pathToTile(u.x, u.y, Math.floor(tgt.x), Math.floor(tgt.y));
    u.pathIdx = 0;
    made++;
  }

  const warns = ['⚠️ موجة معادية في الطريق!', '⚔️ العدو يتحرك باتجاهك!', '🔥 هجوم جديد! استعد!'];
  sfx('charge', 0.6);
  logMsg(warns[Math.min(warns.length - 1, n - 1)] + ' (' + made + ' جندي)', 'bad');

  if (typeof fireWaveHook === 'function') fireWaveHook(n, made);
}

function updateAI(dt) {
  if (G.gameOver || !G.enemy) return;
  G.enemy.nextWave -= dt;
  if (G.enemy.nextWave <= 0) {
    G.enemy.wave++;
    spawnWave(G.enemy.wave);
    G.enemy.nextWave = Math.max(50, 110 - G.enemy.wave * 5);
  }
}
