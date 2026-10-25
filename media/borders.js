// ---------------------------------------------------------------------------
// ClientScheme border preview: a panel drawn with borders from
// resource/clientscheme.res and the files it #bases. By default it shows one
// border. With slots on, three slots stand for a button's border keys:
// hovering the panel shows the armed one and pressing it the selected one,
// the way TF2's CExButton picks its border.
// ---------------------------------------------------------------------------
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const { Scheme, rgbaCss } = window.SchemeLib;
  const Preview = window.Preview;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // CExButton::GetBorder (econ_controls.cpp): while the mouse is held the button
  // is selected and draws border_selected; hovered, it's armed and draws
  // border_armed; a key that isn't set falls back to border_default, then to
  // the Button's own scheme border.
  const SLOTS = [
    { key: 'border_default', state: 'default', label: 'Default' },
    { key: 'border_armed', state: 'armed', label: 'Hover (armed)' },
    { key: 'border_selected', state: 'pressed', label: 'Pressed (selected)' },
  ];
  const STATES = {
    default: { slots: [0], fallback: 'ButtonBorder' },
    armed: { slots: [1, 0], fallback: 'ButtonBorder' },
    pressed: { slots: [2, 0], fallback: 'ButtonDepressedBorder' },
  };
  const DEFAULT_SIZE = [120, 40];
  const ZOOMS = [0.5, 1, 1.5, 2, 3, 4, 6, 8];

  const saved = vscode.getState() || {};
  const S = {
    scheme: null, files: null, label: '', missing: [], yres: 1440, images: new Map(),
    slots: Array.isArray(saved.slots) ? saved.slots.slice(0, 3) : ['', '', ''],
    slotsOn: !!saved.slotsOn,
    target: saved.target != null ? saved.target : 0,
    size: Array.isArray(saved.size) ? saved.size : DEFAULT_SIZE.slice(),
    zoom: saved.zoom || 1, bg: saved.bg || '', showInset: !!saved.showInset,
    hover: false, down: false,
  };
  while (S.slots.length < 3) S.slots.push('');
  const persist = () => vscode.setState({ slots: S.slots, slotsOn: S.slotsOn, target: S.target, size: S.size, zoom: S.zoom, bg: S.bg, showInset: S.showInset });
  const scale = () => S.yres / 480; // HUD panels are laid out on the 480-line proportional base
  const hpx = v => Math.floor(v * scale() + 1e-6);

  // ---------- layout ----------
  const comboHtml = (id, label, placeholder) => `
    <div class="combo" role="combobox" aria-haspopup="listbox" aria-expanded="false">
      <input class="cin" id="${id}" spellcheck="false" autocomplete="off" placeholder="${placeholder}" aria-label="${label}" aria-autocomplete="list" aria-controls="${id}-list">
      <button class="carr" tabindex="-1" aria-label="Show all">▾</button>
      <ul class="clist" id="${id}-list" role="listbox" hidden></ul>
    </div>`;
  $('#app').innerHTML = `
    <header class="bar">
      <label class="tog" title="Preview a button's default, hover and pressed borders"><input type="checkbox" id="t-slots"> Button borders</label>
      <label class="tog" title="Outline the area the panel's contents paint in: the panel less the border's inset"><input type="checkbox" id="t-inset"> Show inset</label>
      <label class="lbl" for="t-bg">bgcolor</label>
      <div class="bgcombo" title="The panel's background: a color from your scheme, or R G B A">${comboHtml('t-bg', 'bgcolor: type to search colors, or enter R G B A', 'none')}</div>
      <div class="sizes">
        <label><span class="lbl">wide</span> <input class="num" type="number" id="t-wide" min="1" step="1" title="The panel's wide, in HUD units"></label>
        <label><span class="lbl">tall</span> <input class="num" type="number" id="t-tall" min="1" step="1" title="The panel's tall, in HUD units"></label>
        <span class="muted" id="pxsize"></span>
      </div>
      <span class="grow"></span>
      <label class="lbl" for="t-zoom">Zoom</label>
      <select id="t-zoom">${ZOOMS.map(z => `<option value="${z}">${z * 100}%</option>`).join('')}</select>
    </header>
    <main class="main">
      <section class="stagewrap" id="stagewrap">
        <div class="bstage" id="stage">
          <div class="bpanel" id="panel"><div class="binset" id="insetbox" hidden></div><div class="bgrip" id="grip" title="Drag to resize. Double-click to reset."></div></div>
        </div>
      </section>
      <aside class="side" id="side" aria-label="Border preview settings">
        <div class="head"><div><span class="eyebrow">ClientScheme borders</span><h2 id="hud"></h2></div></div>
        <h3 id="slotshead">Border</h3>
        ${SLOTS.map((s, i) => `
        <div class="slotcard" data-i="${i}">
          <div class="role"><b><span class="dot" aria-hidden="true"></span><span class="sname">${s.label}</span></b><span class="sloc"></span></div>
          <div class="key skey"><code class="muted">${s.key}</code></div>
          ${comboHtml('cin' + i, s.key + ': type to search borders', 'Not set')}
          <div class="sdetail"></div>
        </div>`).join('')}
        <h3>#base chain <span class="count" id="ncount"></span></h3><ol class="chain" id="chain"></ol>
      </aside>
    </main>
    <style id="bstyle"></style>`;

  // ---------- messages from the extension ----------
  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'scheme') loadScheme(m);
    else if (m.type === 'image') loadImage(m);
    else if (m.type === 'settings') { S.yres = m.screenHeight || 1440; render(); }
    else if (m.type === 'border') setFromLens(m.name, m.slot || 0);
    else if (m.type === 'empty') showEmpty();
  });

  function loadScheme(m) {
    const files = new Map();
    for (const f of m.files) files.set(f.key, { key: f.key, path: f.path, fsPath: f.fsPath, text: f.text });
    S.files = files; S.label = m.label; S.missing = m.missing || [];
    S.scheme = new Scheme({ files, entry: m.entry, engineKey: null });
    const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    S.names = [...S.scheme.borders.values()].map(b => b.key).sort(byName);
    S.colorNames = [...S.scheme.colors.values()].filter(c => !c.block).map(c => c.key).sort(byName);
    $('.main').hidden = false;
    const empty = $('#empty'); if (empty) empty.remove();
    render();
  }

  function showEmpty() {
    S.scheme = null;
    $('.main').hidden = true;
    if (!$('#empty')) $('#app').insertAdjacentHTML('beforeend', `<div class="emptystate" id="empty"><strong>No clientscheme.res found</strong><p>Open a HUD folder that contains resource/clientscheme.res, then click a border's Preview link.</p></div>`);
  }

  function imageFor(p) {
    const k = (p || '').toLowerCase();
    if (!k) return null;
    if (!S.images.has(k)) { S.images.set(k, null); vscode.postMessage({ type: 'image', path: p }); }
    return S.images.get(k);
  }
  function loadImage(m) {
    let img = false;
    if (m.data) {
      try {
        const bin = atob(m.data), buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        img = window.VTF.decode(buf.buffer);
      } catch (e) { /* unreadable texture: keep the dashed placeholder */ }
    }
    S.images.set(m.path.toLowerCase(), img);
    render();
  }

  // ---------- which border shows ----------
  const stateNow = () => !S.slotsOn ? 'default' : S.down ? 'pressed' : S.hover ? 'armed' : SLOTS[S.target].state;
  // → { name, slot (index, or -1 for the Button's own scheme border) }
  function borderFor(state) {
    if (!S.slotsOn) return { name: S.slots[0], slot: 0 };
    const st = STATES[state];
    for (const i of st.slots) if (S.slots[i]) return { name: S.slots[i], slot: i };
    return { name: st.fallback, slot: -1 };
  }

  // ---------- drawing ----------
  function render() {
    const panel = $('#panel'), style = $('#bstyle');
    const w = hpx(S.size[0]), h = hpx(S.size[1]);
    panel.style.width = w + 'px'; panel.style.height = h + 'px';
    $('#stage').style.zoom = S.zoom;
    const sc = S.scheme, pick = borderFor(stateNow());
    const bgRes = sc && S.bg.trim() ? sc.resolve(S.bg) : null;
    const under = bgRes && bgRes.ok ? bgRes.rgba : null;
    let css0 = '';
    const b = sc && pick.name ? sc.border(pick.name) : null;
    let bgc = under;
    if (b && b.kind === 'image') {
      const tint = b.color ? sc.resolve(b.color) : null, rgba = tint && tint.ok ? tint.rgba.slice(0, 3).concat(255) : null, img = imageFor(b.image);
      const body = Preview.imageBorderCss(b, img, S.yres, rgba);
      if (b.paintfirst) {
        // painted under the background, which blends over the texture
        const m = img && under && under[3] < 255 ? Preview.imageMean(img, rgba) : null;
        if (m) bgc = Preview.over(under, m);
        css0 = `#panel{${Preview.PAINT_FIRST}}#panel::before{${body};z-index:-1}#panel::after{${Preview.BG_OVER}}`;
      } else css0 = `#panel::after{${body}}`;
    } else if (b) {
      const ly = Preview.lineLayers(b, under);
      css0 = `#panel::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;${ly ? `background-image:${ly.img};${ly.geo}` : ''}}`;
    }
    let css = `#panel{background:${bgc ? rgbaCss(bgc) : 'transparent'};}` + css0;
    if (b && b.backgroundtype === 2) css += `#panel{border-radius:${Preview.cornerSize(S.yres)}px}`;
    style.textContent = css;
    // the area the panel's contents paint in: the panel less the border's inset
    const box = $('#insetbox'), [l, t, r, bt] = b ? b.inset : [0, 0, 0, 0];
    box.hidden = !S.showInset;
    Object.assign(box.style, { left: l + 'px', top: t + 'px', right: r + 'px', bottom: bt + 'px' });
    box.title = `inset ${l} ${t} ${r} ${bt}`;
    renderSide();
  }

  // ---------- side panel ----------
  const sw = c => `<span class="sw" title="${c ? esc(c.join(' ')) : ''}"><i style="background:${c ? rgbaCss(c) : 'transparent'}"></i></span>`;
  function defLink(node, label) {
    const f = node && node.file;
    if (!f || node.keyS == null) return esc(label);
    return `<a href="#" class="def" data-file="${esc(f.fsPath)}" data-off="${node.keyS}" title="Go to definition">${esc(label)}</a>`;
  }
  function loc(node) {
    const f = node && node.file;
    if (!f || node.keyS == null) return '';
    return `<a href="#" class="loc" data-file="${esc(f.fsPath)}" data-off="${node.keyS}" title="${esc(f.path)}">${esc(f.path.split('/').pop())}:${window.KV.lineNo(f.text, node.keyS)}</a>`;
  }
  function borderDetail(name) {
    const sc = S.scheme, { m, via } = sc.borderEntry(name);
    if (!m || !m.block) {
      const alias = via.length ? via.map(v => defLink(v.node, v.key)).join(' <span class="arrow">→</span> ') + ' <span class="arrow">→</span> ' : '';
      return { at: via[0] ? loc(via[0].node) : '', body: `<div class="key">${alias}${esc(via.length ? via[via.length - 1].value : name)}</div><div class="val bad">Not defined, so no border is drawn</div>` };
    }
    const b = sc.border(name);
    let body = via.length ? `<div class="key">${via.map(v => defLink(v.node, v.key)).concat(defLink(m.node, m.key)).join(' <span class="arrow">→</span> ')}</div>` : '';
    if (b.kind === 'image') {
      const img = S.images.get((b.image || '').toLowerCase());
      body += `<div class="val"><span class="muted">${b.scalable ? 'scalable_image' : 'image'}</span> <code>${esc(b.image)}</code>${img === false ? ' <span class="bad">not found in the HUD or the game\'s files</span>' : ''}</div>`;
      if (b.color) {
        const r = sc.resolve(b.color), cn = m.children.get('color');
        body += `<div class="val"><span class="line">${sw(r.ok ? r.rgba : null)}<span class="muted">color</span> ${defLink(cn && cn.node, b.color)}${r.ok ? '' : ' <span class="bad">undefined, so the image isn\'t tinted</span>'}</span></div>`;
      }
      if (b.scalable) {
        const dw = Math.floor((b.drawW || b.srcW) * S.yres / 480 + 1e-6), dh = Math.floor((b.drawH || b.srcH) * S.yres / 480 + 1e-6);
        body += `<div class="val muted">corners ${b.srcW} × ${b.srcH} in the texture, drawn ${dw} × ${dh} px at ${S.yres}p</div>`;
      }
    } else {
      const sides = ['left', 'top', 'right', 'bottom'].map(side => {
        const lines = b.sides[side] || [];
        if (!lines.length) return '';
        return `<div class="bside"><span class="muted">${side}</span>${lines.map(l => `<span class="line">${sw(l.rgba)}${defLink(l.entry.node, l.ref)}${l.ok ? '' : ' <span class="bad">undefined</span>'}${l.start || l.end ? ` <span class="muted">offset ${l.start} ${l.end}</span>` : ''}</span>`).join('')}</div>`;
      }).join('');
      body += (sides ? `<div class="sides">${sides}</div>` : '<div class="val muted">No lines</div>');
    }
    if (b.backgroundtype === 2) body += `<div class="val muted">backgroundtype 2: the panel's background gets rounded ${Preview.cornerSize(S.yres)}px corners; the border itself stays square</div>`;
    if (b.paintfirst) body += '<div class="val muted">paintfirst 1: painted under the panel\'s background and text, not over them</div>';
    if (b.inset.some(v => v)) body += `<div class="val muted">inset ${b.inset.join(' ')} moves the panel's contents in; the border itself doesn't move</div>`;
    return { at: loc((via[0] || m).node), body };
  }

  function renderSide() {
    combos.forEach(c => c.sync());
    $('#t-slots').checked = S.slotsOn;
    $('#t-inset').checked = S.showInset;
    // a zoom between the presets (from Ctrl + scroll) gets its own entry
    const sel = $('#t-zoom');
    let opt = [...sel.options].find(o => +o.value === S.zoom);
    sel.querySelectorAll('option.custom').forEach(o => { if (o !== opt) o.remove(); });
    if (!opt) { opt = new Option(Math.round(S.zoom * 100) + '%', String(S.zoom)); opt.className = 'custom'; sel.add(opt, [...sel.options].findIndex(o => +o.value > S.zoom) >= 0 ? [...sel.options].findIndex(o => +o.value > S.zoom) : null); }
    sel.value = opt.value;
    const wide = $('#t-wide'), tall = $('#t-tall');
    // while dragging the corner the fields follow even if one has the focus
    if (S.resizing || document.activeElement !== wide) wide.value = S.size[0];
    if (S.resizing || document.activeElement !== tall) tall.value = S.size[1];
    $('#pxsize').textContent = `${hpx(S.size[0])} × ${hpx(S.size[1])} px at ${S.yres}p`;
    $('#slotshead').textContent = S.slotsOn ? 'Button borders' : 'Border';
    if (!S.scheme) return;
    $('#hud').textContent = S.label;
    const now = borderFor(stateNow()), state = stateNow();
    document.querySelectorAll('.slotcard').forEach(el => {
      const i = +el.dataset.i, s = SLOTS[i];
      el.hidden = !S.slotsOn && i > 0;
      el.classList.toggle('slots', S.slotsOn);
      el.classList.toggle('on', S.slotsOn && i === S.target);
      el.classList.toggle('now', S.slotsOn && state === s.state);
      el.querySelector('.sname').textContent = S.slotsOn ? s.label : '';
      el.querySelector('.skey').hidden = !S.slotsOn;
      const bad = S.slots[i] && !S.scheme.border(S.slots[i]);
      el.querySelector('.cin').classList.toggle('bad', !!bad);
      let at = '', body = '';
      if (S.slotsOn) {
        const pick = borderFor(s.state);
        if (pick.slot !== i) body += `<div class="val muted">Not set, so this state uses ${pick.slot >= 0 ? `<code>${SLOTS[pick.slot].key}</code>` : `the Button's scheme border <code>${STATES[s.state].fallback}</code>`}${pick.slot < 0 ? '' : ` (${esc(pick.name)})`}</div>`;
        if (pick.slot === i || pick.slot < 0) { const d = borderDetail(pick.name); at = d.at; body += d.body; }
      } else if (S.slots[0]) { const d = borderDetail(S.slots[0]); at = d.at; body = d.body; }
      else body = '<div class="val muted">No border chosen yet</div>';
      el.querySelector('.sloc').innerHTML = at;
      el.querySelector('.sdetail').innerHTML = body;
    });
    $('#panel').title = S.slotsOn ? `${{ default: 'Default', armed: 'Hover', pressed: 'Pressed' }[state]}: ${now.name}` : (now.name || '');
    $('#ncount').textContent = `${S.names.length} borders`;
    $('#chain').innerHTML = S.scheme.chain.order.map(k => {
      const f = S.files.get(k);
      return f ? `<li><a href="#" class="def" data-file="${esc(f.fsPath)}" data-off="0">${esc(f.path)}</a></li>` : '';
    }).join('') + S.missing.map(m => `<li class="bad">${esc(m.ref)} <span class="muted">not found (from ${esc(m.from)})</span></li>`).join('');
  }

  // ---------- slots ----------
  function setSlot(i, name) {
    name = (name || '').trim();
    // use the definition's spelling when the name matches one ignoring case
    const m = S.scheme && name ? S.scheme.borders.get(name.toLowerCase()) : null;
    if (m) name = m.key;
    S.slots[i] = name; persist(); render();
  }
  function setTarget(i) { if (S.target === i || !S.slotsOn) return; S.target = i; persist(); render(); }
  // a border from a CodeLens link: Preview fills border_default, Armed and Selected their slots
  function setFromLens(name, slot) {
    if (!name) return;
    // Armed and Selected only make sense with Button borders, so they turn it on
    if (slot > 0 && !S.slotsOn) { S.slotsOn = true; S.hover = S.down = false; }
    // the panel shows the state that was just set while idle
    if (S.slotsOn) S.target = slot;
    setSlot(slot, name);
    const el = document.querySelector(`.slotcard[data-i="${slot}"]`);
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // A dropdown that doubles as a search box: type to filter, arrows to move,
  // Enter or click to choose, Escape to put back what was there. Typed text
  // that isn't in the list is kept as it is.
  function combo(root, o) {
    const box = root.querySelector('.combo'), input = root.querySelector('.cin'), list = root.querySelector('.clist');
    let active = -1, items = [];
    const open = () => !list.hidden;
    const close = () => { list.hidden = true; box.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
    const fill = all => {
      const q = all ? '' : input.value.trim().toLowerCase();
      const names = o.names();
      const hits = q ? names.filter(n => n.toLowerCase().includes(q)).sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q))) : names;
      items = [''].concat(hits);
      // an empty box means "not set"; opening the full list starts at the current value
      active = q ? (hits.length ? 1 : 0) : all ? Math.max(0, items.findIndex(n => n.toLowerCase() === o.get().toLowerCase())) : 0;
      list.innerHTML = items.map((n, j) => `<li role="option" id="${input.id}-o${j}" data-j="${j}" class="${j === active ? 'act' : ''} ${n ? '' : 'none'}">` +
        (n ? `<span class="n">${o.swatch ? o.swatch(n) : ''}${hl(n, q)}</span><span class="w">${esc(o.meta(n))}</span>` : `<span class="n">${esc(o.none)}</span><span class="w">${esc(o.noneMeta ? o.noneMeta() : '')}</span>`) + '</li>').join('') +
        (q && !hits.length ? `<li class="empty">No match for "${esc(input.value.trim())}"${o.free ? `. Enter keeps it as typed.` : ''}</li>` : '');
      list.hidden = false; box.setAttribute('aria-expanded', 'true');
      move(0);
    };
    const move = d => {
      active = Math.max(0, Math.min(items.length - 1, active + d));
      list.querySelectorAll('li[data-j]').forEach(li => li.classList.toggle('act', +li.dataset.j === active));
      const li = list.querySelector(`li[data-j="${active}"]`);
      if (li) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); }
    };
    const choose = j => { close(); o.set(items[j] || ''); input.value = o.get(); };
    const typedIsNew = () => { const v = input.value.trim().toLowerCase(); return v && !o.names().some(n => n.toLowerCase() === v); };
    input.addEventListener('focus', () => { if (o.focus) o.focus(); input.select(); });
    input.addEventListener('input', () => fill(false));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open()) fill(true); else move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (open()) move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        // a typed value with no match (an R G B A color, say) is kept as typed
        if (open() && active > 0) choose(active);
        else if (open() && active === 0 && !typedIsNew()) choose(0);
        else { close(); o.set(input.value); }
        input.select();
      } else if (e.key === 'Escape') { if (open()) { e.preventDefault(); close(); } input.value = o.get(); input.select(); }
    });
    input.addEventListener('blur', () => { close(); if (input.value.trim() !== o.get()) o.set(input.value); });
    list.addEventListener('mousedown', e => {
      e.preventDefault(); // keep the focus in the box
      const li = e.target.closest('li[data-j]');
      if (li) choose(+li.dataset.j);
    });
    root.querySelector('.carr').addEventListener('mousedown', e => {
      e.preventDefault();
      if (open()) close(); else { input.focus(); fill(true); }
    });
    return { sync() { if (document.activeElement !== input) input.value = o.get(); } };
  }
  const hl = (n, q) => {
    if (!q) return esc(n);
    const at = n.toLowerCase().indexOf(q);
    return at < 0 ? esc(n) : esc(n.slice(0, at)) + '<mark>' + esc(n.slice(at, at + q.length)) + '</mark>' + esc(n.slice(at + q.length));
  };
  function fallbackText(i) {
    if (!S.slotsOn) return '';
    if (i === 0) return 'uses ButtonBorder';
    return `uses ${S.slots[0] ? 'border_default' : i === 2 ? 'ButtonDepressedBorder' : 'ButtonBorder'}`;
  }
  const borderMeta = n => {
    const m = S.scheme && S.scheme.borders.get(n.toLowerCase());
    return !m ? '' : m.block ? m.node.file.path.split('/').pop() : `→ ${m.value}`;
  };

  const combos = SLOTS.map((s, i) => combo(document.querySelector(`.slotcard[data-i="${i}"]`), {
    names: () => S.names || [], meta: borderMeta, none: 'Not set', noneMeta: () => fallbackText(i),
    get: () => S.slots[i], set: v => setSlot(i, v), focus: () => setTarget(i),
  }));
  combos.push(combo($('.bgcombo'), {
    names: () => S.colorNames || [], free: true, none: 'No background',
    meta: n => { const c = S.scheme.colors.get(n.toLowerCase()); return c ? c.value : ''; },
    swatch: n => { const r = S.scheme.resolve(n); return sw(r.ok ? r.rgba : null); },
    get: () => S.bg, set: v => { S.bg = v.trim(); persist(); render(); },
  }));
  // clicking anywhere in a slot that isn't a control or a link selects it
  document.querySelectorAll('.slotcard').forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('a,input,button,.clist')) return;
    setTarget(+el.dataset.i);
  }));

  // ---------- toolbar and size ----------
  $('#t-slots').addEventListener('change', e => {
    S.slotsOn = e.target.checked; S.hover = S.down = false;
    if (!S.slotsOn) S.target = 0;
    persist(); render();
  });
  $('#t-inset').addEventListener('change', e => { S.showInset = e.target.checked; persist(); render(); });
  $('#t-zoom').addEventListener('change', e => { S.zoom = +e.target.value; persist(); render(); });
  for (const [id, k] of [['#t-wide', 0], ['#t-tall', 1]]) {
    const input = $(id);
    input.addEventListener('input', () => {
      const v = Math.round(+input.value);
      if (!(v >= 1)) return;
      S.size[k] = v; persist(); render();
    });
    input.addEventListener('blur', () => { input.value = S.size[k]; });
  }
  // Ctrl + scroll (or a trackpad pinch) zooms smoothly around the pointer, as
  // the SourceScheme preview does
  function zoomAround(z1, clientX, clientY) {
    const wrap = $('#stagewrap'), z0 = S.zoom;
    z1 = Math.round(Math.max(0.25, Math.min(8, z1)) * 100) / 100;
    if (z1 === z0) return;
    const r = wrap.getBoundingClientRect();
    const mx = clientX - r.left, my = clientY - r.top;
    const cx = (wrap.scrollLeft + mx) / z0, cy = (wrap.scrollTop + my) / z0;
    S.zoom = z1; persist(); render();
    wrap.scrollLeft = cx * z1 - mx; wrap.scrollTop = cy * z1 - my;
  }
  $('#stagewrap').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomAround(S.zoom * Math.exp(-Math.max(-100, Math.min(100, e.deltaY)) * 0.002), e.clientX, e.clientY);
  }, { passive: false });

  // ---------- the panel: hover is armed, pressed is selected (slots only) ----------
  const panel = $('#panel');
  // the resize grip isn't part of the button, so it doesn't arm it
  // Once the mouse has been over the panel it acts like the real button: leaving
  // it shows the default border, not the state picked in the side panel
  const setHover = h => {
    if (h === S.hover) return;
    S.hover = h;
    if (h && S.slotsOn && S.target !== 0) { S.target = 0; persist(); }
    if (!S.down && S.slotsOn) render();
  };
  panel.addEventListener('pointerover', e => setHover(!S.resizing && !e.target.closest('#grip')));
  panel.addEventListener('pointerleave', () => setHover(false));
  panel.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('#grip') || !S.slotsOn) return;
    e.preventDefault();
    panel.setPointerCapture(e.pointerId);
    S.down = true; render();
  });
  const release = () => { if (!S.down) return; S.down = false; render(); };
  panel.addEventListener('pointerup', release);
  panel.addEventListener('pointercancel', release);
  panel.addEventListener('lostpointercapture', release);

  // drag the bottom-right corner to change wide and tall
  const grip = $('#grip');
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    const x0 = e.clientX, y0 = e.clientY, [w0, h0] = S.size;
    const per = S.zoom * scale(); // client pixels per HUD unit
    S.resizing = true; S.hover = false;
    document.body.classList.add('pv-resizing', 'rs-se');
    const move = ev => {
      const w = Math.max(1, Math.round(w0 + (ev.clientX - x0) / per)), h = Math.max(1, Math.round(h0 + (ev.clientY - y0) / per));
      if (w === S.size[0] && h === S.size[1]) return;
      S.size = [w, h]; render();
    };
    const up = () => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('lostpointercapture', up);
      document.body.classList.remove('pv-resizing', 'rs-se');
      S.resizing = false;
      persist(); render();
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('lostpointercapture', up);
  });
  grip.addEventListener('dblclick', e => { e.stopPropagation(); S.size = DEFAULT_SIZE.slice(); persist(); render(); });

  $('#side').addEventListener('click', e => {
    const a = e.target.closest('[data-file]');
    if (a) { e.preventDefault(); if (a.dataset.file) vscode.postMessage({ type: 'open', fsPath: a.dataset.file, offset: +a.dataset.off || 0 }); }
  });

  render();
  vscode.postMessage({ type: 'ready' });
})();
