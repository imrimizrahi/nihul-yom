// Owner-only admin: list users, peek at their data, reset a password, sign in as them, or delete.
// Guards on the caller's own JWT: only the owner account ids below get through.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const OWNER_IDS = ["dfdf0d4d-ad6e-48bf-9e58-4cfdc3cb724c"]; // Imri
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: me } = await admin.auth.getUser(token);
  if (!me?.user || !OWNER_IDS.includes(me.user.id)) return json({ error: "forbidden" }, 403);

  let body: any; try { body = await req.json(); } catch { return json({ error: "body" }, 400); }
  const action = body.action, id = typeof body.id === "string" ? body.id : "";
  const site = req.headers.get("origin") || url;

  if (action === "list") {
    const { data: list, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) return json({ error: "list" }, 500);
    const ids = list.users.map((u) => u.id);
    const { data: rows } = await admin.from("user_data").select("user_id, doc, body").in("user_id", ids.length ? ids : ["-"]);
    const byUser: Record<string, any[]> = {};
    (rows || []).forEach((r) => { (byUser[r.user_id] = byUser[r.user_id] || []).push(r); });
    const users = list.users.map((u) => {
      const docs = byUser[u.id] || [], settings = docs.find((d) => d.doc === "settings")?.body || {};
      const prog = settings.plans?._prog;
      let ticks = 0, days = 0;
      docs.filter((d) => d.doc.startsWith("m-")).forEach((d) => { const dd = d.body?.days || {}; Object.keys(dd).forEach((k) => { days++; const v = dd[k]; ticks += Array.isArray(v) ? v.filter(Boolean).length : Object.values(v || {}).filter(Boolean).length; }); });
      return {
        id: u.id, name: (u.user_metadata?.name) || "", email: u.email || "",
        created: u.created_at, last: u.last_sign_in_at || null, confirmed: !!u.email_confirmed_at,
        owner: OWNER_IDS.includes(u.id),
        plan: prog ? { title: prog.title, days: prog.days, workouts: (prog.order || []).map((k: string) => prog.w[k]?.title) } : null,
        ticks, activeDays: days,
      };
    }).sort((a, b) => (b.last || b.created).localeCompare(a.last || a.created));
    return json({ users });
  }

  if (!id || OWNER_IDS.includes(id) && action !== "reset") return json({ error: "bad-id" }, 400);

  if (action === "reset") {
    const pass = typeof body.password === "string" ? body.password : "";
    if (pass.length < 6) return json({ error: "short" }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { password: pass });
    if (error) return json({ error: "reset" }, 500);
    return json({ ok: true });
  }
  if (action === "login") {
    const { data: u } = await admin.auth.admin.getUserById(id);
    if (!u?.user?.email) return json({ error: "no-user" }, 404);
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email, options: { redirectTo: site } });
    if (error) return json({ error: "link" }, 500);
    return json({ link: data.properties?.action_link });
  }
  if (action === "delete") {
    await admin.from("push_queue").delete().eq("user_id", id);
    await admin.from("push_subs").delete().eq("user_id", id);
    await admin.from("user_data").delete().eq("user_id", id);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return json({ error: "delete" }, 500);
    return json({ ok: true });
  }
  return json({ error: "action" }, 400);
});
