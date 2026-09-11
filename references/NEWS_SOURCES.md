# News source research (Sylo sylo-news)

Last reviewed: 2026-07-02

Sylo **sylo-news** ships **RSS-first** (Google News + FinancialJuice) so the operator needs **no API keys**. This note compares upgrade paths if you want bias metadata, richer local coverage, or production-scale aggregation.

## Ground News

**Verdict: no official public API** (as of 2026-07).

Ground News is a consumer app for comparing coverage across the political spectrum. There is **no** documented developer API. Community scrapers and third-party scraping services exist; they are **unofficial**, ToS-sensitive, and brittle.

**If you want Ground-like bias comparison in Sylo:** likely needs a manual workflow (open Ground in browser) or a future partnership — not something to wire as a default tool today.

## Google News RSS (current default for general/local)

| Pros | Cons |
|------|------|
| Free, no key | Google ToS: personal feed-reader use |
| Categories + search + local by city string | No bias metadata |
| Same RSS parser as FinancialJuice | Redirect URLs, not full article text |

Local: `topic=local` + `location="City, ST"` → search RSS with time window.

## GNews API ([gnews.io](https://gnews.io/))

| Pros | Cons |
|------|------|
| `top-headlines` with category + country | Free tier ~100 req/day, dev-oriented |
| Search with date filters | Commercial use restricted on free tier |
| Clean JSON | Another vendor account |

Categories: general, world, nation, business, technology, entertainment, sports, science, health (similar to Google).

## NewsAPI.org ([newsapi.org](https://newsapi.org/))

| Pros | Cons |
|------|------|
| Huge source index | Free developer plan **not** for production |
| Top headlines by category/country/source | Paid for real deployment |

Good for prototyping keyword + category filters.

## NewsData.io ([newsdata.io](https://newsdata.io/))

| Pros | Cons |
|------|------|
| Generous free tier (200 credits/day, commercial OK) | **Region/city local filter = corporate tier only** |
| 97k+ sources, many languages | 12-hour delay on free tier |
| Category + country on free tier | |

**Local news on free tier:** use `country=us` + keyword query with city name, not the `region=` parameter.

## NewsCatcher Local News API ([newscatcherapi.com](https://www.newscatcherapi.com/docs/local-news-api/get-started/introduction))

| Pros | Cons |
|------|------|
| Purpose-built **local** (GeoNames, city/county) | Enterprise pricing |
| Theme filters (e.g. Tech) | Overkill for solo Sylo unless budgeted |

Best-in-class for **hyper-local** if you pay for it.

## The Guardian Open Platform ([open-platform.theguardian.com](https://open-platform.theguardian.com/))

| Pros | Cons |
|------|------|
| Free, production-friendly | Guardian content only |
| Section tags (tech, world, …) | Not local US market |

Excellent quality; narrow scope.

## Recommendation for Sylo (solo operator)

1. **Now:** Google News RSS + profile-backed `local` + FinancialJuice `finance` (implemented).
2. **If local quality is weak:** try NewsData.io free tier with `q="Fort Wayne"` style queries before paying for NewsCatcher.
3. **If you want bias/spectrum view:** Ground News has no API — don't fake it with scrapers in the host product unless you accept ToS/legal risk.
4. **If you add a paid API later:** store key in operator config (pattern: sylo-web-access `config.json`), add optional provider switch on `sylo_news`, keep RSS as zero-key fallback.

## Profile location

Local news quality depends on **`profile/user_profile.md`** `location`. The **news** skill requires agents to read/update that file so the operator is not asked every session.

Path in repo: `profile/user_profile.md`  
Full path example: `C:\Users\YetiTrix\Documents\GitHub\pi-sylo\profile\user_profile.md`
