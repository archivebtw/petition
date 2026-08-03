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
const comment = form.elements.comment;
const commentLength = document.querySelector("#comment-length");
const dialog = document.querySelector("#success-dialog");
const scrollProgress = document.querySelector("#scroll-progress");
const scrollProgressBar = document.querySelector("#scroll-progress-bar");
const siteHeader = document.querySelector(".site-header");
const heroCard = document.querySelector(".hero-card");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
let displayedCount = 0;

function hideMissingLogos() {
  document.querySelectorAll("[data-logo]").forEach((image) => {
    image.addEventListener("error", () => {
      image.hidden = true;
    });
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
    const value = Math.round(start + difference * eased);
    countElement.textContent = numberFormatter.format(value);

    if (elapsed < 1) requestAnimationFrame(frame);
    else displayedCount = safeTarget;
  }

  requestAnimationFrame(frame);
}

function updateCounter(count) {
  const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  const nextGoal = Math.ceil((safeCount + 1) / SIGNATURE_GOAL_STEP) * SIGNATURE_GOAL_STEP;

  animateCounter(safeCount);
  nextNumberElement.textContent = numberFormatter.format(safeCount + 1);
  goalLeftElement.textContent = numberFormatter.format(nextGoal - safeCount);
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

function updateScrollUI(progress) {
  const safeProgress = Math.min(1, Math.max(0, Number(progress) || 0));
  const percentage = Math.round(safeProgress * 100);

  scrollProgressBar.style.transform = `scaleX(${safeProgress})`;
  scrollProgress.setAttribute("aria-valuenow", String(percentage));
  siteHeader.classList.toggle("is-scrolled", safeProgress > 0.015);
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
    anchors: {
      offset: -88,
      duration: 1.1,
    },
    smoothWheel: true,
    wheelMultiplier: 0.9,
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
    [".demand-list li", "up"],
    [".sign-copy > *", "left"],
    [".signature-form", "right"],
    [".footer-grid > *", "up"],
  ];

  groups.forEach(([selector, direction]) => {
    document.querySelectorAll(selector).forEach((element, index) => {
      element.dataset.reveal = direction;
      element.style.setProperty("--reveal-delay", `${Math.min(index * 0.07, 0.28)}s`);
    });
  });

  const items = document.querySelectorAll("[data-reveal]");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, {
    threshold: 0.12,
    rootMargin: "0px 0px -8% 0px",
  });

  items.forEach((item) => observer.observe(item));
}

function initHeroCardMotion() {
  if (reduceMotion || !window.matchMedia("(pointer: fine)").matches || !heroCard) return;

  heroCard.addEventListener("pointermove", (event) => {
    const rect = heroCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    heroCard.style.transform = `perspective(60rem) rotateX(${-y * 4}deg) rotateY(${x * 5}deg) rotateZ(1.5deg)`;
  });

  heroCard.addEventListener("pointerleave", () => {
    heroCard.style.transform = "rotate(1.5deg)";
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

  if (typeof dialog.showModal === "function") {
    window.petitionLenis?.stop();
    dialog.showModal();
  }
});

comment.addEventListener("input", () => {
  commentLength.textContent = String(comment.value.length);
});

function closeDialog() {
  dialog.close();
  window.petitionLenis?.start();
}

dialog.querySelector(".dialog-close").addEventListener("click", closeDialog);
dialog.querySelector(".dialog-ok").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeDialog();
});

dialog.addEventListener("cancel", () => {
  window.petitionLenis?.start();
});

hideMissingLogos();
setupRevealAnimations();
initSmoothScroll();
initHeroCardMotion();
loadSignatureCount();

requestAnimationFrame(() => {
  document.body.classList.add("is-ready");
});
