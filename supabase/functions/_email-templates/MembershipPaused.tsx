// #7 Membership paused · Fires on memberships.status -> paused
// Sent to: agent
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  resumeDate: string;
  portalUrl: string;
  isReminder?: boolean;  // true = 2 days before resume reminder
}

export const MembershipPaused: React.FC<Props> = ({ firstName, resumeDate, portalUrl, isReminder }) => (
  <Layout
    preview={isReminder ? `Your membership resumes ${resumeDate}.` : `Your membership is paused until ${resumeDate}.`}
    category="transactional"
  >
    <Heading style={h1}>
      {isReminder ? "Your membership resumes in 2 days." : "Your membership is paused."}
    </Heading>
    <Text style={p}>Hi {firstName},</Text>
    {isReminder ? (
      <>
        <Text style={p}>
          Just a heads up. Your Aari Transactions membership is set to resume on <strong>{resumeDate}</strong>.
        </Text>
        <Text style={p}>
          If you want to extend the pause or cancel before billing restarts, manage it from your portal in
          under a minute.
        </Text>
      </>
    ) : (
      <>
        <Text style={p}>
          Your membership is paused. You will not be charged until <strong>{resumeDate}</strong>, when
          billing automatically picks up where it left off.
        </Text>
        <Text style={p}>
          We'll send a reminder two days before billing resumes so nothing surprises you.
        </Text>
      </>
    )}
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>Manage membership</Button>
    </div>
  </Layout>
);

export default MembershipPaused;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
