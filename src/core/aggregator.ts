/**
 * Data Aggregator
 *
 * Merge claude-mem observations and git commits into unified timeline
 */

import { ClaudeMemClient } from '../integrations/claude-mem';
import { GitHistoryReader } from '../integrations/git';
import { PitfallDetector } from './pitfall';
import { readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { DAILY_REPORTS_DIR } from '../utils/paths';
import type {
  Observation,
  GitCommit,
  TimelineEvent,
  DailyTimeline,
  TimelineStats,
  AvailabilityStatus,
  ProjectAggregatedData,
  ProjectStats,
  PitfallSignal,
} from '../types';

export interface AggregatorOptions {
  /** Active project paths list */
  projectPaths?: string[];
}

export class DataAggregator {
  private claudeMemClient: ClaudeMemClient;
  private options: AggregatorOptions;

  constructor(options: AggregatorOptions = {}) {
    this.claudeMemClient = new ClaudeMemClient();
    this.options = options;
  }

  /**
   * Check data source availability
   */
  async checkAvailability(): Promise<AvailabilityStatus> {
    return this.claudeMemClient.isAvailable();
  }

  /**
   * Get daily aggregated data
   */
  async getDailyTimeline(date: string): Promise<DailyTimeline> {
    // Get observations
    const observations = await this.claudeMemClient.getDailyObservations(date);

    // Get git commits
    const commits = this.getGitCommits(date);

    // Convert to timeline events
    const observationEvents = observations.map((obs) => this.observationToEvent(obs));
    const commitEvents = commits.map((commit) => this.commitToEvent(commit));

    // Merge and sort
    const events = [...observationEvents, ...commitEvents].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    // Compute statistics
    const stats = this.computeStats(observations, commits);

    return {
      date,
      events,
      stats,
    };
  }

  /**
   * Check if there's data
   */
  async hasData(date: string): Promise<boolean> {
    const timeline = await this.getDailyTimeline(date);
    return timeline.events.length > 0;
  }

  /**
   * Get git commits
   */
  private getGitCommits(date: string): GitCommit[] {
    const projectPaths = this.options.projectPaths || [process.cwd()];
    const allCommits: GitCommit[] = [];

    for (const path of projectPaths) {
      const reader = new GitHistoryReader(path);
      if (reader.isGitRepo()) {
        const commits = reader.getDailyCommits(date);
        allCommits.push(...commits);
      }
    }

    // Sort by time
    allCommits.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return allCommits;
  }

  /**
   * Convert observation to timeline event
   */
  private observationToEvent(obs: Observation): TimelineEvent {
    return {
      id: `obs-${obs.id}`,
      source: 'claude-mem',
      timestamp: obs.created_at_epoch,
      type: obs.type,
      title: obs.title || this.generateObservationTitle(obs),
      summary: obs.narrative || obs.subtitle || this.generateObservationSummary(obs),
      details: obs,
    };
  }

  /**
   * Convert commit to timeline event
   */
  private commitToEvent(commit: GitCommit): TimelineEvent {
    return {
      id: `commit-${commit.hash.substring(0, 8)}`,
      source: 'git',
      timestamp: new Date(commit.timestamp).getTime(),
      type: this.inferCommitType(commit.message),
      title: commit.message.split('\n')[0], // First line as title
      summary: this.generateCommitSummary(commit),
      details: commit,
    };
  }

  /**
   * Generate observation title
   */
  private generateObservationTitle(obs: Observation): string {
    const typeLabels: Record<string, string> = {
      decision: 'Decision',
      bugfix: 'Bug Fix',
      feature: 'New Feature',
      refactor: 'Refactor',
      discovery: 'Discovery',
      change: 'Change',
    };
    const typeLabel = typeLabels[obs.type] || obs.type;

    if (obs.facts && obs.facts.length > 0) {
      return `${typeLabel}: ${obs.facts[0].substring(0, 50)}...`;
    }

    return `${typeLabel} (${obs.project || 'unknown'})`;
  }

  /**
   * Generate observation summary
   */
  private generateObservationSummary(obs: Observation): string {
    const parts: string[] = [];

    if (obs.facts && obs.facts.length > 0) {
      parts.push(`Facts: ${obs.facts.slice(0, 2).join(', ')}`);
    }

    if (obs.concepts && obs.concepts.length > 0) {
      parts.push(`Concepts: ${obs.concepts.join(', ')}`);
    }

    if (obs.files_modified && obs.files_modified.length > 0) {
      parts.push(`Modified: ${obs.files_modified.length} files`);
    }

    return parts.join(' | ') || 'No details';
  }

  /**
   * Generate commit summary
   */
  private generateCommitSummary(commit: GitCommit): string {
    const parts: string[] = [];

    parts.push(`Author: ${commit.author}`);
    parts.push(`Files: ${commit.files_changed}`);
    parts.push(`+${commit.additions}/-${commit.deletions}`);

    return parts.join(' | ');
  }

  /**
   * Infer commit type
   */
  private inferCommitType(message: string): string {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.startsWith('fix') || lowerMessage.includes('bug')) {
      return 'bugfix';
    }
    if (lowerMessage.startsWith('feat') || lowerMessage.includes('add')) {
      return 'feature';
    }
    if (lowerMessage.startsWith('refactor') || lowerMessage.includes('refactor')) {
      return 'refactor';
    }
    if (lowerMessage.startsWith('docs') || lowerMessage.includes('doc')) {
      return 'docs';
    }
    if (lowerMessage.startsWith('test') || lowerMessage.includes('test')) {
      return 'test';
    }
    if (lowerMessage.startsWith('chore') || lowerMessage.startsWith('build')) {
      return 'chore';
    }

    return 'change';
  }

  /**
   * Compute statistics
   */
  private computeStats(observations: Observation[], commits: GitCommit[]): TimelineStats {
    const byType: Record<string, number> = {};
    const byProject: Record<string, number> = {};
    const projectsSet = new Set<string>();

    // Statistics from observations
    for (const obs of observations) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;
      if (obs.project) {
        byProject[obs.project] = (byProject[obs.project] || 0) + 1;
        projectsSet.add(obs.project);
      }
    }

    // Statistics from commits
    for (const commit of commits) {
      const type = this.inferCommitType(commit.message);
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      total_observations: observations.length,
      total_commits: commits.length,
      projects_active: Array.from(projectsSet),
      by_type: byType,
      by_project: byProject,
    };
  }

  /**
   * Aggregate project-level data
   */
  async aggregateProject(repos: string[], since?: string): Promise<ProjectAggregatedData> {
    // Get all commits
    const allCommits: GitCommit[] = [];
    const allContributors = new Set<string>();
    const fileChangeCounts: Record<string, number> = {};
    let earliestDate: string | null = null;
    let latestDate: string | null = null;

    for (const repoPath of repos) {
      const reader = new GitHistoryReader(repoPath);
      if (!reader.isGitRepo()) continue;

      const options: { since?: string; limit?: number } = {};
      if (since) {
        options.since = `${since} 00:00:00`;
      }
      // If no since, get all history (limit 1000 to prevent too large)
      options.limit = 1000;

      const commits = reader.getCommits(options);

      for (const commit of commits) {
        // Add repository path info
        (commit as any).repoPath = repoPath;
        allCommits.push(commit);

        // Collect contributors
        allContributors.add(commit.author);

        // Collect file change statistics
        for (const file of commit.files) {
          fileChangeCounts[file.path] = (fileChangeCounts[file.path] || 0) + 1;
        }

        // Update time range
        const commitDate = commit.timestamp.split('T')[0];
        if (!earliestDate || commitDate < earliestDate) {
          earliestDate = commitDate;
        }
        if (!latestDate || commitDate > latestDate) {
          latestDate = commitDate;
        }
      }
    }

    // Sort by time
    allCommits.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // If commits exceed 200, do smart sampling
    const sampledCommits = allCommits.length > 200
      ? this.sampleCommits(allCommits, 200)
      : allCommits;

    // Get observations (filtered by project paths)
    let observations: Observation[] = [];
    try {
      // Get all observations then filter by project
      const allObs = await this.claudeMemClient.getObservations({
        dateStart: since || earliestDate || undefined,
        dateEnd: latestDate || undefined,
      });

      // Filter observations related to the project
      const repoNames = repos.map(r => basename(r).toLowerCase());
      observations = allObs.filter(obs => {
        const project = (obs.project || '').toLowerCase();
        return repoNames.some(name => project.includes(name) || name.includes(project));
      });
    } catch (error) {
      // claude-mem may not be available, ignore error
      console.error('Failed to fetch observations for project:', error);
    }

    // Find related daily reflection reports
    const dailyReports = this.findRelatedDailyReports(repos, since);

    // Detect pitfall signals
    const pitfallDetector = new PitfallDetector();
    const pitfallsFromCommits = pitfallDetector.detectFromCommits(allCommits);
    const pitfallsFromObservations = pitfallDetector.detectFromObservations(observations);
    const pitfalls = [...pitfallsFromCommits, ...pitfallsFromObservations];

    // Find core files (top 10 most modified)
    const coreFiles = Object.entries(fileChangeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path]) => path);

    // Compute type statistics
    const byType: Record<string, number> = {};
    for (const commit of allCommits) {
      const type = this.inferCommitType(commit.message);
      byType[type] = (byType[type] || 0) + 1;
    }
    for (const obs of observations) {
      byType[obs.type] = (byType[obs.type] || 0) + 1;
    }

    const stats: ProjectStats = {
      total_commits: allCommits.length,
      total_observations: observations.length,
      time_span: {
        start: earliestDate || 'unknown',
        end: latestDate || 'unknown',
      },
      contributors: Array.from(allContributors),
      core_files: coreFiles,
      by_type: byType,
    };

    return {
      repos,
      commits: sampledCommits,
      observations,
      dailyReports,
      pitfalls,
      stats,
    };
  }

  /**
   * Smart commit sampling
   * Keep: milestones, merges, fixes, and evenly distributed samples
   */
  private sampleCommits(commits: GitCommit[], targetCount: number): GitCommit[] {
    if (commits.length <= targetCount) return commits;

    const sampled: GitCommit[] = [];
    const seen = new Set<string>();

    // 1. Keep all fix/revert/merge commits (high importance)
    for (const commit of commits) {
      const msg = commit.message.toLowerCase();
      if (
        msg.startsWith('fix') ||
        msg.startsWith('revert') ||
        msg.startsWith('merge') ||
        msg.includes('hotfix')
      ) {
        if (!seen.has(commit.hash)) {
          sampled.push(commit);
          seen.add(commit.hash);
        }
      }
    }

    // 2. Evenly sample the rest
    const remaining = targetCount - sampled.length;
    if (remaining > 0) {
      const step = Math.floor(commits.length / remaining);
      for (let i = 0; i < commits.length && sampled.length < targetCount; i += step) {
        const commit = commits[i];
        if (!seen.has(commit.hash)) {
          sampled.push(commit);
          seen.add(commit.hash);
        }
      }
    }

    // Sort by time
    sampled.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return sampled;
  }

  /**
   * Find related daily reflection reports
   */
  private findRelatedDailyReports(repos: string[], since?: string): string[] {
    const reports: string[] = [];

    if (!existsSync(DAILY_REPORTS_DIR)) {
      return reports;
    }

    try {
      const files = readdirSync(DAILY_REPORTS_DIR);
      for (const file of files) {
        if (!file.endsWith('.md') || file === 'README.md') continue;

        // Extract date
        const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
        if (!dateMatch) continue;

        const date = dateMatch[1];

        // If since limit, check date
        if (since && date < since) continue;

        reports.push(join(DAILY_REPORTS_DIR, file));
      }
    } catch (error) {
      console.error('Failed to read daily reports directory:', error);
    }

    return reports.sort();
  }

  /**
   * Close resources
   */
  close(): void {
    this.claudeMemClient.close();
  }
}
