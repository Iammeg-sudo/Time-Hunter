import { store } from './store.js?v=20261020b';
import { esc, icon, fmtDate, parseDate, slotLabel, sortSlots, groupByDate, tally, countdown, pad, isClosed, toast, WEEK } from './utils.js?v=20261020b';

const app = document.getElementById('app');
const sid = new URLSearchParams(location.search).get('s');
const meKey = 'th-me-' + sid;
let survey, responses = [], me = null, picks = new Set(), dirty = false, wasClosed = null, sending = false;
try { me = localStorage.getItem(meKey); } catch { /* 無法讀取 */ }

const RADAR = `<svg class="radar" viewBox="0 0 200 200"><circle cx="100" cy="100" r="90"/><circle cx="100" cy="100" r="60"/><circle cx="100" cy="100" r="30"/><path d="M100 10v180M10 100h180"/><path class="sweep" d="M100 100 L100 10 A90 90 0 0 1 178 55 Z"/></svg>`;

if (!sid) empty('請使用調查連結開啟');
else {
  store.watchSurvey(sid, s => { survey = s; render(); });
  store.watchResponses(sid, r => { responses = r; render(); });
  setInterval(tick, 1000);
}

addEventListener('beforeunload', e => { if (dirty && survey && !isClosed(survey)) e.preventDefault(); });

function empty(code) {
  app.innerHTML = `<div class="empty">${RADAR}<div class="brand">TIME<b>HUNTER</b></div><p>${code}</p></div>`;
}

// 自己尚未送出的勾選也即時反映在統計上
function liveResponses() {
  const parts = survey.participants || [];
  const pids = new Set(parts.map(p => p.id));
  const list = responses.filter(r => pids.has(r.pid) && r.pid !== me);
  if (me) list.push({ pid: me, name: parts.find(p => p.id === me).name, slots: [...picks] });
  return list;
}

function render() {
  if (survey === undefined) return;
  if (!survey) return empty('找不到此調查');
  const parts = survey.participants || [];
  if (me && !parts.some(p => p.id === me)) me = null;
  if (!dirty) {
    const r = responses.find(r => r.pid === me);
    picks = new Set(r ? r.slots : []);
  }
  const closed = wasClosed = isClosed(survey);
  const rs = liveResponses();
  const t = tally(survey, rs);
  const max = Math.max(0, ...Object.values(t).map(x => x.count));
  const done = new Set(responses.map(r => r.pid));
  const nDone = parts.filter(p => done.has(p.id)).length;
  const slots = sortSlots(survey.slots);
  const mine = done.has(me);

  app.innerHTML = `
  <header class="hero">
    <div class="brand">TIME<b>HUNTER</b></div>
    <h1>${esc(survey.title)}</h1>
    <div class="meta">
      ${survey.location ? `<span>${icon('pin')}${esc(survey.location)}</span>` : ''}
      <span>${icon('users')}${nDone} / ${parts.length}</span>
    </div>
    <div id="cd" class="cd">${cdHTML(closed)}</div>
  </header>

  <section>
    <div class="sec-h">你是</div>
    <div class="who" id="who">${parts.map(p => `
      <button class="pill ${p.id === me ? 'on' : ''} ${done.has(p.id) ? 'done' : ''}" data-p="${p.id}" ${closed ? 'disabled' : ''}>
        <i class="dot"></i>${esc(p.name)}
      </button>`).join('')}
    </div>
  </section>

  <section>
    <div class="sec-h">勾選可出席時段</div>
    <div class="days">${groupByDate(slots).map(g => dayHTML(g, t, max, parts.length, closed)).join('')}</div>
  </section>

  <section>
    <div class="sec-h">大家的選擇</div>
    ${matrixHTML(parts, slots, t, max, rs, done)}
  </section>

  ${closed ? '' : `
  <div class="dock">
    <button class="go" id="go" ${me ? '' : 'disabled'}>
      ${icon('check')}<span>${mine ? '更新' : '送出'}</span>${dirty ? '<i class="ping"></i>' : ''}
    </button>
  </div>`}`;

  app.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    me = b.dataset.p;
    dirty = false;
    try { localStorage.setItem(meKey, me); } catch { /* 無法儲存 */ }
    render();
  });
  app.querySelectorAll('[data-s]').forEach(b => b.onclick = () => {
    if (!me) return nudge();
    const id = b.dataset.s;
    picks.has(id) ? picks.delete(id) : picks.add(id);
    dirty = true;
    render();
  });
  const go = document.getElementById('go');
  if (go) go.onclick = submit;
}

function dayHTML(g, t, max, total, closed) {
  const d = parseDate(g.date);
  return `
  <div class="day">
    <div class="day-d"><small>${d.getMonth() + 1}月</small><b>${pad(d.getDate())}</b><span>週${WEEK[d.getDay()]}</span></div>
    <div class="day-s">${g.slots.map(s => {
      const x = t[s.id], on = picks.has(s.id), top = max > 0 && x.count === max;
      return `
      <button class="slot ${on ? 'on' : ''} ${top ? 'top' : ''}" data-s="${s.id}" ${closed ? 'disabled' : ''}>
        <div class="sl-h"><span class="lbl">${esc(slotLabel(s))}</span><span class="chk">${on ? icon('check') : ''}</span></div>
        <div class="cnt"><b>${x.count}</b>/${total}</div>
        <div class="bar"><i style="width:${total ? x.count / total * 100 : 0}%"></i></div>
        <div class="faces">${x.names.map(n => `<span class="face">${esc(n)}</span>`).join('')}</div>
      </button>`;
    }).join('')}
    </div>
  </div>`;
}

function matrixHTML(parts, slots, t, max, rs, done) {
  const by = Object.fromEntries(rs.map(r => [r.pid, new Set(r.slots)]));
  const tc = s => max > 0 && t[s.id].count === max ? 'tc' : '';
  return `
  <div class="mx"><table>
    <thead><tr><th></th>${slots.map(s => `<th class="${tc(s)}">${fmtDate(s.date)}<b>${esc(slotLabel(s))}</b></th>`).join('')}</tr></thead>
    <tbody>${parts.map(p => `
      <tr class="${p.id === me ? 'me' : ''} ${done.has(p.id) || (p.id === me && picks.size) ? '' : 'wait'}">
        <td>${esc(p.name)}</td>
        ${slots.map(s => `<td class="${tc(s)}">${by[p.id]?.has(s.id) ? '<span class="y">○</span>' : '<span class="n">×</span>'}</td>`).join('')}
      </tr>`).join('')}
    </tbody>
    <tfoot><tr><td>合計</td>${slots.map(s => `<td class="${tc(s)}">${t[s.id].count}</td>`).join('')}</tr></tfoot>
  </table></div>`;
}

function cdHTML(closed) {
  if (closed) return '<div class="cd-off">已截止</div>';
  const c = countdown(survey.deadline);
  return [['d', '天'], ['h', '時'], ['m', '分'], ['s', '秒']]
    .map(([k, l]) => `<div><b>${pad(c[k])}</b><i>${l}</i></div>`).join('');
}

function tick() {
  if (!survey) return;
  if (isClosed(survey) !== wasClosed) return render();
  const el = document.getElementById('cd');
  if (el && !wasClosed) el.innerHTML = cdHTML(false);
}

function nudge() {
  const w = document.getElementById('who');
  w.classList.remove('shake');
  void w.offsetWidth;
  w.classList.add('shake');
  w.scrollIntoView({ behavior: 'smooth', block: 'center' });
  toast('先選擇你的名字');
}

async function submit() {
  if (!me || sending) return;
  const p = survey.participants.find(x => x.id === me);
  sending = true;
  document.getElementById('go').disabled = true;
  try {
    await store.submitResponse(sid, me, p.name, [...picks]);
    dirty = false;
    toast('已送出');
  } catch {
    toast('送出失敗，請重試', true);
  }
  sending = false;
  render();
}
