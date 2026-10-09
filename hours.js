// «Часы» дня по рассвету и сумеркам — перенос tibcal._sun / twilight / half_hours.
// Работает и в браузере (глобальный Hours), и в node (module.exports) — для сверки с Python.
const Hours = (() => {
  const R = Math.PI / 180;
  const DAY_HOURS = ['Кролика', 'Дракона', 'Змеи', 'Лошади', 'Барана', 'Обезьяны'];
  const NIGHT_HOURS = ['Петуха', 'Собаки', 'Свиньи', 'Крысы', 'Быка', 'Тигра'];
  const HALF_NAMES = [...DAY_HOURS, ...NIGHT_HOURS].flatMap(a => [`${a}-1`, `${a}-2`]);

  // склонение и уравнение времени (минуты) — алгоритм NOAA
  function sun(jd) {
    const t = (jd - 2451545.0) / 36525;
    const l0 = ((280.46646 + t * (36000.76983 + 0.0003032 * t)) % 360 + 360) % 360;
    const m = R * (357.52911 + t * (35999.05029 - 0.0001537 * t));
    const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
    const c = Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m) * (0.019993 - 0.000101 * t)
      + Math.sin(3 * m) * 0.000289;
    const om = R * (125.04 - 1934.136 * t);
    const lam = R * (l0 + c - 0.00569 - 0.00478 * Math.sin(om));
    const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    const eps = R * (eps0 + 0.00256 * Math.cos(om));
    const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const y = Math.tan(eps / 2) ** 2;
    const l0r = R * l0;
    const eqt = y * Math.sin(2 * l0r) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l0r)
      - 0.5 * y * y * Math.sin(4 * l0r) - 1.25 * e * e * Math.sin(2 * m);
    return [dec, 4 * eqt / R];
  }

  // юлианский день на полночь UTC даты (y, m — 1…12, d)
  const jd0 = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 2440587.5;

  // [рассвет, сумерки] в минутах местного поясного времени от полуночи
  function twilight(y, m, d, loc, tz) {
    const out = [];
    for (const sign of [-1, 1]) {
      let tg = 720 + sign * 360;
      for (let i = 0; i < 3; i++) {  // склонение берём на момент события
        const [dec, eqt] = sun(jd0(y, m, d) + (tg - tz * 60) / 1440);
        const noon = 720 - 4 * loc.lon - eqt + tz * 60;
        let ch = (Math.sin(-loc.depression * R) - Math.sin(loc.lat * R) * Math.sin(dec))
          / (Math.cos(loc.lat * R) * Math.cos(dec));
        ch = Math.max(-1, Math.min(1, ch));
        tg = noon + sign * Math.acos(ch) / R * 4;
      }
      out.push(tg);
    }
    return out;
  }

  // смещение пояса (часы) для IANA-зоны на эту дату — с учётом летнего времени
  function tzOffset(zone, y, m, d) {
    const at = Date.UTC(y, m - 1, d, 12);
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric',
    }).formatToParts(new Date(at)).map(x => [x.type, +x.value]));
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - at) / 3600000;
  }

  // {'Кролика-1': [начало, конец], …} в минутах от полуночи (ночь уходит за 1440)
  // loc = {lat, lon, depression, tz (часы) | zone (IANA)}
  function halfHours(y, m, d, loc) {
    const tz = loc.zone ? tzOffset(loc.zone, y, m, d) : loc.tz;
    const [dawn, dusk] = twilight(y, m, d, loc, tz);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const nextDawn = twilight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), loc, tz)[0] + 1440;
    const dayStep = (dusk - dawn) / 12, nightStep = (nextDawn - dusk) / 12;
    const out = {};
    for (let i = 0; i < 12; i++) {
      out[HALF_NAMES[i]] = [dawn + i * dayStep, dawn + (i + 1) * dayStep];
      out[HALF_NAMES[12 + i]] = [dusk + i * nightStep, dusk + (i + 1) * nightStep];
    }
    return out;
  }

  function hhmm(minutes) {
    const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  return { HALF_NAMES, halfHours, tzOffset, hhmm };
})();
if (typeof module !== 'undefined') module.exports = Hours;
