/**
 * 🧀 CHEESE BLOCKCHAIN - SQLITE DATABASE LAYER
 * Local persistent storage using sql.js (pure JavaScript SQLite)
 * FALLBACK when Firestore is unavailable - DATA PERSISTS LOCALLY!
 * 
 * This implements the SAME interface as BlockchainDatabaseFirestore
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class BlockchainDatabaseSQLite {
    constructor(dbPath = './cheese-blockchain.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.SQL = null;
        this.initialized = false;
        this.saveInterval = null;
        console.log(`💾 SQLite Database initialized with path: ${this.dbPath}`);
    }

    async initialize() {
        try {
            // Initialize sql.js
            this.SQL = await initSqlJs();

            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (dir && dir !== '.' && !fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Load existing database or create new one
            if (fs.existsSync(this.dbPath)) {
                console.log('📂 Loading existing SQLite database...');
                const buffer = fs.readFileSync(this.dbPath);
                this.db = new this.SQL.Database(buffer);
            } else {
                console.log('📝 Creating new SQLite database...');
                this.db = new this.SQL.Database();
            }

            // Create tables if they don't exist
            this.createTables();

            // Auto-save every 30 seconds
            this.saveInterval = setInterval(() => this.saveToDisk(), 30000);

            this.initialized = true;
            console.log('✅ SQLite database connected and tables created');

            // Log existing data count
            const blockCount = this.db.exec('SELECT COUNT(*) as count FROM blocks')[0]?.values[0][0] || 0;
            const txCount = this.db.exec('SELECT COUNT(*) as count FROM transactions')[0]?.values[0][0] || 0;
            console.log(`📊 SQLite contains: ${blockCount} blocks, ${txCount} transactions`);

            return true;
        } catch (error) {
            console.error('❌ SQLite initialization failed:', error.message);
            throw error;
        }
    }

    saveToDisk() {
        if (!this.db) return;
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(this.dbPath, buffer);
        } catch (error) {
            console.error('❌ SQLite save to disk failed:', error.message);
        }
    }

    createTables() {
        // Blocks table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS blocks (
                idx INTEGER PRIMARY KEY,
                hash TEXT NOT NULL,
                previousHash TEXT,
                timestamp INTEGER,
                nonce INTEGER,
                difficulty INTEGER,
                data TEXT,
                createdAt INTEGER
            )
        `);

        // Transactions table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS transactions (
                id TEXT PRIMARY KEY,
                fromAddress TEXT,
                toAddress TEXT,
                amount REAL,
                timestamp INTEGER,
                blockIndex INTEGER,
                signature TEXT,
                data TEXT,
                pending INTEGER DEFAULT 0,
                createdAt INTEGER
            )
        `);

        // Smart contracts table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS smart_contracts (
                address TEXT PRIMARY KEY,
                code TEXT,
                state TEXT,
                creator TEXT,
                createdAt INTEGER
            )
        `);

        // Wallets table (for caching)
        this.db.run(`
            CREATE TABLE IF NOT EXISTS wallets (
                address TEXT PRIMARY KEY,
                data TEXT,
                updatedAt INTEGER
            )
        `);

        // Miner block history table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS miner_block_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                minerAddress TEXT NOT NULL,
                blockIndex INTEGER NOT NULL,
                timestamp INTEGER,
                UNIQUE(minerAddress, blockIndex)
            )
        `);

        this.saveToDisk();
        console.log('✅ SQLite tables created/verified');
    }

    // ==================== BLOCK OPERATIONS ====================

    async saveBlock(block) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO blocks (idx, hash, previousHash, timestamp, nonce, difficulty, data, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run([
            block.index,
            block.hash,
            block.previousHash || '0',
            block.timestamp,
            block.nonce || 0,
            block.difficulty || 2,
            JSON.stringify({
                transactions: block.transactions || [],
                aiValidation: block.aiValidation,
                ...block.data
            }),
            Date.now()
        ]);
        stmt.free();

        // Save transactions from block
        if (block.transactions && block.transactions.length > 0) {
            for (const tx of block.transactions) {
                await this.saveTransaction(tx, block.index);
            }
        }

        this.saveToDisk();
        console.log(`💾 Block ${block.index} saved to SQLite`);
        return block;
    }

    async deleteBlock(blockIndex) {
        this.db.run('DELETE FROM blocks WHERE idx = ?', [blockIndex]);
        this.db.run('DELETE FROM transactions WHERE blockIndex = ?', [blockIndex]);
        this.saveToDisk();
        console.log(`🗑️ Block ${blockIndex} deleted from SQLite`);
        return true;
    }

    async getBlock(index) {
        const result = this.db.exec('SELECT * FROM blocks WHERE idx = ?', [index]);
        if (!result.length || !result[0].values.length) return null;

        const row = this.rowToObject(result[0]);
        const block = this.rowToBlock(row);
        block.transactions = await this.getTransactionsByBlock(index);
        return block;
    }

    async getAllBlocks() {
        const result = this.db.exec('SELECT * FROM blocks ORDER BY idx ASC');
        if (!result.length) return [];

        const blocks = [];
        for (const row of result[0].values) {
            const obj = this.rowToObjectFromArray(result[0].columns, row);
            const block = this.rowToBlock(obj);
            block.transactions = await this.getTransactionsByBlock(block.index);
            blocks.push(block);
        }

        return blocks;
    }

    async getLatestBlock() {
        const result = this.db.exec('SELECT * FROM blocks ORDER BY idx DESC LIMIT 1');
        if (!result.length || !result[0].values.length) return null;

        const row = this.rowToObjectFromArray(result[0].columns, result[0].values[0]);
        const block = this.rowToBlock(row);
        block.transactions = await this.getTransactionsByBlock(block.index);
        return block;
    }

    rowToObject(result) {
        if (!result.values.length) return null;
        return this.rowToObjectFromArray(result.columns, result.values[0]);
    }

    rowToObjectFromArray(columns, values) {
        const obj = {};
        columns.forEach((col, i) => obj[col] = values[i]);
        return obj;
    }

    rowToBlock(row) {
        const data = row.data ? JSON.parse(row.data) : {};
        return {
            index: row.idx,
            hash: row.hash,
            previousHash: row.previousHash,
            timestamp: row.timestamp,
            nonce: row.nonce,
            difficulty: row.difficulty,
            transactions: data.transactions || [],
            aiValidation: data.aiValidation,
            ...data
        };
    }

    // ==================== TRANSACTION OPERATIONS ====================

    async saveTransaction(transaction, blockIndex = null) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO transactions 
            (id, fromAddress, toAddress, amount, timestamp, blockIndex, signature, data, pending, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const txId = transaction.id || `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const isPending = blockIndex === null ? 1 : 0;

        stmt.run([
            txId,
            transaction.from || null,
            transaction.to,
            transaction.amount,
            transaction.timestamp || Date.now(),
            blockIndex,
            JSON.stringify(transaction.signature || {}),
            JSON.stringify(transaction.data || {}),
            isPending,
            Date.now()
        ]);
        stmt.free();

        return { ...transaction, id: txId };
    }

    async getPendingTransactions() {
        const result = this.db.exec('SELECT * FROM transactions WHERE pending = 1');
        if (!result.length) return [];
        return result[0].values.map(row =>
            this.rowToTransaction(this.rowToObjectFromArray(result[0].columns, row))
        );
    }

    async clearPendingTransactions() {
        this.db.run('DELETE FROM transactions WHERE pending = 1');
        this.saveToDisk();
        return true;
    }

    async getTransactionsByBlock(blockIndex) {
        const result = this.db.exec('SELECT * FROM transactions WHERE blockIndex = ?', [blockIndex]);
        if (!result.length) return [];
        return result[0].values.map(row =>
            this.rowToTransaction(this.rowToObjectFromArray(result[0].columns, row))
        );
    }

    async getTransactionHistory(address) {
        const result = this.db.exec(
            'SELECT * FROM transactions WHERE fromAddress = ? OR toAddress = ? ORDER BY timestamp DESC',
            [address, address]
        );
        if (!result.length) return [];
        return result[0].values.map(row =>
            this.rowToTransaction(this.rowToObjectFromArray(result[0].columns, row))
        );
    }

    rowToTransaction(row) {
        return {
            id: row.id,
            from: row.fromAddress,
            to: row.toAddress,
            amount: row.amount,
            timestamp: row.timestamp,
            blockIndex: row.blockIndex,
            signature: row.signature ? JSON.parse(row.signature) : null,
            data: row.data ? JSON.parse(row.data) : {},
            pending: row.pending === 1
        };
    }

    // ==================== WALLET OPERATIONS ====================

    async saveWallet(wallet) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO wallets (address, data, updatedAt)
            VALUES (?, ?, ?)
        `);
        stmt.run([wallet.address, JSON.stringify(wallet), Date.now()]);
        stmt.free();
        this.saveToDisk();
        return wallet;
    }

    async getWallet(address) {
        const result = this.db.exec('SELECT * FROM wallets WHERE address = ?', [address]);
        if (!result.length || !result[0].values.length) return null;
        const row = this.rowToObjectFromArray(result[0].columns, result[0].values[0]);
        return JSON.parse(row.data);
    }

    // ==================== SMART CONTRACT OPERATIONS ====================

    async saveSmartContract(contract) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO smart_contracts (address, code, state, creator, createdAt)
            VALUES (?, ?, ?, ?, ?)
        `);
        stmt.run([
            contract.address,
            contract.code,
            JSON.stringify(contract.state || {}),
            contract.creator,
            Date.now()
        ]);
        stmt.free();
        this.saveToDisk();
        return contract;
    }

    async getSmartContract(address) {
        const result = this.db.exec('SELECT * FROM smart_contracts WHERE address = ?', [address]);
        if (!result.length || !result[0].values.length) return null;
        const row = this.rowToObjectFromArray(result[0].columns, result[0].values[0]);
        return {
            address: row.address,
            code: row.code,
            state: row.state ? JSON.parse(row.state) : {},
            creator: row.creator
        };
    }

    async getAllSmartContracts() {
        const result = this.db.exec('SELECT * FROM smart_contracts');
        if (!result.length) return [];
        return result[0].values.map(row => {
            const obj = this.rowToObjectFromArray(result[0].columns, row);
            return {
                address: obj.address,
                code: obj.code,
                state: obj.state ? JSON.parse(obj.state) : {},
                creator: obj.creator
            };
        });
    }

    // ==================== MINER HISTORY OPERATIONS ====================

    async getMinerBlockHistory() {
        const result = this.db.exec('SELECT * FROM miner_block_history');
        if (!result.length) return [];
        return result[0].values.map(row => {
            const obj = this.rowToObjectFromArray(result[0].columns, row);
            return {
                minerAddress: obj.minerAddress,
                blockIndex: obj.blockIndex,
                timestamp: obj.timestamp
            };
        });
    }

    async saveMinerBlockHistory(record) {
        const stmt = this.db.prepare(`
            INSERT OR IGNORE INTO miner_block_history (minerAddress, blockIndex, timestamp)
            VALUES (?, ?, ?)
        `);
        stmt.run([record.minerAddress, record.blockIndex, Date.now()]);
        stmt.free();
        return record;
    }

    // ==================== NODE OPERATIONS ====================

    async saveNode(node) {
        return node;
    }

    async getAllNodes() {
        return [];
    }

    // ==================== ANALYTICS OPERATIONS ====================

    async saveAnalytics(type, data) {
        return { type, data };
    }

    // ==================== UTILITY OPERATIONS ====================

    async backup() {
        this.saveToDisk();
        console.log('💾 SQLite backup completed');
        return true;
    }

    async close() {
        if (this.saveInterval) {
            clearInterval(this.saveInterval);
        }
        if (this.db) {
            this.saveToDisk();
            this.db.close();
            console.log('🔒 SQLite database closed and saved');
        }
    }
}

module.exports = BlockchainDatabaseSQLite;
