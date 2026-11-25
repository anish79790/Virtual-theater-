import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  AUDITORIUM_SEATS,
  getSeatTier,
  type ChatMessage,
  type CinemaRoom,
  type LiveMember,
  type QueueItem,
  type RecentRoom,
  type RoomSettingsPayload,
  type UserProfile,
  type VideoQuality,
  type WatchParty,
  type WatchSourceMode
} from '../types/cinema';

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function sanitizeRoomCode(input: string): string {
  const cleaned = input.trim();
  // Support pasting full invite URL (?room=CODE)
  try {
    if (cleaned.includes('room=')) {
      const parsed = new URL(cleaned.startsWith('http') ? cleaned : `https://cinehall.app/?${cleaned.split('?')[1] || cleaned}`);
      const fromParam = parsed.searchParams.get('room');
      if (fromParam) return fromParam.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    }
  } catch {
    // Fallback to raw code cleaning
  }
  return cleaned.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const publicPath = `users/${user.uid}`;
  const privatePath = `users/${user.uid}/private/info`;
  const publicRef = doc(db, 'users', user.uid);
  const privateRef = doc(db, 'users', user.uid, 'private', 'info');

  const safeName = (user.displayName || user.email?.split('@')[0] || 'Cinema Guest').trim().slice(0, 60);
  const safePhoto = (user.photoURL || '').slice(0, 500);

  let profile: UserProfile = {
    uid: user.uid,
    displayName: safeName,
    photoURL: safePhoto,
    preferredSeat: 'B3',
    email: user.email || '',
    notificationsEnabled: true,
    autoLandscape: true
  };

  try {
    const snap = await getDoc(publicRef);
    if (!snap.exists()) {
      await setDoc(publicRef, {
        uid: user.uid,
        displayName: safeName,
        photoURL: safePhoto,
        preferredSeat: 'B3',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const data = snap.data();
      profile.displayName = typeof data.displayName === 'string' ? data.displayName : safeName;
      profile.photoURL = typeof data.photoURL === 'string' ? data.photoURL : safePhoto;
      profile.preferredSeat = typeof data.preferredSeat === 'string' ? data.preferredSeat : 'B3';
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, publicPath);
  }

  try {
    const privSnap = await getDoc(privateRef);
    if (!privSnap.exists()) {
      await setDoc(privateRef, {
        uid: user.uid,
        email: (user.email || '').slice(0, 160),
        notificationsEnabled: true,
        autoLandscape: true,
        updatedAt: serverTimestamp()
      });
    } else {
      const pData = privSnap.data();
      profile.email = typeof pData.email === 'string' ? pData.email : user.email || '';
      profile.notificationsEnabled = Boolean(pData.notificationsEnabled);
      profile.autoLandscape = pData.autoLandscape !== false;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }

  return profile;
}

export async function updateUserPreferences(
  uid: string,
  updates: { displayName?: string; preferredSeat?: string; notificationsEnabled?: boolean; autoLandscape?: boolean }
) {
  if (updates.displayName !== undefined || updates.preferredSeat !== undefined) {
    const publicPath = `users/${uid}`;
    try {
      const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.displayName !== undefined) payload.displayName = updates.displayName.trim().slice(0, 60) || 'Cinema Guest';
      if (updates.preferredSeat !== undefined && /^[A-C][1-8]$/.test(updates.preferredSeat)) {
        payload.preferredSeat = updates.preferredSeat;
      }
      await updateDoc(doc(db, 'users', uid), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, publicPath);
    }
  }

  if (updates.notificationsEnabled !== undefined || updates.autoLandscape !== undefined) {
    const privatePath = `users/${uid}/private/info`;
    try {
      const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (updates.notificationsEnabled !== undefined) payload.notificationsEnabled = updates.notificationsEnabled;
      if (updates.autoLandscape !== undefined) payload.autoLandscape = updates.autoLandscape;
      await updateDoc(doc(db, 'users', uid, 'private', 'info'), payload);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, privatePath);
    }
  }
}

export async function createCinemaRoom(params: {
  name: string;
  isPublic: boolean;
  sourceMode?: WatchSourceMode;
  videoId: string;
  videoTitle: string;
  videoQuality: VideoQuality;
  voiceChatEnabled: boolean;
  user: UserProfile;
}): Promise<CinemaRoom> {
  const code = generateRoomCode();
  const roomPath = `rooms/${code}`;
  const memberPath = `rooms/${code}/members/${params.user.uid}`;
  const recentPath = `users/${params.user.uid}/recentRooms/${code}`;

  const safeName = params.name.trim().slice(0, 60) || 'Movie Night';
  const safeVideoTitle = params.videoTitle.trim().slice(0, 140) || 'Cinema Feature';
  const seatId = /^[A-C][1-8]$/.test(params.user.preferredSeat) ? params.user.preferredSeat : 'B3';
  const nowMs = Date.now();

  const roomDoc = {
    id: code,
    code,
    name: safeName,
    isPublic: params.isPublic,
    status: 'open' as const,
    hostId: params.user.uid,
    hostName: params.user.displayName.slice(0, 60),
    createdBy: params.user.uid,
    currentVideoId: params.videoId.slice(0, 20),
    currentVideoTitle: safeVideoTitle,
    videoQuality: params.videoQuality,
    syncEnabled: true,
    voiceChatEnabled: params.voiceChatEnabled,
    memberUids: [params.user.uid],
    isPlaying: false,
    playbackPosition: 0,
    playbackUpdatedAt: nowMs,
    sourceMode: params.sourceMode || ('youtube' as WatchSourceMode),
    browserUrl: '',
    browserQuery: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(doc(db, 'rooms', code), roomDoc);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, roomPath);
  }

  try {
    await setDoc(doc(db, 'rooms', code, 'members', params.user.uid), {
      uid: params.user.uid,
      roomId: code,
      displayName: params.user.displayName.slice(0, 60),
      photoURL: params.user.photoURL.slice(0, 500),
      seatId,
      seatTier: getSeatTier(seatId),
      isPublicRoom: params.isPublic,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, memberPath);
  }

  try {
    await setDoc(doc(db, 'users', params.user.uid, 'recentRooms', code), {
      roomId: code,
      code,
      name: safeName,
      isPublic: params.isPublic,
      lastVideoId: params.videoId.slice(0, 20),
      lastVideoTitle: safeVideoTitle,
      joinedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, recentPath);
  }

  return {
    ...roomDoc,
    createdAt: nowMs,
    updatedAt: nowMs
  };
}

export async function getCinemaRoomByCode(rawCode: string): Promise<CinemaRoom | null> {
  const code = sanitizeRoomCode(rawCode);
  if (code.length !== 6) return null;
  const path = `rooms/${code}`;
  try {
    const snap = await getDoc(doc(db, 'rooms', code));
    if (!snap.exists()) return null;
    return snap.data() as CinemaRoom;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function joinCinemaRoomInFirestore(room: CinemaRoom, user: UserProfile): Promise<CinemaRoom> {
  const roomRef = doc(db, 'rooms', room.code);
  const memberRef = doc(db, 'rooms', room.code, 'members', user.uid);
  const recentRef = doc(db, 'users', user.uid, 'recentRooms', room.code);

  // Re-read fresh room doc so concurrent joins never clobber another member's UID
  let latestRoom: CinemaRoom = room;
  try {
    const freshSnap = await getDoc(roomRef);
    if (freshSnap.exists()) {
      latestRoom = freshSnap.data() as CinemaRoom;
    }
  } catch {
    // Fall back to passed room snapshot
  }

  if (latestRoom.status === 'closed') {
    throw new Error(`Room ${room.code} has already been closed by the host.`);
  }

  let updatedMembers = Array.isArray(latestRoom.memberUids) ? [...latestRoom.memberUids] : [];
  if (!updatedMembers.includes(user.uid) && updatedMembers.length < 24 && latestRoom.status === 'open') {
    updatedMembers = [...updatedMembers, user.uid];
    try {
      await updateDoc(roomRef, {
        memberUids: updatedMembers,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.code}`);
    }
  }

  // Pick preferred seat if free, otherwise first unoccupied auditorium seat
  const takenSeats = new Set<string>();
  await Promise.all(
    updatedMembers
      .filter((uid) => uid !== user.uid)
      .map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'rooms', room.code, 'members', uid));
          if (snap.exists()) {
            const s = snap.data()?.seatId;
            if (typeof s === 'string') takenSeats.add(s);
          }
        } catch {
          // Ignore individual member read error
        }
      })
  );

  const preferredSeat = /^[A-C][1-8]$/.test(user.preferredSeat) ? user.preferredSeat : 'B3';
  const assignedSeatId = !takenSeats.has(preferredSeat)
    ? preferredSeat
    : AUDITORIUM_SEATS.find((s) => !takenSeats.has(s.id))?.id || preferredSeat;

  try {
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      await setDoc(memberRef, {
        uid: user.uid,
        roomId: room.code,
        displayName: user.displayName.slice(0, 60),
        photoURL: user.photoURL.slice(0, 500),
        seatId: assignedSeatId,
        seatTier: getSeatTier(assignedSeatId),
        isPublicRoom: latestRoom.isPublic,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } else {
      const currentSeat = memberSnap.data()?.seatId;
      const safeSeat =
        typeof currentSeat === 'string' && /^[A-C][1-8]$/.test(currentSeat) && !takenSeats.has(currentSeat)
          ? currentSeat
          : assignedSeatId;
      await updateDoc(memberRef, {
        displayName: user.displayName.slice(0, 60),
        photoURL: user.photoURL.slice(0, 500),
        seatId: safeSeat,
        seatTier: getSeatTier(safeSeat),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `rooms/${room.code}/members/${user.uid}`);
  }

  try {
    await setDoc(recentRef, {
      roomId: room.code,
      code: room.code,
      name: latestRoom.name.slice(0, 60),
      isPublic: latestRoom.isPublic,
      lastVideoId: (latestRoom.currentVideoId || '').slice(0, 20),
      lastVideoTitle: (latestRoom.currentVideoTitle || '').slice(0, 140),
      joinedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/recentRooms/${room.code}`);
  }

  return { ...latestRoom, memberUids: updatedMembers };
}

export async function leaveRoomInFirestore(roomCode: string, uid: string) {
  const roomRef = doc(db, 'rooms', roomCode);
  try {
    const snap = await getDoc(roomRef);
    if (snap.exists()) {
      const data = snap.data() as CinemaRoom;
      if (data.status === 'open' && Array.isArray(data.memberUids) && data.memberUids.includes(uid)) {
        const nextUids = data.memberUids.filter((u) => u !== uid);
        await updateDoc(roomRef, {
          memberUids: nextUids,
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch {
    // Ignore if room already closed or already removed
  }

  try {
    await deleteDoc(doc(db, 'rooms', roomCode, 'members', uid));
  } catch {
    // Ignore if member doc already removed
  }
}

export async function updateSeatInFirestore(roomCode: string, uid: string, seatId: string) {
  if (!/^[A-C][1-8]$/.test(seatId)) return;
  const path = `rooms/${roomCode}/members/${uid}`;
  try {
    await updateDoc(doc(db, 'rooms', roomCode, 'members', uid), {
      seatId,
      seatTier: getSeatTier(seatId),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateRoomPlaybackInFirestore(
  roomCode: string,
  updates: {
    isPlaying?: boolean;
    playbackPosition?: number;
    playbackUpdatedAt?: number;
    currentVideoId?: string;
    currentVideoTitle?: string;
    videoQuality?: VideoQuality;
    syncEnabled?: boolean;
    sourceMode?: WatchSourceMode;
    browserUrl?: string;
    browserQuery?: string;
  }
) {
  const path = `rooms/${roomCode}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.isPlaying !== undefined) payload.isPlaying = updates.isPlaying;
  if (updates.playbackPosition !== undefined && Number.isFinite(updates.playbackPosition)) {
    payload.playbackPosition = Math.max(0, Math.min(86400, updates.playbackPosition));
  }
  if (updates.playbackUpdatedAt !== undefined && Number.isFinite(updates.playbackUpdatedAt)) {
    payload.playbackUpdatedAt = Math.max(0, Math.floor(updates.playbackUpdatedAt));
  }
  if (updates.currentVideoId !== undefined) payload.currentVideoId = updates.currentVideoId.slice(0, 20);
  if (updates.currentVideoTitle !== undefined) payload.currentVideoTitle = updates.currentVideoTitle.slice(0, 140);
  if (updates.videoQuality !== undefined) payload.videoQuality = updates.videoQuality;
  if (updates.syncEnabled !== undefined) payload.syncEnabled = updates.syncEnabled;
  if (updates.sourceMode !== undefined) payload.sourceMode = updates.sourceMode;
  if (updates.browserUrl !== undefined) payload.browserUrl = updates.browserUrl.slice(0, 600);
  if (updates.browserQuery !== undefined) payload.browserQuery = updates.browserQuery.slice(0, 160);

  try {
    await updateDoc(doc(db, 'rooms', roomCode), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateRoomHostSettingsInFirestore(
  roomCode: string,
  updates: RoomSettingsPayload & { currentVideoId?: string; currentVideoTitle?: string }
) {
  const path = `rooms/${roomCode}`;
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) payload.name = updates.name.trim().slice(0, 60) || 'Cinema Room';
  if (updates.isPublic !== undefined) payload.isPublic = updates.isPublic;
  if (updates.videoQuality !== undefined) payload.videoQuality = updates.videoQuality;
  if (updates.syncEnabled !== undefined) payload.syncEnabled = updates.syncEnabled;
  if (updates.voiceChatEnabled !== undefined) payload.voiceChatEnabled = updates.voiceChatEnabled;
  if (updates.currentVideoId !== undefined) payload.currentVideoId = updates.currentVideoId.slice(0, 20);
  if (updates.currentVideoTitle !== undefined) payload.currentVideoTitle = updates.currentVideoTitle.slice(0, 140);

  try {
    await updateDoc(doc(db, 'rooms', roomCode), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function transferHostInFirestore(roomCode: string, newHostId: string, newHostName: string) {
  const path = `rooms/${roomCode}`;
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      hostId: newHostId,
      hostName: newHostName.slice(0, 60),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function closeRoomInFirestore(roomCode: string) {
  const path = `rooms/${roomCode}`;
  try {
    await updateDoc(doc(db, 'rooms', roomCode), {
      status: 'closed',
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function removeMemberFromFirestore(room: CinemaRoom, targetUid: string) {
  try {
    const roomRef = doc(db, 'rooms', room.code);
    const snap = await getDoc(roomRef);
    const currentUids =
      snap.exists() && Array.isArray((snap.data() as CinemaRoom).memberUids)
        ? (snap.data() as CinemaRoom).memberUids
        : room.memberUids;
    const nextUids = currentUids.filter((u) => u !== targetUid);
    await updateDoc(roomRef, {
      memberUids: nextUids,
      updatedAt: serverTimestamp()
    });
    await deleteDoc(doc(db, 'rooms', room.code, 'members', targetUid));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `rooms/${room.code}`);
  }
}

export async function persistQueueItemToFirestore(
  roomCode: string,
  item: QueueItem,
  visibleToUids?: string[]
) {
  const path = `rooms/${roomCode}/queue/${item.id}`;
  const safeVisible = Array.from(new Set([...(visibleToUids || []), item.addedByUid])).slice(0, 24);
  try {
    await setDoc(doc(db, 'rooms', roomCode, 'queue', item.id), {
      id: item.id,
      roomId: roomCode,
      videoId: item.videoId,
      title: item.title.slice(0, 140),
      addedByUid: item.addedByUid,
      addedByName: item.addedByName.slice(0, 60),
      order: item.order,
      status: item.status,
      isPublicRoom: item.isPublicRoom,
      visibleToUids: safeVisible,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function removeQueueItemFromFirestore(roomCode: string, itemId: string) {
  const path = `rooms/${roomCode}/queue/${itemId}`;
  try {
    await deleteDoc(doc(db, 'rooms', roomCode, 'queue', itemId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function persistChatMessageToFirestore(
  roomCode: string,
  msg: ChatMessage,
  isPublicRoom: boolean,
  visibleToUids?: string[]
) {
  const path = `rooms/${roomCode}/messages/${msg.id}`;
  const safeVisible = Array.from(new Set([...(visibleToUids || []), msg.senderUid])).slice(0, 24);
  try {
    await setDoc(doc(db, 'rooms', roomCode, 'messages', msg.id), {
      id: msg.id,
      roomId: roomCode,
      senderUid: msg.senderUid,
      senderName: msg.senderName.slice(0, 60),
      senderAvatar: msg.senderAvatar.slice(0, 500),
      text: msg.text.slice(0, 400),
      isPublicRoom,
      visibleToUids: safeVisible,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

function toEpochMs(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (val && typeof val === 'object' && 'toMillis' in val && typeof (val as { toMillis: () => number }).toMillis === 'function') {
    return (val as { toMillis: () => number }).toMillis();
  }
  return Date.now();
}

export function subscribeActiveRoom(
  roomCode: string,
  onData: (room: CinemaRoom | null) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}`;
  return onSnapshot(
    doc(db, 'rooms', roomCode),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(snapshot.data() as CinemaRoom);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeRoomMembersByUids(
  roomCode: string,
  memberUids: string[],
  onData: (members: LiveMember[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const uniqueUids = Array.from(new Set(memberUids.filter(Boolean))).slice(0, 24);
  if (uniqueUids.length === 0) {
    onData([]);
    return () => {};
  }

  const memberMap = new Map<string, LiveMember>();
  const emitSorted = () => {
    const list = Array.from(memberMap.values()).sort((a, b) => a.joinedAt - b.joinedAt);
    onData(list);
  };

  const unsubs = uniqueUids.map((uid) =>
    onSnapshot(
      doc(db, 'rooms', roomCode, 'members', uid),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data();
          const seatId = typeof d.seatId === 'string' && /^[A-C][1-8]$/.test(d.seatId) ? d.seatId : 'B3';
          memberMap.set(uid, {
            uid,
            socketId: '',
            displayName: typeof d.displayName === 'string' ? d.displayName : 'Cinema Guest',
            photoURL: typeof d.photoURL === 'string' ? d.photoURL : '',
            seatId,
            seatTier: getSeatTier(seatId),
            isOnline: true,
            inVoice: false,
            micMuted: true,
            isSpeaking: false,
            joinedAt: toEpochMs(d.joinedAt)
          });
        } else {
          memberMap.delete(uid);
        }
        emitSorted();
      },
      (error) => {
        if (onError) onError(error);
      }
    )
  );

  return () => {
    for (const u of unsubs) u();
  };
}

export function subscribeRoomMessages(
  roomCode: string,
  uid: string,
  isPublicRoom: boolean,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}/messages`;
  const q = isPublicRoom
    ? query(collection(db, 'rooms', roomCode, 'messages'), where('isPublicRoom', '==', true), limit(60))
    : query(collection(db, 'rooms', roomCode, 'messages'), where('visibleToUids', 'array-contains', uid), limit(60));

  return onSnapshot(
    q,
    (snapshot) => {
      const msgs: ChatMessage[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: typeof data.id === 'string' ? data.id : d.id,
            roomId: roomCode,
            senderUid: typeof data.senderUid === 'string' ? data.senderUid : '',
            senderName: typeof data.senderName === 'string' ? data.senderName : 'Guest',
            senderAvatar: typeof data.senderAvatar === 'string' ? data.senderAvatar : '',
            text: typeof data.text === 'string' ? data.text : '',
            timestamp: toEpochMs(data.createdAt)
          };
        })
        .sort((a, b) => a.timestamp - b.timestamp);
      onData(msgs);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeRoomQueue(
  roomCode: string,
  uid: string,
  isPublicRoom: boolean,
  onData: (queue: QueueItem[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `rooms/${roomCode}/queue`;
  const q = isPublicRoom
    ? query(collection(db, 'rooms', roomCode, 'queue'), where('isPublicRoom', '==', true), limit(40))
    : query(collection(db, 'rooms', roomCode, 'queue'), where('visibleToUids', 'array-contains', uid), limit(40));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: QueueItem[] = snapshot.docs
        .map((d) => {
          const data = d.data();
          return {
            id: typeof data.id === 'string' ? data.id : d.id,
            roomId: roomCode,
            videoId: typeof data.videoId === 'string' ? data.videoId : '',
            title: typeof data.title === 'string' ? data.title : 'YouTube Video',
            addedByUid: typeof data.addedByUid === 'string' ? data.addedByUid : '',
            addedByName: typeof data.addedByName === 'string' ? data.addedByName : 'Viewer',
            order: typeof data.order === 'number' ? data.order : 0,
            status: (data.status === 'approved' || data.status === 'played' ? data.status : 'pending') as QueueItem['status'],
            isPublicRoom: Boolean(data.isPublicRoom),
            createdAt: toEpochMs(data.createdAt)
          };
        })
        .filter((item) => item.status !== 'played')
        .sort((a, b) => a.order - b.order);
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribePublicRooms(
  onData: (rooms: CinemaRoom[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'rooms'), where('isPublic', '==', true), limit(25));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as CinemaRoom)
        .filter((r) => r.status === 'open');
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, 'rooms');
    }
  );
}

export function subscribeMyRooms(
  uid: string,
  onData: (rooms: CinemaRoom[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'rooms'), where('memberUids', 'array-contains', uid), limit(20));
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => d.data() as CinemaRoom)
        .filter((r) => r.status === 'open');
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, 'rooms');
    }
  );
}

export function subscribeRecentRooms(
  uid: string,
  onData: (rooms: RecentRoom[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const path = `users/${uid}/recentRooms`;
  const q = query(collection(db, 'users', uid, 'recentRooms'), orderBy('joinedAt', 'desc'), limit(12));
  return onSnapshot(
    q,
    (snapshot) => {
      onData(snapshot.docs.map((d) => d.data() as RecentRoom));
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeWatchParties(
  onData: (parties: WatchParty[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = query(collection(db, 'watchParties'), where('isPublic', '==', true), limit(15));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs
        .map((d) => d.data() as WatchParty)
        .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
      onData(list);
    },
    (error) => {
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, 'watchParties');
    }
  );
}

export async function createWatchParty(params: {
  title: string;
  roomCode: string;
  videoId: string;
  videoTitle: string;
  scheduledFor: string;
  isPublic: boolean;
  user: UserProfile;
}): Promise<WatchParty> {
  const id = `wp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const path = `watchParties/${id}`;
  const party: WatchParty = {
    id,
    title: params.title.trim().slice(0, 80) || 'Movie Night',
    roomCode: params.roomCode,
    hostId: params.user.uid,
    hostName: params.user.displayName.slice(0, 60),
    videoId: params.videoId,
    videoTitle: params.videoTitle.trim().slice(0, 140),
    scheduledFor: params.scheduledFor.slice(0, 40),
    isPublic: params.isPublic
  };
  try {
    await setDoc(doc(db, 'watchParties', id), {
      ...party,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
  return party;
}

export async function deleteWatchParty(partyId: string) {
  const path = `watchParties/${partyId}`;
  try {
    await deleteDoc(doc(db, 'watchParties', partyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
