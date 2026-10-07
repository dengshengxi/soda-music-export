/* 用 Node 直接跑 website/ 里的浏览器代码，验证它能解析真实的汽水音乐 leveldb */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'website');
const LevelDB = require(path.join(DIR, 'leveldb.js'));

const ldbDir = process.argv[2] ||
  path.join(process.env.APPDATA || '', 'SodaMusic', 'Local Storage', 'leveldb');

console.log('leveldb 目录:', ldbDir);
if (!fs.existsSync(ldbDir)) { console.error('目录不存在'); process.exit(1); }

const files = fs.readdirSync(ldbDir)
  .filter(f => /\.(ldb|log)$/i.test(f) && !/^(LOG|LOCK|MANIFEST)/i.test(f))
  .map(f => ({ name: f, bytes: new Uint8Array(fs.readFileSync(path.join(ldbDir, f))) }));

console.log('待解析文件:', files.map(f => f.name + '(' + f.bytes.length + ')').join(', '));

const kv = LevelDB.readStore(files);
console.log('解析出记录数:', kv.size);

/* —— 复刻 app.js 里的 extract 逻辑 —— */
let uid = null; const titles = new Map();
kv.forEach((v, k) => {
  const m = k.match(/useRequestCache:playlists:(\d+)\s*$/);
  if (!m) return;
  uid = uid || m[1];
  try {
    const o = JSON.parse(v);
    ((o.data && o.data.playlists) || []).forEach(p => titles.set(String(p.id), p.title));
  } catch (e) {}
});
console.log('uid:', uid, '| 歌单标题表:', [...titles.entries()]);

const results = [];
kv.forEach((v, k) => {
  if (k.indexOf('useRequestCache:playlist_detail:') === -1 || !v) return;
  const pid = k.split('useRequestCache:playlist_detail:').pop().trim();
  if (!/^\d{8,}$/.test(pid)) return;
  let o; try { o = JSON.parse(v); } catch (e) { return; }
  const data = o.data || {}, pl = data.playlist || {};
  const rows = [];
  (data.media_resources || []).forEach(r => {
    const t = r.entity && r.entity.track_wrapper && r.entity.track_wrapper.track;
    if (!t || !t.name) return;
    rows.push({
      name: String(t.name).trim(),
      artists: (t.artists || []).map(a => (a.name || '').trim()).filter(Boolean).join('、'),
      album: ((t.album || {}).name || '').trim()
    });
  });
  if (!rows.length) return;
  results.push({
    id: pid,
    title: pl.title || titles.get(pid) || pid,
    server: pl.count_tracks,
    owner: pl.owner && pl.owner.id,
    rows
  });
});

results.forEach(r => {
  r.isMine = uid ? String(r.owner) === String(uid) : true;
  r.isFav = /喜欢|favorite|favourite/i.test(r.title || '');
});
results.sort((a, b) => {
  if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
  if (a.isFav !== b.isFav) return a.isFav ? -1 : 1;
  return b.rows.length - a.rows.length;
});

const tagOf = r => r.isMine ? (r.isFav ? '我喜欢的' : '我创建的')
                            : (r.isFav ? '别人的喜欢' : '其他人的');

console.log('\n=== 发现的歌单（按工具里的显示顺序）===');
results.forEach(r => {
  console.log(`  [${tagOf(r)}] ${r.title}  — 本地 ${r.rows.length} 首 / 服务器 ${r.server} 首  (owner=${r.owner})`);
  r.rows.slice(0, 2).forEach(t => console.log(`         · ${t.name} - ${t.artists}`));
});

const build = (sel, dedupe) => {
  const seen = new Set(), flat = [];
  sel.forEach(p => p.rows.forEach(t => {
    if (dedupe) { const k = t.name + '|' + t.artists; if (seen.has(k)) return; seen.add(k); }
    flat.push({ playlist: p.title, t });
  }));
  return flat;
};

const mine = results.filter(r => r.isMine);
const def = mine.length ? mine : results;
console.log('\n[默认] 勾选', def.length, '个歌单 →', build(def, false).length, '首');
console.log('[全选] 勾选', results.length, '个歌单 →', build(results, false).length, '首（未去重）');
console.log('[全选+去重] →', build(results, true).length, '首');
