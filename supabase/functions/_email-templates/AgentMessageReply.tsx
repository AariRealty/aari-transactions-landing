// Agent reply notification · Fires when a TC replies to an agent message
//   from the CRM Inbox.
// Sent to: the agent who started the thread
// Category: transactional (no opt-out · operational reply)

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  agentFirstName: string;
  tcName: string;
  propertyAddress: string;
  body: string;
  portalUrl: string;
}

export const AgentMessageReply: React.FC<Props> = ({
  agentFirstName,
  tcName,
  propertyAddress,
  body,
  portalUrl,
}) => (
  <Layout preview={tcName + " replied · " + propertyAddress} category="transactional">
    <Heading style={h1}>{tcName} replied.</Heading>
    <Text style={meta}>
      Hi {agentFirstName} &mdash; quick reply on <strong>{propertyAddress}</strong>.
    </Text>
    <div style={messageBox}>
      <Text style={messageText}>{body}</Text>
    </div>
    <Text style={pSmall}>
      Reply directly to this email and it lands back with {tcName}. Or open the portal
      to see the full thread.
    </Text>
    <div style={{ marginTop: 18 }}>
      <Button href={portalUrl}>View thread &rarr;</Button>
    </div>
  </Layout>
);

export default AgentMessageReply;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 14px", lineHeight: 1.15 };
const meta: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.55, margin: "0 0 16px" };
const messageBox: React.CSSProperties = { background: "#fafaf6", borderLeft: "3px solid #0f0f0f", padding: "14px 16px", borderRadius: 4, margin: "0 0 18px" };
const messageText: React.CSSProperties = { fontSize: 14, color: "#0f0f0f", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" };
const pSmall: React.CSSProperties = { fontSize: 12, color: "#888", lineHeight: 1.55, margin: 0 };
