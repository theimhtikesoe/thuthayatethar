const DATABASE_NAME = "thuthayatethar-cover-images";
const DATABASE_VERSION = 1;
const STORE_NAME = "pdf-covers";

function openCoverDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

export function pdfCoverCacheKey(slug: string | undefined, id: string | number): string {
  return `pdf-cover-v1:${slug || id}`;
}

export async function readPdfCover(key: string): Promise<Blob | null> {
  let database: IDBDatabase | null = null;
  try {
    database = await openCoverDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("indexeddb_read_failed"));
      transaction.oncomplete = () => database?.close();
      transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_read_failed"));
    });
  } catch {
    database?.close();
    return null;
  }
}

export async function writePdfCover(key: string, cover: Blob): Promise<void> {
  let database: IDBDatabase | null = null;
  try {
    database = await openCoverDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database!.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(cover, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("indexeddb_write_failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("indexeddb_write_aborted"));
    });
  } catch {
    // Cover persistence is best-effort; displaying the freshly rendered image still works.
  } finally {
    database?.close();
  }
}
