# AI product-cue ingest — backend change request (UnsceneAI)

**Audience:** Backend / platform owner (you).  
**Related:** [AI_PRODUCT_CUE_SERVICE.md](./AI_PRODUCT_CUE_SERVICE.md) (send to AI vendor).

**Status:** Implemented in `backend/src` (v1 orchestration). AI service URL can be empty until the model API is ready.

---

## 1. Problem

Creators upload episodes + product photos/links via the app. Today `episode.productCues` stay **empty** until manual seed scripts run. The video player and Shop The Look UI already read `productCues`; we need automatic population from the AI service.

---

## 2. What was added

| Area | Change |
|------|--------|
| **Series model** | `aiProcessingStatus`, `aiJobId`, `aiError`, `aiRequestedAt`, `aiCompletedAt` |
| **Constants** | `AI_PROCESSING_STATUS` enum in `config/constants.js` |
| **Env** | `AI_SERVICE_URL`, `AI_CALLBACK_PUBLIC_BASE_URL`, `AI_INGEST_ENABLED` (optional: `AI_SERVICE_API_KEY`, `AI_WEBHOOK_SECRET`) |
| **Util** | `common/utils/productCues.js` — shared cue validation (used by series + AI ingest) |
| **Service** | `common/services/aiIngest.service.js` — build payload, POST job, apply callback |
| **Routes** | `POST /api/v1/internal/ai/product-cues/callback` (webhook) |
| **Routes** | `POST /api/v1/user/series/:seriesId/ai/analyze` (manual retry, owner only) |
| **Trigger** | On `PATCH` series with `status: "submitted"` → queue AI job (if ingest enabled + URL set) |

---

## 3. Environment variables

Add to `backend/src/.env` (or deployment secrets):

```env
# Master switch (default true). Set false to disable all AI calls.
AI_INGEST_ENABLED=true

# AI service base URL (no trailing slash). Empty = skip ingest, status stays idle/skipped.
AI_SERVICE_URL=https://ai.your-domain.com

# Public API base used to build callbackUrl (defaults to http://localhost:5000)
AI_CALLBACK_PUBLIC_BASE_URL=https://api.unscene.in

# Optional — only enable if you want auth between services:
# AI_SERVICE_API_KEY=your-shared-secret
# AI_WEBHOOK_SECRET=your-webhook-secret
```

**Before AI is live:** leave `AI_SERVICE_URL` empty or set `AI_INGEST_ENABLED=false`. Submit flow still works; cues remain empty until AI is connected or seeded manually.

---

## 4. Flow

```
Creator submits series (status=submitted)
    → backend validates episodes + products exist
    → aiProcessingStatus = pending → processing
    → POST {AI_SERVICE_URL}/v1/analyze/jobs
         → 202: wait for webhook
         → 200 + body: apply cues immediately (dev)
    → AI service POSTs callback
    → backend writes productCues per episode (+ optional timestamp JSON on S3)
    → aiProcessingStatus = completed | failed
```

---

## 5. API surface (your backend)

### Internal webhook (AI service only)

`POST /api/v1/internal/ai/product-cues/callback`  
Header: `X-AI-Webhook-Secret`

Body: see [AI_PRODUCT_CUE_SERVICE.md §5](./AI_PRODUCT_CUE_SERVICE.md).

### Creator manual retry

`POST /api/v1/user/series/:seriesId/ai/analyze`  
Auth: user JWT, series owner.

Use when ingest failed or after fixing media. Requires at least one episode with `videoUrl` and one product.

### Series fields exposed to app

On `GET /api/v1/user/series/:id` (and list), documents now include:

| Field | Values |
|-------|--------|
| `aiProcessingStatus` | `idle`, `pending`, `processing`, `completed`, `failed`, `skipped` |
| `aiJobId` | UUID string when job started |
| `aiError` | Last error message if `failed` |
| `aiRequestedAt` / `aiCompletedAt` | ISO dates |

**Suggested app UX (follow-up):** After submit, poll series detail until `aiProcessingStatus` is `completed` or `failed`; show “Processing shoppable moments…” while `pending` / `processing`.

---

## 6. Preconditions before queueing

The ingest service skips or fails fast when:

- `AI_INGEST_ENABLED` is false, or `AI_SERVICE_URL` is empty → `skipped`
- Series has no episodes or no products
- Any episode missing `videoUrl`

On submit, queue runs in the background (does not block the PATCH response).

---

## 7. Operational checklist

- [ ] Share [AI_PRODUCT_CUE_SERVICE.md](./AI_PRODUCT_CUE_SERVICE.md) with AI team
- [ ] Agree staging URLs and API keys
- [ ] Set production env vars on API server
- [ ] Allow AI service egress to `videoUrl` / `imageUrl` (CloudFront/S3)
- [ ] Allow AI service ingress to `callbackUrl` (firewall / API gateway)
- [ ] Test one series end-to-end in staging
- [ ] (Optional) Mobile: poll `aiProcessingStatus` after submit
- [ ] (Optional) Admin panel: show `aiProcessingStatus` + retry button

---

## 8. Rollback

- Set `AI_INGEST_ENABLED=false` — no new jobs; existing cues unchanged.
- Manual cues still work via admin governance `PATCH` episode `productCues` and seed scripts (`npm run seed:product-cues`).

---

## 9. Files touched (reference)

```
backend/src/config/constants.js
backend/src/config/env.js
backend/src/modules/series/series.model.js
backend/src/modules/series/series.service.js
backend/src/modules/series/series.controller.js
backend/src/modules/series/series.routes.js
backend/src/common/utils/productCues.js
backend/src/common/services/aiIngest.service.js
backend/src/common/middleware/aiWebhook.middleware.js
backend/src/modules/ai/ai.controller.js
backend/src/modules/ai/ai.routes.js
backend/src/app.js
backend/docs/AI_PRODUCT_CUE_SERVICE.md
backend/docs/AI_INGEST_BACKEND.md
```
