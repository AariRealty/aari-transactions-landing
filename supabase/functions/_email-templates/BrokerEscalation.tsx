// Broker escalation · fires when all TCs decline/timeout AND agent has hit swap cap
// Sent to: broker (Marlenyi)
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  fileId: string;
  agentName: string;
  propertyAddress: string;
  serviceType: string;
  reason: string;
  cockpitUrl: string;
}

export const BrokerEscalation: React.FC<Props> = ({
  fileId, agentName, propertyAddress, serviceType, reason, cockpitUrl,
}) => (
  <Layout
    preview={`File from ${agentName} needs broker assignment.`}
    category="transactional"
  >
    <Heading style={h1}>File needs your assignment.</Heading>
    <Text style={p}>
      <strong>File #{fileId}</strong> from <strong>{agentName}</strong> at{" "}
      <strong>{propertyAddress}</strong> ({serviceType}) has exhausted the TC routing queue.
    </Text>
    <Text style={p}>
      Reason: {reason === "all_tcs_exhausted" ? "Every active TC declined or timed out." : reason}
    </Text>
    <Text style={p}>
      The file is sitting in your cockpit with status <em>awaiting_broker_review</em>. Pick a TC
      manually, take it yourself, or push it to tomorrow.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={cockpitUrl}>Open the cockpit</Button>
    </div>
    <Text style={pSmall}>
      If this is happening often, the TC pool is capacity-constrained — worth a roster review.
    </Text>
  </Layout>
);

const h1 = { fontSize: 26, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, lineHeight: 1.2, margin: "0 0 18px", color: "#0f0f0f" };
const p  = { fontSize: 15, lineHeight: 1.6, color: "#0f0f0f", margin: "0 0 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const pSmall = { fontSize: 12.5, lineHeight: 1.55, color: "#7a6238", margin: "22px 0 0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };

export default BrokerEscalation;
