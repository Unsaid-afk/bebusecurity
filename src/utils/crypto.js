/**
 * Web Crypto API wrapper for E2EE
 */

export const generateKey = async () => {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
};

export const exportKey = async (key) => {
  const exported = await window.crypto.subtle.exportKey("jwk", key);
  return btoa(JSON.stringify(exported));
};

export const importKey = async (jwkBase64) => {
  const jwk = JSON.parse(atob(jwkBase64));
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
};

export const encryptMessage = async (key, message) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encoded
  );

  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
  };
};

export const decryptMessage = async (key, { ciphertext, iv }) => {
  const encrypted = new Uint8Array(
    atob(ciphertext)
      .split("")
      .map((c) => c.charCodeAt(0))
  );
  const ivArray = new Uint8Array(
    atob(iv)
      .split("")
      .map((c) => c.charCodeAt(0))
  );

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivArray,
    },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
};

export const shred = (obj) => {
  if (!obj) return;
  // Overwrite with null/zeroes
  Object.keys(obj).forEach(key => {
    obj[key] = null;
  });
};
