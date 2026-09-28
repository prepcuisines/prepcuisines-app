import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import MetaPixel from "@/components/MetaPixel";

// Fonts are bundled in app/fonts (not fetched from Google at build time):
// production builds were failing whenever Google Fonts couldn't be reached
// from Vercel's build servers, which blocked unrelated deploys.
const playfair = localFont({
  variable: "--font-playfair",
  src: [
    { path: "./fonts/playfair-display-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/playfair-display-latin-900-normal.woff2", weight: "900", style: "normal" },
  ],
  display: "swap",
});

const cormorant = localFont({
  variable: "--font-cormorant",
  src: [
    { path: "./fonts/cormorant-garamond-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/cormorant-garamond-latin-700-normal.woff2", weight: "700", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-700-italic.woff2", weight: "700", style: "italic" },
  ],
  display: "swap",
});

const montserrat = localFont({
  variable: "--font-montserrat",
  src: [
    { path: "./fonts/montserrat-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/montserrat-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/montserrat-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "prepcuisines",
  description: "Your weekly meal plan, made by prepcuisines",
  other: {
    "facebook-domain-verification": "74ov7ki8ktwgvl9y9sve6actqrtmxp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${cormorant.variable} ${montserrat.variable} h-full antialiased`}
    >
<body className="min-h-full flex flex-col">
      <MetaPixel />
      {children}
    </body>
    </html>
  );
}
