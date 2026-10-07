/*
 * 极简 LevelDB 读取器 —— 解析 Chromium / Electron 应用的 Local Storage (leveldb 目录)。
 *
 * 关键点（踩过的坑都在这里）：
 *  1. BlockHandle 的 size 只覆盖压缩内容，5 字节 trailer [ctype][crc32] 紧跟在 off+size 之后
 *  2. ctype = 1 是 Snappy（不是 zlib）
 *  3. internal key = 用户 key + 8 字节 (seq<<8|type)，取值前要剥掉尾部 8 字节；type=1 表示删除
 *  4. data block 尾部是 restart 数组 + uint32 数量
 *  5. Local Storage 的 key 形如  origin + \x00\x01 + 真实 key
 */
var LevelDB = (function () {
  'use strict';

  var Snappy = (typeof module !== 'undefined' && module.exports)
    ? require('./snappy.js') : window.Snappy;

  function readVarint(buf, pos) {
    var result = 0, shift = 0, b;
    do {
      b = buf[pos++];
      result += (b & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while (b & 0x80);
    return [result, pos];
  }

  function u32le(b, p) {
    return (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | ((b[p + 3] << 24) >>> 0)) >>> 0;
  }
  function u16le(b, p) { return b[p] | (b[p + 1] << 8); }

  function inflate(data, off, size) {
    var content = data.subarray(off, off + size);
    var ctype = (off + size < data.length) ? data[off + size] : 0;
    if (ctype === 1) {
      try { return Snappy.decompress(content); } catch (e) { return content; }
    }
    return content; // 0=不压缩；2/4 罕见，直接原样返回
  }

  /** 解析一个 restart 格式的 block，返回 [[keyBytes, valueBytes], ...]（key 仍是 internal key） */
  function readBlock(data, off, size) {
    var blk = inflate(data, off, size);
    var n = blk.length;
    if (n < 4) return [];
    var numRestarts = u32le(blk, n - 4);
    var ro = n - 4 - numRestarts * 4;
    if (ro < 0 || ro > n) return [];
    var p = 0, prev = [], out = [];
    while (p < ro) {
      var r1 = readVarint(blk, p); var shared = r1[0];
      var r2 = readVarint(blk, r1[1]); var nonShared = r2[0];
      var r3 = readVarint(blk, r2[1]); var vlen = r3[0];
      var p2 = r3[1];
      if (p2 + nonShared + vlen > ro) break;
      var kd = Array.prototype.slice.call(blk.subarray(p2, p2 + nonShared));
      p2 += nonShared;
      var val = blk.subarray(p2, p2 + vlen);
      p2 += vlen;
      prev = prev.slice(0, shared).concat(kd);
      out.push([new Uint8Array(prev), val]);
      p = p2;
    }
    return out;
  }

  function stripInternal(entries) {
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      var k = entries[i][0], v = entries[i][1];
      if (k.length < 8) continue;
      out.push([k.subarray(0, k.length - 8), k[k.length - 1] === 1 ? null : v]);
    }
    return out;
  }

  /** 解析 *.ldb（SSTable） */
  function parseLdb(bytes) {
    if (bytes.length < 48) return [];
    var foot = bytes.subarray(bytes.length - 48);
    var p = 0, r;
    r = readVarint(foot, p); p = r[1];              // metaindex offset
    r = readVarint(foot, p); p = r[1];              // metaindex size
    r = readVarint(foot, p); var io = r[0]; p = r[1];   // index offset
    r = readVarint(foot, p); var isz = r[0]; p = r[1];  // index size

    var idx = readBlock(bytes, io, isz);
    var out = [];
    for (var i = 0; i < idx.length; i++) {
      var hv = idx[i][1];
      if (!hv) continue;
      var h1 = readVarint(hv, 0); var boff = h1[0];
      var h2 = readVarint(hv, h1[1]); var bsize = h2[0];
      var ents = readBlock(bytes, boff, bsize);
      out = out.concat(stripInternal(ents));
    }
    return out;
  }

  /** 解析 *.log（WAL / memtable 转储） */
  function parseLog(bytes) {
    var out = [], pos = 0, n = bytes.length, frags = [];
    while (pos + 7 <= n) {
      var blockEnd = Math.min((Math.floor(pos / 32768) + 1) * 32768, n);
      var crc = u32le(bytes, pos);
      var len = u16le(bytes, pos + 4);
      var rtype = bytes[pos + 6];
      if (len === 0 && rtype === 0 && crc === 0) { pos = blockEnd; continue; }
      if (pos + 7 + len > n) { pos = blockEnd; continue; }
      var payload = bytes.subarray(pos + 7, pos + 7 + len);
      pos += 7 + len;
      if (rtype === 1) out = out.concat(parseBatch(payload));
      else if (rtype === 2) frags = [payload];
      else if (rtype === 3) frags.push(payload);
      else if (rtype === 4) { frags.push(payload); out = out.concat(parseBatch(join(frags))); frags = []; }
    }
    return out;
  }

  function join(list) {
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i].length;
    var out = new Uint8Array(total), o = 0;
    for (i = 0; i < list.length; i++) { out.set(list[i], o); o += list[i].length; }
    return out;
  }

  function parseBatch(payload) {
    if (payload.length < 12) return [];
    var pos = 8;
    var count = u32le(payload, pos); pos += 4;
    var res = [];
    for (var i = 0; i < count; i++) {
      if (pos >= payload.length) break;
      var typ = payload[pos++];
      var r = readVarint(payload, pos); var klen = r[0]; pos = r[1];
      if (pos + klen > payload.length) break;
      var key = payload.subarray(pos, pos + klen); pos += klen;
      if (typ === 1) { res.push([key, null]); continue; }
      r = readVarint(payload, pos); var vlen = r[0]; pos = r[1];
      if (pos + vlen > payload.length) break;
      res.push([key, payload.subarray(pos, pos + vlen)]); pos += vlen;
    }
    return stripInternal(res);
  }

  // ---------- 文本解码 ----------

  function countZeros(b, n) {
    var c = 0;
    for (var i = 0; i < n; i++) if (b[i] === 0) c++;
    return c;
  }

  function isBad(ch) {
    var c = ch.charCodeAt(0);
    return c === 0 || (c >= 1 && c <= 0x1f) || c === 0x7f || (c >= 0xd800 && c <= 0xfffe);
  }

  function score(s) {
    var n = Math.min(s.length, 20000);
    var bad = 0;
    for (var i = 0; i < n; i++) if (isBad(s[i])) bad++;
    return n ? bad / n : 1;
  }

  function tryDecode(b, off, enc) {
    try { return new TextDecoder(enc, { fatal: true }).decode(b.subarray(off)); }
    catch (e) { return null; }
  }

  /**
   * Chromium Local Storage 的字符串可能是 UTF-16LE / UTF-16BE，而且有时整体偏移 1 字节。
   * 对 (offset 0/1) × (LE/BE) 四种组合解码，取"最干净"的结果；否则按 UTF-8。
   */
  function decode(b) {
    if (b == null) return null;
    var n = b.length - (b.length % 2);
    if (n >= 4 && countZeros(b, n) > n * 0.2) {
      var best = null;
      var offs = [0, 1], encs = ['utf-16le', 'utf-16be'];
      for (var i = 0; i < offs.length; i++) {
        for (var j = 0; j < encs.length; j++) {
          var s = tryDecode(b, offs[i], encs[j]);
          if (s == null) continue;
          var sc = score(s);
          if (!best || sc < best[0]) best = [sc, s];
        }
      }
      if (best && best[0] < 0.02) return best[1];
    }
    var u8 = tryDecode(b, 0, 'utf-8');
    if (u8 != null) return u8;
    // 兜底：逐字节当 latin1
    var out = '';
    for (var k = 0; k < b.length; k++) out += String.fromCharCode(b[k]);
    return out;
  }

  /**
   * 读取一堆 {name, bytes} 文件，返回 Map(key -> value)
   * 文件名排序模拟 LevelDB 的新旧顺序，后读到的覆盖先读到的。
   */
  function readStore(files, onProgress) {
    var kv = new Map();
    files.sort(function (a, b) { return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0); });
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (onProgress) onProgress(f.name, i, files.length);
      var ents;
      try {
        ents = /\.ldb$/.test(f.name) ? parseLdb(f.bytes) : parseLog(f.bytes);
      } catch (e) {
        ents = [];
      }
      for (var j = 0; j < ents.length; j++) {
        kv.set(decode(ents[j][0]), decode(ents[j][1]));
      }
    }
    return kv;
  }

  return {
    parseLdb: parseLdb,
    parseLog: parseLog,
    readStore: readStore,
    decode: decode
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LevelDB;
