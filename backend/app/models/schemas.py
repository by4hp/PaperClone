from enum import Enum
from typing import Optional
from pydantic import BaseModel


class JobStatus(str, Enum):
    pending = "pending"
    parsing = "parsing"
    generating = "generating"
    rendering = "rendering"
    completed = "completed"
    failed = "failed"


class GenerateRequest(BaseModel):
    # Mode 1: pick a built-in paper type (structure known; no reference upload needed)
    paper_type_id: Optional[str] = None
    # Mode 2: upload custom reference paper(s) to mimic
    reference_file_ids: list[str] = []
    # Source material is always required
    source_file_ids: list[str]
    # User-editable header lines for the paper — when paper_type_id is set,
    # these default to the type's values on the client side.
    header_lines: Optional[list[str]] = None
    subtitle: Optional[str] = None
    title: Optional[str] = None  # used for filename + internal reference
    duration_minutes: Optional[int] = 120
    total_score: Optional[int] = 100
    # UI-selected model id (see generator.factory.MODEL_REGISTRY). None ⇒ env default.
    model: Optional[str] = None


class UploadResponse(BaseModel):
    file_id: str
    filename: str
    size: int


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: Optional[str] = None
    output_url: Optional[str] = None
    title: Optional[str] = None
    filename: Optional[str] = None
    created_at: Optional[str] = None
