/**
 * Claude Reflect 类型定义
 */

// ============ Observation Types ============

export type ObservationType =
  | 'decision'
  | 'bugfix'
  | 'feature'
  | 'refactor'
  | 'discovery'
  | 'change';

export interface Observation {
  id: number;
  memory_session_id: string;
  project: string;
  type: ObservationType;
  title: string | null;
  subtitle: string | null;
  narrative: string | null;
  facts: string[] | null;
  concepts: string[] | null;
  files_read: string[] | null;
  files_modified: string[] | null;
  prompt_number: number | null;
  created_at: string;
  created_at_epoch: number;
}

// ============ Git Types ============

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: string;
  files_changed: number;
  additions: number;
  deletions: number;
  files: GitFileChange[];
}

export interface GitFileChange {
  path: string;
  additions: number;
  deletions: number;
}

// ============ Timeline Types ============

export type TimelineEventSource = 'claude-mem' | 'git';

export interface TimelineEvent {
  id: string;
  source: TimelineEventSource;
  timestamp: number;
  type: string;
  title: string;
  summary: string;
  details: Observation | GitCommit;
}

export interface TimelineStats {
  total_observations: number;
  total_commits: number;
  projects_active: string[];
  by_type: Record<string, number>;
  by_project: Record<string, number>;
}

export interface DailyTimeline {
  date: string;
  events: TimelineEvent[];
  stats: TimelineStats;
}

// ============ Profile Types ============

export type TechnicalLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert' | 'unknown';

export interface UserProfile {
  version: string;
  created_at: string;
  updated_at: string;

  technical_level: {
    overall: TechnicalLevel;
    confidence: number;
    domains: Record<string, TechnicalLevel>;
  };

  strengths: string[];
  weaknesses: string[];

  work_habits: {
    peak_hours: string[];
    avg_session_length_minutes: number;
    multitasking_tendency: 'low' | 'moderate' | 'high';
  };

  learning_preferences: {
    style: 'hands-on' | 'theoretical' | 'mixed';
    depth: 'surface' | 'moderate' | 'deep-dive';
    feedback_receptiveness: 'low' | 'medium' | 'high';
  };

  active_projects: {
    path: string;
    role: string;
  }[];

  profile_corrections: ProfileCorrection[];
}

export interface ProfileCorrection {
  timestamp: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  reason: string;
}

// ============ Reflection Types ============

export type LearningCategory = 'technical' | 'decision' | 'efficiency';

export interface Learning {
  category: LearningCategory;
  content: string;
  confidence: 'high' | 'medium' | 'low';
  source_refs: string[];
}

export interface ReflectionQuestion {
  id: string;
  category: LearningCategory;
  question: string;
  context?: string;
  follow_up?: string;
}

export interface ReflectionSession {
  date: string;
  started_at: string;
  completed_at?: string;
  questions: ReflectionQuestion[];
  answers: Record<string, string>;
  learnings: Learning[];
  profile_updates: Partial<UserProfile>;
}

// ============ Report Types ============

export interface DailyReport {
  date: string;
  generated_at: string;
  summary: {
    active_projects: number;
    total_commits: number;
    total_observations: number;
    primary_focus: Record<string, number>;
  };
  technical_learnings: Learning[];
  decision_analysis: Learning[];
  efficiency_insights: Learning[];
  suggestions: string[];
  raw_data_refs: {
    observations: number[];
    commits: string[];
  };
}

// ============ Availability Types ============

export interface AvailabilityStatus {
  api: boolean;
  db: boolean;
  mode: 'full' | 'api-only' | 'db-only' | 'git-only' | 'unavailable';
}

// ============ Project Reflection Types ============

export interface ProjectReflectionQuestion {
  id: string;
  category: 'decision' | 'pitfall' | 'learning';
  question: string;
  context?: string;
  related_commits?: string[];
  related_observations?: number[];
  follow_up?: string;
}

export interface PitfallSignal {
  type: 'revert' | 'fix' | 'hotfix' | 'high_frequency' | 'massive_refactor' | 'bugfix_observation';
  file?: string;
  date: string;
  commits: string[];
  severity: 'high' | 'medium' | 'low';
  description: string;
}

export interface ProjectStats {
  total_commits: number;
  total_observations: number;
  time_span: {
    start: string;
    end: string;
  };
  contributors: string[];
  core_files: string[];
  by_type: Record<string, number>;
}

export interface ProjectAggregatedData {
  repos: string[];
  commits: GitCommit[];
  observations: Observation[];
  dailyReports: string[];
  pitfalls: PitfallSignal[];
  stats: ProjectStats;
}

export interface ProjectReflectionSession {
  repos: string[];
  since?: string;
  started_at: string;
  completed_at?: string;
  questions: ProjectReflectionQuestion[];
  answers: Record<string, string>;
  learnings: Learning[];
  pitfalls_discussed: PitfallSignal[];
  profile_updates: Partial<UserProfile>;
}

export interface ProjectReport {
  project_name: string;
  repos: string[];
  generated_at: string;
  overview: {
    time_span: { start: string; end: string };
    total_commits: number;
    contributors: string[];
    core_files: string[];
  };
  technical_decisions: {
    title: string;
    background: string;
    choice: string;
    reason: string;
    retrospective: string;
  }[];
  pitfall_records: {
    title: string;
    description: string;
    root_cause: string;
    solution: string;
    lesson: string;
    related_commits: string[];
  }[];
  learnings: Learning[];
  raw_data_refs: {
    observations: number[];
    commits: string[];
  };
}
