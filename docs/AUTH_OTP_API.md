# User phone OTP (Msg91)

## Flow

1. `POST /api/v1/auth/user/send-otp` with `{ "phone": "9876543210" }` (10-digit Indian mobile).
2. User receives SMS via Msg91 Flow (or OTP is logged server-side if `MSG91_AUTH_KEY` is unset).
3. `POST /api/v1/auth/user/verify-otp` with `{ "phone": "9876543210", "otp": "482910" }`.
4. Response includes `token`, `refreshToken`, `user`, `isNewUser`.

OTP is **6 digits**, stored in memory for **5 minutes**, one-time use (except demo account below).

## Play Store / test account

For Google Play review and QA, a fixed demo login is enabled by default:

| Setting | Default |
|---------|---------|
| Phone | `9999999999` (10 digits, no +91) |
| OTP | `123456` |
| SMS | Not sent for demo number |

1. `POST /api/v1/auth/user/send-otp` with `{ "phone": "9999999999" }` — optional; demo OTP always works.
2. `POST /api/v1/auth/user/verify-otp` with `{ "phone": "9999999999", "otp": "123456" }`.

Delete-account OTP for the demo user also accepts `123456`.

Disable after review: `DEMO_OTP_ENABLED=false` in production `.env`.

## Environment

```env
JWT_SECRET=...

MSG91_AUTH_KEY=
MSG91_FLOW_ID=
MSG91_SENDER_ID=          # optional
MSG91_OTP_VAR_NAME=var    # optional; must match Msg91 flow template variable

# Play Store / QA (optional overrides)
DEMO_OTP_ENABLED=true
DEMO_PHONE=9999999999
DEMO_OTP=123456
```

Without Msg91 keys, OTP is printed to the server console for local testing.
