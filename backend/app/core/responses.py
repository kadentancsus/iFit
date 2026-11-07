"""The shared ``{ data, error }`` response shape and error handling for every endpoint.

Every response body, success or failure, has exactly two keys:

    { "data": <payload or null>, "error": null | { "code", "message", "field"? } }

``code`` is stable and meant for code; ``message`` is safe to show to the user.
Feature routers raise :class:`ApiError` and return :func:`ok`.
"""

from __future__ import annotations

import logging
from typing import Any, Generic, TypeVar

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("ifit.api")

T = TypeVar("T")


class ErrorBody(BaseModel):
    code: str
    message: str
    field: str | None = None


class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
    error: ErrorBody | None = None


class ApiError(Exception):
    """An expected failure with a stable code and a user-safe message."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        *,
        field: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.field = field
        self.headers = headers


def ok(data: T) -> ApiResponse[T]:
    return ApiResponse[T](data=data)


def error_response(
    status_code: int,
    code: str,
    message: str,
    *,
    field: str | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ApiResponse[Any](error=ErrorBody(code=code, message=message, field=field))
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(body, exclude_none=False),
        headers=headers,
    )


_HTTP_ERRORS = {
    400: ("bad_request", "That request could not be understood."),
    401: ("not_authenticated", "Please sign in to continue."),
    403: ("forbidden", "You don't have access to that."),
    404: ("not_found", "That page or record doesn't exist."),
    405: ("method_not_allowed", "That action isn't supported here."),
    413: ("payload_too_large", "That request is too large."),
    429: ("rate_limited", "Too many requests. Please wait a moment and try again."),
}


def _field_path(location: tuple[Any, ...] | list[Any]) -> str | None:
    # Drop the "body"/"query"/"path" prefix so the path matches the input field.
    parts = [str(part) for part in location[1:]]
    return ".".join(parts) or None


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(_: Request, error: ApiError) -> JSONResponse:
        return error_response(
            error.status_code, error.code, error.message, field=error.field, headers=error.headers
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, error: RequestValidationError) -> JSONResponse:
        first = error.errors()[0] if error.errors() else {}
        return error_response(
            422,
            "invalid_input",
            "Some of the information sent was missing or invalid.",
            field=_field_path(first.get("loc", ())),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(_: Request, error: StarletteHTTPException) -> JSONResponse:
        code, message = _HTTP_ERRORS.get(
            error.status_code, ("request_failed", "That request could not be completed.")
        )
        headers = dict(error.headers) if error.headers else None
        return error_response(error.status_code, code, message, headers=headers)

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, error: Exception) -> JSONResponse:
        # Log the details server-side only; never send internals to the client.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return error_response(
            500,
            "internal_error",
            "Something went wrong on our side. Nothing was saved; please try again.",
        )
