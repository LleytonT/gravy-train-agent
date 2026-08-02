import { redirect } from "next/navigation";

/** Legacy path — Profile lives inside the secure app shell. */
export default function LegacyProfileRedirect() {
  redirect("/app/profile");
}
