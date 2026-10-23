// ---------------------------------------------------------------------------
// ClientScheme border preview: a panel drawn with borders from
// resource/clientscheme.res and the files it #bases. Three slots stand for a
// button's border keys; hovering the panel shows the armed one and pressing it
// the selected one, the way TF2's CExButton picks its border.
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
    target: saved.target != null ? saved.target : 0,
    size: Array.isArray(saved.size) ? saved.size : DEFAULT_SIZE.slice(),
    zoom: saved.zoom || 1, bg: saved.bg || '', showInset: !!saved.showInset,
    hover: false, down: false,
  };
  while (S.slots.length < 3) S.slots.push('');
  const persist = () => vscode.setState({ slots: S.slots, target: S.target, size: S.size, zoom: S.zoom, bg: S.bg, showInset: S.showInset });
  const scale = () => S.yres / 480; // HUD panels are laid out on the 480-line proportional base
  const hpx = v => Math.floor(v * scale() + 1e-6);

  // ---------- layout ----------
  $('#app').innerHTML = `
    <header class="bar bbar">
      <div class="slots" id="slots">${SLOTS.map((s, i) => `
        <div class="slot" data-i="${i}">
          <div class="slab"><span class="dot" aria-hidden="true"></span><code>${s.key}</code><span class="muted">${s.label}</span></div>
          <div class="combo" role="combobox" aria-haspopup="listbox" aria-expanded="false">
            <input class="cin" id="cin${i}" spellcheck="false" autocomplete="off" placeholder="Not set" aria-label="${s.key}: type to search borders" aria-autocomplete="list" aria-controls="clist${i}">
            <button class="carr" tabindex="-1" aria-label="Show all borders">▾</button>
            <ul class="clist" id="clist${i}" role="listbox" hidden></ul>
          </div>
        </div>`).join('')}
      </div>
      <span class="grow"></span>
      <label class="tog" title="Outline the area the panel's contents paint in, moved in by the border's inset"><input type="checkbox" id="t-inset"> Show inset</label>
      <label class="lbl" for="t-bg">bgcolor</label>
      <input class="tin" id="t-bg" spellcheck="false" placeholder="none" title="The panel's background: a color name from your scheme, or R G B A">
      <label class="lbl" for="t-zoom">Zoom</label>
      <select id="t-zoom">${ZOOMS.map(z => `<option value="${z}">${z * 100}%</option>`).join('')}</select>
    </header>
    <main class="main">
      <section class="stagewrap" id="stagewrap">
        <div class="bstage" id="stage">
          <div class="bpanel" id="panel" title="Hover to see the armed border, press for the selected border"><div class="bgrip" id="grip" title="Drag to resize. Double-click to reset."></div></div>
          <div class="dims" id="dims"></div>
        </div>
      </section>
      <aside class="side" id="side" aria-label="Borders in the slots"></aside>
    </main>
    <style id="bstyle"></style>`;

  // ---------- messages from the extension ----------
  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'scheme') loadScheme(m);
    else if (m.type === 'image') loadImage(m);
    else if (m.type === 'settings') { S.yres = m.screenHeight || 1440; render(); }
    else if (m.type === 'border') fillTarget(m.name);
    else if (m.type === 'empty') showEmpty();
  });

  function loadScheme(m) {
    const files = new Map();
    for (const f of m.files) files.set(f.key, { key: f.key, path: f.path, fsPath: f.fsPath, text: f.text });
    S.files = files; S.label = m.label; S.missing = m.missing || [];
    S.scheme = new Scheme({ files, entry: m.entry, engineKey: null });
    S.names = [...S.scheme.borders.values()].map(b => b.key).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    $('.main').hidden = false;
    const empty = $('#empty'); if (empty) empty.remove();
    render();
  }

  function showEmpty() {
    S.scheme = null;
    $('.main').hidden = true;
    if (!$('#empty')) $('#app').insertAdjacentHTML('beforeend', `<div class="emptystate" id="empty"><strong>No clientscheme.res found</strong><p>Open a HUD folder that contains resource/clientscheme.res, then open its border preview from the editor title bar or a "Preview border" link.</p></div>`);
  }

  function imageFor(p) {
    const k = (p || '').toLowerCase();
    if (!k) return null;
    if (!S.images.has(k)) { S.images.set(k, null); vscode.postMessage({ type: 'image', path: p }); }
    return S.images.get(k);
  }
  function loadImage(m) {
    if (!m.data) { S.images.set(m.path.toLowerCase(), false); renderSide(); return; }
    try {
      const bin = atob(m.data), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      S.images.set(m.path.toLowerCase(), window.VTF.toDataURL(window.VTF.decode(buf.buffer)));
    } catch (e) { S.images.set(m.path.toLowerCase(), false); }
    render();
  }

  // ---------- which border shows ----------
  const stateNow = () => S.down ? 'pressed' : S.hover ? 'armed' : SLOTS[S.target].state;
  // → { name, slot (index or -1 for the Button's own scheme border) }
  function borderFor(state) {
    const st = STATES[state];
    for (const i of st.slots) if (S.slots[i]) return { name: S.slots[i], slot: i };
    return { name: st.fallback, slot: -1 };
  }

  // ---------- drawing ----------
  function render() {
    syncSlots();
    const panel = $('#panel'), style = $('#bstyle');
    const w = hpx(S.size[0]), h = hpx(S.size[1]);
    panel.style.width = w + 'px'; panel.style.height = h + 'px';
    $('#stage').style.zoom = S.zoom; $('#stage').style.setProperty('--z', S.zoom);
    const state = stateNow(), pick = borderFor(state);
    const sc = S.scheme;
    const bgRes = sc && S.bg.trim() ? sc.resolve(S.bg) : null;
    const under = bgRes && bgRes.ok ? bgRes.rgba : null;
    let css = `#panel{background:${under ? rgbaCss(under) : 'transparent'};}`;
    const b = sc ? sc.border(pick.name) : null;
    if (b && b.kind === 'image') css += `#panel::after{${Preview.imageBorderCss(b, imageFor(b.image), S.yres)}}`;
    else if (b) {
      const ly = Preview.lineLayers(b, under);
      css += `#panel::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;${ly ? `background-image:${ly.img};${ly.geo}` : ''}}`;
      if (b.backgroundtype === 2) css += '#panel{border-radius:7px}';
    }
    // the area the panel's contents would paint in, moved in by the border's inset
    if (S.showInset && b && b.inset.some(v => v)) {
      const [l, t, r, bt] = b.inset;
      css += `#panel::before{content:"";position:absolute;left:${l}px;top:${t}px;right:${r}px;bottom:${bt}px;outline:1px dotted rgba(127,127,127,.6);pointer-events:none}`;
    }
    style.textContent = css;
    const slotName = pick.slot >= 0 ? SLOTS[pick.slot].key : 'Button scheme default';
    $('#dims').innerHTML = `<span><span class="muted">wide</span> ${S.size[0]} <span class="muted">tall</span> ${S.size[1]}</span>` +
      `<span class="muted">${w} × ${h} px at ${S.yres}p</span>` +
      `<span><span class="muted">${{ default: 'Default', armed: 'Hover', pressed: 'Pressed' }[state]}:</span> ${esc(pick.name)} <span class="muted">(${esc(slotName)})</span>${b ? '' : ' <span class="bad">not defined</span>'}</span>`;
    renderSide();
  }

  // ---------- slots ----------
  function syncSlots() {
    document.querySelectorAll('.slot').forEach(el => {
      const i = +el.dataset.i;
      el.classList.toggle('on', i === S.target);
      el.classList.toggle('showing', borderFor(stateNow()).slot === i);
      const input = el.querySelector('.cin');
      if (document.activeElement !== input) input.value = S.slots[i];
      const bad = S.slots[i] && S.scheme && !S.scheme.border(S.slots[i]);
      input.classList.toggle('bad', !!bad);
      input.title = bad ? `"${S.slots[i]}" isn't a defined border, so the game draws none` : '';
    });
    $('#t-bg').value = document.activeElement === $('#t-bg') ? $('#t-bg').value : S.bg;
    const bg = $('#t-bg').value.trim();
    $('#t-bg').classList.toggle('bad', !!(bg && S.scheme && !S.scheme.resolve(bg).ok));
    $('#t-zoom').value = String(S.zoom);
    $('#t-inset').checked = S.showInset;
  }

  function setTarget(i) { if (S.target === i) return; S.target = i; persist(); render(); }
  function setSlot(i, name) {
    name = (name || '').trim();
    // use the definition's spelling when the name matches one ignoring case
    const m = S.scheme && name ? S.scheme.borders.get(name.toLowerCase()) : null;
    if (m) name = m.key;
    S.slots[i] = name; persist(); render();
  }
  // a border from the editor (the cursor, or a CodeLens) goes in the selected slot
  function fillTarget(name) {
    if (!name) return;
    setSlot(S.target, name);
    const el = document.querySelector(`.slot[data-i="${S.target}"]`);
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  // Each slot's dropdown doubles as a search box: type to filter, arrows to move,
  // Enter or click to choose, Escape to put back what was there
  document.querySelectorAll('.slot').forEach(el => {
    const i = +el.dataset.i;
    const combo = el.querySelector('.combo'), input = el.querySelector('.cin'), list = el.querySelector('.clist');
    let active = -1, items = [];
    const open = () => !list.hidden;
    const close = () => { list.hidden = true; combo.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); };
    const fill = all => {
      const q = all ? '' : input.value.trim().toLowerCase();
      const names = S.names || [];
      const hits = q ? names.filter(n => n.toLowerCase().includes(q)).sort((a, b) => (b.toLowerCase().startsWith(q) - a.toLowerCase().startsWith(q))) : names;
      items = [''].concat(hits);
      // an empty box means "Not set"; opening the full list starts at the current border
      active = q ? (hits.length ? 1 : 0) : all ? Math.max(0, items.findIndex(n => n.toLowerCase() === S.slots[i].toLowerCase())) : 0;
      list.innerHTML = items.map((n, j) => {
        const m = n && S.scheme.borders.get(n.toLowerCase());
        const where = m ? m.node.file.path.split('/').pop() : '';
        const kind = m ? (m.block ? '' : 'alias') : '';
        return `<li role="option" id="opt${i}-${j}" data-j="${j}" class="${j === active ? 'act' : ''} ${n ? '' : 'none'}">${n ? `<span class="n">${hl(n, q)}</span><span class="w">${esc(kind ? `→ ${m.value}` : where)}</span>` : '<span class="n">Not set</span><span class="w">' + esc(fallbackText(i)) + '</span>'}</li>`;
      }).join('') + (q && !hits.length ? `<li class="empty">No border matches "${esc(input.value.trim())}"</li>` : '');
      list.hidden = false; combo.setAttribute('aria-expanded', 'true');
      move(0);
    };
    const move = d => {
      if (!items.length) return;
      active = Math.max(0, Math.min(items.length - 1, active + d));
      list.querySelectorAll('li[data-j]').forEach(li => li.classList.toggle('act', +li.dataset.j === active));
      const li = list.querySelector(`li[data-j="${active}"]`);
      if (li) { li.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', li.id); }
    };
    const choose = j => { close(); setSlot(i, items[j] || ''); input.value = S.slots[i]; };
    input.addEventListener('focus', () => { setTarget(i); input.select(); });
    input.addEventListener('input', () => fill(false));
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!open()) fill(true); else move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (open()) move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (open() && active >= 0) choose(active); else { close(); setSlot(i, input.value); }
        input.select();
      } else if (e.key === 'Escape') { if (open()) { e.preventDefault(); close(); } input.value = S.slots[i]; input.select(); }
    });
    // typing a name and leaving the box sets it, even if it isn't a defined border
    input.addEventListener('blur', () => { close(); if (input.value.trim() !== S.slots[i]) setSlot(i, input.value); });
    list.addEventListener('mousedown', e => {
      e.preventDefault(); // keep the focus in the box
      const li = e.target.closest('li[data-j]');
      if (li) choose(+li.dataset.j);
    });
    el.querySelector('.carr').addEventListener('mousedown', e => {
      e.preventDefault();
      if (open()) close(); else { input.focus(); fill(true); }
    });
    el.querySelector('.slab').addEventListener('click', () => { setTarget(i); input.focus(); });
  });
  const hl = (n, q) => {
    if (!q) return esc(n);
    const at = n.toLowerCase().indexOf(q);
    return at < 0 ? esc(n) : esc(n.slice(0, at)) + '<mark>' + esc(n.slice(at, at + q.length)) + '</mark>' + esc(n.slice(at + q.length));
  };
  function fallbackText(i) {
    if (i === 0) return 'uses ButtonBorder';
    const d = S.slots[0];
    return `uses ${d ? 'border_default' : i === 2 ? 'ButtonDepressedBorder' : 'ButtonBorder'}`;
  }

  // ---------- toolbar ----------
  $('#t-bg').addEventListener('input', e => { S.bg = e.target.value; persist(); render(); });
  $('#t-inset').addEventListener('change', e => { S.showInset = e.target.checked; persist(); render(); });
  $('#t-zoom').addEventListener('change', e => { S.zoom = +e.target.value; persist(); render(); });
  $('#stagewrap').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const i = ZOOMS.indexOf(S.zoom);
    const next = e.deltaY < 0 ? ZOOMS[Math.min(ZOOMS.length - 1, i + 1)] : ZOOMS[Math.max(0, i - 1)];
    if (next && next !== S.zoom) { S.zoom = next; persist(); render(); }
  }, { passive: false });

  // ---------- the panel: hover is armed, pressed is selected ----------
  const panel = $('#panel');
  // the resize grip isn't part of the button, so it doesn't arm it
  const setHover = h => { if (h === S.hover) return; S.hover = h; if (!S.down) render(); };
  panel.addEventListener('pointerover', e => setHover(!S.resizing && !e.target.closest('#grip')));
  panel.addEventListener('pointerleave', () => setHover(false));
  panel.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('#grip')) return;
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

  // ---------- sidebar ----------
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
      return { head: `${alias}${esc(via.length ? via[via.length - 1].value : name)}`, at: via[0] ? loc(via[0].node) : '', body: '<div class="val bad">Not defined, so no border is drawn</div>' };
    }
    const b = sc.border(name);
    const head = via.map(v => defLink(v.node, v.key)).concat(defLink(m.node, m.key)).join(' <span class="arrow">→</span> ');
    let body;
    if (b.kind === 'image') {
      const img = S.images.get((b.image || '').toLowerCase());
      body = `<div class="val"><span class="muted">${b.scalable ? 'scalable_image' : 'image'}</span> <code>${esc(b.image)}</code>${img === false ? ' <span class="bad">not found in the HUD\'s materials folder</span>' : ''}</div>`;
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
      body = (sides ? `<div class="sides">${sides}</div>` : '<div class="val muted">No lines</div>') + (b.backgroundtype === 2 ? '<div class="val muted">backgroundtype 2: rounded corners</div>' : '');
    }
    if (b.inset.some(v => v)) body += `<div class="val muted">inset ${b.inset.join(' ')} moves the panel's contents in; the border itself doesn't move</div>`;
    return { head, at: loc((via[0] || m).node), body };
  }

  function renderSide() {
    const side = $('#side');
    if (!S.scheme) { side.innerHTML = ''; return; }
    const top = side.scrollTop;
    const showing = borderFor(stateNow());
    const rows = SLOTS.map((s, i) => {
      const st = STATES[s.state];
      const pick = borderFor(s.state);
      const d = borderDetail(pick.name);
      const from = pick.slot === i ? '' : `<div class="val muted">Not set, so this state uses ${pick.slot >= 0 ? `<code>${SLOTS[pick.slot].key}</code>` : `the Button's scheme border <code>${st.fallback}</code>`}</div>`;
      const on = showing.slot === pick.slot && showing.name === pick.name && stateNow() === s.state;
      return `<div class="item bslot ${on ? 'now' : ''}"><span class="sw num">${i + 1}</span><div class="body">
        <div class="role"><b>${s.label}</b>${d.at}</div><div class="key"><code class="muted">${s.key}</code></div>${from}
        <div class="key">${d.head}</div>${d.body}</div></div>`;
    }).join('');
    const chain = S.scheme.chain.order.map(k => {
      const f = S.files.get(k);
      return f ? `<li><a href="#" class="def" data-file="${esc(f.fsPath)}" data-off="0">${esc(f.path)}</a></li>` : '';
    }).join('') + S.missing.map(m => `<li class="bad">${esc(m.ref)} <span class="muted">not found (from ${esc(m.from)})</span></li>`).join('');
    side.innerHTML = `<div class="head"><div><span class="eyebrow">ClientScheme borders</span><h2>${esc(S.label)}</h2></div></div>
      <p class="note">Put your cursor in a border in the editor, or use its "Preview border" link, to show it in the highlighted slot. Hover the panel to see the armed border; hold the mouse down to see the selected one.</p>
      <h3>Slots</h3>${rows}
      <h3>#base chain <span class="count">${S.names.length} borders</span></h3><ol class="chain">${chain}</ol>`;
    side.scrollTop = top;
  }

  $('#side').addEventListener('click', e => {
    const a = e.target.closest('[data-file]');
    if (a) { e.preventDefault(); if (a.dataset.file) vscode.postMessage({ type: 'open', fsPath: a.dataset.file, offset: +a.dataset.off || 0 }); }
  });

  render();
  vscode.postMessage({ type: 'ready' });
})();
