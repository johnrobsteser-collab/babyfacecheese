// Script to decrypt wallet backup data and find the correct private key
const crypto = require('crypto');

const password = 'Robert79';

// Encrypted data from wallet
const encryptedPrivateKey = 'rt6gDk+3ZwCYB371jmUc9idvDEynNi9KlqLdf1lJ0kIkJeY0B2JhsCvuqkJWddwibWdXfNINTzdVPr1EweTdey8/xK+Iy68/X38J9FxopvoKlmyg0TBROjgkQOAG63S0F+VQ7hrUOG7F2a4q';
const backupKey = 'YVtUXEoRVlhrCgYAE0wPXzZXAQNEFVNfMw4EVkAXA19mWFEHQ0FTWmtbUlFGQgUNZQxbU0NMVgtkV1NcShIFWA==';
const cheeseWalletMnemonic = 'yND9AW3gcE0qd8w8xIVCH4N92OIYZ3kyZNXSiCs7/CdXyks4rKVhP0gowWDo77+L3ixK975mWIJVLfjgeMuDwsLsFKxdqaf0uUNEZP1/MV0iuM6iIppvLh/O4W3zYSoRloPG3Y9N8fX0euMCua4/W+pPJvk=';

const expectedAddress = '0x0380327b38ea655824484302ed06060db3214a7d';

async function decryptAESGCM(encryptedBase64, password) {
    try {
        const combined = Buffer.from(encryptedBase64, 'base64');

        // Extract salt (16 bytes), IV (12 bytes), and encrypted data
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const encryptedData = combined.slice(28);

        // Derive key from password using PBKDF2
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

        // Decrypt using AES-256-GCM
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

        // Assume last 16 bytes are auth tag
        const authTag = encryptedData.slice(-16);
        const ciphertext = encryptedData.slice(0, -16);

        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);

        return decrypted.toString('utf8');
    } catch (e) {
        return null;
    }
}

async function tryXORDecrypt(encodedBase64, keyString) {
    try {
        const encoded = Buffer.from(encodedBase64, 'base64');
        const key = Buffer.from(keyString);
        const result = Buffer.alloc(encoded.length);

        for (let i = 0; i < encoded.length; i++) {
            result[i] = encoded[i] ^ key[i % key.length];
        }

        return result.toString('utf8');
    } catch (e) {
        return null;
    }
}

async function main() {
    console.log('========================================');
    console.log('Wallet Decryption Tool');
    console.log('========================================');
    console.log('Password:', password);
    console.log('Expected address:', expectedAddress);
    console.log('');

    // Try decrypting encryptedPrivateKey with AES-GCM
    console.log('--- Decrypting encryptedPrivateKey ---');
    const decryptedKey = await decryptAESGCM(encryptedPrivateKey, password);
    if (decryptedKey) {
        console.log('Decrypted private key:', decryptedKey);
    } else {
        console.log('Failed to decrypt with AES-GCM');
    }

    // Try decrypting cheeseWalletMnemonic
    console.log('\n--- Decrypting cheeseWalletMnemonic ---');
    const decryptedMnemonic = await decryptAESGCM(cheeseWalletMnemonic, password);
    if (decryptedMnemonic) {
        console.log('Decrypted mnemonic:', decryptedMnemonic);
    } else {
        console.log('Failed to decrypt with AES-GCM');
    }

    // Try XOR decrypting backupKey with password
    console.log('\n--- Decrypting backupKey with XOR ---');
    const xorDecrypted = await tryXORDecrypt(backupKey, password);
    if (xorDecrypted) {
        console.log('XOR decrypted:', xorDecrypted);
    }

    // Try XOR with password hash
    const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
    console.log('\n--- Decrypting backupKey with password hash ---');
    const xorDecrypted2 = await tryXORDecrypt(backupKey, passwordHash);
    if (xorDecrypted2) {
        console.log('XOR with hash:', xorDecrypted2);
    }

    // Decode backupKey raw
    console.log('\n--- Raw backupKey decode ---');
    const rawBackup = Buffer.from(backupKey, 'base64');
    console.log('Raw hex:', rawBackup.toString('hex'));
    console.log('Raw length:', rawBackup.length);
}

main().catch(console.error);
