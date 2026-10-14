// #11 Agent introduction · Fires when refer.html form submits
// Sent to: the peer being introduced (CC: referrer)
// Category: marketing (one time introduction to a person who did not sign up; carries an opt out line)
// RESPA-safe: no mention of payment, rewards, or referral fees anywhere in copy.

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface Props {
  peerFirstName: string;
  referrerFirstName: string;
  referrerLastName: string;
  context?: string;          // optional message from referrer
  bookCallUrl: string;
  intakeUrl: string;
}

export const AgentIntroduction: React.FC<Props> = ({
  peerFirstName,
  referrerFirstName,
  referrerLastName,
  context,
  bookCallUrl,
  intakeUrl,
}) => (
  <Layout preview={`${referrerFirstName} thought you should know about us.`} category="marketing">
    <Heading style={h1}>{referrerFirstName} thought you should know about us.</Heading>

    <Text style={p}>Hi {peerFirstName},</Text>

    <Text style={p}>
      My name is Marlenyi Paredes. I'm a Florida real estate broker and the founder of
      Aari Transactions, a transaction coordination service for Florida agents.
    </Text>

    <Text style={p}>
      <strong>{referrerFirstName} {referrerLastName}</strong> introduced us through our
      referral page. Their note was that you might benefit from what we do, so I'm reaching out once
      to say hello.
    </Text>

    {context ? (
      <Text style={noteStyle}>
        Their context: "{context}"
      </Text>
    ) : null}

    <Text style={p}>
      The short version of what Aari Transactions is: transaction coordination owned by a Florida
      broker, statewide Florida coverage, and files in by 2 PM ET picked up the same business day
      when possible.
    </Text>

    <Text style={p}>
      Two ways to take this from here, both no-pressure. Submit a single file and see how the
      process feels in practice. Or book a 15-minute call so I can answer specific questions about
      your current setup.
    </Text>

    <div style={{ marginTop: 22, marginBottom: 6, display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Button href={intakeUrl}>Submit a file</Button>
    </div>

    <Text style={smallTop}>
      Or <a href={bookCallUrl} style={inlineLink}>book a 15-min call</a> if that's easier.
    </Text>

    <Text style={smallNote}>
      This is a one time introduction. You'll only hear from us again if you respond or submit a file.
      No marketing list, no automated follow up. To opt out of any future email from Aari Transactions,
      reply with the word Unsubscribe or email hello@aaritransactions.com with Unsubscribe in the subject.
    </Text>
  </Layout>
);

export default AgentIntroduction;

const h1: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: 26, fontWeight: 500, color: "#0f0f0f", margin: "0 0 18px", lineHeight: 1.15 };
const p: React.CSSProperties = { fontSize: 14, color: "#444", lineHeight: 1.65, margin: "0 0 14px" };
const noteStyle: React.CSSProperties = { ...p, padding: "12px 16px", backgroundColor: "#faf6ec", borderLeft: "3px solid #b89968", borderRadius: 6, fontStyle: "italic", color: "#0f0f0f", margin: "10px 0 18px" };
const smallTop: React.CSSProperties = { fontSize: 13, color: "#444", lineHeight: 1.55, margin: "12px 0 22px" };
const smallNote: React.CSSProperties = { fontSize: 11, color: "#6b6b6b", lineHeight: 1.55, margin: "0 0 4px", paddingTop: 14, borderTop: "1px solid #e6e2d8" };
const inlineLink: React.CSSProperties = { color: "#0f0f0f", textDecoration: "underline", textUnderlineOffset: "3px", fontWeight: 500 };
