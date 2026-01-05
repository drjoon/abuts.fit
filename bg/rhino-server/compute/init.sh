rm -rf .venv \
  && python3 -m venv .venv \
  && source .venv/bin/activate \
  && pip install -U pip \
  && pip install -r requirements.txt requests \
  && python -m uvicorn app:app --host 127.0.0.1 --port 8000