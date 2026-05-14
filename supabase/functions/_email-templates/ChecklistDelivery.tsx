// Checklist delivery · Fires on exit-intent lead capture (Pre-Close Compliance Checklist)
// Sent to: any visitor who submitted their email on the popup
// Category: marketing (opt-out applies on subsequent sends)

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  checklistUrl: string;
  unsubscribeUrl?: string;
}

export const ChecklistDelivery: React.FC<Props> = ({ checklistUrl }) => (
  <Layout preview="Your Florida Pre-Close Compliance Checklist is inside." category="marketing">
    <Heading style={h1}>Your checklist. Inside.</Heading>
    <Text style={p}>
      Thanks for grabbing the Florida Pre-Close Compliance Checklist. 15 items, 5 sections,
      built from real files we've closed in Lehigh, Cape Coral, and Fort Myers.
    </Text>
    <Text style={p}>
      Use it the next time you're 72 hours from closing. Run every item. Escalate anything
      missing by phone, not email. That's the difference between a clean close and a deal
      that slips three days.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 18 }}>
      <Button href={checklistUrl}>Open the checklist &rarr;</Button>
    </div>
    <Text style={pSmall}>
      You can also print it as a PDF for closing-day prep — there's a Print button at the top
      of the page.
    </Text>
    <Text style={pSmall}>
      If you ever want a broker-owned TC to run this for you on every file, hit reply.
      That's how this whole thing started.
    </Text>
    <Text style={signoff}>
      &mdash; Marlenyi Paredes<br />
      <span style={signoffMeta}>Florida Real Estate Broker &middot; License BK3530153 &middot; Aari Transactions</span>
    </Text>
  </Layout>
);

export default ChecklistDelivery;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const pSmall: React.CSSProperties = { fontSize: 13, color: "#666", lineHeight: 1.55, margin: "0 0 12px" };
const signoff: React.CSSProperties = { fontSize: 14, color: "#0f0f0f", margin: "26px 0 0", lineHeight: 1.5 };
const signoffMeta: React.CSSProperties = { fontSize: 11, color: "#888", letterSpacing: 0.3 };
