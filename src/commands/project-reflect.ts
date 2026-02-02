/**
 * /project-reflect command
 *
 * Step-based API design for AI-driven project-level reflection
 */

import { existsSync } from 'fs';
import { join, basename } from 'path';
import { DataAggregator } from '../core/aggregator';
import { ProfileManager } from '../core/profile';
import { ReportGenerator } from '../core/report';
import type {
  ProjectAggregatedData,
  ProjectReflectionSession,
  ProjectReflectionQuestion,
  ProjectReport,
  PitfallSignal,
  UserProfile,
} from '../types';

// ============ Options and Result Types ============

export interface ProjectReflectOptions {
  /** Specify start date (YYYY-MM-DD) */
  since?: string;
}

export interface InitProjectReflectionResult {
  success: boolean;
  repos: string[];
  data?: ProjectAggregatedData;
  question?: ProjectReflectionQuestion;
  totalQuestions?: number;
  message: string;
  error?: Error;
}

export interface SubmitProjectAnswerResult {
  success: boolean;
  action: 'follow_up' | 'next' | 'complete';
  nextQuestion?: ProjectReflectionQuestion;
  progress?: { current: number; total: number };
  message: string;
}

export interface CompleteProjectReflectionResult {
  success: boolean;
  report?: ProjectReport;
  reportPath?: string;
  session?: ProjectReflectionSession;
  message: string;
  error?: Error;
}

export interface GetProjectQuestionResult {
  success: boolean;
  question?: ProjectReflectionQuestion;
  progress?: { current: number; total: number };
  isComplete: boolean;
  message: string;
}

export interface ProjectSessionStatus {
  active: boolean;
  repos?: string[];
  since?: string;
  progress?: { current: number; total: number };
  isComplete?: boolean;
}

// ============ Session State Management ============

interface ProjectReflectionState {
  repos: string[];
  since?: string;
  data: ProjectAggregatedData;
  profile: UserProfile;
  session: ProjectReflectionSession;
  aggregator: DataAggregator;
  profileManager: ProfileManager;
  reportGenerator: ReportGenerator;
  currentQuestionIndex: number;
}

// In-memory project reflection session state (singleton)
let currentProjectSession: ProjectReflectionState | null = null;

// ============ Utility Functions ============

/**
 * Validate repository paths
 */
export function validateRepos(repoPaths: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const repoPath of repoPaths) {
    const gitDir = join(repoPath, '.git');
    if (existsSync(gitDir)) {
      valid.push(repoPath);
    } else {
      invalid.push(repoPath);
    }
  }

  return { valid, invalid };
}

/**
 * Extract project name from paths
 */
export function getProjectName(repos: string[]): string {
  if (repos.length === 1) {
    return basename(repos[0]);
  }
  return repos.map(r => basename(r)).join('_');
}

// ============ Step-based API ============

/**
 * Initialize project reflection session
 * Returns project data and first question
 */
export async function initProjectReflection(
  repos: string[],
  options: ProjectReflectOptions = {}
): Promise<InitProjectReflectionResult> {
  // Clean up previous session
  if (currentProjectSession) {
    currentProjectSession.aggregator.close();
    currentProjectSession = null;
  }

  // Validate repository paths
  const { valid, invalid } = validateRepos(repos);

  if (valid.length === 0) {
    return {
      success: false,
      repos: [],
      message: invalid.length > 0
        ? `Invalid repository paths: ${invalid.join(', ')}. Please ensure paths are valid git repositories.`
        : 'Please provide at least one repository path.',
    };
  }

  // Initialize components
  const profileManager = new ProfileManager();
  const profile = profileManager.initialize();
  const aggregator = new DataAggregator({ projectPaths: valid });
  const reportGenerator = new ReportGenerator();

  try {
    // Aggregate project data
    const data = await aggregator.aggregateProject(valid, options.since);

    // Check if there's data
    if (data.commits.length === 0 && data.observations.length === 0) {
      aggregator.close();
      return {
        success: false,
        repos: valid,
        message: options.since
          ? `No work records found since ${options.since}. Please select an earlier date or check repository paths.`
          : 'No work records found. Please check repository paths.',
      };
    }

    // Generate project reflection questions
    const questions = generateProjectQuestions(data);
    if (questions.length === 0) {
      aggregator.close();
      return {
        success: false,
        repos: valid,
        message: 'Unable to generate project reflection questions.',
      };
    }

    // Create session
    const session: ProjectReflectionSession = {
      repos: valid,
      since: options.since,
      started_at: new Date().toISOString(),
      questions,
      answers: {},
      learnings: [],
      pitfalls_discussed: [],
      profile_updates: {},
    };

    // Save session state
    currentProjectSession = {
      repos: valid,
      since: options.since,
      data,
      profile,
      session,
      aggregator,
      profileManager,
      reportGenerator,
      currentQuestionIndex: 0,
    };

    // Build success message
    const invalidWarning = invalid.length > 0
      ? `\nWarning: The following invalid paths were skipped: ${invalid.join(', ')}`
      : '';

    return {
      success: true,
      repos: valid,
      data,
      question: questions[0],
      totalQuestions: questions.length,
      message: `Project reflection session started!${invalidWarning}\n` +
        `- Repositories: ${valid.map(r => basename(r)).join(', ')}\n` +
        `- Time span: ${data.stats.time_span.start} ~ ${data.stats.time_span.end}\n` +
        `- Total commits: ${data.stats.total_commits}\n` +
        `- Total observations: ${data.stats.total_observations}\n` +
        `- Detected pitfalls: ${data.pitfalls.length}\n` +
        `- ${questions.length} questions total`,
    };
  } catch (error) {
    aggregator.close();
    return {
      success: false,
      repos: valid,
      message: `Failed to initialize project reflection: ${(error as Error).message}`,
      error: error as Error,
    };
  }
}

/**
 * Get current project question
 */
export function getCurrentProjectQuestion(): GetProjectQuestionResult {
  if (!currentProjectSession) {
    return {
      success: false,
      isComplete: false,
      message: 'No active project reflection session. Please call initProjectReflection() first.',
    };
  }

  const { session, currentQuestionIndex } = currentProjectSession;
  const total = session.questions.length;

  if (currentQuestionIndex >= total) {
    return {
      success: true,
      isComplete: true,
      message: 'All questions completed. Please call completeProjectReflection() to generate report.',
    };
  }

  const question = session.questions[currentQuestionIndex];
  return {
    success: true,
    question,
    progress: { current: currentQuestionIndex + 1, total },
    isComplete: false,
    message: `Question ${currentQuestionIndex + 1}/${total}`,
  };
}

/**
 * Submit project answer
 */
export function submitProjectAnswer(
  questionId: string,
  answer: string
): SubmitProjectAnswerResult {
  if (!currentProjectSession) {
    return {
      success: false,
      action: 'complete',
      message: 'No active project reflection session. Please call initProjectReflection() first.',
    };
  }

  const { session, currentQuestionIndex, data } = currentProjectSession;
  const total = session.questions.length;

  // Record answer
  session.answers[questionId] = answer;

  // Check if follow-up needed (answer too short)
  if (answer.length < 30) {
    const question = session.questions[currentQuestionIndex];
    // Generate data-based follow-up question
    const followUpQuestion = generateFollowUpQuestion(question, data);
    if (followUpQuestion) {
      return {
        success: true,
        action: 'follow_up',
        nextQuestion: followUpQuestion,
        progress: { current: currentQuestionIndex + 1, total },
        message: 'Could you elaborate on that?',
      };
    }
  }

  // Move to next question
  currentProjectSession.currentQuestionIndex++;

  if (currentProjectSession.currentQuestionIndex >= total) {
    return {
      success: true,
      action: 'complete',
      progress: { current: total, total },
      message: 'Great! All questions completed. Please call completeProjectReflection() to generate report.',
    };
  }

  const nextQuestion = session.questions[currentProjectSession.currentQuestionIndex];
  return {
    success: true,
    action: 'next',
    nextQuestion,
    progress: { current: currentProjectSession.currentQuestionIndex + 1, total },
    message: 'Got it, moving to next question.',
  };
}

/**
 * Complete project reflection and generate report
 */
export function completeProjectReflection(): CompleteProjectReflectionResult {
  if (!currentProjectSession) {
    return {
      success: false,
      message: 'No active project reflection session. Please call initProjectReflection() first.',
    };
  }

  const { repos, data, session, profileManager, reportGenerator } = currentProjectSession;

  try {
    // Complete session
    session.completed_at = new Date().toISOString();

    // Extract learnings from answers
    session.learnings = extractProjectLearnings(session);

    // Generate project report
    const report = reportGenerator.generateProjectReport(repos, data, session);
    const reportPath = reportGenerator.saveProjectReport(report);

    // Update user profile (if update signals present)
    if (session.profile_updates && Object.keys(session.profile_updates).length > 0) {
      profileManager.update(session.profile_updates);
    }

    // Clean up session
    currentProjectSession.aggregator.close();
    currentProjectSession = null;

    return {
      success: true,
      report,
      reportPath,
      session,
      message: `Project reflection complete! Report saved to: ${reportPath}`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to generate report: ${(error as Error).message}`,
      error: error as Error,
    };
  }
}

/**
 * Cancel current project reflection session
 */
export function cancelProjectReflection(): { success: boolean; message: string } {
  if (!currentProjectSession) {
    return {
      success: false,
      message: 'No active project reflection session.',
    };
  }

  currentProjectSession.aggregator.close();
  currentProjectSession = null;

  return {
    success: true,
    message: 'Project reflection session cancelled.',
  };
}

/**
 * Get project session status
 */
export function getProjectSessionStatus(): ProjectSessionStatus {
  if (!currentProjectSession) {
    return { active: false };
  }

  const { repos, since, session, currentQuestionIndex } = currentProjectSession;
  const total = session.questions.length;

  return {
    active: true,
    repos,
    since,
    progress: { current: currentQuestionIndex + 1, total },
    isComplete: currentQuestionIndex >= total,
  };
}

// ============ Internal Functions ============

/**
 * Generate project reflection questions
 */
function generateProjectQuestions(data: ProjectAggregatedData): ProjectReflectionQuestion[] {
  const questions: ProjectReflectionQuestion[] = [];
  let questionId = 1;

  // 1. Technical decision question
  questions.push({
    id: `pq-${questionId++}`,
    category: 'decision',
    question: 'What key technical decisions did you make in this project? What were your considerations at the time?',
    context: `Project contains ${data.stats.total_commits} commits, core files: ${data.stats.core_files.slice(0, 5).join(', ')}`,
  });

  // 2. Pitfall questions (based on detected pitfalls)
  if (data.pitfalls.length > 0) {
    const highSeverityPitfalls = data.pitfalls.filter(p => p.severity === 'high');
    const pitfallContext = highSeverityPitfalls.length > 0
      ? highSeverityPitfalls.map(p => p.description).join('; ')
      : data.pitfalls[0].description;

    questions.push({
      id: `pq-${questionId++}`,
      category: 'pitfall',
      question: 'What unexpected problems did you encounter during development? What was the most painful issue?',
      context: `Detected issue signals: ${pitfallContext}`,
      related_commits: data.pitfalls.flatMap(p => p.commits).slice(0, 5),
    });

    // Follow-up questions for specific pitfalls
    for (const pitfall of data.pitfalls.slice(0, 2)) {
      if (pitfall.file) {
        questions.push({
          id: `pq-${questionId++}`,
          category: 'pitfall',
          question: `About ${pitfall.file}, I noticed it was modified multiple times. What issue occurred?`,
          context: pitfall.description,
          related_commits: pitfall.commits,
        });
      }
    }
  } else {
    questions.push({
      id: `pq-${questionId++}`,
      category: 'pitfall',
      question: 'What challenges did you encounter during development? How did you resolve them?',
    });
  }

  // 3. Learning question
  questions.push({
    id: `pq-${questionId++}`,
    category: 'learning',
    question: 'What did this project teach you? If you could do it again, what would you do differently?',
    context: `Time span: ${data.stats.time_span.start} ~ ${data.stats.time_span.end}`,
  });

  // 4. Additional question (if bugfix observations exist)
  const bugfixObs = data.observations.filter(o => o.type === 'bugfix');
  if (bugfixObs.length > 0) {
    questions.push({
      id: `pq-${questionId++}`,
      category: 'pitfall',
      question: 'Which bugs were caused by initial design flaws? How can they be avoided next time?',
      context: `Detected ${bugfixObs.length} bugfix records`,
      related_observations: bugfixObs.slice(0, 3).map(o => o.id),
    });
  }

  return questions;
}

/**
 * Generate follow-up question
 */
function generateFollowUpQuestion(
  originalQuestion: ProjectReflectionQuestion,
  data: ProjectAggregatedData
): ProjectReflectionQuestion | null {
  const followUps: Record<string, string> = {
    decision: 'Can you be more specific about which technology? Why did you choose it over other alternatives?',
    pitfall: 'What was the root cause of this issue? How long did it take to resolve?',
    learning: 'Can you give a specific example? How will this learning influence your future work?',
  };

  const followUp = followUps[originalQuestion.category];
  if (!followUp) return null;

  return {
    id: `${originalQuestion.id}-followup`,
    category: originalQuestion.category,
    question: followUp,
    context: originalQuestion.context,
    follow_up: originalQuestion.question,
  };
}

/**
 * Extract learnings from answers
 */
function extractProjectLearnings(session: ProjectReflectionSession): typeof session.learnings {
  const learnings: typeof session.learnings = [];

  for (const [questionId, answer] of Object.entries(session.answers)) {
    const question = session.questions.find(q => q.id === questionId);
    if (!question || answer.length < 20) continue;

    // Categorize learnings based on question category
    const categoryMap: Record<string, 'technical' | 'decision' | 'efficiency'> = {
      decision: 'decision',
      pitfall: 'technical',
      learning: 'efficiency',
    };

    learnings.push({
      category: categoryMap[question.category] || 'technical',
      content: answer.length > 200 ? answer.substring(0, 200) + '...' : answer,
      confidence: answer.length > 100 ? 'high' : 'medium',
      source_refs: [
        ...(question.related_commits || []),
        ...(question.related_observations?.map(id => `obs-${id}`) || []),
      ],
    });
  }

  return learnings;
}
