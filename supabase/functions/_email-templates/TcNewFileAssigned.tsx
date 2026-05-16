// Email template · sent to a TC the moment a file is assigned to them.
// Used by edge function: send-tc-new-file
import * as React from "react";

interface Props {
  tcFirstName: string;
  agentName: string;
  agentEmail?: string;
  propertyAddress: string;
  fileIdShort: string;
  serviceName: string;
  closingDate?: string;
  portalUrl: string;
}

export const TcNewFileAssigned: React.FC<Props> = ({
  tcFirstName,
  agentName,
  agentEmail,
  propertyAddress,
  fileIdShort,
  serviceName,
  closingDate,
  portalUrl,
}) => (
  <div style={{
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
    maxWidth: 580,
    margin: "0 auto",
    padding: "32px 24px",
    color: "#0f0f0f",
    lineHeight: 1.55,
    backgroundColor: "#fff"
  }}>
    {/* Brand mark */}
    <div style={{ borderBottom: "1px solid #e8e8e6", paddingBottom: 16, marginBottom: 22 }}>
      <span style={{
        fontFamily: "Cormorant Garamond, Georgia, serif",
        fontWeight: 600,
        fontSize: 18,
        letterSpacing: 4,
        color: "#0f0f0f",
        border: "1.5px solid #0f0f0f",
        padding: "4px 10px",
        borderRadius: 5,
      }}>AARI</span>
    </div>

    {/* Headline */}
    <h1 style={{
      fontFamily: "Cormorant Garamond, Georgia, serif",
      fontWeight: 500,
      fontSize: 30,
      lineHeight: 1.1,
      letterSpacing: "-0.4px",
      margin: "0 0 8px",
    }}>
      New file assigned {tcFirstName ? `to you, ${tcFirstName}` : "to you"}.
    </h1>
    <p style={{ fontSize: 13, color: "#6b6b6b", margin: "0 0 24px", letterSpacing: "0.2px" }}>
      File <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>#{fileIdShort}</code> just landed in your queue.
    </p>

    {/* File summary card */}
    <div style={{
      background: "#f5f0e8",
      borderRadius: 10,
      padding: "20px 22px",
      margin: "0 0 26px",
    }}>
      <table style={{ width: "100%", fontSize: 14, borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ color: "#8a7f6a", padding: "5px 0", width: 110, verticalAlign: "top" }}>Agent</td>
            <td style={{ padding: "5px 0", color: "#0f0f0f", fontWeight: 500 }}>{agentName}{agentEmail ? <span style={{ color: "#6b6b6b", fontWeight: 400, fontSize: 12, display: "block" }}>{agentEmail}</span> : null}</td>
          </tr>
          <tr>
            <td style={{ color: "#8a7f6a", padding: "5px 0", verticalAlign: "top" }}>Property</td>
            <td style={{ padding: "5px 0", color: "#0f0f0f" }}>{propertyAddress}</td>
          </tr>
          <tr>
            <td style={{ color: "#8a7f6a", padding: "5px 0", verticalAlign: "top" }}>Service</td>
            <td style={{ padding: "5px 0", color: "#0f0f0f" }}>{serviceName}</td>
          </tr>
          {closingDate ? (
            <tr>
              <td style={{ color: "#8a7f6a", padding: "5px 0", verticalAlign: "top" }}>Closing</td>
              <td style={{ padding: "5px 0", color: "#0f0f0f" }}>{closingDate}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>

    {/* CTA */}
    <div style={{ margin: "0 0 28px" }}>
      <a href={portalUrl} style={{
        display: "inline-block",
        background: "#0a0a0a",
        color: "#fff",
        padding: "12px 24px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "1.8px",
        textTransform: "uppercase",
        textDecoration: "none",
      }}>
        Open file in portal &rarr;
      </a>
    </div>

    {/* Footer attribution */}
    <p style={{
      fontSize: 11,
      color: "#8a8a8a",
      margin: "32px 0 0",
      lineHeight: 1.7,
      borderTop: "1px solid #e8e8e6",
      paddingTop: 18,
    }}>
      You&rsquo;re receiving this because you were assigned to this file.<br />
      Aari Transactions LLC &middot; operated under Aari Realty &middot; FL Broker BK3530153
    </p>
  </div>
);
