# Connecting a Binance account

1. In Binance, create a new API key (Account -> API Management).
2. Enable **only**:
   - "Enable Reading"
   - "Enable Spot & Margin Trading" (Spot only is used by this app)
3. **Do not enable withdrawals.** This application never asks for
   withdrawal permission and has no withdrawal endpoints — enabling it on
   the key only creates unnecessary risk. If a key with withdrawal
   permission is connected, the app will refuse to run it in LIVE mode.
4. If your Binance account supports IP restrictions on API keys, restrict
   the key to your backend's outbound IP address.
5. In the app, go to **Accounts -> Connect Binance Account** (or
   `POST /api/accounts`) and paste the API key and secret. The backend
   immediately calls Binance's `/api/v3/account` endpoint to verify the key
   and record its actual permissions (`canTrade`, `canWithdraw`) — it does
   not trust anything you type about permissions.
6. The API secret is encrypted (Fernet/AES) before it is written to the
   database and is never returned by any API response afterward.

## Rotating or revoking a key

Delete the account in the app (`DELETE /api/accounts/{id}`) and delete/
rotate the key on Binance's side. Any bots still referencing a deleted
account will fail their next tick's account check and pause automatically.

## Rate limits

The backend does not currently implement its own Binance rate-limit
tracking beyond reacting to HTTP 429/418 responses
(`BinanceRateLimitError`). If you run many bots against the same account,
be mindful of Binance's request-weight limits per API key.
