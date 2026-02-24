# Link Telegram – Web platform integration

This document describes how to add the **“Link Telegram”** flow to your web platform so that web users can link their account to the bot. After linking, both web and bot use the same user row (same deposit wallet, balance, rental history).

---

## Flow overview

1. User is logged in on the web → opens **Account** (or Settings).
2. User clicks **“Link Telegram”**.
3. Your backend generates a **short-lived one-time token**, stores it (e.g. hashed), and returns the Telegram deep link.
4. Frontend opens the link → Telegram opens the bot with `https://t.me/<BOT>?start=<TOKEN>`.
5. Bot receives `/start <TOKEN>`, calls your backend **link-from-web** API with `telegram_id` + token.
6. Backend validates the token, sets `telegram_id` (and optionally `telegram_username`) on the **current web user**, marks token as used.
7. Bot replies “Linked” and shows the main menu. From then on, that `telegram_id` resolves to the same user on the backend, so data is shared.

---

## Backend API your platform must implement

### 1. Generate link token (for the “Link Telegram” button)

**Request**

- **Method:** `POST`
- **Path:** e.g. `/api/account/telegram/generate-link-token` (or `/api/account/telegram/link-token`)
- **Auth:** Required (session/cookie or Bearer). Identifies the **web user** to link.
- **Body:** none, or `{}`.

**Response (200)**

```json
{
  "link_token": "a1b2c3d4e5f6...",
  "telegram_link": "https://t.me/YourBotUsername?start=a1b2c3d4e5f6...",
  "expires_in_seconds": 600
}
```

**Backend logic (pseudo)**

- Ensure user is logged in; get `user_id`.
- Generate a cryptographically random token (e.g. 32 bytes, hex or base64url).
- Store in DB, e.g. table `telegram_link_tokens`:
  - `user_id`
  - `token_hash` (e.g. SHA-256 of token)
  - `expires_at` (e.g. `now() + 10 minutes`)
  - `used_at` (NULL)
- Build `telegram_link = "https://t.me/" + BOT_USERNAME + "?start=" + token`.
- Return `{ link_token, telegram_link, expires_in_seconds }`.

**Notes**

- Return the **raw** token in `link_token` only if the frontend needs it; otherwise you can return only `telegram_link`.
- Bot username can come from env, e.g. `TELEGRAM_BOT_USERNAME` or from your config.

---

### 2. Complete link (called by the bot)

**Request**

- **Method:** `POST`
- **Path:** `/api/account/telegram/link-from-web` (or, as in tron-energy, `/api/auth/telegram/link` with body `{ code, telegram_id, telegram_username }`)
- **Auth:** Optional (e.g. shared secret or no auth; the token is the proof). Do **not** rely on Telegram only – always validate the token.
- **Body (JSON):**

```json
{
  "telegram_id": 123456789,
  "telegram_username": "johndoe",
  "link_token": "a1b2c3d4e5f6..."
}
```

**Response (200)**

```json
{
  "linked": true,
  "user_id": 1,
  "wallet_address": "T..."
}
```

**Backend logic (pseudo)**

- Hash the incoming `link_token` the same way you stored it.
- Find a row in `telegram_link_tokens` where `token_hash` matches, `expires_at > now()`, and `used_at IS NULL`. If not found → 400/404, body e.g. `{ "code": "expired" }` or `"already_used"`.
- Get `user_id` from that row.
- Optional: if another user already has this `telegram_id`, return 409 “already linked” (or unlink the old user first – your product decision).
- Update your `users` table: set `telegram_id` and optionally `telegram_username`, `telegram_linked_at` for that `user_id`.
- Mark the token as used: `used_at = now()`.
- Return `{ linked: true, user_id, wallet_address }` (wallet from your wallets table for that user).

**Error responses**

- **400 / 404** – Invalid or expired token. Body e.g. `{ "code": "expired" }` or `"already_used"`. Bot will show “link expired or already used”.
- **409** – Telegram account already linked to another user. Body e.g. `{ "message": "Already linked" }`. Bot will show “already linked”.

---

## Frontend: “Link Telegram” button (sample)

Your account page should call the generate-token API, then open the returned Telegram link.

**Example (React / fetch)**

```jsx
async function handleLinkTelegram() {
  setLinking(true);
  setError(null);
  try {
    const res = await fetch('/api/account/telegram/generate-link-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to get link');
    // Open Telegram (same tab or new tab)
    window.open(data.telegram_link, '_blank');
    setMessage('Open Telegram and tap “Start” in the chat with the bot to complete linking.');
  } catch (e) {
    setError(e.message);
  } finally {
    setLinking(false);
  }
}

// In JSX:
<button onClick={handleLinkTelegram} disabled={linking}>
  {linking ? 'Preparing link…' : 'Link Telegram'}
</button>
```

**Example (plain HTML + JS)**

```html
<button id="link-telegram">Link Telegram</button>
<p id="message"></p>

<script>
document.getElementById('link-telegram').onclick = async function () {
  const btn = this;
  const msg = document.getElementById('message');
  btn.disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch('/api/account/telegram/generate-link-token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Failed to get link');
    window.open(data.telegram_link, '_blank');
    msg.textContent = 'Open Telegram and tap Start in the bot chat to complete linking.';
  } catch (e) {
    msg.textContent = 'Error: ' + e.message;
  } finally {
    btn.disabled = false;
  }
};
</script>
```

---

## Environment / config (web platform)

- **Bot username** – Used to build `telegram_link`. Example: `TELEGRAM_BOT_USERNAME=TronEnergyRentBot`.
- **Token TTL** – e.g. 10 minutes for `expires_at`.
- **Same API base URL** – The bot already uses `NEXT_PUBLIC_APP_URL` (or your API base); the bot will call `POST ${API_BASE}/account/telegram/link-from-web`. Ensure this URL is reachable from the server running the bot (same backend as the web).

---

## Database (minimal)

**Table: `telegram_link_tokens`**

| Column       | Type        | Description                    |
|-------------|-------------|--------------------------------|
| id          | primary key|                                |
| user_id     | FK users    | Web user who requested link   |
| token_hash  | string      | SHA-256 (or similar) of token  |
| expires_at  | timestamp   | Token validity end             |
| used_at     | timestamp   | NULL until link completed      |

**Table: `users`**

Ensure columns exist:

- `telegram_id` (bigint, unique or indexed)
- `telegram_username` (string, optional)
- `telegram_linked_at` (timestamp, optional)

After linking, the bot’s existing calls (e.g. `GET /api/wallet/info?telegram_id=...`) must resolve `telegram_id` to this user so that wallet, balance, and rental history are shared.

---

## Summary

| Component        | Responsibility |
|-----------------|----------------|
| Web account page| “Link Telegram” button → POST generate-link-token → open `telegram_link` |
| Backend         | Generate token, store hash, return link; validate token in link-from-web and set user.telegram_id |
| Bot             | On `/start <token>`, POST link-from-web with telegram_id + token; show success/error (already implemented in this repo) |

Once the backend implements the two endpoints and the frontend adds the button, the flow is end-to-end and both web and bot share the same user row and data.
