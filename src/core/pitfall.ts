/**
 * Smart Pitfall Detector
 *
 * Detect "pitfall" signals from git commits and claude-mem observations
 */

import type { GitCommit, Observation, PitfallSignal } from '../types';

export class PitfallDetector {
  /**
   * Detect pitfall signals from commits
   */
  detectFromCommits(commits: GitCommit[]): PitfallSignal[] {
    const signals: PitfallSignal[] = [];

    // 1. Detect revert commits
    const revertSignals = this.detectRevertCommits(commits);
    signals.push(...revertSignals);

    // 2. Detect fix/hotfix commits
    const fixSignals = this.detectFixCommits(commits);
    signals.push(...fixSignals);

    // 3. Detect high-frequency file modifications
    const highFrequencySignals = this.detectHighFrequencyFiles(commits);
    signals.push(...highFrequencySignals);

    // 4. Detect massive refactors
    const massiveRefactorSignals = this.detectMassiveRefactors(commits);
    signals.push(...massiveRefactorSignals);

    return signals;
  }

  /**
   * Detect pitfall signals from observations
   */
  detectFromObservations(observations: Observation[]): PitfallSignal[] {
    const signals: PitfallSignal[] = [];

    for (const obs of observations) {
      // Detect bugfix type
      if (obs.type === 'bugfix') {
        signals.push({
          type: 'bugfix_observation',
          date: obs.created_at.split('T')[0],
          commits: [],
          severity: 'medium',
          description: obs.title || obs.narrative || 'Bug fix record',
        });
      }

      // Detect pitfall-related keywords in narrative
      const narrative = (obs.narrative || '').toLowerCase();
      const pitfallKeywords = ['issue', 'bug', 'error', 'problem', 'fix', 'broken', 'failed'];
      const hasPitfallKeyword = pitfallKeywords.some(kw => narrative.includes(kw));

      if (hasPitfallKeyword && obs.type !== 'bugfix') {
        signals.push({
          type: 'bugfix_observation',
          date: obs.created_at.split('T')[0],
          commits: [],
          severity: 'low',
          description: `Issue record: ${obs.title || obs.narrative?.substring(0, 50) || 'Unknown'}`,
        });
      }
    }

    return signals;
  }

  /**
   * Detect revert commits
   */
  private detectRevertCommits(commits: GitCommit[]): PitfallSignal[] {
    const signals: PitfallSignal[] = [];

    for (const commit of commits) {
      const msg = commit.message.toLowerCase();
      if (msg.startsWith('revert') || msg.includes('revert:') || msg.includes('revert "')) {
        signals.push({
          type: 'revert',
          date: commit.timestamp.split('T')[0],
          commits: [commit.hash.substring(0, 8)],
          severity: 'high',
          description: `Revert commit: ${commit.message.substring(0, 50)}`,
        });
      }
    }

    return signals;
  }

  /**
   * Detect fix/hotfix commits
   */
  private detectFixCommits(commits: GitCommit[]): PitfallSignal[] {
    const signals: PitfallSignal[] = [];
    const fixCommits: GitCommit[] = [];

    for (const commit of commits) {
      const msg = commit.message.toLowerCase();
      if (
        msg.startsWith('fix:') ||
        msg.startsWith('fix(') ||
        msg.startsWith('hotfix:') ||
        msg.startsWith('hotfix(') ||
        msg.startsWith('bugfix:') ||
        msg.startsWith('bugfix(')
      ) {
        fixCommits.push(commit);
      }
    }

    // If multiple fix commits, merge into one signal (if related)
    if (fixCommits.length > 3) {
      signals.push({
        type: 'fix',
        date: fixCommits[0].timestamp.split('T')[0],
        commits: fixCommits.slice(0, 5).map(c => c.hash.substring(0, 8)),
        severity: 'medium',
        description: `Multiple fix commits (${fixCommits.length} total)`,
      });
    } else {
      for (const commit of fixCommits) {
        signals.push({
          type: 'fix',
          date: commit.timestamp.split('T')[0],
          commits: [commit.hash.substring(0, 8)],
          severity: 'low',
          description: `Fix: ${commit.message.substring(0, 50)}`,
        });
      }
    }

    return signals;
  }

  /**
   * Detect high-frequency file modifications (same file modified >=3 times within 24 hours)
   */
  private detectHighFrequencyFiles(commits: GitCommit[]): PitfallSignal[] {
    const signals: PitfallSignal[] = [];

    // Group by date and file
    const fileChanges: Record<string, { date: string; commits: string[]; count: number }> = {};

    for (const commit of commits) {
      const date = commit.timestamp.split('T')[0];

      for (const file of commit.files) {
        const key = `${date}:${file.path}`;
        if (!fileChanges[key]) {
          fileChanges[key] = { date, commits: [], count: 0 };
        }
        fileChanges[key].commits.push(commit.hash.substring(0, 8));
        fileChanges[key].count++;
      }
    }

    // Find high-frequency files
    for (const [key, data] of Object.entries(fileChanges)) {
      if (data.count >= 3) {
        const [date, filePath] = key.split(':');
        signals.push({
          type: 'high_frequency',
          file: filePath,
          date: data.date,
          commits: data.commits.slice(0, 5),
          severity: data.count >= 5 ? 'high' : 'medium',
          description: `File ${filePath} was modified ${data.count} times on ${date}`,
        });
      }
    }

    return signals;
  }

  /**
   * Detect massive refactors (more than 100 lines added/deleted)
   */
  private detectMassiveRefactors(commits: GitCommit[]): PitfallSignal[] {
    const signals: PitfallSignal[] = [];

    for (const commit of commits) {
      // Large-scale delete and rewrite (both large deletions and additions)
      if (commit.additions > 100 && commit.deletions > 100) {
        const msg = commit.message.toLowerCase();
        if (msg.includes('refactor') || msg.includes('rewrite') || msg.includes('restructure')) {
          signals.push({
            type: 'massive_refactor',
            date: commit.timestamp.split('T')[0],
            commits: [commit.hash.substring(0, 8)],
            severity: 'medium',
            description: `Massive refactor: +${commit.additions}/-${commit.deletions} (${commit.message.substring(0, 30)})`,
          });
        }
      }
    }

    return signals;
  }

  /**
   * Merge similar pitfall signals
   */
  mergeSignals(signals: PitfallSignal[]): PitfallSignal[] {
    // Group by type and file
    const groups: Record<string, PitfallSignal[]> = {};

    for (const signal of signals) {
      const key = signal.file ? `${signal.type}:${signal.file}` : signal.type;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(signal);
    }

    // Merge each group
    const merged: PitfallSignal[] = [];
    for (const groupSignals of Object.values(groups)) {
      if (groupSignals.length === 1) {
        merged.push(groupSignals[0]);
      } else {
        // Merge into one signal
        const first = groupSignals[0];
        const allCommits = groupSignals.flatMap(s => s.commits);
        const uniqueCommits = [...new Set(allCommits)];
        const highestSeverity = groupSignals.some(s => s.severity === 'high')
          ? 'high'
          : groupSignals.some(s => s.severity === 'medium')
            ? 'medium'
            : 'low';

        merged.push({
          type: first.type,
          file: first.file,
          date: first.date,
          commits: uniqueCommits.slice(0, 10),
          severity: highestSeverity,
          description: first.description + (groupSignals.length > 1 ? ` (${groupSignals.length} related signals)` : ''),
        });
      }
    }

    return merged;
  }
}
