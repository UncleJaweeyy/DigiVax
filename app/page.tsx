import { redirect } from "next/navigation";

export default function Home() {
  // This automatically moves the user to localhost:3000/login
  redirect("/login");
  
  // This part won't actually render, but is needed for the component structure
  return null;
}