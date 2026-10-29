/**
 * Host half of the `dsh-skills` bundle.
 *
 * The Client half renders the panel; it cannot read the host `skills`
 * registry (that service is process-local and not exposed over `ctx.remote`),
 * so this half publishes these routes on the local web server:
 *
 *   GET  /dsh-better-skillmanager/list          -> every skill visible to this process
 *   GET  /dsh-better-skillmanager/skill?name=.. -> one skill's body (SKILL.md content)
 *   GET  /dsh-better-skillmanager/icon?slug=..  -> the market icon, proxied (same-origin)
 *   POST /dsh-better-skillmanager/uninstall     -> remove one installed skill from disk
 *
 * Uninstall is delegated to the skill-market bundle (`/skill-market/api/uninstall`):
 * it is the component that owns the install layout, the disabled store and the
 * version records, and it re-publishes the registry afterwards. Removing the
 * directory here would leave the catalog pointing at a skill that no longer
 * exists, so this route is deliberately a guarded proxy, not a second
 * implementation.
 *
 * `/list` additionally matches each installed skill against the public skill
 * market so the panel can show the official display name next to the
 * installation directory name — the two differ often enough to be confusing
 * (e.g. `davtime--dsh-plugin-studio` is published as "DSH插件开发助手").
 *
 * Market matching is best effort: it is cached, bounded by a timeout and a
 * small concurrency window, and any failure simply leaves the panel with the
 * locally declared name.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

const ROUTE_PREFIX = '/dsh-better-skillmanager';
const MARKET_BASE = 'https://api.skillhub.cn';
const MARKET_TTL = 10 * 60 * 1000;
const MARKET_TIMEOUT = 4000;
const MARKET_CONCURRENCY = 4;

/** The skill-market bundle owns install/uninstall; this is its route prefix. */
const MARKET_ROUTE = '/skill-market/api';
const UNINSTALL_TIMEOUT = 15000;
const BODY_LIMIT = 64 * 1024;

/** Market icons are proxied so the page never depends on a third-party origin. */
const ICON_TTL = 60 * 60 * 1000;
const ICON_TIMEOUT = 6000;
const ICON_MAX_BYTES = 512 * 1024;
const ICON_CACHE_LIMIT = 160;
const ICON_TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/;

/**
 * Browse proxies the market catalog. The panel's second tab is a storefront, so
 * these routes answer with the same data the market website shows — but compact
 * and already filtered: CDN URLs never leave the host, and every card carries
 * whether the skill is installed here.
 */
const BROWSE_TTL = 5 * 60 * 1000;
const BROWSE_TIMEOUT = 15000;
const BROWSE_PAGE_SIZE = 24;
const BROWSE_MAX_PAGE_SIZE = 48;
const BROWSE_CACHE_LIMIT = 40;
const CATEGORIES_TTL = 60 * 60 * 1000;
const CATEGORIES_TIMEOUT = 8000;
const PREVIEW_TTL = 10 * 60 * 1000;
const PREVIEW_CACHE_LIMIT = 60;
const INSTALL_TIMEOUT = 120000;
/** Native install: how many files to fetch at once, and the caps that bound it. */
const INSTALL_CONCURRENCY = 4;
const MAX_INSTALL_FILES = 2000;
const MAX_INSTALL_BYTES = 4 * 1024 * 1024;
const MARKET_UA = 'dsh-better-skillmanager/1.0 (+https://skillhub.cn)';
const SORT_KEYS = ['score', 'downloads', 'stars', 'updated_at'];

/** upstream URL -> { at: number, value: { total: number, skills: object[] } } */
const browseCache = new Map();
/** slug -> { at: number, value: MarketDetail } */
const previewCache = new Map();
/** { at: number, value: object } */
let categoriesCache = null;

/** slug -> { at: number, value: MarketEntry } */
const marketCache = new Map();
/** slug -> { at: number, type: string, body: Buffer | null } */
const iconCache = new Map();

export const inject = ['skills', 'webServer'];

export function apply(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler(req, res) {
        void handle(ctx, req, res);
      },
    }),
  );
}

async function handle(ctx, req, res) {
  let sub = '/';
  let url;
  try {
    url = new URL(req.url || '/', 'http://127.0.0.1');
    sub = url.pathname.slice(ROUTE_PREFIX.length) || '/';
  } catch {
    sendJson(res, 400, { ok: false, error: 'bad-url' });
    return;
  }

  try {
    if (sub === '/list' || sub === '/list/') {
      await sendList(ctx, res, url);
      return;
    }
    if (sub === '/skill' || sub === '/skill/') {
      await sendSkill(ctx, res, url);
      return;
    }
    if (sub === '/icon' || sub === '/icon/') {
      await sendIcon(res, url);
      return;
    }
    if (sub === '/browse' || sub === '/browse/') {
      await sendBrowse(ctx, res, url);
      return;
    }
    if (sub === '/categories' || sub === '/categories/') {
      await sendCategories(res, url);
      return;
    }
    if (sub === '/preview' || sub === '/preview/') {
      await sendPreview(ctx, res, url);
      return;
    }
    if (sub === '/install' || sub === '/install/') {
      await sendInstall(ctx, req, res);
      return;
    }
    if (sub === '/uninstall' || sub === '/uninstall/') {
      await sendUninstall(ctx, req, res);
      return;
    }
    sendJson(res, 404, { ok: false, error: 'unknown-route', path: sub });
  } catch (error) {
    sendJson(res, 500, { ok: false, error: 'internal', message: messageOf(error) });
  }
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

async function sendList(ctx, res, url) {
  if (url.searchParams.get('refresh') === '1') marketCache.clear();

  const registry = ctx.get('skills');
  if (!registry) {
    sendJson(res, 503, { ok: false, error: 'skills-service-unavailable' });
    return;
  }

  const snapshot = await observe(registry);
  const catalog = mergeCatalog(snapshot.skills, await scanDisk());
  const rows = catalog.rows;
  const slugged = rows.map((summary) => ({ summary, slug: slugOf(summary) }));

  // Bundled skills ship with the harness; the market also hosts unrelated
  // skills under the same slug, so they are excluded from matching rather than
  // shown under a name that belongs to somebody else's upload.
  const market = await lookupMany(
    slugged.filter((entry) => entry.summary.source !== 'bundled').map((entry) => entry.slug),
  );

  const skills = slugged.map((entry) => toSkill(entry.summary, entry.slug, market.map));
  skills.sort((a, b) => String(a.title || a.name).localeCompare(String(b.title || b.name), 'zh-Hans-CN'));

  sendJson(res, 200, {
    ok: true,
    complete: snapshot.complete,
    total: skills.length,
    marketReachable: market.reachable,
    fetchedAt: new Date().toISOString(),
    skills,
  });
}

async function sendSkill(ctx, res, url) {
  const name = String(url.searchParams.get('name') || '').trim();
  if (!name) {
    sendJson(res, 400, { ok: false, error: 'missing-name' });
    return;
  }

  const registry = ctx.get('skills');
  if (!registry) {
    sendJson(res, 503, { ok: false, error: 'skills-service-unavailable' });
    return;
  }

  const skill = (await registry.get(name, {})) || (await diskSkill(name));
  if (!skill) {
    sendJson(res, 404, { ok: false, error: 'not-found', name });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    name: skill.name,
    description: text(skill.description),
    whenToUse: text(skill.whenToUse),
    content: stripFrontmatter(text(skill.content)),
  });
}

/* ------------------------------------------------------------------ */
/* icons                                                               */
/* ------------------------------------------------------------------ */

/**
 * Serve the market icon for one slug.
 *
 * The panel renders every icon through this route instead of pointing `img` at
 * the CDN: the GUI is served from this origin, so a same-origin URL cannot be
 * blocked by a page CSP, cannot leak the referrer, and does not depend on the
 * CDN allowing hot-links. Misses are cached too — an unmatched slug costs one
 * lookup, not one per paint.
 */
async function sendIcon(res, url) {
  const slug = normalizeSlug(String(url.searchParams.get('slug') || '').trim());
  if (!slug) {
    sendEmpty(res, 400);
    return;
  }

  const hit = iconCache.get(slug);
  const fresh = hit && Date.now() - hit.at < ICON_TTL;
  let entry = fresh ? hit : null;

  if (!fresh) {
    try {
      entry = await fetchIcon(slug);
    } catch {
      entry = { at: Date.now(), type: '', body: null };
    }
    iconCache.set(slug, entry);
    if (iconCache.size > ICON_CACHE_LIMIT) {
      const oldest = iconCache.keys().next();
      if (!oldest.done) iconCache.delete(oldest.value);
    }
  }

  if (!entry || !entry.body) {
    sendEmpty(res, 404);
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', entry.type);
  res.setHeader('content-length', String(entry.body.length));
  res.setHeader('cache-control', 'public, max-age=3600');
  res.setHeader('x-content-type-options', 'nosniff');
  res.end(entry.body);
}

async function fetchIcon(slug) {
  const miss = { at: Date.now(), type: '', body: null };
  const market = await marketOne(slug);
  const source = market && market.iconUrl;
  if (!source) return miss;

  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') return miss;

  const response = await fetchFn(source, { headers: { accept: 'image/*' }, signal: timeoutSignal(ICON_TIMEOUT) });
  if (!response.ok) return miss;

  const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!ICON_TYPES.test(type)) return miss;

  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > ICON_MAX_BYTES) return miss;

  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length || body.length > ICON_MAX_BYTES) return miss;

  return { at: Date.now(), type, body };
}

/* ------------------------------------------------------------------ */
/* uninstall                                                           */
/* ------------------------------------------------------------------ */

/**
 * Remove one installed skill.
 *
 * Delegated to the skill-market bundle: it owns the install layout, the
 * disabled store and the version records, and it re-publishes the registry
 * after the directory is gone — which is what makes the panel update without a
 * restart. The guards here exist because the panel is not the only thing that
 * can reach this route: the target must be a plain directory name inside a
 * skills root, built-in skills are refused, and the name the panel displayed
 * must still be the one on disk.
 */
/* ------------------------------------------------------------------ */
/* install / uninstall: native path when the market bundle is absent    */
/* ------------------------------------------------------------------ */

/**
 * Whether `@montersy123/dsh-skill-market` is answering right now.
 *
 * That bundle owns the install layout and re-publishes the registry after a
 * change, so it is preferred whenever it is there. It is optional though: once
 * it is uninstalled its routes fall through to the web server's fallback and a
 * POST to them answers 405, which used to surface as "技能市场返回 HTTP 405".
 * Probing once a minute keeps the two paths honest without a round trip per click.
 */
let marketProbe = { at: 0, ok: false };

async function marketReady(ctx, req) {
  if (Date.now() - marketProbe.at < 60 * 1000) return marketProbe.ok;
  let ok = false;
  try {
    const response = await fetch(`${selfOrigin(ctx, req)}${MARKET_ROUTE}/state`, {
      headers: { accept: 'application/json' },
      signal: timeoutSignal(2500),
    });
    ok = response.ok;
  } catch {
    ok = false;
  }
  marketProbe = { at: Date.now(), ok };
  return ok;
}

/** One path segment of an install directory, mirroring the market's layout. */
function installSegment(value, fallback) {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return (cleaned || fallback).slice(0, 64);
}

/**
 * Validate one upstream file path. Upstream paths are attacker controlled, so
 * absolute paths, drive letters, backslashes and `..` are all rejected; the
 * caller joins the returned value under the skill's own directory.
 */
function safeRelativePath(raw) {
  const value = String(raw ?? '');
  if (!value || value.length > 400) return null;
  if (value.startsWith('/') || value.startsWith('\\') || /^[A-Za-z]:/.test(value)) return null;
  if (value.includes('\\') || value.includes('\0')) return null;
  const parts = value.split('/').filter((segment) => segment !== '' && segment !== '.');
  if (parts.length === 0 || parts.some((segment) => segment === '..')) return null;
  return parts.join('/');
}

/**
 * Download a published skill's file bundle straight from the market.
 *
 * Two endpoints, both public: `…/files` lists the release (path, size, sha256)
 * and `…/file` returns one file's bytes. Files are staged in a sibling
 * directory and the swap is a rename, so an interrupted download can never
 * leave a half-written skill in place.
 */
async function nativeInstall(ctx, { slug, namespace, version }) {
  const handle = installSegment(namespace.replace(/^@/, ''), 'skillhub');
  const directory = `${handle}--${installSegment(slug, 'skill')}`.slice(0, 128);
  const root = SKILLS_ROOT;
  const target = join(root, directory);
  const stamp = Date.now();
  const staging = join(root, `.staging-${directory}-${stamp}`);

  const query = new URLSearchParams({ namespace });
  if (version) query.set('version', version);
  const listUrl = `${MARKET_BASE}/api/v1/skills/${encodeURIComponent(slug)}/files?${query.toString()}`;
  const listing = await fetch(listUrl, {
    headers: { 'user-agent': MARKET_UA, accept: 'application/json' },
    signal: timeoutSignal(INSTALL_TIMEOUT),
  }).then((response) => {
    if (!response.ok) throw new Error(`技能市场返回 HTTP ${response.status}`);
    return response.json();
  });

  const released = text(listing && listing.version) || text(version);
  const list = Array.isArray(listing && listing.files) ? listing.files : [];
  if (list.length === 0) throw new Error('该技能没有可下载的文件');
  if (list.length > MAX_INSTALL_FILES) throw new Error(`文件数超出上限（${list.length}）`);

  const files = [];
  for (const entry of list) {
    const path = safeRelativePath(entry && entry.path);
    if (!path) throw new Error(`文件路径不合法：${String(entry && entry.path).slice(0, 80)}`);
    const size = Number(entry && entry.size) || 0;
    if (size > MAX_INSTALL_BYTES) throw new Error(`文件过大：${path}`);
    files.push({ path, size, sha256: text(entry && entry.sha256) });
  }
  if (!files.some((file) => file.path === 'SKILL.md')) throw new Error('技能缺少 SKILL.md');

  mkdirSync(staging, { recursive: true });
  let written = 0;
  let bytes = 0;
  try {
    let cursor = 0;
    const worker = async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= files.length) return;
        const file = files[index];
        const fileQuery = new URLSearchParams({ path: file.path, namespace });
        if (released) fileQuery.set('version', released);
        const url = `${MARKET_BASE}/api/v1/skills/${encodeURIComponent(slug)}/file?${fileQuery.toString()}`;
        const response = await fetch(url, {
          headers: { 'user-agent': MARKET_UA },
          signal: timeoutSignal(INSTALL_TIMEOUT),
        });
        if (!response.ok) throw new Error(`下载 ${file.path} 失败：HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > MAX_INSTALL_BYTES) throw new Error(`文件过大：${file.path}`);
        if (file.sha256) {
          const digest = createHash('sha256').update(buffer).digest('hex');
          if (digest !== file.sha256) throw new Error(`校验失败：${file.path}`);
        }
        const destination = join(staging, ...file.path.split('/'));
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, buffer);
        written += 1;
        bytes += buffer.length;
      }
    };
    const width = Math.min(INSTALL_CONCURRENCY, files.length);
    await Promise.all(Array.from({ length: width }, worker));

    // Swap: move any previous copy aside first so a failure cannot leave the
    // skill directory empty.
    let replaced = '';
    if (existsSync(target)) {
      replaced = `${target}.replaced-${stamp}`;
      renameSync(target, replaced);
    }
    try {
      renameSync(staging, target);
    } catch (error) {
      if (replaced) renameSync(replaced, target);
      throw error;
    }
    if (replaced) rmSync(replaced, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
  } catch (error) {
    rmSync(staging, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
    throw error;
  }

  return { directory, name: directory, version: released, files: written, bytes };
}

/** Remove one skill directory, refusing anything that escapes the skills root. */
function nativeUninstall(target) {
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
}

async function sendUninstall(ctx, req, res) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.indexOf('application/json') < 0) {
    sendJson(res, 415, { ok: false, error: 'expected-json' });
    return;
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: 'bad-body', message: messageOf(error) });
    return;
  }

  const registry = ctx.get('skills');
  if (!registry) {
    sendJson(res, 503, { ok: false, error: 'skills-service-unavailable' });
    return;
  }

  const name = text(payload.name);
  const directory = safeDirectoryName(payload.dir);
  if (!directory) {
    sendJson(res, 400, {
      ok: false,
      error: 'bad-directory',
      message: '需要技能目录名（不含路径分隔符）',
    });
    return;
  }

  // Both halves are required: the name proves the caller saw this exact skill in
  // the registry, the directory names the tree to delete. A directory alone is not
  // enough to justify a delete.
  if (!name) {
    sendJson(res, 400, {
      ok: false,
      error: 'missing-name',
      message: '需要技能名（注册表里的 name）',
    });
    return;
  }

  const skill = (await registry.get(name, {})) || (await diskSkill(name));
  if (!skill) {
    sendJson(res, 404, { ok: false, error: 'not-found', name });
    return;
  }

  if (skill.source === 'bundled') {
    sendJson(res, 403, {
      ok: false,
      error: 'bundled-not-removable',
      message: '内置技能随 harness 发布，不能卸载',
    });
    return;
  }

  const onDisk = basename(dirOf(skill.path));
  if (onDisk && onDisk !== directory) {
    sendJson(res, 409, {
      ok: false,
      error: 'directory-mismatch',
      message: `目录不匹配：注册表指向 ${onDisk}`,
    });
    return;
  }

  const root = skillsRoots(skill).find((candidate) => contains(candidate, directory));
  if (!root) {
    sendJson(res, 403, {
      ok: false,
      error: 'outside-skill-root',
      message: '拒绝越界的卸载路径',
      roots: skillsRoots(skill),
    });
    return;
  }

  const target = join(root, directory);
  if (!existsSync(target)) {
    sendJson(res, 404, { ok: false, error: 'missing-directory', dir: target });
    return;
  }

  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    sendJson(res, 503, { ok: false, error: 'fetch-unavailable' });
    return;
  }

  const origin = selfOrigin(ctx, req);
  let marketUninstall = null;
  if (await marketReady(ctx, req)) {
    let status = 0;
    let body = null;
    try {
      const response = await fetchFn(`${origin}${MARKET_ROUTE}/uninstall`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ name: directory }),
        signal: timeoutSignal(UNINSTALL_TIMEOUT),
      });
      status = response.status;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok || !body || body.ok !== true) {
        sendJson(res, status || 502, {
          ok: false,
          error: 'market-uninstall-failed',
          message: text(body && (body.message || body.error)) || `技能市场返回 HTTP ${status}`,
        });
        return;
      }
      marketUninstall = (body && body.uninstall) || null;
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: 'market-unreachable',
        message: messageOf(error),
      });
      return;
    }
  } else {
    // No market bundle: delete the tree ourselves. Every guard above has already
    // run, so `target` is a validated directory inside a known skills root.
    try {
      nativeUninstall(target);
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: 'uninstall-failed',
        message: messageOf(error),
      });
      return;
    }
  }

  // Read the tree back instead of trusting the reply: a directory that is still
  // there means something holds a handle on it, and the panel should say so.
  const leftover = existsSync(target);
  let stillRegistered = false;
  try {
    stillRegistered = !!(await registry.get(name, {}));
  } catch {
    /* the registry is optional here; absence means "not listed" */
  }

  sendJson(res, 200, {
    ok: true,
    removed: directory,
    dir: target,
    leftover,
    stillRegistered: leftover ? false : stillRegistered,
    market: marketUninstall,
  });
}

async function readJson(req) {
  return new Promise((resolve_, reject_) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject_(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve_({});
        return;
      }
      try {
        resolve_(JSON.parse(raw));
      } catch (error) {
        reject_(new Error('请求体不是 JSON：' + messageOf(error)));
      }
    });
    req.on('error', reject_);
  });
}

/** Every directory that may hold an installed skill, for the containment check. */
function skillsRoots(skill) {
  const roots = new Set([join(homedir(), '.dsh', 'skills')]);
  if (skill && skill.source !== 'bundled') {
    const dir = dirOf(skill.path);
    if (dir) roots.add(dirname(dir));
    const base = skill.resourceBase;
    if (base && base.kind === 'directory' && base.path) roots.add(dirname(String(base.path)));
  }
  return [...roots].filter(Boolean);
}

/** True when `<root>/<name>` resolves to a direct child of `root`. */
function contains(root, name) {
  try {
    return resolve(join(root, name)).startsWith(resolve(root) + sep);
  } catch {
    return false;
  }
}

/** A directory name we are willing to join onto a root: no separators, no dots. */
function safeDirectoryName(value) {
  const raw = text(value);
  if (!raw || raw.length > 200) return '';
  if (raw === '.' || raw === '..') return '';
  return /[\\/:*?"<>|]/.test(raw) ? '' : raw;
}

/** The web server's own loopback origin, for calling a sibling plugin's route. */
function selfOrigin(ctx, req) {
  try {
    const origin =
      ctx.webServer && typeof ctx.webServer.getOrigin === 'function'
        ? String(ctx.webServer.getOrigin() || '')
        : '';
    if (/^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)(:\d+)?$/i.test(origin)) {
      return origin.replace(/\/+$/, '');
    }
  } catch {
    /* fall back to the socket */
  }
  const port = req && req.socket && req.socket.localPort;
  return `http://127.0.0.1:${port || 2875}`;
}

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

/* ------------------------------------------------------------------ */
/* browse: the market catalog                                          */
/* ------------------------------------------------------------------ */

/** Parse an untrusted integer from the query string, then hold it inside a range. */
function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value == null ? '' : value), 10);
  const base = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, base));
}

/**
 * One page of the public catalog.
 *
 * This is a read-only storefront: it forwards only the parameters the market
 * accepts, pins the sort keys to a known set, and clamps paging so a crafted
 * query cannot ask for page 10^9 or 5000 cards.
 */
async function sendBrowse(ctx, res, url) {
  if (url.searchParams.get('refresh') === '1') browseCache.clear();

  const keyword = text(url.searchParams.get('keyword')).slice(0, 120);
  const category = text(url.searchParams.get('category')).slice(0, 60);
  const rawSort = text(url.searchParams.get('sortBy'));
  const sortBy = SORT_KEYS.includes(rawSort) ? rawSort : 'score';
  const order = text(url.searchParams.get('order')) === 'asc' ? 'asc' : 'desc';
  const page = clampInt(url.searchParams.get('page'), 1, 1, 500);
  const pageSize = clampInt(url.searchParams.get('pageSize'), BROWSE_PAGE_SIZE, 1, BROWSE_MAX_PAGE_SIZE);

  const target = new URL(`${MARKET_BASE}/api/skills`);
  target.searchParams.set('page', String(page));
  target.searchParams.set('pageSize', String(pageSize));
  target.searchParams.set('sortBy', sortBy);
  target.searchParams.set('order', order);
  if (keyword) target.searchParams.set('keyword', keyword);
  if (category) target.searchParams.set('category', category);

  const cacheKey = target.href;
  const hit = browseCache.get(cacheKey);
  let payload = hit && Date.now() - hit.at < BROWSE_TTL ? hit.value : null;

  if (!payload) {
    try {
      payload = await fetchBrowse(cacheKey);
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: 'market-unreachable',
        message: messageOf(error),
      });
      return;
    }
    browseCache.set(cacheKey, { at: Date.now(), value: payload });
    if (browseCache.size > BROWSE_CACHE_LIMIT) {
      const oldest = browseCache.keys().next();
      if (!oldest.done) browseCache.delete(oldest.value);
    }
  }

  // Installed slugs are read per request, never cached with the page: an install
  // must flip the card's button without waiting for the list TTL to expire.
  const installed = await installedSlugs(ctx);

  sendJson(res, 200, {
    ok: true,
    page,
    pageSize,
    sortBy,
    order,
    keyword,
    category,
    total: payload.total,
    pages: Math.max(1, Math.ceil(payload.total / pageSize)),
    fetchedAt: new Date().toISOString(),
    skills: payload.skills.map((entry) => cardOf(entry, installed)),
  });
}

async function fetchBrowse(href) {
  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('fetch 不可用');

  const response = await fetchFn(href, {
    headers: { accept: 'application/json', 'user-agent': MARKET_UA },
    signal: timeoutSignal(BROWSE_TIMEOUT),
  });
  if (!response.ok) throw new Error(`技能市场返回 HTTP ${response.status}`);

  const body = await response.json();
  const data = (body && body.data) || {};
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : skills.length;
  return { total, skills };
}

/** Normalize one upstream catalog entry into the compact card the panel draws. */
function cardOf(entry, installed) {
  const slug = text(entry && entry.slug);
  const namespace = (entry && entry.namespace) || {};
  const publisher = (entry && entry.publisher) || {};
  const labels = (entry && entry.labels) || {};
  const subCategories = Array.isArray(entry && entry.subCategories) ? entry.subCategories : [];

  return {
    slug,
    name: cleanTitle(text(entry && entry.name), slug) || slug,
    description: text(entry && entry.description_zh) || text(entry && entry.description),
    namespace: text(namespace.canonicalName),
    namespaceHandle: text(namespace.handle),
    // The CDN URL is intentionally not shipped: the card loads /icon?slug=.
    icon: !!absoluteUrl(text(entry && entry.iconUrl)),
    category: text(entry && entry.category),
    subCategories: subCategories
      .map((sub) => text(sub && sub.name))
      .filter(Boolean)
      .slice(0, 3),
    version: text(entry && entry.version),
    downloads: Number(entry && entry.downloads) || 0,
    stars: Number(entry && entry.stars) || 0,
    publisher: text(publisher.name),
    verified: !!publisher.verified,
    source: text(entry && entry.source),
    requiresApiKey: String(labels.requires_api_key || '') === 'true',
    updatedAt: Number(entry && entry.updated_at) || 0,
    installed: installed.has(slug),
  };
}

/** The categories the market itself groups skills by, active ones only. */
async function sendCategories(res) {
  if (categoriesCache && Date.now() - categoriesCache.at < CATEGORIES_TTL) {
    sendJson(res, 200, categoriesCache.value);
    return;
  }

  try {
    const response = await fetch(`${MARKET_BASE}/api/v1/categories`, {
      headers: { accept: 'application/json', 'user-agent': MARKET_UA },
      signal: timeoutSignal(CATEGORIES_TIMEOUT),
    });
    if (!response.ok) throw new Error(`技能市场返回 HTTP ${response.status}`);

    const body = await response.json();
    const items = Array.isArray(body && body.items) ? body.items : [];
    const value = {
      ok: true,
      categories: items
        .filter((item) => item && item.active !== false)
        .map((item) => ({
          key: text(item.key),
          name: text(item.name),
          nameEn: text(item.nameEn),
        }))
        .filter((item) => item.key && item.name),
    };

    categoriesCache = { at: Date.now(), value };
    sendJson(res, 200, value);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: 'market-unreachable', message: messageOf(error) });
  }
}

/**
 * One market skill's storefront detail, for the card preview.
 *
 * The long body is `overviewMd` (the publisher's introduction). Not every skill
 * publishes one — the API currently returns an empty string for most — so the
 * panel falls back to the summary it already has. `namespace` disambiguates
 * duplicated slugs: several publishers may ship the same slug.
 */
async function sendPreview(ctx, res, url) {
  const slug = normalizeSlug(text(url.searchParams.get('slug')));
  if (!slug) {
    sendJson(res, 400, { ok: false, error: 'missing-slug' });
    return;
  }
  const ns = text(url.searchParams.get('namespace')).slice(0, 200);

  let detail;
  try {
    detail = await previewOne(slug, ns);
  } catch (error) {
    sendJson(res, 502, { ok: false, error: 'market-unreachable', message: messageOf(error) });
    return;
  }

  if (!detail.found) {
    sendJson(res, 404, { ok: false, error: 'not-found', slug });
    return;
  }

  const installed = await installedSlugs(ctx);
  sendJson(
    res,
    200,
    Object.assign({}, detail, {
      ok: true,
      installed: installed.has(slug),
      // The drawer offers management actions, so it needs the registry record
      // (name + directory) that /uninstall validates against.
      record: installed.has(slug) ? await installedRecord(ctx, slug) : null,
    }),
  );
}

/**
 * The registry summary behind a market slug, reduced to what the management
 * endpoints need. `slugOf` derives the slug from the skill's directory, which
 * is how the market lays skills out (`<publisher>--<slug>`).
 */
async function installedRecord(ctx, slug) {
  const registry = ctx.get('skills');
  if (!registry) return null;
  try {
    const snapshot = await observe(registry);
    const hit = snapshot.skills.find((summary) => slugOf(summary) === slug);
    if (!hit) return null;
    const path = text(hit.path);
    return {
      name: text(hit.name),
      dir: path ? basename(dirOf(path)) : '',
      source: text(hit.source),
    };
  } catch {
    return null;
  }
}

async function previewOne(slug, ns) {
  const cacheKey = slug + '@' + ns;
  const hit = previewCache.get(cacheKey);
  if (hit && Date.now() - hit.at < PREVIEW_TTL) return hit.value;

  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') return { found: false };

  const href =
    `${MARKET_BASE}/api/v1/skills/${encodeURIComponent(slug)}` +
    (ns ? `?namespace=${encodeURIComponent(ns)}` : '');

  const response = await fetchFn(href, {
    headers: { accept: 'application/json', 'user-agent': MARKET_UA },
    signal: timeoutSignal(BROWSE_TIMEOUT),
  });
  if (response.status === 404) {
    const miss = { found: false, status: 404 };
    previewCache.set(cacheKey, { at: Date.now(), value: miss });
    return miss;
  }
  if (!response.ok) throw new Error(`技能市场返回 HTTP ${response.status}`);

  const body = await response.json();
  const skill = (body && body.skill) || {};
  const latest = (body && body.latestVersion) || {};
  const namespace = (body && body.namespace) || {};
  const publisher = (body && body.publisher) || {};
  const stats = skill.stats || {};
  const subCategories = Array.isArray(skill.subCategories) ? skill.subCategories : [];

  const value = {
    found: true,
    slug: text(body && body.slug) || slug,
    name: cleanTitle(text(skill.displayName), slug) || slug,
    namespace: text(namespace.canonicalName),
    namespaceHandle: text(namespace.handle),
    summary: text(skill.summary_zh) || text(skill.summary),
    overview: String(skill.overviewMd || '').trim(),
    icon: !!absoluteUrl(text(skill.iconUrl)),
    version: text(latest.version) || text(skill.version),
    category: text(skill.category),
    subCategories: subCategories.map((sub) => text(sub && sub.name)).filter(Boolean).slice(0, 6),
    publisher: text(publisher.name),
    verified: !!(publisher.verified || skill.isAuthorVerified),
    source: text(skill.source),
    downloads: Number(stats.downloads || 0),
    stars: Number(stats.stars || 0),
    installedAt: Number(stats.installs || 0) || 0,
    updatedAt: Number(skill.updatedAt || 0) || 0,
    requiresApiKey: String((skill.labels || {}).requires_api_key || '') === 'true',
    // The market returns an enterprise name for verified publishers; it is what
    // the certification tooltip shows.
    certifiedName: text(publisher.certifiedName),
    securityReports: securityList(body && body.securityReports),
  };

  previewCache.set(cacheKey, { at: Date.now(), value });
  if (previewCache.size > PREVIEW_CACHE_LIMIT) {
    const oldest = previewCache.keys().next();
    if (!oldest.done) previewCache.delete(oldest.value);
  }
  return value;
}

/**
 * Install one market skill.
 *
 * Same delegation as uninstall: the skill-market bundle writes the directory,
 * records the version and republishes the registry, so an install made here is
 * indistinguishable from one made in the market panel. The slug and namespace
 * are validated first — they end up as path segments downstream.
 */
async function sendInstall(ctx, req, res) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (contentType.indexOf('application/json') < 0) {
    sendJson(res, 415, { ok: false, error: 'expected-json' });
    return;
  }

  let payload;
  try {
    payload = await readJson(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: 'bad-body', message: messageOf(error) });
    return;
  }

  const slug = text(payload.slug);
  const namespace = text(payload.namespace);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(slug)) {
    sendJson(res, 400, { ok: false, error: 'bad-slug', message: '技能 slug 不合法' });
    return;
  }
  if (!/^@[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(namespace)) {
    sendJson(res, 400, { ok: false, error: 'bad-namespace', message: '命名空间不合法（应形如 @publisher）' });
    return;
  }

  const registry = ctx.get('skills');
  if (!registry) {
    sendJson(res, 503, { ok: false, error: 'skills-service-unavailable' });
    return;
  }

  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    sendJson(res, 503, { ok: false, error: 'fetch-unavailable' });
    return;
  }

  let body = null;
  let status = 0;
  if (await marketReady(ctx, req)) {
    try {
      const response = await fetchFn(`${selfOrigin(ctx, req)}${MARKET_ROUTE}/install`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ slug, namespace }),
        signal: timeoutSignal(INSTALL_TIMEOUT),
      });
      status = response.status;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (!response.ok || !body || body.ok !== true) {
        sendJson(res, status || 502, {
          ok: false,
          error: 'market-install-failed',
          message: text(body && (body.message || body.error)) || `技能市场返回 HTTP ${status}`,
        });
        return;
      }
    } catch (error) {
      sendJson(res, 502, { ok: false, error: 'market-unreachable', message: messageOf(error) });
      return;
    }
  } else {
    // The market bundle is optional: fetch the published file bundle directly.
    try {
      const result = await nativeInstall(ctx, { slug, namespace, version: text(payload.version) });
      sendJson(res, 200, {
        ok: true,
        slug,
        namespace,
        directory: result.directory,
        name: result.name,
        version: result.version,
        files: result.files,
        bytes: result.bytes,
        installed: true,
        via: 'native',
      });
      return;
    } catch (error) {
      sendJson(res, 502, {
        ok: false,
        error: 'install-failed',
        message: messageOf(error),
      });
      return;
    }
  }

  const install = (body && body.install) || {};
  const installed = await installedSlugs(ctx);

  sendJson(res, 200, {
    ok: true,
    slug,
    namespace,
    directory: text(install.directory),
    name: text(install.name),
    version: text(install.version),
    files: Number(install.files) || 0,
    installed: installed.has(slug),
  });
}

/** Slugs of everything currently installed, so a card can say "installed". */
async function installedSlugs(ctx) {
  const slugs = new Set();
  const registry = ctx.get('skills');
  if (registry) {
    try {
      const snapshot = await observe(registry);
      for (const summary of snapshot.skills) {
        const slug = slugOf(summary);
        if (slug) slugs.add(slug);
      }
    } catch {
      /* an unreadable registry just means "nothing known from that side" */
    }
  }
  // Also trust the disk: a skill installed natively (or by any other tool) sits
  // in `<handle>--<slug>` and only reaches the registry on the next process
  // start, so without this the card would keep offering 安装 after it succeeded.
  try {
    for (const entry of readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      if (name.startsWith('.')) continue;
      const cut = name.indexOf('--');
      if (cut > 0 && cut + 2 < name.length) slugs.add(name.slice(cut + 2));
    }
  } catch {
    /* no skills directory yet: nothing installed */
  }
  return slugs;
}

/* ------------------------------------------------------------------ */
/* registry observation                                                */
/* ------------------------------------------------------------------ */

async function observe(registry) {
  if (typeof registry.snapshot === 'function') {
    const snapshot = await registry.snapshot({});
    return {
      skills: Array.isArray(snapshot && snapshot.skills) ? snapshot.skills : [],
      complete: !snapshot || snapshot.complete !== false,
    };
  }
  const list = await registry.list({});
  return { skills: Array.isArray(list) ? list : [], complete: true };
}

function toSkill(summary, slug, marketMap) {
  const market =
    summary.source === 'bundled' ? { found: false } : marketMap.get(slug) || { found: false };
  const localName = text(summary.description);
  const resourceBase = summary.resourceBase;

  return {
    name: String(summary.name || ''),
    slug,
    // Official market name first, then whatever the skill package declares.
    title: market.found && market.displayName ? market.displayName : '',
    description: (market.found && market.description) || localName,
    localDescription: localName,
    whenToUse: text(summary.whenToUse),
    source: String(summary.source || 'unknown'),
    provider: String(summary.provider || ''),
    path: String(summary.path || ''),
    dir:
      resourceBase && resourceBase.kind === 'directory'
        ? String(resourceBase.path || '')
        : dirOf(summary.path),
    invocation: {
      modelInvocable: !!(summary.invocation && summary.invocation.modelInvocable),
      userInvocable: !!(summary.invocation && summary.invocation.userInvocable),
    },
    market: {
      found: !!market.found,
      namespace: market.namespace || '',
      publisher: market.publisher || '',
      version: market.version || '',
      category: market.category || '',
      // Whether /icon can be expected to answer for this slug. The URL stays
      // server-side: the panel only ever loads icons through this plugin.
      icon: !!(market.found && market.iconUrl),
      // True when the market title was polluted with the slug suffix and got
      // cleaned up, or when the raw title was unusable.
      rawTitle: market.rawTitle || '',
      // Trust markers, so the manager pane renders the same badges as the
      // storefront: security shield, certification rosette and the API-key tag.
      verified: !!market.verified,
      official: text(market.publisherSource) === 'enterprise',
      certifiedName: market.certifiedName || '',
      requiresApiKey: !!market.requiresApiKey,
      subCategories: market.subCategories || [],
      securityReports: market.securityReports || [],
      namespaceHandle: market.namespaceHandle || '',
    },
  };
}

/* ------------------------------------------------------------------ */
/* market lookup                                                       */
/* ------------------------------------------------------------------ */

async function lookupMany(slugs) {
  const unique = [...new Set(slugs.filter(Boolean))];
  const map = new Map();
  let reachable = true;
  let cursor = 0;

  const workers = new Array(Math.min(MARKET_CONCURRENCY, unique.length)).fill(0).map(async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= unique.length) return;
      const slug = unique[index];
      try {
        map.set(slug, await marketOne(slug));
      } catch (error) {
        reachable = false;
        map.set(slug, { found: false, error: messageOf(error) });
      }
    }
  });

  await Promise.all(workers);
  return { map, reachable };
}

async function marketOne(slug) {
  const hit = marketCache.get(slug);
  const now = Date.now();
  if (hit && now - hit.at < MARKET_TTL) return hit.value;

  const value = await fetchMarket(slug);
  marketCache.set(slug, { at: now, value });
  return value;
}

async function fetchMarket(slug) {
  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function' || !slug) return { found: false };

  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(MARKET_TIMEOUT)
      : undefined;

  const response = await fetchFn(`${MARKET_BASE}/api/v1/skills/${encodeURIComponent(slug)}`, {
    headers: { accept: 'application/json' },
    signal,
  });

  if (!response.ok) return { found: false, status: response.status };

  const body = await response.json();
  const skill = body && body.skill;
  if (!skill) return { found: false };

  const rawTitle = text(skill.displayName);
  const publisher = (body && body.publisher) || {};
  return {
    found: true,
    rawTitle,
    displayName: cleanTitle(rawTitle, slug),
    description: text(skill.description_zh) || text(skill.description),
    namespace: text(body.namespace && body.namespace.canonicalName),
    namespaceHandle: text(body.namespace && body.namespace.handle),
    version: text(body.latestVersion && body.latestVersion.version),
    publisher: text(publisher.name),
    category: text(skill.category),
    iconUrl: absoluteUrl(text(skill.iconUrl)),
    // Same trust markers the storefront grid shows, so the manager pane can
    // render the very same badges for an installed skill.
    verified: !!(publisher.verified || skill.isAuthorVerified),
    publisherSource: text(skill.source),
    certifiedName: text(publisher.certifiedName),
    requiresApiKey: String((skill.labels || {}).requires_api_key || '') === 'true',
    subCategories: (Array.isArray(skill.subCategories) ? skill.subCategories : [])
      .map((sub) => text(sub && sub.name))
      .filter(Boolean)
      .slice(0, 6),
    // Kept in the market cache so the manager pane can show the same hover
    // card without a second request per row.
    securityReports: securityList(body && body.securityReports),
  };
}

/** Market payloads carry absolute URLs, but a relative one must not reach fetch. */
function absoluteUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Display names for the security labs the market reports on. */
const SECURITY_LABS = {
  keen: '科恩实验室',
  sanbu: '云鼎实验室',
};

/**
 * The market returns securityReports as an object keyed by lab id. Flatten it
 * into an ordered list so the client can render one row per verdict without
 * knowing the lab registry.
 */
function securityList(reports) {
  if (!reports || typeof reports !== 'object') return [];
  return Object.keys(reports)
    .map((id) => {
      const row = reports[id] || {};
      return {
        id,
        lab: SECURITY_LABS[id] || id,
        status: text(row.status),
        statusText: text(row.statusText),
        reportUrl: absoluteUrl(text(row.reportUrl)),
      };
    })
    .filter((row) => !!row.statusText);
}

/**
 * Market titles are inconsistent: most are clean, some repeat the slug as a
 * suffix ("MiniMax H3视频提示词 h3-prompt-writing"), and a few are the bare
 * slug ("video-generate"). Return '' when nothing usable is left so callers
 * fall back to the locally declared name.
 */
function cleanTitle(value, slug) {
  let title = String(value || '').trim();
  if (!title) return '';
  if (!slug) return title;

  const lowered = title.toLowerCase();
  const lowerSlug = slug.toLowerCase();
  if (lowered === lowerSlug) {
    // The market name is the slug itself; keep it only when it at least
    // carries different capitalization ("Mcporter", "Office").
    return title === slug ? '' : title;
  }
  if (lowered.endsWith(lowerSlug)) {
    title = title.slice(0, title.length - slug.length);
    title = title.replace(/[\s\-–—:：·|/]+$/u, '').trim();
  }
  return title;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Installation directories encode the publisher and a revision, e.g.
 * `user-ae5d6d35--dsh-plugin-dev-r054`, while the market keyed by slug
 * `dsh-plugin-dev`. Strip both decorations.
 */
function slugOf(summary) {
  const fromDir = basename(dirOf(summary.path)) || basename(dirOf(summary.resourceBase && summary.resourceBase.path));
  return normalizeSlug(fromDir || summary.name);
}

function normalizeSlug(raw) {
  let slug = String(raw || '').trim();
  const separator = slug.lastIndexOf('--');
  if (separator >= 0) slug = slug.slice(separator + 2);
  slug = slug.replace(/-r\d+$/i, '');
  return slug;
}

function dirOf(relative) {
  if (!relative) return '';
  const value = String(relative).replace(/[\\/]+$/, '');
  if (/\.md$/i.test(value)) {
    const cut = value.search(/[\\/][^\\/]+$/);
    return cut >= 0 ? value.slice(0, cut) : '';
  }
  return value;
}

function basename(relative) {
  if (!relative) return '';
  const parts = String(relative).split(/[\\/]+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

function stripFrontmatter(content) {
  if (!content.startsWith('---')) return content;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return content;
  const after = content.indexOf('\n', end + 1);
  return after < 0 ? '' : content.slice(after + 1).replace(/^\s*\n/, '');
}

/* ------------------------------------------------------------------ */
/* on-disk catalog                                                     */
/* ------------------------------------------------------------------ */

const SKILLS_ROOT = join(homedir(), '.dsh', 'skills');

/** The text of a file's leading `---` frontmatter block, or ''. */
function frontmatterText(content) {
  if (!String(content).startsWith('---')) return '';
  const end = content.indexOf('\n---', 3);
  if (end < 0) return '';
  return content.slice(3, end);
}

/** Read one frontmatter scalar, inline or as a `|` / `>` block. */
function frontmatterValue(block, key) {
  if (!block) return '';
  const lines = block.split(/\r?\n/);
  const pattern = new RegExp('^' + key + '\\s*:(.*)$', 'i');

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    const inline = match[1].trim();

    if (inline && !/^[|>]/.test(inline)) {
      return inline.replace(/^['"]|['"]$/g, '').trim();
    }

    const collected = [];
    for (let next = index + 1; next < lines.length; next += 1) {
      const line = lines[next];
      if (!line.trim()) {
        collected.push('');
        continue;
      }
      if (!/^\s/.test(line)) break;
      collected.push(line);
    }
    if (inline) return inline;
    const indents = collected.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length);
    const indent = indents.length ? Math.min.apply(null, indents) : 0;
    return collected
      .map((line) => line.slice(indent))
      .join('\n')
      .trim();
  }

  return '';
}

/**
 * Skills that exist as directories under `~/.dsh/skills` but are not in the
 * registry.
 *
 * The registry is published by providers, and the skill-market provider only
 * knows entries in its own install ledger. A skill copied in by hand — or one
 * whose ledger entry was dropped — is installed on disk yet invisible to the
 * panel, which is exactly the confusion this panel exists to remove. Reading
 * the directory is cheap and makes the list match the machine.
 */
async function scanDisk() {
  let entries;
  try {
    entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  const found = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = join(SKILLS_ROOT, entry.name);
    let content;
    try {
      content = await readFile(join(dir, 'SKILL.md'), 'utf8');
    } catch {
      continue;
    }
    const block = frontmatterText(content);
    found.push({
      name: frontmatterValue(block, 'name') || entry.name,
      description: frontmatterValue(block, 'description') || frontmatterValue(block, 'summary'),
      whenToUse: frontmatterValue(block, 'whenToUse') || frontmatterValue(block, 'when_to_use'),
      path: join(dir, 'SKILL.md'),
      source: 'local-disk',
      provider: 'local-disk',
      invocation: { modelInvocable: true, userInvocable: true },
      content,
    });
  }
  return found;
}

/** One on-disk skill by name (or install directory), when the registry lacks it. */
async function diskSkill(name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return undefined;
  const rows = await scanDisk();
  return rows.find(
    (row) =>
      String(row.name || '').toLowerCase() === wanted ||
      basename(row.path).toLowerCase() === wanted,
  );
}

/** Registry rows plus whatever `scanDisk` found that the registry omits. */
function mergeCatalog(rows, diskRows) {
  const knownDirs = new Set();
  const knownNames = new Set();
  for (const row of rows) {
    knownDirs.add(String(basename(dirOf(row.path)) || '').toLowerCase());
    knownNames.add(String(row.name || '').toLowerCase());
  }
  const extras = diskRows.filter((row) => {
    const dirKey = basename(dirOf(row.path)).toLowerCase();
    return !knownDirs.has(dirKey) && !knownNames.has(String(row.name || '').toLowerCase());
  });
  return { rows: rows.concat(extras), extras };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function messageOf(error) {
  if (!error) return 'unknown error';
  return String(error.message || error);
}

function sendEmpty(res, status) {
  res.statusCode = status;
  res.setHeader('cache-control', 'no-store');
  res.end();
}

function sendJson(res, status, payload) {
  let body;
  try {
    body = Buffer.from(JSON.stringify(payload), 'utf8');
  } catch (error) {
    body = Buffer.from(JSON.stringify({ ok: false, error: 'serialize', message: messageOf(error) }), 'utf8');
    status = 500;
  }
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}
