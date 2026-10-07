# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
"""探测本机 QQ 音乐的数据存放位置（只读扫描，不做任何修改）"""
import os, io, sys, json

ROOTS = [
    _APPDATA,
    _LOCAL,
    os.path.join(_LOCAL, "Low"),
    os.path.join(_USER, "Documents"),
    r"C:\Program Files (x86)",
    r"C:\Program Files",
]
HINTS = ["qqmusic", "qq音乐", "qqmusicpc", "tencent", "qm", "qqmusiclite"]
EXTS = {".db", ".sqlite", ".sqlite3", ".ldb", ".log", ".json", ".dat", ".cfg", ".index"}

out = []
out.append("===== 1. 顶层可疑目录 =====")
found_dirs = []
for root in ROOTS:
    if not os.path.isdir(root):
        continue
    try:
        names = os.listdir(root)
    except Exception as e:
        out.append("  [无法列出] %s : %s" % (root, e))
        continue
    for n in names:
        low = n.lower()
        if any(h in low for h in HINTS):
            p = os.path.join(root, n)
            found_dirs.append(p)
            out.append("  %s" % p)

if not found_dirs:
    out.append("  (没找到名字里带 qqmusic / tencent 的目录)")

out.append("")
out.append("===== 2. 各目录内部结构与数据文件 =====")
for p in found_dirs:
    out.append("")
    out.append("### %s" % p)
    try:
        walk = list(os.walk(p))
    except Exception as e:
        out.append("   [遍历失败] %s" % e)
        continue
    depth0 = walk[0][1] if walk else []
    out.append("   子目录(%d): %s" % (len(depth0), ", ".join(depth0[:40])))
    files = walk[0][2] if walk else []
    out.append("   根文件(%d): %s" % (len(files), ", ".join(files[:40])))
    # 找出数据类文件（前 3 层）
    hits = []
    for dirpath, dirnames, filenames in walk[:3]:
        for f in filenames:
            if os.path.splitext(f)[1].lower() in EXTS:
                fp = os.path.join(dirpath, f)
                try:
                    sz = os.path.getsize(fp)
                except Exception:
                    sz = -1
                hits.append((sz, fp))
    hits.sort(reverse=True)
    out.append("   数据文件(按大小前 30):")
    for sz, fp in hits[:30]:
        rel = os.path.relpath(fp, p)
        out.append("     %10d  %s" % (sz, rel))
    if not hits:
        out.append("     (无)")

out.append("")
out.append("===== 3. 是否包含 leveldb 结构（Local Storage）=====")
for p in found_dirs:
    for dirpath, dirnames, filenames in os.walk(p):
        if dirpath.lower().endswith("leveldb"):
            out.append("  发现 leveldb: %s  (%d 个文件)" % (dirpath, len(filenames)))

txt = "\n".join(out)
io.open(r"E:\code\WorkBuddy\音乐导入导出\output\qqmusic_probe.txt", "w", encoding="utf-8").write(txt)
print("done, lines=%d" % len(out))
