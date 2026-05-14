// TC message notification · Fires when an agent sends a message from the portal
// Sent to: TC team (default: hello@aaritransactions.com)
// Category: transactional (no opt-out · operational TC routing)

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  agentName: string;
  agentEmail: string;
  propertyAddress: string;
  fileId: string;
  body: string;
  portalUrl: string;
}

export const TcMessageNotification: React.FC<Props> = ({
  agentName,
  agentEmail,
  propertyAddress,
  fileId,
  body,
  portalUrl,
}) => (
  <Layout preview={"New message from " + agentName + " · " + propertyAddress} category="transactional">
    <Heading style={h1}>New agent message.</Heading>
    <Text style={meta}>
      <strong>{agentName}</strong> &middot; {agentEmail}<br />
      File: <strong>{propertyAddress}</strong> &middot; #{fileId.slice(0, 8)}
    </Text>
    <div style={messageBox}>
      <Text style={messageText}>{body}</Text>
    </div>
    <Text style={pSmall}>
      Reply directly to this email and the response goes back to {agentName}.
      Or open the file in the admin portal.
    </Text>
    <div style={{ marginTop: 18 }}>
      <Button href={portalUrl}>View file in portal &rarr;</Button>
    </div>
  </Layout>
);

export default TcMessageNotification;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 14px", lineHeight: 1.15 };
const meta: React.CSSProperties = { fontSize: 13, color: "#666", lineHeight: 1.55, margin: "0 0 16px" };
const messageBox: React.CSSProperties = { background: "#fafaf6", borderLeft: "3px solid #0f0f0f", padding: "14px 16px", borderRadius: 4, margin: "0 0 18px" };
const messageText: React.CSSProperties = { fontSize: 14, color: "#0f0f0f", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" };
const pSmall: React.CSSProperties = { fontSize: 12, color: "#888", lineHeight: 1.55, margin: 0 };
