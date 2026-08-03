// Вставьте данные из Supabase Dashboard → Project Settings → API.
// Используйте только Publishable key (или legacy anon key).
// НИКОГДА не вставляйте сюда secret/service_role key.
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "YOUR-PUBLISHABLE-KEY";

export const PETITION_SLUG = "uyutnoe-gnezdyshko-tankzora";
export const SIGNATURE_GOAL_STEP = 1000;

// Укажите публичный адрес после публикации. Если оставить пустым,
// кнопки «Поделиться» используют текущий адрес страницы.
export const PUBLIC_SITE_URL = "";

// Опциональная защищённая отправка через Supabase Edge Function + Turnstile.
// Оставьте пустым, чтобы форма работала через RLS напрямую.
export const TURNSTILE_SITE_KEY = "";
export const SECURE_SIGNING_FUNCTION = "sign-petition";

// Адрес для вопросов о данных. Отображается на странице конфиденциальности.
export const CONTACT_EMAIL = "your-email@example.com";
