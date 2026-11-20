let user = null;
let dashboard = null;
let currentView = "home";

const el = (s) => document.querySelector(s);
const view = el("#view");

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Ошибка сервера");
  return data;
}

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
    user = await api("/api/me");
    showShell();
  } catch (_) {
    el("#loginPage").hidden = false;
    el("#shell").hidden = true;
  }
}

function showShell() {
  el("#loginPage").hidden = true;
  el("#shell").hidden = false;
  el("#sidebarName").textContent = user.name;
  el("#sidebarMeta").textContent = user.role === "staff" ? "Сотрудник деканата" : `${user.group} • ${user.course} курс`;
  el("#sidebarAvatar").textContent = initials(user.name);
  buildNavigation();
  if (user.role === "staff") {
    setView("staff");
  } else {
    setView("home");
  }
}

function buildNavigation() {
  const items = user.role === "staff"
    ? [["staff", "▦", "Управление"], ["notifications", "♢", "Объявления"]]
    : [["home", "⌂", "Главная"], ["schedule", "▦", "Расписание"], ["grades", "◫", "Оценки"], ["applications", "▧", "Справки"], ["notifications", "♢", "Уведомления"]];
  el("#desktopNav").innerHTML = items.map(([name, icon, label]) =>
    `<button class="nav-item ${name === currentView ? "active" : ""}" type="button" data-view="${name}"><i>${icon}</i><span>${label}</span>${name === "notifications" ? "<b>3</b>" : ""}</button>`
  ).join("");
  el("#bottomNav").innerHTML = user.role === "staff"
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
  el("#aiFab").hidden = user.role === "staff";
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
  el("#pageTitle").textContent = `Доброе утро, ${user.name.split(" ")[0]}!`;
  const firstName = user.name.split(" ")[0];
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
        <div class="score-ring" style="--score:${Math.round(user.average / 5 * 100)}%"><div><b>${String(user.average).replace(".", ",")}</b><small>из 5,00</small></div></div>
        <div class="mini-stats"><div class="mini-stat"><small>Сессия</small><strong>${user.status}</strong></div><div class="mini-stat"><small>Стипендия</small><strong>${user.average >= 4.5 ? "18 400 ₽" : "Без стипендии"}</strong></div></div>
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
  if (user.group === "ПС-21") rows[4][2] = "debt";
  view.innerHTML = `
    <section class="card">
      <div class="card-head"><h3>Зачетка • Осенний семестр 2026</h3><button type="button" id="exportGrades">Экспорт PDF</button></div>
      <div class="grades-summary"><div class="grade-stat"><small>Средний балл</small><strong>${String(user.average).replace(".", ",")}</strong></div><div class="grade-stat"><small>Сдано</small><strong>${user.status.includes("пересдача") || user.status.includes("Пересдача") ? "4 из 5" : "5 из 5"}</strong></div><div class="grade-stat"><small>Долги</small><strong>${user.status.includes("пересдача") || user.status.includes("Пересдача") ? "1" : "0"}</strong></div></div>
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
  modal.innerHTML = `<div class="modal"><div class="card-head" style="padding:0 0 14px"><h3>Справка об обучении</h3><button type="button" id="closeModal">×</button></div><div class="certificate"><img class="certificate-logo" src="/logo.png" alt="ПУЛЬС.Кампус" onerror="this.onerror=null;this.src='/logo-fallback.svg'"><p style="font-size:10px;color:var(--muted)">ПУЛЬС.Кампус • Конкурсный концепт</p><h2>Справка № ${String(id).padStart(4, "0")}</h2><p>Настоящая справка выдана <strong>${user.name}</strong>, обучающемуся по направлению «${user.program}».</p><div class="qr"></div><small style="color:var(--muted)">Для проверки документа в прототипе</small></div><div class="modal-actions"><button type="button" id="closeModal2">Закрыть</button><button class="primary-button" type="button" id="printCert">Печать / PDF</button></div></div>`;
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
  modal.innerHTML = `<div class="modal"><div class="card-head" style="padding:0 0 14px"><h3>Личные данные</h3><button type="button" id="closeProfile">×</button></div><div class="profile-modal-row"><span>ФИО</span><strong>${user.name}</strong></div><div class="profile-modal-row"><span>${user.role === "staff" ? "Должность" : "Факультет"}</span><strong>${user.faculty}</strong></div>${user.role !== "staff" ? `<div class="profile-modal-row"><span>Направление</span><strong>${user.program}</strong></div><div class="profile-modal-row"><span>Курс и группа</span><strong>${user.course} курс • ${user.group}</strong></div>` : ""}<div class="modal-actions" style="margin-top:16px"><button type="button" id="logout">Выйти из аккаунта</button></div></div>`;
  document.body.append(modal);
  modal.querySelector("#closeProfile").onclick = () => modal.remove();
  modal.querySelector("#logout").onclick = async () => { await fetch("/api/logout", { method: "POST" }); location.reload(); };
  modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
}

document.addEventListener("click", (event) => {
  const go = event.target.closest("[data-go]");
  if (go) setView(go.dataset.go);
  const nav = event.target.closest("[data-view]");
  if (nav) setView(nav.dataset.view);
  const cert = event.target.closest("[data-certificate]");
  if (cert) openCertificate(cert.dataset.certificate);
  if (event.target.closest("#profileMini")) openProfile();
  if (event.target.closest("#whatIf")) {
    const projected = ((user.average * 4 + 5) / 5).toFixed(2);
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

initTheme();
boot();
