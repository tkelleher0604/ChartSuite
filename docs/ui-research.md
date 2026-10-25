# Research: great UIs to learn from

Exemplars, patterns and tokens for Rboreal, gathered October 2026. [design.md](design.md) is what the app takes from them.

## 1. Design principles

1. **The work is the loudest thing on screen.** Linear's latest refresh made the sidebar "a few notches dimmer" so the main work area leads. Its rule is "don't compete for attention you haven't earned." Figma UI3's goal is to "center your ideas, not Figma's UI."
2. **Structure should be felt, not seen.** Linear cut its dividers and lowered their contrast. Vercel's Geist system says to draw each border once and keep shadows translucent.
3. **Dense, but with hierarchy.** Keep many rows on screen, but don't give every element equal weight (Linear). Carta's design system, Ink, has a dedicated "Data Dense Views" pattern, because finance users expect density.
4. **Colour is scarce, so it carries meaning.** Linear held back its accent colour and generates every theme from three variables (base, accent and contrast) in the LCH colour space. Stripe rebuilt its palette in a perceptual colour space so that "no single color appears to take priority" at any step.
5. **Stable layouts earn trust.** Figma rolled back floating and auto-hiding panels because they were "too unstable," and concluded "speed is a feature." Linear moved header actions back into predictable places.
6. **Labels beat icons.** Linear reduced its icons and made them smaller. Figma dropped icon-only controls because they hurt accessibility. This matches your few-icons rule.
7. **Show where every value came from.** Airtable's record history names the user, or the automation, behind each change. Athennian builds charts live from records and recommends dating every chart. In a system of record, who changed what, when, and from which source must be one click away, and computed values must look different from entered ones.
8. **Undo is better than "Are you sure?"** Vercel's guidelines: update the UI optimistically, give destructive actions an undo window, and confirm only when undo is impossible.

## 2. Patterns to adopt

**App shell.** A sidebar about 240px wide that can be resized and hidden; Vercel moved its tabs into one in February 2026. Linear lets users reorder and hide sidebar items, choose a count or a dot for unread items, and pin Favorites.
- Suggested order: workspace switcher, Search (Ctrl/⌘K), Home, Charts, Tables (one entry per kind), Documents, Calendar, History, then Favorites (pinned records and saved charts), with Schema and Settings at the bottom.
- Mute inactive items.
- A 48px top bar on each page: breadcrumb and title on the left, page actions on the right, always in the same order (Linear). The theme switch lives in the user menu.

**Command palette and search.** Superhuman's rules:
- the same shortcut works everywhere;
- matching is fuzzy and accepts synonyms (typing "GP" finds "General partner");
- ranking depends on where the user is;
- each command shows its shortcut, so the palette teaches the shortcuts;
- one palette handles every kind of action.

From Raycast, borrow the actions panel: Enter runs the primary action, and Ctrl/⌘K on a selected item lists its other actions, grouped by purpose, with shortcuts right-aligned. Recent items appear before the user types. Entity results show their kind and jurisdiction, because legal names collide.

**Tables.**
- **Airtable:** typed cells, and a linked-record picker with search, "+ Add new record" and × to unlink.
- **Attio:** columns can show fields of linked records. Filter changes revert unless the view is saved, so show Save view and Reset buttons once a view is changed.
- **Linear:** F opens filters. Each filter reads as property, operator, value ("is", "is not", "is either of"), and the filters go into the URL.
- **Stripe:** filters are chips above the table. An unset chip reads "+ Status"; an active chip shows its value and an ×. Chip labels match the column headers, and "Clear filters" appears only while a filter is active.
- **Rows:** 32px high, with a sticky header and a sticky Name column. Numbers are right-aligned in tabular figures (Vercel). No zebra striping.
- **Editing:** Enter or double-click to edit, Esc to cancel, Tab to move to the next cell. Computed columns are read-only and look different.

**Record detail.** Attio's 2026 record page:
- name, key facts and primary actions at the top left;
- attributes on the left, "where your eye lands first";
- a search box across all attributes;
- sections you can resize;
- comments in a side sheet;
- automation events collapsed in the activity timeline.

Ironclad opens its "metapanel" on top of the current view, so a record can be checked without losing your place. Build one component that serves both as a 440px side panel and as a full page. Rows use a muted label column and a primary-colour value column. Figma's lesson applies: put the most-used fields first.

**Relation chips.**
- **Notion** lets you choose which fields of a linked record appear in the relation.
- **Attio** relations are two-way: editing one side updates the other.
- **Chip spec:** 22px high, 4px radius, neutral fill. It shows the name plus one chosen field ("Fund III LP · 42.5%"). Hovering shows the kind and jurisdiction; clicking opens the side panel.
- **Computed relations:** a dashed border in the computed colour, no ×, and a "Why?" link that explains the formula.

**Empty states and onboarding.** Stripe's rules:
- The title states what is missing: "No documents linked yet."
- The description is under 14 words and says when data will appear.
- The action echoes the title ("Link document"), never "Get started!"
- An empty result caused by filters gets a different message and a Clear filters link.
- An empty section uses a compact box with a 1px dashed border.
- Render in this order: loading, then error, then empty, then content.

For onboarding, follow Stripe's demo-content pattern: offer a sample structure and an Excel import first.

**Toasts and undo.** Sonner, the default toast in shadcn/ui, used by Vercel: toasts stack, last 4 seconds by default, pause on hover and while the tab is hidden, and animate with transitions that can be interrupted.
- Toast only to confirm what the user just did, always with Undo, and support Ctrl/⌘Z too.
- Keep bulk-edit toasts up for about 8 seconds.
- Announce toasts through a polite live region (Vercel).
- Errors that need action appear inline, not in toasts.

**Diagram canvas chrome.**
- **Toolbar:** Figma UI3 and tldraw both put a slim tool bar at the bottom centre.
- **Zoom and minimap:** tldraw puts the zoom percentage and minimap at the bottom left. Miro puts them at the bottom right, with M for the minimap and a fit-to-screen button. tldraw's "eagle eye" (press Z, then hold Shift) shows the whole canvas with a viewport brush, which suits large structures well.
- **Properties:** a fixed, resizable right-hand panel, which is Figma's lesson. Lucid's 2026 editor adds a mini bar above the selection. Miro users complain when such a bar appears on every drag, so show it only on a click without a drag.
- **Quick add:** Whimsical's quick-add handles and Alt+Arrow create a connected shape in the last-used style. In Rboreal this becomes "Add subsidiary below," which creates the entity and its ownership relation together.
- **From Athennian:** filters by jurisdiction, type and ownership threshold; connection scopes (downward, upward and downward, and related); colours, styles and arrows set per relation type; links from boxes to their records; and a dashboard of saved charts.

**Documents.** A table, not tiles. The file-type icon is the one icon that earns its place; use Microsoft's Fluent file-type icons (`@fluentui/react-file-type-icons`) so they match SharePoint. Columns: name, type, linked records, effective date, modified by and when, and the SharePoint folder as a muted path. Selecting a row opens a preview pane. The primary action is "Open in SharePoint ↗".

**Calendar and timelines.** Default to an agenda list grouped into Overdue, This week, Next 30 days and Later, with a month grid as a toggle. Athennian's calendar shows each due date with its priority and assignee; Diligent's gathers pending events and reminders in one view. Each row shows the date (tabular figures), the event, an entity chip, the owner and the status. Mark dates derived by a rule as computed.

**Activity and audit.**
- **Linear** groups similar consecutive events and collapses older activity between comments.
- **Attio** collapses automation events.
- **Airtable** names the user or automation behind each change.
- **Entry format:** actor, action, field, the old value struck through, the new value, a relative time (exact time on hover), and the source (UI, import or formula).
- **Controls:** filter by actor, field or record, and a Restore action on each change.

**Settings.** A list of sections on the left and a single column of about 720px. Each setting group sits in a card with a title, a one-line description, the control, and a Save button in the card footer for consequential changes. This is Vercel's settings layout as seen in its dashboard; I couldn't find a written source for it. Personal preferences save automatically. The danger zone comes last. Keep Schema as a working view, not inside Settings.

**Export dialog.**
- **Diligent's model:** pick charts and sub-charts, each showing visible and total entity counts; each chart becomes one slide; options for "Include legend" and "Fully expand structure"; the export runs in the background with a progress bar and a notification.
- **Formats:** Athennian exports PDF and images, and its best-practice post adds SVG and PNG.
- **Native shapes:** Lucid users complain that PowerPoint embeds arrive as blurry images, so export native, editable shapes and text.
- **Dialog layout:**
  - format: PDF, PowerPoint, PNG or SVG;
  - scope: current view, selection or saved views;
  - page size: Letter, A4 or 16:9;
  - fit to page;
  - legend;
  - an as-of date stamp and footer;
  - a live preview on the right.

## 3. Visual design tokens

**Type (Inter).** Letter-spacing comes from Inter's published tracking formula, −0.0223 + 0.185·e^(−0.1745·size) em.

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| caption | 11/16 | 500 | +0.005em | timestamps, metadata |
| small | 12/16 | 400–500 | 0 | chips, badges |
| body-dense | 13/20 | 400 | −0.003em | tables, property lists, sidebar |
| body | 14/20 | 400 | −0.006em | default text, forms |
| title-sm | 16/24 | 600 | −0.011em | section and dialog titles |
| title | 20/28 | 600 | −0.017em | page titles |
| title-lg | 24/32 | 600 | −0.019em | record names |
| display | 32/40 | 600 | −0.022em | Home header, title slide |

- Use only weights 400, 500 and 600.
- Turn on `tnum` (tabular figures) for numbers, percentages and dates.
- Add `zero` (slashed zero) and `ss02` (distinct look-alike characters) for identifiers such as EIN, LEI and CIK.
- Avoid all-caps labels.

**Spacing.** A 4px grid: 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 48, 64.

| Element | Size |
|---|---|
| Top bar | 48px |
| Sidebar | 240px (200–320) |
| Table rows | 32px (compact 28, comfortable 40) |
| Controls | 28px, 32px or 36px |
| Side panel | 440px (360–640) |
| Page gutter | 24px (16px on narrow screens) |

**Radii.**

| Radius | Use |
|---|---|
| 4px | chips, checkboxes |
| 6px | buttons, inputs, menu items |
| 8px | cards, popovers |
| 12px | dialogs |
| full | avatars |
| 2–4px | chart boxes, to keep print fidelity |

**Colour.** The neutrals are Radix "Sand", a warm grey in line with Linear's move to "warmer gray". The accent is Radix Indigo. The semantic colours are Radix too; all values were verified against the published files.

| Role | Light | Dark |
|---|---|---|
| App background | #FFFFFF (content), #F9F9F8 (sidebar) | #111110, #191918 |
| Raised surface (menus, dialogs) | #FFFFFF | #222221 |
| Hover row | #F1F0EF | #222221 |
| Selected row | #EDF2FE (indigo-3) | #182449 |
| Divider | #E2E1DE | #31312E |
| Border (cards, inputs) | #DAD9D6 | #3B3A37 |
| Strong border / hover | #CFCECA | #494844 |
| Text | #21201C | #EEEEEC |
| Secondary text | #63635E | #B5B3AD |
| Placeholder / disabled only | #8D8D86 | #6F6D66 |
| Accent solid / hover | #3E63DD / #3358D4 | #3E63DD / #5472E4 |
| Accent text / link | #3A5BC7 | #9EB1FF |

**Semantic colours**, each given as subtle background / border / solid / text.

| Meaning | Light | Dark |
|---|---|---|
| Success | #E6F6EB / #ADDDC0 / #30A46C / #218358 | #132D21 / #20573E / #30A46C / #3DD68C |
| Warning | #FFF7C2 / #F3D673 / #FFC53D / #AB6400 | #302008 / #5C3D05 / #FFC53D / #FFCA16 |
| Danger | #FEEBEC / #FDBDBE / #E5484D / #CE2C31 | #3B1219 / #72232D / #E5484D / #FF9592 |
| Computed (purple) | #F7EDFE / #E0C4F4 / #8E4EC6 / #8145B5 | #301C3B / #54346B / #8E4EC6 / #D19DFF |

- **Why purple for computed:** it is clearly apart from the indigo accent.
- **How "computed" is marked:** the value keeps the normal text colour. The mark is a dashed border or line in the computed colour, plus a tooltip naming the formula. Since the dash carries the meaning too, it doesn't rely on hue alone.
- **Tags:** your green attested and red ruled-out tags use the success and danger solids.

**Shadows.**

| Level | Light | Dark |
|---|---|---|
| 1 | `0 1px 2px rgb(33 32 28/.06)` | no shadow, border only |
| 2 (menus) | `0 0 0 1px rgb(33 32 28/.06), 0 4px 12px -2px rgb(33 32 28/.10)` | `0 0 0 1px rgb(255 255 255/.08), 0 8px 24px rgb(0 0 0/.5)` |
| 3 (dialogs) | `…0 16px 40px -8px rgb(33 32 28/.18)` | `…0 24px 56px rgb(0 0 0/.6)` |

**Focus ring.** Use `:focus-visible` with a 2px solid outline and a 2px offset; inside table cells use an inset (−2px) offset.
- **Light theme:** #3E63DD, about 5:1 against white.
- **Dark theme:** #9EB1FF.

This meets WCAG 2.4.13 (2px, 3:1), and every focusable element gets the ring (Vercel).

## 4. Motion and interaction

**Motion**
- **What to animate:** only colour, opacity and transform. Never use `transition: all`, and honour reduced-motion settings (Vercel).
- **Hover:** a 100–120ms colour change.
- **Menus and popovers:** 150–200ms of fade plus a 4px slide.
- **Side panels and dialogs:** about 200–250ms.
- **Exits:** about 75% of the entry duration.
- **Easing:** ease-out, `cubic-bezier(.23,1,.32,1)`. Keep UI animation under 300ms, following Emil Kowalski's guidance as restated by third parties.
- **On the canvas:** animate zoom-to-fit and layout changes so users can follow where boxes moved. This is a trust issue: nothing should move silently.

**Tooltips:** delay the first tooltip in a group, then show its neighbours with no delay (Vercel). Include the shortcut in the tooltip.

**Optimistic updates:** apply edits instantly and reconcile with the server afterwards. On failure, revert, show an inline error and offer retry. Show "Saving…" only if saving takes more than about a second. Keep the latency budget for edits under 500ms (Vercel).

**Loading:**
- Wait 150–300ms before showing a loading state, and keep it visible for at least 300–500ms (Vercel).
- Skeletons must mirror the final layout exactly. Use static grey bars with no shimmer, which is calmer.
- Prefer showing cached data while refreshing in the background, so most navigation is instant.

**Keyboard shortcuts** (show Ctrl in hints on Windows):

| Area | Keys |
|---|---|
| Everywhere | Ctrl/⌘K palette; G then a letter to jump to a page (Linear's "G then I" style); ? opens the shortcut sheet |
| Lists and tables | F filter; J/K or arrows move; X selects; Enter opens or edits; Space previews; Esc closes |
| Undo | Ctrl/⌘Z, Shift+Ctrl/⌘Z |
| Canvas (Figma conventions) | Shift+1 fit all; Shift+2 zoom to selection; Shift+\ hide the UI |

## 5. Anti-patterns

- **Visual noise:** rainbow tag colours, badges on every row, zebra striping combined with gridlines, all-caps headers, decorative kind or type icons.
- **Icon-only controls:** Figma reversed them.
- **Modal overload:** use side panels and inline editing instead, and confirmation dialogs only where undo is impossible.
- **Unstable layouts:** auto-hiding panels and toolbars that pop up on every selection (Miro complaints), or rearranging the chrome under long-time users (complaints about Lucid removing its top toolbar).
- **Errors in toasts:** critical information gets missed there.
- **Marketing copy in empty states**, and "create your first…" shown when data exists but is filtered out (Stripe).
- **Hidden provenance:** computed values that look entered, charts with no as-of date, silently cut-off legal names (show the full name on hover), and edits with no named actor.
- **Image-only exports.**

## 6. The five main screens

**Home.** A working page, not a KPI dashboard.
- Left two-thirds: "Needs attention" (deadlines in the next 30 days, required fields missing, formula conflicts), Recently viewed, and Saved charts with name, home entity and last edited (Athennian's dashboard).
- Right third: an agenda of upcoming dates and team activity.

**Chart.** A full-bleed canvas.
- **Top bar:** chart name, as-of date picker, saved view and style dropdowns, Present, Export.
- **Bottom centre:** a slim toolbar.
- **Bottom left:** zoom percentage, fit, and minimap.
- **Right:** a resizable properties panel that reuses the record component.
- **Legend:** can be toggled, and is carried into exports.
- **Present mode:** hides all chrome.

**Table.**
- **Header:** the kind's name, saved-view tabs, and the filter-chip row.
- **View menu:** sort, grouping, columns and density.
- **Body:** sticky Name column, typed editors, a bottom action bar for bulk selections.
- **Opening records:** a click opens the side panel; Ctrl/⌘Enter opens the full page.

**Record.** Attio's layout.
- **Header:** name, kind, key facts and actions at the top left.
- **Left:** a searchable list of properties, where tags are green or red checkbox rows and choices are dropdowns.
- **Right tabs:**
  - Relations, grouped by type, with computed ones marked;
  - Documents;
  - Dates;
  - History.
- **Comments:** in a side sheet.

**Documents.** Facet filters on the left (entity, document type, date), a table in the centre with Fluent file-type icons and linked-record chips, and a preview pane on the right. "Open in SharePoint" is the primary action.

## Sources

- https://linear.app/blog/how-we-redesigned-the-linear-ui
- https://linear.app/blog/behind-the-latest-design-refresh
- https://linear.app/changelog/2024-12-18-personalized-sidebar
- https://linear.app/changelog/2025-04-03-collapsed-issue-history
- https://linear.app/docs/filters
- https://linear.app/docs/favorites
- https://vercel.com/design/guidelines
- https://vercel.com/geist/colors
- https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- https://vercel.com/blog/dashboard-redesign
- https://stripe.com/blog/accessible-color-systems
- https://docs.stripe.com/stripe-apps/patterns
- https://docs.stripe.com/stripe-apps/patterns/empty-state
- https://docs.stripe.com/stripe-apps/patterns/filter-controls
- https://attio.com/changelog/2026/record-page-redesign
- https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views
- https://attio.com/help/reference/managing-your-data/attributes/relationship-attributes
- https://support.airtable.com/docs/linking-records-in-airtable
- https://support.airtable.com/docs/record-level-revision-history-overview
- https://www.notion.com/help/relations-and-rollups
- https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/
- https://manual.raycast.com/action-panel
- https://www.figma.com/blog/behind-our-redesign-ui3/
- https://www.figma.com/blog/our-approach-to-designing-ui3/
- https://help.figma.com/hc/articles/23954856027159
- https://tldraw.dev/sdk-features/ui-components
- https://tldraw.dev/releases/v4.4.0
- https://community.lucid.co/next-generation-of-lucidchart-37/introducing-the-new-lucidchart-editor-14112
- https://community.lucid.co/ideas/feedback-wanted-export-to-microsoft-powerpoint-and-word-11042
- https://help.miro.com/hc/en-us/articles/360017731053
- https://community.miro.com/ideas/want-to-be-able-to-move-pin-or-hide-the-floating-editing-toolbar-15695
- https://help.whimsical.com/article/636-getting-started-with-flowcharts
- https://plus.excalidraw.com/blog/excalidraw-in-2024
- https://www.athennian.com/capabilities/structure-charts
- https://www.athennian.com/post/best-practices-in-org-charting
- https://athennian.com/product-updates/february-feature-release-2026
- https://diligent.com/features/entities/organizational-chart-software-new
- https://www.diligent.com/features/entities/entity-compliance-new
- https://help.diligentoneplatform.com/helpdocs/d1p/es/Content/entities/group-structure-visualisation/create-powerpoint-export.htm
- https://www.cscglobal.com/service/entity-management
- https://ink.carta.com/patterns
- https://ironcladapp.com/blog/dynamic-contract-repository/
- https://emilkowal.ski/ui/building-a-toast-component
- https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- https://cdn.jsdelivr.net/npm/@radix-ui/colors@3.0.0/ (sand, indigo, green, amber, red, purple CSS)
- https://rsms.me/inter/
- https://d.rsms.me/inter-website/v3/dynmetrics/
- https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22
- https://classic.yarnpkg.com/en/package/@fluentui/react-file-type-icons

**Gaps in the sources:**
- Clio's redesign post returned a 403 error, so it isn't cited.
- Height shut down in 2025, so I didn't use it.
- Carta and Ironclad publish little detail about their UIs.
- The Vercel settings layout comes from looking at the product, not from a written source.
- The motion durations come from third-party summaries of Emil Kowalski's guidance, not from his own writing.