// Formatting helpers. Intl formatters are created once and reused (creating
// them is relatively expensive).
const timeFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatDateTime = (iso) => (iso ? timeFmt.format(new Date(iso)) : '—');

export function timeAgo(iso, now = Date.now()) {
  const mins = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
}

export function duration(startIso, endIso, now = Date.now()) {
  const ms = (endIso ? new Date(endIso).getTime() : now) - new Date(startIso).getTime();
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export const initials = (name) =>
  name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
