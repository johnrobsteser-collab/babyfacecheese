const { ethers } = require('ethers');
const crypto = require('crypto');

// Configuration
const BSC_RPC = 'https://bsc-dataseed.binance.org/';
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // BSC-USD

// ABI
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

// Helper: Legacy Derivation (Double-SHA256 of Private Key)
function getLegacyAddress(privateKeyHex) {
    try {
        // Normalize
        const cleanKey = privateKeyHex.replace(/^0x/, '');
        const privBytes = Buffer.from(cleanKey, 'hex');

        // Hash 1: SHA256(PrivKey)
        const hash1 = crypto.createHash('sha256').update(privBytes).digest();

        // Hash 2: SHA256(Hash1)
        const hash2 = crypto.createHash('sha256').update(hash1).digest();

        // Address: First 20 bytes of Hash2
        const addressBytes = hash2.slice(0, 20);
        return '0x' + addressBytes.toString('hex');
    } catch (e) {
        return "Invalid Key";
    }
}

// Helper: Standard Derivation (secp256k1)
function getStandardAddress(privateKeyHex) {
    try {
        const wallet = new ethers.Wallet(privateKeyHex);
        return wallet.address;
    } catch (e) {
        return "Invalid Key";
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.log("Usage: node recovery_audit.js <PRIVATE_KEY>");
        console.log("   Checks for Stuck BSC Assets on Legacy Addresses.");
        process.exit(1);
    }

    const privateKey = args[0];
    // console.log(`\n🔍 AUDITING KEY...`); 

    // 1. Derive Addresses
    const legacyAddr = getLegacyAddress(privateKey);
    const stdAddr = getStandardAddress(privateKey);

    console.log(`\n📍 DERIVED ADDRESSES:`);
    console.log(`   Legacy (Double-SHA256): ${legacyAddr}`);
    console.log(`   Standard (secp256k1):  ${stdAddr}`);

    if (legacyAddr === "Invalid Key" || stdAddr === "Invalid Key") {
        console.error("❌ Invalid Private Key format.");
        process.exit(1);
    }

    // 2. Connect to BSC
    console.log(`\n🌐 Connecting to BSC Network (RPC: ${BSC_RPC})...`);
    const provider = new ethers.JsonRpcProvider(BSC_RPC);

    // 3. Check Balances
    try {
        // BNB
        console.log(`   Checking BNB balance...`);
        const legacyBnb = await provider.getBalance(legacyAddr);
        const bnbVal = ethers.formatEther(legacyBnb);
        console.log(`   BNB Balance:  ${bnbVal} BNB`);

        // USDT
        console.log(`   Checking USDT balance...`);
        const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);
        const legacyUsdt = await usdtContract.balanceOf(legacyAddr);
        const decimals = await usdtContract.decimals();
        const usdtVal = ethers.formatUnits(legacyUsdt, decimals);
        console.log(`   USDT Balance: ${usdtVal} USDT`);

        // 4. Recommendation
        console.log(`\n📋 SNAPSHOT REPORT:`);
        if (legacyBnb > 0n || legacyUsdt > 0n) {
            console.log(`   Sensitive Assets DETECTED on Legacy Address!`);
            console.log(`   ----------------------------------------------------------------`);
            console.log(`   LOCKED ASSETS:  ${bnbVal} BNB, ${usdtVal} USDT`);
            console.log(`   RECOVERY ACTION: Crediting User on CHEESE Chain.`);
            console.log(`   TARGET ADDRESS:  ${stdAddr}`);
            console.log(`   ----------------------------------------------------------------`);
            console.log(`   ✅ STATUS: VALID FOR REISSUE`);
        } else {
            console.log(`   ✅ NO ASSETS LOCKED. Address is empty on BSC.`);
        }

    } catch (err) {
        console.error("\n❌ Error fetching balances from BSC:", err.message);
        console.log("   (Please check your internet connection or RPC URL)");
    }
}

main();
