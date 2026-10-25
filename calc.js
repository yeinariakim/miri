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

// 그 달(월급 주기 시작일 기준) 월급. 기본 월급(야근·보너스 제외)을 쓰고,
// 실제로 받은 금액을 그 달만 적어 두었으면 그 값을 쓴다.
export function salaryFor(settings, start) {
  const v = settings.salaryOverrides?.[start];
  return typeof v === 'number' ? v : settings.salary;
}

// 그 달 고정지출 항목. 기본 금액을 쓰고, 그 달만 고친 항목(보너스 달 십일조 등)은 그 값을 쓴다.
export function fixedItemsFor(settings, start) {
  const o = settings.fixedOverrides?.[start] || {};
  return (settings.fixedItems || []).map((it) => {
    const edited = typeof o[it.id] === 'number';
    return { ...it, base: it.amount, amount: edited ? o[it.id] : it.amount, edited };
  });
}

export function fixedFor(settings, start) {
  if (!Array.isArray(settings.fixedItems)) return fixedTotal(settings);
  return fixedItemsFor(settings, start).reduce((sum, it) => sum + (it.amount || 0), 0);
}

// 매달 준비 가능 금액 = 월급 - 고정지출 - 적금 - 생활비
function rawCapacity(settings, start) {
  return salaryFor(settings, start) - fixedFor(settings, start) - settings.savings - settings.living;
}

export function monthlyCapacity(settings, start) {
  return Math.max(0, rawCapacity(settings, start));
}

// ---------- 이번 달 지출 ----------
// 지출은 어디서 나갔는지에 따라 빠지는 곳이 다르다.
//   생활비: 생활비 예산에서 빠지고, 넘긴 만큼만 남는 돈에서 빠진다.
//   계획:   그 계획에 모아 둔 돈에서 나간다. 더 쓰면 차이만 남는 돈에서 빠지고, 덜 쓰면 남은 돈이 돌아온다.
//   그 외:  계획에 없던 큰 돈. 남는 돈에서 바로 빠진다.
//   들어온 돈: 남는 돈에 더해진다.
export const SOURCES = { living: '생활비', plan: '계획', other: '그 외', income: '들어온 돈' };

export function spendSummary(state, start, end) {
  const s = state.settings;
  const savedLeft = new Map(); // 같은 계획에서 두 번 쓰면 모아 둔 돈을 나눠 쓴다
  const list = spendsIn(state.spends, start, end).map((x) => {
    const source = x.source in SOURCES ? x.source : 'other';
    if (source !== 'plan') return { ...x, source };
    const plan = state.plans.find((p) => p.id === x.planId);
    if (!savedLeft.has(x.planId)) savedLeft.set(x.planId, plan ? Math.max(0, savedTotal(plan)) : 0);
    const fromSaved = Math.min(x.amount, savedLeft.get(x.planId));
    savedLeft.set(x.planId, savedLeft.get(x.planId) - fromSaved);
    return { ...x, source, planName: plan?.name, fromSaved, extra: x.amount - fromSaved };
  });
  // 계획에서 쓰고 남은 돈은 돌아온다
  let returned = 0;
  for (const [id, left] of savedLeft) {
    const plan = state.plans.find((p) => p.id === id);
    if (plan && !isActive(plan)) returned += left;
  }
  const sum = (src) => list.filter((x) => x.source === src).reduce((a, x) => a + x.amount, 0);
  const living = sum('living');
  const other = sum('other');
  const income = sum('income');
  const planExtra = list.filter((x) => x.source === 'plan').reduce((a, x) => a + x.extra, 0);
  const livingOver = Math.max(0, living - s.living);
  return {
    list,
    living,
    livingLeft: s.living - living,
    livingOver,
    other,
    income,
    planExtra,
    returned,
    // 남는 돈에서 더 빠지는 돈 (음수면 더해짐)
    hit: other + livingOver + planExtra - income - returned,
  };
}

// 월급 주기 k번째(0 = 이번 달)의 시작일
export function periodStarts(today, payday, n) {
  const { start, nextPayday } = currentPeriod(today, payday);
  const out = [start];
  let { y, m } = parseDate(nextPayday);
  for (let k = 1; k < n; k++) {
    out.push(paydayIn(y, m, payday));
    ({ y, m } = shiftMonth(y, m, 1));
  }
  return out;
}

// 화면에 쓰는 달 이름: 그 월급 주기의 대부분이 걸친 달 (25일 월급이면 9/25~10/24 → 10월)
export function periodLabel(start) {
  return `${parseDate(addDays(start, 15)).m}월`;
}

const IMPORTANCE_ORDER = { must: 0, flex: 1, wish: 2 };

// 준비금 배분: 기한 빠른 계획부터, 기한 전 월급 주기마다 고르게 나눈 몫을 채운다.
// 그 달 준비 가능 금액이 모자라면 모자란 몫은 뒤 달로 넘기고, 기한까지도 못 채우면
// 앞쪽에 남은 자리를 마저 쓴다. 그래도 남으면 부족.
// used0: 이번 달에 이미 쓴 몫(이번 달 지출, 이번 달에 이미 확보한 돈). 이번 달 준비 가능 금액에서 뺀다.
export function allocate(plans, settings, today, used0 = 0) {
  const order = [...plans].sort(
    (a, b) =>
      (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0) ||
      IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')),
  );
  const n = Math.max(1, ...plans.map((p) => p.count));
  const starts = periodStarts(today, settings.payday, n);
  const left = starts.map((start, k) => (k === 0 ? Math.max(0, rawCapacity(settings, start) - used0) : monthlyCapacity(settings, start)));
  const result = new Map();

  for (const p of order) {
    const alloc = Array(p.count).fill(0);
    const want = [p.thisMonthLeft, ...installments(p.remaining - p.thisMonthLeft, p.count - 1)];
    let carry = 0;
    for (let k = 0; k < p.count; k++) {
      const need = (want[k] || 0) + carry;
      const put = Math.min(need, left[k]);
      alloc[k] += put;
      left[k] -= put;
      carry = need - put;
    }
    for (let k = p.count - 1; k >= 0 && carry > 0; k--) {
      const put = Math.min(carry, left[k]);
      alloc[k] += put;
      left[k] -= put;
      carry -= put;
    }
    result.set(p.id, { alloc, shortfall: carry });
  }
  return { byId: result, left };
}

export function monthBudget(state, today) {
  const s = state.settings;
  const period = currentPeriod(today, s.payday);
  const base = state.plans.filter(isActive).map((p) => planMonth(p, s, today));
  const spent = spendSummary(state, period.start, period.end);
  // 끝난 계획이라도 이번 달에 확보한 돈은 이번 달 월급에서 떼어 둔 돈
  const closedNow = state.plans
    .filter((p) => !isActive(p))
    .map((p) => planMonth(p, s, today))
    .filter((p) => p.savedThisPeriod > 0)
    .map((p) => ({ id: p.id, name: p.name, amount: p.savedThisPeriod }));
  const savedNow =
    base.reduce((a, p) => a + Math.max(0, p.savedThisPeriod), 0) + closedNow.reduce((a, x) => a + x.amount, 0);
  const { byId } = allocate(base, s, today, spent.hit + savedNow);
  const starts = periodStarts(today, s.payday, Math.max(1, ...base.map((p) => p.count)));

  const plans = base.map((p) => {
    const { alloc, shortfall } = byId.get(p.id);
    const info = {
      ...p,
      thisMonthLeft: alloc[0],
      thisMonth: p.savedThisPeriod + alloc[0],
      schedule: alloc.map((amount, k) => ({
        start: starts[k],
        label: periodLabel(starts[k]),
        amount: k === 0 ? p.savedThisPeriod + amount : amount,
      })),
      shortfall,
    };
    info.status = p.remaining <= 0 ? 'done' : shortfall > 0 ? 'short' : p.status;
    return info;
  });

  const months = monthlyOutlook(s, plans, starts, spent, closedNow);
  const now = months[0];
  return {
    period,
    salary: now.salary,
    salaryBase: s.salary,
    fixed: now.fixed,
    savings: s.savings,
    living: s.living,
    capacity: monthlyCapacity(s, period.start),
    reserve: now.reserve,
    reserveLeft: plans.reduce((sum, p) => sum + p.thisMonthLeft, 0),
    shortfall: plans.reduce((sum, p) => sum + p.shortfall, 0),
    spent,
    // 이번 달 남는 돈 (저축할 돈)
    free: now.left,
    months,
    plans,
  };
}

// 월별 전망: 월급 주기마다 모을 돈과 남는 돈(저축할 돈).
//   남는 돈 = 월급 - 고정지출 - 적금 - 생활비 - 모을 돈 - 그 달이 기한인데 못 채운 금액
//   이번 달은 여기에 이번 달 지출(그 외, 생활비 초과, 계획 초과)을 빼고 들어온 돈을 더한다.
export function monthlyOutlook(settings, plans, starts, spent = null, closedNow = []) {
  const n = Math.max(6, starts.length);
  const all = [...starts];
  while (all.length < n + 1) {
    const { y, m } = parseDate(all[all.length - 1]);
    const t = shiftMonth(y, m, 1);
    all.push(paydayIn(t.y, t.m, settings.payday));
  }
  return Array.from({ length: n }, (_, k) => {
    const salary = salaryFor(settings, all[k]);
    const fixedItems = fixedItemsFor(settings, all[k]);
    const fixed = fixedFor(settings, all[k]);
    const allocs = [
      ...plans
        .filter((p) => (p.schedule[k]?.amount || 0) > 0)
        .map((p) => ({ id: p.id, name: p.name, amount: p.schedule[k].amount })),
      ...(k === 0 ? closedNow : []),
    ];
    const dues = plans
      .filter((p) => p.count - 1 === k)
      .map((p) => ({ id: p.id, name: p.name, amount: p.amount, shortfall: p.shortfall }));
    const reserve = allocs.reduce((sum, a) => sum + a.amount, 0);
    const shortfall = dues.reduce((sum, d) => sum + d.shortfall, 0);
    const hit = k === 0 && spent ? spent.hit : 0;
    const left = salary - fixed - settings.savings - settings.living - reserve - shortfall - hit;
    return {
      k,
      start: all[k],
      end: addDays(all[k + 1], -1),
      label: periodLabel(all[k]),
      salary,
      salaryEdited: salary !== settings.salary || typeof settings.salaryOverrides?.[all[k]] === 'number',
      fixed,
      fixedItems,
      living: settings.living,
      spent: k === 0 ? spent : null,
      hit,
      reserve,
      left,
      allocs,
      dues,
      shortfall,
    };
  });
}

// 추가/수정 화면 미리보기: 이 계획을 넣으면 남는 돈과 배분이 어떻게 바뀌는지
export function previewPlan(state, draft, today, editingId = null) {
  const before = monthBudget(state, today);
  const others = state.plans.filter((p) => p.id !== editingId);
  const after = monthBudget({ ...state, plans: [...others, draft] }, today);
  const p = after.plans.find((x) => x.id === draft.id);
  return {
    count: p.count,
    monthly: p.thisMonth,
    schedule: p.schedule,
    shortfall: p.shortfall,
    freeBefore: before.free,
    freeAfter: after.free,
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

// 기한까지 못 모으는 계획이 있거나 여유 예산이 마이너스일 때:
// '희망' → '조정 가능' 순으로 날짜를 늦추면 어떻게 되는지 제안. '필수'는 제외.
// 아무것도 바꾸지 않고 숫자만 돌려준다.
export function suggestAdjustments(state, today, delays = [1, 2, 3]) {
  const deficitOf = (b) => b.shortfall + Math.max(0, -b.free);
  const b = monthBudget(state, today);
  const deficit = deficitOf(b);
  if (deficit <= 0) return null;
  const order = { wish: 0, flex: 1 };
  const items = b.plans
    .filter((p) => p.importance in order && p.remaining > 0 && !p.overdue)
    .sort((a, c) => order[a.importance] - order[c.importance] || c.thisMonth - a.thisMonth)
    .map((p) => ({
      id: p.id,
      name: p.name,
      importance: p.importance,
      dueDate: p.dueDate,
      monthly: p.thisMonth,
      options: delays.map((k) => {
        const newDate = addMonths(p.dueDate, k);
        const plans = state.plans.map((x) => (x.id === p.id ? { ...x, dueDate: newDate } : x));
        const nb = monthBudget({ ...state, plans }, today);
        const np = nb.plans.find((x) => x.id === p.id);
        return {
          months: k,
          newDate,
          count: np.count,
          monthly: np.thisMonth,
          saving: p.thisMonth - np.thisMonth,
          deficitAfter: deficitOf(nb),
        };
      }),
    }))
    // 늦춰도 부족이 줄지 않는 계획은 제안하지 않는다
    .filter((it) => it.options[it.options.length - 1].deficitAfter < deficit);

  // 앞에서부터 가장 길게 늦췄을 때, 몇 번째 계획까지 손대면 부족분이 메워지는지 (어림)
  let covered = 0;
  for (const it of items) {
    it.needed = covered < deficit;
    covered += Math.max(0, deficit - it.options[it.options.length - 1].deficitAfter);
  }
  return {
    deficit,
    shortfall: b.shortfall,
    overspend: Math.max(0, -b.free),
    items,
    uncovered: Math.max(0, deficit - covered),
  };
}

// ---------- 지출 기록 ----------

// "렌즈 30", "비행기 55만", "축의 200,000원" 같은 줄(쉼표·줄바꿈으로 여러 개)을 읽는다.
// 단위 없이 1만 미만 숫자면 만원 단위로 본다.
export function parseSpendLines(text) {
  const items = [];
  const errors = [];
  for (const raw of String(text || '').split(/\n|,(?!\d{3})/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.*?)\s*([\d][\d,]*(?:\.\d+)?)\s*(만\s*원|만|원)?$/);
    const name = m ? m[1].trim() : '';
    if (!m || !name) {
      errors.push(line);
      continue;
    }
    const n = Number(m[2].replace(/,/g, ''));
    const unit = (m[3] || '').replace(/\s/g, '');
    const amount = Math.round(unit.startsWith('만') || (!unit && n < 10000) ? n * 10000 : n);
    if (!(amount > 0)) {
      errors.push(line);
      continue;
    }
    items.push({ name: name.slice(0, 30), amount });
  }
  return { items, errors };
}

// 월급 주기 [start, end] 안의 메모
export function spendsIn(spends, start, end) {
  return (spends || []).filter((x) => x.date >= start && x.date <= end);
}
