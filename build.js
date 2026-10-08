'use strict';
/* يجمّع css + كل ملفات js في index.html واحد (المعاينة بتحمّل ملف واحد بس) */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const JS_FILES = ['art', 'spr', 'sfx', 'config', 'anim', 'map', 'buildings', 'units', 'ai', 'render', 'bldfx', 'input', 'ui', 'console', 'main'];

const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
const js = JS_FILES
  .map(n => '/* ===== js/' + n + '.js ===== */\n' + fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8'))
  .join('\n\n');

if (js.includes('</script')) {
  console.error('ERROR: </script found inside bundled JS');
  process.exit(1);
}

const body = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
<title>حروب الصليبيين — Stronghold-style RTS</title>
<style>
${css}
</style>
</head>
<body>

<canvas id="game"></canvas>

<div id="hud">
  <div id="topbar">
    <div class="res" id="r-food"><i>🍞</i><b>طعام</b><em>0</em></div>
    <div class="res" id="r-wood"><i>🪵</i><b>خشب</b><em>0</em></div>
    <div class="res" id="r-stone"><i>🪨</i><b>حجر</b><em>0</em></div>
    <div class="res" id="r-iron"><i>⛏️</i><b>حديد</b><em>0</em></div>
    <div class="res" id="r-gold"><i>🪙</i><b>ذهب</b><em>0</em></div>
    <div class="res" id="r-pop"><i>👥</i><b>سكان</b><em>0/0</em></div>
    <div id="threat">—</div>
    <div id="timer">00:00</div>
  </div>

  <div id="buildbar"></div>

  <div id="panel" class="hidden"></div>

  <div id="minimapwrap">
    <canvas id="minimap" width="176" height="176"></canvas>
  </div>

  <div id="logbox"></div>

  <div id="hint">
    <b>WASD / الأسهم</b> حركة الكاميرا • <b>عجلة الفأرة</b> تصغير/تكبير •
    <b>سحب أيسر</b> تحديد • <b>زر أيمن</b> أمر/هجوم • <b>Esc</b> إلغاء
  </div>

  <div id="overlay" class="hidden">
    <div id="ovbox">
      <div id="ovtitle"></div>
      <div id="ovtext"></div>
      <button id="ovbtn">العب من جديد</button>
    </div>
  </div>
</div>

<script>
${js}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, 'index.html'), body);
console.log('built index.html — ' + (body.length / 1024).toFixed(1) + ' KB');

/* ---------- محرّر الخرائط: editor.html (ملف واحد) ---------- */
const EDITOR_JS = ['art', 'spr', 'config'].map(n => fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8'))
  .concat(fs.readFileSync(path.join(ROOT, 'editor', 'editor.js'), 'utf8')).join('\n\n');
if (EDITOR_JS.includes('</script')) { console.error('ERROR: </script found inside editor JS'); process.exit(1); }
const editorHtml = fs.readFileSync(path.join(ROOT, 'editor', 'template.html'), 'utf8')
  .replace('{{CSS}}', () => fs.readFileSync(path.join(ROOT, 'editor', 'editor.css'), 'utf8'))
  .replace('{{JS}}', () => EDITOR_JS);
fs.writeFileSync(path.join(ROOT, 'editor.html'), editorHtml);
console.log('built editor.html — ' + (editorHtml.length / 1024).toFixed(1) + ' KB');

/* ---------- showcase.html: كل السبرايتات في خريطة واحدة ---------- */
const SC_JS = ['art', 'spr', 'config'].map(n => fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8'))
  .concat(fs.readFileSync(path.join(ROOT, 'showcase', 'showcase.js'), 'utf8')).join('\n\n');
if (SC_JS.includes('</script')) { console.error('ERROR: </script found inside showcase JS'); process.exit(1); }
fs.writeFileSync(path.join(ROOT, 'showcase.html'),
  '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>معرض السبرايتات</title>' +
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#07080c}canvas{display:block}' +
  '#h{position:fixed;left:10px;bottom:10px;color:#cbbf9d;font:12px sans-serif;background:rgba(0,0,0,.6);padding:4px 10px;border-radius:6px;direction:ltr}</style></head>' +
  '<body><canvas id="cv"></canvas><div id="h">drag = pan • wheel = zoom • WASD • R = rotate units</div><script>' + SC_JS + '</script></body></html>');
console.log('built showcase.html');
