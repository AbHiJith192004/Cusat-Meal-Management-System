# deploy/

Running MessConnect on one Linux server, without a hosting platform.

The full runbook — what this replaces, how to size the box, what stops
being monitored when the platform goes away — is
[../docs/vps-deployment.md](../docs/vps-deployment.md). Read that first.

| File | What it is |
|---|---|
| `docker-compose.prod.yml` | The stack: Postgres, the app, Caddy, plus two jobs that only run when called |
| `Caddyfile` | TLS, HTTP/3, and the header rewrite that keeps per-IP rate limits honest |
| `.env.prod.example` | Copy to `.env` **on the server**. Five secrets and a domain |
| `bootstrap.sh` | Once, as root, on a fresh box: clock, Docker, firewall, user, swap, logrotate |
| `deploy.sh` | Back up, build, migrate, release, verify, roll the image back if it fails |
| `backup.sh` | Nightly dump — verified against a required-table list, pruned, copied off the server |
| `restore.sh` | Put a dump back. Also the entire migration from any other host |
| `reconcile.sh` | The nightly fine job, as cron calls it |
| `crontab.example` | The two scheduled lines, and the logrotate stanza |

```bash
cd /opt/messconnect/deploy && ./deploy.sh
```

Three things worth knowing before touching any of it:

- **This is not `../docker-compose.yml`.** That one is the development
  stack and builds a backend with no frontend in it. Production uses the
  root `Dockerfile`, which compiles the React build into the API image.
- **`deploy.sh` dumps the database before it migrates.** That dump is the
  only way back from a migration that destroys data while exiting 0.
- **`backup.sh` warns loudly when `BACKUP_OFFSITE_REMOTE` is empty.** It is
  not being pedantic. In November 2026 this project's provider deleted the
  app and its database over an unpaid invoice, and there was no copy of the
  data anywhere else.
