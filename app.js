// 미리 — 화면
import * as C from './calc.js';
import * as S from './store.js';
import { CATEGORY_ICON, icon } from './icons.js';

const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const $tabbar = document.getElementById('tabbar');
const $toast = document.getElementById('toast');

// 설정 맨 아래에 보이는 버전. 화면이 안 바뀌면 이 값으로 새 버전을 받았는지 확인한다.
const VERSION = '2026.10.26-2';

const today = () => C.todayStr();

let state = S.load();
if (!state) {
  state = S.createSampleState(today());
  S.save(state);
}

function commit(next, { rerender = true } = {}) {
  state = next;
  if (!S.save(state)) toast('저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.');
  const r = parseRoute();
  if (rerender && r.name !== 'new' && r.name !== 'edit') render();
  refreshSheet();
}

// ---------- 공통 ----------

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const won = (n) => `${C.formatWon(n)}원`;
const MAX_WON = 9999999999;

function dateLabel(s, { year = false } = {}) {
  const { y, m, d } = C.parseDate(s);
  const sameYear = y === C.parseDate(today()).y;
  return year || !sameYear ? `${y}년 ${m}월 ${d}일` : `${m}월 ${d}일`;
}

function shortDate(s) {
  const { m, d } = C.parseDate(s);
  return `${m}.${d}`;
}

function ddayLabel(d) {
  if (d === 0) return 'D-day';
  return d > 0 ? `D-${d}` : `D+${-d}`;
}

const STATUS = {
  ok: { label: '순조로움', icon: 'checkCircle' },
  warn: { label: '주의', icon: 'alertTriangle' },
  short: { label: '부족', icon: 'alertOctagon' },
  done: { label: '다 모음', icon: 'check' },
};

const statusBadge = (s) =>
  `<span class="status status-${s}">${icon(STATUS[s].icon)}<span>${STATUS[s].label}</span></span>`;

const stageBadge = (stage) =>
  `<span class="status status-closed">${icon(stage === 'spent' ? 'check' : 'x')}<span>${C.STAGES[stage]}</span></span>`;

const badgeOf = (p) => (C.isActive(p) ? statusBadge(p.status) : stageBadge(p.stage));

const importanceTag = (imp) => `<span class="tag tag-${imp}">${C.IMPORTANCE[imp]}</span>`;

const catIcon = (cat) => `<span class="cat-ic" aria-hidden="true">${icon(CATEGORY_ICON[cat] || 'dots')}</span>`;

// 큰 금액이 길어지면 글자를 줄인다
function sizeClass(text) {
  const n = text.length;
  if (n > 14) return 'fit-xs';
  if (n > 12) return 'fit-s';
  if (n > 10) return 'fit-m';
  return '';
}

function progressBar(p) {
  const pct = Math.round(p.progress * 100);
  return `<span class="progress" role="progressbar" aria-label="진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>`;
}

// "10월 0원 · 11월 150,000원" — 길면 앞 5개만
function scheduleLine(schedule) {
  const shown = schedule.slice(0, 5).map((x) => `${x.label} ${won(x.amount)}`);
  if (schedule.length > 5) shown.push(`외 ${schedule.length - 5}회`);
  return shown.join(' · ');
}

const shortLine = (p) =>
  p.shortfall > 0
    ? `<span class="short-line">${icon('alertOctagon')}<span><b>부족</b> · 기한까지 ${won(p.shortfall)}을 못 모아요</span></span>`
    : '';

const byDue = (a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0);

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $toast.classList.remove('show'), 2200);
}

// 금액 입력: 입력할 때마다 천 단위 콤마. 커서 위치는 오른쪽 숫자 개수로 유지.
function bindMoney(input, onChange) {
  input.addEventListener('input', () => {
    const pos = input.selectionStart ?? input.value.length;
    const digitsRight = input.value.slice(pos).replace(/\D/g, '').length;
    const v = Math.min(C.parseWon(input.value), MAX_WON);
    input.value = v ? C.formatWon(v) : '';
    let p = input.value.length;
    for (let seen = 0; p > 0 && seen < digitsRight; ) {
      p--;
      if (/\d/.test(input.value[p])) seen++;
    }
    try {
      input.setSelectionRange(p, p);
    } catch {}
    onChange(v);
  });
}

function setMoney(input, v) {
  const n = Math.max(0, Math.min(v, MAX_WON));
  input.value = n ? C.formatWon(n) : '';
  return n;
}

const moneyField = (id, value, placeholder = '0') =>
  `<span class="money-input"><input id="${id}" name="${id}" inputmode="numeric" autocomplete="off" placeholder="${placeholder}" value="${value ? C.formatWon(value) : ''}"><span class="unit">원</span></span>`;

const quickButtons = (target) =>
  `<span class="quick" role="group" aria-label="빠르게 더하기">
    <button type="button" class="chip-btn" data-quick="${target}" data-add="10000">+1만</button>
    <button type="button" class="chip-btn" data-quick="${target}" data-add="50000">+5만</button>
    <button type="button" class="chip-btn" data-quick="${target}" data-add="100000">+10만</button>
    <button type="button" class="chip-btn ghost" data-quick="${target}" data-add="0">지우기</button>
  </span>`;

// ---------- 라우팅 ----------

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name = '', id = ''] = h.split('/');
  return { name: name || 'home', id: decodeURIComponent(id) };
}

function render() {
  const r = parseRoute();
  const views = { home: viewHome, plans: viewPlans, calendar: viewCalendar, new: viewForm, edit: viewForm };
  (views[r.name] || viewHome)(r);
  const isForm = r.name === 'new' || r.name === 'edit';
  $tabbar.hidden = isForm;
  document.body.classList.toggle('has-tabbar', !isForm);
  for (const a of $tabbar.querySelectorAll('[data-tab]')) {
    if (a.dataset.tab === r.name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', () => {
  closeSheet({ restoreFocus: false });
  render();
  window.scrollTo(0, 0);
});

// ---------- 홈 ----------

// 남는 돈 칸: 마이너스면 아이콘 + '부족'
const leftCell = (v) =>
  v < 0 ? `<b class="num neg">${icon('alertOctagon')}부족 ${won(-v)}</b>` : `<b class="num accent">${won(v)}</b>`;

function viewHome() {
  const t = today();
  const b = C.monthBudget(state, t);
  const sug = C.suggestAdjustments(state, t);
  const [now, next] = b.months;
  const sp = b.spent;
  const haveNeg = b.have < 0;
  const haveText = won(b.have);
  const spends = [...sp.list].sort((a, c) => ((a.ts || a.date) < (c.ts || c.date) ? 1 : -1));
  const upcoming = b.plans.filter((p) => p.status !== 'done').sort(byDue).slice(0, 3);

  $app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">${appMark()}</span>
        <div>
          <h1 class="brand-name">미리</h1>
          <p class="brand-sub num">${shortDate(now.start)} – ${shortDate(now.end)}</p>
        </div>
      </div>
      <button class="icon-btn" data-action="open-settings" aria-label="설정 열기">${icon('sliders')}</button>
    </header>

    <section class="hero" aria-labelledby="hero-label">
      <p class="hero-label" id="hero-label">지금 남은 돈 <span class="hero-tag">${now.label} 월급에서</span></p>
      <p class="hero-amount num ${haveNeg ? 'neg' : ''} ${sizeClass(haveText)}">${haveText}</p>
      ${
        b.salary
          ? `${splitBar(now, b)}
             <ul class="hero-bill">
               ${heroRow('월급', b.salary, '')}
               ${heroRow('고정지출', b.fixed)}
               ${b.savings ? heroRow('적금', b.savings) : ''}
               ${sp.out ? heroRow('이번 달 쓴 돈', sp.out) : ''}
               ${sp.fromPrior ? heroRow('계획에 모아 둔 돈에서', sp.fromPrior, '+') : ''}
               ${sp.income ? heroRow('들어온 돈', sp.income, '+') : ''}
             </ul>
             <div class="hero-sub">
               <p class="hero-sub-title">이 중에서 떼어 둘 돈</p>
               <ul class="hero-bill">
                 <li><span><span class="bill-sign" aria-hidden="true">−</span>생활비 남은 돈</span><span class="num"><b class="${sp.livingLeft < 0 ? 'neg' : ''}">${won(sp.livingLeft)}</b> <span class="muted">/ ${won(b.living)}</span></span></li>
                 ${b.keep ? heroRow('계획에 모을 돈', b.keep) : ''}
                 ${now.shortfall ? heroRow('기한인데 못 모은 돈', now.shortfall) : ''}
                 <li class="hero-free"><span>더 쓰거나 저축할 돈</span>${leftCell(b.free)}</li>
               </ul>
             </div>`
          : `<button class="btn btn-primary btn-sm" data-action="open-settings">월급부터 입력하기</button>`
      }
    </section>

    <button class="btn btn-primary btn-block" data-action="spend-new">${icon('plus')}지출 넣기</button>

    ${
      spends.length
        ? `<section class="card spend-card">
             <div class="section-head tight"><h2>${now.label} 지출</h2><span class="muted small num">${spends.length}개</span></div>
             <ul class="spend-rows">${spends.map(spendRow).join('')}</ul>
           </section>`
        : ''
    }

    ${
      next
        ? `<a class="card next-card" href="#/calendar">
             <span class="next-label">${next.label}</span>
             <span class="next-vals num"><span>모을 돈 <b>${won(next.reserve)}</b></span><span>남을 돈 ${leftCell(next.left)}</span></span>
             ${icon('chevronRight')}
           </a>`
        : ''
    }

    ${sug ? suggestionCard(sug) : ''}

    <section class="section">
      <div class="section-head">
        <h2>다가오는 계획</h2>
        ${state.plans.length ? `<a class="link" href="#/plans">전체${icon('chevronRight')}</a>` : ''}
      </div>
      ${
        upcoming.length
          ? `<ul class="list-card">${upcoming.map(upcomingRow).join('')}</ul>`
          : `<a class="card empty-link" href="#/new">${icon('plus')}부모님 생신, 여행처럼 미리 아는 큰 지출을 등록해요</a>`
      }
    </section>
  `;
}

const heroRow = (label, v, sign = '−') =>
  `<li><span>${sign ? `<span class="bill-sign" aria-hidden="true">${sign}</span>` : ''}${label}</span><b class="num">${won(v)}</b></li>`;

// 월급이 어디로 나뉘는지 한 줄 막대 + 작은 범례
function splitBar(m, b) {
  const segs = [
    { key: 'fixed', label: '고정', v: m.fixed },
    { key: 'savings', label: '적금', v: b.savings },
    { key: 'spent', label: '쓴 돈', v: Math.max(0, b.spent.out - b.spent.fromPrior) },
    { key: 'living', label: '생활비 남음', v: b.livingKeep },
    { key: 'reserve', label: '모으기', v: Math.max(0, b.keep) },
    { key: 'free', label: '남음', v: Math.max(0, m.left) },
  ];
  const total = Math.max(m.salary, segs.reduce((a, x) => a + x.v, 0));
  const pct = (v) => (total ? (v / total) * 100 : 0);
  return `
    <div class="split" role="img" aria-label="${segs.map((x) => `${x.label} ${won(x.v)}`).join(', ')}">
      ${segs
        .filter((x) => x.v > 0)
        .map((x) => `<i class="seg seg-${x.key}" style="width:${pct(x.v)}%"></i>`)
        .join('')}
    </div>
    <ul class="legend-mini">
      ${segs
        .filter((x) => x.v > 0 || x.key === 'free')
        .map((x) => `<li><span class="dot seg-${x.key}" aria-hidden="true"></span>${x.label}</li>`)
        .join('')}
    </ul>`;
}

const SOURCE_CLASS = { living: 'src-living', plan: 'src-plan', other: 'src-other', income: 'src-income' };

function spendRow(x) {
  const income = x.source === 'income';
  const where = x.source === 'plan' && x.planName ? x.planName : C.SOURCES[x.source] || C.SOURCES.other;
  return `
    <li>
      <button class="spend-row" data-action="spend-edit" data-id="${esc(x.id)}">
        <span class="sr-name">${esc(x.name)}</span>
        <span class="src ${SOURCE_CLASS[x.source] || 'src-other'}">${esc(where)}</span>
        <b class="num ${income ? 'plus' : ''}">${income ? '+' : ''}${won(x.amount)}</b>
      </button>
    </li>`;
}

function appMark() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)"/><rect x="19" y="13" width="29" height="20" rx="5" fill="var(--on-accent)" fill-opacity=".5" transform="rotate(-8 33.5 23)"/><rect x="16" y="24" width="32" height="25" rx="5.5" fill="var(--on-accent)"/><path d="m24.5 36.5 5 5 9.5-10" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function suggestionCard(sug) {
  const items = sug.items.filter((i) => i.needed);
  return `
    <section class="card alert-card" aria-labelledby="sug-title">
      <h2 id="sug-title" class="alert-title">${icon('alertOctagon')}<span><b>부족</b> · ${
        sug.shortfall ? `기한까지 ${won(sug.shortfall)} 못 모아요` : `이번 달 ${won(sug.overspend)} 모자라요`
      }</span></h2>
      ${
        items.length
          ? `<p class="card-sub">이렇게 늦추면 돼요 (필수 계획 제외, 자동으로 바꾸지 않아요)</p>
             <ul class="sug-lines">${items
               .map((it) => {
                 const o = it.options.find((x) => x.deficitAfter < sug.deficit) || it.options[it.options.length - 1];
                 return `<li><a href="#/edit/${encodeURIComponent(it.id)}"><span><b>${esc(it.name)}</b> ${o.months}개월 늦추기</span><span class="num muted">${
                   o.deficitAfter > 0 ? `부족 ${won(o.deficitAfter)}` : '해결'
                 }</span>${icon('chevronRight')}</a></li>`;
               })
               .join('')}</ul>`
          : `<p class="card-sub">늦춰서 해결되는 계획이 없어요. 금액이나 생활비를 조정해 보세요.</p>`
      }
    </section>`;
}

function upcomingRow(p) {
  return `
    <li>
      <button class="row-btn" data-action="open-plan" data-id="${esc(p.id)}">
        ${catIcon(p.category)}
        <span class="row-main">
          <span class="row-title">${esc(p.name)}</span>
          <span class="row-sub num">${dateLabel(p.dueDate)} · <b>${ddayLabel(p.dday)}</b></span>
          <span class="row-sub num">${won(p.saved)} / ${won(p.amount)}</span>
          ${progressBar(p)}
        </span>
        <span class="row-end">
          <span class="row-amount num"><span class="row-amount-label">이번 달</span>${won(p.thisMonth)}</span>
          ${statusBadge(p.status)}
        </span>
      </button>
    </li>`;
}

// ---------- 계획 리스트 ----------

function viewPlans() {
  const b = C.monthBudget(state, today());
  const active = [...b.plans].sort((a, c) => (a.status === 'done') - (c.status === 'done') || byDue(a, c));
  const closed = state.plans
    .filter((p) => !C.isActive(p))
    .map((p) => C.planMonth(p, state.settings, today()))
    .sort((a, c) => byDue(c, a));

  $app.innerHTML = `
    <header class="topbar">
      <div>
        <h1 class="page-title">계획</h1>
        <p class="brand-sub">준비 중 ${active.length}개 · 이번 달 준비금 <b class="num">${won(b.reserve)}</b></p>
      </div>
      <a class="icon-btn accent-btn" href="#/new" aria-label="새 계획 추가">${icon('plus')}</a>
    </header>
    ${
      state.plans.length
        ? `${active.length ? `<ul class="plan-list">${active.map(planCard).join('')}</ul>` : '<div class="card empty"><p>준비 중인 계획이 없어요.</p></div>'}
           ${closed.length ? `<h2 class="group-title">끝난 계획 <span class="muted">· 계산에서 빠져요</span></h2><ul class="plan-list">${closed.map(planCard).join('')}</ul>` : ''}`
        : `<div class="card empty">
             <p>아직 계획이 없어요.</p>
             <p class="card-sub">미리 알고 있는 큰 지출을 등록하면 매달 얼마씩 모으면 되는지 알려 드려요.</p>
             <a class="btn btn-primary btn-block" href="#/new">${icon('plus')}새 계획 추가</a>
           </div>`
    }
  `;
}

function planCard(p) {
  return `
    <li>
      <button class="plan-card ${C.isActive(p) ? '' : 'closed'}" data-action="open-plan" data-id="${esc(p.id)}">
        <span class="pc-top">
          ${catIcon(p.category)}
          <span class="pc-title">
            <span class="pc-name">${esc(p.name)}</span>
            <span class="tags"><span class="tag">${esc(p.category)}</span>${importanceTag(p.importance)}</span>
          </span>
          ${badgeOf(p)}
        </span>
        <span class="pc-date num">${icon('calendar')}${dateLabel(p.dueDate, { year: true })}<b class="dday">${ddayLabel(p.dday)}</b></span>
        <span class="pc-amounts">
          <span>확보 <b class="num">${won(p.saved)}</b></span>
          <span class="muted num">목표 ${won(p.amount)}</span>
        </span>
        ${progressBar(p)}
        <span class="pc-foot">
          ${
            !C.isActive(p)
              ? `<span class="muted">${p.stage === 'spent' ? '지출을 마친 계획이에요' : '취소한 계획이에요'}</span>`
              : p.status === 'done'
                ? '<span class="muted">목표 금액을 다 모았어요</span>'
                : `<span class="muted">이번 달 확보할 금액 · 이번 달 포함 ${p.count}회</span><b class="num accent">${won(p.thisMonth)}</b>`
          }
        </span>
        ${C.isActive(p) && p.status !== 'done' ? `<span class="sched num">${scheduleLine(p.schedule)}</span>${shortLine(p)}` : ''}
      </button>
    </li>`;
}

// ---------- 월별 ----------

function viewCalendar() {
  const b = C.monthBudget(state, today());
  $app.innerHTML = `
    <header class="topbar">
      <div>
        <h1 class="page-title">월별</h1>
        <p class="brand-sub">달마다 모을 돈과 남는 돈 · 눌러서 자세히</p>
      </div>
    </header>
    <section class="card month-table">
      <div class="mt-head" aria-hidden="true"><span></span><span>모을 돈</span><span>남는 돈</span></div>
      ${b.months.map((m) => monthRow(m, b)).join('')}
    </section>
    ${pastSpends(b)}
  `;
}

function billRow(label, amount, { sign = '−', cls = '', sub = '' } = {}) {
  return `
    <li class="bill-row ${cls}">
      <span class="bill-label"><span class="bill-sign" aria-hidden="true">${sign}</span><span>${label}${sub ? `<small>${sub}</small>` : ''}</span></span>
      <b class="num">${won(amount)}</b>
    </li>`;
}

const billSubs = (rows) =>
  rows.length
    ? `<li><ul class="bill-subs">${rows
        .map(([name, v, id]) =>
          id
            ? `<li><button class="bill-sub" data-action="open-plan" data-id="${esc(id)}"><span>${esc(name)}</span><span class="num">${v}</span></button></li>`
            : `<li class="bill-sub"><span>${esc(name)}</span><span class="num">${v}</span></li>`,
        )
        .join('')}</ul></li>`
    : '';

function monthRow(m, b) {
  const items = m.fixedItems;
  const sp = m.spent;
  const spentSubs = sp
    ? [
        sp.other && ['그 외 지출', won(sp.other)],
        sp.livingOver && ['생활비 초과', won(sp.livingOver)],
        sp.planExtra && ['계획보다 더 씀', won(sp.planExtra)],
        sp.income && ['들어온 돈', `+${won(sp.income)}`],
        sp.returned && ['계획에서 남은 돈', `+${won(sp.returned)}`],
      ].filter(Boolean)
    : [];
  return `
    <details class="mrow" ${m.k === 0 ? 'open' : ''}>
      <summary>
        <span class="mr-label">${m.label}${m.k === 0 ? '<small>이번 달</small>' : m.k === 1 ? '<small>다음 달</small>' : ''}</span>
        <span class="num">${won(m.reserve)}</span>
        <span>${leftCell(m.left)}</span>
      </summary>
      <div class="mr-body">
        <ul class="bill">
          ${billRow('월급', m.salary, { sign: '', cls: 'bill-start', sub: m.salaryEdited ? `이 달만 고침 · 기본 ${won(b.salaryBase)}` : '' })}
          ${billRow(`고정지출`, m.fixed, {
            sub: items.map((it) => (it.edited ? `<b class="edited">${esc(it.name)} ${won(it.amount)}</b>` : esc(it.name))).join(' · '),
          })}
          ${billRow('적금', b.savings)}
          ${billRow('생활비', m.living)}
          ${billRow('모으기', m.reserve)}
          ${billSubs(m.allocs.map((a) => [a.name, won(a.amount), a.id]))}
          ${m.hit ? billRow(m.hit > 0 ? '이번 달 지출' : '이번 달 더해진 돈', Math.abs(m.hit), { sign: m.hit > 0 ? '−' : '+' }) : ''}
          ${billSubs(spentSubs)}
          ${m.shortfall ? billRow('기한인데 못 모은 돈', m.shortfall, { cls: 'bill-short' }) : ''}
          <li class="bill-row bill-total">
            <span class="bill-label"><span class="bill-sign" aria-hidden="true">=</span><span>남는 돈</span></span>
            ${leftCell(m.left)}
          </li>
        </ul>
        ${
          m.dues.length
            ? `<p class="mr-dues">${icon('calendar')}<span>이 달에 쓸 계획: ${m.dues
                .map((d) => `${esc(d.name)} ${won(d.amount)}${d.shortfall ? ` <b class="neg">(부족 ${won(d.shortfall)})</b>` : ''}`)
                .join(', ')}</span></p>`
            : ''
        }
        <button type="button" class="chip-btn mr-edit" data-action="edit-salary" data-start="${m.start}">${icon('pencil')}이 달 월급·고정지출 고치기</button>
      </div>
    </details>`;
}

function pastSpends(b) {
  const start = b.period.start;
  const groups = new Map();
  for (const x of (state.spends || []).filter((x) => x.date < start)) {
    const p = C.currentPeriod(x.date, state.settings.payday).start;
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push({ ...x, source: x.source || 'other' });
  }
  if (!groups.size) return '';
  return `
    <section class="card">
      <h2 class="sub-title">지난 달 지출</h2>
      ${[...groups.entries()]
        .sort((a, c) => (a[0] < c[0] ? 1 : -1))
        .map(
          ([p, list]) => `<details class="past">
            <summary><span>${C.parseDate(C.addDays(p, 15)).y}년 ${C.periodLabel(p)}</span><b class="num">${won(
              list.filter((x) => x.source !== 'income').reduce((sum, x) => sum + x.amount, 0),
            )}</b></summary>
            <ul class="spend-rows">${list.map(spendRow).join('')}</ul>
          </details>`,
        )
        .join('')}
    </section>`;
}

// ---------- 새 계획 추가 / 수정 ----------

function viewForm(r) {
  const t = today();
  const editing = r.name === 'edit' ? state.plans.find((p) => p.id === r.id) : null;
  if (r.name === 'edit' && !editing) {
    location.replace('#/plans');
    return;
  }
  const savedNow = editing ? C.savedTotal(editing) : 0;
  const draft = editing
    ? {
        name: editing.name,
        category: editing.category,
        amount: editing.amount,
        dueDate: editing.dueDate,
        importance: editing.importance,
        notes: editing.notes || '',
        saved: 0,
      }
    : { name: '', category: '선물', amount: 0, dueDate: '', importance: 'flex', notes: '', saved: 0 };
  const back = editing ? '#/plans' : '#/';

  const IMP_DESC = { must: '그 날짜에 꼭 필요해요', flex: '날짜나 금액을 바꿀 수 있어요', wish: '있으면 좋은 계획이에요' };

  $app.innerHTML = `
    <header class="topbar form-top">
      <a class="icon-btn" href="${back}" data-action="back" aria-label="뒤로">${icon('chevronLeft')}</a>
      <h1 class="page-title">${editing ? '계획 수정' : '새 계획 추가'}</h1>
      <span class="icon-btn-space"></span>
    </header>
    <form id="plan-form" class="form" novalidate autocomplete="off">
      <div class="card form-card">
        <label class="field">
          <span class="field-label">목표 이름</span>
          <input class="input" name="name" maxlength="40" placeholder="예: 엄마 생신 선물" value="${esc(draft.name)}">
        </label>

        <fieldset class="field">
          <legend class="field-label">카테고리</legend>
          <div class="chips">
            ${C.CATEGORIES.map(
              (c) => `<label class="chip"><input type="radio" name="category" value="${c}" ${c === draft.category ? 'checked' : ''}>${icon(CATEGORY_ICON[c])}<span>${c}</span></label>`,
            ).join('')}
          </div>
        </fieldset>

        <div class="field">
          <label class="field-label" for="amount">목표 금액</label>
          ${moneyField('amount', draft.amount)}
          ${quickButtons('amount')}
        </div>

        <label class="field">
          <span class="field-label">필요한 날짜</span>
          <input class="input num" type="date" name="dueDate" min="${t}" value="${draft.dueDate}">
        </label>

        <fieldset class="field">
          <legend class="field-label">중요도</legend>
          <div class="chips imp-chips">
            ${Object.entries(C.IMPORTANCE)
              .map(
                ([k, label]) => `<label class="chip chip-col"><input type="radio" name="importance" value="${k}" ${k === draft.importance ? 'checked' : ''}><span class="chip-title">${label}</span><span class="chip-desc">${IMP_DESC[k]}</span></label>`,
              )
              .join('')}
          </div>
        </fieldset>

        ${
          editing
            ? `<div class="field">
                 <span class="field-label">지금까지 확보한 금액</span>
                 <p class="readonly num">${won(savedNow)}</p>
                 <p class="field-hint">확보액은 계획을 눌러 +/− 버튼으로 기록해요.</p>
               </div>`
            : `<div class="field">
                 <label class="field-label" for="saved">이미 확보한 금액 <span class="muted">(선택)</span></label>
                 ${moneyField('saved', 0)}
                 <p class="field-error" id="saved-error" hidden></p>
               </div>`
        }
      </div>

      <div class="card form-card">
        <label class="field">
          <span class="field-label">메모 <span class="muted">(선택)</span></span>
          <textarea class="input textarea" name="notes" maxlength="200" rows="2" placeholder="예: 꽃다발 + 식사, 가족이랑 나눠서 내기">${esc(draft.notes)}</textarea>
        </label>
      </div>

      <section class="preview" id="preview" aria-live="polite"></section>

      <div class="form-actions">
        <ul class="hints" id="hints"></ul>
        <button type="submit" class="btn btn-primary btn-block" id="submit">${editing ? '수정 저장' : '계획 추가하기'}</button>
      </div>
    </form>
  `;

  const form = document.getElementById('plan-form');
  const $preview = document.getElementById('preview');
  const $hints = document.getElementById('hints');
  const $submit = document.getElementById('submit');
  const $savedErr = document.getElementById('saved-error');
  const amountInput = form.querySelector('#amount');
  const savedInput = form.querySelector('#saved');

  const errorsOf = () =>
    C.validatePlan(draft, t, { minAmount: editing ? savedNow : 0 });

  const draftPlan = () => ({
    id: editing ? editing.id : '__draft__',
    name: draft.name,
    category: draft.category,
    amount: draft.amount,
    dueDate: draft.dueDate,
    importance: draft.importance,
    stage: editing ? editing.stage : 'active',
    baselineMonthly: 0,
    history: editing
      ? editing.history
      : draft.saved > 0
        ? [{ id: 'd', date: t, ts: '', delta: draft.saved, kind: 'initial' }]
        : [],
  });

  function update() {
    const errors = errorsOf();
    const canCalc = draft.amount > 0 && C.isValidDate(draft.dueDate) && !C.isPastDate(draft.dueDate, t);
    if (canCalc && draft.saved <= draft.amount && (!editing || draft.amount >= savedNow)) {
      const pv = C.previewPlan(state, draftPlan(), t, editing ? editing.id : null);
      const neg = pv.freeAfter < 0;
      $preview.className = 'preview';
      $preview.innerHTML = `
        <div class="pv-grid">
          <div>
            <p class="pv-label">이번 달 확보할 금액</p>
            <p class="pv-value num accent">${won(pv.monthly)}</p>
          </div>
          <div>
            <p class="pv-label">준비 횟수</p>
            <p class="pv-value num">이번 달 포함 ${pv.count}회</p>
          </div>
        </div>
        <p class="sched num">${scheduleLine(pv.schedule)}</p>
        ${shortLine(pv)}
        ${
          pv.count === 1
            ? `<p class="pv-note">다음 월급 전이라 이번 달에 모두 모아요.</p>`
            : ''
        }
        <div class="pv-free">
          <p class="pv-label">${editing ? '수정하면' : '추가하면'} 이번 달 남는 돈</p>
          <p class="pv-change num"><span>${won(pv.freeBefore)}</span>${icon('chevronRight')}<b class="${neg ? 'neg' : 'accent'}">${won(pv.freeAfter)}</b></p>
          ${neg ? `<p class="pv-warn">${icon('alertOctagon')}<span><b>부족</b> · 남는 돈이 마이너스가 돼요</span></p>` : ''}
        </div>`;
    } else {
      $preview.className = 'preview empty-pv';
      $preview.innerHTML = `<p>${icon('info')}<span>금액과 날짜를 넣으면 매달 얼마씩 모으면 되는지 바로 계산해 드려요.</span></p>`;
    }

    if ($savedErr) {
      const over = draft.amount > 0 && draft.saved > draft.amount;
      $savedErr.hidden = !over;
      $savedErr.innerHTML = over ? `${icon('alertOctagon')}이미 확보한 금액이 목표 금액보다 커요.` : '';
    }

    $submit.disabled = errors.length > 0;
    $hints.innerHTML = errors.length
      ? errors.map((e) => `<li>${icon('info')}<span>${esc(e)}</span></li>`).join('')
      : '';
  }

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name === 'name') draft.name = el.value;
    else if (el.name === 'dueDate') draft.dueDate = el.value;
    else if (el.name === 'notes') return (draft.notes = el.value);
    else if (el.name === 'category') draft.category = el.value;
    else if (el.name === 'importance') draft.importance = el.value;
    else return;
    update();
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'category' || e.target.name === 'importance') {
      draft[e.target.name] = e.target.value;
      update();
    }
  });
  bindMoney(amountInput, (v) => {
    draft.amount = v;
    update();
  });
  if (savedInput)
    bindMoney(savedInput, (v) => {
      draft.saved = v;
      update();
    });
  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quick]');
    if (!btn) return;
    const add = Number(btn.dataset.add);
    draft.amount = setMoney(amountInput, add ? draft.amount + add : 0);
    update();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (errorsOf().length) return update();
    const fields = {
      name: draft.name.trim(),
      category: draft.category,
      amount: draft.amount,
      dueDate: draft.dueDate,
      importance: draft.importance,
      notes: draft.notes.trim(),
    };
    let plans;
    if (editing) {
      const merged = { ...editing, ...fields };
      if (merged.amount !== editing.amount || merged.dueDate !== editing.dueDate) {
        merged.baselineMonthly = C.planMonth(merged, state.settings, t).monthlyNeed;
      }
      plans = state.plans.map((p) => (p.id === editing.id ? merged : p));
    } else {
      const now = new Date().toISOString();
      const plan = {
        id: S.newId(),
        ...fields,
        stage: 'active',
        createdAt: now,
        baselineMonthly: 0,
        history: draft.saved > 0 ? [{ id: S.newId(), date: t, ts: now, delta: draft.saved, kind: 'initial' }] : [],
      };
      plan.baselineMonthly = C.planMonth(plan, state.settings, t).monthlyNeed;
      plans = [...state.plans, plan];
    }
    commit({ ...state, plans }, { rerender: false });
    toast(editing ? '계획을 고쳤어요' : '계획을 추가했어요');
    location.hash = '#/plans';
  });

  update();
  if (!editing) form.querySelector('[name=name]').focus({ preventScroll: true });
}

// ---------- 시트 ----------

let sheet = null; // { type: 'plan' | 'settings', id, opener }

function openSheet(type, id = null, extra = {}) {
  sheet = { type, id, opener: document.activeElement, ...extra };
  $sheetRoot.innerHTML = `
    <div class="sheet-backdrop" data-action="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <div class="sheet-grip" aria-hidden="true"></div>
      <div class="sheet-body"></div>
    </div>`;
  document.body.classList.add('sheet-open');
  fillSheet();
  const el = $sheetRoot.querySelector('.sheet');
  requestAnimationFrame(() => $sheetRoot.classList.add('open'));
  el.focus({ preventScroll: true });
}

function closeSheet({ restoreFocus = true } = {}) {
  if (!sheet) return;
  const opener = sheet.opener;
  sheet = null;
  $sheetRoot.classList.remove('open');
  $sheetRoot.innerHTML = '';
  document.body.classList.remove('sheet-open');
  if (restoreFocus && opener && document.contains(opener)) opener.focus({ preventScroll: true });
}

function refreshSheet() {
  if (!sheet) return;
  if (sheet.type === 'plan' && !state.plans.some((p) => p.id === sheet.id)) return closeSheet();
  if (sheet.type === 'spend' && sheet.id && !state.spends.some((x) => x.id === sheet.id)) return closeSheet();
  fillSheet();
}

function fillSheet() {
  const sheetEl = $sheetRoot.querySelector('.sheet');
  const body = $sheetRoot.querySelector('.sheet-body');
  const scroll = sheetEl.scrollTop;
  if (sheet.type === 'plan') {
    body.innerHTML = planSheetHTML(sheet.id);
    bindPlanSheet(body, sheet.id);
  } else if (sheet.type === 'spend') {
    body.innerHTML = spendSheetHTML();
    bindSpendSheet(body);
  } else if (sheet.type === 'salary') {
    body.innerHTML = salarySheetHTML(sheet.id);
    bindSalarySheet(body, sheet.id);
  } else {
    body.innerHTML = settingsSheetHTML();
    bindSettingsSheet(body);
  }
  sheetEl.scrollTop = scroll;
}

// --- 지출 넣기 / 고치기 ---

// 계획에서 쓴 지출이 하나도 없으면 그 계획을 다시 준비 중으로
function syncPlanStages(plans, spends, touched) {
  return plans.map((p) => {
    if (!touched.includes(p.id)) return p;
    const used = spends.some((x) => x.source === 'plan' && x.planId === p.id);
    if (used) return { ...p, stage: 'spent' };
    return p.stage === 'spent' ? { ...p, stage: 'active' } : p;
  });
}

function spendSheetHTML() {
  const x = sheet.id ? state.spends.find((y) => y.id === sheet.id) : null;
  if (!sheet.draft) {
    sheet.draft = x
      ? { name: x.name, amount: x.amount, source: x.source || 'other', planId: x.planId || '' }
      : { name: '', amount: 0, source: 'living', planId: '', ...(sheet.preset || {}) };
  }
  const d = sheet.draft;
  const income = d.source === 'income';
  const plans = state.plans.filter((p) => C.isActive(p) || p.id === d.planId);
  const chosen = state.plans.find((p) => p.id === d.planId);
  const repeat = x?.repeatId && state.plans.find((p) => p.id === x.repeatId);
  return `
    <div class="sheet-head">
      <div class="sheet-title-wrap"><h2 id="sheet-title" class="sheet-title">${income ? '들어온 돈' : x ? '지출 고치기' : '지출 넣기'}</h2></div>
      <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('x')}</button>
    </div>
    <form id="spend-form" class="form" novalidate autocomplete="off">
      <div class="spend-add-row">
        <input class="input" name="name" maxlength="30" placeholder="${income ? '예: 환급' : '어디에 (예: 렌즈)'}" aria-label="이름" value="${esc(d.name)}">
        ${moneyField('spend-amount', d.amount)}
      </div>
      <span class="quick" role="group" aria-label="빠르게 더하기">
        <button type="button" class="chip-btn" data-add="10000">+1만</button>
        <button type="button" class="chip-btn" data-add="50000">+5만</button>
        <button type="button" class="chip-btn" data-add="100000">+10만</button>
      </span>
      ${
        income
          ? ''
          : `<fieldset class="field">
               <legend class="field-label">어디서 나갔어요?</legend>
               <div class="chips src-chips">
                 ${['living', 'plan', 'other']
                   .map(
                     (k) => `<label class="chip"><input type="radio" name="source" value="${k}" ${d.source === k ? 'checked' : ''}><span>${C.SOURCES[k]}</span></label>`,
                   )
                   .join('')}
               </div>
               ${
                 d.source === 'plan'
                   ? plans.length
                     ? `<select class="input" name="planId" aria-label="어느 계획">
                          <option value="">계획 고르기</option>
                          ${plans
                            .map((p) => `<option value="${esc(p.id)}" ${p.id === d.planId ? 'selected' : ''}>${esc(p.name)} · 모아 둔 돈 ${won(C.savedTotal(p))}</option>`)
                            .join('')}
                        </select>
                        ${chosen ? `<span class="field-hint">모아 둔 돈에서 나가고, 이 계획은 '지출 완료'가 돼요.</span>` : ''}`
                     : `<span class="field-hint">준비 중인 계획이 없어요.</span>`
                   : `<span class="field-hint">${d.source === 'living' ? '생활비에서 빠져요.' : '남는 돈에서 바로 빠져요.'}</span>`
               }
             </fieldset>`
      }
      <div class="rec-actions">
        ${x ? `<button type="button" class="btn btn-danger-ghost" data-spend-del><span>지우기</span></button>` : '<span></span>'}
        <button type="submit" class="btn btn-primary">${x ? '저장' : '넣기'}</button>
      </div>
      <div class="spend-links">
        <button type="button" class="text-btn" data-spend-income>${income ? '지출로 바꾸기' : '+ 들어온 돈이에요'}</button>
        ${
          x && !income && d.source !== 'plan'
            ? repeat
              ? `<button type="button" class="text-btn" data-action="open-plan" data-id="${esc(repeat.id)}">${icon('check')}내년 계획 있음</button>`
              : `<button type="button" class="text-btn" data-spend-repeat>내년에도 있어요</button>`
            : ''
        }
      </div>
    </form>`;
}

function bindSpendSheet(body) {
  const form = body.querySelector('#spend-form');
  const d = sheet.draft;
  const x = sheet.id ? state.spends.find((y) => y.id === sheet.id) : null;
  const amountInput = form.querySelector('#spend-amount');
  bindMoney(amountInput, (v) => (d.amount = v));
  form.name.addEventListener('input', () => (d.name = form.name.value));
  form.addEventListener('change', (e) => {
    if (e.target.name === 'source') {
      d.source = e.target.value;
      fillSheet();
    } else if (e.target.name === 'planId') {
      d.planId = e.target.value;
      const p = state.plans.find((y) => y.id === d.planId);
      if (p && !d.name) d.name = p.name;
      if (p && !d.amount) d.amount = p.amount;
      fillSheet();
    }
  });
  form.addEventListener('click', (e) => {
    const q = e.target.closest('[data-add]');
    if (q) d.amount = setMoney(amountInput, d.amount + Number(q.dataset.add));
    if (e.target.closest('[data-spend-income]')) {
      d.source = d.source === 'income' ? 'living' : 'income';
      fillSheet();
    }
    if (e.target.closest('[data-spend-repeat]')) {
      const t = today();
      let dueDate = C.addMonths(x.date, 12);
      if (dueDate < t) dueDate = C.addMonths(t, 12);
      const plan = {
        id: S.newId(),
        name: x.name,
        category: '기타',
        amount: x.amount,
        dueDate,
        importance: 'flex',
        stage: 'active',
        notes: '',
        createdAt: new Date().toISOString(),
        baselineMonthly: 0,
        history: [],
      };
      plan.baselineMonthly = C.planMonth(plan, state.settings, t).monthlyNeed;
      commit({
        ...state,
        plans: [...state.plans, plan],
        spends: state.spends.map((y) => (y.id === x.id ? { ...y, repeatId: plan.id } : y)),
      });
      toast(`${dateLabel(dueDate, { year: true })} '${x.name}' 계획을 만들었어요`);
    }
    const del = e.target.closest('[data-spend-del]');
    if (del) {
      if (!del.dataset.confirm) {
        del.dataset.confirm = '1';
        del.querySelector('span').textContent = '정말 지우기';
        return;
      }
      const spends = state.spends.filter((y) => y.id !== x.id);
      closeSheet();
      commit({ ...state, spends, plans: syncPlanStages(state.plans, spends, [x.planId].filter(Boolean)) });
      toast('지웠어요');
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!d.amount) return toast('금액을 넣어 주세요.');
    if (d.source === 'plan' && !d.planId) return toast('어느 계획에서 썼는지 골라 주세요.');
    const fallback = { living: '생활비 지출', plan: '계획 지출', other: '지출', income: '들어온 돈' };
    const item = {
      id: x ? x.id : S.newId(),
      date: x ? x.date : today(),
      ts: x?.ts || new Date().toISOString(),
      name: d.name.trim().slice(0, 30) || fallback[d.source],
      amount: d.amount,
      source: d.source,
      ...(d.source === 'plan' ? { planId: d.planId } : {}),
      ...(x?.repeatId ? { repeatId: x.repeatId } : {}),
    };
    const spends = x ? state.spends.map((y) => (y.id === x.id ? item : y)) : [...state.spends, item];
    const touched = [x?.planId, item.planId].filter(Boolean);
    closeSheet();
    commit({ ...state, spends, plans: syncPlanStages(state.plans, spends, touched) });
    toast(x ? '고쳤어요' : `${item.name} ${won(item.amount)} 넣었어요`);
  });
  if (!x) form.name.focus({ preventScroll: true });
}

// --- 그 달 월급 ---

function salarySheetHTML(start) {
  const s = state.settings;
  const m = C.monthBudget(state, today()).months.find((x) => x.start === start);
  const salaryEdited = typeof s.salaryOverrides?.[start] === 'number';
  const items = C.fixedItemsFor(s, start);
  return `
    <div class="sheet-head">
      <div class="sheet-title-wrap">
        <h2 id="sheet-title" class="sheet-title">${C.periodLabel(start)} 금액 고치기</h2>
        <span class="muted small num">${m ? `${shortDate(m.start)} – ${shortDate(m.end)} · ` : ''}이 달 계산에만 쓰이고, 다른 달은 기본 금액 그대로예요.</span>
      </div>
      <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('x')}</button>
    </div>
    <form id="salary-form" class="form" novalidate>
      <div class="field">
        <label class="field-label" for="month-salary">실제로 받은 월급</label>
        ${moneyField('month-salary', C.salaryFor(s, start))}
        <span class="field-hint">야근수당·보너스까지 포함해 들어온 금액 · 기본 ${won(s.salary)}${salaryEdited ? ' · <b>이 달만 고침</b>' : ''}</span>
      </div>
      ${
        items.length
          ? `<fieldset class="field">
               <legend class="field-label">이 달 고정지출 <span class="muted num" id="month-fixed-total"></span></legend>
               <span class="field-hint">낸 금액이 기본과 다르면 고쳐요. 예: 보너스 달 십일조</span>
               <div class="fixed-list">
                 ${items
                   .map(
                     (it) => `<div class="month-fixed-row">
                       <span class="mf-name">${esc(it.name)}<small class="num">${it.edited ? `기본 ${won(it.base)} · <b>이 달만 고침</b>` : '기본 금액'}</small></span>
                       <span class="money-input"><input data-fid="${esc(it.id)}" inputmode="numeric" aria-label="${esc(it.name)} 이 달 금액" value="${C.formatWon(it.amount)}"><span class="unit">원</span></span>
                     </div>`,
                   )
                   .join('')}
               </div>
             </fieldset>`
          : ''
      }
      <div class="rec-actions">
        <button type="button" class="btn btn-ghost" data-salary-reset>모두 기본으로</button>
        <button type="submit" class="btn btn-primary">저장</button>
      </div>
    </form>`;
}

function bindSalarySheet(body, start) {
  const s = state.settings;
  const form = body.querySelector('#salary-form');
  const input = form.querySelector('#month-salary');
  const $total = form.querySelector('#month-fixed-total');
  let salary = C.salaryFor(s, start);
  const fixed = Object.fromEntries(C.fixedItemsFor(s, start).map((it) => [it.id, it.amount]));
  const updateTotal = () => {
    if ($total) $total.textContent = `합계 ${won(Object.values(fixed).reduce((a, v) => a + v, 0))}`;
  };
  bindMoney(input, (v) => (salary = v));
  for (const el of form.querySelectorAll('[data-fid]')) {
    bindMoney(el, (v) => {
      fixed[el.dataset.fid] = v;
      updateTotal();
    });
  }
  updateTotal();

  // 기본과 같은 값은 따로 저장하지 않는다 (기본을 바꾸면 그 달도 따라가게)
  const save = (reset) => {
    const salaryOverrides = { ...(s.salaryOverrides || {}) };
    const fixedOverrides = { ...(s.fixedOverrides || {}) };
    delete salaryOverrides[start];
    delete fixedOverrides[start];
    if (!reset) {
      if (salary !== s.salary) salaryOverrides[start] = salary;
      const changed = Object.fromEntries(
        s.fixedItems.filter((it) => fixed[it.id] !== it.amount).map((it) => [it.id, fixed[it.id]]),
      );
      if (Object.keys(changed).length) fixedOverrides[start] = changed;
    }
    commit({ ...state, settings: { ...s, salaryOverrides, fixedOverrides } });
    closeSheet();
  };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    save(false);
    toast(`${C.periodLabel(start)} 금액을 고쳤어요`);
  });
  body.querySelector('[data-salary-reset]').addEventListener('click', () => {
    save(true);
    toast(`${C.periodLabel(start)}을 기본 금액으로 되돌렸어요`);
  });
}

// --- 계획 상세 ---

function planSheetHTML(id) {
  const t = today();
  const raw = state.plans.find((x) => x.id === id);
  const active = C.isActive(raw);
  const p = active
    ? C.monthBudget(state, t).plans.find((x) => x.id === id)
    : C.planMonth(raw, state.settings, t);
  const hist = [...p.history].sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return `
    <div class="sheet-head">
      ${catIcon(p.category)}
      <div class="sheet-title-wrap">
        <h2 id="sheet-title" class="sheet-title">${esc(p.name)}</h2>
        <span class="tags"><span class="tag">${esc(p.category)}</span>${importanceTag(p.importance)}${badgeOf(p)}</span>
      </div>
      <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('x')}</button>
    </div>

    <p class="pc-date num">${icon('calendar')}${dateLabel(p.dueDate, { year: true })}<b class="dday">${ddayLabel(p.dday)}</b></p>

    ${p.notes ? `<p class="memo">${esc(p.notes)}</p>` : ''}

    <div class="detail-amount">
      <p class="num"><b class="amount-lg">${won(p.saved)}</b> <span class="muted">/ ${won(p.amount)}</span></p>
      ${progressBar(p)}
      <p class="muted small num">${Math.round(p.progress * 100)}% 확보 · 남은 금액 ${won(p.remaining)}</p>
    </div>

    ${
      !active
        ? `<div class="closed-note">
             <p>${icon(p.stage === 'spent' ? 'checkCircle' : 'info')}<span>${
               p.stage === 'spent' ? '지출을 마친 계획이에요.' : '취소한 계획이에요.'
             } 준비금과 여유 예산 계산에서 빠져요.</span></p>
             ${
               p.stage === 'cancelled' && p.saved > 0
                 ? `<p class="field-hint">확보해 둔 ${won(p.saved)}은 여유 자금으로 쓰거나, 다른 계획을 열어 '확보했어요'로 옮겨 기록하세요.</p>`
                 : ''
             }
             <button type="button" class="btn btn-ghost btn-sm" data-stage="active">다시 준비하기</button>
           </div>`
        : p.status === 'done'
        ? `<p class="done-note">${icon('checkCircle')}목표 금액을 다 모았어요.</p>`
        : `<div class="stat-grid">
             <div><p class="pv-label">이번 달 확보할 금액</p><p class="pv-value num accent">${won(p.thisMonth)}</p></div>
             <div><p class="pv-label">이번 달 남은 확보액</p><p class="pv-value num">${won(p.thisMonthLeft)}</p></div>
           </div>
           <p class="pv-note num">${
             p.overdue
               ? "필요한 날짜가 지났어요. 날짜를 바꾸거나, 이미 썼다면 아래 '지출 완료'를 눌러 주세요."
               : p.count === 1
                 ? '이번 달 안에 필요한 날짜라 남은 금액을 이번 달에 모두 준비해요.'
                 : `이번 달 포함 ${p.count}회 · 여유 있는 달에 더 넣고, 모자란 달 몫은 다음 달로 넘겨요.`
           }</p>
           <p class="sched num">${scheduleLine(p.schedule)}</p>
           ${shortLine(p)}`
    }

    ${active ? `<section class="record">
      <h3 class="sub-title">확보액 기록</h3>
      <p class="field-hint">실제로 돈이 옮겨지지는 않아요. 따로 모아 둔 금액을 적어 두는 곳이에요.</p>
      ${moneyField('rec-amount', 0)}
      <span class="quick" role="group" aria-label="빠르게 넣기">
        <button type="button" class="chip-btn" data-rec-add="10000">+1만</button>
        <button type="button" class="chip-btn" data-rec-add="50000">+5만</button>
        <button type="button" class="chip-btn" data-rec-add="100000">+10만</button>
        ${p.thisMonthLeft > 0 ? `<button type="button" class="chip-btn" data-rec-set="${p.thisMonthLeft}">이번 달 남은 만큼</button>` : ''}
      </span>
      <p class="field-error" id="rec-error" hidden></p>
      <div class="rec-actions">
        <button type="button" class="btn btn-outline" data-rec="-1">${icon('minus')}빼기</button>
        <button type="button" class="btn btn-primary" data-rec="1">${icon('plus')}확보했어요</button>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="sub-title">계획 마치기</h3>
      <p class="field-hint" id="stage-hint">돈을 다 썼으면 '지출 완료', 계획이 없어졌으면 '취소'. 둘 다 계산에서 빠지고, 언제든 다시 준비할 수 있어요.</p>
      <div class="rec-actions">
        <button type="button" class="btn btn-ghost" data-stage="spent">${icon('checkCircle')}<span>지출 완료</span></button>
        <button type="button" class="btn btn-ghost" data-stage="cancelled">${icon('x')}<span>계획 취소</span></button>
      </div>
    </section>` : ''}

    <section class="history">
      <h3 class="sub-title">변경 이력</h3>
      ${
        hist.length
          ? `<ul>${hist
              .map(
                (h) => `<li><span class="muted num">${dateLabel(h.date, { year: true })}</span><span>${h.kind === 'initial' ? '처음 확보액' : h.delta > 0 ? '확보' : '빼기'}</span><b class="num ${h.delta < 0 ? 'minus' : ''}">${h.delta > 0 ? '+' : '−'}${C.formatWon(Math.abs(h.delta))}원</b></li>`,
              )
              .join('')}</ul>`
          : '<p class="muted small">아직 기록이 없어요.</p>'
      }
    </section>

    <div class="sheet-actions">
      <a class="btn btn-ghost" href="#/edit/${encodeURIComponent(p.id)}">${icon('pencil')}수정</a>
      <button type="button" class="btn btn-danger-ghost" data-action="delete-plan">${icon('trash')}<span>삭제</span></button>
    </div>`;
}

function bindPlanSheet(body, id) {
  const input = body.querySelector('#rec-amount');
  const err = body.querySelector('#rec-error');
  let value = 0;
  if (input)
    bindMoney(input, (v) => {
      value = v;
      err.hidden = true;
    });
  const showErr = (msg) => {
    err.innerHTML = `${icon('alertOctagon')}${esc(msg)}`;
    err.hidden = false;
  };

  body.addEventListener('click', (e) => {
    const add = e.target.closest('[data-rec-add]');
    const set = e.target.closest('[data-rec-set]');
    const rec = e.target.closest('[data-rec]');
    const del = e.target.closest('[data-action="delete-plan"]');
    const stageBtn = e.target.closest('[data-stage]');
    if (stageBtn?.dataset.stage === 'spent') {
      const plan = state.plans.find((p) => p.id === id);
      openSheet('spend', null, { preset: { source: 'plan', planId: id, name: plan.name, amount: plan.amount } });
      return;
    }
    if (stageBtn) {
      const stage = stageBtn.dataset.stage;
      const plan = state.plans.find((p) => p.id === id);
      const saved = C.savedTotal(plan);
      // 취소할 때 확보해 둔 돈이 있으면 처리 방법을 먼저 안내하고 한 번 더 누르게 한다
      if (stage === 'cancelled' && saved > 0 && !stageBtn.dataset.confirm) {
        stageBtn.dataset.confirm = '1';
        stageBtn.querySelector('span').textContent = '정말 취소';
        body.querySelector('#stage-hint').innerHTML =
          `<b>확보해 둔 ${won(saved)}은 계산에서 빠져요.</b> 실제로 모아 둔 돈은 여유 자금으로 쓰거나, 다른 계획을 열어 '확보했어요'로 옮겨 기록하세요.`;
        return;
      }
      commit({ ...state, plans: state.plans.map((p) => (p.id === id ? { ...p, stage } : p)) });
      toast(stage === 'active' ? '다시 준비 중으로 바꿨어요' : stage === 'spent' ? '지출 완료로 표시했어요' : '계획을 취소했어요');
      return;
    }
    if (add) value = setMoney(input, value + Number(add.dataset.recAdd));
    else if (set) value = setMoney(input, Number(set.dataset.recSet));
    else if (rec) {
      const sign = Number(rec.dataset.rec);
      const plan = state.plans.find((p) => p.id === id);
      const saved = C.savedTotal(plan);
      if (!value) return showErr('기록할 금액을 입력해 주세요.');
      if (sign > 0 && saved + value > plan.amount) {
        return showErr(
          saved >= plan.amount ? '이미 목표 금액을 다 모았어요.' : `목표까지 ${won(plan.amount - saved)}만 더 기록할 수 있어요.`,
        );
      }
      if (sign < 0 && value > saved) return showErr(`지금 확보액(${won(saved)})보다 많이 뺄 수 없어요.`);
      const entry = { id: S.newId(), date: today(), ts: new Date().toISOString(), delta: sign * value, kind: 'manual' };
      commit({
        ...state,
        plans: state.plans.map((p) => (p.id === id ? { ...p, history: [...p.history, entry] } : p)),
      });
      toast(sign > 0 ? `${won(value)} 확보했어요` : `${won(value)} 뺐어요`);
    } else if (del) {
      if (!del.dataset.confirm) {
        del.dataset.confirm = '1';
        del.querySelector('span').textContent = '정말 삭제';
        return;
      }
      commit({ ...state, plans: state.plans.filter((p) => p.id !== id) });
      toast('계획을 지웠어요');
    }
  });
}

// --- 설정 ---

function settingsSheetHTML() {
  const s = state.settings;
  const sampleCount = state.plans.filter((p) => p.sample).length;
  const sampleFixed = s.fixedItems.filter((it) => it.sample).length;
  return `
    <div class="sheet-head">
      <div class="sheet-title-wrap"><h2 id="sheet-title" class="sheet-title">설정</h2></div>
      <button class="icon-btn" data-action="close-sheet" aria-label="닫기">${icon('x')}</button>
    </div>

    <form id="settings-form" class="form" novalidate>
      <div class="field">
        <label class="field-label" for="salary">기본 월급 (실수령)</label>
        ${moneyField('salary', s.salary)}
        <span class="field-hint">야근수당·보너스를 뺀 대략적인 금액. 실제로 받은 금액이 다르면 월별 탭에서 그 달만 고쳐요.</span>
      </div>
      <label class="field">
        <span class="field-label">급여일</span>
        <select class="input" name="payday">
          ${Array.from({ length: 31 }, (_, i) => i + 1)
            .map((d) => `<option value="${d}" ${d === s.payday ? 'selected' : ''}>매달 ${d}일</option>`)
            .join('')}
        </select>
        <span class="field-hint">한 달 = 월급날부터 다음 월급 전날까지. 29~31일은 그 날이 없는 달엔 말일로 계산해요.</span>
      </label>
      <fieldset class="field">
        <legend class="field-label fixed-head">고정지출 <span class="num" id="fixed-total"></span></legend>
        <span class="field-hint">월세, 휴대폰 요금, 보험, 구독처럼 매달 나가는 돈을 항목별로 적어요. 1년에 한 번 내는 돈은 계획으로 등록하세요.</span>
        <div class="fixed-list" id="fixed-list"></div>
        <div class="quick" id="fixed-presets"></div>
      </fieldset>
      <div class="field">
        <label class="field-label" for="savings">적금</label>
        ${moneyField('savings', s.savings)}
      </div>
      <div class="field">
        <label class="field-label" for="living">생활비 예산</label>
        ${moneyField('living', s.living)}
        <span class="field-hint">식비, 교통비, 장보기 등 한 달 동안 쓸 돈</span>
      </div>
      <p class="settings-sum" id="settings-sum"></p>
      <button type="submit" class="btn btn-primary btn-block">설정 저장</button>
    </form>

    <section class="settings-section">
      <h3 class="sub-title">백업</h3>
      <p class="field-hint">데이터는 이 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 내보내 두세요.</p>
      <div class="rec-actions">
        <button type="button" class="btn btn-ghost" data-action="export">${icon('download')}JSON 내보내기</button>
        <label class="btn btn-ghost file-btn">${icon('upload')}JSON 불러오기<input type="file" accept="application/json,.json" id="import-file"></label>
      </div>
    </section>

    <section class="settings-section">
      <h3 class="sub-title">예시 데이터</h3>
      ${
        S.hasSample(state)
          ? `<p class="field-hint">처음 둘러보기용 예시 ${[sampleCount && `계획 ${sampleCount}개`, sampleFixed && `고정지출 ${sampleFixed}개`].filter(Boolean).join('와 ')}가 있어요. 직접 넣은 것은 그대로 남아요.</p>
             <button type="button" class="btn btn-danger-ghost btn-block" data-action="clear-sample">${icon('trash')}<span>예시 데이터 지우기</span></button>`
          : `<p class="field-hint">예시 데이터가 없어요.</p>`
      }
    </section>
    <p class="muted small center">미리 · 버전 ${VERSION} · 서버 없이 이 기기에서만 동작해요</p>`;
}

function bindSettingsSheet(body) {
  const form = body.querySelector('#settings-form');
  const vals = { ...state.settings, fixedItems: state.settings.fixedItems.map((it) => ({ ...it })) };
  const $sum = body.querySelector('#settings-sum');
  const $fixedList = body.querySelector('#fixed-list');
  const $presets = body.querySelector('#fixed-presets');
  const $fixedTotal = body.querySelector('#fixed-total');
  const PRESETS = ['넷플릭스', '스포티파이', '유튜브 프리미엄', '휴대폰 요금', '인터넷', '월세', '관리비', '보험'];

  const updateSum = () => {
    const fixed = C.fixedTotal(vals);
    $fixedTotal.textContent = `합계 ${won(fixed)}`;
    const left = vals.salary - fixed - vals.savings - vals.living;
    $sum.innerHTML = `매달 모으기·저축에 쓸 수 있는 돈 <b class="num ${left < 0 ? 'neg' : ''}">${won(left)}</b>`;
  };

  function renderFixed(focus) {
    $fixedList.innerHTML = vals.fixedItems.length
      ? vals.fixedItems
          .map(
            (it) => `
        <div class="fixed-row" data-fid="${esc(it.id)}">
          <input class="input fixed-name" maxlength="30" placeholder="이름" aria-label="항목 이름" value="${esc(it.name)}">
          <span class="money-input"><input class="fixed-amt" inputmode="numeric" placeholder="0" aria-label="${esc(it.name || '항목')} 금액" value="${it.amount ? C.formatWon(it.amount) : ''}"><span class="unit">원</span></span>
          <button type="button" class="icon-btn fixed-del" data-fixed-del aria-label="${esc(it.name || '항목')} 삭제">${icon('x')}</button>
        </div>`,
          )
          .join('')
      : '<p class="field-hint">아직 항목이 없어요. 아래에서 골라 추가하세요.</p>';
    for (const row of $fixedList.querySelectorAll('.fixed-row')) {
      const it = vals.fixedItems.find((x) => x.id === row.dataset.fid);
      row.querySelector('.fixed-name').addEventListener('input', (e) => (it.name = e.target.value));
      bindMoney(row.querySelector('.fixed-amt'), (v) => {
        it.amount = v;
        updateSum();
      });
    }
    const names = new Set(vals.fixedItems.map((it) => it.name.trim()));
    $presets.innerHTML =
      PRESETS.filter((n) => !names.has(n))
        .map((n) => `<button type="button" class="chip-btn" data-fixed-add="${n}">+ ${n}</button>`)
        .join('') + `<button type="button" class="chip-btn ghost" data-fixed-add="">+ 직접 입력</button>`;
    if (focus) {
      const row = $fixedList.querySelector(`[data-fid="${focus.id}"]`);
      row?.querySelector(focus.field).focus();
    }
    updateSum();
  }

  body.querySelector('#settings-form').addEventListener('click', (e) => {
    const add = e.target.closest('[data-fixed-add]');
    const del = e.target.closest('[data-fixed-del]');
    if (add) {
      const it = { id: S.newId(), name: add.dataset.fixedAdd, amount: 0 };
      vals.fixedItems.push(it);
      renderFixed({ id: it.id, field: it.name ? '.fixed-amt' : '.fixed-name' });
    } else if (del) {
      const id = del.closest('.fixed-row').dataset.fid;
      vals.fixedItems = vals.fixedItems.filter((it) => it.id !== id);
      renderFixed();
    }
  });
  renderFixed();

  for (const key of ['salary', 'savings', 'living']) {
    bindMoney(form.querySelector(`#${key}`), (v) => {
      vals[key] = v;
      updateSum();
    });
  }
  form.payday.addEventListener('change', () => (vals.payday = Number(form.payday.value)));
  updateSum();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fixedItems = vals.fixedItems
      .filter((it) => it.amount > 0)
      .map((it) => ({ ...it, name: it.name.trim() || '이름 없는 항목' }));
    commit({ ...state, settings: { ...vals, fixedItems, payday: Number(form.payday.value) } });
    toast('설정을 저장했어요');
  });

  body.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = S.importJSON(await file.text());
      if (!confirm(`계획 ${next.plans.length}개가 든 백업을 불러올까요?\n지금 데이터는 덮어써져요.`)) return;
      commit(next);
      toast('백업을 불러왔어요');
    } catch (err) {
      toast(err.message);
    }
  });

  body.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="export"]')) {
      const blob = new Blob([S.exportJSON(state)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `miri-backup-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('백업 파일을 내보냈어요');
    }
    const clear = e.target.closest('[data-action="clear-sample"]');
    if (clear) {
      if (!clear.dataset.confirm) {
        clear.dataset.confirm = '1';
        clear.querySelector('span').textContent = '한 번 더 누르면 지워요';
        return;
      }
      commit(S.clearSample(state));
      toast('예시 데이터를 지웠어요');
    }
  });
}

// ---------- 전역 이벤트 ----------

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'open-plan') openSheet('plan', el.dataset.id);
  else if (a === 'open-settings') {
    openSheet('settings');
    if (el.dataset.focus) $sheetRoot.querySelector(`#${el.dataset.focus}`)?.focus({ preventScroll: true });
  }
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'edit-salary') openSheet('salary', el.dataset.start);
  else if (a === 'spend-new') openSheet('spend');
  else if (a === 'spend-edit') openSheet('spend', el.dataset.id);
  else if (a === 'back' && cameFromApp) {
    e.preventDefault();
    history.back();
  }
});

// 앱 안에서 이동해 왔을 때만 뒤로 가기를 history.back()으로
let cameFromApp = false;
window.addEventListener('hashchange', () => (cameFromApp = true));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheet) closeSheet();
});

// 날짜가 바뀐 뒤 다시 열었을 때 숫자를 새로 계산
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const r = parseRoute();
    if (r.name !== 'new' && r.name !== 'edit' && !sheet) render();
  }
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  // 새 버전이 올라오면 바로 받아서 한 번 새로고침한다 (홈 화면 앱이 옛 화면에 머물지 않게)
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const r = parseRoute();
    if (!hadController || reloaded || r.name === 'new' || r.name === 'edit') return;
    reloaded = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch(() => {});
}

render();
