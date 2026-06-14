import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import {
  categories,
  comments,
  defaultTicketDefinitions,
  durations,
  mateQuestTemplates,
  mates,
  resultLabels,
  ticketSuggestionTemplates,
} from "./data";
import { affinityTierOrder } from "./affinityDialogues";
import { clearState, loadState, parseStateBackup, saveState } from "./storage";
import type {
  AppState,
  MateComment,
  MateId,
  MonologueKind,
  PomodoroPhase,
  QuestTemplate,
  TaskCategory,
  TaskResult,
  TaskSession,
  TimerMode,
  TicketDefinition,
  TimelinePost,
  TutorialProgress,
  TutorialStepId,
  Weekday,
  WeeklyQuest,
} from "./types";
import "./style.css";

const AFFINITY_GAIN = {
  progressReply: 0.15,
  taskReply: 0.25,
  questCompletion: 0.3,
  reaction: 0.15,
} as const;

const POMODORO_DURATIONS: Record<PomodoroPhase, number> = {
  focus: 25,
  short_break: 5,
  long_break: 15,
};

const POMODORO_LONG_BREAK_INTERVAL = 4;

const WEEKDAY_OPTIONS: { value: Weekday; label: string }[] = [
  { value: 0, label: "日曜日" },
  { value: 1, label: "月曜日" },
  { value: 2, label: "火曜日" },
  { value: 3, label: "水曜日" },
  { value: 4, label: "木曜日" },
  { value: 5, label: "金曜日" },
  { value: 6, label: "土曜日" },
];

const RECORD_RESULT_OPTIONS: TaskResult[] = ["complete", "partial", "interrupted"];

const TUTORIAL_STEPS: Array<{
  id: TutorialStepId;
  title: string;
  body: string;
  target: "home" | "notifications" | "quests" | "tickets" | "achievements" | "settings" | "any";
  postText: string;
}> = [
  {
    id: "profile",
    title: "顔アイコンを押す",
    body: "タイムラインのうさ丸か、右側のメイトの顔を押すとプロフィールが開きます。",
    postText: "まずは、うさ丸の顔を押してプロフィールを開いてみてね。",
    target: "home",
  },
  {
    id: "timeline_reaction",
    title: "ハートを押す",
    body: "投稿のハートを押すと、メイトへの反応として残ります。",
    postText: "次は、この投稿のハートを押してみよう。押したらすぐ完了だよ。",
    target: "home",
  },
  {
    id: "category",
    title: "カテゴリを選ぶ",
    body: "作業開始パネルで、今やることに近いカテゴリを1つ選びます。",
    postText: "作業開始パネルでカテゴリを1つ選んでみよう。迷ったら「整える」でOK。",
    target: "home",
  },
  {
    id: "duration",
    title: "時間を選ぶ",
    body: "作業時間を選びます。最初は5分でも十分です。",
    postText: "次は時間を選ぼう。最初は5分でもちゃんと記録になるよ。",
    target: "home",
  },
  {
    id: "start",
    title: "スタートする",
    body: "カテゴリと時間が決まったら、スタートを押して作業を始めます。",
    postText: "カテゴリと時間を選んだら、スタートを押してみよう。",
    target: "home",
  },
  {
    id: "result",
    title: "結果を記録する",
    body: "作業を止める時に、できた / 少しできた / 中断した から近いものを選びます。",
    postText: "作業を止める時は、いちばん近い結果を押して記録しよう。",
    target: "home",
  },
  {
    id: "notifications",
    title: "通知を見る",
    body: "メイトの返信やいいねは通知で確認できます。",
    postText: "左のナビから通知を開いてみよう。返信やいいねがまとまって見られるよ。",
    target: "notifications",
  },
  {
    id: "quests",
    title: "クエストを見る",
    body: "今週のクエストをまとめて確認できます。",
    postText: "左のナビからクエストを開いてみよう。今週の小さな行動を置く場所だよ。",
    target: "quests",
  },
  {
    id: "fill_quests",
    title: "おまかせ候補を足す",
    body: "クエストが思いつかない時だけ、おまかせガチャで候補を追加できます。",
    postText: "クエストで迷ったら、おまかせガチャを押して候補を足せるよ。",
    target: "quests",
  },
  {
    id: "custom_quest",
    title: "自分でクエストを書く",
    body: "追加ボタンから、自分の生活に合わせたクエストを保存できます。",
    postText: "追加ボタンから、自分用のクエストを1つ書いてみよう。",
    target: "quests",
  },
  {
    id: "tickets",
    title: "チケットを見る",
    body: "クエスト達成で増えるごほうびチケットを確認できます。",
    postText: "左のナビからチケットを開いてみよう。ごほうびの設定が見られるよ。",
    target: "tickets",
  },
  {
    id: "achievements",
    title: "達成を見る",
    body: "カレンダーで、作業した日とカテゴリの積み上がりを確認できます。",
    postText: "左のナビから達成を開いてみよう。作業した日がカレンダーに残るよ。",
    target: "achievements",
  },
  {
    id: "settings",
    title: "設定を見る",
    body: "保存データを初期状態に戻す場所を確認できます。",
    postText: "最後に設定を開いてみよう。初期状態に戻す場所を確認できるよ。",
    target: "settings",
  },
];

const TUTORIAL_STEP_IDS = new Set<TutorialStepId>(TUTORIAL_STEPS.map((step) => step.id));

function getTutorialStep(stepId: TutorialStepId) {
  return TUTORIAL_STEPS.find((step) => step.id === stepId);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function categoryLabel(category: TaskCategory) {
  return categories.find((item) => item.id === category)?.label ?? "つくる";
}

function categoryConceptLabel(category: TaskCategory) {
  return categories.find((item) => item.id === category)?.conceptLabel ?? categoryLabel(category);
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function fillTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

const taskStartTextByCategory: Record<TaskCategory, string[]> = {
  organize: [
    "{label}を少しだけ始めます。まず見えるところから{minutes}分。",
    "部屋のノイズを1個減らす時間。{minutes}分だけ{label}。",
    "{label}タイム開始。全部じゃなくて、手の届くところだけ。",
  ],
  housework: [
    "{label}を少し回します。未来の自分に{minutes}分だけ渡しておく。",
    "暮らしの続きを始めます。{minutes}分だけ、できるところから。",
    "{label}タイム開始。ひとつ済ませたら今日は十分。",
  ],
  work: [
    "{label}を始めます。まず見るだけでも、{minutes}分だけ現実対応。",
    "現実を少しだけ開きます。{minutes}分、軽いところから。",
    "{label}タイム開始。返す・見る・確認する、どれか1つでOK。",
  ],
  learning: [
    "{label}を始めます。理解より先に、{minutes}分だけ触れてみる。",
    "学びの入口を開きます。{minutes}分、わからない場所を見つけにいく。",
    "{label}タイム開始。1ページ、1行、1語でも前進。",
  ],
  writing: [
    "{label}を始めます。きれいに書く前に、{minutes}分だけ置いてみる。",
    "言葉を外に出す時間。{minutes}分だけ下書きする。",
    "{label}タイム開始。1文でも、タイトルだけでも残す。",
  ],
  creative: [
    "{label}を始めます。完成じゃなくて、{minutes}分だけ触る。",
    "つくる入口を開きます。素材を1つ見るだけでもOK。",
    "{label}タイム開始。試す、開く、置く。小さい羽から。",
  ],
  care: [
    "{label}を始めます。からだを戻すために{minutes}分だけ。",
    "自分のメンテ時間。{minutes}分だけ、動くか休むか選ぶ。",
    "{label}タイム開始。水、散歩、休憩。どれでも十分。",
  ],
};

const taskResultTextByResult: Record<TaskResult, string[]> = {
  complete: [
    "{label}は「{result}」で記録しました。今日の手触りがひとつ残りました。",
    "{label}、完了として置いておきます。ちゃんと進んだ記録です。",
    "{label}は「{result}」。できた分を、今日の自分のものにします。",
  ],
  partial: [
    "{label}は「{result}」で記録しました。続きに戻る場所ができました。",
    "{label}、少し進んだところまで保存します。ゼロではありません。",
    "{label}は「{result}」。触れた分だけ、次の入口が軽くなりました。",
  ],
  interrupted: [
    "{label}は「{result}」で記録しました。いったん置いて、戻る場所だけ残します。",
    "{label}を中断として保存します。止めたことも、今日の判断です。",
    "{label}は「{result}」。無理に続けず、ここまでを記録します。",
  ],
};

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

function displayAffinity(value: number) {
  return Math.floor(value);
}

function getAffinityTier(value: number) {
  return [...affinityTierOrder].reverse().find((tier) => value >= tier.min) ?? affinityTierOrder[0];
}

function createSeedPost(comment: MateComment, createdAt: string): TimelinePost {
  return {
    id: `seed-${comment.id}`,
    type: "mate_monologue",
    authorId: comment.mateId,
    text: comment.text,
    createdAt,
    reaction: null,
  };
}

function createTutorialPost(step: (typeof TUTORIAL_STEPS)[number], createdAt = new Date().toISOString()): TimelinePost {
  return {
    id: `tutorial-${step.id}`,
    type: "mate_monologue",
    authorId: "usamaru",
    text: step.postText,
    createdAt,
    reaction: null,
    tutorialStepId: step.id,
    tutorialCompleted: false,
  };
}

function makeTutorialPosts(): TimelinePost[] {
  const firstStep = TUTORIAL_STEPS[0];
  return firstStep ? [createTutorialPost(firstStep)] : [];
}

function makeMonologues(mode: "tutorial" | "standard" = "standard"): TimelinePost[] {
  const now = Date.now();
  const seedComments =
    mode === "tutorial"
      ? comments.filter((comment) => comment.postType === "mate_monologue" && comment.mateId === "usamaru").slice(0, 1)
      : comments.filter((comment) => comment.postType === "mate_monologue").slice(0, 5);

  return seedComments.map((comment, index) =>
    createSeedPost(
      comment,
      new Date(
        now -
          (mode === "tutorial"
            ? (seedComments.length - index + 1) * 1000 * 60 * 4
            : (seedComments.length - index) * 1000 * 60 * 7),
      ).toISOString(),
    ),
  );
}

function createInitialState(mode: "tutorial" | "standard" = "tutorial"): AppState {
  const tutorialPosts = mode === "tutorial" ? makeTutorialPosts() : [];
  return {
    version: 1,
    posts: [...tutorialPosts, ...makeMonologues(mode)],
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
    questWeekEndsOn: 0,
    ticketDefinitions: defaultTicketDefinitions,
    ticketInventory: {},
    ticketAwardedCounts: {},
    questCompletionCount: 0,
    questCompletionLog: [],
    introSeenAt: undefined,
    pageGuideSeenAt: {},
    timerMode: "free",
    pomodoroCycle: 1,
    notificationsEnabled: false,
    tutorialProgress: {
      completedStepIds: [],
    },
  };
}

const initialState = createInitialState();

function pickComments(
  trigger: MateComment["trigger"],
  category: TaskCategory | undefined,
  count: number,
  recentPosts: TimelinePost[] = [],
  affinity: AppState["mateAffinity"] = initialState.mateAffinity,
  options: { excludeMateIds?: MateId[]; replyToMateId?: MateId } = {},
) {
  const recentTexts = new Set(recentPosts.slice(0, 24).map((post) => post.text));
  const recentMateIds = recentPosts
    .slice(0, 10)
    .filter((post) => isMateId(post.authorId))
    .map((post) => post.authorId);
  const excludeMateIds = new Set(options.excludeMateIds ?? []);
  const candidates = comments.filter(
    (comment) =>
      comment.trigger === trigger &&
      comment.postType === "mate_reply" &&
      (!options.replyToMateId || comment.replyToMateId === options.replyToMateId) &&
      (!comment.category || comment.category === category) &&
      !excludeMateIds.has(comment.mateId),
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
        (options.replyToMateId && itemMatchesReplyTarget(comment, options.replyToMateId) ? 4 : 0) +
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

function itemMatchesReplyTarget(comment: MateComment, replyToMateId: MateId) {
  return comment.replyToMateId === replyToMateId;
}

function mateReplyCount(trigger: MateComment["trigger"], category?: TaskCategory) {
  if (trigger === "task_start") return Math.random() < 0.32 ? 1 : 0;
  if (trigger === "progress") return Math.random() < 0.24 ? 1 : 0;
  if (trigger === "complete") return Math.random() < 0.68 ? 1 : 0;
  if (trigger === "partial") return Math.random() < 0.56 ? 1 : 0;
  if (trigger === "interrupted") return Math.random() < 0.46 ? 1 : 0;
  if (category && Math.random() < 0.08) return 2;
  return Math.random() < 0.34 ? 1 : 0;
}

function plannedMateReplyCount(
  trigger: MateComment["trigger"],
  category: TaskCategory,
  post: Pick<TimelinePost, "mateLikes">,
  hasContextReply: boolean,
) {
  const baseCount = mateReplyCount(trigger, category);
  const hasStrongSilentReaction = (post.mateLikes?.length ?? 0) >= 2;
  if (hasContextReply) return Math.random() < 0.12 ? Math.min(1, baseCount) : 0;
  if (hasStrongSilentReaction && Math.random() < 0.72) return 0;
  return baseCount;
}

function canAddReplyToPost(posts: TimelinePost[], parentPostId: string, maxReplies = 1) {
  return posts.filter((post) => post.parentPostId === parentPostId).length < maxReplies;
}

function staggeredReplyDelay(baseDelayMs: number, index: number) {
  if (index === 0) return baseDelayMs;
  return baseDelayMs + index * 2300 + Math.floor(Math.random() * 1700);
}

function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

function getPomodoroBreakPhase(cycle: number): PomodoroPhase {
  return cycle >= POMODORO_LONG_BREAK_INTERVAL ? "long_break" : "short_break";
}

function getPomodoroPhaseLabel(phase?: PomodoroPhase) {
  if (phase === "short_break") return "短い休憩";
  if (phase === "long_break") return "長い休憩";
  return "集中";
}

function makeTaskStartText(category: TaskCategory, minutes: number, mode: TimerMode, cycle: number) {
  const label = categoryConceptLabel(category);
  if (mode === "pomodoro") {
    return pickOne([
      `ポモドーロ${cycle}回目。${label}を25分だけ集中します。`,
      `${label}の集中を始めます。ポモドーロ${cycle}回目、まず25分。`,
      `今から25分、${label}に戻ります。ポモドーロ${cycle}回目。`,
    ]);
  }
  return fillTemplate(pickOne(taskStartTextByCategory[category]), { label, minutes });
}

function makeTaskResultText(category: TaskCategory, result: TaskResult, breakPhase?: PomodoroPhase) {
  const base = fillTemplate(pickOne(taskResultTextByResult[result]), {
    label: categoryConceptLabel(category),
    result: resultLabels[result],
  });
  return breakPhase ? `${base} 次は${getPomodoroPhaseLabel(breakPhase)}です。` : base;
}

function makeBreakStartText(phase: PomodoroPhase, minutes: number) {
  return pickOne([
    `${getPomodoroPhaseLabel(phase)}を始めました。${minutes}分だけ休憩。`,
    `${minutes}分の${getPomodoroPhaseLabel(phase)}に入ります。画面から少し離れて大丈夫。`,
    `${getPomodoroPhaseLabel(phase)}です。${minutes}分、頭と体を戻します。`,
  ]);
}

function makeBreakFinishText(phase: PomodoroPhase | undefined, nextCycle: number) {
  const label = getPomodoroPhaseLabel(phase);
  return pickOne([
    `${label}を終えました。次はポモドーロ${nextCycle}回目の集中です。`,
    `${label}完了。次の集中はポモドーロ${nextCycle}回目です。`,
    `${label}から戻りました。ポモドーロ${nextCycle}回目に入れます。`,
  ]);
}

function makeTicketUsePostText(ticket: TicketDefinition) {
  const lowerName = ticket.name.toLowerCase();
  const description = ticket.description.trim();
  if (ticket.id.includes("early-finish") || ticket.name.includes("切り上げ")) {
    return pickOne([
      `${ticket.name}を使いました。今日はここまで、と決めるのも上手な終わり方です。`,
      `${ticket.name}を切りました。がんばりを伸ばすより、余力を残す日にします。`,
    ]);
  }
  if (ticket.id.includes("walk") || ticket.name.includes("寄り道") || lowerName.includes("walk")) {
    return pickOne([
      `${ticket.name}を使いました。少しだけ道を変えて、頭をほどく時間にします。`,
      `${ticket.name}を切りました。目的地だけじゃなく、途中の空気もごほうびです。`,
    ]);
  }
  if (ticket.id.includes("comfort") || ticket.name.includes("心地")) {
    return pickOne([
      `${ticket.name}を使いました。作業した場所を、少し自分にやさしく戻します。`,
      `${ticket.name}を切りました。心地よさを後回しにしない日です。`,
    ]);
  }
  if (ticket.id.includes("buy") || ticket.name.includes("買い物")) {
    return pickOne([
      `${ticket.name}を使いました。上限を決めて、小さな楽しみを見に行きます。`,
      `${ticket.name}を切りました。欲しかったものを、無理のない範囲で検討します。`,
    ]);
  }
  return pickOne([
    `${ticket.name}を使いました。ちゃんと積み上げたあとのごほうびです。${description ? ` ${description}` : ""}`,
    `${ticket.name}を切りました。今日の記録を、少し気持ちよく閉じます。`,
    `${ticket.name}を使う日です。がんばりっぱなしにしないで、回収するところまでやります。`,
  ]);
}

function finishedTaskSessions(sessions: TaskSession[]) {
  return sessions
    .filter((session): session is TaskSession & { endedAt: string; result: TaskResult } =>
      (session.kind ?? "task") === "task" && Boolean(session.endedAt && session.result),
    )
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
}

function recentTaskSessions(sessions: TaskSession[]) {
  return sessions
    .filter((session) => (session.kind ?? "task") === "task")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function daysBetween(a: string | Date, b: string | Date) {
  return Math.floor(Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

function countRecentCategoryRun(sessions: TaskSession[], category: TaskCategory) {
  let count = 0;
  for (const session of recentTaskSessions(sessions)) {
    if (session.category !== category) break;
    count += 1;
  }
  return count;
}

function countRecentResultRun(sessions: TaskSession[], result: TaskResult) {
  let count = 0;
  for (const session of finishedTaskSessions(sessions)) {
    if (session.result !== result) break;
    count += 1;
  }
  return count;
}

function buildContextReply(
  mateId: MateId,
  text: string,
  parentPostId: string,
  sessionId: string,
  category: TaskCategory,
): TimelinePost {
  return {
    id: makeId("post"),
    type: "mate_reply",
    authorId: mateId,
    text,
    createdAt: new Date().toISOString(),
    taskCategory: category,
    taskSessionId: sessionId,
    parentPostId,
    reaction: null,
  };
}

function makeStartContextReply(
  sessions: TaskSession[],
  category: TaskCategory,
  parentPostId: string,
  sessionId: string,
  startedAt: string,
): TimelinePost | null {
  const recentFinished = finishedTaskSessions(sessions);
  const latestFinished = recentFinished[0];
  if (latestFinished) {
    const gapDays = daysBetween(latestFinished.endedAt, startedAt);
    if (gapDays >= 7) {
      return buildContextReply(
        "kamekichi",
        pickOne([
          `${gapDays}日ぶりに戻ってきたんやねぇ。間が空いても、また始めたら続きになるんやでぇ。`,
          `久しぶりやねぇ。前の記録が途切れたんやなくて、今日また道がつながったんやでぇ。`,
        ]),
        parentPostId,
        sessionId,
        category,
      );
    }
    if (gapDays >= 3) {
      return buildContextReply(
        "usamaru",
        pickOne([
          `${gapDays}日ぶりのもくもくだね。戻ってきた時点で、もう再開できてるよ！`,
          `少し間が空いたあとに押せたね。今日は小さく慣らしていこう！`,
        ]),
        parentPostId,
        sessionId,
        category,
      );
    }
  }

  const categoryRun = countRecentCategoryRun(sessions, category);
  if (categoryRun >= 3) {
    const mateId = supportMateForCategory(category);
    return buildContextReply(
      mateId,
      pickOne([
        `${categoryConceptLabel(category)}が続いてるね。今はここを整える季節なのかもしれない。小さく続けよう。`,
        `同じカテゴリが続いてるの、ちゃんと流れができてる証拠だよ。今日は入口だけ軽くしていこう。`,
      ]),
      parentPostId,
      sessionId,
      category,
    );
  }

  const interruptedRun = countRecentResultRun(sessions, "interrupted");
  if (interruptedRun >= 2) {
    return buildContextReply(
      "azamaru",
      pickOne([
        `中断が続いてる日は、作業量より戻りやすさを優先するまる。今日は短めでいいまる。`,
        `最近止まる日が続いてるまる。止まる前提で、最初の1分だけにするのも作戦まる。`,
      ]),
      parentPostId,
      sessionId,
      category,
    );
  }

  return null;
}

function makeResultContextReply(
  sessions: TaskSession[],
  category: TaskCategory,
  result: TaskResult,
  parentPostId: string,
  sessionId: string,
): TimelinePost | null {
  const completedToday = finishedTaskSessions(sessions).filter((session) => toDateKey(session.endedAt) === toDateKey(new Date()));
  if ((result === "complete" || result === "partial") && completedToday.length >= 2) {
    return buildContextReply(
      "usamaru",
      pickOne([
        `今日これで${completedToday.length + 1}回目の記録だね。積み上げすぎず、次は休憩も入れてね。`,
        `今日は何回も戻ってこれてるね。続いてるからこそ、ここで一息も上手な作戦だよ。`,
      ]),
      parentPostId,
      sessionId,
      category,
    );
  }

  if (result === "interrupted") {
    const interruptedRun = countRecentResultRun(sessions, "interrupted");
    if (interruptedRun >= 1) {
      return buildContextReply(
        "kamekichi",
        pickOne([
          `中断が続く時は、目標をもっと小さくしてええんやでぇ。戻る場所だけ残したら十分やねぇ。`,
          `今日も止める判断ができたんやねぇ。次は最初から短い枠にしてみてもええよぉ。`,
        ]),
        parentPostId,
        sessionId,
        category,
      );
    }
  }

  const sameCategoryToday = completedToday.filter((session) => session.category === category).length;
  if (sameCategoryToday >= 2) {
    const mateId = supportMateForCategory(category);
    return buildContextReply(
      mateId,
      pickOne([
        `今日は${categoryConceptLabel(category)}に何度も戻れてる。こういう日は、流れが残ってるうちに小さく終わるのもあり。`,
        `${categoryConceptLabel(category)}の記録が重なってきたね。続ける力、ちゃんと出てるよ。`,
      ]),
      parentPostId,
      sessionId,
      category,
    );
  }

  return null;
}

function getRemainingSeconds(session?: TaskSession) {
  if (!session) return 0;
  const total = session.durationMinutes * 60;
  const nowTime = session.pausedAt ? new Date(session.pausedAt).getTime() : Date.now();
  const elapsed = Math.floor((nowTime - new Date(session.startedAt).getTime()) / 1000) - (session.pausedTotalSeconds ?? 0);
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

function localDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimelineDateLabel(timestamp: number, currentTime: number) {
  const targetKey = localDateKey(timestamp);
  const today = new Date(currentTime);
  const yesterday = new Date(currentTime);
  yesterday.setDate(today.getDate() - 1);
  if (targetKey === localDateKey(today.getTime())) return "今日";
  if (targetKey === localDateKey(yesterday.getTime())) return "昨日";
  const date = new Date(timestamp);
  if (date.getFullYear() === today.getFullYear()) {
    return date.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
  }
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" });
}

type QuestDraft = {
  id?: string;
  title: string;
};

type TicketDraft = {
  id?: string;
  name: string;
  requiredCompletions: number;
  description: string;
  costMemo: string;
  repeatable: boolean;
};

type ActiveView = "home" | "notifications" | "quests" | "tickets" | "achievements" | "settings";

type PageGuideId = "quests" | "tickets";

type Daypart = "morning" | "day" | "evening" | "night";

function getTutorialProgress(state: AppState): TutorialProgress {
  return {
    completedStepIds: Array.isArray(state.tutorialProgress?.completedStepIds)
      ? state.tutorialProgress.completedStepIds.filter((stepId) => TUTORIAL_STEP_IDS.has(stepId))
      : [],
    finishedAt: state.tutorialProgress?.finishedAt,
  };
}

function getNextTutorialStepId(progress: TutorialProgress) {
  return TUTORIAL_STEPS.find((step) => !progress.completedStepIds.includes(step.id))?.id ?? null;
}

function completeTutorialStep(state: AppState, stepId: TutorialStepId): AppState {
  const progress = getTutorialProgress(state);
  if (progress.finishedAt || progress.completedStepIds.includes(stepId)) return state;
  const completedStepIds = [...progress.completedStepIds, stepId];
  const finishedAt = completedStepIds.length >= TUTORIAL_STEPS.length ? new Date().toISOString() : undefined;
  const nextStep = finishedAt ? undefined : TUTORIAL_STEPS.find((step) => !completedStepIds.includes(step.id));
  const updatedPosts = state.posts.map((post) =>
    post.tutorialStepId === stepId ? { ...post, tutorialCompleted: true } : post,
  );
  const postsWithNextStep =
    nextStep && !updatedPosts.some((post) => post.tutorialStepId === nextStep.id)
      ? [createTutorialPost(nextStep), ...updatedPosts]
      : updatedPosts;
  return {
    ...state,
    posts: postsWithNextStep,
    tutorialProgress: {
      completedStepIds,
      finishedAt,
    },
  };
}

function completeAllTutorialSteps(state: AppState): AppState {
  const completedStepIds = TUTORIAL_STEPS.map((step) => step.id);
  return {
    ...state,
    posts: state.posts.map((post) =>
      post.tutorialStepId ? { ...post, tutorialCompleted: true } : post,
    ),
    tutorialProgress: {
      completedStepIds,
      finishedAt: new Date().toISOString(),
    },
  };
}

function restartTutorial(state: AppState): AppState {
  return {
    ...state,
    posts: [...makeTutorialPosts(), ...state.posts.filter((post) => !post.tutorialStepId)],
    tutorialProgress: {
      completedStepIds: [],
      finishedAt: undefined,
    },
  };
}

function normalizeTutorialTimeline(state: AppState): AppState {
  const progress = getTutorialProgress(state);
  if (progress.finishedAt) return state;
  const nextStepId = getNextTutorialStepId(progress);
  let keptNextStepPost = false;
  const posts = state.posts
    .filter((post) => {
      if (!post.tutorialStepId) return true;
      if (progress.completedStepIds.includes(post.tutorialStepId)) return true;
      if (post.tutorialStepId === nextStepId && !keptNextStepPost) {
        keptNextStepPost = true;
        return true;
      }
      return false;
    })
    .map((post) =>
      post.tutorialStepId && progress.completedStepIds.includes(post.tutorialStepId)
        ? { ...post, tutorialCompleted: true }
        : post,
    );
  const nextStep = nextStepId ? getTutorialStep(nextStepId) : undefined;
  return {
    ...state,
    posts: nextStep && !keptNextStepPost ? [createTutorialPost(nextStep), ...posts] : posts,
  };
}

type AppNotification = {
  id: string;
  type: "reply" | "like";
  mateId: MateId;
  postId: string;
  text: string;
  createdAt: string;
  parentText?: string;
};

function makeQuestDraft(): QuestDraft {
  return {
    title: "",
  };
}

function makeTicketDraft(): TicketDraft {
  return {
    name: "",
    requiredCompletions: 3,
    description: "",
    costMemo: "",
    repeatable: true,
  };
}

function makeWeeklyQuest(template: QuestTemplate): WeeklyQuest {
  return {
    id: makeId("quest"),
    templateId: template.id,
    title: template.title,
    source: template.source,
    createdAt: new Date().toISOString(),
  };
}

function pickQuestReaction(quest: WeeklyQuest) {
  const mateId: MateId = "kamekichi";
  return { mateId, text: `「${quest.title}」できたねぇ。ゆっくり進めばええよぉ。` };
}

function nextTicketProgress(definition: TicketDefinition, completedCount: number) {
  const needed = definition.requiredCompletions;
  const remainder = completedCount % needed;
  const progress = remainder === 0 && completedCount > 0 ? needed : remainder;
  return { progress, needed, remaining: needed - progress };
}

function recalculateTicketAwards(
  definitions: TicketDefinition[],
  completedCount: number,
  previousInventory: AppState["ticketInventory"] = {},
  previousAwardedCounts: AppState["ticketAwardedCounts"] = {},
) {
  const ticketInventory: AppState["ticketInventory"] = {};
  const ticketAwardedCounts: AppState["ticketAwardedCounts"] = {};

  for (const ticket of definitions.filter((item) => item.enabled)) {
    const required = Math.max(1, ticket.requiredCompletions);
    const earnedTotal = ticket.repeatable
      ? Math.floor(completedCount / required)
      : completedCount >= required
        ? 1
        : 0;
    const previousAwarded = previousAwardedCounts[ticket.id] ?? 0;
    const previousUsed = Math.max(0, previousAwarded - (previousInventory[ticket.id] ?? 0));
    const count = Math.max(0, earnedTotal - previousUsed);
    if (count > 0) ticketInventory[ticket.id] = count;
    if (earnedTotal > 0) ticketAwardedCounts[ticket.id] = earnedTotal;
  }

  return { ticketInventory, ticketAwardedCounts };
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

function getQuestWeekPeriod(anchorDate: string | Date, weekEndsOn: Weekday) {
  const anchor = new Date(anchorDate);
  const weekEnd = new Date(anchor);
  const daysUntilEnd = (weekEndsOn - anchor.getDay() + 7) % 7;
  weekEnd.setDate(anchor.getDate() + daysUntilEnd);
  weekEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  return { weekStart, weekEnd };
}

function formatMonthTitle(date: Date) {
  return date.toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
}

const mateLikeProfiles: Record<MateId, { base: number; categories?: TaskCategory[]; resultBias?: Partial<Record<TaskResult, number>> }> = {
  usamaru: { base: 0.55, resultBias: { complete: 0.14, partial: 0.1, interrupted: 0.08 } },
  kamekichi: { base: 0.44, resultBias: { partial: 0.08, interrupted: 0.12 } },
  kumaru: { base: 0.34, categories: ["housework", "organize", "care"], resultBias: { complete: 0.08, partial: 0.1 } },
  azamaru: { base: 0.32, categories: ["care", "housework"], resultBias: { interrupted: 0.14, partial: 0.05 } },
  waniyan: { base: 0.26, categories: ["organize", "housework"], resultBias: { complete: 0.12 } },
  piyori: { base: 0.23, categories: ["creative", "writing"], resultBias: { partial: 0.08 } },
  shibatarou: { base: 0.18, categories: ["work", "learning"], resultBias: { complete: 0.12 } },
  fukurou: { base: 0.14, categories: ["learning", "work"], resultBias: { partial: 0.08 } },
  nekosenpai: { base: 0.08, categories: ["writing", "creative"], resultBias: { complete: 0.08 } },
};

function maybeMateLikes(
  category: TaskCategory,
  chance = 0.28,
  recentPosts: TimelinePost[] = [],
  result?: TaskResult,
): MateId[] {
  if (Math.random() > chance) return [];
  const primary = supportMateForCategory(category);
  const recentLikeCounts = recentPosts.slice(0, 18).reduce<Record<string, number>>((counts, post) => {
    for (const mateId of post.mateLikes ?? []) counts[mateId] = (counts[mateId] ?? 0) + 1;
    return counts;
  }, {});

  const likedBy = (Object.keys(mateLikeProfiles) as MateId[])
    .map((mateId) => {
      const profile = mateLikeProfiles[mateId];
      const categoryBoost = mateId === primary ? 0.28 : profile.categories?.includes(category) ? 0.16 : -0.05;
      const resultBoost = result ? profile.resultBias?.[result] ?? 0 : 0;
      const recentPenalty = Math.min(0.24, (recentLikeCounts[mateId] ?? 0) * 0.08);
      return {
        mateId,
        probability: Math.max(0.02, Math.min(0.82, profile.base + categoryBoost + resultBoost - recentPenalty)),
      };
    })
    .filter((item) => Math.random() < item.probability)
    .sort((a, b) => b.probability - a.probability)
    .map((item) => item.mateId);

  const limit = Math.random() > 0.82 ? 3 : Math.random() > 0.42 ? 2 : 1;
  return Array.from(new Set(likedBy)).slice(0, limit);
}

function maybePeerLikes(
  authorId: MateId,
  category: TaskCategory | undefined,
  recentPosts: TimelinePost[] = [],
  chance = 0.34,
): MateId[] {
  if (Math.random() > chance) return [];
  const recentLikeCounts = recentPosts.slice(0, 20).reduce<Record<string, number>>((counts, post) => {
    if (post.authorId !== "user") {
      for (const mateId of post.mateLikes ?? []) counts[mateId] = (counts[mateId] ?? 0) + 1;
    }
    return counts;
  }, {});
  const socialBoosts: Partial<Record<MateId, Partial<Record<MateId, number>>>> = {
    waniyan: { kumaru: 0.16, kamekichi: 0.08 },
    kumaru: { waniyan: 0.12, azamaru: 0.1 },
    shibatarou: { fukurou: 0.1, usamaru: 0.08 },
    fukurou: { shibatarou: 0.08, kamekichi: 0.06 },
    nekosenpai: { piyori: 0.16 },
    piyori: { nekosenpai: 0.12, usamaru: 0.08 },
    azamaru: { kumaru: 0.1, kamekichi: 0.1 },
    usamaru: { azamaru: 0.08, piyori: 0.08 },
    kamekichi: { usamaru: 0.08, fukurou: 0.08 },
  };

  const likedBy = (Object.keys(mateLikeProfiles) as MateId[])
    .filter((mateId) => mateId !== authorId)
    .map((mateId) => {
      const profile = mateLikeProfiles[mateId];
      const categoryBoost = category && profile.categories?.includes(category) ? 0.1 : 0;
      const socialBoost = socialBoosts[authorId]?.[mateId] ?? 0;
      const recentPenalty = Math.min(0.22, (recentLikeCounts[mateId] ?? 0) * 0.07);
      return {
        mateId,
        probability: Math.max(0.01, Math.min(0.58, profile.base * 0.52 + categoryBoost + socialBoost - recentPenalty)),
      };
    })
    .filter((item) => Math.random() < item.probability)
    .sort((a, b) => b.probability - a.probability)
    .map((item) => item.mateId);

  const limit = Math.random() > 0.88 ? 3 : Math.random() > 0.55 ? 2 : 1;
  return Array.from(new Set(likedBy)).slice(0, limit);
}

function makeMateLikeNotificationText(mateId: MateId, postId: string) {
  const texts: Record<MateId, string[]> = {
    waniyan: ["ワニやんが小さくうなずきました。", "ワニやんが「それでええ」といいねしました。"],
    kumaru: ["くまるがそっといいねしました。", "くまるがあたたかく見守っています。"],
    shibatarou: ["しばたろうが勢いよくいいねしました。", "しばたろうが進捗として採用しました。"],
    fukurou: ["ホウ先生が静かにいいねしました。", "ホウ先生が良い記録だと見ています。"],
    nekosenpai: ["ミケ先輩が珍しくいいねしました。", "ミケ先輩が悪くないわね、という顔をしています。"],
    piyori: ["ピヨリが小さく羽を鳴らしました。", "ピヨリがいいねを置いていきました。"],
    azamaru: ["あざまるがゆるくいいねしました。", "あざまるが休憩込みで見守っています。"],
    usamaru: ["うさ丸がすぐにいいねしました。", "うさ丸が見つけていいねしました。"],
    kamekichi: ["かめ吉がゆっくりいいねしました。", "かめ吉がちゃんと見ていました。"],
  };
  const hash = [...postId].reduce((sum, char) => sum + char.charCodeAt(0), mateId.length);
  return texts[mateId][hash % texts[mateId].length];
}

function formatMateLikeLabel(mateIds: MateId[]) {
  const uniqueMateIds = Array.from(new Set(mateIds));
  if (uniqueMateIds.length === 0) return "";
  const [firstMateId, secondMateId] = uniqueMateIds;
  const firstName = mates[firstMateId].name;
  if (uniqueMateIds.length === 1) return `${firstName}がいいね`;
  if (uniqueMateIds.length === 2) return `${firstName}、${mates[secondMateId].name}がいいね`;
  return `${firstName}、他${uniqueMateIds.length - 1}人がいいね`;
}

const daypartAmbientMonologues: Record<Daypart, Array<{ id: string; mateId: MateId; category?: TaskCategory; text: string }>> = {
  morning: [
    { id: "daypart-morning-usamaru", mateId: "usamaru", text: "朝のうちは、入口を小さくしておくよ。押しやすいところからで大丈夫。" },
    { id: "daypart-morning-kumaru", mateId: "kumaru", category: "housework", text: "朝の家事は、音を立てすぎないところから始めるよぉ。コップひとつだけねぇ。" },
    { id: "daypart-morning-shiba", mateId: "shibatarou", category: "work", text: "朝イチの通知、全部は見ないッ！まず今日の一番軽いやつだけ確認ッ！" },
  ],
  day: [
    { id: "daypart-day-wani", mateId: "waniyan", category: "organize", text: "昼のうちに、机の端っこだけ戻しとくわ。夕方の自分が助かるやつや。" },
    { id: "daypart-day-hou", mateId: "fukurou", category: "learning", text: "昼は集中が散りやすいですね。短い復習を挟むくらいがちょうど良いです。" },
    { id: "daypart-day-piyori", mateId: "piyori", category: "creative", text: "昼の明るいうちに色を一つ見ておくぴよ。決めなくても候補になるぴよ〜。" },
  ],
  evening: [
    { id: "daypart-evening-kame", mateId: "kamekichi", text: "夕方は、今日できたところを少し眺める時間にしてもええねぇ。" },
    { id: "daypart-evening-mike", mateId: "nekosenpai", category: "writing", text: "夕方の文章は荒れがちね。だからこそ、雑な一文だけ置けば十分よ。" },
    { id: "daypart-evening-aza", mateId: "azamaru", category: "care", text: "夕方は体が置いていかれやすいまる。肩だけ戻しておくまる。" },
  ],
  night: [
    { id: "daypart-night-aza", mateId: "azamaru", category: "care", text: "夜は勝ち負けを閉じる時間まる。できた分だけ持って、あとは休むまる。" },
    { id: "daypart-night-kame", mateId: "kamekichi", text: "夜のクエスト確認は、明日の自分への置き手紙くらいでええねぇ。" },
    { id: "daypart-night-hou", mateId: "fukurou", category: "learning", text: "夜に理解を詰め込みすぎなくて大丈夫です。今日は目印だけ残しましょう。" },
  ],
};

function currentDaypart(date = new Date()): Daypart {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "day";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function pickDaypartAmbientMonologue(posts: TimelinePost[]) {
  const usedTexts = new Set(posts.map((post) => post.text));
  const recentMateIds = posts
    .filter((post) => post.type === "mate_monologue" && isMateId(post.authorId))
    .slice(0, 3)
    .map((post) => post.authorId as MateId);
  const pool = daypartAmbientMonologues[currentDaypart()].filter(
    (item) => !usedTexts.has(item.text) && !recentMateIds.includes(item.mateId),
  );
  const fallback = daypartAmbientMonologues[currentDaypart()].filter((item) => !usedTexts.has(item.text));
  const selectedPool = pool.length > 0 ? pool : fallback;
  return selectedPool.length > 0 ? pickOne(selectedPool) : null;
}

function makeReactionReplyText(mateId: MateId, postId: string) {
  const texts: Record<MateId, string[]> = {
    waniyan: ["見とったんやな。まあ、ちょっと照れるわ。", "そのハート、床の端っこに置いとくで。"],
    kumaru: ["いいね、届いたよぉ。ちょっとあったかいねぇ。", "見てくれてありがとぉ。ぼくも少し進めそうだよぉ。"],
    shibatarou: ["反応確認ッ！ありがたく受領したッ！", "いいね受信ッ！次の行動力に変換するッ！"],
    fukurou: ["反応ありがとうございます。小さな観察が共有されましたね。", "見ていただけたなら、記録として少し強くなりますね。"],
    nekosenpai: ["ふうん、見てたのね。まあ、悪くないわ。", "いいねするなら、ちゃんと続きも見届けなさいよ。"],
    piyori: ["いいね見つけたぴよ〜。羽が一枚ふえた気分ぴよ。", "反応ありがとぴよ。ちょっと飛べそうぴよ〜。"],
    azamaru: ["いいね、ゆるく受け取ったまる。水も飲むまる。", "見てくれてありがとまる。今日はそのくらいで十分まる。"],
    usamaru: ["いいねありがとう！うさ丸、ちゃんと見つけたよ！", "反応してくれた！うれしいから、次も小さくいこうね。"],
    kamekichi: ["いいね、ゆっくり届いたねぇ。ありがたいねぇ。", "見てもろたんやねぇ。のんびり励みになるねぇ。"],
  };
  const hash = [...postId].reduce((sum, char) => sum + char.charCodeAt(0), mateId.charCodeAt(0));
  return texts[mateId][hash % texts[mateId].length];
}

function makeNotifications(posts: TimelinePost[]): AppNotification[] {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const notifications: AppNotification[] = [];
  for (const post of posts) {
    if (isMateId(post.authorId) && post.parentPostId) {
      const parent = postById.get(post.parentPostId);
      if (parent?.authorId !== "user") continue;
      notifications.push({
        id: `reply-${post.id}`,
        type: "reply",
        mateId: post.authorId,
        postId: post.id,
        text: post.text,
        createdAt: post.createdAt,
        parentText: parent?.text,
      });
    }
    if (post.authorId === "user" && post.mateLikes?.length) {
      for (const mateId of post.mateLikes) {
        notifications.push({
          id: `like-${post.id}-${mateId}`,
          type: "like",
          mateId,
          postId: post.id,
          text: makeMateLikeNotificationText(mateId, post.id),
          createdAt: post.createdAt,
          parentText: post.text,
        });
      }
    }
  }
  return notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function getUnusedMonologueComments(
  posts: TimelinePost[],
  options: { category?: TaskCategory; excludeMateIds?: MateId[]; monologueKind?: MonologueKind } = {},
) {
  const usedTexts = new Set(posts.map((post) => post.text));
  const excludeMateIds = new Set(options.excludeMateIds ?? []);
  return comments.filter((comment) => {
    if (comment.postType !== "mate_monologue") return false;
    if (usedTexts.has(comment.text)) return false;
    if (excludeMateIds.has(comment.mateId)) return false;
    if (options.monologueKind && comment.monologueKind !== options.monologueKind) return false;
    if (options.category && comment.category && comment.category !== options.category) return false;
    return true;
  });
}

function pickAmbientSelfMonologue(posts: TimelinePost[], taskCategory: TaskCategory) {
  const recentMateIds = posts
    .filter((post) => post.type === "mate_monologue" && isMateId(post.authorId))
    .slice(0, 3)
    .map((post) => post.authorId as MateId);
  const sameCategory = getUnusedMonologueComments(posts, {
    category: taskCategory,
    excludeMateIds: recentMateIds,
    monologueKind: "self",
  });
  const general = getUnusedMonologueComments(posts, {
    excludeMateIds: recentMateIds,
    monologueKind: "self",
  });
  const fallback = getUnusedMonologueComments(posts, {
    category: taskCategory,
    monologueKind: "self",
  });
  const pool = sameCategory.length > 0 ? sameCategory : general.length > 0 ? general : fallback;
  if (pool.length === 0) return null;
  return pickOne(pool);
}

function newestPostTime(posts: TimelinePost[]) {
  if (posts.length === 0) return null;
  return Math.max(...posts.map((post) => new Date(post.createdAt).getTime()));
}

function latestTaskCategory(sessions: TaskSession[]) {
  return recentTaskSessions(sessions)[0]?.category;
}

function pickReturnAmbientMonologue(posts: TimelinePost[], sessions: TaskSession[]) {
  const daypartComment = Math.random() < 0.45 ? pickDaypartAmbientMonologue(posts) : null;
  if (daypartComment) return daypartComment;
  const category = latestTaskCategory(sessions);
  if (category) return pickAmbientSelfMonologue(posts, category);
  const recentMateIds = posts
    .filter((post) => post.type === "mate_monologue" && isMateId(post.authorId))
    .slice(0, 3)
    .map((post) => post.authorId as MateId);
  const pool = getUnusedMonologueComments(posts, {
    excludeMateIds: recentMateIds,
    monologueKind: "self",
  });
  return pool.length > 0 ? pickOne(pool) : null;
}

function recentTimelineDensity(posts: TimelinePost[], withinMinutes = 4) {
  const threshold = Date.now() - withinMinutes * 60 * 1000;
  return posts.filter((post) => new Date(post.createdAt).getTime() >= threshold).length;
}

function idleAmbientDelay(posts: TimelinePost[], minIdleMinutes = 18) {
  const newest = newestPostTime(posts);
  if (!newest) return null;
  const minIdleMs = minIdleMinutes * 60 * 1000;
  const elapsedMs = Date.now() - newest;
  const extraHumanDelayMs = 45000 + Math.floor(Math.random() * 45000);
  return Math.max(0, minIdleMs - elapsedMs) + extraHumanDelayMs;
}

function shouldPostAmbientSelfMonologue(posts: TimelinePost[], baseChance: number) {
  const density = recentTimelineDensity(posts);
  const adjustedChance = Math.max(0.14, Math.min(0.68, baseChance + (density <= 1 ? 0.18 : 0) - Math.max(0, density - 4) * 0.1));
  return Math.random() <= adjustedChance;
}

function timelinePostKindLabel(post: TimelinePost, reply?: boolean) {
  if (reply) return "返信";
  if (post.type === "user_task_start") return "作業開始";
  if (post.type === "user_task_result") return "作業記録";
  if (post.type === "mate_monologue") return "近況";
  return "返信";
}

function App() {
  const [state, setState] = useState<AppState>(() => normalizeTutorialTimeline(loadState() ?? initialState));
  const [category, setCategory] = useState<TaskCategory>("organize");
  const [duration, setDuration] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [progressPostedFor, setProgressPostedFor] = useState<string | null>(null);
  const [timedOutSessionId, setTimedOutSessionId] = useState<string | null>(null);
  const [questDraft, setQuestDraft] = useState<QuestDraft>(() => makeQuestDraft());
  const [ticketDraft, setTicketDraft] = useState<TicketDraft>(() => makeTicketDraft());
  const [latestReward, setLatestReward] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("home");
  const [selectedMateId, setSelectedMateId] = useState<MateId | null>(null);
  const [customizingQuestId, setCustomizingQuestId] = useState<string | null>(null);
  const [questEditorOpen, setQuestEditorOpen] = useState(false);
  const [ticketEditorOpen, setTicketEditorOpen] = useState(false);
  const [introDialogOpen, setIntroDialogOpen] = useState(false);
  const [pageGuideOpen, setPageGuideOpen] = useState<PageGuideId | null>(null);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const sidePanelRef = useRef<HTMLElement | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const returnAmbientPostedRef = useRef(false);
  const liveAmbientPostCountRef = useRef(0);
  const [sidePanelTop, setSidePanelTop] = useState(14);
  const notifications = useMemo(() => makeNotifications(state.posts), [state.posts]);
  const lastSeenTime = state.lastNotificationSeenAt ? new Date(state.lastNotificationSeenAt).getTime() : 0;
  const unreadNotificationCount = notifications.filter((item) => new Date(item.createdAt).getTime() > lastSeenTime).length;
  const tutorialProgress = getTutorialProgress(state);
  const timerMode = state.timerMode ?? "free";
  const pomodoroCycle = state.pomodoroCycle ?? 1;

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
    if (returnAmbientPostedRef.current) return;
    returnAmbientPostedRef.current = true;
    if (!state.introSeenAt || activeSession) return;
    const newest = newestPostTime(state.posts);
    if (!newest) return;
    const hoursSinceLastPost = (Date.now() - newest) / (1000 * 60 * 60);
    if (hoursSinceLastPost < 8) return;
    const comment = pickReturnAmbientMonologue(state.posts, state.sessions);
    if (!comment) return;
    const timer = window.setTimeout(() => {
      const post: TimelinePost = {
        id: makeId("post"),
        type: "mate_monologue",
        authorId: comment.mateId,
        text: comment.text,
        createdAt: new Date().toISOString(),
        taskCategory: comment.category,
        reaction: null,
        mateLikes: maybePeerLikes(comment.mateId, comment.category, state.posts, 0.3),
      };
      setState((current) => {
        if (current.posts.some((item) => item.text === post.text)) return current;
        return {
          ...current,
          posts: [post, ...current.posts],
        };
      });
      queueMateThreadReplies(post, 6500);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!state.introSeenAt || activeSession || activeView !== "home") return;
    if (liveAmbientPostCountRef.current >= 2) return;
    const delay = idleAmbientDelay(state.posts);
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      const newest = newestPostTime(state.posts);
      if (!newest) return;
      const minutesSinceLastPost = (Date.now() - newest) / (1000 * 60);
      if (minutesSinceLastPost < 18) return;
      const comment = pickReturnAmbientMonologue(state.posts, state.sessions);
      if (!comment) return;
      const post: TimelinePost = {
        id: makeId("post"),
        type: "mate_monologue",
        authorId: comment.mateId,
        text: comment.text,
        createdAt: new Date().toISOString(),
        taskCategory: comment.category,
        reaction: null,
        mateLikes: maybePeerLikes(comment.mateId, comment.category, state.posts, 0.28),
      };
      liveAmbientPostCountRef.current += 1;
      setState((current) => {
        if (current.posts.some((item) => item.text === post.text)) return current;
        return {
          ...current,
          posts: [post, ...current.posts],
        };
      });
      queueMateThreadReplies(post, 7000);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [activeSession, activeView, state.introSeenAt, state.posts, state.sessions]);

  useLayoutEffect(() => {
    if (activeView !== "home") return;
    const panel = sidePanelRef.current;
    if (!panel) return;

    let frameId = 0;
    const updateSidePanelTop = () => {
      frameId = 0;
      const viewportPadding = 14;
      const availableHeight = window.innerHeight - viewportPadding * 2;
      const scrollablePanelDistance = Math.max(0, panel.offsetHeight - availableHeight);
      const nextTop = viewportPadding - Math.min(window.scrollY, scrollablePanelDistance);
      setSidePanelTop((current) => (current === nextTop ? current : nextTop));
    };
    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateSidePanelTop);
    };

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(panel);
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [activeView]);

  useEffect(() => {
    if (!activeSession) {
      setTimedOutSessionId(null);
      return;
    }
    if (remainingSeconds > 0) {
      setTimedOutSessionId((current) => (current === activeSession.id ? null : current));
      return;
    }
    if (timedOutSessionId === activeSession.id) return;
    setTimedOutSessionId(activeSession.id);
    if (state.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      void new Notification("もくもく終了", {
        body: "結果を記録しよう。",
        icon: `${import.meta.env.BASE_URL}favicon.svg`,
      });
    }
    const AudioContextCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const audioContext = new AudioContextCtor();
    const playTone = (startTime: number, frequency: number, duration: number, gainValue: number) => {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gainNode.gain.value = gainValue;
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    const start = audioContext.currentTime;
    playTone(start, 784, 0.12, 0.07);
    playTone(start + 0.14, 988, 0.12, 0.07);
    playTone(start + 0.28, 1175, 0.18, 0.08);
    window.setTimeout(() => void audioContext.close(), 700);
  }, [activeSession, remainingSeconds, state.notificationsEnabled, timedOutSessionId]);

  useEffect(() => {
    if (!activeSession || progressPostedFor === activeSession.id) return;
    if ((activeSession.kind ?? "task") === "break") return;
    if (activeSession.pausedAt) return;
    const elapsed = Math.floor((now - new Date(activeSession.startedAt).getTime()) / 1000) - (activeSession.pausedTotalSeconds ?? 0);
    if (elapsed < Math.min(90, activeSession.durationMinutes * 30)) return;
    const parent = state.posts.find((post) => post.taskSessionId === activeSession.id && post.type === "user_task_start");
    const pickedReplies = pickComments(
      "progress",
      activeSession.category,
      mateReplyCount("progress", activeSession.category),
      state.posts,
      state.mateAffinity,
    );
    if (!parent || pickedReplies.length === 0) return;
    pickedReplies.forEach((comment, index) => {
      window.setTimeout(() => {
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
        setState((current) => {
          if (!canAddReplyToPost(current.posts, parent.id)) return current;
          return {
            ...current,
            mateAffinity: bumpAffinity(current.mateAffinity, [comment.mateId], AFFINITY_GAIN.progressReply),
            posts: [reply, ...current.posts],
          };
        });
      }, staggeredReplyDelay(0, index));
    });
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
    pickedReplies.forEach((comment, index) => {
      window.setTimeout(() => {
        const reply: TimelinePost = {
          id: makeId("post"),
          type: "mate_reply",
          authorId: comment.mateId,
          text: comment.text,
          createdAt: new Date().toISOString(),
          taskCategory,
          taskSessionId: sessionId,
          parentPostId,
          reaction: null,
        };
        setState((current) => {
          if (!canAddReplyToPost(current.posts, parentPostId)) return current;
          return {
            ...current,
            mateAffinity: bumpAffinity(current.mateAffinity, [comment.mateId], AFFINITY_GAIN.taskReply),
            posts: [reply, ...current.posts],
          };
        });
      }, staggeredReplyDelay(delayMs, index));
    });
  }

  function queueMateThreadReplies(parentPost: TimelinePost, delayMs = 5000) {
    if (!isMateId(parentPost.authorId)) return;
    const pickedReplies = pickComments(
      "app_open",
      parentPost.taskCategory,
      1,
      state.posts,
      state.mateAffinity,
      { excludeMateIds: [parentPost.authorId], replyToMateId: parentPost.authorId },
    );
    if (pickedReplies.length === 0) return;
    window.setTimeout(() => {
      const replies: TimelinePost[] = pickedReplies.slice(0, 1).map((comment) => ({
        id: makeId("post"),
        type: "mate_reply",
        authorId: comment.mateId,
        text: comment.text,
        createdAt: new Date().toISOString(),
        taskCategory: parentPost.taskCategory,
        taskSessionId: parentPost.taskSessionId,
        parentPostId: parentPost.id,
        reaction: null,
      }));
      setState((current) => {
        if (!canAddReplyToPost(current.posts, parentPost.id) || replies.length === 0) return current;
        return {
          ...current,
          mateAffinity: bumpAffinity(current.mateAffinity, replies.map((reply) => reply.authorId as MateId), AFFINITY_GAIN.taskReply),
          posts: [...replies, ...current.posts],
        };
      });
    }, delayMs);
  }

  function queueAmbientSelfMonologue(taskCategory: TaskCategory, chance = 0.38, delayMs = 5200) {
    if (!shouldPostAmbientSelfMonologue(state.posts, chance)) return;
    const comment = pickAmbientSelfMonologue(state.posts, taskCategory);
    if (!comment) return;
    window.setTimeout(() => {
      const post: TimelinePost = {
        id: makeId("post"),
        type: "mate_monologue",
        authorId: comment.mateId,
        text: comment.text,
        createdAt: new Date().toISOString(),
        taskCategory: comment.category,
        reaction: null,
        mateLikes: maybePeerLikes(comment.mateId, comment.category, state.posts),
      };
      setState((current) => ({
        ...current,
        posts: [post, ...current.posts],
      }));
      queueMateThreadReplies(post, 6500);
    }, delayMs);
  }

  function switchView(view: ActiveView) {
    setActiveView(view);
    window.scrollTo({ top: 0, left: 0 });
    if ((view === "quests" || view === "tickets") && !state.pageGuideSeenAt?.[view]) {
      setPageGuideOpen(view);
    }
    if (view === "notifications") {
      setState((current) => ({ ...current, lastNotificationSeenAt: new Date().toISOString() }));
    }
    if (view === "notifications") {
      setState((current) => completeTutorialStep(current, "notifications"));
    } else if (view === "quests") {
      setState((current) => completeTutorialStep(current, "quests"));
    } else if (view === "tickets") {
      setState((current) => completeTutorialStep(current, "tickets"));
    } else if (view === "achievements") {
      setState((current) => completeTutorialStep(current, "achievements"));
    } else if (view === "settings") {
      setState((current) => completeTutorialStep(current, "settings"));
    }
  }

  function closePageGuide() {
    const guideId = pageGuideOpen;
    setPageGuideOpen(null);
    if (!guideId) return;
    setState((current) => ({
      ...current,
      pageGuideSeenAt: {
        ...current.pageGuideSeenAt,
        [guideId]: new Date().toISOString(),
      },
    }));
  }

  function openMateProfile(mateId: MateId) {
    setSelectedMateId(mateId);
    setState((current) => completeTutorialStep(current, "profile"));
  }

  function changeCategory(nextCategory: TaskCategory) {
    setCategory(nextCategory);
    setState((current) => completeTutorialStep(current, "category"));
  }

  function changeDuration(nextDuration: number) {
    setDuration(nextDuration);
    setState((current) => completeTutorialStep(current, "duration"));
  }

  function toggleActiveSessionPause() {
    if (!activeSession) return;
    const pausedAt = new Date().toISOString();
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((session) => {
        if (session.id !== activeSession.id) return session;
        if (session.pausedAt) {
          const pausedSeconds = Math.max(0, Math.floor((Date.now() - new Date(session.pausedAt).getTime()) / 1000));
          return {
            ...session,
            pausedAt: undefined,
            pausedTotalSeconds: (session.pausedTotalSeconds ?? 0) + pausedSeconds,
          };
        }
        return { ...session, pausedAt };
      }),
    }));
  }

  function extendActiveSession(minutes: number) {
    if (!activeSession) return;
    setState((current) => ({
      ...current,
      sessions: current.sessions.map((session) =>
        session.id === activeSession.id
          ? { ...session, durationMinutes: Math.max(1, session.durationMinutes + minutes) }
          : session,
      ),
    }));
    setTimedOutSessionId(null);
  }

  function changeTimerMode(nextMode: TimerMode) {
    if (activeSession) return;
    setState((current) => ({
      ...current,
      timerMode: nextMode,
      pomodoroCycle: nextMode === "pomodoro" ? current.pomodoroCycle ?? 1 : current.pomodoroCycle,
    }));
    if (nextMode === "pomodoro") {
      setDuration(POMODORO_DURATIONS.focus);
    }
  }

  function resetAllData() {
    clearState();
    setCategory("organize");
    setDuration(5);
    setProgressPostedFor(null);
    setQuestDraft(makeQuestDraft());
    setTicketDraft(makeTicketDraft());
    setLatestReward(null);
    setCustomizingQuestId(null);
    setQuestEditorOpen(false);
    setTicketEditorOpen(false);
    setSelectedMateId(null);
    setActiveView("home");
    setState(createInitialState("tutorial"));
  }

  function exportBackup() {
    const dateKey = toDateKey(Date.now());
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mokumoku-mate-backup-${dateKey}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setSettingsMessage("バックアップを書き出しました。");
  }

  async function importBackupFile(file: File) {
    try {
      const parsed = parseStateBackup(await file.text());
      if (!parsed) {
        setSettingsMessage("バックアップを読み込めませんでした。ファイル形式を確認してください。");
        return;
      }
      const ok = window.confirm("現在の保存データをバックアップの内容で置き換えます。よろしいですか？");
      if (!ok) {
        setSettingsMessage("読み込みをキャンセルしました。");
        return;
      }
      setCategory("organize");
      setDuration(5);
      setProgressPostedFor(null);
      setTimedOutSessionId(null);
      setQuestDraft(makeQuestDraft());
      setTicketDraft(makeTicketDraft());
      setLatestReward(null);
      setCustomizingQuestId(null);
      setQuestEditorOpen(false);
      setTicketEditorOpen(false);
      setSelectedMateId(null);
      setActiveView("home");
      setState(parsed);
      setSettingsMessage("バックアップを読み込みました。");
    } catch {
      setSettingsMessage("バックアップを読み込めませんでした。ファイルを確認してください。");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  }

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) {
      setSettingsMessage("このブラウザは通知に対応していません。");
      return;
    }
    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();
    if (permission !== "granted") {
      setState((current) => ({ ...current, notificationsEnabled: false }));
      setSettingsMessage("通知は許可されませんでした。音と画面表示はそのまま使えます。");
      return;
    }
    setState((current) => ({ ...current, notificationsEnabled: true }));
    setSettingsMessage("タイマー終了時のブラウザ通知をオンにしました。");
  }

  function disableBrowserNotifications() {
    setState((current) => ({ ...current, notificationsEnabled: false }));
    setSettingsMessage("ブラウザ通知をオフにしました。");
  }

  function finishTutorial() {
    setState((current) => completeAllTutorialSteps(current));
    setSettingsMessage("チュートリアルを完了扱いにしました。");
  }

  function showTutorialAgain() {
    setActiveView("home");
    setState((current) => restartTutorial(current));
    setSettingsMessage("チュートリアルをもう一度表示しました。");
  }

  function showIntroAgain() {
    setIntroDialogOpen(true);
    setSettingsMessage("はじめのスライドを開きました。");
  }

  function hideIntroAgain() {
    setIntroDialogOpen(false);
  }

  function startTask() {
    if (activeSession) return;
    setTimedOutSessionId(null);
    const isPomodoro = timerMode === "pomodoro";
    const taskDuration = isPomodoro ? POMODORO_DURATIONS.focus : duration;
    const session: TaskSession = {
      id: makeId("session"),
      category,
      durationMinutes: taskDuration,
      startedAt: new Date().toISOString(),
      kind: "task",
      timerMode,
      pomodoroPhase: isPomodoro ? "focus" : undefined,
      pomodoroCycle: isPomodoro ? pomodoroCycle : undefined,
    };
    const mateLikes = maybeMateLikes(category, 0.18, state.posts);
    const startPost: TimelinePost = {
      id: makeId("post"),
      type: "user_task_start",
      authorId: "user",
      text: makeTaskStartText(category, taskDuration, timerMode, pomodoroCycle),
      createdAt: session.startedAt,
      taskCategory: category,
      taskSessionId: session.id,
      reaction: null,
      mateLikes,
    };
    const contextReply = makeStartContextReply(state.sessions, category, startPost.id, session.id, session.startedAt);
    const pickedReplies = pickComments(
      "task_start",
      category,
      plannedMateReplyCount("task_start", category, startPost, Boolean(contextReply)),
      state.posts,
      state.mateAffinity,
      { excludeMateIds: contextReply && isMateId(contextReply.authorId) ? [contextReply.authorId] : [] },
    );
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
      posts: [startPost, ...(contextReply ? [contextReply] : []), ...current.posts],
    }));
    setState((current) => completeTutorialStep(current, "start"));
    queueMateReplies(startPost.id, session.id, category, pickedReplies, 12000);
  }

  function recordResult(result: TaskResult) {
    if (!activeSession) return;
    if ((activeSession.kind ?? "task") === "break") {
      finishPomodoroBreak();
      return;
    }
    const endedAt = new Date().toISOString();
    const shouldStartBreak =
      activeSession.timerMode === "pomodoro" && (result === "complete" || result === "partial");
    const breakPhase = shouldStartBreak
      ? getPomodoroBreakPhase(activeSession.pomodoroCycle ?? pomodoroCycle)
      : undefined;
    const breakSession: TaskSession | null = breakPhase
      ? {
        id: makeId("session"),
        category: activeSession.category,
        durationMinutes: POMODORO_DURATIONS[breakPhase],
        startedAt: endedAt,
        kind: "break",
        timerMode: "pomodoro",
        pomodoroPhase: breakPhase,
        pomodoroCycle: activeSession.pomodoroCycle ?? pomodoroCycle,
      }
      : null;
    const mateLikes = result === "complete" || result === "partial"
      ? maybeMateLikes(activeSession.category, 0.42, state.posts, result)
      : maybeMateLikes(activeSession.category, 0.22, state.posts, result);
    const resultPost: TimelinePost = {
      id: makeId("post"),
      type: "user_task_result",
      authorId: "user",
      text: makeTaskResultText(activeSession.category, result, breakPhase),
      createdAt: endedAt,
      taskCategory: activeSession.category,
      taskResult: result,
      taskSessionId: activeSession.id,
      reaction: null,
      mateLikes,
    };
    const contextReply = makeResultContextReply(
      state.sessions,
      activeSession.category,
      result,
      resultPost.id,
      activeSession.id,
    );
    const pickedReplies = pickComments(
      result,
      activeSession.category,
      plannedMateReplyCount(result, activeSession.category, resultPost, Boolean(contextReply)),
      state.posts,
      state.mateAffinity,
      { excludeMateIds: contextReply && isMateId(contextReply.authorId) ? [contextReply.authorId] : [] },
    );
    const breakStartPost: TimelinePost | null = breakSession
      ? (() => {
        const breakMateLikes = maybeMateLikes(activeSession.category, 0.16, state.posts);
        return {
        id: makeId("post"),
        type: "user_task_start" as const,
        authorId: "user" as const,
        text: makeBreakStartText(breakPhase!, breakSession.durationMinutes),
        createdAt: breakSession.startedAt,
        taskCategory: activeSession.category,
        taskSessionId: breakSession.id,
        reaction: null,
        mateLikes: breakMateLikes,
      };
      })()
      : null;
    setState((current) => ({
      ...current,
      activeSessionId: breakSession?.id,
      sessions: [
        ...(breakSession ? [breakSession] : []),
        ...current.sessions.map((session) =>
          session.id === activeSession.id
            ? { ...session, endedAt, result, pausedAt: undefined }
            : session,
        ),
      ],
      posts: [
        ...(breakStartPost
          ? [breakStartPost]
          : []),
        resultPost,
        ...(contextReply ? [contextReply] : []),
        ...current.posts,
      ],
    }));
    setTimedOutSessionId(null);
    setState((current) => completeTutorialStep(current, "result"));
    queueMateReplies(resultPost.id, activeSession.id, activeSession.category, pickedReplies, 8000);
    queueAmbientSelfMonologue(activeSession.category);
  }

  function finishPomodoroBreak() {
    if (!activeSession || (activeSession.kind ?? "task") !== "break") return;
    const endedAt = new Date().toISOString();
    const currentCycle = activeSession.pomodoroCycle ?? pomodoroCycle;
    const nextCycle = currentCycle >= POMODORO_LONG_BREAK_INTERVAL ? 1 : currentCycle + 1;
    const mateLikes = maybeMateLikes(activeSession.category, 0.2, state.posts);
    const resultPost: TimelinePost = {
      id: makeId("post"),
      type: "user_task_result",
      authorId: "user",
      text: makeBreakFinishText(activeSession.pomodoroPhase, nextCycle),
      createdAt: endedAt,
      taskCategory: activeSession.category,
      taskResult: "complete",
      taskSessionId: activeSession.id,
      reaction: null,
      mateLikes,
    };
    setState((current) => ({
      ...current,
      activeSessionId: undefined,
      pomodoroCycle: nextCycle,
      sessions: current.sessions.map((session) =>
        session.id === activeSession.id
          ? { ...session, endedAt, pausedAt: undefined }
          : session,
      ),
      posts: [resultPost, ...current.posts],
    }));
    setTimedOutSessionId(null);
    queueAmbientSelfMonologue(activeSession.category, 0.22, 4800);
  }

  function toggleReaction(postId: string) {
    const target = state.posts.find((post) => post.id === postId);
    const shouldQueueReactionReply = Boolean(
      target &&
      isMateId(target.authorId) &&
      !target.reaction &&
      Math.random() < 0.32,
    );
    const reactionReplyText = target && isMateId(target.authorId)
      ? makeReactionReplyText(target.authorId, target.id)
      : "";
    setState((current) => ({
      ...current,
      mateAffinity: (() => {
        const target = current.posts.find((post) => post.id === postId);
        if (!target || !isMateId(target.authorId)) return current.mateAffinity;
        return bumpAffinity(
          current.mateAffinity,
          [target.authorId],
          target.reaction ? -AFFINITY_GAIN.reaction : AFFINITY_GAIN.reaction,
        );
      })(),
      posts: current.posts.map((post) => {
        if (post.id !== postId) return post;
        return { ...post, reaction: post.reaction ? null : "like" };
      }),
    }));
    setState((current) => completeTutorialStep(current, "timeline_reaction"));
    if (target && isMateId(target.authorId) && shouldQueueReactionReply) {
      const targetMateId = target.authorId;
      window.setTimeout(() => {
        const reply: TimelinePost = {
          id: makeId("post"),
          type: "mate_reply",
          authorId: targetMateId,
          text: reactionReplyText,
          createdAt: new Date().toISOString(),
          taskCategory: target.taskCategory,
          taskSessionId: target.taskSessionId,
          parentPostId: target.id,
          reaction: null,
        };
        setState((current) => {
          const parent = current.posts.find((post) => post.id === target.id);
          if (!parent?.reaction) return current;
          if (current.posts.some((post) => post.parentPostId === target.id && post.text === reactionReplyText)) return current;
          return {
            ...current,
            mateAffinity: bumpAffinity(current.mateAffinity, [targetMateId], AFFINITY_GAIN.reaction),
            posts: [reply, ...current.posts],
          };
        });
      }, 1800 + Math.floor(Math.random() * 1800));
    }
  }

  function addMonologue() {
    const monologues = getUnusedMonologueComments(state.posts);
    const comment = monologues[Math.floor(Math.random() * monologues.length)];
    if (!comment) return;
    const addedPost: TimelinePost = {
      id: makeId("post"),
      type: "mate_monologue",
      authorId: comment.mateId,
      text: comment.text,
      createdAt: new Date().toISOString(),
      taskCategory: comment.category,
      reaction: null,
      mateLikes: maybePeerLikes(comment.mateId, comment.category, state.posts),
    };
    setState((current) => ({ ...current, posts: [addedPost, ...current.posts] }));
    if (addedPost) queueMateThreadReplies(addedPost);
  }

  function fillWeeklyQuests() {
    setState((current) => {
      const usedTitles = new Set(current.weeklyQuests.map((quest) => quest.title));
      const pool = [
        ...current.customQuests.filter((quest) => quest.enabled && !usedTitles.has(quest.title)),
        ...mateQuestTemplates.filter((quest) => quest.enabled && !usedTitles.has(quest.title)),
      ].sort(() => Math.random() - 0.5);
      const suggestion = pool[0];
      if (!suggestion) return current;
      return {
        ...current,
        questWeekStartedAt: current.questWeekStartedAt || new Date().toISOString(),
        weeklyQuests: [...current.weeklyQuests, makeWeeklyQuest(suggestion)],
      };
    });
    setState((current) => completeTutorialStep(current, "fill_quests"));
  }

  function saveCustomQuest() {
    const title = questDraft.title.trim();
    if (!title) return;
    const template: QuestTemplate = {
      id: questDraft.id ?? makeId("custom-quest"),
      title,
      source: "custom",
      enabled: true,
    };
    setState((current) => ({
      ...current,
      customQuests: questDraft.id
        ? current.customQuests.map((quest) => (quest.id === questDraft.id ? template : quest))
        : [template, ...current.customQuests],
      weeklyQuests: questDraft.id
        ? current.weeklyQuests.map((quest) =>
            quest.templateId === questDraft.id || quest.id === questDraft.id ? { ...quest, title, source: "custom" } : quest,
          )
        : [...current.weeklyQuests, makeWeeklyQuest(template)],
    }));
    setState((current) => completeTutorialStep(current, "custom_quest"));
    setQuestDraft(makeQuestDraft());
    setQuestEditorOpen(false);
  }

  function openNewQuestEditor() {
    setCustomizingQuestId(null);
    setQuestDraft(makeQuestDraft());
    setQuestEditorOpen(true);
  }

  function editCustomQuest(quest: QuestTemplate) {
    setCustomizingQuestId(null);
    setQuestDraft({
      id: quest.id,
      title: quest.title,
    });
    setQuestEditorOpen(true);
  }

  function addCustomQuestToWeek(quest: QuestTemplate) {
    setState((current) => ({
      ...current,
      weeklyQuests: [...current.weeklyQuests, makeWeeklyQuest(quest)],
    }));
  }

  function startWeeklyQuestCustomization(quest: WeeklyQuest) {
    setCustomizingQuestId(quest.id);
    setQuestDraft({
      title: quest.title,
    });
    setQuestEditorOpen(true);
  }

  function cancelWeeklyQuestCustomization() {
    setCustomizingQuestId(null);
    setQuestDraft(makeQuestDraft());
    setQuestEditorOpen(false);
  }

  function saveWeeklyQuestCustomization() {
    const title = questDraft.title.trim();
    if (!customizingQuestId || !title) return;
    setState((current) => {
      const target = current.weeklyQuests.find((quest) => quest.id === customizingQuestId);
      if (!target) return current;
      const existingTemplate = target.templateId
        ? current.customQuests.find((quest) => quest.id === target.templateId)
        : undefined;
      const template: QuestTemplate = existingTemplate
        ? { ...existingTemplate, title, source: "custom", enabled: true }
        : { id: makeId("custom-quest"), title, source: "custom", enabled: true };
      return {
        ...current,
        customQuests: existingTemplate
          ? current.customQuests.map((quest) => (quest.id === existingTemplate.id ? template : quest))
          : [template, ...current.customQuests],
        weeklyQuests: current.weeklyQuests.map((quest) =>
          quest.id === customizingQuestId
            ? { ...quest, templateId: template.id, title, source: "custom" }
            : quest,
        ),
      };
    });
    setCustomizingQuestId(null);
    setQuestDraft(makeQuestDraft());
    setQuestEditorOpen(false);
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
      reaction: null,
      mateLikes: maybePeerLikes(reaction.mateId, undefined, state.posts, 0.28),
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
            source: quest.source,
            completedAt: new Date().toISOString(),
          },
          ...(current.questCompletionLog ?? []),
        ],
        mateAffinity: bumpAffinity(current.mateAffinity, [reaction.mateId], AFFINITY_GAIN.questCompletion),
        weeklyQuests: current.weeklyQuests.map((item) =>
          item.id === questId ? { ...item, completedAt: new Date().toISOString() } : item,
        ),
        posts: [reactionPost, ...current.posts],
      };
    });
    queueMateThreadReplies(reactionPost, 7000);
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

  function undoQuestCompletion(questId: string) {
    setState((current) => {
      const target = current.weeklyQuests.find((quest) => quest.id === questId);
      if (!target?.completedAt) return current;
      const nextCount = Math.max(0, (current.questCompletionCount ?? 0) - 1);
      const { ticketInventory, ticketAwardedCounts } = recalculateTicketAwards(
        current.ticketDefinitions,
        nextCount,
        current.ticketInventory,
        current.ticketAwardedCounts,
      );
      return {
        ...current,
        questCompletionCount: nextCount,
        ticketInventory,
        ticketAwardedCounts,
        questCompletionLog: (current.questCompletionLog ?? []).filter((log) => log.questId !== questId),
        weeklyQuests: current.weeklyQuests.map((quest) =>
          quest.id === questId ? { ...quest, completedAt: undefined } : quest,
        ),
      };
    });
    setLatestReward(null);
  }

  function deleteWeeklyQuest(questId: string) {
    setState((current) => {
      const target = current.weeklyQuests.find((quest) => quest.id === questId);
      if (!target) return current;
      const nextCount = target.completedAt ? Math.max(0, (current.questCompletionCount ?? 0) - 1) : current.questCompletionCount;
      const awards = target.completedAt
        ? recalculateTicketAwards(current.ticketDefinitions, nextCount, current.ticketInventory, current.ticketAwardedCounts)
        : {
            ticketInventory: current.ticketInventory,
            ticketAwardedCounts: current.ticketAwardedCounts,
          };
      return {
        ...current,
        questCompletionCount: nextCount,
        ticketInventory: awards.ticketInventory,
        ticketAwardedCounts: awards.ticketAwardedCounts,
        questCompletionLog: target.completedAt
          ? (current.questCompletionLog ?? []).filter((log) => log.questId !== questId)
          : current.questCompletionLog,
        weeklyQuests: current.weeklyQuests.filter((quest) => quest.id !== questId),
      };
    });
    setLatestReward(null);
  }

  function resetWeeklyQuests() {
    setState((current) => ({
      ...current,
      questWeekStartedAt: new Date().toISOString(),
      weeklyQuests: [],
    }));
  }

  function startNewQuestWeek(carryOpen: boolean) {
    setState((current) => ({
      ...current,
      questWeekStartedAt: new Date().toISOString(),
      weeklyQuests: carryOpen
        ? current.weeklyQuests
            .filter((quest) => !quest.completedAt)
            .map((quest) => ({
              ...quest,
              id: makeId("quest"),
              createdAt: new Date().toISOString(),
              completedAt: undefined,
            }))
        : [],
    }));
    setLatestReward(null);
  }

  function changeQuestWeekEndsOn(questWeekEndsOn: Weekday) {
    setState((current) => ({
      ...current,
      questWeekEndsOn,
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
    setTicketEditorOpen(false);
  }

  function openNewTicketEditor() {
    setTicketDraft(makeTicketDraft());
    setTicketEditorOpen(true);
  }

  function dismissIntro() {
    setIntroDialogOpen(false);
    setState((current) => ({
      ...current,
      introSeenAt: current.introSeenAt ?? new Date().toISOString(),
    }));
  }

  function addSuggestedTicketDefinition() {
    setState((current) => {
      const usedNames = new Set(current.ticketDefinitions.map((ticket) => ticket.name));
      const pool = ticketSuggestionTemplates
        .filter((ticket) => ticket.enabled && !usedNames.has(ticket.name))
        .sort(() => Math.random() - 0.5);
      const suggestion = pool[0];
      if (!suggestion) return current;
      const ticket: TicketDefinition = {
        ...suggestion,
        id: makeId("ticket"),
      };
      return {
        ...current,
        ticketDefinitions: [ticket, ...current.ticketDefinitions],
      };
    });
  }

  function editTicketDefinition(ticket: TicketDefinition) {
    setTicketDraft({
      id: ticket.id,
      name: ticket.name,
      requiredCompletions: ticket.requiredCompletions,
      description: ticket.description,
      costMemo: ticket.costMemo ?? "",
      repeatable: ticket.repeatable,
    });
    setTicketEditorOpen(true);
  }

  function deleteTicketDefinition(ticketId: string) {
    setState((current) => {
      const { [ticketId]: _removedInventory, ...ticketInventory } = current.ticketInventory;
      const { [ticketId]: _removedAwarded, ...ticketAwardedCounts } = current.ticketAwardedCounts;
      return {
        ...current,
        ticketDefinitions: current.ticketDefinitions.filter((ticket) => ticket.id !== ticketId),
        ticketInventory,
        ticketAwardedCounts,
      };
    });
    setTicketDraft((draft) => (draft.id === ticketId ? makeTicketDraft() : draft));
    setTicketEditorOpen(false);
  }

  function cancelTicketEdit() {
    setTicketDraft(makeTicketDraft());
    setTicketEditorOpen(false);
  }

  function useTicket(ticketId: string) {
    const ticket = state.ticketDefinitions.find((item) => item.id === ticketId);
    if (!ticket || (state.ticketInventory[ticketId] ?? 0) <= 0) return;
    const mateId: MateId = "kamekichi";
    const post: TimelinePost = {
      id: makeId("post"),
      type: "mate_monologue",
      authorId: mateId,
      text: makeTicketUsePostText(ticket),
      createdAt: new Date().toISOString(),
      reaction: null,
      mateLikes: maybePeerLikes(mateId, undefined, state.posts, 0.26),
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
    queueMateThreadReplies(post, 7000);
  }

  function updateSessionRecord(sessionId: string, nextCategory: TaskCategory, nextResult: TaskResult) {
    setState((current) => {
      const target = current.sessions.find((session) => session.id === sessionId && session.endedAt && session.result);
      if (!target) return current;
      const categoryUseCounts = {
        ...makeDefaultCategoryUseCounts(),
        ...current.categoryUseCounts,
      };
      if (target.category !== nextCategory) {
        categoryUseCounts[target.category] = Math.max(0, (categoryUseCounts[target.category] ?? 0) - 1);
        categoryUseCounts[nextCategory] = (categoryUseCounts[nextCategory] ?? 0) + 1;
      }
      return {
        ...current,
        categoryUseCounts,
        sessions: current.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, category: nextCategory, result: nextResult }
            : session,
        ),
        posts: current.posts.map((post) => {
          if (post.taskSessionId !== sessionId) return post;
          if (post.type === "user_task_result") {
            return {
              ...post,
              taskCategory: nextCategory,
              taskResult: nextResult,
              text: `${categoryLabel(nextCategory)}は「${resultLabels[nextResult]}」で記録しました。`,
            };
          }
          return { ...post, taskCategory: nextCategory };
        }),
      };
    });
  }

  function deleteSessionRecord(sessionId: string) {
    if (!window.confirm("この作業記録を削除しますか？関連する投稿も削除されます。")) return;
    setState((current) => {
      const target = current.sessions.find((session) => session.id === sessionId);
      if (!target || !target.endedAt || !target.result) return current;
      const categoryUseCounts = {
        ...makeDefaultCategoryUseCounts(),
        ...current.categoryUseCounts,
        [target.category]: Math.max(0, (current.categoryUseCounts?.[target.category] ?? 0) - 1),
      };
      return {
        ...current,
        activeSessionId: current.activeSessionId === sessionId ? undefined : current.activeSessionId,
        categoryUseCounts,
        sessions: current.sessions.filter((session) => session.id !== sessionId),
        posts: current.posts.filter((post) => post.taskSessionId !== sessionId),
      };
    });
  }

  const parentPosts = state.posts
    .filter((post) => !post.parentPostId)
    .sort((a, b) => getPostActivityTime(b, state.posts) - getPostActivityTime(a, state.posts));
  const timelineRows = parentPosts.reduce<Array<
    | { type: "date"; key: string; label: string }
    | { type: "post"; post: TimelinePost }
  >>((rows, post) => {
    const activityTime = getPostActivityTime(post, state.posts);
    const dateKey = localDateKey(activityTime);
    const latestDateRow = [...rows].reverse().find((row) => row.type === "date");
    if (latestDateRow?.key !== dateKey) {
      rows.push({
        type: "date",
        key: dateKey,
        label: formatTimelineDateLabel(activityTime, now),
      });
    }
    rows.push({ type: "post", post });
    return rows;
  }, []);
  const sortedCategories = [...categories].sort((a, b) => {
    const countDiff = (state.categoryUseCounts?.[b.id] ?? 0) - (state.categoryUseCounts?.[a.id] ?? 0);
    if (countDiff !== 0) return countDiff;
    return categories.findIndex((item) => item.id === a.id) - categories.findIndex((item) => item.id === b.id);
  });
  const hasUnusedMonologue = getUnusedMonologueComments(state.posts).length > 0;
  const nextTutorialStepId = tutorialProgress.finishedAt ? null : getNextTutorialStepId(tutorialProgress);

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
            { view: "notifications", label: "通知", icon: NotificationIcon, badge: unreadNotificationCount },
            { view: "quests", label: "クエスト", icon: QuestIcon },
            { view: "tickets", label: "チケット", icon: TicketIcon },
            { view: "achievements", label: "達成", icon: AchievementIcon },
            { view: "settings", label: "設定", icon: SettingsIcon },
          ].map(({ view, label, icon: Icon, badge }) => (
            <button
              aria-current={activeView === view ? "page" : undefined}
              className={activeView === view ? "selected" : ""}
              key={view}
              onClick={() => switchView(view as ActiveView)}
              type="button"
            >
              <Icon />
              <span>{label}</span>
              {Boolean(badge) && <strong className="nav-badge">{badge}</strong>}
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
                {timelineRows.map((row) => row.type === "date" ? (
                  <div className="timeline-date-separator" role="separator" key={`date-${row.key}`}>
                    <span>{row.label}</span>
                  </div>
                ) : (
                  <TimelineItem
                    key={row.post.id}
                    post={row.post}
                    replies={state.posts.filter((reply) => reply.parentPostId === row.post.id)}
                    onMateSelect={openMateProfile}
                    onReact={toggleReaction}
                    now={now}
                    nextTutorialStepId={nextTutorialStepId}
                  />
                ))}
              </div>
            </section>

            <aside className="side-panel" ref={sidePanelRef} style={{ top: `${sidePanelTop}px` }} aria-label="作業開始と記録">
              <StartPanel
                active={Boolean(activeSession)}
                category={category}
                categories={sortedCategories}
                duration={duration}
                pomodoroCycle={pomodoroCycle}
                remainingSeconds={remainingSeconds}
                progressPercent={progressPercent}
                session={activeSession}
                timerMode={timerMode}
                onCategoryChange={changeCategory}
                onDurationChange={changeDuration}
                onFinishBreak={finishPomodoroBreak}
                onMateSelect={openMateProfile}
                onPauseToggle={toggleActiveSessionPause}
                onRecord={recordResult}
                onExtend={() => extendActiveSession(5)}
                onStart={startTask}
                onTimerModeChange={changeTimerMode}
              />
            </aside>
          </section>
        )}

        {activeView === "notifications" && (
          <NotificationPage
            notifications={notifications}
            lastSeenAt={state.lastNotificationSeenAt}
            onMateSelect={openMateProfile}
          />
        )}

        {activeView === "quests" && (
          <QuestPage
            customQuests={state.customQuests}
            latestReward={latestReward}
            questCompletionCount={state.questCompletionCount}
            questDraft={questDraft}
            questEditorOpen={questEditorOpen}
            ticketDefinitions={state.ticketDefinitions}
            weeklyQuests={state.weeklyQuests}
            onAddCustomQuestToWeek={addCustomQuestToWeek}
            onCancelWeeklyQuestCustomization={cancelWeeklyQuestCustomization}
            onCompleteQuest={completeQuest}
            onDeleteQuest={deleteWeeklyQuest}
            onEditQuest={editCustomQuest}
            onFillWeeklyQuests={fillWeeklyQuests}
            onOpenNewQuestEditor={openNewQuestEditor}
            onQuestDraftChange={setQuestDraft}
            onReplaceWeeklyQuest={replaceWeeklyQuest}
            onResetWeeklyQuests={resetWeeklyQuests}
            onSaveWeeklyQuestCustomization={saveWeeklyQuestCustomization}
            onSaveQuest={saveCustomQuest}
            onStartNewWeek={startNewQuestWeek}
            onStartWeeklyQuestCustomization={startWeeklyQuestCustomization}
            onUndoQuestCompletion={undoQuestCompletion}
            onOpenGuide={() => setPageGuideOpen("quests")}
            customizingQuestId={customizingQuestId}
            questWeekStartedAt={state.questWeekStartedAt}
            questWeekEndsOn={state.questWeekEndsOn}
          />
        )}

        {activeView === "tickets" && (
          <TicketPage
            latestReward={latestReward}
            questCompletionCount={state.questCompletionCount}
            ticketDefinitions={state.ticketDefinitions}
            ticketDraft={ticketDraft}
            ticketEditorOpen={ticketEditorOpen}
            ticketInventory={state.ticketInventory}
            weeklyQuests={state.weeklyQuests}
            onCancelTicketEdit={cancelTicketEdit}
            onDeleteTicket={deleteTicketDefinition}
            onEditTicket={editTicketDefinition}
            onOpenNewTicketEditor={openNewTicketEditor}
            onSaveTicket={saveTicketDefinition}
            onSuggestTicket={addSuggestedTicketDefinition}
            onTicketDraftChange={setTicketDraft}
            onUseTicket={useTicket}
            onOpenGuide={() => setPageGuideOpen("tickets")}
          />
        )}

        {activeView === "achievements" && (
          <AchievementPage
            mateAffinity={state.mateAffinity}
            sessions={state.sessions}
            onDeleteSession={deleteSessionRecord}
            onEditSession={updateSessionRecord}
            onMateSelect={openMateProfile}
          />
        )}

        {activeView === "settings" && (
          <SettingsPage
            backupInputRef={backupInputRef}
            message={settingsMessage}
            notificationsEnabled={state.notificationsEnabled === true}
            questWeekEndsOn={state.questWeekEndsOn}
            onDisableNotifications={disableBrowserNotifications}
            onEnableNotifications={enableBrowserNotifications}
            onExportBackup={exportBackup}
            onImportBackup={importBackupFile}
            onQuestWeekEndsOnChange={changeQuestWeekEndsOn}
            onResetData={resetAllData}
            onShowIntro={showIntroAgain}
            onRestartTutorial={showTutorialAgain}
            onSkipTutorial={finishTutorial}
          />
        )}
      </div>
      {selectedMateId && (
        <MateProfileDialog mateId={selectedMateId} mateAffinity={state.mateAffinity} onClose={() => setSelectedMateId(null)} />
      )}
      {(!state.introSeenAt || introDialogOpen) && (
        <IntroDialog
          dismissible={Boolean(state.introSeenAt)}
          onClose={state.introSeenAt ? hideIntroAgain : dismissIntro}
        />
      )}
      {pageGuideOpen && (
        <PageGuideDialog guideId={pageGuideOpen} onClose={closePageGuide} />
      )}
    </main>
  );
}

const INTRO_SLIDES: Array<{
  title: string;
  lead: string;
  mateId: MateId;
  points: string[];
}> = [
  {
    title: "ひとりの作業を、ちょっとにぎやかに",
    lead: "もくもくメイトは、今から向き合うことを1つ選んで、短い時間だけ始めるための小さな作業場所です。",
    mateId: "usamaru",
    points: ["5分から始められます", "終わったら「少しでも触れた」でも記録できます", "メイトがタイムラインでそっと反応します"],
  },
  {
    title: "カテゴリから、向き合うもくもくを選ぼう",
    lead: "整理、家事、仕事、学び、創作、回復。今の自分に近いカテゴリを選ぶと、作業の入口が少しだけはっきりします。",
    mateId: "waniyan",
    points: ["作業の種類ごとにメイトの反応が変わります", "よく使うカテゴリは先頭に寄ってきます", "顔アイコンからプロフィールも見られます"],
  },
  {
    title: "集中したい日は、ポモドーロもあります",
    lead: "25分集中して、短く休む。流れをアプリに任せると、次に戻る場所を見失いにくくなります。",
    mateId: "azamaru",
    points: ["通常タイマーとポモドーロを切り替えられます", "休憩もタイマーで区切れます", "4回目のあとは長めの休憩になります"],
  },
  {
    title: "クエストで、やることを小さく置こう",
    lead: "やるべきことが大きく見える時は、今週のクエストとして小さく分けておけます。自分で書いても、候補から足しても大丈夫。",
    mateId: "kamekichi",
    points: ["今週だけのクエストを並べられます", "迷ったらおまかせ候補を足せます", "終わったクエストは達成として残ります"],
  },
  {
    title: "チケットで、自分へのごほうびを作ろう",
    lead: "クエストを達成すると、ごほうびチケットが育ちます。先に楽しみを決めておくと、やるべきことに向き合いやすくなります。",
    mateId: "kamekichi",
    points: ["好きなおやつ、休憩、趣味時間などを設定できます", "必要な達成回数は自分で決められます", "手に入ったチケットは使った記録も残せます"],
  },
  {
    title: "あとから、できた日を見返せます",
    lead: "作業記録やクエスト達成は、達成画面に残ります。できた量が小さくても、続けた跡はちゃんと見えるようになります。",
    mateId: "usamaru",
    points: ["カレンダーで作業した日を確認できます", "カテゴリごとの色で流れが見えます", "設定からこのスライドをもう一度開けます"],
  },
];

function IntroDialog(props: { dismissible: boolean; onClose: () => void }) {
  const [slideIndex, setSlideIndex] = useState(0);
  const pointerStartX = useRef<number | null>(null);
  const slide = INTRO_SLIDES[slideIndex];
  const mate = mates[slide.mateId];
  const isFirst = slideIndex === 0;
  const isLast = slideIndex === INTRO_SLIDES.length - 1;

  function showPreviousSlide() {
    setSlideIndex((current) => Math.max(0, current - 1));
  }

  function showNextSlide() {
    if (isLast) {
      props.onClose();
      return;
    }
    setSlideIndex((current) => Math.min(INTRO_SLIDES.length - 1, current + 1));
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && props.dismissible) {
        props.onClose();
      } else if (event.key === "ArrowLeft") {
        showPreviousSlide();
      } else if (event.key === "ArrowRight") {
        showNextSlide();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLast, props]);

  return (
    <div
      className="modal-backdrop intro-backdrop"
      role="presentation"
      onClick={props.dismissible ? props.onClose : undefined}
    >
      <section
        aria-labelledby="intro-dialog-title"
        aria-modal="true"
        className="intro-dialog"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        {props.dismissible && (
          <button className="intro-close" onClick={props.onClose} type="button" aria-label="説明を閉じる">
            閉じる
          </button>
        )}
        <div
          className="intro-slide-window"
          onPointerCancel={() => {
            pointerStartX.current = null;
          }}
          onPointerDown={(event) => {
            pointerStartX.current = event.clientX;
          }}
          onPointerUp={(event) => {
            if (pointerStartX.current === null) return;
            const diff = event.clientX - pointerStartX.current;
            pointerStartX.current = null;
            if (Math.abs(diff) < 45) return;
            if (diff > 0) {
              showPreviousSlide();
            } else {
              showNextSlide();
            }
          }}
        >
          <div className="intro-slide-track" style={{ transform: `translateX(-${slideIndex * 100}%)` }}>
            {INTRO_SLIDES.map((item) => {
              const itemMate = mates[item.mateId];
              return (
                <article className="intro-slide" key={item.title} aria-hidden={item.title !== slide.title}>
                  <AvatarImage className="intro-dialog-mate" imageSrc={itemMate.imageSrc} name={itemMate.name} />
                  <div className="intro-copy">
                    <span>ようこそ</span>
                    <h2 id={item.title === slide.title ? "intro-dialog-title" : undefined}>{item.title}</h2>
                    <p>{item.lead}</p>
                  </div>
                  <div className="intro-point-list">
                    {item.points.map((point) => (
                      <div className="intro-point" key={point}>
                        <CheckIcon />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <div className="intro-footer">
          <div className="intro-progress" aria-label={`説明 ${slideIndex + 1} / ${INTRO_SLIDES.length}`}>
            {INTRO_SLIDES.map((item, index) => (
              <button
                aria-label={`${index + 1}枚目: ${item.title}`}
                className={index === slideIndex ? "selected" : ""}
                key={item.title}
                onClick={() => setSlideIndex(index)}
                type="button"
              />
            ))}
          </div>
          <div className="intro-actions">
            <button className="soft-button" disabled={isFirst} onClick={showPreviousSlide} type="button">
              前へ
            </button>
            <button className="soft-button strong" onClick={showNextSlide} type="button">
              {isLast ? "はじめる" : "次へ"}
            </button>
          </div>
        </div>
        <p className="intro-caption">{mate.name}たちが、今日の小さなもくもくを一緒に見守ります。</p>
      </section>
    </div>
  );
}

const PAGE_GUIDES: Record<PageGuideId, Array<{
  title: string;
  body: string;
  mateId: MateId;
  points: string[];
}>> = {
  quests: [
    {
      title: "クエストは今週の小さな約束",
      body: "思いつく行動を追加するか、おまかせガチャで候補を置きます。数は多くなくて大丈夫です。",
      mateId: "kamekichi",
      points: ["追加で自分のクエストを書く", "おまかせガチャで候補を足す", "いらないものは削除してOK"],
    },
    {
      title: "終わったら左の丸を押す",
      body: "クエストの左にあるチェックボタンが達成ボタンです。押すと完了になり、累計達成数が増えます。",
      mateId: "usamaru",
      points: ["左の丸いボタンで達成", "間違えたらキャンセルで戻せる", "達成数がチケット獲得につながる"],
    },
    {
      title: "週が終わったら組み直す",
      body: "週の締め日を過ぎるとふりかえりが出ます。新しい週にするか、未完了だけ残すかを選べます。",
      mateId: "kamekichi",
      points: ["締め日は設定で変更できる", "未完了を残してもいい", "保存済みクエストはあとから戻せる"],
    },
  ],
  tickets: [
    {
      title: "チケットは達成のごほうび",
      body: "クエストを一定数達成すると、設定したチケットが増えます。最初から自分で作っても、候補を足してもOKです。",
      mateId: "kamekichi",
      points: ["必要な達成回数を決める", "繰り返し獲得もできる", "今の進み具合が一覧に出る"],
    },
    {
      title: "所持中になったら使える",
      body: "チケットを獲得すると一覧に所持枚数が出ます。使う時はチケット行の「使う」を押します。",
      mateId: "usamaru",
      points: ["所持中のチケットだけ使える", "使うとタイムラインに記録される", "使った分だけ枚数が減る"],
    },
    {
      title: "ごほうびは小さくていい",
      body: "チケットは自分を釣るためではなく、続いた分をちゃんと回収するためのものです。",
      mateId: "azamaru",
      points: ["お金を使わないごほうびでもOK", "休憩や切り上げもチケットになる", "無理なく続く条件に調整する"],
    },
  ],
};

function PageGuideDialog(props: { guideId: PageGuideId; onClose: () => void }) {
  const slides = PAGE_GUIDES[props.guideId];
  const [slideIndex, setSlideIndex] = useState(0);
  const slide = slides[slideIndex];
  const mate = mates[slide.mateId];
  const isLast = slideIndex === slides.length - 1;

  return (
    <div className="modal-backdrop intro-backdrop" role="presentation" onClick={props.onClose}>
      <section
        aria-labelledby="page-guide-title"
        aria-modal="true"
        className="intro-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button className="intro-close" onClick={props.onClose} type="button" aria-label="使い方を閉じる">
          閉じる
        </button>
        <div className="intro-slide-window">
          <article className="intro-slide">
            <AvatarImage className="intro-dialog-mate" imageSrc={mate.imageSrc} name={mate.name} />
            <div className="intro-copy">
              <span>{props.guideId === "quests" ? "クエストの使い方" : "チケットの使い方"}</span>
              <h2 id="page-guide-title">{slide.title}</h2>
              <p>{slide.body}</p>
            </div>
            <div className="intro-point-list">
              {slide.points.map((point) => (
                <div className="intro-point" key={point}>
                  <CheckIcon />
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
        <div className="intro-footer">
          <div className="intro-progress" aria-label={`使い方 ${slideIndex + 1} / ${slides.length}`}>
            {slides.map((item, index) => (
              <button
                aria-label={`${item.title}を見る`}
                className={index === slideIndex ? "selected" : ""}
                key={item.title}
                onClick={() => setSlideIndex(index)}
                type="button"
              />
            ))}
          </div>
          <div className="intro-actions">
            <button className="soft-button" disabled={slideIndex === 0} onClick={() => setSlideIndex((index) => Math.max(0, index - 1))} type="button">
              戻る
            </button>
            <button
              className="soft-button strong"
              onClick={isLast ? props.onClose : () => setSlideIndex((index) => Math.min(slides.length - 1, index + 1))}
              type="button"
            >
              {isLast ? "はじめる" : "次へ"}
            </button>
          </div>
        </div>
        <p className="intro-caption">{mate.name}が、操作の入口だけ案内します。</p>
      </section>
    </div>
  );
}

function NotificationPage(props: {
  notifications: AppNotification[];
  lastSeenAt?: string;
  onMateSelect: (mateId: MateId) => void;
}) {
  const lastSeenTime = props.lastSeenAt ? new Date(props.lastSeenAt).getTime() : 0;
  return (
    <section className="notification-page page-view" aria-label="通知">
      <div className="page-hero compact-hero">
        <AvatarImage className="page-mate" imageSrc={mates.usamaru.imageSrc} name={mates.usamaru.name} />
        <div>
          <h2>通知</h2>
          <p>メイトからの返信と、あなたの投稿へのいいねをまとめて確認できます。</p>
        </div>
        <div className="quest-summary">
          <strong>{props.notifications.length}</strong>
          <span>通知</span>
        </div>
      </div>

      <section className="content-card notification-card">
        {props.notifications.length > 0 ? props.notifications.map((item) => {
          const mate = mates[item.mateId];
          const unread = new Date(item.createdAt).getTime() > lastSeenTime;
          return (
            <article className={unread ? "notification-row unread" : "notification-row"} key={item.id}>
              <AvatarImage
                className="affinity-avatar"
                imageSrc={mate.imageSrc}
                name={mate.name}
                onClick={() => props.onMateSelect(mate.id)}
              />
              <div>
                <div className="notification-meta">
                  <strong>{mate.name}</strong>
                  <span>{item.type === "reply" ? "返信" : "いいね"}</span>
                  {unread && <em>新着</em>}
                </div>
                <p>{item.text}</p>
                {item.parentText && <small>{item.parentText}</small>}
              </div>
            </article>
          );
        }) : (
          <p className="empty-note">まだ通知はありません。作業を始めると、メイトが返信したり、たまにいいねしてくれます。</p>
        )}
      </section>
    </section>
  );
}

function SettingsPage(props: {
  backupInputRef: RefObject<HTMLInputElement | null>;
  message: string | null;
  notificationsEnabled: boolean;
  questWeekEndsOn: Weekday;
  onDisableNotifications: () => void;
  onEnableNotifications: () => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onQuestWeekEndsOnChange: (day: Weekday) => void;
  onResetData: () => void;
  onShowIntro: () => void;
  onRestartTutorial: () => void;
  onSkipTutorial: () => void;
}) {
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  return (
    <section className="settings-page page-view" aria-label="設定">
      <div className="page-hero compact-hero">
        <AvatarImage className="page-mate" imageSrc={mates.kamekichi.imageSrc} name={mates.kamekichi.name} />
        <div>
          <h2>設定</h2>
          <p>保存データ、通知、チュートリアルを管理します。</p>
        </div>
      </div>

      {props.message && (
        <div className="settings-message" role="status">
          {props.message}
        </div>
      )}

      <section className="content-card settings-card">
        <div className="card-heading">
          <div>
            <h3>週クエスト</h3>
            <p>週クエストは、選んだ曜日の23:59までを今週として扱います。</p>
          </div>
        </div>
        <label className="settings-field">
          <span>週の締め日</span>
          <select
            value={props.questWeekEndsOn}
            onChange={(event) => props.onQuestWeekEndsOnChange(Number(event.target.value) as Weekday)}
          >
            {WEEKDAY_OPTIONS.map((day) => (
              <option key={day.value} value={day.value}>{day.label}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="content-card settings-card">
        <div className="card-heading">
          <div>
            <h3>バックアップ</h3>
            <p>保存データを書き出して、別のブラウザや初期化後に復元できます。</p>
          </div>
        </div>
        <div className="settings-action-row">
          <button className="soft-button strong" onClick={props.onExportBackup} type="button">
            バックアップを書き出す
          </button>
          <button className="soft-button" onClick={() => props.backupInputRef.current?.click()} type="button">
            バックアップを読み込む
          </button>
          <input
            accept="application/json,.json"
            className="hidden-file-input"
            ref={props.backupInputRef}
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onImportBackup(file);
            }}
          />
        </div>
      </section>

      <section className="content-card settings-card">
        <div className="card-heading">
          <div>
            <h3>ブラウザ通知</h3>
            <p>タイマー終了時に、別タブや別アプリの上にも通知します。</p>
          </div>
          <strong className={props.notificationsEnabled ? "settings-status enabled" : "settings-status"}>
            {props.notificationsEnabled ? "ON" : "OFF"}
          </strong>
        </div>
        <div className="settings-action-row">
          {props.notificationsEnabled ? (
            <button className="soft-button" onClick={props.onDisableNotifications} type="button">
              通知をオフにする
            </button>
          ) : (
            <button className="soft-button strong" onClick={props.onEnableNotifications} type="button">
              通知をオンにする
            </button>
          )}
        </div>
      </section>

      <section className="content-card settings-card">
        <div className="card-heading">
          <div>
            <h3>はじめてガイド</h3>
            <p>初回スライドを見返したり、ホーム上のチュートリアルをもう一度表示できます。</p>
          </div>
        </div>
        <div className="settings-action-row">
          <button className="soft-button strong" onClick={props.onShowIntro} type="button">
            はじめのスライドを見る
          </button>
          <button className="soft-button" onClick={props.onSkipTutorial} type="button">
            チュートリアルを完了扱いにする
          </button>
          <button className="soft-button" onClick={props.onRestartTutorial} type="button">
            チュートリアルをもう一度見る
          </button>
        </div>
      </section>

      <section className="content-card danger-card">
        <div className="card-heading">
          <div>
            <h3>データ削除</h3>
            <p>投稿、作業記録、クエスト、チケット、メイトとの距離を初期状態に戻します。</p>
          </div>
        </div>
        {deleteStep === 0 && (
          <button className="danger-button" onClick={() => setDeleteStep(1)} type="button">
            データ削除を開始
          </button>
        )}
        {deleteStep === 1 && (
          <div className="delete-confirm-box">
            <strong>本当に削除しますか？</strong>
            <p>この操作は保存済みデータを消します。まだ実行されていません。</p>
            <div className="form-actions">
              <button className="soft-button" onClick={() => setDeleteStep(0)} type="button">キャンセル</button>
              <button className="danger-button" onClick={() => setDeleteStep(2)} type="button">次の確認へ</button>
            </div>
          </div>
        )}
        {deleteStep === 2 && (
          <div className="delete-confirm-box final">
            <strong>最終確認</strong>
            <p>押すとすぐに初期化します。戻す機能はありません。</p>
            <div className="form-actions">
              <button className="soft-button" onClick={() => setDeleteStep(0)} type="button">やめる</button>
              <button className="danger-button" onClick={props.onResetData} type="button">完全に削除する</button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}

function QuestPage(props: {
  customQuests: QuestTemplate[];
  latestReward: string | null;
  questCompletionCount: number;
  questDraft: QuestDraft;
  questEditorOpen: boolean;
  ticketDefinitions: TicketDefinition[];
  weeklyQuests: WeeklyQuest[];
  onAddCustomQuestToWeek: (quest: QuestTemplate) => void;
  onCancelWeeklyQuestCustomization: () => void;
  onCompleteQuest: (questId: string) => void;
  onDeleteQuest: (questId: string) => void;
  onEditQuest: (quest: QuestTemplate) => void;
  onFillWeeklyQuests: () => void;
  onOpenNewQuestEditor: () => void;
  onQuestDraftChange: (draft: QuestDraft) => void;
  onReplaceWeeklyQuest: (questId: string) => void;
  onResetWeeklyQuests: () => void;
  onSaveWeeklyQuestCustomization: () => void;
  onSaveQuest: () => void;
  onStartNewWeek: (carryOpen: boolean) => void;
  onStartWeeklyQuestCustomization: (quest: WeeklyQuest) => void;
  onUndoQuestCompletion: (questId: string) => void;
  onOpenGuide: () => void;
  customizingQuestId: string | null;
  questWeekStartedAt: string;
  questWeekEndsOn: Weekday;
}) {
  const completedThisWeek = props.weeklyQuests.filter((quest) => quest.completedAt).length;
  const { weekStart, weekEnd } = getQuestWeekPeriod(props.questWeekStartedAt, props.questWeekEndsOn);
  const daysLeft = Math.max(0, Math.ceil((weekEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const nextTicket = props.ticketDefinitions
    .filter((ticket) => ticket.enabled)
    .sort((a, b) => nextTicketProgress(a, props.questCompletionCount).remaining - nextTicketProgress(b, props.questCompletionCount).remaining)[0];
  const progress = nextTicket ? nextTicketProgress(nextTicket, props.questCompletionCount) : null;
  const openQuests = props.weeklyQuests.filter((quest) => !quest.completedAt);
  const completedQuests = props.weeklyQuests.filter((quest) => quest.completedAt);
  const weekExpired = Date.now() >= weekEnd.getTime();
  const questDialogTitle = props.customizingQuestId || props.questDraft.id ? "クエストを編集" : "クエストを追加";

  return (
    <section className="quest-page page-view" aria-label="クエスト">
      <div className="page-hero">
        <AvatarImage className="page-mate" imageSrc={mates.kamekichi.imageSrc} name={mates.kamekichi.name} />
        <div>
          <h2>クエストボード</h2>
          <p>今週やることを、好きな数だけ並べます。</p>
        </div>
        <button className="soft-button" onClick={props.onOpenGuide} type="button">
          使い方
        </button>
        <div className="quest-summary">
          <strong>{props.weeklyQuests.length}</strong>
          <span>今週のクエスト</span>
        </div>
        <div className="quest-summary">
          <strong>{completedThisWeek}</strong>
          <span>完了</span>
        </div>
      </div>

      {props.latestReward && (
        <div className="reward-note">
          <strong>{props.latestReward}</strong>
          <span>ごほうびは、受け取って大丈夫。</span>
        </div>
      )}

      {weekExpired && props.weeklyQuests.length > 0 && (
        <section className="content-card week-review-card">
          <div className="card-heading">
            <div>
              <h3>週のふりかえり</h3>
              <p>{formatShortDate(weekStart)} - {formatShortDate(weekEnd)} のクエスト期間が終わりました。</p>
              <div className="quest-inline-stats">
                <span>{completedQuests.length}件 達成</span>
                <span>{openQuests.length}件 未完了</span>
              </div>
            </div>
            <div className="quest-heading-actions">
              <button className="soft-button strong" onClick={() => props.onStartNewWeek(false)} type="button">
                新しい週を始める
              </button>
              <button className="soft-button" onClick={() => props.onStartNewWeek(true)} type="button">
                未完了を残す
              </button>
            </div>
          </div>
          <div className="review-complete-list">
            {completedQuests.length > 0 ? completedQuests.map((quest) => (
              <span key={quest.id}>{quest.title}</span>
            )) : (
              <span>達成したクエストはまだありません。</span>
            )}
          </div>
        </section>
      )}

      <div className="quest-layout">
        <div className="quest-main-column">
          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>今週のクエスト</h3>
                <p>追加、編集、達成をここで扱います。</p>
                <div className="quest-inline-stats">
                  <span>{openQuests.length}件 未完了</span>
                  <span>{completedThisWeek}件 完了</span>
                  <span>残り{daysLeft}日</span>
                  {nextTicket && progress ? (
                    <span>{nextTicket.name}まであと{progress.remaining}クエスト</span>
                  ) : (
                    <span>累計{props.questCompletionCount}件</span>
                  )}
                </div>
              </div>
              <div className="quest-heading-actions">
                <button className="soft-button strong" onClick={props.onOpenNewQuestEditor} type="button">追加</button>
                <button className="soft-button" onClick={props.onFillWeeklyQuests} type="button">おまかせガチャ</button>
              </div>
            </div>

            <div className="weekly-board">
              {props.weeklyQuests.length === 0 ? (
                <div className="quest-empty-state">
                  <strong>まずは1つ追加する</strong>
                  <p>浮かばない時は候補を足せます。</p>
                  <div className="form-actions">
                    <button className="soft-button strong" onClick={props.onOpenNewQuestEditor} type="button">追加</button>
                    <button className="soft-button" onClick={props.onFillWeeklyQuests} type="button">おまかせガチャ</button>
                  </div>
                </div>
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
                      <span>{quest.source === "custom" ? "自分で入力" : "おまかせ候補"}</span>
                    </div>
                    <div className="quest-row-tools">
                      {quest.completedAt ? (
                        <button
                          className="swap-button"
                          onClick={() => props.onUndoQuestCompletion(quest.id)}
                          type="button"
                        >
                          キャンセル
                        </button>
                      ) : (
                        <>
                          <button
                            className="swap-button"
                            onClick={() => props.onStartWeeklyQuestCustomization(quest)}
                            type="button"
                          >
                            編集
                          </button>
                          <button
                            className="swap-button"
                            onClick={() => props.onReplaceWeeklyQuest(quest.id)}
                            type="button"
                          >
                            ガチャ
                          </button>
                        </>
                      )}
                      <button
                        className="swap-button danger-light"
                        onClick={() => props.onDeleteQuest(quest.id)}
                        type="button"
                      >
                        削除
                      </button>
                    </div>
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
                <h3>保存済みクエスト</h3>
                <p>よく使う行動は、ここから今週に戻せます。</p>
              </div>
            </div>
            {props.customQuests.length > 0 ? (
              <div className="saved-list">
                {props.customQuests.map((quest) => (
                  <div className="saved-row" key={quest.id}>
                    <div>
                      <strong>{quest.title}</strong>
                      <span>{quest.source === "custom" ? "自分で入力" : "おまかせ候補"}</span>
                    </div>
                    <div>
                      <button onClick={() => props.onAddCustomQuestToWeek(quest)} type="button">今週へ</button>
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
                <h3>週の組み直し</h3>
                <p>今週の枠だけを空にします。保存済みクエストと達成記録は残ります。</p>
              </div>
            </div>
            <button className="soft-button" onClick={props.onResetWeeklyQuests} type="button">今週の枠を空にする</button>
          </section>
        </aside>
      </div>
      {props.questEditorOpen && (
        <div className="modal-backdrop" role="presentation" onClick={props.onCancelWeeklyQuestCustomization}>
          <section className="quest-editor-dialog" role="dialog" aria-modal="true" aria-label={questDialogTitle} onClick={(event) => event.stopPropagation()}>
            <div className="card-heading">
              <div>
                <h3>{questDialogTitle}</h3>
                <p>クエスト名だけを書けばOKです。</p>
              </div>
            </div>
            <div className="inline-form roomy">
              <input
                autoFocus
                onChange={(event) => props.onQuestDraftChange({ ...props.questDraft, title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  props.customizingQuestId ? props.onSaveWeeklyQuestCustomization() : props.onSaveQuest();
                }}
                placeholder="例: 猫の水皿を洗う"
                value={props.questDraft.title}
              />
              <div className="form-actions">
                <button
                  className="soft-button strong"
                  onClick={props.customizingQuestId ? props.onSaveWeeklyQuestCustomization : props.onSaveQuest}
                  type="button"
                >
                  保存
                </button>
                <button className="soft-button" onClick={props.onCancelWeeklyQuestCustomization} type="button">キャンセル</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function TicketPage(props: {
  latestReward: string | null;
  questCompletionCount: number;
  ticketDefinitions: TicketDefinition[];
  ticketDraft: TicketDraft;
  ticketEditorOpen: boolean;
  ticketInventory: AppState["ticketInventory"];
  weeklyQuests: WeeklyQuest[];
  onCancelTicketEdit: () => void;
  onDeleteTicket: (ticketId: string) => void;
  onEditTicket: (ticket: TicketDefinition) => void;
  onOpenNewTicketEditor: () => void;
  onSaveTicket: () => void;
  onSuggestTicket: () => void;
  onTicketDraftChange: (draft: TicketDraft) => void;
  onUseTicket: (ticketId: string) => void;
  onOpenGuide: () => void;
}) {
  const completedThisWeek = props.weeklyQuests.filter((quest) => quest.completedAt).length;
  const enabledTickets = props.ticketDefinitions.filter((ticket) => ticket.enabled);
  const nextTicket = enabledTickets
    .sort((a, b) => nextTicketProgress(a, props.questCompletionCount).remaining - nextTicketProgress(b, props.questCompletionCount).remaining)[0];
  const progress = nextTicket ? nextTicketProgress(nextTicket, props.questCompletionCount) : null;
  const totalOwned = enabledTickets.reduce((sum, ticket) => sum + (props.ticketInventory[ticket.id] ?? 0), 0);
  const ticketDialogTitle = props.ticketDraft.id ? "チケットを編集" : "チケットを追加";

  return (
    <section className="ticket-page page-view" aria-label="チケット">
      <div className="page-hero">
        <AvatarImage className="page-mate" imageSrc={mates.kamekichi.imageSrc} name={mates.kamekichi.name} />
        <div>
          <h2>ごほうびチケット</h2>
          <p>チケットも自分で決めます。思いつかない時だけ候補を足せます。</p>
        </div>
        <button className="soft-button" onClick={props.onOpenGuide} type="button">
          使い方
        </button>
        <div className="quest-summary">
          <strong>{totalOwned}</strong>
          <span>所持チケット</span>
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

      <div className="ticket-layout single-column">
        <div className="ticket-main-column">
          <section className="content-card">
            <div className="card-heading">
              <div>
                <h3>チケット一覧</h3>
                <p>追加、編集、使用をここで扱います。</p>
                <div className="quest-inline-stats">
                  <span>{enabledTickets.length}件 登録</span>
                  <span>{totalOwned}枚 所持</span>
                  <span>今週{completedThisWeek}件 完了</span>
                  {nextTicket && progress ? (
                    <span>{nextTicket.name}まであと{progress.remaining}クエスト</span>
                  ) : (
                    <span>累計{props.questCompletionCount}件</span>
                  )}
                </div>
              </div>
              <div className="quest-heading-actions">
                <button className="soft-button strong" onClick={props.onOpenNewTicketEditor} type="button">追加</button>
                <button className="soft-button" onClick={props.onSuggestTicket} type="button">おまかせガチャ</button>
              </div>
            </div>
            <div className="ticket-list roomy">
              {enabledTickets.length === 0 ? (
                <div className="quest-empty-state">
                  <strong>まずは1つ追加する</strong>
                  <p>浮かばない時は候補を足せます。</p>
                  <div className="form-actions">
                    <button className="soft-button strong" onClick={props.onOpenNewTicketEditor} type="button">追加</button>
                    <button className="soft-button" onClick={props.onSuggestTicket} type="button">おまかせガチャ</button>
                  </div>
                </div>
              ) : enabledTickets.map((ticket) => {
                const count = props.ticketInventory[ticket.id] ?? 0;
                const ticketProgress = nextTicketProgress(ticket, props.questCompletionCount);
                return (
                  <div className={count > 0 ? "ticket-row owned" : "ticket-row"} key={ticket.id}>
                    <div>
                      <div className="ticket-title-line">
                        <strong>{ticket.name}{count > 0 ? ` ×${count}` : ""}</strong>
                        <em className={count > 0 ? "ticket-state owned" : "ticket-state"}>
                          {count > 0 ? "所持中" : "登録済み・未所持"}
                        </em>
                      </div>
                      <span>{ticket.description}</span>
                      {ticket.costMemo && <small>{ticket.costMemo}</small>}
                      <small>
                        {count > 0
                          ? "使えるチケット"
                          : `${ticketProgress.progress} / ${ticketProgress.needed} ・ あと${ticketProgress.remaining}クエスト`}
                      </small>
                    </div>
                    <div className="ticket-row-actions">
                      {count > 0 && <button onClick={() => props.onUseTicket(ticket.id)} type="button">使う</button>}
                      <button onClick={() => props.onEditTicket(ticket)} type="button">編集</button>
                      <button className="danger-light" onClick={() => props.onDeleteTicket(ticket.id)} type="button">削除</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      {props.ticketEditorOpen && (
        <div className="modal-backdrop" role="presentation" onClick={props.onCancelTicketEdit}>
          <section className="quest-editor-dialog ticket-editor-dialog" role="dialog" aria-modal="true" aria-label={ticketDialogTitle} onClick={(event) => event.stopPropagation()}>
            <div className="card-heading">
              <div>
                <h3>{ticketDialogTitle}</h3>
                <p>名前と条件だけ決めればOKです。</p>
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
              <label className="field-label">
                <span>必要なクエスト達成回数</span>
                <input
                  min={1}
                  max={99}
                  onChange={(event) => props.onTicketDraftChange({ ...props.ticketDraft, requiredCompletions: Number(event.target.value) })}
                  type="number"
                  value={props.ticketDraft.requiredCompletions}
                />
              </label>
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
                保存
              </button>
              <button className="soft-button" onClick={props.onCancelTicketEdit} type="button">キャンセル</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

function AchievementPage(props: {
  mateAffinity: AppState["mateAffinity"];
  sessions: TaskSession[];
  onDeleteSession: (sessionId: string) => void;
  onEditSession: (sessionId: string, category: TaskCategory, result: TaskResult) => void;
  onMateSelect: (mateId: MateId) => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<TaskCategory>("organize");
  const [editResult, setEditResult] = useState<TaskResult>("complete");
  type DayActivity = {
    count: number;
    categories: Record<TaskCategory, number>;
    entries: { title: string; category: TaskCategory; date: Date }[];
  };
  const activityByDate = new Map<string, DayActivity>();
  const addActivity = (
    dateLike: string | undefined,
    category: TaskCategory,
    title: string,
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
    current.entries.push({ title, category, date: new Date(dateLike) });
    activityByDate.set(key, current);
  };

  for (const session of props.sessions) {
    if (session.endedAt && session.result) {
      addActivity(session.endedAt, session.category, `${categoryLabel(session.category)} ${resultLabels[session.result]}`);
    }
  }

  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const activityDates = [...activityByDate.values()].flatMap((activity) => activity.entries.map((entry) => entry.date));
  const oldestActivityMonth = activityDates.length > 0
    ? new Date(
        Math.min(...activityDates.map((date) => new Date(date.getFullYear(), date.getMonth(), 1).getTime())),
      )
    : currentMonth;
  const monthStart = visibleMonth;
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
      inMonth: date.getMonth() === monthStart.getMonth() && date.getFullYear() === monthStart.getFullYear(),
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
  const recentSessions = props.sessions
    .filter((session): session is TaskSession & { endedAt: string; result: TaskResult } => Boolean(session.endedAt && session.result))
    .sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime())
    .slice(0, 5);
  const canGoPrevious = monthStart.getTime() > oldestActivityMonth.getTime();
  const canGoNext = monthStart.getTime() < currentMonth.getTime();
  const moveMonth = (amount: number) => {
    setVisibleMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + amount);
      return new Date(next.getFullYear(), next.getMonth(), 1);
    });
  };
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
          <p>月ごとのもくもく作業記録を、カレンダーで見返せます。</p>
        </div>
        <div className="quest-summary">
          <strong>{totalActivity}</strong>
          <span>表示月の記録</span>
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
              <h3>{formatMonthTitle(monthStart)}</h3>
              <p>日付ごとにもくもくの件数とカテゴリを表示します。</p>
            </div>
            <div className="calendar-actions">
              <button className="soft-button" disabled={!canGoPrevious} onClick={() => moveMonth(-1)} type="button">前の月</button>
              <button className="soft-button" disabled={!canGoNext} onClick={() => moveMonth(1)} type="button">次の月</button>
              <div className="streak-box">
                <strong>{streak}</strong>
                <span>連続記録日</span>
              </div>
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
                <p>表示月でよく進んだカテゴリ</p>
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
              {recentSessions.length > 0 ? recentSessions.map((session) => (
                <div className="recent-achievement-row editable" key={session.id}>
                  {editingSessionId === session.id ? (
                    <>
                      <span>{formatShortDate(new Date(session.endedAt))}</span>
                      <div className="record-edit-fields">
                        <select value={editCategory} onChange={(event) => setEditCategory(event.target.value as TaskCategory)}>
                          {categories.map((item) => (
                            <option key={item.id} value={item.id}>{item.conceptLabel}</option>
                          ))}
                        </select>
                        <select value={editResult} onChange={(event) => setEditResult(event.target.value as TaskResult)}>
                          {RECORD_RESULT_OPTIONS.map((result) => (
                            <option key={result} value={result}>{resultLabels[result]}</option>
                          ))}
                        </select>
                      </div>
                      <div className="record-row-actions">
                        <button
                          className="swap-button"
                          onClick={() => {
                            props.onEditSession(session.id, editCategory, editResult);
                            setEditingSessionId(null);
                          }}
                          type="button"
                        >
                          保存
                        </button>
                        <button className="swap-button" onClick={() => setEditingSessionId(null)} type="button">
                          やめる
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span>{formatShortDate(new Date(session.endedAt))}</span>
                      <strong>{categoryLabel(session.category)} {resultLabels[session.result]}</strong>
                      <div className="record-row-actions">
                        <button
                          className="swap-button"
                          onClick={() => {
                            setEditingSessionId(session.id);
                            setEditCategory(session.category);
                            setEditResult(session.result);
                          }}
                          type="button"
                        >
                          編集
                        </button>
                        <button className="swap-button danger-light" onClick={() => props.onDeleteSession(session.id)} type="button">
                          削除
                        </button>
                      </div>
                    </>
                  )}
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
  const displayValue = displayAffinity(value);
  const affinityTier = getAffinityTier(displayValue);
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
        <div className="profile-head simple">
          <AvatarImage className="profile-avatar" imageSrc={mate.imageSrc} name={mate.name} />
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
              <strong>{affinityTier.label}</strong>
              <small>メイトとの距離</small>
            </div>
            <div className="affinity-track">
              <div style={{ width: `${Math.min(100, displayValue * 5)}%` }} />
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
  pomodoroCycle: number;
  remainingSeconds: number;
  progressPercent: number;
  session?: TaskSession;
  timerMode: TimerMode;
  onCategoryChange: (category: TaskCategory) => void;
  onDurationChange: (duration: number) => void;
  onFinishBreak: () => void;
  onExtend: () => void;
  onMateSelect: (mateId: MateId) => void;
  onPauseToggle: () => void;
  onRecord: (result: TaskResult) => void;
  onStart: () => void;
  onTimerModeChange: (mode: TimerMode) => void;
}) {
  const timerMate = mates[props.session ? supportMateForCategory(props.session.category) : supportMateForCategory(props.category)];
  const visibleTitle = props.session ? categoryLabel(props.session.category) : categoryLabel(props.category);
  const timeUp = Boolean(props.session && props.remainingSeconds === 0);
  const isPomodoro = props.timerMode === "pomodoro";
  const isBreak = (props.session?.kind ?? "task") === "break";
  const isPaused = Boolean(props.session?.pausedAt);
  const nextBreakPhase = getPomodoroBreakPhase(props.session?.pomodoroCycle ?? props.pomodoroCycle);
  const phaseLabel = props.session?.pomodoroPhase
    ? getPomodoroPhaseLabel(props.session.pomodoroPhase)
    : isPomodoro
      ? `集中 ${props.pomodoroCycle}/${POMODORO_LONG_BREAK_INTERVAL}`
      : "自由タイマー";
  const standbyMinutes = isPomodoro ? POMODORO_DURATIONS.focus : props.duration;
  const [visibleCategoryHelp, setVisibleCategoryHelp] = useState<TaskCategory | null>(null);

  return (
    <section className="start-card">
      <div className="panel-block">
        <div className="mode-toggle" role="group" aria-label="タイマーモード">
          <button
            className={props.timerMode === "free" ? "selected" : ""}
            disabled={props.active}
            onClick={() => props.onTimerModeChange("free")}
            type="button"
          >
            通常
          </button>
          <button
            className={props.timerMode === "pomodoro" ? "selected" : ""}
            disabled={props.active}
            onClick={() => props.onTimerModeChange("pomodoro")}
            type="button"
          >
            ポモドーロ
          </button>
        </div>
        <div className="quick-start-head">
          <div>
            <h3 className="panel-heading">{isPomodoro ? "ポモドーロ" : "時間をえらぶ"}</h3>
            <p className="field-note">
              {props.session
                ? `${phaseLabel}: ${visibleTitle}`
                : isPomodoro
                  ? `${categoryLabel(props.category)}を25分集中。終わったら${getPomodoroPhaseLabel(nextBreakPhase)}へ。`
                  : `${categoryLabel(props.category)}を${props.duration}分だけ始めます。`}
              {props.session && <span className="status-badge">進行中</span>}
            </p>
          </div>
          <button className="primary-button compact" disabled={props.active} onClick={props.onStart} type="button">
            <PlayIcon />
            {isPomodoro ? "集中スタート" : "スタート"}
          </button>
        </div>
        {isPomodoro ? (
          <div className="pomodoro-plan" aria-label="ポモドーロの流れ">
            <span className="selected">集中 25分</span>
            <span>短い休憩 5分</span>
            <span>4回目は長い休憩 15分</span>
          </div>
        ) : (
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
        )}
      </div>

      <div className={[timeUp ? "timer-face timer-face-timeup" : "timer-face", isBreak ? "timer-face-break" : ""].filter(Boolean).join(" ")}>
        <AvatarImage className="timer-mate" imageSrc={timerMate.imageSrc} name={timerMate.name} />
        <span className="timer-time">
          {props.session ? formatClock(props.remainingSeconds) : formatClock(standbyMinutes * 60)}
        </span>
        <div className="timer-note">
          <div className="timer-progress" aria-label="作業の進み具合" role="progressbar">
            <div style={{ width: `${props.session ? props.progressPercent : 0}%` }} />
          </div>
          <p>
            {timeUp
              ? isBreak ? "休憩おしまい。次の集中へ戻ろう。" : "時間だよ。できたら結果をえらんでね。"
              : props.session
                ? isPaused ? "一時停止中。再開すると続きから進みます。" : isBreak ? "休憩中。少し離れて大丈夫。" : "メイトが見守り中。"
                : isPomodoro ? `次はポモドーロ${props.pomodoroCycle}回目。` : "よーい、もくもく。"}
          </p>
        </div>
      </div>

      {props.session && (
        <div className="timer-actions" aria-label="タイマー操作">
          <button className="soft-button" onClick={props.onPauseToggle} type="button">
            {isPaused ? "再開" : "一時停止"}
          </button>
          <button className="soft-button" onClick={props.onExtend} type="button">
            +5分
          </button>
        </div>
      )}

      <div className="result-panel">
        <h2>
          <span className="heading-mark" aria-hidden="true" />
          {isBreak ? "休憩がおわったら" : "おわったら記録"}
        </h2>
        {isBreak ? (
          <button className="primary-button break-finish-button" disabled={!props.session} onClick={props.onFinishBreak} type="button">
            <CheckIcon />
            休憩完了
          </button>
        ) : (
          <div className="result-grid" aria-label="結果を記録">
            {RECORD_RESULT_OPTIONS.map((result) => (
              <ResultButton
                disabled={!props.session}
                key={result}
                result={result}
                onRecord={props.onRecord}
              />
            ))}
          </div>
        )}
        <p>
          {isBreak
            ? timeUp ? "0:00になったら休憩完了を押して、次の集中へ。" : "休憩を切り上げる時もここから次へ進めます。"
            : timeUp ? "0:00になったら、いちばん近い結果を押して記録しよう。" : props.session ? "中断も記録に入ります。できた量より、戻れる足あとを残します。" : "スタートすると、ここからすぐ記録できます。"}
        </p>
      </div>

      <div className="panel-block secondary-block">
        <h3 className="panel-heading">カテゴリ</h3>
        <p className="field-note">よく使うカテゴリほど前に出ます。</p>
        <div className="category-grid" role="group" aria-label="作業カテゴリ">
          {props.categories.map((item) => {
            const mate = mates[supportMateForCategory(item.id)];
            const tooltipId = `category-help-${item.id}`;
            const visibleSubcategories = item.subcategories.slice(0, 3);
            const isHelpVisible = visibleCategoryHelp === item.id;
            const tooltipSide = props.categories.indexOf(item) % 2 === 0 ? "right" : "left";
            const tileClassName = [
              "category-tile",
              props.category === item.id ? "selected" : "",
              isHelpVisible ? "help-visible" : "",
              `tooltip-${tooltipSide}`,
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

function NotificationIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d="M7 10.5a5 5 0 0 1 10 0v4.2l2 2.4H5l2-2.4Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
      <path d="M10 20a2.3 2.3 0 0 0 4 0" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.9" />
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

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="nav-icon" viewBox="0 0 24 24">
      <path d="M12 8.3a3.7 3.7 0 1 1 0 7.4 3.7 3.7 0 0 1 0-7.4Z" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="m4.7 14.3-.8-1.3 1.8-2.1-.2-1.1-2.2-1 1-1.7 2.8.5.9-.7.4-2.8h3.2l.4 2.8.9.7 2.8-.5 1 1.7-2.2 1-.2 1.1 1.8 2.1-.8 1.3-2.7-.4-.9.7-.5 2.7H8.8l-.5-2.7-.9-.7Z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.55" />
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
          const displayValue = displayAffinity(value);
          const level = getAffinityTier(displayValue).label;
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
                  <div style={{ width: `${Math.min(100, displayValue * 5)}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResultButton(props: {
  disabled: boolean;
  result: TaskResult;
  onRecord: (result: TaskResult) => void;
}) {
  const resultCopy: Record<TaskResult, { note: string }> = {
    complete: { note: "予定どおり進んだ" },
    partial: { note: "少しでも触れた" },
    interrupted: { note: "いったん置いた" },
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
  nextTutorialStepId: TutorialStepId | null;
}) {
  const isUser = !isMateId(props.post.authorId);
  const mate = isMateId(props.post.authorId) ? mates[props.post.authorId] : null;
  const isFresh = props.now - new Date(props.post.createdAt).getTime() < 30 * 1000;
  const sortedReplies = [...props.replies].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const latestReplyAt = sortedReplies.length > 0 ? sortedReplies[sortedReplies.length - 1].createdAt : undefined;
  return (
    <article className={`post ${isUser ? "user-post" : "mate-post"} ${isFresh ? "fresh-post" : ""}`}>
      <PostBody
        post={props.post}
        mate={mate}
        onMateSelect={props.onMateSelect}
        onReact={props.onReact}
        replyCount={sortedReplies.length}
        latestReplyAt={latestReplyAt}
        fresh={isFresh}
        now={props.now}
        nextTutorialStepId={props.nextTutorialStepId}
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
              nextTutorialStepId={props.nextTutorialStepId}
              fresh={props.now - new Date(reply.createdAt).getTime() < 30 * 1000}
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
  nextTutorialStepId: TutorialStepId | null;
  fresh?: boolean;
  latestReplyAt?: string;
  replyCount?: number;
  reply?: boolean;
}) {
  const authorName = props.mate?.name ?? "あなた";
  const tutorialStep = props.post.tutorialStepId ? getTutorialStep(props.post.tutorialStepId) : undefined;
  const tutorialStepIndex = tutorialStep ? TUTORIAL_STEPS.findIndex((step) => step.id === tutorialStep.id) : -1;
  const isNextTutorialStep = Boolean(tutorialStep && tutorialStep.id === props.nextTutorialStepId);
  const kindLabel = timelinePostKindLabel(props.post, props.reply);
  const postTimeLabel = formatPostTime(props.post.createdAt, props.now);
  const latestReplyTimeLabel = props.latestReplyAt ? formatPostTime(props.latestReplyAt, props.now) : "";
  const shouldShowPostTime = !props.fresh;
  const shouldShowLatestReply = Boolean(
    !props.reply &&
      !props.fresh &&
      props.latestReplyAt &&
      props.now - new Date(props.latestReplyAt).getTime() >= 60 * 1000 &&
      latestReplyTimeLabel !== postTimeLabel,
  );
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
          <em className={`post-kind post-kind-${props.post.type}`}>{kindLabel}</em>
          {!props.reply && props.post.taskCategory && (
            <em className={`post-category post-category-${props.post.taskCategory}`}>
              {categoryConceptLabel(props.post.taskCategory)}
            </em>
          )}
          {!props.reply && props.post.type === "user_task_result" && props.post.taskResult && (
            <em className={`post-result post-result-${props.post.taskResult}`}>
              {resultLabels[props.post.taskResult]}
            </em>
          )}
          {props.fresh ? <em className="post-fresh">新着</em> : null}
          {shouldShowPostTime ? <span>{postTimeLabel}</span> : null}
          {shouldShowLatestReply && (
            <span className="post-activity">最終返信 {latestReplyTimeLabel}</span>
          )}
        </div>
        {tutorialStep && (
          <div className="tutorial-status">
            <span className={props.post.tutorialCompleted ? "done" : isNextTutorialStep ? "current" : ""}>
              {props.post.tutorialCompleted ? "完了" : isNextTutorialStep ? "次にやる" : `${tutorialStepIndex + 1}/${TUTORIAL_STEPS.length}`}
            </span>
            <strong>{tutorialStep.title}</strong>
          </div>
        )}
        <p>{props.post.text}</p>
        {props.post.mateLikes && props.post.mateLikes.length > 0 && (
          <div className="mate-like-strip" aria-label="メイトからのいいね">
            {props.post.mateLikes.slice(0, 3).map((mateId) => (
              <AvatarImage className="mini-like-avatar" imageSrc={mates[mateId].imageSrc} name={mates[mateId].name} key={mateId} />
            ))}
            <span>{formatMateLikeLabel(props.post.mateLikes)}</span>
          </div>
        )}
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
