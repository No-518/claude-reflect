/**
 * /reflect-profile command
 *
 * View and correct user profile
 */

import { ProfileManager } from '../core/profile';
import type { UserProfile, TechnicalLevel } from '../types';

export interface ProfileCommandResult {
  success: boolean;
  profile?: UserProfile;
  formatted?: string;
  message: string;
}

/**
 * View user profile
 */
export function viewProfile(): ProfileCommandResult {
  try {
    const profileManager = new ProfileManager();
    const profile = profileManager.load();
    const formatted = profileManager.formatProfile();

    return {
      success: true,
      profile,
      formatted,
      message: 'User profile loaded successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to load user profile: ${(error as Error).message}`,
    };
  }
}

/**
 * Correct user profile field
 */
export function correctProfile(
  field: string,
  newValue: unknown,
  reason: string
): ProfileCommandResult {
  try {
    const profileManager = new ProfileManager();

    // Apply correction
    profileManager.applyCorrection(field, newValue, reason);

    // Get updated profile
    const profile = profileManager.load();
    const formatted = profileManager.formatProfile();

    return {
      success: true,
      profile,
      formatted,
      message: `Field "${field}" has been updated`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Correction failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Add active project
 */
export function addProject(path: string, role: string = 'contributor'): ProfileCommandResult {
  try {
    const profileManager = new ProfileManager();
    profileManager.addProject(path, role);

    const profile = profileManager.load();

    return {
      success: true,
      profile,
      message: `Project "${path}" has been added`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to add project: ${(error as Error).message}`,
    };
  }
}

/**
 * Remove active project
 */
export function removeProject(path: string): ProfileCommandResult {
  try {
    const profileManager = new ProfileManager();
    profileManager.removeProject(path);

    const profile = profileManager.load();

    return {
      success: true,
      profile,
      message: `Project "${path}" has been removed`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to remove project: ${(error as Error).message}`,
    };
  }
}

/**
 * Update technical domain level
 */
export function updateDomainLevel(
  domain: string,
  level: TechnicalLevel
): ProfileCommandResult {
  try {
    const profileManager = new ProfileManager();
    profileManager.addDomain(domain, level);

    const profile = profileManager.load();

    return {
      success: true,
      profile,
      message: `Technical domain "${domain}" has been updated to ${level}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to update technical domain: ${(error as Error).message}`,
    };
  }
}

/**
 * Get list of correctable fields
 */
export function getCorrectableFields(): string[] {
  return [
    'technical_level.overall',
    'technical_level.confidence',
    'technical_level.domains.<domain>',
    'strengths',
    'weaknesses',
    'work_habits.peak_hours',
    'work_habits.avg_session_length_minutes',
    'work_habits.multitasking_tendency',
    'learning_preferences.style',
    'learning_preferences.depth',
    'learning_preferences.feedback_receptiveness',
  ];
}
