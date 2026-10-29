import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { enterDemo } from "@/server/demo";

/** Local only: the guards live in `enterDemo`, so a hosted app answers 404. */
export async function GET(request: Request) {
  return enterDemo(request, async () => ({
    db: await db(),
    auth: await auth(),
  }));
}
