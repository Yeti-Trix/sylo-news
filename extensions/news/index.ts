import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

import { fetchNewsHeadlines, formatNewsMarkdown, NEWS_TOPICS } from './news-fetch.ts'

type ToolContentBlock = { type: 'text'; text: string }

function toolError(text: string): { content: ToolContentBlock[]; isError?: true } {
  return { content: [{ type: 'text', text }], isError: true }
}

const topicDescription =
  'News category. finance = FinancialJuice wire; general/world/nation/business/technology/entertainment/sports/science/health = Google News sections; ' +
  'travel = travel headlines; local = city/regional (requires location); search = keyword (requires query). Default general.'

async function executeNewsTool(
  params: {
    topic?: string
    hours?: number
    location?: string
    query?: string
    force_refresh?: boolean
  },
  legacyFinanceOnly = false,
) {
  const result = await fetchNewsHeadlines({
    topic: legacyFinanceOnly ? 'finance' : params.topic,
    hours: typeof params.hours === 'number' ? params.hours : 24,
    location: typeof params.location === 'string' ? params.location : undefined,
    query: typeof params.query === 'string' ? params.query : undefined,
    forceRefresh: params.force_refresh === true,
  })

  if (!result.ok) {
    return toolError(
      `${result.error}\n\n` +
        'One sylo_news call per user request — do not bash-loop retries. ' +
        'Enable **sylo-news** in Capability manager if this tool was missing.',
    )
  }

  const meta = {
    fromCache: result.fromCache,
    warning: result.warning,
  }

  return {
    content: [
      {
        type: 'text',
        text: formatNewsMarkdown(result.payload, meta),
      },
      {
        type: 'text',
        text: JSON.stringify(
          {
            ...result.payload,
            _meta: {
              from_cache: result.fromCache,
              cache_age_sec: result.cacheAgeSec ?? null,
              stale_because_rate_limit: result.staleBecauseRateLimit ?? false,
            },
          },
          null,
          2,
        ),
      },
    ],
  }
}

export default function syloNewsExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: 'sylo_news',
    label: 'News headlines',
    description:
      'Fetch recent news headlines by topic. finance = FinancialJuice RSS; other topics = Google News RSS (no API key). ' +
      'local needs location (read profile/user_profile.md first). Cached ~2 min. ' +
      'Do NOT sylo_web_fetch RSS URLs or Google News redirect links — sylo_web_search headlines for detail.',
    parameters: Type.Object({
      topic: Type.Optional(
        Type.String({
          description: `${topicDescription} Allowed: ${NEWS_TOPICS.join(', ')}.`,
        }),
      ),
      hours: Type.Optional(
        Type.Number({
          description: 'Headlines published within this many hours (default 24, max 168).',
          minimum: 1,
          maximum: 168,
        }),
      ),
      location: Type.Optional(
        Type.String({
          description:
            'City/region for topic=local (e.g. "Fort Wayne, IN"). Prefer profile/user_profile.md location — ask once if missing.',
        }),
      ),
      query: Type.Optional(
        Type.String({
          description: 'Search keywords for topic=search, or to narrow topic=travel.',
        }),
      ),
      force_refresh: Type.Optional(
        Type.Boolean({
          description: 'Bypass cache (default false). Avoid rapid force_refresh.',
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      return executeNewsTool(params)
    },
  })

  // Backward compat for think-tank-evidence and older prompts
  pi.registerTool({
    name: 'sylo_financial_news',
    label: 'Financial news headlines (legacy alias)',
    description: 'Legacy alias for sylo_news with topic=finance. Prefer sylo_news.',
    parameters: Type.Object({
      hours: Type.Optional(
        Type.Number({
          description: 'Include headlines published within this many hours (default 24, max 168).',
          minimum: 1,
          maximum: 168,
        }),
      ),
      force_refresh: Type.Optional(
        Type.Boolean({
          description: 'Bypass cache and fetch live feed (default false).',
        }),
      ),
    }),
    async execute(_toolCallId, params) {
      return executeNewsTool(params, true)
    },
  })
}
