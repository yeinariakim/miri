import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  currentPeriod,
  installments,
  monthBudget,
  parseWon,
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

test('여유 예산 마이너스: 희망 → 조정 가능 순으로 제안, 필수 제외', () => {
  const today = '2026-10-26';
  const state = {
    settings: { ...settings, living: 1500000 }, // 여유 400,000 - 준비금
    plans: [
      plan('must', 300000, '2026-11-20', { importance: 'must' }), // 300,000
      plan('flex', 400000, '2026-12-10', { importance: 'flex' }), // 200,000
      plan('wish', 300000, '2026-12-10', { importance: 'wish' }), // 150,000
    ],
  };
  const b = monthBudget(state, today);
  assert.equal(b.free, -250000);

  const s = suggestAdjustments(state, today);
  assert.equal(s.deficit, 250000);
  assert.deepEqual(s.items.map((i) => i.id), ['wish', 'flex']);
  const wish = s.items[0];
  assert.equal(wish.monthly, 150000);
  assert.deepEqual(wish.options.map((o) => o.newDate), ['2027-01-10', '2027-02-10', '2027-03-10']);
  assert.deepEqual(wish.options.map((o) => o.monthly), [100000, 75000, 60000]);
  assert.deepEqual(wish.options.map((o) => o.saving), [50000, 75000, 90000]);
  assert.equal(s.items[1].needed, true); // 희망만으로는 250,000을 못 메움
  assert.equal(s.maxSaving, 90000 + 120000);
  assert.equal(s.uncovered, 40000);
  // 제안만 할 뿐 원본은 그대로
  assert.equal(state.plans[2].dueDate, '2026-12-10');

  // 마이너스가 아니면 제안 없음
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
