export type RankedEvaluationCase = {
  expectedId: string;
  retrievedIds: string[];
};

export function recallAtK(cases: RankedEvaluationCase[], k: number) {
  if (cases.length === 0) return 0;
  const hits = cases.filter((item) => item.retrievedIds.slice(0, k).includes(item.expectedId)).length;
  return hits / cases.length;
}

export function meanReciprocalRank(cases: RankedEvaluationCase[]) {
  if (cases.length === 0) return 0;
  const sum = cases.reduce((total, item) => {
    const index = item.retrievedIds.indexOf(item.expectedId);
    return total + (index >= 0 ? 1 / (index + 1) : 0);
  }, 0);
  return sum / cases.length;
}
