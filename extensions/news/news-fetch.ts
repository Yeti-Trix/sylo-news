import {
  buildGoogleNewsFeedUrl,
  isGoogleNewsTopic,
  type GoogleNewsTopic,
} from './google-news-rss.ts'
import {
  buildPayloadFromFeed,
  fetchFinancialNewsHeadlines,
  formatHeadlinesMarkdown,
  parseGenericRss,
  type FetchHeadlinesResult,
  type NewsPayload,
} from './rss-fetch.ts'

export const NEWS_TOPICS = [
  'finance',
  'general',
  'world',
  'nation',
  'business',
  'technology',
  'entertainment',
  'sports',
  'science',
  'health',
  'travel',
  'local',
  'search',
] as const

export type NewsTopic = (typeof NEWS_TOPICS)[number]

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const CACHE_TTL_MS = 120_000
const DEFAULT_HOURS = 24
const MAX_HOURS = 168

type CacheEntry = {
  fetchedAt: number
  feedUrl: string
  feed: ReturnType<typeof parseGenericRss>
}

const cacheByUrl = new Map<string, CacheEntry>()

function clampHours(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_HOURS
  return Math.min(MAX_HOURS, Math.max(1, Math.floor(raw)))
}

function normalizeTopic(raw: string | undefined): NewsTopic {
  const t = (raw ?? 'general').trim().toLowerCase()
  if ((NEWS_TOPICS as readonly string[]).includes(t)) return t as NewsTopic
  return 'general'
}

async function fetchFeedXml(
  url: string,
): Promise<{ ok: true; xml: string } | { ok: false; status: number; error: string }> {
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 25_000)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      signal: ac.signal,
    })
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status} fetching RSS` }
    }
    const xml = await res.text()
    if (!xml.includes('<rss') && !xml.includes('<item>')) {
      return { ok: false, status: res.status, error: 'Response is not RSS XML' }
    }
    return { ok: true, xml }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 0, error: message }
  } finally {
    clearTimeout(timeout)
  }
}

function buildGooglePayload(
  feed: ReturnType<typeof parseGenericRss>,
  hours: number,
  meta: { topic: string; sourceLabel: string; feedUrl: string },
  nowMs = Date.now(),
): NewsPayload {
  const payload = buildPayloadFromFeed(
    {
      source: meta.feedUrl,
      channel_title: feed.channel_title,
      channel_pubDate: feed.channel_pubDate,
      items: feed.items,
    },
    hours,
    nowMs,
  )
  return {
    ...payload,
    topic: meta.topic,
    source_label: meta.sourceLabel,
  }
}

async function fetchGoogleNewsHeadlines(options: {
  topic: NewsTopic
  hours: number
  location?: string
  query?: string
  forceRefresh?: boolean
}): Promise<FetchHeadlinesResult> {
  const hours = clampHours(options.hours)
  const now = Date.now()
  const forceRefresh = options.forceRefresh === true

  let feedUrl: string
  let sourceLabel: string
  let topicLabel = options.topic

  if (options.topic === 'local') {
    const loc = options.location?.trim()
    if (!loc) {
      return {
        ok: false,
        error:
          'topic=local requires location (city, state). Read profile/user_profile.md first; ask the operator once if missing, save to profile, then retry.',
      }
    }
    feedUrl = buildGoogleNewsFeedUrl({ location: loc, hours })
    sourceLabel = `Google News (local: ${loc})`
  } else if (options.topic === 'travel') {
    const q = options.query?.trim() ? `${options.query.trim()} travel` : 'travel'
    feedUrl = buildGoogleNewsFeedUrl({ query: q, hours })
    sourceLabel = 'Google News (travel)'
    topicLabel = 'travel'
  } else if (options.topic === 'search') {
    const q = options.query?.trim()
    if (!q) {
      return { ok: false, error: 'topic=search requires query.' }
    }
    feedUrl = buildGoogleNewsFeedUrl({ query: q, hours })
    sourceLabel = `Google News (search: ${q})`
  } else if (isGoogleNewsTopic(options.topic)) {
    feedUrl = buildGoogleNewsFeedUrl({ topic: options.topic as GoogleNewsTopic, hours })
    sourceLabel = `Google News (${options.topic})`
  } else {
    return { ok: false, error: `Unsupported topic: ${options.topic}` }
  }

  const cached = cacheByUrl.get(feedUrl)
  if (!forceRefresh && cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return {
      ok: true,
      payload: buildGooglePayload(cached.feed, hours, {
        topic: topicLabel,
        sourceLabel,
        feedUrl,
      }),
      fromCache: true,
      cacheAgeSec: Math.round((now - cached.fetchedAt) / 1000),
    }
  }

  const fetched = await fetchFeedXml(feedUrl)
  if (!fetched.ok) {
    if (cached) {
      return {
        ok: true,
        payload: buildGooglePayload(cached.feed, hours, {
          topic: topicLabel,
          sourceLabel,
          feedUrl,
        }),
        fromCache: true,
        staleBecauseRateLimit: fetched.status === 429,
        cacheAgeSec: Math.round((now - cached.fetchedAt) / 1000),
        warning:
          fetched.status === 429 ?
            'Google News returned HTTP 429. Showing cached headlines — do not retry in a loop.'
          : `Fetch failed (${fetched.error}). Showing cached headlines.`,
      }
    }
    return { ok: false, error: `${fetched.error} (${feedUrl})` }
  }

  const feed = parseGenericRss(fetched.xml, feedUrl)
  cacheByUrl.set(feedUrl, { fetchedAt: now, feedUrl, feed })
  return {
    ok: true,
    payload: buildGooglePayload(feed, hours, { topic: topicLabel, sourceLabel, feedUrl }),
    fromCache: false,
  }
}

export async function fetchNewsHeadlines(options: {
  topic?: string
  hours?: number
  location?: string
  query?: string
  forceRefresh?: boolean
}): Promise<FetchHeadlinesResult> {
  const topic = normalizeTopic(options.topic)
  const hours = clampHours(options.hours ?? DEFAULT_HOURS)

  if (topic === 'finance') {
    const result = await fetchFinancialNewsHeadlines({
      hours,
      forceRefresh: options.forceRefresh,
    })
    if (!result.ok) return result
    return {
      ...result,
      payload: {
        ...result.payload,
        topic: 'finance',
        source_label: 'FinancialJuice',
        note: 'Item links are headline stubs only — web-search headlines for detail (not sylo_web_fetch on item URLs).',
      },
    }
  }

  return fetchGoogleNewsHeadlines({
    topic,
    hours,
    location: options.location,
    query: options.query,
    forceRefresh: options.forceRefresh,
  })
}

export function formatNewsMarkdown(
  payload: NewsPayload,
  meta?: { fromCache?: boolean; warning?: string },
): string {
  const label = payload.source_label ?? payload.channel_title ?? 'News'
  const lines: string[] = []
  if (meta?.warning) lines.push(`**Note:** ${meta.warning}`)
  if (meta?.fromCache) lines.push('_(Cached feed — avoid rapid refetches.)_')
  if (payload.coverage_note) lines.push(`**Coverage:** ${payload.coverage_note}`)
  lines.push(
    `**${label}**${payload.topic ? ` · ${payload.topic}` : ''} — ${payload.item_count} headline(s) in last **${payload.hours_window}h** ` +
      `(feed holds ${payload.feed_item_total} items · channel updated ${payload.channel_pubDate || 'unknown'})`,
  )
  lines.push('')
  for (const [i, item] of payload.items.entries()) {
    const source = item.source ? ` _(${item.source})_` : ''
    const snip =
      item.rss_snippet ?
        `\n   ${item.rss_snippet.slice(0, 280)}${item.rss_snippet.length > 280 ? '…' : ''}`
      : ''
    lines.push(`${i + 1}. **${item.pubDate || '?'}** — ${item.headline}${source}${snip}`)
  }
  lines.push('')
  lines.push(payload.note)
  return lines.join('\n')
}

/** Test helper — reset cache between tests. */
export function resetNewsCacheForTests(): void {
  cacheByUrl.clear()
}
