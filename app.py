import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB = ROOT / "decanat.db"
STATIC = {
    "index.html": "text/html",
    "styles.css": "text/css",
    "app.js": "application/javascript",
    "logo.png": "image/png",
    "logo-fallback.svg": "image/svg+xml",
}
SESSIONS = {}
APP_SECRET = os.environ.get("APP_SECRET") or secrets.token_hex(32)


def db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 120000).hex()
    return f"{salt}${digest}"


def password_ok(password, stored):
    salt, digest = stored.split("$", 1)
    candidate = password_hash(password, salt).split("$", 1)[1]
    return hmac.compare_digest(candidate, digest)


def init_db():
    with db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            login TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            faculty TEXT NOT NULL,
            program TEXT NOT NULL,
            course INTEGER NOT NULL,
            group_name TEXT NOT NULL,
            average REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS applications (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            comment TEXT,
            status TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        """)
        app_columns = {row[1] for row in conn.execute("PRAGMA table_info(applications)").fetchall()}
        if "methodist_comment" not in app_columns:
            conn.execute("ALTER TABLE applications ADD COLUMN methodist_comment TEXT")
        columns = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "role" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'")
        if "status" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'Занятия идут без долгов'")
        if "gpa_status" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN gpa_status TEXT NOT NULL DEFAULT 'Допуск к сессии'")
        users = [
            ("alexey", "Pulse2026!", "Алексей Громов", "Факультет информационных технологий", "Прикладная информатика", 3, "ПИ-31", 4.92, "student", "Допуск к сессии", "До стипендии осталось 1 балл"),
            ("elena", "Pulse2026!", "Елена Соколова", "Факультет социальных наук", "Психология", 2, "ПС-21", 3.82, "student", "Есть пересдача", "Допуск с ограничениями"),
            ("dean", "Pulse2026!", "Марина Белова", "Методист деканата", "Административная панель", 0, "Сотрудник", 0.0, "staff", "Рабочая смена", "Все заявки доступны"),
        ]
        for login, password, name, faculty, program, course, group, average, role, status, gpa_status in users:
            if conn.execute("SELECT 1 FROM users WHERE login=?", (login,)).fetchone():
                continue
            conn.execute(
                "INSERT INTO users(login,password_hash,name,faculty,program,course,group_name,average,role,status,gpa_status) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (login, password_hash(password), name, faculty, program, course, group, average, role, status, gpa_status),
            )
        for user_id, kind in ((1, "Справка об обучении"), (2, "Дубликат зачётной книжки")):
            if not conn.execute("SELECT 1 FROM applications WHERE user_id=?", (user_id,)).fetchone():
                conn.execute(
                    "INSERT INTO applications(user_id,kind,comment,status,created_at) VALUES(?,?,?,?,?)",
                    (user_id, kind, "Тестовая заявка", "Готово" if user_id == 1 else "В работе", "20 нояб. 2026"),
                )


init_db()


class Handler(BaseHTTPRequestHandler):
    server_version = "DekanatConcept/1.0"

    def log_message(self, fmt, *args):
        return

    def cookie(self, name):
        raw = self.headers.get("Cookie", "")
        for item in raw.split(";"):
            if "=" in item:
                key, value = item.strip().split("=", 1)
                if key == name:
                    return value
        return None

    def current_user(self):
        token = self.cookie("session")
        if not token or "." not in token:
            return None
        payload, signature = token.rsplit(".", 1)
        expected = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            SESSIONS.pop(token, None)
            return None
        user_id = SESSIONS.get(token)
        if not user_id:
            return None
        with db() as conn:
            return conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        path = urlparse(self.path).path
        if path == "/":
            path = "/index.html"
        if path.lstrip("/") in STATIC:
            file_name = path.lstrip("/")
            file_path = ROOT / file_name
            if file_path.exists():
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", STATIC[file_name])
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(file_path.stat().st_size))
                self.end_headers()
                return
        if path.startswith("/api/"):
            self.send_response(HTTPStatus.OK)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        self.send_response(HTTPStatus.NOT_FOUND)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            path = "/index.html"
        if path in ("/" + name for name in STATIC):
            file_name = path.lstrip("/")
            file_path = ROOT / file_name
            if file_path.exists():
                body = file_path.read_bytes()
                self.send_response(HTTPStatus.OK)
                self.send_header("Content-Type", STATIC[file_name])
                self.send_header("Cache-Control", "no-cache")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        if path == "/api/me":
            user = self.current_user()
            if not user:
                self.send_json(401, {"error": "Требуется вход"})
                return
            self.send_json(200, {"id": user["id"], "name": user["name"], "faculty": user["faculty"],
                                 "program": user["program"], "course": user["course"],
                                 "group": user["group_name"], "average": user["average"],
                                 "role": user["role"], "status": user["status"], "gpa_status": user["gpa_status"]})
            return
        if path == "/api/staff/applications":
            user = self.current_user()
            if not user or user["role"] != "staff":
                self.send_json(403, {"error": "Нет доступа"})
                return
            with db() as conn:
                rows = conn.execute("""
                    SELECT a.id,a.kind,a.comment,a.status,a.created_at,u.name,u.group_name,u.id AS user_id
                    FROM applications a JOIN users u ON u.id=a.user_id
                    WHERE u.role='student' ORDER BY a.id DESC
                """).fetchall()
            self.send_json(200, {"applications": [dict(row) for row in rows]})
            return
        if path.startswith("/api/applications/"):
            user = self.current_user()
            if not user:
                self.send_json(401, {"error": "Требуется вход"})
                return
            parts = path.strip("/").split("/")
            try:
                application_id = int(parts[2])
            except (IndexError, ValueError):
                self.send_json(404, {"error": "Заявка не найдена"})
                return
            with db() as conn:
                application = conn.execute(
                    "SELECT a.*, u.login FROM applications a JOIN users u ON u.id=a.user_id WHERE a.id=?",
                    (application_id,),
                ).fetchone()
            if not application:
                self.send_json(404, {"error": "Заявка не найдена"})
                return
            if application["user_id"] != user["id"] and user["role"] != "staff":
                self.send_json(403, {"error": "Нет доступа к чужой заявке"})
                return
            if len(parts) == 4 and parts[3] == "certificate":
                if application["status"] not in ("Готова", "Готово"):
                    self.send_json(409, {"error": "Справка ещё не готова"})
                    return
                self.send_json(200, {
                    "id": application["id"],
                    "kind": application["kind"],
                    "status": application["status"],
                    "student": user["name"],
                })
                return
            self.send_json(200, dict(application))
            return
        if path == "/api/dashboard":
            user = self.current_user()
            if not user:
                self.send_json(401, {"error": "Требуется вход"})
                return
            user_id = user["id"]
            with db() as conn:
                applications = [dict(row) for row in conn.execute(
                    "SELECT id,kind,status,created_at FROM applications WHERE user_id=? ORDER BY id DESC",
                    (user_id,),
                )]
            schedule = [
                {"time": "09:30", "title": "Проектирование интерфейсов", "kind": "Практика", "room": "Корпус 2 · ауд. 304", "teacher": "Ирина Волкова", "accent": "violet"},
                {"time": "11:20", "title": "Основы машинного обучения", "kind": "Лекция", "room": "Корпус 1 · ауд. 118", "teacher": "Алексей Солнечный", "accent": "mint"},
                {"time": "14:10", "title": "Базы данных", "kind": "Семинар", "room": "Корпус 3 · ауд. 220", "teacher": "Марина Лесная", "accent": "orange"},
            ]
            grades = [
                {"subject": "Проектирование интерфейсов", "grade": "5", "kind": "Экзамен", "trend": "+1"},
                {"subject": "Основы машинного обучения", "grade": "Зачёт", "kind": "Зачёт", "trend": ""},
                {"subject": "Базы данных", "grade": "4", "kind": "Экзамен", "trend": "Стабильно"},
                {"subject": "Командная разработка", "grade": "5", "kind": "Курс. проект", "trend": "+1"},
            ]
            notifications = [
                {"title": "Расписание на 21 ноября изменилось", "text": "Пара перенесена в аудиторию 304.", "type": "warning", "time": "12 мин"},
                {"title": "До сдачи проекта 2 дня", "text": "Командная разработка · до 22 ноября.", "type": "deadline", "time": "1 ч"},
                {"title": "Справка готова", "text": "Заявку можно скачать в разделе «Заявки».", "type": "success", "time": "Вчера"},
            ]
            self.send_json(200, {"schedule": schedule, "grades": grades, "applications": applications, "notifications": notifications})
            return
        self.send_json(404, {"error": "Не найдено"})

    def do_POST(self):
        path = urlparse(self.path).path
        length = int(self.headers.get("Content-Length", "0"))
        try:
            data = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Некорректный JSON"})
            return
        if path.startswith("/api/applications/") and path.endswith("/status"):
            user = self.current_user()
            if not user:
                self.send_json(401, {"error": "Требуется вход"})
                return
            self.send_json(403, {"error": "Студент не может менять статус заявки"})
            return
        if path == "/api/login":
            login = str(data.get("login", "")).strip()
            password = str(data.get("password", ""))
            with db() as conn:
                user = conn.execute("SELECT * FROM users WHERE login=?", (login,)).fetchone()
            if not user or not password_ok(password, user["password_hash"]):
                self.send_json(401, {"error": "Неверный логин или пароль"})
                return
            payload = secrets.token_urlsafe(32)
            signature = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
            token = f"{payload}.{signature}"
            SESSIONS[token] = user["id"]
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Set-Cookie", f"session={token}; HttpOnly; SameSite=Strict; Path=/")
            self.send_header("Cache-Control", "no-store")
            body = json.dumps({"ok": True}, ensure_ascii=False).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/logout":
            SESSIONS.pop(self.cookie("session"), None)
            self.send_response(200)
            self.send_header("Set-Cookie", "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if path == "/api/applications":
            user = self.current_user()
            if not user:
                self.send_json(401, {"error": "Требуется вход"})
                return
            if user["role"] == "staff":
                self.send_json(403, {"error": "Сотрудник не подает студенческие заявки"})
                return
            kind = str(data.get("kind", "")).strip()
            comment = str(data.get("comment", "")).strip()
            if not kind:
                self.send_json(400, {"error": "Выберите тип заявки"})
                return
            with db() as conn:
                cursor = conn.execute(
                    "INSERT INTO applications(user_id,kind,comment,status,created_at) VALUES(?,?,?,?,?)",
                    (user["id"], kind, comment, "На рассмотрении", "20 нояб. 2026"),
                )
                application_id = cursor.lastrowid
            self.send_json(201, {"id": application_id, "kind": kind, "status": "На рассмотрении", "created_at": "20 нояб. 2026"})
            return
        if path == "/api/staff/applications/status":
            user = self.current_user()
            if not user or user["role"] != "staff":
                self.send_json(403, {"error": "Нет доступа"})
                return
            application_id = data.get("id")
            status = str(data.get("status", "")).strip()
            comment = str(data.get("comment", "")).strip()
            if status not in ("На рассмотрении", "В работе", "Готова"):
                self.send_json(400, {"error": "Некорректный статус"})
                return
            with db() as conn:
                result = conn.execute(
                    "UPDATE applications SET status=?, methodist_comment=? WHERE id=?",
                    (status, comment or None, application_id),
                )
                if result.rowcount == 0:
                    self.send_json(404, {"error": "Заявка не найдена"})
                    return
            self.send_json(200, {"ok": True})
            return
        if path == "/api/staff/announcement":
            user = self.current_user()
            if not user or user["role"] != "staff":
                self.send_json(403, {"error": "Нет доступа"})
                return
            text = str(data.get("text", "")).strip()
            if not text:
                self.send_json(400, {"error": "Введите текст объявления"})
                return
            self.send_json(201, {"ok": True, "text": text})
            return
        self.send_json(404, {"error": "Не найдено"})


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    print(f"Концепт кабинета запущен: http://{host}:{port}")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
