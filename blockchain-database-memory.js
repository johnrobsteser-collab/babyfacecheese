/**
 * In-Memory Blockchain Database
 * Fallback when Firestore is not available
 * WARNING: Data is lost on server restart!
 */

class BlockchainDatabaseMemory {
    constructor() {
        this.blocks = [];
        this.transactions = new Map();
        this.pendingTransactions = [];
        this.smartContracts = [];
        this.minerBlockHistory = [];
        this.initialized = false;
    }

    async initialize() {
        console.log('⚠️ Using IN-MEMORY database - data will be LOST on restart!');
        this.initialized = true;
        return true;
    }

    async saveBlock(block) {
        const existing = this.blocks.findIndex(b => b.index === block.index);
        if (existing >= 0) {
            this.blocks[existing] = block;
        } else {
            this.blocks.push(block);
        }
        return block;
    }

    async getAllBlocks() {
        return this.blocks.sort((a, b) => a.index - b.index);
    }

    async getBlock(index) {
        return this.blocks.find(b => b.index === index);
    }

    async deleteBlock(index) {
        this.blocks = this.blocks.filter(b => b.index !== index);
        return true;
    }

    async saveTransaction(tx, blockIndex = null) {
        const key = tx.id || `tx-${Date.now()}-${Math.random()}`;
        this.transactions.set(key, { ...tx, blockIndex });
        return tx;
    }

    async getTransactionsByBlock(blockIndex) {
        const txs = [];
        this.transactions.forEach((tx, key) => {
            if (tx.blockIndex === blockIndex) {
                txs.push(tx);
            }
        });
        return txs;
    }

    async getTransactionHistory(address) {
        const txs = [];
        this.transactions.forEach((tx) => {
            if (tx.from === address || tx.to === address) {
                txs.push(tx);
            }
        });
        return txs;
    }

    async getPendingTransactions() {
        return this.pendingTransactions;
    }

    async clearPendingTransactions() {
        this.pendingTransactions = [];
        return true;
    }

    async saveSmartContract(contract) {
        this.smartContracts.push(contract);
        return contract;
    }

    async getAllSmartContracts() {
        return this.smartContracts;
    }

    async getMinerBlockHistory() {
        return this.minerBlockHistory;
    }

    async saveMinerBlockHistory(record) {
        this.minerBlockHistory.push(record);
        return record;
    }

    async close() {
        console.log('🔒 In-memory database closed');
    }
}

module.exports = BlockchainDatabaseMemory;
