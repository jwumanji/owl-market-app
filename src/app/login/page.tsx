import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Login - OWL Market",
};

export default function LoginPage() {
  return (
    <section className="login-page flex min-h-[calc(100vh-var(--top))] w-full items-center justify-center px-6 py-12">
      <Suspense>
        <LoginForm />
      </Suspense>
    </section>
  );
}
