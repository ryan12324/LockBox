import { api, ApiError } from './api.js';

export class DeviceUnlockSessionError extends Error {
  constructor(
    message: string,
    public readonly revoked: boolean
  ) {
    super(message);
    this.name = 'DeviceUnlockSessionError';
  }
}

/** Require a live, matching server session before releasing a device-wrapped key. */
export async function validateDeviceUnlockSession(
  token: string,
  expectedUserId: string
): Promise<void> {
  try {
    const currentSession = await api.auth.me(token);
    if (currentSession.id !== expectedUserId) {
      throw new DeviceUnlockSessionError(
        'This session no longer belongs to the expected account.',
        true
      );
    }
  } catch (error) {
    if (error instanceof DeviceUnlockSessionError) throw error;
    if (error instanceof ApiError && (error.status === 401 || error.status === 404)) {
      throw new DeviceUnlockSessionError(
        'This session was revoked. Sign in again with your master password.',
        true
      );
    }
    throw new DeviceUnlockSessionError(
      'Authwell could not verify this session. Enter your master password instead.',
      false
    );
  }
}
