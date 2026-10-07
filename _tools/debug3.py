# -*- coding: utf-8 -*-
import struct, zlib, sys

def get_varint(buf, pos):
    r = 0; s = 0
    while True:
        b = buf[pos]; pos += 1
        r |= (b & 0x7F) << s
        if not (b & 0x80): break
        s += 7
    return r, pos

def try_parse(blk, strip):
    """try to parse restart-based block"""
    n = len(blk)
    if n < 4: return None
    num = struct.unpack_from("<I", blk, n - 4)[0]
    ro = n - 4 - num * 4
    if ro < 0 or ro > n: return None
    p = 0; prev = b""; ents = []
    ok = True
    while p < ro:
        try:
            sh, p2 = get_varint(blk, p)
            ns, p2 = get_varint(blk, p2)
            vl, p2 = get_varint(blk, p2)
        except IndexError:
            ok = False; break
        if p2 + ns + vl > n:
            ok = False; break
        kd = blk[p2:p2 + ns]; p2 += ns
        v = blk[p2:p2 + vl]; p2 += vl
        full = prev[:sh] + kd
        prev = full
        ents.append((full, v))
        p = p2
        # sanity: internal key last byte should be small type value
        if len(full) >= 8 and full[-1] > 1:
            ok = False; break
    if not ok: return None
    return ents, num

p = sys.argv[1]
data = open(p, "rb").read()
foot = data[-48:]
pos = 0
m_off, pos = get_varint(foot, pos)
m_size, pos = get_varint(foot, pos)
i_off, pos = get_varint(foot, pos)
i_size, pos = get_varint(foot, pos)
for strip in (0, 5):
    idx = data[i_off: i_off + i_size]
    blk = idx[:len(idx) - strip] if strip else idx
    r = try_parse(blk, strip)
    print("--- index strip=%d -> %s" % (strip, "OK entries=%d restarts=%d" % (len(r[0]), r[1]) if r else "FAIL"))
    if r and strip == 0:
        for k, v in r[0][:5]:
            print("   key=", k[:90])
