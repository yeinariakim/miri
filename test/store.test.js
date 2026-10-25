import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixedTotal, monthBudget } from '../calc.js';
import { clearSample, createSampleState, exportJSON, hasSample, importJSON } from '../store.js';

const today = '2026-10-24';

test('백업 → 복원 후 계산 결과가 같다', () => {
  const state = createSampleState(today);
  state.plans[0].history.push({ id: 'm1', date: today, ts: `${today}T10:00:00Z`, delta: 30000, kind: 'manual' });
  state.plans[1] = { ...state.plans[1], stage: 'spent', notes: '축의금 + 교통비' };

  const restored = importJSON(exportJSON(state));
  assert.deepEqual(restored, state);
  assert.deepEqual(monthBudget(restored, today), monthBudget(state, today));
});

test('잘못된 백업 파일은 거부한다', () => {
  assert.throws(() => importJSON('{not json'), /읽을 수 없어요/);
  assert.throws(() => importJSON('{"hello":1}'), /백업 파일이 아니에요/);
});

test('복원할 때 이상한 값은 걸러낸다', () => {
  const s = importJSON(
    JSON.stringify({
      settings: { salary: '3000000', payday: 40, fixed: -5, savings: 1.6, living: 'x' },
      plans: [
        { name: '정상', amount: 1000, dueDate: '2026-12-01', importance: '???', stage: '??', history: [] },
        { name: '0원', amount: 0, dueDate: '2026-12-01' },
        { name: '날짜 이상', amount: 1000, dueDate: '2026-02-30' },
      ],
    }),
  );
  assert.deepEqual(s.settings, {
    salary: 3000000,
    payday: 31,
    fixedItems: [],
    savings: 2,
    living: 0,
    balance: null,
    balanceUpdatedAt: null,
    balanceTs: null,
    pendingOut: 0,
    fixedOverrides: {},
    salaryOverrides: {},
  });
  assert.equal(s.plans.length, 1);
  assert.equal(s.plans[0].importance, 'flex');
  assert.equal(s.plans[0].stage, 'active');
});

test('예시 데이터: 5개 계획, 지우면 직접 만든 계획만 남는다', () => {
  const state = createSampleState(today);
  assert.deepEqual(
    state.plans.map((p) => p.name),
    ['엄마 생신', '친구 결혼식', '연말 선물', '제주 여행', '노트북 교체'],
  );
  const mine = { id: 'mine', name: '내 계획', amount: 1000, dueDate: '2026-12-01', history: [] };
  const myFixed = { id: 'f', name: '내 구독', amount: 9900 };
  const cleared = clearSample({
    settings: { ...state.settings, fixedItems: [...state.settings.fixedItems, myFixed] },
    plans: [...state.plans, mine],
  });
  assert.deepEqual(cleared.plans.map((p) => p.id), ['mine']);
  assert.deepEqual(cleared.settings.fixedItems, [myFixed]);
  assert.equal(hasSample(cleared), false);
});

test('고정지출 항목: 합계로 계산되고, 예전 합계 하나짜리 데이터는 항목 하나로 옮겨진다', () => {
  const s = importJSON(
    JSON.stringify({
      settings: {
        salary: 3000000,
        payday: 25,
        fixedItems: [
          { id: 'n', name: '넷플릭스', amount: 13500 },
          { id: 's', name: ' 스포티파이 ', amount: 10900 },
          { id: 'p', name: '', amount: 59000 },
          { id: 'z', name: '빈 항목', amount: 0 },
        ],
        savings: 0,
        living: 0,
      },
      plans: [],
    }),
  );
  assert.deepEqual(s.settings.fixedItems.map((it) => it.name), ['넷플릭스', '스포티파이', '이름 없는 항목']);
  assert.equal(fixedTotal(s.settings), 83400);
  assert.equal(monthBudget(s, today).free, 3000000 - 83400);

  const old = importJSON(JSON.stringify({ settings: { salary: 1, payday: 25, fixed: 680000 }, plans: [] }));
  assert.equal(old.settings.fixedItems.length, 1);
  assert.equal(old.settings.fixedItems[0].name, '고정지출');
  assert.equal(fixedTotal(old.settings), 680000);
  assert.equal('fixed' in old.settings, false);
});

test('그 달 월급과 큰 지출 메모도 백업·복원된다', () => {
  const state = createSampleState(today);
  state.settings.salaryOverrides = { '2026-09-25': 3450000, 'bad-key': 1 };
  state.settings.fixedOverrides = { '2026-09-25': { tithe: 350000, bad: 'x' }, nope: { a: 1 } };
  state.spends = [
    { id: 's1', date: today, name: '렌즈', amount: 300000 },
    { id: 's2', date: today, name: '비행기', amount: 550000, planId: 'p9' },
    { id: 's3', date: 'nope', name: '이상함', amount: 1 },
  ];
  const restored = importJSON(exportJSON(state));
  assert.deepEqual(restored.settings.salaryOverrides, { '2026-09-25': 3450000 });
  assert.deepEqual(restored.settings.fixedOverrides, { '2026-09-25': { tithe: 350000 } });
  assert.deepEqual(restored.spends.map((x) => x.name), ['렌즈', '비행기']);
  assert.equal(restored.spends[1].planId, 'p9');
});
