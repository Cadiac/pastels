# Deploying pastels

The app runs as a systemd service bound to `127.0.0.1:3000`, behind nginx (TLS via
certbot) at **https://pastels.cadi.ac**. SQLite DB lives in `server/var/app.db`
(gitignored) and auto-seeds from `data/colors.json` on first start, so it survives
redeploys. No Docker, no native build (uses Node's built-in `node:sqlite`).

## One-time setup (run as root on the server)

```sh
# 1. Node 24 + pnpm (via corepack)
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs
corepack enable

# 2. Service user + clone (public repo, HTTPS)
useradd --system --create-home --shell /bin/bash pastels
mkdir -p /opt/pastels && chown pastels:pastels /opt/pastels
sudo -u pastels git clone https://github.com/Cadiac/pastels.git /opt/pastels

# 3. Install + build (corepack fetches pnpm from package.json "packageManager")
cd /opt/pastels
sudo -u pastels pnpm install --frozen-lockfile
sudo -u pastels pnpm build

# 4. Environment
cat >/etc/pastels.env <<'EOF'
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
COOKIE_SECURE=true
NODE_OPTIONS=--disable-warning=ExperimentalWarning
EOF

# 5. systemd service
cp deploy/pastels.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now pastels
curl -s localhost:3000/api/colors   # -> {"error":"Not authenticated"} = up

# 6. DNS: point pastels.cadi.ac at this server, then:

# 7. nginx site
cp deploy/nginx-pastels.conf /etc/nginx/sites-available/pastels.cadi.ac
ln -s ../sites-available/pastels.cadi.ac /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 8. TLS (adds :443 + http->https redirect; renewal already automated)
certbot --nginx -d pastels.cadi.ac
```

Then open https://pastels.cadi.ac and register.

## Redeploy

```sh
bash /opt/pastels/deploy/update.sh   # as root: pull, install, build, restart
```

## Handy

```sh
systemctl status pastels
journalctl -u pastels -f
```
