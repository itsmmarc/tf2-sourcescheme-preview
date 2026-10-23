// ---------------------------------------------------------------------------
// Scheme model: builds the merged SourceScheme from a project of files and
// answers questions about colors, settings, fonts and borders.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';
  const KV = root.KV || (typeof require !== 'undefined' ? require('./kv.js') : null);

  const NUM_COLOR = /^\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?\s*$/;
  function parseColor(s) {
    const m = NUM_COLOR.exec(s || '');
    if (!m) return null;
    const c = v => Math.max(0, Math.min(255, Math.round(+v)));
    return [c(m[1]), c(m[2]), c(m[3]), m[4] == null ? 255 : c(m[4])];
  }
  function rgbaCss(c) { return c ? `rgba(${c[0]},${c[1]},${c[2]},${(c[3] / 255).toFixed(3)})` : 'transparent'; }
  function hex(c) { return '#' + c.slice(0, 3).map(v => v.toString(16).padStart(2, '0')).join(''); }

  // BaseSettings keys whose values are not colors
  function isNonColorSetting(key, value) {
    if (/\.font$/i.test(key)) return 'font';
    if (/^-?\d+(\.\d+)?$/.test((value || '').trim())) return 'number';
    if (/(inset|wide|time|height|width|size|offset|delay|range)/i.test(key)) return 'number';
    if (/(icon|image|sound)$/i.test(key)) return 'text';
    return null;
  }

  const SECTIONS = ['Colors', 'BaseSettings', 'Fonts', 'Borders', 'CustomFontFiles'];

  class Scheme {
    // project: { files: Map(lower -> {path, text, parsed, virtual, readOnly}), entry, engineKey }
    constructor(project) {
      this.project = project;
      const files = project.files;
      const ensure = f => { const t = f.text; if (!f.parsed || f.parsedText !== t) { f.parsed = KV.parse(t, f); f.parsedText = t; } };
      this.chain = KV.resolveChain(files, project.entry, project.engineKey, ensure);
      this.root = KV.mergeRoot(files, this.chain.order);
      const sec = n => { const m = this.root.get(n.toLowerCase()); return m && m.block ? m.children : new Map(); };
      this.colors = sec('Colors');
      this.base = sec('BaseSettings');
      this.fonts = sec('Fonts');
      this.borders = sec('Borders');
      this.customFonts = sec('CustomFontFiles');
      this.misses = new Set();
    }

    fileOf(node) { return node && node.file; }

    // Resolve a color reference: raw "r g b a", a Colors name, or a BaseSettings key.
    resolve(ref, seen) {
      const chain = [];
      let cur = (ref || '').trim();
      seen = seen || new Set();
      for (let guard = 0; guard < 16; guard++) {
        const c = parseColor(cur);
        if (c) return { ok: true, rgba: c, chain };
        const lk = cur.toLowerCase();
        if (!cur || seen.has(lk)) break;
        seen.add(lk);
        const col = this.colors.get(lk);
        if (col && !col.block) { chain.push({ name: col.key, kind: 'color', entry: col }); cur = col.value; continue; }
        const b = this.base.get(lk);
        if (b && !b.block) { chain.push({ name: b.key, kind: 'base', entry: b }); cur = b.value; continue; }
        break;
      }
      return { ok: false, rgba: null, chain, missing: cur };
    }

    // Color for a BaseSettings key as the game would draw it.
    // Missing keys and broken references fall back to white, like VGUI does.
    baseColor(key, fallback) {
      const e = this.base.get(key.toLowerCase());
      if (!e || e.block) {
        if (fallback) { const r = this.resolve(fallback); if (r.ok) return r.rgba; }
        this.misses.add(key); return [255, 255, 255, 255];
      }
      const r = this.resolve(e.value);
      if (!r.ok) { this.misses.add(key); return [255, 255, 255, 255]; }
      return r.rgba;
    }

    baseString(key) {
      const e = this.base.get(key.toLowerCase());
      return e && !e.block ? e.value : undefined;
    }

    // ----- fonts -----
    fontEntries(name) {
      const m = this.fonts.get(name.toLowerCase());
      if (!m || !m.block) return [];
      return [...m.children.values()].filter(e => e.block);
    }
    font(name, yres) {
      const entries = this.fontEntries(name);
      if (!entries.length) return null;
      let pick = null;
      for (const e of entries) {
        const y = this.prop(e, 'yres');
        if (y) {
          const [lo, hi] = y.trim().split(/\s+/).map(Number);
          if (!(yres >= lo && yres <= hi)) continue;
        }
        pick = e; break;
      }
      if (!pick) pick = entries[0];
      const P = k => this.prop(pick, k);
      const num = (k, d) => { const v = P(k); return v == null || v === '' || isNaN(+v) ? d : +v; };
      return {
        fontName: name, entry: pick, entryKey: pick.key,
        name: P('name') || '', tall: num('tall', 16), weight: num('weight', 400),
        antialias: !!num('antialias', 0), outline: !!num('outline', 0), dropshadow: !!num('dropshadow', 0),
        italic: !!num('italic', 0), underline: !!num('underline', 0), strikeout: !!num('strikeout', 0),
        symbol: !!num('symbol', 0), additive: !!num('additive', 0), blur: num('blur', 0),
        scanlines: num('scanlines', 0), range: P('range'), yres: P('yres'),
      };
    }
    prop(entryMerged, key) {
      const c = entryMerged.children.get(key.toLowerCase());
      return c && !c.block ? c.value : undefined;
    }

    // ----- borders -----
    // Follows aliases such as `BaseBorder  DepressedBorder`
    borderEntry(name) {
      let m = this.borders.get((name || '').toLowerCase());
      const via = [];
      for (let g = 0; m && !m.block && g < 8; g++) { via.push(m); m = this.borders.get((m.value || '').toLowerCase()); }
      return { m, via };
    }
    border(name) {
      const { m, via } = this.borderEntry(name);
      if (!m || !m.block) return null;
      const kids = m.children;
      const val = k => { const c = kids.get(k); return c && !c.block ? c.value : undefined; };
      const type = (val('bordertype') || '').toLowerCase();
      // "inset" "left top right bottom", in pixels: moves where the control paints its
      // contents (text), not where the border's lines are drawn
      const ints = (v, n) => { const a = String(v || '').trim().split(/\s+/).map(x => parseInt(x, 10) || 0); while (a.length < n) a.push(0); return a.slice(0, n); };
      const inset = ints(val('inset'), 4);
      if (type === 'image' || type === 'scalable_image') {
        return { kind: 'image', name: m.key, via, inset, scalable: type === 'scalable_image', image: val('image') || '', color: val('color') || '',
          srcW: +(val('src_corner_width') || 0), srcH: +(val('src_corner_height') || 0),
          drawW: +(val('draw_corner_width') || 0), drawH: +(val('draw_corner_height') || 0), entry: m };
      }
      const sides = {};
      for (const side of ['left', 'right', 'top', 'bottom']) {
        const s = kids.get(side);
        sides[side] = [];
        if (!s || !s.block) continue;
        const lines = [...s.children.values()].filter(e => e.block)
          .sort((a, b) => (+a.key || 0) - (+b.key || 0));
        for (const ln of lines) {
          const cv = this.prop(ln, 'color') || '';
          const r = this.resolve(cv);
          // "offset" "start end": pixels cut off the line's start (top or left) and end
          const [start, end] = ints(this.prop(ln, 'offset'), 2);
          sides[side].push({ ref: cv, rgba: r.ok ? r.rgba : [255, 255, 255, 255], ok: r.ok, offset: this.prop(ln, 'offset'), start, end, entry: ln });
        }
      }
      return { kind: 'lines', name: m.key, via, inset, sides, backgroundtype: +(val('backgroundtype') || 0), entry: m };
    }

    // CustomFontFiles → [{key, path, name|null, entry}]
    customFontList() {
      const out = [];
      for (const e of this.customFonts.values()) {
        if (e.block) {
          const P = k => { const c = e.children.get(k); return c && !c.block ? c.value : undefined; };
          out.push({ key: e.key, path: P('font') || '', name: P('name') || null, entry: e });
        } else out.push({ key: e.key, path: e.value, name: null, entry: e });
      }
      return out;
    }

    // ----- problems -----
    problems(opts) {
      opts = opts || {};
      const out = [];
      const files = this.project.files;
      for (const k of this.chain.order) {
        const f = files.get(k);
        if (!f || !f.parsed) continue;
        for (const e of f.parsed.errors) out.push({ level: 'error', file: k, at: e.at, msg: e.msg });
      }
      for (const m of this.chain.missing) {
        out.push({ level: 'warn', file: m.from, at: m.node.keyS, msg: `#base "${m.ref}" was not found in the loaded files` });
      }
      for (const e of this.base.values()) {
        if (e.block || e.node.file.virtual) continue;
        const kind = isNonColorSetting(e.key, e.value);
        if (kind === 'number' || kind === 'text') continue;
        if (kind === 'font') {
          if (!this.fonts.has((e.value || '').toLowerCase()))
            out.push({ level: 'warn', file: e.node.file.key, at: e.node.valS, msg: `${e.key} uses font "${e.value}", which isn't defined in Fonts` });
          continue;
        }
        const r = this.resolve(e.value);
        if (!r.ok) out.push({ level: 'error', file: e.node.file.key, at: e.node.valS,
          msg: `${e.key} points to "${r.missing || e.value}", which isn't a defined color, so the game uses that control's built-in default.` });
      }
      for (const b of this.borders.values()) {
        if (!b.block) {
          if (!b.node.file.virtual && !this.border(b.key))
            out.push({ level: 'error', file: b.node.file.key, at: b.node.valS, msg: `${b.key} is set to "${b.value}", which isn't a defined border` });
          continue;
        }
        const bd = this.border(b.key);
        if (!bd || bd.kind !== 'lines') continue;
        for (const side in bd.sides) for (const ln of bd.sides[side]) if (!ln.ok && !ln.entry.node.file.virtual)
          out.push({ level: 'error', file: ln.entry.node.file.key, at: ln.entry.node.keyS,
            msg: `${b.key} ${side} line ${ln.entry.key} uses "${ln.ref}", which isn't a defined color` });
      }
      for (const c of this.colors.values()) {
        if (c.block || c.node.file.virtual) continue;
        if (!parseColor(c.value) && !this.resolve(c.value).ok)
          out.push({ level: 'warn', file: c.node.file.key, at: c.node.valS, msg: `Color ${c.key} has value "${c.value}", which isn't "R G B A"` });
      }
      if (opts.fontStatus) {
        const byFam = new Map();
        for (const f of this.fonts.values()) {
          if (!f.block) continue;
          const ft = this.font(f.key, opts.yres || 1080);
          if (!ft || !ft.name) continue;
          const nameEntry = ft.entry.children.get('name');
          const node = nameEntry ? nameEntry.node : ft.entry.node;
          if (node.file.virtual) continue;
          const lk = ft.name.toLowerCase();
          if (!byFam.has(lk)) byFam.set(lk, { name: ft.name, uses: [], node });
          byFam.get(lk).uses.push(f.key);
        }
        for (const fam of byFam.values()) {
          if (opts.fontStatus(fam.name) !== 'missing') continue;
          const u = fam.uses;
          out.push({ level: 'warn', file: fam.node.file.key, at: fam.node.valS ?? fam.node.keyS,
            msg: `"${fam.name}" isn't in your HUD's font files or installed on this computer, so the preview substitutes it. Used by ${u.slice(0, 3).join(', ')}${u.length > 3 ? ` and ${u.length - 3} more` : ''}.` });
        }
      }
      if (opts.fontFileStatus) {
        for (const cf of this.customFontList()) {
          const st = opts.fontFileStatus(cf.path);
          if (st === 'missing') out.push({ level: 'warn', file: cf.entry.node.file.key, at: cf.entry.node.keyS,
            msg: `Font file "${cf.path}" wasn't found in the loaded folder` });
        }
      }
      return out;
    }
  }

  const api = { Scheme, parseColor, rgbaCss, hex, isNonColorSetting, SECTIONS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SchemeLib = api;
})(typeof window !== 'undefined' ? window : globalThis);
