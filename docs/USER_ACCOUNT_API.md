# User account API

## Delete account

Requires a valid user access token (`Authorization: Bearer <token>`).

### 1. Send OTP

`POST /api/v1/user/me/delete-account/send-otp`

Sends a 6-digit OTP to the authenticated user's registered mobile number (same flow as login OTP).

**Response:** `{ success: true, message: "OTP sent successfully.", data: null }`

### 2. Confirm deletion

`DELETE /api/v1/user/me`

**Body:**

```json
{ "otp": "482910" }
```

**On success:** `{ success: true, message: "Account deleted", data: { deleted: true } }`

**Removes:**

- User profile and document
- Favorites (on user document)
- Watch progress for the user and for series they created
- In-app notifications
- Analytics events tied to `userId`
- Creator series (MongoDB) and associated S3 objects (best-effort)

All existing access and refresh tokens become invalid because the user no longer exists.

**Errors:** `400` invalid/expired OTP; `404` user not found.
