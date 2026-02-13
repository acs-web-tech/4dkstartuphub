# Troubleshooting Missing Comments

## 🔍 Issue Observed
You reported seeing "Comments (0)" on one screen while another screen shows "Comments (15)" for a post with the same title ("I need a life partner").

## 💡 Cause
This discrepancy is caused by **Duplicate Posts**.
- You accidentally created two separate posts with the same title.
- **Post A**: Contains 15 comments and user activity.
- **Post B**: Is a newly created duplicate (shown in your screenshot with "0 views") which has no comments yet.

## ✅ Solution Implemented
To prevent this from happening in the future, we have added a **Duplicate Post Prevention** check to the backend.
- Attempts to create a post with the same title within 1 minute of a previous post will now be blocked with a message: "You just posted this. Please wait a moment."

## 🛠️ Recommended Action
- You can safely **Delete** the empty duplicate post (Post B) using the trash icon.
- Your original post with comments (Post A) will remain unaffected.
