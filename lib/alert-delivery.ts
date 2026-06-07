import type { AiSignal, UserAlert } from "@/lib/whalemind-types";

const ALERT_DELIVERY_TIMEOUT_MS = 5000;
const MAX_ALERT_MESSAGE_LENGTH = 800;

async function postJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(ALERT_DELIVERY_TIMEOUT_MS),
  });

  if (!response.ok) {
    return {
      delivered: false,
      error: `Webhook returned ${response.status} ${response.statusText || "response"}`,
    };
  }

  return { delivered: true };
}


export async function deliverTriggeredAlerts(alerts: UserAlert[], signals: AiSignal[]) {
  const delivered = await Promise.all(
    alerts.map(async (alert) => {
      try {
        const signal = signals.find((item) => item.id === alert.lastTriggeredSignalId || item.asset === alert.asset);
        const rawMessage = signal
          ? `WhaleMind alert: ${signal.asset} ${signal.action} at ${signal.confidence}% confidence. ${signal.thesis}`
          : `WhaleMind alert: ${alert.asset} crossed ${alert.minConfidence}% confidence.`;
        const message =
          rawMessage.length > MAX_ALERT_MESSAGE_LENGTH
            ? `${rawMessage.slice(0, MAX_ALERT_MESSAGE_LENGTH - 3)}...`
            : rawMessage;

        if (alert.channel === "discord" && process.env.DISCORD_WEBHOOK_URL) {
          const result = await postJson(process.env.DISCORD_WEBHOOK_URL, { content: message });
          return { id: alert.id, channel: alert.channel, ...result };
        }

        if (alert.channel === "telegram" && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
          const result = await postJson(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: alert.destination || process.env.TELEGRAM_CHAT_ID,
            text: message,
            disable_web_page_preview: true,
          });
          return { id: alert.id, channel: alert.channel, ...result };
        }

        return { id: alert.id, channel: alert.channel, delivered: alert.channel === "in-app" };
      } catch (error) {
        return {
          id: alert.id,
          channel: alert.channel,
          delivered: false,
          error: error instanceof Error ? error.message : "Alert delivery failed",
        };
      }
    })
  );

  return delivered;
}
