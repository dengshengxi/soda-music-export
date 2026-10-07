# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
import os, re, json

APPDATA = os.path.join(_APPDATA, "SodaMusic")
D = os.path.join(APPDATA, "Local Storage", "leveldb")
OUT = []
def log(s):
    OUT.append(str(s))

files = [f for f in os.listdir(D) if f.endswith((".ldb", ".log"))]
data = b""
for fn in sorted(files):
    with open(os.path.join(D, fn), "rb") as f:
        data += f.read()
log("total bytes: %d" % len(data))

KEYS = [b"collect", b"playlist", b"token", b"user_id", b"uid", b"sec_uid", b"cookie"]
for k in KEYS:
    idxs = [m.start() for m in re.finditer(re.escape(k), data, re.IGNORECASE)]
    log("\n########## KEY %s  count=%d" % (k.decode(), len(idxs)))
    for i in idxs[:12]:
        ctx = data[max(0, i - 300): i + 700]
        try:
            t = ctx.decode("utf-8", "ignore")
        except Exception:
            t = repr(ctx)
        t = "".join(ch if (ch.isprintable() or ch in "\n\r\t") else "." for ch in t)
        log("---- @%d ----" % i)
        log(t[:1000])

open(r"E:\code\WorkBuddy\音乐导入导出\_tools\extract_out.txt", "w", encoding="utf-8").write("\n".join(OUT))
print("done")
