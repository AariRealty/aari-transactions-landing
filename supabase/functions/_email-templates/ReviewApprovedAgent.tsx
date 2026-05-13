// #5 Review approved · Fires when client_reviews.status = approved
// Sent to: agent of record on the file
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  clientAttribution: string;
  reviewBody: string;
  stars: number;
  reviewsUrl: string;
}

export const ReviewApprovedAgent: React.FC<Props> = ({ firstName, clientAttribution, reviewBody, stars, reviewsUrl }) => (
  <Layout preview="A client review just went live." category="transactional">
    <Heading style={h1}>A client review just went live.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      A review tied to one of your closed files has been approved and published. Permission was captured
      from the client at submission. Attribution is exactly as they chose.
    </Text>
    <div style={quoteBox}>
      <Text style={stars_}>{"★".repeat(stars)}{"☆".repeat(5 - stars)}</Text>
      <Text style={quoteBody}>{reviewBody}</Text>
      <Text style={attr}>&mdash; {clientAttribution}</Text>
    </div>
    <Text style={p}>
      Share it. Use it. It's yours.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={reviewsUrl}>See all approved reviews</Button>
    </div>
  </Layout>
);

export default ReviewApprovedAgent;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const quoteBox: React.CSSProperties = { padding: "16px 18px", backgroundColor: "#fafaf6", border: "1px solid #e6e2d8", borderLeft: "3px solid #0f0f0f", borderRadius: 6, margin: "16px 0 18px" };
const stars_: React.CSSProperties = { fontSize: 14, color: "#b89968", margin: "0 0 8px", letterSpacing: "2px" };
const quoteBody: React.CSSProperties = { fontFamily: "Georgia, serif", fontStyle: "italic", fontSize: 15, color: "#0f0f0f", lineHeight: 1.55, margin: "0 0 10px" };
const attr: React.CSSProperties = { fontSize: 11, color: "#6b6b6b", margin: 0 };
