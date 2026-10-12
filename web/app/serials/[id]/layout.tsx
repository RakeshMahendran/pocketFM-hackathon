import { ShowTabs } from "@/components/StudioNav";
import { loadSerial } from "@/lib/serials";
import { requireEditor } from "@/lib/session";

export default async function ShowLayout({ children, params }: LayoutProps<"/serials/[id]">) {
  await requireEditor();
  const { id } = await params;
  const storyId = decodeURIComponent(id);
  const serial = await loadSerial(storyId);
  return <>{serial && <ShowTabs storyId={storyId} title={serial.title} />}{children}</>;
}
