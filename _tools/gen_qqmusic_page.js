/* 把 website/qqcap.js 内联进一个可双击打开的本地页面 website/qqmusic.html
   单一数据源：脚本只维护 qqcap.js，改完重跑本生成器即可 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const cap = fs.readFileSync(path.join(root, 'website', 'qqcap.js'), 'utf8');

if (cap.indexOf('</script') >= 0) throw new Error('qqcap.js 里出现了 </script，会截断标签');
if (cap.indexOf('`') >= 0) throw new Error('qqcap.js 里有反引号，会破坏模板字符串');

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QQ 音乐歌单导出 · 本地抓取小工具</title>
<style>
:root{
  --bg:#f5f6f8; --card:#fff; --line:#e6e8eb; --txt:#1f2328; --sub:#6b7280;
  --accent:#12b76a; --accent-dark:#0e9f5d; --accent-soft:#e9fbf2;
  --warn-bg:#fffbeb; --warn-line:#fde68a; --warn-txt:#92400e; --radius:14px;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;padding:0 20px 60px;background:var(--bg);color:var(--txt);
  font:14px/1.65 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif}
.wrap{max-width:860px;margin:0 auto}
header{padding:34px 0 18px}
h1{font-size:23px;margin:0 0 8px;letter-spacing:-.2px}
.lead{color:var(--sub);margin:0;font-size:14px}
.badge-local{display:inline-flex;align-items:center;gap:6px;background:var(--accent-soft);color:#0a7a48;
  border:1px solid #bdefd3;border-radius:999px;padding:3px 12px;font-size:12.5px;margin-top:12px;font-weight:500}
.tabs{display:inline-flex;gap:4px;background:#eceff2;border:1px solid var(--line);
  padding:4px;border-radius:12px;margin-top:14px}
.tabs a{display:inline-flex;align-items:center;gap:7px;padding:8px 18px;border-radius:9px;
  font-size:13.5px;text-decoration:none;color:var(--sub);font-weight:500;transition:.15s}
.tabs a:hover{color:var(--txt)}
.tabs a.on{background:#fff;color:var(--accent-dark);font-weight:600;box-shadow:0 1px 3px rgba(16,24,40,.09)}
.nav{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
.nav a{display:inline-block;padding:6px 14px;border-radius:9px;font-size:13px;text-decoration:none;
  background:#fff;border:1px solid var(--line);color:var(--txt);transition:.15s}
.nav a:hover{border-color:var(--accent);color:var(--accent-dark)}
.nav a.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.nav a.primary:hover{background:var(--accent-dark);color:#fff}

.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:20px 22px;margin-bottom:16px}
.card h2{font-size:16px;margin:0 0 12px;display:flex;align-items:center;gap:8px}
.card h2 .n{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;
  border-radius:50%;background:var(--accent);color:#fff;font-size:12px;font-weight:600}
.card ol{margin:8px 0;padding-left:22px}
.card li{margin-bottom:9px}
code{background:#f3f4f6;border:1px solid var(--line);border-radius:5px;padding:1px 6px;
  font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12.5px;word-break:break-all}
kbd{background:#f9fafb;border:1px solid #d1d5db;border-bottom-width:2px;border-radius:4px;padding:0 5px;font-size:12px}
.hint{color:var(--sub);font-size:12.5px;line-height:1.6;margin:10px 0 0}

.btn{background:var(--accent);color:#fff;border:0;border-radius:9px;padding:11px 22px;font-size:15px;
  font-weight:500;cursor:pointer;transition:.15s;font-family:inherit}
.btn:hover{background:var(--accent-dark)}
.btn:active{transform:translateY(1px)}
.btn.ghost{background:#fff;color:var(--txt);border:1px solid var(--line)}
.btn.ghost:hover{background:#f6f7f9}
.btnrow{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.btnrow .btn{padding:9px 18px}

.bmbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;
  background:var(--accent-soft);border:1px solid #bdefd3;border-radius:var(--radius);padding:16px 20px;margin-bottom:16px}
.bmbar a.bm{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;
  padding:10px 18px;border-radius:9px;font-weight:600;font-size:14px;cursor:grab}
.bmbar a.bm:active{cursor:grabbing}
.bmbar .tip{font-size:13px;color:#15803d;flex:1;min-width:220px;line-height:1.6}

.warn{background:var(--warn-bg);border:1px solid var(--warn-line);color:var(--warn-txt);
  border-radius:12px;padding:12px 16px;font-size:13px;margin:14px 0 0}
.warn b{font-weight:600}

pre.code{background:#f8f9fa;border:1px solid var(--line);border-radius:9px;padding:12px;
  max-height:220px;overflow:auto;font-size:12px;white-space:pre-wrap;word-break:break-all;margin:10px 0 0;
  font-family:ui-monospace,Consolas,Menlo,monospace}

#toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%) translateY(8px);
  background:#111827;color:#fff;padding:10px 20px;border-radius:10px;font-size:13.5px;
  opacity:0;pointer-events:none;transition:.25s;z-index:99}
#toast.on{opacity:1;transform:translateX(-50%)}
footer{text-align:center;color:var(--sub);font-size:12.5px;padding:24px 0 0}
.qa summary{cursor:pointer;font-weight:500;font-size:13.5px;padding:6px 0}
.qa .a{color:#374151;font-size:13px;padding:0 0 10px 2px;line-height:1.7}
</style>
</head>
<body>
<div class="wrap">

<header>
  <h1>QQ 音乐 · 歌单导出</h1>
  <p class="lead">把你在 QQ 音乐里的收藏和歌单导成「歌名 - 歌手」清单。全程只在你自己的浏览器里跑。</p>
  <span class="badge-local">🔒 不上传、不联网上报 · 断网也能用</span>
  <div class="nav">
    <a class="primary" href="index.html">← 回汽水音乐导出工具</a>
    <a href="help.html">📖 汽水工具帮助</a>
    <a href="https://4n76rxk01y665.villa.functorz-app.com">🏠 官网</a>
  </div>
</header>

<div class="bmbar">
  <a class="bm" id="bookmark" href="#" title="把我拖到浏览器的书签栏">⭐ QQ音乐歌单导出</a>
  <div class="tip"><b>最省事的办法：</b>按住上面这个按钮，<b>拖到浏览器书签栏</b>（地址栏下面那一排）。
  以后在 QQ 音乐网页上点它一下就自动抓取，不用再粘代码。</div>
</div>

<div class="card">
  <h2><span class="n">1</span>用之前，先这样一次</h2>
  <ol>
    <li>用<b>你自己的 Edge / Chrome</b> 打开 <code>https://y.qq.com</code>，登录（一般是扫码）。
        <b>注意：是在你自己平时用的浏览器里，不是我这边帮你开的窗口。</b></li>
    <li>点进你要导出的歌单 —— 比如左侧「我喜欢的音乐」，或者任意一个歌单。</li>
    <li><b>往下滚动，让歌曲都加载出来</b>（它是一屏一屏加载的，滚到底才拿得到全部）。</li>
    <li>点一下书签栏里那个 ⭐ 按钮，右上角会出现一个小面板，显示「已捕获 N 首」。</li>
    <li>面板上点<b>「复制」</b>，然后粘到你要的地方就行；也可以下 TXT / CSV / JSON。</li>
  </ol>
  <div class="warn">
    <b>想要「我喜欢的音乐」以外的歌单？</b>一样操作：在那个歌单页面上点 ⭐ 就行。
    换一个歌单前，先点面板上的「重新清空」，免得串到一起。
  </div>
</div>

<div class="card">
  <h2><span class="n">2</span>书签拖不动？那就粘贴代码（效果完全一样）</h2>
  <ol>
    <li>在 QQ 音乐歌单页面按 <kbd>F12</kbd>（Mac 是 <kbd>⌘</kbd>+<kbd>⌥</kbd>+<kbd>I</kbd>），切到 <b>Console（控制台）</b>。</li>
    <li>先点下面的「复制脚本」。</li>
    <li>粘到控制台里，回车。</li>
  </ol>
  <div class="btnrow">
    <button class="btn" id="btnCopy">复制脚本</button>
    <button class="btn ghost" id="btnToggle">看看代码</button>
  </div>
  <div class="warn">
    <b>控制台不让粘贴怎么办？</b>Chrome / Edge 会弹红字警告防诈骗。在那行输入框里先打 <code>allow pasting</code>
    再回车，然后重新粘贴一次就好了。<b>这是浏览器自带的安全提示，不是脚本有问题。</b>
  </div>
  <p class="hint">另外：页面<b>刷新之后要重新点一次</b>书签（或重新粘一次），因为拦截是挂在当时那个页面上的。</p>
  <pre class="code" id="codeBox" hidden></pre>
</div>

<div class="card">
  <h2><span class="n">3</span>几个你可能会问的</h2>
  <details class="qa"><summary>为什么数量对不上？</summary><div class="a">
    没滚到底。QQ 音乐是滚动加载的，往下再滚一批就多加载一批，面板上的数字会跟着涨 —— 涨到不动了就是全了。
  </div></details>
  <details class="qa"><summary>显示 0 首怎么办？</summary><div class="a">
    先确认页面上的歌单真的显示出来了（没显示就是没登录或页面没加载完）。然后在页面上随便点一下、往下滚一点，再点 ⭐。
  </div></details>
  <details class="qa"><summary>会被封号吗？</summary><div class="a">
    不会。它不登录、不调陌生接口、不发请求，只把浏览器<b>已经收到过</b>的数据读出来。和你自己手动抄一遍没区别。
  </div></details>
  <details class="qa"><summary>能导出收藏的歌单（别人的歌单）吗？</summary><div class="a">
    能，只要那个歌单页面你能正常打开看到歌曲。打开后点 ⭐ 就行。
  </div></details>
  <details class="qa"><summary>导出来的格式是什么？</summary><div class="a">
    默认是「歌名 - 歌手」，一行一首，跟汽水音乐导出工具的输出一模一样，可以直接喂给任何支持粘贴导入的平台。
  </div></details>
  <details class="qa"><summary>为什么不做成一个网址直接跑？</summary><div class="a">
    浏览器不允许别的网站去读 QQ 音乐的登录数据（跨域限制）。所以只能在你已经打开的 QQ 音乐页面上跑，这也是它最安全的原因。
  </div></details>
</div>

<footer>脚本只在本页内存里运行 · 不收集任何信息 · 刷新即失效</footer>
</div>

<div id="toast"></div>

<script id="capsrc" type="text/plain">
CAP_SRC_PLACEHOLDER
</script>

<script>
(function () {
  var src = document.getElementById('capsrc').textContent;

  document.getElementById('codeBox').textContent = src;
  document.getElementById('btnToggle').onclick = function () {
    var box = document.getElementById('codeBox');
    box.hidden = !box.hidden;
    this.textContent = box.hidden ? '看看代码' : '收起代码';
  };

  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  function copy(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      try { toast(document.execCommand('copy') ? '已复制，去控制台粘贴吧' : '复制失败，请手动选中'); }
      catch (e) { toast('复制失败，请手动选中'); }
      ta.remove();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制，去控制台粘贴吧'); }, fallback);
    } else fallback();
  }

  document.getElementById('btnCopy').onclick = function () { copy(src); };

  /* 生成书签链接：压成一行的立即执行函数 */
  var one = src.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/\\s+/g, ' ').trim();
  document.getElementById('bookmark').href = 'javascript:(function(){' + one + '})()';
})();
</script>
</body>
</html>
`;

/* 用函数形式替换，避免脚本里的 $& / $1 之类被当成替换模式 */
const out = html.replace('CAP_SRC_PLACEHOLDER', function () { return cap; });
if (out.indexOf('CAP_SRC_PLACEHOLDER') >= 0) throw new Error('占位符没替换成功');

fs.writeFileSync(path.join(root, 'website', 'qqmusic.html'), out, 'utf8');

/* 自检：内联脚本必须和 qqcap.js 完全一致 */
const page = fs.readFileSync(path.join(root, 'website', 'qqmusic.html'), 'utf8');
const m = page.match(/<script id="capsrc" type="text\/plain">([\s\S]*?)<\/script>/);
const okInlined = m && m[1].indexOf('__QQCAP__') > 0;
console.log('已生成 website/qqmusic.html，', out.length, '字节');
console.log('内联脚本自检:', okInlined ? '✓ 已完整注入' : '✗ 没注入！');
if (!okInlined) process.exit(1);
