// Script to recover private key using the wallet's custom derivation
// The CHEESE wallet uses a custom derivation (not BIP44) because mnemonic has no checksum

const crypto = require('crypto');

// The wallet's exact derivation algorithm (from wallet-security.js)
async function deriveFromMnemonic(mnemonic) {
    // Step 1: Normalize mnemonic (same as wallet-security.js mnemonicToSeed)
    const normalizedMnemonic = mnemonic.trim().toLowerCase();

    // Step 2: Create seed from mnemonic using SHA-256
    const hash = crypto.createHash('sha256').update(normalizedMnemonic).digest();
    const seed = new Uint8Array(hash);

    // Step 3: Derive key pair (same as wallet-security.js deriveKeyPair with index=0)
    const index = 0;
    const combined = new Uint8Array(seed.length + 4);
    combined.set(seed);
    combined.set([index >> 24, index >> 16, index >> 8, index], seed.length);

    // Hash to get deterministic key material
    const keyMaterial = crypto.createHash('sha256').update(Buffer.from(combined)).digest();

    // Step 4: Private key is the hex of keyMaterial (32 bytes)
    const privateKeyHex = keyMaterial.toString('hex');

    // Step 5: Derive address (same as keyPairToAddress)
    // Hash the keyMaterial again
    const publicKeyHash = crypto.createHash('sha256').update(keyMaterial).digest();

    // Take first 20 bytes for address
    const address = '0x' + publicKeyHash.slice(0, 20).toString('hex');

    return {
        address,
        privateKey: privateKeyHex,
        seed: seed.toString('hex')
    };
}

// User's mnemonic
const mnemonic = "cloth green give mad leisure sense episode leopard artist cave hint unit";
const expectedAddress = "0x0380327b38ea655824484302ed06060db3214a7d";

console.log("========================================");
console.log("CHEESE Wallet Key Recovery Tool");
console.log("========================================\n");

deriveFromMnemonic(mnemonic).then(result => {
    console.log("Mnemonic:", mnemonic);
    console.log("");
    console.log("Derived Address:", result.address);
    console.log("Expected Address:", expectedAddress);
    console.log("");

    if (result.address.toLowerCase() === expectedAddress.toLowerCase()) {
        console.log("✅ ADDRESS MATCH! Using wallet's derivation.\n");
        console.log("Private Key:", result.privateKey);
        console.log("");
        console.log("You can use this private key to import into MetaMask or the wallet.");
    } else {
        console.log("❌ ADDRESS MISMATCH!");
        console.log("");
        console.log("The wallet's derivation produces a different address.");
        console.log("The BNB was sent to:", expectedAddress);
        console.log("But private key derives to:", result.address);
        console.log("");
        console.log("This means: The wallet's stored address was created differently.");
        console.log("");
        console.log("Derived Private Key:", result.privateKey);
        console.log("(This key controls the derived address, NOT the expected address)");
    }
}).catch(err => {
    console.error("Error:", err);
});
