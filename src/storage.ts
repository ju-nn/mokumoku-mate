import { categories } from "./data";
import type {
  AppState,
  MateId,
  PomodoroPhase,
  QuestCompletionLog,
  QuestTemplate,
  SessionKind,
  TaskCategory,
  TaskResult,
  TicketDefinition,
  TimerMode,
  TimelinePost,
  TodayQuest,
  TutorialProgress,
  TutorialStepId,
  Weekday,
} from "./types";

export const STORAGE_KEY = "mokumoku-mate:v1:state";
const mateIds: MateId[] = [
  "waniyan",
  "kumaru",
  "shibatarou",
  "fukurou",
  "nekosenpai",
  "piyori",
  "azamaru",
  "usamaru",
  "kamekichi",
];
const tutorialStepIds: TutorialStepId[] = [
  "profile",
  "timeline_reaction",
  "category",
  "duration",
  "start",
  "result",
  "notifications",
  "quests",
  "fill_quests",
  "custom_quest",
  "tickets",
  "achievements",
  "settings",
];
const tutorialStepIdSet = new Set<string>(tutorialStepIds);

function makeDefaultAffinity(): Record<MateId, number> {
  return {
    waniyan: 0,
    kumaru: 0,
    shibatarou: 0,
    piyori: 0,
    azamaru: 0,
    kamekichi: 0,
    nekosenpai: 0,
    usamaru: 0,
    fukurou: 0,
  };
}

function makeDefaultCategoryUseCounts(): Record<TaskCategory, number> {
  return Object.fromEntries(categories.map((category) => [category.id, 0])) as Record<TaskCategory, number>;
}

function normalizeCategory(category: unknown): TaskCategory {
  const oldCategoryMap: Record<string, TaskCategory> = {
    cleaning: "organize",
    tidying: "organize",
    trash: "organize",
    dishes: "housework",
    laundry: "housework",
    cooking: "housework",
    shopping: "housework",
    work: "work",
    email: "work",
    paperwork: "work",
    money: "work",
    study: "learning",
    coding: "learning",
    reading: "learning",
    writing: "writing",
    creative: "creative",
    free: "creative",
    walk: "care",
    exercise: "care",
    bath: "care",
    medicine: "care",
  };
  if (typeof category === "string" && oldCategoryMap[category]) return oldCategoryMap[category];
  if (category === "free") return "creative";
  return categories.some((item) => item.id === category) ? (category as TaskCategory) : "care";
}

function mergeTicketDefinitions(saved: TicketDefinition[] | undefined): TicketDefinition[] {
  return Array.isArray(saved) ? saved : [];
}

type StoredQuest = {
  id?: unknown;
  templateId?: unknown;
  questId?: unknown;
  title?: unknown;
  source?: unknown;
  enabled?: unknown;
  createdAt?: unknown;
  completedAt?: unknown;
};

function normalizeQuestTemplate(quest: StoredQuest): QuestTemplate {
  return {
    id: typeof quest.id === "string" ? quest.id : `custom-quest-${Date.now()}`,
    title: typeof quest.title === "string" ? quest.title : "",
    source: quest.source === "mate" ? "mate" as const : "custom" as const,
    enabled: quest.enabled !== false,
  };
}

function normalizeTodayQuest(quest: StoredQuest): TodayQuest {
  return {
    id: typeof quest.id === "string" ? quest.id : `quest-${Date.now()}`,
    templateId: typeof quest.templateId === "string" ? quest.templateId : undefined,
    title: typeof quest.title === "string" ? quest.title : "",
    source: quest.source === "mate" ? "mate" as const : "custom" as const,
    createdAt: typeof quest.createdAt === "string" ? quest.createdAt : new Date().toISOString(),
    completedAt: typeof quest.completedAt === "string" ? quest.completedAt : undefined,
  };
}

function normalizeQuestCompletionLog(log: StoredQuest): QuestCompletionLog {
  return {
    id: typeof log.id === "string" ? log.id : `quest-log-${Date.now()}`,
    questId: typeof log.questId === "string" ? log.questId : typeof log.id === "string" ? log.id : "",
    title: typeof log.title === "string" ? log.title : "",
    source: log.source === "mate" ? "mate" as const : "custom" as const,
    completedAt: typeof log.completedAt === "string" ? log.completedAt : new Date().toISOString(),
  };
}

function normalizeTicketDefinition(ticket: TicketDefinition) {
  return {
    id: ticket.id,
    name: ticket.name,
    requiredCompletions: Math.max(1, Number(ticket.requiredCompletions) || 3),
    description: ticket.description,
    costMemo: ticket.costMemo,
    repeatable: ticket.repeatable,
    enabled: ticket.enabled,
  };
}

function normalizeTimerMode(mode: unknown): TimerMode {
  return mode === "pomodoro" ? "pomodoro" : "free";
}

function normalizeWeekday(day: unknown): Weekday {
  return typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6 ? day as Weekday : 0;
}

function normalizeSessionKind(kind: unknown): SessionKind {
  return kind === "break" ? "break" : "task";
}

function normalizePomodoroPhase(phase: unknown): PomodoroPhase | undefined {
  if (phase === "focus" || phase === "short_break" || phase === "long_break") return phase;
  return undefined;
}

function normalizeTaskResult(result: unknown): TaskResult | undefined {
  if (result === "failed") return "interrupted";
  if (result === "complete" || result === "partial" || result === "interrupted") return result;
  return undefined;
}

function makeDefaultTutorialProgress(): TutorialProgress {
  return {
    completedStepIds: [],
  };
}

export function normalizeState(parsed: AppState): AppState | null {
    if (parsed.version !== 1 || !Array.isArray(parsed.posts) || !Array.isArray(parsed.sessions)) {
      return null;
    }
    const mateAffinity = {
      ...makeDefaultAffinity(),
      ...(parsed.mateAffinity ?? {}),
    };
    for (const mateId of mateIds) {
      mateAffinity[mateId] = Math.max(0, Math.min(20, Number(mateAffinity[mateId]) || 0));
    }
    let posts: TimelinePost[] = parsed.posts.map((post) => ({
      ...post,
      taskCategory: post.taskCategory ? normalizeCategory(post.taskCategory) : undefined,
      taskResult: normalizeTaskResult(post.taskResult),
      reaction: (post.reaction as string | null | undefined) === "cloud" ? "like" : post.reaction,
      mateLikes: Array.isArray(post.mateLikes) ? post.mateLikes.filter((mateId) => mateIds.includes(mateId)) : [],
    }));
    const categoryUseCounts = {
      ...makeDefaultCategoryUseCounts(),
      ...(parsed.categoryUseCounts ?? {}),
    };
    const savedCategoryUseCounts = parsed.categoryUseCounts as Record<string, number> | undefined;
    if (savedCategoryUseCounts) {
      for (const [oldCategory, count] of Object.entries(savedCategoryUseCounts)) {
        const category = normalizeCategory(oldCategory);
        categoryUseCounts[category] = (categoryUseCounts[category] ?? 0) + (Number(count) || 0);
      }
    }
    for (const category of categories) {
      categoryUseCounts[category.id] = Math.max(0, Number(categoryUseCounts[category.id]) || 0);
    }
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map((session) => ({
        ...session,
        category: normalizeCategory(session.category),
        kind: normalizeSessionKind(session.kind),
        timerMode: normalizeTimerMode(session.timerMode),
        pomodoroPhase: normalizePomodoroPhase(session.pomodoroPhase),
        pomodoroCycle: Math.max(1, Number(session.pomodoroCycle) || 1),
        pausedAt: typeof session.pausedAt === "string" ? session.pausedAt : undefined,
        pausedTotalSeconds: Math.max(0, Number(session.pausedTotalSeconds) || 0),
      }))
      : [];
    const resultBySessionId = new Map(
      sessions
        .filter((session) => session.id && session.result)
        .map((session) => [session.id, normalizeTaskResult(session.result)]),
    );
    posts = posts.map((post) => {
      if (post.taskResult || post.type !== "user_task_result" || !post.taskSessionId) return post;
      const inferredResult = resultBySessionId.get(post.taskSessionId);
      return inferredResult ? { ...post, taskResult: inferredResult } : post;
    });
    const ticketDefinitions = mergeTicketDefinitions(parsed.ticketDefinitions).map(normalizeTicketDefinition);
    return {
      ...parsed,
      mateAffinity,
      posts,
      sessions,
      categoryUseCounts,
      customQuests: Array.isArray(parsed.customQuests) ? parsed.customQuests.map(normalizeQuestTemplate) : [],
      todayQuests: Array.isArray(parsed.todayQuests) ? parsed.todayQuests.map(normalizeTodayQuest) : [],
      weeklyQuests: Array.isArray(parsed.weeklyQuests) ? parsed.weeklyQuests.map(normalizeTodayQuest) : [],
      questWeekStartedAt: typeof parsed.questWeekStartedAt === "string" ? parsed.questWeekStartedAt : new Date().toISOString(),
      questWeekEndsOn: normalizeWeekday(parsed.questWeekEndsOn),
      ticketDefinitions,
      ticketInventory: parsed.ticketInventory ?? {},
      ticketAwardedCounts: parsed.ticketAwardedCounts ?? {},
      questCompletionCount: Math.max(0, Number(parsed.questCompletionCount) || 0),
      questCompletionLog: Array.isArray(parsed.questCompletionLog) ? parsed.questCompletionLog.map(normalizeQuestCompletionLog) : [],
      lastNotificationSeenAt: typeof parsed.lastNotificationSeenAt === "string" ? parsed.lastNotificationSeenAt : undefined,
      introSeenAt: typeof parsed.introSeenAt === "string" ? parsed.introSeenAt : undefined,
      pageGuideSeenAt: {
        quests: typeof parsed.pageGuideSeenAt?.quests === "string" ? parsed.pageGuideSeenAt.quests : undefined,
        tickets: typeof parsed.pageGuideSeenAt?.tickets === "string" ? parsed.pageGuideSeenAt.tickets : undefined,
      },
      timerMode: normalizeTimerMode(parsed.timerMode),
      pomodoroCycle: Math.max(1, Math.min(4, Number(parsed.pomodoroCycle) || 1)),
      notificationsEnabled: parsed.notificationsEnabled === true,
      tutorialProgress: {
        ...makeDefaultTutorialProgress(),
        ...(parsed.tutorialProgress ?? {}),
        completedStepIds: Array.isArray(parsed.tutorialProgress?.completedStepIds)
          ? parsed.tutorialProgress!.completedStepIds.filter((step): step is TutorialProgress["completedStepIds"][number] => typeof step === "string" && tutorialStepIdSet.has(step))
          : [],
        finishedAt: typeof parsed.tutorialProgress?.finishedAt === "string" ? parsed.tutorialProgress.finishedAt : undefined,
      },
    };
}

export function parseStateBackup(raw: string): AppState | null {
  try {
    return normalizeState(JSON.parse(raw) as AppState);
  } catch {
    return null;
  }
}

export function loadState(): AppState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseStateBackup(raw);
  } catch {
    return null;
  }
}

export function saveState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  window.localStorage.removeItem(STORAGE_KEY);
}
