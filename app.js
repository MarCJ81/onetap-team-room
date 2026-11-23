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
  var AG = window.AiGuard || null;      // engines/ai-guard.js (zod 구조 검증·재시도)
  var FA = window.FreeAI || null;       // engines/free-ai-client.js (무료 AI 맛보기)
  if (FA) FA.configure({ endpoint: 'https://free-ai-taste.goodday810202.workers.dev', app: 'ai-team-room' });
  var STORE = 'onetap.teamroom.v1';
  var PRO_STORE = 'onetap.teamroom.pro.v2';
  var LEGACY_PRO_STORE = 'onetap.teamroom.pro.v1';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var FOCUS_KEY = { pm: 'team.focusPm', dev: 'team.focusDev', design: 'team.focusDesign', video: 'team.focusVideo', growth: 'team.focusGrowth', sales: 'team.focusSales', cfo: 'team.focusCfo', auditor: 'team.focusAuditor' };
  /* Three providers, each with its own key slot. The endpoint lives here; the
     label, mark and default model come from data.js so node tests see the same
     catalog the browser uses. */
  var PROVIDERS = {};
  Data.PROVIDER_ORDER.forEach(function (id) {
    PROVIDERS[id] = {
      id: id,
      label: Data.PROVIDERS[id].label,
      mark: Data.PROVIDERS[id].mark,
      keyHint: Data.PROVIDERS[id].keyHint,
      model: Data.PROVIDERS[id].model,
      bridge: Data.PROVIDERS[id].bridge || null
    };
  });
  PROVIDERS.openai.endpoint = 'https://api.openai.com/v1/chat/completions';
  PROVIDERS.gemini.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/';
  PROVIDERS.claude.endpoint = 'https://api.anthropic.com/v1/messages';
  var PROVIDER_ORDER = Data.PROVIDER_ORDER;
  var MAX_ROLES = 10;

  var state = {
    lang: 'ko',
    mode: 'free',
    room: 'general',
    roles: [],
    customRooms: [],
    rooms: {},
    projects: [],
    activeProject: {},
    openProjectId: null,
    projectFilter: 'all',
    generating: false,
    thinking: null,
    speakingId: null,
    livePreview: '',
    replyTo: null,
    editingRole: null,
    token: 0,
    pro: null,
    proError: null,
    proFailIndex: null,
    bridgeWait: null
  };
  var saveTimer = null;
  var toastTimer = null;
  var arriveTimer = null;

  /* ── storage ─────────────────────────────────────────────────────────── */

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function emptyRoom() {
    return { agenda: '', startedAgenda: '', messages: [], items: [], outputs: [] };
  }

  function defaultRoles() {
    return Data.ROLE_ARCHETYPES.map(function (a) {
      return {
        id: a.kind,
        kind: a.kind,
        tag: a.tag,
        glyph: a.glyph,
        accent: a.accent,
        model: a.model,
        appointed: !!a.appointed,
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
        model: r.model || fallback.model,
        appointed: r.appointed != null ? !!r.appointed : !!fallback.appointed,
        name: {
          ko: (r.name && r.name.ko) || fallback.name.ko,
          en: (r.name && r.name.en) || fallback.name.en
        },
        custom: !!r.custom
      };
    });
    /* A record saved by an earlier version (4, then 5 roles) restores every
       base seat it is missing, including the three appointed in this build. */
    Data.ROLE_ARCHETYPES.forEach(function (a, idx) {
      if (mapped.some(function (r) { return r.kind === a.kind; })) return;
      mapped.splice(Math.min(idx, mapped.length), 0, {
        id: a.kind, kind: a.kind, tag: a.tag, glyph: a.glyph, accent: a.accent,
        model: a.model, appointed: !!a.appointed,
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
    state.projects = [];
    state.activeProject = {};
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
        room.outputs = Array.isArray(src.outputs) ? src.outputs : [];
      }
      state.rooms[r.id] = room;
    });

    /* Projects are the history. A record from before this build has only a
       room copy, so every room with a meeting becomes one project once. */
    if (raw && Array.isArray(raw.projects)) {
      state.projects = raw.projects.filter(function (p) {
        return p && typeof p === 'object' && p.id && state.rooms[p.room];
      }).map(normalizeProject);
      state.activeProject = (raw.activeProject && typeof raw.activeProject === 'object') ? raw.activeProject : {};
      Object.keys(state.activeProject).forEach(function (rid) {
        if (!state.rooms[rid] || !projectById(state.activeProject[rid])) delete state.activeProject[rid];
      });
    } else if (raw) {
      allRooms().forEach(function (r) {
        var room = state.rooms[r.id];
        if (!room || !room.messages.length) return;
        var first = room.messages.filter(function (m) { return m.ts; })[0];
        var prj = {
          id: 'prj_' + r.id + '_' + (first ? first.ts : Date.now()).toString(36),
          room: r.id,
          roomLabel: r.name[state.lang] || r.name.ko,
          agenda: room.startedAgenda || room.agenda || '',
          startedAgenda: room.startedAgenda || room.agenda || '',
          messages: room.messages,
          items: room.items,
          outputs: room.outputs || [],
          createdAt: first ? first.ts : Date.now(),
          updatedAt: Date.now()
        };
        state.projects.push(prj);
        state.activeProject[r.id] = prj.id;
      });
    }
    state.projects.forEach(function (p) {
      if (!p.outputs.length && p.messages.length) p.outputs = projectOutputs(p);
    });

    var proRaw = null;
    try { proRaw = JSON.parse(localStorage.getItem(PRO_STORE) || 'null'); } catch (e) { proRaw = null; }
    if (!proRaw) {
      /* A key saved by the earlier single-provider build becomes slot 1. */
      try { proRaw = JSON.parse(localStorage.getItem(LEGACY_PRO_STORE) || 'null'); } catch (e) { proRaw = null; }
    }
    state.pro = normalizePro(proRaw);
    if (state.pro && proRaw && !proRaw.providers) savePro();
    if (state.mode === 'pro' && !proReady()) state.mode = 'free';
    state.openProjectId = currentProject() ? currentProject().id : (state.projects[0] ? state.projects[0].id : null);
  }

  function normalizeProject(p) {
    return {
      id: String(p.id),
      room: p.room,
      roomLabel: typeof p.roomLabel === 'string' ? p.roomLabel : '',
      agenda: typeof p.agenda === 'string' ? p.agenda : '',
      startedAgenda: typeof p.startedAgenda === 'string' ? p.startedAgenda : '',
      messages: Array.isArray(p.messages) ? p.messages : [],
      items: Array.isArray(p.items) ? p.items : [],
      outputs: Array.isArray(p.outputs) ? p.outputs : [],
      createdAt: Number(p.createdAt) || 0,
      updatedAt: Number(p.updatedAt) || 0
    };
  }

  function projectById(id) {
    return state.projects.filter(function (p) { return p.id === id; })[0] || null;
  }

  function currentProject() {
    var id = state.activeProject[state.room];
    return id ? projectById(id) : null;
  }

  /* The open room record is the live copy of its project; this writes it back
     before the room or the project changes, so no project loses its last turn. */
  function flushRoom() {
    var p = currentProject();
    if (!p) return;
    var r = room();
    p.agenda = r.agenda || '';
    p.startedAgenda = r.startedAgenda || '';
    p.messages = r.messages || [];
    p.items = r.items || [];
    p.outputs = r.outputs || [];
    p.updatedAt = Date.now();
  }

  function createProject(text) {
    var now = Date.now();
    var prj = {
      id: 'prj_' + now.toString(36) + Math.random().toString(36).slice(2, 6),
      room: state.room,
      roomLabel: roomInfo(state.room).name[lang()],
      agenda: text,
      startedAgenda: text,
      messages: [],
      items: [],
      outputs: [],
      createdAt: now,
      updatedAt: now
    };
    state.projects.unshift(prj);
    state.activeProject[state.room] = prj.id;
    state.openProjectId = prj.id;
    return prj;
  }

  function save() {
    try {
      flushRoom();
      var payload = {
        v: 2,
        lang: state.lang,
        mode: state.mode,
        room: state.room,
        roles: state.roles,
        customRooms: state.customRooms,
        rooms: state.rooms,
        projects: state.projects,
        activeProject: state.activeProject
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
      if (state.pro && (proCount() || bridgeCount())) {
        localStorage.setItem(PRO_STORE, JSON.stringify({ v: 2, providers: state.pro }));
      } else {
        localStorage.removeItem(PRO_STORE);
      }
      localStorage.removeItem(LEGACY_PRO_STORE);
    } catch (e) { /* ignore */ }
  }

  /* ── Pro connection: one optional key or bridge per provider ────────── */

  /* { openai: {model, key?, bridge?}, gemini: {model, key}, claude: ... } with
     only the providers that hold a key or are switched on as a web bridge. The
     earlier single-key record ({provider, model, key}) is read as that
     provider's slot. */
  function normalizePro(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var src = (raw.providers && typeof raw.providers === 'object') ? raw.providers : null;
    if (!src && raw.provider && raw.key) {
      src = {};
      src[raw.provider] = { model: raw.model, key: raw.key };
    }
    if (!src) return null;
    var out = {};
    PROVIDER_ORDER.forEach(function (id) {
      var one = src[id];
      if (!one || typeof one !== 'object') return;
      var key = typeof one.key === 'string' ? one.key.trim() : '';
      var bridge = !!one.bridge && !!PROVIDERS[id].bridge;
      if (!key && !bridge) return;
      var model = typeof one.model === 'string' && one.model.trim() ? one.model.trim() : PROVIDERS[id].model;
      out[id] = { model: model };
      if (key) out[id].key = key;
      if (bridge) out[id].bridge = true;
    });
    return Object.keys(out).length ? out : null;
  }

  function proCount() {
    return Core.proConnected(state.pro).length;
  }

  /* Providers switched on as a web subscription bridge and holding no key. */
  function bridgeCount() {
    return Core.proBridge(state.pro).length;
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
        model: r.model,
        appointed: !!r.appointed,
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
    list.innerHTML = state.roles.map(function (r, i) {
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
        var model = roleModel(r);
        var route = Core.proRoute(r.model, state.pro, i);
        var modelLabel = route ? route.label : (model ? model.label : '');
        var modelTitle = route
          ? (route.fallback
            ? t('team.modelFallbackTitle', { model: route.model, provider: route.providerLabel })
            : t('team.modelTitle', { model: route.model }))
          : (model ? t('team.modelTitle', { model: model.label }) : '');
        var modelTag = modelLabel
          ? '<span class="roster__model' + (route && route.fallback ? ' is-fallback' : '') + '" data-model="' + esc(route ? route.provider : (model ? model.provider : '')) + '" title="' + esc(modelTitle) + '">'
            + esc(modelLabel) + (route && route.fallback ? '<b aria-hidden="true">↔</b>' : '') + '</span>'
          : '';
        body = '<button type="button" class="roster__name" data-role-edit="' + esc(r.id) + '">' + esc(name)
          + ' <span class="roster__tag">' + esc(r.custom ? t('team.customTag') : r.tag) + '</span></button>'
          + (r.appointed ? '<span class="roster__appointed">' + esc(t('team.appointed')) + '</span>' : '')
          + '<span class="roster__focus">' + esc(t(FOCUS_KEY[r.kind] || 'team.focusPm')) + '</span>'
          + modelTag;
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

  function bridgeCardHtml(m) {
    var site = bridgeSite(m);
    var role = bridgeRole(m);
    var name = role.name || m.name;
    var prompt = bridgePromptFor(m);
    return '<article class="msg msg--bridge is-waiting" data-msg-id="' + esc(m.id) + '" data-role-id="' + esc(m.roleId) + '" data-bridge="waiting" style="--role:' + esc(m.accent || '#2563eb') + '">'
      + '<header class="msg__head">'
      + '<div class="msg__who"><span class="avatar" aria-hidden="true">' + esc(m.glyph || (name || '?').slice(0, 1)) + '</span>'
      + '<span class="msg__name">' + esc(name) + '</span><span class="msg__tag">' + esc(m.tag || '') + '</span></div>'
      + '<div class="msg__meta"><span class="badge badge--bridge">' + esc(t('thread.bridgeBadge')) + '</span>'
      + '<span class="badge badge--model" data-model="' + esc(m.provider || '') + '">' + esc(m.modelLabel || '') + '</span>'
      + '<span>' + esc(timeText(m.ts)) + '</span></div></header>'
      + '<p class="bridge__lead">' + esc(t('bridge.lead', { name: name, site: site.site })) + '</p>'
      + '<div class="bridge__steps">'
      + '<button type="button" class="btn btn--primary btn--sm bridge__copy" data-bridge-copy="' + esc(m.id) + '">' + esc(t('bridge.copyOpen', { site: site.site })) + '</button>'
      + '<a class="bridge__open" href="' + esc(site.url) + '" target="_blank" rel="noopener">' + esc(site.site) + '</a>'
      + '</div>'
      + '<label class="bridge__label" for="bridge-input-' + esc(m.id) + '">' + esc(t('bridge.pasteLabel')) + '</label>'
      + '<textarea class="bridge__input" id="bridge-input-' + esc(m.id) + '" data-bridge-text="' + esc(m.id) + '" rows="5" maxlength="6000" spellcheck="false" placeholder="' + esc(t('bridge.pastePlaceholder', { site: site.site })) + '">' + esc(m.bridgeDraft || '') + '</textarea>'
      + '<div class="bridge__actions">'
      + '<button type="button" class="btn btn--primary btn--sm" data-bridge-apply="' + esc(m.id) + '">' + esc(t('bridge.apply')) + '</button>'
      + '<button type="button" class="btn btn--quiet btn--sm" data-bridge-free="' + esc(m.id) + '">' + esc(t('bridge.freeFill')) + '</button>'
      + '</div>'
      + '<p class="bridge__note">' + esc(t('bridge.answerNote')) + '</p>'
      + '<details class="bridge__preview"><summary>' + esc(t('bridge.preview')) + '</summary><pre>' + esc(prompt) + '</pre></details>'
      + '</article>';
  }

  function roleMsgHtml(m) {
    if (m.mode === 'bridge' && m.bridge === 'waiting') return bridgeCardHtml(m);
    var badge = m.mode === 'pro'
      ? '<span class="badge">' + esc(t('thread.proBadge')) + '</span>'
      : m.mode === 'bridge'
        ? '<span class="badge badge--bridge">' + esc(m.bridge === 'skipped' ? t('thread.bridgeFreeBadge') : t('thread.bridgeDoneBadge')) + '</span>'
        : '<span class="badge">' + esc(t('thread.freeBadge')) + '</span>';
    /* A Pro card names the provider that really answered, not the one the seat
       was appointed to, and marks a turn that fell back to another key. */
    if (m.mode !== 'bridge' && m.provider && PROVIDERS[m.provider]) {
      badge += '<span class="badge badge--model" data-model="' + esc(m.provider) + '" title="' + esc(m.modelName || PROVIDERS[m.provider].model) + '">'
        + esc(m.modelLabel || PROVIDERS[m.provider].mark) + '</span>';
    } else {
      var model = roleModel(resolvedRoles().filter(function (r) { return r.kind === m.kind; })[0]);
      if (model) badge += '<span class="badge badge--model" data-model="' + esc(model.provider) + '">' + esc(model.label) + '</span>';
    }
    if (m.mode === 'pro' && m.fallback) badge += '<span class="badge badge--fallback" title="' + esc(t('thread.fallbackTitle')) + '">' + esc(t('thread.fallbackBadge')) + '</span>';
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
    if (cont) cont.hidden = !msgs.length || state.generating || !!state.bridgeWait;
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

  /* ── projects and team outputs ──────────────────────────────────────── */

  function projectTitle(p) {
    var text = String((p && (p.agenda || p.startedAgenda)) || '').replace(/\s+/g, ' ').trim();
    if (!text) return t('project.untitled');
    var cut = text.split(/[.!?。]\s?/)[0];
    if (cut.length < 8) cut = text;
    return cut.length > 46 ? cut.slice(0, 46) + '…' : cut;
  }

  function projectStats(p) {
    var items = (p && p.items) || [];
    var done = items.filter(function (i) { return i && i.done; }).length;
    var msgs = ((p && p.messages) || []).filter(function (m) { return m && m.roleId !== 'user'; });
    var teams = [];
    msgs.forEach(function (m) { if (teams.indexOf(m.kind) < 0) teams.push(m.kind); });
    var rounds = msgs.reduce(function (n, m) { return Math.max(n, m.round || 1); }, 0);
    var outs = (p && p.outputs) || [];
    return {
      done: done,
      total: items.length,
      rate: items.length ? Math.round((done / items.length) * 100) : 0,
      teams: teams,
      rounds: rounds,
      messages: msgs.length,
      outputs: outs.filter(function (o) { return o.kind !== 'all'; }).length,
      final: outs.filter(function (o) { return o.kind === 'all'; }).length
    };
  }

  function projectStatus(p) {
    var s = projectStats(p);
    return (s.total && s.done === s.total && s.messages) ? 'done' : 'active';
  }

  function projectOutputs(p) {
    return Core.buildOutputs({
      agenda: p.startedAgenda || p.agenda || '',
      room: p.room,
      lang: lang(),
      roles: resolvedRoles(),
      messages: p.messages || [],
      items: p.items || [],
      projectId: p.id,
      createdAt: p.createdAt || 0
    }).outputs;
  }

  /* Rebuild the open project's deliverables from the turns that just landed. */
  function refreshOutputs() {
    var p = currentProject();
    if (!p) return;
    var r = room();
    p.messages = r.messages || [];
    p.items = r.items || [];
    p.agenda = r.agenda || '';
    p.startedAgenda = r.startedAgenda || '';
    p.outputs = projectOutputs(p);
    p.updatedAt = Date.now();
    r.outputs = p.outputs;
  }

  function roleModel(role) {
    if (!role || !role.model) return null;
    return Data.MODELS[role.model] || null;
  }

  function outputModel(out) {
    var role = resolvedRoles().filter(function (r) { return r.id === out.roleId; })[0];
    var m = roleModel(role);
    return m ? m.label : '';
  }

  function openProject(id) {
    var p = projectById(id);
    if (!p) return;
    var target = state.rooms[p.room];
    if (!target) { toast(t('project.gone')); return; }
    if (p.id !== state.activeProject[p.room]) {
      flushRoom();
      state.room = p.room;
      state.activeProject[p.room] = p.id;
      target.agenda = p.agenda || '';
      target.startedAgenda = p.startedAgenda || '';
      target.messages = p.messages || [];
      target.items = p.items || [];
      target.outputs = p.outputs && p.outputs.length ? p.outputs : (target.messages.length ? projectOutputs(p) : []);
      p.outputs = target.outputs;
    } else {
      state.room = p.room;
    }
    state.openProjectId = p.id;
    save();
    renderAll();
  }

  function renderProjects() {
    var list = $('#projectList');
    if (!list) return;
    var all = state.projects.filter(function (p) { return state.rooms[p.room]; });
    var shown = all.filter(function (p) {
      return state.projectFilter === 'all' || projectStatus(p) === state.projectFilter;
    });
    if (state.openProjectId && !projectById(state.openProjectId)) state.openProjectId = null;
    if (!state.openProjectId && shown.length) state.openProjectId = shown[0].id;
    list.innerHTML = shown.length ? shown.map(function (p) {
      var s = projectStats(p);
      var st = projectStatus(p);
      var on = p.id === state.openProjectId;
      var date = p.createdAt ? new Date(p.createdAt).toLocaleDateString(lang() === 'en' ? 'en-US' : 'ko-KR', { month: '2-digit', day: '2-digit' }) : '';
      return '<li class="plist__row' + (on ? ' is-on' : '') + '" data-project-row="' + esc(p.id) + '" data-project-status="' + st + '">'
        + '<button type="button" class="plist__btn" data-project="' + esc(p.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
        + '<span class="plist__top"><b class="plist__title">' + esc(projectTitle(p)) + '</b>'
        + '<span class="plist__status is-' + st + '">' + esc(t(st === 'done' ? 'project.statusDone' : 'project.statusActive')) + '</span></span>'
        + '<span class="plist__meta">' + esc(roomInfo(p.room).name[lang()]) + ' · ' + s.teams.length + esc(t('project.teamUnit'))
        + ' · ' + s.done + '/' + s.total + (date ? ' · ' + esc(date) : '') + '</span>'
        + '<span class="plist__bar" aria-hidden="true"><i style="width:' + s.rate + '%"></i></span>'
        + '</button></li>';
    }).join('') : '<li class="plist__empty">' + esc(t('project.empty')) + '</li>';

    $$('[data-project-filter]').forEach(function (b) {
      var on = b.getAttribute('data-project-filter') === state.projectFilter;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    renderProjectDetail();
  }

  function renderProjectDetail() {
    var meta = $('#projectMeta');
    var list = $('#outputList');
    var tools = $('#outputTools');
    if (!meta || !list || !tools) return;
    var p = projectById(state.openProjectId);
    if (!p || !state.rooms[p.room]) {
      meta.innerHTML = '<p class="pout__empty">' + esc(t('project.noProject')) + '</p>';
      list.innerHTML = '';
      tools.innerHTML = '';
      return;
    }
    var s = projectStats(p);
    var st = projectStatus(p);
    var byKind = {};
    resolvedRoles().forEach(function (r) { byKind[r.kind] = r; });
    var teamChips = s.teams.map(function (k) {
      var r = byKind[k];
      var label = r ? r.name : k;
      var model = r && roleModel(r) ? roleModel(r).label : '';
      return '<span class="pmeta__team" style="--role:' + esc(r ? r.accent : '#B45309') + '">' + esc(label)
        + (model ? '<i>' + esc(model) + '</i>' : '') + '</span>';
    }).join('');
    var isCurrent = currentProject() && currentProject().id === p.id;
    meta.innerHTML = '<div class="pmeta__top"><h3 class="pmeta__title">' + esc(projectTitle(p)) + '</h3>'
      + '<span class="pmeta__status is-' + st + '">' + esc(t(st === 'done' ? 'project.statusDone' : 'project.statusActive')) + '</span></div>'
      + '<p class="pmeta__agenda">' + esc(p.startedAgenda || p.agenda || t('project.untitled')) + '</p>'
      + '<dl class="pmeta__grid">'
      + '<div><dt>' + esc(t('project.teams')) + '</dt><dd class="pmeta__teams">' + (teamChips || '—') + '</dd></div>'
      + '<div><dt>' + esc(t('project.progress')) + '</dt><dd><b data-project-rate>' + s.rate + '%</b> · ' + s.done + '/' + s.total + '</dd></div>'
      + '<div><dt>' + esc(t('project.records')) + '</dt><dd>' + s.messages + ' ' + esc(t('project.speeches')) + ' · ' + s.rounds + ' ' + esc(t('project.rounds')) + '</dd></div>'
      + '<div><dt>' + esc(t('project.outputs')) + '</dt><dd>' + s.outputs + ' · ' + esc(t('project.finalOne')) + ' ' + s.final + '</dd></div>'
      + '</dl>'
      + (isCurrent ? '<span class="pmeta__now">' + esc(t('project.current')) + '</span>'
        : '<button type="button" class="btn btn--quiet btn--sm" data-open-project="' + esc(p.id) + '">' + esc(t('project.open')) + '</button>');

    var outs = p.outputs || [];
    tools.innerHTML = outs.length
      ? '<span class="ptools__label">' + esc(t('project.exportLabel')) + '</span>'
        + '<button type="button" class="btn btn--quiet btn--sm" data-copy-all="1">' + esc(t('project.copyAll')) + '</button>'
        + '<button type="button" class="btn btn--quiet btn--sm" data-out-export="md">MD</button>'
        + '<button type="button" class="btn btn--quiet btn--sm" data-out-export="txt">TXT</button>'
        + '<button type="button" class="btn btn--quiet btn--sm" data-out-export="json">JSON</button>'
      : '';

    list.innerHTML = outs.length ? outs.map(function (o) {
      var model = outputModel(o);
      var isFinal = o.kind === 'all';
      return '<li class="out' + (isFinal ? ' out--final' : '') + '" data-output="' + esc(o.id) + '" data-out-kind="' + esc(o.kind) + '">'
        + '<details' + (isFinal ? ' open' : '') + '>'
        + '<summary class="out__sum"><span class="out__title">' + esc(o.title) + '</span>'
        + '<span class="out__who">' + esc(o.name) + (model ? ' · ' + esc(model) : '') + '</span>'
        + '<span class="out__n">' + ((o.lines || []).length) + '</span></summary>'
        + '<ul class="out__lines">' + (o.lines || []).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>'
        + '<div class="out__foot"><button type="button" class="btn btn--quiet btn--sm" data-copy-output="' + esc(o.id) + '">' + esc(t('project.copyOne')) + '</button></div>'
        + '</details></li>';
    }).join('') : '<li class="out__empty">' + esc(t('project.noOutputs')) + '</li>';
  }

  function outputText(o) {
    return o.title + ' · ' + o.name + '\n' + (o.lines || []).map(function (l) { return '- ' + l; }).join('\n');
  }

  function allOutputsText(p) {
    return (p.outputs || []).map(outputText).join('\n\n');
  }

  function exportOutputs(fmt) {
    var p = projectById(state.openProjectId);
    if (!p || !(p.outputs || []).length) { toast(t('project.noOutputs')); return; }
    var tmpl = {};
    tmpl.id = p.id; tmpl.agenda = p.agenda; tmpl.title = projectTitle(p);
    tmpl.room = p.room; tmpl.roomLabel = roomInfo(p.room).name[lang()];
    tmpl.items = p.items; tmpl.outputs = p.outputs; tmpl.status = projectStatus(p);
    tmpl.createdAt = p.createdAt; tmpl.updatedAt = p.updatedAt;
    var out = Core.outputsMinutes(tmpl, lang(), fmt);
    var text = fmt === 'json' ? JSON.stringify(out, null, 2) : out;
    var mime = fmt === 'json' ? 'application/json' : (fmt === 'md' ? 'text/markdown' : 'text/plain');
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var name = 'onetap-project-' + p.room + '-' + date + '.' + fmt;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1200);
    toast(t('export.done', { name: name }));
  }

  function renderMode() {
    $$('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === state.mode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var gear = $('#proOpen');
    var n = proCount();
    var bridges = bridgeCount();
    if (gear) {
      gear.classList.toggle('has-key', n > 0 || bridges > 0);
      gear.style.color = n > 0 || bridges > 0 ? 'var(--ok)' : '';
      gear.setAttribute('data-count', String(n));
      gear.setAttribute('data-bridge', String(bridges));
    }
    var count = $('#proCount');
    if (count) {
      count.hidden = n === 0 && bridges === 0;
      count.textContent = n === 0 && bridges
        ? t('pro.bridgeBadge', { b: bridges })
        : n + '/' + PROVIDER_ORDER.length;
      count.classList.toggle('is-full', n === PROVIDER_ORDER.length);
      count.classList.toggle('is-bridge', bridges > 0);
      count.setAttribute('title', n === 0 && bridges
        ? t('pro.bridgeTitle', { b: bridges })
        : t('pro.countTitle', { n: n, total: PROVIDER_ORDER.length }));
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

  function monitorBadge(st, away) {
    if (st === 'live') return t('hq.badge.onAir');
    if (away) return t('hq.badge.away');
    if (st === 'done') return t('hq.badge.done');
    return t('hq.badge.standby');
  }

  function seatBadge(st, inRoom) {
    if (st === 'live') return t('hq.badge.onAir');
    if (st === 'done') return t('hq.badge.doneCheck');
    if (st === 'wait') return inRoom ? t('hq.seat.listen') : t('hq.seat.wait');
    return t('hq.seat.empty');
  }

  /* One department card = one clay diorama room (local WebP) with the clay
     figure of whoever holds that monitor working at its desk, plus the animated
     clay desk widget of that department (board / code / palette / timeline /
     chart / checklist / chat ping / proposal). While the team is in the central
     meeting room the desk is empty and the card says so (`is-away`). */
  function monitorHtml(meta, snap, byId, presence) {
    var st = snap.monitors[meta.id] || 'standby';
    var holder = snap.holders[meta.id] || null;
    var away = !!holder && presence === 'meeting';
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
    else if (away) line = t('hq.monitor.inMeeting');
    else if (st === 'done' && lastTurn) line = previewLine(lastTurn);
    else if (st === 'done') line = t('hq.monitor.reported', { n: items.length });
    else if (items.length) line = t('hq.monitor.pending', { n: items.length - doneItems });
    else line = t('hq.monitor.idle');
    var label = (meta.short && meta.short[lang()]) || meta.name[lang()];
    var holdName = holder ? holder.name : label;
    var accent = holder ? holder.accent : deptAccent(meta.id);
    var look = lookFor(role || { kind: 'pm', accent: accent });
    var cls = 'monitor is-' + st
      + (away ? ' is-away' : (holder ? ' is-working' : ' is-nobody'))
      + (meta.id === state.room ? ' is-current' : '');
    var sig = [st, presence, holder ? holder.roleId : '', label, holdName, line, doneItems, items.length,
      meta.id === state.room ? 1 : 0, lang(), away ? 1 : 0].join('|');
    return '<li class="' + cls + '" data-monitor="' + esc(meta.id) + '" data-state="' + st
      + '" data-presence="' + (away ? 'away' : 'desk') + '" data-sig="' + esc(sig) + '">'
      + '<div class="monitor__scene">'
      + wsScene({ roomId: meta.id, accent: accent, look: look, present: !!holder, state: st, presence: away ? 'away' : 'work' })
      + (st === 'live' ? '<span class="monitor__say" aria-hidden="true">' + esc(line) + '</span>' : '')
      + (away ? '<span class="monitor__away" aria-hidden="true">' + esc(t('hq.badge.away')) + '</span>' : '')
      + '<span class="monitor__head"><span class="monitor__glyph" aria-hidden="true">' + esc(String(meta.glyph || '').slice(0, 1)) + '</span>'
      + '<span class="monitor__name">' + esc(label) + '</span></span>'
      + '</div>'
      + '<div class="monitor__plate"><span class="monitor__role">' + esc(holdName) + '</span>'
      + '<span class="monitor__line">' + esc(line) + '</span></div>'
      + '<div class="monitor__foot"><span class="monitor__badge"><i aria-hidden="true"></i>' + esc(monitorBadge(st, away)) + '</span>'
      + '<span class="monitor__stat">' + esc(t('hq.monitor.items', { d: doneItems, t: items.length })) + '</span></div>'
      + '</li>';
  }

  /* A seat at the clay meeting table: a figure on a stool, name and state
     under it. Before the meeting starts — and once it ends and everyone walks
     back to their department — the stool is empty. */
  function seatHtml(seat, byId, front, presence, index) {
    var role = byId[seat.roleId];
    var look = lookFor(role || { kind: 'pm', accent: seat.accent });
    var live = seat.state === 'live';
    var inRoom = presence === 'meeting' && seat.state !== 'empty';
    /* The speaker presents (hand up); everyone else listens and takes notes. */
    var fig = inRoom
      ? figSvg(look, { pose: live ? 'up' : 'write', chair: true, chairCol: '#A87A4C' })
      : chairSvg();
    var cls = 'seat is-' + seat.state
      + (inRoom ? ' is-in' : ' is-out')
      + (live ? ' is-speak' : (inRoom ? ' is-listen' : ''));
    var sig = [seat.state, presence, seat.name, seat.accent, index].join('|');
    return '<li class="' + cls + '" data-seat="' + esc(seat.roleId) + '" data-state="' + seat.state
      + '" data-presence="' + (inRoom ? 'room' : 'desk') + '" data-sig="' + esc(sig) + '" style="--i:' + index + '">'
      + '<span class="seat__avatar" style="--role:' + esc(seat.accent) + '" aria-hidden="true">' + fig + '</span>'
      + '<span class="seat__body"><span class="seat__name">' + esc(seat.name) + '</span>'
      + '<span class="seat__badge">' + esc(seatBadge(seat.state, inRoom)) + '</span></span>'
      + '</li>';
  }

  /* ── meeting assembly: figures walk from their desks to the table ─────── */

  function rectOf(el) {
    if (!el) return null;
    var r = el.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return null;
    return { left: r.left, top: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* Where each role's figure is right now, measured before the repaint. */
  function captureFigures(presence, snap) {
    var map = {};
    snap.seats.forEach(function (s) {
      var rect = null;
      if (presence === 'meeting') {
        rect = rectOf(document.querySelector('.seat[data-seat="' + s.roleId + '"] .seat__avatar .fig'));
      } else {
        var mon = document.querySelector('.monitor[data-monitor="' + s.roomId + '"]');
        rect = rectOf(mon && mon.querySelector('.monitor__figure .fig'))
          || rectOf(mon && mon.querySelector('.monitor__scene'));
      }
      if (rect) map[s.roleId] = rect;
    });
    return map;
  }

  /* Where each figure should land after the repaint. */
  function captureTargets(presence, snap) {
    var map = {};
    snap.seats.forEach(function (s) {
      if (presence === 'meeting') {
        var seat = document.querySelector('.seat[data-seat="' + s.roleId + '"] .seat__avatar');
        var r = rectOf(seat);
        if (r) map[s.roleId] = r;
      } else {
        var mon = document.querySelector('.monitor[data-monitor="' + s.roomId + '"] .monitor__scene');
        var rect = rectOf(mon);
        if (rect) map[s.roleId] = rect;
      }
    });
    return map;
  }

  function figureForRole(roleId, accent) {
    var role = resolvedRoles().filter(function (r) { return r.id === roleId; })[0];
    return figSvg(lookFor(role || { kind: 'pm', accent: accent }), { pose: 'type' });
  }

  /* Spawn a small copy of each figure on the stage and fly it to its target.
     Returns the number of travellers (0 when motion is reduced). */
  function playAssembly(fromMap, toMap, presence) {
    var layer = $('#hqTravel');
    if (!layer) return 0;
    layer.innerHTML = '';
    if (!fromMap || reducedMotion()) return 0;
    var lr = layer.getBoundingClientRect();
    var pairs = [];
    Object.keys(toMap).forEach(function (id) {
      var from = fromMap[id];
      var to = toMap[id];
      if (!from || !to) return;
      pairs.push({ id: id, from: from, to: to });
    });
    pairs.forEach(function (pair, i) {
      var el = document.createElement('span');
      el.className = 'traveler' + (presence === 'meeting' ? ' traveler--in' : ' traveler--out');
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML = figureForRole(pair.id);
      var w = Math.max(26, Math.min(pair.from.width, 58));
      el.style.width = w + 'px';
      el.style.left = (pair.from.cx - lr.left) + 'px';
      el.style.top = (pair.from.cy - lr.top) + 'px';
      layer.appendChild(el);
      var dx = pair.to.cx - pair.from.cx;
      var dy = pair.to.cy - pair.from.cy;
      var hop = presence === 'meeting' ? -Math.min(52, 26 + Math.abs(dx) * 0.06) : 16;
      var frames = [
        { transform: 'translate(-50%,-50%) translate(0px,0px) scale(1)', opacity: 1 },
        { transform: 'translate(-50%,-50%) translate(' + (dx * 0.5).toFixed(1) + 'px,' + (dy * 0.5 + hop).toFixed(1) + 'px) scale(.86)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%,-50%) translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(.72)', opacity: presence === 'meeting' ? 1 : 0 }
      ];
      var timing = { duration: 680, delay: i * 55, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' };
      if (el.animate) {
        var anim = el.animate(frames, timing);
        anim.onfinish = function () { if (el.parentNode) el.parentNode.removeChild(el); };
      } else {
        el.style.display = 'none';
      }
    });
    setTimeout(function () { if (layer) layer.innerHTML = ''; }, 2600);
    return pairs.length;
  }

  /* Replace a monitor/seat only when what it shows changed, so its clay
     animation keeps running instead of restarting on every repaint. */
  function mountItem(col, el, html) {
    var tmp = document.createElement('ul');
    tmp.innerHTML = html;
    var next = tmp.firstElementChild;
    if (!next) return el;
    if (el && el.getAttribute('data-sig') === next.getAttribute('data-sig')) return el;
    if (el && el.parentNode) { el.parentNode.replaceChild(next, el); return next; }
    col.appendChild(next);
    return next;
  }

  function renderLive() {
    var left = $('#hqLeft');
    var right = $('#hqRight');
    if (!left || !right) return;
    var snap = liveModel();
    /* A bridged seat waiting for a pasted answer keeps the room ON AIR: the
       department figure stands with a bubble saying whose answer is missing. */
    if (state.bridgeWait) {
      snap.seats.forEach(function (s) {
        if (s.roleId !== state.bridgeWait.roleId) return;
        s.state = 'live';
        s.bubble = t('hq.room.bridgeWait', { name: s.name });
        snap.speaking = s;
        if (snap.monitors[s.roomId] !== undefined) {
          snap.monitors[s.roomId] = 'live';
          snap.holders[s.roomId] = s;
        }
      });
      if (snap.speaking) snap.phase = 'live';
    }
    var presence = snap.phase === 'live' ? 'meeting' : 'desks';
    var stage = $('#hqStage');
    var prevPresence = stage ? stage.getAttribute('data-presence') : null;
    var flip = !!prevPresence && prevPresence !== presence;
    var fromMap = flip ? captureFigures(prevPresence, snap) : null;
    var roles = resolvedRoles();
    var byId = {};
    roles.forEach(function (r) { byId[r.id] = r; });
    var rooms = allRooms();
    var half = Math.ceil(rooms.length / 2);
    var roomKey = rooms.map(function (r) { return r.id; }).join(',');
    if (left.getAttribute('data-rooms') !== roomKey) {
      left.innerHTML = '';
      right.innerHTML = '';
      left.setAttribute('data-rooms', roomKey);
    }
    var seatKey = snap.seats.map(function (s) { return s.roleId; }).join(',');
    if ($('#mroomTop') && $('#mroomTop').getAttribute('data-seats') !== seatKey) {
      $('#mroomTop').innerHTML = '';
      $('#mroomBottom').innerHTML = '';
      $('#mroomTop').setAttribute('data-seats', seatKey);
    }

    rooms.forEach(function (meta, i) {
      var col = i < half ? left : right;
      var el = left.querySelector('[data-monitor="' + meta.id + '"]') || right.querySelector('[data-monitor="' + meta.id + '"]');
      mountItem(col, el, monitorHtml(meta, snap, byId, presence));
    });

    var seats = snap.seats;
    var cut = Math.ceil(seats.length / 2);
    var top = $('#mroomTop');
    var bottom = $('#mroomBottom');
    if (top) {
      seats.slice(0, cut).forEach(function (s, i) {
        var el = top.querySelector('[data-seat="' + s.roleId + '"]') || bottom.querySelector('[data-seat="' + s.roleId + '"]');
        mountItem(top, el, seatHtml(s, byId, false, presence, i));
      });
    }
    if (bottom) {
      seats.slice(cut).forEach(function (s, i) {
        var el = bottom.querySelector('[data-seat="' + s.roleId + '"]') || top.querySelector('[data-seat="' + s.roleId + '"]');
        mountItem(bottom, el, seatHtml(s, byId, true, presence, cut + i));
      });
    }

    if (stage) {
      stage.setAttribute('data-presence', presence);
      if (flip) {
        var toMap = captureTargets(presence, snap);
        var moved = playAssembly(fromMap, toMap, presence);
        stage.setAttribute('data-assembly', presence === 'meeting' ? 'in' : 'out');
        stage.setAttribute('data-assembly-count', String(moved));
        stage.setAttribute('data-assembly-at', String(Date.now()));
        if (presence === 'meeting') {
          stage.setAttribute('data-arriving', '1');
          clearTimeout(arriveTimer);
          arriveTimer = setTimeout(function () {
            var s = $('#hqStage');
            if (s) s.removeAttribute('data-arriving');
          }, 1500);
        }
      }
    }


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
        /* The bubble follows the speaker: it hovers over that seat. */
        var seatEl = snap.speaking && $('#mroom .seat[data-seat="' + snap.speaking.roleId + '"]');
        var floorEl = $('#mroom .mroom__floor');
        if (seatEl && floorEl) {
          var sr = seatEl.getBoundingClientRect();
          var fr = floorEl.getBoundingClientRect();
          if (fr.width) {
            var pct = ((sr.left + sr.width / 2) - fr.left) / fr.width * 100;
            air.style.left = Math.max(20, Math.min(80, Math.round(pct))) + '%';
          }
        }
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
    syncBridgeWait();
    renderRooms();
    renderSamples();
    renderAgenda();
    renderRoster();
    renderThread();
    renderActions();
    renderSummary();
    renderMode();
    renderProStatus();
    renderLive();
    renderProjects();
    /* A waiting bridge freezes the round buttons on every full repaint. */
    var run = $('#runBtn');
    if (run) run.disabled = state.generating || !!state.bridgeWait;
    var cont = $('#continueBtn');
    if (cont) cont.hidden = state.generating || !room().messages.length || !!state.bridgeWait;
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
    if (btn) btn.disabled = on || !!state.bridgeWait;
    var prog = $('#runProgress');
    if (prog) prog.hidden = !on;
    if (label) {
      var txt = $('#runProgressText');
      if (txt) txt.textContent = label;
    }
    var cont = $('#continueBtn');
    if (cont) cont.hidden = on || !room().messages.length || !!state.bridgeWait;
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
      /* A different agenda starts a new project: the old record is written back
         to its project first, so nothing is lost and the two never mix. */
      flushRoom();
      delete state.activeProject[state.room];
      r.messages = [];
      r.items = [];
      r.outputs = [];
      round = 1;
    }
    if (!r.messages.length) {
      r.agenda = text;
      r.startedAgenda = text;
      r.messages = [];
      r.items = [];
      r.outputs = [];
      round = 1;
      if (!currentProject()) createProject(text);
      else {
        var prj = currentProject();
        prj.agenda = text;
        prj.startedAgenda = text;
        prj.messages = [];
        prj.items = [];
        prj.outputs = [];
        prj.updatedAt = Date.now();
      }
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
        refreshOutputs();
        save();
        renderThread();
        renderLive();
        renderProjects();
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
          refreshOutputs();
          save();
          renderThread();
          renderLive();
          renderProjects();
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
    return proCount() > 0 || bridgeCount() > 0;
  }

  /* The model mark that will actually answer this seat right now. */
  function routeLabel(role, index) {
    var route = Core.proRoute(role && role.model, state.pro, index);
    return route ? route.label : '';
  }

  function maskKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••';
    return key.slice(0, 4) + '…' + key.slice(-4);
  }

  function callProvider(messages, signal, target) {
    var t = target || Core.proRoute('gemini', state.pro, 0);
    if (!t || !PROVIDERS[t.provider] || !state.pro || !state.pro[t.provider]) return Promise.reject(new Error('bad config'));
    var provider = t.provider;
    var model = (t.model || PROVIDERS[provider].model).trim();
    var key = state.pro[provider].key;
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

  /* The eight seats a Pro round calls, in speaking order. */
  function proRoles() {
    return resolvedRoles().filter(function (r, i, arr) {
      if (['pm', 'dev', 'design', 'video', 'growth', 'sales', 'cfo', 'auditor'].indexOf(r.kind) < 0) return false;
      return arr.findIndex(function (x) { return x.kind === r.kind; }) === i;
    }).slice(0, 8);
  }

  /* ── 응답 구조 검증(zod) · 형식이 어긋나면 1회 재요청 ─────────────
     파싱 결과가 스키마를 못 맞추면 같은 질문에 형식 고정 지시를 붙여
     한 번 더 묻는다. 두 번째도 어긋나면 복구본으로 회의록을 채운다. */
  function parseGuarded(text, role, l, retryFn) {
    var parsed = Core.parsePro(text, role, l);
    if (!AG) return Promise.resolve(parsed);
    return AG.check(parsed, l).then(function (res) {
      if (res && res.ok) return res.value;
      if (retryFn) {
        return retryFn().then(function (text2) {
          return parseGuarded(text2, role, l, null);
        }, function () { return parsed; });
      }
      return (res && res.value) || parsed;
    }, function () { return parsed; });
  }

  function withStrictFormat(messages, l) {
    if (!AG) return messages;
    var extra = AG.strictInstruction(l);
    return messages.map(function (m) {
      return m.role === 'user' ? { role: m.role, content: m.content + extra } : m;
    });
  }

  function finishProRound() {
    setGenerating(false);
    state.thinking = null;
    state.speakingId = null;
    state.livePreview = '';
    refreshOutputs();
    save();
    renderThread();
    renderLive();
    renderProjects();
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
    proSequence(plan, proRoles(), startIndex);
  }

  /* One Pro round, seat by seat. A seat appointed to a bridged provider stops
     the sequence with a bridge card instead of an API call; the answer pasted
     back (or filled by the free engine) continues from the next seat. */
  function proSequence(plan, roles, startIndex) {
    var target = room();
    var token = ++state.token;
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 60000);
    state.replyTo = null;
    state.bridgeWait = null;
    clearError();
    setGenerating(true, t('pro.running', { name: roles[startIndex].name, i: startIndex + 1, model: routeLabel(roles[startIndex], startIndex) }));
    renderThread();

    var index = startIndex;
    function next() {
      if (token !== state.token) { clearTimeout(timer); return; }
      if (index >= roles.length) {
        clearTimeout(timer);
        finishProRound();
        return;
      }
      var role = roles[index];
      var route = Core.proRoute(role.model, state.pro, index);
      if (!route) {
        clearTimeout(timer);
        setGenerating(false);
        state.thinking = null;
        openModal('pro');
        return;
      }
      if (route.bridge) {
        clearTimeout(timer);
        state.thinking = null;
        state.speakingId = null;
        state.livePreview = '';
        var wait = bridgeWaitMessage(role, route, plan, index);
        state.bridgeWait = { id: wait.id, roleId: role.id, name: role.name };
        setGenerating(false);
        appendMessage(target, wait);
        save();
        renderThread();
        renderLive();
        renderProjects();
        toast(t('bridge.readyToast', { name: role.name, site: PROVIDERS[route.provider].bridge.site }));
        var card = $('#thread [data-msg-id="' + wait.id + '"]');
        if (card && card.scrollIntoView) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      state.thinking = role.name;
      state.speakingId = role.id;
      state.livePreview = '';
      var label = t('pro.running', { name: role.name, i: index + 1, model: route.label });
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
      callProvider(messages, controller.signal, route).then(function (text) {
        if (token !== state.token) return;
        return parseGuarded(text, role, lang(), function () {
          return callProvider(withStrictFormat(messages, lang()), controller.signal, route);
        }).then(function (parsed) {
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
          provider: route.provider,
          modelLabel: route.label,
          modelName: route.model,
          fallback: route.fallback,
          replyTo: null,
          blocks: parsed.blocks,
          claims: [],
          itemIds: parsed.items.map(function (x) { return x.id || uid('itm'); }),
          ts: Date.now()
        };
        state.thinking = null;
        appendMessage(target, msg);
        appendItems(target, msg.itemIds, parsed.items);
        index += 1;
        next();
        });
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

  /* ── 무료 AI 맛보기 라운드 (키 없이 3개 부서) ─────────────────────
     Pro·브리지가 하나도 없을 때만 쓰는 경로. Worker가 429를 주면
     전환 카드를 띄우고 멈춘다. 기존 규칙 엔진·브리지·Pro 흐름은 그대로다. */
  function renderFreeLimit(res) {
    var card = $('#freeLimitCard');
    var st = $('#freeStatus');
    if (st) st.textContent = '오늘 무료 횟수를 다 썼습니다';
    if (!card) return;
    var cta = (res && res.cta) || {};
    var href = cta.keyUrl || 'https://aistudio.google.com/apikey';
    card.hidden = false;
    var title = lang() === 'en' ? 'Free taste used up' : '무료 체험을 다 쓰셨습니다';
    var fallback = lang() === 'en' ? 'Connect a free Gemini key or a subscription bridge to keep going.' : '무료 Gemini 키나 구독 브리지로 이어서 쓸 수 있습니다.';
    card.innerHTML = '<b>' + title + '</b><div>' +
      String((res && res.message) || fallback) +
      '</div><div class="free-limit__actions">' +
      '<a class="btn btn--primary btn--sm" href="' + href + '" target="_blank" rel="noopener noreferrer">' + (lang() === 'en' ? 'Connect my free Gemini key' : '내 무료 Gemini 키 연결') + '</a>' +
      '</div>';
  }

  function runFreeRound() {
    if (!FA) { toast('무료 체험 엔진을 불러오지 못했습니다.'); return; }
    if (state.generating) return;
    var plan = prepareRun();
    if (!plan) return;
    var roles = proRoles().slice(0, 3);
    if (!roles.length) return;
    var token = ++state.token;
    var target = room();
    var index = 0;
    var l = lang();
    state.replyTo = null;
    state.bridgeWait = null;
    clearError();
    closeModal('pro');
    setGenerating(true, '무료 AI가 답하는 중… 1/' + roles.length);
    renderThread();

    function step() {
      if (token !== state.token) return;
      if (index >= roles.length) { finishProRound(); return; }
      var role = roles[index];
      /* 무료 체험은 짧은 프롬프트(Worker 12초 제한 실측). 4블록·액션 1개만 요청한다. */
      var ko = l === 'ko';
      var prompt = ko
        ? '제품 팀 회의에서 ' + role.name + ' 자리로 발언해라. 안건: ' + plan.text + '\n' +
          '형식: 관점: 한 문장 / 제안: - 2개 / 리스크: - 1개 / 액션: - 담당 | 기한 | 할 일 (각 한 줄, 200자 이내, 없는 수치 금지)'
        : 'Speak as the ' + role.name + ' seat in a product team meeting. Agenda: ' + plan.text + '\n' +
          'Format: View: one sentence / Plan: - 2 items / Risk: - 1 item / Action: - owner | due | task (one line each, under 200 words, no invented figures)';
      var txt = $('#runProgressText');
      if (txt) txt.textContent = '무료 AI가 답하는 중… ' + (index + 1) + '/' + roles.length + ' · ' + role.name;
      FA.generate({ task: 'text', prompt: prompt, options: { temperature: 0.6, maxTokens: 500 } }, { timeoutMs: 45000 })
        .then(function (res) {
          if (token !== state.token) return null;
          if (res && res.ok) {
            var parsed = Core.parseBridgeAnswer(res.text, role, l);
            if (!AG) return parsed;
            return AG.check(parsed, l).then(function (g) { return g && g.ok ? g.value : parsed; });
          }
          if (FA.isQuota(res)) {
            setGenerating(false);
            renderFreeLimit(res);
            openModal('pro');
            return null;
          }
          throw new Error((res && res.message) || '무료 AI 응답을 받지 못했습니다.');
        })
        .then(function (parsed) {
          if (!parsed || token !== state.token) return;
          var msg = {
            id: uid('msg'), roleId: role.id, kind: role.kind, name: role.name, tag: role.tag,
            glyph: role.glyph, accent: role.accent, mode: 'free', round: plan.round,
            provider: 'free', modelLabel: 'Free taste', modelName: 'free-ai-taste', fallback: false,
            replyTo: null, blocks: parsed.blocks, claims: [],
            itemIds: parsed.items.map(function (x) { return x.id || uid('itm'); }), ts: Date.now()
          };
          appendMessage(target, msg);
          appendItems(target, msg.itemIds, parsed.items);
          index += 1;
          step();
        })
        .catch(function (err) {
          if (token !== state.token) return;
          setGenerating(false);
          toast((err && err.message) || '무료 AI 호출에 실패했습니다.');
        });
    }
    step();
  }

  /* ── subscription bridge: copy the question, paste the answer ────────── */

  function bridgeWaitMessage(role, route, plan, index) {
    return {
      id: uid('msg'),
      roleId: role.id,
      kind: role.kind,
      name: role.name,
      tag: role.tag,
      glyph: role.glyph,
      accent: role.accent,
      mode: 'bridge',
      bridge: 'waiting',
      round: plan.round,
      provider: route.provider,
      modelLabel: route.label,
      modelName: route.model,
      bridgeIndex: index,
      bridgeAgenda: plan.text,
      replyTo: null,
      blocks: [{ kind: 'ask', title: t('bridge.waitTitle'), lines: [t('bridge.waitLine', { site: PROVIDERS[route.provider].bridge.site })] }],
      claims: [],
      itemIds: [],
      ts: Date.now()
    };
  }

  function bridgeMessage(id) {
    return (room().messages || []).filter(function (m) { return m.id === id; })[0] || null;
  }

  function bridgeRole(m) {
    return resolvedRoles().filter(function (r) { return r.id === m.roleId; })[0]
      || { id: m.roleId, kind: m.kind, name: m.name, tag: m.tag, accent: m.accent };
  }

  /* The one line a seat keeps after it speaks — used in the next bridge prompt. */
  function bridgeLine(m) {
    var plan = (m.blocks || []).filter(function (b) { return b.kind === 'plan'; })[0];
    var line = (plan && plan.lines && plan.lines[0]) || (m.blocks && m.blocks[0] && m.blocks[0].lines && m.blocks[0].lines[0]) || '';
    return String(line).replace(/\s+/g, ' ').trim().slice(0, 130);
  }

  /* Built at copy time, so the question carries the current language and every
     answer that landed before this seat. */
  function bridgePromptFor(m) {
    var role = bridgeRole(m);
    var msgs = room().messages || [];
    var at = -1;
    msgs.forEach(function (x, i) { if (x.id === m.id) at = i; });
    var prior = [];
    msgs.slice(0, at < 0 ? msgs.length : at).forEach(function (x) {
      if (!x || x.roleId === 'user' || x.bridge === 'waiting') return;
      if ((x.round || 1) !== (m.round || 1)) return;
      prior.push({ name: x.name, tag: x.tag, line: bridgeLine(x) });
    });
    /* A later round opens with no turn of its own yet: give the web chat the
       last three answers so the seat still speaks with the meeting's context. */
    if (!prior.length) {
      msgs.slice(0, at < 0 ? msgs.length : at).filter(function (x) {
        return x && x.roleId !== 'user' && x.bridge !== 'waiting';
      }).slice(-3).forEach(function (x) {
        prior.push({ name: x.name, tag: x.tag, line: bridgeLine(x) });
      });
    }
    return Core.bridgePrompt({
      role: role,
      lang: lang(),
      agenda: m.bridgeAgenda || room().startedAgenda || room().agenda || '',
      room: state.room,
      roomName: roomInfo(state.room).name[lang()],
      roles: proRoles(),
      focus: role.focus || '',
      prior: prior,
      site: m.provider && PROVIDERS[m.provider] && PROVIDERS[m.provider].bridge ? PROVIDERS[m.provider].bridge.site : ''
    });
  }

  function bridgeSite(m) {
    return (m.provider && PROVIDERS[m.provider] && PROVIDERS[m.provider].bridge)
      ? PROVIDERS[m.provider].bridge
      : { site: m.modelLabel || 'AI', url: 'https://chatgpt.com' };
  }

  /* Copy the question and open the provider's web chat in a new tab. The copy
     toast is shown either way, so a blocked popup still leaves the prompt in
     the clipboard and the card shows the address to open by hand. */
  function openBridgeChat(id) {
    var m = bridgeMessage(id);
    if (!m) return;
    var site = bridgeSite(m);
    var text = bridgePromptFor(m);
    copyText(text, 'bridge.copied', { site: site.site });
    try {
      var win = window.open(site.url, '_blank');
      if (win) win.opener = null;
    } catch (e) { /* the visible link on the card is the fallback */ }
  }

  function applyBridgeAnswer(id, text) {
    var m = bridgeMessage(id);
    if (!m || m.bridge !== 'waiting') return false;
    var role = bridgeRole(m);
    var parsed = Core.parseBridgeAnswer(text, role, lang());
    if (!parsed.blocks.length) {
      toast(t('bridge.needText'));
      return false;
    }
    m.blocks = parsed.blocks;
    m.itemIds = parsed.items.map(function (x) { return x.id; });
    m.bridge = 'answered';
    m.answeredAt = Date.now();
    m.bridgeDraft = '';
    appendItems(room(), m.itemIds, parsed.items);
    refreshOutputs();
    save();
    renderThread();
    renderLive();
    renderProjects();
    toast(t('bridge.applied', { name: m.name, n: m.itemIds.length }));
    resumeAfterBridge(m);
    return true;
  }

  /* The free engine answers this one seat, so a meeting never stalls waiting
     for a browser tab. */
  function fillBridgeFree(id) {
    var m = bridgeMessage(id);
    if (!m || m.bridge !== 'waiting') return false;
    var role = bridgeRole(m);
    var roles = resolvedRoles();
    var result = Core.generateRound({
      agenda: m.bridgeAgenda || room().startedAgenda || '',
      room: state.room,
      roomName: roomInfo(state.room).name[lang()],
      lang: lang(),
      roles: roles,
      round: m.round || 1,
      seed: 1
    });
    var pick = result.messages.filter(function (x) { return x.roleId === m.roleId; })[0];
    if (!pick) pick = result.messages.filter(function (x) { return x.kind === role.kind; })[0];
    if (!pick) return false;
    var ids = pick.itemIds || [];
    var items = result.items.filter(function (it) { return ids.indexOf(it.id) >= 0; });
    m.blocks = pick.blocks;
    m.itemIds = ids;
    m.bridge = 'skipped';
    m.answeredAt = Date.now();
    m.bridgeDraft = '';
    appendItems(room(), ids, items);
    refreshOutputs();
    save();
    renderThread();
    renderLive();
    renderProjects();
    toast(t('bridge.freeDone', { name: m.name }));
    resumeAfterBridge(m);
    return true;
  }

  function resumeAfterBridge(m) {
    state.bridgeWait = null;
    var roles = proRoles();
    var nextIndex = (typeof m.bridgeIndex === 'number' ? m.bridgeIndex : roles.length) + 1;
    if (state.mode !== 'pro' || nextIndex >= roles.length) {
      setGenerating(false);
      renderThread();
      renderLive();
      return;
    }
    proSequence({ text: m.bridgeAgenda || room().startedAgenda || '', round: m.round || 1 }, roles, nextIndex);
  }

  /* A waiting bridge message survives a reload: the diorama and the seat keep
     saying whose answer the room is waiting for. */
  function syncBridgeWait() {
    var msgs = room().messages || [];
    var wait = null;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].roleId !== 'user' && msgs[i].mode === 'bridge' && msgs[i].bridge === 'waiting') { wait = msgs[i]; break; }
    }
    state.bridgeWait = wait ? { id: wait.id, roleId: wait.roleId, name: wait.name } : null;
    return wait;
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
      var replyRoute = Core.proRoute(role.model, state.pro, 0);
      if (!replyRoute) { openModal('pro'); return; }
      callProvider(prompt, controller.signal, replyRoute).then(function (out) {
        if (token !== state.token) return;
        return parseGuarded(out, role, lang(), function () {
          return callProvider(withStrictFormat(prompt, lang()), controller.signal, replyRoute);
        }).then(function (parsed) {
        var msg = {
          id: uid('msg'), roleId: role.id, kind: role.kind, name: role.name, tag: role.tag,
          glyph: role.glyph, accent: role.accent, mode: 'pro', round: parent.round || 1,
          provider: replyRoute.provider, modelLabel: replyRoute.label, modelName: replyRoute.model,
          fallback: replyRoute.fallback,
          replyTo: userMsg.id, blocks: parsed.blocks, claims: [],
          itemIds: parsed.items.map(function (x) { return x.id || uid('itm'); }), ts: Date.now()
        };
        appendMessage(room(), msg);
        appendItems(room(), msg.itemIds, parsed.items);
        refreshOutputs();
        save();
        renderProjects();
        });
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
      refreshOutputs();
      save();
      renderProjects();
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

  function copyText(text, okKey, vars) {
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
      toast(ok ? t(okKey, vars) : t('toast.copyFailed'));
      return ok;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () {
        toast(t(okKey, vars));
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

  /* Each provider has its own slot. A saved key is never printed back: the
     field stays empty with the masked key as its placeholder, and an empty
     field on save keeps the stored key instead of wiping it. */
  function fillProForm() {
    PROVIDER_ORDER.forEach(function (id) {
      var cfg = (state.pro && state.pro[id]) || null;
      var model = $('[data-pro-model="' + id + '"]');
      var key = $('[data-pro-key="' + id + '"]');
      var bridge = $('[data-pro-bridge="' + id + '"]');
      var bridged = !!(cfg && cfg.bridge && !String(cfg.key || '').trim());
      if (model) model.value = cfg ? cfg.model : PROVIDERS[id].model;
      if (key) {
        key.value = '';
        key.placeholder = cfg && cfg.key ? maskKey(cfg.key) : PROVIDERS[id].keyHint;
        key.setAttribute('data-saved', cfg && cfg.key ? '1' : '0');
      }
      if (bridge) bridge.checked = bridged;
    });
    var err = $('#proError');
    if (err) { err.hidden = true; err.textContent = ''; }
    renderProStatus();
  }

  function renderProStatus() {
    var keys = proCount();
    var bridges = bridgeCount();
    var total = PROVIDER_ORDER.length;
    var el = $('#proStatusValue');
    if (el) {
      el.textContent = keys === 0 && bridges === 0 ? t('pro.none')
        : keys === total ? t('pro.allConnected', { n: keys, total: total })
        : keys === 0 ? t('pro.bridgeOnly', { b: bridges })
        : bridges ? t('pro.bridgeStatus', { n: keys, b: bridges, total: total })
        : t('pro.someConnected', { n: keys, total: total });
      el.setAttribute('data-count', String(keys));
      el.setAttribute('data-bridge', String(bridges));
      el.classList.toggle('is-ready', keys === total);
      el.classList.toggle('is-partial', keys > 0 && keys < total);
      el.classList.toggle('is-bridge', bridges > 0 && keys < total);
    }
    var chip = $('#proStatusBadge');
    if (chip) {
      chip.textContent = keys === 0 && bridges ? t('pro.bridgeBadge', { b: bridges }) : keys + '/' + total;
      chip.hidden = keys === 0 && bridges === 0;
      chip.classList.toggle('is-full', keys === total);
      chip.classList.toggle('is-bridge', bridges > 0);
    }
    PROVIDER_ORDER.forEach(function (id) {
      var cfg = (state.pro && state.pro[id]) || null;
      var on = !!(cfg && cfg.key);
      var bridged = !!(cfg && cfg.bridge && !cfg.key);
      var slot = $('[data-pro-slot="' + id + '"]');
      if (slot) {
        slot.classList.toggle('is-connected', on);
        slot.classList.toggle('is-bridged', bridged);
      }
      var mark = $('[data-pro-badge="' + id + '"]');
      if (mark) {
        mark.textContent = on ? t('pro.connected') : bridged ? t('pro.bridged') : t('pro.notConnected');
        mark.classList.toggle('is-on', on);
        mark.classList.toggle('is-bridge', bridged);
      }
      var clear = $('[data-pro-clear="' + id + '"]');
      if (clear) {
        clear.disabled = !on && !bridged;
        clear.textContent = bridged ? t('pro.bridgeOff') : t('pro.deleteOne');
      }
      var saved = $('[data-pro-saved="' + id + '"]');
      if (saved) {
        saved.hidden = !on && !bridged;
        saved.textContent = on ? t('pro.savedOn', { key: maskKey(cfg.key) })
          : bridged ? t('pro.bridgeOn', { site: PROVIDERS[id].bridge.site }) : '';
        saved.classList.toggle('is-bridge', bridged);
      }
      var key = $('[data-pro-key="' + id + '"]');
      if (key) key.disabled = bridged;
    });
  }

  function saveProvider(id) {
    if (!PROVIDERS[id]) return;
    var modelEl = $('[data-pro-model="' + id + '"]');
    var keyEl = $('[data-pro-key="' + id + '"]');
    var bridgeEl = $('[data-pro-bridge="' + id + '"]');
    var err = $('#proError');
    var typed = keyEl ? keyEl.value.trim() : '';
    var stored = (state.pro && state.pro[id] && state.pro[id].key) || '';
    var key = typed || stored;
    var model = (modelEl && modelEl.value.trim()) || PROVIDERS[id].model;
    var bridgeOn = !!(bridgeEl && bridgeEl.checked && PROVIDERS[id].bridge);
    if (!key && !bridgeOn) {
      if (err) {
        err.textContent = PROVIDERS[id].bridge ? t('pro.invalidOrBridge') : t('pro.invalid');
        err.hidden = false;
      }
      if (keyEl) keyEl.focus();
      return;
    }
    state.pro = state.pro || {};
    state.pro[id] = { model: model };
    if (key) state.pro[id].key = key;
    if (bridgeOn) state.pro[id].bridge = true;
    savePro();
    state.mode = 'pro';
    save();
    fillProForm();
    renderMode();
    renderRoster();
    toast(bridgeOn && !key
      ? t('toast.proBridge', { provider: PROVIDERS[id].mark, site: PROVIDERS[id].bridge.site })
      : t('toast.proSavedOne', { provider: PROVIDERS[id].mark }));
  }

  function clearProvider(id) {
    if (!state.pro || !state.pro[id]) return;
    var wasBridge = !!(state.pro[id].bridge && !state.pro[id].key);
    delete state.pro[id];
    if (!Object.keys(state.pro).length) state.pro = null;
    savePro();
    if (!proReady()) state.mode = 'free';
    save();
    fillProForm();
    renderMode();
    renderRoster();
    toast(wasBridge
      ? t('toast.proBridgeOff', { provider: PROVIDERS[id].mark })
      : t('toast.proDeletedOne', { provider: PROVIDERS[id].mark }));
  }

  /* ── reset ───────────────────────────────────────────────────────────── */

  function resetRoom() {
    var r = room();
    var prj = currentProject();
    if (prj) {
      /* The finished record stays in the project list; the room opens blank. */
      prj.messages = r.messages || [];
      prj.items = r.items || [];
      prj.outputs = r.outputs || [];
      prj.updatedAt = Date.now();
      delete state.activeProject[state.room];
    }
    r.agenda = '';
    r.startedAgenda = '';
    r.messages = [];
    r.items = [];
    r.outputs = [];
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
    flushRoom();
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
    delete state.activeProject[id];
    state.projects = state.projects.filter(function (p) { return p.room !== id; });
    if (!projectById(state.openProjectId)) state.openProjectId = null;
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
    var freeRoundBtn = $('#freeRoundBtn');
    if (freeRoundBtn) freeRoundBtn.addEventListener('click', function () { runFreeRound(); });

    var roomTabs = $('#roomTabs');
    if (roomTabs) {
      roomTabs.addEventListener('click', function (e) {
        var tab = e.target.closest('.room-tab');
        if (!tab) return;
        var id = tab.getAttribute('data-room');
        if (!id || id === state.room) return;
        flushRoom();
        state.token += 1;
        state.generating = false;
        state.thinking = null;
        state.speakingId = null;
        state.livePreview = '';
        state.replyTo = null;
        state.room = id;
        var prj = currentProject();
        state.openProjectId = prj ? prj.id : (state.projects.filter(function (p) { return p.room === id; })[0] || {}).id || state.openProjectId;
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
          return;
        }
        var bcopy = e.target.closest('[data-bridge-copy]');
        if (bcopy) { openBridgeChat(bcopy.getAttribute('data-bridge-copy')); return; }
        var bapply = e.target.closest('[data-bridge-apply]');
        if (bapply) {
          var bid = bapply.getAttribute('data-bridge-apply');
          var box = thread.querySelector('[data-bridge-text="' + bid + '"]');
          applyBridgeAnswer(bid, box ? box.value : '');
          return;
        }
        var bfree = e.target.closest('[data-bridge-free]');
        if (bfree) { fillBridgeFree(bfree.getAttribute('data-bridge-free')); return; }
      });
      thread.addEventListener('input', function (e) {
        var box = e.target.closest('[data-bridge-text]');
        if (!box) return;
        var m = bridgeMessage(box.getAttribute('data-bridge-text'));
        if (m) { m.bridgeDraft = box.value; saveSoon(); }
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
        if (e.target.matches('[data-bridge-text]') && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          var bid = e.target.getAttribute('data-bridge-text');
          applyBridgeAnswer(bid, e.target.value);
          return;
        }
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
          model: arch.model,
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
      proForm.addEventListener('submit', function (e) { e.preventDefault(); });
      proForm.addEventListener('click', function (e) {
        var save = e.target.closest('[data-pro-save]');
        if (save) { saveProvider(save.getAttribute('data-pro-save')); return; }
        var clear = e.target.closest('[data-pro-clear]');
        if (clear) { clearProvider(clear.getAttribute('data-pro-clear')); return; }
        var reset = e.target.closest('[data-pro-reset-model]');
        if (reset) {
          var id = reset.getAttribute('data-pro-reset-model');
          var model = $('[data-pro-model="' + id + '"]');
          if (model && PROVIDERS[id]) model.value = PROVIDERS[id].model;
        }
      });
      /* Enter inside a slot saves that slot, not the whole form. */
      proForm.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        var field = e.target.closest('[data-pro-model], [data-pro-key]');
        if (!field) return;
        e.preventDefault();
        var slot = field.closest('[data-pro-slot]');
        if (slot) saveProvider(slot.getAttribute('data-pro-slot'));
      });
      /* The bridge switch and the key field describe the same slot: off leaves
         the key usable, on makes the key optional. */
      proForm.addEventListener('change', function (e) {
        var box = e.target.closest('[data-pro-bridge]');
        if (!box) return;
        var slot = box.closest('[data-pro-slot]');
        var key = slot && slot.querySelector('[data-pro-key]');
        var id = slot && slot.getAttribute('data-pro-slot');
        var stored = !!(id && state.pro && state.pro[id] && state.pro[id].key);
        if (key) key.disabled = box.checked && !stored;
      });
    }

    var proDeleteAll = $('#proDeleteAll');
    if (proDeleteAll) proDeleteAll.addEventListener('click', function () {
      if (!proCount() && !bridgeCount()) return;
      state.pro = null;
      state.mode = 'free';
      savePro();
      save();
      fillProForm();
      renderMode();
      renderRoster();
      toast(t('toast.proDeleted'));
    });

    /* Projects & outputs panel: pick a project, filter it, copy or export its
       deliverables. Every click reads the stored project, never a guess. */
    var projectPanel = $('#projectPanel');
    if (projectPanel) {
      projectPanel.addEventListener('click', function (e) {
        var pick = e.target.closest('[data-project]');
        if (pick) { openProject(pick.getAttribute('data-project')); return; }
        var filter = e.target.closest('[data-project-filter]');
        if (filter) {
          state.projectFilter = filter.getAttribute('data-project-filter');
          renderProjects();
          return;
        }
        var open = e.target.closest('[data-open-project]');
        if (open) { openProject(open.getAttribute('data-open-project')); return; }
        var proj = projectById(state.openProjectId);
        if (!proj) return;
        var one = e.target.closest('[data-copy-output]');
        if (one) {
          var id = one.getAttribute('data-copy-output');
          var out = (proj.outputs || []).filter(function (o) { return o.id === id; })[0];
          if (out) copyText(outputText(out), 'project.copied');
          return;
        }
        if (e.target.closest('[data-copy-all]')) {
          copyText(allOutputsText(proj), 'project.allCopied');
          return;
        }
        var exp = e.target.closest('[data-out-export]');
        if (exp) exportOutputs(exp.getAttribute('data-out-export'));
      });
    }

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
