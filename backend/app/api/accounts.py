"""
Binance account connection endpoints.

Security: the API secret is encrypted before it ever touches the database,
and BinanceAccountOut never includes it.

Withdrawals: this module is the ONLY place in the codebase that calls
BinanceSpotClient.withdraw(). It is never called by the trading workers.
A withdrawal request is only accepted when ALL of these hold:
  1. The account belongs to the authenticated user.
  2. Binance itself reports canWithdraw=true for the connected key
     (account.can_withdraw — refreshed whenever the key is (re)verified,
     never trusted from client input).
  3. The user has separately, explicitly opted the account in via
     PATCH /api/accounts/{id}/withdrawal-settings (account.withdrawal_enabled).
Every accepted or rejected withdrawal attempt is written to AuditLog.
"""
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import BinanceAccount, Withdrawal, WithdrawalStatus, AuditLog
from app.db.base import utcnow
from app.schemas.schemas import (
    BinanceAccountCreate, BinanceAccountOut, AccountBalanceOut, AssetBalanceOut,
    WithdrawalSettingsUpdate, WithdrawalCreate, WithdrawalOut,
)
from app.core.security import get_current_user_id
from app.core.encryption import get_secret_box
from app.services.binance.client import BinanceSpotClient
from app.services.binance.exceptions import BinanceError
from app.services.binance.balances import price_non_zero_balances
from app.services.binance.account_cache import get_account_snapshot

router = APIRouter(prefix="/api/accounts", tags=["accounts"])


@router.post("", response_model=BinanceAccountOut, status_code=status.HTTP_201_CREATED)
async def connect_account(
    payload: BinanceAccountCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    # Verify the credentials actually work and inspect permissions before
    # ever storing them.
    client = BinanceSpotClient(api_key=payload.api_key, api_secret=payload.api_secret)
    try:
        account_info = await client.get_account()
    except BinanceError as exc:
        raise HTTPException(status_code=400, detail=f"Could not verify Binance credentials: {exc.message}") from exc
    finally:
        await client.aclose()

    can_trade = bool(account_info.get("canTrade"))
    can_withdraw = bool(account_info.get("canWithdraw"))

    box = get_secret_box()
    account = BinanceAccount(
        user_id=user_id,
        label=payload.label,
        api_key=payload.api_key,
        encrypted_api_secret=box.encrypt(payload.api_secret),
        can_trade=can_trade,
        can_withdraw=can_withdraw,
        last_verified_at=utcnow(),
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.get("", response_model=list[BinanceAccountOut])
async def list_accounts(user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(BinanceAccount).where(BinanceAccount.user_id == user_id))
    return result.scalars().all()


async def _get_owned_account(account_id: str, user_id: str, db: AsyncSession) -> BinanceAccount:
    account = (
        await db.execute(
            select(BinanceAccount).where(BinanceAccount.id == account_id, BinanceAccount.user_id == user_id)
        )
    ).scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account


@router.get("/{account_id}/balance", response_model=AccountBalanceOut)
async def get_account_balance(account_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    """Live Binance spot balances for this account, plus a best-effort
    total value in USDT (stablecoins counted 1:1, everything else priced
    via its ASSETUSDT ticker). Read-only.

    Goes through account_cache.get_account_snapshot(), which serves a
    short-lived shared cache and backs off entirely while Binance is
    rate-limiting this IP — see that module for why. When cached/backed-off
    data is returned, `error` carries an explanatory note rather than a
    hard failure, since we may still have a perfectly good last-known
    balance to show."""
    account = await _get_owned_account(account_id, user_id, db)
    secret = get_secret_box().decrypt(account.encrypted_api_secret)
    client = BinanceSpotClient(api_key=account.api_key, api_secret=secret)
    try:
        non_zero, note, _from_cache = await get_account_snapshot(db, account, client)
        if not non_zero and note:
            return AccountBalanceOut(account_id=account.id, label=account.label, balances=[], total_usdt_value=None, error=note)
        balances, total = await price_non_zero_balances(non_zero, client)
        return AccountBalanceOut(
            account_id=account.id,
            label=account.label,
            balances=[AssetBalanceOut(**b) for b in balances],
            total_usdt_value=total,
            error=note,
        )
    except BinanceError as exc:
        return AccountBalanceOut(account_id=account.id, label=account.label, balances=[], total_usdt_value=None, error=exc.message)
    finally:
        await client.aclose()


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(account_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    account = await _get_owned_account(account_id, user_id, db)
    await db.delete(account)
    await db.commit()


async def _audit(db: AsyncSession, user_id: str, action: str, account: BinanceAccount, **metadata) -> None:
    db.add(AuditLog(
        user_id=user_id, action=action, resource_type="binance_account",
        resource_id=account.id, metadata_=metadata,
    ))
    await db.commit()


@router.patch("/{account_id}/withdrawal-settings", response_model=BinanceAccountOut)
async def update_withdrawal_settings(
    account_id: str,
    payload: WithdrawalSettingsUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Explicit per-account opt-in/opt-out for the withdrawal endpoints.
    This alone does not grant withdrawal ability — the connected Binance
    key must also actually have withdrawal permission enabled."""
    account = await _get_owned_account(account_id, user_id, db)
    if payload.withdrawal_enabled and not account.can_withdraw:
        raise HTTPException(
            status_code=400,
            detail=(
                "This Binance API key does not have withdrawal permission enabled. "
                "Enable it on Binance's API Management page, then reconnect this "
                "account so the permission can be re-verified, before turning this on."
            ),
        )
    account.withdrawal_enabled = payload.withdrawal_enabled
    await db.commit()
    await db.refresh(account)
    await _audit(
        db, user_id, "withdrawal_settings.updated", account,
        withdrawal_enabled=payload.withdrawal_enabled,
    )
    return account


@router.post("/{account_id}/withdrawals", response_model=WithdrawalOut, status_code=status.HTTP_201_CREATED)
async def create_withdrawal(
    account_id: str,
    payload: WithdrawalCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
):
    """Submit a withdrawal via Binance's /sapi/v1/capital/withdraw/apply.

    Binance's own account-level protections (address whitelist, email/2FA
    confirmation if required by the account's settings) still apply and are
    not bypassed by this endpoint — this only forwards a signed request."""
    account = await _get_owned_account(account_id, user_id, db)

    if not account.is_active:
        raise HTTPException(status_code=400, detail="Account is not active")
    if not account.can_withdraw:
        raise HTTPException(status_code=403, detail="Connected Binance key does not have withdrawal permission")
    if not account.withdrawal_enabled:
        raise HTTPException(
            status_code=403,
            detail="Withdrawals are not enabled for this account. Enable them first via withdrawal-settings.",
        )

    secret = get_secret_box().decrypt(account.encrypted_api_secret)
    client = BinanceSpotClient(api_key=account.api_key, api_secret=secret)

    withdrawal = Withdrawal(
        user_id=user_id, binance_account_id=account.id,
        asset=payload.asset, network=payload.network, address=payload.address,
        address_tag=payload.address_tag, amount=payload.amount,
        status=WithdrawalStatus.PENDING,
    )
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)

    try:
        result = await client.withdraw(
            coin=payload.asset,
            address=payload.address,
            amount=str(payload.amount),
            network=payload.network,
            address_tag=payload.address_tag,
            withdraw_order_id=withdrawal.id,
        )
        withdrawal.status = WithdrawalStatus.SUBMITTED
        withdrawal.binance_withdraw_id = result.get("id")
        await db.commit()
        await db.refresh(withdrawal)
        await _audit(
            db, user_id, "withdrawal.submitted", account,
            withdrawal_id=withdrawal.id, asset=payload.asset, amount=str(payload.amount),
        )
    except BinanceError as exc:
        withdrawal.status = WithdrawalStatus.FAILED
        withdrawal.failure_reason = exc.message
        await db.commit()
        await db.refresh(withdrawal)
        await _audit(
            db, user_id, "withdrawal.failed", account,
            withdrawal_id=withdrawal.id, asset=payload.asset, amount=str(payload.amount),
            reason=exc.message,
        )
        raise HTTPException(status_code=400, detail=f"Binance rejected the withdrawal: {exc.message}") from exc
    finally:
        await client.aclose()

    return withdrawal


@router.get("/{account_id}/withdrawals", response_model=list[WithdrawalOut])
async def list_withdrawals(account_id: str, user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db)):
    account = await _get_owned_account(account_id, user_id, db)
    result = await db.execute(
        select(Withdrawal).where(Withdrawal.binance_account_id == account.id).order_by(Withdrawal.created_at.desc())
    )
    return result.scalars().all()


@router.get("/{account_id}/withdrawals/{withdrawal_id}", response_model=WithdrawalOut)
async def get_withdrawal(
    account_id: str, withdrawal_id: str,
    user_id: str = Depends(get_current_user_id), db: AsyncSession = Depends(get_db),
):
    """Returns the stored record, refreshed from Binance's withdrawal
    history when possible (best-effort — a Binance error here just falls
    back to the last known local status rather than failing the request)."""
    account = await _get_owned_account(account_id, user_id, db)
    withdrawal = (
        await db.execute(
            select(Withdrawal).where(Withdrawal.id == withdrawal_id, Withdrawal.binance_account_id == account.id)
        )
    ).scalar_one_or_none()
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")

    if withdrawal.status == WithdrawalStatus.SUBMITTED:
        secret = get_secret_box().decrypt(account.encrypted_api_secret)
        client = BinanceSpotClient(api_key=account.api_key, api_secret=secret)
        try:
            history = await client.get_withdraw_history(coin=withdrawal.asset, withdraw_order_id=withdrawal.id)
            if history:
                withdrawal.binance_status = str(history[0].get("status"))
                await db.commit()
                await db.refresh(withdrawal)
        except BinanceError:
            pass  # best-effort refresh only
        finally:
            await client.aclose()

    return withdrawal
