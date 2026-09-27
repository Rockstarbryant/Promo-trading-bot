"""add balance cache and rate limit state

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-09-27

Backs the fix for repeated Binance 418 IP bans caused by every bot on an
account (and every backend replica) independently polling
GET /api/v3/account with no caching or shared backoff. See
app/services/binance/account_cache.py.

Adds:
- binance_accounts.balance_cache_json / balance_cache_at — short-TTL shared
  cache of the last fetched raw balances for an account.
- binance_rate_limit_state — single-row (id="global") cluster-wide circuit
  breaker recording how long Binance is currently rate-limiting this IP.
"""
from alembic import op
import sqlalchemy as sa

revision = "b7c8d9e0f1a2"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("binance_accounts", sa.Column("balance_cache_json", sa.Text(), nullable=True))
    op.add_column("binance_accounts", sa.Column("balance_cache_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "binance_rate_limit_state",
        sa.Column("id", sa.String(length=20), primary_key=True),
        sa.Column("banned_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("binance_rate_limit_state")
    op.drop_column("binance_accounts", "balance_cache_at")
    op.drop_column("binance_accounts", "balance_cache_json")
