// #6 Membership upgrade · Fires when memberships.tier -> producer (Stripe webhook)
// Sent to: agent
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  nextBillingDate: string;
  portalUrl: string;
}

export const MembershipUpgrade: React.FC<Props> = ({ firstName, nextBillingDate, portalUrl }) => (
  <Layout preview="You're a Producer." category="transactional">
    <Heading style={h1}>You're a Producer.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      Your Producer membership is active. From this file forward you'll see <strong>$50 off every TC</strong>,
      <strong> 4 service credits a month</strong>, and top priority in queue when new files come in.
    </Text>
    <Text style={p}>
      Next bill: <strong>{nextBillingDate}</strong>. Cancel or pause anytime from the portal.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>Open the portal</Button>
    </div>
  </Layout>
);

export default MembershipUpgrade;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
