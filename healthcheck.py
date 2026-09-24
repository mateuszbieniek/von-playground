"""Readiness probe: a real /v1/systemone call, so 'healthy' means the model is loaded.

Von loads weights lazily on the first request; GET /health answers 'ok' before
that. The first probe therefore triggers the download and load, and
`docker compose up --wait` blocks until the server actually serves answers.
"""
import json
import os
import sys
import urllib.request

port = os.environ.get("VON_PORT", "8000")
body = json.dumps({
    "state": {"text": "healthcheck"},
    "questions": {"ok": {"type": "noul", "instructions": "Is this a healthcheck?"}},
}).encode()
headers = {"content-type": "application/json"}
if os.environ.get("VON_API_KEY"):
    headers["authorization"] = "Bearer " + os.environ["VON_API_KEY"]
req = urllib.request.Request(f"http://127.0.0.1:{port}/v1/systemone", data=body, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=20) as resp:
        answers = json.load(resp).get("answers", {})
        sys.exit(0 if "ok" in answers else 1)
except Exception as exc:  # noqa: BLE001
    print(exc, file=sys.stderr)
    sys.exit(1)
