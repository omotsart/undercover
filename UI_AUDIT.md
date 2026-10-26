# UI-аудит дашборда UnderCover: экран «Claims queue»

Снимок состояния ветки `harness` (коммит `36702ce`). Код не менялся. Ссылки вида `файл:строки` указывают на текущие файлы. Где ответа в коде нет, так и написано.

---

## 1. Стек и структура

### Технологии

| Что | Значение | Где |
|---|---|---|
| Фреймворк | React 19.3.0 и react-dom 19.3.0 (установлены именно эти версии, `npm ls`) | `package.json:21-22` |
| Сборщик и dev-сервер | Vite 8.3.1, плагин `@vitejs/plugin-react` ^6.1.1 | `package.json:33,51`, `dashboard/vite.config.ts:1-17` |
| Язык | TypeScript 6.0.3, `strict: true` | `package.json:49`, `tsconfig.json` |
| Стилизация | Один глобальный CSS-файл с CSS custom properties. CSS Modules, Tailwind и styled-components не используются | `dashboard/src/styles.css`, подключён в `dashboard/src/App.tsx:6` |
| UI-библиотеки | не найдено (всё написано вручную) | — |
| Графики | библиотеки нет: кольцо — ручной SVG, полосы — `div` на flex и grid | `dashboard/src/charts.tsx:5-134` |
| Иконки | библиотеки нет: одна inline-SVG (refresh) и символы Unicode `✓ → ✕` | `dashboard/src/components.tsx:56-65`, `115-119` |
| Markdown | `react-markdown` 10.1.0, только на странице инструкций | `package.json:23`, `dashboard/src/InstructionsPage.tsx:1,23` |
| Роутинг | своя обёртка над History API, библиотеки нет | `dashboard/src/hooks.ts:38-55`, `dashboard/src/App.tsx:8-13` |
| Данные | `fetch` и опрос (polling) раз в 2 секунды | `dashboard/src/api.ts:94-124`, `dashboard/src/hooks.ts:6-36` |
| Шрифт | Outfit 300/400/500 с Google Fonts | `dashboard/index.html:7-12` |
| Тесты UI | Vitest + Testing Library (jsdom), Playwright e2e | `dashboard/vite.config.ts:9-15`, `e2e/pilot.spec.ts` |

### Файлы UI

```
dashboard/
  index.html               оболочка страницы, подключение шрифта Outfit, #root
  vite.config.ts           прокси /api на бэкенд, настройки vitest и покрытия
  src/
    main.tsx               точка входа: createRoot + StrictMode
    App.tsx                раскладка .page, шапка и выбор страницы по пути
    hooks.ts               usePolling (опрос), navigate и usePath (роутинг), событие REFRESH
    api.ts                 типы данных API и функции запросов
    format.ts              деньги, даты, подписи статусов и решений, countBy, percent
    components.tsx         Link, Header, StatusChip, TodoChip, RunChip, DecisionChip, Card
    charts.tsx             StatusBar (полоса статусов), RingChart (кольцо), DecisionsBar
    QueuePage.tsx          экран «Claims queue»: заголовок, KPI, таблица, Next for sign-off
    RunCard.tsx            карточка «The agent's run» и to-do список
    ClaimPage.tsx          страница заявки /claims/:id
    InstructionsPage.tsx   страница /instructions
    styles.css             все стили и токены (877 строк)
    testing.ts             заглушка fetch и фабрика ClaimSummary для тестов
    *.test.ts(x)           тесты vitest
e2e/pilot.spec.ts          тесты Playwright
```

### Как запустить локально

1. `uv sync` и `npm install` в корне репозитория (`docs/PROCESS.md:3`).
2. `npm run seed` сбрасывает базу к 25 ждущим заявкам (`docs/STATUS.md:29`, `package.json:13`).
3. `npm run dev` запускает бэкенд на :8000 и дашборд на http://localhost:5173 (`docs/STATUS.md:28`, `package.json:10-12`). Vite проксирует `/api` на `http://127.0.0.1:8000` (`dashboard/vite.config.ts:7`).
4. Для прогона агента нужен `OPENROUTER_API_KEY` в `.env` (`docs/TECH_STACK.md`). Сам дашборд открывается и без ключа.

---

## 2. Дизайн-токены

Все токены объявлены в `:root`, `dashboard/src/styles.css:1-40`. Они повторяют блок «Ready-to-use tokens» из `docs/BRAND.md`.

### 2.1 Цвета: токены

| Токен | Значение | Строка | Где используется | Значение (смысл) |
|---|---|---|---|---|
| `--graphite` | `#232323` | 2 | `body` 55; `.pill`/`.pill.active` 144, 150; `.main-action` 212; `.cap-field input` 238; `.chip-inner` 308; статусы 317, 322, 327; `.status-bar-item .label` 406; `.ring-total` 587; `.handler-select select` 817 | основной текст, активная вкладка |
| `--sunflower` | `#f8d45c` | 3 | `.main-action` 211; `.dark-panel .error` 829 | главная кнопка; текст ошибки на тёмной панели |
| `--stone` | `#8e8e8e` | 4 | **нигде** | не используется (мёртвый токен) |
| `--slate` | `#55585e` | 5 | `.label` 107, `.empty` 111, `.count` 192, `.message` 203, `.cap-field` 226, `.no-decision` 381, `.claims-head` 495, `.items-table th` 739 | приглушённый текст |
| `--status-waiting` | `#a9afb7` | 7 | `.status-waiting` 316, `.ring-waiting` 565 | статус Waiting |
| `--status-progress-stripe` | `#6b7079` | 8 | `--hatch` 24 | полоса штриховки In progress |
| `--status-signoff` | `#f5c400` | 9 | `.status-awaiting_signoff` 326, `.ring-awaiting_signoff` 573 | статус Waiting for sign-off |
| `--status-decided` | `#232323` | 10 | `.status-decided` 331, `.ring-decided` 577 | статус Decided |
| `--status-handler` | `#55585e` | 11 | `.status-for_handler` 336, `.ring-for_handler` 581 | статус Left for a handler |
| `--charcoal` | `#2b2b2b` | 12 | `.dark-panel` 632 | тёмная панель Next for sign-off и Sign off |
| `--fog` | `#b5b5b5` | 13 | `.dark-panel .empty` 639, `.signoff-name` 670, `.handler-select` 808 | вторичный текст на тёмной панели |
| `--card` | `rgba(255,255,255,0.6)` | 14 | `.card` 92 | фон карточек |
| `--page-bg` | `radial-gradient(120% 90% at 100% 100%, #fce9a6 0%, #f6f0da 40%, #ecedef 75%)` | 15-20 | `body` 51 | фон страницы |
| `--hatch` | `repeating-linear-gradient(120deg, #ffffff 0 6px, var(--status-progress-stripe) 6px 10px)` | 21-25 | `.status-in_progress` 321 | штриховка In progress |
| `--approved` / `-tint` / `-ink` | `#1f9d55` / `#dcf3e4` / `#176b3a` | 27-29 | иконка 359, плашка 354-355, сегмент 620 | решение Approved |
| `--referred` / `-tint` / `-ink` | `#f08a00` / `#fdebd3` / `#9a4d00` | 30-32 | 368, 363-364, 624 | решение Referred |
| `--declined` / `-tint` / `-ink` | `#dc3b3b` / `#fbdddd` / `#a8232a` | 33-35 | 377, 372-373, 628 | решение Declined |

### 2.2 Цвета: захардкоженные значения

| Значение | Где | Смысл |
|---|---|---|
| `#ffffff` | `styles.css:143` (`.pill`), `162` (`.icon-button`), `237` (`.cap-field input`), `307` (`.chip-inner`), `332`, `337` (текст Decided и Left for a handler), `348` (глиф решения), `522` (hover строки), `635` (`.dark-panel`), `816` (select) | белый; токена нет |
| `#ffffff` в `--hatch` | `styles.css:23` | светлая полоса штриховки |
| `#cfcfcf` | `styles.css:510` (`.claim-row`), `745` (`.items-table td`) | пунктирный разделитель строк; токена нет, значение повторено дважды |
| `rgba(35,35,35,0.08)` | `styles.css:524` | тень строки при наведении (это Graphite с прозрачностью) |
| `rgba(35,35,35,0.06)` | `styles.css:556` | дорожка кольца (тоже Graphite) |
| `rgba(255,255,255,0.1)` | `styles.css:665` | hover и фокус ссылки на тёмной панели |
| `#FFFFFF`, `#6B7079` | `dashboard/src/charts.tsx:57-58` | штриховка кольца в SVG `<pattern>`: дубль `--hatch` и `--status-progress-stripe` в виде литералов |
| `#fce9a6`, `#f6f0da`, `#ecedef` | `styles.css:17-19` | точки градиента фона (только внутри токена) |

### 2.3 Дубли и почти одинаковые оттенки

- **Точные дубли:**
  - `--graphite` = `--status-decided` = `#232323` (`styles.css:2,10`);
  - `--slate` = `--status-handler` = `#55585e` (`styles.css:5,11`). Один и тот же Slate служит цветом приглушённого текста и цветом статуса.
  - `#6b7079` объявлен в токене (`styles.css:8`) и захардкожен в SVG (`charts.tsx:58`).
- **Почти одинаковые:**
  - `--charcoal #2b2b2b` и `--graphite #232323`: тёмная панель и плашка Decided визуально почти неотличимы;
  - `--sunflower #f8d45c` (кнопка) и `--status-signoff #f5c400` (статус): две близкие жёлтые;
  - `--fog #b5b5b5`, `--status-waiting #a9afb7` и `#cfcfcf`: три близких серых;
  - `--slate #55585e` и полоса штриховки `#6b7079`.
- **Соседство на экране:** контраст между заливками Left for a handler (Slate) и Decided (Graphite) всего 2.2:1, а в полосе статусов эти плашки стоят рядом (`format.ts:43-49`).

### 2.4 Типографика

- **Шрифт:** Outfit 300/400/500 с Google Fonts, `display=swap` (`dashboard/index.html:7-12`). Стек: `"Outfit", system-ui, sans-serif` (`styles.css:52`). Моноширинного и акцентного шрифтов нет.
- **Размеры:**

| font-size | weight | Где |
|---|---|---|
| 64px (48px при ≤600px) | 300, letter-spacing −0.03em, line-height 1 | `.big-number .num` 444-449, 874-876 |
| 56px (40px при ≤600px) | 400, letter-spacing −0.02em, line-height 1.1 | `h1` 184-189, 866-868 |
| 40px | 300 | `.ring-total` 584-589 (SVG), `.card-number` 790-794 (line-height 1) |
| 24px | 400 | `.card-title` 98-102, `.instructions h2` 683-687 |
| 24px | 500 | `.brand` 125-129 |
| 16px | 500 | `.status-pill` 412-423 |
| 15px | 400 | `body` 53-54, `.cap-field input` 240, `.handler-select select` 819-820 |
| 15px | 500 | `.documents h3` 765-769 |
| 13px | 500 | `.label` 104-108, `.chip` 289-299, `.claims-head` 491-496, `.cap-field` 222-229, `.items-table th` 735-741, `.handler-select` 801-809 |
| 13px | (наследуется 500 от `.chip`) | `.decision-icon` 340-351 |

- **Насыщенность:** используются только 300, 400 и 500. Weight 500 задан для `.pill` 145, `.main-action` 213, `.row-link` 533, `.items-table .total td` 753, `.instructions code` 697.
- **line-height:** 1 (`.big-number .num` 448, `.decision-icon` 350, `.card-number` 793), 1.1 (`h1` 188), 1.5 (`.decision` 779, `.dark-panel p` 797, `.steps li` 845), 1.6 (`.run-summary` 284, `.instructions` 680, `.story` 727, `.documents p` 772). У остального line-height по умолчанию браузера.
- **letter-spacing:** только `h1` (−0.02em) и `.big-number .num` (−0.03em).
- **tabular-nums:** класс `.num` (`styles.css:75-77`), а также `.status-pill` 421, `.cap-field input` 241 и `.ring-total` 588. `.num` стоит на ID, датах и суммах в таблице (`QueuePage.tsx:34,41,44,53`), KPI (`QueuePage.tsx:101`), счётчиках легенд (`charts.tsx:94,126`), строке «Run N» (`RunCard.tsx:39-40`), шагах (`ClaimPage.tsx:180`) и `h1` заявки (`ClaimPage.tsx:233`). Колонки Customer и Type без `.num`, что верно.
- **Минимальный размер текста** 13px, как требует `docs/BRAND.md:12`.

### 2.5 Отступы, радиусы, тени, границы, сетка

- **Контейнер:** `max-width: 1440px`, `padding: 24px 32px 48px` (`styles.css:79-83`); при ≤600px `16px 16px 32px` (`862-864`).
- **Отступы:**
  - вертикальный ритм страницы `.stack` gap 24px (85-89);
  - между карточками `--gap: 16px` (39), используется в 389, 456, 467, 706;
  - внутренний отступ карточки и тёмной панели 24px (94, 634);
  - заголовок карточки `margin-bottom: 16px` (101).
  - Прочие gap заданы литералами: 4 (441, 609, 645), 6 (292), 8 (134, 395, 401, 594, 604, 787, 804), 10 (225, 488), 12 (250, 266, 654, 835), 16 (121, 173, 180, 199, 713, 759, 778), 24 (435), `10px 24px` (257).
- **Радиусы:**
  - `--radius-card` 32px (37, `.card`);
  - `--radius-pill` 999px (38): pill, chip, status-pill, input, select, сегменты решений;
  - литералы: `28px` у `.dark-panel` (633), `14px` у строки, ссылки строки и ссылки sign-off (511, 542, 659), `50%` у `.icon-button` (161) и `.decision-icon` (347).
- **Тени:** одна — `0 2px 10px rgba(35,35,35,0.08)` у строки таблицы при hover и фокусе (524).
- **Границы:** только `1px dashed #cfcfcf` (510, 745). У кнопок, input и select `border: none` (160, 209, 235, 814). У карточек обводки нет, как требует `docs/BRAND.md`.
- **Сетки:**
  - summary-row `minmax(0,3fr) minmax(0,2fr)` (388);
  - полоса статусов `repeat(5, minmax(0,1fr))` (394), при ≤600px `repeat(2, …)` (871);
  - main-grid `repeat(4, minmax(0,1fr))`, таблица занимает 3 колонки (455, 461);
  - to-do список `repeat(auto-fill, minmax(min(100%, 340px), 1fr))` (256);
  - поля заявки `repeat(auto-fill, minmax(140px, 1fr))` (712);
  - колонки таблицы — см. раздел 7.
- **Прочие max-width:** `.run-summary` 880px (282), `.instructions` 880px (679), `.story` 760px (726).

### 2.6 Тёмная тема

Не найдено. Нет ни `prefers-color-scheme`, ни `data-theme`, ни альтернативного набора токенов (поиск по `styles.css`). `docs/BRAND.md` на этой ветке тёмную тему тоже не описывает.

---

## 3. Компоненты

Обозначения: «нет» — состояние не реализовано; «браузер» — работает только стандартное поведение браузера, своего стиля нет.

### Link — `components.tsx:11-31`
- **Props:** `to: string`, `className?: string`, `children`.
- **Поведение:** рендерит настоящий `<a href>`. Обычный левый клик перехватывается и вызывает `navigate` через History API; клик с Ctrl/Meta/Shift и средней кнопкой уходит браузеру (`21-22`), так что открытие в новой вкладке работает.
- **Стиль:** зависит от `className`, собственного стиля нет.
- **Состояния:** hover, active и focus-visible — нет (стиль задаёт класс снаружи).

### Header — `components.tsx:33-70`
- **Props:** `path`.
- **Варианты:** активна вкладка Queue или Instructions (`34, 41, 46`).
- **Элементы:** бренд-ссылка «UnderCover» → `/`; вкладки-ссылки `.pill` → `/` и `/instructions`; кнопка `.icon-button` Refresh.
- **Состояния:**

| Состояние | `.pill` (137-152) | `.icon-button` (154-164) |
|---|---|---|
| default | белая пилюля, Graphite | белый круг 44px |
| active (текущая страница) | `.pill.active`: Graphite и белый текст | — |
| hover | нет | нет (только `cursor: pointer`) |
| `:active` (нажатие) | нет | нет |
| focus-visible | браузер | браузер |
| disabled / loading | — | нет (нет индикатора обновления) |

### FilledChip (внутренний), StatusChip, TodoChip, RunChip — `components.tsx:72-113`
- **Общая основа:** `FilledChip({status, label})` рендерит `<span class="chip status-${status}">`. Для `in_progress` текст оборачивается в `.chip-inner` (белая внутренняя пилюля, 78-82).
- **StatusChip `{status}`** (87-89): статус заявки. Пять вариантов: `waiting`, `in_progress`, `awaiting_signoff`, `decided`, `for_handler` (`api.ts:1-2`).
- **TodoChip `{status}`** (92-103): переводит статус to-do в цвет статуса заявки: `to_do`→waiting, `in_progress`→in_progress, `done`→decided, `for_handler`→for_handler.
- **RunChip `{status}`** (105-113): `running`→in_progress («Working»), `finished`→decided («Finished»), `stopped`→awaiting_signoff («Stopped»).
- **Ключевые стили:**

```css
.chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 12px;
        border-radius:var(--radius-pill); font-size:13px; font-weight:500; white-space:nowrap; } /* 289-299 */
.chip-inner { height:20px; padding:0 8px; background:#ffffff; color:var(--graphite); }    /* 301-309 */
.chip.status-in_progress { padding:0 3px; }                                               /* 311-313 */
.status-in_progress { background:var(--hatch); }                                           /* 320-323 */
```

- **Состояния:** только default. hover, focus, disabled, loading, empty и error — нет: это не интерактивные элементы.

### DecisionChip — `components.tsx:115-133`
- **Props:** `decision: Decision | null`.
- **Варианты:**
  - `approve` (✓, «Approved»), `refer` (→, «Referred»), `decline` (✕, «Declined»);
  - `null` → `<span class="no-decision">–</span>` (124) в цвете Slate (380-382).
- **Стили:** тонированная плашка `.decision-*` (353-378) и круглая иконка `.decision-icon` 18px с белым глифом (340-351). Иконка помечена `aria-hidden` (127).
- **Состояния:** только default.

### Card — `components.tsx:135-150`
- **Props:** `title`, `className?`, `children`.
- **Рендер:** `<section class="card">` с `<h2 class="card-title">`.
- **Стиль:** белый на 60%, радиус 32, padding 24 (`styles.css:91-102`).
- **Состояния:** нет. Пустое состояние, загрузку и ошибку рисует содержимое карточки.

### Тёмная панель `.dark-panel` (CSS-класс, не компонент) — `styles.css:631-640`, `796-830`
- **Где:** вручную в `SignOffPanel` (`QueuePage.tsx:69-93`) и `SignOff` (`ClaimPage.tsx:116-167`).
- **Стиль:** фон Charcoal, радиус 28, белый текст. `.empty` внутри панели окрашен в Fog.

### Главная кнопка `.main-action` (CSS-класс) — `styles.css:206-220`
- **Где:** «Work the queue» (`QueuePage.tsx:158-165`) и «Sign off and pay» (`ClaimPage.tsx:156-163`).
- **Состояния:**
  - default: Sunflower, 48px, Graphite, weight 500;
  - hover: нет (только `cursor: pointer`);
  - `:active`: нет;
  - focus-visible: браузер;
  - disabled: `opacity: 0.6; cursor: default` (217-220);
  - loading: нет. Во время прогона кнопка становится disabled с текстом «Working the queue» (`QueuePage.tsx:161,164`), но это не состояние «запрос отправляется».
  - error: текст ошибки выводится рядом, в `.message` (`QueuePage.tsx:131,144`) или в `.dark-panel .error` (`ClaimPage.tsx:164`).

### Поле «Claims to work» (inline в QueuePage) — `QueuePage.tsx:145-157`, `styles.css:222-242`
- **Разметка:** `<label class="cap-field">` с `<span>` и `<input type="number" min=1 max={waiting}>`. По умолчанию `5` (`QueuePage.tsx:110`).
- **Состояния:**
  - default: белая пилюля 80×48;
  - disabled: во время прогона (`152`), но своего стиля для disabled нет;
  - focus: браузер;
  - hover: нет;
  - error / invalid: нет. Значение 0 или пустое только блокирует кнопку (`161`); значение больше числа ждущих срезается при отправке (`123`).

### Таблица заявок ClaimsTable (локальный компонент) — `QueuePage.tsx:20-67`
- **Устройство:** `div` с ARIA-ролями `table`, `row`, `columnheader`, `cell`. Подробно — в разделе 7.
- **Состояния строки:**

| Состояние | Есть? | Где |
|---|---|---|
| default | да | 507-518 |
| hover | да: белый фон, радиус 14, тень; пунктир над строкой и под ней скрыт | 520-530 |
| focus | да, через `:focus-within` (тот же вид, что hover); у самой ссылки `outline: none` | 521, 528, 535 |
| active | нет | — |
| empty | «No claims in the queue.», строка заголовков остаётся | `QueuePage.tsx:64` |
| loading / error | на уровне страницы (раздел 4) | — |

### StatusBar — `charts.tsx:5-21`
- **Props:** `claims: ClaimSummary[]`.
- **Варианты:** пять фиксированных плашек `.status-pill.status-*` (412-423). У In progress текст лежит на белой внутренней пилюле (`charts.tsx:13`, `styles.css:425-428`).
- **Состояния:** только default. Пустое состояние даёт «0 · 0%» во всех пяти плашках.

### RingChart — `charts.tsx:23-100`
- **Props:** `claims`.
- **Устройство:** SVG `viewBox 0 0 140 140`, радиус 52, толщина 16; дуги — `stroke-dasharray` по долям (27-35, 62-79); в центре общее число (80-88); ниже легенда со StatusChip и числом (90-97).
- **Состояния:** пустого состояния нет: при 0 заявок рисуется пустая дорожка, «0» и легенда с нулями.

### DecisionsBar — `charts.tsx:102-134`
- **Props:** `claims`.
- **Устройство:** flex-полоса из сегментов с `flexGrow = count` (111-121), `min-width: 20px`, gap 4px (607-617), и легенда с DecisionChip (122-129).
- **Состояния:** empty «No decisions yet.» (107-108).

### RunCard и Todos — `RunCard.tsx:1-50`
- Подробно — в разделе 5.
- **Props:** `run: Run | null | undefined`, `error?: string`.
- **Состояния:**
  - loading: «Loading the run.» (31-33);
  - error: текст ошибки, но только до первой успешной загрузки (31-33);
  - нет прогонов: «The agent hasn't run yet.» (34);
  - прогон без to-do: «The agent is planning its work.» или «The agent wrote no to-do list.» (5-12);
  - hover и focus — нет: ничего не кликабельно.

### usePolling (хук) — `hooks.ts:6-36`
- **Поведение:** вызывает `load` сразу и потом раз в `interval` (по умолчанию 2000 мс); заново загружает по событию `undercover:refresh` от кнопки Refresh.
- **Возвращает:** `{data, error, refresh}`. При ошибке **старые данные сохраняются** (13-19): страницы, которые показывают ошибку только при `!data`, после первой загрузки ошибки опроса не показывают.

---

## 4. Блоки экрана «Claims queue» по порядку

Данные экрана приходят из двух опросов раз в 2 с: `GET /api/claims` (`QueuePage.tsx:108`, `api.ts:111`) и `GET /api/runs/current` (`QueuePage.tsx:109`, `api.ts:118`).

**Загрузка и ошибка до первой загрузки заявок.** Пока `claims` нет, весь экран под шапкой заменён одной карточкой «Loading the queue.» или текстом ошибки (`QueuePage.tsx:113`). Отдельных скелетонов у блоков нет. После первой загрузки ошибки опроса не показываются: на экране остаются последние данные (см. usePolling).

### 4.1 Шапка — `components.tsx:33-70`, `styles.css:116-164`
- **Логотип:** текстовая ссылка «UnderCover» → `/` (37-39), 24px, weight 500. Графического логотипа нет.
- **Вкладки Queue / Instructions:** ссылки-пилюли (41-49). Активна одна; на странице заявки активна Queue (34: активна Instructions, только если путь равен `/instructions`). hover нет, курсор стандартный для ссылки.
- **Refresh:** кнопка с inline-SVG (50-66). Посылает событие `undercover:refresh`, по которому все активные `usePolling` сразу перезагружают данные (`hooks.ts:27-28`). Курсор pointer, hover нет, индикатора загрузки нет.

### 4.2 Заголовок со счётчиком — `QueuePage.tsx:138-142`
- `<h1>Claims queue</h1>` и `<span class="count num">{claims.length} claims</span>`.
- Счётчик — общее число заявок любого статуса. Слово всегда во множественном числе: «1 claims» (такую строку проверяет тест `App.test.tsx`).
- Кликабельных элементов нет.

### 4.3 «Claims to work» и «Work the queue» — `QueuePage.tsx:143-166`
- **Начальное значение поля** — 5 (110); `max` = число ждущих (`count("waiting")`, 115-118).
- **Кнопка:**
  - отключена, если идёт прогон (`run.data?.status === "running"`, 117), ждущих нет или значение меньше 1 (161);
  - по клику вызывает `api.workQueue(Math.min(cap, waiting))` → `POST /api/queue/work {cap}` (121-123, `api.ts:119`), затем перезагружает заявки и прогон (134);
  - текст «Working the queue», пока прогон идёт (164).
- **Сообщение `.message`:** «The agent is working up to N claims.» или текст ошибки бэкенда (126-131). Оно **никогда не сбрасывается**: остаётся до следующего клика (111, 144).
- **Без данных о прогоне:** если `runs/current` ещё не загрузился или вернул ошибку, `working` = false, и кнопка доступна (117).

### 4.4 Полоса статусов — `charts.tsx:5-21`, `styles.css:392-428`
- **Порядок:** Decided, Waiting for sign-off, Left for a handler, In progress, Waiting — задан порядком ключей `STATUS_LABELS` (`format.ts:43-51`).
- **Числа:** `countBy` по `claim.status` (`charts.tsx:6`, `format.ts:74-88`).
- **Процент:** `Math.round(count/total*100)`, при `total = 0` будет «0%» (`format.ts:90-92`). Из-за округления сумма процентов может отличаться от 100 (например, три равные доли дают 33+33+33).
- **Ширина сегментов фиксированная**, данным не пропорциональна: `grid-template-columns: repeat(5, minmax(0,1fr))` (394). Так и задумано в `docs/BRAND.md:83` («Widths never follow the data»).
- **Подписи** над плашками обрезаются многоточием, если не помещаются (405-410).
- **Интерактивность:** нет (не ссылки, без hover).
- **При 0 заявок:** пять плашек «0 · 0%».
- **Обёртка:** `section.card` с `aria-label="Claims by status"` (`QueuePage.tsx:169`).

### 4.5 KPI-карточка — `QueuePage.tsx:95-105`, `172-179`, `styles.css:430-449`
- **Waiting:** число заявок в статусе `waiting` (173).
- **For sign-off:** число в статусе `awaiting_signoff` (174-177).
- **Paid:** сумма `paid_amount` по всем заявкам, включая выплаты после подписи (119, 178), в формате `$1,250.00` (`format.ts:3-10`).
- **Интерактивность:** нет.
- **При 0:** «0», «0», «$0.00».
- **Обёртка:** `section.card.big-numbers` с `aria-label="Totals"`.

### 4.6 «The agent's run» — `RunCard.tsx`, вызов в `QueuePage.tsx:181`
- Подробно — в разделе 5. Интерактивных элементов нет.
- **При 0, загрузке и ошибке:** см. RunCard в разделе 3.

### 4.7 Таблица Claims — `QueuePage.tsx:20-67`
- Подробно — в разделе 7.

### 4.8 «By status» — `charts.tsx:37-100`
- **Данные:** те же `countBy` по статусам; центр — `claims.length` (87).
- **Дуги:**
  - длина `count/total × окружность` (27-35); дуги с нулём пропускаются (29);
  - между дугами есть зазор: из каждой вычитается `WIDTH + 2` (74). Поэтому маленькая доля рисуется **непропорционально**: при 1 из 25 длина уходит в минимум `0.01` и дуга превращается в точку от скруглённого конца (`strokeLinecap="round"`, 70). Это видно на скриншоте с одной решённой заявкой;
  - если ненулевой статус один, дуга рисуется сплошным кругом без скругления (40, 70-75).
- **Легенда:** пять StatusChip с числами (90-97).
- **Интерактивность:** нет.
- **При 0 заявок:** серая дорожка, «0» в центре, нули в легенде. Строки пустого состояния нет.
- **Доступность:** SVG с `role="img"` и `aria-label="N claims by status"` (46-47).

### 4.9 «Decisions» — `charts.tsx:102-134`
- **Данные:** заявки с `decision !== null`, подсчёт по approve, refer, decline (103-104).
- **Сегменты пропорциональны** (`flexGrow`), но с `min-width: 20px` и gap 4px (614-617, 609). Поэтому маленькие доли выглядят больше своей реальной доли.
- **Доступность:** полоса помечена `aria-hidden` (111); числа даёт легенда.
- **Интерактивность:** нет.
- **При 0 решений:** «No decisions yet.» (107-108).

### 4.10 «Next for sign-off» — `QueuePage.tsx:69-93`, `styles.css:631-674`
- **Данные:** заявки в статусе `awaiting_signoff`, в порядке API (по `claim_id`).
- **Строка:** ID, имя клиента (Fog, с многоточием) и `money(payout)` (82-86).
- **Клик:** вся строка — ссылка на `/claims/:id` (82).
- **Hover и focus-visible:** фон `rgba(255,255,255,0.1)`, `outline: none` (663-667); курсор — стандартный для ссылки.
- **При 0:** «Nothing is waiting for sign-off.» (77).
- **Разметка:** `section.dark-panel` с `aria-labelledby` (72).

---

## 5. «The agent's run» подробно

### 5.1 Модель данных

**Прогон (`Run`)** — `dashboard/src/api.ts:62-80`. На бэкенде собирается в `backend/runs.py:15-26`, схема — `backend/db.py:42-55`.

| Поле | Тип | Смысл |
|---|---|---|
| `run_id` | number | номер прогона |
| `cap` | number | лимит заявок |
| `status` | `"running" \| "finished" \| "stopped"` | состояние прогона |
| `todos` | `Todo[]` | to-do список агента, целиком перезаписывается при каждом `write_todos` (`backend/runs.py:83-90`) |
| `summary` | string \| null | итоговый текст |
| `started_at`, `finished_at` | ISO-строка \| null | время начала и конца |
| `claims` | string[] | ID заявок, которые прогон начал, в порядке начала (`backend/runs.py:20-25`) |

**Пункт списка (`Todo`)** — `api.ts:62-67`, на бэкенде `backend/main.py:186-188`:
- `content: string` — свободный текст, который пишет LLM;
- `status: "to_do" | "in_progress" | "done" | "for_handler"`.

Статуса «failed» нет. По инструкциям агента упавшая заявка возвращает свой пункт в `to_do` (`backend/instructions/queue.md:13`). Поэтому в UI пункт «ещё не начат» и пункт «упал, будет повтор» выглядят одинаково.

**Связь пункта с заявкой:** не найдено. У `Todo` нет поля `claim_id`. ID заявки встречается только внутри текста, если агент последовал примеру из инструкций (`queue.md:9`); это не гарантировано.

**Шаги агента по заявке (`Step`)** — `api.ts:57-60`, `backend/db.py:36-41`:
- поля только `text` и `created_at`, без типа и статуса;
- тексты шагов формирует агент (`agent/claim.py:30-38`, `122-143`);
- сбои видны только как текст шага: «Back in the queue: …», «Left for a handler: …», «Attempt N» (`backend/claims.py:117`, `133`).
- На карточке прогона шаги не показываются, только на странице заявки (`ClaimPage.tsx:169-188`).

### 5.2 Как UI узнаёт о прогрессе
- **Опрос** `GET /api/runs/current` раз в 2000 мс (`hooks.ts:6`, `QueuePage.tsx:109`) и ручная кнопка Refresh.
- WebSocket и SSE — не найдено.

### 5.3 Как отображаются статусы сейчас

**Статус прогона** — RunChip (`components.tsx:105-113`):

| Статус | Подпись | Вид |
|---|---|---|
| `running` | «Working» | штриховка In progress с белой внутренней пилюлей |
| `finished` | «Finished» | Graphite, белый текст |
| `stopped` | «Stopped» | Deep Sunflower |

**Статус пункта** — TodoChip (`components.tsx:92-103`), плашка фиксированной ширины min 132px (`styles.css:270-274`):

| Статус | Подпись | Вид |
|---|---|---|
| `to_do` | «To do» | Steel Grey |
| `in_progress` | «In progress» | штриховка |
| `done` | «Done» | Graphite |
| `for_handler` | «Left for a handler» | Slate |

**Состояние «идёт прогон»** выражено тремя признаками сразу; отдельного индикатора прогресса или спиннера нет:
- чип «Working»;
- кнопка «Working the queue» отключена (`QueuePage.tsx:161,164`);
- поле отключено (`152`).

**Счётчик прогресса:** строка «{claims.length} of {cap} claims started» (`RunCard.tsx:40-42`) считает **начатые**, а не завершённые заявки.

### 5.4 Итоговый абзац и структурированные итоги
- **Откуда текст** (`RunCard.tsx:45`):
  - его пишет агент очереди в `finish_run` (`agent/queue.py:66-70` → `backend/runs.py:101-110`);
  - или его подставляет сервер при остановке: «The run stopped: …» и «The agent ended without finishing the run.» (`backend/worker.py:30-35`); после перезапуска — «The server restarted during the run.» (`backend/worker.py:42`).
- **Структурированные итоги** (счётчики исходов, суммы) в `Run` — не найдено.
- **Их можно вычислить на клиенте:** соединить `run.claims` со списком `GET /api/claims`, где у `ClaimSummary` есть `status`, `decision`, `payout` и `paid_amount` (`api.ts:5-15`). Число сбоев (`failures`) в `ClaimSummary` не входит: оно есть только в полной заявке (`api.ts:31`; `backend/claims.py:56-69` против `12-24`).

### 5.5 Ссылки из пунктов на заявку
Не найдено: пункты рендерятся как `<span>` (`RunCard.tsx:16-19`).

---

## 6. Статус «In progress»

### 6.1 Где используется
- плашка в таблице (`QueuePage.tsx:48`) и рядом с заголовком страницы заявки (`ClaimPage.tsx:234`);
- плашка в легенде «By status» (`charts.tsx:93`);
- плашка полосы статусов с белой внутренней пилюлей (`charts.tsx:12-15`);
- дуга кольца (`charts.tsx:65` → `.ring-in_progress`, `styles.css:568-570`);
- плашки TodoChip `in_progress` и RunChip `running` («Working»): `components.tsx:94, 106` — они используют тот же класс `status-in_progress`.

### 6.2 Как сделана штриховка
- **Плашки и полоса — CSS-градиент:** токен `--hatch: repeating-linear-gradient(120deg, #ffffff 0 6px, #6b7079 6px 10px)` (`styles.css:21-25`), фон `.status-in_progress` (320-323). Текст лежит на белой внутренней пилюле `.chip-inner` (301-309, 425-428), иначе он стоял бы на полосах.
- **Кольцо — SVG `<pattern id="hatch">`** 10×10, белый фон, полоса шириной 4, `patternTransform="rotate(30)"`, цвета литералами (`charts.tsx:50-59`); дуга ссылается на него через `stroke: url(#hatch)` (`styles.css:569`).
- **Расхождение:** штриховка описана двумя разными механизмами (угол 120deg в CSS против rotate(30) в SVG, полосы 6/4 против 6/4 в других единицах). Совпадают ли они визуально, я не проверял. `id="hatch"` глобален: на странице сейчас одно кольцо, но второе кольцо дало бы дубль id.

### 6.3 Анимации и reduced-motion
- **Анимации:** единственная — `transition: background-color 0.15s, box-shadow 0.15s` у строки таблицы (`styles.css:515-517`). `@keyframes` и `animation` — не найдено.
- **`prefers-reduced-motion`:** не учитывается (не найдено).

---

## 7. Таблица Claims

### 7.1 Колонки
Заголовки берутся из `COLUMNS` (`QueuePage.tsx:9-18`), ширины — из сетки (`styles.css:484-486`):

| # | Колонка | Ширина | Выравнивание | Содержимое |
|---|---|---|---|---|
| 1 | Claim | 88px | влево | ссылка с ID, `.num`, weight 500 (34-38) |
| 2 | Customer | minmax(120px, 1.2fr) | влево | `customer_name` |
| 3 | Type | minmax(120px, 1fr) | влево | `claimType()` (`format.ts:29-41`) |
| 4 | Submitted | 96px | влево | `date()` → «Jun 24, 2026», `.num` |
| 5 | Claimed | 92px | **вправо** (502-505, 498-500) | `money(amount_claimed)` |
| 6 | Status | 156px | влево | StatusChip |
| 7 | Decision | 112px | влево | DecisionChip или «–» |
| 8 | Payout | 92px | **вправо** | `money(payout)` или «–» |

### 7.2 Размеры и перенос
- **Ширина:** колонки и 7 промежутков по 10px дают 946px — это и есть `min-width` таблицы (477-479). Уже 946px таблица прокручивается по горизонтали внутри карточки (`.table-scroll`, 471-475).
- **Высота строки** фиксирована: 44px (509).
- **Перенос текста:**
  - у ячеек нет `white-space: nowrap`, поэтому «Emergency medical» и длинные имена переносятся на две строки внутри 44px (видно на скриншотах);
  - что будет с тремя строками, неоднозначно: высота жёсткая, переполнение, скорее всего, вылезет за строку (не проверено);
  - плашки статусов и решений не переносятся (`.chip` с `white-space: nowrap`, 298).

### 7.3 Сортировка, фильтры, поиск, пагинация
Нет. Порядок задаёт API: `ORDER BY claim_id` (`backend/claims.py`, функция `list_claims`). Все 25 строк выводятся сразу.

### 7.4 Кликабельность
- **Строка целиком** кликабельна: ссылка в первой ячейке растянута псевдоэлементом `::after` с `position:absolute; inset:0` на всю строку (`styles.css:538-543`, 508).
- **Курсор** pointer (514), есть hover (520-525).
- **Переход** ведёт на отдельную страницу `/claims/:id` (`App.tsx:9-10`, `ClaimPage.tsx`). Модалки нет.

### 7.5 Пустые значения
- `decision === null` → «–» в цвете Slate (`components.tsx:124`).
- `payout === null` → «–» (`QueuePage.tsx:54-58`).
- `payout === 0` (отказ и запрос документов) → «$0.00»: значение не null, срабатывает `money(0)` (`QueuePage.tsx:57`).
- Неоднозначно: «–» и «$0.00» в одной колонке означают разное («нет решения» и «решение без выплаты»), а в UI эта разница никак не объяснена.

---

## 8. Адаптивность и доступность

### 8.1 Брейкпоинты
- **≤1200px** (`styles.css:849-859`): summary-row и main-grid складываются в одну колонку; правая колонка («By status», «Decisions», «Next for sign-off») уходит под таблицу.
- **≤600px** (`861-877`):
  - padding страницы 16px;
  - `h1` 40px, большие числа 48px;
  - полоса статусов в 2 колонки (5 плашек → 2+2+1).
- **Без медиа-запросов:**
  - заголовок, кнопки и шапка переносятся через `flex-wrap` (120, 172, 179, 198);
  - to-do список сам становится одной колонкой (`minmax(min(100%,340px),1fr)`, 256);
  - KPI переносятся (`flex-wrap`, 432).
- **Горизонтальная прокрутка:** `body { overflow-x: hidden }` (56). Он скрывает любую случайную горизонтальную прокрутку и вместе с этим может маскировать вылезающий контент. Тест e2e проверяет `scrollWidth − clientWidth = 0` на 375px (`e2e/pilot.spec.ts`, тест «doesn't scroll sideways on a phone»); при `overflow-x: hidden` у `body` эта проверка, возможно, слабее, чем кажется (неоднозначно, не исследовано).

### 8.2 Семантика
- **Хорошо:**
  - `<header>`, `<nav aria-label="Main">`, `<main>`, карточки — это `<section>` с `<h2>`, на каждой странице один `<h1>`;
  - ссылки — настоящие `<a href>`, кнопки — `<button type="button">`;
  - поле — `<input>` внутри `<label>` (`QueuePage.tsx:145-157`).
- **Таблица заявок** — `div` с ARIA-ролями, а не `<table>` (`QueuePage.tsx:24-60`); без `rowgroup` и `scope`. Таблица позиций на странице заявки — настоящая `<table>` (`ClaimPage.tsx:36-58`).
- **Прочие ARIA:**
  - `aria-label` у `section` полосы статусов и KPI (`QueuePage.tsx:169,172`);
  - у to-do списка `aria-label="To-do list"` (`RunCard.tsx:14`);
  - у SVG кольца `role="img"` и `aria-label` (`charts.tsx:46-47`);
  - `aria-hidden` у полосы решений и иконок решений (`charts.tsx:111`, `components.tsx:127`);
  - `aria-labelledby` у тёмных панелей.
- **Живые регионы:** `aria-live` нет нигде (не найдено). Изменения от опроса (статусы, to-do список, сообщение после «Work the queue») скринридер не объявляет.

### 8.3 Клавиатура и видимый фокус
- **Порядок Tab:** бренд → вкладки → Refresh → поле → кнопка → ссылки ID в таблице → ссылки в Next for sign-off. Порядок естественный.
- **Строка таблицы в фокусе:** выглядит как при hover (`:focus-within`, 521), а у ссылки `outline: none` (535). Индикатор фокуса — белый фон на почти белой карточке (контраст **1.06:1**) плюс мягкая тень. Он едва заметен.
- **Ссылки в Next for sign-off:** фокус — `rgba(255,255,255,0.1)` на Charcoal (контраст **1.37:1**), `outline: none` (663-667). Тоже едва заметен.
- **Вкладки, кнопки и поле** сохраняют стандартную рамку фокуса браузера (свои стили фокуса не заданы, но и не сброшены).

### 8.4 Контраст

Расчёт по формуле WCAG 2.x. Фон карточки — белый на 60% поверх фона страницы: примерно `#F7F8F9` в серой части и `#FEF6DB` в жёлтом углу.

| Пара | Контраст | Оценка |
|---|---|---|
| Slate `#55585E` (подписи, «–», `.count`, заголовки колонок) на карточке | 6.70 (серая часть) / 6.60 (жёлтый угол) | AA проходит |
| Slate на фоне страницы `#ECEDEF` (`.count`, `.message`, подпись поля) | 6.09 | AA проходит |
| Graphite на плашке Waiting `#A9AFB7` | 7.11 | проходит |
| Graphite на Deep Sunflower `#F5C400` | 9.56 | проходит |
| Белый на Graphite (Decided) | 15.72 | проходит |
| Белый на Slate (Left for a handler) | 7.13 | проходит |
| Graphite на белой внутренней пилюле (In progress) | 15.72 | проходит |
| Approved: `#176B3A` на `#DCF3E4` | 5.62 | AA проходит |
| Referred: `#9A4D00` на `#FDEBD3` | 5.24 | AA проходит |
| Declined: `#A8232A` на `#FBDDDD` | 5.61 | AA проходит |
| Белый глиф ✓ на `#1F9D55` | 3.49 | для 13px текста ниже 4.5; как графика ≥3 |
| Белый глиф → на `#F08A00` | **2.52** | ниже 3:1 даже для графики (смысл дублирует подпись) |
| Белый глиф ✕ на `#DC3B3B` | 4.44 | чуть ниже 4.5 |
| Fog `#B5B5B5` на Charcoal | 6.91 | проходит |
| Graphite на Sunflower (кнопка) | 10.90 | проходит |
| Текст отключённой кнопки (opacity 0.6) | ~3.5 | отключённые элементы WCAG не нормирует |
| Заливка Waiting против карточки (не текст) | **2.08** | граница плашки ниже 3:1 |
| Пунктир `#CFCFCF` против карточки (не текст) | 1.46 | декоративный разделитель |
| Заливки Slate и Graphite рядом в полосе статусов | **2.20** | Left for a handler и Decided трудно различить |

---

## 9. Несоответствия и технический долг

1. **Захардкоженные значения вместо токенов:**
   - `#ffffff` в 10 местах (`styles.css:143,162,237,307,332,337,348,522,635,816`);
   - `#cfcfcf` дважды (510, 745);
   - цвет тени и дорожки кольца в `rgba(35,35,35,…)` (524, 556) вместо производной от `--graphite`;
   - радиусы 28 и 14 (633; 511, 542, 659);
   - большинство gap и padding — литералы (раздел 2.5).
2. **SVG-штриховка дублирует токены литералами** `#FFFFFF` и `#6B7079` (`charts.tsx:57-58`). Это второй механизм штриховки рядом с `--hatch` (раздел 6.2).
3. **Мёртвый токен:** `--stone` (`styles.css:4`) нигде не используется.
4. **Класс без стилей:** `run-card` (`RunCard.tsx:30`) не имеет правила в `styles.css`.
5. **Совпадающие токены:** `--graphite` = `--status-decided`, `--slate` = `--status-handler`. Цвет текста и цвет статуса связаны: изменение одного неявно меняет другое.
6. **Почти одинаковые цвета:** Charcoal и Graphite; Sunflower и Deep Sunflower; Fog, Steel Grey и `#cfcfcf` (раздел 2.3).
7. **Одни и те же данные в нескольких местах:**
   - число Waiting — в полосе статусов, KPI и легенде кольца;
   - число For sign-off — в полосе, KPI, легенде и как длина списка Next for sign-off;
   - доли статусов — в полосе (числа и проценты) и в кольце.
8. **Разные подписи для одного статуса:** «Waiting for sign-off» (статус), «For sign-off» (KPI), «Next for sign-off» (панель).
9. **Два способа рисовать статус:** `.chip` (26px, `components.tsx:72-85`) и `.status-pill` (52px, `charts.tsx:12-15`). Классы `status-*` общие, а in_progress-обёртка `.chip-inner` повторена дважды.
10. **Две реализации таблицы:** div с ARIA-ролями на очереди и настоящая `<table>` на странице заявки. Пунктирный разделитель тоже описан дважды (510, 745).
11. **Разные hover-паттерны** у кликабельных строк: белый фон с тенью в таблице (520-525) против белого 10% в тёмной панели (663-667). У `.pill`, `.icon-button` и `.main-action` hover нет вовсе.
12. **Слабый видимый фокус:** у строк таблицы и ссылок sign-off убран `outline`, а замена малоконтрастна (раздел 8.3).
13. **Кольцо искажает маленькие доли:** из каждой дуги вычитается зазор (`charts.tsx:74`), поэтому 1 из 25 становится точкой. В полосе решений, наоборот, `min-width: 20px` раздувает маленькие доли.
14. **Ошибки опроса после первой загрузки не видны** ни на одном блоке очереди (`hooks.ts:13-19` и `QueuePage.tsx:113`).
15. **Сообщение `.message`** после запуска прогона не сбрасывается (`QueuePage.tsx:111,144`).
16. **Счётчик всегда во множественном числе:** «{n} claims» (`QueuePage.tsx:141`) даёт «1 claims».
17. **Поле «Claims to work»:**
    - `max={waiting}` при 0 ждущих становится 0 и оказывается меньше `min=1`;
    - значение не ограничивается при вводе;
    - нет стиля для disabled и invalid (`QueuePage.tsx:147-156`).
18. **To-do список не связан с данными заявок:** у пунктов нет `claim_id`; статуса «failed» нет, и упавший пункт выглядит как «To do» (раздел 5.1).
19. **`body { overflow-x: hidden }`** (`styles.css:56`) может скрывать вылезающий контент вместо того, чтобы его исправить.
20. **Движение:** единственный transition не отключается при `prefers-reduced-motion`.

---

## 10. Итог

**Устроено системно:**
- цвета статусов и решений собраны в токены `:root` и применяются через общие классы `status-*`, `decision-*`, `ring-*`, `segment-*`;
- подписи и порядок статусов заданы в одном месте (`format.ts:43-72`), и полоса, кольцо, легенда, таблица и to-do берут их оттуда;
- плашки статусов, to-do и прогона — один компонент `FilledChip`;
- данные приходят единообразно, через `usePolling` раз в 2 с и общую кнопку Refresh;
- форматирование денег и дат централизовано.

**Собрано вручную:**
- графики (SVG и flex без библиотеки) и вторая штриховка в SVG;
- таблица на div;
- тёмные панели, главная кнопка и поле — CSS-классы, а не компоненты;
- белый цвет, разделители, радиусы 14 и 28, отступы — литералы;
- состояний hover и focus почти нет, анимаций и reduced-motion нет.

**Какие файлы придётся трогать:**

**(а) Анимировать In progress**
- `dashboard/src/styles.css`:
  - `--hatch` 21-25, `.status-in_progress` 320-323, `.chip.status-in_progress` 311-313, `.status-pill .chip-inner` 425-428;
  - добавить `@keyframes` и `@media (prefers-reduced-motion: reduce)`.
- `dashboard/src/charts.tsx:50-59` — SVG-паттерн кольца анимируется отдельно (например, `animateTransform` или CSS на `patternTransform`).
- **Учесть:** тот же класс несут TodoChip `in_progress` и RunChip «Working» (`components.tsx:92-113`). Они тоже начнут двигаться, если не развести классы.

**(б) Переделать «The agent's run» в список заявок с исходами**
- `dashboard/src/RunCard.tsx`: новая разметка.
- `dashboard/src/QueuePage.tsx:181`: передать в карточку уже загруженный `claims`, чтобы соединить его с `run.claims`.
- `dashboard/src/api.ts`: типы.
- `dashboard/src/components.tsx`: переиспользовать StatusChip и DecisionChip.
- `dashboard/src/styles.css:244-285`: стили `.run-head`, `.todos`, `.run-summary`.
- Тесты: `dashboard/src/App.test.tsx`, при необходимости `e2e/pilot.spec.ts`.
- **Если нужны сбои и попытки:** число `failures` не входит в `ClaimSummary`. Понадобится `backend/claims.py:56-69` (функция `summary`) и тип в `api.ts:5-15`.
- **Если нужна структурированная сводка** вместо свободного текста: `backend/runs.py`, `backend/main.py:178-226`.

**(в) Сделать обработанные заявки кликабельными с hover**
- Использовать `Link` из `dashboard/src/components.tsx:11-31` в новой разметке `RunCard.tsx`.
- Стили hover и focus-visible — в `dashboard/src/styles.css`. Готовые образцы: `.claim-row`/`.row-link` (507-543) и `.signoff-link` (651-667). Их стоит свести к одному паттерну и вернуть заметный фокус.
- Строки таблицы на очереди уже кликабельны с hover.
