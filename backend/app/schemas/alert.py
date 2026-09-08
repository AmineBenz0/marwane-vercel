"""API schemas for persistent alerts."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AlerteRead(BaseModel):
    id_alerte: int
    id_transaction: Optional[int] = None
    type_alerte: str
    titre: str
    message: str
    date_reference: date
    est_lue: bool
    date_lecture: Optional[datetime] = None
    date_creation: datetime

    model_config = ConfigDict(from_attributes=True)


class AlerteSummary(BaseModel):
    unread_count: int
    items: list[AlerteRead] = Field(default_factory=list)
