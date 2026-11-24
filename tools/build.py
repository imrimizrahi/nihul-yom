#!/usr/bin/env python3
"""Builds the standalone site (index.html) from the app source app.html.

app.html is the single-file app shared with the claude.ai version. This script swaps its storage and sign-in
for Supabase, adds web push and the home-screen (PWA) bits, and writes ../index.html.
Run:  python3 tools/build.py
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = (ROOT / 'app.html').read_text(encoding='utf-8')
s = src

SB_URL = 'https://jvhdbnasxzvbvczlvloj.supabase.co'
SB_KEY = 'sb_publishable_dOIzziCBeG89SMedNqeREw_mGNyVI80'  # publishable key: safe in the browser, access is limited by row level security


def rep(a, b, count=1):
    global s
    n = s.count(a)
    if n != count:
        sys.exit('expected %d match(es), found %d for: %s' % (count, n, a[:80]))
    s = s.replace(a, b)


def cut(start, end_marker, new):
    """Replace from `start` up to and including `end_marker` (first one after start)."""
    global s
    i = s.index(start)
    j = s.index(end_marker, i) + len(end_marker)
    s = s[:i] + new + s[j:]


# ---------- document shell + home screen app ----------
head = '''<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#F2F3F5">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="ניהול יום">
<meta name="description" content="ניהול יום: מטרות יומיות, אימונים ורצף">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" href="icons/icon-192.png">
'''
i = s.index('</style>') + len('</style>')
s = head + s[:i] + '\n</head>\n<body>\n' + s[i:] + '\n</body>\n</html>\n'
s = s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
    '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n'
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/dist/umd/supabase.min.js"></script>')

# ---------- storage: Supabase table user_data (one row per doc), live through realtime ----------
cut('  async function initStore() {', "    store.col = db.collection('data/users/' + uid);\n", '''  const SB_URL = '%s', SB_KEY = '%s', PHONE_MAIL = '@phone.nihulyom.app';
  let sb = null, sbUser = null;
  try { sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ny-auth' } }); } catch (e) {}
  function sbCollection(uid) {
    const docs = {}; let cb = null, errCb = null, chan = null;
    const snap = () => ({ metadata: { fromCache: false }, docs: Object.keys(docs).map((id) => ({ id, data: () => docs[id] })) });
    async function pull() {
      const { data, error } = await sb.from('user_data').select('doc, body');
      if (error) throw error;
      Object.keys(docs).forEach((k) => delete docs[k]);
      (data || []).forEach((r) => { docs[r.doc] = r.body; });
      cb && cb(snap());
    }
    return {
      doc: (id) => ({ set: async (body) => {
        const { error } = await sb.from('user_data').upsert({ user_id: uid, doc: id, body, updated_at: new Date().toISOString() });
        if (error) throw { code: /fetch|network|timeout/i.test(error.message || '') ? 'unavailable' : 'failed', message: error.message };
        docs[id] = JSON.parse(JSON.stringify(body));
      } }),
      onSnapshot(f, ef) {
        cb = f; errCb = ef;
        pull().catch((e) => errCb && errCb(e));
        chan = sb.channel('user_data:' + uid)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'user_data', filter: 'user_id=eq.' + uid }, (p) => {
            if (p.eventType === 'DELETE') { if (p.old && p.old.doc) delete docs[p.old.doc]; }
            else if (p.new && p.new.doc) docs[p.new.doc] = p.new.body;
            cb && cb(snap());
          }).subscribe();
        // phones drop sockets in the background: refetch when the app comes back
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull().catch(() => {}); });
        return () => { chan && sb.removeChannel(chan); };
      },
    };
  }
  async function initStore() {
    if (!sb || !sbUser) { store.mode = 'local'; setSync('', 'נשמר רק במכשיר הזה'); settle(); return; }
    const uid = sbUser.id;
    store.mode = 'db';
    store.col = sbCollection(uid);
''' % (SB_URL, SB_KEY))
rep("setSync('ok', 'נשמר בחשבון שלך ומסונכרן בין מכשירים')", "setSync('ok', 'נשמר בענן (סופהבייס) ומסונכרן בין מכשירים')")
# boot: storage starts after sign-in, from the gate
rep("  initStore();\n", "")

# ---------- sign-in: Supabase Auth with phone + password ----------
cut('  // ---------- sign-up / sign-in gate (phone + password) ----------', '''    location.reload();
  });
''', r'''  // ---------- sign-up / sign-in gate (phone + password, Supabase Auth) ----------
  // Accounts are Supabase users whose login email is made from the phone number; the "register" edge function creates them.
  const REM_LS = 'daily-goals-remember', SES_KEY = 'daily-goals-in', KNOWN_LS = 'ny-known';
  let authRec = null;
  let storeSettled = false; const settleWaiters = [];
  function settle() { if (storeSettled) return; storeSettled = true; settleWaiters.splice(0).forEach((f) => f()); }
  function setAuthRec(r) { authRec = r; }
  const normPhone = (x) => { let d = String(x || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return d; };
  const userRec = (u) => { const m = (u && u.user_metadata) || {}; return { name: m.name || '', phone: m.phone || ((u && u.email) || '').split('@')[0] }; };
  const netErr = (e) => /fetch|network|load failed|timeout/i.test(String((e && e.message) || e || ''));
  function gate(onOpen) {
    const g = $('gate');
    let mode = '', busy = false;
    function open() {
      try { sessionStorage.setItem(SES_KEY, '1'); localStorage.setItem(KNOWN_LS, '1'); if ($('gRem').checked) localStorage.setItem(REM_LS, '1'); else localStorage.removeItem(REM_LS); } catch (e) {}
      paintLogout(); initStore(); paintPush();
      if (g.hidden) { g.remove(); onOpen(); return; }
      sfx.boom(); try { navigator.vibrate && navigator.vibrate([20, 40, 60]); } catch (e) {}
      g.classList.add('out'); onOpen();
      setTimeout(() => g.remove(), 780);
    }
    function show(m) {
      mode = m;
      const reg = m === 'register', wait = m === 'wait';
      $('gForm').hidden = wait; $('gWait').hidden = !wait; $('gForgot').hidden = wait;
      $('gfName').hidden = !reg; $('gfPass2').hidden = !reg;
      $('gPass').setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
      $('gSub').textContent = wait ? '' : reg ? 'הרשמה: יוצרים חשבון פעם אחת, וזהו' : 'נכנסים עם הטלפון והסיסמה';
      $('gGo').textContent = reg ? 'הרשמה ויאללה' : 'כניסה';
      $('gForgot').textContent = reg ? 'כבר יש לי חשבון: כניסה' : 'אין לי חשבון: הרשמה';
      $('gErr').textContent = '';
      [...$('gForm').children].forEach((c) => { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; });
    }
    function fail(msg) { $('gErr').textContent = msg; const c = g.querySelector('.g-card'); c.classList.remove('shk'); void c.offsetWidth; c.classList.add('shk'); sfx.untick(); try { navigator.vibrate && navigator.vibrate([30, 40, 30]); } catch (e) {} }
    async function signIn(phone, pass) {
      const { data, error } = await sb.auth.signInWithPassword({ email: phone + PHONE_MAIL, password: pass });
      if (error) return fail(netErr(error) ? 'אין חיבור לאינטרנט. נסה שוב' : 'הטלפון או הסיסמה לא נכונים');
      sbUser = data.user; authRec = userRec(sbUser); open();
    }
    $('gForm').addEventListener('input', () => { $('gErr').textContent = ''; });
    $('gForm').addEventListener('submit', async (e) => {
      e.preventDefault(); if (busy) return;
      if (!sb) return fail('אין חיבור לשרת. בדוק אינטרנט ורענן');
      const phone = normPhone($('gPhone').value), pass = $('gPass').value;
      if (!/^0\d{8,9}$/.test(phone)) return fail('מספר טלפון לא תקין. לדוגמה 050-1234567');
      if (!pass) return fail('צריך סיסמה');
      busy = true; $('gGo').disabled = true;
      try {
        if (mode === 'register') {
          const name = $('gName').value.trim();
          if (!name) { fail('מה השם שלך?'); return; }
          if (pass.length < 6) { fail('סיסמה של 6 תווים לפחות'); return; }
          if (pass !== $('gPass2').value) { fail('הסיסמאות לא זהות'); return; }
          const res = await fetch(SB_URL + '/functions/v1/register', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY }, body: JSON.stringify({ name, phone, password: pass }) });
          if (res.status === 409) { show('login'); $('gPhone').value = phone; fail('המספר הזה כבר רשום. נכנסים עם הסיסמה'); return; }
          if (!res.ok) { fail('ההרשמה נכשלה. נסה שוב'); return; }
        }
        await signIn(phone, pass);
      } catch (er) { fail(netErr(er) ? 'אין חיבור לאינטרנט. נסה שוב' : 'משהו השתבש. נסה שוב'); }
      finally { busy = false; $('gGo').disabled = false; }
    });
    $('gForgot').addEventListener('click', () => { const ph = $('gPhone').value; show(mode === 'register' ? 'login' : 'register'); $('gPhone').value = ph; sfx.tick(); });
    // decide: a remembered session opens straight away, otherwise the form
    g.hidden = false; show('wait');
    (async () => {
      let session = null, remembered = false;
      try { remembered = localStorage.getItem(REM_LS) === '1' || sessionStorage.getItem(SES_KEY) === '1'; } catch (e) {}
      try { if (sb) session = (await sb.auth.getSession()).data.session; } catch (e) {}
      if (session && !remembered) { try { await sb.auth.signOut(); } catch (e) {} session = null; }
      if (session) { sbUser = session.user; authRec = userRec(sbUser); g.hidden = true; open(); return; }
      let known = false; try { known = localStorage.getItem(KNOWN_LS) === '1'; } catch (e) {}
      show(known ? 'login' : 'register');
    })();
  }
  function paintLogout() { const b = $('logout'); if (b) b.hidden = !sbUser; }
  $('logout').addEventListener('click', async () => {
    try { localStorage.removeItem(REM_LS); sessionStorage.removeItem(SES_KEY); localStorage.removeItem(LS_KEY); } catch (e) {}
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  });
''')
rep('<p class="g-note">הסיסמה נשמרת מוצפנת בחשבון שלך בלבד</p>', '<p class="g-note">החשבון והנתונים נשמרים מוצפנים בענן</p>')

# ---------- change password ----------
cut("      if ((await hashPass(old, authRec.salt", "setAuthRec(rec); queueWrite('auth', rec);\n", '''      const v = await sb.auth.signInWithPassword({ email: authRec.phone + PHONE_MAIL, password: old });
      if (v.error) { $('pwGo').disabled = false; return msg(netErr(v.error) ? 'אין חיבור לאינטרנט' : 'הסיסמה הנוכחית לא נכונה'); }
      const u = await sb.auth.updateUser({ password: nw });
      if (u.error) throw u.error;
''')
rep("    if (!authRec) return msg('אין חשבון מחובר. התנתק ונרשם מחדש');", "    if (!sb || !sbUser || !authRec) return msg('צריך להיות מחובר');")

# ---------- push notifications (iPhone home-screen app, iOS 16.4+) ----------
rep('''      <div class="rems" id="rems"></div>''', '''      <div class="push" id="pushBox"><span class="push-ic" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2H4.5z"/><path d="M10 20.5a2.2 2.2 0 004 0"/></svg></span><span class="push-l"><b id="pushT">התראות לאייפון</b><span id="pushS"></span></span><button type="button" class="push-go" id="pushGo" hidden></button></div>
      <div class="rems" id="rems"></div>''')
s = re.sub(r'\s*<details class="ios" id="iosHelp">.*?</details>', '', s, flags=re.S)
rep('''      <p class="acc-note">מדליקים מטרה ובוחרים שעה. כשהאפליקציה פתוחה, התזכורת קופצת למעלה בסגנון אי דינמי, וגם טיימר המנוחה ממשיך שם כשסוגרים את מסך האימון.</p>''',
    '''      <p class="acc-note">מדליקים מטרה ובוחרים שעה. אחרי שמפעילים התראות, התזכורת מגיעה לאייפון גם כשהאפליקציה סגורה, אלא אם כבר סימנת את המטרה. גם סוף מנוחה באימון שולח התראה.</p>''')
s = re.sub(r"\s*'<a class=\"cal\" href=.*?</a></div>';", "\n        '</div>';", s, flags=re.S)
rep('.pw { display: flex;', '''.push { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; padding: 14px; border-radius: 20px; background: var(--ink); color: var(--paper); position: relative; overflow: hidden; isolation: isolate; }
.push::before { content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; background: var(--holo); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: spinang 4s linear infinite; pointer-events: none; }
.push-ic { width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center; background: var(--holo-lin); background-size: 200% 100%; animation: slide 3s linear infinite; color: var(--ink); }
.push.on .push-ic { animation: slide 3s linear infinite, beat 2.4s ease-in-out infinite; }
.push-l { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.push-l b { font-size: 15.5px; font-weight: 800; }
.push-l span { font-size: 12.5px; line-height: 1.45; color: rgba(242,243,245,.68); }
.push-go { height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: var(--paper); color: var(--ink); font-weight: 800; font-size: 14px; transition: transform .35s var(--spring); }
.push-go:active { transform: scale(.92); }
.push-go:disabled { opacity: .5; }
.pw { display: flex;''')

push_js = r'''
  // ---------- web push ----------
  const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const pushReady = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let pushOn = false, swReg = null;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then((r) => { swReg = r; paintPush(); }).catch(() => {});
  const b64ToBytes = (b) => { const p = '='.repeat((4 - b.length % 4) % 4); const raw = atob((b + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
  async function paintPush() {
    const box = $('pushBox'); if (!box) return;
    let t = 'התראות לאייפון', sub = '', btn = '';
    pushOn = false;
    if (!sbUser) sub = 'צריך להיות מחובר';
    else if (isIOS && !isStandalone()) { t = 'קודם מוסיפים למסך הבית'; sub = 'בספארי: כפתור השיתוף ואז "הוספה למסך הבית". אחר כך פותחים מהאייקון ומפעילים כאן.'; }
    else if (!pushReady()) { t = 'התראות לא נתמכות כאן'; sub = 'באייפון צריך iOS 16.4 ומעלה, ולפתוח מהאייקון במסך הבית'; }
    else if (Notification.permission === 'denied') { t = 'ההתראות חסומות'; sub = 'הגדרות באייפון, התראות, ניהול יום, ולאפשר'; }
    else {
      try { const reg = swReg || await navigator.serviceWorker.ready; const s = await reg.pushManager.getSubscription(); pushOn = !!s && Notification.permission === 'granted'; } catch (e) {}
      if (pushOn) { t = 'התראות פעילות'; sub = 'תזכורות וסוף מנוחה מגיעים גם כשהאפליקציה סגורה'; btn = 'בדיקה'; }
      else { sub = 'לקבל תזכורות וסוף מנוחה גם כשהאפליקציה סגורה'; btn = 'הפעלה'; }
    }
    $('pushT').textContent = t; $('pushS').textContent = sub;
    const b = $('pushGo'); b.hidden = !btn; b.textContent = btn; b.disabled = false;
    box.classList.toggle('on', pushOn);
  }
  async function enablePush() {
    const b = $('pushGo'); b.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { paintPush(); return; }
      const reg = swReg || await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch(SB_URL + '/functions/v1/send-push', { headers: { apikey: SB_KEY } })).json();
      let s = await reg.pushManager.getSubscription();
      if (!s) s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
      const j = s.toJSON();
      let tz = 'Asia/Jerusalem'; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch (e) {}
      const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, user_id: sbUser.id, p256dh: j.keys.p256dh, auth: j.keys.auth, tz });
      if (error) throw error;
      sfx.done(); island.notify({ title: 'ההתראות הופעלו', sub: 'מעכשיו התזכורות מגיעות גם כשהאפליקציה סגורה', stay: 4000 });
    } catch (e) { island.notify({ title: 'ההפעלה נכשלה', sub: 'בדוק אינטרנט ונסה שוב', stay: 5000 }); }
    paintPush();
  }
  async function testPush() {
    const b = $('pushGo'); b.disabled = true;
    const { error } = await sb.from('push_queue').insert({ kind: 'rest', tag: 'test', send_at: new Date(Date.now() + 5000).toISOString(), title: 'בדיקה: ההתראות עובדות', body: 'אפשר לנעול את המסך. ההתראה תגיע בעוד כמה שניות' });
    island.notify({ title: error ? 'הבדיקה נכשלה' : 'נשלחה התראת בדיקה', sub: error ? 'נסה שוב' : 'נעל את המסך, היא תגיע תוך כ־15 שניות', stay: 5000 });
    setTimeout(() => { b.disabled = false; }, 4000);
  }
  $('pushGo').addEventListener('click', () => { if (pushOn) testPush(); else enablePush(); });
  // the rest timer also exists on the server, so it rings when the phone is locked
  let restPushT = 0;
  function syncRestPush() {
    if (!pushOn || !sb || !sbUser) return;
    clearTimeout(restPushT);
    restPushT = setTimeout(async () => {
      try {
        await sb.from('push_queue').delete().eq('kind', 'rest').eq('tag', 'rest').is('sent_at', null);
        if (wk.sess && wk.mode === 'rest' && wk.end > Date.now() + 3000) {
          const it = wk.items[wk.i], n = it ? nSets(it) : 0, d = wk.done[wk.i] || 0;
          const nx = it ? (d >= n && wk.items[wk.i + 1] ? 'הבא: ' + EX[wk.items[wk.i + 1].key].n : EX[it.key].n + ' · סט ' + Math.min(n, d + 1) + '/' + n) : '';
          await sb.from('push_queue').insert({ kind: 'rest', tag: 'rest', send_at: new Date(wk.end).toISOString(), title: 'המנוחה נגמרה, יאללה', body: nx });
        }
      } catch (e) {}
    }, 250);
  }
'''
rep('  // ---------- change password ----------', push_js + '\n  // ---------- change password ----------')
rep("  function startTimer(mode, sec) { wk.mode = mode; wk.total = sec; wk.end = Date.now() + sec * 1000; wk.last = -1; paintWk(); }",
    "  function startTimer(mode, sec) { wk.mode = mode; wk.total = sec; wk.end = Date.now() + sec * 1000; wk.last = -1; paintWk(); syncRestPush(); }")
rep("    wk.mode = 'set';\n    if (wk.done[wk.i] >= nSets", "    wk.mode = 'set'; syncRestPush();\n    if (wk.done[wk.i] >= nSets")
rep("  $('wkPlus').addEventListener('click', () => { wk.end += 10000; wk.total += 10; sfx.tick(); });",
    "  $('wkPlus').addEventListener('click', () => { wk.end += 10000; wk.total += 10; sfx.tick(); syncRestPush(); });")
rep("wk.end -= 10000; wk.total = Math.max(10, wk.total - 10); wk.last = -1; sfx.tick(); });",
    "wk.end -= 10000; wk.total = Math.max(10, wk.total - 10); wk.last = -1; sfx.tick(); syncRestPush(); });")
# with push on, the server sends reminders; the in-app island stays for when push is off
rep("    const gt = $('gate'); if (gt && !gt.hidden) return;", "    const gt = $('gate'); if ((gt && !gt.hidden) || pushOn) return;")
rep("    if (v === 'acc') {\n      paintAcc(); buildRems();", "    if (v === 'acc') {\n      paintAcc(); buildRems(); paintPush();")

rep("row.querySelector('.cal').href = calUrl(g, r);", "")
(ROOT / 'index.html').write_text(s, encoding='utf-8')
print('wrote index.html', len(s))
