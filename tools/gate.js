  // ---------- sign-up / sign-in gate (Supabase Auth) ----------
  // New accounts sign up with email + password and confirm by a link in the email; "forgot password" sends a reset link.
  // Older accounts were made from the phone number (<phone>@phone.nihulyom.app) and still sign in with the phone.
  const REM_LS = 'daily-goals-remember', SES_KEY = 'daily-goals-in', KNOWN_LS = 'ny-known';
  const SITE = location.origin + location.pathname;
  let authRec = null;
  let storeSettled = false; const settleWaiters = [];
  function settle() { if (storeSettled) return; storeSettled = true; settleWaiters.splice(0).forEach((f) => f()); }
  function setAuthRec(r) { authRec = r; }
  const normPhone = (x) => { let d = String(x || '').replace(/\D/g, ''); if (d.startsWith('972')) d = '0' + d.slice(3); return d; };
  const userRec = (u) => {
    const m = (u && u.user_metadata) || {}, em = (u && u.email) || '', ph = em.endsWith(PHONE_MAIL);
    return { name: m.name || '', phone: m.phone || (ph ? em.split('@')[0] : ''), email: ph ? '' : em, login: em };
  };
  const netErr = (e) => /fetch|network|load failed|timeout/i.test(String((e && e.message) || e || ''));
  const isMail = (x) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(x);
  const HASH = location.hash || '';
  const RECOVERY = /type=recovery/.test(HASH), FROM_LINK = /access_token=/.test(HASH);
  function gate(onOpen) {
    const g = $('gate');
    let mode = '', busy = false, lastMail = '';
    function open() {
      try { sessionStorage.setItem(SES_KEY, '1'); localStorage.setItem(KNOWN_LS, '1'); if ($('gRem').checked) localStorage.setItem(REM_LS, '1'); else localStorage.removeItem(REM_LS); } catch (e) {}
      if (FROM_LINK) try { history.replaceState(null, '', SITE); } catch (e) {}
      paintLogout(); initStore(); paintPush(); if (storeSettled) coachCheck(); else settleWaiters.push(coachCheck);
      if (g.hidden) { g.remove(); onOpen(); return; }
      sfx.boom(); try { navigator.vibrate && navigator.vibrate([20, 40, 60]); } catch (e) {}
      g.classList.add('out'); onOpen();
      setTimeout(() => g.remove(), 780);
    }
    // modes: wait, login, register, forgot, sent (check your email), newpass (came from a reset link)
    function show(m, info) {
      mode = m;
      const reg = m === 'register', wait = m === 'wait', sent = m === 'sent', forgot = m === 'forgot', np = m === 'newpass';
      $('gForm').hidden = wait || sent; $('gWait').hidden = !wait; $('gSent').hidden = !sent;
      $('gForgot').hidden = wait || np; $('gReset').hidden = m !== 'login';
      $('gfName').hidden = !reg; $('gfId').hidden = np; $('gfPass').hidden = forgot; $('gfPass2').hidden = !(reg || np); $('gfRem').hidden = forgot;
      $('gIdL').textContent = reg || forgot ? 'מייל' : 'מייל או טלפון';
      $('gPhone').type = reg || forgot ? 'email' : 'text';
      $('gPhone').placeholder = reg || forgot ? 'name@gmail.com' : 'מייל או 050-1234567';
      $('gPhone').setAttribute('autocomplete', reg || forgot ? 'email' : 'username');
      $('gPassL').textContent = np ? 'סיסמה חדשה' : 'סיסמה';
      $('gPass').setAttribute('autocomplete', reg || np ? 'new-password' : 'current-password');
      $('gPass').placeholder = reg || np ? '6 תווים לפחות' : '••••••';
      $('gSub').textContent = wait || sent ? '' : reg ? 'נרשמים עם מייל. נשלח לך קישור לאישור' : forgot ? 'נשלח לך למייל קישור לבחירת סיסמה חדשה' : np ? 'בחר סיסמה חדשה לחשבון' : 'נכנסים עם המייל או הטלפון והסיסמה';
      $('gGo').textContent = reg ? 'הרשמה' : forgot ? 'שליחת קישור' : np ? 'שמירה וכניסה' : 'כניסה';
      $('gForgot').textContent = reg ? 'כבר יש לי חשבון: כניסה' : forgot || sent ? 'חזרה לכניסה' : 'אין לי חשבון: הרשמה';
      if (sent) { $('gSentT').textContent = info && info.title || ''; $('gSentS').textContent = info && info.sub || ''; $('gResend').hidden = !(info && info.resend); }
      $('gErr').textContent = '';
      [...$('gForm').children].forEach((c) => { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = ''; });
    }
    function fail(msg) { $('gErr').textContent = msg; const c = g.querySelector('.g-card'); c.classList.remove('shk'); void c.offsetWidth; c.classList.add('shk'); sfx.untick(); try { navigator.vibrate && navigator.vibrate([30, 40, 30]); } catch (e) {} }
    const sentSignup = (em) => { lastMail = em; show('sent', { title: 'בדוק את המייל', sub: 'שלחנו קישור אישור ל־' + em + '. לוחצים עליו, ואז חוזרים לכאן ונכנסים עם המייל והסיסמה. לא הגיע? בדוק גם בספאם.', resend: true }); sfx.done && sfx.done(); };
    async function signIn(id, pass) {
      const email = isMail(id) ? id.toLowerCase() : normPhone(id) + PHONE_MAIL;
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) {
        if (netErr(error)) return fail('אין חיבור לאינטרנט. נסה שוב');
        if (/confirm/i.test(error.message || '')) { lastMail = email; return show('sent', { title: 'עוד לא אישרת את המייל', sub: 'פתח את המייל ששלחנו ל־' + email + ' ולחץ על הקישור. אפשר לשלוח אותו שוב.', resend: true }); }
        return fail(isMail(id) ? 'המייל או הסיסמה לא נכונים' : 'הטלפון או הסיסמה לא נכונים');
      }
      sbUser = data.user; authRec = userRec(sbUser); open();
    }
    $('gForm').addEventListener('input', () => { $('gErr').textContent = ''; });
    $('gForm').addEventListener('submit', async (e) => {
      e.preventDefault(); if (busy) return;
      if (!sb) return fail('אין חיבור לשרת. בדוק אינטרנט ורענן');
      const id = $('gPhone').value.trim(), pass = $('gPass').value;
      busy = true; $('gGo').disabled = true;
      try {
        if (mode === 'newpass') {
          if (pass.length < 6) return fail('סיסמה של 6 תווים לפחות');
          if (pass !== $('gPass2').value) return fail('הסיסמאות לא זהות');
          const { data, error } = await sb.auth.updateUser({ password: pass });
          if (error) return fail(netErr(error) ? 'אין חיבור לאינטרנט. נסה שוב' : /different|same/i.test(error.message || '') ? 'זו הסיסמה הקודמת. בחר אחרת' : 'הקישור פג תוקף. בקש קישור חדש');
          sbUser = data.user; authRec = userRec(sbUser); island.notify({ title: 'הסיסמה עודכנה', sub: 'מעכשיו נכנסים עם החדשה', stay: 4000 }); open(); return;
        }
        if (mode === 'forgot') {
          if (!isMail(id)) return fail(/^\D*0\d/.test(id) ? 'לחשבון שנפתח עם טלפון אין מייל. דבר עם אימרי' : 'צריך מייל תקין');
          const { error } = await sb.auth.resetPasswordForEmail(id.toLowerCase(), { redirectTo: SITE });
          if (error) return fail(netErr(error) ? 'אין חיבור לאינטרנט. נסה שוב' : /rate|seconds/i.test(error.message || '') ? 'ביקשת לפני רגע. חכה דקה ונסה שוב' : 'השליחה נכשלה. נסה שוב');
          return show('sent', { title: 'בדוק את המייל', sub: 'אם יש חשבון עם ' + id + ', שלחנו אליו קישור לבחירת סיסמה חדשה. לא הגיע? בדוק גם בספאם.' });
        }
        if (!id) return fail(mode === 'register' ? 'צריך מייל' : 'צריך מייל או טלפון');
        if (!pass) return fail('צריך סיסמה');
        if (mode === 'register') {
          const name = $('gName').value.trim();
          if (!name) return fail('מה השם שלך?');
          if (!isMail(id)) return fail('מייל לא תקין. לדוגמה name@gmail.com');
          if (pass.length < 6) return fail('סיסמה של 6 תווים לפחות');
          if (pass !== $('gPass2').value) return fail('הסיסמאות לא זהות');
          const email = id.toLowerCase();
          const { data, error } = await sb.auth.signUp({ email, password: pass, options: { data: { name }, emailRedirectTo: SITE } });
          if (error) return fail(netErr(error) ? 'אין חיבור לאינטרנט. נסה שוב' : /registered|exists/i.test(error.message || '') ? 'המייל הזה כבר רשום. נכנסים עם הסיסמה' : /rate|seconds/i.test(error.message || '') ? 'יותר מדי ניסיונות. חכה דקה ונסה שוב' : 'ההרשמה נכשלה. נסה שוב');
          if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) { show('login'); $('gPhone').value = email; return fail('המייל הזה כבר רשום. נכנסים עם הסיסמה'); }
          if (data.session) { sbUser = data.user; authRec = userRec(sbUser); open(); return; }
          return sentSignup(email);
        }
        if (!isMail(id) && !/^0\d{8,9}$/.test(normPhone(id))) return fail('צריך מייל, או טלפון כמו 050-1234567');
        await signIn(id, pass);
      } catch (er) { fail(netErr(er) ? 'אין חיבור לאינטרנט. נסה שוב' : 'משהו השתבש. נסה שוב'); }
      finally { busy = false; $('gGo').disabled = false; }
    });
    $('gForgot').addEventListener('click', () => { const v = $('gPhone').value; show(mode === 'login' ? 'register' : 'login'); $('gPhone').value = v; sfx.tick(); });
    $('gReset').addEventListener('click', () => { const v = $('gPhone').value; show('forgot'); if (isMail(v)) $('gPhone').value = v; sfx.tick(); });
    $('gResend').addEventListener('click', async () => {
      const b = $('gResend'); b.disabled = true;
      try { const { error } = await sb.auth.resend({ type: 'signup', email: lastMail, options: { emailRedirectTo: SITE } }); b.textContent = error ? 'חכה דקה ונסה שוב' : 'נשלח שוב'; }
      catch (e) { b.textContent = 'אין חיבור. נסה שוב'; }
      setTimeout(() => { b.disabled = false; b.textContent = 'שליחה חוזרת'; }, 30000);
    });
    // decide: a reset link asks for a new password, a confirm link or remembered session opens straight away, otherwise the form
    g.hidden = false; show('wait');
    (async () => {
      let session = null, remembered = FROM_LINK;
      try { remembered = remembered || localStorage.getItem(REM_LS) === '1' || sessionStorage.getItem(SES_KEY) === '1'; } catch (e) {}
      try { if (sb) session = (await sb.auth.getSession()).data.session; } catch (e) {}
      if (RECOVERY && session) { try { history.replaceState(null, '', SITE); } catch (e) {} show('newpass'); return; }
      if (RECOVERY) { show('forgot'); fail('הקישור פג תוקף. שלח קישור חדש'); return; }
      if (session && !remembered) { try { await sb.auth.signOut(); } catch (e) {} session = null; }
      if (session) { sbUser = session.user; authRec = userRec(sbUser); g.hidden = true; open(); return; }
      let known = false; try { known = localStorage.getItem(KNOWN_LS) === '1'; } catch (e) {}
      show(known ? 'login' : 'register');
      if (/error_code=otp_expired|error=access_denied/.test(HASH)) fail('הקישור פג תוקף. נכנסים כאן, ואם צריך שולחים שוב');
    })();
  }
  function paintLogout() { const b = $('logout'); if (b) b.hidden = !sbUser; }
  $('logout').addEventListener('click', async () => {
    try { localStorage.removeItem(REM_LS); sessionStorage.removeItem(SES_KEY); localStorage.removeItem(LS_KEY); } catch (e) {}
    try { await sb.auth.signOut(); } catch (e) {}
    location.reload();
  });
