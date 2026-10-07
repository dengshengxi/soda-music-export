# -*- coding: utf-8 -*-
"""
Minimal LevelDB reader for Chromium Local Storage / Session Storage.
Parses both .log (write-ahead log => write batches) and .ldb (sorted string table).
Only needs standard library.
"""
import os, io, struct, json, zlib, sys

DIR = os.path.normpath(sys.argv[1])
OUTDIR = sys.argv[2]

def read_varint32(buf, pos):
    result = 0
    shift = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            break
        shift += 7
    return result, pos


def parse_batch(payload):
    """payload = after the 7-byte record header of a LevelDB log file."""
    if len(payload) < 12:
        return []
    pos = 0
    seq = struct.unpack_from("<Q", payload, pos)[0]
    pos += 8
    count = struct.unpack_from("<I", payload, pos)[0]
    pos += 4
    entries = []
    for _ in range(count):
        if pos >= len(payload):
            break
        typ = payload[pos]; pos += 1
        klen, pos = read_varint32(payload, pos)
        if pos + klen > len(payload):
            break
        key = payload[pos:pos + klen]
        pos += klen
        if typ == 1:  # deletion
            entries.append((key, None))
            continue
        vlen, pos = read_varint32(payload, pos)
        if pos + vlen > len(payload):
            break
        val = payload[pos:pos + vlen]
        pos += vlen
        entries.append((key, val))
    return entries


def parse_log_file(path):
    """LevelDB log (= *.log) format: blocks of 32768 bytes."""
    data = open(path, "rb").read()
    out = []
    pos = 0
    n = len(data)
    while pos + 7 <= n:
        # skip block padding
        if n - pos < 7:
            break
        # check if remaining bytes in current block are all zeros -> jump to next block
        block_end = ((pos // 32768) + 1) * 32768
        header = data[pos:pos + 7]
        crc, length, rtype = struct.unpack("<IHB", header)
        if length == 0 and rtype == 0 and crc == 0:
            pos = min(block_end, n)
            continue
        if pos + 7 + length > n:
            pos = min(block_end, n)
            continue
        payload = data[pos + 7: pos + 7 + length]
        pos += 7 + length
        if rtype == 1:  # FULL
            out.extend(parse_batch(payload))
        elif rtype in (2, 3, 4):
            # fragmented -> collect consecutive fragments
            pass
        # advance pretty needed done by length already
    return out


def parse_log_file_frag(path):
    """Full implementation handling FIRST/MIDDLE/LAST fragments."""
    data = open(path, "rb").read()
    out = []
    pos = 0
    n = len(data)
    frags = []
    while pos + 7 <= n:
        block_end = ((pos // 32768) + 1) * 32768
        crc, length, rtype = struct.unpack_from("<IHB", data, pos)
        if n - pos < 7:
            break
        if length == 0 and rtype == 0 and crc == 0:
            pos = min(block_end, n)
            continue
        if pos + 7 + length > n:
            pos = min(block_end, n)
            continue
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


# ---------- SSTable (.ldb) parsing ----------
def get_varint64(buf, pos):
    result = 0
    shift = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not (b & 0x80):
            break
        shift += 7
        if shift > 63:
            break
    return result, pos


def read_block(handle_bytes):
    off, pos = get_varint64(handle_bytes, 0)
    size, pos = get_varint64(handle_bytes, pos)
    return off, size


def parse_ldb(path):
    import struct as st
    data = open(path, "rb").read()
    if len(data) < 48:
        return []
    footer = data[-48:]
    metaindex_off, pos = get_varint64(footer, 0)
    metaindex_size, pos = get_varint64(footer, pos)
    metaindex_off = int(metaindex_off); metaindex_size = int(metaindex_size)
    index_off, pos = get_varint64(footer, metaindex_size and 0 or 0)
    # re-read footer properly
    pos = 0
    m_off, pos = get_varint64(footer, pos)
    m_size, pos = get_varint64(footer, pos)
    i_off, pos = get_varint64(footer, pos)
    i_size, pos = get_varint64(footer, pos)
    m_off = int(m_off); m_size = int(m_size); i_off = int(i_off); i_size = int(i_size)

    # read compression flag from metaindex/ footer properties: assume footer properties block
    # Simpler: brute-force try zlib & raw
    out = []

    def deblock(block):
        ctype = 0
        for cand, dec in ((data[0:0], None),):
            pass
        return block

    # index block
    index_blk = data[i_off:i_off + i_size]
    if not index_blk:
        return []
    # try to find restart array: last 4 bytes = num restarts
    try:
        num_restarts = st.unpack_from("<I", index_blk, len(index_blk) - 4)[0]
    except Exception:
        return []
    restart_off = len(index_blk) - 4 - num_restarts * 4
    if restart_off < 0:
        return []
    p = 0
    prev_key = b""
    blocks = []
    while p < restart_off:
        shared, p2 = get_varint64(index_blk, p)
        non_shared, p2 = get_varint64(index_blk, p2)
        value_len, p2 = get_varint64(index_blk, p2)
        kdelta = index_blk[p2:p2 + int(non_shared)]
        p2 += int(non_shared)
        valhandle = index_blk[p2:p2 + int(value_len)]
        p2 += int(value_len)
        key = prev_key[:int(shared)] + kdelta
        prev_key = key
        try:
            boff, bsize = read_block(valhandle)
        except Exception:
            p = p2
            continue
        blocks.append((int(boff), int(bsize)))
        p = p2

    for boff, bsize in blocks:
        raw = data[boff:boff + bsize]
        # trailing 5 bytes: 1 byte compression type + 4 byte crc
        if len(raw) < 5:
            continue
        ctype = raw[-5]
        body = raw[:-5]
        if ctype == 1:
            try:
                body = zlib.decompress(body)
            except Exception:
                pass
        elif ctype in (2, 4):
            pass
        prev_key = b""
        num_restarts = st.unpack_from("<I", body, len(body) - 4)[0]
        restart_off = len(body) - 4 - num_restarts * 4
        if restart_off < 0:
            continue
        p = 0
        while p < restart_off:
            try:
                shared, p2 = get_varint64(body, p)
                non_shared, p2 = get_varint64(body, p2)
                value_len, p2 = get_varint64(body, p2)
                kdelta = body[p2:p2 + int(non_shared)]
                p2 += int(non_shared)
                val = body[p2:p2 + int(value_len)]
                p2 += int(value_len)
            except Exception:
                break
            key = prev_key[:int(shared)] + kdelta
            prev_key = key
            # internal key: userkey + 8 bytes(seq<<8|type)
            if len(key) < 8:
                p = p2
                continue
            uk = key[:-8]
            vtype = key[-1]
            if vtype == 1:  # deletion
                out.append((uk, None))
            else:
                out.append((uk, val))
            p = p2
    return out


def collect():
    kv = {}
    for fn in sorted(os.listdir(DIR)):
        path = os.path.join(DIR, fn)
        if not os.path.isfile(path):
            continue
        try:
            if fn.endswith(".log"):
                entries = parse_log_file_frag(path)
            elif fn.endswith(".ldb"):
                entries = parse_ldb(path)
            else:
                continue
        except Exception as e:
            print("skip %s: %s" % (fn, e))
            continue
        for k, v in entries:
            kv[k] = v
        print("%s -> %d entries (total %d)" % (fn, len(entries), len(kv)))
    return kv


def maybe_decode(v):
    if v is None:
        return None
    for enc in ("utf-8", "utf-16-le"):
        try:
            s = v.decode(enc)
            nul = s.count("\x00")
            if nul > len(s) * 0.3:
                continue
            return s
        except Exception:
            continue
    return None


def main():
    kv = collect()
    os.makedirs(OUTDIR, exist_ok=True)
    lines = []
    result = {}
    for k, v in kv.items():
        try:
            ks = k.decode("utf-8", "replace")
        except Exception:
            ks = repr(k)
        s = maybe_decode(v) if isinstance(v, bytes) else v
        if s is None:
            # keys of a values where key itself holds the interesting part occasionally include UTF-16
            s = None
        result[ks] = s
    with open(os.path.join(OUTDIR, "kv.json"), "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=1)
    print("total keys: %d" % len(kv))
    # also dump keys with UTF-16 names
    u16 = []
    for k in kv:
        try:
            k.decode("utf-8")
        except Exception:
            try:
                u16.append(k.decode("utf-16-le"))
            except Exception:
                pass
    with open(os.path.join(OUTDIR, "keys_utf16.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(u16))
    print("utf16 keys: %d" % len(u16))


if __name__ == "__main__":
    main()
