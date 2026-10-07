# -*- coding: utf-8 -*-
import struct, sys
def gv(buf, pos):
    r = 0; s = 0
    while True:
        b = buf[pos]; pos += 1
        r |= (b & 0x7F) << s
        if not (b & 0x80): break
        s += 7
    return r, pos
p = sys.argv[1]
data = open(p, "rb").read()
foot = data[-48:]
pos = 0
m_off, pos = gv(foot, pos)
m_size, pos = gv(foot, pos)
i_off, pos = gv(foot, pos)
i_size, pos = gv(foot, pos)
raw = data[i_off:i_off + i_size]
body = raw[:-5]
print("idx body len", len(body))
def dump(b, start=0, end=None):
    end = len(b) if end is None else end
    for i in range(start, end, 16):
        chunk = b[i:i + 16]
        hexs = " ".join("%02x" % c for c in chunk)
        txt = "".join(chr(c) if 32 <= c < 127 else "." for c in chunk)
        print("%04x  %-47s  %s" % (i, hexs, txt))
dump(body)
print("---- footer/handles ----")
print("meta", m_off, m_size, "idx", i_off, i_size, "len", len(data))
print("next bytes after index content:", data[i_off + i_size: i_off + i_size + 8].hex())
