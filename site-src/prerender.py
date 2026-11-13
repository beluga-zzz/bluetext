#!/usr/bin/env python3
"""Bakes the first paint into public/site/index.html so the page shows before JS loads.
Needs the dev server running with DEV_HOST=b2blue.chat:  python3 site-src/prerender.py [url]"""
import sys, pathlib
from playwright.sync_api import sync_playwright
url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787/"
out = pathlib.Path(__file__).parent.parent / "public" / "site" / "index.html"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-proxy-server"])
    pg = b.new_page(viewport={"width": 1280, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.route("**/app.cal.com/**", lambda r: r.abort())
    pg.goto(url); pg.wait_for_selector("#root h1")
    html = pg.evaluate("document.getElementById('root').innerHTML")
    b.close()
assert not errs, errs
s = out.read_text()
a, z = s.index('<div id="root">') + 15, s.index("</div>\n<div style=\"font-family")
out.write_text(s[:a] + html + s[z:])
print("prerendered", len(html), "bytes")
