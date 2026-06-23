type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

export const unwrapAppsScriptReadResponse = <T>(body: ApiEnvelope<T> | T): T => {
  if (body && typeof body === 'object' && 'success' in body) {
    const envelope = body as ApiEnvelope<T>;
    if (envelope.success === false) {
      throw new Error(envelope.message || 'Google Apps Script returned an error');
    }
    return envelope.data as T;
  }

  return body as T;
};
