/* ============================================================
   ai-guard.js · AI 응답 구조 검증·복구 (zod 기반)  v1.0.0
   ------------------------------------------------------------
   모델이 형식을 어기면 회의록 표가 깨지던 문제를 막는다.

   1) zod 스키마로 발언 카드 구조를 검사한다.
        { blocks: [{kind, title, lines[]}], items: [{text, owner, due}] }
   2) 형식이 어긋나면 **버릴 수 있는 부분만 버리고** 남은 내용으로
      복구한다(빈 블록 제거, 줄 수·길이 제한, 종류 정규화, 액션 항목 보정).
   3) 복구해도 살릴 수 없으면 ok:false 와 함께 재요청 문구를 준다.
      호출한 쪽이 같은 질문에 "형식 고정" 지시를 붙여 1회 재시도한다.

   zod(MIT)는 필요할 때만 engines/zod.js 에서 받는다(약 450KB).
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.AiGuard = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var KINDS = ['view', 'plan', 'risk', 'ask', 'action', 'audit', 'verdict'];
  var zodLoading = null;

  function loadZod() {
    if (root.Zod) return Promise.resolve(root.Zod);
    if (typeof require === 'function') {
      try { return Promise.resolve(require('./zod.js')); } catch (e) { /* browser */ }
    }
    if (zodLoading) return zodLoading;
    if (!root.document) return Promise.reject(new Error('no_document'));
    zodLoading = new Promise(function (resolve, reject) {
      var s = root.document.createElement('script');
      s.src = 'engines/zod.js';
      s.async = true;
      s.onload = function () { root.Zod ? resolve(root.Zod) : reject(new Error('zod_missing')); };
      s.onerror = function () { zodLoading = null; reject(new Error('zod_load_failed')); };
      root.document.head.appendChild(s);
    });
    return zodLoading;
  }

  /* 스키마는 zod 로 만들되, 실패해도 내장 검사로 이어 간다. */
  function makeSchema(z) {
    var block = z.object({
      kind: z.enum(KINDS),
      title: z.string().min(1).max(40),
      lines: z.array(z.string().min(1).max(600)).min(1).max(10),
    });
    var item = z.object({
      id: z.string().optional(),
      text: z.string().min(1).max(300),
      owner: z.string().max(80),
      due: z.string().max(60),
    });
    return z.object({
      blocks: z.array(block).min(1).max(8),
      items: z.array(item).max(12),
    });
  }

  function clampText(v, max) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max - 1).trim() + '…' : s;
  }

  /** 어떤 모양이 와도 회의록이 읽히는 최소 형태로 복구한다. */
  function repair(parsed, lang) {
    var ko = lang !== 'en';
    var src = parsed || {};
    var blocks = Array.isArray(src.blocks) ? src.blocks : [];
    var out = [];
    blocks.forEach(function (b) {
      if (!b) return;
      var kind = String(b.kind || '').toLowerCase();
      if (KINDS.indexOf(kind) < 0) kind = 'view';
      var lines = (Array.isArray(b.lines) ? b.lines : [b.lines]).map(function (l) { return clampText(l, 600); }).filter(Boolean).slice(0, 10);
      if (!lines.length) return;
      var title = clampText(b.title, 40) || (ko ? (kind === 'view' ? '관점' : kind === 'plan' ? '제안' : kind === 'risk' ? '리스크' : kind === 'ask' ? '요청' : kind === 'action' ? '액션' : kind === 'audit' ? '검수' : '판정') : kind);
      out.push({ kind: kind, title: title, lines: lines });
    });
    if (!out.length) return null;
    var items = (Array.isArray(src.items) ? src.items : []).map(function (it) {
      if (!it) return null;
      var text = clampText(it.text, 300);
      if (!text) return null;
      var out = {
        text: text,
        owner: clampText(it.owner, 80),
        due: clampText(it.due, 60),
      };
      /* 액션 항목 id 는 회의록이 나중에 체크할 때 쓰는 키다. 복구 과정에서 잃으면
         화면에 액션이 붙지 않으므로 반드시 들고 간다. */
      if (it.id) out.id = String(it.id);
      return out;
    }).filter(Boolean).slice(0, 12);
    return { blocks: out.slice(0, 8), items: items };
  }

  function builtinCheck(value) {
    var issues = [];
    if (!value || !Array.isArray(value.blocks) || !value.blocks.length) issues.push('blocks');
    if (value && value.blocks) {
      value.blocks.forEach(function (b, i) {
        if (KINDS.indexOf(b.kind) < 0) issues.push('block' + i + '.kind');
        if (!b.title) issues.push('block' + i + '.title');
        if (!b.lines || !b.lines.length) issues.push('block' + i + '.lines');
      });
    }
    return issues;
  }

  /**
   * @returns Promise<{ok, value, issues, repaired, reason?}>
   *   ok: true  → value 를 그대로 쓰면 된다(복구본일 수 있음)
   *   ok: false → 재요청 필요(reason: 'unrepairable' | 'zod_unavailable' ...)
   */
  function check(parsed, lang) {
    var repaired = repair(parsed, lang);
    var builtin = builtinCheck(repaired);
    if (!repaired || builtin.length) {
      return Promise.resolve({ ok: false, value: repaired, issues: builtin, reason: 'unrepairable' });
    }
    return loadZod().then(function (z) {
      var schema = makeSchema(z);
      var res = schema.safeParse(repaired);
      if (res.success) return { ok: true, value: res.data, issues: [], repaired: res.data !== parsed };
      var again = repair(parsed, lang);
      var second = schema.safeParse(again);
      if (second.success) return { ok: true, value: second.data, issues: [], repaired: true };
      return {
        ok: false, value: repaired,
        issues: second.error && second.error.issues ? second.error.issues.slice(0, 4) : [],
        reason: 'schema_mismatch',
      };
    }).catch(function (err) {
      /* zod 를 못 받아도 내장 검사를 통과했으면 그대로 쓴다. */
      return { ok: true, value: repaired, issues: [], repaired: true, reason: (err && err.message) || 'zod_unavailable' };
    });
  }

  /** 재시도 때 같은 질문 끝에 붙이는 형식 고정 지시. */
  function strictInstruction(lang) {
    if (lang === 'en') {
      return [
        '',
        'The previous answer did not fit the format. Answer again and follow it exactly.',
        'Start with "View: " on one line, then "Plan:", "Risk:", "Ask:", "Action:" as headings,',
        'each bullet on its own line starting with "- ". No preamble, no closing remarks, no code fences.',
      ].join('\n');
    }
    return [
      '',
      '앞선 답변이 형식에 맞지 않았습니다. 같은 내용을 아래 형식으로만 다시 써 주세요.',
      '첫 줄은 "관점: " 한 문단, 그다음 "제안:", "리스크:", "요청:", "액션:" 제목을 그대로 쓰고',
      '각 항목은 "- " 로 시작하는 한 줄로 적습니다. 인사말·맺음말·코드블록 없이 답만.',
    ].join('\n');
  }

  return {
    VERSION: VERSION,
    KINDS: KINDS,
    check: check,
    repair: repair,
    strictInstruction: strictInstruction,
    loadZod: loadZod,
  };
});
