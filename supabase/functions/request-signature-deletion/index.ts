import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Метод не поддерживается." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("DELETE_EMAIL_FROM");
  const publicSiteUrl = Deno.env.get("PUBLIC_SITE_URL")?.replace(/\/$/, "");

  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !fromEmail || !publicSiteUrl) {
    return json({ message: "Функция удаления не настроена: проверьте secrets." }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const petitionSlug = String(body.petition_slug ?? "").trim();
  if (!email || !petitionSlug) return json({ message: "Проверьте email." }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signature } = await supabase
    .from("petition_signatures")
    .select("id, display_name, email")
    .eq("petition_slug", petitionSlug)
    .ilike("email", email)
    .maybeSingle();

  // Одинаковый ответ не позволяет проверять наличие email в базе.
  if (!signature) return json({ ok: true });

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = toBase64Url(tokenBytes);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  await supabase.from("signature_deletion_tokens").delete().eq("signature_id", signature.id);
  const { error: tokenError } = await supabase.from("signature_deletion_tokens").insert({
    signature_id: signature.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (tokenError) {
    console.error(tokenError);
    return json({ message: "Не удалось подготовить ссылку удаления." }, 500);
  }

  const deletionUrl = `${publicSiteUrl}/delete.html?token=${encodeURIComponent(token)}`;
  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [signature.email],
      subject: "Удаление подписи — Фонд прямохождения",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171914">
          <h1 style="font-size:24px">Удаление подписи</h1>
          <p>Здравствуйте, ${String(signature.display_name).replaceAll("<", "&lt;").replaceAll(">", "&gt;")}.</p>
          <p>Нажмите кнопку ниже, чтобы удалить подпись. Ссылка действует 30 минут и используется один раз.</p>
          <p><a href="${deletionUrl}" style="display:inline-block;padding:14px 20px;border-radius:10px;background:#c9f348;color:#11130f;font-weight:700;text-decoration:none">Удалить подпись</a></p>
          <p style="color:#6c7166;font-size:13px">Если вы не отправляли запрос, просто проигнорируйте письмо.</p>
        </div>
      `,
    }),
  });

  if (!emailResponse.ok) {
    console.error(await emailResponse.text());
    await supabase.from("signature_deletion_tokens").delete().eq("token_hash", tokenHash);
    return json({ message: "Не удалось отправить письмо." }, 500);
  }

  return json({ ok: true });
});
