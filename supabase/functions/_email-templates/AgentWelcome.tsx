// Agent welcome · fires once when onboarding completes (never on skip)
// Sent to: the new agent · introduces their TC by name
// Category: transactional

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  firstName: string;
  tcName: string;
  tcPhone: string;
  intakeUrl: string;
}

export const AgentWelcome: React.FC<Props> = ({ firstName, tcName, tcPhone, intakeUrl }) => (
  <Layout preview={`Welcome to Aari, ${firstName}. Your TC is ${tcName}.`} category="transactional">
    <Heading style={h1}>Welcome to Aari, {firstName}.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      Welcome to Aari Transactions. Your account is active and your TC is{" "}
      <strong>{tcName}</strong>. Submit your first file anytime and we will be in
      touch the same day.
    </Text>
    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={intakeUrl}>Submit your first file</Button>
    </div>
    <Text style={sig}>
      {tcName} · Aari Transactions{tcPhone ? ` · ${tcPhone}` : ""}
    </Text>
  </Layout>
);

export default AgentWelcome;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.6, margin: "0 0 14px" };
const sig: React.CSSProperties = { fontSize: 13, color: "#888", lineHeight: 1.6, margin: "18px 0 0" };
