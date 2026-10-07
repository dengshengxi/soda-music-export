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

import cramjam

def decomp(body, ctype):
    if ctype == 0:
        return body
    if ctype == 1:
        return bytes(cramjam.snappy.decompress_raw(body))
    if ctype == 2:
        return zlib.decompress(body)
    if ctype == 4:
        return zlib.decompress(body, -15)
    raise ValueError("ctype %d" % ctype)


def parse_records(blk):
    n = len(blk)
    if n < 4:
        return None
    num = struct.unpack_from("<I", blk, n - 4)[0]
    ro = n - 4 - num * 4
    if ro < 0 or ro > n:
        return None
    p = 0; prev = b""; ents = []
    while p < ro:
        try:
            sh, p2 = get_varint(blk, p)
            ns, p2 = get_varint(blk, p2)
            vl, p2 = get_varint(blk, p2)
        except IndexError:
            return None
        if p2 + ns + vl > ro:
            return None
        kd = blk[p2:p2 + ns]; p2 += ns
        v = blk[p2:p2 + vl]; p2 += vl
        prev = prev[:sh] + kd
        ents.append((prev, v))
        p = p2
    return ents, num


p = sys.argv[1]
data = open(p, "rb").read()
foot = data[-48:]
pos = 0
m_off, pos = get_varint(foot, pos)
m_size, pos = get_varint(foot, pos)
i_off, pos = get_varint(foot, pos)
i_size, pos = get_varint(foot, pos)
print("file", p, "len", len(data), "meta", m_off, m_size, "idx", i_off, i_size)
raw = data[i_off:i_off + i_size]
print("raw trail ctype", raw[-5] if i_off + i_size + 5 <= len(data) else "n/a",
      "bytes after:", data[i_off + i_size:i_off + i_size + 5].hex())
try:
    idx = decomp(raw[:-5], raw[-5])
except Exception as e:
    idx = raw
    print("decomp err", e)
print("idx len", len(idx), "head", idx[:60].hex(), idx[:60])
r = parse_records(idx)
if not r:
    print("PARSE FAIL index")
    sys.exit()
ents, num = r
print("index entries", len(ents), "restarts", num)
for k, v in ents[:5]:
    print("  key", k[:100])
    h = None
    try:
        hp = 0
        o, hp = get_varint(v, hp)
        s, hp = get_varint(v, hp)
        print("     -> block", o, s, "trailer ctype", data[o + s])
    except Exception as e:
        print("     err", e)
