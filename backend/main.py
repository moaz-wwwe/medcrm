"""
main.py
-------
FastAPI application entrypoint for the Medical Supplies CRM.

Endpoints:
- POST /auth/login              -> obtain JWT
- POST /auth/register           -> (admin only) create a new user
- GET  /auth/me                 -> current user info
- POST /leads/                  -> create a lead
- GET  /leads/                  -> list leads (role-filtered)
- POST /call-logs/               -> create a call log
- GET  /call-logs/               -> list call logs (role-filtered)
- POST /api/manager-chat        -> (admin only) natural-language team performance Q&A via Gemini

Role-based access control (RBAC) summary:
- admin (Manager): sees ALL leads / call logs / performance data, team-wide.
- sales_rep: sees ONLY leads assigned to them, and call logs on those leads.
  This is enforced at the query level (server-side filtering), not just in the UI.
"""

import os

from collections import defaultdict
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

import auth
import models
import schemas
from database import Base, engine, get_db

load_dotenv()

# Create tables on startup (fine for SQLite / dev; use Alembic migrations in production).
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Medical Supplies CRM API", version="1.0.0")

# Allow the static frontend (opened via file:// or a local dev server) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Startup: seed a default admin + sales rep if the DB is empty, so the app is
# runnable immediately without a separate seeding step.
# ---------------------------------------------------------------------------
@app.on_event("startup")
def seed_default_users():
    db: Session = next(get_db())
    try:
        if db.query(models.User).count() == 0:
            admin = models.User(
                username="admin",
                password_hash=auth.hash_password("admin123"),
                role=models.UserRole.ADMIN,
                full_name="Team Manager",
            )
            rep = models.User(
                username="rep1",
                password_hash=auth.hash_password("rep123"),
                role=models.UserRole.SALES_REP,
                full_name="Sales Rep One",
            )
            db.add_all([admin, rep])
            db.commit()
            print("Seeded default users -> admin/admin123 (admin), rep1/rep123 (sales_rep)")
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@app.post("/auth/login", response_model=schemas.Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = auth.create_access_token(data={"sub": user.username, "role": user.role.value})
    return schemas.Token(
        access_token=access_token,
        role=user.role,
        username=user.username,
        user_id=user.id,
    )


@app.post("/auth/register", response_model=schemas.UserOut)
def register_user(
    payload: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),
):
    """Only an admin (manager) can create new user accounts (reps or other admins)."""
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    new_user = models.User(
        username=payload.username,
        password_hash=auth.hash_password(payload.password),
        role=payload.role,
        full_name=payload.full_name,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@app.get("/auth/me", response_model=schemas.UserOut)
def read_me(current_user: models.User = Depends(auth.get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------

def _lead_to_out(lead: models.Lead) -> schemas.LeadOut:
    out = schemas.LeadOut.model_validate(lead)
    out.assigned_rep_username = lead.assigned_rep.username if lead.assigned_rep else None
    return out


@app.post("/leads/", response_model=schemas.LeadOut)
def create_lead(
    payload: schemas.LeadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    # RBAC: sales reps can only create leads assigned to themselves.
    # Admins may optionally assign a lead to any rep via `assigned_to`.
    if current_user.role == models.UserRole.SALES_REP:
        assigned_to = current_user.id
    else:
        assigned_to = payload.assigned_to or current_user.id
        if not db.query(models.User).filter(models.User.id == assigned_to).first():
            raise HTTPException(status_code=404, detail="assigned_to user not found")

    lead = models.Lead(
        name=payload.name,
        phone=payload.phone,
        facility_type=payload.facility_type,
        notes=payload.notes,
        assigned_to=assigned_to,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return _lead_to_out(lead)


@app.get("/leads/", response_model=List[schemas.LeadOut])
def list_leads(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.Lead)

    # --- Core RBAC enforcement ---
    if current_user.role == models.UserRole.SALES_REP:
        query = query.filter(models.Lead.assigned_to == current_user.id)
    # admin: no filter applied -> sees 100% of team's leads

    leads = query.order_by(models.Lead.created_at.desc()).all()
    return [_lead_to_out(lead) for lead in leads]


@app.get("/leads/{lead_id}", response_model=schemas.LeadOut)
def get_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    lead = db.query(models.Lead).filter(models.Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    if current_user.role == models.UserRole.SALES_REP and lead.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="You do not have access to this lead")
    return _lead_to_out(lead)


# ---------------------------------------------------------------------------
# Call Logs
# ---------------------------------------------------------------------------

def _calllog_to_out(log: models.CallLog) -> schemas.CallLogOut:
    return schemas.CallLogOut(
        id=log.id,
        lead_id=log.lead_id,
        call_result=log.call_result,
        sales_amount=log.sales_amount,
        notes=log.notes,
        timestamp=log.timestamp,
        lead_name=log.lead.name if log.lead else None,
        rep_username=log.lead.assigned_rep.username if log.lead and log.lead.assigned_rep else None,
    )


@app.post("/call-logs/", response_model=schemas.CallLogOut)
def create_call_log(
    payload: schemas.CallLogCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    lead = db.query(models.Lead).filter(models.Lead.id == payload.lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # RBAC: sales reps may only log calls against leads assigned to them.
    if current_user.role == models.UserRole.SALES_REP and lead.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="You cannot log calls for another rep's lead")

    log = models.CallLog(
        lead_id=payload.lead_id,
        call_result=payload.call_result,
        sales_amount=payload.sales_amount,
        notes=payload.notes,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return _calllog_to_out(log)


@app.get("/call-logs/", response_model=List[schemas.CallLogOut])
def list_call_logs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.get_current_user),
):
    query = db.query(models.CallLog).join(models.Lead)

    # --- Core RBAC enforcement ---
    if current_user.role == models.UserRole.SALES_REP:
        query = query.filter(models.Lead.assigned_to == current_user.id)
    # admin: sees every call log across the whole team

    logs = query.order_by(models.CallLog.timestamp.desc()).all()
    return [_calllog_to_out(log) for log in logs]


# ---------------------------------------------------------------------------
# Manager AI Assistant  (admin-only)
# ---------------------------------------------------------------------------

def _build_team_performance_context(db: Session) -> str:
    """
    Aggregates current team performance directly from SQLite and formats it
    into a compact text context string to feed the LLM. Keeping this as plain
    text (rather than raw JSON dumps) keeps token usage low and improves the
    quality of the model's natural-language answers.
    """
    reps = db.query(models.User).filter(models.User.role == models.UserRole.SALES_REP).all()

    sales_by_rep = defaultdict(float)
    calls_by_rep = defaultdict(int)
    results_by_rep = defaultdict(lambda: defaultdict(int))

    logs = db.query(models.CallLog).join(models.Lead).all()
    for log in logs:
        rep = log.lead.assigned_rep
        if not rep:
            continue
        sales_by_rep[rep.username] += log.sales_amount or 0.0
        calls_by_rep[rep.username] += 1
        results_by_rep[rep.username][log.call_result] += 1

    leads_by_rep = defaultdict(int)
    for lead in db.query(models.Lead).all():
        if lead.assigned_rep:
            leads_by_rep[lead.assigned_rep.username] += 1

    lines = [f"Team performance snapshot as of {datetime.utcnow().isoformat()}Z", ""]
    total_sales = 0.0
    for rep in reps:
        uname = rep.username
        total_sales += sales_by_rep[uname]
        result_summary = ", ".join(f"{k}: {v}" for k, v in results_by_rep[uname].items()) or "no calls logged"
        lines.append(
            f"- Rep '{uname}' ({rep.full_name or 'N/A'}): "
            f"{leads_by_rep[uname]} leads assigned, "
            f"{calls_by_rep[uname]} calls logged, "
            f"total sales ${sales_by_rep[uname]:,.2f}. "
            f"Call outcomes: {result_summary}."
        )
    lines.append("")
    lines.append(f"Team total sales: ${total_sales:,.2f}")
    lines.append(f"Team total leads: {db.query(models.Lead).count()}")
    lines.append(f"Team total calls logged: {db.query(models.CallLog).count()}")

    return "\n".join(lines)


@app.post("/api/manager-chat", response_model=schemas.ManagerChatResponse)
def manager_chat(
    payload: schemas.ManagerChatRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(auth.require_admin),  # admin-only endpoint
):
    """
    Lets the manager ask natural-language questions about team performance.
    Flow:
      1. Aggregate live data from SQLite (sales per rep, call outcomes, lead counts).
      2. Build a compact text context describing current team performance.
      3. Send {context + admin's question} to Gemini.
      4. Return the model's natural-language insight to the frontend.
    """
    context = _build_team_performance_context(db)

    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key or gemini_api_key == "your-gemini-api-key-here":
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY is not configured on the server. Set it in backend/.env",
        )

    try:
        import google.generativeai as genai

        genai.configure(api_key=gemini_api_key)
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        model = genai.GenerativeModel(model_name)

        system_instructions = (
            "You are an analytics assistant embedded in a medical supplies sales CRM, "
            "helping a sales manager understand their team's performance. "
            "Answer concisely and concretely using ONLY the data provided below. "
            "If the data doesn't contain the answer, say so instead of guessing. "
            "Where useful, call out the top performing rep, any reps who seem to be "
            "struggling, and concrete numbers (sales $, call counts, conversion)."
        )

        full_prompt = (
            f"{system_instructions}\n\n"
            f"=== TEAM PERFORMANCE DATA ===\n{context}\n\n"
            f"=== MANAGER'S QUESTION ===\n{payload.prompt}"
        )

        # Explicit timeout so a slow/unreachable Gemini API can never hang this
        # request indefinitely - it will raise instead, which we turn into a 502.
        response = model.generate_content(full_prompt, request_options={"timeout": 30})
        reply_text = (response.text or "").strip() if hasattr(response, "text") else str(response)

    except Exception as exc:  # noqa: BLE001 - surface a clean error to the frontend
        raise HTTPException(status_code=502, detail=f"AI assistant error: {exc}")

    return schemas.ManagerChatResponse(reply=reply_text, context_used=context)


@app.get("/")
def root():
    return {"status": "ok", "service": "Medical Supplies CRM API"}
