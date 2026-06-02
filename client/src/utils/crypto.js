// Client-side cryptographic helper to simulate transaction signing.
// This generates a secure-looking token which represents the signed receipt of payment.

export function generateOfflineSignature(senderVpa, receiverVpa, amount, timestamp, txId) {
  // Simple deterministic hash function simulating a cryptographic signature
  const secretKey = "OFFLINE_SECRET_MOCK_KEY_UPI";
  const payload = `${senderVpa}:${receiverVpa}:${amount}:${timestamp}:${txId}:${secretKey}`;
  
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    const char = payload.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const unsignedHash = hash >>> 0;
  const sigToken = unsignedHash.toString(16).toUpperCase();
  
  return `OP_SIG_${sigToken}_${txId.substring(4, 10)}`;
}

export function verifyOfflineSignature(tx) {
  const { senderVpa, receiverVpa, amount, timestamp, txId, signature } = tx;
  const recomputed = generateOfflineSignature(senderVpa, receiverVpa, amount, timestamp, txId);
  return signature === recomputed;
}
