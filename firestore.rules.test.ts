/**
 * CineHall Firestore Security Rules — Dirty Dozen Adversarial Verification Spec
 * Maps all 12 adversarial payloads from security_spec.md against firestore.rules.
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_CASES: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'PII Read Leak',
    path: '/users/userA/private/info',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    rationale: 'Private PII subcollection strictly requires userId == request.auth.uid.'
  },
  {
    id: 2,
    name: 'Identity Spoofing on Room Create',
    path: '/rooms/PVR999',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'hostId and createdBy must equal request.auth.uid.'
  },
  {
    id: 3,
    name: 'Shadow Ghost Field Injection',
    path: '/rooms/PVR999',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidCinemaRoom enforces keys().hasOnly() blocking extra keys.'
  },
  {
    id: 4,
    name: 'ID Poisoning Attack',
    path: '/users/' + 'A'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidId enforces size() <= 128 and regex ^[a-zA-Z0-9_-]+$.'
  },
  {
    id: 5,
    name: 'Client Timestamp Forgery',
    path: '/rooms/PVR999',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'createdAt and updatedAt must strictly equal request.time.'
  },
  {
    id: 6,
    name: 'Unverified Email Write',
    path: '/rooms/PVR999',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'isVerified() requires request.auth.token.email_verified == true.'
  },
  {
    id: 7,
    name: 'Terminal State Bypass',
    path: '/rooms/PVR999',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Update rule mandates existing().status == "open".'
  },
  {
    id: 8,
    name: 'Guest Host Takeover',
    path: '/rooms/PVR999',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Host transfer branch checks existing().hostId == request.auth.uid.'
  },
  {
    id: 9,
    name: 'Value Poisoning on Allowed Key',
    path: '/rooms/PVR999',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'isValidCinemaRoom wraps the entire update block and rejects name.size() > 60.'
  },
  {
    id: 10,
    name: 'Orphaned Queue Item',
    path: '/rooms/NOPE99/queue/q1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    rationale: 'Master gate checks exists(/databases/$(database)/documents/rooms/$(roomId)).'
  },
  {
    id: 11,
    name: 'Chat Message Tampering',
    path: '/rooms/PVR999/messages/m1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    rationale: 'Chat messages explicitly enforce allow update: if false.'
  },
  {
    id: 12,
    name: 'Blanket Private Room Scraping',
    path: '/rooms',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    rationale: 'allow list checks resource.data.isPublic == true || membership.'
  }
];
