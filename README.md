# sylo-news

**General and financial news headlines** for Sylo/Pi — as an individual, self-contained
pi package (one repo = one npm package).

- **Google News RSS** topics (tech, sports, local, search, …) + **FinancialJuice** finance wire
- **No API keys**, no credentials, browser User-Agent, ~2 min cache
- Works on **vanilla Pi** and inside **Sylo** (where it adds a small Sylo-only host plugin)

## Install

```bash
pi install npm:sylo-news
```

In Sylo: **Capability manager → Pi.dev package catalog** (or **Install by exact spec** →
`npm:sylo-news`), then **Restart broker**.

No Python deps for the extension. (The finance-wire fallback script
`skills/news/scripts/fetch_financialjuice_rss.py` is stdlib-only.)

## Tool

**`sylo_news`** — RSS headlines with a browser User-Agent, cached ~2 minutes.

| Param | Default | Notes |
|-------|---------|-------|
| `topic` | `general` | See skill for full list |
| `hours` | 24 (max 168) | Time window by pubDate |
| `location` | — | Required for `topic=local` |
| `query` | — | Required for `topic=search`; optional for `travel` |
| `force_refresh` | false | Bypass cache |

**Sources (no API key today):**

- **`finance`** — FinancialJuice wire (~100 item cap, rate-limits rapid refetch)
- **Other topics** — Google News RSS sections + local/search queries

See `references/NEWS_SOURCES.md` for paid API options (Ground News, GNews, NewsData.io, etc.).

**Legacy:** `sylo_financial_news` still registers as an alias for `topic=finance`.

## Sylo-only extras (inert on vanilla Pi)

This package carries a `pi.sylo` manifest block. Vanilla Pi ignores it completely.
Inside Sylo, the host-plugin loader loads `host/index.js`, which provides:

- **`news.ping`** RPC op — reports `{ ok, plugin: 'sylo-news', version }` (used to verify
  npm-installed host plugins load through Sylo's generic loader).

No personal data, no secrets, and nothing here publishes any operator data.

## Why not sylo_web_fetch?

`sylo_web_fetch` rejects RSS (`text/xml`). Google News item links are redirects — use
**`sylo_web_search`** on the headline for detail.

## Local news + profile

The **news** skill instructs the agent to read **`profile/user_profile.md`** for `location`
before local news. Ask once if missing, then save to the profile.

## Fallback script

`skills/news/scripts/fetch_financialjuice_rss.py` (stdlib) if the extension is disabled and
operator wants finance wire only.

## Development

```bash
npm install
npm test        # RSS parsing tests (esbuild-bundled, node --test)
```

Layout: `extensions/news/` (pi extension: the `sylo_news` tool), `skills/news/` (skill +
fallback script), `host/` (Sylo-only host plugin), `references/` (source research).