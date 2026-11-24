
  // ---------- coach: questions for new users, then a personal program (AI on the server, rules as a fallback) ----------
  // The owner keeps his own A/B program and is never asked.
  const OWNER_PHONES = __OWNER_PHONES__;
  const isOwner = () => !!authRec && (OWNER_PHONES.length ? OWNER_PHONES.includes(normPhone(authRec.phone)) : /^אימרי/.test((authRec.name || '').trim()));
  const DAYN = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  const DAYL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const CO_GOALS = [['cut', '🔥', 'חיטוב', 'להוריד שומן ולהיראות חטוב'], ['mass', '💪', 'מסת שריר', 'לעלות במשקל ולבנות שריר'], ['strength', '🏋️', 'כוח', 'להרים יותר כבד'], ['fit', '❤️', 'כושר כללי', 'להרגיש טוב, בריא וחזק']];
  const CO_LEVEL = [['none', '🌱', 'אף פעם לא התאמנתי', 'מתחילים מאפס, וזה מעולה'], ['past', '↩️', 'התאמנתי בעבר', 'אבל לא בתקופה האחרונה'], ['some', '📈', 'מתאמן פחות משנה', 'יש בסיס, רוצה להתקדם'], ['exp', '⚡', 'מתאמן יותר משנה', 'מכיר את התרגילים']];
  const CO_CARDIO = [['none', '🛋️', 'כמעט לא', 'לא עושה ספורט בדרך כלל'], ['sometimes', '🚶', 'מדי פעם', 'הליכה, ריצה או משחק פה ושם'], ['regular', '🏃', 'באופן קבוע', 'ריצה או ספורט כמה פעמים בשבוע']];
  const CO_WHERE = [['gym', '🏢', 'בחדר כושר', 'מכונות, כבלים ומשקולות'], ['home', '🏠', 'בבית', 'משקולות יד, מוט מתח ומשקל גוף']];
  const lbl = (arr, v) => (arr.find((x) => x[0] === v) || [, , v])[2];
  const co = { step: 0, a: {}, res: null, mode: 'new', busy: false };
  const CO_STEPS = ['goal', 'body', 'level', 'cardio', 'days', 'where', 'injuries', 'build'];
  const optsHtml = (arr, key) => '<div class="co-opts">' + arr.map((o, i) => '<button type="button" class="co-opt' + (co.a[key] === o[0] ? ' on' : '') + '" data-q="' + key + '" data-v="' + o[0] + '" style="--s:' + i + '"><span class="em">' + o[1] + '</span><span><b>' + esc(o[2]) + '</b><small>' + esc(o[3]) + '</small></span></button>').join('') + '</div>';
  const numF = (id, label, ph, v) => '<label class="g-f"><span>' + label + '</span><input id="' + id + '" type="number" inputmode="decimal" dir="ltr" placeholder="' + ph + '" value="' + (v == null ? '' : esc(v)) + '"></label>';
  const suggestDays = () => co.a.level === 'exp' ? [0, 1, 3, 4] : [0, 2, 4];
  function coPaint(dir) {
    const st = CO_STEPS[co.step], A = co.a, body = $('coBody');
    $('coBar').style.setProperty('--p', Math.round((co.step + (st === 'result' ? 1 : 0)) / (CO_STEPS.length - 1) * 100) + '%');
    $('coBack').disabled = co.step === 0 || st === 'build';
    $('coSkip').textContent = co.mode === 'new' ? 'אחר כך' : 'ביטול';
    let h = '', n = co.step + 1;
    const head = (q, sub) => '<span class="co-k">שאלה ' + n + ' מתוך 7</span><h2 class="co-q">' + q + '</h2>' + (sub ? '<p class="co-h">' + sub + '</p>' : '');
    if (st === 'goal') h = head((co.mode === 'new' && authRec && authRec.name ? esc(authRec.name) + ', ' : '') + 'מה <span class="holo">המטרה</span> שלך?', 'נבנה לך תוכנית אימון אישית. לוקח פחות מדקה.') + optsHtml(CO_GOALS, 'goal');
    else if (st === 'body') h = head('קצת <span class="holo">עליך</span>', 'כדי להתאים את העומס. אפשר לדלג על מה שלא בא לך למלא.') +
      '<div class="co-seg"><button type="button" class="co-chip' + (A.sex !== 'f' ? ' on' : '') + '" data-sex="m">גבר</button><button type="button" class="co-chip' + (A.sex === 'f' ? ' on' : '') + '" data-sex="f">אישה</button></div>' +
      '<div class="co-grid">' + numF('coAge', 'גיל', '25', A.age) + numF('coH', 'גובה (ס״מ)', '175', A.height) + numF('coW', 'משקל היום (ק״ג)', '75', A.weight) + numF('coT', 'לאן רוצה להגיע (ק״ג)', '70', A.target) + '</div>' +
      '<div class="co-err" id="coErr"></div><button type="button" class="g-go co-go" id="coNext">המשך</button>';
    else if (st === 'level') h = head('התאמנת <span class="holo">בעבר?</span>') + optsHtml(CO_LEVEL, 'level');
    else if (st === 'cardio') h = head('כמה אתה <span class="holo">בתנועה?</span>', 'פעילות אירובית או ספורט, חוץ מאימוני כוח') + optsHtml(CO_CARDIO, 'cardio');
    else if (st === 'days') {
      if (!Array.isArray(A.days)) A.days = suggestDays();
      h = head('באילו <span class="holo">ימים</span> תתאמן?', 'סימנו לך המלצה. למתחילים 3 ימים עם יום מנוחה ביניהם זה מושלם.') +
        '<div class="co-days">' + DAYN.map((d, i) => '<button type="button" class="co-chip' + (A.days.includes(i) ? ' on' : '') + '" data-day="' + i + '" aria-label="' + DAYL[i] + '">' + d + '</button>').join('') + '</div>' +
        '<p class="co-h" id="coDaysN" style="text-align:center;margin:0"></p><button type="button" class="g-go co-go" id="coNext">המשך</button>';
    } else if (st === 'where') h = head('איפה <span class="holo">מתאמנים?</span>') + optsHtml(CO_WHERE, 'where');
    else if (st === 'injuries') h = head('יש <span class="holo">פציעה</span> או מגבלה?', 'למשל כאב בגב התחתון או בברך. אם אין, פשוט ממשיכים.') +
      '<textarea class="co-ta" id="coInj" maxlength="200" placeholder="אין">' + esc(A.injuries || '') + '</textarea><button type="button" class="g-go co-go" id="coNext">תבנה לי תוכנית</button>';
    else if (st === 'build') h = '<div class="co-load"><div class="co-orb"></div><b>בונה לך תוכנית…</b><span id="coLoadT">מתאים תרגילים למטרה שלך</span></div>';
    else if (st === 'result') {
      const r = co.res;
      h = '<span class="co-k">' + (co.mode === 'change' ? 'התוכנית המעודכנת' : 'התוכנית שלך') + '</span><h2 class="co-q"><span class="holo">' + esc(r.title) + '</span></h2>' +
        '<div class="co-res"><p class="why">' + esc(r.why) + '</p><div class="co-tags"><span>' + esc(lbl(CO_GOALS, A.goal)) + '</span><span>' + (A.days || []).length + ' ימים: ' + (A.days || []).map((d) => DAYN[d]).join(' ') + '</span><span>מנוחה ' + r.rest + ' שנ׳</span></div></div>' +
        r.workouts.map((w, i) => '<div class="co-w" style="--s:' + i + '"><h4><i>' + (i + 1) + '</i>' + esc(w.title) + '</h4><ol>' + w.items.filter((x) => EX[x[0]]).map((x) => '<li><span>' + esc(EX[x[0]].n) + '</span><span>' + esc(x[1]) + '</span></li>').join('') + '</ol></div>').join('') +
        '<p class="co-h">האימונים מתחלפים לפי הסדר בימים שבחרת. אפשר לשנות סטים, חזרות ותרגילים בכל אימון, ולבקש שינוי בחשבון תחת "תוכנית אימון".</p>' +
        '<div class="co-err" id="coErr"></div><button type="button" class="g-go co-go" id="coSave">יאללה, מתחילים</button><button type="button" class="co-ghost" id="coAgain">' + (co.mode === 'change' ? 'להשאיר את הקודמת' : 'לענות שוב') + '</button>';
    }
    body.innerHTML = '<div class="co-step' + (dir < 0 ? ' back' : '') + '">' + h + '</div>';
    body.scrollTop = 0;
    if (st === 'days') coDaysN();
  }
  function coDaysN() { const n = co.a.days.length, e = $('coDaysN'); if (e) e.textContent = n ? n + ' ימים בשבוע' : 'בחר לפחות יום אחד'; const b = $('coNext'); if (b) b.disabled = !n; }
  const coGo = (d) => { co.step = Math.max(0, Math.min(CO_STEPS.length - 1, co.step + d)); sfx.tick(); coPaint(d); };
  function coBody() {
    const num = (id, lo, hi) => { const v = parseFloat($(id).value); return isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : null; };
    const A = co.a; A.age = num('coAge', 10, 100); A.height = num('coH', 120, 230); A.weight = num('coW', 30, 250); A.target = num('coT', 30, 250);
  }
  async function coBuild(change) {
    co.busy = true;
    const tips = ['מתאים תרגילים למטרה שלך', 'מחשב סטים וחזרות', 'מסדר את הימים', 'כמעט מוכן'];
    let ti = 0; const tt = setInterval(() => { const e = $('coLoadT'); if (e) e.textContent = tips[++ti % tips.length]; }, 1400);
    const t0 = Date.now();
    try {
      const { data } = await sb.auth.getSession();
      const tok = data && data.session && data.session.access_token;
      const p = progOf();
      const res = await fetch(SB_URL + '/functions/v1/plan-ai', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + (tok || SB_KEY) },
        body: JSON.stringify({ answers: co.a, change: change || '', current: change && p ? p.order.map((id) => ({ title: p.w[id].title, items: wItems(id) })) : null }) });
      if (!res.ok) throw new Error('http ' + res.status);
      const r = await res.json();
      if (!r || !Array.isArray(r.workouts) || !r.workouts.length) throw new Error('empty');
      await new Promise((ok) => setTimeout(ok, Math.max(0, 1800 - (Date.now() - t0))));
      co.res = r; co.step = CO_STEPS.length; CO_STEPS[co.step] = 'result'; sfx.done && sfx.done(); coPaint(1);
    } catch (e) {
      if (change) { coClose(); island.notify({ title: 'השינוי לא עבר', sub: 'בדוק אינטרנט ונסה שוב', stay: 5000 }); return; }
      co.step = CO_STEPS.indexOf('injuries'); coPaint(-1);
      const m = document.createElement('div'); m.className = 'co-err'; m.textContent = 'לא הצלחנו לבנות כרגע. בדוק אינטרנט ונסה שוב'; $('coNext').before(m);
    } finally { clearInterval(tt); co.busy = false; }
  }
  function coSave() {
    const r = co.res, A = co.a, w = {}, order = [];
    r.workouts.forEach((x, i) => { const id = 'P' + (i + 1); order.push(id); w[id] = { title: String(x.title).slice(0, 40), items: x.items.filter((it) => Array.isArray(it) && EX[it[0]]).map((it) => [it[0], String(it[1])]) }; });
    const keep = {}; Object.keys(plans).forEach((k) => { if (!/^P\d+$/.test(k) && k !== '_prog') keep[k] = plans[k]; });
    if (keep._rest) { keep._rest = Object.assign({}, keep._rest); Object.keys(keep._rest).forEach((k) => { if (/^P\d+$/.test(k)) delete keep._rest[k]; }); }
    plans = Object.assign(keep, { _prog: { w, order, days: A.days.slice().sort(), start: todayKey(), rest: r.rest, title: r.title, why: r.why, src: r.source || '', answers: A, made: Date.now() } });
    const sg = goals.find((g) => g.id === 'strength');
    if (sg) sg.days = A.days.slice().sort(); else goals.push({ id: 'strength', name: 'אימון כוח', detail: '', slots: [''], days: A.days.slice().sort(), color: 0, icon: 'dumbbell' });
    saveGoals(); build('');
    if (!$('vAcc').hidden) paintProg();
    sfx.boom && sfx.boom(); try { navigator.vibrate && navigator.vibrate([20, 40, 60]); } catch (e) {}
    coClose();
    island.notify({ title: 'התוכנית מוכנה', sub: A.days.includes(new Date().getDay()) ? 'האימון של היום כבר מחכה במסך הבית' : 'האימון הבא יופיע ביום ' + DAYL[A.days.find((d) => d > new Date().getDay()) ?? A.days[0]], stay: 5000 });
  }
  function coOpen(mode) {
    const p = progOf();
    co.mode = mode || 'new'; co.a = Object.assign({}, p && p.answers || {}); co.res = null; co.step = 0; CO_STEPS.length = 8;
    const el = $('coach'); el.classList.remove('out'); el.hidden = false; coPaint(1);
  }
  function coClose() { const el = $('coach'); el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 460); }
  $('coBack').addEventListener('click', () => { if (CO_STEPS[co.step] === 'result') { co.step = CO_STEPS.indexOf('injuries'); CO_STEPS.length = 8; coPaint(-1); } else coGo(-1); });
  $('coSkip').addEventListener('click', () => { if (co.mode === 'new') { try { localStorage.setItem('ny-coach-later', todayKey()); } catch (e) {} } coClose(); });
  $('coach').addEventListener('click', (e) => e.stopPropagation());
  $('coBody').addEventListener('click', (e) => {
    if (co.busy) return;
    const o = e.target.closest('.co-opt');
    if (o) { co.a[o.dataset.q] = o.dataset.v; o.parentNode.querySelectorAll('.co-opt').forEach((x) => x.classList.toggle('on', x === o)); if (o.dataset.q === 'level') delete co.a.days; setTimeout(() => coGo(1), 260); return; }
    const sx = e.target.closest('[data-sex]');
    if (sx) { co.a.sex = sx.dataset.sex; sx.parentNode.querySelectorAll('.co-chip').forEach((x) => x.classList.toggle('on', x === sx)); sfx.tick(); return; }
    const dy = e.target.closest('[data-day]');
    if (dy) { const d = +dy.dataset.day, A = co.a; A.days = A.days.includes(d) ? A.days.filter((x) => x !== d) : A.days.concat(d); dy.classList.toggle('on', A.days.includes(d)); sfx.tick(); coDaysN(); return; }
    if (e.target.closest('#coNext')) {
      const st = CO_STEPS[co.step];
      if (st === 'body') { coBody(); if (!co.a.sex) co.a.sex = 'm'; }
      if (st === 'days' && !co.a.days.length) return;
      if (st === 'injuries') { co.a.injuries = $('coInj').value.trim().slice(0, 200); co.step = CO_STEPS.indexOf('build'); coPaint(1); coBuild(''); return; }
      coGo(1); return;
    }
    if (e.target.closest('#coSave')) { coSave(); return; }
    if (e.target.closest('#coAgain')) { if (co.mode === 'change') coClose(); else { co.step = 0; CO_STEPS.length = 8; coPaint(-1); } }
  });
  // the account card: what the program is, ask for a change in words, or answer the questions again
  function paintProg() {
    const c = $('progCard'); if (!c) return;
    const p = progOf();
    if (!p) {
      c.innerHTML = '<h3>' + (isOwner() ? 'האימון הקבוע שלך' : 'עוד אין לך תוכנית אישית') + '</h3><p>' + (isOwner() ? 'אימון A ו־B שמתחלפים בימים א׳ עד ה׳. אפשר לערוך אותם ממסך הבית.' : 'עונים על כמה שאלות קצרות ומקבלים תוכנית שמותאמת למטרה, לניסיון ולימים שלך.') + '</p>' +
        (isOwner() ? '' : '<div class="prog-btns"><button type="button" class="a" data-pg="new" style="grid-column:1/-1">בניית תוכנית</button></div>');
      return;
    }
    const A = p.answers || {};
    c.innerHTML = '<h3>' + esc(p.title || 'התוכנית שלי') + '</h3>' + (p.why ? '<p>' + esc(p.why) + '</p>' : '') +
      '<div class="co-tags"><span>' + esc(lbl(CO_GOALS, A.goal)) + '</span><span>' + p.days.map((d) => DAYN[d]).join(' ') + '</span><span>מ־' + esc(String(p.start || '').split('-').reverse().slice(0, 2).join('.')) + '</span></div>' +
      '<div class="prog-ws">' + p.order.map((id) => '<span>' + esc(p.w[id].title) + '</span>').join('') + '</div>' +
      '<div class="prog-chg"><textarea class="co-ta" id="pgTxt" maxlength="300" placeholder="מה לשנות? למשל: יותר רגליים, בלי מכונות, אימון קצר יותר, אני רוצה לעבור למסה"></textarea>' +
      '<div class="prog-btns"><button type="button" class="a" data-pg="chg">שינוי עם AI</button><button type="button" class="b" data-pg="new">תוכנית חדשה</button></div></div>';
  }
  $('progCard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pg]'); if (!b || co.busy) return;
    if (b.dataset.pg === 'new') { coOpen(progOf() ? 'redo' : 'new'); return; }
    const t = ($('pgTxt').value || '').trim();
    if (t.length < 3) { $('pgTxt').focus(); return; }
    coOpen('change'); co.step = CO_STEPS.indexOf('build'); coPaint(1); coBuild(t);
  });
  // ask new people once their data has loaded and the intro is gone
  function coachCheck() {
    if (store.mode !== 'db' || !sbUser || isOwner() || progOf()) return;
    let later = ''; try { later = localStorage.getItem('ny-coach-later') || ''; } catch (e) {}
    if (later === todayKey()) return;
    const wait = () => { if ($('intro') || ($('gate') && !$('gate').hidden) || !$('wk').hidden) { setTimeout(wait, 500); return; } if (!progOf() && $('coach').hidden) coOpen('new'); };
    setTimeout(wait, 700);
  }
