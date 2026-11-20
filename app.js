let currentUser = null;
let dashboard = null;
let currentView = "home";
let localMode = window.location.hostname.endsWith("github.io");
let localEngine = null;

const el = (s) => document.querySelector(s);
const view = el("#view");

class LocalCampusEngine {
  constructor() {
    this.key = "pulse_campus_v1";
  }

  read() {
    const raw = localStorage.getItem(this.key);
    if (!raw) return null;
    try {
      const state = JSON.parse(raw);
      return state.version === 1 ? state : null;
    } catch (_) {
      return null;
    }
  }

  write(state) {
    localStorage.setItem(this.key, JSON.stringify(state));
  }

  async hashPassword(password, saltHex) {
    const salt = Uint8Array.from(saltHex.match(/.{1,2}/g).map((byte) => parseInt(byte, 16)));
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
      material,
      256,
    );
    return Array.from(new Uint8Array(bits)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  randomHex(length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async seed() {
    const users = [
      {
        id: 1,
        login: "alexey",
        name: "Алексей Громов",
        faculty: "Факультет информационных технологий",
        program: "Прикладная информатика",
        course: 3,
        group: "ПИ-31",
        average: 4.92,
        role: "student",
        status: "Допуск к сессии",
        gpa_status: "До стипендии осталось 1 балл",
      },
      {
        id: 2,
        login: "elena",
        name: "Елена Соколова",
        faculty: "Факультет социальных наук",
        program: "Психология",
        course: 2,
        group: "ПС-21",
        average: 3.82,
        role: "student",
        status: "Есть пересдача",
        gpa_status: "Допуск с ограничениями",
      },
      {
        id: 3,
        login: "dean",
        name: "Марина Белова",
        faculty: "Методист деканата",
        program: "Административная панель",
        course: 0,
        group: "Сотрудник",
        average: 0,
        role: "staff",
        status: "Рабочая смена",
        gpa_status: "Все заявки доступны",
      },
    ];

    for (const user of users) {
      user.passwordSalt = this.randomHex(16);
      user.passwordHash = await this.hashPassword("Pulse2026!", user.passwordSalt);
    }

    const state = {
      version: 1,
      users,
      sessionUserId: null,
      nextApplicationId: 5,
      applications: [
        { id: 1, userId: 1, kind: "Справка об обучении", comment: "", status: "Готова", createdAt: "20 нояб. 2026", methodistComment: "Документ сформирован" },
        { id: 2, userId: 1, kind: "Справка для налоговой", comment: "", status: "В работе", createdAt: "18 нояб. 2026", methodistComment: "" },
        { id: 3, userId: 2, kind: "Справка о периоде обучения", comment: "Для оформления практики", status: "На рассмотрении", createdAt: "19 нояб. 2026", methodistComment: "" },
        { id: 4, userId: 2, kind: "Заявление в деканат", comment: "Назначить пересдачу", status: "В работе", createdAt: "17 нояб. 2026", methodistComment: "" },
      ],
      announcements: [],
    };
    this.write(state);
    return state;
  }

  async ensure() {
    let state = this.read();
    if (!state) state = await this.seed();
    return state;
  }

  async reset() {
    localStorage.removeItem(this.key);
    return this.seed();
  }

  clearSession() {
    const state = this.read();
    if (!state) return;
    state.sessionUserId = null;
    this.write(state);
  }

  currentUser(state) {
    return state.users.find((item) => item.id === state.sessionUserId) || null;
  }

  error(status, message) {
    return { __error: true, status, body: { error: message } };
  }

  async request(path, options = {}) {
    const state = await this.ensure();
    const method = options.method || "GET";
    let payload = {};
    if (options.body) {
      try {
        payload = JSON.parse(options.body);
      } catch (_) {
        payload = {};
      }
    }

    if (path === "/api/login" && method === "POST") {
      const account = state.users.find((item) => item.login === payload.login);
      if (!account) return this.error(401, "Неверный логин или пароль");
      const digest = await this.hashPassword(String(payload.password || ""), account.passwordSalt);
      if (digest !== account.passwordHash) return this.error(401, "Неверный логин или пароль");
      state.sessionUserId = account.id;
      this.write(state);
      return { ok: true };
    }

    if (path === "/api/logout" && method === "POST") {
      state.sessionUserId = null;
      this.write(state);
      return { ok: true };
    }

    const actor = this.currentUser(state);
    if (path === "/api/me") {
      if (!actor) return this.error(401, "Требуется вход");
      return this.publicUser(actor);
    }
    if (!actor) return this.error(401, "Требуется вход");

    if (path === "/api/dashboard") {
      const schedule = [
        { time: "09:30", title: "Проектирование интерфейсов", kind: "Практика", room: "Корпус 2 · ауд. 304", teacher: "Ирина Волкова", accent: "violet" },
        { time: "11:20", title: "Основы машинного обучения", kind: "Лекция", room: "Корпус 1 · ауд. 118", teacher: "Алексей Солнечный", accent: "mint" },
        { time: "14:10", title: "Базы данных", kind: "Семинар", room: "Корпус 3 · ауд. 220", teacher: "Марина Лесная", accent: "orange" },
      ];
      const grades = actor.id === 1
        ? [
            { subject: "Проектирование интерфейсов", grade: "5", kind: "Экзамен", trend: "+1" },
            { subject: "Основы машинного обучения", grade: "Зачёт", kind: "Зачёт", trend: "" },
            { subject: "Базы данных", grade: "4", kind: "Экзамен", trend: "Стабильно" },
            { subject: "Командная разработка", grade: "5", kind: "Курс. проект", trend: "+1" },
          ]
        : [
            { subject: "Введение в психологию", grade: "4", kind: "Экзамен", trend: "Стабильно" },
            { subject: "Статистика", grade: "Пересдача", kind: "Экзамен", trend: "Долг" },
            { subject: "История науки", grade: "Зачёт", kind: "Зачёт", trend: "" },
          ];
      const applications = state.applications
        .filter((item) => item.userId === actor.id)
        .map((item) => ({ id: item.id, kind: item.kind, status: item.status, created_at: item.createdAt }));
      return {
        schedule,
        grades,
        applications,
        notifications: [
          ...state.announcements.map((text) => ({ title: "Срочное объявление деканата", text, type: "warning", time: "Сейчас" })),
          { title: "Расписание на 21 ноября изменилось", text: "Пара перенесена в аудиторию 304.", type: "warning", time: "12 мин" },
          { title: "До сдачи проекта 2 дня", text: "Командная разработка · до 22 ноября.", type: "deadline", time: "1 ч" },
          { title: "Справка готова", text: "Заявку можно скачать в разделе «Заявки».", type: "success", time: "Вчера" },
        ],
      };
    }

    if (path === "/api/applications" && method === "POST") {
      if (actor.role !== "student") return this.error(403, "Сотрудник не подает студенческие заявки");
      const kind = String(payload.kind || "").trim();
      if (!kind) return this.error(400, "Выберите тип заявки");
      const application = {
        id: state.nextApplicationId++,
        userId: actor.id,
        kind,
        comment: String(payload.comment || "").trim(),
        status: "На рассмотрении",
        createdAt: "20 нояб. 2026",
        methodistComment: "",
      };
      state.applications.unshift(application);
      this.write(state);
      return { id: application.id, kind: application.kind, status: application.status, created_at: application.createdAt };
    }

    const applicationMatch = path.match(/^\/api\/applications\/(\d+)(?:\/(certificate))?$/);
    if (applicationMatch) {
      const id = Number(applicationMatch[1]);
      const application = state.applications.find((item) => item.id === id);
      if (!application) return this.error(404, "Заявка не найдена");
      if (application.userId !== actor.id && actor.role !== "staff") {
        return this.error(403, "Нет доступа к чужой заявке");
      }
      if (applicationMatch[2] === "certificate") {
        if (!["Готова", "Готово"].includes(application.status)) return this.error(409, "Справка ещё не готова");
        return { id, kind: application.kind, status: application.status, student: state.users.find((item) => item.id === application.userId).name };
      }
      return application;
    }

    if (path === "/api/staff/applications") {
      if (actor.role !== "staff") return this.error(403, "Нет доступа");
      return {
        applications: state.applications.map((application) => {
          const account = state.users.find((item) => item.id === application.userId);
          return {
            id: application.id,
            kind: application.kind,
            comment: application.comment,
            status: application.status,
            created_at: application.createdAt,
            name: account.name,
            group_name: account.group,
            user_id: account.id,
            methodist_comment: application.methodistComment,
          };
        }),
      };
    }

    if (path === "/api/staff/applications/status" && method === "POST") {
      if (actor.role !== "staff") return this.error(403, "Нет доступа");
      const allowed = ["На рассмотрении", "В работе", "Готова"];
      if (!allowed.includes(payload.status)) return this.error(400, "Некорректный статус");
      const application = state.applications.find((item) => item.id === Number(payload.id));
      if (!application) return this.error(404, "Заявка не найдена");
      application.status = payload.status;
      application.methodistComment = String(payload.comment || "").trim();
      this.write(state);
      return { ok: true };
    }

    if (path === "/api/staff/announcement" && method === "POST") {
      if (actor.role !== "staff") return this.error(403, "Нет доступа");
      const text = String(payload.text || "").trim();
      if (!text) return this.error(400, "Введите текст объявления");
      state.announcements.unshift(text);
      this.write(state);
      return { ok: true, text };
    }

    return this.error(404, "Не найдено");
  }

  publicUser(account) {
    return {
      id: account.id,
      name: account.name,
      faculty: account.faculty,
      program: account.program,
      course: account.course,
      group: account.group,
      average: account.average,
      role: account.role,
      status: account.status,
      gpa_status: account.gpa_status,
    };
  }
}

async function apiRequest(url, options = {}) {
  if (!localMode) {
    try {
      const response = await fetch(url, options);
      if ([404, 405].includes(response.status)) throw new Error("Static fallback");
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || "Ошибка сервера"), { status: response.status });
      return data;
    } catch (error) {
      if (error.status === 401 || error.status === 403) throw error;
      localMode = true;
    }
  }
  if (!localEngine) localEngine = new LocalCampusEngine();
  const data = await localEngine.request(url, options);
  if (data && data.__error) throw Object.assign(new Error(data.body.error), { status: data.status });
  return data;
}

const api = apiRequest;

function toast(text) {
  const box = el("#toast");
  box.textContent = text;
  box.classList.add("show");
  setTimeout(() => box.classList.remove("show"), 2600);
}

function initials(name) {
  return name.split(" ").map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function initTheme() {
  const saved = localStorage.getItem("pulse-theme");
  const theme = saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  document.documentElement.dataset.theme = theme;
}

function toggleTheme() {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("pulse-theme", theme);
  el('meta[name="theme-color"]').setAttribute("content", theme === "dark" ? "#16181f" : "#f4f5f8");
}

async function login(login, password) {
  el("#loginError").textContent = "";
  el("#loginButtonText").textContent = "Входим...";
  try {
    await api("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    location.reload();
  } catch (error) {
    el("#loginError").textContent = error.message;
    el("#loginButtonText").textContent = "Войти в кабинет";
  }
}

async function boot() {
  try {
    currentUser = await api("/api/me");
    showShell();
  } catch (_) {
    el("#loginPage").hidden = false;
    el("#shell").hidden = true;
  }
}

function showShell() {
  el("#loginPage").hidden = true;
  el("#shell").hidden = false;
  el("#sidebarName").textContent = currentUser.name;
  el("#sidebarMeta").textContent = currentUser.role === "staff" ? "Сотрудник деканата" : `${currentUser.group} • ${currentUser.course} курс`;
  el("#sidebarAvatar").textContent = initials(currentUser.name);
  buildNavigation();
  if (currentUser.role === "staff") {
    setView("staff");
  } else {
    setView("home");
  }
}

function buildNavigation() {
  const items = currentUser.role === "staff"
    ? [["staff", "▦", "Управление"], ["notifications", "♢", "Объявления"]]
    : [["home", "⌂", "Главная"], ["schedule", "▦", "Расписание"], ["grades", "◫", "Оценки"], ["applications", "▧", "Справки"], ["notifications", "♢", "Уведомления"]];
  el("#desktopNav").innerHTML = items.map(([name, icon, label]) =>
    `<button class="nav-item ${name === currentView ? "active" : ""}" type="button" data-view="${name}"><i>${icon}</i><span>${label}</span>${name === "notifications" ? "<b>3</b>" : ""}</button>`
  ).join("");
  el("#bottomNav").innerHTML = currentUser.role === "staff"
    ? `<button class="nav-item active" type="button" data-view="staff"><i>▦</i><span>Заявки</span></button><button class="nav-item" type="button" data-view="notifications"><i>♢</i><span>Объявления</span></button>`
    : items.slice(0, 5).map(([name, icon, label]) => {
      const mobile = name === "grades" ? "Оценки" : name === "applications" ? "Справки" : name === "notifications" ? "Ещё" : name === "schedule" ? "Расписание" : "Главная";
      return `<button class="nav-item ${name === currentView ? "active" : ""}" type="button" data-view="${name}"><i>${icon}</i><span>${mobile}</span></button>`;
    }).join("");
}

function skeleton() {
  view.innerHTML = `<div class="bento"><section class="card loading-card"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div></section><section class="card loading-card"><div class="skeleton skeleton-line"></div></section></div>`;
}

async function loadDashboard() {
  if (dashboard) return;
  skeleton();
  dashboard = await api("/api/dashboard");
  renderHome();
}

function setView(name) {
  currentView = name;
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === name));
  el("#aiFab").hidden = currentUser.role === "staff";
  if (name === "staff") return renderStaff();
  if (name === "home") {
    el("#pageTitle").textContent = "Доброе утро";
    return loadDashboard();
  }
  if (name === "schedule") return renderSchedule();
  if (name === "grades") return renderGrades();
  if (name === "applications") return renderApplications();
  if (name === "notifications") return renderNotifications();
}

function renderHome() {
  el("#todayDate").textContent = "Пятница, 20 ноября";
  el("#pageTitle").textContent = `Доброе утро, ${currentUser.name.split(" ")[0]}!`;
  const firstName = currentUser.name.split(" ")[0];
  view.innerHTML = `
    <div class="bento">
      <section class="card next-class">
        <div class="next-label"><span>СЛЕДУЮЩАЯ ПАРА • ЧЕРЕЗ 18 МИН</span><b class="change-badge">Перенесена</b></div>
        <div class="countdown"><i></i><b id="countdown">00:18:24</b> до начала</div>
        <h2>Проектирование интерфейсов</h2>
        <div class="class-meta"><span>◷ <i>09:30–10:50</i></span><span>⌖ <i>Корпус 2 · ауд. 304</i></span><span>♙ <i>Ирина Волкова</i></span></div>
      </section>
      <section class="card pulse-card">
        <div class="pulse-top"><strong>Академический пульс</strong><button class="text-button" type="button" data-go="grades">Подробнее</button></div>
        <div class="score-ring" style="--score:${Math.round(currentUser.average / 5 * 100)}%"><div><b>${String(currentUser.average).replace(".", ",")}</b><small>из 5,00</small></div></div>
        <div class="mini-stats"><div class="mini-stat"><small>Сессия</small><strong>${currentUser.status}</strong></div><div class="mini-stat"><small>Стипендия</small><strong>${currentUser.average >= 4.5 ? "18 400 ₽" : "Без стипендии"}</strong></div></div>
        <button class="what-if" type="button" id="whatIf">Что если ближайший экзамен сдам на 5? →</button>
      </section>
    </div>
    <div class="quick-grid">
      <button class="quick" type="button" data-go="schedule"><i>▦</i><span><strong>Расписание</strong><small>Пары на неделю</small></span></button>
      <button class="quick" type="button" data-go="grades"><i>◫</i><span><strong>Успеваемость</strong><small>Оценки и долги</small></span></button>
      <button class="quick" type="button" data-go="applications"><i>▧</i><span><strong>Заявки</strong><small>Заказать справку</small></span></button>
      <button class="quick" type="button" data-go="notifications"><i>♢</i><span><strong>Уведомления</strong><small>3 непрочитанных</small></span></button>
    </div>
    <div class="lower-grid">
      <section class="card"><div class="card-head"><h3>Важно сегодня</h3><button type="button" data-go="notifications">Все новости →</button></div><div class="news-list">${dashboard.notifications.map((n, i) => newsHtml(n, i === 0)).join("")}</div></section>
      <section class="card"><div class="card-head"><h3>Ближайшие занятия</h3><button type="button" data-go="schedule">Неделя →</button></div>${scheduleHtml(true)}</section>
    </div>`;
  startCountdown();
}

function startCountdown() {
  let seconds = 18 * 60 + 24;
  const tick = setInterval(() => {
    const node = el("#countdown");
    if (!node) return clearInterval(tick);
    seconds = Math.max(0, seconds - 1);
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    node.textContent = `00:${m}:${s}`;
  }, 1000);
}

function scheduleHtml(compact = false) {
  const rows = compact ? dashboard.schedule.slice(0, 3) : dashboard.schedule;
  return `<div class="${compact ? "lesson-list" : "lesson-list"}">${rows.map((item, i) => `
    <div class="lesson-row">
      <time>${item.time}</time><span class="lesson-accent ${item.accent}"></span>
      <div class="lesson-info"><strong>${item.title}</strong><small>${item.room} · ${item.teacher}</small></div>
      <span class="lesson-badge ${i === 0 ? "changed" : ""}">${i === 0 ? "ПЕРЕНОС" : item.kind}</span>
    </div>`).join("")}</div>`;
}

function newsHtml(n, unread = false) {
  const icon = n.type === "deadline" ? "◷" : n.type === "success" ? "✓" : "i";
  return `<div class="news-item ${unread ? "unread" : ""}"><span class="news-dot ${n.type}">${icon}</span><span><strong>${n.title}</strong><small>${n.text}</small></span><time>${n.time}</time></div>`;
}

function renderSchedule() {
  el("#pageTitle").textContent = "Расписание";
  view.innerHTML = `
    <section class="card">
      <div class="schedule-toolbar"><div class="segmented"><button type="button" class="active" data-period="today">Сегодня</button><button type="button" data-period="week">Неделя</button></div></div>
      <div class="day-filter">${["Пн 17","Вт 18","Ср 19","Чт 20","Пт 21","Сб 22","Вс 23"].map((day, i) => `<button type="button" class="${i === 3 ? "active" : ""}" data-day="${i}">${day}</button>`).join("")}</div>
      <div id="scheduleContent">${scheduleHtml(false)}</div>
    </section>`;
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-period]").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    el("#scheduleContent").innerHTML = button.dataset.period === "week"
      ? `<div class="grade-table">${["Понедельник","Вторник","Среда","Четверг","Пятница"].map((d, i) => `<div class="grade-row"><strong>${d}</strong><span>${i + 2} пары</span><span>${i === 3 ? "Перенос" : "По плану"}</span></div>`).join("")}</div>`
      : scheduleHtml(false);
  }));
  document.querySelectorAll("[data-day]").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll("[data-day]").forEach((b) => b.classList.remove("active"));
    button.classList.add("active");
    el("#scheduleContent").innerHTML = scheduleHtml(false);
  }));
}

function renderGrades() {
  el("#pageTitle").textContent = "Успеваемость";
  const rows = [
    ["Проектирование интерфейсов","Экзамен","excellent","5"],
    ["Основы машинного обучения","Зачёт","pass","Зачёт"],
    ["Базы данных","Экзамен","good","4"],
    ["Командная разработка","Курсовая","excellent","5"],
    ["Профессиональная этика","Пересдача","debt","Долг"],
  ];
  if (currentUser.group === "ПС-21") rows[4][2] = "debt";
  view.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>Зачетка • Осенний семестр 2026</h3><button type="button" id="exportGrades">Экспорт PDF</button></div>
      <div class="grades-summary"><div class="grade-stat"><small>Средний балл</small><strong>${String(currentUser.average).replace(".", ",")}</strong></div><div class="grade-stat"><small>Сдано</small><strong>${currentUser.status.includes("пересдача") || currentUser.status.includes("Пересдача") ? "4 из 5" : "5 из 5"}</strong></div><div class="grade-stat"><small>Долги</small><strong>${currentUser.status.includes("пересдача") || currentUser.status.includes("Пересдача") ? "1" : "0"}</strong></div></div>
      <div class="grade-table">${rows.map(([name, type, cls, grade]) => `<div class="grade-row"><strong>${name}</strong><span>${type}</span><span class="grade-value ${cls}">${grade}</span></div>`).join("")}</div>
    </section>`;
  el("#exportGrades").addEventListener("click", () => toast("Экспорт PDF подготовлен"));
}

function tracker(status) {
  const stages = ["Принята", "В работе", "Готова"];
  const index = status === "Готова" ? 2 : status === "В работе" ? 1 : 0;
  let html = '<div class="tracker">';
  stages.forEach((stage, i) => {
    html += `<i class="${i <= index ? "done" : ""}">${i <= index ? "✓" : i + 1}</i><span>${stage}</span>`;
    if (i < 2) html += `<b class="${i < index ? "done" : ""}"></b>`;
  });
  return html + "</div>";
}

function renderApplications() {
  el("#pageTitle").textContent = "Заявки и справки";
  view.innerHTML = `
    <div class="applications-layout">
      <section class="card application-form">
        <div class="card-head" style="padding:0 0 12px"><h3>Новая заявка</h3><small style="color:var(--muted)">2 клика</small></div>
        <form id="applicationForm">
          <label>Тип документа<select id="applicationKind"><option>Справка об обучении</option><option>Справка для налоговой</option><option>Справка о периоде обучения</option><option>Заявление в деканат</option></select></label>
          <label>Комментарий<textarea id="applicationComment" placeholder="Например, для оформления льготы"></textarea></label>
          <button class="primary-button" type="submit">Отправить заявку <span>→</span></button>
        </form>
      </section>
      <section class="card"><div class="card-head"><h3>Мои заявки</h3><span style="font-size:10px;color:var(--muted)">${dashboard.applications.length} заявки</span></div><div class="application-list" id="applicationsList">${applicationRows()}</div></section>
    </div>`;
  el("#applicationForm").addEventListener("submit", submitApplication);
}

function applicationRows() {
  if (!dashboard.applications.length) return '<div style="padding:34px;text-align:center;color:var(--muted);font-size:12px">Заявок пока нет</div>';
  return dashboard.applications.map((a) => `
    <div class="application-row">
      <span><strong>${a.kind}</strong><small>№ ${String(a.id).padStart(4, "0")} • ${a.created_at}</small>${tracker(a.status)}</span>
      ${a.status === "Готова" || a.status === "Готово" ? `<button class="open-certificate" type="button" data-certificate="${a.id}">Открыть справку с QR</button>` : '<span style="font-size:10px;color:var(--muted)">В обработке</span>'}
    </div>`).join("");
}

async function submitApplication(event) {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  try {
    const created = await api("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: el("#applicationKind").value, comment: el("#applicationComment").value }),
    });
    created.status = "На рассмотрении";
    dashboard.applications.unshift(created);
    el("#applicationsList").innerHTML = applicationRows();
    event.target.reset();
    toast("Заявка принята деканатом");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function openCertificate(id) {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="card-head" style="padding:0 0 14px"><h3>Справка об обучении</h3><button type="button" id="closeModal">×</button></div><div class="certificate"><img class="certificate-logo" src="./logo.png" alt="ПУЛЬС.Кампус" onerror="this.onerror=null;this.src='./logo-fallback.svg'"><p style="font-size:10px;color:var(--muted)">ПУЛЬС.Кампус • Конкурсный концепт</p><h2>Справка № ${String(id).padStart(4, "0")}</h2><p>Настоящая справка выдана <strong>${currentUser.name}</strong>, обучающемуся по направлению «${currentUser.program}».</p><div class="qr"></div><small style="color:var(--muted)">Для проверки документа в прототипе</small></div><div class="modal-actions"><button type="button" id="closeModal2">Закрыть</button><button class="primary-button" type="button" id="printCert">Печать / PDF</button></div></div>`;
  document.body.append(modal);
  modal.querySelectorAll("#closeModal,#closeModal2").forEach((button) => button.onclick = () => modal.remove());
  modal.querySelector("#printCert").onclick = () => window.print();
  modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
}

function renderNotifications() {
  el("#pageTitle").textContent = "Уведомления";
  view.innerHTML = `<section class="card"><div class="notifications-toolbar"><button class="text-button" type="button" id="readAll">Прочитать все</button></div><div class="notification-page">${dashboard.notifications.map((n, i) => `<div class="${i === 0 ? "urgent" : ""}">${newsHtml(n, i < 2)}</div>`).join("")}</div></section>`;
  el("#readAll").addEventListener("click", () => {
    document.querySelectorAll(".news-item").forEach((n) => n.classList.remove("unread"));
    toast("Все уведомления прочитаны");
  });
}

async function renderStaff() {
  el("#pageTitle").textContent = "Панель деканата";
  skeleton();
  try {
    const data = await api("/api/staff/applications");
    view.innerHTML = `
      <div class="staff-grid">
        <section class="card"><div class="card-head"><h3>Входящие заявки</h3><span style="font-size:10px;color:var(--muted)">Одним касанием</span></div><div class="staff-table" id="staffTable">${data.applications.map(staffRow).join("")}</div></section>
        <section class="card"><div class="card-head"><h3>Срочное объявление</h3></div><form class="publish-form" id="publishForm"><label>Текст для всех студентов<textarea id="announcementText" placeholder="Например: Сессия переносится…"></textarea></label><button class="primary-button" type="submit">Опубликовать всем <span>→</span></button></form></section>
      </div>`;
    el("#publishForm").addEventListener("submit", publishAnnouncement);
    document.querySelectorAll(".staff-status").forEach((select) => select.addEventListener("change", () => updateStaffStatus(select)));
  } catch (error) {
    view.innerHTML = `<section class="card" style="padding:30px">${error.message}</section>`;
  }
}

function staffRow(a) {
  return `<div class="staff-row" data-id="${a.id}"><span><strong>${a.name}</strong><small>${a.group_name} • ${a.kind}</small></span><select class="staff-status"><option ${a.status === "На рассмотрении" ? "selected" : ""}>На рассмотрении</option><option ${a.status === "В работе" ? "selected" : ""}>В работе</option><option ${a.status === "Готова" || a.status === "Готово" ? "selected" : ""}>Готова</option></select><input class="staff-comment" placeholder="Комментарий" value="${a.methodist_comment || ""}"></div>`;
}

async function updateStaffStatus(select) {
  const row = select.closest(".staff-row");
  const comment = row.querySelector(".staff-comment").value;
  try {
    await api("/api/staff/applications/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: Number(row.dataset.id), status: select.value, comment }) });
    toast(`Статус заявки изменен на «${select.value}»`);
  } catch (error) {
    toast(error.message);
  }
}

async function publishAnnouncement(event) {
  event.preventDefault();
  const text = el("#announcementText").value.trim();
  try {
    await api("/api/staff/announcement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    el("#announcementText").value = "";
    toast("Объявление опубликовано для всех студентов");
  } catch (error) {
    toast(error.message);
  }
}

function openProfile() {
  const modal = document.createElement("div");
  modal.className = "modal-backdrop";
  modal.innerHTML = `<div class="modal"><div class="card-head" style="padding:0 0 14px"><h3>Личные данные</h3><button type="button" id="closeProfile">×</button></div><div class="profile-modal-row"><span>ФИО</span><strong>${currentUser.name}</strong></div><div class="profile-modal-row"><span>${currentUser.role === "staff" ? "Должность" : "Факультет"}</span><strong>${currentUser.faculty}</strong></div>${currentUser.role !== "staff" ? `<div class="profile-modal-row"><span>Направление</span><strong>${currentUser.program}</strong></div><div class="profile-modal-row"><span>Курс и группа</span><strong>${currentUser.course} курс • ${currentUser.group}</strong></div>` : ""}<div class="modal-actions" style="margin-top:16px"><button type="button" id="logout">Выйти из аккаунта</button></div></div>`;
  document.body.append(modal);
  modal.querySelector("#closeProfile").onclick = () => modal.remove();
  modal.querySelector("#logout").onclick = logoutAccount;
  modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
}

function logoutAccount() {
  const pendingLogout = api("/api/logout", { method: "POST" }).catch(() => null);
  try {
    try {
      if (localEngine) localEngine.clearSession();
      for (const key of ["pulse_session", "pulse-session", "session"]) {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.warn("Не удалось очистить локальный маркер сессии:", error);
    }
  } finally {
    currentUser = null;
    dashboard = null;
    el("#shell").hidden = true;
    el("#loginPage").hidden = false;
    el("#aiPanel").hidden = true;
    document.querySelectorAll(".modal-backdrop").forEach((modal) => modal.remove());
    el("#login").value = "";
    el("#password").value = "";
    el("#loginError").textContent = "";
    el("#loginButtonText").textContent = "Войти в кабинет";
    toast("Вы вышли из аккаунта");
  }
  return pendingLogout;
}

document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go]");
  if (go) setView(go.dataset.go);
  const nav = event.target.closest("[data-view]");
  if (nav) setView(nav.dataset.view);
  const cert = event.target.closest("[data-certificate]");
  if (cert) openCertificate(cert.dataset.certificate);
  if (event.target.closest("#profileMini")) openProfile();
  if (event.target.closest("#headerLogout")) logoutAccount();
  if (event.target.closest("#whatIf")) {
    const projected = ((currentUser.average * 4 + 5) / 5).toFixed(2);
    toast(`Новый средний балл: ${projected.replace(".", ",")}`);
  }
});

el("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  login(el("#login").value.trim(), el("#password").value);
});
el("#togglePassword").addEventListener("click", () => {
  const input = el("#password");
  input.type = input.type === "password" ? "text" : "password";
  el("#togglePassword").textContent = input.type === "password" ? "Показать" : "Скрыть";
});
document.querySelectorAll(".demo-card").forEach((card) => card.addEventListener("click", () => {
  el("#login").value = card.dataset.login;
  el("#password").value = card.dataset.password;
  login(card.dataset.login, card.dataset.password);
}));
document.querySelectorAll(".theme-toggle").forEach((button) => button.addEventListener("click", toggleTheme));

el("#aiFab").addEventListener("click", () => { el("#aiPanel").hidden = !el("#aiPanel").hidden; });
el("#closeAi").addEventListener("click", () => { el("#aiPanel").hidden = true; });
document.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => {
  const [answer, target] = button.dataset.answer.split("|");
  const message = document.createElement("p");
  message.className = "ai-message ai-answer";
  message.textContent = answer;
  el("#aiMessages").append(message);
  setTimeout(() => setView(target), 650);
}));

async function resetDemoData() {
  if (!localEngine) localEngine = new LocalCampusEngine();
  await localEngine.reset();
  dashboard = null;
  localMode = true;
  toast("Демо-данные сброшены");
  setTimeout(() => location.reload(), 350);
}

const resetDemo = el("#resetDemo");
const resetDemoShell = el("#resetDemoShell");
if (resetDemo) resetDemo.addEventListener("click", resetDemoData);
if (resetDemoShell) resetDemoShell.addEventListener("click", resetDemoData);

initTheme();
boot();
