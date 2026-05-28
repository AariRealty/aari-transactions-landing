// Edge function: aari-sa-pdf-email
// ============================================================================
// Generates a PDF of the signed Aari Transactions Service Agreement (v4.7),
// embeds the agent's drawn signature image, and emails it as an attachment to
// the agent + agreements@aaritransactions.com via Resend.
//
// Invocation: HTTP POST from the browser (signature flow in index.html).
// Auth: none required (--no-verify-jwt). CORS is permissive.
//
// Request body (JSON):
//   {
//     agent_name: string,
//     agent_email: string,
//     agent_phone: string,
//     agent_license: string,
//     agent_license_state: string,
//     agent_brokerage: string,
//     signed_at_iso: string,
//     signed_at_display: string,
//     signature_data_url: string (data:image/png;base64,...),
//     agreement_version: string,
//     user_agent: string,
//     locale: string
//   }
//
// Response: { ok: true } | { ok: false, error: string }
// ============================================================================

import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// ---------------------------------------------------------------------------
// Supabase admin client · inlined (not imported from _shared) so the function
// remains a single-file source for in-dashboard deploys.
// ---------------------------------------------------------------------------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = (SUPABASE_URL && SERVICE_ROLE_KEY)
  ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

// ---------------------------------------------------------------------------
// CORS — permissive for v1. Tighten to https://aaritransactions.com later.
// ---------------------------------------------------------------------------
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// SA v4.7 text — verbatim from index.html (sa-doc-intake-text block).
// HTML entities have been decoded to literal characters because pdf-lib's
// WinAnsi-encoded StandardFonts cannot render entity references and many
// Unicode characters. Smart quotes / em-dashes are mapped to their ASCII
// equivalents to ensure all glyphs are available in StandardFonts.Helvetica.
// ---------------------------------------------------------------------------
const SA_TEXT_V4_7 = `AARI TRANSACTIONS LLC
TRANSACTION COORDINATION SERVICES AGREEMENT
Version 4.7 - Effective May 26, 2026
Effective as of the date of electronic acceptance by Agent below

PARTIES. This Transaction Coordination Services Agreement (this "Agreement") is entered into between Aari Transactions, LLC, a Florida limited liability company ("Aari"), and the undersigned licensed real estate professional ("Agent"). Aari and Agent are each a "Party" and collectively the "Parties."

IMPORTANT - STRUCTURE OF THIS AGREEMENT (read first). Aari Transactions, LLC and Aari Realty, LLC (a Florida-licensed real estate brokerage) are under common ownership. Aari's transaction coordinators may include licensed real estate professionals affiliated with Aari Realty, as well as non-licensed administrative service providers and independent contractors. Because of this common ownership and the potential for personnel overlap between the two entities, Aari Realty, LLC is also bound by this Agreement for purposes of Section 7 (Mutual Non-Solicitation and Non-Circumvention) only. Each entity is severally liable for its own conduct under Section 7. The two entities are not jointly liable for each other's breaches.

What this Agreement is not. This Agreement governs the contractual relationship between Aari and Agent only. Agent's clients (the buyers and sellers represented by Agent in any transaction) are not parties to this Agreement, have no rights or obligations under it, and are not third-party beneficiaries. Agent retains full and direct ownership of, and responsibility for, Agent's client relationships at all times.

RECITALS. Aari operates a transaction coordination service, providing administrative and compliance support to licensed real estate professionals from the time a contract is executed through closing and post-closing file archive. Agent wishes to engage Aari for transaction coordination services on the terms set forth below. The Parties agree as follows.

1. Scope of Services
Aari provides administrative transaction coordination services, including (without limitation): contract review for completeness and signature audit; tracking of inspection, financing, appraisal, title, HOA, and walk-through deadlines; coordination with title agents, lenders, and HOA management; preparation of pre-listing and listing-management documents; document organization and audit-ready file compliance review; commission disbursement coordination; and post-closing document archive.

The specific scope of services for any engagement is determined by the service tier selected by Agent at the time the file is submitted to Aari, as set forth in Aari's then-current rate schedule provided to Agent. Pricing and inclusions in effect at the time of file submission govern that file.

Excluded Services. Aari does not perform any activity requiring a real estate license under the laws of any state, including (without limitation) negotiation of price or terms on behalf of a party, advising a party as to value, marketing properties, presenting offers, or any other activity reserved by law to a licensed real estate broker or sales associate. Agent retains sole responsibility for all such activities.

Post-Closing File Purge. Aari does not retain client files, transaction documents, or personally identifiable client information following the closing of a transaction or termination of an engagement on a file that does not close. Within thirty (30) days following closing (or termination of the engagement on a non-closing file), Aari shall permanently delete or irreversibly de-identify all Client Data from its active systems, systems backups, and archival storage. Aari retains no copies of client files post-closing.

Agent acknowledges that Agent's sponsoring brokerage, not Aari, is the records custodian for the underlying transaction file under applicable law. This provision clarifies that Aari maintains no post-closing file retention obligation or archive function.

Client Contact Limitation. Aari's primary communication channel is the Agent. Aari shall not contact Agent's client (buyer or seller) directly by telephone or text message without Agent's prior written authorization for that specific file. Agent may authorize Aari to communicate directly with Agent's client on a per-file basis by written instruction. Absent such instruction, all client communications shall route through Agent. This Section does not restrict Aari's communications with title agents, lenders, HOA management, or other third-party service providers in connection with the transaction.

2. Fees and Payment
Service Tiers. Current service tiers and fees are set forth in Aari's then-current rate schedule provided to Agent. The price in effect at the time Agent submits a file applies to that file. Aari may update its rate schedule prospectively; updated pricing applies only to files submitted after the update.

Payment Terms.
(a) Transaction Coordination (TC) Services ("Pay at Closing" services): Fee due at closing of the transaction, payable from settlement proceeds via electronic payment method. Agent must authorize Aari to receive payment directly from the title company settlement statement prior to closing. The electronic payment method will be specified in the Rate Schedule or agreed in writing by both Parties before the file opens. If the transaction does not close through no fault of Agent, no TC fee is owed.

(b) CDA / Settlement Authorization: As a condition of file acceptance, Agent shall provide written authorization (Commission Disbursement Authorization or similar settlement instruction) to Aari and the title company specifying that Aari's TC fee will be paid from settlement proceeds via the electronic payment method designated in the Rate Schedule. This authorization shall remain in effect for all future files unless revoked in writing. If Aari does not receive valid written authorization before file opening, Aari may decline to commence services until authorization is provided. If a transaction closes and Agent fails to direct payment of the TC fee through the authorized settlement mechanism, the fee remains owed in full and Aari may pursue collection by all lawful means, including offset against any membership credits, loyalty bonuses, or other amounts owed to Agent.

(c) Listing Coordinator (LC): Fee due in full electronically before any work commences. Non-refundable once work commences, subject to the 24-hour cancellation right described below.

(d) Add-Ons (Offer Prep, Listing Docs Only, MLS Setup Only, File Organization): Due electronically upfront at the time of order. Non-refundable once work commences, subject to the 24-hour cancellation right described below.

Definition of "Work Commences" and 24-Hour Cancellation Right. For upfront-paid services (Listing Coordinator and all Add-Ons), "work commences" means the earlier of: (i) Aari's coordinator first edits, drafts, or modifies a document on Agent's behalf; or (ii) Aari sends a substantive external communication (e.g., to title, lender, HOA, or buyer's agent) on Agent's behalf in connection with the file. Internal intake review, file routing, and automated acknowledgment messages do not constitute "work commencing." Agent has a one-time written cancellation right within twenty-four (24) hours of payment for a full refund, provided no external communication has been sent and no document editing has begun. Cancellation requests must be sent in writing to hello@aaritransactions.com within the 24-hour window.

(e) Aari Pro Membership (Starter / Producer): Recurring monthly or annual fee billed electronically. Subject to the membership terms acknowledged electronically at the time of enrollment, including the requirement that Agent use Aari for transaction coordination on every Aari-Engaged File closed during the membership period. An "Aari-Engaged File" means a file on which Aari has performed pre-contract work at Agent's direction (including offer preparation, listing preparation, MLS setup, or pre-execution coordination). Files the Agent writes independently, walk-in offers, lot deals, brokerage-mandated handling, and confidentiality cases are not Aari-Engaged Files and are excluded from this exclusivity requirement.

Aari Pro Membership Billing Schedule.
(i) Monthly Billing: Aari Pro monthly membership fees will be billed on the same day of each month that Agent enrolls, regardless of whether that date falls on a weekend or holiday. If the billing date does not exist in a given month (e.g., the 31st in February), billing shall occur on the last day of that month. This schedule applies consistently throughout the membership period.
(ii) Annual Billing: Aari Pro annual membership fees will be billed on the same day of the year (anniversary date) that Agent enrolls, regardless of whether that date falls on a weekend or holiday. If the renewal date does not exist in a given year (e.g., February 29), billing shall occur on the last day of February of that year.
(iii) Non-Refundable: All Aari Pro membership payments are non-refundable once submitted, regardless of whether the billing period has commenced or whether the Agent has begun using the service.

Late Payment Fee. A late payment fee of $25.00 shall apply to all fees not received by the due date, regardless of fee type or service category. This late fee applies uniformly to: monthly Aari Pro memberships, annual Aari Pro memberships, one-time transaction coordination fees, add-ons, and any other fees for services provided by Aari. The $25.00 late fee is due in addition to the original fee amount and shall be assessed per late payment (not per day overdue). Aari may suspend services on past-due files until both the original fee and the late fee are received in full.

Revision Definition and Billing. For Offer Prep services, a "Revision" means any change to a previously delivered offer document requested by Agent after the document has been provided to Agent for signature or transmission to the buyer, regardless of the size or nature of the change. Multiple changes communicated in a single written request constitute one Revision; changes communicated in separate written requests are separate Revisions. Revision billing is governed by the service tier selected: (i) Offer Prep Basic: no revisions included; each revision after delivery is billed at $25.00 per Revision, payable upfront before Aari undertakes the revision work; (ii) Offer Prep Complete: unlimited revisions included before buyer signature; one revision included after buyer signature; each additional revision after signature is billed at $25.00 per Revision, payable upfront. Typographical corrections initiated by Aari are not Revisions and are not billed.

3. Agent Responsibilities
Agent shall:
(a) Maintain an active real estate license in good standing in each state in which Agent practices throughout the engagement.
(b) Provide complete, accurate, and timely information regarding each file submitted to Aari.
(c) Grant Aari access to the compliance system, document signing platform, and other systems reasonably necessary for Aari to perform the services. Agent shall not provide MLS credentials to Aari, and Aari shall not request or accept MLS credentials.
(d) Comply with all applicable laws, including but not limited to laws and rules governing real estate licensees in the states where Agent practices, RESPA, Fair Housing laws, and Agent's sponsoring brokerage policies.
(e) Disclose Aari's role in the transaction to clients and brokerage where required by Agent's sponsoring brokerage or applicable law.
(f) Retain ultimate professional and legal responsibility for the transaction, including all activity requiring a real estate license.
(g) Pay all fees in accordance with Section 2.
(h) Accuracy of Information. Agent represents and warrants that all information, documents, photos, and materials provided to Aari are accurate, complete, and current. Agent agrees to indemnify and hold harmless Aari from any claim, damage, or loss arising from Aari's reliance on inaccurate, incomplete, or outdated information provided by Agent.

4. Aari Responsibilities
Aari shall:
(a) Perform the services with reasonable professional skill and diligence consistent with industry standards for transaction coordination.
(b) Track deadlines and provide written status updates at the milestones reasonably expected for the service tier engaged.
(c) Maintain each file in an audit-ready compliance state suitable for review by Agent's sponsoring brokerage.
(d) Communicate professionally with Agent, Agent's clients (when authorized), title agents, lenders, and other transaction parties.
(e) Identify and notify Agent in writing of material risks or deficiencies discovered in a file (including missing signatures, expired disclosures, or compliance gaps).
(f) Engage only coordinators trained on Aari's internal compliance standards and the transaction practices applicable to the states in which they coordinate.
(g) Errors & Omissions Insurance and Independent Contractors. Aari maintains Errors & Omissions (E&O) liability insurance with a per-occurrence limit of $1,000,000 and an annual aggregate limit of $1,000,000, covering transaction coordination services provided by Aari, including services performed by independent contractors engaged by Aari. The Aari E&O insurance policy covers coordinators hired by Aari as independent contractors. Aari shall provide a current certificate of insurance to Agent upon written request, showing Agent as an interested party. Agent acknowledges that in the event of a dispute or claim related to Aari's coordination services, the E&O policy held by Aari (not Agent's E&O) shall be the primary coverage for claims arising from Aari's coordination activities. Aari shall notify Agent within five (5) business days of any material reduction, cancellation, or non-renewal of its E&O coverage.

(h) Coordinator Error Resolution. If Aari believes its coordination work has materially contributed to a transaction harm (missed deadline, document error, miscommunication on a file), Aari shall (i) acknowledge the error in writing to Agent within forty-eight (48) hours of Aari's discovery of the error; (ii) work in good faith to mitigate or remedy the issue at Aari's expense, including without limitation expedited document filing, fee payment to extend deadlines where commercially reasonable, and direct communication with affected parties; and (iii) document the resolution in the file. The acknowledgment obligation in this Section 4(h) does not constitute admission of liability or waiver of the limitations of liability set forth in Section 12.

5. Confidentiality and Non-Disclosure (Mutual NDA)
Definition. "Confidential Information" means all non-public information disclosed by one Party ("Disclosing Party") to the other ("Receiving Party") in connection with this Agreement, including without limitation: client identities and contact information; contract terms; financial and lender information; commission structures and split arrangements; brokerage compliance procedures and templates; Aari's internal workflows, systems, software, scripts, processes, and pricing methodology; trade secrets; and any other information a reasonable person would understand to be confidential.

Obligations. The Receiving Party shall:
(a) Use Confidential Information solely to perform its obligations under this Agreement.
(b) Not disclose Confidential Information to any third party without the Disclosing Party's prior written consent.
(c) Protect Confidential Information using the same degree of care it uses to protect its own confidential information of like importance, but in no event less than reasonable care.
(d) Limit access to Confidential Information to its personnel and contractors who have a need to know and who are bound by confidentiality obligations no less protective than those herein.

Exclusions. Confidential Information does not include information that: (i) is or becomes publicly available through no fault of the Receiving Party; (ii) was lawfully known to the Receiving Party without restriction prior to disclosure; (iii) is lawfully received from a third party without restriction; or (iv) is independently developed without reference to the Disclosing Party's Confidential Information.

Survival. The obligations in this Section 5 survive termination of this Agreement for a period of five (5) years, except that obligations with respect to trade secrets survive for so long as the information remains a trade secret under applicable law.

Compelled Disclosure. If the Receiving Party is required by subpoena, court order, or applicable law to disclose Confidential Information, the Receiving Party shall (where legally permitted) provide the Disclosing Party prompt written notice and reasonable cooperation in seeking a protective order.

6. Client Data Handling, Retention, and Deletion
Client Data. Aari treats all Agent client information - including names, contact information, financial information, and transaction details (collectively, "Client Data") - as Confidential Information of Agent.

Deletion After Closing. Within thirty (30) days following the closing of a transaction file (or termination of an engagement on a file that does not close), Aari shall delete or irreversibly de-identify Client Data from its active systems, retaining only:
(a) Final closing documents and records required to be retained by applicable law, brokerage record-retention rules, or Aari's audit obligations.
(b) Anonymized or aggregated transaction records used for internal quality assurance and compliance metrics, with all personally identifiable information removed.
(c) Records reasonably necessary to comply with a subpoena, court order, regulatory request, or pending claim.

Backups. The deletion obligation in this Section 6 does not apply to backup copies retained on rotation in the ordinary course of Aari's data-protection practices, provided that such backups are deleted within ninety (90) days of creation in the ordinary course.

Agent Acknowledgment. Agent acknowledges that Agent's sponsoring brokerage, and not Aari, is the records custodian for the underlying transaction file under applicable law. This Section 6 governs only Aari's internal copies of Client Data.

7. Mutual Non-Solicitation and Non-Circumvention
Agent's Restrictions. During the term of this Agreement and for a period of twelve (12) months following its termination, Agent shall not, directly or indirectly, individually or through any other person or entity:
(a) Solicit, hire, recruit, or attempt to hire any Aari coordinator, employee, or independent contractor with whom Agent had material contact during the engagement, or encourage any such person to terminate their engagement with Aari, in any state.
(b) Solicit, contact, or accept transaction coordination work from any Aari client, vendor, or transaction party introduced to Agent through Aari's services, in Florida or Georgia, for the purpose of providing or procuring transaction coordination services from a competitor of Aari.
(c) Use Aari's Confidential Information to circumvent Aari and engage Aari's coordinators or referral sources directly.

Aari's Reciprocal Restriction. Aari Transactions, LLC, Aari Realty, and all of their employees, coordinators, licensed agents, and independent contractors shall not use Agent's Client Data for any purpose other than providing transaction coordination services, and shall not solicit, market to, retain in CRM, or provide real estate brokerage services to any of Agent's clients whose information was obtained through Aari's Transaction services. This restriction applies during the term of this Agreement and for twenty-four (24) months after the closing or termination of each transaction file.

Authority to Bind Aari Realty, LLC. As stated in the PARTIES section above, the undersigned signatory for Aari (Marlenyi Paredes) is the sole owner and authorized signatory of both Aari Transactions, LLC and Aari Realty, LLC. By executing this Agreement, the signatory binds both entities to the obligations set forth in this Section 7. Each entity is severally liable for its own breach of this Section by such entity or its respective employees, coordinators, licensed agents, or independent contractors. The two entities are not jointly liable for each other's breaches; each is responsible solely for its own conduct.

Legitimate Business Interests. The Parties acknowledge that the foregoing restrictions are reasonably necessary to protect each Party's respective legitimate business interests. Aari's legitimate business interests include without limitation: (i) substantial relationships with prospective and existing clients and coordinators; (ii) valuable confidential business information and trade secrets; (iii) extraordinary or specialized training provided to coordinators; and (iv) goodwill associated with the Aari brand and systems. Agent's legitimate business interests include without limitation: (i) substantial relationships with Agent's clients; (ii) Agent's investment in the development and maintenance of those client relationships; and (iii) protection of Agent's Client Data from unauthorized use, solicitation, or marketing.

Reasonableness. The Parties further acknowledge that the duration and scope of these restrictions are reasonable in light of the legitimate business interests being protected. With respect to Agent's Restrictions: a duration of twelve (12) months, geographic scope of any state (for coordinator solicitation) or Florida and Georgia (for client solicitation), and substantive scope limited to transaction coordination services, are reasonable. With respect to Aari's Reciprocal Restriction: a duration of twenty-four (24) months from the closing or termination of each transaction file, and substantive scope limited to non-use, non-solicitation, non-marketing, non-CRM-retention, and non-brokerage-services with respect to Agent's Client Data obtained through Aari's services, are reasonable. If a court of competent jurisdiction determines that any restriction is unenforceable as written, the Parties intend that the court reform the restriction to the maximum scope enforceable under applicable law.

Remedies. Each Party acknowledges that breach of this Section 7 will cause the other Party irreparable harm for which monetary damages would be inadequate. The non-breaching Party is entitled to seek injunctive relief in addition to any other remedies available at law or in equity.

8. Aari Pro Membership
If Agent enrolls in an Aari Pro membership (Starter or Producer), the following additional terms apply:
(a) Membership benefits are conditional on Agent using Aari for transaction coordination on every Aari-Engaged File (as defined in Section 2(e)) closed during the membership period. Files that are not Aari-Engaged Files are not subject to this exclusivity requirement. Membership benefits include service credits, per-file TC discounts, activity bonus credits, and (for Producer Membership) priority TC assignment, as described in Aari's then-current rate schedule and on aaritransactions.com.
(b) Unused monthly benefits do not roll over to subsequent periods.
(c) Loyalty bonus offer preps are awarded after the qualifying number of files have closed with Aari and expire ninety (90) days from award if not used.
(d) Membership may be cancelled at any time effective at the end of the then-current billing period. Fees already paid for the current billing period and benefits already used during that period are non-refundable.
(e) Aari reserves the right to terminate or suspend membership for material breach of this Agreement, including failure to use Aari for full transaction coordination as required.
(f) Agent shall, upon Aari's reasonable written request, certify in writing the number of transactions Agent closed during any membership period and confirm that all such transactions were coordinated through Aari. Aari may suspend or terminate membership benefits, and pursue any other remedy available under this Agreement, if Agent fails to provide such certification or if the certification reveals a breach of the exclusivity requirement in Section 8(a).

9. Term and Termination
Term. This Agreement is effective upon Agent's electronic acceptance and continues until terminated as provided herein.

Termination for Convenience. Either Party may terminate this Agreement upon thirty (30) days written notice to the other.

Termination for Cause. Either Party may terminate this Agreement immediately upon written notice if the other Party (i) materially breaches this Agreement and fails to cure within ten (10) days of written notice of the breach, or (ii) becomes insolvent, files for bankruptcy, or ceases to do business.

Effect of Termination. Upon termination: (i) Agent shall pay all fees due for services rendered prior to termination; (ii) Aari shall complete or transition pending files in good faith; (iii) the obligations of Sections 5 (NDA), 6 (Client Data), 7 (Mutual Non-Solicitation and Non-Circumvention), 11 (Indemnification), 12 (Limitation of Liability), 16 (Governing Law), and any other provision intended to survive termination shall survive.

10. Licensing and Independent Contractor Status
Aari Transactions, LLC is not a real estate brokerage and does not engage in any activity requiring a real estate license under the laws of any state. When acting as Aari Transactions coordinators, individuals provide administrative coordination services only and do not engage in any activity requiring a real estate license in that capacity. As stated in the PARTIES section, certain Aari Transactions coordinators may also hold real estate licenses in their separate capacity as agents of Aari Realty, LLC; however, those individuals do not exercise licensed real estate activity in their role as Aari Transactions coordinators. Coordinators may be hired by Aari Transactions as employees or as independent contractors. Agent retains the duties of a licensed real estate professional and remains solely responsible for the licensed-activity portions of every transaction.

The Parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, employer-employee relationship, agency, or franchise. Neither Party has authority to bind the other.

11. Indemnification
Each Party (the "Indemnifying Party") shall indemnify, defend, and hold harmless the other Party and its officers, members, employees, contractors, and agents from and against any third-party claims, damages, losses, liabilities, and reasonable attorneys' fees arising out of or related to: (i) the Indemnifying Party's gross negligence, willful misconduct, or fraud; (ii) the Indemnifying Party's material breach of this Agreement; or (iii) the Indemnifying Party's violation of applicable law in connection with the services.

12. Limitation of Liability
Cap. EXCEPT FOR LIABILITY ARISING UNDER SECTION 5 (NDA), SECTION 7 (NON-SOLICITATION), OR EITHER PARTY'S GROSS NEGLIGENCE, WILLFUL MISCONDUCT, OR FRAUD, AARI'S TOTAL AGGREGATE LIABILITY UNDER THIS AGREEMENT FOR ANY CLAIM ARISING FROM A SPECIFIC FILE SHALL NOT EXCEED THE FEES ACTUALLY PAID BY AGENT TO AARI FOR THAT FILE.

Excluded Damages. IN NO EVENT SHALL EITHER PARTY BE LIABLE TO THE OTHER FOR CONSEQUENTIAL, INCIDENTAL, INDIRECT, SPECIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST OPPORTUNITY, OR LOST GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

13. No Legal, Tax, or Financial Advice
Aari provides administrative coordination services only. Aari does not provide legal advice, tax advice, financial advice, or real estate brokerage services. Agent and Agent's clients are advised to consult licensed attorneys, certified public accountants, and other appropriate licensed professionals for advice in those domains.

14. Disclaimers and Force Majeure
Service Disclaimer. AARI PROVIDES THE SERVICES "AS IS" AND DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT, EXCEPT AS EXPRESSLY PROVIDED HEREIN.

Force Majeure. Neither Party is liable for delay or failure to perform caused by acts of God, natural disasters, government action, public health emergencies, internet or utility failures, or other events outside its reasonable control. The affected Party shall give prompt notice and resume performance as soon as reasonably practicable. Notwithstanding the foregoing, Agent's obligation to pay fees already earned by Aari for services performed prior to a force majeure event is not excused by this Section.

15. Notices
Notices under this Agreement shall be in writing and delivered to the email address on file for each Party, with confirmation of receipt. Notices to Aari may also be sent to hello@aaritransactions.com or to the registered agent address on file with the Florida Department of State. Notices to Agent shall be sent to the email address provided on the agent onboarding form.

16. Governing Law and Venue
This Agreement is governed by and construed in accordance with the laws of the State of Florida, without regard to its conflict-of-laws principles. The Parties consent to the exclusive jurisdiction and venue of the state and federal courts located in Lee County, Florida, for any dispute arising under or related to this Agreement.

Attorneys' Fees. In any action to enforce this Agreement, the prevailing Party is entitled to recover its reasonable attorneys' fees and costs from the non-prevailing Party.

17. Miscellaneous
Entire Agreement. This Agreement, together with Aari's then-current service descriptions and rate schedule provided to Agent, and any specific consents provided electronically at the time of enrollment or order, constitutes the entire agreement between the Parties and supersedes all prior or contemporaneous communications.

Amendment. Aari may update this Agreement upon thirty (30) days' prior written notice to Agent. Continued use of Aari's services after the effective date of an updated version constitutes acceptance of the updated terms. Agent may terminate this Agreement during the notice period without penalty if Agent does not accept an amendment. Files Already Submitted. Notwithstanding the foregoing, files already submitted to Aari prior to the effective date of an amendment shall continue to be governed by the version of this Agreement in effect at the time the file was submitted, through closing or termination of the engagement on that file.

Severability. If any provision of this Agreement is held unenforceable, the remaining provisions remain in full force and effect, and the unenforceable provision shall be reformed to the minimum extent necessary to make it enforceable.

Waiver. No waiver of any provision of this Agreement is effective unless in writing and signed by the waiving Party. Failure to enforce any right under this Agreement does not constitute a waiver of that right.

Assignment. Agent may not assign this Agreement without Aari's prior written consent. Aari may assign this Agreement to an affiliate or in connection with a merger, acquisition, or sale of substantially all of its assets.

Counterparts and Electronic Signatures. This Agreement may be executed electronically and in counterparts, each of which is deemed an original. The Parties consent to electronic execution under Fla. Stat. Section 668.50 (Uniform Electronic Transaction Act).

18. Acknowledgment and Acceptance
By submitting the Aari Transactions agent onboarding form (or, for new files only, by checking the Service Agreement acknowledgment in the New File Intake form), Agent acknowledges that Agent has:
(i) Read this Agreement in full;
(ii) Had a reasonable opportunity to consult with Agent's own counsel regarding its terms;
(iii) Understood the rights and obligations created by this Agreement; and
(iv) Agreed to be bound by all of its terms.

19. Signatures
The Parties have executed this Agreement as of the date(s) set forth below. Electronic signatures are valid and binding under applicable electronic transaction law.

-- END OF AGREEMENT --`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SaPayload {
  agent_name?: string;
  agent_email?: string;
  agent_phone?: string;
  agent_license?: string;
  agent_license_state?: string;
  agent_brokerage?: string;
  signed_at_iso?: string;
  signed_at_display?: string;
  signature_data_url?: string;
  agreement_version?: string;
  user_agent?: string;
  locale?: string;
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Sanitize stray non-WinAnsi glyphs that may slip through (smart quotes, etc.)
// so pdf-lib's Helvetica encoder doesn't throw on draw.
function sanitizeForWinAnsi(s: string): string {
  return s
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, "-")
    .replace(/[…]/g, "...")
    .replace(/[ ]/g, " ")
    .replace(/[•]/g, "*")
    .replace(/[§]/g, "Section ")
    .replace(/[^\x00-\xFF]/g, "?"); // anything still outside WinAnsi → '?'
}

// Wrap a paragraph to a target width given the font + size used.
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para.trim() === "") {
      lines.push("");
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";
    for (const w of words) {
      const test = current ? current + " " + w : w;
      const width = font.widthOfTextAtSize(test, size);
      if (width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        // Word longer than line — hard break it.
        if (font.widthOfTextAtSize(w, size) > maxWidth) {
          let chunk = "";
          for (const ch of w) {
            if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = w;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

// Slug-ify the agent email/name for the attachment filename.
function slugForFilename(name: string, email: string): string {
  const fromName = (name || "").trim();
  if (fromName) {
    const parts = fromName.split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    return last.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
  }
  const local = (email || "").split("@")[0] || "agent";
  return local.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}

// Decode a data: URL into raw bytes. Returns null on failure.
function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const m = dataUrl.match(/^data:(image\/(?:png|jpe?g));base64,(.+)$/i);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const b64 = m[2].replace(/\s+/g, "");
  try {
    const binStr = atob(b64);
    const out = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) out[i] = binStr.charCodeAt(i);
    return { bytes: out, mime };
  } catch {
    return null;
  }
}

// Convert PDF bytes to base64 (chunked to avoid Stack overflow on large arrays).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
  }
  return btoa(binary);
}

// ---------------------------------------------------------------------------
// PDF builder
// ---------------------------------------------------------------------------

async function buildPdf(p: SaPayload): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const PAGE_W = 612; // US Letter
  const PAGE_H = 792;
  const MARGIN_L = 54;
  const MARGIN_R = 54;
  const MARGIN_T = 60;
  const MARGIN_B = 60;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;

  const BODY_SIZE = 9.5;
  const BODY_LEADING = 12.5;
  const HEAD_SIZE = 14;
  const SUB_SIZE = 10;
  const BLACK = rgb(0, 0, 0);
  const GREY = rgb(0.35, 0.35, 0.35);

  // Page list + cursor.
  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN_T;

  function ensureSpace(needed: number) {
    if (y - needed < MARGIN_B) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN_T;
    }
  }

  function drawHeading(text: string) {
    ensureSpace(HEAD_SIZE + 6);
    page.drawText(sanitizeForWinAnsi(text), {
      x: MARGIN_L,
      y: y - HEAD_SIZE,
      size: HEAD_SIZE,
      font: fontBold,
      color: BLACK,
    });
    y -= HEAD_SIZE + 4;
  }

  function drawSub(text: string) {
    ensureSpace(SUB_SIZE + 6);
    page.drawText(sanitizeForWinAnsi(text), {
      x: MARGIN_L,
      y: y - SUB_SIZE,
      size: SUB_SIZE,
      font: fontItalic,
      color: GREY,
    });
    y -= SUB_SIZE + 8;
  }

  function drawBody(text: string, opts: { bold?: boolean; size?: number } = {}) {
    const f = opts.bold ? fontBold : font;
    const s = opts.size ?? BODY_SIZE;
    const lines = wrapText(sanitizeForWinAnsi(text), f, s, CONTENT_W);
    for (const ln of lines) {
      ensureSpace(BODY_LEADING);
      page.drawText(ln, { x: MARGIN_L, y: y - s, size: s, font: f, color: BLACK });
      y -= BODY_LEADING;
    }
  }

  function drawSpacer(h: number) {
    y -= h;
    ensureSpace(0);
  }

  // ---- Header block ----
  drawHeading("Aari Transactions LLC - Transaction Coordination Services Agreement");
  drawSub("Version " + (p.agreement_version || "4.7") + " - Effective May 26, 2026");
  drawSpacer(6);

  // ---- Agent info block ----
  drawBody("AGENT INFORMATION", { bold: true, size: 10 });
  drawSpacer(2);
  drawBody("Name: " + (p.agent_name || ""));
  drawBody("Email: " + (p.agent_email || ""));
  drawBody("Phone: " + (p.agent_phone || ""));
  drawBody(
    "License: " + (p.agent_license || "") + (p.agent_license_state ? " (" + p.agent_license_state + ")" : ""),
  );
  drawBody("Brokerage: " + (p.agent_brokerage || ""));
  drawSpacer(10);

  // ---- Full SA text ----
  // Paragraphs are separated by blank lines in SA_TEXT_V4_7. We render each
  // paragraph as a body block, leaving a small gap between them.
  const paragraphs = SA_TEXT_V4_7.split(/\n\n+/);
  for (const para of paragraphs) {
    drawBody(para);
    drawSpacer(4);
  }

  // ---- Signature block ----
  drawSpacer(10);
  ensureSpace(140);
  drawBody("AGENT SIGNATURE", { bold: true, size: 11 });
  drawSpacer(4);

  // Embed signature image if provided.
  const sig = p.signature_data_url ? dataUrlToBytes(p.signature_data_url) : null;
  if (sig) {
    try {
      const img =
        sig.mime === "image/png"
          ? await pdf.embedPng(sig.bytes)
          : await pdf.embedJpg(sig.bytes);
      // Target signature box: max 240 x 80 pt, keep aspect ratio.
      const maxW = 240;
      const maxH = 70;
      const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ensureSpace(h + 4);
      page.drawImage(img, { x: MARGIN_L, y: y - h, width: w, height: h });
      // Baseline under signature.
      page.drawLine({
        start: { x: MARGIN_L, y: y - h - 2 },
        end: { x: MARGIN_L + Math.max(w, 240), y: y - h - 2 },
        thickness: 0.5,
        color: GREY,
      });
      y -= h + 8;
    } catch (err) {
      console.warn("[aari-sa-pdf-email] signature image embed failed:", err);
      drawBody("(Signature image could not be rendered)");
    }
  } else {
    drawBody("(No drawn signature provided)");
  }

  drawBody("Typed Name: " + (p.agent_name || ""));
  drawBody("Signed at: " + (p.signed_at_display || p.signed_at_iso || ""));
  drawBody("Signing Law: Fla. Stat. Section 668.50 (Uniform Electronic Transaction Act)");

  drawSpacer(8);
  drawBody(
    "Audit metadata: user_agent=" +
      (p.user_agent || "n/a") +
      " | locale=" +
      (p.locale || "n/a"),
    { size: 7.5 },
  );

  // ---- Footer page numbers ----
  const pages = pdf.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const pg = pages[i];
    pg.drawText("Page " + (i + 1) + " of " + total, {
      x: PAGE_W - MARGIN_R - 70,
      y: 30,
      size: 8,
      font,
      color: GREY,
    });
    pg.drawText(
      "Aari Transactions LLC - Service Agreement v" + (p.agreement_version || "4.7"),
      {
        x: MARGIN_L,
        y: 30,
        size: 8,
        font,
        color: GREY,
      },
    );
  }

  return await pdf.save();
}

// ---------------------------------------------------------------------------
// Email via Resend (direct fetch — no SDK)
// ---------------------------------------------------------------------------

async function sendEmail(
  pdfBytes: Uint8Array,
  filename: string,
  p: SaPayload,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY_missing" };
  }
  if (!p.agent_email) {
    return { ok: false, error: "agent_email_missing" };
  }

  const subject =
    "Signed: Aari Transactions Service Agreement v" +
    (p.agreement_version || "4.7") +
    " - " +
    (p.agent_name || "Agent");

  const html =
    "<div style=\"font-family:Inter,Arial,sans-serif;color:#0f0f0f;line-height:1.5\">" +
    "<h2 style=\"margin:0 0 12px;font-weight:600\">Your signed Aari Transactions Service Agreement</h2>" +
    "<p>Hi " +
    escapeHtml(p.agent_name || "there") +
    ",</p>" +
    "<p>Thanks for signing the Aari Transactions Service Agreement on <strong>" +
    escapeHtml(p.signed_at_display || p.signed_at_iso || "") +
    "</strong>. Your countersigned PDF is attached for your records.</p>" +
    "<p>Agreement version: <strong>v" +
    escapeHtml(p.agreement_version || "4.7") +
    "</strong></p>" +
    "<p style=\"margin-top:24px\">Questions? Reply to this email or text 239.688.1770.</p>" +
    "<hr style=\"border:none;border-top:1px solid #e6e2d8;margin:20px 0\"/>" +
    "<p style=\"font-size:11px;color:#5f5e5a\">Aari Transactions LLC - Transaction Coordination - Fort Myers, FL</p>" +
    "</div>";

  // TODO: Restore BCC to agreements@aaritransactions.com once aaritransactions.com
  // is verified as a sending domain in Resend. Until then, Resend's sandbox sender
  // (onboarding@resend.dev) blocks delivery to any address other than the Resend
  // account holder's signup email — which causes the entire send to 403 if BCC is set.
  // Restore by adding: bcc: ["agreements@aaritransactions.com"],
  const body = {
    from: "Aari Transactions <onboarding@resend.dev>",
    to: [p.agent_email],
    subject,
    html,
    attachments: [
      {
        filename,
        content: bytesToBase64(pdfBytes),
      },
    ],
  };

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    return { ok: false, error: "resend_failed_" + resp.status + ":" + text.slice(0, 200) };
  }
  return { ok: true };
}

function escapeHtml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  // Capture IP from request headers for ESIGN/UETA attribution.
  const headerIp =
    req.headers.get("cf-connecting-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    null;
  const ipAddress = headerIp && /^[0-9a-fA-F:.]+$/.test(headerIp) ? headerIp : null;

  let payload: SaPayload;
  try {
    payload = (await req.json()) as SaPayload;
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (!payload.agent_email || !payload.agent_name) {
    return jsonResponse(
      { ok: false, error: "agent_name_and_email_required" },
      400,
    );
  }

  try {
    // 1. Build PDF
    const pdfBytes = await buildPdf(payload);
    const slug = slugForFilename(payload.agent_name || "", payload.agent_email || "");
    const filename =
      "Aari-Transactions-Service-Agreement-v" +
      (payload.agreement_version || "4.7") +
      "-" +
      slug +
      "-signed.pdf";

    // 2. Look up agent_id by email (needed for storage path + agreement_signatures FK)
    let agentId: string | null = null;
    if (supabaseAdmin) {
      try {
        const { data: agentRow } = await supabaseAdmin
          .from("agents")
          .select("id")
          .ilike("email", payload.agent_email || "")
          .maybeSingle();
        agentId = agentRow?.id ?? null;
      } catch (lookupErr) {
        console.warn("[aari-sa-pdf-email] agent lookup failed:", lookupErr);
      }
    }

    // 3. Upload PDF to Supabase Storage (bucket: signed-agreements)
    // Path: {agent_id or anon}/sa_{version}_{timestamp}.pdf
    const safeVersion = (payload.agreement_version || "4.7").replace(/[^a-z0-9.]/gi, "");
    const tsSlug = new Date().toISOString().replace(/[:.]/g, "-");
    const storagePath = (agentId || "anonymous") + "/sa_v" + safeVersion + "_" + tsSlug + ".pdf";

    let signedAgreementPdfUrl: string | null = null;
    if (supabaseAdmin) {
      try {
        const { error: upErr } = await supabaseAdmin.storage
          .from("signed-agreements")
          .upload(storagePath, pdfBytes, {
            contentType: "application/pdf",
            upsert: false,
          });
        if (upErr) {
          console.warn("[aari-sa-pdf-email] storage upload failed:", upErr);
        } else {
          signedAgreementPdfUrl = storagePath;
        }
      } catch (storageErr) {
        console.warn("[aari-sa-pdf-email] storage upload threw:", storageErr);
      }
    }

    // 4. Insert into agreement_signatures so the Documents tab can show it.
    if (supabaseAdmin && agentId) {
      try {
        const { error: insErr } = await supabaseAdmin
          .from("agreement_signatures")
          .insert({
            agent_id: agentId,
            file_id: null, // SA gate is account-level, not file-level
            agreement_type: "service_agreement",
            agreement_version: payload.agreement_version || "v4.7",
            typed_full_name: payload.agent_name || "",
            drawn_signature_data: payload.signature_data_url || null,
            signature_image_url: null,
            ip_address: ipAddress,
            user_agent: payload.user_agent || null,
            signed_at: payload.signed_at_iso || new Date().toISOString(),
            signed_agreement_pdf_url: signedAgreementPdfUrl,
            pdf_generation_status: signedAgreementPdfUrl ? "succeeded" : "failed",
          });
        if (insErr) {
          console.warn("[aari-sa-pdf-email] agreement_signatures insert failed:", insErr);
        }
      } catch (dbErr) {
        console.warn("[aari-sa-pdf-email] agreement_signatures insert threw:", dbErr);
      }
    } else if (!agentId) {
      console.warn("[aari-sa-pdf-email] no agent_id found for email; skipping DB insert");
    }

    // 5. Send email with PDF attachment (existing behavior)
    const sendResult = await sendEmail(pdfBytes, filename, payload);
    if (!sendResult.ok) {
      console.error("[aari-sa-pdf-email] send failed:", sendResult.error);
      // Don't fail the whole request just because email failed —
      // the agreement_signatures row + storage upload may have succeeded,
      // and the Documents tab will still show the signed agreement.
      return jsonResponse({
        ok: true,
        bytes: pdfBytes.length,
        filename,
        recipient: payload.agent_email,
        storage_path: signedAgreementPdfUrl,
        agent_id: agentId,
        email_warning: sendResult.error || "email_send_failed",
      });
    }

    return jsonResponse({
      ok: true,
      bytes: pdfBytes.length,
      filename,
      recipient: payload.agent_email,
      storage_path: signedAgreementPdfUrl,
      agent_id: agentId,
    });
  } catch (err) {
    console.error("[aari-sa-pdf-email] handler error:", err);
    return jsonResponse(
      { ok: false, error: (err as Error).message || "unknown_error" },
      500,
    );
  }
});
