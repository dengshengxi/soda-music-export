# -*- coding: utf-8 -*-
"""
Correct minimal LevelDB SSTable reader.
In this build the BlockHandle size covers only the (possibly compressed) content;
the 5-byte trailer [ctype][crc4] follows immediately after it in the file.
"""
import os, sys, struct, zlib, json

try:
    import cramjam
except ImportError:
    cramjam = None


def get_varint(buf, pos):
    r = 0; s = 0
    while True:
        b = buf[pos]; pos += 1
        r |= (b & 0x7F) << s
        if not (b & 0x80): break
        s += 7
    return r, pos


def inflate(data, off, size):
    content = data[off:off + size]
    ctype = data[off + size] if off + size < len(data) else 0
    if ctype == 1 and cramjam is not None:
        try:
            return bytes(cramjam.snappy.decompress_raw(content))
        except Exception:
            pass
    if ctype == 2:
        try:
            return zlib.decompress(content)
        except Exception:
            pass
    if ctype == 4:
        try:
            return zlib.decompress(content, -15)
        except Exception:
            pass
    return content


def read_block(data, off, size):
    blk = inflate(data, off, size)
    n = len(blk)
    if n < 4:
        return []
    num = struct.unpack_from("<I", blk, n - 4)[0]
    ro = n - 4 - num * 4
    if ro < 0 or ro > n:
        return []
    p = 0; prev = b""; ents = []
    while p < ro:
        try:
            sh, p2 = get_varint(blk, p)
            ns, p2 = get_varint(blk, p2)
            vl, p2 = get_varint(blk, p2)
        except IndexError:
            break
        if p2 + ns + vl > ro:
            break
        kd = blk[p2:p2 + ns]; p2 += ns
        val = blk[p2:p2 + vl]; p2 += vl
        prev = prev[:sh] + kd
        ents.append((prev, val))
        p = p2
    return ents


def parse_ldb(path):
    data = open(path, "rb").read()
    if len(data) < 48:
        return []
    foot = data[-48:]
    pos = 0
    mo, pos = get_varint(foot, pos)
    ms, pos = get_varint(foot, pos)
    io, pos = get_varint(foot, pos)
    isz, pos = get_varint(foot, pos)
    out = []
    idx_entries = read_block(data, io, isz)
    for ikey, hv in idx_entries:
        hp = 0
        boff, hp = get_varint(hv, hp)
        bsize, hp = get_varint(hv, hp)
        ents = read_block(data, boff, bsize)
        for k, v in ents:
            if len(k) < 8:
                continue
            uk = k[:-8]
            out.append((uk, None if k[-1] == 1 else v))
    return out


def parse_batch(payload):
    if len(payload) < 12:
        return []
    pos = 8
    count = struct.unpack_from("<I", payload, pos)[0]
    pos += 4
    res = []
    for _ in range(count):
        if pos >= len(payload):
            break
        typ = payload[pos]; pos += 1
        klen, pos = get_varint(payload, pos)
        if pos + klen > len(payload):
            break
        key = payload[pos:pos + klen]; pos += klen
        if typ == 1:
            res.append((key, None))
            continue
        vlen, pos = get_varint(payload, pos)
        if pos + vlen > len(payload):
            break
        res.append((key, payload[pos:pos + vlen]))
        pos += vlen
    out = []
    for k, v in res:
        if len(k) >= 8:
            out.append((k[:-8], None if k[-1] == 1 else v))
    return out


def parse_log_file(path):
    data = open(path, "rb").read()
    out = []
    pos = 0; n = len(data); frags = []
    while pos + 7 <= n:
        block_end = ((pos // 32768) + 1) * 32768
        crc, length, rtype = struct.unpack_from("<IHB", data, pos)
        if length == 0 and rtype == 0 and crc == 0:
            pos = min(block_end, n); continue
        if pos + 7 + length > n:
            pos = min(block_end, n); continue
        payload = data[pos + 7: pos + 7 + length]
        pos += 7 + length
        if rtype == 1:
            out.extend(parse_batch(payload))
        elif rtype == 2:
            frags = [payload]
        elif rtype == 3:
            frags.append(payload)
        elif rtype == 4:
            frags.append(payload)
            out.extend(parse_batch(b"".join(frags)))
            frags = []
    return out


def fits_utf16(b):
    n = len(b) - (len(b) % 2)
    return n >= 4 and b[:n].count(0) > n * 0.2


def dec(b):
    if b is None:
        return None
    if fits_utf16(b):
        n = len(b) - (len(b) % 2)
        best = None
        for off in (0, 1):
            for enc in ("utf-16-le", "utf-16-be"):
                try:
                    s = b[off:off + n].decode(enc)
                except Exception:
                    continue
                bad = sum(1 for c in s if ord(c) == 0 or 0x1 <= ord(c) <= 0x1f or ord(c) == 0x7f or 0xfffe >= ord(c) >= 0xd800)
                score = bad / len(s)
                if best is None or score < best[0]:
                    best = (score, s)
        if best and best[0] < 0.02:
            return best[1]
    try:
        return b.decode("utf-8")
    except Exception:
        pass
    return b.decode("utf-8", "replace")


def main():
    d = sys.argv[1]
    outfile = sys.argv[2]
    kv = {}
    for fn in sorted(os.listdir(d)):
        p = os.path.join(d, fn)
        if not os.path.isfile(p):
            continue
        try:
            if fn.endswith(".ldb"):
                ents = parse_ldb(p)
            elif fn.endswith(".log"):
                ents = parse_log_file(p)
            else:
                continue
        except Exception as e:
            print("ERR", fn, repr(e))
            continue
        for k, v in ents:
            kv[k] = v
        print("%s -> %d" % (fn, len(ents)))
    res = {}
    for k, v in kv.items():
        res[dec(k)] = dec(v)
    os.makedirs(os.path.dirname(outfile), exist_ok=True)
    json.dump(res, open(outfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("TOTAL", len(kv))
    print("=== KEYS ===")
    for k in sorted(res):
        print(" ", k[:140])


if __name__ == "__main__":
    main()
