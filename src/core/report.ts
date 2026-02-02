/**
 * Report Generator
 *
 * Generate Markdown format daily reflection reports
 */

import { existsSync, writeFileSync, copyFileSync } from 'fs';
import { basename } from 'path';
import type {
  DailyTimeline,
  ReflectionSession,
  DailyReport,
  Learning,
  ProjectAggregatedData,
  ProjectReflectionSession,
  ProjectReport,
} from '../types';
import {
  getDailyReportPath,
  getProjectReportPath,
  getBackupDir,
  ensureReflectDirs,
  formatDate,
} from '../utils/paths';
import { join } from 'path';

export class ReportGenerator {
  /**
   * Generate daily report
   */
  generateReport(
    timeline: DailyTimeline,
    session: ReflectionSession
  ): DailyReport {
    // Categorize learnings
    const technicalLearnings = session.learnings.filter(
      (l) => l.category === 'technical'
    );
    const decisionLearnings = session.learnings.filter(
      (l) => l.category === 'decision'
    );
    const efficiencyLearnings = session.learnings.filter(
      (l) => l.category === 'efficiency'
    );

    // Calculate primary focus areas
    const primaryFocus: Record<string, number> = {};
    for (const event of timeline.events) {
      primaryFocus[event.type] = (primaryFocus[event.type] || 0) + 1;
    }

    // Collect raw data references
    const observationIds: number[] = [];
    const commitHashes: string[] = [];

    for (const event of timeline.events) {
      if (event.source === 'claude-mem') {
        const obs = event.details as any;
        if (obs.id) observationIds.push(obs.id);
      } else if (event.source === 'git') {
        const commit = event.details as any;
        if (commit.hash) commitHashes.push(commit.hash.substring(0, 8));
      }
    }

    // Generate suggestions for tomorrow
    const suggestions = this.generateSuggestions(session, timeline);

    return {
      date: timeline.date,
      generated_at: new Date().toISOString(),
      summary: {
        active_projects: timeline.stats.projects_active.length,
        total_commits: timeline.stats.total_commits,
        total_observations: timeline.stats.total_observations,
        primary_focus: primaryFocus,
      },
      technical_learnings: technicalLearnings,
      decision_analysis: decisionLearnings,
      efficiency_insights: efficiencyLearnings,
      suggestions,
      raw_data_refs: {
        observations: observationIds,
        commits: commitHashes,
      },
    };
  }

  /**
   * Generate suggestions for tomorrow
   */
  private generateSuggestions(
    session: ReflectionSession,
    timeline: DailyTimeline
  ): string[] {
    const suggestions: string[] = [];

    // Generate suggestions based on efficiency insights
    const efficiencyLearnings = session.learnings.filter(
      (l) => l.category === 'efficiency'
    );
    if (efficiencyLearnings.length > 0) {
      suggestions.push('Review today\'s efficiency insights and consider applying them tomorrow');
    }

    // Generate suggestions based on technical learnings
    const technicalLearnings = session.learnings.filter(
      (l) => l.category === 'technical'
    );
    if (technicalLearnings.length > 0) {
      suggestions.push('Consolidate today\'s technical learnings, consider writing a learning note');
    }

    // Generate suggestions based on event types
    const bugfixCount = timeline.events.filter(
      (e) => e.type === 'bugfix'
    ).length;
    if (bugfixCount > 3) {
      suggestions.push('Fixed multiple bugs today, consider adding more test cases');
    }

    // Default suggestion
    if (suggestions.length === 0) {
      suggestions.push('Maintain your current work rhythm and keep moving forward');
    }

    return suggestions;
  }

  /**
   * Convert report to Markdown
   */
  toMarkdown(report: DailyReport): string {
    const lines: string[] = [];

    // Title
    lines.push(`# Daily Reflection - ${report.date}`);
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`- **Active Projects:** ${report.summary.active_projects}`);
    lines.push(`- **Commits:** ${report.summary.total_commits}`);
    lines.push(`- **Observations:** ${report.summary.total_observations}`);

    // Primary focus
    const focusEntries = Object.entries(report.summary.primary_focus)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const total = Object.values(report.summary.primary_focus).reduce(
      (a, b) => a + b,
      0
    );
    if (total > 0) {
      const focusStr = focusEntries
        .map(([type, count]) => `${type} (${Math.round((count / total) * 100)}%)`)
        .join(', ');
      lines.push(`- **Primary Focus:** ${focusStr}`);
    }
    lines.push('');

    // Technical Learnings
    lines.push('## Technical Learnings');
    if (report.technical_learnings.length > 0) {
      for (let i = 0; i < report.technical_learnings.length; i++) {
        const learning = report.technical_learnings[i];
        lines.push(`### ${i + 1}. ${this.extractTitle(learning)}`);
        lines.push(`- **Content:** ${learning.content}`);
        lines.push(`- **Confidence:** ${learning.confidence}`);
        if (learning.source_refs.length > 0) {
          lines.push(`- **Source:** ${learning.source_refs.join(', ')}`);
        }
        lines.push('');
      }
    } else {
      lines.push('*No specific technical learnings recorded today.*');
      lines.push('');
    }

    // Decision Analysis
    lines.push('## Decision Analysis');
    if (report.decision_analysis.length > 0) {
      for (const learning of report.decision_analysis) {
        lines.push(`### ${this.extractTitle(learning)}`);
        lines.push(`- **Analysis:** ${learning.content}`);
        lines.push(`- **Confidence:** ${learning.confidence}`);
        lines.push('');
      }
    } else {
      lines.push('*No specific decisions analyzed today.*');
      lines.push('');
    }

    // Efficiency Insights
    lines.push('## Efficiency Insights');
    if (report.efficiency_insights.length > 0) {
      for (const learning of report.efficiency_insights) {
        lines.push(`- ${learning.content}`);
      }
      lines.push('');
    } else {
      lines.push('*No specific efficiency insights recorded today.*');
      lines.push('');
    }

    // Tomorrow's Suggestions
    lines.push("## Tomorrow's Suggestions");
    for (let i = 0; i < report.suggestions.length; i++) {
      lines.push(`${i + 1}. ${report.suggestions[i]}`);
    }
    lines.push('');

    // Raw Data References
    lines.push('## Raw Data References');
    if (report.raw_data_refs.observations.length > 0) {
      lines.push(
        `- **Observations:** ${report.raw_data_refs.observations
          .map((id) => `#${id}`)
          .join(', ')}`
      );
    }
    if (report.raw_data_refs.commits.length > 0) {
      lines.push(
        `- **Commits:** ${report.raw_data_refs.commits.join(', ')}`
      );
    }
    lines.push('');

    // Metadata
    lines.push('---');
    lines.push(`*Generated at: ${report.generated_at}*`);
    lines.push('*Powered by Claude Reflect*');

    return lines.join('\n');
  }

  /**
   * Extract title from learning
   */
  private extractTitle(learning: Learning): string {
    const content = learning.content;

    // Handle empty or undefined content
    if (!content) {
      return '(No content)';
    }

    // Try to extract first verb phrase or noun phrase
    const match = content.match(/^[^,.\n]+/);
    if (match && match[0].length < 30) {
      return match[0];
    }

    // Truncate to first 30 characters
    if (content.length > 30) {
      return content.substring(0, 30) + '...';
    }

    return content;
  }

  /**
   * Save report to file
   */
  saveReport(report: DailyReport): string {
    ensureReflectDirs();

    const filePath = getDailyReportPath(report.date);
    const markdown = this.toMarkdown(report);

    writeFileSync(filePath, markdown, 'utf-8');

    return filePath;
  }

  /**
   * Check if report exists
   */
  reportExists(date: string): boolean {
    const filePath = getDailyReportPath(date);
    return existsSync(filePath);
  }

  /**
   * Backup existing report
   */
  backupReport(date: string): string | null {
    const filePath = getDailyReportPath(date);
    if (!existsSync(filePath)) return null;

    const backupDir = getBackupDir();
    const timestamp = formatDate(new Date()).replace(/-/g, '');
    const backupPath = join(backupDir, `${date}-backup-${timestamp}.md`);

    copyFileSync(filePath, backupPath);

    return backupPath;
  }

  /**
   * Append content to existing report
   */
  appendToReport(date: string, additionalContent: string): string {
    const filePath = getDailyReportPath(date);

    if (!existsSync(filePath)) {
      throw new Error(`Report for ${date} does not exist`);
    }

    const existingContent = require('fs').readFileSync(filePath, 'utf-8');

    // Add separator and new content
    const separator = `\n\n---\n\n## Additional Reflection (${new Date().toISOString()})\n\n`;
    const newContent = existingContent + separator + additionalContent;

    writeFileSync(filePath, newContent, 'utf-8');

    return filePath;
  }

  // ============ Project Report Generation ============

  /**
   * Generate project report
   */
  generateProjectReport(
    repos: string[],
    data: ProjectAggregatedData,
    session: ProjectReflectionSession
  ): ProjectReport {
    // Extract project name
    const projectName = repos.length === 1
      ? basename(repos[0])
      : repos.map(r => basename(r)).join('_');

    // Extract technical decisions from session answers
    const technicalDecisions = this.extractDecisions(session);

    // Extract pitfall records from session answers
    const pitfallRecords = this.extractPitfallRecords(session, data);

    // Collect raw data references
    const observationIds = data.observations.map(o => o.id);
    const commitHashes = data.commits.map(c => c.hash.substring(0, 8));

    return {
      project_name: projectName,
      repos,
      generated_at: new Date().toISOString(),
      overview: {
        time_span: data.stats.time_span,
        total_commits: data.stats.total_commits,
        contributors: data.stats.contributors,
        core_files: data.stats.core_files,
      },
      technical_decisions: technicalDecisions,
      pitfall_records: pitfallRecords,
      learnings: session.learnings,
      raw_data_refs: {
        observations: observationIds,
        commits: commitHashes,
      },
    };
  }

  /**
   * Extract technical decisions from session
   */
  private extractDecisions(session: ProjectReflectionSession): ProjectReport['technical_decisions'] {
    const decisions: ProjectReport['technical_decisions'] = [];

    // Find decision-related Q&A
    for (const question of session.questions) {
      if (question.category === 'decision') {
        const answer = session.answers[question.id];
        if (answer && answer.length > 20) {
          decisions.push({
            title: this.extractFirstSentence(answer),
            background: question.context || '',
            choice: answer,
            reason: '', // User may provide in answer
            retrospective: '', // Can be supplemented by follow-up questions
          });
        }
      }
    }

    return decisions;
  }

  /**
   * Extract pitfall records from session
   */
  private extractPitfallRecords(
    session: ProjectReflectionSession,
    data: ProjectAggregatedData
  ): ProjectReport['pitfall_records'] {
    const records: ProjectReport['pitfall_records'] = [];

    // Find pitfall-related Q&A
    for (const question of session.questions) {
      if (question.category === 'pitfall') {
        const answer = session.answers[question.id];
        if (answer && answer.length > 20) {
          records.push({
            title: this.extractFirstSentence(answer),
            description: answer,
            root_cause: '', // User may provide in answer
            solution: '',
            lesson: '',
            related_commits: question.related_commits || [],
          });
        }
      }
    }

    // Add undiscussed detected pitfalls
    for (const pitfall of data.pitfalls) {
      const alreadyDiscussed = records.some(r =>
        r.related_commits.some(c => pitfall.commits.includes(c))
      );

      if (!alreadyDiscussed && pitfall.severity !== 'low') {
        records.push({
          title: pitfall.description,
          description: `Auto-detected: ${pitfall.type}`,
          root_cause: '',
          solution: '',
          lesson: '',
          related_commits: pitfall.commits,
        });
      }
    }

    return records;
  }

  /**
   * Extract first sentence as title
   */
  private extractFirstSentence(text: string): string {
    const match = text.match(/^[^.!?]+[.!?]?/);
    if (match && match[0].length < 50) {
      return match[0];
    }
    return text.substring(0, 40) + '...';
  }

  /**
   * Convert project report to Markdown
   */
  projectReportToMarkdown(report: ProjectReport): string {
    const lines: string[] = [];

    // Title
    lines.push(`# Project Summary - ${report.project_name}`);
    lines.push('');

    // Project Overview
    lines.push('## Project Overview');
    lines.push(`- **Time Span:** ${report.overview.time_span.start} ~ ${report.overview.time_span.end}`);
    lines.push(`- **Total Commits:** ${report.overview.total_commits}`);
    lines.push(`- **Contributors:** ${report.overview.contributors.join(', ')}`);
    lines.push(`- **Core Files:** ${report.overview.core_files.slice(0, 5).join(', ')}`);
    if (report.repos.length > 1) {
      lines.push(`- **Repositories:** ${report.repos.map(r => basename(r)).join(', ')}`);
    }
    lines.push('');

    // Technical Decisions
    lines.push('## Technical Decisions');
    if (report.technical_decisions.length > 0) {
      for (let i = 0; i < report.technical_decisions.length; i++) {
        const decision = report.technical_decisions[i];
        lines.push(`### ${i + 1}. ${decision.title}`);
        if (decision.background) {
          lines.push(`- **Background:** ${decision.background}`);
        }
        lines.push(`- **Choice:** ${decision.choice}`);
        if (decision.reason) {
          lines.push(`- **Reason:** ${decision.reason}`);
        }
        if (decision.retrospective) {
          lines.push(`- **Retrospective:** ${decision.retrospective}`);
        }
        lines.push('');
      }
    } else {
      lines.push('*No specific technical decisions recorded*');
      lines.push('');
    }

    // Pitfall Records
    lines.push('## Pitfall Records');
    if (report.pitfall_records.length > 0) {
      for (let i = 0; i < report.pitfall_records.length; i++) {
        const pitfall = report.pitfall_records[i];
        lines.push(`### ${i + 1}. ${pitfall.title}`);
        lines.push(`- **Description:** ${pitfall.description}`);
        if (pitfall.root_cause) {
          lines.push(`- **Root Cause:** ${pitfall.root_cause}`);
        }
        if (pitfall.solution) {
          lines.push(`- **Solution:** ${pitfall.solution}`);
        }
        if (pitfall.lesson) {
          lines.push(`- **Lesson:** ${pitfall.lesson}`);
        }
        if (pitfall.related_commits.length > 0) {
          lines.push(`- **Related Commits:** ${pitfall.related_commits.join(', ')}`);
        }
        lines.push('');
      }
    } else {
      lines.push('*No specific pitfalls recorded*');
      lines.push('');
    }

    // Learnings
    lines.push('## Learnings');
    if (report.learnings.length > 0) {
      for (const learning of report.learnings) {
        lines.push(`- **[${learning.category}]** ${learning.content}`);
      }
      lines.push('');
    } else {
      lines.push('*No specific learnings recorded*');
      lines.push('');
    }

    // Data References
    lines.push('## Data References');
    if (report.raw_data_refs.observations.length > 0) {
      lines.push(`- **Observations:** ${report.raw_data_refs.observations.slice(0, 10).map(id => `#${id}`).join(', ')}${report.raw_data_refs.observations.length > 10 ? '...' : ''}`);
    }
    if (report.raw_data_refs.commits.length > 0) {
      lines.push(`- **Commits:** ${report.raw_data_refs.commits.slice(0, 10).join(', ')}${report.raw_data_refs.commits.length > 10 ? '...' : ''}`);
    }
    lines.push('');

    // Metadata
    lines.push('---');
    lines.push(`*Generated at: ${report.generated_at}*`);
    lines.push('*Powered by Claude Reflect*');

    return lines.join('\n');
  }

  /**
   * Save project report
   */
  saveProjectReport(report: ProjectReport): string {
    ensureReflectDirs();

    const filePath = getProjectReportPath(report.project_name);
    const markdown = this.projectReportToMarkdown(report);

    // Backup if exists
    if (existsSync(filePath)) {
      this.backupProjectReport(report.project_name);
    }

    writeFileSync(filePath, markdown, 'utf-8');

    return filePath;
  }

  /**
   * Check if project report exists
   */
  projectReportExists(projectName: string): boolean {
    const filePath = getProjectReportPath(projectName);
    return existsSync(filePath);
  }

  /**
   * Backup project report
   */
  backupProjectReport(projectName: string): string | null {
    const filePath = getProjectReportPath(projectName);
    if (!existsSync(filePath)) return null;

    const backupDir = getBackupDir();
    const timestamp = formatDate(new Date()).replace(/-/g, '');
    const safeName = projectName.replace(/[<>:"/\\|?*]/g, '_');
    const backupPath = join(backupDir, `project-${safeName}-backup-${timestamp}.md`);

    copyFileSync(filePath, backupPath);

    return backupPath;
  }
}
