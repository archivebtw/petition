import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  PETITION_SLUG,
  SIGNATURE_GOAL_STEP,
} from "./config.js";

const form = document.querySelector("#signature-form");
const formMessage = document.querySelector("#form-message");
const submitButton = form.querySelector("button[type='submit']");
const countElement = document.querySelector("#signature-count");
const nextNumberElement = document.querySelector("#next-signature-number");
const goalLeftElement = document.querySelector("#goal-left");
const progressBar = document.querySelector("#progress-bar");
const comment = form.elements.comment;
const commentLength = document.querySelector("#comment-length");
const dialog = document.querySelector("#success-dialog");

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_PUBLISHABLE_KEY.length > 30 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR-PUBLISHABLE-KEY");

const apiHeaders = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  "Content-Type": "application/json",
};

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...apiHeaders, ...(options.headers || {}) },
  });

  const raw = await response.text();
  let body = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }

  if (!response.ok) {
    const error = new Error(body?.message || `Supabase HTTP ${response.status}`);
    error.code = body?.code || String(response.status);
    error.details = body?.details || null;
    throw error;
  }

  return body;
}

const numberFormatter = new Intl.NumberFormat("ru-RU");

function hideMissingLogos() {
  document.querySelectorAll("[data-logo]").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
    });
  });
}

function updateCounter(count) {
  const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  const nextGoal = Math.ceil((safeCount + 1) / SIGNATURE_GOAL_STEP) * SIGNATURE_GOAL_STEP;
  const previousGoal = Math.max(0, nextGoal - SIGNATURE_GOAL_STEP);
  const progress = ((safeCount - previousGoal) / SIGNATURE_GOAL_STEP) * 100;

  countElement.textContent = numberFormatter.format(safeCount);
  nextNumberElement.textContent = numberFormatter.format(safeCount + 1);
  goalLeftElement.textContent = numberFormatter.format(nextGoal - safeCount);
  progressBar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
}

async function loadSignatureCount() {
  if (!isConfigured) {
    countElement.textContent = "0";
    nextNumberElement.textContent = "1";
    goalLeftElement.textContent = numberFormatter.format(SIGNATURE_GOAL_STEP);
    formMessage.textContent = "Для записи подписей добавьте ключи Supabase в config.js.";
    return;
  }

  try {
    const rows = await supabaseRequest(
      `petition_stats?select=signature_count&petition_slug=eq.${encodeURIComponent(PETITION_SLUG)}&limit=1`
    );
    updateCounter(rows?.[0]?.signature_count ?? 0);
  } catch (error) {
    console.error("Не удалось загрузить счётчик:", error);
    countElement.textContent = "—";
  }
}

function setLoading(isLoading) {
  submitButton.classList.toggle("is-loading", isLoading);
  submitButton.disabled = isLoading;
  submitButton.querySelector(".button-label").textContent = isLoading
    ? "Записываем подпись…"
    : "Подписать и сохранить прямохождение";
}

function showMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = `form-message ${type}`.trim();
}

function normalize(value) {
  return String(value ?? "").trim();
}

function isRateLimited() {
  const lastSubmit = Number(localStorage.getItem("petition:last-submit") || 0);
  return Date.now() - lastSubmit < 15_000;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  if (!form.reportValidity()) return;

  // Простая ловушка для ботов. Реальный пользователь это поле не видит.
  if (normalize(form.elements.website.value)) {
    showMessage("Спасибо! Подпись принята.", "success");
    return;
  }

  if (!isConfigured) {
    showMessage("Supabase ещё не подключён. Добавьте Project URL и Publishable key в config.js.", "error");
    return;
  }

  if (isRateLimited()) {
    showMessage("Подождите несколько секунд перед повторной отправкой.", "error");
    return;
  }

  const payload = {
    petition_slug: PETITION_SLUG,
    display_name: normalize(form.elements.display_name.value),
    email: normalize(form.elements.email.value).toLowerCase(),
    city: normalize(form.elements.city.value) || null,
    comment: normalize(form.elements.comment.value) || null,
    privacy_consent: form.elements.privacy_consent.checked,
  };

  setLoading(true);

  try {
    await supabaseRequest("petition_signatures", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    setLoading(false);
    console.error("Ошибка Supabase:", error);

    if (error.code === "23505") {
      showMessage("Этот email уже использовался для подписи этой петиции.", "error");
      return;
    }

    if (error.code === "42501") {
      showMessage("Запись отклонена политикой безопасности. Проверьте, выполнен ли supabase.sql.", "error");
      return;
    }

    showMessage("Не удалось записать подпись. Попробуйте ещё раз.", "error");
    return;
  }

  setLoading(false);

  localStorage.setItem("petition:last-submit", String(Date.now()));
  form.reset();
  commentLength.textContent = "0";
  showMessage("Подпись успешно записана.", "success");
  await loadSignatureCount();

  if (typeof dialog.showModal === "function") dialog.showModal();
});

comment.addEventListener("input", () => {
  commentLength.textContent = String(comment.value.length);
});

dialog.querySelector(".dialog-close").addEventListener("click", () => dialog.close());
dialog.querySelector(".dialog-ok").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

hideMissingLogos();
loadSignatureCount();
