export type Shift = { id: string; memberId: string; weekStart: string; dayIndex: number; startTime: string; endTime: string };
export type Member = { id: string; entraObjectId?: string; entraEmail?: string; timeZone?: string; status?: string };

export function shiftEvent(shift: Shift, member: Member) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.weekStart) || !Number.isInteger(shift.dayIndex) || shift.dayIndex < 0 || shift.dayIndex > 6) throw new Error('Invalid shift date.');
  const base = new Date(`${shift.weekStart}T00:00:00Z`);
  if (!Number.isFinite(base.getTime()) || base.toISOString().slice(0, 10) !== shift.weekStart) throw new Error('Invalid shift date.');
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!timePattern.test(shift.startTime) || !timePattern.test(shift.endTime) || shift.endTime <= shift.startTime) throw new Error('Invalid shift hours.');
  base.setUTCDate(base.getUTCDate() + shift.dayIndex);
  const date = base.toISOString().slice(0, 10);
  const timeZone = member.timeZone || 'UTC';
  new Intl.DateTimeFormat('en', { timeZone }).format(base);
  return {
    subject: 'Flat Reality - Work shift',
    body: { contentType: 'Text', content: 'Scheduled in Flat Reality Workspace. Manage this shift in Workspace: https://flat-reality.github.io/FRWorkspace/#schedule' },
    start: { dateTime: `${date}T${shift.startTime}:00`, timeZone },
    end: { dateTime: `${date}T${shift.endTime}:00`, timeZone },
    showAs: 'busy',
    isReminderOn: false,
  };
}
