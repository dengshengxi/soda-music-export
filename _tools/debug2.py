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

def decomp(raw):
    if len(raw) < 5: return b""
    ctype = raw[-5]; body = raw[:-5]
    if ctype == 1:
        try: return zlib.decompress(body)
        except Exception: return body
    if ctype in (2, 4):
        try: return zlib.decompress(body, -15)
        except Exception: return body
    return body

p = sys.argv[1]
data = open(p, "rb").read()
foot = data[-48:]
pos = 0
m_off, pos = get_varint(foot, pos)
m_size, pos = get_varint(foot, pos)
i_off, pos = get_varint(foot, pos)
i_size, pos = get_varint(foot, pos)
print("meta", m_off, m_size, "idx", i_off, i_size, "filelen", len(data))
idx = decomp(data[i_off:i_off + i_size])
print("idx len", len(idx))
n = len(idx)
num = struct.unpack_from("<I", idx, n - 4)[0]
restart_off = n - 4 - num * 4
print("restarts", num, "restart_off", restart_off)
# print first raw record
print("idx head:", idx[:80])
p = 0; prev = b""; hs = []
cnt = 0
while p < restart_off:
    try:
        sh, p2 = get_varint(idx, p)
        ns, p2 = get_varint(idx, p2)
        vl, p2 = get_varint(idx, p2)
    except IndexError as e:
        print("indexerror at p", p, e); break
    kd = idx[p2:p2 + ns]; p2 += ns
    hv = idx[p2:p2 + vl]; p2 += vl
    key = prev[:sh] + kd; prev = key
    p = p2
    hp = 0
    boff, hp = get_varint(hv, hp)
    bs, hp = get_varint(hv, hp)
    hs.append((boff, bs, key))
    cnt += 1
    if cnt < 4:
        print("handler", boff, bs, "key=", key[:80])
print("handlers", len(hs))
for i, (boff, bs, key) in enumerate(hs[:3]):
    raw = data[boff:boff + bs]
    print("block", i, "rawlen", len(raw), "ctype", raw[-5] if len(raw) >= 5 else "?")
    body = decomp(raw)
    print(" body len", len(body), "head:", body[:120])
    ents = []
    parse = None
    print(" body tail:", body[-40:])
