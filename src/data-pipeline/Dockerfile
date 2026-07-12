FROM python:3.12-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:${PATH}"

COPY src/data-pipeline/requirements.lock ./src/data-pipeline/requirements.lock
RUN pip install --require-hashes --requirement ./src/data-pipeline/requirements.lock

FROM python:3.12-slim

ENV PATH="/opt/venv/bin:${PATH}" \
    PYTHONPATH="/app/src/data-pipeline:/app/src/lib/proto/gen/py:/app/src/lib/bus/py" \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
RUN groupadd --system owomide && useradd --system --gid owomide --home /app owomide

COPY --from=builder /opt/venv /opt/venv
COPY src/data-pipeline/owomide_data_pipeline ./src/data-pipeline/owomide_data_pipeline
COPY src/lib/bus/py/owomide_bus ./src/lib/bus/py/owomide_bus
COPY src/lib/proto/gen/py ./src/lib/proto/gen/py

USER owomide
EXPOSE 50055 8080
CMD ["python", "-m", "owomide_data_pipeline.server"]
