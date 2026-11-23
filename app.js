/* ============================================================================
 * OneTap AI Team Room · app.js
 * Wires the eight department rooms and the ones the user adds, the free engine,
 * the BYOK Pro relay, replies, the checklist, exports and EN/KO. Everything is
 * kept in localStorage under onetap.teamroom.v1.
 * ==========================================================================*/
(function () {
  'use strict';

  var Core = window.TeamRoomCore;
  var Data = window.TeamRoomData;
  var I18N = window.TeamRoomI18n;
  var STORE = 'onetap.teamroom.v1';
  var PRO_STORE = 'onetap.teamroom.pro.v1';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var FOCUS_KEY = { pm: 'team.focusPm', dev: 'team.focusDev', growth: 'team.focusGrowth', cfo: 'team.focusCfo', auditor: 'team.focusAuditor' };
  var PROVIDERS = {
    openai: { model: 'gpt-4o-mini', endpoint: 'https://api.openai.com/v1/chat/completions' },
    gemini: { model: 'gemini-2.5-flash', endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/' },
    claude: { model: 'claude-sonnet-4-20250514', endpoint: 'https://api.anthropic.com/v1/messages' }
  };
  var MAX_ROLES = 10;

  var state = {
    lang: 'ko',
    mode: 'free',
    room: 'general',
    roles: [],
    customRooms: [],
    rooms: {},
    generating: false,
    thinking: null,
    speakingId: null,
    livePreview: '',
    replyTo: null,
    editingRole: null,
    token: 0,
    pro: null,
    proError: null,
    proFailIndex: null
  };
  var saveTimer = null;
  var toastTimer = null;

  /* ── storage ─────────────────────────────────────────────────────────── */

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyRoom() {
    return { agenda: '', startedAgenda: '', messages: [], items: [] };
  }

  function defaultRoles() {
    return Data.ROLE_ARCHETYPES.map(function (a) {
      return {
        id: a.kind,
        kind: a.kind,
        tag: a.tag,
        glyph: a.glyph,
        accent: a.accent,
        name: { ko: a.name.ko, en: a.name.en },
        custom: false
      };
    });
  }

  function normalizeRoles(raw) {
    var base = defaultRoles();
    if (!Array.isArray(raw) || !raw.length) return base;
    var mapped = raw.map(function (r, i) {
      var fallback = base.filter(function (b) { return b.id === r.id; })[0] || base[i] || base[0];
      return {
        id: r.id || fallback.id || ('r' + i),
        kind: r.kind || fallback.kind,
        tag: r.tag || fallback.tag,
        glyph: r.glyph || fallback.glyph,
        accent: r.accent || fallback.accent,
        name: {
          ko: (r.name && r.name.ko) || fallback.name.ko,
          en: (r.name && r.name.en) || fallback.name.en
        },
        custom: !!r.custom
      };
    });
    /* A record saved by the four-role version has no Tech Lead. Base roles
       cannot be removed in the UI, so restore any that are missing. */
    Data.ROLE_ARCHETYPES.forEach(function (a, idx) {
      if (mapped.some(function (r) { return r.kind === a.kind; })) return;
      mapped.splice(Math.min(idx, mapped.length), 0, {
        id: a.kind, kind: a.kind, tag: a.tag, glyph: a.glyph, accent: a.accent,
        name: { ko: a.name.ko, en: a.name.en }, custom: false
      });
    });
    return mapped.slice(0, MAX_ROLES);
  }

  function normalizeCustomRooms(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (r, i) {
      if (!r || typeof r !== 'object') return;
      var nameKo = r.name && typeof r.name.ko === 'string' ? r.name.ko.trim() : '';
      if (!nameKo) return;
      var id = String(r.id || ('custom_' + i));
      if (!/^custom_/.test(id)) id = 'custom_' + id.replace(/[^a-z0-9]/gi, '');
      var nameEn = (r.name && typeof r.name.en === 'string' && r.name.en.trim()) || nameKo;
      var descKo = (r.desc && typeof r.desc.ko === 'string') ? r.desc.ko : '';
      var descEn = (r.desc && typeof r.desc.en === 'string' && r.desc.en.trim()) || descKo;
      out.push({
        id: id,
        glyph: String(r.glyph || nameKo.slice(0, 1)).slice(0, 2),
        name: { ko: nameKo, en: nameEn },
        desc: { ko: descKo, en: descEn },
        custom: true
      });
    });
    return out;
  }

  function load() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { raw = null; }
    state.customRooms = [];
    if (raw && typeof raw === 'object') {
      if (raw.lang === 'en' || raw.lang === 'ko') state.lang = raw.lang;
      if (raw.mode === 'pro') state.mode = 'pro';
      state.roles = normalizeRoles(raw.roles);
      state.customRooms = normalizeCustomRooms(raw.customRooms);
      if (raw.room && allRooms().some(function (r) { return r.id === raw.room; })) state.room = raw.room;
    } else {
      state.roles = defaultRoles();
    }
    allRooms().forEach(function (r) {
      var src = raw && raw.rooms && raw.rooms[r.id];
      var room = emptyRoom();
      if (src && typeof src === 'object') {
        room.agenda = typeof src.agenda === 'string' ? src.agenda : '';
        room.startedAgenda = typeof src.startedAgenda === 'string' ? src.startedAgenda : '';
        room.messages = Array.isArray(src.messages) ? src.messages : [];
        room.items = Array.isArray(src.items) ? src.items : [];
      }
      state.rooms[r.id] = room;
    });
    var pro = null;
    try { pro = JSON.parse(localStorage.getItem(PRO_STORE) || 'null'); } catch (e) { pro = null; }
    if (pro && pro.key && PROVIDERS[pro.provider]) state.pro = pro;
    if (state.mode === 'pro' && !state.pro) state.mode = 'free';
  }

  function save() {
    try {
      var payload = {
        v: 1,
        lang: state.lang,
        mode: state.mode,
        room: state.room,
        roles: state.roles,
        customRooms: state.customRooms,
        rooms: state.rooms
      };
      localStorage.setItem(STORE, JSON.stringify(payload));
    } catch (e) { /* storage full or blocked: the app still works in memory */ }
  }

  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 220);
  }

  function savePro() {
    try {
      if (state.pro) localStorage.setItem(PRO_STORE, JSON.stringify(state.pro));
      else localStorage.removeItem(PRO_STORE);
    } catch (e) { /* ignore */ }
  }

  /* ── strings ─────────────────────────────────────────────────────────── */

  function t(key, vars) {
    var pack = I18N[state.lang] || I18N.ko;
    var s = pack[key] != null ? pack[key] : (I18N.en[key] != null ? I18N.en[key] : key);
    if (vars) {
      Object.keys(vars).forEach(function (k) { s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    }
    return s;
  }

  function lang() { return state.lang; }
  function room() { return state.rooms[state.room]; }

  function roleName(role) {
    if (!role) return '';
    if (role.name && role.name[lang()]) return role.name[lang()];
    if (role.name && role.name.ko) return role.name.ko;
    var base = Data.ROLE_ARCHETYPES.filter(function (a) { return a.kind === role.kind; })[0];
    return base ? base.name[lang()] : (role.tag || 'AI');
  }

  function resolvedRoles() {
    return state.roles.map(function (r, i) {
      return {
        id: r.id,
        kind: r.kind,
        tag: r.custom ? t('team.customTag') : r.tag,
        glyph: r.glyph,
        accent: r.accent,
        name: roleName(r),
        focus: t(FOCUS_KEY[r.kind] || 'team.focusPm'),
        index: i,
        custom: r.custom
      };
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function timeText(ts) {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleTimeString(lang() === 'en' ? 'en-US' : 'ko-KR', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function allRooms() {
    return Data.ROOMS.concat(state.customRooms || []);
  }

  function roomInfo(id) {
    return allRooms().filter(function (r) { return r.id === id; })[0] || Data.ROOMS[0];
  }

  function roomMeta(id) { return roomInfo(id); }

  /* A department the user added has no catalog samples; data.js fills three
     templates with the department name so the room is usable right away. */
  function roomSamples(id) {
    var info = roomInfo(id);
    return Data.samplesFor(id, lang(), info.name[lang()]);
  }

  /* ── language ────────────────────────────────────────────────────────── */

  function applyLang() {
    document.documentElement.lang = lang();
    document.title = t('meta.title');
    setMeta('name', 'description', t('meta.description'));
    setMeta('property', 'og:title', t('meta.ogTitle'));
    setMeta('property', 'og:description', t('meta.ogDescription'));
    $$('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    $$('[data-i18n-placeholder]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
    $$('[data-i18n-aria]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    $$('[data-lang]').forEach(function (b) {
      var on = b.getAttribute('data-lang') === lang();
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.documentElement.setAttribute('data-ui-lang', lang());
  }

  function setMeta(attr, name, content) {
    var el = document.querySelector('meta[' + attr + '="' + name + '"]');
    if (el) el.setAttribute('content', content);
  }

  /* ── render: rooms + samples ─────────────────────────────────────────── */

  function renderRooms() {
    var nav = $('#roomTabs');
    if (nav) {
      nav.innerHTML = allRooms().map(function (r) {
        var on = r.id === state.room;
        var count = state.rooms[r.id] ? state.rooms[r.id].messages.filter(function (m) { return m.roleId !== 'user'; }).length : 0;
        var label = (r.short && r.short[lang()]) || r.name[lang()];
        return '<button type="button" class="room-tab' + (on ? ' is-on' : '') + '" data-room="' + esc(r.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" title="' + esc(r.name[lang()]) + '">'
          + '<span class="room-tab__glyph" aria-hidden="true">' + esc(r.glyph || label.slice(0, 1)) + '</span>'
          + '<span class="room-tab__name">' + esc(label) + '</span>'
          + '<span class="room-tab__count" data-count="' + esc(r.id) + '">' + count + '</span>'
          + '</button>';
      }).join('');
      var active = nav.querySelector('.room-tab.is-on');
      if (active && active.scrollIntoView && nav.scrollWidth > nav.clientWidth + 2) {
        try { active.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* older engines */ }
      }
    }
    var meta = roomInfo(state.room);
    var title = $('#threadTitle');
    var sub = $('#threadSub');
    if (title) title.textContent = meta.name[lang()];
    if (sub) sub.textContent = meta.desc[lang()] || t('room.descEmpty');
    var del = $('#deleteRoomBtn');
    if (del) del.hidden = !meta.custom;
  }

  function renderSamples() {
    var box = $('#sampleChips');
    if (!box) return;
    var list = roomSamples(state.room);
    box.innerHTML = list.map(function (text, i) {
      return '<button type="button" class="sample-chip" data-sample="' + i + '"><b>' + String(i + 1).padStart(2, '0') + '</b>' + esc(text) + '</button>';
    }).join('');
  }

  function renderAgenda() {
    var input = $('#agendaInput');
    if (input && document.activeElement !== input) input.value = room().agenda || '';
    updateCount();
  }

  function updateCount() {
    var input = $('#agendaInput');
    var el = $('#agendaCount');
    if (!input || !el) return;
    el.textContent = t('agenda.chars', { n: input.value.length });
  }

  /* ── render: roster ──────────────────────────────────────────────────── */

  function renderRoster() {
    var list = $('#roster');
    if (!list) return;
    list.innerHTML = state.roles.map(function (r) {
      var editing = state.editingRole === r.id;
      var name = roleName(r);
      var body;
      if (editing) {
        body = '<div class="roster__edit">'
          + '<input type="text" maxlength="24" value="' + esc(name) + '" data-role-input="' + esc(r.id) + '" aria-label="' + esc(t('team.nameLabel')) + '">'
          + '<button type="button" class="is-primary" data-role-save="' + esc(r.id) + '">' + esc(t('team.save')) + '</button>'
          + '<button type="button" data-role-cancel="' + esc(r.id) + '">' + esc(t('team.cancel')) + '</button>'
          + '</div>';
      } else {
        body = '<button type="button" class="roster__name" data-role-edit="' + esc(r.id) + '">' + esc(name)
          + ' <span class="roster__tag">' + esc(r.custom ? t('team.customTag') : r.tag) + '</span></button>'
          + '<span class="roster__focus">' + esc(t(FOCUS_KEY[r.kind] || 'team.focusPm')) + '</span>';
      }
      var remove = r.custom && !editing
        ? '<button type="button" class="roster__remove" data-role-remove="' + esc(r.id) + '" aria-label="' + esc(t('team.remove')) + '">×</button>'
        : '';
      return '<li class="roster__row" data-role-row="' + esc(r.id) + '" style="--role:' + esc(r.accent) + '">'
        + '<span class="avatar" aria-hidden="true">' + esc(r.glyph || name.slice(0, 1)) + '</span>'
        + '<div class="roster__body">' + body + '</div>' + remove + '</li>';
    }).join('');
    if (state.editingRole) {
      var input = list.querySelector('[data-role-input]');
      if (input) {
        input.focus();
        input.select();
      }
    }
  }

  /* ── render: thread ──────────────────────────────────────────────────── */

  function blocksHtml(m) {
    return '<div class="msg__body">' + (m.blocks || []).map(function (b) {
      var title = b.title || Core.blockTitle(b.kind, lang());
      return '<section class="block"><h4 class="block__label">' + esc(title) + '</h4>'
        + '<ul class="block__lines">' + (b.lines || []).map(function (line) {
          return '<li>' + esc(line) + '</li>';
        }).join('') + '</ul></section>';
    }).join('') + '</div>';
  }

  function parentName(id) {
    var parent = (room().messages || []).filter(function (m) { return m.id === id; })[0];
    if (!parent) return '';
    return parent.roleId === 'user' ? t('thread.you') : parent.name;
  }

  function replyFormHtml(m) {
    return '<form class="reply-form" data-reply-form="' + esc(m.id) + '">'
      + '<label class="sr" for="reply-' + esc(m.id) + '">' + esc(t('thread.reply')) + '</label>'
      + '<textarea id="reply-' + esc(m.id) + '" rows="2" maxlength="400" spellcheck="false" placeholder="' + esc(t('thread.replyPlaceholder')) + '"></textarea>'
      + '<div class="reply-form__row">'
      + '<span class="reply-form__hint">' + esc(t('thread.replyTo', { name: m.name })) + '</span>'
      + '<button type="button" class="btn btn--quiet btn--sm" data-reply-cancel="1">' + esc(t('thread.cancel')) + '</button>'
      + '<button type="submit" class="btn btn--primary btn--sm">' + esc(t('thread.send')) + '</button>'
      + '</div></form>';
  }

  function roleMsgHtml(m) {
    var badge = m.mode === 'pro'
      ? '<span class="badge">' + esc(t('thread.proBadge')) + '</span>'
      : '<span class="badge">' + esc(t('thread.freeBadge')) + '</span>';
    if (m.kind === 'auditor') badge += '<span class="badge badge--audit">' + esc(t('thread.auditBadge')) + '</span>';
    var replyLine = m.replyTo
      ? '<p class="msg__replyto">↳ ' + esc(t('thread.replyTo', { name: parentName(m.replyTo) })) + '</p>'
      : '';
    var items = (m.itemIds || []).length
      ? '<span class="msg__chip">' + esc(t('summary.items')) + ' ' + (m.itemIds || []).length + '</span>'
      : '';
    var form = state.replyTo === m.id ? replyFormHtml(m) : '';
    return '<article class="msg' + (m.kind === 'auditor' ? ' msg--audit' : '') + '" data-msg-id="' + esc(m.id) + '" data-role-id="' + esc(m.roleId) + '" style="--role:' + esc(m.accent || '#2563eb') + '">'
      + '<header class="msg__head">'
      + '<div class="msg__who"><span class="avatar" aria-hidden="true">' + esc(m.glyph || (m.name || '?').slice(0, 1)) + '</span>'
      + '<span class="msg__name">' + esc(m.name) + '</span><span class="msg__tag">' + esc(m.tag || '') + '</span></div>'
      + '<div class="msg__meta">' + badge + (m.round > 1 ? '<span>' + esc(t('thread.round', { n: m.round })) + '</span>' : '') + '<span>' + esc(timeText(m.ts)) + '</span></div>'
      + '</header>' + replyLine + blocksHtml(m)
      + '<footer class="msg__foot">' + items
      + '<button type="button" class="msg__act" data-reply="' + esc(m.id) + '">' + esc(t('thread.reply')) + '</button>'
      + '<button type="button" class="msg__act msg__act--quiet" data-copy-msg="' + esc(m.id) + '">' + esc(t('thread.copyMsg')) + '</button>'
      + '</footer>' + form + '</article>';
  }

  function userMsgHtml(m) {
    var target = m.replyTo ? parentName(m.replyTo) : '';
    return '<article class="msg msg--user" data-msg-id="' + esc(m.id) + '" data-role-id="user">'
      + '<header class="msg__head"><div class="msg__who"><span class="avatar" style="--role:#1d4ed8" aria-hidden="true">' + esc(lang() === 'en' ? 'Y' : '나') + '</span>'
      + '<span class="msg__name">' + esc(t('thread.you')) + '</span></div>'
      + '<div class="msg__meta">' + (target ? '<span>→ ' + esc(target) + '</span>' : '') + '<span>' + esc(timeText(m.ts)) + '</span></div></header>'
      + '<p class="msg__text">' + esc(m.text) + '</p></article>';
  }

  function thinkingHtml() {
    return '<article class="msg msg--thinking" data-thinking="1">'
      + '<div class="thinking-head"><span class="spinner" aria-hidden="true"></span>'
      + '<span>' + esc(t('thread.thinking', { name: state.thinking || t('thread.typing') })) + '</span></div>'
      + '<div class="skeleton" aria-hidden="true"><span></span><span></span><span></span></div></article>';
  }

  function renderThread() {
    var box = $('#thread');
    if (!box) return;
    var msgs = room().messages || [];
    if (!msgs.length) {
      box.innerHTML = '<div class="empty"><span class="empty__icon" aria-hidden="true">4</span>'
        + '<h3>' + esc(t('thread.emptyTitle')) + '</h3>'
        + '<p>' + esc(t('thread.emptyBody')) + '</p></div>';
    } else {
      box.innerHTML = msgs.map(function (m) { return m.roleId === 'user' ? userMsgHtml(m) : roleMsgHtml(m); }).join('')
        + (state.generating ? thinkingHtml() : '');
    }
    var cont = $('#continueBtn');
    if (cont) cont.hidden = !msgs.length || state.generating;
  }

  /* ── render: actions / summary / progress ───────────────────────────── */

  function renderActions() {
    var list = $('#actionList');
    var empty = $('#actionsEmpty');
    if (!list) return;
    var items = room().items || [];
    var done = items.filter(function (i) { return i.done; }).length;
    list.innerHTML = items.map(function (it) {
      return '<li><label class="action' + (it.done ? ' is-done' : '') + '">'
        + '<input type="checkbox" data-item="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + ' aria-label="' + esc(it.text) + '">'
        + '<div class="action__body"><span class="action__text">' + esc(it.text) + '</span>'
        + '<span class="action__meta"><span><b>' + esc(t('actions.ownerLabel')) + '</b> ' + esc(it.owner || '—') + '</span>'
        + '<span><b>' + esc(t('actions.dueLabel')) + '</b> ' + esc(it.due || '—') + '</span></span></div></label></li>';
    }).join('');
    if (empty) empty.hidden = items.length > 0;
    var progress = $('#actionsProgress');
    if (progress) progress.textContent = items.length ? t('actions.progress', { done: done, total: items.length }) : '0/0';
    var bar = $('#actionsBar');
    if (bar) bar.style.width = items.length ? Math.round((done / items.length) * 100) + '%' : '0%';
  }

  function renderSummary() {
    var s = Core.summarize({ messages: room().messages, items: room().items });
    var set = function (id, v) { var el = $('#' + id); if (el) el.textContent = String(v); };
    set('sumMessages', s.messages);
    set('sumReplies', s.replies);
    set('sumItems', s.items);
    set('sumDone', s.done);
    set('sumAudits', s.audits);
  }

  function renderMode() {
    $$('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var gear = $('#proOpen');
    if (gear) {
      gear.classList.toggle('has-key', !!state.pro);
      gear.style.color = state.pro ? 'var(--ok)' : '';
    }
  }

  /* ── art: warm clay diorama (see art.js) ─────────────────────────────── */

  /* Each department card is a photographed clay miniature room (local WebP,
     generated for this app) with a hand-drawn clay toy figure sitting in it.
     art.js owns the drawings; this file only decides who sits where. */
  var Art = window.TeamRoomArt;

  function deptAccent(id) { return Art.deptAccent(id); }
  function lookFor(role) { return Art.lookFor(role); }
  function figSvg(L, o) { return Art.figure(L, o || {}); }
  function chairSvg() { return Art.chair(); }
  function wsScene(o) { return Art.scene(o || {}); }

  /* ── render: AI HQ live control room ─────────────────────────────────── */

  /* The panel is a read of the same record the thread and checklist use, so a
     seat, a monitor and the CEO gauge can never disagree with them. */
  function liveModel() {
    return Core.liveSnapshot({
      rooms: allRooms().map(function (r) { return r.id; }),
      roles: resolvedRoles(),
      messages: room().messages || [],
      items: room().items || [],
      generating: state.generating,
      speakingId: state.speakingId,
      preview: state.livePreview
    });
  }

  /* First line of the turn that is being typed: the real-time bubble. */
  function previewLine(m) {
    if (!m) return '';
    var block = (m.blocks || [])[0];
    var line = block && (block.lines || [])[0] ? block.lines[0] : (m.text || '');
    line = String(line).replace(/\s+/g, ' ').trim();
    return line.length > 92 ? line.slice(0, 92) + '…' : line;
  }

  function todayAgendaCount() {
    var today = new Date().toDateString();
    var n = 0;
    Object.keys(state.rooms).forEach(function (id) {
      var r = state.rooms[id];
      if (!r || !r.startedAgenda) return;
      var hit = (r.messages || []).some(function (m) {
        return m && m.ts && new Date(m.ts).toDateString() === today;
      });
      if (hit) n += 1;
    });
    return n;
  }

  function monitorBadge(st) {
    if (st === 'live') return t('hq.badge.onAir');
    if (st === 'done') return t('hq.badge.done');
    return t('hq.badge.standby');
  }

  function seatBadge(st) {
    if (st === 'live') return t('hq.badge.onAir');
    if (st === 'done') return t('hq.badge.doneCheck');
    if (st === 'wait') return t('hq.seat.wait');
    return t('hq.seat.empty');
  }

  /* One department card = one clay diorama room (local WebP) with the clay
     figure of whoever holds that monitor sitting in it right now. */
  function monitorHtml(meta, snap, byId) {
    var st = snap.monitors[meta.id] || 'standby';
    var holder = snap.holders[meta.id] || null;
    var role = holder ? byId[holder.roleId] : null;
    var r = state.rooms[meta.id] || { messages: [], items: [] };
    var items = r.items || [];
    var doneItems = items.filter(function (i) { return i.done; }).length;
    /* The line a monitor keeps after a turn is the first line of that turn. */
    var lastTurn = null;
    if (holder) {
      var mine = (room().messages || []).filter(function (m) {
        return m.roleId === holder.roleId && (m.round || 1) === (snap.round || 1);
      });
      /* A reply quotes my words first; keep the monitor on the role's own line. */
      var own = mine.filter(function (m) { return !m.replyTo; });
      lastTurn = (own.length ? own : mine).slice(-1)[0] || null;
    }
    var line;
    if (st === 'live') line = (holder && holder.bubble) || t('hq.room.writing', { name: holder ? holder.name : '' });
    else if (st === 'done' && lastTurn) line = previewLine(lastTurn);
    else if (st === 'done') line = t('hq.monitor.reported', { n: items.length });
    else if (items.length) line = t('hq.monitor.pending', { n: items.length - doneItems });
    else line = t('hq.monitor.idle');
    var label = (meta.short && meta.short[lang()]) || meta.name[lang()];
    var holdName = holder ? holder.name : label;
    var accent = holder ? holder.accent : deptAccent(meta.id);
    var look = lookFor(role || { kind: 'pm', accent: accent });
    return '<li class="monitor is-' + st + (meta.id === state.room ? ' is-current' : '') + '" data-monitor="' + esc(meta.id) + '" data-state="' + st + '">'
      + '<div class="monitor__scene">'
      + wsScene({ roomId: meta.id, accent: accent, look: look, present: !!holder, state: st })
      + (st === 'live' ? '<span class="monitor__say" aria-hidden="true">' + esc(line) + '</span>' : '')
      + '<span class="monitor__head"><span class="monitor__glyph" aria-hidden="true">' + esc(String(meta.glyph || '').slice(0, 1)) + '</span>'
      + '<span class="monitor__name">' + esc(label) + '</span></span>'
      + '</div>'
      + '<div class="monitor__plate"><span class="monitor__role">' + esc(holdName) + '</span>'
      + '<span class="monitor__line">' + esc(line) + '</span></div>'
      + '<div class="monitor__foot"><span class="monitor__badge"><i aria-hidden="true"></i>' + esc(monitorBadge(st)) + '</span>'
      + '<span class="monitor__stat">' + esc(t('hq.monitor.items', { d: doneItems, t: items.length })) + '</span></div>'
      + '</li>';
  }

  /* A seat at the clay meeting table: a figure on a stool, name and state
     under it. Before the meeting starts the stool is empty. */
  function seatHtml(seat, byId, front) {
    var role = byId[seat.roleId];
    var look = lookFor(role || { kind: 'pm', accent: seat.accent });
    var up = seat.state === 'live';
    var fig = seat.state === 'empty'
      ? chairSvg()
      : figSvg(look, { armUp: up, chair: true, chairCol: '#A87A4C', seatFront: !!front });
    return '<li class="seat is-' + seat.state + '" data-seat="' + esc(seat.roleId) + '" data-state="' + seat.state + '">'
      + '<span class="seat__avatar" style="--role:' + esc(seat.accent) + '" aria-hidden="true">' + fig + '</span>'
      + '<span class="seat__body"><span class="seat__name">' + esc(seat.name) + '</span>'
      + '<span class="seat__badge">' + esc(seatBadge(seat.state)) + '</span></span></li>';
  }

  function renderLive() {
    var left = $('#hqLeft');
    var right = $('#hqRight');
    if (!left || !right) return;
    var snap = liveModel();
    var roles = resolvedRoles();
    var byId = {};
    roles.forEach(function (r) { byId[r.id] = r; });
    var rooms = allRooms();
    var half = Math.ceil(rooms.length / 2);
    left.innerHTML = rooms.slice(0, half).map(function (r) { return monitorHtml(r, snap, byId); }).join('');
    right.innerHTML = rooms.slice(half).map(function (r) { return monitorHtml(r, snap, byId); }).join('');

    var seats = snap.seats;
    var cut = Math.ceil(seats.length / 2);
    var top = $('#mroomTop');
    var bottom = $('#mroomBottom');
    if (top) top.innerHTML = seats.slice(0, cut).map(function (s) { return seatHtml(s, byId, false); }).join('');
    if (bottom) bottom.innerHTML = seats.slice(cut).map(function (s) { return seatHtml(s, byId, true); }).join('');

    var mroom = $('#mroom');
    if (mroom) mroom.setAttribute('data-state', snap.phase);
    var tag = $('#mroomTag');
    if (tag) {
      tag.textContent = snap.phase === 'live' ? t('hq.room.tagLive')
        : (snap.phase === 'done' ? t('hq.room.tagDone') : t('hq.room.tagIdle'));
    }

    var agenda = $('#mroomAgenda');
    if (agenda) {
      var text = room().startedAgenda || room().agenda || '';
      agenda.innerHTML = '<b>' + esc(t('hq.room.agendaLabel')) + '</b> '
        + (text ? esc(text) : esc(t('hq.room.noAgenda')));
    }

    var air = $('#mroomAir');
    var note = $('#mroomNote');
    if (air && note) {
      if (snap.phase === 'live') {
        var who = snap.speaking ? snap.speaking.name : '';
        var bubble = (snap.speaking && snap.speaking.bubble) || t('hq.room.writing', { name: who });
        air.hidden = false;
        note.hidden = true;
        var airWho = $('#mroomAirWho');
        if (airWho) airWho.textContent = who ? ' · ' + who : '';
        var bubbleEl = $('#mroomBubble');
        if (bubbleEl) bubbleEl.textContent = '“' + bubble + '”';
      } else {
        air.hidden = true;
        note.hidden = false;
        note.textContent = snap.phase === 'done'
          ? (snap.total ? t('hq.room.doneNote', { n: snap.total }) : t('hq.room.tagDone'))
          : t('hq.room.idle');
      }
    }

    var foot = $('#mroomFoot');
    if (foot) {
      var reported = seats.filter(function (s) { return s.state === 'done'; }).length;
      foot.textContent = snap.phase === 'idle'
        ? t('hq.room.footIdle', { seats: seats.length })
        : t('hq.room.foot', { seats: seats.length, done: reported, round: snap.round || 1 });
    }

    var hudAgendas = $('#hudAgendas');
    if (hudAgendas) hudAgendas.textContent = t('hq.hud.agendaValue', { n: todayAgendaCount() });
    var hudDone = $('#hudDone');
    if (hudDone) hudDone.textContent = snap.done + '/' + snap.total;
    var hudRate = $('#hudRate');
    if (hudRate) hudRate.textContent = snap.rate + '%';
    var gauge = $('#hqGauge');
    if (gauge) gauge.style.width = snap.rate + '%';
    var bar = $('#hudBar');
    if (bar) bar.setAttribute('aria-valuenow', String(snap.rate));
  }

  function renderAll() {
    applyLang();
    renderRooms();
    renderSamples();
    renderAgenda();
    renderRoster();
    renderThread();
    renderActions();
    renderSummary();
    renderMode();
    renderLive();
  }

  /* ── free run ────────────────────────────────────────────────────────── */

  function clearError() {
    var err = $('#agendaError');
    if (err) { err.hidden = true; err.textContent = ''; err.innerHTML = ''; }
    state.proError = null;
    state.proFailIndex = null;
  }

  function showError(msg) {
    var err = $('#agendaError');
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
  }

  function maxRound() {
    return (room().messages || []).reduce(function (n, m) { return Math.max(n, m.round || 1); }, 0);
  }

  function setGenerating(on, label) {
    state.generating = on;
    var btn = $('#runBtn');
    if (btn) btn.disabled = on;
    var prog = $('#runProgress');
    if (prog) prog.hidden = !on;
    if (label) {
      var txt = $('#runProgressText');
      if (txt) txt.textContent = label;
    }
    var cont = $('#continueBtn');
    if (cont) cont.hidden = on || !room().messages.length;
  }

  function appendMessage(target, msg) {
    target.messages.push(msg);
    save();
    renderThread();
    renderActions();
    renderSummary();
    renderRooms();
    renderLive();
  }

  function appendItems(target, itemIds, allItems) {
    var map = {};
    allItems.forEach(function (it) { map[it.id] = it; });
    (itemIds || []).forEach(function (id) {
      if (map[id] && !target.items.some(function (x) { return x.id === id; })) target.items.push(map[id]);
    });
    save();
    renderActions();
    renderSummary();
    renderLive();
  }

  function prepareRun(round) {
    var text = $('#agendaInput').value.trim();
    var r = room();
    clearError();
    if (!text) {
      showError(t('agenda.needText'));
      $('#agendaInput').focus();
      return null;
    }
    if (r.messages.length && text !== r.startedAgenda) {
      showError(t('agenda.busy'));
      return null;
    }
    if (!r.messages.length) {
      r.agenda = text;
      r.startedAgenda = text;
      r.messages = [];
      r.items = [];
      round = 1;
    }
    return { text: text, round: round || (maxRound() + 1) };
  }

  function runFree(round) {
    if (state.generating) return;
    var plan = prepareRun(round);
    if (!plan) return;
    var target = room();
    var result = Core.generateRound({
      agenda: plan.text,
      room: state.room,
      roomName: roomInfo(state.room).name[lang()],
      lang: lang(),
      roles: resolvedRoles(),
      round: plan.round,
      seed: 0
    });
    var token = ++state.token;
    state.replyTo = null;
    setGenerating(true, t('agenda.running'));
    renderThread();

    var i = 0;
    function step() {
      if (token !== state.token) return;
      if (i >= result.messages.length) {
        state.thinking = null;
        state.speakingId = null;
        state.livePreview = '';
        setGenerating(false);
        renderThread();
        renderLive();
        save();
        return;
      }
      var m = result.messages[i];
      state.thinking = m.name;
      state.speakingId = m.roleId;
      state.livePreview = previewLine(m);
      renderThread();
      renderLive();
      var delay = i === 0 ? 380 : 520;
      setTimeout(function () {
        if (token !== state.token) return;
        m.ts = Date.now();
        state.thinking = null;
        state.livePreview = '';
        appendMessage(target, m);
        appendItems(target, m.itemIds, result.items);
        renderActions();
        i += 1;
        if (i < result.messages.length) {
          state.thinking = result.messages[i].name;
          state.speakingId = result.messages[i].roleId;
          state.livePreview = previewLine(result.messages[i]);
          renderThread();
          renderLive();
          setTimeout(step, 280);
        } else {
          state.speakingId = null;
          setGenerating(false);
          renderThread();
          renderLive();
          save();
        }
      }, delay);
    }
    state.thinking = result.messages.length ? result.messages[0].name : null;
    state.speakingId = result.messages.length ? result.messages[0].roleId : null;
    state.livePreview = result.messages.length ? previewLine(result.messages[0]) : '';
    renderThread();
    renderLive();
    setTimeout(step, 300);
  }

  /* ── Pro: provider calls ─────────────────────────────────────────────── */

  function proReady() {
    return !!(state.pro && state.pro.key && PROVIDERS[state.pro.provider]);
  }

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••';
    return key.slice(0, 4) + '…' + key.slice(-4);
  }

  function callProvider(messages, signal) {
    var cfg = state.pro;
    if (!cfg || !PROVIDERS[cfg.provider]) return Promise.reject(new Error('bad config'));
    var provider = cfg.provider;
    var model = (cfg.model || PROVIDERS[provider].model).trim();
    var key = cfg.key;
    var url, options;

    if (provider === 'openai') {
      url = PROVIDERS.openai.endpoint;
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model: model,
          temperature: 0.6,
          max_tokens: 900,
          messages: messages
        })
      };
    } else if (provider === 'gemini') {
      url = PROVIDERS.gemini.endpoint + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
      var sys = messages.filter(function (m) { return m.role === 'system'; })[0];
      var usr = messages.filter(function (m) { return m.role === 'user'; })[0];
      options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: (sys ? sys.content + '\n\n' : '') + (usr ? usr.content : '') }] }],
          generationConfig: { temperature: 0.6, maxOutputTokens: 1200 }
        })
      };
    } else {
      url = PROVIDERS.claude.endpoint;
      var system = messages.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n\n');
      var user = messages.filter(function (m) { return m.role === 'user'; }).map(function (m) { return m.content; }).join('\n\n');
      options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 1200,
          temperature: 0.6,
          system: system,
          messages: [{ role: 'user', content: user }]
        })
      };
    }

    return fetch(url, Object.assign({ signal: signal }, options)).then(function (res) {
      return res.text().then(function (bodyText) {
        var data = null;
        try { data = JSON.parse(bodyText); } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error('http_' + res.status);
          err.status = res.status;
          err.data = data;
          throw err;
        }
        if (!data) {
          var bad = new Error('format');
          throw bad;
        }
        var out = '';
        if (provider === 'openai') {
          out = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        } else if (provider === 'gemini') {
          var cand = data.candidates && data.candidates[0];
          out = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
        } else {
          out = data.content && data.content.map ? data.content.map(function (c) { return c.text || ''; }).join('') : '';
        }
        if (!out || typeof out !== 'string') throw new Error('format');
        return out.trim();
      });
    });
  }

  function providerErrorMessage(err) {
    if (err && err.status === 401) return t('pro.error401');
    if (err && err.status === 403) return t('pro.error401');
    if (err && err.status === 429) return t('pro.error429');
    if (err && err.message === 'format') return t('pro.errorFormat');
    return t('pro.errorNetwork');
  }

  function transcriptText(extra) {
    var parts = (room().messages || []).map(function (m) {
      if (m.roleId === 'user') return 'You: ' + m.text;
      var body = (m.blocks || []).map(function (b) {
        return (b.title || Core.blockTitle(b.kind, lang())) + ': ' + (b.lines || []).join(' / ');
      }).join('\n');
      return m.name + ' (' + (m.tag || '') + '):\n' + body;
    });
    if (extra) parts.push(extra);
    return parts.join('\n\n');
  }

  function runPro(startIndex) {
    if (state.generating) return;
    if (!proReady()) {
      openModal('pro');
      return;
    }
    var isRetry = startIndex > 0;
    var target = room();
    var plan;
    if (isRetry) {
      var currentRound = maxRound();
      plan = {
        text: target.startedAgenda || $('#agendaInput').value.trim(),
        round: startIndex > 0 ? Math.max(1, currentRound) : (target.messages.length ? currentRound + 1 : 1)
      };
    } else {
      plan = prepareRun();
    }
    if (!plan) return;
    var roles = resolvedRoles().filter(function (r, i, arr) {
      if (['pm', 'dev', 'growth', 'cfo', 'auditor'].indexOf(r.kind) < 0) return false;
      return arr.findIndex(function (x) { return x.kind === r.kind; }) === i;
    }).slice(0, 5);
    var token = ++state.token;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    state.replyTo = null;
    clearError();
    setGenerating(true, t('pro.running', { name: roles[startIndex].name, i: startIndex + 1 }));
    renderThread();

    var index = startIndex;
    function next() {
      if (token !== state.token) { clearTimeout(timer); return; }
      if (index >= roles.length) {
        clearTimeout(timer);
        setGenerating(false);
        state.thinking = null;
        state.speakingId = null;
        state.livePreview = '';
        renderThread();
        renderLive();
        save();
        return;
      }
      var role = roles[index];
      state.thinking = role.name;
      state.speakingId = role.id;
      state.livePreview = '';
      var label = t('pro.running', { name: role.name, i: index + 1 });
      var txt = $('#runProgressText');
      if (txt) txt.textContent = label;
      renderThread();
      renderLive();
      var messages = Core.proPrompts({
        role: role,
        lang: lang(),
        agenda: plan.text,
        room: state.room,
        roomName: roomInfo(state.room).name[lang()],
        roomDesc: roomInfo(state.room).desc[lang()],
        roles: roles,
        transcript: transcriptText()
      });
      callProvider(messages, controller.signal).then(function (text) {
        if (token !== state.token) return;
        var parsed = Core.parsePro(text, role, lang());
        var msg = {
          id: uid('msg'),
          roleId: role.id,
          kind: role.kind,
          name: role.name,
          tag: role.tag,
          glyph: role.glyph,
          accent: role.accent,
          mode: 'pro',
          round: plan.round,
          replyTo: null,
          blocks: parsed.blocks,
          claims: [],
          itemIds: parsed.items.map(function (x) { return x.id; }),
          ts: Date.now()
        };
        state.thinking = null;
        appendMessage(target, msg);
        appendItems(target, msg.itemIds, parsed.items);
        index += 1;
        next();
      }).catch(function (err) {
        if (token !== state.token) return;
        clearTimeout(timer);
        state.thinking = null;
        state.speakingId = null;
        state.livePreview = '';
        setGenerating(false);
        renderThread();
        renderLive();
        state.proFailIndex = index;
        showProError(providerErrorMessage(err), index);
      });
    }
    next();
  }

  function showProError(msg, retryIndex) {
    var err = $('#agendaError');
    if (!err) return;
    err.innerHTML = '<span>' + esc(msg) + '</span> <button type="button" class="link-btn" id="retryProBtn" data-retry="' + (retryIndex || 0) + '">' + esc(t('pro.retry')) + '</button>';
    err.hidden = false;
    var prog = $('#runProgress');
    if (prog) prog.hidden = true;
  }

  /* ── replies ─────────────────────────────────────────────────────────── */

  function sendReply(messageId, text) {
    var parent = room().messages.filter(function (m) { return m.id === messageId; })[0];
    if (!parent || !text.trim()) return;
    var userMsg = {
      id: uid('msg'),
      roleId: 'user',
      text: text.trim(),
      replyTo: messageId,
      ts: Date.now(),
      round: parent.round || 1
    };
    room().messages.push(userMsg);
    state.replyTo = null;
    save();
    renderThread();
    renderSummary();
    var role = resolvedRoles().filter(function (r) { return r.id === parent.roleId; })[0]
      || { id: parent.roleId, kind: parent.kind, name: parent.name, tag: parent.tag, glyph: parent.glyph, accent: parent.accent };
    var token = state.token;
    var willPro = state.mode === 'pro' && proReady();

    if (willPro) {
      var controller = new AbortController();
      setTimeout(function () { controller.abort(); }, 60000);
      var prompt = Core.proPrompts({
        role: role,
        lang: lang(),
        agenda: room().startedAgenda || room().agenda,
        room: state.room,
        roomName: roomInfo(state.room).name[lang()],
        roomDesc: roomInfo(state.room).desc[lang()],
        roles: resolvedRoles(),
        transcript: transcriptText('You replied to ' + parent.name + ': ' + text.trim() + '\nRespond to that reply as ' + role.name + ' only.')
      });
      callProvider(prompt, controller.signal).then(function (out) {
        if (token !== state.token) return;
        var parsed = Core.parsePro(out, role, lang());
        var msg = {
          id: uid('msg'), roleId: role.id, kind: role.kind, name: role.name, tag: role.tag,
          glyph: role.glyph, accent: role.accent, mode: 'pro', round: parent.round || 1,
          replyTo: userMsg.id, blocks: parsed.blocks, claims: [],
          itemIds: parsed.items.map(function (x) { return x.id; }), ts: Date.now()
        };
        appendMessage(room(), msg);
        appendItems(room(), msg.itemIds, parsed.items);
      }).catch(function (err) {
        if (token !== state.token) return;
        showError(providerErrorMessage(err));
      });
      return;
    }

    setTimeout(function () {
      if (token !== state.token) return;
      var out = Core.reply({
        message: parent,
        role: role,
        userText: text.trim(),
        lang: lang(),
        agenda: room().startedAgenda || room().agenda
      });
      out.message.ts = Date.now();
      out.message.replyTo = userMsg.id;
      appendMessage(room(), out.message);
      appendItems(room(), out.message.itemIds, out.items);
      save();
    }, 420);
  }

  /* ── export / copy ───────────────────────────────────────────────────── */

  function minutesData() {
    return {
      room: state.room,
      roomLabel: roomInfo(state.room).name[lang()],
      agenda: room().startedAgenda || room().agenda,
      messages: room().messages,
      items: room().items,
      roles: state.roles.map(function (r) {
        return { id: r.id, kind: r.kind, tag: r.tag, name: roleName(r) };
      }),
      mode: state.mode,
      lang: lang(),
      exportedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
    };
  }

  function exportMinutes(fmt) {
    var r = room();
    var err = $('#exportError');
    if (!r.messages.length && !r.items.length) {
      if (err) { err.textContent = t('export.empty'); err.hidden = false; }
      return;
    }
    if (err) err.hidden = true;
    var data = minutesData();
    var out = Core.minutes(data, lang(), fmt);
    var text = fmt === 'json' ? JSON.stringify(out, null, 2) : out;
    var mime = fmt === 'json' ? 'application/json' : (fmt === 'md' ? 'text/markdown' : 'text/plain');
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var name = 'onetap-team-room-' + state.room + '-' + date + '.' + fmt;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1200);
    toast(t('export.done', { name: name }));
  }

  function copyText(text, okKey) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      toast(ok ? t(okKey) : t('toast.copyFailed'));
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        toast(t(okKey));
        return true;
      }).catch(fallback);
    }
    return fallback();
  }

  function messageText(m) {
    if (!m.blocks) return m.text || '';
    return m.name + ' (' + (m.tag || '') + ')\n' + m.blocks.map(function (b) {
      return (b.title || '') + '\n' + (b.lines || []).map(function (l) { return '- ' + l; }).join('\n');
    }).join('\n\n');
  }

  /* ── toast / modal ───────────────────────────────────────────────────── */

  function toast(text) {
    var el = $('#toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    requestAnimationFrame(function () { el.classList.add('is-on'); });
    toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
      setTimeout(function () { el.hidden = true; }, 180);
    }, 2400);
  }

  var lastFocus = null;
  function openModal(id) {
    var modal = $('#' + id + 'Modal');
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-locked');
    if (id === 'pro') fillProForm();
    if (id === 'room') fillRoomForm();
    var focusable = modal.querySelector('input, select, button');
    if (focusable) setTimeout(function () { focusable.focus(); }, 30);
  }

  function closeModal(id) {
    var modal = $('#' + id + 'Modal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function fillProForm() {
    var p = state.pro || { provider: 'openai', model: PROVIDERS.openai.model, key: '' };
    var provider = $('#proProvider');
    var model = $('#proModel');
    var key = $('#proKey');
    if (provider) provider.value = p.provider || 'openai';
    if (model) model.value = p.model || PROVIDERS[p.provider || 'openai'].model;
    if (key) key.value = p.key || '';
    renderProStatus();
    var err = $('#proError');
    if (err) err.hidden = true;
  }

  function renderProStatus() {
    var el = $('#proStatusValue');
    if (!el) return;
    if (state.pro) {
      el.textContent = t('pro.ready') + ' · ' + state.pro.provider + ' · ' + maskKey(state.pro.key);
      el.classList.add('is-ready');
    } else {
      el.textContent = t('pro.none');
      el.classList.remove('is-ready');
    }
  }

  /* ── reset ───────────────────────────────────────────────────────────── */

  function resetRoom() {
    var r = room();
    r.agenda = '';
    r.startedAgenda = '';
    r.messages = [];
    r.items = [];
    state.replyTo = null;
    state.generating = false;
    state.speakingId = null;
    state.livePreview = '';
    state.token += 1;
    var input = $('#agendaInput');
    if (input) input.value = '';
    save();
    closeModal('reset');
    renderAll();
    setGenerating(false);
    toast(t('toast.reset'));
  }

  /* ── departments the user adds ───────────────────────────────────────── */

  function fillRoomForm() {
    var name = $('#roomName');
    var desc = $('#roomDesc');
    if (name) name.value = '';
    if (desc) desc.value = '';
    var err = $('#roomError');
    if (err) { err.hidden = true; err.textContent = ''; }
  }

  function addRoom() {
    var nameField = $('#roomName');
    var descField = $('#roomDesc');
    var err = $('#roomError');
    var name = nameField ? nameField.value.trim() : '';
    var desc = descField ? descField.value.trim() : '';
    if (err) { err.hidden = true; err.textContent = ''; }
    if (!name) {
      if (err) { err.textContent = t('room.required'); err.hidden = false; }
      return;
    }
    if (name.length > 16) {
      if (err) { err.textContent = t('room.tooLong'); err.hidden = false; }
      return;
    }
    if (allRooms().some(function (r) {
      var full = r.name[lang()].toLowerCase();
      var label = ((r.short && r.short[lang()]) || r.name[lang()]).toLowerCase();
      return full === name.toLowerCase() || label === name.toLowerCase();
    })) {
      if (err) { err.textContent = t('room.duplicate'); err.hidden = false; }
      return;
    }
    if (state.customRooms.length >= 12) {
      if (err) { err.textContent = t('room.max'); err.hidden = false; }
      return;
    }
    var id = 'custom_' + Core.uid('', name + Date.now()).slice(1);
    state.customRooms.push({
      id: id,
      glyph: name.slice(0, 1).toUpperCase(),
      name: { ko: name, en: name },
      desc: { ko: desc, en: desc },
      custom: true
    });
    state.rooms[id] = emptyRoom();
    state.room = id;
    state.replyTo = null;
    state.token += 1;
    save();
    closeModal('room');
    renderAll();
    setGenerating(false);
    toast(t('room.added', { name: name }));
  }

  function requestRoomDelete() {
    var meta = roomInfo(state.room);
    if (!meta.custom) return;
    var target = $('#roomDeleteName');
    if (target) target.textContent = meta.name[lang()];
    openModal('roomDelete');
  }

  function deleteRoom() {
    var meta = roomInfo(state.room);
    if (!meta.custom) return;
    var id = meta.id;
    state.customRooms = state.customRooms.filter(function (r) { return r.id !== id; });
    delete state.rooms[id];
    state.room = 'general';
    state.replyTo = null;
    state.thinking = null;
    state.token += 1;
    state.generating = false;
    closeModal('roomDelete');
    save();
    setGenerating(false);
    renderAll();
    toast(t('room.deleted', { name: meta.name[lang()] }));
  }

  /* ── events ──────────────────────────────────────────────────────────── */

  function bind() {
    $$('[data-lang]').forEach(function (b) {
      b.addEventListener('click', function () {
        var next = b.getAttribute('data-lang');
        if (next === state.lang) return;
        state.lang = next;
        save();
        renderAll();
        toast(t('toast.lang'));
      });
    });

    $$('[data-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.generating) return;
        var next = b.getAttribute('data-mode');
        if (next === 'pro' && !proReady()) {
          openModal('pro');
          return;
        }
        state.mode = next;
        save();
        renderMode();
      });
    });

    var proOpen = $('#proOpen');
    if (proOpen) proOpen.addEventListener('click', function () { openModal('pro'); });

    var roomTabs = $('#roomTabs');
    if (roomTabs) {
      roomTabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.room-tab');
        if (!tab) return;
        var id = tab.getAttribute('data-room');
        if (!id || id === state.room) return;
        state.token += 1;
        state.generating = false;
        state.thinking = null;
        state.speakingId = null;
        state.livePreview = '';
        state.replyTo = null;
        state.room = id;
        save();
        setGenerating(false);
        renderAll();
      });
    }

    var input = $('#agendaInput');
    if (input) {
      input.addEventListener('input', function () {
        room().agenda = input.value;
        updateCount();
        saveSoon();
      });
    }

    var samples = $('#sampleChips');
    if (samples) {
      samples.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-sample]');
        if (!btn) return;
        var idx = Number(btn.getAttribute('data-sample'));
        var list = roomSamples(state.room);
        if (!list[idx]) return;
        var field = $('#agendaInput');
        field.value = list[idx];
        room().agenda = field.value;
        updateCount();
        save();
        clearError();
        field.focus();
      });
    }

    var runBtn = $('#runBtn');
    if (runBtn) {
      runBtn.addEventListener('click', function () {
        if (state.mode === 'pro') runPro(0);
        else runFree();
      });
    }

    var contBtn = $('#continueBtn');
    if (contBtn) {
      contBtn.addEventListener('click', function () {
        if (state.mode === 'pro') runPro(0);
        else runFree(maxRound() + 1);
      });
    }

    var resetBtn = $('#resetRoomBtn');
    if (resetBtn) resetBtn.addEventListener('click', function () { openModal('reset'); });
    var resetConfirm = $('#resetConfirm');
    if (resetConfirm) resetConfirm.addEventListener('click', resetRoom);

    var deleteRoomBtn = $('#deleteRoomBtn');
    if (deleteRoomBtn) deleteRoomBtn.addEventListener('click', requestRoomDelete);
    var roomDeleteConfirm = $('#roomDeleteConfirm');
    if (roomDeleteConfirm) roomDeleteConfirm.addEventListener('click', deleteRoom);
    var roomForm = $('#roomForm');
    if (roomForm) roomForm.addEventListener('submit', function (e) { e.preventDefault(); addRoom(); });
    var addRoomBtn = $('#addRoomBtn');
    if (addRoomBtn) addRoomBtn.addEventListener('click', function () {
      fillRoomForm();
      openModal('room');
    });

    var actionForm = $('#actionForm');
    if (actionForm) {
      actionForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var field = $('#actionInput');
        var text = field.value.trim();
        if (!text) return;
        room().items.push({ id: uid('itm'), text: text, owner: t('thread.you'), due: '—', done: false });
        field.value = '';
        save();
        renderActions();
        renderSummary();
        renderLive();
        toast(t('toast.itemAdded'));
      });
    }

    var actionList = $('#actionList');
    if (actionList) {
      actionList.addEventListener('change', function (e) {
        var box = e.target.closest('[data-item]');
        if (!box) return;
        var id = box.getAttribute('data-item');
        var item = room().items.filter(function (i) { return i.id === id; })[0];
        if (!item) return;
        item.done = box.checked;
        save();
        renderActions();
        renderSummary();
        renderLive();
      });
    }

    var thread = $('#thread');
    if (thread) {
      thread.addEventListener('click', function (e) {
        var reply = e.target.closest('[data-reply]');
        if (reply) {
          state.replyTo = reply.getAttribute('data-reply');
          renderThread();
          var ta = thread.querySelector('.reply-form textarea');
          if (ta) ta.focus();
          return;
        }
        var cancel = e.target.closest('[data-reply-cancel]');
        if (cancel) {
          state.replyTo = null;
          renderThread();
          return;
        }
        var copy = e.target.closest('[data-copy-msg]');
        if (copy) {
          var m = room().messages.filter(function (x) { return x.id === copy.getAttribute('data-copy-msg'); })[0];
          if (m) copyText(messageText(m), 'thread.copied');
        }
      });
      thread.addEventListener('submit', function (e) {
        var form = e.target.closest('[data-reply-form]');
        if (!form) return;
        e.preventDefault();
        var id = form.getAttribute('data-reply-form');
        var ta = form.querySelector('textarea');
        if (!ta || !ta.value.trim()) { if (ta) ta.focus(); return; }
        sendReply(id, ta.value);
      });
      thread.addEventListener('keydown', function (e) {
        if (!e.target.matches('.reply-form textarea')) return;
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          var form = e.target.closest('form');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        }
      });
    }

    $$('[data-export]').forEach(function (b) {
      b.addEventListener('click', function () { exportMinutes(b.getAttribute('data-export')); });
    });
    var copyBtn = $('#copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var r = room();
        if (!r.messages.length && !r.items.length) {
          var err = $('#exportError');
          if (err) { err.textContent = t('export.empty'); err.hidden = false; }
          return;
        }
        copyText(Core.minutes(minutesData(), lang(), 'md'), 'export.copied');
      });
    }

    var roster = $('#roster');
    if (roster) {
      roster.addEventListener('click', function (e) {
        var edit = e.target.closest('[data-role-edit]');
        if (edit) {
          state.editingRole = edit.getAttribute('data-role-edit');
          renderRoster();
          return;
        }
        var saveBtn = e.target.closest('[data-role-save]');
        if (saveBtn) {
          var id = saveBtn.getAttribute('data-role-save');
          var field = roster.querySelector('[data-role-input="' + id + '"]');
          var val = field ? field.value.trim() : '';
          var role = state.roles.filter(function (r) { return r.id === id; })[0];
          if (role && val) {
            role.name[lang()] = val;
            if (role.custom) role.name.ko = role.name.en = val;
            save();
            toast(t('toast.saved'));
          }
          state.editingRole = null;
          renderRoster();
          renderThread();
          renderLive();
          return;
        }
        var cancel = e.target.closest('[data-role-cancel]');
        if (cancel) {
          state.editingRole = null;
          renderRoster();
          return;
        }
        var remove = e.target.closest('[data-role-remove]');
        if (remove) {
          var rid = remove.getAttribute('data-role-remove');
          state.roles = state.roles.filter(function (r) { return r.id !== rid || !r.custom; });
          save();
          renderRoster();
          renderThread();
          renderLive();
        }
      });
      roster.addEventListener('keydown', function (e) {
        if (!e.target.matches('[data-role-input]')) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          var id = e.target.getAttribute('data-role-input');
          var btn = roster.querySelector('[data-role-save="' + id + '"]');
          if (btn) btn.click();
        } else if (e.key === 'Escape') {
          state.editingRole = null;
          renderRoster();
        }
      });
    }

    var addRoleBtn = $('#addRoleBtn');
    if (addRoleBtn) addRoleBtn.addEventListener('click', function () {
      var field = $('#roleName');
      if (field) field.value = '';
      var err = $('#roleError');
      if (err) err.hidden = true;
      openModal('role');
    });
    var roleForm = $('#roleForm');
    if (roleForm) {
      roleForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var name = $('#roleName').value.trim();
        var err = $('#roleError');
        if (!name) {
          if (err) { err.textContent = t('team.namePlaceholder'); err.hidden = false; }
          return;
        }
        if (state.roles.length >= MAX_ROLES) {
          if (err) { err.textContent = t('team.max'); err.hidden = false; }
          return;
        }
        var kind = $('#roleFocus').value;
        var arch = Data.ROLE_ARCHETYPES.filter(function (a) { return a.kind === kind; })[0] || Data.ROLE_ARCHETYPES[0];
        state.roles.push({
          id: 'custom_' + Core.uid('', name + Date.now()).slice(1),
          kind: kind,
          tag: t('team.customTag'),
          glyph: name.slice(0, 1).toUpperCase(),
          accent: arch.accent,
          name: { ko: name, en: name },
          custom: true
        });
        save();
        closeModal('role');
        renderRoster();
        renderLive();
        toast(t('toast.saved'));
      });
    }

    var resetNames = $('#resetNamesBtn');
    if (resetNames) resetNames.addEventListener('click', function () {
      state.roles.forEach(function (r) {
        if (r.custom) return;
        var arch = Data.ROLE_ARCHETYPES.filter(function (a) { return a.kind === r.kind; })[0];
        if (arch) r.name = { ko: arch.name.ko, en: arch.name.en };
      });
      save();
      renderRoster();
      renderThread();
      renderLive();
      toast(t('toast.saved'));
    });

    var proForm = $('#proForm');
    if (proForm) {
      proForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var provider = $('#proProvider').value;
        var model = $('#proModel').value.trim();
        var key = $('#proKey').value.trim();
        var err = $('#proError');
        if (!key) {
          if (err) { err.textContent = t('pro.invalid'); err.hidden = false; }
          return;
        }
        if (!model) {
          if (err) { err.textContent = t('pro.modelRequired'); err.hidden = false; }
          return;
        }
        state.pro = { provider: provider, model: model, key: key };
        savePro();
        state.mode = 'pro';
        save();
        if (err) err.hidden = true;
        renderProStatus();
        renderMode();
        closeModal('pro');
        toast(t('toast.proSaved'));
      });
    }

    var proDelete = $('#proDelete');
    if (proDelete) proDelete.addEventListener('click', function () {
      state.pro = null;
      savePro();
      state.mode = 'free';
      save();
      fillProForm();
      renderMode();
      toast(t('toast.proDeleted'));
    });

    var proProvider = $('#proProvider');
    if (proProvider) proProvider.addEventListener('change', function () {
      var model = $('#proModel');
      var next = proProvider.value;
      if (model && (!model.value || Object.keys(PROVIDERS).some(function (p) { return PROVIDERS[p].model === model.value; }))) {
        model.value = PROVIDERS[next].model;
      }
    });

    $$('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { closeModal(el.getAttribute('data-close')); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      ['pro', 'role', 'reset', 'room', 'roomDelete'].forEach(function (id) {
        var modal = $('#' + id + 'Modal');
        if (modal && !modal.hidden) closeModal(id);
      });
    });

    document.addEventListener('click', function (e) {
      var retry = e.target.closest('#retryProBtn');
      if (retry) {
        var idx = Number(retry.getAttribute('data-retry')) || 0;
        clearError();
        runPro(idx);
      }
    });
  }

  /* ── boot ────────────────────────────────────────────────────────────── */

  function boot() {
    load();
    bind();
    renderAll();
    setGenerating(false);
    if (!room().agenda && !room().messages.length) {
      var field = $('#agendaInput');
      if (field) field.focus({ preventScroll: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* Small hook for tests and debugging; not used by the UI. */
  window.__TEAM_ROOM__ = {
    state: state,
    t: t,
    runFree: runFree,
    exportMinutes: exportMinutes
  };
})();
