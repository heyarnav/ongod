import type { Metadata } from "next";
import { Cormorant, JetBrains_Mono, UnifrakturMaguntia } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation/Navigation";
import { Footer } from "@/components/navigation/Footer";
import { GrainOverlay } from "@/components/ui/GrainOverlay";
import { InspectionCursor } from "@/components/ui/InspectionCursor";
import { CheckoutDrawer } from "@/components/cart/CheckoutDrawer";

const cormorant = Cormorant({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-cormorant",
  display: "swap",
});

const jbm = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-jbm",
  display: "swap",
});

const unifraktur = UnifrakturMaguntia({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-unifraktur",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "on god. — a study in existence",
    template: "%s — on god.",
  },
  description:
    "on god. is a clothing archive documenting the human experience. HUMAN / CELESTIAL / DIVINE — three realms, one continuum.",
  // `||`, not `??`: NEXT_PUBLIC_* is inlined at build time, so an environment
  // variable that exists but is empty arrives as "" rather than undefined, and
  // `??` lets that through — `new URL("")` throws, and the failure takes the
  // whole build down rather than degrading to a wrong absolute URL in a social
  // card.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  openGraph: {
    title: "on god. — a study in existence",
    description: "The human experience, documented. HUMAN / CELESTIAL / DIVINE.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cormorant.variable} ${jbm.variable} ${unifraktur.variable}`}>
      <body className="min-h-screen bg-void text-bone">
        <GrainOverlay />
        <Navigation />
        <main>{children}</main>
        <Footer />
        <CheckoutDrawer />
        <InspectionCursor />
      </body>
    </html>
  );
}
