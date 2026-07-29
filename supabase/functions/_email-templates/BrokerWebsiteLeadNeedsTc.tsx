// Email template · sent to the broker (Marlenyi) the moment a website submission
// lands unassigned. Fired by edge function: send-broker-website-lead.
//
// Copy tone matches the draft Marlenyi approved in Gmail:
//   - Warm Alex Cattoni voice, short paragraphs, no em-dashes.
//   - Highlighted "Source · Website" strip up top so it's unmistakable at a glance.
//   - Single black CTA button linking to broker-cockpit with the file pre-opened.
import * as React from "react";

interface Props {
  brokerFirstName: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  propertyAddress: string;
  price?: string;
  serviceLabel: string;
  side?: string;
  agentName?: string;
  submittedAt: string;
  assignUrl: string;
}

const rowStyle: React.CSSProperties = {
  fontFamily: "Arial, -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 16,
  lineHeight: 1.6,
  color: "#0f0f0f",
  margin: "0 0 8px 0",
};

export const BrokerWebsiteLeadNeedsTc: React.FC<Props> = ({
  brokerFirstName,
  clientName,
  clientPhone,
  clientEmail,
  propertyAddress,
  price,
  serviceLabel,
  side,
  agentName,
  submittedAt,
  assignUrl,
}) => {
  const clientLine = [clientName, clientPhone, clientEmail].filter(Boolean).join(" · ");
  const propertyLine = [propertyAddress, price].filter(Boolean).join(" · ");
  const agentLine = agentName && agentName.trim().length > 0
    ? agentName
    : "none, they came in solo";

  return (
    <div style={{
      fontFamily: "Arial, -apple-system, BlinkMacSystemFont, sans-serif",
      maxWidth: 560,
      margin: "0 auto",
      padding: "32px 24px",
      color: "#0f0f0f",
      lineHeight: 1.6,
      backgroundColor: "#ffffff",
    }}>
      <p style={rowStyle}>Hey {brokerFirstName || "Marlenyi"},</p>

      <p style={rowStyle}>
        Heads up, a lead just came in through <strong>aaritransactions.com</strong>.
        {" "}Website submission, no agent in the mix.
      </p>

      {/* Highlighted source strip */}
      <div style={{
        background: "#fff8e1",
        borderLeft: "4px solid #f5b400",
        padding: "12px 16px",
        margin: "20px 0 24px 0",
        fontFamily: "Arial, sans-serif",
        fontSize: 16,
        color: "#0f0f0f",
      }}>
        🌐 <strong>Source</strong> · Website (aaritransactions.com)
      </div>

      <p style={{ ...rowStyle, margin: "0 0 12px 0" }}>Here's the quick download:</p>

      <p style={rowStyle}><strong>Client</strong> · {clientLine || "(no contact info yet)"}</p>
      <p style={rowStyle}><strong>Property</strong> · {propertyLine || "(no address yet)"}</p>
      <p style={rowStyle}><strong>Service</strong> · {serviceLabel}</p>
      {side ? <p style={rowStyle}><strong>Side</strong> · {side}</p> : null}
      <p style={rowStyle}><strong>Agent</strong> · {agentLine}</p>
      <p style={{ ...rowStyle, margin: "0 0 24px 0" }}><strong>Submitted</strong> · {submittedAt}</p>

      <p style={{ ...rowStyle, margin: "0 0 28px 0" }}>
        We're still in beta, so you're picking the TC on this one… move quick.
      </p>

      <p style={{ margin: "0 0 32px 0" }}>
        <a href={assignUrl} style={{
          background: "#000000",
          color: "#ffffff",
          textDecoration: "none",
          padding: "14px 26px",
          borderRadius: 6,
          fontWeight: 600,
          display: "inline-block",
          fontFamily: "Arial, sans-serif",
          fontSize: 16,
        }}>
          Assign a TC  &rarr;
        </a>
      </p>

      <p style={{
        margin: 0,
        color: "#8a8a8a",
        fontSize: 14,
        fontFamily: "Arial, sans-serif",
      }}>
        Aari Transactions
      </p>
    </div>
  );
};
