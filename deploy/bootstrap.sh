#!/usr/bin/env bash
#
# First-run preparation of a fresh Ubuntu/Debian VPS. Run ONCE, as root,
# before the first deploy:
#
#   sudo ./bootstrap.sh
#
# Idempotent: running it twice changes nothing the second time.
#
# What it deliberately does not do: install anything from a URL piped into a
# shell. Docker comes from Docker's own apt repository with its signing key
# checked, which is the same software by a route you can audit afterwards.

set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "run this with sudo" >&2; exit 1; }

DEPLOY_USER="${DEPLOY_USER:-messconnect}"
APP_DIR="${APP_DIR:-/opt/messconnect}"

say() { printf '\n==> %s\n' "$*"; }

say "Clock"
# Every meal window, QR validity check and cron time in this system is IST.
# A server left on UTC opens breakfast at 11:00 local and nobody can scan.
timedatectl set-timezone Asia/Kolkata
timedatectl status | head -3

say "Base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
    ca-certificates curl gnupg git ufw fail2ban rsync unattended-upgrades

say "Docker"
if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL "https://download.docker.com/linux/$(. /etc/os-release && echo "$ID")/gpg" \
        -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    cat > /etc/apt/sources.list.d/docker.list <<SOURCE
deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable
SOURCE
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io \
        docker-buildx-plugin docker-compose-plugin
fi
docker --version
docker compose version

say "Deploy user"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
# Membership of the docker group is equivalent to root on this machine --
# anyone in it can mount the host filesystem into a container. That is the
# accepted trade for not running deploys as root; do not add casual users.
usermod -aG docker "$DEPLOY_USER"

say "Directories"
mkdir -p "$APP_DIR" /var/backups/messconnect /var/log/messconnect
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR" /var/backups/messconnect /var/log/messconnect
chmod 700 /var/backups/messconnect

say "Firewall"
# SSH is allowed FIRST and the enable is last. Reverse that order over an
# SSH session and you lock yourself out of a machine with no console.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
ufw status verbose

# Oracle Cloud's own Ubuntu images ship an iptables ruleset that ufw does
# not own and does not override. Measured on a fresh image 15 Nov 2026:
#
#   Chain INPUT (policy DROP)
#   4  ACCEPT  tcp dpt:22
#   5  REJECT  all  reject-with icmp-host-prohibited   <- stops here
#   6  ufw-before-input ...                            <- never reached
#
# Every ufw rule for 80/443 sits in chains BELOW that REJECT, so the
# firewall looks correctly configured and the ports are still shut. The
# symptom is a site that times out with no clue why. Insert ACCEPTs above
# the REJECT, and persist them -- iptables-persistent is NOT installed on
# these images either, so without it the rules vanish on the next reboot
# and the site silently dies.
#
# Guarded: only acts when that REJECT is actually present, so this is a
# no-op on a normal VPS.
if iptables -L INPUT -n 2>/dev/null | grep -q 'icmp-host-prohibited'; then
    say "Oracle image detected: opening 80/443 above its REJECT rule"
    REJECT_LINE="$(iptables -L INPUT -n --line-numbers | awk '/icmp-host-prohibited/ {print $1; exit}')"
    for spec in "tcp 80" "tcp 443" "udp 443"; do
        set -- $spec
        iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null \
            || iptables -I INPUT "$REJECT_LINE" -p "$1" --dport "$2" -j ACCEPT
    done
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq iptables-persistent >/dev/null 2>&1 || true
    if command -v netfilter-persistent >/dev/null; then
        netfilter-persistent save >/dev/null 2>&1 && say "iptables rules persisted"
    else
        printf 'WARNING: could not install iptables-persistent. The 80/443 rules\n' >&2
        printf '         above will be LOST on reboot and the site will go dark.\n' >&2
    fi
    iptables -L INPUT -n --line-numbers | head -9
fi

say "Unattended security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

say "Swap"
# 8 GB of RAM is plenty for this workload, but a Vite build plus Postgres
# plus the API during a deploy is the one moment it can spike. A swap file
# turns a would-be OOM kill into a slow minute.
if ! swapon --show | grep -q .; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h

say "Log rotation for the cron logs"
cat > /etc/logrotate.d/messconnect <<'ROTATE'
/var/log/messconnect/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    copytruncate
}
ROTATE

cat <<NEXT

Done. Next, as $DEPLOY_USER (su - $DEPLOY_USER):

  1. git clone https://github.com/AbHiJith192004/Cusat-Meal-Management-System.git $APP_DIR
  2. cd $APP_DIR/deploy && cp .env.prod.example .env && chmod 600 .env
     Fill it in. Generate each secret on this machine.
  3. Point the DNS A record for your domain at this server's IP and wait
     for it to resolve. Caddy cannot get a certificate before that.
  4. ./deploy.sh
  5. Create the first administrator -- nothing can be done without one,
     and the database has no people in it until this runs:
       docker compose -f docker-compose.prod.yml --env-file .env \\
         --profile tools run --rm migrate python -m scripts.bootstrap_admin
  6. crontab -e, and paste crontab.example
  7. ./backup.sh, then ./restore.sh on the dump it produced -- once, now,
     while nothing depends on it working.

NEXT
