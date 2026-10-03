import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enter the Register",
  robots: { index: false, follow: false },
};

/** Login stands alone — no account chrome, no session guard. */
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
