#!/usr/bin/env python3
"""Roomify — локальный сервер для фронтенда обработки аудио.

Зависимостей нет, только стандартная библиотека.
Запуск:  python3 server.py [порт]
"""
import http.server
import os
import socketserver
import sys
import threading
import webbrowser

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        # во время разработки не хотим кэш
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s\n" % (fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main():
    url = f"http://127.0.0.1:{PORT}/"
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Roomify запущен: {url}")
        print("Остановить: Ctrl+C")
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nОстановлено.")


if __name__ == "__main__":
    main()
