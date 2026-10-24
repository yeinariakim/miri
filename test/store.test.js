import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthBudget } from '../calc.js';
import { clearSample, createSampleState, exportJSON, importJSON } from '../store.js';

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
  assert.deepEqual(s.settings, { salary: 3000000, payday: 31, fixed: 0, savings: 2, living: 0 });
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
  const cleared = clearSample({ ...state, plans: [...state.plans, mine] });
  assert.deepEqual(cleared.plans.map((p) => p.id), ['mine']);
});
