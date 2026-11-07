// One in-place text editor at a time. The canvas supplies placement and a record-aware
// Words adapter; this module owns only focus, the overlay and handoff to other controls.
const CanvasWords = (() => {
const active = preactSignals.signal(null);
const selectionState = preactSignals.signal(null);
const event = (name, detail) => {
  const el = active.peek()?.element.querySelector('.words-in');
  return el ? !el.dispatchEvent(new CustomEvent(name, { detail, cancelable: true })) : false;
};
const flush = () => {
  const el = active.peek()?.element.querySelector('.words-in');
  return !el || el.dispatchEvent(new CustomEvent('dendra:commit-text', { cancelable: true }));
};
const set = (label, value) => event('dendra:format-text', { label, value });
const focus = () => active.peek()?.element.querySelector('.words-in')?.focus({ preventScroll: true });
function insert(label, point) {
  const el = active.peek()?.element.querySelector('.words-in');
  if (!el) return false;
  if (point) {
    let range = document.caretRangeFromPoint?.(point.x, point.y);
    if (!range && document.caretPositionFromPoint) {
      const at = document.caretPositionFromPoint(point.x, point.y);
      if (at) { range = document.createRange(); range.setStart(at.offsetNode, at.offset); range.collapse(true); }
    }
    if (!range || !el.contains(range.startContainer)) return false;
    const chip = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement)?.closest('[data-token]');
    if (chip && el.contains(chip)) {
      const rect = chip.getBoundingClientRect();
      range[point.x < rect.left + rect.width / 2 ? 'setStartBefore' : 'setStartAfter'](chip); range.collapse(true);
    }
    el.focus({ preventScroll: true });
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }
  return event('dendra:insert-field', label);
}
function close(options) { return active.peek()?.close(options) ?? true; }
function open({ id, host, style, render, finished, selectAll = false, formatting, bindings, dragSelection, point }) {
  if (!close()) return null;
  // Commit before the sidebar is replaced; an unmounted stale draft must never win later.
  const panel = document.querySelector('.inspector .words-in');
  if (panel && !panel.dispatchEvent(new CustomEvent('dendra:commit-text', { cancelable: true }))) return null;
  const element = document.createElement('div'); element.className = 'dc-edit dc-text-editor';
  element.dataset.textLayer = id;
  for (const [name, value] of Object.entries(style ?? {})) {
    if (name.startsWith('--')) element.style.setProperty(name, value); else element.style[name] = value;
  }
  host.append(element);
  let closing = false, blockedClick = null;
  const end = ({ commit = true } = {}) => {
    if (closing) return true;
    if (commit && !flush()) return false;
    closing = true; removeEventListener('pointerdown', outside, true); removeEventListener('click', clicked, true);
    preact.render(null, element); element.remove(); active.value = null; selectionState.value = null; formatting?.changed?.(null); finished?.(); return true;
  };
  const outside = e => {
    blockedClick = null;
    if (!e.target.closest?.('.dc-text-editor, .canvas-text-handoff, .design-field-palette, .field-extraction, .fb, .float, dialog') && !end()) {
      blockedClick = e.target.closest?.('button, a, input, select, [role="button"]') ?? e.target;
      e.preventDefault(); e.stopImmediatePropagation();
    }
  };
  const clicked = e => { if (blockedClick && (blockedClick === e.target || blockedClick.contains?.(e.target))) { blockedClick = null; e.preventDefault(); e.stopImmediatePropagation(); } };
  element.addEventListener('pointerdown', e => e.stopPropagation());
  element.addEventListener('keydown', e => e.stopPropagation());
  active.value = { id, element, close: end };
  preact.render(render({ finish: end, label: 'Canvas text', formatting, bindings, selectionChanged: value => { selectionState.value = value; }, dragSelection }), element);
  addEventListener('pointerdown', outside, true);
  addEventListener('click', clicked, true);
  const el = element.querySelector('.words-in');
  if (el) {
    el.focus({ preventScroll: true });
    let range = point && document.caretRangeFromPoint?.(point.x, point.y);
    if (!range && point && document.caretPositionFromPoint) {
      const at = document.caretPositionFromPoint(point.x, point.y);
      if (at) { range = document.createRange(); range.setStart(at.offsetNode, at.offset); range.collapse(true); }
    }
    if (!range || !el.contains(range.startContainer)) { range = document.createRange(); range.selectNodeContents(el); if (!selectAll) range.collapse(false); }
    const field = typeof BoundWords !== 'undefined' && BoundWords.fieldAt(range.startContainer);
    const value = field && BoundWords.valueElement(field);
    if (value?.contentEditable === 'plaintext-only') value.focus({ preventScroll: true });
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }
  return element;
}
return { active, selection: selectionState, open, close, flush, focus, insert, set };
})();
