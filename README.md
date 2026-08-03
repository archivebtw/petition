# Сайт-петиция «Фонд прямохождения»

Статический адаптивный сайт с Supabase, публичной лентой одобренных комментариев, эволюционными этапами, шуточным тестом, кнопками распространения, модерацией и опциональной защитой Cloudflare Turnstile.

## Что добавлено

- все основные размеры и брейкпоинты заданы в `rem`;
- адаптивный первый экран без обрезания слова «деградацию»;
- бесконечная лента и плавная прокрутка Lenis;
- верхний прогресс чтения;
- эволюционная шкала на 10, 100, 500 и 1000 подписей;
- публичная лента подписавшихся с отдельным согласием и модерацией;
- интерактивная диагностика уровня деградации;
- кнопки Telegram, ВКонтакте, Web Share и копирования ссылки;
- расширенное окно после успешной подписи;
- пасхалка после десяти нажатий на логотип;
- политика конфиденциальности и запрос удаления подписи;
- закрытая админ-панель для одобрения, скрытия и удаления комментариев;
- Edge Functions для Turnstile, ограничения частоты и удаления по email.

## 1. Логотип

Файл уже лежит здесь:

```text
assets/tankzor-logo.jpg
```

Формат — JPG.

## 2. Обновите Supabase

1. Откройте Supabase Dashboard → **SQL Editor**.
2. Выполните целиком новый файл `supabase.sql`.
3. Скрипт можно выполнять поверх первой версии: он добавляет недостающие столбцы, функции и политики.

После обновления:

- публичный посетитель может вставить подпись;
- таблицу с email нельзя читать публичным ключом;
- наружу возвращаются только одобренные записи с согласием на публикацию;
- удаление подписи автоматически уменьшает счётчик;
- администраторы получают доступ только через Supabase Auth и RLS.

## 3. Настройте `config.js`

```js
export const SUPABASE_URL = "https://PROJECT-REF.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_...";
export const PUBLIC_SITE_URL = "https://ваш-домен.example";
export const CONTACT_EMAIL = "ваша-почта@example.com";
```

`SUPABASE_URL` — это Project URL, а не адрес Dashboard.

Не помещайте в браузерный код `secret` или `service_role` ключ.

## 4. Публичная лента и модерация

В форме появился отдельный флажок на публикацию имени, города и комментария. Даже при согласии запись не появится автоматически: её должен одобрить модератор.

### Создание администратора

1. В Supabase откройте **Authentication → Users**.
2. Создайте пользователя с email и паролем.
3. Скопируйте UUID пользователя.
4. Выполните в SQL Editor:

```sql
insert into public.petition_admins (user_id)
values ('UUID-ПОЛЬЗОВАТЕЛЯ')
on conflict (user_id) do nothing;
```

5. Откройте `admin.html` и войдите этими данными.

Администратор может:

- видеть подписи и email;
- одобрять или скрывать публичные комментарии;
- удалять подписи;
- фильтровать и искать записи.

## 5. Turnstile и защищённая отправка

Обычная отправка через RLS продолжает работать без Edge Function. Для публичного запуска рекомендуется включить защищённый режим.

### Cloudflare

1. Создайте Turnstile Widget.
2. Добавьте домен сайта.
3. Скопируйте Site Key в `config.js`:

```js
export const TURNSTILE_SITE_KEY = "0x4AAAA...";
```

Secret Key хранится только в Supabase secrets.

### Разверните Edge Function

Из корня проекта с установленным Supabase CLI:

```bash
supabase login
supabase link --project-ref ВАШ_PROJECT_REF
supabase functions deploy sign-petition
```

Добавьте secrets:

```bash
supabase secrets set CF_TURNSTILE_SECRET_KEY="секрет-cloudflare"
supabase secrets set RATE_LIMIT_SALT="случайная-длинная-строка"
supabase secrets set ALLOWED_ORIGIN="https://ваш-домен.example"
```

Edge Function проверяет Turnstile на сервере, ограничивает слишком частые отправки по необратимому хешу сетевого отпечатка и только затем записывает подпись.

## 6. Удаление подписи по email

Для отправки писем используется Resend. Потребуются аккаунт, API key и подтверждённый домен.

Разверните функции:

```bash
supabase functions deploy request-signature-deletion
supabase functions deploy confirm-signature-deletion
```

Добавьте secrets:

```bash
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set DELETE_EMAIL_FROM="Фонд прямохождения <privacy@ваш-домен.example>"
supabase secrets set PUBLIC_SITE_URL="https://ваш-домен.example"
supabase secrets set ALLOWED_ORIGIN="https://ваш-домен.example"
```

Пользователь вводит email на `privacy.html`, получает одноразовую ссылку на `delete.html`, после чего подпись и публичный комментарий удаляются. Ссылка действует 30 минут.

## 7. Локальный запуск

Не открывайте `index.html` двойным кликом: проект использует ES-модули.

```bash
python -m http.server 8080
```

Откройте:

```text
http://localhost:8080
```

Или используйте:

```bash
npx serve .
```

## 8. Публикация

Основную папку можно разместить на Netlify, Vercel, GitHub Pages или любом статическом хостинге. Папка `supabase/` нужна для развёртывания Edge Functions и не обязана публиковаться вместе с сайтом.

После публикации обязательно заполните `PUBLIC_SITE_URL`, иначе кнопки распространения будут использовать текущий адрес страницы.

## Структура

```text
index.html                         главная страница
styles.css                        дизайн и адаптивность
app.js                            форма, счётчик, лента, тест, анимации
config.js                         публичные настройки
privacy.html / privacy.js         политика и запрос удаления
admin.html / admin.js / admin.css модерация
utility-pages.css                 стили служебных страниц
delete.html / delete.js           подтверждение удаления
supabase.sql                      схема, RLS, RPC и триггеры
supabase/functions/               защищённые серверные функции
assets/                           логотип и будущие изображения
```

## Важное замечание

Петиция сатирическая. Не используйте сайт для травли, преследования, массовых жалоб, публикации чужих персональных данных или попыток получить доступ к чужому Telegram-аккаунту.
