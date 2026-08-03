/**
 * Telegram Ingest Module — Read-Only Proxy Guard (§2.1 & §2.2)
 * Wraps the Telegram ingest client in a strict read-only proxy.
 * Throws explicit exceptions if any forbidden method or send path is invoked.
 */

const FORBIDDEN_METHODS = [
  'get_participants',
  'iter_participants',
  'GetParticipantsRequest',
  'ChannelParticipantsSearch',
  'ChannelParticipantsRecent',
  'ImportContactsRequest',
  'import_contacts',
  'GetFullUserRequest',
  'ResolvePhoneRequest',
  'send_message',
  'send_file',
  'forward_messages'
];

export class ForbiddenOperationError extends Error {
  constructor(methodName: string) {
    super(`[SECURITY AUDIT FAIL] Forbidden operation invoked on Telegram Ingest Client: '${methodName}'. Ingest client must be strictly read-only (§2.1 & §2.2).`);
    this.name = 'ForbiddenOperationError';
  }
}

export function createReadOnlyTelegramProxy<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      const propName = String(prop);

      if (FORBIDDEN_METHODS.includes(propName)) {
        throw new ForbiddenOperationError(propName);
      }

      const value = Reflect.get(target, prop, receiver);

      if (typeof value === 'function') {
        return function (...args: any[]) {
          if (FORBIDDEN_METHODS.includes(propName)) {
            throw new ForbiddenOperationError(propName);
          }
          return value.apply(target, args);
        };
      }

      return value;
    }
  });
}
