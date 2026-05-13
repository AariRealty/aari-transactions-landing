// #9c Win-back · Day 90 · Cron-fired daily (final touch before moving agent to "Gone")
// Sent to: agent · marketing category

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  intakeUrl: string;
  unsubscribeUrl: string;
}

export const WinBackDay90: React.FC<Props> = ({ firstName, intakeUrl, unsubscribeUrl }) => (
  <Layout preview="Last note from us for a while." category="marketing" unsubscribeUrl={unsubscribeUrl}>
    <Heading style={h1}>Last note from us for a while.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      It's been 90 days. We won't keep nudging. After this email we move you off the active list so your
      inbox stays clean.
    </Text>
    <Text style={p}>
      The door stays open. The pricing, the process, the people — all the same. When you're ready, the
      portal is exactly where you left it.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={intakeUrl}>Submit a file when ready</Button>
    </div>
  </Layout>
);

export default WinBackDay90;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
