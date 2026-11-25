# CineHall Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **PII Isolation**: User email addresses and private preferences reside exclusively in `/users/{userId}/private/info`, accessible only to `request.auth.uid == userId`. Public profiles (`/users/{userId}`) contain zero PII.
2. **Verified Write Identity**: All client writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Immutable Ownership & Timestamps**: `createdBy`, `createdAt`, `uid`, `senderUid`, `addedByUid`, and `roomId` cannot be altered after creation. Timestamps must strictly equal `request.time`.
4. **Master Gate & Room Lifecycle**: Subcollections (`/rooms/{roomId}/members`, `/queue`, `/messages`) verify parent room existence and `status == 'open'`. Once a room reaches `status == 'closed'`, all updates are permanently locked.
5. **Bounded Membership & Strict Keys**: `memberUids` on `/rooms/{roomId}` is strictly bounded to `<= 24` seats and validated for string contents. Every document enforces `keys().hasAll(...) && keys().hasOnly(...)` on create and `affectedKeys().hasOnly(...)` on update.
6. **Zero Blanket List Queries**: Every `allow list` rule evaluates `resource.data` without `get()`/`exists()` lookups.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **PII Read Leak**: User B attempts `get` on `/users/userA/private/info` -> `PERMISSION_DENIED`.
2. **Identity Spoofing on Room Creation**: User A creates `/rooms/PVR999` with `hostId: "userB"` -> `PERMISSION_DENIED`.
3. **Shadow Ghost Field Injection**: User A creates `/rooms/PVR999` with extra key `isAdmin: true` -> `PERMISSION_DENIED`.
4. **ID Poisoning Attack**: User A attempts write to `/users/${'A'.repeat(200)}` -> `PERMISSION_DENIED`.
5. **Client Timestamp Forgery**: User A creates `/rooms/PVR999` with client-forged `createdAt: Timestamp(2020-01-01)` -> `PERMISSION_DENIED`.
6. **Unverified Email Write**: Authenticated user with `email_verified: false` creates a room -> `PERMISSION_DENIED`.
7. **Terminal State Bypass**: Host attempts to reopen a room whose `status` is `'closed'` -> `PERMISSION_DENIED`.
8. **Guest Host Takeover**: Non-host member attempts to update `hostId` on `/rooms/PVR999` -> `PERMISSION_DENIED`.
9. **Value Poisoning on Allowed Update Key**: Host updates `name` on `/rooms/PVR999` to a 200-character string (exceeds `maxLength: 60`) -> `PERMISSION_DENIED`.
10. **Orphaned Queue Item**: User creates `/rooms/NOPE99/queue/q1` for a non-existent room -> `PERMISSION_DENIED`.
11. **Chat Message Tampering**: Sender attempts to `update` an already-sent chat message -> `PERMISSION_DENIED`.
12. **Blanket Private Room Scraping**: User B runs unfiltered `list` on `/rooms` when private rooms exist -> `PERMISSION_DENIED`.
