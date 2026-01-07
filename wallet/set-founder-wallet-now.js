/**
 * Quick script to set founder wallet address
 * Run this in browser console after opening index.html
 */

// Your founder wallet address
const FOUNDER_ADDRESS = '0xa25f52f081c3397bbc8d2ed12146757c470e049d';

// Validate address format
function validateAddress(address) {
    if (!address) return false;
    if (!address.startsWith('0x')) return false;
    if (address.length !== 42) return false;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;
    return true;
}

// Set founder wallet
if (validateAddress(FOUNDER_ADDRESS)) {
    // Save to localStorage
    localStorage.setItem('cheeseFounderAddress', FOUNDER_ADDRESS);
    
    // If app is loaded, update it
    if (typeof window !== 'undefined' && window.app && window.app.founderIncome) {
        window.app.founderIncome.setFounderAddress(FOUNDER_ADDRESS);
        console.log('✅ Founder wallet set successfully!');
        console.log('Address:', FOUNDER_ADDRESS);
        console.log('💰 You will now receive:');
        console.log('  • 0.1% of every transaction (min 0.01, max 10 CHEESE)');
        console.log('  • 0.5% of every swap');
        console.log('  • 1% of every bridge transaction');
    } else {
        console.log('✅ Founder wallet address saved to localStorage');
        console.log('Address:', FOUNDER_ADDRESS);
        console.log('💰 The address will be used when the app loads');
    }
} else {
    console.error('❌ Invalid address format:', FOUNDER_ADDRESS);
    console.log('Address must be: 0x followed by 40 hexadecimal characters');
}

