// Server function for chatting with Claude about a specific audit
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "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";

const ChatInput = z.object({
  auditId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).max(20),
});

export const askAuditChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ChatInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify user can access this audit
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const { data: audit } = await supabase
      .from("audits")
      .select("id, agency_id, client_id, page_url, page_label, raw_response, score, clients(name, industry)")
      .eq("id", data.auditId)
      .maybeSingle();

    if (!audit) throw new Error("Audit not found");
    if (profile.role !== "super_admin" && audit.agency_id !== profile.agency_id) {
      throw new Error("Forbidden");
    }

    const clientName = (audit.clients as any)?.name ?? "the client";
    const industry = (audit.clients as any)?.industry ?? "their industry";
    const auditSummary = (audit.raw_response as string ?? "").slice(0, 4000);

    const systemPrompt = `You are a senior CRO (Conversion Rate Optimisation) analyst assistant for Veritech Digital. 
You are helping answer questions about a specific CRO audit.

AUDIT CONTEXT:
- Client: ${clientName}
- Industry: ${industry}
- Page: ${audit.page_label} (${audit.page_url})
- CRO Score: ${audit.score}/100

AUDIT FINDINGS:
${auditSummary}

Answer questions specifically about this audit. Be concise, practical, and actionable. 
If asked to expand on a recommendation, give detailed implementation steps.
If asked about A/B tests, give a complete test brief with hypothesis, variants, success metrics and estimated duration.
Always reference specific findings from this audit rather than giving generic advice.`;

    const messages = [
      ...data.messages,
      { role: "user" as const, content: data.question },
    ];

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        system: systemPrompt,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.status}`);
    }

    const result = await response.json() as any;
    const reply = result.content?.[0]?.text ?? "Sorry, I couldn't generate a response.";

    return { reply };
  });
