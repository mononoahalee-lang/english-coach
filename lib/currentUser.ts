import { prisma } from "@/lib/prisma";

// Defaults to the email of the Google account previously used to sign in,
// so existing check history/score/streak carry over now that login is gone.
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? "monono.ahalee@gmail.com";

let cachedUserId: string | null = null;

// Single-user app: no login screen, everything is scoped to one fixed
// "owner" user row that's created on first use.
export async function getCurrentUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const user = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    create: { email: OWNER_EMAIL, name: "You" },
    update: {},
  });
  cachedUserId = user.id;
  return user.id;
}
