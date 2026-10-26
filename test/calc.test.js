import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  currentPeriod,
  installments,
  monthBudget,
  parseWon,
  periodLabel,
  parseSpendLines,
  salaryFor,
  spendsIn,
  paydayIn,
  planMonth,
  prepCount,
  previewPlan,
  suggestAdjustments,
  todayStr,
  validatePlan,
} from '../calc.js';

const settings = { salary: 3000000, payday: 25, fixed: 600000, savings: 500000, living: 1200000 };

function plan(id, amount, dueDate, opts = {}) {
  const history = [];
  if (opts.saved) history.push({ id: `${id}-i`, date: '2026-01-01', delta: opts.saved, kind: 'initial' });
  for (const h of opts.history || []) history.push({ id: `${id}-${h.date}`, kind: 'manual', ...h });
  return {
    id,
    name: id,
    category: '기타',
    amount,
    dueDate,
    importance: opts.importance || 'must',
    baselineMonthly: opts.baselineMonthly || 0,
    history,
  };
}

test('한 달 기준: 월급날 당일부터 다음 월급 전날까지', () => {
  assert.deepEqual(currentPeriod('2026-10-25', 25), {
    start: '2026-10-25',
    end: '2026-11-24',
    nextPayday: '2026-11-25',
  });
  // 월급날 전이면 지난달 월급날부터
  assert.deepEqual(currentPeriod('2026-10-24', 25), {
    start: '2026-09-25',
    end: '2026-10-24',
    nextPayday: '2026-10-25',
  });
  // 연도 넘어감
  assert.equal(currentPeriod('2027-01-10', 25).start, '2026-12-25');
});

test('필요한 날짜가 이번 달이면 1회, 남은 금액 전액', () => {
  const today = '2026-10-26';
  assert.equal(prepCount('2026-11-20', today, 25), 1);
  assert.equal(prepCount('2026-11-24', today, 25), 1); // 다음 월급 전날까지는 이번 달
  const p = planMonth(plan('a', 300000, '2026-11-20', { saved: 50000 }), settings, today);
  assert.equal(p.count, 1);
  assert.equal(p.monthlyNeed, 250000);
  assert.deepEqual(p.schedule, [250000]);
});

test('필요한 날짜가 다음 달이면 이번 달 포함 2회', () => {
  const today = '2026-10-26';
  assert.equal(prepCount('2026-11-25', today, 25), 1); // 월급날 당일은 "전에"가 아님
  assert.equal(prepCount('2026-11-26', today, 25), 2);
  assert.equal(prepCount('2026-12-24', today, 25), 2);
  const p = planMonth(plan('a', 300001, '2026-12-10'), settings, today);
  assert.equal(p.count, 2);
  assert.equal(p.monthlyNeed, 150001); // ceil
  assert.deepEqual(p.schedule, [150001, 150000]); // 마지막 회차에서 오차 맞춤
});

test('지난 날짜는 저장할 수 없고, 이미 지난 계획은 전액·부족 처리', () => {
  const today = '2026-10-26';
  const errors = validatePlan({ name: '엄마 생신', amount: 100000, dueDate: '2026-10-25', saved: 0 }, today);
  assert.ok(errors.includes('지난 날짜는 고를 수 없어요.'));
  assert.deepEqual(validatePlan({ name: '오늘', amount: 100000, dueDate: today, saved: 0 }, today), []);

  const p = planMonth(plan('a', 100000, '2026-10-20', { saved: 30000 }), settings, today);
  assert.equal(p.overdue, true);
  assert.equal(p.count, 1);
  assert.equal(p.monthlyNeed, 70000);
  assert.equal(p.status, 'short');
});

test('저장 막기: 빈 이름, 0원, 확보액이 목표보다 큼', () => {
  const today = '2026-10-26';
  const base = { name: '선물', amount: 100000, dueDate: '2026-12-01', saved: 0 };
  assert.equal(validatePlan({ ...base, name: '  ' }, today).length, 1);
  assert.equal(validatePlan({ ...base, amount: 0 }, today).length, 1);
  assert.equal(validatePlan({ ...base, saved: 100001 }, today).length, 1);
  assert.equal(validatePlan({ ...base, saved: 100000 }, today).length, 0);
});

test('급여일 31일은 짧은 달에 말일로 보정', () => {
  assert.equal(paydayIn(2027, 2, 31), '2027-02-28');
  assert.equal(paydayIn(2028, 2, 31), '2028-02-29');
  assert.equal(paydayIn(2026, 4, 31), '2026-04-30');
  assert.equal(paydayIn(2026, 5, 31), '2026-05-31');
  assert.equal(paydayIn(2026, 2, 29), '2026-02-28');

  assert.deepEqual(currentPeriod('2027-02-28', 31), {
    start: '2027-02-28',
    end: '2027-03-30',
    nextPayday: '2027-03-31',
  });
  assert.deepEqual(currentPeriod('2027-02-27', 31), {
    start: '2027-01-31',
    end: '2027-02-27',
    nextPayday: '2027-02-28',
  });
  // 4/30 이후 → 다음 월급은 5/31, 그 다음 6/30
  assert.equal(prepCount('2026-06-30', '2026-04-30', 31), 2);
  assert.equal(prepCount('2026-07-01', '2026-04-30', 31), 3);
});

test('여러 목표 합산', () => {
  const today = '2026-10-26';
  const state = {
    settings,
    plans: [
      plan('a', 200000, '2026-11-20'), // 1회 → 200,000
      plan('b', 300000, '2026-12-10', { saved: 100000 }), // 2회 → 100,000
      plan('c', 1000000, '2027-01-20'), // 3회 → 333,334
    ],
  };
  const b = monthBudget(state, today);
  assert.deepEqual(b.plans.map((p) => p.monthlyNeed), [200000, 100000, 333334]);
  assert.equal(b.reserve, 633334);
  assert.equal(b.free, 3000000 - 600000 - 500000 - 1200000 - 633334);
});

test('이번 달에 확보액을 기록해도 이번 달 준비금은 그대로, 남은 확보액만 줄어든다', () => {
  const today = '2026-10-30';
  const p = planMonth(
    plan('a', 300000, '2026-12-10', { history: [{ date: '2026-10-28', delta: 100000 }] }),
    settings,
    today,
  );
  assert.equal(p.monthlyNeed, 150000);
  assert.equal(p.savedThisPeriod, 100000);
  assert.equal(p.thisMonthLeft, 50000);

  // 다음 달이 되면 남은 금액으로 다시 나눔
  const next = planMonth(
    plan('a', 300000, '2026-12-10', { history: [{ date: '2026-10-28', delta: 150000 }] }),
    settings,
    '2026-11-26',
  );
  assert.equal(next.count, 1);
  assert.equal(next.monthlyNeed, 150000);
});

test('미리보기: 추가하면 여유 예산 A → B', () => {
  const today = '2026-10-26';
  const state = { settings, plans: [plan('a', 200000, '2026-11-20')] };
  const draft = plan('new', 400000, '2026-12-10');
  const pv = previewPlan(state, draft, today);
  assert.equal(pv.count, 2);
  assert.equal(pv.monthly, 200000);
  assert.equal(pv.freeBefore, 500000);
  assert.equal(pv.freeAfter, 300000);
  // 수정일 때는 기존 계획을 대체
  const edited = previewPlan(state, { ...state.plans[0], amount: 100000 }, today, 'a');
  assert.equal(edited.freeAfter, 600000);
});

test('못 모으는 계획이 있으면: 희망 → 조정 가능 순으로 늦추기 제안, 필수 제외', () => {
  const today = '2026-10-26';
  const state = {
    settings: { ...settings, living: 1500000 }, // 매달 준비 가능 400,000
    plans: [
      plan('must', 300000, '2026-11-20', { importance: 'must' }),
      plan('flex', 400000, '2026-12-10', { importance: 'flex' }),
      plan('wish', 300000, '2026-12-10', { importance: 'wish' }),
    ],
  };
  // 10월: must 300,000 + flex 100,000 / 11월: flex 300,000 + wish 100,000 → wish 200,000 부족
  const b = monthBudget(state, today);
  assert.deepEqual(b.plans.map((p) => p.schedule.map((x) => x.amount)), [[300000], [100000, 300000], [0, 100000]]);
  assert.equal(b.shortfall, 200000);
  assert.equal(b.plans[2].status, 'short');

  const s = suggestAdjustments(state, today);
  assert.equal(s.deficit, 200000);
  assert.deepEqual(s.items.map((i) => i.id), ['wish', 'flex']);
  const wish = s.items[0];
  assert.deepEqual(wish.options.map((o) => o.newDate), ['2027-01-10', '2027-02-10', '2027-03-10']);
  assert.equal(wish.options[0].deficitAfter, 0); // 한 달만 늦춰도 해결
  assert.equal(s.uncovered, 0);
  // 제안만 할 뿐 원본은 그대로
  assert.equal(state.plans[2].dueDate, '2026-12-10');
  // 늦춰도 소용없는 경우: 다음 월급 전에 필요한 필수 계획에 이번 달 돈이 모자람
  const stuck = suggestAdjustments(
    {
      settings,
      plans: [plan('must', 300000, '2026-11-20'), plan('wish', 300000, '2027-03-10', { importance: 'wish' })],
      spends: [{ id: 'x', date: today, name: '비행기', amount: 600000, source: 'other' }], // 이번 달 100,000만 남음
    },
    today,
  );
  assert.equal(stuck.shortfall, 200000);
  assert.deepEqual(stuck.items, []);
  // 모자라지 않으면 제안 없음
  assert.equal(suggestAdjustments({ settings, plans: [] }, today), null);
});

test('상태: 순조로움 / 주의 / 부족 / 완료', () => {
  const today = '2026-10-26';
  assert.equal(planMonth(plan('a', 100000, '2027-03-01'), settings, today).status, 'ok');
  assert.equal(planMonth(plan('a', 100000, '2026-11-20'), settings, today).status, 'warn');
  assert.equal(planMonth(plan('a', 100000, '2026-11-01'), settings, today).status, 'short');
  assert.equal(planMonth(plan('a', 100000, '2026-11-01', { saved: 100000 }), settings, today).status, 'done');
  // 처음 계획(월 2만)보다 많이 늘어나면 주의
  assert.equal(
    planMonth(plan('a', 100000, '2027-01-20', { baselineMonthly: 20000 }), settings, today).status,
    'warn',
  );
});

test('보조 함수', () => {
  assert.deepEqual(installments(100000, 3), [33334, 33334, 33332]);
  assert.deepEqual(installments(0, 3), []);
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2026-12-10', 2), '2027-02-10');
});

test('금액 입력: 숫자가 아닌 문자·음수 부호는 버리고 원 단위 정수만', () => {
  assert.equal(parseWon('1,234,567원'), 1234567);
  assert.equal(parseWon('-50000'), 50000);
  assert.equal(parseWon('12.5만'), 125);
  assert.equal(parseWon('abc'), 0);
  assert.equal(parseWon(''), 0);
});

test('기한이 같은 목표 여러 개는 각각 계산해 정확히 합산', () => {
  const today = '2026-10-26';
  const state = {
    settings,
    plans: [
      plan('a', 100000, '2027-01-10'), // 3회 → 33,334
      plan('b', 100000, '2027-01-10', { saved: 1 }), // 99,999 / 3 → 33,333
      plan('c', 200000, '2027-01-10'), // 66,667
    ],
  };
  const b = monthBudget(state, today);
  assert.deepEqual(b.plans.map((p) => p.count), [3, 3, 3]);
  assert.equal(b.reserve, 33334 + 33333 + 66667);
});

test('지출 완료·취소한 계획은 준비금과 여유 예산에서 빠진다 (이중 계산 방지)', () => {
  const today = '2026-10-26';
  const base = [plan('a', 200000, '2026-11-20'), plan('b', 300000, '2026-12-10')];
  const all = monthBudget({ settings, plans: base }, today);
  assert.equal(all.reserve, 350000);

  const spent = monthBudget({ settings, plans: [{ ...base[0], stage: 'spent' }, base[1]] }, today);
  assert.equal(spent.reserve, 150000);
  assert.equal(spent.free, all.free + 200000);

  const cancelled = monthBudget({ settings, plans: [base[0], { ...base[1], stage: 'cancelled' }] }, today);
  assert.deepEqual(cancelled.plans.map((p) => p.id), ['a']);
  assert.equal(suggestAdjustments({ settings, plans: [{ ...base[0], stage: 'spent' }] }, today), null);
});

test('오늘 날짜는 한국 시간(Asia/Seoul) 기준', () => {
  assert.equal(todayStr(new Date('2026-10-24T14:59:00Z')), '2026-10-24'); // 23:59 KST
  assert.equal(todayStr(new Date('2026-10-24T15:00:00Z')), '2026-10-25'); // 00:00 KST
  assert.equal(todayStr(new Date('2028-02-28T15:30:00Z')), '2028-02-29'); // 윤년
});

// ---------- 유연한 준비금 / 월별 전망 / 이번 달 지출 ----------

// 기본 settings의 매달 준비 가능 금액 = 3,000,000 - 600,000 - 500,000 - 1,200,000 = 700,000
const amounts = (p) => p.schedule.map((x) => x.amount);
const spend = (id, amount, source = 'other', extra = {}) => ({
  id,
  date: '2026-10-26',
  name: id,
  amount,
  source,
  ...extra,
});

test('달 이름: 그 월급 주기가 주로 걸친 달', () => {
  assert.equal(periodLabel('2026-09-25'), '10월'); // 9/25 ~ 10/24
  assert.equal(periodLabel('2026-10-10'), '10월');
  assert.equal(periodLabel('2026-10-01'), '10월');
});

test('이번 달 준비 가능 금액을 지출로 다 쓰면 이번 달 몫은 다음 달로 넘어간다', () => {
  const today = '2026-10-28'; // 10/25 ~ 11/24
  const state = { settings, plans: [plan('a', 300000, '2027-01-10')], spends: [spend('렌즈', 700000)] };
  const p = monthBudget(state, today).plans[0];
  assert.equal(p.count, 3);
  assert.deepEqual(amounts(p), [0, 200000, 100000]); // 이번 달 몫 100,000이 다음 달로
  assert.deepEqual(p.schedule.map((x) => x.label), ['11월', '12월', '1월']);
  assert.equal(p.thisMonth, 0);
  assert.equal(p.status, 'ok');
});

test('기한을 넘겨서 배분하지 않고, 못 채운 만큼 부족으로 표시', () => {
  const today = '2026-10-28';
  const s = { ...settings, living: 1800000 }; // 매달 100,000
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2026-12-10')] }, today);
  const p = b.plans[0];
  assert.equal(p.schedule.length, p.count); // 12/10 전 월급 주기까지만
  assert.deepEqual(amounts(p), [100000, 100000]);
  assert.equal(p.shortfall, 100000);
  assert.equal(p.status, 'short');
  assert.equal(b.shortfall, 100000);
});

test('여러 계획이 같은 달에 겹치면 기한 빠른 계획부터 채운다', () => {
  const today = '2026-10-26';
  const s = { ...settings, living: 1700000 }; // 매달 200,000
  const later = plan('later', 400000, '2026-12-20');
  const sooner = plan('sooner', 300000, '2026-12-10');
  const b = monthBudget({ settings: s, plans: [later, sooner] }, today); // 입력 순서와 무관
  const byId = Object.fromEntries(b.plans.map((p) => [p.id, p]));
  assert.deepEqual(amounts(byId.sooner), [150000, 150000]);
  assert.equal(byId.sooner.shortfall, 0);
  assert.deepEqual(amounts(byId.later), [50000, 50000]);
  assert.equal(byId.later.shortfall, 300000);
});

test('뒤 달이 모자라면 기한 전 여유 있는 달에 더 넣는다', () => {
  const today = '2026-10-26';
  const s = { ...settings, living: 1850000 }; // 매달 50,000
  const spends = [spend('환급', 450000, 'income')]; // 이번 달만 500,000
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2027-01-10')], spends }, today);
  assert.deepEqual(amounts(b.plans[0]), [200000, 50000, 50000]);
  assert.equal(b.plans[0].shortfall, 0);
});

test('이번 달 남는 돈 = 월급 - 고정 - 적금 - 생활비 - 모을 돈 - 이번 달 지출 + 들어온 돈', () => {
  const today = '2026-10-28';
  const spends = [
    spend('렌즈', 100000, 'other'),
    spend('친구 선물', 1300000, 'living'), // 생활비 1,200,000보다 100,000 넘음
    spend('환급', 50000, 'income'),
    { ...spend('지난 달', 999999), date: '2026-10-20' }, // 지난 주기
  ];
  const b = monthBudget({ settings, plans: [plan('a', 300000, '2026-12-10')], spends }, today);
  assert.equal(b.spent.living, 1300000);
  assert.equal(b.spent.livingLeft, -100000);
  assert.equal(b.spent.hit, 100000 + 100000 - 50000);
  assert.equal(b.plans[0].thisMonth, 150000);
  assert.equal(b.free, 3000000 - 600000 - 500000 - 1200000 - 150000 - 150000);
  assert.equal(b.months[1].left, 700000 - 150000); // 다음 달은 지출과 상관없음
});

test('생활비 안에서 쓴 지출은 남는 돈에 영향이 없다', () => {
  const today = '2026-10-28';
  const none = monthBudget({ settings, plans: [] }, today);
  const b = monthBudget({ settings, plans: [], spends: [spend('친구 생일 선물', 50000, 'living')] }, today);
  assert.equal(b.free, none.free);
  assert.equal(b.spent.livingLeft, 1150000);
});

test('계획에서 쓴 돈: 모아 둔 돈에서 나가고, 차이만 남는 돈에 반영', () => {
  const today = '2026-10-28';
  const p = { ...plan('p', 300000, '2026-11-20', { saved: 200000 }), stage: 'spent' };
  const more = monthBudget({ settings, plans: [p], spends: [spend('생신', 250000, 'plan', { planId: 'p' })] }, today);
  assert.equal(more.spent.planExtra, 50000); // 모아 둔 200,000보다 50,000 더 씀
  assert.equal(more.free, 700000 - 50000);
  assert.deepEqual(more.plans, []); // 끝난 계획은 배분에서 빠짐

  const less = monthBudget({ settings, plans: [p], spends: [spend('생신', 150000, 'plan', { planId: 'p' })] }, today);
  assert.equal(less.spent.returned, 50000); // 남은 50,000은 돌아옴
  assert.equal(less.free, 700000 + 50000);
});

test('이번 달에 확보하고 바로 계획에서 쓴 돈은 이번 달 모은 돈으로 남는다', () => {
  const today = '2026-10-28';
  const saved = { history: [{ date: '2026-10-26', delta: 300000 }] };
  const before = monthBudget({ settings, plans: [plan('p', 300000, '2026-11-20', saved)] }, today);
  const p = { ...plan('p', 300000, '2026-11-20', saved), stage: 'spent' };
  const after = monthBudget({ settings, plans: [p], spends: [spend('생신', 300000, 'plan', { planId: 'p' })] }, today);
  assert.equal(after.reserve, 300000);
  assert.equal(after.free, before.free); // 쓰고 나도 남는 돈이 갑자기 늘지 않는다
});

test('미리보기에 월별 준비 일정과 부족액이 나온다', () => {
  const today = '2026-10-24'; // 9/25 ~ 10/24
  const state = { settings, plans: [], spends: [{ ...spend('비행기', 700000), date: '2026-10-24' }] };
  const pv = previewPlan(state, plan('new', 300000, '2026-12-10'), today);
  assert.deepEqual(pv.schedule.map((x) => `${x.label} ${x.amount}`), ['10월 0', '11월 200000', '12월 100000']);
  assert.equal(pv.monthly, 0);
  assert.equal(pv.shortfall, 0);
});

test('월별 전망: 이번 달 여유가 없으면 다음 달에 모을 돈과 남는 돈이 나온다', () => {
  const today = '2026-10-24';
  const state = {
    settings,
    plans: [plan('a', 300000, '2026-12-10')],
    spends: [{ ...spend('비행기', 650000), date: '2026-10-24' }],
  };
  const b = monthBudget(state, today);
  assert.equal(b.months.length, 6); // 최소 6개월
  const [oct, nov, dec, jan] = b.months;
  assert.deepEqual([oct.label, nov.label, dec.label, jan.label], ['10월', '11월', '12월', '1월']);
  assert.deepEqual([oct.start, oct.end], ['2026-09-25', '2026-10-24']);
  assert.equal(oct.reserve, 50000);
  assert.equal(oct.left, 0);
  assert.equal(nov.reserve, 150000); // 이번 달에 못 넣은 50,000이 넘어옴
  assert.equal(nov.left, 700000 - 150000);
  assert.deepEqual(nov.allocs, [{ id: 'a', name: 'a', amount: 150000 }]);
  assert.deepEqual(dec.dues, [{ id: 'a', name: 'a', amount: 300000, shortfall: 0 }]);
  assert.equal(dec.reserve, 100000);
  assert.equal(jan.reserve, 0);
  assert.equal(jan.left, 700000);
});

test('월별 전망: 기한인 달에 못 채운 금액은 그 달 남는 돈에서 빠진다', () => {
  const today = '2026-10-26';
  const s = { ...settings, living: 1800000 }; // 매달 100,000
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2026-12-10')] }, today);
  const [, nov] = b.months;
  assert.equal(nov.reserve, 100000);
  assert.equal(nov.shortfall, 100000);
  assert.equal(nov.left, 100000 - 100000 - 100000);
});

test('그 달만 실제 월급으로 고치면 그 달 계산에만 반영된다', () => {
  const today = '2026-10-26'; // 이번 주기 10/25 ~ 11/24, 다음 11/25 ~
  const s = { ...settings, salaryOverrides: { '2026-11-25': 3300000 } }; // 다음 달 +300,000
  assert.equal(salaryFor(s, '2026-11-25'), 3300000);
  assert.equal(salaryFor(s, '2026-12-25'), 3000000);
  const state = { settings: s, plans: [plan('a', 2000000, '2027-01-10')], spends: [spend('비행기', 700000)] };
  const b = monthBudget(state, today);
  const [now, next, after] = b.months;
  assert.equal(next.salary, 3300000);
  assert.equal(next.salaryEdited, true);
  assert.equal(after.salary, 3000000);
  assert.equal(after.salaryEdited, false);
  // 다음 달 준비 가능 금액이 1,000,000으로 늘어서 이번 달 몫까지 다음 달이 받는다
  assert.deepEqual(amounts(b.plans[0]), [0, 1000000, 700000]);
  assert.equal(b.plans[0].shortfall, 300000);
  assert.equal(next.left, 3300000 - 600000 - 500000 - 1200000 - 1000000);
  assert.equal(now.salary, 3000000);
});

test('이번 달 실제 월급은 이번 달 남는 돈에 반영된다', () => {
  const today = '2026-10-26';
  const s = { ...settings, salaryOverrides: { '2026-10-25': 3500000 } };
  const b = monthBudget({ settings: s, plans: [] }, today);
  assert.equal(b.salary, 3500000);
  assert.equal(b.salaryBase, 3000000);
  assert.equal(b.free, 3500000 - 600000 - 500000 - 1200000);
});

test('지출 메모: "렌즈 30"처럼 만원 단위로 적어도 읽는다', () => {
  const text = `렌즈 30
수련회 35
비행기 55만
축의 200,000원
할머니 10, 대전 10
땅콩 2.5만
이름만
30`;
  const { items, errors } = parseSpendLines(text);
  assert.deepEqual(items, [
    { name: '렌즈', amount: 300000 },
    { name: '수련회', amount: 350000 },
    { name: '비행기', amount: 550000 },
    { name: '축의', amount: 200000 },
    { name: '할머니', amount: 100000 },
    { name: '대전', amount: 100000 },
    { name: '땅콩', amount: 25000 },
  ]);
  assert.deepEqual(errors, ['이름만', '30']);
  assert.equal(items.reduce((s, x) => s + x.amount, 0), 1625000);
});

test('지출은 월급 주기별로 모은다', () => {
  const spends = [
    { id: '1', date: '2026-10-24', name: '지난 달', amount: 100000 },
    { id: '2', date: '2026-10-25', name: '렌즈', amount: 300000 },
    { id: '3', date: '2026-11-24', name: '축의', amount: 200000 },
  ];
  assert.deepEqual(spendsIn(spends, '2026-10-25', '2026-11-24').map((x) => x.id), ['2', '3']);
});

test('고정지출도 그 달만 고치면 그 달 계산에만 반영된다 (보너스 달 십일조)', () => {
  const today = '2026-10-26';
  const s = {
    ...settings,
    fixedItems: [
      { id: 'rent', name: '월세', amount: 300000 },
      { id: 'tithe', name: '십일조', amount: 300000 },
    ],
    salaryOverrides: { '2026-11-25': 3500000 },
    fixedOverrides: { '2026-11-25': { tithe: 350000, gone: 99999 } }, // 지운 항목 id는 무시
  };
  const b = monthBudget({ settings: s, plans: [] }, today);
  const [now, next, after] = b.months;
  assert.equal(now.fixed, 600000);
  assert.equal(next.fixed, 650000);
  assert.deepEqual(
    next.fixedItems.map((it) => [it.name, it.amount, it.base, it.edited]),
    [
      ['월세', 300000, 300000, false],
      ['십일조', 350000, 300000, true],
    ],
  );
  assert.equal(next.left, 3500000 - 650000 - 500000 - 1200000);
  assert.equal(after.fixed, 600000);
  assert.equal(after.left, 3000000 - 600000 - 500000 - 1200000);
});

test('이번 달 고정지출을 고치면 이번 달 남는 돈이 바뀐다', () => {
  const s = {
    ...settings,
    fixedItems: [{ id: 'tithe', name: '십일조', amount: 600000 }],
    fixedOverrides: { '2026-10-25': { tithe: 700000 } },
  };
  const b = monthBudget({ settings: s, plans: [] }, '2026-10-26');
  assert.equal(b.fixed, 700000);
  assert.equal(b.free, 3000000 - 700000 - 500000 - 1200000);
});

test('지금 남은 돈 = 월급 - 고정 - 적금 - 이번 달 쓴 돈 + 들어온 돈, 그중 떼어 둘 돈을 빼면 남는 돈', () => {
  const today = '2026-10-28';
  const spends = [spend('렌즈', 100000, 'other'), spend('장보기', 300000, 'living'), spend('환급', 50000, 'income')];
  const b = monthBudget({ settings, plans: [plan('a', 300000, '2026-12-10')], spends }, today);
  assert.equal(b.have, 3000000 - 600000 - 500000 - 100000 - 300000 + 50000);
  assert.equal(b.livingKeep, 900000);
  assert.equal(b.keep, 150000); // 계획에 모을 돈
  assert.equal(b.have - b.livingKeep - b.keep, b.free);
});

test('지금 남은 돈: 계획 지출은 쓴 만큼 빠지고, 지난 달까지 모아 둔 돈은 다시 더해진다', () => {
  const today = '2026-10-28';
  const prior = { ...plan('p', 300000, '2026-11-20', { saved: 200000 }), stage: 'spent' };
  const more = monthBudget({ settings, plans: [prior], spends: [spend('생신', 250000, 'plan', { planId: 'p' })] }, today);
  assert.equal(more.have, 1900000 - 250000 + 200000);
  assert.equal(more.keep, 0);
  assert.equal(more.have - more.livingKeep - more.keep, more.free);

  const less = monthBudget({ settings, plans: [prior], spends: [spend('생신', 150000, 'plan', { planId: 'p' })] }, today);
  assert.equal(less.have, 1900000 - 150000 + 200000); // 남은 50,000도 돌아옴
  assert.equal(less.keep, 0);

  // 이번 달 월급에서 모은 돈으로 쓰면 그냥 빠진다
  const now = { ...plan('p', 300000, '2026-11-20', { history: [{ date: '2026-10-26', delta: 300000 }] }), stage: 'spent' };
  const b = monthBudget({ settings, plans: [now], spends: [spend('생신', 300000, 'plan', { planId: 'p' })] }, today);
  assert.equal(b.have, 1900000 - 300000);
  assert.equal(b.keep, 0);
  assert.equal(b.free, 400000);
});

test('더 저축할 돈이 마이너스면 고정지출·적금은 그대로, 생활비가 줄어든다', () => {
  const today = '2026-10-26';
  // 쓸 수 있는 돈 = 3,000,000 - 600,000 - 500,000 - 1,000,000 = 900,000 → 생활비 1,200,000 중 300,000 줄이기
  let [now, next] = monthBudget({ settings, plans: [], spends: [spend('수리', 1000000)] }, today).months;
  assert.equal(now.canUse, 900000);
  assert.equal(now.left, -300000);
  assert.equal(now.livingLack, 300000);
  assert.equal(now.overLack, 0);
  assert.equal(next.canUse, 1900000);
  assert.equal(next.livingLack, 0);
  // 생활비를 다 줄여도 모자라면 그 차이는 따로 메워야 한다
  [now] = monthBudget({ settings, plans: [], spends: [spend('수리', 2500000)] }, today).months;
  assert.equal(now.left, -1800000);
  assert.equal(now.livingLack, 1200000);
  assert.equal(now.overLack, 600000);
});
