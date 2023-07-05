export function formatJSONResponse<T = any>(response: T) {
  return { statusCode: 200, body: JSON.stringify(response) };
}
