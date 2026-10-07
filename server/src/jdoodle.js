const LANGUAGE_CONFIG = {
  python3: { language: "python3", versionIndex: "4" },
  javascript: { language: "nodejs", versionIndex: "4" },
  java: { language: "java", versionIndex: "4" },
  cpp: { language: "cpp", versionIndex: "5" },
};

export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_CONFIG);

export async function executeWithJDoodle({ code, language, input }) {
  const clientId = process.env.JDOODLE_CLIENT_ID?.trim();
  const clientSecret = process.env.JDOODLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    const error = new Error("JDoodle is not configured. Add JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET to server/.env.");
    error.status = 503;
    throw error;
  }

    console.log("JDoodle using clientId:", clientId.slice(0, 4) + "…" + clientId.slice(-4));
  const config = LANGUAGE_CONFIG[language];
  if (!config) {
    const error = new Error("Unsupported programming language.");
    error.status = 400;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("https://api.jdoodle.com/v1/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        clientId,
        clientSecret,
        script: code,
        stdin: input,
        language: config.language,
        versionIndex: config.versionIndex,
      }),
    });

    let result;
    try {
      result = await response.json();
    } catch {
      const error = new Error("JDoodle returned an unreadable response.");
      error.status = 502;
      throw error;
    }
    if (!response.ok) {
      const error = new Error(result.error || `JDoodle request failed (${response.status}).`);
      error.status = 502;
      throw error;
    }

    return {
      output: typeof result.output === "string" ? result.output : "",
      statusCode: result.statusCode ?? null,
      memory: Number.isFinite(Number(result.memory)) ? Number(result.memory) : null,
      cpuTime: Number.isFinite(Number(result.cpuTime)) ? Number(result.cpuTime) : null,
      compilationStatus: result.compilationStatus ?? null,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("JDoodle did not respond within 30 seconds. Try again later.");
      timeoutError.status = 504;
      throw timeoutError;
    }
    if (error instanceof TypeError) {
      const networkError = new Error("Could not reach JDoodle. Check the server's internet connection and try again.");
      networkError.status = 502;
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
