// #8 Membership cancelled · Fires on memberships.status -> cancelled
// Sent to: agent
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  finalAccessDate: string;
  rejoinUrl: string;
}

export const MembershipCancelled: React.FC<Props> = ({ firstName, finalAccessDate, rejoinUrl }) => (
  <Layout preview={`Your membership is set to end on ${finalAccessDate}.`} category="transactional">
    <Heading style={h1}>Your membership is cancelled.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      Your Aari Transactions membership has been cancelled. You keep full member benefits through{" "}
      <strong>{finalAccessDate}</strong>. After that, files run at standard non-member pricing.
    </Text>
    <Text style={p}>
      No exit interview. No retention sequence. If you ever want to come back, the door is open.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={rejoinUrl}>Rejoin anytime</Button>
    </div>
  </Layout>
);

export default MembershipCancelled;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
