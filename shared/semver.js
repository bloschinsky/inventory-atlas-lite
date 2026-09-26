/*
  The little bit of semantic versioning the update check and the What's New dialog need: parse a
  release tag and decide whether one version is newer than another. A dependency would be a heavier answer than the
  question, and the rules used here are the whole of the specification that applies to our tags.
*/
const PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export const parseVersion = value => {
  const match = PATTERN.exec(String(value ?? '').trim());
  if (!match) return null;
  return {
    numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split('.') : []
  };
};

export const isPrereleaseVersion = value => (parseVersion(value)?.prerelease.length ?? 0) > 0;

// Compares two prerelease identifier lists by the precedence rules: numeric before alphanumeric,
// and a shorter list that is otherwise equal comes first.
const comparePrerelease = (left, right) => {
  if (left.length === 0 && right.length === 0) return 0;
  // A version without a prerelease part is the released one, so it is the newer of the two.
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const numeric = /^\d+$/.test(a) && /^\d+$/.test(b);
    if (numeric) {
      if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1;
    } else if (a !== b) {
      if (/^\d+$/.test(a)) return -1;
      if (/^\d+$/.test(b)) return 1;
      return a < b ? -1 : 1;
    }
  }
  return 0;
};

// Returns -1, 0, or 1, or null when either side is not a version we can compare.
export const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index++) {
    if (a.numbers[index] !== b.numbers[index]) return a.numbers[index] < b.numbers[index] ? -1 : 1;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
};

export const isNewerVersion = (candidate, current) => compareVersions(candidate, current) === 1;
