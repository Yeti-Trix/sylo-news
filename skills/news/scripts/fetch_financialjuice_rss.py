#!/usr/bin/env python3
"""Fetch FinancialJuice RSS and emit JSON for the agent."""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape

FEED_URL = "https://www.financialjuice.com/feed.ashx?xy=rss"
TITLE_PREFIX = "FinancialJuice: "
RSS_FEED_ITEM_CAP = 100
DEFAULT_HOURS = 24
MAX_HOURS = 168
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def strip_title_prefix(title: str) -> str:
    t = title.strip()
    if t.startswith(TITLE_PREFIX):
        return t[len(TITLE_PREFIX) :].strip()
    return t


def clean_description(raw: str | None) -> str | None:
    if not raw or not raw.strip():
        return None
    text = re.sub(r"<[^>]+>", " ", raw)
    text = unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def parse_pub_date(pub: str) -> datetime | None:
    try:
        dt = parsedate_to_datetime(pub.strip())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (TypeError, ValueError, IndexError):
        return None


def parse_rss_xml(data: bytes) -> tuple[dict, list[dict]]:
    root = ET.fromstring(data)
    channel = root.find("channel")
    if channel is None:
        raise ValueError("RSS channel element missing")

    items_out: list[dict] = []
    for item in channel.findall("item"):
        title = item.findtext("title") or ""
        pub = (item.findtext("pubDate") or "").strip()
        dt = parse_pub_date(pub)
        items_out.append(
            {
                "headline": strip_title_prefix(title),
                "pubDate": pub,
                "pubDateMs": int(dt.timestamp() * 1000) if dt else None,
                "link": (item.findtext("link") or "").strip(),
                "rss_snippet": clean_description(item.findtext("description")),
                "guid": (item.findtext("guid") or "").strip(),
            }
        )

    meta = {
        "source": FEED_URL,
        "channel_title": (channel.findtext("title") or "").strip(),
        "channel_pubDate": (channel.findtext("pubDate") or "").strip(),
    }
    return meta, items_out


def build_payload(meta: dict, all_items: list[dict], hours: int, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    cutoff_ms = int(cutoff.timestamp() * 1000)
    now_ms = int(now.timestamp() * 1000)

    dated = [(it, it["pubDateMs"]) for it in all_items if it.get("pubDateMs") is not None]
    in_window = [it for it, ms in dated if ms >= cutoff_ms]
    in_window.sort(key=lambda x: x.get("pubDateMs") or 0, reverse=True)

    oldest_ms = min((ms for _, ms in dated), default=None)
    newest_ms = max((ms for _, ms in dated), default=None)
    feed_history_hours = None
    if oldest_ms is not None and newest_ms is not None:
        feed_history_hours = round((newest_ms - oldest_ms) / 3_600_000, 1)

    coverage_note = None
    if len(all_items) >= RSS_FEED_ITEM_CAP - 2:
        coverage_note = (
            f"RSS feed is capped at ~{RSS_FEED_ITEM_CAP} items. "
            "During active markets that may be only a few hours of headlines."
        )
    if feed_history_hours is not None and feed_history_hours + 0.05 < hours:
        coverage_note = (
            (coverage_note + " " if coverage_note else "")
            + f"Oldest headline in this fetch is ~{feed_history_hours}h back; "
            f"your {hours}h window cannot be fully covered by the feed alone."
        )

    return {
        **meta,
        "hours_window": hours,
        "window_start": cutoff.isoformat(),
        "window_end": now.isoformat(),
        "feed_item_total": len(all_items),
        "item_count": len(in_window),
        "feed_oldest_pubDate": (
            datetime.fromtimestamp(oldest_ms / 1000, tz=timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
            if oldest_ms is not None
            else None
        ),
        "feed_newest_pubDate": (
            datetime.fromtimestamp(newest_ms / 1000, tz=timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")
            if newest_ms is not None
            else None
        ),
        "feed_history_hours": feed_history_hours,
        "coverage_note": coverage_note,
        "items": in_window,
        "note": "Item links are headline stubs only - web-search headlines for detail.",
    }


def fetch_feed(hours: int) -> dict:
    req = urllib.request.Request(FEED_URL, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            data = resp.read()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code} fetching feed") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error fetching feed: {exc.reason}") from exc
    meta, items = parse_rss_xml(data)
    return build_payload(meta, items, hours)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--hours",
        type=int,
        default=DEFAULT_HOURS,
        help=f"Include headlines from the last N hours (default {DEFAULT_HOURS}, max {MAX_HOURS})",
    )
    parser.add_argument(
        "--xml-file",
        type=str,
        default="",
        help="Parse RSS XML from a local file instead of fetching",
    )
    args = parser.parse_args()
    hours = max(1, min(args.hours, MAX_HOURS))

    try:
        if args.xml_file:
            with open(args.xml_file, "rb") as fh:
                meta, items = parse_rss_xml(fh.read())
            payload = build_payload(meta, items, hours)
        else:
            payload = fetch_feed(hours)
    except (OSError, ValueError, ET.ParseError, RuntimeError) as exc:
        print(json.dumps({"error": str(exc), "source": FEED_URL}), file=sys.stderr)
        return 1

    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
