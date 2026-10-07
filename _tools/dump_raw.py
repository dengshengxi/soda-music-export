# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
import os, sys
sys.path.insert(0, r"E:\code\WorkBuddy\音乐导入导出\_tools")
from lvlite3 import parse_ldb, parse_log_file

D = os.path.join(_APPDATA, "SodaMusic/Local Storage/leveldb")
kv = {}
for fn in sorted(os.listdir(D)):
    p = os.path.join(D, fn)
    if fn.endswith(".ldb"):
        ents = parse_ldb(p)
    elif fn.endswith(".log"):
        ents = parse_log_file(p)
    else:
        continue
    for k, v in ents:
        kv[k] = v

for k, v in kv.items():
    if b"useRequestCache:playlists:" in k and v:
        i = v.find(b'"title"')
        print("KEY", k)
        print("HEX around title:", v[i: i + 60].hex(" "))
        print("repr bytes:", repr(v[i: i + 60]))
        # count zeros overall
        print("len", len(v), "zeros", v.count(0))
