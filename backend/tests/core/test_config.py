"""Startup settings validation."""

from __future__ import annotations

import base64
import json

import pytest

from app.core.config import ConfigError, Settings, load_settings

URL = "https://test-project.supabase.co"
KEY = "sb_publishable_test_key_for_unit_tests"


def legacy_jwt(role: str) -> str:
    def encode(part: dict[str, str]) -> str:
        return base64.urlsafe_b64encode(json.dumps(part).encode()).decode().rstrip("=")

    return f"{encode({'alg': 'HS256'})}.{encode({'role': role, 'iss': 'supabase'})}.sig"


@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    for name in (
        "SUPABASE_URL",
        "SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_ANON_KEY",
        "FRONTEND_ORIGINS",
        "SUPABASE_TIMEOUT_SECONDS",
    ):
        monkeypatch.delenv(name, raising=False)
    # Ignore any developer backend/.env so tests only see what they set.
    monkeypatch.setitem(Settings.model_config, "env_file", None)
    return monkeypatch


def test_reads_valid_settings_from_the_environment(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("SUPABASE_URL", URL + "/")
    clean_env.setenv("SUPABASE_PUBLISHABLE_KEY", KEY)
    settings = load_settings()
    assert settings.supabase_base_url == URL
    assert settings.supabase_publishable_key == KEY
    assert settings.frontend_origins == ("http://localhost:3000", "http://127.0.0.1:3000")


def test_accepts_the_legacy_anon_key_name(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("SUPABASE_URL", URL)
    clean_env.setenv("SUPABASE_ANON_KEY", legacy_jwt("anon"))
    assert load_settings().supabase_publishable_key == legacy_jwt("anon")


def test_names_every_missing_variable(clean_env: pytest.MonkeyPatch) -> None:
    with pytest.raises(ConfigError) as caught:
        load_settings()
    message = str(caught.value)
    assert "SUPABASE_URL: is missing" in message
    assert "SUPABASE_PUBLISHABLE_KEY: is missing" in message
    assert "backend/.env.example" in message


def test_rejects_a_url_that_is_not_http(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("SUPABASE_URL", "not a url")
    clean_env.setenv("SUPABASE_PUBLISHABLE_KEY", KEY)
    with pytest.raises(ConfigError, match="SUPABASE_URL"):
        load_settings()


@pytest.mark.parametrize("key", ["sb_secret_abcdefghijklmnopqrstuvwxyz", legacy_jwt("service_role")])
def test_refuses_to_start_with_a_service_role_key(
    clean_env: pytest.MonkeyPatch, key: str
) -> None:
    clean_env.setenv("SUPABASE_URL", URL)
    clean_env.setenv("SUPABASE_PUBLISHABLE_KEY", key)
    with pytest.raises(ConfigError, match="service-role key"):
        load_settings()


def test_parses_comma_separated_frontend_origins(clean_env: pytest.MonkeyPatch) -> None:
    clean_env.setenv("SUPABASE_URL", URL)
    clean_env.setenv("SUPABASE_PUBLISHABLE_KEY", KEY)
    clean_env.setenv("FRONTEND_ORIGINS", " http://localhost:3000 , http://localhost:3001/ ")
    assert load_settings().frontend_origins == ("http://localhost:3000", "http://localhost:3001")


@pytest.mark.parametrize(
    "origins", ["*", "localhost:3000", "http://localhost:3000/app", "ftp://localhost", ""]
)
def test_rejects_unsafe_or_malformed_origins(
    clean_env: pytest.MonkeyPatch, origins: str
) -> None:
    clean_env.setenv("SUPABASE_URL", URL)
    clean_env.setenv("SUPABASE_PUBLISHABLE_KEY", KEY)
    clean_env.setenv("FRONTEND_ORIGINS", origins)
    with pytest.raises(ConfigError, match="FRONTEND_ORIGINS"):
        load_settings()
