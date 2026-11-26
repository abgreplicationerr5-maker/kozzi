// Hand-written mirrors of backend/models/schemas.py. Keep in sync.

export type Device = "desktop" | "tablet" | "phone";
export type Access = "owner" | "publisher" | "editor" | "viewer";
export type TeamRole = "viewer" | "editor" | "publisher";

export interface Preferences {
  default_device: Device;
  sidebar_collapsed: boolean;
}

export interface Me {
  user_id: string;
  display_name: string;
  workspace_name: string;
  email: string;
  username: string;
  bio: string;
  avatar_url: string;
  role: "admin" | "member";
  plan: string;
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
  is_owner: boolean;
  shared_by: string;
  access: Access;
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
  show_badge: boolean;
}

export interface GalleryApp {
  id: string;
  title: string;
  slug: string;
  description: string;
  record_count: number;
  views: number;
  owner_username: string;
  owner_name: string;
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
  kind: "builder" | "notify" | "receipt" | "enquiry";
  reply_to: string;
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

export interface PlanLimits {
  projects: number | null;
  live: number | null;
  domains: boolean;
  badge: boolean;
  emails_per_day: number;
  seats: number;
}

export interface PlanInfo {
  id: string;
  label: string;
  limits: PlanLimits;
}

export interface PriceOption {
  lookup_key: string;
  plan: string;
  interval: "month" | "year";
  amount: number;
}

export interface Invoice {
  id: string;
  number: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
  hosted_url: string;
  pdf_url: string;
}

export interface Billing {
  plan: string;
  label: string;
  interval: string;
  status: string;
  source: string;
  period_end: string | null;
  cancel_at_period_end: boolean;
  has_subscription: boolean;
  limits: PlanLimits;
  usage: { projects: number; live: number; seats: number };
  invoices: Invoice[];
  prices: PriceOption[];
  plans: PlanInfo[];
}

export interface CheckoutOut {
  checkout_url: string;
  session_id: string;
}

export interface PaymentStatus {
  session_id: string;
  status: string;
  payment_status: string;
}

export interface TeamMember {
  id: string;
  email: string;
  status: "invited" | "active";
  role: TeamRole;
  display_name: string;
  created_at: string;
  joined_at: string | null;
}

export interface Membership {
  owner_id: string;
  owner_name: string;
  owner_email: string;
  active: boolean;
  role: TeamRole;
}

export interface Team {
  seats: number;
  used: number;
  can_invite: boolean;
  members: TeamMember[];
  memberships: Membership[];
}

export interface Profile {
  username: string;
  display_name: string;
  bio: string;
  avatar_url: string;
  joined_at: string;
  apps: GalleryApp[];
}

export type EnquiryStatus = "new" | "contacted" | "won" | "closed";

export interface Enquiry {
  id: string;
  name: string;
  email: string;
  company: string;
  team_size: string;
  message: string;
  status: EnquiryStatus;
  created_at: string;
}

export interface AdminPayment {
  session_id: string;
  user_id: string;
  email: string;
  lookup_key: string;
  amount: number;
  currency: string;
  status: string;
  payment_status: string;
  created_at: string;
}

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  username: string;
  role: string;
  plan: string;
  plan_source: string;
  projects: number;
}

export interface AdminUsers {
  roles: string[];
  users: AdminUser[];
}

export interface UsageInfo {
  plan: string;
  label: string;
  limits: PlanLimits;
  usage: { projects: number; live: number; seats: number };
}

export interface Coupon {
  id: string;
  code: string;
  percent_off: number | null;
  amount_off: number | null;
  duration: string;
  duration_in_months: number | null;
  times_redeemed: number;
  max_redemptions: number | null;
  expires_at: string | null;
  active: boolean;
}
