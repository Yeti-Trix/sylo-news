import assert from 'node:assert/strict'
import test from 'node:test'

import { buildGoogleNewsFeedUrl } from './google-news-rss.ts'
import {
  buildPayloadFromFeed,
  parseFinancialJuiceRss,
  parseGenericRss,
  resetFinancialNewsCacheForTests,
  TITLE_PREFIX,
} from './rss-fetch.ts'
import { resetNewsCacheForTests } from './news-fetch.ts'

const NOW = Date.parse('Thu, 25 Jun 2026 14:00:00 GMT')

const SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>FinancialJuice | Test</title>
<pubDate>Thu, 25 Jun 2026 13:21:50 GMT</pubDate>
<item>
<title>${TITLE_PREFIX}Fresh headline</title>
<link>https://www.financialjuice.com/News/1/fresh.aspx</link>
<description />
<pubDate>Thu, 25 Jun 2026 13:00:00 GMT</pubDate>
<guid isPermaLink="false">1</guid>
</item>
<item>
<title>${TITLE_PREFIX}Old headline</title>
<link>https://www.financialjuice.com/News/2/old.aspx</link>
<description />
<pubDate>Wed, 24 Jun 2026 10:00:00 GMT</pubDate>
<guid isPermaLink="false">2</guid>
</item>
<item>
<title>${TITLE_PREFIX}GS Oil Analyst - FJElite</title>
<link>https://www.financialjuice.com/News/3/GS-Oil.aspx</link>
<description>&lt;div&gt;Limited relief to margins.&lt;/div&gt;</description>
<pubDate>Thu, 25 Jun 2026 12:00:00 GMT</pubDate>
<guid isPermaLink="false">3</guid>
</item>
</channel></rss>`

const GOOGLE_SAMPLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
<title>Technology - Google News</title>
<pubDate>Thu, 02 Jul 2026 21:22:19 GMT</pubDate>
<item>
<title>Test tech headline</title>
<link>https://news.google.com/rss/articles/abc</link>
<description>&lt;font color="#6f6f6f"&gt;TechCrunch&lt;/font&gt;</description>
<pubDate>Thu, 02 Jul 2026 20:00:00 GMT</pubDate>
<guid>g1</guid>
</item>
</channel></rss>`

test('parseFinancialJuiceRss strips prefix and parses all items', () => {
  resetFinancialNewsCacheForTests()
  resetNewsCacheForTests()
  const feed = parseFinancialJuiceRss(SAMPLE)
  assert.equal(feed.items.length, 3)
  assert.equal(feed.items[0].headline, 'Fresh headline')
  assert.equal(feed.items[2].rss_snippet, 'Limited relief to margins.')
})

test('parseGenericRss extracts publisher from description', () => {
  const feed = parseGenericRss(GOOGLE_SAMPLE, 'https://news.google.com/rss/test')
  assert.equal(feed.items.length, 1)
  assert.equal(feed.items[0].headline, 'Test tech headline')
  assert.equal(feed.items[0].source, 'TechCrunch')
})

test('buildPayloadFromFeed filters by hours window', () => {
  const feed = parseFinancialJuiceRss(SAMPLE)
  const payload24 = buildPayloadFromFeed(feed, 24, NOW)
  assert.equal(payload24.item_count, 2)
  assert.equal(payload24.items[0].headline, 'Fresh headline')
  assert.equal(payload24.items.some((i) => i.headline === 'Old headline'), false)

  const payload48 = buildPayloadFromFeed(feed, 48, NOW)
  assert.equal(payload48.item_count, 3)
})

test('buildGoogleNewsFeedUrl builds topic and local URLs', () => {
  assert.match(
    buildGoogleNewsFeedUrl({ topic: 'technology' }),
    /headlines\/section\/topic\/TECHNOLOGY/,
  )
  assert.match(buildGoogleNewsFeedUrl({ location: 'Fort Wayne, IN', hours: 24 }), /search\?q=/)
  assert.match(buildGoogleNewsFeedUrl({ location: 'Fort Wayne, IN', hours: 24 }), /Fort%20Wayne/)
})

test('buildPayloadFromFeed sets coverage note when window exceeds feed span', () => {
  const feed = parseFinancialJuiceRss(SAMPLE)
  const payload = buildPayloadFromFeed(feed, 168, NOW)
  assert.ok(payload.coverage_note)
  assert.equal(payload.hours_window, 168)
})
