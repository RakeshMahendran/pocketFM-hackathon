import { redirect } from "next/navigation";

// Open directly in the studio; attribution needs no entry step.
export default function Page() {
  redirect("/home");
}
