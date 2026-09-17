import type { ApiProblem } from "../shared/contracts";

export class ApiError extends Error {
  status: number;
  requestId?: string;
  constructor(status: number, message: string, requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

export async function getResource<T>(
  path: string,
  signal: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error(
      "Bağlantı kurulamadı. İnternet bağlantınızı kontrol ederek yeniden deneyin.",
    );
  }
  if (!response.ok) {
    let problem: Partial<ApiProblem> = {};
    try {
      problem = await response.json();
    } catch {
      /* A proxy may return a non-JSON error. */
    }
    const message =
      response.status === 404
        ? "Bu ürün bulunamadı veya artık katalogda yayımlanmıyor."
        : response.status === 429
          ? "Kısa sürede çok fazla istek gönderildi. Biraz sonra yeniden deneyin."
          : response.status === 503
            ? "Katalog şu anda kullanıma hazır değil. Lütfen daha sonra yeniden deneyin."
            : "Ürün bilgilerine şu anda ulaşılamıyor. Lütfen yeniden deneyin.";
    throw new ApiError(response.status, message, problem.requestId);
  }
  return response.json() as Promise<T>;
}
