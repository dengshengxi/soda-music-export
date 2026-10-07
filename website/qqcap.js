/*
 * QQ 音乐歌单抓取器 —— 在 https://y.qq.com/** 页面里运行（控制台粘贴 / 书签启动）
 *
 * 原理：不猜 API、不算签名。只做两件事
 *   1. 拦截页面自己发出的 XHR / fetch 响应，从返回的 JSON 里深挖出歌曲对象
 *   2. 兜底扫描页面上已经渲染出来的歌曲 DOM
 * 所以：页面能不能正常显示歌，决定了能不能抓到 —— 你正常操作，我在后面记账。
 *
 * 注意：本文件刻意不使用 // 单行注释，因为它会被压成一行的书签 links。
 */
(function () {
  'use strict';

  if (window.__QQCAP__) {
    window.__QQCAP__.show();
    return;
  }

  var items = [];
  var seen = {};
  var urls = [];
  var urlSeen = {};
  var dirty = false;
  var lastCount = -1;

  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  function dedupeKey(n, a) {
    return (n + '|' + a).replace(/\s+/g, '').toLowerCase();
  }

  /* 从一个 JSON 对象里判断它是不是「一首歌」 */
  function pickSong(o) {
    if (!o || typeof o !== 'object') return null;

    var n = o.songname || o.name || o.songName || o.title;
    if (typeof n !== 'string') return null;
    n = norm(n);
    if (!n || n.length > 80) return null;

    var singer = '', album = '';
    var sg = o.singer;
    if (Array.isArray(sg)) {
      var parts = [];
      for (var i = 0; i < sg.length; i++) {
        var one = sg[i];
        if (one) parts.push(norm(one.name || one.title || ''));
      }
      singer = parts.filter(Boolean).join('、');
    } else if (sg && typeof sg === 'object') {
      singer = norm(sg.name || sg.title || '');
    }
    if (!singer && typeof o.singerName === 'string') singer = norm(o.singerName);
    if (!singer && typeof o.singername === 'string') singer = norm(o.singername);

    var ab = o.album;
    if (ab && typeof ab === 'object') album = norm(ab.name || ab.title || '');
    if (!album) album = norm(o.albumname || o.albumName || o.album_name || '');

    /* 至少要认出歌手或专辑，避免把无关对象当歌收进来 */
    if (!singer && !album) return null;

    return { name: n, artists: singer, album: album };
  }

  function add(song) {
    var k = dedupeKey(song.name, song.artists);
    if (seen[k]) return false;
    seen[k] = 1;
    items.push(song);
    return true;
  }

  /* 深度遍历 JSON，把长得像歌的对象全部挖出来 */
  function walk(node, depth) {
    if (!node || typeof node !== 'object' || depth > 14) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
      return;
    }
    var song = pickSong(node);
    if (song && add(song)) dirty = true;
    for (var k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      if (k === 'parent' || k === '__ob__' || k === '__vue__') continue;
      try { walk(node[k], depth + 1); } catch (e) { /* 忽略循环引用 */ }
    }
  }

  /* 记录页面自己发过的音乐接口 URL —— 万一有页面拿不全，靠它做诊断 */
  function recordUrl(u) {
    if (!u || typeof u !== 'string') return;
    if (urlSeen[u]) return;
    urlSeen[u] = 1;
    if (urls.length < 80) urls.push(u);
  }

  function digest(text) {
    if (!text || text.length < 2) return;
    var json;
    try { json = JSON.parse(text); } catch (e) { return; }
    walk(json, 0);
    tick();
  }

  /* ---------- 拦截 XHR ---------- */
  var X = window.XMLHttpRequest;
  if (X && X.prototype) {
    var origOpen = X.prototype.open;
    var origSend = X.prototype.send;
    X.prototype.open = function (m, u) {
      this.__qqUrl = String(u || '');
      return origOpen.apply(this, arguments);
    };
    X.prototype.send = function () {
      var self = this;
      this.addEventListener('load', function () {
        try { recordUrl(self.__qqUrl); digest(self.responseText); } catch (e) { /* noop */ }
      });
      return origSend.apply(this, arguments);
    };
  }

  /* ---------- 拦截 fetch ---------- */
  if (window.fetch) {
    var origFetch = window.fetch;
    window.fetch = function () {
      var p;
      try { p = origFetch.apply(this, arguments); } catch (e) { throw e; }
      try {
        p.then(function (res) {
          try { recordUrl(res && res.url); } catch (e) { /* noop */ }
          if (res && typeof res.clone === 'function') {
            res.clone().text().then(digest).catch(function () { /* noop */ });
          }
          return res;
        }).catch(function () { /* noop */ });
      } catch (e) { /* noop */ }
      return p;
    };
  }

  /* ---------- 兜底：扫页面 DOM（新版 ryqq 用 class 前缀匹配） ---------- */
  function scanDom() {
    try {
      var lis = document.querySelectorAll('li[class*="songlist__item"], li[class*="song_item"], .songlist__list > li');
      for (var i = 0; i < lis.length; i++) {
        var li = lis[i];
        var a = li.querySelector('[class*="songname"], [class*="song__name"], .js_song');
        var b = li.querySelector('[class*="artist"], [class*="singer"]');
        if (!a) continue;
        var n = norm(a.getAttribute('title') || a.textContent);
        if (!n) continue;
        var ar = b ? norm(b.getAttribute('title') || b.textContent) : '';
        if (add({ name: n, artists: ar, album: '' })) dirty = true;
      }
    } catch (e) { /* noop */ }
    tick();
  }

  /* ---------- 面板 ---------- */
  var panel = null, numEl = null, hintEl = null;

  function toText() {
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      out.push(t.artists ? t.name + ' - ' + t.artists : t.name);
    }
    return out.join('\n') + '\n';
  }

  function toCsv() {
    var rows = [['歌曲名', '歌手', '专辑']];
    for (var i = 0; i < items.length; i++) rows.push([items[i].name, items[i].artists, items[i].album]);
    return '\ufeff' + rows.map(function (r) {
      return r.map(function (c) {
        c = String(c == null ? '' : c);
        return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
  }

  function save(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function toast(msg) {
    if (!hintEl) return;
    hintEl.textContent = msg;
    setTimeout(function () { if (hintEl) hintEl.textContent = defaultHint(); }, 1800);
  }

  function defaultHint() {
    return items.length ? '慢慢往下滚，让更多歌曲加载出来' : '没抓到？把歌单页面往下滚一滚';
  }

  function tick() {
    if (!dirty) return;
    dirty = false;
    if (numEl && items.length !== lastCount) {
      lastCount = items.length;
      numEl.textContent = items.length;
    }
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.style.cssText = [
      'position:fixed', 'right:18px', 'top:18px', 'z-index:2147483647',
      'width:216px', 'background:#fff', 'color:#1f2328',
      'border:1px solid #e6e8eb', 'border-radius:14px',
      'box-shadow:0 10px 34px rgba(15,23,42,.18)',
      'font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif',
      'padding:14px 16px', 'user-select:none'
    ].join(';');

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:14px;display:flex;align-items:center;gap:6px';
    title.innerHTML = '<span>\u266a</span><span>QQ \u97f3\u4e50\u6293\u53d6</span>';

    var close = document.createElement('span');
    close.textContent = '\u00d7';
    close.style.cssText = 'margin-left:auto;cursor:pointer;color:#9ca3af;font-size:18px;line-height:1';
    close.onclick = function () { panel.style.display = 'none'; };
    title.appendChild(close);

    var countBox = document.createElement('div');
    countBox.style.cssText = 'margin:10px 0 2px;display:flex;align-items:baseline;gap:6px';
    numEl = document.createElement('span');
    numEl.style.cssText = 'font-size:28px;font-weight:700;color:#0a7a48;line-height:1';
    numEl.textContent = items.length;
    var lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:12.5px;color:#15803d';
    lbl.textContent = '\u9996\u5df2\u6355\u83b7';
    countBox.appendChild(numEl);
    countBox.appendChild(lbl);

    hintEl = document.createElement('div');
    hintEl.style.cssText = 'font-size:12px;color:#6b7280;min-height:18px';
    hintEl.textContent = defaultHint();

    function btn(text, ghost, fn) {
      var b = document.createElement('button');
      b.textContent = text;
      b.style.cssText = [
        'flex:1', 'padding:6px 0', 'font-size:12.5px', 'cursor:pointer',
        'border-radius:8px', 'font-family:inherit', 'border:1px solid',
        ghost ? '#e6e8eb;background:#fff;color:#1f2328' : '#12b76a;background:#12b76a;color:#fff'
      ].join(';');
      b.onclick = fn;
      return b;
    }

    var row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;gap:6px;margin-top:10px';
    row1.appendChild(btn('\u590d\u5236', false, function () {
      if (!items.length) return toast('\u8fd8\u6ca1\u6293\u5230\uff0c\u5148\u6eda\u4e00\u4e0b\u9875\u9762');
      copy(toText()) ? toast('\u5df2\u590d\u5236 ' + items.length + ' \u9996') : toast('\u590d\u5236\u5931\u8d25\uff0c\u8bf7\u624b\u52a8\u9009\u4e2d');
    }));
    row1.appendChild(btn('TXT', true, function () {
      if (!items.length) return toast('\u8fd8\u6ca1\u6293\u5230');
      save('QQ\u97f3\u4e50_\u6b4c\u5355.txt', toText());
    }));

    var row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    row2.appendChild(btn('CSV', true, function () {
      if (!items.length) return toast('\u8fd8\u6ca1\u6293\u5230');
      save('QQ\u97f3\u4e50_\u6b4c\u5355.csv', toCsv(), 'text/csv;charset=utf-8');
    }));
    row2.appendChild(btn('JSON', true, function () {
      if (!items.length) return toast('\u8fd8\u6ca1\u6293\u5230');
      save('QQ\u97f3\u4e50_\u6b4c\u5355.json', JSON.stringify(items, null, 1), 'application/json');
    }));

    var row3 = document.createElement('div');
    row3.style.cssText = 'display:flex;gap:6px;margin-top:6px';
    row3.appendChild(btn('\u91cd\u65b0\u6e05\u7a7a', true, function () {
      items.length = 0; seen = {}; lastCount = -1;
      numEl.textContent = '0'; toast('\u5df2\u6e05\u7a7a'); scanDom();
    }));
    row3.appendChild(btn('\u8bca\u65ad\u4fe1\u606f', true, function () {
      var d = ['\u5df2\u6293\u5230: ' + items.length + ' \u9996',
               '\u9875\u9762\u8bf7\u6c42: ' + urls.length + ' \u6761',
               'url: ' + location.href,
               '\u2014\u2014 \u62c9\u53d6\u65e5\u5fd7 \u2014\u2014']
        .concat(logs).concat(urls);
      copy(d.join('\n')) ? toast('\u5df2\u590d\u5236\u8bca\u65ad\uff0c\u7c98\u7ed9\u52a9\u624b') : toast('\u590d\u5236\u5931\u8d25');
    }));

    panel.appendChild(title);
    panel.appendChild(countBox);
    panel.appendChild(hintEl);
    panel.appendChild(row1);
    panel.appendChild(row2);
    panel.appendChild(row3);

    var foot = document.createElement('div');
    foot.style.cssText = 'margin-top:10px;font-size:11px;color:#9ca3af;line-height:1.5';
    foot.textContent = '\u6570\u636e\u53ea\u5728\u4f60\u672c\u673a\u91cc\u9762\uff0c\u4e0d\u4e0a\u4f20';
    panel.appendChild(foot);

    document.body.appendChild(panel);
  }

  function copy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  /* ============ 全量拉取：页面不给，我们就自己问服务器要 ============
     跨域不用 XHR/fetch（会被 CORS 挡），改走 JSONP —— 插一个 script 标签，
     天然跨域，而且会自动带上 .qq.com 的登录 cookie。 */
  var logs = [];
  function log(s) { if (logs.length < 60) logs.push(String(s)); }

  function cookieVal(n) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)'));
    return m ? m[1] : '';
  }

  /* QQ 音乐经典的 g_tk 算法：对 p_skey 做 djb2 */
  function makeGtk(skey) {
    var hash = 5381;
    for (var i = 0; i < skey.length; i++) hash += (hash << 5) + skey.charCodeAt(i);
    return hash & 0x7fffffff;
  }

  function jsonp(url, ms) {
    return new Promise(function (res) {
      var cb = '__qqcb' + Date.now() + Math.random().toString(36).slice(2, 7);
      var s = document.createElement('script');
      var done = false;
      function fin(d) {
        if (done) return;
        done = true;
        try { delete window[cb]; } catch (e) { /* noop */ }
        try { s.remove(); } catch (e) { /* noop */ }
        res(d);
      }
      window[cb] = function (d) { fin(d); };
      s.onerror = function () { log('JSONP 网络失败: ' + url.slice(0, 110)); fin(null); };
      s.src = url + (url.indexOf('?') < 0 ? '?' : '&') + 'callback=' + cb;
      document.body.appendChild(s);
      setTimeout(function () { log('JSONP 超时: ' + url.slice(0, 110)); fin(null); }, ms || 8000);
    });
  }

  /* 把一次响应灌进现有解析管道，返回新抓到的首数 */
  function absorb(json, tag) {
    if (!json) return 0;
    var before = items.length;
    var code = json.code != null ? json.code : (json.result != null ? json.result : '?');
    log('[' + tag + '] code=' + code + ' subcode=' + (json.subcode == null ? '-' : json.subcode));
    walk(json, 0);
    var got = items.length - before;
    log('   -> 抓到 ' + got + ' 首，累计 ' + items.length);
    tick();
    return got;
  }

  /* 所有可能藏着数据的文本：window 上的大对象 + 页面里内联的 script + 页面 HTML */
  var SRC = null;
  function sources() {
    if (SRC) return SRC;
    var out = [];
    for (var k in window) {
      var v;
      try { v = window[k]; } catch (e) { continue; }
      if (!v || typeof v !== 'object') continue;
      var j;
      try { j = JSON.stringify(v); } catch (e) { continue; }
      if (j && j.length > 200) out.push(j);
    }
    try {
      var ss = document.querySelectorAll('script');
      for (var i = 0; i < ss.length; i++) {
        var t = ss[i].textContent || '';
        if (t.length > 200) out.push(t);
      }
    } catch (e) { /* noop */ }
    try { out.push(document.body.innerHTML.slice(0, 300000)); } catch (e) { /* noop */ }
    SRC = out;
    log('可搜索的数据源: ' + out.length + ' 处（window 对象 + 内联 script + 页面 HTML）');
    return out;
  }

  var UIN_CACHE = null;
  function digUin() {
    if (UIN_CACHE !== null) return UIN_CACHE;
    var ss = sources(), re = /"uin"\s*:\s*"?(\d{5,})|uin[=:]{1,2}"?(\d{5,})/g, m;
    for (var i = 0; i < ss.length; i++) {
      re.lastIndex = 0;
      m = re.exec(ss[i]);
      if (m) { UIN_CACHE = m[1] || m[2]; return UIN_CACHE; }
    }
    UIN_CACHE = '';
    return '';
  }

  /* 从页面 SSR 数据 / 内联 script / URL 里把所有可能的歌单 id 挖出来 */
  function collectIds() {
    var ids = {}, order = [];
    function addId(v) {
      if (!v) return;
      v = String(v);
      if (!/^\d{4,}$/.test(v)) return;
      if (!ids[v]) { ids[v] = 1; order.push(v); }
    }
    var ss = sources();
    var re = /"(?:disstid|dissid|tid|dirid|dirId|dissTid)"\s*:\s*"?(\d{4,})/g, m;
    for (var i = 0; i < ss.length; i++) {
      re.lastIndex = 0;
      while ((m = re.exec(ss[i]))) addId(m[1]);
    }
    var re2 = /[?&](?:id|disstid|dirid|tid)=(\d{4,})/g, m2;
    while ((m2 = re2.exec(location.search + '&' + location.hash))) addId(m2[1]);
    log('候选歌单 id: ' + (order.slice(0, 12).join(', ') || '（还是没挖到）'));
    return order.slice(0, 12);
  }

  /* 登录态：cookie 大概率被设成 HttpOnly 读不到，所以还要回头去页面残留数据里挖 */
  var CTX = null;
  function ctx() {
    if (CTX) return CTX;
    var skey = cookieVal('p_skey') || cookieVal('skey');
    var ckUin = cookieVal('uin').replace(/^o0*/, '');
    var ssrUin = '', ssrGtk = '';

    for (var k in window) {
      var v;
      try { v = window[k]; } catch (e) { continue; }
      if (!v || typeof v !== 'object') continue;
      var j;
      try { j = JSON.stringify(v); } catch (e) { continue; }
      if (!j || j.length < 200) continue;
      if (!ssrUin) { var mu = /"uin"\s*:\s*"?(\d{5,})/.exec(j); if (mu) ssrUin = mu[1]; }
      if (!ssrGtk) {
        var mg = /"(?:g_tk|gtk|csrf|csrfmiddlewaretoken)"\s*:\s*"?(\d{3,})/.exec(j);
        if (mg) ssrGtk = mg[1];
        else { var mg2 = /g_tk=(\d{3,})/.exec(j); if (mg2) ssrGtk = mg2[1]; }
      }
    }

    var uin = ckUin || ssrUin || digUin();
    var gtk = ssrGtk || (skey ? makeGtk(skey) : 0);
    CTX = { gtk: gtk, uin: uin, hasKey: !!skey };
    log('登录态: cookie p_skey=' + (skey ? '有' : '无（HttpOnly，读不到属正常）') +
        ' cookie uin=' + (ckUin || '空') +
        ' | 页面数据里挖到 uin=' + (ssrUin || '无') + ' g_tk=' + (ssrGtk || '无') +
        ' | 采用 g_tk=' + gtk + ' uin=' + (uin || '空'));
    return CTX;
  }

  function brief(j) {
    try { return JSON.stringify(j).slice(0, 240); } catch (e) { return '(无法序列化)'; }
  }

  /* 新版统一接口 musics.fcg：靠 cookie 鉴权，一般不需要 g_tk。
     跨域但有 CORS 头时才走得通 —— 不通会被 catch，不影响后续尝试。 */
  /* 关键：不要设 Content-Type。一旦设成 application/json 就会触发 CORS 预检(OPTIONS)，
     服务器不配合就 Failed to fetch。用默认 text/plain 属于「简单请求」，不发预检。 */
  function postMusic(mod, method, param) {
    return fetch('https://u.y.qq.com/cgi-bin/musics.fcg?_=' + Date.now(), {
      method: 'POST',
      credentials: 'include',
      body: JSON.stringify({ req_0: { module: mod, method: method, param: param } })
    }).then(function (r) { return r.json(); }).catch(function (e) {
      log('   POST 失败: ' + ((e && e.message) || e));
      return null;
    });
  }

  /* fetch 走 connect-src，不受 CSP 的 script-src 限制 —— 比 JSONP 更容易活下来 */
  function fetchGet(url) {
    return fetch(url, { credentials: 'include' }).then(function (r) { return r.text(); })
      .then(function (t) {
        try { return JSON.parse(t); } catch (e) {
          log('   非 JSON 响应: ' + String(t).slice(0, 140));
          return null;
        }
      }).catch(function (e) {
        log('   fetch 失败: ' + ((e && e.message) || e));
        return null;
      });
  }

  var MUSIC_PROBES = [
    { tag: 'musics/GetSongFavList', mod: 'music.musicasset.SongFavRead', method: 'GetSongFavList',
      param: function (c) { return { loginUin: c.uin, uin: c.uin, dirid: 201, begin: 0, num: 100 }; } },
    { tag: 'musics/CgiGetDiss', mod: 'music.srfDissInfo.DissInfo', method: 'CgiGetDiss',
      param: function (c, id) { return { disstid: +id, onlysong: 0, song_begin: 0, song_num: 100 }; } }
  ];

  var BASE = [
    'https://c.y.qq.com/v8/fcg-bin/fcg_v8_playlist_cp.fcg?newsong=1&id=ID&format=json' +
      '&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0',
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1' +
      '&onlysong=0&nosign=1&disstid=ID&format=json&inCharset=GB2312&outCharset=utf-8' +
      '&notice=0&platform=yqq&needNewCode=0'
  ];

  function buildUrl(tpl, id, c, asJsonp) {
    var u = tpl.replace(/ID/g, id) + '&g_tk=' + c.gtk + '&loginUin=' + c.uin + '&hostUin=0';
    return asJsonp ? u.replace('format=json', 'format=jsonp') : u;
  }

  /* 先试「我的歌单列表」接口，拿到真正的 disstid 再拉详情 */
  var LIST = [
    'https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?cv=4747474&ct=24&qqmusic_ver=1298' +
      '&new_json=1&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0' +
      '&platform=yqq&needNewCode=0&size=100&page=0',
    'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getmyfavtag_fcg_bin.fcg?format=json' +
      '&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0'
  ];

  async function fetchAll() {
    try {
      log('===== 开始自动全量拉取 =====');
      var c = ctx();
      var ids = collectIds();
      /* cookie 是 HttpOnly 读不到没关系 —— 发请求时浏览器照样会自动带上 */

      /* 第一步：新版统一接口 musics.fcg，靠 cookie 鉴权，不需要 g_tk */
      for (var p = 0; p < MUSIC_PROBES.length; p++) {
        var pr = MUSIC_PROBES[p];
        log('--- 试 ' + pr.tag);
        if (pr.method === 'CgiGetDiss') {
          for (var q = 0; q < ids.length; q++) {
            var r0 = await postMusic(pr.mod, pr.method, pr.param(c, ids[q]));
            log('   resp: ' + brief(r0));
            if (absorb(r0, pr.tag + '#' + ids[q]) > 0) break;
          }
        } else {
          var r1 = await postMusic(pr.mod, pr.method, pr.param(c));
          log('   resp: ' + brief(r1));
          absorb(r1, pr.tag);
        }
        if (items.length >= 30) break;
      }

      /* 第一步：问「我有哪些歌单」，把真正的 id 补进来 */
      for (var i = 0; i < LIST.length; i++) {
        var u = LIST[i] + '&g_tk=' + c.gtk + '&loginUin=' + c.uin + '&hostUin=0';
        var d = await fetchGet(u);
        if (!d) d = await jsonp(u.replace('format=json', 'format=jsonp'), 8000);
        log('   resp: ' + brief(d));
        absorb(d, '列表接口' + (i + 1));
        if (d) {
          var j = JSON.stringify(d);
          var re = /"(?:disstid|dissid|tid)"\s*:\s*"?(\d{4,})/g, m;
          while ((m = re.exec(j))) if (ids.indexOf(m[1]) < 0) ids.push(m[1]);
        }
      }

      /* 第二步：逐个歌单拉详情（老接口一次给全，不用翻页） */
      var ok = 0;
      for (var a = 0; a < ids.length; a++) {
        log('--- 尝试歌单 ' + ids[a] + '（第 ' + (a + 1) + '/' + ids.length + ' 个）');
        for (var b = 0; b < BASE.length; b++) {
          var r = await fetchGet(buildUrl(BASE[b], ids[a], c, false));
          if (!r) r = await jsonp(buildUrl(BASE[b], ids[a], c, true), 8000);
          log('   resp: ' + brief(r));
          var got = absorb(r, '详情' + (b + 1) + '#' + ids[a]);
          if (got > 0) { ok++; break; }
        }
        if (items.length > 0 && ok >= 3) break;
      }

      log('===== 拉取结束，累计 ' + items.length + ' 首 =====');
      if (items.length > 0) {
        toast('全量拉取完成：' + items.length + ' 首');
        updateHint('已自动拉到 ' + items.length + ' 首，点复制即可');
      } else {
        updateHint('自动拉取没成功，先把页面上这些复制走，或点「诊断信息」发我');
      }
    } catch (e) {
      log('拉取异常: ' + (e && e.message ? e.message : String(e)));
    }
  }

  function updateHint(t) {
    if (hintEl) hintEl.textContent = t;
  }

  var API = {
    items: items,
    show: function () { if (panel) panel.style.display = 'block'; },
    scan: scanDom,
    text: toText,
    urls: function () { return urls.slice(); },
    test: { pickSong: pickSong, walk: walk, digest: digest, add: add }
  };

  window.__QQCAP__ = API;

  if (typeof document !== 'undefined' && document.body) {
    buildPanel();
    scanDom();
    setInterval(tick, 400);
    /* 页面自己不翻页，那就自己去服务器把整张歌单要过来 */
    setTimeout(function () { fetchAll(); }, 500);
  }
})();
