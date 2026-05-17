// TC timeout reassigned · fires when sweep function reassigns an unaccepted file
// Sent to: agent who submitted the file
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  fileId: string;
  propertyAddress: string;
  previousTcName: string;
  newTcName: string;
  portalUrl: string;
}

export const TcTimeoutReassigned: React.FC<Props> = ({
  firstName, fileId, propertyAddress, previousTcName, newTcName, portalUrl,
}) => (
  <Layout
    preview={`Your file moved from ${previousTcName} to ${newTcName}.`}
    category="transactional"
  >
    <Heading style={h1}>Your file moved to {newTcName}.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      {previousTcName} didn't claim File <strong>#{fileId}</strong> ({propertyAddress}) within our
      30-minute window, so we routed it to <strong>{newTcName}</strong>.
    </Text>
    <Text style={p}>
      No action needed from you — {newTcName} has 30 minutes to confirm a start time. You'll get
      another note the moment they do.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>Open the file</Button>
    </div>
  </Layout>
);

const h1 = { fontSize: 26, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, lineHeight: 1.2, margin: "0 0 18px", color: "#0f0f0f" };
const p  = { fontSize: 15, lineHeight: 1.6, color: "#0f0f0f", margin: "0 0 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };

export default TcTimeoutReassigned;
