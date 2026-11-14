import { html, Component, render } from "./htm-preact.js";

class Page extends Component {
  constructor(props) {
    super(props);
    this.state = { step: 0, mode: 'imessage', demos: 60, cur: 60, next: 75, fs: 0, sub: 0, typedN: 0 };
    this.flowEl = null;
    this.flowTimers = [];
  }
  componentDidMount() {
    this.onFlowScroll = () => {
      if (this.flowRaf) return;
      this.flowRaf = requestAnimationFrame(() => { this.flowRaf = 0; this.measureFlow(); });
    };
    window.addEventListener('scroll', this.onFlowScroll, { passive: true, capture: true });
    window.addEventListener('resize', this.onFlowScroll);
    this.measureFlow();
  }
  componentWillUnmount() {
    clearInterval(this.timer);
    this.clearFlow();
    window.removeEventListener('scroll', this.onFlowScroll, { capture: true });
    window.removeEventListener('resize', this.onFlowScroll);
  }
  clearFlow() {
    this.flowTimers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    this.flowTimers = [];
  }
  // The step whose text block has crossed the middle of the screen is active.
  measureFlow() {
    const el = this.flowEl || document.getElementById('flow');
    if (!el) return;
    const blocks = el.querySelectorAll('[data-flow-step]');
    const line = window.innerHeight * 0.55;
    let fs = 0;
    blocks.forEach((b, i) => { if (b.getBoundingClientRect().top <= line) fs = i; });
    fs = Math.min(4, fs);
    if (fs !== this.state.fs) this.enterStep(fs);
  }
  // Each step plays its own short sequence once it becomes active.
  enterStep(fs) {
    this.clearFlow();
    const total = Page.MSG.length;
    const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.setState({ fs, sub: calm ? 9 : 0, typedN: fs === 2 && !calm ? 0 : total });
    if (calm) return;
    const at = (ms, sub) => this.flowTimers.push(setTimeout(() => this.setState({ sub }), ms));
    if (fs === 1) { at(700, 1); at(1400, 2); at(2100, 3); at(2800, 4); at(3700, 5); }
    if (fs === 2) {
      const iv = setInterval(() => {
        this.setState((s) => ({ typedN: Math.min(total, s.typedN + 1) }), () => {
          if (this.state.typedN >= total) clearInterval(iv);
        });
      }, 22);
      this.flowTimers.push(iv);
    }
    if (fs === 3) { at(1100, 1); at(2400, 2); }
    if (fs === 4) { at(2600, 1); at(3600, 2); }
  }
  renderVals() {
    const accent = this.props.accent ?? '#0A84FF';
    const step = this.state.step;
    const isIm = this.state.mode === 'imessage';
    const check = 'M5 12l5 5L20 7';
    const cross = 'M6 6l12 12M18 6L6 18';
    const imPoints = [
      'Arrives as a native iMessage from a real phone number',
      'Read receipts show which prospects saw the reminder',
      'Typing indicators and reactions feel like a conversation, not a campaign',
      'No A2P 10DLC registration before you start',
    ];
    const smsPoints = [
      'Carrier filtering can drop or flag business texts',
      'No read receipts, so you never know who saw the reminder',
      'Opt-out boilerplate makes the first text read like a campaign',
      'A2P registration can take weeks before you send',
    ];
    const base = 'border: 0; border-radius: 11px; padding: 10px 22px; font: inherit; font-size: 15px; font-weight: 600; cursor: pointer; min-height: 44px;';
    const on = base + ' background: #FFFFFF; color: #0B0B10; box-shadow: 0 1px 3px rgba(0,0,0,0.12);';
    const off = base + ' background: transparent; color: #6E6E73;';
    const showed = step >= 9;
    const booked = step >= 5;
    const replied = step >= 3;
    const tagName = showed ? 'Demo Held' : booked ? 'Demo Booked' : replied ? 'Replied' : 'New Lead';
    const tagColor = showed ? '#34C759' : booked ? '#5E5CE6' : replied ? '#30B0C7' : accent;
    const preview = showed ? 'Joining now 👍' : step >= 7 ? 'You: Starting in 15…' : booked ? 'You: Invite sent for Thu 3:30…' : replied ? '3:30 works. Can I bring our CFO?' : 'You: Hi Marcus, Jacob from…';
    const status = step === 0 ? '' : step < 3 ? 'Delivered' : step < 5 ? 'Read 9:03 AM' : step < 7 ? 'Read 9:05 AM' : step < 9 ? 'Read 3:15 PM' : '';
    const demos = this.state.demos;
    const cur = this.state.cur;
    const next = this.state.next;
    const fs = this.state.fs;
    const sub = this.state.sub;
    const scene = (on) => ({ o: on ? 1 : 0, tf: on ? 'none' : 'translateY(16px)', vis: on ? 'visible' : 'hidden' });
    const found = (n) => ({ o: fs > 1 || sub >= n ? 1 : 0, tf: fs > 1 || sub >= n ? 'none' : 'translateY(8px)' });
    const typedN = this.state.typedN;
    const typing = fs === 2 && typedN < Page.MSG.length;
    const flowDone = fs === 4 && sub >= 1;
    const stepDefs = [
      ['Meeting booked', 'A prospect books a demo.', 'B2Blue picks up the lead the second the form is submitted.', ['Booking webhooks', 'Lead forms']],
      ['Research', 'B2Blue does the homework.', 'B2Blue automatically researches the prospect and compiles relevant data.', ['LinkedIn', 'Company website']],
      ['Personalize', 'A message written for one person.', 'B2Blue writes a personalized message built from what it found.', ['AI drafting', '1:1, not a blast']],
      ['Send via iMessage', 'Delivered as a real iMessage.', 'B2Blue automatically reaches out over iMessage, from a real iPhone number.', ['Real iPhone number', 'Read receipts']],
      ['Warm reply', 'They write back.', 'The prospect replies, and the conversation lands in your team inbox.', ['Team inbox', 'Rep handoff']],
    ];
    const steps = stepDefs.map((d, i) => {
      const done = i < fs || (i === 4 && flowDone);
      const active = i === fs && !done;
      return {
        n: i + 1, done, todo: !done,
        eyebrow: '0' + (i + 1) + ' · ' + d[0], title: d[1], body: d[2], tags: d[3],
        eyebrowFg: active || done ? accent : '#8E8E93',
        stepCls: i < fs ? 'fl-done' : '',
        textO: i === fs ? 1 : 0.4,
        m0: i === 0, m1: i === 1, m2: i === 2, m3: i === 3, m4: i === 4,
        bg: done ? accent : active ? '#E8F1FF' : '#FFFFFF',
        border: done || active ? accent : '#D1D1D6',
        fg: active ? '#0A4FA3' : '#6E6E73',
        ring: active ? '0 0 0 6px rgba(10,132,255,0.15)' : 'none',
      };
    });
    const heldNow = Math.round(demos * cur / 100);
    const heldNext = Math.round(demos * next / 100);
    const extraYear = Math.max(0, heldNext - heldNow) * 12;
    return {
      accent,
      flowRef: (el) => { this.flowEl = el; },
      steps,
      navCls: this.state.navOpen ? 'nav-open' : '',
      navOpen: Boolean(this.state.navOpen),
      toggleNav: () => this.setState({ navOpen: !this.state.navOpen }),
      closeNav: () => this.setState({ navOpen: false }),
      sA: scene(fs === 0),
      sB: scene(fs === 1),
      sC: scene(fs === 2),
      sD: scene(fs >= 3),
      researching: !(fs > 1 || sub >= 5),
      researched: fs > 1 || sub >= 5,
      researchTitle: fs > 1 || sub >= 5 ? 'Research complete' : 'Researching Marcus Bell',
      f0: found(1), f1: found(2), f2: found(3), f3: found(4), f4: found(5),
      typed: Page.MSG.slice(0, fs < 2 ? 0 : typedN),
      flowTyping: typing,
      draftStatus: typing ? 'Writing…' : 'Ready to send',
      sendGlow: fs === 2 && !typing ? '0 0 0 6px rgba(10,132,255,0.18)' : 'none',
      sent: fs >= 3,
      sendStatus: fs >= 4 ? 'Read 3:02 PM' : fs === 3 ? (sub >= 2 ? 'Read 3:02 PM' : sub >= 1 ? 'Delivered' : '') : '',
      dots: fs === 4 && sub < 1,
      reply: fs === 4 && sub >= 1,
      winO: fs === 4 && sub >= 2 ? 1 : 0,
      m1: step >= 1,
      typing: step === 2,
      m2: step >= 3,
      m3: step >= 5,
      m4: step >= 7,
      m5: step >= 9,
      status,
      tagName,
      tagColor,
      preview,
      smsBtn: isIm ? off : on,
      imBtn: isIm ? on : off,
      pickSms: () => this.setState({ mode: 'sms' }),
      pickIm: () => this.setState({ mode: 'imessage' }),
      points: (isIm ? imPoints : smsPoints).map((text) => ({ text, bg: isIm ? accent : '#C93400', icon: isIm ? check : cross })),
      bubble: isIm ? accent : '#34C759',
      channelLabel: isIm ? 'iMessage' : 'Text Message',
      inputLabel: isIm ? 'iMessage' : 'Text Message',
      optOut: isIm ? '' : ' Reply STOP to opt out.',
      phoneStatus: isIm ? 'Read 3:13 PM' : '',
      showReply: isIm,
      demos,
      cur,
      next,
      curLabel: cur + '%',
      nextLabel: next + '%',
      onDemos: (e) => this.setState({ demos: Number(e.target.value) }),
      onCur: (e) => this.setState({ cur: Number(e.target.value) }),
      onNext: (e) => this.setState({ next: Number(e.target.value) }),
      heldNow: heldNow.toLocaleString('en-US'),
      heldNext: heldNext.toLocaleString('en-US'),
      extraYear: extraYear.toLocaleString('en-US'),
    };
  }
  toggleCal() {
    const open = !this.state.calOpen;
    this.setState({ calOpen: open });
    if (open && !this.calLoaded && window.b2Cal) { this.calLoaded = true; window.b2Cal('b2bluehero', '#cal-hero'); }
  }
  render() {
    const v = this.renderVals();
    return html`<div style="font-family: Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0B0B10; background: #FFFFFF; width: 100%; -webkit-font-smoothing: antialiased">


<header class="topnav" style="border-bottom: 1px solid #ECECF0">
<nav style="max-width: 1180px; margin: 0 auto; padding: 10px 24px; min-height: 44px; display: flex; align-items: center; gap: 0 28px; flex-wrap: wrap">
<a href="#top" style="color: #000000; font-size: 16px; font-weight: 600; letter-spacing: -0.02em">B2Blue</a>
<button type="button" class="nav-burger" aria-label="Menu" aria-expanded=${v.navOpen} onClick=${v.toggleNav}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg></button>
<div class="nav-links ${v.navCls}" onClick=${v.closeNav}>
<a href="#flow" style="color: #55576A">How it works</a>
<a href="#funnel" style="color: #55576A">Your funnel</a>
<a href="#why" style="color: #55576A">Why iMessage</a>
<a href="#showrate" style="color: #55576A">Show rates</a>
</div>
<a href="https://app.b2blue.chat" class="nav-login" style="color: #0B0B10; font-size: 15px; font-weight: 600">Log in</a>
</nav>
</header>


<section id="top" class="hero" style="color: #0B0B10; padding: 104px 24px 96px">
<div style="max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 26px">
<div class="en mono" style="display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px; border: 1px solid #E5E5EA; border-radius: 999px; background: rgba(255,255,255,.7); color: #55576A"><span class="pulse"></span>iMessage automation for B2B sales</div>
<h1 class="en en1" style="margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: clamp(38px, 6vw, 68px); line-height: 1.03; letter-spacing: -0.04em; font-weight: 800">3x show rates with <span class="shim">automated iMessages</span></h1>
<p class="en en2" style="margin: 0; font-size: 19px; line-height: 1.55; color: #55576A; max-width: 600px">Turn every booked demo into a real conversation. Personalized texts sent from real iPhones. Built for B2B sales teams.</p>
<div class="en en3">${this.state.calOpen ? html`<button type="button" onClick=${() => this.toggleCal()} aria-expanded="true" style="border: 0; background: none; padding: 4px; cursor: pointer; font-family: inherit; font-size: 14px; color: #6E6E73; text-decoration: underline; text-underline-offset: 3px">Close calendar</button>` : html`<button type="button" class="btn" onClick=${() => this.toggleCal()} aria-expanded="false" style="border: 0; cursor: pointer; font-family: inherit; background: ${v.accent}; color: #FFFFFF; padding: 15px 26px; border-radius: 12px; font-weight: 500; font-size: 16px">Book a demo <span class="arr" aria-hidden="true">→</span></button>`}</div>
<div style="width: min(1040px, calc(100vw - 32px)); overflow: hidden; transition: max-height .5s ease, opacity .4s ease; max-height: ${this.state.calOpen ? "1400px" : "0px"}; opacity: ${this.state.calOpen ? 1 : 0}"><div id="cal-hero" style="min-height: 560px; border-radius: 16px; overflow: auto"></div></div>
<div class="ticks en en4" style="font-size: 14px; color: #6E6E73">
<span>Real iPhone numbers</span><span>No A2P registration</span><span>Month to month</span>
</div>
</div>
</section>


<section id="flow" ref=${v.flowRef} style="padding: 88px 24px 40px; border-top: 1px solid #ECECF0; border-bottom: 1px solid #ECECF0">
<div style="max-width: 1180px; margin: 0 auto">
<div style="display: flex; flex-direction: column; gap: 10px; max-width: 760px; margin-bottom: 64px">
<div class="mono eyebrow rv">How it works</div>
<h2 class="ds rv" style="margin: 0; font-size: clamp(30px, 3.8vw, 46px); line-height: 1.06">One booked demo, <em>from form fill to warm reply.</em></h2>
</div>
<div class="fl-grid">
<div class="fl-steps">
${(v.steps).map((st, $index) => html`
<div class="fl-step ${st.stepCls}" data-flow-step="1">
<div style="flex: none; position: relative; z-index: 1; width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 15px; border: 2px solid ${st.border}; background: ${st.bg}; color: ${st.fg}; box-shadow: ${st.ring}; transition: background .3s, border-color .3s, box-shadow .3s">
${(st.done) ? html`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg>` : null}
${(st.todo) ? html`<span>${st.n}</span>` : null}
</div>
<div class="fl-txt" style="display: flex; flex-direction: column; gap: 12px; padding-top: 8px; min-width: 0; flex: 1; opacity: ${st.textO}; transition: opacity .35s">
<div class="mono" style="color: ${st.eyebrowFg}">${st.eyebrow}</div>
<h3 class="ds" style="margin: 0; font-size: clamp(26px, 2.6vw, 34px); line-height: 1.1">${st.title}</h3>
<p style="margin: 0; font-size: 17px; line-height: 1.55; color: #55576A; max-width: 440px">${st.body}</p>
<div style="display: flex; gap: 8px; flex-wrap: wrap">
${(st.tags).map((tg, $index) => html`<span style="font-size: 13px; font-weight: 600; background: #F2F3F6; color: #3A3C48; padding: 6px 12px; border-radius: 999px">${tg}</span>`)}
</div>
${(st.m0) ? html`<div class="fl-mob">
<div style="width: 100%; margin: 0 auto; max-width: 500px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 26px 28px 16px">
<div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap">
<div style="width: 44px; height: 44px; border-radius: 13px; background: #E8F1FF; display: grid; place-items: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke=${v.accent} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"></path></svg></div>
<div style="flex: 1; min-width: 0"><div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em">New meeting booked</div><div style="font-size: 13.5px; color: #6E6E73">Demo request form · just now</div></div>
<span style="font-size: 12.5px; font-weight: 600; background: #E9F9EE; color: #1A6B32; padding: 5px 11px; border-radius: 999px">New lead</span>
</div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Name</span><span style="font-weight: 600">Marcus Bell</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Title</span><span style="font-weight: 600">VP Operations</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Company</span><span style="font-weight: 600">Halcyon Freight</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Mobile</span><span style="font-weight: 600">(480) 555-0192</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Meeting</span><span style="font-weight: 600; color: #0066CC">Thu, 3:30 PM</span></div>
</div>
</div>

</div>` : null}
${(st.m1) ? html`<div class="fl-mob">
<div style="width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 18px">
<div style="display: flex; align-items: center; gap: 12px">
${(false) ? html`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke=${v.accent} stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56"></path></svg>` : null}
${(true) ? html`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11" fill=${v.accent}></circle><path d="M7 12.5l3.2 3.2L17 9" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>` : null}
<div style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em">Research complete</div>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 22px; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; align-items: center; gap: 12px"><div style="width: 40px; height: 40px; border-radius: 50%; background: #D7DAE3; display: grid; place-items: center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#55576A" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg></div><div><div style="font-size: 16px; font-weight: 700">LinkedIn profile</div><div style="font-size: 13px; color: #6E6E73">Marcus Bell · VP Operations</div></div></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: 1; transform: none"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>12 years running freight operations</span></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: 1; transform: none"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>Posted last week about carrier onboarding delays</span></div>
</div>
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 22px; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; align-items: center; gap: 12px"><div style="width: 40px; height: 40px; border-radius: 12px; background: #E8F1FF; display: grid; place-items: center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke=${v.accent} stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"></path></svg></div><div><div style="font-size: 16px; font-weight: 700">Company website</div><div style="font-size: 13px; color: #6E6E73">halcyonfreight.com</div></div></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: 1; transform: none"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>Expanding into 3 new regions next year</span></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: 1; transform: none"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>Hiring 4 dispatchers right now</span></div>
</div>
</div>
<div style="align-self: flex-start; background: #E8F1FF; border: 1px solid #B9D8FF; color: #0A4FA3; padding: 10px 16px; border-radius: 14px; font-size: 15px; font-weight: 600; transition: opacity .35s, transform .35s; opacity: 1; transform: none">Angle: onboarding delays + multi-region growth</div>
</div>

</div>` : null}
${(st.m2) ? html`<div class="fl-mob">
<div style="width: 100%; margin: 0 auto; max-width: 600px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 26px 28px">
<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap">
<svg width="24" height="24" viewBox="0 0 24 24" fill=${v.accent} aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"></path></svg>
<div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; flex: 1">Personalized draft</div>
<span style="font-size: 12.5px; font-weight: 600; background: #E8F1FF; color: #0A4FA3; padding: 5px 11px; border-radius: 999px">To Marcus Bell · iMessage</span>
</div>
<div style="background: #F5F6F8; border-radius: 16px; padding: 18px 20px; min-height: 150px; font-size: 17px; line-height: 1.5">Hi Marcus, Jacob from Northwind. You're set for Thu at 3:30. Saw your post on carrier onboarding delays, so I'll show exactly how teams fix that. Anything else you want covered?${(false) ? html`<span style="display: inline-block; width: 2px; height: 19px; background: ${v.accent}; vertical-align: -3px; margin-left: 2px"></span>` : null}</div>
<div style="display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin-top: 16px">
<span style="font-size: 14px; color: #6E6E73">Ready to send</span>
<div style="background: ${v.accent}; color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 11px 22px; border-radius: 13px; transition: box-shadow .3s; box-shadow: none">Send</div>
</div>
</div>
</div>

</div>` : null}
${(st.m3) ? html`<div class="fl-mob">
<div style="width: 100%; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 12px">
<div style="width: 330px; max-width: 100%; height: 440px; box-sizing: border-box; border-radius: 26px; background: #FFFFFF; border: 1px solid #E5E5EA; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(10,132,255,0.16); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Inter, sans-serif">
<div style="position: relative; background: #F6F6F6; border-bottom: 1px solid #D9D9DC; padding: 10px 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px">
<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="#3478F6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="position: absolute; left: 12px; top: 12px"><path d="M10 2L2 10l8 8"></path></svg>
<div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(180deg, #A9ADB9, #878B97); display: grid; place-items: center; color: #FFFFFF; font-weight: 600; font-size: 14px">MB</div>
<div style="font-size: 11px; color: #0B0B10">Marcus <span style="color: #8E8E93">›</span></div>
</div>
<div style="flex: 1; padding: 10px 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.3">
<div style="align-self: center; text-align: center; font-size: 10.5px; color: #6E6E73; line-height: 1.35; padding-bottom: 4px"><strong>iMessage</strong><br /><strong>Today</strong> 3:01 PM</div>
${(true) ? html`<div class="bt-static im-out" style="align-self: flex-end; max-width: 80%; background: ${v.accent}; color: #FFFFFF; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Hi Marcus, Jacob from Northwind. You're set for Thu at 3:30. Saw your post on carrier onboarding delays, so I'll show exactly how teams fix that. Anything else you want covered?</span></div>` : null}
<div style="align-self: flex-end; font-size: 10.5px; font-weight: 600; color: #6E6E73; min-height: 14px">Read 3:02 PM</div>
${(false) ? html`<div class="im-in" style="align-self: flex-start; background: #E5E5EA; padding: 10px 13px; border-radius: 17px; display: flex; gap: 4px"><span class="bt-dot" style="position: relative; z-index: 1"></span><span class="bt-dot" style="position: relative; z-index: 1"></span><span class="bt-dot" style="position: relative; z-index: 1"></span></div>` : null}
${(false) ? html`<div class="bt-static im-in" style="align-self: flex-start; max-width: 80%; background: #E5E5EA; color: #000000; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Wow, appreciate the homework. Yes, and I'd love to see how you handle multi-region. See you Thursday!</span></div>` : null}
</div>
<div style="padding: 8px 12px 12px; display: flex; align-items: center; gap: 10px">
<svg width="26" height="22" viewBox="0 0 26 22" fill="#8E8E93" aria-hidden="true"><path d="M9 2l-1.6 2.4H4a3 3 0 0 0-3 3V17a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V7.4a3 3 0 0 0-3-3h-3.4L17 2H9zm4 4.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8zm0 2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill-rule="evenodd"></path></svg>
<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><rect x="1" y="1" width="24" height="20" rx="10" fill="#8E8E93"></rect><path d="M13 5.5l-4.6 9M13 5.5l4.6 9M8 12.2h10" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg>
<div style="flex: 1; display: flex; align-items: center; justify-content: space-between; border: 1px solid #C7C7CC; border-radius: 16px; padding: 4px 5px 4px 12px; font-size: 13.5px; color: #8E8E93">iMessage<span style="width: 22px; height: 22px; border-radius: 50%; background: #8E8E93; display: grid; place-items: center"><svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="1" width="4" height="7" rx="2" fill="#FFFFFF"></rect><path d="M1 7a4 4 0 0 0 8 0M5 11v2"></path></svg></span></div>
</div>
</div>
<div style="font-size: 13.5px; font-weight: 600; background: #E9F9EE; color: #1A6B32; padding: 7px 14px; border-radius: 999px; transition: opacity .35s; opacity: 0">Show-up confirmed</div>
</div>
</div>` : null}
${(st.m4) ? html`<div class="fl-mob">
<div style="width: 100%; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 12px">
<div style="width: 330px; max-width: 100%; height: 440px; box-sizing: border-box; border-radius: 26px; background: #FFFFFF; border: 1px solid #E5E5EA; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(10,132,255,0.16); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Inter, sans-serif">
<div style="position: relative; background: #F6F6F6; border-bottom: 1px solid #D9D9DC; padding: 10px 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px">
<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="#3478F6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="position: absolute; left: 12px; top: 12px"><path d="M10 2L2 10l8 8"></path></svg>
<div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(180deg, #A9ADB9, #878B97); display: grid; place-items: center; color: #FFFFFF; font-weight: 600; font-size: 14px">MB</div>
<div style="font-size: 11px; color: #0B0B10">Marcus <span style="color: #8E8E93">›</span></div>
</div>
<div style="flex: 1; padding: 10px 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.3">
<div style="align-self: center; text-align: center; font-size: 10.5px; color: #6E6E73; line-height: 1.35; padding-bottom: 4px"><strong>iMessage</strong><br /><strong>Today</strong> 3:01 PM</div>
${(true) ? html`<div class="bt-static im-out" style="align-self: flex-end; max-width: 80%; background: ${v.accent}; color: #FFFFFF; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Hi Marcus, Jacob from Northwind. You're set for Thu at 3:30. Saw your post on carrier onboarding delays, so I'll show exactly how teams fix that. Anything else you want covered?</span></div>` : null}
<div style="align-self: flex-end; font-size: 10.5px; font-weight: 600; color: #6E6E73; min-height: 14px">Read 3:02 PM</div>
${(false) ? html`<div class="im-in" style="align-self: flex-start; background: #E5E5EA; padding: 10px 13px; border-radius: 17px; display: flex; gap: 4px"><span class="bt-dot" style="position: relative; z-index: 1"></span><span class="bt-dot" style="position: relative; z-index: 1"></span><span class="bt-dot" style="position: relative; z-index: 1"></span></div>` : null}
${(true) ? html`<div class="bt-static im-in" style="align-self: flex-start; max-width: 80%; background: #E5E5EA; color: #000000; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Wow, appreciate the homework. Yes, and I'd love to see how you handle multi-region. See you Thursday!</span></div>` : null}
</div>
<div style="padding: 8px 12px 12px; display: flex; align-items: center; gap: 10px">
<svg width="26" height="22" viewBox="0 0 26 22" fill="#8E8E93" aria-hidden="true"><path d="M9 2l-1.6 2.4H4a3 3 0 0 0-3 3V17a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V7.4a3 3 0 0 0-3-3h-3.4L17 2H9zm4 4.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8zm0 2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill-rule="evenodd"></path></svg>
<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><rect x="1" y="1" width="24" height="20" rx="10" fill="#8E8E93"></rect><path d="M13 5.5l-4.6 9M13 5.5l4.6 9M8 12.2h10" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg>
<div style="flex: 1; display: flex; align-items: center; justify-content: space-between; border: 1px solid #C7C7CC; border-radius: 16px; padding: 4px 5px 4px 12px; font-size: 13.5px; color: #8E8E93">iMessage<span style="width: 22px; height: 22px; border-radius: 50%; background: #8E8E93; display: grid; place-items: center"><svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="1" width="4" height="7" rx="2" fill="#FFFFFF"></rect><path d="M1 7a4 4 0 0 0 8 0M5 11v2"></path></svg></span></div>
</div>
</div>
<div style="font-size: 13.5px; font-weight: 600; background: #E9F9EE; color: #1A6B32; padding: 7px 14px; border-radius: 999px; transition: opacity .35s; opacity: 1">Show-up confirmed</div>
</div>
</div>` : null}
</div>
</div>
`)}
</div>
<div class="fl-stage">
<div style="display: grid">

<div style="grid-area: 1 / 1; align-self: start; justify-self: center; width: 100%; transition: opacity .45s ease, transform .45s ease, visibility .45s; opacity: ${v.sA.o}; transform: ${v.sA.tf}; visibility: ${v.sA.vis}; max-width: 500px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 26px 28px 16px">
<div style="display: flex; align-items: center; gap: 14px; margin-bottom: 14px; flex-wrap: wrap">
<div style="width: 44px; height: 44px; border-radius: 13px; background: #E8F1FF; display: grid; place-items: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke=${v.accent} stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"></rect><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"></path></svg></div>
<div style="flex: 1; min-width: 0"><div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em">New meeting booked</div><div style="font-size: 13.5px; color: #6E6E73">Demo request form · just now</div></div>
<span style="font-size: 12.5px; font-weight: 600; background: #E9F9EE; color: #1A6B32; padding: 5px 11px; border-radius: 999px">New lead</span>
</div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Name</span><span style="font-weight: 600">Marcus Bell</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Title</span><span style="font-weight: 600">VP Operations</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Company</span><span style="font-weight: 600">Halcyon Freight</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Mobile</span><span style="font-weight: 600">(480) 555-0192</span></div>
<div style="display: flex; justify-content: space-between; gap: 16px; padding: 13px 0; border-top: 1px solid #EEEEF2; font-size: 16px"><span style="color: #6E6E73; font-weight: 500">Meeting</span><span style="font-weight: 600; color: #0066CC">Thu, 3:30 PM</span></div>
</div>
</div>

<div style="grid-area: 1 / 1; align-self: start; justify-self: center; width: 100%; transition: opacity .45s ease, transform .45s ease, visibility .45s; opacity: ${v.sB.o}; transform: ${v.sB.tf}; visibility: ${v.sB.vis}; display: flex; flex-direction: column; gap: 18px">
<div style="display: flex; align-items: center; gap: 12px">
${(v.researching) ? html`<svg class="bt-spin" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke=${v.accent} stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56"></path></svg>` : null}
${(v.researched) ? html`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="11" fill=${v.accent}></circle><path d="M7 12.5l3.2 3.2L17 9" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>` : null}
<div style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em">${v.researchTitle}</div>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 22px; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; align-items: center; gap: 12px"><div style="width: 40px; height: 40px; border-radius: 50%; background: #D7DAE3; display: grid; place-items: center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#55576A" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path></svg></div><div><div style="font-size: 16px; font-weight: 700">LinkedIn profile</div><div style="font-size: 13px; color: #6E6E73">Marcus Bell · VP Operations</div></div></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: ${v.f0.o}; transform: ${v.f0.tf}"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>12 years running freight operations</span></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: ${v.f1.o}; transform: ${v.f1.tf}"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>Posted last week about carrier onboarding delays</span></div>
</div>
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 22px; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; align-items: center; gap: 12px"><div style="width: 40px; height: 40px; border-radius: 12px; background: #E8F1FF; display: grid; place-items: center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke=${v.accent} stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"></path></svg></div><div><div style="font-size: 16px; font-weight: 700">Company website</div><div style="font-size: 13px; color: #6E6E73">halcyonfreight.com</div></div></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: ${v.f2.o}; transform: ${v.f2.tf}"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>Expanding into 3 new regions next year</span></div>
<div style="display: flex; gap: 10px; align-items: flex-start; font-size: 15px; line-height: 1.4; font-weight: 500; transition: opacity .35s, transform .35s; opacity: ${v.f3.o}; transform: ${v.f3.tf}"><span style="flex: none; width: 20px; height: 20px; border-radius: 50%; background: ${v.accent}; display: grid; place-items: center; margin-top: 1px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"></path></svg></span><span>Hiring 4 dispatchers right now</span></div>
</div>
</div>
<div style="align-self: flex-start; background: #E8F1FF; border: 1px solid #B9D8FF; color: #0A4FA3; padding: 10px 16px; border-radius: 14px; font-size: 15px; font-weight: 600; transition: opacity .35s, transform .35s; opacity: ${v.f4.o}; transform: ${v.f4.tf}">Angle: onboarding delays + multi-region growth</div>
</div>

<div style="grid-area: 1 / 1; align-self: start; justify-self: center; width: 100%; transition: opacity .45s ease, transform .45s ease, visibility .45s; opacity: ${v.sC.o}; transform: ${v.sC.tf}; visibility: ${v.sC.vis}; max-width: 600px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 22px; box-shadow: 0 24px 60px rgba(10,132,255,0.14); padding: 26px 28px">
<div style="display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap">
<svg width="24" height="24" viewBox="0 0 24 24" fill=${v.accent} aria-hidden="true"><path d="M12 2l2.2 6.6L21 11l-6.8 2.4L12 20l-2.2-6.6L3 11l6.8-2.4z"></path></svg>
<div style="font-size: 20px; font-weight: 800; letter-spacing: -0.02em; flex: 1">Personalized draft</div>
<span style="font-size: 12.5px; font-weight: 600; background: #E8F1FF; color: #0A4FA3; padding: 5px 11px; border-radius: 999px">To Marcus Bell · iMessage</span>
</div>
<div style="background: #F5F6F8; border-radius: 16px; padding: 18px 20px; min-height: 150px; font-size: 17px; line-height: 1.5">${v.typed}${(v.flowTyping) ? html`<span style="display: inline-block; width: 2px; height: 19px; background: ${v.accent}; vertical-align: -3px; margin-left: 2px"></span>` : null}</div>
<div style="display: flex; justify-content: flex-end; align-items: center; gap: 14px; margin-top: 16px">
<span style="font-size: 14px; color: #6E6E73">${v.draftStatus}</span>
<div style="background: ${v.accent}; color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 11px 22px; border-radius: 13px; transition: box-shadow .3s; box-shadow: ${v.sendGlow}">Send</div>
</div>
</div>
</div>

<div style="grid-area: 1 / 1; align-self: start; justify-self: center; width: 100%; transition: opacity .45s ease, transform .45s ease, visibility .45s; opacity: ${v.sD.o}; transform: ${v.sD.tf}; visibility: ${v.sD.vis}; display: flex; flex-direction: column; align-items: center; gap: 12px">
<div style="width: 330px; max-width: 100%; height: 440px; box-sizing: border-box; border-radius: 26px; background: #FFFFFF; border: 1px solid #E5E5EA; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(10,132,255,0.16); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Inter, sans-serif">
<div style="position: relative; background: #F6F6F6; border-bottom: 1px solid #D9D9DC; padding: 10px 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px">
<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="#3478F6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="position: absolute; left: 12px; top: 12px"><path d="M10 2L2 10l8 8"></path></svg>
<div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(180deg, #A9ADB9, #878B97); display: grid; place-items: center; color: #FFFFFF; font-weight: 600; font-size: 14px">MB</div>
<div style="font-size: 11px; color: #0B0B10">Marcus <span style="color: #8E8E93">›</span></div>
</div>
<div style="flex: 1; padding: 10px 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.3">
<div style="align-self: center; text-align: center; font-size: 10.5px; color: #6E6E73; line-height: 1.35; padding-bottom: 4px"><strong>iMessage</strong><br /><strong>Today</strong> 3:01 PM</div>
${(v.sent) ? html`<div class="bt-pop im-out" style="align-self: flex-end; max-width: 80%; background: ${v.accent}; color: #FFFFFF; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Hi Marcus, Jacob from Northwind. You're set for Thu at 3:30. Saw your post on carrier onboarding delays, so I'll show exactly how teams fix that. Anything else you want covered?</span></div>` : null}
<div style="align-self: flex-end; font-size: 10.5px; font-weight: 600; color: #6E6E73; min-height: 14px">${v.sendStatus}</div>
${(v.dots) ? html`<div class="im-in" style="align-self: flex-start; background: #E5E5EA; padding: 10px 13px; border-radius: 17px; display: flex; gap: 4px"><span class="bt-dot" style="position: relative; z-index: 1"></span><span class="bt-dot" style="position: relative; z-index: 1"></span><span class="bt-dot" style="position: relative; z-index: 1"></span></div>` : null}
${(v.reply) ? html`<div class="bt-pop im-in" style="align-self: flex-start; max-width: 80%; background: #E5E5EA; color: #000000; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Wow, appreciate the homework. Yes, and I'd love to see how you handle multi-region. See you Thursday!</span></div>` : null}
</div>
<div style="padding: 8px 12px 12px; display: flex; align-items: center; gap: 10px">
<svg width="26" height="22" viewBox="0 0 26 22" fill="#8E8E93" aria-hidden="true"><path d="M9 2l-1.6 2.4H4a3 3 0 0 0-3 3V17a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V7.4a3 3 0 0 0-3-3h-3.4L17 2H9zm4 4.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8zm0 2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill-rule="evenodd"></path></svg>
<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><rect x="1" y="1" width="24" height="20" rx="10" fill="#8E8E93"></rect><path d="M13 5.5l-4.6 9M13 5.5l4.6 9M8 12.2h10" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg>
<div style="flex: 1; display: flex; align-items: center; justify-content: space-between; border: 1px solid #C7C7CC; border-radius: 16px; padding: 4px 5px 4px 12px; font-size: 13.5px; color: #8E8E93">iMessage<span style="width: 22px; height: 22px; border-radius: 50%; background: #8E8E93; display: grid; place-items: center"><svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="1" width="4" height="7" rx="2" fill="#FFFFFF"></rect><path d="M1 7a4 4 0 0 0 8 0M5 11v2"></path></svg></span></div>
</div>
</div>
<div style="font-size: 13.5px; font-weight: 600; background: #E9F9EE; color: #1A6B32; padding: 7px 14px; border-radius: 999px; transition: opacity .35s; opacity: ${v.winO}">Show-up confirmed</div>
</div>
</div>
</div>
</div>
</div>
</section>


<section style="border-bottom: 1px solid #ECECF0; padding: 0 24px">
<div style="max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); border-left: 1px solid #ECECF0">
<div class="tk rv rv1" style="display: flex; flex-direction: column; gap: 8px; padding: 36px 28px; border-right: 1px solid #ECECF0"><div class="ds num" style="font-size: 40px; line-height: 1; color: ${v.accent}">2–3x</div><div style="font-size: 15px; color: #55576A">higher reply rates than SMS, as reported by iMessage providers*</div></div>
<div class="tk rv rv2" style="display: flex; flex-direction: column; gap: 8px; padding: 36px 28px; border-right: 1px solid #ECECF0"><div class="ds num" style="font-size: 40px; line-height: 1">Seconds</div><div style="font-size: 15px; color: #55576A">from form fill to first text, while your lead is still on the page.</div></div>
<div class="tk rv rv3" style="display: flex; flex-direction: column; gap: 8px; padding: 36px 28px; border-right: 1px solid #ECECF0"><div class="ds num" style="font-size: 40px; line-height: 1">Read</div><div style="font-size: 15px; color: #55576A">receipts on every confirmation, so reps know who saw the reminder.</div></div>
<div class="tk rv rv4" style="display: flex; flex-direction: column; gap: 8px; padding: 36px 28px; border-right: 1px solid #ECECF0"><div class="ds num" style="font-size: 40px; line-height: 1">0 days</div><div style="font-size: 15px; color: #55576A">of A2P 10DLC registration. Start the day your numbers are live.</div></div>
</div>
</section>


<section id="funnel" style="padding: 96px 24px 72px">
<div style="max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px">
<div style="display: flex; flex-direction: column; gap: 14px; max-width: 720px">
<div class="mono eyebrow rv">Your funnel, on iMessage</div>
<h2 class="ds rv" style="margin: 0; font-size: clamp(30px, 3.8vw, 46px); line-height: 1.06"><em>Email gets skimmed. Calls go to voicemail.</em> <span class="mark">Texts get read.</span></h2>
<p style="margin: 0; font-size: 18px; line-height: 1.6; color: #55576A">B2Blue plugs into the four moments where B2B pipeline leaks, and puts a real conversation in the gap.</p>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px">
<div class="card rv rv1" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 12px"><div class="mono" style="color: ${v.accent}">01 · Speed to lead</div><h3 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em">Text the lead before they close the tab</h3><p style="margin: 0; font-size: 15.5px; line-height: 1.55; color: #55576A">A demo request, trial signup or pricing page form fires a personal iMessage from your rep in seconds.</p></div>
<div class="card rv rv2" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 12px"><div class="mono" style="color: ${v.accent}">02 · Booking</div><h3 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em">Book the demo in the thread</h3><p style="margin: 0; font-size: 15.5px; line-height: 1.55; color: #55576A">Offer two times, get a reply, send the invite. No calendar link tennis, no email chain.</p></div>
<div class="card rv rv3" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 12px"><div class="mono" style="color: ${v.accent}">03 · Show rate</div><h3 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em">Remind them from a number they already answered</h3><p style="margin: 0; font-size: 15.5px; line-height: 1.55; color: #55576A">Confirmations and day-of reminders land in the same thread, with read receipts so reps see who's coming.</p></div>
<div class="card rv rv4" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 12px"><div class="mono" style="color: ${v.accent}">04 · Follow-up</div><h3 style="margin: 0; font-size: 20px; font-weight: 600; letter-spacing: -0.01em">Rescue no-shows and stalled deals</h3><p style="margin: 0; font-size: 15.5px; line-height: 1.55; color: #55576A">Rebook a missed demo in one text. Nudge the champion after the proposal goes out.</p></div>
</div>
</div>
</section>


<section id="why" style="padding: 72px 24px 96px; background: #FFFFFF">
<div style="max-width: 1180px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 56px; align-items: center">
<div style="flex: 1 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 20px">
<div class="mono eyebrow rv">Why iMessage</div>
<h2 class="ds rv" style="margin: 0; font-size: clamp(30px, 3.8vw, 46px); line-height: 1.06">More replies, <em>more sales.</em></h2>
<div role="group" aria-label="Compare channels" style="display: inline-flex; align-self: flex-start; background: #F2F2F7; border-radius: 14px; padding: 4px; gap: 4px">
<button type="button" onClick=${v.pickSms} style=${v.smsBtn}>SMS</button>
<button type="button" onClick=${v.pickIm} style=${v.imBtn}>iMessage</button>
</div>
<div style="display: flex; flex-direction: column; gap: 12px">
${(v.points).map((pt, $index) => html`
<div style="display: flex; gap: 12px; align-items: flex-start; font-size: 16px; line-height: 1.5">
<span style="flex: none; width: 24px; height: 24px; border-radius: 50%; background: ${pt.bg}; display: grid; place-items: center; margin-top: 1px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${pt.icon}></path></svg></span>
<span>${pt.text}</span>
</div>
`)}
</div>
</div>
<div style="flex: 1 1 380px; min-width: 0; display: flex; justify-content: center">
<div style="width: 330px; max-width: 100%; height: 440px; box-sizing: border-box; border-radius: 26px; background: #FFFFFF; border: 1px solid #E5E5EA; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(10,132,255,0.16); font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Inter, sans-serif">
<div style="position: relative; background: #F6F6F6; border-bottom: 1px solid #D9D9DC; padding: 10px 12px 8px; display: flex; flex-direction: column; align-items: center; gap: 3px">
<svg width="12" height="20" viewBox="0 0 12 20" fill="none" stroke="#3478F6" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="position: absolute; left: 12px; top: 12px"><path d="M10 2L2 10l8 8"></path></svg>
<div style="width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(180deg, #A9ADB9, #878B97); display: grid; place-items: center; color: #FFFFFF; font-weight: 600; font-size: 14px">NL</div>
<div style="font-size: 11px; color: #0B0B10">New Lead <span style="color: #8E8E93">›</span></div>
</div>
<div style="flex: 1; padding: 10px 18px; display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; line-height: 1.3">
<div style="align-self: center; text-align: center; font-size: 10.5px; color: #6E6E73; line-height: 1.35; padding-bottom: 4px"><strong>${v.channelLabel}</strong><br /><strong>Today</strong> 3:12 PM</div>
<div class="im-out" style="align-self: flex-end; max-width: 80%; background: ${v.bubble}; color: #FFFFFF; padding: 7px 12px; border-radius: 17px; transition: background .3s"><span style="position: relative; z-index: 1">Hi Marcus, quick reminder: our demo is today at 3:30. Still good to go?${v.optOut}</span></div>
<div style="align-self: flex-end; font-size: 10.5px; font-weight: 600; color: #6E6E73; min-height: 14px">${v.phoneStatus}</div>
${(v.showReply) ? html`<div class="bt-pop im-in" style="align-self: flex-start; max-width: 80%; background: #E5E5EA; color: #000000; padding: 7px 12px; border-radius: 17px"><span style="position: relative; z-index: 1">Yep, see you then. Bringing our CFO.</span></div>` : null}
</div>
<div style="padding: 8px 12px 12px; display: flex; align-items: center; gap: 10px">
<svg width="26" height="22" viewBox="0 0 26 22" fill="#8E8E93" aria-hidden="true"><path d="M9 2l-1.6 2.4H4a3 3 0 0 0-3 3V17a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V7.4a3 3 0 0 0-3-3h-3.4L17 2H9zm4 4.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8zm0 2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z" fill-rule="evenodd"></path></svg>
<svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><rect x="1" y="1" width="24" height="20" rx="10" fill="#8E8E93"></rect><path d="M13 5.5l-4.6 9M13 5.5l4.6 9M8 12.2h10" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" fill="none"></path></svg>
<div style="flex: 1; display: flex; align-items: center; justify-content: space-between; border: 1px solid #C7C7CC; border-radius: 16px; padding: 4px 5px 4px 12px; font-size: 13.5px; color: #8E8E93">${v.inputLabel}<span style="width: 22px; height: 22px; border-radius: 50%; background: #8E8E93; display: grid; place-items: center"><svg width="10" height="14" viewBox="0 0 10 14" fill="none" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><rect x="3" y="1" width="4" height="7" rx="2" fill="#FFFFFF"></rect><path d="M1 7a4 4 0 0 0 8 0M5 11v2"></path></svg></span></div>
</div>
</div>
</div>
</div>
</section>


<section id="showrate" style="padding: 0 24px 96px">
<div class="tk rv" style="max-width: 1180px; margin: 0 auto; background-color: #F6F7F9; color: #0B0B10; border-radius: 28px; padding: 56px 48px; display: flex; flex-wrap: wrap; gap: 48px; align-items: center">
<div style="flex: 1 1 380px; min-width: 0; display: flex; flex-direction: column; gap: 18px">
<h2 class="ds" style="margin: 0; font-size: clamp(28px, 3.4vw, 40px); line-height: 1.08">What's a better show rate <em>worth?</em></h2>
<p style="margin: 0; font-size: 17px; line-height: 1.6; color: #55576A">Plug in your own numbers. Every no-show is a demo your team already paid to book.</p>
<label for="bt-demos" style="font-size: 14px; color: #55576A; display: flex; justify-content: space-between; padding-top: 6px"><span>Demos booked per month</span><strong style="color: #0B0B10; font-size: 18px">${v.demos}</strong></label>
<input id="bt-demos" type="range" min="10" max="400" step="10" value=${v.demos} onInput=${v.onDemos} style="width: 100%" />
<label for="bt-cur" style="font-size: 14px; color: #55576A; display: flex; justify-content: space-between"><span>Your show rate today</span><strong style="color: #0B0B10; font-size: 18px">${v.curLabel}</strong></label>
<input id="bt-cur" type="range" min="20" max="95" step="5" value=${v.cur} onInput=${v.onCur} style="width: 100%" />
<label for="bt-next" style="font-size: 14px; color: #55576A; display: flex; justify-content: space-between"><span>Show rate you're aiming for</span><strong style="color: #0B0B10; font-size: 18px">${v.nextLabel}</strong></label>
<input id="bt-next" type="range" min="20" max="100" step="5" value=${v.next} onInput=${v.onNext} style="width: 100%" />
<p style="margin: 0; font-size: 12.5px; color: #6E6E73; line-height: 1.5">Starting values are examples, not benchmarks. Results depend on your funnel.</p>
</div>
<div style="flex: 1 1 420px; min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 16px">
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 18px; padding: 22px; display: flex; flex-direction: column; gap: 6px"><div style="font-size: 13px; color: #6E6E73">Demos held today</div><div class="ds num" style="font-size: 38px; line-height: 1; color: #0B0B10">${v.heldNow}</div></div>
<div style="background: #FFFFFF; border: 1px solid #E5E5EA; border-radius: 18px; padding: 22px; display: flex; flex-direction: column; gap: 6px"><div style="font-size: 13px; color: #6E6E73">Demos held at your target</div><div class="ds num" style="font-size: 38px; line-height: 1; color: ${v.accent}">${v.heldNext}</div></div>
<div style="grid-column: 1 / -1; background: ${v.accent}; border-radius: 18px; padding: 22px; display: flex; flex-direction: column; gap: 6px; color: #FFFFFF"><div style="font-size: 13px; color: #FFFFFF">Extra demos held per year</div><div class="ds num" style="font-size: 46px; line-height: 1">+${v.extraYear}</div></div>
</div>
</div>
</section>


<section id="how" style="padding: 24px 24px 96px">
<div style="max-width: 1180px; margin: 0 auto; display: flex; flex-direction: column; gap: 40px">
<div style="display: flex; flex-direction: column; gap: 14px; max-width: 640px">
<div class="mono eyebrow rv">How it works</div>
<h2 class="ds rv" style="margin: 0; font-size: clamp(30px, 3.8vw, 46px); line-height: 1.06">Live this week. <em>Running on autopilot after that.</em></h2>
</div>
<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px">
<div class="card rv rv1" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 28px; display: flex; flex-direction: column; gap: 12px"><div class="ds" style="width: 44px; height: 44px; border-radius: 12px; background: #E8F1FF; color: ${v.accent}; display: grid; place-items: center; font-size: 18px">1</div><h3 style="margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -0.01em">We set up your reps</h3><p style="margin: 0; font-size: 16px; line-height: 1.55; color: #55576A">Dedicated iPhone numbers for your SDRs and AEs, hosted and monitored for you.</p></div>
<div class="card rv rv2" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 28px; display: flex; flex-direction: column; gap: 12px"><div class="ds" style="width: 44px; height: 44px; border-radius: 12px; background: #E8F1FF; color: ${v.accent}; display: grid; place-items: center; font-size: 18px">2</div><h3 style="margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -0.01em">Wire it into your funnel</h3><p style="margin: 0; font-size: 16px; line-height: 1.55; color: #55576A">Demo request, meeting booked, no-show, deal stage change. Connect your CRM, Zapier, Make or our API.</p></div>
<div class="card rv rv3" style="border: 1px solid #ECECF0; border-radius: 20px; padding: 28px; display: flex; flex-direction: column; gap: 12px"><div class="ds" style="width: 44px; height: 44px; border-radius: 12px; background: #E8F1FF; color: ${v.accent}; display: grid; place-items: center; font-size: 18px">3</div><h3 style="margin: 0; font-size: 21px; font-weight: 600; letter-spacing: -0.01em">Reps work replies anywhere</h3><p style="margin: 0; font-size: 16px; line-height: 1.55; color: #55576A">Every conversation lands in one shared inbox. Tag by stage, filter by rep and reply from a laptop or phone.</p></div>
</div>
</div>
</section>


<section style="padding: 24px 24px 96px">
<div style="max-width: 820px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px">
<h2 class="ds rv" style="margin: 0 0 20px; font-size: clamp(30px, 3.6vw, 42px); line-height: 1.06; text-align: center">Questions, <em>answered.</em></h2>
<details class="rv" style="border: 1px solid #E5E5EA; border-radius: 16px; padding: 18px 22px"><summary style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 17px">Is this real iMessage?<span class="bt-plus" style="font-size: 22px; color: ${v.accent}; transition: transform .2s">+</span></summary><p style="margin: 12px 0 0; color: #55576A; line-height: 1.6">Yes. Every message is sent from a real iPhone number through Apple's Messages app, so it arrives as a native iMessage with read receipts and typing indicators.</p></details>
<details class="rv" style="border: 1px solid #E5E5EA; border-radius: 16px; padding: 18px 22px"><summary style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 17px">Does it work with our CRM?<span class="bt-plus" style="font-size: 22px; color: ${v.accent}; transition: transform .2s">+</span></summary><p style="margin: 12px 0 0; color: #55576A; line-height: 1.6">Triggers come from your CRM, forms or scheduling tool through Zapier, Make or our API. Common setups fire on a demo request, a booked meeting and a no-show.</p></details>
<details class="rv" style="border: 1px solid #E5E5EA; border-radius: 16px; padding: 18px 22px"><summary style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 17px">What happens with Android users?<span class="bt-plus" style="font-size: 22px; color: ${v.accent}; transition: transform .2s">+</span></summary><p style="margin: 12px 0 0; color: #55576A; line-height: 1.6">They get a regular text from the same number, so no lead falls through the cracks.</p></details>
<details class="rv" style="border: 1px solid #E5E5EA; border-radius: 16px; padding: 18px 22px"><summary style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 17px">Are there sending limits?<span class="bt-plus" style="font-size: 22px; color: ${v.accent}; transition: transform .2s">+</span></summary><p style="margin: 12px 0 0; color: #55576A; line-height: 1.6">Messages are unlimited. New conversations are paced per number, about 50 a day, to keep each number healthy. More reps, more numbers.</p></details>
<details class="rv" style="border: 1px solid #E5E5EA; border-radius: 16px; padding: 18px 22px"><summary style="display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 17px">Can we cold blast a purchased list?<span class="bt-plus" style="font-size: 22px; color: ${v.accent}; transition: transform .2s">+</span></summary><p style="margin: 12px 0 0; color: #55576A; line-height: 1.6">No. B2Blue is built for one-to-one conversations with leads who opted in, like demo requests and booked meetings. That's what keeps reply rates high and numbers healthy.</p></details>
</div>
</section>
</div>`;
  }
}
Page.MSG = "Hi Marcus, Jacob from Northwind. You're set for Thu at 3:30. Saw your post on carrier onboarding delays, so I'll show exactly how teams fix that. Anything else you want covered?";

render(html`<${Page} />`, document.getElementById("root"));
