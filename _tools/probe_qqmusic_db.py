# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
"""只读探查 QQ 音乐的 qmlist64.db（SQLite）：看有哪些表、哪些表装了歌单/收藏"""
import os, io, sqlite3

DB = os.path.join(_APPDATA, "Tencent/QQMusic/qmlist64.db")
out = []
out.append("数据库: %s" % DB)
out.append("存在: %s   大小: %s" % (os.path.exists(DB),
           os.path.getsize(DB) if os.path.exists(DB) else "-"))

if not os.path.exists(DB):
    io.open(r"E:\code\WorkBuddy\音乐导入导出\output\qqmusic_db_probe.txt", "w",
            encoding="utf-8").write("\n".join(out))
    raise SystemExit(0)

# 以只读方式打开，绝不写入
con = sqlite3.connect("file:%s?mode=ro" % DB.replace("\\", "/"), uri=True)
cur = con.cursor()

out.append("")
out.append("===== 所有表 =====")
try:
    rows = cur.execute(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name"
    ).fetchall()
except Exception as e:
    out.append("读取 sqlite_master 失败: %s" % e)
    rows = []

info = []
for name, typ in rows:
    try:
        n = cur.execute('SELECT COUNT(*) FROM "%s"' % name).fetchone()[0]
    except Exception:
        n = -1
    try:
        cols = [r[1] for r in cur.execute('PRAGMA table_info("%s")' % name).fetchall()]
    except Exception:
        cols = []
    info.append((name, typ, n, cols))

for name, typ, n, cols in info:
    out.append("")
    out.append("### %s  [%s]  行数=%d" % (name, typ, n))
    out.append("    列(%d): %s" % (len(cols), ", ".join(cols[:40])))

# 重点：找出名字里含 list/playlist/favor/collect/song/dir 的表，采样看内容
out.append("")
out.append("===== 重点表采样 =====")
KEY = ["list", "play", "favor", "collect", "song", "dir", "folder", "sheet", "love"]
cand = [x for x in info if any(k in x[0].lower() for k in KEY) and x[2] > 0]
if not cand:
    cand = [x for x in info if x[2] > 0][:15]

for name, typ, n, cols in cand[:12]:
    out.append("")
    out.append("--- %s (行数 %d) ---" % (name, n))
    try:
        for r in cur.execute('SELECT * FROM "%s" LIMIT 4' % name).fetchall():
            s = []
            for v in r:
                t = str(v)
                if len(t) > 60:
                    t = t[:60] + "…"
                s.append(t)
            out.append("    " + " | ".join(s))
    except Exception as e:
        out.append("    采样失败: %s" % e)

con.close()
io.open(r"E:\code\WorkBuddy\音乐导入导出\output\qqmusic_db_probe.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("done, lines=%d" % len(out))
