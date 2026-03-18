require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const db = mongoose.connection.db;
    const comment = await db.collection('comments').findOne({ parent_id: { $ne: null } });
    if (comment) {
        console.log('Found nested comment:', comment);
        
        const parent = await db.collection('comments').findOne({ _id: comment.parent_id });
        console.log('Parent:', parent);
        
        const res = await db.collection('comments').aggregate([
            { $match: { _id: comment.parent_id } },
            {
                $graphLookup: {
                    from: 'comments',
                    startWith: '$_id',
                    connectFromField: '_id',
                    connectToField: 'parent_id',
                    as: 'descendants'
                }
            }
        ]).toArray();
        console.log('GraphLookup descendants:', res[0]?.descendants);
    } else {
        console.log('No nested comments found');
    }
    process.exit(0);
}).catch(console.error);
