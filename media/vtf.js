// ---------------------------------------------------------------------------
// Minimal VTF reader (largest mip, first frame) for image-based borders.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';
  const F = { RGBA8888: 0, ABGR8888: 1, RGB888: 2, BGR888: 3, RGB565: 4, I8: 5, IA88: 6, A8: 8,
    ARGB8888: 11, BGRA8888: 12, DXT1: 13, DXT3: 14, DXT5: 15, BGRX8888: 16, BGR565: 17, DXT1A: 20 };
  const BPP = { 0: 4, 1: 4, 2: 3, 3: 3, 4: 2, 5: 1, 6: 2, 8: 1, 11: 4, 12: 4, 16: 4, 17: 2 };

  function size(fmt, w, h) {
    if (fmt === F.DXT1 || fmt === F.DXT1A) return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 8;
    if (fmt === F.DXT3 || fmt === F.DXT5) return Math.max(1, (w + 3) >> 2) * Math.max(1, (h + 3) >> 2) * 16;
    return w * h * (BPP[fmt] || 4);
  }

  function c565(v) { return [((v >> 11) & 31) * 255 / 31 | 0, ((v >> 5) & 63) * 255 / 63 | 0, (v & 31) * 255 / 31 | 0]; }

  function decodeDXT(src, w, h, fmt) {
    const out = new Uint8ClampedArray(w * h * 4);
    const bw = Math.max(1, (w + 3) >> 2), bh = Math.max(1, (h + 3) >> 2);
    const blk = fmt === F.DXT1 || fmt === F.DXT1A ? 8 : 16;
    let p = 0;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++, p += blk) {
      const alpha = new Uint8Array(16).fill(255);
      let co = p;
      if (fmt === F.DXT3) {
        for (let i = 0; i < 8; i++) { const b = src[p + i]; alpha[i * 2] = (b & 15) * 17; alpha[i * 2 + 1] = (b >> 4) * 17; }
        co = p + 8;
      } else if (fmt === F.DXT5) {
        const a0 = src[p], a1 = src[p + 1]; const pal = [a0, a1];
        if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7 | 0);
        else { for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5 | 0); pal.push(0, 255); }
        let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(src[p + 2 + i]) << BigInt(8 * i);
        for (let i = 0; i < 16; i++) alpha[i] = pal[Number((bits >> BigInt(3 * i)) & 7n)];
        co = p + 8;
      }
      const v0 = src[co] | (src[co + 1] << 8), v1 = src[co + 2] | (src[co + 3] << 8);
      const k0 = c565(v0), k1 = c565(v1);
      const cols = [k0.concat(255), k1.concat(255)];
      if (v0 > v1 || blk === 16) {
        cols.push([0, 1, 2].map(i => (2 * k0[i] + k1[i]) / 3 | 0).concat(255));
        cols.push([0, 1, 2].map(i => (k0[i] + 2 * k1[i]) / 3 | 0).concat(255));
      } else {
        cols.push([0, 1, 2].map(i => (k0[i] + k1[i]) / 2 | 0).concat(255));
        cols.push([0, 0, 0, fmt === F.DXT1A || fmt === F.DXT1 ? 0 : 255]);
      }
      const idx = src[co + 4] | (src[co + 5] << 8) | (src[co + 6] << 16) | (src[co + 7] << 24);
      for (let i = 0; i < 16; i++) {
        const x = bx * 4 + (i & 3), y = by * 4 + (i >> 2);
        if (x >= w || y >= h) continue;
        const c = cols[(idx >>> (2 * i)) & 3], o = (y * w + x) * 4;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2];
        out[o + 3] = blk === 16 ? alpha[i] : c[3];
      }
    }
    return out;
  }

  function decodeRaw(src, w, h, fmt) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4; let r, g, b, a = 255;
      switch (fmt) {
        case F.RGBA8888: [r, g, b, a] = [src[o], src[o + 1], src[o + 2], src[o + 3]]; break;
        case F.ABGR8888: [a, b, g, r] = [src[o], src[o + 1], src[o + 2], src[o + 3]]; break;
        case F.ARGB8888: [a, r, g, b] = [src[o], src[o + 1], src[o + 2], src[o + 3]]; break;
        case F.BGRA8888: [b, g, r, a] = [src[o], src[o + 1], src[o + 2], src[o + 3]]; break;
        case F.BGRX8888: [b, g, r] = [src[o], src[o + 1], src[o + 2]]; break;
        case F.RGB888: [r, g, b] = [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]; break;
        case F.BGR888: [b, g, r] = [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]; break;
        case F.I8: r = g = b = src[i]; break;
        case F.IA88: r = g = b = src[i * 2]; a = src[i * 2 + 1]; break;
        case F.A8: r = g = b = 255; a = src[i]; break;
        case F.RGB565: case F.BGR565: { const v = src[i * 2] | (src[i * 2 + 1] << 8); [r, g, b] = c565(v); if (fmt === F.BGR565) [r, b] = [b, r]; break; }
        default: r = 255; g = 0; b = 255;
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
    return out;
  }

  // → { width, height, rgba: Uint8ClampedArray } or throws
  function decode(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    if (dv.getUint32(0, true) !== 0x00465456) throw new Error('Not a VTF file');
    const minor = dv.getUint32(8, true), headerSize = dv.getUint32(12, true);
    const w = dv.getUint16(16, true), h = dv.getUint16(18, true), flags = dv.getUint32(20, true);
    const frames = dv.getUint16(24, true) || 1;
    const fmt = dv.getInt32(52, true), mips = dv.getUint8(56);
    const lowFmt = dv.getInt32(57, true), lw = dv.getUint8(61), lh = dv.getUint8(62);
    const depth = minor >= 2 ? (dv.getUint16(63, true) || 1) : 1;
    const faces = flags & 0x4000 ? (minor < 5 ? 7 : 6) : 1;
    let dataStart = -1;
    if (minor >= 3) {
      const n = dv.getUint32(68, true);
      for (let i = 0; i < n; i++) {
        const r = 80 + i * 8;
        if (u8[r] === 0x30 && u8[r + 1] === 0 && u8[r + 2] === 0) dataStart = dv.getUint32(r + 4, true);
      }
    }
    if (dataStart < 0) dataStart = headerSize + (lowFmt >= 0 && lw ? size(lowFmt, lw, lh) : 0);
    let off = dataStart;
    for (let m = mips - 1; m >= 1; m--) {
      const mw = Math.max(1, w >> m), mh = Math.max(1, h >> m);
      off += size(fmt, mw, mh) * frames * faces * Math.max(1, depth >> m);
    }
    const src = u8.subarray(off, off + size(fmt, w, h));
    const rgba = [F.DXT1, F.DXT1A, F.DXT3, F.DXT5].includes(fmt) ? decodeDXT(src, w, h, fmt) : decodeRaw(src, w, h, fmt);
    return { width: w, height: h, rgba };
  }

  function toDataURL(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
    return c.toDataURL();
  }

  root.VTF = { decode, toDataURL };
})(typeof window !== 'undefined' ? window : globalThis);
