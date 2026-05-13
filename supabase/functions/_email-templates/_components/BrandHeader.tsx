// Aari Transactions · Email · Brand header
// Wordmark + tagline. Top of every email.

import * as React from "react";
import { Img, Section, Text } from "@react-email/components";

export const BrandHeader: React.FC = () => (
  <Section style={headerStyle}>
    <Text style={wordmarkStyle}>AARI</Text>
    <Text style={taglineStyle}>FLORIDA TC &middot; BROKER-OWNED</Text>
  </Section>
);

const headerStyle: React.CSSProperties = {
  padding: "24px 36px 18px",
  borderBottom: "1px solid #e6e2d8",
  textAlign: "left",
};

const wordmarkStyle: React.CSSProperties = {
  fontFamily: "Georgia, 'Cormorant Garamond', serif",
  fontWeight: 600,
  fontSize: "22px",
  color: "#0f0f0f",
  letterSpacing: "3px",
  margin: 0,
  display: "inline-block",
  padding: "4px 12px",
  border: "1.5px solid #0f0f0f",
  borderRadius: "5px",
  lineHeight: 1,
};

const taglineStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "1.4px",
  textTransform: "uppercase",
  color: "#6b6b6b",
  fontWeight: 600,
  margin: "10px 0 0",
};
