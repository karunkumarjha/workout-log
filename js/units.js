// Weights are stored in kg; profiles display them in kg or lb.
const KG_PER_LB = 0.45359237;

export const toKg = (value, unit) => (unit === 'lb' ? value * KG_PER_LB : value);
export const fromKg = (kg, unit) => (unit === 'lb' ? kg / KG_PER_LB : kg);

export const round1 = (v) => Math.round(v * 10) / 10;

export const weightStep = (unit) => (unit === 'lb' ? 5 : 2.5);

export function fmtNumber(v) {
  return round1(v).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export const unitLabel = (unit) => (unit === 'lb' ? 'lbs' : 'kg');

export function fmtWeight(kg, unit) {
  return `${fmtNumber(fromKg(kg, unit))} ${unitLabel(unit)}`;
}

// "8 @ 60, 6 @ 70, 5 @ 80 kg" (reps @ weight), or "12, 10, 8 reps" for older sets logged without weight.
export function fmtSets(sets, unit) {
  if (sets.every((s) => !s.weightKg)) return `${sets.map((s) => s.reps).join(', ')} reps`;
  return `${sets.map((s) => `${s.reps} @ ${fmtNumber(fromKg(s.weightKg, unit))}`).join(', ')} ${unitLabel(unit)}`;
}
