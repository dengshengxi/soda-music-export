# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
"""
从本机「汽水音乐」桌面端的 Chromium Local Storage (LevelDB) 快照中读取已登录用户的
歌单缓存，导出收藏歌曲，生成可直接给 QQ 音乐导入的文本/表格文件和一个预览页面。

用法:
  python export_songs.py              仅导出本人歌单
  python export_songs.py --all        连他人歌单一起导出
"""
import os, sys, json, csv, datetime, html

TOOLS = r"E:\code\WorkBuddy\音乐导入导出\_tools"
OUTROOT = r"E:\code\WorkBuddy\音乐导入导出"
LEVELDB = os.path.join(_APPDATA, "SodaMusic/Local Storage/leveldb")

sys.path.insert(0, TOOLS)
from lvlite3 import parse_ldb, parse_log_file, dec  # noqa


def log(s):
    print(s)


def read_store():
    kv = {}
    for fn in sorted(os.listdir(LEVELDB)):
        p = os.path.join(LEVELDB, fn)
        try:
            if fn.endswith(".ldb"):
                ents = parse_ldb(p)
            elif fn.endswith(".log"):
                ents = parse_log_file(p)
            else:
                continue
        except Exception as e:
            log("  跳过 %s (%s)" % (fn, e))
            continue
        for k, v in ents:
            kv[dec(k)] = dec(v)
    return kv


def my_uid(kv):
    for k in kv:
        marker = "useRequestCache:playlists:"
        if marker in k:
            uid = k.split(marker)[-1].strip()
            if uid.isdigit():
                return uid
    return None


def parse_track(res):
    t = res.get("entity", {}).get("track_wrapper", {}).get("track")
    if not t or not t.get("name"):
        return None
    artists = [a.get("name", "").strip() for a in (t.get("artists") or []) if a.get("name")]
    return {
        "id": t.get("id"),
        "name": t["name"].strip(),
        "artists": "、".join(artists),
        "album": ((t.get("album") or {}).get("name") or "").strip(),
    }


def collect_playlists(kv, only_mine=True, uid=None):
    out = []
    for k, v in kv.items():
        if not v or "useRequestCache:playlist_detail:" not in k:
            continue
        pid = k.split("useRequestCache:playlist_detail:")[-1].strip()
        try:
            obj = json.loads(v)
        except Exception:
            continue
        data = obj.get("data") or {}
        pl = data.get("playlist") or {}
        if only_mine and uid and str(pl.get("owner", {}).get("id")) != str(uid):
            continue
        # 跳过 key 本身被截断/拼接错的记录
        if len(pid) < 10 or not pid.isdigit():
            continue
        tracks = [x for x in (parse_track(r) for r in (data.get("media_resources") or [])) if x]
        if not tracks:
            continue
        out.append({
            "id": pid,
            "title": pl.get("title") or pid,
            "count_tracks": pl.get("count_tracks"),
            "fetched": datetime.datetime.fromtimestamp(obj.get("time", 0) / 1000).strftime("%Y-%m-%d %H:%M"),
            "tracks": tracks,
        })
    out.sort(key=lambda p: -len(p["tracks"]))
    return out


def dedup(tracks):
    seen, rows = set(), []
    for t in tracks:
        key = (t["name"], t["artists"])
        if key in seen or not t["name"]:
            continue
        seen.add(key)
        rows.append(t)
    return rows


def build_html(groups, stamp):
    rows_html = []
    total = sum(len(g["rows"]) for g in groups)
    for g in groups:
        items = []
        for i, t in enumerate(g["rows"], 1):
            esc_n = html.escape(t["name"])
            esc_a = html.escape(t["artists"])
            esc_al = html.escape(t["album"])
            items.append(
                "<tr><td class='i'>%d</td><td class='n'>%s</td><td class='a'>%s</td><td class='al'>%s</td></tr>"
                % (i, esc_n, esc_a, esc_al))
        rows_html.append(
            "<section class='card'><header><h2>%s</h2><span class='badge'>%d 首</span>"
            "<button class='copy' data-target='pl-%s'>复制导入文本</button></header>"
            "<textarea id='pl-%s' class='pltext'>%s</textarea>"
            "<div class='tblwrap'><table><thead><tr><th>#</th><th>歌曲</th><th>歌手</th><th>专辑</th></tr></thead>"
            "<tbody>%s</tbody></table></div></section>"
            % (html.escape(g["title"]), len(g["rows"]), g["id"], g["id"],
               html.escape(g["text"]), "".join(items)))
    TPL = """<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>汽水音乐 · 收藏歌曲导出</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--line:#e5e7eb;--txt:#1f2328;--sub:#6b7280;--accent:#22c55e}
*{box-sizing:border-box}
body{margin:0;padding:28px;background:var(--bg);color:var(--txt);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
h1{font-size:20px;margin:0 0 4px}
.sub{color:var(--sub);margin:0 0 20px;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;margin-bottom:18px}
.card header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.card h2{font-size:16px;margin:0}
.badge{background:#eefdf3;color:#15803d;border:1px solid #bbf7d0;border-radius:999px;padding:1px 10px;font-size:12px}
.copy{margin-left:auto;background:var(--accent);color:#fff;border:0;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer}
.copy:hover{filter:brightness(.95)}
.pltext{display:none}
table{border-collapse:collapse;width:100%;font-size:13px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid #f0f1f3}
th{color:var(--sub);font-weight:600;background:#fafafa;position:sticky;top:0}
td.i{color:#9ca3af;width:46px}
td.a,td.al{color:var(--sub)}
.tblwrap{max-height:420px;overflow:auto;border:1px solid var(--line);border-radius:8px}
.tip{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:10px;padding:12px 16px;font-size:13px;margin-bottom:20px}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 18px;border-radius:8px;opacity:0;transition:opacity .25s;pointer-events:none}
</style></head><body>
<h1>汽水音乐 · 收藏歌曲导出</h1>
<p class="sub">共 __TOTAL__ 首 · 导出于 __STAMP__ · 数据来自本机汽水音乐客户端缓存</p>
<div class="tip">导入 QQ 音乐：QQ 音乐 App →「我的」→ 顶部「…」/ 本地歌曲 →「导入外部歌单」，把下面「复制导入文本」的内容粘贴进去即可；每行格式为 <code>歌曲名 - 歌手</code>。</div>
%s
<div id="toast" class="toast"></div>
<script>
document.querySelectorAll('.copy').forEach(function(btn){
  btn.addEventListener('click',function(){
    var ta=document.getElementById(btn.dataset.target);
    var text=ta.value;
    var t=document.getElementById('toast');
    function done(msg){t.textContent=msg;t.style.opacity=1;setTimeout(function(){t.style.opacity=0},1800);}
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){done('已复制 '+text.split('\\n').length+' 行')},function(){fallback(text,done)});
    }else{fallback(text,done)}
  });
});
function fallback(text,done){var ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity=0;document.body.appendChild(ta);ta.select();try{document.execCommand('copy');done('已复制')}catch(e){done('复制失败，请手动选择')}document.body.removeChild(ta);}
</script></body></html>"""
    return (TPL.replace("__TOTAL__", str(total)).replace("__STAMP__", stamp)
               .replace("__CARDS__", "".join(rows_html)))


def main():
    only_mine = "--all" not in sys.argv
    log("读取汽水音乐本地存储 ...")
    kv = read_store()
    uid = my_uid(kv)
    log("  记录数 %d · 本机登录用户 UID=%s" % (len(kv), uid))
    playlists = collect_playlists(kv, only_mine=only_mine, uid=uid)
    if not playlists:
        log("没有找到歌单缓存。请先在汽水音乐里打开对应歌单页面，让它加载一次。")
        return
    log("发现 %d 个歌单:" % len(playlists))
    for p in playlists:
        log("  - %s (id=%s, 服务器曲数=%s, 缓存时间=%s, 条目=%d)"
            % (p["title"], p["id"], p["count_tracks"], p["fetched"], len(p["tracks"])))

    outdir = os.path.join(OUTROOT, "output")
    os.makedirs(outdir, exist_ok=True)
    stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    groups, all_rows = [], []

    for p in playlists:
        rows = dedup(p["tracks"])
        base = "".join(c for c in p["title"] if c not in '\\/:*?"<>|').strip() or p["id"]
        lines = ["%s - %s" % (t["name"], t["artists"]) if t["artists"] else t["name"] for t in rows]
        text = "\n".join(lines) + "\n"
        txt = os.path.join(outdir, "%s.txt" % base)
        open(txt, "w", encoding="utf-8").write(text)
        csvf = os.path.join(outdir, "%s.csv" % base)
        with open(csvf, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.writer(f)
            w.writerow(["序号", "歌曲名", "歌手", "专辑", "汽水音乐歌曲ID"])
            for i, t in enumerate(rows, 1):
                w.writerow([i, t["name"], t["artists"], t["album"], t["id"]])
        groups.append({"id": p["id"], "title": p["title"], "rows": rows, "text": text, "txt": txt, "csv": csvf})
        all_rows.extend((p["title"], t) for t in rows)
        log("  导出 %s -> %d 首" % (p["title"], len(rows)))

    # 汇总
    lines = ["%s - %s" % (t["name"], t["artists"]) if t["artists"] else t["name"] for _, t in all_rows]
    all_txt = os.path.join(outdir, "汽水音乐_收藏歌曲_全部.txt")
    open(all_txt, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    all_csv = os.path.join(outdir, "汽水音乐_收藏歌曲_全部.csv")
    with open(all_csv, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["序号", "歌曲名", "歌手", "专辑", "来源歌单", "汽水音乐歌曲ID"])
        for i, (pn, t) in enumerate(all_rows, 1):
            w.writerow([i, t["name"], t["artists"], t["album"], pn, t["id"]])
    all_json = os.path.join(outdir, "汽水音乐_收藏歌曲_全部.json")
    json.dump([{"playlist": pn, **t} for pn, t in all_rows], open(all_json, "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    page = os.path.join(outdir, "汽水音乐_收藏歌曲.html")
    open(page, "w", encoding="utf-8").write(build_html(groups, datetime.datetime.now().strftime("%Y-%m-%d %H:%M")))

    log("")
    log("========== 完成 ==========")
    log("总计 %d 首" % len(all_rows))
    log("  预览页面: %s" % page)
    log("  导入文本: %s" % all_txt)
    log("  表格: %s" % all_csv)
    log("  JSON: %s" % all_json)
    for g in groups:
        log("  歌单「%s」: %s | %s" % (g["title"], g["txt"], g["csv"]))


main()
