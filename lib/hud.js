// ---------------------------------------------------------------------------
// HUD discovery and #base loading for the extension host. Plain Node, no
// VS Code APIs, so it can be tested on its own.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const KV = require('../media/kv.js');

const ENGINE_KEY = '(engine)/sourceschemebase.res';

// Read a .res file the way the game would: UTF-8, UTF-16 with BOM, or Windows-1252.
function decode(buf) {
  if (buf[0] === 0xFF && buf[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xFE && buf[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  const start = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF ? 3 : 0;
  let text = new TextDecoder('utf-8').decode(buf.subarray(start));
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf.subarray(start));
  return text;
}

function isFile(p) { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } }

// Resolve rel under base ignoring case, as Windows (and the game) would.
function resolveCI(base, rel) {
  const direct = path.resolve(base, rel);
  if (fs.existsSync(direct)) return direct;
  let cur = path.resolve(base);
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { cur = path.dirname(cur); continue; }
    let names;
    try { names = fs.readdirSync(cur); } catch (e) { return null; }
    const hit = names.find(n => n.toLowerCase() === seg.toLowerCase());
    if (!hit) return null;
    cur = path.join(cur, hit);
  }
  return fs.existsSync(cur) ? cur : null;
}

// The sourcescheme.res (or another scheme, by name) that a .res file belongs
// to: the file itself, or the nearest resource/<name> found walking up from it.
function findEntry(fsPath, stopAt, name) {
  name = name || 'sourcescheme.res';
  if (path.basename(fsPath).toLowerCase() === name) return fsPath;
  let dir = path.dirname(fsPath);
  for (let i = 0; i < 12; i++) {
    if (path.basename(dir).toLowerCase() === 'resource') {
      const hit = resolveCI(dir, name);
      if (hit && isFile(hit)) return hit;
    }
    const hit = resolveCI(dir, 'resource/' + name);
    if (hit && isFile(hit)) return hit;
    if (stopAt && path.resolve(dir) === path.resolve(stopAt)) break;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

// Folder that holds resource/, materials/ etc.
function hudRoot(entry) {
  const dir = path.dirname(entry);
  return path.basename(dir).toLowerCase() === 'resource' ? path.dirname(dir) : dir;
}

function keyFor(root, abs) {
  const rel = path.relative(root, abs);
  const p = rel.startsWith('..') || path.isAbsolute(rel) ? abs : rel;
  return KV.normPath(p).toLowerCase();
}

// Load every file reachable through #base from the entry.
// readText(absPath) lets the caller supply unsaved editor text.
function loadChain(entry, readText) {
  const root = hudRoot(entry);
  const files = [], seen = new Set(), missing = [];
  const read = readText || (p => decode(fs.readFileSync(p)));
  (function visit(abs, depth) {
    const lk = path.resolve(abs).toLowerCase();
    if (seen.has(lk) || depth > 32) return;
    seen.add(lk);
    let text;
    try { text = read(abs); } catch (e) { missing.push({ from: abs, ref: abs }); return; }
    text = text.replace(/\r\n?/g, '\n');
    files.push({ key: keyFor(root, abs), path: KV.normPath(path.relative(root, abs)) || path.basename(abs), fsPath: abs, text });
    const parsed = KV.parse(text, {});
    for (const d of parsed.directives) {
      if (!d.condOk) continue;
      const target = resolveCI(path.dirname(abs), d.value);
      if (target && isFile(target)) visit(target, depth + 1);
      else if (!/sourceschemebase\.res$/i.test(d.value)) missing.push({ from: abs, ref: d.value });
    }
  })(entry, 0);
  return { root, files, missing };
}

// Font files named in CustomFontFiles → [{ abs, rel, names }]
function fontFiles(root, list) {
  const byFile = new Map();
  for (const cf of list) {
    if (!cf.path) continue;
    const abs = resolveCI(root, cf.path);
    if (!abs || !isFile(abs)) continue;
    const k = abs.toLowerCase();
    if (!byFile.has(k)) byFile.set(k, { abs, rel: KV.normPath(cf.path), names: [] });
    if (cf.name && !byFile.get(k).names.includes(cf.name)) byFile.get(k).names.push(cf.name);
  }
  return [...byFile.values()];
}

// Image border texture: materials/vgui/<image>.vtf, or via a .vmt's $basetexture
function findImage(root, image) {
  const p = KV.normPath(image).replace(/\.(vtf|vmt)$/i, '');
  for (const cand of [`materials/vgui/${p}.vtf`, `materials/${p}.vtf`]) {
    const hit = resolveCI(root, cand); if (hit && isFile(hit)) return hit;
  }
  for (const cand of [`materials/vgui/${p}.vmt`, `materials/${p}.vmt`]) {
    const vmt = resolveCI(root, cand);
    if (!vmt || !isFile(vmt)) continue;
    const m = /"?\$basetexture"?\s+"?([^"\s]+)"?/i.exec(decode(fs.readFileSync(vmt)));
    if (m) { const hit = resolveCI(root, `materials/${KV.normPath(m[1])}.vtf`); if (hit && isFile(hit)) return hit; }
  }
  return null;
}

// The HUD's resource/chat_english.txt. TF2 loads it from custom HUDs, and its
// "Tokens" replace the game's own English strings, so HUDs use it to rename
// things like "#GameUI_Keyboard". → { fsPath, rel, tokens: { lowercase token: { key, value, off, line } } }
const STRINGS_FILE = 'resource/chat_english.txt';
function loadStrings(root, readText) {
  const abs = resolveCI(root, STRINGS_FILE);
  if (!abs || !isFile(abs)) return null;
  let text;
  try { text = (readText || (p => decode(fs.readFileSync(p))))(abs); } catch (e) { return null; }
  text = text.replace(/\r\n?/g, '\n');
  const parsed = KV.parse(text, {});
  const tokens = {};
  const lines = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') lines.push(i + 1);
  const lineOf = off => { let lo = 0, hi = lines.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (lines[m] <= off) lo = m; else hi = m - 1; } return lo + 1; };
  const walk = nodes => {
    for (const n of nodes) {
      if (!n.condOk) continue;
      if (n.block) { if (/^(lang|tokens)$/i.test(n.key)) walk(n.children); continue; }
      if (n.parent && /^tokens$/i.test(n.parent.key) && !/^\[english\]/i.test(n.key))
        tokens[n.key.toLowerCase()] = { key: n.key, value: n.value, off: n.keyS, line: lineOf(n.keyS) };
    }
  };
  walk(parsed.nodes);
  return { fsPath: abs, rel: KV.normPath(path.relative(root, abs)), tokens };
}

// ClientScheme: the resource/clientscheme.res a file belongs to, if the file
// is that clientscheme.res or one of the files it #bases (borders.res, say).
const CLIENT_SCHEME = 'clientscheme.res';
function clientEntryFor(fsPath, stopAt, readText) {
  const entry = findEntry(fsPath, stopAt, CLIENT_SCHEME);
  if (!entry) return null;
  const lk = path.resolve(fsPath).toLowerCase();
  if (path.resolve(entry).toLowerCase() === lk) return entry;
  const chain = loadChain(entry, readText);
  return chain.files.some(f => path.resolve(f.fsPath).toLowerCase() === lk) ? entry : null;
}

// Border definitions in one scheme file: the entries of every top-level
// block's "Borders" section → [{ name, start, end }] (character offsets of
// the definition, key to closing brace or value)
function bordersIn(text) {
  const out = [];
  for (const top of KV.parse(text, {}).nodes) {
    if (!top.block) continue;
    for (const sec of top.children) {
      if (!sec.block || sec.key.toLowerCase() !== 'borders') continue;
      for (const b of sec.children) if (b.key) out.push({ name: b.key, start: b.keyS, end: b.end != null ? b.end : b.keyE });
    }
  }
  return out;
}

// The border whose definition contains a character offset (from the start of
// its key's line), or null
function borderAt(text, offset) {
  for (const b of bordersIn(text)) {
    const ls = text.lastIndexOf('\n', b.start - 1) + 1;
    if (offset >= ls && offset <= b.end) return b.name;
  }
  return null;
}

module.exports = { CLIENT_SCHEME, clientEntryFor, bordersIn, borderAt, ENGINE_KEY, STRINGS_FILE, decode, resolveCI, findEntry, hudRoot, keyFor, loadChain, loadStrings, fontFiles, findImage, isDir };
