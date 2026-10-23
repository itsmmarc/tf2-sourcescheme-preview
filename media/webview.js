// ---------------------------------------------------------------------------
// Webview: draws the mock dialogs from the scheme the extension sends, and
// lists every setting, font and border behind the element you click.
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const { Scheme, rgbaCss, isNonColorSetting } = window.SchemeLib;
  const GAME_FONTS = ['tf2', 'tf2 build', 'tf2 secondary', 'tf2 professor', 'halflife2', 'hl2ep2', 'marlett'];
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rgbaStr = c => c.join(' ');

  const saved = vscode.getState() || {};
  const S = {
    scheme: null, files: null, label: '', pinned: saved.pinned || null, lastPoint: null,
    view: saved.view || 'browser', zoom: saved.zoom || 'fit', focused: saved.focused !== false,
    images: new Map(), sizes: saved.sizes || {},
  };
  const persist = () => vscode.setState({ pinned: S.pinned, view: S.view, zoom: S.zoom, focused: S.focused, sizes: S.sizes });

  // ---------- layout ----------
  $('#app').innerHTML = `
    <header class="bar">
      <div class="seg" id="views" role="group" aria-label="Dialog">
        <button data-v="browser">Server browser</button><button data-v="options">Options</button><button data-v="console">Console</button>
      </div>
      <label class="tog"><input type="checkbox" id="t-focus"> Window focused</label>
      <span class="grow"></span>
      <label class="lbl" for="t-zoom">Zoom</label>
      <select id="t-zoom"><option value="fit">Fit</option><option value="0.5">50%</option><option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option><option value="2">200%</option></select>
    </header>
    <main class="main">
      <section class="stagewrap" id="stagewrap"><div class="pv" id="pv"></div></section><div class="tag" id="tag" hidden></div>
      <aside class="side" id="side" aria-label="Settings for the selected element"></aside>
    </main>`;

  const preview = new window.Preview($('#pv'), {
    pick: (el, x, y) => { S.pinned = { c: el.dataset.c, n: el.dataset.n || '', f: el.dataset.f || '', tok: el.dataset.tok || '' }; S.lastPoint = [x, y]; persist(); markPicked(); renderSide(); },
    // while a window edge is being dragged, hold the zoom still so the edge stays under the pointer
    rendered: () => { markPicked(); if (S.zoom === 'fit' && !preview.resizing) applyZoom(); },
    resized: sizes => { S.sizes = sizes; persist(); if (S.zoom === 'fit') applyZoom(); },
    zoom: () => parseFloat($('#pv').style.zoom) || 1,
    imageFor,
  });
  preview.state.view = S.view; preview.state.focused = S.focused; preview.state.size = S.sizes;

  // ---------- messages from the extension ----------
  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'scheme') loadScheme(m);
    else if (m.type === 'font') loadFont(m);
    else if (m.type === 'image') loadImage(m);
    else if (m.type === 'empty') showEmpty();
    else if (m.type === 'strings') { S.strings = m.strings; preview.setStrings(m.strings); if (S.scheme) { preview.render(); renderSide(); } }
    else if (m.type === 'zoom') zoomCommand(m.op);
    else if (m.type === 'resetSize') { S.sizes = preview.resetSize(); persist(); if (S.zoom === 'fit') applyZoom(); }
    else if (m.type === 'settings') { preview.setScreen(m.screenHeight); if (S.scheme) { preview.setScheme(S.scheme, {}); preview.render(); renderSide(); } }
  });

  function loadScheme(m) {
    const files = new Map();
    for (const f of m.files) files.set(f.key, { key: f.key, path: f.path, fsPath: f.fsPath, text: f.text, virtual: !!f.virtual, readOnly: !!f.virtual });
    S.files = files; S.label = m.label;
    S.scheme = new Scheme({ files, entry: m.entry, engineKey: m.engineKey });
    $('.main').hidden = false;
    const empty = $('#empty'); if (empty) empty.remove();
    if (preview.setScheme(S.scheme, {}) || !preview.stage.firstChild || m.reset) preview.render();
    renderSide();
  }

  async function loadFont(m) {
    const bin = atob(m.data), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    await window.Fonts.registerFile(m.path, buf.buffer, m.names || []);
    refresh();
  }

  function imageFor(p) {
    const k = (p || '').toLowerCase();
    if (!k) return null;
    if (!S.images.has(k)) { S.images.set(k, null); vscode.postMessage({ type: 'image', path: p }); }
    return S.images.get(k);
  }
  function loadImage(m) {
    if (!m.data) return;
    try {
      const bin = atob(m.data), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      S.images.set(m.path.toLowerCase(), window.VTF.decode(buf.buffer));
      refresh();
    } catch (e) { /* unreadable texture: keep the dashed placeholder */ }
  }

  let refreshTimer = 0;
  function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { if (!S.scheme) return; if (preview.setScheme(S.scheme, {})) preview.render(); renderSide(); }, 30);
  }

  function showEmpty() {
    $('.main').hidden = true;
    if (!$('#empty')) $('#app').insertAdjacentHTML('beforeend', `<div class="emptystate" id="empty"><strong>No sourcescheme.res found</strong><p>Open a .res file inside a HUD folder (one that contains resource/sourcescheme.res), then run "TF2: Open SourceScheme Preview".</p></div>`);
  }

  // ---------- toolbar ----------
  function syncBar() {
    document.querySelectorAll('#views button').forEach(b => { b.classList.toggle('on', b.dataset.v === preview.state.view); b.setAttribute('aria-pressed', b.dataset.v === preview.state.view); });
    $('#t-focus').checked = preview.state.focused;
    const sel = $('#t-zoom');
    let opt = [...sel.options].find(o => o.value === String(S.zoom));
    sel.querySelectorAll('option.custom').forEach(o => { if (o !== opt) o.remove(); });
    if (!opt) { opt = new Option(Math.round(S.zoom * 100) + '%', String(S.zoom)); opt.className = 'custom'; sel.add(opt, 1); }
    sel.value = String(S.zoom);
    $('#stagewrap').classList.toggle('fit', S.zoom === 'fit');
    applyZoom();
  }
  $('#views').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    S.view = b.dataset.v; preview.setView(S.view); persist(); syncBar();
  });
  $('#t-focus').onchange = e => { S.focused = preview.state.focused = e.target.checked; preview.render(); persist(); };
  $('#t-zoom').onchange = e => { S.zoom = e.target.value === 'fit' ? 'fit' : +e.target.value; persist(); syncBar(); };
  // "Fit" scales the dialog to fit the panel (never above 100%). Measure at 100%
  // so the result doesn't depend on the zoom that was applied before.
  function applyZoom() {
    const pv = $('#pv');
    if (S.zoom !== 'fit') { pv.style.zoom = S.zoom; return; }
    const frame = preview.stage.querySelector('.vg-frame');
    if (!frame) return;
    const wrap = $('#stagewrap');
    // the frame's own size is set inline in pixels, so it's the same at any zoom; .pv adds 28px padding per side
    const natW = parseFloat(frame.style.width) + 56, natH = parseFloat(frame.style.height) + 56;
    const z = Math.min(1, Math.max(0.2, Math.min(wrap.clientWidth / natW, wrap.clientHeight / natH)));
    if (Math.abs(z - (parseFloat(pv.style.zoom) || 1)) > 0.001) pv.style.zoom = z;
  }
  new ResizeObserver(() => { if (S.zoom === 'fit') applyZoom(); }).observe($('#stagewrap'));

  // Zoom to z1, keeping the point under (clientX, clientY) still
  function zoomAround(z1, clientX, clientY) {
    const wrap = $('#stagewrap'), pv = $('#pv');
    const z0 = parseFloat(pv.style.zoom) || 1;
    z1 = Math.round(Math.max(0.25, Math.min(4, z1)) * 100) / 100;
    if (z1 === z0 && S.zoom !== 'fit') return;
    const r = wrap.getBoundingClientRect();
    if (clientX == null) { clientX = r.left + r.width / 2; clientY = r.top + r.height / 2; }
    const mx = clientX - r.left, my = clientY - r.top;
    const cx = (wrap.scrollLeft + mx) / z0, cy = (wrap.scrollTop + my) / z0;
    S.zoom = z1; persist(); syncBar();
    wrap.scrollLeft = cx * z1 - mx; wrap.scrollTop = cy * z1 - my;
  }
  // Ctrl + scroll (or a trackpad pinch) zooms around the pointer
  $('#stagewrap').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const z0 = parseFloat($('#pv').style.zoom) || 1;
    const step = Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002);
    zoomAround(z0 * step, e.clientX, e.clientY);
  }, { passive: false });
  // Zoom In / Zoom Out / Zoom to Fit / Actual Size from the right-click menu,
  // around the point that was right-clicked
  const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  let menuAt = null;
  document.addEventListener('contextmenu', e => { menuAt = $('#stagewrap').contains(e.target) ? [e.clientX, e.clientY] : null; }, true);
  function zoomCommand(op) {
    const at = menuAt || [];
    if (op === 'fit') { S.zoom = 'fit'; persist(); syncBar(); return; }
    if (op === 'reset') { zoomAround(1, at[0], at[1]); return; }
    const z0 = parseFloat($('#pv').style.zoom) || 1;
    const z1 = op === 'in' ? ZOOMS.find(v => v > z0 + 0.005) : ZOOMS.slice().reverse().find(v => v < z0 - 0.005);
    if (z1) zoomAround(z1, at[0], at[1]);
  }
  syncBar();

  // ---------- hover label + selection outline ----------
  let hovered = null;
  $('#pv').addEventListener('mousemove', e => {
    const el = e.target.closest('[data-c]');
    if (el !== hovered) {
      if (hovered) hovered.classList.remove('pv-hl');
      hovered = el;
      if (el) el.classList.add('pv-hl');
    }
    const tag = $('#tag');
    if (!el) { tag.hidden = true; return; }
    tag.textContent = el.dataset.n || '';
    tag.hidden = false;
    const tw = tag.offsetWidth, th = tag.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + tw > window.innerWidth - 4) x = Math.max(4, e.clientX - tw - 10);
    if (y + th > window.innerHeight - 4) y = Math.max(4, e.clientY - th - 10);
    tag.style.left = x + 'px'; tag.style.top = y + 'px';
  });
  $('#pv').addEventListener('mouseleave', () => { if (hovered) hovered.classList.remove('pv-hl'); hovered = null; $('#tag').hidden = true; });

  // Outline the picked element. Several elements can share a name (every
  // unselected server row is "Server row"), so prefer the one at the point
  // that was clicked, then the first with that name.
  function markPicked() {
    preview.stage.querySelectorAll('.pv-sel').forEach(e => e.classList.remove('pv-sel'));
    if (!S.pinned) return;
    const same = e => e && e.dataset.c === S.pinned.c && (e.dataset.n || '') === S.pinned.n;
    let el = null;
    if (S.lastPoint) {
      const hit = document.elementFromPoint(S.lastPoint[0], S.lastPoint[1]);
      const c = hit && preview.stage.contains(hit) ? hit.closest('[data-c]') : null;
      if (same(c)) el = c;
    }
    if (!el) el = [...preview.stage.querySelectorAll('[data-c]')].find(same);
    if (el) el.classList.add('pv-sel');
  }

  // ---------- sidebar ----------
  const fileOf = node => node && node.file;
  function defLink(node, label, cls) {
    const f = fileOf(node);
    if (!f || node.keyS == null) return `<span class="${cls || ''}">${esc(label)}</span>`;
    return `<a href="#" class="def ${cls || ''}" data-file="${esc(f.fsPath)}" data-off="${node.keyS}" title="Go to definition">${esc(label)}</a>`;
  }
  function loc(node) {
    const f = fileOf(node);
    if (!f || node.keyS == null) return '';
    const name = f.virtual ? 'SourceSchemeBase.res' : f.path.split('/').pop();
    return `<a href="#" class="loc ${f.virtual ? 'game' : ''}" data-file="${esc(f.fsPath)}" data-off="${node.keyS}" title="${esc(f.virtual ? 'The game\'s own SourceSchemeBase.res' : f.path)}">${esc(name)}:${window.KV.lineNo(f.text, node.keyS)}</a>`;
  }
  const sw = c => `<span class="sw" title="${c ? esc(rgbaStr(c)) : ''}"><i style="background:${c ? rgbaCss(c) : 'transparent'}"></i></span>`;

  function colorRow(it) {
    const sc = S.scheme, e = sc.base.get(it.key.toLowerCase());
    const rgba = preview.color(it.key, it.fallback);
    let detail;
    if (!e || e.block) {
      detail = `<span class="muted">Not set. ${typeof it.fallback === 'string' ? `Uses ${esc(it.fallback)}` : 'Uses the built-in default'}, ${esc(rgbaStr(rgba))}</span>`;
    } else {
      const r = sc.resolve(e.value);
      const steps = r.chain.map(c => defLink(c.entry.node, c.name));
      if (r.ok) {
        detail = steps.length ? `${steps.join(' <span class="arrow">→</span> ')} <span class="arrow">→</span> <code>${esc(rgbaStr(r.rgba))}</code>` : `<code>${esc(e.value)}</code>`;
      } else {
        detail = `${steps.length ? steps.join(' <span class="arrow">→</span> ') + ' <span class="arrow">→</span> ' : ''}<span class="bad">"${esc(r.missing || e.value)}" isn't defined</span><span class="muted">, so the game uses ${typeof it.fallback === 'string' ? esc(it.fallback) : 'the built-in default'} (${esc(rgbaStr(rgba))})</span>`;
      }
    }
    return `<div class="item">${sw(rgba)}<div class="body"><div class="role"><b>${esc(it.role)}</b>${e && !e.block ? loc(e.node) : ''}</div>
      <div class="key">${e && !e.block ? defLink(e.node, it.key) : esc(it.key)}</div><div class="val">${detail}</div></div></div>`;
  }

  // Text and icon colors, background colors, then everything else
  const TEXTISH = /(TextColor\d?|TextDullColor|TextBrightColor|DisabledFgColor\d|DevTextColor|Button\.FgColor|ArmedFgColor|DepressedFgColor|DisabledFgColor|ArrowColor|ArmedArrowColor)$/i;
  const BGISH = /(BgColor|BGColor|TrackColor)$/i;
  function colorGroup(it) {
    if (/^(ScrollBarSlider\.FgColor|CheckButton\.DisabledFgColor)$/i.test(it.key)) return 2;
    if (TEXTISH.test(it.key) || /^FrameTitleButton\.(Disabled)?FgColor$/i.test(it.key)) return 0;
    if (BGISH.test(it.key)) return 1;
    return 2;
  }
  function colorGroups(colors) {
    const groups = [[], [], []];
    for (const c of colors) groups[colorGroup(c)].push(c);
    const titles = ['Text colors', 'Background colors', 'Other colors'];
    return groups.map((g, i) => g.length ? `<section class="cgroup"><h3>${titles[i]}</h3>${g.map(colorRow).join('')}</section>` : '').join('');
  }

  function valueRow(it) {
    const e = S.scheme.base.get(it.key.toLowerCase());
    return `<div class="item"><span class="sw num">#</span><div class="body"><div class="role"><b>${esc(it.role)}</b>${e && !e.block ? loc(e.node) : ''}</div>
      <div class="key">${e && !e.block ? defLink(e.node, it.key) : esc(it.key)}</div>
      <div class="val">${e && !e.block ? `<code>${esc(e.value)}</code>` : '<span class="muted">Not set</span>'}</div></div></div>`;
  }

  // Where an element's text comes from: the HUD's chat_english.txt, or the game's English strings
  function stringRow(it) {
    const st = S.strings, t = st && st.tokens ? st.tokens[it.key.toLowerCase()] : null;
    const stock = window.Preview.stockString(it.key);
    const file = st ? st.rel.split('/').pop() : 'chat_english.txt';
    const link = t ? `<a href="#" class="def" data-file="${esc(st.fsPath)}" data-off="${t.off}" title="Go to definition">#${esc(t.key)}</a>` : `#${esc(it.key)}`;
    const loc = t ? `<a href="#" class="loc" data-file="${esc(st.fsPath)}" data-off="${t.off}" title="${esc(st.rel)}">${esc(file)}:${t.line}</a>` : '';
    const status = window.Preview.tokStatus(it.key);
    const where = /^ServerBrowser_/i.test(it.key) ? 'server browser' : 'console';
    let val;
    if (status === 'fixed') val = t
      ? `<code>"${esc(stock)}"</code> <span class="bad">Your chat_english.txt sets this to "${esc(t.value)}", but TF2 doesn't apply chat_english.txt to ${where} strings, so the game keeps its own text.</span>`
      : `<code>"${esc(stock)}"</code> <span class="muted">is the game's English text. TF2 doesn't apply chat_english.txt to ${where} strings, so a HUD can't change it this way.</span>`;
    else val = (t ? `<code>"${esc(t.value)}"</code> <span class="muted">replaces the game's "${esc(stock)}"</span>`
      : `<code>"${esc(stock)}"</code> <span class="muted">is the game's English text. Add "${esc(it.key)}" to the Tokens in resource/chat_english.txt to change it.</span>`);
    return `<div class="item"><span class="sw num">T</span><div class="body"><div class="role"><b>${esc(it.role)}</b>${loc}</div>
      <div class="key">${link}</div><div class="val">${val}</div></div></div>`;
  }

  function fontStatus(name) {
    const st = window.Fonts.status(name);
    if (st !== 'missing') return st;
    return GAME_FONTS.includes((name || '').toLowerCase()) ? 'game' : 'missing';
  }

  function fontBlock(name, role) {
    const sc = S.scheme, m = sc.fonts.get(name.toLowerCase());
    if (!m || !m.block) return `<div class="item"><span class="sw num">Aa</span><div class="body"><div class="role"><b>${esc(role)}</b></div><div class="key">${esc(name)}</div><div class="val bad">Not defined in any file, so the game falls back to its own default font</div></div></div>`;
    const ft = sc.font(name, preview.yres);
    const P = k => { const c = ft.entry.children.get(k); return c && !c.block ? c : null; };
    const st = fontStatus(ft.name);
    const stText = { hud: 'Loaded from your HUD', system: 'Installed on this computer', game: 'Ships with TF2; preview substitutes it', missing: 'Not found; preview substitutes it' }[st];
    const flags = ['antialias', 'outline', 'dropshadow', 'italic', 'underline', 'strikeout', 'additive', 'symbol', 'blur', 'scanlines']
      .map(k => P(k)).filter(c => c && +c.value).map(c => defLink(c.node, c.key));
    const prop = (k, label) => { const c = P(k); return c ? `<span class="kv"><span class="muted">${label}</span> ${defLink(c.node, c.value)}</span>` : ''; };
    const entries = sc.fontEntries(name).length;
    return `<div class="item font"><span class="sw num">Aa</span><div class="body">
      <div class="role"><b>${esc(role)}</b>${loc(m.node)}</div>
      <div class="key">${defLink(m.node, m.key)}${entries > 1 ? ` <span class="muted">entry ${esc(ft.entryKey)} of ${entries}</span>` : ''}</div>
      <div class="val">${prop('name', 'name')} ${prop('tall', 'tall')} ${prop('weight', 'weight')}${flags.length ? ` <span class="kv"><span class="muted">flags</span> ${flags.join(', ')}</span>` : ''}</div>
      <div class="sample" style="${esc(preview.fontCss(ft))}">The quick brown fox 0123456789</div>
      <div class="val"><span class="st ${st}">${stText}</span></div></div></div>`;
  }

  function borderBlock(name, role) {
    const sc = S.scheme, { m, via } = sc.borderEntry(name);
    if (!m) {
      const alias = via.length ? via.map(v => defLink(v.node, v.key)).join(' → ') + ' → ' : '';
      return `<div class="item"><span class="sw num">▢</span><div class="body"><div class="role"><b>${esc(role)}</b>${via[0] ? loc(via[0].node) : ''}</div><div class="key">${alias}${esc(via.length ? via[via.length - 1].value : name)}</div><div class="val muted">Not defined, so no border is drawn</div></div></div>`;
    }
    const b = sc.border(name);
    const chain = via.map(v => defLink(v.node, v.key)).concat(defLink(m.node, m.key)).join(' <span class="arrow">→</span> ');
    let detail = '';
    if (b.kind === 'image') detail = `<div class="val"><span class="muted">image</span> <code>${esc(b.image)}</code>${S.images.get((b.image || '').toLowerCase()) ? '' : ' <span class="muted">(texture not found in the HUD folder)</span>'}</div>`;
    if (b.kind === 'image' && b.color) { const r = sc.resolve(b.color); detail += `<div class="val"><span class="line">${sw(r.ok ? r.rgba : null)}<span class="muted">color</span> <code>${esc(b.color)}</code>${r.ok ? '' : ' <span class="bad">undefined, so the image isn\'t tinted</span>'}</span></div>`; }
    else {
      const sides = ['left', 'top', 'right', 'bottom'].map(side => {
        const lines = b.sides[side] || [];
        if (!lines.length) return '';
        return `<div class="bside"><span class="muted">${side}</span>${lines.map(l => `<span class="line">${sw(l.rgba)}${defLink(l.entry.node, l.ref)}${l.ok ? '' : ' <span class="bad">undefined</span>'}${l.start || l.end ? ` <span class="muted">offset ${l.start} ${l.end}</span>` : ''}</span>`).join('')}</div>`;
      }).join('');
      detail = (sides ? `<div class="sides">${sides}</div>` : '<div class="val muted">No lines</div>') + (b.backgroundtype === 2 ? '<div class="val muted">backgroundtype 2: rounded corners</div>' : '');
    }
    if (b.inset.some(v => v)) detail += `<div class="val muted">inset ${b.inset.join(' ')}: moves the text in, the lines stay put</div>`;
    return `<div class="item"><span class="sw num">▢</span><div class="body"><div class="role"><b>${esc(role)}</b>${loc((via[0] || m).node)}</div><div class="key">${chain}</div>${detail}</div></div>`;
  }

  function renderSide() {
    const side = $('#side');
    if (!S.scheme) { side.innerHTML = ''; return; }
    const top = side.scrollTop;
    if (!S.pinned) { side.innerHTML = overview(); side.scrollTop = top; return; }
    const d = preview.describe({ dataset: S.pinned });
    if (!d) { S.pinned = null; side.innerHTML = overview(); return; }
    const colors = d.items.filter(i => i.kind === 'color'), values = d.items.filter(i => i.kind === 'value');
    const fonts = d.items.filter(i => i.kind === 'font').filter((f, i, a) => a.findIndex(x => x.key === f.key) === i);
    const borders = d.items.filter(i => i.kind === 'border');
    const strings = d.items.filter(i => i.kind === 'string');
    side.innerHTML = `<div class="head"><div><span class="eyebrow">${esc(d.controlName)}</span><h2>${esc(d.name)}</h2></div>
        <button class="btn" id="unpin" title="Back to the overview (Esc)">Clear</button></div>
      ${d.note ? `<p class="note">${esc(d.note)}</p>` : ''}
      ${colorGroups(colors)}
      ${fonts.length ? `<h3>Font</h3>${fonts.map(f => fontBlock(f.key, f.role)).join('')}` : ''}
      ${borders.length ? `<h3>Borders</h3>${borders.map(b => borderBlock(b.key, b.role)).join('')}` : ''}
      ${values.length ? `<h3>Other settings</h3>${values.map(valueRow).join('')}` : ''}
      ${strings.length ? `<h3>Text</h3>${strings.map(stringRow).join('')}` : ''}`;
    side.scrollTop = top;
  }

  function overview() {
    const sc = S.scheme;
    const chain = sc.chain.order.map(k => {
      const f = S.files.get(k);
      return `<li><a href="#" class="def" data-file="${esc(f.fsPath)}" data-off="0">${esc(f.virtual ? 'SourceSchemeBase.res (game)' : f.path)}</a></li>`;
    }).join('') + sc.chain.missing.map(m => `<li class="bad">${esc(m.ref)} <span class="muted">not found</span></li>`).join('');
    const probs = sc.problems({ yres: preview.yres, fontStatus }).filter(p => p.level === 'error' || /font/i.test(p.msg));
    const probHtml = probs.map(p => {
      const f = S.files.get(p.file);
      return `<li class="${p.level}"><a href="#" class="def" data-file="${esc(f ? f.fsPath : '')}" data-off="${p.at || 0}">${esc(p.msg)}</a> <span class="muted">${esc(f ? (f.virtual ? 'SourceSchemeBase.res' : f.path.split('/').pop()) : '')}:${f ? window.KV.lineNo(f.text, p.at || 0) : ''}</span></li>`;
    }).join('');
    return `<div class="head"><div><span class="eyebrow">SourceScheme preview</span><h2>${esc(S.label)}</h2></div></div>
      <p class="note">Click anything in the preview to see every color, font and border that draws it. Click a name to jump to where it's defined.</p>
      <h3>#base chain</h3><ol class="chain">${chain}</ol>
      ${probHtml ? `<h3>Problems <span class="count">${probs.length}</span></h3><ul class="probs">${probHtml}</ul>` : ''}`;
  }

  $('#side').addEventListener('click', e => {
    if (e.target.closest('#unpin')) { S.pinned = null; persist(); markPicked(); renderSide(); return; }
    const a = e.target.closest('[data-file]');
    if (a) { e.preventDefault(); if (a.dataset.file) vscode.postMessage({ type: 'open', fsPath: a.dataset.file, offset: +a.dataset.off || 0 }); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && S.pinned && !e.target.closest('input')) { S.pinned = null; persist(); markPicked(); renderSide(); }
  });

  vscode.postMessage({ type: 'ready' });
})();
