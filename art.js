/* ============================================================================
 * OneTap AI Team Room · art.js
 * The warm clay diorama layer: one photographed (generated, local, WebP) clay
 * miniature room per department, a hand-drawn clay toy figure sitting in front
 * of it, and a warm wood meeting table. Pure SVG + local images: no CDN, no
 * runtime request beyond the files in assets/diorama/.
 *
 * Exposes window.TeamRoomArt (and module.exports for the node tests).
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* Warm studio palette: walnut, terracotta, mustard, sage, clay rose. */
  var WOOD = '#B98A5A';
  var INK = '#3A2A1C';

  var ROOM_ACCENT = {
    general: '#8A6A47',
    plan: '#B45309',
    dev: '#4F7057',
    design: '#A85C63',
    video: '#8A5A6B',
    marketing: '#96690D',
    sales: '#A8492A',
    ops: '#5C7A4A'
  };
  var DEPT_PALETTE = ['#B45309', '#4F7057', '#A85C63', '#8A5A6B', '#96690D', '#A8492A', '#5C7A4A', '#8A6A47'];

  /* One generated clay room per department (640×400 WebP, ~25KB each). */
  var ROOM_ART = {
    general: 'assets/diorama/general.webp',
    plan: 'assets/diorama/plan.webp',
    dev: 'assets/diorama/dev.webp',
    design: 'assets/diorama/design.webp',
    video: 'assets/diorama/video.webp',
    marketing: 'assets/diorama/marketing.webp',
    sales: 'assets/diorama/sales.webp',
    ops: 'assets/diorama/ops.webp'
  };
  var MEETING_ART = 'assets/diorama/meeting.webp';

  function hash(s) {
    var h = 0;
    String(s || '').split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 99991; });
    return h;
  }

  function deptAccent(id) {
    if (ROOM_ACCENT[id]) return ROOM_ACCENT[id];
    return DEPT_PALETTE[hash(id) % DEPT_PALETTE.length];
  }

  /* A department the user added gets a real room too, chosen once from its name
     so the same room always comes back after a refresh. */
  function sceneFor(id) {
    if (ROOM_ART[id]) return ROOM_ART[id];
    var keys = ['plan', 'design', 'marketing', 'ops', 'sales', 'dev', 'video', 'general'];
    return ROOM_ART[keys[hash(id) % keys.length]];
  }

  /* ── what each room does all day ─────────────────────────────────────── */
  /* Every department works at its own desk while no meeting is running: the
     clay desk widget on the left of the room shows the work (a cork board, a
     code screen, a palette, a cut timeline, a chart, a checklist, a chat ping,
     a proposal folder) and the figure holds the matching pose. A department
     the user adds gets a stable kind and pose from its name. */
  var DEPT_WORK = {
    general: { kind: 'notes', pose: 'write' },
    plan: { kind: 'board', pose: 'point' },
    dev: { kind: 'code', pose: 'type' },
    design: { kind: 'palette', pose: 'write' },
    video: { kind: 'timeline', pose: 'point' },
    marketing: { kind: 'chart', pose: 'point' },
    sales: { kind: 'pitch', pose: 'present' },
    ops: { kind: 'checklist', pose: 'write' }
  };
  var WORK_KINDS = ['notes', 'board', 'code', 'palette', 'timeline', 'chart', 'pitch', 'checklist'];
  var POSE_BY_KIND = {
    notes: 'write', board: 'point', code: 'type', palette: 'write',
    timeline: 'point', chart: 'point', pitch: 'present', checklist: 'write'
  };

  function workFor(roomId) {
    if (DEPT_WORK[roomId]) return DEPT_WORK[roomId];
    var kind = WORK_KINDS[hash('work:' + roomId) % WORK_KINDS.length];
    return { kind: kind, pose: POSE_BY_KIND[kind] };
  }

  /* ── the clay desk widget: one animated prop set per kind ────────────── */
  /* Pure SVG; every moving part carries a class the stylesheet animates
     (code lines scroll, bars grow, lamps light in turn, the playhead sweeps).
     viewBox 100×56 sits in a small cream card at the left of the room. */
  function deskProps(kind) {
    var k = DEPT_WORK[kind] ? kind : (WORK_KINDS.indexOf(kind) >= 0 ? kind : 'notes');
    var p = [];
    if (k === 'board') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#E6C9A0" stroke="#B98A5A"/>');
      p.push('<rect x="8" y="8" width="37" height="23" rx="2" fill="#FFF7E4"/>');
      p.push('<rect x="52" y="8" width="38" height="23" rx="2" fill="#F6E3BE"/>');
      p.push('<path class="prop__scribble" d="M12 14h28M12 19h21M12 23h25" stroke="#B45309" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="86" stroke-dashoffset="86"/>');
      p.push('<path class="prop__scribble prop__scribble--b" d="M56 14h29M56 19h19M56 23h24" stroke="#8A6A47" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="78" stroke-dashoffset="78"/>');
      p.push('<path class="prop__mark" d="M10 36h36M10 43h23" stroke="#5C7A4A" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="40" stroke-dashoffset="40"/>');
      p.push('<circle cx="27" cy="7" r="2.4" fill="#A8492A"/><circle cx="71" cy="7" r="2.4" fill="#96690D"/>');
      p.push('<circle class="prop__pointer" cx="58" cy="26" r="3" fill="#3A2A1C" opacity=".6"/>');
    } else if (k === 'code') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#3A2A1C"/>');
      p.push('<rect class="prop__screen" x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#F4B96A" opacity=".1"/>');
      p.push('<g class="prop__code">');
      ['10:32:#EBD9B6', '16:42:#A8C08A', '22:24:#F0C98A', '28:36:#A8C08A', '34:30:#EBD9B6', '40:20:#F0C98A', '46:33:#A8C08A', '52:26:#EBD9B6'].forEach(function (row, i) {
        var bits = row.split(':');
        p.push('<rect x="' + bits[0] + '" y="' + (6 + i * 6.4) + '" width="' + bits[1] + '" height="2.6" rx="1.3" fill="' + bits[2] + '"/>');
      });
      p.push('</g>');
      p.push('<rect class="prop__caret" x="10" y="46" width="2.6" height="5" rx="1" fill="#FBE3B0"/>');
    } else if (k === 'palette') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FFFCF4" stroke="#DCC6A4"/>');
      p.push('<rect x="6" y="6" width="50" height="44" rx="3" fill="#FFFDF6" stroke="#E4D2B4"/>');
      p.push('<path class="prop__stroke" d="M9 45c7-12 12-3 18-12s10 6 16-7" fill="none" stroke="#A85C63" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="72" stroke-dashoffset="72"/>');
      p.push('<circle cx="12" cy="13" r="3.2" fill="#B45309"/><circle cx="49" cy="12" r="3.2" fill="#5C7A4A"/>');
      p.push('<circle class="prop__swatch" cx="72" cy="31" r="16" fill="#F2DEC0" stroke="#C9A173"/>');
      p.push('<circle cx="65" cy="25" r="4.2" fill="#B45309"/><circle cx="79" cy="25" r="4.2" fill="#A85C63"/>');
      p.push('<circle cx="65" cy="37" r="4.2" fill="#96690D"/><circle cx="79" cy="37" r="4.2" fill="#5C7A4A"/>');
      p.push('<g class="prop__brush"><rect x="80" y="6" width="3.2" height="15" rx="1.4" fill="#8A6A47" transform="rotate(26 81 13)"/>');
      p.push('<path d="M80 6l1.6-4 1.6 4z" fill="#A85C63" transform="rotate(26 81 13)"/></g>');
    } else if (k === 'timeline') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FBF0DA" stroke="#DCC6A4"/>');
      p.push('<rect x="6" y="6" width="44" height="16" rx="2" fill="#4A3B2E"/>');
      p.push('<rect class="prop__sweep" x="6" y="6" width="11" height="16" fill="#FFF0C8" opacity=".3"/>');
      p.push('<rect x="52" y="8" width="16" height="3" rx="1.5" fill="#D9C3A0"/><rect x="52" y="14" width="11" height="3" rx="1.5" fill="#C7AE87"/>');
      p.push('<rect x="6" y="30" width="88" height="10" rx="3" fill="#EAD9BE"/>');
      p.push('<rect x="7" y="31.5" width="20" height="7" rx="1.6" fill="#B45309"/>');
      p.push('<rect x="29" y="31.5" width="28" height="7" rx="1.6" fill="#5C7A4A"/>');
      p.push('<rect x="59" y="31.5" width="18" height="7" rx="1.6" fill="#A85C63"/>');
      p.push('<g class="prop__play"><rect x="0" y="27" width="1.8" height="17" fill="#3A2A1C"/><path d="M-3.4 25h8.6l-4.3 4.2z" fill="#3A2A1C"/></g>');
      p.push('<path d="M6 47h88" stroke="#D9C3A0" stroke-width="1.4" stroke-dasharray="2 4"/>');
    } else if (k === 'chart') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FFFCF4" stroke="#DCC6A4"/>');
      p.push('<path d="M10 48h82M10 48V8" stroke="#C9A173" stroke-width="1.4" stroke-linecap="round"/>');
      p.push('<rect class="prop__bar prop__bar--a" x="16" y="30" width="12" height="18" rx="2" fill="#B45309"/>');
      p.push('<rect class="prop__bar prop__bar--b" x="34" y="23" width="12" height="25" rx="2" fill="#96690D"/>');
      p.push('<rect class="prop__bar prop__bar--c" x="52" y="27" width="12" height="21" rx="2" fill="#A8492A"/>');
      p.push('<rect class="prop__bar prop__bar--d" x="70" y="14" width="12" height="34" rx="2" fill="#5C7A4A"/>');
      p.push('<path class="prop__trend" d="M18 32 38 24 56 29 78 15" fill="none" stroke="#3A2A1C" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="74" stroke-dashoffset="74"/>');
      p.push('<path d="M74 13l6 1-2 5z" fill="#3A2A1C"/>');
    } else if (k === 'checklist') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FFFCF4" stroke="#DCC6A4"/>');
      [11, 26, 41].forEach(function (y, i) {
        p.push('<circle cx="14" cy="' + y + '" r="5" fill="none" stroke="#C9A173" stroke-width="1.6"/>');
        p.push('<path class="prop__tick prop__tick--' + i + '" d="M11 ' + y + 'l2.4 2.4 4-4.6" fill="none" stroke="#5C7A4A" stroke-width="2" stroke-linecap="round" stroke-dasharray="12" stroke-dashoffset="12"/>');
        p.push('<rect x="24" y="' + (y - 1.6) + '" width="' + (44 - i * 6) + '" height="3.2" rx="1.6" fill="#E2D0B2"/>');
      });
      p.push('<circle class="prop__lamp prop__lamp--a" cx="86" cy="13" r="4" fill="#5C7A4A"/>');
      p.push('<circle class="prop__lamp prop__lamp--b" cx="86" cy="28" r="4" fill="#96690D"/>');
      p.push('<circle class="prop__lamp prop__lamp--c" cx="86" cy="43" r="4" fill="#A8492A"/>');
      p.push('<circle class="prop__ping prop__ping--c" cx="86" cy="28" r="5" fill="none" stroke="#B45309" stroke-width="1.6"/>');
    } else if (k === 'chat') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FFFCF4" stroke="#DCC6A4"/>');
      p.push('<g class="prop__bubble prop__bubble--a"><rect x="6" y="7" width="52" height="16" rx="8" fill="#F2DEC0"/>');
      p.push('<path d="M14 23l0 5 5-5z" fill="#F2DEC0"/>');
      p.push('<circle cx="20" cy="15" r="1.7" fill="#8A6A47"/><circle cx="27" cy="15" r="1.7" fill="#8A6A47"/><circle cx="34" cy="15" r="1.7" fill="#8A6A47"/></g>');
      p.push('<g class="prop__bubble prop__bubble--b"><rect x="28" y="28" width="62" height="16" rx="8" fill="#CFE0C4"/>');
      p.push('<path d="M78 44l0 5-5-5z" fill="#CFE0C4"/><rect x="35" y="34" width="38" height="3" rx="1.5" fill="#5C7A4A"/></g>');
      p.push('<circle class="prop__ping" cx="90" cy="12" r="5" fill="none" stroke="#A8492A" stroke-width="1.8"/>');
    } else if (k === 'pitch') {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FFFCF4" stroke="#DCC6A4"/>');
      p.push('<path d="M6 12h20l4 5h64v32H6z" fill="#C79A3C" stroke="#A87A4C" stroke-width="1"/>');
      p.push('<rect class="prop__page prop__page--a" x="16" y="15" width="66" height="30" rx="2" fill="#FFFDF6" stroke="#E0CBA9"/>');
      p.push('<rect class="prop__page prop__page--b" x="16" y="15" width="66" height="30" rx="2" fill="#FFF8E8" stroke="#E0CBA9"/>');
      p.push('<rect x="22" y="20" width="30" height="3" rx="1.5" fill="#C9A173"/>');
      p.push('<rect x="22" y="26" width="46" height="2.4" rx="1.2" fill="#E2D0B2"/>');
      p.push('<rect x="22" y="31" width="38" height="2.4" rx="1.2" fill="#E2D0B2"/>');
      p.push('<circle cx="72" cy="37" r="5" fill="none" stroke="#5C7A4A" stroke-width="1.8"/><path d="M69.6 37l1.8 1.8 3-3.4" fill="none" stroke="#5C7A4A" stroke-width="1.8" stroke-linecap="round"/>');
    } else {
      p.push('<rect x="2.5" y="2.5" width="95" height="51" rx="4.5" fill="#FFFCF4" stroke="#DCC6A4"/>');
      p.push('<rect x="7" y="6" width="58" height="44" rx="2" fill="#FFFDF6" stroke="#E4D2B4"/>');
      p.push('<rect x="12" y="11" width="34" height="3.2" rx="1.6" fill="#D9C3A0"/>');
      p.push('<rect x="12" y="18" width="46" height="2.6" rx="1.3" fill="#E7D6BA"/>');
      p.push('<rect x="12" y="23.5" width="40" height="2.6" rx="1.3" fill="#E7D6BA"/>');
      p.push('<rect x="12" y="29" width="44" height="2.6" rx="1.3" fill="#E7D6BA"/>');
      p.push('<path class="prop__write" d="M12 41h40" stroke="#B45309" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="40" stroke-dashoffset="40"/>');
      p.push('<circle class="prop__lens" cx="75" cy="34" r="10" fill="rgba(255,255,255,.35)" stroke="#8A6A47" stroke-width="2.4"/>');
      p.push('<path d="M82 41l6 6" stroke="#8A6A47" stroke-width="3" stroke-linecap="round"/>');
      p.push('<g class="prop__pen"><rect x="48" y="20" width="3" height="17" rx="1.3" fill="#B45309" transform="rotate(24 49 28)"/><path d="M48 37l1.5 3 1.5-3z" fill="#3A2A1C" transform="rotate(24 49 28)"/></g>');
    }
    return '<svg class="props props--' + k + '" viewBox="0 0 100 56" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">'
      + p.join('') + '</svg>';
  }

  /* ── colour helpers ──────────────────────────────────────────────────── */
  function mix(hex, to, k) {
    var A = String(hex).replace('#', '');
    var B = String(to).replace('#', '');
    var out = '#';
    for (var i = 0; i < 3; i += 1) {
      var a = parseInt(A.slice(i * 2, i * 2 + 2), 16);
      var b = parseInt(B.slice(i * 2, i * 2 + 2), 16);
      out += ('0' + Math.round(a + (b - a) * k).toString(16)).slice(-2);
    }
    return out;
  }
  function dark(hex, k) { return mix(hex, '#2A1A0E', k); }
  function lite(hex, k) { return mix(hex, '#FFF6E6', k); }

  /* ── who sits where: one face per reasoning kind ─────────────────────── */
  var LOOKS = {
    pm: {
      skin: '#F2C9A4', hair: '#3B2A20', style: 'beanie', hat: '#C08A2E',
      shirt: '#B4552F', collar: 'knit', gear: 'glasses', mouth: 'smile'
    },
    dev: {
      skin: '#E8B58C', hair: '#2F2119', style: 'buzz', hat: '#4F7057',
      shirt: '#5E7F60', collar: 'hoodie', gear: 'headset', mouth: 'smile'
    },
    /* Appointed seats: design (long bob + glasses + knit), video (long hair,
       headphones, open collar, clapperboard), sales (curls, blazer, folder). */
    design: {
      skin: '#F3CBA8', hair: '#4A2F2A', style: 'bob', hat: '#A85C63',
      shirt: '#A85C63', collar: 'knit', gear: 'glasses', mouth: 'smile', prop: 'pencil'
    },
    video: {
      skin: '#EBB88F', hair: '#3A2B33', style: 'long', hat: '#8A5A6B',
      shirt: '#8A5A6B', collar: 'collar', gear: 'headset', mouth: 'grin', prop: 'clapper'
    },
    sales: {
      skin: '#F0C29A', hair: '#2E241C', style: 'curl', hat: '#A8492A',
      shirt: '#A8492A', collar: 'blazer', gear: 'none', mouth: 'smirk', prop: 'folder'
    },
    growth: {
      skin: '#F4CFAC', hair: '#4A3324', style: 'cap', hat: '#7A6A2E',
      shirt: '#C79A3C', collar: 'polo', gear: 'none', mouth: 'grin'
    },
    cfo: {
      skin: '#EABE96', hair: '#8C8078', style: 'side', hat: '#7A5A3C',
      shirt: '#8A5A4A', collar: 'tie', tie: '#5C3B29', gear: 'glasses', mouth: 'flat'
    },
    auditor: {
      skin: '#F0C4A0', hair: '#42304A', style: 'bun', hat: '#8A5A6B',
      shirt: '#7E6478', collar: 'vest', gear: 'glasses', mouth: 'smirk'
    }
  };

  var HAIR_VARIANTS = ['#3B2A20', '#5A3E2B', '#6E4B31', '#2E241C', '#7A5236', '#4A3548'];
  var HAT_VARIANTS = ['#B45309', '#4F7057', '#96690D', '#A85C63', '#8A5A6B', '#8A6A47'];
  var SHIRT_VARIANTS = ['#C4703E', '#5E7F60', '#C79A3C', '#A85C63', '#7E6478', '#8A6A47', '#B0703E'];
  var STYLE_VARIANTS = ['beanie', 'buzz', 'side', 'bun', 'cap', 'bob', 'long', 'curl'];
  var MOUTH_VARIANTS = ['smile', 'grin', 'smirk', 'flat'];

  function lookFor(role) {
    var base = LOOKS[(role && role.kind) || 'pm'] || LOOKS.pm;
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    out.accent = (role && role.accent) || base.shirt;
    if (role && role.custom) {
      /* An added role inherits its kind's uniform but gets its own face, so two
         added roles of one kind never look like the same person. */
      var h = hash(role.id || '');
      out.hair = HAIR_VARIANTS[h % HAIR_VARIANTS.length];
      out.hat = HAT_VARIANTS[h % HAT_VARIANTS.length];
      out.style = STYLE_VARIANTS[h % STYLE_VARIANTS.length];
      out.mouth = MOUTH_VARIANTS[Math.floor(h / 7) % MOUTH_VARIANTS.length];
      out.shirt = SHIRT_VARIANTS[Math.floor(h / 13) % SHIRT_VARIANTS.length];
      out.gear = h % 3 === 0 ? 'headset' : (h % 2 ? 'glasses' : 'none');
    }
    return out;
  }

  /* ── one clay toy figure ─────────────────────────────────────────────── */
  /* viewBox 96×122: head 24–72 / 14–62, torso 25–71 / 58–96, seated legs to
     114. The chair, when asked for, is drawn first so it peeks out on both
     sides of the body. */
  function figure(L, o) {
    var opts = o || {};
    var shirt = L.shirt || '#C4703E';
    var shirtLo = dark(shirt, .18);
    var shirtHi = lite(shirt, .26);
    var skin = L.skin || '#F2C9A4';
    var skinLo = dark(skin, .14);
    var skinHi = lite(skin, .3);
    var hair = L.hair || '#3B2A20';
    var hat = L.hat || L.accent || shirt;
    var accent = L.accent || shirt;
    var p = [];
    var uid = 'f' + (L.__n = (L.__n || 0) + 1) + Math.random().toString(36).slice(2, 6);
    var gSkin = 'sk' + uid;
    var gShirt = 'sh' + uid;
    var gHead = 'hd' + uid;
    var gChair = 'ch' + uid;

    if (opts.chair) {
      /* A small wooden stool, so the figure is grounded on the floor without a
         chair back fighting the photograph behind it. */
      var seat = opts.chairCol || '#A87A4C';
      p.push('<defs><linearGradient id="' + gChair + '" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0" stop-color="' + lite(seat, .28) + '"/>'
        + '<stop offset="1" stop-color="' + dark(seat, .16) + '"/></linearGradient></defs>');
      p.push('<g class="fig__chair">'
        + '<path d="M23 96h50l-4 8H27z" fill="' + dark(seat, .3) + '" opacity=".55"/>'
        + '<path d="M25 98v15M71 98v15M33 100v13M63 100v13" stroke="' + dark(seat, .22)
        + '" stroke-width="4.4" stroke-linecap="round"/>'
        + '<ellipse cx="48" cy="94" rx="26" ry="7" fill="url(#' + gChair + ')" stroke="' + dark(seat, .2) + '" stroke-width=".8"/>'
        + '<ellipse cx="48" cy="92.6" rx="23" ry="5.4" fill="' + lite(seat, .3) + '"/>'
        + '</g>');
    }

    /* ground shadow (only when the feet are in frame) */
    if (!opts.table) p.push('<ellipse cx="48" cy="116" rx="27" ry="5.4" fill="#5B3A1E" opacity=".16"/>');

    /* legs + shoes */
    if (opts.legs !== false) {
      var trouser = opts.trouser || '#6A5647';
      p.push('<path d="M37 88c-3 8-3 15-3 20" stroke="' + trouser + '" stroke-width="12" stroke-linecap="round" fill="none"/>');
      p.push('<path d="M59 88c3 8 3 15 3 20" stroke="' + trouser + '" stroke-width="12" stroke-linecap="round" fill="none"/>');
      p.push('<path d="M38 92c-2 7-2 12-2 16" stroke="' + dark(trouser, .12) + '" stroke-width="4" stroke-linecap="round" fill="none" opacity=".35"/>');
      p.push('<path d="M58 92c2 7 2 12 2 16" stroke="' + dark(trouser, .12) + '" stroke-width="4" stroke-linecap="round" fill="none" opacity=".35"/>');
      p.push('<rect x="27" y="104" width="20" height="11" rx="5.4" fill="#5A3A28"/>');
      p.push('<rect x="49" y="104" width="20" height="11" rx="5.4" fill="#5A3A28"/>');
      p.push('<rect x="27" y="104" width="20" height="4" rx="2" fill="#7A5540"/>');
      p.push('<rect x="49" y="104" width="20" height="4" rx="2" fill="#7A5540"/>');
    }

    /* torso */
    p.push('<defs>'
      + '<linearGradient id="' + gShirt + '" x1=".18" y1="0" x2=".82" y2="1">'
      + '<stop offset="0" stop-color="' + shirtHi + '"/>'
      + '<stop offset=".55" stop-color="' + shirt + '"/>'
      + '<stop offset="1" stop-color="' + shirtLo + '"/></linearGradient>'
      + '<radialGradient id="' + gSkin + '" cx=".34" cy=".28" r=".85">'
      + '<stop offset="0" stop-color="' + skinHi + '"/>'
      + '<stop offset=".62" stop-color="' + skin + '"/>'
      + '<stop offset="1" stop-color="' + skinLo + '"/></radialGradient>'
      + '<radialGradient id="' + gHead + '" cx=".34" cy=".26" r=".92">'
      + '<stop offset="0" stop-color="' + skinHi + '"/>'
      + '<stop offset=".68" stop-color="' + skin + '"/>'
      + '<stop offset="1" stop-color="' + skinLo + '"/></radialGradient>'
      + '</defs>');

    p.push(opts.table
      ? '<path d="M27 62c0-5 4-7 21-7s21 2 21 7v60H27z" fill="url(#' + gShirt + ')" stroke="' + shirtLo + '" stroke-width=".8"/>'
      : '<path d="M27 62c0-5 4-7 21-7s21 2 21 7v26c0 5-9 8-21 8s-21-3-21-8z" fill="url(#' + gShirt + ')" stroke="' + shirtLo + '" stroke-width=".8"/>');
    p.push('<path d="M31 61c4-3 30-3 34 0" stroke="' + shirtHi + '" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>');
    if (!opts.table) {
      p.push('<path d="M33 89h30" stroke="' + dark(shirt, .26) + '" stroke-width="1.2" opacity=".35"/>');
      p.push('<path d="M34 91v4M39 91v5M44 91v4M52 91v4M57 91v5M62 91v4" stroke="' + dark(shirt, .28) + '" stroke-width="1" opacity=".22"/>');
    }

    /* collar / neckline */
    var coll = L.collar || 'knit';
    p.push('<rect x="42" y="50" width="12" height="11" rx="5" fill="' + skinLo + '"/>');
    if (coll === 'knit') {
      p.push('<rect x="37" y="53" width="22" height="10" rx="5" fill="' + dark(shirt, .12) + '"/>');
      p.push('<path d="M40 55h16M40 58h16" stroke="' + lite(shirt, .12) + '" stroke-width="1.2" opacity=".55"/>');
    } else if (coll === 'hoodie') {
      p.push('<path d="M31 60c2-8 32-8 34 0-6 4-28 4-34 0z" fill="' + shirtLo + '"/>');
      p.push('<path d="M42 60v9M54 60v9" stroke="' + lite(shirt, .45) + '" stroke-width="1.6" stroke-linecap="round"/>');
      p.push('<circle cx="42" cy="70" r="1.5" fill="' + lite(shirt, .45) + '"/><circle cx="54" cy="70" r="1.5" fill="' + lite(shirt, .45) + '"/>');
    } else if (coll === 'tie') {
      p.push('<path d="M39 58l9 6 9-6c-3-2-15-2-18 0z" fill="#FBF3E4"/>');
      p.push('<path d="M48 62l3.2 2-1.6 8.4-1.6 2-1.6-2-1.6-8.4z" fill="' + (L.tie || '#5C3B29') + '"/>');
    } else if (coll === 'vest') {
      p.push('<path d="M27 62c0-4 3-6 9-6v34c-6-1-9-3-9-7z" fill="' + dark(shirt, .3) + '"/>');
      p.push('<path d="M69 62c0-4-3-6-9-6v34c6-1 9-3 9-7z" fill="' + dark(shirt, .3) + '"/>');
      p.push('<path d="M39 57l9 8 9-8" fill="none" stroke="' + lite(shirt, .35) + '" stroke-width="1.7" stroke-linecap="round"/>');
      p.push('<rect x="43" y="72" width="10" height="6" rx="1.6" fill="#FBF3E4"/>');
      p.push('<rect x="44.6" y="73.8" width="6.8" height="1.2" rx=".6" fill="' + accent + '"/>');
    } else if (coll === 'polo') {
      p.push('<path d="M40 56l8 6 8-6" fill="none" stroke="' + shirtLo + '" stroke-width="2.4" stroke-linecap="round"/>');
      p.push('<path d="M48 62v6" stroke="' + dark(shirt, .3) + '" stroke-width="1.6" opacity=".5"/>');
    } else if (coll === 'collar') {
      /* Open shirt collar: two folded points and a button line. */
      p.push('<path d="M38 52l10 10 10-10-4-2-6 5-6-5z" fill="' + lite(shirt, .32) + '" stroke="' + dark(shirt, .16) + '" stroke-width=".6"/>');
      p.push('<path d="M48 62v9" stroke="' + dark(shirt, .28) + '" stroke-width="1.3" opacity=".55"/>');
      p.push('<circle cx="48" cy="68" r=".9" fill="' + lite(shirt, .4) + '"/><circle cx="48" cy="72" r=".9" fill="' + lite(shirt, .4) + '"/>');
    } else if (coll === 'blazer') {
      /* Blazer lapels over the shirt, with a folded pocket square. */
      p.push('<path d="M28 61c0-4 3-6 9-7l11 10-9 6c-6-1-11-4-11-9z" fill="' + dark(shirt, .2) + '"/>');
      p.push('<path d="M68 61c0-4-3-6-9-7l-11 10 9 6c6-1 11-4 11-9z" fill="' + dark(shirt, .2) + '"/>');
      p.push('<path d="M40 54l8 10 8-10" fill="none" stroke="' + lite(shirt, .38) + '" stroke-width="1.5" stroke-linecap="round"/>');
      p.push('<rect x="56" y="74" width="7" height="2.2" rx="1.1" fill="#FBF3E4" opacity=".8"/>');
    }

    /* arms: resting at the sides, typing toward the middle, or raised */
    function arm(side, mode) {
      if (mode === 'typing') {
        var inX = side === 'l' ? 42 : 54;
        var startX = side === 'l' ? 29 : 67;
        return '<g class="fig__arm fig__arm--' + side + '">'
          + '<path d="M' + startX + ' 66c' + (side === 'l' ? -2 : 2) + ' 8 ' + (side === 'l' ? 6 : -6)
          + ' 12 ' + (side === 'l' ? 12 : -12) + ' 14" stroke="' + shirt + '" stroke-width="12.4" stroke-linecap="round" fill="none"/>'
          + '<circle cx="' + inX + '" cy="81" r="5.8" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '</g>';
      }
      if (mode === 'up') {
        return '<g class="fig__arm fig__arm--' + side + '">'
          + '<path d="M67 66c7-3 12-9 13-16" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
          + '<circle cx="80" cy="44" r="6" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '<path d="M84 41l4-4" stroke="' + skinLo + '" stroke-width="2.4" stroke-linecap="round"/>'
          + '</g>';
      }
      if (mode === 'desk' && side === 'l') {
        /* The working hand rests on the desk while the other one moves. */
        return '<g class="fig__arm fig__arm--l">'
          + '<path d="M29 65c-2 7 3 12 10 15" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
          + '<circle cx="40" cy="80.4" r="5.6" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '</g>';
      }
      if (mode === 'write') {
        /* Note-taking: the right hand comes down to the desk with a pencil. */
        return '<g class="fig__arm fig__arm--r">'
          + '<path d="M67 64c2 8-4 13-12 16" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
          + '<circle cx="54" cy="80" r="5.6" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '<g class="fig__pen" transform="rotate(-22 54 80)">'
          + '<rect x="52.6" y="65" width="3" height="13" rx="1.2" fill="#E0A03A"/>'
          + '<path d="M52.6 78l1.5 3 1.5-3z" fill="#3A2A1C"/>'
          + '<rect x="52.6" y="65" width="3" height="2.2" fill="#A85C63"/></g>'
          + '</g>';
      }
      if (mode === 'point') {
        /* Presenting at the board: the right arm reaches up and out. */
        return '<g class="fig__arm fig__arm--r">'
          + '<path d="M67 64c6-3 13-8 17-15" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
          + '<circle cx="84" cy="47" r="5.8" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '<path d="M87 44l4-3.4" stroke="' + skinLo + '" stroke-width="2.2" stroke-linecap="round"/>'
          + '</g>';
      }
      if (mode === 'present') {
        /* Open palm toward the others: a sales gesture. */
        return '<g class="fig__arm fig__arm--r">'
          + '<path d="M67 64c7 2 13 6 16 12" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
          + '<ellipse cx="84" cy="77" rx="5.6" ry="6.4" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '<path d="M86 72l3-2M87 76l4 0M86 80l3 2" stroke="' + skinLo + '" stroke-width="1.4" stroke-linecap="round"/>'
          + '</g>';
      }
      if (mode === 'talk') {
        /* Headset support: one hand up near the cheek. */
        return '<g class="fig__arm fig__arm--r">'
          + '<path d="M67 64c3 3 3 9-2 11" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
          + '<circle cx="64" cy="71" r="5.4" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
          + '</g>';
      }
      var sx = side === 'l' ? 29 : 67;
      var ex = side === 'l' ? 23 : 73;
      return '<g class="fig__arm fig__arm--' + side + '">'
        + '<path d="M' + sx + ' 64c' + (side === 'l' ? -6 : 6) + ' 5 ' + (side === 'l' ? -7 : 7) + ' 12 ' + (side === 'l' ? -6 : 6) + ' 20" stroke="' + shirt + '" stroke-width="12" stroke-linecap="round" fill="none"/>'
        + '<ellipse cx="' + ex + '" cy="88" rx="5.8" ry="6.2" fill="url(#' + gSkin + ')" stroke="' + skinLo + '" stroke-width=".7"/>'
        + '<ellipse cx="' + (ex + (side === 'l' ? 3.4 : -3.4)) + '" cy="86.6" rx="2.1" ry="2.8" fill="' + skin + '"/>'
        + '</g>';
    }
    /* armUp/typing stay for older callers; pose names the department motion. */
    var pose = opts.pose || (opts.armUp ? 'up' : (opts.typing ? 'type' : 'rest'));
    p.push(arm('l', pose === 'type' ? 'typing' : (pose === 'rest' || pose === 'up' ? 'rest' : 'desk')));
    p.push(arm('r', pose === 'type' ? 'typing' : pose));

    /* small clay props so the three appointed seats read apart at a glance */
    if (L.prop === 'pencil') {
      p.push('<g transform="rotate(22 70 34)"><rect x="66.6" y="25" width="3.4" height="14" rx="1.3" fill="#E0A03A"/>'
        + '<path d="M66.6 25l1.7-3.2 1.7 3.2z" fill="#3A2A1C"/>'
        + '<rect x="66.6" y="34.6" width="3.4" height="2.2" fill="#A85C63"/></g>');
    } else if (L.prop === 'clapper') {
      p.push('<g transform="rotate(-9 24 85)"><rect x="11" y="79" width="21" height="14" rx="2" fill="#3A2A1C"/>'
        + '<rect x="11" y="79" width="21" height="5.4" rx="2" fill="#F4E3C8"/>'
        + '<path d="M14 80l4 4M20 80l4 4M26 80l3.4 3.4" stroke="#3A2A1C" stroke-width="1.2"/></g>');
    } else if (L.prop === 'folder') {
      p.push('<g transform="rotate(-7 24 85)"><rect x="13" y="79" width="21" height="14" rx="2" fill="#C79A3C"/>'
        + '<rect x="15.4" y="77" width="17" height="4" rx="1.4" fill="#E6C98E"/>'
        + '<path d="M16.4 86h15M16.4 90h10" stroke="#8A6A47" stroke-width="1.1"/></g>');
    }

    /* head (wrapped so the whole head can nod while the body stays put) */
    var headAt = p.length;
    p.push('<ellipse cx="23" cy="42" rx="4.6" ry="5.4" fill="' + skin + '"/>');
    p.push('<ellipse cx="73" cy="42" rx="4.6" ry="5.4" fill="' + skin + '"/>');
    p.push('<path d="M23 40c0-15 11-25 25-25s25 10 25 25c0 13-11 22-25 22S23 53 23 40z" fill="url(#' + gHead + ')" stroke="' + skinLo + '" stroke-width=".7"/>');
    p.push('<path d="M28 33c3-9 11-14 20-14" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" fill="none" opacity=".28"/>');

    /* hair / hat */
    var style = L.style || 'beanie';
    var hairShape = '<path d="M22 40c0-16 12-26 26-26s26 10 26 26c0 3-1 6-2 8-2-9-6-13-9-14-5 4-24 5-30 1-4 1-8 6-9 15-1-3-2-7-2-10z" fill="' + hair + '"/>';
    if (style === 'beanie') {
      p.push('<path d="M22 34c0-15 12-25 26-25s26 10 26 25c0 2-.6 4-1 5.4-4-2-9-3-13-3-9 0-17 2-24 2-6 0-9 1-12 3-.4-1.4-2-5.4-2-7.4z" fill="' + hat + '"/>');
      p.push('<path d="M21 33.4c9-3.4 45-3.4 54 0" stroke="' + dark(hat, .12) + '" stroke-width="5.2" fill="none" stroke-linecap="round"/>');
      p.push('<path d="M21.6 31.6c9-3.2 45-3.2 53 0" stroke="' + lite(hat, .26) + '" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".6"/>');
      p.push('<path d="M35 14v10M43 11.6v12M51 11.6v12M59 13v11" stroke="' + dark(hat, .14) + '" stroke-width="1" opacity=".32"/>');
      p.push('<circle cx="48" cy="8.6" r="4.8" fill="' + lite(hat, .34) + '"/>');
    } else if (style === 'bun') {
      p.push(hairShape);
      p.push('<circle cx="48" cy="8" r="7" fill="' + hair + '"/>');
      p.push('<circle cx="46" cy="6.6" r="2.6" fill="' + lite(hair, .18) + '" opacity=".6"/>');
      p.push('<path d="M26 36c2-9 9-15 18-17" stroke="' + lite(hair, .16) + '" stroke-width="2.4" fill="none" opacity=".5"/>');
    } else if (style === 'bob') {
      p.push('<path d="M20 44c0-18 12-30 28-30s28 12 28 30c0 7-2 11-4 12-1-9-3-14-5-17-6 5-32 5-38 0-2 3-4 8-5 17-2-1-4-5-4-12z" fill="' + hair + '"/>');
      p.push('<path d="M24 38c3-11 12-18 24-18" stroke="' + lite(hair, .16) + '" stroke-width="2.2" fill="none" opacity=".45"/>');
    } else if (style === 'long') {
      p.push('<path d="M20 44c0-18 12-30 28-30s28 12 28 30c0 10-1 18-2 24-3 2-6 1-7-2 1-6 1-11 0-15-6 4-32 4-38 0-1 4-1 9 0 15-1 3-4 4-7 2-1-6-2-14-2-24z" fill="' + hair + '"/>');
      p.push('<path d="M25 36c3-10 11-17 22-18" stroke="' + lite(hair, .16) + '" stroke-width="2.2" fill="none" opacity=".45"/>');
    } else if (style === 'curl') {
      p.push('<g fill="' + hair + '"><circle cx="31" cy="26" r="9"/><circle cx="42" cy="18.5" r="9"/><circle cx="54" cy="19" r="8"/><circle cx="64" cy="27" r="8"/><circle cx="26" cy="37" r="6"/><circle cx="70" cy="37" r="6"/></g>');
      p.push('<path d="M33 22c4-5 10-7 16-7" stroke="' + lite(hair, .18) + '" stroke-width="2" fill="none" opacity=".4"/>');
    } else if (style === 'cap') {
      p.push('<path d="M23 37c0-14 11-24 25-24s25 10 25 24c0 2-.4 4-1 6-11-6-37-6-48 0-.6-2-1-4-1-6z" fill="' + hat + '"/>');
      p.push('<path d="M67 36c7 0 12 2 13 5-2 3-10 4-16 2z" fill="' + dark(hat, .16) + '"/>');
      p.push('<circle cx="48" cy="13" r="2" fill="' + lite(hat, .4) + '"/>');
      p.push('<path d="M30 24c4-6 11-9 18-9" stroke="' + lite(hat, .22) + '" stroke-width="2" fill="none" opacity=".5"/>');
    } else if (style === 'buzz') {
      p.push('<path d="M23 40c0-15 11-25 25-25s25 10 25 25c0 2-.2 4-.6 6-3-8-11-13-24-13s-21 5-24 13c-.4-2-.4-4-.4-6z" fill="' + hair + '"/>');
      p.push('<path d="M31 27c4-5 10-8 17-8" stroke="' + lite(hair, .2) + '" stroke-width="1.8" fill="none" opacity=".45"/>');
    } else {
      p.push(hairShape);
      p.push('<path d="M30 26c5-6 13-9 21-8-9 2-15 6-18 11z" fill="' + lite(hair, .18) + '"/>');
    }

    /* face */
    var eyeY = 41.5;
    p.push('<g class="fig__eyes">'
      + '<ellipse cx="38.6" cy="' + eyeY + '" rx="3.3" ry="3.9" fill="#33231A"/>'
      + '<ellipse cx="57.4" cy="' + eyeY + '" rx="3.3" ry="3.9" fill="#33231A"/>'
      + '<circle cx="37.5" cy="' + (eyeY - 1.4) + '" r="1.15" fill="#FFFFFF" opacity=".95"/>'
      + '<circle cx="56.3" cy="' + (eyeY - 1.4) + '" r="1.15" fill="#FFFFFF" opacity=".95"/>'
      + '</g>');
    p.push('<path d="M34.6 34.6c2-1.4 5-1.5 6.8-.4" stroke="' + dark(hair, .08) + '" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"/>');
    p.push('<path d="M54.6 34.2c2-1.1 5-1 6.8.4" stroke="' + dark(hair, .08) + '" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".75"/>');
    p.push('<ellipse cx="31.6" cy="49" rx="4.6" ry="2.8" fill="#DE8A63" opacity=".3"/>');
    p.push('<ellipse cx="64.4" cy="49" rx="4.6" ry="2.8" fill="#DE8A63" opacity=".3"/>');
    p.push('<path d="M47 45.4c.8 1.4.4 2.6-.6 2.8" stroke="' + skinLo + '" stroke-width="1.3" fill="none" stroke-linecap="round"/>');

    if (L.mouth === 'grin') {
      p.push('<path d="M43.6 51.4c2.8 3.4 6 3.4 8.8 0-1.4 4.6-7.4 4.6-8.8 0z" fill="#8A4432"/>');
      p.push('<path d="M45.4 51.8c1.8.9 3.4.9 5.2 0-1 1.6-4.2 1.6-5.2 0z" fill="#FFF6EC"/>');
    } else if (L.mouth === 'flat') {
      p.push('<path d="M44.6 52.6h6.8" stroke="#A25A44" stroke-width="1.7" stroke-linecap="round"/>');
    } else if (L.mouth === 'smirk') {
      p.push('<path d="M44.4 51.6c2.4 2 4.6 1.6 6.4-.6" stroke="#A25A44" stroke-width="1.7" fill="none" stroke-linecap="round"/>');
    } else {
      p.push('<path d="M43.6 50.8c2.6 3 6.2 3 8.8 0" stroke="#A25A44" stroke-width="1.8" fill="none" stroke-linecap="round"/>');
    }

    if (L.gear === 'glasses') {
      p.push('<g fill="#FFF8EC" fill-opacity=".16" stroke="#5A3E2B" stroke-width="1.6" stroke-linejoin="round">'
        + '<rect x="33" y="36.6" width="12" height="10.4" rx="4.6"/>'
        + '<rect x="51" y="36.6" width="12" height="10.4" rx="4.6"/>'
        + '<path d="M45 41.6h6" fill="none"/>'
        + '<path d="M33 40.4h-5.4" fill="none"/><path d="M63 40.4h5.4" fill="none"/></g>');
      p.push('<path d="M35.6 38.4c2-1.2 4-1.4 5.6-.8" stroke="#FFFFFF" stroke-width="1.3" opacity=".55" fill="none" stroke-linecap="round"/>');
    }
    if (L.gear === 'headset') {
      p.push('<path d="M20 40c0-13 12-22 28-22s28 9 28 22" stroke="' + dark(accent, .2) + '" stroke-width="3.4" fill="none" stroke-linecap="round"/>');
      p.push('<rect x="15.4" y="38.4" width="8" height="13" rx="3.6" fill="' + dark(accent, .12) + '"/>');
      p.push('<rect x="72.6" y="38.4" width="8" height="13" rx="3.6" fill="' + dark(accent, .12) + '"/>');
      p.push('<path d="M23 50c-.4 6 2.6 9 7.6 10" stroke="' + dark(accent, .12) + '" stroke-width="1.8" fill="none" stroke-linecap="round"/>');
      p.push('<circle cx="31.6" cy="60.4" r="2.4" fill="' + accent + '"/>');
    }

    return '<svg class="fig fig--' + pose + (opts.cls ? ' ' + opts.cls : '') + '" viewBox="0 0 96 122" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">'
      + p.slice(0, headAt).join('')
      + '<g class="fig__head">' + p.slice(headAt).join('') + '</g>'
      + '</svg>';
  }

  function chairSvg() {
    return '<svg class="fig" viewBox="0 0 96 122" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">'
      + '<ellipse cx="48" cy="116" rx="24" ry="4.6" fill="#5B3A1E" opacity=".12"/>'
      + '<path d="M23 96h50l-4 8H27z" fill="#8A6440" opacity=".5"/>'
      + '<path d="M25 98v15M71 98v15M33 100v13M63 100v13" stroke="#8A6440" stroke-width="4.4" stroke-linecap="round"/>'
      + '<ellipse cx="48" cy="94" rx="26" ry="7" fill="#C39A69" stroke="#A87A4C" stroke-width=".9"/>'
      + '<ellipse cx="48" cy="92.6" rx="23" ry="5.4" fill="#D8B384"/>'
      + '</svg>';
  }

  /* ── one department card scene ───────────────────────────────────────── */
  /* The generated clay room is the photograph; the figure, its chair, the ON
     AIR bubble and the desk glow are drawn on top, so the same room can host
     any role the user adds. */
  function scene(o) {
    var opt = o || {};
    var st = opt.state || 'standby';
    var present = !!opt.present;
    var away = opt.presence === 'away';
    var roomId = opt.roomId || 'general';
    var src = sceneFor(roomId);
    var work = workFor(roomId);
    var pose = opt.pose || work.pose;
    var fig = (present && !away)
      ? figure(opt.look || LOOKS.pm, {
        chair: true,
        pose: pose,
        chairCol: opt.chairCol || '#A87A4C',
        legs: opt.legs !== false
      })
      : '';
    return '<img class="monitor__bg" src="' + src + '" alt="" width="640" height="400" loading="lazy" decoding="async">'
      + '<span class="monitor__props monitor__props--' + work.kind + '" aria-hidden="true">' + deskProps(work.kind) + '</span>'
      + '<span class="monitor__light" aria-hidden="true"></span>'
      + '<span class="monitor__figure' + (present ? '' : ' is-empty') + '" aria-hidden="true">'
      + (present && !away ? fig : (away ? chairSvg() : '')) + '</span>'
      + '<span class="monitor__shade" aria-hidden="true"></span>';
  }

  root.TeamRoomArt = {
    ROOM_ART: ROOM_ART,
    MEETING_ART: MEETING_ART,
    ROOM_ACCENT: ROOM_ACCENT,
    LOOKS: LOOKS,
    DEPT_WORK: DEPT_WORK,
    WORK_KINDS: WORK_KINDS,
    deptAccent: deptAccent,
    sceneFor: sceneFor,
    lookFor: lookFor,
    workFor: workFor,
    deskProps: deskProps,
    figure: figure,
    chair: chairSvg,
    scene: scene,
    mix: mix,
    dark: dark,
    lite: lite
  };
  if (typeof module === 'object' && module.exports) module.exports = root.TeamRoomArt;
})(typeof globalThis !== 'undefined' ? globalThis : this);
