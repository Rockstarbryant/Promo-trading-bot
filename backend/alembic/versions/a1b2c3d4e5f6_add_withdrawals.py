"""add withdrawals

Revision ID: a1b2c3d4e5f6
Revises: f95e0a147199
Create Date: 2026-09-26

Adds:
- binance_accounts.withdrawal_enabled (explicit per-account opt-in,
  separate from the Binance-reported can_withdraw key permission)
- withdrawals table (audit trail of every withdrawal request submitted
  through POST /api/accounts/{id}/withdrawals)
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "f95e0a147199"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "binance_accounts",
        sa.Column("withdrawal_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "withdrawals",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("binance_account_id", sa.String(length=36), sa.ForeignKey("binance_accounts.id"), nullable=False),
        sa.Column("asset", sa.String(length=20), nullable=False),
        sa.Column("network", sa.String(length=50), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("address_tag", sa.String(length=100), nullable=True),
        sa.Column("amount", sa.Numeric(24, 8), nullable=False),
        sa.Column(
            "status",
            sa.Enum("PENDING", "SUBMITTED", "FAILED", name="withdrawalstatus"),
            nullable=False,
            server_default="PENDING",
        ),
        sa.Column("binance_withdraw_id", sa.String(length=64), nullable=True),
        sa.Column("binance_status", sa.String(length=50), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_withdrawals_account", "withdrawals", ["binance_account_id"])


def downgrade() -> None:
    op.drop_index("ix_withdrawals_account", table_name="withdrawals")
    op.drop_table("withdrawals")
    op.execute("DROP TYPE IF EXISTS withdrawalstatus")
    op.drop_column("binance_accounts", "withdrawal_enabled")
