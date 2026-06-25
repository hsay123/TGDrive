const { getDb } = require('./dist-electron/core/db/db.js');
const { copyMultiple } = require('./dist-electron/core/telegram/copier.js');
const { initializeChannels } = require('./dist-electron/core/telegram/channels.js');

async function test() {
  await initializeChannels();
  const db = getDb();
  const file = db.prepare('SELECT * FROM files LIMIT 1').get();
  console.log('Copying file:', file.name);
  try {
    const results = await copyMultiple([file.id], '/');
    console.log('Copy result:', results);
  } catch (err) {
    console.error('Copy error:', err);
  }
}
test();
