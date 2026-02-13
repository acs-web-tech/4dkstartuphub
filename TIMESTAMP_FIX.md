# Timestamp Parsing Fix

## 🐛 Issues Fixed
- **Comments showing "5h ago"**: New comments fetched from the server were displaying as 5 hours ago (in IST) instead of "Just now".
- **Incorrect Date Parsing**: Dates were being interpreted as local time instead of UTC.

## 🛠️ Root Cause
- The backend (SQLite) stores timestamps as UTC strings `YYYY-MM-DD HH:MM:SS` (without the `Z` suffix).
- JavaScript's `new Date('YYYY-MM-DD HH:MM:SS')` parses such strings as **Local Time**.
- For users in India (IST, UTC+05:30), a UTC timestamp of `10:00` was interpreted as `10:00 IST` instead of `15:30 IST`.
- This resulted in time diff calculations being off by exactly 5.5 hours.

## ✅ Solution
We implemented a robust date parsing logic in the frontend components:
```typescript
const parseDate = (dateStr: string) => {
    // If the string lacks timezone info ('Z' or '+'), treat it as UTC by appending 'Z'
    if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        return new Date(dateStr + 'Z');
    }
    return new Date(dateStr);
};
```

## 📂 Updated Components
1.  **`CommentsSection.tsx`**: Added `parseDate` helper and updated `getTimeAgo` and `isRealtimeNew` logic.
2.  **`PostCard.tsx`**: Updated `getTimeAgo` to handle UTC strings.
3.  **`PostDetail.tsx`**: Updated date display in metadata.

This ensures all timestamps across the app are consistent regardless of their source (optimistic vs server).
