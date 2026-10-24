// 미리 — 저장 (localStorage) / 백업 / 예시 데이터
import { CATEGORIES, IMPORTANCE, STAGES, addDays, addMonths, isValidDate, parseDate, planMonth } from './calc.js';

const KEY = 'miri:v1';

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'miri', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

// 파일 내용이 이상하면 Error를 던진다
export function importJSON(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 파일을 읽을 수 없어요.');
  }
  const state = normalizeState(data);
  if (!state) throw new Error('미리 백업 파일이 아니에요.');
  return state;
}

const int = (v, min = 0) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, n) : min;
};

function normalizeState(data) {
  if (!data || typeof data !== 'object' || !data.settings || !Array.isArray(data.plans)) return null;
  const s = data.settings;
  const settings = {
    salary: int(s.salary),
    payday: Math.min(31, Math.max(1, int(s.payday, 1))),
    fixedItems: normalizeFixedItems(s),
    savings: int(s.savings),
    living: int(s.living),
  };
  const plans = data.plans
    .filter((p) => p && typeof p.name === 'string' && isValidDate(p.dueDate) && int(p.amount) > 0)
    .map((p) => ({
      id: String(p.id || newId()),
      name: p.name.slice(0, 60),
      category: CATEGORIES.includes(p.category) ? p.category : '기타',
      amount: int(p.amount),
      dueDate: p.dueDate,
      importance: p.importance in IMPORTANCE ? p.importance : 'flex',
      stage: p.stage in STAGES ? p.stage : 'active',
      notes: typeof p.notes === 'string' ? p.notes.slice(0, 200) : '',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
      baselineMonthly: int(p.baselineMonthly),
      ...(p.sample ? { sample: true } : {}),
      history: (Array.isArray(p.history) ? p.history : [])
        .filter((h) => h && isValidDate(h.date) && Number.isFinite(Number(h.delta)))
        .map((h) => ({
          id: String(h.id || newId()),
          date: h.date,
          ts: typeof h.ts === 'string' ? h.ts : `${h.date}T00:00:00`,
          delta: Math.round(Number(h.delta)),
          kind: h.kind === 'initial' ? 'initial' : 'manual',
        })),
    }));
  return { version: 1, settings, plans };
}

// 고정지출 항목. 예전 형식(합계 하나)이면 '고정지출' 항목 하나로 옮긴다.
function normalizeFixedItems(s) {
  if (!Array.isArray(s.fixedItems)) {
    const total = int(s.fixed);
    return total ? [{ id: newId(), name: '고정지출', amount: total }] : [];
  }
  return s.fixedItems
    .filter((it) => it && int(it.amount) > 0)
    .map((it) => ({
      id: String(it.id || newId()),
      name: String(it.name || '').trim().slice(0, 30) || '이름 없는 항목',
      amount: int(it.amount),
      ...(it.sample ? { sample: true } : {}),
    }));
}

// ---------- 예시 데이터 ----------

export function createSampleState(today) {
  const fixedItems = [
    ['월세', 450000],
    ['휴대폰 요금', 59000],
    ['보험', 80000],
    ['넷플릭스', 13500],
    ['스포티파이', 10900],
  ].map(([name, amount]) => ({ id: newId(), name, amount, sample: true }));
  const settings = { salary: 3200000, payday: 25, fixedItems, savings: 500000, living: 1200000 };
  const { y } = parseDate(today);
  const yearEnd = `${y}-12-20` > addDays(today, 14) ? `${y}-12-20` : `${y + 1}-12-20`;
  const samples = [
    ['엄마 생신', '선물', 300000, addDays(today, 45), 'must', 100000],
    ['친구 결혼식', '경조사', 200000, addDays(today, 25), 'must', 0],
    ['연말 선물', '선물', 250000, yearEnd, 'flex', 50000],
    ['제주 여행', '여행', 1200000, addMonths(today, 5), 'wish', 200000],
    ['노트북 교체', '전자제품', 1800000, addMonths(today, 9), 'flex', 300000],
  ];
  const now = new Date().toISOString();
  const plans = samples.map(([name, category, amount, dueDate, importance, saved]) => {
    const plan = {
      id: newId(),
      name,
      category,
      amount,
      dueDate,
      importance,
      stage: 'active',
      notes: '',
      createdAt: now,
      baselineMonthly: 0,
      sample: true,
      history: saved ? [{ id: newId(), date: today, ts: now, delta: saved, kind: 'initial' }] : [],
    };
    plan.baselineMonthly = planMonth(plan, settings, today).monthlyNeed;
    return plan;
  });
  return { version: 1, settings, plans };
}

export function hasSample(state) {
  return state.plans.some((p) => p.sample) || state.settings.fixedItems.some((it) => it.sample);
}

export function clearSample(state) {
  return {
    ...state,
    settings: { ...state.settings, fixedItems: state.settings.fixedItems.filter((it) => !it.sample) },
    plans: state.plans.filter((p) => !p.sample),
  };
}
