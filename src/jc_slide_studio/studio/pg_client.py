"""HTTPS SQL client for CloudBase PostgreSQL (SHARED instance).

A SHARED CloudBase PG instance has no TCP endpoint, but the platform exposes a
parameterised SQL endpoint instead. This module is dependency-free (standard
library only) so the container image stays small.

The API key is an environment-level service credential injected by CloudRun
through ``serverConfig.EnvParams``; it is never stored in this repository.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Sequence

SQL_PATH = "/v1/rdb/exec-pgsql"


class PgError(Exception):
    """An error returned by the CloudBase SQL endpoint."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message


def _config() -> tuple[str, str]:
    env_id = os.environ.get("CLOUDBASE_ENV_ID", "").strip()
    api_key = os.environ.get("CLOUDBASE_API_KEY", "").strip()
    if not env_id or not api_key:
        raise RuntimeError(
            "CLOUDBASE_ENV_ID and CLOUDBASE_API_KEY are required when "
            "JC_STUDIO_BACKEND=cloudbase_pg"
        )
    host = os.environ.get("CLOUDBASE_API_HOST", "").strip() or (
        f"{env_id}.api.tcloudbasegateway.com"
    )
    return f"https://{host}{SQL_PATH}", api_key


def query(sql: str, parameters: Sequence[Any] | None = None) -> List[Dict[str, Any]]:
    """Run one parameterised statement and return its rows as dictionaries.

    The endpoint compiles every request as a prepared statement, so only one
    statement is allowed per call. Operations that must be atomic are written
    as a single statement with data-modifying CTEs in :mod:`service_pg`.
    """
    url, api_key = _config()
    # On SHARED instances this endpoint defaults to a read-only role
    # (cloudbase_read_only_user_*), so every INSERT/UPDATE would fail with
    # DATABASE_25006. Explicitly select the endpoint's fixed application
    # management role (BYPASSRLS) to allow writes.
    payload = json.dumps(
        {
            "sql": sql,
            "parameters": list(parameters or []),
            "role": "cloudbase_postgres",
        },
        ensure_ascii=False,
    ).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8", "replace")
        code, message = "HTTP_ERROR", body
        try:
            parsed = json.loads(body)
            if isinstance(parsed, dict):
                code = str(parsed.get("code") or code)
                message = str(parsed.get("message") or message)
        except ValueError:
            pass
        raise PgError(code, message) from error
    except urllib.error.URLError as error:
        raise PgError("NETWORK_ERROR", str(error)) from error
    if not isinstance(result, list):
        raise PgError("BAD_RESPONSE", f"expected JSON array, got {type(result).__name__}")
    return result
