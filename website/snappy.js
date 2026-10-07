/*
 * Snappy (raw block format) decompressor — 纯 JS，无依赖。
 * LevelDB 的 SSTable 默认用 Snappy 压缩 block。
 */
var Snappy = (function () {
  'use strict';

  function readVarint(src, pos) {
    var result = 0, shift = 0, b;
    do {
      b = src[pos++];
      result |= (b & 0x7f) << shift;
      shift += 7;
    } while (b & 0x80);
    return [result >>> 0, pos];
  }

  function copyBack(out, dst, off, len) {
    var from = dst - off;
    if (from < 0 || off === 0) return false;
    for (var i = 0; i < len; i++) out[dst + i] = out[from + i];
    return true;
  }

  /** 解压 snappy raw block，返回 Uint8Array */
  function decompress(src) {
    var r = readVarint(src, 0);
    var uncompressedLen = r[0];
    var pos = r[1];
    var out = new Uint8Array(uncompressedLen);
    var o = 0;

    while (pos < src.length) {
      var tag = src[pos++];
      switch (tag & 0x03) {
        case 0: { // literal
          var len = tag >> 2;
          if (len >= 60) {
            var nbytes = len - 59;
            len = 0;
            for (var i = 0; i < nbytes; i++) len |= src[pos + i] << (8 * i);
            pos += nbytes;
          }
          len += 1;
          out.set(src.subarray(pos, pos + len), o);
          o += len;
          pos += len;
          break;
        }
        case 1: { // copy with 1-byte offset
          var l1 = 4 + ((tag >> 2) & 0x07);
          var off1 = ((tag & 0xe0) << 3) | src[pos++];
          copyBack(out, o, off1, l1);
          o += l1;
          break;
        }
        case 2: { // copy with 2-byte offset
          var l2 = 1 + (tag >> 2);
          var off2 = src[pos] | (src[pos + 1] << 8);
          pos += 2;
          copyBack(out, o, off2, l2);
          o += l2;
          break;
        }
        default: { // copy with 4-byte offset
          var l3 = 1 + (tag >> 2);
          var off3 = (src[pos] | (src[pos + 1] << 8) |
                      (src[pos + 2] << 16) | (src[pos + 3] << 24));
          pos += 4;
          copyBack(out, o, off3 >>> 0, l3);
          o += l3;
          break;
        }
      }
    }
    return out;
  }

  return { decompress: decompress };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Snappy;
