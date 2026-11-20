FROM python:3.12-slim

WORKDIR /app

COPY app.py index.html styles.css app.js logo.png logo-fallback.svg README.md ./

RUN python -m py_compile app.py

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

CMD ["python", "app.py"]
