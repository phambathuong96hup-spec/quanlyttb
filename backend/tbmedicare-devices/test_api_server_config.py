import inspect
import os
import sys
import unittest

from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import api_server
import db_manager


def _constraint_value(query_default, attribute):
    for item in getattr(query_default, "metadata", []):
        value = getattr(item, attribute, None)
        if value is not None:
            return value
    return None


class ApiServerConfigTests(unittest.TestCase):
    def test_cors_uses_explicit_allowlist(self):
        middleware = next(
            item for item in api_server.app.user_middleware
            if item.cls is CORSMiddleware
        )

        self.assertNotEqual(middleware.kwargs["allow_origins"], ["*"])
        self.assertGreater(len(middleware.kwargs["allow_origins"]), 0)

    def test_page_and_limit_are_validated_at_api_boundary(self):
        for handler_name in ("api_devices_in_use", "api_history"):
            signature = inspect.signature(getattr(api_server, handler_name))
            page = signature.parameters["page"].default
            limit = signature.parameters["limit"].default

            self.assertEqual(_constraint_value(page, "ge"), 1)
            self.assertEqual(_constraint_value(limit, "ge"), 1)
            self.assertEqual(_constraint_value(limit, "le"), 200)

    def test_db_pagination_normalization_clamps_unsafe_values(self):
        self.assertEqual(db_manager._normalize_pagination(0, 5000), (1, 200))
        self.assertEqual(db_manager._normalize_pagination("bad", None), (1, 50))
        self.assertEqual(db_manager._normalize_pagination(3, 25), (3, 25))


if __name__ == "__main__":
    unittest.main()
