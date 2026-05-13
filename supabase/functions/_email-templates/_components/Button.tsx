// Aari Transactions · Email · CTA button
// Black pill on cream background. One per email.

import * as React from "react";
import { Button as RBtn } from "@react-email/components";

interface BtnProps {
  href: string;
  children: React.ReactNode;
}

export const Button: React.FC<BtnProps> = ({ href, children }) => (
  <RBtn href={href} style={btnStyle}>
    {children}
  </RBtn>
);

const btnStyle: React.CSSProperties = {
  backgroundColor: "#0f0f0f",
  color: "#ffffff",
  padding: "12px 24px",
  borderRadius: "999px",
  fontSize: "12px",
  fontWeight: 600,
  letterSpacing: "1px",
  textTransform: "uppercase",
  textDecoration: "none",
  display: "inline-block",
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
};
