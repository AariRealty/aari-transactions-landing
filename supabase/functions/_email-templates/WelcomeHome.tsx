// Welcome-home · Fires 14 days after a sale file's status = closed
// Sent to: buyer (the client on a purchase)
// Category: review_requests (opt-out honored; carries the agent review ask)
//
// Voice: Alex Cattoni — short lines, blank line between sentences, "I" not "we",
// no dashes, no property address in the body. The agent review CTA renders only
// when a real review link is present (no broken buttons).

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  buyerFirstName: string;
  agentFirstName: string;
  reviewUrl?: string | null;   // the agent's Google review link · optional
  unsubscribeUrl: string;
}

export const WelcomeHome: React.FC<Props> = ({ buyerFirstName, agentFirstName, reviewUrl, unsubscribeUrl }) => (
  <Layout preview="Welcome home." category="review_requests" unsubscribeUrl={unsubscribeUrl}>
    <Heading style={h1}>Welcome home.</Heading>

    <Text style={p}>Hi {buyerFirstName},</Text>

    <Text style={pStrong}>It is official. The home is yours.</Text>

    <Text style={p}>A few quick things so nothing slips by.</Text>

    <Text style={p}>Your recorded deed arrives by mail in two to four weeks from the county.</Text>

    <Text style={p}>Keep your final settlement statement from closing. You will want it for next year's taxes.</Text>

    <Text style={p}>{agentFirstName} is your point of contact for anything property related from here.</Text>

    {reviewUrl ? (
      <>
        <Text style={p}>
          One last thing. If {agentFirstName} earned your trust, a quick review means a lot.
        </Text>
        <div style={{ marginTop: 20, marginBottom: 18 }}>
          <Button href={reviewUrl}>Leave a review</Button>
        </div>
      </>
    ) : null}

    <Text style={pStrong}>Welcome home.</Text>
  </Layout>
);

export default WelcomeHome;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const pStrong: React.CSSProperties = { fontSize: 15, color: "#0f0f0f", fontWeight: 600, lineHeight: 1.6, margin: "0 0 14px" };
