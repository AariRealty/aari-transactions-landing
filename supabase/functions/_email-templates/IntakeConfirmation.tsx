// #1 Intake confirmation · Fires on tc_files INSERT
// Sent to: agent who submitted the file
// Category: transactional (no opt-out)

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  fileId: string;
  submittedAt: string;
  portalUrl: string;
}

export const IntakeConfirmation: React.FC<Props> = ({ firstName, fileId, submittedAt, portalUrl }) => (
  <Layout preview="We have your file. Here's what's next." category="transactional">
    <Heading style={h1}>We have your file.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      Your TC intake landed at {submittedAt}. File reference <strong>#{fileId}</strong>.
    </Text>
    <Text style={p}>
      A coordinator will be assigned within one business day. You'll get a second email with their name
      and a direct line the moment that happens.
    </Text>
    <Text style={p}>
      If anything on the file needs to change before then, reply to this email.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>View your portal</Button>
    </div>
  </Layout>
);

export default IntakeConfirmation;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 28, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
