// #9b Win-back · Day 60 · Cron-fired daily
// Sent to: agent · marketing category

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  bookCallUrl: string;
  unsubscribeUrl: string;
}

export const WinBackDay60: React.FC<Props> = ({ firstName, bookCallUrl, unsubscribeUrl }) => (
  <Layout preview="Quick question." category="marketing" unsubscribeUrl={unsubscribeUrl}>
    <Heading style={h1}>Quick question.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      Two months without a file from your side. Is something not working, or is the market just quiet?
    </Text>
    <Text style={p}>
      If there's friction we can fix, tell us. If you want a 15-minute call to walk through whatever's
      coming next, the link below opens the calendar.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={bookCallUrl}>Book a 15-min call</Button>
    </div>
  </Layout>
);

export default WinBackDay60;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
