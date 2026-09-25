#!/usr/bin/env python3
"""Reject credentials and top-level data-bearing SQL in a schema bootstrap."""

from __future__ import annotations

import re
import sys
from pathlib import Path


SECRET_PATTERNS = {
    "private_key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "jwt": re.compile(
        r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"
    ),
    "postgres_url": re.compile(r"postgres(?:ql)?://[^\s'\"]+", re.IGNORECASE),
    "service_role_jwt": re.compile(
        r"service[_-]?role[^\n]{0,30}eyJ", re.IGNORECASE
    ),
    "private_http_url": re.compile(r"https?://[^\s'\"]+", re.IGNORECASE),
}
FORBIDDEN_TOP_LEVEL = {
    "COPY",
    "CREATE ROLE",
    "DELETE",
    "INSERT",
    "MERGE",
    "TRUNCATE",
    "UPDATE",
}


def top_level_statements(sql: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    i = 0
    single_quote = False
    double_quote = False
    line_comment = False
    block_comment = False
    dollar_tag: str | None = None

    while i < len(sql):
        if line_comment:
            if sql[i] == "\n":
                line_comment = False
                current.append("\n")
            i += 1
            continue
        if block_comment:
            if sql.startswith("*/", i):
                block_comment = False
                i += 2
            else:
                i += 1
            continue
        if dollar_tag is not None:
            if sql.startswith(dollar_tag, i):
                current.append(dollar_tag)
                i += len(dollar_tag)
                dollar_tag = None
            else:
                i += 1
            continue
        if single_quote:
            if sql.startswith("''", i):
                i += 2
            elif sql[i] == "'":
                single_quote = False
                current.append("''")
                i += 1
            else:
                i += 1
            continue
        if double_quote:
            current.append(sql[i])
            if sql.startswith('""', i):
                current.append('"')
                i += 2
            elif sql[i] == '"':
                double_quote = False
                i += 1
            else:
                i += 1
            continue

        if sql.startswith("--", i):
            line_comment = True
            i += 2
        elif sql.startswith("/*", i):
            block_comment = True
            i += 2
        elif sql[i] == "'":
            single_quote = True
            current.append("''")
            i += 1
        elif sql[i] == '"':
            double_quote = True
            current.append('"')
            i += 1
        elif sql[i] == "$":
            match = re.match(r"\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$", sql[i:])
            if match:
                dollar_tag = match.group(0)
                current.append(dollar_tag)
                i += len(dollar_tag)
            else:
                current.append(sql[i])
                i += 1
        elif sql[i] == ";":
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            i += 1
        else:
            current.append(sql[i])
            i += 1

    remainder = "".join(current).strip()
    if remainder:
        statements.append(remainder)
    return statements


def main() -> int:
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} BOOTSTRAP.sql")
    path = Path(sys.argv[1])
    text = path.read_text()
    failures: list[str] = []

    for name, pattern in SECRET_PATTERNS.items():
        count = len(pattern.findall(text))
        print(f"safety_{name}={count}")
        if count:
            failures.append(name)

    top_level = top_level_statements(text)
    forbidden: list[str] = []
    for statement in top_level:
        normalized = " ".join(statement.split()).upper()
        for prefix in FORBIDDEN_TOP_LEVEL:
            if normalized == prefix or normalized.startswith(prefix + " "):
                forbidden.append(prefix)
                break
        if re.match(r"^ALTER\s+ROLE\b", normalized):
            forbidden.append("ALTER ROLE")

    print(f"top_level_statements={len(top_level)}")
    print(f"top_level_data_statements={len(forbidden)}")
    print(f"bytes={path.stat().st_size}")
    print(f"lines={text.count(chr(10))}")
    if forbidden:
        failures.append("top-level:" + ",".join(sorted(forbidden)))
    if failures:
        print("schema_bootstrap_review=fail", file=sys.stderr)
        return 1
    print("schema_bootstrap_review=pass")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
