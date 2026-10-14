import { store } from './store.js';
import * as U from './utils.js';

const { esc, icon } = U;
const app = document.getElementById('app');
const YEAR = 365 * 864e5;

let user, surveys = [], lists = [], loaded = false;
let gUnsubs = [], vUnsubs = [], refresh = null, main = null;

store.onAuth(u => {
  gUnsubs.forEach(f => f());
  gUnsubs = []; surveys = []; lists = []; loaded = false;
  user = u;
  if (u?.isAdmin) {
    gUnsubs.push(store.watchSurveys(Date.now() - YEAR, s => { surveys = s; loaded = true; refresh?.(); }));
    gUnsubs.push(store.watchLists(l => { lists = l; refresh?.(); }));
  }
  route();
});
addEventListener('hashchange', route);

function route() {
  vUnsubs.forEach(f => f());
  vUnsubs = []; refresh = null;
  if (user === undefined) return;
  if (!user) return viewLogin();
  if (!user.isAdmin) return viewDenied();
  const [, a, b] = (location.hash.slice(1) || '/').split('/');
  if (a === 's' && b) viewDetail(b);
  else if (a === 'new') viewEditor(null);
  else if (a === 'edit' && b) viewEditor(b);
  else if (a === 'lists') viewLists();
  else viewHome();
}

const kpi = (label, val, cls = '') => `<div class="kpi ${cls}"><span>${label}</span><b>${val}</b></div>`;

/* ---------- 登入 ---------- */
function viewLogin(err = '') {
  app.innerHTML = `
  <div class="login">
    <form class="term" id="lf">
      <div class="term-h"><i></i><i></i><i></i><em>管理者登入</em></div>
      <div class="logo big">TIME<b>HUNTER</b><small>管理後台</small></div>
      <label>電子郵件<input name="email" type="email" autocomplete="username" required></label>
      <label>密碼<input name="pw" type="password" autocomplete="current-password" ${store.demo ? '' : 'required'}></label>
      <div class="err">${esc(err)}</div>
      <button class="btn pri wide">登入 ${icon('arrow')}</button>
      ${store.demo ? '<div class="demo-tag">示範模式 · 輸入任意電子郵件即可進入</div>' : ''}
    </form>
  </div>`;
  const f = document.getElementById('lf');
  f.onsubmit = async e => {
    e.preventDefault();
    const d = new FormData(f);
    f.querySelector('button').disabled = true;
    try { await store.signIn(d.get('email').trim(), d.get('pw')); }
    catch { viewLogin('登入失敗 · 帳號或密碼錯誤'); }
  };
}

function viewDenied() {
  app.innerHTML = `
  <div class="login"><div class="term">
    <div class="logo big">無法<b class="bad">進入</b><small>${esc(user.email)}</small></div>
    <div class="err">此帳號不在管理者名單</div>
    <button class="btn wide" id="lo">${icon('logout')} 登出</button>
  </div></div>`;
  document.getElementById('lo').onclick = () => store.signOut();
}

/* ---------- 外框 ---------- */
function shell(tab) {
  app.innerHTML = `
  <div class="shell">
    <aside class="side">
      <a class="logo" href="#/">TIME<b>HUNTER</b><small>管理後台${store.demo ? ' · 示範' : ''}</small></a>
      <nav>
        <a href="#/" class="${tab === 'home' ? 'on' : ''}">${icon('grid')}<span>調查</span></a>
        <a href="#/new" class="${tab === 'new' ? 'on' : ''}">${icon('plus')}<span>新增</span></a>
        <a href="#/lists" class="${tab === 'lists' ? 'on' : ''}">${icon('users')}<span>名單</span></a>
      </nav>
      <div class="me"><span>${esc(user.email)}</span><button class="ib" id="lo" title="登出">${icon('logout')}</button></div>
    </aside>
    <main id="main"></main>
  </div>`;
  document.getElementById('lo').onclick = () => store.signOut();
  main = document.getElementById('main');
  return main;
}

/* ---------- 總覽 ---------- */
let filter = 'all', query = '';
const SEG = { all: '全部', live: '進行中', closed: '已截止' };
function viewHome() {
  shell('home');
  const resp = {}, subs = {};
  vUnsubs.push(() => Object.values(subs).forEach(f => f()));

  main.innerHTML = `
  <header class="ph">
    <div><div class="crumb">總覽</div><h1>會議調查</h1></div>
    <a class="btn pri" href="#/new">${icon('plus')}新增調查</a>
  </header>
  <div class="kpis" id="kpis"></div>
  <div class="tools">
    <div class="seg">${['all', 'live', 'closed'].map(k => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${SEG[k]}</button>`).join('')}</div>
    <input id="q" class="search" placeholder="搜尋" value="${esc(query)}">
  </div>
  <div class="cards" id="grid"></div>`;

  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => {
    filter = b.dataset.f;
    main.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  const qi = main.querySelector('#q');
  qi.oninput = () => { query = qi.value; draw(); };

  function draw() {
    // 進行中的調查即時追蹤回覆數
    for (const s of surveys) {
      if (!U.isClosed(s) && !subs[s.id]) subs[s.id] = store.watchResponses(s.id, r => { resp[s.id] = r; draw(); });
    }
    const live = surveys.filter(s => !U.isClosed(s)).length;
    main.querySelector('#kpis').innerHTML =
      kpi('進行中', live, 'acc') + kpi('已截止', surveys.length - live) + kpi('近一年', surveys.length) + kpi('名單', lists.length);

    const q = query.trim().toLowerCase();
    const list = surveys.filter(s =>
      (filter === 'all' || (filter === 'live') === !U.isClosed(s)) &&
      (!q || (s.title + (s.location || '')).toLowerCase().includes(q)));
    main.querySelector('#grid').innerHTML = list.length ? list.map(s => card(s, resp[s.id])).join('')
      : `<div class="none">${loaded ? '沒有資料' : '載入中…'}</div>`;
  }

  function card(s, r) {
    const closed = U.isClosed(s), total = s.participants.length;
    const n = r ? r.filter(x => s.pids.includes(x.pid)).length : null;
    return `
    <a class="card ${closed ? 'off' : ''}" href="#/s/${s.id}">
      <div class="card-h">
        <span class="tag ${closed ? '' : 'live'}">${closed ? '已截止' : '進行中'}</span>
        <span class="mono" ${closed ? '' : `data-cd="${s.deadline}"`}>${closed ? U.fmtDateTime(s.deadline) : U.cdShort(s.deadline)}</span>
      </div>
      <h3>${esc(s.title)}</h3>
      <div class="card-m">
        ${s.location ? `<span>${icon('pin')}${esc(s.location)}</span>` : ''}
        <span>${icon('users')}${total}</span><span>${icon('cal')}${s.slots.length}</span>
      </div>
      ${n === null ? '' : `<div class="prog"><span class="rb"><i style="width:${total ? n / total * 100 : 0}%"></i></span>${n}/${total}</div>`}
    </a>`;
  }

  refresh = draw;
  draw();
  const t = setInterval(() => main.querySelectorAll('[data-cd]').forEach(el => { el.textContent = U.cdShort(+el.dataset.cd); }), 1000);
  vUnsubs.push(() => clearInterval(t));
}

/* ---------- 調查詳情（即時） ---------- */
function viewDetail(id) {
  shell('home');
  let s, resp = [], emails = null;
  let mode = null, modePicked = false, slotId = null, slotPicked = false, edited = false;

  main.innerHTML = `<div id="dh"></div><div class="detail"><div id="live"></div><aside id="mail" class="panel"></aside></div>`;
  vUnsubs.push(store.watchSurvey(id, x => { s = x; draw(); }));
  vUnsubs.push(store.watchResponses(id, r => { resp = r; draw(); }));
  store.getContacts(id).then(e => { emails = e; drawMail(); }).catch(() => { emails = {}; drawMail(); });
  const t = setInterval(() => { const el = main.querySelector('#dcd'); if (el && s) el.textContent = U.cdShort(s.deadline); }, 1000);
  vUnsubs.push(() => clearInterval(t));

  const valid = () => resp.filter(r => s.pids.includes(r.pid));

  function draw() {
    if (s === undefined) return;
    if (s === null) { main.innerHTML = `<div class="none">找不到此調查</div>`; return; }
    drawHead(); drawLive(); drawMail();
  }

  function drawHead() {
    const closed = U.isClosed(s), forced = s.status === 'closed', expired = Date.now() >= s.deadline;
    const link = U.surveyLink(s.id);
    main.querySelector('#dh').innerHTML = `
    <header class="ph">
      <div>
        <div class="crumb"><a href="#/">總覽</a> / ${esc(s.id)}</div>
        <h1>${esc(s.title)} <span class="tag ${closed ? '' : 'live'}">${closed ? '已截止' : '進行中'}</span></h1>
        <div class="card-m">
          ${s.location ? `<span>${icon('pin')}${esc(s.location)}</span>` : ''}
          <span>${icon('clock')}${U.fmtDateTime(s.deadline)}</span>
        </div>
      </div>
      <div class="acts">
        <button class="btn" id="cl">${icon('link')}複製連結</button>
        <a class="btn" href="${esc(link)}" target="_blank" rel="noopener">${icon('ext')}前台</a>
        <a class="btn" href="#/edit/${s.id}">${icon('edit')}編輯</a>
        ${expired ? '' : `<button class="btn" id="st">${icon('power')}${forced ? '重新開放' : '提前截止'}</button>`}
        <button class="btn bad" id="del">${icon('trash')}</button>
      </div>
    </header>`;
    main.querySelector('#cl').onclick = () => U.copy(link, '已複製調查連結');
    const st = main.querySelector('#st');
    if (st) st.onclick = () => store.setStatus(s.id, forced ? 'open' : 'closed');
    main.querySelector('#del').onclick = async () => {
      if (!confirm(`刪除「${s.title}」及所有回覆？`)) return;
      await store.deleteSurvey(s.id);
      location.hash = '#/';
    };
  }

  function drawLive() {
    const parts = s.participants, total = parts.length, rs = valid();
    const done = new Set(rs.map(r => r.pid));
    const rank = U.ranking(s, rs), max = rank[0]?.count || 0;
    const closed = U.isClosed(s), slots = U.sortSlots(s.slots);
    const by = Object.fromEntries(rs.map(r => [r.pid, r]));
    const tc = sl => max && rank.find(r => r.slot.id === sl.id).count === max ? 'tc' : '';
    const pending = parts.filter(p => !done.has(p.id));

    main.querySelector('#live').innerHTML = `
    <div class="kpis">
      ${kpi('已回覆', `${done.size}<small>/${total}</small>`, 'acc')}
      ${kpi('回覆率', `${total ? Math.round(done.size / total * 100) : 0}<small>%</small>`)}
      ${kpi('剩餘時間', closed ? '已截止' : `<span id="dcd">${U.cdShort(s.deadline)}</span>`, closed ? 'off' : '')}
      ${kpi('時段數', s.slots.length)}
    </div>

    <div class="panel">
      <div class="ph2">票數排行</div>
      <ol class="rank">${rank.slice(0, 5).map((r, i) => `
        <li class="${max && r.count === max ? 'win' : ''}">
          <span class="no">${U.pad(i + 1)}</span>
          <span class="sl">${U.slotFull(r.slot)}</span>
          <span class="rb"><i style="width:${total ? r.count / total * 100 : 0}%"></i></span>
          <span class="c">${r.count}</span>
          <span class="nm">${r.names.map(esc).join('、') || '—'}</span>
        </li>`).join('')}
      </ol>
    </div>

    <div class="panel">
      <div class="ph2">回覆總表</div>
      <div class="mx"><table>
        <thead><tr><th></th>${slots.map(sl => `<th class="${tc(sl)}">${U.fmtDate(sl.date)}<b>${esc(U.slotLabel(sl))}</b></th>`).join('')}<th>更新時間</th></tr></thead>
        <tbody>${parts.map(p => {
          const r = by[p.id], set = new Set(r?.slots || []);
          return `<tr class="${r ? '' : 'wait'}"><td>${esc(p.name)}</td>
            ${slots.map(sl => `<td class="${tc(sl)}">${set.has(sl.id) ? '<span class="y">●</span>' : '<span class="n">·</span>'}</td>`).join('')}
            <td class="mono dim">${r ? U.fmtDateTime(r.updatedAt).slice(5) : '—'}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td>合計</td>${slots.map(sl => `<td class="${tc(sl)}">${rank.find(r => r.slot.id === sl.id).count}</td>`).join('')}<td></td></tr></tfoot>
      </table></div>
    </div>

    <div class="panel">
      <div class="ph2">尚未回覆 · ${pending.length}</div>
      <div class="chips">${pending.map(p => `<span class="chip">${esc(p.name)}</span>`).join('') || '<span class="ok">全員已回覆</span>'}</div>
    </div>`;
  }

  function drawMail() {
    const box = main.querySelector('#mail');
    if (!box || !s || emails === null) return;
    const rs = valid(), rank = U.ranking(s, rs), done = new Set(rs.map(r => r.pid));
    if (!modePicked) mode = U.isClosed(s) ? 'notice' : 'invite';
    if (!slotPicked || !s.slots.some(x => x.id === slotId)) slotId = rank[0]?.slot.id || null;

    if (!box.dataset.built) {
      box.dataset.built = 1;
      box.innerHTML = `
      <div class="ph2">信件 <span class="seg sm" id="mm">
        <button data-m="invite">邀請</button><button data-m="remind">催填</button><button data-m="notice">通知</button>
      </span></div>
      <div class="mf" id="mslot"><label>會議時段</label><select id="ms"></select></div>
      <div class="mf"><label>收件人 <em id="mrc"></em></label><div class="rcpt" id="mr"></div>
        <button class="btn sm" data-c="to">${icon('copy')}複製收件人</button></div>
      <div class="mf"><label>主旨</label><input id="msub">
        <button class="btn sm" data-c="sub">${icon('copy')}複製主旨</button></div>
      <div class="mf"><label>內文</label><textarea id="mbody" rows="11"></textarea>
        <button class="btn sm" data-c="body">${icon('copy')}複製內文</button></div>
      <div class="row">
        <button class="btn pri" data-c="all">${icon('copy')}全部複製</button>
        <a class="btn" id="mto">${icon('mail')}開啟郵件</a>
      </div>`;
      box.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { mode = b.dataset.m; modePicked = true; edited = false; drawMail(); });
      box.querySelector('#ms').onchange = e => { slotId = e.target.value; slotPicked = true; edited = false; drawMail(); };
      box.querySelector('#msub').oninput = box.querySelector('#mbody').oninput = () => { edited = true; updateMailto(); };
      box.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
        const to = box.querySelector('#mr').textContent, sub = box.querySelector('#msub').value, body = box.querySelector('#mbody').value;
        const k = b.dataset.c;
        U.copy(k === 'to' ? to : k === 'sub' ? sub : k === 'body' ? body : `收件人：${to}\n主旨：${sub}\n\n${body}`);
      });
    }

    box.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
    box.querySelector('#mslot').hidden = mode !== 'notice';
    box.querySelector('#ms').innerHTML = rank.map(r =>
      `<option value="${r.slot.id}" ${r.slot.id === slotId ? 'selected' : ''}>${U.slotFull(r.slot)} · ${r.count} 票</option>`).join('');

    const people = mode === 'remind' ? s.participants.filter(p => !done.has(p.id)) : s.participants;
    const addr = people.map(p => emails[p.id]).filter(Boolean);
    const missing = people.length - addr.length;
    box.querySelector('#mr').textContent = addr.join('; ');
    box.querySelector('#mrc').textContent = `${addr.length}${missing ? ` · ${missing} 位無 email` : ''}`;

    if (!edited) {
      const m = U.buildMail(mode, s, s.slots.find(x => x.id === slotId));
      box.querySelector('#msub').value = m.subject;
      box.querySelector('#mbody').value = m.body;
    }
    updateMailto();
  }

  function updateMailto() {
    const box = main.querySelector('#mail');
    const to = box.querySelector('#mr').textContent.replace(/;\s*/g, ',');
    box.querySelector('#mto').href = `mailto:${to}?subject=${encodeURIComponent(box.querySelector('#msub').value)}&body=${encodeURIComponent(box.querySelector('#mbody').value)}`;
  }
}

/* ---------- 新增 / 編輯 ---------- */
function viewEditor(id) {
  shell('new');
  main.innerHTML = '<div class="none">載入中…</div>';
  (async () => {
    let src = null, emails = {};
    if (id) {
      [src, emails] = await Promise.all([store.getSurvey(id), store.getContacts(id)]);
      if (!src) { main.innerHTML = '<div class="none">找不到此調查</div>'; return; }
    }
    buildEditor(src, emails);
  })();
}

function buildEditor(src, emails) {
  const dates = new Map();
  for (const sl of src?.slots || []) {
    if (!dates.has(sl.date)) dates.set(sl.date, { am: false, pm: false, customs: [] });
    const d = dates.get(sl.date);
    if (sl.type === 'custom') d.customs.push({ start: sl.start, end: sl.end }); else d[sl.type] = true;
  }
  const defDeadline = (() => { const d = new Date(Date.now() + 3 * 864e5); d.setHours(18, 0, 0, 0); return d.getTime(); })();
  const members = (src?.participants || []).map(p => ({ name: p.name, email: emails[p.id] || '' }));

  main.innerHTML = `
  <header class="ph">
    <div><div class="crumb"><a href="#/">總覽</a> / ${src ? '編輯' : '新增'}</div><h1>${src ? '編輯調查' : '新增調查'}</h1></div>
  </header>
  <form class="form" id="ef" novalidate>
    <div class="panel grid2">
      <div class="f"><label>會議名稱</label><input name="title" required value="${esc(src?.title || '')}"></div>
      <div class="f"><label>地點</label><input name="location" value="${esc(src?.location || '')}"></div>
      <div class="f"><label>調查截止</label><input name="deadline" type="datetime-local" required value="${U.toLocalInput(src?.deadline || defDeadline)}"></div>
    </div>

    <div class="panel">
      <div class="ph2">候選時段 <span id="slc"></span></div>
      <div class="row"><input type="date" id="nd"><button type="button" class="btn" id="ad">${icon('plus')}加入日期</button></div>
      <div id="dates" class="dates"></div>
    </div>

    <div class="panel">
      <div class="ph2">與會名單 <span id="mc"></span></div>
      <div class="row">
        <select id="pl"><option value="">匯入名單…</option>${lists.map(l => `<option value="${l.id}">${esc(l.name)}（${l.members.length}）</option>`).join('')}</select>
        <button type="button" class="btn" id="sl">${icon('save')}存成名單</button>
      </div>
      <textarea id="mem" rows="8" placeholder="王小明, wang@company.com&#10;李佳穎, lee@company.com">${esc(U.membersToText(members))}</textarea>
    </div>

    <div class="err" id="er"></div>
    <div class="row end">
      <a class="btn" href="${src ? `#/s/${src.id}` : '#/'}">取消</a>
      <button class="btn pri" id="sv">${icon('check')}${src ? '儲存' : '建立調查'}</button>
    </div>
  </form>`;

  const $ = sel => main.querySelector(sel);
  const box = $('#dates'), mem = $('#mem');

  function drawDates() {
    const keys = [...dates.keys()].sort();
    box.innerHTML = keys.map(k => {
      const d = dates.get(k);
      return `
      <div class="drow" data-d="${k}">
        <span class="d">${U.fmtDate(k, true)}</span>
        <button type="button" class="tg ${d.am ? 'on' : ''}" data-t="am">上午</button>
        <button type="button" class="tg ${d.pm ? 'on' : ''}" data-t="pm">下午</button>
        ${d.customs.map((c, i) => `<span class="chip">${c.start}–${c.end}<button type="button" class="ib" data-rc="${i}">${icon('x')}</button></span>`).join('')}
        <span class="addc"><input type="time" class="cs" value="14:00"><span>–</span><input type="time" class="ce" value="15:00"><button type="button" class="ib" data-ac>${icon('plus')}</button></span>
        <button type="button" class="ib x" data-rm>${icon('trash')}</button>
      </div>`;
    }).join('') || '<div class="none sm">尚未加入日期</div>';
    $('#slc').textContent = toSlots().length;
  }

  box.onclick = e => {
    const row = e.target.closest('[data-d]');
    if (!row) return;
    const k = row.dataset.d, d = dates.get(k), b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.t) d[b.dataset.t] = !d[b.dataset.t];
    else if (b.dataset.rc !== undefined) d.customs.splice(+b.dataset.rc, 1);
    else if (b.hasAttribute('data-ac')) {
      const st = row.querySelector('.cs').value, en = row.querySelector('.ce').value;
      if (!st || !en || st >= en) return U.toast('時間區間不正確', true);
      if (!d.customs.some(c => c.start === st && c.end === en)) d.customs.push({ start: st, end: en });
      d.customs.sort((a, b) => a.start.localeCompare(b.start));
    } else if (b.hasAttribute('data-rm')) dates.delete(k);
    drawDates();
  };

  $('#ad').onclick = () => {
    const v = $('#nd').value;
    if (!v) return U.toast('請選擇日期', true);
    if (!dates.has(v)) dates.set(v, { am: true, pm: true, customs: [] });
    const n = U.parseDate(v); n.setDate(n.getDate() + 1);
    $('#nd').value = `${n.getFullYear()}-${U.pad(n.getMonth() + 1)}-${U.pad(n.getDate())}`;
    drawDates();
  };

  function toSlots() {
    const out = [];
    for (const k of [...dates.keys()].sort()) {
      const d = dates.get(k);
      if (d.am) out.push({ id: `${k}_am`, date: k, type: 'am' });
      if (d.pm) out.push({ id: `${k}_pm`, date: k, type: 'pm' });
      for (const c of d.customs) out.push({ id: `${k}_${c.start.replace(':', '')}${c.end.replace(':', '')}`, date: k, type: 'custom', start: c.start, end: c.end });
    }
    return out;
  }

  const countMem = () => { $('#mc').textContent = U.parseMembers(mem.value).length; };
  mem.oninput = countMem;

  $('#pl').onchange = e => {
    const l = lists.find(x => x.id === e.target.value);
    e.target.value = '';
    if (!l) return;
    const cur = U.parseMembers(mem.value), names = new Set(cur.map(m => m.name));
    mem.value = U.membersToText([...cur, ...l.members.filter(m => !names.has(m.name))]);
    countMem();
    U.toast(`已匯入 ${l.name}`);
  };

  $('#sl').onclick = async () => {
    const m = U.parseMembers(mem.value);
    if (!m.length) return U.toast('名單是空的', true);
    const name = prompt('名單名稱');
    if (!name?.trim()) return;
    const ex = lists.find(l => l.name === name.trim());
    await store.saveList({ id: ex?.id, name: name.trim(), members: m });
    U.toast(ex ? '已更新名單' : '已存成名單');
  };

  $('#ef').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const title = f.get('title').trim(), deadline = new Date(f.get('deadline')).getTime();
    const slots = toSlots(), mems = U.parseMembers(mem.value);
    const err = !title ? '請輸入會議名稱' : !deadline ? '請設定截止時間' : !slots.length ? '請至少加入一個時段' : !mems.length ? '請加入與會名單' : '';
    $('#er').textContent = err;
    if (err) return;

    // 同名者沿用原本 ID，編輯後既有回覆不會遺失
    const prev = src?.participants || [];
    const participants = mems.map(m => ({ id: prev.find(p => p.name === m.name)?.id || U.uid(8), name: m.name }));
    const emailMap = Object.fromEntries(participants.map((p, i) => [p.id, mems[i].email || '']));
    const survey = {
      title, location: f.get('location').trim(), deadline, slots, participants,
      pids: participants.map(p => p.id),
      status: src && deadline <= Date.now() ? src.status : 'open',
      createdAt: src?.createdAt || Date.now(),
      createdBy: src?.createdBy || user.email,
    };
    if (src) survey.id = src.id;
    $('#sv').disabled = true;
    try {
      const id = await store.saveSurvey(survey, emailMap);
      U.toast('已儲存');
      location.hash = `#/s/${id}`;
    } catch (x) {
      console.error(x);
      $('#er').textContent = '儲存失敗：' + (x.message || x);
      $('#sv').disabled = false;
    }
  };

  drawDates();
  countMem();
}

/* ---------- 名單 ---------- */
function viewLists() {
  shell('lists');
  let editing = null;

  function draw() {
    main.innerHTML = `
    <header class="ph">
      <div><div class="crumb">名單管理</div><h1>與會名單</h1></div>
      <button class="btn pri" id="nl">${icon('plus')}新增名單</button>
    </header>
    <div class="cards">${lists.map(l => `
      <div class="card">
        <div class="card-h"><span class="tag">${l.members.length} 人</span>
          <span><button class="ib" data-e="${l.id}" title="編輯">${icon('edit')}</button><button class="ib" data-x="${l.id}" title="刪除">${icon('trash')}</button></span>
        </div>
        <h3>${esc(l.name)}</h3>
        <div class="chips">${l.members.slice(0, 12).map(m => `<span class="chip">${esc(m.name)}</span>`).join('')}${l.members.length > 12 ? `<span class="chip dim">+${l.members.length - 12}</span>` : ''}</div>
      </div>`).join('') || '<div class="none">尚無名單</div>'}
    </div>
    ${editing ? `
    <div class="modal"><form class="panel dlg" id="lf">
      <div class="ph2">${editing.id ? '編輯名單' : '新增名單'}</div>
      <div class="f"><label>名稱</label><input name="name" required value="${esc(editing.name)}"></div>
      <div class="f"><label>成員 <em id="lc"></em></label>
        <textarea name="mem" rows="12" placeholder="王小明, wang@company.com">${esc(U.membersToText(editing.members))}</textarea></div>
      <div class="row end"><button type="button" class="btn" id="lx">取消</button><button class="btn pri">${icon('check')}儲存</button></div>
    </form></div>` : ''}`;

    main.querySelector('#nl').onclick = () => { editing = { name: '', members: [] }; draw(); };
    main.querySelectorAll('[data-e]').forEach(b => b.onclick = () => { editing = structuredClone(lists.find(l => l.id === b.dataset.e)); draw(); });
    main.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
      const l = lists.find(x => x.id === b.dataset.x);
      if (confirm(`刪除名單「${l.name}」？`)) store.deleteList(l.id);
    });

    const f = main.querySelector('#lf');
    if (f) {
      const ta = f.elements.mem, lc = f.querySelector('#lc');
      const cnt = () => { lc.textContent = U.parseMembers(ta.value).length; };
      ta.oninput = cnt; cnt();
      f.querySelector('#lx').onclick = () => { editing = null; draw(); };
      f.onsubmit = async e => {
        e.preventDefault();
        const name = f.elements.name.value.trim(), members = U.parseMembers(ta.value);
        if (!name || !members.length) return U.toast('請輸入名稱與成員', true);
        await store.saveList({ id: editing.id, name, members });
        editing = null;
        draw();
        U.toast('已儲存');
      };
      f.elements.name.focus();
    }
  }

  refresh = () => { if (!editing) draw(); };
  draw();
}
