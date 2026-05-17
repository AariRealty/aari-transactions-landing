// TC acceptance confirmation · fires when TC clicks Accept + picks start time
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
  tcName: string;
  tcEmail: string;
  tcPhone?: string;
  expectedStartAtFormatted: string; // e.g. "3:00 PM today" or "9:00 AM tomorrow"
  portalUrl: string;
}

export const TcAcceptanceToAgent: React.FC<Props> = ({
  firstName, fileId, propertyAddress, tcName, tcEmail, tcPhone,
  expectedStartAtFormatted, portalUrl,
}) => (
  <Layout
    preview={`${tcName} has accepted your file and will start at ${expectedStartAtFormatted}.`}
    category="transactional"
  >
    <Heading style={h1}>{tcName} accepted your file.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      <strong>{tcName}</strong> just claimed File <strong>#{fileId}</strong> for{" "}
      <strong>{propertyAddress}</strong> and is starting at{" "}
      <strong>{expectedStartAtFormatted}</strong>.
    </Text>
    <Text style={p}>
      From this point through close, {tcName} is your direct line.
    </Text>
    <Text style={p}>
      Email: <a href={`mailto:${tcEmail}`} style={link}>{tcEmail}</a>
      {tcPhone ? (
        <>
          <br />Phone: <a href={`tel:${tcPhone}`} style={link}>{tcPhone}</a>
        </>
      ) : null}
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>Open the file</Button>
    </div>
    <Text style={pSmall}>
      If something has changed and you need a different TC, open the file in the portal — you can
      request a swap up to 3 times per file before the timing locks in.
    </Text>
  </Layout>
);

const h1 = { fontSize: 26, fontFamily: "'Cormorant Garamond', Georgia, serif", fontWeight: 500, lineHeight: 1.2, margin: "0 0 18px", color: "#0f0f0f" };
const p  = { fontSize: 15, lineHeight: 1.6, color: "#0f0f0f", margin: "0 0 14px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const pSmall = { fontSize: 12.5, lineHeight: 1.55, color: "#7a6238", margin: "22px 0 0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" };
const link = { color: "#967a4a", textDecoration: "underline" };

export default TcAcceptanceToAgent;
