import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  PETITION_SLUG,
  CONTACT_EMAIL,
} from "./config.js";

const contact = document.querySelector("#contact-email");
const form = document.querySelector("#deletion-request-form");
const message = document.querySelector("#deletion-request-message");
const button = form.querySelector("button");

contact.textContent = CONTACT_EMAIL;
contact.href = `mailto:${CONTACT_EMAIL}`;

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_PUBLISHABLE_KEY.length > 30 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR-PUBLISHABLE-KEY");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  message.className = "utility-message";
  message.textContent = "";

  if (!isConfigured) {
    message.classList.add("error");
    message.textContent = "Сначала подключите Supabase в config.js.";
    return;
  }

  button.disabled = true;
  button.textContent = "Отправляем…";

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/request-signature-deletion`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: form.elements.email.value.trim().toLowerCase(),
        petition_slug: PETITION_SLUG,
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Не удалось отправить запрос.");

    form.reset();
    message.classList.add("success");
    message.textContent = "Если подпись с таким email существует, письмо со ссылкой уже отправлено.";
  } catch (error) {
    message.classList.add("error");
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Отправить ссылку удаления";
  }
});
