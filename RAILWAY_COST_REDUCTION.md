# Railway Cost Reduction Guide

This project now supports a low-cost runtime mode.

## 1) Recommended Railway environment variables

Set these in your Railway service:

- `LOW_COST_MODE=true`
- `ENABLE_DASHBOARD=false`
- `ENABLE_SOCIAL_NOTIFIER=false`
- `PG_POOL_MAX=3`
- `PG_IDLE_TIMEOUT_MS=10000`
- `SOCIAL_POLL_INTERVAL_MS=600000`

## 2) What this changes

When `LOW_COST_MODE=true`:

- Most background schedulers run less frequently.
- Social polling defaults to every 10 minutes instead of every 2 minutes.
- Database pool defaults are reduced.
- Expensive dashboard process can be disabled entirely.

## 3) Fastest way to cut costs a lot

Use a worker-style deployment for the bot process and disable the web dashboard:

- Keep bot online for Discord.
- Avoid running unnecessary web/dashboard traffic in the same service.

If you still need the dashboard, run it as a separate service and only keep it enabled when needed:

- Bot service: `ENABLE_DASHBOARD=false`
- Dashboard service: `ENABLE_DASHBOARD=true`

## 4) Trade-offs

- Some features become less "real-time" (reminders, cleanup jobs, social feeds, etc.).
- Core bot functionality remains available.

## 5) Optional fine-tuning

You can override any default with environment variables, for example:

- `SOCIAL_POLL_INTERVAL_MS=900000` (15 min)
- `PG_POOL_MAX=2`
- `ENABLE_SOCIAL_NOTIFIER=true` if social alerts are important
