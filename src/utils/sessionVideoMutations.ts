import type { Session, SessionVideo } from '../services/databaseService';

export type SessionVideoMutation =
  | { type: 'add'; video: SessionVideo }
  | { type: 'enrich'; id: string; duration: number; thumbnailUrl?: string; initializeTrimEnd?: boolean }
  | { type: 'remove'; id: string }
  | { type: 'patch'; id: string; changes: Partial<Omit<SessionVideo, 'id'>>; clearMetadataStatus?: boolean; ifMetadataStatus?: SessionVideo['metadataStatus'] };

/** Apply only the intentional change, never an old snapshot of the entire array. */
export function applySessionVideoMutation(videos: SessionVideo[], mutation: SessionVideoMutation): SessionVideo[] {
  if (mutation.type === 'add') {
    return videos.some(v => v.id === mutation.video.id) ? videos : [...videos, mutation.video];
  }
  if (mutation.type === 'remove') return videos.filter(v => v.id !== mutation.id);
  return videos.map(v => {
    if (v.id !== mutation.id) return v;
    if (mutation.type === 'enrich') {
      return { ...v, duration: mutation.duration,
        ...(mutation.initializeTrimEnd !== false && v.trimStart === 0 && v.trimEnd === 0
          ? { trimEnd: mutation.duration } : {}),
        ...(mutation.thumbnailUrl ? { thumbnailUrl: mutation.thumbnailUrl } : {}),
      };
    }
    if (mutation.ifMetadataStatus && v.metadataStatus !== mutation.ifMetadataStatus) return v;
    const updated = { ...v, ...mutation.changes, id: v.id };
    if (mutation.clearMetadataStatus) delete updated.metadataStatus;
    return updated;
  });
}

export interface SessionVideoTransaction {
  read(): Promise<Session | undefined>;
  write(videos: SessionVideo[]): void;
}

/** Called INSIDE runTransaction, so every Firestore retry reads a fresh snapshot. */
export async function mutateSessionVideoTransaction(
  transaction: SessionVideoTransaction, userId: string, sessionId: string, mutation: SessionVideoMutation,
): Promise<SessionVideoMutation | null> {
  if (!userId) throw new Error('User not authenticated');
  const session = await transaction.read();
  if (!session) throw new Error('Session not found');
  if (session.userId !== userId || session.id !== sessionId) throw new Error('Session ownership mismatch');
  const id = mutation.type === 'add' ? mutation.video.id : mutation.id;
  const video = session.videos.find(v => v.id === id);
  if (mutation.type === 'add' && video) return null;
  if (mutation.type !== 'add' && !video) return null;
  if (mutation.type === 'patch' && mutation.ifMetadataStatus &&
    video!.metadataStatus !== mutation.ifMetadataStatus) return null;
  const committed = mutation.type === 'enrich'
    ? { ...mutation, initializeTrimEnd: video!.trimStart === 0 && video!.trimEnd === 0 }
    : mutation;
  transaction.write(applySessionVideoMutation(session.videos, committed));
  return committed;
}

/** A rejected save must not become a local success (especially metadataStatus=ready). */
export async function commitSessionVideoMutation(
  save: Promise<SessionVideoMutation | null>, apply: (mutation: SessionVideoMutation) => void,
): Promise<boolean> {
  const committed = await save;
  if (!committed) return false;
  apply(committed);
  return true;
}
