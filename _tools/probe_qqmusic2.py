# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
"""深入探测 QQ 音乐数据目录（只读，不改任何东西）"""
import os, io, subprocess

TARGET = os.path.join(_APPDATA, "Tencent/QQMusic")
out = []

out.append("===== QQ 音乐数据目录结构 =====")
out.append("路径: %s  存在=%s" % (TARGET, os.path.isdir(TARGET)))
if os.path.isdir(TARGET):
    for dirpath, dirnames, filenames in os.walk(TARGET):
        rel = os.path.relpath(dirpath, TARGET)
        depth = 0 if rel == "." else rel.count(os.sep) + 1
        if depth > 4:
            continue
        fl = []
        for f in filenames[:25]:
            try:
                sz = os.path.getsize(os.path.join(dirpath, f))
            except Exception:
                sz = -1
            fl.append("%s(%d)" % (f, sz))
        out.append("")
        out.append("[D] %s" % rel)
        if dirnames:
            out.append("     子目录: %s" % ", ".join(dirnames[:25]))
        if fl:
            out.append("     文件: %s" % ", ".join(fl))

out.append("")
out.append("===== 是否运行中的 QQ 音乐进程 =====")
try:
    r = subprocess.run(["tasklist", "/FI", "IMAGENAME eq QQMusic*"],
                       capture_output=True, text=True, timeout=20)
    out.append((r.stdout or r.stderr or "(空)").strip()[:1200])
except Exception as e:
    out.append("查询失败: %s" % e)

out.append("")
out.append("===== 安装位置候选 =====")
for p in [r"C:\Program Files (x86)\Tencent\QQMusic",
          r"C:\Program Files\Tencent\QQMusic",
          os.path.join(_LOCAL, "Programs/QQMusic"),
          r"D:\Program Files\Tencent\QQMusic",
          r"D:\QQMusic"]:
    out.append("  %-46s %s" % (p, "存在" if os.path.isdir(p) else "无"))

txt = "\n".join(out)
io.open(r"E:\code\WorkBuddy\音乐导入导出\output\qqmusic_probe2.txt", "w",
        encoding="utf-8").write(txt)
print("done, lines=%d" % len(out))
