// ---------------------------------------------------------------------------
// TF2 SourceScheme Preview: a webview that draws the server browser, options
// dialog and console from the sourcescheme.res chain you are editing.
// ---------------------------------------------------------------------------
'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const HUD = require('./lib/hud.js');
const VPK = require('./lib/vpk.js');
const KV = require('./media/kv.js');
global.KV = KV;
const { Scheme } = require('./media/scheme.js');

const VIEW_TYPE = 'tf2SourceScheme.preview';
const ENGINE_URI = vscode.Uri.parse('tf2-sourcescheme:/SourceSchemeBase.res');

let engineText = '';
let current = null; // the open Preview

class Preview {
  // target: { root, entry } from HUD.findHud (entry null when the HUD has no sourcescheme.res)
  constructor(context, panel, target) {
    this.context = context;
    this.panel = panel;
    this.entry = target ? target.entry : null;
    this.hudRoot = target ? target.root : null;
    this.watched = new Set();   // lower-cased fsPaths in the #base chain
    this.sentFonts = new Map(); // abs → mtime already sent
    this.timer = null;
    this.disposables = [];
    this.ready = false;

    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    panel.webview.html = this.html(media);
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');

    panel.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.disposables);
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  html(media) {
    const w = this.panel.webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const src = f => w.asWebviewUri(vscode.Uri.joinPath(media, f));
    const scripts = ['kv.js', 'scheme.js', 'fonts.js', 'vtf.js', 'gameui_strings.js', 'preview.js', 'webview.js']
      .map(f => `<script nonce="${nonce}" src="${src(f)}"></script>`).join('\n');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${w.cspSource} data: blob:; img-src ${w.cspSource} data: blob:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${src('vgui.css')}"><link rel="stylesheet" href="${src('webview.css')}">
<title>SourceScheme Preview</title></head><body>
<div id="app"></div>
${scripts}
</body></html>`;
  }

  setEntry(target) {
    const same = (a, b) => (a && path.resolve(a).toLowerCase()) === (b && path.resolve(b).toLowerCase());
    if (!target || (same(target.entry, this.entry) && same(target.root, this.hudRoot))) return;
    this.entry = target.entry;
    this.hudRoot = target.root;
    this.sentFonts.clear();
    this.update(true);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(false), ms == null ? 120 : ms);
  }

  update(reset) {
    if (!this.ready) return;
    const post = m => this.panel.webview.postMessage(m);
    if (!this.entry) {
      // a HUD without a sourcescheme.res gets a button that creates one
      this.watched.clear();
      this.root = this.hudRoot;
      this.panel.title = 'SourceScheme Preview';
      post({ type: 'empty', hud: this.hudRoot ? path.basename(this.hudRoot) : null });
      return;
    }
    const chain = HUD.loadChain(this.entry, readText, this.hudRoot || undefined);
    this.root = chain.root;
    this.watched = new Set(chain.files.map(f => path.resolve(f.fsPath).toLowerCase()));
    const files = chain.files.concat([{ key: HUD.ENGINE_KEY, path: 'SourceSchemeBase.res (game)', fsPath: ENGINE_URI.toString(), text: engineText, virtual: true }]);
    const label = path.basename(chain.root);
    this.panel.title = `SourceScheme: ${label}`;
    post({ type: 'scheme', reset: !!reset, label, entry: chain.files[0] ? chain.files[0].key : null, engineKey: HUD.ENGINE_KEY, files });

    // the HUD's own strings (resource/chat_english.txt), which replace the game's English text
    let strings = null;
    try { strings = HUD.loadStrings(chain.root, readText); } catch (e) { console.error('[tf2-sourcescheme] reading chat_english.txt failed', e); }
    if (strings) this.watched.add(path.resolve(strings.fsPath).toLowerCase());
    post({ type: 'strings', strings });

    // the HUD's options tab layouts (resource/optionssub*.res)
    let layouts = [];
    try { layouts = HUD.loadLayouts(chain.root, readText); } catch (e) { console.error('[tf2-sourcescheme] reading optionssub*.res failed', e); }
    for (const l of layouts) for (const f of l.files) this.watched.add(path.resolve(f.fsPath).toLowerCase());
    post({ type: 'layouts', layouts });

    // fonts named in CustomFontFiles
    try {
      const map = new Map(files.map(f => [f.key, Object.assign({}, f)]));
      const scheme = new Scheme({ files: map, entry: files[0].key, engineKey: HUD.ENGINE_KEY });
      for (const ff of HUD.fontFiles(chain.root, scheme.customFontList())) {
        const mtime = fs.statSync(ff.abs).mtimeMs;
        const sent = this.sentFonts.get(ff.abs);
        if (sent && sent.mtime === mtime && ff.names.every(n => sent.names.includes(n))) continue;
        this.sentFonts.set(ff.abs, { mtime, names: ff.names.slice() });
        post({ type: 'font', path: ff.rel, names: ff.names, data: fs.readFileSync(ff.abs).toString('base64') });
      }
    } catch (e) { console.error('[tf2-sourcescheme] font loading failed', e); }
  }

  async onMessage(m) {
    if (m.type === 'ready') { this.ready = true; this.sendSettings(); this.update(true); if (this.pendingTab) { this.showTab(this.pendingTab); this.pendingTab = null; } return; }
    if (m.type === 'open') { openAt(m.fsPath, m.offset || 0); return; }
    if (m.type === 'image') {
      let data = null;
      try { const b = this.root && HUD.readImage(this.root, m.path, gameFor(this.root)); if (b) data = b.toString('base64'); } catch (e) { /* not found */ }
      this.panel.webview.postMessage({ type: 'image', path: m.path, data });
      return;
    }
    if (m.type === 'state') { this.context.workspaceState.update('tf2SourceScheme.viewState', m.state); }
    if (m.type === 'createScheme') this.createScheme();
  }

  // The empty state's button: resource/sourcescheme.res plus sourcescheme_base.res,
  // a copy of the game's own resource/sourcescheme.res (the stock TF2 scheme)
  async createScheme() {
    const root = this.hudRoot;
    if (!root || this.entry) return;
    let stock = null;
    try { const game = gameFor(root); const buf = game && game.read('resource/sourcescheme.res'); if (buf) stock = HUD.decode(buf); } catch (e) { console.error('[tf2-sourcescheme] reading the stock sourcescheme.res failed', e); }
    let made;
    try { made = HUD.createScheme(root, stock || engineText); } catch (e) { vscode.window.showErrorMessage(`Couldn't create sourcescheme.res: ${e.message}`); return; }
    this.setEntry({ root, entry: made.entry });
    await openAt(made.entry, 0);
    if (!stock) vscode.window.showWarningMessage('TF2 wasn\'t found, so sourcescheme_base.res is a copy of the game\'s SourceSchemeBase.res rather than its resource/sourcescheme.res. Set "tf2SourceScheme.teamFortress2Folder" and recreate it to copy the stock TF2 scheme.');
  }

  // Show an options tab, when its optionssub*.res is opened or edited
  showTab(tab) { if (this.ready && tab) this.panel.webview.postMessage({ type: 'showTab', tab }); }

  sendSettings() {
    const h = vscode.workspace.getConfiguration('tf2SourceScheme').get('screenHeight', 1440);
    this.panel.webview.postMessage({ type: 'settings', screenHeight: +h || 1440 });
  }

  dispose() {
    clearTimeout(this.timer);
    this.disposables.forEach(d => d.dispose());
    if (current === this) current = null;
  }
}

// The game's own files (stock materials), from the TF2 folder setting, the
// vscode-vdf extension's, a folder above the HUD, or the Steam libraries
function gameFor(root) {
  const hints = [vscode.workspace.getConfiguration('tf2SourceScheme').get('teamFortress2Folder'), vscode.workspace.getConfiguration('vscode-vdf').get('teamFortress2Folder')];
  try { return VPK.gameFiles(VPK.findGame(hints.filter(Boolean), root)); } catch (e) { console.error('[tf2-sourcescheme] finding TF2 failed', e); return null; }
}

// A file's text: the open editor's (possibly unsaved) text, or what's on disk
function readText(abs) {
  const lk = path.resolve(abs).toLowerCase();
  const doc = vscode.workspace.textDocuments.find(d => d.uri.scheme === 'file' && path.resolve(d.uri.fsPath).toLowerCase() === lk);
  return doc ? doc.getText() : HUD.decode(fs.readFileSync(abs));
}

// ---------------------------------------------------------------------------
// Border preview: one resizable panel drawn with a border from
// resource/clientscheme.res or resource/sourcescheme.res and the files it
// #bases (sourcescheme.res ending with the game's SourceSchemeBase.res).
// ---------------------------------------------------------------------------
const BORDER_VIEW = 'tf2SourceScheme.borderPreview';
let borders = null; // the open BorderPreview

class BorderPreview {
  constructor(context, panel, entry) {
    this.context = context;
    this.panel = panel;
    this.entry = entry;
    this.watched = new Set();
    this.timer = null;
    this.disposables = [];
    this.ready = false;
    this.pending = null; // [name, slot] to show once the webview is ready

    const media = vscode.Uri.joinPath(context.extensionUri, 'media');
    panel.webview.options = { enableScripts: true, localResourceRoots: [media] };
    panel.webview.html = this.html(media);
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
    panel.webview.onDidReceiveMessage(m => this.onMessage(m), null, this.disposables);
    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  html(media) {
    const w = this.panel.webview;
    const nonce = crypto.randomBytes(16).toString('base64');
    const src = f => w.asWebviewUri(vscode.Uri.joinPath(media, f));
    const scripts = ['kv.js', 'scheme.js', 'fonts.js', 'vtf.js', 'preview.js', 'borders.js']
      .map(f => `<script nonce="${nonce}" src="${src(f)}"></script>`).join('\n');
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${w.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${w.cspSource} data: blob:;">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${src('webview.css')}"><link rel="stylesheet" href="${src('borders.css')}">
<title>Border Preview</title></head><body>
<div id="app"></div>
${scripts}
</body></html>`;
  }

  setEntry(entry) {
    if (entry && this.entry && path.resolve(entry).toLowerCase() === path.resolve(this.entry).toLowerCase()) return;
    this.entry = entry;
    this.update(true);
  }

  schedule(ms) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.update(false), ms == null ? 120 : ms);
  }

  update(reset) {
    if (!this.ready) return;
    const post = m => this.panel.webview.postMessage(m);
    if (!this.entry) {
      this.watched.clear();
      this.panel.title = 'Border Preview';
      post({ type: 'empty' });
      return;
    }
    const chain = HUD.loadChain(this.entry, readText);
    this.root = chain.root;
    this.watched = new Set(chain.files.map(f => path.resolve(f.fsPath).toLowerCase()));
    const label = path.basename(chain.root), source = HUD.isSourceScheme(this.entry);
    const files = source ? chain.files.concat([{ key: HUD.ENGINE_KEY, path: 'SourceSchemeBase.res (game)', fsPath: ENGINE_URI.toString(), text: engineText, virtual: true }]) : chain.files;
    this.panel.title = `Borders: ${label}${source ? ' (SourceScheme)' : ''}`;
    post({ type: 'scheme', reset: !!reset, label, kind: source ? 'source' : 'client', entry: chain.files[0] ? chain.files[0].key : null, engineKey: source ? HUD.ENGINE_KEY : null, files,
      missing: chain.missing.map(m => ({ from: path.basename(m.from), ref: m.ref })) });
  }

  // Put a border in a slot (0 border_default, 1 border_armed, 2 border_selected)
  show(name, slot) {
    if (!name) return;
    if (!this.ready) { this.pending = [name, slot]; return; }
    this.panel.webview.postMessage({ type: 'border', name, slot: slot || 0 });
  }

  async onMessage(m) {
    if (m.type === 'ready') {
      this.ready = true; this.sendSettings(); this.update(true);
      if (this.pending) { this.show(...this.pending); this.pending = null; }
      return;
    }
    if (m.type === 'open') { openAt(m.fsPath, m.offset || 0); return; }
    if (m.type === 'image') {
      let data = null;
      try { const b = this.root && HUD.readImage(this.root, m.path, gameFor(this.root)); if (b) data = b.toString('base64'); } catch (e) { /* not found */ }
      this.panel.webview.postMessage({ type: 'image', path: m.path, data });
    }
  }

  sendSettings() {
    const h = vscode.workspace.getConfiguration('tf2SourceScheme').get('screenHeight', 1440);
    this.panel.webview.postMessage({ type: 'settings', screenHeight: +h || 1440 });
  }

  dispose() {
    clearTimeout(this.timer);
    this.disposables.forEach(d => d.dispose());
    if (borders === this) borders = null;
  }
}

// The clientscheme.res or sourcescheme.res a document belongs to (it, or a file it #bases), or null
function schemeEntryForDoc(doc) {
  if (!doc || doc.uri.scheme !== 'file' || !/\.res$/i.test(doc.uri.fsPath)) return null;
  const ws = vscode.workspace.getWorkspaceFolder(doc.uri);
  try { return HUD.schemeEntryFor(doc.uri.fsPath, ws && ws.uri.fsPath, readText); } catch (e) { return null; }
}

// Open a file (or the built-in SourceSchemeBase.res) at a character offset.
async function openAt(fsPath, offset) {
  const uri = /^tf2-sourcescheme:/.test(fsPath) ? ENGINE_URI : vscode.Uri.file(fsPath);
  const doc = await vscode.workspace.openTextDocument(uri);
  // the webview counts \n line endings; map onto the document's own text
  const text = doc.getText();
  let off = 0, seen = 0;
  while (off < text.length && seen < offset) { if (text[off] === '\r' && text[off + 1] === '\n') off++; off++; seen++; }
  const pos = doc.positionAt(off);
  const visible = vscode.window.visibleTextEditors.find(e => e.document.uri.toString() === uri.toString());
  const panelCol = [current, borders].some(p => p && p.panel.active && p.panel.viewColumn === vscode.ViewColumn.One) ? vscode.ViewColumn.Two : vscode.ViewColumn.One;
  const column = visible ? visible.viewColumn : panelCol;
  const editor = await vscode.window.showTextDocument(doc, { viewColumn: column, preserveFocus: false });
  const line = doc.lineAt(pos.line);
  editor.selection = new vscode.Selection(pos, line.range.end);
  editor.revealRange(line.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

// The HUD ({ root, entry }) of the file in an editor, or null
function entryForEditor(editor) {
  if (!editor || editor.document.uri.scheme !== 'file' || !/\.(res|vdf|txt)$/i.test(editor.document.uri.fsPath)) return null;
  const ws = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  return HUD.findHud(editor.document.uri.fsPath, ws && ws.uri.fsPath);
}

// Any HUD in the workspace: one with a sourcescheme.res, else one with an info.vdf
async function findAnyEntry() {
  const hits = await vscode.workspace.findFiles('**/[rR][eE][sS][oO][uU][rR][cC][eE]/[sS][oO][uU][rR][cC][eE][sS][cC][hH][eE][mM][eE].[rR][eE][sS]', '**/node_modules/**', 5);
  if (hits.length) return HUD.findHud(hits[0].fsPath);
  const infos = await vscode.workspace.findFiles('**/[iI][nN][fF][oO].[vV][dD][fF]', '**/node_modules/**', 5);
  return infos.length ? HUD.findHud(infos[0].fsPath) : null;
}

function activate(context) {
  engineText = fs.readFileSync(path.join(context.extensionPath, 'media', 'engine_base.res'), 'utf8');

  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('tf2-sourcescheme', {
    provideTextDocumentContent: () => engineText,
  }));

  const open = async (uri) => {
    let target = null;
    if (uri && uri.fsPath && /\.res$/i.test(uri.fsPath)) target = HUD.findHud(uri.fsPath);
    if (!target) target = entryForEditor(vscode.window.activeTextEditor) || await findAnyEntry();
    const tab = uri && uri.fsPath ? HUD.layoutTab(uri.fsPath) : vscode.window.activeTextEditor && HUD.layoutTab(vscode.window.activeTextEditor.document.uri.fsPath);
    if (current) { current.panel.reveal(vscode.ViewColumn.Beside, true); current.setEntry(target); current.showTab(tab); return; }
    const panel = vscode.window.createWebviewPanel(VIEW_TYPE, 'SourceScheme Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
    current = new Preview(context, panel, target);
    current.pendingTab = tab;
    if (!target) vscode.window.showInformationMessage('Open a HUD folder (one with an info.vdf) to preview its sourcescheme.res.');
  };

  context.subscriptions.push(vscode.commands.registerCommand('tf2SourceScheme.openPreview', open));

  // Border preview: the editor title button, and the CodeLens above each border
  const openBorders = async (uri, name, slot) => {
    let entry = null;
    const editor = vscode.window.activeTextEditor;
    if (typeof uri === 'string') uri = vscode.Uri.file(uri);
    if (uri && uri.fsPath) {
      const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === uri.toString());
      entry = doc ? schemeEntryForDoc(doc) : HUD.schemeEntryFor(uri.fsPath, null, readText);
    }
    if (!entry && editor) entry = schemeEntryForDoc(editor.document);
    if (!entry) {
      const hits = await vscode.workspace.findFiles('**/[rR][eE][sS][oO][uU][rR][cC][eE]/[cC][lL][iI][eE][nN][tT][sS][cC][hH][eE][mM][eE].[rR][eE][sS]', '**/node_modules/**', 1);
      entry = hits.length ? hits[0].fsPath : null;
    }
    if (borders) { borders.panel.reveal(vscode.ViewColumn.Beside, true); borders.setEntry(entry); borders.show(name, slot); return; }
    const panel = vscode.window.createWebviewPanel(BORDER_VIEW, 'Border Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true });
    borders = new BorderPreview(context, panel, entry);
    borders.show(name, slot);
    if (!entry) vscode.window.showInformationMessage('Open a HUD folder that contains resource/clientscheme.res or sourcescheme.res to preview its borders.');
  };
  context.subscriptions.push(vscode.commands.registerCommand('tf2SourceScheme.openBorderPreview', uri => openBorders(uri)));
  context.subscriptions.push(vscode.commands.registerCommand('tf2SourceScheme.previewBorder', (fsPath, name, slot) => openBorders(fsPath, name, slot)));
  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(BORDER_VIEW, {
    async deserializeWebviewPanel(panel) {
      const editor = vscode.window.activeTextEditor;
      let entry = editor ? schemeEntryForDoc(editor.document) : null;
      if (!entry) {
        const hits = await vscode.workspace.findFiles('**/[rR][eE][sS][oO][uU][rR][cC][eE]/[cC][lL][iI][eE][nN][tT][sS][cC][hH][eE][mM][eE].[rR][eE][sS]', '**/node_modules/**', 1);
        entry = hits.length ? hits[0].fsPath : null;
      }
      borders = new BorderPreview(context, panel, entry);
    },
  }));
  const lensEmitter = new vscode.EventEmitter();
  context.subscriptions.push(lensEmitter, vscode.languages.registerCodeLensProvider({ scheme: 'file', pattern: '**/*.[rR][eE][sS]' }, {
    onDidChangeCodeLenses: lensEmitter.event,
    provideCodeLenses(doc) {
      if (!schemeEntryForDoc(doc)) return [];
      // Armed and Selected also turn Button borders on
      const links = [['Preview', 0], ['Armed', 1], ['Selected', 2]];
      const tips = ['Show this border (border_default)', 'Use this border for border_armed (hover)', 'Use this border for border_selected (pressed)'];
      return HUD.bordersIn(doc.getText()).flatMap(b => {
        const pos = doc.positionAt(b.start), range = new vscode.Range(pos, pos);
        return links.map(([title, slot]) => new vscode.CodeLens(range, { title, tooltip: tips[slot], command: 'tf2SourceScheme.previewBorder', arguments: [doc.uri.fsPath, b.name, slot] }));
      });
    },
  }));
  // shows the title bar button on clientscheme.res, sourcescheme.res and the files they #base
  let ctxTimer = 0;
  const updateContext = () => {
    clearTimeout(ctxTimer);
    ctxTimer = setTimeout(() => {
      const ed = vscode.window.activeTextEditor;
      vscode.commands.executeCommand('setContext', 'tf2SchemeFile', !!(ed && schemeEntryForDoc(ed.document)));
    }, 50);
  };
  updateContext();
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    updateContext();
    if (!borders || !editor) return;
    const entry = schemeEntryForDoc(editor.document);
    if (entry) borders.setEntry(entry);
  }));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => { updateContext(); lensEmitter.fire(); }));
  // right-click menu in the preview (package.json "webview/context")
  const toPreview = m => () => { if (current) current.panel.webview.postMessage(m); };
  for (const [cmd, m] of [
    ['tf2SourceScheme.zoomIn', { type: 'zoom', op: 'in' }],
    ['tf2SourceScheme.zoomOut', { type: 'zoom', op: 'out' }],
    ['tf2SourceScheme.zoomFit', { type: 'zoom', op: 'fit' }],
    ['tf2SourceScheme.zoomReset', { type: 'zoom', op: 'reset' }],
    ['tf2SourceScheme.resetWindowSize', { type: 'resetSize' }],
  ]) context.subscriptions.push(vscode.commands.registerCommand(cmd, toPreview(m)));

  context.subscriptions.push(vscode.window.registerWebviewPanelSerializer(VIEW_TYPE, {
    async deserializeWebviewPanel(panel) {
      const target = entryForEditor(vscode.window.activeTextEditor) || await findAnyEntry();
      current = new Preview(context, panel, target);
    },
  }));

  // live updates
  const previews = () => [current, borders].filter(Boolean);
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
    const lk = path.resolve(e.document.uri.fsPath).toLowerCase();
    for (const p of previews()) if (p.watched.has(lk)) p.schedule(120);
    // typing in an optionssub*.res shows its tab
    const ed = vscode.window.activeTextEditor;
    if (current && ed && ed.document === e.document && e.contentChanges.length && current.watched.has(lk)) current.showTab(HUD.layoutTab(lk));
  }));
  context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(d => {
    // closing without saving reverts to what's on disk
    const lk = path.resolve(d.uri.fsPath).toLowerCase();
    for (const p of previews()) if (p.watched.has(lk)) p.schedule(50);
  }));
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{res,RES,ttf,otf,TTF,OTF,txt,TXT}');
  const onDisk = uri => {
    const lk = path.resolve(uri.fsPath).toLowerCase();
    for (const p of previews()) if (p.root && lk.startsWith(path.resolve(p.root).toLowerCase())) p.schedule(200);
  };
  watcher.onDidChange(onDisk); watcher.onDidCreate(onDisk); watcher.onDidDelete(onDisk);
  context.subscriptions.push(watcher);

  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
    if (e.affectsConfiguration('tf2SourceScheme.screenHeight')) for (const p of previews()) p.sendSettings();
  }));

  // follow the HUD of the .res file you're editing
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
    if (!current) return;
    const target = entryForEditor(editor);
    if (target) current.setEntry(target);
    if (editor && editor.document.uri.scheme === 'file') current.showTab(HUD.layoutTab(editor.document.uri.fsPath));
  }));
}

function deactivate() { if (current) current.panel.dispose(); if (borders) borders.panel.dispose(); }

module.exports = { activate, deactivate };
