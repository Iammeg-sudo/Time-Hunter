export const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export const pad = n => String(n).padStart(2, '0');

export function uid(n = 10) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), b => c[b % 36]).join('');
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDate(str, withYear = false) {
  const d = parseDate(str);
  return `${withYear ? d.getFullYear() + '/' : ''}${d.getMonth() + 1}/${d.getDate()} (${WEEK[d.getDay()]})`;
}

export const slotLabel = s => s.type === 'am' ? '上午' : s.type === 'pm' ? '下午' : `${s.start}–${s.end}`;
export const slotFull = s => `${fmtDate(s.date, true)} ${slotLabel(s)}`;

const sortKey = s => s.date + (s.type === 'am' ? '09:00' : s.type === 'pm' ? '13:00' : s.start);
export const sortSlots = slots => [...(slots || [])].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

export function groupByDate(slots) {
  const m = new Map();
  for (const s of slots) {
    if (!m.has(s.date)) m.set(s.date, []);
    m.get(s.date).push(s);
  }
  return [...m].map(([date, slots]) => ({ date, slots }));
}

export function tally(survey, responses) {
  const map = Object.fromEntries((survey.slots || []).map(s => [s.id, { slot: s, count: 0, names: [] }]));
  for (const r of responses) {
    for (const id of r.slots || []) {
      if (map[id]) { map[id].count++; map[id].names.push(r.name); }
    }
  }
  return map;
}

// 依票數排序，同票數以時間先後排列
export function ranking(survey, responses) {
  const t = tally(survey, responses);
  return sortSlots(survey.slots).map(s => t[s.id]).sort((a, b) => b.count - a.count);
}

export function countdown(deadline) {
  let x = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  const d = Math.floor(x / 86400); x %= 86400;
  const h = Math.floor(x / 3600); x %= 3600;
  return { d, h, m: Math.floor(x / 60), s: x % 60, done: deadline <= Date.now() };
}

export function cdShort(deadline) {
  const c = countdown(deadline);
  return c.done ? '已截止' : `${c.d}天${pad(c.h)}:${pad(c.m)}:${pad(c.s)}`;
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toLocalInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const isClosed = s => s.status === 'closed' || Date.now() >= s.deadline;
export const surveyLink = id => new URL('index.html?s=' + encodeURIComponent(id), location.href).href;

// 每行一位：「姓名, email」，也接受 Tab（從 Excel 貼上）或空白分隔
export function parseMembers(text) {
  const out = [], seen = new Set();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let name, email = '';
    const sp = line.match(/^(.+?)\s+(\S+@\S+)$/);
    if (/[,\t，;；]/.test(line)) [name, email = ''] = line.split(/[,\t，;；]/).map(x => x.trim());
    else if (sp) [, name, email] = sp;
    else name = line;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, email });
  }
  return out;
}

export const membersToText = members => members.map(m => m.email ? `${m.name}, ${m.email}` : m.name).join('\n');

// 會議通知的預設時間：上午 10:30–12:30、下午 14:30–15:30，自訂時段沿用原區間
export const slotTimes = s => s.type === 'am' ? ['10:30', '12:30'] : s.type === 'pm' ? ['14:30', '15:30'] : [s.start, s.end];

export function buildMail(mode, survey, slot, times) {
  const t = survey.title, dl = fmtDateTime(survey.deadline), link = surveyLink(survey.id);
  if (mode === 'invite') return {
    subject: `【時間調查】${t}`,
    body: `各位好，\n\n為安排「${t}」，請於 ${dl} 前點選以下連結，勾選可出席的時段：\n\n${link}\n\n謝謝！`,
  };
  if (mode === 'remind') return {
    subject: `【提醒】${t} 時間調查即將截止`,
    body: `您好，\n\n「${t}」時間調查將於 ${dl} 截止，目前尚未收到您的回覆，請點選連結填寫：\n\n${link}\n\n謝謝！`,
  };
  const when = !slot ? '（請選擇時段）'
    : times?.start && times?.end ? `${fmtDate(slot.date, true)} ${times.start}–${times.end}` : slotFull(slot);
  return {
    subject: `【會議通知】${t}`,
    body: `各位好，\n\n「${t}」會議時間確定如下，敬請準時出席：\n\n■ 時間：${when}\n${survey.location ? `■ 地點：${survey.location}\n` : ''}\n如有異動請提前告知，謝謝。`,
  };
}

// 產生 Outlook 會議檔（.ics）；開啟後會以「會議」視窗顯示，收件人、時間、地點、內文都已帶入
export function buildIcs({ uid, title, location, body, date, start, end, attendees }) {
  const utc = (d, t) => {
    const [y, m, dd] = d.split('-').map(Number), [h, mi] = t.split(':').map(Number);
    return new Date(y, m - 1, dd, h, mi).toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  };
  const txt = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Time Hunter//ZH-TW', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')}`,
    `DTSTART:${utc(date, start)}`,
    `DTEND:${utc(date, end)}`,
    `SUMMARY:${txt(title)}`,
    ...(location ? [`LOCATION:${txt(location)}`] : []),
    `DESCRIPTION:${txt(body)}`,
    ...attendees.map(a => `ATTENDEE;CN="${String(a.name).replace(/"/g, '')}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`),
    'X-MS-OLK-FORCEINSPECTOROPEN:TRUE',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// iCalendar 每行上限 75 bytes，超過要折行（以 UTF-8 計算，不切斷中文字）
function foldLine(line) {
  const enc = new TextEncoder(), out = [];
  let cur = '', size = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > limit) { out.push(cur); cur = ''; size = 0; limit = 74; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.replace(/[\\/:*?"<>|]/g, '_');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function toast(msg, bad = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.className = ''; }, 2200);
}

export async function copy(text, msg = '已複製') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement('textarea');
    t.value = text;
    t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t);
    t.select();
    document.execCommand('copy');
    t.remove();
  }
  toast(msg);
}

const P = {
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
};
export const icon = name => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg>`;
