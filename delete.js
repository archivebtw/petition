import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const title = document.querySelector("#delete-title");
const message = document.querySelector("#delete-message");
const token = new URLSearchParams(location.search).get("token");

async function confirmDeletion() {
  if (!token) {
    title.textContent = "Ссылка неполная";
    message.textContent = "В адресе отсутствует одноразовый токен удаления.";
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/confirm-signature-deletion`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Не удалось удалить подпись.");
    title.textContent = "Подпись удалена";
    message.textContent = "Запись и публичный комментарий удалены, а общий счётчик обновлён.";
  } catch (error) {
    title.textContent = "Ссылка недействительна";
    message.textContent = error.message;
  }
}

confirmDeletion();
