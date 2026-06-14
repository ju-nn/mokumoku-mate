export type MateId =
  | "waniyan"
  | "kumaru"
  | "shibatarou"
  | "fukurou"
  | "nekosenpai"
  | "piyori"
  | "azamaru"
  | "usamaru"
  | "kamekichi";

export type TaskCategory =
  | "organize"
  | "housework"
  | "work"
  | "learning"
  | "writing"
  | "creative"
  | "care";

export type Trigger =
  | "app_open"
  | "task_start"
  | "progress"
  | "complete"
  | "partial"
  | "interrupted";

export type TimelinePostType =
  | "user_task_start"
  | "user_task_result"
  | "mate_monologue"
  | "mate_reply";

export type Reaction = "like" | null;

export type MonologueKind = "advice" | "self" | "thread";

export type MateComment = {
  id: string;
  mateId: MateId;
  category?: TaskCategory;
  replyToMateId?: MateId;
  trigger: Trigger;
  postType: "mate_monologue" | "mate_reply";
  monologueKind?: MonologueKind;
  text: string;
  weight?: number;
  minAffinity?: number;
};

export type TimelinePost = {
  id: string;
  type: TimelinePostType;
  authorId: "user" | MateId;
  text: string;
  createdAt: string;
  taskCategory?: TaskCategory;
  taskResult?: TaskResult;
  taskSessionId?: string;
  parentPostId?: string;
  reaction?: Reaction;
  mateLikes?: MateId[];
  tutorialStepId?: TutorialStepId;
  tutorialCompleted?: boolean;
};

export type TaskResult = "complete" | "partial" | "interrupted";

export type TimerMode = "free" | "pomodoro";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SessionKind = "task" | "break";

export type PomodoroPhase = "focus" | "short_break" | "long_break";

export type TaskSession = {
  id: string;
  category: TaskCategory;
  durationMinutes: number;
  startedAt: string;
  endedAt?: string;
  result?: TaskResult;
  kind?: SessionKind;
  timerMode?: TimerMode;
  pomodoroPhase?: PomodoroPhase;
  pomodoroCycle?: number;
  pausedAt?: string;
  pausedTotalSeconds?: number;
};

export type QuestSource = "custom" | "mate";

export type QuestTemplate = {
  id: string;
  title: string;
  source: QuestSource;
  enabled: boolean;
};

export type TodayQuest = {
  id: string;
  templateId?: string;
  title: string;
  source: QuestSource;
  createdAt: string;
  completedAt?: string;
};

export type WeeklyQuest = TodayQuest;

export type TicketDefinition = {
  id: string;
  name: string;
  requiredCompletions: number;
  description: string;
  costMemo?: string;
  repeatable: boolean;
  enabled: boolean;
};

export type TicketInventory = Record<string, number>;

export type QuestCompletionLog = {
  id: string;
  questId: string;
  title: string;
  source: QuestSource;
  completedAt: string;
};

export type MateProfile = {
  id: MateId;
  name: string;
  emoji: string;
  imageSrc: string;
  role: string;
  note: string;
  accent: string;
  profileId?: string;
  bio?: string;
  pinnedPost?: string;
  profileTags?: string[];
};

export type AppState = {
  version: 1;
  posts: TimelinePost[];
  sessions: TaskSession[];
  mateAffinity: Record<MateId, number>;
  categoryUseCounts: Record<TaskCategory, number>;
  customQuests: QuestTemplate[];
  todayQuests: TodayQuest[];
  weeklyQuests: WeeklyQuest[];
  questWeekStartedAt: string;
  questWeekEndsOn: Weekday;
  ticketDefinitions: TicketDefinition[];
  ticketInventory: TicketInventory;
  ticketAwardedCounts: Record<string, number>;
  questCompletionCount: number;
  questCompletionLog: QuestCompletionLog[];
  lastNotificationSeenAt?: string;
  introSeenAt?: string;
  tutorialProgress?: TutorialProgress;
  activeSessionId?: string;
  timerMode?: TimerMode;
  pomodoroCycle?: number;
  notificationsEnabled?: boolean;
};

export type TutorialStepId =
  | "profile"
  | "timeline_reaction"
  | "category"
  | "duration"
  | "start"
  | "result"
  | "notifications"
  | "quests"
  | "fill_quests"
  | "custom_quest"
  | "tickets"
  | "achievements"
  | "settings";

export type TutorialProgress = {
  completedStepIds: TutorialStepId[];
  finishedAt?: string;
};
