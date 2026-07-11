from __future__ import annotations

import unittest
from datetime import UTC, datetime, timedelta

import jwt

from owomide_data_pipeline.auth import AuthenticationError, ServiceAuthenticator

SECRET = "data-pipeline-test-secret-that-is-at-least-32-chars"


def token(
    *,
    subject: str = "gateway_svc",
    audience: str = "data-pipeline",
    issued_at: datetime | None = None,
) -> str:
    now = issued_at or datetime.now(UTC)
    return jwt.encode(
        {
            "iss": "owomide-internal",
            "sub": subject,
            "aud": audience,
            "iat": now,
            "exp": now + timedelta(minutes=2),
        },
        SECRET,
        algorithm="HS256",
    )


def metadata(encoded: str, *, org_id: str = "org-a", user_id: str = "user-a") -> tuple:
    return (
        ("authorization", f"Bearer {encoded}"),
        ("x-org-id", org_id),
        ("x-user-id", user_id),
        ("x-user-roles", "admin,analyst"),
    )


class ServiceAuthenticatorTest(unittest.TestCase):
    def setUp(self) -> None:
        self.authenticator = ServiceAuthenticator(
            issuer="owomide-internal",
            audience="data-pipeline",
            secrets={"gateway_svc": SECRET},
        )

    def test_accepts_signed_gateway_context(self) -> None:
        context = self.authenticator.authenticate(metadata(token()))

        self.assertEqual(context.service_id, "gateway_svc")
        self.assertEqual(context.org_id, "org-a")
        self.assertEqual(context.user_id, "user-a")
        self.assertEqual(context.roles, ("admin", "analyst"))

    def test_rejects_wrong_audience_and_unknown_service(self) -> None:
        for encoded in (token(audience="catalog"), token(subject="proposal_svc")):
            with self.subTest(encoded=encoded), self.assertRaises(AuthenticationError):
                self.authenticator.authenticate(metadata(encoded))

    def test_rejects_missing_tenant_or_user_context(self) -> None:
        for org_id, user_id in (("", "user-a"), ("org-a", "")):
            with (
                self.subTest(org_id=org_id, user_id=user_id),
                self.assertRaises(AuthenticationError),
            ):
                self.authenticator.authenticate(metadata(token(), org_id=org_id, user_id=user_id))

    def test_rejects_stale_token_even_if_expiry_is_longer(self) -> None:
        old = datetime.now(UTC) - timedelta(minutes=6)
        encoded = jwt.encode(
            {
                "iss": "owomide-internal",
                "sub": "gateway_svc",
                "aud": "data-pipeline",
                "iat": old,
                "exp": datetime.now(UTC) + timedelta(minutes=2),
            },
            SECRET,
            algorithm="HS256",
        )
        with self.assertRaises(AuthenticationError):
            self.authenticator.authenticate(metadata(encoded))


if __name__ == "__main__":
    unittest.main()
