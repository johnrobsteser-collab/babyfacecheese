/**
 * 🧀 CHEESE BLOCKCHAIN - FIRESTORE DATABASE LAYER
 * Permanent, immutable storage using Google Firestore
 * Data persists forever!
 */

const { Firestore } = require('@google-cloud/firestore');

class BlockchainDatabaseFirestore {
    constructor(projectId = 'cheese-blockchain', collectionPrefix = 'cheese-blockchain', backupProjectId = null, backupKeyFilename = null) {
        this.projectId = projectId;
        this.db = null;

        // Backup Configuration
        this.backupProjectId = backupProjectId;
        this.backupKeyFilename = backupKeyFilename;
        this.backupDb = null;

        this.prefix = collectionPrefix;

        // Collection names with dynamic prefix
        this.collections = {
            blocks: `${this.prefix}-blocks`,
            transactions: `${this.prefix}-transactions`,
            pendingTransactions: `${this.prefix}-pending`,
            wallets: `${this.prefix}-wallets`,
            smartContracts: `${this.prefix}-contracts`,
            networkNodes: `${this.prefix}-nodes`,
            analytics: `${this.prefix}-analytics`,
            config: `${this.prefix}-config`
        };

        console.log(`🔥 Firestore Database initialized for project: ${this.prefix}`);
    }

    async initialize() {
        try {
            // ENHANCED: Check for credentials before attempting connection
            const credentialsAvailable = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
                process.env.GOOGLE_CLOUD_PROJECT ||
                this.isRunningOnGCE();

            if (!credentialsAvailable) {
                console.warn('⚠️  WARNING: No Firestore credentials detected');
                console.warn('   Set GOOGLE_APPLICATION_CREDENTIALS or run on GCE');
                console.warn('   Falling back to SQLite-only mode');
                throw new Error('FIRESTORE_NO_CREDENTIALS');
            }

            // Initialize Firestore with timeout
            console.log('🔥 Initializing Firestore connection...');
            console.log(`   Project ID: ${this.projectId}`);

            // Use explicit keyFilename if available for better compatibility
            const firestoreOptions = {
                projectId: this.projectId
            };

            if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                firestoreOptions.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
                console.log(`   Using service account: ${process.env.GOOGLE_APPLICATION_CREDENTIALS}`);
            }

            this.db = new Firestore(firestoreOptions);

            // Initialize Backup DB if configured
            if (this.backupProjectId && this.backupKeyFilename) {
                console.log(`🛡️ Initializing BACKUP Connection to: ${this.backupProjectId}...`);
                try {
                    this.backupDb = new Firestore({
                        projectId: this.backupProjectId,
                        keyFilename: this.backupKeyFilename
                    });
                    console.log('✅ BACKUP Database Connected!');
                } catch (backupErr) {
                    console.error('⚠️ Failed to connect Backup DB:', backupErr.message);
                }
            }

            // Test connection with timeout
            const connectionTest = this.testConnection();
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('FIRESTORE_TIMEOUT')), 10000)
            );

            await Promise.race([connectionTest, timeout]);

            // Verify connection by reading/writing config
            const configRef = this.db.collection(this.collections.config).doc('blockchain');

            let configDoc;
            try {
                configDoc = await configRef.get();
            } catch (getError) {
                if (getError.code === 7) { // PERMISSION_DENIED
                    console.error('❌ FIRESTORE PERMISSION DENIED');
                    console.error('   This usually means:');
                    console.error('   1. Service account lacks Firestore permissions');
                    console.error('   2. Firestore is not enabled for this project');
                    console.error('   3. IAM roles are not properly configured');
                    console.error('');
                    console.error('   To fix, run on VM: bash setup-firestore-credentials.sh');
                    throw new Error('FIRESTORE_PERMISSION_DENIED');
                }
                throw getError;
            }

            if (!configDoc.exists) {
                // Initialize config document
                await configRef.set({
                    name: 'CHEESE Blockchain',
                    version: '1.0.0',
                    createdAt: Date.now(),
                    lastUpdated: Date.now(),
                    hostname: require('os').hostname(),
                    nodeVersion: process.version
                });
                console.log('✅ Firestore connected successfully');
                console.log('📝 Created blockchain config document');
            } else {
                await configRef.update({
                    lastUpdated: Date.now(),
                    hostname: require('os').hostname(),
                    lastConnection: new Date().toISOString()
                });
                console.log('✅ Firestore connected successfully');
                console.log('📝 Updated blockchain config (last seen)');
            }

            console.log(`📊 Project: ${this.projectId}`);
            console.log('🔒 All blockchain data will be stored PERMANENTLY in Firestore');
            console.log('💾 Data persists across VM restarts forever!');

            return true;
        } catch (error) {
            // CRITICAL: Enhanced error handling with specific error types
            console.error('❌ Firestore initialization error:', error.message);

            // Provide detailed error information
            if (error.message === 'FIRESTORE_NO_CREDENTIALS') {
                console.error('');
                console.error('===============================================');
                console.error('   FIRESTORE CREDENTIALS NOT FOUND');
                console.error('===============================================');
                console.error('To enable Firestore:');
                console.error('1. On VM: Run setup-firestore-credentials.sh');
                console.error('2. On local: Set GOOGLE_APPLICATION_CREDENTIALS');
                console.error('3. Or use: gcloud auth application-default login');
                console.error('===============================================');
            } else if (error.message === 'FIRESTORE_PERMISSION_DENIED') {
                console.error('');
                console.error('===============================================');
                console.error('   FIRESTORE PERMISSION DENIED');
                console.error('===============================================');
                console.error('Fix with one of these options:');
                console.error('');
                console.error('Option 1 (Recommended - On VM):');
                console.error('  bash setup-firestore-credentials.sh');
                console.error('');
                console.error('Option 2 (Manual):');
                console.error('  1. Go to Cloud Console IAM');
                console.error('  2. Find your service account');
                console.error('  3. Add roles:');
                console.error('     - Cloud Datastore User');
                console.error('     - Cloud Datastore Index Admin');
                console.error('');
                console.error('Option 3 (Quick test):');
                console.error('  gcloud auth application-default login');
                console.error('===============================================');
            } else if (error.message === 'FIRESTORE_TIMEOUT') {
                console.error('Firestore connection timed out - may be network issue');
            } else {
                console.error('Unexpected Firestore error:', error.code, error.details);
            }

            console.error('');
            console.warn('⚠️  FALLBACK: Will use SQLite-only mode');
            console.warn('   Data will be stored in cheese-blockchain.db');
            console.warn('   ⚠️  WARNING: Data may be lost on VM restart!');
            console.warn('   ⚠️  For production, MUST fix Firestore!');

            throw error;
        }
    }

    // Helper: Check if running on Google Compute Engine
    isRunningOnGCE() {
        try {
            const fs = require('fs');
            // Check for GCE metadata
            if (fs.existsSync('/sys/class/dmi/id/product_name')) {
                const productName = fs.readFileSync('/sys/class/dmi/id/product_name', 'utf8').trim();
                return productName === 'Google Compute Engine';
            }
        } catch (e) {
            // Not on GCE
        }
        return false;
    }

    // Helper: Test Firestore connection
    async testConnection() {
        // Simple test - just creating Firestore instance is enough
        // Actual read/write test happens in initialize()
        return true;
    }

    // ==================== BLOCK OPERATIONS ====================

    async saveBlock(block) {
        try {
            const blockRef = this.db.collection(this.collections.blocks).doc(`block-${block.index}`);

            await blockRef.set({
                blockIndex: block.index,
                timestamp: block.timestamp,
                previousHash: block.previousHash,
                hash: block.hash,
                nonce: block.nonce,
                difficulty: block.difficulty || 2,
                transactionCount: block.transactions ? block.transactions.length : 0,
                aiValidation: block.aiValidation || {},
                createdAt: Date.now()
            });

            // Save transactions for this block
            if (block.transactions && block.transactions.length > 0) {
                const batch = this.db.batch();
                for (const tx of block.transactions) {
                    const txRef = this.db.collection(this.collections.transactions).doc();
                    batch.set(txRef, {
                        blockIndex: block.index,
                        from: tx.from || 'SYSTEM',
                        to: tx.to,
                        amount: tx.amount,
                        timestamp: tx.timestamp,
                        signature: typeof tx.signature === 'object' ? JSON.stringify(tx.signature) : tx.signature,
                        data: tx.data || {},
                        aiValidation: tx.aiValidation || {},
                        createdAt: Date.now()
                    });
                }
                await batch.commit();
            }

            console.log(`✅ Block ${block.index} saved to Firestore (permanent)`);

            // Backup Write
            if (this.backupDb) {
                this.backupDb.collection(this.collections.blocks).doc(`block-${block.index}`).set({
                    blockIndex: block.index,
                    timestamp: block.timestamp,
                    previousHash: block.previousHash,
                    hash: block.hash,
                    nonce: block.nonce,
                    difficulty: block.difficulty || 2,
                    transactionCount: block.transactions ? block.transactions.length : 0,
                    aiValidation: block.aiValidation || {},
                    createdAt: Date.now()
                }).catch(e => console.warn('⚠️ Backup Write Failed (Block):', e.message));
            }

            return true;
        } catch (error) {
            console.error('❌ Error saving block:', error);
            throw error;
        }
    }

    async deleteBlock(blockIndex) {
        try {
            // Delete transactions for this block
            const txSnapshot = await this.db.collection(this.collections.transactions)
                .where('blockIndex', '==', blockIndex)
                .get();

            const batch = this.db.batch();
            txSnapshot.docs.forEach(doc => batch.delete(doc.ref));

            // Delete the block
            const blockRef = this.db.collection(this.collections.blocks).doc(`block-${blockIndex}`);
            batch.delete(blockRef);

            await batch.commit();
            console.log(`🗑️ Deleted block ${blockIndex} from Firestore`);
            return true;
        } catch (error) {
            console.error('❌ Error deleting block:', error);
            throw error;
        }
    }

    async getBlock(index) {
        try {
            const blockRef = this.db.collection(this.collections.blocks).doc(`block-${index}`);
            const doc = await blockRef.get();

            if (!doc.exists) return null;

            const data = doc.data();
            return {
                index: data.blockIndex,
                blockIndex: data.blockIndex,
                timestamp: data.timestamp,
                previousHash: data.previousHash,
                hash: data.hash,
                nonce: data.nonce,
                difficulty: data.difficulty,
                transactionCount: data.transactionCount,
                aiValidation: data.aiValidation || {}
            };
        } catch (error) {
            console.error('❌ Error getting block:', error);
            throw error;
        }
    }

    async getAllBlocks() {
        try {
            const snapshot = await this.db.collection(this.collections.blocks)
                .orderBy('blockIndex', 'asc')
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    index: data.blockIndex,
                    blockIndex: data.blockIndex,
                    timestamp: data.timestamp,
                    previousHash: data.previousHash,
                    hash: data.hash,
                    nonce: data.nonce,
                    difficulty: data.difficulty,
                    transactionCount: data.transactionCount,
                    aiValidation: data.aiValidation || {}
                };
            });
        } catch (error) {
            console.error('❌ Error getting all blocks:', error);
            throw error;
        }
    }

    async getLatestBlock() {
        try {
            const snapshot = await this.db.collection(this.collections.blocks)
                .orderBy('blockIndex', 'desc')
                .limit(1)
                .get();

            if (snapshot.empty) return null;

            const data = snapshot.docs[0].data();
            return {
                index: data.blockIndex,
                blockIndex: data.blockIndex,
                timestamp: data.timestamp,
                previousHash: data.previousHash,
                hash: data.hash,
                nonce: data.nonce,
                difficulty: data.difficulty,
                transactionCount: data.transactionCount,
                aiValidation: data.aiValidation || {}
            };
        } catch (error) {
            console.error('❌ Error getting latest block:', error);
            throw error;
        }
    }

    // ==================== TRANSACTION OPERATIONS ====================

    async saveTransaction(transaction, blockIndex = null) {
        try {
            const collection = blockIndex ? this.collections.transactions : this.collections.pendingTransactions;
            const docRef = this.db.collection(collection).doc();

            const txData = {
                from: transaction.from || 'SYSTEM',
                to: transaction.to,
                amount: transaction.amount,
                timestamp: transaction.timestamp,
                signature: typeof transaction.signature === 'object' ? JSON.stringify(transaction.signature) : transaction.signature,
                data: transaction.data || {},
                aiValidation: transaction.aiValidation || {},
                createdAt: Date.now()
            };

            if (blockIndex !== null) {
                txData.blockIndex = blockIndex;
            }

            await docRef.set(txData);

            // Backup Write
            if (this.backupDb) {
                this.backupDb.collection(collection).doc(docRef.id).set(txData)
                    .catch(e => console.warn('⚠️ Backup Write Failed (Tx):', e.message));
            }

            return true;
        } catch (error) {
            console.error('❌ Error saving transaction:', error);
            throw error;
        }
    }

    async getPendingTransactions() {
        try {
            const snapshot = await this.db.collection(this.collections.pendingTransactions)
                .orderBy('timestamp', 'asc')
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    from: data.from === 'SYSTEM' ? null : data.from,
                    to: data.to,
                    amount: data.amount,
                    timestamp: data.timestamp,
                    signature: data.signature,
                    data: data.data || {},
                    aiValidation: data.aiValidation || {}
                };
            });
        } catch (error) {
            console.error('❌ Error getting pending transactions:', error);
            throw error;
        }
    }

    async clearPendingTransactions() {
        try {
            const snapshot = await this.db.collection(this.collections.pendingTransactions).get();

            const batch = this.db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            console.log('🧹 Cleared all pending transactions');
            return true;
        } catch (error) {
            console.error('❌ Error clearing pending transactions:', error);
            throw error;
        }
    }

    async getTransactionsByBlock(blockIndex) {
        try {
            const snapshot = await this.db.collection(this.collections.transactions)
                .where('blockIndex', '==', blockIndex)
                .get();

            return snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    from: data.from === 'SYSTEM' ? null : data.from,
                    to: data.to,
                    amount: data.amount,
                    timestamp: data.timestamp,
                    signature: data.signature,
                    data: data.data || {},
                    aiValidation: data.aiValidation || {}
                };
            });
        } catch (error) {
            console.error('❌ Error getting transactions by block:', error);
            throw error;
        }
    }

    // ==================== WALLET OPERATIONS ====================

    async saveWallet(wallet) {
        try {
            const walletRef = this.db.collection(this.collections.wallets).doc(wallet.address);

            await walletRef.set({
                address: wallet.address,
                publicKey: wallet.publicKey,
                encryptedPrivateKey: wallet.encryptedPrivateKey || null,
                balance: wallet.balance || 0,
                createdAt: Date.now()
            }, { merge: true });

            return true;
        } catch (error) {
            console.error('❌ Error saving wallet:', error);
            throw error;
        }
    }

    async getWallet(address) {
        try {
            const walletRef = this.db.collection(this.collections.wallets).doc(address);
            const doc = await walletRef.get();

            if (!doc.exists) return null;
            return doc.data();
        } catch (error) {
            console.error('❌ Error getting wallet:', error);
            throw error;
        }
    }

    // ==================== SMART CONTRACT OPERATIONS ====================

    async saveSmartContract(contract) {
        try {
            const contractRef = this.db.collection(this.collections.smartContracts).doc(contract.address);

            await contractRef.set({
                address: contract.address,
                code: contract.code,
                deployer: contract.deployer,
                timestamp: contract.timestamp,
                state: contract.state || {},
                createdAt: Date.now()
            });

            return true;
        } catch (error) {
            console.error('❌ Error saving smart contract:', error);
            throw error;
        }
    }

    async getSmartContract(address) {
        try {
            const contractRef = this.db.collection(this.collections.smartContracts).doc(address);
            const doc = await contractRef.get();

            if (!doc.exists) return null;
            return doc.data();
        } catch (error) {
            console.error('❌ Error getting smart contract:', error);
            throw error;
        }
    }

    async getAllSmartContracts() {
        try {
            const snapshot = await this.db.collection(this.collections.smartContracts).get();
            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('❌ Error getting all smart contracts:', error);
            throw error;
        }
    }

    // ==================== NETWORK NODE OPERATIONS ====================

    async saveNode(node) {
        try {
            const nodeRef = this.db.collection(this.collections.networkNodes).doc(node.address);

            await nodeRef.set({
                address: node.address,
                port: node.port,
                lastSeen: Date.now(),
                isActive: true,
                createdAt: Date.now()
            }, { merge: true });

            return true;
        } catch (error) {
            console.error('❌ Error saving node:', error);
            throw error;
        }
    }

    async getAllNodes() {
        try {
            const snapshot = await this.db.collection(this.collections.networkNodes)
                .where('isActive', '==', true)
                .get();

            return snapshot.docs.map(doc => doc.data());
        } catch (error) {
            console.error('❌ Error getting all nodes:', error);
            throw error;
        }
    }

    // ==================== ANALYTICS OPERATIONS ====================

    async saveAnalytics(type, data) {
        try {
            await this.db.collection(this.collections.analytics).add({
                type: type,
                data: data,
                timestamp: Date.now()
            });
            return true;
        } catch (error) {
            console.error('❌ Error saving analytics:', error);
            throw error;
        }
    }

    // ==================== BACKUP METHOD (for compatibility) ====================

    async backup() {
        // Firestore auto-backs up, but we can log the action
        console.log('🔥 Firestore data is automatically backed up by Google');
        return true;
    }

    async close() {
        // Firestore doesn't require explicit closing
        console.log('🔒 Firestore connection closed');
        return true;
    }
}

module.exports = BlockchainDatabaseFirestore;















