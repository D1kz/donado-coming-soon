(function () {
  'use strict';

  // ---- i18n ----
  const DICT = {
    ru: {
      tagPairs: [
        { base: 'Забудь донат.', rot: 'Играй в донадо.' },
        { base: 'Больше не проси донаты.', rot: 'Проси донадо.' },
        { base: 'Донатить — в прошлом.', rot: 'Начинай донадить.' }
      ],
      cs: ['скоро'],
      hint: 'жми',
      title: 'Donado',
      wlTitle: 'Нравится? Узнай о запуске первым 🎉',
      wlPh: 'почта или @telegram',
      wlDone: 'Готово — напишем первыми 🎉',
      counterLabel: 'собрано сейчас',
      errEmail: 'Похоже на почту, но не хватает домена — проверьте адрес',
      errTg: 'Telegram-ник: 5–32 символа, начинается с буквы (латиница/цифры/подчёркивание)',
      errGeneric: 'Введите почту или Telegram-ник (@username)'
    },
    kz: {
      tagPairs: [
        { base: 'Донатты ұмыт.', rot: 'Донадо ойна.' },
        { base: 'Донат сұрама.', rot: 'Донадо сұра.' },
        { base: 'Донат ету — өткен шақта.', rot: 'Донадо ойнауды баста.' }
      ],
      cs: ['жақында'],
      csNarrow: ['жа', 'қын', 'да'],
      hint: 'бас',
      title: 'Donado',
      wlTitle: 'Ұнады ма? Іске қосылуды бірінші біл 🎉',
      wlPh: 'пошта немесе @telegram',
      wlDone: 'Дайын — бірінші боп жазамыз 🎉',
      counterLabel: 'қазір жиналды',
      errEmail: 'Поштаға ұқсайды, бірақ домен жетіспейді — мекенжайды тексеріңіз',
      errTg: 'Telegram ник: 5–32 таңба, әріптен басталуы керек (латын әріптері/сандар/астын сызу)',
      errGeneric: 'Пошта немесе Telegram ник (@username) енгізіңіз'
    },
    en: {
      tagPairs: [
        { base: 'Forget donations.', rot: 'Play donado.' },
        { base: 'Stop asking for donations.', rot: 'Ask for donado.' },
        { base: 'Donating is old news.', rot: 'Donado is the new move.' }
      ],
      cs: ['coming soon'],
      csNarrow: ['coming', 'soon'],
      hint: 'press it',
      title: 'Donado',
      wlTitle: 'Like it? Be the first to know 🎉',
      wlPh: 'email or @telegram',
      wlDone: "Done — you'll hear it first 🎉",
      counterLabel: 'raised so far',
      errEmail: "Looks like an email, but the domain's missing — check the address",
      errTg: 'Telegram handle: 5–32 characters, must start with a letter (letters/digits/underscore)',
      errGeneric: 'Enter an email or a Telegram handle (@username)'
    }
  };

  function ruPlural(n) {
    const m10 = n % 10, m100 = n % 100;
    if (m100 >= 11 && m100 <= 14) return 'раз';
    if (m10 >= 2 && m10 <= 4) return 'раза';
    return 'раз';
  }

  function grp(n) {
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // ---- state ----
  let lang = 'ru', theme = null;
  try {
    lang = localStorage.getItem('donado_lang') || 'ru';
    theme = localStorage.getItem('donado_theme');
  } catch (e) {}

  const state = {
    presses: 0,
    langOpen: false,
    rotI: 0,
    narrow: window.innerWidth < 620,
    wlValue: '',
    wlDone: false,
    wlDismissed: false
  };

  let pressId = 0;
  let particleId = 0;
  let pressTimeout = null;

  const AMB = [50, 100, 100, 150, 200, 200, 250, 300, 500];
  const PRESS = [1000, 2000, 2000, 3000, 5000];
  const MAX = 9999999;

  const base = (80 + Math.floor(Math.random() * 160)) * 500;
  const chart = { base: base, total: base, display: null, points: [], pops: [], popTimer: 0.8, lo: null, hi: null };

  // ---- DOM refs ----
  const $ = (id) => document.getElementById(id);
  const canvas = $('chart');
  const tgLink = $('tgLink');
  const langBtn = $('langBtn');
  const langLabel = $('langLabel');
  const langMenu = $('langMenu');
  const themeBtn = $('themeBtn');
  const iconMoon = $('iconMoon');
  const iconSun = $('iconSun');
  const csWatermark = $('csWatermark');
  const counterLabelEl = $('counterLabel');
  const counterNum = $('counterNum');
  const pressBtn = $('pressBtn');
  const particlesEl = $('particles');
  const pressAmt = $('pressAmt');
  const pressHint = $('pressHint');
  const hintText = $('hintText');
  const tagBaseEl = $('tagBase');
  const tagRotEl = $('tagRot');
  const waitlistEl = $('waitlist');
  const wlActiveEl = $('wlActive');
  const wlDoneEl = $('wlDone');
  const wlDoneTextEl = $('wlDoneText');
  const wlTitleEl = $('wlTitle');
  const wlInput = $('wlInput');
  const wlSubmit = $('wlSubmit');
  const wlClose = $('wlClose');
  const wlDoneClose = $('wlDoneClose');
  const wlErrorEl = $('wlError');

  const params = new URLSearchParams(location.search);
  if (params.get('tg')) tgLink.href = params.get('tg');

  function getTheme() {
    return theme || 'light';
  }

  function applyTheme() {
    const dark = getTheme() === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    iconMoon.classList.toggle('is-hidden', dark);
    iconSun.classList.toggle('is-hidden', !dark);
  }

  function toggleTheme() {
    theme = getTheme() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('donado_theme', theme); } catch (e) {}
    applyTheme();
  }

  function renderLang() {
    const t = DICT[lang];
    langLabel.textContent = lang.toUpperCase();
    document.title = t.title;
    document.documentElement.lang = lang;

    let cs = t.cs;
    if (state.narrow && t.csNarrow) cs = t.csNarrow;
    csWatermark.innerHTML = cs.map(l => '<div>' + l + '</div>').join('');

    counterLabelEl.textContent = t.counterLabel;
    hintText.textContent = t.hint;
    const pair = t.tagPairs[state.rotI % t.tagPairs.length];
    tagBaseEl.textContent = pair.base;
    tagRotEl.textContent = pair.rot;

    wlTitleEl.textContent = t.wlTitle;
    wlInput.placeholder = t.wlPh;
    wlDoneTextEl.textContent = t.wlDone;
    if (wlInput.classList.contains('is-invalid')) {
      const result = validateContact(state.wlValue || '');
      wlErrorEl.textContent = t[result.errKey || 'errGeneric'];
    }

    Array.from(langMenu.children).forEach((btn) => {
      btn.classList.toggle('selected', btn.dataset.lang === lang);
    });
  }

  function setLang(l) {
    lang = l;
    try { localStorage.setItem('donado_lang', l); } catch (e) {}
    state.langOpen = false;
    langMenu.classList.add('is-hidden');
    langBtn.setAttribute('aria-expanded', 'false');
    renderLang();
  }

  langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    state.langOpen = !state.langOpen;
    langMenu.classList.toggle('is-hidden', !state.langOpen);
    langBtn.setAttribute('aria-expanded', String(state.langOpen));
  });

  document.addEventListener('click', () => {
    if (state.langOpen) {
      state.langOpen = false;
      langMenu.classList.add('is-hidden');
      langBtn.setAttribute('aria-expanded', 'false');
    }
  });

  langMenu.addEventListener('click', (e) => e.stopPropagation());
  Array.from(langMenu.children).forEach((btn) => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
  });

  themeBtn.addEventListener('click', toggleTheme);

  // rotating tagline
  setInterval(() => {
    const t = DICT[lang];
    state.rotI = (state.rotI + 1) % t.tagPairs.length;
    const pair = t.tagPairs[state.rotI];
    tagBaseEl.textContent = pair.base;
    tagRotEl.textContent = pair.rot;
    tagRotEl.style.animation = 'none';
    // eslint-disable-next-line no-unused-expressions
    tagRotEl.offsetHeight;
    tagRotEl.style.animation = '';
  }, 4500);

  // ---- press interaction ----
  function pressWord() {
    const damt = PRESS[Math.floor(Math.random() * PRESS.length)];
    chart.total = Math.min(chart.total + damt, MAX);

    pressId++;
    const myId = pressId;
    pressAmt.textContent = '+' + grp(damt);
    pressAmt.classList.remove('is-hidden');
    pressAmt.style.animation = 'none';
    // eslint-disable-next-line no-unused-expressions
    pressAmt.offsetHeight;
    pressAmt.style.animation = (myId % 2 ? 'amtPopA' : 'amtPopB') + ' 1.4s cubic-bezier(0.2,0.7,0.3,1) forwards';
    pressHint.style.display = 'none';

    clearTimeout(pressTimeout);
    pressTimeout = setTimeout(() => {
      if (myId === pressId) {
        pressAmt.classList.add('is-hidden');
        pressHint.style.display = '';
      }
    }, 1400);

    state.presses++;
    spawnConfetti();
    updateWaitlistVisibility();
  }

  function spawnConfetti() {
    const colors = ['#2FC3E0', '#F7B23A', 'var(--ink)'];
    for (let i = 0; i < 12; i++) {
      const id = ++particleId;
      const round = Math.random() > 0.6;
      const el = document.createElement('div');
      el.className = 'particle';
      const dx = ((Math.random() * 2 - 1) * 180).toFixed(0) + 'px';
      const dy = (-(70 + Math.random() * 200)).toFixed(0) + 'px';
      const rot = ((Math.random() * 2 - 1) * 240).toFixed(0) + 'deg';
      el.style.left = (15 + Math.random() * 70) + '%';
      el.style.top = (20 + Math.random() * 30) + '%';
      el.style.width = round ? '9px' : '7px';
      el.style.height = round ? '9px' : (10 + Math.random() * 8) + 'px';
      el.style.borderRadius = round ? '50%' : '3px';
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.setProperty('--dx', dx);
      el.style.setProperty('--dy', dy);
      el.style.setProperty('--rot', rot);
      el.style.animationDuration = (650 + Math.random() * 350).toFixed(0) + 'ms';
      el.dataset.id = String(id);
      particlesEl.appendChild(el);
      setTimeout(() => el.remove(), 1100);
    }
  }

  pressBtn.addEventListener('click', pressWord);

  // ---- waitlist ----
  let wlWasVisible = false;

  function updateWaitlistVisibility() {
    const show = state.presses >= 3 && !state.wlDismissed;
    waitlistEl.classList.toggle('is-hidden', !show);
    if (show) {
      wlActiveEl.classList.toggle('is-hidden', state.wlDone);
      wlDoneEl.classList.toggle('is-hidden', !state.wlDone);
      if (!wlWasVisible) {
        // reset stale error/input state from a previous open of this form
        showWlError(null);
      }
    }
    wlWasVisible = show;
  }

  // Telegram usernames: must start with a letter (a–z), then a–z/0–9/underscore;
  // 5–32 chars total; no trailing or double underscore. Cannot start with a digit
  // or underscore (confirmed via Telegram API behavior, see tdesktop issue #3482;
  // length/charset per https://translations.telegram.org/en/android/settings/UsernameHelp).
  const TG_RE = /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateContact(raw) {
    const v = raw.trim();
    if (!v) return { ok: false, errKey: null };

    if (v.includes('@') && !v.startsWith('@')) {
      // typed like an email
      return EMAIL_RE.test(v) ? { ok: true } : { ok: false, errKey: 'errEmail' };
    }

    const handle = v.startsWith('@') ? v.slice(1) : v;
    if (handle.endsWith('_') || handle.includes('__')) {
      return { ok: false, errKey: 'errTg' };
    }
    if (TG_RE.test(handle)) return { ok: true };

    return { ok: false, errKey: v.startsWith('@') ? 'errTg' : 'errGeneric' };
  }

  function showWlError(errKey) {
    wlInput.classList.toggle('is-invalid', !!errKey);
    if (errKey) {
      wlErrorEl.textContent = DICT[lang][errKey];
      wlErrorEl.classList.remove('is-hidden');
    } else {
      wlErrorEl.classList.add('is-hidden');
    }
  }

  wlInput.addEventListener('input', (e) => {
    state.wlValue = e.target.value;
    if (wlInput.classList.contains('is-invalid')) showWlError(null);
  });
  wlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitWaitlist(); });
  wlSubmit.addEventListener('click', submitWaitlist);
  wlClose.addEventListener('click', () => {
    state.wlDismissed = true;
    updateWaitlistVisibility();
  });

  let wlDoneAutoCloseTimer = null;
  wlDoneClose.addEventListener('click', () => {
    clearTimeout(wlDoneAutoCloseTimer);
    state.wlDismissed = true;
    updateWaitlistVisibility();
  });

  // Cloudflare Worker endpoint — verifies the Turnstile token server-side
  // and writes the lead to Firestore via the Admin SDK. Replace with the
  // deployed Worker URL (e.g. https://donado-waitlist.YOUR_SUBDOMAIN.workers.dev).
  const WAITLIST_ENDPOINT = 'https://donado-waitlist.daur1kz.workers.dev/waitlist';

  let wlSubmitting = false;

  function setWlSubmitting(submitting) {
    wlSubmitting = submitting;
    wlSubmit.disabled = submitting;
    wlInput.disabled = submitting;
    wlSubmit.style.opacity = submitting ? '0.5' : '';
  }

  function submitWaitlist() {
    if (wlSubmitting) return;
    const v = (state.wlValue || '').trim();
    const result = validateContact(v);
    if (!result.ok) {
      showWlError(result.errKey || 'errGeneric');
      return;
    }
    showWlError(null);
    setWlSubmitting(true);

    if (window.turnstile && document.getElementById('turnstileWidget')) {
      window.turnstile.execute('#turnstileWidget');
    } else {
      // Turnstile script not loaded (e.g. blocked, offline) — fail closed.
      setWlSubmitting(false);
      showWlError('errGeneric');
    }
  }

  function finishWaitlistSubmit(contact, token) {
    fetch(WAITLIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact: contact, lang: lang, turnstileToken: token })
    })
      .then((res) => {
        if (!res.ok) throw new Error('bad response');
        state.wlDone = true;
        wlDoneTextEl.textContent = DICT[lang].wlDone;
        updateWaitlistVisibility();
        clearTimeout(wlDoneAutoCloseTimer);
        wlDoneAutoCloseTimer = setTimeout(() => {
          state.wlDismissed = true;
          updateWaitlistVisibility();
        }, 30000);
      })
      .catch(() => {
        showWlError('errGeneric');
      })
      .finally(() => {
        setWlSubmitting(false);
        if (window.turnstile) window.turnstile.reset('#turnstileWidget');
      });
  }

  // Cloudflare calls these by name (data-callback / data-error-callback) so
  // they must live on window, not inside this IIFE's closure.
  window.onTurnstileSuccess = function (token) {
    if (!wlSubmitting) return;
    const v = (state.wlValue || '').trim();
    finishWaitlistSubmit(v, token);
  };

  window.onTurnstileError = function () {
    if (!wlSubmitting) return;
    setWlSubmitting(false);
    showWlError('errGeneric');
  };

  // ---- resize ----
  function sizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
  }

  window.addEventListener('resize', () => {
    const narrow = window.innerWidth < 620;
    if (narrow !== state.narrow) {
      state.narrow = narrow;
      renderLang();
    }
    sizeCanvas();
  });

  // ---- chart animation ----
  function mix(a, b, k) {
    k = Math.max(0, Math.min(1, k));
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * k) + ',' + Math.round(a[1] + (b[1] - a[1]) * k) + ',' + Math.round(a[2] + (b[2] - a[2]) * k) + ')';
  }

  function updateChart(now, dt) {
    const W = 14;
    if (chart.display == null) chart.display = chart.total;
    if (chart.points.length === 0) {
      const span = W + 1, N = 320, step = span / N;
      let simTotal = 0, simDisp = 0, popT = 0.2 + Math.random() * 0.6;
      const raw = [];
      for (let i = 0; i <= N; i++) {
        const t = now - span + step * i;
        popT -= step;
        if (popT <= 0) {
          popT = 0.7 + Math.random() * 1.5;
          simTotal += AMB[Math.floor(Math.random() * AMB.length)];
        }
        simDisp += (simTotal - simDisp) * Math.min(1, step * 0.85);
        raw.push({ t: t, v: simDisp });
      }
      const off = chart.total - raw[raw.length - 1].v;
      for (const r of raw) chart.points.push({ t: r.t, v: r.v + off });
    }
    chart.popTimer -= dt;
    if (chart.popTimer <= 0) {
      chart.popTimer = 0.7 + Math.random() * 1.5;
      const amt = AMB[Math.floor(Math.random() * AMB.length)];
      chart.total = Math.min(chart.total + amt, MAX);
      chart.pops.push({ born: now, amount: amt });
    }
    chart.display += (chart.total - chart.display) * Math.min(1, dt * 0.85);
    chart.points.push({ t: now, v: chart.display });
    chart.points = chart.points.filter(pt => pt.t > now - W - 1);
    chart.pops = chart.pops.filter(pp => now - pp.born < 1.9);

    let vis = chart.points.filter(pt => pt.t >= now - W);
    const older0 = chart.points.filter(pt => pt.t < now - W);
    if (older0.length) vis = [older0[older0.length - 1]].concat(vis);
    if (vis.length < 2) vis = chart.points.slice(-2);
    let vmin = Infinity, vmax = -Infinity;
    vis.forEach(pt => { if (pt.v < vmin) vmin = pt.v; if (pt.v > vmax) vmax = pt.v; });
    const range = Math.max(vmax - vmin, 40), padv = range * 0.3;
    const loT = vmin - padv, hiT = vmax + padv;
    if (chart.lo == null) { chart.lo = loT; chart.hi = hiT; }
    const k = Math.min(1, dt * 2.0);
    chart.lo += (loT - chart.lo) * k;
    chart.hi += (hiT - chart.hi) * k;
    chart.hi = Math.max(chart.hi, vmax + padv * 0.5);
    chart.lo = Math.min(chart.lo, vmin - padv * 0.5);
  }

  function drawChart(ctx, w, h, now) {
    const W = 14;
    const dark = getTheme() === 'dark';
    const baseC = dark ? [64, 76, 78] : [188, 204, 206];
    const acc = dark ? [47, 195, 224] : [18, 162, 184];
    const gold = dark ? [247, 178, 58] : [224, 161, 28];
    const fillA = dark ? 0.4 : 0.32;
    let vis = chart.points.filter(pt => pt.t >= now - W);
    const older1 = chart.points.filter(pt => pt.t < now - W);
    if (older1.length) vis = [older1[older1.length - 1]].concat(vis);
    if (vis.length < 2) vis = chart.points.slice(-2);
    const lo = chart.lo, hi = Math.max(chart.hi, lo + 1);
    const top = h * 0.52, bot = h * 0.92;
    const X = (tt) => (tt - (now - W)) / W * w;
    const Y = (v) => bot - (v - lo) / (hi - lo) * (bot - top);
    const P = vis.map(pt => ({ x: X(pt.t), y: Y(pt.v) }));

    const curve = () => {
      for (let i = 0; i < P.length - 1; i++) {
        const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
        ctx.bezierCurveTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
      }
    };

    ctx.beginPath(); ctx.moveTo(P[0].x, h); ctx.lineTo(P[0].x, P[0].y); curve(); ctx.lineTo(P[P.length - 1].x, h); ctx.closePath();
    const g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',' + fillA + ')');
    g.addColorStop(1, 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',0)');
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath(); ctx.moveTo(P[0].x, P[0].y); curve();
    ctx.strokeStyle = mix(baseC, acc, 0.92); ctx.lineWidth = 2.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

    const lx = P[P.length - 1].x, ly = P[P.length - 1].y;
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, 6.2832); ctx.fillStyle = 'rgba(' + acc[0] + ',' + acc[1] + ',' + acc[2] + ',0.16)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 4.5 + Math.sin(now * 4) * 0.8, 0, 6.2832); ctx.fillStyle = mix(baseC, acc, 1); ctx.fill();

    ctx.textAlign = 'right';
    chart.pops.forEach(pp => {
      const a = now - pp.born, al = Math.max(0, 1 - a / 1.9);
      ctx.globalAlpha = al;
      ctx.fillStyle = mix(baseC, gold, 1);
      ctx.font = "700 12px 'Manrope', sans-serif";
      ctx.fillText('+' + grp(pp.amount), lx - 14, ly - 14 - a * 30);
      ctx.globalAlpha = 1;
    });
  }

  let last = performance.now() / 1000;
  // Tracks how much real wall-clock time has been "paused out" of the chart's
  // own timeline (e.g. the tab was backgrounded and rAF stopped firing), so a
  // long gap doesn't look like all chart history instantly aged out at once.
  let pausedOffset = 0;
  function tick() {
    const realNow = performance.now() / 1000;
    const gap = realNow - last;
    if (gap > 1) pausedOffset += gap - 0.05;
    const now = realNow - pausedOffset;

    if (canvas.width > 0) {
      const ctx = canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr, h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const dt = Math.min(gap, 0.05);
      updateChart(now, dt);
      drawChart(ctx, w, h, now);
    }
    last = realNow;
    counterNum.textContent = grp(chart.total);
    requestAnimationFrame(tick);
  }

  // ---- init ----
  applyTheme();
  renderLang();
  counterNum.textContent = grp(chart.total);
  last = performance.now() / 1000;
  sizeCanvas();
  requestAnimationFrame(tick);
})();
