type PublicRecord<T, SecretKey extends PropertyKey> = T extends Record<string, any>
  ? Omit<T, Extract<SecretKey, keyof T>> & { hasCredentials: boolean }
  : T;

export function toPublicWhatsAppInstance<T extends Record<string, any> | null | undefined>(instance: T): PublicRecord<T, 'token'> {
  if (!instance) return instance as PublicRecord<T, 'token'>;
  const { token: _token, ...safe } = instance;
  return {
    ...safe,
    hasCredentials: Boolean(_token),
  } as PublicRecord<T, 'token'>;
}

export function toPublicWhatsAppConnectionRequest<T extends Record<string, any> | null | undefined>(request: T): PublicRecord<T, 'apiToken'> {
  if (!request) return request as PublicRecord<T, 'apiToken'>;
  const { apiToken: _apiToken, ...safe } = request;
  return {
    ...safe,
    hasCredentials: Boolean(_apiToken),
  } as PublicRecord<T, 'apiToken'>;
}

export function toPublicWhatsAppRequest<T extends Record<string, any> | null | undefined>(request: T): PublicRecord<T, 'token'> {
  if (!request) return request as PublicRecord<T, 'token'>;
  const { token: _token, ...safe } = request;
  return {
    ...safe,
    hasCredentials: Boolean(_token),
  } as PublicRecord<T, 'token'>;
}
