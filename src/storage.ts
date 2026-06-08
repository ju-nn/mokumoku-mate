import { categories, defaultTicketDefinitions } from "./data";
import type { AppState, MateId, TaskCategory, TicketDefinition, TimelinePost } from "./types";

const STORAGE_KEY = "mokumoku-mate:v1:state";
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

function mateForCategory(category: TaskCategory): MateId {
  const map: Record<TaskCategory, MateId> = {
    organize: "waniyan",
    housework: "kumaru",
    work: "shibatarou",
    learning: "fukurou",
    writing: "nekosenpai",
    creative: "piyori",
    care: "azamaru",
  };
  return map[category];
}

function mergeTicketDefinitions(saved: TicketDefinition[] | undefined): TicketDefinition[] {
  const savedDefinitions = Array.isArray(saved) ? saved : [];
  const savedIds = new Set(savedDefinitions.map((ticket) => ticket.id));
  return [
    ...savedDefinitions,
    ...defaultTicketDefinitions.filter((ticket) => !savedIds.has(ticket.id)),
  ];
}

export function loadState(): AppState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppState;
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
    const posts: TimelinePost[] = parsed.posts.map((post) => ({
      ...post,
      taskCategory: post.taskCategory ? normalizeCategory(post.taskCategory) : undefined,
      reaction: (post.reaction as string | null | undefined) === "cloud" ? "like" : post.reaction,
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
      ? parsed.sessions.map((session) => ({ ...session, category: normalizeCategory(session.category) }))
      : [];
    const normalizeQuest = <T extends { category: TaskCategory; source?: string; suggestedBy?: MateId }>(quest: T): T => {
      const category = normalizeCategory(quest.category);
      return {
        ...quest,
        category,
        suggestedBy: quest.source === "mate" ? mateForCategory(category) : quest.suggestedBy,
      };
    };
    const ticketDefinitions = mergeTicketDefinitions(parsed.ticketDefinitions).map((ticket) => ({
      ...ticket,
      category: normalizeCategory(ticket.category),
    }));
    return {
      ...parsed,
      mateAffinity,
      posts,
      sessions,
      categoryUseCounts,
      customQuests: Array.isArray(parsed.customQuests) ? parsed.customQuests.map(normalizeQuest) : [],
      todayQuests: Array.isArray(parsed.todayQuests) ? parsed.todayQuests.map(normalizeQuest) : [],
      weeklyQuests: Array.isArray(parsed.weeklyQuests) ? parsed.weeklyQuests.map(normalizeQuest) : [],
      questWeekStartedAt: typeof parsed.questWeekStartedAt === "string" ? parsed.questWeekStartedAt : new Date().toISOString(),
      ticketDefinitions,
      ticketInventory: parsed.ticketInventory ?? {},
      ticketAwardedCounts: parsed.ticketAwardedCounts ?? {},
      questCompletionCount: Math.max(0, Number(parsed.questCompletionCount) || 0),
      questCompletionLog: Array.isArray(parsed.questCompletionLog) ? parsed.questCompletionLog.map(normalizeQuest) : [],
    };
  } catch {
    return null;
  }
}

export function saveState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
