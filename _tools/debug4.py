# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
import os, re, struct, sys
p = os.path.join(_APPDATA, "SodaMusic/Local Storage/leveldb/000506.ldb")
data = open(p, "rb").read()
print("size", len(data))
for pat in [b"BytewiseComparator", b"leveldb", b"rocksdb", b"filter", b"comparator", b"property"]:
    idxs = [m.start() for m in re.finditer(re.escape(pat), data)]
    print(pat, idxs[:10], "count", len(idxs))
foot = data[-48:]
print("metaindex handle region:", foot[:9])
print("raw footer:", foot.hex())
# metaindex at 1251310 size 8
print("meta bytes:", data[1251310:1251318].hex())
print("around meta:", data[1251300:1251340].hex())
print("tail of file:", data[-80:].hex())
