// Aari Transactions · Email · Brand footer
// Florida broker stamp · contact · CAN-SPAM compliant unsubscribe (marketing only).

import * as React from "react";
import { Hr, Link, Section, Text } from "@react-email/components";

interface FooterProps {
  category?: "transactional" | "marketing" | "review_requests";
  unsubscribeUrl?: string;
}

export const BrandFooter: React.FC<FooterProps> = ({ category = "transactional", unsubscribeUrl }) => (
  <Section style={footerStyle}>
    <Hr style={hrStyle} />

    <Text style={signatureStyle}>
      <strong style={{ color: "#0f0f0f" }}>Marlenyi Paredes</strong><br />
      Florida Real Estate Broker &middot; License BK3530153<br />
      Aari Transactions LLC
    </Text>

    <Text style={contactStyle}>
      <Link href="mailto:hello@aaritransactions.com" style={linkStyle}>hello@aaritransactions.com</Link>
      &nbsp;&middot;&nbsp;
      <Link href="tel:+12396881770" style={linkStyle}>239.688.1770</Link>
      &nbsp;&middot;&nbsp;
      <Link href="https://aaritransactions.com" style={linkStyle}>aaritransactions.com</Link>
    </Text>

    <Text style={addressStyle}>
      Aari Transactions LLC &middot; PO Box address on file with Florida DBPR &middot; Lehigh Acres, FL
    </Text>

    {category !== "transactional" && unsubscribeUrl ? (
      <Text style={unsubStyle}>
        You're receiving this because you registered with Aari Transactions.
        &nbsp;<Link href={unsubscribeUrl} style={unsubLinkStyle}>Unsubscribe</Link>.
      </Text>
    ) : null}
  </Section>
);

const footerStyle: React.CSSProperties = {
  padding: "24px 36px 28px",
  backgroundColor: "#fafaf6",
  borderTop: "1px solid #e6e2d8",
};

const hrStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #e6e2d8",
  margin: "0 0 18px",
};

const signatureStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#444",
  lineHeight: 1.55,
  margin: "0 0 12px",
};

const contactStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#6b6b6b",
  lineHeight: 1.55,
  margin: "0 0 10px",
};

const addressStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#9a9588",
  lineHeight: 1.55,
  margin: "0 0 12px",
};

const linkStyle: React.CSSProperties = {
  color: "#0f0f0f",
  textDecoration: "none",
  fontWeight: 500,
};

const unsubStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "#9a9588",
  lineHeight: 1.55,
  margin: "12px 0 0",
  paddingTop: "12px",
  borderTop: "1px solid #e6e2d8",
};

const unsubLinkStyle: React.CSSProperties = {
  color: "#6b6b6b",
  textDecoration: "underline",
};
