"""initial schema

Revision ID: f95e0a147199
Revises:
Create Date: 2026-09-12

This initial revision creates the full schema directly from the ORM
metadata (Base.metadata.create_all) rather than hand-written op.create_table
calls, since there is no prior schema to diff against. All subsequent
migrations should be generated incrementally with
`alembic revision --autogenerate` against this baseline.
"""
from alembic import op

from app.db.base import Base
from app.db.models import models  # noqa: F401 registers all tables on Base.metadata

revision = "f95e0a147199"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
