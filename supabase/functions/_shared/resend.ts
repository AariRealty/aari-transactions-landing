// Aari Transactions · Shared · Resend client singleton
// Edge functions import { resend, FROM, REPLY_TO } from "../_shared/resend.ts"

import { Resend } from "resend";

const apiKey = Deno.env.get("RESEND_API_KEY");
if (!apiKey) {
  throw new Error("RESEND_API_KEY is not set in Supabase edge function secrets.");
}

export const resend = new Resend(apiKey);

export const FROM = Deno.env.get("FROM_EMAIL") ?? "Aari Transactions <hello@aaritransactions.com>";
export const REPLY_TO = Deno.env.get("REPLY_TO_EMAIL") ?? "marlenyi@aaritransactions.com";
export const SITE_URL = Deno.env.get("SITE_URL") ?? "https://aaritransactions.com";

export const BROKER_STAMP = {
  name: "Marlenyi Paredes",
  company: "Aari Transactions",
};
