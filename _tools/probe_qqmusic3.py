# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
"""在 QQ 音乐目录里寻找「未加密且含中文歌名/歌单名」的缓存文件（只读扫描）"""
import os, io, re, sqlite3

BASE = os.path.join(_APPDATA, "Tencent/QQMusic")
CJK = re.compile(r"[\u4e00-\u9fff]")
SKIP_EXT = {".dll", ".gft", ".png", ".jpg", ".wav", ".mp3", ".qmaep",
            ".aep", ".enc", ".exe", ".pdb", ".zip"}
out = []
hits = []


def score_text(s):
    """返回中文字符占比"""
    if not s or len(s) < 20:
        return 0.0
    cjk = len(CJK.findall(s))
    return cjk / len(s)


def try_decode(b):
    best = ("", 0.0)
    for enc in ("utf-8", "utf-16-le", "gbk"):
        try:
            s = b.decode(enc, "ignore")
        except Exception:
            continue
        sc = score_text(s)
        if sc > best[1]:
            best = (s, sc)
    return best


out.append("扫描根目录: %s" % BASE)
total = 0
for dirpath, dirnames, filenames in os.walk(BASE):
    for f in filenames:
        ext = os.path.splitext(f)[1].lower()
        if ext in SKIP_EXT:
            continue
        fp = os.path.join(dirpath, f)
        try:
            sz = os.path.getsize(fp)
        except Exception:
            continue
        if sz == 0 or sz > 8 * 1024 * 1024:
            continue
        try:
            with io.open(fp, "rb") as fh:
                b = fh.read()
        except Exception:
            continue
        total += 1
        s, sc = try_decode(b)
        if sc > 0.08:
            sample = " / ".join([x for x in CJK.findall(s)[:0]] or [])
            hits.append((sc, sz, os.path.relpath(fp, BASE), s[:180].replace("\n", " ")))

hits.sort(reverse=True)
out.append("扫描文件数: %d" % total)
out.append("")
out.append("===== 疑似含中文内容的文件（按中文占比排序，前 20）=====")
if not hits:
    out.append("  (没有找到 —— 说明本地没有明文歌单缓存)")
for sc, sz, rel, s in hits[:20]:
    out.append("")
    out.append("[%.1f%%] %s  (%d B)" % (sc * 100, rel, sz))
    out.append("   预览: %s" % s)

# 顺便看看有没有 qmbrowser（内嵌浏览器）的用户数据目录
out.append("")
out.append("===== 内嵌浏览器(qmbrowser)线索 =====")
for root in [BASE, r"C:\Program Files (x86)\Tencent", r"C:\Program Files\Tencent"]:
    if not os.path.isdir(root):
        continue
    for dirpath, dirnames, filenames in os.walk(root):
        for d in list(dirnames):
            if "browser" in d.lower() or "webkit" in d.lower():
                out.append("  找到: %s" % os.path.join(dirpath, d))

# 音乐库/下载目录
out.append("")
out.append("===== 常见音乐库目录 =====")
for p in [os.path.join(_USER, "Music"), r"D:\Music", os.path.join(_USER, "Documents/QQMusic"),
          os.path.join(_USER, "Downloads/QQMusic"), r"D:\QQMusicDownload"]:
    out.append("  %-40s %s" % (p, "存在" if os.path.isdir(p) else "无"))

io.open(r"E:\code\WorkBuddy\音乐导入导出\output\qqmusic_probe3.txt", "w",
        encoding="utf-8").write("\n".join(out))
print("done, lines=%d, hits=%d" % (len(out), len(hits)))
