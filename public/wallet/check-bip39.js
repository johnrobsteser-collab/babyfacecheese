const { ethers } = require('ethers');

const mnemonic = "cloth green give mad leisure sense episode leopard artist cave hint unit";
const expectedAddress = "0x0380327b38ea655824484302ed06060db3214a7d";

async function checkStandardDerivation() {
    console.log('Checking Standard BIP39 Derivation...');
    console.log('Mnemonic:', mnemonic);
    console.log('Expected:', expectedAddress);

    try {
        // Standard Ethereum Path (m/44'/60'/0'/0/0)
        const wallet = ethers.HDNodeWallet.fromPhrase(mnemonic, null, "m/44'/60'/0'/0/0");
        console.log('Standard ETH Address:', wallet.address);

        if (wallet.address.toLowerCase() === expectedAddress.toLowerCase()) {
            console.log('✅ FOUND MATCH on Standard ETH Path!');
            console.log('Private Key:', wallet.privateKey);
            return;
        }

        // Check first 10 indices
        console.log('Checking indices 0-9...');
        for (let i = 0; i < 10; i++) {
            const path = `m/44'/60'/0'/0/${i}`;
            const w = ethers.HDNodeWallet.fromPhrase(mnemonic, null, path);
            console.log(`Index ${i}: ${w.address}`);
            if (w.address.toLowerCase() === expectedAddress.toLowerCase()) {
                console.log(`✅ FOUND MATCH at index ${i}!`);
                console.log('Private Key:', w.privateKey);
                return;
            }
        }

        // Ledger Live Path (m/44'/60'/0'/0)
        const ledgerPath = `m/44'/60'/0'/0`;
        const ledgerWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, null, ledgerPath);
        console.log(`Ledger Path: ${ledgerWallet.address}`);
        if (ledgerWallet.address.toLowerCase() === expectedAddress.toLowerCase()) {
            console.log('✅ FOUND MATCH on Ledger Path!');
            return;
        }

    } catch (e) {
        console.error('Error:', e.message);
    }

    console.log('❌ No match found with standard derivation.');
}

checkStandardDerivation();
