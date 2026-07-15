import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import CheckClient from "./CheckClient";

export default async function CheckPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <CheckClient />
    </div>
  );
}
