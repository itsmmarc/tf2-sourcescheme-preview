// ---------------------------------------------------------------------------
// Font files: read names and metrics from TTF/OTF, register them with the
// browser, and check which families exist on this computer.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  function readTables(buf) {
    const dv = new DataView(buf);
    let off = 0;
    const tag = dv.getUint32(0);
    if (tag === 0x74746366) off = dv.getUint32(12); // 'ttcf' → first font
    const num = dv.getUint16(off + 4);
    const tables = {};
    for (let i = 0; i < num; i++) {
      const r = off + 12 + i * 16;
      const t = String.fromCharCode(dv.getUint8(r), dv.getUint8(r + 1), dv.getUint8(r + 2), dv.getUint8(r + 3));
      tables[t] = { off: dv.getUint32(r + 8), len: dv.getUint32(r + 12) };
    }
    return { dv, tables };
  }

  // Returns { names: {1,2,4,6,16,17}, unitsPerEm, winAscent, winDescent, ascender, descender }
  function inspectFont(buf) {
    const { dv, tables } = readTables(buf);
    const info = { names: {}, unitsPerEm: 2048, winAscent: 0, winDescent: 0, ascender: 0, descender: 0 };
    if (tables.head) info.unitsPerEm = dv.getUint16(tables.head.off + 18) || 2048;
    if (tables.hhea) { info.ascender = dv.getInt16(tables.hhea.off + 4); info.descender = dv.getInt16(tables.hhea.off + 6); }
    if (tables['OS/2'] && tables['OS/2'].len >= 78) {
      const o = tables['OS/2'].off;
      info.winAscent = dv.getUint16(o + 74); info.winDescent = dv.getUint16(o + 76);
      info.weightClass = dv.getUint16(o + 4);
    }
    if (tables.name) {
      const o = tables.name.off, count = dv.getUint16(o + 2), strOff = o + dv.getUint16(o + 4);
      const found = {};
      for (let i = 0; i < count; i++) {
        const r = o + 6 + i * 12;
        const plat = dv.getUint16(r), enc = dv.getUint16(r + 2), lang = dv.getUint16(r + 4), id = dv.getUint16(r + 6);
        const len = dv.getUint16(r + 8), so = dv.getUint16(r + 10);
        if (![1, 2, 4, 6, 16, 17].includes(id)) continue;
        let s = '';
        if (plat === 3 || plat === 0) {
          for (let j = 0; j < len; j += 2) s += String.fromCharCode(dv.getUint16(strOff + so + j));
        } else if (plat === 1 && enc === 0) {
          for (let j = 0; j < len; j++) s += String.fromCharCode(dv.getUint8(strOff + so + j));
        } else continue;
        // prefer Windows English names
        const score = (plat === 3 ? 4 : plat === 0 ? 2 : 1) + (lang === 0x409 || lang === 0 ? 2 : 0);
        if (!found[id] || found[id].score < score) found[id] = { s, score };
      }
      for (const id in found) info.names[id] = found[id].s;
    }
    return info;
  }

  // Ratio between a CSS font-size and Source's "tall" (GDI cell height).
  function tallRatio(info) {
    const cell = (info.winAscent + info.winDescent) || (info.ascender - info.descender);
    return cell > 0 ? info.unitsPerEm / cell : 0.83;
  }

  // Known metrics for Windows system fonts referenced by stock schemes.
  const SYSTEM_RATIO = {
    'tahoma': 2048 / (2049 + 423), 'verdana': 2048 / (2059 + 430), 'arial': 2048 / (1854 + 434),
    'courier new': 2048 / (1705 + 615), 'lucida console': 2048 / (1616 + 432), 'trebuchet ms': 2048 / (1923 + 455),
    'marlett': 1, 'helvetica': 0.895, 'georgia': 2048 / (1878 + 449), 'impact': 2048 / (2066 + 432),
    'microsoft sans serif': 2048 / (1888 + 430), 'segoe ui': 2048 / (2210 + 514),
  };

  const registry = new Map();   // lower family → { family, ratio, source: 'hud', path }
  const fileInfo = new Map();   // lower path → { names, ratio, faces: [FontFace] }
  const sysCache = new Map();

  async function registerFile(path, buf, extraNames) {
    let info;
    try { info = inspectFont(buf); } catch (e) { info = { names: {}, unitsPerEm: 2048 }; }
    const ratio = tallRatio(info);
    const names = new Set();
    for (const id of [1, 4, 16, 6]) if (info.names[id]) names.add(info.names[id]);
    for (const n of extraNames || []) if (n) names.add(n);
    const rec = { path, names: [...names], ratio, faces: [], info };
    for (const fam of names) {
      const lk = fam.toLowerCase();
      if (registry.has(lk) && registry.get(lk).path !== path && registry.get(lk).explicit) continue;
      try {
        const face = new FontFace(fam, buf.slice(0));
        await face.load();
        document.fonts.add(face);
        rec.faces.push(face);
        registry.set(lk, { family: fam, ratio, source: 'hud', path, explicit: (extraNames || []).includes(fam) });
      } catch (e) { /* unreadable font */ }
    }
    fileInfo.set(path.toLowerCase(), rec);
    return rec;
  }

  function clearHudFonts() {
    for (const rec of fileInfo.values()) for (const f of rec.faces) { try { document.fonts.delete(f); } catch (e) {} }
    fileInfo.clear(); registry.clear();
  }

  // Detect an installed system font by comparing rendered widths.
  let ctx = null;
  function systemHas(family) {
    const lk = family.toLowerCase();
    if (sysCache.has(lk)) return sysCache.get(lk);
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    const sample = 'mmmmmmmmmmlliWW@#0123456789abcdefgh';
    let has = false;
    for (const base of ['monospace', 'serif', 'sans-serif']) {
      ctx.font = `72px ${base}`; const w0 = ctx.measureText(sample).width;
      ctx.font = `72px "${family.replace(/"/g, '')}", ${base}`; const w1 = ctx.measureText(sample).width;
      if (Math.abs(w0 - w1) > 0.5) { has = true; break; }
    }
    sysCache.set(lk, has);
    return has;
  }

  // 'hud' | 'system' | 'missing'
  function status(family) {
    if (!family) return 'missing';
    if (registry.has(family.toLowerCase())) return 'hud';
    return systemHas(family) ? 'system' : 'missing';
  }

  function ratioFor(family) {
    const r = registry.get((family || '').toLowerCase());
    if (r) return r.ratio;
    return SYSTEM_RATIO[(family || '').toLowerCase()] || 0.83;
  }

  function cssFamily(family) {
    const r = registry.get((family || '').toLowerCase());
    const fam = r ? r.family : family;
    return `"${(fam || 'Tahoma').replace(/"/g, '')}", Tahoma, Verdana, "DejaVu Sans", sans-serif`;
  }

  function hudFamilies() { return [...registry.values()].map(r => r.family); }

  root.Fonts = { inspectFont, registerFile, clearHudFonts, status, ratioFor, cssFamily, hudFamilies, fileInfo, registry, systemHas };
})(typeof window !== 'undefined' ? window : globalThis);
