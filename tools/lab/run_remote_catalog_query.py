#!/usr/bin/env python3
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlparse

project_ref, pooler_url_path, sql_path, output_path = sys.argv[1:5]
token = (Path.home() / ".supabase" / "access-token").read_text().strip()
if not token:
    raise SystemExit("Supabase access token is unavailable")
request = urllib.request.Request(
    f"https://api.supabase.com/v1/projects/{project_ref}/cli/login-role",
    data=json.dumps({"read_only": False}).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(request, timeout=60) as response:
    role_data = json.load(response)
token = ""
role = role_data.get("role")
password = role_data.get("password")
if not isinstance(role, str) or not role or not isinstance(password, str) or not password:
    raise SystemExit("Temporary login role response was incomplete")
if "." not in role:
    role = f"{role}.{project_ref}"
pooler = urlparse(Path(pooler_url_path).read_text().strip())
if pooler.scheme not in {"postgres", "postgresql"} or not pooler.hostname:
    raise SystemExit("Invalid linked pooler URL")
time.sleep(8)
env = os.environ.copy()
env["PGPASSWORD"] = password
env["PGSSLMODE"] = "require"
env["PGOPTIONS"] = (
    env.get("PGOPTIONS", "") + " -c default_transaction_read_only=on"
).strip()
command = [
    "psql", "--host", pooler.hostname, "--port", str(pooler.port or 5432),
    "--username", role, "--dbname", (pooler.path or "/postgres").lstrip("/"),
    "--no-psqlrc", "--single-transaction", "--set", "ON_ERROR_STOP=1",
    "--file", sql_path,
    "--output", output_path,
]
result = subprocess.run(command, env=env)
password = ""
raise SystemExit(result.returncode)
