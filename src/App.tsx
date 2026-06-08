import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  categories,
  comments,
  defaultTicketDefinitions,
  durations,
  mateQuestTemplates,
  mates,
  resultLabels,
} from "./data";
import { loadState, saveState } from "./storage";
import type {
  AppState,
  MateComment,
  MateId,
  QuestCompletionLog,
  QuestTemplate,
  TaskCategory,
  TaskResult,
  TaskSession,
  TicketDefinition,
  TimelinePost,
  WeeklyQuest,
} from "./types";
import "./style.css";

const initialState: AppState = {
  version: 1,
  posts: makeMonologues(),
  sessions: [],
  mateAffinity: {
    waniyan: 0,
    kumaru: 0,
    shibatarou: 0,
    piyori: 0,
    azamaru: 0,
    kamekichi: 0,
    nekosenpai: 0,
    usamaru: 0,
    fukurou: 0,
  },
  categoryUseCounts: makeDefaultCategoryUseCounts(),
  customQuests: [],
  todayQuests: [],
  weeklyQuests: [],
  questWeekStartedAt: new Date().toISOString(),
  ticketDefinitions: defaultTicketDefinitions,
  ticketInventory: {},
  ticketAwardedCounts: {},
  questCompletionCount: 0,
  questCompletionLog: [],
};

const WEEKLY_QUEST_TARGET = 20;

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function categoryLabel(category: TaskCategory) {
  return categories.find((item) => item.id === category)?.label ?? "つくる";
}

function makeDefaultCategoryUseCounts(): Record<TaskCategory, number> {
  return Object.fromEntries(categories.map((item) => [item.id, 0])) as Record<TaskCategory, number>;
}

function supportMateForCategory(category: TaskCategory): MateId {
  const categoryMateMap: Record<TaskCategory, MateId> = {
    organize: "waniyan",
    housework: "kumaru",
    work: "shibatarou",
    learning: "fukurou",
    writing: "nekosenpai",
    creative: "piyori",
    care: "azamaru",
  };
  return categoryMateMap[category];
}

function isMateId(authorId: TimelinePost["authorId"]): authorId is MateId {
  return authorId !== "user";
}

function bumpAffinity(
  affinity: AppState["mateAffinity"],
  mateIds: MateId[],
  amount: number,
) {
  const next = { ...affinity };
  for (const mateId of mateIds) {
    next[mateId] = Math.max(0, Math.min(20, (next[mateId] ?? 0) + amount));
  }
  return next;
}

function makeMonologues(): TimelinePost[] {
  return comments
    .filter((comment) => comment.postType === "mate_monologue")
    .slice(0, 5)
    .map((comment, index) => ({
      id: `seed-${comment.id}`,
      type: "mate_monologue",
      authorId: comment.mateId,
      text: comment.text,
      createdAt: new Date(Date.now() - (5 - index) * 1000 * 60 * 7).toISOString(),
      reaction: null,
    }));
}

function pickComments(
  trigger: MateComment["trigger"],
  category: TaskCategory | undefined,
  count: number,
  recentPosts: TimelinePost[] = [],
  affinity: AppState["mateAffinity"] = initialState.mateAffinity,
) {
  const recentTexts = new Set(recentPosts.slice(0, 24).map((post) => post.text));
  const recentMateIds = recentPosts
    .slice(0, 10)
    .filter((post) => isMateId(post.authorId))
    .map((post) => post.authorId);
  const candidates = comments.filter(
    (comment) =>
      comment.trigger === trigger &&
      comment.postType === "mate_reply" &&
      (!comment.category || comment.category === category),
  ).filter(
    (comment) => (comment.minAffinity ?? 0) <= (affinity[comment.mateId] ?? 0),
  );
  const selected: MateComment[] = [];
  const usedMates = new Set<MateId>();
  const ranked = candidates
    .map((comment) => ({
      comment,
      score:
        Math.random() +
        (comment.category === category ? 2 : 0) -
        (recentTexts.has(comment.text) ? 6 : 0) -
        (recentMateIds.includes(comment.mateId) ? 0.6 : 0) +
        Math.min(1.1, (affinity[comment.mateId] ?? 0) / 18),
    }))
    .sort((a, b) => b.score - a.score);

  for (const item of ranked) {
    if (selected.length >= count) break;
    if (usedMates.has(item.comment.mateId) && ranked.length > count) continue;
    selected.push(item.comment);
    usedMates.add(item.comment.mateId);
  }

  return selected;
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getRemainingSeconds(session?: TaskSession) {
  if (!session) return 0;
  const total = session.durationMinutes * 60;
  const elapsed = Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 1000);
  return Math.max(0, total - elapsed);
}

function getSessionProgress(session?: TaskSession) {
  if (!session) return 0;
  const total = session.durationMinutes * 60;
  const remaining = getRemainingSeconds(session);
  return Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
}

function formatPostTime(createdAt: string, currentTime: number) {
  const diffSeconds = Math.max(0, Math.floor((currentTime - new Date(createdAt).getTime()) / 1000));
  if (diffSeconds < 60) return "いま";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}分`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}時間`;
  return new Date(createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

type QuestDraft = {
  id?: string;
  title: string;
  minutes: number;
  category: TaskCategory;
};

type TicketDraft = {
  id?: string;
  name: string;
  requiredCompletions: number;
  description: string;
  category: TaskCategory;
  costMemo: string;
  repeatable: boolean;
};

type ActiveView = "home" | "quests" | "tickets" | "achievements";

function makeQuestDraft(): QuestDraft {
  return {
    title: "",
    minutes: 3,
    category: "organize",
  };
}

function makeTicketDraft(): TicketDraft {
  return {
    name: "",
    requiredCompletions: 3,
    description: "",
    category: "care",
    costMemo: "",
    repeatable: true,
  };
}

function makeWeeklyQuest(template: QuestTemplate): WeeklyQuest {
  return {
    id: makeId("quest"),
    templateId: template.id,
    title: template.title,
    minutes: template.minutes,
    category: template.category,
    source: template.source,
    suggestedBy: template.source === "mate" ? supportMateForCategory(template.category) : template.suggestedBy,
    createdAt: new Date().toISOString(),
  };
}

function pickQuestReaction(quest: WeeklyQuest) {
  const mateId = quest.suggestedBy ?? supportMateForCategory(quest.category);
  const textByMate: Record<MateId, string> = {
    waniyan: `ええやん。「${quest.title}」でちょっと整ったな。勝ちや。`,
    kumaru: `「${quest.title}」できたねぇ。暮らしが少し回ったよぉ〜。`,
    shibatarou: `「${quest.title}」できたッ！働くクエスト、1個進んだッ！`,
    fukurou: `「${quest.title}」完了です。小さく区切れた良い記録ですよ。`,
    nekosenpai: `「${quest.title}」やったのね。まあ、悪くないわ。`,
    piyori: `「${quest.title}」できたぴよ〜。小さくつくった証ぴよ。`,
    azamaru: `「${quest.title}」できたまる。ちょっとととのったまる。`,
    usamaru: `「${quest.title}」できた！最初の一歩、ちゃんと見えたよ！`,
    kamekichi: `「${quest.title}」できたねぇ。ゆっくり進めばええよぉ。`,
  };
  return { mateId, text: textByMate[mateId] };
}

function nextTicketProgress(definition: TicketDefinition, completedCount: number) {
  const needed = definition.requiredCompletions;
  const remainder = completedCount % needed;
  const progress = remainder === 0 && completedCount > 0 ? needed : remainder;
  return { progress, needed, remaining: needed - progress };
}

function toDateKey(dateLike: string | number | Date) {
  const date = new Date(dateLike);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
}

function App() {
  const [state, setState] = useState<AppState>(() => loadState() ?? initialState);
  const [category, setCategory] = useState<TaskCategory>("organize");
  const [duration, setDuration] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [progressPostedFor, setProgressPostedFor] = useState<string | null>(null);
  const [questDraft, setQuestDraft] = useState<QuestDraft>(() => makeQuestDraft());
  const [ticketDraft, setTicketDraft] = useState<TicketDraft>(() => makeTicketDraft());
  const [latestReward, setLatestReward] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedMateId, setSelectedMateId] = useState<MateId | null>(null);
  const [customizingQuestId, setCustomizingQuestId] = useState<string | null>(null);

  const activeSession = useMemo(
    () => state.sessions.find((session) => session.id === state.activeSessionId),
    [state.activeSessionId, state.sessions],
  );
  const remainingSeconds = getRemainingSeconds(activeSession);
  const progressPercent = getSessionProgress(activeSession);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!activeSession || progressPostedFor === activeSession.id) return;
    const elapsed = Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000);
    if (elapsed < Math.min(90, activeSession.durationMinutes * 30)) return;
    const parent = state.posts.find((post) => post.taskSessionId === activeSession.id && post.type === "user_task_start");
    const comment = pickComments("progress", activeSession.category, 1, state.posts, state.mateAffinity)[0];
    if (!parent || !comment) return;
    const reply: TimelinePost = {
      id: makeId("post"),
      type: "mate_reply",
      authorId: comment.mateId,
      text: comment.text,
      createdAt: new Date().toISOString(),
      taskCategory: activeSession.category,
      taskSessionId: activeSession.id,
      parentPostId: parent.id,
      reaction: null,
    };
    setState((current) => ({
      ...current,
      mateAffinity: bumpAffinity(current.mateAffinity, [comment.mateId], 1),
      posts: [reply, ...current.posts],
    }));
    setProgressPostedFor(activeSession.id);
  }, [activeSession, now, progressPostedFor, state.mateAffinity, state.posts]);

  function queueMateReplies(
    parentPostId: string,
    sessionId: string,
    taskCategory: TaskCategory,
    pickedReplies: MateComment[],
    delayMs: number,
  ) {
    if (pickedReplies.length === 0) return;
    window.setTimeout(() => {
      const replies: TimelinePost[] = pickedReplies.map((comment) => ({
        id: makeId("post"),
        type: "mate_reply",
        authorId: comment.mateId,
        text: comment.text,
        createdAt: new Date().toISOString(),
        taskCategory,
        taskSessionId: sessionId,
        parentPostId,
        reaction: null,
      }));
      setState((current) => ({
        ...current,
        mateAffinity: bumpAffinity(current.mateAffinity, pickedReplies.map((comment) => comment.mateId), 1),
        posts: [...replies, ...current.posts],
      }));
    }, delayMs);
  }

  function startTask() {
    if (activeSession) return;
    const session: TaskSession = {
      id: makeId("session"),
      category,
      durationMinutes: duration,
      startedAt: new Date().toISOString(),
    };
    const startPost: TimelinePost = {
      id: makeId("post"),
      type: "user_task_start",
      authorId: "user",
      text: `${categoryLabel(category)}をはじめました。${duration}分だけもくもく。`,
      createdAt: session.startedAt,
      taskCategory: category,
      taskSessionId: session.id,
      reaction: null,
    };
    const pickedReplies = pickComments("task_start", category, 1, state.posts, state.mateAffinity);
    setProgressPostedFor(null);
    setState((current) => ({
      ...current,
      activeSessionId: session.id,
      categoryUseCounts: {
        ...makeDefaultCategoryUseCounts(),
        ...current.categoryUseCounts,
        [category]: (current.categoryUseCounts?.[category] ?? 0) + 1,
      },
      sessions: [session, ...current.sessions],
      posts: [startPost, ...current.posts],
    }));
    queueMateReplies(startPost.id, session.id, category, pickedReplies, 12000);
  }

  function recordResult(result: TaskResult) {
    if (!activeSession) return;
    const resultPost: TimelinePost = {
      id: makeId("post"),
      type: "user_task_result",
      authorId: "user",
      text: `${categoryLabel(activeSession.category)}は「${resultLabels[result]}」で記録しました。`,
      createdAt: new Date().toISOString(),
      taskCategory: activeSession.category,
      taskSessionId: activeSession.id,
      reaction: null,
    };
    const pickedReplies = pickComments(result, activeSession.category, 1, state.posts, state.mateAffinity);
    setState((current) => ({
      ...current,
      activeSessionId: undefined,
      sessions: current.sessions.map((session) =>
        session.id === activeSession.id
          ? { ...session, endedAt: new Date().toISOString(), result }
          : session,
      ),
      posts: [resultPost, ...current.posts],
    }));
    queueMateReplies(resultPost.id, activeSession.id, activeSession.category, pickedReplies, 8000);
  }

  function toggleReaction(postId: string) {
    setState((current) => ({
      ...current,
      mateAffinity: (() => {
        const target = current.posts.find((post) => post.id === postId);
        if (!target || !isMateId(target.authorId)) return current.mateAffinity;
        return bumpAffinity(current.mateAffinity, [target.authorId], target.reaction ? -1 : 1);
      })(),
      posts: current.posts.map((post) => {
        if (post.id !== postId) return post;
        return { ...post, reaction: post.reaction ? null : "like" };
      }),
    }));
  }

  function addMonologue() {
    const usedTexts = new Set(state.posts.map((post) => post.text));
    const monologues = comments.filter(
      (comment) => comment.postType === "mate_monologue" && !usedTexts.has(comment.text),
    );
    const comment = monologues[Math.floor(Math.random() * monologues.length)];
    if (!comment) return;
    const post: TimelinePost = {
      id: makeId("post"),
      type: "mate_monologue",
      authorId: comment.mateId,
      text: comment.text,
      createdAt: new Date().toISOString(),
      taskCategory: comment.category,
      reaction: null,
    };
    setState((current) => ({ ...current, posts: [post, ...current.posts] }));
  }

  function fillWeeklyQuests() {
    setState((current) => {
      const openSlots = Math.max(0, WEEKLY_QUEST_TARGET - current.weeklyQuests.length);
      const usedTitles = new Set(current.weeklyQuests.map((quest) => quest.title));
      const pool = [
        ...current.customQuests.filter((quest) => quest.enabled && !usedTitles.has(quest.title)),
        ...mateQuestTemplates.filter((quest) => quest.enabled && !usedTitles.has(quest.title)),
      ].sort(() => Math.random() - 0.5);
      return {
        ...current,
        questWeekStartedAt: current.questWeekStartedAt || new Date().toISOString(),
        weeklyQuests: [
          ...current.weeklyQuests,
          ...pool.slice(0, openSlots).map(makeWeeklyQuest),
        ].slice(0, WEEKLY_QUEST_TARGET),
      };
    });
  }

  function saveCustomQuest() {
    const title = questDraft.title.trim();
    if (!title) return;
    const template: QuestTemplate = {
      id: questDraft.id ?? makeId("custom-quest"),
      title,
      minutes: Math.max(1, Math.min(15, Number(questDraft.minutes) || 3)),
      category: questDraft.category,
      source: "custom",
      enabled: true,
    };
    setState((current) => ({
      ...current,
      customQuests: questDraft.id
        ? current.customQuests.map((quest) => (quest.id === questDraft.id ? template : quest))
        : [template, ...current.customQuests],
      weeklyQuests:
        questDraft.id || current.weeklyQuests.length >= WEEKLY_QUEST_TARGET
          ? current.weeklyQuests
          : [...current.weeklyQuests, makeWeeklyQuest(template)],
    }));
    setQuestDraft(makeQuestDraft());
  }

  function editCustomQuest(quest: QuestTemplate) {
    setQuestDraft({
      id: quest.id,
      title: quest.title,
      minutes: quest.minutes,
      category: quest.category,
    });
  }

  function addCustomQuestToWeek(quest: QuestTemplate) {
    setState((current) => ({
      ...current,
      weeklyQuests: current.weeklyQuests.length >= WEEKLY_QUEST_TARGET
        ? current.weeklyQuests
        : [...current.weeklyQuests, makeWeeklyQuest(quest)],
    }));
  }

  function startWeeklyQuestCustomization(quest: WeeklyQuest) {
    setCustomizingQuestId(quest.id);
    setQuestDraft({
      title: quest.title,
      minutes: quest.minutes,
      category: quest.category,
    });
  }

  function cancelWeeklyQuestCustomization() {
    setCustomizingQuestId(null);
    setQuestDraft(makeQuestDraft());
  }

  function saveWeeklyQuestCustomization() {
    const title = questDraft.title.trim();
    if (!customizingQuestId || !title) return;
    const template: QuestTemplate = {
      id: makeId("custom-quest"),
      title,
      minutes: Math.max(1, Math.min(15, Number(questDraft.minutes) || 3)),
      category: questDraft.category,
      source: "custom",
      enabled: true,
    };
    setState((current) => ({
      ...current,
      customQuests: [template, ...current.customQuests],
      weeklyQuests: current.weeklyQuests.map((quest) =>
        quest.id === customizingQuestId ? makeWeeklyQuest(template) : quest,
      ),
    }));
    setCustomizingQuestId(null);
    setQuestDraft(makeQuestDraft());
  }

  function completeQuest(questId: string) {
    const quest = state.weeklyQuests.find((item) => item.id === questId);
    if (!quest || quest.completedAt) return;
    const reaction = pickQuestReaction(quest);
    const reactionPost: TimelinePost = {
      id: makeId("post"),
      type: "mate_monologue",
      authorId: reaction.mateId,
      text: reaction.text,
      createdAt: new Date().toISOString(),
      taskCategory: quest.category,
      reaction: null,
    };

    setState((current) => {
      const previousCount = current.questCompletionCount ?? 0;
      const nextCount = previousCount + 1;
      const ticketInventory = { ...current.ticketInventory };
      const ticketAwardedCounts = { ...current.ticketAwardedCounts };
      const awardedNames: string[] = [];

      for (const ticket of current.ticketDefinitions.filter((item) => item.enabled)) {
        const required = Math.max(1, ticket.requiredCompletions);
        const alreadyAwarded = ticketAwardedCounts[ticket.id] ?? 0;
        const earnedTotal = ticket.repeatable
          ? Math.floor(nextCount / required)
          : nextCount >= required
            ? 1
            : 0;
        const newlyAwarded = Math.max(0, earnedTotal - alreadyAwarded);
        if (newlyAwarded > 0) {
          ticketInventory[ticket.id] = (ticketInventory[ticket.id] ?? 0) + newlyAwarded;
          ticketAwardedCounts[ticket.id] = earnedTotal;
          awardedNames.push(ticket.name);
        }
      }

      if (awardedNames.length > 0) {
        setLatestReward(`${awardedNames.join("、")}を獲得しました。`);
      } else {
        setLatestReward(null);
      }

      return {
        ...current,
        questCompletionCount: nextCount,
        ticketInventory,
        ticketAwardedCounts,
        questCompletionLog: [
          {
            id: makeId("quest-log"),
            questId: quest.id,
            title: quest.title,
            category: quest.category,
            source: quest.source,
            completedAt: new Date().toISOString(),
          },
          ...(current.questCompletionLog ?? []),
        ],
        mateAffinity: bumpAffinity(current.mateAffinity, [reaction.mateId], 1),
        weeklyQuests: current.weeklyQuests.map((item) =>
          item.id === questId ? { ...item, completedAt: new Date().toISOString() } : item,
        ),
        posts: [reactionPost, ...current.posts],
      };
    });
  }

  function replaceWeeklyQuest(questId: string) {
    setState((current) => {
      const target = current.weeklyQuests.find((quest) => quest.id === questId);
      if (!target || target.completedAt) return current;
      const usedTitles = new Set(current.weeklyQuests.map((quest) => quest.title));
      const pool = [
        ...current.customQuests.filter((quest) => quest.enabled && !usedTitles.has(quest.title)),
        ...mateQuestTemplates.filter((quest) => quest.enabled && !usedTitles.has(quest.title)),
      ].sort(() => Math.random() - 0.5);
      const replacement = pool[0];
      if (!replacement) return current;
      return {
        ...current,
        weeklyQuests: current.weeklyQuests.map((quest) =>
          quest.id === questId ? makeWeeklyQuest(replacement) : quest,
        ),
      };
    });
  }

  function resetWeeklyQuests() {
    setState((current) => ({
      ...current,
      questWeekStartedAt: new Date().toISOString(),
      weeklyQuests: [],
    }));
  }

  function saveTicketDefinition() {
    const name = ticketDraft.name.trim();
    if (!name) return;
    const ticket: TicketDefinition = {
      id: ticketDraft.id ?? makeId("ticket"),
      name,
      requiredCompletions: Math.max(1, Math.min(99, Number(ticketDraft.requiredCompletions) || 3)),
      description: ticketDraft.description.trim() || "自分に渡すごほうび。",
      category: ticketDraft.category,
      costMemo: ticketDraft.costMemo.trim() || undefined,
      repeatable: ticketDraft.repeatable,
      enabled: true,
    };
    setState((current) => ({
      ...current,
      ticketDefinitions: ticketDraft.id
        ? current.ticketDefinitions.map((item) => (item.id === ticketDraft.id ? ticket : item))
        : [ticket, ...current.ticketDefinitions],
    }));
    setTicketDraft(makeTicketDraft());
  }

  function editTicketDefinition(ticket: TicketDefinition) {
    setTicketDraft({
      id: ticket.id,
      name: ticket.name,
      requiredCompletions: ticket.requiredCompletions,
      description: ticket.description,
      category: ticket.category,
      costMemo: ticket.costMemo ?? "",
      repeatable: ticket.repeatable,
    });
  }

  function useTicket(ticketId: string) {
    const ticket = state.ticketDefinitions.find((item) => item.id === ticketId);
    if (!ticket || (state.ticketInventory[ticketId] ?? 0) <= 0) return;
    const mateId: MateId = "kamekichi";
    const post: TimelinePost = {
      id: makeId("post"),
      type: "mate_monologue",
      authorId: mateId,
      text: `${ticket.name}を使いました。ちゃんと整えたあとのごほうびです。`,
      createdAt: new Date().toISOString(),
      taskCategory: ticket.category,
      reaction: null,
    };
    setLatestReward(`${ticket.name}を使いました。`);
    setState((current) => ({
      ...current,
      ticketInventory: {
        ...current.ticketInventory,
        [ticketId]: Math.max(0, (current.ticketInventory[ticketId] ?? 0) - 1),
      },
      posts: [post, ...current.posts],
    }));
  }

  const parentPosts = state.posts
    .filter((post) => !post.parentPostId)
    .sort((a, b) => getPostActivityTime(b, state.posts) - getPostActivityTime(a, state.posts));
  const sortedCategories = [...categories].sort((a, b) => {
    const countDiff = (state.categoryUseCounts?.[b.id] ?? 0) - (state.categoryUseCounts?.[a.id] ?? 0);
    if (countDiff !== 0) return countDiff;
    return categories.findIndex((item) => item.id === a.id) - categories.findIndex((item) => item.id === b.id);
  });
  const hasUnusedMonologue = comments.some(
    (comment) => comment.postType === "mate_monologue" && !state.posts.some((post) => post.text === comment.text),
  );

  return (
    <main className="app-shell">
      <aside className="app-rail" aria-label="アプリナビゲーション">
        <div className="brand">
          <BrandLogo />
          <h1>もくもくメイト</h1>
        </div>
        <nav className="app-tabs" aria-label="メイン画面">
          {[
            { view: "home", label: "ホーム", icon: HomeIcon },
            { view: "quests", label: "クエスト", icon: QuestIcon },
            { view: "tickets", label: "チケット", icon: TicketIcon },
            { view: "achievements", label: "達成", icon: AchievementIcon },
          ].map(({ view, label, icon: Icon }) => (
            <button
              aria-current={activeView === view ? "page" : undefined}
              className={activeView === view ? "selected" : ""}
              key={view}
              onClick={() => setActiveView(view as ActiveView)}
              type="button"
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <div className="app-content">
        {activeView === "home" && (
          <section className="workspace">
            <section className="timeline-section" aria-label="プライベートタイムライン">
              <div className="section-heading">
                <div>
                  <h2>
                    <span className="heading-mark" aria-hidden="true" />
                    みんなのもくもくタイムライン
                  </h2>
                  <p>メイトの投稿と作業記録を表示します。</p>
                </div>
                {hasUnusedMonologue && (
                  <button className="ghost-button" onClick={addMonologue} type="button">
                    投稿を表示
                  </button>
                )}
              </div>
              <div className="timeline">
                {parentPosts.map((post) => (
                  <TimelineItem
                    key={post.id}
                    post={post}
                    replies={state.posts.filter((reply) => reply.parentPostId === post.id)}
                    onMateSelect={setSelectedMateId}
                    onReact={toggleReaction}
                    now={now}
                  />
                ))}
              </div>
            </section>

            <aside className="side-panel" aria-label="作業開始と記録">
              <StartPanel
                active={Boolean(activeSession)}
                category={category}
                categories={sortedCategories}
                duration={duration}
                remainingSeconds={remainingSeconds}
                progressPercent={progressPercent}
                session={activeSession}
                onCategoryChange={setCategory}
                onDurationChange={setDuration}
                onMateSelect={setSelectedMateId}
                onRecord={recordResult}
                onStart={startTask}
              />
            </aside>
          </section>
        )}

        {activeView === "quests" && (
          <QuestPage
            categories={sortedCategories}
            customQuests={state.customQuests}
            latestReward={latestReward}
            questCompletionCount={state.questCompletionCount}
            questDraft={questDraft}
            ticketDefinitions={state.ticketDefinitions}
            weeklyQuests={state.weeklyQuests}
            onAddCustomQuestToWeek={addCustomQuestToWeek}
            onCancelWeeklyQuestCustomization={cancelWeeklyQuestCustomization}
            onCompleteQuest={completeQuest}
            onEditQuest={editCustomQuest}
            onFillWeeklyQuests={fillWeeklyQuests}
            onMateSelect={setSelectedMateId}
            onQuestDraftChange={setQuestDraft}
            onReplaceWeeklyQuest={replaceWeeklyQuest}
            onResetWeeklyQuests={resetWeeklyQuests}
            onSaveWeeklyQuestCustomization={saveWeeklyQuestCustomization}
            onSaveQuest={saveCustomQuest}
            onStartWeeklyQuestCustomization={startWeeklyQuestCustomization}
            customizingQuestId={customizingQuestId}
            questWeekStartedAt={state.questWeekStartedAt}
          />
        )}

        {activeView === "tickets" && (
          <TicketPage
            categories={sortedCategories}
            latestReward={latestReward}
            questCompletionCount={state.questCompletionCount}
            ticketDefinitions={state.ticketDefinitions}
            ticketDraft={ticketDraft}
            ticketInventory={state.ticketInventory}
            weeklyQuests={state.weeklyQuests}
            onEditTicket={editTicketDefinition}
            onSaveTicket={saveTicketDefinition}
            onTicketDraftChange={setTicketDraft}
            onUseTicket={useTicket}
          />
        )}

        {activeView === "achievements" && (
          <AchievementPage
            mateAffinity={state.mateAffinity}
            questCompletionLog={state.questCompletionLog}
            sessions={state.sessions}
            weeklyQuests={state.weeklyQuests}
            onMateSelect={setSelectedMateId}
          />
        )}
      </div>
      {selectedMateId && (
        <MateProfileDialog mateId={selectedMateId} mateAffinity={state.mateAffinity} onClose={() => setSelectedMateId(null)} />
      )}
    </main>
  );
}

function QuestPage(props: {
  categories: typeof categories;
  customQuests: QuestTemplate[];
  latestReward: string | null;
  questCompletionCount: number;
  questDraft: QuestDraft;
  ticketDefinitions: TicketDefinition[];
  weeklyQuests: WeeklyQuest[];
  onAddCustomQuestToWeek: (quest: QuestTemplate) => void;
  onCancelWeeklyQuestCustomization: () => void;
  onCompleteQuest: (questId: string) => void;
  onEditQuest: (quest: QuestTemplate) => void;
  onFillWeeklyQuests: () => void;
  onMateSelect: (mateId: MateId) => void;
  onQuestDraftChange: (draft: QuestDraft) => void;
  onReplaceWeeklyQuest: (questId: string) => void;
  onResetWeeklyQuests: () => void;
  onSaveWeeklyQuestCustomization: () => void;
  onSaveQuest: () => void;
  onStartWeeklyQuestCustomization: (quest: WeeklyQuest) => void;
  customizingQuestId: string | null;
  questWeekStartedAt: string;
}) {
  const completedThisWeek = props.weeklyQuests.filter((quest) => quest.completedAt).length;
  const remainingSlots = Math.max(0, WEEKLY_QUEST_TARGET - props.weeklyQuests.length);
  const achievementPercent = Math.round((completedThisWeek / WEEKLY_QUEST_TARGET) * 100);
  const weekStart = new Date(props.questWeekStartedAt);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  const daysLeft = Math.max(0, Math.ceil((weekEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const isSetupMode = props.weeklyQuests.length < WEEKLY_QUEST_TARGET;
  const nextTicket = props.ticketDefinitions
    .filter((ticket) => ticket.enabled)
    .sort((a, b) => nextTicketProgress(a, props.questCompletionCount).remaining - nextTicketProgress(b, props.questCompletionCount).remaining)[0];
  const progress = nextTicket ? nextTicketProgress(nextTicket, props.questCompletionCount) : null;

  return (
    <section className="quest-page page-view" aria-label="クエスト">
      <div className="page-hero">
        <AvatarImage className="page-mate" imageSrc={mates.kamekichi.imageSrc} name={mates.kamekichi.name} />
        <div>
          <h2>今週のクエスト</h2>
          <p>1週間で達成するクエストを20個設定します。</p>
        </div>
        <div className="quest-summary">
          <strong>{props.weeklyQuests.length}</strong>
          <span>設定済み</span>
        </div>
        <div className="quest-summary">
          <strong>{achievementPercent}%</strong>
          <span>達成率</span>
        </div>
      </div>

      {props.latestReward && (
        <div className="reward-note">
          <strong>{props.latestReward}</strong>
          <span>ごほうびは、受け取って大丈夫。</span>
        </div>
      )}

      {isSetupMode && (
        <section className="setup-card">
          <div>
            <h3>まず20個設定しましょう</h3>
            <p>自分で追加しても、メイトにまとめて作ってもらってもOKです。嫌なクエストはあとから変更できます。</p>
          </div>
          <div className="setup-actions">
            <button className="soft-button strong" onClick={props.onFillWeeklyQuests} type="button">
              メイトに作ってもらう
            </button>
            <span>あと{remainingSlots}個</span>
          </div>
        </section>
      )}

      <div className="quest-layout">
        <div className="quest-main-column">
          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>20個のクエスト</h3>
                <p>今週中に達成したいクエストです。嫌なものは変更できます。</p>
              </div>
              {nextTicket && progress && (
                <div className="ticket-progress compact">
                  <span>{nextTicket.name}まで</span>
                  <div><i style={{ width: `${(progress.progress / progress.needed) * 100}%` }} /></div>
                  <small>{progress.progress} / {progress.needed}</small>
                </div>
              )}
            </div>

            <div className="weekly-board">
              {props.weeklyQuests.length === 0 ? (
                <p className="empty-note">まだクエストがありません。右側で自分用を作るか、メイトに20個作ってもらえます。</p>
              ) : (
                props.weeklyQuests.map((quest, index) => (
                  <div className={quest.completedAt ? "quest-row weekly completed" : "quest-row weekly"} key={quest.id}>
                    <button
                      className="quest-check"
                      disabled={Boolean(quest.completedAt)}
                      onClick={() => props.onCompleteQuest(quest.id)}
                      type="button"
                      aria-label={`${quest.title}を達成`}
                    >
                      <CheckIcon />
                    </button>
                    <div>
                      <small>No.{index + 1}</small>
                      <strong>{quest.title}</strong>
                      <span>{quest.minutes}分 ・ {quest.source === "custom" ? "自分設定" : "メイト依頼"} ・ {categoryLabel(quest.category)}</span>
                    </div>
                    {quest.suggestedBy && (
                      <AvatarImage
                        className="quest-owner"
                        imageSrc={mates[quest.suggestedBy].imageSrc}
                        name={mates[quest.suggestedBy].name}
                        onClick={() => props.onMateSelect(quest.suggestedBy!)}
                      />
                    )}
                    <button
                      className="swap-button"
                      disabled={Boolean(quest.completedAt)}
                      onClick={() => props.onReplaceWeeklyQuest(quest.id)}
                      type="button"
                    >
                      変更
                    </button>
                    <button
                      className="swap-button"
                      disabled={Boolean(quest.completedAt)}
                      onClick={() => props.onStartWeeklyQuestCustomization(quest)}
                      type="button"
                    >
                      自分で設定
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <aside className="quest-side-column">
          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>今週の進捗</h3>
                <p>残り日数と達成率を確認できます。</p>
              </div>
            </div>
            <div className="weekly-progress-panel">
              <div>
                <strong>{daysLeft}</strong>
                <span>日</span>
                <small>残り</small>
              </div>
              <div>
                <strong>{completedThisWeek}</strong>
                <span>/ {WEEKLY_QUEST_TARGET}</span>
                <small>達成</small>
              </div>
            </div>
            <div className="ticket-progress large">
              <span>{achievementPercent}%</span>
              <div><i style={{ width: `${achievementPercent}%` }} /></div>
            </div>
          </section>

          {props.customizingQuestId && (
            <section className="content-card">
              <div className="card-heading">
                <div>
                  <h3>クエストを自分で設定</h3>
                  <p>選んだ枠の内容を置き換えます。</p>
                </div>
              </div>
              <div className="inline-form roomy">
                <input
                  onChange={(event) => props.onQuestDraftChange({ ...props.questDraft, title: event.target.value })}
                  placeholder="例: 猫の水皿を洗う"
                  value={props.questDraft.title}
                />
                <div className="form-grid">
                  <select
                    onChange={(event) => props.onQuestDraftChange({ ...props.questDraft, category: event.target.value as TaskCategory })}
                    value={props.questDraft.category}
                  >
                    {props.categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                  <input
                    min={1}
                    max={15}
                    onChange={(event) => props.onQuestDraftChange({ ...props.questDraft, minutes: Number(event.target.value) })}
                    type="number"
                    value={props.questDraft.minutes}
                  />
                </div>
                <div className="form-actions">
                  <button className="soft-button strong" onClick={props.onSaveWeeklyQuestCustomization} type="button">保存</button>
                  <button className="soft-button" onClick={props.onCancelWeeklyQuestCustomization} type="button">キャンセル</button>
                </div>
              </div>
            </section>
          )}

          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>保存済み</h3>
                <p>保存したクエストを今週の20個に追加できます。</p>
              </div>
            </div>
            {props.customQuests.length > 0 ? (
              <div className="saved-list">
                {props.customQuests.map((quest) => (
                  <div className="saved-row" key={quest.id}>
                    <div>
                      <strong>{quest.title}</strong>
                      <span>{quest.minutes}分 ・ {categoryLabel(quest.category)}</span>
                    </div>
                    <div>
                      <button disabled={remainingSlots <= 0} onClick={() => props.onAddCustomQuestToWeek(quest)} type="button">今週</button>
                      <button onClick={() => props.onEditQuest(quest)} type="button">編集</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-note">保存済みクエストはまだありません。</p>
            )}
          </section>

          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>週の設定</h3>
                <p>クエストを組み直したいときに使います。</p>
              </div>
            </div>
            <button className="soft-button" onClick={props.onResetWeeklyQuests} type="button">20個を設定し直す</button>
          </section>
        </aside>
      </div>
    </section>
  );
}

function TicketPage(props: {
  categories: typeof categories;
  latestReward: string | null;
  questCompletionCount: number;
  ticketDefinitions: TicketDefinition[];
  ticketDraft: TicketDraft;
  ticketInventory: AppState["ticketInventory"];
  weeklyQuests: WeeklyQuest[];
  onEditTicket: (ticket: TicketDefinition) => void;
  onSaveTicket: () => void;
  onTicketDraftChange: (draft: TicketDraft) => void;
  onUseTicket: (ticketId: string) => void;
}) {
  const completedThisWeek = props.weeklyQuests.filter((quest) => quest.completedAt).length;
  const enabledTickets = props.ticketDefinitions.filter((ticket) => ticket.enabled);
  const nextTicket = enabledTickets
    .sort((a, b) => nextTicketProgress(a, props.questCompletionCount).remaining - nextTicketProgress(b, props.questCompletionCount).remaining)[0];
  const progress = nextTicket ? nextTicketProgress(nextTicket, props.questCompletionCount) : null;

  return (
    <section className="ticket-page page-view" aria-label="チケット">
      <div className="page-hero">
        <AvatarImage className="page-mate" imageSrc={mates.kamekichi.imageSrc} name={mates.kamekichi.name} />
        <div>
          <h2>チケット</h2>
          <p>獲得したチケットの確認・使用・作成ができます。</p>
        </div>
        <div className="quest-summary">
          <strong>{props.questCompletionCount}</strong>
          <span>累計達成数</span>
        </div>
        <div className="quest-summary">
          <strong>{completedThisWeek}</strong>
          <span>今週の達成</span>
        </div>
      </div>

      {props.latestReward && (
        <div className="reward-note">
          <strong>{props.latestReward}</strong>
          <span>ごほうびは、受け取って大丈夫。</span>
        </div>
      )}

      <div className="ticket-layout">
        <div className="ticket-main-column">
          <section className="content-card progress-card">
            <div className="card-heading">
              <div>
                <h3>次のチケット</h3>
                <p>次に獲得できるチケットの進捗を表示します。</p>
              </div>
            </div>
            {nextTicket && progress ? (
              <div className="ticket-progress large">
                <span>{nextTicket.name}まで</span>
                <div><i style={{ width: `${(progress.progress / progress.needed) * 100}%` }} /></div>
                <small>{progress.progress} / {progress.needed} ・ あと{progress.remaining}クエスト</small>
              </div>
            ) : (
              <p className="empty-note">チケットを作ると、ここに次の進捗が出ます。</p>
            )}
          </section>

          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>持っているチケット</h3>
                <p>所持しているチケットを確認して使用できます。</p>
              </div>
            </div>
            <div className="ticket-list roomy">
              {enabledTickets.map((ticket) => {
                const count = props.ticketInventory[ticket.id] ?? 0;
                const ticketProgress = nextTicketProgress(ticket, props.questCompletionCount);
                return (
                  <div className={count > 0 ? "ticket-row owned" : "ticket-row"} key={ticket.id}>
                    <div>
                      <strong>{ticket.name} ×{count}</strong>
                      <span>{ticket.description}</span>
                      {ticket.costMemo && <small>{ticket.costMemo}</small>}
                      {count === 0 && <small>あと{ticketProgress.remaining}クエストで獲得</small>}
                    </div>
                    <div className="ticket-row-actions">
                      <button disabled={count <= 0} onClick={() => props.onUseTicket(ticket.id)} type="button">使う</button>
                      <button onClick={() => props.onEditTicket(ticket)} type="button">編集</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="ticket-side-column">
          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>チケットを作る</h3>
                <p>達成数に応じて獲得できるチケットを作成できます。</p>
              </div>
            </div>
            <div className="inline-form roomy">
              <input
                onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, name: event.target.value })}
                placeholder="例: アイスチケット"
                value={props.ticketDraft.name}
              />
              <input
                onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, description: event.target.value })}
                placeholder="例: コンビニアイス1個OK"
                value={props.ticketDraft.description}
              />
              <div className="form-grid">
                <input
                  min={1}
                  max={99}
                  onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, requiredCompletions: Number(event.target.value) })}
                  type="number"
                  value={props.ticketDraft.requiredCompletions}
                />
                <select
                  onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, category: event.target.value as TaskCategory })}
                  value={props.ticketDraft.category}
                >
                  {props.categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.label}</option>
                  ))}
                </select>
              </div>
              <input
                onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, costMemo: event.target.value })}
                placeholder="金額メモ 任意"
                value={props.ticketDraft.costMemo}
              />
              <label className="check-label">
                <input
                  checked={props.ticketDraft.repeatable}
                  onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, repeatable: event.target.checked })}
                  type="checkbox"
                />
                繰り返し獲得する
              </label>
              <button className="soft-button strong" onClick={props.onSaveTicket} type="button">
                {props.ticketDraft.id ? "チケットを更新" : "チケットを追加"}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}

function AchievementPage(props: {
  mateAffinity: AppState["mateAffinity"];
  questCompletionLog: QuestCompletionLog[];
  sessions: TaskSession[];
  weeklyQuests: WeeklyQuest[];
  onMateSelect: (mateId: MateId) => void;
}) {
  type DayActivity = {
    count: number;
    categories: Record<TaskCategory, number>;
    entries: { title: string; category: TaskCategory; date: Date; kind: "quest" | "session" }[];
  };
  const activityByDate = new Map<string, DayActivity>();
  const addActivity = (
    dateLike: string | undefined,
    category: TaskCategory,
    title: string,
    kind: "quest" | "session",
  ) => {
    if (!dateLike) return;
    const key = toDateKey(dateLike);
    const current = activityByDate.get(key) ?? {
      count: 0,
      categories: makeDefaultCategoryUseCounts(),
      entries: [],
    };
    current.count += 1;
    current.categories[category] = (current.categories[category] ?? 0) + 1;
    current.entries.push({ title, category, date: new Date(dateLike), kind });
    activityByDate.set(key, current);
  };

  for (const log of props.questCompletionLog) addActivity(log.completedAt, log.category, log.title, "quest");
  for (const quest of props.weeklyQuests) {
    const alreadyLogged = props.questCompletionLog.some((log) => log.questId === quest.id);
    if (!alreadyLogged) addActivity(quest.completedAt, quest.category, quest.title, "quest");
  }
  for (const session of props.sessions) {
    if (session.endedAt && session.result) {
      addActivity(session.endedAt, session.category, `${categoryLabel(session.category)} ${resultLabels[session.result]}`, "session");
    }
  }

  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const calendarStart = new Date(monthStart);
  calendarStart.setDate(monthStart.getDate() - monthStart.getDay());
  const calendarDays = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);
    const key = toDateKey(date);
    const activity = activityByDate.get(key) ?? {
      count: 0,
      categories: makeDefaultCategoryUseCounts(),
      entries: [],
    };
    return {
      date,
      key,
      inMonth: date.getMonth() === today.getMonth(),
      isToday: key === toDateKey(today),
      ...activity,
    };
  });
  const monthDays = calendarDays.filter((day) => day.inMonth);
  const totalActivity = monthDays.reduce((sum, day) => sum + day.count, 0);
  const activeDays = monthDays.filter((day) => day.count > 0).length;
  const trailingDays = Array.from({ length: 84 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (83 - index));
    const key = toDateKey(date);
    return { key, count: activityByDate.get(key)?.count ?? 0 };
  });
  const currentStreak = [...trailingDays].reverse().findIndex((day) => day.count === 0);
  const streak = currentStreak === -1 ? trailingDays.length : currentStreak;
  const categoryTotals = categories
    .map((item) => ({
      ...item,
      count: monthDays.reduce((sum, day) => sum + (day.categories[item.id] ?? 0), 0),
      mate: mates[supportMateForCategory(item.id)],
    }))
    .sort((a, b) => b.count - a.count);
  const topCategories = categoryTotals.filter((item) => item.count > 0).slice(0, 4);
  const recentEntries = [...activityByDate.values()]
    .flatMap((activity) => activity.entries)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 5);
  const levelFor = (count: number) => {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count <= 3) return 2;
    if (count <= 5) return 3;
    return 4;
  };
  const leadingCategory = (day: { categories: Record<TaskCategory, number> }) =>
    categories.reduce<TaskCategory | null>((winner, item) => {
      if (!winner) return day.categories[item.id] > 0 ? item.id : winner;
      return day.categories[item.id] > day.categories[winner] ? item.id : winner;
    }, null);

  return (
    <section className="achievement-page page-view" aria-label="達成">
      <div className="page-hero">
        <AvatarImage className="page-mate" imageSrc={mates.kamekichi.imageSrc} name={mates.kamekichi.name} />
        <div>
          <h2>達成</h2>
          <p>今月のクエスト達成と作業記録を、カレンダーで見返せます。</p>
        </div>
        <div className="quest-summary">
          <strong>{totalActivity}</strong>
          <span>今月の記録</span>
        </div>
        <div className="quest-summary">
          <strong>{activeDays}</strong>
          <span>記録した日</span>
        </div>
      </div>

      <div className="achievement-layout">
        <section className="content-card calendar-card">
          <div className="card-heading">
            <div>
              <h3>{formatMonthTitle(today)}</h3>
              <p>日付ごとに件数とカテゴリを表示します。</p>
            </div>
            <div className="streak-box">
              <strong>{streak}</strong>
              <span>連続記録日</span>
            </div>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {["日", "月", "火", "水", "木", "金", "土"].map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="achievement-calendar" aria-label="達成カレンダー">
            {calendarDays.map((day) => {
              const dominantCategory = leadingCategory(day);
              const dominantMate = dominantCategory ? mates[supportMateForCategory(dominantCategory)] : null;
              return (
                <div
                  className={[
                    "calendar-day",
                    `level-${levelFor(day.count)}`,
                    day.inMonth ? "" : "muted",
                    day.isToday ? "today" : "",
                  ].filter(Boolean).join(" ")}
                  key={day.key}
                  title={`${formatShortDate(day.date)}: ${day.count}件`}
                >
                  <div className="calendar-day-head">
                    <span>{day.date.getDate()}</span>
                    {day.count > 0 && <strong>{day.count}</strong>}
                  </div>
                  {dominantMate && (
                    <span
                      className="calendar-category-dot"
                      style={{ background: dominantMate.accent }}
                      title={dominantCategory ? categoryLabel(dominantCategory) : undefined}
                    />
                  )}
                  <div className="calendar-day-bars">
                    {categories.map((item) => {
                      const count = day.categories[item.id] ?? 0;
                      if (count === 0) return null;
                      return (
                        <i
                          key={item.id}
                          style={{
                            background: mates[supportMateForCategory(item.id)].accent,
                            width: `${Math.min(100, 24 + count * 22)}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="calendar-legend">
            {categories.map((item) => {
              const mate = mates[supportMateForCategory(item.id)];
              return (
                <span key={item.id}>
                  <i style={{ background: mate.accent }} />
                  {item.conceptLabel}
                </span>
              );
            })}
          </div>
        </section>

        <aside className="achievement-side">
          <section className="content-card achievement-summary-card">
            <div className="card-heading compact-heading">
              <div>
                <h3>今月の内訳</h3>
                <p>よく進んだカテゴリ</p>
              </div>
            </div>
            <div className="category-score-list">
              {(topCategories.length > 0 ? topCategories : categoryTotals.slice(0, 4)).map((item) => (
                <div className="category-score-row" key={item.id}>
                  <AvatarImage className="quest-owner" imageSrc={item.mate.imageSrc} name={item.mate.name} />
                  <div>
                    <strong>{item.conceptLabel}</strong>
                    <span>{item.mate.name}</span>
                  </div>
                  <em>{item.count}</em>
                </div>
              ))}
            </div>
          </section>
          <section className="content-card achievement-summary-card">
            <div className="card-heading compact-heading">
              <div>
                <h3>最近の達成</h3>
                <p>直近の記録</p>
              </div>
            </div>
            <div className="recent-achievement-list">
              {recentEntries.length > 0 ? recentEntries.map((entry, index) => (
                <div className="recent-achievement-row" key={`${entry.title}-${entry.date.toISOString()}-${index}`}>
                  <span>{formatShortDate(entry.date)}</span>
                  <strong>{entry.title}</strong>
                  <small>{categoryLabel(entry.category)}</small>
                </div>
              )) : (
                <p className="empty-note">まだ記録がありません。今日の1個目からカレンダーに残ります。</p>
              )}
            </div>
          </section>
          <AffinityPanel mateAffinity={props.mateAffinity} onMateSelect={props.onMateSelect} />
        </aside>
      </div>
    </section>
  );
}

function MateProfileDialog(props: {
  mateId: MateId;
  mateAffinity: AppState["mateAffinity"];
  onClose: () => void;
}) {
  const mate = mates[props.mateId];
  const value = props.mateAffinity[props.mateId] ?? 0;
  const profileId = mate.profileId ?? `@${mate.id}`;
  const bio = mate.bio ?? mate.note;
  const pinnedPost = mate.pinnedPost ?? mate.note;
  const tags = mate.profileTags ?? [];
  return (
    <div className="profile-backdrop" role="presentation" onClick={props.onClose}>
      <section className="mate-profile" aria-label={`${mate.name}のプロフィール`} onClick={(event) => event.stopPropagation()}>
        <button className="profile-close" onClick={props.onClose} type="button">閉じる</button>
        <div
          className="profile-banner"
          style={{
            background: `linear-gradient(135deg, ${mate.accent}, color-mix(in srgb, ${mate.accent} 30%, white))`,
          }}
        >
          <span>{mate.role}</span>
        </div>
        <div className="profile-head">
          <AvatarImage className="profile-avatar" imageSrc={mate.imageSrc} name={mate.name} />
          <div className="profile-stats" aria-label="プロフィール統計">
            <div>
              <strong>{value}</strong>
              <span>なかよしPt</span>
            </div>
            <div>
              <strong>{tags.length}</strong>
              <span>担当タグ</span>
            </div>
          </div>
        </div>
        <div className="profile-body">
          <div className="profile-name-row">
            <div>
              <h2>{mate.name}</h2>
              <p>{profileId}</p>
            </div>
            <span className="profile-role">{mate.role.replace("担当", "")}</span>
          </div>
          <p className="profile-bio">{bio}</p>
          {tags.length > 0 && (
            <div className="profile-tags" aria-label={`${mate.name}の担当タグ`}>
              {tags.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          )}
          <div className="profile-meter">
            <div>
              <strong>{affinityLevel(value)}</strong>
              <small>メイトとの距離</small>
            </div>
            <div className="affinity-track">
              <div style={{ width: `${Math.min(100, value * 5)}%` }} />
            </div>
          </div>
          <article className="pinned-post" aria-label="固定ポスト">
            <div className="pinned-label">
              <PinIcon />
              <span>固定ポスト</span>
            </div>
            <p>{pinnedPost}</p>
          </article>
        </div>
      </section>
    </div>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden="true" className="pin-icon" viewBox="0 0 24 24">
      <path
        d="m8.2 13.2-3.1 3.1M14.6 4.8l5.6 5.6M9.5 5.9l8.6 8.6M10 5.5l-1.7 5.2-2.5 2.5 5 5 2.5-2.5 5.2-1.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function getPostActivityTime(post: TimelinePost, allPosts: TimelinePost[]) {
  const ownTime = new Date(post.createdAt).getTime();
  const latestReplyTime = allPosts
    .filter((reply) => reply.parentPostId === post.id)
    .reduce((latest, reply) => Math.max(latest, new Date(reply.createdAt).getTime()), ownTime);
  return latestReplyTime;
}

function StartPanel(props: {
  active: boolean;
  category: TaskCategory;
  categories: typeof categories;
  duration: number;
  remainingSeconds: number;
  progressPercent: number;
  session?: TaskSession;
  onCategoryChange: (category: TaskCategory) => void;
  onDurationChange: (duration: number) => void;
  onMateSelect: (mateId: MateId) => void;
  onRecord: (result: TaskResult) => void;
  onStart: () => void;
}) {
  const timerMate = mates[props.session ? supportMateForCategory(props.session.category) : supportMateForCategory(props.category)];
  const visibleTitle = props.session ? categoryLabel(props.session.category) : categoryLabel(props.category);
  const [visibleCategoryHelp, setVisibleCategoryHelp] = useState<TaskCategory | null>(null);

  return (
    <section className="start-card">
      <div className="start-intro">
        <div>
          <h2 className="start-title">
            <span className="heading-mark" aria-hidden="true" />
            {props.session ? "作業中" : "さあ、はじめよう"}
          </h2>
          <strong>{visibleTitle}</strong>
          <p>
            小さくて大丈夫。はじめることが、いちばんの一歩。
            {props.session && <span className="status-badge">進行中</span>}
          </p>
        </div>
        <AvatarImage className="intro-mate" imageSrc={mates.usamaru.imageSrc} name="うさ丸" />
      </div>

      <div className="panel-block">
        <div className="quick-start-head">
          <div>
            <span className="field-label">時間をえらぶ</span>
            <p className="field-note">{categoryLabel(props.category)}を{props.duration}分だけ始めます。</p>
          </div>
          <button className="primary-button compact" disabled={props.active} onClick={props.onStart} type="button">
            <PlayIcon />
            スタート
          </button>
        </div>
        <div className="time-grid primary-time-grid" role="group" aria-label="作業時間">
          {durations.map((minutes) => (
            <button
              className={props.duration === minutes ? "selected" : ""}
              disabled={props.active}
              key={minutes}
              onClick={() => props.onDurationChange(minutes)}
              type="button"
            >
              {minutes}分
            </button>
          ))}
        </div>
      </div>

      <div className="timer-face">
        <AvatarImage className="timer-mate" imageSrc={timerMate.imageSrc} name={timerMate.name} />
        <span className="timer-time">
          {props.session ? formatClock(props.remainingSeconds) : formatClock(props.duration * 60)}
        </span>
        <div className="timer-note">
          <div className="timer-progress" aria-label="作業の進み具合" role="progressbar">
            <div style={{ width: `${props.session ? props.progressPercent : 0}%` }} />
          </div>
          <p>{props.session ? "メイトが見守り中。" : "よーい、もくもく。"}</p>
        </div>
      </div>

      <div className="result-panel">
        <h2>
          <span className="heading-mark" aria-hidden="true" />
          おわったら記録
        </h2>
        <div className="result-grid" aria-label="結果を記録">
          {(Object.keys(resultLabels) as TaskResult[]).map((result) => (
            <ResultButton
              disabled={!props.session}
              key={result}
              result={result}
              onRecord={props.onRecord}
            />
          ))}
        </div>
        <p>{props.session ? "気持ちに近いものを押せば、今日のもくもくは保存されます。" : "スタートすると、ここからすぐ記録できます。"}</p>
      </div>

      <div className="panel-block secondary-block">
        <span className="field-label">カテゴリ</span>
        <p className="field-note">よく使うカテゴリほど前に出ます。</p>
        <div className="category-grid" role="group" aria-label="作業カテゴリ">
          {props.categories.map((item) => {
            const mate = mates[supportMateForCategory(item.id)];
            const tooltipId = `category-help-${item.id}`;
            const visibleSubcategories = item.subcategories.slice(0, 3);
            const isHelpVisible = visibleCategoryHelp === item.id;
            const tileClassName = [
              "category-tile",
              props.category === item.id ? "selected" : "",
              isHelpVisible ? "help-visible" : "",
            ].filter(Boolean).join(" ");
            return (
              <div
                className={tileClassName}
                key={item.id}
                onBlur={() => setVisibleCategoryHelp((current) => current === item.id ? null : current)}
                onFocus={() => setVisibleCategoryHelp(item.id)}
                onMouseEnter={() => setVisibleCategoryHelp(item.id)}
                onMouseLeave={() => setVisibleCategoryHelp((current) => current === item.id ? null : current)}
              >
                <div className="category-tile-main">
                  <AvatarImage
                    className="category-mate"
                    imageSrc={mate.imageSrc}
                    name={mate.name}
                    onClick={() => props.onMateSelect(mate.id)}
                  />
                  <button
                    aria-describedby={tooltipId}
                  className="category-select"
                  disabled={props.active}
                  onClick={() => {
                    setVisibleCategoryHelp(item.id);
                    props.onCategoryChange(item.id);
                  }}
                  type="button"
                >
                    <strong>{item.conceptLabel}</strong>
                    <span>{mate.name}</span>
                  </button>
                </div>
                <p className="category-summary">{item.summary}</p>
                <p className="category-subcategories">
                  {visibleSubcategories.join(" / ")}
                  {item.subcategories.length > visibleSubcategories.length ? " など" : ""}
                </p>
                <div
                  className={isHelpVisible ? "category-tooltip visible" : "category-tooltip"}
                  id={tooltipId}
                  role="tooltip"
                  style={isHelpVisible ? { opacity: 1 } : undefined}
                >
                  <strong>{item.conceptLabel}</strong>
                  <p>{item.hoverDescription}</p>
                  <span>{item.subcategories.join(" / ")}</span>
                  <small>例：{item.questExamples.join("、")}</small>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="button-icon" viewBox="0 0 24 24">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className="check-icon" viewBox="0 0 24 24">
      <path
        d="M5 12.5 10 17l9-10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d="M4 11.2 12 4l8 7.2V20h-5.2v-5.5H9.2V20H4Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function QuestIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d="M7 4h10l2 3v13H5V7Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="m8.3 12 2.2 2.2 5.3-5.4M8 17h8" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d="M4 8.2A2.2 2.2 0 0 1 6.2 6h11.6A2.2 2.2 0 0 1 20 8.2v2.1a2.7 2.7 0 0 0 0 5.4v2.1a2.2 2.2 0 0 1-2.2 2.2H6.2A2.2 2.2 0 0 1 4 17.8v-2.1a2.7 2.7 0 0 0 0-5.4Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="M9 9.2v5.6M14.8 9.2h1.2M14.8 14.8h1.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function AchievementIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d="M5 5.8h14v14H5Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="M8 4v3M16 4v3M5 9h14M8.4 13h.1M12 13h.1M15.6 13h.1M8.4 16.5h.1M12 16.5h.1" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
    </svg>
  );
}

function BrandLogo() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <path
          d="M13 28c0-8 5-14 11-14s11 6 11 14c0 6-4 10-11 10s-11-4-11-10Z"
          fill="#f4fbf0"
          stroke="#4f9b70"
          strokeWidth="2.4"
        />
        <path
          d="M18 24h12M20 30h8"
          fill="none"
          stroke="#2d744f"
          strokeLinecap="round"
          strokeWidth="2.2"
        />
        <path
          d="M16 14c3-5 8-6 13-4"
          fill="none"
          stroke="#e7ad62"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      </svg>
    </span>
  );
}

function UserMark(props: { className: string }) {
  return (
    <span className={props.className} aria-hidden="true" title="あなた">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="17" r="7" fill="#ffffff" stroke="#4f9b70" strokeWidth="2.2" />
        <path
          d="M12 38c2.2-7 6.3-10.5 12-10.5S33.8 31 36 38"
          fill="#eff8f1"
          stroke="#4f9b70"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.2"
        />
      </svg>
    </span>
  );
}

function AffinityPanel(props: { mateAffinity: AppState["mateAffinity"]; onMateSelect?: (mateId: MateId) => void }) {
  return (
    <div className="affinity-panel" aria-label="メイト好感度">
      <div className="affinity-heading">メイトとの距離</div>
      <div className="affinity-list">
        {Object.values(mates).map((mate) => {
          const value = props.mateAffinity[mate.id] ?? 0;
          const level = affinityLevel(value);
          return (
            <div className="affinity-row" key={mate.id}>
              <AvatarImage
                className="affinity-avatar"
                imageSrc={mate.imageSrc}
                name={mate.name}
                onClick={props.onMateSelect ? () => props.onMateSelect?.(mate.id) : undefined}
              />
              <div>
                <span>{mate.name}</span>
                <small>{level}</small>
                <div className="affinity-track">
                  <div style={{ width: `${Math.min(100, value * 5)}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function affinityLevel(value: number) {
  if (value >= 16) return "いつもの";
  if (value >= 10) return "なかよし";
  if (value >= 5) return "顔なじみ";
  if (value >= 1) return "知り合い";
  return "はじめまして";
}

function ResultButton(props: {
  disabled: boolean;
  result: TaskResult;
  onRecord: (result: TaskResult) => void;
}) {
  const resultCopy: Record<TaskResult, { note: string }> = {
    complete: { note: "しっかり進めた！" },
    partial: { note: "ちょっと進めた！" },
    interrupted: { note: "途中でやめた…" },
    failed: { note: "今日はむずかしかった…" },
  };
  return (
    <button
      className={`result-card result-${props.result}`}
      disabled={props.disabled}
      onClick={() => props.onRecord(props.result)}
      type="button"
    >
      <ResultIcon result={props.result} />
      <strong>{resultLabels[props.result]}</strong>
      <small>{resultCopy[props.result].note}</small>
    </button>
  );
}

function ResultIcon(props: { result: TaskResult }) {
  return (
    <span className={`result-icon result-icon-${props.result}`} aria-hidden="true">
      <span />
    </span>
  );
}

function TimelineItem(props: {
  post: TimelinePost;
  replies: TimelinePost[];
  onMateSelect: (mateId: MateId) => void;
  onReact: (postId: string) => void;
  now: number;
}) {
  const isUser = !isMateId(props.post.authorId);
  const mate = isMateId(props.post.authorId) ? mates[props.post.authorId] : null;
  const sortedReplies = [...props.replies].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return (
    <article className={`post ${isUser ? "user-post" : "mate-post"}`}>
      <PostBody
        post={props.post}
        mate={mate}
        onMateSelect={props.onMateSelect}
        onReact={props.onReact}
        replyCount={sortedReplies.length}
        now={props.now}
      />
      {sortedReplies.length > 0 && (
        <div className="replies">
          {sortedReplies.map((reply) => (
            <PostBody
              key={reply.id}
              post={reply}
              mate={isMateId(reply.authorId) ? mates[reply.authorId] : null}
              onMateSelect={props.onMateSelect}
              onReact={props.onReact}
              now={props.now}
              reply
            />
          ))}
        </div>
      )}
    </article>
  );
}

function PostBody(props: {
  post: TimelinePost;
  mate: (typeof mates)[keyof typeof mates] | null;
  onMateSelect: (mateId: MateId) => void;
  onReact: (postId: string) => void;
  now: number;
  replyCount?: number;
  reply?: boolean;
}) {
  const authorName = props.mate?.name ?? "あなた";
  return (
    <div className={props.reply ? "post-body reply-body" : "post-body"}>
      {props.mate ? (
        <AvatarImage
          className="avatar"
          imageSrc={props.mate.imageSrc}
          name={authorName}
          onClick={() => props.mate && props.onMateSelect(props.mate.id)}
          style={{ borderColor: props.mate.accent }}
        />
      ) : (
        <UserMark className="avatar user-avatar" />
      )}
      <div className="post-content">
        <div className="post-meta">
          <strong>{authorName}</strong>
          <span>{formatPostTime(props.post.createdAt, props.now)}</span>
        </div>
        <p>{props.post.text}</p>
        <div className="post-actions" aria-label="投稿アクション">
          {!props.reply && (
            <span className="reply-count" title="返信">
              <ReplyIcon />
              <span>{props.replyCount ?? 0}</span>
            </span>
          )}
          <button
            className={props.post.reaction ? "reaction reacted" : "reaction"}
            aria-label={props.post.reaction ? "いいねを取り消す" : "いいね"}
            title={props.post.reaction ? "いいねを取り消す" : "いいね"}
            onClick={() => props.onReact(props.post.id)}
            type="button"
          >
            <HeartIcon filled={Boolean(props.post.reaction)} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReplyIcon() {
  return (
    <svg aria-hidden="true" className="reply-icon" viewBox="0 0 24 24">
      <path
        d="M7.6 17.7 4 21v-8.2A7.7 7.7 0 0 1 11.7 5h.6A7.7 7.7 0 0 1 20 12.7v.3a4.7 4.7 0 0 1-4.7 4.7H7.6Z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function HeartIcon(props: { filled: boolean }) {
  return (
    <svg aria-hidden="true" className="heart-icon" viewBox="0 0 24 24">
      <path
        d="M20.8 4.9c-2.1-2.1-5.4-1.9-7.3.3L12 6.9l-1.5-1.7C8.6 3 5.3 2.8 3.2 4.9c-2.3 2.3-2.2 6 .2 8.3l7.7 7.3a1.3 1.3 0 0 0 1.8 0l7.7-7.3c2.4-2.3 2.5-6 .2-8.3Z"
        fill={props.filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
    </svg>
  );
}

function AvatarImage(props: {
  className: string;
  imageSrc: string;
  name: string;
  onClick?: () => void;
  style?: CSSProperties;
}) {
  if (props.onClick) {
    return (
      <button className={`${props.className} avatar-button`} onClick={props.onClick} style={props.style} title={`${props.name}のプロフィール`} type="button">
        <img alt="" aria-hidden="true" src={props.imageSrc} />
      </button>
    );
  }
  return (
    <span className={props.className} style={props.style} title={props.name}>
      <img alt="" aria-hidden="true" src={props.imageSrc} />
    </span>
  );
}

export default App;
