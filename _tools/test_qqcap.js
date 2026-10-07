/* 在 Node 里用 mock DOM 加载 website/qqcap.js，喂真实结构的响应样本，验证能抓出歌 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* 优先从生成的页面里取内联脚本 —— 保证"用户拿到的"就是"这里测的" */
const pagePath = path.join(__dirname, '..', 'website', 'qqmusic.html');
let src, from = 'qqcap.js';
if (fs.existsSync(pagePath)) {
  const page = fs.readFileSync(pagePath, 'utf8');
  const m = page.match(/<script id="capsrc" type="text\/plain">([\s\S]*?)<\/script>/);
  if (m && m[1].indexOf('__QQCAP__') > 0) { src = m[1]; from = 'qqmusic.html（内联）'; }
}
if (!src) src = fs.readFileSync(path.join(__dirname, '..', 'website', 'qqcap.js'), 'utf8');
console.log('被测脚本来源:', from, '|', src.length, '字节');

const win = {};
const doc = {};                       // 故意不给 body → 跳过面板构建
const ctx = vm.createContext({
  window: win, document: doc, console,
  setInterval: () => 0, setTimeout: () => 0,
  Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} }
});
ctx.self = ctx;
vm.runInContext(src, ctx);

const CAP = win.__QQCAP__;
if (!CAP) { console.error('✗ __QQCAP__ 没挂上'); process.exit(1); }

const { digest, pickSong } = CAP.test;

/* ---- 样本 1：老版 playlist_cp 接口 ---- */
const s1 = JSON.stringify({
  code: 0,
  data: { cdlist: [{ dissid: '7177076625', dissname: '华语经典', songlist: [
    { songname: '晴天', singer: [{ name: '周杰伦' }], albumname: '叶惠美' },
    { songname: '起风了', singer: [{ name: '买辣椒也用券' }], albumname: '起风了' },
    { songname: '晴天', singer: [{ name: '周杰伦' }], albumname: '叶惠美' }
  ] }] }
});

/* ---- 样本 2：新版 musics.fcg / CgiGetDiss ---- */
const s2 = JSON.stringify({
  code: 0, req_0: { code: 0, data: { dirinfo: { title: '我喜欢的音乐' }, songlist: [
    { name: '我记得', singer: [{ name: '赵雷' }], album: { name: '署前街少年' } },
    { name: '朵 nourishing', singer: [{ name: '赵雷' }, { name: 'test' }], album: { name: '署前街少年' } }
  ] } }
});

/* ---- 样本 3：嵌套很深 + 混入无关对象 ---- */
const s3 = JSON.stringify({
  a: { b: [{ c: { songlist: [{ songname: '孤勇者', singer: [{ name: '陈奕迅' }], albumname: '孤勇者' }] } }] },
  junk: { name: 'some artist profile', album: '' },
  keys: ['x', 'y'],
  n: 12345
});

function run(label, payload) {
  const before = CAP.items.length;
  digest(payload);
  const got = CAP.items.slice(before);
  console.log(`\n[${label}] 新抓到 ${got.length} 首`);
  got.forEach(t => console.log(`   ${t.name}${t.artists ? ' - ' + t.artists : ''}${t.album ? '  （专辑：' + t.album + '）' : ''}`));
  return got;
}

const a = run('老版 playlist_cp（含 1 条重复）', s1);
const b = run('新版 musics.fcg', s2);
const c = run('深层嵌套 + 干扰数据', s3);

console.log('\n===== 汇总 =====');
console.log('累计去重后总数:', CAP.items.length);
console.log('导出文本预览:\n' + CAP.text().split('\n').slice(0, 5).join('\n'));

/* 断言 */
const flat = CAP.items.map(t => t.name + '|' + t.artists);
const ok1 = flat.includes('晴天|周杰伦');
const ok2 = flat.includes('起风了|买辣椒也用券');
const ok3 = flat.includes('我记得|赵雷');
const ok4 = flat.includes('孤勇者|陈奕迅');
const dup = flat.filter(x => x === '晴天|周杰伦').length === 1;
const nojunk = !flat.some(x => x.indexOf('some artist') >= 0);

console.log('\n===== 断言 =====');
console.log((ok1 ? '✓' : '✗') + ' 认出老版结构的歌');
console.log((ok2 ? '✓' : '✗') + ' 认出简体Summary name/singer');
console.log((ok3 ? '✓' : '✗') + ' 认出新版 album 是对象的情况');
console.log((ok4 ? '✓' : '✗') + ' 深层嵌套也能挖到');
console.log((dup ? '✓' : '✗') + ' 同名同歌手只保留一首（去重）');
console.log((nojunk ? '✓' : '✗') + ' 没把无关对象当成歌');
const allOk = ok1 && ok2 && ok3 && ok4 && dup && nojunk;
console.log('\n' + (allOk ? '全部通过 ✓ 可以拿去用了' : '有失败项，别发布'));
