"""
schemas.py
----------
Pydantic (v2) schemas used for request validation and response serialization.

Notable detail: `LeadOut` computes `whatsapp_link` and `call_link` from the
lead's phone number so the frontend can render one-click action buttons
without doing any string formatting itself.
"""

import re
from datetime import datetime
from typing import Optional, List

from pydantic import BaseModel, ConfigDict, field_validator, computed_field

from models import UserRole


# ---------------------------------------------------------------------------
# Auth / User
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.SALES_REP
    full_name: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: UserRole
    full_name: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    username: str
    user_id: int


class TokenData(BaseModel):
    username: Optional[str] = None


# ---------------------------------------------------------------------------
# CallLog
# ---------------------------------------------------------------------------

class CallLogCreate(BaseModel):
    lead_id: int
    call_result: str
    sales_amount: float = 0.0
    notes: Optional[str] = None
    next_followup: Optional[datetime] = None


class CallLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    lead_id: int
    call_result: str
    sales_amount: float
    notes: Optional[str] = None
    timestamp: datetime
    lead_name: Optional[str] = None
    rep_username: Optional[str] = None


# ---------------------------------------------------------------------------
# Lead
# ---------------------------------------------------------------------------

class LeadCreate(BaseModel):
    name: str
    phone: str
    facility_type: str
    notes: Optional[str] = None
    # Only used when an ADMIN creates a lead on behalf of a rep.
    # Sales reps may not set this - the backend forces it to their own id.
    assigned_to: Optional[int] = None

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str) -> str:
        if not re.sub(r"\D", "", v):
            raise ValueError("phone must contain digits")
        return v.strip()


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    facility_type: str
    notes: Optional[str] = None
    created_at: datetime
    followup_date: Optional[datetime] = None
    assigned_to: int
    assigned_rep_username: Optional[str] = None
    latest_call_log: Optional[CallLogOut] = None
    is_ignored: bool = False
    ignore_reason: Optional[str] = None

    @computed_field
    @property
    def whatsapp_link(self) -> str:
        """wa.me deep link - handles Egyptian numbers and stripped leading zeros."""
        phone_str = self.phone or ""
        digits = re.sub(r"\D", "", phone_str)
        if digits.startswith("00"):
            digits = digits[2:]
        if digits.startswith("01") and len(digits) == 11:
            digits = "2" + digits
        elif len(digits) == 10 and digits.startswith("1"):
            # Excel sometimes strips the leading zero from 01...
            digits = "20" + digits
        return f"https://wa.me/{digits}"

    @computed_field
    @property
    def call_link(self) -> str:
        """tel: deep link, preserves a leading '+' for international numbers."""
        phone_str = self.phone or ""
        digits = re.sub(r"[^\d+]", "", phone_str)
        return f"tel:{digits}"


class LeadUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    facility_type: Optional[str] = None
    notes: Optional[str] = None
    call_result: Optional[str] = None
    sales_amount: Optional[float] = 0.0
    call_notes: Optional[str] = None
    next_followup: Optional[datetime] = None
    is_ignored: Optional[bool] = None
    ignore_reason: Optional[str] = None
    assigned_to: Optional[int] = None

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        if not re.sub(r"\D", "", v):
            raise ValueError("phone must contain digits")
        return v.strip()


# ---------------------------------------------------------------------------
# Manager AI Assistant
# ---------------------------------------------------------------------------

class ManagerChatRequest(BaseModel):
    prompt: str


class ManagerChatResponse(BaseModel):
    reply: str
    context_used: str
