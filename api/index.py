"""Vercel Python Serverless entrypoint exposing the Django WSGI application."""

import logging
import os
import sys
import threading
from pathlib import Path

BASE_ROOT = Path(__file__).resolve().parent.parent
DJANGO_PROJECT_DIR = BASE_ROOT / 'myproject'

if str(DJANGO_PROJECT_DIR) not in sys.path:
    sys.path.insert(0, str(DJANGO_PROJECT_DIR))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'myproject.settings')

from myproject.wsgi import app as django_app  # noqa: E402

logger = logging.getLogger(__name__)
_BOOTSTRAP_LOCK = threading.Lock()
_BOOTSTRAPPED = False


def _bootstrap_once():
    """Safely run migrations and seed_demo once per cold start when tables are empty."""
    global _BOOTSTRAPPED
    if _BOOTSTRAPPED:
        return

    with _BOOTSTRAP_LOCK:
        if _BOOTSTRAPPED:
            return
        try:
            from django.contrib.auth import get_user_model
            from django.core.management import call_command
            from django.db import connection
            from store.models import Product

            required_tables = {
                'auth_user',
                'store_product',
                'seller_mesh_cancelledorderrecovery',
            }
            existing_tables = set(connection.introspection.table_names())
            if not required_tables.issubset(existing_tables):
                call_command('migrate', interactive=False, verbosity=0)

            user_model = get_user_model()
            if user_model.objects.count() == 0 or Product.objects.count() == 0:
                call_command('seed_demo', verbosity=0)

            _BOOTSTRAPPED = True
        except Exception as exc:
            logger.warning('Vercel cold-start bootstrap skipped or deferred: %s', exc)
            _BOOTSTRAPPED = True


def app(environ, start_response):
    """WSGI callable required by @vercel/python."""
    _bootstrap_once()
    return django_app(environ, start_response)


handler = app
