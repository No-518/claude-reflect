/**
 * Git 历史读取器
 *
 * 读取本地 git 仓库的提交历史
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import type { GitCommit, GitFileChange } from '../types';

export interface GitLogOptions {
  /** 开始日期 (YYYY-MM-DD) */
  since?: string;
  /** 结束日期 (YYYY-MM-DD) */
  until?: string;
  /** 最大返回数量 */
  limit?: number;
  /** 作者过滤 */
  author?: string;
}

export class GitHistoryReader {
  private repoPath: string;

  constructor(repoPath: string = process.cwd()) {
    this.repoPath = repoPath;
  }

  /**
   * 检查是否是有效的 git 仓库
   */
  isGitRepo(): boolean {
    const gitDir = join(this.repoPath, '.git');
    return existsSync(gitDir);
  }

  /**
   * 获取指定日期范围的 commits
   */
  getCommits(options: GitLogOptions = {}): GitCommit[] {
    if (!this.isGitRepo()) {
      return [];
    }

    try {
      const args = this.buildGitLogArgs(options);
      const output = execSync(`git log ${args}`, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      return this.parseGitLog(output);
    } catch (error) {
      console.error('Failed to read git history:', error);
      return [];
    }
  }

  /**
   * 获取指定日期的 commits
   */
  getDailyCommits(date: string): GitCommit[] {
    return this.getCommits({
      since: `${date} 00:00:00`,
      until: `${date} 23:59:59`,
    });
  }

  /**
   * 从多个仓库获取 commits
   */
  static getCommitsFromRepos(repoPaths: string[], options: GitLogOptions = {}): GitCommit[] {
    const allCommits: GitCommit[] = [];

    for (const repoPath of repoPaths) {
      const reader = new GitHistoryReader(repoPath);
      const commits = reader.getCommits(options);

      // 为每个 commit 添加仓库路径信息
      for (const commit of commits) {
        (commit as any).repoPath = repoPath;
        allCommits.push(commit);
      }
    }

    // 按时间排序
    allCommits.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    return allCommits;
  }

  /**
   * 构建 git log 参数
   */
  private buildGitLogArgs(options: GitLogOptions): string {
    const args: string[] = [];

    // 格式化输出
    // %H: full hash, %s: subject, %an: author name, %ae: author email, %aI: ISO date
    args.push('--format="%H|%s|%an|%ae|%aI"');

    // 显示文件变更统计
    args.push('--numstat');

    // 日期范围
    if (options.since) {
      args.push(`--since="${options.since}"`);
    }
    if (options.until) {
      args.push(`--until="${options.until}"`);
    }

    // 数量限制
    if (options.limit) {
      args.push(`-n ${options.limit}`);
    }

    // 作者过滤
    if (options.author) {
      args.push(`--author="${options.author}"`);
    }

    return args.join(' ');
  }

  /**
   * 解析 git log 输出
   */
  private parseGitLog(output: string): GitCommit[] {
    const commits: GitCommit[] = [];
    const lines = output.trim().split('\n');

    let currentCommit: Partial<GitCommit> | null = null;
    let currentFiles: GitFileChange[] = [];

    for (const line of lines) {
      // 检查是否是 commit 头部行 (hash|message|author|email|timestamp 格式)
      // 注意: execSync 执行时 shell 会处理掉引号，所以不能依赖引号判断
      const isCommitLine = /^[a-f0-9]{40}\|/.test(line) || (line.startsWith('"') && line.includes('|'));
      if (isCommitLine) {
        // 保存上一个 commit
        if (currentCommit) {
          commits.push(this.finalizeCommit(currentCommit, currentFiles));
        }

        // 解析新 commit
        currentCommit = this.parseCommitHeader(line);
        currentFiles = [];
      } else if (line.trim() && currentCommit) {
        // 解析 numstat 行
        const fileChange = this.parseNumstatLine(line);
        if (fileChange) {
          currentFiles.push(fileChange);
        }
      }
    }

    // 保存最后一个 commit
    if (currentCommit) {
      commits.push(this.finalizeCommit(currentCommit, currentFiles));
    }

    return commits;
  }

  /**
   * 解析 commit 头部行
   */
  private parseCommitHeader(line: string): Partial<GitCommit> {
    // 移除引号
    const content = line.replace(/^"|"$/g, '');
    const parts = content.split('|');

    return {
      hash: parts[0] || '',
      message: parts[1] || '',
      author: parts[2] || '',
      email: parts[3] || '',
      timestamp: parts[4] || '',
      files_changed: 0,
      additions: 0,
      deletions: 0,
      files: [],
    };
  }

  /**
   * 解析 numstat 行
   */
  private parseNumstatLine(line: string): GitFileChange | null {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return null;

    const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
    const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
    const path = parts.slice(2).join(' ');

    if (!path) return null;

    return {
      path,
      additions,
      deletions,
    };
  }

  /**
   * 完成 commit 对象构建
   */
  private finalizeCommit(commit: Partial<GitCommit>, files: GitFileChange[]): GitCommit {
    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    return {
      hash: commit.hash || '',
      message: commit.message || '',
      author: commit.author || '',
      email: commit.email || '',
      timestamp: commit.timestamp || '',
      files_changed: files.length,
      additions: totalAdditions,
      deletions: totalDeletions,
      files,
    };
  }

  /**
   * 获取仓库统计信息
   */
  getRepoStats(): {
    totalCommits: number;
    firstCommit: string | null;
    lastCommit: string | null;
    contributors: string[];
  } {
    if (!this.isGitRepo()) {
      return {
        totalCommits: 0,
        firstCommit: null,
        lastCommit: null,
        contributors: [],
      };
    }

    try {
      // 获取总提交数
      const countOutput = execSync('git rev-list --count HEAD', {
        cwd: this.repoPath,
        encoding: 'utf-8',
      });
      const totalCommits = parseInt(countOutput.trim(), 10) || 0;

      // 获取第一次提交
      let firstCommit: string | null = null;
      try {
        firstCommit = execSync('git log --reverse --format="%aI" -1', {
          cwd: this.repoPath,
          encoding: 'utf-8',
        }).trim().replace(/"/g, '');
      } catch {
        // 忽略
      }

      // 获取最后一次提交
      let lastCommit: string | null = null;
      try {
        lastCommit = execSync('git log --format="%aI" -1', {
          cwd: this.repoPath,
          encoding: 'utf-8',
        }).trim().replace(/"/g, '');
      } catch {
        // 忽略
      }

      // 获取贡献者
      let contributors: string[] = [];
      try {
        const contributorsOutput = execSync('git log --format="%an" | sort -u', {
          cwd: this.repoPath,
          encoding: 'utf-8',
          shell: '/bin/bash',
        });
        contributors = contributorsOutput.trim().split('\n').filter(Boolean);
      } catch {
        // 忽略
      }

      return {
        totalCommits,
        firstCommit,
        lastCommit,
        contributors,
      };
    } catch (error) {
      console.error('Failed to get repo stats:', error);
      return {
        totalCommits: 0,
        firstCommit: null,
        lastCommit: null,
        contributors: [],
      };
    }
  }
}
