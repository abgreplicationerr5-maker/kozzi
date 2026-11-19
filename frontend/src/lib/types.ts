// Hand-written mirrors of backend/models/schemas.py — keep in sync.

export type Device = "desktop" | "tablet" | "phone";

export interface Preferences {
  default_device: Device;
  sidebar_collapsed: boolean;
}

export interface Me {
  user_id: string;
  display_name: string;
  workspace_name: string;
  preferences: Preferences;
  created_at: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  slug: string;
  description: string;
  published: boolean;
  is_sample: boolean;
  generating: boolean;
  version_pointer: number;
  version_count: number;
  has_unpublished_changes: boolean;
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

export interface Message {
  id: string;
  project_id: string;
  role: "user" | "assistant";
  content: string;
  version_number: number | null;
  error: boolean;
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
  is_sample: boolean;
}

export interface Sample {
  id: string;
  title: string;
  slug: string;
  description: string;
  table_count: number;
  record_count: number;
  updated_at: string;
}
