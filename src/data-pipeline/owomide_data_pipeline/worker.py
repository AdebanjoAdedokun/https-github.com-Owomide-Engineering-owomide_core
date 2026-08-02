from __future__ import annotations

import logging
import os
import signal
import socket
from threading import Event
from uuid import uuid4

from owomide_data_pipeline.catalog import CatalogClient
from owomide_data_pipeline.config import Config
from owomide_data_pipeline.db import Database
from owomide_data_pipeline.health import start_health_server
from owomide_data_pipeline.intelligence.fx import FxCalculator
from owomide_data_pipeline.intelligence.repository import FxRateRepository
from owomide_data_pipeline.outbox import KafkaEventPublisher, OutboxProcessor
from owomide_data_pipeline.processor import ImportProcessor
from owomide_data_pipeline.repository import ImportRepository
from owomide_data_pipeline.storage import ObjectStore


def main() -> None:
    config = Config.from_env(
        require_service_secrets=False,
        require_catalog_secret=True,
        require_kafka_brokers=True,
    )
    logging.basicConfig(
        level=getattr(logging, config.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    database = Database(config.database_url, config.database_statement_timeout_ms)
    object_store = ObjectStore(
        endpoint=config.object_store_endpoint,
        access_key=config.object_store_access_key,
        secret_key=config.object_store_secret_key,
        secure=config.object_store_secure,
        bucket=config.object_store_bucket,
    )
    catalog_client = CatalogClient(
        target=config.catalog_service_url,
        issuer=config.service_jwt_issuer,
        secret=config.catalog_service_secret,
        timeout_seconds=config.catalog_timeout_seconds,
    )
    worker_id = f"{socket.gethostname()}-{os.getpid()}-{uuid4().hex[:8]}"
    repository = ImportRepository(database)
    fx_calculator = FxCalculator(
        FxRateRepository(database),
        max_rate_age_seconds=config.fx_max_rate_age_seconds,
    )
    processor = ImportProcessor(
        repository=repository,
        object_store=object_store,
        worker_id=worker_id,
        lease_seconds=config.worker_lease_seconds,
        retry_base_seconds=config.worker_retry_base_seconds,
        max_rows=config.import_max_rows,
        max_columns=config.import_max_columns,
        insert_batch_size=config.import_insert_batch_size,
        xlsx_spool_memory_bytes=config.xlsx_spool_memory_bytes,
        catalog_client=catalog_client,
        fx_calculator=fx_calculator,
    )
    outbox = OutboxProcessor(
        repository=repository,
        publisher=KafkaEventPublisher(
            brokers=config.kafka_brokers,
            client_id=f"{config.kafka_client_id}-{worker_id}",
        ),
        batch_size=config.outbox_batch_size,
        lease_seconds=config.outbox_lease_seconds,
        retry_base_seconds=config.worker_retry_base_seconds,
    )
    health_server = start_health_server(
        config.health_host,
        config.health_port,
        lambda: database.ready() and object_store.ready(),
    )
    stopped = Event()

    def shutdown(_signum: int, _frame: object) -> None:
        stopped.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    logging.info("Data Pipeline worker %s started", worker_id)
    while not stopped.is_set():
        processed = processor.process_once()
        published = outbox.process_once()
        if not processed and not published:
            stopped.wait(config.worker_poll_seconds)
    health_server.stop()
    outbox.close()
    catalog_client.close()


if __name__ == "__main__":
    main()
