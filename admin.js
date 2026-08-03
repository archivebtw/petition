import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, PETITION_SLUG } from "./config.js";

const loginSection = document.querySelector("#admin-login");
const dashboard = document.querySelector("#admin-dashboard");
const loginForm = document.querySelector("#admin-login-form");
const loginMessage = document.querySelector("#admin-login-message");
const adminMessage = document.querySelector("#admin-message");
const tableBody = document.querySelector("#admin-signatures");
const searchInput = document.querySelector("#admin-search");
const filterSelect = document.querySelector("#admin-filter");
const refreshButton = document.querySelector("#admin-refresh");
const logoutButton = document.querySelector("#admin-logout");

const isConfigured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_PUBLISHABLE_KEY.length > 30 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR-PUBLISHABLE-KEY");

const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true } })
  : null;

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" });
let signatures = [];

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `utility-message ${type}`.trim();
}

async function verifyAdmin() {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return false;

  const { data, error } = await supabase
    .from("petition_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

function showLogin() {
  loginSection.hidden = false;
  dashboard.hidden = true;
}

async function showDashboard() {
  loginSection.hidden = true;
  dashboard.hidden = false;
  await loadSignatures();
}

async function loadSignatures() {
  setMessage(adminMessage, "Загружаем подписи…");
  const { data, error } = await supabase
    .from("petition_signatures")
    .select("id, display_name, email, city, comment, public_display_consent, public_display_approved, created_at")
    .eq("petition_slug", PETITION_SLUG)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    setMessage(adminMessage, error.message, "error");
    return;
  }

  signatures = data || [];
  setMessage(adminMessage, `Загружено подписей: ${signatures.length}`, "success");
  renderSignatures();
}

function matchesFilter(row) {
  const filter = filterSelect.value;
  if (filter === "pending") return row.public_display_consent && !row.public_display_approved;
  if (filter === "approved") return row.public_display_consent && row.public_display_approved;
  if (filter === "private") return !row.public_display_consent;
  return true;
}

function matchesSearch(row) {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return true;
  return [row.display_name, row.email, row.city, row.comment]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

function createCell(text, className = "") {
  const td = document.createElement("td");
  td.className = className;
  td.textContent = text || "—";
  return td;
}

function renderSignatures() {
  const rows = signatures.filter((row) => matchesFilter(row) && matchesSearch(row));
  tableBody.replaceChildren();

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = createCell("По выбранному фильтру ничего не найдено.", "admin-empty");
    td.colSpan = 5;
    tr.append(td);
    tableBody.append(tr);
    return;
  }

  rows.forEach((row) => {
    const tr = document.createElement("tr");

    const person = document.createElement("td");
    person.className = "admin-person";
    const name = document.createElement("strong");
    name.textContent = row.display_name;
    const email = document.createElement("small");
    email.textContent = row.email;
    const city = document.createElement("small");
    city.textContent = row.city || "Город не указан";
    person.append(name, email, city);

    const comment = createCell(row.comment || "Комментарий отсутствует", "admin-comment");

    const publication = document.createElement("td");
    const status = document.createElement("span");
    if (!row.public_display_consent) {
      status.className = "admin-status admin-status--private";
      status.textContent = "Нет согласия";
    } else if (row.public_display_approved) {
      status.className = "admin-status admin-status--approved";
      status.textContent = "Опубликовано";
    } else {
      status.className = "admin-status admin-status--pending";
      status.textContent = "Ждёт проверки";
    }
    publication.append(status);

    const date = createCell(dateFormatter.format(new Date(row.created_at)));

    const actions = document.createElement("td");
    const actionWrap = document.createElement("div");
    actionWrap.className = "admin-row-actions";

    if (row.public_display_consent) {
      const moderate = document.createElement("button");
      moderate.type = "button";
      moderate.textContent = row.public_display_approved ? "Скрыть" : "Одобрить";
      moderate.addEventListener("click", () => moderateSignature(row, !row.public_display_approved));
      actionWrap.append(moderate);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "danger";
    remove.textContent = "Удалить";
    remove.addEventListener("click", () => deleteSignature(row));
    actionWrap.append(remove);
    actions.append(actionWrap);

    tr.append(person, comment, publication, date, actions);
    tableBody.append(tr);
  });
}

async function moderateSignature(row, approved) {
  const { error } = await supabase
    .from("petition_signatures")
    .update({ public_display_approved: approved })
    .eq("id", row.id);

  if (error) {
    setMessage(adminMessage, error.message, "error");
    return;
  }

  row.public_display_approved = approved;
  renderSignatures();
  setMessage(adminMessage, approved ? "Комментарий опубликован." : "Комментарий скрыт.", "success");
}

async function deleteSignature(row) {
  const confirmed = window.confirm(`Удалить подпись «${row.display_name}»? Счётчик уменьшится автоматически.`);
  if (!confirmed) return;

  const { error } = await supabase.from("petition_signatures").delete().eq("id", row.id);
  if (error) {
    setMessage(adminMessage, error.message, "error");
    return;
  }

  signatures = signatures.filter((item) => item.id !== row.id);
  renderSignatures();
  setMessage(adminMessage, "Подпись удалена.", "success");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!isConfigured) {
    setMessage(loginMessage, "Сначала подключите Supabase в config.js.", "error");
    return;
  }

  const button = loginForm.querySelector("button");
  button.disabled = true;
  setMessage(loginMessage, "Входим…");

  const { error } = await supabase.auth.signInWithPassword({
    email: loginForm.elements.email.value.trim(),
    password: loginForm.elements.password.value,
  });

  if (error) {
    button.disabled = false;
    setMessage(loginMessage, error.message, "error");
    return;
  }

  try {
    if (!(await verifyAdmin())) {
      await supabase.auth.signOut();
      setMessage(loginMessage, "Этот пользователь не добавлен в petition_admins.", "error");
      button.disabled = false;
      return;
    }
    await showDashboard();
  } catch (verificationError) {
    setMessage(loginMessage, verificationError.message, "error");
  } finally {
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", loadSignatures);
logoutButton.addEventListener("click", async () => { await supabase.auth.signOut(); showLogin(); });
searchInput.addEventListener("input", renderSignatures);
filterSelect.addEventListener("change", renderSignatures);

async function init() {
  if (!isConfigured) {
    setMessage(loginMessage, "Сначала подключите Supabase в config.js.", "error");
    return;
  }

  try {
    if (await verifyAdmin()) await showDashboard();
    else showLogin();
  } catch {
    showLogin();
  }
}

init();
