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
''', (ROOT / 'tools' / 'gate.js').read_text(encoding='utf-8'))
# gate markup: one field for email or phone, a reset link, and a "check your email" panel
rep('<label class="g-f" style="--s:1"><span>טלפון</span><input id="gPhone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" maxlength="16" placeholder="050-1234567"></label>',
    '<label class="g-f" id="gfId" style="--s:1"><span id="gIdL">מייל</span><input id="gPhone" type="email" autocomplete="email" autocapitalize="off" spellcheck="false" dir="ltr" maxlength="80" placeholder="name@gmail.com"></label>')
rep('<label class="g-f" style="--s:2"><span>סיסמה</span>', '<label class="g-f" id="gfPass" style="--s:2"><span id="gPassL">סיסמה</span>')
rep('<label class="g-rem" style="--s:4">', '<label class="g-rem" id="gfRem" style="--s:4">')
rep('    <button class="g-link" id="gForgot" type="button" hidden>שכחתי סיסמה</button>',
    '''    <div class="g-sent" id="gSent" hidden><div class="g-sent-ic" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/></svg></div><b id="gSentT"></b><p id="gSentS"></p><button class="g-link" id="gResend" type="button" hidden>שליחה חוזרת</button></div>
    <button class="g-link" id="gReset" type="button" hidden>שכחתי סיסמה</button>
    <button class="g-link" id="gForgot" type="button" hidden>שכחתי סיסמה</button>''')
rep('.g-wait {', '''.g-sent { text-align: center; padding: 6px 0 4px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.g-sent-ic { width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center; background: var(--holo-lin); background-size: 300% 100%; animation: slide 3s linear infinite, beat 2.4s ease-in-out infinite; color: var(--ink); }
.g-sent-ic .i { width: 30px; height: 30px; }
.g-sent b { font-size: 22px; font-weight: 900; }
.g-sent p { margin: 0; font-size: 14px; line-height: 1.6; color: rgba(242,243,245,.72); }
#gReset { margin-top: 10px; }
#gReset + #gForgot { margin-top: 6px; }
.g-wait {''')
rep("    $('accPhone').textContent = authRec ? maskPhone(authRec.phone) : 'נשמר בדפדפן הזה';", "    $('accPhone').textContent = authRec ? (authRec.email || maskPhone(authRec.phone)) : 'נשמר בדפדפן הזה';")
rep('<p class="g-note">הסיסמה נשמרת מוצפנת בחשבון שלך בלבד</p>', '<p class="g-note">החשבון והנתונים נשמרים מוצפנים בענן</p>')

# ---------- change password ----------
cut("      if ((await hashPass(old, authRec.salt", "setAuthRec(rec); queueWrite('auth', rec);\n", '''      const v = await sb.auth.signInWithPassword({ email: authRec.login, password: old });
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

# ---------- coach: onboarding questions and a personal program for everyone but the owner ----------
OWNER_IDS = ['dfdf0d4d-ad6e-48bf-9e58-4cfdc3cb724c']  # Imri's account: keeps his own A/B program, never gets the questions
C = ROOT / 'tools' / 'coach'
rep('</style>', (C / 'coach.css').read_text(encoding='utf-8') + '</style>')
rep('<div class="intro" id="intro"', (C / 'coach.html').read_text(encoding='utf-8') + '\n<div class="intro" id="intro"')
PW = '    <section class="sec">\n      <div class="sechead"><h2>שינוי סיסמה</h2>'
rep(PW, (C / 'prog.html').read_text(encoding='utf-8') + PW)
rep('  // ---------- change password ----------', (C / 'coach.js').read_text(encoding='utf-8').replace('__OWNER_IDS__', repr(OWNER_IDS)) + '\n  // ---------- change password ----------')
rep("      paintAcc(); buildRems(); paintPush();", "      paintAcc(); buildRems(); paintPush(); paintProg();")


# ---------- admin tab + view (owner only) ----------
A = ROOT / 'tools' / 'admin'
rep('</style>', (A / 'admin.css').read_text(encoding='utf-8') + '</style>')
# the admin view sits after the account view
rep('</div>\n\n<nav class="tabbar"', '</div>\n\n' + (A / 'admin.html').read_text(encoding='utf-8') + '<nav class="tabbar"')
# third tab button, hidden until we know the viewer is the owner
rep('</b></button>\n</nav>', '</b></button>\n  <button class="tb" data-view="admin" id="tbAdmin" hidden><svg class="i" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.5C7.9 18.4 5 15.2 5 11V6z"/><path d="M9 12l2 2 4-4"/></svg><span>ניהול</span></button>\n</nav>')
# setView: handle the admin view, its indicator slot, and load the list on open
rep("    $('vHome').hidden = v !== 'home'; $('vAcc').hidden = v !== 'acc';",
    "    $('vHome').hidden = v !== 'home'; $('vAcc').hidden = v !== 'acc'; { const va = $('vAdmin'); if (va) va.hidden = v !== 'admin'; }\n    $('tabbar').style.setProperty('--ti', v === 'admin' ? 2 : v === 'acc' ? 1 : 0);")
rep("    } else build('');\n    sfx.whoosh();",
    "    } else if (v === 'admin') { paintAdmin(); loadAdmin(); } else build('');\n    sfx.whoosh();")
# reveal the admin tab for the owner when the gate opens
rep("  function paintLogout() { const b = $('logout'); if (b) b.hidden = !sbUser; }",
    "  function paintLogout() { const b = $('logout'); if (b) b.hidden = !sbUser; const a = $('tbAdmin'); if (a) { a.hidden = !isAdmin(); $('tabbar').classList.toggle('adm3', isAdmin()); } }")
# the admin script
rep('  // ---------- admin (owner only) ----------' if False else '  // ---------- change password ----------',
    (A / 'admin.js').read_text(encoding='utf-8').replace('__OWNER_IDS__', repr(OWNER_IDS)) + '\n  // ---------- change password ----------')

(ROOT / 'index.html').write_text(s, encoding='utf-8')
print('wrote index.html', len(s))
