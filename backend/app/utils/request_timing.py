"""Request-local timings shared with synchronous SQLAlchemy worker threads.

Only durations and query counts are collected; SQL and parameters are never logged.
"""
from contextvars import ContextVar
from dataclasses import dataclass
from time import perf_counter

from sqlalchemy import event


@dataclass
class RequestTiming:
    db_acquire_ms: float = 0.0
    sql_ms: float = 0.0
    sql_count: int = 0


request_timing: ContextVar[RequestTiming | None] = ContextVar("request_timing", default=None)


def instrument_engine(engine):
    """Install once per engine; ContextVar keeps concurrent requests isolated."""
    @event.listens_for(engine, "before_cursor_execute")
    def before_execute(conn, cursor, statement, parameters, context, executemany):
        timing = request_timing.get()
        if timing is not None:
            timing.sql_count += 1
            context._request_sql_started = perf_counter()

    def finish_execute(context):
        started = getattr(context, "_request_sql_started", None)
        timing = request_timing.get()
        if started is not None and timing is not None:
            timing.sql_ms += (perf_counter() - started) * 1000
            context._request_sql_started = None

    @event.listens_for(engine, "after_cursor_execute")
    def after_execute(conn, cursor, statement, parameters, context, executemany):
        finish_execute(context)

    @event.listens_for(engine, "handle_error")
    def on_error(exception_context):
        if exception_context.execution_context is not None:
            finish_execute(exception_context.execution_context)
