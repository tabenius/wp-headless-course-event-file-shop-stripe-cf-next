#!/usr/bin/env python3
"""
Fetch all linked CSS files from a webpage, concatenate them, and print
typography/color information for headers, paragraphs, and links.

Usage:
  python scripts/css_style_audit.py https://example.com
  python scripts/css_style_audit.py https://example.com --save-css all.css
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Dict, List, Tuple
from urllib.parse import urljoin
from urllib.request import Request, urlopen


USER_AGENT = "Mozilla/5.0 (compatible; css-style-audit/1.0)"
TIMEOUT_SECONDS = 20

TARGETS = ["headers", "h1", "h2", "h3", "h4", "h5", "h6", "p", "a"]
INTERESTING_PROPS = {
    "font",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "letter-spacing",
    "text-transform",
    "color",
    "background",
    "background-color",
    "text-decoration",
}


@dataclass
class Rule:
    selector: str
    declarations: Dict[str, str]


class StylesheetLinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stylesheets: List[str] = []

    def handle_starttag(self, tag: str, attrs: List[Tuple[str, str | None]]) -> None:
        if tag.lower() != "link":
            return
        attr_map = {k.lower(): (v or "") for k, v in attrs}
        rel = attr_map.get("rel", "").lower()
        href = attr_map.get("href", "").strip()
        if "stylesheet" in rel and href:
            self.stylesheets.append(href)


def fetch_text(url: str) -> str:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
        charset = resp.headers.get_content_charset() or "utf-8"
        return resp.read().decode(charset, errors="replace")


def extract_css_links(page_url: str, html: str) -> List[str]:
    parser = StylesheetLinkParser()
    parser.feed(html)
    resolved = [urljoin(page_url, href) for href in parser.stylesheets]

    # Keep order, remove duplicates.
    seen = set()
    unique: List[str] = []
    for link in resolved:
        if link in seen:
            continue
        seen.add(link)
        unique.append(link)
    return unique


def strip_css_comments(css: str) -> str:
    return re.sub(r"/\*.*?\*/", "", css, flags=re.DOTALL)


def parse_css_rules(css: str) -> List[Rule]:
    cleaned = strip_css_comments(css)
    rules: List[Rule] = []
    for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", cleaned):
        selector_chunk = match.group(1).strip()
        body = match.group(2).strip()
        if not selector_chunk or not body:
            continue
        if selector_chunk.startswith("@"):
            continue

        declarations: Dict[str, str] = {}
        for part in body.split(";"):
            if ":" not in part:
                continue
            prop, value = part.split(":", 1)
            prop = prop.strip().lower()
            value = value.strip()
            if prop and value:
                declarations[prop] = value

        if declarations:
            rules.append(Rule(selector=selector_chunk, declarations=declarations))
    return rules


def selector_matches_target(selector: str, target: str) -> bool:
    s = selector.lower()
    if target == "headers":
        return re.search(r"(^|[^\w-])h[1-6](?=[:\s\.#\[\]>+~]|$)", s) is not None
    if target == "a":
        return re.search(r"(^|[^\w-])a(?=[:\s\.#\[\]>+~]|$)", s) is not None
    if target == "p":
        return re.search(r"(^|[^\w-])p(?=[:\s\.#\[\]>+~]|$)", s) is not None
    return re.search(rf"(^|[^\w-]){re.escape(target)}(?=[:\s\.#\[\]>+~]|$)", s) is not None


def extract_css_variables(rules: List[Rule]) -> Dict[str, str]:
    vars_map: Dict[str, str] = {}
    for rule in rules:
        selectors = [s.strip() for s in rule.selector.split(",")]
        if not any(sel in (":root", "html", "body") for sel in selectors):
            continue
        for prop, value in rule.declarations.items():
            if prop.startswith("--"):
                vars_map[prop] = value
    return vars_map


def resolve_var(value: str, vars_map: Dict[str, str], depth: int = 0) -> str:
    if depth > 5:
        return value
    m = re.fullmatch(r"var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)", value.strip())
    if not m:
        return value
    var_name = m.group(1)
    fallback = (m.group(2) or "").strip()
    raw = vars_map.get(var_name, fallback or value)
    return resolve_var(raw, vars_map, depth + 1)


def summarize_target(rules: List[Rule], target: str, vars_map: Dict[str, str]) -> Dict[str, str]:
    resolved: Dict[str, str] = {}
    for rule in rules:
        selectors = [s.strip() for s in rule.selector.split(",")]
        if not any(selector_matches_target(sel, target) for sel in selectors):
            continue
        for prop, value in rule.declarations.items():
            if prop in INTERESTING_PROPS:
                resolved[prop] = resolve_var(value, vars_map)
    return resolved


def print_summary(target: str, props: Dict[str, str]) -> None:
    print(f"\n[{target}]")
    if not props:
        print("  (no matching typography/color declarations found)")
        return
    for key in sorted(props.keys()):
        print(f"  {key}: {props[key]}")


def run(url: str, save_css_path: str | None) -> int:
    try:
        html = fetch_text(url)
    except Exception as exc:
        print(f"Failed to fetch page: {exc}", file=sys.stderr)
        return 1

    css_links = extract_css_links(url, html)
    if not css_links:
        print("No linked stylesheet files found.")
        return 0

    css_chunks: List[str] = []
    print("Stylesheets:")
    for link in css_links:
        print(f"  - {link}")
        try:
            css_chunks.append(fetch_text(link))
        except Exception as exc:
            print(f"    ! skipped (fetch error): {exc}")

    all_css = "\n\n".join(css_chunks)
    print(f"\nFetched {len(css_chunks)}/{len(css_links)} CSS files.")
    print(f"Concatenated CSS size: {len(all_css)} bytes")

    if save_css_path:
        with open(save_css_path, "w", encoding="utf-8") as f:
            f.write(all_css)
        print(f"Saved concatenated CSS to: {save_css_path}")

    rules = parse_css_rules(all_css)
    vars_map = extract_css_variables(rules)

    print("\nTypography + Color Summary")
    for target in TARGETS:
        props = summarize_target(rules, target, vars_map)
        print_summary(target, props)

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape linked CSS from a URL and summarize fonts/colors."
    )
    parser.add_argument("url", help="Page URL to inspect")
    parser.add_argument(
        "--save-css",
        dest="save_css",
        default=None,
        help="Optional path to save concatenated CSS",
    )
    args = parser.parse_args()
    raise SystemExit(run(args.url, args.save_css))


if __name__ == "__main__":
    main()
