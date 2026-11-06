/*
  A deliberately coarse description of a browser for the Sessions list, such as "Firefox · Linux".
  It never claims to identify a device, and the full User-Agent string is not stored.
*/
const BROWSERS = [[/Edg\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\/|CriOS\//, 'Chrome'], [/Safari\//, 'Safari']];
const SYSTEMS = [[/Android/, 'Android'], [/iPhone|iPad|iPod/, 'iOS'], [/Windows/, 'Windows'], [/Mac OS X|Macintosh/, 'macOS'], [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux']];

export function describeUserAgent(userAgent) {
  const text = String(userAgent ?? '').slice(0, 512);
  const browser = BROWSERS.find(([pattern]) => pattern.test(text))?.[1];
  const system = SYSTEMS.find(([pattern]) => pattern.test(text))?.[1];
  return [browser, system].filter(Boolean).join(' · ') || null;
}
