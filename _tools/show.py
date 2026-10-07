# -*- coding: utf-8 -*-
import json, sys
kv = json.load(open(r"E:\code\WorkBuddy\音乐导入导出\_tools\out\kv.json", encoding="utf-8"))
target = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else "summary"
for k, v in kv.items():
    if target.lower() not in k.lower():
        continue
    print("=" * 80)
    print("KEY:", k[:200], "len=", len(v) if v else None)
    if v is None:
        continue
    try:
        obj = json.loads(v)
    except Exception as e:
        print("RAW:", v[:3000])
        continue
    def walk(o, depth=0, path=""):
        pad = "  " * depth
        if isinstance(o, dict):
            for key, val in o.items():
                if isinstance(val, (dict, list)):
                    print("%s%s: <%s %d>" % (pad, key, type(val).__name__, len(val)))
                    if depth < (3 if mode == "summary" else 8):
                        walk(val, depth + 1, path + "/" + str(key))
                else:
                    s = str(val)
                    print("%s%s: %s" % (pad, key, s[:160]))
        elif isinstance(o, list):
            if len(o) > (2 if mode == "summary" else 500):
                print("%s[list of %d] first item:" % (pad, len(o)))
                walk(o[0], depth + 1, path)
            else:
                for i, val in enumerate(o):
                    walk(val, depth + 1, path + "/%d" % i)
    walk(obj)
