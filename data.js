/* ============================================================================
 * OneTap AI Team Room · data.js
 * Catalogs only: rooms, role archetypes, sample agendas, domain vocabulary.
 * All sample companies and numbers are fictional. No real people or client data.
 * Loads as a global (browser) or a CommonJS module (node test runner).
 * ==========================================================================*/
(function (root) {
  'use strict';

  /* Eight base departments. Custom departments are stored in the browser and
     added to this list at run time. */
  var ROOMS = [
    {
      id: 'general',
      glyph: 'G',
      name: { ko: '전체 회의', en: 'All-hands' },
      short: { ko: '전체', en: 'All' },
      desc: {
        ko: '부서를 넘는 결정을 여덟 역할이 한 번씩 봅니다.',
        en: 'A decision that crosses departments, seen by all eight seats.'
      }
    },
    {
      id: 'plan',
      glyph: 'P',
      name: { ko: '기획 회의', en: 'Planning room' },
      short: { ko: '기획', en: 'Plan' },
      desc: {
        ko: '로드맵, 우선순위, 요구사항을 다룹니다.',
        en: 'Roadmap, priority and requirements.'
      }
    },
    {
      id: 'dev',
      glyph: 'D',
      name: { ko: '개발 회의', en: 'Dev room' },
      short: { ko: '개발', en: 'Dev' },
      desc: {
        ko: '아키텍처, API, QA, 배포와 장애 대응을 다룹니다.',
        en: 'Architecture, API, QA, deploys and incidents.'
      }
    },
    {
      id: 'design',
      glyph: 'Ds',
      name: { ko: '디자인 회의', en: 'Design room' },
      short: { ko: '디자인', en: 'Design' },
      desc: {
        ko: '화면, 브랜드, 사용성과 시안 검토를 다룹니다.',
        en: 'Screens, brand, usability and design review.'
      }
    },
    {
      id: 'video',
      glyph: 'V',
      name: { ko: '영상 회의', en: 'Video room' },
      short: { ko: '영상', en: 'Video' },
      desc: {
        ko: '기획, 촬영, 편집과 배포 채널을 다룹니다.',
        en: 'Concept, shoot, edit and distribution.'
      }
    },
    {
      id: 'marketing',
      glyph: 'M',
      name: { ko: '마케팅·홍보 회의', en: 'Marketing room' },
      short: { ko: '마케팅', en: 'Marketing' },
      desc: {
        ko: '채널, 메시지, 전환과 예산 배분을 다룹니다.',
        en: 'Channels, message, conversion and spend.'
      }
    },
    {
      id: 'sales',
      glyph: 'S',
      name: { ko: '영업·제휴 회의', en: 'Sales & partner room' },
      short: { ko: '영업', en: 'Sales' },
      desc: {
        ko: '파이프라인, 제안서, 단가와 제휴를 다룹니다.',
        en: 'Pipeline, proposals, pricing and partners.'
      }
    },
    {
      id: 'ops',
      glyph: 'O',
      name: { ko: '운영·CS 회의', en: 'Ops & support room' },
      short: { ko: '운영', en: 'Ops' },
      desc: {
        ko: '도구, 프로세스, 환불, 재고와 CS 문의를 다룹니다.',
        en: 'Tools, process, refunds, inventory and support.'
      }
    }
  ];

  /* The three Pro providers, in the order the connection panel lists them.
     A key for each is optional: a seat whose provider has no key falls back to
     a provider that does, and the message card says which one answered. GPT and
     Claude can also run as a web subscription bridge (no API key): the seat's
     question is copied to chatgpt.com / claude.ai and the answer is pasted back.
     Gemini's free default is the lite flash model (15 RPM · 500 RPD). */
  var PROVIDERS = {
    openai: {
      id: 'openai', label: 'OpenAI', mark: 'GPT', keyHint: 'sk-…', model: 'gpt-4o-mini',
      bridge: { site: 'ChatGPT', url: 'https://chatgpt.com' }
    },
    gemini: { id: 'gemini', label: 'Google Gemini', mark: 'Gemini', keyHint: 'AIza…', model: 'gemini-3.5-flash-lite' },
    claude: {
      id: 'claude', label: 'Anthropic Claude', mark: 'Claude', keyHint: 'sk-ant-…', model: 'claude-sonnet-4-20250514',
      bridge: { site: 'Claude', url: 'https://claude.ai' }
    }
  };
  var PROVIDER_ORDER = ['openai', 'gemini', 'claude'];
  var BRIDGE_ORDER = PROVIDER_ORDER.filter(function (id) { return !!PROVIDERS[id].bridge; });

  /* The model each role is appointed to in Pro mode. One key is still enough to
     run a round: a seat whose provider has no key answers from a connected one
     and the card marks the fallback. */
  var MODELS = {
    gpt: { id: 'gpt', label: 'GPT', provider: 'openai', model: PROVIDERS.openai.model },
    gemini: { id: 'gemini', label: 'Gemini', provider: 'gemini', model: PROVIDERS.gemini.model },
    claude: { id: 'claude', label: 'Claude', provider: 'claude', model: PROVIDERS.claude.model }
  };

  /* kind = which reasoning engine the role uses; name is only a label.
     Order is the speaking order: plan → build → design → video → growth →
     sales → finance, with the cross-audit reading every answer last. */
  var ROLE_ARCHETYPES = [
    {
      kind: 'pm',
      tag: 'PM',
      glyph: 'P',
      accent: '#b45309',
      model: 'gemini',
      name: { ko: '기획 리드', en: 'Product Lead' },
      focus: {
        ko: '범위와 일정, 성공 지표 하나',
        en: 'Scope, dates and one success metric'
      },
      tone: {
        ko: '범위를 먼저 좁히고 결정 하나로 말합니다.',
        en: 'Narrows the scope first and speaks in one decision.'
      }
    },
    {
      kind: 'dev',
      tag: 'DEV',
      glyph: 'D',
      accent: '#4f7057',
      model: 'claude',
      name: { ko: '개발 리드', en: 'Tech Lead' },
      focus: {
        ko: '아키텍처, API 계약, 배포와 품질',
        en: 'Architecture, API contract, deploys and quality'
      },
      tone: {
        ko: '계약과 롤백 경로를 먼저 적습니다.',
        en: 'Writes the contract and the rollback path first.'
      }
    },
    {
      kind: 'design',
      tag: 'DESIGN',
      glyph: 'Ds',
      accent: '#a85c63',
      model: 'gpt',
      appointed: true,
      name: { ko: '디자인 리드', en: 'Design Lead' },
      focus: {
        ko: '화면 구조, 시각 위계, 브랜드 일관성',
        en: 'Layout, visual hierarchy and brand consistency'
      },
      tone: {
        ko: '취향 대신 순서와 기준으로 말합니다.',
        en: 'Talks in order and criteria, not taste.'
      }
    },
    {
      kind: 'video',
      tag: 'VIDEO',
      glyph: 'V',
      accent: '#8a5a6b',
      model: 'gemini',
      appointed: true,
      name: { ko: '영상 PD', en: 'Video PD' },
      focus: {
        ko: '숏폼 구성, 장면 전환, 첫 5초',
        en: 'Short-form structure, cuts and the first five seconds'
      },
      tone: {
        ko: '한 편을 끝내는 일정으로 말합니다.',
        en: 'Speaks in one finished cut, not a shoot list.'
      }
    },
    {
      kind: 'growth',
      tag: 'GROWTH',
      glyph: 'G',
      accent: '#96690d',
      model: 'gpt',
      name: { ko: '그로스 리드', en: 'Growth Lead' },
      focus: {
        ko: '채널, 메시지, 전환 측정',
        en: 'Channel, message and conversion'
      },
      tone: {
        ko: '한 채널에서 먼저 검증합니다.',
        en: 'Proves it in one channel first.'
      }
    },
    {
      kind: 'sales',
      tag: 'SALES',
      glyph: 'S',
      accent: '#a8492a',
      model: 'claude',
      appointed: true,
      name: { ko: '영업 리드', en: 'Sales Lead' },
      focus: {
        ko: '고객 제안, 계약 논리, 반론 대응',
        en: 'Proposals, contract logic and objections'
      },
      tone: {
        ko: '이미 문의한 고객의 다음 단계부터 말합니다.',
        en: 'Starts from the next step of a customer who already asked.'
      }
    },
    {
      kind: 'cfo',
      tag: 'CFO',
      glyph: 'C',
      accent: '#8a5a4a',
      model: 'claude',
      name: { ko: '재무·법률', en: 'Finance & Legal' },
      focus: {
        ko: '예산, 회수 구조, 약관과 개인정보',
        en: 'Budget, payback, terms and privacy'
      },
      tone: {
        ko: '상한과 회수 기간을 숫자로 말합니다.',
        en: 'Speaks in caps and payback periods.'
      }
    },
    {
      kind: 'auditor',
      tag: 'AUDITOR',
      glyph: 'A',
      accent: '#7a5a7e',
      model: 'gemini',
      name: { ko: '교차검수', en: 'Cross-audit' },
      focus: {
        ko: '앞선 답변의 숫자·출처·책임',
        en: 'Numbers, sources and owners in the answers above'
      },
      tone: {
        ko: '인용하고 다시 계산해 조건을 답니다.',
        en: 'Quotes, recomputes and attaches conditions.'
      }
    }
  ];

  var FOCUS_OPTIONS = ['pm', 'dev', 'design', 'video', 'growth', 'sales', 'cfo', 'auditor'];

  /* Which department monitor lights up when a role takes the floor. Keys are
     role kinds, values are room ids from ROOMS above. A role the user adds
     inherits the kind it reasons with, so it lights the same monitor. */
  var ROLE_ROOM = {
    pm: 'plan',
    dev: 'dev',
    design: 'design',
    video: 'video',
    growth: 'marketing',
    sales: 'sales',
    cfo: 'ops',
    auditor: 'general'
  };

  /* 3 one-click agendas per room, both languages. Fictional companies only.
     English amounts are in USD; Korean amounts in KRW. */
  var SAMPLES = {
    ko: {
      general: [
        '3인 팀이 다음 달 새 기능을 낼지, 지금 고객 유지에 집중할지 정해야 합니다. 이번 주 안에 결론이 필요합니다.',
        '월 300만원 예산으로 4주 안에 신규 고객 100명을 만들 수 있을지 검토해 주세요.',
        '회의가 길어지고 결정이 안 됩니다. 주 1회 30분으로 줄이고 결정 로그를 남기려 합니다.'
      ],
      plan: [
        '다음 분기 로드맵에 신규 기능 3개와 안정화 작업 중 무엇을 먼저 넣을지 정해야 합니다. 개발 인력은 2명입니다.',
        '고객 요청이 47건 쌓였습니다. 이번 달 안에 처리할 상위 5개를 고르는 기준을 만들고 싶습니다.',
        '기획서 없이 개발이 먼저 시작되는 일이 반복됩니다. 착수 전에 반드시 확인할 항목 3개를 정하려 합니다.'
      ],
      dev: [
        '다음 스프린트에 결제 모듈 리팩터링과 신규 대시보드 중 하나만 할 수 있습니다. 어느 쪽을 먼저 할까요?',
        '배포 후 간헐적 500 오류가 주 3회 발생합니다. 원인 조사와 기능 개발을 어떻게 나눌까요?',
        '외주 개발자 2명과 협업 규칙(브랜치·리뷰·릴리스)을 정하려 합니다. 기준을 만들어 주세요.'
      ],
      design: [
        '가입 화면 시안 A와 B 중 하나를 골라야 합니다. 전환율은 아직 없고, 사용성 테스트는 5명만 했습니다.',
        '브랜드 색을 바꾸려 합니다. 로고·버튼·차트까지 손대야 해서 범위를 먼저 정해야 합니다.',
        '디자인 리뷰가 취향 싸움이 됩니다. 판단 기준 3개를 문서로 정하고 싶습니다.'
      ],
      video: [
        '제품 소개 영상 60초를 2주 안에 만들어야 합니다. 촬영과 편집 중 어디에 예산을 먼저 쓸까요?',
        '유튜브와 숏폼 중 어디에 먼저 올릴지 정해야 합니다. 같은 영상을 두 곳에 쓰려 합니다.',
        '영상 3편을 만들었는데 조회가 200회에서 멈춥니다. 첫 5초와 썸네일 중 무엇부터 고칠까요?'
      ],
      marketing: [
        '신규 구독 앱의 첫 달 광고 예산 300만원을 검색·숏폼·커뮤니티 중 어디에 먼저 쓸까요?',
        '무료 체험 전환율이 2%에서 6개월째 그대로입니다. 랜딩과 온보딩 중 어디부터 손볼까요?',
        'B2B 리드 100건을 4주에 모아야 합니다. 콘텐츠와 아웃바운드 중 무엇을 먼저 할까요?'
      ],
      sales: [
        '이번 달 견적 12건 중 3건만 계약으로 이어졌습니다. 단가를 낮출지 제안서를 고칠지 정해야 합니다.',
        '파트너사 3곳에서 제휴 문의가 왔습니다. 어디부터 미팅을 잡을지 우선순위를 정해 주세요.',
        '영업 담당 1명이 파이프라인 40건을 혼자 관리합니다. 단계별 기준을 줄여야 할 것 같습니다.'
      ],
      ops: [
        '월 구독 도구가 14개로 늘었습니다. 3개월 안에 8개로 줄이려면 어떤 기준이 필요할까요?',
        '환불 요청이 주 20건으로 늘었습니다. 정책을 바꿀지, 안내를 고칠지 정해야 합니다.',
        '재고 회전이 45일입니다. 30일로 줄이려면 발주 주기와 할인 중 무엇부터 손대야 할까요?'
      ]
    },
    en: {
      general: [
        'A three-person team must decide whether to ship the new feature next month or focus on keeping current customers. The call is due this week.',
        'Can we win 100 new customers in 4 weeks with a budget of $2,200?',
        'Meetings run long and decisions stall. We want a 30-minute weekly meeting with a decision log.'
      ],
      plan: [
        "Next quarter's roadmap has room for three new features or a stabilization pass. We have two engineers. What goes in first?",
        'Forty-seven customer requests are open. I want a rule for picking the top five this month.',
        'Development keeps starting before the spec exists. We need three checks before a build starts.'
      ],
      dev: [
        'Next sprint we can refactor the billing module or build the new dashboard, not both. Which comes first?',
        'We see intermittent 500 errors three times a week after deploys. How should we split investigation and feature work?',
        'We need working rules for two contract developers: branches, review and release.'
      ],
      design: [
        'We must choose between sign-up designs A and B. No conversion data yet, and only five people tested it.',
        'We want to change the brand color. It touches the logo, buttons and charts, so the scope comes first.',
        'Design review turns into a taste argument. I want three written criteria.'
      ],
      video: [
        'We need a 60-second product video in two weeks. Does the budget go to shooting or editing first?',
        'YouTube or short video first? We want to reuse the same cut in both.',
        'Three videos stall at 200 views. Do we fix the first five seconds or the thumbnail?'
      ],
      marketing: [
        'Where should a new subscription app spend its first $2,200: search ads, short video, or communities?',
        'Free-trial conversion has sat at 2% for six months. Do we fix the landing page or onboarding first?',
        'We need 100 B2B leads in 4 weeks. Content or outbound first?'
      ],
      sales: [
        'Only three of twelve quotes this month became contracts. Do we cut the price or rewrite the proposal?',
        'Three partners asked about a partnership. Which meeting do we take first?',
        'One rep manages forty open deals. We need fewer pipeline stages.'
      ],
      ops: [
        'We now pay for 14 monthly tools and want to reach 8 within three months. What is the cut rule?',
        'Refund requests rose to 20 a week. Do we change the policy or rewrite the notice?',
        'Inventory turns in 45 days and we want 30. Order cadence or discounting first?'
      ]
    }
  };

  /* Agendas for departments a user adds. {name} is replaced with the name the
     user typed, so a new department still opens with three usable agendas. */
  var CUSTOM_SAMPLES = {
    ko: [
      '{name} 부서에서 이번 달에 먼저 끝낼 일 3가지를 정해야 합니다. 인력은 한 명입니다.',
      '{name} 관련 요청이 쌓였습니다. 이번 주 안에 처리할 상위 5개를 고르는 기준을 정해 주세요.',
      '{name} 업무가 한 사람에게 몰립니다. 나눌 기준과 순서를 정하려 합니다.'
    ],
    en: [
      'The {name} department must pick three things to finish this month. One person is available.',
      'Requests for {name} are piling up. Set a rule for the top five to handle this week.',
      'All {name} work lands on one person. We need a split and an order.'
    ]
  };

  /* Domain vocabulary drives the free engine. Every entry is language-neutral
     in keys and carries both phrasings. */
  var DOMAINS = {
    launch: {
      keys: ['출시', '런칭', '베타', '공개', '릴리스', 'launch', 'release', 'beta', 'ship', 'rollout'],
      ko: { label: '출시', noun: '출시', decision: '출시 범위와 날짜', metric: '첫 주 활성 사용자', risk: '되돌리기 어려운 공개', move: '작은 그룹에 먼저 여는 것', channel: '대기 명단과 기존 사용자', hook: '먼저 써 본 20명의 후기와 함께 여는 첫 주' },
      en: { label: 'launch', noun: 'the launch', decision: 'scope and launch date', metric: 'week-one active users', risk: 'a public release you cannot take back', move: 'opening it to a small group first', channel: 'the waitlist and current users', hook: 'one week open, with notes from the first 20 users' }
    },
    pricing: {
      keys: ['가격', '요금', '인상', '할인', '플랜', 'pricing', 'price', 'discount', 'tier'],
      ko: { label: '가격', noun: '가격 변경', decision: '바꿀 폭과 적용 시점', metric: '유지된 결제 고객 수', risk: '기존 고객 이탈', move: '신규 고객에게만 먼저 적용하는 것', channel: '기존 결제 고객', hook: '지금 가격으로 남은 마지막 한 달' },
      en: { label: 'pricing', noun: 'the price change', decision: 'the size and the effective date', metric: 'paying customers retained', risk: 'churn among existing customers', move: 'applying it to new customers first', channel: 'existing paying customers', hook: 'the last month at today\u2019s price' }
    },
    growth: {
      keys: ['광고', '전환', '유입', '마케팅', '캠페인', '리드', '숏폼', '검색', '도달', '신규 고객', '체험', 'ads', 'ad ', 'campaign', 'conversion', 'traffic', 'funnel', 'lead', 'acquisition', 'new customer', 'search', 'spend', 'communit', 'trial'],
      ko: { label: '성장', noun: '유입 확대', decision: '예산을 넣을 채널 순서', metric: '채널별 전환 건수', risk: '전환 없이 예산만 타는 것', move: '한 채널에서 문구를 먼저 검증하는 것', channel: '가장 반응이 좋았던 채널', hook: '처음 10분 안에 결과가 보이는 방법' },
      en: { label: 'growth', noun: 'the acquisition push', decision: 'which channel gets the budget first', metric: 'conversions per channel', risk: 'burning budget with no conversion', move: 'proving the message in one channel first', channel: 'the channel that answered best so far', hook: 'a first result within ten minutes' }
    },
    retention: {
      keys: ['이탈', '리텐션', '재구매', '유지', '해지', 'churn', 'retention', 'renew', 'cancel', 'repeat'],
      ko: { label: '유지', noun: '유지 개선', decision: '먼저 고칠 이탈 구간', metric: '30일 잔존율', risk: '원인 없이 할인부터 주는 것', move: '이탈 직전 사용자 20명을 보는 것', channel: '해지 직전 사용자', hook: '해지 전에 한 번 더 묻는 이유' },
      en: { label: 'retention', noun: 'the retention fix', decision: 'which drop-off to fix first', metric: '30-day retention', risk: 'discounting before finding the cause', move: 'reading 20 near-churn accounts first', channel: 'accounts about to cancel', hook: 'one question before the cancel button' }
    },
    hiring: {
      keys: ['채용', '온보딩', '면접', '인사', '채용', 'hire', 'hiring', 'recruit', 'onboarding', 'candidate'],
      ko: { label: '채용', noun: '채용', decision: '먼저 뽑을 역할과 시작 시점', metric: '온보딩 4주 내 첫 결과물', risk: '뽑고도 일이 안 늘어나는 것', move: '한 역할을 끝까지 채우는 것', channel: '채용 공고와 지인 추천', hook: '첫 4주에 무엇을 맡는지 적은 공고' },
      en: { label: 'hiring', noun: 'the hire', decision: 'which role first and when', metric: 'a first shipped result within four weeks', risk: 'adding headcount without adding output', move: 'closing one role before opening the next', channel: 'the job post and referrals', hook: 'a post that names the first four weeks' }
    },
    infra: {
      keys: ['서버', '장애', '배포', '인프라', '오류', 'sla', 'latency', 'incident', 'outage', 'deploy', 'error', 'server', 'downtime'],
      ko: { label: '인프라', noun: '안정화 작업', decision: '조사 범위와 배포 창', metric: '주간 오류 건수', risk: '원인 모른 채 재배포하는 것', move: '로그와 재현 조건을 먼저 모으는 것', channel: '상태 페이지와 지원 채널', hook: '같은 오류가 다시 나지 않게 하는 세 가지' },
      en: { label: 'infrastructure', noun: 'the reliability work', decision: 'investigation scope and deploy window', metric: 'errors per week', risk: 'redeploying without a known cause', move: 'collecting logs and a reproduction first', channel: 'the status page and support inbox', hook: 'three changes so the same error stops repeating' }
    },
    security: {
      keys: ['보안', '개인정보', '유출', '권한', '인증', '결제', '계약', '법무', 'privacy', 'security', 'gdpr', 'consent', 'access', 'permission', 'compliance'],
      ko: { label: '보안·법무', noun: '보안 정리', decision: '권한 범위와 공지 시점', metric: '권한 예외 건수', risk: '사고 후에 고치는 것', move: '접근 권한을 먼저 줄이는 것', channel: '고객 공지와 내부 공지', hook: '무엇을 수집하고 언제 지우는지 한 장으로' },
      en: { label: 'security and legal', noun: 'the security cleanup', decision: 'access scope and when to notify', metric: 'open access exceptions', risk: 'fixing it after an incident', move: 'cutting access first', channel: 'customer and internal notices', hook: 'one page on what you collect and when you delete it' }
    },
    finance: {
      keys: ['예산', '매출', '투자', '원가', '마진', '비용', 'budget', 'revenue', 'margin', 'cost', 'funding', 'profit'],
      ko: { label: '재무', noun: '예산 집행', decision: '상한과 승인 기준', metric: '회수 기간', risk: '현금이 먼저 마르는 것', move: '작은 금액으로 먼저 집행하는 것', channel: '기존 고객과 재구매', hook: '이번 분기 안에 회수되는 지출만' },
      en: { label: 'finance', noun: 'the spend', decision: 'the cap and approval rule', metric: 'payback period', risk: 'cash running out before revenue', move: 'releasing a small amount first', channel: 'existing and returning customers', hook: 'only spend that pays back this quarter' }
    },
    ops: {
      keys: ['재고', '물류', '운영', '환불', '발주', 'cs', '도구', 'inventory', 'supplier', 'refund', 'process', 'tool', 'vendor'],
      ko: { label: '운영', noun: '운영 정리', decision: '바꿀 순서와 기준', metric: '주간 처리 건수', risk: '일이 사람에게만 쌓이는 것', move: '가장 자주 반복되는 일부터 줄이는 것', channel: 'CS 응대 기록', hook: '반복 문의를 3개로 줄이는 안내문' },
      en: { label: 'operations', noun: 'the process cleanup', decision: 'what changes first and by what rule', metric: 'cases handled per week', risk: 'work piling onto one person', move: 'removing the most repeated step first', channel: 'the support log', hook: 'a notice that kills three repeat questions' }
    },
    content: {
      keys: ['콘텐츠', '블로그', '영상', '뉴스레터', '발행', 'content', 'newsletter', 'video', 'blog', 'publish'],
      ko: { label: '콘텐츠', noun: '콘텐츠 발행', decision: '주제와 발행 주기', metric: '구독 전환 수', risk: '양만 늘고 읽히지 않는 것', move: '한 주제로 3편을 먼저 쓰는 것', channel: '뉴스레터와 검색 유입', hook: '한 주제로 3편, 같은 독자가 다시 오는 구성' },
      en: { label: 'content', noun: 'the publishing plan', decision: 'topic and cadence', metric: 'subscriber conversions', risk: 'more posts, fewer readers', move: 'three pieces on one topic first', channel: 'the newsletter and search', hook: 'three pieces, one topic, the same reader coming back' }
    },
    planning: {
      keys: ['기획', '로드맵', '요구사항', '기획서', 'roadmap', 'priorit', 'requirement', 'backlog', 'spec '],
      ko: { label: '기획', noun: '이번 분기 계획', decision: '먼저 넣을 항목과 순서', metric: '기한 안에 끝난 항목 수', risk: '우선순위 없이 전부 착수하는 것', move: '상위 3개만 남기고 나머지를 보류하는 것', channel: '현장 요청과 반복 문의', hook: '이번 분기에 끝나는 3개만 적은 로드맵' },
      en: { label: 'planning', noun: 'the quarter plan', decision: 'what goes in first and in what order', metric: 'items finished by the date', risk: 'starting everything with no priority', move: 'keeping the top three and parking the rest', channel: 'field requests and repeat questions', hook: 'a roadmap with only the three that finish this quarter' }
    },
    design: {
      keys: ['디자인', '시안', '로고', '브랜드', '타이포', '와이어프레임', '사용성', 'design', 'logo', 'brand', 'wireframe', 'typography', 'usability'],
      ko: { label: '디자인', noun: '디자인 결정', decision: '어느 시안으로 갈지와 검증 방법', metric: '과업 완료율', risk: '취향으로 고르고 나중에 다시 바꾸는 것', move: '실제 사용자 5명에게 같은 과업을 시켜 보는 것', channel: '사용성 테스트와 지원 문의', hook: '같은 과업을 5명이 끝내는지 보는 30분' },
      en: { label: 'design', noun: 'the design call', decision: 'which direction and how to test it', metric: 'task completion rate', risk: 'picking by taste and redoing it later', move: 'running the same task with five real users', channel: 'usability tests and support questions', hook: 'thirty minutes watching five people finish one task' }
    },
    video: {
      keys: ['영상', '촬영', '편집', '유튜브', '자막', '썸네일', 'video', 'youtube', 'shoot', 'edit ', 'thumbnail', 'reels', 'footage'],
      ko: { label: '영상', noun: '영상 제작', decision: '무엇을 먼저 찍고 어디에 올릴지', metric: '끝까지 본 비율', risk: '한 편에 다 쓰고 다시 쓸 소재가 없는 것', move: '한 편을 끝내고 첫 5초를 먼저 고치는 것', channel: '유튜브와 숏폼', hook: '첫 5초에 결론이 나오는 60초' },
      en: { label: 'video', noun: 'the video', decision: 'what to shoot first and where it goes', metric: 'completion rate', risk: 'spending it all on one cut with no reusable footage', move: 'finishing one cut and fixing the first five seconds first', channel: 'YouTube and short video', hook: 'sixty seconds where the point lands in the first five' }
    },
    sales: {
      keys: ['영업', '제안서', '견적', '파트너', '제휴', '파이프라인', '단가', 'sales', 'partner', 'quote', 'pipeline', 'proposal', 'deal', 'discount limit'],
      ko: { label: '영업', noun: '영업 진행', decision: '어느 건부터 밀지와 할인 한도', metric: '계약 전환 건수', risk: '할인으로만 이기는 것', move: '이미 문의가 온 건부터 순서를 정하는 것', channel: '기존 문의와 소개', hook: '다음 단계가 적힌 제안서 한 장' },
      en: { label: 'sales', noun: 'the sales push', decision: 'which deal first and how much discount', metric: 'deals closed', risk: 'winning only on discount', move: 'ordering the deals that already asked', channel: 'inbound inquiries and referrals', hook: 'a one-page proposal that names the next step' }
    },
    general: {
      keys: [],
      ko: { label: '일반', noun: '이번 안건', decision: '이번 주에 실제로 할 일 세 가지', metric: '끝난 일 수', risk: '결정 없이 회의만 반복하는 것', move: '가장 작은 실행 하나를 오늘 끝내는 것', channel: '지금 반응이 있는 곳', hook: '이번 주에 끝나는 것만 남긴 목록' },
      en: { label: 'general', noun: 'this agenda', decision: 'the three things that get done this week', metric: 'items finished', risk: 'another meeting with no decision', move: 'finishing one small action today', channel: 'wherever you already get a response', hook: 'a list with only what can finish this week' }
    }
  };

  /* Room-specific one-liners injected into the free engine. */
  var ROOM_MODS = {
    general: {
      pm: { ko: '부서마다 흩어진 결정을 한 장에 모아', en: 'collecting the decisions from every department into one page' },
      dev: { ko: '서로 다른 시스템의 연결 지점을 확인해서', en: 'checking where the systems meet' },
      design: { ko: '한 화면에서 눈이 머무는 순서를 정해서', en: 'fixing the order the eye travels across one screen' },
      video: { ko: '첫 5초에 결론이 보이는 한 편으로', en: 'one cut whose point lands in five seconds' },
      growth: { ko: '지금 반응이 오는 채널 하나만', en: 'starting with one channel that already answers' },
      sales: { ko: '이미 문의가 온 고객부터', en: 'starting with the customers who already asked' },
      cfo: { ko: '이번 달에 나가는 돈만', en: 'only money leaving this month' },
      auditor: { ko: '누가 언제 한다는 말이 빠졌는지', en: 'whether anyone said who does it and when' }
    },
    plan: {
      pm: { ko: '로드맵 순서를 먼저 고정해서', en: 'fixing the roadmap order first' },
      dev: { ko: '기술적으로 걸리는 지점을 먼저 표시해서', en: 'marking the technical blockers first' },
      design: { ko: '이번 분기 화면 한 개로 좁혀서', en: 'narrowing it to one screen this quarter' },
      video: { ko: '영상 한 편을 일정에 먼저 넣어서', en: 'putting one finished video on the calendar first' },
      growth: { ko: '이미 반복되는 요청부터 모아서', en: 'starting with the requests that already repeat' },
      sales: { ko: '고객이 물어본 순서대로 우선순위를 잡아', en: 'ordering it by what customers already asked' },
      cfo: { ko: '이번 분기 사람 시간을 비용으로 넣어', en: 'counting people\u2019s hours as cost' },
      auditor: { ko: '일정과 담당이 같이 적혔는지', en: 'whether the date and owner are written together' }
    },
    dev: {
      pm: { ko: '스프린트 단위로 쪼개서', en: 'cutting it into sprint-sized pieces' },
      dev: { ko: 'API 계약과 롤백 경로를 먼저', en: 'pinning the API contract and a rollback path first' },
      design: { ko: '빈 화면과 오류 화면까지 같이 그려서', en: 'drawing empty and error states too' },
      video: { ko: '녹화와 편집을 자동화할 수 있는지 보고', en: 'checking what can be recorded and cut automatically' },
      growth: { ko: '개발자 커뮤니티 반응부터', en: 'starting with developer communities' },
      sales: { ko: '데모 환경이 바로 열리는지 확인해서', en: 'confirming the demo environment opens' },
      cfo: { ko: '서버와 도구 비용까지 넣어', en: 'counting server and tool cost' },
      auditor: { ko: '롤백 경로와 오류 로그가 있는지', en: 'whether a rollback path and error logs exist' }
    },
    design: {
      pm: { ko: '범위를 한 화면으로 좁혀서', en: 'narrowing it to one screen' },
      dev: { ko: '구현 비용이 큰 요소를 표시해서', en: 'flagging what is expensive to build' },
      design: { ko: '시안 두 개를 같은 과업으로 비교해서', en: 'comparing two directions on the same task' },
      video: { ko: '움직임을 먼저 15초로 확인해서', en: 'checking the motion in a 15-second pass first' },
      growth: { ko: '실제 사용자 5명의 반응부터', en: 'starting from five real users' },
      sales: { ko: '화면이 고객에게 무엇을 약속하는지', en: 'what the screen promises the customer' },
      cfo: { ko: '시안 제작 시간과 도구 비용을 넣어', en: 'counting design hours and tool cost' },
      auditor: { ko: '판단 기준이 취향이 아닌지', en: 'whether the criteria are taste or evidence' }
    },
    video: {
      pm: { ko: '한 편을 끝내는 일정으로 끊어서', en: 'cutting it to one finished video' },
      dev: { ko: '업로드와 자막 자동화가 되는지', en: 'whether upload and captions can be automated' },
      design: { ko: '썸네일과 자막의 시각 위계를', en: 'the hierarchy of the thumbnail and captions' },
      video: { ko: '한 편을 끝까지 만들고 다음 편을', en: 'finishing one cut before the next' },
      growth: { ko: '첫 5초와 썸네일부터', en: 'starting with the first five seconds and the thumbnail' },
      sales: { ko: '이 영상이 어떤 고객을 부르는지', en: 'which customer the video calls in' },
      cfo: { ko: '촬영·편집 외주비를 나눠서', en: 'splitting shoot and edit cost' },
      auditor: { ko: '다시 쓸 수 있는 소재가 남는지', en: 'whether reusable footage is left over' }
    },
    marketing: {
      pm: { ko: '캠페인을 2주 단위로 끊어', en: 'cutting the campaign into two-week blocks' },
      dev: { ko: '측정 이벤트가 실제로 찍히는지', en: 'whether the tracking events actually fire' },
      design: { ko: '랜딩 한 화면의 시선 순서를', en: 'the reading order of one landing screen' },
      video: { ko: '같은 소재로 숏폼 세 편을', en: 'three short cuts from the same footage' },
      growth: { ko: '랜딩 문구와 채널 단가를 같이', en: 'pairing landing copy with channel cost' },
      sales: { ko: '문의가 계약으로 이어지는 문장을', en: 'the line that turns an inquiry into a deal' },
      cfo: { ko: '광고비와 제작비를 나눠서', en: 'separating media spend from production cost' },
      auditor: { ko: '전환율의 기준값과 측정 창을', en: 'the baseline and window behind the conversion rate' }
    },
    sales: {
      pm: { ko: '파이프라인 단계를 줄여서', en: 'cutting the pipeline stages' },
      dev: { ko: '데모 환경이 바로 열리는지', en: 'whether a demo environment is ready' },
      design: { ko: '제안서 한 장의 위계를', en: 'the hierarchy of a one-page proposal' },
      video: { ko: '고객 사례 60초를', en: 'a 60-second customer story' },
      growth: { ko: '이미 문의가 온 곳부터', en: 'starting where inquiries already come in' },
      sales: { ko: '반론 세 개를 먼저 정리해서', en: 'writing down the three objections first' },
      cfo: { ko: '단가와 할인 한도를 같이', en: 'pairing price with a discount limit' },
      auditor: { ko: '누가 언제 후속 연락하는지', en: 'who follows up and when' }
    },
    ops: {
      pm: { ko: '프로세스 변경을 한 번에 하나씩', en: 'changing one process at a time' },
      dev: { ko: '도구 연동과 권한 설정을 확인해서', en: 'checking tool integrations and permissions' },
      design: { ko: '안내 화면과 빈 상태를', en: 'the notice screen and the empty states' },
      video: { ko: '환불·교환 안내를 30초로', en: 'a 30-second refund and exchange clip' },
      growth: { ko: '기존 고객의 재구매 신호를', en: 'checking repeat-purchase signals from current customers' },
      sales: { ko: '재구매 문의를 제안으로', en: 'turning repeat inquiries into proposals' },
      cfo: { ko: '도구 구독과 환불 비용을', en: 'tool subscriptions and refund cost' },
      auditor: { ko: '예외 처리와 책임자가 정해졌는지', en: 'whether exceptions and owners are defined' }
    }
  };

  function fill(template, name) {
    return String(template).replace(/\{name\}/g, name);
  }

  /* Sample agendas for any room id. A room the user added has no catalog entry,
     so it gets three templates with its own name in them. */
  function samplesFor(roomId, lang, roomName) {
    var l = lang === 'en' ? 'en' : 'ko';
    var list = (SAMPLES[l] || SAMPLES.ko)[roomId];
    if (list && list.length) return list.slice();
    var name = String(roomName || (l === 'en' ? 'this department' : '이 부서'));
    return (CUSTOM_SAMPLES[l] || CUSTOM_SAMPLES.ko).map(function (s) { return fill(s, name); });
  }

  var Data = {
    ROOMS: ROOMS,
    ROLE_ARCHETYPES: ROLE_ARCHETYPES,
    MODELS: MODELS,
    PROVIDERS: PROVIDERS,
    PROVIDER_ORDER: PROVIDER_ORDER,
    BRIDGE_ORDER: BRIDGE_ORDER,
    FOCUS_OPTIONS: FOCUS_OPTIONS,
    ROLE_ROOM: ROLE_ROOM,
    SAMPLES: SAMPLES,
    CUSTOM_SAMPLES: CUSTOM_SAMPLES,
    samplesFor: samplesFor,
    DOMAINS: DOMAINS,
    ROOM_MODS: ROOM_MODS
  };

  if (typeof module === 'object' && module.exports) module.exports = Data;
  else root.TeamRoomData = Data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
