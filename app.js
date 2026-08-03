import {
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  PETITION_SLUG,
  SIGNATURE_GOAL_STEP,
  PUBLIC_SITE_URL,
  TURNSTILE_SITE_KEY,
  SECURE_SIGNING_FUNCTION,
} from "./config.js";

const form = document.querySelector("#signature-form");
const formMessage = document.querySelector("#form-message");
const submitButton = form.querySelector("button[type='submit']");
const countElement = document.querySelector("#signature-count");
const nextNumberElement = document.querySelector("#next-signature-number");
const goalLeftElement = document.querySelector("#goal-left");
const goalStageElement = document.querySelector("#goal-stage");
const comment = form.elements.comment;
const commentLength = document.querySelector("#comment-length");
const dialog = document.querySelector("#success-dialog");
const scrollProgress = document.querySelector("#scroll-progress");
const scrollProgressBar = document.querySelector("#scroll-progress-bar");
const siteHeader = document.querySelector(".site-header");
const heroCard = document.querySelector(".hero-card");
const milestoneElements = [...document.querySelectorAll(".milestone")];
const voiceGrid = document.querySelector("#voice-grid");
const refreshVoicesButton = document.querySelector("#refresh-voices");
const quizForm = document.querySelector("#quiz-form");
const diagnosisCard = document.querySelector("#diagnosis-card");
const diagnosisTitle = document.querySelector("#diagnosis-title");
const diagnosisText = document.querySelector("#diagnosis-text");
const turnstileSlot = document.querySelector("#turnstile-slot");
const easterToast = document.querySelector("#easter-toast");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_PUBLISHABLE_KEY.length > 30 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR-PUBLISHABLE-KEY");

const secureSigningEnabled = isConfigured && Boolean(TURNSTILE_SITE_KEY?.trim());
const apiHeaders = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  "Content-Type": "application/json",
};

const numberFormatter = new Intl.NumberFormat("ru-RU");
const shortDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

let displayedCount = 0;
let revealObserver = null;
let turnstileWidgetId = null;
let turnstileToken = "";

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
    const error = new Error(body?.message || body?.error || `Supabase HTTP ${response.status}`);
    error.code = body?.code || String(response.status);
    error.details = body?.details || null;
    throw error;
  }

  return body;
}

async function edgeFunctionRequest(functionName, payload) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      ...apiHeaders,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let body = null;
  if (raw) {
    try { body = JSON.parse(raw); } catch { body = raw; }
  }

  if (!response.ok) {
    const error = new Error(body?.message || body?.error || `Function HTTP ${response.status}`);
    error.code = body?.code || String(response.status);
    throw error;
  }

  return body;
}

function hideMissingLogos() {
  document.querySelectorAll("[data-logo]").forEach((image) => {
    image.addEventListener("error", () => { image.hidden = true; });
  });
}

function animateCounter(target) {
  const safeTarget = Math.max(0, Number(target) || 0);
  if (reduceMotion || safeTarget === displayedCount) {
    displayedCount = safeTarget;
    countElement.textContent = numberFormatter.format(safeTarget);
    return;
  }

  const start = displayedCount;
  const difference = safeTarget - start;
  const startedAt = performance.now();
  const duration = Math.min(1100, Math.max(450, Math.abs(difference) * 24));

  function frame(now) {
    const elapsed = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 4);
    countElement.textContent = numberFormatter.format(Math.round(start + difference * eased));
    if (elapsed < 1) requestAnimationFrame(frame);
    else displayedCount = safeTarget;
  }

  requestAnimationFrame(frame);
}

function updateMilestones(count) {
  let currentAssigned = false;
  milestoneElements.forEach((element) => {
    const threshold = Number(element.dataset.threshold);
    const complete = count >= threshold;
    element.classList.toggle("is-complete", complete);
    element.classList.remove("is-current");

    if (!complete && !currentAssigned) {
      element.classList.add("is-current");
      currentAssigned = true;
    }
  });

  const nextMilestone = milestoneElements.find((element) => count < Number(element.dataset.threshold));
  if (nextMilestone) {
    const threshold = Number(nextMilestone.dataset.threshold);
    const title = nextMilestone.querySelector("h3")?.textContent || "Следующий этап эволюции";
    goalStageElement.textContent = title;
    goalLeftElement.textContent = numberFormatter.format(threshold - count);
    heroCard.classList.remove("goal-reached");
    return;
  }

  const nextGoal = Math.ceil((count + 1) / SIGNATURE_GOAL_STEP) * SIGNATURE_GOAL_STEP;
  goalStageElement.textContent = "Расширяем фонд прямохождения";
  goalLeftElement.textContent = numberFormatter.format(nextGoal - count);
  heroCard.classList.add("goal-reached");
}

function updateCounter(count) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(0, Number(count)) : 0;
  animateCounter(safeCount);
  nextNumberElement.textContent = numberFormatter.format(safeCount + 1);
  updateMilestones(safeCount);
}

async function loadSignatureCount() {
  if (!isConfigured) {
    updateCounter(0);
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

function createVoiceCard(row) {
  const article = document.createElement("article");
  article.className = "voice-card is-visible";

  const quote = document.createElement("p");
  quote.textContent = row.comment || "Подписал(а), потому что кто-то должен был сохранить письменность.";

  const footer = document.createElement("footer");
  const name = document.createElement("strong");
  name.textContent = row.display_name || "Анонимный Homo sapiens";
  const meta = document.createElement("small");
  const pieces = [];
  if (row.city) pieces.push(row.city);
  if (row.created_at) pieces.push(shortDateFormatter.format(new Date(row.created_at)));
  meta.textContent = pieces.join(" · ") || "местонахождение засекречено";

  footer.append(name, meta);
  article.append(quote, footer);
  return article;
}

function showVoiceMessage(message) {
  const article = document.createElement("article");
  article.className = "voice-card voice-card--placeholder is-visible";
  const text = document.createElement("p");
  text.textContent = message;
  article.append(text);
  voiceGrid.replaceChildren(article);
}

async function loadPublicVoices() {
  if (!isConfigured) {
    showVoiceMessage("После подключения Supabase здесь появятся одобренные комментарии подписавшихся.");
    return;
  }

  refreshVoicesButton.disabled = true;
  refreshVoicesButton.textContent = "Загрузка…";

  try {
    const rows = await supabaseRequest("rpc/get_public_petition_signatures", {
      method: "POST",
      body: JSON.stringify({ p_petition_slug: PETITION_SLUG, p_limit: 6 }),
    });

    if (!Array.isArray(rows) || rows.length === 0) {
      showVoiceMessage("Публичных комментариев пока нет. Можно стать первым человеком, добровольно использовавшим полное предложение.");
      return;
    }

    voiceGrid.replaceChildren(...rows.map(createVoiceCard));
  } catch (error) {
    console.error("Не удалось загрузить публичные подписи:", error);
    showVoiceMessage("Свидетельства временно скрылись в зарослях. Попробуйте обновить позже.");
  } finally {
    refreshVoicesButton.disabled = false;
    refreshVoicesButton.textContent = "Обновить ↻";
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

function normalize(value) { return String(value ?? "").trim(); }
function isRateLimited() {
  const lastSubmit = Number(localStorage.getItem("petition:last-submit") || 0);
  return Date.now() - lastSubmit < 15_000;
}

function updateScrollUI(progress) {
  const safeProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  const percentage = Math.round(safeProgress * 100);
  scrollProgressBar.style.transform = `scaleX(${safeProgress})`;
  scrollProgress.setAttribute("aria-valuenow", String(percentage));
  siteHeader.classList.toggle("is-scrolled", safeProgress > .015);
}

function getNativeScrollProgress() {
  const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return window.scrollY / maxScroll;
}

function initNativeScrollFallback() {
  const update = () => updateScrollUI(getNativeScrollProgress());
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
}

function initSmoothScroll() {
  if (reduceMotion || typeof window.Lenis !== "function") {
    initNativeScrollFallback();
    return;
  }

  const lenis = new window.Lenis({
    autoRaf: true,
    anchors: { offset: -88, duration: 1.1 },
    smoothWheel: true,
    wheelMultiplier: .9,
    touchMultiplier: 1,
    stopInertiaOnNavigate: true,
  });

  window.petitionLenis = lenis;
  lenis.on("scroll", (instance) => updateScrollUI(instance.progress));
  updateScrollUI(lenis.progress);
}

function setupRevealAnimations() {
  const groups = [
    [".section-heading", "left"],
    [".manifesto > p, .manifesto > blockquote", "up"],
    [".warning-card", "right"],
    [".argument-grid article", "up"],
    [".milestone", "up"],
    [".voice-card", "up"],
    [".quiz-copy > *, .quiz-form fieldset, .quiz-form > button", "up"],
    [".demand-list li", "up"],
    [".sign-copy > *", "left"],
    [".signature-form", "right"],
    [".share-grid > *", "up"],
    [".footer-grid > *", "up"],
  ];

  groups.forEach(([selector, direction]) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.dataset.reveal = direction;
      element.style.setProperty("--reveal-delay", `${Math.min(index * .07, .3)}s`);
    });
  });

  const items = document.querySelectorAll("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });

  items.forEach((item) => revealObserver.observe(item));
}

function initHeroCardMotion() {
  if (reduceMotion || !window.matchMedia("(pointer: fine)").matches || !heroCard) return;

  heroCard.addEventListener("pointermove", (event) => {
    const rect = heroCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    heroCard.style.transform = `perspective(60rem) rotateX(${-y * 4}deg) rotateY(${x * 5}deg) rotateZ(1.35deg)`;
  });

  heroCard.addEventListener("pointerleave", () => {
    heroCard.style.transform = "rotate(1.35deg)";
  });
}

function initQuiz() {
  quizForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!quizForm.reportValidity()) return;

    const data = new FormData(quizForm);
    const score = ["q1", "q2", "q3"].reduce((sum, key) => sum + Number(data.get(key) || 0), 0);
    const diagnoses = [
      {
        max: 1,
        title: "Прямохождение сохранено",
        text: "Пациент всё ещё способен использовать слова по назначению. Рекомендуется профилактическая подпись петиции.",
      },
      {
        max: 3,
        title: "Начальная бананизация",
        text: "Наблюдаются мемы без контекста и лёгкая тяга к голосовым. Рекомендуется читать хотя бы одно полное предложение в день.",
      },
      {
        max: 5,
        title: "Критическая деградация",
        text: "Письменность находится под угрозой. Необходимы закрытие чата, прогулка и двухнедельный курс общения без стикеров.",
      },
      {
        max: 6,
        title: "Админка у обезьян",
        text: "Научная помощь опоздала. Подпишите петицию, отложите телефон и медленно отойдите от дерева.",
      },
    ];

    const result = diagnoses.find((item) => score <= item.max) || diagnoses.at(-1);
    diagnosisTitle.textContent = result.title;
    diagnosisText.textContent = result.text;
    diagnosisCard.hidden = false;
    diagnosisCard.animate(
      [{ opacity: 0, transform: "translateY(1rem)" }, { opacity: 1, transform: "none" }],
      { duration: reduceMotion ? 1 : 550, easing: "cubic-bezier(.16,1,.3,1)" }
    );
  });
}

function getShareUrl() {
  return normalize(PUBLIC_SITE_URL) || `${window.location.origin}${window.location.pathname}`;
}

async function shareByType(type, button) {
  const url = getShareUrl();
  const title = "Остановим цифровую деградацию";
  const text = "Подпишите сатирическую петицию и помогите сохранить человечеству прямохождение.";

  if (type === "native" && navigator.share) {
    try { await navigator.share({ title, text, url }); } catch (error) {
      if (error?.name !== "AbortError") console.error(error);
    }
    return;
  }

  if (type === "telegram") {
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    return;
  }

  if (type === "vk") {
    window.open(`https://vk.com/share.php?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    await navigator.clipboard.writeText(url);
    const oldText = button.textContent;
    button.textContent = "Ссылка скопирована ✓";
    setTimeout(() => { button.textContent = oldText; }, 1800);
  } catch {
    window.prompt("Скопируйте ссылку:", url);
  }
}

function initShareButtons() {
  document.querySelectorAll("[data-share]").forEach((button) => {
    if (button.dataset.share === "native" && !navigator.share) button.textContent = "Копировать ссылку";
    button.addEventListener("click", () => shareByType(button.dataset.share, button));
  });
}

function initEasterEgg() {
  let clicks = 0;
  let toastTimer = null;

  document.querySelectorAll("[data-easter-logo]").forEach((logo) => {
    logo.addEventListener("click", (event) => {
      clicks += 1;
      if (clicks < 10) return;
      clicks = 0;
      event.preventDefault();
      playSyntheticMeow();
      easterToast.classList.add("is-visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => easterToast.classList.remove("is-visible"), 3200);
    });
  });

  console.info("🐒 Вы нашли последний оплот критического мышления.");
}

function playSyntheticMeow() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(520, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(760, context.currentTime + .09);
    oscillator.frequency.exponentialRampToValueAtTime(410, context.currentTime + .34);
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.14, context.currentTime + .03);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .38);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .4);
  } catch (error) {
    console.debug("Звуковая пасхалка недоступна:", error);
  }
}

function loadTurnstileScript() {
  if (!secureSigningEnabled) return;
  turnstileSlot.hidden = false;

  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.defer = true;
  script.addEventListener("load", () => {
    turnstileWidgetId = window.turnstile.render("#turnstile-widget", {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      callback: (token) => { turnstileToken = token; showMessage(""); },
      "expired-callback": () => { turnstileToken = ""; },
      "error-callback": () => { turnstileToken = ""; showMessage("Антибот-проверка не загрузилась. Обновите страницу.", "error"); },
    });
  });
  script.addEventListener("error", () => showMessage("Не удалось загрузить антибот-проверку.", "error"));
  document.head.append(script);
}

async function submitSignature(payload) {
  if (secureSigningEnabled) {
    if (!turnstileToken) {
      const error = new Error("Подтвердите антибот-проверку.");
      error.code = "TURNSTILE_REQUIRED";
      throw error;
    }

    return edgeFunctionRequest(SECURE_SIGNING_FUNCTION, {
      ...payload,
      turnstile_token: turnstileToken,
      website: normalize(form.elements.website.value),
    });
  }

  return supabaseRequest("petition_signatures", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(payload),
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");

  if (!form.reportValidity()) return;
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
    public_display_consent: form.elements.public_display_consent.checked,
    privacy_consent: form.elements.privacy_consent.checked,
  };

  setLoading(true);

  try {
    await submitSignature(payload);
  } catch (error) {
    setLoading(false);
    console.error("Ошибка записи подписи:", error);

    if (error.code === "TURNSTILE_REQUIRED") {
      showMessage(error.message, "error");
      return;
    }
    if (error.code === "23505") {
      showMessage("Этот email уже использовался для подписи этой петиции.", "error");
      return;
    }
    if (error.code === "42501") {
      showMessage("Запись отклонена политикой безопасности. Выполните обновлённый supabase.sql.", "error");
      return;
    }
    if (error.code === "RATE_LIMITED") {
      showMessage("Слишком много попыток. Подождите немного и попробуйте снова.", "error");
      return;
    }

    showMessage(error.message || "Не удалось записать подпись. Попробуйте ещё раз.", "error");
    if (turnstileWidgetId !== null) window.turnstile?.reset(turnstileWidgetId);
    turnstileToken = "";
    return;
  }

  setLoading(false);
  localStorage.setItem("petition:last-submit", String(Date.now()));
  form.reset();
  commentLength.textContent = "0";
  showMessage("Подпись успешно записана.", "success");
  if (turnstileWidgetId !== null) window.turnstile?.reset(turnstileWidgetId);
  turnstileToken = "";

  await Promise.all([loadSignatureCount(), loadPublicVoices()]);

  if (typeof dialog.showModal === "function") {
    window.petitionLenis?.stop();
    dialog.showModal();
  }
});

comment.addEventListener("input", () => {
  commentLength.textContent = String(comment.value.length);
});
refreshVoicesButton.addEventListener("click", loadPublicVoices);

function closeDialog() {
  dialog.close();
  window.petitionLenis?.start();
}
dialog.querySelector(".dialog-close").addEventListener("click", closeDialog);
dialog.querySelector(".dialog-ok").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
dialog.addEventListener("cancel", () => window.petitionLenis?.start());

hideMissingLogos();
setupRevealAnimations();
initSmoothScroll();
initHeroCardMotion();
initQuiz();
initShareButtons();
initEasterEgg();
loadTurnstileScript();
loadSignatureCount();
loadPublicVoices();

requestAnimationFrame(() => document.body.classList.add("is-ready"));
