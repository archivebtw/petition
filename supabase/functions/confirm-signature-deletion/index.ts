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

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ message: "Метод не поддерживается." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ message: "Функция не настроена." }, 500);

  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "").trim();
  if (!token) return json({ message: "Токен отсутствует." }, 400);

  const tokenHash = await sha256(token);
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: deletionToken } = await supabase
    .from("signature_deletion_tokens")
    .select("id, signature_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (
    !deletionToken ||
    deletionToken.used_at ||
    new Date(deletionToken.expires_at).getTime() < Date.now()
  ) {
    return json({ message: "Ссылка истекла или уже использована." }, 400);
  }

  const { error } = await supabase
    .from("petition_signatures")
    .delete()
    .eq("id", deletionToken.signature_id);

  if (error) {
    console.error(error);
    return json({ message: "Не удалось удалить подпись." }, 500);
  }

  return json({ ok: true });
});
