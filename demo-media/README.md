# demo-media

Media used by `npm run demo:series-flow` (`src/scripts/demoSeriesEpisodeFlow.js`).

| File | Role | Product category |
|------|------|------------------|
| `video.mp4` | Episode video | — |
| `shirt.png` | Product image | `clothing` |
| `earrings.png` | Product image | `non-clothing` |
| `headphones.png` | Product image | `non-clothing` |
| `specs.png` | Product image | `non-clothing` |

The product images are committed. `video.mp4` is not — it is too large for the repo.
Provide it one of three ways:

```bash
# 1. copy your clip into this folder
scp video.mp4 ubuntu@<ec2-host>:~/unsceneAi/backend/demo-media/

# 2. point at any local path
DEMO_VIDEO=/home/ubuntu/clips/episode1.mp4 bash scripts/demo-series-flow.sh

# 3. point at an https URL (downloaded to /tmp before upload)
DEMO_VIDEO=https://cdn.example.com/episode1.mp4 bash scripts/demo-series-flow.sh
```

With no video present the script falls back to the hosted VTO demo clip so it still runs
on a fresh EC2 box.

Every product is registered with the demo purchase link `https://purchase.link/demo`
(override with `DEMO_PURCHASE_LINK`).
