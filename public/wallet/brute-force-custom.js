const { webcrypto } = require('crypto');

// The Mnemonic we found in the wallet
const mnemonic = "cloth green give mad leisure sense episode leopard artist cave hint unit";

// The Address we are looking for
const targetAddress = "0x0380327b38ea655824484302ed06060db3214a7d";

// Logic copied from wallet-security.js

async function digestMessage(message) {
    const encoder = new TextEncoder();
    const data = typeof message === 'string' ? encoder.encode(message) : message;
    const hash = await webcrypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
}

// Convert mnemonic to seed (DETERMINISTIC - same mnemonic = same seed)
async function mnemonicToSeed(mnemonic) {
    // Normalize mnemonic (trim, lowercase) for consistency
    const normalizedMnemonic = mnemonic.trim().toLowerCase();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalizedMnemonic);
    // SHA-256 of the string itself (Custom flaw)
    const hash = await webcrypto.subtle.digest('SHA-256', data);
    return new Uint8Array(hash);
}

// Derive key pair from seed (DETERMINISTIC)
async function deriveKeyPair(seed, index) {
    // Combine seed with index for deterministic derivation
    const combined = new Uint8Array(seed.length + 4);
    combined.set(seed);
    // Big-endian index
    combined.set([index >> 24, (index >> 16) & 0xFF, (index >> 8) & 0xFF, index & 0xFF], seed.length);

    // Hash to get deterministic key material
    const hash = await webcrypto.subtle.digest('SHA-256', combined);
    const keyMaterial = new Uint8Array(hash);

    const privateKeyHex = Buffer.from(keyMaterial).toString('hex');

    // Create Public Key representation (Hash of private Key materia)
    const publicKeyHash = await webcrypto.subtle.digest('SHA-256', keyMaterial);

    return {
        publicKey: publicKeyHash,
        privateKey: privateKeyHex
    };
}

async function keyPairToAddress(keyPair) {
    // Double Hash: Hash the Public Key Hash again
    const publicKeyHash = await webcrypto.subtle.digest('SHA-256', keyPair.publicKey);

    const address = '0x' + Buffer.from(publicKeyHash)
        .slice(0, 20)
        .toString('hex');

    return address;
}

async function main() {
    console.log('Searching for address:', targetAddress);
    console.log('Using mnemonic:', mnemonic);

    const seed = await mnemonicToSeed(mnemonic);
    console.log('Seed derived.');

    // Scan indices 0 to 10000
    const LIMIT = 10000;

    for (let i = 0; i < LIMIT; i++) {
        const keyPair = await deriveKeyPair(seed, i);
        const address = await keyPairToAddress(keyPair);

        if (i % 1000 === 0) console.log(`Checked ${i} indices... (Current: ${address})`);

        if (address.toLowerCase() === targetAddress.toLowerCase()) {
            console.log('\n✅ MATCH FOUND!!!');
            console.log('Index:', i);
            console.log('Private Key:', keyPair.privateKey);
            console.log('Address:', address);
            return;
        }
    }

    console.log(`\n❌ No match found after scanning ${LIMIT} indices.`);
}

main().catch(console.error);
