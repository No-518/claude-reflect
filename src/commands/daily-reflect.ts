/**
 * /daily-reflect command
 *
 * Step-based API design for AI-driven interactive reflection
 */

import { DataAggregator } from '../core/aggregator';
import { ProfileManager } from '../core/profile';
import { ReflectionEngine, QuestionGenerator, LearningExtractor, DialogStateMachine } from '../core/reflection';
import { ReportGenerator } from '../core/report';
import { formatDate, parseDate } from '../utils/paths';
import type { DailyTimeline, ReflectionSession, DailyReport, ReflectionQuestion, UserProfile } from '../types';

// ============ Options and Result Types ============

export interface DailyReflectOptions {
  /** Specify date (YYYY-MM-DD) */
  date?: string;
  /** Whether to overwrite existing report */
  overwrite?: boolean;
  /** Whether to append to existing report */
  append?: boolean;
}

export interface DailyReflectResult {
  success: boolean;
  date: string;
  timeline?: DailyTimeline;
  session?: ReflectionSession;
  report?: DailyReport;
  reportPath?: string;
  message: string;
  error?: Error;
}

// ============ Step-based API Types ============

export interface InitReflectionResult {
  success: boolean;
  date: string;
  timeline?: DailyTimeline;
  question?: ReflectionQuestion;
  totalQuestions?: number;
  message: string;
  error?: Error;
}

export interface SubmitAnswerResult {
  success: boolean;
  action: 'follow_up' | 'next' | 'complete';
  nextQuestion?: ReflectionQuestion;
  progress?: { current: number; total: number };
  message: string;
}

export interface CompleteReflectionResult {
  success: boolean;
  report?: DailyReport;
  reportPath?: string;
  session?: ReflectionSession;
  message: string;
  error?: Error;
}

export interface GetQuestionResult {
  success: boolean;
  question?: ReflectionQuestion;
  progress?: { current: number; total: number };
  isComplete: boolean;
  message: string;
}

// ============ Session State Management ============

interface ReflectionSessionState {
  date: string;
  timeline: DailyTimeline;
  profile: UserProfile;
  engine: ReflectionEngine;
  aggregator: DataAggregator;
  profileManager: ProfileManager;
  reportGenerator: ReportGenerator;
  options: DailyReflectOptions;
}

// In-memory session state (singleton)
let currentSession: ReflectionSessionState | null = null;

// ============ Legacy Check Function ============

/**
 * Check data availability and prepare for reflection
 * Maintains backward compatibility
 */
export async function dailyReflect(
  options: DailyReflectOptions = {}
): Promise<DailyReflectResult> {
  const date = options.date || formatDate();

  try {
    // Validate date format
    parseDate(date);
  } catch {
    return {
      success: false,
      date,
      message: `Invalid date format: ${date}. Please use YYYY-MM-DD format.`,
    };
  }

  // Initialize components
  const profileManager = new ProfileManager();
  const profile = profileManager.initialize();
  const aggregator = new DataAggregator({
    projectPaths: profileManager.getProjectPaths(),
  });
  const reportGenerator = new ReportGenerator();

  try {
    // Check data source availability
    const availability = await aggregator.checkAvailability();
    if (availability.mode === 'unavailable') {
      return {
        success: false,
        date,
        message: 'Both claude-mem and git data sources are unavailable. Please ensure at least one data source is accessible.',
      };
    }

    // Show degraded mode message
    let modeMessage = '';
    if (availability.mode === 'db-only') {
      modeMessage = '(Degraded mode: using local database)';
    } else if (availability.mode === 'git-only') {
      modeMessage = '(Git-only mode: claude-mem unavailable)';
    }

    // Get timeline data
    const timeline = await aggregator.getDailyTimeline(date);

    // Check if there's data
    if (timeline.events.length === 0) {
      return {
        success: false,
        date,
        timeline,
        message: `No work records found for ${date}. Please select another date.`,
      };
    }

    // Check if report already exists
    if (reportGenerator.reportExists(date) && !options.overwrite && !options.append) {
      return {
        success: false,
        date,
        timeline,
        message: `Report for ${date} already exists. Use --overwrite to replace or --append to add.`,
      };
    }

    // Backup existing report
    if (reportGenerator.reportExists(date) && options.overwrite) {
      reportGenerator.backupReport(date);
    }

    // Return initial state, waiting for interactive reflection
    return {
      success: true,
      date,
      timeline,
      message: `Ready to start reflection for ${date} ${modeMessage}\n` +
        `- Total events: ${timeline.events.length}\n` +
        `- Observations: ${timeline.stats.total_observations}\n` +
        `- Commits: ${timeline.stats.total_commits}\n` +
        `- Active projects: ${timeline.stats.projects_active.join(', ') || 'None'}`,
    };
  } catch (error) {
    return {
      success: false,
      date,
      message: `Reflection error: ${(error as Error).message}`,
      error: error as Error,
    };
  } finally {
    aggregator.close();
  }
}

// ============ Step-based API ============

/**
 * Initialize reflection session
 * Returns timeline and first question
 */
export async function initReflection(
  date: string,
  options: DailyReflectOptions = {}
): Promise<InitReflectionResult> {
  // Clean up previous session
  if (currentSession) {
    currentSession.aggregator.close();
    currentSession = null;
  }

  try {
    // Validate date format
    parseDate(date);
  } catch {
    return {
      success: false,
      date,
      message: `Invalid date format: ${date}. Please use YYYY-MM-DD format.`,
    };
  }

  // Initialize components
  const profileManager = new ProfileManager();
  const profile = profileManager.initialize();
  const aggregator = new DataAggregator({
    projectPaths: profileManager.getProjectPaths(),
  });
  const engine = new ReflectionEngine();
  const reportGenerator = new ReportGenerator();

  try {
    // Check data source availability
    const availability = await aggregator.checkAvailability();
    if (availability.mode === 'unavailable') {
      aggregator.close();
      return {
        success: false,
        date,
        message: 'Both claude-mem and git data sources are unavailable. Please ensure at least one data source is accessible.',
      };
    }

    // Get timeline data
    const timeline = await aggregator.getDailyTimeline(date);

    // Check if there's data
    if (timeline.events.length === 0) {
      aggregator.close();
      return {
        success: false,
        date,
        timeline,
        message: `No work records found for ${date}. Please select another date.`,
      };
    }

    // Check if report already exists
    if (reportGenerator.reportExists(date) && !options.overwrite && !options.append) {
      aggregator.close();
      return {
        success: false,
        date,
        timeline,
        message: `Report for ${date} already exists. Use overwrite: true to replace or append: true to add.`,
      };
    }

    // Backup existing report
    if (reportGenerator.reportExists(date) && options.overwrite) {
      reportGenerator.backupReport(date);
    }

    // Start reflection session
    const firstQuestion = engine.startSession(timeline, profile);
    if (!firstQuestion) {
      aggregator.close();
      return {
        success: false,
        date,
        timeline,
        message: 'Unable to generate reflection questions.',
      };
    }

    const progress = engine.getProgress();

    // Save session state
    currentSession = {
      date,
      timeline,
      profile,
      engine,
      aggregator,
      profileManager,
      reportGenerator,
      options,
    };

    return {
      success: true,
      date,
      timeline,
      question: firstQuestion,
      totalQuestions: progress?.total,
      message: `Reflection session started. ${progress?.total} questions total.`,
    };
  } catch (error) {
    aggregator.close();
    return {
      success: false,
      date,
      message: `Failed to initialize reflection: ${(error as Error).message}`,
      error: error as Error,
    };
  }
}

/**
 * Get current question
 */
export function getCurrentQuestion(): GetQuestionResult {
  if (!currentSession) {
    return {
      success: false,
      isComplete: false,
      message: 'No active reflection session. Please call initReflection() first.',
    };
  }

  const { engine } = currentSession;

  if (engine.isComplete()) {
    return {
      success: true,
      isComplete: true,
      message: 'All questions completed. Please call completeReflection() to generate report.',
    };
  }

  const session = engine.getSession();
  const progress = engine.getProgress();

  // Get current question from session
  if (session && progress) {
    const currentIndex = progress.current - 1;
    const question = session.questions[currentIndex];

    return {
      success: true,
      question,
      progress,
      isComplete: false,
      message: `Question ${progress.current}/${progress.total}`,
    };
  }

  return {
    success: false,
    isComplete: false,
    message: 'Unable to get current question.',
  };
}

/**
 * Submit answer
 */
export function submitAnswer(
  questionId: string,
  answer: string
): SubmitAnswerResult {
  if (!currentSession) {
    return {
      success: false,
      action: 'complete',
      message: 'No active reflection session. Please call initReflection() first.',
    };
  }

  const { engine } = currentSession;

  if (engine.isComplete()) {
    return {
      success: true,
      action: 'complete',
      message: 'All questions completed. Please call completeReflection() to generate report.',
    };
  }

  // Process answer
  const result = engine.processAnswer(answer);
  const progress = engine.getProgress();

  if (result.action === 'complete') {
    return {
      success: true,
      action: 'complete',
      progress: progress || undefined,
      message: 'Great! All questions completed. Please call completeReflection() to generate report.',
    };
  }

  if (result.action === 'follow_up') {
    return {
      success: true,
      action: 'follow_up',
      nextQuestion: result.question,
      progress: progress || undefined,
      message: result.message || 'Could you elaborate on that?',
    };
  }

  // next
  return {
    success: true,
    action: 'next',
    nextQuestion: result.question,
    progress: progress || undefined,
    message: 'Got it, moving to next question.',
  };
}

/**
 * Complete reflection and generate report
 */
export function completeReflection(): CompleteReflectionResult {
  if (!currentSession) {
    return {
      success: false,
      message: 'No active reflection session. Please call initReflection() first.',
    };
  }

  const { date, timeline, engine, profileManager, reportGenerator } = currentSession;

  try {
    // Complete session
    const session = engine.completeSession(timeline);
    if (!session) {
      return {
        success: false,
        message: 'Failed to complete reflection session.',
      };
    }

    // Generate report
    const report = reportGenerator.generateReport(timeline, session);
    const reportPath = reportGenerator.saveReport(report);

    // Update user profile
    if (session.profile_updates && Object.keys(session.profile_updates).length > 0) {
      profileManager.update(session.profile_updates);
    }

    // Clean up session
    currentSession.aggregator.close();
    currentSession = null;

    return {
      success: true,
      report,
      reportPath,
      session,
      message: `Reflection complete! Report saved to: ${reportPath}`,
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
 * Cancel current reflection session
 */
export function cancelReflection(): { success: boolean; message: string } {
  if (!currentSession) {
    return {
      success: false,
      message: 'No active reflection session.',
    };
  }

  currentSession.aggregator.close();
  currentSession = null;

  return {
    success: true,
    message: 'Reflection session cancelled.',
  };
}

/**
 * Get session status
 */
export function getSessionStatus(): {
  active: boolean;
  date?: string;
  progress?: { current: number; total: number };
  isComplete?: boolean;
} {
  if (!currentSession) {
    return { active: false };
  }

  const { date, engine } = currentSession;
  const progress = engine.getProgress();

  return {
    active: true,
    date,
    progress: progress || undefined,
    isComplete: engine.isComplete(),
  };
}

// ============ Backward Compatibility: Legacy Callback API ============

/**
 * Run complete interactive reflection flow
 * @deprecated Recommend using step-based API (initReflection, submitAnswer, completeReflection)
 */
export async function runInteractiveReflection(
  date: string,
  answerCallback: (question: string) => Promise<string>
): Promise<DailyReflectResult> {
  // Initialize components
  const profileManager = new ProfileManager();
  const profile = profileManager.initialize();
  const aggregator = new DataAggregator({
    projectPaths: profileManager.getProjectPaths(),
  });
  const reflectionEngine = new ReflectionEngine();
  const reportGenerator = new ReportGenerator();

  try {
    // Get timeline
    const timeline = await aggregator.getDailyTimeline(date);

    if (timeline.events.length === 0) {
      return {
        success: false,
        date,
        message: `No work records found for ${date}.`,
      };
    }

    // Start reflection session
    const firstQuestion = reflectionEngine.startSession(timeline, profile);
    if (!firstQuestion) {
      return {
        success: false,
        date,
        message: 'Unable to generate reflection questions.',
      };
    }

    // Interactive Q&A loop
    let currentQuestion = firstQuestion;
    while (!reflectionEngine.isComplete()) {
      const progress = reflectionEngine.getProgress();
      const questionText = `[${progress?.current}/${progress?.total}] ${currentQuestion.question}`;

      // Get user answer
      const answer = await answerCallback(questionText);

      // Process answer
      const result = reflectionEngine.processAnswer(answer);

      if (result.action === 'complete') {
        break;
      }

      if (result.question) {
        currentQuestion = result.question;
      }
    }

    // Complete session
    const session = reflectionEngine.completeSession(timeline);
    if (!session) {
      return {
        success: false,
        date,
        message: 'Failed to complete reflection session.',
      };
    }

    // Generate report
    const report = reportGenerator.generateReport(timeline, session);
    const reportPath = reportGenerator.saveReport(report);

    // Update user profile
    if (session.profile_updates && Object.keys(session.profile_updates).length > 0) {
      profileManager.update(session.profile_updates);
    }

    return {
      success: true,
      date,
      timeline,
      session,
      report,
      reportPath,
      message: `Reflection complete! Report saved to: ${reportPath}`,
    };
  } catch (error) {
    return {
      success: false,
      date,
      message: `Reflection error: ${(error as Error).message}`,
      error: error as Error,
    };
  } finally {
    aggregator.close();
  }
}
