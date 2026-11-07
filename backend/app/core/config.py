"""Backend settings, read from the environment (or backend/.env) and validated at startup.

The API refuses to start with missing or unsafe settings and names exactly which
variable is wrong, so a misconfigured checkout fails loudly instead of serving
confusing errors later. See backend/.env.example for every variable.
"""

from __future__ import annotations

import base64
import binascii
import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AliasChoices, AnyHttpUrl, Field, ValidationError, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]

DEFAULT_FRONTEND_ORIGINS = ("http://localhost:3000", "http://127.0.0.1:3000")


class ConfigError(RuntimeError):
    """Raised at startup when the backend environment is missing or unsafe."""


def _jwt_role(key: str) -> str | None:
    """Returns the ``role`` claim of a legacy Supabase JWT key, without trusting it.

    Used only to refuse a service-role key; this is never used to authenticate.
    """
    parts = key.split(".")
    if len(parts) != 3:
        return None
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    try:
        claims = json.loads(base64.urlsafe_b64decode(payload))
    except (binascii.Error, ValueError):
        return None
    role = claims.get("role") if isinstance(claims, dict) else None
    return role if isinstance(role, str) else None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        frozen=True,
    )

    #: Supabase project URL, e.g. https://abcd1234.supabase.co
    supabase_url: AnyHttpUrl
    #: Browser-safe publishable (or legacy anon) key. Never the service-role key.
    supabase_publishable_key: str = Field(
        min_length=20,
        validation_alias=AliasChoices("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
    )
    #: Frontend origins allowed to call the API from a browser (CORS).
    frontend_origins: Annotated[tuple[str, ...], NoDecode] = DEFAULT_FRONTEND_ORIGINS
    #: How long to wait for Supabase before reporting it as unavailable.
    supabase_timeout_seconds: float = Field(default=8.0, gt=0, le=60)

    @field_validator("supabase_publishable_key")
    @classmethod
    def _reject_privileged_keys(cls, key: str) -> str:
        key = key.strip()
        if key.startswith("sb_secret_") or _jwt_role(key) == "service_role":
            raise ValueError(
                "this is a secret/service-role key; use the publishable (anon) key instead"
            )
        return key

    @field_validator("frontend_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return tuple(part.strip() for part in value.split(",") if part.strip())
        return value

    @field_validator("frontend_origins")
    @classmethod
    def _validate_origins(cls, origins: tuple[str, ...]) -> tuple[str, ...]:
        if not origins:
            raise ValueError("list at least one frontend origin")
        for origin in origins:
            parts = urlsplit(origin)
            if (
                parts.scheme not in ("http", "https")
                or not parts.hostname
                or parts.path not in ("", "/")
                or parts.query
                or parts.fragment
            ):
                raise ValueError(
                    f"{origin!r} is not an origin like http://localhost:3000 (no * or paths)"
                )
        return tuple(origin.rstrip("/") for origin in origins)

    @property
    def supabase_base_url(self) -> str:
        return str(self.supabase_url).rstrip("/")


def load_settings() -> Settings:
    """Reads and validates settings, turning validation errors into one clear message."""
    try:
        return Settings()  # values come from the environment
    except ValidationError as error:
        problems = []
        for issue in error.errors():
            name = str(issue["loc"][0]).upper() if issue["loc"] else "settings"
            reason = "is missing" if issue["type"] == "missing" else issue["msg"]
            problems.append(f"  - {name}: {reason}")
        raise ConfigError(
            "The iFit API cannot start because backend settings are missing or invalid:\n"
            + "\n".join(problems)
            + "\nCopy backend/.env.example to backend/.env and fill in your Supabase values."
        ) from None


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return load_settings()
