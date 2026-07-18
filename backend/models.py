"""
models.py
---------
SQLAlchemy ORM models for the Medical Supplies CRM.

Entities:
- User: sales reps and admins (managers).
- Lead: a prospective/existing medical facility contact, assigned to a rep.
- CallLog: a record of a call made against a Lead, with outcome + sales amount.
"""

import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    ForeignKey,
    DateTime,
    Enum as SAEnum,
)
from sqlalchemy.orm import relationship

from database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"        # Manager - full visibility
    SALES_REP = "sales_rep"  # Rep - restricted to own data


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.SALES_REP)
    full_name = Column(String, nullable=True)

    leads = relationship("Lead", back_populates="assigned_rep", cascade="all, delete-orphan")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    facility_type = Column(String, nullable=False)  # e.g. Hospital, Clinic, Pharmacy
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    followup_date = Column(DateTime, nullable=True)
    is_ignored = Column(Boolean, default=False, nullable=False)
    ignore_reason = Column(String, nullable=True)

    # FK -> User.id. This is the core of the row-level access control:
    # sales_rep users may only ever see/create leads where assigned_to == their own id.
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=False)

    assigned_rep = relationship("User", back_populates="leads")
    call_logs = relationship("CallLog", back_populates="lead", cascade="all, delete-orphan")


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    call_result = Column(String, nullable=False)  # e.g. "Interested", "No Answer", "Sold", "Rejected"
    sales_amount = Column(Float, nullable=False, default=0.0)
    notes = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="call_logs")
