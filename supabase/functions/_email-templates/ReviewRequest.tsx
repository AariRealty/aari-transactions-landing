// #4 Review request · Fires 24h after tc_files.status = closed
// Sent to: client (buyer or seller)
// Category: review_requests (opt-out honored)

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  clientFirstName: string;
  agentFirstName: string;
  transactionType: string;     // 'purchase', 'sale', etc.
  propertyAddress: string;
  reviewUrl: string;            // signed token URL to client-review.html
  unsubscribeUrl: string;
}

export const ReviewRequest: React.FC<Props> = ({ clientFirstName, agentFirstName, transactionType, propertyAddress, reviewUrl, unsubscribeUrl }) => (
  <Layout preview="One favor before we close the file." category="review_requests" unsubscribeUrl={unsubscribeUrl}>
    <Heading style={h1}>One favor before we close the file.</Heading>
    <Text style={p}>Hi {clientFirstName},</Text>
    <Text style={p}>
      {agentFirstName} just closed your {transactionType} on <strong>{propertyAddress}</strong>.
      Aari Transactions coordinated the back end.
    </Text>
    <Text style={p}>
      Two minutes of your time would help us a lot. One link. No login.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 18 }}>
      <Button href={reviewUrl}>Share your review</Button>
    </div>
    <Text style={small}>
      Reviews are FTC-compliant. You choose your attribution: first name + last initial, full name, or
      Buyer or Seller in your city. We review every submission before publishing.
    </Text>
  </Layout>
);

export default ReviewRequest;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const small: React.CSSProperties = { fontSize: 11, color: "#6b6b6b", lineHeight: 1.55, margin: "0 0 4px", paddingTop: 14, borderTop: "1px solid #e6e2d8" };
