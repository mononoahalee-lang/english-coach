import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import PracticeClient from "./PracticeClient";

export default async function PracticePage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PracticeClient />
    </div>
  );
}
