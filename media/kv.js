// ---------------------------------------------------------------------------
// KeyValues (Valve .res) parsing, #base chain resolution, merge, and text edits.
// Works in the browser (window.KV) and in node (module.exports) for tests.
// ---------------------------------------------------------------------------
(function (root) {
  'use strict';

  // Platform flags. TF2 runs on Windows (and Linux, which shares the Windows
  // branch for every conditional that matters in scheme files). macOS and
  // consoles are no longer supported, so they evaluate false.
  const FLAGS = { WIN32: true, WINDOWS: true, WIN64: true, POSIX: false, OSX: false, LINUX: false,
    X360: false, PS3: false, GAMECONSOLE: false, DECK: false };

  // ---------------- tokenizer ----------------
  function tokenize(text) {
    const toks = [], errors = [];
    let i = 0; const n = text.length;
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') { i++; continue; }
      if (c === '/' && text[i + 1] === '/') { while (i < n && text[i] !== '\n') i++; continue; }
      if (c === '/' && text[i + 1] === '*') { // tolerate block comments
        const end = text.indexOf('*/', i + 2); i = end < 0 ? n : end + 2; continue;
      }
      if (c === '{' || c === '}') { toks.push({ t: c, s: i, e: i + 1 }); i++; continue; }
      if (c === '[') {
        const end = text.indexOf(']', i);
        const e = end < 0 ? n : end + 1;
        toks.push({ t: 'cond', v: text.slice(i + 1, e - 1).trim(), s: i, e }); i = e; continue;
      }
      if (c === '"') {
        let j = i + 1, v = '';
        while (j < n && text[j] !== '"') {
          if (text[j] === '\\' && (text[j + 1] === '"' || text[j + 1] === '\\')) { v += text[j + 1]; j += 2; continue; }
          if (text[j] === '\n') break; // unterminated string: stop at end of line
          v += text[j]; j++;
        }
        if (text[j] !== '"') errors.push({ at: i, msg: 'Unterminated quoted string' });
        const e = text[j] === '"' ? j + 1 : j;
        toks.push({ t: 's', v, s: i, e, q: true }); i = e; continue;
      }
      let j = i;
      while (j < n && !/[\s{}"]/.test(text[j]) && !(text[j] === '/' && text[j + 1] === '/')) j++;
      toks.push({ t: 's', v: text.slice(i, j), s: i, e: j, q: false }); i = j;
    }
    return { toks, errors };
  }

  // ---------------- conditional evaluation ----------------
  function evalCond(expr) {
    if (!expr) return true;
    const src = expr.replace(/\s+/g, '');
    let p = 0;
    function prim() {
      if (src[p] === '!') { p++; return !prim(); }
      if (src[p] === '(') { p++; const v = or(); if (src[p] === ')') p++; return v; }
      if (src[p] === '$') p++;
      let name = '';
      while (p < src.length && /[A-Za-z0-9_]/.test(src[p])) name += src[p++];
      return !!FLAGS[name.toUpperCase()];
    }
    function and() { let v = prim(); while (src.startsWith('&&', p)) { p += 2; const r = prim(); v = v && r; } return v; }
    function or() { let v = and(); while (src.startsWith('||', p)) { p += 2; const r = and(); v = v || r; } return v; }
    try { return or(); } catch (e) { return true; }
  }

  // ---------------- parser ----------------
  // Node: { key, keyS, keyE, cond, condOk, block:boolean, value, valS, valE,
  //         open, close, children, parent, file }
  function parse(text, file) {
    const { toks, errors } = tokenize(text);
    let i = 0;
    const directives = [];
    function block(parent, depth) {
      const out = [];
      while (i < toks.length) {
        const t = toks[i];
        if (t.t === '}') {
          if (depth === 0) { errors.push({ at: t.s, msg: 'Unexpected closing brace' }); i++; continue; }
          return out;
        }
        if (t.t === '{') { errors.push({ at: t.s, msg: 'Opening brace without a key' }); i++; const n = { key: '', block: true, open: t.s, children: [], file, parent, condOk: true }; n.children = block(n, depth + 1); if (toks[i] && toks[i].t === '}') { n.close = toks[i].s; i++; } continue; }
        if (t.t === 'cond') { errors.push({ at: t.s, msg: 'Conditional without a key' }); i++; continue; }
        const node = { key: t.v, keyS: t.s, keyE: t.e, keyQ: t.q, file, parent, cond: null, condOk: true, block: false };
        i++;
        if (toks[i] && toks[i].t === 'cond') { node.cond = toks[i].v; node.condS = toks[i].s; node.condE = toks[i].e; i++; }
        const nx = toks[i];
        if (!nx) { errors.push({ at: t.s, msg: 'Key "' + t.v + '" has no value' }); break; }
        if (nx.t === '{') {
          node.block = true; node.open = nx.s; i++;
          node.children = block(node, depth + 1);
          if (toks[i] && toks[i].t === '}') { node.close = toks[i].s; node.end = toks[i].e; i++; }
          else { errors.push({ at: nx.s, msg: 'Block "' + t.v + '" is never closed' }); node.close = text.length; node.end = text.length; }
          if (toks[i] && toks[i].t === 'cond' && !node.cond) { node.cond = toks[i].v; node.condS = toks[i].s; node.condE = toks[i].e; i++; }
        } else if (nx.t === 's') {
          node.value = nx.v; node.valS = nx.s; node.valE = nx.e; node.valQ = nx.q; node.end = nx.e; i++;
          if (toks[i] && toks[i].t === 'cond') { node.cond = toks[i].v; node.condS = toks[i].s; node.condE = toks[i].e; node.end = toks[i].e; i++; }
        } else {
          errors.push({ at: nx.s, msg: 'Key "' + t.v + '" has no value' }); continue;
        }
        node.condOk = evalCond(node.cond);
        if (depth === 0 && !node.block && /^#(base|include)$/i.test(node.key)) {
          directives.push(node);
          continue;
        }
        out.push(node);
      }
      if (depth > 0) return out;
      return out;
    }
    const rootNodes = block(null, 0);
    return { nodes: rootNodes, directives, errors };
  }

  // ---------------- paths ----------------
  function normPath(p) {
    const parts = [];
    for (const seg of p.replace(/\\/g, '/').split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop(); else parts.push(seg);
    }
    return parts.join('/');
  }
  function dirOf(p) { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); }
  function baseName(p) { const i = p.lastIndexOf('/'); return i < 0 ? p : p.slice(i + 1); }

  // Find a file in the project for a #base reference made from `fromPath`.
  // files: Map lowerPath -> file record. Returns the lower path or null.
  function findBase(files, fromPath, ref) {
    const want = normPath(dirOf(fromPath) + '/' + ref).toLowerCase();
    if (files.has(want)) return want;
    const refN = normPath(ref).toLowerCase();
    // loose uploads: match by trailing path, then by file name
    for (const k of files.keys()) if (k === refN || k.endsWith('/' + refN)) return k;
    const bn = baseName(refN);
    for (const k of files.keys()) if (baseName(k) === bn && !files.get(k).virtual) return k;
    return null;
  }

  // Depth-first #base chain. Order = precedence (first wins).
  // getFile(lowerPath) -> {path, parsed}. Returns {order:[lowerPath], missing:[{from, ref}], edges}
  function resolveChain(files, entry, engineKey, ensure) {
    const order = [], missing = [], edges = [];
    const seen = new Set();
    (function visit(key, depth) {
      if (seen.has(key) || depth > 32) return;
      seen.add(key); order.push(key);
      const f = files.get(key);
      if (f && ensure) ensure(f);
      if (!f || !f.parsed) return;
      for (const d of f.parsed.directives) {
        if (!d.condOk) continue;
        let target = findBase(files, f.path, d.value);
        if (!target && engineKey && /sourceschemebase\.res$/i.test(d.value)) target = engineKey;
        edges.push({ from: key, ref: d.value, to: target, node: d });
        if (!target) { missing.push({ from: key, ref: d.value, node: d }); continue; }
        visit(target, depth + 1);
      }
    })(entry, 0);
    return { order, missing, edges };
  }

  // ---------------- merge ----------------
  // Merged entry: { key, lkey, block, value, node (winner), shadowed:[node], blocks:[node], children: MergedMap }
  function mergeBlocks(blockNodeLists) {
    const map = new Map();
    for (const list of blockNodeLists) {
      for (const n of list) {
        if (!n.condOk) continue;
        const lk = n.key.toLowerCase();
        let m = map.get(lk);
        if (!m) {
          m = { key: n.key, lkey: lk, block: n.block, value: n.value, node: n, shadowed: [], blocks: n.block ? [n] : [] };
          map.set(lk, m);
        } else if (m.block && n.block) {
          m.blocks.push(n);
        } else {
          m.shadowed.push(n);
        }
      }
    }
    for (const m of map.values()) {
      if (m.block) Object.defineProperty(m, 'children', { configurable: true, get() {
        const v = mergeBlocks(m.blocks.map(b => b.children)); Object.defineProperty(m, 'children', { value: v }); return v; } });
    }
    return map;
  }

  // Root of the merged scheme: all top-level blocks from every file in the chain.
  function mergeRoot(files, order) {
    const lists = [];
    for (const k of order) {
      const f = files.get(k);
      if (!f || !f.parsed) continue;
      for (const n of f.parsed.nodes) if (n.block && n.condOk) lists.push(n.children);
    }
    return mergeBlocks(lists);
  }

  // ---------------- text helpers ----------------
  function lineStart(text, at) { const i = text.lastIndexOf('\n', at - 1); return i + 1; }
  function lineEnd(text, at) { const i = text.indexOf('\n', at); return i < 0 ? text.length : i; }
  function indentOf(text, at) { const ls = lineStart(text, at); const m = /^[ \t]*/.exec(text.slice(ls, at)); return m ? m[0] : ''; }
  function lineNo(text, at) { let n = 1; for (let i = 0; i < at && i < text.length; i++) if (text.charCodeAt(i) === 10) n++; return n; }
  function quote(s) { return '"' + String(s).replace(/"/g, '\\"') + '"'; }
  function indentUnit(text) { return /\n\t/.test(text) && !/\n {4}"/.test(text) ? '\t' : '    '; }

  // ---------------- edit operations ----------------
  // Every op is { from, to, insert } on the text of a single file.
  function opSetValue(node, value) {
    return { from: node.valS, to: node.valE, insert: quote(value) };
  }

  function childIndent(text, block) {
    const first = (block.children || []).find(c => c.keyS != null);
    if (first) return indentOf(text, first.keyS);
    const base = block.keyS != null ? indentOf(text, block.keyS) : '';
    return base + indentUnit(text);
  }

  function pairLine(text, block, key, value, indent) {
    // align the value column with an existing sibling when there is one
    const sib = (block.children || []).find(c => !c.block && c.valS != null && c.keyS != null);
    const k = quote(key);
    let pad = '    ';
    if (sib) {
      const col = sib.valS - lineStart(text, sib.valS) - indent.length;
      const need = col - k.length;
      pad = need >= 2 ? ' '.repeat(need) : '    ';
    }
    return indent + k + pad + quote(value);
  }

  function insertBeforeClose(text, block, lines, indent) {
    // lines: array of strings already indented
    const close = block.close;
    const ls = lineStart(text, close);
    const before = text.slice(ls, close);
    if (/^[ \t]*$/.test(before)) {
      return { from: ls, to: ls, insert: lines.join('\n') + '\n' };
    }
    const braceIndent = block.keyS != null ? indentOf(text, block.keyS) : '';
    return { from: close, to: close, insert: '\n' + lines.join('\n') + '\n' + braceIndent };
  }

  function opInsertPair(text, block, key, value) {
    const indent = childIndent(text, block);
    return insertBeforeClose(text, block, [pairLine(text, block, key, value, indent)], indent);
  }

  // Insert nested blocks: path = ['Fonts','Default','1'], leaf = {key, value} | null
  function buildNested(path, leaf, indent, unit) {
    const lines = [];
    let ind = indent;
    for (const p of path) { lines.push(ind + quote(p)); lines.push(ind + '{'); ind += unit; }
    if (leaf) lines.push(ind + quote(leaf.key) + '    ' + quote(leaf.value));
    for (let i = path.length - 1; i >= 0; i--) { ind = ind.slice(0, ind.length - unit.length); lines.push(ind + '}'); }
    return lines;
  }

  function opInsertNested(text, block, path, leaf) {
    const unit = indentUnit(text);
    const indent = childIndent(text, block);
    return insertBeforeClose(text, block, buildNested(path, leaf, indent, unit), indent);
  }

  function opDelete(text, node) {
    const start = node.keyS, end = node.end != null ? node.end : (node.valE != null ? node.valE : node.keyE);
    const ls = lineStart(text, start), le = lineEnd(text, end);
    const pre = text.slice(ls, start), post = text.slice(end, le);
    if (/^[ \t]*$/.test(pre) && /^[ \t]*(\/\/.*)?$/.test(post)) {
      return { from: ls, to: Math.min(text.length, le + 1), insert: '' };
    }
    return { from: start, to: end, insert: '' };
  }

  // Find a (condition-passing) child block chain inside a file's parse tree
  function findPath(nodes, path) {
    let list = nodes, found = null, depth = 0;
    for (const p of path) {
      const n = (list || []).find(c => c.block && c.condOk && c.key.toLowerCase() === p.toLowerCase());
      if (!n) break;
      found = n; list = n.children; depth++;
    }
    return { node: found, depth };
  }

  function applyOp(text, op) { return text.slice(0, op.from) + op.insert + text.slice(op.to); }

  const api = { FLAGS, tokenize, parse, evalCond, normPath, dirOf, baseName, findBase, resolveChain,
    mergeBlocks, mergeRoot, lineStart, lineEnd, lineNo, indentOf, quote, opSetValue, opInsertPair,
    opInsertNested, opDelete, findPath, applyOp, buildNested, indentUnit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.KV = api;
})(typeof window !== 'undefined' ? window : globalThis);
