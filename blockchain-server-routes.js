/**
 * Blockchain API Routes
 * Loaded after blockchain initialization
 */

module.exports = function (app, blockchainGetter, isReady) {
    // Helper to get blockchain instance safely
    const getBlockchain = () => {
        return typeof blockchainGetter === 'function' ? blockchainGetter() : blockchainGetter;
    };

    // ==================== WALLET ENDPOINTS ====================

    // Create new wallet
    app.post('/api/wallet/create', async (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain || !blockchain.walletManager) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            const { password } = req.body;

            const wallet = await blockchain.walletManager.createWallet(password);

            res.json({
                success: true,
                wallet: {
                    address: wallet.address,
                    publicKey: wallet.publicKey,
                    message: 'Wallet created successfully. Save your private key securely!'
                }
            });
        } catch (error) {
            console.error('Create wallet error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Load wallet
    app.post('/api/wallet/load', async (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain || !blockchain.walletManager) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            const { address, password } = req.body;

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Address is required'
                });
            }

            const wallet = await blockchain.walletManager.loadWallet(address, password);

            if (!wallet) {
                return res.status(404).json({
                    success: false,
                    error: 'Wallet not found or invalid password'
                });
            }

            res.json({
                success: true,
                wallet: {
                    address: wallet.address,
                    publicKey: wallet.publicKey
                }
            });
        } catch (error) {
            console.error('Load wallet error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ==================== TRANSACTION ENDPOINTS ====================

    // Create transaction (with signature - client-side signing)
    app.post('/api/transaction', async (req, res) => {
        const startTime = Date.now();
        console.log('📥 Received transaction request at:', new Date().toISOString());

        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain) {
                console.error('❌ Blockchain not ready');
                return res.status(503).json({
                    success: false,
                    reason: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            console.log('📥 Parsing request body...');
            const { from, to, amount, signature, data, timestamp } = req.body;
            console.log('📥 Request data:', {
                from: from ? from.substring(0, 10) + '...' : 'missing',
                to: to ? to.substring(0, 10) + '...' : 'missing',
                amount: amount,
                hasSignature: !!signature,
                hasPublicKey: !!signature?.publicKey,
                timestamp: timestamp
            });

            // Validate required fields
            if (!from || !to || amount === undefined || amount === null) {
                console.error('❌ Missing required fields');
                return res.status(400).json({
                    success: false,
                    reason: 'Missing required fields: from, to, amount'
                });
            }

            if (!signature) {
                console.error('❌ Missing signature');
                return res.status(400).json({
                    success: false,
                    reason: 'Transaction signature is required. All transactions must be cryptographically signed.'
                });
            }

            if (!signature.publicKey) {
                console.error('❌ Missing publicKey in signature');
                return res.status(400).json({
                    success: false,
                    reason: 'Signature must include publicKey for verification'
                });
            }

            // Validate amount
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                console.error('❌ Invalid amount:', amount);
                return res.status(400).json({
                    success: false,
                    reason: 'Valid positive amount is required'
                });
            }

            console.log('📥 Calling blockchain.createTransaction...');
            // Create transaction with signature
            const result = await blockchain.createTransaction(
                from,
                to,
                amountNum,
                data || {},
                signature,
                timestamp || Date.now()
            );

            const processingTime = Date.now() - startTime;
            console.log(`📥 Transaction processing took ${processingTime}ms`);

            if (result.success) {
                console.log('✅ Transaction created successfully:', {
                    from,
                    to,
                    amount: amountNum,
                    transactionId: result.transaction?.id || 'N/A',
                    processingTime: `${processingTime}ms`
                });

                res.json({
                    success: true,
                    transaction: result.transaction,
                    message: 'Transaction created and added to pending pool'
                });
            } else {
                console.error('❌ Transaction creation failed:', result.reason);
                res.status(400).json(result);
            }
        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error('❌ Transaction endpoint error:', error);
            console.error('❌ Error stack:', error.stack);
            console.error(`❌ Error occurred after ${processingTime}ms`);
            res.status(500).json({
                success: false,
                reason: error.message || 'Internal server error'
            });
        }
    });

    // ==================== BALANCE ENDPOINTS ====================

    // Get balance
    app.get('/api/balance/:address', async (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            const { address } = req.params;

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Address is required'
                });
            }

            const balance = await blockchain.getBalance(address);

            res.json({
                success: true,
                address: address,
                balance: balance
            });
        } catch (error) {
            console.error('Get balance error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ==================== MINING ENDPOINTS ====================

    // Mine block
    app.post('/api/mine', async (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            const { minerAddress } = req.body;

            if (!minerAddress) {
                return res.status(400).json({
                    success: false,
                    error: 'Miner address is required'
                });
            }

            const block = await blockchain.minePendingTransactions(minerAddress);

            if (block) {
                // Find mining reward transaction to get reward amount
                const rewardTx = block.transactions.find(tx =>
                    tx.data && tx.data.type === 'mining_reward' && tx.to === minerAddress
                );
                const reward = rewardTx ? rewardTx.amount : blockchain.miningReward;

                console.log('✅ Block mined successfully:', {
                    index: block.index,
                    transactions: block.transactions.length,
                    miner: minerAddress,
                    reward: reward
                });

                res.json({
                    success: true,
                    block: block,
                    reward: reward,
                    message: 'Block mined successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    error: 'Failed to mine block'
                });
            }
        } catch (error) {
            console.error('Mine block error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // ==================== BLOCKCHAIN ENDPOINTS ====================

    // Get blockchain info
    app.get('/api/blockchain', (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            res.json({
                success: true,
                chain: blockchain.chain,
                chainLength: blockchain.chain.length,
                pendingTransactions: blockchain.pendingTransactions,
                pendingTransactionsCount: blockchain.pendingTransactions.length,
                difficulty: blockchain.difficulty,
                miningReward: blockchain.miningReward,
                lastBlock: blockchain.chain[blockchain.chain.length - 1] || null
            });
        } catch (error) {
            console.error('Get blockchain error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get pending transactions
    app.get('/api/transactions/pending', (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            res.json({
                success: true,
                transactions: blockchain.pendingTransactions,
                count: blockchain.pendingTransactions.length
            });
        } catch (error) {
            console.error('Get pending transactions error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get transactions for address
    app.get('/api/transactions/:address', async (req, res) => {
        try {
            const blockchain = getBlockchain();
            if (!isReady() || !blockchain) {
                return res.status(503).json({
                    success: false,
                    error: 'Blockchain is still initializing. Please try again in a few seconds.'
                });
            }

            const { address } = req.params;

            const transactions = [];
            for (const block of blockchain.chain) {
                for (const tx of block.transactions) {
                    if (tx.from === address || tx.to === address) {
                        transactions.push(tx);
                    }
                }
            }

            res.json({
                success: true,
                address: address,
                transactions: transactions,
                count: transactions.length
            });
        } catch (error) {
            console.error('Get transactions error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Error handling
    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    });
};



