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
  | "interrupted"
  | "failed";

export type TimelinePostType =
  | "user_task_start"
  | "user_task_result"
  | "mate_monologue"
  | "mate_reply";

export type Reaction = "like" | null;

export type MateComment = {
  id: string;
  mateId: MateId;
  category?: TaskCategory;
  trigger: Trigger;
  postType: "mate_monologue" | "mate_reply";
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
  taskSessionId?: string;
  parentPostId?: string;
  reaction?: Reaction;
};

export type TaskResult = "complete" | "partial" | "interrupted" | "failed";

export type TaskSession = {
  id: string;
  category: TaskCategory;
  durationMinutes: number;
  startedAt: string;
  endedAt?: string;
  result?: TaskResult;
};

export type QuestSource = "custom" | "mate";

export type QuestTemplate = {
  id: string;
  title: string;
  minutes: number;
  category: TaskCategory;
  source: QuestSource;
  suggestedBy?: MateId;
  enabled: boolean;
};

export type TodayQuest = {
  id: string;
  templateId?: string;
  title: string;
  minutes: number;
  category: TaskCategory;
  source: QuestSource;
  suggestedBy?: MateId;
  createdAt: string;
  completedAt?: string;
};

export type WeeklyQuest = TodayQuest;

export type TicketDefinition = {
  id: string;
  name: string;
  requiredCompletions: number;
  description: string;
  category: TaskCategory;
  costMemo?: string;
  repeatable: boolean;
  enabled: boolean;
};

export type TicketInventory = Record<string, number>;

export type QuestCompletionLog = {
  id: string;
  questId: string;
  title: string;
  category: TaskCategory;
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
  ticketDefinitions: TicketDefinition[];
  ticketInventory: TicketInventory;
  ticketAwardedCounts: Record<string, number>;
  questCompletionCount: number;
  questCompletionLog: QuestCompletionLog[];
  activeSessionId?: string;
};
