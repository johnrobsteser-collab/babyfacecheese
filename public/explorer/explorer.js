/**
 * 🧀 CHEESE Blockchain Explorer
 * API Integration & Page Logic
 */

class CheeseExplorer {
    constructor() {
        this.apiUrl = 'https://ideal-quietude-production-22a8.up.railway.app';
        this.apiKey = 'cheese-live-key-2025';
        this.blockchain = null;
        this.currentPage = 'home';
        this.init();
    }

    async init() {
        console.log('🧀 CHEESE Explorer initializing...');
        this.setupEventListeners();
        await this.loadBlockchainData();
        this.startAutoRefresh();
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-link, .view-all').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.dataset.page;
                if (page) this.navigateTo(page);
            });
        });

        document.getElementById('search-btn').addEventListener('click', () => this.handleSearch());
        document.getElementById('search-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });
    }

    navigateTo(pageName, data = null) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const navLink = document.querySelector(`.nav-link[data-page="${pageName}"]`);
        if (navLink) navLink.classList.add('active');

        const page = document.getElementById(`${pageName}-page`);
        if (page) {
            page.classList.add('active');
            this.currentPage = pageName;

            switch (pageName) {
                case 'home': this.loadHome(); break;
                case 'blocks': this.loadBlocks(); break;
                case 'transactions': this.loadTransactions(); break;
                case 'address': if (data) this.loadAddress(data); break;
                case 'block-detail': if (data !== null) this.loadBlockDetail(data); break;
            }
        }
    }

    async fetchAPI(endpoint) {
        try {
            const separator = endpoint.includes('?') ? '&' : '?';
            const url = `${this.apiUrl}${endpoint}${separator}apiKey=${this.apiKey}`;
            const response = await fetch(url);
            return await response.json();
        } catch (error) {
            console.error('API Error:', error);
            return null;
        }
    }

    async loadBlockchainData() {
        console.log('📊 Loading blockchain data...');
        const data = await this.fetchAPI('/api/blockchain');
        if (data && data.success) {
            this.blockchain = data;
            this.updateStats();
            this.loadHome();
        }
    }

    updateStats() {
        if (!this.blockchain) return;
        const totalTxns = this.blockchain.chain.reduce((sum, block) => sum + (block.transactions?.length || 0), 0);
        document.getElementById('total-blocks').textContent = this.blockchain.chainLength || '-';
        document.getElementById('total-transactions').textContent = totalTxns;
        document.getElementById('mining-reward').textContent = (this.blockchain.miningReward || 50) + ' NCH';
        document.getElementById('difficulty').textContent = this.blockchain.difficulty || '-';
    }

    loadHome() {
        this.loadLatestBlocks();
        this.loadLatestTransactions();
    }

    loadLatestBlocks() {
        if (!this.blockchain?.chain) return;
        const container = document.getElementById('latest-blocks');
        const blocks = [...this.blockchain.chain].reverse().slice(0, 10);

        if (blocks.length === 0) {
            container.innerHTML = '<div class="no-data">No blocks yet</div>';
            return;
        }

        container.innerHTML = blocks.map(block => `
            <div class="data-item" onclick="explorer.navigateTo('block-detail', ${block.index})">
                <div class="item-row">
                    <span class="item-value">📦 Block #${block.index}</span>
                    <span class="item-time">${this.formatTime(block.timestamp)}</span>
                </div>
                <div class="item-row">
                    <span class="item-label">Hash</span>
                    <span class="item-hash">${this.truncate(block.hash, 20)}</span>
                </div>
                <div class="item-row">
                    <span class="item-label">Txns</span>
                    <span class="item-value">${block.transactions?.length || 0}</span>
                </div>
            </div>
        `).join('');
    }

    loadLatestTransactions() {
        if (!this.blockchain?.chain) return;
        const container = document.getElementById('latest-transactions');

        const allTxns = [];
        for (const block of this.blockchain.chain) {
            if (block.transactions) {
                for (const tx of block.transactions) {
                    allTxns.push({ ...tx, blockIndex: block.index });
                }
            }
        }

        allTxns.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        const recentTxns = allTxns.slice(0, 10);

        if (recentTxns.length === 0) {
            container.innerHTML = '<div class="no-data">No transactions yet</div>';
            return;
        }

        container.innerHTML = recentTxns.map(tx => `
            <div class="data-item" onclick="explorer.showTxDetail('${tx.id || '-'}', ${tx.blockIndex})">
                <div class="item-row">
                    <span class="item-hash">${this.truncate(tx.id || tx.signature?.r || '-', 16)}</span>
                    <span class="item-amount">${tx.amount || 0} NCH</span>
                </div>
                <div class="item-row">
                    <span class="item-address">From: ${this.truncate(tx.from || 'Mining', 12)}</span>
                    <span class="item-address">To: ${this.truncate(tx.to || '-', 12)}</span>
                </div>
                <div class="item-row">
                    <span class="item-time">${this.formatTime(tx.timestamp)}</span>
                    <span class="item-label">Block #${tx.blockIndex}</span>
                </div>
            </div>
        `).join('');
    }

    loadBlocks() {
        if (!this.blockchain?.chain) return;
        const tbody = document.getElementById('blocks-table-body');
        const blocks = [...this.blockchain.chain].reverse();

        if (blocks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">No blocks yet</td></tr>';
            return;
        }

        tbody.innerHTML = blocks.map(block => {
            const miner = this.findMiner(block);
            return `
                <tr onclick="explorer.navigateTo('block-detail', ${block.index})">
                    <td><span class="hash">#${block.index}</span></td>
                    <td>${this.formatTime(block.timestamp)}</td>
                    <td>${block.transactions?.length || 0}</td>
                    <td><span class="address">${this.truncate(miner, 16)}</span></td>
                    <td><span class="hash">${this.truncate(block.hash, 16)}</span></td>
                </tr>
            `;
        }).join('');
    }

    loadTransactions() {
        if (!this.blockchain?.chain) return;
        const tbody = document.getElementById('transactions-table-body');

        const allTxns = [];
        for (const block of this.blockchain.chain) {
            if (block.transactions) {
                for (const tx of block.transactions) {
                    allTxns.push({ ...tx, blockIndex: block.index });
                }
            }
        }

        allTxns.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        if (allTxns.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No transactions yet</td></tr>';
            return;
        }

        tbody.innerHTML = allTxns.map(tx => `
            <tr onclick="explorer.showTxDetail('${tx.id || '-'}', ${tx.blockIndex})">
                <td><span class="hash">${this.truncate(tx.id || tx.signature?.r || '-', 12)}</span></td>
                <td>#${tx.blockIndex}</td>
                <td>${this.formatTime(tx.timestamp)}</td>
                <td><span class="address">${this.truncate(tx.from || 'Mining', 10)}</span></td>
                <td><span class="address">${this.truncate(tx.to || '-', 10)}</span></td>
                <td><span class="amount">${tx.amount || 0} NCH</span></td>
            </tr>
        `).join('');
    }

    async loadAddress(address) {
        document.getElementById('address-prompt').style.display = 'none';
        document.getElementById('address-info').style.display = 'block';
        document.getElementById('current-address').textContent = address;
        document.getElementById('address-display').textContent = address;

        const balanceData = await this.fetchAPI(`/api/balance/${address}`);
        document.getElementById('address-balance').textContent =
            balanceData?.success ? `${balanceData.balance || 0} NCH` : '0 NCH';

        const txContainer = document.getElementById('address-transactions');
        const addressTxns = [];

        if (this.blockchain?.chain) {
            for (const block of this.blockchain.chain) {
                if (block.transactions) {
                    for (const tx of block.transactions) {
                        if (tx.from === address || tx.to === address) {
                            addressTxns.push({ ...tx, blockIndex: block.index });
                        }
                    }
                }
            }
        }

        if (addressTxns.length === 0) {
            txContainer.innerHTML = '<div class="no-data">No transactions found</div>';
            return;
        }

        addressTxns.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        txContainer.innerHTML = addressTxns.map(tx => `
            <div class="data-item">
                <div class="item-row">
                    <span class="item-value">${tx.from === address ? '📤 OUT' : '📥 IN'}</span>
                    <span class="item-amount">${tx.from === address ? '-' : '+'}${tx.amount} NCH</span>
                </div>
                <div class="item-row">
                    <span class="item-label">${tx.from === address ? 'To' : 'From'}</span>
                    <span class="item-address">${tx.from === address ? (tx.to || '-') : (tx.from || 'Mining')}</span>
                </div>
                <div class="item-row">
                    <span class="item-time">${this.formatTime(tx.timestamp)}</span>
                    <span class="item-label">Block #${tx.blockIndex}</span>
                </div>
            </div>
        `).join('');
    }

    loadBlockDetail(blockIndex) {
        if (!this.blockchain?.chain) return;
        const block = this.blockchain.chain.find(b => b.index === blockIndex);
        if (!block) return;

        document.getElementById('block-number').textContent = `Block #${block.index}`;
        document.getElementById('detail-block-height').textContent = block.index;
        document.getElementById('detail-block-time').textContent = new Date(block.timestamp).toLocaleString();
        document.getElementById('detail-block-txns').textContent = block.transactions?.length || 0;
        document.getElementById('detail-block-hash').textContent = block.hash || '-';
        document.getElementById('detail-prev-hash').textContent = block.previousHash || '-';
        document.getElementById('detail-nonce').textContent = block.nonce || 0;
        document.getElementById('detail-difficulty').textContent = block.difficulty || '-';

        const txList = document.getElementById('block-transactions-list');
        if (!block.transactions?.length) {
            txList.innerHTML = '<div class="no-data">No transactions</div>';
            return;
        }

        txList.innerHTML = block.transactions.map(tx => `
            <div class="data-item">
                <div class="item-row">
                    <span class="item-hash">${this.truncate(tx.id || tx.signature?.r || '-', 20)}</span>
                    <span class="item-amount">${tx.amount || 0} NCH</span>
                </div>
                <div class="item-row">
                    <span class="item-address">From: ${tx.from || 'Mining Reward'}</span>
                    <span class="item-address">To: ${this.truncate(tx.to || '-', 16)}</span>
                </div>
            </div>
        `).join('');

        this.navigateTo('block-detail');
    }

    showTxDetail(txId, blockIndex) {
        if (!this.blockchain?.chain) return;
        const block = this.blockchain.chain.find(b => b.index === blockIndex);
        if (!block?.transactions) return;

        const tx = block.transactions.find(t => t.id === txId || t.signature?.r === txId);
        if (!tx) return;

        document.getElementById('detail-tx-hash').textContent = tx.id || tx.signature?.r || '-';
        document.getElementById('detail-tx-block').textContent = `#${blockIndex}`;
        document.getElementById('detail-tx-time').textContent = new Date(tx.timestamp).toLocaleString();
        document.getElementById('detail-tx-from').textContent = tx.from || 'Mining Reward';
        document.getElementById('detail-tx-to').textContent = tx.to || '-';
        document.getElementById('detail-tx-amount').textContent = `${tx.amount || 0} NCH`;
        document.getElementById('detail-tx-type').textContent = tx.data?.type === 'mining_reward' ? '⛏️ Mining Reward' : '💳 Transfer';

        this.navigateTo('tx-detail');
    }

    handleSearch() {
        const input = document.getElementById('search-input').value.trim();
        if (!input) return;

        if (/^\d+$/.test(input)) {
            const blockIndex = parseInt(input);
            if (this.blockchain?.chain?.find(b => b.index === blockIndex)) {
                this.loadBlockDetail(blockIndex);
                return;
            }
        }

        if (input.startsWith('0x') && input.length >= 40) {
            this.navigateTo('address', input.toLowerCase());
            return;
        }

        if (this.blockchain?.chain) {
            const block = this.blockchain.chain.find(b => b.hash === input);
            if (block) { this.loadBlockDetail(block.index); return; }

            for (const block of this.blockchain.chain) {
                if (block.transactions) {
                    const tx = block.transactions.find(t => t.id === input || t.signature?.r === input);
                    if (tx) { this.showTxDetail(tx.id || tx.signature?.r, block.index); return; }
                }
            }
        }

        alert('No results found for: ' + input);
    }

    findMiner(block) {
        if (!block.transactions) return 'Unknown';
        const rewardTx = block.transactions.find(tx => tx.data?.type === 'mining_reward' || !tx.from);
        return rewardTx?.to || 'Genesis';
    }

    truncate(str, length) {
        if (!str) return '-';
        if (str.length <= length) return str;
        const half = Math.floor(length / 2) - 2;
        return str.slice(0, half) + '...' + str.slice(-half);
    }

    formatTime(timestamp) {
        if (!timestamp) return '-';
        const diff = Date.now() - timestamp;
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' mins ago';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' hours ago';
        if (diff < 604800000) return Math.floor(diff / 86400000) + ' days ago';
        return new Date(timestamp).toLocaleDateString();
    }

    startAutoRefresh() {
        setInterval(() => {
            console.log('🔄 Auto-refreshing...');
            this.loadBlockchainData();
        }, 30000);
    }
}

function copyAddress() {
    const address = document.getElementById('address-display').textContent;
    navigator.clipboard.writeText(address).then(() => alert('Address copied!'));
}

const explorer = new CheeseExplorer();
