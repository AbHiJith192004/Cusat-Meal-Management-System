---
status: written_not_yet_executed
updated: 2026-11-13
branch: main
replaces: digitalocean_app_platform_plus_managed_postgres
provider: hostinger_kvm2
provider_decision: decided_2026-11-13
server_spec: 2_vcpu_8gb_100gb_ubuntu_2404_india_region
blocked_on: server_not_yet_purchased
artifacts:
  - deploy/docker-compose.prod.yml
  - deploy/Caddyfile
  - deploy/.env.prod.example
  - deploy/bootstrap.sh
  - deploy/deploy.sh
  - deploy/backup.sh
  - deploy/restore.sh
  - deploy/reconcile.sh
  - deploy/crontab.example
verification: none_of_this_has_been_run
---

# Running MessConnect on a VPS

Everything in `deploy/` runs the whole system on one ordinary Linux server:
four containers, one domain, one deploy command. It is written for
Hostinger because that is the provider under discussion, but nothing in it
is Hostinger-specific. The same files work on Hetzner, on a college-run
machine, or on DigitalOcean's plain Droplets, and that portability is the
point — the move away from App Platform is a move away from being unable to
leave.

**Nothing here has been run yet.** It is written from this repository's own
configuration, not from a server that exists. Treat the first execution as
the test.

## Before this is the right thing to do

Two things were true on 11 November 2026 and may not be true when you read
this:

1. **DigitalOcean ticket #12995810 is open.** It asks whether the destroyed
   app and database can be restored. If the answer is yes, the first thing
   that happens is a restore and a dump — not a migration. Migrating first
   would mean rebuilding data that was about to come back.
2. ~~**The provider is not chosen.**~~ **Decided 13 November 2026:
   Hostinger KVM 2.** The figures below were read off the vendors' own
   pages that day, which is the verification the earlier draft of this
   section asked for. Treat them as dated, not permanent.

   | | Ashok Cloud | **Hostinger KVM 2** |
   |---|---|---|
   | Spec | 2 vCPU / 4 GB / 50 GB | **2 vCPU / 8 GB / 100 GB** |
   | Price | Rs 3,600/mo + tax | **Rs 779/mo**, Rs 18,696 for 24 months upfront |
   | Renews at | - | Rs 1,199/mo |
   | Setup fee | Rs 1,900 | none |
   | Backups | Rs 2,000 to configure | free weekly, on-provider |
   | Domain | - | free for 1 year |
   | Signup | enterprise agreement | card |
   | Nearest DC | Manesar / Panchkula / Rai, all Delhi NCR | India region |

   Ashok Cloud (Anant Raj Cloud) is a genuine MeitY-recognised sovereign
   cloud, and it is the right answer if CUSAT ever requires Indian data
   residency as a condition. It was rejected here on three counts: roughly
   4.6x the price for half the RAM, data centres 2,000 km from Kochi when
   latency is what students feel, and a sales agreement rather than a
   signup while the app is already down.

   Paying Hostinger 24 months upfront is deliberate. A recurring monthly
   charge is precisely what failed on 9 November 2026 and destroyed the
   application; for two years there is no invoice to miss.

## What this replaces

| Was, on App Platform | Is, on a VPS |
|---|---|
| Managed PostgreSQL cluster, billed separately | `db` container, a Docker volume |
| 47-connection ceiling priced into the plan | `max_connections`, a setting, default 100 |
| Platform TLS and ingress | Caddy, with automatic Let's Encrypt |
| `PRE_DEPLOY` migrate job | step 3 of `deploy.sh` |
| `SCHEDULED` reconciliation job | one crontab line |
| `doctl apps create-deployment` | `./deploy.sh` |
| Platform alerts, uptime check | **nothing — see "What stops watching"** |
| Automatic managed-database backups | `backup.sh`, nightly, verified |

The connection budget deserves a sentence of its own. The old database was
2 GiB rather than 1 GiB purely because DigitalOcean capped the smaller plan
at 22 connections and this app needs 40. That was a pricing constraint, not
a memory requirement. **Do not size the VPS as though the app needs 2 GiB
for Postgres.** It never did.

## The server

Minimum that will actually hold this: **2 vCPU, 4 GB RAM, 50 GB disk**,
Ubuntu 24.04 LTS. 8 GB is comfortable and makes the frontend build
pleasant rather than tense. Pick a region close to Kochi — the latency
students feel is dominated by distance, and an Indian region beats a
European one for this user base regardless of which provider wins.

Disk matters more than it looks: Docker images, build cache, 14 nightly
dumps and Postgres all share it. 50 GB is the floor, not the target.

**Why KVM 2 and not the cheaper KVM 1.** KVM 1 has one vCPU. The load
test that carried 300 concurrent users at 0% errors ran with Postgres on
a *separate machine*; here the database and the API share the box and
peak together, at meal times. The extra core is the whole point, and the
8 GB is what makes `deploy.sh` compile the Vite frontend without
thrashing against Postgres.

### Oracle Cloud Always Free, as the zero-cost alternative

Decided 14 November 2026 to try this before paying Hostinger. It is ARM
(Ampere A1), and **verified that day: all 38 packages in
backend/requirements.lock have Linux aarch64 wheels**, and all four base
images (node:24-bookworm-slim, python:3.11-slim-bookworm,
postgres:16-alpine, caddy:2-alpine) publish arm64. Nothing compiles from
source. `deploy/` needs no change for ARM.

Always Free gives 2 OCPU / 12 GB (halved from 4/24 on 15 June 2026) and
200 GB of block storage shared with the boot volume. That clears this
project's floor with room to spare.

At signup:

- **Home region: an India region.** It **cannot be changed afterwards**.
  Hyderabad (`ap-hyderabad-1`) reportedly has free ARM capacity more
  often than Mumbai (`ap-mumbai-1`), which is chronically exhausted.
- A card is required for identity verification. Indian RuPay cards are
  widely reported to be rejected; use Visa or Mastercard.
- **Image: Canonical Ubuntu 24.04**, not Oracle Linux. `bootstrap.sh` is
  written for Debian/Ubuntu `apt`.
- **Shape: VM.Standard.A1.Flex**, 2 OCPU, 12 GB. Raise the boot volume to
  about 100 GB while you are there; it is inside the free 200 GB.

Then two Oracle-specific traps, both of which look like "the site is
down" and neither of which exists on an ordinary VPS:

1. **The VCN security list blocks everything except SSH.** Add ingress
   rules for TCP 80 and 443 (and UDP 443 if you want HTTP/3) to the
   subnet's security list, or Caddy can never answer the ACME challenge
   and no certificate is ever issued.
2. **Oracle's Ubuntu images ship their own iptables rules** that drop 80
   and 443 even after the security list is opened. `bootstrap.sh` sets up
   ufw, which does not remove them. Check with `sudo iptables -L INPUT -n
   --line-numbers` and clear the REJECT rules before expecting traffic.

Neither is a defect in `deploy/`; both are the standard Oracle
first-hour surprise, and together they are the usual reason a correct
deployment there appears dead.

### Buying it: what to choose at checkout

Four choices at checkout decide whether `bootstrap.sh` runs cleanly.

1. **Plan: KVM 2.** Not KVM 1, for the reason above.
2. **Location: the India region, which is Mumbai.** Hostinger's own
   launch announcement names Mumbai, and an independent test measured
   2.69 ms to Airtel within the city; the public pricing page says only
   "India", so confirm in the order flow. Mumbai is about 1,100 km from
   Kochi. Pick it deliberately: Hostinger's support article says a VPS
   location is **fixed after initial setup**, while their India VPS page
   says it can be changed at any time. Those contradict each other, so
   treat the choice as permanent.
3. **OS: Plain OS -> Ubuntu 24.04 LTS.** Hostinger also offers templates
   with Docker, control panels and preinstalled apps. **Do not take
   one.** `bootstrap.sh` installs Docker from Docker's own apt repository
   with its signing key checked, and it skips that step when it finds
   docker already on the box. A template that ships docker without the
   compose plugin therefore leaves the script running `docker compose
   version` against a plugin that is not there, and `set -euo pipefail`
   aborts it. A panel image is worse: it will already be holding ports 80
   and 443, which Caddy needs.
4. **Take the free domain.** It is included for the first year and it is
   the `MESS_DOMAIN` this whole setup needs. Caddy cannot issue a
   certificate without a real name with an A record on it.

Add an SSH key during setup rather than using a root password.

## First run

```bash
# On the server, as root
sudo ./bootstrap.sh          # clock, docker, firewall, users, swap, logrotate

# As the deploy user
git clone https://github.com/AbHiJith192004/Cusat-Meal-Management-System.git /opt/messconnect
cd /opt/messconnect/deploy
cp .env.prod.example .env && chmod 600 .env
# fill .env in — generate each secret ON THIS MACHINE

# Point the domain's A record at the server IP, and wait for it to resolve.
# Caddy proves control of the name over port 80; before DNS points here,
# certificate issuance fails and the site serves nothing.
dig +short your.domain

./deploy.sh

# THE DATABASE IS NOW EMPTY OF PEOPLE. There is no administrator and no
# way to log in or import anybody until this runs. It prompts for an id,
# a name and a password, so it needs a terminal -- do NOT add -T.
docker compose -f docker-compose.prod.yml --env-file .env --profile tools \
    run --rm migrate python -m scripts.bootstrap_admin

crontab -e     # paste crontab.example
```

`bootstrap_admin` refuses to create a second super administrator, so it is
safe to run again if you are unsure whether it took. It was previously
documented only in the DigitalOcean readiness notes, as "open a one-off
console" -- an instruction that no longer refers to anything that exists.

Then, the same day, while nothing depends on it:

```bash
./backup.sh
./restore.sh /var/backups/messconnect/messconnect-<stamp>.dump
```

That pair is the only proof the backups are real. Run it once on purpose
now, or discover it for the first time during an outage.

## If the DigitalOcean data comes back

The migration is two commands, and `backup.sh`/`restore.sh` are both halves:

```bash
# wherever the restored database lives, with pg_dump 16 available
ops/backup_db.sh "postgresql://user:pass@host:25060/db?sslmode=require"

# on the new server
scp messconnect-<stamp>.dump deployuser@server:/var/backups/messconnect/
./restore.sh /var/backups/messconnect/messconnect-<stamp>.dump
```

Carry the **old** `JWT_SECRET_KEY` and `QR_SECRET_KEY` into the new `.env`.
Generating fresh ones logs every student out and invalidates QR codes
mid-meal, for no benefit.

## If it does not

The schema comes from `alembic upgrade head`, which `deploy.sh` runs. The
students come from `ops/import_students.py`. October's attendance, fines
and billing do not come back from anywhere. That is a consequence of the
incident, not of this migration, and no choice of host changes it.

## What stops watching

This is the part of leaving a platform that is easy to miss. DigitalOcean
was running, for free and invisibly:

- an uptime check against `/health` every minute, alerting on two failures
- deployment-failure, domain-failure, CPU, memory and restart-count alerts
- automatic daily database backups with point-in-time recovery

**All three disappear the moment the app leaves.** `backup.sh` plus cron
replaces the third. The first two need an external uptime monitor — any of
the free tiers works — pointed at `https://your.domain/health/live`, every
minute, alerting to an address someone actually reads. `/health/live`, not
`/health`: the readiness endpoint answers 503 whenever Postgres is
unreachable, which is correct for a load balancer and too noisy for a pager.

`docs/monitoring.md` describes the DigitalOcean arrangement and is now
historical. Rewrite it when the replacement monitor is chosen, not before —
a monitoring document describing a monitor nobody configured is worse than
none.

## What this migration does not fix

The November 2026 outage had two causes, and a change of host addresses
neither:

1. **An invoice went unpaid for nine days, and the provider destroyed the
   resources.** Hostinger suspends for non-payment too. Every host does.
   The fix is the card and the billing alert, not the hosting.
2. **There was no backup anywhere.** The managed database's own recovery
   died with it, and `ops/backups/` had been empty since the day it was
   created. The fix is `backup.sh` in cron **with
   `BACKUP_OFFSITE_REMOTE` set** — a dump that lives only on the server it
   backs up is not a backup, and a VPS makes that failure mode worse, not
   better, because there is no managed snapshot standing behind it.

A VPS is cheaper, removes the connection ceiling, and makes the next move
easy. It also hands you the operational work the platform was doing. That
is a fair trade, made with both halves visible.

## Day-to-day

```bash
cd /opt/messconnect/deploy

./deploy.sh --pull                    # ship main
docker compose -f docker-compose.prod.yml --env-file .env ps
docker compose -f docker-compose.prod.yml --env-file .env logs -f app
./backup.sh                           # ad-hoc dump before anything risky

# psql, without exposing a port or putting the password in a command line
docker compose -f docker-compose.prod.yml --env-file .env exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

`deploy.sh` takes a dump before it migrates, runs the migration as its own
step, and rolls the image back if the new version never reports healthy. It
does **not** roll the database back: `alembic downgrade` is another
migration, not an undo, and running one unattended against a schema that
just failed is how a bad deploy becomes a lost month. The dump it took is
the way back, through `restore.sh`, with a human watching.
