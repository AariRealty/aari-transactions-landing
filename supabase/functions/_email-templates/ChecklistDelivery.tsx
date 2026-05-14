// Checklist delivery · Fires on exit-intent lead capture (Pre-Close Compliance Checklist)
// Sent to: any visitor who submitted their email on the popup
// Category: marketing (opt-out applies on subsequent sends)
//
// May 2026 rewrite: bypasses @react-email/components entirely due to silent
// render failures in Deno edge runtime. Uses plain HTML tags + inline styles.

import * as React from "react";

interface Props {
  checklistUrl: string;
  unsubscribeUrl?: string;
}

export const ChecklistDelivery: React.FC<Props> = ({ checklistUrl, unsubscribeUrl }) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Your Florida Pre-Close Compliance Checklist</title>
    </head>
    <body style={bodyStyle}>
      <div style={containerStyle}>
        {/* Brand header */}
        <div style={headerStyle}>
          <span style={wordmarkStyle}>AARI</span>
          <div style={taglineStyle}>FLORIDA TC &middot; BROKER-OWNED</div>
        </div>

        {/* Content */}
        <div style={contentStyle}>
          <h1 style={h1Style}>Your checklist. Inside.</h1>

          <p style={pStyle}>
            Thanks for grabbing the Florida Pre-Close Compliance Checklist. 15 items, 5 sections,
            built from real files we've closed in Lehigh, Cape Coral, and Fort Myers.
          </p>

          <p style={pStyle}>
            Use it the next time you're 72 hours from closing. Run every item. Escalate anything
            missing by phone, not email. That's the difference between a clean close and a deal
            that slips three days.
          </p>

          <div style={{ marginTop: "22px", marginBottom: "22px" }}>
            <a href={checklistUrl} style={buttonStyle}>Open the checklist &rarr;</a>
          </div>

          <p style={pSmallStyle}>
            You can also print it as a PDF for closing-day prep — there's a Print button at the top
            of the page.
          </p>

          <p style={pSmallStyle}>
            If you ever want a broker-owned TC to run this for you on every file, hit reply.
            That's how this whole thing started.
          </p>

          <p style={signoffStyle}>
            <strong style={{ color: "#0f0f0f" }}>&mdash; Marlenyi Paredes</strong><br />
            <span style={signoffMetaStyle}>Florida Real Estate Broker &middot; License BK3530153 &middot; Aari Transactions</span>
          </p>
        </div>

        {/* Footer */}
        <div style={footerStyle}>
          <hr style={hrStyle} />
          <p style={footerContactStyle}>
            <a href="mailto:hello@aaritransactions.com" style={linkStyle}>hello@aaritransactions.com</a>
            &nbsp;&middot;&nbsp;
            <a href="tel:+12396881770" style={linkStyle}>239.688.1770</a>
            &nbsp;&middot;&nbsp;
            <a href="https://aaritransactions.com" style={linkStyle}>aaritransactions.com</a>
          </p>
          <p style={footerAddressStyle}>
            Aari Transactions LLC &middot; Lehigh Acres, FL
          </p>
          {unsubscribeUrl ? (
            <p style={footerUnsubStyle}>
              You're receiving this because you registered with Aari Transactions.{" "}
              <a href={unsubscribeUrl} style={unsubLinkStyle}>Unsubscribe</a>.
            </p>
          ) : null}
        </div>
      </div>
    </body>
  </html>
);

export default ChecklistDelivery;

// ---- Styles (inline, email-client safe) ----
const bodyStyle: React.CSSProperties = {
  backgroundColor: "#fafaf6",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  margin: 0,
  padding: "32px 16px",
  color: "#444",
};
const containerStyle: React.CSSProperties = {
  maxWidth: "560px",
  margin: "0 auto",
  backgroundColor: "#ffffff",
  border: "1px solid #e6e2d8",
  borderRadius: "12px",
  overflow: "hidden",
};
const headerStyle: React.CSSProperties = {
  padding: "24px 36px 18px",
  borderBottom: "1px solid #e6e2d8",
};
const wordmarkStyle: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontWeight: 600,
  fontSize: "22px",
  color: "#0f0f0f",
  letterSpacing: "3px",
  display: "inline-block",
  padding: "4px 12px",
  border: "1.5px solid #0f0f0f",
  borderRadius: "5px",
  lineHeight: 1,
};
const taglineStyle: React.CSSProperties = {
  fontSize: "10px",
  letterSpacing: "1.4px",
  textTransform: "uppercase",
  color: "#6b6b6b",
  fontWeight: 600,
  marginTop: "10px",
};
const contentStyle: React.CSSProperties = {
  padding: "32px 36px",
};
const h1Style: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: "28px",
  fontWeight: 500,
  color: "#0f0f0f",
  margin: "0 0 18px",
  lineHeight: 1.15,
};
const pStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#444",
  lineHeight: 1.6,
  margin: "0 0 14px",
};
const pSmallStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "#666",
  lineHeight: 1.55,
  margin: "0 0 12px",
};
const buttonStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#0f0f0f",
  color: "#ffffff",
  padding: "12px 22px",
  borderRadius: "6px",
  textDecoration: "none",
  fontSize: "14px",
  fontWeight: 600,
  letterSpacing: "0.3px",
};
const signoffStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#0f0f0f",
  margin: "26px 0 0",
  lineHeight: 1.5,
};
const signoffMetaStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#888",
  letterSpacing: "0.3px",
};
const footerStyle: React.CSSProperties = {
  padding: "18px 36px 28px",
  borderTop: "1px solid #e6e2d8",
};
const hrStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #e6e2d8",
  margin: "0 0 16px",
};
const footerContactStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6b6b6b",
  margin: "0 0 8px",
  lineHeight: 1.6,
};
const footerAddressStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#888",
  margin: "0 0 8px",
  lineHeight: 1.5,
};
const footerUnsubStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#888",
  margin: "8px 0 0",
};
const linkStyle: React.CSSProperties = {
  color: "#0f0f0f",
  textDecoration: "underline",
};
const unsubLinkStyle: React.CSSProperties = {
  color: "#888",
  textDecoration: "underline",
};
