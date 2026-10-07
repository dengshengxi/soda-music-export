# -*- coding: utf-8 -*-
import os as _os
_USER = _os.path.expanduser('~')
_APPDATA = _os.environ.get('APPDATA') or _os.path.join(_USER, 'AppData', 'Roaming')
_LOCAL = _os.environ.get('LOCALAPPDATA') or _os.path.join(_USER, 'AppData', 'Local')
import os, re, sys, json, sqlite3, shutil, tempfile

APPDATA = os.path.join(_APPDATA, "SodaMusic")
OUT = []
def log(s):
    OUT.append(str(s))

KEYS = [b"favorite", b"collect", b"\xe6\x94\xb6\xe8\x97\x8f", b"my_mix", b"playlist", b"user_id",
        b"uid", b"sec_uid", b"token", b"cookie", b"like"]

def scan_leveldb(d):
    hits = {}
    for fn in sorted(os.listdir(d)):
        p = os.path.join(d, fn)
        if not os.path.isfile(p):
            continue
        try:
            data = open(p, "rb").read()
        except Exception as e:
            log(f"ERR read {fn}: {e}")
            continue
        for k in KEYS:
            c = data.lower().count(k.lower())
            if c:
                hits.setdefault(k.decode('utf-8', 'ignore'), [0, []])
                hits[k.decode('utf-8','ignore')][0] += c
        log(f"{fn}: size={len(data)}")
    log("HITS: " + json.dumps(hits, ensure_ascii=False))

def dump_cookies():
    src = os.path.join(APPDATA, "Network", "Cookies")
    if not os.path.exists(src):
        log("no cookies file")
        return
    tmp = os.path.join(tempfile.gettempdir(), "soda_cookies_copy.db")
    try:
        shutil.copy2(src, tmp)
    except Exception as e:
        log(f"copy fail {e}")
        return
    try:
        con = sqlite3.connect(tmp)
        cur = con.cursor()
        cur.execute("select name from sqlite_master where type='table'")
        log("tables: " + str(cur.fetchall()))
        try:
            cur.execute("select host_key, name, value, length(encrypted_value) from cookies limit 100")
            rows = cur.fetchall()
            log("cookie count sample: %d" % len(rows))
            for r in rows:
                log("  %s | %s | %s | enc=%d" % r)
        except Exception as e:
            log("cookie query err: %s" % e)
        con.close()
    except Exception as e:
        log("sqlite err: %s" % e)

def main():
    log("=== Local Storage leveldb ===")
    scan_leveldb(os.path.join(APPDATA, "Local Storage", "leveldb"))
    log("")
    log("=== Session Storage ===")
    scan_leveldb(os.path.join(APPDATA, "Session Storage"))
    log("")
    log("=== Cookies ===")
    dump_cookies()

main()
open(r"E:\code\WorkBuddy\音乐导入导出\_tools\probe_out.txt", "w", encoding="utf-8").write("\n".join(OUT))
print("done")
