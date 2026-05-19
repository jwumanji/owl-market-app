import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Login - OWL Market",
};

export default function LoginPage() {
  return (
    <section
      className="flex min-h-[calc(100vh-var(--top))] w-full items-center justify-center px-6 py-12"
      style={{ backgroundColor: "var(--bg)" }}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
