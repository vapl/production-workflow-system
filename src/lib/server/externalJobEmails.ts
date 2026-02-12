type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  from?: string;
  replyTo?: string;
};

const resendApiUrl = "https://api.resend.com/emails";

export async function sendResendEmail(input: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = input.from || process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    return {
      ok: false,
      error: "RESEND_API_KEY or RESEND_FROM_EMAIL is not configured.",
    };
  }

  const response = await fetch(resendApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false, error: body || "Resend request failed." };
  }
  return { ok: true };
}
