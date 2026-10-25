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
      settings: { ...settings, balance: 100000, balanceUpdatedAt: today, pendingOut: 0 },
      plans: [plan('must', 300000, '2026-11-20'), plan('wish', 300000, '2027-03-10', { importance: 'wish' })],
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

// ---------- 잔고와 유연한 준비금 ----------

// 매달 준비 가능 금액 = 3,000,000 - 600,000 - 500,000 - 1,200,000 = 700,000
const withBalance = (balance, extra = {}) => ({
  ...settings,
  balance,
  balanceUpdatedAt: '2026-10-26',
  pendingOut: 0,
  ...extra,
});
const amounts = (p) => p.schedule.map((x) => x.amount);

test('달 이름: 그 월급 주기가 주로 걸친 달', () => {
  assert.equal(periodLabel('2026-09-25'), '10월'); // 9/25 ~ 10/24
  assert.equal(periodLabel('2026-10-10'), '10월');
  assert.equal(periodLabel('2026-10-01'), '10월');
});

test('이번 달 잔고가 0이면 이번 달 몫은 다음 달로 넘어간다', () => {
  const today = '2026-10-24'; // 9/25 ~ 10/24 주기의 마지막 날
  const b = monthBudget({ settings: withBalance(0), plans: [plan('a', 300000, '2026-12-10')] }, today);
  const p = b.plans[0];
  assert.equal(p.count, 3);
  assert.deepEqual(amounts(p), [0, 200000, 100000]); // 이번 달 몫 100,000이 다음 달로
  assert.deepEqual(p.schedule.map((x) => x.label), ['10월', '11월', '12월']);
  assert.equal(p.thisMonth, 0);
  assert.equal(p.shortfall, 0);
  assert.equal(p.status, 'ok');
});

test('잔고에서 아직 나갈 돈을 뺀 만큼만 이번 달에 준비한다', () => {
  const today = '2026-10-26';
  const s = withBalance(500000, { pendingOut: 420000 }); // 이번 달 준비 가능 80,000
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2026-12-10')] }, today);
  assert.deepEqual(amounts(b.plans[0]), [80000, 220000]);
});

test('기한을 넘겨서 배분하지 않고, 못 채운 만큼 부족으로 표시', () => {
  const today = '2026-10-26';
  const s = withBalance(0, { living: 1800000 }); // 매달 100,000, 이번 달 0
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2026-12-10')] }, today);
  const p = b.plans[0];
  assert.equal(p.schedule.length, p.count); // 12/10 전 월급 주기(10월·11월)까지만
  assert.deepEqual(amounts(p), [0, 100000]);
  assert.equal(p.shortfall, 200000);
  assert.equal(p.status, 'short');
  assert.equal(b.shortfall, 200000);
});

test('여러 계획이 같은 달에 겹치면 기한 빠른 계획부터 채운다', () => {
  const today = '2026-10-26';
  const s = withBalance(200000, { living: 1700000 }); // 매달 200,000, 이번 달 200,000
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
  const s = withBalance(500000, { living: 1850000 }); // 매달 50,000, 이번 달 500,000
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2027-01-10')] }, today);
  assert.deepEqual(amounts(b.plans[0]), [200000, 50000, 50000]);
  assert.equal(b.plans[0].shortfall, 0);
});

test('다음 월급날까지 쓸 수 있는 돈 = 잔고 - 나갈 돈 - 이번 달에 모을 돈', () => {
  const today = '2026-10-28';
  const s = withBalance(900000, { pendingOut: 250000, balanceUpdatedAt: '2026-10-25' });
  const b = monthBudget(
    {
      settings: s,
      plans: [
        plan('soon', 300000, '2026-11-20', { saved: 100000 }), // 다음 월급(11/25) 전 → 200,000
        plan('later', 500000, '2027-01-10'), // 빼지 않음
        { ...plan('spent', 999999, '2026-11-01'), stage: 'spent' }, // 끝난 계획은 빼지 않음
      ],
    },
    today,
  );
  assert.equal(b.dueBeforePayday, 200000);
  // 이번 달에 later 몫(500,000 / 3회 = 166,667)도 떼어 두므로 같이 뺀다
  assert.equal(b.months[0].reserve, 200000 + 166667);
  assert.equal(b.spendable, 900000 - 250000 - 200000 - 166667);
  assert.equal(b.balanceAge, 3);

  const neg = monthBudget({ settings: withBalance(100000), plans: [plan('soon', 300000, '2026-11-20')] }, today);
  assert.equal(neg.spendable, -200000);

  // 잔고를 넣은 적 없으면 계산하지 않음
  assert.equal(monthBudget({ settings, plans: [] }, today).spendable, null);
});

test('미리보기에 월별 준비 일정과 부족액이 나온다', () => {
  const today = '2026-10-24';
  const state = { settings: withBalance(0), plans: [] };
  const pv = previewPlan(state, plan('new', 300000, '2026-12-10'), today);
  assert.deepEqual(pv.schedule.map((x) => `${x.label} ${x.amount}`), ['10월 0', '11월 200000', '12월 100000']);
  assert.equal(pv.monthly, 0);
  assert.equal(pv.shortfall, 0);
});

test('월별 전망: 이번 달 돈이 없으면 다음 달에 모을 돈과 쓸 수 있는 돈이 나온다', () => {
  const today = '2026-10-24';
  const b = monthBudget({ settings: withBalance(50000), plans: [plan('a', 300000, '2026-12-10')] }, today);
  assert.equal(b.months.length, 6); // 최소 6개월
  const [oct, nov, dec, jan] = b.months;
  assert.deepEqual([oct.label, nov.label, dec.label, jan.label], ['10월', '11월', '12월', '1월']);
  assert.deepEqual([oct.start, oct.end], ['2026-09-25', '2026-10-24']);

  // 이번 달: 잔고 50,000을 다 모으면 쓸 수 있는 돈 0
  assert.equal(oct.reserve, 50000);
  assert.equal(oct.spend, 0);
  assert.equal(oct.extra, null);
  // 다음 달: 남은 몫 + 이번 달에서 넘어온 50,000 = 150,000
  assert.equal(nov.reserve, 150000);
  assert.equal(nov.spend, 3000000 - 600000 - 500000 - 150000); // 생활비 포함
  assert.equal(nov.extra, nov.spend - 1200000); // 생활비 말고 더 남는 돈
  assert.deepEqual(nov.allocs, [{ id: 'a', name: 'a', amount: 150000 }]);
  // 12/10에 쓰는 계획은 12월(11/25 ~ 12/24)에 지출 예정
  assert.deepEqual(dec.dues, [{ id: 'a', name: 'a', amount: 300000, shortfall: 0 }]);
  assert.equal(dec.reserve, 100000);
  assert.equal(jan.reserve, 0);
  assert.equal(jan.spend, 1900000);
});

test('월별 전망: 기한인 달에 못 채운 금액은 그 달 쓸 수 있는 돈에서 빠진다', () => {
  const today = '2026-10-26';
  const s = withBalance(0, { living: 1800000 }); // 매달 100,000
  const b = monthBudget({ settings: s, plans: [plan('a', 300000, '2026-12-10')] }, today);
  const [, nov] = b.months;
  assert.equal(nov.reserve, 100000);
  assert.equal(nov.shortfall, 200000);
  assert.equal(nov.spend, 3000000 - 600000 - 500000 - 100000 - 200000);
});

test('월별 전망: 잔고를 넣은 적 없으면 이번 달도 월급 기준', () => {
  const b = monthBudget({ settings, plans: [plan('a', 300000, '2026-12-10')] }, '2026-10-26');
  assert.equal(b.months[0].reserve, 150000);
  assert.equal(b.months[0].spend, 3000000 - 600000 - 500000 - 150000);
  assert.equal(b.spendable, null);
});

// ---------- 그 달 월급 / 큰 지출 메모 ----------

test('그 달만 실제 월급으로 고치면 그 달 계산에만 반영된다', () => {
  const today = '2026-10-26'; // 이번 주기 10/25 ~ 11/24, 다음 11/25 ~
  const s = { ...withBalance(0), salaryOverrides: { '2026-11-25': 3300000 } }; // 다음 달 +300,000
  assert.equal(salaryFor(s, '2026-11-25'), 3300000);
  assert.equal(salaryFor(s, '2026-12-25'), 3000000);

  const b = monthBudget({ settings: s, plans: [plan('a', 2000000, '2027-01-10')] }, today);
  const [now, next, after] = b.months;
  assert.equal(next.salary, 3300000);
  assert.equal(next.salaryEdited, true);
  assert.equal(after.salary, 3000000);
  assert.equal(after.salaryEdited, false);
  // 다음 달 준비 가능 금액이 1,000,000으로 늘어서 이번 달 몫까지 다음 달이 받는다
  assert.deepEqual(amounts(b.plans[0]), [0, 1000000, 700000]);
  assert.equal(b.plans[0].shortfall, 300000);
  assert.equal(next.spend, 3300000 - 600000 - 500000 - 1000000);
  assert.equal(now.salary, 3000000);
});

test('이번 달 실제 월급은 이번 달 예상 여유 예산에 반영된다', () => {
  const today = '2026-10-26';
  const s = { ...settings, salaryOverrides: { '2026-10-25': 3500000 } };
  const b = monthBudget({ settings: s, plans: [] }, today);
  assert.equal(b.salary, 3500000);
  assert.equal(b.salaryBase, 3000000);
  assert.equal(b.free, 3500000 - 600000 - 500000 - 1200000);
});

test('큰 지출 메모: "렌즈 30"처럼 만원 단위로 적어도 읽는다', () => {
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

test('큰 지출 메모는 월급 주기별로 모으고, 계산에는 넣지 않는다', () => {
  const spends = [
    { id: '1', date: '2026-10-24', name: '지난 달', amount: 100000 },
    { id: '2', date: '2026-10-25', name: '렌즈', amount: 300000 },
    { id: '3', date: '2026-11-24', name: '축의', amount: 200000 },
  ];
  assert.deepEqual(spendsIn(spends, '2026-10-25', '2026-11-24').map((x) => x.id), ['2', '3']);
  const before = monthBudget({ settings: withBalance(500000), plans: [] }, '2026-10-26');
  const after = monthBudget({ settings: withBalance(500000), plans: [], spends }, '2026-10-26');
  assert.equal(after.spendable, before.spendable);
});
