/**
 * Reflection Engine
 *
 * Contains question generation, dialog management, and learning extraction
 */

import type {
  DailyTimeline,
  UserProfile,
  ReflectionQuestion,
  ReflectionSession,
  Learning,
  LearningCategory,
  TimelineEvent,
} from '../types';

// ============ Question Templates ============

const TECHNICAL_QUESTIONS = [
  {
    template: 'What new knowledge did you learn about {topic} today?',
    followUp: 'How can this knowledge be applied to other scenarios?',
  },
  {
    template: 'What technical details about {topic} impressed you the most?',
    followUp: 'How do you plan to deepen your understanding of this area?',
  },
  {
    template: 'Which technical problem was the most challenging today? How did you solve it?',
    followUp: 'What would you do differently next time you encounter a similar problem?',
  },
  {
    template: 'What did you learn from the code you modified today?',
    followUp: 'How will these learnings influence your future coding habits?',
  },
];

const DECISION_QUESTIONS = [
  {
    template: 'What important technical decisions did you make today?',
    followUp: 'What were the main trade-offs for these decisions?',
  },
  {
    template: 'How did you evaluate different options for the {topic} decision?',
    followUp: 'Looking back at this decision, would you make a different choice?',
  },
  {
    template: 'Was there any decision today that made you hesitate? Why?',
    followUp: 'How did you ultimately make your choice?',
  },
  {
    template: 'If you could start over, what decisions would you make differently in today\'s work?',
    followUp: 'What insights does this reflection provide for the future?',
  },
];

const EFFICIENCY_QUESTIONS = [
  {
    template: 'Which part of today\'s work took the most time?',
    followUp: 'What methods could improve efficiency in this area?',
  },
  {
    template: 'Were you blocked by anything today? How did you resolve it?',
    followUp: 'How can similar blockers be avoided in the future?',
  },
  {
    template: 'Looking back at today\'s workflow, what could be optimized?',
    followUp: 'How do you plan to implement these optimizations?',
  },
  {
    template: 'How was your work rhythm today? Were there any particularly productive or unproductive periods?',
    followUp: 'How can you use this insight to plan tomorrow\'s work?',
  },
];

// ============ QuestionGenerator ============

export class QuestionGenerator {
  /**
   * Generate questions based on timeline data
   */
  generateQuestions(
    timeline: DailyTimeline,
    profile: UserProfile
  ): ReflectionQuestion[] {
    const eventCount = timeline.events.length;

    // Determine question count based on event count
    let questionCount: number;
    if (eventCount < 5) {
      questionCount = 3;
    } else if (eventCount <= 15) {
      questionCount = 5;
    } else {
      questionCount = 8;
    }

    // Extract topics
    const topics = this.extractTopics(timeline);

    // Generate questions, ensuring all three dimensions are covered
    const questions: ReflectionQuestion[] = [];

    // At least one technical question
    questions.push(
      this.generateQuestion('technical', topics, questions.length)
    );

    // At least one decision question
    questions.push(
      this.generateQuestion('decision', topics, questions.length)
    );

    // At least one efficiency question
    questions.push(
      this.generateQuestion('efficiency', topics, questions.length)
    );

    // Fill remaining questions
    const categories: LearningCategory[] = ['technical', 'decision', 'efficiency'];
    while (questions.length < questionCount) {
      const category = categories[questions.length % 3];
      questions.push(this.generateQuestion(category, topics, questions.length));
    }

    return questions;
  }

  /**
   * Extract topics from timeline
   */
  private extractTopics(timeline: DailyTimeline): string[] {
    const topics = new Set<string>();

    for (const event of timeline.events) {
      // Extract from event type
      topics.add(event.type);

      // Extract keywords from title
      const titleWords = event.title.split(/\s+/).filter((w) => w.length > 3);
      titleWords.slice(0, 3).forEach((w) => topics.add(w));

      // Extract concepts from observations
      if (event.source === 'claude-mem' && 'concepts' in event.details) {
        const obs = event.details as any;
        if (obs.concepts) {
          obs.concepts.slice(0, 3).forEach((c: string) => topics.add(c));
        }
      }
    }

    return Array.from(topics).slice(0, 10);
  }

  /**
   * Generate a single question
   */
  private generateQuestion(
    category: LearningCategory,
    topics: string[],
    index: number
  ): ReflectionQuestion {
    let templates: typeof TECHNICAL_QUESTIONS;

    switch (category) {
      case 'technical':
        templates = TECHNICAL_QUESTIONS;
        break;
      case 'decision':
        templates = DECISION_QUESTIONS;
        break;
      case 'efficiency':
        templates = EFFICIENCY_QUESTIONS;
        break;
    }

    // Select template
    const template = templates[index % templates.length];
    const topic = topics[index % topics.length] || 'today\'s work';

    // Replace placeholder
    const question = template.template.replace('{topic}', topic);
    const followUp = template.followUp;

    return {
      id: `q-${category}-${index}`,
      category,
      question,
      follow_up: followUp,
    };
  }
}

// ============ DialogStateMachine ============

export type DialogState = 'idle' | 'asking' | 'waiting' | 'following_up' | 'complete';

export interface DialogContext {
  state: DialogState;
  currentQuestionIndex: number;
  questions: ReflectionQuestion[];
  answers: Record<string, string>;
  followUpCount: number;
}

export class DialogStateMachine {
  private context: DialogContext;

  constructor(questions: ReflectionQuestion[]) {
    this.context = {
      state: 'idle',
      currentQuestionIndex: 0,
      questions,
      answers: {},
      followUpCount: 0,
    };
  }

  /**
   * Get current state
   */
  getState(): DialogState {
    return this.context.state;
  }

  /**
   * Get current question
   */
  getCurrentQuestion(): ReflectionQuestion | null {
    if (this.context.currentQuestionIndex >= this.context.questions.length) {
      return null;
    }
    return this.context.questions[this.context.currentQuestionIndex];
  }

  /**
   * Start dialog
   */
  start(): ReflectionQuestion | null {
    this.context.state = 'asking';
    return this.getCurrentQuestion();
  }

  /**
   * Process user answer
   */
  processAnswer(answer: string): {
    action: 'follow_up' | 'next' | 'complete';
    question?: ReflectionQuestion;
    message?: string;
  } {
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      this.context.state = 'complete';
      return { action: 'complete', message: 'All questions completed' };
    }

    // Save answer
    this.context.answers[currentQuestion.id] = answer;

    // Decide next action
    const answerLength = answer.trim().length;

    // If answer is too short and haven't followed up yet, follow up
    if (answerLength < 20 && this.context.followUpCount < 1 && currentQuestion.follow_up) {
      this.context.state = 'following_up';
      this.context.followUpCount++;

      return {
        action: 'follow_up',
        question: {
          ...currentQuestion,
          question: currentQuestion.follow_up!,
          id: `${currentQuestion.id}-followup`,
        },
        message: 'Could you elaborate on that?',
      };
    }

    // Move to next question
    this.context.currentQuestionIndex++;
    this.context.followUpCount = 0;

    const nextQuestion = this.getCurrentQuestion();
    if (!nextQuestion) {
      this.context.state = 'complete';
      return { action: 'complete', message: 'Great! Reflection session completed.' };
    }

    this.context.state = 'asking';
    return { action: 'next', question: nextQuestion };
  }

  /**
   * Get all answers
   */
  getAnswers(): Record<string, string> {
    return { ...this.context.answers };
  }

  /**
   * Check if complete
   */
  isComplete(): boolean {
    return this.context.state === 'complete';
  }

  /**
   * Get progress
   */
  getProgress(): { current: number; total: number } {
    return {
      current: this.context.currentQuestionIndex + 1,
      total: this.context.questions.length,
    };
  }
}

// ============ LearningExtractor ============

export class LearningExtractor {
  /**
   * Extract learnings from dialog
   */
  extractLearnings(
    questions: ReflectionQuestion[],
    answers: Record<string, string>,
    timeline: DailyTimeline
  ): Learning[] {
    const learnings: Learning[] = [];

    for (const question of questions) {
      const answer = answers[question.id];
      if (!answer || answer.trim().length < 10) continue;

      // Analyze answer, extract learning
      const learning = this.analyzeAnswer(question, answer, timeline);
      if (learning) {
        learnings.push(learning);
      }
    }

    return learnings;
  }

  /**
   * Analyze a single answer
   */
  private analyzeAnswer(
    question: ReflectionQuestion,
    answer: string,
    timeline: DailyTimeline
  ): Learning | null {
    // Extract key content
    const content = this.extractContent(answer);
    if (!content) return null;

    // Determine confidence
    const confidence = this.determineConfidence(answer);

    // Find related references
    const sourceRefs = this.findSourceRefs(answer, timeline);

    return {
      category: question.category,
      content,
      confidence,
      source_refs: sourceRefs,
    };
  }

  /**
   * Extract answer core content
   */
  private extractContent(answer: string): string | null {
    const trimmed = answer.trim();
    if (trimmed.length < 10) return null;

    // If answer is long, extract key part
    if (trimmed.length > 200) {
      // Try to extract first sentence
      const firstSentence = trimmed.match(/^[^.!?]+[.!?]/);
      if (firstSentence) {
        return firstSentence[0];
      }
      return trimmed.substring(0, 200) + '...';
    }

    return trimmed;
  }

  /**
   * Determine confidence level
   */
  private determineConfidence(answer: string): 'high' | 'medium' | 'low' {
    const length = answer.trim().length;

    // Based on answer length and keywords
    if (length > 100) {
      // Check for certainty keywords
      if (/learned|understand|mastered|discovered|realized/i.test(answer)) {
        return 'high';
      }
      return 'medium';
    }

    if (length > 50) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Find related references
   */
  private findSourceRefs(answer: string, timeline: DailyTimeline): string[] {
    const refs: string[] = [];

    // Find possible file names or commit references in answer
    const fileMatches = answer.match(/[\w/-]+\.\w+/g);
    if (fileMatches) {
      for (const event of timeline.events) {
        if (event.source === 'claude-mem') {
          const obs = event.details as any;
          if (obs.files_modified?.some((f: string) => fileMatches.includes(f))) {
            refs.push(`observation#${obs.id}`);
          }
        }
      }
    }

    // If no references found, add first few events in time range
    if (refs.length === 0 && timeline.events.length > 0) {
      refs.push(timeline.events[0].id);
    }

    return refs.slice(0, 5);
  }
}

// ============ ReflectionEngine (Integration) ============

export class ReflectionEngine {
  private questionGenerator: QuestionGenerator;
  private learningExtractor: LearningExtractor;
  private stateMachine: DialogStateMachine | null = null;
  private session: ReflectionSession | null = null;

  constructor() {
    this.questionGenerator = new QuestionGenerator();
    this.learningExtractor = new LearningExtractor();
  }

  /**
   * Start reflection session
   */
  startSession(timeline: DailyTimeline, profile: UserProfile): ReflectionQuestion | null {
    // Generate questions
    const questions = this.questionGenerator.generateQuestions(timeline, profile);

    // Initialize state machine
    this.stateMachine = new DialogStateMachine(questions);

    // Initialize session
    this.session = {
      date: timeline.date,
      started_at: new Date().toISOString(),
      questions,
      answers: {},
      learnings: [],
      profile_updates: {},
    };

    // Start dialog
    return this.stateMachine.start();
  }

  /**
   * Process user answer
   */
  processAnswer(answer: string): {
    action: 'follow_up' | 'next' | 'complete';
    question?: ReflectionQuestion;
    message?: string;
  } {
    if (!this.stateMachine) {
      return { action: 'complete', message: 'Session not started' };
    }

    return this.stateMachine.processAnswer(answer);
  }

  /**
   * Complete session and extract learnings
   */
  completeSession(timeline: DailyTimeline): ReflectionSession | null {
    if (!this.session || !this.stateMachine) return null;

    // Get all answers
    this.session.answers = this.stateMachine.getAnswers();
    this.session.completed_at = new Date().toISOString();

    // Extract learnings
    this.session.learnings = this.learningExtractor.extractLearnings(
      this.session.questions,
      this.session.answers,
      timeline
    );

    return this.session;
  }

  /**
   * Get current progress
   */
  getProgress(): { current: number; total: number } | null {
    return this.stateMachine?.getProgress() || null;
  }

  /**
   * Check if complete
   */
  isComplete(): boolean {
    return this.stateMachine?.isComplete() || false;
  }

  /**
   * Get current session
   */
  getSession(): ReflectionSession | null {
    return this.session;
  }
}
