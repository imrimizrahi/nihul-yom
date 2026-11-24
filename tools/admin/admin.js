
  // ---------- admin (owner only): a third tab to manage everyone's accounts ----------
  const ADMIN_IDS = __OWNER_IDS__;
  const isAdmin = () => !!sbUser && ADMIN_IDS.includes(sbUser.id);
  let admUsers = null, admOpen = {};
  async function admCall(action, extra) {
    const { data } = await sb.auth.getSession();
    const tok = data && data.session && data.session.access_token;
    const res = await fetch(SB_URL + '/functions/v1/admin', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: 'Bearer ' + (tok || SB_KEY) }, body: JSON.stringify(Object.assign({ action }, extra || {})) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || ('http ' + res.status));
    return j;
  }
  const admWhen = (iso) => {
    if (!iso) return 'לא נכנס';
    const d = new Date(iso), now = Date.now(), m = Math.floor((now - d) / 60000);
    if (m < 1) return 'עכשיו'; if (m < 60) return 'לפני ' + m + ' דק׳';
    const h = Math.floor(m / 60); if (h < 24) return 'לפני ' + h + ' שע׳';
    const dd = Math.floor(h / 24); if (dd < 7) return 'לפני ' + dd + ' ימים';
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + String(d.getFullYear()).slice(2);
  };
  const DAYN2 = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
  function admRow(u) {
    const init = (u.name || u.email || '?').trim().charAt(0).toUpperCase() || '★';
    const act = Math.floor((Date.now() - new Date(u.last || u.created)) / 86400000);
    return '<div class="adm-u' + (u.owner ? ' me' : '') + (admOpen[u.id] ? ' open' : '') + '" data-u="' + u.id + '">' +
      '<div class="adm-head" data-toggle="' + u.id + '" role="button"><div class="adm-mono">' + esc(init) + '</div>' +
      '<div class="adm-who"><b>' + esc(u.name || 'ללא שם') + (u.owner ? ' <span class="adm-tag">אתה</span>' : '') + (!u.confirmed ? ' <span class="adm-tag">לא אישר מייל</span>' : '') + '</b><small>' + esc(u.email) + '</small></div>' +
      '<div class="adm-when"><b>' + esc(admWhen(u.last)) + '</b>כניסה</div></div>' +
      '<div class="adm-body">' +
        '<div class="adm-facts"><div class="adm-fact"><b>' + (u.ticks || 0) + '</b><span>סימונים סה״כ</span></div><div class="adm-fact"><b>' + (u.activeDays || 0) + '</b><span>ימים פעילים</span></div></div>' +
        (u.plan ? '<div class="adm-plan"><b>' + esc(u.plan.title || 'תוכנית') + '</b> <span>· ' + (u.plan.days || []).map((d) => DAYN2[d]).join(' ') + '</span><br><span>' + (u.plan.workouts || []).map(esc).join(' · ') + '</span></div>' : '<div class="adm-plan"><span>אין עדיין תוכנית אישית</span></div>') +
        '<div class="adm-out" id="admOut-' + u.id + '"></div>' +
        (u.owner ? '' : '<div class="adm-acts"><button class="login" data-act="login" data-u="' + u.id + '">כניסה בתור ' + esc((u.name || '').split(' ')[0] || 'המשתמש') + '</button>' +
          '<button data-act="reset" data-u="' + u.id + '">איפוס סיסמה</button>' +
          '<button class="del" data-act="del" data-u="' + u.id + '">מחיקה</button></div>') +
      '</div></div>';
  }
  function paintAdmin() {
    const list = $('admList'); if (!list) return;
    if (!admUsers) { list.innerHTML = '<div class="adm-empty">טוען…</div>'; return; }
    const act7 = admUsers.filter((u) => u.last && Date.now() - new Date(u.last) < 7 * 86400000).length;
    $('admTotal').textContent = admUsers.length; $('admActive').textContent = act7;
    $('admCount').textContent = admUsers.length + ' משתמשים';
    list.innerHTML = admUsers.length ? admUsers.map(admRow).join('') : '<div class="adm-empty">עדיין אין משתמשים חוץ ממך</div>';
  }
  async function loadAdmin(force) {
    if (admUsers && !force) return;
    try { const { users } = await admCall('list'); admUsers = users; }
    catch (e) { admUsers = []; island.notify({ title: 'טעינת הניהול נכשלה', sub: String(e.message || ''), stay: 5000 }); }
    paintAdmin();
  }
  function admOut(id, html, warn) { const o = $('admOut-' + id); if (!o) return; o.innerHTML = html; o.className = 'adm-out show' + (warn ? ' warn' : ''); }
  const admBusy = {};
  async function admAction(act, id) {
    if (admBusy[id]) return; const u = (admUsers || []).find((x) => x.id === id); if (!u) return;
    if (act === 'reset') {
      const pass = prompt('סיסמה חדשה ל' + (u.name || u.email) + ' (6 תווים לפחות):'); if (pass == null) return;
      if (pass.length < 6) return admOut(id, 'סיסמה של 6 תווים לפחות', true);
      admBusy[id] = true;
      try { await admCall('reset', { id, password: pass }); admOut(id, 'הסיסמה אופסה. מסרו למשתמש: <span class="code">' + esc(pass) + '</span>'); }
      catch (e) { admOut(id, 'האיפוס נכשל', true); } finally { admBusy[id] = false; }
    } else if (act === 'login') {
      if (!confirm('להיכנס בתור ' + (u.name || u.email) + '? זה יוציא אותך מהחשבון שלך. תוכל לחזור אליו בהתנתקות וכניסה מחדש.')) return;
      admBusy[id] = true;
      try { const { link } = await admCall('login', { id }); if (link) location.href = link; else admOut(id, 'יצירת הקישור נכשלה', true); }
      catch (e) { admOut(id, 'הכניסה נכשלה', true); } finally { admBusy[id] = false; }
    } else if (act === 'del') {
      if (!confirm('למחוק לגמרי את ' + (u.name || u.email) + '? כל הנתונים שלו יימחקו ואי אפשר לבטל.')) return;
      if (!confirm('בטוח? זו פעולה סופית.')) return;
      admBusy[id] = true;
      try { await admCall('delete', { id }); admUsers = admUsers.filter((x) => x.id !== id); paintAdmin(); island.notify({ title: 'המשתמש נמחק', sub: u.name || u.email, stay: 4000 }); }
      catch (e) { admOut(id, 'המחיקה נכשלה', true); admBusy[id] = false; }
    }
  }
  $('admList').addEventListener('click', (e) => {
    const t = e.target.closest('[data-toggle]');
    if (t) { const id = t.dataset.toggle; admOpen[id] = !admOpen[id]; const c = $('admList').querySelector('.adm-u[data-u="' + id + '"]'); if (c) c.classList.toggle('open', admOpen[id]); sfx.tick(); return; }
    const b = e.target.closest('[data-act]'); if (b) { e.stopPropagation(); admAction(b.dataset.act, b.dataset.u); }
  });
