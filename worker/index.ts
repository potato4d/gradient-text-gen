interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnvironment {
  ASSETS: AssetBinding;
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const worker = {
  async fetch(request: Request, environment: WorkerEnvironment): Promise<Response> {
    const response = await environment.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") {
      return withSecurityHeaders(response);
    }

    const acceptsHtml = request.headers.get("accept")?.includes("text/html") ?? false;
    if (!acceptsHtml) return withSecurityHeaders(response);

    const fallbackUrl = new URL("/index.html", request.url);
    return withSecurityHeaders(await environment.ASSETS.fetch(new Request(fallbackUrl, request)));
  },
};

export default worker;
