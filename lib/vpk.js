// ---------------------------------------------------------------------------
// The game's own files: loose files under tf/ and hl2/, and the VPK archives
// TF2 ships (tf2_textures_dir.vpk, tf2_misc_dir.vpk, hl2_*), so image
// borders can use stock materials the HUD doesn't include. Plain Node.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

// A VPK directory file (version 1 or 2): its tree, indexed by lower-case path.
class VPK {
  constructor(dirPath) {
    this.dirPath = dirPath;
    this.index = null;
    this.prefix = dirPath.replace(/_dir\.vpk$/i, '');
  }

  load() {
    if (this.index) return;
    this.index = new Map();
    const buf = fs.readFileSync(this.dirPath);
    if (buf.readUInt32LE(0) !== 0x55aa1234) throw new Error('Not a VPK directory file: ' + this.dirPath);
    const version = buf.readUInt32LE(4), treeSize = buf.readUInt32LE(8);
    const headerSize = version === 2 ? 28 : version === 1 ? 12 : 0;
    if (!headerSize) throw new Error('Unsupported VPK version ' + version);
    this.dataStart = headerSize + treeSize;
    let p = headerSize;
    const str = () => { const e = buf.indexOf(0, p); const s = buf.toString('latin1', p, e); p = e + 1; return s; };
    for (;;) {
      const ext = str(); if (!ext) break;
      for (;;) {
        const dir = str(); if (!dir) break;
        for (;;) {
          const name = str(); if (!name) break;
          const preload = buf.readUInt16LE(p + 4), archive = buf.readUInt16LE(p + 6);
          const offset = buf.readUInt32LE(p + 8), length = buf.readUInt32LE(p + 12);
          p += 18; // crc, preload size, archive index, offset, length, terminator
          const rel = (dir === ' ' ? '' : dir + '/') + name + (ext === ' ' ? '' : '.' + ext);
          this.index.set(rel.toLowerCase(), { preloadAt: p, preload, archive, offset, length });
          p += preload;
        }
      }
    }
    this.dirBuf = buf;
  }

  has(rel) { this.load(); return this.index.has(rel.toLowerCase()); }

  read(rel) {
    this.load();
    const e = this.index.get(rel.toLowerCase());
    if (!e) return null;
    const pre = this.dirBuf.subarray(e.preloadAt, e.preloadAt + e.preload);
    if (!e.length) return Buffer.from(pre);
    let data;
    if (e.archive === 0x7fff) data = this.dirBuf.subarray(this.dataStart + e.offset, this.dataStart + e.offset + e.length);
    else {
      const file = `${this.prefix}_${String(e.archive).padStart(3, '0')}.vpk`;
      const fd = fs.openSync(file, 'r');
      try { data = Buffer.alloc(e.length); fs.readSync(fd, data, 0, e.length, e.offset); } finally { fs.closeSync(fd); }
    }
    return Buffer.concat([pre, data]);
  }
}

const isFile = p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } };
const isDir = p => { try { return fs.statSync(p).isDirectory(); } catch (e) { return false; } };

// The "Team Fortress 2" folder (the one holding tf/ and hl2/) from a path to
// it or to its tf folder, or null
function asGameFolder(p) {
  if (!p) return null;
  p = p.replace(/^~(?=[\\/]|$)/, os.homedir());
  if (isFile(path.join(p, 'tf', 'tf2_misc_dir.vpk'))) return p;
  if (isFile(path.join(p, 'tf2_misc_dir.vpk'))) return path.dirname(p);
  return null;
}

// Steam libraries listed in libraryfolders.vdf
function steamLibraries() {
  const steams = process.platform === 'win32'
    ? ['C:/Program Files (x86)/Steam', 'C:/Program Files/Steam']
    : [path.join(os.homedir(), '.local/share/Steam'), path.join(os.homedir(), '.steam/steam'), path.join(os.homedir(), 'Library/Application Support/Steam')];
  const out = [];
  for (const s of steams) {
    out.push(s);
    try {
      const vdf = fs.readFileSync(path.join(s, 'steamapps', 'libraryfolders.vdf'), 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) out.push(m[1].replace(/\\\\/g, '\\'));
    } catch (e) { /* no Steam here */ }
  }
  return out;
}

// Where TF2 is: the setting(s) given, then a folder above the HUD (a HUD in
// tf/custom), then the Steam libraries
function findGame(hints, hudRoot) {
  for (const h of hints || []) { const g = asGameFolder(h); if (g) return g; }
  for (let dir = hudRoot, i = 0; dir && i < 8; i++) {
    const g = asGameFolder(dir); if (g) return g;
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  for (const lib of steamLibraries()) { const g = asGameFolder(path.join(lib, 'steamapps', 'common', 'Team Fortress 2')); if (g) return g; }
  return null;
}

// The game's file system in the order the game searches it: tf, then hl2,
// loose files before VPKs. → { folder, read(rel) → Buffer | null }
const games = new Map();
function gameFiles(folder) {
  if (!folder) return null;
  if (games.has(folder)) return games.get(folder);
  const sources = [];
  for (const [sub, vpks] of [['tf', ['tf2_textures_dir.vpk', 'tf2_misc_dir.vpk']], ['hl2', ['hl2_textures_dir.vpk', 'hl2_misc_dir.vpk']]]) {
    const base = path.join(folder, sub);
    if (!isDir(base)) continue;
    sources.push(rel => { const p = path.join(base, rel); return isFile(p) ? fs.readFileSync(p) : null; });
    for (const v of vpks) {
      const p = path.join(base, v);
      if (!isFile(p)) continue;
      const vpk = new VPK(p);
      sources.push(rel => { try { return vpk.read(rel); } catch (e) { return null; } });
    }
  }
  const g = { folder, read: rel => { for (const s of sources) { const b = s(rel); if (b) return b; } return null; } };
  games.set(folder, g);
  return g;
}

module.exports = { VPK, findGame, gameFiles, asGameFolder };
