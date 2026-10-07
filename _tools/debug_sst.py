# -*- coding: utf-8 -*-
import os, struct, sys
p = sys.argv[1]
data = open(p, "rb").read()
print("size", len(data))
n = len(data)
# footer is at end -48 if size >= 48
foot = data[-48:]
print("footer magic:", foot[-8:])

def gv(buf, pos):
    r = 0; s = 0
    while True:
        b = buf[pos]; pos += 1
        r |= (b & 0x7F) << s
        if not b & 0x80: break
        s += 7
    return r, pos

pos = 0
m_off, pos = gv(foot, pos)
m_size, pos = gv(foot, pos)
i_off, pos = gv(foot, pos)
i_size, pos = gv(foot, pos)
print("metaindex", m_off, m_size, "index", i_off, i_size)
print("pos after", pos, "expect <=40")

idx = data[i_off: i_off + i_size]
print("index block size", len(idx))
print("first 120 bytes:", idx[:120])
print("last 40 bytes:", idx[-40:])
try:
    num = struct.unpack_from("<I", idx, len(idx) - 4)[0]
    print("num restarts", num)
    print("restart array region:", idx[len(idx) - 4 - num * 4:][:40])
except Exception as e:
    print("err", e)

# properties block (metaindex -> properties)
if m_size:
    meta = data[m_off:m_off + m_size]
    print("metablock:", meta[:200])
    # try parse/print readable
    print("meta printable:", "".join(chr(c) if 32 <= c < 127 else "." for c in meta[:400]))
