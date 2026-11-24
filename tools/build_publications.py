#!/usr/bin/env python3
"""Build one static page per publication from publications/data.json.

Usage: python3 tools/build_publications.py
Writes publications/<slug>/index.html for every entry. Pages are committed,
so GitHub Pages serves plain files; rerun this after editing the data.
"""
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBS = ROOT / "publications"
SITE = "https://philipsgithub.github.io"
ME = "P. Keller"
ROWS = [
    ("domain", "Domain"),
    ("application", "Application"),
    ("challenge", "Challenge"),
    ("solution", "Approach"),
    ("benefit", "Contribution"),
]

esc = html.escape


def authors(text):
    return esc(text).replace(esc(ME), f"<b>{esc(ME)}</b>")


def strip_tags(text):
    out, inside = [], False
    for ch in text:
        if ch == "<":
            inside = True
        elif ch == ">":
            inside = False
        elif not inside:
            out.append(ch)
    return "".join(out)


def link(item):
    if "page" in item:
        return f'<li><a href="../{esc(item["page"])}/">{esc(item["label"])}</a></li>'
    return f'<li><a href="{esc(item["href"])}" rel="noopener">{esc(item["label"])}</a></li>'


def site_footer():
    """Reuse the main page's footer line so both stay identical."""
    page = (ROOT / "index.html").read_text()
    start = page.index('<div class="footer-meta">')
    end = page.index("</footer>", start)
    return page[start:end]


def pager(pubs, i):
    cells = []
    if i > 0:
        p = pubs[i - 1]
        cells.append(f'<a class="prev" href="../{p["slug"]}/"><span>Newer</span>{esc(p["title"])}</a>')
    else:
        cells.append("<div></div>")
    if i < len(pubs) - 1:
        p = pubs[i + 1]
        cells.append(f'<a class="next" href="../{p["slug"]}/"><span>Older</span>{esc(p["title"])}</a>')
    return f'<nav class="pub-pager" aria-label="More publications">{"".join(cells)}</nav>'


def page(pubs, i):
    pub = pubs[i]
    g = pub["glance"]
    desc = strip_tags(g["challenge"] + " " + g["solution"])
    url = f'{SITE}/publications/{pub["slug"]}/'
    rows = "".join(
        f'<div class="glance-row{" is-benefit" if key == "benefit" else ""}"><dt>{label}</dt><dd>{g[key]}</dd></div>'
        for key, label in ROWS
    )
    og_image = f"{SITE}/assets/robotics-photo.jpg"
    en = f'<p class="pub-en">{esc(pub["titleEn"])}</p>' if pub.get("titleEn") else ""
    lang = ' lang="de"' if pub.get("titleEn") else ""
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(pub["title"])} | Philip Keller</title>
  <meta name="description" content="{esc(desc)}">
  <meta name="color-scheme" content="light dark">
  <link rel="canonical" href="{url}">
  <link rel="icon" href="../../assets/favicon-white-32.png?v=3" sizes="32x32" type="image/png" media="(prefers-color-scheme: dark)">
  <link rel="icon" href="../../assets/favicon-black-32.png?v=3" sizes="32x32" type="image/png" media="(prefers-color-scheme: light)">
  <link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png?v=4" sizes="180x180">
  <meta property="og:type" content="article">
  <meta property="og:title" content="{esc(pub["title"])}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:url" content="{url}">
  <meta property="og:image" content="{og_image}">
  <link rel="preload" href="../../assets/fonts/Inter-Variable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="../../style.css">
  <link rel="stylesheet" href="../../theme.css">
  <link rel="stylesheet" href="../../entry-links.css">
  <link rel="stylesheet" href="../../publication.css">
</head>
<body class="pub-page">
  <div class="pub-wrap">
    <header class="pub-top"><a class="pub-back" href="../../#publications">Philip Keller</a><a href="../../#publications">All publications</a></header>
    <main>
      <header class="pub-head">
        <p class="pub-kind">{esc(pub["kind"])}</p>
        <h1{lang}><a href="{esc(pub["url"])}" rel="noopener">{esc(pub["title"])}</a></h1>
        {en}
        <p class="pub-authors">{authors(pub["authors"])}</p>
        <p class="pub-venue">{esc(pub["venue"])}</p>
        <ul class="entry-links">{"".join(link(l) for l in pub["links"])}</ul>
      </header>
      <section class="glance" aria-labelledby="glance-label">
        <h2 class="label" id="glance-label">At a glance</h2>
        <dl>{rows}</dl>
      </section>
      {pager(pubs, i)}
    </main>
    <footer class="pub-foot">{FOOTER}</footer>
  </div>
</body>
</html>
"""


def main():
    global FOOTER
    FOOTER = site_footer()
    pubs = json.loads((PUBS / "data.json").read_text())
    for i, pub in enumerate(pubs):
        out = PUBS / pub["slug"] / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(page(pubs, i))
        print("wrote", out.relative_to(ROOT))


if __name__ == "__main__":
    main()
