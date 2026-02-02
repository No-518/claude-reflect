/**
 * User Profile Manager
 *
 * Manage user profile creation, reading, and updating
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { UserProfile, ProfileCorrection, TechnicalLevel } from '../types';
import { PROFILE_PATH, ensureReflectDirs } from '../utils/paths';

/** Default user profile */
const DEFAULT_PROFILE: UserProfile = {
  version: '1.0',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),

  technical_level: {
    overall: 'unknown',
    confidence: 0,
    domains: {},
  },

  strengths: [],
  weaknesses: [],

  work_habits: {
    peak_hours: [],
    avg_session_length_minutes: 0,
    multitasking_tendency: 'moderate',
  },

  learning_preferences: {
    style: 'mixed',
    depth: 'moderate',
    feedback_receptiveness: 'medium',
  },

  active_projects: [],
  profile_corrections: [],
};

export class ProfileManager {
  private profilePath: string;
  private profile: UserProfile | null = null;

  constructor(profilePath: string = PROFILE_PATH) {
    this.profilePath = profilePath;
  }

  /**
   * Create deep copy of default profile
   */
  private createDefaultProfile(): UserProfile {
    return {
      version: DEFAULT_PROFILE.version,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      technical_level: {
        overall: DEFAULT_PROFILE.technical_level.overall,
        confidence: DEFAULT_PROFILE.technical_level.confidence,
        domains: { ...DEFAULT_PROFILE.technical_level.domains },
      },
      strengths: [...DEFAULT_PROFILE.strengths],
      weaknesses: [...DEFAULT_PROFILE.weaknesses],
      work_habits: {
        peak_hours: [...DEFAULT_PROFILE.work_habits.peak_hours],
        avg_session_length_minutes: DEFAULT_PROFILE.work_habits.avg_session_length_minutes,
        multitasking_tendency: DEFAULT_PROFILE.work_habits.multitasking_tendency,
      },
      learning_preferences: { ...DEFAULT_PROFILE.learning_preferences },
      active_projects: [],
      profile_corrections: [],
    };
  }

  /**
   * Initialize profile (create if not exists)
   */
  initialize(): UserProfile {
    ensureReflectDirs();

    if (existsSync(this.profilePath)) {
      return this.load();
    }

    const profile = this.createDefaultProfile();
    this.save(profile);
    this.profile = profile;

    return profile;
  }

  /**
   * Load profile
   */
  load(): UserProfile {
    if (this.profile) {
      return this.profile;
    }

    if (!existsSync(this.profilePath)) {
      return this.initialize();
    }

    try {
      const content = readFileSync(this.profilePath, 'utf-8');
      this.profile = JSON.parse(content);
      return this.profile!;
    } catch (error) {
      console.error('Failed to load profile:', error);
      // Return default profile without overwriting file (use deep copy)
      return this.createDefaultProfile();
    }
  }

  /**
   * Save profile
   */
  save(profile?: UserProfile): void {
    const toSave = profile || this.profile;
    if (!toSave) return;

    toSave.updated_at = new Date().toISOString();
    ensureReflectDirs();
    writeFileSync(this.profilePath, JSON.stringify(toSave, null, 2));
    this.profile = toSave;
  }

  /**
   * Get current profile
   */
  get(): UserProfile {
    return this.load();
  }

  /**
   * Update profile fields
   */
  update(updates: Partial<UserProfile>): UserProfile {
    const profile = this.load();

    // Deep merge
    const updated = this.deepMerge(profile, updates) as UserProfile;
    updated.updated_at = new Date().toISOString();

    this.save(updated);
    return updated;
  }

  /**
   * Add technical domain
   */
  addDomain(domain: string, level: TechnicalLevel): void {
    const profile = this.load();
    profile.technical_level.domains[domain] = level;
    this.save(profile);
  }

  /**
   * Add strength
   */
  addStrength(strength: string): void {
    const profile = this.load();
    if (!profile.strengths.includes(strength)) {
      profile.strengths.push(strength);
      this.save(profile);
    }
  }

  /**
   * Add weakness
   */
  addWeakness(weakness: string): void {
    const profile = this.load();
    if (!profile.weaknesses.includes(weakness)) {
      profile.weaknesses.push(weakness);
      this.save(profile);
    }
  }

  /**
   * Add active project
   */
  addProject(path: string, role: string = 'contributor'): void {
    const profile = this.load();
    const exists = profile.active_projects.some((p) => p.path === path);
    if (!exists) {
      profile.active_projects.push({ path, role });
      this.save(profile);
    }
  }

  /**
   * Remove active project
   */
  removeProject(path: string): void {
    const profile = this.load();
    profile.active_projects = profile.active_projects.filter((p) => p.path !== path);
    this.save(profile);
  }

  /**
   * Record profile correction
   */
  recordCorrection(
    field: string,
    oldValue: unknown,
    newValue: unknown,
    reason: string
  ): void {
    const profile = this.load();

    const correction: ProfileCorrection = {
      timestamp: new Date().toISOString(),
      field,
      old_value: oldValue,
      new_value: newValue,
      reason,
    };

    profile.profile_corrections.push(correction);
    this.save(profile);
  }

  /**
   * Apply correction
   */
  applyCorrection(field: string, newValue: unknown, reason: string): void {
    const profile = this.load();
    const oldValue = this.getFieldValue(profile, field);

    // Set new value
    this.setFieldValue(profile, field, newValue);

    // Record correction
    this.recordCorrection(field, oldValue, newValue, reason);
  }

  /**
   * Get active project paths list
   */
  getProjectPaths(): string[] {
    const profile = this.load();
    return profile.active_projects.map((p) => p.path);
  }

  /**
   * Format profile as readable text
   */
  formatProfile(): string {
    const profile = this.load();
    const lines: string[] = [];

    lines.push('# User Profile');
    lines.push('');

    // Technical level
    lines.push('## Technical Level');
    lines.push(`Overall: ${profile.technical_level.overall} (Confidence: ${(profile.technical_level.confidence * 100).toFixed(0)}%)`);
    if (Object.keys(profile.technical_level.domains).length > 0) {
      lines.push('Domain details:');
      for (const [domain, level] of Object.entries(profile.technical_level.domains)) {
        lines.push(`  - ${domain}: ${level}`);
      }
    }
    lines.push('');

    // Strengths and weaknesses
    lines.push('## Strengths');
    if (profile.strengths.length > 0) {
      profile.strengths.forEach((s) => lines.push(`  - ${s}`));
    } else {
      lines.push('  (No records yet)');
    }
    lines.push('');

    lines.push('## Areas for Improvement');
    if (profile.weaknesses.length > 0) {
      profile.weaknesses.forEach((w) => lines.push(`  - ${w}`));
    } else {
      lines.push('  (No records yet)');
    }
    lines.push('');

    // Work habits
    lines.push('## Work Habits');
    lines.push(`Peak hours: ${profile.work_habits.peak_hours.join(', ') || 'Unknown'}`);
    lines.push(`Average session length: ${profile.work_habits.avg_session_length_minutes} minutes`);
    lines.push(`Multitasking tendency: ${profile.work_habits.multitasking_tendency}`);
    lines.push('');

    // Learning preferences
    lines.push('## Learning Preferences');
    lines.push(`Style: ${profile.learning_preferences.style}`);
    lines.push(`Depth: ${profile.learning_preferences.depth}`);
    lines.push(`Feedback receptiveness: ${profile.learning_preferences.feedback_receptiveness}`);
    lines.push('');

    // Active projects
    lines.push('## Active Projects');
    if (profile.active_projects.length > 0) {
      profile.active_projects.forEach((p) => lines.push(`  - ${p.path} (${p.role})`));
    } else {
      lines.push('  (No projects)');
    }
    lines.push('');

    // Metadata
    lines.push('---');
    lines.push(`Created: ${profile.created_at}`);
    lines.push(`Updated: ${profile.updated_at}`);
    lines.push(`Corrections: ${profile.profile_corrections.length}`);

    return lines.join('\n');
  }

  /**
   * Deep merge objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = target[key];

      // Arrays are replaced directly, not merged
      if (Array.isArray(sourceValue)) {
        result[key] = [...sourceValue];
      }
      // Objects are deep merged (excluding null)
      else if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      }
      // Otherwise direct replacement
      else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  /**
   * Get nested field value
   */
  private getFieldValue(obj: any, path: string): unknown {
    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === undefined || current === null) return undefined;
      current = current[key];
    }

    return current;
  }

  /**
   * Set nested field value
   */
  private setFieldValue(obj: any, path: string, value: unknown): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }
}
