[![release](https://img.shields.io/github/v/release/allanhao1986/dsh-better-skillmanager?label=release)](https://github.com/allanhao1986/dsh-better-skillmanager/releases)
[![licence](https://img.shields.io/github/license/allanhao1986/dsh-better-skillmanager)](./LICENSE)

# dsh-better-skillmanager

> **这个插件从头到尾都是 DeepSeek Harness 做的** —— 设计、代码、调试、打包、发布全部在
> DSH 会话里完成，作者只提需求。
>
> **Built end to end with DeepSeek Harness** — design, code, debugging, packaging
> and release all happened inside a DSH session; the human only asked for the
> feature.

A local DSH bundle that puts a **Skills** entry in the left rail and opens a
two-tab panel: **浏览技能 / Browse skills** and **技能管理 / Installed skills**.

```
left rail icon  ->  sidebar.panellist  id  = skills
panel page      ->  main               key = skills
```

| Tab | What it does |
| --- | --- |
| 浏览技能 | A storefront over `api.skillhub.cn`: search, 13 categories, sorting, card grid, detail preview, one-click install. This is the tab the panel opens on. |
| 技能管理 | Every skill this process can see, each matched to its official market name; SKILL.md preview, icons, uninstall. |

## Install

Requires the DSH desktop profile (the panel is a Web client half). Installing and
uninstalling inside the panel work on their own: the host half downloads the
published file bundle from skillhub (`/api/v1/skills/<slug>/files` then one
`/file` request per entry, sha256 verified, staged in a sibling directory and
swapped in with a rename) and deletes the tree after the same validation the
other routes use.

If [`@montersy123/dsh-skill-market`](https://www.npmjs.com/package/@montersy123/dsh-skill-market)
happens to be installed, both actions are delegated to it instead, because that
bundle also owns the disabled-skills store and version records. It is optional:
its absence is detected by probing `/skill-market/api/state` once a minute, and
the panel falls back to the native path rather than failing.

```bash
# recommended: the packed release asset, nothing else needed
dsh plugin --profile desktop add https://github.com/allanhao1986/dsh-better-skillmanager/releases/download/v1.1.1/dsh-better-skillmanager-v1.1.1.tgz

# straight from the repository (needs git on the machine; pins the tag)
dsh plugin --profile desktop add github:allanhao1986/dsh-better-skillmanager#v1.1.1

# local checkout, for development
dsh plugin --profile desktop add C:\path\to\dsh-better-skillmanager
```

Restart DSH (or reload the page) and a **技能 / Skills** icon appears in the left
rail. The host half is loaded at apply time: after editing `index.js` toggle the
bundle off and on, while `client.js` changes only need a page refresh.

## Panel chrome

Both tabs share one band order, so switching tabs never moves the search box:

```
header (title + subtitle + refresh)
tab strip        浏览技能 | 技能管理
toolbar          search field (capped at 720px); browse pairs it with the
                 所有分类 dropdown on the same 36px baseline, right after it
controls         plain text tabs, active one is a pill:
                 浏览技能  综合排序 / 下载最多 / 星标最多 / 最近更新
                 技能管理  全部 / 市场已收录 / 本地自研 / 内置 / 仅手动
results          master-detail list, or the card grid + pager
```

Both tabs share one control vocabulary: `.dsk-sorttab` text tabs, no borders. The
browse tab follows the skillhub.cn storefront — a capped search field, the
category filter as one dropdown instead of a chip row that wrapped onto two
lines, and the sort switches underneath. Browse searches as you type (350 ms
debounce); Enter applies immediately.

The reference for the chrome is the harness **Plugins** page: a segmented tab
strip, one search row, a control row, then the results. The manager pane keeps
the same bands, with its source chips moved out of the (vertical) list column so
the two tabs line up.

The browse detail dialog reuses the manager vocabulary (`dl.dsk-kv`, `dsk-sec`,
`dsk-text`); rows whose value is empty or merely repeats the slug are dropped, so
the dialog never shows `官方名称: dev-god` next to `市场 slug: dev-god`.

`render-preview.mjs` in the workspace renders both tabs and the dialog to static
HTML with fake data and headless Chrome screenshots them, which is how layout
changes get eyeballed without signing into the GUI.

## Why it exists

Installation directories are named `<publisher>--<slug>` (for example
`davtime--dsh-plugin-studio`), while the market publishes the same skill under a
human title (for example `DSH插件开发助手`). Without that mapping the installed
list is unreadable, so this panel resolves it and shows both names side by side.
The browse tab closes the loop: what the market offers is one click away, and
every card already says whether it is installed here.

## Layout

| File | Role |
| --- | --- |
| `index.js` | Host half: reads the `skills` registry, matches slugs on the market, proxies the market catalog, icons and install/uninstall. |
| `client.js` | Client half: the rail icon and the two-tab panel. |
| `cordis.patch.yml` | Loader patch that inserts the `dsh-better-skillmanager` entry. |
| `locale/{en,zh}.json` | The bundle's own title and description in the Plugins list. |
| `icon.svg` | The bundle icon; the rail glyph is the same drawing inlined in `client.js`. |

## Routes

All are same-origin and served by the harness web server.

- `GET /dsh-better-skillmanager/list` — skill summaries plus market matches. `?refresh=1`
  clears the market cache first.
- `POST /dsh-better-skillmanager/import` — import a local file. Body is the raw
  bytes, the original name travels in the `x-file-name` header (URL-encoded),
  and the answer is `{ ok, imported: { name, dir, files, bytes }, file }`.
- `GET /dsh-better-skillmanager/import-info` — the accepted extensions and the
  size limits, so the dialog explains exactly what the endpoint enforces.
- `GET /dsh-better-skillmanager/skill?name=<name>` — one skill's `SKILL.md` body.
- `GET /dsh-better-skillmanager/icon?slug=<slug>` — the market icon, proxied. Cached for an
  hour; unknown or iconless slugs answer `404` and the panel draws a letter
  tile instead.
- `GET /dsh-better-skillmanager/browse?page&pageSize&sortBy&order&keyword&category` — one
  page of the market catalog, pages ≤ 500 and page sizes ≤ 48, sorted only by
  `score`, `downloads`, `stars` or `updated_at`, cached five minutes per query.
  Each card carries `installed: true|false`.
- `GET /dsh-better-skillmanager/categories` — the market's 13 active categories, cached an
  hour.
- `GET /dsh-better-skillmanager/preview?slug=<slug>&namespace=<@handle>` — one market
  skill's storefront detail (`summary`, `overview`, stats). Also carries
  `certifiedName` (the legal entity behind a verified publisher) and
  `securityReports` — the market's per-lab object flattened to
  `[{ id, lab, status, statusText, reportUrl }]`, with lab ids mapped to their
  Chinese names (`keen` → 科恩实验室, `sanbu` → 云鼎实验室). The namespace is the
  handle (`@ake`), not the canonical `@ake/dev-god`, which the API rejects.
- `POST /dsh-better-skillmanager/install` `{ slug, namespace }` — install one market skill.
- `POST /dsh-better-skillmanager/uninstall` `{ name, dir }` — uninstall one skill.


> The CTA palette (#2b6cb0 primary, #dc2626 danger) is hard-coded rather than
> taken from --dsw-alias-brand-primary: that token resolves to a near-white
> accent in the dark theme, which rendered the filled button white-on-white.

## Browse

The storefront renders what the market itself returns: icon, title,
namespace, description, up to two sub-category tags, and a stats row of
star count, download count and last-updated freshness — each preceded by a
12px glyph (hollow star, download tray, clock) drawn from the SVGs the user
supplied, so they inherit the muted `currentColor` and stay legible on both
themes. The row is a tightly packed grid (`44px 66px minmax(0,1fr) auto` with a
4px gap and a 3px icon/text gap): the three stats keep fixed starting
positions across cards without spreading out (`3 days ago`; the exact date is in the `title`
tooltip), with 24 cards per page and a right-side detail drawer. Security and certification are drawn as two small badges right after the skill
name (green shield = 安全认证, blue rosette = 企业认证), using the SVGs supplied
by the user, inlined as paths. The shield is drawn at 15px because that artwork
carries ~5% internal padding and would otherwise read smaller than the 14px
rosette. In the detail drawer both badges carry a hover card with the market's
own data: the shield lists every security lab verdict (`科恩实验室 安全，无风险` /
`云鼎实验室 可疑，存在潜在风险`) with a `查看报告 ↗` link to the published report,
and the rosette shows `已完成企业认证：<certifiedName>`. The storefront grid has no verdict or legal-entity data per card, so its badges
keep a plain `title` tooltip. The hover card
is kept alive while the pointer crosses the gap between badge and card (an
invisible `::after` bridge plus a 160ms close delay), so it can be read and
its report links clicked. The manager pane renders the same two badges on every
installed row and in its detail header, plus the sub-category / API-key tag row,
because `/list` now carries the trust markers too. An amber `需配置 API Key`
badge sits in the tag row when `labels.requires_api_key` is set. The
install / installed control shares the stats row at the card's bottom right, so
it lines up with the download count across the whole grid. Publisher names are deliberately
not rendered on cards — market publishers can be long legal entities, and they
pushed the footer row out of the card. They still appear in the drawer,
which wraps instead. The drawer body is the
publisher's `overviewMd` when the market has one; most entries currently return
an empty string, so the summary is the body of the drawer and the introduction
block is hidden rather than shown blank.

The drawer's field list mirrors the manager pane (`市场 slug`, `官方名称`,
`命名空间`, `发布者`, `版本`, `来源`, `调用方式`, plus the market-only
`分类`/`下载量`/`更新时间`/`状态`) and uses the same `dsk-kv` / `dsk-sec` /
`dsk-text` vocabulary, so an installed skill reads the same in both tabs. The
modal renders before its fetch resolves, so the body is gated on
`status === 'ready'`: an earlier version fell through to the populated branch
while `data` was still `null` and threw, blanking the whole panel.

`skillhub.cn` itself is not reachable from this machine (its hostname resolves to
a non-public address), so the layout follows the market's own data shape rather
than a copy of the website.

## Icons

`api.skillhub.cn` returns `skill.iconUrl` on the detail endpoint, an absolute
CDN URL. Neither tab ever points an `<img>` at that URL: the host half proxies
the bytes through `/dsh-better-skillmanager/icon`, so the page keeps a single origin, no
referrer leaks to the CDN, and a CDN outage degrades to a letter tile rather
than a broken image. Skills the market serves no icon for (for example
`embedded-systems`) also get the tile.

## Installing

The install endpoint is guarded, and local by default. It validates JSON, the
slug and the namespace (`@publisher`) before anything touches the file system,
then asks the market for the published file list
(`/api/v1/skills/<slug>/files`), downloads every entry (`/file?path=…`) checking
the advertised sha256, writes the tree into a staging directory beside the
target and swaps it in with a rename — so a truncated or tampered download never
leaves a half-installed skill behind. The directory is named
`<publisher-handle>--<slug>`, the same layout the market plugin uses.

If the skill-market plugin answers its probe (`/skill-market/api/state`, cached
for 60 seconds), the request is delegated to its `/skill-market/api/install`
instead, because that bundle owns the disabled-skills store and the version
ledger.

## Uninstalling

1. It refuses anything but JSON, a missing `name` or `dir`, an unknown name, a
   built-in skill (`403`), a directory that disagrees with the registry (`409`),
   a path outside the known skill roots (`403`), and a directory that is
   already gone (`404`).
2. If the skill-market plugin answers its probe, the request is forwarded to its
   `/skill-market/api/uninstall` (it owns the disabled store and the version
   ledger, and republishes the registry afterwards). Otherwise the tree is
   removed directly with retries.
3. It reads the tree back: `leftover` reports files still on disk (a held
   handle), `stillRegistered` reports a name the current process still serves.

Deleting the directory directly would leave the panel listing a skill whose
files are gone, which is why the market plugin stays in the loop.

## Local import

The 导入 / Import button in the header opens a dialog that takes a skill straight
from this computer — drag files onto the drop zone or click it to browse. Each
accepted file becomes one skill directory under `~/.dsh/skills`.

| Extension | Treated as |
| --- | --- |
| `.zip` | A skill directory, zipped. It must contain a `SKILL.md`, either at the archive root or one directory down; every other entry is written through untouched. |
| `.md`, `.markdown`, `.txt` | A single instruction file, stored as `SKILL.md`. The name comes from the frontmatter `name`, falling back to the file name. |

Limits, enforced by `POST /import` (`GET /import-info` publishes the same
numbers so the dialog cannot drift from the endpoint):

- 24 MB per request, 8 MB per file inside an archive, 2000 entries per archive.
- ZIP is parsed in-process (`node:zlib` `inflateRawSync`) — stored and deflated
  entries work, ZIP64 and encrypted archives are rejected with
  `zip-unreadable` rather than half-imported.
- Entry paths are sanitised (`archivePath`): backslashes, `./`, absolute paths,
  drive letters, `..`, and `__MACOSX` / `.DS_Store` noise are refused or skipped,
  and every write is re-checked against the skill root (`unsafe-path`).
- Directory names are derived from the skill name, then de-duplicated
  (`name`, `name-2`, … `name-199`), so importing twice never overwrites.
- Files are written into the target directory directly; a failure part-way
  leaves what was written so you can inspect it, and the endpoint reports the
  human-readable reason (`missing-skill-md`, `file-too-large`, `too-many-files`,
  `unsupported-type`, `body-too-large`, …).

Frontmatter is read after stripping a UTF-8 BOM, so skills authored with
PowerShell or Notepad keep their declared name instead of falling back to the
file name.

## On-disk skills

The host service only reports skills its providers published, and the market
provider knows just the entries in its own install ledger. A skill copied into
`~/.dsh/skills` by hand — or one whose ledger entry was dropped — is installed
and readable by the agent, yet missing from the registry. `/list` therefore
merges the registry with a scan of `~/.dsh/skills/*/SKILL.md`; those extra rows
carry `source: local-disk` and are labelled **磁盘上 / On disk** in the panel.
The same fallback backs the body and uninstall routes, so such a skill can be
read and removed from the panel like any other.

## Market matching rules
1. The slug comes from the install directory: drop everything before `--`
   and any `-r<digits>` revision suffix.
2. `GET https://api.skillhub.cn/api/v1/skills/<slug>` is queried with a 4s
   timeout, four at a time, cached for ten minutes.
3. The market title wins, unless it merely repeats the slug — then the skill
   name is shown instead. A title carrying the slug as a suffix
   (`MiniMax H3视频提示词 h3-prompt-writing`) has it stripped.
4. Built-in skills (`source: bundled`) are not matched: the market also hosts
   unrelated skills under the same slug, so a match would be misleading.
5. Any failure leaves the panel fully usable with local names, plus a one-line
   warning that replaces the (normally empty) footer.

## Author

Beishan.

## Publishing

Distribution is GitHub-only - no npm account is involved:

```bash
npm pack                      # produces dsh-better-skillmanager-<version>.tgz
```

Upload that tarball as a GitHub **release asset** (tag `v<version>`) and point
the index entry at the repository. Installing from a release asset ships exactly
the files in `files`; installing from git pulls the whole repository, so keep
the repo free of build output and workspaces.

The package is a standard DSH bundle: `dsh.manifestVersion: 1`,
`dsh.bundle.patch` pointing at `cordis.patch.yml`, and a client half declared
under `dsh.client`. `publishConfig.access` is `public`, `private` is unset, and
`files` ships exactly the runtime pieces plus `README.md`, `LICENSE` and
`icon.svg` - no workspace leftovers.

Listing in the community index (`https://dshopen.org`) is a GitHub issue on
[`polang233/dsh-plugin-index`](https://github.com/polang233/dsh-plugin-index)
using its *plugin-add* template: plugin link, one-line summary, optional logo.
Its stated requirement is public source, an installable version and a clear
licence; a fixed git tag is accepted on request, which is what this project uses.

## Notes

- The host half is loaded once at apply time. After editing `index.js`, toggle
  the bundle off and on (`plugin_manager` → `set_bundle`) to reload it;
  `client.js` changes only need a page refresh.
- Requirement: the `skills` and `webServer` host services must be present.

### Tooltips

The badges next to a skill name in the manager detail pane (and in the
storefront drawer) carry hover cards: the green
shield lists each security lab's verdict (`科恩实验室 安全，无风险`,
`云鼎实验室 可疑，存在潜在风险`) with a `查看报告 ↗` link, and the blue
rosette shows the certified legal entity (`已完成企业认证：腾讯科技（深圳）有限公司`).

Rendering them inline did not survive the real shell — the row lives in a
scrolling list, and a `position: fixed` card gets clipped or re-anchored by
ancestor transforms. So there is exactly one card per page: badges only push
`{ anchor, content }` into a tiny store, and `TipsLayer` — the last child of
`.dsk-page`, outside every scroll container — measures
`anchor.getBoundingClientRect()` against `anchor.closest('.dsk-page')` and
positions an absolutely positioned `.dsk-tip-layer` inside that box. A 10px
bridge under the card and a 160ms close delay keep the pointer from slipping
through the gap between the badge and the card.

The manager *list* rows render the same badges with `quiet: true`: no hover
card and no native `title`, because opening a card there fought with the
scrolling list and the detail pane already carries the same facts.

### Detail drawer

Clicking a card slides a 560px inspector in from the right edge (`94%` cap on
narrow windows), starting 40px below the top of the viewport (`--dsk-drawer-top`)
so it clears the window's own minimise / maximise / close controls — pinned to
y=0 it ran straight over them. The scrim starts at the same offset, leaving the
title-bar strip usable. It overlays a dimmed page, matching how skill-market presents a skill:
fixed header with the icon, official name and namespace, a scrolling body with
the tags, the `dsk-kv` field list (`更新时间` reads `40 分钟前 · 2026 年 10 月 29 日`
so it agrees with the cards), the description block, and an action footer that
stays pinned to the bottom with the install button. Clicking the scrim or the
`×` closes it. Entry animation is CSS-only (`dsk-slide-in`), so the drawer no
longer jumps position depending on which card opened it.

Management buttons sit on the drawer's title row, to the right of the skill
name and vertically centred with it. The title block is the only flexible cell
of that row (it ellipsizes), so the buttons keep a fixed position whatever the
name length is:


- not installed -> `安装` (`POST /dsh-better-skillmanager/install`);
- installed -> `在技能管理中打开` (jumps to the manager pane with the row
  selected) and `卸载`;
- `卸载` is a red outline button that asks for confirmation first, then calls
  `POST /dsh-better-skillmanager/uninstall` with the registry `name` + `dir` pair that
  `/preview` now returns in `record`. That pair is exactly what the endpoint
  validates, so the drawer never has to guess a directory name.
