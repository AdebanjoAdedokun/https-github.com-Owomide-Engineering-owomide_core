from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

import psycopg
from psycopg import Connection
from psycopg.rows import dict_row


class Database:
    def __init__(self, database_url: str, statement_timeout_ms: int) -> None:
        self._database_url = database_url
        self._statement_timeout_ms = statement_timeout_ms

    @contextmanager
    def transaction(self, org_id: str) -> Iterator[Connection[dict[str, object]]]:
        tenant = org_id.strip()
        if not tenant:
            raise ValueError("org_id is required for a database transaction")
        with (
            psycopg.connect(self._database_url, row_factory=dict_row) as connection,
            connection.transaction(),
        ):
            connection.execute("SELECT set_config('app.org_id', %s, true)", (tenant,))
            connection.execute(
                "SELECT set_config('statement_timeout', %s, true)",
                (str(self._statement_timeout_ms),),
            )
            yield connection

    @contextmanager
    def system_transaction(self) -> Iterator[Connection[dict[str, object]]]:
        """Runs narrow SECURITY DEFINER worker functions without tenant table access."""
        with (
            psycopg.connect(self._database_url, row_factory=dict_row) as connection,
            connection.transaction(),
        ):
            connection.execute(
                "SELECT set_config('statement_timeout', %s, true)",
                (str(self._statement_timeout_ms),),
            )
            yield connection

    def ready(self) -> bool:
        try:
            with psycopg.connect(self._database_url, connect_timeout=2) as connection:
                connection.execute("SELECT 1").fetchone()
            return True
        except psycopg.Error:
            return False
