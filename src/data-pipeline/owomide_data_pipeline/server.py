from __future__ import annotations

import logging
import signal
from concurrent import futures
from dataclasses import dataclass
from threading import Event

import grpc
from services.data_pipeline.v1 import data_pipeline_pb2_grpc

from owomide_data_pipeline.auth import AuthenticationInterceptor, ServiceAuthenticator
from owomide_data_pipeline.config import Config
from owomide_data_pipeline.db import Database
from owomide_data_pipeline.health import HealthServer, start_health_server
from owomide_data_pipeline.repository import ImportRepository
from owomide_data_pipeline.service import DataPipelineService
from owomide_data_pipeline.storage import ObjectStore


@dataclass(slots=True)
class Runtime:
    grpc_server: grpc.Server
    health_server: HealthServer

    def stop(self, grace_seconds: float = 10) -> None:
        self.grpc_server.stop(grace_seconds).wait()
        self.health_server.stop()


def start_server(config: Config) -> Runtime:
    database = Database(config.database_url, config.database_statement_timeout_ms)
    object_store = ObjectStore(
        endpoint=config.object_store_endpoint,
        access_key=config.object_store_access_key,
        secret_key=config.object_store_secret_key,
        secure=config.object_store_secure,
        bucket=config.object_store_bucket,
    )
    repository = ImportRepository(database)
    authenticator = ServiceAuthenticator(
        issuer=config.service_jwt_issuer,
        audience=config.service_jwt_audience,
        secrets=config.service_secrets,
    )
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=config.grpc_workers),
        interceptors=(AuthenticationInterceptor(authenticator),),
    )
    data_pipeline_pb2_grpc.add_DataPipelineServiceServicer_to_server(
        DataPipelineService(
            repository=repository,
            object_store=object_store,
            authenticator=authenticator,
            upload_max_bytes=config.upload_max_bytes,
        ),
        server,
    )
    bound_port = server.add_insecure_port(f"{config.grpc_host}:{config.grpc_port}")
    if bound_port == 0:
        raise RuntimeError("Could not bind Data Pipeline gRPC port")

    health_server = start_health_server(
        config.health_host,
        config.health_port,
        lambda: database.ready() and object_store.ready(),
    )
    server.start()
    logging.info(
        "Data Pipeline listening on gRPC %s and health %s",
        bound_port,
        health_server.port,
    )
    return Runtime(server, health_server)


def main() -> None:
    config = Config.from_env()
    logging.basicConfig(
        level=getattr(logging, config.log_level),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    runtime = start_server(config)
    stopped = Event()

    def shutdown(_signum: int, _frame: object) -> None:
        stopped.set()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    stopped.wait()
    runtime.stop()


if __name__ == "__main__":
    main()
