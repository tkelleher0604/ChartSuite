// Literal text and explicit field chips. Record discovery, schema changes and transactions belong
// to the adapter: this control only emits the edited source and its retained rich-text ranges.
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
  if (!s.rangeCount || !el.contains(s.anchorNode) || !el.contains(s.focusNode)) return null;
  const r = s.getRangeAt(0), offset = (node, at) => {
    const before = document.createRange(); before.selectNodeContents(el); before.setEnd(node, at);
    return content(before.cloneContents(), formula).length;
  };
  return { from: offset(r.startContainer, r.startOffset), to: offset(r.endContainer, r.endOffset) };
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
function Editor({ text = '', runs = EMPTY, put, offered = EMPTY, createField, readOnly = false, fieldLabel = TextTemplate.label, label = 'Text' }) {
  const box = useRef(null), caret = useRef(null), draft = useRef({ text, runs }), [list, setList] = useState(null);
  const formula = TextTemplate.formula(text), labels = () => offered.filter(l => !l.head);
  const chip = token => chipOf(token, fieldLabel);
  const paint = (t, rs) => {
    const el = box.current; if (!el) return;
    el.replaceChildren(...(TextTemplate.formula(t) ? [document.createTextNode(t)] : TextTemplate.parts(t).map(p => p.field === undefined ? document.createTextNode(p.text) : chip(p.field))));
    draft.current = { text: t, runs: rs }; caret.current = null;
  };
  const read = () => content(box.current, formula).source;
  const sync = () => { const t = read(), was = draft.current; draft.current = { text: t, runs: TextTemplate.editRuns(was.text, t, was.runs) }; return draft.current; };
  useLayoutEffect(() => {
    // A successful own commit needs no repaint. External Undo/Redo must refresh even a focused editor.
    if (readOnly || read() !== text || JSON.stringify(draft.current.runs) !== JSON.stringify(runs)) paint(text, runs);
    else draft.current = { text, runs };
  }, [text, runs, readOnly]);
  const commit = () => { if (readOnly) return; const d = sync(); if (d.text !== text || JSON.stringify(d.runs) !== JSON.stringify(runs)) put(d.text, d.runs); };
  const remember = () => { const saved = caretOf(box.current, formula); if (saved) caret.current = saved; };
  const chipAt = i => box.current?.querySelectorAll('.word-chip')[i];
  const insert = (token, at = -1, saved = caret.current) => {
    if (readOnly) return;
    const el = box.current, one = chip(token);
    if (at >= 0) chipAt(at)?.replaceWith(one);
    else { const s = getSelection(), r = rangeAt(el, saved, formula); if (r) { r.deleteContents(); r.insertNode(one); r.setStartAfter(one); r.collapse(true); el.focus(); s.removeAllRanges(); s.addRange(r); } else { if (el.textContent && !/\s$/.test(el.textContent)) el.append(document.createTextNode('\n')); el.append(one); } }
    remember(); commit();
  };
  const fresh = async (suggested, at, saved) => {
    const name = await createField?.(suggested);
    if (name && box.current?.isConnected && !readOnly) insert(name, at, saved);
  };
  const fields = (now, at, saved = caret.current) => q => {
    const k = Tree.norm(q ?? ''), bare = now?.split('|')[0].trim();
    const row = l => l.head ? l : ({ label: l, ...(now && { checked: Tree.same(l, bare) }), run: () => insert(now?.includes('|') ? `${l}|initials` : l, at, saved) });
    return [...(now && !k ? [{ label: 'As initials', checked: now.includes('|initials'), run: () => insert(now.includes('|') ? bare : `${bare}|initials`, at, saved) }, { label: 'Take it out', run: () => { if (!readOnly) { chipAt(at)?.remove(); commit(); } } }, '-'] : []),
      ...offered.filter(l => l.head ? !k : Tree.norm(l).includes(k)).map(row),
      ...(createField ? ['-', { label: k ? `New field: ${Tree.clean(q)}…` : 'New field…', run: () => fresh(q, at, saved) }] : [])];
  };
  const clicked = ev => { const one = ev.target.closest?.('.word-chip'); if (!one || readOnly) return; ev.preventDefault(); const r = one.getBoundingClientRect(), all = [...box.current.querySelectorAll('.word-chip')]; Shell.menu({ x: r.left, y: r.bottom + 2 }, fields(one.dataset.token, all.indexOf(one)), { search: true }); };
  const typedBefore = () => { const s = getSelection(); if (!s.rangeCount || !box.current.contains(s.anchorNode) || s.anchorNode.nodeType !== 3) return null; const m = /\{([^{}\n]*)$/.exec(s.anchorNode.data.slice(0, s.anchorOffset)); return m ? { node: s.anchorNode, at: s.anchorOffset, m } : null; };
  const look = () => { const b = typedBefore(); if (!b || formula) return setList(null); const q = Tree.norm(b.m[1]), items = labels().filter(l => Tree.norm(l).includes(q)); setList(items.length ? { items, on: 0 } : null); };
  const take = token => { const b = typedBefore(); if (!b || readOnly) return setList(null); const r = document.createRange(); r.setStart(b.node, b.at - b.m[0].length); r.setEnd(b.node, b.at); r.deleteContents(); const one = chip(token); r.insertNode(one); r.setStartAfter(one); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); sync(); remember(); setList(null); };
  const key = ev => {
    if (list && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp')) { ev.preventDefault(); setList({ ...list, on: (list.on + (ev.key === 'ArrowDown' ? 1 : list.items.length - 1)) % list.items.length }); }
    else if (list && (ev.key === 'Enter' || ev.key === 'Tab')) { ev.preventDefault(); take(list.items[list.on]); }
    else if (ev.key === 'Escape') { ev.stopPropagation(); if (list) setList(null); else { paint(text, runs); box.current.blur(); } }
  };
  return html`<span class="part-words">
    <div class="cell words-in" ref=${box} role="textbox" aria-label=${label} aria-multiline="true" data-ph="Text" contenteditable=${readOnly ? 'false' : 'plaintext-only'} spellcheck="false" onInput=${() => { sync(); remember(); look(); }} onKeyDown=${key} onKeyUp=${remember} onMouseUp=${remember} onClick=${clicked} onBlur=${() => { remember(); setList(null); commit(); }} />
    ${list ? html`<div class="dc-complete" role="listbox">${list.items.map((l, i) => html`<div class=${'menu-item' + (i === list.on ? ' on' : '')} role="option" onPointerDown=${ev => { ev.preventDefault(); take(l); }}>${l}</div>`)}</div>` : null}
    ${readOnly || formula ? null : html`<button type="button" class="btn ghost add-field" onMouseDown=${ev => { ev.preventDefault(); remember(); }} onClick=${ev => Shell.menu(ev.currentTarget, fields(null, -1), { search: true })}>${Shell.icon('plus')}Merge field</button>`}
  </span>`;
}
return Editor;
})();
