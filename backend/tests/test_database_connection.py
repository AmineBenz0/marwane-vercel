"""Runtime pooling must not pin Supabase session connections in serverless."""
import runpy
from unittest.mock import patch

import pytest
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from app.config import settings
from app.utils.database_connection import runtime_database_url


@pytest.mark.parametrize('environment', ['preview', 'production'])
def test_serverless_uses_transaction_pooler_preserving_credentials_and_options(environment):
    original = make_url('postgresql://app_runtime.project:test%40pass@aws-1-eu-west-3.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=10')
    resolved = make_url(runtime_database_url(original.render_as_string(hide_password=False), environment))
    assert resolved.port == 6543
    assert resolved.set(port=5432) == original


@pytest.mark.parametrize('url,environment', [
    ('postgresql://user:pass@localhost:5432/test', 'preview'),
    ('postgresql://user:pass@db.project.supabase.co:5432/postgres', 'production'),
    ('postgresql://user:pass@aws-1-eu-west-3.pooler.supabase.com:6543/postgres', 'preview'),
    ('postgresql://user:pass@aws-1-eu-west-3.pooler.supabase.com:5432/postgres', 'development'),
    ('sqlite:///:memory:', 'testing'),
])
def test_other_connection_modes_are_preserved(url, environment):
    assert runtime_database_url(url, environment) == url


def test_normalized_session_url_activates_existing_null_pool():
    url = 'postgres://app_runtime.project:test@aws-1-eu-west-3.pooler.supabase.com:5432/postgres'
    with patch.object(settings, 'DATABASE_URL', url), patch.object(settings, 'ENVIRONMENT', 'preview'), \
            patch('sqlalchemy.create_engine') as create, \
            patch('app.utils.request_timing.instrument_engine'):
        runpy.run_path('app/database.py')
    args, options = create.call_args
    assert make_url(args[0]).port == 6543
    assert options['poolclass'] is NullPool
    assert options['connect_args']['sslmode'] == 'require'
    assert 'pool_size' not in options
