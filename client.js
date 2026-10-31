/**
 * Client half of the `dsh-better-skillmanager` bundle — 技能 / Skills.
 *
 * Registers two seats of the same feature:
 *   - `sidebar.panellist` (list, id === PANEL_ID) -> the icon in the left rail
 *   - `main`              (keyed, key === PANEL_ID) -> the page it opens
 * The two ids must stay identical, otherwise clicking the icon cannot resolve
 * a panel.
 *
 * Data comes from the host half over two same-origin JSON routes
 * (`/dsh-skills/list`, `/dsh-skills/skill?name=`), because the host `skills`
 * registry is process-local and not exposed to the browser context.
 */
window.__ModuleLoader__.load({
  id: 'dsh-better-skillmanager',

  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const PANEL_ID = 'skills';
    const PKG = 'dsh-better-skillmanager';
    const ROUTE = '/dsh-better-skillmanager';

    /* ------------------------------------------------------------------ */
    /* locale                                                              */
    /* ------------------------------------------------------------------ */

    // Reads the active language without subscribing; used for the seat label.
    function readLang(ctx) {
      const loc = ctx && ctx.locale;
      if (!loc) return 'zh';
      let raw;
      try {
        const snap =
          typeof loc.getSnapshot === 'function' ? loc.getSnapshot()
            : typeof loc.getLocale === 'function' ? loc.getLocale()
              : undefined;
        raw = snap && typeof snap === 'object'
          ? (snap.active || snap.locale || snap.language)
          : snap;
        if (!raw && typeof loc.current === 'function') raw = loc.current();
        if (!raw && typeof loc.current === 'string') raw = loc.current;
        if (!raw) raw = loc.language;
      } catch (err) {
        raw = undefined;
      }
      return String(raw || 'zh').toLowerCase().indexOf('en') === 0 ? 'en' : 'zh';
    }

    // Reactive variant: re-renders the page when the language flips.
    function useLocale(ctx) {
      const [lang, setLang] = React.useState(function () {
        return readLang(ctx);
      });

      React.useEffect(function () {
        const loc = ctx && ctx.locale;
        if (!loc) return undefined;
        const subscribe = loc.onChange || loc.subscribe || loc.watch || loc.addEventListener;
        if (typeof subscribe !== 'function') return undefined;

        const handler = function () {
          setLang(readLang(ctx));
        };
        let off;
        try {
          off = subscribe.call(loc, handler);
        } catch (err) {
          return undefined;
        }
        if (typeof off === 'function') return off;

        return function () {
          const unsubscribe = loc.offChange || loc.unsubscribe || loc.removeEventListener;
          if (typeof unsubscribe === 'function') {
            try {
              unsubscribe.call(loc, handler);
            } catch (err) {
              /* ignore */
            }
          }
        };
      }, []);

      return function t(en, zh) {
        return lang === 'en' ? en : zh;
      };
    }

    /* ------------------------------------------------------------------ */
    /* icon                                                               */
    /* ------------------------------------------------------------------ */

    // Original glyph: a skill drawer (one filled tab, one sparkle), drawn at
    // whatever `size` the rail owner passes.
    function PanelGlyph(props) {
      const size = (props && props.size) || 16;
      const active = !!(props && props.active);
      // Same artwork as icon.svg: a bookmarked-stack glyph drawn as one path,
      // so the sidebar seat and the bundle icon stay identical.
      return h(
        'svg',
        {
          viewBox: '0 0 1024 1024',
          width: size,
          height: size,
          fill: active ? 'var(--dsw-alias-brand-primary, #2b6cb0)' : 'currentColor',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block', pointerEvents: 'none', opacity: active ? 1 : 0.9 },
        },
        h('path', { d: BOOKMARK_PATH }),
      );
    }

    // Magnifier for the search field; both panes use it so the two toolbars
    // read as the same control.
    function SearchGlyph(props) {
      const size = (props && props.size) || 14;
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.9,
          strokeLinecap: 'round',
          'aria-hidden': true,
          focusable: 'false',
          style: { display: 'block', flex: '0 0 auto', opacity: 0.5, pointerEvents: 'none' },
        },
        h('circle', { cx: 10.5, cy: 10.5, r: 6.5 }),
        h('path', { d: 'M15.4 15.4L20 20' }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* styles                                                             */
    /* ------------------------------------------------------------------ */

    const CSS = `
.dsk-page {
  /* Positioning context for .dsk-tip-layer, whose coordinates are measured
     relative to this box. */
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  background: var(--dsw-alias-bg-base, #f7f8fa);
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-crash {
  margin: 28px 26px;
  padding: 18px 20px;
  border-radius: 12px;
  border: 1px solid #e04b4b;
  background: rgba(224, 75, 75, 0.08);
  overflow: auto;
}
.dsk-crash-h {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: #e04b4b;
}
.dsk-crash-msg {
  margin: 0 0 10px;
  font-size: 13px;
  line-height: 1.6;
}
.dsk-crash-pre {
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  font-size: 11.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
}
.dsk-crash-hint {
  margin: 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsk-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 26px 14px;
  flex: 0 0 auto;
}
.dsk-glyph {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-brand-primary, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.dsk-h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-sub {
  margin: 3px 0 0;
  font-size: 12.5px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-grow { flex: 1 1 auto; min-width: 0; }
.dsk-hbtn {
  /* Import and Refresh sit side by side and must look like a pair. */
  min-width: 86px;
  justify-content: center;
  padding: 8px 10px;
}
/* Enable / disable switch: parks SKILL.md instead of deleting the skill. */
.dsk-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: 0 0 auto;
  padding: 4px 10px 4px 5px;
  border-radius: 999px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.dsk-switch:hover { border-color: rgba(127, 127, 127, 0.55); }
.dsk-switch:disabled { opacity: 0.55; cursor: default; }
.dsk-switch-track {
  position: relative;
  width: 30px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.4);
  transition: background 0.16s ease;
}
.dsk-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.16s ease;
}
.dsk-switch[data-on='true'] .dsk-switch-track { background: #1f9254; }
.dsk-switch[data-on='true'] .dsk-switch-knob { transform: translateX(14px); }
.dsk-switch-label { font-size: 12.5px; line-height: 1; }
.dsk-tag-off {
  background: rgba(127, 127, 127, 0.18);
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsk-item[data-off='true'] .dsk-item-title { color: var(--dsw-alias-label-secondary, #6b7280); }

.dsk-btn {
  appearance: none;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-primary, #1f2329);
  font: inherit;
  font-size: 12.5px;
  line-height: 1;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  gap: 6px;
  white-space: nowrap;
}
.dsk-btn:hover:not(:disabled) {
  border-color: var(--dsw-alias-brand-primary, #3b82f6);
  color: var(--dsw-alias-brand-primary, #3b82f6);
}
.dsk-btn:disabled { opacity: 0.55; cursor: default; }
.dsk-search .dsk-btn {
  padding: 4px 9px;
  font-size: 11.5px;
  flex: 0 0 auto;
}
.dsk-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  /* The band below the tab strip: both panes use it, so the search field sits
     the same distance from the tabs whichever tab is open. */
  padding: 18px 26px 12px;
  flex: 0 0 auto;
}
.dsk-filterbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 26px 14px;
}
.dsk-search {
  /* Capped, not full-bleed: the storefront field shares its row with the
     category dropdown on the browse tab. */
  flex: 0 1 720px;
  max-width: 720px;
  min-width: 170px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12));
  background: var(--dsw-alias-bg-layer-1, #fff);
}
.dsk-search input {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 13px;
}
.dsk-manage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dsk-body {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(240px, 330px) minmax(0, 1fr);
  gap: 16px;
  padding: 12px 26px 22px;
}
.dsk-list {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dsk-item {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 10px;
}
.dsk-item-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.dsk-item:hover { background: rgba(127,127,127,0.09); }
.dsk-item[data-active='true'] {
  /* Explicit accent: the theme brand token can resolve near-white on dark
     themes, which used to paint a white bar on the left edge. */
  background: rgba(76, 154, 255, 0.16);
  box-shadow: inset 2px 0 0 #4c9aff;
}
.dsk-item[data-active='true']:hover { background: rgba(76, 154, 255, 0.2); }
.dsk-item-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary, #1f2329);
  word-break: break-word;
}
/* Title plus its trust badges, on one line: only the title may shrink. */
.dsk-item-titlerow {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.dsk-item-titlerow .dsk-item-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Tag row above the key/value list in the manager detail pane. */
.dsk-tagrow {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
.dsk-detail-titlerow {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.dsk-placeholder {
  margin: 24px 0;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  font-size: 13px;
}
.dsk-tools {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}
.dsk-tool-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.07);
  min-width: 0;
}
.dsk-tool-name {
  flex: 0 0 auto;
  font-family: ui-monospace, "SFMono-Regular", "Cascadia Code", Consolas, monospace;
  font-size: 12px;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-tool-desc {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-item-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dsk-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.dsk-tag {
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12));
  border-radius: 999px;
  padding: 0 7px;
  font-size: 10.5px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  white-space: nowrap;
}
.dsk-tag[data-tone='ok'] {
  border-color: transparent;
  background: rgba(34,160,107,0.14);
  color: var(--dsw-alias-state-success-primary, #22a06b);
}
.dsk-tag[data-tone='warn'] {
  border-color: transparent;
  background: rgba(234, 179, 8, 0.18);
  color: var(--dsw-alias-state-warn-primary, #b45309);
}
/* Badge with a leading key glyph: "needs an API key". */
.dsk-tag-key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}
.dsk-tag[data-tone='brand'] {
  border-color: transparent;
  background: rgba(59,130,246,0.14);
  color: var(--dsw-alias-brand-primary, #3b82f6);
}
/* Source chip that fills the tag row when a skill has no market tags, so the
   intro block below keeps the same offset across skills. */
.dsk-tag-muted {
  background: rgba(127, 127, 127, 0.12);
  border-color: transparent;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-detail {
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1, #fff);
  padding: 18px 20px 28px;
}
.dsk-detail-h {
  margin: 0;
  font-size: 16.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary, #1f2329);
  word-break: break-word;
}
.dsk-detail-slug {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  word-break: break-all;
}
.dsk-kv {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 7px 12px;
  margin: 16px 0 0;
  font-size: 12.5px;
  line-height: 1.5;
}
.dsk-kv dt { color: var(--dsw-alias-label-secondary, #6b6f76); }
.dsk-kv dd {
  margin: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
  word-break: break-all;
}
.dsk-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
}
.dsk-sec {
  margin: 26px 0 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-text {
  margin: 12px 0 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.8;
  color: var(--dsw-alias-label-primary, #1f2329);
  white-space: pre-wrap;
  word-break: break-word;
}
.dsk-pre {
  margin: 8px 0 0;
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08));
  background: rgba(127,127,127,0.07);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--dsw-alias-label-primary, #1f2329);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 46vh;
  overflow: auto;
}
.dsk-empty {
  margin: auto;
  padding: 40px 20px;
  text-align: center;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-error {
  margin: 16px 0 0;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid rgba(220,38,38,0.35);
  background: rgba(220,38,38,0.08);
  color: #b91c1c;
  font-size: 12.5px;
  line-height: 1.6;
  word-break: break-word;
}
.dsk-foot {
  flex: 0 0 auto;
  padding: 0 26px 16px;
  font-size: 11.5px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
  background: rgba(127,127,127,0.08);
  line-height: 1;
  user-select: none;
}
.dsk-mark img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dsk-mark-letter {
  border-color: transparent;
  font-weight: 600;
  letter-spacing: 0.01em;
}
.dsk-detail-top {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.dsk-btn-danger {
  border-color: rgba(220,38,38,0.4);
  color: #b91c1c;
}
.dsk-btn-danger:hover:not(:disabled) {
  border-color: #dc2626;
  color: #fff;
  background: #dc2626;
}
.dsk-tabs {
  display: flex;
  gap: 2px;
  padding: 0 26px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.08));
}
.dsk-tab {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  font: inherit;
  font-size: 13px;
  padding: 9px 12px 10px;
  margin-bottom: -1px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dsk-tab:hover { color: var(--dsw-alias-label-primary, #1f2329); }
.dsk-tab[data-on='true'] {
  color: var(--dsw-alias-label-primary, #1f2329);
  border-bottom-color: var(--dsw-alias-brand-primary, #247bbf);
  font-weight: 600;
}
.dsk-tab-count {
  font-size: 11px;
  font-weight: 500;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(127,127,127,0.14);
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-browse {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 0 0 44px;
}
.dsk-browse-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 10px;
  padding: 0 26px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-sort {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
.dsk-controls { align-items: center; gap: 8px; padding: 0 26px 12px; }
.dsk-sorttabs { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; }
.dsk-sorttab {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  font: inherit;
  font-size: 12.5px;
  line-height: 1;
  padding: 7px 11px;
  border-radius: 7px;
  cursor: pointer;
}
.dsk-sorttab:hover {
  background: rgba(127,127,127,0.08);
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-sorttab[data-on='true'] {
  background: rgba(127,127,127,0.14);
  color: var(--dsw-alias-label-primary, #1f2329);
  font-weight: 600;
}
.dsk-sort select {
  font: inherit;
  font-size: 12.5px;
  /* Sits directly after the search field, on the same 36px baseline. */
  height: 36px;
  padding: 0 10px;
  border-radius: 9px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.12));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: inherit;
}
.dsk-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  /* 12px matches .dsk-body's top inset, so the grid and the manager list start
     on the same line under the tab strip. */
  padding: 12px 26px 0;
}
.dsk-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 13px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
  background: var(--dsw-alias-bg-layer-1, #fff);
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease;
  /* Grid items default to min-width:auto, so one long unbreakable string would
     widen the whole column. */
  min-width: 0;
}
.dsk-card:hover {
  border-color: var(--dsw-alias-brand-primary, #247bbf);
  transform: translateY(-1px);
}
.dsk-card-head { display: flex; align-items: flex-start; gap: 9px; }
.dsk-card-titlewrap { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
/* Name plus the market's state icons, all on the title's baseline. */
.dsk-card-titlerow { display: flex; align-items: center; gap: 5px; min-width: 0; }
.dsk-name-ico { display: inline-flex; align-items: center; flex: 0 0 auto; line-height: 0; }
/* A name badge that can carry a hover card. */
.dsk-badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  line-height: 0;
  border-radius: 4px;
  outline: none;
}
.dsk-badge:focus-visible {
  box-shadow: 0 0 0 2px #2b6cb0;
}
/* Hover card: dark bubble under the badge, arrow pointing at it. */
/* The layer sits directly under .dsk-page, never inside a scroll container. */
.dsk-tip-layer {
  position: absolute;
  z-index: 90;
  /* The wrapper must not swallow clicks on the page, but the card itself has
     to stay clickable for its 查看报告 links. */
  pointer-events: none;
}
.dsk-tip {
  position: relative;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  /* Requested explicitly: an inline-block-ish card would otherwise shrink to
     the width of its container. */
  width: max-content;
  max-width: 340px;
  padding: 9px 11px;
  border-radius: 8px;
  background: #1b2029;
  color: #eef1f5;
  font-size: 12px;
  line-height: 1.45;
  font-weight: 400;
  text-align: left;
  /* Long legal entities wrap inside the 340px cap instead of overflowing. */
  white-space: normal;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
/* Arrow: the layer is anchored 10px left of the badge, and the badge is
   ~15px wide, so the arrow sits at the badge's centre. */
.dsk-tip::before {
  content: '';
  position: absolute;
  top: -4px;
  left: 13px;
  width: 9px;
  height: 9px;
  background: #1b2029;
  transform: rotate(45deg);
}
/* Invisible bridge across the gap between badge and card: without it the card
   vanishes the moment the pointer leaves the badge on its way down. */
.dsk-tip::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: -10px;
  height: 10px;
}
/* Rows are a 3-column grid so the verdict and the report link line up between
   labs instead of drifting with how wide each verdict is. */
.dsk-tip-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 8px;
}
.dsk-tip-wrap { white-space: normal; }
.dsk-tip-key { white-space: nowrap; }
.dsk-tip-lab { color: #9aa3ad; }
.dsk-tip-verdict { font-weight: 600; }
.dsk-tip-link {
  margin-left: auto;
  color: #7fb0ff;
  text-decoration: none;
}
.dsk-tip-link:hover { text-decoration: underline; }
.dsk-card-title {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary, #1f2329);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsk-card-ns {
  font-size: 11px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsk-card-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dsk-card-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.dsk-card-foot {
  /* Fixed slots, not flex: a 5-figure download count must not push the
     stars or the freshness left/right from one card to the next. */
  display: grid;
  grid-template-columns: 44px 66px minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 4px;
  row-gap: 4px;
  margin-top: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary, #6b6f76);
  min-width: 0;
  overflow: hidden;
}
.dsk-card-stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsk-card-stat svg { opacity: 0.85; }
.dsk-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 18px 26px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary, #6b6f76);
}
/* Detail is a right-side inspector drawer, pinned to the panel edge like the
   skill market's own browser: the page stays visible behind a scrim, and the
   drawer keeps its own header, scrolling body and action row. */
.dsk-backdrop {
  position: fixed;
  /* Cleared from the window's own minimise / maximise / close controls: a
     drawer pinned to y=0 ran straight over them. */
  inset: var(--dsk-drawer-top, 40px) 0 0 0;
  z-index: 60;
  background: rgba(0,0,0,0.32);
  backdrop-filter: blur(1px);
  animation: dsk-fade-in 0.18s ease;
}
.dsk-modal {
  position: fixed;
  top: var(--dsk-drawer-top, 40px);
  right: 0;
  bottom: 0;
  z-index: 61;
  width: min(560px, 94%);
  display: flex;
  flex-direction: column;
  background: var(--dsw-alias-bg-layer-1, #fff);
  border-left: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
  border-top-left-radius: 12px;
  box-shadow: -18px 0 48px rgba(0,0,0,0.24);
  animation: dsk-slide-in 0.24s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes dsk-slide-in {
  from { transform: translateX(102%); }
  to { transform: none; }
}
@keyframes dsk-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.dsk-modal-h {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0,0,0,0.1));
}
/* The title block is the only flexible cell: the management buttons keep a
   fixed spot on the name's baseline row however long the name is. */
.dsk-modal-h .dsk-detail-h {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsk-modal-h .dsk-detail-slug {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsk-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 22px 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsk-modal-content { display: flex; flex-direction: column; gap: 12px; }
/* Management buttons sit on the title row, right of the name. */
.dsk-modal-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}
.dsk-cta {
  appearance: none;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  padding: 11px 20px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  transition: filter 120ms ease, background 120ms ease;
}
.dsk-cta:disabled { opacity: 0.6; cursor: default; }
/* Card-sized variant of the primary action, same palette as the drawer CTA. */
.dsk-cta-sm {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 8px;
}
/* "Installed" is the same pill shape as the install button, in the success
   colour, but it is a state marker rather than a control. */
.dsk-cta-installed {
  background-color: #1f9254;
  border-color: #1f9254;
  color: #ffffff;
  cursor: default;
  user-select: none;
}
/* The CTA palette is deliberately self-contained: the host's
   --dsw-alias-brand-primary resolves to a near-white accent in the dark theme,
   which turned a filled button into white-on-white text. */
.dsk-cta-primary {
  background-color: #2b6cb0;
  border-color: #2b6cb0;
  color: #ffffff;
}
.dsk-cta-primary:hover:not(:disabled) {
  background-color: #245b96;
  border-color: #245b96;
}
.dsk-cta-danger {
  background-color: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.dsk-cta-danger:hover:not(:disabled) { background-color: #b91c1c; border-color: #b91c1c; }
.dsk-cta-outline-danger {
  background-color: transparent;
  border-color: rgba(224, 75, 75, 0.7);
  color: #e04b4b;
}
.dsk-cta-outline-danger:hover:not(:disabled) {
  background-color: #dc2626;
  border-color: #dc2626;
  color: #ffffff;
}
.dsk-cta-ghost {
  background-color: transparent;
  border-color: rgba(127, 127, 127, 0.45);
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-cta-ghost:hover:not(:disabled) {
  border-color: rgba(127, 127, 127, 0.8);
}
.dsk-actions-error {
  flex: 1 1 100%;
  min-width: 0;
  margin-top: 2px;
  font-size: 12px;
  color: #dc2626;
  word-break: break-word;
}
.dsk-modal-close {
  appearance: none;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 17px;
  line-height: 1;
  padding: 2px 6px;
  cursor: pointer;
  opacity: 0.55;
}
.dsk-modal-close:hover { opacity: 1; }
.dsk-overview {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.78;
  color: var(--dsw-alias-label-primary, #1f2329);
}
/* ---- local import dialog ---- */
.dsk-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 24px;
}
.dsk-dialog {
  width: min(560px, 100%);
  max-height: min(76vh, 680px);
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12));
  background: var(--dsw-alias-bg-layer-1, #fff);
  box-shadow: 0 26px 70px rgba(0, 0, 0, 0.34);
  overflow: hidden;
}
.dsk-dialog-h {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 18px 13px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
}
.dsk-dialog-h h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-dialog-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dsk-dialog-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1));
  background: var(--dsw-alias-bg-layer-2, rgba(127, 127, 127, 0.05));
}
.dsk-dialog-note {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsk-drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 26px 18px;
  border-radius: 12px;
  border: 1.5px dashed var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.45));
  background: rgba(127, 127, 127, 0.06);
  color: var(--dsw-alias-label-secondary, #6b7280);
  text-align: center;
  transition: border-color 120ms ease, background 120ms ease;
}
.dsk-drop[data-drag='true'] {
  border-color: #2b6cb0;
  background: rgba(43, 108, 176, 0.12);
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-drop input[type='file'] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.dsk-drop-title {
  font-size: 13px;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-drop-hint {
  font-size: 11.5px;
  line-height: 1.6;
}
.dsk-types {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.dsk-type-row {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--dsw-alias-label-secondary, #6b7280);
}
.dsk-type-ext {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127, 127, 127, 0.35));
  justify-self: start;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  padding: 7px 10px;
  border-radius: 9px;
  background: rgba(127, 127, 127, 0.08);
}
.dsk-file-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-primary, #1f2329);
}
.dsk-file-size {
  flex: 0 0 auto;
  color: var(--dsw-alias-label-secondary, #6b7280);
  font-variant-numeric: tabular-nums;
}
.dsk-file-drop {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #6b7280);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 2px 4px;
}
.dsk-file-drop:hover { color: #dc2626; }
.dsk-result-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.55;
}
.dsk-result-row[data-ok='true'] { color: #1f9254; }
.dsk-result-row[data-ok='false'] { color: #dc2626; }
.dsk-result-mark { flex: 0 0 auto; }
.dsk-result-text { flex: 1 1 auto; min-width: 0; word-break: break-word; }
@media (max-width: 880px) {
  .dsk-page { overflow-y: auto; }
  .dsk-body { grid-template-columns: minmax(0, 1fr); }
  .dsk-list { max-height: 46vh; }
}
`;

    /* ------------------------------------------------------------------ */
    /* data                                                               */
    /* ------------------------------------------------------------------ */

    async function getJson(path) {
      const response = await fetch(path, { headers: { accept: 'application/json' } });
      let body = null;
      try {
        body = await response.json();
      } catch (err) {
        body = null;
      }
      if (!response.ok || !body || body.ok !== true) {
        const reason =
          (body && (body.message || body.error)) || response.status + ' ' + response.statusText;
        const error = new Error(String(reason));
        error.status = response.status;
        throw error;
      }
      return body;
    }

    async function postJson(path, payload) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      let body = null;
      try {
        body = await response.json();
      } catch (err) {
        body = null;
      }
      if (!response.ok || !body || body.ok !== true) {
        const reason =
          (body && (body.message || body.error)) || response.status + ' ' + response.statusText;
        const error = new Error(String(reason));
        error.status = response.status;
        throw error;
      }
      return body;
    }

    function sourceLabel(t, source) {
      switch (source) {
        case 'user-dsh':
        case 'user-agents':
          return t('Installed', '本机安装');
        case 'project-dsh':
        case 'project-agents':
          return t('Project', '项目内');
        case 'skill-market':
          return t('Market install', '市场安装');
        case 'local-disk':
          return t('On disk', '磁盘上');
        case 'custom':
          return t('Custom', '自定义');
        case 'bundled':
          return t('Built-in', '内置');
        case 'runtime':
          return t('Runtime', '运行时');
        default:
          return source || t('Unknown', '未知');
      }
    }

    function tag(text, tone, key) {
      return h(
        'span',
        { className: 'dsk-tag', 'data-tone': tone || 'plain', key: key || text },
        text,
      );
    }

    /** Key glyph for the "needs an API key" badge, drawn at tag size. */
    function KeyGlyph() {
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: 11,
          height: 11,
          'aria-hidden': true,
          style: { display: 'block', flex: '0 0 auto' },
        },
        h('path', {
          d: 'M10.2 1.4a4.4 4.4 0 0 0-4.1 5.9L1.5 11.9v2.6h2.6v-1.7h1.7V11h1.7l1.4-1.4a4.4 4.4 0 1 0 1.3-8.2Zm1.5 2.9a1.2 1.2 0 1 1-1.7-1.7 1.2 1.2 0 0 1 1.7 1.7Z',
          fill: 'currentColor',
        }),
      );
    }

    /** Amber "needs an API key" badge, as the market shows it next to the tags. */
    function keyRequiredTag(t) {
      return h(
        'span',
        { className: 'dsk-tag dsk-tag-key', 'data-tone': 'warn', key: 'needs-api-key' },
        h(KeyGlyph, null),
        t('Needs an API key', '需配置 API Key'),
      );
    }

    /** Where the skill was published from: an enterprise account or the community. */
    function sourceTag(t, source) {
      if (source === 'enterprise') return tag(t('Official skill', '官方技能'), 'brand', 'source');
      if (source === 'community') return tag(t('Community', '社区来源'), 'plain', 'source');
      return null;
    }

    // Shield-with-tick glyph supplied by the user for the security badge. The
    // tick is a hole in the path, so the surrounding colour shows through and
    // no second overlay path is needed.
    const SECURITY_SHIELD_PATH =
      'M884.4 195.3l-36.9-0.6c-0.9 0-83.5-1.8-168.9-36.4-87.6-35.5-144-76.3-144.5-76.8l-22.3-16.1-22.1 16.1c-0.5 0.4-57 41.2-144.5 76.8-85.3 34.6-168 36.4-168.8 36.4l-37 0.6v375.4c0 188.5 242.3 387.8 372.5 387.8 130.3 0 372.6-199.3 372.6-387.8 0.1 0.2-0.1-375.4-0.1-375.4zM520.2 516.5L668 368.7c12.4-12.4 32.8-12.4 45.3 0 12.4 12.5 12.4 32.8 0 45.3L471.8 655.5c-6.2 6.2-14.4 9.3-22.7 9.3-8.2 0-16.4-3.1-22.6-9.3L310.7 539.7c-12.4-12.4-12.4-32.8 0-45.3 12.4-12.4 32.8-12.4 45.3 0l93.2 93.2 71-71.1';

    // Rosette-with-tick glyph supplied by the user for the certification badge.
    const CERT_ROSETTE_PATH =
      'M956.672 459.776L862.72 397.568c-16.64-11.008-24.832-30.976-20.992-50.688l22.272-110.592c4.096-20.736-2.304-42.24-17.152-57.344-15.104-15.104-36.352-21.504-57.344-17.152l-110.592 22.272c-19.712 4.096-39.424-4.352-50.688-20.992L565.76 69.12c-11.776-17.664-31.488-28.16-52.736-28.16s-40.96 10.496-52.736 28.16l-62.464 93.952c-11.008 16.64-30.976 24.832-50.688 20.992l-110.592-22.272c-20.736-4.096-42.24 2.304-57.344 17.152-15.104 15.104-21.504 36.352-17.152 57.344l22.272 110.592c3.84 19.712-4.352 39.424-20.992 50.688l-93.952 62.464c-17.664 11.776-28.16 31.488-28.16 52.736s10.496 40.96 28.16 52.736l93.952 62.464c16.64 11.008 24.832 30.976 20.992 50.688l-22.272 110.592c-4.096 20.736 2.304 42.24 17.152 57.344 15.104 15.104 36.352 21.504 57.344 17.152l110.592-22.272c19.712-4.096 39.424 4.352 50.688 20.992l62.464 93.952c11.776 17.664 31.488 28.16 52.736 28.16s40.96-10.496 52.736-28.16l62.464-93.952c11.008-16.64 30.976-24.832 50.688-20.992l110.592 22.272c20.736 4.096 42.24-2.304 57.344-17.152 15.104-15.104 21.504-36.352 17.152-57.344l-22.272-110.592c-3.84-19.712 4.352-39.424 20.992-50.688l93.952-62.464c17.664-11.776 28.16-31.488 28.16-52.736s-10.496-41.216-28.16-52.992z m-249.344-22.016l-211.456 215.04c-5.888 6.144-13.824 9.216-22.016 9.216-7.168 0-14.592-2.56-20.224-7.68l-138.24-122.112c-12.8-11.264-13.824-30.72-2.816-43.264 11.264-12.8 30.72-13.824 43.264-2.816l116.48 102.912 190.976-194.304c11.776-12.032 31.232-12.288 43.52-0.256 12.288 11.52 12.288 30.976 0.512 43.264z';

    /* A single hover-card layer per page. Cards cannot live inside the badge:
       the manager list is a scroll container, so anything positioned inside it
       is clipped away — which is exactly why the badges in the left column
       showed nothing at all while the same badges in the detail pane worked. */
    const tipStore = { current: null, listeners: new Set() };

    function emitTip(next) {
      tipStore.current = next;
      tipStore.listeners.forEach((listener) => listener(next));
    }

    function showTip(anchor, content, label) {
      if (!anchor || !content) return;
      emitTip({ anchor, content, label });
    }

    function hideTip() {
      if (tipStore.current) emitTip(null);
    }

    /** Rendered once per page, outside every scroll container. */
    function TipsLayer() {
      const [tip, setTip] = React.useState(tipStore.current);
      React.useEffect(() => {
        tipStore.listeners.add(setTip);
        return () => tipStore.listeners.delete(setTip);
      }, []);
      if (!tip) return null;
      let left = 12;
      let top = 12;
      try {
        const rect = tip.anchor.getBoundingClientRect();
        // The layer is absolutely positioned inside .dsk-page, so coordinates
        // are taken relative to that page and stay correct under shell
        // transforms and zoom.
        const page = tip.anchor.closest('.dsk-page');
        const origin = page ? page.getBoundingClientRect() : { left: 0, top: 0, width: 1280 };
        const width = page ? page.clientWidth || origin.width : 1280;
        left = Math.max(8, Math.min(rect.left - origin.left - 10, width - 348));
        top = rect.bottom - origin.top + 9;
      } catch (error) {
        left = 12;
        top = 12;
      }
      return h(
        'div',
        { className: 'dsk-tip-layer', style: { left: left + 'px', top: top + 'px' } },
        h('div', { className: 'dsk-tip', role: 'tooltip' }, tip.content),
      );
    }

    /* Sidebar / bundle icon, from the 24gl-bookmarks SVG. */
    const BOOKMARK_PATH =
      'M832 981.333333a21.333333 21.333333 0 0 1-11.333333-3.24l-330-206.266666-330 206.266666a21.333333 21.333333 0 0 1-32.666667-18.093333V181.333333a53.393333 53.393333 0 0 1 53.333333-53.333333h618.666667a53.393333 53.393333 0 0 1 53.333333 53.333333v778.666667a21.333333 21.333333 0 0 1-21.333333 21.333333z m-341.333333-256a21.333333 21.333333 0 0 1 11.333333 3.24l308.666667 192.933334V181.333333a10.666667 10.666667 0 0 0-10.666667-10.666666H181.333333a10.666667 10.666667 0 0 0-10.666666 10.666666v740.173334l308.666666-192.933334a21.333333 21.333333 0 0 1 11.333334-3.24z m448 64V96a53.393333 53.393333 0 0 0-53.333334-53.333333H320a21.333333 21.333333 0 0 0 0 42.666666h565.333333a10.666667 10.666667 0 0 1 10.666667 10.666667v693.333333a21.333333 21.333333 0 0 0 42.666667 0z';

    /* Card stat glyphs, from the SVGs the user supplied. Drawn with
       currentColor so they follow the muted stat text in both themes. */
    const STAR_PATH =
      'M512 150.25664c7.1424 0 20.224 2.2272 27.59168 17.152l81.24416 164.61312a82.0224 82.0224 0 0 0 61.78816 44.91264l181.69344 26.40384c16.46592 2.39104 22.6304 14.14656 24.83712 20.9408 2.20672 6.79424 4.13184 19.92192-7.7824 31.5392l-131.48672 128.16384a82.03776 82.03776 0 0 0-23.58272 72.61184l31.03744 180.96128c1.6128 9.41568-0.54272 17.72032-6.40512 24.6784-6.08256 7.21408-15.01696 11.52-23.90016 11.52-4.83328 0-9.5232-1.2288-14.336-3.7632l-162.49856-85.43232a82.35008 82.35008 0 0 0-38.19008-9.43104c-13.25056 0-26.45504 3.26144-38.17984 9.42592L311.31648 869.9904c-4.75136 2.49856-9.5744 3.7632-14.336 3.7632-8.88832 0-17.8176-4.30592-23.90016-11.51488-5.8624-6.95808-8.01792-15.26272-6.40512-24.6784l31.03744-180.95104a82.03264 82.03264 0 0 0-23.59808-72.6272l-131.4816-128.16896c-11.91424-11.61728-9.99424-24.74496-7.7824-31.5392 2.20672-6.79424 8.36608-18.54464 24.83712-20.9408l181.69344-26.39872a81.9968 81.9968 0 0 0 61.7728-44.88192l81.25952-164.64384c7.36256-14.9248 20.44416-17.152 27.58656-17.152m0-71.79264c-36.57728 0-73.15968 19.05664-91.96544 57.16992L338.77504 300.27776a10.25536 10.25536 0 0 1-7.72096 5.61152L149.36064 332.288c-84.11648 12.22144-117.7088 115.59936-56.83712 174.92992l131.47648 128.15872c2.41664 2.3552 3.52256 5.74976 2.94912 9.07776l-31.03744 180.96128c-11.37152 66.29376 41.30304 120.12032 101.06368 120.12032 15.76448 0 32.04096-3.75296 47.744-12.0064l162.51392-85.43744a10.28096 10.28096 0 0 1 9.54368 0l162.51392 85.43744c15.70816 8.25856 31.96928 12.0064 47.744 12.0064 59.75552 0 112.43008-53.8368 101.06368-120.12032l-31.03744-180.96128a10.26048 10.26048 0 0 1 2.94912-9.07776l131.47648-128.15872c60.87168-59.33056 27.27936-162.70848-56.83712-174.92992l-181.69344-26.40384a10.25536 10.25536 0 0 1-7.72096-5.61152L603.97568 135.6288c-18.816-38.10816-55.3984-57.1648-91.97568-57.1648z';
    const DOWNLOAD_PATH =
      'M867.3 342.8L539.5 670.7V79.4c0-15.2-12.3-27.5-27.5-27.5s-27.5 12.3-27.5 27.5v591.3L156.7 342.8c-5.4-5.4-12.4-8-19.4-8-7 0-14.1 2.7-19.4 8-10.7 10.7-10.7 28.1 0 38.8l374.7 374.7c10.7 10.7 28.1 10.7 38.8 0l374.7-374.7c10.7-10.7 10.7-28.1 0-38.8-10.7-10.7-28.1-10.7-38.8 0z m129.2 574.4h-969C12.3 917.2 0 929.5 0 944.6c0 15.2 12.3 27.5 27.5 27.5h969.1c15.2 0 27.5-12.3 27.5-27.5-0.1-15.1-12.4-27.4-27.6-27.4z';
    const CLOCK_PATH =
      'M878.08 731.274667a32 32 0 0 1-54.88-32.938667A360.789333 360.789333 0 0 0 874.666667 512c0-200.298667-162.368-362.666667-362.666667-362.666667S149.333333 311.701333 149.333333 512s162.368 362.666667 362.666667 362.666667a360.789333 360.789333 0 0 0 186.314667-51.445334 32 32 0 0 1 32.928 54.88A424.778667 424.778667 0 0 1 512 938.666667C276.362667 938.666667 85.333333 747.637333 85.333333 512S276.362667 85.333333 512 85.333333s426.666667 191.029333 426.666667 426.666667c0 78.293333-21.152 153.568-60.586667 219.274667z m-548.704-81.898667L480 498.741333V320a32 32 0 0 1 64 0v192a32 32 0 0 1-9.376 22.624l-160 160a32 32 0 1 1-45.248-45.248z';

    function statGlyph(path, size) {
      return h(
        'svg',
        {
          viewBox: '0 0 1024 1024',
          width: size,
          height: size,
          'aria-hidden': true,
          focusable: 'false',
          style: { flex: '0 0 auto' },
        },
        h('path', { d: path, fill: 'currentColor' }),
      );
    }

    /**
     * A name badge plus its hover card. The card is only rendered when the
     * caller has detail to show (the storefront grid has none), so cards keep
     * the cheap native tooltip and the manager gets the rich one.
     */    function NameBadge(props) {
      const timer = React.useRef(null);
      const node = React.useRef(null);
      const canTip = !!props.tip;
      // Closing is delayed a beat: crossing the gap between the badge and the
      // card (or grazing its edge) must not make the card flicker away.
      const show = () => {
        if (!canTip) return;
        if (timer.current) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        showTip(node.current, props.tip, props.label);
      };
      const hide = () => {
        if (!canTip) return;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          hideTip();
        }, 160);
      };
      // Never leave a card behind when the badge disappears (tab switch, list
      // refresh) or the component unmounts.
      React.useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
      }, []);
      return h(
        'span',
        {
          ref: node,
          className: 'dsk-badge',
          title: canTip ? undefined : props.label,
          tabIndex: canTip ? 0 : undefined,
          onMouseEnter: canTip ? show : undefined,
          onMouseLeave: canTip ? hide : undefined,
          onFocus: canTip ? show : undefined,
          onBlur: canTip ? hide : undefined,
        },
        props.icon,
      );
    }

    /** Security badge: hovering it lists every lab verdict the market published. */
    function securityIcon(t, verified, reports, quiet) {
      if (!verified) return null;
      const icon = h(
        'svg',
        // The supplied glyph has ~5% internal padding, so it is drawn one pixel
        // larger than the neighbouring 14px badges to match their optical size.
        { viewBox: '0 0 1024 1024', width: 15, height: 15, 'aria-hidden': true },
        h('path', { d: SECURITY_SHIELD_PATH, fill: '#72bf06' }),
      );
      const rows = Array.isArray(reports) ? reports : null;
      const tip = !rows
        ? null
        : rows.length
          ? rows.map((row) =>
              h(
                'span',
                { className: 'dsk-tip-row', key: row.id },
                h('span', { className: 'dsk-tip-lab' }, row.lab),
                h('strong', { className: 'dsk-tip-verdict' }, row.statusText),
                row.reportUrl
                  ? h(
                      'a',
                      {
                        className: 'dsk-tip-link',
                        href: row.reportUrl,
                        target: '_blank',
                        rel: 'noreferrer noopener',
                      },
                      t('View report ↗', '查看报告 ↗'),
                    )
                  : null,
              ),
            )
          : h(
              'span',
              { className: 'dsk-tip-row' },
              t('No security report yet', '暂无安全报告'),
            );
      return h(NameBadge, {
        icon,
        // `quiet` is used by the manager list, which asks for no popup at all.
        tip: quiet ? null : tip,
        label: quiet ? '' : t('Security certified', '安全认证'),
      });
    }

    /**
     * Certification badge for enterprise publishers. Hovering shows the legal
     * entity behind the account, exactly as the market surfaces it.
     */
    function certIcon(t, source, certifiedName, quiet) {
      if (source !== 'enterprise') return null;
      const icon = h(
        'svg',
        { viewBox: '0 0 1024 1024', width: 14, height: 14, 'aria-hidden': true },
        h('path', { d: CERT_ROSETTE_PATH, fill: '#5396FF' }),
      );
      const name = quiet ? '' : String(certifiedName || '').trim();
      const tip = name
        ? h(
            'span',
            { className: 'dsk-tip-row dsk-tip-wrap' },
            h('span', { className: 'dsk-tip-key' }, t('Enterprise certified: ', '已完成企业认证：')),
            h('strong', null, name),
          )
        : null;
      return h(NameBadge, {
        icon,
        tip: quiet ? null : tip,
        label: quiet ? '' : t('Official skill', '官方技能'),
      });
    }

    function titleOf(skill) {
      return skill.title || skill.name;
    }

    /** The install directory's own name, which is what an uninstall addresses. */
    function dirNameOf(skill) {
      const parts = String((skill && skill.dir) || '')
        .split(/[\\/]+/)
        .filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    }

    function canUninstall(skill) {
      if (!skill || skill.source === 'bundled') return false;
      return !!dirNameOf(skill);
    }

    function initialsOf(skill) {
      const source = String(titleOf(skill) || (skill && skill.name) || '?').trim();
      const chars = Array.from(source.replace(/^[\s'"([{]+/u, ''));
      return (chars[0] || '?').toUpperCase();
    }

    function hueOf(value) {
      const source = String(value || '');
      let hash = 0;
      for (let index = 0; index < source.length; index += 1) {
        hash = (hash * 31 + source.charCodeAt(index)) % 1000;
      }
      return hash % 360;
    }

    /**
     * A skill's square mark: the market icon when there is one, otherwise a
     * letter tile. Icons are loaded through this plugin's own route, so a
     * blocked or slow CDN degrades to the tile rather than a broken image.
     */
    function SkillMark(props) {
      const skill = props.skill;
      const size = props.size || 28;
      const [failed, setFailed] = React.useState(false);
      const box = {
        width: size,
        height: size,
        borderRadius: Math.max(6, Math.round(size * 0.28)),
        fontSize: Math.round(size * 0.44),
      };

      if (skill && skill.market && skill.market.icon && !failed) {
        return h(
          'span',
          { className: 'dsk-mark', style: box },
          h('img', {
            src: ROUTE + '/icon?slug=' + encodeURIComponent(skill.slug || skill.name),
            alt: '',
            loading: 'lazy',
            onError: () => setFailed(true),
          }),
        );
      }

      const hue = hueOf((skill && (skill.slug || skill.name)) || '?');
      return h(
        'span',
        {
          className: 'dsk-mark dsk-mark-letter',
          style: Object.assign({}, box, {
            background: 'hsla(' + hue + ', 62%, 50%, 0.16)',
            color: 'hsl(' + hue + ', 60%, 50%)',
          }),
        },
        initialsOf(skill),
      );
    }

    /* ------------------------------------------------------------------ */
    /* page                                                               */
    /* ------------------------------------------------------------------ */

    /* ------------------------------------------------------------------ */
    /* browse: the skill-market storefront                                 */
    /* ------------------------------------------------------------------ */

    const BROWSE_PAGE_SIZE = 24;

    const SORT_OPTIONS = [
      { id: 'score', en: 'Best match', zh: '综合排序' },
      { id: 'downloads', en: 'Most downloaded', zh: '下载最多' },
      { id: 'stars', en: 'Most starred', zh: '星标最多' },
      { id: 'updated_at', en: 'Recently updated', zh: '最近更新' },
    ];

    /** 211011 reads as "21.1 万" in zh and "211k" in en. */
    function fmtCount(value, lang) {
      const count = Number(value) || 0;
      const trim = (part) => part.replace(/\.0$/, '');
      if (lang === 'en') {
        if (count >= 1e6) return trim((count / 1e6).toFixed(count >= 1e7 ? 0 : 1)) + 'M';
        if (count >= 1e3) return trim((count / 1e3).toFixed(count >= 1e4 ? 0 : 1)) + 'k';
        return String(count);
      }
      if (count >= 1e8) return trim((count / 1e8).toFixed(1)) + ' 亿';
      if (count >= 1e4) return trim((count / 1e4).toFixed(1)) + ' 万';
      return String(count);
    }

    /** Map a catalog card onto the shape SkillMark understands. */
    function markOf(card) {
      return { slug: card.slug, name: card.name, market: { icon: !!card.icon } };
    }

    /** Market timestamps arrive as milliseconds; the panel shows the date. */
    function dateOf(value, lang) {
      const stamp = Number(value) || 0;
      if (!stamp) return '';
      const date = new Date(stamp);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (part) => String(part).padStart(2, '0');
      if (lang === 'en') {
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
      }
      return date.getFullYear() + ' 年 ' + (date.getMonth() + 1) + ' 月 ' + date.getDate() + ' 日';
    }

    /** Cards need the date, but not the long Chinese one — keep it compact. */
    function shortDateOf(value) {
      return dateOf(value, 'en');
    }

    /**
     * Cards read better with "3 days ago" than with an absolute date, which the
     * reader has to compare against today. The exact date stays in `title`.
     */
    function relativeOf(value, lang) {
      const stamp = Number(value) || 0;
      if (!stamp) return '';
      const diff = Date.now() - stamp;
      const en = lang === 'en';
      if (!Number.isFinite(diff)) return '';
      if (diff < 60 * 1000) return en ? 'just now' : '刚刚';
      const minute = 60 * 1000;
      const hour = 60 * minute;
      const day = 24 * hour;
      const month = 30 * day;
      const year = 365 * day;
      const ago = (count, one, many) => {
        if (en) return count + ' ' + (count === 1 ? one : many) + ' ago';
        return count + ' ' + many + '前';
      };
      if (diff < hour) return ago(Math.floor(diff / minute), 'minute', en ? 'minutes' : '分钟');
      if (diff < day) return ago(Math.floor(diff / hour), 'hour', en ? 'hours' : '小时');
      if (diff < month) return ago(Math.floor(diff / day), 'day', en ? 'days' : '天');
      if (diff < year) return ago(Math.floor(diff / month), 'month', en ? 'months' : '个月');
      return ago(Math.floor(diff / year), 'year', en ? 'years' : '年');
    }

    function buildBrowse(ctx) {
      return function BrowsePane(props) {
        const t = props.t;
        const lang = props.lang;

        const [categories, setCategories] = React.useState([]);
        const [term, setTerm] = React.useState('');
        const [keyword, setKeyword] = React.useState('');
        const [category, setCategory] = React.useState('');
        const [sortBy, setSortBy] = React.useState('score');
        const [page, setPage] = React.useState(1);
        const [tick, setTick] = React.useState(0);
        const [state, setState] = React.useState({ status: 'loading', data: null, error: '' });
        const [open, setOpen] = React.useState('');
        const [preview, setPreview] = React.useState({ status: 'idle', data: null, error: '' });
        const [installing, setInstalling] = React.useState('');
        // Result feedback is inline only: nothing pops over the panel.
        const [failText, setFailText] = React.useState('');
        // Drawer-side management. Declared last so the hook order that the
        // render harnesses key on stays stable.
        const [removing, setRemoving] = React.useState(false);
        const [removeError, setRemoveError] = React.useState('');

        // The market returns a category key; the chips already carry its label.
        const categoryName = (key) => {
          if (!key) return '—';
          const hit = (categories || []).find((item) => item.key === key);
          if (!hit) return key;
          return lang === 'en' ? hit.nameEn || hit.name : hit.name;
        };

        React.useEffect(() => {
          let alive = true;
          getJson(ROUTE + '/categories')
            .then((body) => {
              if (alive) setCategories(body.categories || []);
            })
            .catch(() => {
              if (alive) setCategories([]);
            });
          return () => {
            alive = false;
          };
        }, []);

        React.useEffect(() => {
          let alive = true;
          setState((prev) => ({
            status: prev.data ? 'refreshing' : 'loading',
            data: prev.data,
            error: '',
          }));

          const params = [
            'page=' + page,
            'pageSize=' + BROWSE_PAGE_SIZE,
            'sortBy=' + encodeURIComponent(sortBy),
            'order=desc',
          ];
          if (keyword) params.push('keyword=' + encodeURIComponent(keyword));
          if (category) params.push('category=' + encodeURIComponent(category));

          getJson(ROUTE + '/browse?' + params.join('&'))
            .then((data) => {
              if (alive) setState({ status: 'ready', data, error: '' });
            })
            .catch((error) => {
              if (alive) {
                setState({ status: 'error', data: null, error: String(error.message || error) });
              }
            });

          return () => {
            alive = false;
          };
        }, [keyword, category, sortBy, page, tick]);

        React.useEffect(() => {
          if (!open) {
            setPreview({ status: 'idle', data: null, error: '' });
            return undefined;
          }
          let alive = true;
          setPreview({ status: 'loading', data: null, error: '' });
          getJson(
            ROUTE +
              '/preview?slug=' +
              encodeURIComponent(open.slug) +
              (open.namespace ? '&namespace=' + encodeURIComponent(open.namespace) : ''),
          )
            .then((data) => {
              if (alive) setPreview({ status: 'ready', data, error: '' });
            })
            .catch((error) => {
              if (alive) setPreview({ status: 'error', data: null, error: String(error.message || error) });
            });
          return () => {
            alive = false;
          };
        }, [open]);

        React.useEffect(() => {
          // A different skill in the drawer must not inherit the previous
          // one's pending confirmation.
          setRemoving(false);
          setRemoveError('');
        }, [open]);

        React.useEffect(() => {
          // The storefront searches as you type; Enter just applies instantly.
          const timer = setTimeout(() => {
            setKeyword(term.trim());
            setPage(1);
          }, 350);
          return () => clearTimeout(timer);
        }, [term]);

        function submitSearch(event) {
          event.preventDefault();
          setPage(1);
          setKeyword(term.trim());
        }

        function pickCategory(key) {
          setPage(1);
          setCategory(key);
        }

        async function install(card) {
          if (installing) return;
          setInstalling(card.slug);
          setFailText('');
          try {
            const body = await postJson(ROUTE + '/install', {
              slug: card.slug,
              namespace: card.namespaceHandle
                ? '@' + card.namespaceHandle
                : String(card.namespace || '').split('/')[0],
            });
            setTick((value) => value + 1);
            setOpen(null);
            if (props.onInstalled) props.onInstalled();
          } catch (error) {
            setFailText(t('Install failed: ', '安装失败：') + String(error.message || error));
          } finally {
            setInstalling('');
          }
        }

        async function uninstallFromDrawer() {
          const record = previewReady ? previewData.record : null;
          if (!record || !record.dir || removing) return;
          setRemoving(true);
          setRemoveError('');
          try {
            const body = await postJson(ROUTE + '/uninstall', { name: record.name, dir: record.dir });
              setOpen(null);
            setTick((value) => value + 1);
            if (props.onInstalled) props.onInstalled();
          } catch (error) {
            setRemoveError(String(error.message || error));
          } finally {
            setRemoving(false);
          }
        }

        const data = state.data;
        const cards = (data && data.skills) || [];
        const totalPages = (data && data.pages) || 1;
        const busy = state.status === 'loading' || state.status === 'refreshing';
        const search = h(
          'form',
          { className: 'dsk-search', onSubmit: submitSearch },
          h(SearchGlyph, { size: 14 }),
          h('input', {
            type: 'search',
            value: term,
            placeholder: t(
              'Search skills, descriptions or keywords…',
              '搜索技能名称、描述或关键词…',
            ),
            onChange: (event) => setTerm(event.target.value),
            'aria-label': t('Search the skill market', '搜索技能市场'),
          }),
        );

        // Plain text tabs, like the market itself: the active one is a pill.
        const sortTabs = h(
          'div',
          { className: 'dsk-sorttabs', role: 'tablist' },
          SORT_OPTIONS.map((option) =>
            h(
              'button',
              {
                key: option.id,
                type: 'button',
                role: 'tab',
                className: 'dsk-sorttab',
                'data-on': sortBy === option.id ? 'true' : 'false',
                'aria-selected': sortBy === option.id ? 'true' : 'false',
                onClick: () => {
                  setPage(1);
                  setSortBy(option.id);
                },
              },
              t(option.en, option.zh),
            ),
          ),
        );

        // One dropdown replaces the fifteen chips that used to own a row.
        const categorySelect = h(
          'label',
          { className: 'dsk-sort' },
          h(
            'select',
            {
              value: category,
              onChange: (event) => pickCategory(event.target.value),
              'aria-label': t('Filter by category', '按分类筛选'),
            },
            h('option', { key: 'all', value: '' }, t('All categories', '所有分类')),
            categories.map((item) =>
              h(
                'option',
                { key: item.key, value: item.key },
                lang === 'en' ? item.nameEn || item.name : item.name,
              ),
            ),
          ),
        );

        const grid = cards.length
          ? h(
              'div',
              { className: 'dsk-cards' },
              cards.map((card) => {
                const working = installing === card.slug;
                return h(
                  'article',
                  {
                    // Several publishers ship the same slug, so the key must
                    // include the namespace to stay unique inside the grid.
                    key: card.slug + '@' + (card.namespace || ''),
                    className: 'dsk-card',
                    onClick: () =>
                      setOpen({
                        slug: card.slug,
                        // The market addresses a skill by handle, not by the
                        // canonical "@handle/slug" — the latter 404s upstream.
                        namespace: card.namespaceHandle ? '@' + card.namespaceHandle : '',
                      }),
                  },
                  h(
                    'div',
                    { className: 'dsk-card-head' },
                    h(SkillMark, { skill: markOf(card), size: 34 }),
                    h(
                      'div',
                      { className: 'dsk-card-titlewrap' },
                      h(
                        'div',
                        { className: 'dsk-card-titlerow' },
                        h('span', { className: 'dsk-card-title', title: card.name }, card.name),
                        securityIcon(t, card.verified),
                        certIcon(t, card.source),
                      ),
                      h('div', { className: 'dsk-card-ns' }, card.namespace || card.slug),
                    ),
                  ),
                  h(
                    'p',
                    { className: 'dsk-card-desc' },
                    card.description || t('No description.', '没有说明。'),
                  ),
                  (card.subCategories || []).length || card.requiresApiKey
                    ? h(
                        'div',
                        { className: 'dsk-card-tags' },
                        // Two sub-categories plus the API-key badge keep the row
                        // on one line at the default card width; the drawer
                        // still lists every sub-category.
                        (card.subCategories || []).slice(0, 2).map((tagName) =>
                          tag(tagName, 'plain', tagName),
                        ),
                        card.requiresApiKey ? keyRequiredTag(t) : null,
                      )
                    : null,
                  h(
                    'div',
                    { className: 'dsk-card-foot' },
                    h(
                      'span',
                      { className: 'dsk-card-stat', title: String(card.stars || 0) },
                      statGlyph(STAR_PATH, 12),
                      fmtCount(card.stars || 0, lang),
                    ),
                    h(
                      'span',
                      { className: 'dsk-card-stat', title: String(card.downloads || 0) },
                      statGlyph(DOWNLOAD_PATH, 12),
                      fmtCount(card.downloads, lang),
                    ),
                    relativeOf(card.updatedAt, lang)
                      ? h(
                          'span',
                          { className: 'dsk-card-stat', title: shortDateOf(card.updatedAt) },
                          statGlyph(CLOCK_PATH, 12),
                          relativeOf(card.updatedAt, lang),
                        )
                      : null,
                    // The action shares the stats row, right-aligned, so it lines
                    // up with the download count across the whole grid.
                    h(
                      'span',
                      { className: 'dsk-card-action' },
                      card.installed
                        ? h(
                            'span',
                            { className: 'dsk-cta dsk-cta-sm dsk-cta-installed' },
                            t('Installed', '已安装'),
                          )
                        : h(
                            'button',
                            {
                              className: 'dsk-cta dsk-cta-primary dsk-cta-sm',
                              type: 'button',
                              disabled: working,
                              onClick: (event) => {
                                event.stopPropagation();
                                install(card);
                              },
                            },
                            working ? t('Installing…', '安装中…') : t('Install', '安装'),
                          ),
                    ),
                  ),
                );
              }),
            )
          : h(
              'div',
              { className: 'dsk-empty' },
              state.status === 'loading'
                ? t('Loading the skill market…', '正在读取技能市场…')
                : t('Nothing matches this search.', '没有符合当前条件的技能。'),
            );

        const pager =
          totalPages > 1
            ? h(
                'div',
                { className: 'dsk-pager' },
                h(
                  'button',
                  {
                    className: 'dsk-btn',
                    type: 'button',
                    disabled: page <= 1 || busy,
                    onClick: () => setPage(Math.max(1, page - 1)),
                  },
                  t('Previous', '上一页'),
                ),
                h('span', null, page + ' / ' + totalPages),
                h(
                  'button',
                  {
                    className: 'dsk-btn',
                    type: 'button',
                    disabled: page >= totalPages || busy,
                    onClick: () => setPage(Math.min(totalPages, page + 1)),
                  },
                  t('Next', '下一页'),
                ),
              )
            : null;

        const previewData = preview.data;
        // `idle` is the state on the first frame after a card is clicked, before
        // the effect flips it to `loading`; only `ready` carries data.
        const previewReady = preview.status === 'ready' && !!previewData;
        const modalTarget =
          previewReady
            ? {
                slug: previewData.slug,
                name: previewData.name,
                namespace: previewData.namespace,
                namespaceHandle: previewData.namespaceHandle,
                installed: previewData.installed,
                // Registry name + directory, present only while installed; the
                // uninstall endpoint validates exactly these two values.
                record: previewData.record || null,
              }
            : {
                slug: open ? open.slug : '',
                name: open ? open.slug : '',
                namespace: '',
                namespaceHandle: '',
                installed: false,
                record: null,
              };

        // Same field set and vocabulary the manager pane uses for an installed
        // skill, filled from the market detail instead of the registry.
        const publisherLine = previewReady
          ? (previewData.publisher || '') + (previewData.publisher && previewData.verified ? ' ✓' : '')
          : '';
        const modalRows = previewReady
          ? [
              { label: t('Market slug', '市场 slug'), value: previewData.slug || '' },
              {
                // Redundant when the market never gave the skill a real title.
                label: t('Official name', '官方名称'),
                value:
                  previewData.name && previewData.name.toLowerCase() !== String(previewData.slug || '').toLowerCase()
                    ? previewData.name
                    : '',
              },
              { label: t('Namespace', '命名空间'), value: previewData.namespace || '' },
              { label: t('Publisher', '发布者'), value: publisherLine },
              { label: t('Version', '版本'), value: previewData.version ? 'v' + previewData.version : '' },
              { label: t('Category', '分类'), value: categoryName(previewData.category) },
              { label: t('Source', '来源'), value: 'skillhub.cn' },
              {
                label: t('Invocation', '调用方式'),
                value: previewData.requiresApiKey
                  ? t('needs an API key', '需要 API Key')
                  : t('no key needed', '无需 API Key'),
              },
              { label: t('Downloads', '下载量'), value: fmtCount(previewData.downloads || 0, lang) },
              {
                label: t('Updated', '更新时间'),
                // Relative first (matches the cards), exact date in brackets.
                value: relativeOf(previewData.updatedAt, lang)
                  ? relativeOf(previewData.updatedAt, lang) + ' · ' + dateOf(previewData.updatedAt, lang)
                  : dateOf(previewData.updatedAt, lang),
              },
              {
                label: t('Status', '状态'),
                value: modalTarget.installed ? t('Installed', '已安装') : t('Not installed', '未安装'),
              },
            ].filter((row) => !!row.value)
          : [];

        const modal = open
          ? h(
              'div',
              { className: 'dsk-backdrop', onClick: () => setOpen(null) },
              h(
                'aside',
                {
                  className: 'dsk-modal',
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-label': previewReady ? previewData.name : open.slug,
                  onClick: (event) => event.stopPropagation(),
                },
                h(
                  'div',
                  { className: 'dsk-modal-h' },
                  h(SkillMark, { skill: markOf({ slug: open.slug, name: previewReady ? previewData.name : open.slug, icon: previewReady ? previewData.icon : false }), size: 40 }),
                  h(
                    'div',
                    { className: 'dsk-grow' },
                    h(
                      'div',
                      { className: 'dsk-card-titlerow' },
                      h(
                        'h2',
                        {
                          className: 'dsk-detail-h',
                          title: previewReady ? previewData.name : open.slug,
                        },
                        previewReady ? previewData.name : open.slug,
                      ),
                      previewReady
                        ? securityIcon(t, previewData.verified, previewData.securityReports)
                        : null,
                      previewReady
                        ? certIcon(t, previewData.source, previewData.certifiedName)
                        : null,
                    ),
                    h(
                      'p',
                      { className: 'dsk-detail-slug' },
                      previewReady
                        ? previewData.namespace || previewData.slug
                        : t('Loading…', '正在读取…'),
                    ),
                  ),
                  // Management sits on the title row, right of the skill name.
                  // The title block is the only flexible part, so the buttons
                  // keep a fixed spot whatever the name length is.
                  h(
                    'div',
                    { className: 'dsk-modal-actions' },
                    !previewReady
                      ? null
                      : modalTarget.installed
                        ? [
                            modalTarget.record
                              ? h(
                                  'button',
                                  {
                                    key: 'manage',
                                    className: 'dsk-cta dsk-cta-primary',
                                    type: 'button',
                                    onClick: () => {
                                      setOpen(null);
                                      if (props.onManage) props.onManage(modalTarget.record.name);
                                    },
                                  },
                                  t('Open in manager', '在技能管理中打开'),
                                )
                              : null,
                            modalTarget.record && modalTarget.record.dir
                              ? h(
                                  'button',
                                  {
                                    key: 'remove',
                                    className: 'dsk-cta dsk-cta-outline-danger',
                                    type: 'button',
                                    // Immediate: no confirmation band,
                                    // matching the manager pane.
                                    onClick: () => uninstallFromDrawer(),
                                  },
                                  t('Uninstall', '卸载'),
                                )
                              : null,
                          ]
                        : h(
                            'button',
                            {
                              className: 'dsk-cta dsk-cta-primary',
                              type: 'button',
                              disabled: installing === modalTarget.slug,
                              onClick: () => install(modalTarget),
                            },
                            installing === modalTarget.slug
                              ? t('Installing…', '安装中…')
                              : t('Install', '安装'),
                          ),
                  ),
                  h(
                    'button',
                    { className: 'dsk-modal-close', type: 'button', onClick: () => setOpen(null) },
                    '×',
                  ),
                  removeError
                    ? h('div', { className: 'dsk-actions-error', title: removeError }, removeError)
                    : null,
                ),
                h(
                  'div',
                  { className: 'dsk-modal-body' },
                  preview.status === 'error'
                    ? h('div', { className: 'dsk-error' }, preview.error)
                    : !previewReady
                      ? h('p', { className: 'dsk-note' }, t('Loading details…', '正在读取详情…'))
                      : h(
                          'div',
                          { className: 'dsk-modal-content' },
                          (previewData.subCategories || []).length ||
                          previewData.requiresApiKey ||
                          previewData.verified ||
                          !!previewData.source
                            ? h(
                                'div',
                                { className: 'dsk-card-tags' },
                                (previewData.subCategories || []).map((tagName) =>
                                  tag(tagName, 'plain', 'sub-' + tagName),
                                ),
                                previewData.source === 'community'
                                  ? sourceTag(t, previewData.source)
                                  : null,
                                previewData.requiresApiKey ? keyRequiredTag(t) : null,
                              )
                            : null,
                          h(
                            'dl',
                            { className: 'dsk-kv' },
                            modalRows.map((row) =>
                              h(
                                'div',
                                { key: row.label, style: { display: 'contents' } },
                                h('dt', null, row.label),
                                h('dd', null, row.value),
                              ),
                            ),
                          ),
                          h('h3', { className: 'dsk-sec' }, t('Description', '说明')),
                          h(
                            'p',
                            { className: 'dsk-text' },
                            previewData.summary || t('No description.', '没有说明。'),
                          ),
                          previewData.overview
                            ? h(
                                'div',
                                null,
                                h('h3', { className: 'dsk-sec' }, t('Introduction', '详细介绍')),
                                h('pre', { className: 'dsk-overview' }, previewData.overview),
                              )
                            : null,
                        ),
                ),
              ),
            )
          : null;

        return h(
          'div',
          { className: 'dsk-browse' },
          // Storefront order: search + category dropdown on one row, the sort
          // switches underneath, then the results.
          h('div', { className: 'dsk-toolbar' }, search, categorySelect),
          h('div', { className: 'dsk-filterbar dsk-controls' }, sortTabs),
          data && data.page > 1
            ? h(
                'div',
                { className: 'dsk-browse-meta' },
                h(
                  'span',
                  null,
                  t('page ' + data.page + ' of ' + totalPages, '第 ' + data.page + ' / ' + totalPages + ' 页'),
                ),
              )
            : null,
          state.status === 'error' ? h('div', { className: 'dsk-error' }, state.error) : null,
          failText ? h('div', { className: 'dsk-error' }, failText) : null,
          grid,
          pager,
          modal,
        );
      };
    }

    /* Header button glyphs: the user's own SVGs, inlined as path data. */
    const IMPORT_PATHS = [
      'M135.63636347 500.34090869v309.19090957c0 43.52727305 35.30454521 78.83181826 78.83181827 78.83181827h595.06363652a78.83181826 78.83181826 0 0 0 78.83181826-78.83181827V214.46818174A78.83181826 78.83181826 0 0 0 809.53181826 135.63636347h-284.27727305a32.72727305 32.72727305 0 0 1 0-65.45454521h284.27727305A144.28636348 144.28636348 0 0 1 953.81818174 214.46818174v595.06363652a144.28636348 144.28636348 0 0 1-144.28636348 144.28636348H214.46818174A144.28636348 144.28636348 0 0 1 70.18181826 809.53181826v-309.19090957a32.72727305 32.72727305 0 1 1 65.45454522 0z',
      'M101.15 176.50454521l15.13636347 0.81818174a423.9 423.9 0 0 1 396.24545479 358.56818174 32.72727305 32.72727305 0 0 0 64.67727305-9.98181738A489.35454521 489.35454521 0 0 0 119.84545479 111.95l-15.17727305-0.81818174A32.72727305 32.72727305 0 0 0 101.15 176.54545479z',
      'M542.96818174 525.54090869l-139.90909043-76.45909043a32.72727305 32.72727305 0 0 0-31.37727305 57.43636348l149.89090869 81.94090957a53.18181826 53.18181826 0 0 0 70.15909131-17.79545479l93.68181827-144.81818173a32.72727305 32.72727305 0 0 0-54.98181827-35.59090958l-87.46363652 135.28636348z',
    ];
    const REFRESH_PATH =
      'M158.72 71.92064c-3.2 11.20256 12.89216 27.5968 25.6 30.72l97.28 20.48c-145.408 78.848-230.4 229.9392-230.4 397.03552 0 249.86624 206.5664 452.88448 460.8 452.88448s460.8-203.01824 460.8-452.88448a452.77696 452.77696 0 0 0-226.432-389.632c-11.136-6.25152-28.32896-3.75808-34.688 7.95648a28.08832 28.08832 0 0 0 10.24 35.84 400.24064 400.24064 0 0 1 199.68 348.16c0 224.1024-181.59104 399.36-409.6 399.36s-409.6-175.2576-409.6-399.36c0-155.38688 81.13152-295.58784 220.16-363.52l-25.6 128c-3.1744 12.4928 6.8864 24.71424 19.59424 27.83232a23.71072 23.71072 0 0 0 28.60544-17.1776l42.10176-175.68768v-5.46304a22.71744 22.71744 0 0 0-18.26816-22.64576l-178.75456-41.38496C171.27936 46.22336 161.92 60.7232 158.72 71.92064z';

    /** 14px glyph from the supplied icon set; both header buttons use it. */
    function HeadGlyph(props) {
      const size = props && props.size ? props.size : 14;
      const paths = props.paths || [];
      return h(
        'svg',
        {
          viewBox: '0 0 1024 1024',
          width: size,
          height: size,
          fill: 'currentColor',
          'aria-hidden': true,
          focusable: 'false',
          style: { flex: '0 0 auto', display: 'block' },
        },
        paths.map((d, index) => h('path', { d, key: index })),
      );
    }

    function ImportGlyph(props) {
      return h(HeadGlyph, { size: (props && props.size) || 14, paths: IMPORT_PATHS });
    }

    function RefreshGlyph(props) {
      return h(HeadGlyph, { size: (props && props.size) || 14, paths: [REFRESH_PATH] });
    }

    /** 1234 -> "1.2 KB" — file sizes in the dialog, nothing more. */
    function formatBytes(value) {
      const size = Number(value) || 0;
      if (size < 1024) return size + ' B';
      if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
      return (size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /* What the importer accepts; mirrors the host's IMPORT_INFO so the dialog
       explains the same rules the endpoint enforces. */
    const IMPORT_ACCEPT = '.zip,.md,.markdown,.txt';
    const IMPORT_TYPES = [
      { ext: '.zip', hint: '技能目录压缩包 —— 内含 SKILL.md（可在根目录，也可套一层目录），其余文件原样带进来' },
      { ext: '.md', hint: '单个技能说明文件 —— 以 SKILL.md 保存，名字取 frontmatter 的 name' },
      { ext: '.markdown', hint: '同 .md，按 Markdown 处理' },
      { ext: '.txt', hint: '纯文本说明 —— 同上' },
    ];

    function buildImport(ctx) {
      function ImportDialog(props) {
        const t = props.t;
        const [files, setFiles] = React.useState([]);
        const [busy, setBusy] = React.useState(false);
        const [drag, setDrag] = React.useState(false);
        const [results, setResults] = React.useState([]);

        function addFiles(incoming) {
          const next = Array.from(incoming || []);
          if (!next.length) return;
          setFiles((prev) => {
            const merged = prev.slice();
            for (const file of next) {
              if (!merged.some((item) => item.name === file.name && item.size === file.size)) {
                merged.push(file);
              }
            }
            return merged;
          });
          setResults([]);
        }

        function removeAt(index) {
          setFiles((prev) => prev.filter((_, at) => at !== index));
        }

        async function run() {
          if (!files.length || busy) return;
          setBusy(true);
          setResults([]);
          const collected = [];
          for (const file of files) {
            try {
              const body = await file.arrayBuffer();
              const response = await fetch(ROUTE + '/import', {
                method: 'POST',
                headers: {
                  'content-type': 'application/octet-stream',
                  'x-file-name': encodeURIComponent(file.name),
                },
                body,
              });
              let payload = null;
              try {
                payload = await response.json();
              } catch {
                payload = null;
              }
              if (response.ok && payload && payload.ok) {
                collected.push({
                  ok: true,
                  file: file.name,
                  text:
                    (payload.imported.name || '') +
                    ' → ' +
                    (payload.imported.dir || '') +
                    ' · ' +
                    t(
                      payload.imported.files + ' files',
                      payload.imported.files + ' 个文件',
                    ),
                });
              } else {
                collected.push({
                  ok: false,
                  file: file.name,
                  text: (payload && (payload.message || payload.error)) || 'HTTP ' + response.status,
                });
              }
            } catch (error) {
              collected.push({ ok: false, file: file.name, text: String(error.message || error) });
            }
          }
          setBusy(false);
          setResults(collected);
          if (collected.some((entry) => entry.ok) && typeof props.onDone === 'function') props.onDone();
          setFiles([]);
        }

        const rows = files.map((file, index) =>
          h(
            'div',
            { className: 'dsk-file-row', key: file.name + ':' + file.size },
            h('span', { className: 'dsk-file-name', title: file.name }, file.name),
            h('span', { className: 'dsk-file-size' }, formatBytes(file.size)),
            h(
              'button',
              {
                className: 'dsk-file-drop',
                type: 'button',
                disabled: busy,
                title: t('Remove', '移除'),
                onClick: () => removeAt(index),
              },
              '×',
            ),
          ),
        );

        return h(
          'div',
          {
            className: 'dsk-dialog-backdrop',
            role: 'presentation',
            onClick: (event) => {
              if (event.target === event.currentTarget && !busy) props.onClose();
            },
          },
          h(
            'div',
            { className: 'dsk-dialog', role: 'dialog', 'aria-modal': 'true' },
            h(
              'div',
              { className: 'dsk-dialog-h' },
              h('h2', null, t('Import local skill', '导入本地技能')),
              h(
                'button',
                { className: 'dsk-modal-close', type: 'button', onClick: props.onClose, disabled: busy },
                '×',
              ),
            ),
            h(
              'div',
              { className: 'dsk-dialog-body' },
              h(
                'label',
                {
                  className: 'dsk-drop',
                  'data-drag': drag ? 'true' : 'false',
                  onDragOver: (event) => {
                    event.preventDefault();
                    setDrag(true);
                  },
                  onDragLeave: () => setDrag(false),
                  onDrop: (event) => {
                    event.preventDefault();
                    setDrag(false);
                    addFiles(event.dataTransfer && event.dataTransfer.files);
                  },
                },
                h('input', {
                  type: 'file',
                  multiple: true,
                  accept: IMPORT_ACCEPT,
                  disabled: busy,
                  onChange: (event) => {
                    addFiles(event.target.files);
                    event.target.value = '';
                  },
                }),
                h(ImportGlyph, { size: 22 }),
                h(
                  'span',
                  { className: 'dsk-drop-title' },
                  t('Drop files here, or click to browse', '把文件拖到这里，或点击选择文件'),
                ),
                h(
                  'span',
                  { className: 'dsk-drop-hint' },
                  t('One skill per file · up to 24 MB', '一个文件一个技能 · 单个文件最大 24 MB'),
                ),
              ),
              h(
                'div',
                { className: 'dsk-types' },
                IMPORT_TYPES.map((entry) =>
                  h(
                    'div',
                    { className: 'dsk-type-row', key: entry.ext },
                    h('span', { className: 'dsk-type-ext' }, entry.ext),
                    h('span', null, entry.hint),
                  ),
                ),
              ),
              rows.length ? h('div', { style: { display: 'grid', gap: '6px' } }, rows) : null,
              results.length
                ? h(
                    'div',
                    { style: { display: 'grid', gap: '6px' } },
                    results.map((entry, index) =>
                      h(
                        'div',
                        {
                          className: 'dsk-result-row',
                          key: entry.file + ':' + index,
                          'data-ok': entry.ok ? 'true' : 'false',
                        },
                        h('span', { className: 'dsk-result-mark' }, entry.ok ? '✓' : '✗'),
                        h(
                          'span',
                          { className: 'dsk-result-text' },
                          entry.ok ? entry.text : entry.file + ' — ' + entry.text,
                        ),
                      ),
                    ),
                  )
                : null,
            ),
            h(
              'div',
              { className: 'dsk-dialog-foot' },
              h(
                'span',
                { className: 'dsk-dialog-note' },
                t(
                  'Installed into ~/.dsh/skills, one directory per skill.',
                  '导入到 ~/.dsh/skills，一个技能一个目录。',
                ),
              ),
              h(
                'button',
                { className: 'dsk-cta dsk-cta-ghost dsk-cta-sm', type: 'button', onClick: props.onClose, disabled: busy },
                t('Close', '关闭'),
              ),
              h(
                'button',
                {
                  className: 'dsk-cta dsk-cta-primary dsk-cta-sm',
                  type: 'button',
                  disabled: !files.length || busy,
                  onClick: run,
                },
                busy
                  ? t('Importing…', '导入中…')
                  : t('Import ' + (files.length || ''), '导入' + (files.length ? ' ' + files.length + ' 个' : '')),
              ),
            ),
          ),
        );
      }
      return ImportDialog;
    }

    /* ------------------------------------------------------------------ */
    /* MCP servers                                                         */
    /* ------------------------------------------------------------------ */

    /**
     * Third tab: the MCP servers this process is configured to talk to, plus the
     * tools each one actually announced. The host merges two sources — Loader
     * rows (`@deepseek-ai/dsh-mcp-client`) for configuration, and the tool
     * registry (`mcp__<server>__<tool>`) for runtime proof a server answered.
     */
    function buildMcp(ctx) {
      // Some servers announce more than two hundred tools; the list is a
      // readable summary, not a dump, so long inventories are clipped.
      const TOOL_LIMIT = 120;

      function statusLabel(t, status) {
        if (status === 'connected') return t('Connected', '已连接');
        if (status === 'disabled') return t('Disabled', '已停用');
        return t('No tools', '无工具');
      }

      function McpPane(props) {
        const t = props.t;
        const [data, setData] = React.useState(null);
        const [error, setError] = React.useState('');
        const [busy, setBusy] = React.useState(true);
        const [term, setTerm] = React.useState('');
        const [picked, setPicked] = React.useState('');
        const [nonce, setNonce] = React.useState(0);
        const [mcpBusy, setMcpBusy] = React.useState(false);
        const [mcpError, setMcpError] = React.useState('');

        React.useEffect(() => {
          let alive = true;
          setBusy(true);
          setError('');
          getJson(ROUTE + '/mcp')
            .then((payload) => {
              if (!alive) return;
              setData(payload);
              setBusy(false);
            })
            .catch((failure) => {
              if (!alive) return;
              setError(String((failure && failure.message) || failure));
              setBusy(false);
            });
          return () => {
            alive = false;
          };
        }, [nonce]);

        async function mcpToggle(row, next) {
          if (!row || !row.id) return;
          setMcpBusy(true);
          setMcpError('');
          try {
            await postJson(ROUTE + '/mcp-toggle', { id: row.id, enabled: next });
            setNonce((value) => value + 1);
          } catch (failure) {
            setMcpError(String((failure && failure.message) || failure));
          } finally {
            setMcpBusy(false);
          }
        }

        async function mcpRemove(row) {
          if (!row || !row.id) return;
          setMcpBusy(true);
          setMcpError('');
          try {
            await postJson(ROUTE + '/mcp-remove', { id: row.id });
            setPicked('');
            setNonce((value) => value + 1);
          } catch (failure) {
            setMcpError(String((failure && failure.message) || failure));
          } finally {
            setMcpBusy(false);
          }
        }

        const servers = (data && data.servers) || [];
        const needle = String(term || '').trim().toLowerCase();
        const visible = needle
          ? servers.filter((row) =>
              [row.name, row.command, row.url]
                .concat((row.tools || []).map((tool) => tool.name))
                .join(' ')
                .toLowerCase()
                .includes(needle),
            )
          : servers;
        const current = visible.find((row) => row.name === picked) || visible[0] || null;

        const search = h(
          'form',
          {
            className: 'dsk-search',
            onSubmit: (event) => {
              if (event && event.preventDefault) event.preventDefault();
            },
          },
          h(SearchGlyph, { size: 14 }),
          h('input', {
            type: 'search',
            value: term,
            placeholder: t('Search servers or tools by name', '按名称搜索服务器或工具'),
            onChange: (event) => setTerm(event.target.value),
          }),
        );

        const toolbar = h(
          'div',
          { className: 'dsk-toolbar' },
          search,
          h(
            'button',
            {
              className: 'dsk-btn dsk-hbtn',
              type: 'button',
              onClick: () => setNonce(nonce + 1),
              title: t('Read the MCP inventory again', '重新读取 MCP 清单'),
            },
            h(RefreshGlyph, { size: 14 }),
            t('Reload', '重新读取'),
          ),
        );

        const summary = data
          ? h(
              'div',
              { className: 'dsk-browse-meta' },
              t(
                data.connected + ' connected · ' + data.total + ' configured · ' + data.toolCount + ' tools',
                data.connected + ' 个已连接 · ' + data.total + ' 个已配置 · ' + data.toolCount + ' 个工具',
              ),
            )
          : null;

        const list = h(
          'div',
          { className: 'dsk-list', role: 'listbox' },
          visible.map((row) =>
            h(
              'button',
              {
                key: row.name,
                type: 'button',
                className: 'dsk-item',
                role: 'option',
                'data-active': current && current.name === row.name ? 'true' : 'false',
                onClick: () => setPicked(row.name),
              },
              h(
                'span',
                { className: 'dsk-item-main' },
                h(
                  'span',
                  { className: 'dsk-item-titlerow' },
                  h('span', { className: 'dsk-item-title' }, row.name),
                  h(
                    'span',
                    {
                      className: 'dsk-tag',
                      'data-tone': row.status === 'connected' ? 'ok' : 'plain',
                    },
                    statusLabel(t, row.status),
                  ),
                ),
                h('span', { className: 'dsk-meta' }, row.transport + ' · ' + row.toolCount + ' tools'),
                h(
                  'span',
                  { className: 'dsk-item-desc' },
                  row.command || row.url || t('no command recorded', '没有记录启动命令'),
                ),
              ),
            ),
          ),
        );

        const toolRows = (current && current.tools) || [];
        const shown = toolRows.slice(0, TOOL_LIMIT);
        const rest = toolRows.length - shown.length;

        const detail = current
          ? h(
              'div',
              { className: 'dsk-detail' },
              h(
                'div',
                { className: 'dsk-detail-top' },
                h(
                  'div',
                  { className: 'dsk-grow' },
                  h(
                    'div',
                    { className: 'dsk-detail-titlerow' },
                    h('h2', { className: 'dsk-detail-h' }, current.name),
                    h(
                      'span',
                      {
                        className: 'dsk-tag',
                        'data-tone': current.status === 'connected' ? 'ok' : 'plain',
                      },
                      statusLabel(t, current.status),
                    ),
                  ),
                  h('p', { className: 'dsk-detail-slug' }, current.id || current.package),
                ),
                current.removable
                  ? h(
                      'button',
                      {
                        className: 'dsk-switch',
                        type: 'button',
                        role: 'switch',
                        'aria-checked': current.enabled ? 'true' : 'false',
                        'data-on': current.enabled ? 'true' : 'false',
                        disabled: mcpBusy,
                        title: t(
                          'Whether this MCP server starts with the harness',
                          '这个 MCP 服务器会不会随 harness 启动',
                        ),
                        onClick: () => mcpToggle(current, !current.enabled),
                      },
                      h(
                        'span',
                        { className: 'dsk-switch-track' },
                        h('span', { className: 'dsk-switch-knob' }),
                      ),
                      h(
                        'span',
                        { className: 'dsk-switch-label' },
                        mcpBusy
                          ? t('Saving…', '保存中…')
                          : current.enabled
                          ? t('Enabled', '已启用')
                          : t('Disabled', '已停用'),
                      ),
                    )
                  : null,
                current.removable
                  ? h(
                      'button',
                      {
                        className: 'dsk-btn dsk-btn-danger',
                        type: 'button',
                        disabled: mcpBusy,
                        title: t(
                          'Remove this row from the profile (a backup is written first)',
                          '从 profile 配置里删掉这一行（会先写备份）',
                        ),
                        onClick: () => mcpRemove(current),
                      },
                      t('Remove', '卸载'),
                    )
                  : null,
              ),
              mcpError
                ? h('div', { className: 'dsk-error', title: mcpError }, mcpError)
                : null,
              h(
                'div',
                { className: 'dsk-tagrow' },
                h('span', { className: 'dsk-tag dsk-tag-muted' }, current.transport || 'stdio'),
                current.failOnStartup
                  ? h('span', { className: 'dsk-tag' }, t('fails hard on startup', '启动失败即报错'))
                  : null,
              ),
              h(
                'dl',
                { className: 'dsk-kv' },
                [
                  { label: t('Loader id', '配置 id'), value: current.id || '—' },
                  { label: t('Command', '命令'), value: current.command || '—' },
                  {
                    label: t('Arguments', '参数'),
                    value: current.args && current.args.length ? current.args.join(' ') : '—',
                  },
                  { label: t('URL', 'URL'), value: current.url || '—' },
                  {
                    label: t('Environment', '环境变量'),
                    value: current.envKeys && current.envKeys.length ? current.envKeys.join(', ') : '—',
                  },
                  { label: t('Working dir', '工作目录'), value: current.cwd || '—' },
                  { label: t('Tools', '工具数'), value: String(current.toolCount) },
                ]
                  .filter((row) => !!row.value)
                  .map((row) =>
                    h(
                      'div',
                      { key: row.label, style: { display: 'contents' } },
                      h('dt', null, row.label),
                      h('dd', { title: row.value }, row.value),
                    ),
                  ),
              ),
              h('h3', { className: 'dsk-sec' }, t('Tools', '工具')),
              toolRows.length === 0
                ? h(
                    'p',
                    { className: 'dsk-text' },
                    t(
                      'This server is configured but announced no tools — it may not have started, or it exposes only resources.',
                      '这个服务器已配置但没有上报任何工具 —— 可能没启动成功，或者它只提供资源。',
                    ),
                  )
                : h(
                    'div',
                    { className: 'dsk-tools' },
                    shown.map((tool) =>
                      h(
                        'div',
                        { className: 'dsk-tool-row', key: tool.name },
                        h('code', { className: 'dsk-tool-name' }, tool.name),
                        tool.description
                          ? h('span', { className: 'dsk-tool-desc', title: tool.description }, tool.description)
                          : null,
                      ),
                    ),
                    rest > 0
                      ? h(
                          'p',
                          { className: 'dsk-text' },
                          t(rest + ' more tools not shown', '还有 ' + rest + ' 个工具未显示'),
                        )
                      : null,
                  ),
            )
          : h(
              'div',
              { className: 'dsk-detail' },
              h(
                'p',
                { className: 'dsk-placeholder' },
                busy
                  ? t('Reading the MCP inventory…', '正在读取 MCP 清单…')
                  : t('No MCP server matches the search.', '没有匹配的 MCP 服务器。'),
              ),
            );

        return h(
          'div',
          { className: 'dsk-manage' },
          toolbar,
          summary,
          error ? h('div', { className: 'dsk-error', style: { margin: '0 26px 14px' } }, error) : null,
          h('div', { className: 'dsk-body' }, list, detail),
        );
      }

      return McpPane;
    }

    function buildPage(ctx) {
      // Built once: a component type created during render would remount the
      // browse pane on every parent render and throw away its paging state.
      const BrowsePane = buildBrowse(ctx);
      const McpPane = buildMcp(ctx);
      const ImportDialog = buildImport(ctx);

      return function SkillsPage() {
        const t = useLocale(ctx);
        const lang = readLang(ctx);

        // Browse is the first tab, so it is also the one the panel opens on.
        const [view, setView] = React.useState('browse');
        const [importOpen, setImportOpen] = React.useState(false);
        const [state, setState] = React.useState({ status: 'loading', data: null, error: '' });
        const [nonce, setNonce] = React.useState(0);
        const [hardRefresh, setHardRefresh] = React.useState(false);
        const [query, setQuery] = React.useState('');
        const [filter, setFilter] = React.useState('all');
        const [selected, setSelected] = React.useState('');
        const [detail, setDetail] = React.useState({ status: 'idle', name: '', content: '', error: '' });
        const [copied, setCopied] = React.useState('');
        const [removing, setRemoving] = React.useState(false);
        const [removeError, setRemoveError] = React.useState('');
        const [toggling, setToggling] = React.useState(false);

        React.useEffect(() => {
          setRemoving(false);
          setRemoveError('');
        }, [selected]);


        React.useEffect(() => {
          let alive = true;
          setState((prev) => ({ status: prev.data ? 'refreshing' : 'loading', data: prev.data, error: '' }));
          const url = ROUTE + '/list' + (hardRefresh ? '?refresh=1' : '');
          getJson(url)
            .then((data) => {
              if (!alive) return;
              setState({ status: 'ready', data, error: '' });
            })
            .catch((error) => {
              if (!alive) return;
              setState((prev) => ({ status: 'error', data: prev.data, error: error.message || String(error) }));
            });
          return () => {
            alive = false;
          };
        }, [nonce, hardRefresh]);

        const skills = (state.data && state.data.skills) || [];

        React.useEffect(() => {
          if (!skills.length) return;
          if (selected && skills.some((entry) => entry.name === selected)) return;
          setSelected(skills[0].name);
        }, [state.data]);

        React.useEffect(() => {
          if (!selected) {
            setDetail({ status: 'idle', name: '', content: '', error: '' });
            return undefined;
          }
          let alive = true;
          setDetail({ status: 'loading', name: selected, content: '', error: '' });
          getJson(ROUTE + '/skill?name=' + encodeURIComponent(selected))
            .then((body) => {
              if (!alive) return;
              setDetail({ status: 'ready', name: selected, content: body.content || '', error: '' });
            })
            .catch((error) => {
              if (!alive) return;
              setDetail({ status: 'error', name: selected, content: '', error: error.message || String(error) });
            });
          return () => {
            alive = false;
          };
        }, [selected]);

        const needle = query.trim().toLowerCase();
        const visible = skills.filter((skill) => {
          // A row without a market block (older payload, disk-only skill) must
          // never take the whole panel down.
          const market = skill.market || { found: false };
          if (filter === 'market' && !market.found) return false;
          if (filter === 'local' && (market.found || skill.source === 'bundled')) return false;
          if (filter === 'bundled' && skill.source !== 'bundled') return false;
          if (filter === 'manual' && skill.invocation.modelInvocable) return false;
          if (!needle) return true;
          const haystack = [
            skill.title,
            skill.name,
            skill.slug,
            skill.description,
            skill.localDescription,
            market.namespace,
            market.publisher,
          ]
            .join(' ')
            .toLowerCase();
          return haystack.indexOf(needle) >= 0;
        });

        const current = skills.find((entry) => entry.name === selected) || null;
        const marketCount = skills.filter((entry) => (entry.market || {}).found).length;
        const busy = state.status === 'loading' || state.status === 'refreshing';

        function reload() {
          setHardRefresh(true);
          setNonce((value) => value + 1);
        }

        function copyPath(value) {
          try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              navigator.clipboard.writeText(value).then(
                () => {
                  setCopied(value);
                  setTimeout(() => setCopied(''), 1400);
                },
                () => undefined,
              );
            }
          } catch (err) {
            /* clipboard is best effort */
          }
        }

        /* ---- enable / disable ---- */
        async function toggleSkill(skill, next) {
          const dir = dirNameOf(skill);
          if (!dir) return;
          setToggling(true);
          setRemoveError('');
          try {
            await postJson(ROUTE + '/toggle', { name: skill.name, dir: dir, enabled: next });
            reload();
          } catch (err) {
            setRemoveError(err && err.message ? err.message : String(err));
          } finally {
            setToggling(false);
          }
        }

        /* ---- uninstall ---- */
        async function uninstall(skill) {
          const dir = dirNameOf(skill);
          if (!dir) return;
          setRemoving(true);
          setRemoveError('');
          try {
            const body = await postJson(ROUTE + '/uninstall', { name: skill.name, dir: dir });
              setSelected('');
            reload();
          } catch (err) {
            setRemoveError(err && err.message ? err.message : String(err));
          } finally {
            setRemoving(false);
          }
        }

        /* ---- header ---- */
        const header = h(
          'header',
          { className: 'dsk-head' },
          h('div', { className: 'dsk-glyph' }, h(PanelGlyph, { size: 24, active: true })),
          h(
            'div',
            { className: 'dsk-grow' },
            h('h1', { className: 'dsk-h1' }, t('Skills', '技能')),
            h(
              'p',
              { className: 'dsk-sub' },
              view === 'mcp'
                ? t('MCP servers this process can reach, and the tools each one announced', '本进程可用的 MCP 服务器，以及每个服务器上报的工具')
                : view === 'browse'
                ? t(
                    'Search the skill market, preview a skill and install it in one click',
                    '搜索技能市场，预览详情并一键安装',
                  )
                : state.status === 'loading'
                  ? t('Loading installed skills…', '正在读取已安装的技能…')
                  : skills.length
                    ? t(
                        skills.length + ' installed · ' + marketCount + ' matched on the skill market',
                        '已安装 ' + skills.length + ' 个 · 市场匹配到 ' + marketCount + ' 个官方名称',
                      )
                    : t('No skill found', '没有找到技能'),
            ),
          ),
          // The MCP tab owns its own reload and has nothing to import; showing
          // skill actions there would act on the wrong list.
          view === 'mcp'
            ? null
            : h(
                'button',
                {
                  className: 'dsk-btn dsk-hbtn',
                  type: 'button',
                  title: t('Import a skill from this computer', '从本机导入技能'),
                  onClick: () => setImportOpen(true),
                },
                h(ImportGlyph, { size: 14 }),
                t('Import', '导入'),
              ),
          view === 'mcp'
            ? null
            : h(
                'button',
                { className: 'dsk-btn dsk-hbtn', type: 'button', onClick: reload, disabled: busy },
                h(RefreshGlyph, { size: 14 }),
                busy ? t('Refreshing…', '刷新中…') : t('Refresh', '刷新'),
              ),
        );

        /* ---- toolbar ---- */
        const chips = [
          { id: 'all', label: t('All', '全部') },
          { id: 'market', label: t('On market', '市场已收录') },
          { id: 'local', label: t('Local only', '本地自研') },
          { id: 'bundled', label: t('Built-in', '内置') },
          { id: 'manual', label: t('Manual only', '仅手动') },
        ];

        const toolbar = h(
          'div',
          { className: 'dsk-toolbar' },
          h(
            'label',
            { className: 'dsk-search' },
            h(SearchGlyph, { size: 14 }),
            h('input', {
              type: 'search',
              value: query,
              placeholder: t('Search by name, slug or description', '按名称、目录名或说明搜索'),
              onChange: (event) => setQuery(event.target.value),
              'aria-label': t('Search skills', '搜索技能'),
            }),
          ),
        );

        const filterbar = h(
          'div',
          { className: 'dsk-filterbar dsk-controls' },
          h(
            'div',
            { className: 'dsk-sorttabs', role: 'tablist' },
            chips.map((chip) =>
              h(
                'button',
                {
                  key: chip.id,
                  type: 'button',
                  role: 'tab',
                  className: 'dsk-sorttab',
                  'data-on': filter === chip.id ? 'true' : 'false',
                  'aria-selected': filter === chip.id ? 'true' : 'false',
                  onClick: () => setFilter(chip.id),
                },
                chip.label,
              ),
            ),
          ),
        );

        /* ---- list ---- */
        let listBody;
        if (!skills.length) {
          listBody = h(
            'div',
            { className: 'dsk-empty' },
            state.status === 'loading'
              ? t('Reading the skill registry…', '正在读取技能注册表…')
              : t('The registry reported no skills.', '技能注册表没有返回任何技能。'),
          );
        } else if (!visible.length) {
          listBody = h(
            'div',
            { className: 'dsk-empty' },
            t('Nothing matches this filter.', '没有符合当前筛选的技能。'),
          );
        } else {
          listBody = visible.map((skill) => {
            const meta = [];
            meta.push(tag(sourceLabel(t, skill.source), skill.source === 'bundled' ? 'plain' : 'plain', 'src'));
            if (skill.market.found) {
              meta.push(tag(t('on market', '市场已收录'), 'ok', 'market'));
            } else if (skill.source !== 'bundled') {
              meta.push(tag(t('local only', '本地自研'), 'warn', 'market'));
            }
            if (!skill.invocation.modelInvocable) {
              meta.push(tag(t('manual', '仅手动'), 'plain', 'manual'));
            }
            return h(
              'button',
              {
                key: skill.name,
                type: 'button',
                className: 'dsk-item',
                'data-active': skill.name === selected ? 'true' : 'false',
                'data-off': skill.enabled === false ? 'true' : 'false',
                onClick: () => setSelected(skill.name),
              },
              h(SkillMark, { skill: skill, size: 30 }),
              h(
                'span',
                { className: 'dsk-item-main' },
                h(
                  'span',
                  { className: 'dsk-item-titlerow' },
                  h('span', { className: 'dsk-item-title' }, titleOf(skill)),
                  // A parked skill stays listed so it can be switched back on;
                  // the chip is what tells the two states apart in the list.
                  skill.enabled === false
                    ? h('span', { className: 'dsk-tag dsk-tag-off' }, t('Off', '已停用'))
                    : null,
                  // List rows keep the plain native tooltip: hover cards here
                  // fought with the scrolling list, so they live in the detail
                  // pane only.
                  // The manager list deliberately has no hover cards and no
                  // native title: the detail pane carries that information.
                  securityIcon(t, skill.market.verified, null, true),
                  certIcon(t, skill.market.official ? 'enterprise' : '', '', true),
                ),
                h('span', { className: 'dsk-meta' }, meta),
                h(
                  'span',
                  { className: 'dsk-item-desc' },
                  skill.description || skill.localDescription || skill.name,
                ),
              ),
            );
          });
        }

        const list = h('aside', { className: 'dsk-list' }, listBody);

        /* ---- detail ---- */
        let detailBody;
        if (!current) {
          detailBody = h(
            'div',
            { className: 'dsk-empty' },
            t('Pick a skill on the left.', '在左侧选择一个技能。'),
          );
        } else {
          const official = current.market.found && current.title ? current.title : '';
          const rows = [
            {
              label: t('Install name', '安装名'),
              value: h('span', { className: 'dsk-mono' }, current.name),
            },
            {
              label: t('Market slug', '市场 slug'),
              value: h(
                'span',
                { className: 'dsk-mono' },
                current.source === 'bundled' ? '—' : current.slug || '—',
              ),
            },
            {
              label: t('Official name', '官方名称'),
              value: official
                ? h('span', null, official)
                : h(
                    'span',
                    { style: { color: 'var(--dsw-alias-label-secondary, #6b6f76)' } },
                    current.source === 'bundled'
                      ? t(
                          'ships with the harness; not matched to the market',
                          '随 harness 内置，不参与市场匹配',
                        )
                      : t('not found on the skill market', '技能市场未收录'),
                  ),
            },
            {
              label: t('Namespace', '命名空间'),
              value: current.market.namespace
                ? h('span', { className: 'dsk-mono' }, current.market.namespace)
                : h('span', { className: 'dsk-mono' }, '—'),
            },
            {
              label: t('Publisher', '发布者'),
              value: current.market.publisher || '—',
            },
            {
              label: t('Version', '版本'),
              value: current.market.version || '—',
            },
            {
              label: t('Source', '来源'),
              value: sourceLabel(t, current.source) + (current.provider ? ' · ' + current.provider : ''),
            },
            {
              label: t('Invocation', '调用方式'),
              value:
                (current.invocation.modelInvocable ? t('model callable', '模型可调用') : t('not model callable', '模型不可调用')) +
                ' · ' +
                (current.invocation.userInvocable ? t('slash command', '斜杠命令') : t('manual only', '仅手动')),
            },
          ];

          const dirRow = current.dir
            ? h(
                'div',
                { style: { margin: '14px 0 0', fontSize: 12.5 } },
                h(
                  'div',
                  {
                    style: {
                      color: 'var(--dsw-alias-label-secondary, #6b6f76)',
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    },
                  },
                  t('Install directory', '安装目录'),
                ),
                h(
                  'div',
                  { style: { display: 'flex', gap: 8, alignItems: 'flex-start' } },
                  h(
                    'code',
                    { className: 'dsk-mono', style: { flex: '1 1 auto', minWidth: 0, wordBreak: 'break-all' } },
                    current.dir,
                  ),
                  h(
                    'button',
                    {
                      className: 'dsk-btn',
                      type: 'button',
                      onClick: () => copyPath(current.dir),
                      style: { padding: '4px 8px', fontSize: 11 },
                    },
                    copied === current.dir ? t('Copied', '已复制') : t('Copy', '复制'),
                  ),
                ),
              )
            : null;

          const dir = dirNameOf(current);
          const removable = canUninstall(current);
          const canToggle = current.togglable === true;
          const isOn = current.enabled !== false;

          const actionButton = removable
            ? h(
                'button',
                {
                  className: 'dsk-btn dsk-btn-danger',
                  type: 'button',
                  disabled: removing,
                  // Immediate, like the drawer: the label already says
                  // 卸载 and re-installing is one click.
                  onClick: () => uninstall(current),
                  style: { flex: '0 0 auto', padding: '6px 12px', fontSize: 12.5 },
                },
                removing ? t('Uninstalling…', '卸载中…') : t('Uninstall', '卸载'),
              )
            : null;

          // The switch parks or restores SKILL.md, so a skill can be taken out of
          // new sessions without losing the folder or reinstalling later.
          const toggleSwitch = canToggle
            ? h(
                'button',
                {
                  className: 'dsk-switch',
                  type: 'button',
                  role: 'switch',
                  'aria-checked': isOn ? 'true' : 'false',
                  'data-on': isOn ? 'true' : 'false',
                  disabled: toggling,
                  title: isOn
                    ? t('On: new sessions load this skill', '已启用：新会话会加载这个技能')
                    : t('Off: new sessions skip this skill', '已停用：新会话不会加载这个技能'),
                  onClick: () => toggleSkill(current, !isOn),
                },
                h(
                  'span',
                  { className: 'dsk-switch-track' },
                  h('span', { className: 'dsk-switch-knob' }),
                ),
                h(
                  'span',
                  { className: 'dsk-switch-label' },
                  toggling
                    ? t('Saving…', '保存中…')
                    : isOn
                      ? t('On', '已启用')
                      : t('Off', '已停用'),
                ),
              )
            : null;

          detailBody = h(
            'div',
            null,
            h(
              'div',
              { className: 'dsk-detail-top' },
              h(SkillMark, { skill: current, size: 44 }),
              h(
                'div',
                { className: 'dsk-grow' },
                h(
                  'div',
                  { className: 'dsk-card-titlerow' },
                  h('h2', { className: 'dsk-detail-h' }, titleOf(current)),
                  securityIcon(t, current.market.verified, current.market.securityReports),
                  certIcon(
                    t,
                    current.market.official ? 'enterprise' : '',
                    current.market.certifiedName,
                  ),
                ),
                h(
                  'p',
                  { className: 'dsk-detail-slug' },
                  current.market.namespace && current.market.namespace.indexOf(current.slug) >= 0
                    ? current.market.namespace
                    : current.name,
                ),
              ),
              toggleSwitch,
              actionButton,
            ),
            // Failures stay inline (no popup): the message sits under the
            // title, where the eye already is after clicking uninstall.
            removeError
              ? h('div', { className: 'dsk-error', title: removeError }, removeError)
              : null,
            // Always rendered: bundled and disk-only skills carry no market
            // tags, and without the row their intro sits higher than on a
            // tagged skill. They get their source chip instead.
            h(
              'div',
              { className: 'dsk-tagrow' },
              (current.market.subCategories || []).map((tagName) =>
                tag(tagName, 'plain', 'sub-' + tagName),
              ),
              current.market.requiresApiKey ? keyRequiredTag(t) : null,
              (current.market.subCategories || []).length || current.market.requiresApiKey
                ? null
                : h('span', { className: 'dsk-tag dsk-tag-muted' }, sourceLabel(t, current.source)),
            ),
            h(
              'dl',
              { className: 'dsk-kv' },
              rows.map((row) =>
                h(
                  'div',
                  { key: row.label, style: { display: 'contents' } },
                  h('dt', null, row.label),
                  h('dd', null, row.value),
                ),
              ),
            ),
            dirRow,
            h('h3', { className: 'dsk-sec' }, t('Description', '说明')),
            h('p', { className: 'dsk-text' }, current.description || t('No description.', '没有说明。')),
            current.whenToUse
              ? h(
                  'div',
                  null,
                  h('h3', { className: 'dsk-sec' }, t('When to use', '适用场景')),
                  h('p', { className: 'dsk-text' }, current.whenToUse),
                )
              : null,
            h('h3', { className: 'dsk-sec' }, t('SKILL.md', 'SKILL.md 正文')),
            detail.status === 'loading'
              ? h('p', { className: 'dsk-note' }, t('Loading…', '正在读取…'))
              : detail.status === 'error'
                ? h('div', { className: 'dsk-error' }, detail.error)
                : h('pre', { className: 'dsk-pre' }, detail.content || t('(empty)', '（空）')),
          );
        }

        const detailPane = h('section', { className: 'dsk-detail' }, detailBody);

        /* ---- footer ---- */
        // Only a status warning lives here; the "where names come from"
        // explainer and the session-scope caveat were removed on request.
        const footNote =
          state.data && state.data.marketReachable === false
            ? t(
                'The skill market is unreachable, so official names are missing. Local names are shown instead.',
                '技能市场暂时连不上，官方名称缺失，当前显示的是本地名称。',
              )
            : '';
        const foot = footNote ? h('div', { className: 'dsk-foot' }, footNote) : null;

        const tabs = h(
          'div',
          { className: 'dsk-tabs', role: 'tablist' },
          h(
            'button',
            {
              className: 'dsk-tab',
              type: 'button',
              role: 'tab',
              'data-on': view === 'browse' ? 'true' : 'false',
              'aria-selected': view === 'browse' ? 'true' : 'false',
              onClick: () => setView('browse'),
            },
            t('Browse skills', '浏览技能'),
          ),
          h(
            'button',
            {
              className: 'dsk-tab',
              type: 'button',
              role: 'tab',
              'data-on': view === 'manage' ? 'true' : 'false',
              'aria-selected': view === 'manage' ? 'true' : 'false',
              onClick: () => setView('manage'),
            },
            t('Installed skills', '技能管理'),
            skills.length ? h('span', { className: 'dsk-tab-count' }, String(skills.length)) : null,
          ),
          h(
            'button',
            {
              className: 'dsk-tab',
              type: 'button',
              role: 'tab',
              'data-on': view === 'mcp' ? 'true' : 'false',
              'aria-selected': view === 'mcp' ? 'true' : 'false',
              onClick: () => setView('mcp'),
            },
            'MCP',
          ),
        );

        const managePane = h(
          'div',
          { className: 'dsk-manage' },
          toolbar,
          filterbar,
          state.status === 'error' && state.error
            ? h('div', { className: 'dsk-error', style: { margin: '0 26px 14px' } }, state.error)
            : null,
          h('div', { className: 'dsk-body' }, list, detailPane),
          foot,
        );

        return h(
          'div',
          { className: 'dsk-page' },
          h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
          header,
          tabs,
          view === 'manage'
            ? managePane
            : view === 'mcp'
            ? h(McpPane, { t: t })
            : h(BrowsePane, {
                t: t,
                lang: lang,
                onInstalled: reload,
                onManage: (name) => {
                  // Hand the skill over to the manager pane, already selected.
                  setView('manage');
                  setSelected(name);
                },
              }),
          importOpen
            ? h(ImportDialog, {
                t: t,
                onClose: () => setImportOpen(false),
                onDone: reload,
              })
            : null,
          // Last child on purpose: the hover card must not be inside any
          // scrolling pane.
          h(TipsLayer, null),
        );
      };
    }

    /* ------------------------------------------------------------------ */
    /* apply                                                              */
    /* ------------------------------------------------------------------ */

    /** Shows a crash instead of a blank panel, so failures stay diagnosable. */
    function CrashCard(props) {
      const error = props && props.error;
      const message = String((error && error.message) || error || 'Unknown error');
      const stack = String((error && error.stack) || '');
      return h(
        'div',
        { className: 'dsk-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h(
          'div',
          { className: 'dsk-crash' },
          h('h2', { className: 'dsk-crash-h' }, '技能面板渲染失败 / Skills panel failed to render'),
          h('p', { className: 'dsk-crash-msg' }, message),
          stack ? h('pre', { className: 'dsk-crash-pre' }, stack) : null,
          h('p', { className: 'dsk-crash-hint' }, '把上面的报错发给我即可定位；Ctrl+R 可重试。'),
        ),
      );
    }

    /**
     * Any render error inside the page would otherwise unmount the whole panel
     * and leave the main area empty, which is indistinguishable from "nothing
     * loaded". A boundary turns that into a readable message.
     */
    function guard(Component) {
      if (typeof React.Component !== 'function') return Component;
      return class PanelBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }
        static getDerivedStateFromError(error) {
          return { error };
        }
        componentDidCatch(error, info) {
          try {
            console.error('[dsh-better-skillmanager] render failed', error, info);
          } catch (ignored) {
            /* logging must never re-throw */
          }
        }
        render() {
          if (this.state.error) return h(CrashCard, { error: this.state.error });
          return h(Component, this.props);
        }
      };
    }

    return {
      inject: ['slots', 'locale'],

      apply(ctx) {
        const Page = buildPage(ctx);

        ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: PANEL_ID, locale: PKG }, guard(Page));
        });

        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 30,
              label: function () {
                return readLang(ctx) === 'en' ? 'Skills' : '技能';
              },
              locale: PKG,
            },
            PanelGlyph,
          );
        });
      },
    };
  },
});
