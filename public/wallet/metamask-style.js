/**
 * MetaMask-Style Wallet System
 * Enhanced wallet with MetaMask-like features
 */

class MetaMaskStyleWallet {
    constructor(app) {
        this.app = app;
        this.accounts = [];
        this.currentAccountIndex = 0;
        this.networks = [
            {
                id: 'cheese-native',
                name: 'CHEESE Native',
                rpcUrl: 'https://cheese-blockchain-131552958027.asia-southeast1.run.app',
                chainId: 1,
                currency: 'NCHEESE',
                explorer: 'https://cheese-blockchain-131552958027.asia-southeast1.run.app',
                icon: '🧀'
            },
            {
                id: 'bsc',
                name: 'Binance Smart Chain',
                rpcUrl: 'https://bsc-dataseed.binance.org/',
                chainId: 56,
                currency: 'BNB',
                explorer: 'https://bscscan.com',
                icon: '🟡'
            },
            {
                id: 'ethereum',
                name: 'Ethereum',
                rpcUrl: 'https://mainnet.infura.io/v3/',
                chainId: 1,
                currency: 'ETH',
                explorer: 'https://etherscan.io',
                icon: '💎'
            }
        ];
        this.currentNetwork = this.networks[0];
        this.tokens = new Map(); // address -> token info
        this.loadSavedData();
    }

    // Load saved accounts and settings
    loadSavedData() {
        try {
            const savedAccounts = localStorage.getItem('cheeseAccounts');
            if (savedAccounts) {
                this.accounts = JSON.parse(savedAccounts);
            }

            const savedNetwork = localStorage.getItem('cheeseCurrentNetwork');
            if (savedNetwork) {
                const network = this.networks.find(n => n.id === savedNetwork);
                if (network) this.currentNetwork = network;
            }

            const savedTokens = localStorage.getItem('cheeseTokens');
            if (savedTokens) {
                const tokens = JSON.parse(savedTokens);
                tokens.forEach(token => {
                    this.tokens.set(token.address, token);
                });
            }
        } catch (error) {
            console.error('Error loading saved data:', error);
        }
    }

    // Save accounts and settings
    saveData() {
        try {
            localStorage.setItem('cheeseAccounts', JSON.stringify(this.accounts));
            localStorage.setItem('cheeseCurrentNetwork', this.currentNetwork.id);
            localStorage.setItem('cheeseTokens', JSON.stringify(Array.from(this.tokens.values())));
        } catch (error) {
            console.error('Error saving data:', error);
        }
    }

    // Add account
    addAccount(wallet) {
        const account = {
            address: wallet.address,
            name: `Account ${this.accounts.length + 1}`,
            created: Date.now(),
            balance: 0,
            tokens: new Map()
        };
        this.accounts.push(account);
        this.saveData();
        return account;
    }

    // Get current account
    getCurrentAccount() {
        if (this.accounts.length === 0) return null;
        return this.accounts[this.currentAccountIndex];
    }

    // Switch account
    switchAccount(index) {
        if (index >= 0 && index < this.accounts.length) {
            this.currentAccountIndex = index;
            this.saveData();
            return true;
        }
        return false;
    }

    // Switch network
    switchNetwork(networkId) {
        const network = this.networks.find(n => n.id === networkId);
        if (network) {
            this.currentNetwork = network;
            this.saveData();
            return true;
        }
        return false;
    }

    // Add token
    addToken(tokenInfo) {
        const token = {
            address: tokenInfo.address,
            symbol: tokenInfo.symbol,
            name: tokenInfo.name,
            decimals: tokenInfo.decimals || 18,
            logoURI: tokenInfo.logoURI,
            balance: 0,
            network: this.currentNetwork.id
        };
        this.tokens.set(token.address, token);
        this.saveData();
        return token;
    }

    // Remove token
    removeToken(address) {
        this.tokens.delete(address);
        this.saveData();
    }

    // Search tokens (from popular list or custom)
    async searchToken(query) {
        const queryLower = query.toLowerCase();
        const results = [];

        // Search in added tokens
        this.tokens.forEach(token => {
            if (token.symbol.toLowerCase().includes(queryLower) ||
                token.name.toLowerCase().includes(queryLower) ||
                token.address.toLowerCase().includes(queryLower)) {
                results.push(token);
            }
        });

        // Search in popular tokens
        const popularTokens = this.getPopularTokens();
        popularTokens.forEach(token => {
            if (!this.tokens.has(token.address) &&
                (token.symbol.toLowerCase().includes(queryLower) ||
                 token.name.toLowerCase().includes(queryLower))) {
                results.push(token);
            }
        });

        return results;
    }

    // Get popular tokens
    getPopularTokens() {
        return [
            { address: '0x0000000000000000000000000000000000000000', symbol: 'NCHEESE', name: 'NCheese (Native CHEESE)', decimals: 18, logoURI: '', network: 'cheese-native' },
            { address: '0x55d398326f99059fF775485246999027B3197955', symbol: 'USDT', name: 'Tether USD', decimals: 18, logoURI: '', network: 'bsc' },
            { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', symbol: 'USDC', name: 'USD Coin', decimals: 18, logoURI: '', network: 'bsc' },
            { address: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8', symbol: 'ETH', name: 'Ethereum', decimals: 18, logoURI: '', network: 'bsc' },
            { address: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82', symbol: 'CAKE', name: 'PancakeSwap Token', decimals: 18, logoURI: '', network: 'bsc' },
            { address: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3', symbol: 'DAI', name: 'Dai Stablecoin', decimals: 18, logoURI: '', network: 'bsc' }
        ];
    }

    // Get all tokens for current account
    getAccountTokens() {
        const account = this.getCurrentAccount();
        if (!account) return [];
        
        return Array.from(this.tokens.values()).filter(token => 
            token.network === this.currentNetwork.id
        );
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetaMaskStyleWallet;
}

