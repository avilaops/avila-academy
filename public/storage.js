function database() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('academy-studio', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('drafts', { keyPath: 'id' });
      request.result.createObjectStore('labels', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function drafts(action, draft) {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts', 'labels'], action === 'save' ? 'readwrite' : 'readonly');
      const store = tx.objectStore('drafts');
      if (action === 'save') {
        const { blob, ...meta } = draft;
        tx.objectStore('labels').put(meta);
      }
      const request = action === 'save' ? store.put(draft) : action === 'list' ? tx.objectStore('labels').getAll() : store.get(draft);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
