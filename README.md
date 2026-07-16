# MedCRM — Medical Supplies Sales CRM

A lightweight full-stack CRM for a medical supplies sales team, with strict
role-based access control and a Gemini-powered natural-language performance
assistant for managers.

```
medcrm/
├── backend/           FastAPI + SQLAlchemy + SQLite + Gemini
│   ├── main.py         App entrypoint, all routes
│   ├── models.py        SQLAlchemy ORM models (User, Lead, CallLog)
│   ├── schemas.py       Pydantic request/response schemas
│   ├── auth.py           JWT auth + RBAC dependencies
│   ├── database.py        SQLite engine/session setup
│   ├── requirements.txt
│   └── .env.example
└── frontend/          Static HTML/CSS/Vanilla JS (Bootstrap 5)
    ├── index.html            Login (redirects by role)
    ├── dashboard.html          Sales rep view
    ├── admin_dashboard.html      Manager view + AI chatbot
    ├── app.js
    └── style.css
```

## 1. Backend setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# then edit .env and set:
#   SECRET_KEY=<a long random string>
#   GEMINI_API_KEY=<your Gemini API key from https://aistudio.google.com/app/apikey>

uvicorn main:app --reload --port 8000
```

The API will be live at `http://127.0.0.1:8000` (interactive docs at
`http://127.0.0.1:8000/docs`).

On first startup, if the database is empty, two demo accounts are seeded
automatically:

| Role       | Username | Password |
|------------|----------|----------|
| Manager    | `admin`  | `admin123` |
| Sales rep  | `rep1`   | `rep123`   |

**Change or remove these before deploying anywhere non-local.**

## 2. Frontend setup

The frontend is static HTML/CSS/JS — no build step. `app.js` points at
`http://127.0.0.1:8000` via `API_BASE_URL`; update that constant if you host
the API elsewhere.

Because the pages use `fetch()`, serve them over HTTP rather than opening the
files directly (`file://`) to avoid CORS/localStorage quirks:

```bash
cd frontend
python3 -m http.server 5500
```

Then open `http://127.0.0.1:5500/index.html`.

## 3. How the role-based access control works

- Every JWT encodes the user's `username`; the role is looked up server-side
  from the `users` table on every request via `get_current_user`.
- `GET /leads/` and `GET /call-logs/` apply a SQL filter
  (`WHERE assigned_to = current_user.id`) whenever the caller is a
  `sales_rep`. `admin` callers get no filter — 100% team visibility.
- `POST /leads/` forces `assigned_to = current_user.id` for `sales_rep`
  callers, so a rep can never create a lead assigned to someone else.
- `POST /call-logs/` checks that the underlying lead belongs to the caller
  before allowing a rep to log a call against it.
- `POST /api/manager-chat` and `POST /auth/register` are wrapped in a
  `require_admin` dependency and return `403 Forbidden` for sales reps.

This enforcement happens in the API layer, not just the UI, so it holds even
if someone calls the API directly (e.g. via `curl` or Postman).

## 4. The Manager AI Assistant

`POST /api/manager-chat` (admin-only):

1. Queries SQLite to aggregate current sales-per-rep, call-outcome counts,
   and lead counts (`_build_team_performance_context` in `main.py`).
2. Formats that into a compact text context block.
3. Sends `{context + manager's question}` to Gemini via
   `google.generativeai`.
4. Returns the model's natural-language answer to the frontend chat widget.

Set `GEMINI_API_KEY` in `backend/.env` for this endpoint to work. The model
used is controlled by `GEMINI_MODEL` in `.env` (defaults to
`gemini-1.5-flash`).

## 5. Using with Aider

Both folders are plain Python/HTML — Aider can be pointed at `backend/*.py`
and `frontend/*.js|html|css` directly, e.g.:

```bash
aider backend/main.py backend/models.py backend/schemas.py backend/auth.py
```
