// N10 review candidate. Not deployed. Requires staging signed-token tests.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { evaluateMfaAssurance } from "./mfa-assurance.mjs";
// MMHVAULT Financial Assistant · secure read-only Supabase Edge Function
// Required secret: OPENAI_API_KEY
// Optional secret: OPENAI_MODEL (defaults to gpt-6-luna)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function clip(value: unknown, max = 1600) {
  return String(value ?? "").trim().slice(0, max);
}

function boundedObject(value: unknown, maxChars: number) {
  if (!value || typeof value !== "object") return {};
  try {
    const raw = JSON.stringify(value);
    return raw.length <= maxChars ? value : { note: "Context omitted because it exceeded the size limit." };
  } catch { return {}; }
}

async function authUser(authHeader: string, supabaseUrl: string, anonKey: string) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { Authorization: authHeader, apikey: anonKey },
  });
  if (!r.ok) return null;
  return await r.json();
}

async function readRows(
  table: string,
  userId: string,
  authHeader: string,
  supabaseUrl: string,
  anonKey: string,
  select = "*",
  order = "",
  limit = 120,
) {
  const u = new URL(`${supabaseUrl}/rest/v1/${table}`);
  u.searchParams.set("select", select);
  u.searchParams.set("user_id", `eq.${userId}`);
  if (order) u.searchParams.set("order", order);
  u.searchParams.set("limit", String(limit));
  const r = await fetch(u, { headers: { Authorization: authHeader, apikey: anonKey } });
  if (!r.ok) return [];
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

function outputText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(data?.output) ? data.output : []) {
    for (const c of Array.isArray(item?.content) ? item.content : []) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n").trim();
}

function wantsInvestment(q: string) {
  return /invest|portfolio|crypto|bitcoin|btc|eth|sol|gold|wallet|gas|投资|持仓|加密|黄金|钱包/i.test(q);
}
function wantsPlanning(q: string) {
  return /budget|goal|recurring|plan|business|capital|future|forecast|projection|预算|目标|周期|规划|产业|未来|预测/i.test(q);
}

function openAIErrorCode(status: number, data: any) {
  const providerCode = String(data?.error?.code || "");
  const providerType = String(data?.error?.type || "");
  const message = String(data?.error?.message || "");
  if (status === 401 || /api[_ ]?key|authentication/i.test(message)) return "OPENAI_AUTH";
  if (status === 429 || /quota|billing|insufficient_quota/i.test(providerCode + " " + providerType + " " + message)) return "OPENAI_QUOTA";
  if (/model/i.test(providerCode + " " + providerType + " " + message) && /not|access|exist|permission|available/i.test(providerCode + " " + providerType + " " + message)) return "OPENAI_MODEL";
  if (status === 429) return "OPENAI_RATE_LIMIT";
  return "OPENAI_PROVIDER_ERROR";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  let publishableKey = "";
  try { publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}")?.default || ""; } catch {}
  const anonKey = publishableKey || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const apiKey = Deno.env.get("OPENAI_API_KEY") || "";
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-6-luna";
  if (!supabaseUrl || !anonKey) return json({ error: "Supabase environment is unavailable" }, 500);
  // QA HARD BOUNDARY: refuse any non-staging project before reading tokens.
  if (supabaseUrl !== "https://ldivswlhtgmznzwhzsoi.supabase.co")
    return json({code:"QA_PROJECT_MISMATCH"}, 503);

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const user = await authUser(authHeader, supabaseUrl, anonKey);
  if (!user?.id) return json({ error: "Invalid session" }, 401);

  // N10 RELEASING GATE: fail closed before reading financial records OR
  // accepting client-provided summaries when a verified second factor is required.
  // This is a candidate; live AAL1/AAL2 signed-token QA is still mandatory.
  try {
    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const jwt = authHeader.slice("Bearer ".length).trim();
    const { data: assurance, error: assuranceError } =
      await verifier.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    // MFA factors are supplied by the separately authenticated Auth user
    // response; cross-check them with SDK assurance to prevent a stale or
    // unsupported JWT API from mistakenly treating an enrolled user as AAL1.
    // A valid legacy JWT with two null levels is allowed ONLY without factors.
    if (assuranceError) return json({ code: "MFA_CHECK_UNAVAILABLE" }, 503);
    // Missing factor inventory must NOT be interpreted as an unenrolled user.
    if (!Array.isArray(user.factors)) return json({ code: "MFA_CHECK_UNAVAILABLE" }, 503);
    const hasVerifiedFactor =
      user.factors.some((factor: any) => factor?.status === "verified");
    const decision = evaluateMfaAssurance(assurance, hasVerifiedFactor);
    if (decision === "unavailable") return json({ code: "MFA_CHECK_UNAVAILABLE" }, 503);
    if (decision === "required") return json({ code: "MFA_REQUIRED" }, 403);
  } catch (_) {
    return json({ code: "MFA_CHECK_UNAVAILABLE" }, 503);
  }

  if (!apiKey) return json({ code: "AI_NOT_CONFIGURED", error: "Secure AI provider is not configured" }, 503);

  // Staging integration test ends at actual candidate Auth/MFA guard.
  // Do NOT read private rows or contact an AI provider in a QA run.
  return json({code:"MFA_ALLOWED",qa_only:true,route:"financial-ai"});
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const message = clip(body?.message, 1600);
  if (!message) return json({ error: "Message is required" }, 400);
  const history = (Array.isArray(body?.history) ? body.history : []).slice(-8).map((x: any) => ({
    role: x?.role === "assistant" ? "assistant" : "user",
    text: clip(x?.text, 1200),
  }));
  const summary = boundedObject(body?.summary, 28000);
  const accountConfig = boundedObject(body?.account_config, 12000);

  // Every database read is explicitly scoped to the authenticated user and also runs under that user's JWT/RLS.
  const transactions = await readRows(
    "transactions", user.id, authHeader, supabaseUrl, anonKey,
    "tx_date,type,transaction_group,category,from_account,from_amount,to_account,to_amount,note", "tx_date.desc", 320,
  );

  let investments: unknown[] = [], walletMovements: unknown[] = [], customInvestments: unknown[] = [];
  let budgets: unknown[] = [], goals: unknown[] = [], recurring: unknown[] = [];
  if (wantsInvestment(message)) {
    [investments, walletMovements, customInvestments] = await Promise.all([
      readRows("investments", user.id, authHeader, supabaseUrl, anonKey, "inv_date,asset,symbol,side,quantity,amount,fee,other_cost,source_account,buy_price,market_price,note", "inv_date.desc", 180),
      readRows("crypto_wallet_movements", user.id, authHeader, supabaseUrl, anonKey, "movement_date,movement_type,asset_symbol,network,from_wallet,to_wallet,quantity,fee_asset_symbol,fee_quantity,fee_unit_price_usd,note", "movement_date.desc", 160),
      readRows("custom_investments", user.id, authHeader, supabaseUrl, anonKey, "inv_date,investment_type,project_name,amount,fee,other_cost,source_account,quantity,market_price,note", "inv_date.desc", 120),
    ]);
  }
  if (wantsPlanning(message)) {
    [budgets, goals, recurring] = await Promise.all([
      readRows("budgets", user.id, authHeader, supabaseUrl, anonKey, "budget_month,currency,monthly_amount,category_budgets", "budget_month.desc", 18),
      readRows("financial_goals", user.id, authHeader, supabaseUrl, anonKey, "name,goal_type,currency,target_amount,current_amount,target_date,status,note", "updated_at.desc", 50),
      readRows("recurring_transactions", user.id, authHeader, supabaseUrl, anonKey, "name,tx_type,tx_group,category,from_account,from_amount,to_account,to_amount,frequency,next_due_date,status,note", "next_due_date.asc", 60),
    ]);
  }

  const context = {
    normalized_summary_from_client: summary,
    account_currency_metadata_from_client: accountConfig,
    recent_transactions: transactions,
    investments,
    wallet_movements: walletMovements,
    custom_investments: customInvestments,
    budgets,
    goals,
    recurring,
  };

  const instructions = `You are MMHVAULT Financial Assistant, a read-only personal finance analysis assistant inside MMHVAULT.
Use only the authenticated user's MMHVAULT context supplied in this request. Never ask for or expose passwords, payment credentials, API keys, or data from any other user.
Never claim to create, edit, delete, transfer, buy, sell, or otherwise change records. You have no write access.
MMHVAULT accounting rules: internal Transfers are asset-location changes and are excluded from Income, Expense, Personal Expense and savings-rate calculations. Data Adjustment is excluded from ordinary cash flow. Loans are excluded from ordinary income/spending. Linked investment cash flows are excluded from ordinary income/spending. Crypto wallet transfers between the user's wallets are not income/expense; only real network fees reduce crypto holdings, and those fees are not lifestyle spending.
The normalized client summary is useful for currency-normalized totals because account currency configuration is stored locally in the Personal app. It is user-owned analytical metadata, not authorization data. If it conflicts with raw authenticated database rows, state the uncertainty instead of inventing a resolution.
For projections, clearly state assumptions and distinguish scenarios from guarantees. Do not present investment outcomes as certain. Avoid personalized instructions to buy or sell a specific security; frame investment discussion as risk, liquidity, diversification and scenario planning. If data is insufficient, say what is missing.
Answer in the same language as the user's question when practical. Be concise but useful and explain why a metric matters when the user asks for planning guidance.`;

  const prompt = `Conversation history:\n${JSON.stringify(history)}\n\nAuthenticated MMHVAULT financial context:\n${JSON.stringify(context)}\n\nUser question:\n${message}`;
  const ai = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, store: false, instructions, input: prompt, max_output_tokens: 1200 }),
  });
  const data = await ai.json().catch(() => ({}));
  if (!ai.ok) {
    const providerStatus = ai.status;
    const code = openAIErrorCode(providerStatus, data);
    const providerCode = clip(data?.error?.code, 120);
    const providerType = clip(data?.error?.type, 120);
    const message = clip(data?.error?.message || "AI request failed", 420);
    console.error("[MMHVAULT AI] OpenAI request failed", JSON.stringify({
      status: providerStatus, code, provider_code: providerCode, provider_type: providerType, model, message,
    }));
    return json({ code, error: message, provider_status: providerStatus, provider_code: providerCode, model }, 502);
  }
  const answer = outputText(data);
  if (!answer) {
    console.error("[MMHVAULT AI] OpenAI returned empty output", JSON.stringify({ model }));
    return json({ code: "OPENAI_EMPTY", error: "AI returned an empty response", model }, 502);
  }
  return json({ answer, mode: "secure-ai", read_only: true, model });
});