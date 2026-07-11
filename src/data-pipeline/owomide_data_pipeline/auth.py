from __future__ import annotations

from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime

import grpc
import jwt


class AuthenticationError(ValueError):
    """Raised when internal service or tenant metadata cannot be trusted."""


@dataclass(frozen=True, slots=True)
class RequestContext:
    service_id: str
    org_id: str
    user_id: str
    roles: tuple[str, ...]


def _headers(metadata: Iterable[tuple[str, str]]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for key, value in metadata:
        normalized = key.lower()
        if normalized in headers and normalized in {"authorization", "x-org-id", "x-user-id"}:
            raise AuthenticationError(f"Duplicate {normalized} metadata")
        headers[normalized] = value
    return headers


class ServiceAuthenticator:
    def __init__(
        self,
        *,
        issuer: str,
        audience: str,
        secrets: Mapping[str, str],
        allowed_services: frozenset[str] = frozenset({"gateway_svc"}),
        max_token_age_seconds: int = 300,
    ) -> None:
        self._issuer = issuer
        self._audience = audience
        self._secrets = secrets
        self._allowed_services = allowed_services
        self._max_token_age_seconds = max_token_age_seconds

    def authenticate(self, metadata: Iterable[tuple[str, str]]) -> RequestContext:
        headers = _headers(metadata)
        authorization = headers.get("authorization", "")
        if not authorization.startswith("Bearer "):
            raise AuthenticationError("Missing service credential")
        token = authorization[7:]

        try:
            unverified = jwt.decode(
                token,
                options={
                    "verify_signature": False,
                    "verify_aud": False,
                    "verify_exp": False,
                },
            )
        except jwt.PyJWTError as exc:
            raise AuthenticationError("Invalid service credential") from exc

        subject = unverified.get("sub")
        if not isinstance(subject, str) or subject not in self._allowed_services:
            raise AuthenticationError("Caller is not authorized")
        secret = self._secrets.get(subject)
        if secret is None:
            raise AuthenticationError("Invalid service credential")

        try:
            claims = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                audience=self._audience,
                issuer=self._issuer,
                leeway=5,
                options={"require": ["sub", "iat", "exp"]},
            )
        except jwt.PyJWTError as exc:
            raise AuthenticationError("Invalid or expired service credential") from exc

        issued_at = claims.get("iat")
        if isinstance(issued_at, bool) or not isinstance(issued_at, int | float):
            raise AuthenticationError("Invalid service credential")
        age_seconds = datetime.now(UTC).timestamp() - issued_at
        if age_seconds > self._max_token_age_seconds or age_seconds < -30:
            raise AuthenticationError("Invalid or expired service credential")

        org_id = headers.get("x-org-id", "").strip()
        user_id = headers.get("x-user-id", "").strip()
        if not org_id or not user_id:
            raise AuthenticationError("Missing authenticated tenant or user context")
        roles = tuple(
            role.strip() for role in headers.get("x-user-roles", "").split(",") if role.strip()
        )
        return RequestContext(service_id=subject, org_id=org_id, user_id=user_id, roles=roles)


def _denied_handler(handler: grpc.RpcMethodHandler, message: str) -> grpc.RpcMethodHandler:
    def deny(_request: object, context: grpc.ServicerContext) -> None:
        context.abort(grpc.StatusCode.UNAUTHENTICATED, message)

    kwargs = {
        "request_deserializer": handler.request_deserializer,
        "response_serializer": handler.response_serializer,
    }
    if handler.request_streaming and handler.response_streaming:
        return grpc.stream_stream_rpc_method_handler(deny, **kwargs)
    if handler.request_streaming:
        return grpc.stream_unary_rpc_method_handler(deny, **kwargs)
    if handler.response_streaming:
        return grpc.unary_stream_rpc_method_handler(deny, **kwargs)
    return grpc.unary_unary_rpc_method_handler(deny, **kwargs)


class AuthenticationInterceptor(grpc.ServerInterceptor):
    def __init__(self, authenticator: ServiceAuthenticator) -> None:
        self._authenticator = authenticator

    def intercept_service(
        self,
        continuation: Callable[[grpc.HandlerCallDetails], grpc.RpcMethodHandler | None],
        handler_call_details: grpc.HandlerCallDetails,
    ) -> grpc.RpcMethodHandler | None:
        handler = continuation(handler_call_details)
        if handler is None:
            return None
        try:
            self._authenticator.authenticate(handler_call_details.invocation_metadata or ())
        except AuthenticationError:
            return _denied_handler(handler, "Invalid internal service or tenant credential")
        return handler
