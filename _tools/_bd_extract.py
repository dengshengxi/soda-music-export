#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 biaoda.me 分享页的 HTML 里把 RSC flight 数据抽出来，还原正文。"""
import io, json, re, os

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_bd.txt')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '_bd_body.txt')

s = io.open(SRC, 'r', encoding='utf-8', errors='replace').read()

# 1) 收集所有 self.__next_f.push([1,"..."]) 里的字符串字面量
chunks = []
for m in re.finditer(r'self\.__next_f\.push\(\[1,\s*(".*?")\]\);?', s, re.S):
    lit = m.group(1)
    try:
        chunks.append(json.loads(lit))
    except Exception:
        pass
flight = ''.join(chunks)
io.open(OUT, 'w', encoding='utf-8').write(flight)
print('flight len', len(flight))

# 2) 在还原后的文本里找关键段落
for kw in ['小红书', '步骤', '规则']:
    idxs = [m.start() for m in re.finditer(re.escape(kw), flight)]
    print('\n===== %s : %d 处 =====' % (kw, len(idxs)))
    for i in idxs[:12]:
        print('---')
        print(flight[max(0, i - 260): i + 400].replace('\\n', '\n'))
