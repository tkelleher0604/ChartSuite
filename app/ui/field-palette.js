// A field picker for a visual editor. Field discovery, insertion and dragging belong to its adapter.
// `fields` contains { label, value, related?, used?, fresh? }; this control never writes records.
const FieldPalette = (() => {
const html = htm.bind(preact.h), { useState } = preactHooks;
return function FieldPalette({ fields, insert, create, drag, readOnly = false, target = 'the selected text' }) {
  const [query, setQuery] = useState(''), match = Tree.norm(query);
  const visible = fields.filter(f => Tree.norm(`${f.label} ${f.value ?? ''}`).includes(match));
  const own = visible.filter(f => !f.related), related = visible.filter(f => f.related);
  const row = f => html`<button type="button" class="design-field" data-field=${f.label} aria-label=${`Insert ${f.label}`} disabled=${readOnly}
    title=${f.value ? `${f.label}: ${f.value}` : `${f.label}: no value on this object yet`}
    onPointerDown=${e => drag?.(e, f)} onClick=${() => insert(f.label)}>
    <span class="field-grip" aria-hidden="true">⠿</span><span class="field-copy"><span class="field-name">${f.label}</span><span class=${'field-sample' + (f.value ? '' : ' empty')}>${f.value || 'No value yet'}</span></span>
    ${f.fresh ? html`<span class="field-state">New</span>` : f.used ? html`<span class="field-used" aria-label="Already used">✓</span>` : html`<span class="field-add" aria-hidden="true">+</span>`}
  </button>`;
  return html`<section class="design-field-palette" aria-label="Merge fields">
    <div class="design-section-title"><h3>Fields</h3>${create ? html`<button type="button" class="btn ghost" disabled=${readOnly} onClick=${() => create(query)}>New field</button>` : null}</div>
    <p class="design-help">Click to insert into ${target}, or drag a field onto the card.</p>
    <input type="search" class="field-search" aria-label="Find a merge field" placeholder="Find a field…" value=${query} onInput=${e => setQuery(e.target.value)} />
    <div class="design-field-list">
      ${own.map(row)}
      ${related.length ? html`<div class="field-group">Related objects</div>${related.map(row)}` : null}
      ${!visible.length ? html`<p class="design-empty">${query ? `No fields match “${query}”.` : 'Create a field for a value that changes between objects.'}</p>` : null}
    </div>
  </section>`;
};
})();
