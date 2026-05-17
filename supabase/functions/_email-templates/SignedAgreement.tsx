// Section 6 · Task 6.4 · Sent to agent + broker on every execution.
// Attaches the executed PDF with signature certificate page appended.
// Category: transactional (no opt-out).

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";

interface Props {
  agentFirstName: string;
  typedLegalName: string;
  agreementVersion: string;
  signedAt: string;
  fileId: string | null;
}

export const SignedAgreement: React.FC<Props> = ({
  agentFirstName,
  typedLegalName,
  agreementVersion,
  signedAt,
  fileId,
}) => (
  <Layout preview="Your signed Aari Service Agreement is attached." category="transactional">
    <Heading style={h1}>Signed. Filed. Done.</Heading>
    <Text style={p}>Hi {agentFirstName},</Text>
    <Text style={p}>
      The Aari Transactions Service Agreement ({agreementVersion}) is executed and attached to this email.
      A copy is on file with Aari and accessible from your portal anytime.
    </Text>

    <div style={card}>
      <Row label="Signed by" value={typedLegalName} />
      <Row label="Signed at" value={signedAt} />
      <Row label="Agreement version" value={agreementVersion} />
      {fileId ? <Row label="File reference" value={`#${fileId}`} /> : null}
    </div>

    <Text style={p}>
      This signature is captured under the Florida Electronic Signature Act (Fla. Stat. § 668.50) — your
      typed legal name, timestamp, and originating IP address constitute your electronic signature. The
      attached PDF contains the full executed agreement plus a signature certificate page documenting the
      audit trail.
    </Text>

    <Text style={p}>
      Need to talk? Reply to this email or write <a href="mailto:hello@aaritransactions.com">hello@aaritransactions.com</a>.
    </Text>

    <Text style={pSmall}>
      — Marlenyi Paredes · Florida Real Estate Broker · BK3530153 · Aari Transactions
    </Text>
  </Layout>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={row}>
    <span style={rowLabel}>{label}</span>
    <span style={rowValue}>{value}</span>
  </div>
);

const h1 = {
  fontFamily: "'Cormorant Garamond', Georgia, serif",
  fontSize: "28px",
  fontWeight: 500,
  color: "#0f0f0f",
  margin: "0 0 16px",
};
const p = {
  fontSize: "14px",
  lineHeight: 1.65,
  color: "#0f0f0f",
  margin: "0 0 14px",
};
const pSmall = {
  fontSize: "12px",
  lineHeight: 1.55,
  color: "#6b6b6b",
  margin: "18px 0 0",
};
const card = {
  background: "#fbf9f4",
  border: "1px solid rgba(150,122,74,0.25)",
  borderRadius: "8px",
  padding: "16px 18px",
  margin: "16px 0 20px",
};
const row = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  padding: "6px 0",
  borderBottom: "1px solid rgba(150,122,74,0.15)",
  fontSize: "12.5px",
};
const rowLabel = {
  color: "#6b6b6b",
  textTransform: "uppercase" as const,
  letterSpacing: "0.06em",
  fontWeight: 700,
  fontSize: "10.5px",
};
const rowValue = {
  color: "#0f0f0f",
  fontWeight: 500,
  textAlign: "right" as const,
};
