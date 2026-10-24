// 미리 — 화면
import * as C from './calc.js';
import * as S from './store.js';
import { CATEGORY_ICON, icon } from './icons.js';

const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const $tabbar = document.getElementById('tabbar');
const $toast = document.getElementById('toast');

// 설정 맨 아래에 보이는 버전. 화면이 안 바뀌면 이 값으로 새 버전을 받았는지 확인한다.
const VERSION = '2026.10.25-1';

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

function viewHome() {
  const t = today();
  const b = C.monthBudget(state, t);
  const sug = C.suggestAdjustments(state, t);
  const neg = b.spendable !== null && b.spendable < 0;
  const spendText = b.spendable === null ? '' : won(b.spendable);
  const upcoming = b.plans.filter((p) => p.status !== 'done').sort(byDue).slice(0, 3);
  const noSalary = !b.salary;

  $app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">${appMark()}</span>
        <div>
          <h1 class="brand-name">미리</h1>
          <p class="brand-sub num">${shortDate(b.period.start)} – ${shortDate(b.period.end)} 기준</p>
        </div>
      </div>
      <button class="icon-btn" data-action="open-settings" aria-label="설정 열기">${icon('sliders')}</button>
    </header>

    <section class="hero" aria-labelledby="hero-label">
      <p class="hero-label" id="hero-label">다음 월급날까지 쓸 수 있는 돈</p>
      ${
        b.spendable === null
          ? `<p class="hero-empty">지금 통장 잔고를 넣으면 계산해 드려요.</p>
             <button class="btn btn-primary btn-sm" data-action="open-settings" data-focus="balance">지금 잔고 입력하기</button>`
          : `<p class="hero-amount num ${neg ? 'neg' : ''} ${sizeClass(spendText)}">${spendText}</p>
             ${neg ? `<p class="hero-short">${icon('alertOctagon')}<span><b>부족</b> · 다음 월급날까지 ${won(-b.spendable)}이 모자라요</span></p>` : ''}
             <p class="hero-calc num">잔고 ${won(b.balance)} − 나갈 돈 ${won(b.pendingOut)} − 이번 달 모을 돈 ${won(b.months[0].reserve)}${b.months[0].shortfall ? ` − 월급 전 부족 ${won(b.months[0].shortfall)}` : ''}</p>
             ${
               b.balanceAge >= 2
                 ? `<button class="stale-btn" data-action="open-settings" data-focus="balance">${icon('clock')}<span>${b.balanceAge}일 전 잔고 기준 · <b>업데이트</b></span></button>`
                 : ''
             }`
      }
      <div class="hero-sub">
        <div class="hero-sub-row">
          <span>이번 달 예상 여유 예산</span>
          <b class="num ${b.free < 0 ? 'neg' : ''}">${b.free < 0 ? `${icon('alertOctagon')}부족 ` : ''}${won(b.free)}</b>
        </div>
        <p class="hero-note">${icon('info')}<span>월급에서 고정지출·적금·생활비·이번 달 준비금을 뺀 <b>예상 예산</b>이에요. 계좌 잔액이 아니에요.</span></p>
      </div>
      ${
        noSalary
          ? `<button class="btn btn-ghost btn-sm" data-action="open-settings">월급부터 입력하기</button>`
          : ''
      }
    </section>

    ${monthsMini(b)}

    <section class="card reserve-card">
      <div class="reserve-head">
        <span class="round-ic" aria-hidden="true">${icon('wallet')}</span>
        <div class="reserve-text">
          <p class="card-label">이번 달 확보해야 할 준비금</p>
          <p class="amount-lg num accent">${won(b.reserve)}</p>
        </div>
      </div>
      <p class="card-sub">${
        b.reserve === 0
          ? '이번 달에 따로 모을 준비금이 없어요.'
          : b.reserveLeft > 0
            ? `계획 ${b.plans.filter((p) => p.thisMonth > 0).length}개 · 아직 <b class="num">${won(b.reserveLeft)}</b> 더 확보해야 해요`
            : `${icon('checkCircle')} 이번 달 준비금을 모두 확보했어요`
      }</p>
    </section>

    ${splitCard(b)}
    ${sug ? suggestionCard(sug) : ''}

    <section class="section">
      <div class="section-head">
        <h2>다가오는 큰 지출</h2>
        ${state.plans.length ? `<a class="link" href="#/plans">전체 보기${icon('chevronRight')}</a>` : ''}
      </div>
      ${
        upcoming.length
          ? `<ul class="list-card">${upcoming.map(upcomingRow).join('')}</ul>`
          : `<div class="card empty"><p>${state.plans.length ? '모든 계획을 다 모았어요.' : '아직 계획이 없어요.'}</p><p class="card-sub">생일, 경조사, 여행처럼 미리 알고 있는 지출을 적어 두세요.</p></div>`
      }
    </section>

    <a class="btn btn-primary btn-block" href="#/new">${icon('plus')}새 계획 추가</a>
  `;
}

const RELATIVE = ['이번 달', '다음 달'];

const spendCell = (v) =>
  v < 0
    ? `<b class="num neg">${icon('alertOctagon')}부족 ${won(-v)}</b>`
    : `<b class="num accent">${won(v)}</b>`;

function monthsMini(b) {
  if (!b.salary && b.spendable === null) return '';
  return `
    <section class="card">
      <div class="section-head tight">
        <h2>달별 계획</h2>
        <a class="link" href="#/calendar">월별 전망${icon('chevronRight')}</a>
      </div>
      <ul class="month-mini">
        <li class="mm-head" aria-hidden="true"><span></span><span>모을 돈</span><span>쓸 수 있는 돈</span></li>
        ${b.months
          .slice(0, 3)
          .map(
            (m) => `<li>
              <span class="mm-label">${m.label}${RELATIVE[m.k] ? `<small>${RELATIVE[m.k]}</small>` : ''}</span>
              <span class="num"><span class="sr-only">모을 돈 </span>${won(m.reserve)}</span>
              <span><span class="sr-only">쓸 수 있는 돈 </span>${spendCell(m.spend)}</span>
            </li>`,
          )
          .join('')}
      </ul>
      <p class="card-sub small-note">쓸 수 있는 돈은 생활비를 포함한 금액이에요. ${
        b.spendable === null ? '' : '이번 달은 잔고 기준, '
      }다음 달부터는 월급 기준 예상이에요.</p>
    </section>`;
}

function appMark() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="var(--accent)"/><rect x="19" y="13" width="29" height="20" rx="5" fill="var(--on-accent)" fill-opacity=".5" transform="rotate(-8 33.5 23)"/><rect x="16" y="24" width="32" height="25" rx="5.5" fill="var(--on-accent)"/><path d="m24.5 36.5 5 5 9.5-10" fill="none" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function splitCard(b) {
  if (!b.salary) return '';
  const segs = [
    { key: 'fixed', label: `고정지출${state.settings.fixedItems.length ? ` · ${state.settings.fixedItems.length}개` : ''}`, v: b.fixed },
    { key: 'savings', label: '적금', v: b.savings },
    { key: 'living', label: '생활비', v: b.living },
    { key: 'reserve', label: '준비금', v: b.reserve },
    { key: 'free', label: '여유', v: Math.max(0, b.free) },
  ];
  const out = b.fixed + b.savings + b.living + b.reserve;
  const total = Math.max(b.salary, out);
  const pct = (v) => (total ? (v / total) * 100 : 0);
  return `
    <section class="card">
      <div class="section-head tight">
        <h2>월급이 나뉘는 모습</h2>
        <span class="muted num">${won(b.salary)}</span>
      </div>
      <div class="split ${out > b.salary ? 'over' : ''}" role="img" aria-label="${segs
        .map((s) => `${s.label} ${won(s.v)}`)
        .join(', ')}">
        ${segs
          .filter((s) => s.v > 0)
          .map((s) => `<i class="seg seg-${s.key}" style="width:${pct(s.v)}%"></i>`)
          .join('')}
        ${out > b.salary ? `<span class="split-limit" style="left:${pct(b.salary)}%"></span>` : ''}
      </div>
      ${
        out > b.salary
          ? `<p class="split-over">${icon('alertOctagon')}<span><b>부족</b> · 나갈 돈이 월급보다 <b class="num">${won(out - b.salary)}</b> 많아요 (세로선이 월급)</span></p>`
          : ''
      }
      <ul class="legend">
        ${segs
          .map(
            (s) => `<li><span class="dot seg-${s.key}" aria-hidden="true"></span><span class="legend-label">${s.label}</span><span class="legend-pct num">${Math.round((b.salary ? s.v / b.salary : 0) * 100)}%</span><span class="legend-v num">${won(s.key === 'free' ? b.free : s.v)}</span></li>`,
          )
          .join('')}
      </ul>
    </section>`;
}

function suggestionCard(sug) {
  const items = sug.items.filter((i) => i.needed);
  return `
    <section class="card alert-card" aria-labelledby="sug-title">
      <h2 id="sug-title" class="alert-title">${icon('alertOctagon')}<span><b>부족</b> · ${
        sug.shortfall
          ? `기한까지 ${won(sug.shortfall)}을 못 모아요`
          : `이번 달 ${won(sug.overspend)}을 줄여야 해요`
      }</span></h2>
      <p class="card-sub">자동으로 바꾸지 않아요. '희망' → '조정 가능' 순으로, 날짜를 늦추면 이번 달 준비금과 부족액이 이렇게 바뀌어요. '필수' 계획은 제안에서 뺐어요.</p>
      ${
        items.length
          ? `<ol class="sug-list">${items
              .map(
                (it) => `
          <li class="sug">
            <div class="sug-head">
              <b class="sug-name">${esc(it.name)}</b>${importanceTag(it.importance)}
            </div>
            <p class="sug-now">지금 ${dateLabel(it.dueDate)} · 이번 달 <b class="num">${won(it.monthly)}</b></p>
            <ul class="sug-opts">
              ${it.options
                .map(
                  (o) => `<li><span>+${o.months}개월 <span class="muted">${dateLabel(o.newDate)}</span></span><span class="num">이번 달 <b>${won(o.monthly)}</b> · ${o.deficitAfter > 0 ? `부족 ${won(o.deficitAfter)}` : '<b>부족 해결</b>'}</span></li>`,
                )
                .join('')}
            </ul>
            <a class="btn btn-ghost btn-sm" href="#/edit/${encodeURIComponent(it.id)}">${icon('pencil')}날짜 바꾸러 가기</a>
          </li>`,
              )
              .join('')}</ol>`
          : ''
      }
      <p class="sug-foot">${
        !sug.items.length
          ? sug.shortfall
            ? '희망·조정 가능 계획을 늦춰도 해결되지 않아요. 다음 월급 전에 필요한 계획에 이번 달 잔고가 모자라서 생긴 부족이에요. 잔고와 나갈 돈이 맞는지 확인하거나, 그 계획의 금액·날짜를 조정해 보세요.'
            : '늦춰서 줄일 수 있는 희망·조정 가능 계획이 없어요. 생활비나 적금 금액을 점검해 보세요.'
          : sug.uncovered > 0
            ? `희망·조정 가능 계획을 모두 3개월 늦춰도 <b class="num">${won(sug.uncovered)}</b>이 부족해요. 생활비나 적금도 함께 점검해 보세요.`
            : `위 ${items.length}개 계획을 3개월씩 늦추면 부족분을 메울 수 있어요.`
      }</p>
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

// ---------- 달력 (준비 중) ----------

function viewCalendar() {
  const b = C.monthBudget(state, today());
  $app.innerHTML = `
    <header class="topbar">
      <div>
        <h1 class="page-title">월별 전망</h1>
        <p class="brand-sub">달마다 모을 돈과 쓸 수 있는 돈 (생활비 포함)</p>
      </div>
    </header>
    ${b.months.map((m) => monthCard(m, b)).join('')}
    <p class="hero-note">${icon('info')}<span>계좌 잔액이 아닌 <b>예상</b>이에요. ${
      b.spendable === null ? '' : '이번 달은 입력한 잔고, '
    }다음 달부터는 월급 − 고정지출 − 적금 기준이에요. 계획이나 설정을 바꾸면 바로 다시 계산돼요.</span></p>
  `;
}

function monthCard(m, b) {
  const balanceMonth = m.k === 0 && b.spendable !== null;
  return `
    <section class="card month-card ${m.k === 0 ? 'current' : ''}">
      <div class="mc-head">
        <h2>${m.label}${RELATIVE[m.k] ? ` <span class="mc-rel">${RELATIVE[m.k]}</span>` : ''}</h2>
        <span class="muted small num">${shortDate(m.start)} – ${shortDate(m.end)}</span>
      </div>
      <div class="mc-grid">
        <div><p class="pv-label">모을 돈</p><p class="pv-value num">${won(m.reserve)}</p></div>
        <div><p class="pv-label">쓸 수 있는 돈</p><p class="pv-value">${spendCell(m.spend)}</p></div>
      </div>
      <p class="pv-note num">${
        balanceMonth
          ? `잔고 ${won(b.balance)} − 나갈 돈 ${won(b.pendingOut)} − 모을 돈${m.shortfall ? ' − 부족' : ''}`
          : m.extra === 0
            ? `생활비 ${won(b.living)}만큼 쓸 수 있어요`
            : m.extra > 0
            ? `생활비 ${won(b.living)}을 쓰고도 ${won(m.extra)} 더 남아요`
            : `생활비 ${won(b.living)}보다 ${won(-m.extra)} 적어요`
      }</p>
      ${
        m.allocs.length
          ? `<div class="mc-list"><p class="mc-list-title">모으기</p><ul>${m.allocs
              .map(
                (a) =>
                  `<li><button class="mc-item" data-action="open-plan" data-id="${esc(a.id)}"><span>${esc(a.name)}</span><b class="num">${won(a.amount)}</b></button></li>`,
              )
              .join('')}</ul></div>`
          : ''
      }
      ${
        m.dues.length
          ? `<div class="mc-list"><p class="mc-list-title">지출 예정</p><ul>${m.dues
              .map(
                (d) =>
                  `<li><button class="mc-item" data-action="open-plan" data-id="${esc(d.id)}"><span>${esc(d.name)}</span><b class="num">${won(d.amount)}</b></button>${
                    d.shortfall
                      ? `<span class="short-line">${icon('alertOctagon')}<span><b>부족</b> · ${won(d.shortfall)}을 못 모아요</span></span>`
                      : ''
                  }</li>`,
              )
              .join('')}</ul></div>`
          : ''
      }
      ${!m.allocs.length && !m.dues.length ? '<p class="muted small">모을 돈도 나갈 큰 지출도 없어요.</p>' : ''}
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
      const spendChanged = pv.spendableBefore !== null && pv.spendableBefore !== pv.spendableAfter;
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
            ? `<p class="pv-note">다음 월급 전에 필요한 날짜라 남은 금액을 이번 달에 모두 준비해요.</p>`
            : ''
        }
        <div class="pv-free">
          <p class="pv-label">${editing ? '수정하면' : '추가하면'} 여유 예산</p>
          <p class="pv-change num"><span>${won(pv.freeBefore)}</span>${icon('chevronRight')}<b class="${neg ? 'neg' : 'accent'}">${won(pv.freeAfter)}</b></p>
          ${neg ? `<p class="pv-warn">${icon('alertOctagon')}<span><b>부족</b> · 여유 예산이 마이너스가 돼요. 저장한 뒤 홈에서 조정 제안을 볼 수 있어요.</span></p>` : ''}
          ${
            spendChanged
              ? `<p class="pv-label">다음 월급날까지 쓸 수 있는 돈</p>
                 <p class="pv-change num"><span>${won(pv.spendableBefore)}</span>${icon('chevronRight')}<b class="${pv.spendableAfter < 0 ? 'neg' : 'accent'}">${won(pv.spendableAfter)}</b></p>`
              : ''
          }
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

function openSheet(type, id = null) {
  sheet = { type, id, opener: document.activeElement };
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
  fillSheet();
}

function fillSheet() {
  const sheetEl = $sheetRoot.querySelector('.sheet');
  const body = $sheetRoot.querySelector('.sheet-body');
  const scroll = sheetEl.scrollTop;
  if (sheet.type === 'plan') {
    body.innerHTML = planSheetHTML(sheet.id);
    bindPlanSheet(body, sheet.id);
  } else {
    body.innerHTML = settingsSheetHTML();
    bindSettingsSheet(body);
  }
  sheetEl.scrollTop = scroll;
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
      <div class="balance-box">
        <div class="field">
          <label class="field-label" for="balance">지금 통장 잔고</label>
          ${moneyField('balance', s.balance, '0')}
          <span class="field-hint">${
            C.hasBalance(s) ? `${dateLabel(s.balanceUpdatedAt, { year: true })}에 고쳤어요. ` : ''
          }은행 앱을 보고 직접 적어요. 이미 확보해 둔 준비금은 빼고, 쓰는 통장 잔고만요.</span>
        </div>
        <div class="field">
          <label class="field-label" for="pendingOut">다음 월급 전까지 아직 나갈 돈</label>
          ${moneyField('pendingOut', s.pendingOut)}
          <span class="field-hint">카드값, 아직 안 빠진 고정지출 등의 합계. 잔고를 고칠 때 같이 고쳐 주세요.</span>
        </div>
      </div>
      <div class="field">
        <label class="field-label" for="salary">월 실수령액</label>
        ${moneyField('salary', s.salary)}
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
    $sum.innerHTML = `준비금을 빼기 전 남는 돈 <b class="num ${left < 0 ? 'neg' : ''}">${won(left)}</b>`;
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

  let balanceTouched = false;
  for (const key of ['balance', 'pendingOut']) {
    bindMoney(form.querySelector(`#${key}`), (v) => {
      vals[key] = v;
      balanceTouched = true;
    });
  }

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
    const balance = balanceTouched
      ? { balance: vals.balance || 0, balanceUpdatedAt: today() }
      : { balance: state.settings.balance, balanceUpdatedAt: state.settings.balanceUpdatedAt };
    commit({ ...state, settings: { ...vals, ...balance, fixedItems, payday: Number(form.payday.value) } });
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
