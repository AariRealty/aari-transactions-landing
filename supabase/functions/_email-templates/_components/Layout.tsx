// Aari Transactions · Email layout shell
// Every template wraps content in <Layout> for consistent header/footer/brand.

import * as React from "react";
import { Body, Container, Head, Html, Preview, Section } from "@react-email/components";
import { BrandHeader } from "./BrandHeader.tsx";
import { BrandFooter } from "./BrandFooter.tsx";

interface LayoutProps {
  preview: string;
  category?: "transactional" | "marketing" | "review_requests";
  unsubscribeUrl?: string;
  children: React.ReactNode;
}

// Note: Tailwind wrapper removed (May 2026) · was crashing silently in Deno
// edge runtime, causing every email to render as empty <template> tags.
// All templates use inline React.CSSProperties styles so Tailwind is unused.
export const Layout: React.FC<LayoutProps> = ({ preview, category = "transactional", unsubscribeUrl, children }) => (
  <Html lang="en">
    <Head />
    <Preview>{preview}</Preview>
    <Body style={bodyStyle}>
      <Container style={containerStyle}>
        <BrandHeader />
        <Section style={contentStyle}>{children}</Section>
        <BrandFooter category={category} unsubscribeUrl={unsubscribeUrl} />
      </Container>
    </Body>
  </Html>
);

const bodyStyle: React.CSSProperties = {
  backgroundColor: "#fafaf6",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: "32px 0",
  color: "#444",
};

const containerStyle: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e6e2d8",
  borderRadius: "12px",
  overflow: "hidden",
};

const contentStyle: React.CSSProperties = {
  padding: "32px 36px",
};
