#!/usr/bin/env python3
"""Builds the b2blue.chat landing page (public/site/) from the design source Main.dc.html.

The design source is a template with {{holes}}, <sc-if> and <sc-for> plus one logic class.
This turns the template into an htm/Preact render function and reuses the logic class as is.
Run: python3 site-src/build.py   (then site-src/prerender.py to bake in the first paint)
"""
import re, pathlib, html as htmllib

HERE = pathlib.Path(__file__).parent
OUT = HERE.parent / "public" / "site"
CAL_LINK = "jacob-loving-twobz4/b2blue"
ACCENT = "#0A84FF"
src = (HERE / "Main.dc.html").read_text()

helmet = re.search(r"<helmet>(.*?)</helmet>", src, re.S).group(1).strip()
body = src[src.index("</helmet>") + 9: src.index("</x-dc>")].strip()
logic = re.search(r"<script type=\"text/x-dc\"[^>]*>(.*?)</script>", src, re.S).group(1).strip()

root_open = body[: body.index(">") + 1]
dyn, rest = body.split("<!-- FINAL CTA -->")
dyn = dyn.rstrip() + "\n</div>"
footer = rest[rest.index("<footer"): rest.index("</footer>") + 9].replace("{{accent}}", ACCENT)

# ---------- template -> htm ----------
dyn = re.sub(r"<!--.*?-->", "", dyn, flags=re.S)
for ent in ("&#39;", "&amp;", "&ldquo;", "&rdquo;"):
    dyn = dyn.replace(ent, htmllib.unescape(ent))
assert "`" not in dyn and "${" not in dyn and "\\" not in dyn
dyn = dyn.replace("<br>", "<br />")
dyn = re.sub(r"<input([^>]*[^/])>", r"<input\1 />", dyn)
dyn = dyn.replace("onChange=", "onInput=")  # range sliders should update while dragging
dyn = dyn.replace('href="https://cal.com/jacob-loving-twobz4/creativerize" target="_blank" rel="noopener"', 'href="#book"')

TOKEN = re.compile(
    r'<sc-if value="\{\{\s*(?P<if>.*?)\s*\}\}"[^>]*>|(?P<endif></sc-if>)'
    r'|<sc-for list="\{\{\s*(?P<list>.*?)\s*\}\}" as="(?P<as>\w+)"[^>]*>|(?P<endfor></sc-for>)'
    r'|(?P<attr>[\w-]+)="\{\{\s*(?P<aval>[^}]*?)\s*\}\}"|\{\{\s*(?P<hole>[^}]*?)\s*\}\}'
)
scope = []
def ref(path):
    head = path.split(".")[0]
    return path if head in scope or head in ("true", "false", "$index") else "v." + path
out, pos = [], 0
for m in TOKEN.finditer(dyn):
    out.append(dyn[pos:m.start()]); pos = m.end()
    if m.group("if") is not None: out.append("${(" + ref(m.group("if")) + ") ? html`")
    elif m.group("endif"): out.append("` : null}")
    elif m.group("list") is not None:
        out.append("${(" + ref(m.group("list")) + ").map((" + m.group("as") + ", $index) => html`"); scope.append(m.group("as"))
    elif m.group("endfor"): out.append("`)}"); scope.pop()
    elif m.group("attr"): out.append(m.group("attr") + "=${" + ref(m.group("aval")) + "}")
    else: out.append("${" + ref(m.group("hole")) + "}")
out.append(dyn[pos:])
tpl = "".join(out)
assert not scope and "{{" not in tpl and "sc-if" not in tpl and "sc-for" not in tpl

# ---------- logic class ----------
assert logic.startswith("class Component extends DCLogic {")
cls_end = logic.rindex("}\nComponent.MSG")
js = (
    'import { html, Component, render } from "./htm-preact.js";\n\n'
    + "class Page extends Component {"
    + logic[len("class Component extends DCLogic {"): cls_end].replace("Component.MSG", "Page.MSG")
    + "  render() {\n    const v = this.renderVals();\n    return html`" + tpl + "`;\n  }\n}"
    + logic[cls_end + 1:].replace("Component.MSG", "Page.MSG")
    + '\n\nrender(html`<${Page} />`, document.getElementById("root"));\n'
)
(OUT / "page.js").write_text(js)

# ---------- page shell ----------
cta = f'''<section id="book" style="padding: 0 24px 96px">
<div style="max-width: 1180px; margin: 0 auto; background: #F6F7F9; border-radius: 28px; padding: 64px 20px 28px; display: flex; flex-direction: column; gap: 20px; align-items: center; text-align: center">
<h2 style="margin: 0; font-size: clamp(30px, 4.6vw, 52px); line-height: 1.06; letter-spacing: -0.03em; font-weight: 800; max-width: 820px">Reach a lead within the hour and you&#39;re 7x more likely to qualify them.</h2>
<p style="margin: 0; font-size: 18px; line-height: 1.55; color: #55576A; max-width: 560px">B2Blue reaches them in seconds. Pick a time for a 15-minute intro call.</p>
<div id="cal-inline" style="width: 100%; min-height: 620px; overflow: auto; border-radius: 16px"></div>
<p style="margin: 0; font-size: 14px"><a href="https://cal.com/{CAL_LINK}" target="_blank" rel="noopener">Calendar not loading? Book on Cal.com</a></p>
<p style="margin: 0; font-size: 12.5px; color: #6E6E73">Source: Oldroyd, McElheran &amp; Elkington, &ldquo;The Short Life of Online Sales Leads,&rdquo; Harvard Business Review, 2011 (audit of 2,241 U.S. companies).</p>
</div>
</section>'''
cal = '''(function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if (typeof namespace === "string") { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
Cal("init", "b2blue", { origin: "https://app.cal.com" });
Cal.config = Cal.config || {};
Cal.config.forwardQueryParams = true;
Cal.ns.b2blue("inline", { elementOrSelector: "#cal-inline", config: { layout: "month_view", useSlotsViewOnSmallScreen: "true", theme: "light" }, calLink: "%s" });
Cal.ns.b2blue("ui", { theme: "light", hideEventTypeDetails: false, layout: "month_view" });''' % CAL_LINK
head_css = helmet.replace("<style>", "<style>\nhtml{scroll-behavior:smooth}")
title = re.search(r"<title>(.*?)</title>", src).group(1)
desc = "Automated iMessage confirmations and reminders for B2B sales teams, sent from real iPhone numbers."
page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://b2blue.chat/">
<link rel="canonical" href="https://b2blue.chat/">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
{head_css}
</head>
<body>
<div id="root"><!--PRERENDER--></div>
{root_open}
{cta}
{footer}
</div>
<script type="module" src="/site/page.js"></script>
<script>
{cal}
</script>
</body>
</html>
'''
(OUT / "index.html").write_text(page)
print("built", len(js), "bytes of page.js")
