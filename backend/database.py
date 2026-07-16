"""
database.py
------------
Sets up the SQLAlchemy engine, session factory, and declarative base for the
Medical Supplies CRM. Uses SQLite for simplicity/local development.

To switch to Postgres/MySQL later, just change SQLALCHEMY_DATABASE_URL and
remove the SQLite-only `connect_args`.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Use the environment variable DATABASE_URL if available (for production like Render/Neon)
# Fallback to local SQLite if not found.
# Note: some providers use postgres:// which SQLAlchemy 1.4+ expects as postgresql://
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./medcrm.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# `check_same_thread` is only needed for SQLite.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """
    FastAPI dependency that yields a DB session and guarantees it is
    closed after the request finishes, even if an exception is raised.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
