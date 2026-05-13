// #9a Win-back · Day 30 · Cron-fired daily
// Sent to: agent · marketing category · opt-out honored
// Trigger: last tc_files for agent was 28-32 days ago

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  intakeUrl: string;
  unsubscribeUrl: string;
}

export const WinBackDay30: React.FC<Props> = ({ firstName, intakeUrl, unsubscribeUrl }) => (
  <Layout preview="It's been a minute. How's the next deal looking?" category="marketing" unsubscribeUrl={unsubscribeUrl}>
    <Heading style={h1}>It's been a minute.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      It's been about 30 days since your last file with us. No pressure. Just checking in.
    </Text>
    <Text style={p}>
      If something is queued and you want a TC on it before the weekend, you know where to find us. Same-day
      intake confirmation. Same coordinator if they're available.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={intakeUrl}>Submit a file</Button>
    </div>
  </Layout>
);

export default WinBackDay30;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
