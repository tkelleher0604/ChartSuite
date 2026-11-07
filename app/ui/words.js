// Paragraph source, explicit fields and optional resolved-value editing. Record discovery,
// schema changes and transactions belong to adapters; BoundWords owns editable value drafts.
// Source and rich-text ranges remain independent of a field's displayed value or its length.
const WordsEditor = (() => {
const html = htm.bind(preact.h);
const { useRef, useState, useLayoutEffect } = preactHooks;
const EMPTY = Object.freeze([]);
const chipOf = (token, label) => {
  const el = document.createElement('span'); el.className = 'word-chip'; el.contentEditable = 'false';
  el.dataset.token = token; el.textContent = label(token); return el;
};
// One walk supplies both text and caret positions. Chips are atomic; BR and paragraph boundaries
// count as newlines even though Range.toString() omits them. Inline pasted spans add no newlines.
function content(el, formula) {
  const steps = []; let said = '';
  const add = (node, text, kind) => { steps.push({ node, text, kind }); said += text; };
  const walk = parent => { for (const n of parent.childNodes) {
    if (n.nodeType === 3) add(n, n.data, 'text');
    else if (n.dataset?.token) add(n, TextTemplate.field(n.dataset.token), 'field');
    else if (n.nodeName === 'BR') add(n, '\n', 'break');
    else {
      if (/^(DIV|P|LI)$/.test(n.nodeName) && said && !said.endsWith('\n')) add(n, '\n', 'block');
      walk(n);
    }
  } };
  walk(el);
  return { steps, length: said.length, source: steps.map(s => formula || s.kind === 'field' ? s.text : TextTemplate.literal(s.text)).join('') };
}
function caretOf(el, formula) {
  const s = getSelection();
  if (!el || !s.rangeCount || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) return null;
  const r = s.getRangeAt(0), inside = node => typeof BoundWords !== 'undefined' && BoundWords.fieldAt(node), offset = (node, at, end) => {
    const field = inside(node);
    if (field && el.contains(field)) {
      const before = document.createRange(); before.selectNodeContents(el); before.setEndBefore(field);
      return content(before.cloneContents(), formula).length + (end ? TextTemplate.field(field.dataset.token).length : 0);
    }
    const before = document.createRange(); before.selectNodeContents(el); before.setEnd(node, at);
    return content(before.cloneContents(), formula).length;
  };
  return { from: offset(r.startContainer, r.startOffset, false), to: offset(r.endContainer, r.endOffset, true) };
}
function rangeAt(el, saved, formula) {
  if (!saved) return null;
  const range = document.createRange(), { steps } = content(el, formula);
  const point = (at, end) => {
    for (const s of steps) {
      if (at > s.text.length) { at -= s.text.length; continue; }
      const set = end ? 'setEnd' : 'setStart';
      if (s.kind === 'text') range[set](s.node, at);
      else if (s.kind === 'block' && at) range[set](s.node, 0);
      else range[set + (at ? 'After' : 'Before')](s.node);
      return;
    }
    range[end ? 'setEnd' : 'setStart'](el, el.childNodes.length);
  };
  point(saved.from, false); point(saved.to, true); return range;
}
function Editor({ text = '', runs = EMPTY, put, offered = EMPTY, createField, readOnly = false, fieldLabel = TextTemplate.label, label = 'Text', finish, formatting, bindings, selectionChanged, dragSelection }) {
  const box = useRef(null), caret = useRef(null), draft = useRef({ text, runs }), [list, setList] = useState(null);
  const [bindingIssue, setBindingIssue] = useState(null), [sourceIssue, setSourceIssue] = useState(null), bindingsNow = useRef(bindings), bindingControl = useRef(null), version = useRef(0);
  bindingsNow.current = bindings && { ...bindings, read: token => { const value = bindings.read(token); return readOnly && value.editable ? { ...value, editable: false, error: 'This text is read-only.' } : value; } };
  if (bindings && !bindingControl.current && typeof BoundWords !== 'undefined') bindingControl.current = BoundWords.create(() => bindingsNow.current, setBindingIssue);
  const bound = bindings ? bindingControl.current : null;
  const published = useRef({ text, runs });
  // The browser restores characters on native Undo/Redo, but our formatting is kept separately.
  // Match its restored text to local snapshots, including when one native undo groups many inputs.
  const history = useRef({ entries: [draft.current], at: 0, manual: false });
  const formula = TextTemplate.formula(text), labels = () => offered.filter(l => !l.head);
  let occurrence = 0;
  const chip = token => bound ? bound.make(token, occurrence++) : chipOf(token, fieldLabel);
  const paint = (t, rs, reset = true) => {
    const el = box.current; if (!el) return;
    let at = 0; occurrence = 0;
    const styled = (node, from, to, atomic) => {
      const look = Object.assign({}, ...rs.filter(r => atomic ? r.from <= from && r.to >= to : r.from <= from && r.to > from));
      if (formatting && Object.keys(look).length) {
        if (node.nodeType === 3) { const span = document.createElement('span'); span.append(node); node = span; }
        Object.assign(node.style, formatting.style(look));
      }
      return node;
    };
    const nodes = TextTemplate.formula(t) ? [document.createTextNode(t)] : TextTemplate.parts(t).flatMap(p => {
      const start = at, plain = p.field === undefined, said = plain ? p.text : TextTemplate.field(p.field); at += said.length;
      if (!plain) return [styled(chip(p.field), start, at, true)];
      if (!formatting) return [document.createTextNode(said)];
      const cuts = [...new Set([start, at, ...rs.flatMap(r => [r.from, r.to]).filter(v => v > start && v < at)])].sort((a, b) => a - b);
      return cuts.slice(0, -1).map((from, i) => styled(document.createTextNode(said.slice(from - start, cuts[i + 1] - start)), from, cuts[i + 1], false));
    });
    el.replaceChildren(...nodes);
    bound?.attach(el);
    draft.current = { text: t, runs: rs, ...(bound && { values: bound.snapshot() }) }; caret.current = null; version.current++;
    if (reset) history.current = { entries: [draft.current], at: 0, manual: false };
  };
  const read = () => content(box.current, formula).source;
  const sync = inputType => {
    bound?.capture(box.current, inputType);
    const t = read(), values = bound?.snapshot(), was = draft.current, h = history.current, sameValues = v => JSON.stringify(v) === JSON.stringify(values);
    const step = inputType === 'historyUndo' ? -1 : inputType === 'historyRedo' ? 1 : 0;
    if (step) for (let i = h.at + step; i >= 0 && i < h.entries.length; i += step) {
      if (h.entries[i].text === t && sameValues(h.entries[i].values)) { h.at = i; return draft.current = h.entries[i]; }
    }
    if (t === was.text && sameValues(was.values)) return was;
    const next = { text: t, runs: TextTemplate.editRuns(was.text, t, was.runs), ...(bound && { values }) }; version.current++;
    h.entries.splice(h.at + 1); h.entries.push(next); h.at++;
    return draft.current = next;
  };
  useLayoutEffect(() => {
    // Own commits retain native history across blur. External Undo/Redo, changed formatting and
    // read-only mode repaint/reset it, so stale snapshots cannot restore another model revision.
    if (readOnly || read() !== text || JSON.stringify(draft.current.runs) !== JSON.stringify(runs)) paint(text, runs);
    else draft.current = { text, runs, ...(bound && { values: bound.snapshot() }) };
    published.current = { text, runs };
  }, [text, runs, readOnly, !!bound]);
  useLayoutEffect(() => {
    if (bound?.refresh(box.current)) {
      draft.current = { ...draft.current, values: bound.snapshot() };
      history.current = { entries: [draft.current], at: 0, manual: false }; version.current++;
    }
  });
  useLayoutEffect(() => () => bindingControl.current?.destroy(), []);
  const commit = () => {
    if (readOnly || !box.current) return true;
    if (bound && !bound.commit(box.current)) return false;
    const d = sync(), was = published.current;
    if (d.text !== was.text || JSON.stringify(d.runs) !== JSON.stringify(was.runs)) {
      let result;
      try { result = put(d.text, d.runs); } catch (error) { result = { error: error.message ?? 'These words could not be saved.' }; }
      const error = result === false ? 'These words could not be saved.' : result?.error;
      if (error) { setSourceIssue(error); box.current.focus({ preventScroll: true }); return false; }
      published.current = d;
    }
    setSourceIssue(null); return true;
  };
  const remember = () => { const saved = caretOf(box.current, formula); if (saved) caret.current = saved; };
  const restore = saved => {
    const el = box.current, range = rangeAt(el, saved, formula); if (!range) return;
    el.focus({ preventScroll: true }); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); caret.current = saved;
  };
  const lookAt = () => {
    const at = caret.current?.from ?? 0, r = draft.current.runs.find(r => r.from <= at && r.to > at);
    return { ...formatting?.base, ...r };
  };
  const selectionInfo = () => {
    const selected = caret.current; if (!selected) return null;
    const source = draft.current.text; let at = 0, literal = true;
    for (const p of TextTemplate.parts(source)) { const end = at + (p.field === undefined ? p.text.length : TextTemplate.field(p.field).length); if (p.field !== undefined && selected.from < end && selected.to > at) literal = false; at = end; }
    return { ...selected, text: TextTemplate.characters(source).slice(selected.from, selected.to), source, literal, version: version.current };
  };
  const tell = () => { bound?.focus(box.current); remember(); formatting?.changed?.(lookAt()); selectionChanged?.(selectionInfo()); };
  const set = (label, value) => {
    if (readOnly || formula || !formatting) return false;
    sync(); remember();
    const d = draft.current, chars = TextTemplate.characters(d.text), saved = caret.current ?? { from: 0, to: 0 }, place = bound?.bookmark();
    let { from, to } = saved;
    if (from === to) { while (from > 0 && /\S/.test(chars[from - 1])) from--; while (to < chars.length && /\S/.test(chars[to])) to++; }
    // A field is one editable character even though its storage spelling has several. A
    // range touching any of it formats the whole value, never an accidental partial token.
    let at = 0;
    for (const p of TextTemplate.parts(d.text)) {
      const end = at + (p.field === undefined ? p.text.length : TextTemplate.field(p.field).length);
      if (p.field !== undefined && from < end && to > at) { from = Math.min(from, at); to = Math.max(to, end); }
      at = end;
    }
    if (from === to) return false;
    const has = i => d.runs.find(r => r.from <= i && r.to > i)?.[label] ?? formatting.base[label];
    const toggle = ['Bold', 'Italic', 'Underline', 'Strike'].includes(label);
    const v = toggle && value === undefined ? !Array.from({ length: to - from }, (_, i) => has(from + i)).every(Boolean) : value;
    const rs = formatting.apply(d.runs, from, to, label, v), next = { ...d, runs: rs }, h = history.current;
    if (JSON.stringify(rs) === JSON.stringify(d.runs)) return true;
    h.entries.splice(h.at + 1); h.entries.push(next); h.at++; h.manual = true;
    paint(next.text, next.runs, false); if (!bound?.restoreSelection(place)) restore({ from, to }); tell(); commit(); return true;
  };
  // Programmatic chip and style operations do not enter the browser's native undo stack.
  // Once used on the canvas, keep one local sequence for them and subsequent typing. The
  // ordinary panel editor continues to use the browser's native text Undo/Redo unchanged.
  const undo = by => {
    const h = history.current, at = h.at + by, place = bound?.bookmark();
    if (at < 0 || at >= h.entries.length) return;
    h.at = at; const d = h.entries[at]; paint(d.text, d.runs, false);
    if (bound) { bound.restore(d.values, box.current); draft.current = { ...d, values: bound.snapshot() }; }
    const end = TextTemplate.characters(d.text).length; if (!bound?.restoreSelection(place)) restore({ from: end, to: end }); tell(); commit();
  };
  const chipAt = i => box.current?.querySelectorAll('.word-chip')[i];
  const insert = (token, at = -1, saved = caret.current) => {
    if (readOnly || formula) return;
    if (bound && !bound.commit(box.current)) return;
    const el = box.current, one = chip(token);
    if (at >= 0) chipAt(at)?.replaceWith(one);
    else { const s = getSelection(), r = rangeAt(el, saved, formula); if (r) { r.deleteContents(); r.insertNode(one); r.setStartAfter(one); r.collapse(true); el.focus(); s.removeAllRanges(); s.addRange(r); } else { if (el.textContent && !/\s$/.test(el.textContent)) el.append(document.createTextNode('\n')); el.append(one); } }
    remember(); commit(); if (formatting) history.current.manual = true; tell();
  };
  // A visible Fields palette can insert at this editor's saved caret without owning its draft.
  useLayoutEffect(() => {
    const el = box.current, receive = event => { if (readOnly || formula || typeof event.detail !== 'string') return; event.preventDefault(); insert(event.detail); }, flush = event => { if (!commit()) event.preventDefault(); };
    const format = event => { if (set(event.detail?.label, event.detail?.value)) event.preventDefault(); };
    const moved = () => { const selection = getSelection(); if (el.contains(selection.anchorNode) && el.contains(selection.focusNode)) tell(); };
    el?.addEventListener('dendra:insert-field', receive);
    el?.addEventListener('dendra:commit-text', flush);
    el?.addEventListener('dendra:format-text', format);
    if (formatting || bound) document.addEventListener('selectionchange', moved);
    return () => { el?.removeEventListener('dendra:insert-field', receive); el?.removeEventListener('dendra:commit-text', flush); el?.removeEventListener('dendra:format-text', format); document.removeEventListener('selectionchange', moved); };
  }, [text, runs, readOnly, formatting, bindings]);
  const fresh = async (suggested, at, saved) => {
    const name = await createField?.(suggested);
    if (name && box.current?.isConnected && !readOnly) insert(name, at, saved);
  };
  const fields = (now, at, saved = caret.current) => q => {
    const k = Tree.norm(q ?? ''), bare = now?.split('|')[0].trim();
    const row = l => l.head ? l : ({ label: l, ...(now && { checked: Tree.same(l, bare) }), run: () => insert(now?.includes('|') ? `${l}|initials` : l, at, saved) });
    return [...(now && !k ? [{ label: 'As initials', checked: now.includes('|initials'), run: () => insert(now.includes('|') ? bare : `${bare}|initials`, at, saved) }, { label: 'Take it out', run: () => { if (!readOnly) { chipAt(at)?.remove(); commit(); if (formatting) history.current.manual = true; } } }, '-'] : []),
      ...offered.filter(l => l.head ? !k : Tree.norm(l).includes(k)).map(row),
      ...(createField ? ['-', { label: k ? `New field: ${Tree.clean(q)}…` : 'New field…', run: () => fresh(q, at, saved) }] : [])];
  };
  const clicked = ev => { if (bound && ev.target.closest?.('[data-bound]')) return tell(); const one = ev.target.closest?.('.word-chip'); if (!one || readOnly) return; ev.preventDefault(); const r = one.getBoundingClientRect(), all = [...box.current.querySelectorAll('.word-chip')]; Shell.menu({ x: r.left, y: r.bottom + 2 }, fields(one.dataset.token, all.indexOf(one)), { search: true }); };
  const typedBefore = () => { const s = getSelection(); if (!s.rangeCount || !box.current.contains(s.anchorNode) || s.anchorNode.nodeType !== 3 || bound && BoundWords.fieldAt(s.anchorNode)) return null; const m = /\{([^{}\n]*)$/.exec(s.anchorNode.data.slice(0, s.anchorOffset)); return m ? { node: s.anchorNode, at: s.anchorOffset, m } : null; };
  const look = () => { const b = typedBefore(); if (!b || formula) return setList(null); const q = Tree.norm(b.m[1]), items = labels().filter(l => Tree.norm(l).includes(q)); setList(items.length ? { items, on: 0 } : null); };
  const take = token => { const b = typedBefore(); if (!b || readOnly) return setList(null); const r = document.createRange(); r.setStart(b.node, b.at - b.m[0].length); r.setEnd(b.node, b.at); r.deleteContents(); const one = chip(token); r.insertNode(one); r.setStartAfter(one); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); sync(); if (formatting) history.current.manual = true; remember(); setList(null); };
  const key = ev => {
    const boundKey = bound?.key(ev);
    if (boundKey) { if (boundKey === 'edit') { sync(); history.current.manual = true; } tell(); return; }
    if (ev.key === 'Escape' && bound?.cancel()) { ev.preventDefault(); ev.stopPropagation(); sync(); tell(); return; }
    if (ev.key === 'Escape' && sourceIssue) { ev.preventDefault(); ev.stopPropagation(); paint(text, runs); setSourceIssue(null); tell(); return; }
    if (formatting && (ev.ctrlKey || ev.metaKey) && !ev.altKey) {
      const k = ev.key.toLowerCase(), label = !ev.shiftKey ? ({ b: 'Bold', i: 'Italic', u: 'Underline' })[k] : k === 'x' ? 'Strike' : null;
      if (history.current.manual && (k === 'z' || k === 'y')) { ev.preventDefault(); undo(k === 'y' || ev.shiftKey ? 1 : -1); return; }
      const step = !ev.shiftKey && k === ']' || ev.shiftKey && k === '>' ? 1 : !ev.shiftKey && k === '[' || ev.shiftKey && k === '<' ? -1 : 0;
      if (label && set(label) || step && set('Size', Math.max(1, (lookAt().Size ?? 12) + step))) { ev.preventDefault(); return; }
    }
    if (list && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) { ev.preventDefault(); setList({ ...list, on: (list.on + (ev.key === 'ArrowDown' ? 1 : list.items.length - 1)) % list.items.length }); }
    else if (list && (ev.key === 'Enter' || ev.key === 'Tab')) { ev.preventDefault(); take(list.items[list.on]); }
    else if (finish && ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); finish(); }
    else if (ev.key === 'Escape') { ev.stopPropagation(); if (list) setList(null); else if (finish) { ev.preventDefault(); finish(); } else { paint(text, runs); box.current.blur(); } }
  };
  return html`<span class="part-words">
    <div class="cell words-in" ref=${box} role="textbox" aria-label=${label} aria-multiline="true" data-ph="Type text, or insert a field…" contenteditable=${readOnly ? 'false' : 'plaintext-only'} spellcheck=${false} onBeforeInput=${ev => { if (bound?.beforeInput(ev)) { sync(); history.current.manual = true; tell(); } }} onPaste=${ev => { if (bound?.paste(ev)) { sync(); history.current.manual = true; tell(); } }} onInput=${ev => { setSourceIssue(null); sync(ev.inputType); tell(); look(); }} onKeyDown=${key} onKeyUp=${tell} onMouseUp=${tell} onClick=${clicked} onDragStart=${ev => { remember(); const selection = selectionInfo(); if (selection?.literal && selection.text) dragSelection?.(ev, selection); }} onBlur=${() => { remember(); setList(null); commit(); }} />
    ${bindingIssue || sourceIssue ? html`<div class="bound-error" role="alert">${bindingIssue ?? sourceIssue}</div>` : null}
    ${list ? html`<div class="dc-complete" role="listbox">${list.items.map((l, i) => html`<div class=${'menu-item' + (i === list.on ? ' on' : '')} role="option" onPointerDown=${ev => { ev.preventDefault(); take(l); }}>${l}</div>`)}</div>` : null}
    ${readOnly || formula ? null : html`<button type="button" class="btn ghost add-field" onMouseDown=${ev => { ev.preventDefault(); remember(); }} onClick=${ev => Shell.menu(ev.currentTarget, fields(null, -1), { search: true })}>${Shell.icon('plus')}Merge field</button>`}
  </span>`;
}
return Editor;
})();
