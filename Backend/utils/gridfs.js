// ─────────────────────────────────────────────────────────────────────────────
// GridFS helper
//
// Lightweight wrapper around MongoDB's native GridFSBucket. Used to store
// employee profile photos (and, later, documents) as binary blobs directly
// inside the same MongoDB Atlas database that holds the User collection.
//
// Why GridFS:
//   • No extra storage service (S3, Cloudinary, local disk) required
//   • Files survive across Railway/Render container restarts
//   • Streams chunked binary, so files don't bloat User documents
//   • Atomic with the rest of the app's MongoDB writes
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const BUCKET_NAME = "employee_files";   // creates `employee_files.files` + `.chunks` collections

let _bucket = null;

/**
 * Returns a singleton GridFSBucket bound to the current mongoose connection.
 * Throws if MongoDB isn't connected yet (the caller should ensure connectDB()
 * has resolved — server.js calls connectDB() at boot).
 */
function getBucket() {
  if (_bucket) return _bucket;

  const conn = mongoose.connection;
  if (!conn || conn.readyState !== 1 || !conn.db) {
    throw new Error("MongoDB is not connected yet — cannot open GridFS bucket");
  }

  _bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: BUCKET_NAME });
  return _bucket;
}

/**
 * Upload an in-memory buffer (e.g. from multer.memoryStorage()) into GridFS.
 * Returns the inserted file's _id as a string.
 *
 * @param {Buffer} buffer       - file bytes
 * @param {string} filename     - original filename
 * @param {string} contentType  - mime type (e.g. "image/jpeg")
 * @param {object} [metadata]   - any extra fields stored on the file doc
 */
function uploadBuffer(buffer, filename, contentType, metadata = {}) {
  return new Promise((resolve, reject) => {
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(filename, {
      contentType,
      metadata
    });

    uploadStream.on("error", reject);
    uploadStream.on("finish", () => resolve(String(uploadStream.id)));

    uploadStream.end(buffer);
  });
}

/**
 * Open a readable stream for a stored file. The caller is responsible for
 * piping it to the HTTP response (and setting Content-Type from the file doc).
 */
function openDownloadStream(fileId) {
  const bucket = getBucket();
  const _id = typeof fileId === "string" ? new mongoose.Types.ObjectId(fileId) : fileId;
  return bucket.openDownloadStream(_id);
}

/**
 * Look up a file's metadata (filename, length, contentType, …) without
 * downloading the bytes.
 */
async function findFile(fileId) {
  const bucket = getBucket();
  const _id = typeof fileId === "string" ? new mongoose.Types.ObjectId(fileId) : fileId;
  const cursor = bucket.find({ _id });
  const docs = await cursor.toArray();
  return docs[0] || null;
}

/**
 * Delete a file (and all its chunks) from GridFS. Safe to call with a missing
 * id — it just resolves without throwing.
 */
async function deleteFile(fileId) {
  if (!fileId) return;
  const bucket = getBucket();
  const _id = typeof fileId === "string" ? new mongoose.Types.ObjectId(fileId) : fileId;
  try {
    await bucket.delete(_id);
  } catch (err) {
    // FileNotFound is fine — anything else we let bubble.
    if (err && err.code !== "ENOENT" && !/FileNotFound/i.test(String(err.message))) {
      throw err;
    }
  }
}

module.exports = {
  BUCKET_NAME,
  getBucket,
  uploadBuffer,
  openDownloadStream,
  findFile,
  deleteFile
};
