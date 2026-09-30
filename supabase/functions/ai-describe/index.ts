// Sunshine's Boutique — AI product writer (Google Gemini)
// Secrets needed: GEMINI_API_KEY   (optional: GEMINI_MODEL)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });


function envKey(names: string[]): string {
  for (const n of names) {
    const v = Deno.env.get(n);
    if (!v) continue;
    if (v.trim().startsWith("{")) {
      try { const o = JSON.parse(v); return o.default ?? Object.values(o)[0] as string; } catch { /* ignore */ }
    }
    return v;
  }
  return "";
}
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = envKey(["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SECRET_KEYS"]);

const CATEGORIES = ["Dresses", "Tops", "Skirts", "Trousers", "Sets", "Jumpsuits", "Outerwear", "Traditional", "Shoes", "Bags", "Accessories", "Men", "Kids"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // Only shop admins may use the AI writer
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const admin = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: u } = await admin.auth.getUser(token);
    const email = u?.user?.email?.toLowerCase();
    if (!email) return json({ error: "Please sign in again" }, 401);
    const { data: row } = await admin.from("admins").select("email").ilike("email", email).maybeSingle();
    if (!row) return json({ error: "Not allowed" }, 403);

    const key = Deno.env.get("GEMINI_API_KEY");
    if (!key) return json({ error: "AI key not set yet (GEMINI_API_KEY)" }, 500);
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

    const { images = [], hint = "" } = await req.json();
    if (!Array.isArray(images) || images.length === 0) return json({ error: "No photos" }, 400);

    const parts: unknown[] = images.slice(0, 4).map((d: string) => {
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(d);
      if (!m) throw new Error("Bad image");
      return { inline_data: { mime_type: m[1], data: m[2] } };
    });
    parts.push({
      text: `You write product listings for "Sunshine's Boutique", a warm, stylish fashion boutique in Namugongo, Kampala, Uganda.
All photos show ONE item for sale (different angles). Study the garment carefully: type, fabric look, colour, pattern, cut, details.
Write in warm, elegant, confident British English that makes a woman in Kampala want to wear it — mention an occasion it suits (church, office, wedding, introduction ceremony, date night, weekend, etc.) when it fits naturally.
No emojis, no exaggerated claims, don't invent fabric composition — say "looks like" only if unsure, or leave it out.
Suggest a realistic boutique price in Ugandan Shillings (UGX) for Kampala, a round number (e.g. 45000, 85000, 120000).
${hint ? `The owner adds this note: "${String(hint).slice(0, 300)}"` : ""}`,
    });

    const schema = {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Short, beautiful product name, 2-5 words, Title Case" },
        description: { type: "STRING", description: "2 short paragraphs, 45-90 words total" },
        category: { type: "STRING", enum: CATEGORIES },
        colors: { type: "ARRAY", items: { type: "STRING" } },
        sizes: { type: "ARRAY", items: { type: "STRING" }, description: "Likely sizes to offer, e.g. S, M, L, XL or 38, 40" },
        tags: { type: "ARRAY", items: { type: "STRING" }, description: "3-6 search tags" },
        price_ugx: { type: "INTEGER" },
      },
      required: ["name", "description", "category", "colors", "sizes", "tags", "price_ugx"],
    };

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json", responseSchema: schema },
      }),
    });
    const out = await r.json();
    if (!r.ok) return json({ error: out?.error?.message || "AI request failed" }, 502);
    const text = out?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "{}";
    return json(JSON.parse(text));
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
