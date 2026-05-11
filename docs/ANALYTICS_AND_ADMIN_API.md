# Analytics & Admin Governance — API & Feature Specification

**Status:** **Implemented** in backend (analytics ingest, models, admin governance routes, creator stats, catalogue `catalogHidden`).  
**Audience:** Backend / product / admin tooling.  
**Context:** Modules: `analytics/`, `audit/`, extended `admin/`, `series`, `user`; series adds `moderationNotes`, `featured`, `catalogHidden`, episode `adminDisabled`.

---

## 1. Goals

| Area | Goal |
|------|------|
| **Analytics** | Measure engagement at **series** and **episode** level (views, completion, favorites, product-cue clicks, retention signals) without blocking playback. |
| **Admin** | Give operators **authenticated admin APIs** to discover content, enforce policy, inspect metrics, and govern catalogue visibility—separate from end-user APIs. |

---

## 2. Analytics — Conceptual Model

### 2.1 Event taxonomy (recommended)

Events are **append-only facts** (immutable). Aggregates can be computed asynchronously or via periodic jobs.

| Event type | Scope | Purpose |
|------------|--------|---------|
| `series.view` | Series | User opened series detail / started catalogue row intent (optional). |
| `series.favorite.add` / `series.favorite.remove` | Series | Align with user favorites (can mirror existing user action or derive from `POST/DELETE /user/favorite-series`). |
| `episode.play.start` | Episode | Playback initiated (episode selected in player). |
| `episode.play.progress` | Episode | Heartbeat / milestone (e.g. 25%, 50%, 75%, 100%) — batch or throttle client-side. |
| `episode.play.complete` | Episode | Watched to end (or threshold, e.g. >90% duration). |
| `episode.pause` / `episode.resume` | Episode | Optional; useful for quality-of-experience. |
| `product_cue.impression` | Episode | Cue tile visible in time window (optional; can be noisy—sample or aggregate client-side). |
| `product_cue.click` | Episode + product cue | User opened purchase link from a cue. |

**Identifiers in payloads:** `seriesId`, optional `episodeId` (episode subdoc `_id`), optional `userId` (if authenticated), `sessionId` / `deviceId` (anonymous if not logged in), timestamp, optional `clientVersion`, `platform`.

### 2.2 Aggregates (derived metrics)

Stored or computed for **admin dashboards** and light **creator** stats (future).

**Series-level:**

- `unique_viewers` (daily / weekly / all-time) — distinct `sessionId` or `userId` where applicable  
- `total_play_starts` (episodes)  
- `favorites_count` — can sync from user documents or event stream  
- `top_episodes_by_completions`  
- `product_cue_ctr` — clicks ÷ impressions (if impressions tracked)  

**Episode-level:**

- `play_starts`, `completions`, `avg_watch_seconds`, `median_watch_percent`  
- `unique_viewers`  
- `abandon_rate` — started but not completed within N hours (optional)  

### 2.3 Ingestion options (choose later)

| Approach | Pros | Cons |
|----------|------|------|
| **A. Client beacon** `POST /api/v1/events` (public or user-auth) | Simple rollout | Volume, validation, abuse |
| **B. Server-side only** (from already-authenticated actions) | Trustworthy | Misses passive watch signals without client |
| **C. Hybrid** — heartbeats from app + server events for favorites/submissions | Balanced | Two code paths |

**Privacy:** document retention, PII minimization, and whether anonymous analytics are allowed without login.

---

## 3. Proposed User / Internal Analytics APIs (non-admin)

*For later implementation; names are suggestions.*

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/analytics/events` | Optional user JWT or anonymous `sessionId` / `deviceId` | Batch ingest (`{ "events": [...] }` or one event object); idempotent `eventId`. |
| `GET` | `/api/v1/user/series/:seriesId/stats/summary` | User JWT (owner) | Creator analytics rollup for that series (counts by event type). |

*Admin read of the same metrics should use admin routes (section 5).*

---

## 4. Implemented routes (summary)

- **Catalog:** `GET /api/v1/series` — submitted series with `catalogHidden !== true`.  
- **User series:** `/api/v1/user/series` (+ `GET .../:seriesId/stats/summary`).  
- **Favorites:** `/api/v1/user/favorite-series` (mirrors `series.favorite.add/remove` analytics server-side).  
- **Analytics ingest:** `POST /api/v1/analytics/events`.  
- **Admin:** `/api/v1/admin/dashboard/summary`, `/health/deps`, `/series`, `/series/:id`, `/users`, `/analytics/*`, `/audit-log`, etc. (all require admin JWT).

---

## 5. Admin — Governance & Analytics APIs (required set)

All routes below assume **`Authorization: Bearer <admin_access_token>`** and **`authorize(ROLES.ADMIN)`** (same pattern as `GET /admin/me`). Responses SHOULD follow existing `{ success, message, data }` shape.

### 5.1 Dashboard & health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/dashboard/summary` | Totals: users, series by status, episodes count, events last 24h / 7d (once events exist). |
| `GET` | `/api/v1/admin/health/deps` | Mongo connectivity, S3 reachability (optional), config sanity (non-secret). |

### 5.2 Series governance

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/series` | Paginated list: filters `status`, `genreId`, `userId`, `q` (name), `from`/`to` (dates), `sort`. |
| `GET` | `/api/v1/admin/series/:seriesId` | Full series document + resolved creator user summary (id, phone masked, name). |
| `PATCH` | `/api/v1/admin/series/:seriesId` | Operator fields: e.g. `status` (force draft / submitted), `moderationNotes`, `featured` (if you add field), **soft-hide** flag (if added). |
| `POST` | `/api/v1/admin/series/:seriesId/action` | Structured actions: `unpublish`, `restore`, `flag` (body: `reason`, `notes`). |

### 5.3 Episode governance (within series)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/series/:seriesId/episodes` | List episodes with order, ids, duration if known, cue counts. |
| `PATCH` | `/api/v1/admin/series/:seriesId/episodes/:episodeId` | Rare operator edits: disable episode, strip cues, replace video refs (policy — define carefully). |

### 5.4 Users (creators / viewers)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/users` | Paginated: `q`, `phone`, `isActive`, date range. |
| `GET` | `/api/v1/admin/users/:userId` | Profile + counts: series, favorites count. |
| `PATCH` | `/api/v1/admin/users/:userId` | e.g. `isActive` ban / reinstate (with audit). |

### 5.5 Analytics (admin read)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/analytics/overview` | Query `from`, `to`, `granularity` (day|week); totals for DAU/WAU, plays, completions. |
| `GET` | `/api/v1/admin/analytics/series` | Top series by metric; filters `genreId`, date range. |
| `GET` | `/api/v1/admin/analytics/series/:seriesId` | Series KPIs + breakdown by episode. |
| `GET` | `/api/v1/admin/analytics/episodes/:seriesId` | Per-episode metrics table for one series. |
| `GET` | `/api/v1/admin/analytics/events/sample` | Debug: last N raw events (admin-only, redacted). |

### 5.6 Audit & accountability

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/audit-log` | Filter by `actorAdminId`, `targetType`, `targetId`, date. |
| (optional) | internal only | Persist `AdminAudit` collection on each mutating admin action. |

### 5.7 Content catalogue helpers

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/admin/genres` | Already partially under `/api/v1/admin/genres` — ensure admin list/create/edit aligns with governance. |

---

## 6. Features (non-API) to plan alongside

- **RBAC:** single `ADMIN` role may be enough initially; later `SUPERADMIN` vs `MODERATOR` if mutating powers differ.  
- **Audit trail:** who changed `series.status`, when, and reason.  
- **Idempotency:** event ingest with `eventId` UUID to dedupe.  
- **Rate limits:** `/analytics/events` and admin list endpoints.  
- **Exports:** `GET .../export?format=csv` for compliance (phase 2).  

---

## 7. Suggested implementation phases

| Phase | Deliverable |
|-------|-------------|
| **P0** | `AdminAudit` model + `GET/PATCH` admin series list/detail + user `isActive` ban. |
| **P1** | Event collection API + Mongo `AnalyticsEvent` (or time-series) + admin overview + series/episode breakdown. |
| **P2** | Aggregates cache, CSV export, moderator role, featured series in catalogue. |

---

## 8. Open decisions (before coding)

1. Anonymous analytics vs logged-in-only.  
2. Episode duration for completion: client-reported vs server trust boundaries.  
3. Whether **product cue** analytics are sampled to reduce cost.  
4. Whether admin can **hard-delete** media in S3 or only **unpublish** in DB.  

---

*Implementation landed in `backend/src` — extend admin-panel / mobile clients to call these endpoints as needed.*
