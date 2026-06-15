import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Bot, User, Loader2, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import { askAuditChat } from "@/lib/audit-chat.functions";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Expand on the top friction point with implementation steps",
  "Write a full A/B test brief for hypothesis 1",
  "What's the quickest win I can implement today?",
  "Explain the revenue impact calculations",
  "What should I fix before running paid ads to this page?",
  "Write copy for a better CTA based on your findings",
];

export function AuditChat({ auditId, clientName }: { auditId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatFn = useServerFn(askAuditChat);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      inputRef.current?.focus();
    }
  }, [messages, open]);

  async function sendMessage(question: string) {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: "user", content: question.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const { reply } = await chatFn({
        data: {
          auditId,
          question: question.trim(),
          messages: messages.slice(-10), // last 10 messages for context
        },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chat failed");
      setMessages((prev) => prev.slice(0, -1)); // remove user message on error
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vt-card overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[color:var(--slate)]/20 transition-colors"
      >
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[color:var(--accent)]" />
          <span className="font-medium text-sm">Ask Claude about this audit</span>
          {messages.length > 0 && (
            <span className="text-xs text-[color:var(--muted)] bg-[color:var(--slate)] px-1.5 py-0.5 rounded-full">
              {messages.length} messages
            </span>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-[color:var(--muted)]" /> : <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />}
      </button>

      {open && (
        <div className="border-t border-[color:var(--border)]">
          {/* Messages */}
          <div className="h-80 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-[color:var(--muted)]">
                  Ask me anything about {clientName}'s audit. I have full context of the findings.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      className="text-left text-xs px-3 py-2 rounded-lg border border-[color:var(--border)] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent)]/5 transition-colors text-[color:var(--muted)] hover:text-[color:var(--light)]"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="h-6 w-6 rounded-full bg-[color:var(--accent)]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                  </div>
                )}
                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-[color:var(--accent)] text-white"
                    : "bg-[color:var(--slate)] text-[color:var(--light)]"
                }`}>
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div className="h-6 w-6 rounded-full bg-[color:var(--slate)] flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3.5 w-3.5 text-[color:var(--muted)]" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="h-6 w-6 rounded-full bg-[color:var(--accent)]/20 flex items-center justify-center shrink-0">
                  <Bot className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                </div>
                <div className="bg-[color:var(--slate)] rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[color:var(--accent)]" />
                  <span className="text-sm text-[color:var(--muted)]">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="border-t border-[color:var(--border)] p-3 flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              placeholder="Ask about this audit… (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="vt-input resize-none flex-1 text-sm"
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="vt-btn-primary px-3 self-end disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
