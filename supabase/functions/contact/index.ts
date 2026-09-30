// Sunshine's Boutique — emails new customer messages to the owner (Resend)
// Secrets needed: RESEND_API_KEY   (optional: NOTIFY_EMAIL, FROM_EMAIL)
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

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { id } = await req.json();
    if (!id) return json({ error: "Missing id" }, 400);

    const admin = createClient(SB_URL, SERVICE_KEY, { auth: { persistSession: false } });
    // Only notify once per message, and only for fresh messages
    const { data: msg } = await admin.from("messages").select("*, products(name)").eq("id", id).eq("notified", false).maybeSingle();
    if (!msg) return json({ ok: true, skipped: true });
    if (Date.now() - new Date(msg.created_at).getTime() > 10 * 60 * 1000) return json({ ok: true, skipped: true });

    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return json({ ok: true, emailed: false, note: "RESEND_API_KEY not set" });

    const to = Deno.env.get("NOTIFY_EMAIL") || "ajoklilian027@gmail.com";
    const from = Deno.env.get("FROM_EMAIL") || "Sunshine's Boutique <onboarding@resend.dev>";
    const about = msg.products?.name ? `<p style="margin:0 0 12px;color:#8a6a4a">About: <b>${esc(msg.products.name)}</b></p>` : "";

    const html = `
      <div style="font-family:Georgia,serif;background:#FBF6EE;padding:32px">
        <div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;padding:28px;border:1px solid #efe3d0">
          <p style="margin:0;color:#C97B1A;letter-spacing:.2em;font-size:12px">SUNSHINE'S BOUTIQUE</p>
          <h2 style="margin:8px 0 18px;color:#2A1E17;font-weight:normal">New message from ${esc(msg.name)}</h2>
          ${about}
          <p style="white-space:pre-wrap;color:#2A1E17;font-family:Arial,sans-serif;line-height:1.6">${esc(msg.message)}</p>
          <hr style="border:none;border-top:1px solid #efe3d0;margin:20px 0">
          <p style="font-family:Arial,sans-serif;color:#5b4a3e;margin:0">
            ${msg.email ? `Email: <a href="mailto:${esc(msg.email)}">${esc(msg.email)}</a><br>` : ""}
            ${msg.phone ? `Phone / WhatsApp: <a href="https://wa.me/${esc(String(msg.phone).replace(/\D/g, ""))}">${esc(msg.phone)}</a>` : ""}
          </p>
        </div>
      </div>`;

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from, to: [to],
        reply_to: msg.email || undefined,
        subject: `New message from ${msg.name} — Sunshine's Boutique`,
        html,
      }),
    });
    if (!r.ok) return json({ ok: false, error: await r.text() }, 502);
    await admin.from("messages").update({ notified: true }).eq("id", id);
    return json({ ok: true, emailed: true });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
