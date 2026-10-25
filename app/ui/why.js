// Why a formula gave what it gave, in words a lawyer reads, the same wherever a computed record is
// explained: in the record panel (beside the chart and on a record's page), in the Calendar and the
// calendar it exports, and on Home. It leads with what the form means, as the chart describes it
// (descriptionOf); then come the facts that decided it here; and the formula, with everything it read,
// folds underneath for whoever wants the working. It also says which checks don't hold, for Home and a
// record's header. One global, `Why`; loaded after parts.js, with its styles in why.css.

const Why = (() => {
  // The definition that has a say in a record, computed or entered over its formula, if one does.
  const definitionFor = id => { const info = records[id] && formulaInfo(id); return info ? definitionOf(info.def) : null; };
  // What a record's form means, in words, if the chart says.
  const descriptionFor = id => { const f = records[id] && formKeyOf(id); return f ? descriptionOf(f) : ''; };

  // ---- Checks ----
  // A tag's formula written with = says yes or no: it attests the tag or rules it out. Implications (←)
  // only ever attest, so a tag they don't reach is simply not shown to hold. A tag an = formula rules out
  // is therefore a check that doesn't hold, and says what's missing: a governing agreement not on file,
  // owners not all charted. A tag entered over its formula is someone's word, and counts only where the
  // formula agrees with it.
  function fails(id) {
    const r = records[id];
    if (!r || !isTag(r) || r.tag) return false;
    const info = formulaInfo(id), d = info && definitionOf(info.def);
    return !!d && !d.implications && (isComputed(id) || info.formula === false);
  }
  // The checks that don't hold among some records (all of them by default), by definition, each with what
  // its form means and the records it fails for; those failing most often first.
  function failing(ids = Object.keys(records)) {
    const byDef = new Map();
    for (const id of ids) if (fails(id)) {
      const def = formulaInfo(id).def;
      if (!byDef.has(def)) byDef.set(def, { def: definitionOf(def), description: descriptionFor(id), ids: [] });
      byDef.get(def).ids.push(id);
    }
    return [...byDef.values()].sort((a, b) => b.ids.length - a.ids.length || byLabel(a.def.name, b.def.name));
  }

  // ---- What a formula read ----

  // The names a formula looks up where it's worked out: bracketed or bare, but not a function's or a
  // relation's (before a "("), not one looked up on something else (after a dot), and not quoted text.
  function namesIn(d) {
    const text = [d.formula, ...(d.implications ?? []).map(i => i.formula)].filter(Boolean).join(' ').replace(/"[^"]*"/g, '""');
    const out = new Set();
    for (const m of text.matchAll(/(\.\s*)?(?:\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*)\b)(?!\s*\()/g)) if (!m[1]) out.add(norm(m[2] ?? m[3]));
    return out;
  }

  // The entries a formula names where it's worked out, looked up as it looks them up (the location, then
  // what it's in, up to its object), each with the record found there or none: [{ label, datatype, id }].
  // A name that's no entry there (a function's, a list's, one a LET gives) isn't among them.
  function namedEntries(id, d) {
    const names = namesIn(d), own = norm(records[id].edge ?? '');
    const out = [];
    for (const at of pathTo(records[id].at).reverse()) for (const p of schemaAt(at)) {
      const n = norm(p.label);
      if (!names.has(n) || n === own || out.some(x => norm(x.label) === n)) continue;
      const found = entriesOf(at).find(k => same(records[k].edge, p.label) && typeOf(records[k]) === p.type);
      out.push({ label: p.label, datatype: p.datatype, id: found ?? null });
    }
    return out;
  }

  // An output as a fact states it: a value, an option, or a tag attested or not.
  const outText = r => isField(r) ? displayValue(r) : isChoice(r) ? r.choice : r.tag ? 'attested' : 'ruled out';

  // A record a formula read, as its working lists it: where it is, and what it says. A relation's
  // `details` are the fields at it that were read too, like an ownership's Percentage.
  function readText(id, details = []) {
    const r = records[id];
    if (isObject(r)) return objectName(id);
    const sides = rel => records[rel].args.map(a => placeName(a.at)).join(' → ');
    if (isRelation(r)) return `${sides(id)} (${[relationNameOf(id), ...details.map(d => `${records[d].edge} ${displayValue(records[d])}`)].join(', ')}${isTag(r) && !r.tag ? ', ruled out' : ''})`;
    const [head, ...tail] = pathTo(id);
    const start = isRelation(records[head]) ? `${relationNameOf(head)} (${sides(head)})` : objectName(head);
    return `${start} › ${tail.map(segmentText).join(' › ')}${isField(r) ? `: ${displayValue(r)}` : ''}`;
  }
  // What a formula read, for its working: each relation with the fields read at it folded in, those with
  // values first, since they usually decide it.
  function readItems(ids) {
    const read = new Set(ids);
    const folded = ids.filter(k => isField(records[k]) && isRelation(records[records[k].at] ?? {}) && read.has(records[k].at));
    return ids.filter(k => !folded.includes(k)).map(k => ({ id: k, details: folded.filter(f => records[f].at === k) }))
      .sort((a, b) => b.details.length - a.details.length || isRelation(records[b.id]) - isRelation(records[a.id]))
      .map(x => ({ id: x.id, text: readText(x.id, x.details) }));
  }
  const readsOf = (id, info) => (Array.isArray(info.reads) ? info.reads : Object.values(info.reads ?? {}).flat()).filter(k => records[k] && k !== id);

  // ---- The facts that decided it ----
  // What decided a record, in words, out of what its formula read:
  // - a date: the dates it's worked out from, and those it names but finds blank, which are what would move
  //   it on ("No Annual Tax Paid is recorded since its Formation Date, February 11, 2025");
  // - anything else: the relatives on each list it looked at, with what it read of each ("Owners: Fund III
  //   (49%), …"), a list it names that's empty, and the entries it names but finds blank. Where it looked at
  //   no list, the entries it read here instead, since then they're what decided it;
  // - an implication's attestation, or a relation's: the clause that held, as the engine says it.
  // Each fact is markup, naming records through `link`.
  function factsOf(id, link) {
    const r = records[id], d = definitionFor(id), info = formulaInfo(id);
    if (!isComputed(id)) return [];
    if (d.implications || isRelation(r)) return explained(id).map(x => `${x.label ? `<span class="why-clause">${esc(x.label)}</span> ` : ''}${esc(x.text)}`);
    const reads = readsOf(id, info);
    const named = namedEntries(id, d);
    if (isField(r) && r.field === 'date') return dateFacts(id, named);
    const blanks = named.filter(x => !x.id).map(x => `${esc(x.label)}: not recorded`);
    const lists = listFacts(id, d, reads, link);
    const chain = new Set(pathTo(r.at));
    const here = lists.length ? [] : reads.filter(k => !isRelation(records[k]) && !isObject(records[k]) && chain.has(records[k].at))
      .map(k => `${esc(records[k].edge)}: ${esc(outText(records[k]))}`);
    return [...lists, ...here, ...blanks];
  }

  function dateFacts(id, named) {
    const dates = named.filter(x => x.datatype === 'date');
    const blank = dates.filter(x => !x.id).map(x => x.label);
    const latest = dates.filter(x => x.id).sort((a, b) => records[b.id].value.localeCompare(records[a.id].value))[0];
    const from = latest && `its ${latest.label}, ${displayValue(records[latest.id])}`;
    if (blank.length) return [esc(`No ${joinList(blank, 'or')} is recorded${latest ? ` since ${from}` : ''}.`)];
    if (!latest) return [];
    return [esc(`Worked out from ${from}${Parts.daysUntil(records[id].value) < 0 ? ', and nothing later is recorded' : ''}.`)];
  }

  // The relatives a formula read on each of its lists, as seen from where it's worked out, and the lists
  // it names that are empty there. Percentages read one to a relative are added up.
  function listFacts(id, d, reads, link) {
    const chain = new Set(pathTo(records[id].at));
    const items = new Map();
    for (const k of reads) {
      const r = records[k];
      const own = isRelation(r) && r.args.find(a => chain.has(a.at)), other = own && r.args.find(a => !chain.has(a.at));
      if (other) items.set(k, { list: listName(formKeyOf(k), own.edge, other.edge), obj: objectOf(other.at), details: [] });
    }
    for (const k of reads) {
      const r = records[k];
      if (isRelation(r) || isObject(r) || chain.has(r.at)) continue;
      const item = items.get(r.at) ?? [...items.values()].find(x => x.obj === objectOf(k));
      if (item) item.details.push(r);
    }
    const lists = new Map();
    for (const x of items.values()) pushTo(lists, x.list, x);
    const names = namesIn(d);
    for (const at of chain) for (const t of relationTypesAt(at))
      if (names.has(norm(t.list)) && !lists.has(t.list) && !relationGroups(at).some(g => same(g.list, t.list))) lists.set(t.list, []);
    return [...lists].map(([list, xs]) => {
      if (!xs.length) return `${esc(list)}: none`;
      const pcts = xs.map(x => x.details.filter(r => isField(r) && r.field === 'percent'));
      const total = xs.length > 1 && pcts.every(p => p.length === 1) ? `, ${esc(showValue('percent', pcts.reduce((s, p) => s + p[0].value, 0)))} in all` : '';
      return `${esc(list)}: ${xs.map(x => `<a href="${esc(link(x.obj))}">${esc(objectName(x.obj))}</a>${x.details.length ? ` (${esc(x.details.map(outText).join(', '))})` : ''}`).join(', ')}${total}`;
    });
  }

  // The engine's own account (Formulas.explain): for each implication that held, what decided it; for a
  // value formula, the condition of the IF or IFS branch it took.
  function explained(id) {
    const out = new Map();
    for (const e of Formulas.explain(formulaResult, id)) if (e.text) out.set(e.label ?? '', [...(out.get(e.label ?? '') ?? []), e.text]);
    return [...out].map(([label, texts]) => ({ label, text: texts.join(' · ') }));
  }

  // What an entered record a formula also covers says against it.
  function standing(id, d, defLink) {
    const info = formulaInfo(id);
    return {
      differs: `Entered here. ${defLink} gives ${esc(Parts.formulaText(d, info.formula))}.`,
      agrees: `Entered here, and ${defLink} gives the same.`,
      overrides: `Ruled out here, overriding ${defLink}, which implies it.`,
      'also implied': `Entered here, and also implied by ${defLink}.`,
    }[info.mark] ?? `${defLink} also covers this.`;
  }

  // ---- Drawing ----

  // Which explanations have their working unfolded, by record, so drawing again keeps it so.
  const unfolded = new Set();
  document.addEventListener('toggle', e => {
    const id = e.target.dataset?.whyFold;
    if (id !== undefined) e.target.open ? unfolded.add(id) : unfolded.delete(id);
  }, true);

  // Where a record or a definition leads, by its address (a record's id, or definition:<id>), on a page
  // without the panel: its page, or the Schema.
  const pageHref = hash => hash.startsWith('definition:') ? `schema.html#${hash}` : Shell.recordHref(hash);

  // The explanation of a record, as markup. `href(hash)` gives where its links lead; `actions` go last.
  function html(id, { href = pageHref, actions = '', cls = '' } = {}) {
    const d = definitionFor(id);
    if (!d) return '';
    const info = formulaInfo(id);
    const defLink = `<a class="why-def" href="${esc(href(`definition:${d.id}`))}">${esc(d.name)}</a>`;
    const description = descriptionFor(id);
    const lead = (isComputed(id) ? '' : `<p class="why-standing">${standing(id, d, defLink)}</p>`)
      + (description ? `<p class="why-desc">${esc(description)}</p>`
        : isComputed(id) ? `<p class="why-desc is-none">Worked out by ${defLink}. <a class="why-describe" href="${esc(href(`definition:${d.id}`))}">Say what it means</a></p>` : '');
    const facts = factsOf(id, href);
    const line = (label, inner) => `<div class="why-line"><span class="why-label">${esc(label)}</span><span class="why-text">${inner}</span></div>`;
    const held = d.implications ? d.implications.filter(i => !info.labels?.length || info.labels.includes(i.label)) : [];
    const rule = d.implications ? held.map(i => `${i.label ? `${esc(i.label)}  ` : ''}${esc(i.formula)}`).join('\n') : esc(d.formula ?? '');
    const because = d.implications || isRelation(records[id]) ? [] : explained(id);
    const reads = readItems(readsOf(id, info));
    const working = line(d.implications ? 'Implied by' : 'Formula', `<code class="why-formula">${rule}</code>`)
      + because.map(x => line('Because', esc(x.text))).join('')
      + (!isComputed(id) && d.implications ? explained(id).map(x => line(x.label || 'Because', esc(x.text))).join('') : '')
      + (reads.length ? line('Read', reads.slice(0, 6).map(x => `<a href="${esc(href(x.id))}">${esc(x.text)}</a>`).join('<span class="why-sep">·</span>')
        + (reads.length > 6 ? ` <span class="why-more-count">and ${reads.length - 6} more</span>` : '')) : '');
    return `<div class="why${cls ? ` ${cls}` : ''}">${lead}
      ${facts.length ? `<ul class="why-facts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>` : ''}
      <details class="why-working" data-why-fold="${esc(id)}"${unfolded.has(id) ? ' open' : ''}><summary>${esc(d.name)}’s formula, and what it read</summary>${working}</details>
      ${actions ? `<div class="why-actions">${actions}</div>` : ''}</div>`;
  }

  // The same in plain text, a sentence or two, for where markup can't go: an exported calendar, a title.
  function text(id) {
    if (!definitionFor(id)) return '';
    const strip = s => s.replace(/<[^>]+>/g, '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
    return [descriptionFor(id), ...factsOf(id, () => '').map(strip)].filter(Boolean).join('\n');
  }

  return { html, text, fails, failing, readText, readItems, definitionFor, descriptionFor };
})();
