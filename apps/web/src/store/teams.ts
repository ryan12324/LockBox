/**
 * Teams Zustand store — manages team membership, shared folders, and folder keys.
 * Folder keys are memory-only (like userKey in auth store) — never persisted.
 */

import { create } from 'zustand';
import type { Team, TeamMember, TeamInvite, SharedFolder } from '@lockbox/types';

interface SharedFolderWithName extends SharedFolder {
  folderName: string;
}

interface TeamsState {
  /** User's teams with their role */
  teams: Array<Team & { role: string }>;
  /** Currently selected team */
  currentTeamId: string | null;
  /** Members of the current team */
  members: TeamMember[];
  /** Pending invites for current team */
  invites: TeamInvite[];
  /** Shared folders the user has access to */
  sharedFolders: SharedFolderWithName[];
  /** Decrypted folder keys — memory only, keyed by folderId */
  folderKeys: Map<string, Uint8Array>;
  /** User's decrypted RSA private key — memory only */
  privateKey: CryptoKey | null;
  /** Whether user has an RSA key pair on server */
  hasKeyPair: boolean;
  /** Loading state */
  loading: boolean;
}

interface TeamsActions {
  setTeams: (teams: Array<Team & { role: string }>) => void;
  setCurrentTeamId: (teamId: string | null) => void;
  setMembers: (members: TeamMember[]) => void;
  setInvites: (invites: TeamInvite[]) => void;
  setSharedFolders: (folders: SharedFolderWithName[]) => void;
  setFolderKey: (folderId: string, key: Uint8Array) => void;
  removeFolderKey: (folderId: string) => void;
  setPrivateKey: (key: CryptoKey | null) => void;
  setHasKeyPair: (has: boolean) => void;
  setLoading: (loading: boolean) => void;
  clear: () => void;
}

const initialState: TeamsState = {
  teams: [],
  currentTeamId: null,
  members: [],
  invites: [],
  sharedFolders: [],
  folderKeys: new Map(),
  privateKey: null,
  hasKeyPair: false,
  loading: false,
};

export const useTeamsStore = create<TeamsState & TeamsActions>((set) => ({
  ...initialState,

  setTeams: (teams) => set({ teams }),
  setCurrentTeamId: (currentTeamId) => set({ currentTeamId }),
  setMembers: (members) => set({ members }),
  setInvites: (invites) => set({ invites }),
  setSharedFolders: (sharedFolders) => set({ sharedFolders }),

  setFolderKey: (folderId, key) =>
    set((state) => {
      const folderKeys = new Map(state.folderKeys);
      folderKeys.set(folderId, key);
      return { folderKeys };
    }),

  removeFolderKey: (folderId) =>
    set((state) => {
      const folderKeys = new Map(state.folderKeys);
      folderKeys.delete(folderId);
      return { folderKeys };
    }),

  setPrivateKey: (privateKey) => set({ privateKey }),
  setHasKeyPair: (hasKeyPair) => set({ hasKeyPair }),
  setLoading: (loading) => set({ loading }),

  clear: () => set({ ...initialState, folderKeys: new Map() }),
}));
