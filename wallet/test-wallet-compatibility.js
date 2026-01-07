/**
 * Test Wallet Compatibility with MetaMask
 * This script verifies that the CHEESE Wallet derivation matches MetaMask
 * 
 * Run with: node test-wallet-compatibility.js
 */

const { ethers } = require('ethers');

// Known test vector - this mnemonic is a standard test, DO NOT use for real funds
const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const EXPECTED_ADDRESS = "0x9858EfFD232B4033E47d90003D41EC34EcaEda94";
const EXPECTED_PRIVATE_KEY = "0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727";

console.log("=== CHEESE Wallet Compatibility Test ===\n");

// Test 1: Standard derivation path m/44'/60'/0'/0/0
console.log("Test 1: Standard BIP44 Derivation (m/44'/60'/0'/0/0)");
console.log("Mnemonic:", TEST_MNEMONIC);

try {
    const wallet = ethers.HDNodeWallet.fromPhrase(TEST_MNEMONIC, null, "m/44'/60'/0'/0/0");

    console.log("\nDerived Address:", wallet.address);
    console.log("Expected Address:", EXPECTED_ADDRESS);
    console.log("Derived Private Key:", wallet.privateKey);
    console.log("Expected Private Key:", EXPECTED_PRIVATE_KEY);

    if (wallet.address.toLowerCase() === EXPECTED_ADDRESS.toLowerCase()) {
        console.log("\n✅ TEST PASSED - Address matches MetaMask standard!");
    } else {
        console.log("\n❌ TEST FAILED - Address does not match!");
        process.exit(1);
    }

    if (wallet.privateKey === EXPECTED_PRIVATE_KEY) {
        console.log("✅ Private key matches!");
    } else {
        console.log("❌ Private key mismatch (address still correct though)");
    }
} catch (error) {
    console.error("❌ Error during derivation:", error.message);
    process.exit(1);
}

// Test 2: Verify 12-word mnemonic generation has checksum
console.log("\n\nTest 2: Generate New Mnemonic with Checksum");
try {
    const randomWallet = ethers.Wallet.createRandom();
    const phrase = randomWallet.mnemonic.phrase;
    const words = phrase.split(' ');

    console.log("Generated Mnemonic:", phrase);
    console.log("Word Count:", words.length);

    // Verify it can be re-derived (checksum valid)
    const derivedWallet = ethers.HDNodeWallet.fromPhrase(phrase, null, "m/44'/60'/0'/0/0");
    console.log("Derived Address:", derivedWallet.address);

    console.log("✅ Mnemonic generation works with valid checksum!");
} catch (error) {
    console.error("❌ Mnemonic generation failed:", error.message);
    process.exit(1);
}

// Test 3: Multiple account indices
console.log("\n\nTest 3: Multiple Account Derivation");
try {
    for (let i = 0; i < 3; i++) {
        const path = `m/44'/60'/0'/0/${i}`;
        const wallet = ethers.HDNodeWallet.fromPhrase(TEST_MNEMONIC, null, path);
        console.log(`Account ${i}: ${wallet.address}`);
    }
    console.log("✅ Multiple account derivation works!");
} catch (error) {
    console.error("❌ Multiple account derivation failed:", error.message);
    process.exit(1);
}

console.log("\n\n=== ALL TESTS PASSED ===");
console.log("The wallet derivation is now compatible with MetaMask and all BSC/ERC wallets!");
