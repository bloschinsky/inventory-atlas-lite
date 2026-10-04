import { CONDITION_GRADES } from '../../shared/conditionGrades.js';

/*
  The interface face of the structured Condition: one Tabler color per grade, used by the badges and
  the Dashboard alike, so a grade always looks the same. The label always comes with the color, which
  never carries the meaning alone. An unset grade is neutral and never looks like Broken.
*/
const GRADE_COLORS = { broken: 'red', poor: 'orange', fair: 'yellow', good: 'blue', excellent: 'green' };

// Best first, the order of the form, the help, and the Dashboard; sorting uses the rank instead.
export const CONDITION_GRADES_BEST_FIRST = [...CONDITION_GRADES].reverse();

export const conditionGradeLabelKey = grade => (grade ? `condition.grades.${grade}` : 'condition.notSet');

export const conditionGradeBadgeClass = grade => (grade ? `bg-${GRADE_COLORS[grade]}-lt` : 'bg-secondary-lt');

// The Tabler custom property of a grade's color, which the Dashboard resolves for its charts.
export const conditionGradeColorVariable = grade => `--tblr-${GRADE_COLORS[grade]}`;
