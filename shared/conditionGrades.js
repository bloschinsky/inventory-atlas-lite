/*
  The fixed Condition scale of every item, shared by the client and the server. The stored keys never
  change and are never translated; the interface names them through condition.grades.<key>. The
  position in this list is the semantic rank: 1 (broken) is the worst grade, 5 (excellent) the best.
*/
export const CONDITION_GRADES = ['broken', 'poor', 'fair', 'good', 'excellent'];

export const isConditionGrade = value => CONDITION_GRADES.includes(value);
