/* 汽水音乐收藏导出 —— 页面逻辑 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { playlists: [], flat: [], raw: null, filtered: [], all: [], sel: new Set(), uid: null };

  /* ---------- 导出格式选项 ---------- */
  var SEPS = { dash: ' - ', space: ' ', tab: '\t', comma: ',', line: ' | ', none: '' };
  var opts = { artist: true, album: false, index: false, sep: 'dash', order: 'na' };

  function readOpts() {
    opts.artist = $('optArtist').checked;
    opts.album  = $('optAlbum').checked;
    opts.index  = $('optIndex').checked;
    opts.sep    = $('optSep').value;
    opts.order  = $('optOrder').value;
    return opts;
  }

  /* 按当前选项把一首歌格式化成一行 */
  function line(t, i) {
    var sep = SEPS[opts.sep] != null ? SEPS[opts.sep] : ' - ';
    var name = t.name || '';
    var artist = opts.artist ? (t.artists || '') : '';
    var album  = opts.album  ? (t.album   || '') : '';
    var arr = opts.order === 'an' ? [artist, name, album] : [name, artist, album];
    arr = arr.filter(function (s) { return s !== ''; });
    var s = arr.join(sep);
    return opts.index ? (i + '. ' + s) : s;
  }

  function updatePreview() {
    var box = $('optPreview');
    if (!box) return;
    if (!state.flat.length) { box.textContent = '—'; return; }
    var sample = state.flat.slice(0, 3).map(function (it, k) {
      return line(it.t, k + 1);
    }).join('\n');
    box.textContent = sample + (state.flat.length > 3 ? '\n…（共 ' + state.flat.length + ' 首）' : '');
  }

  /* ---------- 工具 ---------- */
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(function () { t.classList.remove('on'); }, 1800);
  }
  function copyText(text, okMsg) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast(okMsg || '已复制'); }
      catch (e) { toast('复制失败，请手动选中'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(okMsg || '已复制'); }, fallback);
    } else fallback();
  }
  function download(name, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); document.body.removeChild(a); }, 0);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function safeName(s) { return String(s).replace(/[\\/:*?"<>|]/g, '_'); }

  /* ---------- 文件收集 ---------- */
  function isDataFile(name) { return /\.(ldb|log)$/i.test(name) && !/^(LOG|LOCK|MANIFEST)/i.test(name); }

  function collectFromEntry(entry) {
    return new Promise(function (resolve) {
      if (!entry) return resolve([]);
      if (entry.isFile) {
        entry.file(function (f) { resolve([f]); }, function () { resolve([]); });
        return;
      }
      var reader = entry.createReader(), all = [];
      (function readBatch() {
        reader.readEntries(function (batch) {
          if (!batch.length) return resolve(all);
          var jobs = batch.map(collectFromEntry);
          Promise.all(jobs).then(function (res) {
            res.forEach(function (r) { all = all.concat(r); });
            readBatch();
          });
        }, function () { resolve(all); });
      })();
    });
  }

  function handleFiles(fileList) {
    var files = Array.prototype.slice.call(fileList).filter(function (f) { return isDataFile(f.name); });
    if (!files.length) {
      $('status').textContent = '没在这些文件里找到 .ldb / .log，请选择 leveldb 文件夹里的文件。';
      return;
    }
    $('status').textContent = '正在读取 ' + files.length + ' 个文件…';
    $('bar').style.display = 'block';
    setState(0);

    var jobs = files.map(function (f) {
      return f.arrayBuffer().then(function (b) { return { name: f.name, bytes: new Uint8Array(b) }; });
    });
    Promise.all(jobs).then(function (loaded) {
      setTimeout(function () { parse(loaded); }, 30);
    }).catch(function (e) {
      $('status').textContent = '读取失败：' + e;
    });
  }

  /* ---------- 解析 ---------- */
  function parse(files) {
    $('status').textContent = '正在解析 LevelDB …';
    var kv;
    try {
      kv = LevelDB.readStore(files, function (name, i, n) {
        $('bar').firstElementChild.style.width = Math.round(i / n * 100) + '%';
        $('status').textContent = '正在解析 ' + name + '（' + (i + 1) + '/' + n + '）';
      });
    } catch (e) {
      $('status').textContent = '解析失败：' + e.message;
      $('bar').style.display = 'none';
      return;
    }
    $('bar').firstElementChild.style.width = '100%';
    state.raw = kv;
    extract(kv);
  }

  function extract(kv) {
    var titles = new Map(), uid = null;

    kv.forEach(function (v, k) {
      var m = k.match(/useRequestCache:playlists:(\d+)\s*$/);
      if (!m) return;
      uid = uid || m[1];
      try {
        var o = JSON.parse(v);
        (o.data && o.data.playlists || []).forEach(function (p) { titles.set(String(p.id), p.title); });
      } catch (e) { /* ignore */ }
    });

    var results = [];
    kv.forEach(function (v, k) {
      if (k.indexOf('useRequestCache:playlist_detail:') === -1 || !v) return;
      var pid = k.split('useRequestCache:playlist_detail:').pop().trim();
      if (!/^\d{8,}$/.test(pid)) return;
      var o;
      try { o = JSON.parse(v); } catch (e) { return; }
      var data = o.data || {}, pl = data.playlist || {};
      var tracks = [];
      (data.media_resources || []).forEach(function (r) {
        var t = r.entity && r.entity.track_wrapper && r.entity.track_wrapper.track;
        if (!t || !t.name) return;
        tracks.push({
          name: String(t.name).trim(),
          artists: (t.artists || []).map(function (a) { return (a.name || '').trim(); })
                    .filter(Boolean).join('、'),
          album: ((t.album || {}).name || '').trim(),
          id: t.id
        });
      });
      if (!tracks.length) return;

      var seen = new Set(), rows = [];
      tracks.forEach(function (t) {
        var key = t.name + '|' + t.artists;
        if (seen.has(key)) return;
        seen.add(key); rows.push(t);
      });
      results.push({
        id: pid,
        title: pl.title || titles.get(pid) || pid,
        server: pl.count_tracks,
        owner: pl.owner && pl.owner.id,
        rows: rows
      });
    });

    /* 全部歌单都留着，让用户自己挑；同时标出「是不是我创建的」 */
    results.forEach(function (r) {
      r.isMine = uid ? String(r.owner) === String(uid) : true;
      r.isFav  = /喜欢|favorite|favourite/i.test(r.title || '');
    });
    results.sort(function (a, b) {
      if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;          // 我创建的排前面
      if (a.isFav !== b.isFav) return a.isFav ? -1 : 1;             // 然后是「喜欢的音乐」
      return b.rows.length - a.rows.length;                          // 再按首数降序
    });

    state.uid = uid;
    state.all = results;
    state.sel = new Set();
    var mine = results.filter(function (r) { return r.isMine; });
    (mine.length ? mine : results).forEach(function (r) { state.sel.add(r.id); });

    render();
  }

  /* 按勾选情况重算待导出列表 */
  function rebuildFlat() {
    var sel = state.all.filter(function (r) { return state.sel.has(r.id); });
    state.playlists = sel;
    var dedupe = $('optDedupe') && $('optDedupe').checked;
    var seen = new Set(), flat = [];
    sel.forEach(function (p) {
      p.rows.forEach(function (t) {
        if (dedupe) {
          var key = t.name + '|' + t.artists;
          if (seen.has(key)) return;
          seen.add(key);
        }
        flat.push({ playlist: p.title, t: t });
      });
    });
    state.flat = flat;
  }

  /* 歌单勾选面板 */
  function renderPicker() {
    var card = $('pickCard');
    if (!state.all.length) { card.hidden = true; return; }
    card.hidden = false;

    $('pickList').innerHTML = state.all.map(function (r) {
      var on = state.sel.has(r.id);
      var tag = r.isMine ? (r.isFav ? '<span class="tag fav">我喜欢的</span>'
                                    : '<span class="tag mine">我创建的</span>')
                         : (r.isFav ? '<span class="tag other">别人的喜欢</span>'
                                    : '<span class="tag other">其他人的</span>');
      return '<label class="pick' + (on ? ' on' : '') + '">' +
        '<input type="checkbox" data-pid="' + esc(r.id) + '"' + (on ? ' checked' : '') + '>' +
        '<span class="t"><b>' + esc(r.title) + '</b><small>' + r.rows.length + ' 首</small></span>' +
        tag + '</label>';
    }).join('');

    $('pickList').querySelectorAll('input[data-pid]').forEach(function (cb) {
      cb.onchange = function () {
        var id = cb.getAttribute('data-pid');
        if (cb.checked) state.sel.add(id); else state.sel.delete(id);
        cb.parentNode.className = 'pick' + (cb.checked ? ' on' : '');
        rebuildFlat();
        refreshView();
        $('pickInfo').textContent = '已选 ' + state.sel.size + '/' + state.all.length +
                                    ' 个歌单 · ' + state.flat.length + ' 首';
      };
    });

    $('pickInfo').textContent = '已选 ' + state.sel.size + '/' + state.all.length +
                                ' 个歌单 · ' + state.flat.length + ' 首';
  }

  function afterPickChange() {
    rebuildFlat();
    renderPicker();
    refreshView();
  }

  /* ---------- 渲染 ---------- */
  function render() {
    $('bar').style.display = 'none';

    if (!state.all.length) {
      $('status').textContent = '没有找到歌曲数据 —— 请先在汽水音乐里打开歌单页面，让它加载一次再来。';
      showRaw();
      $('result').hidden = true;
      $('pickCard').hidden = true;
      return;
    }

    rebuildFlat();
    $('result').hidden = false;
    renderPicker();

    var total = state.flat.length;
    $('status').textContent = '解析完成 · 读取 ' + state.raw.size + ' 条本地记录，找到 ' +
      state.all.length + ' 个歌单';
    $('sumNum').textContent = total;

    var diffs = state.playlists.filter(function (p) {
      return p.server && p.server !== p.rows.length;
    });
    var tip = $('tipBox');
    if (diffs.length) {
      var lost = diffs.reduce(function (s, p) { return s + (p.server - p.rows.length); }, 0);
      tip.hidden = false;
      tip.innerHTML = '有 <b>' + diffs.length + '</b> 个歌单在服务器上标记的数量和这里导出的对不上（合计差 ' +
        esc(lost) + ' 首）—— 通常是下架 / 失效的曲目，已一并保留，导入 QQ 音乐时匹配不上的会被自动跳过。';
    } else tip.hidden = true;

    renderList(state.flat);
    updatePreview();
    showRaw();
  }

  function renderList(items) {
    var host = $('playlists');
    if (!items.length) {
      host.innerHTML = '<div class="card empty">' +
        (state.sel.size === 0 ? '还没选歌单 —— 回到上面「选择要导出的歌单」里勾几个' : '没有匹配的歌曲') +
        '</div>';
      return;
    }
    var byName = {}, order = [];
    items.forEach(function (it) {
      if (!byName[it.playlist]) { byName[it.playlist] = []; order.push(it.playlist); }
      byName[it.playlist].push({ t: it.t, idx: byName[it.playlist].length + 1 });
    });

    host.innerHTML = order.map(function (name) {
      var rows = byName[name];
      var text = rows.map(function (r) { return line(r.t, r.idx); }).join('\n');
      var body = rows.map(function (r) {
        var html = '<tr><td class="i">' + r.idx + '</td>' +
                   '<td class="n">' + esc(r.t.name) + '</td>';
        if (opts.artist) html += '<td class="a">' + esc(r.t.artists) + '</td>';
        if (opts.album)  html += '<td class="al">' + esc(r.t.album) + '</td>';
        return html + '</tr>';
      }).join('');
      var head = '<tr><th>#</th><th>歌曲</th>' +
                 (opts.artist ? '<th>歌手</th>' : '') +
                 (opts.album ? '<th>专辑</th>' : '') + '</tr>';
      return '<div class="pl-card"><div class="pl-head"><h3>' + esc(name) + '</h3>' +
        '<span class="cnt">' + rows.length + ' 首</span><span class="sp"></span>' +
        '<button class="btn" data-copy="' + esc(name) + '">复制</button>' +
        '<button class="btn ghost" data-dl="' + esc(name) + '">下载</button></div>' +
        '<div class="tblwrap"><table><thead>' + head + '</thead>' +
        '<tbody>' + body + '</tbody></table></div>' +
        '<textarea hidden id="txt-' + esc(name) + '">' + esc(text) + '</textarea></div>';
    }).join('');

    host.querySelectorAll('[data-copy]').forEach(function (b) {
      b.onclick = function () {
        var ta = document.getElementById('txt-' + b.getAttribute('data-copy'));
        copyText(ta.value, '已复制 ' + ta.value.split('\n').length + ' 行');
      };
    });
    host.querySelectorAll('[data-dl]').forEach(function (b) {
      b.onclick = function () {
        var n = b.getAttribute('data-dl');
        download(safeName(n) + '.txt', document.getElementById('txt-' + n).value);
      };
    });
  }

  function showRaw() {
    var kv = state.raw;
    if (!kv) return;
    $('raw').hidden = false;
    $('rawCount').textContent = kv.size;
    var keys = Array.from(kv.keys());
    var box = $('rawKeys');
    function draw(list) {
      box.innerHTML = list.slice(0, 400).map(function (k) {
        return '<div class="k" data-k="' + esc(k) + '">' + esc(k) + '</div>';
      }).join('') || '<div class="k">没有匹配的 key</div>';
      box.querySelectorAll('.k').forEach(function (el) {
        el.onclick = function () {
          var v = kv.get(el.getAttribute('data-k'));
          var pre = $('rawView');
          pre.hidden = false;
          pre.textContent = v == null ? '(空)' : v.slice(0, 4000);
        };
      });
    }
    draw(keys);
    $('rawSearch').oninput = function () {
      var q = this.value.toLowerCase();
      draw(q ? keys.filter(function (k) { return k.toLowerCase().indexOf(q) >= 0; }) : keys);
    };
  }

  /* ---------- 导出 ---------- */
  /* 当前列表里看到的歌曲（受搜索框和导出选项影响，所见即所得） */
  function current() {
    var q = $('search').value.trim().toLowerCase();
    if (!q) return state.flat;
    return state.flat.filter(function (it) {
      return (it.t.name + ' ' + it.t.artists + ' ' + it.t.album).toLowerCase().indexOf(q) >= 0;
    });
  }
  function allText() {
    return current().map(function (it, i) { return line(it.t, i + 1); }).join('\n') + '\n';
  }
  function allCsv() {
    var rows = [['序号', '歌曲名', '歌手', '专辑', '来源歌单', '歌曲ID']];
    current().forEach(function (it, i) {
      rows.push([i + 1, it.t.name, it.t.artists, it.t.album, it.playlist, it.t.id]);
    });
    return '\ufeff' + rows.map(function (r) {
      return r.map(function (c) {
        c = String(c == null ? '' : c);
        return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
  }
  function allJson() {
    return JSON.stringify(current().map(function (it) {
      return { playlist: it.playlist, name: it.t.name, artists: it.t.artists, album: it.t.album, id: it.t.id };
    }), null, 1);
  }

  function setState(n) { $('sumNum').textContent = n; }

  /* ---------- 事件 ---------- */
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function (e) {
    drop.addEventListener(e, function (ev) { ev.preventDefault(); drop.classList.remove('over'); });
  });
  drop.addEventListener('drop', function (ev) {
    var items = ev.dataTransfer.items;
    if (items && items.length && items[0].webkitGetAsEntry) {
      var jobs = [];
      for (var i = 0; i < items.length; i++) {
        var en = items[i].webkitGetAsEntry();
        if (en) jobs.push(collectFromEntry(en));
      }
      $('status').textContent = '正在扫描文件夹…';
      Promise.all(jobs).then(function (res) {
        var all = [];
        res.forEach(function (r) { all = all.concat(r); });
        handleFiles(all);
      });
    } else {
      handleFiles(ev.dataTransfer.files);
    }
  });
  drop.onclick = function (e) { if (e.target === drop || e.target.parentNode === drop) $('btnDir').click(); };

  $('btnDir').onclick = function (e) { e.stopPropagation(); $('inputDir').click(); };
  $('btnFiles').onclick = function (e) { e.stopPropagation(); $('inputFiles').click(); };
  $('inputDir').onchange = function () { handleFiles(this.files); };
  $('inputFiles').onchange = function () { handleFiles(this.files); };

  /* 只勾选了一个歌单时，文件名带上歌单名 */
  function baseName() {
    if (state.playlists.length === 1) return '汽水音乐_' + safeName(state.playlists[0].title);
    return '汽水音乐_歌单';
  }

  $('btnCopyAll').onclick = function () {
    var n = current().length;
    copyText(allText(), '已复制 ' + n + ' 首');
  };
  $('btnTxt').onclick = function () {
    download(baseName() + '.txt', allText());
    toast('已导出 ' + current().length + ' 首');
  };
  $('btnCsv').onclick = function () { download(baseName() + '.csv', allCsv(), 'text/csv;charset=utf-8'); };
  $('btnJson').onclick = function () { download(baseName() + '.json', allJson(), 'application/json'); };
  $('btnReset').onclick = function () {
    state = { playlists: [], flat: [], raw: null, filtered: [], all: [], sel: new Set(), uid: null };
    $('result').hidden = true; $('raw').hidden = true; $('pickCard').hidden = true;
    $('status').textContent = ''; $('search').value = '';
    $('inputDir').value = ''; $('inputFiles').value = '';
  };

  $('pickAll').onclick = function () {
    state.all.forEach(function (r) { state.sel.add(r.id); });
    afterPickChange();
  };
  $('pickNone').onclick = function () {
    state.sel.clear();
    afterPickChange();
  };
  $('pickMine').onclick = function () {
    state.sel.clear();
    state.all.forEach(function (r) { if (r.isMine) state.sel.add(r.id); });
    afterPickChange();
  };
  $('optDedupe').addEventListener('change', function () { rebuildFlat(); refreshView(); });

  function refreshView() {
    renderList(current());
    updatePreview();
  }

  $('search').oninput = refreshView;

  ['optArtist', 'optAlbum', 'optIndex', 'optSep', 'optOrder'].forEach(function (id) {
    $(id).addEventListener('change', function () { readOpts(); refreshView(); });
  });
  readOpts();
})();
