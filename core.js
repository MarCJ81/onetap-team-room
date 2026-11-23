/* ============================================================================
 * OneTap AI Team Room · core.js  v1.1.0
 * The free engine: agenda analysis, a five-role meeting round, cross-audit,
 * replies, minutes and the Pro prompt contract. No network, no DOM, no clock.
 * Runs in the browser (window.TeamRoomCore) and in node (module.exports).
 * ==========================================================================*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./data.js'));
  else root.TeamRoomCore = factory(root.TeamRoomData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Data) {
  'use strict';

  var VERSION = '1.1.0';
  var HANGUL = /[가-힣]/;

  /* ── small helpers ───────────────────────────────────────────────────── */

  function hash(str) {
    var h = 2166136261;
    var s = String(str == null ? '' : str);
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function pick(arr, seed) {
    if (!arr || !arr.length) return '';
    return arr[Math.abs(seed) % arr.length];
  }

  function uid(prefix, seed) {
    return (prefix || 'id') + '_' + (hash(seed) % 0xffffffff).toString(36);
  }

  function esc(s) {
    return String(s == null ? '' : s);
  }

  function hasBatchim(word) {
    var w = String(word || '').replace(/[^\S]+$/, '');
    if (!w) return false;
    var c = w.charCodeAt(w.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return false;
    return (c - 0xac00) % 28 !== 0;
  }

  /* particle: '을를' | '은는' | '이가' | '으로' */
  function josa(word, pair) {
    var b = hasBatchim(word);
    if (pair === '을를') return String(word) + (b ? '을' : '를');
    if (pair === '은는') return String(word) + (b ? '은' : '는');
    if (pair === '이가') return String(word) + (b ? '이' : '가');
    if (pair === '으로') return String(word) + (b ? '으로' : '로');
    return String(word);
  }

  function num(n, lang) {
    var v = Number(n) || 0;
    return v.toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR');
  }

  function money(n, lang, currency) {
    var v = Math.round(Number(n) || 0);
    if (currency === 'USD') {
      return '$' + v.toLocaleString('en-US');
    }
    if (lang === 'en') return 'KRW ' + v.toLocaleString('en-US');
    if (v >= 10000 && v % 10000 === 0) return (v / 10000) + '만원';
    return v.toLocaleString('ko-KR') + '원';
  }

  function pct(rate) {
    var v = Math.round(Number(rate) * 10000) / 100;
    return String(v) + '%';
  }

  function periodText(weeks, lang) {
    if (lang === 'en') return weeks + (weeks === 1 ? ' week' : ' weeks');
    return weeks + '주';
  }

  function cleanTitle(raw) {
    var t = String(raw || '').replace(/\s+/g, ' ').trim();
    var first = t.split(/[.。!?！？\n]/)[0].trim();
    if (!first) first = t;
    if (first.length > 96) first = first.slice(0, 94).trim() + '…';
    return first || (t.slice(0, 96));
  }

  /* ── agenda analysis ─────────────────────────────────────────────────── */

  var UNIT_RE = /(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|만원|원|krw|usd|달러|\$|%|명|개|건|주|일|개월|시간|배|회|weeks?\b|days?\b|months?\b|users?\b|customers?\b|leads?\b|visits?\b|people\b|times\b)/gi;
  var NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

  function domainOf(low) {
    var best = 'general';
    var bestScore = 0;
    Object.keys(Data.DOMAINS).forEach(function (id) {
      if (id === 'general') return;
      var d = Data.DOMAINS[id];
      var score = 0;
      d.keys.forEach(function (k) {
        if (low.indexOf(k) >= 0) score += k.length >= 4 ? 2 : 1;
      });
      if (score > bestScore) { bestScore = score; best = id; }
    });
    return best;
  }

  function analyze(text, lang) {
    lang = lang === 'en' ? 'en' : 'ko';
    var raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    var low = raw.toLowerCase();
    var domain = domainOf(low);
    var vocab = Data.DOMAINS[domain][lang];
    var metrics = [];
    var parseText = lang === 'en'
      ? raw.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/gi, function (w) {
        return String(NUMBER_WORDS[w.toLowerCase()] || w);
      })
      : raw;
    /* "$2,200" and "USD 2,200" put the currency before the number; rewrite
       them as "2,200 USD" so the unit parser below reads the amount. */
    parseText = parseText.replace(/\$\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 USD')
      .replace(/\bUSD\s*(\d[\d,]*(?:\.\d+)?)/gi, '$1 USD');
    var parseLow = parseText.toLowerCase();
    var m;
    UNIT_RE.lastIndex = 0;
    while ((m = UNIT_RE.exec(parseText)) !== null) {
      var value = Number(String(m[1]).replace(/,/g, ''));
      if (!isFinite(value) || value <= 0) continue;
      var unitRaw = m[2].toLowerCase().replace(/\s+/g, '');
      var kind = 'count';
      if (/만원|원|krw/.test(unitRaw)) kind = 'money';
      else if (/usd|달러|\$/.test(unitRaw)) kind = 'money';
      else if (unitRaw === '%') kind = 'percent';
      else if (/주|week/.test(unitRaw)) kind = 'weeks';
      else if (/개월|month/.test(unitRaw)) kind = 'months';
      else if (/일|day/.test(unitRaw)) kind = 'days';
      var norm = value;
      if (unitRaw === '만원' || unitRaw === '만원') norm = value * 10000;
      if (kind === 'percent') norm = value / 100;
      metrics.push({ raw: m[0].trim(), value: norm, unit: unitRaw, kind: kind, at: m.index });
    }

    var currency = /usd|달러|\$/i.test(raw) ? 'USD' : 'KRW';
    var assumed = [];
    var budget = null, price = null, conv = null, target = null, periodWeeks = null;

    function around(idx, words) {
      var from = Math.max(0, idx - 16);
      var to = Math.min(parseLow.length, idx + 20);
      var win = parseLow.slice(from, to);
      return words.some(function (w) { return win.indexOf(w) >= 0; });
    }

    metrics.filter(function (x) { return x.kind === 'money'; }).forEach(function (x) {
      if (price == null && around(x.at, ['객단가', '단가', '가격', 'price', 'ticket', 'per unit'])) price = x.value;
      else if (budget == null && around(x.at, ['예산', 'budget', 'spend', '지출'])) budget = x.value;
      else if (budget == null) budget = x.value;
      else if (price == null) price = x.value;
    });
    metrics.filter(function (x) { return x.kind === 'percent'; }).forEach(function (x) {
      if (conv == null && x.value > 0 && x.value <= 0.35) conv = x.value;
    });
    metrics.filter(function (x) { return x.kind === 'count'; }).forEach(function (x) {
      if (target == null && around(x.at, ['고객', '리드', 'lead', 'customer', '명', 'users'])) target = x.value;
    });
    metrics.filter(function (x) { return x.kind === 'weeks'; }).forEach(function (x) {
      if (periodWeeks == null) periodWeeks = Math.max(1, Math.round(x.value));
    });
    metrics.filter(function (x) { return x.kind === 'months'; }).forEach(function (x) {
      if (periodWeeks == null) periodWeeks = Math.max(1, Math.round(x.value * 4.34));
    });
    metrics.filter(function (x) { return x.kind === 'days'; }).forEach(function (x) {
      if (periodWeeks == null) periodWeeks = Math.max(1, Math.round(x.value / 7));
    });

    if (budget == null) { budget = currency === 'USD' ? 2200 : 3000000; assumed.push('budget'); }
    if (price == null) { price = currency === 'USD' ? 39 : 49000; assumed.push('price'); }
    if (conv == null) { conv = 0.02; assumed.push('conv'); }
    if (target == null) { target = 100; assumed.push('target'); }
    if (periodWeeks == null) { periodWeeks = 4; assumed.push('period'); }

    var flags = {
      privacy: /개인정보|프라이버시|privacy|gdpr|동의|수집/.test(low),
      payment: /결제|환불|payment|billing|refund/.test(low),
      legal: /계약|약관|법무|legal|contract|compliance/.test(low),
      security: /보안|권한|인증|유출|security|auth|access/.test(low),
      deadline: /이번 주|다음 달|마감|데드라인|deadline|this week|next month/.test(low)
    };
    flags.risk = flags.privacy || flags.payment || flags.legal || flags.security;

    var channel = vocab.channel;
    var channelMap = [
      { re: /검색|search|seo/i, ko: '검색 유입', en: 'search' },
      { re: /숏폼|영상|video|shorts|reels|tiktok/i, ko: '숏폼', en: 'short video' },
      { re: /커뮤니티|community|forum/i, ko: '커뮤니티', en: 'communities' },
      { re: /뉴스레터|이메일|newsletter|email/i, ko: '뉴스레터', en: 'the newsletter' },
      { re: /아웃바운드|outbound|cold/i, ko: '아웃바운드', en: 'outbound' },
      { re: /광고|ads?\b|advert/i, ko: '광고', en: 'paid ads' }
    ];
    channelMap.forEach(function (c) { if (c.re.test(raw)) channel = c[lang]; });

    return {
      raw: raw,
      title: cleanTitle(raw),
      domain: domain,
      funnel: ['hiring', 'infra', 'ops', 'security'].indexOf(domain) < 0
        && (metrics.some(function (x) { return x.kind === 'money'; })
          || ['growth', 'launch', 'pricing', 'content'].indexOf(domain) >= 0),
      label: vocab.label,
      noun: vocab.noun,
      decision: vocab.decision,
      metric: vocab.metric,
      risk: vocab.risk,
      move: vocab.move,
      channel: channel,
      hook: vocab.hook,
      metrics: metrics,
      budget: budget,
      price: price,
      conv: conv,
      target: target,
      periodWeeks: periodWeeks,
      currency: currency,
      flags: flags,
      assumed: assumed,
      empty: raw.length === 0
    };
  }

  function breakEven(a) {
    var perVisitor = a.price * a.conv;
    if (!(perVisitor > 0)) perVisitor = 1;
    var visitors = Math.ceil(a.budget / perVisitor);
    var customers = Math.ceil(a.budget / a.price);
    var cacCap = a.target > 0 ? a.budget / a.target : 0;
    return {
      visitors: visitors,
      customers: customers,
      perVisitor: perVisitor,
      cacCap: cacCap,
      arithmetic: Math.round(a.budget).toLocaleString('en-US') + ' ÷ (' + Math.round(a.price).toLocaleString('en-US') + ' × ' + pct(a.conv) + ') = ' + visitors
    };
  }

  /* ── roles ───────────────────────────────────────────────────────────── */

  function defaultRoles() {
    return Data.ROLE_ARCHETYPES.map(function (r, i) {
      return { id: r.kind, kind: r.kind, tag: r.tag, glyph: r.glyph, accent: r.accent, model: r.model, index: i };
    });
  }

  /* A room the user added has no catalog entry. Its one-liners are built from
     the name the user typed, so a new department still reasons in its context. */
  function customMods(name, lang) {
    var n = String(name || (lang === 'en' ? 'this department' : '이 부서'));
    if (lang === 'en') {
      return {
        pm: { en: 'framing ' + n + ' work as one decision' },
        dev: { en: 'checking what ' + n + ' needs from systems and tools' },
        design: { en: 'fixing the order one ' + n + ' screen reads in' },
        video: { en: 'cutting ' + n + ' into one finished minute' },
        growth: { en: 'starting with the channel ' + n + ' already uses' },
        sales: { en: 'starting with the customers who already asked about ' + n },
        cfo: { en: 'counting only ' + n + '\u2019s cost lines this month' },
        auditor: { en: 'whether someone in ' + n + ' owns the next step' }
      };
    }
    return {
      pm: { ko: '“' + n + '” 업무를 결정 하나로 좁혀서' },
      dev: { ko: n + '에서 쓰는 시스템과 도구를 먼저 확인해서' },
      design: { ko: n + ' 화면의 시선 순서를 먼저 정해서' },
      video: { ko: n + '을 60초 한 편으로 끊어서' },
      growth: { ko: n + '에서 이미 통하는 채널부터' },
      sales: { ko: n + '을 이미 문의한 고객부터' },
      cfo: { ko: n + '의 이번 달 지출 항목만' },
      auditor: { ko: n + ' 담당자가 정해졌는지' }
    };
  }

  function roomMods(room, lang, roomName) {
    var base = Data.ROOM_MODS[room];
    if (base) return base;
    var name = roomName || (lang === 'en' ? 'this department' : '이 부서');
    return customMods(name, lang === 'en' ? 'en' : 'ko');
  }

  function roleName(role, lang) {
    if (role && role.name) return role.name;
    var base = Data.ROLE_ARCHETYPES.filter(function (r) { return r.kind === role.kind; })[0];
    if (base) return base.name[lang];
    return role.tag || 'AI';
  }

  /* ── free round ──────────────────────────────────────────────────────── */

  function item(seed, owner, due, text) {
    return { id: uid('itm', seed + '|' + text), text: text, owner: owner, due: due, done: false };
  }

  function buildPm(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed;
    var mod = ctx.mods.pm[ctx.lang];
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '정할 것은 ' + a.decision + ' 하나로 좁히겠습니다. 안건 전체를 한 번에 처리하지는 않습니다.',
            josa(a.noun, '은는') + ' ' + periodText(a.periodWeeks, 'ko') + ' 안에 끝나는 범위만 다룹니다. ' + mod + ' 판단하겠습니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '1주차: ' + a.move + '. 2주차: 결과 확인. 범위는 ' + periodText(a.periodWeeks, 'ko') + '를 넘기지 않습니다.',
            '성공 기준은 ' + a.metric + ' 하나입니다. 오늘 시작값을 적어 두고, 끝나면 같은 기준으로만 봅니다.',
            '담당은 한 명으로 정합니다. 두 명이면 결정이 아니라 조율이 늘어납니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '기준을 두 개 이상 두면 결과가 나와도 판단을 못 합니다. 지표는 하나로 갑니다.',
            periodText(a.periodWeeks, 'ko') + '가 지나면 범위를 절반으로 줄입니다. 연장은 다음 라운드에서 따로 정합니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            a.funnel
              ? ctx.growth.name + '에게 채널별 예상 도달, ' + ctx.cfo.name + '에게 비용 상한을 먼저 받겠습니다. 두 숫자가 없으면 계획을 확정하지 않습니다.'
              : ctx.growth.name + '에게 영향받는 사람과 반복 문의 수, ' + ctx.cfo.name + '에게 이번 달 지출 항목을 먼저 받겠습니다. 두 목록이 없으면 시작하지 않습니다.'
          ] }
        ],
        items: [
          item(seed + 'pm1', ctx.pm.name, '오늘', a.metric + '의 시작값 기록'),
          item(seed + 'pm2', ctx.pm.name, '1일차', '이번 범위 밖 항목 목록에서 빼기'),
          item(seed + 'pm3', ctx.pm.name, '1일차', '실행 담당 1명 지정')
        ],
        claims: [
          { role: 'pm', quote: '성공 기준은 ' + a.metric + ' 하나', problem: '시작값이 아직 회의록에 없습니다. 액션으로만 남아 있습니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'I would narrow this to one decision: ' + a.decision + '. We are not settling the whole agenda in this room.',
            'The scope is what fits in ' + periodText(a.periodWeeks, 'en') + ', ' + mod + '.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Week 1: ' + a.move + '. Week 2: read the result. Nothing that runs past ' + periodText(a.periodWeeks, 'en') + ' stays in.',
            'One success metric: ' + a.metric + '. Write today\u2019s starting value down and judge the result only against it.',
            'One owner. Two owners turn a decision into coordination.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Two metrics means no decision even when the data arrives. One metric only.'
          , 'If the date slips past ' + periodText(a.periodWeeks, 'en') + ', we cut the scope in half. Extending is a separate decision.' ] },
          { kind: 'ask', title: 'Ask', lines: [
            a.funnel
              ? 'I need expected reach by channel from ' + ctx.growth.name + ' and a cost ceiling from ' + ctx.cfo.name + '. Without both numbers I will not lock the plan.'
              : 'I need the affected people and repeat-question count from ' + ctx.growth.name + ', and this month’s cost lines from ' + ctx.cfo.name + '. Without both lists we do not start.'
          ] }
        ],
        items: [
          item(seed + 'pm1', ctx.pm.name, 'today', 'Record the starting value of ' + a.metric),
          item(seed + 'pm2', ctx.pm.name, 'day 1', 'Cut everything outside this scope'),
          item(seed + 'pm3', ctx.pm.name, 'day 1', 'Name one owner for delivery')
        ],
        claims: [
          { role: 'pm', quote: 'One success metric: ' + a.metric, problem: 'the starting value is not in the minutes yet, only in an action item.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  /* The Tech Lead seat. Reads the agenda for what breaks in production, not
     what sells: interface, tests, deploy window, rollback. */
  function buildDev(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 23;
    var mod = ctx.mods.dev[ctx.lang];
    var focus = {
      ko: a.domain === 'infra' || a.domain === 'security'
        ? '지금은 배포 창과 롤백 경로가 정해져 있지 않습니다. 원인을 모르는 상태에서 다시 배포하면 같은 오류가 반복됩니다.'
        : a.domain === 'hiring'
          ? '채용이면 면접 질문과 과제 범위를 먼저 고정합니다. 매번 질문이 다르면 지원자를 비교할 수 없습니다.'
          : '기능보다 인터페이스(요청·응답·오류 코드)를 먼저 고정합니다. 그래야 같은 일을 두 번 하지 않습니다.',
      en: a.domain === 'infra' || a.domain === 'security'
        ? 'The deploy window and rollback path are not set. Redeploying without a known cause repeats the same error.'
        : a.domain === 'hiring'
          ? 'For a hire, fix the interview questions and the take-home scope first. Changing questions each week makes candidates incomparable.'
          : 'I pin the interface first — request, response, error codes — before any feature. That is what stops doing the same work twice.'
    };
    var riskLine = {
      ko: a.domain === 'infra'
        ? '로그 없는 재배포는 같은 오류를 세 번 더 냅니다.'
        : a.domain === 'security'
          ? '권한을 넓혀서 빨리 푸는 방법은 이번 범위에서 뺍니다. 나중에 되돌리는 비용이 더 큽니다.'
          : '테스트를 빼고 일정을 맞추면 배포 뒤에 고칩니다. 그 비용이 더 큽니다.',
      en: a.domain === 'infra'
        ? 'Redeploying without logs turns one error into three.'
        : a.domain === 'security'
          ? 'Widening access to move fast is out of scope. Undoing it later costs more.'
          : 'Skipping tests to hit the date moves the cost after the deploy, where it is larger.'
    };
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '개발 쪽에서 먼저 볼 것은 기능이 아니라 되돌릴 수 있는지입니다. ' + mod + ' 판단하겠습니다.',
            focus.ko
          ] },
          { kind: 'plan', title: '제안', lines: [
            '1주차: API 계약을 문서 한 장으로 고정합니다. 2주차: 테스트 케이스 3개를 먼저 씁니다.',
            '배포는 평일 오전으로 제한하고, 롤백은 한 번에 끝나게 준비합니다.',
            'QA 기준은 ' + a.metric + '와 따로 둡니다. 오류 0건과 성과 지표를 섞으면 어느 쪽이 문제인지 못 가립니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '기술 부채 정리는 이번 범위에 넣지 않습니다. 넣으면 일정만 늘고 기능은 나가지 않습니다.',
            riskLine.ko
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 범위 확정을, ' + ctx.auditor.name + '에게 배포 전 점검 항목을 요청합니다.'
          ] }
        ],
        items: [
          item(seed + 'd1', ctx.dev.name, '오늘', 'API 계약서 1장 고정'),
          item(seed + 'd2', ctx.dev.name, '2일차', '테스트 케이스 3개 작성'),
          item(seed + 'd3', ctx.dev.name, '1일차', '배포·롤백 절차 확인')
        ],
        claims: [
          { role: 'dev', quote: 'API 계약서 1장', problem: '응답 예시와 오류 코드가 아직 없습니다. 이게 없으면 QA가 같은 것을 두 번 봅니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'The first question on the engineering side is not the feature but whether we can undo it, ' + mod + '.',
            focus.en
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Week one: pin the API contract on one page. Week two: write three test cases before the feature.',
            'Deploys go out on weekday mornings only, with a rollback that takes one step.',
            'QA reads separate from ' + a.metric + '. Mixing zero errors with a business metric hides which one failed.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Tech-debt cleanup stays out of this scope. It adds days and ships no feature.',
            riskLine.en
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'I need the scope locked by ' + ctx.pm.name + ', and the pre-deploy checklist from ' + ctx.auditor.name + '.'
          ] }
        ],
        items: [
          item(seed + 'd1', ctx.dev.name, 'today', 'Pin the API contract on one page'),
          item(seed + 'd2', ctx.dev.name, 'day 2', 'Write three test cases'),
          item(seed + 'd3', ctx.dev.name, 'day 1', 'Confirm the deploy and rollback steps')
        ],
        claims: [
          { role: 'dev', quote: 'the API contract on one page', problem: 'response examples and error codes are missing, so QA reads the same thing twice.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  /* The design, video and sales seats were appointed for the three departments
     that used to open empty. Each one reasons in its own craft, and each one
     leaves a concrete deliverable behind (see buildOutputs). */
  function buildDesign(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 53;
    var mod = ctx.mods.design[ctx.lang];
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '이 안건은 화면에서 무엇을 먼저 보게 할지의 문제입니다. 요소를 더하기 전에 순서를 정합니다.',
            josa(a.noun, '을를') + ' 한 화면에 담는다면 결정 지점은 하나여야 합니다. ' + mod + ' 확인합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '한 화면에 주장 한 줄, 근거 세 줄, 행동 버튼 하나. 이 셋을 넘으면 다음 화면으로 넘깁니다.',
            '판단은 ' + a.metric + ' 하나로 합니다. 시안 두 개를 같은 과업으로 비교하고, 5명이 끝내는지 봅니다.',
            '브랜드 색과 타이포는 기존 값을 그대로 씁니다. 화면마다 새로 정하면 일관성이 먼저 깨집니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '취향으로 고르면 두 주 뒤에 다시 바꿉니다. 기준을 문서로 남기지 않으면 같은 회의를 반복합니다.',
            '빈 화면과 오류 화면을 빼고 넘기면 사용자는 첫 화면에서 멈춥니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 이 화면을 볼 사용자 5명, ' + ctx.growth.name + '에게 실제 문의 문장 3개를 요청합니다. 두 자료가 없으면 시안 비교를 시작하지 않습니다.'
          ] }
        ],
        items: [
          item(seed + 'd1', ctx.design.name, '오늘', '같은 과업으로 시안 2안 제작'),
          item(seed + 'd2', ctx.design.name, '2일차', '사용자 5명 과업 완료율 기록'),
          item(seed + 'd3', ctx.design.name, '1일차', '브랜드 색·타이포 기준 1장')
        ],
        claims: [
          { role: 'design', quote: '한 화면에 결정 지점 하나', problem: '누구에게 보여줄지 대상이 없습니다. 대상이 없으면 비교가 취향이 됩니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'This is a question of what the screen shows first. Order comes before another element.',
            'If it has to fit one screen, there is one decision point. ' + mod + '.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'One claim, three supporting lines, one button. Anything past that moves to the next screen.',
            'Judge it on one measure, ' + a.metric + ': two directions, the same task, five people.',
            'Keep the existing brand color and type. Re-deciding them per screen breaks consistency first.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Choosing by taste means redoing it in two weeks. Without written criteria, we hold this meeting again.',
            'Skipping empty and error states stops the user on their first screen.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'Five users for this screen from ' + ctx.pm.name + ', and three real inquiry sentences from ' + ctx.growth.name + '. Without both, the comparison should not start.'
          ] }
        ],
        items: [
          item(seed + 'd1', ctx.design.name, 'today', 'Two directions on the same task'),
          item(seed + 'd2', ctx.design.name, 'day 2', 'Task completion for five users'),
          item(seed + 'd3', ctx.design.name, 'day 1', 'One-page color and type basis')
        ],
        claims: [
          { role: 'design', quote: 'one decision point per screen', problem: 'the audience is not named. Without an audience the comparison is taste.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildVideo(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 61;
    var mod = ctx.mods.video[ctx.lang];
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '영상은 첫 5초에서 판단됩니다. 60초를 새로 찍기 전에, 지금 있는 소재로 끝낼 수 있는 한 편을 먼저 봅니다.',
            '목표는 노출이 아니라 끝까지 본 비율입니다. ' + mod + ' 잡습니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '60초 한 편: 첫 5초에 결론, 15초에 근거, 마지막 10초에 다음 행동. 장면은 세 개를 넘기지 않습니다.',
            '같은 소재를 유튜브와 숏폼에 다르게 잘라 씁니다. 새로 찍는 건 한 번만 합니다.',
            '끝까지 본 비율과 다시 본 구간 두 개만 기록합니다. 조회수는 판단 기준으로 쓰지 않습니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '촬영부터 늘리면 다시 쓸 소재가 남지 않습니다. 편집에서 끝나는 한 편을 먼저 만듭니다.',
            '썸네일과 제목이 없으면 첫 5초를 고쳐도 아무도 누르지 않습니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.design.name + '에게 썸네일 2안, ' + ctx.cfo.name + '에게 촬영비와 편집비를 나눈 상한을 요청합니다.'
          ] }
        ],
        items: [
          item(seed + 'v1', ctx.video.name, '오늘', '60초 편집본 1편 완성'),
          item(seed + 'v2', ctx.video.name, '1일차', '첫 5초 3안·썸네일 2안 제작'),
          item(seed + 'v3', ctx.video.name, '2일차', '끝까지 본 비율 기록표')
        ],
        claims: [
          { role: 'video', quote: '첫 5초에 결론', problem: '썸네일과 제목이 아직 없습니다. 첫 5초보다 먼저 눌러야 들어옵니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'A video is judged in its first five seconds. Before shooting a new one, we finish one cut from the footage we have.',
            'The goal is completion rate, not reach. ' + mod + '.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Sixty seconds: the point in five, the evidence at fifteen, the next step in the last ten. Three scenes, no more.',
            'One shoot, cut twice: a longer edit for YouTube, a short one for feeds.',
            'Record completion rate and the two replayed moments. Views are not the measure.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Shooting more leaves no reusable footage. Finish the cut that ends in the edit first.',
            'With no thumbnail or title, a better first five seconds still gets no click.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'Two thumbnails from ' + ctx.design.name + ', and a split shoot/edit cap from ' + ctx.cfo.name + '.'
          ] }
        ],
        items: [
          item(seed + 'v1', ctx.video.name, 'today', 'Finish the 60-second cut'),
          item(seed + 'v2', ctx.video.name, 'day 1', 'Three first-five-second versions, two thumbnails'),
          item(seed + 'v3', ctx.video.name, 'day 2', 'Completion-rate log')
        ],
        claims: [
          { role: 'video', quote: 'the point in five seconds', problem: 'there is no thumbnail or title yet. The click comes before the first five seconds.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildSales(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 71;
    var mod = ctx.mods.sales[ctx.lang];
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '새 리드를 늘리기 전에 이미 문의가 온 건부터 봅니다. 이번에 정할 것은 어느 건을 먼저 밀지입니다.',
            '이기는 방식도 같이 정합니다. ' + mod + ' 확인합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '제안서는 한 장입니다: 고객이 물은 것 → 다음 단계 → 금액과 기간. 이 세 칸을 넘으면 읽히지 않습니다.',
            '할인은 한도 안에서만 씁니다. 한도를 먼저 정하지 않으면 마지막에 단가로 협상합니다.',
            '판단은 계약 전환 건수(' + a.metric + ')로 합니다. 미팅 수는 성과로 세지 않습니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '할인으로 이기면 다음 계약도 할인으로 시작합니다. 기준 단가를 먼저 지킵니다.',
            '후속 연락 담당과 날짜가 없으면 파이프라인은 그 자리에서 멈춥니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.cfo.name + '에게 할인 한도와 결제 조건, ' + ctx.growth.name + '에게 이번 달 문의 출처를 요청합니다.'
          ] }
        ],
        items: [
          item(seed + 's1', ctx.sales.name, '오늘', '제안서 한 장 템플릿 작성'),
          item(seed + 's2', ctx.sales.name, '1일차', '반론 3개와 답변 정리'),
          item(seed + 's3', ctx.sales.name, '2일차', '문의 건별 다음 단계·날짜 지정')
        ],
        claims: [
          { role: 'sales', quote: '제안서 한 장', problem: '누가 언제 후속 연락하는지가 없습니다. 단계만 있고 날짜가 없습니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'Before adding leads, I look at the customers who already asked. This meeting decides which deal goes first.',
            'We also decide how we win. ' + mod + '.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'One page: what the customer asked, the next step, price and term. More than three blocks and it is not read.',
            'Discount only inside a set limit. Without the limit first, the last conversation is about price.',
            'Measure deals closed (' + a.metric + '), not meetings held.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Winning on discount starts the next contract at a discount. Hold the base price first.',
            'With no owner and date for follow-up, the pipeline stops right there.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'A discount limit and payment terms from ' + ctx.cfo.name + ', and this month’s inquiry sources from ' + ctx.growth.name + '.'
          ] }
        ],
        items: [
          item(seed + 's1', ctx.sales.name, 'today', 'One-page proposal template'),
          item(seed + 's2', ctx.sales.name, 'day 1', 'Three objections and the answers'),
          item(seed + 's3', ctx.sales.name, 'day 2', 'Next step and date for every open deal')
        ],
        claims: [
          { role: 'sales', quote: 'a one-page proposal', problem: 'no follow-up owner or date is named. The stage exists, the date does not.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildGrowthOps(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 41;
    var mod = ctx.mods.growth[ctx.lang];
    var words = {
      infra: { ko: '상태 페이지 문구', en: 'status-page note', trackKo: '오류 재현 경로', trackEn: 'error reproduction path', countKo: '주간 오류 문의', countEn: 'error questions' },
      hiring: { ko: '채용 공고', en: 'job post', trackKo: '지원 경로', trackEn: 'application source', countKo: '주간 지원자', countEn: 'applicants' },
      security: { ko: '권한 정리 공지', en: 'access notice', trackKo: '권한 예외', trackEn: 'access exceptions', countKo: '주간 예외', countEn: 'exceptions' }
    }[a.domain] || { ko: '안내문', en: 'notice', trackKo: '문의 유입 경로', trackEn: 'question sources', countKo: '주간 반복 문의', countEn: 'repeat questions' };
    var doc = ko ? words.ko : words.en;
    var track = ko ? words.trackKo : words.trackEn;
    var weekly = ko ? words.countKo : words.countEn;
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '이 안건에서 먼저 볼 것은 클릭이 아니라 반복되는 문의와 신청입니다.',
            '바뀐 내용을 한 장으로 정리해 영향받는 사람에게 먼저 보냅니다. ' + mod + ' 확인합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            doc + '는 한 줄 제목과 3단계로만 씁니다. 예: "' + a.hook + '".',
            '같은 문의가 3번 오면 ' + doc + '를 고칩니다. 문의 수를 그대로 기록합니다.',
            '확산은 이미 반응이 있는 채널 하나에서만 시작합니다. 여러 곳에 동시에 뿌리면 원인을 모릅니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '광고를 켜도 이 안건의 병목은 풀리지 않습니다. 유입이 아니라 안내가 문제입니다.',
            '안내 후에도 문의가 줄지 않으면 원인은 문구가 아니라 절차입니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 영향받는 사람 목록, ' + ctx.cfo.name + '에게 이번 달 관련 지출 항목을 요청합니다.'
          ] }
        ],
        items: [
          item(seed + 'o1', ctx.growth.name, '오늘', doc + ' 1장 작성'),
          item(seed + 'o2', ctx.growth.name, '1일차', track + ' 기록'),
          item(seed + 'o3', ctx.growth.name, '이번 주 금요일', weekly + ' 집계')
        ],
        claims: [
          { role: 'growth', quote: doc + ' 1장', problem: '누구에게 보낼지 목록이 없습니다. 대상이 없으면 안내는 전달되지 않습니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'The thing to watch here is repeat questions and requests, not clicks.',
            'Put the change on one page and send it to the people affected first, ' + mod + '.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'One title, three steps. Example: “' + a.hook + '.”',
            'If the same question arrives three times, fix the ' + doc + '. Count the questions as they are.',
            'Start in one channel that already answers. Several at once hides the cause.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Ads do not clear this bottleneck. The problem is the notice, not traffic.',
            'If questions do not drop after the notice, the cause is the process, not the wording.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'A list of affected people from ' + ctx.pm.name + ', and this month’s related spend from ' + ctx.cfo.name + '.'
          ] }
        ],
        items: [
          item(seed + 'o1', ctx.growth.name, 'today', 'Write the ' + doc),
          item(seed + 'o2', ctx.growth.name, 'day 1', 'Log the ' + track),
          item(seed + 'o3', ctx.growth.name, 'Friday', 'Weekly count of ' + weekly)
        ],
        claims: [
          { role: 'growth', quote: 'the ' + doc, problem: 'the list of who receives it is missing. Without recipients it never lands.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildGrowth(a, ctx, be) {
    if (!a.funnel) return buildGrowthOps(a, ctx);
    var seed = ctx.seed + 31;
    var mod = ctx.mods.growth[ctx.lang];
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '돈을 먼저 넣을 곳은 ' + a.channel + '입니다. 여기서 문구가 안 먹히면 다른 채널에서도 안 먹힙니다.',
            '판단은 클릭 수가 아니라 ' + josa(a.metric, '으로') + ' 합니다. ' + mod + ' 확인합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '문구는 한 줄로 고정합니다. 예: "' + a.hook + '".',
            '예산 ' + money(a.budget, 'ko', a.currency) + ' 기준으로 방문 ' + num(be.visitors, 'ko') + '명이 필요합니다. 채널 단가를 모르면 예산을 나누지 않습니다.',
            '측정은 랜딩 → 신청 두 단계만 봅니다. 중간 단계를 늘리면 원인을 못 찾습니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '광고를 먼저 켜면 학습 데이터 없이 예산을 태웁니다. 유기 채널에서 문구부터 검증합니다.',
            '도달만 보고 판단하면 전환 0%인 캠페인을 계속 돌립니다. 중단 기준을 오늘 정합니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 랜딩 문구 2안, ' + ctx.cfo.name + '에게 채널별 허용 단가를 요청합니다.'
          ] }
        ],
        items: [
          item(seed + 'g1', ctx.growth.name, '오늘', '랜딩 헤드라인 2안 작성'),
          item(seed + 'g2', ctx.growth.name, '1일차', '채널별 단가표 1장'),
          item(seed + 'g3', ctx.growth.name, '이번 주 금요일', '주간 전환 리포트 1장')
        ],
        claims: [
          { role: 'growth', quote: '방문 ' + num(be.visitors, 'ko') + '명이 필요합니다', problem: '채널 단가와 도달 가능성이 빠져 있습니다. 숫자만으로는 실행이 안 됩니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'The first money goes to ' + a.channel + '. If the message fails there it will fail elsewhere.',
            'In ' + a.noun + ' I read ' + a.metric + ', not clicks, ' + mod + '.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Fix one line: \u201c' + a.hook + '.\u201d',
            'A budget of ' + money(a.budget, 'en', a.currency) + ' needs ' + num(be.visitors, 'en') + ' visits. Without channel cost I will not split the budget.',
            'Measure two steps only: landing page to sign-up. More steps hide the cause.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Turning on ads first burns budget with no learning data. Prove the copy in an organic channel first.',
            'Reach alone keeps a 0% campaign running. Set the stop rule today.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'Two landing options from ' + ctx.pm.name + ', and an allowed cost per channel from ' + ctx.cfo.name + '.'
          ] }
        ],
        items: [
          item(seed + 'g1', ctx.growth.name, 'today', 'Write two landing headlines'),
          item(seed + 'g2', ctx.growth.name, 'day 1', 'One-page cost table by channel'),
          item(seed + 'g3', ctx.growth.name, 'Friday', 'Weekly conversion report')
        ],
        claims: [
          { role: 'growth', quote: num(be.visitors, 'en') + ' visits needed', problem: 'channel cost and reach are missing, so the number cannot be executed.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildCfoOps(a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 77;
    var view = {
      ko: a.domain === 'hiring'
        ? '채용은 사람을 늘리는 지출입니다. 공고비·면접 시간·온보딩 4주를 비용으로 잡습니다.'
        : a.domain === 'infra'
          ? '장애 대응은 지출보다 손실이 큽니다. 대응 시간과 매출 손실을 나눠 봅니다.'
          : a.domain === 'security'
            ? '권한 정리는 비용이 거의 시간입니다. 늦출수록 사고 비용이 커집니다.'
            : '이 안건은 새 지출보다 줄이는 쪽에 가깝습니다. 그래서 회수 계산 대신 비용 항목부터 봅니다.',
      en: a.domain === 'hiring'
        ? 'A hire is new spend: the job post, interview hours and four weeks of onboarding.'
        : a.domain === 'infra'
          ? 'Incidents cost more in loss than in spend. Split response hours from lost revenue.'
          : a.domain === 'security'
            ? 'Access cleanup costs mostly hours. Delay raises the cost of an incident.'
            : 'This agenda is about cutting, not new spend. So I start with cost lines instead of payback math.'
    };
    var flagLine = {
      ko: a.flags.privacy
        ? '개인정보를 다루면 수집·보관·파기 절차가 먼저입니다. 비용이 아니라 조건입니다.'
        : a.flags.payment
          ? '환불·약관을 먼저 확인합니다. 나중에 고치면 환불 요구가 먼저 옵니다.'
          : (a.flags.security || a.flags.legal)
            ? '권한과 계약 조항을 먼저 확인합니다. 이 둘은 나중에 못 붙입니다.'
            : '줄이는 일은 사람 시간을 먼저 씁니다. 누가 몇 시간 쓸지 정해야 합니다.',
      en: a.flags.privacy
        ? 'If personal data is involved, the collection and deletion process comes first. It is a condition, not a cost.'
        : a.flags.payment
          ? 'Check refund and terms wording first. Fixing it later brings refund claims first.'
          : (a.flags.security || a.flags.legal)
            ? 'Check access and contract clauses first. Neither can be added later.'
            : 'The cost here is people’s hours. Name who spends how many.'
    };
    var lastItem = a.flags.privacy
      ? (ko ? '개인정보 수집·파기 확인' : 'Confirm the data collection and deletion')
      : a.flags.payment
        ? (ko ? '환불·약관 확인' : 'Check refund and terms')
        : (a.flags.security || a.flags.legal)
          ? (ko ? '권한·계약 조항 확인' : 'Check access and contract clauses')
          : (ko ? '사람 시간 배분 확인' : 'Confirm who spends the hours');
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [view.ko, '안건에 예산 숫자가 없습니다. 이번 달 실제 지출을 받기 전에는 상한을 정하지 않습니다.'] },
          { kind: 'plan', title: '제안', lines: [
            '비용을 고정비·외주·대응 시간 세 칸으로 나눕니다. 세 칸이 다 채워져야 절감액이 계산됩니다.',
            '줄이는 항목은 이번 달 청구서로 확인합니다. 추정으로 승인하지 않습니다.',
            '예비비는 15%만 두고, 광고가 아니라 환불·장애·추가 인력에 씁니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '숫자 없이 “절감”을 말하면 다음 회의에서 다시 계산합니다.',
            flagLine.ko
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 이번 달 지출 항목, ' + ctx.growth.name + '에게 관련 처리 건수를 받아야 승인할 수 있습니다.'
          ] }
        ],
        items: [
          item(seed + 'v1', ctx.cfo.name, '오늘', '이번 달 지출 3개 항목 확인'),
          item(seed + 'v2', ctx.cfo.name, '1일차', '예비비 15% 별도 계상'),
          item(seed + 'v3', ctx.cfo.name, '3일차', lastItem)
        ],
        claims: [
          { role: 'cfo', quote: '예비비 15%', problem: '기준이 되는 이번 달 지출이 아직 없습니다. 비율만으로는 금액을 못 정합니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [view.en, 'The agenda gives no budget. I will not set a cap before this month’s actual spend.'] },
          { kind: 'plan', title: 'Plan', lines: [
            'Three cost lines: fixed tools, contractors, response hours. All three must be filled before any saving is real.',
            'Confirm cuts against this month’s invoice, not an estimate.',
            'Hold a 15% contingency for refunds, incidents and extra hours — not for ads.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            '“Savings” without numbers gets recalculated at the next meeting.',
            flagLine.en
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'This month’s cost lines from ' + ctx.pm.name + ' and related case counts from ' + ctx.growth.name + ' before I approve.'
          ] }
        ],
        items: [
          item(seed + 'v1', ctx.cfo.name, 'today', 'Confirm three cost lines for this month'),
          item(seed + 'v2', ctx.cfo.name, 'day 1', 'Carry a 15% contingency'),
          item(seed + 'v3', ctx.cfo.name, 'day 3', lastItem)
        ],
        claims: [
          { role: 'cfo', quote: 'a 15% contingency', problem: 'the monthly spend it is based on is not in the minutes. A rate without a base sets no amount.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildCfo(a, ctx, be) {
    if (!a.funnel) return buildCfoOps(a, ctx);
    var seed = ctx.seed + 67;
    var ko = ctx.lang === 'ko';
    var moneyTxt = money(a.budget, ctx.lang, a.currency);
    var priceTxt = money(a.price, ctx.lang, a.currency);
    var assumeLabels = a.assumed.map(function (k) {
      return {
        ko: { budget: '예산', price: '객단가', conv: '전환율', target: '목표 건수', period: '기간' },
        en: { budget: 'the budget', price: 'price per order', conv: 'conversion rate', target: 'target count', period: 'time frame' }
      }[ko ? 'ko' : 'en'][k];
    });
    var assumeLine;
    if (assumeLabels.length) {
      assumeLine = ko
        ? '안건에 없는 ' + josa(assumeLabels.join('·'), '은는') + ' 가정값입니다. 실제 값으로 바꾸면 결론이 달라집니다.'
        : 'Missing from the agenda: ' + assumeLabels.join(', ') + '. I assumed ' + (assumeLabels.length > 1 ? 'them' : 'it') + '; real figures change the conclusion.';
    } else {
      assumeLine = ko
        ? '안건에 적힌 숫자를 그대로 썼습니다. 숫자가 바뀌면 다시 계산해야 합니다.'
        : 'These figures come from the agenda. Change them and the math changes.';
    }
    var flagLine;
    if (a.flags.privacy) {
      flagLine = ko
        ? '개인정보를 수집하면 항목·보관 기간·파기 절차를 먼저 정해야 합니다. 비용이 아니라 진행 조건입니다.'
        : 'If personal data is collected, define what is stored, for how long and when it is deleted. That is a condition, not a cost.';
    } else if (a.flags.payment) {
      flagLine = ko
        ? '결제·환불 약관을 먼저 확인합니다. 나중에 고치면 환불 요구가 먼저 옵니다.'
        : 'Check the payment and refund terms first. Fixing them later brings refund claims first.';
    } else if (a.flags.legal || a.flags.security) {
      flagLine = ko
        ? '계약서의 해지·책임 조항과 접근 권한을 확인합니다. 이 두 개는 나중에 못 붙입니다.'
        : 'Check the termination and liability clauses and who has access. Neither can be added later.';
    } else {
      flagLine = ko
        ? '매출이 나중에 잡히면 현금이 먼저 마릅니다. 첫 4주는 선지출로 봅니다.'
        : 'Revenue lands later than the spend. Treat the first four weeks as cash out.';
    }

    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '예산 ' + josa(moneyTxt, '으로') + ' 계산했습니다. 가정은 객단가 ' + priceTxt + ', 전환 ' + pct(a.conv) + '입니다.',
            assumeLine
          ] },
          { kind: 'plan', title: '제안', lines: [
            '회수에 필요한 방문은 ' + num(be.visitors, 'ko') + '명입니다. ' + moneyTxt + ' ÷ (' + priceTxt + ' × ' + pct(a.conv) + ') = ' + num(be.visitors, 'ko') + '명.',
            '주간 방문이 이보다 적으면 예산을 줄이거나 전환을 먼저 올려야 합니다. 둘 다 안 되면 이번 분기에는 하지 않는 게 맞습니다.',
            '승인 상한은 ' + moneyTxt + '이고, 항목별로 넘길 때는 다시 승인받는 조건으로 둡니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '숨은 비용을 예산의 15%로 잡습니다. 도구 구독, 외주, 환불·CS가 여기 들어갑니다.',
            flagLine
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 목표 건수, ' + ctx.growth.name + '에게 채널별 단가를 받아야 승인할 수 있습니다.'
          ] }
        ],
        items: [
          item(seed + 'c1', ctx.cfo.name, '오늘', '예산 상한 ' + moneyTxt + ' 확정'),
          item(seed + 'c2', ctx.cfo.name, '1일차', '예비비 15% 별도 계상'),
          item(seed + 'c3', ctx.cfo.name, '3일차',
            a.flags.privacy ? '개인정보 수집·파기 절차 확인'
              : a.flags.payment ? '환불·약관 문구 검토' : '고정비 목록 확인')
        ],
        claims: [
          { role: 'cfo', quote: moneyTxt + ' ÷ (' + priceTxt + ' × ' + pct(a.conv) + ') = ' + num(be.visitors, 'ko') + '명', kind: 'math', value: be.visitors, problem: '가정값 표시와 반올림 기준이 빠져 있습니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'I ran this on ' + moneyTxt + ', assuming ' + priceTxt + ' per order and ' + pct(a.conv) + ' conversion.',
            assumeLine
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Payback needs ' + num(be.visitors, 'en') + ' visits. ' + moneyTxt + ' ÷ (' + priceTxt + ' × ' + pct(a.conv) + ') = ' + num(be.visitors, 'en') + ' visits.',
            'If weekly traffic is below that, cut the budget or lift conversion first. If neither is possible, this is not a this-quarter project.',
            'The approved cap is ' + moneyTxt + '. Anything above it comes back for approval line by line.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Hold a 15% contingency. Tool subscriptions, contractors, refunds and support come out of it.',
            flagLine
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'I need the target count from ' + ctx.pm.name + ' and cost per channel from ' + ctx.growth.name + ' before approving.'
          ] }
        ],
        items: [
          item(seed + 'c1', ctx.cfo.name, 'today', 'Confirm the ' + moneyTxt + ' cap'),
          item(seed + 'c2', ctx.cfo.name, 'day 1', 'Carry a 15% contingency'),
          item(seed + 'c3', ctx.cfo.name, 'day 3',
            a.flags.privacy ? 'Confirm the data collection and deletion process'
              : a.flags.payment ? 'Review refund and terms wording' : 'List fixed monthly costs')
        ],
        claims: [
          { role: 'cfo', quote: moneyTxt + ' ÷ (' + priceTxt + ' × ' + pct(a.conv) + ') = ' + num(be.visitors, 'en') + ' visits', kind: 'math', value: be.visitors, problem: 'the assumptions and rounding rule are not marked.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildAuditor(a, ctx, be, prior) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 97;
    var pmClaim = (prior.pm.claims && prior.pm.claims[0]) || { quote: '', problem: '' };
    var dClaim = (prior.dev && prior.dev.claims && prior.dev.claims[0]) || { quote: '', problem: '' };
    var dzClaim = (prior.design && prior.design.claims && prior.design.claims[0]) || { quote: '', problem: '' };
    var vClaim = (prior.video && prior.video.claims && prior.video.claims[0]) || { quote: '', problem: '' };
    var gClaim = (prior.growth.claims && prior.growth.claims[0]) || { quote: '', problem: '' };
    var sClaim = (prior.sales && prior.sales.claims && prior.sales.claims[0]) || { quote: '', problem: '' };
    var cClaim = (prior.cfo.claims && prior.cfo.claims[0]) || { quote: '', problem: '' };
    var verified = be.visitors === cClaim.value;
    var auditKoLines = [];
    var auditEnLines = [];
    [
      [ctx.pm.name, pmClaim], [ctx.dev.name, dClaim], [ctx.design.name, dzClaim],
      [ctx.video.name, vClaim], [ctx.growth.name, gClaim], [ctx.sales.name, sClaim],
      [ctx.cfo.name, cClaim]
    ].forEach(function (pair) {
      var name = pair[0];
      var c = pair[1] || {};
      if (!c.quote) return;
      if (c.kind === 'math') {
        auditKoLines.push(name + ': ' + c.quote + ' — 재계산해도 ' + num(be.visitors, 'ko') + '명으로 ' + (verified ? '맞습니다' : '다릅니다') + '. 다만 가정값 표시와 반올림 기준을 적어야 합니다.');
        auditEnLines.push(name + ': ' + c.quote + ' — my recomputation gives ' + num(be.visitors, 'en') + ' visits, so the math is ' + (verified ? 'correct' : 'off') + '. The assumptions and the rounding rule still need a note.');
      } else {
        auditKoLines.push(name + ': “' + c.quote + '” — ' + c.problem);
        auditEnLines.push(name + ': \u201c' + c.quote + '\u201d — ' + c.problem);
      }
    });
    var auditCount = auditKoLines.length;
    var cond2 = a.flags.risk
      ? (ko ? '개인정보·권한 액션을 담당과 함께 추가' : 'an owner for the data and access actions')
      : (ko ? '중단 기준을 회의록에 남기기' : 'a stop rule written into the minutes');

    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '앞선 ' + auditCount + '개 답변을 숫자, 출처, 책임 기준으로 다시 봤습니다. 결론은 조건부 승인입니다.',
            '바로 진행하면 두 군데에서 다시 돌아옵니다. 그 두 개만 먼저 채우면 됩니다.'
          ] },
          { kind: 'audit', title: '검수 지적', lines: auditKoLines },
          { kind: 'risk', title: '리스크', lines: [
            '액션의 담당이 전부 역할 이름입니다. 사람 이름으로 바꾸지 않으면 아무도 시작하지 않습니다.',
            a.flags.risk
              ? '개인정보·권한 관련 액션이 하나도 없습니다. 이건 나중에 붙일 수 없습니다. 그래서 제가 하나 추가했습니다.'
              : '지금 액션에는 중단 기준이 없습니다. 그래서 제가 하나 추가했습니다. 숫자가 안 나올 때 언제 멈출지 정해야 합니다.'
          ] },
          { kind: 'verdict', title: '판정', lines: [
            '진행 조건 2개: ① ' + a.metric + '의 현재값을 오늘 기록 ② ' + cond2 + '.',
            '이 둘이 없으면 다음 회의에서 같은 얘기를 다시 합니다.'
          ] }
        ],
        items: [
          item(seed + 'a1', ctx.auditor.name, '오늘', '지표 현재값 기록 확인'),
          item(seed + 'a2', ctx.auditor.name, '2일차', a.flags.risk ? '개인정보·권한 액션 추가' : '중단·롤백 기준 문서화'),
          item(seed + 'a3', ctx.auditor.name, '1일차', '담당자를 사람 이름으로 지정')
        ],
        claims: [
          { role: 'auditor', quote: '조건부 승인', problem: '조건 2개가 남아 있습니다.' }
        ]
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'I re-read the ' + auditCount + ' answers above against numbers, sources and owners. The verdict is a conditional yes.',
            'Ship it as written and it comes back twice. Fix two things first and it holds.'
          ] },
          { kind: 'audit', title: 'Audit', lines: auditEnLines },
          { kind: 'risk', title: 'Risk', lines: [
            'Every action is owned by a role, not a person. Without a name nobody starts.',
            a.flags.risk
              ? 'No action covers data or access. That cannot be bolted on later. I added one.'
              : 'No stop rule was in the actions, so I added one. Decide when the number is bad enough to stop.'
          ] },
          { kind: 'verdict', title: 'Verdict', lines: [
            'Two conditions: 1) record today\u2019s value of ' + a.metric + ' 2) ' + cond2 + '.',
            'Without both, the next meeting repeats this one.'
          ] }
        ],
        items: [
          item(seed + 'a1', ctx.auditor.name, 'today', 'Confirm the metric\u2019s starting value is recorded'),
          item(seed + 'a2', ctx.auditor.name, 'day 2', a.flags.risk ? 'Add data and access actions' : 'Write the stop and rollback rule'),
          item(seed + 'a3', ctx.auditor.name, 'day 1', 'Replace role owners with names')
        ],
        claims: [
          { role: 'auditor', quote: 'conditional yes', problem: 'two conditions remain open.' }
        ]
      }
    };
    return t[ctx.lang];
  }

  function buildExtra(role, a, ctx) {
    var ko = ctx.lang === 'ko';
    var seed = ctx.seed + 13 + (role.index || 0);
    var focus = role.focus || (ko ? '실행 조건' : 'execution conditions');
    var due = ko ? '오늘' : 'today';
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '저는 ' + focus + ' 쪽에서 봤습니다. 앞선 답변과 겹치는 부분은 빼겠습니다.',
            josa(a.noun, '을를') + ' 진행하면서 이 부분이 비어 있으면 나중에 다시 모여야 합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '오늘 확인할 숫자 2개: ' + focus + '의 현재값과 목표값.',
            '체크 항목 3개만 정하고 시작합니다. 그 이상은 이번 회의에서 정하지 않습니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            a.noun + '을 먼저 끝내고 ' + focus + '를 나중에 붙이면 되돌리는 비용이 큽니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.pm.name + '에게 이 항목의 담당과 기한을 요청합니다.'
          ] }
        ],
        items: [
          item(seed + 'x1', role.name, due, focus + ' 현재값 확인'),
          item(seed + 'x2', role.name, ko ? '2일차' : 'day 2', focus + ' 체크 항목 3개 정리')
        ],
        claims: []
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'I am looking at ' + focus + '. I will skip what the others already covered.',
            'If this is empty while ' + a.noun + ' moves, we meet again later to fix it.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Two numbers to check today: the current and target value for ' + focus + '.',
            'Agree three check items only. Anything more is a separate meeting.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Finishing ' + a.noun + ' before ' + focus + ' makes the rollback expensive.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'I need an owner and a date from ' + ctx.pm.name + ' for this item.'
          ] }
        ],
        items: [
          item(seed + 'x1', role.name, due, 'Check the current value for ' + focus),
          item(seed + 'x2', role.name, 'day 2', 'Agree three check items for ' + focus)
        ],
        claims: []
      }
    };
    return t[ctx.lang];
  }

  function generateRound(opts) {
    var agenda = opts && opts.agenda;
    var room = (opts && opts.room) || 'general';
    var lang = opts && opts.lang === 'en' ? 'en' : 'ko';
    var roles = (opts && opts.roles) || [];
    var round = (opts && opts.round) || 1;
    var a = analyze(agenda, lang);
    if (a.empty) a = analyze(lang === 'en' ? 'We need to decide what to do this week.' : '이번 주에 무엇을 할지 정해야 합니다.', lang);
    var be = breakEven(a);
    var seedBase = hash(a.raw + '|' + room + '|' + lang + '|' + round + '|' + (opts && opts.seed || 0));

    function roleOf(kind, fallbackIndex) {
      var found = roles.filter(function (r) { return r.kind === kind; })[0];
      return found || roles[fallbackIndex] || roles[0] || { name: kind, tag: kind, kind: kind };
    }
    var pm = roleOf('pm', 0);
    var dev = roleOf('dev', 1);
    var design = roleOf('design', 2);
    var video = roleOf('video', 3);
    var growth = roleOf('growth', 4);
    var sales = roleOf('sales', 5);
    var cfo = roleOf('cfo', 6);
    var auditor = roleOf('auditor', 7);
    var ctx = {
      lang: lang,
      room: room,
      mods: roomMods(room, lang, opts && opts.roomName),
      seed: seedBase,
      pm: pm, dev: dev, design: design, video: video,
      growth: growth, sales: sales, cfo: cfo, auditor: auditor,
      agenda: agenda
    };

    var parts = {};
    if (round <= 1) {
      parts[pm.id] = buildPm(a, ctx);
      parts[dev.id] = buildDev(a, ctx);
      parts[design.id] = buildDesign(a, ctx);
      parts[video.id] = buildVideo(a, ctx);
      parts[growth.id] = buildGrowth(a, ctx, be);
      parts[sales.id] = buildSales(a, ctx);
      parts[cfo.id] = buildCfo(a, ctx, be);
      parts[auditor.id] = buildAuditor(a, ctx, be, {
        pm: parts[pm.id], dev: parts[dev.id], design: parts[design.id],
        video: parts[video.id], growth: parts[growth.id], sales: parts[sales.id],
        cfo: parts[cfo.id]
      });
    } else {
      parts[pm.id] = buildSecondPm(a, ctx);
      parts[dev.id] = buildSecondDev(a, ctx);
      parts[design.id] = buildSecondDesign(a, ctx);
      parts[video.id] = buildSecondVideo(a, ctx);
      parts[growth.id] = buildSecondGrowth(a, ctx, be);
      parts[sales.id] = buildSecondSales(a, ctx);
      parts[cfo.id] = buildSecondCfo(a, ctx);
      parts[auditor.id] = buildSecondAuditor(a, ctx, be);
    }
    roles.forEach(function (r) {
      if (!parts[r.id]) parts[r.id] = buildExtra(r, a, ctx);
    });

    var messages = [];
    var items = [];
    roles.forEach(function (r, i) {
      var p = parts[r.id];
      if (!p) return;
      var msg = {
        id: uid('msg', seedBase + '|' + r.id + '|' + round),
        roleId: r.id,
        kind: r.kind,
        name: r.name,
        tag: r.tag || '',
        glyph: r.glyph || (r.name || '?').slice(0, 1).toUpperCase(),
        accent: r.accent || '#2563eb',
        mode: 'free',
        round: round,
        replyTo: null,
        blocks: p.blocks,
        claims: p.claims || [],
        itemIds: (p.items || []).map(function (x) { return x.id; }),
        ts: 0
      };
      messages.push(msg);
      (p.items || []).forEach(function (x) { items.push(x); });
    });
    return { messages: messages, items: items, analysis: a, breakEven: be };
  }

  /* ── round two (continue the meeting) ───────────────────────────────── */

  function buildSecondDesign(a, ctx) {
    var ko = ctx.lang === 'ko';
    return ko ? {
      blocks: [
        { kind: 'view', title: '관점', lines: [
          '2라운드에서는 새 시안을 만들지 않습니다. 고른 안의 적용 범위만 정합니다.'
        ] },
        { kind: 'plan', title: '제안', lines: [
          '적용 범위는 버튼·차트·빈 화면 세 곳입니다. 나머지는 다음 분기로 넘깁니다.',
          '적용일은 다음 주 첫 영업일, 확인은 적용 뒤 사용자 5명 재테스트로 합니다.'
        ] },
        { kind: 'risk', title: '리스크', lines: ['범위를 넓히면 QA가 같은 화면을 두 번 봅니다.'] }
      ],
      items: [item(ctx.seed + 'dr1', ctx.design.name, '오늘', '적용 범위 3곳 확정')],
      claims: []
    } : {
      blocks: [
        { kind: 'view', title: 'View', lines: ['Round two adds no new direction. We only fix where the chosen one applies.'] },
        { kind: 'plan', title: 'Plan', lines: [
          'Three places: buttons, charts, empty states. Everything else moves to next quarter.',
          'Live on the first business day next week, re-tested with the same five users.'
        ] },
        { kind: 'risk', title: 'Risk', lines: ['A wider scope means QA reads the same screen twice.'] }
      ],
      items: [item(ctx.seed + 'dr1', ctx.design.name, 'today', 'Fix the three places it applies')],
      claims: []
    };
  }

  function buildSecondVideo(a, ctx) {
    var ko = ctx.lang === 'ko';
    return ko ? {
      blocks: [
        { kind: 'view', title: '관점', lines: ['2라운드에서는 새로 찍지 않습니다. 편집본과 업로드 날짜만 확정합니다.'] },
        { kind: 'plan', title: '제안', lines: [
          '첫 5초는 결론형 한 안으로 고정하고, 썸네일은 두 안 중 하나로 확정합니다.',
          '업로드는 다음 주 화요일, 같은 소재로 숏폼 재편집은 그 다음 날입니다.'
        ] },
        { kind: 'risk', title: '리스크', lines: ['업로드 날짜가 없으면 편집본은 다시 열립니다.'] }
      ],
      items: [item(ctx.seed + 'vr1', ctx.video.name, '오늘', '첫 5초·썸네일 최종 확정')],
      claims: []
    } : {
      blocks: [
        { kind: 'view', title: 'View', lines: ['No new shoot in round two. We lock the cut and the upload date.'] },
        { kind: 'plan', title: 'Plan', lines: [
          'One first-five-seconds version, one of the two thumbnails.',
          'Upload next Tuesday; the short re-cut follows the day after.'
        ] },
        { kind: 'risk', title: 'Risk', lines: ['Without a date the cut gets reopened.'] }
      ],
      items: [item(ctx.seed + 'vr1', ctx.video.name, 'today', 'Lock the first five seconds and thumbnail')],
      claims: []
    };
  }

  function buildSecondSales(a, ctx) {
    var ko = ctx.lang === 'ko';
    return ko ? {
      blocks: [
        { kind: 'view', title: '관점', lines: ['2라운드에서는 새 제안서를 쓰지 않습니다. 보낼 순서와 날짜만 정합니다.'] },
        { kind: 'plan', title: '제안', lines: [
          '문의가 온 건에 날짜를 박습니다. 이번 주 2건, 다음 주 1건으로 나눕니다.',
          '할인 한도는 1라운드 값 그대로 두고, 예외는 대표 승인으로 넘깁니다.'
        ] },
        { kind: 'risk', title: '리스크', lines: ['날짜 없이 순서만 정하면 다음 주에 그대로 밀립니다.'] }
      ],
      items: [item(ctx.seed + 'sr1', ctx.sales.name, '오늘', '문의 건별 발송 날짜 지정')],
      claims: []
    } : {
      blocks: [
        { kind: 'view', title: 'View', lines: ['No new proposal in round two. We set the order and the dates.'] },
        { kind: 'plan', title: 'Plan', lines: [
          'Date every open inquiry: two this week, one next week.',
          'The discount limit stays as round one; exceptions go to the owner for approval.'
        ] },
        { kind: 'risk', title: 'Risk', lines: ['An order without dates slips by next week.'] }
      ],
      items: [item(ctx.seed + 'sr1', ctx.sales.name, 'today', 'Set a send date per inquiry')],
      claims: []
    };
  }

  function buildSecondPm(a, ctx) {
    var ko = ctx.lang === 'ko';
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '2라운드에서는 새 안건을 꺼내지 않습니다. ' + a.decision + '의 적용 시점만 정합니다.',
            '지난 라운드 액션 중 아직 안 끝난 것을 먼저 확인합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '1라운드 액션을 오늘 기준으로 완료/보류 두 칸으로 나눕니다.',
            '적용일은 다음 주 첫 영업일로 고정합니다. 미루면 같은 회의를 또 합니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '2라운드에서 새 아이디어를 꺼내면 범위가 다시 커집니다. 이번 주에는 받지 않습니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.auditor.name + '에게 조건 2개 충족 여부만 다시 확인받겠습니다.'
          ] }
        ],
        items: [item(ctx.seed + 'pmr1', ctx.pm.name, '오늘', '1라운드 액션 완료/보류 분류')],
        claims: []
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'Round two adds no new agenda. We only set the effective date for ' + a.decision + '.',
            'First we check what from round one is still open.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Sort last round\u2019s actions into done and parked, as of today.',
            'Fix the start date to the first business day next week. Moving it repeats this meeting.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'A new idea in round two widens the scope again. Not accepted this week.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'I want ' + ctx.auditor.name + ' to re-check only the two conditions.'
          ] }
        ],
        items: [item(ctx.seed + 'pmr1', ctx.pm.name, 'today', 'Sort round-one actions into done and parked')],
        claims: []
      }
    };
    return t[ctx.lang];
  }

  function buildSecondDev(a, ctx) {
    var ko = ctx.lang === 'ko';
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '2라운드에서는 새 기능을 받지 않습니다. 테스트 범위와 배포 창만 확정합니다.',
            '1라운드에서 고정한 API 계약이 그대로인지 먼저 확인합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '테스트 케이스 3개를 오늘 실행하고, 실패한 것만 남깁니다.',
            '배포는 다음 주 화요일 오전으로 고정합니다. 롤백 담당은 한 명입니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '테스트 없이 배포일만 맞추면 같은 오류를 다음 주에 다시 봅니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.auditor.name + '에게 배포 전 점검 항목 충족 여부만 확인받겠습니다.'
          ] }
        ],
        items: [item(ctx.seed + 'dr1', ctx.dev.name, '2일차', '테스트 케이스 3개 실행')],
        claims: []
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'Round two takes no new features. We lock the test scope and the deploy window only.',
            'First I check that the API contract from round one still holds.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Run the three test cases today and keep only the failures.',
            'The deploy is fixed to Tuesday morning next week. One person owns the rollback.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Hitting the deploy date without tests brings the same error back next week that I fixed this week.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'I want ' + ctx.auditor.name + ' to confirm only the pre-deploy checklist.'
          ] }
        ],
        items: [item(ctx.seed + 'dr1', ctx.dev.name, 'day 2', 'Run the three test cases')],
        claims: []
      }
    };
    return t[ctx.lang];
  }

  function buildSecondGrowth(a, ctx, be) {
    var ko = ctx.lang === 'ko';
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '문구 2안 중 A를 3일 먼저 돌립니다. 전환 ' + pct(a.conv) + ' 아래면 B로 바꿉니다.',
            '예산은 전액 쓰지 않고 ' + money(a.budget * 0.3, 'ko', a.currency) + '만 먼저 집행합니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '3일 단위로 문구와 채널을 하나씩만 바꿉니다. 두 개를 같이 바꾸면 원인을 모릅니다.',
            '방문 ' + num(be.visitors, 'ko') + '명 기준으로 3일 차에 중간 판정을 합니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '3일 안에 판단할 수 없는 채널은 이번 라운드에서 뺍니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.cfo.name + '에게 30% 선집행 승인을 요청합니다.'
          ] }
        ],
        items: [item(ctx.seed + 'gr1', ctx.growth.name, '3일차', 'A/B 문구 1차 판정')],
        claims: []
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'Run copy A for three days first. Below ' + pct(a.conv) + ' conversion, switch to B.',
            'Release only ' + money(a.budget * 0.3, 'en', a.currency) + ' of the budget now.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'Change one thing every three days: copy or channel, never both.',
            'Judge at day three against ' + num(be.visitors, 'en') + ' visits.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Any channel that cannot be judged in three days leaves this round.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'I need approval from ' + ctx.cfo.name + ' for the 30% release.'
          ] }
        ],
        items: [item(ctx.seed + 'gr1', ctx.growth.name, 'day 3', 'First read on copy A versus B')],
        claims: []
      }
    };
    return t[ctx.lang];
  }

  function buildSecondCfo(a, ctx) {
    var ko = ctx.lang === 'ko';
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '2라운드 추가 지출은 없습니다. 30% 선집행은 승인합니다.',
            '예산의 15% 예비비는 그대로 두고, 남은 금액은 3일 판정 뒤에 풉니다.'
          ] },
          { kind: 'plan', title: '제안', lines: [
            '3일 차에 지출 대비 전환을 한 줄로 보고받습니다.',
            '전환이 ' + pct(a.conv) + '의 절반이면 즉시 중단합니다. 이 기준은 오늘 회의록에 남깁니다.'
          ] },
          { kind: 'risk', title: '리스크', lines: [
            '중간 판정 없이 4주를 돌리면 예산을 다 쓴 뒤에야 알게 됩니다.'
          ] },
          { kind: 'ask', title: '요청', lines: [
            ctx.growth.name + '에게 3일 차 지출·전환 숫자를 요청합니다.'
          ] }
        ],
        items: [item(ctx.seed + 'cr1', ctx.cfo.name, '3일차', '지출·전환 중간 정산')],
        claims: []
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'No new spend in round two. The 30% release is approved.',
            'The 15% contingency stays. The rest unlocks after the day-three read.'
          ] },
          { kind: 'plan', title: 'Plan', lines: [
            'At day three I want spend against conversion on one line.',
            'If conversion is half of ' + pct(a.conv) + ', we stop. That rule goes into today\u2019s minutes.'
          ] },
          { kind: 'risk', title: 'Risk', lines: [
            'Four weeks without a checkpoint means finding out after the budget is gone.'
          ] },
          { kind: 'ask', title: 'Ask', lines: [
            'Spend and conversion numbers from ' + ctx.growth.name + ' on day three.'
          ] }
        ],
        items: [item(ctx.seed + 'cr1', ctx.cfo.name, 'day 3', 'Mid-point spend and conversion check')],
        claims: []
      }
    };
    return t[ctx.lang];
  }

  function buildSecondAuditor(a, ctx) {
    var ko = ctx.lang === 'ko';
    var t = {
      ko: {
        blocks: [
          { kind: 'view', title: '관점', lines: [
            '2라운드에서 새 숫자 두 개가 나왔습니다. 30% 선집행과 3일 판정입니다.',
            '둘 다 출처가 회의록 안에 있어 이번에는 근거가 있습니다.'
          ] },
          { kind: 'audit', title: '검수 지적', lines: [
            '30% 선집행: 예산 ' + money(a.budget, 'ko', a.currency) + '의 30%로 상한이 계산됩니다. 맞습니다.',
            '3일 판정: 전환 ' + pct(a.conv) + '의 절반이라는 중단 기준이 숫자로 적혔습니다. 이건 통과입니다.',
            '남은 지적: 1라운드의 "' + a.metric + ' 현재값"이 아직 기록 전입니다.'
          ] },
          { kind: 'verdict', title: '판정', lines: [
            '조건 1개 남음. ' + a.metric + ' 현재값만 적으면 진행해도 됩니다.',
            '그 전까지는 30% 선집행까지만 허용합니다.'
          ] }
        ],
        items: [item(ctx.seed + 'ar1', ctx.auditor.name, '오늘', '지표 현재값 기록 후 승인')],
        claims: []
      },
      en: {
        blocks: [
          { kind: 'view', title: 'View', lines: [
            'Round two produced two new numbers: the 30% release and the day-three read.',
            'Both have their basis inside the minutes, so this time the numbers stand.'
          ] },
          { kind: 'audit', title: 'Audit', lines: [
            '30% release: 30% of ' + money(a.budget, 'en', a.currency) + ' gives a hard cap. Correct.',
            'Day three: the stop rule at half of ' + pct(a.conv) + ' is written as a number. That passes.',
            'Still open: the starting value of ' + a.metric + ' from round one is not recorded.'
          ] },
          { kind: 'verdict', title: 'Verdict', lines: [
            'One condition left. Record the current value of ' + a.metric + ' and this can proceed.',
            'Until then, only the 30% release is allowed.'
          ] }
        ],
        items: [item(ctx.seed + 'ar1', ctx.auditor.name, 'today', 'Approve after the starting value is recorded')],
        claims: []
      }
    };
    return t[ctx.lang];
  }

  /* ── replies ─────────────────────────────────────────────────────────── */

  function shortQuote(text, max) {
    var t = String(text || '').replace(/\s+/g, ' ').trim();
    var limit = max || 60;
    return t.length > limit ? t.slice(0, limit - 1).trim() + '…' : t;
  }

  function reply(opts) {
    var ko = opts.lang !== 'en';
    var message = opts.message || {};
    var role = opts.role || { name: message.name, kind: message.kind, tag: message.tag };
    var userText = String(opts.userText || '').trim();
    var a = opts.analysis || analyze(opts.agenda || '', ko ? 'ko' : 'en');
    var be = breakEven(a);
    var quote = shortQuote(userText, 64);
    var replyAnalysis = analyze(userText, ko ? 'ko' : 'en');
    var hasPercent = replyAnalysis.metrics.some(function (x) { return x.kind === 'percent'; });
    var hasMoney = replyAnalysis.metrics.some(function (x) { return x.kind === 'money'; });
    var moneyMetric = replyAnalysis.metrics.filter(function (x) { return x.kind === 'money'; })[0];
    var seed = hash((opts.agenda || '') + '|' + message.id + '|' + userText + '|' + role.kind);
    var blocks, items;

    if (role.kind === 'auditor') {
      blocks = ko ? [
        { kind: 'view', title: '재검수', lines: [
          '"' + quote + '" 반영해서 다시 봤습니다. 조건 2개 중 1개는 충족입니다.',
          '남은 조건은 ' + a.metric + '의 현재값 기록입니다. 이건 말로는 안 됩니다.'
        ] },
        { kind: 'verdict', title: '판정', lines: [
          '현재값이 회의록에 적히면 승인으로 바꿉니다. 그 전에는 조건부 그대로입니다.'
        ] }
      ] : [
        { kind: 'view', title: 'Re-audit', lines: [
          'I re-checked with \u201c' + quote + '\u201d in the record. One of the two conditions is met.',
          'Still open: the current value of ' + a.metric + ' written down. It cannot stay verbal.'
        ] },
        { kind: 'verdict', title: 'Verdict', lines: [
          'Once the value is in the minutes I will call it approved. Until then it stays conditional.'
        ] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '오늘' : 'today', ko ? '조건 충족 여부 재확인' : 'Re-check the open condition')];
    } else if (role.kind === 'cfo') {
      var detail;
      if (hasPercent || hasMoney) {
        var conv = a.conv, budget = a.budget;
        replyAnalysis.metrics.forEach(function (x) {
          if (x.kind === 'percent' && x.value <= 0.35) conv = x.value;
          if (x.kind === 'money' && x.value >= 10000) budget = x.value;
        });
        var be2 = breakEven({ budget: budget, price: a.price, conv: conv, target: a.target });
        detail = ko
          ? '숫자를 넣어 다시 계산했습니다. 예산 ' + money(budget, 'ko', a.currency) + ', 전환 ' + pct(conv) + '이면 방문 ' + num(be2.visitors, 'ko') + '명이 필요합니다.'
          : 'Recomputed with your number: ' + money(budget, 'en', a.currency) + ' at ' + pct(conv) + ' needs ' + num(be2.visitors, 'en') + ' visits.';
      } else {
        detail = ko
          ? '숫자가 없어서 계산은 그대로 둡니다. 예산 상한 ' + money(a.budget, 'ko', a.currency) + '은 유지합니다.'
          : 'No new number, so the math stays. The ' + money(a.budget, 'en', a.currency) + ' cap stays.';
      }
      blocks = ko ? [
        { kind: 'view', title: '재계산', lines: ['"' + quote + '" 반영했습니다.', detail] },
        { kind: 'risk', title: '리스크', lines: ['상한을 넘는 항목은 다음 승인으로 넘깁니다. 예외는 만들지 않습니다.'] }
      ] : [
        { kind: 'view', title: 'Recalculation', lines: ['Noted: \u201c' + quote + '\u201d.', detail] },
        { kind: 'risk', title: 'Risk', lines: ['Anything above the cap goes to the next approval. No exceptions.'] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '오늘' : 'today', ko ? '수정 예산안 확인' : 'Confirm the revised budget')];
    } else if (role.kind === 'dev') {
      blocks = ko ? [
        { kind: 'view', title: '반영', lines: [
          '"' + quote + '" 반영했습니다. 범위가 바뀌면 API 계약부터 다시 고정합니다.',
          '계약서에 요청·응답·오류 코드를 같이 적습니다. 구두로 넘기면 QA가 같은 것을 두 번 봅니다.'
        ] },
        { kind: 'plan', title: '다음 행동', lines: ['계약서 1장을 고치고, 테스트 케이스 3개 중 바뀐 것만 다시 돌립니다.'] }
      ] : [
        { kind: 'view', title: 'Update', lines: [
          'Incorporated: \u201c' + quote + '\u201d. If the scope moved, the API contract is repinned first.',
          'Request, response and error codes go on the same page. Verbal handoffs make QA read it twice.'
        ] },
        { kind: 'plan', title: 'Next', lines: ['Edit the one-page contract, then rerun only the test cases that changed.'] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '오늘' : 'today', ko ? 'API 계약서 수정' : 'Update the API contract')];
    } else if (role.kind === 'growth') {
      var budgetLine = moneyMetric ? money(moneyMetric.value, ko ? 'ko' : 'en', a.currency) : '';
      if (moneyMetric) {
        blocks = ko ? [
          { kind: 'view', title: '반영', lines: [
            '"' + quote + '" — 예산 ' + budgetLine + '까지 열리면 채널은 하나만 유지하고, 늘어난 예산은 노출에 먼저 씁니다.',
            '늘어난 예산은 한 번에 쓰지 않고 3일 단위로 나눠 집행합니다.'
          ] },
          { kind: 'plan', title: '다음 행동', lines: ['3일 뒤 같은 전환 기준으로 비교하고, 전환이 그대로면 노출을 유지합니다.'] }
        ] : [
          { kind: 'view', title: 'Update', lines: [
            '\u201c' + quote + '\u201d — with the budget at ' + budgetLine + ', I keep one channel and put the extra budget into reach first.',
            'The extra budget goes out in three-day blocks, not all at once.'
          ] },
          { kind: 'plan', title: 'Next', lines: ['Same conversion read on day three; keep the reach if conversion holds.'] }
        ];
        items = [item(seed + 'r1', role.name, ko ? '1일차' : 'day 1', ko ? '증액 예산 집행 계획 1장' : 'One-page plan for the extra budget')];
      } else {
        blocks = ko ? [
          { kind: 'view', title: '반영', lines: [
            '"' + quote + '" 반영해서 문구를 고칩니다. 채널은 ' + a.channel + ' 하나만 유지합니다.',
            '측정 창은 그대로 두 단계입니다. 비교가 안 되면 다음 판단도 못 합니다.'
          ] },
          { kind: 'plan', title: '다음 행동', lines: ['수정 문구 2안을 다시 쓰고, 3일 뒤 같은 기준으로 봅니다.'] }
        ] : [
          { kind: 'view', title: 'Update', lines: [
            'I will change the copy for \u201c' + quote + '\u201d and keep one channel: ' + a.channel + '.',
            'The two-step measurement stays. Without a like-for-like read the next call is blind.'
          ] },
          { kind: 'plan', title: 'Next', lines: ['Two revised headlines, then the same read in three days.'] }
        ];
        items = [item(seed + 'r1', role.name, ko ? '1일차' : 'day 1', ko ? '수정 문구 2안 작성' : 'Write two revised headlines')];
      }
    } else if (role.kind === 'design') {
      blocks = ko ? [
        { kind: 'view', title: '반영', lines: [
          '"' + quote + '" 반영해서 화면 기준을 고칩니다.',
          '시안 비교는 같은 과업으로 유지합니다. 기준이 바뀌면 비교표에 먼저 적고 다시 봅니다.'
        ] },
        { kind: 'plan', title: '다음 행동', lines: ['한 화면부터 적용하고, 사용자 5명에게 같은 과업을 다시 시킵니다.'] }
      ] : [
        { kind: 'view', title: 'Update', lines: [
          'I will change the screen criteria for \u201c' + quote + '\u201d.',
          'The comparison stays on the same task. A changed criterion goes on the sheet before we look again.'
        ] },
        { kind: 'plan', title: 'Next', lines: ['Apply it to one screen, then run the same task with five users.'] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '오늘' : 'today', ko ? '화면 기준표 수정' : 'Update the screen criteria')];
    } else if (role.kind === 'video') {
      blocks = ko ? [
        { kind: 'view', title: '반영', lines: [
          '"' + quote + '" 반영해서 편집본을 다시 자릅니다.',
          '길이는 60초를 넘기지 않고, 첫 5초는 같은 결론으로 유지합니다.'
        ] },
        { kind: 'plan', title: '다음 행동', lines: ['수정한 컷과 썸네일을 같이 다시 보고, 업로드 날짜는 그대로 둡니다.'] }
      ] : [
        { kind: 'view', title: 'Update', lines: [
          'I will recut for \u201c' + quote + '\u201d.',
          'It stays under sixty seconds, and the first five seconds keep the same point.'
        ] },
        { kind: 'plan', title: 'Next', lines: ['Review the new cut with the thumbnail; the upload date does not move.'] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '1일차' : 'day 1', ko ? '수정 컷·썸네일 재확인' : 'Review the new cut and thumbnail')];
    } else if (role.kind === 'sales') {
      blocks = ko ? [
        { kind: 'view', title: '반영', lines: [
          '"' + quote + '" 반영해서 제안 문장과 다음 단계를 고칩니다.',
          '단가와 할인 한도는 그대로 둡니다. 바꿔야 하면 다음 승인으로 넘깁니다.'
        ] },
        { kind: 'plan', title: '다음 행동', lines: ['해당 건의 제안서를 다시 쓰고, 발송 날짜를 오늘 안에 박습니다.'] }
      ] : [
        { kind: 'view', title: 'Update', lines: [
          'I will change the proposal line and the next step for \u201c' + quote + '\u201d.',
          'Price and the discount limit stay; a change there goes to the next approval.'
        ] },
        { kind: 'plan', title: 'Next', lines: ['Rewrite that proposal and put a send date on it today.'] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '오늘' : 'today', ko ? '제안서 재작성·발송일 확정' : 'Rewrite the proposal and set the send date')];
    } else {
      blocks = ko ? [
        { kind: 'view', title: '반영', lines: [
          '"' + quote + '" 쪽으로 범위를 다시 잡겠습니다.',
          '성공 기준은 ' + a.metric + ' 하나 그대로입니다. 일정은 늘리지 않습니다.'
        ] },
        { kind: 'plan', title: '다음 행동', lines: ['수정된 범위를 회의록에 반영하고, 빠진 항목은 다음 라운드로 넘깁니다.'] }
      ] : [
        { kind: 'view', title: 'Update', lines: [
          'I will reshape the scope around \u201c' + quote + '\u201d.',
          'One success metric unchanged: ' + a.metric + '. The date does not move.'
        ] },
        { kind: 'plan', title: 'Next', lines: ['Put the revised scope in the minutes and park what dropped out.'] }
      ];
      items = [item(seed + 'r1', role.name, ko ? '오늘' : 'today', ko ? '수정된 범위 회의록 반영' : 'Add the revised scope to the minutes')];
    }

    return {
      message: {
        id: uid('msg', seed + '|reply'),
        roleId: role.id || message.roleId,
        kind: role.kind,
        name: role.name || message.name,
        tag: role.tag || message.tag,
        glyph: role.glyph || message.glyph,
        accent: role.accent || message.accent,
        mode: opts.mode || 'free',
        round: message.round || 1,
        replyTo: message.id,
        blocks: blocks,
        claims: [],
        itemIds: items.map(function (x) { return x.id; }),
        ts: 0
      },
      items: items
    };
  }

  /* ── minutes / export ───────────────────────────────────────────────── */

  function blockTitle(kind, lang) {
    var map = {
      ko: { view: '관점', plan: '제안', risk: '리스크', ask: '요청', audit: '검수 지적', verdict: '판정', reply: '답글' },
      en: { view: 'View', plan: 'Plan', risk: 'Risk', ask: 'Ask', audit: 'Audit', verdict: 'Verdict', reply: 'Reply' }
    };
    return map[lang === 'en' ? 'en' : 'ko'][kind] || kind;
  }

  function roomName(id, lang, fallback) {
    var l = lang === 'en' ? 'en' : 'ko';
    var room = Data.ROOMS.filter(function (r) { return r.id === id; })[0];
    if (room) return room.name[l];
    return fallback || (l === 'en' ? 'Custom room' : '사용자 부서');
  }

  function summarize(state) {
    var messages = state.messages || [];
    var items = state.items || [];
    var audits = 0;
    messages.forEach(function (m) {
      (m.blocks || []).forEach(function (b) { if (b.kind === 'audit') audits += (b.lines || []).length; });
    });
    return {
      messages: messages.filter(function (m) { return m.roleId !== 'user'; }).length,
      replies: messages.filter(function (m) { return m.roleId === 'user'; }).length,
      items: items.length,
      done: items.filter(function (i) { return i.done; }).length,
      audits: audits
    };
  }

  function minutes(state, lang, format) {
    lang = lang === 'en' ? 'en' : 'ko';
    format = format || 'md';
    var messages = state.messages || [];
    var items = state.items || [];
    var roles = state.roles || [];
    var title = cleanTitle(state.agenda || '') || (lang === 'en' ? 'Untitled meeting' : '제목 없는 회의');
    var when = state.exportedAt || '';
    var room = state.roomLabel || roomName(state.room, lang);

    if (format === 'json') {
      return {
        app: 'OneTap AI Team Room',
        version: VERSION,
        exportedAt: when,
        room: state.room,
        roomName: room,
        lang: lang,
        agenda: state.agenda || '',
        participants: roles.map(function (r) { return { name: roleName(r, lang), tag: r.tag, kind: r.kind }; }),
        messages: messages,
        actions: items
      };
    }

    var lines = [];
    if (format === 'md') {
      lines.push('# ' + title);
      lines.push('');
      lines.push('- ' + room + ' · ' + when);
      lines.push('- ' + (lang === 'en' ? 'Mode' : '모드') + ': ' + (state.mode === 'pro' ? 'Pro (BYOK)' : (lang === 'en' ? 'Free' : '무료')));
      lines.push('');
      lines.push('## ' + (lang === 'en' ? 'Agenda' : '안건'));
      lines.push('');
      lines.push(state.agenda || (lang === 'en' ? '(none)' : '(없음)'));
      lines.push('');
      lines.push('## ' + (lang === 'en' ? 'Participants' : '참석'));
      lines.push('');
      roles.forEach(function (r) {
        lines.push('- ' + roleName(r, lang) + (r.tag ? ' (' + r.tag + ')' : ''));
      });
      lines.push('');
      lines.push('## ' + (lang === 'en' ? 'Discussion' : '발언'));
      lines.push('');
      var byParent = {};
      messages.forEach(function (m) {
        if (m.roleId === 'user' && m.replyTo) {
          (byParent[m.replyTo] = byParent[m.replyTo] || []).push(m);
        }
      });
      var byId = {};
      messages.forEach(function (m) { byId[m.id] = m; });
      messages.filter(function (m) { return m.roleId !== 'user'; }).forEach(function (m) {
        lines.push('### ' + m.name + ' · ' + (m.tag || ''));
        lines.push('');
        if (m.replyTo && byId[m.replyTo]) {
          var parentMsg = byId[m.replyTo];
          lines.push('> ' + (lang === 'en' ? 'Reply' : '답글') + ': ' + (parentMsg.roleId === 'user' ? parentMsg.text : parentMsg.name));
          lines.push('');
        }
        (m.blocks || []).forEach(function (b) {
          lines.push('**' + blockTitle(b.kind, lang) + '**');
          (b.lines || []).forEach(function (l) { lines.push('- ' + l); });
          lines.push('');
        });
        (byParent[m.id] || []).forEach(function (r) {
          lines.push('> ' + (lang === 'en' ? 'Reply' : '답글') + ': ' + r.text);
          lines.push('');
        });
      });
      lines.push('## ' + (lang === 'en' ? 'Action items' : '액션아이템'));
      lines.push('');
      items.forEach(function (it) {
        lines.push('- [' + (it.done ? 'x' : ' ') + '] ' + it.text + ' — ' + it.owner + ' · ' + it.due);
      });
      if (!items.length) lines.push(lang === 'en' ? '- (none)' : '- (없음)');
      lines.push('');
      lines.push('---');
      lines.push(lang === 'en'
        ? 'Made with OneTap AI Team Room. Free mode, no account, nothing sent to our server.'
        : '원탭 AI 팀 회의실에서 만들었습니다. 무료 모드, 회원가입 없음, 서버 전송 없음.');
      return lines.join('\n');
    }

    /* txt */
    lines.push(title);
    lines.push('='.repeat(Math.min(60, Math.max(8, title.length))));
    lines.push(room + ' · ' + when);
    lines.push('');
    lines.push(lang === 'en' ? 'AGENDA' : '안건');
    lines.push(state.agenda || '-');
    lines.push('');
    lines.push(lang === 'en' ? 'PARTICIPANTS' : '참석');
    roles.forEach(function (r) { lines.push('  ' + roleName(r, lang) + (r.tag ? ' (' + r.tag + ')' : '')); });
    lines.push('');
    lines.push(lang === 'en' ? 'DISCUSSION' : '발언');
    messages.filter(function (m) { return m.roleId !== 'user'; }).forEach(function (m) {
      lines.push('');
      lines.push('[' + m.name + ' · ' + (m.tag || '') + ']');
      if (m.replyTo) {
        var parentMsg = messages.filter(function (x) { return x.id === m.replyTo; })[0];
        if (parentMsg) lines.push('   > ' + (lang === 'en' ? 'Reply' : '답글') + ': ' + (parentMsg.roleId === 'user' ? parentMsg.text : parentMsg.name));
      }
      (m.blocks || []).forEach(function (b) {
        lines.push('  ' + blockTitle(b.kind, lang));
        (b.lines || []).forEach(function (l) { lines.push('   - ' + l); });
      });
      messages.filter(function (r) { return r.roleId === 'user' && r.replyTo === m.id; }).forEach(function (r) {
        lines.push('   > ' + (lang === 'en' ? 'Reply' : '답글') + ': ' + r.text);
      });
    });
    lines.push('');
    lines.push(lang === 'en' ? 'ACTION ITEMS' : '액션아이템');
    items.forEach(function (it) {
      lines.push('  [' + (it.done ? 'x' : ' ') + '] ' + it.text + ' — ' + it.owner + ' · ' + it.due);
    });
    if (!items.length) lines.push('  -');
    lines.push('');
    lines.push(lang === 'en' ? 'Made with OneTap AI Team Room (free mode).' : '원탭 AI 팀 회의실(무료 모드)에서 만들었습니다.');
    return lines.join('\n');
  }

  /* ── Pro: prompt contract + response parsing ────────────────────────── */

  function proPrompts(opts) {
    var lang = opts.lang === 'en' ? 'en' : 'ko';
    var role = opts.role || {};
    var agenda = opts.agenda || '';
    var transcript = opts.transcript || '';
    var room = opts.roomName || roomName(opts.room, lang);
    var roomDesc = String(opts.roomDesc || '').trim();
    var names = (opts.roles || []).map(function (r) { return roleName(r, lang); }).join(', ');
    var teamSize = (opts.roles || []).length || Data.ROLE_ARCHETYPES.length;
    var isAuditor = role.kind === 'auditor';
    var base = {
      ko: {
        system: '당신은 ' + teamSize + '명으로 구성된 제품 팀의 ' + role.name + ' 역할입니다. 회의실: ' + room + (roomDesc ? ' (' + roomDesc + ')' : '') + '. 참석자: ' + names + '. '
          + '한국어로 답합니다. 실제로 회의에서 말하듯 짧고 구체적으로 씁니다. 모르는 수치는 가정이라고 표시합니다. '
          + '확인하지 않은 출처나 통계를 만들지 않습니다. '
          + (isAuditor
            ? '앞선 역할들의 답변을 숫자·출처·책임 기준으로 검수합니다. 각 숫자를 그대로 인용하고, 근거가 있는지 판단하고, 계산은 직접 다시 해봅니다. '
            : '')
          + '출력 형식(그대로 지킬 것):\n관점: 한 문단\n제안:\n- 항목\n- 항목\n리스크:\n- 항목\n요청:\n- 항목\n액션:\n- 담당 | 기한 | 할 일',
        user: '안건: ' + agenda + '\n\n지금까지의 발언:\n' + (transcript || '(없음)') + '\n\n이제 ' + role.name + '으로서 발언하세요. 출력 형식만 사용합니다.'
      },
      en: {
        system: 'You are the ' + role.name + ' on a ' + teamSize + '-person product team. Room: ' + room + (roomDesc ? ' (' + roomDesc + ')' : '') + '. Participants: ' + names + '. '
          + 'Answer in English. Speak the way a person does in a meeting: short and concrete. Mark any figure you assume. '
          + 'Never invent a source or a statistic. '
          + (isAuditor
            ? 'Audit the answers above against numbers, sources and ownership. Quote each number, judge whether its basis is stated, and redo the arithmetic yourself. '
            : '')
          + 'Output format (follow exactly):\nView: one paragraph\nPlan:\n- item\n- item\nRisk:\n- item\nAsk:\n- item\nAction:\n- owner | due | task',
        user: 'Agenda: ' + agenda + '\n\nTranscript so far:\n' + (transcript || '(none)') + '\n\nNow speak as the ' + role.name + '. Use only the output format.'
      }
    };
    return [
      { role: 'system', content: base[lang].system },
      { role: 'user', content: base[lang].user }
    ];
  }

  /* ── Pro routing: which provider actually answers a seat ─────────────── */

  /* The ids that have a key in the stored connection, in panel order. */
  function proConnected(connected) {
    var keys = connected && typeof connected === 'object' ? connected : {};
    return Data.PROVIDER_ORDER.filter(function (id) {
      return !!(keys[id] && String(keys[id].key || '').trim());
    });
  }

  /* Providers switched on as a web subscription bridge without a key: the seat's
     question is copied to the provider's web chat and the answer is pasted back.
     A saved key always wins over the bridge for the same provider. */
  function proBridge(connected) {
    var keys = connected && typeof connected === 'object' ? connected : {};
    return Data.BRIDGE_ORDER.filter(function (id) {
      return !!(keys[id] && keys[id].bridge && !String(keys[id].key || '').trim());
    });
  }

  /* The seat's appointed provider wins when it has a key. A bridged provider
     answers through its web chat when it holds no key. Otherwise the turn falls
     back to a connected provider, rotated by the seat's position in the round so
     one key does not answer every seat alone. With no key at all, any bridged
     provider keeps the round alive. null = nothing to call. */
  function proRoute(modelKey, connected, order) {
    var keys = connected && typeof connected === 'object' ? connected : {};
    var wanted = (Data.MODELS[modelKey] || Data.MODELS.gemini).provider;
    function take(id, fallback, bridge) {
      var cfg = keys[id] || {};
      return {
        provider: id,
        model: String(cfg.model || Data.PROVIDERS[id].model),
        label: Data.PROVIDERS[id].mark,
        providerLabel: Data.PROVIDERS[id].label,
        fallback: !!fallback,
        bridge: !!bridge
      };
    }
    if (keys[wanted] && String(keys[wanted].key || '').trim()) return take(wanted, false, false);
    if (keys[wanted] && keys[wanted].bridge) return take(wanted, false, true);
    var live = proConnected(keys);
    if (live.length) {
      var n = Math.abs(parseInt(order, 10) || 0) % live.length;
      return take(live[n], true, false);
    }
    var bridged = proBridge(keys);
    if (bridged.length) {
      var b = Math.abs(parseInt(order, 10) || 0) % bridged.length;
      return take(bridged[b], true, true);
    }
    return null;
  }

  /* The text a bridged seat copies into ChatGPT or Claude. It carries the
     agenda, a short digest of the team's answers so far, the seat's own focus
     and the exact output format the parser understands — so a pasted answer
     lands as a normal speech card. */
  function bridgePrompt(opts) {
    var o = opts || {};
    var lang = o.lang === 'en' ? 'en' : 'ko';
    var role = o.role || {};
    var ko = lang === 'ko';
    var agenda = String(o.agenda || '').trim() || (ko ? '(안건 없음)' : '(no agenda)');
    var names = (o.roles || []).map(function (r) { return roleName(r, lang); }).filter(Boolean).join(', ');
    var focus = String(o.focus || role.focus || '').trim();
    var site = String(o.site || '').trim();
    var room = String(o.roomName || '').trim();
    var prior = (o.prior || []).map(function (p) {
      if (typeof p === 'string') return p;
      var who = p.name || '';
      if (p.tag) who += ' (' + p.tag + ')';
      return '- ' + who + ': ' + String(p.line || '').trim();
    }).filter(Boolean);
    var isAuditor = role.kind === 'auditor';
    if (ko) {
      var lines = [];
      lines.push('지금 제품 팀 회의에서 ' + (role.name || '이 부서') + ' 자리의 답을 받으려고 합니다.');
      lines.push('아래 안건과 앞선 발언을 읽고, 회의에서 말하듯 짧고 구체적으로 답해 주세요.');
      lines.push('');
      if (room) lines.push('회의실: ' + room);
      if (names) lines.push('참석자: ' + names);
      lines.push('안건: ' + agenda);
      lines.push('');
      lines.push('앞선 발언 요약:');
      if (prior.length) prior.forEach(function (p) { lines.push(p); });
      else lines.push('- (없음)');
      lines.push('');
      lines.push('요청:');
      if (focus) lines.push('- ' + (role.name || '이 부서') + '의 기준: ' + focus);
      lines.push('- 모르는 수치는 가정이라고 표시하고, 확인하지 않은 출처나 통계는 만들지 마세요.');
      if (isAuditor) lines.push('- 앞선 답변의 숫자를 그대로 인용하고, 근거가 있는지 판단하고, 계산은 직접 다시 해보세요.');
      lines.push('- 여섯 줄에서 열두 줄 사이로 답해 주세요.');
      lines.push('');
      lines.push('답변 형식(아래 제목을 그대로 쓰면 회의록에 자동으로 정리됩니다):');
      lines.push('관점: 한 문단');
      lines.push('제안:');
      lines.push('- 항목');
      lines.push('- 항목');
      lines.push('리스크:');
      lines.push('- 항목');
      lines.push('요청:');
      lines.push('- 항목');
      lines.push('액션:');
      lines.push('- 담당 | 기한 | 할 일');
      if (site) {
        lines.push('');
        lines.push('(이 질문은 원탭 AI 팀 회의실의 ' + site + ' 구독 브리지에서 복사됐습니다. 답만 복사해 회의실에 붙여넣으면 됩니다.)');
      }
      return lines.join('\n');
    }
    var out = [];
    out.push('I need the ' + (role.name || 'department') + ' seat of our product team meeting answered.');
    out.push('Read the agenda and the earlier answers below, then answer the way a person does in a meeting: short and concrete.');
    out.push('');
    if (room) out.push('Room: ' + room);
    if (names) out.push('Participants: ' + names);
    out.push('Agenda: ' + agenda);
    out.push('');
    out.push('Earlier answers:');
    if (prior.length) prior.forEach(function (p) { out.push(p); });
    else out.push('- (none)');
    out.push('');
    out.push('Requests:');
    if (focus) out.push('- ' + (role.name || 'This seat') + ' looks at: ' + focus);
    out.push('- Mark any figure you assume, and never invent a source or a statistic.');
    if (isAuditor) out.push('- Quote each number above, judge whether its basis is stated, and redo the arithmetic yourself.');
    out.push('- Answer in six to twelve lines.');
    out.push('');
    out.push('Answer format (these headings make the meeting minutes format themselves):');
    out.push('View: one paragraph');
    out.push('Plan:');
    out.push('- item');
    out.push('- item');
    out.push('Risk:');
    out.push('- item');
    out.push('Ask:');
    out.push('- item');
    out.push('Action:');
    out.push('- owner | due | task');
    if (site) {
      out.push('');
      out.push('(Copied from the ' + site + ' subscription bridge in OneTap AI Team Room. Paste only the answer back into the room.)');
    }
    return out.join('\n');
  }

  function stripBullet(line) {
    return String(line || '').replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim();
  }

  function parsePro(text, role, lang) {
    lang = lang === 'en' ? 'en' : 'ko';
    var raw = String(text || '').replace(/\r\n/g, '\n').trim();
    var headerRe = /^(?:#{1,4}\s*)?(관점|제안|리스크|요청|액션|검수|판정|view|plan|risk|ask|actions?|audit|verdict)\s*[:：]\s*(.*)$/i;
    var map = {
      '관점': 'view', view: 'view', '제안': 'plan', plan: 'plan', '리스크': 'risk', risk: 'risk',
      '요청': 'ask', ask: 'ask', '액션': 'action', action: 'action', actions: 'action',
      '검수': 'audit', audit: 'audit', '판정': 'verdict', verdict: 'verdict'
    };
    var blocks = [];
    var current = null;
    var currentKind = null;
    function ensure(kind, title) {
      if (current && currentKind === kind) return current;
      current = { kind: kind, title: title, lines: [] };
      currentKind = kind;
      blocks.push(current);
      return current;
    }
    raw.split('\n').forEach(function (line) {
      var m = line.match(headerRe);
      if (m) {
        var kind = map[m[1].toLowerCase()];
        var titleText = m[1];
        current = { kind: kind, title: titleText, lines: [] };
        currentKind = kind;
        blocks.push(current);
        var inline = stripBullet(m[2]);
        if (inline) current.lines.push(inline);
        return;
      }
      if (!line.trim()) return;
      var body = stripBullet(line);
      if (!body) return;
      if (!current) ensure('view', lang === 'en' ? 'View' : '관점');
      current.lines.push(body);
    });

    blocks = blocks.filter(function (b) { return b.lines.length; });
    if (!blocks.length && raw) {
      blocks = [{ kind: 'view', title: lang === 'en' ? 'View' : '관점', lines: raw.split(/\n{2,}/).map(function (p) { return p.replace(/\s+/g, ' ').trim(); }).filter(Boolean).slice(0, 6) }];
    }

    var items = [];
    blocks.forEach(function (b) {
      if (b.kind !== 'action') return;
      b.lines.forEach(function (line, i) {
        var parts = line.split('|').map(function (s) { return s.trim(); });
        var owner = parts.length >= 3 ? parts[0] : (role.name || '');
        var due = parts.length >= 3 ? parts[1] : (lang === 'en' ? 'this week' : '이번 주');
        var task = parts.length >= 3 ? parts.slice(2).join(' | ') : line;
        if (!task) return;
        items.push({ id: uid('itm', 'pro|' + task + '|' + i), text: task, owner: owner, due: due, done: false });
      });
    });

    /* Action block is also shown as a block; keep it, it reads fine. */
    return { blocks: blocks, items: items };
  }

  /* An answer pasted back from a web chat may follow the requested headings or
     arrive as plain prose. Headed text goes through parsePro. Plain text is
     regrouped: paragraphs become the view, bullet lines become the plan (and
     "owner | due | task" bullets become actions), risk/ask lines get their own
     block — so either shape lands as a clean speech card. */
  function parseBridgeAnswer(text, role, lang) {
    lang = lang === 'en' ? 'en' : 'ko';
    var ko = lang === 'ko';
    var raw = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!raw) return { blocks: [], items: [] };
    var parsed = parsePro(raw, role, lang);
    var headed = parsed.blocks.length > 1
      || (parsed.blocks[0] && parsed.blocks[0].kind !== 'view')
      || (parsed.blocks[0] && (parsed.blocks[0].lines || []).length === 1);
    if (headed) return parsed;

    var view = [];
    var plan = [];
    var risk = [];
    var ask = [];
    var action = [];
    raw.split('\n').forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      var bullet = /^(?:[-*•·]|\d+[.)])\s+(.+)$/.exec(t);
      var body = stripBullet(t);
      if (!body) return;
      if (/^(?:리스크|주의|걱정|위험|risk|concern)s?\s*[:：]?\s*(.*)$/i.test(t)) {
        var rv = t.replace(/^(?:리스크|주의|걱정|위험|risk|concern)s?\s*[:：]?\s*/i, '');
        if (rv.trim()) risk.push(stripBullet(rv));
        return;
      }
      if (/^(?:요청|도움|부탁|ask|need|request)s?\s*[:：]?\s*(.*)$/i.test(t)) {
        var av = t.replace(/^(?:요청|도움|부탁|ask|need|request)s?\s*[:：]?\s*/i, '');
        if (av.trim()) ask.push(stripBullet(av));
        return;
      }
      if (bullet) {
        if (body.indexOf('|') >= 0) action.push(body);
        else plan.push(body);
        return;
      }
      view.push(body);
    });
    var blocks = [];
    if (view.length) blocks.push({ kind: 'view', title: ko ? '관점' : 'View', lines: view.slice(0, 4) });
    if (plan.length) blocks.push({ kind: 'plan', title: ko ? '제안' : 'Plan', lines: plan.slice(0, 8) });
    if (risk.length) blocks.push({ kind: 'risk', title: ko ? '리스크' : 'Risk', lines: risk.slice(0, 6) });
    if (ask.length) blocks.push({ kind: 'ask', title: ko ? '요청' : 'Ask', lines: ask.slice(0, 6) });
    if (action.length) blocks.push({ kind: 'action', title: ko ? '액션' : 'Action', lines: action.slice(0, 6) });

    var items = [];
    action.forEach(function (line, i) {
      var parts = line.split('|').map(function (s) { return s.trim(); });
      var owner = parts.length >= 3 ? parts[0] : (role.name || '');
      var due = parts.length >= 3 ? parts[1] : (ko ? '이번 주' : 'this week');
      var task = parts.length >= 3 ? parts.slice(2).join(' | ') : line;
      if (!task) return;
      items.push({ id: uid('itm', 'bridge|' + task + '|' + i), text: task, owner: owner, due: due, done: false });
    });
    if (!blocks.length && raw) {
      blocks.push({ kind: 'view', title: ko ? '관점' : 'View', lines: [raw.replace(/\s+/g, ' ').trim()] });
    }
    return { blocks: blocks, items: items };
  }

  /* ── project outputs ─────────────────────────────────────────────────── */
  /* Every department leaves one concrete deliverable, and the round closes
     with one integrated approval summary. Built from the same messages and
     actions the room already holds, so the free engine and Pro replies both
     produce outputs without a second model call. Pure: no DOM, no clock. */

  var OUTPUT_TITLES = {
    pm: { ko: '기획 요약서', en: 'Plan brief' },
    dev: { ko: '개발 아키텍처·체크', en: 'Architecture and checks' },
    design: { ko: '디자인 비주얼 가이드', en: 'Visual guide' },
    video: { ko: '영상 숏폼 콘티', en: 'Short-form storyboard' },
    growth: { ko: '마케팅 카피', en: 'Marketing copy' },
    sales: { ko: '영업 제안 문구', en: 'Sales proposal lines' },
    cfo: { ko: '재무·리스크 표', en: 'Finance and risk table' },
    auditor: { ko: '최종 결재 요약본', en: 'Approval summary' }
  };

  function clipLine(text, max) {
    var s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function blockLines(msg, kinds) {
    var out = [];
    ((msg && msg.blocks) || []).forEach(function (b) {
      if (kinds.indexOf(b.kind) < 0) return;
      (b.lines || []).forEach(function (l) { out.push(l); });
    });
    return out;
  }

  function outputLines(kind, msg, own, a, be, lang) {
    var ko = lang !== 'en';
    var plan = blockLines(msg, ['plan']);
    var risk = blockLines(msg, ['risk']);
    var verdict = blockLines(msg, ['verdict']);
    var mine = own.map(function (it) { return it.text + (it.due ? ' · ' + it.due : ''); });
    var actionLine = mine.length ? mine.slice(0, 4).join(' / ') : (ko ? '액션 없음' : 'no actions');
    var out = [];
    if (kind === 'pm') {
      out = ko ? [
        '결정할 것: ' + a.decision,
        '범위: ' + a.noun + ' · ' + periodText(a.periodWeeks, 'ko'),
        '성공 지표: ' + a.metric,
        '요약: ' + clipLine(plan[0] || (msg.blocks && msg.blocks[0] && msg.blocks[0].lines[0]) || '', 120),
        '담당 액션: ' + actionLine
      ] : [
        'Decision: ' + a.decision,
        'Scope: ' + a.noun + ' · ' + periodText(a.periodWeeks, 'en'),
        'One success metric: ' + a.metric,
        'Summary: ' + clipLine(plan[0] || '', 120),
        'Owned actions: ' + actionLine
      ];
    } else if (kind === 'dev') {
      out = ko ? [
        '인터페이스 계약: ' + clipLine(plan[0] || '', 120),
        '테스트·롤백: ' + clipLine(risk[0] || plan[1] || '', 120),
        '배포 전 체크: ' + actionLine
      ] : [
        'Interface contract: ' + clipLine(plan[0] || '', 120),
        'Tests and rollback: ' + clipLine(risk[0] || plan[1] || '', 120),
        'Pre-deploy checks: ' + actionLine
      ];
    } else if (kind === 'design') {
      out = ko ? [
        '화면 순서: ' + clipLine(plan[0] || '', 120),
        '기준: ' + clipLine(plan[2] || plan[1] || '', 120),
        '검증: ' + actionLine,
        '색·타이포: 기존 브랜드 값 유지'
      ] : [
        'Reading order: ' + clipLine(plan[0] || '', 120),
        'Criteria: ' + clipLine(plan[2] || plan[1] || '', 120),
        'Check: ' + actionLine,
        'Color and type: keep the existing brand values'
      ];
    } else if (kind === 'video') {
      out = ko ? [
        '0–5초: ' + a.hook,
        '본편: ' + clipLine(plan[0] || '', 120),
        '컷과 배포: ' + clipLine(plan[1] || '', 120),
        '확인 지표: 끝까지 본 비율 · ' + actionLine
      ] : [
        '0–5s: ' + a.hook,
        'Main cut: ' + clipLine(plan[0] || '', 120),
        'Cut and release: ' + clipLine(plan[1] || '', 120),
        'Measure: completion rate · ' + actionLine
      ];
    } else if (kind === 'growth') {
      out = ko ? [
        '헤드라인: ' + a.hook,
        '채널: ' + a.channel,
        '예산: ' + money(a.budget, 'ko', a.currency) + ' · 필요 방문 ' + num(be.visitors, 'ko') + '명',
        '측정: ' + a.metric + ' · ' + actionLine
      ] : [
        'Headline: ' + a.hook,
        'Channel: ' + a.channel,
        'Budget: ' + money(a.budget, 'en', a.currency) + ' · needs ' + num(be.visitors, 'en') + ' visits',
        'Measure: ' + a.metric + ' · ' + actionLine
      ];
    } else if (kind === 'sales') {
      out = ko ? [
        '고객이 물은 것: ' + a.noun,
        '제안 한 문장: ' + clipLine(plan[0] || '', 120),
        '다음 단계: ' + actionLine,
        '단가와 할인: ' + money(a.price, 'ko', a.currency) + ' 기준, 한도 안에서만'
      ] : [
        'What the customer asked: ' + a.noun,
        'One proposal line: ' + clipLine(plan[0] || '', 120),
        'Next step: ' + actionLine,
        'Price and discount: base ' + money(a.price, 'en', a.currency) + ', inside a set limit only'
      ];
    } else if (kind === 'cfo') {
      var assumed = a.assumed.length ? a.assumed.join(', ') : (ko ? '없음' : 'none');
      out = ko ? [
        '항목 | 값',
        '예산 상한 | ' + money(a.budget, 'ko', a.currency),
        '회수 필요 방문 | ' + num(be.visitors, 'ko') + '명',
        '가정값 | ' + assumed,
        '리스크 | ' + a.risk + ' · ' + actionLine
      ] : [
        'Item | Value',
        'Budget cap | ' + money(a.budget, 'en', a.currency),
        'Visits needed to pay back | ' + num(be.visitors, 'en'),
        'Assumed values | ' + assumed,
        'Risk | ' + a.risk + ' · ' + actionLine
      ];
    } else if (kind === 'auditor') {
      out = ko ? [
        '판정: ' + (verdict[0] || '조건부 승인'),
        '조건: ' + clipLine(verdict[1] || '', 120),
        '검수: 앞선 7개 답변의 숫자·출처·책임',
        '다음 확인: ' + actionLine
      ] : [
        'Verdict: ' + (verdict[0] || 'conditional yes'),
        'Conditions: ' + clipLine(verdict[1] || '', 120),
        'Audit: numbers, sources and owners across the 7 answers above',
        'Next check: ' + actionLine
      ];
    }
    return out.filter(function (l) { return String(l).trim().length > 0; });
  }

  function buildOutputs(opts) {
    var o = opts || {};
    var lang = o.lang === 'en' ? 'en' : 'ko';
    var roles = o.roles || [];
    var items = o.items || [];
    var messages = (o.messages || []).filter(function (m) {
      return m && m.roleId !== 'user' && !m.replyTo && m.bridge !== 'waiting';
    });
    var a = analyze(o.agenda || '', lang);
    if (a.empty) a = analyze(lang === 'en' ? 'We need to decide what to do this week.' : '이번 주에 무엇을 할지 정해야 합니다.', lang);
    var be = breakEven(a);
    var round = messages.reduce(function (n, m) { return Math.max(n, m.round || 1); }, 0) || 1;
    var at = o.createdAt || 0;
    var outputs = [];
    var present = [];

    roles.forEach(function (role) {
      var mine = messages.filter(function (m) { return m.kind === role.kind && (m.round || 1) === round; });
      var msg = mine.slice(-1)[0];
      if (!msg) return;
      /* Owners were written in the language the action was created in, so a
         deliverable opened in the other language still finds its actions. */
      var arche = Data.ROLE_ARCHETYPES.filter(function (x) { return x.kind === role.kind; })[0];
      var ownerNames = [role.name];
      if (arche) ownerNames.push(arche.name.ko, arche.name.en);
      var own = items.filter(function (it) { return ownerNames.indexOf(it.owner) >= 0; });
      var titleMap = OUTPUT_TITLES[role.kind];
      var lines = outputLines(role.kind, msg, own, a, be, lang);
      if (!lines.length) return;
      present.push(role);
      outputs.push({
        id: uid('out', (o.projectId || '') + '|' + role.id + '|' + round),
        roleId: role.id,
        kind: role.kind,
        name: role.name,
        tag: role.tag || '',
        title: titleMap ? titleMap[lang] : (lang === 'en' ? 'Deliverable' : '산출물'),
        lines: lines,
        at: at
      });
    });

    var done = items.filter(function (it) { return it && it.done; }).length;
    var auditor = messages.filter(function (m) { return m.kind === 'auditor'; }).slice(-1)[0];
    var verdict = blockLines(auditor, ['verdict']);
    var names = present.map(function (r) { return r.name; }).join(' · ');
    var finalLines = lang === 'en'
      ? [
        'Agenda: ' + clipLine(a.raw, 160),
        'Decision: ' + a.decision,
        'Departments: ' + present.length + ' · ' + names,
        'Actions: ' + items.length + ' · done ' + done,
        'Conditions: ' + clipLine(verdict[0] || (a.flags.risk ? 'data and access owners must be named' : 'write a stop rule into the minutes'), 140),
        'Next check: ' + a.metric
      ]
      : [
        '안건: ' + clipLine(a.raw, 160),
        '결정: ' + a.decision,
        '참여 부서: ' + present.length + ' · ' + names,
        '액션: ' + items.length + '건 · 완료 ' + done + '건',
        '조건: ' + clipLine(verdict[0] || (a.flags.risk ? '개인정보·권한 담당자를 이름으로 지정' : '중단 기준을 회의록에 남기기'), 140),
        '다음 확인: ' + a.metric
      ];
    if (present.length) {
      outputs.push({
        id: uid('out', (o.projectId || '') + '|final|' + round),
        roleId: 'all',
        kind: 'all',
        name: lang === 'en' ? 'All departments' : '전 부서',
        tag: 'FINAL',
        title: lang === 'en' ? 'Integrated deliverable' : '최종 통합 아웃풋',
        lines: finalLines,
        at: at || 0
      });
    }
    return { outputs: outputs, analysis: a, round: round, departments: present.length, done: done, total: items.length };
  }

  /* Export of one project's deliverables as Markdown, plain text or JSON. */
  function outputsMinutes(project, lang, format) {
    var p = project || {};
    lang = lang === 'en' ? 'en' : 'ko';
    format = format || 'md';
    var outs = p.outputs || [];
    var title = p.title || (lang === 'en' ? 'Untitled project' : '제목 없는 프로젝트');
    var room = p.roomLabel || roomName(p.room || p.roomId, lang);
    var when = p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '';
    var done = (p.items || []).filter(function (i) { return i.done; }).length;
    var total = (p.items || []).length;

    if (format === 'json') {
      return {
        app: 'OneTap AI Team Room',
        version: VERSION,
        kind: 'project-outputs',
        project: {
          id: p.id || '', title: title, room: p.room || p.roomId || '',
          agenda: p.agenda || '', status: p.status || 'active',
          createdAt: p.createdAt || 0, updatedAt: p.updatedAt || 0,
          actions: { done: done, total: total },
          departments: (outs || []).filter(function (o) { return o.kind !== 'all'; }).map(function (o) { return { kind: o.kind, name: o.name, title: o.title }; })
        },
        outputs: outs.map(function (o) { return { kind: o.kind, roleId: o.roleId, name: o.name, title: o.title, lines: o.lines || [] }; }),
        exportedAt: when
      };
    }

    var lines = [];
    lines.push((lang === 'en' ? 'PROJECT OUTPUTS · ' : '프로젝트 아웃풋 · ') + title);
    lines.push((lang === 'en' ? 'Room: ' : '부서: ') + room + (when ? '  ·  ' + when : ''));
    lines.push((lang === 'en' ? 'Actions: ' : '액션: ') + done + '/' + total + (lang === 'en' ? ' done' : ' 완료'));
    lines.push('');
    outs.forEach(function (o) {
      lines.push((format === 'md' ? '## ' : '[') + o.title + (format === 'md' ? '' : ']') + '  ·  ' + o.name);
      (o.lines || []).forEach(function (l) { lines.push((format === 'md' ? '- ' : '  ') + l); });
      lines.push('');
    });
    if (!outs.length) lines.push(lang === 'en' ? 'No outputs yet. Run a meeting in this project.' : '아직 아웃풋이 없습니다. 이 프로젝트에서 회의를 실행하세요.');
    lines.push(lang === 'en' ? 'Made with OneTap AI Team Room.' : '원탭 AI 팀 회의실에서 만들었습니다.');
    return lines.join('\n');
  }

  /* ── live control room ───────────────────────────────────────────────── */
  /* One pure snapshot of what the HQ panel shows: which seat is on air, who
     has reported in the current round, which department monitor lights up,
     and the CEO approval numbers. No DOM, no clock, no storage.

     input = {
       rooms: [roomId], roles: [resolvedRole], messages: [], items: [],
       generating: bool, speakingId: roleId, preview: 'one line'
     } */
  var LIVE_STATE_RANK = { standby: 0, wait: 1, done: 2, live: 3 };

  function liveSnapshot(input) {
    var src = input || {};
    var roles = src.roles || [];
    var messages = (src.messages || []).filter(function (m) { return m && m.roleId !== 'user'; });
    var items = src.items || [];
    var generating = !!src.generating;
    var speakingId = generating ? (src.speakingId || null) : null;
    var preview = String(src.preview || '').replace(/\s+/g, ' ').trim();

    var round = 0;
    messages.forEach(function (m) { round = Math.max(round, m.round || 1); });
    var spoken = {};
    messages.forEach(function (m) {
      if (round && (m.round || 1) === round) spoken[m.roleId] = true;
    });

    var seats = roles.map(function (role) {
      var spoke = !!spoken[role.id];
      var state = 'empty';
      if (speakingId && role.id === speakingId) state = spoke ? 'done' : 'live';
      else if (spoke) state = 'done';
      else if (generating || round > 0) state = 'wait';
      return {
        roleId: role.id,
        name: role.name || '',
        glyph: role.glyph || '',
        accent: role.accent || '#2563eb',
        roomId: Data.ROLE_ROOM[role.kind] || 'general',
        state: state,
        bubble: state === 'live' ? preview : ''
      };
    });

    var monitors = {};
    (src.rooms || []).forEach(function (id) { monitors[id] = 'standby'; });
    var holder = {};
    seats.forEach(function (seat) {
      if (monitors[seat.roomId] === undefined) return;
      var now = holder[seat.roomId];
      if (!now || LIVE_STATE_RANK[seat.state] > LIVE_STATE_RANK[now.state]) holder[seat.roomId] = seat;
    });
    Object.keys(holder).forEach(function (id) {
      if (holder[id].state !== 'empty') monitors[id] = holder[id].state;
    });

    var speaking = null;
    seats.forEach(function (seat) { if (seat.state === 'live') speaking = seat; });

    var done = items.filter(function (i) { return i && i.done; }).length;
    var total = items.length;

    return {
      phase: generating ? 'live' : (messages.length ? 'done' : 'idle'),
      round: round,
      seats: seats,
      speaking: speaking,
      monitors: monitors,
      holders: holder,
      done: done,
      total: total,
      rate: total ? Math.round((done / total) * 100) : 0
    };
  }

  return {
    VERSION: VERSION,
    analyze: analyze,
    liveSnapshot: liveSnapshot,
    breakEven: breakEven,
    generateRound: generateRound,
    reply: reply,
    minutes: minutes,
    summarize: summarize,
    proPrompts: proPrompts,
    proConnected: proConnected,
    proBridge: proBridge,
    proRoute: proRoute,
    bridgePrompt: bridgePrompt,
    parsePro: parsePro,
    parseBridgeAnswer: parseBridgeAnswer,
    buildOutputs: buildOutputs,
    outputsMinutes: outputsMinutes,
    OUTPUT_TITLES: OUTPUT_TITLES,
    defaultRoles: defaultRoles,
    roleName: roleName,
    roomName: roomName,
    blockTitle: blockTitle,
    money: money,
    num: num,
    pct: pct,
    hash: hash,
    uid: uid,
    josa: josa,
    HANGUL: HANGUL
  };
});
