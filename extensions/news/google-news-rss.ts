/** Google News RSS — no API key; personal feed-reader use per Google ToS. */

const GOOGLE_NEWS_LOCALE = 'hl=en-US&gl=US&ceid=US:en'

export const GOOGLE_NEWS_TOPICS = [
  'general',
  'world',
  'nation',
  'business',
  'technology',
  'entertainment',
  'sports',
  'science',
  'health',
] as const

export type GoogleNewsTopic = (typeof GOOGLE_NEWS_TOPICS)[number]

const TOPIC_SECTION: Record<GoogleNewsTopic, string> = {
  general: 'TOP',
  world: 'WORLD',
  nation: 'NATION',
  business: 'BUSINESS',
  technology: 'TECHNOLOGY',
  entertainment: 'ENTERTAINMENT',
  sports: 'SPORTS',
  science: 'SCIENCE',
  health: 'HEALTH',
}

export function buildGoogleNewsFeedUrl(options: {
  topic?: GoogleNewsTopic
  query?: string
  location?: string
  hours?: number
}): string {
  const hours = options.hours ?? 24
  const whenClause = hours <= 24 ? 'when:1d' : hours <= 72 ? 'when:3d' : 'when:7d'

  if (options.location?.trim()) {
    const q = encodeURIComponent(`${options.location.trim()} ${whenClause}`)
    return `https://news.google.com/rss/search?q=${q}&${GOOGLE_NEWS_LOCALE}`
  }

  if (options.query?.trim()) {
    const q = encodeURIComponent(`${options.query.trim()} ${whenClause}`)
    return `https://news.google.com/rss/search?q=${q}&${GOOGLE_NEWS_LOCALE}`
  }

  const topic = options.topic ?? 'general'
  if (topic === 'general') {
    return `https://news.google.com/rss?${GOOGLE_NEWS_LOCALE}`
  }

  const section = TOPIC_SECTION[topic]
  return `https://news.google.com/rss/headlines/section/topic/${section}?${GOOGLE_NEWS_LOCALE}`
}

export function isGoogleNewsTopic(value: string): value is GoogleNewsTopic {
  return (GOOGLE_NEWS_TOPICS as readonly string[]).includes(value)
}
