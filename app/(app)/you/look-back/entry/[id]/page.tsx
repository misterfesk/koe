import { redirect } from "next/navigation";
import { requireViewer } from "@/server/viewer";

export default async function Page() {
  await requireViewer();
  redirect("/you/look-back");
}
