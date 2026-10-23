import { shiftEvent, type Shift } from './event.ts';

const shift: Shift = { id: 'test', memberId: 'test', weekStart: '2026-10-19', dayIndex: 4, startTime: '09:00', endTime: '17:30' };
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
};
Deno.test('shift keeps employee local hours and timezone', () => {
  const result = shiftEvent(shift, { id: 'test', timeZone: 'Europe/Madrid' });
  equal(result.start, { dateTime: '2026-10-23T09:00:00', timeZone: 'Europe/Madrid' });
  equal(result.end.dateTime, '2026-10-23T17:30:00');
  equal(result.showAs, 'busy');
  equal('attendees' in result, false);
});
Deno.test('calendar dates cross month and year boundaries', () => {
  equal(shiftEvent({ ...shift, weekStart: '2026-12-28', dayIndex: 6 }, { id: 'test' }).start.dateTime, '2027-01-03T09:00:00');
});
Deno.test('DST boundary keeps wall clock hours', () => {
  equal(shiftEvent({ ...shift, dayIndex: 6 }, { id: 'test', timeZone: 'Europe/Madrid' }).start.dateTime, '2026-10-25T09:00:00');
});
Deno.test('missing timezone uses UTC', () => {
  equal(shiftEvent(shift, { id: 'test' }).start.timeZone, 'UTC');
});
for (const changes of [{ dayIndex: -1 }, { dayIndex: 7 }, { weekStart: '2026-02-30' }, { startTime: '25:00' }, { endTime: '08:00' }, { endTime: '09:00' }]) {
  Deno.test(`invalid shift is rejected: ${JSON.stringify(changes)}`, () => {
    let rejected = false;
    try { shiftEvent({ ...shift, ...changes }, { id: 'test' }); } catch { rejected = true; }
    equal(rejected, true);
  });
}
Deno.test('invalid timezone is rejected', () => {
  let rejected = false;
  try { shiftEvent(shift, { id: 'test', timeZone: 'not-a-timezone' }); } catch { rejected = true; }
  equal(rejected, true);
});
