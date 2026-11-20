import http.cookiejar
import json
import sqlite3
import subprocess
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PulseCampusTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import socket
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            cls.port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.process = subprocess.Popen(
            [sys.executable, "app.py"],
            cwd=ROOT,
            env={**__import__("os").environ, "HOST": "127.0.0.1", "PORT": str(cls.port), "APP_SECRET": "test-only-secret-not-for-production"},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        for _ in range(40):
            try:
                urllib.request.urlopen(cls.base + "/")
                break
            except Exception:
                time.sleep(0.05)
        else:
            raise RuntimeError("Тестовый сервер не запустился")

    @classmethod
    def tearDownClass(cls):
        cls.process.terminate()
        cls.process.wait(timeout=5)

    def opener(self, login=None, password=None):
        jar = http.cookiejar.CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        if login:
            data = json.dumps({"login": login, "password": password}, ensure_ascii=False).encode()
            request = urllib.request.Request(
                self.base + "/api/login",
                data=data,
                headers={"Content-Type": "application/json"},
            )
            opener.open(request)
        return opener

    def request(self, opener, path, method="GET", payload=None):
        data = None
        headers = {}
        if payload is not None:
            data = json.dumps(payload, ensure_ascii=False).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        try:
            response = opener.open(request)
            body = response.read().decode()
            return response.status, json.loads(body) if body else {}
        except urllib.error.HTTPError as error:
            body = error.read().decode()
            return error.code, json.loads(body) if body else {}

    def test_demo_logins_and_wrong_password(self):
        for login in ("alexey", "elena", "dean"):
            opener = self.opener(login, "Pulse2026!")
            status, data = self.request(opener, "/api/me")
            self.assertEqual(status, 200)
            self.assertEqual(data["role"], "staff" if login == "dean" else "student")
        status, _ = self.request(self.opener(), "/api/login", "POST", {"login": "alexey", "password": "wrong"})
        self.assertEqual(status, 401)

    def test_student_cannot_open_or_change_elena_application(self):
        alexey = self.opener("alexey", "Pulse2026!")
        elena = self.opener("elena", "Pulse2026!")
        _, elena_dash = self.request(elena, "/api/dashboard")
        elena_app = next(app for app in elena_dash["applications"])
        status, _ = self.request(alexey, f"/api/applications/{elena_app['id']}")
        self.assertEqual(status, 403)
        status, _ = self.request(
            alexey,
            f"/api/applications/{elena_app['id']}/status",
            "POST",
            {"status": "Готова"},
        )
        self.assertEqual(status, 403)

    def test_passwords_are_pbkdf2_hashes_not_plaintext(self):
        conn = sqlite3.connect(ROOT / "decanat.db")
        conn.row_factory = sqlite3.Row
        for login in ("alexey", "elena", "dean"):
            row = conn.execute("SELECT password_hash FROM users WHERE login=?", (login,)).fetchone()
            self.assertIsNotNone(row)
            self.assertNotIn(login, row["password_hash"])
            self.assertIn("$", row["password_hash"])
            salt, digest = row["password_hash"].split("$", 1)
            self.assertEqual(len(salt), 32)
            self.assertEqual(len(digest), 64)
        conn.close()

    def test_elena_application_ready_certificate_flow(self):
        elena = self.opener("elena", "Pulse2026!")
        status, created = self.request(
            elena,
            "/api/applications",
            "POST",
            {"kind": "Справка о периоде обучения", "comment": "Автотест сквозного сценария"},
        )
        self.assertEqual(status, 201)

        dean = self.opener("dean", "Pulse2026!")
        status, _ = self.request(
            dean,
            "/api/staff/applications/status",
            "POST",
            {"id": created["id"], "status": "Готова", "comment": "Проверено методистом"},
        )
        self.assertEqual(status, 200)

        status, certificate = self.request(elena, f"/api/applications/{created['id']}/certificate")
        self.assertEqual(status, 200)
        self.assertEqual(certificate["status"], "Готова")
        self.assertEqual(certificate["kind"], "Справка о периоде обучения")


if __name__ == "__main__":
    unittest.main()
