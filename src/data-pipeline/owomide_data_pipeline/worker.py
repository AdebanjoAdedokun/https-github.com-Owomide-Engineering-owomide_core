from __future__ import annotations

import logging
import signal
from threading import Event

from owomide_data_pipeline.config import Config
from owomide_data_pipeline.db import Database
from owomide_data_pipeline.health import start_health_server


def main() -> None:
    config = Config.from_env()
    logging.basicConfig(
        level=getattr(logging, config.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    database = Database(config.database_url, config.database_statement_timeout_ms)
    health_server = start_health_server(config.health_host, config.health_port, database.ready)
    stopped = Event()

    def shutdown(_signum: int, _frame: object) -> None:
        stopped.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    logging.info("Data Pipeline worker scaffold started; operation claiming lands in F2.2")
    while not stopped.wait(config.worker_poll_seconds):
        pass
    health_server.stop()


if __name__ == "__main__":
    main()
