// Section 8 · Task 8.2 · Confirmation email with all submitted details.
// Triggered on tc_files INSERT (via DB trigger -> call_edge_function).
// Sent to: agent who submitted the file.
// Category: transactional (no opt-out).

import * as React from "react";
import { Heading, Text } from "@react-email/components";
import { Layout } from "./_components/Layout.tsx";
import { Button } from "./_components/Button.tsx";

interface DetailRow {
  label: string;
  value?: string | null;
}

interface SectionGroup {
  title: string;
  rows: DetailRow[];
}

interface Props {
  firstName: string;
  fileId: string;
  submittedAt: string;
  portalUrl: string;
  sections: SectionGroup[];
  documents?: string[];
}

// Verbatim per Section 8 · Task 8.2 spec. Do not alter this string.
const VERBATIM_NOTE =
  "If anything changes or you forgot to submit documents, please return to your portal profile to update your submission.";

export const IntakeConfirmation: React.FC<Props> = ({
  firstName,
  fileId,
  submittedAt,
  portalUrl,
  sections,
  documents,
}) => (
  <Layout preview="We have your file. Here's everything you submitted." category="transactional">
    <Heading style={h1}>We have your file.</Heading>
    <Text style={p}>Hi {firstName},</Text>
    <Text style={p}>
      Your file landed at <strong>{submittedAt}</strong>. Reference: <strong>#{fileId}</strong>.
    </Text>
    <Text style={p}>
      Below is everything you submitted. Keep this email for your records.
    </Text>

    {sections.map((sec, i) => {
      const visibleRows = sec.rows.filter((r) => r.value && String(r.value).trim());
      if (visibleRows.length === 0) return null;
      return (
        <div key={i} style={sectionWrap}>
          <Text style={sectionHead}>{sec.title}</Text>
          {visibleRows.map((r, j) => (
            <div key={j} style={row}>
              <span style={rowLabel}>{r.label}</span>
              <span style={rowValue}>{r.value}</span>
            </div>
          ))}
        </div>
      );
    })}

    {documents && documents.length > 0 ? (
      <div style={sectionWrap}>
        <Text style={sectionHead}>Documents submitted</Text>
        <ul style={docList}>
          {documents.map((d, i) => (
            <li key={i} style={docItem}>{d}</li>
          ))}
        </ul>
      </div>
    ) : null}

    <div style={{ marginTop: 22, marginBottom: 6 }}>
      <Button href={portalUrl}>View in your portal</Button>
    </div>

    <div style={noteWrap}>
      <Text style={noteText}>{VERBATIM_NOTE}</Text>
    </div>
  </Layout>
);

export default IntakeConfirmation;

// ---- styles ----
const h1: React.CSSProperties = {
  fontFamily: "Georgia, serif",
  fontSize: 28,
  fontWeight: 500,
  color: "#0f0f0f",
  margin: "0 0 18px",
  lineHeight: 1.15,
};
const p: React.CSSProperties = {
  fontSize: 14,
  color: "#444",
  lineHeight: 1.6,
  margin: "0 0 14px",
};
const sectionWrap: React.CSSProperties = {
  background: "#fbf9f4",
  border: "1px solid rgba(150,122,74,0.18)",
  borderRadius: 8,
  padding: "14px 16px",
  margin: "16px 0",
};
const sectionHead: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#967a4a",
  margin: "0 0 10px",
};
const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  padding: "6px 0",
  borderBottom: "1px solid rgba(150,122,74,0.12)",
  fontSize: 13,
  gap: 12,
};
const rowLabel: React.CSSProperties = {
  color: "#6b6b6b",
  fontWeight: 600,
  fontSize: 12,
  minWidth: 130,
};
const rowValue: React.CSSProperties = {
  color: "#0f0f0f",
  fontWeight: 500,
  textAlign: "right",
  flex: 1,
  wordBreak: "break-word",
};
const docList: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "#0f0f0f",
};
const docItem: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.65,
};
const noteWrap: React.CSSProperties = {
  marginTop: 28,
  paddingTop: 16,
  borderTop: "1px solid rgba(150,122,74,0.25)",
};
const noteText: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: "#444",
  margin: 0,
  fontStyle: "italic",
};
