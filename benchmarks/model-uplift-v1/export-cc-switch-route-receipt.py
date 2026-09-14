#!/usr/bin/env python3
import datetime
import hashlib
import json
import os
import pathlib
import sqlite3
import sys
import tempfile
import urllib.parse

USAGE = "Usage: python3 export-cc-switch-route-receipt.py <raw-results.json> <cc-switch.db> <route-receipt.json>"
TOLERANCE_SECONDS = 120


def fail(message):
    raise SystemExit(message)


def iso_from_epoch(value):
    return datetime.datetime.fromtimestamp(int(value), datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def epoch(value):
    return datetime.datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()


if "--help" in sys.argv[1:] or "-h" in sys.argv[1:]:
    print(USAGE)
    raise SystemExit(0)
if len(sys.argv) != 4:
    fail(USAGE)

raw_path, database_path, output_path = map(pathlib.Path, sys.argv[1:])
raw = json.loads(raw_path.read_text(encoding="utf-8"))
database_uri = "file:" + urllib.parse.quote(str(database_path.resolve())) + "?mode=ro"
connection = sqlite3.connect(database_uri, uri=True)
columns = {row[1] for row in connection.execute("pragma table_info(proxy_request_logs)")}
required_columns = {
    "request_id", "session_id", "app_type", "model", "request_model", "total_cost_usd",
    "status_code", "created_at", "data_source",
}
if not required_columns.issubset(columns):
    fail("CC Switch database does not expose the required proxy_request_logs columns")

records = []
seen_keys = set()
seen_requests = set()
for record in raw.get("records", []):
    key = (record.get("armId"), record.get("caseId"), record.get("repetition"))
    if key in seen_keys:
        fail("benchmark results contain a duplicate arm/case/repetition key")
    seen_keys.add(key)
    session_id = record.get("claudeSessionId")
    if not session_id:
        fail("benchmark record lacks claudeSessionId")
    windows = []
    for invocation in record.get("invocations", []):
        try:
            start = epoch(invocation["startedAt"])
            end = epoch(invocation["completedAt"])
        except (KeyError, TypeError, ValueError):
            continue
        if end >= start:
            windows.append((start - TOLERANCE_SECONDS, end + TOLERANCE_SECONDS))
    if not windows:
        fail("benchmark record lacks valid invocation timestamps")
    rows = connection.execute(
        "select request_id, model, request_model, total_cost_usd, status_code, created_at "
        "from proxy_request_logs where app_type = ? and data_source = ? and session_id = ? "
        "and status_code between 200 and 299 order by created_at, request_id",
        ("claude", "proxy", session_id),
    ).fetchall()
    requests = []
    for request_id, model, request_model, estimated_cost, status_code, created_at in rows:
        if not any(start <= float(created_at) <= end for start, end in windows):
            continue
        if request_id in seen_requests:
            fail("CC Switch proxy request is assigned to more than one benchmark record")
        seen_requests.add(request_id)
        requests.append({
            "proxyRequestId": request_id,
            "model": model,
            "requestModel": request_model,
            "observedAt": iso_from_epoch(created_at),
            "statusCode": status_code,
            "ccSwitchEstimatedCostUsd": float(estimated_cost or 0),
        })
    if not requests:
        fail(f"no successful CC Switch requests matched benchmark session {session_id}")
    records.append({
        "armId": key[0],
        "caseId": key[1],
        "repetition": key[2],
        "claudeSessionId": session_id,
        "requests": requests,
    })

canonical = json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
receipt = {
    "schemaVersion": 1,
    "status": "final",
    "authority": "cc-switch-proxy-log",
    "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
    "sourceDigest": hashlib.sha256(canonical).hexdigest(),
    "runnerCommit": raw.get("runnerCommit"),
    "routingProfile": raw.get("routingProfile"),
    "records": records,
}
output_path.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output_path.parent, delete=False) as temporary:
    json.dump(receipt, temporary, ensure_ascii=False, indent=2)
    temporary.write("\n")
    temporary_path = temporary.name
os.replace(temporary_path, output_path)
print(f"route-receipt={output_path.resolve()}")
