// #2 TC assignment ping · Fires when tc_files.tc_assigned_id is set
// Sent to: agent who owns the file
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  fileId: string;
  tcName: string;
  tcEmail: string;
  tcPhone?: string;
  portalUrl: string;
}

export const TcAssignmentPing: React.FC<Props> = ({ firstName, fileId, tcName, tcEmail, tcPhone, portalUrl }) => (
  <Layout preview={`${tcName} is on your file.`} category="transactional">
    <Heading style={h1}>{tcName} is on your file.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      File <strong>#{fileId}</strong> has been assigned to <strong>{tcName}</strong>. They are your direct line
      from this point through close.
    </Text>
    <Text style={p}>
      Email: <a href={`mailto:${tcEmail}`} style={link}>{tcEmail}</a>
      {tcPhone ? (
        <>
          <br />Phone: <a href={`tel:${tcPhone}`} style={link}>{tcPhone}</a>
        </>
      ) : null}
    </Text>
    <Text style={p}>
      Loop them on contract changes, inspection updates, and any deadlines that move. The portal stays in
      sync so you always have one source of truth.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>Open the file</Button>
    </div>
  </Layout>
);

export default TcAssignmentPing;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const link: React.CSSProperties = { color: "#0f0f0f", fontWeight: 500, textDecoration: "underline" };
