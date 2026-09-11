export const FINANCIALJUICE_FEED_URL = 'https://www.financialjuice.com/feed.ashx?xy=rss'
export const TITLE_PREFIX = 'FinancialJuice: '
/** FinancialJuice RSS returns about this many items (server-side cap). */
export const RSS_FEED_ITEM_CAP = 100
const RSS_PARSE_SAFETY_CAP = 120

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/** In-memory cache — avoids hammering FJ (429) when the agent retries. */
const CACHE_TTL_MS = 120_000
const DEFAULT_HOURS = 24
const MAX_HOURS = 168

export type NewsItem = {
  headline: string
  pubDate: string
  pubDateMs: number | null
  link: string
  rss_snippet: string | null
  guid: string
  /** Publisher name when parsed from feed (e.g. Google News font tag). */
  source: string | null
}

/** @deprecated Use NewsItem */
export type FinancialNewsItem = NewsItem

export type NewsPayload = {
  source: string
  channel_title: string
  channel_pubDate: string
  hours_window: number
  window_start: string
  window_end: string
  feed_item_total: number
  item_count: number
  feed_oldest_pubDate: string | null
  feed_newest_pubDate: string | null
  feed_history_hours: number | null
  coverage_note: string | null
  items: NewsItem[]
  note: string
  topic?: string
  source_label?: string
}

/** @deprecated Use NewsPayload */
export type FinancialNewsPayload = NewsPayload

type ParsedFeed = {
  source: string
  channel_title: string
  channel_pubDate: string
  items: NewsItem[]
}

type CacheEntry = {
  fetchedAt: number
  feed: ParsedFeed
}

let cache: CacheEntry | null = null

export type FetchHeadlinesResult =
  | {
      ok: true
      payload: FinancialNewsPayload
      fromCache: boolean
      cacheAgeSec?: number
      staleBecauseRateLimit?: boolean
      warning?: string
    }
  | { ok: false; error: string; retryAfterSec?: number }

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
}

function extractTagInner(block: string, tag: string): string {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i')
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = block.match(cdata) ?? block.match(plain)
  if (!m) return ''
  return decodeXmlEntities(m[1].replace(/\r\n/g, '\n').trim())
}

function stripTitlePrefix(title: string): string {
  const t = title.trim()
  return t.startsWith(TITLE_PREFIX) ? t.slice(TITLE_PREFIX.length).trim() : t
}

function cleanDescription(raw: string): string | null {
  if (!raw.trim()) return null
  const text = decodeXmlEntities(raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  return text || null
}

/** Google News often embeds publisher in `<font color="#6f6f6f">Publisher</font>`. */
function extractPublisherFromDescription(raw: string): string | null {
  const m = raw.match(/<font[^>]*>([^<]+)<\/font>/i)
  if (!m) return null
  const name = decodeXmlEntities(m[1].trim())
  return name || null
}

export function parsePubDateMs(pubDate: string): number | null {
  const trimmed = pubDate.trim()
  if (!trimmed) return null
  const ms = Date.parse(trimmed)
  return Number.isFinite(ms) ? ms : null
}

function parseRssItems(
  xml: string,
  options?: { stripTitlePrefix?: boolean; defaultSource?: string },
): NewsItem[] {
  const items: NewsItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/gi
  let match: RegExpExecArray | null
  while ((match = itemRe.exec(xml)) !== null && items.length < RSS_PARSE_SAFETY_CAP) {
    const block = match[1]
    let title = extractTagInner(block, 'title')
    if (options?.stripTitlePrefix) title = stripTitlePrefix(title)
    const pubDate = extractTagInner(block, 'pubDate')
    const description = extractTagInner(block, 'description')
    items.push({
      headline: title.trim(),
      pubDate,
      pubDateMs: parsePubDateMs(pubDate),
      link: extractTagInner(block, 'link'),
      rss_snippet: cleanDescription(description),
      guid: extractTagInner(block, 'guid'),
      source: extractPublisherFromDescription(description) ?? options?.defaultSource ?? null,
    })
  }
  return items
}

export function parseGenericRss(xml: string, sourceUrl: string): ParsedFeed {
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i)
  const channelBlock = channelMatch?.[1] ?? xml
  return {
    source: sourceUrl,
    channel_title: extractTagInner(channelBlock, 'title'),
    channel_pubDate: extractTagInner(channelBlock, 'pubDate'),
    items: parseRssItems(xml),
  }
}

export function parseFinancialJuiceRss(xml: string): ParsedFeed {
  const channelMatch = xml.match(/<channel>([\s\S]*?)<\/channel>/i)
  const channelBlock = channelMatch?.[1] ?? xml
  return {
    source: FINANCIALJUICE_FEED_URL,
    channel_title: extractTagInner(channelBlock, 'title'),
    channel_pubDate: extractTagInner(channelBlock, 'pubDate'),
    items: parseRssItems(xml, { stripTitlePrefix: true }),
  }
}

function clampHours(raw: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_HOURS
  return Math.min(MAX_HOURS, Math.max(1, Math.floor(raw)))
}

function datedItems(items: NewsItem[]): Array<{ item: NewsItem; ms: number }> {
  const out: Array<{ item: NewsItem; ms: number }> = []
  for (const item of items) {
    if (item.pubDateMs !== null) out.push({ item, ms: item.pubDateMs })
  }
  return out
}

export function buildPayloadFromFeed(
  feed: ParsedFeed,
  hours: number,
  nowMs = Date.now(),
): NewsPayload {
  const windowStartMs = nowMs - hours * 3_600_000
  const dated = datedItems(feed.items)
  const inWindow = dated
    .filter(({ ms }) => ms >= windowStartMs)
    .sort((a, b) => b.ms - a.ms)
    .map(({ item }) => item)

  let feedOldestMs: number | null = null
  let feedNewestMs: number | null = null
  for (const { ms } of dated) {
    if (feedOldestMs === null || ms < feedOldestMs) feedOldestMs = ms
    if (feedNewestMs === null || ms > feedNewestMs) feedNewestMs = ms
  }

  const feedHistoryHours =
    feedOldestMs !== null && feedNewestMs !== null ?
      Math.max(0, (feedNewestMs - feedOldestMs) / 3_600_000)
    : null

  let coverage_note: string | null = null
  if (feed.items.length >= RSS_FEED_ITEM_CAP - 2) {
    coverage_note =
      `RSS feed is capped at ~${RSS_FEED_ITEM_CAP} items. ` +
      'During active markets that may be only a few hours of headlines even when you request a longer window.'
  }
  if (feedHistoryHours !== null && feedHistoryHours + 0.05 < hours) {
    const span =
      feedHistoryHours < 1 ?
        `${Math.round(feedHistoryHours * 60)} minutes`
      : `${feedHistoryHours.toFixed(1)} hours`
    coverage_note =
      (coverage_note ? `${coverage_note} ` : '') +
      `Oldest headline in this fetch is ~${span} back; your ${hours}h window cannot be fully covered by the feed alone.`
  }

  return {
    source: feed.source,
    channel_title: feed.channel_title,
    channel_pubDate: feed.channel_pubDate,
    hours_window: hours,
    window_start: new Date(windowStartMs).toISOString(),
    window_end: new Date(nowMs).toISOString(),
    feed_item_total: feed.items.length,
    item_count: inWindow.length,
    feed_oldest_pubDate: feedOldestMs !== null ? new Date(feedOldestMs).toUTCString() : null,
    feed_newest_pubDate: feedNewestMs !== null ? new Date(feedNewestMs).toUTCString() : null,
    feed_history_hours:
      feedHistoryHours !== null ? Math.round(feedHistoryHours * 10) / 10 : null,
    coverage_note,
    items: inWindow,
    note: 'For full story text, sylo_web_search the headline (not sylo_web_fetch on Google News redirect URLs).',
  }
}

async function fetchFeedXml(): Promise<{ ok: true; xml: string } | { ok: false; status: number; error: string }> {
  const ac = new AbortController()
  const timeout = setTimeout(() => ac.abort(), 25_000)
  try {
    const res = await fetch(FINANCIALJUICE_FEED_URL, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      signal: ac.signal,
    })
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `HTTP ${res.status} fetching FinancialJuice RSS`,
      }
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

export function formatHeadlinesMarkdown(
  payload: NewsPayload,
  meta?: { fromCache?: boolean; warning?: string },
): string {
  const lines: string[] = []
  if (meta?.warning) lines.push(`**Note:** ${meta.warning}`)
  if (meta?.fromCache) lines.push('_(Cached feed — FinancialJuice rate-limits rapid refetches.)_')
  if (payload.coverage_note) lines.push(`**Coverage:** ${payload.coverage_note}`)
  lines.push(
    `**FinancialJuice** — ${payload.item_count} headline(s) in last **${payload.hours_window}h** ` +
      `(feed holds ${payload.feed_item_total} items · channel updated ${payload.channel_pubDate || 'unknown'})`,
  )
  lines.push('')
  for (const [i, item] of payload.items.entries()) {
    const snip =
      item.rss_snippet ?
        `\n   ${item.rss_snippet.slice(0, 280)}${item.rss_snippet.length > 280 ? '…' : ''}`
      : ''
    lines.push(`${i + 1}. **${item.pubDate || '?'}** — ${item.headline}${snip}`)
  }
  lines.push('')
  lines.push(payload.note)
  return lines.join('\n')
}

export async function fetchFinancialNewsHeadlines(options: {
  hours?: number
  forceRefresh?: boolean
}): Promise<FetchHeadlinesResult> {
  const hours = clampHours(options.hours ?? DEFAULT_HOURS)
  const now = Date.now()
  const forceRefresh = options.forceRefresh === true

  if (!forceRefresh && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return {
      ok: true,
      payload: buildPayloadFromFeed(cache.feed, hours, now),
      fromCache: true,
      cacheAgeSec: Math.round((now - cache.fetchedAt) / 1000),
    }
  }

  const fetched = await fetchFeedXml()
  if (!fetched.ok) {
    if (fetched.status === 429 && cache) {
      return {
        ok: true,
        payload: buildPayloadFromFeed(cache.feed, hours, now),
        fromCache: true,
        staleBecauseRateLimit: true,
        cacheAgeSec: Math.round((now - cache.fetchedAt) / 1000),
        warning:
          'FinancialJuice returned HTTP 429 (rate limit). Showing cached headlines — do not retry in a loop; wait a few minutes.',
      }
    }
    const retryHint =
      fetched.status === 429 ?
        ' FinancialJuice rate-limited this IP — wait 2–5 minutes before force_refresh.'
      : ''
    return {
      ok: false,
      error: `${fetched.error}.${retryHint}`,
      retryAfterSec: fetched.status === 429 ? 120 : undefined,
    }
  }

  const feed = parseFinancialJuiceRss(fetched.xml)
  cache = { fetchedAt: now, feed }
  return { ok: true, payload: buildPayloadFromFeed(feed, hours, now), fromCache: false }
}

/** Test helper — reset cache between tests. */
export function resetFinancialNewsCacheForTests(): void {
  cache = null
}
