from typing import List
from pydantic import BaseModel


class SearchResult(BaseModel):
    kind: str
    id: int
    label: str
    subtitle: str | None = None
    href: str


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]

