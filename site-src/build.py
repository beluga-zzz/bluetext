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
hero_btn = re.search(r'<a href="#book" class="btn en en3" style="([^"]*)">Book a demo</a>', tpl)
tpl = tpl.replace(hero_btn.group(0),
    '<div class="en en3">${this.state.calOpen'
    ' ? html`<button type="button" onClick=${() => this.toggleCal()} aria-expanded="true" style="border: 0; background: none; padding: 4px; cursor: pointer; font-family: inherit; font-size: 14px; color: #6E6E73; text-decoration: underline; text-underline-offset: 3px">Close calendar</button>`'
    ' : html`<button type="button" class="btn" onClick=${() => this.toggleCal()} aria-expanded="false" style="border: 0; cursor: pointer; font-family: inherit; ' + hero_btn.group(1) + '">Book a demo <span class="arr" aria-hidden="true">→</span></button>`}</div>\n'
    '<div style="width: min(1040px, calc(100vw - 32px)); overflow: hidden; transition: max-height .5s ease, opacity .4s ease; '
    'max-height: ${this.state.calOpen ? "1400px" : "0px"}; opacity: ${this.state.calOpen ? 1 : 0}">'
    '<div id="cal-hero" style="min-height: 560px; border-radius: 16px; overflow: auto"></div></div>', 1)
assert not scope and "{{" not in tpl and "sc-if" not in tpl and "sc-for" not in tpl

# ---------- logic class ----------
assert logic.startswith("class Component extends DCLogic {")
cls_end = logic.rindex("}\nComponent.MSG")
js = (
    'import { html, Component, render } from "./htm-preact.js";\n\n'
    + "class Page extends Component {"
    + logic[len("class Component extends DCLogic {"): cls_end].replace("Component.MSG", "Page.MSG")
    + "  toggleCal() {\n    const open = !this.state.calOpen;\n    this.setState({ calOpen: open });\n"
      "    if (open && !this.calLoaded && window.b2Cal) { this.calLoaded = true; window.b2Cal('b2bluehero', '#cal-hero'); }\n  }\n"
    + "  render() {\n    const v = this.renderVals();\n    return html`" + tpl + "`;\n  }\n}"
    + logic[cls_end + 1:].replace("Component.MSG", "Page.MSG")
    + '\n\nrender(html`<${Page} />`, document.getElementById("root"));\n'
)
(OUT / "page.js").write_text(js)

# ---------- page shell ----------
cta = f'''<section id="book" style="padding: 0 24px 96px">
<div class="dark" style="max-width: 1180px; margin: 0 auto; border-radius: 28px; padding: 88px 20px 28px; display: flex; flex-direction: column; gap: 22px; align-items: center; text-align: center">
<div class="mono eyebrow" style="color: #A1A1AA">Book a demo</div>
<h2 class="ds" style="margin: 0; font-size: clamp(32px, 4.6vw, 54px); line-height: 1.04; max-width: 900px">Reach a lead within the hour <em>and you&#39;re 7x more likely to qualify them.</em></h2>
<p style="margin: 0; font-size: 18px; line-height: 1.55; color: #A1A1AA; max-width: 560px">B2Blue reaches them in seconds. Pick a time for a 15-minute intro call.</p>
<div id="cal-inline" style="width: 100%; max-width: 1040px; min-height: 620px; overflow: auto; border-radius: 18px; background: #FFFFFF; margin-top: 12px; box-shadow: 0 30px 80px -30px rgba(10,132,255,.55)"></div>
<p style="margin: 0; font-size: 14px"><a href="https://cal.com/{CAL_LINK}" target="_blank" rel="noopener" style="color: #8EC5FF">Calendar not loading? Book on Cal.com</a></p>
<p style="margin: 0; font-size: 12.5px; color: #8E8E96">Source: Oldroyd, McElheran &amp; Elkington, &ldquo;The Short Life of Online Sales Leads,&rdquo; Harvard Business Review, 2011 (audit of 2,241 U.S. companies).</p>
</div>
</section>'''
cal = '''(function (C, A, L) { let p = function (a, ar) { a.q.push(ar); }; let d = C.document; C.Cal = C.Cal || function () { let cal = C.Cal; let ar = arguments; if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement("script")).src = A; cal.loaded = true; } if (ar[0] === L) { const api = function () { p(api, arguments); }; const namespace = ar[1]; api.q = api.q || []; if (typeof namespace === "string") { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]); } else p(cal, ar); return; } p(cal, ar); }; })(window, "https://app.cal.com/embed/embed.js", "init");
Cal.config = Cal.config || {};
Cal.config.forwardQueryParams = true;
window.b2Cal = function (ns, selector) {
  Cal("init", ns, { origin: "https://app.cal.com" });
  Cal.ns[ns]("inline", { elementOrSelector: selector, config: { layout: "month_view", useSlotsViewOnSmallScreen: "true", theme: "light" }, calLink: "%s" });
  Cal.ns[ns]("ui", { theme: "light", hideEventTypeDetails: false, layout: "month_view" });
};
window.b2Cal("b2blue", "#cal-inline");''' % CAL_LINK
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
<script>
{cal}
</script>
<script type="module" src="/site/page.js"></script>
</body>
</html>
'''
(OUT / "index.html").write_text(page)
print("built", len(js), "bytes of page.js")
