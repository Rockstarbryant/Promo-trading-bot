"""
Binance account connection endpoints.

Security: the API secret is encrypted before it ever touches the database,
and BinanceAccountOut never includes it. Withdrawal permission is only ever
displayed/warned about — this app has no withdrawal endpoints anywhere.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.models import BinanceAccount
from app.db.base import utcnow
from app.schemas.schemas import BinanceAccountCreate, BinanceAccountOut, AccountBalanceOut, AssetBalanceOut
from app.core.security import get_current_user_id
from app.core.encryption import get_secret_box
from app.services.binance.client import BinanceSpotClient
from app.services.binance.exceptions import BinanceError
from app.services.binance.balances import fetch_balances_with_usdt_value

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
    via its ASSETUSDT ticker). Read-only."""
    account = await _get_owned_account(account_id, user_id, db)
    secret = get_secret_box().decrypt(account.encrypted_api_secret)
    client = BinanceSpotClient(api_key=account.api_key, api_secret=secret)
    try:
        balances, total = await fetch_balances_with_usdt_value(client)
        return AccountBalanceOut(
            account_id=account.id,
            label=account.label,
            balances=[AssetBalanceOut(**b) for b in balances],
            total_usdt_value=total,
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
