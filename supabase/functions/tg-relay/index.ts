// tg-relay — 텔레그램 봇 중계 (봇 토큰을 브라우저에 두지 않기 위한 서버 함수)
//
//  화면은 https://api.telegram.org/bot<토큰>/<메서드> 대신
//        https://omngtyewdaqpphnzeate.supabase.co/functions/v1/tg-relay/<메서드> 로 보낸다.
//  본문(JSON 또는 multipart)은 텔레그램 API 와 같다. 토큰은 이 함수의 비밀값으로만 보관한다.
//
//  비밀값 (Supabase → Edge Functions → Secrets)
//    TELEGRAM_BOT_TOKEN   (필수) BotFather 에서 새로 발급한 토큰
//    TG_ALLOWED_ORIGINS   (선택) 허용할 화면 주소, 쉼표 구분 (예: https://knagbyeongju-123.github.io)
//    TG_ALLOWED_CHAT_IDS  (선택) 보낼 수 있는 chat_id 목록, 쉼표 구분. 비우면 제한 없음
//
//  허용 메서드: sendMessage, sendPhoto (그 외 getUpdates·setWebhook 등 봇 관리 기능은 막는다)

const ALLOWED_METHODS = new Set(["sendMessage", "sendPhoto"]);
const MAX_BODY = 20 * 1024 * 1024;

const list = (v: string | undefined) =>
  (v || "").split(",").map((s) => s.trim()).filter(Boolean);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Vary": "Origin",
  };
}

function json(status: number, body: unknown, h: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...h, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const allowedOrigins = list(Deno.env.get("TG_ALLOWED_ORIGINS"));
  const originOk = !allowedOrigins.length || (origin !== null && allowedOrigins.includes(origin));
  const h = cors(originOk ? origin : null);

  if (req.method === "OPTIONS") return new Response(null, { status: originOk ? 204 : 403, headers: h });
  if (!originOk) return json(403, { ok: false, description: "origin not allowed" }, h);
  if (req.method !== "POST") return json(405, { ok: false, description: "POST only" }, h);

  const method = new URL(req.url).pathname.split("/").filter(Boolean).pop() || "";
  if (!ALLOWED_METHODS.has(method)) return json(400, { ok: false, description: "method not allowed" }, h);

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return json(500, { ok: false, description: "relay not configured" }, h);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BODY) return json(413, { ok: false, description: "too large" }, h);

  const ct = req.headers.get("content-type") || "";
  let body: BodyInit;
  let headers: Record<string, string> = {};
  let chatId = "";
  try {
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      chatId = String(fd.get("chat_id") ?? "");
      body = fd;
    } else {
      const data = await req.json();
      chatId = String(data?.chat_id ?? "");
      body = JSON.stringify(data);
      headers = { "Content-Type": "application/json" };
    }
  } catch (_) {
    return json(400, { ok: false, description: "bad body" }, h);
  }
  if (!chatId) return json(400, { ok: false, description: "chat_id required" }, h);

  const allowedChats = list(Deno.env.get("TG_ALLOWED_CHAT_IDS"));
  if (allowedChats.length && !allowedChats.includes(chatId)) {
    return json(403, { ok: false, description: "chat_id not allowed" }, h);
  }

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers, body });
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { ...h, "Content-Type": "application/json" } });
  } catch (_) {
    return json(502, { ok: false, description: "telegram unreachable" }, h);
  }
});
