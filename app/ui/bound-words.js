// Editable resolved values inside a template. Identity is kept on the span; its visible
// text is a record-value draft, never template source. The adapter owns lookup and writes.
// read(token) returns {text,label,editable,target?,error?}; target.slot identifies the stable
// data location. putValue(token,text,target) synchronously returns success or {error,text?}.
// focus(token,target) and draft(token,{text,error,target}|null) mirror the current edit.
// Values commit when their cursor leaves or the host flushes. Validation retains the draft;
// Escape cancels it. A false outer span and editable inner host preserve identity on deletion.
const BoundWords = (() => {
const fieldAt = node => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.('[data-bound]') ?? null;
const valueElement = node => node?.querySelector('[data-bound-value]') ?? node;
function valueOf(node) {
  let text = '';
  const walk = parent => { for (const child of parent.childNodes) {
    if (child.nodeType === 1 && child.hasAttribute('data-bound-tail')) continue;
    if (child.nodeType === 3) text += child.data;
    else if (child.nodeName === 'BR') text += '\n';
    else { if (/^(DIV|P|LI)$/.test(child.nodeName) && text && !text.endsWith('\n')) text += '\n'; walk(child); }
  } };
  walk(node); return text;
}
function fillValue(node, text) {
  node.replaceChildren(document.createTextNode(text));
  if (text.endsWith('\n')) { const tail = document.createElement('br'); tail.dataset.boundTail = ''; node.append(tail); }
}
// Slot identity survives clearing/recreating an entry, and separates equally named fields
// on different related records. Aliases of one entry share its draft.
const identity = (token, target) => target?.slot ? JSON.stringify([target.slot.at, Tree.norm(target.slot.edge)]) : target?.id ?? token;
function create(adapter, issue) {
  const states = new Map(); let active = null, saved = null, root = null, pending = null;
  const describe = token => adapter()?.read(token) ?? { text: '', editable: false, error: 'This field is unavailable.' };
  const stateFor = token => {
    const info = describe(token), key = identity(token, info.target) + (info.editable ? '' : '|readonly|' + token); let state = states.get(key);
    if (!state) { state = { key, token, text: String(info.text ?? ''), base: String(info.text ?? ''), dirty: false, error: null }; states.set(key, state); }
    Object.assign(state, { target: info.target, label: info.label ?? token, editable: !!info.editable, reason: info.error });
    return state;
  };
  const nodes = key => [...root?.querySelectorAll('[data-bound]') ?? []].filter(n => n.dataset.bound === key);
  const notify = state => adapter()?.draft?.(state.token, state.dirty || state.error ? { text: state.text, error: state.error, target: state.target } : null);
  const show = (state, except = null) => {
    for (const node of nodes(state.key)) {
      if (node !== except && valueOf(node) !== state.text) fillValue(valueElement(node), state.text);
      node.classList.toggle('active', active === state.key);
      node.classList.toggle('empty', !state.text);
      if (state.error) node.setAttribute('aria-invalid', 'true'); else node.removeAttribute('aria-invalid');
      node.title = state.error ?? state.reason ?? state.label;
    }
    issue?.([...states.values()].find(s => s.error)?.error ?? null);
  };
  const make = (token, occurrence) => {
    const state = stateFor(token), node = document.createElement('span');
    node.className = 'word-bound'; node.dataset.token = token; node.dataset.bound = state.key; node.dataset.occurrence = occurrence;
    node.contentEditable = 'false';
    node.setAttribute('aria-label', state.label); node.setAttribute('aria-readonly', String(!state.editable));
    node.dataset.placeholder = state.label; node.title = state.reason ?? state.label;
    const value = document.createElement('span'); value.className = 'bound-value'; value.dataset.boundValue = ''; value.dataset.placeholder = state.label;
    value.spellcheck = false;
    value.contentEditable = state.editable ? 'plaintext-only' : 'false'; value.setAttribute('aria-label', state.label);
    if (state.editable) { value.tabIndex = 0; value.setAttribute('role', 'textbox'); value.setAttribute('aria-multiline', 'true'); }
    fillValue(value, state.text);
    node.classList.toggle('empty', !state.text); node.append(value); return node;
  };
  const attach = element => { root = element; pending = null; };
  const snapshot = () => Object.fromEntries([...new Set([...root?.querySelectorAll('[data-bound]') ?? []].map(n => n.dataset.bound))].map(key => {
    const s = states.get(key); return [key, { token: s.token, text: s.text }];
  }));
  const refresh = element => {
    root = element; let external = false, changedTarget = null;
    for (const node of root?.querySelectorAll('[data-bound]') ?? []) {
      const previous = states.get(node.dataset.bound)?.target, state = stateFor(node.dataset.token), info = describe(node.dataset.token), text = String(info.text ?? '');
      node.dataset.bound = state.key;
      if (state.key === active && JSON.stringify(previous) !== JSON.stringify(state.target)) changedTarget = state;
      if (!state.dirty && text !== state.base) { state.text = state.base = text; external = true; }
      valueElement(node).contentEditable = state.editable ? 'plaintext-only' : 'false'; node.setAttribute('aria-readonly', String(!state.editable));
      show(state);
    }
    if (changedTarget) adapter()?.focus?.(changedTarget.token, changedTarget.target);
    return external;
  };
  const prepare = element => {
    root = element; const selection = getSelection(), range = selection.rangeCount && selection.getRangeAt(0), node = range && fieldAt(range.startContainer);
    pending = node && node === fieldAt(range.endContainer) && root.contains(node)
      ? { node, parent: node.parentNode, next: node.nextSibling } : null;
  };
  const capture = (element, inputType, inputTarget) => {
    root = element;
    const edited = /^(insert|delete)/.test(inputType ?? ''), restored = /^history/.test(inputType ?? '');
    // Browsers can remove the wrapper when all of its text is deleted. Editing wholly
    // inside a value clears that value; it must not silently remove the template field.
    if (pending && !pending.node.isConnected && pending.parent.isConnected && !/^history/.test(inputType ?? '')) {
      const { node, parent, next } = pending; valueElement(node).replaceChildren(document.createTextNode(''));
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
      const range = document.createRange(); range.setStart(valueElement(node), 0); range.collapse(true);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    }
    pending = null;
    const selection = getSelection(), selected = fieldAt(selection.anchorNode), target = fieldAt(inputTarget), current = root.contains(target) ? target : selected, groups = new Map();
    for (const node of root.querySelectorAll('[data-bound]')) { const list = groups.get(node.dataset.bound) ?? []; list.push(node); groups.set(node.dataset.bound, list); }
    for (const [key, all] of groups) {
      const state = states.get(key); if (!state?.editable) continue;
      const node = all.includes(current) ? current : all.find(n => valueOf(n) !== state.text);
      if (!node) continue;
      const text = valueOf(node), touched = state.inputPending || edited && node === current;
      state.inputPending = false;
      if (text === state.text && !touched && !(restored && state.dirty)) continue;
      // Retyping the displayed value is still an explicit edit: a broader scope may
      // contain different values. Merely focusing or flushing the field is not one.
      // Native Undo back to the original value cancels an uncommitted edit's intent.
      state.text = text; state.dirty = restored ? text !== state.base : state.dirty || touched || text !== state.base;
      state.error = null; notify(state); show(state, node);
    }
  };
  const commitOne = state => {
    if (!state?.dirty) return true;
    if (!state.editable) { state.error = state.reason ?? 'This field can no longer be edited.'; notify(state); show(state); return false; }
    let result;
    try { result = adapter()?.putValue(state.token, state.text, state.target); }
    catch (error) { result = { error: error.message ?? 'This value could not be saved.' }; }
    const error = result === false ? 'This value could not be saved.' : result?.error;
    if (error) { state.error = error; notify(state); show(state); return false; }
    state.base = state.text = String(result?.text ?? state.text); state.dirty = false; state.inputPending = false; state.error = null; notify(state); show(state); return true;
  };
  const focusInvalid = state => {
    const node = nodes(state.key)[0]; if (!node) return;
    active = state.key; show(state); valueElement(node).focus({ preventScroll: true });
    const range = saved?.commonAncestorContainer?.isConnected && node.contains(saved.commonAncestorContainer) ? saved : document.createRange();
    if (range !== saved) { range.selectNodeContents(valueElement(node)); range.collapse(false); }
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
  };
  const focus = element => {
    root = element; const selection = getSelection(), node = fieldAt(selection.anchorNode), key = root.contains(node) ? node.dataset.bound : null;
    if (key !== active && active && !commitOne(states.get(active))) { focusInvalid(states.get(active)); return false; }
    const before = active; active = key;
    if (before !== key) {
      if (before) show(states.get(before)); if (key) show(states.get(key));
      const state = key && states.get(key); adapter()?.focus?.(state?.token ?? null, state?.target ?? null);
    }
    if (key && selection.rangeCount) saved = selection.getRangeAt(0).cloneRange();
    prepare(root);
    return true;
  };
  const commit = element => {
    capture(element);
    for (const state of states.values()) if (!commitOne(state)) { focusInvalid(state); return false; }
    return true;
  };
  const restore = (values, element) => {
    root = element;
    for (const [key, value] of Object.entries(values ?? {})) {
      const state = states.get(key) ?? stateFor(value.token); if (!state.editable) continue;
      state.text = value.text; state.dirty = state.text !== state.base; state.inputPending = false; state.error = null; notify(state); show(state);
    }
  };
  const cancel = () => {
    const state = states.get(active); if (!state?.dirty && !state?.error) return false;
    state.text = state.base; state.dirty = false; state.inputPending = false; state.error = null; notify(state); show(state); focusInvalid(state); return true;
  };
  const insertText = text => {
    const selection = getSelection(), range = selection.rangeCount && selection.getRangeAt(0), node = range && fieldAt(range.startContainer);
    if (!node || node !== fieldAt(range.endContainer) || !root?.contains(node) || !states.get(node.dataset.bound)?.editable) return false;
    const value = valueElement(node);
    if (!value.contains(range.startContainer) || !value.contains(range.endContainer)) return false;
    range.deleteContents(); const typed = document.createTextNode(text); range.insertNode(typed);
    states.get(node.dataset.bound).inputPending = true;
    if (valueOf(value).endsWith('\n') && !value.querySelector('[data-bound-tail]')) { const tail = document.createElement('br'); tail.dataset.boundTail = ''; value.append(tail); }
    value.focus({ preventScroll: true }); range.setStart(typed, text.length); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); pending = null; return true;
  };
  const beforeInput = event => {
    prepare(root);
    const paragraph = event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak';
    if ((paragraph || event.inputType === 'insertText' && event.data?.includes('\n')) && insertText(paragraph ? '\n' : event.data)) { event.preventDefault(); return true; }
    return false;
  };
  const paste = event => {
    const text = event.clipboardData?.getData('text/plain');
    if (text === undefined || !insertText(text)) return false;
    event.preventDefault(); return true;
  };
  const key = event => {
    if (event.key === 'Enter' && !(event.ctrlKey || event.metaKey) && insertText('\n')) { event.preventDefault(); return 'edit'; }
    const selection = getSelection(), node = fieldAt(selection.anchorNode);
    if (!node || !root?.contains(node) || !selection.isCollapsed || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return false;
    const before = document.createRange(); before.selectNodeContents(node); before.setEnd(selection.anchorNode, selection.anchorOffset);
    const at = valueOf(before.cloneContents()), length = valueOf(node).length;
    if (event.key === 'ArrowLeft' ? at.length !== 0 : at.length !== length) return false;
    event.preventDefault();
    const range = document.createRange(); range[event.key === 'ArrowLeft' ? 'setStartBefore' : 'setStartAfter'](node); range.collapse(true);
    root.focus({ preventScroll: true }); selection.removeAllRanges(); selection.addRange(range); focus(root); return true;
  };
  const bookmark = () => {
    const selection = getSelection(); if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0), node = fieldAt(range.startContainer);
    if (!node || node !== fieldAt(range.endContainer) || !root?.contains(node)) return null;
    const offset = (target, at) => { const before = document.createRange(); before.selectNodeContents(node); before.setEnd(target, at); return valueOf(before.cloneContents()).length; };
    return { key: node.dataset.bound, occurrence: node.dataset.occurrence, from: offset(range.startContainer, range.startOffset), to: offset(range.endContainer, range.endOffset) };
  };
  const restoreSelection = place => {
    if (!place) return false;
    const node = nodes(place.key).find(n => n.dataset.occurrence === place.occurrence) ?? nodes(place.key)[0]; if (!node) return false;
    const range = document.createRange(), texts = [], walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let text; (text = walk.nextNode());) texts.push(text);
    const point = (at, end) => {
      for (const text of texts) { if (at <= text.length) { range[end ? 'setEnd' : 'setStart'](text, at); return; } at -= text.length; }
      range[end ? 'setEnd' : 'setStart'](node, node.childNodes.length);
    };
    point(place.from, false); point(place.to, true); valueElement(node).focus({ preventScroll: true });
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); saved = range.cloneRange(); return true;
  };
  const destroy = () => { adapter()?.focus?.(null, null); for (const state of states.values()) if (state.dirty || state.error) adapter()?.draft?.(state.token, null); };
  return { make, attach, snapshot, refresh, prepare, capture, focus, commit, restore, cancel, beforeInput, paste, key, bookmark, restoreSelection, destroy };
}
return { create, fieldAt, valueOf, valueElement };
})();
