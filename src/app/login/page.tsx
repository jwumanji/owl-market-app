import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Login - OWL Market",
};

export default function LoginPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100vh-var(--top))] max-w-[1280px] items-center justify-center px-4 py-10">
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
