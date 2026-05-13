// #10 Agent broadcast · Manual trigger from aari-crm.html Templates tab
// Sent to: agent segment chosen by broker
// Category: marketing (or transactional if it's a policy update, set by sender)

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  subjectLine: string;          // shown only in inbox; not in body
  headline: string;
  bodyParagraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  category?: "transactional" | "marketing";
  unsubscribeUrl?: string;
}

export const AgentBroadcast: React.FC<Props> = ({
  firstName,
  headline,
  bodyParagraphs,
  ctaLabel,
  ctaUrl,
  category = "marketing",
  unsubscribeUrl,
}) => (
  <Layout preview={headline} category={category} unsubscribeUrl={unsubscribeUrl}>
    <Heading style={h1}>{headline}</Heading>
    <Text style={p}>Hi {firstName},</Text>
    {bodyParagraphs.map((para, i) => <Text key={i} style={p}>{para}</Text>)}
    {ctaLabel && ctaUrl ? (
      <div style={{ marginTop: 22, marginBottom: 6 }}>
        <Button href={ctaUrl}>{ctaLabel}</Button>
      </div>
    ) : null}
  </Layout>
);

export default AgentBroadcast;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
