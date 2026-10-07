# -*- coding: utf-8 -*-
"""
Careful minimal LevelDB SSTable (.ldb) + log (.log) reader for Chromium Local Storage.
Chromium stores localStorage keys/values as UTF-16LE unless they contain lone surrogates.
"""
import os, sys, json, struct, zlib

BLOCK_LOG = False


def get_varint(buf, pos):
    r = 0
    s = 0
    while True:
        b = buf[pos]
        pos += 1
        r |= (b & 0x7F) << s
        if not (b & 0x80):
            break
        s += 7
    return r, pos


def parse_data_block(body, entries, sep_log=None):
    n = len(body)
    if n < 4:
        return
    num_restarts = struct.unpack_from("<I", body, n - 4)[0]
    restart_off = n - 4 - num_restarts * 4
    if restart_off < 0 or restart_off > n:
        return
    p = 0
    prev = b""
    count = 0
    while p < restart_off:
        try:
            shared, p2 = get_varint(body, p)
            non_shared, p2 = get_varint(body, p2)
            vlen, p2 = get_varint(body, p2)
            kdelta = body[p2:p2 + non_shared]
            p2 += non_shared
            val = body[p2:p2 + vlen]
            p2 += vlen
        except IndexError:
            return
        key = prev[:shared] + kdelta
        prev = key
        p = p2
        count += 1
        if len(key) < 8:
            continue
        uk = key[:-8]
        vtype = key[-1]
        entries.append((uk, None if vtype == 1 else val))
    return count


def parse_ldb(path):
    data = open(path, "rb").read()
    if len(data) < 48:
        return []
    foot = data[-48:]
    pos = 0
    m_off, pos = get_varint(foot, pos)
    m_size, pos = get_varint(foot, pos)
    i_off, pos = get_varint(foot, pos)
    i_size, pos = get_varint(foot, pos)
    all_entries = []

    def decomp(raw):
        if len(raw) < 5:
            return b""
        ctype = raw[-5]
        body = raw[:-5]
        if ctype == 1:
            try:
                import cramjam
                return bytes(cramjam.snappy.decompress_raw(body))
            except Exception:
                try:
                    import snappy
                    return snappy.decompress(body)
                except Exception:
                    return body
        if ctype == 2:
            try:
                return zlib.decompress(body, -15)
            except Exception:
                return body
        return body

    # ---- index block ----
    idx_raw = data[i_off:i_off + i_size]
    idx = decomp(idx_raw)
    n = len(idx)
    num_restarts = struct.unpack_from("<I", idx, n - 4)[0]
    restart_off = n - 4 - num_restarts * 4
    p = 0
    prev = b""
    handlers = []
    while p < restart_off:
        try:
            shared, p2 = get_varint(idx, p)
            non_shared, p2 = get_varint(idx, p2)
            vlen, p2 = get_varint(idx, p2)
            kdelta = idx[p2:p2 + non_shared]
            p2 += non_shared
            hv = idx[p2:p2 + vlen]
            p2 += vlen
        except IndexError:
            break
        key = prev[:shared] + kdelta
        prev = key
        p = p2
        hp = 0
        boff, hp = get_varint(hv, hp)
        bsize, hp = get_varint(hv, hp)
        handlers.append((boff, bsize))

    for boff, bsize in handlers:
        raw = data[boff:boff + bsize]
        body = decomp(raw)
        parse_data_block(body, all_entries)
    return all_entries


def parse_batch(payload):
    if len(payload) < 12:
        return []
    pos = 8
    count = struct.unpack_from("<I", payload, pos)[0]
    pos += 4
    out = []
    for _ in range(count):
        if pos >= len(payload):
            break
        typ = payload[pos]
        pos += 1
        klen, pos = get_varint(payload, pos)
        if pos + klen > len(payload):
            break
        key = payload[pos:pos + klen]
        pos += klen
        if typ == 1:
            out.append((key, None))
            continue
        vlen, pos = get_varint(payload, pos)
        if pos + vlen > len(payload):
            break
        out.append((key, payload[pos:pos + vlen]))
        pos += vlen
    return out


def parse_log_file(path):
    data = open(path, "rb").read()
    out = []
    pos = 0
    n = len(data)
    frags = []
    while pos + 7 <= n:
        block_end = ((pos // 32768) + 1) * 32768
        crc, length, rtype = struct.unpack_from("<IHB", data, pos)
        if length == 0 and rtype == 0 and crc == 0:
            pos = min(block_end, n)
            continue
        if pos + 7 + length > n:
            pos = min(block_end, n)
            continue
        payload = data[pos + 7:pos + 7 + length]
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
    # strip internal keys
    res = []
    for k, v in out:
        if len(k) >= 8:
            res.append((k[:-8], None if k[-1] == 1 else v))
    return res


def dec(b):
    if b is None:
        return None
    for enc in ("utf-16-le", "utf-8"):
        try:
            s = b.decode(enc)
        except Exception:
            continue
        bad = sum(1 for c in s if ord(c) < 9 or (13 < ord(c) < 32))
        if bad > len(s) * 0.1:
            continue
        return s
    try:
        return b.decode("utf-16-le", "replace")
    except Exception:
        return None


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
            print("ERR %s: %r" % (fn, e))
            continue
        for k, v in ents:
            kv[k] = v
        print("%s -> %d" % (fn, len(ents)))
    res = {}
    for k, v in kv.items():
        ks = dec(k) or repr(k)
        res[ks] = dec(v)
    os.makedirs(os.path.dirname(outfile), exist_ok=True)
    json.dump(res, open(outfile, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("TOTAL", len(kv))
    with open(outfile + ".keys", "w", encoding="utf-8") as f:
        f.write("\n".join(sorted(res.keys())))


if __name__ == "__main__":
    main()
