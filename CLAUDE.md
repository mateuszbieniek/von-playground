# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A deployment repo that runs [Von](https://github.com/wfzyx/von) (open-source System One decision model, Jev-compatible `/v1/systemone` API) on CPU via Docker Compose. Upstream ships no Dockerfile, so `Dockerfile` here installs the `von-sdk` PyPI release on `python:3.12-slim` with CPU-only torch. There is no application source in this repo.

Files: `Dockerfile` (image), `docker-compose.yml` (service `von`), `healthcheck.py` (readiness probe mounted into the container).

## Commands

```bash
docker compose up -d --build --wait     # build, start, block until the model answers
docker compose logs -f von              # server logs
docker compose down                     # stop; add -v to also drop cached weights (~3 GB re-download)
curl -s localhost:8000/health           # liveness only, see note below
curl -s localhost:8000/v1/models        # model aliases
```

Smoke test (all three question types):

```bash
curl -s localhost:8000/v1/systemone -H 'content-type: application/json' -d '{
  "state": {"body": "billed twice, refund please or we cancel"},
  "questions": {
    "dept":  {"type": "choice", "instructions": "which team?", "criteria": {"billing": "refunds", "tech": "bugs"}},
    "anger": {"type": "score",  "instructions": "how angry?",  "criteria": ["calm", "annoyed", "furious"]},
    "churn": {"type": "noul",   "instructions": "will they cancel?"}
  }
}'
```

## Von behaviour that matters here

- **Lazy weight load.** `GET /health` returns `ok` immediately, before weights exist. The first `POST /v1/systemone` downloads `wfzyx/von` from Hugging Face (about 3 GB on disk) and loads it. That is why `healthcheck.py` sends a real `noul` request instead of hitting `/health`: `--wait` and `service_healthy` then mean "model is serving". First boot takes minutes; `start_period` is 10m.
- **Response shape.** `choice` answers carry `choice`, `probabilities`, `confidence`. `score` answers carry `score`, `confidence`, `legend`, `probabilities` keyed by level index. `noul` answers carry only `noul` (P(true)), no `confidence`. Every answer includes `type`. Top level: `model` (always `von-1.2.0`), `answers`, `usage`.
- **Errors.** Every engine failure, including a missing weights download, comes back as HTTP 422 with a `detail` string. Validation errors are also 422. Auth failures are 401.
- **CORS is built in** (`VON_CORS_ORIGINS`, default `*`), so a browser page on another origin can call the API directly. Laya, the previous engine, had none.
- **One model only.** The request `model` field accepts aliases (`von-latest`, `von-1.2.0`, `jev-latest`, ...) but the response is always stamped `von-1.2.0`.

## Configuration

Environment variables read by Compose (shell or `.env`):

- `VON_PORT` (default 8000), `VON_BIND_ADDRESS` (default `127.0.0.1`).
- `VON_THREADS` (default 4): sets `OMP_NUM_THREADS`; keep at or below physical core count. Von has no own thread setting.
- `VON_API_KEY`: optional bearer auth. Set it before changing `VON_BIND_ADDRESS` to `0.0.0.0`. `healthcheck.py` reads the same variable inside the container.
- `VON_CORS_ORIGINS`: comma-separated allowlist, default `*`.
- `HF_TOKEN`, `HF_HUB_OFFLINE`: Hugging Face access; the checkpoint is public.

Build args in `docker-compose.yml`: `VON_VERSION` (PyPI release, 1.2.2) and `TORCH_VERSION` (CPU wheel from `download.pytorch.org/whl/cpu`).

## Operational notes

- Weights persist in the `von-models` volume at `/home/von/.cache/huggingface`. The Dockerfile creates that directory owned by uid 10001 before switching user so the fresh volume inherits writable ownership; without it the download fails with `Permission denied` inside a 422.
- Container runs as non-root `von`; memory limit 4g (395M-parameter ModernBERT).
- If `docker build` or the weight download fails with `Network is unreachable` from inside a container while the host is online, check `sysctl net.ipv4.ip_forward`. It must be 1 for Docker bridge networking; something on this host has reset it to 0 before.
- CPU inference after warm-up is roughly 0.3 s for a three-question request.
