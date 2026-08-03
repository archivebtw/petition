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

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Метод не поддерживается." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const turnstileSecret = Deno.env.get("CF_TURNSTILE_SECRET_KEY");
  const rateLimitSalt = Deno.env.get("RATE_LIMIT_SALT") || "change-this-rate-limit-salt";

  if (!supabaseUrl || !serviceRoleKey || !turnstileSecret) {
    return json({ message: "Edge Function не настроена: добавьте обязательные secrets." }, 500);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ message: "Некорректный JSON." }, 400);
  }

  if (normalize(body.website)) return json({ ok: true }, 201);

  const petitionSlug = normalize(body.petition_slug);
  const displayName = normalize(body.display_name);
  const email = normalize(body.email).toLowerCase();
  const city = normalize(body.city) || null;
  const comment = normalize(body.comment) || null;
  const privacyConsent = body.privacy_consent === true;
  const publicDisplayConsent = body.public_display_consent === true;
  const turnstileToken = normalize(body.turnstile_token);

  if (!petitionSlug || displayName.length < 2 || displayName.length > 80) {
    return json({ message: "Проверьте имя или псевдоним." }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return json({ message: "Проверьте email." }, 400);
  }
  if ((city && city.length > 120) || (comment && comment.length > 500) || !privacyConsent) {
    return json({ message: "Проверьте заполнение формы и согласие." }, 400);
  }
  if (!turnstileToken) return json({ message: "Подтвердите антибот-проверку." }, 400);

  const remoteIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";

  const verificationResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: turnstileSecret, response: turnstileToken, remoteip: remoteIp }),
  });
  const verification = await verificationResponse.json();
  if (!verification.success) return json({ message: "Антибот-проверка не пройдена.", code: "TURNSTILE_FAILED" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userAgent = request.headers.get("user-agent") || "unknown";
  const fingerprint = await sha256(`${remoteIp}|${userAgent}|${rateLimitSalt}`);
  const { data: rateLimit } = await supabase
    .from("petition_submission_limits")
    .select("last_submitted_at")
    .eq("fingerprint", fingerprint)
    .maybeSingle();

  if (rateLimit?.last_submitted_at) {
    const elapsed = Date.now() - new Date(rateLimit.last_submitted_at).getTime();
    if (elapsed < 30_000) return json({ message: "Слишком много попыток.", code: "RATE_LIMITED" }, 429);
  }

  await supabase.from("petition_submission_limits").upsert({
    fingerprint,
    last_submitted_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("petition_signatures").insert({
    petition_slug: petitionSlug,
    display_name: displayName,
    email,
    city,
    comment,
    public_display_consent: publicDisplayConsent,
    public_display_approved: false,
    privacy_consent: true,
  });

  if (error) {
    if (error.code === "23505") return json({ message: "Этот email уже использовался для подписи.", code: "23505" }, 409);
    console.error(error);
    return json({ message: "Не удалось записать подпись.", code: error.code }, 500);
  }

  return json({ ok: true }, 201);
});
