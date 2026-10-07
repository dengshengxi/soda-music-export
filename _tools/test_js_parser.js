// 用真实数据验证 JS 版解析器：结果应与 Python 版一致
const fs = require('fs');
const path = require('path');
const LevelDB = require('../website/leveldb.js');

const DIR = process.argv[2] ||
  path.join(process.env.APPDATA || '', 'SodaMusic', 'Local Storage', 'leveldb');

if (!fs.existsSync(DIR)) { console.error('目录不存在: ' + DIR); process.exit(1); }

const files = fs.readdirSync(DIR)
  .filter(n => n.endsWith('.ldb') || n.endsWith('.log'))
  .map(n => ({ name: n, bytes: new Uint8Array(fs.readFileSync(path.join(DIR, n))) }));

console.log('files:', files.map(f => `${f.name}(${f.bytes.length})`).join(', '));

const t0 = Date.now();
const kv = LevelDB.readStore(files);
console.log('keys:', kv.size, 'elapsed', Date.now() - t0, 'ms');

// 找歌单
const titles = new Map();
let uid = null;
for (const k of kv.keys()) {
  const m = k.match(/useRequestCache:playlists:(\d+)$/);
  if (m) { uid = uid || m[1]; try { const o = JSON.parse(kv.get(k)); (o.data.playlists || []).forEach(p => titles.set(p.id, p.title)); } catch (e) {} }
}
console.log('uid:', uid, 'playlists:', [...titles].map(([i, t]) => `${t}(${i})`).join(', '));

const results = [];
for (const [k, v] of kv) {
  if (!k.includes('useRequestCache:playlist_detail:') || !v) continue;
  const pid = k.split('useRequestCache:playlist_detail:').pop().trim();
  if (!/^\d{10,}$/.test(pid)) continue;
  let o; try { o = JSON.parse(v); } catch (e) { continue; }
  const data = o.data || {};
  const pl = data.playlist || {};
  const tracks = [];
  for (const r of (data.media_resources || [])) {
    const t = r.entity && r.entity.track_wrapper && r.entity.track_wrapper.track;
    if (!t || !t.name) continue;
    tracks.push({
      name: t.name.trim(),
      artists: (t.artists || []).map(a => (a.name || '').trim()).filter(Boolean).join('、'),
      album: ((t.album || {}).name || '').trim()
    });
  }
  if (!tracks.length) continue;
  results.push({ pid, title: pl.title || titles.get(pid) || pid, count: pl.count_tracks, owner: (pl.owner || {}).id, tracks });
}

// 只保留本人
const mine = results.filter(r => String(r.owner) === String(uid));
console.log('\n=== 本人歌单 ===');
for (const r of mine) {
  const seen = new Set(), rows = [];
  for (const t of r.tracks) { const k = t.name + '|' + t.artists; if (seen.has(k)) continue; seen.add(k); rows.push(t); }
  console.log(`${r.title}: server=${r.count} exported=${rows.length}`);
  rows.slice(0, 8).forEach((t, i) => console.log(`  ${i + 1}. ${t.name} - ${t.artists}`));
}
console.log('\n其他（非本人）:', results.filter(r => String(r.owner) !== String(uid)).map(r => r.title + '/' + r.tracks.length).join(', '));
