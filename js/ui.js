'use strict';

/* ============================================================
   الواجهة: شريط الموارد، شريط البناء، لوحة التحديد، الرسائل
   ============================================================ */

function artHtml(key) {
  return (typeof ART !== 'undefined' && ART[key]) ? '<img class="portrait" src="' + ART[key] + '" alt="">' : '';
}

function initUI() {
  const bar = document.getElementById('buildbar');
  bar.innerHTML = '';
  BUILD_ORDER.forEach((key, i) => {
    const def = BUILD_DEFS[key];
    const el = document.createElement('button');
    el.className = 'bbtn';
    el.dataset.key = key;
    el.title = def.name + ' — ' + costText(def.cost);
    el.innerHTML =
      '<span class="bk">' + (i + 1) + '</span>' +
      (ART[key]
        ? '<img class="bi" src="' + ART[key] + '" alt="">'
        : '<span class="bi">' + def.icon + '</span>') +
      '<span class="bn">' + def.name + '</span>' +
      '<span class="bc">' + costText(def.cost) + '</span>';
    el.addEventListener('click', () => {
      sfx('click', 0.4);
      if (G.placing === key) cancelPlacing();
      else startPlacing(key);
    });
    bar.appendChild(el);
  });

  document.getElementById('ovbtn').addEventListener('click', () => location.reload());

  // زرار الصوت
  const snd = document.createElement('button');
  snd.id = 'sfx-btn';
  const paint = () => { snd.innerHTML = G.sfxOn ? '🔊 صوت' : '🔇 مطفي'; };
  paint();
  snd.addEventListener('click', () => { G.sfxOn = !G.sfxOn; paint(); if (G.sfxOn) sfx('click', 0.4); });
  document.getElementById('topbar').appendChild(snd);
}

/* ------------------------------------------------------------
   الشريط العلوي
   ------------------------------------------------------------ */
let _hudT = 0;
function updateHUD(dt) {
  _hudT -= dt;
  if (_hudT > 0) return;
  _hudT = 0.15;

  const set = (id, val, low) => {
    const el = document.getElementById(id);
    if (!el) return;
    const em = el.querySelector('em');
    if (em.textContent !== val) em.textContent = val;
    el.classList.toggle('low', !!low);
  };
  set('r-food', Math.floor(G.res_count.food), G.res_count.food < 30);
  set('r-wood', Math.floor(G.res_count.wood), G.res_count.wood < 30);
  set('r-stone', Math.floor(G.res_count.stone), G.res_count.stone < 30);
  set('r-iron', Math.floor(G.res_count.iron), G.res_count.iron < 10);
  set('r-gold', Math.floor(G.res_count.gold), G.res_count.gold < 30);
  set('r-pop', G.pop + '/' + G.popCap, G.pop >= G.popCap);

  const t = Math.floor(G.time);
  document.getElementById('timer').textContent =
    String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');

  const th = document.getElementById('threat');
  if (th && G.enemy) {
    const s = Math.max(0, Math.ceil(G.enemy.nextWave));
    th.textContent = s <= 10 ? ('⚔️ هجوم خلال ' + s + 'ث!')
      : ('الموجة ' + (G.enemy.wave + 1) + ' بعد ' + s + 'ث');
    th.classList.toggle('calm', s > 45);
  }

  // تفعيل/تعطيل أزرار البناء حسب الموارد
  document.querySelectorAll('.bbtn').forEach(el => {
    const def = BUILD_DEFS[el.dataset.key];
    el.classList.toggle('cant', !canAfford(def.cost));
  });
}

/* ------------------------------------------------------------
   لوحة التحديد
   ------------------------------------------------------------ */
let _panelSig = '';
function updatePanel() {
  const p = document.getElementById('panel');
  let sig = G.sel.map(o => o.id + ':' + Math.round(o.hp)).join(',') + '|' + G.sel.length;
  if (G.sel.length === 1 && G.sel[0].def && G.sel[0].def.train) {
    const b = G.sel[0];
    sig += '|q' + b.queue.length + ':' + Math.ceil(b.trainT) + ':' +
      b.def.train.map(t => (canTrain(b, t) ? 1 : 0)).join('');
  }
  if (sig === _panelSig) return;
  _panelSig = sig;

  if (!G.sel.length) {
    p.classList.add('hidden');
    p.innerHTML = '';
    document.getElementById('minimapwrap').classList.remove('withpanel');
    return;
  }
  document.getElementById('minimapwrap').classList.add('withpanel');
  p.classList.remove('hidden');

  if (G.sel.length > 1) {
    const units = G.sel.filter(o => o.type);
    let html = '<h3>' + G.sel.length + ' وحدة محددة</h3><div class="info">';
    const counts = {};
    units.forEach(u => { counts[u.def.name] = (counts[u.def.name] || 0) + 1; });
    for (const k in counts) html += counts[k] + ' × ' + k + '<br>';
    html += '</div><div class="row">' +
      '<button class="tbtn" data-act="allsold">🛡️ كل الجنود</button>' +
      '<button class="tbtn" data-act="allwork">🧑‍🌾 كل الفلاحين</button>' +
      '</div>';
    p.innerHTML = html;
    bindPanelActs(p);
    return;
  }

  const o = G.sel[0];
  const hpTxt = '<div class="hpbar"><span style="width:' + Math.max(0, (o.hp / o.maxHp) * 100) + '%"></span></div>';

  if (o.type) {
    let state = '';
    if (o.def.dmg) {
      state = o.target ? 'يقاتل' : (o.move ? 'في طريقه' : 'يقف في مكانه');
    } else {
      const st = { idle: 'يبحث عن عمل', toRes: 'يذهب للمورد', gather: 'يجمع', toDrop: 'يسلّم', wait: 'ينتظر' };
      state = st[o.state] || o.state;
      if (o.carryN > 0) state += ' — يحمل ' + o.carryN + ' ' + RES_NAME[o.carry];
    }
    p.innerHTML = artHtml(o.type) +
      '<h3>' + o.def.icon + ' ' + o.def.name + '</h3>' +
      hpTxt +
      '<div class="info">الصحة: ' + Math.ceil(o.hp) + ' / ' + o.maxHp + '<br>الحالة: ' + state + '</div>' +
      '<div class="row">' +
      (o.def.dmg
        ? '<button class="tbtn" data-act="allsold">🛡️ كل الجنود (' + api.soldiers().length + ')</button>'
        : '<button class="tbtn" data-act="allwork">🧑‍🌾 كل الفلاحين (' + api.workers().length + ')</button>') +
      '<button class="tbtn" data-act="stop">✋ إيقاف</button>' +
      '</div>';
    bindPanelActs(p);
    return;
  }

  const b = o;
  let html = artHtml(b.key) + '<h3>' + b.def.icon + ' ' + b.def.name + '</h3>' + hpTxt;
  html += '<div class="info">الصحة: ' + Math.ceil(b.hp) + ' / ' + b.maxHp;
  if (b.built < 1) html += '<br>جارٍ البناء… ' + Math.floor(b.built * 100) + '%';
  if (b.def.prod) html += '<br>ينتج: ' + RES_NAME[b.def.prod];
  if (b.def.pop) html += '<br>سكان: +' + b.def.pop;
  html += '</div>';

  if (b.def.train) {
    html += '<div class="row">';
    b.def.train.forEach(t => {
      const def = UNIT_DEFS[t];
      const ok = canTrain(b, t);
      html += '<button class="tbtn' + (ok ? '' : ' cant') + '" data-train="' + t + '">' +
        def.icon + ' ' + def.name + '<br><small>' + costText(def.cost) + ' · ' + def.time + 'ث</small></button>';
    });
    html += '</div>';
    if (b.queue.length) {
      html += '<div class="qbar">في الطابور: ' + b.queue.length + ' (' +
        UNIT_DEFS[b.queue[0]].name + ' — ' + Math.ceil(b.trainT) + 'ث)</div>';
    }
  }
  p.innerHTML = html;

  p.querySelectorAll('[data-train]').forEach(btn => {
    btn.addEventListener('click', () => queueUnit(b, btn.dataset.train));
  });
}

function bindPanelActs(p) {
  p.querySelectorAll('[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const a = btn.dataset.act;
      if (a === 'allsold') G.sel = api.soldiers();
      else if (a === 'allwork') G.sel = api.workers();
      else if (a === 'stop') selectedUnits().forEach(u => api.stop(u));
      _panelSig = '';
      updatePanel();
    });
  });
}

/* ------------------------------------------------------------
   الرسائل
   ------------------------------------------------------------ */
function logMsg(text, cls) {
  // حفظ في السجل عشان أوامر الـ CLI: logs / state
  if (!G.logs) G.logs = [];
  G.logs.push({ t: G.time, text: text, cls: cls || '' });
  if (G.logs.length > 400) G.logs.shift();
  if (typeof sbLog === 'function') sbLog(text, cls, G.time);

  const box = document.getElementById('logbox');
  const el = document.createElement('div');
  el.className = 'msg' + (cls ? ' ' + cls : '');
  el.textContent = text;
  box.appendChild(el);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
}

/* ------------------------------------------------------------
   نهاية اللعبة
   ------------------------------------------------------------ */
function endGame(n) {
  if (G.gameOver) return;
  G.gameOver = n;
  const ov = document.getElementById('overlay');
  ov.classList.remove('hidden');
  const title = document.getElementById('ovtitle');
  const text = document.getElementById('ovtext');
  if (n === 1) {
    title.textContent = '🏆 النصر!';
    title.style.color = '#ffe9a8';
    text.textContent = 'سقطت قلعة العدو. الخريطة لك.';
  } else {
    title.textContent = '💀 هُزمت';
    title.style.color = '#ff8a7a';
    text.textContent = 'دُمّرت قلعتك. جرّب حظاً آخر.';
  }
}
