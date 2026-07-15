export const POINTS_ACCEPTED = 2;
export const POINTS_IGNORED = 1;
export const CLEAN_SESSION_BONUS = 10;
export const CLEAN_SESSION_MIN_WORDS = 50;
export const STREAK_MILESTONE_BONUSES: Record<number, number> = { 7: 25, 30: 100 };

function utcDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isSameUtcDay(a: Date, b: Date): boolean {
  return utcDayString(a) === utcDayString(b);
}

export function isNextUtcDay(prev: Date, next: Date): boolean {
  const prevDay = new Date(`${utcDayString(prev)}T00:00:00.000Z`);
  const nextDay = new Date(`${utcDayString(next)}T00:00:00.000Z`);
  const diffDays = (nextDay.getTime() - prevDay.getTime()) / 86_400_000;
  return diffDays === 1;
}

export interface StreakUpdateInput {
  lastCheckDate: Date | null;
  currentStreak: number;
  longestStreak: number;
  now: Date;
}

export interface StreakUpdateResult {
  currentStreak: number;
  longestStreak: number;
  streakBonusPoints: number;
  streakChanged: boolean;
}

/** Note: streak days are calendar days in UTC, a known MVP simplification. */
export function computeStreakUpdate({
  lastCheckDate,
  currentStreak,
  longestStreak,
  now,
}: StreakUpdateInput): StreakUpdateResult {
  if (lastCheckDate && isSameUtcDay(lastCheckDate, now)) {
    return { currentStreak, longestStreak, streakBonusPoints: 0, streakChanged: false };
  }

  const nextStreak =
    lastCheckDate && isNextUtcDay(lastCheckDate, now) ? currentStreak + 1 : 1;

  return {
    currentStreak: nextStreak,
    longestStreak: Math.max(longestStreak, nextStreak),
    streakBonusPoints: STREAK_MILESTONE_BONUSES[nextStreak] ?? 0,
    streakChanged: true,
  };
}

export function computeCleanSessionBonus(wordCount: number, errorCount: number): number {
  return wordCount >= CLEAN_SESSION_MIN_WORDS && errorCount === 0 ? CLEAN_SESSION_BONUS : 0;
}

export function pointsForReview(status: "ACCEPTED" | "IGNORED"): number {
  return status === "ACCEPTED" ? POINTS_ACCEPTED : POINTS_IGNORED;
}

export interface BadgeCheckInput {
  totalSessionsCount: number;
  totalErrorsReviewed: number;
  currentStreak: number;
  cleanSession: boolean;
  alreadyEarned: ReadonlySet<string>;
}

export function evaluateNewBadges({
  totalSessionsCount,
  totalErrorsReviewed,
  currentStreak,
  cleanSession,
  alreadyEarned,
}: BadgeCheckInput): string[] {
  const earned: string[] = [];
  const maybeAward = (key: string, condition: boolean) => {
    if (condition && !alreadyEarned.has(key)) earned.push(key);
  };

  maybeAward("FIRST_CHECK", totalSessionsCount >= 1);
  maybeAward("CORRECTIONS_10", totalErrorsReviewed >= 10);
  maybeAward("CORRECTIONS_100", totalErrorsReviewed >= 100);
  maybeAward("STREAK_3", currentStreak >= 3);
  maybeAward("STREAK_7", currentStreak >= 7);
  maybeAward("STREAK_30", currentStreak >= 30);
  maybeAward("CLEAN_SWEEP", cleanSession);

  return earned;
}
