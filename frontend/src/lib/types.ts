// Hand-written mirrors of backend/models/schemas.py. Keep in sync.

export type Device = "desktop" | "tablet" | "phone";

export interface Preferences {
  default_device: Device;
  sidebar_collapsed: boolean;
}

export interface Me {
  user_id: string;
  display_name: string;
  workspace_name: string;
  email: string;
  preferences: Preferences;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  slug: string;
  description: string;
  published: boolean;
  in_gallery: boolean;
  generating: boolean;
  gen_phase: string;
  version_pointer: number;
  version_count: number;
  has_unpublished_changes: boolean;
  views: number;
  custom_domain: string;
  domain_status: "" | "pending" | "connected" | "failed";
  domain_detail: string;
  domain_checked_at: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export interface Project extends ProjectSummary {
  html: string;
  gen_error: string;
  gen_chars: number;
  can_undo: boolean;
  can_redo: boolean;
}

export type MessageKind = "user" | "plan" | "action" | "build" | "error" | "note";

export interface Message {
  id: string;
  project_id: string;
  role: "user" | "assistant";
  kind: MessageKind;
  content: string;
  version_number: number | null;
  error: boolean;
  meta: { action?: string; ok?: boolean; retry?: boolean } & Record<string, unknown>;
  created_at: string;
}

export interface Version {
  id: string;
  project_id: string;
  number: number;
  label: string;
  created_at: string;
}

export interface TableInfo {
  name: string;
  columns: string[];
  count: number;
}

export interface RecordOut {
  id: string;
  table: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AiOut {
  text: string;
}

export interface PublicApp {
  title: string;
  slug: string;
  html: string;
}

export interface GalleryApp {
  id: string;
  title: string;
  slug: string;
  description: string;
  record_count: number;
  views: number;
  updated_at: string;
}

export type EmailStatus = "sent" | "queued" | "failed" | "sent_manually";

export interface EmailOut {
  ok: boolean;
  to: string;
  status: EmailStatus;
}

export interface EmailLog {
  id: string;
  kind: "builder" | "notify" | "receipt";
  to: string;
  subject: string;
  ok: boolean;
  status: EmailStatus;
  created_at: string;
}

export interface InboxEmail {
  id: string;
  project_id: string;
  project_title: string;
  kind: "builder" | "notify" | "receipt";
  to: string;
  subject: string;
  text: string;
  status: EmailStatus;
  last_error: string;
  read: boolean;
  created_at: string;
  sent_at: string | null;
}

export interface Inbox {
  emails: InboxEmail[];
  unread: number;
  queued: number;
  paused_reason: string;
}

export interface FlushOut {
  sent: number;
  queued: number;
}

export interface DayStat {
  day: string;
  views: number;
  records: number;
}

export interface Stats {
  views_total: number;
  views_today: number;
  records_total: number;
  tables_total: number;
  emails_total: number;
  days: DayStat[];
  recent_emails: EmailLog[];
}

export interface TrashProject {
  id: string;
  title: string;
  deleted_at: string;
}

export interface TrashTable {
  project_id: string;
  project_title: string;
  name: string;
  rows: number;
  deleted_at: string;
}

export interface TrashRecord {
  id: string;
  project_id: string;
  project_title: string;
  table: string;
  preview: string;
  deleted_at: string;
}

export interface Trash {
  projects: TrashProject[];
  tables: TrashTable[];
  records: TrashRecord[];
}
