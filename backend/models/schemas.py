from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class Preferences(BaseModel):
    default_device: Literal["desktop", "tablet", "phone"] = "desktop"
    sidebar_collapsed: bool = False


class Me(BaseModel):
    user_id: str
    display_name: str = ""
    workspace_name: str = ""
    email: str = ""
    preferences: Preferences = Field(default_factory=Preferences)
    created_at: datetime


class MeUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=80)
    workspace_name: Optional[str] = Field(default=None, max_length=80)
    preferences: Optional[Preferences] = None


class ProjectSummary(BaseModel):
    id: str
    title: str
    slug: str
    description: str = ""
    published: bool = False
    in_gallery: bool = False
    generating: bool = False
    gen_phase: str = ""
    version_pointer: int = 0
    version_count: int = 0
    has_unpublished_changes: bool = False
    views: int = 0
    custom_domain: str = ""
    domain_status: Literal["", "pending", "connected", "failed"] = ""
    domain_detail: str = ""
    domain_checked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None


class Project(ProjectSummary):
    html: str = ""
    gen_error: str = ""
    gen_chars: int = 0
    can_undo: bool = False
    can_redo: bool = False


class ProjectCreate(BaseModel):
    prompt: str = Field(default="", max_length=8000)
    title: str = Field(default="", max_length=120)


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = Field(default=None, max_length=400)


class ChatIn(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


MessageKind = Literal["user", "plan", "action", "build", "error", "note"]


class Message(BaseModel):
    id: str
    project_id: str
    role: Literal["user", "assistant"]
    kind: MessageKind = "note"
    content: str
    version_number: Optional[int] = None
    error: bool = False
    meta: dict[str, Any] = {}
    created_at: datetime


class Version(BaseModel):
    id: str
    project_id: str
    number: int
    label: str
    created_at: datetime


class PublishIn(BaseModel):
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    in_gallery: Optional[bool] = None


class DomainIn(BaseModel):
    domain: str = Field(min_length=4, max_length=260)


class GalleryIn(BaseModel):
    in_gallery: bool


class TableInfo(BaseModel):
    name: str
    columns: list[str] = []
    count: int = 0


class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")
    columns: list[str] = []


class ColumnCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)


class RecordOut(BaseModel):
    id: str
    table: str
    data: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class RecordIn(BaseModel):
    data: dict[str, Any] = {}


class AiIn(BaseModel):
    prompt: str = Field(min_length=1, max_length=6000)
    system: str = Field(default="", max_length=2000)


class AiOut(BaseModel):
    text: str


class PublicApp(BaseModel):
    title: str
    slug: str
    html: str


class GalleryApp(BaseModel):
    id: str
    title: str
    slug: str
    description: str = ""
    record_count: int = 0
    views: int = 0
    updated_at: datetime


# ---------- email ----------

class EmailNotifyIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)


class EmailReceiptIn(BaseModel):
    table: str = Field(min_length=1, max_length=64)
    record_id: str = Field(min_length=1, max_length=64)


class EmailOut(BaseModel):
    ok: bool
    to: str = ""


class EmailLog(BaseModel):
    id: str
    kind: Literal["builder", "notify", "receipt"]
    to: str
    subject: str
    ok: bool
    created_at: datetime


# ---------- stats ----------

class DayStat(BaseModel):
    day: str
    views: int = 0
    records: int = 0


class Stats(BaseModel):
    views_total: int = 0
    views_today: int = 0
    records_total: int = 0
    tables_total: int = 0
    emails_total: int = 0
    days: list[DayStat] = []
    recent_emails: list[EmailLog] = []


# ---------- bin ----------

class TrashProject(BaseModel):
    id: str
    title: str
    deleted_at: datetime


class TrashTable(BaseModel):
    project_id: str
    project_title: str
    name: str
    rows: int = 0
    deleted_at: datetime


class TrashRecord(BaseModel):
    id: str
    project_id: str
    project_title: str
    table: str
    preview: str = ""
    deleted_at: datetime


class Trash(BaseModel):
    projects: list[TrashProject] = []
    tables: list[TrashTable] = []
    records: list[TrashRecord] = []
