// Builds a personal workout plan from the onboarding answers.
// Uses Claude Haiku 5.5 (cheap) with a JSON schema; falls back to fixed rules when there is no key or the call fails.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// exercise keys the app can draw and animate
const EXN: Record<string, string> = {
  bench: "לחיצת חזה במוט", row: "חתירה במוט", ohp: "לחיצת כתפיים במוט", pulldown: "פולי עליון", lateral: "הרחקות לצדדים במשקולות", squat: "סקוואט", rdl: "דדליפט רומני", lunge: "מכרעים", legcurl: "כפיפת ברכיים", calf: "תאומים", incline: "לחיצה בשיפוע", dbpress: "כתפיים במשקולות", dips: "מקבילים", pushdown: "יד אחורית בכבל", pullup: "מתח", dbrow: "חתירה ביד אחת במשקולת", facepull: "פייס פול", curl: "יד קדמית במשקולות", hammer: "פטישים", overhead: "פשיטת מרפקים מעל הראש בכבל", deadlift: "דדליפט", legpress: "לחיצת רגליים", bulgarian: "בולגרי", legext: "פשיטת ברכיים", chestpress: "לחיצת חזה במכונה", pecdeck: "פרפר במכונה", mshoulder: "לחיצת כתפיים במכונה", latpull: "פולי עליון במכונה", cablerow: "חתירה בכבל בישיבה", seatcurl: "כפיפת ברכיים בישיבה", mlegext: "פשיטת ברכיים במכונה", abductor: "מכונת מרחיקים", adductor: "מכונת מקרבים", goblet: "סקוואט גביע", smithsquat: "סקוואט בסמית׳", mcalf: "תאומים במכונה", apullup: "מתח בעזרת מכונה", adip: "מקבילים בעזרת מכונה", cablefly: "קרוסאובר בכבלים", reardelt: "פרפר הפוך", cablecurl: "יד קדמית בכבל", kickback: "בעיטה לאחור בכבל", backext: "פשיטת גב", plank: "פלאנק", sideplank: "פלאנק צד", crunch: "כפיפות בטן", legraise: "הרמות רגליים", bicycle: "אופניים (בטן)", hangraise: "הרמות רגליים בתלייה", treadmill: "הליכה בשיפוע", bike: "אופני כושר", rower: "מכונת חתירה", elliptical: "אליפטיקל",
};
const HOLD = new Set(["plank", "sideplank"]);
const CARDIO = new Set(["treadmill", "bike", "rower", "elliptical"]);
const HOME = new Set(["squat", "lunge", "bulgarian", "goblet", "rdl", "calf", "dbpress", "dbrow", "curl", "hammer", "lateral", "pullup", "dips", "plank", "sideplank", "crunch", "legraise", "bicycle"]);
const pool = (where: string) => Object.keys(EXN).filter((k) => where === "home" ? HOME.has(k) : true);

type Item = { ex: string; sets: number; reps: number };
type W = { title: string; items: Item[] };
const GOAL: Record<string, string> = { cut: "חיטוב וירידה באחוזי שומן", mass: "עלייה במסת שריר", strength: "כוח", fit: "כושר כללי ובריאות" };
const LEVEL: Record<string, string> = { none: "מעולם לא התאמן", past: "התאמן בעבר, לא בתקופה האחרונה", some: "מתאמן פחות משנה", exp: "מתאמן יותר משנה" };
const CARDIO_L: Record<string, string> = { none: "כמעט לא עושה פעילות", sometimes: "פעילות מדי פעם", regular: "פעיל באופן קבוע (ריצה/ספורט)" };

function fmt(it: Item) {
  if (CARDIO.has(it.ex)) return Math.max(5, Math.min(40, it.reps)) + " דק׳";
  const s = Math.max(1, Math.min(6, it.sets | 0));
  if (HOLD.has(it.ex)) return s + "×" + Math.max(15, Math.min(120, it.reps)) + " שנ׳";
  return s + "×" + Math.max(3, Math.min(30, it.reps | 0));
}

// ---------- rules (no AI): beginners full body, 4 days upper/lower, 5+ push/pull/legs ----------
function rules(a: any): { title: string; why: string; workouts: W[]; rest: number } {
  const home = a.where === "home", n = (a.days || []).length || 3, g = a.goal || "fit";
  const beginner = a.level === "none" || a.level === "past" || n <= 3;
  const R = g === "strength" ? [4, 6] : g === "mass" ? [4, 10] : g === "cut" ? [3, 15] : [3, 12];
  const acc = g === "strength" ? [3, 10] : [3, g === "cut" ? 15 : 12];
  const C = (ex: string) => ({ ex, sets: R[0], reps: R[1] }), S = (ex: string) => ({ ex, sets: acc[0], reps: acc[1] });
  const fin: Item[] = g === "cut" && !home ? [{ ex: "treadmill", sets: 1, reps: 15 }] : [];
  let workouts: W[], title: string, why: string;
  if (beginner) {
    title = "פול באדי למתחילים";
    why = "למתחילים הכי נכון לעבוד על כל הגוף בכל אימון: כל שריר מקבל גירוי כמה פעמים בשבוע, לומדים את התנועות ומתקדמים מהר.";
    workouts = home
      ? [{ title: "פול באדי A", items: [C("goblet"), C("dbpress"), C("dbrow"), S("lunge"), S("curl"), { ex: "plank", sets: 3, reps: 30 }] },
         { title: "פול באדי B", items: [C("rdl"), C("dbrow"), S("lateral"), S("bulgarian"), S("hammer"), { ex: "sideplank", sets: 3, reps: 25 }] }]
      : [{ title: "פול באדי A", items: [C("legpress"), C("chestpress"), C("latpull"), S("seatcurl"), S("mshoulder"), S("cablecurl"), ...fin] },
         { title: "פול באדי B", items: [C("goblet"), C("cablerow"), S("pecdeck"), S("mlegext"), S("lateral"), S("pushdown"), ...fin] }];
  } else if (n === 4) {
    title = "עליון / תחתון";
    why = "עם ניסיון ו-4 ימים בשבוע, חלוקה לפלג גוף עליון ותחתון נותנת יותר נפח לכל שריר ועדיין פעמיים בשבוע.";
    workouts = home
      ? [{ title: "עליון", items: [C("dbpress"), C("dbrow"), C("pullup"), S("dips"), S("lateral"), S("curl"), S("hammer")] },
         { title: "תחתון", items: [C("goblet"), C("rdl"), S("bulgarian"), S("lunge"), S("calf"), { ex: "plank", sets: 3, reps: 40 }] }]
      : [{ title: "עליון", items: [C("chestpress"), C("latpull"), S("incline"), S("cablerow"), S("mshoulder"), S("lateral"), S("pushdown"), S("cablecurl"), ...fin] },
         { title: "תחתון", items: [C("legpress"), C("rdl"), S("mlegext"), S("seatcurl"), S("kickback"), S("mcalf"), ...fin] }];
  } else {
    title = "דחיפה / משיכה / רגליים";
    why = "עם ניסיון ו-5 ימים ומעלה, חלוקה לדחיפה, משיכה ורגליים נותנת לכל שריר הרבה עבודה ומספיק זמן להתאושש.";
    workouts = home
      ? [{ title: "דחיפה", items: [C("dbpress"), C("dips"), S("lateral"), { ex: "plank", sets: 3, reps: 40 }] },
         { title: "משיכה", items: [C("pullup"), C("dbrow"), S("curl"), S("hammer")] },
         { title: "רגליים", items: [C("goblet"), C("rdl"), S("bulgarian"), S("calf")] }]
      : [{ title: "דחיפה", items: [C("chestpress"), C("incline"), S("mshoulder"), S("lateral"), S("pushdown"), S("overhead"), ...fin] },
         { title: "משיכה", items: [C("latpull"), C("cablerow"), S("dbrow"), S("facepull"), S("cablecurl"), S("hammer"), ...fin] },
         { title: "רגליים", items: [C("legpress"), C("rdl"), S("mlegext"), S("seatcurl"), S("kickback"), S("mcalf")] }];
  }
  return { title, why, workouts, rest: g === "strength" ? 120 : g === "cut" ? 60 : 90 };
}

// ---------- AI ----------
function schema(keys: string[]) {
  const item = { type: "object", properties: { ex: { type: "string", enum: keys }, sets: { type: "integer" }, reps: { type: "integer" } }, required: ["ex", "sets", "reps"], additionalProperties: false };
  return {
    type: "object", additionalProperties: false, required: ["title", "why", "rest", "workouts"],
    properties: {
      title: { type: "string" }, why: { type: "string" }, rest: { type: "integer" },
      workouts: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "items"], properties: { title: { type: "string" }, items: { type: "array", items: item } } } },
    },
  };
}
const SYSTEM = `You are an experienced personal trainer writing a gym plan for a Hebrew-speaking app user.
Write title, why and each workout title in short, plain Hebrew. "why" is 1-2 sentences explaining why this split fits the person.
Rules:
- Beginners, people returning after a long break, or anyone training 3 days or fewer: full body workouts (usually 2 alternating, A/B).
- 4 days with experience: upper/lower. 5+ days with experience: push/pull/legs or similar.
- 5-8 exercises per workout, big compound movements first. Use only the listed exercise keys.
- sets 2-5. reps = repetitions; for holds (plank, sideplank) reps = seconds; for cardio machines reps = minutes.
- Goal cut: moderate weight, 12-15 reps, may end with 10-20 min cardio. Mass: 8-12 reps, more volume. Strength: 4-6 reps on compounds.
- Respect injuries: avoid exercises that load the injured area.
- rest = rest seconds between sets (45-150).
The workouts are cycled in order on the person's training days.`;

function clean(p: any, keys: Set<string>): W[] | null {
  if (!p || !Array.isArray(p.workouts)) return null;
  const ws = p.workouts.slice(0, 6).map((w: any) => ({ title: String(w.title || "אימון").slice(0, 40), items: (Array.isArray(w.items) ? w.items : []).filter((x: any) => x && keys.has(x.ex)).slice(0, 10) }))
    .filter((w: W) => w.items.length >= 3);
  return ws.length ? ws : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await admin.auth.getUser(token);
  if (!u?.user) return json({ error: "auth" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "body" }, 400); }
  const a = body.answers || {}, change = typeof body.change === "string" ? body.change.slice(0, 400) : "";
  const keys = pool(a.where), keySet = new Set(keys);
  const base = rules(a);

  // a small daily cap per user so nobody can run up the bill
  const today = new Date().toISOString().slice(0, 10);
  const { data: row } = await admin.from("user_data").select("body").eq("user_id", u.user.id).eq("doc", "_ai").maybeSingle();
  const used = row?.body?.day === today ? (row.body.n | 0) : 0;
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  let out = base, source = "rules";
  if (key && used < 8) {
    try {
      const n = (a.days || []).length || 3;
      const about = [
        `Goal: ${GOAL[a.goal] || a.goal}.`, `Sex: ${a.sex === "f" ? "female" : "male"}. Age: ${a.age || "?"}. Height: ${a.height || "?"} cm. Weight: ${a.weight || "?"} kg. Target weight: ${a.target || "?"} kg.`,
        `Experience: ${LEVEL[a.level] || a.level}. Activity: ${CARDIO_L[a.cardio] || a.cardio}.`,
        `Trains ${n} days a week, ${a.where === "home" ? "at home with dumbbells, a pull-up bar and bodyweight" : "in a gym with machines"}.`,
        a.injuries ? `Injuries / limits: ${String(a.injuries).slice(0, 200)}` : "No injuries.",
        "Exercises (key: Hebrew name): " + keys.map((k) => k + ": " + EXN[k]).join(", "),
      ];
      if (change) about.push("Current plan: " + JSON.stringify(body.current || base.workouts).slice(0, 2500), "The person asks to change it (Hebrew): " + change, "Return the full updated plan.");
      const client = new Anthropic({ apiKey: key });
      const r = await client.messages.create({
        model: "claude-haiku-5-5", max_tokens: 1800,
        thinking: { type: "disabled" },
        output_config: { effort: "low", format: { type: "json_schema", schema: schema(keys) } },
        system: SYSTEM,
        messages: [{ role: "user", content: about.join("\n") }],
      } as any);
      const txt = (r.content as any[]).find((b) => b.type === "text")?.text;
      const p = txt ? JSON.parse(txt) : null, ws = clean(p, keySet);
      if (ws) { out = { title: String(p.title).slice(0, 40), why: String(p.why).slice(0, 300), workouts: ws, rest: Math.max(30, Math.min(180, p.rest | 0 || base.rest)) }; source = "ai"; }
      await admin.from("user_data").upsert({ user_id: u.user.id, doc: "_ai", body: { day: today, n: used + 1 }, updated_at: new Date().toISOString() }, { onConflict: "user_id,doc" });
    } catch (e) { console.error("ai failed", e); }
  }
  return json({ source, title: out.title, why: out.why, rest: out.rest, workouts: out.workouts.map((w) => ({ title: w.title, items: w.items.map((it) => [it.ex, fmt(it)]) })) });
});
