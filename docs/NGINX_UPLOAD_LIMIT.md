# Nginx — allow large video uploads (multipart via API)

If uploads fail with **413 Request Entity Too Large**, increase nginx `client_max_body_size`.

## Fix on EC2

```bash
sudo nano /etc/nginx/sites-available/default
# or: sudo nano /etc/nginx/sites-available/api.unscene.in
```

Inside the `server { ... }` block for `api.unscene.in`, add:

```nginx
client_max_body_size 100M;
```

Also add inside the `location` that proxies to Node (e.g. `location /`):

```nginx
proxy_request_buffering off;
client_max_body_size 100M;
```

Test and reload:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Alternative (recommended for app)

Use **presigned S3 upload** (`POST .../upload/presign` → PUT to S3 → `POST .../episodes`).
The test script `testAiFlow.js` uses this by default and bypasses nginx body limits.

To force old multipart path (hits nginx): `USE_MULTIPART_UPLOAD=true`
