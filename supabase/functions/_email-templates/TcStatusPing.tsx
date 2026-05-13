// #3 TC status ping · Fires on tc_files.status milestone change
// Sent to: agent who owns the file
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  fileId: string;
  previousStatus: string;
  newStatus: string;
  statusNote?: string;
  tcName: string;
  portalUrl: string;
}

export const TcStatusPing: React.FC<Props> = ({ firstName, fileId, previousStatus, newStatus, statusNote, tcName, portalUrl }) => (
  <Layout preview={`File #${fileId} moved to ${newStatus}.`} category="transactional">
    <Heading style={h1}>Status update on your file.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      File <strong>#{fileId}</strong> just moved from <strong>{previousStatus}</strong> to <strong>{newStatus}</strong>.
    </Text>
    {statusNote ? <Text style={noteStyle}>{statusNote}</Text> : null}
    <Text style={p}>
      Sent by {tcName}. The full timeline lives in your portal. Reply here if you need anything.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>View the file</Button>
    </div>
  </Layout>
);

export default TcStatusPing;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const noteStyle: React.CSSProperties = { ...p, padding: "12px 16px", backgroundColor: "#faf6ec", borderLeft: "3px solid #b89968", borderRadius: 6, fontStyle: "italic", color: "#0f0f0f" };
