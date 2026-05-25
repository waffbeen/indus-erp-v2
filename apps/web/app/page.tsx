import { redirect } from "next/navigation";

export default function HomePage() {
  // Root just bounces to login. After login, user is sent to /t/<slug>/dashboard.
  redirect("/login");
}
