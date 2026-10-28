import { redirect } from "next/navigation";
import { getPlanDay } from "@/server/data/intake";
import { requireViewer } from "@/server/viewer";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const v = await requireViewer();
  const plan = await getPlanDay(v.db, v.user.id, v.today);
  if (plan?.items.some((i) => i.stepId === id))
    redirect("/today#entry-" + encodeURIComponent(id));
  redirect("/you/look-back/entry/" + encodeURIComponent(id));
}
