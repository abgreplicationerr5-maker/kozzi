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
    username: str = ""
    bio: str = ""
    avatar_url: str = ""
    role: Literal["admin", "member"] = "member"
    plan: str = "free"
    preferences: Preferences = Field(default_factory=Preferences)
    created_at: datetime


class MeUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=80)
    workspace_name: Optional[str] = Field(default=None, max_length=80)
    username: Optional[str] = Field(default=None, min_length=3, max_length=30, pattern=r"^[a-z0-9_-]+$")
    bio: Optional[str] = Field(default=None, max_length=280)
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
    is_owner: bool = True
    shared_by: str = ""
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
    show_badge: bool = True


class GalleryApp(BaseModel):
    id: str
    title: str
    slug: str
    description: str = ""
    record_count: int = 0
    views: int = 0
    owner_username: str = ""
    owner_name: str = ""
    updated_at: datetime


# ---------- email ----------

class EmailNotifyIn(BaseModel):
    subject: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=2000)


class EmailReceiptIn(BaseModel):
    table: str = Field(min_length=1, max_length=64)
    record_id: str = Field(min_length=1, max_length=64)


EmailStatus = Literal["sent", "queued", "failed", "sent_manually"]


class EmailOut(BaseModel):
    ok: bool
    to: str = ""
    status: EmailStatus = "sent"


class EmailLog(BaseModel):
    id: str
    kind: Literal["builder", "notify", "receipt"]
    to: str
    subject: str
    ok: bool
    status: EmailStatus = "sent"
    created_at: datetime


class InboxEmail(BaseModel):
    id: str
    project_id: str
    project_title: str
    kind: Literal["builder", "notify", "receipt"]
    to: str
    subject: str
    text: str = ""
    status: EmailStatus
    last_error: str = ""
    read: bool = False
    created_at: datetime
    sent_at: Optional[datetime] = None


class Inbox(BaseModel):
    emails: list[InboxEmail] = []
    unread: int = 0
    queued: int = 0
    paused_reason: str = ""


class FlushOut(BaseModel):
    sent: int = 0
    queued: int = 0


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


# ---------- plans + billing ----------

class PlanLimits(BaseModel):
    projects: Optional[int] = None
    live: Optional[int] = None
    domains: bool = False
    badge: bool = True
    emails_per_day: int = 10
    seats: int = 1


class PlanInfo(BaseModel):
    id: str
    label: str
    limits: PlanLimits


class PriceOption(BaseModel):
    lookup_key: str
    plan: str
    interval: Literal["month", "year"]
    amount: float


class Invoice(BaseModel):
    id: str
    number: str = ""
    amount: float
    currency: str
    status: str
    created_at: datetime
    hosted_url: str = ""
    pdf_url: str = ""


class Usage(BaseModel):
    projects: int = 0
    live: int = 0
    seats: int = 1


class Billing(BaseModel):
    plan: str
    label: str
    interval: str = ""
    status: str = ""
    source: str = ""
    period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    has_subscription: bool = False
    limits: PlanLimits
    usage: Usage
    invoices: list[Invoice] = []
    prices: list[PriceOption] = []
    plans: list[PlanInfo] = []


class CheckoutIn(BaseModel):
    lookup_key: str = Field(min_length=1, max_length=40)
    origin_url: str = Field(min_length=8, max_length=300)


class CheckoutOut(BaseModel):
    checkout_url: str
    session_id: str


class ChangePlanIn(BaseModel):
    lookup_key: str = Field(min_length=1, max_length=40)


class PaymentStatus(BaseModel):
    session_id: str
    status: str
    payment_status: str


# ---------- team ----------

class TeamMember(BaseModel):
    id: str
    email: str
    status: Literal["invited", "active"]
    display_name: str = ""
    created_at: datetime
    joined_at: Optional[datetime] = None


class Membership(BaseModel):
    owner_id: str
    owner_name: str
    owner_email: str = ""
    active: bool = True


class Team(BaseModel):
    seats: int
    used: int
    can_invite: bool
    members: list[TeamMember] = []
    memberships: list[Membership] = []


class InviteIn(BaseModel):
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ---------- profiles ----------

class Profile(BaseModel):
    username: str
    display_name: str = ""
    bio: str = ""
    avatar_url: str = ""
    joined_at: datetime
    apps: list[GalleryApp] = []


# ---------- enquiries + admin ----------

class EnquiryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=5, max_length=200, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    company: str = Field(min_length=1, max_length=120)
    team_size: Literal["1-10", "11-50", "51-200", "201-1000", "1000+"]
    message: str = Field(default="", max_length=3000)


EnquiryStatus = Literal["new", "contacted", "won", "closed"]


class Enquiry(BaseModel):
    id: str
    name: str
    email: str
    company: str
    team_size: str
    message: str = ""
    status: EnquiryStatus = "new"
    created_at: datetime


class EnquiryUpdate(BaseModel):
    status: EnquiryStatus


class AdminPayment(BaseModel):
    session_id: str
    user_id: str = ""
    email: str = ""
    lookup_key: str = ""
    amount: float = 0
    currency: str = "usd"
    status: str
    payment_status: str
    created_at: datetime


class AdminUser(BaseModel):
    user_id: str
    email: str = ""
    display_name: str = ""
    username: str = ""
    role: str
    plan: str
    plan_source: str = ""
    projects: int = 0


class AdminUsers(BaseModel):
    roles: list[str]
    users: list[AdminUser]


class RoleIn(BaseModel):
    role: str


class PlanGrantIn(BaseModel):
    plan: Literal["free", "pro", "team", "enterprise"]
    months: Optional[int] = Field(default=None, ge=1, le=60)
