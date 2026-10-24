// 미리 — 계산 로직. DOM에 의존하지 않는 순수 함수만 둔다.
// 날짜는 모두 로컬 기준 'YYYY-MM-DD' 문자열로 다룬다 (문자열 비교 = 날짜 비교).

export const CATEGORIES = ['선물', '경조사', '여행', '건강', '전자제품', '기타'];

export const IMPORTANCE = {
  must: '필수',
  flex: '조정 가능',
  wish: '희망',
};

// 계획의 진행 단계. '준비 중'만 준비금·여유 예산 계산에 들어간다.
export const STAGES = {
  active: '준비 중',
  spent: '지출 완료',
  cancelled: '취소',
};

export const isActive = (plan) => (plan.stage || 'active') === 'active';

// ---------- 날짜 ----------

const pad = (n) => String(n).padStart(2, '0');

export function fmtDate(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parseDate(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDayOfMonth(y, m);
}

// 오늘 날짜는 기기 시간대와 상관없이 한국 시간 기준
export function todayStr(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// m은 1~12
export function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function shiftMonth(y, m, delta) {
  const t = y * 12 + (m - 1) + delta;
  return { y: Math.floor(t / 12), m: (((t % 12) + 12) % 12) + 1 };
}

function toUTC(s) {
  const { y, m, d } = parseDate(s);
  return Date.UTC(y, m - 1, d);
}

export function addDays(s, n) {
  const t = new Date(toUTC(s) + n * 86400000);
  return fmtDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// b - a (일)
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

// 달을 더하되, 없는 날짜는 그 달 말일로 맞춘다 (1/31 + 1개월 = 2/28)
export function addMonths(s, k) {
  const { y, m, d } = parseDate(s);
  const t = shiftMonth(y, m, k);
  return fmtDate(t.y, t.m, Math.min(d, lastDayOfMonth(t.y, t.m)));
}

// 그 달의 실제 월급날. 급여일 29~31일은 짧은 달에 말일로 보정.
export function paydayIn(y, m, payday) {
  return fmtDate(y, m, Math.min(payday, lastDayOfMonth(y, m)));
}

// 오늘이 속한 "한 달": 월급날 ~ 다음 월급 전날
export function currentPeriod(today, payday) {
  let { y, m } = parseDate(today);
  let start = paydayIn(y, m, payday);
  if (today < start) {
    ({ y, m } = shiftMonth(y, m, -1));
    start = paydayIn(y, m, payday);
  }
  const n = shiftMonth(y, m, 1);
  const nextPayday = paydayIn(n.y, n.m, payday);
  return { start, end: addDays(nextPayday, -1), nextPayday };
}

export function isPastDate(date, today) {
  return date < today;
}

// 준비 횟수: 이번 달(1회) + 필요한 날짜 전에 돌아오는 월급날 수
export function prepCount(dueDate, today, payday) {
  const { nextPayday } = currentPeriod(today, payday);
  let { y, m } = parseDate(nextPayday);
  let pd = nextPayday;
  let count = 1;
  while (pd < dueDate && count < 1200) {
    count++;
    ({ y, m } = shiftMonth(y, m, 1));
    pd = paydayIn(y, m, payday);
  }
  return count;
}

// ---------- 금액 ----------

export function formatWon(n) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return v < 0 ? `-${s}` : s;
}

export function parseWon(s) {
  const digits = String(s ?? '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

// 회차별 금액: ceil(total / count)씩, 마지막 회차에서 오차를 맞춘다
export function installments(total, count) {
  if (total <= 0) return [];
  const n = Math.max(1, count);
  const base = Math.ceil(total / n);
  const out = [];
  let left = total;
  for (let i = 0; i < n && left > 0; i++) {
    const x = i === n - 1 ? left : Math.min(base, left);
    out.push(x);
    left -= x;
  }
  return out;
}

// ---------- 계획 ----------

export function savedTotal(plan) {
  return (plan.history || []).reduce((s, h) => s + h.delta, 0);
}

// 이번 기간이 시작되기 전까지 모은 금액 (처음 확보액 포함)
function savedBefore(plan, periodStart) {
  return (plan.history || [])
    .filter((h) => h.kind === 'initial' || h.date < periodStart)
    .reduce((s, h) => s + h.delta, 0);
}

export function planMonth(plan, settings, today) {
  const period = currentPeriod(today, settings.payday);
  const target = plan.amount;
  const saved = savedTotal(plan);
  const remaining = Math.max(0, target - saved);
  // 이번 달에 빼간 돈이 있으면 기준선도 같이 내려간다
  const base = Math.min(target, savedBefore(plan, period.start), saved);
  const remainingAtStart = Math.max(0, target - base);
  const savedThisPeriod = saved - base;
  const overdue = plan.dueDate < today;
  const count = overdue ? 1 : prepCount(plan.dueDate, today, settings.payday);
  const monthlyNeed = Math.ceil(remainingAtStart / count);
  const thisMonthLeft = Math.min(remaining, Math.max(0, monthlyNeed - savedThisPeriod));
  const dday = daysBetween(today, plan.dueDate);
  const progress = target > 0 ? Math.min(1, saved / target) : 0;
  const info = {
    ...plan,
    saved,
    remaining,
    remainingAtStart,
    savedThisPeriod,
    overdue,
    count,
    monthlyNeed,
    thisMonthLeft,
    schedule: installments(remainingAtStart, count),
    dday,
    progress,
  };
  info.status = planStatus(info);
  return info;
}

// 'done' | 'short' | 'warn' | 'ok'
export function planStatus(p) {
  if (p.remaining <= 0) return 'done';
  if (p.overdue) return 'short';
  if (p.count === 1) return p.dday <= 7 ? 'short' : 'warn';
  const baseline = p.baselineMonthly || 0;
  if (baseline > 0 && p.monthlyNeed > baseline * 1.2 && p.monthlyNeed - baseline >= 10000) {
    return 'warn';
  }
  return 'ok';
}

// ---------- 예산 ----------

// 고정지출은 항목(넷플릭스, 휴대폰 요금 …)의 합계. 예전 형식(합계 하나)도 받아 준다.
export function fixedTotal(settings) {
  if (Array.isArray(settings.fixedItems)) {
    return settings.fixedItems.reduce((sum, it) => sum + (it.amount || 0), 0);
  }
  return settings.fixed || 0;
}

export function monthBudget(state, today) {
  const s = state.settings;
  const period = currentPeriod(today, s.payday);
  const plans = state.plans.filter(isActive).map((p) => planMonth(p, s, today));
  const reserve = plans.reduce((sum, p) => sum + p.monthlyNeed, 0);
  const reserveLeft = plans.reduce((sum, p) => sum + p.thisMonthLeft, 0);
  const fixed = fixedTotal(s);
  const free = s.salary - fixed - s.savings - s.living - reserve;
  return {
    period,
    salary: s.salary,
    fixed,
    savings: s.savings,
    living: s.living,
    reserve,
    reserveLeft,
    free,
    plans,
  };
}

// 추가/수정 화면 미리보기: 이 계획을 넣으면 여유 예산이 어떻게 바뀌는지
export function previewPlan(state, draft, today, editingId = null) {
  const freeBefore = monthBudget(state, today).free;
  const others = state.plans.filter((p) => p.id !== editingId);
  const freeAfter = monthBudget({ ...state, plans: [...others, draft] }, today).free;
  const pm = planMonth(draft, state.settings, today);
  return {
    count: pm.count,
    monthly: pm.monthlyNeed,
    schedule: pm.schedule,
    freeBefore,
    freeAfter,
  };
}

// 저장 전 검사. 문제가 없으면 빈 배열.
export function validatePlan(draft, today, { minAmount = 0 } = {}) {
  const errors = [];
  if (!String(draft.name || '').trim()) errors.push('목표 이름을 입력해 주세요.');
  if (!(draft.amount > 0)) errors.push('목표 금액은 0원보다 커야 해요.');
  if (!draft.dueDate || !isValidDate(draft.dueDate)) errors.push('필요한 날짜를 골라 주세요.');
  else if (isPastDate(draft.dueDate, today)) errors.push('지난 날짜는 고를 수 없어요.');
  if (draft.saved < 0) errors.push('확보한 금액은 0원 이상이어야 해요.');
  if (draft.amount > 0 && draft.saved > draft.amount) {
    errors.push('이미 확보한 금액이 목표 금액보다 커요.');
  }
  if (minAmount > 0 && draft.amount > 0 && draft.amount < minAmount) {
    errors.push(`목표 금액은 지금까지 확보한 ${formatWon(minAmount)}원보다 작을 수 없어요.`);
  }
  return errors;
}

// 여유 예산이 마이너스일 때: '희망' → '조정 가능' 순으로 날짜를 늦추는 제안.
// '필수'는 제외. 아무것도 바꾸지 않고 숫자만 돌려준다.
export function suggestAdjustments(state, today, delays = [1, 2, 3]) {
  const b = monthBudget(state, today);
  if (b.free >= 0) return null;
  const deficit = -b.free;
  const order = { wish: 0, flex: 1 };
  const items = b.plans
    .filter((p) => p.importance in order && p.monthlyNeed > 0 && !p.overdue)
    .sort((a, c) => order[a.importance] - order[c.importance] || c.monthlyNeed - a.monthlyNeed)
    .map((p) => ({
      id: p.id,
      name: p.name,
      importance: p.importance,
      dueDate: p.dueDate,
      monthly: p.monthlyNeed,
      options: delays.map((k) => {
        const newDate = addMonths(p.dueDate, k);
        const count = prepCount(newDate, today, state.settings.payday);
        const monthly = Math.ceil(p.remainingAtStart / count);
        return { months: k, newDate, count, monthly, saving: p.monthlyNeed - monthly };
      }),
    }));

  // 앞에서부터 가장 길게 늦췄을 때, 몇 번째 계획까지 손대면 부족분이 메워지는지
  let covered = 0;
  for (const it of items) {
    it.needed = covered < deficit;
    covered += it.options[it.options.length - 1].saving;
  }
  return {
    deficit,
    items,
    maxSaving: covered,
    uncovered: Math.max(0, deficit - covered),
  };
}
