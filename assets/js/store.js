// 資料層：有 Firebase 設定時使用 Firestore（即時同步），否則使用本機 DEMO 資料
import { firebaseConfig } from './config.js';
import { uid, pad, isClosed } from './utils.js';

const DEMO = !firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith('YOUR');
export const store = DEMO ? demoStore() : await firebaseStore();

async function firebaseStore() {
  const base = 'https://www.gstatic.com/firebasejs/10.12.2';
  const [{ initializeApp }, F, A] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
    import(`${base}/firebase-auth.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const db = F.getFirestore(app);
  const auth = A.getAuth(app);
  const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const ref = (col, id) => id ? F.doc(db, col, id) : F.doc(F.collection(db, col));

  return {
    demo: false,
    onAuth(cb) {
      return A.onAuthStateChanged(auth, async u => {
        if (!u) return cb(null);
        let isAdmin = false;
        try { isAdmin = (await F.getDoc(F.doc(db, 'admins', u.email))).exists(); } catch { /* 無權限 */ }
        cb({ email: u.email, isAdmin });
      });
    },
    signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    signUp: (email, pw) => A.createUserWithEmailAndPassword(auth, email, pw),
    resetPassword: email => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),

    // 管理者名單：文件 ID = 小寫 email
    watchAdmins(cb, onErr) {
      return F.onSnapshot(F.collection(db, 'admins'), s => cb(docs(s)), e => { console.error(e); onErr?.(e); });
    },
    async addAdmins(list, by) {
      const b = F.writeBatch(db);
      for (const a of list) b.set(F.doc(db, 'admins', a.email), { name: a.name, addedBy: by, addedAt: Date.now() });
      await b.commit();
    },
    removeAdmin: email => F.deleteDoc(F.doc(db, 'admins', email)),

    watchSurveys(since, cb) {
      const q = F.query(F.collection(db, 'surveys'), F.where('createdAt', '>=', since), F.orderBy('createdAt', 'desc'));
      return F.onSnapshot(q, s => cb(docs(s)), e => console.error(e));
    },
    watchSurvey(id, cb) {
      return F.onSnapshot(F.doc(db, 'surveys', id), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), () => cb(null));
    },
    async getSurvey(id) {
      const d = await F.getDoc(F.doc(db, 'surveys', id));
      return d.exists() ? { id: d.id, ...d.data() } : null;
    },
    async getContacts(id) {
      const d = await F.getDoc(F.doc(db, 'surveys', id, 'private', 'contacts'));
      return d.exists() ? d.data().emails || {} : {};
    },
    async saveSurvey(survey, emails) {
      const r = ref('surveys', survey.id);
      const { id, ...data } = survey;
      await F.setDoc(r, data);
      await F.setDoc(F.doc(r, 'private', 'contacts'), { emails });
      return r.id;
    },
    setStatus: (id, status) => F.updateDoc(F.doc(db, 'surveys', id), { status }),
    async deleteSurvey(id) {
      const rs = await F.getDocs(F.collection(db, 'surveys', id, 'responses'));
      const b = F.writeBatch(db);
      rs.forEach(d => b.delete(d.ref));
      b.delete(F.doc(db, 'surveys', id, 'private', 'contacts'));
      b.delete(F.doc(db, 'surveys', id));
      await b.commit();
    },

    watchResponses(id, cb) {
      return F.onSnapshot(F.collection(db, 'surveys', id, 'responses'), s => cb(docs(s)), () => cb([]));
    },
    submitResponse: (sid, pid, name, slots) =>
      F.setDoc(F.doc(db, 'surveys', sid, 'responses', pid), { pid, name, slots, updatedAt: Date.now() }),

    watchLists(cb) {
      return F.onSnapshot(F.query(F.collection(db, 'lists'), F.orderBy('name')), s => cb(docs(s)), e => console.error(e));
    },
    async saveList(list) {
      const r = ref('lists', list.id);
      const { id, ...data } = list;
      await F.setDoc(r, data);
      return r.id;
    },
    deleteList: id => F.deleteDoc(F.doc(db, 'lists', id)),
  };
}

function demoStore() {
  const KEY = 'timehunter-demo', AUTH = 'timehunter-demo-auth';
  const subs = new Set(), authSubs = new Set();
  const clone = o => JSON.parse(JSON.stringify(o));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const emit = () => subs.forEach(f => f());
  const write = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 無法儲存 */ } emit(); };
  const sub = fn => { subs.add(fn); queueMicrotask(fn); return () => subs.delete(fn); };
  const authUser = () => {
    try { const e = localStorage.getItem(AUTH); return e ? { email: e, isAdmin: true } : null; } catch { return null; }
  };
  const setAuth = v => {
    try { v ? localStorage.setItem(AUTH, v) : localStorage.removeItem(AUTH); } catch { /* 無法儲存 */ }
    authSubs.forEach(f => f());
  };

  let data = read();
  if (!data) { data = seed(); write(); }

  // 跨分頁即時同步（模擬多人同時使用）
  addEventListener('storage', e => {
    if (e.key === KEY) { data = read() || data; emit(); }
    if (e.key === AUTH) authSubs.forEach(f => f());
  });

  return {
    demo: true,
    onAuth(cb) { const f = () => cb(authUser()); authSubs.add(f); queueMicrotask(f); return () => authSubs.delete(f); },
    signIn: async email => setAuth(email || 'demo@timehunter'),
    signUp: async email => setAuth(email || 'demo@timehunter'),
    resetPassword: async () => {},
    signOut: async () => setAuth(null),

    watchAdmins: cb => sub(() => cb(Object.entries(data.admins ||= {}).map(([id, a]) => ({ id, ...a })))),
    async addAdmins(list, by) {
      data.admins ||= {};
      for (const a of list) data.admins[a.email] = { name: a.name, addedBy: by, addedAt: Date.now() };
      write();
    },
    async removeAdmin(email) { delete (data.admins ||= {})[email]; write(); },

    watchSurveys: (since, cb) => sub(() => cb(Object.values(data.surveys)
      .filter(s => s.createdAt >= since).sort((a, b) => b.createdAt - a.createdAt).map(clone))),
    watchSurvey: (id, cb) => sub(() => cb(data.surveys[id] ? clone(data.surveys[id]) : null)),
    getSurvey: async id => data.surveys[id] ? clone(data.surveys[id]) : null,
    getContacts: async id => clone(data.contacts[id] || {}),
    async saveSurvey(survey, emails) {
      const id = survey.id || uid();
      data.surveys[id] = { ...clone(survey), id };
      data.contacts[id] = emails;
      write();
      return id;
    },
    async setStatus(id, status) { data.surveys[id].status = status; write(); },
    async deleteSurvey(id) { delete data.surveys[id]; delete data.responses[id]; delete data.contacts[id]; write(); },

    watchResponses: (id, cb) => sub(() => cb(Object.values(data.responses[id] || {}).map(clone))),
    async submitResponse(sid, pid, name, slots) {
      const s = data.surveys[sid];
      if (!s || isClosed(s) || !s.pids.includes(pid)) throw new Error('denied');
      (data.responses[sid] ||= {})[pid] = { pid, name, slots, updatedAt: Date.now() };
      write();
    },

    watchLists: cb => sub(() => cb(Object.values(data.lists).sort((a, b) => a.name.localeCompare(b.name)).map(clone))),
    async saveList(list) { const id = list.id || uid(); data.lists[id] = { ...clone(list), id }; write(); return id; },
    async deleteList(id) { delete data.lists[id]; write(); },
  };
}

function seed() {
  const now = Date.now(), day = 864e5;
  const ymd = o => { const d = new Date(now + o * day); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const ppl = ['王小明', '李佳穎', '陳志豪', '林雅婷', '張家瑋', '黃怡君'].map((name, i) => ({ id: 'p' + i, name }));
  const emails = Object.fromEntries(ppl.map((p, i) => [p.id, `user${i + 1}@company.com`]));
  const ampm = d => [{ id: `${d}_am`, date: d, type: 'am' }, { id: `${d}_pm`, date: d, type: 'pm' }];
  const d1 = ymd(5), d2 = ymd(6), d3 = ymd(8);
  const slots = [...ampm(d1), { id: `${d2}_14001530`, date: d2, type: 'custom', start: '14:00', end: '15:30' }, ...ampm(d3)];
  const pick = (sl, i, idx) => ({ pid: 'p' + i, name: ppl[i].name, slots: idx.map(k => sl[k].id), updatedAt: now - i * 36e5 });

  const p1 = ymd(-34), p2 = ymd(-33);
  const oldSlots = [...ampm(p1), { id: `${p2}_10001100`, date: p2, type: 'custom', start: '10:00', end: '11:00' }];
  const old = ppl.slice(0, 4);

  return {
    surveys: {
      demo01: {
        id: 'demo01', title: 'Q4 產品規劃會議', location: '12F 大會議室', deadline: now + 2 * day + 5 * 36e5,
        slots, participants: ppl, pids: ppl.map(p => p.id), status: 'open', createdAt: now - day, createdBy: 'demo',
      },
      demo02: {
        id: 'demo02', title: '九月營運檢討', location: '線上 Teams', deadline: now - 36 * day,
        slots: oldSlots, participants: old, pids: old.map(p => p.id), status: 'open', createdAt: now - 40 * day, createdBy: 'demo',
      },
    },
    responses: {
      demo01: { p0: pick(slots, 0, [0, 2, 4]), p1: pick(slots, 1, [0, 4]), p2: pick(slots, 2, [1, 4]), p3: pick(slots, 3, [0, 3, 4]) },
      demo02: Object.fromEntries(old.map((p, i) => [p.id, pick(oldSlots, i, i % 2 ? [1, 2] : [1])])),
    },
    contacts: { demo01: emails, demo02: emails },
    lists: { L1: { id: 'L1', name: '產品部', members: ppl.map(p => ({ name: p.name, email: emails[p.id] })) } },
  };
}
