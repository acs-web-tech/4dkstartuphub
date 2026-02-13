# Comment Thread Notifications

## 📢 Feature Overview
To improve user engagement, the system now notifies **all previous commenters** on a post when a new comment is added.

Previously, only the **Post Author** and **@Mentioned Users** were notified.
Now, if User A, User B, and User C have all commented on a post, and User D adds a new comment:
- **Post Author** gets "Comment on your post".
- **User A, B, C** get "User D also commented on a post you follow".

## 🛠️ Implementation Details

### Server-Side Logic (`server/src/routes/posts.ts`)

1.  **Identify Targets**: We query the database for all `DISTINCT user_id` from the `comments` table for the current `post_id`.
    ```sql
    SELECT DISTINCT user_id FROM comments WHERE post_id = ?
    ```

2.  **Smart Filtering**: We ensure no duplicate or redundant notifications:
    - Exclude **Current Commenter** (Self).
    - Exclude **Post Author** (They already received a specific author notification).
    - Exclude **@Mentioned Users** (They already received a specific mention notification).

3.  **Real-Time Delivery**:
    - We use the existing notification type: `comment` (due to database constraints).
    - We use a specific title: `'New reply'`.
    - We use `socketService.sendNotification` to push it instantly.

### Client-Side Updates (`client/src`)

1.  **Types**: `Notification` interface uses standard types.
2.  **UI**: Updated `Header.tsx` to handle the `title` distinction:
    - If `type === 'comment'` AND `title === 'New reply'`:
        - **Text**: "also commented on a post you follow"
    - Otherwise:
        - **Text**: "commented on your post"

## 🧪 Testing Scenarios

1.  **Scenario A (Author Reply)**:
    - User A (Author) posts.
    - User B comments.
    - User A replies.
    - **Result**: User B gets "User A also commented..." (or specialized reply notif). logic treats it as "also commented".

2.  **Scenario B (Third Party)**:
    - User A posts.
    - User B comments.
    - User C comments.
    - **Result**:
        - User A gets "User C commented on your post".
        - User B gets "User C also commented on a post you follow".

3.  **Scenario C (Mention)**:
    - User A posts.
    - User B comments: "@UserC check this".
    - **Result**:
        - User C gets "@UserB mentioned you".
        - User A gets "User B commented on your post".
        - (User C does NOT get "also commented" duplicate).

## 📝 Status
- **Backend**: ✅ Implemented
- **Frontend**: ✅ Implemented
- **Build**: ✅ Passing
