// سيرفر ملفات ثابتة بسيط لمعاينة ملفات الأصول محليًا
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = process.argv[3] || process.cwd();
const port = Number(process.argv[2]) || 8140;
const MIME = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wav': 'audio/wav' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let p = path.normalize(path.join(root, url));
  if (!p.startsWith(path.normalize(root))) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size });
    fs.createReadStream(p).pipe(res);
  });
}).listen(port, '127.0.0.1', () => console.log('serving', root, 'on', port));
