import { auth } from "@/server/auth";

async function handle(request: Request) {
  return (await auth()).handler(request);
}

export { handle as GET, handle as POST };
