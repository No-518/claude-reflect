/**
 * 路径工具函数
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/** Claude Reflect 数据目录 */
export const REFLECT_DATA_DIR = join(homedir(), '.claude-reflect');

/** 每日报告目录 */
export const DAILY_REPORTS_DIR = join(REFLECT_DATA_DIR, 'daily');

/** 项目报告目录 */
export const PROJECT_REPORTS_DIR = join(REFLECT_DATA_DIR, 'projects');

/** 用户画像文件路径 */
export const PROFILE_PATH = join(REFLECT_DATA_DIR, 'profile.json');

/** 会话临时目录 */
export const SESSION_DIR = join(REFLECT_DATA_DIR, '.session');

/** claude-mem 数据目录 */
export const CLAUDE_MEM_DIR = join(homedir(), '.claude-mem');

/** claude-mem 数据库路径 */
export const CLAUDE_MEM_DB_PATH = join(CLAUDE_MEM_DIR, 'claude-mem.db');

/** claude-mem 设置文件路径 */
export const CLAUDE_MEM_SETTINGS_PATH = join(CLAUDE_MEM_DIR, 'settings.json');

/** 默认 Worker 端口 */
export const DEFAULT_WORKER_PORT = 37777;

/** 默认 Worker 主机 */
export const DEFAULT_WORKER_HOST = '127.0.0.1';

/**
 * 确保目录存在
 */
export function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * 确保 Claude Reflect 数据目录存在
 */
export function ensureReflectDirs(): void {
  ensureDir(REFLECT_DATA_DIR);
  ensureDir(DAILY_REPORTS_DIR);
  ensureDir(PROJECT_REPORTS_DIR);
  ensureDir(SESSION_DIR);
}

/**
 * 获取每日报告文件路径
 */
export function getDailyReportPath(date: string): string {
  return join(DAILY_REPORTS_DIR, `${date}.md`);
}

/**
 * 获取项目报告文件路径
 */
export function getProjectReportPath(projectName: string): string {
  // 清理项目名称，移除非法字符
  const safeName = projectName.replace(/[<>:"/\\|?*]/g, '_');
  return join(PROJECT_REPORTS_DIR, `project-summary-${safeName}.md`);
}

/**
 * 获取备份目录路径
 */
export function getBackupDir(): string {
  const backupDir = join(DAILY_REPORTS_DIR, 'backups');
  ensureDir(backupDir);
  return backupDir;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * 解析日期字符串
 */
export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD`);
  }
  return date;
}

/**
 * 获取一天的开始时间戳 (毫秒)
 */
export function getStartOfDay(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
}

/**
 * 获取一天的结束时间戳 (毫秒)
 */
export function getEndOfDay(date: Date | string): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
}
