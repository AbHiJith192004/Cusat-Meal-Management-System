from typing import Any


def success_response(
    data: Any = None,
    meta: dict | None = None,
) -> dict:
    """Create a success response dict."""
    response = {"success": True, "data": data}
    if meta:
        response["meta"] = meta
    return response


def error_response(
    code: str,
    message: str,
    details: Any = None,
) -> dict:
    """Create an error response dict."""
    return {
        "success": False,
        "error": {
            "code": code,
            "message": message,
            "details": details,
        },
    }
